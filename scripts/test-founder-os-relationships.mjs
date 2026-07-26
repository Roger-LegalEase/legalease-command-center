// Founder OS Release 3 — the Relationships workspace.
//
// Four promises are proven here, because they are the four the release makes:
//   1. ONE CRM projection over the existing stores: roles attach to a person, and the
//      projection never invents a duplicate person. Where identity is genuinely ambiguous it
//      SAYS SO instead of merging.
//   2. One unified timeline, including the support issues that were missing from it.
//   3. The charter's filters and its six pinned views return the sets they advertise.
//   4. The follow-up and commitment workflow, plus the two founder-set fields — relationship
//      strength and strategic priority — which are never inferred.
//
// Everything is pure: no server, no store, no network. The rollback is asserted the same way
// Release 2's was — with the flag off, the projection emits exactly what it emitted before.

import assert from "node:assert/strict";

import {
  FOUNDER_OS_RELATIONSHIPS_ENV_KEY,
  FOUNDER_OS_RELATIONSHIP_FILTERS,
  FOUNDER_OS_RELATIONSHIP_PRIORITIES,
  FOUNDER_OS_RELATIONSHIP_STRENGTHS,
  FOUNDER_OS_RELATIONSHIP_VIEWS,
  readFounderOsRelationshipsConfig
} from "./ui/founder-os-config.mjs";
import {
  RELATIONSHIP_DETAIL_READ_COLLECTIONS,
  RELATIONSHIP_FOUNDER_OS_DETAIL_READ_COLLECTIONS,
  buildRelationshipDetail,
  buildRelationshipsView,
  executeRelationshipAction
} from "./relationship-service.mjs";

const NOW = "2026-07-26T15:00:00.000Z";
const OWNER = Object.freeze({ authenticated:true, id:"roger", role:"owner", label:"Roger" });
const ON = { founderOs:true };
const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}
const daysAgo = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
const daysAhead = (days) => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();

// ---------------------------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------------------------

check("the flag is off unless the environment says exactly true", () => {
  assert.equal(readFounderOsRelationshipsConfig({}).enabled, false);
  assert.equal(readFounderOsRelationshipsConfig({ [FOUNDER_OS_RELATIONSHIPS_ENV_KEY]:"" }).enabled, false);
  assert.equal(readFounderOsRelationshipsConfig({ [FOUNDER_OS_RELATIONSHIPS_ENV_KEY]:"1" }).enabled, false);
  assert.equal(readFounderOsRelationshipsConfig({ [FOUNDER_OS_RELATIONSHIPS_ENV_KEY]:"TRUE" }).enabled, false);
  assert.equal(readFounderOsRelationshipsConfig({ [FOUNDER_OS_RELATIONSHIPS_ENV_KEY]:"true" }).enabled, true);
});

check("the six pinned views are exactly the charter's six, in charter order", () => {
  assert.deepEqual(FOUNDER_OS_RELATIONSHIP_VIEWS.map((view) => view.label), [
    "All relationships", "Follow-up due", "Waiting on me", "Waiting on them", "Pipeline", "Suppressed"
  ]);
});

// ---------------------------------------------------------------------------------------------
// The fixture — one person wearing three hats, across three different stores.
// ---------------------------------------------------------------------------------------------

const DANA = "dana@example.org";

