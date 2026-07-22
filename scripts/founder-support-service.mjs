import { recordVisibleToActor } from "./global-search-service.mjs";
import { normalizeRole, roleHasCapability } from "./roles.mjs";
import { transitionSupportIssue } from "./support-desk.mjs";
import { normalizeTaskRecord } from "./tasks-engine.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "./ui/route-compatibility.mjs";

const DAY_MS = 86_400_000;
const REQUEST_ID = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const ACTIVE_SIGNAL_STATUSES = new Set(["", "new", "open", "suggested", "snoozed"]);
const ACTIONS = new Set(["set_status", "create_task", "resolve", "escalate", "link_relationship"]);

export const FOUNDER_SUPPORT_LANES = Object.freeze([
  "New",
  "Waiting on LegalEase",
  "Waiting on customer",
  "Escalated",
  "Urgent",
  "Resolved"
]);

export const FOUNDER_SUPPORT_ACTIONS = Object.freeze([
  "open_issue",
  "draft_response",
  "create_task",
  "set_status",
  "resolve",
  "escalate",
  "link_relationship"
]);

const LANE_INPUTS = Object.freeze({
  new:"New",
  waiting_on_legalease:"Waiting on LegalEase",
  waiting_on_customer:"Waiting on customer",
  escalated:"Escalated",
  urgent:"Urgent",
  resolved:"Resolved"
});
const LANE_ORDER = new Map(FOUNDER_SUPPORT_LANES.map((lane, index) => [lane, index]));

export class FounderSupportError extends Error {
  constructor(message, status = 400, outcome = "invalid") {
    super(message);
    this.name = "FounderSupportError";
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
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[contact]")
    .replace(/\b(?:state mutation|provider payload|collection|engine execution)\b/giu, "update")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) text = clean(fallback);
  return text.length > maximum ? `${text.slice(0, maximum - 1).trimEnd()}…` : text;
}

function safeText(value, label, maximum, required = false) {
  const text = clean(value);
  if (required && !text) throw new FounderSupportError(`${label} is required. No changes were made.`);
  if (text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/u.test(text)) {
    throw new FounderSupportError(`${label} contains unsupported text. No changes were made.`);
  }
  return text;
}

function contextFor(actor = {}, capability = "read_internal") {
  const role = normalizeRole(actor.role);
  const authenticated = actor?.authenticated === true && Boolean(clean(actor.id));
  return {
    role,
    id:clean(actor.id),
    label:founderText(actor.label || actor.displayName || actor.name || (role === "owner" ? "Roger" : role), "Owner", 80),
    allowed:authenticated && roleHasCapability(role, capability)
  };
}

function recordId(record = {}) {
  return clean(record.id || record.partnerId || record.contact_id || record.organization_id || record.slug);
}

function versionFor(record = {}) {
  return timestamp(record.updated_at || record.updatedAt || record.lastSeenAt || record.created_at || record.createdAt) || "legacy";
}

function visible(state = {}, collection = "", role = "viewer") {
  return list(state[collection]).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role));
}

function customerSignal(signal = {}) {
  const explicit = lower([
    signal.category,
    signal.signalCategory,
    signal.relationshipCategory,
    signal.contactType,
    signal.kind
  ].join(" ")).replace(/[_-]+/g, " ");
  return /\bcustomer\b|customer issue|support (?:issue|request)|product support/u.test(explicit);
}

function laneFor(record = {}, sourceKind = "supportIssues") {
  const status = lower(record.status);
  const explicit = lower(record.supportLane || record.founderStatus || record.waitingOn || record.waiting_on).replace(/[_-]+/g, " ");
  if (["resolved", "closed", "done"].includes(status) || explicit === "resolved") return "Resolved";
  if (record.escalated === true || explicit.includes("escalat")) return "Escalated";
  if (lower(record.urgency || record.severity || record.priority) === "urgent" || /critical|p0|p1/u.test(lower(record.severity || record.priority))) return "Urgent";
  if (status === "waiting" || /customer|them|requester/u.test(explicit)) return "Waiting on customer";
  if (status === "drafted" || /legalease|roger|us|our team/u.test(explicit)) return "Waiting on LegalEase";
  if (sourceKind === "inboxSignals" || ["", "new", "open", "suggested"].includes(status)) return "New";
  return "New";
}

