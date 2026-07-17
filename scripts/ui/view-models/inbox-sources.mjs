import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";
import {
  ITEM_COLLECTION_DESTINATIONS,
  buildExactObjectLink,
  buildGenericItemLink
} from "../route-compatibility.mjs";

const DAY_MS = 86_400_000;
const UPDATE_WINDOW_DAYS = 7;
const GROUPS = new Set(["needs_me", "waiting", "update"]);
const PRIORITIES = new Set(["urgent", "high", "normal", "low"]);
const ACTION_INTENTS = new Set(["open", "approve", "complete", "snooze"]);
const APPROVAL_OPEN = new Set(["queued_for_approval", "needs_review", "ready_to_approve", "new", "pending", "blocked"]);
const DECISION_UPDATES = new Set(["rejected", "executed", "verified"]);
const TERMINAL_TASKS = new Set(["done", "dismissed", "archived"]);
const RECENT_FILE_STATUSES = new Set(["approved", "current", "complete", "completed"]);
const FILE_REVIEW_STATES = new Set(["review_required", "needs_review", "needs_revision", "ready_for_review", "rejected"]);
const FILE_WAITING_STATES = new Set(["blocked", "waiting", "snoozed", "scheduled"]);
const CORE_LINKS = Object.freeze({
  posts: Object.freeze({ objectType: "Post", sourceKind: "post" }),
  campaigns: Object.freeze({ objectType: "Campaign", sourceKind: "campaign" }),
  partners: Object.freeze({ objectType: "Partner", sourceKind: "partner" }),
  reports: Object.freeze({ objectType: "File", sourceKind: "report" }),
  dataRoomItems: Object.freeze({ objectType: "File", sourceKind: "data-room-item" }),
  evidencePackNotes: Object.freeze({ objectType: "File", sourceKind: "evidence-note" }),
  soc2Evidence: Object.freeze({ objectType: "File", sourceKind: "soc2-evidence" }),
  soc2Policies: Object.freeze({ objectType: "File", sourceKind: "soc2-policy" }),
  brandAssets: Object.freeze({ objectType: "File", sourceKind: "brand-asset" })
});

export const INBOX_UPDATE_WINDOW_DAYS = UPDATE_WINDOW_DAYS;

export const INBOX_INCLUDED_COLLECTIONS = Object.freeze([
  "approvals",
  "queueItems",
  "approvalQueue",
  "posts",
  "campaigns",
  "partners",
  "tasks",
  "automationSuggestions",
  "inboxSignals",
  "growthInbox",
  "supportIssues",
  "reports",
  "dataRoomItems",
  "evidencePackNotes",
  "soc2Evidence",
  "soc2Policies"
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLocaleLowerCase("en-US");
}

function stableRecords(value = []) {
  return [...list(value)].sort((left, right) => {
    const leftId = clean(left?.id || left?.key || left?.slug);
    const rightId = clean(right?.id || right?.key || right?.slug);
    return leftId.localeCompare(rightId)
      || clean(left?.updatedAt || left?.updated_at).localeCompare(clean(right?.updatedAt || right?.updated_at))
      || clean(left?.title || left?.name).localeCompare(clean(right?.title || right?.name));
  });
}

function easternOffset(dateOnly) {
  const anchor = new Date(`${dateOnly}T12:00:00.000Z`);
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset"
  }).formatToParts(anchor).find((part) => part.type === "timeZoneName")?.value || "GMT-05:00";
  return zone.replace(/^GMT/, "") || "-05:00";
}

export function normalizeInboxTimestamp(value = "", { dateOnlyEndOfDay = false } = {}) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const time = dateOnlyEndOfDay ? "23:59:59.999" : "00:00:00.000";
    return `${text}T${time}${easternOffset(text)}`;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function firstTimestamp(record = {}, fields = [], options = {}) {
  for (const field of fields) {
    const normalized = normalizeInboxTimestamp(record?.[field], options);
    if (normalized) return normalized;
  }
  return "";
}

function isRecent(timestamp = "", nowMs = 0) {
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time <= nowMs && nowMs - time <= UPDATE_WINDOW_DAYS * DAY_MS;
}

function isFuture(timestamp = "", nowMs = 0) {
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time > nowMs;
}

function isDue(timestamp = "", nowMs = 0) {
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time <= nowMs;
}

