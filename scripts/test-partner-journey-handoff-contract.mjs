#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvidenceIndex } from "./evidence-room.mjs";
import { buildOsHealthSnapshot } from "./os-health.mjs";
import { ensureRcapProductionActivation } from "./production-activation.mjs";
import {
  computeRcapPartnerJourneyHandoffReadiness,
  generateRcapPartnerJourneyHandoffPacket,
  rcapRequiredHandoffArtifactKeys,
  transitionRcapReviewArtifact
} from "./review-approval-engine.mjs";
import {
  buildPartnerJourneyHandoffContractPacket,
  generatePartnerJourneyHandoffContractPreview,
  handoffContractRequiredArtifactTypes,
  handoffContractRequiredPartnerFields,
  handoffContractRequiredTopLevelFields,
  handoffContractVersion,
  redactHandoffContractJson,
  validatePartnerJourneyHandoffContract
} from "./partner-journey-handoff-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");
const contractSource = readFileSync(join(here, "partner-journey-handoff-contract.mjs"), "utf8");

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function approveRequiredArtifacts(state, options = {}) {
  let next = state;
  for (const key of rcapRequiredHandoffArtifactKeys) {
    next = transitionRcapReviewArtifact(next, key, "approved", {
      now: options.now || "2026-05-29T12:10:00.000Z",
      actor: options.actor || "contract_qa",
      notes: "Approved for handoff contract validation."
    }).state;
  }
  return next;
}

function completePartnerDetails(state) {
  return {
    ...state,
    partners: (state.partners || []).map(partner => partner.slug === "rcap" ? {
      ...partner,
      missing_external_details: false,
      missingExternalDetailsList: [],
      organization_type: "nonprofit",
      primaryContact: "Reviewed RCAP Contact",
      primary_contact_name: "Reviewed RCAP Contact",
      email: "review-required@example.invalid",
      primary_contact_email: "review-required@example.invalid",
      website: "https://review-required.example.invalid",
      stakeholders: ["Reviewed approval authority"]
    } : partner),
    partnerPrograms: (state.partnerPrograms || []).map(program => program.slug === "rcap" ? {
      ...program,
      missingExternalDetails: false,
      packageTier: "implementation",
      jurisdiction: "Georgia",
      targetAudience: "review_required",
      primaryContact: "Reviewed RCAP Contact"
    } : program)
  };
}

function baseState() {
  return {
    runtime: {
      livePostingGates: {
        linkedin: { enabled: false },
        facebook: { enabled: false },
        instagram: { enabled: false },
        tiktok: { enabled: false },
        x: { enabled: false }
      }
    },
    partners: [],
    tasks: [],
    partnerPrograms: [],
    partnerProgramArtifacts: [],
    reports: [],
    dataRoomItems: [],
    evidencePackNotes: [],
    handoffContractPreviews: [],
    auditHistory: [],
    activityEvents: []
  };
}

assert.match(server, /handoff-contract/, "#handoff-contract route renders.");
assert.match(server, /cockpitHandoffContractHtml/, "Cockpit Handoff Contract card renders.");
assert.match(server, /Generate Handoff Contract Preview/, "Generate Handoff Contract Preview action renders.");
assert.match(server, /Contract only/, "Contract page should label itself contract-only.");
assert.match(server, /no external system contacted/i, "Contract page should state no external system contacted.");

assert.equal(handoffContractVersion, "partner-journey-handoff-contract-v1");
[
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
].forEach(field => assert.ok(handoffContractRequiredTopLevelFields.includes(field), `${field} should be required top-level field.`));
[
  "partner_id",
  "partner_slug",
  "partner_name",
  "organization_type",
  "primary_contact_name",
  "primary_contact_email",
  "program_geography",
  "package_or_program_tier",
  "missing_partner_details"
].forEach(field => assert.ok(handoffContractRequiredPartnerFields.includes(field), `${field} should be required partner field.`));
[
  "proposal_draft",
  "partner_page_draft",
  "dashboard_readiness",
  "weekly_report_draft",
  "evidence_note",
  "manual_review_checklist",
  "internal_handoff_packet"
].forEach(type => assert.ok(handoffContractRequiredArtifactTypes.includes(type), `${type} should be a required artifact type.`));

