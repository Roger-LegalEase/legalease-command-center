import {
  computeRcapPartnerJourneyHandoffReadiness,
  findRcapReviewArtifact,
  generateRcapPartnerJourneyHandoffPacket,
  rcapHandoffPacketKey,
  rcapRequiredHandoffArtifactKeys,
  rcapReviewArtifactDefinitions
} from "./review-approval-engine.mjs";

export const handoffContractVersion = "partner-journey-handoff-contract-v1";
export const handoffContractPreviewKey = "rcap-partner-journey-handoff-contract-preview-v1";

export const handoffContractRequiredTopLevelFields = [
  "handoff_packet_id",
  "handoff_contract_version",
  "generated_at",
  "generated_by",
  "source_system",
  "target_system",
  "partner_id",
  "partner_slug",
  "partner_name",
  "program_id",
  "workflow_key",
  "review_status",
  "handoff_ready",
  "manual_approval_status",
  "approved_by",
  "approved_at",
  "live_gates_count",
  "no_external_actions_confirmation"
];

export const handoffContractRequiredPartnerFields = [
  "partner_id",
  "partner_slug",
  "partner_name",
  "organization_type",
  "primary_contact_name",
  "primary_contact_email",
  "program_geography",
  "package_or_program_tier",
  "missing_partner_details"
];

export const handoffContractRequiredArtifactTypes = [
  "proposal_draft",
  "partner_page_draft",
  "dashboard_readiness",
  "weekly_report_draft",
  "evidence_note",
  "manual_review_checklist",
  "internal_handoff_packet"
];

