// Wave 3, Packet 10 — the exact-message Outreach Review.
//
// The contract these tests defend: an approval means something only if it is bound to the exact
// bytes it was given. So most of what follows is about what happens AFTER approval — that a
// material edit revokes it, that a whitespace change does not, and that approving is never the
// same thing as being allowed to send.

import assert from "node:assert/strict";

import {
  RCAP_REVIEW_COLLECTIONS,
  approveRcapMessage,
  buildRcapOutreachReview,
  rcapApprovalInvalidatedBy,
  rcapMaterialHash,
  rcapMessageContentHash
} from "./rcap-outreach-review.mjs";
import { buildRcapOutreachPlan } from "./rcap-outreach-plan.mjs";
import { coreStateCollections } from "./storage.mjs";

const checks = [];
function check(name, run) { run(); checks.push(name); }

const NOW = "2026-08-10T12:00:00.000Z";
const ACCOUNT = "organization:co-riverside";
const ORGANIZATION = "Synthetic Riverside Justice Center";

const CONTACT = Object.freeze({
  id: "c-dana", name: "Dana Whitfield", email: "dana.whitfield@riverside-justice.test",
  role: "operational_champion", eligibility: "direct_public_business", emailable: true
});

const CLAIMS = Object.freeze([
  Object.freeze({ id: "cl-1", factClass: "verified_fact", sourceIds: ["s1"], text: "They run monthly record clearing clinics across three counties." }),
  Object.freeze({ id: "cl-2", factClass: "supported_inference", sourceIds: ["s1"], text: "Attorney review time caps clinic throughput." })
]);

const BODY = [
  "Hello Dana,",
  "",
  "Your monthly record clearing clinics across three counties are capped by attorney review time rather than by demand.",
  "RCAP's assisted-use path handles the review-heavy paperwork so your attorneys spend clinic hours on the cases that need judgement.",
  "",
  "Would a short call in the next two weeks be useful?"
].join("\n");

const PLAN = buildRcapOutreachPlan({
  accountId: ACCOUNT, now: NOW, contacts: [CONTACT],
  phones: [{ number: "+1-555-0100", classKey: "business_route" }],
  angle: "assisted use rather than volume",
  specifics: ["their monthly clinics run across three counties", "attorney review time caps throughput"]
});

const review = (overrides = {}) => buildRcapOutreachReview({
  accountId: ACCOUNT,
  organizationName: ORGANIZATION,
  now: NOW,
  plan: PLAN,
  contact: CONTACT,
  claims: CLAIMS,
  message: { to: CONTACT.email, subject: "Monthly clinics, less attorney review time", body: BODY, attachments: [] },
  whyThisAccount: "They run the clinics this partnership would run through.",
  whyThisContact: "Dana coordinates the clinics and owns the schedule.",
  whyNow: "The next clinic cycle is being planned this month.",
  ...overrides
});

// ---------------------------------------------------------------------------------------------
// Registration and the ready state
// ---------------------------------------------------------------------------------------------

check("the approvals collection is registered with the store", () => {
  for (const collection of RCAP_REVIEW_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(collection), `${collection} must be registered or every approval is silently dropped.`);
  }
});

check("a complete message is ready for review and shows the exact bytes", () => {
  const ready = review();
  assert.equal(ready.blocked, false, `Unexpected blockers: ${ready.blockers.join(" | ")}`);
  assert.equal(ready.state, "ready_for_review");
  assert.equal(ready.message.body, BODY, "The reviewer must read the exact message, not a summary of it.");
  assert.equal(ready.message.to, CONTACT.email);
  assert.ok(ready.contentHash);
  assert.equal(ready.approval.available, true);
});

check("the review answers why this organization, why this person, and why now", () => {
  const ready = review();
  assert.ok(ready.rationale.whyThisAccount);
  assert.ok(ready.rationale.whyThisContact);
  assert.ok(ready.rationale.whyNow);

  const silent = review({ whyNow: "" });
  assert.equal(silent.blocked, true);
  assert.ok(silent.blockers.some((blocker) => blocker.includes("why now")));
});

