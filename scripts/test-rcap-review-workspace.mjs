import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRcapProductionActivation, rcapActivationStatus } from "./production-activation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");
const activationSource = readFileSync(join(here, "production-activation.mjs"), "utf8");

assert.match(server, /production-activation-rcap/, "#production-activation-rcap route should exist.");
assert.match(server, /function rcapReviewWorkspaceHtml\(pageClass\)/, "RCAP review workspace renderer should exist.");
assert.match(server, /Review RCAP Artifacts/, "Cockpit should link to the RCAP review workspace.");
assert.match(server, /location\.hash='production-activation-rcap'/, "Cockpit review button should navigate to the workspace.");

const routeList = server.match(/const pageId = [\s\S]*?\]\.includes\(normalizedPage\)/)?.[0] || "";
assert.match(routeList, /"production-activation-rcap"/, "RCAP review workspace should be included in the app route allow-list.");

assert.match(server, /\$\{rcapReviewWorkspaceHtml\(pageClass\)\}/, "RCAP review workspace should render from the app shell.");

const workspaceMatch = server.match(/function rcapReviewWorkspaceHtml\(pageClass\) \{[\s\S]*?function [a-zA-Z0-9_]+\(pageClass\)/);
assert.ok(workspaceMatch, "RCAP review workspace function should be discoverable.");
const workspace = workspaceMatch[0];

for (const label of [
  "Activation Summary",
  "Partner Record",
  "Proposal Task",
  "Proposal Draft",
  "Partner Page Draft",
  "Dashboard Readiness",
  "Weekly Report Draft",
  "Evidence Note",
  "Manual Review Checklist"
]) {
  assert.match(workspace, new RegExp(label), `${label} section should render.`);
}

assert.match(workspace, /Review-only/, "Workspace should plainly state review-only status.");
assert.match(workspace, /Manual approval required/, "Workspace should state manual approval is required.");
assert.match(workspace, /No emails, posts, partner pages, or dashboards are activated/, "Workspace should state no external side effects.");
assert.match(workspace, /Live gates/, "Workspace should show live gates.");
assert.match(workspace, /What was created/, "Activation Summary should answer what was created.");
assert.match(workspace, /What still needs review/, "Activation Summary should answer what still needs review.");
assert.match(workspace, /What is blocked/, "Activation Summary should answer what is blocked.");
assert.match(workspace, /Next manual decision/, "Activation Summary should answer the next manual decision.");
assert.match(workspace, /Known details/, "Partner Record should show known details.");
assert.match(workspace, /Definition of done/, "Proposal Task should show definition of done.");
assert.match(workspace, /Missing brand\/content assets/, "Partner Page Draft should surface missing brand and content assets.");
assert.match(workspace, /Launch blockers/, "Dashboard Readiness should show launch blockers.");
assert.match(workspace, /External action confirmation/, "Evidence Note should include external action confirmation.");

for (const phrase of [
  "Purpose of RCAP partnership",
  "Proposed LegalEase support",
  "Implementation workflow",
  "Review-only caveats",
  "Missing details list",
  "Manual approval checklist",
  "Participant journey overview",
  "partner/legal disclaimer placeholders",
  "publish blocked until manual approval",
  "data needed",
  "access needed",
  "internal review gates",
  "approval authority",
  "Partner Journey handoff",
  "owner-token auth unchanged"
]) {
  assert.match(activationSource + workspace, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${phrase} should be present in RCAP review content.`);
}

const activated = ensureRcapProductionActivation({
  runtime: { livePostingGates: { linkedin: { enabled: false }, x: { enabled: false } } },
  partners: [],
  tasks: [],
  partnerPrograms: [],
  partnerProgramArtifacts: [],
  reports: [],
  dataRoomItems: [],
  evidencePackNotes: [],
  activityEvents: [],
  auditHistory: []
}, { now: "2026-05-27T16:30:00.000Z" });
const status = rcapActivationStatus(activated.state);
assert.equal(status.live_gates, 0, "RCAP review workflow should preserve live gates at 0.");
assert.equal(status.external_side_effects, false, "RCAP review workflow should have no external side effects.");

const forbiddenEnabledControls = [
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Send/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Publish/i,
  /<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Activate dashboard/i,
  /onclick="[^"]*(?:send|publish|activateDashboard|activatePartnerDashboard)/i
];
for (const pattern of forbiddenEnabledControls) {
  assert.doesNotMatch(workspace, pattern, "Workspace must not expose enabled send/publish/dashboard activation controls.");
}

assert.match(server, /liveGatesCount:\s*Object\.values/, "Health endpoint should still report live gates.");

console.log("RCAP review workspace tests passed");