const RELATIONSHIP_COLLECTIONS = Object.freeze({
  partner:"partners",
  contact:"companyContacts",
  organization:"companyOrganizations"
});

function relationshipRecord(state = {}, stableId = "", role = "viewer") {
  const [kind, ...idParts] = clean(stableId).split(":");
  const id = idParts.join(":");
  const primaryCollection = RELATIONSHIP_COLLECTIONS[kind];
  if (!primaryCollection || !id) return null;
  const candidateCollections = kind === "contact"
    ? ["companyContacts", "outreachContacts", "reactivationContacts"]
    : kind === "organization"
      ? ["companyOrganizations", "outreachOrganizations", "prospectCandidates"]
      : [primaryCollection];
  for (const collection of candidateCollections) {
    const record = visible(state, collection, role).find((entry) => recordId(entry) === id);
    if (record) return { kind, id, collection, record };
  }
  return null;
}

function relationshipLabel(record = {}) {
  return founderText(
    record.organizationName || record.organization || record.companyName || record.fullName || record.contactName || record.name,
    "Relationship",
    120
  );
}

function relationshipView(state = {}, record = {}, role = "viewer") {
  let stableId = clean(record.relationshipId || record.relationship_id);
  if (!stableId && clean(record.partnerId || record.partner_id)) stableId = `partner:${clean(record.partnerId || record.partner_id)}`;
  const pointer = record.pipelineMatch && typeof record.pipelineMatch === "object" ? record.pipelineMatch : {};
  if (!stableId && pointer.collection === "partners" && clean(pointer.itemId)) stableId = `partner:${clean(pointer.itemId)}`;
  if (!stableId && pointer.collection === "companyContacts" && clean(pointer.itemId)) stableId = `contact:${clean(pointer.itemId)}`;
  const resolved = relationshipRecord(state, stableId, role);
  if (!resolved) return null;
  const href = resolved.kind === "partner"
    ? buildExactObjectLink({ objectType:"Partner", sourceKind:"partner", sourceId:resolved.id })?.target || "#partners"
    : `#partners?relationship=${encodeURIComponent(stableId)}`;
  return { id:stableId, kind:resolved.kind, label:relationshipLabel(resolved.record), href, partnerId:resolved.kind === "partner" ? resolved.id : "" };
}

function openHref(sourceKind = "", id = "") {
  return buildGenericItemLink({ collection:sourceKind, sourceId:id })?.target || "#support";
}

function ageDays(record = {}, nowMs = 0) {
  const created = Date.parse(record.created_at || record.createdAt || record.occurredAt || "");
  return Number.isFinite(created) ? Math.max(0, Math.floor((nowMs - created) / DAY_MS)) : null;
}

function issueTitle(record = {}, sourceKind = "supportIssues") {
  if (sourceKind === "inboxSignals") {
    return founderText(record.title || record.subject, "Customer conversation", 140);
  }
  return founderText(record.title, "Customer issue", 140);
}

function issueSummary(record = {}) {
  return founderText(record.summary || record.conversationSummary || record.description, "Review the customer context and choose the next step.", 300);
}

function requester(record = {}) {
  return founderText(record.contactName || record.counterpartName || record.customerName || record.requesterName, "Customer", 100);
}

