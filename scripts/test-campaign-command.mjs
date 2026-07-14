#!/usr/bin/env node
// Campaign command tests — preview purity, approval-before-release, blocked-attempt logging,
// held/suppressed protection, pause/resume flow, threshold + telemetry honesty, no gate changes,
// no sends, no jargon.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCampaignCommandView, previewWaveRelease, proposeWaveRelease, executeApprovedWaveRelease,
  pauseCampaign, proposeCampaignResume, executeApprovedResume, applyReactivationLiveMode,
  RELEASE_ACTION_TYPE, RESUME_ACTION_TYPE, CAMPAIGN_COMMAND_WARNING, CAMPAIGN_WORKFLOW_PLAIN
} from "./campaign-command.mjs";
import {
  reactivationCampaignOf, releaseWave, reactivationLiveSendAuthority, REACTIVATION_ENGINE_ID
} from "./reactivation-os.mjs";
import { autopilotEnabled } from "./heartbeat.mjs";
import { buildSafetyPosture } from "./safety-posture.mjs";
import { transitionQueueItem } from "./company-memory.mjs";
import { coreStateCollections } from "./storage.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = "2026-07-03T15:00:00.000Z";
const ENV = {}; // all gates off — the safe default
const ENV_SENDING_ON = { REACTIVATION_LIVE_SEND: "true", SENDGRID_API_KEY: "sg-test" };

function baseState(extra = {}) {
  return {
    reactivationContacts: [
      { contact_id: "c1", email: "a@example.com", wave: 1, enrolled_at: "2026-06-20T00:00:00Z" },
      { contact_id: "c2", email: "b@example.com", wave: 3 },
      { contact_id: "c3", email: "c@example.com", wave: 3, campaign_hold: true },
      { contact_id: "c4", email: "d@example.com", wave: 3, unsubscribed: true },
      { contact_id: "c5", email: "e@example.com", wave: 3 }
    ],
    reactivationCampaign: { releasedWaves: [1, 2], status: "active" },
    ...extra
  };
}

function deepFreeze(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(obj);
}

// Autopilot state where sending would really flow.
function sendingOnState(extra = {}) {
  return baseState({ autopilotSettings: { "reactivation-sequencer": { enabled: true } }, ...extra });
}

// ---------------------------------------------------------------------------------------------

check("overview and preview are pure — deep-frozen state is never mutated", () => {
  const state = deepFreeze(baseState());
  const view = buildCampaignCommandView(state, { env: ENV, now: new Date(NOW) });
  assert.equal(view.ok, true);
  const preview = previewWaveRelease(state, 3, { env: ENV, now: new Date(NOW) });
  assert.equal(preview.writesState, false);
});

check("overview reports gates honestly when sending is off", () => {
  const view = buildCampaignCommandView(baseState(), { env: ENV, now: new Date(NOW) });
  assert.equal(view.gates.sendingOn, false);
  assert(/sending is off/i.test(view.statusPlain));
  assert(/nobody gets one/i.test(view.dueNowPlain));
});

check("overview reports sending ON when live-send + autopilot + key are all set", () => {
  const view = buildCampaignCommandView(sendingOnState(), { env: ENV_SENDING_ON, now: new Date(NOW) });
  assert.equal(view.gates.sendingOn, true);
});

check("preview shows who / which touch / when / suppression / blocked counts", () => {
  const preview = previewWaveRelease(baseState(), 3, { env: ENV, now: new Date(NOW) });
  assert.equal(preview.eligible, 2);
  assert.equal(preview.held, 1);
  assert.equal(preview.blocked, 1);
  assert(preview.lines.some((l) => /email 1 of 5/.test(l)));
  assert(preview.lines.some((l) => /Sending is OFF/.test(l)));
  assert(preview.lines.some((l) => /wave 1 and 2 are already released/i.test(l)), "must warn about primed earlier waves");
  assert(/does not turn sending on/i.test(preview.whatApprovalDoesNot));
});

check("preview risk is dangerous when sending is on, caution when off", () => {
  assert.equal(previewWaveRelease(baseState(), 3, { env: ENV }).riskLevel, "caution");
  assert.equal(previewWaveRelease(sendingOnState(), 3, { env: ENV_SENDING_ON }).riskLevel, "dangerous");
});

