import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { APPROVED_WHITE_LOGO_PATH, TOKEN_STYLESHEET_PATH } from "./ui/brand-contract.mjs";
import { GLOBAL_UTILITIES, PRIMARY_DESTINATIONS } from "./ui/labels.mjs";
import { routeRegistry } from "./ui/navigation.mjs";
import {
  CREATE_MENU_OPTIONS,
  DEFERRED_CREATE_OPTIONS,
  PRIMARY_SHELL_DESTINATIONS,
  SECONDARY_SHELL_CONTROLS,
  SHELL_DESTINATION_LABELS,
  TOP_BAR_CONTROLS,
  canonicalRouteForShell,
  resolveShellDestination
} from "./ui/app-shell-navigation.mjs";
import {
  DESKTOP_SHELL_CONTRACT,
  DESKTOP_SHELL_STYLESHEET_PATH,
  renderVNextDesktopShell,
  renderVNextDesktopShellChrome
} from "./ui/app-shell.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";

const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const navigationSource = readFileSync("scripts/ui/app-shell-navigation.mjs", "utf8");
const shellSource = readFileSync("scripts/ui/app-shell.mjs", "utf8");
const cssSource = readFileSync(DESKTOP_SHELL_STYLESHEET_PATH, "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const expectedPrimaryLabels = ["Today", "Inbox", "Relationships", "Social", "Outreach", "Scoreboard", "Support", "Calendar", "Company Health", "Files"];
assert.deepEqual(Object.values(PRIMARY_DESTINATIONS), expectedPrimaryLabels);
assert.deepEqual(PRIMARY_SHELL_DESTINATIONS.map((item) => item.label), expectedPrimaryLabels);
assert.equal(PRIMARY_SHELL_DESTINATIONS.length, 10, "The founder shell must expose the ten primary operating destinations.");
assert.equal(new Set(PRIMARY_SHELL_DESTINATIONS.map((item) => item.label)).size, 10);
for (const forbidden of ["Work", "Queue", "Review Desk", "Reports", "Proof", "Growth", "Production", "More", "Operator Search", "Data Room", "Evidence Room"]) {
  assert.ok(!PRIMARY_SHELL_DESTINATIONS.some((item) => item.label === forbidden), `${forbidden} must not be a primary destination.`);
}

assert.deepEqual(SECONDARY_SHELL_CONTROLS.map((item) => item.label), ["Le-E", "Settings"]);
assert.deepEqual(TOP_BAR_CONTROLS.map((item) => item.label), ["Search", "Create", "Help", "Profile"]);
assert.deepEqual(Object.values(GLOBAL_UTILITIES), ["Inbox", "Search", "Create", "Le-E", "Settings", "Help", "Profile"]);
assert.deepEqual(CREATE_MENU_OPTIONS.map((item) => item.label), ["Social post", "Outreach campaign", "Partner", "File or folder", "Quick note"]);
assert.deepEqual(DEFERRED_CREATE_OPTIONS, ["Persistent folders"]);

assert.equal(APPROVED_WHITE_LOGO_PATH, "assets/brand/logos/legalease-logo-white-2025.png");
assert.equal(DESKTOP_SHELL_CONTRACT.approvedLogoPath, APPROVED_WHITE_LOGO_PATH);
assert.equal(DESKTOP_SHELL_CONTRACT.tokenStylesheetPath, TOKEN_STYLESHEET_PATH);
assert.equal(DESKTOP_SHELL_CONTRACT.shellStylesheetPath, "assets/ui/desktop-shell.css");
assert.ok(Object.isFrozen(DESKTOP_SHELL_CONTRACT));
assert.ok(Object.isFrozen(PRIMARY_SHELL_DESTINATIONS));

const chrome = renderVNextDesktopShellChrome();
assert.match(chrome.start, /<aside class="vnext-sidebar" aria-label="Command Center sidebar"[^>]*>/);
assert.match(chrome.start, /<nav class="vnext-primary-navigation" aria-label="Primary destinations">/);
assert.match(chrome.start, /<header class="vnext-topbar" aria-label="Application controls">/);
assert.match(chrome.start, /src="\/assets\/brand\/logos\/legalease-logo-white-2025\.png" width="1920" height="1080"/);
assert.match(chrome.start, /aria-haspopup="menu" aria-expanded="false" aria-controls="vnext-global-create-menu"/);
assert.match(chrome.start, /aria-haspopup="menu" aria-expanded="false" aria-controls="vnext-profile-menu"/);
assert.match(chrome.start, /data-shell-action="open-lee"/);
assert.match(chrome.start, /data-shell-action="sign-out"/);
assert.doesNotMatch(chrome.start, /Coming soon|Placeholder|href="#"|onclick=/i);

const legacyFixture = `<!doctype html><html><head><link rel="stylesheet" href="/assets/ui/tokens.css" /></head><body>
  <div class="shell">
    <header class="app-topbar"><nav class="top-nav" aria-label="Primary"><a href="#today">Today</a></nav></header>
    <div><main id="app"><h1>Current routed page</h1></main></div>
  </div>
  <div id="toast"></div><script>window.addEventListener("hashchange", render);</script></body></html>`;
const vnextFixture = renderVNextDesktopShell(legacyFixture);
assert.match(vnextFixture, /data-command-center-shell="vnext"/);
assert.match(vnextFixture, /data-vnext-shell="desktop"/);
assert.match(vnextFixture, /href="\/assets\/ui\/desktop-shell\.css"/);
assert.match(vnextFixture, /<main id="app"><h1>Current routed page<\/h1><\/main>/);
assert.equal((vnextFixture.match(/<main\b/g) || []).length, 1, "The shell must preserve one shared main region.");
assert.doesNotMatch(vnextFixture, /class="app-topbar"/);
assert.doesNotMatch(vnextFixture, /class="top-nav"/);
assert.match(vnextFixture, /window\.addEventListener\("hashchange", render\)/);
assert.match(vnextFixture, /function normalizeNestedMainRegions\(\)/);
assert.equal(renderVNextDesktopShell("not-an-application"), "not-an-application", "An invalid compatibility input must fail safely to the existing output.");

const aliases = routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]));
assert.equal(routeRegistry.length, 75);
assert.equal(aliases.length, 53);
for (const entry of routeRegistry) {
  const destination = resolveShellDestination(entry.canonicalRoute);
  assert.ok(SHELL_DESTINATION_LABELS.includes(destination), `${entry.canonicalRoute} lacks a deterministic shell destination.`);
}
for (const [alias, target] of aliases) {
  const expectedTarget = target === "growth" ? "queue" : target;
  assert.equal(canonicalRouteForShell(alias), expectedTarget, `Alias ${alias} must retain final canonical target ${expectedTarget}.`);
  assert.ok(SHELL_DESTINATION_LABELS.includes(resolveShellDestination(alias)), `Alias ${alias} lacks a shell destination.`);
}
assert.equal(canonicalRouteForShell("growth"), "queue");
assert.equal(resolveShellDestination("#item/posts/post-1"), "Social");
assert.equal(resolveShellDestination("#item/campaigns/campaign-1"), "Outreach");
assert.equal(resolveShellDestination("#item/partners/partner-1"), "Partners");
assert.equal(resolveShellDestination("#item/reports/report-1"), "Files");
assert.equal(resolveShellDestination("#item/tasks/task-1"), "Inbox");
assert.equal(resolveShellDestination("#unknown-route"), "Today");
assert.equal(canonicalRouteForShell("#unknown-route"), "today");
assert.equal(resolveShellDestination("/sources/import-social-calendar"), "Social");
assert.equal(resolveShellDestination("#rcap"), "Partners");

