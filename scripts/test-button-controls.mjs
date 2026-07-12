import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

function snippetAround(text, radius = 600) {
  const index = server.indexOf(text);
  assert.notEqual(index, -1, `${text} should exist.`);
  return server.slice(Math.max(0, index - radius), index + text.length + radius);
}

assert.doesNotMatch(server, /controls:\s*button-audit-v1|shell:\s*app-layout-stable-v1|nav:\s*topnav-fixed-v1/, "Old debug markers should not render in hosted mode.");
assert.match(server, /function safeControlToast/, "Safe local control status helper should exist.");
assert.match(server, /review-only-action/, "Review-only disabled action class should exist.");
assert.match(server, /type="button" onclick="connectGoogle\(\)"/, "Connect Google should be an explicit button, not an accidental submit.");
assert.match(server, /type="button" onclick="syncGmail\(\)"/, "Sync Gmail should be an explicit button.");
assert.match(server, /type="button" onclick="syncCalendar\(\)"/, "Sync Calendar should be an explicit button.");
assert.match(server, /Google sync never sends email or creates calendar events/, "Google sync controls should state read-only safety.");
assert.match(server, /Connection status only:<\/strong> Connected, Needs attention, or Not connected/, "Settings connections should show one calm section-level status state.");
assert.match(server, /Posting remains approval-gated|No agent auto-posts to social/, "Collapsed channel details should explain manual review.");
assert.doesNotMatch(server, />Enable live publishing<\/button>/, "Enable live publishing should not appear as a normal visible control.");
assert.doesNotMatch(server, /Live posting:\s*<strong>\\\$\{liveEnabled \? "Enabled" : "Disabled"\}<\/strong>/, "Channels should not repeat live posting status on every row.");
assert.match(server, /onclick="startRcapActivation\(\)"/, "RCAP activation button should still be wired.");
assert.match(server, /class="nav-top-link" href="#decisions" data-nav-section="queue"/, "Queue top nav link should route directly (Phase N).");
assert.match(server, /class="nav-top-link" href="#campaigns" data-nav-section="campaigns"/, "Campaigns top nav link should route directly.");
assert.match(server, /class="nav-top-link" href="#queue" data-nav-section="review-desk"/, "Review Desk top nav link should route directly.");
assert.match(server, /class="nav-top-link" href="#reports" data-nav-section="reports"/, "Reports top nav link should route directly.");
assert.match(server, /class="nav-top-link" href="#more" data-nav-section="more"/, "More top nav link should route directly.");
assert.match(server, /Open RCAP Program/, "RCAP access buttons should use a clear route label.");
assert.match(server, /Open App Status/, "App Status access should remain available from utility navigation.");

const automationControls = snippetAround("Import controls");
assert.match(automationControls, /type="button" onclick="connectGoogle\(\)"/, "Automation Connect Google control should be explicit.");
assert.match(automationControls, /type="button" onclick="syncGmail\(\)"/, "Automation Sync Gmail control should be explicit.");
assert.match(automationControls, /type="button" onclick="syncCalendar\(\)"/, "Automation Sync Calendar control should be explicit.");

const dangerousWords = ["send_email", "publish_partner_page", "activate_partner_dashboard"];
for (const word of dangerousWords) {
  const enabledDangerousButton = new RegExp(`<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*(?:${word}|${word.replaceAll("_", " ")})`, "i");
  assert.doesNotMatch(server, enabledDangerousButton, `${word} should not appear as an enabled direct-action button.`);
}

console.log("button controls tests passed");
