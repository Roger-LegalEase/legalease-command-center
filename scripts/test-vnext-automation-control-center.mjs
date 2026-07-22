import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as automationModule from "./automation-control-center-service.mjs";
import {
  AUTOMATION_CONTROL_LANES,
  AUTOMATION_REVIEW_POSTURE,
  buildAutomationControlCenterView
} from "./automation-control-center-service.mjs";

const NOW = "2026-07-21T15:00:00.000Z";
const OWNER = { authenticated:true, id:"owner-roger", role:"owner", label:"Roger" };
const OPERATOR = { authenticated:true, id:"operator-1", role:"operator", label:"Operations" };
const SECRET_SENTINEL = "PROVIDER-TOKEN-AND-PAYLOAD-MUST-NOT-LEAK";
let passed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const STATE = {
  reactivationCampaign:{
    campaignId:"mvp-reactivation",
    status:"paused",
    pausedReason:"Reviewing synthetic bounce results",
    releasedWaves:[1],
    contentApproved:true,
    liveMode:{ enabled:true },
    thresholds:{ hard_bounce:0.1, spam_complaint:0.1, unsubscribe:0.2, windowDays:14 },
    minSampleSize:2
  },
  autopilotSettings:{ "reactivation-sequencer":{ enabled:true } },
  reactivationContacts:[
    {
      contact_id:"react-eligible",
      email:"eligible@example.com",
      full_name:"Eligible Customer",
      priority:"warm",
      wave:1,
      enrolled_at:"2026-07-15T12:00:00.000Z",
      updated_at:"2026-07-20T12:00:00.000Z"
    },
    {
      contact_id:"react-held",
      email:"held@example.com",
      full_name:"Held Customer",
      priority:"never_logged_in",
      wave:1,
      campaign_hold:true,
      updated_at:"2026-07-20T12:00:00.000Z"
    },
    {
      contact_id:"react-unsub",
      email:"unsubscribed@example.com",
      full_name:"Unsubscribed Customer",
      priority:"cold",
      wave:1,
      unsubscribed:true,
      updated_at:"2026-07-20T12:00:00.000Z"
    },
    {
      contact_id:"react-replied",
      email:"replied@example.com",
      full_name:"Replied Customer",
      priority:"cold",
      wave:1,
      replied:true,
      updated_at:"2026-07-20T12:00:00.000Z"
    }
  ],
  reactivationAttempts:[
    { id:"react-attempt-1", contact_id:"react-eligible", campaign_id:"mvp-reactivation", status:"sent", step_number:1, created_at:"2026-07-16T15:00:00.000Z" },
    { id:"react-attempt-2", contact_id:"react-replied", campaign_id:"mvp-reactivation", status:"sent", step_number:1, created_at:"2026-07-16T15:00:00.000Z" }
  ],
  reactivationEvents:[
    { id:"react-event-delivered", contact_id:"react-eligible", email:"eligible@example.com", type:"delivered", created_at:"2026-07-16T15:01:00.000Z" },
    { id:"react-event-bounce", contact_id:"react-replied", email:"replied@example.com", type:"bounce", created_at:"2026-07-16T15:01:00.000Z" },
    { id:"react-event-complaint", contact_id:"react-replied", email:"replied@example.com", type:"complaint", created_at:"2026-07-16T15:02:00.000Z" },
    { id:"react-event-unsub", contact_id:"react-unsub", email:"unsubscribed@example.com", type:"unsubscribe", created_at:"2026-07-16T15:03:00.000Z" }
  ],
  reactivationReplies:[
    { id:"react-reply-1", contact_id:"react-replied", status:"received", summary:"Synthetic customer replied.", receivedAt:"2026-07-17T15:00:00.000Z" }
  ],
  reactivationSendClaims:[
    { id:"react-claim-1", status:"sent", contact_id:"react-eligible", claimed_at:"2026-07-16T14:59:00.000Z" },
    { id:"react-claim-2", status:"claimed", contact_id:"react-replied", claimed_at:"2026-07-20T10:00:00.000Z" }
  ],
  prospectCandidates:[
    {
      id:"prospect-good",
      organization_name:"Second Chance Network",
      classification:"nonprofit",
      fit_reason:"Strong reentry audience and statewide service footprint.",
      score:88,
      review_state:"pending_review",
      email:"partner@example.com",
      contact_name:"Pat Partner"
    },
    {
      id:"prospect-duplicate",
      organization_name:"Existing Partner Org",
      classification:"legal_aid",
      fit_reason:"Legal aid organization with relevant services.",
      score:75,
      review_state:"pending_review",
      email:"duplicate@example.com",
      contact_name:"Duplicate Contact",
      is_duplicate:true
    },
    {
      id:"press-prospect",
      organization_name:"Example News",
      classification:"press",
      category:"media",
      review_state:"pending_review"
    }
  ],
  partners:[{ id:"partner-existing", organizationName:"Existing Partner Org" }],
  outreachOrganizations:[
    { account_id:"press-org", organization_name:"Example Daily", organizationType:"media", publication:"Example Daily", beat:"Justice technology" }
  ],
  outreachContacts:[
    {
      contact_id:"outreach-partner",
      source_prospect_id:"prospect-good",
      email:"partner@example.com",
      contact_name:"Pat Partner",
      classification:"nonprofit",
      campaign_id:"campaign-partner"
    },
    {
      contact_id:"press-contact",
      email:"reporter@example.com",
      contact_name:"Jordan Reporter",
      journalist:"Jordan Reporter",
      linked_account_id:"press-org",
      campaign_id:"campaign-press",
      contactType:"journalist",
      publication:"Example Daily",
      beat:"Justice technology",
      recentRelevantCoverage:"A recent article covered access-to-justice software.",
      storyAngle:"How self-help technology can make record clearing easier to navigate.",
      approvedFacts:["LegalEase offers self-help technology and information.", "The rebuilt check supports all 50 states plus D.C."],
      pitch:{ subject:"A practical record-clearing technology story", body:"A concise synthetic pitch for editorial review." },
      pitchApproved:true,
      coverageResult:"Interview scheduled for a synthetic future date."
    },
    {
      contact_id:"press-hidden",
      email:"hidden@example.com",
      contact_name:"Hidden Reporter",
      contactType:"journalist",
      providerPayload:{ token:SECRET_SENTINEL },
      allowedRoles:["admin"]
    }
  ],
  outreachCampaigns:[
    { campaign_id:"campaign-partner", campaign_name:"Partner prospect introduction", campaignType:"partner_outreach", classification:"nonprofit", status:"draft" },
    { campaign_id:"campaign-press", campaign_name:"Justice technology press outreach", campaignType:"press_outreach", classification:"press", status:"draft", storyAngle:"Founder story" }
  ],
  campaigns:[],
  outreachSequenceSteps:[
    { id:"partner-step-1", campaign_id:"campaign-partner", step_number:1, delay_days:0, subject:"A Partner idea", body:"Synthetic approved Partner introduction.", status:"approved" },
    { id:"partner-step-2", campaign_id:"campaign-partner", step_number:2, delay_days:4, subject:"Following up", body:"Synthetic follow-up.", status:"needs_review" },
    { id:"press-step-1", campaign_id:"campaign-press", step_number:1, delay_days:0, subject:"A practical technology story", body:"Synthetic approved press pitch.", status:"approved" },
    { id:"press-step-2", campaign_id:"campaign-press", step_number:2, delay_days:5, subject:"One useful follow-up", body:"Synthetic press follow-up.", status:"approved" }
  ],
  approvalQueue:[
    { id:"approval-partner-step", campaign_id:"campaign-partner", resourceId:"partner-step-1", status:"approved" },
    { id:"approval-press-step", campaign_id:"campaign-press", resourceId:"press-step-1", status:"approved" }
  ],
  approvals:[],
  outreachApprovalQueue:[],
  outreachAttempts:[
    { id:"attempt-partner", contact_id:"outreach-partner", campaign_id:"campaign-partner", status:"sent", created_at:"2026-07-19T12:00:00.000Z" },
    { id:"attempt-press", contact_id:"press-contact", campaign_id:"campaign-press", status:"sent", created_at:"2026-07-19T12:00:00.000Z", providerPayload:{ token:SECRET_SENTINEL } }
  ],
  outreachReplies:[
    { id:"reply-partner", contact_id:"outreach-partner", campaign_id:"campaign-partner", status:"needs_response", classification:"positive", summary:"Synthetic Partner would like a meeting.", receivedAt:"2026-07-20T12:00:00.000Z" },
    { id:"reply-press", contact_id:"press-contact", campaign_id:"campaign-press", status:"received", classification:"positive", summary:"Synthetic journalist requested more context.", receivedAt:"2026-07-20T13:00:00.000Z" }
  ],
  campaignReplies:[],
  outreachSuppressions:[{ id:"supp-duplicate", email:"duplicate@example.com", reason:"duplicate" }],
  outreachUnsubscribes:[],
  outreachBounces:[],
  outreachSendClaims:[
    { id:"claim-partner", campaign_id:"campaign-partner", contact_id:"outreach-partner", status:"sent", claimed_at:"2026-07-19T11:59:00.000Z" },
    { id:"claim-press", campaign_id:"campaign-press", contact_id:"press-contact", status:"sent", claimed_at:"2026-07-19T11:59:00.000Z" }
  ],
  companyContacts:[],
  reactivationContentApprovals:[],
  runtime:{ providerToken:SECRET_SENTINEL }
};