function baseState(overrides = {}) {
  return {
    partners:[{
      id:"partner-acme",
      name:"Acme Legal Aid",
      domain:"example.org",
      stage:"proposal_sent",
      priority:"high",
      owner:"Roger",
      primaryContactName:"Dana Reyes",
      primaryContactEmail:DANA,
      nextAction:"Send the pilot proposal",
      nextFollowUpAt:daysAgo(2),
      history:[{ id:"hist-1", action:"stage_changed", title:"Stage moved to proposal", at:daysAgo(9) }]
    }],
    // The same human, asserted by three different lanes. The charter requires ONE record
    // carrying three roles — not three records.
    companyContacts:[{
      contact_id:"cc-dana",
      email:DANA,
      name:"Dana Reyes",
      types:["investor", "partner_contact", "funder"],
      links:[{ collection:"partners", itemId:"partner-acme" }]
    }],
    tasks:[{
      id:"task-dana",
      title:"Send the pilot proposal",
      status:"open",
      owner:"Roger",
      dueDate:daysAgo(2),
      relatedEmail:DANA
    }],
    inboxSignals:[{
      id:"signal-commitment",
      kind:"commitment",
      status:"open",
      email:DANA,
      summary:"Promised Dana the pilot pricing sheet",
      dueAt:daysAgo(1),
      occurredAt:daysAgo(4)
    }],
    supportIssues:[{
      id:"support-dana",
      email:DANA,
      subject:"Packet download failed",
      status:"open",
      createdAt:daysAgo(3),
      updatedAt:daysAgo(3)
    }],
    meetingBriefs:[{
      id:"meeting-dana",
      title:"Acme pilot review",
      attendees:[{ email:DANA, organization:"Acme Legal Aid" }],
      startAt:daysAhead(3),
      occurredAt:daysAhead(3)
    }],
    outreachReplies:[{
      id:"reply-dana",
      email:DANA,
      status:"replied",
      occurredAt:daysAgo(6)
    }],
    activityEvents:[],
    auditHistory:[],
    ...overrides
  };
}

function itemsFor(state, query = {}, options = ON) {
  const view = buildRelationshipsView(state, OWNER, NOW, { limit:100, ...query }, options);
  assert.equal(view.available, true, "the projection must be available for the fixture");
  return view;
}

function danaFrom(view) {
  const item = view.items.find((candidate) => candidate.email === DANA
    || String(candidate.name || "").includes("Acme") || String(candidate.name || "").includes("Dana"));
  assert.ok(item, "the fixture relationship must be projected");
  return item;
}

// ---------------------------------------------------------------------------------------------
// 1. One CRM projection — roles on a person, and no duplicate people
// ---------------------------------------------------------------------------------------------

check("one person holding three roles is ONE record carrying three roles", () => {
  const view = itemsFor(baseState());
  const matching = view.items.filter((item) => item.email === DANA);
  assert.equal(matching.length, 1, "the same email must never produce two relationships");
  const roles = danaFrom(view).roles.map((role) => role.key);
  for (const expected of ["partner_contact", "funder", "investor"]) {
    assert.ok(roles.includes(expected), `role ${expected} must be on the one record, got ${roles.join(",")}`);
  }
});

check("roles use the existing CONTACT_TYPES vocabulary and drop anything outside it", () => {
  const state = baseState();
  state.companyContacts[0].types = ["investor", "not_a_real_role"];
  const roles = danaFrom(itemsFor(state)).roles.map((role) => role.key);
  assert.ok(roles.includes("investor"));
  assert.ok(!roles.includes("not_a_real_role"), "an unrecognised type must not be shown as a role");
});

check("the same person reached through two lanes still projects once", () => {
  const state = baseState();
  // A second lane asserting the same human by the same email.
  state.reactivationContacts = [{ contact_id:"react-dana", email:DANA, first_name:"Dana" }];
  const view = itemsFor(state);
  assert.equal(view.items.filter((item) => item.email === DANA).length, 1,
    "two lanes describing one person must not become two people");
});

// ---------------------------------------------------------------------------------------------
// 2. Ambiguity is surfaced, never silently merged
// ---------------------------------------------------------------------------------------------

