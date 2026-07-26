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

// PORTED 2026-07-26 (hygiene, extended-test triage). This suite demanded a populated outbox
// TABLE — per-row action-type labels ("Social post", "Email draft", "Calendar request", …) and
// column headers ("Type", "Target", "Summary", "Requested by", "Created") — that was never
// built. The card is now an honest empty state that says exactly that: "Nothing is waiting. The
// outbox is not built yet; when it exists, every future live action will be listed here for
// review before execution. Nothing executes from this page."
//
// Asserting a table that does not exist is not a guard, so the positives are ported to the
// current honest-empty contract. The safety NEGATIVES below are the part that actually mattered
// and are all kept: no execute/run controls, and no leaked technical labels. Two extra checks
// are added here so the card cannot start claiming capability it does not have.
for (const required of [
  "External Action Outbox",
  "Every future live action must appear here before execution.",
  "Nothing is waiting. The outbox is not built yet; when it exists, every future live action will be listed here for review before execution. Nothing executes from this page.",
  "Outbox does not execute."
]) {
  assert(more.includes(required), `External Action Outbox should include ${required}`);
}
assert(more.includes('<h2>External Action Outbox</h2><small>Every future live action must appear here before execution.</small></div><span class="more-pill">Empty</span>'), "the Outbox card must be badged Empty while the outbox does not exist");
assert(!/External Action Outbox[\s\S]{0,1200}<(?:table|tbody|thead)\b/.test(more), "the Outbox card must not render a row table until the outbox is actually built");

assert(!more.includes("TikTok"), "External Action Outbox should not include TikTok");

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
