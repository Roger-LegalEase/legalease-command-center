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
assert.match(server, /Manual approval required/, "Review-only controls should explain approval requirement.");
assert.match(server, /Live posting:\s*<strong>\\\$\{liveEnabled \? "Enabled" : "Disabled"\}<\/strong>/, "Live publishing card should show disabled status plainly.");
assert.match(server, /<button class="review-only-action" disabled aria-disabled="true" title="Manual approval required before live publishing can be enabled.">Enable live publishing<\/button>/, "Enable live publishing must remain disabled/review-only.");
assert.match(server, /onclick="startRcapActivation\(\)"/, "RCAP activation button should still be wired.");
assert.match(server, /class="nav-top-link" href="#growth" data-nav-section="growth"/, "Growth top nav link should route directly.");
assert.match(server, /class="nav-top-link" href="#partners" data-nav-section="partners"/, "Partners top nav link should route directly.");
assert.match(server, /class="nav-top-link" href="#production" data-nav-section="production"/, "Production top nav link should route directly.");
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