check("unknown wave gets a plain-English error", () => {
  assert.throws(() => previewWaveRelease(baseState(), 9, { env: ENV }), /no wave 9/i);
});

check("propose writes a requested approval + needs-Roger queue item and releases NOTHING", () => {
  const result = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW });
  assert.equal(result.ok, true);
  const approval = result.state.approvals.find((a) => a.id === result.approvalId);
  assert.equal(approval.state, "requested");
  assert.equal(approval.action_type, RELEASE_ACTION_TYPE);
  const item = result.state.queueItems.find((q) => q.id === result.queueItemId);
  assert.equal(item.status, "needs_roger");
  assert.equal(item.requiresApproval, true);
  assert.equal(item.metadata.wave, 3);
  assert.deepEqual(reactivationCampaignOf(result.state).releasedWaves, [1, 2], "propose must not release");
  assert.equal(result.state.reactivationContacts.filter((c) => c.enrolled_at).length, 1, "propose must not enroll");
});

check("duplicate proposals for the same wave refresh one queue item, not two", () => {
  const first = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW });
  const second = proposeWaveRelease(first.state, 3, { env: ENV, now: "2026-07-04T09:00:00.000Z" });
  const items = second.state.queueItems.filter((q) => q.metadata?.wave === 3);
  assert.equal(items.length, 1);
});

check("an approval record ALONE does not release or enroll anyone", () => {
  const prop = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW });
  const approved = {
    ...prop.state,
    approvals: prop.state.approvals.map((a) => a.id === prop.approvalId ? { ...a, state: "approved", approved_by: "roger" } : a)
  };
  assert.deepEqual(reactivationCampaignOf(approved).releasedWaves, [1, 2]);
  assert.equal(approved.reactivationContacts.filter((c) => c.enrolled_at).length, 1);
});

check("execute refuses without an approved approval and logs the blocked attempt", () => {
  const prop = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW });
  const result = executeApprovedWaveRelease(prop.state, { approvalId: prop.approvalId, env: ENV, now: NOW });
  assert.equal(result.ok, false);
  assert(/not approved yet/i.test(result.error));
  assert(result.state.companyEvents.some((e) => e.type === "campaign_release_blocked"));
  assert.deepEqual(reactivationCampaignOf(result.state).releasedWaves, [1, 2], "refusal must not release");
});

check("execute with a bogus approval id refuses and releases nothing", () => {
  const result = executeApprovedWaveRelease(baseState(), { approvalId: "ap-nope", env: ENV, now: NOW });
  assert.equal(result.ok, false);
  assert(result.state.companyEvents.some((e) => e.type === "campaign_release_blocked"));
});

function approveAndExecute(state, wave, { env = ENV, now = NOW, scheduledFor = "" } = {}) {
  const prop = proposeWaveRelease(state, wave, { env, now, scheduledFor });
  const approved = {
    ...prop.state,
    approvals: prop.state.approvals.map((a) => a.id === prop.approvalId ? { ...a, state: "approved", approved_by: "roger", approved_at: now } : a)
  };
  return { prop, exec: executeApprovedWaveRelease(approved, { approvalId: prop.approvalId, actor: "roger", env, now }) };
}

check("approved execute releases the wave, enrolls only eligible people, completes the queue item", () => {
  const { prop, exec } = approveAndExecute(baseState(), 3);
  assert.equal(exec.ok, true);
  assert.equal(exec.enrolled, 2, "only the 2 eligible people enroll");
  assert(reactivationCampaignOf(exec.state).releasedWaves.includes(3));
  const held = exec.state.reactivationContacts.find((c) => c.contact_id === "c3");
  assert(!held.enrolled_at, "held person must never enroll");
  const suppressed = exec.state.reactivationContacts.find((c) => c.contact_id === "c4");
  assert(!suppressed.enrolled_at, "suppressed person must never enroll");
  const item = exec.state.queueItems.find((q) => q.id === prop.queueItemId);
  assert.equal(item.status, "completed");
  const approval = exec.state.approvals.find((a) => a.id === prop.approvalId);
  assert.equal(approval.state, "executed");
  assert(exec.state.companyEvents.some((e) => e.type === "campaign_wave_released"));
  assert.equal(exec.verified.ok, true);
});

