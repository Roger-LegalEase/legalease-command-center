import { recordVisibleToActor } from "./global-search-service.mjs";
import {
  INBOX_ALLOWED_MAILBOX,
  INBOX_BACKFILL_WINDOW_DAYS,
  INBOX_ROLLING_WINDOW_DAYS,
  INBOX_SCAN_MESSAGE_CAP,
  inboxConfigOf
} from "./inbox-intelligence.mjs";
import { googleInsightToQueueTask } from "./google-workspace.mjs";
import { setPartnerNextAction } from "./partner-record-actions.mjs";
import { normalizeRole, roleHasCapability } from "./roles.mjs";
import { normalizeTaskRecord } from "./tasks-engine.mjs";
import { buildExactObjectLink } from "./ui/route-compatibility.mjs";

const DAY_MS = 86_400_000;
const ACTIVE_STATUSES = new Set(["", "new", "open", "suggested", "snoozed"]);
const FINISHED_STATUSES = new Set(["dismissed", "done", "resolved", "queued", "deleted", "archived"]);
const REQUEST_ID = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const ACTIONS = new Set(["create_task", "set_next_action", "snooze", "dismiss"]);

export const LEE_INBOX_CATEGORIES = Object.freeze([
  "needs reply",
  "went quiet",
  "founder commitment",
  "their commitment",
  "partner opportunity",
  "investor",
  "press",
  "vendor",
  "customer",
  "internal",
  "meeting prep",
  "post-meeting follow-up"
]);

export const LEE_INBOX_ACTIONS = Object.freeze([
  "draft_reply",
  "create_task",
  "set_next_action",
  "snooze",
  "dismiss",
  "open_relationship",
  "open_google_context"
]);

const CATEGORY_SET = new Set(LEE_INBOX_CATEGORIES);
const CATEGORY_PRIORITY = new Map(LEE_INBOX_CATEGORIES.map((category, index) => [category, index]));

export class LeeInboxError extends Error {
  constructor(message, status = 400, outcome = "invalid") {
    super(message);
    this.name = "LeeInboxError";
    this.status = status;
    this.outcome = outcome;
    this.safeMessage = message;
  }
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLocaleLowerCase("en-US");
}

function recordId(record = {}) {
  return clean(record.id || record.contact_id || record.organization_id || record.partnerId || record.slug);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function founderText(value = "", fallback = "", maximum = 240) {
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
  return text.length > maximum ? `${text.slice(0, Math.max(0, maximum - 1)).trimEnd()}…` : text;
}

function safeText(value, label, maximum, { required = false } = {}) {
  const text = clean(value);
  if (required && !text) throw new LeeInboxError(`${label} is required. No changes were made.`);
  if (text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/u.test(text)) {
    throw new LeeInboxError(`${label} contains unsupported text. No changes were made.`);
  }
  return text;
}

function timestamp(value = "") {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function dateOnly(value = "") {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))) return "";
  return text;
}

function actorContext(actor = {}, capability = "read_sensitive") {
  const role = normalizeRole(actor.role);
  const authenticated = actor?.authenticated === true && Boolean(clean(actor.id));
  return {
    authenticated,
    id:clean(actor.id),
    role,
    label:founderText(actor.label || actor.displayName || actor.name || (role === "owner" ? "Roger" : role), "Owner", 80),
    allowed:authenticated && roleHasCapability(role, "read_internal") && roleHasCapability(role, capability)
  };
}

function visibleRecords(state = {}, collection = "", role = "viewer") {
  return list(state[collection]).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role));
}

function sameIdentity(left = "", right = "") {
  return Boolean(clean(left) && clean(right) && lower(left) === lower(right));
}

function recordEmail(record = {}) {
  return lower(record.email || record.contactEmail || record.contact_email || record.primaryEmail || record.primaryContactEmail);
}

function recordOrganization(record = {}) {
  return founderText(
    record.organizationName || record.organization || record.companyName || record.company || record.publication || record.accountName || record.name,
    "",
    120
  );
}

function recordPerson(record = {}) {
  return founderText(
    record.counterpartName || record.primaryContactName || record.contactName || record.fullName || record.personName || record.journalist || record.name,
    "",
    100
  );
}

function sourceUpdatedAt(source = {}) {
  return timestamp(source.updatedAt || source.updated_at || source.lastSeenAt || source.occurredAt || source.createdAt || source.created_at);
}

