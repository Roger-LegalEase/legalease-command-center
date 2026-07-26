// Founder OS Release 5 — the Scoreboard as a trusted KPI registry.
//
// The charter's honesty rules are the point of this release, so most of this suite proves
// absences and refusals rather than features:
//
//   1. Every metric carries all nine contract fields, or the release has not shipped.
//   2. No fake zeroes: an unavailable metric is null, never 0.
//   3. No fabricated variance: missing target or missing prior means no variance, not zero.
//   4. No substitution: cash is never derived from Stripe gross payments.
//   5. The registry and the service cannot drift — every card has an entry and every entry a card.
//   6. Flag off changes nothing.

import assert from "node:assert/strict";

import {
  FOUNDER_OS_SCOREBOARD_ENV_KEY,
  FOUNDER_OS_SCOREBOARD_SECTIONS,
  readFounderOsScoreboardConfig
} from "./ui/founder-os-config.mjs";
import {
  FOUNDER_KPI_REGISTRY,
  KPI_TARGET_SOURCES,
  kpiRegistryEntry,
  kpiTarget,
  kpiVariance
} from "./ui/founder-kpi-registry.mjs";
import {
  FOUNDER_SCOREBOARD_CONTRACT_FIELDS,
  buildFounderScoreboardRegistryView
} from "./ui/view-models/founder-scoreboard-registry-view.mjs";
import { buildFounderScoreboard } from "./founder-scoreboard-service.mjs";
import { buildFounderCompanyHealth } from "./founder-company-health-service.mjs";

const NOW = "2026-07-26T15:00:00.000Z";
const OWNER = Object.freeze({ authenticated:true, id:"roger", role:"owner", label:"Roger" });
const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

function baseState(overrides = {}) {
  return {
    runwayInputs:{ currentCashBalance:"50000", monthlyBurn:"10000", asOfDate:"2026-07-25", updatedAt:"2026-07-25T12:00:00.000Z" },
    settings:{ founderKpiTargets:{ runwayMonthsTarget:"6", monthlyRevenueTarget:"25000" } },
    partners:[], pilots:[], partnerPrograms:[], prospectCandidates:[],
    outreachContacts:[], outreachReplies:[], outreachAttempts:[], outreachCampaigns:[],
    campaigns:[], supportIssues:[], tasks:[], meetingBriefs:[],
    funnelSnapshots:[], operatingPulseSnapshots:[], engagementGrowthSnapshots:[],
    connectorStatus:[], osHealthSnapshots:[], heartbeatRuns:[], sendgridWebhookHealth:{},
    socialAccounts:[], systemHealth:{},
    ...overrides
  };
}

function viewFor(state) {
  const scoreboard = buildFounderScoreboard(state, OWNER, NOW);
  const health = buildFounderCompanyHealth(state, OWNER, NOW);
  return buildFounderScoreboardRegistryView(scoreboard, health, state);
}

const allCards = (view) => view.groups.flatMap((group) => group.cards);

// ---------------------------------------------------------------------------------------------
// The flag and the sections
// ---------------------------------------------------------------------------------------------

check("the flag is off unless the environment says exactly true", () => {
  assert.equal(readFounderOsScoreboardConfig({}).enabled, false);
  assert.equal(readFounderOsScoreboardConfig({ [FOUNDER_OS_SCOREBOARD_ENV_KEY]:"1" }).enabled, false);
  assert.equal(readFounderOsScoreboardConfig({ [FOUNDER_OS_SCOREBOARD_ENV_KEY]:"TRUE" }).enabled, false);
  assert.equal(readFounderOsScoreboardConfig({ [FOUNDER_OS_SCOREBOARD_ENV_KEY]:"true" }).enabled, true);
});

check("the six sections are the charter's six, in charter order", () => {
  assert.deepEqual(FOUNDER_OS_SCOREBOARD_SECTIONS.map((section) => section.label),
    ["Financial", "Acquisition", "Pipeline", "Customer", "Marketing", "Platform health"]);
});

// ---------------------------------------------------------------------------------------------
// 1. The registry and the service cannot drift apart
// ---------------------------------------------------------------------------------------------

check("every metric the service builds has a registry entry, and every entry a metric", () => {
  // Read the ids from the BUILT view, not from the source text. An earlier version of this test
  // grepped `id:"…"` literals and reported full coverage while seven health-group cards — whose
  // ids are assembled at runtime — had no registry entry at all. Building the view is the only
  // way to see every metric a founder can actually see.
  const cardIds = [...new Set(allCards(viewFor(baseState())).map((card) => card.id))];
  const registryIds = FOUNDER_KPI_REGISTRY.map((entry) => entry.id);
  assert.deepEqual(registryIds.filter((id) => !cardIds.includes(id)), [],
    "a registry entry for a metric that does not exist would describe nothing");
  assert.deepEqual(cardIds.filter((id) => !registryIds.includes(id)), [],
    "a metric with no registry entry has no definition, no corrective action and no target — the charter requires all three");
});

