#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvidenceIndex } from "./evidence-room.mjs";
import { ensureRcapProductionActivation, rcapActivationStatus } from "./production-activation.mjs";
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

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function byKey(collection = [], key = "") {
  return collection.find(item => item.key === key || item.id === key);
}

function transition(state, key, nextReviewState, options = {}) {
  const result = transitionRcapReviewArtifact(state, key, nextReviewState, options);
  const audit = result.state.auditHistory[0];
  const event = result.state.activityEvents[0];
  assert.equal(audit.action, "rcap artifact review state changed", `${key} transition should create audit entry.`);
  assert.equal(audit.resourceId, key, `${key} audit entry should identify artifact.`);
  assert.ok(audit.beforeValue?.review_state, `${key} audit entry should include old state.`);
  assert.equal(audit.afterValue?.review_state, nextReviewState, `${key} audit entry should include new state.`);
  assert.equal(audit.actor, options.actor || "owner_token", `${key} audit entry should include actor.`);
  assert.ok(audit.timestamp, `${key} audit entry should include timestamp.`);
  if (options.notes) assert.equal(audit.afterValue.notes, options.notes, `${key} audit entry should include notes.`);
  if (options.blocker_reason) assert.equal(audit.afterValue.blocker_reason, options.blocker_reason, `${key} audit entry should include blocker reason.`);
  if (options.revision_reason) assert.equal(audit.afterValue.revision_reason, options.revision_reason, `${key} audit entry should include revision reason.`);
  assert.equal(event.eventType, "RCAP review state changed", `${key} transition should create activity event.`);
  assert.equal(event.metadata.externalSideEffects, false, `${key} transition must remain internal-only.`);
  return result.state;
}

function assertOne(collection = [], predicate, message) {
  assert.equal(collection.filter(predicate).length, 1, message);
}

const baseState = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false },
      instagram: { enabled: false },
      twitter_x: { enabled: false },
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
  activityEvents: [],
  auditHistory: [],
  evidenceSummaries: []
};

const firstActivation = ensureRcapProductionActivation(baseState, {
  now: "2026-05-28T14:00:00.000Z",
  actor: "rcap_full_workflow_qa"
});
const secondActivation = ensureRcapProductionActivation(firstActivation.state, {
  now: "2026-05-28T14:05:00.000Z",
  actor: "rcap_full_workflow_qa"
});
let state = secondActivation.state;
const activationStatus = rcapActivationStatus(state);

assert.equal(activationStatus.partner, "RCAP", "RCAP partner should exist.");
assert.equal(activationStatus.proposal_task.status, "exists", "Proposal task should exist.");
assert.equal(activationStatus.proposal_draft.status, "exists", "Proposal draft should exist.");
assert.equal(activationStatus.partner_page_draft.status, "exists", "Partner page draft should exist.");
assert.equal(activationStatus.dashboard_readiness.status, "exists", "Dashboard readiness should exist.");
assert.equal(activationStatus.weekly_report_draft.status, "exists", "Weekly report draft should exist.");
assert.equal(activationStatus.evidence_note.status, "exists", "Evidence note should exist.");
assert.equal(activationStatus.review_only, true, "Activation must be review-only.");
assert.equal(activationStatus.external_side_effects, false, "Activation must not have external side effects.");
assert.equal(activationStatus.live_gates, 0, "Activation must keep live gates at 0.");

assertOne(state.partners, item => item.slug === "rcap", "RCAP partner record should be idempotent.");
assertOne(state.tasks, item => item.id === "task-rcap-proposal-draft-v1", "Proposal task should be idempotent.");
assertOne(state.partnerProgramArtifacts, item => item.key === "rcap-proposal-draft-v1", "Proposal draft should be idempotent.");
assertOne(state.partnerProgramArtifacts, item => item.key === "rcap-partner-page-draft-v1", "Partner page draft should be idempotent.");
assertOne(state.partnerProgramArtifacts, item => item.key === "rcap-dashboard-readiness-v1", "Dashboard readiness should be idempotent.");
assertOne(state.reports, item => item.key === "rcap-weekly-report-draft-v1", "Weekly report draft should be idempotent.");
assertOne(state.evidencePackNotes, item => item.key === "rcap-production-activation-evidence-v1", "Evidence note should be idempotent.");

