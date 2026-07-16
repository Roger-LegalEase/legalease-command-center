import { routeCaptureInboxItem } from "./lee-quick-capture.mjs";
import { rcapHandoffPacketKey, rcapReviewQueue } from "./review-approval-engine.mjs";
import { compactSearchText, searchRecordUpdatedAt } from "./search-index-helpers.mjs";
import { updateTaskInState } from "./tasks-engine.mjs";

const forbiddenActions = new Set([
  "send_email",
  "publish_page",
  "post_content",
  "activate_dashboard",
  "change_live_gates",
  "call_partner_journey",
  "expose_secrets"
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

export const compact = compactSearchText;
export const updatedAt = searchRecordUpdatedAt;

function result({
  id,
  type,
  title,
  summary,
  route,
  source,
  status,
  priority = "",
  updated_at = "",
  safe_actions = []
}) {
  const routeAction = route ? [{ action: "open_route", label: "Open", route }] : [];
  return {
    id: String(id || `${type}-${title}`).slice(0, 180),
    type,
    title: compact(title, "Untitled"),
    summary: compact(summary, "No summary recorded."),
    route: route || "",
    source: source || type,
    status: status || "available",
    priority,
    updated_at,
    safe_actions: [...routeAction, ...safe_actions].filter(action => action?.action && !forbiddenActions.has(action.action))
  };
}

function textForSearch(item = {}) {
  return [
    item.id,
    item.type,
    item.title,
    item.summary,
    item.source,
    item.status,
    item.priority,
    item.route
  ].join(" ").toLowerCase();
}

function captureActions(item = {}) {
  const actions = [];
  if (!["reviewed", "routed", "ignored"].includes(item.review_state)) {
    actions.push({ action: "mark_capture_reviewed", label: "Mark reviewed", targetId: item.id });
  }
  actions.push({ action: "route_capture_task", label: "Route to Task", targetId: item.id });
  actions.push({ action: "route_capture_operating_memory", label: "Route to Notes & Decisions", targetId: item.id });
  return actions;
}

function taskActions(item = {}) {
  const actions = [{ action: "open_route", label: "Open", route: "tasks" }];
  if (!["done", "archived"].includes(String(item.status || "").toLowerCase())) {
    actions.push({ action: "task_mark_in_progress", label: "Mark In Progress", targetId: item.id });
    actions.push({ action: "task_mark_done", label: "Mark Done", targetId: item.id });
  }
  if (String(item.status || "").toLowerCase() !== "open") actions.push({ action: "task_reopen", label: "Reopen", targetId: item.id });
  return actions;
}

function rcapArtifactResults(state = {}) {
  const artifacts = [
    ...list(state.partnerProgramArtifacts).filter(item => /^rcap-/i.test(item.key || item.id || "") || /rcap/i.test(item.title || "")),
    ...list(state.reports).filter(item => /^rcap-/i.test(item.key || item.id || "") || /rcap/i.test(item.title || "")),
    ...list(state.evidencePackNotes).filter(item => /^rcap-/i.test(item.key || item.id || "") || /rcap/i.test(item.title || ""))
  ];
  return artifacts.map(item => {
    const isPacket = item.key === rcapHandoffPacketKey || item.artifactType === "internal_handoff_packet";
    return result({
      id: item.key || item.id,
      type: isPacket ? "handoffPacket" : "recoveryPlanArtifact",
      title: String(item.title || item.key || "Recovery plan artifact").replace(/\bRCAP\b/g, "Recovery plan").replace(/Production Activation/g, "Launch checklist"),
      summary: String(item.summary?.nextManualAction || item.summary?.answer || item.notes || item.description || item.status || "Recovery plan artifact.").replace(/\bRCAP\b/g, "Recovery plan").replace(/Production Activation/g, "Launch checklist"),
      route: "production-activation-rcap",
      source: isPacket ? "handoff packet" : "Launch checklist",
      status: item.review_state || item.status || "review_required",
      priority: item.priority || "",
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_rcap_review_workspace", label: "Open Launch Checklist", route: "production-activation-rcap" }]
    });
  });
}

export function buildOperatorSearchIndex(state = {}) {
  const items = [];

  for (const item of list(state.tasks)) {
    items.push(result({
      id: item.id,
      type: "task",
      title: item.title,
      summary: item.description || item.nextAction || item.status,
      route: "tasks",
      source: "tasks",
      status: item.status,
      priority: item.priority,
      updated_at: updatedAt(item),
      safe_actions: taskActions(item)
    }));
  }

  for (const item of list(state.captureInbox)) {
    items.push(result({
      id: item.id,
      type: "captureInbox",
      title: item.summary || item.raw_input,
      summary: item.raw_input || item.inferred_type,
      route: "capture-inbox",
      source: item.source_label || "Quick Capture",
      status: item.review_state || "review_required",
      priority: item.priority,
      updated_at: updatedAt(item),
      safe_actions: captureActions(item)
    }));
  }

  for (const item of list(state.conversationNotes)) {
    items.push(result({
      id: item.id,
      type: "conversationNotes",
      title: item.summary || item.source_label || "Conversation note",
      summary: item.raw_note || item.review_state,
      route: "conversation-notes",
      source: item.source_label || "conversation notes",
      status: item.review_state,
      priority: item.priority,
      updated_at: updatedAt(item)
    }));
  }

  for (const item of list(state.morningBriefs)) {
    items.push(result({
      id: item.key || item.id,
      type: "morningBrief",
      title: item.mission_today || "Morning Brief",
      summary: "Daily ritual for Mission Today, Top 3, Decisions Needed, Waiting On, Risks, and First Move.",
      route: "morning-brief",
      source: "morning brief",
      status: item.status || "saved",
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_morning_brief", label: "Open Morning Brief", route: "morning-brief" }]
    }));
  }

  for (const item of list(state.eveningReflections)) {
    items.push(result({
      id: item.key || item.id,
      type: "eveningReflection",
      title: item.title || "Evening Reflection",
      summary: list(item.notes_for_tomorrow)[0]?.title || list(item.carry_forward)[0]?.title || "End-of-day reflection.",
      route: "evening-reflection",
      source: "evening reflection",
      status: item.status || "saved",
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_evening_reflection", label: "Open Evening Reflection", route: "evening-reflection" }]
    }));
  }

  for (const item of list(state.operatingMemory)) {
    items.push(result({
      id: item.key || item.id,
      type: "operatingMemory",
      title: list(item.moved_today)[0]?.title || "Notes & Decisions",
      summary: list(item.carry_forward)[0]?.title || list(item.still_blocked)[0]?.title || "Day-over-day operating memory.",
      route: "operating-memory",
      source: "operating memory",
      status: item.status || "saved",
      updated_at: updatedAt(item)
    }));
  }

  for (const item of list(state.dailyCloseouts)) {
    items.push(result({
      id: item.key || item.id,
      type: "dailyCloseout",
      title: item.tomorrow_mission || "Daily Closeout",
      summary: list(item.tomorrow_top_3)[0]?.title || "Closeout and tomorrow plan.",
      route: "daily-closeout",
      source: "daily closeout",
      status: item.status || "saved",
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_daily_closeout", label: "Open Daily Closeout", route: "daily-closeout" }]
    }));
  }

  for (const item of rcapReviewQueue(state)) {
    items.push(result({
      id: item.key,
      type: "reviewQueue",
      title: item.artifact,
      summary: item.next_required_action,
      route: "production-activation-rcap",
      source: "RCAP review queue",
      status: item.review_state,
      priority: item.priority,
      updated_at: item.last_updated,
      safe_actions: [{ action: "open_rcap_review_workspace", label: "Open Launch Checklist", route: "production-activation-rcap" }]
    }));
  }

  items.push(...rcapArtifactResults(state));

  for (const item of list(state.handoffPackets)) {
    items.push(result({
      id: item.id || item.key,
      type: "handoffPacket",
      title: item.title || "Internal Handoff Packet",
      summary: item.summary?.nextManualAction || item.summary || item.status || "Internal handoff packet.",
      route: "production-activation-rcap",
      source: "handoff packets",
      status: item.status || (item.handoff_ready ? "ready" : "not_ready"),
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_rcap_review_workspace", label: "Open Launch Checklist", route: "production-activation-rcap" }]
    }));
  }

  for (const item of list(state.partnerPrograms)) {
    items.push(result({
      id: item.id || item.slug,
      type: "partnerProgram",
      title: item.name || item.slug || "Partner program",
      summary: item.nextAction || item.programGoal || item.status || "Partner program record.",
      route: "partner-programs",
      source: "partner programs",
      status: item.status,
      priority: item.priority,
      updated_at: updatedAt(item)
    }));
  }

  for (const item of list(state.reports)) {
    items.push(result({
      id: item.id || item.key,
      type: "report",
      title: item.title || item.reportTitle || "Report",
      summary: item.summary || item.status || "Internal report.",
      route: "reports",
      source: "reports",
      status: item.status || item.review_state,
      updated_at: updatedAt(item)
    }));
  }

  for (const item of list(state.evidencePackNotes)) {
    items.push(result({
      id: item.id || item.key,
      type: "evidenceNote",
      title: item.title || "Evidence note",
      summary: item.notes || item.summary || item.status,
      route: "reports",
      source: "evidence notes",
      status: item.status || item.review_state,
      updated_at: updatedAt(item)
    }));
  }

  for (const item of list(state.dataRoomItems)) {
    items.push(result({
      id: item.id || item.key,
      type: "dataRoomItem",
      title: item.title || item.name || "Data Room item",
      summary: item.summary || item.notes || item.status,
      route: "dataroom",
      source: "data room",
      status: item.status,
      updated_at: updatedAt(item)
    }));
  }

  for (const item of list(state.auditHistory).slice(0, 80)) {
    items.push(result({
      id: item.id,
      type: "auditHistory",
      title: item.action || "Audit event",
      summary: [item.resourceType, item.resourceId].filter(Boolean).join(" · ") || "Audit history entry.",
      route: "os-health",
      source: "audit history",
      status: "recorded",
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_os_health", label: "Open App Status", route: "os-health" }]
    }));
  }

  for (const item of list(state.activityEvents).slice(0, 80)) {
    items.push(result({
      id: item.id,
      type: "activityEvent",
      title: item.title || item.eventType || "Activity event",
      summary: item.summary || item.eventType || "Activity event.",
      route: "os-health",
      source: "activity events",
      status: item.riskLevel || "recorded",
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_os_health", label: "Open App Status", route: "os-health" }]
    }));
  }

  for (const item of list(state.osHealthSnapshots)) {
    items.push(result({
      id: item.id,
      type: "osHealthSnapshot",
      title: "App Status Snapshot",
      summary: item.summary?.next_operator_action || item.overall_health || "App status snapshot.",
      route: "os-health",
      source: "OS health",
      status: item.overall_health,
      updated_at: updatedAt(item),
      safe_actions: [{ action: "open_os_health", label: "Open App Status", route: "os-health" }]
    }));
  }

  return items
    .filter(item => item.id && item.title)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

export function searchOperatorIndex(indexOrState = [], query = "", filters = {}) {
  const index = Array.isArray(indexOrState) ? indexOrState : buildOperatorSearchIndex(indexOrState);
  const q = String(query || "").trim().toLowerCase();
  const type = String(filters.type || "").trim();
  return index.filter(item => {
    if (type && item.type !== type) return false;
    if (!q) return true;
    return textForSearch(item).includes(q);
  });
}

export function runOperatorSearchAction(state = {}, payload = {}, options = {}) {
  const action = String(payload.action || "");
  const targetId = String(payload.targetId || payload.id || "");
  if (forbiddenActions.has(action)) throw new Error("Forbidden operator search action blocked.");
  if (action === "open_route") return { state, route: payload.route || "", message: "Route opened." };
  if (action === "open_rcap_review_workspace") return { state, route: "production-activation-rcap", message: "Launch checklist opened." };
  if (action === "open_os_health") return { state, route: "os-health", message: "App status opened." };
  if (action === "open_morning_brief") return { state, route: "morning-brief", message: "Morning Brief opened." };
  if (action === "open_evening_reflection") return { state, route: "evening-reflection", message: "Evening Reflection opened." };
  if (action === "open_daily_closeout") return { state, route: "daily-closeout", message: "Daily Closeout opened." };
  if (action === "mark_capture_reviewed") {
    const result = routeCaptureInboxItem(state, targetId, "mark_reviewed", options);
    return { ...result, route: "capture-inbox", message: "Capture marked reviewed." };
  }
  if (action === "route_capture_task") {
    const result = routeCaptureInboxItem(state, targetId, "route_task", options);
    return { ...result, route: "tasks", message: "Capture routed to Task." };
  }
  if (action === "route_capture_operating_memory") {
    const result = routeCaptureInboxItem(state, targetId, "route_operating_memory", options);
    return { ...result, route: "operating-memory", message: "Capture routed to Notes & Decisions." };
  }
  if (action === "task_mark_in_progress") {
    const result = updateTaskInState(state, targetId, "in_progress", { note: payload.note || "Marked in progress from Search." }, options);
    return { ...result, route: "tasks", message: "Task marked in progress." };
  }
  if (action === "task_mark_done") {
    const result = updateTaskInState(state, targetId, "done", { completion_note: payload.note || payload.completion_note || "Completed from Search." }, options);
    return { ...result, route: "tasks", message: "Task marked done." };
  }
  if (action === "task_reopen") {
    const result = updateTaskInState(state, targetId, "reopen", { note: payload.note || "Reopened from Search." }, options);
    return { ...result, route: "tasks", message: "Task reopened." };
  }
  throw new Error("Unsupported operator search action.");
}
