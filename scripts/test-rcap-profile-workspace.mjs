// Wave 2, Packet 7 — the rendered Profile workspace and its guarded actions.
//
// The renderers are pure functions of a payload, so the things that matter can be proven without
// a browser: that a claim always carries its fact class in words, that a source that could not be
// read says why, that a human edit is never overwritten without an explicit instruction, that a
// correction records a decision without touching the account, and that one organization's
// research never reaches another's page.

import assert from "node:assert/strict";

import {
  RCAP_PROFILE_ACTIONS,
  RCAP_PROFILE_API_PATH,
  handleRcapProfileApiRequest,
  isRcapProfileApiPath
} from "./rcap-profile-api.mjs";
import {
  RCAP_PROFILE_ENDPOINT,
  RCAP_PROFILE_STYLESHEET_PATH,
  rcapProfileBrowserSource,
  rcapProfileLoadingHtml,
  rcapProfileWorkspaceHtml
} from "./ui/pages/rcap-profile.mjs";
import { buildRcapProspectProfile } from "./ui/view-models/rcap-prospect-profile.mjs";
import { rcapProspectsBrowserSource } from "./ui/pages/rcap-prospects.mjs";
import { buildRelationshipsView } from "./relationship-service.mjs";
import { VNEXT_LAZY_ASSET_CONTRACT, resolveVNextLazyRuntime } from "./ui/app-shell.mjs";
import {
  buildRcapClaim,
  buildRcapProfileDependency,
  buildRcapProfileRun,
  buildRcapProfileSection,
  buildRcapProfileSnapshot,
  buildRcapProfileUnknown,
  buildRcapProfileVersion,
  buildRcapProposedCorrection,
  buildRcapSource
} from "./rcap-profile-contracts.mjs";

const checks = [];
function check(name, run) { run(); checks.push(name); }
const asyncChecks = [];
function checkAsync(name, run) { asyncChecks.push([name, run]); }

const NOW = "2026-08-10T12:00:00.000Z";
const OWNER = Object.freeze({ authenticated: true, id: "roger", role: "owner", label: "Roger" });
const VIEWER = Object.freeze({ authenticated: true, id: "sam", role: "viewer", label: "Sam" });
const OPERATOR = Object.freeze({ authenticated: true, id: "ali", role: "operator", label: "Ali" });
const ON = Object.freeze({ rcapCrmEnabled: true });

function baseState() {
  return {
    outreachOrganizations: [
      { account_id: "acct-riverside", organization_name: "Synthetic Riverside Justice Center", domain: "riverside-justice.test", classification: "legal aid", owner: "Roger" },
      { account_id: "acct-prairie", organization_name: "Synthetic Prairie Legal Services", domain: "prairie-legal.test", classification: "legal aid" }
    ],
    outreachContacts: [
      { contact_id: "oc-dana", email: "dana.whitfield@riverside-justice.test", contact_name: "Dana Whitfield", organization_name: "Synthetic Riverside Justice Center", linked_account_id: "acct-riverside" },
      { contact_id: "oc-prairie", email: "intake@prairie-legal.test", contact_name: "Prairie Desk", organization_name: "Synthetic Prairie Legal Services", linked_account_id: "acct-prairie" }
    ],
    tasks: [], activityEvents: [], notes: [], partners: [], companyOrganizations: [], companyContacts: [],
    companyEvents: [], emailDrafts: [], outreachMessages: [], outreachThreads: [], rcapRevenueAccounts: [],
    prospectCandidates: [], outreachSuppressions: [], outreachUnsubscribes: [], dataRoomItems: [],
    partnerProgramArtifacts: [], evidencePackNotes: [], reports: [], supportIssues: []
  };
}

function idFor(state, fragment) {
  const view = buildRelationshipsView(state, OWNER, NOW, { category: "partner_prospect", limit: 100 }, {});
  const item = view.items.find((row) => (row.organization || row.name || "").includes(fragment));
  assert.ok(item, `${fragment} must project.`);
  return item.id;
}

const RIVERSIDE = idFor(baseState(), "Riverside");
const PRAIRIE = idFor(baseState(), "Prairie");

// ---------------------------------------------------------------------------------------------
// Fixture: two organizations. Riverside has research with a conflict; Prairie has a blocked
// document and a correction that the account has since overtaken.
// ---------------------------------------------------------------------------------------------