function sourceVersion(source = {}) {
  return sourceUpdatedAt(source) || "legacy";
}

function pipelinePointer(source = {}) {
  const match = source.pipelineMatch && typeof source.pipelineMatch === "object" ? source.pipelineMatch : {};
  return {
    collection:clean(match.collection || source.relatedCollection || source.relationshipCollection),
    id:clean(match.itemId || source.relatedEntityId || source.relationshipId)
  };
}

const RELATIONSHIP_COLLECTIONS = Object.freeze([
  "partners",
  "companyContacts",
  "outreachContacts",
  "reactivationContacts",
  "prospectCandidates",
  "companyOrganizations",
  "outreachOrganizations"
]);

function relatedSourceRecord(state = {}, source = {}, role = "viewer") {
  const pointer = pipelinePointer(source);
  if (RELATIONSHIP_COLLECTIONS.includes(pointer.collection) && pointer.id) {
    const direct = visibleRecords(state, pointer.collection, role).find((record) => recordId(record) === pointer.id);
    if (direct) return { collection:pointer.collection, record:direct };
  }

  const directPartnerId = clean(source.partnerId || source.partner_id || source.relatedPartnerId);
  if (directPartnerId) {
    const partner = visibleRecords(state, "partners", role).find((record) => recordId(record) === directPartnerId);
    if (partner) return { collection:"partners", record:partner };
  }

  const counterpartEmail = lower(source.counterpartEmail || source.email || source.contactEmail);
  if (counterpartEmail) {
    for (const collection of RELATIONSHIP_COLLECTIONS) {
      const match = visibleRecords(state, collection, role).find((record) => recordEmail(record) === counterpartEmail);
      if (match) return { collection, record:match };
    }
  }

  const related = clean(source.relatedPersonOrOrg || source.organization || source.organizationName);
  if (related) {
    for (const collection of RELATIONSHIP_COLLECTIONS) {
      const match = visibleRecords(state, collection, role).find((record) =>
        sameIdentity(recordOrganization(record), related) || sameIdentity(recordPerson(record), related)
      );
      if (match) return { collection, record:match };
    }
  }
  return null;
}

function partnerForRelatedRecord(state = {}, related = null, role = "viewer") {
  if (!related) return null;
  if (related.collection === "partners") return related.record;
  const record = related.record || {};
  const partnerId = clean(record.partnerId || record.partner_id || record.linkedPartnerId || record.organizationId);
  const partners = visibleRecords(state, "partners", role);
  if (partnerId) {
    const exact = partners.find((partner) => recordId(partner) === partnerId);
    if (exact) return exact;
  }
  const email = recordEmail(record);
  if (email) {
    const exact = partners.find((partner) => recordEmail(partner) === email);
    if (exact) return exact;
  }
  const organization = recordOrganization(record);
  return organization ? partners.find((partner) => sameIdentity(recordOrganization(partner), organization)) || null : null;
}

function relationshipProjection(state = {}, source = {}, role = "viewer") {
  const related = relatedSourceRecord(state, source, role);
  if (!related) return null;
  const partner = partnerForRelatedRecord(state, related, role);
  const record = partner || related.record;
  const collection = partner ? "partners" : related.collection;
  const id = recordId(record);
  if (!id) return null;
  const kind = collection === "partners" ? "partner"
    : /Organizations$/u.test(collection) ? "organization" : "contact";
  const stableId = `${kind}:${id}`;
  const href = collection === "partners"
    ? buildExactObjectLink({ objectType:"Partner", sourceKind:"partner", sourceId:id })?.target || "#partners"
    : `#partners?relationship=${encodeURIComponent(stableId)}`;
  return {
    id:stableId,
    kind,
    label:recordOrganization(record) || recordPerson(record) || "Relationship",
    href,
    partnerId:partner ? recordId(partner) : ""
  };
}

function contextText(source = {}, related = null) {
  const record = related?.record || {};
  return lower([
    source.category,
    source.relationshipCategory,
    source.kind,
    source.insightType,
    source.suggestedQueueItemType,
    source.sourceLabel,
    record.relationshipCategory,
    record.relationshipType,
    record.contactType,
    record.organizationType,
    record.partnerType,
    record.type,
    record.category,
    record.tags,
    record.publication,
    record.beat,
    recordOrganization(record)
  ].flat().join(" "));
}

