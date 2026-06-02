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

const production = functionBlock("productionWorkspaceHtml");
const moreStart = source.indexOf("function moreWorkspaceHtml");
const moreEnd = source.indexOf("function render()", moreStart);
const more = source.slice(moreStart, moreEnd);
const appStatus = functionBlock("osHealthPageHtml");
const growth = functionBlock("growthWorkspaceHtml") + "\n" + functionBlock("growthPostRows");

for (const required of [
  "LinkedIn readiness",
  "LinkedIn posting is not connected yet. Posts can be prepared and approved internally.",
  "LinkedIn — Not connected",
  "Status: Approval workflow ready",
  "Next step: Prepare LinkedIn connection",
  "Safety: No live posting",
  "Prepare LinkedIn",
  "View LinkedIn Approval Queue",
  "Preview LinkedIn Post"
]) {
  assert(production.includes(required), `Production should include ${required}`);
}

for (const required of [
  "Not connected",
  "Ready to configure",
  "Approval workflow ready",
  "Needs setup",
  "Error",
  "Preview LinkedIn post",
  "Review image",
  "Approve post",
  "Prepare scheduling",
  "Post only after future live connector is approved",
  "Live posting",
  "Account connection",
  "Auto-posting",
  "Analytics sync",
  "Credential storage",
  "External scheduling"
]) {
  assert(production.includes(required), `LinkedIn readiness model should include ${required}`);
}

for (const required of [
  "LinkedIn",
  "Not connected / approval workflow ready",
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
  "No LinkedIn connection starts here.",
  "Next step:",
  "Prepare LinkedIn checklist.",
  "Safety:",
  "No live posting."
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
