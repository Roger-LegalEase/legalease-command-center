// Phase B PR 1 tests — atomic claim-before-send (incident 2026-07-08 duplicate sends).
// Proves the idempotency boundary the 12:00 and 15:00 batches were missing:
//   1.  reactivationSendClaims is registered (coreStateCollections) and append-only, never singleton.
//   2.  Two CONCURRENT sequencer invocations over the same state produce exactly ONE send per
//       (contact, step) — the loser of the atomic claim skips silently and logs the skip.
//   3.  Failure path: a transport error marks the claim FAILED (never deleted); a later run
//       skips the claimed (contact, step) and never auto-retries.
//   4.  Duplicate contact rows (the 2026-07-08 shred shape) yield ONE send and ONE claim.
//   5.  Fail closed: live-send-capable invocation without a durable claim path sends NOTHING.
//   6.  A claim-write failure blocks the send (claim ledger down => no SendGrid call).
//   7.  Dry-run posture unchanged: gates closed => dry_run attempts, ZERO claims burned.
//   8.  SupabaseCoreStore.claimCollectionItems is a true conditional insert (ignore-duplicates
//       on the (collection, item_id) unique key) and reports inserted vs skipped correctly.
//   9.  The snapshot reconcile-delete pass NEVER deletes reactivationSendClaims rows.
//   10. JsonStore.claimCollectionItems has the same inserted/skipped contract.
// No live database, no network: fetch is stubbed, transports are mocks. Nothing here sends.

import assert from "node:assert";

// --- fake Supabase backend BEFORE the store is exercised (real env must never be reachable) ---
process.env.SUPABASE_URL = "http://fake-supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STORAGE_BACKEND = "supabase";
process.env.LOCAL_DEMO_MODE = "false";
process.env.COMMAND_CENTER_DATA_PATH = "/tmp/leos-claims-test-data-does-not-exist.json";
process.env.COMMAND_CENTER_SEED_PATH = "/tmp/leos-claims-test-seed-does-not-exist.json";

// In-memory "leos_core_records" + PostgREST-ish stub that HONORS resolution=ignore-duplicates
// (insert only absent keys, return only inserted rows) — the exact contract the atomic claim
// depends on. Every request is recorded so tests can assert the on_conflict/prefer wire shape.
const table = new Map(); // `${collection}\0${item_id}` -> row
const requests = [];
const k = (c, i) => `${c}\0${i}`;
let failNextWrite = false;

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = (opts.method || "GET").toUpperCase();
  const prefer = String((opts.headers || {}).prefer || "");
  requests.push({ method, url: String(url), prefer });
  const ok = (text) => ({ ok: true, status: 200, statusText: "OK", async text() { return text; } });
  if (failNextWrite && method !== "GET") {
    failNextWrite = false;
    return { ok: false, status: 500, statusText: "boom", async text() { return "simulated outage"; } };
  }
  if (method === "GET") {
    const all = [...table.values()];
    const offset = Number(u.searchParams.get("offset") || 0);
    const limit = Number(u.searchParams.get("limit") || all.length);
    return ok(JSON.stringify(all.slice(offset, offset + limit)));
  }
  if (method === "POST") {
    const rows = JSON.parse(opts.body || "[]");
    const inserted = [];
    for (const row of rows) {
      const key = k(row.collection, row.item_id);
      if (prefer.includes("ignore-duplicates")) {
        if (table.has(key)) continue;
        table.set(key, row);
        inserted.push(row);
      } else {
        table.set(key, row); // merge-duplicates upsert
      }
    }
    if (prefer.includes("return=representation")) {
      const select = (u.searchParams.get("select") || "").split(",").filter(Boolean);
      const shaped = select.length
        ? inserted.map((row) => Object.fromEntries(select.map((c) => [c, row[c]])))
        : inserted;
      return ok(JSON.stringify(shaped));
    }
    return ok("");
  }
  if (method === "DELETE") {
    const collection = (u.searchParams.get("collection") || "").replace(/^eq\./, "");
    const itemId = (u.searchParams.get("item_id") || "").replace(/^eq\./, "");
    table.delete(k(collection, itemId));
    return ok("");
  }
  return { ok: false, status: 405, statusText: "Method Not Allowed", async text() { return ""; } };
};

