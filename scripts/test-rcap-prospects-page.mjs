// Wave 1B — the rendered RCAP surfaces.
//
// The renderers are pure functions of a payload, so most of what matters can be proven without
// a browser: that an absence never renders as a zero, that no send control exists, that a
// control which cannot act is inert AND explains itself, that a blocker carries its whole
// anatomy, and that one account's facts never appear on another's page. The browser suite
// proves the parts that need a real DOM.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import {
  RCAP_PROSPECTS_ENDPOINT,
  RCAP_PROSPECTS_STYLESHEET_PATH,
  rcapProspectOverviewHtml,
  rcapProspectsBrowserSource,
  rcapProspectsListHtml,
  rcapProspectsLoadingHtml
} from "./ui/pages/rcap-prospects.mjs";
import {
  RCAP_PROSPECTS_READ_COLLECTIONS,
  handleRcapProspectsApiRequest,
  isRcapProspectsApiPath
} from "./rcap-prospects-api.mjs";
import { VNEXT_LAZY_ASSET_CONTRACT, resolveVNextLazyRuntime } from "./ui/app-shell.mjs";
import { buildRcapProspectListView } from "./ui/view-models/rcap-prospect-list.mjs";
import { buildRcapProspectOverview } from "./ui/view-models/rcap-prospect-overview.mjs";
import { buildRelationshipsView } from "./relationship-service.mjs";
import { coreStateCollections } from "./storage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-08-09T15:00:00.000Z";
const OWNER = Object.freeze({ authenticated: true, id: "roger", role: "owner", label: "Roger" });
const ON = Object.freeze({ rcapCrmEnabled: true });
const daysAgo = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

const checks = [];
function check(name, run) { run(); checks.push(name); }

// ---------------------------------------------------------------------------------------------
// Fixtures — two organizations: one healthy, one blocked by an intake-only address.
// ---------------------------------------------------------------------------------------------

function fixtureState() {
  return {
    outreachOrganizations: [
      { account_id: "acct-riverside", organization_name: "Synthetic Riverside Justice Center", domain: "riverside-justice.test", classification: "legal aid" },
      { account_id: "acct-prairie", organization_name: "Synthetic Prairie Legal Services", domain: "prairie-legal.test", classification: "legal aid" }
    ],
    outreachContacts: [
      { contact_id: "oc-dana", email: "dana.whitfield@riverside-justice.test", contact_name: "Dana Whitfield", organization_name: "Synthetic Riverside Justice Center", linked_account_id: "acct-riverside" },
      { contact_id: "oc-prairie", email: "intake@prairie-legal.test", contact_name: "Prairie Desk", organization_name: "Synthetic Prairie Legal Services", linked_account_id: "acct-prairie" }
    ],
    tasks: [
      { id: "task-riverside", title: "Send the assisted-use overview", nextAction: "Send the assisted-use overview", dueDate: daysAgo(2), status: "open", owner: "Roger", email: "dana.whitfield@riverside-justice.test" }
    ],
    activityEvents: [
      { id: "act-1", kind: "email_sent", direction: "outbound", occurredAt: daysAgo(6), title: "Intro email", email: "dana.whitfield@riverside-justice.test", outcomeState: "sent" },
      { id: "act-2", kind: "email_drafted", direction: "outbound", occurredAt: daysAgo(7), title: "Draft prepared", email: "dana.whitfield@riverside-justice.test", outcomeState: "drafted" }
    ],
    companyContacts: [], companyOrganizations: [], companyEvents: [], auditHistory: [],
    automationEvents: [], inboxSignals: [], outreachCampaigns: [], outreachAttempts: [],
    outreachReplies: [], reactivationAttempts: [], meetingBriefs: [], partners: [],
    reactivationContacts: [], expungementLifecycleContacts: [], rcapRevenueContacts: [],
    rcapRevenueAccounts: [], prospectCandidates: [], outreachSuppressions: [], outreachUnsubscribes: [],
    dataRoomItems: [], partnerProgramArtifacts: [], evidencePackNotes: [], reports: [], supportIssues: []
  };
}

function idFor(state, fragment) {
  const view = buildRelationshipsView(state, OWNER, NOW, { category: "partner_prospect", limit: 100 }, {});
  const item = view.items.find((row) => (row.organization || row.name || "").includes(fragment));
  assert.ok(item, `${fragment} must project.`);
  return item.id;
}

const state = fixtureState();
const riversideId = idFor(state, "Riverside");
const prairieId = idFor(state, "Prairie");

