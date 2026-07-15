#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RCAP_DEFERRED_BEHAVIORAL_SIGNALS,
  calculateRcapInternalScore,
  rcapRevenueSavedViewDefinitions,
  rcapRevenueSavedViews
} from "./rcap-revenue-os.mjs";

const source = readFileSync(join(process.cwd(), "scripts", "rcap-revenue-os.mjs"), "utf8");
const server = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");

function account(patch = {}) {
  return {
    account_id: "A-SCORE",
    source_prospect_id: "P-SCORE",
    organization_name: "Scored Legal Aid",
    segment: "A2",
    rcap_campaign_segment: "A2",
    priority_tier: "Tier 2",
    priority_score: 72,
    paid_offer_fit: "Strong RCAP fit",
    likely_funding_path: "State workforce grant",
    account_status: "Imported",
    rcap_cobranded_page_status: "Master RCAP Page",
    ...patch
  };
}

function contact(patch = {}) {
  return {
    contact_id: "C-SCORE",
    linked_account_id: "A-SCORE",
    contact_name: "Avery Program Manager",
    title: "Program Manager",
    decision_role: "Program Manager",
    public_email: "avery@example.com",
    source_confidence: "High",
    suppression_status: "Active",
    bounced: false,
    unsubscribed: false,
    email_status: "Verified",
    sequence_status: "Not Enrolled",
    ...patch
  };
}

function deal(patch = {}) {
  return {
    deal_seed_id: "D-SCORE",
    linked_account_id: "A-SCORE",
    linked_contact_id: "C-SCORE",
    proposed_offer: "RCAP pilot",
    funding_source: "Workforce grant",
    target_close_date: "2026-07-15",
    ...patch
  };
}

function event(type, patch = {}) {
  return {
    event_type: type,
    linked_account_id: "A-SCORE",
    linked_contact_id: "C-SCORE",
    linked_deal_seed_id: "D-SCORE",
    created_at: "2026-06-11T14:00:00.000Z",
    ...patch
  };
}

const positiveReply = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_positive_reply")]);
assert.equal(positiveReply.score, 75, "Manual positive reply should add 75 internal-only points.");
assert.equal(positiveReply.status, "Immediate Follow-Up", "75+ should be Immediate Follow-Up for non-suppressed records.");
assert.equal(positiveReply.source, "internal_only", "Scoring must be explicitly internal only.");

const meetingBooked = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_meeting_booked")]);
assert.equal(meetingBooked.score, 75, "Manual meeting booked should add 75 points.");
assert.equal(meetingBooked.status, "Immediate Follow-Up");

const formSubmitted = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_form_submitted")]);
assert.equal(formSubmitted.score, 50, "Manual/internal form submitted should add 50 points.");
assert.equal(formSubmitted.status, "Sales Qualified");

const proposalRequested = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_proposal_requested")]);
assert.equal(proposalRequested.score, 50, "Proposal requested should add 50 points.");
assert.equal(proposalRequested.status, "Sales Qualified");

const budgetPath = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_budget_path_identified")]);
assert.equal(budgetPath.score, 40, "Budget path identified should add 40 points.");
assert.equal(budgetPath.status, "Warm");

const discovery = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_discovery_completed")]);
assert.equal(discovery.score, 35, "Discovery completed should add 35 points.");
assert.equal(discovery.status, "Warm");

const referred = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_referred_to_another_person")]);
assert.equal(referred.score, 20, "Referral to another person should add 20 points.");
assert.equal(referred.status, "Light Engagement");

const proposalSent = calculateRcapInternalScore(account(), contact(), deal(), [], [event("manual_proposal_sent")]);
assert.equal(proposalSent.score, 20, "Proposal sent should add 20 points.");
assert.equal(proposalSent.status, "Light Engagement");

const closedWon = calculateRcapInternalScore(account(), contact(), deal(), [], [event("closed_won")]);
assert.equal(closedWon.score, 100, "Closed won should be recorded as strong internal history.");
assert.equal(closedWon.status, "Immediate Follow-Up");