check("the claims the message actually used are named", () => {
  const ready = review();
  assert.ok(ready.claimsUsed.length >= 1, "A message built on recorded facts must show which ones.");
  assert.ok(ready.claimsUsed.every((claim) => claim.sourceIds.length > 0), "Every cited claim carries its sources.");
});

// ---------------------------------------------------------------------------------------------
// Blocked states
// ---------------------------------------------------------------------------------------------

check("a blocked plan blocks the message inside it", () => {
  const blockedPlan = buildRcapOutreachPlan({ accountId: ACCOUNT, now: NOW, contacts: [CONTACT], suppressed: true });
  const blocked = review({ plan: blockedPlan });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.approval.available, false);
  assert.ok(blocked.approval.reason.includes("cannot be approved"));
});

check("a message to anyone but the first contact the plan named is blocked", () => {
  const other = { ...CONTACT, id: "c-someone-else", email: "someone.else@riverside-justice.test" };
  const blocked = review({ contact: other, message: { to: other.email, subject: "S", body: BODY, attachments: [] } });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.blockers.some((blocker) => blocker.includes("someone other than the first contact")));
});

check("a recipient who is not a usable route is blocked", () => {
  const unusable = { ...CONTACT, emailable: false, blockers: ["The only published address is a client-intake route."] };
  const blocked = review({ contact: unusable });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.blockers.some((blocker) => blocker.includes("client-intake route")));
});

check("an empty recipient, subject or body is blocked, each by name", () => {
  for (const [field, patch] of [
    ["recipient", { to: "" }], ["subject", { subject: "" }], ["body", { body: "   " }]
  ]) {
    const blocked = review({ message: { to: CONTACT.email, subject: "S", body: BODY, attachments: [], ...patch } });
    assert.equal(blocked.blocked, true, `An empty ${field} must block.`);
    assert.ok(blocked.blockers.some((blocker) => blocker.includes(field)), `The blocker must name the ${field}.`);
  }
});

check("a generic message is blocked by the same gate the profile engine uses", () => {
  const generic = review({
    message: {
      to: CONTACT.email, subject: "Partnership",
      body: "Hello, record clearing changes lives and we would love to partner with your organization. Do you have time for a call?",
      attachments: []
    }
  });
  assert.equal(generic.blocked, true);
  assert.ok(generic.blockers.some((blocker) => blocker.includes("would read the same for any organization")));
});

check("an attachment with no reason tying it to this organization is blocked", () => {
  const unjustified = review({
    message: { to: CONTACT.email, subject: "S", body: BODY, attachments: [{ name: "standard deck" }] }
  });
  assert.equal(unjustified.blocked, true);
  assert.ok(unjustified.blockers.some((blocker) => blocker.includes("standard deck")));

  const justified = review({
    message: { to: CONTACT.email, subject: "S", body: BODY, attachments: [{ name: "assisted-use walkthrough", reason: "They asked what assisted use involves." }] }
  });
  assert.equal(justified.blocked, false, `Unexpected blockers: ${justified.blockers.join(" | ")}`);
  assert.equal(justified.attachmentRecommendation.recommended, true);
});

check("nothing attached is a recommendation, not an omission", () => {
  const ready = review();
  assert.equal(ready.attachmentRecommendation.recommended, false);
  assert.ok(ready.attachmentRecommendation.reason.includes("usually right"));
});

// ---------------------------------------------------------------------------------------------
// Thread awareness
// ---------------------------------------------------------------------------------------------

