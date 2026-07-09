// Reactivation LIVE MODE tests — the owner Run/Stop switch (POST /api/reactivation/live-mode).
// Proves the required behaviors BEFORE the switch exists in production:
//   1.  Enabling live mode does not send immediately (control write only, no network).
//   2.  Heartbeat outside the 8am–5pm ET window sends zero.
//   3.  Heartbeat inside the window sends eligible contacts, capped at perTickMax.
//   4.  A tripped stop-threshold pauses the campaign and sends zero.
//   5.  B2 outreach stays off and untouched (autopilot, sends, settings keys).
//   6.  Waves 3 and 4 are never released by any of this.
//   7.  Disabling live mode prevents future heartbeat sends.
//   8.  The control uses SCOPED writeCollections (registered singletons only), never writeState.
//   9.  The prod commit gate accepts a prod commit that is AHEAD of (contains) the required
//       safety commit, and still rejects behind/unrelated/unknown commits.
// Plus: live mode is the send AUTHORITY through the real resolveReactivationSendDecision (no env
// flag needed), the master kill switch overrides it, safety posture reflects it, and the owner
// status copy strings map to the real gate states.

import assert from "node:assert";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { runHeartbeat, autopilotEnabled } from "./heartbeat.mjs";
import { buildOutreachEngine, OUTREACH_ENGINE_ID, assembleCompliantMessage } from "./outreach-os.mjs";
import {
  REACTIVATION_ENGINE_ID, buildReactivationEngine,
  reactivationLiveModeEnabled, reactivationLiveSendAuthority, reactivationSendKillSwitchOn,
  setReactivationLiveMode, buildReactivationLiveStatus, REACTIVATION_STATUS_COPY,
  resolveReactivationSendDecision, reactivationMessageConfig, evaluateThresholds,
  reactivationCampaignOf, DEFAULT_REACTIVATION_CONFIG
} from "./reactivation-os.mjs";
import { applyReactivationLiveMode } from "./campaign-command.mjs";
import { buildSafetyPosture } from "./safety-posture.mjs";
import { evaluateCommitGate } from "./prod-commit-gate.mjs";
import { getReactivationTouch } from "./reactivation-sequences.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const PROD_BASE = "https://legalease-command-center-prod.onrender.com";
const ENV = { SENDGRID_API_KEY: "SG.fake" };            // NO REACTIVATION_LIVE_SEND anywhere
const IN_WINDOW = new Date("2026-07-01T15:00:00Z");     // Wed 11:00 ET — inside 8–17, weekday
const IN_WINDOW_2 = new Date("2026-07-01T16:00:00Z");   // Wed 12:00 ET — next hour bucket
const OUT_WINDOW = new Date("2026-07-02T02:00:00Z");    // Wed 22:00 ET — outside window

function contactsFixture(n) {
  const providers = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com"];
  return Array.from({ length: n }, (_, i) => ({
    contact_id: `react-live-${i}`,
    email: `person${i}@${providers[i % providers.length]}`,
    first_name: `P${i}`,
    full_name: `P${i} Test`,
    provider: "",
    priority: "cold",
    wave: (i % 2) + 1,                                   // waves 1 and 2 only
    enrolled_at: "2026-06-28T12:00:00Z",                 // cadence day 1 passed => touch 1 due
    sequence_status: "Enrolled"
  }));
}

function baseState(n = 8) {
  return {
    reactivationCampaign: { campaignId: "mvp-reactivation", status: "active", releasedWaves: [1, 2] },
    reactivationContacts: contactsFixture(n),
    reactivationAttempts: [],
    reactivationEvents: [],
    outreachSuppressions: [],
    autopilotSettings: {},
    heartbeatRuns: [],
    companyEvents: []
  };
}

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

// A send executor that uses the REAL decision function — exactly like the server's
// runReactivationSend — so these tests prove the authority chain, not a mock of it.
function makeSendSpy() {
  const calls = [];
  return {
    calls,
    run: async (message, opts) => {
      const decision = resolveReactivationSendDecision(message, opts);
      calls.push({ to: message.to, status: decision.status, reason: decision.reason || "" });
      if (decision.status !== "live") return decision;
      return { status: "sent", provider: "test-provider" };
    }
  };
}

function makeOutreachSpy() {
  const calls = [];
  return { calls, run: async (message) => { calls.push(message.to); return { status: "sent", provider: "test" }; } };
}

