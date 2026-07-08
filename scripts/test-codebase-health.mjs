// B3 — Codebase-Health Monitor tests. Proves the non-negotiables:
//   1. The findings surface persists (membership in coreStateCollections).
//   2. The engine is plan()-ONLY: it has NO act() method — "never modifies the app" is
//      structural, not a toggle. Proven three ways: the descriptor exposes no act path; the
//      module exports no act/send/mutate function; and a full heartbeat tick with autopilot ON
//      still performs NO act (acted === false) and does not throw.
//   3. The module has NO source-file WRITE path (read-only by construction).
//   4. Honesty rule: findings come only from real, deterministic file observations; on a scan
//      error the report carries the error and ZERO fabricated findings.
//   5. Real findings are detected from a controlled fixture tree (registration drift, dead code,
//      duplicate export, unreferenced test) and are severity-ranked.
//   6. Deltas since the last run (new / resolved findings) are computed correctly.
//   7. Persistence mirrors the data-integrity snapshot pattern (snapshot + audit + activity),
//      idempotent per date.

import assert from "node:assert";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { runHeartbeat } from "./heartbeat.mjs";
import { buildHeartbeatRegistry, HEARTBEAT_ENGINE_IDS } from "./heartbeat-engines.mjs";
import { buildDataModelInventory } from "./state-integrity.mjs";
import {
  CODEBASE_HEALTH_COLLECTIONS, CODEBASE_HEALTH_ENGINE_ID, SEVERITY,
  scanCodebaseHealth, buildCodebaseHealthSnapshot, saveCodebaseHealthSnapshot,
  planCodebaseHealth, buildCodebaseHealthEngine
} from "./codebase-health.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// 2026-07-01 10:00Z = 06:00 ET (EDT) => the daily-engine window (6am ET), so B3 (cadence daily) runs.
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

// Build a hermetic fixture source tree so finding detection is deterministic and independent of
// the real repo. NOTE: registration-drift uses the REAL coreStateCollections (imported by the
// scanner), so a fixture collection name not registered there is a genuine drift signal.
function makeFixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "b3-fixture-"));
  const write = (name, content) => writeFileSync(path.join(dir, name), content);
  write("hub.mjs", "export function shared() { return 1; }\n");
  write("leaf.mjs", "import { shared } from './hub.mjs';\nexport const x = shared();\n");
  write("orphan.mjs", "// imported by nobody, referenced by no script\nexport const dead = true;\n");
  write("dup-a.mjs", "export const sharedThing = 1;\n");
  write("dup-b.mjs", "export const sharedThing = 2;\n");
  write("drift.mjs", 'export const FIXTURE_COLLECTIONS = ["definitelyNotRegisteredXYZ"];\n');
  write("test-wired.mjs", "// a test that IS referenced by package.json\nimport './hub.mjs';\n");
  write("test-unwired.mjs", "// a test that NO script references\nimport './hub.mjs';\n");
  // A doc-comment containing example code that MUST NOT be matched (comment-stripping check).
  write("commented.mjs", '// example: export const FAKE_COLLECTIONS = ["ghostCollection"];\nimport "./hub.mjs";\nexport const real = 1;\n');
  const pkg = { scripts: { test: "node scripts/test-wired.mjs", build: "node scripts/leaf.mjs" } };
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  return { dir, packageJsonPath: path.join(dir, "package.json") };
}

// ---- 1. surface persists --------------------------------------------------
function testCollectionsPersist() {
  for (const c of CODEBASE_HEALTH_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(c), `${c} in coreStateCollections (persists to Supabase)`);
  }
  // Not a singleton — snapshots are an array.
  for (const c of CODEBASE_HEALTH_COLLECTIONS) {
    assert.ok(!singletonCollections.has(c), `${c} is NOT a singleton (array of snapshots)`);
  }
  // The engine id is registered so its autopilot toggle surfaces.
  assert.ok(HEARTBEAT_ENGINE_IDS.includes(CODEBASE_HEALTH_ENGINE_ID), "engine id in HEARTBEAT_ENGINE_IDS");
  // B3 documents its OWN surface in the data-model inventory (so it isn't itself undocumented).
  assert.ok(
    buildDataModelInventory().some((s) => s.collection === "codebaseHealthSnapshots"),
    "codebaseHealthSnapshots is documented in buildDataModelInventory()"
  );
  ok("findings surface persists, engine id registered, surface self-documented");
}