check("an ambiguous identity match is reported for confirmation and nothing is merged", () => {
  const state = baseState();
  // Two DIFFERENT partner organizations both claim the same contact email. Which
  // relationship the person belongs to is genuinely unknowable from the data.
  state.partners.push({
    id:"partner-beta",
    name:"Beta Justice Center",
    domain:"example.com",
    stage:"qualified",
    primaryContactName:"Dana Reyes",
    primaryContactEmail:DANA
  });
  const view = itemsFor(state);
  const flagged = view.items.filter((item) => item.needsIdentityConfirmation === true);
  assert.ok(flagged.length >= 1, "an ambiguous email match must be surfaced");
  const duplicate = flagged[0].possibleDuplicates[0];
  assert.equal(duplicate.kind, "email");
  assert.equal(duplicate.value, DANA);
  assert.ok(duplicate.relationshipIds.length >= 1, "the collision must name the other record(s)");
  assert.ok(!duplicate.relationshipIds.includes(flagged[0].id), "a record must never be its own duplicate");
  // Both partner relationships still exist in their own right: nothing was merged away.
  assert.ok(view.items.some((item) => String(item.name).includes("Acme")));
  assert.ok(view.items.some((item) => String(item.name).includes("Beta")));
});

check("an unambiguous relationship is not flagged", () => {
  assert.equal(danaFrom(itemsFor(baseState())).needsIdentityConfirmation, false);
});

// ---------------------------------------------------------------------------------------------
// 3. The unified timeline, including support issues
// ---------------------------------------------------------------------------------------------

check("the timeline merges every source the charter names, support issues included", () => {
  const state = baseState();
  const detail = buildRelationshipDetail(state, OWNER, "partner:partner-acme", NOW, ON);
  assert.equal(detail.available, true, "the relationship detail must be available");
  const types = new Set(detail.timeline.map((entry) => entry.type));
  assert.ok(types.has("support"), `support issues must appear in the timeline, got ${[...types].join(",")}`);
  assert.ok(types.has("reply"), "replies must appear in the timeline");
  assert.ok(types.has("stage_change"), "stage changes must appear in the timeline");
  const support = detail.timeline.find((entry) => entry.type === "support");
  assert.equal(support.direction, "inbound", "an open support issue is the customer's move");
  assert.equal(support.href, "#support");
});

check("a resolved support issue reads as our move, not theirs", () => {
  const state = baseState();
  state.supportIssues[0].status = "resolved";
  const detail = buildRelationshipDetail(state, OWNER, "partner:partner-acme", NOW, ON);
  const support = detail.timeline.find((entry) => entry.type === "support");
  assert.equal(support.direction, "outbound");
  assert.match(support.label, /resolved/i);
});

check("the timeline is read-composed, never stored: the projection writes nothing", () => {
  const state = baseState();
  const before = JSON.stringify(state);
  buildRelationshipDetail(state, OWNER, "partner:partner-acme", NOW, ON);
  buildRelationshipsView(state, OWNER, NOW, {}, ON);
  assert.equal(JSON.stringify(state), before, "building a projection must not mutate state");
});

// ---------------------------------------------------------------------------------------------
// 4. Filters and the pinned views
// ---------------------------------------------------------------------------------------------

check("every pinned view and saved filter reports a count and exactly one view is active", () => {
  const view = itemsFor(baseState());
  assert.equal(view.filters.views.length, FOUNDER_OS_RELATIONSHIP_VIEWS.length);
  assert.equal(view.filters.savedFilters.length, FOUNDER_OS_RELATIONSHIP_FILTERS.length);
  for (const entry of [...view.filters.views, ...view.filters.savedFilters]) {
    assert.equal(typeof entry.count, "number", `${entry.id} must report a count`);
  }
  assert.equal(view.filters.views.filter((entry) => entry.active).length, 1,
    "exactly one pinned view is active at a time");
  assert.equal(view.filters.views.find((entry) => entry.active).id, "all",
    "with nothing filtered, All relationships is the active view");
});

check("a pinned view's advertised count is the count it actually returns", () => {
  const state = baseState();
  const unfiltered = itemsFor(state);
  for (const entry of unfiltered.filters.views) {
    const applied = itemsFor(state, entry.query);
    assert.equal(applied.summary.matchingRelationships, entry.count,
      `view ${entry.id} advertised ${entry.count} but returned ${applied.summary.matchingRelationships}`);
    if (entry.id !== "all") {
      assert.equal(applied.filters.views.find((candidate) => candidate.active).id, entry.id,
        `selecting view ${entry.id} must mark it active`);
    }
  }
});