check("a message that would start a second thread over an open one is blocked", () => {
  const thread = { threadId: "thread_abc123" };
  const stray = review({ thread });
  assert.equal(stray.blocked, true);
  assert.equal(stray.threadAware.mode, "new_thread");
  assert.ok(stray.blockers.some((blocker) => blocker.includes("start a second one")));

  const inThread = review({
    thread,
    message: { to: CONTACT.email, subject: "S", body: BODY, attachments: [], inReplyToThreadId: "thread_abc123" }
  });
  assert.equal(inThread.threadAware.mode, "reply_in_thread");
  assert.equal(inThread.blocked, false, `Unexpected blockers: ${inThread.blockers.join(" | ")}`);
});

// ---------------------------------------------------------------------------------------------
// Approval and invalidation — the point of the packet
// ---------------------------------------------------------------------------------------------

check("approval binds to the exact bytes and grants no send authority", () => {
  const ready = review();
  const approval = approveRcapMessage(ready, { approvedBy: "roger", now: NOW });
  assert.equal(approval.contentHash, ready.contentHash);
  assert.equal(approval.approvedBy, "roger");
  assert.equal(approval.grantsSendAuthority, false,
    "Approving says these words are right. It does not say send it.");
  assert.equal(ready.approval.grantsSendAuthority, false);
});

check("a blocked message cannot be approved at all", () => {
  assert.throws(() => approveRcapMessage(review({ whyNow: "" }), { approvedBy: "roger", now: NOW }), /blocked message cannot be approved/);
});

check("an approval must record who granted it and when", () => {
  assert.throws(() => approveRcapMessage(review(), { now: NOW }), /who approved it/);
  assert.throws(() => approveRcapMessage(review(), { approvedBy: "roger" }), /when it was granted/);
});

check("a material edit revokes the approval", () => {
  const ready = review();
  const approval = approveRcapMessage(ready, { approvedBy: "roger", now: NOW });

  for (const [what, edited] of [
    ["the body", { ...ready.message, body: `${BODY} One more sentence nobody approved.` }],
    ["the subject", { ...ready.message, subject: "Something else entirely" }],
    ["the recipient", { ...ready.message, to: "someone.else@riverside-justice.test" }],
    ["an attachment", { ...ready.message, attachments: [{ name: "standard deck" }] }]
  ]) {
    const verdict = rcapApprovalInvalidatedBy(approval, edited);
    assert.equal(verdict.invalidated, true, `Changing ${what} must revoke the approval.`);
    assert.ok(verdict.reason.includes("covered different words"));
  }
});

check("a whitespace-only change does not revoke it", () => {
  const ready = review();
  const approval = approveRcapMessage(ready, { approvedBy: "roger", now: NOW });
  const respaced = { ...ready.message, body: `${BODY}\n` };

  const verdict = rcapApprovalInvalidatedBy(approval, respaced);
  assert.equal(verdict.invalidated, false,
    "Forcing re-approval for a trailing newline teaches people to approve without reading.");
  assert.equal(verdict.cosmeticChange, true);
  assert.notEqual(rcapMessageContentHash(respaced), approval.contentHash, "The exact hash still moved...");
  assert.equal(rcapMaterialHash(respaced), approval.materialHash, "...but the material hash did not.");
});

check("an unchanged message stays approved", () => {
  const ready = review();
  const approval = approveRcapMessage(ready, { approvedBy: "roger", now: NOW });
  const verdict = rcapApprovalInvalidatedBy(approval, ready.message);
  assert.equal(verdict.invalidated, false);
  assert.equal(verdict.cosmeticChange, false);
  assert.equal(verdict.reason, "");
});

check("the recipient participates in the hash", () => {
  const base = { to: "a@example.test", subject: "S", body: "B", attachments: [] };
  assert.notEqual(rcapMessageContentHash(base), rcapMessageContentHash({ ...base, to: "b@example.test" }),
    "Changing who it goes to is as material as changing what it says.");
});

check("the review itself can neither send nor schedule", () => {
  const ready = review();
  assert.equal(ready.safety.externalActions, 0);
  assert.equal(ready.safety.sendControls, 0);
  assert.equal(ready.safety.scheduled, 0);
});

console.log(`RCAP Wave 3 Packet 10 outreach review verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
