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
  "Detailed production workflow",
  "Delete",
  "Delete Selected"
]) {
  assert(queue.includes(required), `Queue should include ${required}`);
}

for (const required of [
  "Delete this queue item?",
  "This removes the draft from your Queue. This will not delete any published posts.",
  "Delete selected queue items?",
  "This removes the selected drafts from your Queue. Published posts are not affected.",
  "Your Queue is clear.",
  "Import a calendar or add a new draft to get started.",
  "Remove from Queue",
  "This item may already be published. Deleting it only removes it from Command Center history and does not remove it from the social platform."
]) {
  assert(source.includes(required), `Queue delete flow should include ${required}`);
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
assert(source.includes("let queueDeleteDialog = null"), "Queue delete confirmation state should be tracked.");
assert(source.includes("function openQueueDeleteDialog"), "Single item delete should open a confirmation dialog.");
assert(source.includes("function openBulkQueueDeleteDialog"), "Bulk delete should open a confirmation dialog.");
assert(source.includes("function cancelQueueDelete"), "Cancel should close the delete dialog without deleting.");
assert(source.includes("async function confirmQueueDelete"), "Confirmed delete should persist the removal.");
assert(source.includes('status:"deleted"'), "Queue delete should soft-delete items.");
assert(source.includes("const deletedAt = new Date().toISOString()") && source.includes("deletedAt,"), "Queue delete should record when an item was removed.");
assert(source.includes('deletedSource:"queue_delete"'), "Queue delete should record a plain internal delete source.");
assert(source.includes("/api/posts/update"), "Queue delete should reuse the existing post update persistence path.");
assert(source.includes("isQueueItemVisible"), "Queue should filter deleted items out of the default view.");
assert(source.includes('post.status !== "deleted"'), "Deleted queue items should stay hidden after refresh or rerender.");
assert(source.includes("!post.deletedAt"), "Soft-deleted queue items should stay hidden after refresh or rerender.");
assert(source.includes("selectedPosts.size") && source.includes("Delete Selected"), "Bulk delete should only appear when items are selected.");

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