const listView = buildRcapProspectListView(fixtureState(), OWNER, NOW, { limit: 100 }, ON);
const listHtml = rcapProspectsListHtml({ ...listView, addProspect: { available: false, reason: "Adding an RCAP prospect arrives with the guided Add Prospect flow in a later release." }, importPath: { available: true, href: "#upload" } });
const completeHtml = rcapProspectOverviewHtml(buildRcapProspectOverview(fixtureState(), OWNER, riversideId, NOW, ON));
const blockedHtml = rcapProspectOverviewHtml(buildRcapProspectOverview(fixtureState(), OWNER, prairieId, NOW, ON));

// ---------------------------------------------------------------------------------------------
// Escaping — nothing user-supplied reaches the page unescaped
// ---------------------------------------------------------------------------------------------

check("hostile values are stopped by the projection before they reach the renderer", () => {
  const hostile = buildRcapProspectListView({
    ...fixtureState(),
    outreachOrganizations: [{ account_id: "acct-x", organization_name: '<img src=x onerror="alert(1)">', domain: "x.test", classification: "legal aid" }],
    outreachContacts: [{ contact_id: "oc-x", email: "a@x.test", contact_name: '"><script>alert(1)</script>', organization_name: "<img src=x>", linked_account_id: "acct-x" }]
  }, OWNER, NOW, { limit: 100 }, ON);
  // The relationship projection replaces a markup-shaped name outright, so the renderer never
  // sees it. That is a stronger guarantee than escaping, and it is asserted rather than assumed.
  assert.ok(hostile.items.every((row) => !/[<>]/.test(row.organizationName)), "The projection must not emit markup-shaped names.");
  const html = rcapProspectsListHtml(hostile);
  assert.ok(!html.includes("<img src=x"), "Raw markup must never reach the page.");
  assert.ok(!html.includes("<script>alert(1)</script>"), "A script tag must never reach the page.");
});

check("the renderer escapes on its own, independently of what the projection does", () => {
  // Fed directly, bypassing the projection: the renderer is the last line of defence and must
  // escape without relying on an upstream sanitiser it does not control.
  const html = rcapProspectsListHtml({
    available: true,
    availability: { state: "ready" },
    summary: {},
    savedViews: [],
    filters: {},
    items: [{
      id: 'x"><script>alert(1)</script>',
      organizationName: '<img src=x onerror="alert(1)">',
      programLabel: "<b>program</b>",
      geographyLabel: "",
      stage: { key: "research", label: "<i>Research</i>" },
      primaryContact: { name: '"><script>bad()</script>', email: "a@x.test", eligibilityLabel: "Verified direct" },
      lastTouch: null, nextAction: "<script>no()</script>", ownerLabel: "<em>Roger</em>",
      attention: { key: "follow_up_due", label: "<u>Follow-up due</u>", tone: "action" },
      href: '#partners?view=rcap-prospects&account=x"><script>',
      rowActions: []
    }]
  });
  for (const raw of ["<script>", "<img src=x", "<b>program</b>", "<i>Research</i>", "<em>Roger</em>", "<u>Follow-up due</u>"]) {
    assert.ok(!html.includes(raw), `The renderer must escape ${raw}.`);
  }
  assert.ok(html.includes("&lt;script&gt;"), "The value must appear escaped instead.");
  assert.ok(html.includes("&lt;img"), "Markup-shaped text must render as text.");
});

// ---------------------------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------------------------

check("the list renders the header, subtitle, and all eight columns", () => {
  assert.match(listHtml, /RCAP Prospects/);
  assert.match(listHtml, /Research, outreach, conversations, and partner conversion in one place\./);
  for (const column of ["Account", "Program / Geography", "Stage", "Primary Contact", "Last Touch", "Next Action", "Owner", "Attention"]) {
    assert.ok(listHtml.includes(`<th scope="col">${column}</th>`), `The ${column} column must be present.`);
  }
});

check("every row links to the account href the read model emitted", () => {
  for (const row of listView.items) {
    assert.ok(listHtml.includes(`href="${row.href.replaceAll("&", "&amp;")}"`), `Row ${row.id} must link to its own account.`);
  }
  assert.ok(!listHtml.includes("#partners/relationship/"), "The malformed Wave 0 route must never be emitted.");
});