function issueProjection(state = {}, sourceKind = "supportIssues", record = {}, context = {}, nowMs = 0) {
  const id = recordId(record);
  const lane = laneFor(record, sourceKind);
  const relationship = relationshipView(state, record, context.role);
  const taskIds = new Set(list(record.taskIds || record.task_ids).map(clean).filter(Boolean));
  const openTasks = visible(state, "tasks", context.role).filter((task) => {
    const status = lower(task.status);
    return !["done", "completed", "closed", "archived", "dismissed"].includes(status)
      && (clean(task.sourceId) === id || taskIds.has(recordId(task)));
  }).length;
  const canManageTasks = roleHasCapability(context.role, "manage_tasks");
  const canUpdate = roleHasCapability(context.role, "add_notes");
  return {
    id:`${sourceKind === "supportIssues" ? "support" : "signal"}:${id}`,
    source:{ kind:sourceKind, id, version:versionFor(record) },
    title:issueTitle(record, sourceKind),
    summary:issueSummary(record),
    lane,
    urgency:lower(record.urgency || record.severity || record.priority) || "normal",
    requester:requester(record),
    owner:founderText(record.owner, lane === "Waiting on customer" ? "Customer" : "Roger", 80),
    waitingOn:lane === "Waiting on customer" ? "Customer" : lane === "Waiting on LegalEase" ? "LegalEase" : null,
    ageDays:ageDays(record, nowMs),
    updatedAt:versionFor(record) === "legacy" ? null : versionFor(record),
    relationship,
    openTaskCount:openTasks,
    sensitiveLegalQuestion:record.upl_sensitive === true || record.uplSensitive === true,
    href:openHref(sourceKind, id),
    composerSource:{ kind:sourceKind === "supportIssues" ? "support" : "inbox", id },
    actions:{
      openIssue:true,
      draftResponse:true,
      createTask:canManageTasks,
      setStatus:canUpdate && lane !== "Resolved",
      resolve:canUpdate && lane !== "Resolved",
      escalate:canUpdate && lane !== "Resolved",
      linkRelationship:canUpdate
    },
    safety:{ responseSendAvailable:false, externalActions:0 }
  };
}

function normalizedQuery(query = {}) {
  const lane = clean(query.lane);
  if (lane && !FOUNDER_SUPPORT_LANES.includes(lane)) throw new FounderSupportError("Choose a supported Support status.");
  return {
    lane,
    search:founderText(query.search, "", 100).toLocaleLowerCase("en-US"),
    includeResolved:query.includeResolved !== false
  };
}

function supportSort(left = {}, right = {}) {
  return (LANE_ORDER.get(left.lane) ?? 99) - (LANE_ORDER.get(right.lane) ?? 99)
    || Number(right.ageDays || 0) - Number(left.ageDays || 0)
    || clean(right.updatedAt).localeCompare(clean(left.updatedAt))
    || left.id.localeCompare(right.id, "en-US");
}

export function buildFounderSupportView(state = {}, actor = {}, now = new Date().toISOString(), rawQuery = {}) {
  const context = contextFor(actor);
  const generatedAt = timestamp(now);
  if (!context.allowed || !generatedAt) {
    return deepFreeze({
      ok:Boolean(generatedAt),
      authorized:false,
      available:false,
      generatedAt:generatedAt || null,
      lanes:FOUNDER_SUPPORT_LANES,
      counts:{ total:0, visible:0, byLane:Object.fromEntries(FOUNDER_SUPPORT_LANES.map((lane) => [lane, 0])) },
      items:[],
      safety:{ responseSendAvailable:false, externalActions:0 }
    });
  }
  const query = normalizedQuery(rawQuery);
  const nowMs = Date.parse(generatedAt);
  const all = [
    ...visible(state, "supportIssues", context.role).map((record) => issueProjection(state, "supportIssues", record, context, nowMs)),
    ...visible(state, "inboxSignals", context.role)
      .filter((record) => ACTIVE_SIGNAL_STATUSES.has(lower(record.status)) && customerSignal(record))
      .map((record) => issueProjection(state, "inboxSignals", record, context, nowMs))
  ].sort(supportSort);
  const items = all.filter((item) => {
    if (!query.includeResolved && item.lane === "Resolved") return false;
    if (query.lane && item.lane !== query.lane) return false;
    if (!query.search) return true;
    return lower([item.title, item.summary, item.requester, item.relationship?.label, item.lane].join(" ")).includes(query.search);
  });
  return deepFreeze({
    ok:true,
    authorized:true,
    available:true,
    generatedAt,
    lanes:FOUNDER_SUPPORT_LANES,
    query:{ lane:query.lane || null, search:query.search || null, includeResolved:query.includeResolved },
    counts:{
      total:all.length,
      visible:items.length,
      byLane:Object.fromEntries(FOUNDER_SUPPORT_LANES.map((lane) => [lane, all.filter((item) => item.lane === lane).length]))
    },
    items,
    safety:{ responseSendAvailable:false, externalActions:0 }
  });
}

