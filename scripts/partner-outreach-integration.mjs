import { createGlobalObject } from "./global-create-service.mjs";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { partnerFollowUpDraft } from "./partner-lifecycle.mjs";
import { roleHasCapability, roles } from "./roles.mjs";
import { buildCampaignViews } from "./ui/view-models/campaign-view.mjs";
import { buildPartnerActivity } from "./ui/view-models/partner-activity.mjs";
import { adaptPartnerStage, buildPartnerStageView, buildPartnerStageViews } from "./ui/view-models/partner-stage.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const values = (value) => Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
const requestPattern = /^[a-z0-9][a-z0-9_-]{15,95}$/i;

export const PARTNER_OUTREACH_ENDPOINTS = Object.freeze({
  selection:"/api/ui/partners/outreach/selection",
  createCampaign:"/api/ui/partners/outreach/campaign",
  followUp:"/api/ui/partners/:partnerId/outreach/follow-up",
  replySuggestions:"/api/ui/partners/:partnerId/outreach/reply-suggestions",
  applyStageSuggestion:"/api/ui/partners/:partnerId/stage-suggestions/:suggestionId/apply"
});

export class PartnerOutreachError extends Error {
  constructor(message, status = 400) { super(message); this.name = "PartnerOutreachError"; this.status = status; this.safeMessage = message; }
}

function authorize(actor, capability = "read_internal") {
  const role = clean(actor?.role).toLowerCase();
  if (actor?.authenticated !== true || !roles.includes(role) || !roleHasCapability(role, capability)) throw new PartnerOutreachError("Partner Outreach is not available for this account.", 403);
  return role;
}

function requestId(value) {
  const id = clean(value);
  if (!requestPattern.test(id)) throw new PartnerOutreachError("The Outreach request was invalid. Nothing was saved.");
  return id;
}

function partnerIds(record = {}) {
  return [...new Set([
    ...values(record.partnerId), ...values(record.partner_id), ...values(record.partnerIds), ...values(record.partner_ids),
    ...values(record.relatedPartnerId), ...values(record.related_partner_id), ...values(record.relatedPartners)
  ].map(clean).filter(Boolean))];
}

function campaignRawRecord(state, view) {
  const collection = view.source.collection;
  if (collection === "reactivationCampaign") return state.reactivationCampaign || null;
  return list(state[collection]).find((record) => clean(record.id || record.campaignId || record.campaign_id || record.slug) === view.source.sourceId) || null;
}

function campaignsForPartner(state, actor, partnerId) {
  return buildCampaignViews(state, actor).filter((view) => {
    const record = campaignRawRecord(state, view);
    return record && partnerIds(record).includes(partnerId);
  }).map((view) => ({
    stableIdentity:view.stableIdentity,
    name:view.name || "Unnamed Campaign",
    type:view.campaignType,
    status:view.status,
    nextAction:view.nextAction,
    href:view.exactSafeSourceLink,
    source:view.source,
    sourceReferences:view.sourceReferences,
    sending:view.sending,
    approval:view.approval
  }));
}

function suppressedPartner(state, record) {
  if (record.suppressed === true || record.doNotContact === true || record.do_not_contact === true || record.unsubscribed === true || record.bounced === true || record.complaint === true) return true;
  const id = clean(record.id || record.partnerId);
  const contacts = [...list(state.outreachContacts), ...list(state.companyContacts)].filter((contact) => partnerIds(contact).includes(id));
  return contacts.some((contact) => contact.suppressed === true || contact.doNotContact === true || contact.do_not_contact === true || contact.unsubscribed === true || contact.bounced === true || contact.complaint === true || /suppressed|unsubscribed|bounced|complaint|ineligible/.test(clean(contact.eligibility || contact.status).toLowerCase()));
}

