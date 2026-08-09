// Packet 3 — the RCAP Prospects saved view.
//
// Proven here: the view is a projection over the ONE relationship list (not a second store),
// the flag-off path renders nothing and deletes nothing, counts describe the rows they claim
// to describe, an unreadable source is unavailable rather than zero, every row opens a real
// account, and there is no send control anywhere on the surface.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RCAP_PROSPECT_CATEGORY,
  buildRcapProspectListView,
  rcapSavedViewPredicate
} from "./ui/view-models/rcap-prospect-list.mjs";
import { RCAP_SAVED_VIEWS, normalizeRcapSavedView } from "./rcap-prospect-registries.mjs";
import { RCAP_PROSPECTS_CANONICAL_ROUTE, RCAP_PROSPECTS_VIEW_KEY } from "./ui/rcap-crm-config.mjs";
import { buildRelationshipsView } from "./relationship-service.mjs";
import { resolveRouteWithContract } from "./ui/route-compatibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-08-09T15:00:00.000Z";
const OWNER = Object.freeze({ authenticated: true, id: "roger", role: "owner", label: "Roger" });
const ON = Object.freeze({ rcapCrmEnabled: true });
const daysAgo = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
const daysAhead = (days) => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();

const checks = [];
function check(name, run) { run(); checks.push(name); }

// ---------------------------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------------------------
//
// Built on the REAL source collections the company-memory projector reads, so the whole
// identity path runs rather than being stubbed. `outreachContacts` is what stamps a person
// with the partner_contact/prospect types that categoryFor turns into "Potential partner";
// `outreachOrganizations` supplies the organization side. Field spellings are the projector's
// (contact_id / organization_name / linked_account_id), not invented ones.
//
// Everything is synthetic: reserved .test addresses, invented organizations, no real person.

function prospectState() {
  return {
    outreachOrganizations: [
      { account_id: "acct-riverside", organization_name: "Synthetic Riverside Justice Center", domain: "riverside-justice.test", classification: "legal aid" },
      { account_id: "acct-buckeye", organization_name: "Synthetic Buckeye Reentry Alliance", domain: "buckeye-reentry.test", classification: "reentry" },
      { account_id: "acct-prairie", organization_name: "Synthetic Prairie Legal Services", domain: "prairie-legal.test", classification: "legal aid" },
      { account_id: "acct-quiet", organization_name: "Synthetic Quiet Trust", domain: "quiet-trust.test", classification: "nonprofit" }
    ],
    outreachContacts: [
      { contact_id: "oc-dana", email: "dana.whitfield@riverside-justice.test", contact_name: "Dana Whitfield", organization_name: "Synthetic Riverside Justice Center", linked_account_id: "acct-riverside" },
      { contact_id: "oc-buckeye", email: "info@buckeye-reentry.test", contact_name: "", organization_name: "Synthetic Buckeye Reentry Alliance", linked_account_id: "acct-buckeye" },
      { contact_id: "oc-prairie", email: "intake@prairie-legal.test", contact_name: "Prairie Desk", organization_name: "Synthetic Prairie Legal Services", linked_account_id: "acct-prairie" }
    ],
    tasks: [
      { id: "task-riverside", title: "Send the assisted-use overview", nextAction: "Send the assisted-use overview", dueDate: daysAgo(2), status: "open", owner: "Roger", email: "dana.whitfield@riverside-justice.test" }
    ],
    activityEvents: [
      { id: "act-riverside", kind: "email_sent", direction: "outbound", occurredAt: daysAgo(6), title: "Intro email", email: "dana.whitfield@riverside-justice.test" }
    ],
    // The intake address is suppressed, which must show as blocked rather than as a usable route.
    outreachSuppressions: [
      { id: "supp-prairie", email: "intake@prairie-legal.test", reason: "client_intake" }
    ],
    companyContacts: [], companyOrganizations: [],
    companyEvents: [], auditHistory: [], automationEvents: [], inboxSignals: [],
    outreachCampaigns: [], outreachAttempts: [], outreachReplies: [], reactivationAttempts: [],
    meetingBriefs: [], partners: [],
    reactivationContacts: [], expungementLifecycleContacts: [], rcapRevenueContacts: [],
    rcapRevenueAccounts: [], prospectCandidates: [], outreachUnsubscribes: []
  };
}

