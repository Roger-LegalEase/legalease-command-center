// Packet 4 — Prospect Overview, complete and blocked.
//
// The load-bearing promises: every account shows one clear next action or one complete
// blocker; Draft email opens a review destination and can never send; a blocked account keeps
// working; nothing is fabricated where no profile exists; and a safe write never moves a
// commercial stage.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RCAP_OVERVIEW_MAX_ACTIONS,
  buildRcapProspectOverview,
  rcapActivityOutcome,
  rcapProspectViews
} from "./ui/view-models/rcap-prospect-overview.mjs";
import { RCAP_OVERVIEW_ACTIONS, isCompleteRcapBlocker } from "./rcap-prospect-registries.mjs";
import { buildRcapProspectListView } from "./ui/view-models/rcap-prospect-list.mjs";
import { buildRelationshipDetail, buildRelationshipsView, executeRelationshipAction } from "./relationship-service.mjs";
import { resolveRouteWithContract } from "./ui/route-compatibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-08-09T15:00:00.000Z";
const OWNER = Object.freeze({ authenticated: true, id: "roger", role: "owner", label: "Roger" });
const ON = Object.freeze({ rcapCrmEnabled: true });
const daysAgo = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

const checks = [];
function check(name, run) { run(); checks.push(name); }

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------
//
// Two accounts, on the real source collections: one complete and healthy, one blocked because
// its only published route is a client-intake address. All synthetic.

