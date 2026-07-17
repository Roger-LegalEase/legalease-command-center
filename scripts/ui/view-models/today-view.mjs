import { buildInboxView } from "./inbox-view.mjs";
import { inboxActorContext, normalizeInboxTimestamp } from "./inbox-sources.mjs";
import { roleHasCapability } from "../../roles.mjs";

const APP_TIME_ZONE = "America/New_York";
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const PRIORITY_RANK = Object.freeze({ urgent: 0, high: 1, normal: 2, low: 3 });
const DUE_RANK = Object.freeze({ overdue: 0, today: 1, upcoming: 2, none: 3 });
const ADVANCED_BUCKETS = new Set(["blocked_live_systems", "rcap_watch", "paused_future"]);
const ADVANCED_ITEM_PATTERN = /(?:app[_ -]?status|diagnostic|telemetry|system[_ -]?health|write[_ -]?health|data[_ -]?integrity|live[_ -]?gate|blocked[_ -]?live[_ -]?system|rcap|audit|self[_ -]?check|webhook[_ -]?health|deployment)/i;
const SOURCE_AVAILABILITY_COLLECTIONS = Object.freeze([
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

const OBJECT_TYPES = Object.freeze({
  social_review: "Post",
  campaign_decision: "Campaign",
  partner_followup: "Partner follow-up",
  task: "Task",
  file_update: "File",
  automation_review: "Suggested change",
  reply_followup: "Follow-up",
  decision: "Decision"
});

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

function stableText(left = "", right = "") {
  return clean(left).localeCompare(clean(right), "en-US", { sensitivity: "base" });
}

function timestamp(value = "") {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function easternParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  if (![year, month, day].every(Number.isFinite)) return null;
  return { year, month, day, weekday: part("weekday") };
}

function easternDateKey(value) {
  const parts = easternParts(value);
  if (!parts) return "";
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function easternWeekStart(nowIso) {
  const parts = easternParts(nowIso);
  if (!parts) return "";
  const weekdayOffset = Object.freeze({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 })[parts.weekday];
  if (!Number.isFinite(weekdayOffset)) return "";
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - weekdayOffset));
  const dateKey = `${calendar.getUTCFullYear()}-${String(calendar.getUTCMonth() + 1).padStart(2, "0")}-${String(calendar.getUTCDate()).padStart(2, "0")}`;
  return normalizeInboxTimestamp(dateKey);
}

function destinationFor(item = {}) {
  const href = clean(item.href);
  if (href.startsWith("#social/")) return "Social";
  if (href.startsWith("#outreach/")) return "Outreach";
  if (href.startsWith("#partners/")) return "Partners";
  if (href.startsWith("#files/")) return "Files";
  if (href.startsWith("#today")) return "Today";
  return "Inbox";
}

function dueState(dueAt, nowIso, suppliedNowKey = "") {
  if (!dueAt || timestamp(dueAt) === null) return "none";
  const dueKey = easternDateKey(dueAt);
  const nowKey = suppliedNowKey || easternDateKey(nowIso);
  if (dueKey && dueKey < nowKey) return "overdue";
  if (dueKey && dueKey === nowKey) return "today";
  return "upcoming";
}

function whyNowFor(item, nowIso, planningRole = "") {
  if (planningRole === "daily-run") return "This is the current Daily Run item.";
  if (planningRole === "first-move") return "This is today’s planned first move.";
  if (item.priority === "urgent") return "This needs urgent attention now.";
  if (item.priority === "high") return "This is high-priority work that needs your attention.";
  const due = dueState(item.dueAt, nowIso);
  if (due === "overdue") return "This is overdue and still needs your attention.";
  if (due === "today") return "This is due today and needs your attention.";
  return "This is ready for your attention.";
}

function toTodayItem(item, nowIso, planningRole = "") {
  return {
    id: item.id,
    dedupeKey: item.dedupeKey,
    objectType: OBJECT_TYPES[item.workKind] || "Work item",
    title: item.title,
    summary: item.summary,
    whyNow: whyNowFor(item, nowIso, planningRole),
    priority: item.priority,
    dueAt: item.dueAt || "",
    updatedAt: item.updatedAt || "",
    owner: item.owner || "",
    href: item.href,
    destination: destinationFor(item),
    sourceKind: item.sourceKind,
    sourceId: item.sourceId
  };
}

function compactReference(item) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    priority: item.priority,
    href: item.href,
    destination: item.destination
  };
}

function compactProgressReference(item) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    updatedAt: item.updatedAt,
    href: item.href,
    destination: item.destination
  };
}

