#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyRcapApprovalDecision,
  evaluateRcapApproval,
  generateRcapRevenueQueueTasks
} from "./rcap-revenue-os.mjs";

const rcapSource = readFileSync(join(process.cwd(), "scripts", "rcap-revenue-os.mjs"), "utf8");
const previewServer = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

function baseAccount(patch = {}) {
  return {
    account_id: "A-APPROVAL",
    source_prospect_id: "P-APPROVAL",
    organization_name: "Approval Matrix Legal Aid",
    segment: "A2",
    rcap_campaign_segment: "A2",
    priority_tier: "Tier 2",
    priority_score: 74,
    account_status: "Engaged",
    rcap_cobranded_page_status: "Generic Page",
    source_import_id: "approval-import",
    ...patch
  };
}

function baseContact(patch = {}) {
  return {
    contact_id: "C-APPROVAL",
    linked_account_id: "A-APPROVAL",
    contact_name: "Jordan Program Manager",
    title: "Program Manager",
    decision_role: "Program Manager",
    public_email: "jordan@example.com",
    segment: "A2",
    source_confidence: "High",
    suppression_status: "Active",
    bounced: false,
    unsubscribed: false,
    email_status: "Verified",
    sequence_status: "Not Enrolled",
    source_import_id: "approval-import",
    ...patch
  };
}

function baseAction(patch = {}) {
  return {
    action_id: "approval-action",
    page_type: "generic",
    page_label: "Generic RCAP page",
    body: "Plain operational first touch about RCAP workflow fit.",
    sensitive_claim: false,
    clinic_date: "",
    pricing: "",
    ...patch
  };
}

const suppressionVariants = [
  ["unsubscribed true", { unsubscribed: true }, "unsubscribed"],
  ["bounced true", { bounced: true }, "bounced"],
  ["status Unsubscribed", { suppression_status: "Unsubscribed" }, "suppression_status"],
  ["status Bounced", { suppression_status: "Bounced" }, "suppression_status"],
  ["status Suppressed", { suppression_status: "Suppressed" }, "suppression_status"],
  ["status Do Not Contact", { suppression_status: "Do Not Contact" }, "suppression_status"],
  ["status unsubscribed", { suppression_status: "unsubscribed" }, "suppression_status"],
  ["status bounced", { suppression_status: "bounced" }, "suppression_status"],
  ["status suppressed", { suppression_status: "suppressed" }, "suppression_status"],
  ["status do not contact", { suppression_status: "do not contact" }, "suppression_status"],
  ["status padded Do Not Contact", { suppression_status: " Do Not Contact " }, "suppression_status"],
  ["status uppercase DO NOT CONTACT", { suppression_status: "DO NOT CONTACT" }, "suppression_status"],
  ["active plus unsubscribed true", { suppression_status: "Active", unsubscribed: true }, "unsubscribed"],
  ["active plus bounced true", { suppression_status: "Active", bounced: true }, "bounced"],
  ["active plus unsubscribed true bounced false", { suppression_status: "Active", unsubscribed: true, bounced: false }, "unsubscribed"],
  ["active plus unsubscribed false bounced true", { suppression_status: "Active", unsubscribed: false, bounced: true }, "bounced"],
  ["verified plus unsubscribed true", { suppression_status: "Verified", unsubscribed: true }, "unsubscribed"],
  ["verified plus bounced true", { suppression_status: "Verified", bounced: true }, "bounced"]
];

for (const [label, patch, expectedReason] of suppressionVariants) {
  const result = evaluateRcapApproval(baseAccount(), baseContact(patch), baseAction());
  assert.equal(result.status, "blocked_suppressed", `${label}: suppression must outrank approval.`);
  assert.notEqual(result.status, "needs_human_approval", `${label}: suppressed contact must not be needs_human_approval.`);
  assert.notEqual(result.status, "auto_ready", `${label}: suppressed contact must not be auto_ready.`);
  assert(result.suppressionReasons.includes(expectedReason), `${label}: suppression reason should include ${expectedReason}.`);

  for (const decision of ["approve", "reapprove", "override", "escalate"]) {
    const approved = applyRcapApprovalDecision(baseAccount(), baseContact(patch), baseAction(), { decision });
    assert.equal(approved.ok, false, `${label}: ${decision} must not approve a suppressed contact.`);
    assert.equal(approved.status, "blocked_suppressed", `${label}: ${decision} must stay blocked_suppressed.`);
    assert.equal(approved.readyState, "Blocked - Suppressed", `${label}: ${decision} must not set Ready to Enroll.`);
    assert.equal(approved.readyToEnroll, false, `${label}: ${decision} must not make contact ready.`);
    assert.deepEqual(approved.externalActionsTriggered, [], `${label}: ${decision} must not trigger external actions.`);
  }
}