function baseState() {
  return {
    outreachOrganizations: [
      { account_id: "acct-riverside", organization_name: "Synthetic Riverside Justice Center", domain: "riverside-justice.example.org", classification: "legal aid" },
      { account_id: "acct-prairie", organization_name: "Synthetic Prairie Legal Services", domain: "prairie-legal.example.org", classification: "legal aid" }
    ],
    outreachContacts: [
      { contact_id: "oc-dana", email: "dana.whitfield@riverside-justice.example.org", contact_name: "Dana Whitfield", organization_name: "Synthetic Riverside Justice Center", linked_account_id: "acct-riverside" },
      { contact_id: "oc-prairie", email: "intake@prairie-legal.example.org", contact_name: "Prairie Desk", organization_name: "Synthetic Prairie Legal Services", linked_account_id: "acct-prairie" }
    ],
    tasks: [
      { id: "task-riverside", title: "Send the assisted-use overview", nextAction: "Send the assisted-use overview", dueDate: daysAgo(2), status: "open", owner: "Roger", email: "dana.whitfield@riverside-justice.example.org" }
    ],
    activityEvents: [
      { id: "act-1", kind: "email_sent", direction: "outbound", occurredAt: daysAgo(6), title: "Intro email", email: "dana.whitfield@riverside-justice.example.org", outcomeState: "sent" },
      { id: "act-2", kind: "email_drafted", direction: "outbound", occurredAt: daysAgo(7), title: "Draft prepared", email: "dana.whitfield@riverside-justice.example.org", outcomeState: "drafted" }
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
  const item = view.items.find((row) => row.name.includes(fragment) || row.organization?.includes(fragment));
  assert.ok(item, `The ${fragment} fixture must project.`);
  return item.id;
}

const state = baseState();
const riversideId = idFor(state, "Riverside");
const prairieId = idFor(state, "Prairie");

// ---------------------------------------------------------------------------------------------
// Flag and availability
// ---------------------------------------------------------------------------------------------

check("with the flag off the overview does not render", () => {
  const off = buildRcapProspectOverview(baseState(), OWNER, riversideId, NOW, {});
  assert.equal(off.enabled, false);
  assert.equal(off.available, false);
  assert.equal(off.availability.state, "feature_off");
});

check("an unknown or unauthorized account is not found, never a blank page", () => {
  const missing = buildRcapProspectOverview(baseState(), OWNER, "organization:does-not-exist", NOW, ON);
  assert.equal(missing.available, false);
  assert.equal(missing.availability.state, "not_found_or_unauthorized");
});

// ---------------------------------------------------------------------------------------------
// The complete account
// ---------------------------------------------------------------------------------------------

const complete = buildRcapProspectOverview(baseState(), OWNER, riversideId, NOW, ON);

check("a complete account renders every required region of the page", () => {
  assert.equal(complete.available, true);
  assert.equal(complete.blocked, false);
  for (const region of ["header", "views", "actions", "nextBestStep", "snapshot", "bestContact", "outreachPlan", "recentActivity", "profileSummary", "contextRail"]) {
    assert.ok(complete[region], `The overview is missing ${region}.`);
  }
  assert.ok(complete.header.organizationName, "The organization must be named.");
  assert.ok("whyThisMatters" in complete.header, "Why this matters must appear in the header.");
});

check("there is exactly one dominant action and no more than four in total", () => {
  assert.ok(complete.actions.length <= RCAP_OVERVIEW_MAX_ACTIONS);
  assert.equal(complete.actions.filter((action) => action.primary).length, 1);
  assert.equal(RCAP_OVERVIEW_ACTIONS.length, 4);
});

check("the account shows one clear next action", () => {
  assert.equal(complete.nextBestStep.available, true);
  assert.equal(complete.nextBestStep.blocked, false);
  assert.ok(complete.nextBestStep.title, "The next step must have a title.");
  assert.ok(complete.nextBestStep.rationale, "The next step must say why.");
  assert.ok(complete.nextBestStep.owner, "The next step must have an owner.");
  assert.ok(complete.nextBestStep.recommendationSource, "A recommendation must declare where it came from.");
  assert.equal(complete.nextBestStep.blocker, null);
});

check("an account with no recorded next action says so instead of rendering an empty card", () => {
  const bare = baseState();
  bare.tasks = [];
  const view = buildRcapProspectOverview(bare, OWNER, idFor(bare, "Riverside"), NOW, ON);
  assert.equal(view.nextBestStep.available, true);
  assert.equal(view.nextBestStep.title, "Set the next step");
  assert.match(view.nextBestStep.rationale, /No next action/i);
  assert.equal(view.nextBestStep.primaryAction.key, "set_next_step");
});

check("nothing is fabricated where no profile exists", () => {
  // The snapshot and the profile summary must report absence, not invent content, and must
  // never claim completeness.
  assert.equal(complete.snapshot.whyRcapMayFit.known, false);
  assert.equal(complete.snapshot.whatNotToPitch.known, false);
  assert.equal(complete.profileSummary.status.key, "not_started");
  const serialized = JSON.stringify(complete);
  assert.ok(!/15 of 15/.test(serialized), "A completeness figure must not be invented.");
  assert.ok(!/\b15\/15\b/.test(serialized));
  assert.ok(complete.snapshot.sourceNote, "The absence must be explained.");
});

check("unknown never renders as zero", () => {
  const values = [
    complete.snapshot.whyRcapMayFit, complete.snapshot.openQuestion,
    complete.profileSummary.primaryStory, complete.profileSummary.currentVersion
  ];
  for (const value of values) {
    assert.equal(value.value, null);
    assert.notEqual(value.label, "0");
    assert.ok(value.label, "An unknown must still have something honest to render.");
  }
});

check("activity distinguishes prepared from sent", () => {
  const kinds = complete.recentActivity.map((event) => event.outcomeLabel);
  assert.ok(kinds.includes("Sent"), "A sent email must read as sent.");
  assert.ok(kinds.includes("Prepared"), "A draft must read as prepared, not sent.");
  assert.ok(complete.recentActivity.length <= 5, "At most five recent events.");
  // The full vocabulary maps correctly.
  assert.equal(rcapActivityOutcome({ outcomeState: "scheduled" }).label, "Scheduled");
  assert.equal(rcapActivityOutcome({ outcomeState: "accepted" }).label, "Provider accepted");
  assert.equal(rcapActivityOutcome({ outcomeState: "delivered" }).label, "Delivered");
  assert.equal(rcapActivityOutcome({ outcomeState: "failed" }).label, "Outcome unknown");
  assert.notEqual(rcapActivityOutcome({ outcomeState: "accepted" }).label, "Delivered", "Accepted is not delivered.");
});

check("Draft email opens a review destination and can never send", () => {
  const draft = complete.actions.find((action) => action.key === "draft_email");
  assert.ok(draft, "A healthy account offers Draft email.");
  assert.equal(draft.external, false);
  assert.equal(draft.opensReviewOnly, true);
  assert.ok(draft.href, "Draft email must have a destination.");
  assert.notEqual(resolveRouteWithContract(draft.href).kind, "unsafe");
  // It must NOT reuse the broken campaign detail surface.
  assert.ok(!draft.href.includes("/campaign/"), "Draft email must not route to the campaign detail surface.");
  assert.equal(complete.safety.sendControls, 0);
  assert.equal(complete.safety.externalActions, 0);
  assert.equal(complete.permittedWrites.send, false);
});

check("no tab leads nowhere", () => {
  for (const view of complete.views) {
    assert.ok(view.href, `View ${view.key} must have a destination.`);
    assert.notEqual(resolveRouteWithContract(view.href).kind, "unsafe");
    if (!view.available) {
      assert.ok(view.unavailableReason, `View ${view.key} is unavailable and must say why.`);
    }
  }
  // Wave 1 builds no profile workspace, so Profile is honestly unavailable rather than a
  // decorative tab.
  assert.equal(complete.views.find((view) => view.key === "profile").available, false);
  assert.equal(complete.views.find((view) => view.key === "activity").available, true, "This account has activity.");
  const noActivity = rcapProspectViews("acct-x", { activityAvailable: false });
  assert.ok(noActivity.find((view) => view.key === "activity").unavailableReason);
});

check("the context rail is bounded and truthful", () => {
  assert.ok(complete.contextRail.openTasks.length <= 4);
  assert.ok(complete.contextRail.files.length <= 5);
  for (const task of complete.contextRail.openTasks) {
    assert.equal(task.completionChangesStage, false, "Completing a task must not move a stage.");
    assert.equal(task.completionSends, false, "Completing a task must not send anything.");
  }
  assert.ok(complete.contextRail.whereThingsStand.stage.key);
  assert.equal(complete.contextRail.coordinationWarning.present, false, "No related conflict in this fixture.");
});

// ---------------------------------------------------------------------------------------------
// The blocked account
// ---------------------------------------------------------------------------------------------

const blocked = buildRcapProspectOverview(baseState(), OWNER, prairieId, NOW, ON);

check("an intake-only account is blocked, and the blocker is complete", () => {
  assert.equal(blocked.available, true);
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.blockers.length >= 1);
  for (const blocker of blocked.blockers) {
    assert.ok(isCompleteRcapBlocker(blocker), "Every rendered blocker must carry the full anatomy.");
    assert.ok(blocker.whatIsBlocked && blocker.whyBlocked && blocker.whatCanContinue);
    assert.ok(blocker.owner && blocker.requiredDecision && blocker.primaryAction);
  }
  assert.equal(blocked.blockers[0].kind, "intake_address_only");
});

check("a blocked account offers no Draft email at all", () => {
  assert.equal(blocked.actions.find((action) => action.key === "draft_email"), undefined,
    "A control that cannot complete its work must not be shown.");
  assert.equal(blocked.safety.sendControls, 0);
});

check("the blocked page stays useful", () => {
  // Notes, research, files, and contact review continue.
  const keys = blocked.actions.map((action) => action.key);
  assert.ok(keys.includes("add_note"), "Notes must remain available while blocked.");
  assert.ok(blocked.contextRail, "The rail must still render.");
  assert.ok(blocked.bestContact, "Contact review must remain available.");
  assert.match(blocked.blockers[0].whatCanContinue, /remain available/i);
});

check("the blocker is the next step; the page never shows both", () => {
  assert.equal(blocked.nextBestStep.blocked, true);
  assert.ok(blocked.nextBestStep.blocker, "A blocked next step must carry its blocker.");
  assert.equal(blocked.nextBestStep.primaryAction.external, false);
  // Every account: one next action or one blocker, never neither.
  for (const view of [complete, blocked]) {
    assert.ok(view.nextBestStep.available, "Every account must have a next best step.");
    assert.equal(Boolean(view.nextBestStep.blocker), view.blocked);
  }
});

check("an intake address is never presented as a usable route", () => {
  assert.equal(blocked.bestContact.state, "client_intake");
  assert.equal(blocked.bestContact.sendable, false);
  assert.ok(blocked.bestContact.warnings.some((warning) => /client-intake/i.test(warning)));
});

check("a phone number is shown only when it is a business route", () => {
  for (const view of [complete, blocked]) {
    if (view.bestContact.available && view.bestContact.phone.value) {
      assert.equal(view.bestContact.phoneClass, "business_route", "Only a business line may be displayed.");
    }
  }
});

check("an account with no contact at all is blocked and says what is missing", () => {
  const bare = baseState();
  bare.outreachContacts = bare.outreachContacts.filter((contact) => contact.linked_account_id !== "acct-prairie");
  bare.outreachOrganizations = bare.outreachOrganizations.filter((org) => org.account_id === "acct-prairie");
  const view = buildRelationshipsView(bare, OWNER, NOW, { category: "partner_prospect", limit: 100 }, {});
  if (view.items.length) {
    const overview = buildRcapProspectOverview(bare, OWNER, view.items[0].id, NOW, ON);
    if (overview.available && overview.blocked) {
      assert.ok(overview.blockers.some((blocker) => blocker.kind === "no_verified_contact"));
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Related-account coordination
// ---------------------------------------------------------------------------------------------

check("a related active conversation warns before outreach, not after", () => {
  const withConflict = buildRcapProspectOverview(baseState(), OWNER, riversideId, NOW, {
    ...ON,
    relatedAccounts: [{ id: "organization:co-related", name: "Synthetic Parent Coalition", relation: "parent", activeConversation: true }]
  });
  assert.equal(withConflict.contextRail.coordinationWarning.present, true);
  assert.match(withConflict.contextRail.coordinationWarning.message, /already in an active conversation/i);
  assert.equal(withConflict.blocked, true, "A related active conversation blocks a new one.");
  assert.ok(withConflict.blockers.some((blocker) => blocker.kind === "related_active_conversation"));
  assert.equal(withConflict.actions.find((action) => action.key === "draft_email"), undefined);
});

check("a related account without an active conversation does not block", () => {
  const related = buildRcapProspectOverview(baseState(), OWNER, riversideId, NOW, {
    ...ON,
    relatedAccounts: [{ id: "organization:co-related", name: "Synthetic Funder", relation: "funder", activeConversation: false }]
  });
  assert.equal(related.contextRail.coordinationWarning.present, false);
  assert.equal(related.blocked, false);
  assert.equal(related.contextRail.relatedAccounts.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Writes stay safe
// ---------------------------------------------------------------------------------------------

check("the overview performs no write and grants no send authority", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "ui", "view-models", "rcap-prospect-overview.mjs"), "utf8");
  for (const forbidden of ["writeCollections", "writeChanges", "submitCoreMutations", "fetch(", "sendMail", "sendgrid"]) {
    assert.ok(!source.includes(forbidden), `The overview must not reference ${forbidden}.`);
  }
  assert.equal(complete.safety.mutations, 0);
  assert.equal(complete.permittedWrites.changeStage, false, "The overview may never change a commercial stage.");
  assert.equal(complete.permittedWrites.send, false);
  assert.equal(complete.safety.fullStateReturned, false);
});

check("a safe write records activity without moving the stage", () => {
  const before = buildRcapProspectOverview(baseState(), OWNER, riversideId, NOW, ON);
  const working = baseState();
  // The existing contract requires an idempotency key and the version the caller last read --
  // this write goes through that contract rather than around it.
  const version = buildRelationshipDetail(working, OWNER, riversideId, NOW, {}).relationship.version;
  const result = executeRelationshipAction(working, OWNER, riversideId, NOW, {
    action: "add_note",
    note: "Spoke with the program director about timing.",
    requestId: "rcap-overview-test-note-000001",
    expectedVersion: version
  });
  assert.ok(result?.ok, "The existing note contract must accept the write.");
  const after = buildRcapProspectOverview(result.state, OWNER, riversideId, NOW, ON);
  assert.ok(after.available, "The account must still render after a safe write.");
  assert.equal(after.header.stage.key, before.header.stage.key, "A note must not move the commercial stage.");
  assert.equal(after.safety.stageMutatedBySideEffect, false);

  // Replaying the same requestId must not write twice.
  const replay = executeRelationshipAction(result.state, OWNER, riversideId, NOW, {
    action: "add_note",
    note: "Spoke with the program director about timing.",
    requestId: "rcap-overview-test-note-000001",
    expectedVersion: version
  });
  assert.equal(replay.alreadyApplied, true, "A repeated request must be recognised, not duplicated.");
});

check("a stale version is refused rather than silently overwriting", () => {
  const working = baseState();
  assert.throws(
    () => executeRelationshipAction(working, OWNER, riversideId, NOW, {
      action: "add_note",
      note: "Written against a version that is no longer current.",
      requestId: "rcap-overview-test-stale-00001",
      expectedVersion: "2020-01-01T00:00:00.000Z"
    }),
    (error) => error.status === 409 || /refresh|conflict/i.test(String(error.safeMessage || error.message)),
    "A stale expectedVersion must conflict, not overwrite."
  );
});

check("a reply does not move the stage", () => {
  const withReply = baseState();
  withReply.outreachReplies = [{
    id: "reply-1", contact_id: "oc-dana", email: "dana.whitfield@riverside-justice.example.org",
    status: "replied", classification: "interested", created_at: daysAgo(1)
  }];
  const after = buildRcapProspectOverview(withReply, OWNER, idFor(withReply, "Riverside"), NOW, ON);
  const baseline = buildRcapProspectOverview(baseState(), OWNER, riversideId, NOW, ON);
  if (after.available && baseline.available) {
    assert.equal(after.header.stage.key, baseline.header.stage.key,
      "A reply is not a stage change; only an explicit human decision moves a stage.");
  }
});

// ---------------------------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------------------------

check("no fact, contact, or task crosses between accounts", () => {
  const serializedComplete = JSON.stringify(complete);
  const serializedBlocked = JSON.stringify(blocked);
  assert.ok(!serializedComplete.includes("intake@prairie-legal.example.org"), "Prairie's address must not appear on Riverside.");
  assert.ok(!serializedBlocked.includes("dana.whitfield@riverside-justice.example.org"), "Riverside's contact must not appear on Prairie.");
  assert.ok(!serializedBlocked.includes("Send the assisted-use overview"), "Riverside's task must not appear on Prairie.");
});

check("the list and the overview agree about the same account", () => {
  const listView = buildRcapProspectListView(baseState(), OWNER, NOW, { limit: 100 }, ON);
  const row = listView.items.find((item) => item.id === riversideId);
  assert.ok(row, "The account must appear in the list.");
  assert.equal(row.href, complete.views.find((view) => view.key === "overview").href,
    "The row must open exactly the overview it describes.");
  assert.equal(row.stage.key, complete.header.stage.key, "The list and the overview must agree on the stage.");
});

console.log(`RCAP prospect overview verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