console.log("Automation Control Center service tests");

{
  assert.deepEqual(AUTOMATION_CONTROL_LANES, ["Reactivation", "Partner prospect outreach", "Press outreach"]);
  assert.deepEqual(AUTOMATION_REVIEW_POSTURE, {
    reviewOnly:true,
    mutationsAvailable:false,
    liveControlsAvailable:false,
    activationAvailable:false,
    releaseAvailable:false,
    sendAvailable:false,
    enrollmentAvailable:false,
    suppressionRemovalAvailable:false,
    providerCalls:0,
    externalActions:0
  });
  const before = JSON.stringify(STATE);
  const view = buildAutomationControlCenterView(STATE, OWNER, NOW);
  assert.equal(JSON.stringify(STATE), before, "projection is pure");
  assert.equal(view.mode, "Review only");
  assert.equal(view.lanes.length, 3);
  assert.deepEqual(view.lanes.map((lane) => lane.label), AUTOMATION_CONTROL_LANES);
  assert.equal(view.lanes.every((lane) => lane.posture.reviewOnly && lane.posture.externalActions === 0), true);
  assert.equal(view.posture.liveControlsAvailable, false);
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.lanes[0]), true);
  assert.equal(JSON.stringify(view).includes(SECRET_SENTINEL), false);
  assert.equal(JSON.stringify(view).includes("providerPayload"), false);
  assert.equal(JSON.stringify(view).includes("providerToken"), false);
  ok("the three-lane projection is pure, deeply frozen, review-only, and strips provider details");
}