function fixtureState() {
  const readSource = buildRcapSource({
    accountId: RIVERSIDE, kind: "google_doc", ref: "https://docs.google.com/document/d/synthetic-riverside-profile",
    title: "Riverside research profile", accessState: "available", retrievedAt: NOW, revisionId: "rev-2"
  });
  const blockedSource = buildRcapSource({
    accountId: PRAIRIE, kind: "google_doc", ref: "https://docs.google.com/document/d/synthetic-prairie-profile",
    title: "Prairie research profile", accessState: "not_authorized",
    unreadableReason: "The application's Google grant covers Gmail and Calendar. Drive and Docs read access has not been granted."
  });
  const otherSource = buildRcapSource({
    accountId: PRAIRIE, kind: "website", ref: "https://prairie-legal.test", title: "Prairie site",
    accessState: "available", retrievedAt: NOW, revisionId: "rev-p1"
  });

  const sourceOwners = new Map([[readSource.id, RIVERSIDE], [blockedSource.id, PRAIRIE], [otherSource.id, PRAIRIE]]);

  const verdictClaim = buildRcapClaim({
    accountId: RIVERSIDE, sectionKey: "strategic_verdict", factClass: "verified_fact",
    text: "Riverside runs monthly record clearing clinics across three counties.",
    sourceIds: [readSource.id], createdAt: NOW
  }, { sourceOwners });
  const angleClaim = buildRcapClaim({
    accountId: RIVERSIDE, sectionKey: "strongest_sales_angle", factClass: "recommendation",
    text: "Lead with assisted use rather than volume.", createdAt: NOW
  });
  const prairieClaim = buildRcapClaim({
    accountId: PRAIRIE, sectionKey: "strategic_verdict", factClass: "supported_inference",
    text: "Prairie handles housing and benefits matters only.", sourceIds: [otherSource.id], createdAt: NOW
  }, { sourceOwners });

  const claimOwners = new Map([[verdictClaim.id, RIVERSIDE], [angleClaim.id, RIVERSIDE], [prairieClaim.id, PRAIRIE]]);

  const version = buildRcapProfileVersion({
    accountId: RIVERSIDE, versionNumber: 2, status: "needs_review", createdAt: NOW, sectionHashes: ["h1", "h2"]
  });
  const previous = buildRcapProfileVersion({
    accountId: RIVERSIDE, versionNumber: 1, status: "needs_review", createdAt: NOW, sectionHashes: ["h0"]
  });
  const prairieVersion = buildRcapProfileVersion({
    accountId: PRAIRIE, versionNumber: 1, status: "needs_review", createdAt: NOW, sectionHashes: ["p1"]
  });

  const verdictSection = buildRcapProfileSection({
    accountId: RIVERSIDE, versionId: version.id, sectionKey: "strategic_verdict", state: "needs_review",
    body: "Riverside runs monthly record clearing clinics across three counties.", claimIds: [verdictClaim.id]
  }, { claimOwners });
  // Human-edited AND built against a revision that has since moved: the conflict.
  const angleSection = buildRcapProfileSection({
    accountId: RIVERSIDE, versionId: version.id, sectionKey: "strongest_sales_angle", state: "human_edited",
    body: "Roger's own wording about assisted use.", humanEdited: true, editedBy: "roger", editedAt: NOW,
    claimIds: [angleClaim.id]
  }, { claimOwners });
  const prairieSection = buildRcapProfileSection({
    accountId: PRAIRIE, versionId: prairieVersion.id, sectionKey: "strategic_verdict", state: "needs_review",
    body: "Prairie handles housing and benefits matters only.", claimIds: [prairieClaim.id]
  }, { claimOwners });

  return {
    ...baseState(),
    rcapProspectSources: [readSource, blockedSource, otherSource],
    rcapProspectClaims: [verdictClaim, angleClaim, prairieClaim],
    rcapProfileRuns: [buildRcapProfileRun({
      accountId: RIVERSIDE, trigger: "human_request", status: "succeeded", startedAt: NOW, finishedAt: NOW,
      sourceIds: [readSource.id], versionId: version.id
    })],
    rcapProfileVersions: [previous, version, prairieVersion],
    rcapProfileSections: [verdictSection, angleSection, prairieSection],
    rcapProfileUnknowns: [buildRcapProfileUnknown({
      accountId: RIVERSIDE, sectionKey: "best_contact_strategy", createdAt: NOW,
      question: "Who coordinates the monthly clinics?",
      whyItMatters: "The first message has to reach the person who schedules events.",
      howToResolve: "Check the clinic page and the most recent event flyer."
    })],
    rcapProfileCorrections: [
      buildRcapProposedCorrection({
        accountId: RIVERSIDE, field: "region", currentValue: "Unknown", proposedValue: "Riverside metro",
        rationale: "Recorded in the research profile.", sourceIds: [readSource.id], createdAt: NOW
      }, { sourceOwners }),
      // The account's owner has changed since this research was written, so accepting the
      // correction now would overwrite something newer than the source it rests on.
      buildRcapProposedCorrection({
        accountId: RIVERSIDE, field: "owner", currentValue: "Unassigned",
        proposedValue: "Dana Whitfield", sourceIds: [readSource.id], createdAt: NOW
      }, { sourceOwners })
    ],
    rcapProfileDependencies: [
      // Built against rev-1; the source now reports rev-2, so this section is stale.
      buildRcapProfileDependency({
        accountId: RIVERSIDE, sectionKey: "strongest_sales_angle", dependsOnKind: "source",
        dependsOnId: readSource.id, dependsOnRevision: "rev-1", createdAt: NOW
      }),
      buildRcapProfileDependency({
        accountId: RIVERSIDE, sectionKey: "strategic_verdict", dependsOnKind: "source",
        dependsOnId: readSource.id, dependsOnRevision: "rev-2", createdAt: NOW
      })
    ],
    rcapProfileSnapshots: [
      buildRcapProfileSnapshot({
        accountId: RIVERSIDE, versionId: previous.id, capturedAt: NOW,
        sections: [{ sectionKey: "strategic_verdict", state: "draft", body: "Older verdict.", contentHash: "old-1" }]
      }),
      buildRcapProfileSnapshot({
        accountId: RIVERSIDE, versionId: version.id, capturedAt: NOW,
        sections: [{ sectionKey: "strategic_verdict", state: "needs_review", body: verdictSection.body, contentHash: verdictSection.contentHash }]
      })
    ]
  };
}