export function buildPartnerCampaignSelection(state = {}, actor = {}, requestedIds = []) {
  authorize(actor, "read_internal");
  const requested = [...new Set(values(requestedIds).map(clean).filter(Boolean))];
  if (!requested.length || requested.length > 100) throw new PartnerOutreachError("Select between 1 and 100 Partners.");
  const visible = new Map(buildPartnerStageViews(state, actor).map((view) => [view.source.sourceId, view]));
  const raw = new Map(list(state.partners).filter((record) => recordVisibleToActor(record, actor.role)).map((record) => [clean(record.id || record.partnerId), record]));
  const selected = [];
  const excluded = [];
  for (const id of requested) {
    const view = visible.get(id);
    const record = raw.get(id);
    if (!view || !record) { excluded.push({ id:null, reason:"not_available" }); continue; }
    if (suppressedPartner(state, record)) { excluded.push({ id, reason:"suppressed_or_ineligible" }); continue; }
    selected.push({ id, name:view.name, href:view.exactPartnerLink, sourceReference:view.sourceReferences.find((reference) => reference.relationship === "record") });
  }
  return Object.freeze({ requestedCount:requested.length, eligibleCount:selected.length, excludedCount:excluded.length, selected:Object.freeze(selected), excluded:Object.freeze(excluded), serverRevalidated:true, suppressionRechecked:true, browserCanRestoreEligibility:false });
}

export function createPartnerCampaignDraft(state = {}, input = {}, options = {}) {
  authorize(options.actor, "manage_growth");
  const id = requestId(input.requestId);
  const selection = buildPartnerCampaignSelection(state, options.actor, input.partnerIds);
  if (!selection.selected.length) throw new PartnerOutreachError("No eligible Partners remain. Campaign was not created.", 409);
  const created = createGlobalObject(state, "campaign", {
    creationRequestId:id,
    campaignName:clean(input.campaignName),
    campaignType:"partner_outreach",
    goal:clean(input.goal)
  }, { actor:options.actor, now:options.now });
  if (created.result.alreadyExisted) return Object.freeze({ ...created, selection, sends:0, enrollments:0, approvals:0, schedules:0, externalActions:0 });
  const campaigns = created.state.campaigns.map((campaign) => campaign.id === created.record.id ? {
    ...campaign,
    partnerIds:selection.selected.map((partner) => partner.id),
    partnerSelectionSource:"server_revalidated",
    partnerSelectionReferences:selection.selected.map((partner) => partner.sourceReference),
    audienceSelected:false,
    recipients:[],
    recipientCount:0,
    liveMode:false,
    approvalStatus:"not_requested"
  } : campaign);
  const record = campaigns.find((campaign) => campaign.id === created.record.id);
  return Object.freeze({ ...created, state:{ ...created.state, campaigns }, record:Object.freeze(record), selection, sends:0, enrollments:0, approvals:0, schedules:0, externalActions:0 });
}

export function buildOneToOnePartnerFollowUp(state = {}, actor = {}, partnerId = "", now = "") {
  authorize(actor, "manage_growth");
  const id = clean(partnerId);
  const view = buildPartnerStageView(state, `partner:${id}`, actor);
  const record = list(state.partners).find((item) => clean(item.id || item.partnerId) === id && recordVisibleToActor(item, actor.role));
  if (!view || !record) throw new PartnerOutreachError("Partner was not found or is not available for this account.", 404);
  if (suppressedPartner(state, record)) throw new PartnerOutreachError("This Partner is suppressed or ineligible. No follow-up draft was created.", 409);
  const draft = partnerFollowUpDraft(record, { now });
  return Object.freeze({ partner:{ id, name:view.name, href:view.exactPartnerLink }, draft:Object.freeze(draft), status:"draft", reviewRequired:true, suppressionRechecked:true, authorizationRechecked:true, sends:0, enrollments:0, approvals:0, schedules:0, externalActions:0 });
}

const CLASSIFICATION_STAGE_SUGGESTIONS = Object.freeze({ positive_reply:"qualified", meeting_requested:"meeting_requested", proposal_requested:"proposal_sent", not_interested:"closed_lost" });

function reviewedReplySuggestions(state, actor, partnerId, now) {
  const activity = buildPartnerActivity(state, actor, partnerId, now);
  if (!activity.available) return [];
  const replyEvents = new Map(activity.events.filter((event) => event.type === "reply").map((event) => [event.sourceId, event]));
  return list(state.outreachReplies).filter((reply) => replyEvents.has(clean(reply.id || reply.replyId)) && reply.classificationReviewed === true).map((reply) => {
    const replyId = clean(reply.id || reply.replyId);
    const classification = clean(reply.classification || reply.reviewedClassification).toLowerCase();
    const internalStage = CLASSIFICATION_STAGE_SUGGESTIONS[classification];
    const adapted = internalStage ? adaptPartnerStage({ stage:internalStage }) : null;
    if (!adapted || adapted.uiStageKey === "unavailable") return null;
    const event = replyEvents.get(replyId);
    return { id:`partner-stage-suggestion:${partnerId}:${replyId}:${internalStage}`, classification, proposedInternalStage:internalStage, proposedUiStage:{ key:adapted.uiStageKey, label:adapted.uiStageLabel }, evidence:{ sourceCollection:"outreachReplies", sourceId:replyId, sourceHref:event.sourceHref, summary:event.summary, occurredAt:event.occurredAt }, reviewed:true, applied:false, changesPartnerStage:false, requiresExplicitApply:true };
  }).filter(Boolean);
}

