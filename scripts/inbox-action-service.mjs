import { transitionQueueItem } from "./company-memory.mjs";
import { roleHasCapability } from "./roles.mjs";
import { updateTaskInState } from "./tasks-engine.mjs";
import {
  inboxActionIsExecutable,
  requiredCapabilityForInboxAction
} from "./ui-actions/inbox-actions.mjs";
import { normalizeInboxTimestamp } from "./ui/view-models/inbox-sources.mjs";
import { buildInboxView } from "./ui/view-models/inbox-view.mjs";

const ALLOWED_KEYS = Object.freeze(new Set([
  "inboxItemId",
  "intent",
  "requestId",
  "expectedUpdatedAt",
  "snoozeUntil"
]));
const ACCEPTED_INTENTS = Object.freeze(new Set(["approve", "complete", "snooze"]));
const COMPLETED_TASK_STATUSES = Object.freeze(new Set(["done", "complete", "completed"]));

export const INBOX_ACTION_BODY_LIMIT = 8 * 1024;

export class InboxActionError extends Error {
  constructor(message, status = 400, outcome = "invalid") {
    super(message);
    this.name = "InboxActionError";
    this.status = status;
    this.outcome = outcome;
  }
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function safeString(value, field, maximum, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new InboxActionError(`A valid ${field} is required.`);
    return "";
  }
  if (typeof value !== "string") throw new InboxActionError(`A valid ${field} is required.`);
  const text = clean(value);
  if ((required && !text) || text.length > maximum || /[\u0000-\u001f\u007f<>]/u.test(text)) {
    throw new InboxActionError(`A valid ${field} is required.`);
  }
  return text;
}

export function parseInboxActionPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InboxActionError("The Inbox action request is invalid.");
  }
  const unknown = Object.keys(payload).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknown.length) throw new InboxActionError("The Inbox action request contains unsupported information.");
  const inboxItemId = safeString(payload.inboxItemId, "Inbox item", 360, { required:true });
  const intent = safeString(payload.intent, "action", 16, { required:true }).toLowerCase();
  const requestId = safeString(payload.requestId, "request ID", 96, { required:true });
  const expectedUpdatedAt = safeString(payload.expectedUpdatedAt, "item version", 64, { required:true });
  const snoozeUntil = safeString(payload.snoozeUntil, "snooze date", 64);
  if (!ACCEPTED_INTENTS.has(intent)) throw new InboxActionError("This Inbox action is not supported.");
  if (!/^[A-Za-z0-9._:-]{8,96}$/.test(requestId)) throw new InboxActionError("A valid request ID is required.");
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) throw new InboxActionError("A valid item version is required.");
  if (intent !== "snooze" && snoozeUntil) throw new InboxActionError("This Inbox action does not accept a snooze date.");
  return Object.freeze({ inboxItemId, intent, requestId, expectedUpdatedAt, snoozeUntil });
}

function allItems(view = {}) {
  return [
    ...list(view.groups?.needsMe),
    ...list(view.groups?.waiting),
    ...list(view.groups?.updates)
  ];
}

function compactCounts(view = {}) {
  return Object.freeze({
    needsMe:Number(view.counts?.needsMe || 0),
    waiting:Number(view.counts?.waiting || 0),
    updates:Number(view.counts?.updates || 0),
    total:Number(view.counts?.total || 0)
  });
}

function publicResult({ parsed, item, intent, message, outcome = "applied", alreadyApplied = false, view }) {
  return Object.freeze({
    ok:true,
    intent,
    inboxItemId:parsed.inboxItemId,
    outcome,
    message,
    sourceHref:item.href,
    alreadyApplied,
    counts:compactCounts(view)
  });
}

function resolvedSource(state, item) {
  if (item.sourceKind === "approvals") {
    const approval = list(state.approvals).find((entry) => clean(entry.id) === item.sourceId);
    const queueItem = approval
      ? list(state.queueItems).find((entry) => clean(entry.id) === clean(approval.queue_item_id))
      : null;
    return approval && queueItem ? { kind:"queue", queueItem, approval } : null;
  }
  if (item.sourceKind === "queueItems") {
    const queueItem = list(state.queueItems).find((entry) => clean(entry.id) === item.sourceId);
    return queueItem ? { kind:"queue", queueItem, approval:null } : null;
  }
  if (item.sourceKind === "tasks") {
    const task = list(state.tasks).find((entry) => clean(entry.id) === item.sourceId);
    return task ? { kind:"task", task } : null;
  }
  return null;
}

function normalizedSnoozeUntil(value, nowIso) {
  const normalized = normalizeInboxTimestamp(value, { dateOnlyEndOfDay:true });
  if (!normalized || Date.parse(normalized) <= Date.parse(nowIso)) {
    throw new InboxActionError("Choose a future snooze date.", 400, "invalid");
  }
  if (Date.parse(normalized) - Date.parse(nowIso) > 366 * 86_400_000) {
    throw new InboxActionError("Choose a snooze date within the next year.", 400, "invalid");
  }
  return normalized;
}

