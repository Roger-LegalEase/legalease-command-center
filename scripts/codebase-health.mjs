// B3 — Codebase-Health Monitor (the DETECT-AND-REPORT half of self-healing).
//
// What B3 is — and, structurally, what it can NEVER be:
//   • B3 runs a READ-ONLY structural health audit of the source tree on a daily cadence and
//     writes a plain-English report to a Command Center surface (the codebaseHealthSnapshots
//     collection). It detects: collection/engine REGISTRATION DRIFT, dead/orphaned modules,
//     undocumented load-bearing modules, documentation/CI-process gaps, and duplicate exports.
//   • B3 has NO act() method. The auto-fix half of self-healing was deliberately removed: this
//     engine has no action path at all. It cannot modify, delete, refactor, or merge anything —
//     it only reads files and writes a findings snapshot into state. "Never modifies the app" is
//     therefore STRUCTURAL, not a runtime toggle: buildCodebaseHealthEngine() returns a
//     descriptor with no `act` key, the heartbeat skips act() when an engine has none, and
//     test-codebase-health.mjs asserts the engine exposes no act path even with autopilot ON.
//
// REUSE, not a parallel auditor: B3 does NOT re-implement the data-model knowledge that already
// lives in the codebase. It imports the existing audit registries — buildDataModelInventory()
// (state-integrity.mjs) as the source of truth for what is DOCUMENTED, and coreStateCollections
// / singletonCollections (storage.mjs) as the source of truth for what is REGISTERED — and
// reports drift between those oracles and reality. It mirrors state-integrity's finding shape
// (issue: { severity, ... }) and saveDataIntegritySnapshot's persistence pattern (capped
// snapshot collection + auditHistory + activityEvents). The genuinely-new dimension is
// source-FILE scanning, for which no auditor existed.
//
// HONESTY RULE: every finding is grounded in a real, deterministic observation of files on disk
// or of the imported registries. The engine fabricates nothing — on a scan error it reports the
// error and emits ZERO findings rather than inventing any.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { buildDataModelInventory } from "./state-integrity.mjs";
// NOTE: HEARTBEAT_ENGINE_IDS is imported LAZILY inside scanCodebaseHealth() — a static import
// would create a cycle (heartbeat-engines.mjs imports this module to register the B3 engine),
// tripping a temporal-dead-zone ReferenceError at load. The dynamic import resolves after the
// module graph is fully initialized.

// ---------------------------------------------------------------------------
// 1. DATA MODEL — collection membership (the B1/B2/B5 trap). The findings surface MUST be in
//    coreStateCollections in storage.mjs or it silently fails to persist to Supabase.
//    test-codebase-health.mjs asserts this membership — and B3 itself would flag the drift.
// ---------------------------------------------------------------------------
export const CODEBASE_HEALTH_COLLECTIONS = ["codebaseHealthSnapshots"];

export const CODEBASE_HEALTH_ENGINE_ID = "codebase-health";

// Severity ranking required by the task: would-break-prod / accumulating-risk / cosmetic.
export const SEVERITY = Object.freeze({
  WOULD_BREAK_PROD: "would_break_prod",
  ACCUMULATING_RISK: "accumulating_risk",
  COSMETIC: "cosmetic"
});
const SEVERITY_RANK = { would_break_prod: 3, accumulating_risk: 2, cosmetic: 1 };

// A module imported by at least this many non-test modules is "load-bearing".
const LOAD_BEARING_THRESHOLD = 5;

const noExternalActionsConfirmation =
  "Read-only source audit. No files modified, no code changed, no external systems contacted.";

