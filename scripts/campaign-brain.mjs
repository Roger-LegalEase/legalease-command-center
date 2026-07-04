// Campaign brain (Phase 18E) — the honest one-page view of everything campaign-shaped:
// the B2 partner-outreach pipeline as read-only lanes, held-for-review contacts with a
// release-from-hold preview/confirm, and plain-English deliverability warnings.
//
// HARD RULES (same contract as campaign-command.mjs):
//   - Nothing in this module sends an email or can be made to. There is no network access,
//     no provider call, and no path that enrolls a contact or flips a sending switch.
//   - Releasing a held contact only clears the review hold and lines them up in the next
//     UNRELEASED wave. Enrolling that wave still requires the approval-gated wave release,
//     and actual sending sits behind three further switches that live elsewhere.
//   - Outreach lane items NEVER include message bodies: assembled messages carry live signed
//     unsubscribe links, and the unsubscribe endpoint is public and acts on GET. Lanes show
//     status facts only (who, subject, step, when).
//
// Wave-assignment note: we deliberately do NOT re-run the global applyWaveAssignment() here.
// It re-buckets every eligible contact, so adding released contacts would reshuffle people —
// including already-enrolled ones — across waves and corrupt per-wave attribution. Released
// contacts are appended to the next unreleased wave explicitly instead.

import {
  reactivationCampaignOf, evaluateThresholds, waveMetrics, contactOnHold
} from "./reactivation-os.mjs";
import { isSuppressed, outreachLiveSendEnabled, OUTREACH_QUEUE_TYPE, OUTREACH_ENGINE_ID } from "./outreach-os.mjs";
import { sendgridWebhookHealthSummary } from "./sendgrid-webhook.mjs";
import { plainSafetyReasons } from "./campaign-command.mjs";
import { autopilotEnabled } from "./heartbeat.mjs";