check("every registry entry names a definition, a source and a corrective action", () => {
  for (const entry of FOUNDER_KPI_REGISTRY) {
    assert.ok(entry.definition && entry.definition.length > 15, `${entry.id} needs a real definition`);
    assert.ok(entry.sourceKind, `${entry.id} must name its source`);
    assert.ok(entry.correctiveAction?.target, `${entry.id} must offer one place to act`);
    assert.ok(["higher", "lower"].includes(entry.betterWhen), `${entry.id} must say which direction is good`);
    assert.ok(Object.values(KPI_TARGET_SOURCES).includes(entry.targetSource), `${entry.id} target source must be declared`);
  }
});

check("a corrective action points at a workspace, never back at the Scoreboard it came from", () => {
  for (const entry of FOUNDER_KPI_REGISTRY) {
    // #revenue IS the Scoreboard route, and it is legitimate only for the finance inputs the
    // founder edits there. Everything else must send them somewhere work happens.
    if (entry.correctiveAction.target !== "#revenue") continue;
    assert.ok(["cash_available", "monthly_burn", "runway", "website_visits", "signups", "paid_signups",
      "intake_starts", "intake_completions", "purchases", "conversion_rate"].includes(entry.id),
      `${entry.id} points back at the Scoreboard; only finance inputs and funnel review may do that`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. The nine-field contract
// ---------------------------------------------------------------------------------------------

check("every metric carries all nine contract fields", () => {
  const cards = allCards(viewFor(baseState()));
  assert.ok(cards.length >= 20, `expected the full metric set, got ${cards.length}`);
  for (const card of cards) {
    for (const field of FOUNDER_SCOREBOARD_CONTRACT_FIELDS) {
      assert.ok(Object.hasOwn(card, field), `${card.id} is missing the contract field "${field}"`);
    }
    assert.ok(card.definition, `${card.id} must state what it is`);
    assert.ok(card.status?.label, `${card.id} must carry exactly one status label`);
    assert.ok(card.correctiveAction, `${card.id} must offer one place to act`);
  }
});

check("exactly one status label per metric, from the four the charter allows", () => {
  for (const card of allCards(viewFor(baseState()))) {
    assert.ok(["Live", "Manual", "Unavailable", "Needs attention"].includes(card.status.label),
      `${card.id} has status "${card.status.label}", which is not one of the charter's four`);
  }
});

check("a derived metric says what it is derived from", () => {
  const runway = kpiRegistryEntry("runway");
  assert.match(runway.derivedFrom, /cash available/i);
  assert.match(kpiRegistryEntry("conversion_rate").derivedFrom, /intake starts/i);
});

// ---------------------------------------------------------------------------------------------
// 3. No fake zeroes
// ---------------------------------------------------------------------------------------------

check("an unavailable metric reports null, never zero", () => {
  // Nothing configured at all: most metrics must be unavailable, and none may show a number.
  const view = viewFor({ settings:{} });
  for (const card of allCards(view)) {
    if (card.current?.available === true) continue;
    assert.equal(card.current?.value, null,
      `${card.id} is unavailable but reports ${JSON.stringify(card.current?.value)}; a zero would read as "we measured and found nothing"`);
  }
  assert.equal(view.safety.missingValuesRenderedAsZero, false);
});

check("an unavailable metric gets no variance rather than a zero variance", () => {
  for (const card of allCards(viewFor({ settings:{} }))) {
    if (card.current?.available === true) continue;
    assert.equal(card.varianceToTarget, null, `${card.id} must not report a variance it cannot compute`);
    assert.equal(card.varianceToPrevious, null, `${card.id} must not report a variance it cannot compute`);
  }
});

// ---------------------------------------------------------------------------------------------
// 4. No fabricated variance, and direction has meaning
// ---------------------------------------------------------------------------------------------

check("a variance needs two real numbers", () => {
  const entry = kpiRegistryEntry("runway");
  assert.equal(kpiVariance(entry, 5, null), null, "no comparison value means no variance");
  assert.equal(kpiVariance(entry, null, 6), null, "no current value means no variance");
  assert.equal(kpiVariance(entry, Number.NaN, 6), null, "NaN is not a number");
  const real = kpiVariance(entry, 5, 6);
  assert.equal(real.difference, -1);
  assert.ok(Math.abs(real.share + 1 / 6) < 1e-9);
  assert.equal(real.direction, "down");
  assert.equal(real.better, false, "less runway than target is not better");
});

check("a zero baseline yields no share rather than a meaningless percentage", () => {
  const variance = kpiVariance(kpiRegistryEntry("signups"), 10, 0);
  assert.equal(variance.difference, 10);
  assert.equal(variance.share, null, "a percentage change from zero is undefined, not infinite and not zero");
});

check("direction respects whether higher or lower is better", () => {
  // Fewer overdue follow-ups is an improvement; less revenue is not.
  const fewer = kpiVariance(kpiRegistryEntry("followups_due"), 2, 5);
  assert.equal(fewer.direction, "down");
  assert.equal(fewer.better, true, "fewer follow-ups due is better");
  const less = kpiVariance(kpiRegistryEntry("revenue_this_month"), 100, 500);
  assert.equal(less.direction, "down");
  assert.equal(less.better, false, "less revenue is not better");
  assert.equal(kpiVariance(kpiRegistryEntry("signups"), 4, 4).better, null, "flat is neither better nor worse");
});

check("a target is read only from a stored decision, never inferred", () => {
  const entry = kpiRegistryEntry("runway");
  assert.equal(kpiTarget(entry, { settings:{ founderKpiTargets:{ runwayMonthsTarget:"6" } } }), 6);
  assert.equal(kpiTarget(entry, { settings:{} }), null, "no stored target means no target");
  assert.equal(kpiTarget(entry, { settings:{ founderKpiTargets:{ runwayMonthsTarget:"" } } }), null);
  assert.equal(kpiTarget(entry, { settings:{ founderKpiTargets:{ runwayMonthsTarget:"soon" } } }), null,
    "an unparseable target is no target, not zero");
  // A metric declared to have no target source can never acquire one.
  assert.equal(kpiTarget(kpiRegistryEntry("refunds"), { settings:{ founderKpiTargets:{ refunds:"5" } } }), null);
});

// ---------------------------------------------------------------------------------------------
// 5. No substitution of one financial concept for another
// ---------------------------------------------------------------------------------------------

check("cash is owner-entered and is never derived from Stripe", () => {
  // Stripe reporting a large gross must not move cash, burn or runway by a penny.
  const withoutStripe = viewFor(baseState());
  const withStripe = viewFor(baseState({
    stripeRevenue:{ available:true, configured:true, source:"stripe_live", gross:999_999, currency:"usd", fetchedAt:NOW, dailyGross:{} }
  }));
  const cardById = (view, id) => allCards(view).find((card) => card.id === id);
  for (const id of ["cash_available", "monthly_burn", "runway"]) {
    assert.deepEqual(
      cardById(withStripe, id).current,
      cardById(withoutStripe, id).current,
      `${id} changed when Stripe data appeared; Stripe gross payments are not cash`
    );
  }
  assert.equal(withStripe.safety.financialConceptsSubstituted, 0);
});

check("the definitions say plainly what revenue and cash are not", () => {
  assert.match(kpiRegistryEntry("revenue_this_month").definition, /not cash/i);
  assert.match(kpiRegistryEntry("revenue_this_month").definition, /before fees/i);
  assert.match(kpiRegistryEntry("cash_available").definition, /not Stripe/i);
});

// ---------------------------------------------------------------------------------------------
// 6. Platform health folded in, exceptions routed to Today
// ---------------------------------------------------------------------------------------------

check("platform health is a section of the Scoreboard, not a separate destination", () => {
  const view = viewFor(baseState());
  assert.equal(view.platformHealth.key, "platform_health");
  assert.equal(view.platformHealth.label, "Platform health");
  assert.ok(Array.isArray(view.platformHealth.components));
});

check("a component that cannot be read says so rather than reporting healthy components", () => {
  const view = buildFounderScoreboardRegistryView(
    buildFounderScoreboard(baseState(), OWNER, NOW),
    { available:false },
    baseState()
  );
  assert.equal(view.platformHealth.available, false);
  assert.match(view.platformHealth.unavailableReason, /could not be read/i);
  assert.deepEqual(view.platformHealth.components, []);
});

check("only genuine problems become exceptions for Today", () => {
  const view = viewFor(baseState());
  for (const exception of view.exceptions) {
    assert.equal(exception.kind, "needs_attention",
      "an unconfigured source is not a problem to put in front of Roger; only needs-attention is");
    assert.ok(exception.label, "an exception must name itself");
  }
  // An unavailable metric must NOT appear.
  const unavailable = allCards(view).filter((card) => card.status.key === "unavailable").map((card) => `scoreboard-${card.id}`);
  for (const id of unavailable) {
    assert.ok(!view.exceptions.some((exception) => exception.id === id),
      `${id} is merely unconfigured and must not be raised as an exception`);
  }
});

// ---------------------------------------------------------------------------------------------
// 7. The projection reads and does nothing else
// ---------------------------------------------------------------------------------------------

check("building the view mutates nothing and acts on nothing", () => {
  const state = baseState();
  const before = JSON.stringify(state);
  viewFor(state);
  assert.equal(JSON.stringify(state), before);
  const view = viewFor(state);
  assert.deepEqual(view.safety, {
    fullStateReturned:false, mutations:0, externalActions:0,
    missingValuesRenderedAsZero:false, financialConceptsSubstituted:0
  });
});

check("an unavailable scoreboard yields an unavailable view, not an empty-looking healthy one", () => {
  const view = buildFounderScoreboardRegistryView({ available:false, availability:{ state:"not_authorized" } }, {}, {});
  assert.equal(view.available, false);
  assert.deepEqual(view.groups, []);
  assert.deepEqual(view.exceptions, []);
});

console.log(`Founder OS Release 5 scoreboard: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
