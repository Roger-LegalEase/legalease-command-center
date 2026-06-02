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
  "Twitter / X readiness",
  "Twitter / X posting is not connected yet. Posts can be prepared and approved internally.",
  "Twitter / X — Not connected",
  "Status: Approval workflow ready",
  "Next step: Prepare Twitter / X connection",
  "Safety: No live posting",
  "Prepare Twitter / X",
  "View Twitter / X Approval Queue",
  "Preview Twitter / X Post"
]) {
  assert(production.includes(required), `Production should include ${required}`);
}

for (const required of [
  "Not connected",
  "Ready to configure",
  "Approval workflow ready",
  "Needs setup",
  "Error",
  "Preview Twitter / X post",
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
  assert(production.includes(required), `Twitter / X readiness model should include ${required}`);
}

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
