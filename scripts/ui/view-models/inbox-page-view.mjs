import { INBOX_GROUP_CONTRACT } from "./inbox-view.mjs";

const PRIORITIES = Object.freeze(["urgent", "high", "normal", "low"]);
const GROUP_QUERY = Object.freeze({
  "needs-me":"needsMe",
  waiting:"waiting",
  updates:"updates"
});
const GROUP_ROUTE = Object.freeze({ needsMe:"needs-me", waiting:"waiting", updates:"updates" });
const TYPE_BY_WORK = Object.freeze({
  decision:Object.freeze({ key:"decision", label:"Decision" }),
  social_review:Object.freeze({ key:"social", label:"Social post" }),
  campaign_decision:Object.freeze({ key:"campaign", label:"Outreach campaign" }),
  partner_followup:Object.freeze({ key:"partner", label:"Partner follow-up" }),
  task:Object.freeze({ key:"task", label:"Task" }),
  automation_review:Object.freeze({ key:"suggested-change", label:"Suggested change" }),
  reply_followup:Object.freeze({ key:"reply", label:"Reply follow-up" }),
  file_update:Object.freeze({ key:"file", label:"File update" })
});
const DUE_OPTIONS = Object.freeze([
  Object.freeze({ key:"overdue", label:"Overdue" }),
  Object.freeze({ key:"today", label:"Due today" }),
  Object.freeze({ key:"upcoming", label:"Upcoming" }),
  Object.freeze({ key:"none", label:"No due date" })
]);

export const INBOX_PAGE_ENDPOINT = "/api/ui/inbox";
export const INBOX_PAGE_LIMITS = Object.freeze({ default:30, maximum:40 });
export const INBOX_PAGE_GROUPS = Object.freeze(INBOX_GROUP_CONTRACT.map((group) => Object.freeze({
  key:group.value,
  routeValue:GROUP_ROUTE[group.key],
  label:group.label,
  projectionKey:group.key
})));

