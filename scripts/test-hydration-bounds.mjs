// Hydration-bounds verifier (2026-07-25 Supabase CPU saturation fix). Proves the three
// properties the fix promises:
//   1. Boot hydrates AT MOST ONCE and BOUNDED: a burst of readState calls interleaved with
//      denial-audit claims performs exactly one full sweep, and that sweep excludes the
//      unbounded audit ledgers (soc2AuditLogs, auditEvents).
//   2. A Today / boot-state request performs ZERO full-table paging: both endpoints read
//      through explicit collection lists (collection=in.(...) requests only), verified
//      behaviorally at the store layer and structurally at the handler source.
//   3. Audit ledgers are excluded from BOTH the hydration sweep and the cache signature:
//      an external denial insert (another process writing soc2AuditLogs) neither moves the
//      signature nor forces a re-sweep, and an in-process denial claim does not invalidate
//      the state cache.
// Plus drift guards: any new `state.<collection>` read in the modules behind the Today
// summary / compact boot state must be added to the corresponding read list or this fails.
//
// No live network: globalThis.fetch is a fake PostgREST (same approach as
// test-state-cache-coherence.mjs) that honors collection filters, limit/offset, and
// count=exact content-ranges — exclusion is observed, not assumed.

import assert from "node:assert";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";

process.env.SUPABASE_URL = "https://fake-hydration-bounds-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STORAGE_BACKEND = "supabase";
process.env.STATE_CACHE_TTL_MS = "60000";
const DIR = "/tmp/leos-hydration-bounds-test";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
process.env.COMMAND_CENTER_DATA_PATH = DIR + "/data.json";
process.env.COMMAND_CENTER_SEED_PATH = DIR + "/seed-does-not-exist.json";
writeFileSync(DIR + "/data.json", JSON.stringify({ library: [] }));

const {
  SupabaseCoreStore,
  coreStateCollections,
  hydrationExcludedCollections,
  normalizeCollectionNames
} = await import("./storage.mjs");
const { TODAY_SUMMARY_READ_COLLECTIONS, buildTodaySummary } = await import("./company-memory-projector.mjs");
const { BOOT_STATE_READ_COLLECTIONS } = await import("./boot-state-read-collections.mjs");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Hydration-bounds verifier");