{
  const lane = buildAutomationControlCenterView(STATE, OWNER, NOW).lanes.find((item) => item.id === "reactivation");
  assert.equal(lane.availability, "Available");
  assert.equal(lane.storedState, "paused");
  assert.equal(lane.audience.total, 4);
  assert.equal(lane.audience.eligible, 1);
  assert.equal(lane.audience.held, 1);
  assert.equal(lane.audience.suppressed, 2);
  assert.equal(lane.audience.dueNow, 1);
  assert.equal(lane.sequence.variants.length, 2);
  assert.equal(lane.sequence.approvedTouches, 10);
  assert.equal(lane.sequence.variants.every((sequence) => sequence.cadenceDays.join(",") === "1,4,9,16,30"), true);
  assert.equal(lane.activity.attempts.total, 2);
  assert.equal(lane.activity.replies, 1, "stored reply and contact reply flag deduplicate to one person");
  assert.equal(lane.activity.delivered, 1);
  assert.equal(lane.activity.bounces, 1);
  assert.equal(lane.activity.complaints, 1);
  assert.equal(lane.activity.unsubscribes, 1);
  assert.equal(lane.activity.claims.total, 2);
  assert.equal(lane.activity.claims.unconfirmed, 1);
  assert.equal(lane.threshold.tripped, true);
  assert.equal(lane.threshold.state, "Needs attention");
  assert.equal(lane.readiness.state, "Needs attention");
  assert.match(lane.readiness.warnings.join(" "), /active control/i);
  assert.equal(lane.contacts.find((contact) => contact.id === "react-eligible").sequence.id, "reactivation_logged_in");
  assert.equal(lane.contacts.find((contact) => contact.id === "react-held").sequence.id, "reactivation_never_logged_in");
  ok("Reactivation shows audience, sequences, approvals, due work, attempts, signals, claims, thresholds, and stored pause state");
}