// Durable-claim mock (Phase B PR 1): the engine fails CLOSED for live sends without a claim
// path, so the test registry injects one exactly like the server injects
// store.claimCollectionItems. Atomic check+insert per call, same inserted/skipped contract.
function memClaims() {
  const rows = new Map();
  return {
    rows,
    fn: async (claims) => {
      const inserted = [];
      const skipped = [];
      for (const claim of claims) {
        if (rows.has(claim.id)) { skipped.push(claim); continue; }
        rows.set(claim.id, { ...claim });
        inserted.push(claim);
      }
      return { inserted, skipped };
    }
  };
}

function registryWith(spy, outreachSpy, claims = memClaims()) {
  return [
    buildReactivationEngine({ runReactivationSend: spy.run, claimReactivationSends: claims.fn }),
    buildOutreachEngine({ runOutreachSend: outreachSpy.run })
  ];
}

function compliantMessage() {
  const touch = getReactivationTouch("logged_in", 1);
  return assembleCompliantMessage({
    contact: { email: "alice@gmail.com", first_name: "Alice", contact_id: "react-alice" },
    org: {},
    step: { ...touch, campaign_id: "mvp-reactivation", classification: "" },
    config: { ...reactivationMessageConfig({}, { sequenceId: "logged_in", touchNumber: 1 }), publicBaseUrl: PROD_BASE },
    baseUrl: PROD_BASE,
    env: {}
  });
}

console.log("Reactivation live-mode tests");

// ---- 0. The control writes ONLY into already-registered singletons (Supabase-drop trap) ------
{
  const { state } = setReactivationLiveMode(baseState(), { enabled: true, actor: "Owner", now: "2026-07-01T14:00:00Z" });
  for (const key of ["reactivationCampaign", "autopilotSettings"]) {
    assert(coreStateCollections.includes(key), `${key} must be registered in coreStateCollections`);
    assert(singletonCollections.has(key), `${key} must be a singleton`);
  }
  assert.equal(state.reactivationCampaign.liveMode.enabled, true);
  assert.equal(state.reactivationCampaign.liveMode.updatedBy, "Owner");
  assert.equal(state.reactivationCampaign.liveMode.history.length, 1);
  assert.equal(state.autopilotSettings[REACTIVATION_ENGINE_ID].enabled, true);
  assert.equal(Object.keys(state.autopilotSettings).length, 1, "only the reactivation toggle is touched");
  assert.deepEqual(reactivationCampaignOf(state).releasedWaves, [1, 2], "released waves untouched");
  assert.equal(reactivationCampaignOf(state).status, "active", "campaign status untouched");
  ok("live mode record lives in registered singletons; flips ONLY the reactivation gates");
}

// ---- Authority: live mode drives the REAL send decision without any env flag ------------------
{
  const on = setReactivationLiveMode(baseState(), { enabled: true }).state;
  const off = baseState();
  const message = compliantMessage();
  assert.equal(reactivationLiveSendAuthority(on, ENV), true, "live mode grants authority");
  assert.equal(reactivationLiveSendAuthority(off, ENV), false, "default is OFF");
  assert.equal(resolveReactivationSendDecision(message, { env: ENV, state: on, now: IN_WINDOW }).status, "live",
    "live mode alone authorizes a compliant in-window send — no REACTIVATION_LIVE_SEND needed");
  assert.equal(resolveReactivationSendDecision(message, { env: ENV, state: off, now: IN_WINDOW }).status, "dry_run",
    "without live mode (and without the env flag) the decision stays dry_run");
  // Master kill switch overrides live mode.
  const killEnv = { ...ENV, REACTIVATION_SEND_DISABLED: "true" };
  assert.equal(reactivationSendKillSwitchOn(killEnv), true);
  assert.equal(reactivationSendKillSwitchOn(ENV), false, "kill switch defaults OFF");
  const killed = resolveReactivationSendDecision(message, { env: killEnv, state: on, now: IN_WINDOW });
  assert.equal(killed.status, "dry_run");
  assert.equal(killed.reason, "kill_switch");
  // Campaign-level re-checks at send time.
  assert.equal(resolveReactivationSendDecision(message, { env: ENV, state: on, now: OUT_WINDOW }).reason, "outside_window");
  const paused = { ...on, reactivationCampaign: { ...on.reactivationCampaign, status: "paused" } };
  assert.equal(resolveReactivationSendDecision(message, { env: ENV, state: paused, now: IN_WINDOW }).reason, "campaign_paused");
  // Legacy env-flag path unchanged (no state).
  assert.equal(resolveReactivationSendDecision(message, { env: { ...ENV, REACTIVATION_LIVE_SEND: "true" } }).status, "live");
  ok("live mode is the send authority; kill switch, window, and campaign status re-checked at send time");
}