const closedLost = calculateRcapInternalScore(account(), contact(), deal(), [], [event("closed_lost")]);
assert.equal(closedLost.score, 0, "Closed lost should not create hotness.");
assert.equal(closedLost.status, "Cold", "Closed lost should remain cold/history, not immediate follow-up.");
assert(closedLost.reasons.some(reason => /closed lost/i.test(reason)), "Closed lost should be represented as history.");

const suppressedHighIntent = calculateRcapInternalScore(
  account(),
  contact({ suppression_status: "Do Not Contact", unsubscribed: true }),
  deal(),
  [],
  [event("manual_positive_reply"), event("manual_meeting_booked"), event("manual_proposal_requested")]
);
assert.equal(suppressedHighIntent.suppressed, true, "Suppression must be explicit in scoring output.");
assert.equal(suppressedHighIntent.status, "Suppressed", "Suppression outranks all positive signals.");
assert.notEqual(suppressedHighIntent.status, "Sales Qualified", "Suppressed records cannot be Sales Qualified.");
assert.notEqual(suppressedHighIntent.status, "Immediate Follow-Up", "Suppressed records cannot be Immediate Follow-Up.");

const deferredSignals = calculateRcapInternalScore(account(), contact(), deal(), [], [
  event("email_open"),
  event("email_click"),
  event("page_view"),
  event("pricing_click"),
  event("pilot_scope_click"),
  event("funding_language_download"),
  event("co_branded_page_view")
]);
assert.equal(deferredSignals.score, 0, "Deferred behavioral signals must not score before real sensors exist.");
assert.equal(deferredSignals.status, "Cold", "Deferred behavioral signals alone must not create warmth.");
for (const label of [
  "email opens",
  "email clicks",
  "page views",
  "pricing clicks",
  "pilot-scope clicks",
  "funding-language downloads",
  "co-branded page views"
]) {
  assert(RCAP_DEFERRED_BEHAVIORAL_SIGNALS.includes(label), `Deferred signal list should include ${label}.`);
  assert(deferredSignals.deferredSignals.includes(label), `Deferred scoring output should list ${label}.`);
}

const thresholds = [
  [[], 0, "Cold"],
  [[event("manual_referred_to_another_person", { linked_contact_id:"C-THRESHOLD" })], 20, "Light Engagement"],
  [[event("manual_budget_path_identified", { linked_contact_id:"C-THRESHOLD" })], 40, "Warm"],
  [[event("manual_form_submitted", { linked_contact_id:"C-THRESHOLD" })], 50, "Sales Qualified"],
  [[event("manual_positive_reply", { linked_contact_id:"C-THRESHOLD" })], 75, "Immediate Follow-Up"]
];
for (const [events, expectedScore, expectedStatus] of thresholds) {
  const scored = calculateRcapInternalScore(
    account({ account_id:"A-THRESHOLD" }),
    contact({ contact_id:"C-THRESHOLD", linked_account_id:"A-THRESHOLD" }),
    {},
    [],
    events
  );
  assert.equal(scored.score, expectedScore, `Threshold score should be ${expectedScore}.`);
  assert.equal(scored.status, expectedStatus, `Threshold status should be ${expectedStatus}.`);
}

