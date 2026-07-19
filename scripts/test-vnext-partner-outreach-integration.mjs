#!/usr/bin/env node
import assert from "node:assert/strict";

import { applyPartnerStageSuggestion, buildOneToOnePartnerFollowUp, buildPartnerCampaignSelection, buildPartnerOutreachIntegration, createPartnerCampaignDraft } from "./partner-outreach-integration.mjs";
import { buildPartnerRecordView } from "./ui/view-models/partner-record.mjs";

const OWNER = { authenticated:true, role:"owner", id:"owner-example" };
const NOW = "2026-07-19T12:00:00.000Z";
const state = {
  partners:[
    { id:"partner-one", organizationName:"Community Partner Example", stage:"new", owner:"Roger", nextAction:"Review response", primaryContactName:"Taylor", history:[] },
    { id:"partner-suppressed", organizationName:"Suppressed Example", stage:"qualified", suppressed:true, history:[] },
    { id:"partner-hidden", organizationName:"Hidden Example", stage:"active", allowedRoles:["admin"], history:[] }
  ],
  campaigns:[{ id:"campaign-one", campaignName:"Existing Partner Campaign", campaignType:"partner_outreach", partnerId:"partner-one", status:"draft", audienceSelected:false, liveMode:false, approvalStatus:"not_requested" }],
  outreachCampaigns:[{ campaign_id:"legacy-one", campaign_name:"Legacy relationship Campaign", partnerId:"partner-one", status:"draft" }],
  outreachContacts:[{ id:"contact-suppressed", partnerId:"partner-suppressed", suppressed:true }],
  outreachReplies:[{ id:"reply-reviewed", campaign_id:"campaign-one", partnerId:"partner-one", replied_at:"2026-07-19T10:00:00.000Z", classification:"meeting_requested", classificationReviewed:true, body:"Private reply body" }],
  outreachAttempts:[], outreachSequenceSteps:[], outreachSuppressions:[], outreachUnsubscribes:[], outreachBounces:[], outreachApprovalQueue:[], approvalQueue:[], approvals:[], campaignActivities:[], partnerPrograms:[], pilots:[], tasks:[], reports:[], partnerProgramArtifacts:[], evidencePackNotes:[], dataRoomItems:[], activityEvents:[], auditHistory:[], automationEvents:[], companyEvents:[]
};

const before = structuredClone(state);
const selection = buildPartnerCampaignSelection(state, OWNER, ["partner-one", "partner-suppressed", "partner-hidden"]);
assert.equal(selection.requestedCount, 3);
assert.deepEqual(selection.selected.map((item) => item.id), ["partner-one"]);
assert.equal(selection.excludedCount, 2);
assert.equal(selection.suppressionRechecked, true);
assert.equal(selection.browserCanRestoreEligibility, false);
assert.doesNotMatch(JSON.stringify(selection), /contact-suppressed|primaryContact|email/i);

const created = createPartnerCampaignDraft(state, { requestId:"partners-campaign-0001", partnerIds:["partner-one", "partner-suppressed"], campaignName:"Reviewed Partner outreach", goal:"Invite a reviewed planning conversation" }, { actor:OWNER, now:NOW });
assert.equal(created.record.status, "draft");
assert.deepEqual(created.record.partnerIds, ["partner-one"]);
assert.equal(created.record.audienceSelected, false);
assert.deepEqual(created.record.recipients, []);
assert.equal(created.record.liveMode, false);
assert.equal(created.record.approvalStatus, "not_requested");
assert.equal(created.sends, 0);
assert.equal(created.enrollments, 0);
assert.equal(created.externalActions, 0);

const followUp = buildOneToOnePartnerFollowUp(state, OWNER, "partner-one", NOW);
assert.equal(followUp.status, "draft");
assert.equal(followUp.reviewRequired, true);
assert.equal(followUp.sends, 0);
assert.match(followUp.draft.body, /Draft only - not sent automatically/);
assert.throws(() => buildOneToOnePartnerFollowUp(state, OWNER, "partner-suppressed", NOW), /suppressed or ineligible/);

const integration = buildPartnerOutreachIntegration(state, OWNER, "partner-one", NOW);
assert.equal(integration.available, true);
assert.deepEqual(integration.campaigns.map((campaign) => campaign.stableIdentity), ["campaign:campaign-one", "outreach:legacy-one"]);
assert.equal(integration.campaigns[0].href, "#outreach/campaign/campaign-one");
assert.equal(integration.campaigns[1].href, "#campaigns");
assert.equal(integration.suggestions.length, 1);
assert.equal(integration.suggestions[0].proposedUiStage.label, "In conversation");
assert.equal(integration.suggestions[0].changesPartnerStage, false);
assert.equal(integration.suggestions[0].evidence.sourceId, "reply-reviewed");
assert.doesNotMatch(JSON.stringify(integration), /Private reply body/);

const notConfirmed = { requestId:"stage-suggestion-0001", suggestionId:integration.suggestions[0].id, confirmed:false };
assert.throws(() => applyPartnerStageSuggestion(state, "partner-one", notConfirmed, { actor:OWNER, now:NOW }), /explicitly confirm/);
assert.equal(state.partners[0].stage, "new");
const applied = applyPartnerStageSuggestion(state, "partner-one", { ...notConfirmed, confirmed:true }, { actor:OWNER, now:NOW });
assert.equal(applied.state.partners[0].stage, "meeting_requested");
assert.equal(applied.suggestion.applied, true);
assert.equal(applied.state.activityEvents[0].metadata.explicitlyApplied, true);
assert.equal(applied.externalActions, 0);
assert.equal(state.partners[0].stage, "new");
assert.deepEqual(state, before);

const record = buildPartnerRecordView(state, OWNER, "partner-one", NOW, { tab:"outreach" });
assert.equal(record.outreach.campaigns.length, 2);
assert.equal(record.outreach.suggestions.length, 1);
assert.equal(record.safety.internalStageChanged, false);

console.log("PASS test-vnext-partner-outreach-integration");
console.log(JSON.stringify({ selected:selection.eligibleCount, excluded:selection.excludedCount, relatedCampaigns:integration.campaigns.length, reviewedSuggestions:integration.suggestions.length, explicitStageChanges:1, silentStageChanges:0, sends:0, enrollments:0, externalActions:0 }));