// ---- 1 + 8. Enabling does not send; scoped writes only ----------------------------------------
{
  const store = memStore(baseState());
  const priorFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("live-mode control must not touch the network"); };
  let result;
  try {
    result = await applyReactivationLiveMode(store, { enabled: true, actorLabel: "Roger", env: ENV, now: IN_WINDOW });
  } finally {
    globalThis.fetch = priorFetch;
  }
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.liveMode.enabled, true);
  assert.equal(store.state.reactivationAttempts.length, 0, "no send attempt recorded");
  assert.equal(store.calls.writeState, 0, "writeState (full-state path) never used");
  assert.equal(store.calls.writeCollections.length, 1, "exactly one scoped write");
  assert.deepEqual(store.calls.writeCollections[0], ["autopilotSettings", "companyEvents", "reactivationCampaign"],
    "scoped write touches exactly the control's collections");
  for (const key of store.calls.writeCollections[0]) {
    assert(coreStateCollections.includes(key), `${key} is a registered collection`);
  }
  const audit = store.state.companyEvents.find((e) => e.type === "reactivation_live_mode");
  assert(audit, "gate flip is audited as a company event");
  assert(/turned ON by Roger/.test(audit.summary), audit.summary);
  // Idempotent repeat: no duplicate audit event.
  const again = await applyReactivationLiveMode(store, { enabled: true, actorLabel: "Roger", env: ENV, now: IN_WINDOW });
  assert.equal(again.changed, false);
  assert.deepEqual(store.calls.writeCollections[1], ["autopilotSettings", "reactivationCampaign"], "unchanged flip writes no event");
  ok("enabling live mode sends nothing and uses scoped writes only (no full-state writeState)");
}

// ---- 2. Heartbeat OUTSIDE the window sends zero ------------------------------------------------
{
  const spy = makeSendSpy();
  const outreachSpy = makeOutreachSpy();
  const store = memStore(setReactivationLiveMode(baseState(), { enabled: true }).state);
  const res = await runHeartbeat({ store, registry: registryWith(spy, outreachSpy), env: ENV, now: OUT_WINDOW });
  assert.equal(res.ok, true);
  assert.equal(spy.calls.length, 0, "no send attempts outside the window");
  assert.equal(store.state.reactivationAttempts.length, 0);
  const status = buildReactivationLiveStatus(store.state, { env: ENV, now: OUT_WINDOW });
  assert.equal(status.statusCopy, REACTIVATION_STATUS_COPY.outsideWindow);
  assert.equal(status.withinWindow, false);
  ok("armed outside 8am–5pm ET: zero sends, status 'Paused — outside send window.'");
}

// ---- 3 + 5 + 6. Heartbeat INSIDE the window sends up to perTickMax; B2 + waves untouched -------
{
  const spy = makeSendSpy();
  const outreachSpy = makeOutreachSpy();
  const store = memStore(setReactivationLiveMode(baseState(160), { enabled: true }).state);
  const res = await runHeartbeat({ store, registry: registryWith(spy, outreachSpy), env: ENV, now: IN_WINDOW });
  assert.equal(res.ok, true);
  const cap = DEFAULT_REACTIVATION_CONFIG.caps.perTickMax;
  assert.equal(spy.calls.length, cap, `exactly perTickMax (${cap}) sends for 160 due contacts`);
  assert(spy.calls.every((c) => c.status === "live"), "every attempt passed the REAL live decision");
  const sent = store.state.reactivationAttempts.filter((a) => a.status === "sent");
  assert.equal(sent.length, cap, "attempts recorded as sent");
  assert(sent.every((a) => [1, 2].includes(Number(a.wave))), "sends only from released waves 1 and 2");
  // Waves 3 and 4 stay unreleased; campaign untouched beyond attempts.
  assert.deepEqual(reactivationCampaignOf(store.state).releasedWaves, [1, 2], "waves 3/4 NOT released");
  // B2 outreach: off, unaffected, zero sends.
  assert.equal(outreachSpy.calls.length, 0, "B2 outreach sent nothing");
  assert.equal(autopilotEnabled(store.state, OUTREACH_ENGINE_ID, ENV), false, "B2 autopilot still off");
  const outreachResult = res.engines.find((e) => e.engineId === OUTREACH_ENGINE_ID);
  assert.equal(outreachResult.acted, false, "B2 act() never ran");
  const status = buildReactivationLiveStatus(store.state, { env: ENV, now: IN_WINDOW });
  assert.equal(status.statusCopy, REACTIVATION_STATUS_COPY.running);
  assert.equal(status.lastSendAttemptAt, store.state.reactivationAttempts.map((a) => a.created_at).sort().slice(-1)[0]);
  assert(status.lastHeartbeatAt, "lastHeartbeatAt populated from heartbeatRuns");
  ok("in-window heartbeat sends eligible contacts capped at perTickMax; B2 off; waves 3/4 unreleased");
}