const mustApproveCases = [
  ["Tier 1 account", baseAccount({ priority_tier: "Tier 1", priority_score: 96 }), baseContact(), baseAction(), "tier_1_account"],
  ["executive director title", baseAccount(), baseContact({ title: "Executive Director", decision_role: "Program" }), baseAction(), "executive_director_contact"],
  ["CEO title", baseAccount(), baseContact({ title: "CEO", decision_role: "Program" }), baseAction(), "ceo_contact"],
  ["board chair title", baseAccount(), baseContact({ title: "Board Chair", decision_role: "Program" }), baseAction(), "board_chair_contact"],
  ["funder role/title", baseAccount(), baseContact({ title: "Foundation Funder", decision_role: "Funder" }), baseAction(), "funder_contact"],
  ["Medium source confidence", baseAccount(), baseContact({ source_confidence: "Medium" }), baseAction(), "medium_source_confidence"],
  ["Low source confidence", baseAccount(), baseContact({ source_confidence: "Low" }), baseAction(), "low_source_confidence"],
  ["no public email", baseAccount(), baseContact({ public_email: "" }), baseAction(), "missing_public_email"],
  ["co-branded page", baseAccount({ rcap_cobranded_page_status: "Co-Branded Page" }), baseContact(), baseAction({ page_type: "co-branded" }), "co_branded_page"],
  ["clinic-date reference", baseAccount(), baseContact(), baseAction({ clinic_date: "2026-07-04" }), "clinic_date_reference"],
  ["pricing reference", baseAccount(), baseContact(), baseAction({ pricing: "$500 pilot" }), "pricing_reference"]
];

for (const [label, account, contact, action, expectedReason] of mustApproveCases) {
  const result = evaluateRcapApproval(account, contact, action);
  assert.equal(result.status, "needs_human_approval", `${label}: must require human approval.`);
  assert.notEqual(result.status, "auto_ready", `${label}: must not auto-ready.`);
  assert(result.mustApproveReasons.includes(expectedReason), `${label}: must include ${expectedReason}.`);
}

const missingAllowlistCases = [
  ["email not verified", baseAccount(), baseContact({ email_status: "Not Verified" }), baseAction(), "email_not_verified"],
  ["missing clear segment", baseAccount({ segment: "", rcap_campaign_segment: "" }), baseContact({ segment: "" }), baseAction(), "missing_clear_segment"],
  ["generic page missing", baseAccount({ rcap_cobranded_page_status: "" }), baseContact(), baseAction({ page_type: "", page_label: "" }), "generic_page_required"],
  ["sensitive claim present", baseAccount(), baseContact(), baseAction({ sensitive_claim: true }), "sensitive_claim_present"],
  ["missing confidence", baseAccount(), baseContact({ source_confidence: "" }), baseAction(), "missing_source_confidence"],
  ["null confidence", baseAccount(), baseContact({ source_confidence: null }), baseAction(), "missing_source_confidence"],
  ["unknown confidence", baseAccount(), baseContact({ source_confidence: "Unknown" }), baseAction(), "unknown_source_confidence"],
  ["malformed confidence", baseAccount(), baseContact({ source_confidence: "Maybe" }), baseAction(), "unknown_source_confidence"]
];

for (const [label, account, contact, action, expectedReason] of missingAllowlistCases) {
  const result = evaluateRcapApproval(account, contact, action);
  assert.equal(result.status, "needs_human_approval", `${label}: missing allowlist condition must not auto-ready.`);
  assert.equal(result.mustApproveReasons.length, 0, `${label}: fixture should avoid must-approve reasons.`);
  assert(result.missingAllowlistReasons.includes(expectedReason), `${label}: must include ${expectedReason}.`);
}

