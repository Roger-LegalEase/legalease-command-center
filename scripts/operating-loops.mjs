// B7 — Operating Loop Registry (READ-ONLY monitors, scheduled on the B1 heartbeat).
//
// What B7 is — and what it deliberately is NOT:
//   • B7 takes the operating-loop monitors that ALREADY EXIST in the codebase and SCHEDULES them
//     on the B1 heartbeat so they watch the business continuously instead of only on-demand. It
//     does NOT rewrite any loop logic — each loop's run() CALLS the existing function verbatim
//     (buildCashRunwayPulse, buildFounderCapacityPulse, collectGlobalAgingItems,
//     partnerLifecycleInsights + partnerProgramOverview, the outreach status counts,
//     saveOsHealthSnapshot). B7 is the registry + scheduling + persistence layer, not new business
//     logic.
//   • Every Phase-0 loop is a PURE MONITOR (read/report). None has an act() path — no posting, no
//     sending, no mutation of any external system. "Read-only" is structural: the engine descriptor
//     has no act key, so a toggled-ON autopilot is a no-op (heartbeat skips act for engines without
//     one), exactly like B3/B4.
//
// HONESTY RULE: each loop reports only REAL signals from live state. A source that isn't connected
// or a metric that can't be computed says so ("needs_input", rates "not_computed") — it never
// fabricates a number. Cash/runway returns runway_months:null + a todo when cash/burn are missing;
// outreach reports real COUNTS and is explicit that RATES are not computed (denominators untracked).
//
// REGISTRY SHAPE: one heartbeat engine per loop (the existing engine-registry pattern — no new
// scheduler). LOOP_REGISTRY is the list of loop descriptors; buildAllOperatingLoopEngines() adapts
// each into a standard {id, cadence, plan} engine that B1 already knows how to run, gate, and
// idempotency-track. Cadence is per-loop (a descriptor field). Findings persist to ONE new
// collection, operatingPulseSnapshots (the B1/B2/B3/B5 persistence trap — it MUST be in
// coreStateCollections). os-health additionally reuses its existing osHealthSnapshots collection.

import { buildCashRunwayPulse, buildFounderCapacityPulse } from "./operator-pulse-feeders.mjs";
import { collectGlobalAgingItems } from "./daily-run-session.mjs";
import { partnerLifecycleInsights } from "./partner-lifecycle.mjs";
import { partnerProgramOverview } from "./partner-program-engine.mjs";
import { outreachConfigOf, OUTREACH_QUEUE_TYPE } from "./outreach-os.mjs";
import { saveOsHealthSnapshot } from "./os-health.mjs";

// ---------------------------------------------------------------------------
// DATA MODEL — the findings surface MUST be in coreStateCollections (storage.mjs) or it silently
// fails to persist to Supabase. test asserts membership; B3 codebase-health flags the drift.
// ---------------------------------------------------------------------------
export const OPERATING_PULSE_COLLECTIONS = ["operatingPulseSnapshots"];

const NO_EXTERNAL_ACTIONS =
  "Read-only operating-loop monitor. No posts, no messages, no external systems contacted, no outward writes.";