// ---- 4. Threshold trip stops sending -----------------------------------------------------------
{
  const spy = makeSendSpy();
  const outreachSpy = makeOutreachSpy();
  const tripped = setReactivationLiveMode(baseState(20), { enabled: true }).state;
  tripped.reactivationAttempts = Array.from({ length: 300 }, (_, i) => ({
    id: `a${i}`, contact_id: `react-live-${i % 20}`, status: "sent",
    sent_date: "2026-06-30", created_at: "2026-06-30T15:00:00Z", to: `person${i % 20}@gmail.com`
  }));
  tripped.reactivationEvents = Array.from({ length: 7 }, (_, i) => ({
    id: `e${i}`, contact_id: `react-live-${i}`, email: `person${i}@gmail.com`, type: "bounce", created_at: "2026-06-30T16:00:00Z"
  }));
  assert.equal(evaluateThresholds(tripped).tripped, true, "fixture trips the hard-bounce threshold");
  const store = memStore(tripped);
  await runHeartbeat({ store, registry: registryWith(spy, outreachSpy), env: ENV, now: IN_WINDOW });
  assert.equal(spy.calls.length, 0, "zero send attempts after a threshold trip");
  assert.equal(store.state.reactivationAttempts.length, 300, "no new attempts");
  assert.equal(reactivationCampaignOf(store.state).status, "paused", "campaign auto-paused");
  const status = buildReactivationLiveStatus(store.state, { env: ENV, now: IN_WINDOW });
  assert.equal(status.statusCopy, REACTIVATION_STATUS_COPY.stoppedThreshold);
  assert.equal(status.thresholdTripped, true);
  assert(status.hardBounceRate >= 0.02, "hardBounceRate exposed");
  ok("threshold trip: campaign auto-pauses, zero sends, status 'Stopped by safety threshold.'");
}

// ---- 7. Disabling live mode prevents future heartbeat sends ------------------------------------
{
  const spy = makeSendSpy();
  const outreachSpy = makeOutreachSpy();
  const store = memStore(setReactivationLiveMode(baseState(10), { enabled: true }).state);
  await applyReactivationLiveMode(store, { enabled: false, actorLabel: "Roger", env: ENV, now: IN_WINDOW });
  assert.equal(reactivationLiveModeEnabled(store.state), false);
  const res = await runHeartbeat({ store, registry: registryWith(spy, outreachSpy), env: ENV, now: IN_WINDOW_2 });
  assert.equal(spy.calls.length, 0, "no send attempts after disarm");
  assert.equal(store.state.reactivationAttempts.length, 0);
  const engineResult = res.engines.find((e) => e.engineId === REACTIVATION_ENGINE_ID);
  assert.equal(engineResult.acted, false, "act() never ran with live mode off");
  const status = buildReactivationLiveStatus(store.state, { env: ENV, now: IN_WINDOW_2 });
  assert.equal(status.statusCopy, REACTIVATION_STATUS_COPY.off);
  const auditOff = store.state.companyEvents.find((e) => e.type === "reactivation_live_mode" && /turned OFF/.test(e.summary));
  assert(auditOff, "disarm is audited");
  ok("disabling live mode prevents future heartbeat sends and is audited");
}