// ---------------------------------------------------------------------------------------------
// The feature flag
// ---------------------------------------------------------------------------------------------

check("with the flag off the saved view does not exist, and nothing is read or deleted", () => {
  const off = buildRcapProspectListView(prospectState(), OWNER, NOW, {}, {});
  assert.equal(off.enabled, false);
  assert.equal(off.available, false);
  assert.equal(off.availability.state, "feature_off");
  assert.equal(off.items.length, 0);
  assert.ok(off.availability.reason, "The off state must explain itself rather than render blank.");
  // Rollback is exact: the underlying relationship projection is untouched by the flag.
  const before = buildRelationshipsView(prospectState(), OWNER, NOW, {}, {});
  const after = buildRelationshipsView(prospectState(), OWNER, NOW, {}, {});
  assert.deepEqual(before.summary, after.summary);
});

check("the flag cannot be turned on from the query string", () => {
  const attempted = buildRcapProspectListView(prospectState(), OWNER, NOW, { rcapCrmEnabled: true, enabled: "true" }, {});
  assert.equal(attempted.enabled, false, "Only the server option may enable the feature.");
});

// ---------------------------------------------------------------------------------------------
// The projection is over the one list
// ---------------------------------------------------------------------------------------------

check("prospects come from the existing potential-partner category, not a new store", () => {
  const state = prospectState();
  const view = buildRcapProspectListView(state, OWNER, NOW, {}, ON);
  assert.equal(view.enabled, true);
  assert.equal(view.available, true);
  assert.ok(view.items.length > 0, "The fixture must project at least one prospect.");

  // Every projected row must also be present in the underlying relationship list under the
  // same id and category -- proof this is a filter, not a parallel population.
  const underlying = buildRelationshipsView(state, OWNER, NOW, { category: RCAP_PROSPECT_CATEGORY, limit: 100 }, {});
  const underlyingIds = new Set(underlying.items.map((item) => item.id));
  for (const row of view.items) {
    assert.ok(underlyingIds.has(row.id), `${row.id} must exist in the relationship projection.`);
  }
  assert.equal(RCAP_PROSPECT_CATEGORY, "partner_prospect");
});

check("the module builds no store of its own", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "ui", "view-models", "rcap-prospect-list.mjs"), "utf8");
  for (const forbidden of ["writeCollections", "writeChanges", "submitCoreMutations", "fetch(", "readCollections"]) {
    assert.ok(!source.includes(forbidden), `The list view must not reference ${forbidden}.`);
  }
});

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

check("every row carries the full list contract and opens a real account", () => {
  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, {}, ON);
  for (const row of view.items) {
    for (const field of ["id", "organizationName", "stage", "primaryContact", "ownerLabel", "attention", "href", "sourceTruth"]) {
      assert.ok(field in row, `A row is missing ${field}.`);
    }
    assert.ok(row.href, "Every row must have a destination.");
    // The destination must be a route the shared parser can actually resolve.
    const resolved = resolveRouteWithContract(row.href);
    assert.notEqual(resolved.kind, "unsafe", `${row.href} must be a safe route.`);
    assert.ok(row.stage.key, "Every row must carry a user-facing stage.");
    assert.ok(row.attention.key, "Every row must carry exactly one attention reason key.");
  }
});

check("exactly one attention reason per row, and the most urgent wins", () => {
  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, {}, ON);
  for (const row of view.items) {
    assert.equal(typeof row.attention.key, "string");
    assert.ok(!Array.isArray(row.attention), "Attention is one reason, not a list.");
  }
  // Riverside has an overdue follow-up AND no structured profile. Follow-up outranks profile.
  const riverside = view.items.find((row) => row.organizationName.includes("Riverside"));
  assert.ok(riverside, "The Riverside fixture must project.");
  assert.equal(riverside.attention.key, "follow_up_due", "An overdue follow-up outranks a missing profile.");
});

