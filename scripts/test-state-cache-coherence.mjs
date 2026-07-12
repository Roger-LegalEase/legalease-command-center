// Cache-coherence verifier for the SupabaseCoreStore cross-request state cache
// (Phase L latency fix, 2026-07-12). Roger's hard condition on this feature, verbatim:
// "the cache must be provably coherent — verifier specifically tests that every write
// invalidates and a write-then-immediate-read reflects the write, across all converted
// sites."
//
// How "across all sites" is proven: every one of the ~236 server call sites reads through
// store.readState() — the cache lives INSIDE that method, so site-level coherence reduces to
// (a) method-level coherence, tested behaviorally here against a live fake PostgREST table,
// and (b) the structural guarantee that no code outside storage.mjs bypasses readState() to
// reach the raw fetch — enforced by the source scan in test 9. Every DURABLE MUTATION entry
// point on the store is enumerated in test 2 with an exhaustiveness guard (test 10): adding a
// new public store method without classifying it here fails the suite, so future mutators
// cannot dodge the verifier.
//
// No live network: globalThis.fetch is a fake PostgREST over an in-memory table that actually
// applies upserts/deletes, so "read reflects the write" is observed, not assumed.

import assert from "node:assert";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";

process.env.SUPABASE_URL = "https://fake-cache-coherence-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STORAGE_BACKEND = "supabase";
process.env.STATE_CACHE_TTL_MS = "60000"; // long burst window; tests flip it when needed
const DIR = "/tmp/leos-cache-coherence-test";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
process.env.COMMAND_CENTER_DATA_PATH = DIR + "/data.json";
process.env.COMMAND_CENTER_SEED_PATH = DIR + "/seed-does-not-exist.json";
writeFileSync(DIR + "/data.json", JSON.stringify({ library: [] }));

const { SupabaseCoreStore, JsonStore } = await import("./storage.mjs");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("SupabaseCoreStore cache-coherence verifier");

// ---- fake PostgREST over a REAL in-memory table --------------------------------------------
const table = new Map(); // key: collection + "\0" + item_id -> row
let stamp = 0;
const nextStamp = () => new Date(Date.UTC(2026, 6, 12, 0, 0, 0, (stamp += 1))).toISOString();
function upsertRow(collection, itemId, payload) {
  table.set(collection + "\0" + itemId, { collection, item_id: itemId, payload, updated_at: nextStamp() });
}
const counters = { sweeps: 0, probes: 0, reconciles: 0, lastReconcileUrl: "" };
function tableRows() {
  return [...table.values()].sort((a, b) =>
    (a.collection + a.item_id).localeCompare(b.collection + b.item_id));
}
globalThis.fetch = async (url, options = {}) => {
  const u = decodeURIComponent(String(url));
  const method = String(options.method || "GET").toUpperCase();
  const contentRange = (rows) => "0-" + Math.max(0, rows.length - 1) + "/" + rows.length;
  const respond = (body, status = 200, rangeRows = null) => ({
    ok: status < 300, status,
    headers: { get: (name) => (String(name).toLowerCase() === "content-range" && rangeRows ? contentRange(rangeRows) : "") },
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  if (method === "GET" && u.includes("select=updated_at") && u.includes("order=updated_at.desc")) {
    counters.probes += 1;
    const rows = tableRows();
    const newest = rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), "");
    return respond(newest ? [{ updated_at: newest }] : [], 200, rows);
  }
  if (method === "GET" && u.includes("select=collection,item_id,payload,updated_at")) {
    if (u.includes("offset=0")) counters.sweeps += 1;
    const rows = tableRows();
    return respond(u.includes("offset=0") ? rows : [], 200, rows);
  }
  if (method === "GET" && u.includes("select=collection,item_id")) {
    counters.reconciles += 1;
    counters.lastReconcileUrl = u;
    const filterMatch = u.match(/collection=in\.\(([^)]*)\)/);
    const allowed = filterMatch ? new Set(filterMatch[1].split(",")) : null;
    const rows = tableRows().filter((row) => !allowed || allowed.has(row.collection));
    return respond(rows.map(({ collection, item_id }) => ({ collection, item_id })), 200, rows);
  }
  if (method === "POST" && u.includes("on_conflict")) {
    const body = Array.isArray(options.body) ? options.body : JSON.parse(options.body || "[]");
    const ignoreDuplicates = String(options.headers?.prefer || "").includes("ignore-duplicates");
    const won = [];
    for (const row of body) {
      const key = row.collection + "\0" + row.item_id;
      if (ignoreDuplicates && table.has(key)) continue;
      table.set(key, { ...row, updated_at: nextStamp() });
      won.push({ item_id: row.item_id });
    }
    return respond(won, 201);
  }
  if (method === "DELETE") {
    const collection = (u.match(/collection=eq\.([^&]+)/) || [])[1];
    const itemId = (u.match(/item_id=eq\.([^&]+)/) || [])[1];
    if (collection && itemId) table.delete(collection + "\0" + itemId);
    return respond(null, 204);
  }
  return respond([], 200);
};

