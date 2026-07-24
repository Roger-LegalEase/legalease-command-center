import assert from "node:assert/strict";

process.env.SKIP_ENV_LOCAL_FILE = "1";
process.env.NODE_ENV = "test";
process.env.COMMAND_CENTER_TEST_MODE = "true";
process.env.SUPABASE_URL = "https://synthetic-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-key";
process.env.STORAGE_BACKEND = "supabase";

const { createSupabaseCircuit, createSupabaseRequestGate, SupabaseCircuitOpenError, SupabaseRequestGateSaturatedError } =
  await import("./supabase-backoff.mjs");
const storage = await import("./storage.mjs");
const { supabaseRestRequest, getSupabaseHealth, resetSupabaseRuntimeForTests, supabaseCircuitSnapshot } = storage;

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push({ name, ok:true }))
    .catch((error) => results.push({ name, ok:false, error }));
}

const realFetch = globalThis.fetch;
function restoreFetch() {
  globalThis.fetch = realFetch;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Circuit unit behavior on a simulated clock: threshold, fast denial, cooldown
// doubling with a hard cap, single half-open trial, and full recovery.
// ---------------------------------------------------------------------------
await check("circuit: opens at threshold, denies fast, doubles cooldown to the cap, recovers on success", () => {
  let clock = 0;
  const circuit = createSupabaseCircuit({ now:() => clock, failureThreshold:3, baseCooldownMs:1_000, maxCooldownMs:4_000 });
  for (let i = 0; i < 3; i += 1) {
    const ticket = circuit.acquire();
    assert.equal(ticket.allowed, true, "closed circuit must allow attempts");
    circuit.settle(ticket, "failure");
  }
  assert.equal(circuit.snapshot().state, "open");
  const denied = circuit.acquire();
  assert.equal(denied.allowed, false, "open circuit must deny without network");
  assert.ok(denied.retryAfterMs >= 1);

  // Cooldown elapses -> exactly ONE half-open trial; concurrent callers stay denied.
  clock = 1_000;
  const trial = circuit.acquire();
  assert.equal(trial.allowed, true);
  assert.equal(trial.trial, true);
  assert.equal(circuit.acquire().allowed, false, "second caller during the trial must be denied");
  circuit.settle(trial, "failure");
  assert.equal(circuit.snapshot().state, "open");
  assert.equal(circuit.snapshot().cooldownMs, 2_000, "failed trial doubles the cooldown");

  clock = 3_000;
  const trial2 = circuit.acquire();
  circuit.settle(trial2, "failure");
  assert.equal(circuit.snapshot().cooldownMs, 4_000);

  clock = 7_000;
  const trial3 = circuit.acquire();
  circuit.settle(trial3, "failure");
  assert.equal(circuit.snapshot().cooldownMs, 4_000, "cooldown is hard-capped");

  clock = 11_000;
  const trial4 = circuit.acquire();
  assert.equal(trial4.allowed, true);
  circuit.settle(trial4, "success");
  assert.equal(circuit.snapshot().state, "closed");
  assert.equal(circuit.snapshot().consecutiveFailures, 0);
  const after = circuit.acquire();
  assert.equal(after.allowed, true, "recovered circuit flows normally");
  circuit.settle(after, "success");
});

await check("circuit: caller aborts are neutral and release a half-open trial without reopening", () => {
  let clock = 0;
  const circuit = createSupabaseCircuit({ now:() => clock, failureThreshold:2, baseCooldownMs:500, maxCooldownMs:2_000 });
  const neutral = circuit.acquire();
  circuit.settle(neutral, "neutral");
  assert.equal(circuit.snapshot().consecutiveFailures, 0, "neutral outcomes never count as failures");
  for (let i = 0; i < 2; i += 1) circuit.settle(circuit.acquire(), "failure");
  clock = 500;
  const trial = circuit.acquire();
  assert.equal(trial.trial, true);
  circuit.settle(trial, "neutral");
  const retry = circuit.acquire();
  assert.equal(retry.allowed, true, "an abandoned trial slot frees up for the next caller");
  circuit.settle(retry, "success");
  assert.equal(circuit.snapshot().state, "closed");
});

// ---------------------------------------------------------------------------
// Bounded storm: an always-failing Supabase endpoint must produce a BOUNDED
// number of network attempts no matter how hot the caller loop is.
// ---------------------------------------------------------------------------
await check("storm: 400 hot-loop requests against a dead endpoint make a bounded number of network attempts", async () => {
  process.env.SUPABASE_CIRCUIT_FAILURE_THRESHOLD = "6";
  process.env.SUPABASE_CIRCUIT_BASE_COOLDOWN_MS = "60000";
  process.env.SUPABASE_CIRCUIT_MAX_COOLDOWN_MS = "60000";
  resetSupabaseRuntimeForTests();
  let networkAttempts = 0;
  globalThis.fetch = async () => {
    networkAttempts += 1;
    throw new TypeError("Synthetic connection refused");
  };
  try {
    let circuitDenials = 0;
    for (let i = 0; i < 400; i += 1) {
      try {
        await supabaseRestRequest("leos_core_records?select=item_id&limit=1");
      } catch (error) {
        if (error instanceof SupabaseCircuitOpenError) circuitDenials += 1;
      }
    }
    // Threshold 6 with the GET single-retry means at most 6 network attempts before
    // the circuit opens; the 60s cooldown outlasts the loop, so everything after is
    // denied instantly with zero traffic.
    assert.ok(networkAttempts <= 6, `expected <= 6 network attempts, saw ${networkAttempts}`);
    assert.ok(circuitDenials >= 390, `expected the tail of the loop to be circuit denials, saw ${circuitDenials}`);
    assert.equal(supabaseCircuitSnapshot().state, "open");
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.SUPABASE_CIRCUIT_BASE_COOLDOWN_MS;
    delete process.env.SUPABASE_CIRCUIT_MAX_COOLDOWN_MS;
    resetSupabaseRuntimeForTests();
  }
});

await check("storm: half-open trials re-probe on real timers and a recovered endpoint closes the circuit", async () => {
  process.env.SUPABASE_CIRCUIT_FAILURE_THRESHOLD = "2";
  process.env.SUPABASE_CIRCUIT_BASE_COOLDOWN_MS = "40";
  process.env.SUPABASE_CIRCUIT_MAX_COOLDOWN_MS = "80";
  resetSupabaseRuntimeForTests();
  let healthy = false;
  let networkAttempts = 0;
  globalThis.fetch = async () => {
    networkAttempts += 1;
    if (!healthy) throw new TypeError("Synthetic connection refused");
    return new Response(JSON.stringify([]), { status:200, headers:{ "content-type":"application/json" } });
  };
  try {
    for (let i = 0; i < 4; i += 1) {
      await supabaseRestRequest("leos_core_records?select=item_id&limit=1", { noRetry:true }).catch(() => {});
    }
    assert.equal(supabaseCircuitSnapshot().state, "open");
    const attemptsWhileOpen = networkAttempts;
    await supabaseRestRequest("x", { noRetry:true }).catch(() => {});
    assert.equal(networkAttempts, attemptsWhileOpen, "requests inside the cooldown make no network attempts");
    await sleep(50);
    healthy = true;
    await supabaseRestRequest("leos_core_records?select=item_id&limit=1", { noRetry:true });
    assert.equal(supabaseCircuitSnapshot().state, "closed", "successful half-open trial closes the circuit");
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.SUPABASE_CIRCUIT_BASE_COOLDOWN_MS;
    delete process.env.SUPABASE_CIRCUIT_MAX_COOLDOWN_MS;
    resetSupabaseRuntimeForTests();
  }
});

// ---------------------------------------------------------------------------
// Request gate: bounded concurrency, bounded queue, clean saturation error.
// ---------------------------------------------------------------------------
await check("gate: concurrency is bounded and overflow rejects cleanly instead of queuing forever", async () => {
  const gate = createSupabaseRequestGate({ maxConcurrent:2, maxWaiters:1 });
  let active = 0;
  let peak = 0;
  const settlers = [];
  const job = () => gate.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => settlers.push(resolve));
    active -= 1;
  });
  const first = job();
  const second = job();
  const third = job(); // waits (1 waiter allowed)
  await sleep(5);
  await assert.rejects(job(), SupabaseRequestGateSaturatedError, "beyond maxWaiters the gate rejects immediately");
  settlers.forEach((resolve) => resolve());
  await sleep(5);
  settlers.forEach((resolve) => resolve());
  await Promise.all([first, second, third]);
  assert.equal(peak, 2, "no more than maxConcurrent operations ran at once");
});