// ---- 2. NO act path — structural ------------------------------------------
function testEngineHasNoActPath() {
  const engine = buildCodebaseHealthEngine();
  assert.equal(engine.id, CODEBASE_HEALTH_ENGINE_ID, "engine id");
  assert.equal(engine.cadence, "daily", "cadence daily");
  assert.equal(typeof engine.plan, "function", "has plan()");
  // The core proof: there is NO act path on the descriptor — not a no-op act, but NONE.
  assert.equal(engine.act, undefined, "engine.act is undefined");
  assert.equal(typeof engine.act, "undefined", "typeof engine.act === undefined");
  assert.ok(!Object.prototype.hasOwnProperty.call(engine, "act"), "descriptor has no 'act' key at all");
  assert.ok(!("act" in engine), "no 'act' anywhere in the descriptor chain");
  ok("engine descriptor exposes NO act path (structural)");
}

// ---- 2b/3. module exports no mutate/send/act fn AND no file-write path -----
function testModuleHasNoMutationPath() {
  const src = readFileSync(path.join(__dirname, "codebase-health.mjs"), "utf8");
  // No act/send/mutate/write-style exported function.
  for (const banned of [/export\s+(?:async\s+)?function\s+act/i, /export\s+(?:async\s+)?function\s+\w*send/i, /export\s+(?:async\s+)?function\s+\w*(?:delete|remove|merge|refactor|fix|rewrite)/i]) {
    assert.ok(!banned.test(src), `module exports no ${banned} function`);
  }
  // Read-only: no filesystem WRITE / process-exec primitives anywhere in the module.
  // (".exec(" is excluded — that is RegExp.prototype.exec, the scanner's parsing primitive.)
  for (const banned of ["writeFile", "appendFile", "unlinkSync", "unlink(", "rmdir", "rmSync", "renameSync", "rename(", "mkdir", "createWriteStream", "execSync", "execFile", "spawn", "child_process"]) {
    assert.ok(!src.includes(banned), `module contains no "${banned}" (read-only, cannot modify the app)`);
  }
  // It DOES only read.
  assert.ok(/readFile|readdir/.test(src), "module reads files (readFile/readdir) — read-only audit");
  ok("module has NO mutation / file-write / exec path (read-only by construction)");
}