const workspaceMatch = server.match(/function rcapReviewWorkspaceHtml\(pageClass\) \{[\s\S]*?function [a-zA-Z0-9_]+\(pageClass\)/);
assert.ok(workspaceMatch, "RCAP Review Workspace renderer should exist.");
const workspace = workspaceMatch[0];
[
  "Partner Summary",
  "Review Packet",
  "Review Notes",
  "Roger's Next Steps",
  "Missing Information",
  "Safety Status",
  "Activity"
].forEach(label => assert.match(workspace, new RegExp(label), `${label} should render in RCAP Program Review.`));

const auditBeforeTransitions = state.auditHistory.length;
const activityBeforeTransitions = state.activityEvents.length;

state = transition(state, "rcap-proposal-task-v1", "in_review", {
  now: "2026-05-28T14:10:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Proposal task is under internal QA review."
});
state = transition(state, "rcap-proposal-draft-v1", "in_review", {
  now: "2026-05-28T14:11:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Proposal draft review started."
});
state = transition(state, "rcap-proposal-draft-v1", "approved", {
  now: "2026-05-28T14:12:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Proposal draft approved for internal readiness computation."
});
state = transition(state, "rcap-partner-page-draft-v1", "needs_revision", {
  now: "2026-05-28T14:13:00.000Z",
  actor: "rcap_full_workflow_qa",
  revision_reason: "Partner page needs approved RCAP brand and CTA placeholders before handoff."
});
state = transition(state, "rcap-dashboard-readiness-v1", "blocked", {
  now: "2026-05-28T14:14:00.000Z",
  actor: "rcap_full_workflow_qa",
  blocker_reason: "Dashboard data source and access roles are not confirmed."
});
state = transition(state, "rcap-weekly-report-draft-v1", "approved", {
  now: "2026-05-28T14:15:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Weekly report draft approved for internal readiness computation."
});
state = transition(state, "rcap-production-activation-evidence-v1", "approved", {
  now: "2026-05-28T14:16:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Evidence note approved for internal readiness computation."
});
state = transition(state, "rcap-manual-review-checklist-v1", "in_review", {
  now: "2026-05-28T14:17:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Manual checklist review started."
});
state = transition(state, "rcap-manual-review-checklist-v1", "approved", {
  now: "2026-05-28T14:18:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Manual checklist approved for internal readiness computation."
});

let readiness = computeRcapPartnerJourneyHandoffReadiness(state);
assert.equal(readiness.handoff_ready, false, "Blocked artifact should prevent handoff readiness.");
assert.ok(readiness.blocked_artifacts.includes("Dashboard Readiness"), "Blocked Dashboard Readiness should be listed.");
assert.ok(readiness.revision_required_artifacts.includes("Partner Page Draft"), "Needs-revision Partner Page Draft should be listed.");
assert.ok(readiness.missing_partner_details.length > 0, "Missing partner details should prevent handoff readiness.");
assert.equal(readiness.readiness_count.ready, 4, "Four required artifacts should be approved or handoff_ready before resolving blockers.");
assert.equal(readiness.readiness_count.total, 6, "Six required artifacts should be checked.");
assert.match(readiness.next_manual_action, /Resolve blocked artifacts/i, "Next manual action should prioritize blocker resolution.");
const readinessAfterBlockedRevision = readiness;

const blockerState = byKey(state.partnerProgramArtifacts, "rcap-dashboard-readiness-v1");
const revisionState = byKey(state.partnerProgramArtifacts, "rcap-partner-page-draft-v1");
assert.equal(blockerState.review_state, "blocked", "Dashboard Readiness should be blocked.");
assert.match(blockerState.blocker_reason, /data source/i, "Dashboard blocker reason should be stored.");
assert.equal(revisionState.review_state, "needs_revision", "Partner Page Draft should need revision.");
assert.match(revisionState.revision_reason, /brand and CTA/i, "Partner page revision reason should be stored.");

state = transition(state, "rcap-dashboard-readiness-v1", "handoff_ready", {
  now: "2026-05-28T14:25:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Dashboard blocker resolved in fixture. Ready for internal handoff computation."
});
state = transition(state, "rcap-partner-page-draft-v1", "approved", {
  now: "2026-05-28T14:26:00.000Z",
  actor: "rcap_full_workflow_qa",
  notes: "Partner page revision resolved in fixture. Approved for internal handoff computation."
});

readiness = computeRcapPartnerJourneyHandoffReadiness(state);
assert.equal(readiness.blocked_artifacts.length, 0, "Resolved Dashboard Readiness should no longer be blocked.");
assert.equal(readiness.revision_required_artifacts.length, 0, "Resolved Partner Page Draft should no longer need revision.");
assert.equal(readiness.readiness_count.ready, 6, "All required artifacts should now be approved or handoff_ready.");
assert.equal(readiness.handoff_ready, false, "Missing partner details should still prevent handoff.");
assert.match(readiness.next_manual_action, /Confirm missing RCAP partner details/i, "Next manual action should shift to missing partner details.");

const readyPartnerState = {
  ...state,
  partners: state.partners.map(partner => partner.slug === "rcap" ? {
    ...partner,
    missing_external_details: false,
    missingExternalDetailsList: [],
    primaryContact: "Reviewed RCAP contact",
    email: "review_required@example.invalid",
    website: "https://review-required.example.invalid",
    stakeholders: ["Reviewed approval authority"]
  } : partner),
  partnerPrograms: state.partnerPrograms.map(program => program.slug === "rcap" ? {
    ...program,
    missingExternalDetails: false,
    primaryContact: "Reviewed RCAP contact",
    jurisdiction: "review_required",
    targetAudience: "review_required",
    packageTier: "implementation"
  } : program)
};
const readyReadiness = computeRcapPartnerJourneyHandoffReadiness(readyPartnerState);
assert.equal(readyReadiness.handoff_ready, true, "Complete fixture partner details plus approved artifacts should allow internal handoff readiness.");

const packetResult = generateRcapPartnerJourneyHandoffPacket(state, {
  now: "2026-05-28T14:30:00.000Z",
  actor: "rcap_full_workflow_qa"
});
state = packetResult.state;
assert.equal(packetResult.packet.key, rcapHandoffPacketKey, "Internal handoff packet should use stable key.");
assert.equal(packetResult.packet.internalOnly, true, "Handoff packet must be internal-only.");
assert.equal(packetResult.packet.reviewOnly, true, "Handoff packet must be review-only.");
assert.equal(packetResult.packet.noExternalSystemContacted, true, "Handoff packet must confirm no external system contact.");
assert.equal(packetResult.packet.readiness.handoff_ready, false, "Packet should preserve not-ready result when partner details are missing.");
assert.ok(packetResult.packet.readiness.approved_artifacts.includes("Proposal Draft"), "Packet should include approved artifacts.");
assert.ok(packetResult.packet.readiness.handoff_ready_artifacts.includes("Dashboard Readiness"), "Packet should include handoff_ready artifacts.");
assert.equal(packetResult.packet.readiness.blocked_artifacts.length, 0, "Packet should reflect resolved blockers.");
assert.equal(packetResult.packet.readiness.revision_required_artifacts.length, 0, "Packet should reflect resolved revisions.");
assert.ok(packetResult.packet.readiness.missing_partner_details.length > 0, "Packet should include missing partner details.");
assertOne(state.partnerProgramArtifacts, item => item.key === rcapHandoffPacketKey, "Handoff packet should upsert idempotently.");
assert.equal(state.auditHistory[0].action, "rcap internal handoff packet generated", "Handoff packet should create audit entry.");
assert.equal(state.activityEvents[0].eventType, "RCAP internal handoff packet generated", "Handoff packet should create activity event.");
assert.equal(state.activityEvents[0].metadata.noExternalSystemContacted, true, "Handoff packet activity should confirm no external system contact.");

const evidenceIndex = buildEvidenceIndex(state, { now: "2026-05-28T14:35:00.000Z" });
const rcapEvidence = evidenceIndex.items.filter(item => /rcap/i.test([item.title, item.source, item.linked_partner_program, item.route].join(" ")));
assert.ok(rcapEvidence.length >= 4, "Evidence Room should index RCAP evidence and artifacts.");
assert.ok(rcapEvidence.some(item => item.source === "RCAP Production Activation"), "Evidence Room should include RCAP Production Activation source.");
assert.ok(rcapEvidence.some(item => item.source === "Handoff Readiness" || item.type === "internal_handoff_packet"), "Evidence Room should include handoff packet evidence.");
assert.equal((state.evidenceSummaries || []).length, 0, "RCAP QA harness should not generate public/export summaries automatically.");

assert.equal(liveGatesCount(state), 0, "Live gates must remain 0.");
assert.equal(byKey(state.evidencePackNotes, "rcap-production-activation-evidence-v1").noEmailSent, true, "No emails sent.");
assert.equal(byKey(state.evidencePackNotes, "rcap-production-activation-evidence-v1").noPostPublished, true, "No posts published.");
assert.equal(byKey(state.evidencePackNotes, "rcap-production-activation-evidence-v1").noPartnerPagePublished, true, "No partner pages published.");
assert.equal(byKey(state.evidencePackNotes, "rcap-production-activation-evidence-v1").noDashboardActivated, true, "No dashboards activated.");
assert.equal(byKey(state.partnerProgramArtifacts, "rcap-partner-page-draft-v1").published, false, "Partner page must remain unpublished.");
assert.equal(byKey(state.partnerProgramArtifacts, "rcap-dashboard-readiness-v1").dashboardLive, false, "Dashboard must remain inactive.");
assert.equal(byKey(state.partnerProgramArtifacts, "rcap-dashboard-readiness-v1").activationAllowed, false, "Dashboard activation must remain disallowed.");
assert.doesNotMatch(server + engine, /PartnerJourneyClient|partnerJourneyApi|fetch\(["']https?:\/\/.*partner/i, "No Partner Journey API calls should exist.");
assert.doesNotMatch(workspace, /restoreStateFromSnapshot\(|\/api\/[^"']*restore|restoreBackup\(/i, "RCAP workflow must not expose destructive restore behavior.");

const transitionAuditCount = state.auditHistory.length - auditBeforeTransitions;
const transitionActivityCount = state.activityEvents.length - activityBeforeTransitions;
assert.ok(transitionAuditCount >= 10, "Review transitions and packet generation should create audit entries.");
assert.ok(transitionActivityCount >= 10, "Review transitions and packet generation should create activity events.");

const summary = {
  activationArtifactsVerified: [
    "partner record",
    "proposal task",
    "proposal draft",
    "partner page draft",
    "dashboard readiness",
    "weekly report draft",
    "evidence note"
  ],
  reviewTransitionsCompleted: [
    "proposal task in_review",
    "proposal draft in_review",
    "proposal draft approved",
    "partner page draft needs_revision",
    "dashboard readiness blocked",
    "weekly report draft approved",
    "evidence note approved",
    "manual review checklist in_review",
    "manual review checklist approved"
  ],
  blockersCreated: ["Dashboard Readiness"],
  revisionsCreated: ["Partner Page Draft"],
  blockersResolved: ["Dashboard Readiness"],
  revisionsResolved: ["Partner Page Draft"],
  handoffReadinessResult: {
    afterBlockers: {
      handoff_ready: false,
      blockers: ["Dashboard Readiness"],
      revisions: ["Partner Page Draft"],
      missingDetails: readinessAfterBlockedRevision.missing_partner_details.length
    },
    afterResolutionWithMissingDetails: {
      handoff_ready: packetResult.readiness.handoff_ready,
      readinessCount: packetResult.readiness.readiness_count,
      nextManualAction: packetResult.readiness.next_manual_action
    },
    completeFixtureCanBecomeReady: readyReadiness.handoff_ready
  },
  handoffPacketGenerated: Boolean(packetResult.packet?.key),
  handoffPacketKey: packetResult.packet.key,
  rcapEvidenceIndexed: rcapEvidence.length,
  auditEventsCreated: transitionAuditCount,
  activityEventsCreated: transitionActivityCount,
  liveGatesCount: liveGatesCount(state),
  externalActionConfirmation: "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey API calls, no destructive actions."
};

console.log(JSON.stringify(summary, null, 2));
console.log("RCAP full workflow QA harness passed");
