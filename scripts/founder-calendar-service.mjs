import { recordVisibleToActor } from "./global-search-service.mjs";
import { normalizeRole, roleHasCapability } from "./roles.mjs";
import { normalizeTaskRecord } from "./tasks-engine.mjs";
import { buildExactObjectLink } from "./ui/route-compatibility.mjs";

const DAY_MS = 86_400_000;
const REQUEST_ID = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const ACTIONS = new Set(["create_preparation_task", "create_follow_up_task"]);
const RANGE_KEYS = new Set(["all", "today", "this_week", "upcoming"]);

export const FOUNDER_CALENDAR_CATEGORIES = Object.freeze([
  "Partner meeting",
  "Investor meeting",
  "Customer call",
  "Internal meeting",
  "Other"
]);

export const FOUNDER_CALENDAR_ACTIONS = Object.freeze([
  "create_preparation_task",
  "create_follow_up_task",
  "open_google_event",
  "create_google_event"
]);

export const FOUNDER_CALENDAR_READ_COLLECTIONS = Object.freeze([
  "activityEvents",
  "auditHistory",
  "automationEvents",
  "companyContacts",
  "googleInsights",
  "meetingBriefs",
  "partners",
  "tasks"
]);

const CATEGORY_SET = new Set(FOUNDER_CALENDAR_CATEGORIES);
const CATEGORY_ORDER = new Map(FOUNDER_CALENDAR_CATEGORIES.map((category, index) => [category, index]));

export class FounderCalendarError extends Error {
  constructor(message, status = 400, outcome = "invalid") {
    super(message);
    this.name = "FounderCalendarError";
    this.status = status;
    this.outcome = outcome;
    this.safeMessage = message;
  }
}

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function timestamp(value = "") {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function dateOnly(value = "") {
  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00.000Z`)) ? text : "";
}

function founderText(value = "", fallback = "", maximum = 260) {
  let text = clean(value || fallback)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/<\s*\/?\s*(?:script|iframe|object|embed|svg)[^>]*>/giu, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[guest]")
    .replace(/\b(?:state mutation|provider payload|collection|engine execution)\b/giu, "update")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) text = clean(fallback);
  return text.length > maximum ? `${text.slice(0, maximum - 1).trimEnd()}…` : text;
}

function safeText(value, label, maximum, required = false) {
  const text = clean(value);
  if (required && !text) throw new FounderCalendarError(`${label} is required. No changes were made.`);
  if (text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/u.test(text)) {
    throw new FounderCalendarError(`${label} contains unsupported text. No changes were made.`);
  }
  return text;
}

function contextFor(actor = {}, capability = "read_internal") {
  const role = normalizeRole(actor.role);
  const authenticated = actor?.authenticated === true && Boolean(clean(actor.id));
  return {
    role,
    id:clean(actor.id),
    allowed:authenticated && roleHasCapability(role, capability),
    label:founderText(actor.label || actor.displayName || actor.name || (role === "owner" ? "Roger" : role), "Owner", 80)
  };
}

function visible(state = {}, collection = "", role = "viewer") {
  return list(state[collection]).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role));
}

function recordId(record = {}) {
  return clean(record.id || record.event_id || record.eventId || record.sourceEventId || record.sourceRefHash || record.slug);
}

function eventKey(record = {}) {
  return clean(record.event_id || record.eventId || record.calendarEventId || record.sourceEventIdHash || record.sourceRefHash || record.id);
}

function sourceVersion(record = {}) {
  return timestamp(record.updated_at || record.updatedAt || record.generated_at || record.createdAt || record.created_at || record.start_at) || "legacy";
}

function startFor(record = {}) {
  const raw = record.rawPayload && typeof record.rawPayload === "object" ? record.rawPayload : {};
  const value = record.start_at || record.startAt || record.startsAt || record.startTime || record.eventStart || record.date
    || raw.startTime || raw.startsAt || raw.start?.dateTime || raw.start?.date;
  return dateOnly(value) || timestamp(value);
}

function endFor(record = {}) {
  const raw = record.rawPayload && typeof record.rawPayload === "object" ? record.rawPayload : {};
  const value = record.end_at || record.endAt || record.endsAt || record.endTime
    || raw.endTime || raw.endsAt || raw.end?.dateTime || raw.end?.date;
  return dateOnly(value) || timestamp(value);
}

function validTimeZone(value = "") {
  const timeZone = clean(value) || "America/Chicago";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    throw new FounderCalendarError("Choose a valid calendar time zone.");
  }
}

function localDateKey(value = "", timeZone = "America/Chicago") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean(value))) return clean(value);
  const parsed = Date.parse(clean(value));
  if (!Number.isFinite(parsed)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(new Date(parsed));
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dayDistance(fromKey = "", toKey = "") {
  const from = Date.parse(`${fromKey}T12:00:00.000Z`);
  const to = Date.parse(`${toKey}T12:00:00.000Z`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / DAY_MS) : null;
}

function safeCalendarUrl(value = "") {
  const text = clean(value);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:"
      && parsed.hostname === "calendar.google.com"
      && !parsed.username
      && !parsed.password
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function calendarToken(value = "") {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replaceAll("-", "");
  const normalized = timestamp(text);
  return normalized ? normalized.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z") : "";
}

function defaultEnd(start = "") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean(start))) {
    const next = new Date(`${start}T12:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }
  const parsed = Date.parse(clean(start));
  return Number.isFinite(parsed) ? new Date(parsed + 60 * 60 * 1000).toISOString() : "";
}

