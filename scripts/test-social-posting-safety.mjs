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
const queue = functionBlock("linkedinApprovalQueueHtml");
const twitterXQueue = functionBlock("twitterXApprovalQueueHtml");
const moreStart = source.indexOf("function moreWorkspaceHtml");
const moreEnd = source.indexOf("function render()", moreStart);
const more = source.slice(moreStart, moreEnd);
const appStatus = functionBlock("osHealthPageHtml");
const visibleUi = [production, queue, twitterXQueue, more, appStatus].join("\n");

for (const required of [
  "Live social posting: Off",
  "Live social posting is off",
  "Outbox does not execute actions in this pass.",
  "Social post",
  "Target:",
  "LinkedIn",
  "LinkedIn post prepared for approval",
  "Twitter / X",
  "Twitter / X post prepared for approval",
  "Approval:",
  "Required",
  "Safety:"
]) {
  assert(visibleUi.includes(required), `Social posting safety UI should include ${required}`);
}

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Send to LinkedIn",
  "Send to Twitter / X",
  "Connect OAuth",
  "Go Live",
  "LinkedIn API",
  "Twitter / X API",
  "access token",
  "API key"
]) {
  assert(!visibleUi.includes(forbidden), `Normal UI should not include ${forbidden}`);
}

assert(!production.includes("OAuth"), "Production normal UI should not mention OAuth");
assert(!queue.includes("OAuth"), "LinkedIn Approval Queue should not mention OAuth");
assert(!more.includes("Connect OAuth"), "More should not expose OAuth connection controls");
assert(!source.includes("ENABLE_LIVE_LINKEDIN_POSTING === \"true\" &&"), "LinkedIn live posting should not be enabled by this pass");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("social posting safety tests passed.");