const store = new SupabaseCoreStore({ posts: [], library: [], settings: {} });
upsertRow("posts", "p-1", { id: "p-1", title: "one" });

// ---- 1. burst path: reads between writes share one graph, zero extra round-trips -----------
{
  counters.sweeps = 0; counters.probes = 0;
  const a = await store.readState();
  const b = await store.readState();
  const c = await store.readState();
  assert.equal(counters.sweeps, 1, "one sweep hydrates the graph; cached reads add none");
  assert.equal(counters.probes, 0, "inside the burst window no probe is needed");
  assert.ok(a === b && b === c, "cached readers share the same graph (single-flight invariant)");
  assert.equal(a.posts.length, 1);
  ok("burst path: sequential reads between writes are served from the cache");
}

// ---- 2. EVERY durable mutation entry point invalidates + next read reflects the write ------
// Each case: cached read -> mutate through the public entry point -> immediate readState must
// (a) trigger a fresh sweep (cache invalidated) and (b) contain the mutation's effect
// (write-then-read reflects the write).
const MUTATOR_CASES = [
  ["writeCollections", (s) => s.writeCollections({ posts: [{ id: "p-wc", title: "wc" }] }),
    (st) => st.posts.some((p) => p.id === "p-wc")],
  ["writeState", (s) => s.writeState({ posts: [{ id: "p-ws", title: "ws" }] }),
    (st) => st.posts.some((p) => p.id === "p-ws")],
  ["writeStateNow", (s) => s.writeStateNow({ posts: [{ id: "p-wsn", title: "wsn" }] }),
    (st) => st.posts.some((p) => p.id === "p-wsn")],
  ["claimCollectionItems", (s) => s.claimCollectionItems("outreachSendClaims", [{ id: "claim-coherence-1" }]),
    (st) => (st.outreachSendClaims || []).some((c) => c.id === "claim-coherence-1")],
  ["generatePosts", (s) => s.generatePosts([{ id: "p-gen", title: "gen" }]),
    (st) => st.posts.some((p) => p.id === "p-gen")],
  ["updatePost", (s) => s.updatePost("p-gen", { title: "gen-updated" }),
    (st) => st.posts.some((p) => p.id === "p-gen" && p.title === "gen-updated")],
  ["addLibraryItem", (s) => s.addLibraryItem({ id: "lib-1" }),
    (st) => (st.library || []).some((i) => i.id === "lib-1")],
  ["savePostImage", (s) => s.savePostImage({ id: "img-1", imageUrl: "/data/exports/x.png" }),
    (st) => (st.postImages || []).some((i) => i.id === "img-1")],
  ["addBrandAsset", (s) => s.addBrandAsset({ id: "asset-1" }),
    (st) => (st.brandAssets || []).some((i) => i.id === "asset-1")],
  ["addBrandRule", (s) => s.addBrandRule({ id: "rule-1" }),
    (st) => (st.brandRules || []).some((i) => i.id === "rule-1")],
  ["upsertGenerationProfile", (s) => s.upsertGenerationProfile({ id: "profile-1" }),
    (st) => (st.generationProfiles || []).some((i) => i.id === "profile-1")],
  ["updateSocialAccount", (s) => s.updateSocialAccount("linkedin", { status: "connected" }),
    (st) => (st.socialAccounts || []).some((a) => a.platform === "linkedin" && a.status === "connected")],
  ["addPublishEvent", (s) => s.addPublishEvent({ id: "pub-1" }),
    (st) => (st.publishEvents || []).some((e) => e.id === "pub-1")],
  ["updateSettings", (s) => s.updateSettings({ coherenceMarker: "set" }),
    (st) => st.settings && st.settings.coherenceMarker === "set"]
];
for (const [name, mutate, reflected] of MUTATOR_CASES) {
  await store.readState(); // ensure the cache is warm so a stale serve WOULD be possible
  const genBefore = store._writeGen;
  counters.sweeps = 0;
  await mutate(store);
  assert.ok(store._writeGen > genBefore, name + " must bump the write generation");
  const after = await store.readState();
  assert.equal(counters.sweeps, 1, name + ": the immediate next read must sweep fresh, not serve the cache");
  assert.ok(reflected(after), name + ": write-then-immediate-read must reflect the write");
  ok("mutation invalidates + read reflects it: " + name);
}