const clean = (v = "") => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
const nowIso = () => new Date().toISOString();
const people = (n) => `${Number(n || 0).toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
const pct = (v, digits = 1) => `${(Number(v || 0) * 100).toFixed(digits)}%`;

function maskEmail(email = "") {
  const [local = "", domain = ""] = clean(email).split("@");
  if (!domain) return local ? `${local[0]}***` : "";
  return `${local.slice(0, 1)}***@${domain}`;
}

export const CAMPAIGN_BRAIN_WARNING =
  "Nothing on this view sends email or changes a sending switch. Releasing a held contact only lines them up; enrolling still needs a wave approval, and sending stays off until you turn it on, on purpose, somewhere else.";

// ---------------------------------------------------------------------------------------------
// 1. B2 partner-outreach lane view — read-only.
// ---------------------------------------------------------------------------------------------

export const OUTREACH_LANES = [
  { key: "queued_for_approval", title: "Waiting for your approval" },
  { key: "approved", title: "Approved, held until the send engine turns on" },
  { key: "sent", title: "Sent" },
  { key: "rejected", title: "Stopped by safety checks" }
];

// One outreach queue item, stripped to status facts. The assembled message (html/text/
// unsubscribe link) is dropped on purpose — see the module header.
function safeOutreachItem(q) {
  return {
    id: clean(q.id),
    status: clean(q.status),
    title: clean(q.title),
    to: maskEmail(q.to),
    subject: clean(q.subject),
    classification: clean(q.classification),
    step: Number(q.step_number || 0),
    created_at: clean(q.created_at),
    approved_at: clean(q.approved_at),
    sent_at: clean(q.sent_at),
    reject_reason: clean(q.reject_reason)
  };
}

export function buildOutreachLaneView(state = {}, { env = process.env } = {}) {
  const items = list(state.approvalQueue).filter((q) => q && q.type === OUTREACH_QUEUE_TYPE);
  const lanes = OUTREACH_LANES.map(({ key, title }) => {
    const matching = items.filter((q) => clean(q.status) === key);
    return { key, title, count: matching.length, items: matching.slice(0, 20).map(safeOutreachItem) };
  });
  const attempts = list(state.outreachAttempts);
  const gates = {
    autopilot: autopilotEnabled(state, OUTREACH_ENGINE_ID, env),
    liveSend: outreachLiveSendEnabled(env),
    providerKeyPresent: Boolean(clean((env || {}).SENDGRID_API_KEY))
  };
  gates.sendingOn = gates.autopilot && gates.liveSend && gates.providerKeyPresent;
  const totals = {
    queued: lanes[0].count,
    approved: lanes[1].count,
    sent: lanes[2].count,
    rejected: lanes[3].count,
    sentAttempts: attempts.filter((a) => clean(a.status) === "sent").length,
    dryRunAttempts: attempts.filter((a) => clean(a.status) === "dry_run").length,
    suppressions: list(state.outreachSuppressions).length,
    campaigns: list(state.outreachCampaigns).length
  };
  return {
    ok: true,
    writesState: false,
    gates,
    lanes,
    totals,
    plain: gates.sendingOn
      ? "Partner outreach sending is ON. Approved messages go out inside the business-hours window."
      : totals.queued || totals.approved
        ? `Partner outreach is prepared but quiet: ${totals.queued} waiting for approval, ${totals.approved} approved and parked. The send engine is off, so nothing goes out.`
        : "Partner outreach is quiet: nothing queued, nothing approved, nothing sent. The send engine is off.",
    warning: CAMPAIGN_BRAIN_WARNING
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Held-for-review — preview (pure) and confirm (release from hold; never enrolls or sends).
// ---------------------------------------------------------------------------------------------

export const HELD_RELEASE_READY_STATUS = "approved_for_later";

function heldBlockReason(contact, state) {
  if (contact.enrolled_at) return "already enrolled";
  if (contact.do_not_contact || contact.suppressed_at_import || isSuppressed(contact, { state }).suppressed) return "suppressed";
  const status = clean(contact.review_status) || "held";
  if (status !== HELD_RELEASE_READY_STATUS) return `review status is "${status}", not "${HELD_RELEASE_READY_STATUS}"`;
  return "";
}

// Lowest-numbered wave that has not been released. Released contacts land here so they can
// never be swept into a wave whose enrollment already happened.
function nextUnreleasedWave(config) {
  const released = config.releasedWaves.map(Number);
  const open = config.waves.map((w) => Number(w.wave)).filter((w) => !released.includes(w)).sort((a, b) => a - b);
  return open.length ? open[0] : null;
}

function safeHeldRow(contact) {
  return {
    contact_id: clean(contact.contact_id),
    masked_email: maskEmail(contact.email),
    first_name: clean(contact.first_name),
    state: clean(contact.state),
    hold_reason: clean(contact.campaign_hold_reason),
    review_status: clean(contact.review_status) || "held",
    review_note: clean(contact.review_note),
    reviewed_at: clean(contact.reviewed_at)
  };
}

export function previewHeldRelease(state = {}) {
  const config = reactivationCampaignOf(state);
  const held = list(state.reactivationContacts).filter((c) => contactOnHold(c));
  const byReviewStatus = {};
  for (const c of held) {
    const status = clean(c.review_status) || "held";
    byReviewStatus[status] = (byReviewStatus[status] || 0) + 1;
  }
  const releasable = [];
  const blocked = [];
  for (const c of held) {
    const reason = heldBlockReason(c, state);
    if (reason) {
      if (clean(c.review_status) === HELD_RELEASE_READY_STATUS) blocked.push({ ...safeHeldRow(c), blockReason: reason });
    } else {
      releasable.push(safeHeldRow(c));
    }
  }
  const targetWave = nextUnreleasedWave(config);
  const headline = held.length === 0
    ? "Nobody is held for review."
    : releasable.length === 0
      ? `${people(held.length)} held for review; none are marked "${HELD_RELEASE_READY_STATUS}" yet, so there is nothing to release. Review them on the Upload page first.`
      : targetWave === null
        ? `${people(releasable.length)} approved for later, but every wave is already released. They stay held until a new wave exists.`
        : `${people(releasable.length)} approved for later and ready to release into wave ${targetWave}.`;
  return {
    ok: true,
    writesState: false,
    counts: { held: held.length, byReviewStatus, releasable: releasable.length, blocked: blocked.length },
    targetWave,
    rows: releasable.slice(0, 200),
    blockedRows: blocked.slice(0, 50),
    headline,
    whatConfirmDoes: targetWave === null
      ? "Nothing right now: there is no unreleased wave to line people up in."
      : `Confirming clears the review hold for the contacts you pick and lines them up in wave ${targetWave}, which has not been released.`,
    whatConfirmDoesNot: "It does not enroll anyone, release any wave, change a sending switch, or email anyone. Suppressed and do-not-contact people can never be released this way.",
    warning: CAMPAIGN_BRAIN_WARNING
  };
}

// Confirm: all-or-nothing, like the held disposition. Every id must be currently held,
// marked approved_for_later, unsuppressed, and unenrolled — otherwise nothing changes.
export function confirmHeldRelease(state = {}, { contactIds = [], actor = "owner", now = nowIso } = {}) {
  const at = typeof now === "function" ? now() : clean(now) || nowIso();
  const ids = [...new Set(list(contactIds).map(clean).filter(Boolean))];
  if (!ids.length) return { ok: false, error: "Pick at least one held contact to release.", rejected: [] };
  const config = reactivationCampaignOf(state);
  const targetWave = nextUnreleasedWave(config);
  if (targetWave === null) {
    return { ok: false, error: "Every wave is already released, so there is nowhere safe to line these people up. Nothing was changed.", rejected: [] };
  }
  const byId = new Map(list(state.reactivationContacts).map((c) => [clean(c.contact_id), c]));
  const rejected = [];
  for (const id of ids) {
    const contact = byId.get(id);
    if (!contact) { rejected.push({ contact_id: id, reason: "not_found" }); continue; }
    if (!contactOnHold(contact)) { rejected.push({ contact_id: id, reason: "not_held" }); continue; }
    const blockReason = heldBlockReason(contact, state);
    if (blockReason) rejected.push({ contact_id: id, reason: blockReason });
  }
  if (rejected.length) {
    return { ok: false, error: `${rejected.length} of the selected contacts cannot be released. Nothing was changed.`, rejected };
  }
  const releasing = new Set(ids);
  const contacts = list(state.reactivationContacts).map((c) => {
    if (!releasing.has(clean(c.contact_id))) return c;
    return {
      ...c,
      campaign_hold: false,
      campaign_hold_reason: "",
      wave: targetWave,
      released_from_hold_at: at,
      released_from_hold_by: clean(actor) || "owner",
      updated_at: at
    };
  });
  return {
    ok: true,
    writesState: true,
    noSend: true,
    state: { ...state, reactivationContacts: contacts },
    released: ids.length,
    wave: targetWave,
    plain: `${people(ids.length)} moved into wave ${targetWave}. They are lined up only: enrolling them still requires the approved wave ${targetWave} release, and sending stays off regardless.`
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Deliverability warnings — plain English, honest tiers, per-wave checks.
// ---------------------------------------------------------------------------------------------

const METRIC_LABELS = { hard_bounce: "hard bounces", spam_complaint: "spam complaints", unsubscribe: "unsubscribes" };

// How far the worst metric is toward its auto-pause limit (0..N, 1.0 = at the limit).
// Shared with the projector so the cockpit meter and the queue warning can never disagree.
export function deliverabilityUtilization(rates = {}, limits = {}) {
  let worst = { metric: "", utilization: 0 };
  for (const metric of Object.keys(METRIC_LABELS)) {
    const limit = Number(limits[metric] || 0);
    if (limit <= 0) continue;
    const utilization = Number(rates[metric] || 0) / limit;
    if (utilization > worst.utilization) worst = { metric, utilization };
  }
  return worst;
}

export const DELIVERABILITY_WARNING_THRESHOLD = 0.6;
const WAVE_WARNING_MIN_SENDS = 25;

export function buildDeliverabilityWarnings(state = {}, { env = process.env } = {}) {
  const config = reactivationCampaignOf(state);
  const evaluated = evaluateThresholds(state, config);
  const limits = config.thresholds;
  const rates = evaluated.rates;
  const worst = deliverabilityUtilization(rates, limits);
  const warnings = [];

  if (evaluated.tripped) {
    warnings.push({
      severity: "critical",
      plain: `A safety limit tripped: ${plainSafetyReasons(evaluated.reasons)}. The campaign pauses itself and nothing more sends until you decide.`
    });
  } else if (!evaluated.belowSample && worst.utilization >= DELIVERABILITY_WARNING_THRESHOLD) {
    warnings.push({
      severity: "warning",
      plain: `${METRIC_LABELS[worst.metric]} are ${Math.round(worst.utilization * 100)}% of the way to the auto-pause limit (${pct(rates[worst.metric], 2)} now, pauses at ${pct(limits[worst.metric], 2)}). Watch the next sends closely.`
    });
  }

  const telemetry = sendgridWebhookHealthSummary(state.sendgridWebhookHealth, { env, sent: rates.sent });
  if (clean(telemetry.warning)) {
    warnings.push({ severity: "warning", plain: clean(telemetry.warning) });
  }

  // Per-wave: a single wave can be in trouble while the campaign-wide average looks fine.
  const metrics = waveMetrics(state);
  const waves = [];
  for (const m of Object.values(metrics)) {
    if (!m || Number(m.wave) === 0) continue;
    const sent = Number(m.sent || 0);
    const waveRates = sent > 0
      ? { hard_bounce: Number(m.bounced || 0) / sent, spam_complaint: Number(m.complaints || 0) / sent, unsubscribe: Number(m.unsubscribes || 0) / sent }
      : { hard_bounce: 0, spam_complaint: 0, unsubscribe: 0 };
    waves.push({ wave: Number(m.wave), sent, rates: waveRates });
    if (sent < WAVE_WARNING_MIN_SENDS) continue;
    for (const metric of Object.keys(METRIC_LABELS)) {
      if (Number(limits[metric] || 0) > 0 && waveRates[metric] >= limits[metric]) {
        warnings.push({
          severity: "warning",
          plain: `Wave ${m.wave} on its own is past the ${METRIC_LABELS[metric]} limit (${pct(waveRates[metric], 2)} across ${sent} sends; the campaign-wide limit is ${pct(limits[metric], 2)}). Look at where that wave's list came from.`
        });
      }
    }
  }

  const level = warnings.some((w) => w.severity === "critical")
    ? "critical"
    : warnings.length
      ? "warning"
      : rates.sent === 0 ? "quiet" : "ok";
  return {
    ok: true,
    writesState: false,
    level,
    sent: rates.sent,
    belowSample: evaluated.belowSample,
    minSampleSize: config.minSampleSize,
    utilization: worst.utilization,
    worstMetric: worst.metric ? METRIC_LABELS[worst.metric] : "",
    limits: { ...limits },
    rates: { ...rates },
    waves,
    warnings,
    plain: level === "critical"
      ? warnings[0].plain
      : level === "warning"
        ? `${warnings.length} deliverability warning${warnings.length === 1 ? "" : "s"} need${warnings.length === 1 ? "s" : ""} a look.`
        : level === "quiet"
          ? "No emails have been sent yet, so there is nothing to warn about. That is expected."
          : evaluated.belowSample
            ? `Safety limits arm after ${config.minSampleSize} sends (so far: ${rates.sent}). Nothing to warn about yet.`
            : `Deliverability looks healthy: the worst metric is ${Math.round(worst.utilization * 100)}% of the way to its auto-pause limit.`
  };
}
