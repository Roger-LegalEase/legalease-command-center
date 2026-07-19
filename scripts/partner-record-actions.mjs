import { recordVisibleToActor } from "./global-search-service.mjs";
import { roleHasCapability, roles } from "./roles.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const requestPattern = /^[a-z0-9][a-z0-9_-]{15,95}$/i;

export class PartnerActionError extends Error {
  constructor(message, status = 400) { super(message); this.name = "PartnerActionError"; this.status = status; this.safeMessage = message; }
}

function authorize(actor, capability) {
  const role = clean(actor?.role).toLowerCase();
  if (actor?.authenticated !== true || !roles.includes(role) || !roleHasCapability(role, capability)) throw new PartnerActionError("This Partner action is not available for this account.", 403);
  return role;
}

function requestId(value) {
  const id = clean(value);
  if (!requestPattern.test(id)) throw new PartnerActionError("The Partner action request was invalid. Nothing was saved.");
  return id;
}

function safeText(value, label, maximum = 1000, required = false) {
  const text = clean(value);
  if (required && !text) throw new PartnerActionError(`${label} is required. Nothing was saved.`);
  if (text.length > maximum || /[\u0000-\u001f\u007f<>]/u.test(text) || /(?:bearer\s+|api[_ -]?key|token[=:]|secret[=:]|whsec_)/i.test(text)) throw new PartnerActionError(`${label} contains unsupported content. Nothing was saved.`);
  return text;
}

function context(state, actor, partnerId, capability) {
  const role = authorize(actor, capability);
  const id = clean(partnerId);
  const index = list(state.partners).findIndex((record) => clean(record.id || record.partnerId || record.slug) === id && recordVisibleToActor(record, role));
  if (index < 0) throw new PartnerActionError("Partner was not found or is not available for this account.", 404);
  return { role, id, index, partner:state.partners[index] };
}

function replacePartner(state, index, partner, activity, audit) {
  return {
    ...state,
    partners:state.partners.map((item, itemIndex) => itemIndex === index ? partner : item),
    activityEvents:activity ? [activity, ...list(state.activityEvents)].slice(0, 500) : list(state.activityEvents),
    auditHistory:audit ? [audit, ...list(state.auditHistory)].slice(0, 1000) : list(state.auditHistory)
  };
}

function evidence(kind, id, partnerId, actor, now, metadata = {}) {
  return {
    activity:{ id:`activity-partner-${kind}-${id}`, eventType:kind, title:metadata.title || "Partner activity recorded", partnerId, relatedObjectType:"partner", relatedObjectId:partnerId, createdAt:now, metadata:{ externalAction:false, ...metadata.activityMetadata } },
    audit:{ id:`audit-partner-${kind}-${id}`, timestamp:now, actor:clean(actor.id || actor.role) || "authenticated_user", action:kind, resourceType:"Partner", resourceId:partnerId, externalSideEffects:false }
  };
}

export function logPartnerActivity(state = {}, partnerId = "", input = {}, options = {}) {
  const ctx = context(state, options.actor, partnerId, "add_notes");
  const id = requestId(input.requestId);
  const eventId = `activity-partner-log-${id}`;
  const existing = list(state.activityEvents).find((event) => event.id === eventId);
  if (existing) return Object.freeze({ state, activity:existing, alreadyExisted:true, mutations:0, externalActions:0 });
  const type = clean(input.type).toLowerCase();
  if (!["note_added", "meeting_completed", "reply_recorded", "outreach_recorded"].includes(type)) throw new PartnerActionError("Choose a supported Partner activity. Nothing was saved.");
  const summary = safeText(input.summary, "Activity summary", 500, true);
  const now = safeText(options.now, "Server timestamp", 80, true);
  if (!Number.isFinite(Date.parse(now))) throw new PartnerActionError("A valid server timestamp is required. Nothing was saved.");
  const activity = { id:eventId, eventType:type, title:summary, partnerId:ctx.id, relatedObjectType:"partner", relatedObjectId:ctx.id, createdAt:now, metadata:{ externalAction:false, loggedManually:true } };
  const audit = { id:`audit-partner-log-${id}`, timestamp:now, actor:clean(options.actor.id || options.actor.role), action:"partner_activity_logged", resourceType:"Partner", resourceId:ctx.id, externalSideEffects:false };
  const partner = { ...ctx.partner, lastActivityAt:now, updatedAt:now };
  return Object.freeze({ state:replacePartner(state, ctx.index, partner, activity, audit), activity:Object.freeze(activity), audit:Object.freeze(audit), alreadyExisted:false, mutations:1, externalActions:0 });
}

export function setPartnerNextAction(state = {}, partnerId = "", input = {}, options = {}) {
  const ctx = context(state, options.actor, partnerId, "manage_tasks");
  const id = requestId(input.requestId);
  const summary = safeText(input.summary, "Next action", 500, true);
  const dueAt = safeText(input.dueAt, "Due date", 40, true);
  const now = safeText(options.now, "Server timestamp", 80, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt) || !Number.isFinite(Date.parse(`${dueAt}T00:00:00.000Z`)) || !Number.isFinite(Date.parse(now))) throw new PartnerActionError("Add a valid due date. Nothing was saved.");
  const evidenceItem = evidence("next_action_set", id, ctx.id, options.actor, now, { title:"Partner next action set" });
  const partner = { ...ctx.partner, nextAction:summary, nextActionDueDate:dueAt, nextFollowUpDate:dueAt, updatedAt:now };
  return Object.freeze({ state:replacePartner(state, ctx.index, partner, evidenceItem.activity, evidenceItem.audit), partner:Object.freeze(partner), mutations:1, externalActions:0, internalStageChanged:false });
}

export function completePartnerNextAction(state = {}, partnerId = "", input = {}, options = {}) {
  const ctx = context(state, options.actor, partnerId, "manage_tasks");
  const id = requestId(input.requestId);
  const now = safeText(options.now, "Server timestamp", 80, true);
  if (!Number.isFinite(Date.parse(now))) throw new PartnerActionError("A valid server timestamp is required. Nothing was saved.");
  if (!clean(ctx.partner.nextAction)) throw new PartnerActionError("This Partner has no next action to complete. Nothing was saved.", 409);
  const completedSummary = clean(ctx.partner.nextAction);
  const evidenceItem = evidence("task_completed", id, ctx.id, options.actor, now, { title:completedSummary, activityMetadata:{ completionSource:"partner_record" } });
  const partner = { ...ctx.partner, nextAction:"", nextActionDueDate:"", nextFollowUpDate:"", lastCompletedAction:completedSummary, lastCompletedActionAt:now, updatedAt:now };
  return Object.freeze({ state:replacePartner(state, ctx.index, partner, evidenceItem.activity, evidenceItem.audit), partner:Object.freeze(partner), completedSummary, mutations:1, externalActions:0, internalStageChanged:false });
}
