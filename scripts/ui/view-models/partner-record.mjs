import { recordVisibleToActor } from "../../global-search-service.mjs";
import { buildPartnerOutreachIntegration } from "../../partner-outreach-integration.mjs";
import { roleHasCapability } from "../../roles.mjs";
import { buildPartnerActivity } from "./partner-activity.mjs";
import { buildPartnerStageView } from "./partner-stage.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();

export const PARTNER_RECORD_TABS = Object.freeze([
  Object.freeze({ key:"overview", label:"Overview" }),
  Object.freeze({ key:"activity", label:"Activity" }),
  Object.freeze({ key:"outreach", label:"Outreach" }),
  Object.freeze({ key:"files", label:"Files" })
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeText(value = "", maximum = 1000) {
  const text = clean(value).replaceAll(/\s+/g, " ").slice(0, maximum);
  if (!text || /[\u0000-\u001f\u007f<>]/u.test(text) || /(?:bearer\s+|api[_ -]?key|token[=:]|secret[=:]|whsec_|(?:^|[^a-z0-9])sk-[a-z0-9_-]{12,})/i.test(text)) return null;
  return text;
}

function rawPartner(state, actor, partnerId) {
  return list(state.partners).find((record) => clean(record.id || record.partnerId || record.slug) === partnerId && recordVisibleToActor(record, actor.role)) || null;
}

function contacts(record, actor) {
  const canRead = roleHasCapability(actor.role, "read_sensitive");
  if (!canRead) return { available:false, reason:"sensitive_access_required", items:[] };
  const candidates = [
    ...list(record.contacts),
    record.primaryContactName || record.email ? { name:record.primaryContactName, title:record.primaryContactTitle, email:record.email || record.primaryContactEmail } : null
  ].filter(Boolean);
  return {
    available:true,
    reason:null,
    items:candidates.map((contact) => ({
      name:safeText(contact.name || contact.fullName, 160),
      title:safeText(contact.title || contact.role, 120),
      email:safeText(contact.email, 254)
    })).filter((contact) => contact.name || contact.title || contact.email)
  };
}

function notes(record, actor) {
  const canRead = roleHasCapability(actor.role, "read_sensitive");
  if (!canRead) return { available:false, reason:"sensitive_access_required", items:[] };
  const values = [...list(record.notes), ...list(record.relationshipNotes), typeof record.notes === "string" ? [record.notes] : []];
  return { available:true, reason:null, items:values.map((note) => safeText(note?.summary || note?.text || note, 500)).filter(Boolean).map((summary) => ({ summary })) };
}

function relationship(record) {
  return {
    type:safeText(record.partnerType || record.type, 100),
    geography:safeText(record.geography || record.regionState || record.jurisdiction, 160),
    opportunity:safeText(record.opportunity || record.programOpportunity || record.programGoal, 240),
    blocker:safeText(record.blocker || record.riskSummary, 240)
  };
}

function programCards(stageView) {
  return list(stageView.pilotAndProgramContext?.programs).map((program) => ({ id:program.id, name:program.name, status:program.status, owner:program.owner }));
}

export function buildPartnerRecordView(state = {}, actor = {}, partnerId = "", now = "", options = {}) {
  const id = clean(partnerId);
  const stageView = buildPartnerStageView(state, `partner:${id}`, actor);
  if (!stageView) return deepFreeze({ available:false, availability:{ state:Array.isArray(state.partners) ? "not_found_or_unauthorized" : "source_data_absent" }, partnerId:id || null, tabs:PARTNER_RECORD_TABS });
  const record = rawPartner(state, actor, id);
  if (!record) return deepFreeze({ available:false, availability:{ state:"not_found_or_unauthorized" }, partnerId:id, tabs:PARTNER_RECORD_TABS });
  const activity = buildPartnerActivity(state, actor, id, now);
  const selectedTab = PARTNER_RECORD_TABS.some((tab) => tab.key === options.tab) ? options.tab : "overview";
  const nextAction = {
    available:Boolean(stageView.nextAction.summary),
    summary:stageView.nextAction.summary,
    dueAt:stageView.nextAction.dueAt,
    completeEndpoint:`/api/ui/partners/${encodeURIComponent(id)}/next-action/complete`
  };
  return deepFreeze({
    available:true,
    availability:{ state:"available" },
    partnerId:id,
    href:stageView.exactPartnerLink,
    header:{
      name:stageView.name || "Unnamed Partner",
      stage:stageView.uiStage,
      outcome:stageView.outcome?.available ? stageView.outcome : null,
      health:stageView.relationship?.attention?.available ? { key:"needs_attention", label:"Needs attention" }
        : stageView.relationship?.health ? { key:"recorded", label:safeText(stageView.relationship.health, 80) } : { key:"unavailable", label:"Unavailable" },
      owner:stageView.owner,
      nextAction
    },
    actions:{
      primary:nextAction.available ? { key:"complete_next_action", label:"Complete next action", endpoint:nextAction.completeEndpoint } : { key:"log_activity", label:"Log activity", endpoint:`/api/ui/partners/${encodeURIComponent(id)}/activity` },
      secondary:[
        { key:"log_activity", label:"Log activity", endpoint:`/api/ui/partners/${encodeURIComponent(id)}/activity`, externalAction:false },
        { key:"create_outreach", label:"Create outreach", endpoint:"/api/ui/create/campaign", opensOnly:true, sends:false, schedules:false, approves:false, enrolls:false },
        { key:"add_file", label:"Add file", endpoint:"/api/ui/create/file", opensOnly:true, uploads:false, shares:false }
      ]
    },
    selectedTab,
    tabs:PARTNER_RECORD_TABS,
    overview:{ relationship:relationship(record), contacts:contacts(record, actor), notes:notes(record, actor), programs:programCards(stageView), sourceReferences:stageView.sourceReferences },
    activity,
    outreach:buildPartnerOutreachIntegration(state, actor, id, now),
    files:{ available:false, state:"integration_pending", items:[] },
    safety:{ internalStageChanged:false, externalActions:0, fullStateReturned:false, sensitiveContentAuthorized:roleHasCapability(actor.role, "read_sensitive") }
  });
}