{
  const lane = buildAutomationControlCenterView(STATE, OWNER, NOW).lanes.find((item) => item.id === "partner-prospect-outreach");
  assert.equal(lane.availability, "Available");
  assert.equal(lane.summary.candidates, 2, "press prospect is routed only to the Press lane");
  assert.equal(lane.summary.contactable, 0, "the replied prospect is correctly removed from automated outreach eligibility");
  assert.equal(lane.summary.duplicatesOrExisting, 1);
  assert.equal(lane.summary.replies, 1);
  assert.equal(lane.summary.campaigns, 1);
  assert.equal(lane.summary.claims.total, 1);
  assert.equal(lane.readiness.state, "Ready for review");
  const candidate = lane.candidates.find((item) => item.id === "prospect-good");
  assert.equal(candidate.organization, "Second Chance Network");
  assert.equal(candidate.fitReason, "Strong reentry audience and statewide service footprint.");
  assert.equal(candidate.score, 88);
  assert.equal(candidate.contact.name, "Pat Partner");
  assert.equal(candidate.contact.email, "partner@example.com");
  assert.equal(candidate.duplicateOrExisting.clear, true);
  assert.equal(candidate.suppression.suppressed, true);
  assert.equal(candidate.suppression.reason, "Replied");
  assert.equal(candidate.firstTouch.status, "Approved");
  assert.equal(candidate.firstTouch.body, "Synthetic approved Partner introduction.");
  assert.equal(candidate.sequence.length, 2);
  assert.equal(candidate.replies.length, 1);
  assert.equal(candidate.nextAction, "Review the reply and set the relationship next action.");
  const duplicate = lane.candidates.find((item) => item.id === "prospect-duplicate");
  assert.equal(duplicate.duplicateOrExisting.duplicate, true);
  assert.match(duplicate.nextAction, /duplicate or existing relationship/i);
  ok("Partner prospect outreach shows fit, score, contact, deduplication, suppression, approved copy, sequence, replies, and next action");
}

{
  const lane = buildAutomationControlCenterView(STATE, OWNER, NOW).lanes.find((item) => item.id === "press-outreach");
  assert.equal(lane.availability, "Available");
  assert.equal(lane.summary.campaigns, 1);
  assert.equal(lane.summary.contacts, 2, "manual press prospect and journalist contact are both reviewable");
  assert.equal(lane.summary.pitchesApproved, 1);
  assert.equal(lane.summary.replies, 1);
  assert.equal(lane.summary.coverageRecorded, 1);
  assert.equal(lane.summary.claims.total, 1);
  assert.equal(lane.readiness.state, "Ready for review");
  const press = lane.contacts.find((contact) => contact.id === "press-contact");
  assert.equal(press.publication, "Example Daily");
  assert.equal(press.journalist, "Jordan Reporter");
  assert.equal(press.beat, "Justice technology");
  assert.match(press.recentRelevantCoverage, /access-to-justice/);
  assert.match(press.storyAngle, /record clearing/);
  assert.equal(press.approvedFacts.length, 2);
  assert.equal(press.pitch.status, "Approved");
  assert.equal(press.pitch.subject, "A practical record-clearing technology story");
  assert.equal(press.pitch.body, "A concise synthetic pitch for editorial review.");
  assert.equal(press.followUpSequence.length, 2);
  assert.equal(press.replies.length, 1);
  assert.equal(press.coverageResult, "Interview scheduled for a synthetic future date.");
  assert.equal(press.nextAction, "Review the reply and record the coverage outcome or next follow-up.");
  assert.equal(lane.contacts.some((contact) => contact.id === "press-hidden"), false);
  ok("Press outreach exposes every requested press-specific field on the existing campaign/contact foundation");
}

{
  const view = buildAutomationControlCenterView({}, OWNER, NOW);
  assert.equal(view.lanes.length, 3);
  assert.equal(view.lanes.every((lane) => lane.availability === "Unavailable"), true);
  assert.equal(view.lanes.every((lane) => lane.readiness.state === "Unavailable"), true);
  assert.equal(view.summary.unavailable, 3);
  assert.equal(view.lanes[0].audience.total, 0);
  assert.match(view.lanes[0].readiness.blockers.join(" "), /No reactivation audience/);
  ok("missing records remain explicitly unavailable instead of fabricating readiness");
}

{
  const unauthorized = buildAutomationControlCenterView(STATE, OPERATOR, NOW);
  assert.equal(unauthorized.authorized, false);
  assert.equal(unauthorized.available, false);
  assert.deepEqual(unauthorized.lanes, []);
  assert.equal(JSON.stringify(unauthorized).includes("partner@example.com"), false);
  ok("sensitive automation audience context is restricted to an authorized account");
}

{
  assert.deepEqual(Object.keys(automationModule).sort(), [
    "AUTOMATION_CONTROL_LANES",
    "AUTOMATION_REVIEW_POSTURE",
    "buildAutomationControlCenterView"
  ]);
  const source = readFileSync(new URL("./automation-control-center-service.mjs", import.meta.url), "utf8");
  assert.equal(/\bfetch\s*\(/u.test(source), false);
  assert.equal(/\b(?:actOutreach|actReactivation|releaseWave|setReactivationLiveMode|recordSuppression)\s*\(/u.test(source), false);
  assert.equal(/export function (?:execute|mutate|send|release|enroll|activate)/u.test(source), false);
  assert.equal(source.includes("process.env"), false);
  ok("the service structurally exposes no provider, mutation, activation, release, enrollment, or send path");
}

console.log(`PASS test-vnext-automation-control-center (${passed} checks)`);
