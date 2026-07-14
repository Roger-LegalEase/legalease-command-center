// B1 — Scheduler/Heartbeat. The clock every other engine (B2-B7) runs on.
//
// Design (see Track B Phase 0 plan):
// - A single hourly Render cron POSTs /api/heartbeat/tick. ET-aware due logic here
//   decides what runs: hourly engines run every tick; daily engines run when the
//   ET hour matches DAILY_RUN_HOUR_ET (default 6am ET, DST-correct via APP_TIMEZONE).
// - Engines register declaratively (see heartbeat-engines.mjs). Each tick runs every
//   due engine's plan() ALWAYS (proposals/observations, NO external side effects) and
//   runs act() (side effects) ONLY when that engine's autopilot toggle is enabled.
// - Autopilot toggles default OFF. With every toggle off the heartbeat still fires and
//   every engine plans, but ZERO act() calls happen.
// - Double-run defense has three layers: (1) in-process single-flight mutex, (2) a
//   per-engine-per-period idempotency ledger (heartbeatRuns), (3) a state lease
//   (heartbeatLease) with a TTL for cross-restart recovery. On single-instance Render
//   layers 1+2 guarantee correctness; the lease is an advisory/visible in-progress
//   marker that self-recovers after a crash.

import { APP_TIMEZONE } from "./daily-run-session.mjs";

export const DEFAULT_DAILY_RUN_HOUR_ET = 6;
export const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;

