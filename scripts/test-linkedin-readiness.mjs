#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n\s*function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

// PORTED 2026-07-26 (hygiene, extended-test triage).
//
// `productionWorkspaceHtml` is now a one-line delegate — `return
// productionCommandSurfaceHtml(pageClass);` — so every assertion that read its block was
// reading three lines of code. Two consequences were fixed here:
//
//  1. The positive LinkedIn-readiness copy this suite demanded of the Production workspace
//     ("LinkedIn readiness", "View LinkedIn Approval Queue", "Preview LinkedIn Post",
//     "Connect LinkedIn", the readiness-model rows) has ZERO occurrences anywhere in the
//     product. That per-channel readiness detail moved to the Activation Center
//     (`moreWorkspaceHtml`) and App Status (`osHealthPageHtml`), which this suite already
//     asserts against below and which still carry every one of those strings. Re-asserting
//     the old Production copy would be asserting copy that no longer exists, so it is
//     dropped here rather than duplicated.
//  2. The negative safety assertions ("Post Now", "Publish Now", "Send to LinkedIn", …) had
//     become VACUOUS against the three-line delegate. They are repointed at
//     `productionCommandSurfaceHtml`, the ~10KB block that actually renders the Production
//     workspace, so they test something again.
const production = functionBlock("productionCommandSurfaceHtml");
assert(production.length > 2000, "productionCommandSurfaceHtml should be the real Production surface, not a delegate; if this shrinks, the safety negatives below have gone vacuous again");
assert(functionBlock("productionWorkspaceHtml").includes("productionCommandSurfaceHtml(pageClass)"), "productionWorkspaceHtml should still delegate to the Production command surface");
const moreStart = source.indexOf("function moreWorkspaceHtml");
const moreEnd = source.indexOf("function render()", moreStart);
const more = source.slice(moreStart, moreEnd);
const appStatus = functionBlock("osHealthPageHtml");
const growth = functionBlock("growthWorkspaceHtml") + "\n" + functionBlock("growthPostRows");

for (const required of [
  "LinkedIn",
  "LinkedIn posting:",
  "LinkedIn posting is installed but disabled.",
  "Social accounts:",
  "Not connected",
  "Live social posting:",
  "Off"
]) {
  assert(appStatus.includes(required), `App Status should include LinkedIn readiness copy: ${required}`);
}

for (const required of [
  "LinkedIn",
  "Status:",
  "Not connected",
  "Ready:",
  "Approval workflow can prepare LinkedIn posts internally.",
  "Not ready:",
  "LinkedIn connection needs setup if required connection settings or safe account storage are missing.",
  "Next step:",
  "Check LinkedIn Status.",
  "Safety state:",
  "Approved posts only."
]) {
  assert(more.includes(required), `Activation Center should include LinkedIn readiness copy: ${required}`);
}

assert(growth.includes("Move to LinkedIn Review"), "Growth should be able to route ready posts to LinkedIn review");

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Connect OAuth",
  "Send to LinkedIn",
  "Go Live"
]) {
  assert(!production.includes(forbidden), `Production should not include ${forbidden}`);
  assert(!more.includes(forbidden), `Activation/More should not include ${forbidden}`);
}

assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("linkedin readiness tests passed.");