export function buildGoogleCalendarCreateUrl(input = {}) {
  const title = safeText(input.title, "Event title", 180, true);
  const start = clean(input.start);
  const startToken = calendarToken(start);
  if (!startToken) throw new FounderCalendarError("Choose a valid event start time.");
  const end = clean(input.end) || defaultEnd(start);
  const endToken = calendarToken(end);
  if (!endToken || Date.parse(end) < Date.parse(start)) throw new FounderCalendarError("Choose a valid event end time.");
  const details = safeText(input.details, "Event details", 1000);
  const location = safeText(input.location, "Event location", 240);
  const params = new URLSearchParams({ action:"TEMPLATE", text:title, dates:`${startToken}/${endToken}` });
  if (details) params.set("details", details);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function relationshipFor(state = {}, record = {}, role = "viewer") {
  const directPartnerId = clean(record.partnerId || record.partner_id || record.relatedPartnerId);
  const known = list(record.known_attendees || record.knownAttendees);
  const relatedId = clean(record.relatedEntityId || record.relationshipId);
  const organizations = new Set([
    clean(record.organization || record.organizationName),
    ...known.map((entry) => clean(entry.organization))
  ].filter(Boolean).map(lower));
  const partners = visible(state, "partners", role);
  let partner = directPartnerId ? partners.find((entry) => recordId(entry) === directPartnerId) : null;
  if (!partner && relatedId) partner = partners.find((entry) => recordId(entry) === relatedId) || null;
  if (!partner && organizations.size) {
    partner = partners.find((entry) => organizations.has(lower(entry.organizationName || entry.organization || entry.name))) || null;
  }
  if (partner) {
    const id = recordId(partner);
    return {
      id:`partner:${id}`,
      kind:"partner",
      label:founderText(partner.organizationName || partner.organization || partner.name, "Partner", 120),
      partnerId:id,
      href:buildExactObjectLink({ objectType:"Partner", sourceKind:"partner", sourceId:id })?.target || "#partners"
    };
  }
  const contactId = clean(known[0]?.contactId || record.contactId);
  if (contactId) {
    const contact = [
      ...visible(state, "companyContacts", role),
      ...visible(state, "contacts", role)
    ].find((entry) => recordId(entry) === contactId || clean(entry.contact_id) === contactId);
    if (contact) return {
      id:`contact:${contactId}`,
      kind:"contact",
      label:founderText(contact.organization || contact.organizationName || contact.name, "Relationship", 120),
      partnerId:"",
      href:`#partners?relationship=${encodeURIComponent(`contact:${contactId}`)}`
    };
  }
  return null;
}

function attendeeNames(record = {}) {
  return list(record.attendees).filter((attendee) => attendee && attendee.self !== true).map((attendee) =>
    founderText(attendee.name || attendee.displayName, "Guest", 80)
  ).filter(Boolean).slice(0, 20);
}

function categoryFor(record = {}, relationship = null) {
  const attendees = list(record.attendees);
  const raw = lower([
    record.category,
    record.meetingType,
    record.title,
    record.summary,
    record.insightType,
    record.suggestedQueueItemType,
    record.organization,
    relationship?.label,
    list(record.known_attendees || record.knownAttendees).map((entry) => [entry.relationship, entry.organization]),
    attendees.map((entry) => [entry.name, entry.displayName, entry.email])
  ].flat(4).join(" "));
  if (/\binternal|team meeting|staff|standup|one on one|1:1|legalease\.com/u.test(raw)
    || (attendees.length > 0 && attendees.every((entry) => entry.self === true))) return "Internal meeting";
  if (/\binvestor|investment|venture|fund(?:er|ing)?\b|capital partner/u.test(raw)) return "Investor meeting";
  if (/\bcustomer|client|support|intake|onboarding call|demo call/u.test(raw)) return "Customer call";
  if (relationship?.kind === "partner" || /\bpartner|partnership|pilot|referral|legal aid|nonprofit|workforce|county/u.test(raw)) return "Partner meeting";
  return "Other";
}

function sourceSummary(record = {}, category = "") {
  const fallback = category === "Partner meeting" ? "Review the relationship and desired meeting outcome."
    : category === "Investor meeting" ? "Review the latest investor context and the decision you need."
      : category === "Customer call" ? "Review the customer context and open commitments."
        : category === "Internal meeting" ? "Confirm the decisions and owners needed from this meeting."
          : "Review the event details and prepare the desired outcome.";
  const talkingPoint = list(record.talking_points || record.talkingPoints)[0];
  return founderText(record.inferredReason || talkingPoint || record.safeSummary, fallback, 300);
}

function normalizedSourceRecord(collection = "", record = {}, priority = 99) {
  const raw = record.rawPayload && typeof record.rawPayload === "object" ? record.rawPayload : {};
  return {
    collection,
    record,
    priority,
    key:eventKey(record),
    id:recordId(record),
    title:founderText(record.title || record.name || record.subject || raw.summary, "Calendar event", 180),
    start:startFor(record),
    end:endFor(record),
    location:founderText(record.location || raw.location, "", 180),
    openHref:safeCalendarUrl(record.htmlLink || record.googleCalendarUrl || record.eventUrl || raw.htmlLink)
  };
}

function calendarSources(state = {}, context = {}) {
  const definitions = [
    ["meetingBriefs", 10, () => true],
    ["calendarSignals", 20, () => true],
    ["googleCalendarSignals", 30, () => true],
    ["googleInsights", 40, (record) => lower(record.source) === "calendar" || /meeting|calendar/u.test(lower(record.insightType || record.suggestedQueueItemType))],
    ["automationEvents", 50, (record) => /meeting|calendar|call/u.test(lower([record.source, record.sourceType, record.eventType, record.title, record.summary].join(" ")))]
  ];
  const groups = new Map();
  for (const [collection, priority, include] of definitions) {
    for (const record of visible(state, collection, context.role)) {
      if (!include(record) || /cancelled|deleted|dismissed/u.test(lower(record.status))) continue;
      const normalized = normalizedSourceRecord(collection, record, priority);
      if (!normalized.key || !normalized.start) continue;
      const group = groups.get(normalized.key) || [];
      group.push(normalized);
      groups.set(normalized.key, group);
    }
  }
  return [...groups.values()].map((records) => records.sort((left, right) => left.priority - right.priority));
}

function eventProjection(state = {}, records = [], context = {}, nowIso = "", timeZone = "America/Chicago") {
  const primary = records[0];
  const record = primary.record;
  const relationship = relationshipFor(state, record, context.role)
    || records.map((source) => relationshipFor(state, source.record, context.role)).find(Boolean)
    || null;
  const category = categoryFor(record, relationship);
  const start = primary.start || records.map((source) => source.start).find(Boolean);
  const end = primary.end || records.map((source) => source.end).find(Boolean) || defaultEnd(start);
  const nowMs = Date.parse(nowIso);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const todayKey = localDateKey(nowIso, timeZone);
  const eventKeyValue = localDateKey(start, timeZone);
  const distance = dayDistance(todayKey, eventKeyValue);
  const phase = Number.isFinite(endMs) && endMs < nowMs ? "past"
    : Number.isFinite(startMs) && startMs <= nowMs ? "in progress" : "upcoming";
  const openHref = records.map((source) => source.openHref).find(Boolean) || "https://calendar.google.com/calendar/u/0/r";
  const title = primary.title || records.map((source) => source.title).find(Boolean) || "Calendar event";
  const location = primary.location || records.map((source) => source.location).find(Boolean) || "";
  let createSimilarHref = null;
  try {
    createSimilarHref = buildGoogleCalendarCreateUrl({ title, start, end, details:sourceSummary(record, category), location });
  } catch {
    createSimilarHref = null;
  }
  const relatedIds = new Set(records.flatMap((source) => [source.id, source.key]).filter(Boolean));
  const openTaskCount = visible(state, "tasks", context.role).filter((task) => {
    const status = lower(task.status);
    return !["done", "completed", "closed", "archived", "dismissed"].includes(status)
      && (relatedIds.has(clean(task.sourceId)) || clean(task.calendarEventId) === primary.key);
  }).length;
  return {
    id:`event:${primary.key}`,
    source:{ kind:primary.collection, id:primary.id, eventKey:primary.key, version:sourceVersion(record) },
    title,
    summary:sourceSummary(record, category),
    start,
    end,
    location,
    phase,
    category,
    attendeeNames:attendeeNames(record),
    attendeeCount:list(record.attendees).filter((attendee) => attendee && attendee.self !== true).length,
    relationship,
    openTaskCount,
    isToday:distance === 0,
    isThisWeek:Number.isFinite(distance) && distance >= 0 && distance <= 7,
    openGoogleHref:openHref,
    createSimilarHref,
    actions:{
      createPreparationTask:roleHasCapability(context.role, "manage_tasks"),
      createFollowUpTask:roleHasCapability(context.role, "manage_tasks"),
      openGoogleEvent:true,
      createGoogleEvent:Boolean(createSimilarHref)
    },
    safety:{ calendarWrites:false, externalActions:0 }
  };
}

function normalizedQuery(query = {}) {
  const range = lower(query.range || "all");
  if (!RANGE_KEYS.has(range)) throw new FounderCalendarError("Choose a supported calendar range.");
  const category = clean(query.category);
  if (category && !CATEGORY_SET.has(category)) throw new FounderCalendarError("Choose a supported meeting type.");
  return {
    range,
    category,
    search:founderText(query.search, "", 100).toLocaleLowerCase("en-US"),
    timeZone:validTimeZone(query.timeZone)
  };
}

function eventSort(left = {}, right = {}) {
  return clean(left.start).localeCompare(clean(right.start))
    || (CATEGORY_ORDER.get(left.category) ?? 99) - (CATEGORY_ORDER.get(right.category) ?? 99)
    || left.id.localeCompare(right.id, "en-US");
}

export function buildFounderCalendarView(state = {}, actor = {}, now = new Date().toISOString(), rawQuery = {}) {
  const context = contextFor(actor);
  const generatedAt = timestamp(now);
  if (!context.allowed || !generatedAt) {
    return deepFreeze({
      ok:Boolean(generatedAt),
      authorized:false,
      available:false,
      generatedAt:generatedAt || null,
      categories:FOUNDER_CALENDAR_CATEGORIES,
      counts:{ total:0, visible:0, today:0, thisWeek:0, upcomingPartnerMeetings:0, investorMeetings:0, customerCalls:0, internalMeetings:0 },
      sections:{ today:[], thisWeek:[], upcomingPartnerMeetings:[], investorMeetings:[], customerCalls:[], internalMeetings:[] },
      items:[],
      safety:{ readOnly:true, calendarWrites:false, externalActions:0 }
    });
  }
  const query = normalizedQuery(rawQuery);
  const nowMs = Date.parse(generatedAt);
  const all = calendarSources(state, context)
    .map((records) => eventProjection(state, records, context, generatedAt, query.timeZone))
    .filter((event) => {
      const end = Date.parse(event.end || event.start);
      const start = Date.parse(event.start);
      return (!Number.isFinite(end) || end >= nowMs - 2 * DAY_MS)
        && (!Number.isFinite(start) || start <= nowMs + 31 * DAY_MS);
    })
    .sort(eventSort);
  const section = (predicate) => all.filter(predicate);
  const sections = {
    today:section((event) => event.isToday),
    thisWeek:section((event) => event.isThisWeek),
    upcomingPartnerMeetings:section((event) => event.category === "Partner meeting" && event.phase !== "past"),
    investorMeetings:section((event) => event.category === "Investor meeting" && event.phase !== "past"),
    customerCalls:section((event) => event.category === "Customer call"),
    internalMeetings:section((event) => event.category === "Internal meeting")
  };
  const items = all.filter((event) => {
    if (query.range === "today" && !event.isToday) return false;
    if (query.range === "this_week" && !event.isThisWeek) return false;
    if (query.range === "upcoming" && event.phase === "past") return false;
    if (query.category && event.category !== query.category) return false;
    if (!query.search) return true;
    return lower([event.title, event.summary, event.category, event.relationship?.label, event.attendeeNames].flat().join(" ")).includes(query.search);
  });
  return deepFreeze({
    ok:true,
    authorized:true,
    available:true,
    generatedAt,
    timeZone:query.timeZone,
    categories:FOUNDER_CALENDAR_CATEGORIES,
    query:{ range:query.range, category:query.category || null, search:query.search || null },
    counts:{
      total:all.length,
      visible:items.length,
      today:sections.today.length,
      thisWeek:sections.thisWeek.length,
      upcomingPartnerMeetings:sections.upcomingPartnerMeetings.length,
      investorMeetings:sections.investorMeetings.length,
      customerCalls:sections.customerCalls.length,
      internalMeetings:sections.internalMeetings.length
    },
    sections,
    items,
    createEvent:{
      available:true,
      provider:"Google Calendar",
      hrefTemplate:"https://calendar.google.com/calendar/render?action=TEMPLATE",
      writesFromCommandCenter:false
    },
    safety:{ readOnly:true, calendarWrites:false, externalActions:0 }
  });
}

const ACTION_KEYS = new Set(["eventId", "action", "requestId", "expectedVersion", "title", "dueDate", "note"]);

function parseAction(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new FounderCalendarError("The Calendar action request is invalid. No changes were made.");
  if (Object.keys(payload).some((key) => !ACTION_KEYS.has(key))) throw new FounderCalendarError("The Calendar action contains unsupported information. No changes were made.");
  const eventId = safeText(payload.eventId, "Calendar event", 320, true);
  const action = lower(safeText(payload.action, "Action", 48, true));
  const requestId = safeText(payload.requestId, "Request ID", 96, true);
  const expectedVersion = safeText(payload.expectedVersion, "Event version", 80, true);
  if (!ACTIONS.has(action)) throw new FounderCalendarError("This Calendar action is not available. No changes were made.");
  if (!REQUEST_ID.test(requestId)) throw new FounderCalendarError("The Calendar action request is invalid. No changes were made.");
  if (expectedVersion !== "legacy" && !timestamp(expectedVersion)) throw new FounderCalendarError("The Calendar event version is invalid. No changes were made.");
  const title = safeText(payload.title, "Task title", 180);
  const note = safeText(payload.note, "Task note", 500);
  const dueDate = payload.dueDate === undefined ? "" : dateOnly(payload.dueDate);
  if (payload.dueDate !== undefined && !dueDate) throw new FounderCalendarError("Choose a valid task due date. No changes were made.");
  return { eventId, action, requestId, expectedVersion, title, note, dueDate };
}

function taskForEvent(event = {}, parsed = {}, now = "") {
  const preparation = parsed.action === "create_preparation_task";
  const eventDate = localDateKey(event.start, "America/Chicago") || now.slice(0, 10);
  const due = parsed.dueDate || (eventDate < now.slice(0, 10) ? now.slice(0, 10) : eventDate);
  const defaultTitle = preparation ? `Prepare for: ${event.title}` : `Follow up after: ${event.title}`;
  const nextAction = preparation
    ? "Review the relationship, desired outcome, agenda, and questions."
    : "Capture decisions, owners, commitments, and the next follow-up date.";
  return normalizeTaskRecord({
    id:`task-calendar-${parsed.requestId.toLocaleLowerCase("en-US")}`,
    title:parsed.title || defaultTitle,
    description:parsed.note || event.summary,
    owner:"Roger",
    status:"open",
    priority:event.category === "Customer call" ? "high" : "medium",
    dueDate:due,
    sourceType:"google_calendar",
    sourceId:event.source.id,
    partnerId:event.relationship?.partnerId || "",
    nextAction,
    calendarEventId:event.source.eventKey,
    escalationReason:preparation ? "Upcoming meeting preparation." : "Post-meeting follow-up.",
    escalationKey:`calendar-${preparation ? "prep" : "follow-up"}:${event.source.eventKey}`,
    history:[{ action:"created", at:now, note:"Created from read-only Calendar context. No event or invitation was changed." }]
  }, { now });
}

function evidence(state = {}, event = {}, parsed = {}, actor = {}, now = "", task = {}) {
  const message = parsed.action === "create_preparation_task" ? "Meeting preparation task created." : "Post-meeting follow-up task created.";
  return {
    ...state,
    auditHistory:[{
      id:`audit-founder-calendar-${parsed.requestId}`,
      timestamp:now,
      actor:clean(actor.id || actor.role) || "authenticated_user",
      action:parsed.action,
      resourceType:"Calendar event",
      resourceId:event.source.id,
      relatedTaskId:task.id,
      summary:message,
      externalSideEffects:false,
      calendarChanged:false
    }, ...list(state.auditHistory)].slice(0, 1000),
    activityEvents:[{
      id:`activity-founder-calendar-${parsed.requestId}`,
      eventType:"Calendar follow-up task created",
      title:message,
      relatedObjectType:"calendar_event",
      relatedObjectId:event.source.id,
      createdAt:now,
      metadata:{ taskId:task.id, calendarChanged:false, invitationSent:false, externalSideEffects:false }
    }, ...list(state.activityEvents)].slice(0, 500)
  };
}

function changedCollections(before = {}, after = {}) {
  return Object.freeze(Object.fromEntries(["tasks", "auditHistory", "activityEvents"]
    .filter((name) => before[name] !== after[name])
    .map((name) => [name, after[name]])));
}

export function executeFounderCalendarAction(state = {}, actor = {}, now = new Date().toISOString(), payload = {}) {
  const parsed = parseAction(payload);
  const nowIso = timestamp(now);
  if (!nowIso) throw new FounderCalendarError("Calendar actions are temporarily unavailable. No changes were made.", 500, "temporary_failure");
  const context = contextFor(actor, "manage_tasks");
  if (!context.allowed) throw new FounderCalendarError("This Calendar action is not available for this account.", 403, "not_allowed");
  const auditId = `audit-founder-calendar-${parsed.requestId}`;
  if (list(state.auditHistory).some((row) => clean(row.id) === auditId)) {
    return Object.freeze({ ok:true, alreadyApplied:true, state, collections:Object.freeze({}), result:Object.freeze({ message:"This Calendar task was already created.", calendarChanged:false, externalActions:0 }) });
  }
  const event = buildFounderCalendarView(state, actor, nowIso, { range:"all" }).items.find((candidate) => candidate.id === parsed.eventId);
  if (!event) throw new FounderCalendarError("This Calendar event changed. Refresh and try again.", 409, "stale");
  if (event.source.version !== parsed.expectedVersion) throw new FounderCalendarError("This Calendar event changed. Refresh and try again.", 409, "stale");
  const task = taskForEvent(event, parsed, nowIso);
  const existing = list(state.tasks).find((record) => recordId(record) === task.id);
  let next = existing ? state : { ...state, tasks:[task, ...list(state.tasks)] };
  next = evidence(next, event, parsed, actor, nowIso, existing || task);
  return Object.freeze({
    ok:true,
    alreadyApplied:false,
    state:next,
    collections:changedCollections(state, next),
    result:Object.freeze({
      eventId:event.id,
      action:parsed.action,
      taskId:(existing || task).id,
      message:parsed.action === "create_preparation_task" ? "Meeting preparation task created." : "Post-meeting follow-up task created.",
      calendarChanged:false,
      invitationSent:false,
      externalActions:0
    })
  });
}

export function founderCalendarSafeError(error = {}) {
  const known = error instanceof FounderCalendarError;
  return deepFreeze({
    status:Number(error?.status || 500),
    body:{
      ok:false,
      outcome:known ? error.outcome : "temporary_failure",
      message:known ? error.message : "Calendar could not be changed. No changes were made. Try again."
    }
  });
}
