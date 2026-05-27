import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

assert.match(server, /production-activation-rcap/, "#production-activation-rcap route should exist.");
assert.match(server, /function rcapReviewWorkspaceHtml\(pageClass\)/, "RCAP review workspace renderer should exist.");
assert.match(server, /Review RCAP Artifacts/, "Cockpit should link to the RCAP review workspace.");
assert.match(server, /location\.hash='production-activation-rcap'/, "Cockpit review button should navigate to the workspace.");

const routeList = server.match(/const pageId = \[[\s\S]*?\]\.includes\(normalizedPage\)/)?.[0] || "";
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