const { coreStateCollections, singletonCollections, appendOnlyCollections, createStore, JsonStore } =
  await import("./storage.mjs");
const {
  REACTIVATION_CLAIMS_COLLECTION, reactivationClaimId, REACTIVATION_CAMPAIGN_ID,
  actReactivation, planReactivation, setReactivationLiveMode, buildReactivationEngine,
  buildReactivationLiveStatus
} = await import("./reactivation-os.mjs");

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

console.log("Reactivation send-claim tests");

// ---- 1. Registration: persisted, list-shaped, append-only ------------------------------------
{
  assert(coreStateCollections.includes(REACTIVATION_CLAIMS_COLLECTION),
    "reactivationSendClaims must be in coreStateCollections or Supabase silently drops it");
  assert(!singletonCollections.has(REACTIVATION_CLAIMS_COLLECTION), "claims are a list, not a singleton");
  assert(appendOnlyCollections.has(REACTIVATION_CLAIMS_COLLECTION),
    "claims must be append-only: reconcile-delete would re-open the duplicate-send window");
  ok("reactivationSendClaims registered, list-shaped, append-only");
}

// ---- fixtures: armed live state + mock claim ledger + mock transport --------------------------
const ENV = { SENDGRID_API_KEY: "SG.fake" };          // key present; authority comes from live mode
const IN_WINDOW = new Date("2026-07-01T15:00:00Z");   // Wed 11:00 ET, inside 8-17 weekday window

function contactsFixture(n) {
  const providers = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com"];
  return Array.from({ length: n }, (_, i) => ({
    contact_id: `react-claim-test-${i}`,
    email: `person${i}@${providers[i % providers.length]}`,
    first_name: `P${i}`,
    full_name: `P${i} Test`,
    priority: "cold",
    wave: (i % 2) + 1,
    enrolled_at: "2026-06-28T12:00:00Z",
    sequence_status: "Enrolled"
  }));
}

function armedState(n = 8) {
  const base = {
    reactivationCampaign: { campaignId: REACTIVATION_CAMPAIGN_ID, status: "active", releasedWaves: [1, 2] },
    reactivationContacts: contactsFixture(n),
    reactivationAttempts: [],
    reactivationEvents: [],
    reactivationSendClaims: [],
    outreachSuppressions: [],
    autopilotSettings: {},
    heartbeatRuns: []
  };
  return setReactivationLiveMode(base, { enabled: true, now: "2026-07-01T14:00:00Z" }).state;
}

