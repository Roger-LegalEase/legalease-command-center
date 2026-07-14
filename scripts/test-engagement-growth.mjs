// B4 — Engagement & Growth Monitor tests. Proves the non-negotiables:
//   1. The report surface persists (membership in coreStateCollections), engine id registered.
//   2. READ-ONLY: the engine has NO act() method and the module has NO posting/send/outward-write
//      path — proven structurally (no act key), by source scan (no publish/sendgrid/network-write
//      symbols), and behaviorally (a heartbeat tick with autopilot ON performs NO act).
//   3. HONESTY: unconnected sources report as not-connected with a reason and NO number; a
//      configured-but-unavailable source shows the error and "no cached/estimated number"; live
//      numbers pass through unchanged; content performance counts ONLY operator-entered metrics
//      (seed/demo engagement numbers are never aggregated).
//   4. Social sources (LinkedIn/Meta/X) are always reported blocked with their gating reason.
//   5. Deltas vs the last run (trend) are computed correctly.
//   6. Persistence mirrors the snapshot pattern (snapshot + audit + activity), idempotent per date.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { runHeartbeat } from "./heartbeat.mjs";
import { buildHeartbeatRegistry, HEARTBEAT_ENGINE_IDS } from "./heartbeat-engines.mjs";
import { buildDataModelInventory } from "./state-integrity.mjs";
import {
  ENGAGEMENT_GROWTH_COLLECTIONS, ENGAGEMENT_GROWTH_ENGINE_ID, SOCIAL_SOURCES,
  buildEngagementGrowthSnapshot, saveEngagementGrowthSnapshot,
  planEngagementGrowth, buildEngagementGrowthEngine
} from "./engagement-growth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// 2026-07-01 10:00Z = 06:00 ET (EDT) => the daily-engine window (6am ET), so B4 (daily) runs.
const DAILY_TICK = new Date("2026-07-01T10:00:00Z");

function makeStore(initial = {}) {
  let state = JSON.parse(JSON.stringify(initial));
  return {
    async readState() { return JSON.parse(JSON.stringify(state)); },
    async writeState(next) { state = JSON.parse(JSON.stringify(next)); return state; },
    async writeCollections(patch) { state = { ...state, ...JSON.parse(JSON.stringify(patch)) }; return state; },
    async mutateCollectionItem(collection, _itemId, mutate, options = {}) {
      const current = state[collection] ?? null;
      if (!current && !options.createIfMissing) throw new Error("Record not found.");
      const changed = await mutate(current ? JSON.parse(JSON.stringify(current)) : null);
      const record = { ...(changed || {}), _version:Number(current?._version || 0) + 1 };
      state = { ...state, [collection]:record };
      return { state:JSON.parse(JSON.stringify(state)), record, version:record._version };
    },
    snapshot() { return JSON.parse(JSON.stringify(state)); }
  };
}

const LIVE = {
  revenue: { available: true, configured: true, gross: 1234, currency: "usd", since: "2026-01-01" },
  signups: { available: true, configured: true, paid: 5, registered: 40 }
};

// ---- 1. surface persists --------------------------------------------------
function testCollectionsPersist() {
  for (const c of ENGAGEMENT_GROWTH_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(c), `${c} in coreStateCollections (persists to Supabase)`);
    assert.ok(!singletonCollections.has(c), `${c} is NOT a singleton (array of snapshots)`);
  }
  assert.ok(HEARTBEAT_ENGINE_IDS.includes(ENGAGEMENT_GROWTH_ENGINE_ID), "engine id in HEARTBEAT_ENGINE_IDS");
  assert.ok(
    buildDataModelInventory().some((s) => s.collection === "engagementGrowthSnapshots"),
    "engagementGrowthSnapshots is documented in buildDataModelInventory()"
  );
  ok("report surface persists, engine id registered, surface self-documented");
}

// ---- 2a. NO act path — structural ----------------------------------------
function testEngineHasNoActPath() {
  const engine = buildEngagementGrowthEngine();
  assert.equal(engine.id, ENGAGEMENT_GROWTH_ENGINE_ID, "engine id");
  assert.equal(engine.cadence, "daily", "cadence daily");
  assert.equal(typeof engine.plan, "function", "has plan()");
  assert.equal(engine.act, undefined, "engine.act is undefined");
  assert.ok(!Object.prototype.hasOwnProperty.call(engine, "act"), "descriptor has no 'act' key at all");
  assert.ok(!("act" in engine), "no 'act' anywhere in the descriptor chain");
  ok("engine descriptor exposes NO act path (read-only by construction)");
}

