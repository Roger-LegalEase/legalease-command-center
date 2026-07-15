// Regression tests for the 2026-07-09 OOM fix: single-flight readState in SupabaseCoreStore.
//
// Ten heap-OOM crashes on 2026-07-09 (one per hourly tick during send hours, plus a boot
// crash-loop) came from CONCURRENT full-state reads: the heartbeat tick, SendGrid webhook
// bursts, and UI polls each built their own ~13k-row object graph at the same time against
// the default ~256MB heap. The fix: concurrent readers share ONE in-flight fetch and ONE
// returned graph, invalidated by a write-generation counter so a mutation can never compute
// on a graph fetched before the previous mutation landed, and the on-disk JSON fallback
// (~590KB, static deploy content under the supabase backend) is parsed once per process.
//
// 2026-07-12 (Phase L): a cross-request TTL cache now sits on top of single-flight. This
// suite pins the UNDERLYING single-flight semantics with the cache disabled
// (STATE_CACHE_TTL_MS=0); the cache's own coherence contract — every write invalidates,
// write-then-immediate-read reflects the write — lives in test-state-cache-coherence.mjs.
//
// Proves (with the cache OFF):
//   1. Concurrent readState calls share one fetch sweep and one object graph.
//   2. Sequential reads stay FRESH: with the cache disabled, every non-concurrent read
//      refetches.
//   3. Write invalidation: a readState issued after a write never joins a pre-write
//      in-flight read (the lost-update hazard), for writeCollections AND for
//      claimCollectionItems, and even when the write FAILS (partial-write safety).
//   4. The JSON fallback file is parsed once per process (cache-by-design documented).
//   5. A failed Supabase read clears the in-flight slot so the next read retries.
// No live network: globalThis.fetch is a fake PostgREST. Nothing here contacts Supabase.

import assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

process.env.SUPABASE_URL = "https://fake-singleflight-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STORAGE_BACKEND = "supabase";
process.env.STATE_CACHE_TTL_MS = "0"; // pin single-flight semantics; the cache has its own suite
const DIR = "/tmp/leos-singleflight-test";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
process.env.COMMAND_CENTER_DATA_PATH = DIR + "/data.json";
process.env.COMMAND_CENTER_SEED_PATH = DIR + "/seed-does-not-exist.json";
// Fallback marker: library is a JsonStore-merged collection, visible through readState.
writeFileSync(DIR + "/data.json", JSON.stringify({ library: [{ id: "fallback-marker-v1" }] }));

const { SupabaseCoreStore } = await import("./storage.mjs");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("SupabaseCoreStore single-flight readState tests");