// ---- fake PostgREST honoring filters, paging, and count=exact ------------------------------
const table = new Map();
let stamp = 0;
const nextStamp = () => new Date(Date.UTC(2026, 6, 25, 0, 0, 0, (stamp += 1))).toISOString();
function upsertRow(collection, itemId, payload) {
  const current = table.get(collection + "\0" + itemId);
  table.set(collection + "\0" + itemId, {
    collection, item_id: itemId, payload,
    version: Number(current?.version || 0) + 1,
    updated_at: nextStamp()
  });
}
const log = { sweepPages: 0, sweepUrls: [], probeUrls: [], targetedUrls: [], servedCollections: new Set() };
function resetLog() {
  log.sweepPages = 0;
  log.sweepUrls = [];
  log.probeUrls = [];
  log.targetedUrls = [];
  log.servedCollections = new Set();
}
function rowsForUrl(u) {
  let rows = [...table.values()].sort((a, b) => (a.collection + "\0" + a.item_id).localeCompare(b.collection + "\0" + b.item_id));
  const notIn = u.match(/collection=not\.in\.\(([^)]*)\)/);
  const inFilter = u.match(/collection=in\.\(([^)]*)\)/);
  if (notIn) {
    const excluded = new Set(notIn[1].split(","));
    rows = rows.filter((row) => !excluded.has(row.collection));
  } else if (inFilter) {
    const allowed = new Set(inFilter[1].split(","));
    rows = rows.filter((row) => allowed.has(row.collection));
  }
  return rows;
}
function pageOf(rows, u) {
  const limit = Number((u.match(/limit=(\d+)/) || [])[1] || rows.length);
  const offset = Number((u.match(/offset=(\d+)/) || [])[1] || 0);
  return rows.slice(offset, offset + limit);
}
globalThis.fetch = async (url, options = {}) => {
  const u = decodeURIComponent(String(url));
  const method = String(options.method || "GET").toUpperCase();
  const respond = (body, total = null, status = 200) => ({
    ok: status < 300, status,
    headers: { get: (name) => (String(name).toLowerCase() === "content-range" && total !== null ? "0-0/" + total : "") },
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  if (method === "GET" && u.includes("select=updated_at") && u.includes("order=updated_at.desc")) {
    log.probeUrls.push(u);
    const rows = rowsForUrl(u);
    const newest = rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), "");
    return respond(newest ? [{ updated_at: newest }] : [], rows.length);
  }
  if (method === "GET" && u.includes("select=collection,item_id,payload,version,updated_at")) {
    const targeted = u.includes("collection=in.(");
    if (targeted) log.targetedUrls.push(u);
    else {
      log.sweepPages += 1;
      log.sweepUrls.push(u);
    }
    const rows = rowsForUrl(u);
    const page = pageOf(rows, u);
    for (const row of page) log.servedCollections.add(row.collection);
    return respond(page, rows.length);
  }
  if (method === "POST" && u.includes("on_conflict")) {
    const body = Array.isArray(options.body) ? options.body : JSON.parse(options.body || "[]");
    const won = [];
    for (const row of body) {
      const key = row.collection + "\0" + row.item_id;
      if (table.has(key)) continue;
      table.set(key, { ...row, version: 1, updated_at: nextStamp() });
      won.push({ item_id: row.item_id });
    }
    return respond(won, null, 201);
  }
  if (method === "POST" && u.includes("rpc/leos_apply_core_mutations")) {
    const body = JSON.parse(options.body || "{}");
    for (const mutation of body.p_mutations || []) {
      if (mutation.operation === "delete") table.delete(mutation.collection + "\0" + mutation.item_id);
      else upsertRow(mutation.collection, mutation.item_id, mutation.payload);
    }
    return respond({ applied: (body.p_mutations || []).length });
  }
  return respond([]);
};

// Seed: a small business state plus a LARGE denial-audit history (the prod shape).
upsertRow("posts", "p-1", { id: "p-1", title: "one", status: "approved" });
upsertRow("tasks", "t-1", { id: "t-1", title: "task", status: "open" });
upsertRow("settings", "singleton", { alertsEnabled: false });
for (let i = 0; i < 2500; i += 1) upsertRow("soc2AuditLogs", "soc2-audit-access-" + i, { id: "soc2-audit-access-" + i, action: "access denied" });
for (let i = 0; i < 60; i += 1) upsertRow("auditEvents", "audit-" + i, { id: "audit-" + i, action: "event" });

const EXPECTED_FILTER = "collection=not.in.(authSessions," + [...hydrationExcludedCollections].join(",") + ")";

// ---- 1. hydration is bounded: the sweep excludes audit ledgers ------------------------------
{
  resetLog();
  const store = new SupabaseCoreStore({ posts: [], library: [], settings: {} });
  const state = await store.readState();
  assert.equal(log.sweepPages, 1, "3 business rows = exactly one sweep page (audit rows never paged)");
  assert.ok(log.sweepUrls.every((u) => u.includes(EXPECTED_FILTER)),
    "every sweep request carries the exclusion filter: " + EXPECTED_FILTER);
  assert.ok(!log.servedCollections.has("soc2AuditLogs") && !log.servedCollections.has("auditEvents"),
    "no audit-ledger row is ever served to hydration");
  assert.deepEqual(state.soc2AuditLogs, [], "soc2AuditLogs is deterministically empty in the graph");
  assert.deepEqual(state.auditEvents, [], "auditEvents is deterministically empty in the graph");
  assert.ok(state.posts.some((p) => p.id === "p-1"), "business collections hydrate normally");
  ok("hydration sweep is bounded: audit ledgers excluded by filter, not fetched then dropped");
}

