// Founder OS Today projection — Release 2 of docs/founder-os/08_DELIVERY_PLAN.md.
//
// This is a projection, not an engine. It reads the collections the inbox view already reads,
// applies the ranking rules written in docs/founder-os/workspaces/today.md, and sorts the result
// into the charter's five sections. It writes nothing, calls nothing external, and adds no new
// data source: every item it returns is an item some existing surface already showed.
//
// The one rule that governs everything here: an item appears in Today only when it needs Roger
// TODAY — due or overdue, waiting on him, starting today, or in an exception state. Anything
// else stays in its own workspace. Chronic clutter is a ranking bug, not a fact of life.

import { buildInboxView } from "./inbox-view.mjs";
import { inboxActorContext, normalizeInboxTimestamp } from "./inbox-sources.mjs";
import { isAdvancedCandidate, OBJECT_TYPES } from "./today-view.mjs";
import { roleHasCapability } from "../../roles.mjs";

const APP_TIME_ZONE = "America/New_York";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// today.md "Ranking rules", in order. Tier 1 wins over every tier below it, always.
export const FOUNDER_TODAY_RANK_TIERS = Object.freeze([
  Object.freeze({ tier: 1, id: "hard_blocker", label: "Hard blocker" }),
  Object.freeze({ tier: 2, id: "external_commitment", label: "External commitment" }),
  Object.freeze({ tier: 3, id: "waiting_on_me", label: "Waiting on me" }),
  Object.freeze({ tier: 4, id: "follow_up_due", label: "Follow-up due" }),
  Object.freeze({ tier: 5, id: "approval", label: "Needs your judgment" }),
  Object.freeze({ tier: 6, id: "scheduled", label: "Due today" })
]);

// Priority is Roger's declared importance: stable, changes only when he changes it.
export const FOUNDER_TODAY_PRIORITY_SCORES = Object.freeze({ urgent: 3, high: 2, normal: 1, low: 0 });

// Urgency is derived from time and changes hour to hour. The two are reported separately so a
// high-priority non-urgent item is visibly different from a low-priority urgent one.
export const FOUNDER_TODAY_URGENCY_SCORES = Object.freeze({
  blocking: 5,
  overdue: 4,
  imminent: 3,
  today: 2,
  aging: 1,
  none: 0
});

// A waiting or blocked item that has not moved in this long stops waiting silently and
// resurfaces in Needs attention (today.md, "How waiting and blocked resurface").
export const FOUNDER_TODAY_STALE_DAYS = 14;

// A meeting is "starting soon" — and so becomes preparation work — inside this window.
export const FOUNDER_TODAY_MEETING_SOON_MS = 2 * HOUR_MS;

export const FOUNDER_TODAY_READ_COLLECTIONS = Object.freeze([
  "alerts",
  "meetingBriefs",
  "queueItems",
  "inboxSignals",
  "supportIssues",
  "tasks",
  "partners"
]);

// Communications: messages and follow-ups that need a response. These are the lanes the
// communication composer already knows how to draft against.
const COMMUNICATION_SOURCES = Object.freeze(new Set(["inboxSignals", "supportIssues", "growthInbox", "outreachReplies"]));
const COMMUNICATION_WORK_KINDS = Object.freeze(new Set(["reply_followup", "partner_followup"]));

// The composer's source-kind vocabulary (communication-composer-service.mjs
// COMMUNICATION_SOURCE_KINDS). Only these lanes can open a draft; everything else opens the
// task panel or its own record.
const COMPOSER_SOURCE_KINDS = Object.freeze({
  inboxSignals: "inbox_signal",
  supportIssues: "support_issue",
  outreachReplies: "outreach_reply",
  partners: "partner",
  tasks: "task"
});