check("the six summary counts render, and an unavailable count says so rather than 0", () => {
  for (const label of ["Needs research", "Needs review", "Ready to contact", "Follow-up due", "Replies", "Blocked"]) {
    assert.ok(listHtml.includes(label), `${label} must appear in the summary strip.`);
  }
  const unavailable = rcapProspectsListHtml({
    ...listView,
    summary: { needs_research: { value: null, known: false, label: "Unavailable" }, blocked: { value: null, known: false, label: "Unavailable" } }
  });
  assert.ok(unavailable.includes("Unavailable"), "An unreadable count must say Unavailable.");
  assert.ok(!/rcap-summary-value">0</.test(unavailable), "An unreadable count must never render as 0.");
});

check("mobile cards are rendered alongside the table, not instead of the columns", () => {
  assert.ok(listHtml.includes('class="rcap-cards"'), "Mobile cards must exist in the markup.");
  assert.ok(listHtml.includes('class="rcap-table-card"'), "The desktop table must exist in the markup.");
  // The card layout carries the fields the prompt requires at 390px.
  for (const label of ["Geography", "Stage", "Contact", "Next"]) {
    assert.ok(listHtml.includes(`<dt>${label}</dt>`), `The mobile card must show ${label}.`);
  }
});

check("the list offers no send control and no bulk selection", () => {
  assert.ok(!/type="checkbox"/.test(listHtml), "The list must not offer bulk selection.");
  assert.ok(!/\bSend\b/.test(listHtml.replace(/Send the assisted-use overview/g, "")), "No send control may appear in the list.");
  for (const word of ["Campaign", "Blast", "Audience", "Enrollment"]) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(listHtml), `Campaign vocabulary (${word}) must not appear.`);
  }
});

check("Add prospect is inert with a stated reason rather than a dead control", () => {
  assert.ok(listHtml.includes("Add prospect"), "The action must be visible.");
  assert.match(listHtml, /<button type="button" class="rcap-primary" disabled/, "It must be disabled, not a link to nothing.");
  assert.match(listHtml, /arrives with the guided Add Prospect flow/, "The reason must travel with it.");
  assert.ok(listHtml.includes('href="#upload"'), "Import opens the existing preview-first import page.");
});

check("the truthful list states each explain themselves", () => {
  const cases = [
    [{ available: false, availability: { state: "feature_off" } }, /not enabled/i],
    [{ available: false, availability: { state: "unauthorized" } }, /do not have access/i],
    [{ available: false, availability: { state: "unavailable", reason: "Source unreadable." } }, /Source unreadable\./],
    [{ available: true, items: [], availability: { state: "empty", reason: "No RCAP prospects have been added yet." } }, /No RCAP prospects yet/],
    [{ available: true, items: [], availability: { state: "filtered_empty", reason: "No prospects match the current filters." } }, /No prospects match these filters/]
  ];
  for (const [payload, pattern] of cases) {
    const html = rcapProspectsListHtml(payload);
    assert.match(html, pattern, `The ${payload.availability.state} state must explain itself.`);
    assert.ok(!html.includes("undefined"), "No state may render the word undefined.");
  }
  // Only a recoverable failure offers a retry.
  assert.ok(rcapProspectsListHtml({ available: false, availability: { state: "unavailable" } }).includes("data-rcap-retry"), "A read error offers one safe retry.");
  assert.ok(!rcapProspectsListHtml({ available: false, availability: { state: "feature_off" } }).includes("data-rcap-retry"), "A disabled feature is not retryable.");
  assert.match(rcapProspectsLoadingHtml(), /Loading RCAP prospects/);
});

// ---------------------------------------------------------------------------------------------
// Overview — complete
// ---------------------------------------------------------------------------------------------

check("the complete overview renders all six main regions and all four rail regions", () => {
  for (const heading of ["Account snapshot", "Best first contact", "Outreach plan", "Recent correspondence", "Le-E profile summary"]) {
    assert.ok(completeHtml.includes(heading), `The overview must render ${heading}.`);
  }
  assert.ok(completeHtml.includes("data-rcap-next"), "The Next Best Step card must render.");
  for (const heading of ["Where things stand", "Open tasks", "Files", "Related accounts"]) {
    assert.ok(completeHtml.includes(heading), `The rail must render ${heading}.`);
  }
  assert.ok(completeHtml.includes('class="rcap-layout"'), "The two-column layout must render.");
});