const artifactTypeByKey = {
  "rcap-proposal-draft-v1": "proposal_draft",
  "rcap-partner-page-draft-v1": "partner_page_draft",
  "rcap-dashboard-readiness-v1": "dashboard_readiness",
  "rcap-weekly-report-draft-v1": "weekly_report_draft",
  "rcap-production-activation-evidence-v1": "evidence_note",
  "rcap-manual-review-checklist-v1": "manual_review_checklist",
  [rcapHandoffPacketKey]: "internal_handoff_packet"
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

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function unknown(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return !text || /^TBD$/i.test(text) || /review_required/i.test(text);
}

function display(value, fallback = null) {
  if (value === undefined) return fallback;
  return value;
}

function firstKnown(...values) {
  return values.find(value => !unknown(value)) ?? values.find(value => value !== undefined) ?? null;
}

function findRcapPartner(state = {}) {
  return list(state.partners).find(item => item.slug === "rcap" || item.id === "partner-rcap") || {};
}

function findRcapProgram(state = {}) {
  return list(state.partnerPrograms).find(item => item.slug === "rcap" || item.id === "partner-program-rcap") || {};
}

function routeForArtifact(type = "") {
  if (["proposal_draft", "partner_page_draft", "dashboard_readiness", "manual_review_checklist", "internal_handoff_packet"].includes(type)) return "production-activation-rcap";
  if (type === "weekly_report_draft" || type === "evidence_note") return "reports";
  return "production-activation-rcap";
}

function summarizeArtifact(artifact = {}) {
  if (artifact.summary?.answer) return artifact.summary.answer;
  if (artifact.summary) return String(artifact.summary);
  if (artifact.description) return artifact.description;
  if (artifact.sections?.objective) return artifact.sections.objective;
  if (artifact.draftContent?.pageObjective) return artifact.draftContent.pageObjective;
  if (artifact.sections?.activationSummary) return artifact.sections.activationSummary;
  if (artifact.notes) return artifact.notes;
  return "Internal RCAP handoff contract artifact.";
}

function approvalStatus(artifact = {}) {
  if (artifact.review_state === "approved") return "approved";
  if (artifact.review_state === "handoff_ready") return "handoff_ready";
  if (artifact.review_state === "blocked") return "blocked";
  if (artifact.review_state === "needs_revision") return "needs_revision";
  return "not_approved";
}

function missingDetailsForArtifact(artifact = {}) {
  const details = [
    ...list(artifact.missingDetails),
    ...list(artifact.missing_details),
    ...list(artifact.sections?.missingDetailsList),
    ...list(artifact.draftContent?.missingBrandContentAssets),
    ...list(artifact.launchBlockers)
  ].filter(Boolean);
  return [...new Set(details.map(String))];
}

function artifactRecord(def = {}, artifact = {}) {
  const artifactType = artifactTypeByKey[def.key] || artifact.artifactType || def.key;
  return {
    artifact_id: artifact.id || def.key,
    artifact_key: def.key,
    artifact_type: artifactType,
    title: artifact.title || def.title,
    review_state: artifact.review_state || "missing",
    approval_status: approvalStatus(artifact),
    approved_at: ["approved", "handoff_ready"].includes(artifact.review_state) ? artifact.review_updated_at || artifact.updatedAt || artifact.generatedAt || null : null,
    approved_by: ["approved", "handoff_ready"].includes(artifact.review_state) ? artifact.review_updated_by || null : null,
    route: routeForArtifact(artifactType),
    summary: summarizeArtifact(artifact),
    missing_details: missingDetailsForArtifact(artifact),
    blocker_reason: artifact.blocker_reason || "",
    revision_reason: artifact.revision_reason || ""
  };
}

function internalPacketRecord(state = {}) {
  const packet = list(state.partnerProgramArtifacts).find(item => item.key === rcapHandoffPacketKey)
    || generateRcapPartnerJourneyHandoffPacket(state, { now: isoNow({}) }).packet;
  const normalizedPacket = {
    ...packet,
    review_state: packet.review_state || (packet.status === "handoff_ready" ? "handoff_ready" : "review_required"),
    review_updated_at: packet.review_updated_at || packet.updatedAt || packet.generatedAt,
    review_updated_by: packet.review_updated_by || "owner_token"
  };
  return artifactRecord({ key: rcapHandoffPacketKey, title: "Internal Handoff Packet" }, normalizedPacket);
}

function partnerDataFor(state = {}) {
  const partner = findRcapPartner(state);
  const program = findRcapProgram(state);
  const missing = [
    ...list(partner.missingExternalDetailsList),
    ...list(program.missingExternalDetailsList),
    partner.missing_external_details || program.missingExternalDetails ? "partner details marked missing" : ""
  ].filter(Boolean);
  const primaryName = firstKnown(partner.primary_contact_name, partner.primaryContact, program.primaryContact, null);
  const primaryEmail = firstKnown(partner.primary_contact_email, partner.email, null);
  const geography = firstKnown(program.jurisdiction, partner.program_geography, "TBD");
  const tier = firstKnown(program.packageTier, partner.package_or_program_tier, "TBD");
  if (unknown(primaryName)) missing.push("primary_contact_name");
  if (unknown(primaryEmail)) missing.push("primary_contact_email");
  if (unknown(geography)) missing.push("program_geography");
  if (unknown(tier)) missing.push("package_or_program_tier");
  if (unknown(partner.organization_type || partner.type || partner.partnerType)) missing.push("organization_type");
  return {
    partner_id: partner.id || "partner-rcap",
    partner_slug: partner.slug || "rcap",
    partner_name: partner.name || "RCAP",
    organization_type: display(partner.organization_type || partner.type || partner.partnerType, "TBD"),
    primary_contact_name: display(primaryName, null),
    primary_contact_email: display(primaryEmail, null),
    program_geography: display(geography, "TBD"),
    package_or_program_tier: display(tier, "TBD"),
    missing_partner_details: [...new Set(missing.map(String))]
  };
}

export function buildPartnerJourneyHandoffContractPacket(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const partner = findRcapPartner(state);
  const program = findRcapProgram(state);
  const readiness = computeRcapPartnerJourneyHandoffReadiness(state);
  const partnerData = partnerDataFor(state);
  const artifacts = rcapRequiredHandoffArtifactKeys.map(key => {
    const def = rcapReviewArtifactDefinitions.find(item => item.key === key) || { key, title: key };
    const found = findRcapReviewArtifact(state, key);
    return artifactRecord(def, found?.artifact || {});
  });
  artifacts.push(internalPacketRecord(state));
  return {
    handoff_packet_id: options.handoff_packet_id || handoffContractPreviewKey,
    handoff_contract_version: handoffContractVersion,
    generated_at: generatedAt,
    generated_by: actorLabel(options),
    source_system: "legalease_os",
    target_system: "partner_journey_os",
    partner_id: partner.id || partnerData.partner_id,
    partner_slug: partner.slug || partnerData.partner_slug,
    partner_name: partner.name || partnerData.partner_name,
    program_id: program.id || "partner-program-rcap",
    workflow_key: "rcap-production-activation-v1",
    review_status: readiness.handoff_ready ? "ready_for_manual_approval" : "not_ready",
    handoff_ready: readiness.handoff_ready,
    manual_approval_status: options.manual_approval_status || options.manualApprovalStatus || "missing",
    approved_by: options.approved_by || options.approvedBy || null,
    approved_at: options.approved_at || options.approvedAt || null,
    live_gates_count: liveGatesCount(state),
    no_external_actions_confirmation: options.no_external_actions_confirmation ?? true,
    internal_only: true,
    review_only: true,
    contract_only: true,
    no_external_system_contacted: true,
    partner_data: partnerData,
    approved_artifacts: readiness.approved_artifacts,
    handoff_ready_artifacts: readiness.handoff_ready_artifacts,
    blocked_artifacts: readiness.blocked_artifacts,
    revision_required_artifacts: readiness.revision_required_artifacts,
    review_required_artifacts: readiness.review_required_artifacts,
    missing_partner_details: partnerData.missing_partner_details,
    required_manual_approvals: readiness.required_manual_approvals,
    next_manual_action: readiness.next_manual_action,
    artifacts,
    readiness
  };
}

export function validatePartnerJourneyHandoffContract(packet = {}) {
  const missingFields = [];
  const blockers = [];
  const revisions = [];
  const reviewRequired = [];
  const requiredApprovals = [];
  const safetyFailures = [];

  for (const field of handoffContractRequiredTopLevelFields) {
    if (unknown(packet[field]) && typeof packet[field] !== "boolean" && typeof packet[field] !== "number") missingFields.push(field);
  }
  if (packet.source_system !== "legalease_os") missingFields.push("source_system must be legalease_os");
  if (packet.target_system !== "partner_journey_os") missingFields.push("target_system must be partner_journey_os");

  const partnerData = packet.partner_data || {};
  for (const field of handoffContractRequiredPartnerFields) {
    if (field === "missing_partner_details") continue;
    if (unknown(partnerData[field])) missingFields.push(`partner_data.${field}`);
  }
  if (list(partnerData.missing_partner_details).length || list(packet.missing_partner_details).length) {
    missingFields.push(...[...new Set([...list(partnerData.missing_partner_details), ...list(packet.missing_partner_details)].map(item => `missing_partner_details.${item}`))]);
  }

  const artifacts = list(packet.artifacts);
  for (const type of handoffContractRequiredArtifactTypes) {
    const artifact = artifacts.find(item => item.artifact_type === type);
    if (!artifact) {
      missingFields.push(`artifacts.${type}`);
      continue;
    }
    if (artifact.review_state === "blocked") blockers.push(artifact.title || type);
    if (artifact.review_state === "needs_revision") revisions.push(artifact.title || type);
    if (["review_required", "in_review", "missing", "", undefined].includes(artifact.review_state)) reviewRequired.push(artifact.title || type);
    if (!["approved", "handoff_ready"].includes(artifact.review_state)) requiredApprovals.push(`${artifact.title || type} must be approved or handoff_ready.`);
  }

  if (packet.manual_approval_status !== "approved") requiredApprovals.push("Manual approval status must be approved.");
  if (unknown(packet.approved_by)) requiredApprovals.push("approved_by is required.");
  if (unknown(packet.approved_at)) requiredApprovals.push("approved_at is required.");
  if (packet.live_gates_count !== 0) safetyFailures.push("live_gates_count must be 0.");
  if (packet.no_external_actions_confirmation !== true) safetyFailures.push("no_external_actions_confirmation must confirm no external actions.");
  if (packet.no_external_system_contacted === false) safetyFailures.push("no external system should be contacted.");

  const valid = !missingFields.length
    && !blockers.length
    && !revisions.length
    && !reviewRequired.length
    && !requiredApprovals.length
    && !safetyFailures.length
    && packet.handoff_ready === true;

  return {
    valid,
    status: valid ? "valid" : "invalid",
    missing_fields: [...new Set(missingFields)],
    blockers,
    revisions,
    review_required: reviewRequired,
    required_approvals: [...new Set(requiredApprovals)],
    safety_failures: safetyFailures,
    required_fields_count: handoffContractRequiredTopLevelFields.length + handoffContractRequiredPartnerFields.length,
    missing_fields_count: [...new Set(missingFields)].length,
    no_external_system_contacted: true,
    live_gates_count: packet.live_gates_count ?? null
  };
}

function isSecretKey(key = "") {
  return /(secret|token|api[_-]?key|service[_-]?role|authorization|password|credential)/i.test(key);
}

function isSecretValue(value = "") {
  return /(sk-[a-z0-9_-]+|whsec_|service_role|Bearer\s+[A-Za-z0-9._-]+|OWNER_TOKEN|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY)/i.test(String(value));
}

export function redactHandoffContractJson(value) {
  if (Array.isArray(value)) return value.map(item => redactHandoffContractJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      isSecretKey(key) ? "[REDACTED]" : redactHandoffContractJson(item)
    ]));
  }
  if (typeof value === "string" && isSecretValue(value)) return "[REDACTED]";
  return value;
}