const list = (v) => (Array.isArray(v) ? v : []);
const clean = (v = "") => String(v ?? "").trim();
function nowIso(options = {}) { return options.now || new Date().toISOString(); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPTS_DIR = __dirname;
const DEFAULT_PACKAGE_JSON = path.resolve(__dirname, "..", "package.json");

// A finding mirrors state-integrity's issue() shape, extended with a category + a stable key
// (so deltas between runs are computed by set difference on keys).
function finding(severity, category, area, message, ref = "") {
  return { severity, category, area, message, ref, key: `${category}:${ref}` };
}

// ---------------------------------------------------------------------------
// 2. STATIC IMPORT GRAPH — parse relative import/export-from/dynamic-import specifiers.
// ---------------------------------------------------------------------------
const IMPORT_RE = /(?:import|export)\b[^'"]*?\bfrom\s*["'](\.\.?\/[^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g;
const SIDE_EFFECT_IMPORT_RE = /\bimport\s+["'](\.\.?\/[^"']+)["']/g;

function isTestFile(basename = "") { return /^test-.*\.mjs$/.test(basename); }

// Strip comments before pattern-matching so EXAMPLE code in doc comments (e.g. this module's own
// `export const FOO_ENGINE_ID = "..."` illustrations) and commented-out code never produce
// findings. Heuristic: the line-comment guard preserves URLs (https://), regex escapes (\/\/),
// and quoted strings via the preceding-char class. Good enough for a structural auditor.
function stripComments(src = "") {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");
}

// Resolve a relative specifier to a basename that lives directly in scriptsDir, or "" if it
// points elsewhere / cannot be resolved to a known scripts file.
function resolveToScriptsBasename(spec, fromFileAbs, scriptsDir, knownBasenames) {
  const resolved = path.resolve(path.dirname(fromFileAbs), spec);
  for (const ext of ["", ".mjs", ".js"]) {
    const withExt = `${resolved}${ext}`;
    if (path.dirname(withExt) !== scriptsDir) continue;   // only count siblings in scriptsDir
    const base = path.basename(withExt);
    if (knownBasenames.has(base)) return base;
  }
  return "";
}

function parseImportSpecifiers(content = "") {
  const specs = new Set();
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, SIDE_EFFECT_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

// Parse `export const NAME = [ ... ]` array-literal collection registries.
const COLLECTION_CONST_RE = /export\s+const\s+(\w+)\s*=\s*(\[[^\]]*\])/g;
const QUOTED_RE = /["']([^"']+)["']/g;
function parseCollectionConsts(content = "") {
  const out = [];
  COLLECTION_CONST_RE.lastIndex = 0;
  let m;
  while ((m = COLLECTION_CONST_RE.exec(content)) !== null) {
    const name = m[1];
    if (!/_COLLECTIONS$/.test(name)) continue;        // only *_COLLECTIONS / *_SINGLETON_COLLECTIONS
    const isSingleton = /_SINGLETON_COLLECTIONS$/.test(name);
    const members = [];
    QUOTED_RE.lastIndex = 0;
    let q;
    while ((q = QUOTED_RE.exec(m[2])) !== null) members.push(q[1]);
    out.push({ name, isSingleton, members });
  }
  return out;
}

// Parse `export const FOO_ENGINE_ID = "literal"`.
const ENGINE_ID_RE = /export\s+const\s+(\w*ENGINE_ID)\s*=\s*["']([^"']+)["']/g;
function parseEngineIds(content = "") {
  const out = [];
  ENGINE_ID_RE.lastIndex = 0;
  let m;
  while ((m = ENGINE_ID_RE.exec(content)) !== null) out.push({ name: m[1], value: m[2] });
  return out;
}

// Parse direct export declarations (NOT re-exports like `export { x } from "..."`).
const EXPORT_DECL_RE = /export\s+(?:async\s+)?(?:const|function|class)\s+(\w+)/g;
function parseExportDeclarations(content = "") {
  const out = new Set();
  EXPORT_DECL_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_DECL_RE.exec(content)) !== null) out.add(m[1]);
  return [...out];
}

// ---------------------------------------------------------------------------
// 3. SCAN — read-only. Returns { findings, scanned, scan_error }. The ONLY I/O B3 performs,
//    and it is read-only: readdir + readFile, nothing else.
// ---------------------------------------------------------------------------
export async function scanCodebaseHealth(options = {}) {
  const scriptsDir = options.scriptsDir || DEFAULT_SCRIPTS_DIR;
  const packageJsonPath = options.packageJsonPath || DEFAULT_PACKAGE_JSON;
  const findings = [];

  let entries;
  try {
    entries = (await readdir(scriptsDir)).filter((f) => /\.(mjs|js)$/.test(f));
  } catch (error) {
    return { findings: [], scanned: { modules: 0, tests: 0 }, scan_error: `Could not read scripts dir: ${String(error.message || error)}` };
  }
  const knownBasenames = new Set(entries);

  // Read every file once.
  const files = new Map();             // basename -> content
  for (const base of entries) {
    try {
      files.set(base, stripComments(await readFile(path.join(scriptsDir, base), "utf8")));
    } catch {
      // Unreadable file: skip rather than fabricate a finding about it.
    }
  }

  // package.json scripts text (for "referenced as a runnable script" checks).
  let pkgScriptsText = "";
  try {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
    pkgScriptsText = Object.values(pkg.scripts || {}).join(" \n ");
  } catch {
    pkgScriptsText = "";
  }
  let testChain = "";
  try {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
    testChain = String((pkg.scripts || {}).test || "");
  } catch { testChain = ""; }

  const moduleFiles = [...files.keys()].filter((b) => !isTestFile(b));
  const testFiles = [...files.keys()].filter((b) => isTestFile(b));

  // ---- import graph: inbound counts ---------------------------------------
  const inboundAll = new Map();        // basename -> count of any file importing it
  const inboundNonTest = new Map();    // basename -> count of non-test files importing it
  for (const base of files.keys()) {
    const fromAbs = path.join(scriptsDir, base);
    const specs = parseImportSpecifiers(files.get(base));
    const importedBases = new Set();
    for (const spec of specs) {
      const target = resolveToScriptsBasename(spec, fromAbs, scriptsDir, knownBasenames);
      if (target && target !== base) importedBases.add(target);
    }
    for (const target of importedBases) {
      inboundAll.set(target, (inboundAll.get(target) || 0) + 1);
      if (!isTestFile(base)) inboundNonTest.set(target, (inboundNonTest.get(target) || 0) + 1);
    }
  }

  // ---- (a) collection-registration drift (would_break_prod) ---------------
  // Every member of an exported *_COLLECTIONS array must be registered in storage.mjs, or it
  // silently fails to persist to Supabase. This is the exact B1/B2/B5 trap, caught structurally.
  // Only PRODUCTION modules register collections; test files merely import the constants (and
  // may embed example declarations as string fixtures), so scanning them would be a false signal.
  const coreSet = new Set(coreStateCollections);
  for (const base of moduleFiles) {
    if (base === "storage.mjs") continue;                 // storage.mjs IS the registry
    for (const decl of parseCollectionConsts(files.get(base))) {
      for (const member of decl.members) {
        if (!coreSet.has(member)) {
          findings.push(finding(
            SEVERITY.WOULD_BREAK_PROD, "collection_registration_drift", "registration",
            `${base} declares collection "${member}" (${decl.name}) that is NOT in coreStateCollections — it will silently fail to persist to Supabase.`,
            `${base}#${member}`
          ));
        } else if (decl.isSingleton && !singletonCollections.has(member)) {
          findings.push(finding(
            SEVERITY.WOULD_BREAK_PROD, "collection_registration_drift", "registration",
            `${base} declares singleton collection "${member}" (${decl.name}) that is missing from singletonCollections — it will persist as an array, not a singleton.`,
            `${base}#${member}:singleton`
          ));
        }
      }
    }
  }

  // ---- (b) engine-id registration drift (would_break_prod) ----------------
  // An exported *_ENGINE_ID not in HEARTBEAT_ENGINE_IDS can't receive an autopilot toggle
  // (the /api/heartbeat/autopilot endpoint rejects unknown ids) — the engine is unconfigurable.
  const { HEARTBEAT_ENGINE_IDS } = await import("./heartbeat-engines.mjs");
  const engineIdSet = new Set(HEARTBEAT_ENGINE_IDS);
  for (const base of moduleFiles) {                       // engines are production modules, not tests
    for (const e of parseEngineIds(files.get(base))) {
      if (!engineIdSet.has(e.value)) {
        findings.push(finding(
          SEVERITY.WOULD_BREAK_PROD, "engine_id_unregistered", "registration",
          `${base} exports ${e.name}="${e.value}" but it is not in HEARTBEAT_ENGINE_IDS — its autopilot toggle cannot be set.`,
          `${base}#${e.value}`
        ));
      }
    }
  }

  // ---- (c) data-model inventory coverage gap (accumulating_risk) ----------
  // Registered (non-singleton) collections absent from buildDataModelInventory() — the
  // data-model documentation. Reported as ONE rollup (not per-collection) to keep the report
  // high-signal; the count is in the delta key so a newly-undocumented collection still
  // surfaces as a new finding. Worded as a pure fact (no unverifiable "load-bearing" claim).
  const documentedCollections = new Set(buildDataModelInventory().map((s) => s.collection));
  const undocumentedCollections = coreStateCollections.filter(
    (c) => !singletonCollections.has(c) && !documentedCollections.has(c)
  );
  if (undocumentedCollections.length > 0) {
    findings.push(finding(
      SEVERITY.ACCUMULATING_RISK, "inventory_coverage_gap", "documentation",
      `${undocumentedCollections.length} of ${coreStateCollections.length} registered collections have no entry in buildDataModelInventory() (the data-model documentation): ${[...undocumentedCollections].sort().join(", ")}.`,
      String(undocumentedCollections.length)
    ));
  }

  // ---- (d) inventory references a test file that no longer exists (accumulating_risk) ------
  for (const spec of buildDataModelInventory()) {
    for (const rel of list(spec.related_tests)) {
      const base = path.basename(clean(rel));
      if (base && !knownBasenames.has(base)) {
        findings.push(finding(
          SEVERITY.ACCUMULATING_RISK, "inventory_missing_test_file", "documentation",
          `buildDataModelInventory() lists "${rel}" as a test for "${spec.collection}", but that file does not exist — documentation drift.`,
          `${spec.collection}->${base}`
        ));
      }
    }
  }

  // ---- (e) orphaned modules / dead code (accumulating_risk) ---------------
  // A non-test module imported by NOTHING and not referenced as a runnable script in
  // package.json and not a known entrypoint => dead/orphaned.
  const ENTRYPOINTS = new Set(["preview-server.mjs"]);
  for (const base of moduleFiles) {
    if (ENTRYPOINTS.has(base)) continue;
    const importedByAny = (inboundAll.get(base) || 0) > 0;
    const referencedAsScript = pkgScriptsText.includes(base);   // CLI entrypoint via npm script
    if (!importedByAny && !referencedAsScript) {
      findings.push(finding(
        SEVERITY.ACCUMULATING_RISK, "orphaned_module", "dead_code",
        `${base} is imported by no module and is not referenced by any package.json script — likely dead/orphaned code.`,
        base
      ));
    }
  }

  // ---- (f) undocumented load-bearing modules (accumulating_risk) ----------
  // Imported by many non-test modules but no test file imports it => central code with no test.
  const testImportTargets = new Set();
  for (const base of testFiles) {
    const fromAbs = path.join(scriptsDir, base);
    for (const spec of parseImportSpecifiers(files.get(base))) {
      const target = resolveToScriptsBasename(spec, fromAbs, scriptsDir, knownBasenames);
      if (target) testImportTargets.add(target);
    }
  }
  for (const base of moduleFiles) {
    if (ENTRYPOINTS.has(base)) continue;
    const fanIn = inboundNonTest.get(base) || 0;
    if (fanIn >= LOAD_BEARING_THRESHOLD && !testImportTargets.has(base)) {
      findings.push(finding(
        SEVERITY.ACCUMULATING_RISK, "undocumented_load_bearing_module", "documentation",
        `${base} is imported by ${fanIn} modules (load-bearing) but no test file imports it — untested central code.`,
        base
      ));
    }
  }

  // ---- (g) orphaned test files / CI-process gap (accumulating_risk) -------
  // A test-*.mjs that no package.json script references at all can never run in CI.
  for (const base of testFiles) {
    if (!pkgScriptsText.includes(base)) {
      findings.push(finding(
        SEVERITY.ACCUMULATING_RISK, "unreferenced_test_file", "ci_process",
        `${base} is a test file that no package.json script references — it never runs (CI gap).`,
        base
      ));
    }
  }

  // ---- (h) duplicate exported declarations (cosmetic) ---------------------
  // The same symbol declared (not re-exported) in 2+ non-test modules — a duplication signal.
  const exportSites = new Map();       // exportName -> Set(basenames)
  for (const base of moduleFiles) {
    for (const name of parseExportDeclarations(files.get(base))) {
      if (!exportSites.has(name)) exportSites.set(name, new Set());
      exportSites.get(name).add(base);
    }
  }
  for (const [name, sites] of exportSites) {
    if (sites.size >= 2) {
      const where = [...sites].sort();
      findings.push(finding(
        SEVERITY.COSMETIC, "duplicate_export", "duplication",
        `Symbol "${name}" is exported (declared) by ${sites.size} modules: ${where.join(", ")} — possible duplicated/drifted logic.`,
        name
      ));
    }
  }

  // Sort by severity (highest first), then category, then ref — stable, deterministic.
  findings.sort((a, b) =>
    (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
    a.category.localeCompare(b.category) ||
    a.ref.localeCompare(b.ref)
  );

  return {
    findings,
    scanned: {
      modules: moduleFiles.length,
      tests: testFiles.length,
      collections: coreStateCollections.length,
      documented_collections: documentedCollections.size,
      load_bearing_threshold: LOAD_BEARING_THRESHOLD,
      test_chain_present: Boolean(testChain)
    },
    scan_error: null
  };
}

// ---------------------------------------------------------------------------
// 4. SNAPSHOT + DELTAS + PERSISTENCE — mirrors saveDataIntegritySnapshot.
// ---------------------------------------------------------------------------
function severityCounts(findings = []) {
  const counts = { would_break_prod: 0, accumulating_risk: 0, cosmetic: 0, total: findings.length };
  for (const f of findings) if (counts[f.severity] !== undefined) counts[f.severity] += 1;
  return counts;
}

function statusFromCounts(counts = {}, scanError = null) {
  if (scanError) return "scan_error";
  if (counts.would_break_prod > 0) return "would_break_prod";
  if (counts.accumulating_risk > 0) return "accumulating_risk";
  if (counts.cosmetic > 0) return "cosmetic";
  return "healthy";
}

const minimalFinding = (f) => ({ severity: f.severity, category: f.category, message: f.message, ref: f.ref, key: f.key });

export function buildCodebaseHealthSnapshot(state = {}, scan = {}, options = {}) {
  const generatedAt = nowIso(options);
  const date = generatedAt.slice(0, 10);
  const findings = list(scan.findings);
  const counts = severityCounts(findings);
  const scanError = scan.scan_error || null;

  // Deltas vs the most recent prior snapshot (since last run).
  const previous = list(state.codebaseHealthSnapshots)[0] || null;
  const prevKeys = new Set(list(previous?.findings).map((f) => f.key));
  const currentKeys = new Set(findings.map((f) => f.key));
  const newFindings = findings.filter((f) => !prevKeys.has(f.key));
  const resolvedFindings = list(previous?.findings).filter((f) => !currentKeys.has(f.key));

  return {
    id: `codebase-health-${date}`,
    generated_at: generatedAt,
    status: statusFromCounts(counts, scanError),
    counts,
    scan_error: scanError,
    findings: findings.map(minimalFinding),
    deltas: {
      since: previous?.id || null,
      since_generated_at: previous?.generated_at || null,
      new_count: newFindings.length,
      resolved_count: resolvedFindings.length,
      new_would_break_prod: newFindings.filter((f) => f.severity === SEVERITY.WOULD_BREAK_PROD).length,
      new: newFindings.map(minimalFinding),
      resolved: resolvedFindings.map(minimalFinding)
    },
    scanned: scan.scanned || {},
    no_external_actions_confirmation: noExternalActionsConfirmation
  };
}

// Pure: returns new state with the snapshot prepended (capped 90) + audit/activity rows. This is
// the ONLY thing B3 writes, and it writes only to STATE (never to source files) — the engine has
// no file-write path whatsoever.
export function saveCodebaseHealthSnapshot(state = {}, scan = {}, options = {}) {
  const snapshot = buildCodebaseHealthSnapshot(state, scan, options);
  const timestamp = snapshot.generated_at;
  const stamp = Date.parse(timestamp) || timestamp;
  const actor = options.actor || "heartbeat";
  const next = {
    ...state,
    codebaseHealthSnapshots: [snapshot, ...list(state.codebaseHealthSnapshots).filter((s) => s.id !== snapshot.id)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${snapshot.id}-${stamp}`,
    timestamp,
    actor,
    action: "codebase health snapshot refreshed",
    resourceType: "codebase_health_snapshot",
    resourceId: snapshot.id,
    beforeValue: null,
    afterValue: {
      status: snapshot.status,
      total: snapshot.counts.total,
      would_break_prod: snapshot.counts.would_break_prod,
      new_findings: snapshot.deltas.new_count,
      resolved_findings: snapshot.deltas.resolved_count
    }
  }, ...list(state.auditHistory)];
  next.activityEvents = [{
    id: `activity-${snapshot.id}-${stamp}`,
    eventType: "Codebase Health Snapshot refreshed",
    title: "Codebase Health Snapshot refreshed",
    summary: `Codebase health audit complete. Status: ${snapshot.status}. ${snapshot.counts.total} finding(s), ${snapshot.deltas.new_count} new since last run. ${noExternalActionsConfirmation}`,
    relatedObjectType: "codebase_health_snapshot",
    relatedObjectId: snapshot.id,
    riskLevel: snapshot.status === "would_break_prod" ? "high" : snapshot.status === "accumulating_risk" ? "medium" : "low",
    metadata: { externalSideEffects: false, noExternalSystemsContacted: true, sourceFilesModified: false },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, snapshot };
}

// ---------------------------------------------------------------------------
// 5. plan() — runs the read-only scan and writes the report into state. NO act() exists.
// ---------------------------------------------------------------------------
export async function planCodebaseHealth(state = {}, ctx = {}) {
  const scan = await scanCodebaseHealth({
    scriptsDir: ctx.scriptsDir,
    packageJsonPath: ctx.packageJsonPath
  });
  const { state: next, snapshot } = saveCodebaseHealthSnapshot(state, scan, { now: ctx.nowIso, actor: ctx.actor });
  return {
    state: next,
    proposals: scan.findings,                 // findings a human may choose to act on (B3 never does)
    observations: [{
      type: "codebase_health_summary",
      status: snapshot.status,
      counts: snapshot.counts,
      new_findings: snapshot.deltas.new_count,
      new_would_break_prod: snapshot.deltas.new_would_break_prod,
      resolved_findings: snapshot.deltas.resolved_count,
      scan_error: snapshot.scan_error
    }]
  };
}

// ---------------------------------------------------------------------------
// Heartbeat engine descriptor. cadence "daily". DELIBERATELY no act():
//   • "Never modifies the app" is structural — there is no action path to gate.
//   • The heartbeat skips act() for engines without one, so a toggled-ON autopilot is a no-op.
// Autopilot OFF by default (heartbeat.mjs) remains the uniform outer posture.
// ---------------------------------------------------------------------------
export function buildCodebaseHealthEngine(deps = {}) {
  return {
    id: CODEBASE_HEALTH_ENGINE_ID,
    cadence: "daily",
    plan(state, ctx) {
      return planCodebaseHealth(state, { ...ctx, ...deps });
    }
    // NO act — by design. Do not add one: the detect-and-report contract depends on its absence.
  };
}