const list = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const lower = (v) => String(v || "").toLowerCase();
// The heartbeat passes ctx.now as a Date; tests pass ctx.nowIso as an ISO string. Coerce either to
// an ISO string (snapshot ids/dates slice this), falling back to wall-clock when absent.
function nowIso(ctx = {}) {
  const v = ctx.nowIso || ctx.now;
  if (typeof v === "string") return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// LOOP RUNNERS — each CALLS the existing loop function and shapes a uniform monitor result:
//   { result: { status, data_connected, headline, metrics, trend:{key,value} }, state? }
// `state` is returned only by loops that persist extra detail of their own (os-health). The five
// read-only loops return result alone and never mutate state.
// ---------------------------------------------------------------------------

// 1. CASH / RUNWAY — wraps buildCashRunwayPulse (operator-pulse-feeders.mjs). Honest: runway is
//    null until cash + burn are entered; we report that, never a fabricated runway.
function runCashRunway(state, ctx) {
  const pulse = buildCashRunwayPulse(state, { now: nowIso(ctx) });
  const connected = pulse.runway_months !== null;
  return {
    result: {
      status: connected ? "reporting" : "needs_input",
      data_connected: connected,
      metrics: pulse,
      trend: { key: "runway_months", value: pulse.runway_months },
      headline: connected
        ? `Runway ${pulse.runway_months} mo (cash ${pulse.cash_on_hand}, burn ${pulse.burn_monthly}/mo). Booked 30d ${pulse.booked_30d}.`
        : `Runway not computed — ${pulse.todo} Booked 30d ${pulse.booked_30d}; weighted pipeline ${Math.round(pulse.pipeline_weighted)}.`
    }
  };
}

// 2. FOUNDER CAPACITY — wraps buildFounderCapacityPulse (operator-pulse-feeders.mjs).
function runCapacity(state, ctx) {
  const pulse = buildFounderCapacityPulse(state, { now: nowIso(ctx) });
  return {
    result: {
      status: pulse.overload_warning ? "overloaded" : "reporting",
      data_connected: true,
      metrics: pulse,
      trend: { key: "items_needing_operator", value: pulse.items_needing_operator },
      headline: `${pulse.items_needing_operator} item(s) need you; ${pulse.completed_today} cleared today (backlog ${pulse.backlog_trend}).`
    }
  };
}

// 3. AGING ITEMS — wraps collectGlobalAgingItems (daily-run-session.mjs). Generic operator-artifact
//    aging (tasks, inbox, reports, evidence, reviews) — warn ≥14d, stop ≥30d.
function runAging(state, ctx) {
  const items = collectGlobalAgingItems(state, { now: nowIso(ctx) });
  const stop = items.filter((i) => i.aging_severity === "stop");
  const warn = items.filter((i) => i.aging_severity === "warn");
  return {
    result: {
      status: stop.length ? "stop_items" : warn.length ? "warn_items" : "clear",
      data_connected: true,
      metrics: {
        total: items.length, stop: stop.length, warn: warn.length,
        oldest_age_days: items[0]?.age_days || 0,
        top: items.slice(0, 5).map((i) => ({ title: i.title, age_days: i.age_days, severity: i.aging_severity, route: i.route }))
      },
      trend: { key: "total_aging", value: items.length },
      headline: items.length
        ? `${items.length} aging item(s): ${stop.length} stop, ${warn.length} warn; oldest ${items[0].age_days}d.`
        : "No aging items past threshold."
    }
  };
}

// 4. PARTNER HEALTH — read-only consolidation of the two existing aggregators
//    (partnerLifecycleInsights + partnerProgramOverview). No new business logic; just calls both.
function runPartnerHealth(state, ctx) {
  const now = nowIso(ctx);
  const insights = partnerLifecycleInsights(state, { now });
  const overview = partnerProgramOverview(state, { now });
  const stalledPartners = list(insights.stalledPartners).length;
  const stalledPrograms = list(overview.stalled).length;
  const weeklyReportsDue = list(overview.weeklyReportsDue).length;
  return {
    result: {
      status: stalledPartners || stalledPrograms ? "attention" : "reporting",
      data_connected: true,
      metrics: {
        stalled_partners: stalledPartners,
        stalled_programs: stalledPrograms,
        onboarding: list(overview.onboarding).length,
        weekly_reports_due: weeklyReportsDue,
        renewal_candidates: list(overview.renewalCandidates).length,
        proof_worthy_partners: list(insights.proofWorthyPartners).length,
        proposals_need_review: list(overview.proposalsNeedReview).length
      },
      trend: { key: "stalled_total", value: stalledPartners + stalledPrograms },
      headline: `${stalledPartners} stalled partner(s), ${stalledPrograms} stalled program(s); ${weeklyReportsDue} weekly report(s) due.`
    }
  };
}

// 5. OUTREACH HEALTH — mirrors the existing GET /api/outreach/status counts (read-only). Honest:
//    these are REAL counts; bounce/suppression/reply RATES are not computed (per-send denominators
//    are not tracked yet) — reported as "not_computed", never a fabricated rate.
function runOutreachHealth(state, ctx) {
  const queue = list(state.approvalQueue).filter((q) => q.type === OUTREACH_QUEUE_TYPE);
  const cfg = outreachConfigOf(state);
  const attempts = list(state.outreachAttempts);
  const sent = attempts.filter((a) => a.status === "sent").length;
  const dryRun = attempts.filter((a) => a.status === "dry_run").length;
  const bounces = list(state.outreachBounces).length;
  const suppressions = list(state.outreachSuppressions).length;
  const unsubscribes = list(state.outreachUnsubscribes).length;
  const approved = queue.filter((q) => lower(q.status) === "approved").length;
  const queued = queue.filter((q) => lower(q.status) === "queued_for_approval").length;
  return {
    result: {
      status: "reporting",
      data_connected: true,
      metrics: {
        queued, approved, sent, dry_run: dryRun, bounces, suppressions, unsubscribes,
        caps: cfg.caps,
        bounce_rate: "not_computed", suppression_rate: "not_computed", reply_rate: "not_computed",
        rates_note: "Rates not computed — per-send denominators are not tracked yet. Counts are real."
      },
      trend: { key: "sent", value: sent },
      headline: `Queue ${queue.length} (${approved} approved); ${sent} sent / ${dryRun} dry-run; ${bounces} bounce, ${suppressions} suppressed.`
    }
  };
}

// 6. SYSTEM HEALTH — wraps the existing saveOsHealthSnapshot (os-health.mjs). This loop ALSO
//    persists the full os-health snapshot into the existing osHealthSnapshots collection, so it
//    returns the mutated state alongside its pulse summary. Live connection flags are injected via
//    ctx.fetchConnectionHealth (server-provided); absent it, os-health uses its state.runtime
//    fallbacks (honest, possibly stale) — it never invents a connected status.
async function runOsHealth(state, ctx) {
  let connection = {};
  if (typeof ctx.fetchConnectionHealth === "function") {
    try { connection = (await ctx.fetchConnectionHealth(state, ctx)) || {}; }
    catch { connection = {}; }
  }
  const { state: saved, snapshot } = saveOsHealthSnapshot(state, {
    now: nowIso(ctx), actor: ctx.actor || "heartbeat", ...connection
  });
  return {
    state: saved,
    result: {
      status: snapshot.overall_health === "healthy" ? "reporting" : snapshot.overall_health,
      data_connected: true,
      metrics: {
        overall_health: snapshot.overall_health,
        live_gates: snapshot.live_gates_count,
        warnings: list(snapshot.trust_warnings).length
      },
      trend: { key: "warnings", value: list(snapshot.trust_warnings).length },
      headline: `System ${snapshot.overall_health}: ${list(snapshot.trust_warnings).length} warning(s), ${snapshot.live_gates_count} live gate(s).`
    }
  };
}

// ---------------------------------------------------------------------------
// THE REGISTRY — the list of loop descriptors. Cadence is per-loop. engineId is the heartbeat id.
// ---------------------------------------------------------------------------
export const LOOP_REGISTRY = Object.freeze([
  { key: "cash-runway", engineId: "loop-cash-runway", label: "Cash & Runway", cadence: "daily", run: runCashRunway },
  { key: "capacity", engineId: "loop-capacity", label: "Founder Capacity", cadence: "daily", run: runCapacity },
  { key: "aging", engineId: "loop-aging", label: "Aging Items", cadence: "daily", run: runAging },
  { key: "partner-health", engineId: "loop-partner-health", label: "Partner Health", cadence: "daily", run: runPartnerHealth },
  { key: "outreach-health", engineId: "loop-outreach-health", label: "Outreach Health", cadence: "daily", run: runOutreachHealth },
  { key: "os-health", engineId: "loop-os-health", label: "System Health", cadence: "daily", run: runOsHealth }
]);

export const OPERATING_LOOP_ENGINE_IDS = LOOP_REGISTRY.map((d) => d.engineId);

// ---------------------------------------------------------------------------
// PERSISTENCE — one snapshot per loop per ET date into the shared operatingPulseSnapshots
// collection. Mirrors saveDataIntegritySnapshot / B3 / B4: dedupe by id, cap, + audit + activity.
// delta = primary trend value vs the same loop's previous snapshot (trend since last run).
// ---------------------------------------------------------------------------
export function saveOperatingPulseSnapshot(state = {}, descriptor = {}, result = {}, ctx = {}) {
  const generatedAt = nowIso(ctx);
  const date = generatedAt.slice(0, 10);
  const id = `pulse-${descriptor.key}-${date}`;
  const stamp = Date.parse(generatedAt) || generatedAt;
  const actor = ctx.actor || "heartbeat";

  const previous = list(state.operatingPulseSnapshots).find((s) => s.loop === descriptor.key && s.id !== id) || null;
  const trend = result.trend || { key: null, value: null };
  const prevValue = previous && previous.trend ? previous.trend.value : null;
  const delta = typeof trend.value === "number" && typeof prevValue === "number" ? trend.value - prevValue : null;

  const snapshot = {
    id,
    loop: descriptor.key,
    label: descriptor.label,
    cadence: descriptor.cadence,
    generated_at: generatedAt,
    status: result.status,
    data_connected: Boolean(result.data_connected),
    headline: result.headline || "",
    metrics: result.metrics || {},
    trend,
    delta: { since: previous ? previous.id : null, since_generated_at: previous ? previous.generated_at : null, value: delta },
    read_only: true,
    no_external_actions_confirmation: NO_EXTERNAL_ACTIONS
  };

  // Shared collection across all loops; cap generously (one row per loop per day). Retention/prune
  // is a tracked deferred decision (snapshot/ledger collections grow unbounded).
  const next = {
    ...state,
    operatingPulseSnapshots: [snapshot, ...list(state.operatingPulseSnapshots).filter((s) => s.id !== id)].slice(0, 300)
  };
  next.auditHistory = [{
    id: `audit-${id}-${stamp}`,
    timestamp: generatedAt,
    actor,
    action: "operating pulse snapshot refreshed",
    resourceType: "operating_pulse_snapshot",
    resourceId: id,
    beforeValue: null,
    afterValue: { loop: descriptor.key, status: snapshot.status, data_connected: snapshot.data_connected }
  }, ...list(state.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: `activity-${id}-${stamp}`,
    eventType: "Operating Pulse refreshed",
    title: `Operating Pulse: ${descriptor.label}`,
    summary: `${descriptor.label} loop ran. ${snapshot.headline} ${NO_EXTERNAL_ACTIONS}`,
    relatedObjectType: "operating_pulse_snapshot",
    relatedObjectId: id,
    riskLevel: "low",
    metadata: { loop: descriptor.key, externalSideEffects: false, noExternalSystemsContacted: true, outwardWrites: false, readOnly: true },
    createdAt: generatedAt
  }, ...list(state.activityEvents)].slice(0, 500);

  return { state: next, snapshot };
}

// ---------------------------------------------------------------------------
// ENGINE ADAPTER — one heartbeat engine per loop. plan() runs the loop, persists the pulse, and
// returns observations. DELIBERATELY no act(): every Phase-0 loop is a pure monitor, so the
// heartbeat (which skips act for engines without one) makes a toggled-ON autopilot a clean no-op.
// ---------------------------------------------------------------------------
export function buildOperatingLoopEngine(descriptor = {}, deps = {}) {
  return {
    id: descriptor.engineId,
    cadence: descriptor.cadence,
    async plan(state, ctx = {}) {
      const ran = (await descriptor.run(state, { ...ctx, ...deps })) || {};
      const baseState = ran.state || state;          // os-health threads its own persisted state
      const { state: next, snapshot } = saveOperatingPulseSnapshot(baseState, descriptor, ran.result || {}, {
        now: ctx.nowIso || ctx.now, actor: ctx.actor
      });
      return {
        state: next,
        observations: [{
          type: "operating_loop_pulse",
          loop: descriptor.key,
          status: snapshot.status,
          data_connected: snapshot.data_connected,
          headline: snapshot.headline
        }]
      };
      // NO act — by design. Pure monitor; it must never post, send, or write outward.
    }
  };
}

export function buildAllOperatingLoopEngines(deps = {}) {
  return LOOP_REGISTRY.map((descriptor) => buildOperatingLoopEngine(descriptor, deps));
}
