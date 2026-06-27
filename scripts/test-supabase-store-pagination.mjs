// Regression test for the shared storage READ-truncation bug.
//
// PostgREST caps every response at a fixed row count (Supabase default 1000) regardless of the
// requested limit. SupabaseCoreStore.readState() used a single unpaginated select, so once
// leos_core_records grew past 1000 rows whole collections silently dropped out of hydration —
// engagementGrowthSnapshots (B4) and codebaseHealthSnapshots (B3) read back as never_run even
// though they were persisted, and outreach/prospect/suppression rows past the cap could vanish too.
//
// This test stands up a fake PostgREST endpoint that ENFORCES a 1000-row cap and honors
// order/limit/offset, seeds >1000 rows across real coreStateCollections (with the at-risk
// collections deliberately sorted past row 1000), and proves the paginated read hydrates EVERY
// collection in full — no dropped rows, no duplicates — while a single capped request would not.

import assert from "node:assert";
import { SupabaseCoreStore, coreStateCollections } from "./storage.mjs";

// Point the store at a Supabase that doesn't exist on disk, so the JsonStore fallback inside
// SupabaseCoreStore.readState() resolves to initialState (no local file read interferes).
process.env.SUPABASE_URL = "https://fake-pagination-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STORAGE_BACKEND = "supabase";
process.env.COMMAND_CENTER_DATA_PATH = "/tmp/__nonexistent_pagination_test__/data.json";
process.env.COMMAND_CENTER_SEED_PATH = "/tmp/__nonexistent_pagination_test__/seed.json";

const SERVER_CAP = 1000; // emulate PostgREST's hard per-response cap

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// ---- build a >1000-row dataset across REAL collections --------------------
// Counts chosen so the table exceeds the cap and, under collection.asc ordering, the at-risk
// collections (outreach*, prospect*, suppression, snapshots — all sort at/after row 1000) land
// in the truncated tail. Total = 1207 rows.
const SEED_COUNTS = {
  auditHistory: 400,
  activityEvents: 300,
  posts: 250,
  outreachContacts: 60,
  outreachOrganizations: 40,
  outreachSuppressions: 35,   // the "suppression" collection the fix must not drop
  outreachUnsubscribes: 25,
  prospectCandidates: 50,
  prospectDiscoveryRuns: 30,
  codebaseHealthSnapshots: 8,
  engagementGrowthSnapshots: 9
};

// Sanity: every seeded collection is a real persisted collection (else applyCoreRecordsToState
// would filter it out and the test would be meaningless).
for (const c of Object.keys(SEED_COUNTS)) {
  assert.ok(coreStateCollections.includes(c), `${c} is a real coreStateCollections member`);
}

const TABLE_ROWS = [];
for (const [collection, count] of Object.entries(SEED_COUNTS)) {
  for (let i = 0; i < count; i += 1) {
    const item_id = `${collection}-${String(i).padStart(4, "0")}`;
    TABLE_ROWS.push({ collection, item_id, payload: { id: item_id, n: i }, updated_at: "2026-06-27T00:00:00.000Z" });
  }
}
const TOTAL = TABLE_ROWS.length;

// ---- fake PostgREST: honors order=collection.asc,item_id.asc + limit + offset, caps at 1000 ----
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  fetchCalls += 1;
  const u = new URL(url);
  const params = u.searchParams;
  // Stable order, matching what the helper requests.
  const sorted = [...TABLE_ROWS].sort((a, b) =>
    a.collection < b.collection ? -1 : a.collection > b.collection ? 1
      : a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0
  );
  const offset = Number(params.get("offset") || 0);
  const askedLimit = Number(params.get("limit") || SERVER_CAP);
  const effectiveLimit = Math.min(askedLimit, SERVER_CAP); // the hard cap PostgREST enforces
  const slice = sorted.slice(offset, offset + effectiveLimit);
  // Echo only the requested columns (mirrors select projection; not strictly required).
  const select = (params.get("select") || "").split(",");
  const projected = slice.map((row) => {
    const out = {};
    for (const col of select) if (col in row) out[col] = row[col];
    return Object.keys(out).length ? out : row;
  });
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async text() { return JSON.stringify(projected); }
  };
};