const autoReady = evaluateRcapApproval(baseAccount(), baseContact(), baseAction());
assert.equal(autoReady.status, "auto_ready", "Only the exhaustive allowlist fixture may auto-ready.");
assert.deepEqual(autoReady.mustApproveReasons, [], "Auto-ready must have no must-approve reasons.");
assert.deepEqual(autoReady.missingAllowlistReasons, [], "Auto-ready must have no missing allowlist reasons.");
assert.deepEqual(autoReady.suppressionReasons, [], "Auto-ready must have no suppression reasons.");

const hardenedTitleCases = [
  ["ED", baseContact({ title: "ED" }), "executive_director_contact"],
  ["E.D.", baseContact({ title: "E.D." }), "executive_director_contact"],
  ["Chief Executive Officer", baseContact({ title: "Chief Executive Officer" }), "ceo_contact"],
  ["Founder / CEO", baseContact({ title: "Founder / CEO" }), "ceo_contact"],
  ["Board President", baseContact({ title: "Board President" }), "board_chair_contact"],
  ["Program Officer at foundation", baseContact({ title: "Program Officer", decision_role: "Foundation funder" }), "funder_contact"],
  ["Senior Partnerships Lead", baseContact({ title: "Senior Partnerships Lead" }), "senior_ambiguous_contact"]
];
for (const [label, contact, expectedReason] of hardenedTitleCases) {
  const result = evaluateRcapApproval(baseAccount(), contact, baseAction());
  assert.equal(result.status, "needs_human_approval", `${label}: hardened senior/funder title must not auto-ready.`);
  assert(result.mustApproveReasons.includes(expectedReason), `${label}: must include ${expectedReason}.`);
}
const edFalsePositive = evaluateRcapApproval(baseAccount(), baseContact({ title: "Education Coordinator", decision_role: "Program Manager" }), baseAction());
assert.equal(edFalsePositive.status, "auto_ready", "Words containing ed must not trigger executive-director detection by substring.");

const hardenedPricingCases = [
  ["$500", baseAction({ body: "Pilot is $500." })],
  ["pricing", baseAction({ body: "Pricing can be discussed." })],
  ["fee", baseAction({ body: "There is a setup fee." })],
  ["paid pilot", baseAction({ body: "This is a paid pilot." })],
  ["pilot investment of five hundred dollars", baseAction({ body: "Pilot investment of five hundred dollars." })],
  ["program budget", baseAction({ body: "Program budget should be reviewed." })],
  ["per participant", baseAction({ body: "Cost is calculated per participant." })],
  ["ambiguous pricing phrase", baseAction({ body: "We can talk about investment and payment options later." })]
];
for (const [label, action] of hardenedPricingCases) {
  const result = evaluateRcapApproval(baseAccount(), baseContact(), action);
  assert.equal(result.status, "needs_human_approval", `${label}: pricing language must not auto-ready.`);
  assert(result.mustApproveReasons.includes("pricing_reference"), `${label}: must include pricing_reference.`);
}

const hardenedClinicCases = [
  ["explicit clinic_date", baseAction({ clinic_date: "2026-06-20" })],
  ["clinic next Friday", baseAction({ body: "Invite them before the clinic next Friday." })],
  ["upcoming clinic on June 20", baseAction({ body: "Upcoming clinic on June 20 needs a partner." })],
  ["expungement clinic 6/20", baseAction({ body: "Expungement clinic 6/20 has open slots." })],
  ["record relief clinic next month", baseAction({ body: "Record relief clinic next month needs support." })],
  ["ambiguous clinic-date phrase", baseAction({ body: "Mention the workshop date once confirmed." })]
];
for (const [label, action] of hardenedClinicCases) {
  const result = evaluateRcapApproval(baseAccount(), baseContact(), action);
  assert.equal(result.status, "needs_human_approval", `${label}: clinic/date language must not auto-ready.`);
  assert(result.mustApproveReasons.includes("clinic_date_reference"), `${label}: must include clinic_date_reference.`);
}

