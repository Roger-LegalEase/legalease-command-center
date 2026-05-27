import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { buildEveningReflectionRecord } from "./evening-reflection.mjs";
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

function closeoutItem(title, detail, options = {}) {
  return {
    title,
    detail,
    why: options.why || detail,
    action: options.action || "Review internally",
    href: options.href || "daily-closeout",
    source: options.source || "daily_closeout"
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

function sourceEvidence(state = {}, date = "") {
  return [...list(state.activityEvents), ...list(state.auditHistory), ...list(state.events)]
    .filter(item => !date || String(item.createdAt || item.timestamp || item.updatedAt || item.generatedAt || "").startsWith(date))
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, 8)
    .map(item => closeoutItem(
      item.title || item.eventType || item.action || "Operating event captured",
      item.summary || item.action || item.eventType || "Internal operating state changed.",
      { href: "reports", source: "activity" }
    ));
}

function fillTomorrowTop3(items = []) {
  return uniqueByTitle([
    ...items,
    closeoutItem("Review tomorrow's Morning Brief", "Start with the plan generated from today's closeout.", { href: "morning-brief", source: "morning_brief" }),
    closeoutItem("Resolve one blocker", "Pick the highest-friction blocker and make the next state obvious.", { href: "tasks", source: "tasks" }),
    closeoutItem("Keep live gates at 0", "Do not enable external publishing without explicit approval.", { href: "settings", source: "safety" })
  ]).slice(0, 3);
}

export function buildDailyCloseoutRecord(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const date = dayKey({ ...options, now: generatedAt });
  const savedEvening = list(state.eveningReflections).find(item => item.date === date || item.key === `evening-reflection-${date}`);
  const savedMemory = list(state.operatingMemory).find(item => item.date === date || item.key === `operating-memory-${date}`);
  const reflection = savedEvening || buildEveningReflectionRecord(state, { ...options, now: generatedAt, date });
  const memory = savedMemory || synthesizeOperatingMemory(state, { ...options, now: generatedAt, date });
  const loop = buildDailyOperatingLoop(state);
  const reviewQueue = rcapReviewQueue(state);
  const handoff = computeRcapPartnerJourneyHandoffReadiness(state);
  const liveGates = liveGatesCount(state);
  const blockedArtifacts = reviewQueue.filter(item => item.review_state === "blocked");
  const revisionArtifacts = reviewQueue.filter(item => item.review_state === "needs_revision");

  const movedToday = uniqueByTitle([...list(reflection.what_moved_today), ...list(memory.moved_today), ...sourceEvidence(state, date)]).slice(0, 8);
  const decisionsMade = uniqueByTitle([...list(reflection.decisions_made), ...list(memory.decisions_made)]).slice(0, 8);
  const blockedItems = uniqueByTitle([
    ...list(reflection.blockers_remaining),
    ...list(memory.still_blocked),
    ...blockedArtifacts.map(item => closeoutItem(item.artifact, item.next_required_action || "Blocked pending operator review.", { href: "production-activation-rcap", source: "review_queue" })),
    ...handoff.missing_partner_details.map(detail => closeoutItem(detail, "Missing RCAP partner detail blocks handoff readiness.", { href: "production-activation-rcap", source: "handoff" }))
  ]).slice(0, 8);
  const carryForward = uniqueByTitle([...list(reflection.carry_forward), ...list(memory.carry_forward), ...revisionArtifacts.map(item => closeoutItem(item.artifact, "Needs revision before handoff readiness.", { href: "production-activation-rcap", source: "review_queue" }))]).slice(0, 8);
  const droppedItems = uniqueByTitle([...list(reflection.do_not_carry_forward), ...list(memory.do_not_carry_forward), ...loop.doNotTouchToday]).slice(0, 8);
  const risks = uniqueByTitle([
    ...list(memory.risk_notes),
    liveGates > 0 ? closeoutItem("Live gates enabled", `${liveGates} live gate(s) require immediate review.`, { href: "settings", source: "safety" }) : closeoutItem("Live gates remain 0", "No live publishing gate is enabled.", { href: "settings", source: "safety" }),
    blockedArtifacts.length ? closeoutItem("Blocked RCAP artifacts", `${blockedArtifacts.length} artifact(s) remain blocked.`, { href: "production-activation-rcap", source: "review_queue" }) : null,
    handoff.missing_partner_details.length ? closeoutItem("Missing partner details", `${handoff.missing_partner_details.length} RCAP detail(s) are missing.`, { href: "production-activation-rcap", source: "handoff" }) : null
  ].filter(Boolean)).slice(0, 8);

  const tomorrowTop3 = fillTomorrowTop3([
    ...carryForward,
    ...blockedItems,
    ...loop.top3
  ]);

  return {
    key: `daily-closeout-${date}`,
    date,
    moved_today: movedToday,
    decisions_made: decisionsMade,
    blocked_items: blockedItems,
    carry_forward: carryForward,
    dropped_items: droppedItems,
    risks,
    tomorrow_mission: tomorrowTop3[0]?.title || "Start with the highest-leverage internal blocker.",
    tomorrow_top_3: tomorrowTop3,
    tomorrow_first_move: tomorrowTop3[0]?.detail || handoff.next_manual_action || "Open the Morning Brief and choose the first internal move.",
    tomorrow_waiting_on: uniqueByTitle([...blockedItems, ...loop.waitingOn]).slice(0, 8),
    tomorrow_do_not_touch: uniqueByTitle([...droppedItems, ...loop.doNotTouchToday]).slice(0, 8),
    live_gates_count: liveGates,
    no_external_actions_confirmation: externalActionsConfirmation,
    generated_at: generatedAt,
    updated_at: generatedAt,
    source_counts: {
      eveningReflection: savedEvening ? 1 : 0,
      operatingMemory: savedMemory ? 1 : 0,
      reviewQueue: reviewQueue.length,
      captureInbox: list(state.captureInbox).length,
      auditHistory: list(state.auditHistory).length,
      activityEvents: list(state.activityEvents).length
    }
  };
}

export function saveDailyCloseout(state = {}, options = {}) {
  const record = buildDailyCloseoutRecord(state, options);
  const timestamp = record.updated_at || record.generated_at;
  const actor = options.actor || "owner_token";
  const next = {
    ...state,
    dailyCloseouts: [record, ...list(state.dailyCloseouts).filter(item => item.key !== record.key)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${record.key}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: "daily closeout saved",
    resourceType: "daily_closeout",
    resourceId: record.key,
    beforeValue: null,
    afterValue: {
      date: record.date,
      live_gates_count: record.live_gates_count,
      no_external_actions_confirmation: record.no_external_actions_confirmation
    }
  }, ...list(state.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: `activity-${record.key}-${Date.parse(timestamp) || Date.now()}`,
    eventType: "Daily Closeout saved",
    title: "Daily Closeout saved",
    summary: `Daily Closeout and Tomorrow Plan saved for ${record.date}. No external action was taken.`,
    relatedObjectType: "daily_closeout",
    relatedObjectId: record.key,
    riskLevel: "low",
    metadata: { liveGatesCount: record.live_gates_count, externalSideEffects: false, noExternalSystemsContacted: true },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, record };
}