// ---- 2. boot hydrates at most once, even while denial claims land ---------------------------
{
  resetLog();
  const store = new SupabaseCoreStore({ posts: [], library: [], settings: {} });
  // The prod boot wave: several endpoints read state while bot-probe denials write audit
  // claims between them. Pre-fix, EVERY claim bumped the write generation and forced a
  // fresh full sweep per read.
  await store.readState();
  await store.claimCollectionItems("soc2AuditLogs", [{ id: "soc2-denial-boot-1", action: "access denied" }]);
  await store.readState();
  await store.claimCollectionItems("soc2AuditLogs", [{ id: "soc2-denial-boot-2", action: "access denied" }]);
  await Promise.all([store.readState(), store.readState(), store.readState()]);
  assert.equal(log.sweepPages, 1, "one bounded hydration serves the whole boot wave");
  assert.equal(log.probeUrls.length, 0, "inside the TTL window no probe is needed either");
  ok("boot: at most one bounded hydration despite interleaved denial-audit claims");
}

// ---- 3. audit ledgers are excluded from the cache signature ---------------------------------
{
  resetLog();
  const store = new SupabaseCoreStore({ posts: [], library: [], settings: {} });
  await store.readState();
  // External denial (ANOTHER process wrote the claim): the table moved, but only in an
  // excluded ledger. The signature probe must not see it, so the cache must hold.
  upsertRow("soc2AuditLogs", "soc2-denial-external", { id: "soc2-denial-external", action: "access denied" });
  process.env.STATE_CACHE_TTL_MS = "1";
  await new Promise((resolve) => setTimeout(resolve, 10));
  resetLog();
  const again = await store.readState();
  assert.equal(log.probeUrls.length, 1, "past the TTL exactly one signature probe runs");
  assert.ok(log.probeUrls[0].includes(EXPECTED_FILTER), "the probe carries the same exclusion filter");
  assert.equal(log.sweepPages, 0, "an audit-only external write must NOT force a re-sweep");
  assert.deepEqual(again.soc2AuditLogs, [], "the graph still never contains the ledger");
  // Control: a BUSINESS write must still be caught by the same probe.
  upsertRow("posts", "p-2", { id: "p-2", title: "external business write" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  resetLog();
  const after = await store.readState();
  assert.equal(log.sweepPages, 1, "a business write still forces the authoritative re-sweep");
  assert.ok(after.posts.some((p) => p.id === "p-2"), "and the read reflects it");
  process.env.STATE_CACHE_TTL_MS = "60000";
  ok("signature: blind to audit ledgers, still catches business writes");
}

// ---- 4. Today / boot-state reads are targeted: zero full-table paging -----------------------
{
  for (const [name, list] of [["TODAY_SUMMARY_READ_COLLECTIONS", TODAY_SUMMARY_READ_COLLECTIONS], ["BOOT_STATE_READ_COLLECTIONS", BOOT_STATE_READ_COLLECTIONS]]) {
    assert.doesNotThrow(() => normalizeCollectionNames([...list]), name + " must contain only registered collections");
    for (const excluded of hydrationExcludedCollections) {
      assert.ok(!list.includes(excluded), name + " must not include the excluded ledger " + excluded);
    }
    resetLog();
    const store = new SupabaseCoreStore({ posts: [], library: [], settings: {} });
    const state = await store.readCollections(list);
    assert.equal(log.sweepPages, 0, name + ": a targeted read must never run the unfiltered sweep");
    assert.ok(log.targetedUrls.length >= 1, name + ": the read goes out as collection=in.(...) requests");
    assert.ok(log.targetedUrls.every((u) => !u.includes("soc2AuditLogs") && !u.includes("auditEvents")),
      name + ": no audit ledger is requested");
    assert.equal(state.persistence, "supabase");
    ok(name + ": targeted read only, no full-table paging, no audit ledgers");
  }
  // The summary itself works from exactly that subset (smoke: no throw, honest shape).
  resetLog();
  const store = new SupabaseCoreStore({ posts: [], library: [], settings: {} });
  const subset = await store.readCollections(TODAY_SUMMARY_READ_COLLECTIONS);
  const summary = buildTodaySummary({ ...subset, stripeRevenue: null, signups: null }, { now: () => "2026-07-25T00:00:00.000Z" });
  assert.ok(summary && summary.counts && typeof summary.counts.open === "number", "buildTodaySummary works from the targeted subset");
  ok("buildTodaySummary is fully served by TODAY_SUMMARY_READ_COLLECTIONS");
}

// ---- 5. structural: the handlers actually use the targeted lists ----------------------------
{
  const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const handlerBlock = (marker) => {
    const start = serverSource.indexOf(marker);
    assert.ok(start > -1, "handler not found: " + marker);
    const rest = serverSource.slice(start);
    const end = rest.indexOf("url.pathname ===", marker.length);
    return rest.slice(0, end > -1 ? end : rest.length);
  };
  const today = handlerBlock('url.pathname === "/api/today/summary"');
  assert.ok(today.includes("readCollections(TODAY_SUMMARY_READ_COLLECTIONS)"), "/api/today/summary reads the targeted list");
  assert.ok(!today.includes("store.readState()"), "/api/today/summary must not fall back to the full graph");
  const boot = handlerBlock('url.pathname === "/api/boot-state"');
  assert.ok(boot.includes("readCollections(BOOT_STATE_READ_COLLECTIONS)"), "/api/boot-state reads the targeted list");
  assert.ok(!boot.includes("store.readState()"), "/api/boot-state must not fall back to the full graph");
  ok("structural: /api/today/summary and /api/boot-state are wired to the targeted lists");
}

// ---- 6. drift guards: state reads in the source modules stay inside the lists ---------------
{
  const collectionReads = (source) => {
    const names = new Set();
    for (const match of source.matchAll(/\b(?:state|source|projected|next)\.([A-Za-z]+)\b/g)) {
      if (coreStateCollections.includes(match[1])) names.add(match[1]);
    }
    return names;
  };
  const todayModules = ["./company-memory-projector.mjs", "./reactivation-os.mjs"];
  const todaySet = new Set(TODAY_SUMMARY_READ_COLLECTIONS);
  for (const module of todayModules) {
    const reads = collectionReads(readFileSync(new URL(module, import.meta.url), "utf8"));
    const missing = [...reads].filter((name) => !todaySet.has(name));
    assert.deepEqual(missing, [], module + " reads collections missing from TODAY_SUMMARY_READ_COLLECTIONS: " + missing.join(", "));
  }
  const bootModules = ["./daily-run-session.mjs", "./operator-pulse-feeders.mjs"];
  const bootSet = new Set(BOOT_STATE_READ_COLLECTIONS);
  for (const module of bootModules) {
    const reads = collectionReads(readFileSync(new URL(module, import.meta.url), "utf8"));
    const missing = [...reads].filter((name) => !bootSet.has(name));
    assert.deepEqual(missing, [], module + " reads collections missing from BOOT_STATE_READ_COLLECTIONS: " + missing.join(", "));
  }
  // buildCompactBootState body itself (it lives in preview-server.mjs).
  const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const start = serverSource.indexOf("function buildCompactBootState");
  const body = serverSource.slice(start, serverSource.indexOf("\nfunction ", start + 1));
  const bodyReads = collectionReads(body);
  const missing = [...bodyReads].filter((name) => !bootSet.has(name));
  assert.deepEqual(missing, [], "buildCompactBootState reads collections missing from BOOT_STATE_READ_COLLECTIONS: " + missing.join(", "));
  ok("drift guards: every state read behind Today/boot-state is inside its targeted list");
}

// ---- 7. the exclusion surface itself ---------------------------------------------------------
{
  assert.ok(hydrationExcludedCollections.has("soc2AuditLogs"), "soc2AuditLogs is excluded");
  assert.ok(hydrationExcludedCollections.has("auditEvents"), "auditEvents is excluded");
  for (const name of hydrationExcludedCollections) {
    assert.ok(coreStateCollections.includes(name), name + " must stay a registered collection (exclusion is hydration-only)");
  }
  ok("exclusion surface: registered collections, hydration-only");
}

console.log("\nAll " + passed + " hydration-bounds checks passed.");
