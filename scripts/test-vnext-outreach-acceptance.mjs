#!/usr/bin/env node
import assert from "node:assert/strict";
import { createGlobalObject } from "./global-create-service.mjs";
import { buildCampaignWizardView } from "./campaign-wizard-service.mjs";
import { createCampaignGoalSavePlan } from "./campaign-goal-step.mjs";
import { buildCampaignAudienceStep, createCampaignAudienceSavePlan } from "./campaign-audience-step.mjs";
import { buildCampaignMessageStep, createCampaignMessageSavePlan, createCampaignTestSendPlan } from "./campaign-message-step.mjs";
import { createCampaignScheduleSavePlan } from "./campaign-schedule-step.mjs";
import { buildCampaignReviewStep, executeCampaignLaunch } from "./campaign-review-step.mjs";
import { buildCampaignDetailView, executeCampaignStatusAction } from "./campaign-detail-service.mjs";

const actor = { authenticated:true, role:"owner", id:"founder-1", label:"Founder" };
const now = "2026-07-19T18:00:00.000Z";
const apply = (state, plan) => ({
  ...state,
  campaigns:state.campaigns.map((campaign) => campaign.id === plan.scope.id ? { ...campaign, ...structuredClone(plan.fields) } : campaign)
});

let state = {
  campaigns:[], activityEvents:[], auditHistory:[], outreachCampaigns:[], reactivationCampaign:null,
  partners:[
    { id:"partner-eligible", organizationName:"Northstar Justice Network", email:"eligible@example.com", stage:"active", geography:"Illinois", owner:"founder-1", tags:["priority"] },
    { id:"partner-suppressed", organizationName:"Harbor Legal Aid", email:"suppressed@example.com", stage:"active", geography:"Illinois", owner:"founder-1", tags:["priority"] }
  ],
  audienceSegments:[{ id:"segment-partners", name:"Active Partner prospects", memberRefs:[{ sourceKind:"partner", sourceId:"partner-eligible" },{ sourceKind:"partner", sourceId:"partner-suppressed" }] }],
  outreachSuppressions:[{ contact_id:"partner-suppressed" }], outreachUnsubscribes:[], outreachBounces:[], outreachComplaints:[],
  senderIdentities:[{ id:"sender-founder", label:"LegalEase Founder", verified:true }],
  sendingConnections:[{ senderIdentityId:"sender-founder", connected:true }],
  testRecipients:[{ id:"test-founder", label:"Founder test inbox", email:"founder-test@example.com", enabled:true }],
  campaignComplianceChecks:[], campaignActionPolicies:[], roleAssignments:[{ id:"founder-1", name:"Founder" }]
};

// 1. Create through the existing Global Create path; no wizard-only Campaign is created.
const created = createGlobalObject(state, "campaign", {
  creationRequestId:"outreach-acceptance-20260719", campaignName:"Justice Partner introductions",
  campaignType:"partner_outreach", goal:"Book introductory meetings with eligible Partners."
}, { now, actor });
state = created.state;
const campaignId = created.record.id;
const identity = `campaign:${campaignId}`;
assert.equal(state.campaigns.length, 1);
assert.equal(created.record.createdVia, "Global Create");

// 2. Goal, 3. authoritative Partner segment, and exact included/excluded truth.
let plan = createCampaignGoalSavePlan(state, actor, identity, { expectedVersion:0, fields:{
  campaignName:"Justice Partner introductions", campaignType:"partner_outreach",
  desiredOutcome:"Book introductory meetings with eligible Partners.", owner:"founder-1"
}}, now);
state = apply(state, plan);
plan = createCampaignAudienceSavePlan(state, actor, identity, { expectedVersion:1, segmentId:"segment-partners", selectionConfirmed:true }, now);
state = apply(state, plan);
let audience = buildCampaignAudienceStep(state, actor, identity, { limit:50 });
assert.deepEqual(audience.counts, { selected:2, included:1, excluded:1 });
assert.deepEqual(audience.executionInput, [{ sourceKind:"partner", sourceId:"partner-eligible" }]);
assert.deepEqual(audience.items.find((item) => item.sourceId === "partner-suppressed").exclusionReasons, ["Suppressed"]);

// 4. Save a one-time message, then 5. extend it to a stable two-step follow-up sequence.
plan = createCampaignMessageSavePlan(state, actor, identity, { expectedVersion:2, fields:{
  mode:"one_time_message", senderIdentityId:"sender-founder", subject:"A practical Partner introduction",
  previewText:"A concise introduction", body:"Hello {{first_name}}, we would value a conversation."
}}, now);
state = apply(state, plan);
assert.equal(buildCampaignMessageStep(state, actor, identity).fields.mode, "one_time_message");
plan = createCampaignMessageSavePlan(state, actor, identity, { expectedVersion:3, fields:{
  mode:"follow_up_sequence", senderIdentityId:"sender-founder", steps:[
    { clientKey:"intro", subject:"A practical Partner introduction", body:"Hello {{first_name}}, we would value a conversation." },
    { clientKey:"follow-up", subject:"Following up", body:"Would a short conversation be useful?", delayDays:4 }
  ]
}}, now);
state = apply(state, plan);
const message = buildCampaignMessageStep(state, actor, identity);
assert.equal(message.fields.steps.length, 2);
assert.equal(new Set(message.fields.steps.map((step) => step.id)).size, 2);