const viewState = {
  rcapRevenueAccounts: [
    account({ account_id:"A-FIRST", source_prospect_id:"P-FIRST", organization_name:"First Wave Org", priority_tier:"Tier 2", priority_score:72, likely_funding_path:"Workforce grant" }),
    account({ account_id:"A-HOT", source_prospect_id:"P-HOT", organization_name:"Hot Account", priority_tier:"Tier 2", priority_score:70 }),
    account({ account_id:"A-APPROVAL", source_prospect_id:"P-APPROVAL", organization_name:"Approval Account", priority_tier:"Tier 1", priority_score:96 }),
    account({ account_id:"A-SUPP", source_prospect_id:"P-SUPP", organization_name:"Suppressed Account", priority_tier:"Tier 2", priority_score:70 }),
    account({ account_id:"A-FUND", source_prospect_id:"P-FUND", organization_name:"Funding Nurture Org", priority_tier:"Tier 3", priority_score:40, likely_funding_path:"Foundation grant", paid_offer_fit:"Potential fit" }),
    account({ account_id:"A-WON", source_prospect_id:"P-WON", organization_name:"Won Org", priority_tier:"Tier 2", priority_score:80, account_status:"Closed Won" })
  ],
  rcapRevenueContacts: [
    contact({ contact_id:"C-FIRST", linked_account_id:"A-FIRST", contact_name:"First Wave Contact" }),
    contact({ contact_id:"C-HOT", linked_account_id:"A-HOT", contact_name:"Positive Reply Contact" }),
    contact({ contact_id:"C-APPROVAL", linked_account_id:"A-APPROVAL", contact_name:"Chief Decision Maker", title:"CEO", decision_role:"CEO" }),
    contact({ contact_id:"C-SUPP", linked_account_id:"A-SUPP", contact_name:"Suppressed Reply", suppression_status:"Do Not Contact", unsubscribed:true }),
    contact({ contact_id:"C-FUND", linked_account_id:"A-FUND", contact_name:"Funding Contact" }),
    contact({ contact_id:"C-WON", linked_account_id:"A-WON", contact_name:"Onboarding Contact" })
  ],
  rcapRevenueDealSeeds: [
    deal({ deal_seed_id:"D-PROPOSAL", linked_account_id:"A-HOT", linked_contact_id:"C-HOT", proposed_offer:"RCAP pilot", funding_source:"City grant" }),
    deal({ deal_seed_id:"D-SUPP", linked_account_id:"A-SUPP", linked_contact_id:"C-SUPP", proposed_offer:"Do not use", funding_source:"Grant" }),
    deal({ deal_seed_id:"D-WON", linked_account_id:"A-WON", linked_contact_id:"C-WON", proposed_offer:"Won RCAP pilot", funding_source:"Grant" })
  ],
  rcapRevenueQueueTasks: [
    { task_id:"T-CLEANUP", task_type:"RCAP Data Cleanup", title:"Suppression cleanup", linked_contact_id:"C-SUPP", status:"New", safe_action_type:"internal_data_cleanup" },
    { task_id:"T-PROPOSAL", task_type:"RCAP Proposal Task", title:"Review proposal", linked_account_id:"A-HOT", linked_contact_id:"C-HOT", status:"New", safe_action_type:"internal_proposal_review" },
    { task_id:"T-ONBOARD", task_type:"RCAP Onboarding Task", title:"Onboarding review", linked_account_id:"A-WON", linked_contact_id:"C-WON", status:"New", safe_action_type:"internal_onboarding_review" }
  ],
  rcapRevenueImportBatches: [{
    import_id:"import-views",
    warnings:["Contacts_Master row 4 used public_email + linked_account_id fallback identity."],
    status:"imported"
  }],
  rcapRevenueEvents: [
    event("manual_positive_reply", { linked_account_id:"A-HOT", linked_contact_id:"C-HOT", linked_deal_seed_id:"D-PROPOSAL" }),
    event("manual_positive_reply", { linked_account_id:"A-SUPP", linked_contact_id:"C-SUPP", linked_deal_seed_id:"D-SUPP" }),
    event("manual_proposal_sent", { linked_account_id:"A-HOT", linked_contact_id:"C-HOT", linked_deal_seed_id:"D-PROPOSAL" }),
    event("manual_budget_path_identified", { linked_account_id:"A-FUND", linked_contact_id:"C-FUND" }),
    event("closed_won", { linked_account_id:"A-WON", linked_contact_id:"C-WON", linked_deal_seed_id:"D-WON" })
  ]
};

const definitions = rcapRevenueSavedViewDefinitions();
assert.deepEqual(definitions.map(view => view.key), [
  "first_wave_ready",
  "needs_human_approval",
  "suppression_data_cleanup",
  "hot_accounts",
  "proposal_follow_up",
  "funding_nurture",
  "reply_queue",
  "closed_won_onboarding"
], "Saved views should use the approved eight-view IA.");
assert(definitions.every(view => view.filterOnly === true), "Saved view definitions must be filters, not actions.");
assert(definitions.every(view => Array.isArray(view.actions) && view.actions.length === 0), "Saved views should not carry actions.");

