import { createGlobalObject } from "../global-create-service.mjs";
import { createPartnerProgramRecord, generatePartnerArtifact } from "../partner-artifact-service.mjs";
import { completePartnerNextAction, setPartnerNextAction } from "../partner-record-actions.mjs";
import { applyPartnerStageSuggestion, buildPartnerOutreachIntegration, createPartnerCampaignDraft } from "../partner-outreach-integration.mjs";

export const PARTNERS_FIXTURE_NOW = "2026-07-19T12:00:00.000Z";
export const PARTNERS_FIXTURE_ACTOR = Object.freeze({ authenticated:true, role:"owner", id:"synthetic-owner", label:"Roger" });

export function partnersFixtureState() {
  return {
    partners:[
      { id:"partner-community", organizationName:"Community Justice Network", stage:"proposal_sent", owner:"Roger", nextAction:"Confirm the reviewed pilot scope", nextActionDueDate:"2026-07-18", relationshipHealth:"healthy", partnerType:"nonprofit", geography:"Georgia", primaryContactName:"Taylor Example", email:"taylor@example.com", notes:["Scope reviewed with synthetic fixture contact."], relatedPrograms:["program-community"], history:[{ id:"history-community", action:"stage_changed", fromStage:"meeting_booked", toStage:"proposal_sent", at:"2026-07-17T09:00:00.000Z" }] },
      { id:"partner-workforce", organizationName:"Second Start Workforce", stage:"stalled", commercialStage:"qualified", owner:"Operations", nextAction:"Confirm the decision owner", nextActionDueDate:"2026-07-21", relationshipHealth:"at_risk", partnerType:"workforce", geography:"Mississippi", history:[] },
      { id:"partner-legal-aid", organizationName:"Regional Legal Aid Example", stage:"meeting_booked", owner:"Roger", nextAction:"Prepare a reviewed agenda", nextActionDueDate:"2026-07-23", relationshipHealth:"healthy", partnerType:"legal_aid", geography:"Alabama", history:[] },
      { id:"partner-active", organizationName:"Fresh Path Coalition", stage:"active_pilot", owner:"Programs", nextAction:"Review the weekly report", nextActionDueDate:"2026-07-24", relationshipHealth:"healthy", partnerType:"nonprofit", geography:"Tennessee", relatedPrograms:["program-active"], history:[] },
      { id:"partner-new", organizationName:"County Access Example", stage:"new", owner:"Roger", nextAction:"Identify the program lead", nextActionDueDate:"2026-07-28", partnerType:"government", geography:"Georgia", history:[] },
      { id:"partner-closed", organizationName:"Archived Partnership Example", stage:"closed_lost", owner:"Roger", outcomeSummary:"Not moving forward", history:[] },
      { id:"partner-hidden", organizationName:"Restricted Partner Example", stage:"active", ownerOnly:true, history:[] }
    ],
    partnerPrograms:[
      { id:"program-community", name:"Community access pilot", relatedPartnerId:"partner-community", status:"proposal_draft", owner:"Roger", packageTier:"starter", history:[] },
      { id:"program-active", name:"Fresh Path access program", relatedPartnerId:"partner-active", status:"active", owner:"Programs", packageTier:"implementation", history:[] }
    ],
    partnerProgramArtifacts:[],
    reports:[{ id:"report-existing", reportTitle:"Fresh Path weekly report", partnerId:"partner-active", programId:"program-active", status:"draft", generatedAt:"2026-07-18T08:00:00.000Z", externallyShared:false }],
    dataRoomItems:[{ id:"file-partner-brief", title:"Community scope brief", partnerId:"partner-community", section:"Partner pipeline", status:"draft", createdAt:"2026-07-17T08:00:00.000Z", binaryUploaded:false, externallyShared:false }],
    campaigns:[{ id:"campaign-community", campaignName:"Community planning outreach", campaignType:"partner_outreach", partnerId:"partner-community", status:"draft", audienceSelected:false, liveMode:false, approvalStatus:"not_requested" }],
    outreachCampaigns:[],
    outreachContacts:[], companyContacts:[], outreachSequenceSteps:[], outreachAttempts:[], outreachReplies:[], outreachSuppressions:[], outreachUnsubscribes:[], outreachBounces:[], outreachApprovalQueue:[], approvalQueue:[], approvals:[], campaignActivities:[],
    pilots:[], tasks:[], evidencePackNotes:[], automationEvents:[], companyEvents:[], auditHistory:[],
    activityEvents:[
      { id:"activity-meeting-community", eventType:"meeting_completed", title:"Pilot scope meeting", partnerId:"partner-community", createdAt:"2026-07-18T15:00:00.000Z" },
      { id:"activity-note-workforce", eventType:"note_added", title:"Decision owner remains open", partnerId:"partner-workforce", createdAt:"2026-07-18T12:00:00.000Z" }
    ]
  };
}

