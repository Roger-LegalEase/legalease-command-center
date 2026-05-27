import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRcapProductionActivation } from "./production-activation.mjs";
import {
  ensureRcapReviewStates,
  rcapHandoffReadinessSummary,
  rcapReviewArtifactDefinitions,
  rcapReviewQueue,
  reviewStates,
  transitionRcapReviewArtifact
} from "./review-approval-engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

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

const activated = ensureRcapProductionActivation(baseState, { now: "2026-05-27T17:00:00.000Z", actor: "test_owner" });
const stateWithReview = ensureRcapReviewStates(activated.state, { now: "2026-05-27T17:01:00.000Z", actor: "test_owner" });

assert.deepEqual(reviewStates, ["review_required", "in_review", "approved", "needs_revision", "blocked", "handoff_ready"]);
assert.equal(rcapReviewArtifactDefinitions.length, 7, "Seven RCAP artifacts should be reviewable.");

for (const def of rcapReviewArtifactDefinitions) {
  const collection = stateWithReview[def.collection] || [];
  const artifact = collection.find(item => def.match(item));
  assert.ok(artifact, `${def.title} should exist.`);
  assert.equal(artifact.review_state, "review_required", `${def.title} should default to review_required.`);
  assert.ok(artifact.review_updated_at, `${def.title} should have review_updated_at.`);
  assert.ok(artifact.review_updated_by, `${def.title} should have review_updated_by.`);
}

const queue = rcapReviewQueue(stateWithReview);
assert.equal(queue.length, 7, "All review_required artifacts should appear in the queue.");
assert.ok(queue.some(item => item.artifact === "Dashboard Readiness" && item.priority === "critical"), "Dashboard Readiness should be surfaced as critical.");

const inReview = transitionRcapReviewArtifact(stateWithReview, "rcap-proposal-draft-v1", "in_review", {
  now: "2026-05-27T17:02:00.000Z",
  actor: "Roger",
  notes: "Reading proposal copy."
});
assert.equal(inReview.artifact.review_state, "in_review");
assert.equal(inReview.state.auditHistory[0].action, "rcap artifact review state changed");
assert.equal(inReview.state.activityEvents[0].eventType, "RCAP review state changed");

const blocked = transitionRcapReviewArtifact(inReview.state, "rcap-dashboard-readiness-v1", "blocked", {
  now: "2026-05-27T17:03:00.000Z",
  actor: "Roger",
  notes: "Dashboard requirements missing.",
  blocker_reason: "Need dashboard access roles before handoff."
});
assert.equal(blocked.artifact.review_state, "blocked");
assert.match(blocked.artifact.blocker_reason, /dashboard access roles/i);
assert.ok(rcapReviewQueue(blocked.state).some(item => item.review_state === "blocked"), "Blocked states should appear in the queue.");

const revision = transitionRcapReviewArtifact(blocked.state, "rcap-partner-page-draft-v1", "needs_revision", {
  now: "2026-05-27T17:04:00.000Z",
  actor: "Roger",
  revision_reason: "Hero copy needs partner-specific review_required placeholders."
});
assert.equal(revision.artifact.review_state, "needs_revision");
assert.match(revision.artifact.revision_reason, /Hero copy/);
assert.ok(rcapReviewQueue(revision.state).some(item => item.review_state === "needs_revision"), "Revision states should appear in the queue.");

let readyState = stateWithReview;
for (const def of rcapReviewArtifactDefinitions) {
  readyState = transitionRcapReviewArtifact(readyState, def.key, "handoff_ready", {
    now: "2026-05-27T17:10:00.000Z",
    actor: "Roger",
    notes: "Ready for internal handoff decision."
  }).state;
}
const readiness = rcapHandoffReadinessSummary(readyState);
assert.equal(readiness.readyForPartnerJourneyHandoff, true, "All handoff_ready artifacts should mark RCAP handoff ready.");
assert.equal(Object.values(readyState.runtime.livePostingGates).filter(gate => gate.enabled).length, 0, "Live gates should remain 0.");

assert.match(server, /function rcapReviewQueueHtml\(\)/, "Cockpit Review Queue renderer should exist.");
assert.match(server, /RCAP Review Queue/, "Cockpit should render RCAP Review Queue.");
assert.match(server, /Handoff Readiness Summary/, "Workspace should render handoff readiness summary.");
assert.match(server, /markRcapReviewState/, "Workspace controls should call state-only review transition handler.");
assert.match(server, /\/api\/production-activation\/rcap\/review-state/, "Review state API endpoint should exist.");
assert.match(server, /review_state/, "Workspace should render review states.");
assert.match(server, /Blocked/, "Blocked state label should render.");
assert.match(server, /Needs Revision/, "Revision state label should render.");
assert.match(server, /No external actions/, "Review engine should state no external actions.");

const workspaceMatch = server.match(/function rcapReviewWorkspaceHtml\(pageClass\) \{[\s\S]*?function [a-zA-Z0-9_]+\(pageClass\)/);
assert.ok(workspaceMatch, "RCAP review workspace function should be discoverable.");
const workspace = workspaceMatch[0];
for (const pattern of [
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Send/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Publish/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Activate dashboard/i,
  /onclick="[^"]*(?:send|publish|activateDashboard|activatePartnerDashboard)/i
]) {
  assert.doesNotMatch(workspace, pattern, "Review workspace must not expose enabled external action controls.");
}

console.log("review approval engine tests passed");