function compareActionable(left, right, planningRanks, dueStates) {
  const leftRank = planningRanks.get(left.dedupeKey) ?? 2;
  const rightRank = planningRanks.get(right.dedupeKey) ?? 2;
  const leftDue = dueStates.get(left.dedupeKey) || "none";
  const rightDue = dueStates.get(right.dedupeKey) || "none";
  const leftTime = timestamp(left.dueAt);
  const rightTime = timestamp(right.dueAt);
  const leftUpdated = timestamp(left.updatedAt);
  const rightUpdated = timestamp(right.updatedAt);
  return leftRank - rightRank
    || PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    || DUE_RANK[leftDue] - DUE_RANK[rightDue]
    || ((leftTime ?? Number.POSITIVE_INFINITY) - (rightTime ?? Number.POSITIVE_INFINITY))
    || ((rightUpdated ?? 0) - (leftUpdated ?? 0))
    || stableText(left.title, right.title)
    || stableText(left.id, right.id);
}

function sessionClearedIds(session, bucketKey) {
  const cleared = new Set();
  for (const entry of list(session.completed_items)) {
    if (!bucketKey || entry?.bucket_key === bucketKey) cleared.add(clean(entry?.item_id));
  }
  for (const entry of list(session.parked_items)) {
    if (!bucketKey || entry?.bucket_key === bucketKey) cleared.add(clean(entry?.item_id));
  }
  for (const entry of list(session.skipped_bucket_keys)) {
    if (typeof entry === "object" && (!bucketKey || entry?.bucket_key === bucketKey)) cleared.add(clean(entry?.item_id || entry?.bucket_key));
  }
  return cleared;
}

function bucketIsSkipped(session, bucketKey) {
  return list(session.completed_bucket_keys).includes(bucketKey)
    || list(session.skipped_bucket_keys).some((entry) => entry === bucketKey || (entry?.bucket_key === bucketKey && !entry?.item_id));
}

function sessionIsCurrent(session, nowIso) {
  if (!session || session.status !== "active") return false;
  const started = timestamp(session.started_at);
  const lastActive = timestamp(session.last_active_at || session.started_at);
  const nowMs = timestamp(nowIso);
  if (started === null || lastActive === null || nowMs === null) return false;
  if (easternDateKey(session.started_at) !== easternDateKey(nowIso)) return false;
  return nowMs >= lastActive && nowMs - lastActive <= EIGHT_HOURS_MS;
}

function currentDailyRunItem(state, nowIso) {
  const sessions = list(state?.dailyRunSessions)
    .filter((session) => sessionIsCurrent(session, nowIso))
    .sort((left, right) => (timestamp(right.started_at) ?? 0) - (timestamp(left.started_at) ?? 0)
      || stableText(left.session_id, right.session_id));
  const session = sessions[0];
  if (!session) return null;
  const buckets = list(session.bucket_snapshot?.buckets);
  const current = buckets.find((bucket) => bucket?.key === session.current_bucket_key)
    || buckets.find((bucket) => !bucketIsSkipped(session, bucket?.key));
  if (!current || bucketIsSkipped(session, current.key) || ADVANCED_BUCKETS.has(current.key)) return null;
  const cleared = sessionClearedIds(session, current.key);
  const item = list(current.items).find((entry) => clean(entry?.id) && !cleared.has(clean(entry.id)));
  if (!item) return null;
  const advancedText = [item.type, item.source, item.route].map(clean).join(" ");
  return ADVANCED_ITEM_PATTERN.test(advancedText) ? null : item;
}

function sourceRecord(state, candidate) {
  return list(state?.[candidate?.sourceKind]).find((record) => clean(record?.id || record?.key || record?.slug) === candidate?.sourceId) || null;
}

function isAdvancedCandidate(state, candidate) {
  const record = sourceRecord(state, candidate);
  if (!record) return false;
  if (record.advanced === true || record.internalOnly === true || record.diagnostic === true || record.systemAdministration === true) return true;
  const classification = [
    record.type,
    record.sourceType,
    record.source,
    record.category,
    record.action_type,
    record.actionType,
    record.sourceEngine
  ].map(clean).join(" ");
  return ADVANCED_ITEM_PATTERN.test(classification);
}

function referenceMatchesCandidate(reference, candidate) {
  const id = clean(reference?.sourceId || reference?.id || reference?.itemId);
  const kind = clean(reference?.sourceKind || reference?.collection || reference?.kind);
  if (!id) return false;
  const relatedId = clean(candidate.relatedObject?.id);
  if (id !== candidate.sourceId && id !== relatedId) return false;
  if (!kind) return true;
  const aliases = new Set([
    candidate.sourceKind,
    candidate.workKind,
    candidate.relatedObject?.objectType,
    candidate.workKind === "social_review" ? "posts" : "",
    candidate.workKind === "campaign_decision" ? "campaigns" : "",
    candidate.workKind === "partner_followup" ? "partners" : "",
    candidate.workKind === "task" ? "tasks" : ""
  ].map((value) => clean(value).toLocaleLowerCase("en-US")).filter(Boolean));
  return aliases.has(kind.toLocaleLowerCase("en-US"));
}

function resolveUniqueReference(reference, candidates) {
  const matches = candidates.filter((candidate) => referenceMatchesCandidate(reference, candidate));
  return matches.length === 1 ? matches[0] : null;
}