check("the header carries identity, why-this-matters, and the status chips", () => {
  assert.ok(completeHtml.includes("Synthetic Riverside Justice Center"));
  assert.ok(completeHtml.includes('class="rcap-why"'), "Why this matters must be present.");
  for (const chip of ["Priority:", "Owner:", "Profile:", "Last touch:"]) {
    assert.ok(completeHtml.includes(chip), `The header must show ${chip}`);
  }
  assert.ok(completeHtml.includes('class="rcap-avatar"'), "An organization avatar must render.");
});

check("exactly one dominant orange action on the decision surface", () => {
  const primaries = completeHtml.match(/class="rcap-primary"/g) || [];
  assert.equal(primaries.length, 1, "There must be exactly one primary action on an account page.");
  // And it belongs to Next Best Step, not to the header.
  const nextIndex = completeHtml.indexOf("data-rcap-next");
  assert.ok(completeHtml.indexOf('class="rcap-primary"') > nextIndex, "The dominant action belongs to Next Best Step.");
});

check("Draft email is present, disabled, and says why — it can never send", () => {
  assert.ok(completeHtml.includes("Draft email"), "The action must be visible.");
  assert.match(completeHtml, /data-rcap-action="draft_email" disabled/, "Draft email must be disabled while no review surface exists.");
  assert.match(completeHtml, /Outreach Review arrives in a later release/, "The reason must be attached.");
  assert.ok(!completeHtml.includes("/campaign/"), "It must never point at the broken campaign detail page.");
  assert.ok(!/\bSend\b/.test(completeHtml.replace(/Send the assisted-use overview/g, "")), "No send control may appear on an account page.");
});

check("Profile and Activity are inert with reasons, never dead tabs", () => {
  assert.ok(completeHtml.includes("Overview"), "Overview must be present.");
  const overview = buildRcapProspectOverview(fixtureState(), OWNER, riversideId, NOW, ON);
  const marked = {
    ...overview,
    views: overview.views.map((view) => ({ ...view, destinationBuilt: view.key === "overview", unavailableReason: view.key === "overview" ? null : "The workspace arrives in a later release." }))
  };
  const html = rcapProspectOverviewHtml(marked);
  assert.match(html, /<span aria-disabled="true"[^>]*>Profile<\/span>/, "Profile must be inert, not a link.");
  assert.match(html, /<span aria-disabled="true"[^>]*>Activity<\/span>/, "Activity must be inert, not a link.");
  assert.ok(!/<a[^>]*>Profile<\/a>/.test(html), "Profile must not link to a page that does not exist.");
});

check("prepared is not sent, and no state is upgraded beyond its evidence", () => {
  assert.ok(completeHtml.includes("Sent"), "A sent email reads as sent.");
  assert.ok(completeHtml.includes("Prepared"), "A draft reads as prepared.");
  assert.ok(!completeHtml.includes("Delivered"), "Nothing in the fixture is delivered, so nothing may say so.");
});

check("nothing is fabricated where no profile exists", () => {
  assert.ok(!/15 of 15|15\/15|\d+% complete/.test(completeHtml), "No completeness figure may be invented.");
  assert.ok(completeHtml.includes("Not started"), "The profile status is reported honestly.");
  assert.ok(completeHtml.includes("rcap-unknown"), "Unknown values render in their own treatment.");
  assert.ok(!completeHtml.includes(">0<"), "An unknown must never render as a bare zero.");
});

check("facts and recommendations are visibly different, not colour alone", () => {
  const overview = buildRcapProspectOverview(fixtureState(), OWNER, riversideId, NOW, ON);
  const html = rcapProspectOverviewHtml({
    ...overview,
    snapshot: {
      whatTheyDo: { known: true, value: "Runs a monthly record-clearing clinic.", label: "" },
      whyRcapMayFit: { known: true, value: "Volume screening could reduce manual review.", label: "" },
      whatNotToPitch: { known: true, value: "Replacing their attorneys.", label: "" },
      openQuestion: { known: true, value: "Who owns the intake process?", label: "" },
      sourceNote: ""
    }
  });
  // Each label is a WORD, so the distinction survives without colour.
  for (const word of ["Recorded", "Inferred", "Recommendation", "Open question"]) {
    assert.ok(html.includes(word), `The snapshot must label ${word} in words.`);
  }
});

// ---------------------------------------------------------------------------------------------
// Overview — blocked
// ---------------------------------------------------------------------------------------------

