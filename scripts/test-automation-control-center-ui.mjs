import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  AUTOMATION_CONTROL_CENTER_CONTRACT,
  AUTOMATION_CONTROL_CENTER_STYLESHEET_PATH,
  automationControlCenterBrowserSource,
  renderAutomationControlCenterLoading
} from "./ui/pages/automation-control-center.mjs";

console.log("Automation Control Center UI tests");

assert.equal(AUTOMATION_CONTROL_CENTER_STYLESHEET_PATH, "assets/ui/automation-control-center.css");
assert.equal(AUTOMATION_CONTROL_CENTER_CONTRACT.endpoint, "/api/ui/automation-control-center");
assert.equal(AUTOMATION_CONTROL_CENTER_CONTRACT.route, "outreach");
assert.equal(AUTOMATION_CONTROL_CENTER_CONTRACT.view, "automation");

const html = renderAutomationControlCenterLoading();
assert.match(html, /data-automation-control-center/u);
assert.match(html, /Automation Control Center/u);
assert.match(html, /Review only/u);
assert.match(html, /Nothing on this page can start, release, enroll, or send/u);
assert.match(html, /Reactivation/u);
assert.match(html, /Partner prospects/u);
assert.match(html, /Press outreach/u);
assert.match(html, /data-automation-refresh/u);
assert.match(html, /aria-live="polite"/u);
assert.equal((html.match(/founder-automation__skeleton(?!-)/gu) || []).length, 7);
assert.doesNotMatch(html, /\son[a-z]+=/iu);
assert.doesNotMatch(html, /live gate|state mutation|queue item|provider payload|engine execution|collection|storage backend/iu);

const source = automationControlCenterBrowserSource();
assert.doesNotThrow(() => new vm.Script(source, { filename:"automation-control-center.generated.js" }));
for (const required of [
  "credentials:\"same-origin\"",
  "Review readiness",
  "Current state",
  "Safety thresholds",
  "Approved content",
  "Audience review",
  "Duplicate check",
  "First-touch copy",
  "Recent relevant coverage",
  "Approved facts",
  "Story angle",
  "Coverage result",
  "Automation review refreshed. No settings were changed.",
  "Existing results remain unchanged.",
  "vnext:session-expired",
  "requestAnimationFrame",
  "duplicateRequests",
  "mutations:0",
  "externalActions:0",
  "providerCalls:0",
  "fullStateRequests:0"
]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(source, /\b(?:alert|confirm|prompt)\s*\(/u);
assert.doesNotMatch(source, /method:\s*"POST"|x-csrf-token|writeState|writeCollections|location\.reload|window\.open\s*\(/u);
assert.doesNotMatch(source, /\/api\/(?:state|admin|debug|boot-state)/u);
assert.doesNotMatch(source, /provider\.(?:send|publish|release)|sendEmail\s*\(|publishPost\s*\(|releaseWave\s*\(|setReactivationLiveMode\s*\(/iu);

const css = readFileSync(new URL("../assets/ui/automation-control-center.css", import.meta.url), "utf8");
for (const required of [
  ".founder-automation__readiness",
  ".founder-automation__metrics",
  ".founder-automation__records",
  ".founder-automation__details",
  "data-state=\"attention\"",
  "overflow-x: clip",
  ":focus-visible",
  "@media (max-width: 430px)",
  "grid-template-columns: 1fr",
  "prefers-reduced-motion"
]) assert.match(css, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(css, /position:\s*fixed/iu);
assert.doesNotMatch(css, /overflow-x:\s*auto/iu);
assert.doesNotMatch(css, /\n\s*width:\s*[4-9][0-9]{2,}px/iu);

console.log("PASS test-automation-control-center-ui");