check("execute is idempotent — a second run refuses instead of double-releasing", () => {
  const { prop, exec } = approveAndExecute(baseState(), 3);
  const again = executeApprovedWaveRelease(exec.state, { approvalId: prop.approvalId, env: ENV, now: NOW });
  assert.equal(again.ok, false);
  assert(/already ran/i.test(again.error));
});

check("a date-scheduled release refuses to run before its planned date", () => {
  const prop = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW, scheduledFor: "2026-07-10" });
  assert.equal(prop.ok, true);
  const approved = {
    ...prop.state,
    approvals: prop.state.approvals.map((a) => a.id === prop.approvalId ? { ...a, state: "approved" } : a)
  };
  const early = executeApprovedWaveRelease(approved, { approvalId: prop.approvalId, env: ENV, now: NOW });
  assert.equal(early.ok, false);
  assert(/planned for/i.test(early.error));
  const onTime = executeApprovedWaveRelease(approved, { approvalId: prop.approvalId, env: ENV, now: "2026-07-10T13:00:01.000Z" });
  assert.equal(onTime.ok, true);
});

check("execute refuses when a safety limit is tripped, even with approval", () => {
  const tripped = baseState({
    reactivationAttempts: Array.from({ length: 120 }, (_, i) => ({ status: "sent", contact_id: `s${i}`, to: `s${i}@x.org` })),
    reactivationEvents: Array.from({ length: 10 }, (_, i) => ({ type: "bounce", contact_id: `s${i}` }))
  });
  const { exec } = approveAndExecute(tripped, 3);
  assert.equal(exec.ok, false);
  assert(/safety limit/i.test(exec.error));
  assert(exec.state.companyEvents.some((e) => e.type === "campaign_release_blocked"));
});

check("execute never touches sending gates or autopilot", () => {
  const env = { ...ENV };
  const { exec } = approveAndExecute(baseState(), 3, { env });
  assert.deepEqual(env, ENV, "env must not be written");
  assert.equal(exec.state.autopilotSettings, undefined, "autopilot settings must not appear");
  assert.equal(exec.state.reactivationAttempts, undefined, "no send attempts may be created");
});

check("pause is immediate, audited, and honest", () => {
  const result = pauseCampaign(baseState(), { reason: "Reviewing bounce numbers", actor: "roger", now: NOW });
  assert.equal(result.ok, true);
  assert.equal(reactivationCampaignOf(result.state).status, "paused");
  assert(result.state.approvals.some((a) => a.action_type === "pause_campaign" && a.state === "executed"));
  assert(result.state.companyEvents.some((e) => e.type === "campaign_paused"));
  const again = pauseCampaign(result.state, { now: NOW });
  assert.equal(again.ok, false);
});

check("resume needs a proposal + approval; executing resumes without touching gates", () => {
  const paused = pauseCampaign(baseState(), { reason: "Manual review", actor: "roger", now: NOW }).state;
  const prop = proposeCampaignResume(paused, { env: ENV, now: NOW });
  assert.equal(prop.ok, true);
  const notYet = executeApprovedResume(prop.state, { approvalId: prop.approvalId, env: ENV, now: NOW });
  assert.equal(notYet.ok, false);
  assert(notYet.state.companyEvents.some((e) => e.type === "campaign_resume_blocked"));
  const approved = {
    ...prop.state,
    approvals: prop.state.approvals.map((a) => a.id === prop.approvalId ? { ...a, state: "approved" } : a)
  };
  const resumed = executeApprovedResume(approved, { approvalId: prop.approvalId, actor: "roger", env: ENV, now: NOW });
  assert.equal(resumed.ok, true);
  assert.equal(reactivationCampaignOf(resumed.state).status, "active");
  assert.equal(reactivationCampaignOf(resumed.state).pausedReason, "");
  assert(resumed.state.companyEvents.some((e) => e.type === "campaign_resumed"));
  assert(/sending is off/i.test(resumed.headline));
});