export function buildPartnerOutreachIntegration(state = {}, actor = {}, partnerId = "", now = "") {
  authorize(actor, "read_internal");
  const id = clean(partnerId);
  const partner = buildPartnerStageView(state, `partner:${id}`, actor);
  if (!partner) return Object.freeze({ available:false, state:"not_found_or_unauthorized", campaigns:[], suggestions:[] });
  const campaigns = campaignsForPartner(state, actor, id);
  const suggestions = reviewedReplySuggestions(state, actor, id, now);
  return Object.freeze({ available:true, state:campaigns.length ? "available" : "available_empty", partner:{ id, name:partner.name, href:partner.exactPartnerLink }, campaigns:Object.freeze(campaigns), suggestions:Object.freeze(suggestions), actions:Object.freeze({ createCampaign:PARTNER_OUTREACH_ENDPOINTS.createCampaign, followUp:PARTNER_OUTREACH_ENDPOINTS.followUp.replace(":partnerId", encodeURIComponent(id)) }), safety:Object.freeze({ campaignCopies:0, partnerCopies:0, silentStageChanges:0, externalActions:0 }) });
}

export function applyPartnerStageSuggestion(state = {}, partnerId = "", input = {}, options = {}) {
  const role = authorize(options.actor, "manage_growth");
  const id = clean(partnerId);
  const request = requestId(input.requestId);
  if (input.confirmed !== true) throw new PartnerOutreachError("Review and explicitly confirm the stage update. Nothing was saved.");
  const suggestion = reviewedReplySuggestions(state, options.actor, id, options.now).find((item) => item.id === clean(input.suggestionId));
  if (!suggestion) throw new PartnerOutreachError("The reviewed stage suggestion is no longer available. Nothing was saved.", 409);
  const partnerIndex = list(state.partners).findIndex((record) => clean(record.id || record.partnerId) === id && recordVisibleToActor(record, role));
  if (partnerIndex < 0) throw new PartnerOutreachError("Partner was not found or is not available for this account.", 404);
  const existingEventId = `activity-partner-stage-suggestion-${request}`;
  if (list(state.activityEvents).some((event) => event.id === existingEventId)) return Object.freeze({ state, alreadyExisted:true, mutations:0, externalActions:0 });
  const current = state.partners[partnerIndex];
  const now = clean(options.now);
  const updated = { ...current, stage:suggestion.proposedInternalStage, status:suggestion.proposedInternalStage, updatedAt:now, history:[{ id:`history-stage-suggestion-${request}`, action:"stage_changed", fromStage:clean(current.stage || current.status), toStage:suggestion.proposedInternalStage, at:now, sourceRef:{ collection:"outreachReplies", itemId:suggestion.evidence.sourceId }, explicitlyApplied:true }, ...list(current.history)] };
  const activity = { id:existingEventId, eventType:"stage_changed", title:"Reviewed Partner stage update applied", partnerId:id, fromStage:clean(current.stage || current.status), toStage:suggestion.proposedInternalStage, sourceRef:{ collection:"outreachReplies", itemId:suggestion.evidence.sourceId }, createdAt:now, metadata:{ explicitlyApplied:true, externalAction:false } };
  const audit = { id:`audit-partner-stage-suggestion-${request}`, timestamp:now, actor:clean(options.actor.id || options.actor.role), action:"partner_stage_suggestion_applied", resourceType:"Partner", resourceId:id, sourceRef:{ collection:"outreachReplies", itemId:suggestion.evidence.sourceId }, externalSideEffects:false };
  return Object.freeze({ state:{ ...state, partners:state.partners.map((partner, index) => index === partnerIndex ? updated : partner), activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500), auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000) }, partner:Object.freeze(updated), suggestion:Object.freeze({ ...suggestion, applied:true, changesPartnerStage:true }), alreadyExisted:false, mutations:1, externalActions:0 });
}