function resolveDailyRunCandidate(state, candidates, nowIso) {
  const item = currentDailyRunItem(state, nowIso);
  if (!item) return null;
  return resolveUniqueReference({ sourceId: item.id, sourceKind: item.type }, candidates)
    || resolveUniqueReference({ sourceId: item.id }, candidates);
}

function morningBriefReference(state, nowIso) {
  const dateKey = easternDateKey(nowIso);
  const brief = list(state?.morningBriefs)
    .filter((record) => clean(record?.date) === dateKey)
    .sort((left, right) => (timestamp(right.generated_at || right.generatedAt) ?? 0) - (timestamp(left.generated_at || left.generatedAt) ?? 0)
      || stableText(left.key || left.id, right.key || right.id))[0];
  if (!brief) return null;
  const firstAction = list(brief.top_3_actions)[0] || {};
  const reference = brief.suggested_first_move_source_ref
    || brief.suggestedFirstMoveSourceRef
    || brief.first_move_source_ref
    || firstAction.source_ref
    || firstAction.sourceRef;
  return reference && typeof reference === "object" ? reference : null;
}

function progressSummary(state, updates, nowIso, authorized) {
  const periodStart = easternWeekStart(nowIso);
  const startMs = timestamp(periodStart);
  const endMs = timestamp(nowIso);
  const seen = new Set();
  const meaningful = updates
    .filter((item) => !isAdvancedCandidate(state, item))
    .sort((left, right) => (timestamp(right.updatedAt) ?? 0) - (timestamp(left.updatedAt) ?? 0)
      || stableText(left.sourceKind, right.sourceKind)
      || stableText(left.sourceId, right.sourceId))
    .filter((item) => {
      const updated = timestamp(item.updatedAt);
      const identity = `${item.sourceKind}:${item.sourceId}`;
      if (updated === null || startMs === null || endMs === null || updated < startMs || updated > endMs || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  const items = meaningful.slice(0, 5).map((item) => compactProgressReference(toTodayItem(item, nowIso)));
  return {
    available: authorized && SOURCE_AVAILABILITY_COLLECTIONS.some((collection) => Array.isArray(state?.[collection])),
    periodStart,
    periodEnd: nowIso,
    count: meaningful.length,
    items,
    href: "#inbox?group=updates"
  };
}

export function buildTodayView(state = {}, actor = {}, now = "") {
  const nowIso = normalizeInboxTimestamp(now);
  if (!nowIso) throw new TypeError("Today view requires a valid supplied time.");
  const inbox = buildInboxView(state, actor, nowIso);
  const actorContext = inboxActorContext(actor);
  const authorized = actorContext.valid && roleHasCapability(actorContext.role, "read_internal");
  const needsMeItems = [...inbox.groups.needsMe];
  const candidates = needsMeItems.filter((item) => !isAdvancedCandidate(state, item));
  const planningRanks = new Map();

  const dailyRunCandidate = resolveDailyRunCandidate(state, candidates, nowIso);
  if (dailyRunCandidate) planningRanks.set(dailyRunCandidate.dedupeKey, 0);

  const firstMoveCandidate = resolveUniqueReference(morningBriefReference(state, nowIso), candidates);
  if (firstMoveCandidate && !planningRanks.has(firstMoveCandidate.dedupeKey)) planningRanks.set(firstMoveCandidate.dedupeKey, 1);

  const nowDateKey = easternDateKey(nowIso);
  const dueStates = new Map(candidates.map((item) => [item.dedupeKey, dueState(item.dueAt, nowIso, nowDateKey)]));
  const ordered = candidates.sort((left, right) => compareActionable(left, right, planningRanks, dueStates));
  const selected = ordered.slice(0, 4);
  const roleFor = (item) => planningRanks.get(item.dedupeKey) === 0
    ? "daily-run"
    : planningRanks.get(item.dedupeKey) === 1 ? "first-move" : "";
  const nowItem = selected[0] ? toTodayItem(selected[0], nowIso, roleFor(selected[0])) : null;
  const nextItems = selected.slice(1, 4).map((item) => toTodayItem(item, nowIso, roleFor(item)));
  const represented = new Set(selected.map((item) => item.dedupeKey));
  const needsMeTopItems = ordered
    .filter((item) => !represented.has(item.dedupeKey))
    .slice(0, 3)
    .map((item) => compactReference(toTodayItem(item, nowIso)));

  return deepFreeze({
    generatedAt: nowIso,
    nowItem,
    nextItems,
    needsMeSummary: {
      count: inbox.counts.needsMe,
      urgentCount: needsMeItems.filter((item) => item.priority === "urgent").length,
      highCount: needsMeItems.filter((item) => item.priority === "high").length,
      topItems: needsMeTopItems,
      href: "#inbox?group=needs-me"
    },
    progressSummary: progressSummary(state, inbox.groups.updates, nowIso, authorized)
  });
}
