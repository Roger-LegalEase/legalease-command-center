// Supabase core-mutation serialization verifier (2026-07-25 lock-convoy hotfix).
//
// Live evidence: ~45 PostgREST sessions were concurrently executing
// public.leos_apply_core_mutations, most of them waiting on advisory locks, with long
// blocker chains. leos_apply_core_mutations takes a per-record pg_advisory_xact_lock for
// every mutation in its batch and holds all of them until commit, so concurrent callers
// that share any (collection,item_id) serialize inside the database — as a convoy, while
// occupying the PostgREST connection pool that reads and the health probe also need.
//
// The application half of that was: storage's writeQueue serialized writeState /
// writeCollections, preview-server's serializeStateMutation serialized most route
// handlers, and writeChanges called supabaseRestRequest DIRECTLY, on neither queue.
//
// This verifier proves the structural fix at the store layer, with no live network:
// globalThis.fetch is a fake PostgREST (same approach as test-hydration-bounds.mjs) that
// records every request, so concurrency, ordering, and "made no network call" are
// OBSERVED, not assumed.
//
//   1. 100 simultaneous writeChanges → maximum concurrent mutation RPCs is 1.
//   2. writeState and writeChanges share ONE executor (interleaved, still max 1).
//   3. FIFO order is preserved.
//   4. Pending queue never exceeds 32.
//   5. Overflow rejects immediately with SUPABASE_WRITE_QUEUE_SATURATED and zero network.
//   6. A failed mutation does not brick later writes.
//   7. A timed-out mutation is NOT automatically retried.
//   8. Reads complete while the mutation path is deliberately jammed.
//   9. Write failures neither open nor block the read path.
//  10. Telemetry carries no payload, item ID, email, token, cookie, or secret.
//  11. Structural: the RPC path appears only in the internal executor; writeChanges
//      cannot call supabaseRestRequest directly.

import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";

process.env.SUPABASE_URL = "https://fake-mutation-serialization-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STORAGE_BACKEND = "supabase";
process.env.STATE_CACHE_TTL_MS = "0";
process.env.LOCAL_DEMO_MODE = "false";
const DIR = "/tmp/leos-mutation-serialization-test";
rmSync(DIR, { recursive:true, force:true });
mkdirSync(DIR, { recursive:true });
process.env.COMMAND_CENTER_DATA_PATH = DIR + "/data.json";
process.env.COMMAND_CENTER_SEED_PATH = DIR + "/seed-does-not-exist.json";
writeFileSync(DIR + "/data.json", JSON.stringify({ library:[] }));

const storage = await import("./storage.mjs");
const {
  SupabaseCoreStore,
  CORE_MUTATION_MAX_PENDING,
  coreMutationQueueSnapshot,
  resetSupabaseRuntimeForTests,
  setCoreMutationTelemetrySinkForTests,
  supabaseCircuitSnapshot
} = storage;

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Supabase core-mutation serialization verifier");

assert.equal(CORE_MUTATION_MAX_PENDING, 32, "The pending-mutation bound must be 32.");

// ---- fake PostgREST -----------------------------------------------------------------
const RPC_PATH = "rpc/leos_apply_core_mutations";
const network = {
  requests:[],          // every request the fake saw
  rpcOrder:[],          // item_id of the first mutation in each RPC batch, in arrival order
  activeRpc:0,
  maxActiveRpc:0
};
let rpcBehavior = async () => ({});   // per-scenario: resolve, reject, or hang

function resetNetwork() {
  network.requests = [];
  network.rpcOrder = [];
  network.activeRpc = 0;
  network.maxActiveRpc = 0;
}

function respond(body, status = 200, headers = {}) {
  return {
    ok:status < 300,
    status,
    headers:{ get:(name) => headers[String(name).toLowerCase()] || "" },
    json:async () => body,
    text:async () => JSON.stringify(body)
  };
}

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || "GET").toUpperCase();
  network.requests.push({ url:target, method });
  if (method === "POST" && target.includes(RPC_PATH)) {
    const body = JSON.parse(options.body || "{}");
    const mutations = body.p_mutations || [];
    network.rpcOrder.push(String(mutations[0]?.item_id || ""));
    network.activeRpc += 1;
    network.maxActiveRpc = Math.max(network.maxActiveRpc, network.activeRpc);
    try {
      return await rpcBehavior(mutations, options);
    } finally {
      network.activeRpc -= 1;
    }
  }
  // Reads: a single empty page with an exact count so paging terminates immediately.
  return respond([], 200, { "content-range":"0-0/0" });
};

