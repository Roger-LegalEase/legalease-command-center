import { buildEveningReflection } from "./lee-conversation-context.mjs";
import { synthesizeOperatingMemory } from "./operating-memory.mjs";

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
    source: options.source || "evening_reflection"
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
    .map(item => ritualItem(
      item.title || item.eventType || item.action || "Operating event captured",
      item.summary || item.action || item.eventType || "Internal operating state changed.",
      { href: "reports", source: "activity" }
    ));
}

export function buildEveningReflectionRecord(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const date = dayKey({ ...options, now: generatedAt });
  const leeReflection = buildEveningReflection(state);
  const memory = synthesizeOperatingMemory(state, { ...options, now: generatedAt, date });
  const liveGates = liveGatesCount(state);

  return {
    key: `evening-reflection-${date}`,
    date,
    generated_at: generatedAt,
    what_moved_today: uniqueByTitle([...list(leeReflection.what_moved_today), ...memory.moved_today]).slice(0, 8),
    decisions_made: uniqueByTitle([...list(leeReflection.decisions_made), ...memory.decisions_made]).slice(0, 8),
    state_changes: uniqueByTitle([...list(leeReflection.state_changes), ...sourceEvidence(state, date)]).slice(0, 8),
    blockers_remaining: uniqueByTitle([...list(leeReflection.blockers_remaining), ...memory.still_blocked]).slice(0, 8),
    carry_forward: uniqueByTitle([...list(leeReflection.carry_forward), ...memory.carry_forward]).slice(0, 8),
    resurface_tomorrow: uniqueByTitle([...list(leeReflection.resurface_tomorrow), ...memory.resurface_tomorrow]).slice(0, 8),
    do_not_carry_forward: uniqueByTitle([...list(leeReflection.do_not_carry_forward), ...memory.do_not_carry_forward]).slice(0, 8),
    notes_for_tomorrow: uniqueByTitle([...list(leeReflection.notes_for_tomorrow), ...memory.carry_forward, ...memory.resurface_tomorrow]).slice(0, 8),
    source_evidence: sourceEvidence(state, date),
    source_counts: {
      operatingMemoryMoved: memory.moved_today.length,
      operatingMemoryBlocked: memory.still_blocked.length,
      captureInbox: list(state.captureInbox).length,
      activityEvents: list(state.activityEvents).length,
      auditHistory: list(state.auditHistory).length
    },
    live_gates_count: liveGates,
    external_actions_confirmation: externalActionsConfirmation
  };
}

export function saveEveningReflection(state = {}, options = {}) {
  const record = buildEveningReflectionRecord(state, options);
  const timestamp = record.generated_at;
  const actor = options.actor || "owner_token";
  const next = {
    ...state,
    eveningReflections: [record, ...list(state.eveningReflections).filter(item => item.key !== record.key)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${record.key}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: "evening reflection saved",
    resourceType: "evening_reflection",
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
    eventType: "Evening Reflection saved",
    title: "Evening Reflection saved",
    summary: `Evening Reflection saved for ${record.date}. No external action was taken.`,
    relatedObjectType: "evening_reflection",
    relatedObjectId: record.key,
    riskLevel: "low",
    metadata: { liveGatesCount: record.live_gates_count, externalSideEffects: false, noExternalSystemsContacted: true },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, record };
}
