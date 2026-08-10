// Wave 3, Packet 8 — the Activity workspace.
//
// The timeline's job is to be the authoritative record, which mostly means refusing to round
// anything up: prepared is not sent, an ambiguous provider outcome is not a delivery, an open
// task is not something that happened, and a missing date is not today. These tests are about
// those refusals, plus the ordinary mechanics of filters, pagination and cross-account safety.

import assert from "node:assert/strict";

import {
  RCAP_ACTIVITY_API_PATH,
  handleRcapActivityApiRequest,
  isRcapActivityApiPath
} from "./rcap-activity-api.mjs";
import {
  RCAP_ACTIVITY_ENDPOINT,
  RCAP_ACTIVITY_STYLESHEET_PATH,
  rcapActivityBrowserSource,
  rcapActivityLoadingHtml,
  rcapActivityWorkspaceHtml
} from "./ui/pages/rcap-activity.mjs";
import {
  RCAP_ACTIVITY_KINDS,
  RCAP_ACTIVITY_PAGE_SIZE,
  buildRcapProspectActivity,
  rcapGmailThreadHref
} from "./ui/view-models/rcap-prospect-activity.mjs";
import { VNEXT_LAZY_ASSET_CONTRACT, resolveVNextLazyRuntime } from "./ui/app-shell.mjs";
import { buildRelationshipsView } from "./relationship-service.mjs";
import { rcapProspectsBrowserSource } from "./ui/pages/rcap-prospects.mjs";

const checks = [];
function check(name, run) { run(); checks.push(name); }
const asyncChecks = [];
function checkAsync(name, run) { asyncChecks.push([name, run]); }

const NOW = "2026-08-10T12:00:00.000Z";
const OWNER = Object.freeze({ authenticated: true, id: "roger", role: "owner", label: "Roger" });
const VIEWER = Object.freeze({ authenticated: true, id: "sam", role: "viewer", label: "Sam" });
const ON = Object.freeze({ rcapCrmEnabled: true });
const daysAgo = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

function baseState(extra = {}) {
  return {
    outreachOrganizations: [
      { account_id: "acct-riverside", organization_name: "Synthetic Riverside Justice Center", domain: "riverside-justice.test", classification: "legal aid" },
      { account_id: "acct-prairie", organization_name: "Synthetic Prairie Legal Services", domain: "prairie-legal.test", classification: "legal aid" }
    ],
    outreachContacts: [
      { contact_id: "oc-dana", email: "dana.whitfield@riverside-justice.test", contact_name: "Dana Whitfield", organization_name: "Synthetic Riverside Justice Center", linked_account_id: "acct-riverside" },
      { contact_id: "oc-prairie", email: "intake@prairie-legal.test", contact_name: "Prairie Desk", organization_name: "Synthetic Prairie Legal Services", linked_account_id: "acct-prairie" }
    ],
    activityEvents: [
      { id: "e-sent", kind: "email_sent", direction: "outbound", occurredAt: daysAgo(3), title: "Intro email", email: "dana.whitfield@riverside-justice.test", outcomeState: "sent", threadId: "thread_abc123" },
      { id: "e-draft", kind: "email_drafted", direction: "outbound", occurredAt: daysAgo(4), title: "Draft prepared", email: "dana.whitfield@riverside-justice.test", outcomeState: "drafted" },
      { id: "e-unknown", kind: "email_sent", direction: "outbound", occurredAt: daysAgo(5), title: "Second attempt", email: "dana.whitfield@riverside-justice.test", outcomeState: "failed" },
      { id: "e-reply", kind: "email_received", direction: "inbound", occurredAt: daysAgo(2), title: "Dana replied", email: "dana.whitfield@riverside-justice.test", outcomeState: "received" },
      { id: "e-prairie", kind: "email_sent", direction: "outbound", occurredAt: daysAgo(1), title: "Prairie intro", email: "intake@prairie-legal.test", outcomeState: "sent" }
    ],
    tasks: [
      { id: "t-open", title: "Call Dana about the clinic schedule", dueDate: daysAgo(1), status: "open", owner: "Roger", email: "dana.whitfield@riverside-justice.test" },
      { id: "t-done", title: "Send the assisted-use overview", completedAt: daysAgo(6), status: "done", owner: "Roger", email: "dana.whitfield@riverside-justice.test" },
      { id: "t-undated", title: "Left a voicemail", status: "done", owner: "Roger", email: "dana.whitfield@riverside-justice.test" }
    ],
    notes: [
      { id: "n-1", body: "Met the coordinator at a conference.", createdAt: daysAgo(9), email: "dana.whitfield@riverside-justice.test", author: "Roger" }
    ],
    partners: [], companyOrganizations: [], companyContacts: [], companyEvents: [], emailDrafts: [],
    outreachMessages: [], outreachThreads: [], rcapRevenueAccounts: [], prospectCandidates: [],
    outreachSuppressions: [], outreachUnsubscribes: [], dataRoomItems: [], partnerProgramArtifacts: [],
    evidencePackNotes: [], reports: [], supportIssues: [],
    ...extra
  };
}

