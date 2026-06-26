// B1 heartbeat tests. Proves the non-negotiables:
//  1. All autopilot toggles default OFF -> heartbeat fires, every engine plan()s and
//     writes proposals, ZERO act() calls / external side effects.
//  2. Double-run defense: replayed tick is a no-op; overlapping tick doesn't double-run;
//     lease guards cross-restart.
//  3. heartbeatRuns/heartbeatLease/autopilotSettings persist (in coreStateCollections).
//  4. Autopilot is an OUTER gate: when ON, the engine's own inner gate still decides.

import assert from "node:assert";
import {
  runHeartbeat, etParts, autopilotEnabled, alreadyRanBucket, _isTickInFlight
} from "./heartbeat.mjs";
import { coreStateCollections } from "./storage.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// ---- helpers -------------------------------------------------------------
function makeStore(initial = {}) {
  let state = JSON.parse(JSON.stringify(initial));
  return {
    writes: 0,
    async readState() { return JSON.parse(JSON.stringify(state)); },
    async writeState(next) { state = JSON.parse(JSON.stringify(next)); this.writes += 1; return state; },
    snapshot() { return JSON.parse(JSON.stringify(state)); }
  };
}

// A fake engine with spies. plan() records a proposal in state; act() records an
// external side effect into `sideEffects` (the stand-in for emails/posts/etc).
function makeEngine({ id = "test-engine", cadence = "hourly", innerGate = null } = {}) {
  const sideEffects = [];
  const e = {
    id, cadence, planCalls: 0, actCalls: 0, sideEffects,
    plan(state) {
      e.planCalls += 1;
      const proposals = [...(state.testProposals || []), { id: `${id}-prop-${e.planCalls}`, engine: id }];
      return { state: { ...state, testProposals: proposals }, proposals: [{ id: `${id}-prop-${e.planCalls}` }] };
    },
    act(state) {
      e.actCalls += 1;
      // Inner gate (e.g. live-posting gate / approval). If present and closed, act
      // performs NO external side effect even though autopilot let it run.
      if (innerGate && !innerGate(state)) {
        return { state, results: [] };
      }
      sideEffects.push({ engine: id, at: e.actCalls });
      return { state: { ...state, [`${id}_acted`]: true }, results: [{ ok: true }] };
    }
  };
  return e;
}

const HOURLY_NOW = new Date("2026-07-01T15:00:00Z"); // 11:00 ET (EDT), hourly window open

// ---- 1. toggles OFF = nothing acts ---------------------------------------
async function testTogglesOffNothingActs() {
  const store = makeStore({});
  const engine = makeEngine({ id: "test-engine" });
  const res = await runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW });

  assert.equal(res.ok, true, "tick ok");
  assert.equal(engine.planCalls, 1, "plan() ran exactly once");
  assert.equal(engine.actCalls, 0, "act() was NEVER called with toggle off");
  assert.equal(engine.sideEffects.length, 0, "zero external side effects");
  const er = res.engines[0];
  assert.equal(er.status, "success");
  assert.equal(er.autopilot, false, "autopilot resolved OFF by default");
  assert.equal(er.acted, false, "engine did not act");

  const snap = store.snapshot();
  assert.ok((snap.testProposals || []).length === 1, "plan() proposal was written to state");
  assert.equal(snap.heartbeatLease, null, "lease released after tick");
  assert.ok((snap.heartbeatRuns || []).some(r => r.engineId === "test-engine" && r.status === "success"), "ledger recorded");
  ok("toggles off: heartbeat fires, plan() writes proposals, ZERO act()/side effects");
}

// ---- 2. toggle ON = act() runs (the gate works both ways) ----------------
async function testToggleOnActs() {
  const store = makeStore({ autopilotSettings: { "test-engine": { enabled: true } } });
  const engine = makeEngine({ id: "test-engine" });
  const res = await runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW });
  assert.equal(engine.actCalls, 1, "act() ran with toggle on");
  assert.equal(engine.sideEffects.length, 1, "one external side effect");
  assert.equal(res.engines[0].acted, true);
  assert.equal(res.engines[0].autopilot, true);
  ok("toggle on: act() runs (gate opens correctly)");
}