check("a saved filter's advertised count is the count it actually returns", () => {
  const state = baseState();
  for (const entry of itemsFor(state).filters.savedFilters) {
    const applied = itemsFor(state, entry.query);
    assert.equal(applied.summary.matchingRelationships, entry.count,
      `filter ${entry.id} advertised ${entry.count} but returned ${applied.summary.matchingRelationships}`);
  }
});

check("overdue is stricter than follow-up due", () => {
  const state = baseState();
  // Due exactly today: due, but not overdue.
  state.partners[0].nextFollowUpAt = NOW;
  state.tasks[0].dueDate = NOW;
  const due = itemsFor(state, { followUp:"due" }).summary.matchingRelationships;
  const overdue = itemsFor(state, { followUp:"overdue" }).summary.matchingRelationships;
  assert.ok(due >= 1, "a follow-up dated today is due");
  assert.equal(overdue, 0, "a follow-up dated today is not yet overdue");
});

check("no-contact filters accept only 14, 30 and 60 days and count never-contacted as the strongest case", () => {
  const state = baseState();
  const item = danaFrom(itemsFor(state));
  assert.equal(item.daysSinceContact, 3, "last contact is the newest of last inbound and last outbound");
  assert.equal(itemsFor(state, { noContactDays:"14" }).items.some((row) => row.email === DANA), false);
  assert.equal(itemsFor(state, { noContactDays:"99" }).summary.matchingRelationships,
    itemsFor(state).summary.matchingRelationships, "an unsupported window is ignored, not guessed at");
  const quiet = baseState({ outreachReplies:[], inboxSignals:[], supportIssues:[], meetingBriefs:[], activityEvents:[] });
  quiet.partners[0].history = [];
  const never = danaFrom(itemsFor(quiet));
  assert.equal(never.daysSinceContact, null, "no contact at all reports null, not zero");
  assert.ok(itemsFor(quiet, { noContactDays:"60" }).items.some((row) => row.id === never.id),
    "never contacted must match 'no contact in 60 days'");
});

check("meeting booked means a meeting still ahead, not one already held", () => {
  const state = baseState();
  assert.equal(danaFrom(itemsFor(state)).meetingBooked, true);
  state.meetingBriefs[0].startAt = daysAgo(3);
  state.meetingBriefs[0].occurredAt = daysAgo(3);
  assert.equal(danaFrom(itemsFor(state)).meetingBooked, false, "a past meeting is history, not a booking");
});

check("the role filter returns the person under each role they hold", () => {
  const state = baseState();
  for (const role of ["investor", "funder", "partner_contact"]) {
    assert.ok(itemsFor(state, { role }).items.some((item) => item.email === DANA),
      `the role filter must find the person under ${role}`);
  }
  assert.equal(itemsFor(state, { role:"attorney" }).items.some((item) => item.email === DANA), false);
});

check("pipeline is the stages actually in motion", () => {
  const state = baseState();
  assert.ok(itemsFor(state, { pipeline:"active" }).items.some((item) => String(item.name).includes("Acme")),
    "a relationship at proposal is in the pipeline");
  state.partners[0].stage = "closed_lost";
  assert.equal(itemsFor(state, { pipeline:"active" }).items.some((item) => String(item.name).includes("Acme")), false,
    "a closed relationship is not in the pipeline");
});

// ---------------------------------------------------------------------------------------------
// 5. Commitments and the two founder-set fields
// ---------------------------------------------------------------------------------------------

check("open commitments are surfaced on the relationship and overdue ones are marked", () => {
  const item = danaFrom(itemsFor(baseState()));
  assert.equal(item.openCommitmentCount, 1);
  assert.equal(item.openCommitments[0].overdue, true, "a commitment past its date is overdue");
});