const views = rcapRevenueSavedViews(viewState);
const byKey = Object.fromEntries(views.map(view => [view.key, view]));
assert(byKey.first_wave_ready.items.some(item => item.contact_id === "C-FIRST"), "First Wave Ready should include clean auto-ready contacts.");
assert(byKey.needs_human_approval.items.some(item => item.contact_id === "C-APPROVAL"), "Needs Human Approval should include executive/Tier 1 approval cases.");
assert(byKey.suppression_data_cleanup.items.some(item => item.contact_id === "C-SUPP"), "Suppression cleanup should include suppressed contacts.");
assert(byKey.suppression_data_cleanup.items.some(item => item.task_id === "T-CLEANUP"), "Suppression cleanup should include cleanup tasks.");
assert(byKey.hot_accounts.items.some(item => item.account_id === "A-HOT"), "Hot Accounts should include non-suppressed high-scoring accounts.");
assert(!byKey.hot_accounts.items.some(item => item.account_id === "A-SUPP"), "Hot Accounts must exclude suppressed-only high-signal records.");
assert(byKey.proposal_follow_up.items.some(item => item.deal_seed_id === "D-PROPOSAL"), "Proposal Follow-Up should include proposal-ready deal seeds.");
assert(!byKey.proposal_follow_up.items.some(item => item.deal_seed_id === "D-SUPP"), "Proposal Follow-Up must exclude suppressed contact-linked deal seeds.");
assert(byKey.funding_nurture.items.some(item => item.account_id === "A-FUND"), "Funding Nurture should include known funding-path records.");
assert(byKey.reply_queue.items.some(item => item.contact_id === "C-HOT"), "Reply Queue should include manual positive replies.");
assert(!byKey.reply_queue.items.some(item => item.contact_id === "C-SUPP"), "Suppressed replies must route to cleanup, not Reply Queue.");
assert(byKey.closed_won_onboarding.items.some(item => item.account_id === "A-WON"), "Closed Won / Onboarding should include closed-won accounts.");
assert(views.every(view => view.filterOnly === true), "Computed saved views must remain filters.");
assert(views.every(view => Array.isArray(view.actions) && view.actions.length === 0), "Computed saved views must not expose action buttons.");

assert(source.includes("calculateRcapInternalScore"), "RCAP source should expose internal scoring helper.");
assert(source.includes("source: \"internal_only\""), "Scoring output should identify internal-only source.");
for (const forbidden of ["sendRcapEmail", "createGmailDraft", "calendar.events.insert", "trackEmailOpen", "trackPageView", "trackingPixel"]) {
  assert(!source.includes(forbidden), `RCAP scoring/views must not add forbidden behavior: ${forbidden}`);
  assert(!server.includes(forbidden), `RCAP scoring/views UI must not add forbidden behavior: ${forbidden}`);
}
for (const required of [
  "RCAP Revenue Views",
  "Internal-only scoring",
  "Behavioral scoring deferred",
  "Email open/click tracking: Off",
  "Page tracking: Off",
  "Saved views are filters, not actions"
]) {
  assert(server.includes(required), `Preview UI should expose safe RCAP views/scoring copy: ${required}`);
}
assert(!server.includes("/api/rcap-revenue/send"), "No RCAP send route should exist.");
assert(!server.includes("/api/rcap-revenue/enroll"), "No RCAP enroll route should exist.");
assert(!server.includes("/api/rcap-revenue/sequence"), "No RCAP sequence route should exist.");

for (const requiredScript of [
  "scripts/test-rcap-internal-scoring-and-views.mjs",
  "node --check scripts/test-rcap-internal-scoring-and-views.mjs",
  "node scripts/test-rcap-internal-scoring-and-views.mjs"
]) {
  assert(packageJson.includes(requiredScript), `package.json should register ${requiredScript}`);
}

console.log("RCAP internal scoring and saved views tests passed.");