const tick = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A behavior that never resolves until released. Every RPC that arrives while jammed is
// parked; releaseAll() lets the whole backlog drain so the scenario can clean up.
function makeJam() {
  let jammed = true;
  const parked = [];
  return {
    behavior:() => {
      if (!jammed) return Promise.resolve(respond({ applied:1 }));
      return new Promise((resolve) => parked.push(() => resolve(respond({ applied:1 }))));
    },
    releaseAll() {
      jammed = false;
      while (parked.length) parked.shift()();
    }
  };
}

// A writeChanges pair whose only diff is one `tasks` row, tagged by index so the fake
// PostgREST can report arrival ORDER.
function changePair(index) {
  const before = { tasks:[{ id:"task-" + index, title:"before", status:"open", _version:1 }] };
  const after = { tasks:[{ id:"task-" + index, title:"after-" + index, status:"open", _version:1 }] };
  return [before, after];
}

function newStore() {
  return new SupabaseCoreStore({ tasks:[], posts:[], settings:{} });
}

// ---- 1 + 3 + 4: 100 simultaneous writeChanges ---------------------------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  const store = newStore();
  let peakPending = 0;
  rpcBehavior = async () => {
    // Observe the executor's own view while a mutation is in flight.
    peakPending = Math.max(peakPending, coreMutationQueueSnapshot().pending);
    await sleep(2);
    return respond({ applied:1 });
  };
  const results = await Promise.allSettled(
    Array.from({ length:100 }, (_, index) => store.writeChanges(...changePair(index)))
  );

  assert.equal(network.maxActiveRpc, 1, "At most one core-mutation RPC may be in flight per process.");
  ok("100 simultaneous writeChanges produce a maximum mutation RPC concurrency of 1");

  const accepted = results.filter((result) => result.status === "fulfilled").length;
  const saturated = results.filter((result) => result.reason?.code === "SUPABASE_WRITE_QUEUE_SATURATED").length;
  assert.equal(accepted + saturated, 100, "Every submission must either run or be rejected as saturated.");
  // 1 immediately in flight + 32 queued = 33 admitted; the rest are shed.
  assert.equal(accepted, 33, "Exactly one active mutation plus a full 32-deep queue may be admitted.");
  assert.equal(saturated, 67);
  assert(peakPending <= CORE_MUTATION_MAX_PENDING, "The pending queue must never exceed 32.");
  assert.equal(coreMutationQueueSnapshot().peakDepth, CORE_MUTATION_MAX_PENDING);
  ok("the pending queue never exceeds 32 and the overflow is shed");

  // FIFO: the fake saw the batches in submission order.
  assert.deepEqual(
    network.rpcOrder,
    Array.from({ length:33 }, (_, index) => "task-" + index),
    "Mutations must reach Supabase in submission order."
  );
  ok("FIFO submission order is preserved");
}

// ---- 5: overflow rejects immediately and makes no network call -----------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  const store = newStore();
  const jam = makeJam();
  rpcBehavior = jam.behavior;

  // Fill: 1 active + 32 pending.
  const admitted = Array.from({ length:33 }, (_, index) => store.writeChanges(...changePair(index)));
  await tick();
  const requestsBefore = network.requests.length;
  assert.equal(requestsBefore, 1, "Only the single active mutation may have touched the network.");

  const overflowStartedAt = Date.now();
  const overflow = await store.writeChanges(...changePair(999)).then(
    () => ({ rejected:false }),
    (error) => ({ rejected:true, error })
  );
  assert.equal(overflow.rejected, true);
  assert.equal(overflow.error.code, "SUPABASE_WRITE_QUEUE_SATURATED");
  assert.equal(overflow.error.status, 503);
  assert(Date.now() - overflowStartedAt < 50, "Saturation must reject immediately, not after a wait.");
  assert.equal(network.requests.length, requestsBefore, "A saturated mutation must make zero network calls.");
  ok("a saturated queue rejects immediately with SUPABASE_WRITE_QUEUE_SATURATED and zero network calls");

  jam.releaseAll();
  await Promise.allSettled(admitted);
}

// ---- 2: writeState and writeChanges share one executor --------------------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  const store = newStore();
  const seen = [];
  rpcBehavior = async (mutations) => {
    seen.push(String(mutations[0]?.item_id || ""));
    await sleep(3);
    return respond({ applied:mutations.length });
  };
  await Promise.all([
    store.writeChanges(...changePair(1)),
    store.writeState({ tasks:[{ id:"task-state-a", title:"state a", status:"open" }] }),
    store.writeChanges(...changePair(2)),
    store.writeCollections({ tasks:[{ id:"task-state-b", title:"state b", status:"open" }] })
  ]);
  assert.equal(network.maxActiveRpc, 1, "writeState and writeChanges must not overlap.");
  assert.equal(seen.length, 4, "All four writes must reach the database.");
  ok("writeState, writeCollections, and writeChanges share the same single-slot executor");
}