// ---------------------------------------------------------------------------
// Probe caching: getSupabaseHealth computes at most once per TTL window, shares
// concurrent callers, never self-retries, and reports three truthful states.
// ---------------------------------------------------------------------------
await check("probe: cached for the TTL window, single-flight, exactly one network request", async () => {
  process.env.SUPABASE_HEALTH_TTL_MS = "250";
  resetSupabaseRuntimeForTests();
  let probeRequests = 0;
  globalThis.fetch = async () => {
    probeRequests += 1;
    return new Response(JSON.stringify([]), { status:200, headers:{ "content-type":"application/json" } });
  };
  try {
    const burst = await Promise.all(Array.from({ length:8 }, () => getSupabaseHealth()));
    for (const health of burst) {
      assert.equal(health.connected, true);
      assert.equal(health.state, "connected");
    }
    for (let i = 0; i < 8; i += 1) await getSupabaseHealth();
    assert.equal(probeRequests, 1, `16 health calls inside the TTL must make exactly 1 probe request, saw ${probeRequests}`);
    await sleep(300);
    await getSupabaseHealth();
    assert.equal(probeRequests, 2, "a call after the TTL makes exactly one fresh probe");
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_HEALTH_TTL_MS;
    resetSupabaseRuntimeForTests();
  }
});