check("resume refuses while a safety limit is still tripped", () => {
  const tripped = baseState({
    reactivationAttempts: Array.from({ length: 120 }, (_, i) => ({ status: "sent", contact_id: `s${i}`, to: `s${i}@x.org` })),
    reactivationEvents: Array.from({ length: 10 }, (_, i) => ({ type: "bounce", contact_id: `s${i}` }))
  });
  const paused = pauseCampaign(tripped, { reason: "auto", now: NOW }).state;
  const prop = proposeCampaignResume(paused, { env: ENV, now: NOW });
  const approved = {
    ...prop.state,
    approvals: prop.state.approvals.map((a) => a.id === prop.approvalId ? { ...a, state: "approved" } : a)
  };
  const result = executeApprovedResume(approved, { approvalId: prop.approvalId, env: ENV, now: NOW });
  assert.equal(result.ok, false);
  assert(/safety limit/i.test(result.error));
});

check("threshold monitor is honest below sample size and when tripped", () => {
  const view = buildCampaignCommandView(baseState(), { env: ENV, now: new Date(NOW) });
  assert.equal(view.thresholds.belowSample, true);
  assert(/arm after 100 sends/i.test(view.thresholds.plain));
  const tripped = baseState({
    reactivationAttempts: Array.from({ length: 120 }, (_, i) => ({ status: "sent", contact_id: `s${i}`, to: `s${i}@x.org` })),
    reactivationEvents: Array.from({ length: 10 }, (_, i) => ({ type: "bounce", contact_id: `s${i}` }))
  });
  const trippedView = buildCampaignCommandView(tripped, { env: ENV, now: new Date(NOW) });
  assert.equal(trippedView.thresholds.tripped, true);
  assert(/safety limit tripped/i.test(trippedView.thresholds.plain));
});

check("telemetry is honest: blind warning when sends happened but no webhook data", () => {
  const blind = baseState({
    reactivationAttempts: [{ status: "sent", contact_id: "c1", to: "a@example.com" }]
  });
  const view = buildCampaignCommandView(blind, { env: ENV, now: new Date(NOW) });
  assert.equal(view.telemetry.trusted, false);
  assert(/blind/i.test(view.telemetry.plain));
  const quiet = buildCampaignCommandView(baseState(), { env: ENV, now: new Date(NOW) });
  assert.equal(quiet.telemetry.trusted, true);
  assert(/expected/i.test(quiet.telemetry.plain));
});

check("re-proposing cannot clear an approved release's planned date (schedule bypass fixed)", () => {
  const prop = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW, scheduledFor: "2026-09-01" });
  const approved = {
    ...prop.state,
    approvals: prop.state.approvals.map((a) => a.id === prop.approvalId ? { ...a, state: "approved" } : a)
  };
  const again = proposeWaveRelease(approved, 3, { env: ENV, now: "2026-07-04T09:00:00.000Z" });
  assert.equal(again.ok, false, "re-propose after approval must be refused");
  assert(/planned for 2026-09-01/i.test(again.error));
  const early = executeApprovedWaveRelease(approved, { approvalId: prop.approvalId, env: ENV, now: "2026-07-04T09:00:00.000Z" });
  assert.equal(early.ok, false, "the original schedule must still hold");
});

check("re-proposing while still pending reuses the same approval and updates the date", () => {
  const first = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW, scheduledFor: "2026-09-01" });
  const second = proposeWaveRelease(first.state, 3, { env: ENV, now: "2026-07-04T09:00:00.000Z" });
  assert.equal(second.ok, true);
  assert.equal(second.approvalId, first.approvalId, "pending proposal must reuse the approval");
  assert.equal(second.queueItemId, first.queueItemId);
  const item = second.state.queueItems.find((q) => q.id === second.queueItemId);
  assert.equal(item.metadata.scheduledFor, "", "the newest proposal's (empty) date wins");
  assert.equal(second.state.approvals.filter((a) => a.action_type === RELEASE_ACTION_TYPE).length, 1, "no dangling second approval");
});

