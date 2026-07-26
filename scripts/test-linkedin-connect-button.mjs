import fs from "node:fs";
import assert from "node:assert";

const source = fs.readFileSync("scripts/preview-server.mjs", "utf8");

function functionBlock(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n\s*function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

// PORTED 2026-07-26 (hygiene, extended-test triage). Two rot modes hit this suite at once:
//   1. `productionWorkspaceHtml` became a one-line delegate to `productionCommandSurfaceHtml`,
//      so every assertion below was reading three lines of code — the positives failed and the
//      negatives had gone vacuous.
//   2. The "Connected Accounts" section that owns the LinkedIn Prepare/Connect controls moved
//      off Production and into the Activation Center (`moreWorkspaceHtml`), which still carries
//      "Prepare LinkedIn", "Connect LinkedIn", `showLinkedInSetupChecklist()` and
//      `connectLinkedIn()` verbatim.
// The positives are therefore asserted against the block that now renders them, and the
// negatives are asserted against BOTH surfaces so neither can regrow a live-posting control.
const connectedAccounts = (() => {
  const start = source.indexOf("function moreWorkspaceHtml");
  return source.slice(start, source.indexOf("function render()", start));
})();
const productionSurface = functionBlock("productionCommandSurfaceHtml");
assert(productionSurface.length > 2000, "productionCommandSurfaceHtml should be the real Production surface, not a delegate");
assert(functionBlock("productionWorkspaceHtml").includes("productionCommandSurfaceHtml(pageClass)"), "productionWorkspaceHtml should still delegate to the Production command surface");
const client = source.slice(source.indexOf("async function connectChannel"));
const handle = source.slice(source.indexOf("async function handleRequest"));

for (const required of [
  "Prepare LinkedIn",
  "Connect LinkedIn",
  "showLinkedInSetupChecklist",
  "connectLinkedIn",
  "LinkedIn app created",
  "Redirect URL added under Auth",
  "Render env vars added",
  "Manual deploy completed",
  "Live posting remains off",
  "Use this Settings row to review setup details, then connect after owner sign-in and setup review."
]) {
  assert(source.includes(required), `LinkedIn connect UI should include ${required}`);
}

assert(connectedAccounts.includes("Prepare LinkedIn"), "Connected Accounts should include Prepare LinkedIn");
assert(connectedAccounts.includes("Connect LinkedIn"), "Connected Accounts should include Connect LinkedIn");
assert(connectedAccounts.includes("showLinkedInSetupChecklist()"), "Prepare LinkedIn should open the setup checklist");
assert(connectedAccounts.includes("connectLinkedIn()"), "Connect LinkedIn should call the safe connect helper");
assert(!connectedAccounts.includes("window.location.href='/api/linkedin/connect'"), "Connect LinkedIn should not navigate silently without owner auth handling");
assert(!productionSurface.includes("window.location.href='/api/linkedin/connect'"), "the Production surface should not navigate silently to LinkedIn connect either");
assert(!source.includes("Prepare LinkedIn from Production"), "Settings LinkedIn row should not send Roger back to Production for connection setup");

assert(client.includes('api("/api/linkedin/status")'), "Connect helper should check LinkedIn status with owner auth");
assert(client.includes('api("/api/linkedin/connect?format=json")'), "Connect helper should request an authorized OAuth URL");
assert(client.includes("LinkedIn connection needs setup."), "Missing config should show setup reason");
assert(client.includes("Sign in as owner before connecting LinkedIn."), "Owner auth failure should show owner sign-in reason");
assert(client.includes("window.location.href = result.authorizationUrl"), "Connect helper should start the OAuth flow only after receiving a safe URL");

assert(handle.includes('url.pathname === "/api/linkedin/connect"'), "LinkedIn connect route should exist");
assert(handle.includes('url.searchParams.get("format") === "json"'), "LinkedIn connect route should support JSON response for authenticated app calls");
assert(handle.includes("authorizationUrl"), "LinkedIn connect route should return authorizationUrl for app-driven OAuth");

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Send to LinkedIn",
  "LINKEDIN_CLIENT_SECRET",
  "accessTokenEncrypted",
  "refreshTokenEncrypted"
]) {
  assert(!productionSurface.includes(forbidden), `Production UI should not expose ${forbidden}`);
  assert(!connectedAccounts.includes(forbidden), `Connected Accounts should not expose ${forbidden}`);
}

assert(source.includes("liveGatesCount") && source.includes("linkedinLivePostingSwitchEnabled"), "LinkedIn live gates should remain explicit and guarded");

console.log("linkedin connect button tests passed.");
