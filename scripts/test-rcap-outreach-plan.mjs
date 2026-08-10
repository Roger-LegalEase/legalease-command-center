// Wave 3, Packet 9 — contact strategy and the Outreach Plan.
//
// Almost every test here is a refusal. The plan's value is not that it produces four steps; it
// is that it declines to produce them when the facts do not support them, and says which rule
// stopped it.

import assert from "node:assert/strict";

import {
  RCAP_MAX_TOUCHES,
  RCAP_PLAN_COLLECTIONS,
  RCAP_STOP_RULES,
  buildRcapContactLadder,
  buildRcapOutreachPlan,
  rcapActiveStopRules,
  rcapAddressIsGuessed,
  rcapCallRouteFor,
  rcapExistingThread,
  rcapPlanInvalidatedBy
} from "./rcap-outreach-plan.mjs";
import { coreStateCollections } from "./storage.mjs";

const checks = [];
function check(name, run) { run(); checks.push(name); }

const NOW = "2026-08-10T12:00:00.000Z";
const ACCOUNT = "organization:co-riverside";

const COORDINATOR = Object.freeze({
  id: "c-dana", name: "Dana Whitfield", title: "Clinic coordinator", email: "dana.whitfield@riverside-justice.test",
  role: "operational_champion", eligibility: "direct_public_business"
});
const DIRECTOR = Object.freeze({
  id: "c-lee", name: "Lee Okafor", title: "Executive director", email: "lee.okafor@riverside-justice.test",
  role: "executive_sponsor", eligibility: "direct_public_business"
});
const INTAKE = Object.freeze({
  id: "c-intake", name: "Prairie Desk", email: "intake@prairie-legal.test",
  role: "shared_org_route", eligibility: "client_intake"
});

const basePlan = (overrides = {}) => buildRcapOutreachPlan({
  accountId: ACCOUNT,
  now: NOW,
  contacts: [COORDINATOR, DIRECTOR],
  phones: [{ number: "+1-555-0100", classKey: "business_route" }],
  timeline: [],
  angle: "assisted use rather than volume",
  specifics: ["their monthly clinics run across three counties", "attorney review time caps throughput"],
  ...overrides
});

// ---------------------------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------------------------

check("the plan collection is registered with the store", () => {
  for (const collection of RCAP_PLAN_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(collection), `${collection} must be registered or every write is silently dropped.`);
  }
});

// ---------------------------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------------------------

check("the ladder ranks by role and names one first contact, not several", () => {
  const ladder = buildRcapContactLadder([DIRECTOR, COORDINATOR]);
  assert.equal(ladder.rungs[0].name, "Dana Whitfield", "The operational champion outranks the executive sponsor.");
  assert.equal(ladder.firstContact.id, "c-dana");
  assert.ok(ladder.firstContactReason.includes("Dana Whitfield"));
  // Rule 8: the rest are a fallback order, not a list to approach in parallel.
  assert.equal(typeof ladder.firstContact, "object");
  assert.ok(!Array.isArray(ladder.firstContact));
});

check("escalation over the first contact is never automatic", () => {
  const ladder = buildRcapContactLadder([COORDINATOR, DIRECTOR]);
  assert.equal(ladder.escalation.automatic, false);
  assert.ok(ladder.escalation.reason.includes("a person makes"));
});

check("a guessed address is not a route, however plausible", () => {
  assert.equal(rcapAddressIsGuessed({ source: "derived from the usual pattern" }), true);
  assert.equal(rcapAddressIsGuessed({ guessed: true }), true);
  assert.equal(rcapAddressIsGuessed({ source: "published on the clinic page" }), false);

  const ladder = buildRcapContactLadder([{ ...COORDINATOR, guessed: true }]);
  assert.equal(ladder.firstContact, null);
  assert.ok(ladder.rungs[0].blockers.some((blocker) => blocker.includes("inferred rather than published")));
  assert.equal(ladder.blocked, true);
});

check("a client-intake address is not a partnership route", () => {
  const ladder = buildRcapContactLadder([INTAKE]);
  assert.equal(ladder.firstContact, null);
  assert.ok(ladder.rungs[0].blockers.length > 0);
  assert.equal(ladder.rungs[0].eligibilityLabel, "Client-intake route");
});

check("an unverified address is not usable until it is verified", () => {
  const ladder = buildRcapContactLadder([{ ...COORDINATOR, eligibility: "" }]);
  assert.equal(ladder.firstContact, null, "An address with no recorded provenance is not a route.");
});