check("a dismissed proposal is not a dead-end — a fresh one can be made and approved", () => {
  const first = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW });
  const dismissed = transitionQueueItem(first.state, { id: first.queueItemId, status: "dismissed", actor: "roger", now: () => NOW });
  assert.equal(dismissed.ok, true);
  const second = proposeWaveRelease(dismissed.state, 3, { env: ENV, now: "2026-07-04T09:00:00.000Z" });
  assert.equal(second.ok, true);
  assert.notEqual(second.queueItemId, first.queueItemId, "fresh proposal must be a new queue item");
  const item = second.state.queueItems.find((q) => q.id === second.queueItemId);
  assert.equal(item.status, "needs_roger");
  const old = second.state.queueItems.find((q) => q.id === first.queueItemId);
  assert.equal(old.status, "dismissed", "the dismissed one stays dismissed");
});

check("a wave with nobody eligible cannot be proposed", () => {
  const empty = baseState();
  empty.reactivationContacts = empty.reactivationContacts.map((c) =>
    Number(c.wave) === 3 ? { ...c, campaign_hold: true } : c);
  const result = proposeWaveRelease(empty, 3, { env: ENV, now: NOW });
  assert.equal(result.ok, false);
  assert(/nothing to release/i.test(result.error));
});

check("a malformed planned date is refused in plain English", () => {
  const result = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW, scheduledFor: "next tuesday" });
  assert.equal(result.ok, false);
  assert(/year-month-day/i.test(result.error));
});

check("planned dates compare in Eastern time, not UTC", () => {
  // 2026-07-10T02:00Z is still July 9 in ET — the release must refuse.
  const prop = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW, scheduledFor: "2026-07-10" });
  const approved = {
    ...prop.state,
    approvals: prop.state.approvals.map((a) => a.id === prop.approvalId ? { ...a, state: "approved" } : a)
  };
  const utcEarly = executeApprovedWaveRelease(approved, { approvalId: prop.approvalId, env: ENV, now: "2026-07-10T02:00:00.000Z" });
  assert.equal(utcEarly.ok, false, "UTC-midnight must not unlock an ET-planned date");
  const etDay = executeApprovedWaveRelease(approved, { approvalId: prop.approvalId, env: ENV, now: "2026-07-10T12:00:00.000Z" });
  assert.equal(etDay.ok, true);
});

check("safety-limit copy has no machine tokens anywhere it surfaces", () => {
  const tripped = baseState({
    reactivationAttempts: Array.from({ length: 120 }, (_, i) => ({ status: "sent", contact_id: `s${i}`, to: `s${i}@x.org` })),
    reactivationEvents: Array.from({ length: 10 }, (_, i) => ({ type: "bounce", contact_id: `s${i}` }))
  });
  const view = buildCampaignCommandView(tripped, { env: ENV, now: new Date(NOW) });
  const { exec } = approveAndExecute(tripped, 3);
  for (const text of [view.thresholds.plain, exec.error]) {
    assert(!/hard_bounce|spam_complaint|>=/.test(String(text)), `machine tokens leaked: ${text}`);
    assert(/hard bounces/.test(String(view.thresholds.plain)));
  }
});

check("the REAL approval path — Queue approve then execute — works end to end", () => {
  const prop = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW });
  const decided = transitionQueueItem(prop.state, { id: prop.queueItemId, status: "approved", actor: "roger", now: () => NOW });
  assert.equal(decided.ok, true);
  const approval = decided.state.approvals.find((a) => a.id === prop.approvalId);
  assert.equal(approval.state, "approved");
  assert.equal(approval.action_type, RELEASE_ACTION_TYPE, "Queue approval must not corrupt the action type");
  const exec = executeApprovedWaveRelease(decided.state, { approvalId: prop.approvalId, actor: "roger", env: ENV, now: NOW });
  assert.equal(exec.ok, true);
  assert.equal(exec.enrolled, 2);
});

check("all collections campaign command writes are registered for persistence", () => {
  for (const name of ["reactivationCampaign", "reactivationContacts", "queueItems", "approvals", "companyEvents"]) {
    assert(coreStateCollections.includes(name), `${name} missing from coreStateCollections`);
  }
});