function actionAlreadyApplied(source, parsed, nowIso) {
  if (source.kind === "queue") {
    if (parsed.intent === "approve") {
      return source.queueItem.status === "approved"
        || source.approval?.state === "approved";
    }
    if (parsed.intent === "complete") return source.queueItem.status === "completed";
    if (parsed.intent === "snooze") {
      const requested = normalizedSnoozeUntil(parsed.snoozeUntil, nowIso);
      return source.queueItem.status === "snoozed"
        && normalizeInboxTimestamp(source.queueItem.snoozedUntil) === normalizeInboxTimestamp(requested);
    }
  }
  if (source.kind === "task" && parsed.intent === "complete") {
    return COMPLETED_TASK_STATUSES.has(clean(source.task.status).toLowerCase());
  }
  return false;
}

function assertAuthorized(item, actor, parsed) {
  const capability = requiredCapabilityForInboxAction(item, parsed.intent);
  if (!capability || !roleHasCapability(actor.role, capability)) {
    throw new InboxActionError("This item is not available for this action.", 404, "not_available");
  }
}

function assertCurrent(item, parsed) {
  if (!inboxActionIsExecutable(item, parsed.intent)) {
    throw new InboxActionError("This item changed. Refresh Inbox and try again.", 409, "stale");
  }
}

function changedCollections(before, after, names) {
  return Object.freeze(Object.fromEntries(names
    .filter((name) => after[name] !== before[name])
    .map((name) => [name, after[name]])));
}

function actorLabel(actor = {}) {
  return clean(actor.label || actor.displayName || actor.id) || "Owner";
}

function executeQueueAction(state, source, parsed, actor, nowIso) {
  const status = parsed.intent === "approve" ? "approved"
    : parsed.intent === "complete" ? "completed"
      : "snoozed";
  const snoozedUntil = parsed.intent === "snooze" ? normalizedSnoozeUntil(parsed.snoozeUntil, nowIso) : "";
  const transitioned = transitionQueueItem(state, {
    id:source.queueItem.id,
    status,
    actor:actorLabel(actor),
    note:"",
    snoozedUntil,
    now:() => nowIso
  });
  if (!transitioned.ok) throw new InboxActionError("This item changed. Refresh Inbox and try again.", 409, "stale");
  return {
    state:transitioned.state,
    collections:changedCollections(state, transitioned.state, ["queueItems", "approvals", "companyEvents"]),
    message:parsed.intent === "approve"
      ? "Approval recorded. Nothing was sent, published, launched, or released."
      : parsed.intent === "complete"
        ? "Item marked complete."
        : "Item snoozed until the selected date."
  };
}

function executeTaskAction(state, source, parsed, actor, nowIso) {
  if (parsed.intent !== "complete") throw new InboxActionError("This Inbox action is not supported.");
  const result = updateTaskInState(state, source.task.id, "done", {
    completion_note:"Completed from Inbox."
  }, { now:nowIso, actor:actorLabel(actor) });
  return {
    state:result.state,
    collections:changedCollections(state, result.state, ["tasks", "auditHistory", "activityEvents"]),
    message:"Task marked complete."
  };
}

export function executeAuthorizedInboxAction(state = {}, actor = {}, now = "", payload = {}) {
  const parsed = parseInboxActionPayload(payload);
  const nowIso = normalizeInboxTimestamp(now);
  if (!nowIso) throw new InboxActionError("Inbox actions are temporarily unavailable.", 500, "temporary_failure");
  if (!actor?.authenticated || !clean(actor.id) || !clean(actor.role)) {
    throw new InboxActionError("Your session ended. Sign in and try again.", 401, "session_expired");
  }
  const currentView = buildInboxView(state, actor, nowIso);
  const item = allItems(currentView).find((entry) => entry.id === parsed.inboxItemId);
  if (!item) throw new InboxActionError("This item is not available for this action.", 404, "not_available");
  const source = resolvedSource(state, item);
  if (!source) throw new InboxActionError("This item changed. Refresh Inbox and try again.", 409, "stale");
  assertAuthorized(item, actor, parsed);

  if (actionAlreadyApplied(source, parsed, nowIso)) {
    return Object.freeze({
      status:200,
      state,
      collections:Object.freeze({}),
      body:publicResult({
        parsed,
        item,
        intent:parsed.intent,
        message:"This action was already recorded.",
        outcome:"already_applied",
        alreadyApplied:true,
        view:currentView
      })
    });
  }

  assertCurrent(item, parsed);
  if (normalizeInboxTimestamp(item.updatedAt) !== normalizeInboxTimestamp(parsed.expectedUpdatedAt)) {
    throw new InboxActionError("This item changed. Refresh Inbox and try again.", 409, "stale");
  }

  const applied = source.kind === "queue"
    ? executeQueueAction(state, source, parsed, actor, nowIso)
    : executeTaskAction(state, source, parsed, actor, nowIso);
  const refreshedView = buildInboxView(applied.state, actor, nowIso);
  return Object.freeze({
    status:200,
    state:applied.state,
    collections:applied.collections,
    body:publicResult({
      parsed,
      item,
      intent:parsed.intent,
      message:applied.message,
      view:refreshedView
    })
  });
}

export function inboxActionSafeError(error = {}) {
  const status = Number(error?.status || 500);
  const known = error instanceof InboxActionError;
  return Object.freeze({
    status,
    body:Object.freeze({
      ok:false,
      outcome:known ? error.outcome : "temporary_failure",
      message:known
        ? error.message
        : "Inbox action could not be completed. No records were changed. Try again."
    })
  });
}
