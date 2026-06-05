#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
const brain = readFileSync(join(process.cwd(), "scripts", "daily-run-session.mjs"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const guidedQueue = functionBlock("guidedQueueWorkbenchHtml");
const guidedRows = functionBlock("guidedQueueBucketItems");
const guidedHeader = functionBlock("guidedQueueBucketHeader");
const queueSectionStart = source.indexOf('<section id="queue"');
const queueSectionEnd = source.indexOf('<section id="sources"', queueSectionStart);
const queueSection = source.slice(queueSectionStart, queueSectionEnd);

for (const required of [
  "guidedQueueWorkbenchHtml",
  "guidedQueueBucketItems",
  "guidedQueueBucketHeader",
  "active.bucket_snapshot",
  "active.current_bucket_key",
  "remaining count",
  "Decision mode",
  "Continue / Complete Bucket",
  "Skip This Bucket",
  "Skip to Bucket",
  "Park Item",
  "Park Bucket",
  "Parking reason",
  "Waiting on external account",
  "Need more information",
  "Not doing today",
  "Blocked by Meta/security",
  "Needs partner response",
  "Other"
]) {
  assert(source.includes(required), `Guided Queue should include ${required}`);
}

for (const required of [
  "Blocked items",
  "Reconnect or park blockers before operating the rest of the day.",
  "Due today",
  "Posts and tasks scheduled to go out today.",
  "Overdue follow-ups",
  "Partner and revenue follow-ups past due.",
  "Ready to ship",
  "Approved content waiting to be scheduled.",
  "Bulk review",
  "Imported posts waiting for batch approval.",
  "Creative prep",
  "Items needing an image or asset before they can ship.",
  "Review work",
  "Reports and proof-to-content needing a closer read.",
  "RCAP watch",
  "Readiness and watch items.",
  "Paused and future",
  "Meta-paused rows and items not due yet."
]) {
  assert(source.includes(required), `Guided bucket copy should include ${required}`);
}

for (const required of [
  "Blocker fix",
  "Time-sensitive ship",
  "Bulk approval",
  "Creative prep",
  "Judgment follow-up",
  "Review work",
  "Paused/future",
  "Reconnect X",
  "Open Settings",
  "Prepare Public Image",
  "Fix Schedule",
  "Select All Visible",
  "Clear Selection",
  "Approve Selected",
  "Approve Batch with Imported Schedule",
  "Soft Delete Selected",
  "Hide for Session",
  "Run Publisher in Command"
]) {
  assert(source.includes(required), `Guided decision controls should include ${required}`);
}

for (const route of [
  'url.pathname === "/api/daily-run/skip-bucket"',
  'url.pathname === "/api/daily-run/jump-bucket"',
  'url.pathname === "/api/daily-run/complete-bucket"',
  'url.pathname === "/api/daily-run/complete-item"',
  'url.pathname === "/api/daily-run/park-bucket"'
]) {
  assert(source.includes(route), `Guided Queue API route should exist: ${route}`);
}

for (const required of [
  "skipDailyRunBucket",
  "jumpDailyRunBucket",
  "completeDailyRunBucket",
  "completeDailyRunItem",
  "parkDailyRunBucket",
  "dailyRunBucketRemainingCount",
  "dailyRunBucketHeadline"
]) {
  assert(brain.includes(`export function ${required}`) || source.includes(required), `Brain helper should be used or exported: ${required}`);
}

assert(guidedQueue.includes("session.bucket_snapshot") || guidedQueue.includes("active.bucket_snapshot"), "Guided Queue must read the stored session snapshot.");
assert(!guidedQueue.includes("buildDailyRunSnapshot"), "Guided Queue must not recompute bucket membership in the UI layer.");
assert(!guidedRows.includes("buildDailyRunSnapshot"), "Guided Queue item rows must not re-run snapshot classification.");
assert(brain.includes("bucketItemsByKey") && guidedRows.includes("bucketItemsByKey"), "Guided Queue should consume brain-computed remaining items by bucket.");
for (const duplicateClearingSource of ["parked_items", "completed_items", "skipped_bucket_keys"]) {
  assert(!guidedRows.includes(duplicateClearingSource), `Guided Queue rows should not duplicate clearing logic for ${duplicateClearingSource}.`);
}
assert(brain.includes("dailyRunBucketRemainingCount") && guidedHeader.includes("activeBucketRemainingCount"), "Guided Queue should consume the brain-computed remaining count.");
assert(brain.includes("dailyRunBucketHeadline") && guidedHeader.includes("activeBucketHeadline"), "Guided Queue should consume the brain-computed headline.");
assert(queueSection.includes("${guidedQueueWorkbenchHtml()}"), "Queue page should render Guided Queue mode above normal Queue.");
assert(source.includes("guidedQueueMode") && source.includes("exitGuidedQueueMode") && source.includes("resumeGuidedQueueMode"), "Roger should be able to exit and resume guided mode.");
assert(source.includes("selectedGuidedPosts") && source.includes("selectAllVisibleGuidedItems"), "Guided bulk selection should be scoped to visible guided rows.");
assert(source.includes("selectedGuidedPosts = new Set()"), "Guided selection should clear when bucket or filter changes.");
assert(source.includes("approveSelectedGuidedPosts") && source.includes("markSelectedGuidedPostsReviewed"), "Guided bulk actions should update selected rows only.");
assert(source.includes("approveBatchWithImportedSchedule"), "Guided Queue should provide Approve Batch with Imported Schedule.");
assert(source.includes("status:\"scheduled\"") && source.includes("scheduledFor"), "Approve Batch with Imported Schedule should use imported schedule fields.");
assert(source.includes("openGuidedBulkDeleteDialog") && source.includes("Remove selected queue items from this working set?"), "Guided bulk delete should be confirmed and soft.");
assert(source.includes("status:\"deleted\"") && source.includes('deletedSource:"queue"'), "Guided bulk delete should reuse soft-delete behavior.");

for (const forbidden of [
  "Publish Selected",
  "Post Now",
  "Publish Now",
  "Tweet Now",
  "Send Now",
  "Send to X",
  "Send to LinkedIn",
  "Send to Facebook",
  "Send to Instagram"
]) {
  assert(!guidedQueue.includes(forbidden), `Guided Queue should not expose ${forbidden}`);
}

console.log("guided queue workbench tests passed.");