const state = fixtureState();
const profile = buildRcapProspectProfile(state, OWNER, RIVERSIDE, NOW, ON);
const prairieProfile = buildRcapProspectProfile(state, OWNER, PRAIRIE, NOW, ON);
const html = rcapProfileWorkspaceHtml(profile);

function memoryStore(initial) {
  let current = JSON.parse(JSON.stringify(initial));
  return {
    writes: 0,
    async readCollections() { return JSON.parse(JSON.stringify(current)); },
    async writeChanges(before, after) { this.writes += 1; current = JSON.parse(JSON.stringify(after)); },
    snapshot() { return current; }
  };
}

// ---------------------------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------------------------

check("all fifteen sections are addressable, present or not", () => {
  assert.equal(profile.sections.length, 15);
  assert.equal(profile.completeness.total, 15);
  assert.equal(profile.completeness.present, 2);
  const missing = profile.sections.find((section) => section.key === "deal_path");
  assert.equal(missing.present, false);
  assert.ok(missing.emptyReason, "A section with nothing in it must say which silence it is.");
});

check("a human-edited section whose sources moved is a conflict, not a stale section", () => {
  const angle = profile.sections.find((section) => section.key === "strongest_sales_angle");
  assert.equal(angle.state, "conflict");
  assert.equal(angle.stateLabel, "Conflict");
  assert.equal(angle.conflict.editedBy, "roger");
  assert.deepEqual(angle.conflict.choices.map((choice) => choice.key), ["keep_human_edit", "regenerate_section"]);
  assert.ok(angle.conflict.choices.every((choice) => choice.consequence), "Each choice must state what it costs.");
  assert.equal(profile.conflicts.length, 1);
});

check("invalidation is targeted: the section built against the current revision is untouched", () => {
  const verdict = profile.sections.find((section) => section.key === "strategic_verdict");
  assert.equal(verdict.state, "needs_review");
  assert.equal(verdict.staleReason, "");
});

