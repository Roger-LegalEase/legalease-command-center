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

const production = functionBlock("productionWorkspaceHtml");
const moreStart = source.indexOf("function moreWorkspaceHtml");
const moreEnd = source.indexOf("function render()", moreStart);
const more = source.slice(moreStart, moreEnd);
const appStatus = functionBlock("osHealthPageHtml");
const growth = functionBlock("growthWorkspaceHtml") + "\n" + functionBlock("growthPostRows");

for (const required of [
  "LinkedIn readiness",
  "LinkedIn posting is installed but disabled unless LinkedIn is connected",
  "LinkedIn —",
  "Status: Approval workflow ready",
  "Live posting:",
  "Safety: Approved posts only",
  "Connect LinkedIn",
  "Check Status",
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
  "Post only after final approval and safety switch",
  "Bulk publishing",
  "Unapproved posting",
  "Auto-posting",
  "Analytics sync",
  "External scheduling"
]) {
  assert(production.includes(required), `LinkedIn readiness model should include ${required}`);
}

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