check("relationship strength is founder-set and never inferred", () => {
  const item = danaFrom(itemsFor(baseState()));
  assert.equal(item.relationshipStrength.key, "unknown");
  assert.equal(item.relationshipStrength.set, false,
    "an unset strength reports Not set rather than a value derived from activity");
  const state = baseState();
  state.partners[0].relationshipStrength = "strong";
  assert.deepEqual(
    { key:danaFrom(itemsFor(state)).relationshipStrength.key, set:danaFrom(itemsFor(state)).relationshipStrength.set },
    { key:"strong", set:true }
  );
});

check("strategic priority extends the existing partner priority rather than competing with it", () => {
  const inherited = danaFrom(itemsFor(baseState())).strategicPriority;
  assert.equal(inherited.key, "high", "the partner's own priority is honoured");
  assert.equal(inherited.source, "partner");
  const state = baseState();
  state.partners[0].strategicPriority = "critical";
  const explicit = danaFrom(itemsFor(state)).strategicPriority;
  assert.equal(explicit.key, "critical", "an explicit relationship priority wins");
  assert.equal(explicit.source, "relationship");
  const none = baseState();
  delete none.partners[0].priority;
  assert.equal(danaFrom(itemsFor(none)).strategicPriority.key, "unset");
});

check("both fields are writable through the existing action layer, and only to their vocabulary", () => {
  const request = (action, extra) => ({
    action, requestId:"founder-os-release-3-test-request", expectedVersion:"legacy", ...extra
  });
  const strength = executeRelationshipAction(baseState(), OWNER, "partner:partner-acme", NOW,
    request("set_relationship_strength", { strength:"warm" }));
  assert.equal(strength.ok, true, strength.message);
  assert.equal(strength.externalActions, 0, "an internal field change must never act externally");
  assert.equal(strength.state.partners[0].relationshipStrength, "warm");

  const priority = executeRelationshipAction(baseState(), OWNER, "partner:partner-acme", NOW,
    request("set_strategic_priority", { priority:"critical" }));
  assert.equal(priority.ok, true, priority.message);
  assert.equal(priority.state.partners[0].strategicPriority, "critical");

  // Validation failures throw a RelationshipActionError, which the API layer turns into a
  // safe 400. The contract that matters here is that the value is refused and the message
  // says plainly that nothing changed.
  for (const [action, extra] of [
    ["set_relationship_strength", { strength:"glowing" }],
    ["set_strategic_priority", { priority:"urgent" }]
  ]) {
    assert.throws(
      () => executeRelationshipAction(baseState(), OWNER, "partner:partner-acme", NOW, request(action, extra)),
      (error) => error.status === 400 && /No changes were made/.test(error.safeMessage),
      `${action} must reject a value outside its vocabulary`
    );
  }
});

check("the writable vocabularies are exactly the declared ones", () => {
  assert.deepEqual(FOUNDER_OS_RELATIONSHIP_STRENGTHS.map((option) => option.key),
    ["strong", "warm", "cool", "cold", "unknown"]);
  assert.deepEqual(FOUNDER_OS_RELATIONSHIP_PRIORITIES.map((option) => option.key),
    ["critical", "high", "medium", "low", "unset"]);
});

check("the projection never writes and never acts externally", () => {
  const view = buildRelationshipsView(baseState(), OWNER, NOW, {}, ON);
  assert.deepEqual(view.safety, {
    fullStateReturned:false, mutations:0, externalActions:0, sensitiveContentAuthorized:true
  });
});

// ---------------------------------------------------------------------------------------------
// 6. The rollback: with the flag off, nothing from Release 3 is emitted
// ---------------------------------------------------------------------------------------------

const RELEASE_3_FIELDS = [
  "roles", "relationshipStrength", "strategicPriority", "openCommitments", "openCommitmentCount",
  "lastContactAt", "daysSinceContact", "meetingBooked", "replied", "possibleDuplicates",
  "needsIdentityConfirmation"
];

