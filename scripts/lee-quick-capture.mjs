import { createConversationNote } from "./lee-conversation-context.mjs";

export const allowedCaptureTypes = [
  "auto_classify",
  "task",
  "decision",
  "blocker",
  "risk",
  "conversation_note",
  "brief_input",
  "reflection_input",
  "carry_forward",
  "do_not_touch",
  "partner_update",
  "evidence_note",
  "idea"
];

export const captureRoutes = [
  "tasks",
  "conversationNotes",
  "operatingMemory",
  "morningBriefInputs",
  "eveningReflectionInputs",
  "evidenceNotes",
  "partnerUpdates",
  "ideas"
];

const actionRouteMap = {
  route_task: "tasks",
  route_conversation_notes: "conversationNotes",
  route_morning_brief: "morningBriefInputs",
  route_evening_reflection: "eveningReflectionInputs",
  route_operating_memory: "operatingMemory",
  route_evidence_notes: "evidenceNotes"
};

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function actorLabel(options = {}) {
  return options.actor || "owner_token";
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52) || "capture";
}

function includesAny(text = "", patterns = []) {
  return patterns.some(pattern => pattern.test(text));
}

function captureItem(title, detail, options = {}) {
  return {
    title,
    detail,
    source: "capture_inbox",
    href: options.href || "capture-inbox",
    capture_id: options.capture_id || ""
  };
}