export function buildPartnersTrainScenario() {
  const initial = partnersFixtureState();
  const added = createGlobalObject(initial, "partner", { creationRequestId:"train-partner-example-01", organizationName:"Neighborhood Support Example", partnerType:"nonprofit", primaryContactName:"Jordan Example", primaryContactEmail:"jordan@example.com", geography:"Georgia", nextAction:"Confirm interest" }, { actor:PARTNERS_FIXTURE_ACTOR, now:PARTNERS_FIXTURE_NOW });
  const newPartnerId = added.record.id;
  const next = setPartnerNextAction(added.state, newPartnerId, { requestId:"train-next-action-0001", summary:"Schedule a reviewed introduction", dueAt:"2026-07-22" }, { actor:PARTNERS_FIXTURE_ACTOR, now:PARTNERS_FIXTURE_NOW });
  const completed = completePartnerNextAction(next.state, newPartnerId, { requestId:"train-complete-action-01" }, { actor:PARTNERS_FIXTURE_ACTOR, now:"2026-07-20T12:00:00.000Z" });
  const campaign = createPartnerCampaignDraft(completed.state, { requestId:"train-campaign-example-01", partnerIds:[newPartnerId], campaignName:"Neighborhood planning follow-up", goal:"Invite a reviewed planning conversation" }, { actor:PARTNERS_FIXTURE_ACTOR, now:"2026-07-20T12:10:00.000Z" });
  const reply = { id:"reply-train-reviewed", campaign_id:campaign.record.id, partnerId:newPartnerId, replied_at:"2026-07-20T13:00:00.000Z", classification:"meeting_requested", classificationReviewed:true, body:"Synthetic private reply body." };
  const withReply = { ...campaign.state, outreachReplies:[reply, ...campaign.state.outreachReplies] };
  const outreach = buildPartnerOutreachIntegration(withReply, PARTNERS_FIXTURE_ACTOR, newPartnerId, "2026-07-20T13:10:00.000Z");
  const stage = applyPartnerStageSuggestion(withReply, newPartnerId, { requestId:"train-stage-apply-0001", suggestionId:outreach.suggestions[0].id, confirmed:true }, { actor:PARTNERS_FIXTURE_ACTOR, now:"2026-07-20T13:15:00.000Z" });
  const program = createPartnerProgramRecord(stage.state, newPartnerId, { requestId:"train-program-example-001", name:"Neighborhood access program", packageTier:"starter", programGoal:"Support a reviewed access pilot" }, { actor:PARTNERS_FIXTURE_ACTOR, now:"2026-07-20T14:00:00.000Z" });
  const proposal = generatePartnerArtifact(program.state, newPartnerId, program.program.id, { requestId:"train-proposal-example01", artifactType:"proposal" }, { actor:PARTNERS_FIXTURE_ACTOR, now:"2026-07-20T14:10:00.000Z" });
  return Object.freeze({ initial, state:proposal.state, newPartnerId, added, next, completed, campaign, reply, outreach, stage, program, proposal });
}