function explicitCategory(value = "") {
  const normalized = lower(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases = {
    "needs your reply":"needs reply",
    "reply needed":"needs reply",
    "went silent":"went quiet",
    commitment:"founder commitment",
    "you made a commitment":"founder commitment",
    "your commitment":"founder commitment",
    "counterpart commitment":"their commitment",
    "they made a commitment":"their commitment",
    "pipeline inbound":"partner opportunity",
    "new partner opportunity":"partner opportunity",
    media:"press",
    journalist:"press",
    "internal team":"internal",
    "meeting preparation":"meeting prep",
    "post meeting follow up":"post-meeting follow-up",
    "post meeting follow-up":"post-meeting follow-up",
    "post-meeting follow up":"post-meeting follow-up"
  };
  const exact = aliases[normalized] || normalized;
  return CATEGORY_SET.has(exact) ? exact : "";
}

function categoryFor(source = {}, related = null) {
  for (const value of [source.category, source.signalCategory, source.kind, source.insightType, source.suggestedQueueItemType]) {
    const category = explicitCategory(value);
    if (category && category !== "partner opportunity") return category;
  }

  const context = contextText(source, related);
  if (/\binvest(?:or|ment)|\bfunder|venture|capital fund/u.test(context)) return "investor";
  if (/\bpress|\bmedia|journalist|reporter|publication|newsroom|editor\b/u.test(context)) return "press";
  if (/\bvendor|supplier|contractor|service provider\b/u.test(context)) return "vendor";
  if (/\bcustomer|consumer|client|paid customer|support\b/u.test(context)) return "customer";
  if (/\binternal|team member|employee|staff|coworker|colleague\b/u.test(context)) return "internal";
  return "partner opportunity";
}

function whoFor(source = {}, related = null) {
  const record = related?.record || {};
  return founderText(
    source.counterpartName || source.person || source.attendeeName || source.contactName || recordPerson(record),
    "Someone",
    100
  );
}

function organizationFor(source = {}, related = null) {
  const record = related?.record || {};
  return founderText(
    source.organization || source.organizationName || source.publication || source.company || recordOrganization(record),
    "",
    120
  );
}

function summaryFor(source = {}, category = "") {
  const fallback = {
    "needs reply":"A conversation is waiting for your reply.",
    "went quiet":"A relationship went quiet after your last message.",
    "founder commitment":"A commitment you made needs follow-through.",
    "their commitment":"A commitment they made is due for a check-in.",
    "partner opportunity":"A possible Partner opportunity needs review.",
    investor:"An investor interaction needs your attention.",
    press:"A press interaction needs your attention.",
    vendor:"A vendor follow-up needs your attention.",
    customer:"A customer conversation needs your attention.",
    internal:"An internal follow-up needs your attention.",
    "meeting prep":"An upcoming meeting needs preparation.",
    "post-meeting follow-up":"A recent meeting needs follow-up."
  }[category] || "This conversation needs review.";
  return founderText(source.summary || source.conversationSummary || source.inferredReason || source.title, fallback, 260);
}

function nextMoveFor(source = {}, category = "") {
  const explicit = founderText(source.whoOwesNextMove || source.nextMoveOwner || source.owes, "", 60);
  if (explicit) {
    if (/\b(they|them|counterpart|contact)\b/i.test(explicit)) return "Them";
    if (/\b(shared|both)\b/i.test(explicit)) return "Shared";
    return "Roger";
  }
  if (["went quiet", "their commitment"].includes(category)) return "Them";
  return "Roger";
}

function suggestedActionFor(source = {}, category = "") {
  const fallback = {
    "needs reply":"Draft a focused reply.",
    "went quiet":"Send a short, useful follow-up.",
    "founder commitment":"Complete the commitment or reset the date honestly.",
    "their commitment":"Check in on the promised next step.",
    "partner opportunity":"Review the relationship and set the next action.",
    investor:"Review the investor context and prepare a thoughtful follow-up.",
    press:"Review the angle and prepare a concise response.",
    vendor:"Clarify the owner and due date.",
    customer:"Review the issue and prepare a response.",
    internal:"Set the internal owner and next step.",
    "meeting prep":"Prepare the desired outcome, agenda, and questions.",
    "post-meeting follow-up":"Capture the decision and set the follow-up owner."
  }[category] || "Review and set the next action.";
  return founderText(source.suggestedNextAction || source.nextAction || source.recommendation, fallback, 260);
}

function ageDaysFor(source = {}, nowMs = 0) {
  if (Number.isFinite(Number(source.ageDays))) return Math.max(0, Math.floor(Number(source.ageDays)));
  const occurred = Date.parse(source.occurredAt || source.receivedAt || source.date || source.createdAt || source.created_at || "");
  return Number.isFinite(occurred) && Number.isFinite(nowMs) ? Math.max(0, Math.floor((nowMs - occurred) / DAY_MS)) : null;
}

function dueAtFor(source = {}) {
  return timestamp(source.dueAt || source.due_date || source.commitmentDueAt || source.eventStart || source.meetingDate || source.snoozedUntil);
}

function timingLabel(dueAt = "", ageDays = null, nowMs = 0) {
  const dueMs = Date.parse(dueAt);
  if (Number.isFinite(dueMs)) {
    const delta = Math.ceil((dueMs - nowMs) / DAY_MS);
    if (delta < 0) return `${Math.abs(delta)} ${Math.abs(delta) === 1 ? "day" : "days"} overdue`;
    if (delta === 0) return "Due today";
    if (delta === 1) return "Due tomorrow";
    return `Due in ${delta} days`;
  }
  if (Number.isFinite(ageDays)) return `${ageDays} ${ageDays === 1 ? "day" : "days"} old`;
  return "Date unavailable";
}

function confidenceFor(source = {}) {
  const raw = source.confidence;
  let value = Number(raw);
  if (!Number.isFinite(value)) {
    const normalized = lower(raw);
    value = normalized === "high" ? 0.9 : normalized === "low" ? 0.55 : 0.72;
  }
  value = Math.max(0, Math.min(1, value));
  return { value, label:value >= 0.85 ? "High" : value >= 0.65 ? "Medium" : "Low" };
}

function trustedGoogleHref(value = "", host = "") {
  const text = clean(value);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" && parsed.hostname === host && !parsed.username && !parsed.password ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function googleContextFor(sourceKind = "", source = {}) {
  if (sourceKind === "googleInsights" && lower(source.source) === "calendar") {
    return { label:"Open Google Calendar", href:"https://calendar.google.com/calendar/u/0/r", kind:"calendar" };
  }
  const supplied = trustedGoogleHref(source.gmailUrl || source.googleUrl || source.threadUrl, "mail.google.com");
  if (supplied) return { label:"Open Gmail", href:supplied, kind:"gmail" };
  const threadId = clean(source.threadId);
  if (threadId) return { label:"Open Gmail", href:`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}`, kind:"gmail" };
  const email = clean(source.counterpartEmail);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return { label:"Open Gmail", href:`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${email}`)}`, kind:"gmail" };
  }
  if (sourceKind === "googleInsights" && lower(source.source) === "gmail") {
    return { label:"Open Gmail", href:"https://mail.google.com/mail/u/0/#inbox", kind:"gmail" };
  }
  return null;
}

function sourceIsVisibleNow(source = {}, nowMs = 0, includeSnoozed = false) {
  const status = lower(source.status);
  if (FINISHED_STATUSES.has(status)) return false;
  if (!ACTIVE_STATUSES.has(status)) return false;
  if (status !== "snoozed" || includeSnoozed) return true;
  const snoozedUntil = Date.parse(source.snoozedUntil || "");
  return !Number.isFinite(snoozedUntil) || snoozedUntil <= nowMs;
}

function projectedItem(state = {}, sourceKind = "", source = {}, context = {}, nowMs = 0) {
  const related = relatedSourceRecord(state, source, context.role);
  const relationship = relationshipProjection(state, source, context.role);
  const category = categoryFor(source, related);
  const who = whoFor(source, related);
  const organization = organizationFor(source, related);
  const dueAt = dueAtFor(source);
  const ageDays = ageDaysFor(source, nowMs);
  const confidence = confidenceFor(source);
  const googleContext = googleContextFor(sourceKind, source);
  const id = `${sourceKind === "inboxSignals" ? "inbox" : "google"}:${recordId(source)}`;
  const canManageTasks = roleHasCapability(context.role, "manage_tasks");
  const canUpdate = roleHasCapability(context.role, "add_notes");
  const draftAllowed = sourceKind === "inboxSignals" && googleContext?.kind === "gmail" && source.uplSensitive !== true;
  return {
    id,
    source:{ kind:sourceKind, id:recordId(source), version:sourceVersion(source) },
    who,
    organization,
    category,
    summary:summaryFor(source, category),
    whoOwesNextMove:nextMoveFor(source, category),
    dueAt:dueAt || null,
    ageDays,
    timingLabel:timingLabel(dueAt, ageDays, nowMs),
    confidence,
    relationship,
    suggestedNextAction:suggestedActionFor(source, category),
    googleContext,
    actions:{
      draftReply:draftAllowed,
      createTask:canManageTasks,
      setNextAction:canManageTasks,
      snooze:canUpdate,
      dismiss:canUpdate,
      openRelationship:Boolean(relationship),
      openGoogleContext:Boolean(googleContext)
    },
    draftUnavailableReason:source.uplSensitive === true
      ? "Review this conversation in Gmail and reply personally."
      : null
  };
}

function viewSources(state = {}, context = {}, nowMs = 0, includeSnoozed = false) {
  const sources = [];
  for (const sourceKind of ["inboxSignals", "googleInsights"]) {
    for (const source of visibleRecords(state, sourceKind, context.role)) {
      if (!recordId(source) || !sourceIsVisibleNow(source, nowMs, includeSnoozed)) continue;
      sources.push(projectedItem(state, sourceKind, source, context, nowMs));
    }
  }
  return sources;
}

function normalizedViewOptions(options = {}) {
  const category = explicitCategory(options.category);
  if (clean(options.category) && !category) throw new LeeInboxError("Choose a supported inbox category.");
  const search = founderText(options.search, "", 100).toLocaleLowerCase("en-US");
  return { category, search, includeSnoozed:options.includeSnoozed === true };
}

function sourceSort(left = {}, right = {}) {
  const leftDue = Date.parse(left.dueAt || "");
  const rightDue = Date.parse(right.dueAt || "");
  const leftDueRank = Number.isFinite(leftDue) ? leftDue : Number.POSITIVE_INFINITY;
  const rightDueRank = Number.isFinite(rightDue) ? rightDue : Number.POSITIVE_INFINITY;
  return leftDueRank - rightDueRank
    || (CATEGORY_PRIORITY.get(left.category) ?? 99) - (CATEGORY_PRIORITY.get(right.category) ?? 99)
    || Number(right.ageDays || 0) - Number(left.ageDays || 0)
    || right.confidence.value - left.confidence.value
    || left.id.localeCompare(right.id, "en-US");
}

export function buildLeeInboxView(state = {}, actor = {}, now = new Date().toISOString(), options = {}) {
  const context = actorContext(actor);
  const nowIso = timestamp(now);
  if (!context.allowed || !nowIso) {
    return deepFreeze({
      ok:Boolean(nowIso),
      authorized:false,
      available:false,
      generatedAt:nowIso || null,
      categories:LEE_INBOX_CATEGORIES,
      counts:{ total:0, byCategory:Object.fromEntries(LEE_INBOX_CATEGORIES.map((category) => [category, 0])) },
      items:[],
      refresh:planLeeInboxRefresh(state, actor, { now:nowIso || now })
    });
  }
  const filters = normalizedViewOptions(options);
  const nowMs = Date.parse(nowIso);
  const all = viewSources(state, context, nowMs, filters.includeSnoozed);
  const items = all.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (!filters.search) return true;
    return lower([item.who, item.organization, item.category, item.summary, item.suggestedNextAction].join(" ")).includes(filters.search);
  }).sort(sourceSort);
  const byCategory = Object.fromEntries(LEE_INBOX_CATEGORIES.map((category) => [category, all.filter((item) => item.category === category).length]));
  return deepFreeze({
    ok:true,
    authorized:true,
    available:true,
    generatedAt:nowIso,
    categories:LEE_INBOX_CATEGORIES,
    filters:{ category:filters.category || null, search:filters.search || null },
    counts:{ total:all.length, visible:items.length, byCategory },
    items,
    refresh:planLeeInboxRefresh(state, actor, { now:nowIso })
  });
}

function gmailConnectionState(state = {}) {
  const connector = list(state.connectorStatus).find((item) => /gmail|google(?: workspace)?|email/i.test(clean(item.connector || item.id || item.name))) || {};
  const text = lower(connector.status || connector.state || connector.health);
  if (state.runtime?.emailReadDraftConnected === true || connector.connected === true || /connected|healthy|ready/.test(text)) return "available";
  if (/refresh|attention|error|expired|degraded/.test(text)) return "needs attention";
  return "unavailable";
}

export function planLeeInboxRefresh(state = {}, actor = {}, options = {}) {
  const context = actorContext(actor);
  const now = timestamp(options.now || new Date().toISOString());
  const ownerAllowed = context.allowed && context.role === "owner";
  const config = inboxConfigOf(state);
  const firstRefresh = !config.backfillCompletedAt;
  return deepFreeze({
    ok:Boolean(now),
    allowed:ownerAllowed && Boolean(now),
    ownerOnly:true,
    operation:"refresh inbox now",
    connectionStatus:gmailConnectionState(state),
    readOnly:true,
    requiresHeartbeat:false,
    externalWrites:false,
    mailboxBoundary:ownerAllowed ? INBOX_ALLOWED_MAILBOX : null,
    request:ownerAllowed ? {
      windowDays:firstRefresh ? INBOX_BACKFILL_WINDOW_DAYS : INBOX_ROLLING_WINDOW_DAYS,
      messageCap:INBOX_SCAN_MESSAGE_CAP
    } : null,
    lastRefreshedAt:config.lastScanAt || null,
    message:!ownerAllowed
      ? "Inbox refresh is available to the signed-in owner."
      : gmailConnectionState(state) === "unavailable"
        ? "Connect the read-only Google account to refresh this inbox."
        : "Ready to refresh read-only inbox signals. Nothing will be sent or changed in Gmail."
  });
}

const ACTION_KEYS = new Set([
  "itemId",
  "action",
  "requestId",
  "expectedVersion",
  "title",
  "nextAction",
  "dueDate",
  "snoozeUntil"
]);

function parseActionPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new LeeInboxError("The inbox action request is invalid. No changes were made.");
  }
  if (Object.keys(payload).some((key) => !ACTION_KEYS.has(key))) {
    throw new LeeInboxError("The inbox action request contains unsupported information. No changes were made.");
  }
  const itemId = safeText(payload.itemId, "Inbox item", 320, { required:true });
  const action = safeText(payload.action, "Action", 40, { required:true }).toLocaleLowerCase("en-US");
  const requestId = safeText(payload.requestId, "Request ID", 96, { required:true });
  const expectedVersion = safeText(payload.expectedVersion, "Item version", 80, { required:true });
  if (!ACTIONS.has(action)) throw new LeeInboxError("This inbox action is not available. No changes were made.");
  if (!REQUEST_ID.test(requestId)) throw new LeeInboxError("The inbox action request is invalid. No changes were made.");
  if (expectedVersion !== "legacy" && !timestamp(expectedVersion)) throw new LeeInboxError("The inbox item version is invalid. No changes were made.");
  const title = safeText(payload.title, "Task title", 160);
  const nextAction = safeText(payload.nextAction, "Next action", 500);
  const dueDate = payload.dueDate === undefined ? "" : dateOnly(payload.dueDate);
  if (payload.dueDate !== undefined && !dueDate) throw new LeeInboxError("Choose a valid due date. No changes were made.");
  const snoozeUntil = payload.snoozeUntil === undefined ? "" : dateOnly(payload.snoozeUntil);
  if (payload.snoozeUntil !== undefined && !snoozeUntil) throw new LeeInboxError("Choose a valid snooze date. No changes were made.");
  if (action === "set_next_action" && (!nextAction || !dueDate)) throw new LeeInboxError("Add the next action and due date. No changes were made.");
  if (action === "snooze" && !snoozeUntil) throw new LeeInboxError("Choose when this item should return. No changes were made.");
  return { itemId, action, requestId, expectedVersion, title, nextAction, dueDate, snoozeUntil };
}

function actionSource(state = {}, item = {}, role = "viewer") {
  const collection = item.source.kind;
  const records = visibleRecords(state, collection, role);
  const index = records.length ? list(state[collection]).findIndex((record) => recordId(record) === item.source.id && recordVisibleToActor(record, role)) : -1;
  if (index < 0) throw new LeeInboxError("This inbox item is no longer available. Refresh and try again.", 409, "stale");
  return { collection, index, record:state[collection][index] };
}

function replaceActionSource(state = {}, sourceContext = {}, patch = {}) {
  return {
    ...state,
    [sourceContext.collection]:list(state[sourceContext.collection]).map((record, index) => index === sourceContext.index ? { ...record, ...patch } : record)
  };
}

function actionEvidence(state = {}, parsed = {}, item = {}, actor = {}, now = "", message = "") {
  const audit = {
    id:`audit-lee-inbox-${parsed.requestId}`,
    timestamp:now,
    actor:clean(actor.id || actor.role) || "authenticated_user",
    action:`lee_inbox_${parsed.action}`,
    resourceType:"Inbox follow-up",
    resourceId:item.source.id,
    externalSideEffects:false,
    summary:message
  };
  const activity = {
    id:`activity-lee-inbox-${parsed.requestId}`,
    eventType:"Inbox follow-up updated",
    title:message,
    relatedObjectType:"inbox_follow_up",
    relatedObjectId:item.source.id,
    createdAt:now,
    metadata:{ action:parsed.action, externalSideEffects:false, noExternalSystemsContacted:true }
  };
  return {
    ...state,
    auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000),
    activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500)
  };
}

function taskPriority(item = {}) {
  if (item.confidence.value >= 0.85 && /overdue|today/i.test(item.timingLabel)) return "high";
  return item.category === "customer" ? "high" : "medium";
}

function taskFromItem(source = {}, item = {}, parsed = {}, now = "") {
  const id = `task-lee-inbox-${parsed.requestId.toLocaleLowerCase("en-US")}`;
  const due = parsed.dueDate || (item.dueAt ? item.dueAt.slice(0, 10) : now.slice(0, 10));
  if (item.source.kind === "googleInsights") {
    return normalizeTaskRecord({
      ...googleInsightToQueueTask(source, { id, now }),
      title:parsed.title || item.suggestedNextAction,
      description:item.summary,
      dueDate:due,
      due_date:due,
      nextAction:parsed.nextAction || item.suggestedNextAction,
      partnerId:item.relationship?.partnerId || "",
      priority:taskPriority(item)
    }, { now });
  }
  return normalizeTaskRecord({
    id,
    title:parsed.title || parsed.nextAction || item.suggestedNextAction,
    description:item.summary,
    owner:"Roger",
    status:"open",
    priority:taskPriority(item),
    dueDate:due,
    sourceType:"inbox_intelligence",
    sourceId:item.source.id,
    partnerId:item.relationship?.partnerId || "",
    nextAction:parsed.nextAction || item.suggestedNextAction,
    escalationReason:`Le-E found a ${item.category} follow-up.`,
    escalationKey:`lee-inbox:${item.source.kind}:${item.source.id}`,
    history:[{ action:"created", at:now, note:"Created from a read-only Le-E inbox signal. No message was sent." }]
  }, { now });
}

function createTaskForAction(state = {}, sourceContext = {}, item = {}, parsed = {}, actor = {}, now = "") {
  const task = taskFromItem(sourceContext.record, item, parsed, now);
  const existing = list(state.tasks).find((record) => record.id === task.id);
  let next = existing ? state : { ...state, tasks:[task, ...list(state.tasks)] };
  next = replaceActionSource(next, {
    ...sourceContext,
    index:list(next[sourceContext.collection]).findIndex((record) => recordId(record) === item.source.id)
  }, {
    status:"queued",
    taskId:task.id,
    queuedAt:now,
    updatedAt:now
  });
  const message = existing ? "This follow-up task was already created." : "Follow-up task created.";
  next = actionEvidence(next, parsed, item, actor, now, message);
  return { state:next, task:existing || task, message };
}

function requireActionCapability(context = {}, action = "") {
  const capability = ["create_task", "set_next_action"].includes(action) ? "manage_tasks" : "add_notes";
  if (!context.allowed || !roleHasCapability(context.role, capability)) {
    throw new LeeInboxError("This inbox action is not available for this account.", 403, "not_allowed");
  }
}

function changedCollections(before = {}, after = {}, names = []) {
  return Object.freeze(Object.fromEntries(names.filter((name) => before[name] !== after[name]).map((name) => [name, after[name]])));
}

export function executeLeeInboxAction(state = {}, actor = {}, now = new Date().toISOString(), payload = {}) {
  const parsed = parseActionPayload(payload);
  const nowIso = timestamp(now);
  if (!nowIso) throw new LeeInboxError("Inbox actions are temporarily unavailable. No changes were made.", 500, "temporary_failure");
  const context = actorContext(actor);
  requireActionCapability(context, parsed.action);

  const priorAudit = list(state.auditHistory).find((row) => clean(row.id) === `audit-lee-inbox-${parsed.requestId}`);
  if (priorAudit) {
    return Object.freeze({
      ok:true,
      alreadyApplied:true,
      state,
      collections:Object.freeze({}),
      result:Object.freeze({ itemId:parsed.itemId, action:parsed.action, message:"This action was already recorded.", externalActions:0 })
    });
  }

  const view = buildLeeInboxView(state, actor, nowIso, { includeSnoozed:true });
  const item = view.items.find((candidate) => candidate.id === parsed.itemId);
  if (!item) throw new LeeInboxError("This inbox item is no longer available. Refresh and try again.", 409, "stale");
  if (item.source.version !== parsed.expectedVersion) {
    throw new LeeInboxError("This inbox item changed. Refresh and try again.", 409, "stale");
  }
  const sourceContext = actionSource(state, item, context.role);
  let next = state;
  let task = null;
  let message = "Inbox follow-up updated.";

  if (parsed.action === "create_task") {
    const applied = createTaskForAction(state, sourceContext, item, parsed, actor, nowIso);
    next = applied.state;
    task = applied.task;
    message = applied.message;
  } else if (parsed.action === "set_next_action") {
    const partnerId = clean(item.relationship?.partnerId);
    if (partnerId) {
      const partnerResult = setPartnerNextAction(state, partnerId, {
        requestId:parsed.requestId,
        summary:parsed.nextAction,
        dueAt:parsed.dueDate
      }, { actor, now:nowIso });
      const refreshedSource = actionSource(partnerResult.state, item, context.role);
      next = replaceActionSource(partnerResult.state, refreshedSource, {
        status:"queued",
        nextAction:parsed.nextAction,
        nextActionDueAt:parsed.dueDate,
        updatedAt:nowIso
      });
      message = "Next action set on the relationship.";
      next = actionEvidence(next, parsed, item, actor, nowIso, message);
    } else {
      const applied = createTaskForAction(state, sourceContext, item, {
        ...parsed,
        title:parsed.nextAction
      }, actor, nowIso);
      next = applied.state;
      task = applied.task;
      message = "Next action saved as a follow-up task.";
    }
  } else if (parsed.action === "snooze") {
    const until = `${parsed.snoozeUntil}T23:59:59.999Z`;
    if (Date.parse(until) <= Date.parse(nowIso) || Date.parse(until) - Date.parse(nowIso) > 366 * DAY_MS) {
      throw new LeeInboxError("Choose a future snooze date within the next year. No changes were made.");
    }
    next = replaceActionSource(state, sourceContext, { status:"snoozed", snoozedUntil:until, updatedAt:nowIso });
    message = `Follow-up snoozed until ${parsed.snoozeUntil}.`;
    next = actionEvidence(next, parsed, item, actor, nowIso, message);
  } else if (parsed.action === "dismiss") {
    next = replaceActionSource(state, sourceContext, { status:"dismissed", dismissedAt:nowIso, updatedAt:nowIso });
    message = "Follow-up dismissed.";
    next = actionEvidence(next, parsed, item, actor, nowIso, message);
  }

  const collections = changedCollections(state, next, [
    "inboxSignals",
    "googleInsights",
    "partners",
    "tasks",
    "auditHistory",
    "activityEvents"
  ]);
  return Object.freeze({
    ok:true,
    alreadyApplied:false,
    state:next,
    collections,
    result:Object.freeze({
      itemId:parsed.itemId,
      action:parsed.action,
      message,
      taskId:task?.id || null,
      externalActions:0,
      counts:buildLeeInboxView(next, actor, nowIso).counts
    })
  });
}

export function leeInboxSafeError(error = {}) {
  const known = error instanceof LeeInboxError;
  return deepFreeze({
    status:Number(error?.status || 500),
    body:{
      ok:false,
      outcome:known ? error.outcome : "temporary_failure",
      message:known ? error.message : "Inbox follow-up could not be changed. No changes were made. Try again."
    }
  });
}