const approvedNeedsHuman = applyRcapApprovalDecision(
  baseAccount({ priority_tier: "Tier 1", priority_score: 97 }),
  baseContact(),
  baseAction(),
  { decision: "approve", approvedBy: "owner" }
);
assert.equal(approvedNeedsHuman.ok, true, "Human-approved non-suppressed contact can become internally ready.");
assert.equal(approvedNeedsHuman.status, "ready_to_enroll", "Human approval produces the internal ready state only.");
assert.equal(approvedNeedsHuman.readyState, "Ready to Enroll", "Human approval sets internal Ready to Enroll.");
assert.equal(approvedNeedsHuman.internalOnly, true, "Human approval result must be internal only.");
assert.deepEqual(approvedNeedsHuman.externalActionsTriggered, [], "Human approval must not trigger external actions.");

const approvedAutoReady = applyRcapApprovalDecision(baseAccount(), baseContact(), baseAction(), { decision: "auto_ready" });
assert.equal(approvedAutoReady.ok, true, "Auto-ready fixture can become internally ready.");
assert.equal(approvedAutoReady.status, "ready_to_enroll", "Auto-ready produces the internal ready state only.");
assert.equal(approvedAutoReady.readyState, "Ready to Enroll", "Auto-ready sets internal Ready to Enroll.");
assert.equal(approvedAutoReady.internalOnly, true, "Auto-ready result must be internal only.");
assert.deepEqual(approvedAutoReady.externalActionsTriggered, [], "Auto-ready must not trigger external actions.");

const generated = generateRcapRevenueQueueTasks({
  rcapRevenueAccounts: [baseAccount({ priority_tier: "Tier 1", priority_score: 98 })],
  rcapRevenueContacts: [baseContact({ title: "CEO", decision_role: "CEO" })],
  rcapRevenueDealSeeds: [],
  rcapRevenueImportBatches: [],
  rcapRevenueQueueTasks: []
}, { now: "2026-06-11T13:00:00.000Z", owner: "owner" });
const approvalTask = generated.created.find(task => task.task_type === "RCAP Outreach Approval");
assert(approvalTask, "Needs-human-approval contact should surface as an internal RCAP Outreach Approval task.");
assert.equal(approvalTask.safe_action_type, "internal_outreach_approval_review", "Approval task must remain internal review only.");
assert(!/send|sent|gmail|calendar|sms|call|publish|post now/i.test([approvalTask.status, approvalTask.reason, approvalTask.safe_action_type].join(" ")), "Approval task must not contain external-action language.");

for (const forbiddenFunction of [
  "sendRcapEmail",
  "createGmailDraft",
  "sendGmail",
  "writeGoogleCalendar",
  "sendRcapSms",
  "placeRcapCall",
  "startSequence",
  "enrollContact"
]) {
  const declarationPattern = new RegExp(`(?:function|const|let|var|export function)\\s+${forbiddenFunction}\\b`);
  assert(!declarationPattern.test(rcapSource), `RCAP approval engine must not define ${forbiddenFunction}.`);
}
for (const forbiddenCall of [
  "gmail.users.messages.send",
  "calendar.events.insert",
  "twilio.messages.create",
  "fetch("
]) {
  assert(!rcapSource.includes(forbiddenCall), `RCAP approval engine module must not call external provider path: ${forbiddenCall}`);
}
assert(!previewServer.includes("/api/rcap-revenue/approve"), "RCAP-3.1 should not add a live approval API route.");

const evaluateBody = rcapSource.slice(
  rcapSource.indexOf("export function evaluateRcapApproval"),
  rcapSource.indexOf("\n\nexport function applyRcapApprovalDecision")
);
assert(evaluateBody.includes("isRcapContactSuppressed(contact)"), "evaluateRcapApproval must route suppression through isRcapContactSuppressed.");
assert(!evaluateBody.includes("const suppressionReasons = suppressionReasonsFor(contact);\n  if (suppressionReasons.length)"), "evaluateRcapApproval must not use suppressionReasonsFor as the suppression predicate.");

console.log(JSON.stringify({
  suppressionVariantsCovered: suppressionVariants.length,
  mustApproveReasonsCovered: mustApproveCases.map(([, , , , reason]) => reason),
  missingAllowlistReasonsCovered: missingAllowlistCases.map(([, , , , reason]) => reason),
  autoReadyStatus: autoReady.status,
  approvedNeedsHumanStatus: approvedNeedsHuman.status,
  externalActionsTriggered: approvedNeedsHuman.externalActionsTriggered.length
}, null, 2));
