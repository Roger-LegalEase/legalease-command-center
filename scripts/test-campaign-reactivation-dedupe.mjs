// One campaign, not two — the reactivation label merge.
//
// Before this: `collectCampaignSourceContexts` concatenated canonical `campaigns` rows and
// the `reactivationCampaign` singleton with no cross-kind dedupe, so the single live
// reactivation campaign appeared twice in Outreach and Campaigns — once as
// "Expungement.ai reactivation (B1)" with every audience/reply/outcome field showing
// "Unavailable" (canonical rows project only from their own fields), and once as
// "Unnamed campaign" carrying the live 3,762 enrolled / 3,528 excluded audience (the
// singleton has no name).
//
// After: exactly one row, canonical NAME plus the singleton's live audience, status and
// next-send. The merge is conservative and is asserted here not to guess.
import assert from "node:assert/strict";

import { buildCampaignView, buildCampaignViews } from "./ui/view-models/campaign-view.mjs";
import { canonicalLabelForReactivation } from "./ui/view-models/campaign-sources.mjs";
import { buildAuthorizedOutreachHome } from "./outreach-home-service.mjs";
import { buildCampaignDetailView } from "./campaign-detail-service.mjs";

const OWNER = { authenticated: true, role: "owner" };
const CANONICAL_ID = "campaign-reactivation-b1";
const ENGINE_ID = "mvp-reactivation";

// Production-shaped fixture: the ground-truth canonical row (a LABEL with no audience
// fields of its own) plus the engine singleton and its contact rows.
function contacts(total, excluded) {
  return Array.from({ length: total }, (_, index) => index < excluded
    ? { id: `contact-${index}`, campaign_id: ENGINE_ID, unsubscribed: true }
    : { id: `contact-${index}`, campaign_id: ENGINE_ID });
}

function fixture({ canonical = [], singleton = {}, enrolled = 3762, excluded = 3528 } = {}) {
  return {
    campaigns: canonical,
    reactivationCampaign: { campaignId: ENGINE_ID, status: "active", ...singleton },
    reactivationContacts: contacts(enrolled, excluded),
    reactivationAttempts: [],
    reactivationEvents: [],
    reactivationSendClaims: [],
    queueItems: [],
    approvals: [],
    activityEvents: [],
    auditHistory: []
  };
}

const canonicalRow = {
  id: CANONICAL_ID,
  name: "Expungement.ai reactivation (B1)",
  campaignType: "customer_reengagement",
  status: "draft",
  owner: "Roger"
};

// ---------------------------------------------------------------------------------------
// 1. The production case: one row, canonical name, live numbers, no Unavailable.
// ---------------------------------------------------------------------------------------
const state = fixture({ canonical: [canonicalRow] });
const views = buildCampaignViews(state, OWNER);

assert.equal(views.length, 1, "The reactivation campaign must project exactly one row.");
const merged = views[0];
assert.equal(merged.name, "Expungement.ai reactivation (B1)", "The merged row carries the canonical name.");
assert.notEqual(merged.name, null, "The merged row must never fall back to 'Unnamed campaign'.");
assert.equal(merged.stableIdentity, `campaign:${CANONICAL_ID}`, "Identity stays canonical so existing links resolve.");
assert.equal(merged.exactSafeSourceLink, `#outreach/campaign/${CANONICAL_ID}`);

// Live audience from the singleton's contacts, not the canonical row's absent fields.
assert.equal(merged.audience.available, true, "Audience must be available — the singleton knows it.");
assert.equal(merged.audience.summary, "3762 enrolled recipients");
assert.equal(merged.audience.includedCount, 3762 - 3528);
assert.equal(merged.audience.excluded.count, 3528);

// Live status from the engine wins over the canonical row's stale "draft".
assert.equal(merged.status.key, "active", "Engine status wins over the canonical row's own status.");
assert.equal(merged.campaignType.key, "customer_reengagement");
assert.equal(merged.deliveryMode.key, "follow_up_sequence");
assert.equal(merged.source.collection, "reactivationCampaign", "Live source stays the engine singleton.");
assert.deepEqual(merged.canonicalSource, {
  collection: "campaigns", sourceKind: "campaign", sourceId: CANONICAL_ID, stableIdentity: `campaign:${CANONICAL_ID}`
});

// No field the singleton knows may still read as a placeholder.
for (const [label, value] of [
  ["audience.summary", merged.audience.summary],
  ["audience.includedCount", merged.audience.includedCount],
  ["audience.excluded.count", merged.audience.excluded.count],
  ["status.label", merged.status.label],
  ["name", merged.name]
]) {
  assert.ok(value !== null && value !== undefined && value !== "", `${label} must not be an Unavailable placeholder.`);
}

// Both identities still resolve to the one merged campaign.
assert.deepEqual(merged.identityAliases, [`campaign:${CANONICAL_ID}`, `reactivation:${ENGINE_ID}`]);
assert.equal(buildCampaignView(state, `campaign:${CANONICAL_ID}`, OWNER)?.name, "Expungement.ai reactivation (B1)");
assert.equal(buildCampaignView(state, `reactivation:${ENGINE_ID}`, OWNER)?.name, "Expungement.ai reactivation (B1)");