check("every claim carries its fact class as a word, and cites what it rests on", () => {
  const verdict = profile.sections.find((section) => section.key === "strategic_verdict");
  assert.equal(verdict.claims.length, 1);
  assert.equal(verdict.claims[0].factLabel, "Verified");
  assert.equal(verdict.claims[0].sources.length, 1);
  const angle = profile.sections.find((section) => section.key === "strongest_sales_angle");
  assert.equal(angle.claims[0].factLabel, "Le-E recommendation");
  assert.equal(angle.claims[0].sources.length, 0);
  assert.equal(angle.claims[0].citationMissing, false, "A recommendation is not required to cite.");
});

check("a correction the account has overtaken is a conflict, not a decision", () => {
  const byField = new Map(profile.corrections.map((correction) => [correction.field, correction]));
  assert.equal(byField.get("region").state, "proposed");
  assert.equal(byField.get("region").decidable, true);
  assert.equal(byField.get("owner").state, "conflict");
  assert.equal(byField.get("owner").conflictValue, "Roger");
  assert.equal(byField.get("owner").decidable, false);
});

check("an unreadable document says why, and names the blocker a person can act on", () => {
  assert.equal(prairieProfile.sourcePanel.total, 2);
  assert.equal(prairieProfile.sourcePanel.readable, 1);
  assert.equal(prairieProfile.sourcePanel.blocked, 1);
  assert.ok(prairieProfile.sourcePanel.blocker, "A scope blocker must travel with the panel.");
  assert.equal(prairieProfile.sourcePanel.blocker.owner, "Roger, with security review");
  const blocked = prairieProfile.sourcePanel.sources.find((source) => source.accessState === "not_authorized");
  assert.ok(blocked.unreadableReason.includes("Drive and Docs"));
});

check("an operator may research but not approve, and every refusal explains itself", () => {
  // Wave 0 decision B5: no fifth role. `operator` is the role that carries read and manage but
  // not approve, so it is the real boundary this page has to respect. A viewer cannot read RCAP
  // at all, which the endpoint enforces (asserted separately below).
  const asOperator = buildRcapProspectProfile(state, OPERATOR, RIVERSIDE, NOW, ON);
  assert.equal(asOperator.available, true);
  assert.equal(asOperator.permissions.canManage, true);
  assert.equal(asOperator.permissions.canApprove, false);

  const actions = asOperator.sections.flatMap((section) => section.actions);
  const byKey = (key) => actions.filter((action) => action.key === key);
  assert.ok(byKey("request_research").some((action) => action.available), "An operator may ask for research.");
  assert.ok(byKey("approve_section").every((action) => !action.available), "An operator may not approve.");
  assert.ok(byKey("reject_section").every((action) => !action.available), "An operator may not reject.");
  assert.ok(actions.filter((action) => !action.available).every((action) => action.reason),
    "Every unavailable control must explain itself rather than sitting there dead.");
  assert.ok(asOperator.corrections.every((correction) => correction.decidable === false),
    "An operator may not decide a correction.");
});

check("one organization's research never appears on another's profile", () => {
  const texts = prairieProfile.sections.flatMap((section) => section.claims.map((claim) => claim.text));
  assert.ok(!texts.some((text) => text.includes("Riverside")), "Riverside's claims must not reach Prairie.");
  assert.ok(prairieProfile.sourcePanel.sources.every((source) => !source.title.includes("Riverside")));
  assert.equal(prairieProfile.corrections.length, 0);
});

check("nothing on the page sends anything", () => {
  assert.equal(profile.safety.externalActions, 0);
  assert.equal(profile.safety.sendControls, 0);
});

// ---------------------------------------------------------------------------------------------
// The rendered page
// ---------------------------------------------------------------------------------------------

check("the workspace renders the section index, the sections and the sources", () => {
  assert.ok(html.includes('data-rcap-profile-state="ready"'));
  for (const label of ["Strategic Verdict", "Best Subject Line", "Outreach Sequence"]) {
    assert.ok(html.includes(label), `The workspace must render ${label}.`);
  }
  assert.ok(html.includes('data-rcap-index="deal_path"'), "Every section must be reachable from the index.");
  assert.ok(html.includes("Sources"), "The source panel must render.");
});

