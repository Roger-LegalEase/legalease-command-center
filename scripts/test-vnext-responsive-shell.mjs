import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { APPROVED_WHITE_LOGO_PATH } from "./ui/brand-contract.mjs";
import { routeRegistry } from "./ui/navigation.mjs";
import {
  CREATE_MENU_OPTIONS,
  PRIMARY_SHELL_DESTINATIONS,
  SECONDARY_SHELL_CONTROLS,
  canonicalRouteForShell,
  resolveShellDestination
} from "./ui/app-shell-navigation.mjs";
import {
  DESKTOP_SHELL_STYLESHEET_PATH,
  RESPONSIVE_NAVIGATION_DRAWER_ID,
  RESPONSIVE_SHELL_BREAKPOINT_PX,
  RESPONSIVE_SHELL_CONTRACT,
  renderVNextDesktopShell,
  renderVNextDesktopShellChrome
} from "./ui/app-shell.mjs";

const shellSource = readFileSync("scripts/ui/app-shell.mjs", "utf8");
const navigationSource = readFileSync("scripts/ui/app-shell-navigation.mjs", "utf8");
const cssSource = readFileSync(DESKTOP_SHELL_STYLESHEET_PATH, "utf8");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(RESPONSIVE_SHELL_BREAKPOINT_PX, 860);
assert.equal(RESPONSIVE_NAVIGATION_DRAWER_ID, "vnext-navigation-drawer");
assert.deepEqual(RESPONSIVE_SHELL_CONTRACT.requiredWidths, [1440, 1280, 1024, 768, 390]);
assert.equal(RESPONSIVE_SHELL_CONTRACT.approvedLogoPath, APPROVED_WHITE_LOGO_PATH);
assert.deepEqual(RESPONSIVE_SHELL_CONTRACT.primaryDestinations.map((item) => item.label), [
  "Today", "Inbox", "Relationships", "Social", "Outreach", "Scoreboard", "Support", "Calendar", "Company Health", "Files"
]);
assert.deepEqual(RESPONSIVE_SHELL_CONTRACT.secondaryControls.map((item) => item.label), ["Le-E", "Settings"]);
assert.deepEqual(RESPONSIVE_SHELL_CONTRACT.createOptions.map((item) => item.label), ["Social post", "Outreach campaign", "Partner", "File or folder", "Quick note"]);
assert.equal(Object.isFrozen(RESPONSIVE_SHELL_CONTRACT), true);
assert.equal(Object.isFrozen(RESPONSIVE_SHELL_CONTRACT.requiredWidths), true);

const chrome = renderVNextDesktopShellChrome();
assert.match(chrome.start, new RegExp(`id="${RESPONSIVE_NAVIGATION_DRAWER_ID}"`));
assert.match(chrome.start, /data-shell-drawer/);
assert.match(chrome.start, /aria-label="Open navigation" aria-expanded="false" aria-controls="vnext-navigation-drawer"/);
assert.match(chrome.start, /data-shell-action="close-navigation" aria-label="Close navigation"/);
assert.match(chrome.start, /class="vnext-drawer-overlay"[\s\S]*aria-label="Close navigation"[\s\S]*hidden/);
assert.match(chrome.start, /data-shell-current-context aria-live="polite">Today/);
assert.match(chrome.start, /src="\/assets\/brand\/logos\/legalease-logo-white-2025\.png" width="1920" height="1080"/);
assert.equal((chrome.start.match(/class="vnext-primary-navigation"/g) || []).length, 1, "There must be one primary navigation instance.");
for (const label of ["Today", "Inbox", "Relationships", "Social", "Outreach", "Scoreboard", "Support", "Calendar", "Company Health", "Files", "Le-E", "Settings"]) {
  assert.match(chrome.start, new RegExp(`>${label}<`), `${label} must remain in the responsive navigation.`);
}
assert.doesNotMatch(chrome.start, />Task</, "Task remains available in Today and Tasks, not Global Create.");
assert.doesNotMatch(chrome.start, /monogram|data-short-label|LegalEase mark/i, "The responsive shell must not invent a compact brand mark.");

for (const contract of [
  ["open", /function openNavigationDrawer\(\)/],
  ["close", /function closeNavigationDrawer\(returnFocus = false\)/],
  ["focus entry", /setTimeout\(\(\) => \(drawerClose \|\| drawerFocusableControls\(\)\[0\]\)\?\.focus\(\), 0\)/],
  ["focus return", /setTimeout\(\(\) => drawerTrigger\.focus\(\), 0\)/],
  ["focus containment", /event\.key === "Tab" && drawerIsOpen\(\)/],
  ["Escape", /event\.key === "Escape" && drawerIsOpen\(\)/],
  ["body lock", /document\.body\.classList\.add\("vnext-navigation-open"\)/],
  ["overlay", /drawerOverlay\.hidden = false/],
  ["route close", /event\.target\.closest\?\.\("\.vnext-sidebar a, \.vnext-sidebar \[data-shell-action\]"\)/],
  ["responsive reset", /navigationMedia\.addEventListener\("change", syncResponsiveMode\)/],
  ["Create handoff", /document\.addEventListener\("vnext:close-navigation", \(\) => closeNavigationDrawer\(false\)\)/]
]) {
  assert.match(shellSource, contract[1], `The responsive client must implement ${contract[0]}.`);
}
assert.match(shellSource, /function setDrawerBackgroundInert\(inert\)/);
assert.match(shellSource, /setDrawerBackgroundInert\(true\)/);
assert.match(shellSource, /setDrawerBackgroundInert\(false\)/);
assert.match(shellSource, /drawer\.setAttribute\("aria-modal", "true"\)/);
assert.match(shellSource, /drawer\.setAttribute\("inert", ""\)/);