check("no contacts at all is a different sentence from no usable contact", () => {
  assert.equal(buildRcapContactLadder([]).blockedReason, "No contact has been found for this organization yet.");
  assert.equal(buildRcapContactLadder([INTAKE]).blockedReason, "No contact on record has a usable published address.");
});

// ---------------------------------------------------------------------------------------------
// Phone eligibility — rule 7
// ---------------------------------------------------------------------------------------------

check("a client-intake line is never a sales route, and neither is a switchboard", () => {
  const intakeOnly = rcapCallRouteFor([{ number: "+1-555-0199", classKey: "client_intake" }]);
  assert.equal(intakeOnly.available, false);
  assert.ok(intakeOnly.reason.includes("client-intake line"));

  // The refusal must name the class that is actually on record, not report every unusable
  // number as an intake line -- that would be a fabricated fact about the organization.
  const switchboard = rcapCallRouteFor([{ number: "+1-555-0111", classKey: "main_switchboard" }]);
  assert.equal(switchboard.available, false);
  assert.ok(switchboard.reason.includes("main switchboard"), switchboard.reason);

  const business = rcapCallRouteFor([{ number: "+1-555-0100", classKey: "business_route" }]);
  assert.equal(business.available, true);
  assert.equal(business.number, "+1-555-0100");

  const none = rcapCallRouteFor([]);
  assert.equal(none.available, false);
  assert.ok(none.reason.includes("No business line"));
});

// ---------------------------------------------------------------------------------------------
// The sequence
// ---------------------------------------------------------------------------------------------

check("a plan never exceeds four touches, and every touch says why it exists", () => {
  const plan = basePlan();
  assert.ok(plan.touches.length > 0);
  assert.ok(plan.touches.length <= RCAP_MAX_TOUCHES);
  assert.equal(plan.touchCeiling, 4);
  for (const touch of plan.touches) {
    assert.ok(touch.purpose, `Touch ${touch.number} must carry its own reason.`);
    assert.equal(touch.sendAuthority, false, "No touch carries send authority.");
  }
  assert.deepEqual(plan.touches.map((touch) => touch.number), plan.touches.map((_, index) => index + 1));
});

check("a follow-up with nothing to add is not generated at all", () => {
  // Rule 11. With no distinct specifics, the plan stops at the opening message rather than
  // padding itself to four steps that only say they are following up.
  const thin = basePlan({ specifics: [], phones: [] });
  assert.equal(thin.touches.length, 1);
  assert.ok(thin.touches[0].purpose);

  const one = basePlan({ specifics: ["their monthly clinics run across three counties"], phones: [] });
  assert.equal(one.touches.length, 2);
});

check("a call step is a task for a person, never something the system claims it will do", () => {
  const plan = basePlan();
  const call = plan.touches.find((touch) => touch.kind === "call");
  assert.ok(call, "A business line on record earns a call step.");
  assert.equal(call.manual, true);
  assert.equal(plan.manualTasks.length, 1);
  assert.equal(plan.manualTasks[0].route, "+1-555-0100");
  assert.ok(plan.manualTasks[0].title.includes("Dana Whitfield"));

  const noPhone = basePlan({ phones: [{ number: "+1-555-0199", classKey: "client_intake" }] });
  assert.ok(!noPhone.touches.some((touch) => touch.kind === "call"), "An intake-only number earns no call step.");
  assert.equal(noPhone.manualTasks.length, 0);
});

check("a plan proposes and holds no authority of any kind", () => {
  const plan = basePlan();
  assert.equal(plan.safety.externalActions, 0);
  assert.equal(plan.safety.sendControls, 0);
  assert.equal(plan.safety.scheduled, 0);
  assert.equal(plan.state, "needs_review", "A built plan waits for a person; it does not arrive approved.");
});

// ---------------------------------------------------------------------------------------------
// Stop rules
// ---------------------------------------------------------------------------------------------

check("every stop rule states what it is and why it stops things", () => {
  for (const rule of RCAP_STOP_RULES) {
    assert.ok(rule.label && rule.detail, `${rule.key} must state itself.`);
  }
});