// Mock durable claim ledger. Each call is atomic (synchronous check+insert, like the database's
// unique key); the latency BEFORE it makes two concurrent act() loops genuinely interleave.
function claimLedger() {
  const rows = new Map();
  return {
    rows,
    fn: async (claims) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
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

function mockTransport() {
  const sends = [];
  return {
    sends,
    fn: async (message) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      sends.push(message.to);
      return { status: "sent", provider: "mock", provider_message_id: `mid-${sends.length}` };
    }
  };
}

// ---- 2. Two concurrent invocations => exactly one send per (contact, step) --------------------
{
  const state = armedState(8);
  const proposals = planReactivation(state, { env: ENV, now: IN_WINDOW }).proposals;
  assert(proposals.length === 8, "all 8 fixtures are due");
  const ledger = claimLedger();
  const transport = mockTransport();
  const ctx = { env: ENV, now: IN_WINDOW, claimReactivationSends: ledger.fn, runReactivationSend: transport.fn };
  const [a, b] = await Promise.all([actReactivation(state, ctx), actReactivation(state, ctx)]);

  assert.equal(transport.sends.length, 8, `8 unique sends expected, got ${transport.sends.length}`);
  assert.equal(new Set(transport.sends).size, 8, "no recipient received a duplicate");
  const skips = [...a.results, ...b.results].filter((r) => r.reason === "already_claimed_concurrent");
  assert.equal(skips.length, 8, "the losing invocation skipped silently and logged every skip");
  assert.equal(ledger.rows.size, 8, "one claim per (contact, step)");
  for (const claim of ledger.rows.values()) assert.equal(claim.status, "claimed", "durable row written before send");
  const winners = [...a.results, ...b.results].filter((r) => r.status === "sent");
  assert.equal(winners.length, 8, "each contact sent exactly once across both invocations");
  // In-memory transitions carry the outcome for the closing write.
  const resolved = [...a.state.reactivationSendClaims, ...b.state.reactivationSendClaims].filter((c) => c.status === "sent");
  assert.equal(resolved.length, 8, "winning invocation marked its claims sent with the message id");
  assert(resolved.every((c) => c.provider_message_id.startsWith("mid-")), "SendGrid message id recorded on the claim");
  ok("concurrent double invocation: one send per (contact, step), loser skips and logs");
}

// ---- 3. Failure path: claim marked failed, kept, never auto-retried ---------------------------
{
  const state = armedState(2);
  const ledger = claimLedger();
  const failingTransport = async (message) => {
    if (message.to.startsWith("person0@")) throw new Error("SendGrid timeout");
    return { status: "sent", provider: "mock", provider_message_id: "mid-ok" };
  };
  const first = await actReactivation(state, { env: ENV, now: IN_WINDOW, claimReactivationSends: ledger.fn, runReactivationSend: failingTransport });
  const failedClaim = first.state.reactivationSendClaims.find((c) => c.to.startsWith("person0@"));
  assert(failedClaim, "claim for the failed send exists — failure never deletes a claim");
  assert.equal(failedClaim.status, "failed");
  assert(failedClaim.reason.includes("SendGrid timeout"), "failure reason recorded on the claim");
  assert(first.results.some((r) => r.status === "error" && r.reason.includes("SendGrid timeout")));

  // Re-run over the resulting state: the failed (contact, step) is claimed => skipped, no resend.
  const retryTransport = mockTransport();
  const second = await actReactivation(first.state, { env: ENV, now: IN_WINDOW, claimReactivationSends: ledger.fn, runReactivationSend: retryTransport.fn });
  assert(!retryTransport.sends.some((to) => to.startsWith("person0@")), "a failed claim is NEVER silently re-enqueued");
  assert(second.results.some((r) => r.reason === "already_claimed"), "the skip is logged, not silent-dropped");
  assert.equal(ledger.rows.size, 2, "no second claim row was minted for the failed send");
  ok("transport failure: claim marked failed and kept; later run skips, never auto-retries");
}

// ---- 4. Duplicate contact rows (the 2026-07-08 shred shape) => one send, one claim ------------
{
  const state = armedState(2);
  const [c0] = state.reactivationContacts;
  state.reactivationContacts = [c0, { ...c0 }, ...state.reactivationContacts.slice(1)]; // duplicate row
  const ledger = claimLedger();
  const transport = mockTransport();
  const result = await actReactivation(state, { env: ENV, now: IN_WINDOW, claimReactivationSends: ledger.fn, runReactivationSend: transport.fn });
  assert.equal(transport.sends.filter((to) => to === c0.email).length, 1, "duplicate rows produce ONE send");
  assert.equal([...ledger.rows.keys()].filter((id) => id === reactivationClaimId(REACTIVATION_CAMPAIGN_ID, c0.contact_id, 1)).length, 1,
    "one claim for the duplicated contact");
  assert.equal(transport.sends.length, 2, "the other contact still sends normally");
  assert(result.state.reactivationSendClaims.length === 2);
  ok("duplicate contact rows: one (contact, step) claim, one send");
}

// ---- 5. Fail closed: live-send-capable invocation without a claim path sends NOTHING ----------
{
  const transport = mockTransport();
  const result = await actReactivation(armedState(3), { env: ENV, now: IN_WINDOW, runReactivationSend: transport.fn });
  assert.equal(transport.sends.length, 0, "no durable claim path => zero SendGrid calls");
  assert(result.results.length >= 3 && result.results.every((r) => r.status === "not_sent" && r.reason === "no_claim_path"));
  assert.equal(result.state.reactivationSendClaims.length, 0);
  ok("no claim path: live send fails closed, nothing reaches the transport");
}

// ---- 6. Claim-write failure blocks the send ----------------------------------------------------
{
  const transport = mockTransport();
  const result = await actReactivation(armedState(2), {
    env: ENV, now: IN_WINDOW, runReactivationSend: transport.fn,
    claimReactivationSends: async () => { throw new Error("supabase down"); }
  });
  assert.equal(transport.sends.length, 0, "claim ledger unreachable => no sends");
  assert(result.results.every((r) => r.status === "error" && r.reason.startsWith("claim_write_failed:")));
  ok("claim-write failure: fail closed, the ledger is the permission to send");
}

// ---- 7. Dry-run posture unchanged: closed gates burn ZERO claims -------------------------------
{
  const base = armedState(2);
  const disarmed = setReactivationLiveMode(base, { enabled: false, now: "2026-07-01T14:30:00Z" }).state;
  const ledger = claimLedger();
  const result = await actReactivation(disarmed, { env: ENV, now: IN_WINDOW, claimReactivationSends: ledger.fn });
  assert(result.state.reactivationAttempts.length > 0 && result.state.reactivationAttempts.every((a) => a.status === "dry_run"));
  assert.equal(ledger.rows.size, 0, "dry runs never consume durable claims");
  assert.equal(result.state.reactivationSendClaims.length, 0);
  ok("dry-run path records attempts but burns no claims");
}

// ---- engine passthrough + status surface -------------------------------------------------------
{
  const ledger = claimLedger();
  const transport = mockTransport();
  const engine = buildReactivationEngine({ runReactivationSend: transport.fn, claimReactivationSends: ledger.fn });
  const state = armedState(2);
  state.autopilotSettings = { "reactivation-sequencer": { enabled: true } };
  const er = await engine.act(state, { env: ENV, now: IN_WINDOW });
  assert.equal(transport.sends.length, 2, "engine.act threads the claim path through");
  assert.equal(ledger.rows.size, 2);
  // Status view surfaces unconfirmed claims (status "claimed" past the grace window).
  const stale = {
    ...er.state,
    reactivationSendClaims: [
      ...er.state.reactivationSendClaims,
      { id: "react-claim-x", contact_id: "cx", step_number: 1, to: "x@gmail.com", status: "claimed", claimed_at: "2026-07-01T10:00:00Z" }
    ]
  };
  const status = buildReactivationLiveStatus(stale, { env: ENV, now: IN_WINDOW });
  assert.equal(status.sendClaims.total, 3);
  assert.equal(status.sendClaims.sent, 2);
  assert.equal(status.sendClaims.unconfirmedCount, 1, "stale claimed rows surface for operator decision");
  assert.equal(status.sendClaims.unconfirmed[0].id, "react-claim-x");
  ok("engine passes the claim path through; unconfirmed claims surface in the live status");
}

// ---- 8. SupabaseCoreStore.claimCollectionItems: true conditional insert ------------------------
{
  const store = createStore({});
  assert.equal(store.kind, "supabase", "fixture must exercise the Supabase store");
  table.set(k("reactivationSendClaims", "react-claim-a"), {
    collection: "reactivationSendClaims", item_id: "react-claim-a",
    payload: { id: "react-claim-a", status: "claimed" }, updated_at: "seed"
  });
  requests.length = 0;
  const outcome = await store.claimCollectionItems("reactivationSendClaims", [
    { id: "react-claim-a", status: "claimed" },   // exists => must be skipped
    { id: "react-claim-b", status: "claimed" }    // absent => must be inserted
  ]);
  assert.deepEqual(outcome.inserted.map((c) => c.id), ["react-claim-b"]);
  assert.deepEqual(outcome.skipped.map((c) => c.id), ["react-claim-a"]);
  assert(table.has(k("reactivationSendClaims", "react-claim-b")), "winner row landed durably");
  assert.equal(table.get(k("reactivationSendClaims", "react-claim-a")).updated_at, "seed",
    "ignore-duplicates must NOT overwrite the existing claim");
  const post = requests.find((r) => r.method === "POST");
  assert(post.url.includes("on_conflict=collection,item_id"), "atomicity rides the unique key");
  assert(post.prefer.includes("resolution=ignore-duplicates"), "conditional insert, not upsert");
  assert(post.prefer.includes("return=representation"), "response must reveal who won");
  assert.equal(store.writeHealth().failedWriteCount, 0);

  // Outage: the claim call throws (caller must not send) and writeHealth records it.
  failNextWrite = true;
  await assert.rejects(() => store.claimCollectionItems("reactivationSendClaims", [{ id: "react-claim-c" }]));
  assert.equal(store.writeHealth().failedWriteCount, 1, "claim failures are visible in writeHealth");
  ok("Supabase claim: conditional insert wire shape, inserted/skipped truth, fail-closed on outage");
}

// ---- 9. Reconcile-delete NEVER touches the claims collection -----------------------------------
{
  const store = createStore({});
  table.set(k("reactivationSendClaims", "react-claim-old"), {
    collection: "reactivationSendClaims", item_id: "react-claim-old",
    payload: { id: "react-claim-old", status: "sent" }, updated_at: "seed"
  });
  table.set(k("posts", "post-orphan"), { collection: "posts", item_id: "post-orphan", payload: { id: "post-orphan" }, updated_at: "seed" });
  // Snapshot contains NEITHER row: a normal collection reconciles (orphan deleted); the
  // append-only claims ledger must survive untouched.
  await store.writeCollections({
    posts: [{ id: "post-keep" }],
    reactivationSendClaims: [{ id: "react-claim-new", status: "claimed" }]
  });
  assert(!table.has(k("posts", "post-orphan")), "control: normal collections still reconcile orphans");
  assert(table.has(k("reactivationSendClaims", "react-claim-old")),
    "a stale snapshot must NEVER delete claims it has not seen (the 2026-07-08 clobber shape)");
  assert(table.has(k("reactivationSendClaims", "react-claim-new")), "new claim rows still upsert");
  ok("append-only exclusion: snapshot reconcile cannot erase claims");
}

// ---- 10. JsonStore.claimCollectionItems: same contract, queued read-check-append-write ---------
{
  const dir = "/tmp/leos-claims-json-test";
  process.env.COMMAND_CENTER_DATA_PATH = dir + "/data.json";
  process.env.COMMAND_CENTER_SEED_PATH = dir + "/seed-does-not-exist.json";
  const { rm } = await import("node:fs/promises");
  await rm(dir, { recursive: true, force: true });
  const store = new JsonStore({});
  const first = await store.claimCollectionItems("reactivationSendClaims", [{ id: "react-claim-j1" }]);
  assert.deepEqual(first.inserted.map((c) => c.id), ["react-claim-j1"]);
  // Concurrent second round: one duplicate, one fresh — the queue serializes them.
  const [again, fresh] = await Promise.all([
    store.claimCollectionItems("reactivationSendClaims", [{ id: "react-claim-j1" }]),
    store.claimCollectionItems("reactivationSendClaims", [{ id: "react-claim-j2" }])
  ]);
  assert.equal(again.inserted.length, 0);
  assert.equal(again.skipped.length, 1);
  assert.deepEqual(fresh.inserted.map((c) => c.id), ["react-claim-j2"]);
  const state = await store.readState();
  assert.equal(state.reactivationSendClaims.length, 2, "exactly two claims persisted");
  await rm(dir, { recursive: true, force: true });
  ok("JsonStore claim: inserted/skipped contract holds under concurrent callers");
}

console.log(`\nAll ${passed} reactivation send-claim tests passed.`);
