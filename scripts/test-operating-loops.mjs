// B7 — Operating Loop Registry tests. Proves the non-negotiables:
//   1. The pulse surface persists (operatingPulseSnapshots in coreStateCollections), engine ids
//      registered in HEARTBEAT_ENGINE_IDS, and self-documented in buildDataModelInventory.
//   2. READ-ONLY: every loop engine has NO act() method, and the module has no posting/send/
//      outward-write path — structural (no act key), source-scanned, and behavioral (a heartbeat
//      tick with autopilot ON performs NO act).
//   3. SCHEDULES existing loops, does NOT rewrite: the module imports the existing loop functions.
//   4. HONESTY: cash/runway reports "needs_input" with NO fabricated runway when cash/burn missing;
//      outreach reports real counts and rates as "not_computed", never a fabricated rate.
//   5. Persistence mirrors the snapshot pattern (snapshot + audit + activity), idempotent per
//      loop per date, with a trend delta vs the loop's previous run.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { runHeartbeat } from "./heartbeat.mjs";
import { buildHeartbeatRegistry, HEARTBEAT_ENGINE_IDS } from "./heartbeat-engines.mjs";
import { buildDataModelInventory } from "./state-integrity.mjs";
import {
  OPERATING_PULSE_COLLECTIONS, OPERATING_LOOP_ENGINE_IDS, LOOP_REGISTRY,
  buildAllOperatingLoopEngines, buildOperatingLoopEngine, saveOperatingPulseSnapshot
} from "./operating-loops.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// 2026-07-01 10:00Z = 06:00 ET => the daily window, so the (daily) loop engines run.
const DAILY_TICK = new Date("2026-07-01T10:00:00Z");

function makeStore(initial = {}) {
  let state = JSON.parse(JSON.stringify(initial));
  return {
    async readState() { return JSON.parse(JSON.stringify(state)); },
    async writeState(next) { state = JSON.parse(JSON.stringify(next)); return state; },
    async writeCollections(patch) { state = { ...state, ...JSON.parse(JSON.stringify(patch)) }; return state; },
    snapshot() { return JSON.parse(JSON.stringify(state)); }
  };
}

// ---- 1. surface persists + registered + self-documented --------------------
function testSurfacePersists() {
  for (const c of OPERATING_PULSE_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(c), `${c} in coreStateCollections (persists to Supabase)`);
    assert.ok(!singletonCollections.has(c), `${c} is NOT a singleton (array of snapshots)`);
  }
  assert.equal(OPERATING_LOOP_ENGINE_IDS.length, 6, "six loop engine ids");
  for (const id of OPERATING_LOOP_ENGINE_IDS) {
    assert.ok(HEARTBEAT_ENGINE_IDS.includes(id), `${id} in HEARTBEAT_ENGINE_IDS`);
  }
  assert.ok(
    buildDataModelInventory().some((s) => s.collection === "operatingPulseSnapshots"),
    "operatingPulseSnapshots documented in buildDataModelInventory()"
  );
  ok("pulse surface persists, 6 engine ids registered, surface self-documented");
}

// ---- 2a. every loop engine has NO act path (structural) --------------------
function testEnginesHaveNoActPath() {
  const engines = buildAllOperatingLoopEngines();
  assert.equal(engines.length, 6, "six engines built");
  for (const engine of engines) {
    assert.ok(engine.id.startsWith("loop-"), `${engine.id} is a loop engine`);
    assert.equal(engine.cadence, "daily", `${engine.id} cadence daily`);
    assert.equal(typeof engine.plan, "function", `${engine.id} has plan()`);
    assert.ok(!("act" in engine), `${engine.id} has NO act key (read-only by construction)`);
  }
  ok("every loop engine exposes plan() and NO act path");
}

