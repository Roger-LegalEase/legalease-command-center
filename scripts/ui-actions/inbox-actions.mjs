const MUTATION_INTENTS = Object.freeze(["approve", "complete", "snooze"]);

const ACTION_PRESENTATION = Object.freeze({
  approve:Object.freeze({
    intent:"approve",
    label:"Approve",
    tone:"primary",
    confirmation:Object.freeze({
      title:"Approve this item?",
      explanation:"This records your approval. It does not send, publish, launch, or release anything.",
      confirmLabel:"Approve"
    })
  }),
  complete:Object.freeze({
    intent:"complete",
    label:"Complete",
    tone:"primary",
    confirmation:null
  }),
  snooze:Object.freeze({
    intent:"snooze",
    label:"Snooze",
    tone:"quiet",
    confirmation:Object.freeze({
      title:"Snooze this item",
      explanation:"Choose the real date when this item should return to your attention.",
      confirmLabel:"Snooze"
    })
  })
});

export const INBOX_ACTION_ENDPOINT = "/api/ui/inbox/action";
export const INBOX_MUTATION_INTENTS = MUTATION_INTENTS;
export const INBOX_ACTION_PRESENTATION = ACTION_PRESENTATION;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function queueCapability(item = {}) {
  if (item.workKind === "task") return "manage_tasks";
  if (item.workKind === "campaign_decision") return "manage_growth";
  return "manage_approval_queue";
}

function executableIntents(item = {}) {
  const declared = new Set(list(item.actionIntents));
  if (item.group !== "needs_me") return [];
  if (item.sourceKind === "approvals") {
    return declared.has("approve") ? ["approve"] : [];
  }
  if (item.sourceKind === "queueItems") {
    return MUTATION_INTENTS.filter((intent) => declared.has(intent));
  }
  if (item.sourceKind === "tasks") {
    return declared.has("complete") ? ["complete"] : [];
  }
  return [];
}

export function requiredCapabilityForInboxAction(item = {}, intent = "") {
  const requested = String(intent || "");
  if (!MUTATION_INTENTS.includes(requested)) return "";
  if (item.sourceKind === "tasks" && requested === "complete") return "manage_tasks";
  if (item.sourceKind === "queueItems") return queueCapability(item);
  if (item.sourceKind === "approvals" && ["approve", "snooze"].includes(requested)) return "manage_approval_queue";
  return "";
}

export function inboxActionsForProjectionItem(item = {}) {
  return Object.freeze(executableIntents(item).map((intent) => ACTION_PRESENTATION[intent]));
}

export function inboxActionIsExecutable(item = {}, intent = "") {
  return executableIntents(item).includes(String(intent || ""));
}

export const INBOX_ACTION_SOURCE_MATRIX = Object.freeze([
  Object.freeze({ family:"Company decision", sourceKind:"approvals", wired:Object.freeze(["approve"]), deferred:Object.freeze(["snooze"]), operation:"Company queue transition" }),
  Object.freeze({ family:"Company Inbox item", sourceKind:"queueItems", wired:Object.freeze(["approve", "complete", "snooze"]), deferred:Object.freeze([]), operation:"Company queue transition" }),
  Object.freeze({ family:"Task", sourceKind:"tasks", wired:Object.freeze(["complete"]), deferred:Object.freeze(["snooze"]), operation:"Task update" }),
  Object.freeze({ family:"Social review", sourceKind:"posts", wired:Object.freeze([]), deferred:Object.freeze(["approve"]), operation:"Open only" }),
  Object.freeze({ family:"Campaign decision", sourceKind:"campaigns", wired:Object.freeze([]), deferred:Object.freeze(["approve"]), operation:"Open only" }),
  Object.freeze({ family:"Legacy decision", sourceKind:"approvalQueue", wired:Object.freeze([]), deferred:Object.freeze(["approve"]), operation:"Open only" }),
  Object.freeze({ family:"Partner follow-up", sourceKind:"partners", wired:Object.freeze([]), deferred:Object.freeze(["complete"]), operation:"Open only" }),
  Object.freeze({ family:"Suggested change", sourceKind:"automationSuggestions", wired:Object.freeze([]), deferred:Object.freeze(["approve"]), operation:"Open only" }),
  Object.freeze({ family:"Reply follow-up", sourceKind:"inboxSignals", wired:Object.freeze([]), deferred:Object.freeze(["complete"]), operation:"Open only" }),
  Object.freeze({ family:"File or evidence update", sourceKind:"files", wired:Object.freeze([]), deferred:Object.freeze(["complete", "approve"]), operation:"Open only" })
]);