function bool(value) {
  return ["true", "1", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

// DST-correct ET parts via Intl, reusing the app timezone the rest of the OS uses.
export function etParts(date = new Date(), timeZone = APP_TIMEZONE) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // some ICU builds render midnight as "24"
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { dateKey, hour, hourKey: `${dateKey}T${String(hour).padStart(2, "0")}` };
}

export function periodBucket(engine = {}, parts = {}) {
  return engine.cadence === "daily" ? parts.dateKey : parts.hourKey;
}

export function bucketKeyFor(engine = {}, parts = {}) {
  return `${engine.id}:${engine.cadence}:${periodBucket(engine, parts)}`;
}

// Is this engine's time window open right now? Hourly = every tick; daily = the 6am ET tick.
export function engineWindowOpen(engine = {}, parts = {}, env = process.env) {
  if (engine.cadence === "hourly") return true;
  if (engine.cadence === "daily") {
    const hour = Number(env.DAILY_RUN_HOUR_ET ?? DEFAULT_DAILY_RUN_HOUR_ET);
    return parts.hour === hour;
  }
  return false;
}

// Autopilot toggle resolution. Persisted autopilotSettings wins; else AUTOPILOT_<ID>
// env seed; else DEFAULT OFF. This is the OUTER gate — engine act() runs only if true.
export function autopilotEnabled(state = {}, engineId = "", env = process.env) {
  const persisted = (state.autopilotSettings || {})[engineId];
  if (persisted && typeof persisted.enabled === "boolean") return persisted.enabled;
  const envKey = "AUTOPILOT_" + String(engineId).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (typeof env[envKey] === "string") return bool(env[envKey]);
  return false;
}

export function alreadyRanBucket(state = {}, bucketKey = "") {
  return (state.heartbeatRuns || []).some((r) => r.bucketKey === bucketKey && r.status === "success");
}

function leaseActive(lease, nowMs) {
  return Boolean(lease && lease.expiresAt && Date.parse(lease.expiresAt) > nowMs);
}

// In-process single-flight guard (Render runs a single web instance).
let tickInFlight = false;
export function _isTickInFlight() { return tickInFlight; }

export async function runHeartbeat(options = {}) {
  const {
    store,
    registry = [],
    env = process.env,
    now = new Date(),
    runId,
    force = false,
    leaseTtlMs = DEFAULT_LEASE_TTL_MS,
    actor = "cron"
  } = options;

  if (!store) throw new Error("runHeartbeat requires a store.");

  // Layer 1: in-process mutex. A second concurrent tick in this process is a no-op.
  if (tickInFlight) {
    return { ok: true, skipped: "in_progress", reason: "A heartbeat tick is already running in this process." };
  }
  tickInFlight = true;

  const id = runId || `hb-${now.getTime()}-${Math.floor(now.getTime() % 100000)}`;
  const tz = env.APP_TIMEZONE || APP_TIMEZONE;
  const parts = etParts(now, tz);

  try {
    let state = await store.readState();
    // Snapshot for the closing diff-scoped write: engines thread state immutably
    // (state = planResult.state), so a collection changed exactly when its reference did.
    const initialState = state;

    // Layer 3: lease guard (cross-restart / duplicate cron delivery). force overrides.
    // Claim the lease with versioned compare-and-swap. The mutator is re-evaluated after
    // a conflict, so two independent hosted instances cannot both win.
    const lease = {
      runId: id,
      holder: actor,
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + leaseTtlMs).toISOString()
    };
    let leaseWon = false;
    const leaseMutation = await store.mutateCollectionItem("heartbeatLease", "singleton", (current) => {
      if (!force && leaseActive(current, now.getTime()) && current.runId !== id) {
        leaseWon = false;
        return current;
      }
      leaseWon = true;
      return lease;
    }, { createIfMissing:true, maxRetries:2 });
    if (!leaseWon) return { ok:true, skipped:"leased", reason:"A non-expired heartbeat lease is held." };
    state = leaseMutation.state || await store.readState();

    const engineResults = [];
    for (const engine of registry) {
      const bucketKey = bucketKeyFor(engine, parts);
      const windowOpen = force || engineWindowOpen(engine, parts, env);
      if (!windowOpen) {
        engineResults.push({ engineId: engine.id, bucketKey, status: "skipped", reason: "window_closed" });
        continue;
      }
      // Layer 2: idempotency ledger. Same engine + same ET period already succeeded => no-op.
      if (!force && alreadyRanBucket(state, bucketKey)) {
        engineResults.push({ engineId: engine.id, bucketKey, status: "skipped", reason: "already_ran" });
        continue;
      }

      const ctx = { now, etParts: parts, runId: id, bucketKey, period: periodBucket(engine, parts), env };

      // plan() ALWAYS — proposals/observations only, never external side effects.
      let planResult = {};
      try {
        planResult = (await engine.plan(state, ctx)) || {};
        if (planResult.state) state = planResult.state;
      } catch (error) {
        engineResults.push({ engineId: engine.id, bucketKey, status: "error", phase: "plan", error: String(error?.message || error) });
        continue;
      }

      // act() ONLY when the autopilot toggle is ON (default OFF). The engine's own
      // gates (live posting, approval, outbox kill switch) still apply UNDER this gate.
      // A plan()-only engine (no act method — e.g. B3 codebase-health, which structurally
      // cannot act) is a clean no-op here even when toggled ON: there is no action path.
      const enabled = autopilotEnabled(state, engine.id, env);
      let acted = false;
      let actResult = {};
      if (enabled && typeof engine.act === "function") {
        try {
          actResult = (await engine.act(state, ctx)) || {};
          if (actResult.state) state = actResult.state;
          acted = true;
        } catch (error) {
          engineResults.push({ engineId: engine.id, bucketKey, status: "error", phase: "act", autopilot: true, error: String(error?.message || error) });
          continue;
        }
      }

      engineResults.push({
        engineId: engine.id,
        bucketKey,
        status: "success",
        autopilot: enabled,
        acted,
        proposalsCount: (planResult.proposals || []).length,
        observationsCount: (planResult.observations || []).length,
        resultsCount: (actResult.results || []).length
      });
    }

    // Append idempotency-ledger entries (one per engine that succeeded this tick) and
    // release the lease — single final write. Re-running the same bucket replaces its row.
    const finishedAt = new Date(now.getTime() + 1).toISOString();
    const ledgerEntries = engineResults
      .filter((r) => r.status === "success")
      .map((r) => ({
        id: r.bucketKey,
        bucketKey: r.bucketKey,
        engineId: r.engineId,
        runId: id,
        status: "success",
        acted: r.acted,
        autopilot: r.autopilot,
        etDate: parts.dateKey,
        etHour: parts.hour,
        ranAt: finishedAt
      }));
    const carried = (state.heartbeatRuns || []).filter((r) => !ledgerEntries.some((e) => e.bucketKey === r.bucketKey));
    state = {
      ...state,
      heartbeatRuns: [...ledgerEntries, ...carried].slice(0, 500),
      heartbeatLease: state.heartbeatLease
    };
    // Diff-scoped closing write: persists exactly the collections the tick's engines changed
    // (every engine returns spread-copied state, so changed collections have new references;
    // verified across the full registry, and heartbeatRuns is always reassigned so the patch
    // is never empty).
    const patch = {};
    for (const key of Object.keys(state)) {
      if (state[key] !== initialState[key]) patch[key] = state[key];
    }
    // The tick ALWAYS claims the lease mid-run, so it must ALWAYS release it. When the stored
    // lease was already the literal null (JSON backend steady state after the first tick),
    // null !== null is false and the diff alone would leave the mid-tick claim persisted,
    // wrongly skipping the next tick for a full TTL.
    delete patch.heartbeatLease;
    await store.writeCollections(patch);
    await store.mutateCollectionItem("heartbeatLease", "singleton", (current) => current?.runId === id
      ? { runId:"", holder:"", claimedAt:current.claimedAt || "", expiresAt:"", releasedAt:finishedAt }
      : current, { maxRetries:2 });

    return {
      ok: true,
      runId: id,
      etDate: parts.dateKey,
      etHour: parts.hour,
      ran: engineResults.filter((r) => r.status === "success").length,
      acted: engineResults.filter((r) => r.acted).length,
      engines: engineResults
    };
  } finally {
    // Always release the in-process mutex, even on the early lease/skip returns.
    tickInFlight = false;
  }
}
