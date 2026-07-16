import { WORKFLOW_STATUSES } from "../labels.mjs";
import { collectInboxCandidates } from "./inbox-sources.mjs";

const PRIORITY_RANK = Object.freeze({ urgent: 0, high: 1, normal: 2, low: 3 });

export const INBOX_GROUP_CONTRACT = Object.freeze([
  Object.freeze({ key: "needsMe", value: "needs_me", label: WORKFLOW_STATUSES.inbox[0] }),
  Object.freeze({ key: "waiting", value: "waiting", label: WORKFLOW_STATUSES.inbox[1] }),
  Object.freeze({ key: "updates", value: "update", label: WORKFLOW_STATUSES.inbox[2] })
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function dateAscending(left = "", right = "") {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);
  if (leftValid !== rightValid) return leftValid ? -1 : 1;
  if (!leftValid) return 0;
  return leftTime - rightTime;
}

function dateDescending(left = "", right = "") {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);
  if (leftValid !== rightValid) return leftValid ? -1 : 1;
  if (!leftValid) return 0;
  return rightTime - leftTime;
}

function stableText(left = "", right = "") {
  return String(left).localeCompare(String(right), "en-US", { sensitivity: "base" });
}

function stableCandidateIdentity(left, right) {
  return stableText(left.sourceKind, right.sourceKind)
    || stableText(left.sourceId, right.sourceId)
    || stableText(left.title, right.title)
    || stableText(left.dedupeKey, right.dedupeKey);
}

function chooseDeduplicated(candidates = []) {
  const ordered = [...candidates].sort((left, right) =>
    Number(right.precedence || 0) - Number(left.precedence || 0)
    || stableCandidateIdentity(left, right)
  );
  const chosen = new Map();
  for (const item of ordered) {
    if (!chosen.has(item.dedupeKey)) chosen.set(item.dedupeKey, item);
  }
  return [...chosen.values()];
}

function compareNeedsMe(left, right) {
  return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    || dateAscending(left.dueAt, right.dueAt)
    || dateDescending(left.updatedAt, right.updatedAt)
    || stableText(left.title, right.title)
    || stableText(left.id, right.id);
}

function compareWaiting(left, right) {
  return dateAscending(left.dueAt, right.dueAt)
    || PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    || dateDescending(left.updatedAt, right.updatedAt)
    || stableText(left.title, right.title)
    || stableText(left.id, right.id);
}

function compareUpdates(left, right) {
  return dateDescending(left.updatedAt, right.updatedAt)
    || PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    || stableText(left.title, right.title)
    || stableText(left.id, right.id);
}

function publicItem(candidate) {
  const stableIdentity = encodeURIComponent(candidate.dedupeKey);
  return {
    id: `inbox:${candidate.workKind}:${stableIdentity}`,
    dedupeKey: candidate.dedupeKey,
    sourceKind: candidate.sourceKind,
    sourceId: candidate.sourceId,
    workKind: candidate.workKind,
    title: candidate.title,
    summary: candidate.summary,
    group: candidate.group,
    priority: candidate.priority,
    dueAt: candidate.dueAt,
    updatedAt: candidate.updatedAt,
    owner: candidate.owner,
    requiresApproval: candidate.requiresApproval,
    href: candidate.href,
    relatedObject: candidate.relatedObject,
    actionIntents: [...candidate.actionIntents]
  };
}

export function buildInboxView(state = {}, actor = {}, now = "") {
  const collected = collectInboxCandidates(state, actor, now);
  const items = chooseDeduplicated(collected.candidates).map(publicItem);
  const needsMe = items.filter((item) => item.group === "needs_me").sort(compareNeedsMe);
  const waiting = items.filter((item) => item.group === "waiting").sort(compareWaiting);
  const updates = items.filter((item) => item.group === "update").sort(compareUpdates);
  const result = {
    generatedAt: collected.nowIso,
    actor: collected.actorContext.valid
      ? { id: collected.actorContext.id, displayName: collected.actorContext.displayName }
      : null,
    groups: {
      needsMe,
      waiting,
      updates
    },
    counts: {
      needsMe: needsMe.length,
      waiting: waiting.length,
      updates: updates.length,
      total: needsMe.length + waiting.length + updates.length
    }
  };
  return deepFreeze(result);
}
