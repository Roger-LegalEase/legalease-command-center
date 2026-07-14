import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRcapProductionActivation } from "./production-activation.mjs";
import {
  computeRcapPartnerJourneyHandoffReadiness,
  generateRcapPartnerJourneyHandoffPacket,
  rcapHandoffPacketKey,
  rcapRequiredHandoffArtifactKeys,
  transitionRcapReviewArtifact
} from "./review-approval-engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");
const engine = readFileSync(join(here, "review-approval-engine.mjs"), "utf8");

const baseState = {
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  partners: [],
  tasks: [],
  partnerPrograms: [],
  partnerProgramArtifacts: [],
  reports: [],
  dataRoomItems: [],
  evidencePackNotes: [],
  activityEvents: [],
  auditHistory: []
};

const activated = ensureRcapProductionActivation(baseState, { now: "2026-05-27T18:00:00.000Z", actor: "Roger" });
let readiness = computeRcapPartnerJourneyHandoffReadiness(activated.state);
assert.equal(readiness.handoff_ready, false, "Fresh RCAP activation should not be handoff ready.");
assert.equal(readiness.readiness_count.total, 6, "Six required handoff artifacts should be checked.");
assert.deepEqual(rcapRequiredHandoffArtifactKeys, [
  "rcap-proposal-draft-v1",
  "rcap-partner-page-draft-v1",
  "rcap-dashboard-readiness-v1",
  "rcap-weekly-report-draft-v1",
  "rcap-production-activation-evidence-v1",
  "rcap-manual-review-checklist-v1"
]);
assert.ok(readiness.review_required_artifacts.includes("Proposal Draft"), "Proposal Draft should be required.");
assert.ok(readiness.missing_partner_details.length > 0, "Missing partner details should prevent handoff readiness.");
assert.equal(readiness.live_gates, 0, "Live gates should remain 0.");

let allReviewed = activated.state;
for (const key of rcapRequiredHandoffArtifactKeys) {
  allReviewed = transitionRcapReviewArtifact(allReviewed, key, "approved", {
    now: "2026-05-27T18:05:00.000Z",
    actor: "Roger",
    notes: "Approved for internal readiness computation."
  }).state;
}
readiness = computeRcapPartnerJourneyHandoffReadiness(allReviewed);
assert.equal(readiness.handoff_ready, false, "Missing partner details should still prevent handoff.");
assert.equal(readiness.approved_artifacts.length, 6, "Approved artifacts should count correctly.");

const blockedState = transitionRcapReviewArtifact(allReviewed, "rcap-dashboard-readiness-v1", "blocked", {
  now: "2026-05-27T18:06:00.000Z",
  actor: "Roger",
  blocker_reason: "Dashboard data requirements unresolved."
}).state;
readiness = computeRcapPartnerJourneyHandoffReadiness(blockedState);
assert.equal(readiness.handoff_ready, false, "Blocked artifact should prevent handoff readiness.");
assert.ok(readiness.blocked_artifacts.includes("Dashboard Readiness"), "Blocked artifacts should be listed.");

const revisionState = transitionRcapReviewArtifact(allReviewed, "rcap-partner-page-draft-v1", "needs_revision", {
  now: "2026-05-27T18:07:00.000Z",
  actor: "Roger",
  revision_reason: "Partner page copy needs edits."
}).state;
readiness = computeRcapPartnerJourneyHandoffReadiness(revisionState);
assert.ok(readiness.revision_required_artifacts.includes("Partner Page Draft"), "Revision artifacts should be listed.");

const readyPartnerState = {
  ...allReviewed,
  partners: allReviewed.partners.map(partner => partner.slug === "rcap" ? {
    ...partner,
    missing_external_details: false,
    missingExternalDetailsList: [],
    primaryContact: "TBD reviewed contact",
    email: "review_required@example.com",
    website: "https://review-required.example.invalid",
    stakeholders: ["approval authority review_required"]
  } : partner),
  partnerPrograms: allReviewed.partnerPrograms.map(program => program.slug === "rcap" ? {
    ...program,
    missingExternalDetails: false,
    primaryContact: "TBD reviewed contact",
    jurisdiction: "review_required",
    targetAudience: "review_required",
    packageTier: "implementation"
  } : program)
};
readiness = computeRcapPartnerJourneyHandoffReadiness(readyPartnerState);
assert.equal(readiness.handoff_ready, true, "Approved artifacts plus confirmed placeholders should allow internal handoff readiness.");

const packetResult = generateRcapPartnerJourneyHandoffPacket(activated.state, { now: "2026-05-27T18:10:00.000Z", actor: "Roger" });
assert.equal(packetResult.packet.key, rcapHandoffPacketKey);
assert.equal(packetResult.packet.internalOnly, true);
assert.equal(packetResult.packet.noExternalSystemContacted, true);
assert.equal(packetResult.state.partnerProgramArtifacts.filter(item => item.key === rcapHandoffPacketKey).length, 1, "Packet should upsert as one internal artifact.");
assert.equal(packetResult.state.auditHistory[0].action, "rcap internal handoff packet generated", "Packet generation should create audit entry.");
assert.equal(packetResult.state.activityEvents[0].eventType, "RCAP internal handoff packet generated", "Packet generation should create activity event.");
assert.equal(Object.values(packetResult.state.runtime.livePostingGates).filter(gate => gate.enabled).length, 0, "Packet generation should keep live gates at 0.");

assert.match(server, /Review Packet/, "RCAP Program Review should render review packet section.");
assert.match(server, /Prepare Review Packet/, "Workspace should include internal packet preparation action.");
assert.match(server, /RCAP Program Handoff/, "Cockpit should show compact RCAP program handoff card.");
assert.match(server, /Nothing has been sent, published, or activated|no external system contacted/i, "Workspace should label packet as internal only.");
assert.match(server, /No external system contacted|Nothing has been sent, published, or activated/i, "Workspace should state no external system contacted.");
assert.match(server, /\/api\/production-activation\/rcap\/handoff-packet/, "Handoff packet API endpoint should exist.");
assert.match(server, /generateRcapHandoffPacket/, "Client packet action should exist.");
assert.doesNotMatch(server + engine, /partnerJourneyApi|PartnerJourneyClient|fetch\(["']https?:\/\/.*partner/i, "No Partner Journey API calls should exist.");

const workspaceMatch = server.match(/function rcapReviewWorkspaceHtml\(pageClass\) \{[\s\S]*?function [a-zA-Z0-9_]+\(pageClass\)/);
assert.ok(workspaceMatch, "RCAP review workspace function should be discoverable.");
const workspace = workspaceMatch[0];
for (const pattern of [
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Send/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Publish/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Activate dashboard/i,
  /onclick="[^"]*(?:send|publish|activateDashboard|activatePartnerDashboard)/i
]) {
  assert.doesNotMatch(workspace, pattern, "Handoff layer must not expose enabled external action controls.");
}

console.log("partner handoff readiness tests passed");