function easternDateKey(nowMs = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(nowMs));
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function sourceDateIsFuture(rawValue = "", timestamp = "", nowMs = 0) {
  const raw = clean(rawValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw > easternDateKey(nowMs);
  return isFuture(timestamp, nowMs);
}

function sourceDateIsDue(rawValue = "", timestamp = "", nowMs = 0) {
  const raw = clean(rawValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw <= easternDateKey(nowMs);
  return isDue(timestamp, nowMs);
}

export function normalizeInboxPriority(value = "") {
  if (Number.isFinite(Number(value)) && clean(value) !== "") {
    const numeric = Number(value);
    if (numeric <= 10) return "urgent";
    if (numeric <= 30) return "high";
    if (numeric <= 70) return "normal";
    return "low";
  }
  const normalized = lower(value);
  if (["urgent", "critical", "p0", "p1"].includes(normalized)) return "urgent";
  if (["high", "important", "p2"].includes(normalized)) return "high";
  if (["low", "minor", "p4"].includes(normalized)) return "low";
  return "normal";
}

export function founderInboxText(value = "", fallback = "", max = 220) {
  let text = clean(value || fallback)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[contact]")
    .replace(/\bapprovalQueue\b/giu, "decision")
    .replace(/\bqueueItems\b/giu, "Inbox items")
    .replace(/\bautomationSuggestions\b/giu, "suggested changes")
    .replace(/\bgrowthInbox\b/giu, "captured items")
    .replace(/\bevidencePackNotes\b/giu, "evidence notes")
    .replace(/\bdataRoomItems\b/giu, "Investor Room files")
    .replace(/\b(?:manage_campaigns|manage_growth|manage_approval_queue|view_private_assets|read_sensitive)\b/giu, "permission")
    .replace(/\bReview Desk\b/giu, "Social")
    .replace(/\bGrowth Inbox\b/giu, "Capture")
    .replace(/\bData Room\b/giu, "Investor Room")
    .replace(/\bLive gates?\b/giu, "connection checks")
    .replace(/\bTelemetry\b/giu, "delivery tracking")
    .replace(/\bWave\b/giu, "Batch")
    .replace(/\bQueue\b/giu, "Inbox")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) text = clean(fallback);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

function sourceId(record = {}) {
  return clean(record.id || record.key || record.slug);
}

function exactHref(collection = "", id = "") {
  const core = CORE_LINKS[collection];
  if (core) {
    return buildExactObjectLink({
      objectType: core.objectType,
      sourceKind: core.sourceKind,
      sourceId: id
    })?.target || "";
  }
  if (!Object.hasOwn(ITEM_COLLECTION_DESTINATIONS, collection)) return "";
  return buildGenericItemLink({ collection, sourceId: id })?.target || "";
}

function relatedObject(collection = "", id = "") {
  const href = exactHref(collection, id);
  if (!href) return null;
  const objectType = CORE_LINKS[collection]?.objectType
    || (collection === "tasks" ? "Task" : "Record");
  return { objectType, id, href };
}

function visible(record = {}, actorContext = {}) {
  return actorContext.valid
    && roleHasCapability(actorContext.role, "read_internal")
    && recordVisibleToActor(record, actorContext.role);
}

function actorOwns(owner = "", actorContext = {}) {
  const normalized = lower(owner);
  if (!normalized) return false;
  const identities = new Set([
    actorContext.id,
    actorContext.displayName,
    actorContext.role,
    actorContext.role === "owner" ? "Roger" : "",
    actorContext.role === "owner" ? "Owner" : "",
    actorContext.role === "operator" ? "Operations" : ""
  ].map(lower).filter(Boolean));
  return identities.has(normalized);
}

function can(actorContext = {}, capability = "") {
  return actorContext.valid && roleHasCapability(actorContext.role, capability);
}

export function inboxActorContext(actor = {}) {
  if (!actor || typeof actor !== "object") return { valid: false, id: "", role: "viewer", displayName: "" };
  const role = lower(actor.role);
  const id = clean(actor.id);
  if (!id || !roles.includes(role) || actor.authenticated === false) {
    return { valid: false, id: "", role: "viewer", displayName: "" };
  }
  return {
    valid: true,
    id,
    role,
    displayName: founderInboxText(actor.displayName || actor.label || (role === "owner" ? "Roger" : role), "", 80)
  };
}

function candidate(input = {}) {
  const id = clean(input.sourceId);
  const href = clean(input.href);
  const title = founderInboxText(input.title, "", 120);
  const summary = founderInboxText(input.summary, "", 240);
  if (!id || !href || !title || !summary || !GROUPS.has(input.group)) return null;
  const priority = PRIORITIES.has(input.priority) ? input.priority : "normal";
  const actionIntents = [...new Set(list(input.actionIntents).filter((intent) => ACTION_INTENTS.has(intent)))];
  return {
    sourceKind: clean(input.sourceKind),
    sourceId: id,
    workKind: clean(input.workKind),
    dedupeKey: clean(input.dedupeKey),
    title,
    summary,
    group: input.group,
    priority,
    dueAt: clean(input.dueAt),
    updatedAt: clean(input.updatedAt),
    owner: founderInboxText(input.owner, "", 80),
    requiresApproval: Boolean(input.requiresApproval),
    href,
    relatedObject: input.relatedObject || null,
    actionIntents,
    precedence: Number(input.precedence || 0)
  };
}

function push(output, input) {
  const item = candidate(input);
  if (item?.dedupeKey && item?.sourceKind && item?.workKind) output.push(item);
}

function actionScope(value = "") {
  const normalized = lower(value).replace(/[^a-z0-9]+/g, "_");
  if (/compliance|legal|safety/.test(normalized)) return "compliance";
  if (/image|creative|visual|preview/.test(normalized)) return "visual";
  if (/schedule/.test(normalized)) return "schedule";
  if (/copy/.test(normalized)) return "copy";
  if (/resume/.test(normalized)) return "resume";
  if (/release/.test(normalized)) return "release";
  if (/launch|campaign/.test(normalized)) return "launch";
  if (/social|post|content/.test(normalized)) return "review";
  return normalized || "decision";
}

function linkedDecision(queueItem = {}, indexes = {}, actionType = "") {
  const ref = queueItem?.sourceRef || {};
  let collection = clean(ref.collection);
  let id = clean(ref.itemId);
  let record = collection && id ? indexes.byCollection.get(collection)?.get(id) : null;
  if (collection === "approvalQueue" && record) {
    const type = lower(record.type);
    if (type === "post" && clean(record.sourceId)) {
      collection = "posts";
      id = clean(record.sourceId);
      record = indexes.byCollection.get(collection)?.get(id) || record;
    } else if (/campaign|outreach/.test(type) && clean(record.sourceId)) {
      collection = "campaigns";
      id = clean(record.sourceId);
      record = indexes.byCollection.get(collection)?.get(id) || record;
    }
  }
  if (collection === "posts" && id) {
    const scope = actionScope(actionType || queueItem?.metadata?.decisionType || queueItem?.type);
    return {
      dedupeKey: scope === "review" || scope === "decision" ? `social_review:${id}` : `social_review:${id}:${scope}`,
      workKind: "social_review",
      href: exactHref("posts", id),
      relatedObject: relatedObject("posts", id),
      record
    };
  }
  if (collection === "campaigns" && id) {
    const scope = actionScope(actionType || queueItem?.metadata?.decisionType || queueItem?.type);
    return {
      dedupeKey: `campaign_decision:${id}:${scope}`,
      workKind: "campaign_decision",
      href: exactHref("campaigns", id),
      relatedObject: relatedObject("campaigns", id),
      record
    };
  }
  if (collection === "tasks" && id) {
    return {
      dedupeKey: `task:${id}`,
      workKind: "task",
      href: exactHref("tasks", id),
      relatedObject: relatedObject("tasks", id),
      record
    };
  }
  if (collection && id) {
    const scope = actionScope(actionType || queueItem?.metadata?.decisionType || queueItem?.type);
    return {
      dedupeKey: `decision:${collection}:${id}:${scope}`,
      workKind: /campaign/.test(scope) || collection === "reactivationCampaign" ? "campaign_decision" : "decision",
      href: exactHref(collection, id),
      relatedObject: relatedObject(collection, id),
      record
    };
  }
  return {
    dedupeKey: `decision:queue:${clean(queueItem?.id)}:${actionScope(actionType)}`,
    workKind: "decision",
    href: exactHref("queueItems", clean(queueItem?.id)),
    relatedObject: null,
    record: null
  };
}

function buildIndexes(state = {}) {
  const byCollection = new Map();
  for (const collection of INBOX_INCLUDED_COLLECTIONS) {
    byCollection.set(collection, new Map(stableRecords(state[collection]).map((record) => [sourceId(record), record])));
  }
  return {
    byCollection,
    queueById: byCollection.get("queueItems") || new Map()
  };
}

function decisionCandidates(state, actorContext, nowMs, indexes, output) {
  for (const approval of stableRecords(state.approvals)) {
    if (!visible(approval, actorContext)) continue;
    const id = sourceId(approval);
    const queueItem = indexes.queueById.get(clean(approval.queue_item_id));
    if (!id || !queueItem || !visible(queueItem, actorContext)) continue;
    const linked = linkedDecision(queueItem, indexes, approval.action_type);
    if (!linked.href) continue;
    const status = lower(approval.state);
    const updatedAt = firstTimestamp(approval, ["executed_at", "approved_at", "requested_at", "updatedAt", "createdAt"])
      || firstTimestamp(queueItem, ["updatedAt", "createdAt"]);
    let group = "";
    let summary = "";
    if (status === "requested") {
      group = can(actorContext, "manage_approval_queue") ? "needs_me" : "waiting";
      summary = queueItem.summary || approval.preview || "A decision is waiting for review.";
    } else if (status === "approved") {
      group = "waiting";
      summary = "The decision is approved and is waiting for its reviewed next step.";
    } else if (status === "failed" && can(actorContext, "manage_approval_queue")) {
      group = "needs_me";
      summary = "The approved step did not finish and needs a review before anything is tried again.";
    } else if (DECISION_UPDATES.has(status) && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = status === "rejected"
        ? "The decision was reviewed and declined."
        : "The reviewed decision finished without creating new Inbox work.";
    }
    if (!group) continue;
    push(output, {
      sourceKind: "approvals",
      sourceId: id,
      workKind: linked.workKind,
      dedupeKey: linked.dedupeKey,
      title: queueItem.title || approval.preview || "Review a company decision",
      summary,
      group,
      priority: normalizeInboxPriority(queueItem.priority),
      dueAt: normalizeInboxTimestamp(queueItem.dueAt, { dateOnlyEndOfDay: true }),
      updatedAt,
      owner: "Roger",
      requiresApproval: status === "requested",
      href: linked.href,
      relatedObject: linked.relatedObject,
      actionIntents: group === "needs_me" ? ["open", "approve", "snooze"] : ["open"],
      precedence: 400
    });
  }

  for (const approval of stableRecords(state.approvalQueue)) {
    if (!visible(approval, actorContext)) continue;
    const id = sourceId(approval);
    const href = exactHref("approvalQueue", id);
    if (!id || !href) continue;
    const status = lower(approval.status);
    const type = lower(approval.type);
    const relatedId = clean(approval.sourceId);
    const linkedCollection = type === "post" ? "posts" : /campaign|outreach/.test(type) ? "campaigns" : "";
    const scope = actionScope(type);
    const dedupeKey = linkedCollection === "posts" && relatedId
      ? `social_review:${relatedId}`
      : linkedCollection === "campaigns" && relatedId
        ? `campaign_decision:${relatedId}:${scope}`
        : `decision:approvalQueue:${id}:${scope}`;
    const workKind = linkedCollection === "posts"
      ? "social_review"
      : linkedCollection === "campaigns" ? "campaign_decision" : "decision";
    const updatedAt = firstTimestamp(approval, ["approved_at", "rejected_at", "updatedAt", "updated_at", "createdAt", "created_at"]);
    let group = "";
    let summary = "";
    if (APPROVAL_OPEN.has(status)) {
      group = can(actorContext, "manage_approval_queue") ? "needs_me" : "waiting";
      summary = approval.whyItMatters || approval.summary || approval.recommendedAction || "A reviewed decision is still needed.";
    } else if (["snoozed", "scheduled"].includes(status)) {
      group = "waiting";
      summary = status === "snoozed" ? "This decision is paused until its existing revisit date." : "This decision is scheduled for a later date.";
    } else if (["approved", "rejected"].includes(status) && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = status === "approved" ? "The requested review was approved." : "The requested review was declined.";
    }
    if (!group) continue;
    push(output, {
      sourceKind: "approvalQueue",
      sourceId: id,
      workKind,
      dedupeKey,
      title: approval.title || (linkedCollection === "posts" ? "Review a social post" : "Review a company decision"),
      summary,
      group,
      priority: normalizeInboxPriority(approval.priority),
      dueAt: normalizeInboxTimestamp(approval.dueAt || approval.due_date, { dateOnlyEndOfDay: true }),
      updatedAt,
      owner: approval.owner || "Roger",
      requiresApproval: APPROVAL_OPEN.has(status),
      href,
      relatedObject: linkedCollection && relatedId ? relatedObject(linkedCollection, relatedId) : null,
      actionIntents: group === "needs_me" ? ["open", "approve"] : ["open"],
      precedence: 350
    });
  }

  for (const item of stableRecords(state.queueItems)) {
    if (!visible(item, actorContext)) continue;
    const id = sourceId(item);
    if (!id) continue;
    const linked = linkedDecision(item, indexes, item.metadata?.decisionType || item.type);
    const href = linked.href || exactHref("queueItems", id);
    if (!href) continue;
    const status = lower(item.status);
    const updatedAt = firstTimestamp(item, ["decidedAt", "updatedAt", "createdAt"]);
    const queueCapability = linked.workKind === "task" ? "manage_tasks"
      : linked.workKind === "campaign_decision" ? "manage_growth"
        : "manage_approval_queue";
    let group = "";
    let summary = "";
    if (status === "needs_roger" || (["new", "drafted"].includes(status) && item.requiresApproval)) {
      group = actorContext.role === "owner" && can(actorContext, queueCapability) ? "needs_me" : "waiting";
      summary = item.summary || item.recommendation || "A current decision needs attention.";
    } else if (["blocked", "snoozed", "scheduled", "approved"].includes(status)) {
      group = "waiting";
      summary = status === "blocked"
        ? item.summary || "This item is waiting for a recorded blocker to be resolved."
        : status === "snoozed"
          ? "This item is paused until its existing revisit date."
          : status === "approved"
            ? "The decision is approved and is waiting for the next reviewed step."
            : "This item is scheduled for a later date.";
    } else if (status === "completed" && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = "This reviewed item was completed recently.";
    }
    if (!group) continue;
    push(output, {
      sourceKind: "queueItems",
      sourceId: id,
      workKind: linked.workKind,
      dedupeKey: linked.dedupeKey,
      title: item.title || "Review an Inbox item",
      summary,
      group,
      priority: normalizeInboxPriority(item.priority),
      dueAt: normalizeInboxTimestamp(item.snoozedUntil || item.dueAt, { dateOnlyEndOfDay: true }),
      updatedAt,
      owner: item.owner || "Roger",
      requiresApproval: Boolean(item.requiresApproval && !["approved", "completed"].includes(status)),
      href,
      relatedObject: linked.relatedObject,
      actionIntents: group === "needs_me"
        ? ["open", ...(item.requiresApproval ? ["approve"] : ["complete"]), "snooze"]
        : ["open"],
      precedence: 300
    });
  }
}

function socialCandidates(state, actorContext, nowMs, output) {
  for (const post of stableRecords(state.posts)) {
    if (!visible(post, actorContext)) continue;
    const id = sourceId(post);
    const href = exactHref("posts", id);
    if (!id || !href) continue;
    const status = lower(post.status);
    const canReview = can(actorContext, "manage_content_drafts");
    const updatedAt = firstTimestamp(post, [
      "postedAt", "manuallyPostedAt", "scheduledAt", "approvedAt", "approved_at",
      "copyReviewedAt", "statusChangedAt", "updatedAt", "createdAt"
    ]);
    const dueAt = normalizeInboxTimestamp(post.scheduledFor || post.scheduled_at, { dateOnlyEndOfDay: true });
    let group = "";
    let summary = "";
    let requiresApproval = false;
    let scope = "review";
    if (status === "needs_review" || lower(post.approvalStatus) === "needs_review") {
      group = canReview ? "needs_me" : "waiting";
      requiresApproval = true;
      summary = post.complianceNotes
        ? `The post needs copy and safety review. ${post.complianceNotes}`
        : "The post needs copy and safety review before it can move forward.";
    } else if (["failed", "retry_ready", "blocked_channel_not_connected"].includes(status)) {
      group = canReview ? "needs_me" : "waiting";
      scope = "delivery";
      summary = status === "blocked_channel_not_connected"
        ? "The post cannot move forward until its connection or content blocker is fixed."
        : "The post needs a person to review what failed before another attempt.";
    } else if (status === "approved" && !post.imageFinalized) {
      group = canReview ? "needs_me" : "waiting";
      scope = "visual";
      summary = "The copy is approved, but the final image still needs to be prepared.";
    } else if (status === "approved" && !post.finalPreviewConfirmed) {
      group = canReview ? "needs_me" : "waiting";
      scope = "visual";
      summary = "The final image is ready, but the complete preview still needs confirmation.";
    } else if (status === "approved" && !dueAt) {
      group = canReview ? "needs_me" : "waiting";
      scope = "schedule";
      summary = "The post is approved and ready for a scheduling decision.";
    } else if (status === "scheduled") {
      group = "waiting";
      scope = "schedule";
      summary = dueAt ? "The post is scheduled and is waiting for its approved date." : "The post is scheduled under its existing plan.";
    } else if (["posted", "manually_posted"].includes(status) && isRecent(updatedAt, nowMs)) {
      group = "update";
      scope = "published";
      summary = "The post was published recently under the existing reviewed process.";
    }
    if (!group) continue;
    push(output, {
      sourceKind: "posts",
      sourceId: id,
      workKind: "social_review",
      dedupeKey: scope === "review" ? `social_review:${id}` : `social_review:${id}:${scope}`,
      title: post.title || post.hook || "Review a social post",
      summary,
      group,
      priority: normalizeInboxPriority(post.priority),
      dueAt,
      updatedAt,
      owner: post.owner,
      requiresApproval,
      href,
      relatedObject: relatedObject("posts", id),
      actionIntents: ["open"],
      precedence: 200
    });
  }
}

function campaignCandidates(state, actorContext, nowMs, output) {
  for (const campaign of stableRecords(state.campaigns)) {
    if (!visible(campaign, actorContext)) continue;
    const id = sourceId(campaign);
    const href = exactHref("campaigns", id);
    if (!id || !href) continue;
    const status = lower(campaign.status);
    const compliance = lower(campaign.complianceStatus || campaign.compliance_status);
    const partnerApproval = lower(campaign.partnerApprovalStatus || campaign.partner_approval_status);
    const owner = clean(campaign.owner);
    const assigned = !owner || actorOwns(owner, actorContext);
    const canDecide = can(actorContext, "manage_growth") && assigned;
    const updatedAt = firstTimestamp(campaign, [
      "completedAt", "launchedAt", "activatedAt", "statusChangedAt", "updatedAt", "lastActivityAt", "createdAt"
    ]);
    const dueAt = normalizeInboxTimestamp(
      campaign.launchDate || campaign.startDate || campaign.nextDecisionDate,
      { dateOnlyEndOfDay: true }
    );
    let group = "";
    let summary = "";
    let requiresApproval = false;
    let scope = "launch";
    if (["needs_review", "review_required", "needs_revision"].includes(compliance)) {
      group = canDecide ? "needs_me" : "waiting";
      requiresApproval = true;
      scope = "compliance";
      summary = "The campaign needs a reviewed compliance decision before it can move forward.";
    } else if (["pending", "waiting", "awaiting_approval"].includes(partnerApproval)) {
      group = "waiting";
      scope = "partner_approval";
      summary = "The campaign is waiting for the partner's recorded approval.";
    } else if (["needs_review", "approval_required", "ready_to_approve", "ready"].includes(status)) {
      group = canDecide ? "needs_me" : "waiting";
      requiresApproval = true;
      summary = status === "ready"
        ? "The campaign is ready for a person to choose its next approved step."
        : "The campaign needs a reviewed decision before it can move forward.";
    } else if (["scheduled", "paused", "blocked", "waiting"].includes(status)) {
      group = "waiting";
      summary = status === "paused"
        ? "The campaign is paused under its existing decision and remains on hold."
        : status === "blocked"
          ? "The campaign is waiting for its recorded blocker to be resolved."
          : "The campaign is waiting for its recorded date or dependency.";
    } else if (["completed", "live", "launched"].includes(status)
      && firstTimestamp(campaign, ["completedAt", "launchedAt", "activatedAt", "statusChangedAt"])
      && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = status === "completed" ? "The campaign completed recently." : "The campaign reached its active milestone recently.";
    }
    if (!group) continue;
    push(output, {
      sourceKind: "campaigns",
      sourceId: id,
      workKind: "campaign_decision",
      dedupeKey: `campaign_decision:${id}:${scope}`,
      title: campaign.campaignName || campaign.name || campaign.title || "Review an outreach campaign",
      summary,
      group,
      priority: normalizeInboxPriority(campaign.priority),
      dueAt,
      updatedAt,
      owner,
      requiresApproval,
      href,
      relatedObject: relatedObject("campaigns", id),
      actionIntents: ["open"],
      precedence: 200
    });
  }
}

function partnerCandidates(state, actorContext, nowMs, output) {
  for (const partner of stableRecords(state.partners)) {
    if (!visible(partner, actorContext)) continue;
    const id = sourceId(partner);
    const href = exactHref("partners", id);
    if (!id || !href) continue;
    const name = partner.organizationName || partner.name || partner.partnerName || "Partner";
    const owner = clean(partner.owner);
    const nextAction = clean(partner.nextAction);
    const blocker = clean(partner.blocker || partner.blockerReason);
    const rawDueAt = partner.nextActionDueDate || partner.nextFollowUpDate || partner.followUpDueAt;
    const dueAt = normalizeInboxTimestamp(rawDueAt, { dateOnlyEndOfDay: true });
    const updatedAt = firstTimestamp(partner, ["updatedAt", "lastTouchDate", "createdAt"]);
    if ((nextAction || blocker) && owner) {
      const actionable = can(actorContext, "manage_growth") && actorOwns(owner, actorContext);
      const group = blocker || sourceDateIsFuture(rawDueAt, dueAt, nowMs) || !actionable ? "waiting" : "needs_me";
      const summary = blocker
        ? `The follow-up is waiting for this recorded blocker: ${blocker}`
        : group === "waiting" && sourceDateIsFuture(rawDueAt, dueAt, nowMs)
          ? `The next action is scheduled for its existing follow-up date: ${nextAction}`
          : group === "waiting"
            ? `The next action belongs to ${owner}: ${nextAction}`
            : `The recorded next action is due: ${nextAction}`;
      push(output, {
        sourceKind: "partners",
        sourceId: id,
        workKind: "partner_followup",
        dedupeKey: `partner_followup:${id}`,
        title: `Follow up with ${name}`,
        summary,
        group,
        priority: normalizeInboxPriority(partner.priority),
        dueAt,
        updatedAt,
        owner,
        requiresApproval: false,
        href,
        relatedObject: relatedObject("partners", id),
        actionIntents: ["open"],
        precedence: 200
      });
    }

    const responseAt = firstTimestamp(partner, ["responseReceivedAt", "lastInboundAt", "milestoneAt"]);
    if (responseAt && isRecent(responseAt, nowMs)) {
      push(output, {
        sourceKind: "partners",
        sourceId: id,
        workKind: "partner_followup",
        dedupeKey: `partner_update:${id}:${responseAt}`,
        title: `${name} has a new update`,
        summary: partner.responseSummary || partner.milestoneSummary || "A recorded partner response or milestone arrived recently.",
        group: "update",
        priority: normalizeInboxPriority(partner.priority),
        dueAt: "",
        updatedAt: responseAt,
        owner,
        requiresApproval: false,
        href,
        relatedObject: relatedObject("partners", id),
        actionIntents: ["open"],
        precedence: 80
      });
    }
  }
}

function taskCandidates(state, actorContext, nowMs, output) {
  for (const task of stableRecords(state.tasks)) {
    if (!visible(task, actorContext)) continue;
    const id = sourceId(task);
    const href = exactHref("tasks", id);
    if (!id || !href) continue;
    const status = lower(task.status || "open");
    const priority = normalizeInboxPriority(task.priority);
    const rawDueAt = task.dueAt || task.dueDate || task.due_at || task.due_date;
    const dueAt = normalizeInboxTimestamp(rawDueAt, { dateOnlyEndOfDay: true });
    const updatedAt = firstTimestamp(task, ["completedAt", "completed_at", "updatedAt", "updated_at", "createdAt", "created_at"]);
    const owner = clean(task.owner);
    const assigned = owner && actorOwns(owner, actorContext);
    let group = "";
    let summary = "";
    if (["blocked", "waiting"].includes(status)) {
      group = "waiting";
      summary = status === "blocked"
        ? task.blockerReason || task.blocker_reason || task.description || "The task is waiting for a recorded blocker to be resolved."
        : task.waitingOn || task.waiting_on || task.description || "The task is explicitly waiting on another person or dependency.";
    } else if (["open", "in_progress"].includes(status)
      && (["urgent", "high"].includes(priority) || task.important === true)) {
      const actionable = can(actorContext, "manage_tasks") && assigned && !sourceDateIsFuture(rawDueAt, dueAt, nowMs);
      group = actionable ? "needs_me" : "waiting";
      summary = actionable
        ? task.nextAction || task.description || "This important task is assigned and ready for attention."
        : sourceDateIsFuture(rawDueAt, dueAt, nowMs)
          ? "This important task is scheduled for its existing future date."
          : owner
            ? `This important task is assigned to ${owner}.`
            : "This important task is waiting for an owner.";
    } else if (status === "done" && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = task.completionNote || task.completion_note || "This important task was completed recently.";
    }
    if (!group || (TERMINAL_TASKS.has(status) && group !== "update")) continue;
    const relatedCollection = lower(task.relatedObjectType || task.relatedType || task.sourceType) === "partner"
      ? "partners"
      : lower(task.relatedObjectType || task.relatedType || task.sourceType) === "campaign"
        ? "campaigns"
        : lower(task.relatedObjectType || task.relatedType || task.sourceType) === "post" ? "posts" : "";
    const relatedId = clean(task.relatedObjectId || task.relatedId || task.partnerId || task.campaignId || task.sourceId);
    push(output, {
      sourceKind: "tasks",
      sourceId: id,
      workKind: "task",
      dedupeKey: `task:${id}`,
      title: task.title || "Review an important task",
      summary,
      group,
      priority,
      dueAt,
      updatedAt,
      owner,
      requiresApproval: false,
      href,
      relatedObject: relatedCollection && relatedId ? relatedObject(relatedCollection, relatedId) : null,
      actionIntents: group === "needs_me" ? ["open", "complete", "snooze"] : ["open"],
      precedence: 180
    });
  }
}

function automationCandidates(state, actorContext, nowMs, output) {
  for (const suggestion of stableRecords(state.automationSuggestions)) {
    if (!visible(suggestion, actorContext)) continue;
    const id = sourceId(suggestion);
    const href = exactHref("automationSuggestions", id);
    if (!id || !href) continue;
    const status = lower(suggestion.status);
    const updatedAt = firstTimestamp(suggestion, ["appliedAt", "updatedAt", "createdAt"]);
    let group = "";
    let summary = "";
    if (["pending", "edited"].includes(status)) {
      group = can(actorContext, "manage_autonomy") ? "needs_me" : "waiting";
      summary = suggestion.explanation || suggestion.summary || "A suggested record change needs explicit review before anything changes.";
    } else if (status === "applied" && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = "The reviewed suggestion was applied to its authoritative record.";
    }
    if (!group) continue;
    const relatedType = lower(suggestion.relatedEntityType);
    const relatedCollection = relatedType === "partner" ? "partners"
      : relatedType === "campaign" ? "campaigns"
        : relatedType === "post" ? "posts" : "";
    const relatedId = clean(suggestion.relatedEntityId);
    push(output, {
      sourceKind: "automationSuggestions",
      sourceId: id,
      workKind: "automation_review",
      dedupeKey: `automation_review:${id}`,
      title: suggestion.title || "Review a suggested change",
      summary,
      group,
      priority: normalizeInboxPriority(suggestion.priority || (suggestion.confidence === "high" ? "high" : "normal")),
      dueAt: normalizeInboxTimestamp(suggestion.dueAt || suggestion.proposedChanges?.dueDate, { dateOnlyEndOfDay: true }),
      updatedAt,
      owner: suggestion.owner || "Operations",
      requiresApproval: ["pending", "edited"].includes(status),
      href,
      relatedObject: relatedCollection && relatedId ? relatedObject(relatedCollection, relatedId) : null,
      actionIntents: group === "needs_me" ? ["open", "approve"] : ["open"],
      precedence: 200
    });
  }
}

function replyCandidates(state, actorContext, nowMs, output) {
  for (const signal of stableRecords(state.inboxSignals)) {
    if (!visible(signal, actorContext)) continue;
    const id = sourceId(signal);
    const href = exactHref("inboxSignals", id);
    if (!id || !href) continue;
    const status = lower(signal.status);
    const kind = lower(signal.kind);
    const updatedAt = firstTimestamp(signal, ["resolvedAt", "updatedAt", "lastSeenAt", "occurredAt", "createdAt"]);
    let group = "";
    let summary = "";
    if (status === "suggested" && ["needs_reply", "went_quiet", "commitment", "pipeline_inbound"].includes(kind)) {
      group = actorContext.role === "owner" ? "needs_me" : "waiting";
      summary = signal.summary || "A read-only inbox signal needs a response decision.";
    } else if (status === "snoozed") {
      group = "waiting";
      summary = "This response is paused until its existing revisit date.";
    } else if (status === "resolved" && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = "The related conversation moved, so this response signal was resolved.";
    }
    if (!group) continue;
    const person = founderInboxText(signal.counterpartName, "", 80);
    push(output, {
      sourceKind: "inboxSignals",
      sourceId: id,
      workKind: "reply_followup",
      dedupeKey: `reply_followup:${id}`,
      title: person ? `Follow up with ${person}` : "Review a response follow-up",
      summary,
      group,
      priority: normalizeInboxPriority(signal.priority || (Number(signal.ageDays) >= 7 ? "high" : "normal")),
      dueAt: normalizeInboxTimestamp(signal.snoozedUntil || signal.dueAt, { dateOnlyEndOfDay: true }),
      updatedAt,
      owner: "Roger",
      requiresApproval: false,
      href,
      relatedObject: null,
      actionIntents: ["open"],
      precedence: 200
    });
  }

  for (const item of stableRecords(state.growthInbox)) {
    if (!visible(item, actorContext)) continue;
    const id = sourceId(item);
    const href = exactHref("growthInbox", id);
    if (!id || !href) continue;
    const status = lower(item.status);
    const decision = lower(item.decisionNeeded);
    const updatedAt = firstTimestamp(item, ["updatedAt", "createdAt"]);
    let group = "";
    let summary = "";
    if (["new", "triaged"].includes(status)
      && ["human_review_required", "roger_decision", "operator_triage"].includes(decision)
      && clean(item.summary)) {
      const actionable = can(actorContext, "manage_growth") && actorOwns(item.owner, actorContext);
      group = actionable ? "needs_me" : "waiting";
      summary = item.suggestedAction || "This captured signal needs an explicit review and destination.";
    } else if (status === "converted" && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = "The captured signal was reviewed and moved to its authoritative record.";
    }
    if (!group) continue;
    push(output, {
      sourceKind: "growthInbox",
      sourceId: id,
      workKind: "reply_followup",
      dedupeKey: `captured_followup:${id}`,
      title: item.summary || "Review a captured follow-up",
      summary,
      group,
      priority: normalizeInboxPriority(item.priority),
      dueAt: normalizeInboxTimestamp(item.dueDate, { dateOnlyEndOfDay: true }),
      updatedAt,
      owner: item.owner,
      requiresApproval: decision !== "operator_triage" && ["new", "triaged"].includes(status),
      href,
      relatedObject: null,
      actionIntents: ["open"],
      precedence: 180
    });
  }

  for (const issue of stableRecords(state.supportIssues)) {
    if (!visible(issue, actorContext)) continue;
    const id = sourceId(issue);
    const href = exactHref("supportIssues", id);
    if (!id || !href) continue;
    const status = lower(issue.status);
    const updatedAt = firstTimestamp(issue, ["resolved_at", "updated_at", "updatedAt", "created_at", "createdAt"]);
    let group = "";
    let summary = "";
    if (["open", "drafted"].includes(status)) {
      group = can(actorContext, "mutate_state") ? "needs_me" : "waiting";
      summary = issue.upl_sensitive
        ? "This request may ask for legal advice and needs a personal review before anyone replies."
        : status === "drafted"
          ? "A reply draft is ready for a person to review."
          : issue.summary || "A support request needs a response.";
    } else if (status === "waiting") {
      group = "waiting";
      summary = issue.waiting_on || issue.summary || "This request is explicitly waiting on another person or dependency.";
    } else if (["resolved", "closed"].includes(status) && isRecent(updatedAt, nowMs)) {
      group = "update";
      summary = "The support request was resolved recently.";
    }
    if (!group) continue;
    push(output, {
      sourceKind: "supportIssues",
      sourceId: id,
      workKind: "reply_followup",
      dedupeKey: `support_followup:${id}`,
      title: issue.title || "Review a support request",
      summary,
      group,
      priority: normalizeInboxPriority(issue.urgency === "urgent" ? "urgent" : issue.priority),
      dueAt: normalizeInboxTimestamp(issue.dueAt || issue.due_date, { dateOnlyEndOfDay: true }),
      updatedAt,
      owner: issue.owner || "Roger",
      requiresApproval: Boolean(issue.upl_sensitive),
      href,
      relatedObject: null,
      actionIntents: ["open"],
      precedence: 200
    });
  }
}

const FILE_CONFIGS = Object.freeze([
  Object.freeze({ collection: "reports", title: ["reportTitle", "title", "name"], due: ["nextReviewDate", "dueAt"] }),
  Object.freeze({ collection: "dataRoomItems", title: ["title", "name"], due: ["nextReviewDate", "dueAt", "lastUpdated"] }),
  Object.freeze({ collection: "evidencePackNotes", title: ["title", "name"], due: ["nextReviewDate", "dueAt"] }),
  Object.freeze({ collection: "soc2Evidence", title: ["evidenceTitle", "title", "name"], due: ["nextCollectionDue", "dueAt"] }),
  Object.freeze({ collection: "soc2Policies", title: ["policyName", "title", "name"], due: ["nextReviewDate", "dueAt"] })
]);

function firstText(record = {}, fields = []) {
  for (const field of fields) {
    const value = clean(record?.[field]);
    if (value) return value;
  }
  return "";
}

function fileCandidates(state, actorContext, nowMs, output) {
  for (const config of FILE_CONFIGS) {
    for (const record of stableRecords(state[config.collection])) {
      if (!visible(record, actorContext)) continue;
      const id = sourceId(record);
      const href = exactHref(config.collection, id);
      if (!id || !href) continue;
      const title = firstText(record, config.title) || "Review a company file";
      const status = lower(record.status || record.evidenceStatus);
      const reviewState = lower(record.review_state || record.reviewState || record.approvalStatus);
      const rawDueAt = firstText(record, config.due);
      const dueAt = normalizeInboxTimestamp(rawDueAt, { dateOnlyEndOfDay: true });
      const updatedAt = firstTimestamp(record, [
        "approvedAt", "reviewedAt", "statusChangedAt", "updatedAt", "updated_at",
        "generatedAt", "generated_at", "createdAt", "created_at"
      ]);
      const owner = clean(record.owner || record.reviewer);
      const canUpdate = can(actorContext, "view_private_assets")
        && (can(actorContext, "manage_growth") || can(actorContext, "update_review_state"))
        && (!owner || actorOwns(owner, actorContext));
      let group = "";
      let summary = "";
      let requiresApproval = false;
      const overdueEvidence = config.collection === "soc2Evidence" && dueAt && sourceDateIsDue(rawDueAt, dueAt, nowMs);
      const policyReviewDue = config.collection === "soc2Policies" && dueAt && sourceDateIsDue(rawDueAt, dueAt, nowMs);
      if (FILE_WAITING_STATES.has(reviewState) || FILE_WAITING_STATES.has(status)) {
        group = "waiting";
        summary = "This file is explicitly waiting for a recorded blocker, date, or dependency.";
      } else if (FILE_REVIEW_STATES.has(reviewState)
        || ["needs_update", "outdated", "expired", "ready_for_review", "rejected"].includes(status)
        || overdueEvidence
        || policyReviewDue) {
        group = canUpdate ? "needs_me" : "waiting";
        requiresApproval = FILE_REVIEW_STATES.has(reviewState) || status === "ready_for_review";
        summary = overdueEvidence
          ? "The next evidence collection date has passed, so this record needs an update."
          : policyReviewDue
            ? "The policy's recorded review date has arrived and needs attention."
            : reviewState === "needs_revision" || status === "rejected"
              ? "A reviewer requested changes before this file can become current."
              : status === "needs_update" || status === "outdated" || status === "expired"
                ? "This file is no longer current and needs an updated version or date."
                : "This file is ready for its recorded review.";
      } else {
        const completedAt = firstTimestamp(record, ["approvedAt", "reviewedAt", "statusChangedAt"]);
        if (RECENT_FILE_STATUSES.has(status) && completedAt && isRecent(completedAt, nowMs)) {
          group = "update";
          summary = "This file became current under the existing review process.";
        }
      }
      if (!group) continue;
      push(output, {
        sourceKind: config.collection,
        sourceId: id,
        workKind: "file_update",
        dedupeKey: `file_update:${config.collection}:${id}`,
        title,
        summary,
        group,
        priority: normalizeInboxPriority(record.priority),
        dueAt,
        updatedAt,
        owner,
        requiresApproval,
        href,
        relatedObject: relatedObject(config.collection, id),
        actionIntents: ["open"],
        precedence: 200
      });
    }
  }
}

export function collectInboxCandidates(state = {}, actor = {}, now = "") {
  const nowIso = normalizeInboxTimestamp(now);
  if (!nowIso) throw new TypeError("buildInboxView requires a valid supplied now value.");
  const actorContext = inboxActorContext(actor);
  if (!actorContext.valid || !roleHasCapability(actorContext.role, "read_internal")) {
    return { actorContext, nowIso, candidates: [] };
  }
  const nowMs = Date.parse(nowIso);
  const indexes = buildIndexes(state);
  const candidates = [];
  decisionCandidates(state, actorContext, nowMs, indexes, candidates);
  socialCandidates(state, actorContext, nowMs, candidates);
  campaignCandidates(state, actorContext, nowMs, candidates);
  partnerCandidates(state, actorContext, nowMs, candidates);
  taskCandidates(state, actorContext, nowMs, candidates);
  automationCandidates(state, actorContext, nowMs, candidates);
  replyCandidates(state, actorContext, nowMs, candidates);
  fileCandidates(state, actorContext, nowMs, candidates);
  return { actorContext, nowIso, candidates };
}