const ACTION_KEYS = new Set([
  "itemId",
  "action",
  "requestId",
  "expectedVersion",
  "status",
  "title",
  "dueDate",
  "note",
  "relationshipId"
]);

function parseAction(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new FounderSupportError("The Support action request is invalid. No changes were made.");
  if (Object.keys(payload).some((key) => !ACTION_KEYS.has(key))) throw new FounderSupportError("The Support action contains unsupported information. No changes were made.");
  const itemId = safeText(payload.itemId, "Support issue", 320, true);
  const action = lower(safeText(payload.action, "Action", 40, true));
  const requestId = safeText(payload.requestId, "Request ID", 96, true);
  const expectedVersion = safeText(payload.expectedVersion, "Issue version", 80, true);
  if (!ACTIONS.has(action)) throw new FounderSupportError("This Support action is not available. No changes were made.");
  if (!REQUEST_ID.test(requestId)) throw new FounderSupportError("The Support action request is invalid. No changes were made.");
  if (expectedVersion !== "legacy" && !timestamp(expectedVersion)) throw new FounderSupportError("The Support issue version is invalid. No changes were made.");
  const status = lower(payload.status);
  if (action === "set_status" && !LANE_INPUTS[status]) throw new FounderSupportError("Choose a supported Support status. No changes were made.");
  const title = safeText(payload.title, "Task title", 160);
  const note = safeText(payload.note, "Note", 500);
  const dueDate = payload.dueDate === undefined ? "" : dateOnly(payload.dueDate);
  if (payload.dueDate !== undefined && !dueDate) throw new FounderSupportError("Choose a valid due date. No changes were made.");
  const relationshipId = safeText(payload.relationshipId, "Relationship", 320);
  if (action === "link_relationship" && !relationshipId) throw new FounderSupportError("Choose a relationship to link. No changes were made.");
  return { itemId, action, requestId, expectedVersion, status, title, note, dueDate, relationshipId };
}

function sourceContext(state = {}, item = {}, role = "viewer") {
  const collection = item.source.kind;
  const index = list(state[collection]).findIndex((record) => recordId(record) === item.source.id && recordVisibleToActor(record, role));
  if (index < 0) throw new FounderSupportError("This Support issue changed. Refresh and try again.", 409, "stale");
  return { collection, index, record:state[collection][index] };
}

function replaceSource(state = {}, source = {}, nextRecord = {}) {
  return {
    ...state,
    [source.collection]:list(state[source.collection]).map((record, index) => index === source.index ? nextRecord : record)
  };
}

function appendHistory(record = {}, action = "updated", actor = {}, now = "", note = "") {
  return {
    ...record,
    updated_at:now,
    updatedAt:now,
    history:[{
      action,
      at:now,
      by:clean(actor.label || actor.displayName || actor.id || actor.role) || "Owner",
      note:clean(note)
    }, ...list(record.history)].slice(0, 30)
  };
}

