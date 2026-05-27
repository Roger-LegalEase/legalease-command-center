import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { conversationOperatingInputs } from "./lee-conversation-context.mjs";
import { computeRcapPartnerJourneyHandoffReadiness, rcapReviewQueue } from "./review-approval-engine.mjs";

const externalActionsConfirmation = "No emails sent, no posts published, no partner pages published, no dashboards activated, no external systems contacted.";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function dayKey(options = {}) {
  return options.date || isoNow(options).slice(0, 10);
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function eventTime(item = {}) {
  const value = item.createdAt || item.timestamp || item.updatedAt || item.generatedAt || "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isSameDay(item = {}, date = "") {
  const value = item.createdAt || item.timestamp || item.updatedAt || item.generatedAt || "";
  return String(value).startsWith(date);
}

function memoryItem(title, detail, options = {}) {
  return {
    title,
    detail,
    source: options.source || "operating_memory",
    href: options.href || "production-activation-rcap"
  };
}

function uniqueByTitle(items = []) {
  const seen = new Set();
  return items.filter(item => {
    const title = String(item?.title || "").trim();
    if (!title || seen.has(title)) return false;
    seen.add(title);
    return true;
  });
}

function openTask(task = {}) {
  return !["done", "complete", "completed", "dismissed", "archived"].includes(String(task.status || "").toLowerCase());
}

export function synthesizeOperatingMemory(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const date = dayKey({ ...options, now: generatedAt });
  const loop = buildDailyOperatingLoop(state);
  const conversation = conversationOperatingInputs(state);
  const reviewQueue = rcapReviewQueue(state);
  const handoff = computeRcapPartnerJourneyHandoffReadiness(state);
  const todayEvents = [...list(state.activityEvents), ...list(state.auditHistory), ...list(state.events)]
    .filter(item => isSameDay(item, date))
    .sort((a, b) => eventTime(b) - eventTime(a));
  const blockedArtifacts = reviewQueue.filter(item => item.review_state === "blocked");
  const revisionArtifacts = reviewQueue.filter(item => item.review_state === "needs_revision");
  const openTasks = list(state.tasks).filter(openTask);
  const liveGates = liveGatesCount(state);

  const movedToday = uniqueByTitle([
    ...todayEvents.map(event => memoryItem(
      event.title || event.eventType || event.action || "Operating event captured",
      event.summary || event.action || event.eventType || "Internal operating state changed.",
      { source: "activity", href: "reports" }
    )),
    ...conversation.reflectionItems.map(item => memoryItem(
      item.title || "Conversation movement",
      item.detail || "Reviewed conversation context moved today.",
      { source: "conversation_note", href: "conversation-notes" }
    ))
  ]).slice(0, 8);

  const decisionsMade = uniqueByTitle([
    ...todayEvents
      .filter(event => /review state changed|approved|blocked|needs_revision|handoff packet|decision/i.test([event.eventType, event.title, event.action].join(" ")))
      .map(event => memoryItem(
        event.title || event.action || "Decision captured",
        event.summary || event.action || event.eventType || "A review or handoff state changed today.",
        { source: "audit", href: "production-activation-rcap" }
      )),
    ...conversation.reviewedOrApplied.filter(note => note.classification.includes("decision")).map(note => memoryItem(
      note.summary,
      "Conversation-derived decision input.",
      { source: "conversation_note", href: "conversation-notes" }
    ))
  ]).slice(0, 8);

  const stillBlocked = uniqueByTitle([
    ...blockedArtifacts.map(item => memoryItem(
      item.artifact,
      item.next_required_action || "Blocked pending operator review.",
      { source: "blocked_artifact", href: "production-activation-rcap" }
    )),
    ...handoff.missing_partner_details.map(detail => memoryItem(
      detail,
      "Missing RCAP partner detail blocks handoff readiness.",
      { source: "missing_details", href: "production-activation-rcap" }
    )),
    ...openTasks.filter(task => String(task.status || "").toLowerCase() === "blocked" || task.escalationReason).map(task => memoryItem(
      task.title || "Blocked task",
      task.escalationReason || task.nextAction || task.description || "Task remains blocked.",
      { source: "task", href: "tasks" }
    )),
    ...conversation.riskNotes.map(item => memoryItem(
      item.title || "Conversation risk",
      item.detail || "Reviewed conversation context contains a risk or blocker.",
      { source: "conversation_note", href: "conversation-notes" }
    ))
  ]).slice(0, 8);

  const carryForward = uniqueByTitle([
    ...loop.top3.map(item => memoryItem(item.title, item.detail || item.why || "Carry this operating action forward.", { source: item.source, href: item.href })),
    ...revisionArtifacts.map(item => memoryItem(
      item.artifact,
      "Needs revision before it can become handoff ready.",
      { source: "revision", href: "production-activation-rcap" }
    )),
    ...openTasks.slice(0, 3).map(task => memoryItem(
      task.title || "Open task",
      task.nextAction || task.description || "Open task should carry forward.",
      { source: "task", href: "tasks" }
    )),
    ...conversation.carryForward.map(item => memoryItem(
      item.title || "Conversation carry-forward",
      item.detail || "Reviewed conversation context should carry forward.",
      { source: "conversation_note", href: "conversation-notes" }
    ))
  ]).slice(0, 8);

  const resurfaceTomorrow = uniqueByTitle([
    ...loop.waitingOn.map(item => memoryItem(item.title, item.detail, { source: item.source, href: item.href })),
    ...loop.decisionsNeeded.map(item => memoryItem(item.title, item.detail, { source: item.source, href: item.href })),
    memoryItem(
      "RCAP handoff readiness",
      handoff.handoff_ready ? "Ready for Roger's manual handoff decision." : handoff.next_manual_action,
      { source: "handoff", href: "production-activation-rcap" }
    ),
    ...conversation.resurfaceTomorrow.map(item => memoryItem(
      item.title || "Conversation resurfacing item",
      item.detail || "Reviewed conversation context should resurface tomorrow.",
      { source: "conversation_note", href: "conversation-notes" }
    ))
  ]).slice(0, 8);

  const doNotCarryForward = uniqueByTitle(loop.doNotTouchToday.map(item => memoryItem(
    item.title,
    item.detail || "Do not let this distract tomorrow.",
    { source: "safety", href: item.href }
  )).concat(conversation.doNotTouch.map(item => memoryItem(
    item.title || "Conversation do-not-carry item",
    item.detail || "Reviewed conversation context should not carry forward.",
    { source: "conversation_note", href: "conversation-notes" }
  )))).slice(0, 6);

  const riskNotes = uniqueByTitle([
    liveGates > 0 ? memoryItem("Live gate risk", `${liveGates} live gate(s) are enabled and need review.`, { source: "safety", href: "settings" }) : memoryItem("Live gates remain 0", "No live publishing gate is enabled.", { source: "safety", href: "settings" }),
    blockedArtifacts.length ? memoryItem("Blocked artifacts", `${blockedArtifacts.length} RCAP artifact(s) remain blocked.`, { source: "review_queue", href: "production-activation-rcap" }) : null,
    revisionArtifacts.length ? memoryItem("Revision-required artifacts", `${revisionArtifacts.length} RCAP artifact(s) need revision.`, { source: "review_queue", href: "production-activation-rcap" }) : null,
    handoff.missing_partner_details.length ? memoryItem("Missing partner details", `${handoff.missing_partner_details.length} RCAP detail(s) are missing.`, { source: "handoff", href: "production-activation-rcap" }) : null
  ].filter(Boolean)).slice(0, 8);

  return {
    key: `operating-memory-${date}`,
    date,
    generated_at: generatedAt,
    source_counts: {
      auditHistory: list(state.auditHistory).length,
      activityEvents: list(state.activityEvents).length,
      events: list(state.events).length,
      reviewQueue: reviewQueue.length,
      openTasks: openTasks.length
    },
    moved_today: movedToday,
    decisions_made: decisionsMade,
    still_blocked: stillBlocked,
    carry_forward: carryForward,
    resurface_tomorrow: resurfaceTomorrow,
    do_not_carry_forward: doNotCarryForward,
    risk_notes: riskNotes,
    live_gates_count: liveGates,
    external_actions_confirmation: externalActionsConfirmation
  };
}

export function saveTodayOperatingMemory(state = {}, options = {}) {
  const record = synthesizeOperatingMemory(state, options);
  const timestamp = record.generated_at;
  const actor = options.actor || "owner_token";
  const existingRecords = list(state.operatingMemory).filter(item => item.key !== record.key);
  const next = {
    ...state,
    operatingMemory: [record, ...existingRecords].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${record.key}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: "operating memory saved",
    resourceType: "operating_memory",
    resourceId: record.key,
    beforeValue: null,
    afterValue: {
      date: record.date,
      live_gates_count: record.live_gates_count,
      external_actions_confirmation: record.external_actions_confirmation
    }
  }, ...list(state.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: `activity-${record.key}-${Date.parse(timestamp) || Date.now()}`,
    eventType: "Operating memory saved",
    title: `Operating memory saved for ${record.date}`,
    relatedObjectType: "operating_memory",
    relatedObjectId: record.key,
    riskLevel: "low",
    metadata: {
      liveGatesCount: record.live_gates_count,
      externalSideEffects: false,
      noExternalSystemsContacted: true
    },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, record };
}