// ---- 3. idempotency: replayed tick is a no-op ----------------------------
async function testReplayedTickIsNoop() {
  const store = makeStore({});
  const engine = makeEngine({ id: "test-engine" });
  const first = await runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW });
  assert.equal(first.engines[0].status, "success");
  assert.equal(engine.planCalls, 1);

  // Same ET period -> same bucket -> must be skipped, no re-plan, no re-act.
  const second = await runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW });
  assert.equal(second.engines[0].status, "skipped", "replay skipped");
  assert.equal(second.engines[0].reason, "already_ran");
  assert.equal(engine.planCalls, 1, "plan() not called again on replay");
  assert.equal(engine.actCalls, 0, "act() not called on replay");
  ok("replayed tick is a no-op (idempotency ledger)");
}

// ---- 4. mutex: overlapping ticks don't double-run ------------------------
async function testOverlappingTickMutex() {
  // Slow store read holds the first tick in-flight while the second starts.
  let state = { };
  let firstReadStarted;
  const firstReadGate = new Promise(r => { firstReadStarted = r; });
  let reads = 0;
  const store = {
    writes: 0,
    async readState() {
      reads += 1;
      if (reads === 1) { firstReadStarted(); await new Promise(r => setTimeout(r, 30)); }
      return JSON.parse(JSON.stringify(state));
    },
    async writeState(next) { state = JSON.parse(JSON.stringify(next)); this.writes += 1; }
  };
  const engine = makeEngine({ id: "test-engine" });
  const p1 = runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW, runId: "run-1" });
  await firstReadGate; // ensure run-1 is in-flight (mutex set) before starting run-2
  const p2 = runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW, runId: "run-2" });
  const [r1, r2] = await Promise.all([p1, p2]);

  const skipped = [r1, r2].filter(r => r.skipped === "in_progress");
  const ran = [r1, r2].filter(r => !r.skipped);
  assert.equal(skipped.length, 1, "exactly one tick was skipped as in_progress");
  assert.equal(ran.length, 1, "exactly one tick actually ran");
  assert.equal(engine.planCalls, 1, "engine planned exactly once (no double-run)");
  assert.equal(_isTickInFlight(), false, "mutex released after completion");
  ok("overlapping tick doesn't double-run (in-process mutex)");
}

// ---- 5. lease guard ------------------------------------------------------
async function testLeaseGuard() {
  const future = new Date(HOURLY_NOW.getTime() + 60_000).toISOString();
  const past = new Date(HOURLY_NOW.getTime() - 60_000).toISOString();

  // Foreign, non-expired lease -> skip.
  let store = makeStore({ heartbeatLease: { runId: "other", expiresAt: future } });
  let engine = makeEngine();
  let res = await runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW, runId: "mine" });
  assert.equal(res.skipped, "leased", "non-expired foreign lease blocks the tick");
  assert.equal(engine.planCalls, 0, "no engine ran while leased");

  // Expired lease -> proceed.
  store = makeStore({ heartbeatLease: { runId: "other", expiresAt: past } });
  engine = makeEngine();
  res = await runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW, runId: "mine" });
  assert.ok(!res.skipped, "expired lease lets the tick proceed");
  assert.equal(engine.planCalls, 1);

  // force overrides an active foreign lease.
  store = makeStore({ heartbeatLease: { runId: "other", expiresAt: future } });
  engine = makeEngine();
  res = await runHeartbeat({ store, registry: [engine], env: {}, now: HOURLY_NOW, runId: "mine", force: true });
  assert.ok(!res.skipped, "force overrides an active lease");
  ok("lease guard: foreign lease blocks, expiry recovers, force overrides");
}