// ---- fake PostgREST -----------------------------------------------------------------------
const TABLE = [
  { collection: "posts", item_id: "p-1", payload: { id: "p-1", title: "one" }, updated_at: "2026-07-09T00:00:00.000Z" },
  { collection: "posts", item_id: "p-2", payload: { id: "p-2", title: "two" }, updated_at: "2026-07-09T00:00:00.000Z" }
];
let getSweeps = 0;        // counts page-0 GETs (one per read sweep)
let gate = null;          // when set, GETs wait on it (to hold a read in flight)
let failReads = false;
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const method = String(options.method || "GET").toUpperCase();
  const respond = (body, status = 200) => ({
    ok: status < 300, status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  if (
    method === "GET"
    && (
      u.includes("select=collection%2Citem_id%2Cpayload%2Cversion%2Cupdated_at")
      || u.includes("select=collection,item_id,payload,version,updated_at")
    )
  ) {
    if (u.includes("offset=0")) getSweeps += 1;
    if (gate) await gate;
    if (failReads) return respond({ message: "boom" }, 500);
    return respond(u.includes("offset=0") ? TABLE : []);
  }
  if (
    method === "GET"
    && (
      u.includes("select=collection%2Citem_id%2Cpayload%2Cversion&collection=eq.posts")
      || u.includes("select=collection,item_id,payload,version&collection=eq.posts")
    )
  ) {
    return respond([{ ...TABLE[0], version: 1 }]);
  }
  if (method === "GET") return respond([]);
  if (method === "POST" && u.includes("on_conflict")) {
    // claim insert: report both rows won; write path upsert: minimal
    const body = Array.isArray(options.body) ? options.body : JSON.parse(options.body || "[]");
    return respond(body.map((r) => ({ item_id: r.item_id })), 201);
  }
  if (method === "DELETE") return respond(null, 204);
  return respond(null, 200);
};

const store = new SupabaseCoreStore({ posts: [], library: [] });

// ---- 1. concurrent reads share one sweep and one graph -----------------------------------
{
  getSweeps = 0;
  const [a, b, c] = await Promise.all([store.readState(), store.readState(), store.readState()]);
  assert.equal(getSweeps, 1, "three concurrent readers must produce exactly one fetch sweep");
  assert.ok(a === b && b === c, "concurrent readers share the SAME object graph");
  assert.equal(a.posts.length, 2);
  assert.equal(a.persistence, "supabase");
  ok("concurrent readState calls share one fetch sweep and one object graph");
}

// ---- 2. sequential reads stay fresh --------------------------------------------------------
{
  getSweeps = 0;
  const first = await store.readState();
  const second = await store.readState();
  assert.equal(getSweeps, 2, "non-concurrent reads must each refetch (cache disabled via STATE_CACHE_TTL_MS=0)");
  assert.ok(first !== second, "sequential reads build fresh graphs");
  ok("sequential reads refetch: single-flight alone is not a cache (TTL=0 kill switch works)");
}

// ---- 3a. write invalidation: writeCollections ---------------------------------------------
{
  let release;
  gate = new Promise((r) => { release = r; });
  const preWriteRead = store.readState();          // holds in flight at the gate
  await store.writeCollections({ posts: [{ id: "p-3", title: "three" }] });
  const postWritePromise = store.readState();      // must NOT join the pre-write read
  release(); gate = null;
  const [pre, post] = await Promise.all([preWriteRead, postWritePromise]);
  assert.ok(pre !== post, "a read issued after a write never joins the pre-write in-flight read");
  ok("write invalidation: post-write readState starts fresh (lost-update hazard closed)");
}

// ---- 3b. write invalidation: claimCollectionItems ------------------------------------------
{
  let release;
  gate = new Promise((r) => { release = r; });
  const preClaimRead = store.readState();
  await store.claimCollectionItems("outreachSendClaims", [{ id: "outreach-claim-t-1-step-1" }]);
  const postClaimPromise = store.readState();
  release(); gate = null;
  const [pre, post] = await Promise.all([preClaimRead, postClaimPromise]);
  assert.ok(pre !== post, "claims are durable mutations: post-claim read starts fresh");
  ok("claim invalidation: post-claim readState never joins a pre-claim read");
}

// ---- 3c. failed writes still invalidate ----------------------------------------------------
{
  const realFetch = globalThis.fetch;
  let release;
  gate = new Promise((r) => { release = r; });
  const preRead = store.readState();
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "boom" });
  await assert.rejects(() => store.writeCollections({ posts: [{ id: "p-failed", title: "failed write probe" }] }));
  globalThis.fetch = realFetch;
  const postFailPromise = store.readState();
  release(); gate = null;
  const [pre, post] = await Promise.all([preRead, postFailPromise]);
  assert.ok(pre !== post, "even a FAILED write invalidates (partial upsert may have landed)");
  ok("failed write still invalidates the in-flight read (safe direction)");
}

// ---- 4. fallback file parsed once per process ----------------------------------------------
{
  const before = await store.readState();
  assert.equal((before.library || [])[0]?.id, "fallback-marker-v1", "fallback content hydrates");
  writeFileSync(DIR + "/data.json", JSON.stringify({ library: [{ id: "fallback-marker-v2" }] }));
  const after = await store.readState();
  assert.equal((after.library || [])[0]?.id, "fallback-marker-v1",
    "fallback is cached per process BY DESIGN (static deploy content under the supabase backend)");
  ok("JSON fallback parsed once per process; runtime file edits are not re-read (documented)");
}

// ---- 5. failed read clears the in-flight slot ----------------------------------------------
{
  failReads = true;
  const degraded = await store.readState();
  assert.equal(degraded.persistence, "supabase_unavailable", "read failure degrades, never throws");
  failReads = false;
  const recovered = await store.readState();
  assert.equal(recovered.persistence, "supabase", "next read retries fresh after a failure");
  ok("failed read clears the slot; the next read retries and recovers");
}

// ---- 5b. one failed write must not brick the write queue ----------------------------------
{
  // Test 3c above already rejected one write. If the queue stayed rejected, every write
  // from here on would fail without executing (the pre-existing poisoning defect): one
  // transient Supabase error would brick all persistence until a restart.
  await store.writeCollections({ posts: [{ id: "p-9", title: "after-failure" }] });
  ok("write queue re-arms after a failed write; later writes execute normally");
}

// ---- 6. convenience mutators never mutate the shared graph ---------------------------------
{
  let release;
  gate = new Promise((r) => { release = r; });
  const readerPromise = store.readState();          // reader in flight
  const mutatorJoin = store.updatePost("p-1", { title: "mutated" }); // joins the same read
  release(); gate = null;
  const reader = await readerPromise;
  const beforeTitles = (reader.posts || []).map((p) => p.title).join(",");
  await mutatorJoin;
  const afterTitles = (reader.posts || []).map((p) => p.title).join(",");
  assert.equal(afterTitles, beforeTitles,
    "updatePost must shallow-copy: a concurrent reader's shared graph must never change under it");
  ok("convenience mutators shallow-copy: shared reader graphs stay untouched");
}

console.log(`\nAll ${passed} single-flight readState checks passed.`);
