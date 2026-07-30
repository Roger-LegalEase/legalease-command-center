import { roleHasCapability } from "./roles.mjs";
import { normalizeTaskRecord, updateTaskInState } from "./tasks-engine.mjs";
import { transitionQueueItem } from "./company-memory.mjs";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "./ui/route-compatibility.mjs";

export const TASK_WORKBENCH_BODY_LIMIT = 12 * 1024;
export const TASK_WORKBENCH_ROUTE = /^\/api\/ui\/tasks\/([^/]+)(?:\/(action))?$/;
export const TASK_WORKBENCH_READ_COLLECTIONS = Object.freeze([
  "campaigns",
  "partners",
  "posts",
  "supportIssues",
  "tasks"
]);

// Founder OS Release 2: completing a task from the Today panel also closes the queue item that
// projected it into Today, which needs the queue spine in scope. Read only when the flag is on.
export const TASK_WORKBENCH_FOUNDER_READ_COLLECTIONS = Object.freeze([
  ...TASK_WORKBENCH_READ_COLLECTIONS,
  "queueItems",
  "approvals",
  "companyEvents"
]);

const ACTIONS = Object.freeze(new Set([
  "done",
  "in_progress",
  "waiting",
  "blocked",
  "snooze",
  "update_due_date",
  "update_priority",
  // The endpoint has always accepted `assign`; nothing exposed it, so a task's owner could be set
  // once and never changed. Same authorization as every other action here (manage_tasks).
  "assign",
  "update_title",
  "add_note",
  "reopen"
]));
const PRIORITIES = Object.freeze(new Set(["critical", "high", "medium", "low"]));
const ALLOWED_KEYS = Object.freeze(new Set([
  "action",
  "expectedVersion",
  "note",
  "waitingOn",
  "blockerReason",
  "dueDate",
  // Without these two the panel's own request was rejected as "unsupported information": `assign`
  // and `update_title` were allowed ACTIONS while their fields were not allowed KEYS, so the
  // request 400'd and the form looked like it had saved nothing. Two allow-lists, one of which
  // was missed.
  "owner",
  "title",
  "priority",
  "days"
]));

