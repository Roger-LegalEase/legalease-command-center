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

const queue = functionBlock("linkedinApprovalQueueHtml");

assert(source.includes('safeRenderModule("production-linkedin-queue"'), "Production must wire the LinkedIn Approval Queue deep link.");
assert(source.includes('linkedin:"production-linkedin-queue"'), "The LinkedIn queue alias must resolve.");
assert(queue.includes("Show which posts are ready for LinkedIn review."), "LinkedIn Approval Queue should explain its purpose");

for (const required of [
  "Draft",
  "Needs image",
  "Ready for review",
  "Needs approval",
  "Approved internally",
  "Scheduled internally",
  "Published manually",
  "post title",
  "caption preview",
  "image status",
  "approval status",
  "platform: LinkedIn",
  "next action",
  "safety note",
  "Preview",
  "Review Image",
  "Approve Internally",
  "Schedule Internally",
  "Mark Published Manually",
  "No live posting"
]) {
  assert(queue.includes(required), `LinkedIn Approval Queue should include ${required}`);
}

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Send to LinkedIn",
  "Connect OAuth",
  "Go Live"
]) {
  assert(!queue.includes(forbidden), `LinkedIn Approval Queue should not include ${forbidden}`);
}

assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("linkedin approval queue tests passed.");
