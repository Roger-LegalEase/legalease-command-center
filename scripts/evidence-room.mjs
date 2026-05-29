export const noExternalActionsConfirmation = "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no external systems contacted.";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function dateKey(options = {}) {
  return options.date || isoNow(options).slice(0, 10);
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function stableId(prefix = "evidence", value = "", index = 0) {
  return `${prefix}-${String(value || index).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90)}`;
}

function firstValue(item = {}, fields = []) {
  for (const field of fields) {
    const value = item?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function latestDate(item = {}) {
  return firstValue(item, ["updated_at", "updatedAt", "generated_at", "generatedAt", "created_at", "createdAt", "timestamp", "collectionDate", "lastUpdated", "date"]) || "";
}

function daysBetween(now = "", value = "") {
  const left = new Date(now).getTime();
  const right = new Date(value).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
  return Math.floor((left - right) / 86400000);
}

function normalizeStatus(value = "") {
  return String(value || "not_recorded").toLowerCase().replace(/\s+/g, "_");
}

function titleIncludes(item = {}, pattern) {
  return pattern.test([item.title, item.reportTitle, item.evidenceTitle, item.key, item.id, item.source, item.section, item.category, item.type, item.artifactType].filter(Boolean).join(" "));
}

function inferSource(item = {}, fallback = "Operating Proof") {
  if (titleIncludes(item, /rcap.*production|production.*activation/i)) return "RCAP Production Activation";
  if (titleIncludes(item, /rcap.*review|review.*workspace/i)) return "RCAP Review Workspace";
  if (titleIncludes(item, /approval|review_state|needs_revision|handoff_ready/i)) return "Review Approval Engine";
  if (titleIncludes(item, /handoff/i)) return "Handoff Readiness";
  if (titleIncludes(item, /daily operating loop/i)) return "Daily Operating Loop";
  if (titleIncludes(item, /operating memory/i)) return "Operating Memory";
  if (titleIncludes(item, /daily closeout|tomorrow plan/i)) return "Daily Closeout";
  if (titleIncludes(item, /task/i)) return "Task Management";
  if (titleIncludes(item, /partner program|proposal|partner page|dashboard|weekly report|final report/i)) return "Partner Program Engine";
  if (titleIncludes(item, /soc ?2|readiness/i)) return "SOC 2 Readiness";
  return fallback;
}

function inferProofCategory(item = {}, source = "") {
  const text = [source, item.title, item.reportTitle, item.evidenceTitle, item.section, item.category, item.itemType, item.reportType, item.type, item.notes].filter(Boolean).join(" ").toLowerCase();
  if (/soc ?2|readiness|compliance|control|audit/.test(text)) return /audit/.test(text) ? "audit" : "compliance";
  if (/investor|diligence|data room|traction|revenue|pipeline/.test(text)) return "investor";
  if (/partner|rcap|proposal|dashboard|weekly report|final report|handoff/.test(text)) return "partner";
  if (/audit|activity|event|history/.test(text)) return "audit";
  return "operating";
}

function routeForSource(source = "", item = {}) {
  if (/RCAP|Handoff|Review Approval/i.test(source)) return "production-activation-rcap";
  if (/Data Room/i.test(source)) return "dataroom";
  if (/Reports/i.test(source) || /report/i.test(item.reportType || item.type || "")) return "reports";
  if (/SOC 2/i.test(source)) return "soc2-evidence";
  if (/Task/i.test(source)) return "tasks";
  if (/Operating Memory/i.test(source)) return "operating-memory";
  if (/Daily Closeout/i.test(source)) return "daily-closeout";
  return "evidence-room";
}

function makeEvidenceItem(raw = {}, defaults = {}) {
  const source = defaults.source || inferSource(raw, defaults.fallbackSource || "Operating Proof");
  const title = firstValue(raw, ["title", "reportTitle", "evidenceTitle", "artifactName", "action", "eventType"]) || defaults.title || "Evidence item";
  const id = String(firstValue(raw, ["id", "key"]) || stableId(defaults.type || "evidence", title, defaults.index));
  const type = defaults.type || firstValue(raw, ["type", "itemType", "reportType", "artifactType", "resourceType"]) || "evidence";
  const date = latestDate(raw);
  const proofCategory = defaults.proof_category || inferProofCategory(raw, source);
  return {
    id,
    title,
    type: normalizeStatus(type),
    source,
    linked_workflow: defaults.linked_workflow || raw.linked_workflow || raw.workflow || raw.activationKey || raw.reportType || "",
    linked_partner_program: raw.partnerSlug || raw.partnerId || raw.programSlug || raw.programId || defaults.linked_partner_program || "",
    date,
    status: normalizeStatus(firstValue(raw, ["status", "evidenceStatus", "overall_status"]) || defaults.status || "recorded"),
    review_state: normalizeStatus(raw.review_state || raw.reviewState || ""),
    proof_value: raw.proofValue || raw.diligenceValue || raw.proofScore || defaults.proof_value || proofCategory,
    route: defaults.route || routeForSource(source, raw),
    tags: [...new Set(list(raw.tags).concat([proofCategory, raw.status, raw.review_state, raw.section, raw.category, raw.controlArea].filter(Boolean).map(String)))],
    proof_category: proofCategory,
    summary: firstValue(raw, ["summary", "notes", "reviewNotes", "nextAction", "detail", "description"]) || defaults.summary || "",
    missing_details: list(raw.missing_details || raw.missingDetails || raw.missingExternalDetailsList),
    next_manual_action: firstValue(raw, ["nextManualAction", "nextAction", "suggestedAction"]) || defaults.next_manual_action || "Review internally before using externally.",
    export_eligibility: defaults.export_eligibility || (proofCategory === "audit" ? "internal_review_only" : "review_only"),
    raw_source_id: id
  };
}

function uniqueById(items = []) {
  const seen = new Set();
  const output = [];
  for (const item of list(items)) {
    const key = `${item.source}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function groupBy(items = [], field = "source") {
  const map = new Map();
  for (const item of list(items)) {
    const key = item[field] || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([key, values]) => ({ [field]: key, count: values.length, items: values }));
}

function dataRoomCategory(item = {}) {
  const text = [item.section, item.category, item.itemType, item.title, item.notes, item.proof_category].filter(Boolean).join(" ").toLowerCase();
  if (/rcap/.test(text)) return "RCAP proof";
  if (/soc ?2|readiness|compliance|security/.test(text)) return "SOC 2 readiness";
  if (/partner|pilot|campaign|proposal|dashboard/.test(text)) return "partner proof";
  if (/investor|diligence|traction|revenue|pipeline|acquisition/.test(text)) return "investor proof";
  return "operating proof";
}

export function buildEvidenceIndex(state = {}, options = {}) {
  const now = isoNow(options);
  const evidenceItems = [];
  let index = 0;
  const add = (item) => evidenceItems.push(makeEvidenceItem(item.raw || item, { ...item.defaults, index: index++ }));

  for (const item of list(state.evidencePackNotes)) add({ raw: item, defaults: { source: inferSource(item, "RCAP Production Activation"), type: item.type || "evidence_note", route: "reports" } });
  for (const item of list(state.reports)) add({ raw: item, defaults: { source: /rcap/i.test(item.key || item.title || "") ? "RCAP Production Activation" : "Reports", type: item.reportType || "report", route: "reports" } });
  for (const item of uniqueById([...(list(state.dataRoomItems)), ...(list(state.dataRoom))])) add({ raw: item, defaults: { source: "Data Room", type: item.itemType || "data_room_item", route: "dataroom", proof_category: dataRoomCategory(item).replace(" proof", "").replace(" readiness", "") } });
  for (const item of list(state.soc2Evidence)) add({ raw: item, defaults: { source: "SOC 2 Readiness", type: "readiness_artifact", route: "soc2-evidence", proof_category: "compliance" } });
  for (const item of list(state.partnerProgramArtifacts)) add({ raw: item, defaults: { source: inferSource(item, "Partner Program Engine"), type: item.artifactType || "partner_program_artifact", route: /rcap/i.test(item.key || "") ? "production-activation-rcap" : "partner-programs" } });
  for (const item of list(state.handoffContractPreviews)) add({ raw: item, defaults: { source: "Partner Journey Handoff Contract", type: "handoff_contract_preview", route: "handoff-contract", proof_category: "operating" } });
  for (const item of list(state.handoffPackets)) add({ raw: item, defaults: { source: "Handoff Readiness", type: "handoff_packet", route: "production-activation-rcap", proof_category: "partner" } });
  for (const item of list(state.productionActivationRuns)) add({ raw: item, defaults: { source: "RCAP Production Activation", type: "production_activation_run", route: "production-activation-rcap", proof_category: "partner" } });
  for (const item of list(state.operatingMemory)) add({ raw: item, defaults: { source: "Operating Memory", type: "operating_memory", route: "operating-memory", proof_category: "operating" } });
  for (const item of list(state.dailyCloseouts)) add({ raw: item, defaults: { source: "Daily Closeout", type: "daily_closeout", route: "daily-closeout", proof_category: "operating" } });
  for (const item of list(state.tasks)) add({ raw: item, defaults: { source: "Task Management", type: "task", route: "tasks", proof_category: "operating" } });
  for (const item of list(state.auditHistory).slice(0, 80)) add({ raw: item, defaults: { source: "Audit History", type: "audit_history", route: "os-health", proof_category: "audit", summary: [item.resourceType, item.resourceId].filter(Boolean).join(" · ") } });
  for (const item of list(state.activityEvents).slice(0, 80)) add({ raw: item, defaults: { source: "Activity Events", type: "activity_event", route: "os-health", proof_category: "audit", summary: item.summary || item.eventType || "" } });

  const items = uniqueById(evidenceItems).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const dataRoomItems = items.filter(item => item.source === "Data Room");
  const dataRoomIndex = ["investor proof", "partner proof", "SOC 2 readiness", "operating proof", "RCAP proof"].map(category => ({
    category,
    items: dataRoomItems.filter(item => dataRoomCategory(item).toLowerCase() === category.toLowerCase()),
    count: dataRoomItems.filter(item => dataRoomCategory(item).toLowerCase() === category.toLowerCase()).length
  }));
  const filters = {
    types: [...new Set(items.map(item => item.type).filter(Boolean))].sort(),
    sources: [...new Set(items.map(item => item.source).filter(Boolean))].sort(),
    statuses: [...new Set(items.map(item => item.status).filter(Boolean))].sort(),
    review_states: [...new Set(items.map(item => item.review_state).filter(Boolean))].sort(),
    partner_programs: [...new Set(items.map(item => item.linked_partner_program).filter(Boolean))].sort(),
    proof_categories: [...new Set(items.map(item => item.proof_category).filter(Boolean))].sort()
  };
  return {
    generated_at: now,
    items,
    sources: groupBy(items, "source"),
    data_room_index: dataRoomIndex,
    filters
  };
}

export function buildEvidenceOverview(state = {}, options = {}) {
  const now = isoNow(options);
  const index = buildEvidenceIndex(state, options);
  const items = index.items;
  const recent = items.filter(item => item.date && daysBetween(now, item.date) <= 7);
  const openReview = items.filter(item => ["review_required", "needs_revision", "blocked", "in_review"].includes(item.review_state) || ["draft", "ready_for_review"].includes(item.status));
  const rcapCount = items.filter(item => /rcap/i.test([item.title, item.source, item.linked_partner_program, item.linked_workflow].join(" "))).length;
  const partnerCount = items.filter(item => item.proof_category === "partner").length;
  const soc2Count = items.filter(item => item.source === "SOC 2 Readiness" || /soc ?2/i.test(item.title)).length;
  const warnings = [
    !rcapCount ? "No RCAP proof has been indexed yet." : "",
    !partnerCount ? "No partner proof has been indexed yet." : "",
    !soc2Count ? "No SOC 2 readiness evidence has been indexed yet." : "",
    !list(state.dataRoomItems).length ? "No Data Room artifacts are indexed yet." : "",
    !recent.length ? "No evidence has been updated in the last 7 days." : "",
    openReview.length ? `${openReview.length} evidence item(s) still need review or revision.` : ""
  ].filter(Boolean);
  const lastEvidenceUpdate = items.map(item => item.date).filter(Boolean).sort().at(-1) || "";
  return {
    total_evidence_items: items.length,
    recent_evidence_items: recent.length,
    open_review_items: openReview.length,
    rcap_evidence_count: rcapCount,
    partner_evidence_count: partnerCount,
    soc2_readiness_evidence_count: soc2Count,
    data_room_item_count: list(state.dataRoomItems).length,
    report_count: list(state.reports).length,
    last_evidence_update: lastEvidenceUpdate,
    missing_proof_warnings: warnings,
    stale_evidence_warnings: recent.length ? [] : ["Evidence has not been updated in the last 7 days."]
  };
}

export function generateEvidenceSummary(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const date = dateKey({ ...options, now: generatedAt });
  const key = `evidence-summary-${date}`;
  const overview = buildEvidenceOverview(state, { ...options, now: generatedAt });
  const index = buildEvidenceIndex(state, { ...options, now: generatedAt });
  const liveGates = liveGatesCount(state);
  const summary = {
    id: key,
    key,
    title: `LegalEase Evidence Summary - ${date}`,
    type: "evidence_summary",
    status: "review_ready",
    review_state: "review_required",
    review_only: true,
    generated_at: generatedAt,
    updated_at: generatedAt,
    overview,
    evidence_sources: index.sources.map(item => ({ source: item.source, count: item.count })),
    data_room_index: index.data_room_index.map(item => ({ category: item.category, count: item.count })),
    top_evidence_items: index.items.slice(0, 12).map(item => ({
      id: item.id,
      title: item.title,
      source: item.source,
      proof_category: item.proof_category,
      status: item.status,
      review_state: item.review_state,
      route: item.route
    })),
    missing_proof_warnings: overview.missing_proof_warnings,
    stale_evidence_warnings: overview.stale_evidence_warnings,
    live_gates_count: liveGates,
    external_side_effects: false,
    no_external_actions_confirmation: noExternalActionsConfirmation,
    next_manual_action: overview.missing_proof_warnings[0] || "Review the Evidence Room before sharing any proof externally."
  };
  const next = {
    ...state,
    evidenceSummaries: [summary, ...list(state.evidenceSummaries).filter(item => item.key !== key && item.id !== key)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${key}-${Date.parse(generatedAt) || Date.now()}`,
    timestamp: generatedAt,
    actor: options.actor || "owner_token",
    action: "evidence summary generated",
    resourceType: "evidence_summary",
    resourceId: key,
    beforeValue: null,
    afterValue: {
      total_evidence_items: overview.total_evidence_items,
      open_review_items: overview.open_review_items,
      live_gates_count: liveGates
    }
  }, ...list(state.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: `activity-${key}-${Date.parse(generatedAt) || Date.now()}`,
    eventType: "Evidence Summary generated",
    title: "Evidence Summary generated",
    summary: `Evidence Summary generated with ${overview.total_evidence_items} evidence item(s). No external action was taken.`,
    relatedObjectType: "evidence_summary",
    relatedObjectId: key,
    riskLevel: overview.open_review_items ? "medium" : "low",
    metadata: { liveGatesCount: liveGates, externalSideEffects: false },
    createdAt: generatedAt
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, summary, index, overview };
}

export function latestEvidenceSummary(state = {}) {
  return list(state.evidenceSummaries).slice().sort((a, b) => String(b.updated_at || b.generated_at || "").localeCompare(String(a.updated_at || a.generated_at || "")))[0] || null;
}