export class TaskWorkbenchError extends Error {
  constructor(message, status = 400, outcome = "validation_error", field = "") {
    super(message);
    this.name = "TaskWorkbenchError";
    this.status = status;
    this.outcome = outcome;
    this.field = field;
  }
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeText(value, field, maximum, { required = false } = {}) {
  const label = Object.freeze({
    action:"Action",
    expectedVersion:"Task version",
    note:"Note",
    waitingOn:"Waiting on",
    blockerReason:"Blocker reason",
    priority:"Priority"
  })[field] || field;
  if (value === undefined || value === null) {
    if (required) throw new TaskWorkbenchError(`${label} is required.`, 400, "validation_error", field);
    return "";
  }
  if (typeof value !== "string") throw new TaskWorkbenchError(`${label} is invalid.`, 400, "validation_error", field);
  const text = clean(value);
  if ((required && !text) || text.length > maximum || /[\u0000-\u001f\u007f<>]/u.test(text)) {
    throw new TaskWorkbenchError(`${label} is invalid.`, 400, "validation_error", field);
  }
  return text;
}

function timestamp(value = "") {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function dateOnly(value = "") {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (!match
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day) {
    throw new TaskWorkbenchError("Choose a valid due date.", 400, "validation_error", "dueDate");
  }
  return text;
}

function actorLabel(actor = {}) {
  return clean(actor.label || actor.displayName || actor.id) || "Owner";
}

function assertRead(actor = {}) {
  if (!actor?.authenticated || !clean(actor.id) || !roleHasCapability(actor.role, "read_internal")) {
    throw new TaskWorkbenchError("This task is unavailable.", actor?.authenticated ? 403 : 401, actor?.authenticated ? "unauthorized" : "session_expired");
  }
}

function assertWrite(actor = {}) {
  assertRead(actor);
  if (!roleHasCapability(actor.role, "manage_tasks")) {
    throw new TaskWorkbenchError("This account cannot change tasks.", 403, "unauthorized");
  }
}

function exactTask(state = {}, taskId = "", actor = null) {
  const matches = list(state.tasks).filter((task) => clean(task?.id) === clean(taskId));
  if (matches.length !== 1) throw new TaskWorkbenchError("This task is unavailable.", 404, "not_available");
  if (actor && !recordVisibleToActor(matches[0], actor.role)) {
    throw new TaskWorkbenchError("This task is unavailable.", 404, "not_available");
  }
  return matches[0];
}

function effectiveUpdatedAt(task = {}) {
  return timestamp(task.updatedAt || task.updated_at || task.createdAt || task.created_at);
}

function taskVersion(task = {}) {
  return effectiveUpdatedAt(task) || "legacy";
}

const LINKED_SOURCE_CONFIG = Object.freeze({
  partner:Object.freeze({ collection:"partners", label:"Partner", objectType:"Partner", sourceKind:"partner", titleFields:["organizationName", "name"] }),
  partners:Object.freeze({ collection:"partners", label:"Partner", objectType:"Partner", sourceKind:"partner", titleFields:["organizationName", "name"] }),
  campaign:Object.freeze({ collection:"campaigns", label:"Campaign", objectType:"Campaign", sourceKind:"campaign", titleFields:["campaignName", "name", "title"] }),
  campaigns:Object.freeze({ collection:"campaigns", label:"Campaign", objectType:"Campaign", sourceKind:"campaign", titleFields:["campaignName", "name", "title"] }),
  post:Object.freeze({ collection:"posts", label:"Social Post", objectType:"Post", sourceKind:"post", titleFields:["title", "hook"] }),
  social_post:Object.freeze({ collection:"posts", label:"Social Post", objectType:"Post", sourceKind:"post", titleFields:["title", "hook"] }),
  support_issue:Object.freeze({ collection:"supportIssues", label:"Support issue", titleFields:["title", "summary"] }),
  support:Object.freeze({ collection:"supportIssues", label:"Support issue", titleFields:["title", "summary"] }),
  outreach:Object.freeze({ collection:"campaigns", label:"Outreach campaign", titleFields:["campaignName", "name", "title"] })
});

function linkedSource(state = {}, task = {}, actor = {}) {
  const sourceType = clean(task.sourceType || task.source).toLowerCase();
  let config = LINKED_SOURCE_CONFIG[sourceType];
  let sourceId = clean(task.sourceId);
  if (clean(task.partnerId || task.linked_partner || task.linkedPartner)) {
    config = LINKED_SOURCE_CONFIG.partner;
    sourceId = clean(task.partnerId || task.linked_partner || task.linkedPartner);
  } else if (clean(task.campaignId)) {
    config = LINKED_SOURCE_CONFIG.campaign;
    sourceId = clean(task.campaignId);
  }
  if (!config || !sourceId) return null;
  const record = list(state[config.collection]).find((entry) => clean(entry?.id) === sourceId && recordVisibleToActor(entry, actor.role));
  if (!record) return null;
  const link = config.objectType
    ? buildExactObjectLink({ objectType:config.objectType, sourceKind:config.sourceKind, sourceId })
    : buildGenericItemLink({ collection:config.collection, sourceId });
  const title = config.titleFields.map((field) => clean(record[field])).find(Boolean) || config.label;
  return {
    kind:config.collection,
    id:sourceId,
    label:config.label,
    title,
    href:link?.target || ""
  };
}

function publicHistory(task = {}) {
  return list(task.history).slice(0, 20).map((entry) => ({
    action:clean(entry?.action).replaceAll("_", " ") || "updated",
    at:timestamp(entry?.at || entry?.timestamp),
    actor:clean(entry?.actor),
    note:clean(entry?.note).slice(0, 600)
  }));
}

function availableActions(task = {}, writable = false) {
  if (!writable) return [];
  const status = clean(task.status || "open").toLowerCase();
  if (["done", "archived"].includes(status)) return status === "done" ? ["reopen", "add_note"] : ["add_note"];
  return ["done", ...(status === "in_progress" ? [] : ["in_progress"]), "waiting", "blocked", "snooze", "update_due_date", "assign", "update_title", "update_priority", "add_note"];
}

export function buildTaskWorkbenchView(state = {}, actor = {}, taskId = "") {
  assertRead(actor);
  const raw = exactTask(state, taskId, actor);
  const task = normalizeTaskRecord(raw, { now:raw.updatedAt || raw.updated_at || new Date().toISOString() });
  const fullRecord = buildGenericItemLink({ collection:"tasks", sourceId:task.id });
  return deepFreeze({
    ok:true,
    task:{
      id:task.id,
      title:task.title,
      description:task.description,
      status:task.status,
      priority:task.priority,
      owner:task.owner,
      dueDate:task.dueDate || task.due_date || "",
      nextAction:task.nextAction,
      waitingOn:task.waitingOn || task.waiting_on || "",
      blockerReason:task.blockerReason || task.blocker_reason || "",
      completionNote:task.completionNote || task.completion_note || "",
      updatedAt:effectiveUpdatedAt(raw),
      version:taskVersion(raw),
      linkedSource:linkedSource(state, task, actor),
      fullRecordHref:fullRecord?.target || "",
      history:publicHistory(task),
      actions:availableActions(task, roleHasCapability(actor.role, "manage_tasks"))
    }
  });
}

export function parseTaskWorkbenchAction(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TaskWorkbenchError("The task change is invalid.");
  }
  const unknown = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknown.length) throw new TaskWorkbenchError("The task change contains unsupported information.");
  const action = safeText(input.action, "action", 32, { required:true }).toLowerCase();
  if (!ACTIONS.has(action)) throw new TaskWorkbenchError("This task action is not supported.", 400, "validation_error", "action");
  const expectedVersion = safeText(input.expectedVersion, "expectedVersion", 64, { required:true });
  if (expectedVersion !== "legacy" && !timestamp(expectedVersion)) throw new TaskWorkbenchError("Task changed; refresh and try again.", 409, "conflict");
  const note = safeText(input.note, "note", 2_000);
  const waitingOn = safeText(input.waitingOn, "waitingOn", 500, { required:action === "waiting" });
  const blockerReason = safeText(input.blockerReason, "blockerReason", 500, { required:action === "blocked" });
  const priority = safeText(input.priority, "priority", 16).toLowerCase();
  if (action === "update_priority" && !PRIORITIES.has(priority)) {
    throw new TaskWorkbenchError("Choose a valid priority.", 400, "validation_error", "priority");
  }
  const dueDate = action === "update_due_date" ? dateOnly(input.dueDate) : "";
  const owner = action === "assign" ? safeText(input.owner, "owner", 80) : "";
  if (action === "assign" && !owner) throw new TaskWorkbenchError("Enter an owner before saving.", 400, "validation_error", "owner");
  const title = action === "update_title" ? safeText(input.title, "title", 200) : "";
  if (action === "update_title" && !title) throw new TaskWorkbenchError("Enter a title before saving.", 400, "validation_error", "title");
  const days = action === "snooze" ? Number(input.days || 3) : 0;
  if (action === "snooze" && (![1, 3, 7, 14, 30].includes(days))) {
    throw new TaskWorkbenchError("Choose a valid snooze period.", 400, "validation_error", "days");
  }
  if (action === "add_note" && !note) throw new TaskWorkbenchError("Enter a note before saving.", 400, "validation_error", "note");
  return Object.freeze({ action, expectedVersion:expectedVersion === "legacy" ? "legacy" : timestamp(expectedVersion), note, waitingOn, blockerReason, dueDate, owner, title, priority, days });
}