function idFor(state, fragment) {
  const view = buildRelationshipsView(state, OWNER, NOW, { category: "partner_prospect", limit: 100 }, {});
  const item = view.items.find((row) => (row.organization || row.name || "").includes(fragment));
  assert.ok(item, `${fragment} must project.`);
  return item.id;
}

const state = baseState();
const RIVERSIDE = idFor(state, "Riverside");
const PRAIRIE = idFor(state, "Prairie");
const activity = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, ON);
const html = rcapActivityWorkspaceHtml(activity);

const titles = (view) => view.entries.map((entry) => entry.title);
const byTitle = (view, title) => view.entries.find((entry) => entry.title === title);

// ---------------------------------------------------------------------------------------------
// Truth states
// ---------------------------------------------------------------------------------------------

check("prepared is not sent, and an ambiguous outcome is not a delivery", () => {
  assert.equal(byTitle(activity, "Draft prepared").outcome.label, "Prepared");
  assert.equal(byTitle(activity, "Intro email").outcome.label, "Sent");
  assert.equal(byTitle(activity, "Second attempt").outcome.label, "Outcome unknown",
    "A provider failure is an unknown outcome, not a silent success and not a delivery.");
  assert.equal(byTitle(activity, "Dana replied").outcome.label, "Replied");
});

check("an open task is reported as still open, not as something that happened", () => {
  const open = byTitle(activity, "Call Dana about the clinic schedule");
  assert.equal(open.outcome.label, "Still open");
  assert.equal(byTitle(activity, "Send the assisted-use overview").outcome.label, "Completed");
});

check("a task that is a call is filed as a call", () => {
  assert.equal(byTitle(activity, "Call Dana about the clinic schedule").kind, "call");
  assert.equal(byTitle(activity, "Send the assisted-use overview").kind, "task");
});

check("a missing date is reported as missing, never as today", () => {
  const undated = byTitle(activity, "Left a voicemail");
  assert.equal(undated.dateKnown, false);
  assert.equal(undated.dateLabel, "");
  // ...and it sorts last rather than being dropped from the record.
  assert.equal(titles(activity).at(-1), "Left a voicemail");
});

check("entries are newest first", () => {
  const dated = activity.entries.filter((entry) => entry.dateKnown).map((entry) => entry.occurredAt);
  assert.deepEqual(dated, [...dated].sort().reverse());
});

// ---------------------------------------------------------------------------------------------
// Gmail links
// ---------------------------------------------------------------------------------------------

check("a Gmail link exists only when a thread id was recorded", () => {
  assert.equal(byTitle(activity, "Intro email").linked, true);
  assert.ok(byTitle(activity, "Intro email").href.includes("thread_abc123"));
  assert.equal(byTitle(activity, "Draft prepared").linked, false,
    "A message with no recorded thread id must not be linked to a guessed one.");
  assert.equal(rcapGmailThreadHref({ threadId: "no" }), "", "A thread id that is not one must not become a link.");
  assert.equal(rcapGmailThreadHref({}), "");
});

