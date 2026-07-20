import { buildPartnerActivity } from "./partner-activity.mjs";
import { buildPartnerStageViews } from "./partner-stage.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const PARTNERS_HOME_VIEWS = Object.freeze([
  Object.freeze({ key:"list", label:"List" }),
  Object.freeze({ key:"pipeline", label:"Pipeline" }),
  Object.freeze({ key:"needs_follow_up", label:"Needs follow-up" }),
  Object.freeze({ key:"active_programs", label:"Active programs" })
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validTimestamp(value = "") {
  const text = clean(value);
  return text && Number.isFinite(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text)) ? text : null;
}

function health(view = {}) {
  if (view.relationship?.attention?.available) return { key:"needs_attention", label:"Needs attention", available:true };
  const key = lower(view.relationship?.health).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");
  if (["healthy", "good", "on_track", "green"].includes(key)) return { key:"on_track", label:"On track", available:true };
  if (["watch", "at_risk", "unhealthy", "poor", "critical", "blocked"].includes(key)) return { key:"needs_attention", label:"Needs attention", available:true };
  if (key) return { key:"recorded", label:key.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase()), available:true };
  return { key:"unavailable", label:"Unavailable", available:false };
}

function lastContact(activity = {}, fallback = {}) {
  const event = list(activity.events).find((item) => ["reply", "meeting", "outreach"].includes(item.type));
  if (event) return { available:true, occurredAt:event.occurredAt, kind:event.type, label:event.label, sourceHref:event.sourceHref };
  const fallbackKind = lower(fallback.kind);
  if (fallback.available && /contact|touch|response|outreach|meeting|reply/.test(fallbackKind)) {
    return { available:true, occurredAt:fallback.occurredAt, kind:fallbackKind, label:"Partner contact", sourceHref:null };
  }
  return { available:false, occurredAt:null, kind:null, label:"Unavailable", sourceHref:null };
}

function dueState(dueAt, now) {
  if (!dueAt) return { key:"unavailable", label:"Unavailable", overdue:false };
  const due = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(dueAt) ? `${dueAt}T23:59:59.999Z` : dueAt);
  const current = Date.parse(now);
  const overdue = Number.isFinite(due) && due < current;
  return { key:overdue ? "overdue" : "upcoming", label:overdue ? "Overdue" : "Upcoming", overdue };
}

function compactPartner(view, now) {
  const programs = list(view.pilotAndProgramContext?.programs).map((program) => ({
    id:program.id,
    name:program.name,
    status:clean(program.status) || null,
    owner:clean(program.owner) || null
  }));
  const dueAt = validTimestamp(view.nextAction?.dueAt);
  return {
    id:view.source.sourceId,
    stableIdentity:view.stableIdentity,
    partner:{ name:view.name || "Unnamed Partner", href:view.exactPartnerLink },
    stage:view.uiStage,
    outcome:view.outcome?.available ? view.outcome : null,
    health:health(view),
    owner:view.owner || null,
    nextAction:view.nextAction?.summary || null,
    dueAt,
    dueState:dueState(dueAt, now),
    lastContact:lastContact({}, view.lastMeaningfulActivity),
    programs,
    programOrOpportunity:programs[0]?.name || list(view.pilotAndProgramContext?.pilots)[0]?.name || null,
    sourceReferences:view.sourceReferences,
    changesInternalLifecycle:false
  };
}

function enrichPartner(item, state, actor, now) {
  const activity = buildPartnerActivity(state, actor, item.id, now);
  return { ...item, lastContact:lastContact(activity, item.lastContact) };
}

function options(items, field, labelFor = (value) => value) {
  const values = new Map();
  for (const item of items) {
    const value = field(item);
    if (clean(value)) values.set(clean(value), labelFor(value, item));
  }
  return [...values].sort((left, right) => String(left[1]).localeCompare(String(right[1]), "en-US"))
    .map(([key, label]) => ({ key, label, count:items.filter((item) => clean(field(item)) === key).length }));
}

function matches(item, query) {
  const search = lower(query.search);
  if (search) {
    const haystack = lower([item.partner.name, item.owner, item.nextAction, item.programOrOpportunity].filter(Boolean).join(" "));
    if (!haystack.includes(search)) return false;
  }
  if (query.stage && item.stage.key !== query.stage) return false;
  if (query.owner && lower(item.owner) !== query.owner) return false;
  if (query.health && item.health.key !== query.health) return false;
  if (query.view === "needs_follow_up" && !(item.dueState.overdue || item.health.key === "needs_attention")) return false;
  if (query.view === "active_programs" && !(item.programs.some((program) => /active|reporting|renewal|expansion/.test(lower(program.status))) || item.stage.key === "active")) return false;
  return true;
}

function sorted(items, view) {
  return [...items].sort((left, right) => {
    if (view === "needs_follow_up") return Number(right.dueState.overdue) - Number(left.dueState.overdue)
      || clean(left.dueAt).localeCompare(clean(right.dueAt), "en-US")
      || left.partner.name.localeCompare(right.partner.name, "en-US");
    return left.partner.name.localeCompare(right.partner.name, "en-US") || left.id.localeCompare(right.id, "en-US");
  });
}

function pipeline(items) {
  const order = ["new", "qualified", "in_conversation", "proposal", "active", "closed", "unavailable"];
  return order.map((key) => ({
    key,
    label:items.find((item) => item.stage.key === key)?.stage.label || (key === "unavailable" ? "Stage unavailable" : key),
    items:items.filter((item) => item.stage.key === key)
  })).filter((group) => group.items.length);
}

export function buildPartnersHomeView(state = {}, actor = {}, now = "", query = {}) {
  const sourceAvailable = Array.isArray(state.partners);
  const views = buildPartnerStageViews(state, actor);
  if (!sourceAvailable) return deepFreeze({ available:false, availability:{ state:"unavailable", reason:"source_data_absent" }, generatedAt:now || null, items:[], pipeline:[], filters:null, summary:null });
  // Partner activity is a detail-grade ledger projection. Keep filtering, counts, and
  // visibility over the full authorized summary set, then enrich only the requested page.
  const allItems = views.map((view) => compactPartner(view, now));
  const filtered = sorted(allItems.filter((item) => matches(item, query)), query.view);
  const offset = Number(query.offset || 0);
  const limit = Number(query.limit || 24);
  const items = filtered.slice(offset, offset + limit)
    .map((item) => enrichPartner(item, state, actor, now));
  return deepFreeze({
    available:true,
    availability:{ state:allItems.length ? filtered.length ? "available" : "filtered_empty" : "empty", reason:null },
    generatedAt:now,
    selectedView:query.view,
    views:PARTNERS_HOME_VIEWS,
    items,
    pipeline:query.view === "pipeline" ? pipeline(items) : [],
    filters:{
      stages:options(allItems, (item) => item.stage.key, (_value, item) => item.stage.label),
      owners:options(allItems, (item) => lower(item.owner), (_value, item) => item.owner),
      health:options(allItems, (item) => item.health.key, (_value, item) => item.health.label)
    },
    summary:{
      authorizedPartners:allItems.length,
      matchingPartners:filtered.length,
      overdueFollowUps:allItems.filter((item) => item.dueState.overdue).length,
      activePrograms:allItems.filter((item) => item.programs.some((program) => /active|reporting|renewal|expansion/.test(lower(program.status)))).length
    },
    pagination:{ offset, limit, returned:items.length, hasMore:offset + items.length < filtered.length },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0, changesInternalLifecycle:false }
  });
}