check("a reply stops the sequence and does not move the stage", () => {
  const active = rcapActiveStopRules({ timeline: [{ direction: "inbound", title: "Dana replied", outcomeState: "received" }] });
  assert.deepEqual(active.map((rule) => rule.key), ["reply_received"]);
  assert.ok(active[0].detail.includes("never advances the stage"));

  const plan = basePlan({ timeline: [{ direction: "inbound", title: "Dana replied", outcomeState: "received" }] });
  assert.equal(plan.blocked, true);
  assert.equal(plan.state, "blocked");
  assert.equal(plan.touches.length, 0, "A blocked plan proposes no touches at all.");
  assert.ok(plan.blockedReason.includes("They replied"));
});

check("suppression, do-not-contact, unsubscribe and a bounce each stop it", () => {
  for (const [input, key] of [
    [{ suppressed: true }, "suppressed"],
    [{ doNotContact: true }, "do_not_contact"],
    [{ unsubscribed: true }, "unsubscribed"],
    [{ bounced: true }, "bounced"]
  ]) {
    const active = rcapActiveStopRules(input);
    assert.ok(active.some((rule) => rule.key === key), `${key} must stop the sequence.`);
    assert.equal(buildRcapOutreachPlan({ accountId: ACCOUNT, now: NOW, contacts: [COORDINATOR], ...input }).blocked, true);
  }
});

check("four completed touches is the end, not a reason to start again", () => {
  const active = rcapActiveStopRules({ completedTouches: 4 });
  assert.ok(active.some((rule) => rule.key === "sequence_complete"));
  assert.ok(active.find((rule) => rule.key === "sequence_complete").detail.includes("new decision"));
});

check("a stop rule is reported once even when several events prove it", () => {
  const active = rcapActiveStopRules({
    timeline: [
      { direction: "inbound", title: "First reply" },
      { direction: "inbound", title: "Second reply" }
    ]
  });
  assert.equal(active.filter((rule) => rule.key === "reply_received").length, 1);
});

// ---------------------------------------------------------------------------------------------
// Existing threads
// ---------------------------------------------------------------------------------------------

check("an open thread defers the plan rather than talking over it", () => {
  const timeline = [{ email: "dana.whitfield@riverside-justice.test", threadId: "thread_abc123", occurredAt: NOW }];
  const thread = rcapExistingThread(timeline, COORDINATOR);
  assert.equal(thread.threadId, "thread_abc123");

  const plan = basePlan({ timeline });
  assert.equal(plan.blocked, true);
  assert.ok(plan.blockedReason.includes("talk over it"));
  assert.equal(plan.touches.length, 0);

  assert.equal(rcapExistingThread([{ email: "someone.else@riverside-justice.test", threadId: "t" }], COORDINATOR), null);
  assert.equal(rcapExistingThread(timeline, { email: "" }), null);
});

// ---------------------------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------------------------

check("an approval does not survive the facts it was approved against", () => {
  const plan = basePlan();
  assert.equal(rcapPlanInvalidatedBy(plan, {}).invalidated, false);

  const contactMoved = rcapPlanInvalidatedBy(plan, { firstContactId: "c-someone-else" });
  assert.equal(contactMoved.invalidated, true);
  assert.ok(contactMoved.reasons[0].includes("first contact changed"));

  const claimsMoved = rcapPlanInvalidatedBy(plan, { claimsHash: "different" });
  assert.equal(claimsMoved.invalidated, true);
  assert.ok(claimsMoved.reasons[0].includes("claims"));

  const stopped = rcapPlanInvalidatedBy(plan, { stopRules: [{ label: "They replied", detail: "A person takes it from here." }] });
  assert.equal(stopped.invalidated, true);
  assert.ok(stopped.reasons[0].includes("They replied"));
});

// ---------------------------------------------------------------------------------------------
// Determinism and cross-account safety
// ---------------------------------------------------------------------------------------------

check("the same inputs build the same plan twice", () => {
  assert.equal(basePlan().id, basePlan().id);
  assert.equal(basePlan().claimsHash, basePlan().claimsHash);
  assert.notEqual(basePlan().claimsHash, basePlan({ angle: "volume" }).claimsHash);
});

check("a plan carries the account it belongs to and nothing else", () => {
  const plan = basePlan();
  assert.equal(plan.accountId, ACCOUNT);
  assert.ok(plan.id.startsWith("rplan_"));
  const other = buildRcapOutreachPlan({ accountId: "organization:co-other", now: NOW, contacts: [COORDINATOR], angle: "assisted use rather than volume", specifics: [] });
  assert.notEqual(plan.id, other.id, "Two accounts must never share a plan id.");
});

console.log(`RCAP Wave 3 Packet 9 outreach plan verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