// ---- 4. honesty: no fabrication on scan error -----------------------------
async function testHonestyOnScanError() {
  const scan = await scanCodebaseHealth({ scriptsDir: path.join(os.tmpdir(), "b3-does-not-exist-zzz"), packageJsonPath: "/nope.json" });
  assert.ok(scan.scan_error, "scan_error is set on unreadable dir");
  assert.deepEqual(scan.findings, [], "ZERO findings fabricated on scan error");
  const snap = buildCodebaseHealthSnapshot({}, scan, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(snap.status, "scan_error", "snapshot status reflects scan error");
  assert.equal(snap.findings.length, 0, "snapshot carries no fabricated findings");
  ok("honesty rule: scan error => error reported, zero findings fabricated");
}

// ---- 5. real findings from a controlled fixture + severity ranking --------
async function testRealFindingsFromFixture() {
  const { dir, packageJsonPath } = makeFixture();
  try {
    const scan = await scanCodebaseHealth({ scriptsDir: dir, packageJsonPath });
    assert.equal(scan.scan_error, null, "fixture scanned without error");
    const keys = new Set(scan.findings.map((f) => f.key));
    const byKey = new Map(scan.findings.map((f) => [f.key, f]));

    // (a) registration drift — fixture collection not in the REAL coreStateCollections.
    const driftKey = "collection_registration_drift:drift.mjs#definitelyNotRegisteredXYZ";
    assert.ok(keys.has(driftKey), "detects collection-registration drift");
    assert.equal(byKey.get(driftKey).severity, SEVERITY.WOULD_BREAK_PROD, "drift is would_break_prod");

    // (b) dead/orphaned module.
    assert.ok(keys.has("orphaned_module:orphan.mjs"), "detects orphaned module");
    assert.equal(byKey.get("orphaned_module:orphan.mjs").severity, SEVERITY.ACCUMULATING_RISK, "orphan is accumulating_risk");

    // (c) duplicate exported symbol across modules.
    assert.ok(keys.has("duplicate_export:sharedThing"), "detects duplicate export");
    assert.equal(byKey.get("duplicate_export:sharedThing").severity, SEVERITY.COSMETIC, "duplicate export is cosmetic");

    // (d) unreferenced test (CI gap) — but the wired test is NOT flagged.
    assert.ok(keys.has("unreferenced_test_file:test-unwired.mjs"), "detects unreferenced test (CI gap)");
    assert.ok(!keys.has("unreferenced_test_file:test-wired.mjs"), "does NOT flag a referenced test");

    // (e) HONESTY: example code inside a comment must NOT produce findings.
    assert.ok(!keys.has("collection_registration_drift:commented.mjs#ghostCollection"), "ignores example code in comments (no false positive)");
    assert.ok(![...keys].some((k) => k.includes("ghostCollection")), "no finding references commented-out collection");

    // severity vocabulary + ranking (would_break_prod first, cosmetic last).
    const rank = { would_break_prod: 3, accumulating_risk: 2, cosmetic: 1 };
    for (const f of scan.findings) assert.ok(rank[f.severity], `finding severity "${f.severity}" is a valid tier`);
    for (let i = 1; i < scan.findings.length; i += 1) {
      assert.ok(rank[scan.findings[i - 1].severity] >= rank[scan.findings[i].severity], "findings sorted by severity desc");
    }
    ok("detects real findings from fixture (drift/dead/dup/CI-gap), severity-ranked, no comment FPs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 6. deltas since last run --------------------------------------------
function testDeltas() {
  const mk = (sev, cat, ref) => ({ severity: sev, category: cat, area: "x", message: `${cat} ${ref}`, ref, key: `${cat}:${ref}` });
  const A = mk(SEVERITY.ACCUMULATING_RISK, "orphaned_module", "a.mjs");   // resolves
  const B = mk(SEVERITY.ACCUMULATING_RISK, "orphaned_module", "b.mjs");   // persists
  const C = mk(SEVERITY.WOULD_BREAK_PROD, "collection_registration_drift", "c.mjs#z"); // new

  const first = buildCodebaseHealthSnapshot({}, { findings: [A, B], scanned: {} }, { now: "2026-06-30T10:00:00.000Z" });
  assert.equal(first.deltas.since, null, "first run has no prior snapshot");
  assert.equal(first.deltas.new_count, 2, "first run: all findings are new");

  const stateWithFirst = { codebaseHealthSnapshots: [first] };
  const second = buildCodebaseHealthSnapshot(stateWithFirst, { findings: [B, C], scanned: {} }, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(second.deltas.since, first.id, "delta references the prior snapshot");
  const newKeys = second.deltas.new.map((f) => f.key);
  const resolvedKeys = second.deltas.resolved.map((f) => f.key);
  assert.deepEqual(newKeys, ["collection_registration_drift:c.mjs#z"], "new finding detected (C)");
  assert.deepEqual(resolvedKeys, ["orphaned_module:a.mjs"], "resolved finding detected (A)");
  assert.equal(second.deltas.new_would_break_prod, 1, "new would-break-prod delta counted");
  ok("deltas since last run: new + resolved findings computed correctly");
}

// ---- 7. persistence pattern (snapshot + audit + activity), idempotent -----
function testPersistencePattern() {
  const scan = { findings: [{ severity: SEVERITY.COSMETIC, category: "duplicate_export", area: "duplication", message: "dup", ref: "z", key: "duplicate_export:z" }], scanned: {} };
  const r1 = saveCodebaseHealthSnapshot({}, scan, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(r1.state.codebaseHealthSnapshots.length, 1, "snapshot written to surface");
  assert.equal(r1.state.auditHistory.length, 1, "auditHistory entry appended");
  assert.equal(r1.state.activityEvents.length, 1, "activityEvents entry appended");
  assert.equal(r1.state.activityEvents[0].metadata.sourceFilesModified, false, "activity records no source modification");
  assert.ok(/No files modified/i.test(r1.snapshot.no_external_actions_confirmation), "honesty confirmation present");
  // Idempotent per date: re-saving the same ET date replaces, not duplicates.
  const r2 = saveCodebaseHealthSnapshot(r1.state, scan, { now: "2026-07-01T23:00:00.000Z" });
  assert.equal(r2.state.codebaseHealthSnapshots.length, 1, "same-date snapshot replaced (idempotent)");
  ok("persistence mirrors data-integrity pattern (snapshot + audit + activity), idempotent per date");
}

// ---- 8. integration: autopilot ON still performs NO act -------------------
async function testAutopilotOnStillNoAct() {
  // Autopilot ON for B3. Even so, there is no act path, so acted must be false and nothing throws.
  const store = makeStore({ autopilotSettings: { [CODEBASE_HEALTH_ENGINE_ID]: { enabled: true } } });
  const registry = buildHeartbeatRegistry();
  const res = await runHeartbeat({ store, registry, env: {}, now: DAILY_TICK, force: true });
  const run = res.engines.find((e) => e.engineId === CODEBASE_HEALTH_ENGINE_ID);
  assert.ok(run, "B3 engine ran in the tick");
  assert.equal(run.status, "success", "B3 plan succeeded");
  assert.equal(run.autopilot, true, "autopilot resolved ON");
  assert.equal(run.acted, false, "acted is FALSE — no act path even when toggled ON");
  assert.equal(run.resultsCount, 0, "no act results produced");
  const after = store.snapshot();
  assert.ok((after.codebaseHealthSnapshots || []).length >= 1, "plan() wrote a report to the surface");
  ok("autopilot ON: plan runs and reports, but NO act happens (structural)");
}

// ---- 9. integration: autopilot OFF (default) still plans + reports --------
async function testAutopilotOffStillPlans() {
  const store = makeStore({});                  // no autopilotSettings => default OFF
  const registry = buildHeartbeatRegistry();
  const res = await runHeartbeat({ store, registry, env: {}, now: DAILY_TICK, force: true });
  const run = res.engines.find((e) => e.engineId === CODEBASE_HEALTH_ENGINE_ID);
  assert.equal(run.autopilot, false, "autopilot OFF by default");
  assert.equal(run.acted, false, "no act with autopilot OFF");
  assert.ok(run.observationsCount >= 1, "plan still emitted observations");
  assert.ok((store.snapshot().codebaseHealthSnapshots || []).length >= 1, "report still written with autopilot OFF");
  ok("autopilot OFF (default): plan still audits and reports");
}

// ---- 10. plan() returns findings as proposals + a plain-English summary ----
async function testPlanShape() {
  const { dir, packageJsonPath } = makeFixture();
  try {
    const res = await planCodebaseHealth({}, { scriptsDir: dir, packageJsonPath, nowIso: "2026-07-01T10:00:00.000Z" });
    assert.ok(Array.isArray(res.proposals), "plan returns proposals (findings)");
    assert.ok(res.proposals.length > 0, "fixture produced findings");
    assert.equal(res.observations[0].type, "codebase_health_summary", "emits a summary observation");
    assert.ok(["would_break_prod", "accumulating_risk", "cosmetic", "healthy"].includes(res.observations[0].status), "summary carries a status");
    assert.ok((res.state.codebaseHealthSnapshots || []).length === 1, "plan persisted the snapshot into returned state");
    ok("plan() returns findings-as-proposals + summary, and persists the report");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log("B3 codebase-health monitor — tests");
  testCollectionsPersist();
  testEngineHasNoActPath();
  testModuleHasNoMutationPath();
  await testHonestyOnScanError();
  await testRealFindingsFromFixture();
  testDeltas();
  testPersistencePattern();
  await testAutopilotOnStillNoAct();
  await testAutopilotOffStillPlans();
  await testPlanShape();
  console.log(`\n${passed} checks passed.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
