// Circuit breaker + outbound request gate for ALL Supabase REST traffic.
//
// Why this exists (2026-07-24 request storm): production pg_stat_statements showed
// set_config('search_path', ...) — PostgREST per-request setup — at 683,878,980 calls
// (59.9% of total DB time) while every real query shape combined totaled ~160K calls.
// Nothing in the app throttled a failing Supabase dependency: a failed read was never
// cached, so every caller retried the full paged hydration at network speed, forever.
// The breaker makes any failing/slow Supabase dependency degrade to a bounded handful
// of attempts per cooldown window (a few per minute at the cap), never a tight loop.
//
// State machine (per process):
//   closed     — requests flow; consecutive eligible failures are counted.
//   open       — after `failureThreshold` consecutive failures. Every request is
//                rejected instantly (no network) until the cooldown elapses.
//   half_open  — cooldown elapsed: exactly ONE trial request is allowed through.
//                Success closes the circuit; failure re-opens it with the cooldown
//                doubled (exponential backoff, hard-capped at `maxCooldownMs`).
//
// Only dependency-health failures trip the breaker: timeouts, network errors, and
// 5xx responses. 4xx responses prove Supabase answered and never count. Caller
// aborts are neutral — they say nothing about the dependency.

const DEFAULT_FAILURE_THRESHOLD = 8;
const DEFAULT_BASE_COOLDOWN_MS = 2_000;
const DEFAULT_MAX_COOLDOWN_MS = 60_000;
const DEFAULT_MAX_CONCURRENT = 16;
const DEFAULT_MAX_WAITERS = 200;

function positiveInteger(raw, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export class SupabaseCircuitOpenError extends Error {
  constructor(retryAfterMs = 1_000) {
    super("Supabase circuit is open after repeated failures; request skipped.");
    this.name = "SupabaseCircuitOpenError";
    this.code = "SUPABASE_CIRCUIT_OPEN";
    this.status = 503;
    this.retryAfterMs = Math.max(1, Math.trunc(retryAfterMs));
  }
}

export class SupabaseRequestGateSaturatedError extends Error {
  constructor() {
    super("Supabase request queue is saturated; request rejected instead of queuing unboundedly.");
    this.name = "SupabaseRequestGateSaturatedError";
    this.code = "SUPABASE_GATE_SATURATED";
    this.status = 503;
  }
}

export function createSupabaseCircuit({
  now = () => Date.now(),
  failureThreshold = positiveInteger(process.env.SUPABASE_CIRCUIT_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD, { min:1, max:1_000 }),
  baseCooldownMs = positiveInteger(process.env.SUPABASE_CIRCUIT_BASE_COOLDOWN_MS, DEFAULT_BASE_COOLDOWN_MS, { min:10, max:600_000 }),
  maxCooldownMs = positiveInteger(process.env.SUPABASE_CIRCUIT_MAX_COOLDOWN_MS, DEFAULT_MAX_COOLDOWN_MS, { min:10, max:3_600_000 })
} = {}) {
  let consecutiveFailures = 0;
  let openUntil = 0;      // 0 = closed; otherwise the timestamp the current cooldown ends
  let cooldownMs = 0;     // current cooldown length while open
  let trialInFlight = false;
  let lastFailureAt = 0;
  let lastSuccessAt = 0;
  let openedCount = 0;
  let deniedCount = 0;

  function state(at = now()) {
    if (!openUntil) return "closed";
    if (at < openUntil || trialInFlight) return trialInFlight && at >= openUntil ? "half_open" : "open";
    return "half_open";
  }

  // Ask permission for one network attempt. { allowed:false } means reject WITHOUT
  // touching the network; { trial:true } marks the single half-open probe.
  function acquire() {
    const at = now();
    if (!openUntil) return { allowed:true, trial:false };
    if (at < openUntil || trialInFlight) {
      deniedCount += 1;
      return { allowed:false, retryAfterMs:Math.max(1, openUntil - at) || cooldownMs };
    }
    trialInFlight = true;
    return { allowed:true, trial:true };
  }

  // outcome: "success" | "failure" | "neutral" (caller abort — proves nothing).
  function settle(ticket, outcome) {
    if (!ticket?.allowed) return;
    if (outcome === "success") {
      lastSuccessAt = now();
      consecutiveFailures = 0;
      openUntil = 0;
      cooldownMs = 0;
      trialInFlight = false;
      return;
    }
    if (outcome === "neutral") {
      if (ticket.trial) trialInFlight = false;
      return;
    }
    lastFailureAt = now();
    if (openUntil) {
      // Half-open trial failed: re-open with the cooldown doubled, hard-capped.
      trialInFlight = false;
      cooldownMs = Math.min(maxCooldownMs, Math.max(baseCooldownMs, cooldownMs * 2));
      openUntil = now() + cooldownMs;
      return;
    }
    consecutiveFailures += 1;
    if (consecutiveFailures >= failureThreshold) {
      cooldownMs = baseCooldownMs;
      openUntil = now() + cooldownMs;
      openedCount += 1;
    }
  }

  function snapshot() {
    const at = now();
    return {
      state:state(at),
      consecutiveFailures,
      cooldownMs,
      retryAfterMs:openUntil > at ? openUntil - at : 0,
      lastFailureAt,
      lastSuccessAt,
      openedCount,
      deniedCount,
      failureThreshold,
      baseCooldownMs,
      maxCooldownMs
    };
  }

  return { acquire, settle, snapshot, state };
}

// Bounded outbound concurrency ("connection pool" for the REST client): at most
// `maxConcurrent` Supabase requests in flight, at most `maxWaiters` queued behind
// them. Beyond that the caller gets an instant, clean 503-shaped error instead of
// an unbounded queue that hangs route handlers while the database is slow.
export function createSupabaseRequestGate({
  maxConcurrent = positiveInteger(process.env.SUPABASE_MAX_CONCURRENT_REQUESTS, DEFAULT_MAX_CONCURRENT, { min:1, max:256 }),
  maxWaiters = positiveInteger(process.env.SUPABASE_MAX_QUEUED_REQUESTS, DEFAULT_MAX_WAITERS, { min:0, max:10_000 })
} = {}) {
  let active = 0;
  const waiters = [];

  function release() {
    active -= 1;
    const next = waiters.shift();
    if (next) {
      active += 1;
      next();
    }
  }

  async function run(operation) {
    if (active < maxConcurrent) {
      active += 1;
    } else {
      if (waiters.length >= maxWaiters) throw new SupabaseRequestGateSaturatedError();
      await new Promise((resolve) => waiters.push(resolve));
    }
    try {
      return await operation();
    } finally {
      release();
    }
  }

  function snapshot() {
    return { active, waiting:waiters.length, maxConcurrent, maxWaiters };
  }

  return { run, snapshot };
}