// ---- 6: a failed mutation does not brick later writes ---------------------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  const store = newStore();
  let call = 0;
  rpcBehavior = async () => {
    call += 1;
    if (call === 1) return respond({ message:"boom" }, 500);
    return respond({ applied:1 });
  };
  const first = await store.writeChanges(...changePair(1)).then(() => "ok", (error) => error);
  assert.notEqual(first, "ok", "The first mutation must fail.");
  const later = await Promise.all([
    store.writeChanges(...changePair(2)),
    store.writeChanges(...changePair(3))
  ]);
  assert.equal(later.length, 2);
  assert.equal(coreMutationQueueSnapshot().completed, 2);
  assert.equal(coreMutationQueueSnapshot().failed, 1);
  ok("one failed mutation settles only its own caller and does not brick the queue");
}

// ---- 7: a timed-out mutation is not automatically retried -----------------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  process.env.SUPABASE_REQUEST_TIMEOUT_MS = "150";
  const store = newStore();
  // Hang until the client's own timeout aborts the request.
  rpcBehavior = (mutations, options) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name:"AbortError" })), { once:true });
  });
  // storage.mjs deliberately unrefs its abort timer, so with a hanging fake fetch the
  // event loop would have nothing referenced and Node would exit before the timeout
  // fires. This ref'd keep-alive is a harness detail, not part of what is under test.
  const keepAlive = setInterval(() => {}, 25);
  const outcome = await store.writeChanges(...changePair(1)).then(() => "ok", (error) => error);
  clearInterval(keepAlive);
  assert.notEqual(outcome, "ok", "The mutation must fail on timeout.");
  const rpcCalls = network.requests.filter((entry) => entry.url.includes(RPC_PATH)).length;
  assert.equal(rpcCalls, 1, "A timed-out mutation may be attempted exactly once — never blindly resubmitted.");
  ok("a timed-out mutation is attempted once and never automatically retried");
  delete process.env.SUPABASE_REQUEST_TIMEOUT_MS;
}

// ---- 8: reads complete while the mutation path is jammed ------------------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  const store = newStore();
  const jam = makeJam();
  rpcBehavior = jam.behavior;

  // Jam the whole write path: one active RPC plus a full pending queue.
  const jammed = Array.from({ length:33 }, (_, index) => store.writeChanges(...changePair(index)));
  jammed.forEach((promise) => promise.catch(() => {}));
  await tick();
  assert.equal(coreMutationQueueSnapshot().pending, CORE_MUTATION_MAX_PENDING, "The write path must be fully jammed for this check to mean anything.");

  const readStartedAt = Date.now();
  const state = await store.readCollections(["tasks"]);
  assert.equal(state.persistence, "supabase");
  assert(Date.now() - readStartedAt < 1_000, "A read must not wait on a jammed write path.");
  const targeted = await store.readCollections(["posts"]);
  assert.equal(targeted.persistence, "supabase");
  ok("reads complete promptly while a mutation is deliberately jammed");

  jam.releaseAll();
  await Promise.allSettled(jammed);
}

// ---- 9: write failures neither open nor block the read path ---------------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  const store = newStore();
  rpcBehavior = async () => respond({ message:"unavailable" }, 503);
  // 503 is a dependency-health failure; the default breaker threshold is 8.
  for (let index = 0; index < 20; index += 1) {
    await store.writeChanges(...changePair(index)).catch(() => {});
  }
  const circuits = supabaseCircuitSnapshot();
  assert.equal(circuits.write.state, "open", "Repeated write failures must open the WRITE circuit.");
  assert.equal(circuits.read.state, "closed", "Write failures must never open the read circuit.");
  assert.equal(circuits.state, "closed", "The top-level (read) circuit state must stay closed.");
  const state = await store.readCollections(["tasks"]);
  assert.equal(state.persistence, "supabase", "Reads must still succeed while the write circuit is open.");
  assert.equal(store.lastError, "", "A healthy read must not inherit the write path's error.");
  ok("write failures open only the write circuit and leave reads healthy");
}

