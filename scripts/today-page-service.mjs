import { roleHasCapability } from "./roles.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";
import { inboxActorContext } from "./ui/view-models/inbox-sources.mjs";
import { buildTodayView } from "./ui/view-models/today-view.mjs";

export const TODAY_PAGE_ENDPOINT = "/api/ui/today";

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
    destination:item.destination || "Inbox"
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