function updateSupportLane(state = {}, source = {}, lane = "", actor = {}, now = "", note = "") {
  const record = source.record;
  if (source.collection === "inboxSignals") {
    const status = lane === "Resolved" ? "done" : record.status || "suggested";
    return replaceSource(state, source, appendHistory({
      ...record,
      status,
      supportLane:lane,
      waitingOn:lane === "Waiting on customer" ? "Customer" : lane === "Waiting on LegalEase" ? "LegalEase" : "",
      escalated:lane === "Escalated" ? true : record.escalated,
      urgency:lane === "Urgent" ? "urgent" : record.urgency,
      resolvedAt:lane === "Resolved" ? now : record.resolvedAt
    }, `support_${lower(lane).replace(/\s+/g, "_")}`, actor, now, note));
  }

  let issues = list(state.supportIssues);
  const current = lower(record.status) || "open";
  const desiredStatus = lane === "Resolved" ? "resolved"
    : lane === "Waiting on customer" ? "waiting"
      : ["waiting", "drafted", "resolved"].includes(current) ? "open" : current;
  if (desiredStatus !== current) {
    const transitioned = transitionSupportIssue(issues, {
      id:recordId(record),
      status:desiredStatus,
      actor:clean(actor.label || actor.id || actor.role) || "Owner",
      note,
      now
    });
    if (!transitioned.ok) throw new FounderSupportError("This Support status changed. Refresh and try again.", 409, "stale");
    issues = transitioned.issues;
  }
  const index = issues.findIndex((issue) => recordId(issue) === recordId(record));
  const base = issues[index] || record;
  const updated = appendHistory({
    ...base,
    supportLane:lane,
    waitingOn:lane === "Waiting on customer" ? "Customer" : lane === "Waiting on LegalEase" ? "LegalEase" : "",
    escalated:lane === "Escalated" ? true : lane === "New" ? false : base.escalated,
    escalatedAt:lane === "Escalated" ? now : base.escalatedAt,
    urgency:lane === "Urgent" ? "urgent" : base.urgency
  }, `triaged_${lower(lane).replace(/\s+/g, "_")}`, actor, now, note);
  return { ...state, supportIssues:issues.map((issue, issueIndex) => issueIndex === index ? updated : issue) };
}

function taskForIssue(item = {}, parsed = {}, now = "") {
  const due = parsed.dueDate || now.slice(0, 10);
  return normalizeTaskRecord({
    id:`task-support-${parsed.requestId.toLocaleLowerCase("en-US")}`,
    title:parsed.title || `Handle support issue: ${item.title}`,
    description:item.summary,
    owner:"Roger",
    status:"open",
    priority:["Urgent", "Escalated"].includes(item.lane) ? "high" : "medium",
    dueDate:due,
    sourceType:"support_issue",
    sourceId:item.source.id,
    partnerId:item.relationship?.partnerId || "",
    nextAction:parsed.title || `Review and resolve ${item.title}`,
    escalationReason:`Support issue is ${item.lane.toLocaleLowerCase("en-US")}.`,
    escalationKey:`support-follow-up:${item.source.kind}:${item.source.id}`,
    history:[{ action:"created", at:now, note:"Created from Support. No response was sent." }]
  }, { now });
}

function evidence(state = {}, parsed = {}, item = {}, actor = {}, now = "", message = "") {
  return {
    ...state,
    auditHistory:[{
      id:`audit-founder-support-${parsed.requestId}`,
      timestamp:now,
      actor:clean(actor.id || actor.role) || "authenticated_user",
      action:`support_${parsed.action}`,
      resourceType:"Support issue",
      resourceId:item.source.id,
      summary:message,
      externalSideEffects:false
    }, ...list(state.auditHistory)].slice(0, 1000),
    activityEvents:[{
      id:`activity-founder-support-${parsed.requestId}`,
      eventType:"Support issue updated",
      title:message,
      relatedObjectType:"support_issue",
      relatedObjectId:item.source.id,
      createdAt:now,
      metadata:{ action:parsed.action, responseSent:false, externalSideEffects:false }
    }, ...list(state.activityEvents)].slice(0, 500)
  };
}

function changedCollections(before = {}, after = {}) {
  const names = ["supportIssues", "inboxSignals", "tasks", "auditHistory", "activityEvents"];
  return Object.freeze(Object.fromEntries(names.filter((name) => before[name] !== after[name]).map((name) => [name, after[name]])));
}