export function latestHandoffContractPreview(state = {}) {
  return list(state.handoffContractPreviews)
    .slice()
    .sort((a, b) => String(b.updated_at || b.generated_at || "").localeCompare(String(a.updated_at || a.generated_at || "")))[0] || null;
}

export function generatePartnerJourneyHandoffContractPreview(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const actor = actorLabel(options);
  const packet = buildPartnerJourneyHandoffContractPacket(state, { ...options, now: generatedAt, actor });
  const validation = validatePartnerJourneyHandoffContract(packet);
  const preview = {
    id: handoffContractPreviewKey,
    key: handoffContractPreviewKey,
    title: "Partner Journey Handoff Contract Preview",
    artifactType: "handoff_contract_preview",
    type: "handoff_contract_preview",
    status: validation.valid ? "valid" : "validation_failed",
    review_state: validation.valid ? "approved" : "review_required",
    reviewOnly: true,
    internalOnly: true,
    contractOnly: true,
    noExternalSystemContacted: true,
    externalActionsAllowed: false,
    partnerSlug: "rcap",
    partnerProgramId: "partner-program-rcap",
    proof_category: "operating",
    generated_at: generatedAt,
    updated_at: generatedAt,
    generatedAt,
    updatedAt: generatedAt,
    contract_version: handoffContractVersion,
    validation,
    packet: redactHandoffContractJson(packet),
    json_preview: redactHandoffContractJson(packet),
    summary: validation.valid
      ? "Handoff contract preview validates internally. No external system contacted."
      : `Handoff contract preview failed validation with ${validation.missing_fields_count} missing field(s). No external system contacted.`,
    next_manual_action: validation.valid ? "Roger can review the contract before any future Partner Journey handoff." : validation.required_approvals[0] || validation.safety_failures[0] || validation.missing_fields[0] || "Review contract validation failures."
  };
  const next = {
    ...state,
    handoffContractPreviews: [preview, ...list(state.handoffContractPreviews).filter(item => item.key !== handoffContractPreviewKey && item.id !== handoffContractPreviewKey)].slice(0, 25)
  };
  next.auditHistory = [{
    id: `audit-${handoffContractPreviewKey}-${Date.parse(generatedAt) || Date.now()}`,
    timestamp: generatedAt,
    actor,
    action: "partner journey handoff contract preview generated",
    resourceType: "handoff_contract_preview",
    resourceId: handoffContractPreviewKey,
    beforeValue: null,
    afterValue: {
      validation_status: validation.status,
      missing_fields_count: validation.missing_fields_count,
      live_gates_count: validation.live_gates_count,
      no_external_system_contacted: true
    }
  }, ...list(state.auditHistory)];
  next.activityEvents = [{
    id: `activity-${handoffContractPreviewKey}-${Date.parse(generatedAt) || Date.now()}`,
    eventType: "Partner Journey handoff contract preview generated",
    title: validation.valid ? "Handoff contract preview valid" : "Handoff contract preview needs review",
    summary: preview.summary,
    relatedObjectType: "handoff_contract_preview",
    relatedObjectId: handoffContractPreviewKey,
    riskLevel: validation.valid ? "medium" : "high",
    metadata: { validationStatus: validation.status, externalSideEffects: false, noExternalSystemContacted: true, liveGatesCount: validation.live_gates_count },
    createdAt: generatedAt
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, preview, packet, validation };
}

export function handoffContractStatus(state = {}, options = {}) {
  const latest = latestHandoffContractPreview(state);
  const packet = latest?.packet || buildPartnerJourneyHandoffContractPacket(state, options);
  const validation = latest?.validation || validatePartnerJourneyHandoffContract(packet);
  return {
    contract_status: latest ? latest.status : "not_generated",
    contract_version: handoffContractVersion,
    required_fields_count: validation.required_fields_count,
    missing_fields_count: validation.missing_fields_count,
    latest_validation_result: validation.valid ? "valid" : "invalid",
    latest_generated_at: latest?.updated_at || latest?.generated_at || "",
    warning: packet.handoff_ready && !validation.valid ? "Handoff packet is marked ready but contract validation fails." : "",
    no_external_system_contacted: true,
    live_gates_count: liveGatesCount(state)
  };
}