// ---- 6. ET/DST daily due logic -------------------------------------------
async function testDailyDueAndDst() {
  // DST correctness: 6am ET maps to 10:00 UTC in summer (EDT) and 11:00 UTC in winter (EST).
  assert.equal(etParts(new Date("2026-07-01T10:00:00Z")).hour, 6, "6am EDT (summer)");
  assert.equal(etParts(new Date("2026-01-15T11:00:00Z")).hour, 6, "6am EST (winter)");
  assert.equal(etParts(new Date("2026-07-01T09:00:00Z")).hour, 5, "5am EDT");

  const dailyAt6 = makeEngine({ id: "daily-engine", cadence: "daily" });
  let store = makeStore({});
  let res = await runHeartbeat({ store, registry: [dailyAt6], env: {}, now: new Date("2026-07-01T10:00:00Z") });
  assert.equal(res.engines[0].status, "success", "daily engine runs at 6am ET");
  assert.equal(dailyAt6.planCalls, 1);

  const dailyOffHour = makeEngine({ id: "daily-engine", cadence: "daily" });
  store = makeStore({});
  res = await runHeartbeat({ store, registry: [dailyOffHour], env: {}, now: new Date("2026-07-01T09:00:00Z") });
  assert.equal(res.engines[0].status, "skipped", "daily engine skipped off-hour");
  assert.equal(res.engines[0].reason, "window_closed");
  assert.equal(dailyOffHour.planCalls, 0, "daily engine did not plan off-hour");

  // Winter 6am ET (11:00 UTC) also fires -> DST handled.
  const dailyWinter = makeEngine({ id: "daily-engine", cadence: "daily" });
  store = makeStore({});
  res = await runHeartbeat({ store, registry: [dailyWinter], env: {}, now: new Date("2026-01-15T11:00:00Z") });
  assert.equal(res.engines[0].status, "success", "daily engine fires at 6am EST too (DST-correct)");
  ok("ET/DST daily due logic (6am ET fires in both EDT and EST; off-hour skips)");
}

// ---- 7. autopilot is an OUTER gate; inner gates still apply ---------------
async function testAutopilotIsOuterGate() {
  // Autopilot ON, but the engine's inner gate is CLOSED -> act() is invoked but produces
  // NO external side effect. Proves autopilot doesn't bypass existing safety gates.
  const closed = makeEngine({ id: "gated-engine", innerGate: () => false });
  let store = makeStore({ autopilotSettings: { "gated-engine": { enabled: true } } });
  let res = await runHeartbeat({ store, registry: [closed], env: {}, now: HOURLY_NOW });
  assert.equal(closed.actCalls, 1, "autopilot opened the outer gate (act called)");
  assert.equal(closed.sideEffects.length, 0, "inner gate still blocked the side effect");
  assert.equal(res.engines[0].acted, true);

  // Inner gate OPEN -> side effect happens.
  const open = makeEngine({ id: "gated-engine", innerGate: () => true });
  store = makeStore({ autopilotSettings: { "gated-engine": { enabled: true } } });
  await runHeartbeat({ store, registry: [open], env: {}, now: HOURLY_NOW });
  assert.equal(open.sideEffects.length, 1, "side effect only when BOTH gates open");
  ok("autopilot is an OUTER gate; inner (live/approval) gates still decide");
}

// ---- 8. collections persist (non-negotiable #3) --------------------------
async function testCollectionsRegistered() {
  for (const c of ["heartbeatRuns", "heartbeatLease", "autopilotSettings"]) {
    assert.ok(coreStateCollections.includes(c), `${c} is in coreStateCollections (persists to Supabase)`);
  }
  ok("heartbeatRuns/heartbeatLease/autopilotSettings are in coreStateCollections");
}

// ---- resolution helper sanity --------------------------------------------
async function testAutopilotResolution() {
  assert.equal(autopilotEnabled({}, "x", {}), false, "default OFF (no setting, no env)");
  assert.equal(autopilotEnabled({ autopilotSettings: { x: { enabled: true } } }, "x", {}), true, "persisted wins");
  assert.equal(autopilotEnabled({}, "autonomy-cycle", { AUTOPILOT_AUTONOMY_CYCLE: "true" }), true, "env seed");
  assert.equal(autopilotEnabled({ autopilotSettings: { x: { enabled: false } } }, "x", { AUTOPILOT_X: "true" }), false, "persisted overrides env");
  ok("autopilot resolution: default OFF, persisted > env > default");
}

async function main() {
  console.log("Heartbeat (B1) tests:");
  await testTogglesOffNothingActs();
  await testToggleOnActs();
  await testReplayedTickIsNoop();
  await testOverlappingTickMutex();
  await testLeaseGuard();
  await testDailyDueAndDst();
  await testAutopilotIsOuterGate();
  await testCollectionsRegistered();
  await testAutopilotResolution();
  console.log(`\nAll ${passed} heartbeat assertions passed.`);
}

main().catch((error) => { console.error("\nHEARTBEAT TEST FAILED:\n", error); process.exit(1); });
