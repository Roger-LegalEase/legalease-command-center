// Campaign command — Milestone 2: campaigns controllable from the UI, no terminal needed.
//
// Pure state-in/state-out functions over the EXISTING reactivation campaign engine
// (reactivation-os.mjs stays authoritative — this module never re-implements release,
// enrollment, sending, thresholds, or suppression; it composes them and adds the plain-English
// operating surface plus the Queue/Approval/Event trail).
//
// The action model (same contract as intake):
//   PREVIEW  — pure, never writes. Shows exactly who/when/which touch/which wave/volume/risk.
//   PROPOSE  — writes a REQUESTED Approval + a needs-Roger Queue item + an Event. No release.
//   EXECUTE  — performs the release/resume ONLY when a matching APPROVED Approval exists,
//              re-checking safety (thresholds, pause state, already-released, schedule date).
//              A refused execute is recorded as a blocked-attempt Event.
//   PAUSE    — the one immediate action (it reduces risk). Audited with an executed Approval.
//
// HARD RULES: nothing here sends an email, enrolls a held or suppressed contact, flips
// REACTIVATION_LIVE_SEND / OUTREACH_LIVE_SEND, or changes an autopilot toggle. Releasing a wave
// arms it; sending stays off until Roger turns sending on elsewhere, on purpose.

