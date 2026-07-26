// Founder OS Release 5 — the Scoreboard as a trusted KPI registry.
//
// A projection over the EXISTING Founder Scoreboard and Company Health services. It builds no
// metric of its own and reads no collection they do not already read. What it adds is the half
// of the charter's per-metric contract that did not exist at HEAD — Definition, Target,
// Variance, Corrective action — plus Platform health folded in and exceptions collected for
// Today.
//
// The honesty rules from docs/founder-os/workspaces/scoreboard.md are enforced here as code,
// not as convention:
//
//   * NO FAKE ZEROES. An unavailable metric reports `null`. The underlying service already
//     guarantees this (`missingValuesRenderedAsZero:false`); this layer must not undo it, and a
//     test asserts no unavailable value is ever numeric.
//   * NO SUBSTITUTION. Cash is never derived from Stripe. Nothing here computes one financial
//     concept from another; every value passes through from the service that owns it.
//   * NO FABRICATED VARIANCE. A variance needs two real numbers. Missing target or missing
//     previous value means the variance is omitted, not zeroed.
//   * DERIVED METRICS SAY SO. `derivedFrom` travels with the metric.

import {
  FOUNDER_KPI_REGISTRY,
  kpiRegistryEntry,
  kpiTarget,
  kpiVariance
} from "../founder-kpi-registry.mjs";

const list = (value) => Array.isArray(value) ? value : [];

// A metric needs attention when the service says so, or when its source is connected but the
// surface has no value for it — the second case is the one that erodes trust quietly, because
// "Unavailable" next to a working integration reads as a broken product.
export const SCOREBOARD_EXCEPTION_KINDS = Object.freeze(["needs_attention", "unavailable"]);

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function enrich(card, state) {
  const entry = kpiRegistryEntry(card.id);
  const current = card.current?.available === true ? numeric(card.current.value) : null;
  const previous = card.previous?.available === true ? numeric(card.previous.value) : null;
  const target = entry ? kpiTarget(entry, state) : null;

  return Object.freeze({
    ...card,
    // The four fields the charter requires and HEAD did not have.
    definition: entry?.definition || null,
    sourceKind: entry?.sourceKind || null,
    target,
    // Two variances, because the charter asks for "current vs target / prior" and they answer
    // different questions. Either may be absent; neither is ever invented.
    varianceToTarget: entry && target !== null ? kpiVariance(entry, current, target) : null,
    varianceToPrevious: entry ? kpiVariance(entry, current, previous) : null,
    correctiveAction: entry?.correctiveAction || null,
    derivedFrom: entry?.derivedFrom || null,
    betterWhen: entry?.betterWhen || null,
    // Stated explicitly so a reader never has to infer "no target" from a null.
    targetSource: entry?.targetSource || "none",
    registered: Boolean(entry)
  });
}

// Platform health, folded in as the charter's sixth section rather than living at its own
// destination. The component shape is the Company Health service's own; nothing is recomputed.
function platformSection(health) {
  const components = list(health?.components);
  return Object.freeze({
    key: "platform_health",
    label: "Platform health",
    available: health?.available === true,
    // A component list that could not be read says so instead of reporting nine healthy things.
    unavailableReason: health?.available === true ? null : "Platform health could not be read.",
    components: Object.freeze(components.map((component) => Object.freeze({ ...component })))
  });
}

export function buildFounderScoreboardRegistryView(scoreboard = {}, health = {}, state = {}) {
  if (scoreboard?.available !== true) {
    return Object.freeze({
      available: false,
      availability: scoreboard?.availability || { state: "unavailable", reason: "scoreboard_unavailable" },
      groups: Object.freeze([]),
      platformHealth: platformSection(health),
      exceptions: Object.freeze([]),
      contract: FOUNDER_SCOREBOARD_CONTRACT_FIELDS,
      safety: SAFETY
    });
  }

  const groups = list(scoreboard.groups).map((group) => Object.freeze({
    ...group,
    cards: Object.freeze(list(group.cards).map((card) => enrich(card, state)))
  }));

  const cards = groups.flatMap((group) => group.cards);

  // Exceptions route into Today. Only genuine problems: a metric needing attention, or a
  // platform component needing attention. An unavailable metric is NOT an exception on its own
  // — most are honestly unconfigured, and treating every one as a problem would make Today
  // useless, which is the opposite of the charter's "healthy campaigns are quiet".
  const exceptions = [
    ...cards.filter((card) => card.status?.key === "needs_attention").map((card) => Object.freeze({
      id: `scoreboard-${card.id}`,
      kind: "needs_attention",
      label: card.label,
      detail: card.definition,
      action: card.correctiveAction
    })),
    ...list(health?.components).filter((component) => component.status?.key === "needs_attention")
      .map((component) => Object.freeze({
        id: `platform-${component.id}`,
        kind: "needs_attention",
        label: component.label,
        detail: component.summary || null,
        action: component.actionHref ? { label: "Open", target: component.actionHref } : null
      }))
  ];

  return Object.freeze({
    available: true,
    generatedAt: scoreboard.generatedAt || null,
    availability: scoreboard.availability,
    groups: Object.freeze(groups),
    platformHealth: platformSection(health),
    exceptions: Object.freeze(exceptions),
    summary: scoreboard.summary,
    contract: FOUNDER_SCOREBOARD_CONTRACT_FIELDS,
    safety: SAFETY
  });
}

// The charter's nine per-metric fields, named so the test suite can assert every one is present
// on every metric rather than trusting that they were all wired.
export const FOUNDER_SCOREBOARD_CONTRACT_FIELDS = Object.freeze([
  "definition", "sourceKind", "refreshedAt", "current", "previous", "target",
  "varianceToTarget", "correctiveAction", "status"
]);

const SAFETY = Object.freeze({
  fullStateReturned: false,
  mutations: 0,
  externalActions: 0,
  missingValuesRenderedAsZero: false,
  // Nothing in this projection computes a financial concept from a different one.
  financialConceptsSubstituted: 0
});

// Exposed so a test can assert the registry and the service never drift apart.
export const REGISTERED_METRIC_IDS = Object.freeze(FOUNDER_KPI_REGISTRY.map((entry) => entry.id));