// 6. A test-send plan is explicit, server-authorized, and capped at one recipient.
const testPlan = createCampaignTestSendPlan(state, actor, identity, { testRecipientId:"test-founder" });
assert.equal(testPlan.maxRecipients, 1);
assert.equal(testPlan.execution.audienceExpansion, false);

// 7. Schedule and Review reuse the same authoritative audience projection.
plan = createCampaignScheduleSavePlan(state, actor, identity, { expectedVersion:4, fields:{
  mode:"scheduled", scheduledAt:"2026-07-21T10:00:00", timezone:"America/New_York",
  weekdayWindow:{ enabled:true, startHourET:9, endHourET:17 }, batchPlan:{ enabled:false }
}}, now);
state = apply(state, plan);
state = { ...state, campaignComplianceChecks:[{ campaignId, passed:true, checkedAt:now }] };
let review = buildCampaignReviewStep(state, actor, identity);
assert.equal(review.ready, true);
assert.deepEqual(review.executionInput, audience.executionInput);
assert.match(review.summary.what, /2-step/);

// 8. Approval request does not execute. Approval is applied separately by the controlled fixture.
const claims = new Map(); let engineCalls = 0; let approvalCalls = 0;
const claimIdempotency = async (key) => claims.has(key) ? { duplicate:true, outcome:claims.get(key) } : (claims.set(key, null), { duplicate:false });
const approval = await executeCampaignLaunch({ state, actor, stableIdentity:identity,
  input:{ executionFingerprint:review.executionFingerprint, idempotencyKey:"outreach-approval-0001" }, claimIdempotency,
  requestApproval:async () => { approvalCalls += 1; return { ok:true }; }
});
assert.equal(approval.approvalRequested, true);
assert.equal(approval.executed, false);
assert.equal(approvalCalls, 1);
assert.equal(engineCalls, 0);
state = { ...state, campaigns:state.campaigns.map((campaign) => campaign.id === campaignId ? { ...campaign, approvalRequired:false, approvalStatus:"approved" } : campaign) };

// 9. Controlled launch uses the existing-engine adapter, 11. suppression stays excluded,
// and 12. a durable retry claim prevents a second send.
review = buildCampaignReviewStep(state, actor, identity);
const launchInput = { executionFingerprint:review.executionFingerprint, idempotencyKey:"outreach-launch-000001" };
const runExistingEngine = async (launchPlan) => {
  engineCalls += 1;
  assert.deepEqual(launchPlan.recipientRefs, [{ sourceKind:"partner", sourceId:"partner-eligible" }]);
  const outcome = { ok:true, attempted:1, sent:1 };
  claims.set(launchPlan.idempotencyKey, outcome);
  return outcome;
};
const launch = await executeCampaignLaunch({ state, actor, stableIdentity:identity, input:launchInput, claimIdempotency, runExistingEngine });
const retry = await executeCampaignLaunch({ state, actor, stableIdentity:identity, input:launchInput, claimIdempotency, runExistingEngine });
assert.equal(launch.scope, "all");
assert.equal(retry.duplicate, true);
assert.equal(retry.executed, false);
assert.equal(engineCalls, 1);

// 10. Pause and resume remain policy-checked operations; neither browser state nor approval implies execution.
state = { ...state, campaigns:state.campaigns.map((campaign) => campaign.id === campaignId ? { ...campaign, status:"active" } : campaign), campaignActionPolicies:[{ stableIdentity:identity, pause:true }] };
let statusEngineCalls = 0;
const pause = await executeCampaignStatusAction({ state, actor, identity, input:{ action:"pause", idempotencyKey:"outreach-pause-000001" }, claimIdempotency:async()=>({ duplicate:false }), runExistingEngine:async()=>{ statusEngineCalls += 1; return { ok:true }; } });
assert.equal(pause.executed, true);
state = { ...state, campaigns:state.campaigns.map((campaign) => campaign.id === campaignId ? { ...campaign, status:"paused" } : campaign), campaignActionPolicies:[{ stableIdentity:identity, resume:true, resumeRequiresApproval:false }] };
const resume = await executeCampaignStatusAction({ state, actor, identity, input:{ action:"resume", idempotencyKey:"outreach-resume-00001" }, claimIdempotency:async()=>({ duplicate:false }), runExistingEngine:async()=>{ statusEngineCalls += 1; return { ok:true }; } });
assert.equal(resume.executed, true);
assert.equal(statusEngineCalls, 2);

// Reload, exact links, safe unavailable/auth states, and browser-safe payload content.
const reloaded = JSON.parse(JSON.stringify(state));
const wizard = buildCampaignWizardView(reloaded, actor, identity);
const detail = buildCampaignDetailView(reloaded, actor, identity);
assert.equal(wizard.draft.lastStep, "schedule");
assert.equal(detail.campaign.href, `#outreach/campaign/${encodeURIComponent(campaignId)}`);
assert.equal(buildCampaignWizardView(reloaded, { authenticated:false, role:"owner" }, identity).authorized, false);
assert.equal(buildCampaignWizardView(reloaded, actor, "campaign:missing").available, false);
const browserPayload = JSON.stringify({ wizard, review:buildCampaignReviewStep(reloaded, actor, identity), detail });
assert.doesNotMatch(browserPayload, /founder-test@example\.com|contact@|api[_-]?key|authorization|providerPayload/i);
assert.equal(created.record.liveMode, false);

console.log("PASS test-vnext-outreach-acceptance");
