import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { buildMorningBrief } from "./lee-conversation-context.mjs";
import { synthesizeOperatingMemory } from "./operating-memory.mjs";
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

function ritualItem(title, detail, options = {}) {
  return {
    title,
    detail,
    why: options.why || detail,
    action: options.action || "Review internally",
    href: options.href || "overview",
    source: options.source || "morning_brief"
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

function fillTop3(items = []) {
  return uniqueByTitle([
    ...items,
    ritualItem("Open RCAP Review Workspace", "Review the internal activation artifacts before any external handoff.", { href: "production-activation-rcap", source: "rcap_review" }),
    ritualItem("Review Capture Inbox", "Clear reviewed Quick Capture inputs so Le-E can route the right work.", { href: "capture-inbox", source: "capture_inbox" }),
    ritualItem("Save today's Operating Memory", "Carry forward only what matters and park the rest.", { href: "operating-memory", source: "operating_memory" })
  ]).slice(0, 3);
}

function sourceEvidence(state = {}, date = "") {
  return [...list(state.activityEvents), ...list(state.auditHistory), ...list(state.events)]
    .filter(item => !date || String(item.createdAt || item.timestamp || item.updatedAt || item.generatedAt || "").startsWith(date))
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, 8)
    .map(item => ritualItem(
      item.title || item.eventType || item.action || "Operating event captured",
      item.summary || item.action || item.eventType || "Internal operating state changed.",
      { href: "reports", source: "activity" }
    ));
}

export function buildMorningBriefRecord(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const date = dayKey({ ...options, now: generatedAt });
  const loop = buildDailyOperatingLoop(state);
  const leeBrief = buildMorningBrief(state);
  const memory = synthesizeOperatingMemory(state, { ...options, now: generatedAt, date });
  const reviewQueue = rcapReviewQueue(state);
  const handoff = computeRcapPartnerJourneyHandoffReadiness(state);
  const liveGates = liveGatesCount(state);

  const risks = uniqueByTitle([
    ...list(leeBrief.risks).map(item => ritualItem(item.title || "Capture risk", item.detail || "Reviewed Quick Capture or conversation context flagged a risk.", { href: item.href || "capture-inbox", source: item.source || "capture_inbox" })),
    ...memory.risk_notes,
    liveGates > 0 ? ritualItem("Live gates enabled", `${liveGates} live gate(s) require immediate review.`, { href: "settings", source: "safety" }) : ritualItem("Live gates remain 0", "No live publishing gate is enabled.", { href: "settings", source: "safety" })
  ]).slice(0, 6);

  return {
    key: `morning-brief-${date}`,
    date,
    generated_at: generatedAt,
    mission_today: leeBrief.mission_today || loop.top3[0]?.title || "Run the internal operating loop from reviewed Command Center state.",
    top_3_actions: fillTop3([...list(leeBrief.top_3_actions), ...loop.top3]),
    decisions_needed: uniqueByTitle([...list(leeBrief.decisions_needed), ...loop.decisionsNeeded]).slice(0, 6),
    waiting_on: uniqueByTitle([...loop.waitingOn, ...memory.still_blocked]).slice(0, 6),
    risks,
    do_not_touch: uniqueByTitle([...list(leeBrief.do_not_touch), ...loop.doNotTouchToday, ...memory.do_not_carry_forward]).slice(0, 6),
    suggested_first_move: leeBrief.suggested_first_move || loop.top3[0]?.detail || handoff.next_manual_action || "Open the RCAP Review Workspace.",
    source_evidence: sourceEvidence(state, date),
    source_counts: {
      reviewQueue: reviewQueue.length,
      openTasks: list(state.tasks).filter(task => !["done", "dismissed", "archived"].includes(String(task.status || "").toLowerCase())).length,
      captureInbox: list(state.captureInbox).length,
      activityEvents: list(state.activityEvents).length,
      auditHistory: list(state.auditHistory).length
    },
    handoff_ready: Boolean(handoff.handoff_ready),
    live_gates_count: liveGates,
    external_actions_confirmation: externalActionsConfirmation
  };
}

export function saveMorningBrief(state = {}, options = {}) {
  const record = buildMorningBriefRecord(state, options);
  const timestamp = record.generated_at;
  const actor = options.actor || "owner_token";
  const next = {
    ...state,
    morningBriefs: [record, ...list(state.morningBriefs).filter(item => item.key !== record.key)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${record.key}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: "morning brief saved",
    resourceType: "morning_brief",
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
    eventType: "Morning Brief saved",
    title: "Morning Brief saved",
    summary: `Morning Brief saved for ${record.date}. No external action was taken.`,
    relatedObjectType: "morning_brief",
    relatedObjectId: record.key,
    riskLevel: "low",
    metadata: { liveGatesCount: record.live_gates_count, externalSideEffects: false, noExternalSystemsContacted: true },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, record };
}