import {
  reactivationCampaignOf, reactivationLiveSendEnabled, evaluateThresholds, waveMetrics,
  campaignRates, releaseWave, contactOnHold, planReactivation, REACTIVATION_ENGINE_ID
} from "./reactivation-os.mjs";
import { isSuppressed } from "./outreach-os.mjs";
import {
  REACTIVATION_SEQUENCE_IDS, REACTIVATION_CADENCE_DAYS, sequenceIdForContact, getReactivationTouch
} from "./reactivation-sequences.mjs";
import { sendgridWebhookHealthSummary } from "./sendgrid-webhook.mjs";
import { autopilotEnabled } from "./heartbeat.mjs";
import {
  createQueueItem, upsertQueueItems, createApproval, upsertApprovals,
  emitCompanyEvent, QUEUE_TERMINAL_STATUSES
} from "./company-memory.mjs";

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);
const people = (n) => `${Number(n || 0).toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
const listJoin = (arr) => {
  const a = list(arr).map(String);
  return a.length <= 1 ? (a[0] ?? "") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
};

// Calendar date (YYYY-MM-DD) in Eastern time — the app's operating timezone. Planned release
// dates compare against this, not UTC, so "planned for July 10" means July 10 in ET.
function etDateOf(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
}

// Threshold reasons come from the engine as machine tokens ("hard_bounce 2.30% >= 2.00%").
// Translate them before they reach any operator-facing surface.
export function plainSafetyReasons(reasons = []) {
  return list(reasons).map((r) => String(r)
    .replace(/hard_bounce/g, "hard bounces at")
    .replace(/spam_complaint/g, "spam complaints at")
    .replace(/unsubscribe(?!s)/g, "unsubscribes at")
    .replace(/>=/g, ", the limit is")).join("; ");
}

export const CAMPAIGN_COMMAND_SOURCE = "campaign-command";
export const RELEASE_ACTION_TYPE = "release_wave";
export const RESUME_ACTION_TYPE = "resume_campaign";
export const CAMPAIGN_COMMAND_WARNING =
  "Nothing on this page sends email or changes a sending switch. Releasing a wave only lines people up; sending stays off until you turn it on, on purpose, somewhere else.";

// ---------------------------------------------------------------------------------------------
// Shared campaign facts (gates, waves, thresholds, telemetry) — read-only.
// ---------------------------------------------------------------------------------------------

function contactBlockedReason(contact, state) {
  if (contactOnHold(contact)) return "held";
  if (contact.suppressed_at_import || isSuppressed(contact, { state }).suppressed) return "suppressed";
  if (contact.unsubscribed || contact.bounced || contact.complained || contact.do_not_contact) return "suppressed";
  return "";
}

function waveBreakdown(state, config) {
  const byWave = new Map();
  for (const spec of config.waves) {
    byWave.set(Number(spec.wave), {
      wave: Number(spec.wave),
      plannedSize: spec.plannedSize,
      released: config.releasedWaves.map(Number).includes(Number(spec.wave)),
      assigned: 0, enrolled: 0, held: 0, suppressed: 0, eligibleOnRelease: 0
    });
  }
  let unassigned = 0;
  for (const c of list(state.reactivationContacts)) {
    const w = byWave.get(Number(c.wave));
    if (!w) { unassigned++; continue; }
    w.assigned++;
    const blocked = contactBlockedReason(c, state);
    if (c.enrolled_at) w.enrolled++;
    else if (blocked === "held") w.held++;
    else if (blocked === "suppressed") w.suppressed++;
    else w.eligibleOnRelease++;
  }
  return { waves: [...byWave.values()], unassigned };
}

function gateFacts(state, env) {
  const liveSend = reactivationLiveSendEnabled(env);
  const autopilot = autopilotEnabled(state, REACTIVATION_ENGINE_ID, env);
  const sendgridKey = Boolean(clean((env || {}).SENDGRID_API_KEY));
  const sendingOn = liveSend && autopilot && sendgridKey;
  return {
    liveSend, autopilot, sendgridKey, sendingOn,
    plain: sendingOn
      ? "Sending is ON. Released people receive emails inside the weekday window."
      : "Sending is OFF. Nothing goes out to anyone, even for released waves."
  };
}

function sendWindowPlain(caps) {
  return `weekdays ${caps.windowStartHourET}am–${caps.windowEndHourET - 12}pm Eastern, at most ${caps.perTickMax} emails per hour and ${caps.perWaveDayCap} per day`;
}

function thresholdFacts(state, config) {
  const evaluated = evaluateThresholds(state, config);
  const t = config.thresholds;
  const pct = (v, digits = 1) => `${(v * 100).toFixed(digits)}%`;
  return {
    ...evaluated,
    // Limit values as numbers so the UI can draw honest "how close to auto-pause" meters
    // instead of restating them from copy. Display-only; evaluation stays server-side.
    limits: { ...t },
    minSampleSize: config.minSampleSize,
    plain: evaluated.tripped
      ? `A safety limit tripped: ${plainSafetyReasons(evaluated.reasons)}. The campaign pauses itself and nothing more sends until you decide.`
      : evaluated.belowSample
        ? `Safety limits arm after ${config.minSampleSize} sends (so far: ${evaluated.rates.sent}). They auto-pause the campaign at ${pct(t.hard_bounce)} hard bounces, ${pct(t.spam_complaint, 2)} spam complaints, or ${pct(t.unsubscribe)} unsubscribes.`
        : `Within safety limits. Auto-pause trips at ${pct(t.hard_bounce)} hard bounces, ${pct(t.spam_complaint, 2)} spam complaints, or ${pct(t.unsubscribe)} unsubscribes.`
  };
}

function telemetryFacts(state, env) {
  const rates = campaignRates(state);
  const summary = sendgridWebhookHealthSummary(state.sendgridWebhookHealth, { env, sent: rates.sent });
  return {
    ...summary,
    trusted: !summary.warning,
    plain: summary.warning
      ? summary.warning
      : rates.sent === 0
        ? "No sends yet, so there is no delivery feedback to show. That is expected."
        : `Delivery feedback is flowing (${summary.totalEvents} signals recorded${summary.signatureVerification === "enforced" ? ", sender identity verified" : ""}).`
  };
}

function campaignStatusPlain(config, gates) {
  if (lower(config.status) === "paused") {
    return `Paused${config.pausedReason ? `: ${config.pausedReason}` : ""}. Nothing sends while paused.`;
  }
  if (!config.releasedWaves.length) return "Staged: no waves released, nobody enrolled, nothing sending.";
  const waves = listJoin(config.releasedWaves);
  return gates.sendingOn
    ? `Running: wave ${waves} released and sending inside the daily window.`
    : `Armed but quiet: wave ${waves} released, sending is off, so no email goes out.`;
}

// ---------------------------------------------------------------------------------------------
// 1. OVERVIEW — the plain-English campaign command view. Read-only.
// ---------------------------------------------------------------------------------------------

export function buildCampaignCommandView(state = {}, { env = process.env, now = new Date() } = {}) {
  const config = reactivationCampaignOf(state);
  const gates = gateFacts(state, env);
  const { waves, unassigned } = waveBreakdown(state, config);
  const thresholds = thresholdFacts(state, config);
  const telemetry = telemetryFacts(state, env);
  const metrics = waveMetrics(state);
  const rates = campaignRates(state);
  // What would happen on the next automatic pass if sending were on (pure dry look).
  const plan = planReactivation(state, { env, now });
  const dueObservation = plan.observations.find((o) => o.type === "due_sends");

  const sequences = REACTIVATION_SEQUENCE_IDS.map((id) => ({
    id,
    plain: id === "reactivation_logged_in"
      ? "People who logged in before: 5 emails over 30 days"
      : "People who never logged in: 5 emails over 30 days",
    schedule: `Days ${REACTIVATION_CADENCE_DAYS.join(", ")} after release`
  }));

  const held = list(state.reactivationContacts).filter((c) => contactOnHold(c)).length;
  const totals = {
    contacts: list(state.reactivationContacts).length,
    enrolled: list(state.reactivationContacts).filter((c) => Boolean(c.enrolled_at)).length,
    held,
    unassigned
  };

  const nextWave = waves.find((w) => !w.released && w.eligibleOnRelease > 0);
  return {
    ok: true,
    campaignId: config.campaignId,
    status: config.status,
    pausedReason: config.pausedReason,
    releasedWaves: config.releasedWaves,
    statusPlain: campaignStatusPlain(config, gates),
    gates,
    sendWindowPlain: sendWindowPlain(config.caps),
    waves: waves.map((w) => ({
      ...w,
      metrics: metrics[w.wave] || null,
      plain: w.released
        ? `Wave ${w.wave}: released. ${people(w.enrolled)} enrolled, ${metrics[w.wave]?.sent || 0} emails sent so far.`
        : `Wave ${w.wave}: not released. ${people(w.eligibleOnRelease)} would be lined up (${w.held} held, ${w.suppressed} blocked).`
    })),
    totals,
    sequences,
    thresholds,
    telemetry,
    rates,
    dueNow: dueObservation ? dueObservation.due : 0,
    dueNowPlain: (() => {
      const n = dueObservation ? dueObservation.due : 0;
      return gates.sendingOn
        ? `${people(n)} ${n === 1 ? "is" : "are"} due an email in the current window.`
        : `If sending were turned on right now, ${people(n)} would be due an email. It is off, so nobody gets one.`;
    })(),
    nextRecommendedAction: lower(config.status) === "paused"
      ? "The campaign is paused. Review the safety numbers, then propose a resume if you want it back on."
      : thresholds.tripped
        ? "A safety limit tripped. Review bounces and complaints before anything else."
        : nextWave
          ? `Wave ${nextWave.wave} is ready to preview (${people(nextWave.eligibleOnRelease)} eligible). Releasing it does not send while sending is off.`
          : "No action needed. Everything releasable is released or empty.",
    warning: CAMPAIGN_COMMAND_WARNING
  };
}

// ---------------------------------------------------------------------------------------------
// 2. WAVE RELEASE — preview (pure) → propose (approval requested) → execute (approved only).
// ---------------------------------------------------------------------------------------------

export function previewWaveRelease(state = {}, waveNumber, { env = process.env, now = new Date() } = {}) {
  const config = reactivationCampaignOf(state);
  const wave = Number(waveNumber);
  const spec = config.waves.find((w) => Number(w.wave) === wave);
  if (!spec) throw new Error(`There is no wave ${waveNumber} in this campaign. Waves: ${config.waves.map((w) => w.wave).join(", ")}.`);
  const gates = gateFacts(state, env);
  const { waves } = waveBreakdown(state, config);
  const facts = waves.find((w) => w.wave === wave);
  const thresholds = thresholdFacts(state, config);
  const telemetry = telemetryFacts(state, env);
  const alreadyReleased = config.releasedWaves.map(Number).includes(wave);

  // Sends per weekday given the caps (hourly ticks inside the window).
  const windowTicks = Math.max(1, config.caps.windowEndHourET - config.caps.windowStartHourET);
  const perDay = Math.min(config.caps.perTickMax * windowTicks, config.caps.perWaveDayCap);
  const sendingDays = facts.eligibleOnRelease > 0 ? Math.ceil(facts.eligibleOnRelease / perDay) : 0;

  const who = `${people(facts.eligibleOnRelease)} would be lined up for wave ${wave}. Not included: ${facts.held} held for review, ${facts.suppressed} blocked (unsubscribed, bounced, complained, or do-not-contact), ${facts.enrolled} already in the campaign.`;
  const which = `They start with email 1 of 5, then days ${config.cadenceDays.join(", ")} after release, but only while sending is on.`;
  const when = gates.sendingOn
    ? `Sending is ON, so emails would start in the next window (${sendWindowPlain(config.caps)}) and this wave would take about ${sendingDays} sending day${sendingDays === 1 ? "" : "s"}.`
    : `Sending is OFF. Releasing arms the wave and starts the schedule clock, but no email goes to anyone until sending is turned on, on purpose, elsewhere.`;
  const releasedCaution = config.releasedWaves.length
    ? `Heads up: wave ${listJoin(config.releasedWaves)} ${config.releasedWaves.length === 1 ? "is" : "are"} already released. When sending turns on, their next follow-up emails go out too, not just this wave.`
    : "";

  return {
    ok: true,
    wave,
    alreadyReleased,
    eligible: facts.eligibleOnRelease,
    held: facts.held,
    blocked: facts.suppressed,
    alreadyEnrolled: facts.enrolled,
    estimatedSendingDays: sendingDays,
    perDayCap: perDay,
    gates,
    thresholds,
    telemetry,
    riskLevel: gates.sendingOn ? "dangerous" : "caution",
    headline: alreadyReleased
      ? `Wave ${wave} is already released. Nothing to do.`
      : `Release preview for wave ${wave}: ${people(facts.eligibleOnRelease)} eligible. Nothing is released or sent by previewing.`,
    lines: [who, which, when, thresholds.plain, telemetry.plain, releasedCaution].filter(Boolean),
    whatApprovalDoes: `Approving lines up ${people(facts.eligibleOnRelease)} for wave ${wave} and starts their schedule clock.`,
    whatApprovalDoesNot: "It does not turn sending on, change any safety switch, release other waves, or email anyone while sending is off.",
    warning: CAMPAIGN_COMMAND_WARNING,
    writesState: false
  };
}

// Propose a wave release (optionally for a planned ET date, YYYY-MM-DD). Writes the requested
// Approval, the needs-Roger Queue item, and an Event — never releases.
//
// One pending proposal per wave: re-proposing while the earlier one is still waiting UPDATES it
// (same approval, new date); once it is approved, re-proposing is refused (so a planned date can
// never be silently cleared out from under an approved release); once dismissed or completed, a
// FRESH proposal is created (a dismissed proposal is not a dead-end).
export function proposeWaveRelease(state = {}, waveNumber, { scheduledFor = "", actor = "owner", env = process.env, now = new Date() } = {}) {
  const nowIso = typeof now === "string" ? now : now.toISOString();
  const nowFn = () => nowIso;
  const preview = previewWaveRelease(state, waveNumber, { env, now: new Date(nowIso) });
  if (preview.alreadyReleased) {
    return { ok: false, error: `Wave ${preview.wave} is already released. There is nothing to propose.`, state };
  }
  if (preview.eligible === 0) {
    return { ok: false, error: `No one in wave ${preview.wave} is eligible right now (${preview.held} held, ${preview.blocked} blocked). There is nothing to release.`, state };
  }
  const schedule = clean(scheduledFor);
  if (schedule && !/^\d{4}-\d{2}-\d{2}$/.test(schedule)) {
    return { ok: false, error: "The planned date must look like 2026-07-10 (year-month-day).", state };
  }

  // Existing proposals for this wave.
  const waveItems = list(state.queueItems).filter((q) =>
    q.sourceEngine === CAMPAIGN_COMMAND_SOURCE && Number(q.metadata?.wave) === preview.wave);
  const active = waveItems.find((q) => !QUEUE_TERMINAL_STATUSES.includes(q.status));
  if (active) {
    const linked = list(state.approvals).find((a) => a.id === active.approvalId);
    if (linked && ["approved", "executed"].includes(linked.state)) {
      return {
        ok: false,
        error: linked.state === "approved"
          ? `Wave ${preview.wave} already has an approved release waiting to run${active.metadata?.scheduledFor ? ` (planned for ${active.metadata.scheduledFor})` : ""}. Run it or dismiss it; its plan cannot be changed by proposing again.`
          : `Wave ${preview.wave} already ran.`,
        state,
        approvalId: linked.id,
        queueItemId: active.id
      };
    }
  }
  // A dismissed/completed earlier proposal must not block a fresh one — give the new item its
  // own identity (generation suffix feeds the id hash).
  const generation = waveItems.filter((q) => QUEUE_TERMINAL_STATUSES.includes(q.status)).length;
  const refId = generation && !active ? `release-wave-${preview.wave}-r${generation + 1}` : `release-wave-${preview.wave}`;

  const scheduleLine = schedule ? ` Planned for ${schedule} (Eastern).` : "";
  const item = createQueueItem({
    type: "campaign",
    sourceEngine: CAMPAIGN_COMMAND_SOURCE,
    sourceRef: { collection: "reactivationCampaign", itemId: refId },
    title: `Approve wave ${preview.wave} release for ${people(preview.eligible)}`,
    summary: `${preview.whatApprovalDoes}${scheduleLine} ${preview.gates.sendingOn ? "Sending is ON, so emails would begin in the next window." : "Sending is off, so nobody gets an email until you turn sending on."}`,
    recommendation: `${preview.whatApprovalDoesNot}`,
    requiresApproval: true,
    riskLevel: preview.riskLevel,
    priority: 15,
    dueAt: schedule ? `${schedule}T00:00:00.000Z` : "",
    sourceLink: { kind: "page", target: "#campaigns" },
    metadata: { wave: preview.wave, scheduledFor: schedule, eligible: preview.eligible, proposedBy: actor, proposedAt: nowIso }
  }, { now: nowFn });
  // Reuse the still-pending approval when updating an active proposal, so the Queue's approve
  // button and our run button always point at the same record.
  const existingApprovalId = active ? clean(active.approvalId) : "";
  const approval = createApproval({
    id: existingApprovalId,
    actionType: RELEASE_ACTION_TYPE,
    queueItemId: active ? active.id : item.id,
    preview: `Release wave ${preview.wave}: ${people(preview.eligible)} lined up.${scheduleLine} ${preview.whatApprovalDoesNot}`,
    riskLevel: preview.riskLevel,
    state: "requested",
    requested_at: nowIso
  }, { now: nowFn });
  const queueItemId = active ? active.id : item.id;
  let nextState = {
    ...state,
    approvals: upsertApprovals(state.approvals, [approval], { now: nowFn }),
    queueItems: upsertQueueItems(state.queueItems, [{ ...item, id: queueItemId, approvalId: approval.id }], { now: nowFn })
  };
  // The metadata merge keeps old keys; force the schedule to THIS proposal's value (or none).
  nextState = {
    ...nextState,
    queueItems: list(nextState.queueItems).map((q) =>
      q.id === queueItemId ? { ...q, metadata: { ...q.metadata, scheduledFor: schedule } } : q)
  };
  nextState = emitCompanyEvent(nextState, {
    source: CAMPAIGN_COMMAND_SOURCE,
    type: "campaign_release_proposed",
    occurred_at: nowIso,
    summary: `Wave ${preview.wave} release proposed (${people(preview.eligible)}${schedule ? `, planned for ${schedule} Eastern` : ""}). Waiting for approval; nothing released.`,
    risk: "watch"
  }, { now: nowFn });
  return { ok: true, state: nextState, approvalId: approval.id, queueItemId, preview };
}

// Execute a wave release — ONLY with a matching APPROVED approval, and only after re-checking
// safety. A refusal is recorded as a blocked-attempt Event on the returned state.
export function executeApprovedWaveRelease(state = {}, { approvalId = "", actor = "owner", env = process.env, now = new Date() } = {}) {
  const nowIso = typeof now === "string" ? now : now.toISOString();
  const nowFn = () => nowIso;
  const blocked = (reason) => ({
    ok: false,
    error: reason,
    state: emitCompanyEvent(state, {
      source: CAMPAIGN_COMMAND_SOURCE,
      type: "campaign_release_blocked",
      occurred_at: nowIso,
      summary: `A wave release was stopped: ${reason}`,
      risk: "watch"
    }, { now: nowFn })
  });

  const approval = list(state.approvals).find((a) => a.id === clean(approvalId));
  if (!approval) return blocked("No matching approval was found. Propose the release and approve it first.");
  if (approval.action_type !== RELEASE_ACTION_TYPE) return blocked("That approval is for a different kind of action.");
  if (approval.state === "executed") return blocked("That release already ran. Nothing was done twice.");
  if (approval.state !== "approved") return blocked(`The release is not approved yet (currently: ${approval.state}). Approve it on the Queue first.`);

  const item = list(state.queueItems).find((q) => q.id === approval.queue_item_id);
  const wave = Number(item?.metadata?.wave);
  if (!item || !Number.isFinite(wave)) return blocked("The approval is missing its wave details. Propose the release again.");
  const schedule = clean(item.metadata?.scheduledFor);
  if (schedule && etDateOf(nowIso) < schedule) return blocked(`This release is planned for ${schedule} (Eastern). It is not that day yet.`);

  const config = reactivationCampaignOf(state);
  if (config.releasedWaves.map(Number).includes(wave)) return blocked(`Wave ${wave} is already released.`);
  if (lower(config.status) === "paused") return blocked(`The campaign is paused${config.pausedReason ? ` (${config.pausedReason})` : ""}. Resume it before releasing more people.`);
  const thresholds = evaluateThresholds(state, config);
  if (thresholds.tripped) return blocked(`A safety limit tripped: ${plainSafetyReasons(thresholds.reasons)}. Review before releasing more people.`);

  // The actual release — the existing engine does the work; held/suppressed people stay out.
  const released = releaseWave(state, wave, { now: nowIso });
  const gates = gateFacts(state, env);
  let nextState = released.state;
  nextState = {
    ...nextState,
    approvals: upsertApprovals(nextState.approvals, [{
      ...approval,
      state: "executed",
      executed_at: nowIso,
      execution_result: `Wave ${wave} released: ${people(released.enrolled)} lined up. ${gates.sendingOn ? "Sending is on." : "Sending remains off. No email went out."}`
    }], { now: nowFn })
  };
  const transitioned = list(nextState.queueItems).map((q) =>
    q.id === item.id ? { ...q, status: "completed", decidedBy: actor, decidedAt: nowIso, updatedAt: nowIso } : q);
  nextState = { ...nextState, queueItems: transitioned };
  nextState = emitCompanyEvent(nextState, {
    source: CAMPAIGN_COMMAND_SOURCE,
    type: "campaign_wave_released",
    occurred_at: nowIso,
    summary: `Wave ${wave} released by ${actor}: ${people(released.enrolled)} lined up. ${gates.sendingOn ? "Sending is on. Emails begin in the next window." : "Sending is off. Nobody was emailed."}`,
    risk: gates.sendingOn ? "needs_roger" : "info"
  }, { now: nowFn });

  return {
    ok: true,
    state: nextState,
    wave,
    enrolled: released.enrolled,
    headline: `Wave ${wave} released: ${people(released.enrolled)} lined up. ${gates.sendingOn ? "Emails begin in the next sending window." : "Sending is off. No one was emailed."}`,
    verified: {
      ok: reactivationCampaignOf(nextState).releasedWaves.map(Number).includes(wave),
      checks: [
        { ok: reactivationCampaignOf(nextState).releasedWaves.map(Number).includes(wave), note: `Wave ${wave} is now marked released.` },
        { ok: list(nextState.reactivationContacts).filter((c) => Number(c.wave) === wave && contactOnHold(c) && c.enrolled_at).length === 0, note: "No held person was enrolled." }
      ]
    },
    warning: CAMPAIGN_COMMAND_WARNING
  };
}

// ---------------------------------------------------------------------------------------------
// 3. PAUSE (immediate, audited) and RESUME (propose → approve → execute).
// ---------------------------------------------------------------------------------------------

export function pauseCampaign(state = {}, { reason = "", actor = "owner", now = new Date() } = {}) {
  const nowIso = typeof now === "string" ? now : now.toISOString();
  const nowFn = () => nowIso;
  const config = reactivationCampaignOf(state);
  if (lower(config.status) === "paused") {
    return { ok: false, error: "The campaign is already paused.", state };
  }
  const pausedReason = clean(reason) || `Paused by ${actor}`;
  let nextState = {
    ...state,
    reactivationCampaign: { ...(state.reactivationCampaign || {}), status: "paused", pausedReason, paused_at: nowIso }
  };
  const audit = createApproval({
    actionType: "pause_campaign",
    preview: `Pause the reactivation campaign: ${pausedReason}`,
    riskLevel: "safe",
    state: "executed",
    approvedBy: actor,
    approvedAt: nowIso,
    executed_at: nowIso,
    execution_result: "Campaign paused. Nothing sends while paused."
  }, { now: nowFn });
  nextState = { ...nextState, approvals: upsertApprovals(nextState.approvals, [audit], { now: nowFn }) };
  nextState = emitCompanyEvent(nextState, {
    source: CAMPAIGN_COMMAND_SOURCE,
    type: "campaign_paused",
    occurred_at: nowIso,
    summary: `Reactivation campaign paused by ${actor}: ${pausedReason}. Nothing sends while paused.`,
    risk: "watch"
  }, { now: nowFn });
  return { ok: true, state: nextState, headline: "Campaign paused. Nothing sends while paused.", warning: CAMPAIGN_COMMAND_WARNING };
}

export function proposeCampaignResume(state = {}, { actor = "owner", env = process.env, now = new Date() } = {}) {
  const nowIso = typeof now === "string" ? now : now.toISOString();
  const nowFn = () => nowIso;
  const config = reactivationCampaignOf(state);
  if (lower(config.status) !== "paused") {
    return { ok: false, error: "The campaign is not paused, so there is nothing to resume.", state };
  }
  const gates = gateFacts(state, env);
  const thresholds = thresholdFacts(state, config);
  const caution = config.releasedWaves.length
    ? ` Wave ${listJoin(config.releasedWaves)} ${config.releasedWaves.length === 1 ? "is" : "are"} already released. With sending on, their next follow-up emails resume too.`
    : "";
  const item = createQueueItem({
    type: "campaign",
    sourceEngine: CAMPAIGN_COMMAND_SOURCE,
    sourceRef: { collection: "reactivationCampaign", itemId: "resume-campaign" },
    title: "Approve resuming the reactivation campaign",
    summary: `It paused because: ${config.pausedReason || "operator pause"}. ${thresholds.plain}${caution}`,
    recommendation: gates.sendingOn
      ? "Sending is ON. Approving means emails resume in the next window."
      : "Sending is off. Approving un-pauses the campaign but nobody gets an email until sending is turned on.",
    requiresApproval: true,
    riskLevel: gates.sendingOn ? "dangerous" : "caution",
    priority: 10,
    sourceLink: { kind: "page", target: "#campaigns" },
    metadata: { proposedBy: actor, proposedAt: nowIso, pausedReason: config.pausedReason }
  }, { now: nowFn });
  const approval = createApproval({
    actionType: RESUME_ACTION_TYPE,
    queueItemId: item.id,
    preview: `Resume the reactivation campaign (paused: ${config.pausedReason || "operator pause"}).${caution} Resuming does not turn sending on.`,
    riskLevel: gates.sendingOn ? "dangerous" : "caution",
    state: "requested",
    requested_at: nowIso
  }, { now: nowFn });
  let nextState = {
    ...state,
    approvals: upsertApprovals(state.approvals, [approval], { now: nowFn }),
    queueItems: upsertQueueItems(state.queueItems, [{ ...item, approvalId: approval.id }], { now: nowFn })
  };
  nextState = emitCompanyEvent(nextState, {
    source: CAMPAIGN_COMMAND_SOURCE,
    type: "campaign_resume_proposed",
    occurred_at: nowIso,
    summary: "Resuming the reactivation campaign was proposed. Waiting for approval; still paused.",
    risk: "watch"
  }, { now: nowFn });
  return { ok: true, state: nextState, approvalId: approval.id, queueItemId: item.id };
}

export function executeApprovedResume(state = {}, { approvalId = "", actor = "owner", env = process.env, now = new Date() } = {}) {
  const nowIso = typeof now === "string" ? now : now.toISOString();
  const nowFn = () => nowIso;
  const blocked = (reason) => ({
    ok: false,
    error: reason,
    state: emitCompanyEvent(state, {
      source: CAMPAIGN_COMMAND_SOURCE,
      type: "campaign_resume_blocked",
      occurred_at: nowIso,
      summary: `A campaign resume was stopped: ${reason}`,
      risk: "watch"
    }, { now: nowFn })
  });
  const approval = list(state.approvals).find((a) => a.id === clean(approvalId));
  if (!approval) return blocked("No matching approval was found. Propose the resume and approve it first.");
  if (approval.action_type !== RESUME_ACTION_TYPE) return blocked("That approval is for a different kind of action.");
  if (approval.state === "executed") return blocked("That resume already ran.");
  if (approval.state !== "approved") return blocked(`The resume is not approved yet (currently: ${approval.state}).`);
  const config = reactivationCampaignOf(state);
  if (lower(config.status) !== "paused") return blocked("The campaign is not paused.");
  const thresholds = evaluateThresholds(state, config);
  if (thresholds.tripped) return blocked(`A safety limit is still tripped: ${plainSafetyReasons(thresholds.reasons)}. Fix the numbers before resuming.`);

  const gates = gateFacts(state, env);
  let nextState = {
    ...state,
    reactivationCampaign: { ...(state.reactivationCampaign || {}), status: "active", pausedReason: "", paused_at: "" }
  };
  nextState = {
    ...nextState,
    approvals: upsertApprovals(nextState.approvals, [{
      ...approval,
      state: "executed",
      executed_at: nowIso,
      execution_result: `Campaign resumed. ${gates.sendingOn ? "Sending is on." : "Sending remains off."}`
    }], { now: nowFn }),
    queueItems: list(nextState.queueItems).map((q) =>
      q.id === approval.queue_item_id ? { ...q, status: "completed", decidedBy: actor, decidedAt: nowIso, updatedAt: nowIso } : q)
  };
  nextState = emitCompanyEvent(nextState, {
    source: CAMPAIGN_COMMAND_SOURCE,
    type: "campaign_resumed",
    occurred_at: nowIso,
    summary: `Reactivation campaign resumed by ${actor}. ${gates.sendingOn ? "Sending is on. Emails resume in the next window." : "Sending is off. Nobody gets an email until it is turned on."}`,
    risk: gates.sendingOn ? "needs_roger" : "info"
  }, { now: nowFn });
  return {
    ok: true,
    state: nextState,
    headline: `Campaign resumed. ${gates.sendingOn ? "Emails resume in the next sending window." : "Sending is off. No one was emailed."}`,
    warning: CAMPAIGN_COMMAND_WARNING
  };
}
