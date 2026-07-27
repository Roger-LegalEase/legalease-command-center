// Standing reconciliation of stranded send-claims.
//
// 2026-07-27: 266 claims sat blocked for up to eighteen days and nobody knew, because nothing
// ever looked. Detection existed (the campaign view flags "unconfirmed") but nothing acted on
// it, and nothing raised it. This engine closes that: every tick it counts the stranded claims,
// and — when its autopilot toggle is on — reconciles them against SendGrid's own records.
//
// What it will and will not do on its own:
//   - It CONFIRMS a claim only on positive provider evidence that the message was sent. That is
//     the safe direction: a confirmed claim means that person is never emailed again for that
//     step.
//   - It RELEASES a claim only when SendGrid's per-message activity covers that day and holds
//     no message for that recipient — i.e. proof of a non-send, not absence of proof.
//   - Anything it cannot evidence it LEAVES BLOCKED and reports. It never guesses, and it never
//     sends anything itself.
//
// plan() is read-only and always runs. act() runs only behind the engine's autopilot toggle,
// which defaults OFF like every other engine's.

import { autopilotEnabled } from "./heartbeat.mjs";
import {
  RECONCILE_CLASSES,
  applyReactivationReconciliation,
  planReactivationReconciliation,
  stuckClaims
} from "./reactivation-reconcile.mjs";

export const RECONCILE_ENGINE_ID = "reactivation-claim-reconciler";
// Below this the ledger is healthy and there is nothing to say every hour.
export const RECONCILE_REPORT_THRESHOLD = 1;

const list = (value) => (Array.isArray(value) ? value : []);

export function buildReactivationReconcileEngine(deps = {}) {
  return {
    id: RECONCILE_ENGINE_ID,
    cadence: "daily",
    plan(state, ctx = {}) {
      const stranded = stuckClaims(state, { now: ctx.now || new Date() });
      const observations = [];
      if (stranded.length >= RECONCILE_REPORT_THRESHOLD) {
        const oldest = stranded.map((claim) => String(claim.claimed_at || "")).sort()[0] || "";
        observations.push({
          type: "stranded_send_claims",
          count: stranded.length,
          oldestClaimedAt: oldest,
          // Plain English: this lands in front of the owner, not an engineer.
          summary: `${stranded.length} send${stranded.length === 1 ? "" : "s"} were started but never confirmed, so those people are currently blocked from receiving that email. The oldest has been waiting since ${oldest.slice(0, 10) || "an unknown date"}.`
        });
      }
      return { state, proposals: [], observations };
    },
    async act(state, ctx = {}) {
      if (!autopilotEnabled(state, RECONCILE_ENGINE_ID)) {
        return { state, results: [{ status: "skipped", reason: "autopilot_off" }] };
      }
      const stranded = stuckClaims(state, { now: ctx.now || new Date() });
      if (!stranded.length) return { state, results: [{ status: "noop", reason: "no_stranded_claims" }] };

      let plan;
      try {
        plan = await planReactivationReconciliation(state, {
          now: ctx.now || new Date(),
          env: ctx.env || process.env,
          fetchImpl: deps.fetchImpl || fetch
        });
      } catch (error) {
        return { state, results: [{ status: "error", reason: `reconcile_plan_failed:${String(error?.message || error).slice(0, 200)}` }] };
      }
      if (!plan.ok) {
        return { state, results: [{ status: "skipped", reason: "provider_evidence_unavailable", candidates: plan.candidates }] };
      }
      const applied = applyReactivationReconciliation(state, plan, { now: ctx.now || new Date(), actor: RECONCILE_ENGINE_ID });
      return {
        state: applied.state,
        results: [{
          status: "reconciled",
          confirmed: applied.confirmed,
          released: applied.released,
          leftBlocked: applied.leftBlocked,
          perMessage: plan.counts[RECONCILE_CLASSES.CONFIRMED_PER_MESSAGE],
          dailyTotals: plan.counts[RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS],
          noRecord: plan.counts[RECONCILE_CLASSES.NO_RECORD],
          undetermined: plan.counts[RECONCILE_CLASSES.UNDETERMINED]
        }],
        // The reconciler resolves claims and nothing else. Naming the collections here keeps
        // that honest and lets the caller scope the write.
        allowedCollections: ["reactivationSendClaims"]
      };
    }
  };
}

export function strandedClaimCount(state = {}, now = new Date()) {
  return stuckClaims(state, { now }).length;
}

export function reconciliationLedger(state = {}) {
  return list(state.reactivationSendClaims).filter((claim) => claim?.reconciliation);
}