check("the blocked overview renders the full blocker anatomy", () => {
  assert.ok(blockedHtml.includes("Outreach blocked"), "The blocked register must be named.");
  for (const label of ["Blocked", "Why", "Still possible", "Owner", "Needed"]) {
    assert.ok(blockedHtml.includes(`<dt>${label}</dt>`), `The blocker must state ${label}.`);
  }
  assert.ok(blockedHtml.includes('data-rcap-blocked="true"'), "The page must declare itself blocked.");
});

check("a blocked account offers no Draft email at all", () => {
  assert.ok(!blockedHtml.includes("Draft email"), "A control that cannot finish its work is not shown.");
  assert.match(blockedHtml, /Outreach is blocked for this organization/, "The absence is explained.");
});

check("the blocked page stays useful", () => {
  assert.ok(blockedHtml.includes("Add note"), "Notes remain available while blocked.");
  assert.ok(blockedHtml.includes("Best first contact"), "Contact review remains available.");
  assert.ok(blockedHtml.includes("client-intake"), "The intake warning is shown.");
});

check("an unavailable or missing account renders a truthful state", () => {
  const missing = rcapProspectOverviewHtml({ available: false, availability: { state: "not_found_or_unauthorized" } });
  assert.match(missing, /Not found/);
  assert.ok(!missing.includes("data-rcap-retry"), "A missing account is not retryable.");
  const off = rcapProspectOverviewHtml({ available: false, availability: { state: "feature_off" } });
  assert.match(off, /not enabled/i);
});

// ---------------------------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------------------------

check("one account's facts never appear on another's page", () => {
  assert.ok(!completeHtml.includes("intake@prairie-legal.test"), "Prairie's address must not appear on Riverside.");
  assert.ok(!blockedHtml.includes("dana.whitfield@riverside-justice.test"), "Riverside's contact must not appear on Prairie.");
  assert.ok(!blockedHtml.includes("Send the assisted-use overview"), "Riverside's task must not appear on Prairie.");
});

// ---------------------------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------------------------

const store = { readCollections: async () => fixtureState() };

check("the endpoint is read-only", async () => {
  assert.ok(isRcapProspectsApiPath("/api/ui/rcap-prospects"));
  assert.ok(!isRcapProspectsApiPath("/api/ui/rcap-prospects/extra"));
  const source = fs.readFileSync(path.join(root, "scripts", "rcap-prospects-api.mjs"), "utf8");
  for (const forbidden of ["writeCollections", "writeChanges", "submitCoreMutations", "fetch(", "sendgrid"]) {
    assert.ok(!source.includes(forbidden), `The endpoint must not reference ${forbidden}.`);
  }
});

check("every collection the endpoint reads is registered", () => {
  for (const collection of RCAP_PROSPECTS_READ_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(collection), `${collection} must be a registered core collection.`);
  }
});