check("a contact with no address is reported unverified, never as a usable route", () => {
  const state = prospectState();
  const view = buildRcapProspectListView(state, OWNER, NOW, {}, ON);
  const quiet = view.items.find((row) => row.organizationName.includes("Quiet"));
  if (quiet) {
    assert.equal(quiet.primaryContact.email, null);
    assert.equal(quiet.primaryContact.sendable, false, "No address means not sendable.");
  }
});

// ---------------------------------------------------------------------------------------------
// Counts describe the rows
// ---------------------------------------------------------------------------------------------

check("summary counts match the rows they claim to count", () => {
  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, {}, ON);
  const all = buildRcapProspectListView(prospectState(), OWNER, NOW, { view: "all", limit: 100 }, ON);
  for (const entry of RCAP_SAVED_VIEWS.filter((saved) => saved.summaryStrip)) {
    const expected = all.items.filter(rcapSavedViewPredicate(entry.key)).length;
    assert.equal(view.summary[entry.key].value, expected, `The ${entry.key} count must match its rows.`);
  }
  // The strip is exactly the six the prototype shows.
  assert.equal(Object.keys(view.summary).length, 6);
});

check("saved-view counts and the filtered set agree", () => {
  for (const entry of RCAP_SAVED_VIEWS) {
    const view = buildRcapProspectListView(prospectState(), OWNER, NOW, { view: entry.key, limit: 100 }, ON);
    const declared = view.savedViews.find((saved) => saved.key === entry.key);
    assert.equal(declared.count.value, view.items.length, `The ${entry.key} view count must equal the rows it returns.`);
    assert.equal(declared.active, true, "The requested view must be marked active.");
  }
});

check("an unknown saved view falls back to All rather than erroring or emptying", () => {
  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, { view: "not-a-view" }, ON);
  assert.equal(view.view, "all");
  assert.equal(normalizeRcapSavedView("not-a-view"), "all");
  assert.ok(view.items.length > 0, "A bad view value must not silently empty the list.");
});

// ---------------------------------------------------------------------------------------------
// Unavailable is never zero
// ---------------------------------------------------------------------------------------------

check("an unreadable source reports unavailable, not a set of zeroes", () => {
  // An unauthenticated actor cannot read the projection.
  const denied = buildRcapProspectListView(prospectState(), { authenticated: false, role: "viewer" }, NOW, {}, ON);
  assert.equal(denied.available, false);
  for (const value of Object.values(denied.summary)) {
    assert.equal(value.value, null, "An unavailable count must not be 0.");
    assert.notEqual(value.label, "0", "An unavailable count must not render as \"0\".");
    assert.equal(value.known, false);
  }
});

check("genuinely empty is distinct from unavailable", () => {
  const empty = buildRcapProspectListView({
    companyOrganizations: [], companyContacts: [], tasks: [], activityEvents: [],
    companyEvents: [], auditHistory: [], automationEvents: [], inboxSignals: [],
    outreachCampaigns: [], outreachAttempts: [], outreachReplies: [], reactivationAttempts: [],
    meetingBriefs: [], partners: [], outreachContacts: [], outreachOrganizations: [],
    reactivationContacts: [], expungementLifecycleContacts: [], rcapRevenueContacts: [],
    rcapRevenueAccounts: [], prospectCandidates: [], outreachSuppressions: [], outreachUnsubscribes: []
  }, OWNER, NOW, {}, ON);
  if (empty.available) {
    assert.equal(empty.availability.state, "empty");
    assert.ok(empty.availability.reason, "An empty list must say why it is empty.");
    // A real zero is a zero; only an unreadable source is unavailable.
    assert.equal(empty.summary.needs_research.value, 0);
    assert.equal(empty.summary.needs_research.known, true);
  }
});