check("with the flag off no Release 3 field appears on any item", () => {
  const off = buildRelationshipsView(baseState(), OWNER, NOW, { limit:100 });
  for (const item of off.items) {
    for (const field of RELEASE_3_FIELDS) {
      assert.equal(Object.hasOwn(item, field), false, `${field} must not be emitted with the flag off`);
    }
  }
  assert.equal(Object.hasOwn(off.filters, "views"), false, "pinned views must not be emitted with the flag off");
  assert.equal(Object.hasOwn(off.filters, "savedFilters"), false);
  assert.equal(Object.hasOwn(off.filters, "roles"), false);
});

check("with the flag off support issues stay out of the timeline and out of the read set", () => {
  const detail = buildRelationshipDetail(baseState(), OWNER, "partner:partner-acme", NOW);
  assert.equal(detail.available, true);
  assert.equal(detail.timeline.some((entry) => entry.type === "support"), false,
    "the rollback must restore the pre-Release-3 timeline exactly, support issues included");
  // And the detail contract must not pay to read a collection it will not render.
  assert.equal(RELATIONSHIP_DETAIL_READ_COLLECTIONS.includes("supportIssues"), false);
  assert.equal(RELATIONSHIP_FOUNDER_OS_DETAIL_READ_COLLECTIONS.includes("supportIssues"), true);
  assert.deepEqual(
    RELATIONSHIP_FOUNDER_OS_DETAIL_READ_COLLECTIONS.filter((name) => name !== "supportIssues"),
    [...RELATIONSHIP_DETAIL_READ_COLLECTIONS],
    "the flag-on detail read set must be the flag-off set plus exactly supportIssues"
  );
});

check("with the flag off the Release 3 filters do not change the result set", () => {
  const plain = buildRelationshipsView(baseState(), OWNER, NOW, { limit:100 });
  for (const query of [{ role:"investor" }, { pipeline:"active" }, { replied:"yes" }, { meeting:"booked" }, { noContactDays:"14" }]) {
    const filtered = buildRelationshipsView(baseState(), OWNER, NOW, { limit:100, ...query });
    assert.equal(filtered.summary.matchingRelationships, plain.summary.matchingRelationships,
      `${JSON.stringify(query)} must be inert with the flag off, not partially applied`);
  }
});

// Turning the flag on adds fields, and changes exactly ONE existing field: last inbound
// contact. That is not a regression, it is the consequence of the charter's tenth timeline
// source — a customer raising a support issue IS inbound contact, and before Release 3 it was
// not counted. It is asserted by name so the change can never happen silently or spread.
const EXPECTED_SHIFTS = ["lastInboundAt"];

check("turning the flag on adds fields and changes only last-inbound, for a stated reason", () => {
  const off = buildRelationshipsView(baseState(), OWNER, NOW, { limit:100 });
  const on = buildRelationshipsView(baseState(), OWNER, NOW, { limit:100 }, ON);
  assert.equal(off.items.length, on.items.length, "the flag must not change which relationships exist");
  for (const [index, item] of off.items.entries()) {
    const ignored = [...RELEASE_3_FIELDS, ...EXPECTED_SHIFTS];
    const strip = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !ignored.includes(key)));
    assert.deepEqual(strip(item), strip(on.items[index]),
      "no field outside the declared additions and last-inbound may change");
  }
});

check("last inbound moves only because a support issue is inbound contact", () => {
  const withIssue = baseState();
  const withoutIssue = baseState({ supportIssues:[] });
  const on = (state) => danaFrom(buildRelationshipsView(state, OWNER, NOW, { limit:100 }, ON));
  const off = (state) => danaFrom(buildRelationshipsView(state, OWNER, NOW, { limit:100 }));

  // The support issue is the newest inbound event, so with the flag on it becomes last inbound.
  assert.equal(on(withIssue).lastInboundAt, withIssue.supportIssues[0].updatedAt);
  // Remove the support issue and the flag makes no difference at all.
  assert.equal(on(withoutIssue).lastInboundAt, off(withoutIssue).lastInboundAt,
    "with no support issue the flag must not move last inbound");
});

console.log(`Founder OS Release 3 relationships: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