await (async () => {
  const post = await handleRcapProspectsApiRequest({ enabled: true, method: "POST", pathname: "/api/ui/rcap-prospects", store, actor: OWNER, now: NOW });
  assert.equal(post.status, 405, "A write method must be refused.");
  checks.push("a write method is refused with 405");

  const off = await handleRcapProspectsApiRequest({ enabled: false, method: "GET", pathname: "/api/ui/rcap-prospects", searchParams: new URLSearchParams(), store, actor: OWNER, now: NOW });
  assert.equal(off.body.list.availability.state, "feature_off", "Flag off is a state, not an error.");
  checks.push("flag off returns the feature_off state");

  const viewer = await handleRcapProspectsApiRequest({ enabled: true, method: "GET", pathname: "/api/ui/rcap-prospects", searchParams: new URLSearchParams(), store, actor: { authenticated: true, role: "viewer" }, now: NOW });
  assert.equal(viewer.status, 403, "A viewer has no RCAP read capability.");
  const anonymous = await handleRcapProspectsApiRequest({ enabled: true, method: "GET", pathname: "/api/ui/rcap-prospects", searchParams: new URLSearchParams(), store, actor: { authenticated: false, role: "owner" }, now: NOW });
  assert.equal(anonymous.status, 403, "An unauthenticated caller is refused.");
  checks.push("unauthorized reads are refused");

  const unavailable = await handleRcapProspectsApiRequest({ enabled: true, method: "GET", pathname: "/api/ui/rcap-prospects", searchParams: new URLSearchParams(), store: {}, actor: OWNER, now: NOW });
  assert.equal(unavailable.status, 503, "No store is a truthful 503, not an empty list.");
  checks.push("an unreadable store is 503, never an empty list");

  const list = await handleRcapProspectsApiRequest({ enabled: true, method: "GET", pathname: "/api/ui/rcap-prospects", searchParams: new URLSearchParams(), store, actor: OWNER, now: NOW });
  assert.equal(list.body.kind, "list");
  assert.ok(list.body.list.items.length >= 2, "The list must project the fixtures.");
  assert.equal(list.body.list.addProspect.available, false, "Add prospect is not built in Wave 1B.");
  assert.equal(list.body.list.importPath.href, "#upload", "Import points at the existing preview-first page.");
  assert.equal(list.body.list.safety.sendControls, 0);
  checks.push("the list endpoint returns the projected rows and no send authority");

  const overview = await handleRcapProspectsApiRequest({ enabled: true, method: "GET", pathname: "/api/ui/rcap-prospects", searchParams: new URLSearchParams(`account=${riversideId}`), store, actor: OWNER, now: NOW });
  assert.equal(overview.body.kind, "overview");
  assert.ok(overview.body.version, "The version the write contract demands must travel with the payload.");
  const profileView = overview.body.overview.views.find((view) => view.key === "profile");
  const activityView = overview.body.overview.views.find((view) => view.key === "activity");
  assert.equal(profileView.destinationBuilt, false, "The profile workspace is not built in Wave 1B.");
  assert.equal(activityView.destinationBuilt, false, "The activity workspace is not built in Wave 1B.");
  assert.ok(activityView.unavailableReason, "An unbuilt destination must carry its reason.");
  checks.push("the overview endpoint marks the two unbuilt destinations");

  const hostile = await handleRcapProspectsApiRequest({ enabled: true, method: "GET", pathname: "/api/ui/rcap-prospects", searchParams: new URLSearchParams("account=../../etc/passwd"), store, actor: OWNER, now: NOW });
  assert.equal(hostile.body.kind, "list", "A traversal-shaped id must not be treated as an account.");
  checks.push("a hostile account id is refused before the projection");
})();

// ---------------------------------------------------------------------------------------------
// The lazy runtime
// ---------------------------------------------------------------------------------------------

check("the runtime is registered, gated, and bounded", () => {
  assert.ok(VNEXT_LAZY_ASSET_CONTRACT.runtimeIds.includes("rcap-prospects"));
  assert.ok(VNEXT_LAZY_ASSET_CONTRACT.stylesheetPaths.includes(RCAP_PROSPECTS_STYLESHEET_PATH));
  assert.equal(resolveVNextLazyRuntime("/assets/ui/runtime/rcap-prospects.js", {}), null, "Flag off: the runtime is not served at all.");
  const source = resolveVNextLazyRuntime("/assets/ui/runtime/rcap-prospects.js", { rcapCrm: true });
  assert.ok(source && source.length > 0, "Flag on: the runtime is served.");
  assert.ok(source.length <= 64 * 1024, "The runtime must stay inside the lazy budget.");
});

check("the browser runtime parses and grants no external authority", () => {
  const source = rcapProspectsBrowserSource();
  new vm.Script(source);
  assert.ok(!/sendgrid|gmail\.send|mailto:/i.test(source), "The runtime must contain no send path.");
  // The only mutation it can perform is the existing relationship action endpoint.
  const posts = source.match(/fetch\("\/api\/[^"]+"/g) || [];
  for (const post of posts) {
    assert.ok(/rcap-prospects|relationships/.test(post), `The runtime may only call its own read endpoint or the relationship action endpoint, not ${post}.`);
  }
  assert.ok(source.includes("expectedVersion"), "A write must carry the version it read.");
  assert.ok(source.includes("requestId"), "A write must carry an idempotency key.");
  assert.ok(source.includes("inFlightAction"), "A second click must not double-submit.");
  assert.ok(source.includes("409"), "A conflict must be handled, not swallowed.");
  assert.equal(RCAP_PROSPECTS_ENDPOINT, "/api/ui/rcap-prospects");
});

check("the server serves the runtime only behind the flag", () => {
  const server = fs.readFileSync(path.join(root, "scripts", "preview-server.mjs"), "utf8");
  assert.ok(server.includes("rcapCrm:rcapCrmConfig.enabled"), "The runtime gate must read the server flag.");
  assert.ok(server.includes("isRcapProspectsApiPath"), "The endpoint must be dispatched.");
  assert.ok(server.includes("readRcapCrmConfig(process.env)"), "The flag must be read from the server environment.");
});

console.log(`RCAP Wave 1B surfaces verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
