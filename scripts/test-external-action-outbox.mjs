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

const more = functionBlock("moreWorkspaceHtml");

for (const required of [
  "External Action Outbox",
  "Every future live action must appear here before execution.",
  "Social post",
  "Email draft",
  "Calendar request",
  "Calendar update",
  "Analytics sync",
  "Image request",
  "Draft",
  "Needs approval",
  "Approved",
  "Blocked",
  "Completed manually",
  "Type",
  "Target",
  "Summary",
  "Requested by",
  "Created",
  "Approval",
  "Safety",
  "Outbox does not execute actions in this pass."
]) {
  assert(more.includes(required), `External Action Outbox should include ${required}`);
}

for (const forbidden of [
  "social_post",
  "email_send",
  "calendar_create",
  "calendar_update",
  "analytics_sync",
  "image_generate",
  "Action type",
  "Created at",
  "Approval required",
  "Safety notes"
]) {
  assert(!more.includes(forbidden), `External Action Outbox should not show technical label ${forbidden}`);
}

assert(!more.includes("Execute Action"), "Outbox should not expose execute controls");
assert(!more.includes("Run Action"), "Outbox should not expose run controls");
assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0");

console.log("external action outbox tests passed.");