let activated = ensureRcapProductionActivation(baseState(), { now: "2026-05-29T12:00:00.000Z", actor: "contract_qa" }).state;
let packet = buildPartnerJourneyHandoffContractPacket(activated, { now: "2026-05-29T12:01:00.000Z", actor: "contract_qa" });
let validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, false, "Missing partner data should fail validation.");
assert.ok(validation.missing_fields.some(item => /primary_contact|organization_type|program_geography/i.test(item)), "Missing partner fields should be reported.");

let reviewed = approveRequiredArtifacts(activated);
reviewed = transitionRcapReviewArtifact(reviewed, "rcap-dashboard-readiness-v1", "blocked", {
  now: "2026-05-29T12:15:00.000Z",
  actor: "contract_qa",
  blocker_reason: "Dashboard roles are not confirmed."
}).state;
packet = buildPartnerJourneyHandoffContractPacket(completePartnerDetails(reviewed), {
  now: "2026-05-29T12:16:00.000Z",
  actor: "contract_qa",
  manual_approval_status: "approved",
  approved_by: "Roger",
  approved_at: "2026-05-29T12:16:00.000Z"
});
validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, false, "Blocked artifact should fail validation.");
assert.ok(validation.blockers.some(item => /Dashboard Readiness/i.test(item)), "Blocked artifact should be listed.");

reviewed = approveRequiredArtifacts(activated);
reviewed = transitionRcapReviewArtifact(reviewed, "rcap-partner-page-draft-v1", "needs_revision", {
  now: "2026-05-29T12:18:00.000Z",
  actor: "contract_qa",
  revision_reason: "Partner page copy needs review."
}).state;
packet = buildPartnerJourneyHandoffContractPacket(completePartnerDetails(reviewed), {
  now: "2026-05-29T12:19:00.000Z",
  actor: "contract_qa",
  manual_approval_status: "approved",
  approved_by: "Roger",
  approved_at: "2026-05-29T12:19:00.000Z"
});
validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, false, "Needs-revision artifact should fail validation.");
assert.ok(validation.revisions.some(item => /Partner Page Draft/i.test(item)), "Revision artifact should be listed.");

packet = buildPartnerJourneyHandoffContractPacket(completePartnerDetails(activated), {
  now: "2026-05-29T12:20:00.000Z",
  actor: "contract_qa",
  manual_approval_status: "approved",
  approved_by: "Roger",
  approved_at: "2026-05-29T12:20:00.000Z"
});
validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, false, "Review-required artifacts should fail validation.");
assert.ok(validation.review_required.some(item => /Proposal Draft/i.test(item)), "Review-required artifact should be listed.");

reviewed = completePartnerDetails(approveRequiredArtifacts(activated));
let generatedPacket = generateRcapPartnerJourneyHandoffPacket(reviewed, { now: "2026-05-29T12:25:00.000Z", actor: "contract_qa" });
reviewed = generatedPacket.state;
packet = buildPartnerJourneyHandoffContractPacket(reviewed, { now: "2026-05-29T12:26:00.000Z", actor: "contract_qa" });
validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, false, "Missing manual approval should fail validation.");
assert.ok(validation.required_approvals.includes("Manual approval status must be approved."), "Manual approval failure should be explicit.");

packet = buildPartnerJourneyHandoffContractPacket(reviewed, {
  now: "2026-05-29T12:27:00.000Z",
  actor: "contract_qa",
  manual_approval_status: "approved",
  approved_by: "Roger",
  approved_at: "2026-05-29T12:27:00.000Z"
});
packet.live_gates_count = 1;
validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, false, "Nonzero live gates should fail validation.");
assert.ok(validation.safety_failures.some(item => /live_gates_count/i.test(item)), "Live gate validation failure should be listed.");

packet = buildPartnerJourneyHandoffContractPacket(reviewed, {
  now: "2026-05-29T12:28:00.000Z",
  actor: "contract_qa",
  manual_approval_status: "approved",
  approved_by: "Roger",
  approved_at: "2026-05-29T12:28:00.000Z"
});
packet.no_external_actions_confirmation = false;
validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, false, "False no_external_actions_confirmation should fail validation.");
assert.ok(validation.safety_failures.some(item => /external actions/i.test(item)), "External action confirmation failure should be listed.");

