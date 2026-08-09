// RCAP Prospects saved view — compact read model (Wave 1, Packet 3).
//
// A projection over `buildRelationshipsView`, not a second list. Everything about
// authorization, availability, cross-account isolation, and the underlying identity
// deduplication is inherited from that projection; this module adds the RCAP vocabulary on
// top: the saved views, the six summary counts, one attention reason per row, and the honest
// empty/unavailable states.
//
// It reads. It never writes, and it exposes no send control -- the list has three row actions
// and none of them touches a provider.

import {
  RCAP_LIST_ROW_ACTIONS,
  RCAP_SAVED_VIEWS,
  normalizeRcapSavedView,
  rcapContactEligibility,
  rcapCount,
  rcapPrimaryAttention,
  rcapStageFromCanonical
} from "../../rcap-prospect-registries.mjs";
import { RCAP_PROSPECTS_CANONICAL_ROUTE, RCAP_PROSPECTS_VIEW_KEY } from "../rcap-crm-config.mjs";
import { buildRelationshipsView } from "../../relationship-service.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value = "") => String(value ?? "").trim();

// The RCAP prospect population is the existing "Potential partner" category. It is a filter
// over one list, never a separate store.
export const RCAP_PROSPECT_CATEGORY = "partner_prospect";

// Paging bound. The underlying projection caps a page at 100, so exact counts need paging.
// Twenty pages is far above any realistic prospect population; beyond it the counts are
// reported UNAVAILABLE rather than computed from a partial set, because a count computed over
// part of the data is a wrong number wearing a right number's clothes.
const MAX_PAGES = 20;
const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------------------------

function collectProspects(state, actor, now, options) {
  const pages = [];
  let offset = 0;
  let truncated = false;
  let first = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const view = buildRelationshipsView(
      state,
      actor,
      now,
      { category: RCAP_PROSPECT_CATEGORY, limit: PAGE_SIZE, offset },
      options
    );
    if (!first) first = view;
    if (!view.available) return { available: false, view, items: [], truncated: false };
    pages.push(...list(view.items));
    if (!view.pagination?.hasMore) {
      return { available: true, view: first, items: pages, truncated: false };
    }
    offset += PAGE_SIZE;
  }
  truncated = true;
  return { available: true, view: first, items: pages, truncated };
}

// ---------------------------------------------------------------------------------------------
// Attention
// ---------------------------------------------------------------------------------------------
//
// Every reason that applies is collected, then the registry picks the single most urgent one.
// The row shows exactly one.

function attentionReasonsFor(item) {
  const reasons = [];
  if (item.replyState?.key && /reply|replied|received/i.test(item.replyState.key)) reasons.push("reply_needs_response");
  if (item.eligibility?.key === "suppressed" || item.eligibility?.key === "ineligible") reasons.push("blocked");
  if (item.followUpDue) reasons.push("follow_up_due");
  if (!item.primaryContact || !item.email) reasons.push("contact_unverified");
  else if (rcapContactEligibility(item.contactEligibilityKey || "").sendable === false && item.contactEligibilityKey) {
    reasons.push("contact_unverified");
  }
  // Wave 1 stores no structured profile, so "not started" is the honest state for every
  // account. Wave 2 replaces this with the real profile status.
  if (!item.profileStatus || item.profileStatus === "not_started") reasons.push("profile_not_started");
  if (!clean(item.nextAction)) reasons.push("no_next_action");
  return reasons;
}

// ---------------------------------------------------------------------------------------------
// Account address
// ---------------------------------------------------------------------------------------------