// ---------------------------------------------------------------------------------------------
// Filters and pagination
// ---------------------------------------------------------------------------------------------

check("filter counts are over everything, not over the page in front of you", () => {
  const counts = new Map(activity.filters.kinds.map((entry) => [entry.key, entry.count]));
  assert.equal(counts.get("message"), 4);
  assert.equal(counts.get("task"), 2);
  assert.equal(counts.get("call"), 1);
  // The relationship projection does not surface this fixture's note shape, and the workspace
  // reports what actually projected rather than a number it wishes were true.
  assert.equal(counts.get("note"), 0);
  assert.equal([...counts.values()].reduce((total, value) => total + value, 0), activity.pagination.totalUnfiltered);
});

check("a kind filter narrows the stream and says so", () => {
  const messages = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { kind: "message" } });
  assert.ok(messages.entries.length > 0);
  assert.ok(messages.entries.every((entry) => entry.kind === "message"));
  assert.equal(messages.filters.kind, "message");
  assert.equal(messages.pagination.total, 4);
  assert.equal(messages.pagination.totalUnfiltered, 7, "The unfiltered total must not move when a filter is applied.");
});

check("a direction filter separates what we sent from what they sent", () => {
  const inbound = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { direction: "inbound" } });
  assert.deepEqual(titles(inbound), ["Dana replied"]);
  const internal = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { direction: "internal" } });
  assert.ok(internal.entries.every((entry) => ["note", "task", "call", "file", "meeting", "stage"].includes(entry.kind)));
});

check("an unknown filter value is ignored rather than emptying the page", () => {
  const nonsense = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { kind: "telepathy" } });
  assert.equal(nonsense.filters.kind, "");
  assert.equal(nonsense.entries.length, activity.entries.length);
});

check("pagination is bounded and its links carry the filter", () => {
  const paged = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { limit: 3, kind: "message" } });
  assert.equal(paged.entries.length, 3);
  assert.equal(paged.pagination.hasMore, true);
  assert.ok(paged.pagination.nextHref.includes("kind=message"), "Turning the page must keep the filter.");
  assert.equal(paged.pagination.previousHref, null);

  const second = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { limit: 3, offset: 3, kind: "message" } });
  assert.equal(second.pagination.previousHref !== null, true);
  assert.equal(second.entries.length, 1);

  const huge = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { limit: 5000 } });
  assert.ok(huge.pagination.limit <= 100, "A caller must not be able to ask for the whole table.");
  assert.equal(buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, ON).pagination.limit, RCAP_ACTIVITY_PAGE_SIZE);
});

check("three different silences are told apart", () => {
  const empty = buildRcapProspectActivity(baseState({ activityEvents: [], tasks: [], notes: [] }), OWNER, RIVERSIDE, NOW, ON);
  assert.equal(empty.emptyState.state, "no_history");
  assert.ok(empty.emptyState.reason.includes("Nothing has been recorded"));

  const filteredOut = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { kind: "meeting" } });
  assert.equal(filteredOut.emptyState.state, "filtered_out");

  const pastEnd = buildRcapProspectActivity(state, OWNER, RIVERSIDE, NOW, { ...ON, query: { offset: 500 } });
  assert.equal(pastEnd.emptyState.state, "past_the_end");
});

// ---------------------------------------------------------------------------------------------
// Cross-account safety
// ---------------------------------------------------------------------------------------------

check("one organization's history never appears on another's timeline", () => {
  const prairie = buildRcapProspectActivity(state, OWNER, PRAIRIE, NOW, ON);
  assert.ok(titles(prairie).includes("Prairie intro"));
  for (const title of ["Intro email", "Dana replied", "Call Dana about the clinic schedule"]) {
    assert.ok(!titles(prairie).includes(title), `${title} belongs to Riverside and must not reach Prairie.`);
  }
  assert.ok(!titles(activity).includes("Prairie intro"));
});