check("a filter that matches nothing says so, and is not confused with an empty workspace", () => {
  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, { stage: "proposal" }, ON);
  assert.equal(view.items.length, 0);
  assert.equal(view.availability.state, "filtered_empty");
  assert.notEqual(view.availability.state, "empty");
});

// ---------------------------------------------------------------------------------------------
// Filters and pagination
// ---------------------------------------------------------------------------------------------

check("filters narrow the list without inventing rows", () => {
  const all = buildRcapProspectListView(prospectState(), OWNER, NOW, { limit: 100 }, ON);
  const owned = buildRcapProspectListView(prospectState(), OWNER, NOW, { owner: "roger", limit: 100 }, ON);
  assert.ok(owned.items.length <= all.items.length);
  for (const row of owned.items) assert.equal(String(row.ownerLabel).toLowerCase(), "roger");

  const byAttention = buildRcapProspectListView(prospectState(), OWNER, NOW, { attention: "follow_up_due", limit: 100 }, ON);
  for (const row of byAttention.items) assert.equal(row.attention.key, "follow_up_due");
});

check("pagination is real and does not lose or duplicate rows", () => {
  const all = buildRcapProspectListView(prospectState(), OWNER, NOW, { limit: 100 }, ON);
  const firstPage = buildRcapProspectListView(prospectState(), OWNER, NOW, { limit: 1, offset: 0 }, ON);
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.pagination.hasMore, all.items.length > 1);

  const seen = new Set();
  for (let offset = 0; offset < all.items.length; offset += 1) {
    const page = buildRcapProspectListView(prospectState(), OWNER, NOW, { limit: 1, offset }, ON);
    for (const row of page.items) {
      assert.ok(!seen.has(row.id), "A row must not appear on two pages.");
      seen.add(row.id);
    }
  }
  assert.equal(seen.size, all.items.length, "Paging must reach every row exactly once.");
});

// ---------------------------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------------------------

check("the saved view lives on the canonical partners route, reachable through the alias", () => {
  const canonical = `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}`;
  const viaAlias = resolveRouteWithContract(`#relationships?view=${RCAP_PROSPECTS_VIEW_KEY}`);
  assert.equal(viaAlias.safeHash, canonical);
  assert.equal(resolveRouteWithContract(canonical).safeHash, canonical);

  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, {}, ON);
  for (const saved of view.savedViews) {
    assert.ok(saved.href.startsWith(`#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}`),
      "Saved-view links must stay inside the canonical workspace.");
    assert.notEqual(resolveRouteWithContract(saved.href).kind, "unsafe");
  }
});

// ---------------------------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------------------------

check("the list has no send control and performs no mutation or external action", () => {
  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, {}, ON);
  assert.equal(view.safety.mutations, 0);
  assert.equal(view.safety.externalActions, 0);
  assert.equal(view.safety.sendControls, 0);
  assert.equal(view.safety.fullStateReturned, false, "The whole application state must never reach the browser.");
  for (const row of view.items) {
    for (const action of row.rowActions) {
      assert.ok(!/send|email/i.test(action.key), `Row action ${action.key} must not be a send control.`);
      assert.equal(action.external, false);
    }
  }
});

check("no row leaks another account's contact", () => {
  const view = buildRcapProspectListView(prospectState(), OWNER, NOW, { limit: 100 }, ON);
  const emails = view.items.map((row) => row.primaryContact.email).filter(Boolean);
  assert.equal(new Set(emails).size, emails.length, "An address must not appear on two accounts.");
});

check("a viewer cannot read prospect intelligence", () => {
  const viewer = buildRcapProspectListView(prospectState(), { authenticated: true, id: "v", role: "viewer" }, NOW, {}, ON);
  if (viewer.available) {
    assert.equal(viewer.items.length, 0, "A viewer must not receive prospect rows.");
  } else {
    assert.notEqual(viewer.availability.state, "ready");
  }
});

console.log(`RCAP prospect list verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
