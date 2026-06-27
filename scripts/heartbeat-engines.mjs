// B1 — Heartbeat engine registry. Each engine is a declarative descriptor:
//   { id, cadence: 'daily'|'hourly', plan(state, ctx), act(state, ctx) }
// plan() runs every due tick and may record proposals/observations but performs NO
// external side effects. act() performs side effects and runs ONLY when the engine's
// autopilot toggle is enabled (the heartbeat gates this; default OFF).
//
// B2-B7 register by appending a descriptor here (or via deps injection) — no change to
// heartbeat.mjs is required to add an engine.
//
// Both plan() and act() return { state, proposals?, observations?, results? }. The
// returned state is threaded to the next engine, so engines compose within one tick.

import { runAutonomyCycleOnState } from "./autonomy-engine.mjs";
import { buildOutreachEngine, OUTREACH_ENGINE_ID } from "./outreach-os.mjs";
import { buildProspectEngine, PROSPECT_ENGINE_ID } from "./prospect-discovery.mjs";
import { buildCodebaseHealthEngine, CODEBASE_HEALTH_ENGINE_ID } from "./codebase-health.mjs";

export function buildHeartbeatRegistry(deps = {}) {
  const engines = [];

  // Autonomy cycle — internal-only routine (creates tasks / requests priority rebuilds).
  // Safe by construction: it never emails, publishes, changes pricing, or touches secrets.
  // plan = compute without executing; act = execute auto_safe actions.
  engines.push({
    id: "autonomy-cycle",
    cadence: "hourly",
    plan(state) {
      const result = runAutonomyCycleOnState(state, { executeAutomatic: false });
      return {
        state: result.state,
        proposals: (result.actions || []).filter((a) => a.status === "pending"),
        observations: [{ type: "autonomy_summary", pending: (result.actions || []).filter((a) => a.status === "pending").length }]
      };
    },
    act(state) {
      const result = runAutonomyCycleOnState(state, { executeAutomatic: true });
      return { state: result.state, results: result.executed || [] };
    }
  });

  // Daily source import — performs external fetches, so it is injected by the server.
  // plan only records that an import is due; act delegates to the server executor.
  if (typeof deps.runSourcesDaily === "function") {
    engines.push({
      id: "sources-daily",
      cadence: "daily",
      plan(state) {
        return { state, observations: [{ type: "sources_due", note: "Daily source import is due." }] };
      },
      async act(state, ctx) {
        const result = (await deps.runSourcesDaily(state, ctx)) || {};
        return { state: result.state || state, results: result.results || [] };
      }
    });
  }

  // Scheduled publishing worker — external sends, gated INSIDE by live-posting gates and
  // approval state. Injected by the server. act runs only when autopilot is on AND those
  // inner gates pass, so autopilot is a strict outer gate over existing safety.
  if (typeof deps.runPublishing === "function") {
    engines.push({
      id: "publishing-run",
      cadence: "hourly",
      plan(state) {
        return { state, observations: [{ type: "publishing_due", note: "Scheduled publishing check is due." }] };
      },
      async act(state, ctx) {
        const result = (await deps.runPublishing(state, ctx)) || {};
        return { state: result.state || state, results: result.results || [] };
      }
    });
  }

  // B2 outreach sequencer (controlled, approval-gated). plan() queues proposals with no
  // side effects; act() sends ONLY approved+compliant+unsuppressed+within-caps messages, and
  // only when autopilot is ON (default OFF). The live send is delegated to deps.runOutreachSend
  // (injected by the server); with no dep, or in dry-run, act() records attempts but performs
  // NO network send. Always registered so the autopilot toggle surfaces; safe by construction.
  engines.push(buildOutreachEngine({ runOutreachSend: deps.runOutreachSend }));

  // B5 prospect discovery (Tier-1 datasets only, NO send path). plan() classifies/dedups/scores
  // staged findings with no network; act() does once/day discovery (behind the inert
  // deps.runProspectDiscovery executor) + promotion of human-APPROVED candidates into the B2
  // outreach collections. Code can never write review_state "approved"; autopilot OFF by
  // default is the outer gate. Always registered so the autopilot toggle surfaces.
  engines.push(buildProspectEngine({
    runProspectDiscovery: deps.runProspectDiscovery,
    classifyProspect: deps.classifyProspect
  }));

  // B3 codebase-health monitor (detect-and-report only; auto-fix deliberately removed). plan()
  // runs a READ-ONLY structural source audit and writes a findings report to the
  // codebaseHealthSnapshots surface. It has NO act() method — "never modifies the app" is
  // structural, not a toggle. Always registered so the autopilot toggle surfaces; needs no deps
  // (it reads the local source tree). Autopilot OFF by default is the uniform outer posture, but
  // even toggled ON there is no action path to run.
  engines.push(buildCodebaseHealthEngine());

  return engines;
}

// Stable list of registered engine ids (for surfacing autopilot toggles in the UI even
// when an engine hasn't run yet). Mirrors buildHeartbeatRegistry's ids.
export const HEARTBEAT_ENGINE_IDS = ["autonomy-cycle", "sources-daily", "publishing-run", OUTREACH_ENGINE_ID, PROSPECT_ENGINE_ID, CODEBASE_HEALTH_ENGINE_ID];