export function applyTaskWorkbenchAction(state = {}, actor = {}, taskId = "", input = {}, options = {}) {
  assertWrite(actor);
  const parsed = parseTaskWorkbenchAction(input);
  const existing = exactTask(state, taskId, actor);
  if (taskVersion(existing) !== parsed.expectedVersion) {
    throw new TaskWorkbenchError("Task changed; refresh and try again.", 409, "conflict");
  }
  const patch = {
    note:parsed.note,
    waiting_on:parsed.waitingOn,
    blocker_reason:parsed.blockerReason,
    due_date:parsed.dueDate,
    owner:parsed.owner,
    title:parsed.title,
    priority:parsed.priority,
    days:parsed.days,
    ...(parsed.action === "done" ? { completion_note:parsed.note || "Completed from the task panel." } : {})
  };
  const now = options.now || new Date().toISOString();
  const result = updateTaskInState(state, taskId, parsed.action, patch, {
    now,
    actor:actorLabel(actor)
  });

  // Founder OS Release 2: Today is projected from queueItems, so completing the task from the
  // panel must also close the queue item that points at it — otherwise the work is done but the
  // item stays in Today. Opt-in (FOUNDER_OS_TODAY only); with the flag off nothing changes.
  let nextState = result.state;
  const queueItemsCompleted = [];
  if (options.completeQueueItems === true && parsed.action === "done") {
    for (const item of list(nextState.queueItems)) {
      if (clean(item?.sourceRef?.collection) !== "tasks" || clean(item?.sourceRef?.itemId) !== clean(taskId)) continue;
      const transitioned = transitionQueueItem(nextState, {
        id:clean(item.id),
        status:"completed",
        actor:clean(actor.id || actor.role) || "owner",
        note:"Completed from the Today action panel.",
        now:() => now
      });
      if (!transitioned.ok) continue;
      nextState = transitioned.state;
      queueItemsCompleted.push(clean(item.id));
    }
  }

  const collections = Object.fromEntries(["tasks", "auditHistory", "activityEvents", "queueItems", "companyEvents", "approvals"]
    .filter((name) => nextState[name] !== state[name])
    .map((name) => [name, nextState[name]]));
  const messages = Object.freeze({
    done:"Task marked done.",
    in_progress:"Task marked in progress.",
    waiting:"Task marked waiting.",
    blocked:"Task marked blocked.",
    snooze:"Task snoozed.",
    update_due_date:"Due date changed.",
    update_priority:"Priority changed.",
    add_note:"Note added.",
    reopen:"Task reopened."
  });
  return {
    state:nextState,
    collections,
    body:{
      ...buildTaskWorkbenchView(nextState, actor, taskId),
      outcome:"applied",
      queueItemsCompleted,
      message:messages[parsed.action] || "Task updated."
    }
  };
}

export function taskWorkbenchSafeError(error = {}) {
  const status = [400, 401, 403, 404, 409, 413].includes(Number(error?.status)) ? Number(error.status) : 500;
  const known = error instanceof TaskWorkbenchError;
  return Object.freeze({
    status,
    body:Object.freeze({
      ok:false,
      outcome:known ? error.outcome : "temporary_failure",
      ...(known && error.field ? { field:error.field } : {}),
      message:known ? error.message : "The task could not be updated. No changes were made."
    })
  });
}