check("the conflict renders both choices and says nothing was overwritten", () => {
  assert.ok(html.includes("data-rcap-conflict-summary"));
  assert.ok(html.includes("Nothing has been overwritten."));
  assert.ok(html.includes("Keep the edit"));
  assert.ok(html.includes("The edit is lost."), "Regenerating must state its cost before it is chosen.");
});

check("the corrections card states that accepting does not change the account", () => {
  assert.ok(html.includes("Applying it to the account record is a separate step and does not happen here."));
  assert.ok(html.includes('data-rcap-correction-state="conflict"'));
  assert.ok(html.includes("which is newer than this research"));
});

check("no send control exists anywhere on the page", () => {
  const offered = [...html.matchAll(/data-rcap-profile-action="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(offered.length > 0, "The page must offer some controls, or this check proves nothing.");
  for (const action of offered) {
    assert.ok(Object.hasOwn(RCAP_PROFILE_ACTIONS, action), `The page offers "${action}", which is not a known profile action.`);
  }
  assert.ok(!html.includes("mailto:"), "No control may open a mail client.");
  // Section 8 is literally called "What to Send", so the test looks at CONTROL LABELS, not at
  // prose. A button or link whose own text is a send or schedule verb is the thing that matters.
  const controlLabels = [...html.matchAll(/<(?:button|a)\b[^>]*>([^<]*)</g)].map((match) => match[1].trim());
  for (const label of controlLabels) {
    assert.ok(!/^(send|schedule|email|draft and send)\b/i.test(label), `"${label}" reads as a send control.`);
  }
});

check("a blocked source renders its whole anatomy on the page", () => {
  const prairieHtml = rcapProfileWorkspaceHtml(prairieProfile);
  assert.ok(prairieHtml.includes("data-rcap-source-blocker"));
  for (const label of ["Why", "Still possible", "Owner", "Needed"]) {
    assert.ok(prairieHtml.includes(`<dt>${label}</dt>`), `The blocker must state ${label}.`);
  }
});

check("the flag-off and unauthorized states render as states, not as failures", () => {
  const off = rcapProfileWorkspaceHtml({ available: false, availability: { state: "feature_off", reason: "The RCAP prospect workspace is not enabled." } });
  assert.ok(off.includes('data-rcap-profile-state="feature_off"'));
  assert.ok(off.includes("not enabled"));
  assert.ok(rcapProfileLoadingHtml().includes('data-rcap-profile-state="loading"'));
});

check("a disqualified profile reads as a finished outcome, not a gap", () => {
  const disqualified = {
    ...profile,
    status: { key: "disqualified", label: "Disqualified", successful: true, disqualificationReason: "Serves a different population." }
  };
  const rendered = rcapProfileWorkspaceHtml(disqualified);
  assert.ok(rendered.includes("This is a completed research outcome, not a gap."));
  assert.ok(rendered.includes('data-rcap-profile-status="disqualified"'));
});

check("document content is escaped on its way onto the page", () => {
  const payload = '<img src=x onerror="alert(1)">';
  const hostileState = fixtureState();
  hostileState.rcapProfileSections = hostileState.rcapProfileSections.map((section) =>
    section.accountId === RIVERSIDE && section.sectionKey === "strategic_verdict"
      ? { ...section, body: payload }
      : section);
  hostileState.rcapProspectClaims = hostileState.rcapProspectClaims.map((claim) =>
    claim.accountId === RIVERSIDE ? { ...claim, text: payload } : claim);
  hostileState.rcapProspectSources = hostileState.rcapProspectSources.map((source) =>
    source.accountId === RIVERSIDE ? { ...source, title: payload } : source);

  const rendered = rcapProfileWorkspaceHtml(buildRcapProspectProfile(hostileState, OWNER, RIVERSIDE, NOW, ON));
  assert.ok(rendered.includes("&lt;img src=x"), "The payload must appear, escaped.");
  assert.ok(!rendered.includes("<img src=x"), "Section bodies, claims and source titles must all be escaped.");
  assert.ok(!rendered.includes("onerror=\"alert"), "No attribute may survive as markup.");
});

// ---------------------------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------------------------

check("the runtime is registered, gated, and within budget", () => {
  assert.ok(VNEXT_LAZY_ASSET_CONTRACT.runtimeIds.includes("rcap-profile"));
  assert.ok(VNEXT_LAZY_ASSET_CONTRACT.stylesheetPaths.includes(RCAP_PROFILE_STYLESHEET_PATH));
  assert.equal(resolveVNextLazyRuntime("/assets/ui/runtime/rcap-profile.js", { rcapCrm: false }), null,
    "With the flag off the runtime must not be served at all.");
  const served = resolveVNextLazyRuntime("/assets/ui/runtime/rcap-profile.js", { rcapCrm: true });
  assert.ok(served, "With the flag on the runtime must be served.");
  const bytes = Buffer.byteLength(rcapProfileBrowserSource(), "utf8");
  assert.ok(bytes <= VNEXT_LAZY_ASSET_CONTRACT.runtimeMaxBytes, `The runtime is ${bytes} bytes, over the ${VNEXT_LAZY_ASSET_CONTRACT.runtimeMaxBytes} budget.`);
});

check("the runtime parses, calls only its own endpoint, and grants no external authority", () => {
  const source = rcapProfileBrowserSource();
  new Function(`return ${JSON.stringify(source)}`);
  assert.doesNotThrow(() => new Function(source));
  const apiLiterals = [...new Set(source.match(/\/api\/[A-Za-z0-9/_-]+/g) || [])];
  assert.deepEqual(apiLiterals, [RCAP_PROFILE_ENDPOINT], `The runtime knows these addresses: ${apiLiterals.join(", ")}.`);
  assert.equal(source.match(/https?:\/\/[^"'`\s]+/g), null, "The runtime must contain no absolute URL.");
  assert.ok(source.includes("expectedVersion"), "A write must carry the version it read.");
  assert.ok(source.includes("requestId"), "A write must carry an idempotency key.");
  assert.ok(source.includes("inFlight"), "A second click must not double-submit.");
  assert.ok(source.includes("409"), "A conflict must be handled, not swallowed.");
  assert.ok(source.includes('query.get("pane")==="profile"'), "The runtime must own only the profile pane.");
  assert.equal(RCAP_PROFILE_ENDPOINT, "/api/ui/rcap-profile");
});

check("the list runtime stands down on the profile pane", () => {
  // Two runtimes match the same route. Without this guard both render into the Partners section
  // and the founder reads two pages stacked on one screen.
  const listSource = rcapProspectsBrowserSource();
  assert.ok(
    listSource.includes('hashQuery().get("pane")!=="profile"'),
    "The list runtime must stand down when the profile pane owns the page."
  );
});

// ---------------------------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------------------------

check("the path and the action table are what the runtime expects", () => {
  assert.ok(isRcapProfileApiPath(RCAP_PROFILE_API_PATH));
  assert.ok(!isRcapProfileApiPath("/api/ui/rcap-profiles"));
  assert.deepEqual(Object.keys(RCAP_PROFILE_ACTIONS).sort(), [
    "accept_correction", "approve_section", "edit_section", "keep_human_edit",
    "regenerate_section", "reject_correction", "reject_section", "request_research"
  ]);
});

const request = (overrides = {}) => handleRcapProfileApiRequest({
  enabled: true, method: "GET", pathname: RCAP_PROFILE_API_PATH,
  searchParams: new URLSearchParams(`account=${RIVERSIDE}`),
  store: memoryStore(state), actor: OWNER, now: NOW, ...overrides
});

checkAsync("unauthorized reads are refused; the flag off is a state", async () => {
  assert.equal((await request({ actor: { authenticated: false } })).status, 403);
  assert.equal((await request({ actor: VIEWER })).status, 403, "A viewer cannot read RCAP research at all.");
  const off = await request({ enabled: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.profile.availability.state, "feature_off");
});

checkAsync("an unreadable store is 503, never an empty profile", async () => {
  const result = await request({ store: { readCollections: async () => { throw new Error("down"); } } });
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
});

checkAsync("a hostile account id is refused before the projection", async () => {
  const result = await request({ searchParams: new URLSearchParams("account=../../etc/passwd") });
  assert.equal(result.status, 400);
});

checkAsync("an unknown method and an unknown action are both refused", async () => {
  assert.equal((await request({ method: "DELETE" })).status, 405);
  const store = memoryStore(state);
  const result = await handleRcapProfileApiRequest({
    enabled: true, method: "POST", pathname: RCAP_PROFILE_API_PATH,
    body: { action: "send_email", accountId: RIVERSIDE, requestId: "r1", expectedVersion: profile.version.contentHash },
    store, actor: OWNER, now: NOW
  });
  assert.equal(result.status, 400);
  assert.equal(store.writes, 0, "A refused action must not write.");
});

const post = (body, actor = OWNER, store = memoryStore(state)) => ({
  store,
  result: handleRcapProfileApiRequest({
    enabled: true, method: "POST", pathname: RCAP_PROFILE_API_PATH, body, store, actor, now: NOW
  })
});

checkAsync("a write without a request id, a version, or the right role is refused", async () => {
  const base = { action: "approve_section", accountId: RIVERSIDE, sectionKey: "strategic_verdict", expectedVersion: profile.version.contentHash, requestId: "req-1" };
  assert.equal((await post({ ...base, requestId: "" }).result).status, 400);
  assert.equal((await post({ ...base, expectedVersion: "" }).result).status, 400);
  const operator = post(base, OPERATOR);
  assert.equal((await operator.result).status, 403, "Approving needs the approve capability, which an operator does not have.");
  assert.equal(operator.store.writes, 0);
  assert.equal((await post({ ...base, requestId: "req-1b" }, VIEWER).result).status, 403, "A viewer cannot write either.");
});

checkAsync("a stale expectedVersion conflicts instead of landing on different text", async () => {
  const attempt = post({
    action: "approve_section", accountId: RIVERSIDE, sectionKey: "strategic_verdict",
    expectedVersion: "not-the-current-hash", requestId: "req-2"
  });
  const result = await attempt.result;
  assert.equal(result.status, 409);
  assert.ok(result.body.error.includes("changed since you read it"));
  assert.equal(attempt.store.writes, 0);
});

checkAsync("approving a section writes exactly that, and nothing else", async () => {
  const attempt = post({
    action: "approve_section", accountId: RIVERSIDE, sectionKey: "strategic_verdict",
    expectedVersion: profile.version.contentHash, requestId: "req-3"
  });
  const result = await attempt.result;
  assert.equal(result.status, 200);
  assert.equal(attempt.store.writes, 1);
  const after = attempt.store.snapshot();
  const section = after.rcapProfileSections.find((entry) => entry.sectionKey === "strategic_verdict" && entry.accountId === RIVERSIDE);
  assert.equal(section.state, "approved");
  assert.equal(section.approvedBy, "roger");
  assert.equal(after.rcapProfileSections.length, state.rcapProfileSections.length, "Approving must not add a row.");
});

checkAsync("regenerating a human-edited section is refused until the cost is acknowledged", async () => {
  const refused = post({
    action: "regenerate_section", accountId: RIVERSIDE, sectionKey: "strongest_sales_angle",
    expectedVersion: profile.version.contentHash, requestId: "req-4"
  });
  const result = await refused.result;
  assert.equal(result.status, 409);
  assert.ok(result.body.error.includes("roger"), "The refusal must name whose text would be replaced.");
  assert.equal(refused.store.writes, 0, "A refused regeneration must not queue a run.");

  const allowed = post({
    action: "regenerate_section", accountId: RIVERSIDE, sectionKey: "strongest_sales_angle",
    expectedVersion: profile.version.contentHash, requestId: "req-5", replaceHumanEdits: true
  });
  const ok = await allowed.result;
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "queued");
  const run = allowed.store.snapshot().rcapProfileRuns.find((entry) => entry.id === ok.body.runId);
  assert.equal(run.trigger, "regenerate_section");
  assert.deepEqual(run.sectionKeys, ["strongest_sales_angle"]);
});

checkAsync("keeping a human edit re-stamps its dependencies instead of rewriting the text", async () => {
  const attempt = post({
    action: "keep_human_edit", accountId: RIVERSIDE, sectionKey: "strongest_sales_angle",
    expectedVersion: profile.version.contentHash, requestId: "req-6"
  });
  assert.equal((await attempt.result).status, 200);
  const after = attempt.store.snapshot();
  const section = after.rcapProfileSections.find((entry) => entry.sectionKey === "strongest_sales_angle");
  assert.equal(section.body, "Roger's own wording about assisted use.", "The words must survive.");
  const resolved = buildRcapProspectProfile(after, OWNER, RIVERSIDE, NOW, ON);
  assert.equal(resolved.conflicts.length, 0, "The conflict must be resolved, not merely acknowledged.");
  assert.equal(resolved.sections.find((entry) => entry.key === "strongest_sales_angle").humanEdited, true);
});

checkAsync("editing a section marks it as a human edit and keeps one row", async () => {
  const attempt = post({
    action: "edit_section", accountId: RIVERSIDE, sectionKey: "strategic_verdict",
    body: "Roger's rewrite of the verdict.", expectedVersion: profile.version.contentHash, requestId: "req-7"
  });
  assert.equal((await attempt.result).status, 200);
  const after = attempt.store.snapshot();
  const rows = after.rcapProfileSections.filter((entry) => entry.accountId === RIVERSIDE && entry.sectionKey === "strategic_verdict");
  assert.equal(rows.length, 1, "An edit must update the section, not fork a second one.");
  assert.equal(rows[0].humanEdited, true);
  assert.equal(rows[0].editedBy, "roger");
  assert.equal(rows[0].body, "Roger's rewrite of the verdict.");
});

checkAsync("rejecting a section must say what is wrong with it", async () => {
  const base = { action: "reject_section", accountId: RIVERSIDE, sectionKey: "strategic_verdict", expectedVersion: profile.version.contentHash };
  assert.equal((await post({ ...base, requestId: "req-8" }).result).status, 400);
  const attempt = post({ ...base, requestId: "req-9", reason: "The county count is wrong." });
  assert.equal((await attempt.result).status, 200);
  const section = attempt.store.snapshot().rcapProfileSections.find((entry) => entry.sectionKey === "strategic_verdict" && entry.accountId === RIVERSIDE);
  assert.equal(section.state, "rejected");
  assert.equal(section.rejectionReason, "The county count is wrong.");
});

checkAsync("accepting a correction records the decision and does not touch the account", async () => {
  const correction = profile.corrections.find((entry) => entry.field === "region");
  const attempt = post({
    action: "accept_correction", accountId: RIVERSIDE, correctionId: correction.id,
    expectedVersion: profile.version.contentHash, requestId: "req-10"
  });
  const result = await attempt.result;
  assert.equal(result.status, 200);
  assert.equal(result.body.applied, false);
  assert.ok(result.body.note.includes("separate step and has not happened"));
  const after = attempt.store.snapshot();
  const stored = after.rcapProfileCorrections.find((entry) => entry.id === correction.id);
  assert.equal(stored.state, "accepted");
  assert.equal(stored.applied, false);
  assert.deepEqual(after.outreachOrganizations, state.outreachOrganizations, "The account record must be untouched.");
});

checkAsync("a correction the account has overtaken cannot be accepted at all", async () => {
  const correction = profile.corrections.find((entry) => entry.field === "owner");
  const attempt = post({
    action: "accept_correction", accountId: RIVERSIDE, correctionId: correction.id,
    expectedVersion: profile.version.contentHash, requestId: "req-11"
  });
  const result = await attempt.result;
  assert.equal(result.status, 409);
  assert.ok(result.body.error.includes("changed since this correction was proposed"));
  assert.equal(attempt.store.writes, 0);
});

checkAsync("an action cannot reach across accounts", async () => {
  const prairieSection = state.rcapProfileSections.find((entry) => entry.accountId === PRAIRIE);
  const attempt = post({
    action: "approve_section", accountId: RIVERSIDE, sectionKey: prairieSection.sectionKey,
    expectedVersion: profile.version.contentHash, requestId: "req-12"
  });
  const result = await attempt.result;
  // strategic_verdict exists on both, so the guard that matters is the version scope: only the
  // section belonging to THIS account's current version is touched.
  assert.equal(result.status, 200);
  const after = attempt.store.snapshot();
  const theirs = after.rcapProfileSections.find((entry) => entry.accountId === PRAIRIE);
  assert.equal(theirs.state, "needs_review", "Prairie's section must be untouched by a Riverside action.");
});

// ---------------------------------------------------------------------------------------------

for (const [name, run] of asyncChecks) {
  await run();
  checks.push(name);
}

console.log(`RCAP Wave 2 Packet 7 workspace verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