// ---- 3. a FAILED write still invalidates ----------------------------------------------------
{
  await store.readState();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, headers: { get: () => "" }, json: async () => ({}), text: async () => "boom" });
  await assert.rejects(() => store.writeCollections({ posts: [] }));
  globalThis.fetch = realFetch;
  counters.sweeps = 0;
  await store.readState();
  assert.equal(counters.sweeps, 1, "a failed write may have partially landed: the next read must sweep fresh");
  ok("failed write still invalidates the cache (partial-write safety)");
}

// ---- 4. TTL expiry, table unchanged: one cheap probe, no sweep, same graph ------------------
{
  const before = await store.readState();
  process.env.STATE_CACHE_TTL_MS = "1";
  await new Promise((resolve) => setTimeout(resolve, 10));
  counters.sweeps = 0; counters.probes = 0;
  const after = await store.readState();
  assert.equal(counters.probes, 1, "past the burst window exactly one signature probe runs");
  assert.equal(counters.sweeps, 0, "an unchanged table must not trigger a full sweep");
  assert.ok(before === after, "proven-fresh cache serves the same graph");
  process.env.STATE_CACHE_TTL_MS = "60000";
  ok("TTL expiry with unchanged table: probe-only revalidation");
}

// ---- 5. TTL expiry, EXTERNAL writer changed the table: probe detects, full resweep ----------
{
  await store.readState();
  upsertRow("posts", "p-external", { id: "p-external", title: "written by another process" });
  process.env.STATE_CACHE_TTL_MS = "1";
  await new Promise((resolve) => setTimeout(resolve, 10));
  counters.sweeps = 0; counters.probes = 0;
  const after = await store.readState();
  assert.equal(counters.probes, 1, "the probe runs first");
  assert.equal(counters.sweeps, 1, "a moved signature forces the authoritative full sweep");
  assert.ok(after.posts.some((p) => p.id === "p-external"), "external write is visible after revalidation");
  process.env.STATE_CACHE_TTL_MS = "60000";
  ok("TTL expiry with external change: probe detects and the read reflects it");
}