packet = buildPartnerJourneyHandoffContractPacket(reviewed, {
  now: "2026-05-29T12:29:00.000Z",
  actor: "contract_qa",
  manual_approval_status: "approved",
  approved_by: "Roger",
  approved_at: "2026-05-29T12:29:00.000Z"
});
validation = validatePartnerJourneyHandoffContract(packet);
assert.equal(validation.valid, true, "Fully valid packet should pass validation.");
assert.equal(packet.source_system, "legalease_os");
assert.equal(packet.target_system, "partner_journey_os");
assert.equal(packet.handoff_ready, true);
assert.equal(packet.live_gates_count, 0);
assert.equal(packet.no_external_actions_confirmation, true);

const previewResult = generatePartnerJourneyHandoffContractPreview(reviewed, {
  now: "2026-05-29T12:30:00.000Z",
  actor: "contract_qa",
  manual_approval_status: "approved",
  approved_by: "Roger",
  approved_at: "2026-05-29T12:30:00.000Z"
});
assert.equal(previewResult.preview.internalOnly, true, "Preview should be internal-only.");
assert.equal(previewResult.preview.reviewOnly, true, "Preview should be review-only.");
assert.equal(previewResult.preview.noExternalSystemContacted, true, "Preview should not contact external systems.");
assert.equal(previewResult.preview.validation.valid, true, "Preview should include validation result.");
assert.equal(previewResult.state.auditHistory[0].action, "partner journey handoff contract preview generated", "Preview should create audit entry.");
assert.equal(previewResult.state.activityEvents[0].eventType, "Partner Journey handoff contract preview generated", "Preview should create activity event.");
assert.equal(liveGatesCount(previewResult.state), 0, "Preview should keep live gates at 0.");

const poisoned = {
  ...packet,
  secret_value: "sk-test-secret",
  nested: { bearer: "Bearer abc.def.ghi", service: "service_role" }
};
const redacted = redactHandoffContractJson(poisoned);
const redactedJson = JSON.stringify(redacted);
assert.doesNotMatch(redactedJson, /sk-|Bearer |service_role|OWNER_TOKEN|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/i, "JSON preview should redact secret-like values.");
assert.match(redactedJson, /\[REDACTED\]/, "JSON preview should visibly redact secret-like values.");

const health = buildOsHealthSnapshot(previewResult.state, {
  now: "2026-05-29T12:31:00.000Z",
  supabaseDbConnected: true,
  supabaseStorageConnected: true,
  openAIConfigured: true,
  ownerTokenAuthConfigured: true
});
assert.ok(health.handoff_contract_status, "OS Health should include handoff contract status.");
assert.equal(health.handoff_contract_status.latest_validation_result, "valid", "OS Health should include latest contract validation result.");
assert.equal(health.handoff_contract_status.missing_fields_count, 0, "OS Health should include missing field count.");

const evidence = buildEvidenceIndex(previewResult.state, { now: "2026-05-29T12:32:00.000Z" });
assert.ok(evidence.items.some(item => item.type === "handoff_contract_preview" && item.source === "Partner Journey Handoff Contract"), "Evidence Room should include contract preview evidence.");
assert.ok(evidence.items.some(item => item.proof_category === "operating"), "Contract preview should be operating proof evidence.");

const contractPageMatch = server.match(/function handoffContractPageHtml\(pageClass\) \{[\s\S]*?function [a-zA-Z0-9_]+\(pageClass\)/);
assert.ok(contractPageMatch, "Handoff contract page renderer should be discoverable.");
const contractPage = contractPageMatch[0];
for (const pattern of [
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Send/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Publish/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Activate/i,
  /onclick="[^"]*(?:send|publish|activateDashboard|activatePartnerDashboard|partnerJourney)/i
]) {
  assert.doesNotMatch(contractPage, pattern, "Handoff Contract must not expose enabled external action controls.");
}

assert.doesNotMatch(server + contractSource, /PartnerJourneyClient|partnerJourneyApi|fetch\(["']https?:\/\/.*partner/i, "No Partner Journey calls should exist.");
assert.equal(liveGatesCount(previewResult.state), 0, "Live gates remain 0.");

console.log("Partner Journey handoff contract tests passed.");
