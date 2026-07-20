#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { requiredCapabilitiesForEndpoint } from "./roles.mjs";
import { renderVNextDesktopShell } from "./ui/app-shell.mjs";
import { readCommandCenterVNextProductConfig } from "./ui/vnext-config.mjs";

const previewSource = readFileSync("scripts/preview-server.mjs", "utf8");
const controllerSource = readFileSync("scripts/ui/controllers/social-production-controller.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const fixture = `<!doctype html><html><head></head><body><div class="shell"><header class="app-topbar"></header><main id="app"><div class="panel loading-panel">Loading LegalEase</div></main></div><div id="toast"></div><script>
      const pathRoute = String(location.pathname || "/").replace(/^\\/+|\\/+$/g, "");
      if (pageId === "safe-mode") {}
    function render() {}
      loadFullStateInBackground();
</script></body></html>`;

assert.equal(readCommandCenterVNextProductConfig({}, "social").enabled, false);
assert.equal(readCommandCenterVNextProductConfig({ COMMAND_CENTER_UX_VNEXT:"true" }, "social").enabled, false);
assert.equal(readCommandCenterVNextProductConfig({ COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_UX_VNEXT_SOCIAL:"true" }, "social").enabled, true);
assert.equal(readCommandCenterVNextProductConfig({ COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_UX_VNEXT_SOCIAL:"TRUE" }, "social").enabled, false);

const disabled = renderVNextDesktopShell(fixture);
const enabled = renderVNextDesktopShell(fixture, { socialEnabled:true });
assert.doesNotMatch(disabled, /social-calendar\.css|social-connections\.css|__LE_SOCIAL_PRODUCTION/);
assert.match(enabled, /social-calendar\.css/);
assert.match(enabled, /social-connections\.css/);
assert.match(enabled, /__LE_SOCIAL_PRODUCTION/);
assert.match(enabled, /compactPostSurface && document\.querySelector\("main#app \[data-post-composer\]"\)/);
assert.doesNotMatch(disabled, /compactPostSurface/);
assert.doesNotMatch(enabled, /COMMAND_CENTER_UX_VNEXT_SOCIAL/);

const post = "/api/ui/social/post/post-1";
assert.deepEqual(requiredCapabilitiesForEndpoint("GET", "/api/ui/social/calendar"), ["read_internal"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("GET", "/api/ui/social/connections"), ["read_internal"]);
for (const action of ["creative", "render", "variants", "schedule", "request-changes"]) {
  assert.deepEqual(requiredCapabilitiesForEndpoint("POST", `${post}/${action}`), ["manage_content_drafts"]);
}
for (const action of ["approve", "regenerate"]) {
  assert.deepEqual(requiredCapabilitiesForEndpoint("POST", `${post}/${action}`), ["manage_approval_queue"]);
}
for (const action of ["publish", "manual-package"]) {
  assert.deepEqual(requiredCapabilitiesForEndpoint("POST", `${post}/${action}`), ["social_publish"]);
}

for (const module of ["social-creative-actions", "social-variant-actions", "social-schedule-actions", "social-review-actions", "social-publishing-actions"]) {
  assert.match(previewSource, new RegExp(`from ["']\\./${module}\\.mjs["']`));
}
assert.match(previewSource, /productionEnabled:socialVNextConfig\.enabled/);
assert.match(previewSource, /writeSocialPostMutation/);
assert.match(previewSource, /store\.writeChanges\(current, after\)/);
assert.doesNotMatch(controllerSource, /localStorage|sessionStorage|document\.cookie|productionEnabled\s*=|COMMAND_CENTER_UX_VNEXT/);

const scripts = {
  "test:vnext-social-creative-actions":"node scripts/test-vnext-social-creative-actions.mjs",
  "test:vnext-social-variant-actions":"node scripts/test-vnext-social-variant-actions.mjs",
  "test:vnext-social-schedule-actions":"node scripts/test-vnext-social-schedule-actions.mjs",
  "test:vnext-social-review-actions":"node scripts/test-vnext-social-review-actions.mjs",
  "test:vnext-social-publishing-actions":"node scripts/test-vnext-social-publishing-actions.mjs",
  "test:vnext-social-acceptance":"node scripts/test-vnext-social-acceptance.mjs"
};
for (const [name, command] of Object.entries(scripts)) assert.equal(packageJson.scripts[name], command);

console.log("Social production integration wiring tests passed.");
