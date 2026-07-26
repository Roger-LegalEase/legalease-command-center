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
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

// PORTED 2026-07-26 (hygiene, extended-test triage). Same rot as
// test-linkedin-readiness.mjs: `productionWorkspaceHtml` is now a one-line delegate
// (`return productionCommandSurfaceHtml(pageClass);`), so both the positive copy checks and
// the negative safety checks were being run against three lines of code.
//
//  1. The Production-workspace Twitter / X readiness copy ("Twitter / X readiness",
//     "View Twitter / X Approval Queue", "Preview Twitter / X Post", "Prepare Twitter / X",
//     the readiness-model rows) has ZERO occurrences anywhere in the product. That detail
//     moved to the Activation Center (`moreWorkspaceHtml`) and App Status
//     (`osHealthPageHtml`), both already asserted below and both still carrying it. The
//     dead Production copy assertions are therefore dropped, not duplicated.
//  2. The negative safety assertions are repointed at `productionCommandSurfaceHtml`, the
//     block that actually renders the Production workspace, so they stop being vacuous.
const production = functionBlock("productionCommandSurfaceHtml");
assert(production.length > 2000, "productionCommandSurfaceHtml should be the real Production surface, not a delegate; if this shrinks, the safety negatives below have gone vacuous again");
assert(functionBlock("productionWorkspaceHtml").includes("productionCommandSurfaceHtml(pageClass)"), "productionWorkspaceHtml should still delegate to the Production command surface");
const moreStart = source.indexOf("function moreWorkspaceHtml");
const moreEnd = source.indexOf("function render()", moreStart);
const more = source.slice(moreStart, moreEnd);
const appStatus = functionBlock("osHealthPageHtml");
const growth = functionBlock("growthWorkspaceHtml") + "\n" + functionBlock("growthPostRows");

for (const required of [
  "Twitter / X",
  "Not connected / approval workflow ready",
  "Social accounts:",
  "Not connected",
  "Live social posting:",
  "Off"
]) {
  assert(appStatus.includes(required), `App Status should include Twitter / X readiness copy: ${required}`);
}

for (const required of [
  "Twitter / X",
  "Status:",
  "Not connected",
  "Ready:",
  "Approval workflow can prepare Twitter / X posts internally.",
  "Not ready:",
  "No Twitter / X connection starts here.",
  "Next step:",
  "Prepare Twitter / X checklist.",
  "Safety:",
  "No live posting."
]) {
  assert(more.includes(required), `Activation Center should include Twitter / X readiness copy: ${required}`);
}

assert(growth.includes("Move to Twitter / X Review"), "Growth should be able to route ready posts to Twitter / X review");

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Connect OAuth",
  "Send to Twitter / X",
  "Go Live"
]) {
  assert(!production.includes(forbidden), `Production should not include ${forbidden}`);
  assert(!more.includes(forbidden), `Activation/More should not include ${forbidden}`);
}

assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("twitter x readiness tests passed.");