export function classifyQuickCapture(input = {}) {
  const raw = String(input.raw_input || input.rawInput || input.rawText || "").trim();
  const lower = raw.toLowerCase();
  let inferredType = "conversation_note";
  if (includesAny(lower, [/do not touch|don't touch|not today|avoid|live publishing/])) inferredType = "do_not_touch";
  else if (includesAny(lower, [/risk|legal|compliance|unsafe|concern/])) inferredType = "risk";
  else if (includesAny(lower, [/block|blocked|waiting|missing|stuck/])) inferredType = "blocker";
  else if (includesAny(lower, [/decision|decide|approved|approval/])) inferredType = "decision";
  else if (includesAny(lower, [/task|todo|follow up|next step|action/])) inferredType = "task";
  else if (includesAny(lower, [/brief|morning|top 3|first move|focus/])) inferredType = "brief_input";
  else if (includesAny(lower, [/reflection|learned|worked|didn't work/])) inferredType = "reflection_input";
  else if (includesAny(lower, [/carry forward|tomorrow|next day|keep/])) inferredType = "carry_forward";
  else if (includesAny(lower, [/partner|rcap|county|nonprofit|proposal/])) inferredType = "partner_update";
  else if (includesAny(lower, [/evidence|proof|audit|soc 2|report/])) inferredType = "evidence_note";
  else if (includesAny(lower, [/idea|campaign|content|post/])) inferredType = "idea";

  const summary = raw.length > 180 ? `${raw.slice(0, 177).trim()}...` : raw || "Capture saved for review.";
  const suggestedRoutes = new Set(["conversationNotes"]);
  if (["task", "blocker"].includes(inferredType)) suggestedRoutes.add("tasks");
  if (["decision", "brief_input", "task", "blocker", "carry_forward"].includes(inferredType)) suggestedRoutes.add("morningBriefInputs");
  if (["decision", "reflection_input", "carry_forward", "do_not_touch", "risk"].includes(inferredType)) suggestedRoutes.add("eveningReflectionInputs");
  if (["decision", "blocker", "risk", "carry_forward", "do_not_touch", "reflection_input"].includes(inferredType)) suggestedRoutes.add("operatingMemory");
  if (inferredType === "evidence_note") suggestedRoutes.add("evidenceNotes");
  if (inferredType === "partner_update") suggestedRoutes.add("partnerUpdates");
  if (inferredType === "idea") suggestedRoutes.add("ideas");
  return { inferredType, summary, suggestedRoutes: [...suggestedRoutes].filter(route => captureRoutes.includes(route)) };
}

export function normalizeCaptureInboxItem(input = {}, options = {}) {
  const timestamp = isoNow(options);
  const rawInput = String(input.raw_input || input.rawInput || input.rawText || "").trim();
  const captureType = allowedCaptureTypes.includes(input.capture_type || input.captureType) ? (input.capture_type || input.captureType) : "auto_classify";
  const classification = classifyQuickCapture({ ...input, raw_input: rawInput });
  const inferredType = captureType === "auto_classify" ? classification.inferredType : captureType;
  return {
    id: input.id || `capture-${Date.parse(timestamp) || Date.now()}-${slug(input.source_label || input.linked_workflow || rawInput)}`,
    date: input.date || timestamp.slice(0, 10),
    raw_input: rawInput,
    source_label: input.source_label || input.sourceLabel || "Quick Capture",
    capture_type: captureType,
    inferred_type: allowedCaptureTypes.includes(inferredType) && inferredType !== "auto_classify" ? inferredType : classification.inferredType,
    summary: input.summary || classification.summary,
    priority: input.priority || "medium",
    linked_partner: input.linked_partner || input.linkedPartner || "",
    linked_workflow: input.linked_workflow || input.linkedWorkflow || "",
    suggested_routes: list(input.suggested_routes).length ? list(input.suggested_routes).filter(route => captureRoutes.includes(route)) : classification.suggestedRoutes,
    review_state: input.review_state || "review_required",
    routed_to: list(input.routed_to),
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at || timestamp,
    review_history: list(input.review_history)
  };
}

function withAuditAndActivity(state = {}, item = {}, action = "", options = {}, beforeState = "") {
  const timestamp = isoNow(options);
  const actor = actorLabel(options);
  const auditAction = action === "save" ? "quick capture saved" : action === "ignore" ? "quick capture ignored" : "quick capture routed";
  const eventType = action === "save" ? "Quick Capture saved" : action === "ignore" ? "Quick Capture ignored" : "Quick Capture routed";
  return {
    ...state,
    auditHistory: [{
      id: `audit-${item.id}-${action}-${Date.parse(timestamp) || Date.now()}`,
      timestamp,
      actor,
      action: auditAction,
      resourceType: "capture_inbox",
      resourceId: item.id,
      beforeValue: { review_state: beforeState || "" },
      afterValue: { review_state: item.review_state, routed_to: item.routed_to, action }
    }, ...list(state.auditHistory)].slice(0, 1000),
    activityEvents: [{
      id: `activity-${item.id}-${action}-${Date.parse(timestamp) || Date.now()}`,
      eventType,
      title: item.summary,
      relatedObjectType: "capture_inbox",
      relatedObjectId: item.id,
      riskLevel: ["risk", "blocker"].includes(item.inferred_type) ? "medium" : "low",
      metadata: { inferredType: item.inferred_type, routedTo: item.routed_to, externalSideEffects: false, noExternalSystemsContacted: true },
      createdAt: timestamp
    }, ...list(state.activityEvents)].slice(0, 500)
  };
}

function upsertCapture(state = {}, item = {}) {
  return {
    ...state,
    captureInbox: [item, ...list(state.captureInbox).filter(entry => entry.id !== item.id)].slice(0, 500)
  };
}

export function createCaptureInboxItem(state = {}, input = {}, options = {}) {
  const item = normalizeCaptureInboxItem(input, options);
  const next = upsertCapture(state, item);
  return { state: withAuditAndActivity(next, item, "save", options), item };
}

function conversationPayloadForCapture(item = {}, route = "") {
  const title = [item.linked_workflow, item.linked_partner].filter(Boolean).join(" / ");
  const routeFlags = {
    applied_to_morning_brief: route === "morningBriefInputs",
    applied_to_evening_reflection: route === "eveningReflectionInputs"
  };
  return {
    id: `conversation-from-${item.id}`,
    source_label: item.source_label || "Quick Capture",
    raw_note: item.raw_input,
    summary: title ? `${title}: ${item.summary}` : item.summary,
    priority: item.priority,
    linked_workflow: item.linked_workflow,
    linked_partner: item.linked_partner,
    review_state: routeFlags.applied_to_morning_brief ? "applied_morning_brief" : routeFlags.applied_to_evening_reflection ? "applied_evening_reflection" : "reviewed",
    suggested_brief_updates: [captureItem(title ? `${title}: ${item.summary}` : item.summary, "Quick Capture routed to Morning Brief inputs.", { capture_id: item.id })],
    suggested_reflection_updates: [captureItem(title ? `${title}: ${item.summary}` : item.summary, "Quick Capture routed to Evening Reflection inputs.", { capture_id: item.id })],
    carry_forward: ["operatingMemory", "morningBriefInputs", "eveningReflectionInputs"].includes(route) ? [captureItem(title ? `${title}: ${item.summary}` : item.summary, "Carry this Quick Capture forward internally.", { capture_id: item.id })] : [],
    resurface_tomorrow: /tomorrow|resurface|carry/i.test(item.raw_input || "") ? [captureItem(title ? `${title}: ${item.summary}` : item.summary, "Resurface this Quick Capture tomorrow.", { capture_id: item.id })] : [],
    do_not_touch: item.inferred_type === "do_not_touch" ? [captureItem(title ? `${title}: ${item.summary}` : item.summary, "Do not let this distract Roger.", { capture_id: item.id })] : [],
    risk_notes: ["risk", "blocker"].includes(item.inferred_type) ? [captureItem(title ? `${title}: ${item.summary}` : item.summary, "Quick Capture contains a risk or blocker.", { capture_id: item.id })] : [],
    ...routeFlags
  };
}

function routeSideEffectState(state = {}, item = {}, route = "", options = {}) {
  if (["conversationNotes", "morningBriefInputs", "eveningReflectionInputs", "operatingMemory"].includes(route)) {
    return createConversationNote(state, conversationPayloadForCapture(item, route), options).state;
  }
  if (route === "tasks") {
    const timestamp = isoNow(options);
    const task = {
      id: `task-from-${item.id}`,
      title: item.summary,
      description: item.raw_input,
      owner: "Roger",
      status: "open",
      priority: item.priority || "medium",
      due_date: timestamp.slice(0, 10),
      sourceType: "captureInbox",
      source: "captureInbox",
      sourceId: item.id,
      linked_partner: item.linked_partner || "",
      linked_workflow: item.linked_workflow || "",
      partnerId: item.linked_partner || "",
      nextAction: "Review routed Quick Capture task.",
      risk_level: item.inferred_type === "risk" ? "medium" : "low",
      riskLevel: item.inferred_type === "risk" ? "medium" : "low",
      review_state: "review_required",
      created_at: timestamp,
      updated_at: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      history: [{ at: timestamp, action: "created_from_quick_capture", actor: actorLabel(options) }]
    };
    task.dueDate = task.due_date;
    return { ...state, tasks: [task, ...list(state.tasks).filter(existing => existing.id !== task.id)].slice(0, 500) };
  }
  if (route === "evidenceNotes") {
    const note = {
      id: `evidence-from-${item.id}`,
      key: `evidence-from-${item.id}`,
      title: item.summary,
      type: "quick_capture_evidence_note",
      status: "review_required",
      reviewOnly: true,
      notes: item.raw_input,
      sourceType: "captureInbox",
      sourceId: item.id,
      createdAt: isoNow(options),
      updatedAt: isoNow(options)
    };
    return { ...state, evidencePackNotes: [note, ...list(state.evidencePackNotes).filter(existing => existing.id !== note.id && existing.key !== note.key)].slice(0, 500) };
  }
  return state;
}

function ignoreRoutedCaptureState(state = {}, item = {}, options = {}) {
  const timestamp = isoNow(options);
  const conversationId = `conversation-from-${item.id}`;
  return {
    ...state,
    conversationNotes: list(state.conversationNotes).map(note => note.id === conversationId
      ? {
          ...note,
          review_state: "ignored",
          ignored_at: timestamp,
          updated_at: timestamp,
          review_history: [{ at: timestamp, actor: actorLabel(options), old_state: note.review_state || "", new_state: "ignored", action: "ignored_from_capture_inbox" }, ...list(note.review_history)].slice(0, 50)
        }
      : note),
    tasks: list(state.tasks).map(task => task.sourceType === "captureInbox" && task.sourceId === item.id
      ? {
          ...task,
          status: task.status === "done" ? task.status : "dismissed",
          updatedAt: timestamp,
          history: [{ at: timestamp, action: "ignored_from_quick_capture", actor: actorLabel(options) }, ...list(task.history)].slice(0, 50)
        }
      : task)
  };
}

export function routeCaptureInboxItem(state = {}, itemId = "", action = "", options = {}) {
  const items = list(state.captureInbox);
  const current = items.find(item => item.id === itemId);
  if (!current) throw new Error("Capture Inbox item not found.");
  const timestamp = isoNow(options);
  const beforeState = current.review_state || "review_required";
  let route = actionRouteMap[action] || "";
  let reviewState = route ? "routed" : action === "mark_reviewed" ? "reviewed" : action === "ignore" ? "ignored" : "";
  if (!reviewState) throw new Error("Unsupported Capture Inbox action.");
  const routedTo = route ? [...new Set([...list(current.routed_to), route])] : list(current.routed_to);
  const updated = normalizeCaptureInboxItem({
    ...current,
    review_state: reviewState,
    routed_to: routedTo,
    updated_at: timestamp,
    review_history: [{ at: timestamp, actor: actorLabel(options), old_state: beforeState, new_state: reviewState, action, route }, ...list(current.review_history)].slice(0, 50)
  }, { ...options, now: timestamp });
  let next = upsertCapture(state, updated);
  if (route) next = routeSideEffectState(next, updated, route, options);
  if (action === "ignore") next = ignoreRoutedCaptureState(next, updated, options);
  return { state: withAuditAndActivity(next, updated, action === "ignore" ? "ignore" : action, options, beforeState), item: updated };
}
