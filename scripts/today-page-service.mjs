import { roleHasCapability } from "./roles.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";
import { inboxActorContext, INBOX_INCLUDED_COLLECTIONS } from "./ui/view-models/inbox-sources.mjs";
import { buildTodayView } from "./ui/view-models/today-view.mjs";
import { buildFounderTodayView, FOUNDER_TODAY_READ_COLLECTIONS } from "./ui/view-models/founder-today-view.mjs";

export const TODAY_PAGE_ENDPOINT = "/api/ui/today";
export const TODAY_READ_COLLECTIONS = Object.freeze([
  ...INBOX_INCLUDED_COLLECTIONS,
  "dailyRunSessions",
  "morningBriefs"
]);

// The Founder OS Today loop ranks over the same candidates plus the collections that carry
// meetings, automation exceptions and the queue spine. Read only when the flag is on.
export const FOUNDER_TODAY_PAGE_READ_COLLECTIONS = Object.freeze([
  ...new Set([...TODAY_READ_COLLECTIONS, ...FOUNDER_TODAY_READ_COLLECTIONS, "outreachReplies"])
]);

const DAILY_RUN_REASON = "This is the current Daily Run item.";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeExactHref(value = "") {
  const href = String(value || "").trim();
  const resolution = resolveRouteCompatibility(href);
  if (resolution.kind !== "object" || resolution.safeHash !== href) return "";
  return href;
}

function compactActionItem(item = {}, { primary = false } = {}) {
  const href = safeExactHref(item.href);
  if (!href) return null;
  const actionLabel = primary && item.whyNow === DAILY_RUN_REASON ? "Resume" : primary ? "Start" : "Open";
  return {
    objectType:item.objectType || "Work item",
    title:item.title || "",
    summary:item.summary || "",
    whyNow:item.whyNow || "",
    priority:item.priority || "normal",
    dueAt:item.dueAt || "",
    owner:item.owner || "",
    href,
    destination:item.destination || "Inbox",
    taskId:item.sourceKind === "tasks" ? item.sourceId || "" : "",
    actionLabel,
    actionAccessibleName:`${actionLabel} ${item.title || "work item"}`
  };
}

function compactReference(item = {}) {
  const href = safeExactHref(item.href);
  if (!href) return null;
  return {
    title:item.title || "",
    summary:item.summary || "",
    priority:item.priority || "normal",
    href,
    destination:item.destination || "Inbox",
    taskId:item.sourceKind === "tasks" ? item.sourceId || "" : ""
  };
}

function compactProgressReference(item = {}) {
  const href = safeExactHref(item.href);
  if (!href) return null;
  return {
    title:item.title || "",
    summary:item.summary || "",
    updatedAt:item.updatedAt || "",
    href,
    destination:item.destination || "Inbox"
  };
}

function easternDateLabel(now = "") {
  return new Intl.DateTimeFormat("en-US", {
    weekday:"long",
    month:"long",
    day:"numeric",
    timeZone:"America/New_York"
  }).format(new Date(now));
}

function safeItemHref(value = "") {
  const href = String(value || "").trim();
  if (!href) return "";
  const resolution = resolveRouteCompatibility(href);
  const usable = ["object", "page"].includes(resolution.kind) && resolution.safeHash === href;
  return usable ? href : "";
}

// One shape for every kind of item, because one panel opens all of them. Nothing here is a
// send control: the panel drafts, records, completes and schedules — it never sends.
function compactFounderItem(item = {}) {
  return {
    id:item.id || "",
    objectType:item.objectType || "Work item",
    title:item.title || "",
    summary:item.summary || "",
    whyNow:item.whyNow || "",
    rankTier:item.rankTier,
    rankReason:item.rankReason || "",
    priority:item.priority || "normal",
    priorityLabel:`${(item.priority || "normal").replace(/^./, (character) => character.toUpperCase())} priority`,
    urgency:item.urgency || "none",
    urgencyLabel:Object.freeze({
      blocking:"Blocking now",
      overdue:"Overdue",
      imminent:"Starting soon",
      today:"Due today",
      aging:"Waiting a while",
      none:"No deadline"
    })[item.urgency] || "No deadline",
    dueAt:item.dueAt || "",
    owner:item.owner || "",
    href:safeItemHref(item.href),
    taskId:item.taskId || "",
    composeSourceKind:item.composeSourceKind || "",
    composeSourceId:item.composeSourceId || "",
    actionLabel:item.actionLabel || "Open"
  };
}

// Release 2 payload: the five sections of workspaces/today.md over the existing collections.
export function buildAuthorizedFounderTodayPage(state = {}, actor = {}, now = "") {
  const view = buildFounderTodayView(state, actor, now);
  const actorContext = inboxActorContext(actor);
  const authorized = actorContext.valid && roleHasCapability(actorContext.role, "read_internal");
  const section = (key) => view.sections[key].map(compactFounderItem);
  return deepFreeze({
    ok:true,
    founderOsToday:true,
    generatedAt:view.generatedAt,
    dateLabel:easternDateLabel(view.generatedAt),
    sections:{
      now:section("now"),
      next:section("next"),
      communications:section("communications"),
      meetings:section("meetings"),
      needsAttention:section("needsAttention")
    },
    totals:view.totals,
    overflow:view.counts.overflow,
    utilities:{
      quickCaptureAvailable:authorized && roleHasCapability(actorContext.role, "route_captures"),
      communicationsHref:"#inbox?group=needs-me",
      meetingsHref:"#meetings"
    }
  });
}

export function buildAuthorizedTodayPage(state = {}, actor = {}, now = "") {
  const today = buildTodayView(state, actor, now);
  const actorContext = inboxActorContext(actor);
  const authorized = actorContext.valid && roleHasCapability(actorContext.role, "read_internal");
  const compactNow = today.nowItem ? compactActionItem(today.nowItem, { primary:true }) : null;
  const compactNext = today.nextItems.map((item) => compactActionItem(item)).filter(Boolean).slice(0, 3);

  return deepFreeze({
    ok:true,
    generatedAt:today.generatedAt,
    dateLabel:easternDateLabel(today.generatedAt),
    nowItem:compactNow,
    nextItems:compactNext,
    needsMeSummary:{
      count:today.needsMeSummary.count,
      urgentCount:today.needsMeSummary.urgentCount,
      highCount:today.needsMeSummary.highCount,
      topItems:today.needsMeSummary.topItems.map(compactReference).filter(Boolean).slice(0, 3),
      href:"#inbox?group=needs-me"
    },
    progressSummary:{
      available:today.progressSummary.available,
      periodLabel:"This week",
      count:today.progressSummary.count,
      items:today.progressSummary.items.map(compactProgressReference).filter(Boolean).slice(0, 5),
      href:"#inbox?group=updates"
    },
    utilities:{
      quickCaptureAvailable:authorized && roleHasCapability(actorContext.role, "route_captures"),
      reviewPlanHref:authorized ? "#daily-run" : ""
    }
  });
}