await check("probe: failing probe is also cached (no per-request re-probing) and reports disconnected", async () => {
  process.env.SUPABASE_HEALTH_TTL_MS = "60000";
  resetSupabaseRuntimeForTests();
  let probeRequests = 0;
  globalThis.fetch = async () => {
    probeRequests += 1;
    throw new TypeError("Synthetic connection refused");
  };
  try {
    const first = await getSupabaseHealth();
    assert.equal(first.connected, false);
    assert.equal(first.state, "disconnected");
    assert.ok(first.error, "failure surfaces an error string");
    for (let i = 0; i < 10; i += 1) await getSupabaseHealth();
    assert.equal(probeRequests, 1, "a failing probe must not retry per call — one request per TTL window");
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_HEALTH_TTL_MS;
    resetSupabaseRuntimeForTests();
  }
});

await check("probe: degraded when the probe succeeds while storage traffic recently failed", async () => {
  process.env.SUPABASE_HEALTH_TTL_MS = "60000";
  process.env.SUPABASE_CIRCUIT_FAILURE_THRESHOLD = "2";
  process.env.SUPABASE_CIRCUIT_BASE_COOLDOWN_MS = "30";
  resetSupabaseRuntimeForTests();
  let fail = true;
  globalThis.fetch = async () => {
    if (fail) throw new TypeError("Synthetic connection refused");
    return new Response(JSON.stringify([]), { status:200, headers:{ "content-type":"application/json" } });
  };
  try {
    for (let i = 0; i < 2; i += 1) {
      await supabaseRestRequest("leos_core_records?select=item_id&limit=1", { noRetry:true }).catch(() => {});
    }
    await sleep(40);
    fail = false;
    const health = await getSupabaseHealth();
    assert.equal(health.connected, true, "the probe query itself succeeded");
    assert.equal(health.state, "degraded", "recent breaker activity must read as degraded, not a clean connected");
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_HEALTH_TTL_MS;
    delete process.env.SUPABASE_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.SUPABASE_CIRCUIT_BASE_COOLDOWN_MS;
    resetSupabaseRuntimeForTests();
  }
});

// ---------------------------------------------------------------------------
// Denial-log budget + storm-shape guard on the preview-server source: the denial
// path must stay a single conditional INSERT (claimCollectionItems), never a
// full-state read or a whole-collection rewrite.
// ---------------------------------------------------------------------------
await check("denial logging: single-insert shape and a process-wide per-minute budget exist in source", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function logAccessDecision");
  assert.ok(start > 0, "logAccessDecision must exist");
  const body = source.slice(start, source.indexOf("\n}", start));
  assert.ok(body.includes('claimCollectionItems("soc2AuditLogs"'), "denials persist via a single conditional INSERT");
  assert.ok(!body.includes("readState()"), "denial logging must never hydrate full state");
  assert.ok(!body.includes("writeCollections"), "denial logging must never rewrite the whole collection");
  assert.ok(!body.includes("serializeStateMutation"), "denial logging must not occupy the global mutation queue");
  assert.ok(body.includes("accessDenialLogBudgetAvailable"), "denial logging is bounded by the per-minute budget");
  assert.ok(source.includes("ACCESS_DENIAL_LOG_MAX_PER_MINUTE"), "the process-wide budget constant exists");
});

restoreFetch();
const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`  ${result.ok ? "✓" : "✗"} ${result.name}`);
  if (!result.ok) console.error(result.error);
}
if (failed.length) {
  console.error(`supabase backoff tests failed: ${failed.length}/${results.length}`);
  process.exit(1);
}
console.log("supabase backoff + probe caching tests passed.");