check("nothing on this page can act", () => {
  assert.equal(activity.safety.mutations, 0);
  assert.equal(activity.safety.externalActions, 0);
  assert.equal(activity.safety.sendControls, 0);
});

// ---------------------------------------------------------------------------------------------
// The rendered page
// ---------------------------------------------------------------------------------------------

check("the page renders the stream, the filters and the truth states", () => {
  assert.ok(html.includes('data-rcap-activity-state="ready"'));
  assert.ok(html.includes("Intro email"));
  // The upstream key for an ambiguous provider result is "failed"; only its LABEL says outcome
  // unknown. Both are asserted so a future relabelling cannot quietly turn it into a success.
  assert.ok(html.includes('data-rcap-outcome="failed"'), "An ambiguous outcome must be addressable in the markup.");
  assert.ok(html.includes("Outcome unknown"));
  assert.ok(/data-rcap-outcome="failed"[\s\S]{0,600}?rcap-pill is-warn/.test(html),
    "An ambiguous outcome must render in the cautious register, not the neutral one.");
  assert.ok(html.includes("Open the thread in Gmail"));
  for (const kind of RCAP_ACTIVITY_KINDS) assert.ok(html.includes(kind.label), `The ${kind.label} filter must render.`);
});

check("an entry with no date says so on the page", () => {
  assert.ok(html.includes("No date recorded"), "An entry with no recorded date must say so where its date would go.");
});

check("no send control exists anywhere on the page", () => {
  const controlLabels = [...html.matchAll(/<(?:button|a)\b[^>]*>([^<]*)</g)].map((match) => match[1].trim());
  for (const label of controlLabels) {
    assert.ok(!/^(send|schedule|reply|forward)\b/i.test(label), `"${label}" reads as a send control.`);
  }
  assert.ok(!html.includes("mailto:"));
  assert.equal(html.match(/<form/), null, "A read-only surface has no forms.");
});

check("the empty and unavailable states render as states, not failures", () => {
  const empty = rcapActivityWorkspaceHtml(buildRcapProspectActivity(baseState({ activityEvents: [], tasks: [], notes: [] }), OWNER, RIVERSIDE, NOW, ON));
  assert.ok(empty.includes('data-rcap-activity-empty="no_history"'));
  assert.ok(empty.includes("Nothing recorded yet"));
  const off = rcapActivityWorkspaceHtml({ available: false, availability: { state: "feature_off", reason: "The RCAP prospect workspace is not enabled." } });
  assert.ok(off.includes('data-rcap-activity-state="feature_off"'));
  assert.ok(rcapActivityLoadingHtml().includes('data-rcap-activity-state="loading"'));
});

check("recorded content is escaped on its way onto the page", () => {
  // Escaping belongs to the renderer, so it is tested there directly: the relationship projection
  // sanitises some fields upstream, and a test that relies on hostile text surviving that far is
  // testing the projection rather than the escape.
  const payload = '<img src=x onerror="alert(1)">';
  const rendered = rcapActivityWorkspaceHtml({
    available: true,
    account: { id: "a", name: payload, overviewHref: "#o" },
    pagination: { totalUnfiltered: 1, total: 1, offset: 0, limit: 25 },
    filters: { kind: "", direction: "", kinds: [], directions: [], clearHref: "#c" },
    entries: [{
      id: "x", kind: "note", kindLabel: "Note", direction: "internal", directionLabel: "Internal",
      title: payload, summary: payload, occurredAt: "2026-01-01", dateLabel: "Jan 1, 2026",
      dateKnown: true, outcome: null, href: "", linked: false, actor: payload
    }],
    emptyState: null
  });
  assert.ok(rendered.includes("&lt;img src=x"), "The payload must appear, escaped.");
  assert.ok(!rendered.includes("<img src=x"), "Titles, summaries, actors and the account name must all be escaped.");
});

// ---------------------------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------------------------