// Plain-language names for the lanes whose work-kind label is too generic to be useful in a
// queue Roger reads in five minutes.
const SOURCE_OBJECT_TYPES = Object.freeze({
  inboxSignals: "Email",
  supportIssues: "Support request",
  outreachReplies: "Campaign reply",
  growthInbox: "Captured signal",
  tasks: "Task",
  partners: "Relationship"
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLocaleLowerCase("en-US");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function timestamp(value = "") {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableText(left = "", right = "") {
  return clean(left).localeCompare(clean(right), "en-US", { sensitivity: "base" });
}

function easternDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function dueState(dueAt, nowKey) {
  if (!dueAt || timestamp(dueAt) === null) return "none";
  const key = easternDateKey(dueAt);
  if (!key) return "none";
  if (key < nowKey) return "overdue";
  if (key === nowKey) return "today";
  return "upcoming";
}

function ageDays(value, nowMs) {
  const at = timestamp(value);
  return at === null ? 0 : Math.max(0, Math.floor((nowMs - at) / DAY_MS));
}

function recordIndex(state, collection) {
  const index = new Map();
  for (const record of list(state?.[collection])) {
    const id = clean(record?.id || record?.key || record?.slug);
    if (id && !index.has(id)) index.set(id, record);
  }
  return index;
}

// ---------------------------------------------------------------------------------------------
// Classification — which ranking tier an item belongs in, and which section it is typed as.
// ---------------------------------------------------------------------------------------------

function isCampaignSafetyTrip(candidate, record) {
  if (candidate.workKind !== "campaign_decision") return false;
  const text = [record?.status, record?.state, record?.blockedReason, record?.pauseReason, candidate.title, candidate.summary]
    .map(clean).join(" ");
  return /paused|halted|stopped for safety|threshold|bounce|complaint|spam|safety trip/i.test(text);
}

// Deliberately structured signals only. Matching free text in a title would let an ordinary
// question phrased dramatically outrank a real incident, and would make the top of Roger's
// queue depend on someone's wording.
function isCustomerIncident(candidate, record) {
  if (candidate.sourceKind !== "supportIssues") return false;
  return record?.upl_sensitive === true
    || lower(record?.urgency) === "urgent"
    || lower(record?.severity) === "critical";
}

function isCommitment(candidate, record) {
  return candidate.sourceKind === "inboxSignals" && lower(record?.kind) === "commitment";
}

function isWaitingOnMe(candidate, record) {
  if (candidate.sourceKind === "inboxSignals") {
    return ["needs_reply", "pipeline_inbound", "went_quiet"].includes(lower(record?.kind));
  }
  if (candidate.sourceKind === "supportIssues") return ["open", "drafted"].includes(lower(record?.status));
  if (candidate.sourceKind === "outreachReplies") return true;
  return false;
}

function inboundAt(candidate, record) {
  return normalizeInboxTimestamp(
    record?.lastInboundAt
      || record?.last_inbound_at
      || record?.receivedAt
      || record?.occurredAt
      || record?.created_at
      || record?.createdAt
      || candidate.updatedAt
      || ""
  );
}

function classify(candidate, record, context) {
  const { nowKey, nowMs } = context;
  const due = dueState(candidate.dueAt, nowKey);

  // Rule 1 — hard blockers: platform incidents affecting customers, campaign safety trips.
  if (isCampaignSafetyTrip(candidate, record) || isCustomerIncident(candidate, record)) {
    return { tier: 1, urgency: "blocking", section: "needsAttention", qualifies: true };
  }

  // Rule 2 — external-commitment deadlines due today or overdue.
  if (isCommitment(candidate, record) && ["overdue", "today"].includes(due)) {
    return { tier: 2, urgency: due === "overdue" ? "overdue" : "today", section: "communications", qualifies: true };
  }

  // Rule 3 — waiting-on-me communications, oldest inbound first.
  if (isWaitingOnMe(candidate, record)) {
    const age = ageDays(inboundAt(candidate, record), nowMs);
    return {
      tier: 3,
      urgency: due === "overdue" ? "overdue" : due === "today" ? "today" : age >= 3 ? "aging" : "none",
      section: "communications",
      qualifies: true,
      inboundAgeDays: age
    };
  }

  // Rule 4 — follow-ups due today (relationship next-touch dates).
  if (candidate.workKind === "partner_followup" && ["overdue", "today"].includes(due)) {
    return { tier: 4, urgency: due === "overdue" ? "overdue" : "today", section: "communications", qualifies: true };
  }

  // Rule 5 — approvals requiring judgment.
  if (candidate.requiresApproval || candidate.workKind === "automation_review") {
    return {
      tier: 5,
      urgency: due === "overdue" ? "overdue" : due === "today" ? "today" : "none",
      section: candidate.workKind === "automation_review" ? "needsAttention" : "work",
      qualifies: true
    };
  }

  // Rule 6 — everything else by due date, then declared priority. Only work that is actually
  // due qualifies for Today; anything else stays in its own workspace.
  return {
    tier: 6,
    urgency: due === "overdue" ? "overdue" : due === "today" ? "today" : "none",
    section: COMMUNICATION_SOURCES.has(candidate.sourceKind) || COMMUNICATION_WORK_KINDS.has(candidate.workKind)
      ? "communications"
      : "work",
    qualifies: ["overdue", "today"].includes(due)
  };
}

// ---------------------------------------------------------------------------------------------
// Item shape — one shape for every kind of item, because one panel opens all of them.
// ---------------------------------------------------------------------------------------------

function panelFor(candidate) {
  // Tasks open the task workbench, which is the universal action panel. Communication lanes the
  // composer understands open the composer. Everything else opens its own record.
  if (candidate.sourceKind === "tasks") {
    return { kind: "task", taskId: candidate.sourceId, composeSourceKind: "", composeSourceId: "", actionLabel: "Open" };
  }
  const composeKind = COMPOSER_SOURCE_KINDS[candidate.sourceKind] || "";
  if (composeKind) {
    return { kind: "communication", taskId: "", composeSourceKind: composeKind, composeSourceId: candidate.sourceId, actionLabel: "Draft reply" };
  }
  return { kind: "record", taskId: "", composeSourceKind: "", composeSourceId: "", actionLabel: "Open" };
}

function priorityScore(priority) {
  return FOUNDER_TODAY_PRIORITY_SCORES[lower(priority)] ?? 1;
}

function urgencyScore(urgency) {
  return FOUNDER_TODAY_URGENCY_SCORES[urgency] ?? 0;
}

// today.md: "Ranking multiplies them." Both stay visible so the two are never confused.
function rankScore(urgency, priority) {
  return (urgencyScore(urgency) + 1) * (priorityScore(priority) + 1);
}

function whyNow(tierId, urgency, item) {
  if (tierId === "hard_blocker") return "This is blocking customers or a campaign and comes before everything else.";
  if (tierId === "external_commitment") {
    return urgency === "overdue" ? "You committed to this and the date has passed." : "You committed to this for today.";
  }
  if (tierId === "waiting_on_me") {
    return item.inboundAgeDays >= 1
      ? `Someone has been waiting ${item.inboundAgeDays} day${item.inboundAgeDays === 1 ? "" : "s"} for your reply.`
      : "Someone is waiting on your reply.";
  }
  if (tierId === "follow_up_due") return urgency === "overdue" ? "This follow-up is past its next-touch date." : "This follow-up is due today.";
  if (tierId === "approval") return "This needs your judgment before anything moves.";
  return urgency === "overdue" ? "This is overdue." : "This is due today.";
}

function toItem(candidate, classification, context) {
  const tier = FOUNDER_TODAY_RANK_TIERS.find((entry) => entry.tier === classification.tier);
  const panel = panelFor(candidate);
  const enriched = { ...classification, inboundAgeDays: classification.inboundAgeDays || 0 };
  return {
    id: candidate.dedupeKey,
    sourceKind: candidate.sourceKind,
    sourceId: candidate.sourceId,
    objectType: SOURCE_OBJECT_TYPES[candidate.sourceKind] || OBJECT_TYPES[candidate.workKind] || "Work item",
    title: clean(candidate.title),
    summary: clean(candidate.summary),
    whyNow: whyNow(tier.id, classification.urgency, enriched),
    rankTier: tier.tier,
    rankReason: tier.label,
    priority: lower(candidate.priority) || "normal",
    priorityScore: priorityScore(candidate.priority),
    urgency: classification.urgency,
    urgencyScore: urgencyScore(classification.urgency),
    rankScore: rankScore(classification.urgency, candidate.priority),
    dueAt: candidate.dueAt || "",
    updatedAt: candidate.updatedAt || "",
    inboundAgeDays: enriched.inboundAgeDays,
    owner: clean(candidate.owner),
    href: candidate.href,
    section: classification.section,
    panelKind: panel.kind,
    taskId: panel.taskId,
    composeSourceKind: panel.composeSourceKind,
    composeSourceId: panel.composeSourceId,
    actionLabel: panel.actionLabel,
    queueItemId: context.queueItemIdFor(candidate)
  };
}

function compareRanked(left, right) {
  return left.rankTier - right.rankTier
    || right.rankScore - left.rankScore
    // Waiting-on-me is explicitly "oldest inbound first".
    || (left.rankTier === 3 ? right.inboundAgeDays - left.inboundAgeDays : 0)
    || ((timestamp(left.dueAt) ?? Number.POSITIVE_INFINITY) - (timestamp(right.dueAt) ?? Number.POSITIVE_INFINITY))
    || right.priorityScore - left.priorityScore
    || stableText(left.title, right.title)
    || stableText(left.id, right.id);
}

// ---------------------------------------------------------------------------------------------
// Non-candidate sections: meetings, automation exceptions, and silent waiting.
// ---------------------------------------------------------------------------------------------

function meetingItems(state, context) {
  const { nowKey, nowMs } = context;
  return list(state?.meetingBriefs)
    .map((brief) => {
      const startAt = normalizeInboxTimestamp(brief?.start_at || brief?.startAt || "");
      const startMs = timestamp(startAt);
      if (startMs === null || easternDateKey(startAt) !== nowKey) return null;
      const soon = startMs - nowMs <= FOUNDER_TODAY_MEETING_SOON_MS && startMs >= nowMs - HOUR_MS;
      const attendees = list(brief.known_attendees).length;
      const prepared = list(brief.talking_points).length > 0;
      return {
        id: `meeting:${clean(brief.event_id || brief.id)}`,
        sourceKind: "meetingBriefs",
        sourceId: clean(brief.event_id || brief.id),
        objectType: "Meeting",
        title: clean(brief.title) || "Untitled meeting",
        summary: prepared
          ? `${attendees} known attendee${attendees === 1 ? "" : "s"}. Preparation notes are ready.`
          : "No preparation notes yet.",
        whyNow: soon ? "This meeting starts within the next two hours." : "This meeting is on today's agenda.",
        rankTier: soon ? 2 : 6,
        rankReason: soon ? "Meeting starting soon" : "Today's agenda",
        priority: "normal",
        priorityScore: 1,
        urgency: soon ? "imminent" : "today",
        urgencyScore: urgencyScore(soon ? "imminent" : "today"),
        rankScore: rankScore(soon ? "imminent" : "today", "normal"),
        dueAt: startAt,
        updatedAt: normalizeInboxTimestamp(brief.updated_at || brief.generated_at || ""),
        inboundAgeDays: 0,
        owner: "Roger",
        href: "#meetings",
        section: "meetings",
        panelKind: "record",
        taskId: "",
        composeSourceKind: "",
        composeSourceId: "",
        actionLabel: "Open brief",
        queueItemId: ""
      };
    })
    .filter(Boolean)
    .sort((left, right) => (timestamp(left.dueAt) ?? 0) - (timestamp(right.dueAt) ?? 0) || stableText(left.title, right.title));
}

// Automation never shows its internals here. An exception is a plain-language item: what
// stopped, why, and the one action available.
function automationExceptionItems(state, context) {
  return list(state?.alerts)
    .filter((alert) => ["active", "read"].includes(lower(alert?.status)))
    .filter((alert) => ["critical", "warning"].includes(lower(alert?.severity)))
    .filter((alert) => ["safety", "queue", "support"].includes(lower(alert?.source_group)))
    .map((alert) => {
      const critical = lower(alert.severity) === "critical";
      return {
        id: `alert:${clean(alert.id)}`,
        sourceKind: "alerts",
        sourceId: clean(alert.id),
        objectType: "Automation exception",
        title: clean(alert.title) || "Automation stopped",
        summary: clean(alert.detail) || "Automation stopped and is waiting for a decision.",
        whyNow: critical
          ? "Automation stopped for safety and nothing will resume until you decide."
          : "Automation flagged a condition that needs your review.",
        rankTier: critical ? 1 : 6,
        rankReason: critical ? "Hard blocker" : "Automation exception",
        priority: critical ? "urgent" : "high",
        priorityScore: priorityScore(critical ? "urgent" : "high"),
        urgency: critical ? "blocking" : "today",
        urgencyScore: urgencyScore(critical ? "blocking" : "today"),
        rankScore: rankScore(critical ? "blocking" : "today", critical ? "urgent" : "high"),
        dueAt: "",
        updatedAt: normalizeInboxTimestamp(alert.last_seen_at || alert.created_at || ""),
        inboundAgeDays: 0,
        owner: "Roger",
        href: "",
        section: "needsAttention",
        panelKind: "record",
        taskId: "",
        composeSourceKind: "",
        composeSourceId: "",
        actionLabel: "Review",
        queueItemId: ""
      };
    })
    .sort(compareRanked)
    .slice(0, 10);
}

// Nothing waits silently forever: any waiting or blocked item with no movement for 14 days
// resurfaces in Needs attention.
function silentlyWaitingItems(state, context) {
  const { nowMs } = context;
  const stale = [];
  for (const item of list(state?.queueItems)) {
    if (lower(item?.status) !== "blocked") continue;
    const days = ageDays(item.updatedAt || item.createdAt, nowMs);
    if (days < FOUNDER_TODAY_STALE_DAYS) continue;
    stale.push({ id: `stale:queue:${clean(item.id)}`, sourceKind: "queueItems", sourceId: clean(item.id), title: clean(item.title) || "Blocked item", days, taskId: "" });
  }
  for (const task of list(state?.tasks)) {
    if (!["waiting", "blocked"].includes(lower(task?.status))) continue;
    const days = ageDays(task.updatedAt || task.updated_at || task.createdAt || task.created_at, nowMs);
    if (days < FOUNDER_TODAY_STALE_DAYS) continue;
    stale.push({ id: `stale:task:${clean(task.id)}`, sourceKind: "tasks", sourceId: clean(task.id), title: clean(task.title) || "Waiting task", days, taskId: clean(task.id) });
  }
  return stale
    .map((entry) => ({
      id: entry.id,
      sourceKind: entry.sourceKind,
      sourceId: entry.sourceId,
      objectType: "Stalled work",
      title: entry.title,
      summary: `No movement for ${entry.days} days.`,
      whyNow: "This has been waiting long enough that it needs a decision rather than more waiting.",
      rankTier: 6,
      rankReason: "Waiting with no movement",
      priority: "normal",
      priorityScore: 1,
      urgency: "aging",
      urgencyScore: urgencyScore("aging"),
      rankScore: rankScore("aging", "normal"),
      dueAt: "",
      updatedAt: "",
      inboundAgeDays: entry.days,
      owner: "Roger",
      href: "",
      section: "needsAttention",
      panelKind: entry.taskId ? "task" : "record",
      taskId: entry.taskId,
      composeSourceKind: "",
      composeSourceId: "",
      actionLabel: entry.taskId ? "Open" : "Review",
      queueItemId: entry.sourceKind === "queueItems" ? entry.sourceId : ""
    }))
    .sort((left, right) => right.inboundAgeDays - left.inboundAgeDays || stableText(left.title, right.title))
    .slice(0, 6);
}

// ---------------------------------------------------------------------------------------------
// The projection.
// ---------------------------------------------------------------------------------------------

export function buildFounderTodayView(state = {}, actor = {}, now = "") {
  const nowIso = normalizeInboxTimestamp(now);
  if (!nowIso) throw new TypeError("Founder Today view requires a valid supplied time.");
  const nowMs = timestamp(nowIso);
  const nowKey = easternDateKey(nowIso);
  const actorContext = inboxActorContext(actor);
  const authorized = actorContext.valid && roleHasCapability(actorContext.role, "read_internal");

  const inbox = buildInboxView(state, actor, nowIso);
  const indexes = new Map(["inboxSignals", "supportIssues", "growthInbox", "outreachReplies", "campaigns", "partners", "tasks"]
    .map((collection) => [collection, recordIndex(state, collection)]));

  // Queue items are the data spine: the item that leaves Today is the queue item that turns
  // terminal. Index them by the domain record they point at so completion can find them.
  const queueBySource = new Map();
  for (const item of list(state?.queueItems)) {
    const reference = item?.sourceRef;
    const key = `${clean(reference?.collection)}:${clean(reference?.itemId)}`;
    if (clean(reference?.collection) && clean(reference?.itemId) && !queueBySource.has(key)) queueBySource.set(key, clean(item.id));
  }

  const context = {
    nowIso,
    nowMs,
    nowKey,
    queueItemIdFor: (candidate) => queueBySource.get(`${candidate.sourceKind}:${candidate.sourceId}`) || ""
  };

  const ranked = [];
  for (const candidate of list(inbox.groups?.needsMe)) {
    if (isAdvancedCandidate(state, candidate)) continue;
    const record = indexes.get(candidate.sourceKind)?.get(candidate.sourceId) || null;
    const classification = classify(candidate, record, context);
    if (!classification.qualifies) continue;
    ranked.push(toItem(candidate, classification, context));
  }

  // Meetings, automation exceptions and stalled work are read straight from their collections
  // rather than through the inbox candidate pipeline, so their access check is made here. An
  // account without internal read access sees none of it.
  const exceptions = authorized ? automationExceptionItems(state, context) : [];
  const stalled = authorized ? silentlyWaitingItems(state, context) : [];
  const meetings = authorized ? meetingItems(state, context) : [];

  // Meetings starting soon are ranking rule 2 and compete for Now; everything else in the
  // Meetings section stays in the Meetings section.
  const meetingPrep = meetings.filter((item) => item.rankTier === 2);
  const ordered = [...ranked, ...exceptions.filter((item) => item.rankTier === 1), ...meetingPrep].sort(compareRanked);

  const nowItem = ordered[0] || null;
  const nextItems = ordered.slice(1, 6);
  const promoted = new Set([nowItem?.id, ...nextItems.map((item) => item.id)].filter(Boolean));

  // A typed section never repeats an item already shown in Now or Next — the same work must not
  // appear twice in one queue. It still reports the whole lane's size, so "Needs attention" can
  // never read as empty while its only item is sitting in Now.
  //
  // Meetings is the deliberate exception: it is today's agenda, and an agenda that dropped the
  // next meeting because it had been promoted into Now would be lying about the day.
  const communicationsLane = ordered.filter((item) => item.section === "communications");
  const needsAttentionLane = [...exceptions, ...stalled, ...ranked.filter((item) => item.section === "needsAttention")]
    .filter((item, index, all) => all.findIndex((entry) => entry.id === item.id) === index)
    .sort(compareRanked);
  const communications = communicationsLane.filter((item) => !promoted.has(item.id)).slice(0, 6);
  const needsAttention = needsAttentionLane.filter((item) => !promoted.has(item.id)).slice(0, 6);

  // Today is capped on purpose — it answers "what needs me right now", not "everything open".
  // But nothing may vanish silently: whatever qualified today and did not fit anywhere is
  // counted, so the queue can say so out loud instead of looking shorter than it is.
  const shown = new Set([
    ...promoted,
    ...communications.map((item) => item.id),
    ...needsAttention.map((item) => item.id),
    ...meetings.map((item) => item.id)
  ]);
  const overflow = [...ordered, ...needsAttentionLane].filter((item, index, all) =>
    !shown.has(item.id) && all.findIndex((entry) => entry.id === item.id) === index).length;

  return deepFreeze({
    generatedAt: nowIso,
    authorized,
    sections: {
      now: nowItem ? [nowItem] : [],
      next: nextItems,
      communications,
      meetings,
      needsAttention
    },
    counts: {
      now: nowItem ? 1 : 0,
      next: nextItems.length,
      communications: communications.length,
      meetings: meetings.length,
      needsAttention: needsAttention.length,
      ranked: ordered.length,
      overflow
    },
    // The whole lane, including items promoted into Now or Next.
    totals: {
      communications: communicationsLane.length,
      meetings: meetings.length,
      needsAttention: needsAttentionLane.length
    }
  });
}