// ---- Safety posture reflects live mode ---------------------------------------------------------
{
  const on = setReactivationLiveMode(baseState(), { enabled: true }).state;
  const postureOn = buildSafetyPosture({ state: on, env: {} });
  assert.equal(postureOn.email.reactivation.liveMode, true);
  assert.equal(postureOn.email.reactivation.liveSendFlag, true, "posture reflects the FULL authority");
  assert.equal(postureOn.email.reactivation.liveSendEnvFlag, false, "env flag itself stays off");
  assert.equal(postureOn.email.reactivation.posture, "live", "live mode + autopilot => LIVE, loudly");
  assert.deepEqual(postureOn.email.liveEngines, [REACTIVATION_ENGINE_ID]);
  assert.equal(postureOn.email.outreach.posture, "off", "B2 posture unaffected");
  const postureOff = buildSafetyPosture({ state: baseState(), env: {} });
  assert.equal(postureOff.email.posture, "off");
  assert.equal(postureOff.email.reactivation.liveSendFlag, false);
  ok("safety posture reports live mode honestly (no comforting env-only 'off')");
}

// ---- 9. Prod commit gate: exact / ahead-with-ancestor / behind / unknown -----------------------
{
  const REQUIRED = "7b38eae7cf02bbb79c9f32405a2c646544c7f43a";
  const AHEAD = "0c6c0fca9ed666f1c04418428821e9d73d07f1cb";
  const ancestry = (a, b) => a === REQUIRED && b === AHEAD; // AHEAD contains REQUIRED
  assert.equal(evaluateCommitGate({ prodCommit: REQUIRED, requiredCommit: REQUIRED }).ok, true, "exact match passes");
  const ahead = evaluateCommitGate({ prodCommit: AHEAD, requiredCommit: REQUIRED, isAncestor: ancestry });
  assert.equal(ahead.ok, true, "prod ahead of the pinned safety commit passes");
  assert.equal(ahead.mode, "ancestor");
  assert.equal(evaluateCommitGate({ prodCommit: AHEAD, requiredCommit: REQUIRED, approvedCommits: [AHEAD] }).ok, true,
    "explicitly approved commit passes without ancestry");
  assert.equal(evaluateCommitGate({ prodCommit: "deadbeef", requiredCommit: REQUIRED, isAncestor: () => false }).ok, false,
    "unrelated commit fails");
  assert.equal(evaluateCommitGate({ prodCommit: REQUIRED, requiredCommit: AHEAD, isAncestor: ancestry }).ok, false,
    "prod BEHIND the required commit fails (ancestry is directional)");
  assert.equal(evaluateCommitGate({ prodCommit: "unknown", requiredCommit: REQUIRED }).ok, false, "unknown prod commit fails");
  assert.equal(evaluateCommitGate({ prodCommit: "", requiredCommit: REQUIRED }).ok, false, "missing prod commit fails");
  assert.equal(evaluateCommitGate({ prodCommit: AHEAD, requiredCommit: REQUIRED, isAncestor: () => { throw new Error("git broke"); } }).ok, false,
    "a throwing ancestor check fails closed");
  ok("commit gate: exact and ahead-with-ancestor pass; behind, unrelated, unknown, and errors fail closed");
}

// ---- Status view exposes every required field --------------------------------------------------
{
  const status = buildReactivationLiveStatus(setReactivationLiveMode(baseState(), { enabled: true }).state, { env: ENV, now: IN_WINDOW });
  for (const key of [
    "liveMode", "reactivationAutopilotEnabled", "reactivationLiveSendEnabled", "campaignStatus",
    "releasedWaves", "thresholdTripped", "hardBounceRate", "complaints", "unsubscribes",
    "lastHeartbeatAt", "lastSendAttemptAt", "sendWindowET", "withinWindow", "statusCopy", "armed"
  ]) {
    assert(key in status, `status exposes ${key}`);
  }
  assert.equal(status.sendWindowET.startHourET, 8);
  assert.equal(status.sendWindowET.endHourET, 17);
  assert.equal(status.sendWindowET.weekdaysOnly, true);
  // Honesty edge: gates open but no SendGrid key => say so, never a comforting plain "Off"
  // while the posture endpoint reports LIVE.
  const noKey = buildReactivationLiveStatus(setReactivationLiveMode(baseState(), { enabled: true }).state, { env: {}, now: IN_WINDOW });
  assert(/no SendGrid key/.test(noKey.statusCopy), noKey.statusCopy);
  ok("live status exposes the full required field set incl. sendWindowET 8–17 ET weekdays");
}

console.log(`\nAll ${passed} reactivation live-mode checks passed.`);