// ---- 2b. module has NO posting/send/outward-write path ---------------------
function testModuleHasNoPostingPath() {
  const src = readFileSync(path.join(__dirname, "operating-loops.mjs"), "utf8");
  for (const banned of ["publishLinkedIn", "publishFacebook", "publishX", "graph.facebook", "api.x.com", "/v2/tweets", "sendgrid", "SendGrid", "sendMail", "writeFile", "appendFile", "child_process", "execSync", "spawn", "createWriteStream", "fetch(", "XMLHttpRequest", "node:http"]) {
    assert.ok(!src.includes(banned), `module contains no "${banned}" (read-only, no outward write)`);
  }
  for (const re of [/export\s+(?:async\s+)?function\s+act/i, /\bfunction\s+\w*(?:send|post|publish)\w*\s*\(/i]) {
    assert.ok(!re.test(src), `module defines no ${re} function`);
  }
  ok("module has NO posting / send / outward-write path");
}

// ---- 3. SCHEDULES existing loops (does NOT rewrite) ------------------------
function testWrapsExistingLoops() {
  const src = readFileSync(path.join(__dirname, "operating-loops.mjs"), "utf8");
  // It must IMPORT the existing loop functions, not reimplement them.
  for (const imp of ["buildCashRunwayPulse", "buildFounderCapacityPulse", "collectGlobalAgingItems", "partnerLifecycleInsights", "partnerProgramOverview", "saveOsHealthSnapshot"]) {
    assert.ok(new RegExp(`import[^;]*\\b${imp}\\b`).test(src), `imports existing loop fn ${imp} (no rewrite)`);
  }
  assert.equal(LOOP_REGISTRY.length, 6, "registry has six loops");
  const keys = LOOP_REGISTRY.map((d) => d.key).sort();
  assert.deepEqual(keys, ["aging", "capacity", "cash-runway", "os-health", "outreach-health", "partner-health"], "all seven-minus-flagged loops present");
  ok("schedules the EXISTING loop functions (imports them; does not rewrite)");
}

// ---- 4a. honesty: cash/runway reports needs_input, NO fabricated runway -----
async function testHonestyCashRunway() {
  // No runwayInputs => runway cannot be computed.
  const engine = LOOP_REGISTRY.find((d) => d.key === "cash-runway");
  const ran = await engine.run({}, { nowIso: "2026-07-01T10:00:00.000Z" });
  assert.equal(ran.result.status, "needs_input", "status needs_input when cash/burn missing");
  assert.equal(ran.result.data_connected, false, "data_connected false");
  assert.equal(ran.result.metrics.runway_months, null, "runway_months is null — NOT fabricated");
  assert.ok(/not computed/i.test(ran.result.headline), "headline states runway not computed");
  ok("honesty: cash/runway reports needs_input with NO fabricated runway number");
}

// ---- 4b. honesty: outreach reports real counts, rates NOT fabricated -------
async function testHonestyOutreachRates() {
  const engine = LOOP_REGISTRY.find((d) => d.key === "outreach-health");
  const state = { outreachAttempts: [{ status: "sent" }, { status: "dry_run" }], outreachBounces: [{ id: "b1" }] };
  const ran = await engine.run(state, { nowIso: "2026-07-01T10:00:00.000Z" });
  assert.equal(ran.result.metrics.sent, 1, "real sent count");
  assert.equal(ran.result.metrics.bounces, 1, "real bounce count");
  assert.equal(ran.result.metrics.bounce_rate, "not_computed", "bounce RATE not fabricated");
  assert.equal(ran.result.metrics.reply_rate, "not_computed", "reply RATE not fabricated");
  ok("honesty: outreach reports real counts; rates are 'not_computed', never fabricated");
}

// ---- 5. persistence pattern, idempotent per loop per date, with delta ------
function testPersistencePattern() {
  const descriptor = LOOP_REGISTRY.find((d) => d.key === "capacity");
  const result1 = { status: "reporting", data_connected: true, headline: "5 need you", metrics: { items_needing_operator: 5 }, trend: { key: "items_needing_operator", value: 5 } };
  const r1 = saveOperatingPulseSnapshot({}, descriptor, result1, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(r1.state.operatingPulseSnapshots.length, 1, "snapshot written");
  assert.equal(r1.state.auditHistory.length, 1, "audit entry appended");
  assert.equal(r1.state.activityEvents.length, 1, "activity entry appended");
  assert.equal(r1.state.activityEvents[0].metadata.outwardWrites, false, "activity records no outward writes");
  assert.equal(r1.snapshot.delta.value, null, "first run has no delta");

  // Next-day run computes a delta vs the prior snapshot.
  const result2 = { status: "reporting", data_connected: true, headline: "8 need you", metrics: { items_needing_operator: 8 }, trend: { key: "items_needing_operator", value: 8 } };
  const r2 = saveOperatingPulseSnapshot(r1.state, descriptor, result2, { now: "2026-07-02T10:00:00.000Z" });
  assert.equal(r2.snapshot.delta.value, 3, "delta 5 -> 8 = +3");
  assert.equal(r2.snapshot.delta.since, r1.snapshot.id, "delta references prior snapshot");

  // Same-date re-run is idempotent (replaces, not appends).
  const r3 = saveOperatingPulseSnapshot(r2.state, descriptor, result2, { now: "2026-07-02T23:00:00.000Z" });
  const sameDate = r3.state.operatingPulseSnapshots.filter((s) => s.id === r2.snapshot.id);
  assert.equal(sameDate.length, 1, "same loop+date snapshot replaced (idempotent)");
  ok("persistence mirrors snapshot pattern; idempotent per loop/date; delta vs last run");
}

// ---- 6. integration: autopilot ON still performs NO act -------------------
async function testAutopilotOnStillNoAct() {
  const enabled = {};
  for (const id of OPERATING_LOOP_ENGINE_IDS) enabled[id] = { enabled: true };
  const store = makeStore({ autopilotSettings: enabled });
  const registry = buildHeartbeatRegistry();
  const res = await runHeartbeat({ store, registry, env: {}, now: DAILY_TICK, force: true });
  let checked = 0;
  for (const id of OPERATING_LOOP_ENGINE_IDS) {
    const run = res.engines.find((e) => e.engineId === id);
    assert.ok(run, `${id} ran`);
    assert.equal(run.status, "success", `${id} plan succeeded`);
    assert.equal(run.acted, false, `${id} acted is FALSE even with autopilot ON`);
    assert.equal(run.resultsCount, 0, `${id} produced no act results`);
    checked += 1;
  }
  assert.equal(checked, 6, "all six loops checked");
  const snaps = store.snapshot().operatingPulseSnapshots || [];
  assert.ok(snaps.length >= 5, "loops wrote pulse snapshots (5 to the shared collection)");
  assert.ok((store.snapshot().osHealthSnapshots || []).length >= 1, "os-health loop wrote an os-health snapshot");
  ok("autopilot ON: all loops plan & report, but NO act happens (read-only, structural)");
}

// ---- 7. integration: autopilot OFF (default) still plans + reports ---------
async function testAutopilotOffStillPlans() {
  const store = makeStore({});
  const registry = buildHeartbeatRegistry();
  const res = await runHeartbeat({ store, registry, env: {}, now: DAILY_TICK, force: true });
  const run = res.engines.find((e) => e.engineId === "loop-cash-runway");
  assert.equal(run.autopilot, false, "autopilot OFF by default");
  assert.equal(run.acted, false, "no act with autopilot OFF");
  assert.ok(run.observationsCount >= 1, "plan emitted observations");
  ok("autopilot OFF (default): loops still observe and report");
}

async function main() {
  console.log("B7 operating-loop registry — tests");
  testSurfacePersists();
  testEnginesHaveNoActPath();
  testModuleHasNoPostingPath();
  testWrapsExistingLoops();
  await testHonestyCashRunway();
  await testHonestyOutreachRates();
  testPersistencePattern();
  await testAutopilotOnStillNoAct();
  await testAutopilotOffStillPlans();
  console.log(`\n${passed} checks passed.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