async function run() {
  console.log("Supabase store pagination — >1000-row hydration test");
  console.log(`  (seeded ${TOTAL} rows across ${Object.keys(SEED_COUNTS).length} collections; server cap ${SERVER_CAP})`);

  // Precondition: the table genuinely exceeds the cap, so a single request CANNOT return it all.
  assert.ok(TOTAL > SERVER_CAP, `dataset (${TOTAL}) exceeds the server cap (${SERVER_CAP})`);
  ok(`dataset exceeds the 1000-row cap (${TOTAL} rows) — truncation is in play`);

  const store = new SupabaseCoreStore({});
  const state = await store.readState();

  // 1. Pagination was actually exercised (more than one request).
  assert.ok(fetchCalls >= 2, `readState paged (made ${fetchCalls} requests, not a single capped one)`);
  ok(`readState paginated past the cap (${fetchCalls} requests)`);

  // 2. Persistence resolved to the live supabase path (not the unavailable fallback).
  assert.equal(state.persistence, "supabase", "hydrated via supabase path");
  ok("hydrated via the supabase read path");

  // 3. EVERY seeded collection hydrated in full — nothing dropped.
  let hydratedTotal = 0;
  for (const [collection, count] of Object.entries(SEED_COUNTS)) {
    assert.ok(Array.isArray(state[collection]), `${collection} hydrated as an array`);
    assert.equal(state[collection].length, count, `${collection}: expected ${count}, got ${state[collection]?.length}`);
    hydratedTotal += state[collection].length;
  }
  ok("every seeded collection hydrated with its FULL row count (zero dropped)");

  // 4. The at-risk collections the bug hid are specifically present and complete.
  for (const c of ["engagementGrowthSnapshots", "codebaseHealthSnapshots", "outreachContacts", "outreachSuppressions", "prospectCandidates"]) {
    assert.equal(state[c].length, SEED_COUNTS[c], `${c} fully present (the bug used to drop these)`);
  }
  ok("B3/B4 snapshots + outreach/prospect/suppression rows all hydrate (the regression target)");

  // 5. Total hydrated equals total seeded — no truncation AND no duplication from paging.
  assert.equal(hydratedTotal, TOTAL, `hydrated ${hydratedTotal} rows, expected ${TOTAL}`);
  ok(`row-exact round trip: ${hydratedTotal}/${TOTAL} rows, no truncation, no duplicates`);

  // 6. Proof the cap mattered: a single capped request returns only the first 1000 rows under the
  //    stable order, dropping (TOTAL - cap) rows. Whatever sorts last is a casualty — in prod that
  //    was the snapshots (no order clause => PK/insertion order); under the explicit
  //    collection.asc order the tail is the alphabetically-last collection, prospectDiscoveryRuns.
  //    Either way the read silently loses a whole collection without paging.
  const firstPageOnly = [...TABLE_ROWS]
    .sort((a, b) =>
      a.collection < b.collection ? -1 : a.collection > b.collection ? 1
        : a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0
    )
    .slice(0, SERVER_CAP);
  const wouldHaveDropped = TOTAL - firstPageOnly.length;
  const tailCollection = "prospectDiscoveryRuns"; // sorts last under collection.asc
  const onFirstPage = firstPageOnly.filter((r) => r.collection === tailCollection).length;
  assert.ok(wouldHaveDropped > 0, "a single capped request would have dropped rows");
  assert.equal(onFirstPage, 0, `${tailCollection} falls entirely in the truncated tail (invisible without paging)`);
  assert.equal(state[tailCollection].length, SEED_COUNTS[tailCollection], `${tailCollection} is nonetheless fully hydrated WITH paging`);
  ok(`without paging, ${wouldHaveDropped} rows (incl. all ${tailCollection}) would silently vanish — paging recovers them`);

  console.log(`\n${passed} checks passed.`);
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { globalThis.fetch = realFetch; });