// ---------------------------------------------------------------------------------------
// 2. The Outreach list and the campaign detail view both show the merged truth.
// ---------------------------------------------------------------------------------------
const home = buildAuthorizedOutreachHome(state, OWNER, "2026-07-25T12:00:00.000Z", { view: "all" });
assert.equal(home.items.length, 1, "Outreach must list exactly one reactivation campaign.");
assert.equal(home.items[0].name, "Expungement.ai reactivation (B1)");
assert.equal(home.items[0].audience.available, true);
assert.equal(home.items[0].audience.includedCount, 3762 - 3528);
assert.equal(home.items[0].audience.excludedCount, 3528);
assert.equal(home.items[0].href, `#outreach/campaign/${CANONICAL_ID}`);

for (const identity of [`campaign:${CANONICAL_ID}`, CANONICAL_ID, `reactivation:${ENGINE_ID}`]) {
  const detail = buildCampaignDetailView(state, OWNER, identity, { tab: "audience" });
  assert.equal(detail.available, true, `Detail must resolve identity ${identity}.`);
  assert.equal(detail.campaign.name, "Expungement.ai reactivation (B1)");
  assert.equal(detail.audience.includedCount, 3762 - 3528);
}

// ---------------------------------------------------------------------------------------
// 3. The merge never guesses.
// ---------------------------------------------------------------------------------------
// 3a. Two customer-re-engagement rows, no link: merge nothing rather than pick one.
const ambiguous = fixture({ canonical: [canonicalRow, { id: "campaign-other", name: "Other re-engagement", campaignType: "customer_reengagement" }] });
assert.deepEqual(
  buildCampaignViews(ambiguous, OWNER).map((view) => view.stableIdentity).sort(),
  ["campaign:campaign-other", `campaign:${CANONICAL_ID}`, `reactivation:${ENGINE_ID}`].sort(),
  "Ambiguous candidates must not be merged."
);

// 3b. An explicit link decides even when the type fallback is ambiguous.
const linked = fixture({ canonical: [{ ...canonicalRow, campaign_id: ENGINE_ID }, { id: "campaign-other", campaignType: "customer_reengagement" }] });
const linkedViews = buildCampaignViews(linked, OWNER);
assert.equal(linkedViews.length, 2, "Only the linked row merges.");
assert.equal(linkedViews.find((view) => view.stableIdentity === `campaign:${CANONICAL_ID}`)?.audience.includedCount, 3762 - 3528);

// 3c. A singleton with its own name is not the "Unnamed campaign" problem — no type merge.
const namedSingleton = fixture({ canonical: [canonicalRow], singleton: { name: "Customer reactivation" } });
assert.equal(buildCampaignViews(namedSingleton, OWNER).length, 2, "A named singleton must not absorb an unlinked canonical row.");

// 3d. …but an explicit link still merges a named singleton.
const namedAndLinked = fixture({ canonical: [{ ...canonicalRow, engine: "reactivation" }], singleton: { name: "Customer reactivation" } });
assert.equal(buildCampaignViews(namedAndLinked, OWNER).length, 1, "An explicit engine link merges regardless of the singleton's name.");
assert.equal(buildCampaignViews(namedAndLinked, OWNER)[0].name, "Customer reactivation", "Engine values win where the singleton has them.");

// 3e. No canonical row at all: the singleton stands alone, exactly as before.
const noLabel = fixture({ canonical: [] });
const alone = buildCampaignViews(noLabel, OWNER);
assert.equal(alone.length, 1);
assert.equal(alone[0].stableIdentity, `reactivation:${ENGINE_ID}`);
assert.equal(alone[0].audience.includedCount, 3762 - 3528, "Audience is unaffected by the absence of a label.");

// 3f. No reactivation singleton at all: canonical rows are untouched.
const engineless = { ...fixture({ canonical: [canonicalRow] }), reactivationCampaign: {} };
assert.deepEqual(buildCampaignViews(engineless, OWNER).map((view) => view.stableIdentity), [`campaign:${CANONICAL_ID}`]);

// 3g. Partner-outreach campaigns are never absorbed.
const withPartner = {
  ...fixture({ canonical: [canonicalRow] }),
  outreachCampaigns: [{ id: "partner-01", name: "Partner sequence" }],
  outreachContacts: [], outreachSequenceSteps: [], outreachAttempts: [], outreachReplies: [],
  outreachSuppressions: [], outreachUnsubscribes: [], outreachBounces: [], approvalQueue: []
};
assert.deepEqual(
  buildCampaignViews(withPartner, OWNER).map((view) => view.stableIdentity).sort(),
  [`campaign:${CANONICAL_ID}`, "outreach:partner-01"].sort()
);

// ---------------------------------------------------------------------------------------
// 4. Purity and determinism.
// ---------------------------------------------------------------------------------------
const before = structuredClone(state);
buildCampaignViews(state, OWNER);
assert.deepEqual(state, before, "The merge must not mutate stored source collections.");
assert.deepEqual(buildCampaignViews(state, OWNER), views, "Equal input must produce equal output.");
assert.equal(canonicalLabelForReactivation([], null), null, "No engine, no label.");
assert.ok(Object.isFrozen(merged) && Object.isFrozen(merged.audience));

console.log("test-campaign-reactivation-dedupe: all checks passed");