check("the runtime is registered, gated, bounded, and knows only its own address", () => {
  assert.ok(VNEXT_LAZY_ASSET_CONTRACT.runtimeIds.includes("rcap-activity"));
  assert.ok(VNEXT_LAZY_ASSET_CONTRACT.stylesheetPaths.includes(RCAP_ACTIVITY_STYLESHEET_PATH));
  assert.equal(resolveVNextLazyRuntime("/assets/ui/runtime/rcap-activity.js", { rcapCrm: false }), null);
  assert.ok(resolveVNextLazyRuntime("/assets/ui/runtime/rcap-activity.js", { rcapCrm: true }));

  const source = rcapActivityBrowserSource();
  assert.doesNotThrow(() => new Function(source));
  assert.ok(Buffer.byteLength(source, "utf8") <= VNEXT_LAZY_ASSET_CONTRACT.runtimeMaxBytes);
  const apiLiterals = [...new Set(source.match(/\/api\/[A-Za-z0-9/_-]+/g) || [])];
  assert.deepEqual(apiLiterals, [RCAP_ACTIVITY_ENDPOINT]);
  const absolute = [...new Set(source.match(/https?:\/\/[^"'`\s)]+/g) || [])];
  assert.deepEqual(absolute, [], `The runtime must know no absolute address; it has ${absolute.join(", ")}.`);
  assert.equal(source.includes("method:\"POST\""), false, "A read-only runtime must not contain a write.");
  assert.ok(source.includes('query.get("pane")==="activity"'), "The runtime must own only the activity pane.");
});

check("the list runtime stands down on the activity pane", () => {
  // Two runtimes match the same route. Without this guard both render into the Partners section.
  assert.ok(
    rcapProspectsBrowserSource().includes('hashQuery().get("pane")!=="activity"'),
    "The list runtime must stand down when the activity pane owns the page."
  );
});

// ---------------------------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------------------------

const request = (overrides = {}) => handleRcapActivityApiRequest({
  enabled: true, method: "GET", pathname: RCAP_ACTIVITY_API_PATH,
  searchParams: new URLSearchParams(`account=${RIVERSIDE}`),
  store: { readCollections: async () => state }, actor: OWNER, now: NOW, ...overrides
});

check("the path is what the runtime expects", () => {
  assert.ok(isRcapActivityApiPath(RCAP_ACTIVITY_API_PATH));
  assert.ok(!isRcapActivityApiPath("/api/ui/rcap-activities"));
  assert.equal(RCAP_ACTIVITY_ENDPOINT, RCAP_ACTIVITY_API_PATH);
});

checkAsync("the endpoint is read-only and refuses the unauthorized", async () => {
  assert.equal((await request({ method: "POST" })).status, 405);
  assert.equal((await request({ method: "DELETE" })).status, 405);
  assert.equal((await request({ actor: { authenticated: false } })).status, 403);
  assert.equal((await request({ actor: VIEWER })).status, 403, "A viewer cannot read RCAP activity.");
  const off = await request({ enabled: false });
  assert.equal(off.body.activity.availability.state, "feature_off");
});

checkAsync("an unreadable store is 503, never an empty timeline", async () => {
  const result = await request({ store: { readCollections: async () => { throw new Error("down"); } } });
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
});

checkAsync("a hostile account id is refused, and a real one is not", async () => {
  assert.equal((await request({ searchParams: new URLSearchParams("account=../../etc/passwd") })).status, 400);
  assert.equal((await request({ searchParams: new URLSearchParams("") })).status, 400);
  const good = await request();
  assert.equal(good.status, 200);
  assert.equal(good.body.activity.available, true, "A projected relationship id must survive the guard.");
});

checkAsync("the endpoint passes the filter and page through", async () => {
  const result = await request({ searchParams: new URLSearchParams(`account=${RIVERSIDE}&kind=message&limit=2`) });
  assert.equal(result.body.activity.filters.kind, "message");
  assert.equal(result.body.activity.entries.length, 2);
});

// ---------------------------------------------------------------------------------------------

for (const [name, run] of asyncChecks) {
  await run();
  checks.push(name);
}

console.log(`RCAP Wave 3 Packet 8 activity verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