check("user-facing campaign copy carries no engineering jargon", () => {
  const surfaces = [CAMPAIGN_COMMAND_WARNING, CAMPAIGN_WORKFLOW_PLAIN];
  const view = buildCampaignCommandView(baseState(), { env: ENV, now: new Date(NOW) });
  surfaces.push(view.statusPlain, view.dueNowPlain, view.nextRecommendedAction, view.thresholds.plain, view.telemetry.plain, view.sendWindowPlain, view.waveRecommendation, view.legacyUnattributedPlain);
  for (const w of view.waves) surfaces.push(w.plain);
  const preview = previewWaveRelease(baseState(), 3, { env: ENV, now: new Date(NOW) });
  surfaces.push(preview.headline, ...preview.lines, preview.whatApprovalDoes, preview.whatApprovalDoesNot);
  const prop = proposeWaveRelease(baseState(), 3, { env: ENV, now: NOW });
  for (const q of prop.state.queueItems) surfaces.push(q.title, q.summary, q.recommendation);
  for (const field of surfaces) {
    assert(!/\b(heartbeat|mutex|registry|lease|reducer|endpoint|payload|upsert|autopilot|env var|gate state)\b|act\(\)|JSON/i.test(String(field)), `jargon leaked into: ${field}`);
  }
});

// ---- Operator-clarity page checks (preview → approve → run → monitor → stop) ------------------

function memStore(initial) {
  let state = initial;
  const calls = { writeState: 0, writeCollections: [] };
  return {
    calls,
    async readState() { return state; },
    async writeState(next) { calls.writeState += 1; state = next; },
    async writeCollections(patch) { calls.writeCollections.push(Object.keys(patch).sort()); state = { ...state, ...patch }; },
    get state() { return state; }
  };
}