function list(value) {
  return Array.isArray(value) ? value : [];
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function safeChoice(value = "", maximum = 120) {
  const text = clean(value);
  return text && text.length <= maximum && !/[\u0000-\u001f\u007f<>"'`\\]/u.test(text) ? text : "";
}

function queryChoice(value = "", maximum = 120) {
  const original = clean(value);
  const safe = safeChoice(original, maximum);
  if (original && !safe) throw Object.assign(new TypeError("Invalid Inbox filter."), { status:400 });
  return safe;
}

function positiveLimit(value) {
  if (value === undefined || value === null || value === "") return INBOX_PAGE_LIMITS.default;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw Object.assign(new TypeError("Invalid Inbox page size."), { status:400 });
  return Math.min(parsed, INBOX_PAGE_LIMITS.maximum);
}

function cursorOffset(value = "") {
  if (!value) return 0;
  const match = clean(value).match(/^inbox-(\d{1,8})$/);
  if (!match) throw Object.assign(new TypeError("Invalid Inbox cursor."), { status:400 });
  return Number(match[1]);
}

function easternDateKey(timestamp = "") {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:"America/New_York",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(new Date(parsed));
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dueStateForInboxItem(item = {}, generatedAt = "") {
  if (!item.dueAt || !Number.isFinite(Date.parse(item.dueAt))) return "none";
  const dueDate = easternDateKey(item.dueAt);
  const today = easternDateKey(generatedAt);
  if (!dueDate || !today) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}

function publicType(item = {}) {
  return TYPE_BY_WORK[item.workKind] || null;
}

function compactItem(item, generatedAt) {
  const type = publicType(item);
  if (!type) return null;
  const availableInSource = item.actionIntents.includes("approve")
    ? "Approval is available in the source record."
    : item.actionIntents.includes("complete")
      ? "This can be completed from the source record."
      : "";
  return {
    id:item.id,
    type,
    priority:item.priority,
    title:item.title,
    summary:item.summary,
    group:item.group,
    dueAt:item.dueAt,
    dueState:dueStateForInboxItem(item, generatedAt),
    updatedAt:item.updatedAt,
    owner:item.owner,
    requiresApproval:item.requiresApproval,
    href:item.href,
    relatedObject:item.relatedObject,
    availableInSource
  };
}

function allProjectionItems(view = {}) {
  return INBOX_PAGE_GROUPS.flatMap((group) => list(view.groups?.[group.projectionKey]));
}

function sortedOptions(values, labels = {}) {
  return [...new Set(values.filter(Boolean))]
    .sort((left, right) => (labels[left] || left).localeCompare(labels[right] || right, "en-US", { sensitivity:"base" }))
    .map((key) => Object.freeze({ key, label:labels[key] || key }));
}

function groupFromQuery(value = "") {
  const normalized = queryChoice(value || "needs-me", 24);
  const projectionKey = GROUP_QUERY[normalized];
  if (!projectionKey) throw Object.assign(new TypeError("Invalid Inbox group."), { status:400 });
  return INBOX_PAGE_GROUPS.find((group) => group.projectionKey === projectionKey);
}

export function normalizeInboxPageQuery(query = {}) {
  const group = groupFromQuery(query.group);
  const type = queryChoice(query.type, 40);
  const priority = queryChoice(query.priority, 16).toLowerCase();
  const owner = queryChoice(query.owner, 120);
  const due = queryChoice(query.due, 20).toLowerCase();
  if (priority && !PRIORITIES.includes(priority)) throw Object.assign(new TypeError("Invalid Inbox priority."), { status:400 });
  if (due && !DUE_OPTIONS.some((option) => option.key === due)) throw Object.assign(new TypeError("Invalid Inbox due state."), { status:400 });
  return deepFreeze({
    group,
    type,
    priority,
    owner,
    due,
    limit:positiveLimit(query.limit),
    offset:cursorOffset(query.cursor)
  });
}

export function buildInboxPageView(inboxView = {}, query = {}) {
  const normalized = normalizeInboxPageQuery(query);
  const authorizedItems = allProjectionItems(inboxView).map((item) => compactItem(item, inboxView.generatedAt)).filter(Boolean);
  const typeLabels = Object.fromEntries(Object.values(TYPE_BY_WORK).map((type) => [type.key, type.label]));
  const typeOptions = sortedOptions(authorizedItems.map((item) => item.type.key), typeLabels);
  const priorityOptions = PRIORITIES.filter((priority) => authorizedItems.some((item) => item.priority === priority))
    .map((priority) => Object.freeze({ key:priority, label:priority[0].toUpperCase() + priority.slice(1) }));
  const ownerOptions = sortedOptions(authorizedItems.map((item) => item.owner || "unassigned"), { unassigned:"Unassigned" });
  const dueOptions = DUE_OPTIONS.filter((option) => authorizedItems.some((item) => item.dueState === option.key));
  const selectedItems = authorizedItems.filter((item) => item.group === normalized.group.key);
  const filtered = selectedItems.filter((item) => {
    if (normalized.type && item.type.key !== normalized.type) return false;
    if (normalized.priority && item.priority !== normalized.priority) return false;
    if (normalized.owner && (item.owner || "unassigned") !== normalized.owner) return false;
    if (normalized.due && item.dueState !== normalized.due) return false;
    return true;
  });
  const offset = Math.min(normalized.offset, filtered.length);
  const items = filtered.slice(offset, offset + normalized.limit);
  const nextOffset = offset + items.length;
  const truncated = nextOffset < filtered.length;
  const counts = {
    needsMe:Number(inboxView.counts?.needsMe || 0),
    waiting:Number(inboxView.counts?.waiting || 0),
    updates:Number(inboxView.counts?.updates || 0),
    total:Number(inboxView.counts?.total || 0)
  };
  return deepFreeze({
    ok:true,
    generatedAt:inboxView.generatedAt || "",
    selectedGroup:normalized.group.key,
    selectedGroupRoute:normalized.group.routeValue,
    groups:INBOX_PAGE_GROUPS.map((group) => ({
      key:group.key,
      routeValue:group.routeValue,
      label:group.label,
      count:counts[group.projectionKey]
    })),
    counts,
    filteredCount:filtered.length,
    filters:{
      types:typeOptions,
      priorities:priorityOptions,
      owners:ownerOptions,
      dueStates:dueOptions
    },
    activeFilters:{
      type:normalized.type,
      priority:normalized.priority,
      owner:normalized.owner,
      due:normalized.due
    },
    items,
    nextCursor:truncated ? `inbox-${nextOffset}` : null,
    truncated
  });
}

export const INBOX_PAGE_TYPE_CONTRACT = TYPE_BY_WORK;
export const INBOX_PAGE_DUE_CONTRACT = DUE_OPTIONS;