assert.match(cssSource, /@media \(max-width: 860px\)/);
assert.match(cssSource, /width:\s*min\(var\(--le-sidebar-mobile\), calc\(100vw - 6rem\)\)/);
assert.match(cssSource, /background:\s*var\(--le-navy-950\)/);
assert.match(cssSource, /background:\s*var\(--le-orange-600\)/);
assert.match(cssSource, /min-height:\s*var\(--le-touch-target\)/);
assert.match(cssSource, /overflow:\s*hidden/);
assert.match(cssSource, /transform:\s*translateX\(-100%\)/);
assert.match(cssSource, /\.vnext-app-shell\.vnext-navigation-open \.vnext-sidebar/);
assert.match(cssSource, /\.vnext-app-shell\.vnext-navigation-open \.vnext-create-trigger/);
assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(cssSource, /#[0-9a-fA-F]{3,8}\b/, "Responsive styling must use approved tokens.");
assert.doesNotMatch(cssSource, /(?:linear|radial)-gradient|backdrop-filter|glass/i);

const aliases = routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]));
assert.equal(routeRegistry.length, 75);
assert.equal(aliases.length, 53);
for (const entry of routeRegistry) assert.notEqual(resolveShellDestination(entry.canonicalRoute), "", `${entry.canonicalRoute} needs a destination.`);
for (const [alias, target] of aliases) {
  const expectedTarget = target === "growth" ? "queue" : target;
  assert.equal(canonicalRouteForShell(alias), expectedTarget, `${alias} must retain final target ${expectedTarget}.`);
}
assert.equal(canonicalRouteForShell("growth"), "queue");
assert.equal(resolveShellDestination("#item/posts/post-1"), "Social");
assert.equal(resolveShellDestination("#item/campaigns/campaign-1"), "Outreach");
assert.equal(resolveShellDestination("#item/partners/partner-1"), "Partners");
assert.equal(resolveShellDestination("#item/reports/report-1"), "Files");
assert.equal(resolveShellDestination("#unknown-responsive-route"), "Today");
assert.deepEqual(PRIMARY_SHELL_DESTINATIONS.map((item) => item.label), ["Today", "Inbox", "Relationships", "Social", "Outreach", "Scoreboard", "Support", "Calendar", "Company Health", "Files"]);
assert.deepEqual(SECONDARY_SHELL_CONTROLS.map((item) => item.label), ["Le-E", "Settings"]);
assert.deepEqual(CREATE_MENU_OPTIONS.map((item) => item.label), ["Social post", "Outreach campaign", "Partner", "File or folder", "Quick note"]);

const legacyFixture = `<!doctype html><html><head><link rel="stylesheet" href="/assets/ui/tokens.css" /></head><body>
  <div class="shell"><header class="app-topbar"><nav class="top-nav" aria-label="Primary"><a href="#today">Today</a></nav></header><main id="app"><h1>Current page</h1></main></div>
  <div id="toast"></div><script>window.addEventListener("hashchange", render);</script></body></html>`;
const responsiveFixture = renderVNextDesktopShell(legacyFixture);
assert.match(responsiveFixture, /data-command-center-shell="vnext"/);
assert.match(responsiveFixture, /aria-controls="vnext-navigation-drawer"/);
assert.match(responsiveFixture, /<main id="app"><h1>Current page<\/h1><\/main>/);
assert.doesNotMatch(responsiveFixture, /class="app-topbar"/);
assert.equal(renderVNextDesktopShell("not-an-application"), "not-an-application");

for (const [label, source] of [["navigation", navigationSource], ["shell", shellSource]]) {
  for (const forbiddenImport of ["storage", "database", "access-control", "publishing", "social-publish", "safety-posture", "business-engine", "preview-server"]) {
    assert.doesNotMatch(source, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `${label} must not import ${forbiddenImport}.`);
  }
  assert.doesNotMatch(source, /^\s*import[^\n]+(?:outreach-api-integration|outreach-os|campaign-command)/im, `${label} must not import Outreach domain or execution services.`);
  assert.doesNotMatch(source, /^\s*(?:await\s+)?(?:fetch|writeFile|readFile|createServer)\s*\(/m, `${label} must have no import-time I/O.`);
}
assert.doesNotMatch(shellSource, /COMMAND_CENTER_UX_VNEXT|localStorage|sessionStorage|document\.cookie/);
assert.doesNotMatch(shellSource, /\/api\/(?:lee|state|outreach|publishing|auth\/login)/);

const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart);
const legacyShellHash = createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex");
assert.equal(legacyShellHash, "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187");

assert.equal(packageJson.scripts["test:vnext-responsive-shell"], "node scripts/test-vnext-responsive-shell.mjs");
assert.match(readFileSync("scripts/run-extended-tests.mjs", "utf8"), /f\.startsWith\("test-"\) && f\.endsWith\("\.mjs"\)/);

console.log(`vNext responsive shell verified at ${RESPONSIVE_SHELL_CONTRACT.requiredWidths.join(", ")}px with ${routeRegistry.length} routes, ${aliases.length} aliases, and byte-stable legacy output.`);