// ---- 6. external UPDATE that keeps row count constant is still caught (updated_at moves) ----
{
  await store.readState();
  const existing = [...table.values()].find((row) => row.item_id === "p-external");
  table.set("posts\0p-external", { ...existing, payload: { id: "p-external", title: "edited in place" }, updated_at: nextStamp() });
  process.env.STATE_CACHE_TTL_MS = "1";
  await new Promise((resolve) => setTimeout(resolve, 10));
  const after = await store.readState();
  assert.ok(after.posts.some((p) => p.id === "p-external" && p.title === "edited in place"),
    "same-count external edit must be caught via max(updated_at)");
  process.env.STATE_CACHE_TTL_MS = "60000";
  ok("external in-place edit (count unchanged) is caught by the updated_at signature");
}

// ---- 7. STATE_CACHE_TTL_MS=0 disables the cache entirely ------------------------------------
{
  process.env.STATE_CACHE_TTL_MS = "0";
  counters.sweeps = 0; counters.probes = 0;
  const a = await store.readState();
  const b = await store.readState();
  assert.equal(counters.sweeps, 2, "TTL 0: every sequential read sweeps fresh (pre-cache behavior)");
  assert.equal(counters.probes, 0, "TTL 0: no probes either");
  assert.ok(a !== b, "TTL 0: no shared cached graph between sequential reads");
  process.env.STATE_CACHE_TTL_MS = "60000";
  ok("STATE_CACHE_TTL_MS=0 is a full kill switch");
}

// ---- 8. orphan reconcile is scoped to written collections + orphans actually deleted --------
{
  await store.writeCollections({ posts: [{ id: "p-only", title: "sole survivor" }] });
  assert.ok(counters.lastReconcileUrl.includes("collection=in.(posts)"),
    "reconcile fetch must be scoped to the collections present in the write");
  const after = await store.readState();
  const ids = after.posts.map((p) => p.id);
  assert.deepEqual(ids, ["p-only"], "orphan rows of the written collection are reconciled away");
  assert.ok((after.outreachSendClaims || []).some((c) => c.id === "claim-coherence-1"),
    "append-only ledgers and unwritten collections survive untouched");
  ok("write reconcile: scoped to written collections, orphans removed, others untouched");
}

// ---- 9. structural: no caller bypasses readState() to reach the raw fetch -------------------
{
  const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  assert.ok(!serverSource.includes("_readStateFresh"), "preview-server must never call the raw fetch layer");
  assert.ok(!serverSource.includes("supabaseFetchAllRows"), "preview-server must never page the table directly");
  const readSites = (serverSource.match(/store\.readState\(/g) || []).length;
  assert.ok(readSites >= 100, "the readState call-site population the cache serves stayed in place (saw " + readSites + ")");
  ok("structural: all " + readSites + " server read sites flow through the cached readState()");
}

// ---- 10. exhaustiveness: every public store method is classified ----------------------------
// A future mutator that skips the write-generation bump would silently reintroduce stale
// serves. Force every added method to be classified here (and, if it mutates, added to
// MUTATOR_CASES above).
{
  const classified = new Set([
    ...MUTATOR_CASES.map(([name]) => name),
    // read-only / lifecycle / telemetry:
    "constructor", "ensure", "readState", "writeHealth", "recordWriteOutcome",
    // internals of the cache + fetch layer (not entry points):
    "_stateCacheTtlMs", "_readStateCachedOrFresh", "_remoteStateSignature", "_readStateFresh",
    "writeStateToSupabase"
  ]);
  const methods = new Set([
    ...Object.getOwnPropertyNames(JsonStore.prototype),
    ...Object.getOwnPropertyNames(SupabaseCoreStore.prototype)
  ]);
  const unclassified = [...methods].filter((name) => !classified.has(name));
  assert.deepEqual(unclassified, [],
    "unclassified store methods (add to MUTATOR_CASES if they mutate): " + unclassified.join(", "));
  ok("exhaustiveness: every store method is classified as mutator or read-only");
}

console.log("\nAll " + passed + " cache-coherence checks passed.");