// ---- 2b. module has NO posting/send/outward-write path --------------------
function testModuleHasNoPostingPath() {
  const src = readFileSync(path.join(__dirname, "engagement-growth.mjs"), "utf8");
  // No platform POSTING calls.
  for (const banned of ["publishLinkedIn", "publishFacebook", "publishInstagram", "publishThreads", "publishX", "publishToPlatform", "api.x.com", "/v2/tweets", "graph.facebook"]) {
    assert.ok(!src.includes(banned), `module contains no posting call "${banned}"`);
  }
  // No send / network-write / fs-write / exec primitives.
  for (const banned of ["sendgrid", "SendGrid", "sendMail", "writeFile", "appendFile", "child_process", "execSync", "spawn", "createWriteStream", "fetch(", "XMLHttpRequest", "node:http"]) {
    assert.ok(!src.includes(banned), `module contains no "${banned}" (read-only, no outward write)`);
  }
  // No exported act/send/post function.
  for (const re of [/export\s+(?:async\s+)?function\s+act/i, /export\s+(?:async\s+)?function\s+\w*(?:send|post|publish)/i]) {
    assert.ok(!re.test(src), `module exports no ${re} function`);
  }
  ok("module has NO posting / send / outward-write path");
}

// ---- 3a. honesty: unconnected => no number, honest reason -----------------
function testHonestyNotConnected() {
  // No injected fetch at all => revenue/signups "not queried".
  const snap = buildEngagementGrowthSnapshot({}, {}, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(snap.status, "limited_data", "status limited_data when no live source");
  assert.equal(snap.live_sources_connected, 0, "no live sources connected");
  assert.equal(snap.metrics.revenue.available, false, "revenue unavailable");
  assert.ok(!("gross" in snap.metrics.revenue), "NO fabricated revenue number when unavailable");
  assert.equal(snap.metrics.signups.available, false, "signups unavailable");
  assert.ok(!("paid" in snap.metrics.signups), "NO fabricated signup number when unavailable");
  assert.ok(snap.metrics.revenue.error, "revenue carries an honest error/reason");
  ok("honesty: unconnected sources report no number, only an honest reason");
}

// ---- 3b. honesty: configured-but-unavailable => error, no number ----------
function testHonestyConfiguredUnavailable() {
  const fetched = {
    revenue: { available: false, configured: true, error: "Stripe key is not in live mode." },
    signups: { available: false, configured: false, error: "Signup metrics are not connected yet." }
  };
  const snap = buildEngagementGrowthSnapshot({}, fetched, { now: "2026-07-01T10:00:00.000Z" });
  const rev = snap.sources.find((s) => s.key === "stripe_revenue");
  const sign = snap.sources.find((s) => s.key === "signups");
  assert.equal(rev.state, "configured_unavailable", "wired-but-failing => configured_unavailable");
  assert.ok(/no cached or estimated number/i.test(rev.detail), "states no cached/estimated number shown");
  assert.equal(sign.state, "not_connected", "no creds => not_connected");
  assert.ok(!("gross" in snap.metrics.revenue) && !("paid" in snap.metrics.signups), "no numbers fabricated");
  ok("honesty: configured-but-unavailable shows error, never a number");
}

// ---- 3c. live numbers pass through unchanged ------------------------------
function testLiveNumbersPassThrough() {
  const snap = buildEngagementGrowthSnapshot({}, LIVE, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(snap.status, "reporting", "status reporting with live sources");
  assert.equal(snap.live_sources_connected, 2, "two live sources");
  assert.equal(snap.metrics.revenue.gross, 1234, "live gross passed through");
  assert.equal(snap.metrics.signups.paid, 5, "live paid passed through");
  assert.equal(snap.metrics.signups.registered, 40, "live registered passed through");
  assert.equal(snap.sources.find((s) => s.key === "stripe_revenue").state, "live", "stripe source live");
  ok("live numbers pass through unchanged (no transformation/estimation)");
}

// ---- 3d. content performance counts ONLY operator-entered metrics ---------
function testContentManualOnly() {
  const state = {
    posts: [
      { postedAt: "2026-06-30", performanceUpdatedAt: "2026-06-30", performance: { impressions: 100, likes: 10 } }, // real operator entry
      { publishedAt: "2026-06-29", performance: { impressions: 9999, likes: 999 } },                                  // seed/demo fake, NO performanceUpdatedAt
      { status: "draft" }                                                                                              // not posted
    ]
  };
  const snap = buildEngagementGrowthSnapshot(state, {}, { now: "2026-07-01T10:00:00.000Z" });
  const c = snap.metrics.content;
  assert.equal(c.posted_count, 2, "two posted items");
  assert.equal(c.with_operator_metrics_count, 1, "only one has operator-entered metrics");
  assert.equal(c.needing_metrics_count, 1, "one needs metrics");
  assert.equal(c.manual_performance_totals.impressions, 100, "seed/demo engagement EXCLUDED from totals");
  assert.equal(c.manual_performance_totals.likes, 10, "only operator-entered likes counted");
  assert.equal(c.data_source, "manual_operator_entry", "content labeled as manual, not platform-sourced");
  ok("content performance aggregates ONLY operator-entered metrics (no seed/demo leakage)");
}

// ---- 4. social sources always reported blocked, with reasons -------------
function testSocialSourcesBlocked() {
  const snap = buildEngagementGrowthSnapshot({}, LIVE, { now: "2026-07-01T10:00:00.000Z" });
  for (const src of SOCIAL_SOURCES) {
    const entry = snap.sources.find((s) => s.key === src.key);
    assert.ok(entry, `${src.key} present in sources`);
    assert.equal(entry.state, "not_connected", `${src.key} reported not_connected`);
    assert.equal(entry.available, false, `${src.key} not available`);
    assert.ok(entry.detail && entry.detail.length > 10, `${src.key} carries a gating reason`);
  }
  assert.ok(snap.blocked_sources.some((l) => /LinkedIn/i.test(l)), "LinkedIn in blocked_sources");
  assert.ok(snap.blocked_sources.some((l) => /Meta/i.test(l)), "Meta in blocked_sources");
  assert.ok(snap.blocked_sources.some((l) => /\bX\b/.test(l)), "X in blocked_sources");
  // The honest ceiling line is always present.
  assert.ok(snap.deltas.whats_working.some((l) => /CANNOT be determined yet/i.test(l)), "states channel ROI cannot be determined yet");
  ok("social sources (LinkedIn/Meta/X) always reported blocked with gating reasons");
}

// ---- 5. deltas vs last run -----------------------------------------------
function testDeltas() {
  const first = buildEngagementGrowthSnapshot({}, { signups: { available: true, configured: true, paid: 3, registered: 20 } }, { now: "2026-06-30T10:00:00.000Z" });
  assert.equal(first.deltas.since, null, "first run has no prior snapshot");
  assert.equal(first.deltas.signups_paid, null, "first run: no paid delta (no prior reading)");

  const state = { engagementGrowthSnapshots: [first] };
  const second = buildEngagementGrowthSnapshot(state, { signups: { available: true, configured: true, paid: 7, registered: 35 } }, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(second.deltas.since, first.id, "delta references the prior snapshot");
  assert.equal(second.deltas.signups_paid, 4, "paid delta 3 -> 7 = +4");
  assert.equal(second.deltas.signups_registered, 15, "registered delta 20 -> 35 = +15");
  assert.ok(second.deltas.whats_working.some((l) => /\+4/.test(l)), "what's-working surfaces the +4 trend");
  ok("deltas since last run computed correctly (trend surfaced)");
}

// ---- 6. persistence pattern, idempotent ----------------------------------
function testPersistencePattern() {
  const r1 = saveEngagementGrowthSnapshot({}, LIVE, { now: "2026-07-01T10:00:00.000Z" });
  assert.equal(r1.state.engagementGrowthSnapshots.length, 1, "snapshot written to surface");
  assert.equal(r1.state.auditHistory.length, 1, "auditHistory entry appended");
  assert.equal(r1.state.activityEvents.length, 1, "activityEvents entry appended");
  assert.equal(r1.state.activityEvents[0].metadata.outwardWrites, false, "activity records no outward writes");
  assert.equal(r1.state.activityEvents[0].metadata.readOnly, true, "activity records read-only");
  assert.ok(/No posts published, no messages sent/i.test(r1.snapshot.no_external_actions_confirmation), "honesty confirmation present");
  const r2 = saveEngagementGrowthSnapshot(r1.state, LIVE, { now: "2026-07-01T23:00:00.000Z" });
  assert.equal(r2.state.engagementGrowthSnapshots.length, 1, "same-date snapshot replaced (idempotent)");
  ok("persistence mirrors snapshot pattern (snapshot + audit + activity), idempotent per date");
}

// ---- 7. integration: autopilot ON still performs NO act -------------------
async function testAutopilotOnStillNoAct() {
  const store = makeStore({ autopilotSettings: { [ENGAGEMENT_GROWTH_ENGINE_ID]: { enabled: true } } });
  const registry = buildHeartbeatRegistry();   // no fetch dep => reports not-connected, still runs
  const res = await runHeartbeat({ store, registry, env: {}, now: DAILY_TICK, force: true });
  const run = res.engines.find((e) => e.engineId === ENGAGEMENT_GROWTH_ENGINE_ID);
  assert.ok(run, "B4 engine ran");
  assert.equal(run.status, "success", "B4 plan succeeded");
  assert.equal(run.autopilot, true, "autopilot resolved ON");
  assert.equal(run.acted, false, "acted is FALSE — no act path even when toggled ON");
  assert.equal(run.resultsCount, 0, "no act results");
  assert.ok((store.snapshot().engagementGrowthSnapshots || []).length >= 1, "plan wrote a report");
  ok("autopilot ON: plan runs and reports, but NO act happens (read-only, structural)");
}

// ---- 8. integration: autopilot OFF (default) still plans + reports --------
async function testAutopilotOffStillPlans() {
  const store = makeStore({});
  const registry = buildHeartbeatRegistry();
  const res = await runHeartbeat({ store, registry, env: {}, now: DAILY_TICK, force: true });
  const run = res.engines.find((e) => e.engineId === ENGAGEMENT_GROWTH_ENGINE_ID);
  assert.equal(run.autopilot, false, "autopilot OFF by default");
  assert.equal(run.acted, false, "no act with autopilot OFF");
  assert.ok(run.observationsCount >= 1, "plan emitted observations");
  ok("autopilot OFF (default): plan still observes and reports");
}

// ---- 9. plan() returns blocked-source proposals + summary, fetch is read-only
async function testPlanShapeAndReadOnlyFetch() {
  let fetchCalls = 0;
  const fetchEngagementMetrics = async () => { fetchCalls += 1; return LIVE; };  // read-only stand-in
  const res = await planEngagementGrowth({}, { fetchEngagementMetrics, nowIso: "2026-07-01T10:00:00.000Z" });
  assert.equal(fetchCalls, 1, "plan invoked the injected read-only fetcher once");
  assert.ok(Array.isArray(res.proposals), "plan returns proposals");
  assert.ok(res.proposals.every((p) => p.type === "connect_source"), "proposals are connect-source action items (never auto-acted)");
  assert.equal(res.observations[0].type, "engagement_growth_summary", "emits a summary observation");
  assert.ok((res.state.engagementGrowthSnapshots || []).length === 1, "plan persisted the snapshot");
  // A throwing fetcher must NOT fabricate — it records honest unavailability.
  const res2 = await planEngagementGrowth({}, { fetchEngagementMetrics: async () => { throw new Error("network down"); }, nowIso: "2026-07-02T10:00:00.000Z" });
  const snap2 = res2.state.engagementGrowthSnapshots[0];
  assert.equal(snap2.metrics.revenue.available, false, "fetch error => revenue unavailable, not fabricated");
  assert.ok(/network down/i.test(snap2.metrics.revenue.error), "honest error recorded");
  ok("plan() returns proposals + summary; injected fetch is read-only; errors never fabricate");
}

async function main() {
  console.log("B4 engagement & growth monitor — tests");
  testCollectionsPersist();
  testEngineHasNoActPath();
  testModuleHasNoPostingPath();
  testHonestyNotConnected();
  testHonestyConfiguredUnavailable();
  testLiveNumbersPassThrough();
  testContentManualOnly();
  testSocialSourcesBlocked();
  testDeltas();
  testPersistencePattern();
  await testAutopilotOnStillNoAct();
  await testAutopilotOffStillPlans();
  await testPlanShapeAndReadOnlyFetch();
  console.log(`\n${passed} checks passed.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
