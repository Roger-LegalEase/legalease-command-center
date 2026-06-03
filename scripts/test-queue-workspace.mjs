#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
const queueStart = source.indexOf('<section id="queue"');
const sourcesStart = source.indexOf('<section id="sources"', queueStart);
assert(queueStart >= 0, "#queue section should render");
assert(sourcesStart > queueStart, "#sources should follow #queue");

const queue = source.slice(queueStart, sourcesStart);
const mainQueue = queue.slice(0, queue.indexOf("Detailed production workflow"));

for (const required of [
  "Queue",
  "Review posts, follow-ups, reports, and partner work before anything moves forward.",
  "Safe mode: approvals prepare work only. Nothing sends or publishes automatically.",
  "Needs review",
  "One clear action per item",
  "Detailed production workflow"
]) {
  assert(queue.includes(required), `Queue should include ${required}`);
}

for (const required of [
  "Posts",
  "Partner follow-ups",
  "PR drafts",
  "Reports",
  "Proof-to-content",
  "Channel reviews",
  "All",
  "Follow-ups",
  "Partners"
]) {
  assert(source.includes(required), `Queue helpers should include ${required}`);
}

for (const required of [
  "queue-review-hero",
  "queue-summary-grid",
  "queue-review-tabs",
  "queue-review-list",
  "queue-review-item",
  "queue-detail-workflow"
]) {
  assert(source.includes(required), `Queue should include ${required}`);
}

for (const clutter of [
  "Add tomorrow's posts",
  "Bulk mode",
  "Check readiness",
  "Needs Final PNG",
  "Manual Kit",
  "post-grid"
]) {
  assert(!mainQueue.includes(clutter), `Queue main view should not expose production clutter: ${clutter}`);
}

assert(queue.indexOf("Detailed production workflow") < queue.indexOf("post-grid"), "Detailed production cards should live behind the collapsed workflow.");
assert(source.includes("setQueueTypeFilter"), "Queue category filters should be wired.");
assert(source.includes('Review Publish Setup'), "Ready posts should use safe setup-review language.");
assert(source.includes("@media (max-width:760px) { .queue-review-hero-head,.queue-review-item { grid-template-columns:1fr; display:grid; }"), "Queue review rows should stack before becoming cramped.");

for (const forbidden of [
  "Post Now",
  "Send to LinkedIn",
  "Confirm Publish",
  "This will post live"
]) {
  assert(!queue.includes(forbidden), `Queue visible UI should not include ${forbidden}`);
}

assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0.");

console.log("queue workspace tests passed.");