// ---- 10: telemetry is safe ------------------------------------------------------------
{
  resetSupabaseRuntimeForTests();
  resetNetwork();
  // This scenario asserts what telemetry CONTAINS, so it runs with emission forced on
  // regardless of how the surrounding environment set the switch.
  const telemetrySwitch = process.env.SUPABASE_MUTATION_TELEMETRY;
  process.env.SUPABASE_MUTATION_TELEMETRY = "1";
  const lines = [];
  setCoreMutationTelemetrySinkForTests((line) => lines.push(line));
  const store = newStore();
  rpcBehavior = async () => respond({ applied:1 });

  const sensitive = {
    tasks:[{
      id:"task-secret-0001",
      title:"Call Dana about the Mississippi filing",
      status:"open",
      ownerEmail:"person@example.com",
      notes:"Bearer fixture-authorization-value",
      sessionCookie:"leos_session=abc123"
    }]
  };
  await store.writeChanges({ tasks:[] }, sensitive);
  setCoreMutationTelemetrySinkForTests(null);
  if (telemetrySwitch === undefined) delete process.env.SUPABASE_MUTATION_TELEMETRY;
  else process.env.SUPABASE_MUTATION_TELEMETRY = telemetrySwitch;

  assert.equal(lines.length, 1, "Exactly one telemetry line per mutation attempt.");
  const line = lines[0];
  assert.equal(line.event, "supabase_core_mutation");
  assert.equal(line.operationClass, "writeChanges");
  assert.equal(line.mutationCount, 1);
  assert.deepEqual(line.collections, ["tasks"]);
  assert(line.requestBytes > 0, "The encoded request size must be reported.");
  assert.equal(line.outcome, "ok");
  assert.equal(line.queueDepth, 0);
  assert(Number.isFinite(line.queueWaitMs) && Number.isFinite(line.executionMs));
  assert(String(line.process).length > 0, "The process identity must be reported.");
  // Background work has no HTTP request, so the route is the neutral placeholder.
  assert.equal(line.requestMethod, "NONE");
  assert.equal(line.route, "/(background)");

  const encoded = JSON.stringify(line);
  for (const forbidden of [
    "task-secret-0001",              // item ID
    "Dana",                          // name
    "Mississippi",                   // message body
    "person@example.com",            // email address
    "fixture-authorization-value",   // token
    "leos_session",                  // cookie
    "test-service-role-key",         // credential
    "Bearer"                         // authorization header material
  ]) {
    assert.equal(encoded.includes(forbidden), false, `Telemetry must never contain ${forbidden}.`);
  }
  assert.equal(Object.hasOwn(line, "payload"), false);
  assert.equal(Object.hasOwn(line, "mutations"), false);
  ok("mutation telemetry carries no payload, item ID, name, email, token, cookie, or credential");
}

// ---- 11: structural assertions --------------------------------------------------------
{
  const source = readFileSync(new URL("./storage.mjs", import.meta.url), "utf8");
  // Count the string LITERAL (a request target), not prose mentions in comments.
  const literal = '"' + RPC_PATH + '"';
  const occurrences = source.split(literal).length - 1;
  assert.equal(occurrences, 1, "The core-mutation RPC path may be requested from exactly one place in storage.mjs.");
  const submitBlock = source.slice(source.indexOf("function submitCoreMutations"));
  assert(submitBlock.includes(literal), "The single request site must be inside submitCoreMutations.");
  ok("rpc/leos_apply_core_mutations appears only in the internal mutation executor");

  // writeChanges must go through the executor, never straight to the request layer.
  const supabaseWriteChanges = source.slice(source.lastIndexOf("async writeChanges("));
  const body = supabaseWriteChanges.slice(0, supabaseWriteChanges.indexOf("\n  async writeStateNow("));
  assert.equal(body.includes("supabaseRestRequest("), false, "writeChanges must not call supabaseRestRequest directly.");
  assert(body.includes("submitCoreMutations("), "writeChanges must submit through the shared executor.");

  const writeStateToSupabase = source.slice(source.indexOf("async writeStateToSupabase("));
  assert(writeStateToSupabase.includes("submitCoreMutations("), "writeStateToSupabase must submit through the shared executor.");
  ok("writeChanges and writeStateToSupabase both route through the shared executor");

  // No other application module may name the RPC path.
  for (const moduleName of ["preview-server.mjs", "heartbeat.mjs", "outreach-api-integration.mjs", "partner-api-integration.mjs"]) {
    const moduleSource = readFileSync(new URL("./" + moduleName, import.meta.url), "utf8");
    assert.equal(moduleSource.includes(RPC_PATH), false, moduleName + " must not name the core-mutation RPC.");
  }
  ok("no application module outside the executor names the core-mutation RPC");
}

console.log(`\nSupabase core-mutation serialization verifier passed (${passed} checks).`);
