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
// Ledgers whose rows are written durably, one row at a time, OUTSIDE the tick's closing bulk
// write — because they are the permission to send, and must survive a failed tick.
// Warn when a tick's peak heap crosses this. The heap ceiling in production is 384 MB
// (NODE_OPTIONS); ticks that reached ~330 MB aborted with SIGABRT. 260 MB gives real headroom
// to notice the climb before it aborts.
export const HEARTBEAT_PEAK_HEAP_WARN_BYTES = 260 * 1024 * 1024;
export const DURABLE_CLAIM_COLLECTIONS = Object.freeze(["reactivationSendClaims", "outreachSendClaims"]);

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
    // Peak-memory sampling for this tick (2026-07-27). The tick aborted with SIGABRT / exit 134
    // three times in a row before anyone knew memory was the cause; Render's alert email was the
    // only signal. Sampling here makes the peak visible in our own logs, the same day.
    const memorySamples = [];
    const sampleMemory = () => { try { memorySamples.push(process.memoryUsage().heapUsed); } catch { /* non-node host */ } };
    const memoryTimer = setInterval(sampleMemory, 1_000);
    if (typeof memoryTimer?.unref === "function") memoryTimer.unref();
    sampleMemory();
    const tickStartedMs = Date.now();
    let state = await store.readState();
    sampleMemory();
    // Snapshot for the closing diff-scoped write: engines thread state immutably
    // (state = planResult.state), so a collection changed exactly when its reference did.
    let initialState = state;

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
    // Send-claim ledgers are owned exclusively by their own durable per-row writes
    // (claimCollectionItems to insert, mutateCollectionItem to resolve) and must never travel in
    // this bulk patch.
    //
    // 2026-07-27: they used to, and it was fatal. A claim inserted mid-tick is absent from the
    // opening snapshot above, so the row diff emitted expected_version:null — "this row must not
    // exist" — for a row that by then did. The store raised a version conflict and the ENTIRE
    // tick's batch aborted: claim transitions, attempt rows, ledger entries, every engine's
    // output. That is what left 266 claims stranded at "claimed", permanently blocking those
    // people, while the campaign reported itself healthy. Excluding them here means a tick that
    // sends can no longer poison its own closing write.
    for (const claimCollection of DURABLE_CLAIM_COLLECTIONS) delete patch[claimCollection];
    // writeChanges, NOT writeCollections (2026-07-26 write-amplification fix). The reference
    // diff above narrows to changed COLLECTIONS, but engines spread-copy freely, so a tick
    // that materially changed a handful of rows still presented ~22,800 rows for rewrite —
    // hourly, growing with every snapshot ledger. Handing the store before/after lets its
    // row diff (coreMutationsBetween) persist only rows whose payload actually differs:
    // the ledger entries, the snapshots, and whatever an engine genuinely changed. Same
    // serialized executor, same versioned-conflict semantics; the lease keeps its dedicated
    // mutateCollectionItem below.
    // Read the "before" side for ONLY the collections that changed, instead of retaining the
    // whole pre-tick graph. `initialState` kept every replaced collection's old array alive for
    // the entire tick — two live copies of everything an engine touched — which is memory the
    // 384 MB heap ceiling could not spare. Reference identity above still decides WHAT changed;
    // this only decides what we hold while deciding it.
    const changedKeys = Object.keys(patch);
    // Hold the "before" side for ONLY the collections that changed — which is all the diff has
    // ever needed — and then release the whole pre-tick graph.
    const beforeRefs = {};
    for (const key of changedKeys) beforeRefs[key] = initialState[key];
    // Release the rest of the pre-tick graph NOW. Every collection an engine replaced still had its old
    // array reachable through initialState; dropping the reference here lets the collector take
    // them before the write's own serialisation allocations, which is exactly where the peak is.
    initialState = null;
    const patchBefore = {};
    for (const key of changedKeys) patchBefore[key] = beforeRefs[key];
    sampleMemory();
    await store.writeChanges(patchBefore, patch);
    await store.mutateCollectionItem("heartbeatLease", "singleton", (current) => current?.runId === id
      ? { runId:"", holder:"", claimedAt:current.claimedAt || "", expiresAt:"", releasedAt:finishedAt }
      : current, { maxRetries:2 });

    sampleMemory();
    clearInterval(memoryTimer);
    const peakHeapBytes = Math.max(0, ...memorySamples);
    if (peakHeapBytes >= HEARTBEAT_PEAK_HEAP_WARN_BYTES) {
      // Distinct, loud, and same-day. Before this the only signal that a tick was about to abort
      // with SIGABRT was a Render alert email after the fact.
      console.warn(JSON.stringify({
        level: "warn",
        event: "heartbeat_peak_memory",
        runId: id,
        peakHeapMb: Math.round(peakHeapBytes / 1048576),
        thresholdMb: Math.round(HEARTBEAT_PEAK_HEAP_WARN_BYTES / 1048576),
        durationMs: Date.now() - tickStartedMs,
        message: `Heartbeat tick peaked at ${Math.round(peakHeapBytes / 1048576)} MB of heap, over the ${Math.round(HEARTBEAT_PEAK_HEAP_WARN_BYTES / 1048576)} MB warning threshold. The Node heap ceiling is set by NODE_OPTIONS; a tick that reaches it aborts with SIGABRT and the service restarts.`
      }));
    }
    return {
      ok: true,
      runId: id,
      etDate: parts.dateKey,
      etHour: parts.hour,
      ran: engineResults.filter((r) => r.status === "success").length,
      acted: engineResults.filter((r) => r.acted).length,
      durationMs: Date.now() - tickStartedMs,
      peakHeapMb: Math.round(Math.max(0, ...memorySamples) / 1048576),
      engines: engineResults
    };
  } finally {
    // Always release the in-process mutex, even on the early lease/skip returns.
    tickInFlight = false;
  }
}
