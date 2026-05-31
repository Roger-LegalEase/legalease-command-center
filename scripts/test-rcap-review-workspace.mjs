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
assert.match(server, /Review RCAP Program/, "Cockpit should link to the RCAP program review workspace.");
assert.match(server, /location\.hash='production-activation-rcap'/, "Cockpit review button should navigate to the workspace.");

const routeList = server.match(/const knownPages = \[[\s\S]*?\];/)?.[0] || "";
assert.match(routeList, /"production-activation-rcap"/, "RCAP review workspace should be included in the app route allow-list.");

assert.match(server, /safeRenderModule\("production-activation-rcap", \(\) => pageId === "production-activation-rcap" \? rcapReviewWorkspaceHtml\(pageClass\) : ""\)/, "RCAP review workspace should render only on RCAP routes with module-level fallback protection.");

const workspaceMatch = server.match(/function rcapReviewWorkspaceHtml\(pageClass\) \{[\s\S]*?function [a-zA-Z0-9_]+\(pageClass\)/);
assert.ok(workspaceMatch, "RCAP review workspace function should be discoverable.");
const workspace = workspaceMatch[0];

for (const label of [
  "Partner Summary",
  "Review Packet",
  "Review Notes",
  "Roger's Next Steps",
  "Missing Information",
  "Safety Status",
  "Activity"
]) {
  assert.match(workspace, new RegExp(label), `${label} section should render.`);
}

assert.match(workspace, /Record Clearing Access Program/, "Workspace should define RCAP as Record Clearing Access Program.");
assert.match(workspace, /Nothing has been sent, published, or activated/, "Workspace should state no external side effects.");
assert.match(workspace, /Publishing is off|Publishing/, "Workspace should show publishing remains off.");
assert.match(workspace, /Confirm partner contact/, "Next steps should include partner contact confirmation.");
assert.match(workspace, /Confirm partner-facing email/, "Next steps should include partner-facing email confirmation.");
assert.match(workspace, /Review proposal language/, "Next steps should include proposal language review.");
assert.match(workspace, /Proposal draft/, "Review Packet should show proposal draft row.");
assert.match(workspace, /Partner page draft/, "Review Packet should show partner page draft row.");
assert.match(workspace, /Dashboard readiness/, "Review Packet should show dashboard readiness row.");
assert.match(workspace, /Weekly report draft/, "Review Packet should show weekly report draft row.");
assert.match(workspace, /Evidence note/, "Review Packet should show evidence note row.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
for (const phrase of [
  "Purpose of RCAP partnership",
  "Proposed LegalEase support",
  "Implementation workflow",
  "Participant journey overview",
  "partner/legal disclaimer placeholders",
  "approval authority",
]) {
  assert.match(activationSource + workspace, new RegExp(escapeRegExp(phrase), "i"), `${phrase} should be present in RCAP review content.`);
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