// A Partner record already has a canonical object link the parser resolves. Anything else is
// addressed as state on the canonical workspace route.
export function rcapAccountHref(item = {}) {
  const partnerLink = clean(item.href);
  if (partnerLink.startsWith("#partners/partner/")) return partnerLink;
  const id = clean(item.id);
  if (!id) return `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}`;
  return `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}&account=${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------------------------
// Row projection
// ---------------------------------------------------------------------------------------------

function projectRow(item, options = {}) {
  const stage = rcapStageFromCanonical(item.stage?.key || item.stage?.label || "");
  const eligibility = item.eligibility?.key === "suppressed"
    ? rcapContactEligibility("suppressed")
    : item.email
      ? rcapContactEligibility("direct_public_business")
      : rcapContactEligibility("unavailable");
  const attention = rcapPrimaryAttention(attentionReasonsFor(item));

  return Object.freeze({
    id: item.id,
    name: item.name,
    organizationName: item.organization || item.name,
    programLabel: clean(item.campaign?.name) || "",
    geographyLabel: clean(item.geography || item.region || ""),
    stage: Object.freeze({ key: stage.key, label: stage.label, truth: stage.state }),
    priority: clean(item.strategicPriority?.label || item.priority || ""),
    primaryContact: Object.freeze({
      name: item.primaryContact || null,
      email: item.email || null,
      eligibilityKey: eligibility.key,
      eligibilityLabel: eligibility.label,
      sendable: eligibility.sendable
    }),
    lastTouch: item.lastOutboundAt || item.lastInboundAt || null,
    nextAction: clean(item.nextAction) || null,
    nextFollowUpAt: item.nextFollowUpAt || null,
    ownerLabel: clean(item.owner) || null,
    attention: Object.freeze({ key: attention.key, label: attention.label, tone: attention.tone }),
    // The row's destination.
    //
    // A relationship that is already a Partner record has a resolvable object link, and that
    // link is used unchanged. Everything else does NOT: relationship-service emits
    // `#partners/relationship/<id>` for non-partner entities, which the shared route parser
    // rejects as `malformed_route` -- a dead link, and most RCAP prospects are non-partner
    // entities by definition. Rather than change a shared surface another release owns, the
    // account is addressed as state on the canonical workspace route, which resolves today.
    // The underlying defect is recorded for a later packet.
    href: rcapAccountHref(item),
    // Wave 1 has no structured profile; saying "not started" is the truth, and it is not zero.
    profileStatus: "not_started",
    sourceTruth: Object.freeze({
      stage: stage.state,
      contact: item.email ? "known" : "unknown",
      profile: "unknown"
    }),
    rowActions: RCAP_LIST_ROW_ACTIONS
  });
}

// ---------------------------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------------------------
//
// Each view is a predicate over the projected rows -- one list, filtered, exactly as the
// Founder OS relationship views work.

const VIEW_PREDICATES = Object.freeze({
  all: () => true,
  needs_research: (row) => row.profileStatus === "not_started",
  needs_review: (row) => row.profileStatus === "needs_review",
  ready_to_contact: (row) => row.stage.key === "ready" && row.primaryContact.sendable,
  follow_up_due: (row) => Boolean(row.nextFollowUpAt) && row.attention.key === "follow_up_due",
  replies: (row) => row.attention.key === "reply_needs_response",
  blocked: (row) => row.attention.key === "blocked",
  active_conversations: (row) => ["conversation", "meeting"].includes(row.stage.key),
  proposals: (row) => row.stage.key === "proposal",
  partners: (row) => ["onboarding", "partner"].includes(row.stage.key),
  nurture: (row) => row.stage.key === "nurture"
});