async function checkAsync(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const OUT_WINDOW_NOW = new Date("2026-07-03T02:00:00Z"); // Thu 22:00 ET — weekday, after hours

check("releasing a wave never enables sending", () => {
  const rel = releaseWave(baseState(), 3, { now: NOW });
  assert.equal(reactivationLiveSendAuthority(rel.state, ENV), false, "release must not grant send authority");
  assert.equal(autopilotEnabled(rel.state, REACTIVATION_ENGINE_ID, ENV), false, "release must not flip autopilot");
  const view = buildCampaignCommandView(rel.state, { env: ENV, now: new Date(NOW) });
  assert.equal(view.gates.sendingOn, false);
  assert(/sending is off/i.test(view.gates.plain));
});

check("outside the window, the due message explains the window — never a false empty queue", () => {
  const view = buildCampaignCommandView(baseState(), { env: ENV, now: OUT_WINDOW_NOW });
  assert.equal(view.windowOpenNow, false);
  assert(/Because it is outside the weekday 8am–5pm ET sending window, 0 emails would send right now\./.test(view.dueNowPlain), view.dueNowPlain);
  assert(view.dueEligible >= 1, "contact c1 is due — the queue is NOT empty");
  assert(/queued/.test(view.dueNowPlain), "eligible count surfaces so the queue never looks empty");
});

check("inside the window with sending off, the real due count shows (no false 0)", () => {
  const view = buildCampaignCommandView(baseState(), { env: ENV, now: new Date(NOW) });
  assert.equal(view.windowOpenNow, true);
  assert(view.dueEligible >= 1);
  assert(view.dueNowPlain.includes(String(view.dueEligible)), "the eligible count is in the message");
  assert(/Run Reactivation Campaign/.test(view.dueNowPlain), "message points at the Run control");
  assert(!/outside the weekday/.test(view.dueNowPlain));
});

check("inside the window with sending on, the message shows who is due this hour", () => {
  const view = buildCampaignCommandView(sendingOnState(), { env: ENV_SENDING_ON, now: new Date(NOW) });
  assert(/due an email in this hour's send/.test(view.dueNowPlain), view.dueNowPlain);
  assert(!/outside the weekday/.test(view.dueNowPlain));
});

check("waves 3 and 4 stay unreleased in the view; recommendation says run wave 2 first", () => {
  const view = buildCampaignCommandView(baseState(), { env: ENV, now: new Date(NOW) });
  assert.deepEqual(view.releasedWaves, [1, 2]);
  for (const w of view.waves.filter((w) => Number(w.wave) >= 3)) assert.equal(w.released, false, `wave ${w.wave} must stay unreleased`);
  assert.equal(view.waveRecommendation, "Recommendation: run Wave 2 before releasing Wave 3.");
});

check("legacy/unattributed prior sends surface when totals exceed the wave display (display-only)", () => {
  const state = baseState({
    reactivationContacts: [
      ...baseState().reactivationContacts,
      { contact_id: "cx", email: "x@example.com", wave: null }
    ],
    reactivationAttempts: [
      { id: "a1", contact_id: "cx", to: "x@example.com", status: "sent", sent_date: "2026-06-30", created_at: "2026-06-30T15:00:00Z" },
      { id: "a2", contact_id: "c1", to: "a@example.com", status: "sent", sent_date: "2026-06-30", created_at: "2026-06-30T15:00:00Z" }
    ]
  });
  const view = buildCampaignCommandView(state, { env: ENV, now: new Date(NOW) });
  assert.equal(view.legacyUnattributedSent, 1);
  assert(/Legacy\/unattributed prior sends: 1\./.test(view.legacyUnattributedPlain));
  assert(/included in total safety metrics but are not assigned to the current wave display/.test(view.legacyUnattributedPlain));
  const clean = buildCampaignCommandView(baseState(), { env: ENV, now: new Date(NOW) });
  assert.equal(clean.legacyUnattributedSent, 0);
  assert.equal(clean.legacyUnattributedPlain, "");
});

check("normal operation needs no shell commands: run/stop/release/approve all live in the page", () => {
  const src = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  for (const marker of [
    "/api/reactivation/live-mode",          // the live-mode control endpoint
    "Run Reactivation Campaign",            // first-class Run button
    "Stop Reactivation Campaign",           // first-class Stop button
    "reactivationRunCampaignConfirm",       // Run is two-step
    "reactivationLiveModeApply",            // both buttons drive the SAME live-mode control
    "campaignWaveExecute",                  // approved release runs from the page
    "Internal planning date",               // renamed from Planned release date
    "This does not schedule sending",       // planning date disclaimer (static label lowercased variant below)
    "Sender identity verification"          // signature status line
  ]) {
    assert(src.includes(marker), `missing UI marker: ${marker}`);
  }
  assert(src.includes("this does not schedule sending") || src.includes("This does not schedule sending"));
  assert(!src.includes("Planned release date"), "old label is gone");
  const runFn = src.slice(src.indexOf("async function reactivationLiveModeApply"), src.indexOf("async function reactivationLiveModeApply") + 800);
  assert(runFn.includes('api("/api/reactivation/live-mode"'), "Run/Stop call the existing live-mode endpoint");
  assert(!CAMPAIGN_COMMAND_WARNING.includes("somewhere else"), "vague 'somewhere else' copy replaced");
  assert(/Run Reactivation Campaign/.test(CAMPAIGN_COMMAND_WARNING), "warning names the real control");
});

await checkAsync("Run uses the live-mode control; Stop disables it; B2 outreach and social stay untouched", async () => {
  const store = memStore(baseState());
  const run = await applyReactivationLiveMode(store, { enabled: true, actorLabel: "roger", env: ENV, now: new Date(NOW) });
  assert.equal(run.liveMode.enabled, true, "Run turns live mode on");
  assert.equal(reactivationLiveSendAuthority(store.state, ENV), true);
  assert.equal(store.calls.writeState, 0, "control never uses the full-state write path");
  const postureOn = buildSafetyPosture({ state: store.state, env: {} });
  assert.equal(postureOn.email.outreach.posture, "off", "B2 outreach posture unchanged");
  assert.equal(postureOn.email.outreach.autopilotEnabled, false, "B2 autopilot unchanged");
  assert.equal(postureOn.social.posture, "off", "social posting unchanged");
  assert.equal(store.state.autopilotSettings["outreach-sequencer"], undefined, "no B2 toggle written");
  assert.deepEqual(reactivationCampaignOf(store.state).releasedWaves, [1, 2], "Run releases no waves");
  const stop = await applyReactivationLiveMode(store, { enabled: false, actorLabel: "roger", env: ENV, now: new Date(NOW) });
  assert.equal(stop.liveMode.enabled, false, "Stop turns live mode off");
  assert.equal(reactivationLiveSendAuthority(store.state, ENV), false);
  const postureOff = buildSafetyPosture({ state: store.state, env: {} });
  assert.equal(postureOff.email.posture, "off");
});

console.log(`\nAll ${passed} campaign-command checks passed.`);
