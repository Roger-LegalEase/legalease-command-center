const allowedClassifications = [
  "decision",
  "task",
  "blocker",
  "risk",
  "carry_forward",
  "resurface_tomorrow",
  "do_not_touch",
  "context",
  "reflection",
  "brief_update"
];

const actionStateMap = {
  mark_reviewed: "reviewed",
  apply_morning_brief: "applied_morning_brief",
  apply_evening_reflection: "applied_evening_reflection",
  carry_forward: "carry_forward",
  ignore: "ignored"
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
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "conversation-note";
}

function includesAny(text = "", patterns = []) {
  return patterns.some(pattern => pattern.test(text));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function contextItem(title, detail, options = {}) {
  return {
    title,
    detail,
    source: options.source || "conversation_note",
    href: options.href || "conversation-notes",
    note_id: options.note_id || ""
  };
}

export function classifyConversationNote(input = {}) {
  const raw = String(input.raw_note || input.rawNote || "").trim();
  const lower = raw.toLowerCase();
  const classification = [];
  if (includesAny(lower, [/decision|decide|approved|approval/])) classification.push("decision");
  if (includesAny(lower, [/task|todo|follow up|next step|action/])) classification.push("task");
  if (includesAny(lower, [/block|blocked|waiting|missing|stuck/])) classification.push("blocker");
  if (includesAny(lower, [/risk|legal|compliance|unsafe|concern/])) classification.push("risk");
  if (includesAny(lower, [/carry forward|tomorrow|next day|keep/])) classification.push("carry_forward");
  if (includesAny(lower, [/resurface|remind|tomorrow/])) classification.push("resurface_tomorrow");
  if (includesAny(lower, [/do not touch|don't touch|ignore|avoid|not today|live publishing/])) classification.push("do_not_touch");
  if (includesAny(lower, [/reflection|learned|felt|worked|didn't work/])) classification.push("reflection");
  if (includesAny(lower, [/brief|morning|top 3|first move|focus/])) classification.push("brief_update");
  if (!classification.length) classification.push("context");

  const summary = raw.length > 180 ? `${raw.slice(0, 177).trim()}...` : raw || "Conversation note captured for review.";
  const linked = [input.linked_workflow, input.linked_partner].filter(Boolean).join(" / ");
  const title = linked ? `${linked}: ${summary}` : summary;
  return {
    summary,
    classification: unique(classification.filter(item => allowedClassifications.includes(item))),
    suggested_brief_updates: classification.some(item => ["decision", "task", "blocker", "brief_update", "carry_forward"].includes(item))
      ? [contextItem(title, "Needs review before it changes tomorrow's brief.", { note_id: input.id || "" })]
      : [],
    suggested_reflection_updates: classification.some(item => ["decision", "reflection", "carry_forward", "resurface_tomorrow", "do_not_touch", "risk"].includes(item))
      ? [contextItem(title, "Capture this as an evening reflection input after review.", { note_id: input.id || "" })]
      : [],
    carry_forward: classification.includes("carry_forward") || classification.includes("task") ? [contextItem(title, "Carry this forward as an internal operating input.", { note_id: input.id || "" })] : [],
    resurface_tomorrow: classification.includes("resurface_tomorrow") || /tomorrow/i.test(raw) ? [contextItem(title, "Resurface this tomorrow after Roger reviews it.", { note_id: input.id || "" })] : [],
    do_not_touch: classification.includes("do_not_touch") ? [contextItem(title, "Do not let this distract Roger until explicitly revisited.", { note_id: input.id || "" })] : [],
    risk_notes: classification.includes("risk") || classification.includes("blocker") ? [contextItem(title, "Conversation note contains risk, blocker, or missing-detail signal.", { note_id: input.id || "" })] : []
  };
}

export function normalizeConversationNote(input = {}, options = {}) {
  const timestamp = isoNow(options);
  const id = input.id || `conversation-note-${Date.parse(timestamp) || Date.now()}-${slug(input.source_label || input.linked_workflow || "manual")}`;
  const classified = classifyConversationNote({ ...input, id });
  return {
    id,
    date: input.date || timestamp.slice(0, 10),
    source_type: "manual_conversation_capture",
    source_label: input.source_label || input.sourceLabel || "Manual conversation capture",
    raw_note: String(input.raw_note || input.rawNote || "").trim(),
    summary: input.summary || classified.summary,
    classification: list(input.classification).length ? list(input.classification).filter(item => allowedClassifications.includes(item)) : classified.classification,
    priority: input.priority || "medium",
    linked_workflow: input.linked_workflow || input.linkedWorkflow || "",
    linked_partner: input.linked_partner || input.linkedPartner || "",
    suggested_brief_updates: list(input.suggested_brief_updates).length ? list(input.suggested_brief_updates) : classified.suggested_brief_updates,
    suggested_reflection_updates: list(input.suggested_reflection_updates).length ? list(input.suggested_reflection_updates) : classified.suggested_reflection_updates,
    carry_forward: list(input.carry_forward).length ? list(input.carry_forward) : classified.carry_forward,
    resurface_tomorrow: list(input.resurface_tomorrow).length ? list(input.resurface_tomorrow) : classified.resurface_tomorrow,
    do_not_touch: list(input.do_not_touch).length ? list(input.do_not_touch) : classified.do_not_touch,
    risk_notes: list(input.risk_notes).length ? list(input.risk_notes) : classified.risk_notes,
    review_state: input.review_state || "review_required",
    applied_to_morning_brief: Boolean(input.applied_to_morning_brief),
    applied_to_evening_reflection: Boolean(input.applied_to_evening_reflection),
    ignored_at: input.ignored_at || "",
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at || timestamp,
    review_history: list(input.review_history)
  };
}

function withAuditAndActivity(state = {}, note = {}, action = "", options = {}, beforeState = "") {
  const timestamp = isoNow(options);
  const actor = actorLabel(options);
  const auditAction = action === "save"
    ? "conversation note saved"
    : action === "ignore"
      ? "conversation note ignored"
      : "conversation note updated";
  const eventType = action === "save"
    ? "Conversation note saved"
    : action === "ignore"
      ? "Conversation note ignored"
      : "Conversation note updated";
  return {
    ...state,
    auditHistory: [{
      id: `audit-${note.id}-${action}-${Date.parse(timestamp) || Date.now()}`,
      timestamp,
      actor,
      action: auditAction,
      resourceType: "conversation_note",
      resourceId: note.id,
      beforeValue: { review_state: beforeState || "" },
      afterValue: { review_state: note.review_state, action }
    }, ...list(state.auditHistory)].slice(0, 1000),
    activityEvents: [{
      id: `activity-${note.id}-${action}-${Date.parse(timestamp) || Date.now()}`,
      eventType,
      title: note.summary,
      relatedObjectType: "conversation_note",
      relatedObjectId: note.id,
      riskLevel: note.classification.includes("risk") ? "medium" : "low",
      metadata: { reviewState: note.review_state, externalSideEffects: false, noExternalSystemsContacted: true },
      createdAt: timestamp
    }, ...list(state.activityEvents)].slice(0, 500)
  };
}

export function createConversationNote(state = {}, input = {}, options = {}) {
  const note = normalizeConversationNote(input, options);
  const next = {
    ...state,
    conversationNotes: [note, ...list(state.conversationNotes).filter(item => item.id !== note.id)].slice(0, 500)
  };
  return { state: withAuditAndActivity(next, note, "save", options), note };
}

export function updateConversationNoteAction(state = {}, noteId = "", action = "", options = {}) {
  const nextState = actionStateMap[action];
  if (!nextState) throw new Error("Unsupported conversation note action.");
  const notes = list(state.conversationNotes);
  const index = notes.findIndex(note => note.id === noteId);
  if (index < 0) throw new Error("Conversation note not found.");
  const timestamp = isoNow(options);
  const before = notes[index];
  const updated = normalizeConversationNote({
    ...before,
    review_state: nextState,
    applied_to_morning_brief: before.applied_to_morning_brief || action === "apply_morning_brief",
    applied_to_evening_reflection: before.applied_to_evening_reflection || action === "apply_evening_reflection",
    ignored_at: action === "ignore" ? timestamp : before.ignored_at,
    updated_at: timestamp,
    review_history: [{ at: timestamp, actor: actorLabel(options), old_state: before.review_state, new_state: nextState, action }, ...list(before.review_history)].slice(0, 50)
  }, { ...options, now: timestamp });
  const nextNotes = [...notes];
  nextNotes[index] = updated;
  const next = { ...state, conversationNotes: nextNotes };
  return { state: withAuditAndActivity(next, updated, action, options, before.review_state), note: updated };
}

function noteActive(note = {}) {
  return note.review_state !== "ignored" && !note.ignored_at;
}

function noteReviewed(note = {}) {
  return ["reviewed", "applied_morning_brief", "applied_evening_reflection", "carry_forward"].includes(note.review_state)
    || note.applied_to_morning_brief
    || note.applied_to_evening_reflection;
}

function captureClassification(item = {}) {
  const type = item.inferred_type || item.capture_type || "context";
  if (type === "brief_input") return ["brief_update"];
  if (type === "reflection_input") return ["reflection"];
  if (type === "conversation_note") return ["context"];
  if (type === "partner_update") return ["context"];
  if (type === "evidence_note") return ["context"];
  if (type === "do_not_touch") return ["do_not_touch"];
  if (allowedClassifications.includes(type)) return [type];
  return ["context"];
}

function captureToConversationInput(item = {}) {
  const classification = captureClassification(item);
  const summary = item.summary || item.raw_input || "Quick Capture item";
  const title = [item.linked_workflow, item.linked_partner].filter(Boolean).join(" / ");
  const scopedTitle = title ? `${title}: ${summary}` : summary;
  const context = (detail, source = "capture_inbox") => contextItem(scopedTitle, detail, {
    source,
    href: "capture-inbox",
    note_id: item.id
  });
  const routedTo = list(item.routed_to);
  const appliedMorning = routedTo.includes("morningBriefInputs");
  const appliedEvening = routedTo.includes("eveningReflectionInputs");
  return {
    id: item.id,
    date: item.date,
    source_type: "manual_quick_capture",
    source_label: item.source_label || "Quick Capture",
    raw_note: item.raw_input || "",
    summary,
    classification,
    priority: item.priority || "medium",
    linked_workflow: item.linked_workflow || "",
    linked_partner: item.linked_partner || "",
    suggested_brief_updates: classification.some(value => ["decision", "task", "blocker", "brief_update", "carry_forward"].includes(value)) || appliedMorning
      ? [context(appliedMorning ? "Routed to Morning Brief inputs." : "Needs review before it changes tomorrow's brief.")]
      : [],
    suggested_reflection_updates: classification.some(value => ["decision", "reflection", "carry_forward", "do_not_touch", "risk"].includes(value)) || appliedEvening
      ? [context(appliedEvening ? "Routed to Evening Reflection inputs." : "Capture this as an evening reflection input after review.")]
      : [],
    carry_forward: classification.includes("carry_forward") || routedTo.includes("operatingMemory") ? [context("Carry this Quick Capture forward internally.")] : [],
    resurface_tomorrow: /tomorrow|resurface/i.test(item.raw_input || "") ? [context("Resurface this Quick Capture tomorrow.")] : [],
    do_not_touch: classification.includes("do_not_touch") ? [context("Do not let this distract Roger until explicitly revisited.")] : [],
    risk_notes: classification.includes("risk") || classification.includes("blocker") ? [context("Quick Capture contains risk, blocker, or missing-detail signal.")] : [],
    review_state: item.review_state === "routed" ? "reviewed" : item.review_state,
    applied_to_morning_brief: appliedMorning,
    applied_to_evening_reflection: appliedEvening,
    ignored_at: item.review_state === "ignored" ? item.updated_at || item.created_at : "",
    created_at: item.created_at,
    updated_at: item.updated_at
  };
}

export function conversationOperatingInputs(state = {}, options = {}) {
  const includeNeedsReview = Boolean(options.includeNeedsReview);
  const captureNotes = list(state.captureInbox)
    .filter(item => item.review_state !== "ignored")
    .map(captureToConversationInput);
  const notes = [...list(state.conversationNotes), ...captureNotes].filter(noteActive);
  const usable = notes.filter(note => noteReviewed(note) || includeNeedsReview);
  const toItems = (field, filter = () => true) => usable.filter(filter).flatMap(note => list(note[field]).map(item => ({ ...item, note_id: note.id, source: "conversation_note" })));
  return {
    notes,
    reviewedOrApplied: notes.filter(noteReviewed),
    needsReview: notes.filter(note => !noteReviewed(note)),
    briefItems: toItems("suggested_brief_updates", note => note.applied_to_morning_brief || note.review_state === "reviewed" || note.review_state === "carry_forward" || includeNeedsReview),
    reflectionItems: toItems("suggested_reflection_updates", note => note.applied_to_evening_reflection || note.review_state === "reviewed" || note.review_state === "carry_forward" || includeNeedsReview),
    carryForward: toItems("carry_forward"),
    resurfaceTomorrow: toItems("resurface_tomorrow"),
    doNotTouch: toItems("do_not_touch"),
    riskNotes: toItems("risk_notes")
  };
}

export function buildMorningBrief(state = {}) {
  const inputs = conversationOperatingInputs(state, { includeNeedsReview: true });
  const applied = inputs.briefItems.filter(item => {
    const note = inputs.notes.find(entry => entry.id === item.note_id);
    return note?.applied_to_morning_brief || note?.review_state === "reviewed" || note?.review_state === "carry_forward";
  });
  const needsReview = inputs.needsReview.map(note => contextItem(
    note.summary,
    "Needs review before it changes tomorrow's brief.",
    { note_id: note.id, source: "conversation_note", href: "conversation-notes" }
  ));
  return {
    mission_today: applied[0]?.title || "Run the internal operating loop from reviewed Command Center state.",
    top_3_actions: [...applied, ...needsReview].slice(0, 3),
    decisions_needed: inputs.reviewedOrApplied.filter(note => note.classification.includes("decision")).map(note => contextItem(note.summary, "Conversation-derived decision input.", { note_id: note.id })),
    waiting_on: inputs.reviewedOrApplied.filter(note => note.classification.includes("blocker")).map(note => contextItem(note.summary, "Conversation-derived blocker input.", { note_id: note.id })),
    risks: inputs.riskNotes,
    do_not_touch: inputs.doNotTouch,
    suggested_first_move: applied[0]?.detail || "Review conversation notes before they change the brief."
  };
}

export function buildEveningReflection(state = {}) {
  const inputs = conversationOperatingInputs(state, { includeNeedsReview: false });
  return {
    what_moved_today: inputs.reflectionItems,
    decisions_made: inputs.reviewedOrApplied.filter(note => note.classification.includes("decision")).map(note => contextItem(note.summary, "Conversation-derived decision captured.", { note_id: note.id })),
    state_changes: inputs.reviewedOrApplied.map(note => contextItem(note.summary, `Review state: ${note.review_state}.`, { note_id: note.id })).slice(0, 5),
    blockers_remaining: inputs.reviewedOrApplied.filter(note => note.classification.includes("blocker")).map(note => contextItem(note.summary, "Conversation-derived blocker remains.", { note_id: note.id })),
    carry_forward: inputs.carryForward,
    resurface_tomorrow: inputs.resurfaceTomorrow,
    do_not_carry_forward: inputs.doNotTouch,
    notes_for_tomorrow: [...inputs.resurfaceTomorrow, ...inputs.carryForward].slice(0, 5)
  };
}