const canonicalRoutes = new Set(routeRegistry.map((entry) => entry.canonicalRoute));
for (const item of PRIMARY_SHELL_DESTINATIONS) {
  const resolved = resolveRouteCompatibility(`#${item.route}`);
  assert.ok(canonicalRoutes.has(item.route) || resolved.kind === "page", `${item.label} must reach a real current or vNext route.`);
}
for (const item of CREATE_MENU_OPTIONS) {
  assert.match(item.endpoint, item.id === "quick-note"
    ? /^\/api\/ui\/quick-capture$/
    : /^\/api\/ui\/create\/(?:post|campaign|partner|file)$/);
}
for (const item of SECONDARY_SHELL_CONTROLS.filter((entry) => entry.kind === "route")) {
  const resolved = resolveRouteCompatibility(`#${item.route}`);
  assert.ok(canonicalRoutes.has(item.route) || (resolved.kind === "page" && resolved.canonicalRoute === item.route), `${item.label} must reach a real current or vNext utility route.`);
}
for (const item of TOP_BAR_CONTROLS.filter((entry) => entry.kind === "route")) {
  assert.ok(canonicalRoutes.has(item.route), `${item.label} must reach a real current route.`);
}

assert.match(serverSource, /<link rel="stylesheet" href="\/assets\/ui\/tokens\.css" \/>/);
assert.match(serverSource, /import \{ renderVNextDesktopShell \} from "\.\/ui\/app-shell\.mjs";/);
assert.match(serverSource, /function renderVNextApp\(options = \{\}\) \{[\s\S]*return renderVNextDesktopShell\(renderLegacyApp\(\), \{[\s\S]*\}\);[\s\S]*return renderVNextDesktopShell\(renderLegacyApp\(\)\);\s*\}/);
assert.match(serverSource, /function renderLegacyApp\(\) \{\s*return htmlShell\(\);\s*\}/);
assert.doesNotMatch(shellSource, /COMMAND_CENTER_UX_VNEXT|localStorage|sessionStorage|document\.cookie/);
assert.doesNotMatch(shellSource, /\/api\/(?:lee|state|outreach|publishing|auth\/login)/);
assert.doesNotMatch(shellSource, /#[0-9a-fA-F]{3,8}\b/, "Shell markup must not duplicate brand colors.");
assert.doesNotMatch(cssSource, /#[0-9a-fA-F]{3,8}\b/, "Shell CSS must consume tokens instead of hard-coded colors.");
assert.match(cssSource, /background:\s*var\(--le-navy-950\)/);
assert.match(cssSource, /background:\s*var\(--le-teal-100\)/);
assert.match(cssSource, /background:\s*var\(--le-orange-600\)/);
assert.match(cssSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(cssSource, /:focus-visible/);
assert.doesNotMatch(cssSource, /(?:linear|radial)-gradient|backdrop-filter|glass/i);

for (const [label, source] of [["navigation", navigationSource], ["shell", shellSource]]) {
  for (const forbiddenImport of ["storage", "database", "access-control", "publishing", "social-publish", "safety-posture", "business-engine", "preview-server"]) {
    assert.doesNotMatch(source, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `${label} must not import ${forbiddenImport}.`);
  }
  assert.doesNotMatch(source, /^\s*import[^\n]+(?:outreach-api-integration|outreach-os|campaign-command)/im, `${label} must not import Outreach domain or execution services.`);
  assert.doesNotMatch(source, /^\s*(?:await\s+)?(?:fetch|writeFile|readFile|createServer)\s*\(/m, `${label} must have no import-time I/O.`);
}
for (const renderer of routeRegistry.map((entry) => entry.renderer.split(":")[0]).filter((value) => !value.startsWith("inline"))) {
  assert.ok(!shellSource.includes(renderer), `The shell must not duplicate ${renderer}.`);
}

const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart);
const legacyShellHash = createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex");
assert.equal(legacyShellHash, "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187", "Flag-off htmlShell output must remain unchanged.");

assert.equal(packageJson.scripts["test:vnext-desktop-shell"], "node scripts/test-vnext-desktop-shell.mjs");
assert.match(readFileSync("scripts/run-extended-tests.mjs", "utf8"), /f\.startsWith\("test-"\) && f\.endsWith\("\.mjs"\)/);

console.log(`vNext desktop shell verified: ${PRIMARY_SHELL_DESTINATIONS.length} primary destinations, ${routeRegistry.length} routes, ${aliases.length} aliases, ${CREATE_MENU_OPTIONS.length} functional Create options, and a byte-stable legacy shell.`);