export function executeFounderSupportAction(state = {}, actor = {}, now = new Date().toISOString(), payload = {}) {
  const parsed = parseAction(payload);
  const nowIso = timestamp(now);
  if (!nowIso) throw new FounderSupportError("Support actions are temporarily unavailable. No changes were made.", 500, "temporary_failure");
  const capability = parsed.action === "create_task" ? "manage_tasks" : "add_notes";
  const context = contextFor(actor, capability);
  if (!context.allowed) throw new FounderSupportError("This Support action is not available for this account.", 403, "not_allowed");
  const auditId = `audit-founder-support-${parsed.requestId}`;
  if (list(state.auditHistory).some((row) => clean(row.id) === auditId)) {
    return Object.freeze({ ok:true, alreadyApplied:true, state, collections:Object.freeze({}), result:Object.freeze({ message:"This Support action was already recorded.", externalActions:0 }) });
  }
  const item = buildFounderSupportView(state, actor, nowIso).items.find((candidate) => candidate.id === parsed.itemId);
  if (!item) throw new FounderSupportError("This Support issue changed. Refresh and try again.", 409, "stale");
  if (item.source.version !== parsed.expectedVersion) throw new FounderSupportError("This Support issue changed. Refresh and try again.", 409, "stale");
  let source = sourceContext(state, item, context.role);
  let next = state;
  let task = null;
  let message = "Support issue updated.";

  if (parsed.action === "set_status") {
    const lane = LANE_INPUTS[parsed.status];
    next = updateSupportLane(state, source, lane, actor, nowIso, parsed.note);
    message = `Support status changed to ${lane}.`;
  } else if (parsed.action === "resolve") {
    next = updateSupportLane(state, source, "Resolved", actor, nowIso, parsed.note);
    message = "Support issue resolved.";
  } else if (parsed.action === "escalate") {
    next = updateSupportLane(state, source, "Escalated", actor, nowIso, parsed.note);
    message = "Support issue escalated for owner attention.";
  } else if (parsed.action === "create_task") {
    task = taskForIssue(item, parsed, nowIso);
    const existing = list(state.tasks).find((entry) => recordId(entry) === task.id);
    next = existing ? state : { ...state, tasks:[task, ...list(state.tasks)] };
    source = sourceContext(next, item, context.role);
    const taskIds = [...new Set([task.id, ...list(source.record.taskIds || source.record.task_ids).map(clean).filter(Boolean)])];
    next = replaceSource(next, source, appendHistory({ ...source.record, taskIds }, "task_created", actor, nowIso, "Internal Support task created. No response was sent."));
    message = existing ? "This Support task was already created." : "Support task created.";
  } else if (parsed.action === "link_relationship") {
    const relationship = relationshipRecord(state, parsed.relationshipId, context.role);
    if (!relationship) throw new FounderSupportError("That relationship is no longer available. Refresh and try again.", 409, "stale");
    const partnerId = relationship.kind === "partner" ? relationship.id : clean(relationship.record.partnerId || relationship.record.partner_id);
    next = replaceSource(state, source, appendHistory({
      ...source.record,
      relationshipId:parsed.relationshipId,
      partnerId:partnerId || source.record.partnerId || ""
    }, "relationship_linked", actor, nowIso, `Linked to ${relationshipLabel(relationship.record)}.`));
    message = "Customer relationship linked.";
  }
  next = evidence(next, parsed, item, actor, nowIso, message);
  return Object.freeze({
    ok:true,
    alreadyApplied:false,
    state:next,
    collections:changedCollections(state, next),
    result:Object.freeze({
      itemId:item.id,
      action:parsed.action,
      message,
      taskId:task?.id || null,
      counts:buildFounderSupportView(next, actor, nowIso).counts,
      responseSent:false,
      externalActions:0
    })
  });
}

export function founderSupportSafeError(error = {}) {
  const known = error instanceof FounderSupportError;
  return deepFreeze({
    status:Number(error?.status || 500),
    body:{
      ok:false,
      outcome:known ? error.outcome : "temporary_failure",
      message:known ? error.message : "Support could not be changed. No changes were made. Try again."
    }
  });
}