export function rcapSavedViewPredicate(key = "") {
  return VIEW_PREDICATES[normalizeRcapSavedView(key)] || VIEW_PREDICATES.all;
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------

function applyFilters(rows, query = {}) {
  const stage = clean(query.stage);
  const owner = clean(query.owner).toLocaleLowerCase("en-US");
  const geography = clean(query.geography).toLocaleLowerCase("en-US");
  const attention = clean(query.attention);
  const priority = clean(query.priority).toLocaleLowerCase("en-US");
  const research = clean(query.research);

  return rows.filter((row) => {
    if (stage && row.stage.key !== stage) return false;
    if (owner && clean(row.ownerLabel).toLocaleLowerCase("en-US") !== owner) return false;
    if (geography && !clean(row.geographyLabel).toLocaleLowerCase("en-US").includes(geography)) return false;
    if (attention && row.attention.key !== attention) return false;
    if (priority && clean(row.priority).toLocaleLowerCase("en-US") !== priority) return false;
    if (research && row.profileStatus !== research) return false;
    return true;
  });
}

function optionCounts(rows, pick) {
  const counts = new Map();
  for (const row of rows) {
    const value = pick(row);
    if (!value?.key) continue;
    const existing = counts.get(value.key) || { key: value.key, label: value.label, count: 0 };
    existing.count += 1;
    counts.set(value.key, existing);
  }
  return Object.freeze([...counts.values()].sort((left, right) => left.label.localeCompare(right.label, "en-US")).map(Object.freeze));
}

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------

export function buildRcapProspectListView(state = {}, actor = {}, now = "", rawQuery = {}, options = {}) {
  const enabled = options.rcapCrmEnabled === true;

  // Flag off: the saved view does not exist. Nothing is deleted and nothing is rendered.
  if (!enabled) {
    return Object.freeze({
      available: false,
      enabled: false,
      availability: Object.freeze({ state: "feature_off", reason: "The RCAP prospect workspace is not enabled." }),
      view: normalizeRcapSavedView(rawQuery.view),
      items: Object.freeze([]),
      summary: Object.freeze({}),
      savedViews: Object.freeze([]),
      filters: Object.freeze({}),
      pagination: Object.freeze({ offset: 0, limit: 0, returned: 0, hasMore: false }),
      safety: Object.freeze({ mutations: 0, externalActions: 0, sendControls: 0 })
    });
  }

  const collected = collectProspects(state, actor, now, options);

  // The underlying projection could not read its sources. That is unavailable, not empty, and
  // it must never be rendered as a set of zeroes.
  if (!collected.available) {
    return Object.freeze({
      available: false,
      enabled: true,
      availability: collected.view?.availability || Object.freeze({ state: "unavailable", reason: null }),
      view: normalizeRcapSavedView(rawQuery.view),
      items: Object.freeze([]),
      summary: Object.freeze(Object.fromEntries(
        RCAP_SAVED_VIEWS.filter((entry) => entry.summaryStrip).map((entry) => [entry.key, rcapCount(null, "unavailable")])
      )),
      savedViews: Object.freeze([]),
      filters: Object.freeze({}),
      pagination: Object.freeze({ offset: 0, limit: 0, returned: 0, hasMore: false }),
      safety: Object.freeze({ mutations: 0, externalActions: 0, sendControls: 0 })
    });
  }

  const allRows = collected.items.map((item) => projectRow(item, options));
  const viewKey = normalizeRcapSavedView(rawQuery.view);
  const inView = allRows.filter(rcapSavedViewPredicate(viewKey));
  const filtered = applyFilters(inView, rawQuery);

  const offset = Number.isInteger(Number(rawQuery.offset)) && Number(rawQuery.offset) >= 0 ? Number(rawQuery.offset) : 0;
  const limit = Number.isInteger(Number(rawQuery.limit)) && Number(rawQuery.limit) > 0 ? Math.min(100, Number(rawQuery.limit)) : 50;
  const page = filtered.slice(offset, offset + limit);

  // Counts. If paging was truncated the totals would be computed over part of the population,
  // so they are reported unavailable instead of being quietly wrong.
  const countState = collected.truncated ? "unavailable" : "known";
  const countFor = (key) => rcapCount(allRows.filter(rcapSavedViewPredicate(key)).length, countState);

  const summary = Object.freeze(Object.fromEntries(
    RCAP_SAVED_VIEWS.filter((entry) => entry.summaryStrip).map((entry) => [entry.key, countFor(entry.key)])
  ));

  const savedViews = Object.freeze(RCAP_SAVED_VIEWS.map((entry) => Object.freeze({
    key: entry.key,
    label: entry.label,
    active: entry.key === viewKey,
    count: countFor(entry.key),
    href: `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}&savedView=${encodeURIComponent(entry.key)}`
  })));

  const availability = allRows.length === 0
    ? Object.freeze({ state: "empty", reason: "No RCAP prospects have been added yet." })
    : filtered.length === 0
      ? Object.freeze({ state: "filtered_empty", reason: "No prospects match the current filters." })
      : Object.freeze({ state: "ready", reason: null });

  return Object.freeze({
    available: true,
    enabled: true,
    availability,
    view: viewKey,
    items: Object.freeze(page),
    summary,
    savedViews,
    totals: Object.freeze({
      allProspects: rcapCount(allRows.length, countState),
      matching: rcapCount(filtered.length, countState),
      countsTruncated: collected.truncated
    }),
    filters: Object.freeze({
      stages: optionCounts(allRows, (row) => row.stage),
      attention: optionCounts(allRows, (row) => row.attention),
      owners: Object.freeze([...new Set(allRows.map((row) => row.ownerLabel).filter(Boolean))].sort()
        .map((label) => Object.freeze({ key: label.toLocaleLowerCase("en-US"), label, count: allRows.filter((row) => row.ownerLabel === label).length }))),
      geographies: Object.freeze([...new Set(allRows.map((row) => row.geographyLabel).filter(Boolean))].sort()
        .map((label) => Object.freeze({ key: label.toLocaleLowerCase("en-US"), label, count: allRows.filter((row) => row.geographyLabel === label).length })))
    }),
    pagination: Object.freeze({ offset, limit, returned: page.length, hasMore: offset + page.length < filtered.length }),
    // Asserted by the suite: this surface reads, and it offers no way to contact anyone.
    safety: Object.freeze({ mutations: 0, externalActions: 0, sendControls: 0, fullStateReturned: false })
  });
}
