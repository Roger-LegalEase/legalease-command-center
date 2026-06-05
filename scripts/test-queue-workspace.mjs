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
  "This removes the draft from your Queue. This will not delete anything from Facebook, Instagram, LinkedIn, or X.",
  "Delete selected queue items?",
  "This removes the selected drafts from your Queue. Published posts are not affected.",
  "Your Queue is clear.",
  "Import a calendar or add a new draft to get started.",
  "Remove from Queue",
  "This item may already be published. Deleting it only removes it from Command Center history and does not remove it from the social platform.",
  "Generate Image",
  "Edit Image Prompt",
  "Post Preview",
  "Refresh Preview",
  "Image generation prepares a draft creative only. Nothing is posted automatically.",
  "Image Direction",
  "Overlay Text",
  "Image Prompt",
  "No image direction yet.",
  "Image draft needed",
  "Wilma optional"
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
  "Social Posts",
  "Partner Follow-ups",
  "Reports",
  "Proof-to-Content",
  "Channel Reviews"
]) {
  assert(source.includes(required), `Queue helpers should include ${required}`);
}

for (const required of [
  "Social Post",
  "Imported Calendar",
  "Social Post ·",
  "Status: Needs Review",
  "Status: Image Needed",
  "Status: Image Ready",
  "Status: Reviewed",
  "Status: Approved",
  "Status: Scheduled",
  "Status: Deleted",
  "These are draft social posts imported from your calendar or created manually. Review copy, generate images, preview, then approve or schedule.",
  "Preview: Not Viewed",
  "Preview: Viewed"
]) {
  assert(source.includes(required), `Queue should clarify social post type/status: ${required}`);
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
assert(source.includes("@media (max-width:760px)") && source.includes(".queue-review-item,.queue-platform-preview { grid-template-columns:1fr; display:grid; }"), "Queue review rows and previews should stack before becoming cramped.");
assert(source.includes("let queueDeleteDialog = null"), "Queue delete confirmation state should be tracked.");
assert(source.includes("function openQueueDeleteDialog"), "Single item delete should open a confirmation dialog.");
assert(source.includes("function openBulkQueueDeleteDialog"), "Bulk delete should open a confirmation dialog.");
assert(source.includes("function cancelQueueDelete"), "Cancel should close the delete dialog without deleting.");
assert(source.includes("async function confirmQueueDelete"), "Confirmed delete should persist the removal.");
assert(source.includes('status:"deleted"'), "Queue delete should soft-delete items.");
assert(source.includes("const deletedAt = new Date().toISOString()") && source.includes("deletedAt,"), "Queue delete should record when an item was removed.");
assert(source.includes("/api/posts/update"), "Queue delete should reuse the existing post update persistence path.");
assert(source.includes("isQueueItemVisible"), "Queue should filter deleted items out of the default view.");
assert(source.includes('post.status !== "deleted"'), "Deleted queue items should stay hidden after refresh or rerender.");
assert(source.includes("!post.deletedAt"), "Soft-deleted queue items should stay hidden after refresh or rerender.");
assert(source.includes("selectedPosts.size") && source.includes("Delete Selected"), "Bulk delete should only appear when items are selected.");
assert(source.includes("queueImageWorkspaceHtml"), "Queue cards should render an image workspace in the actual card details.");
assert(source.includes("queuePostPreviewHtml"), "Queue cards should render post previews in the actual card details.");
assert(source.includes("generateQueueImageDraft"), "Queue should generate safe internal image drafts.");
assert(source.includes("saveQueueImagePrompt"), "Queue should persist edited image prompts.");
assert(source.includes("markQueueImageReady"), "Queue should support marking an image ready.");
assert(source.includes("imageStatus:\"draft_generated\""), "Generated image placeholders should use the draft_generated image status.");
assert(source.includes("imageStatus:\"ready\""), "Mark Image Ready should set imageStatus to ready.");
assert(source.includes('deletedSource:"queue"'), "Queue delete should record a plain internal delete source.");

const queueReviewListStart = source.indexOf("function queueReviewRows");
const queueReviewListEnd = source.indexOf("function queueReviewTabsHtml", queueReviewListStart);
const markImageCard = source.slice(queueReviewListStart, queueReviewListEnd);
for (const required of ["Delete", "Generate Image", "queuePostPreviewHtml(post)"]) {
  assert(markImageCard.includes(required), `The same Queue card containing Mark Image Ready should include ${required}.`);
}

for (const required of ["Generate Image", "Preview", "Mark Reviewed", "Delete"]) {
  assert(markImageCard.includes(required), `Social post cards should include primary action ${required}.`);
}

const importedCalendarMapping = source.slice(source.indexOf("function confirmCampaignImport"), source.indexOf("function clearCampaignPreview"));
for (const required of [
  "caption",
  "platform",
  "imageBrief",
  "overlayText",
  "wilmaPreference",
  "headline",
  "subhead",
  "cta",
  "link"
]) {
  assert(importedCalendarMapping.includes(required), `Imported social calendar posts should keep ${required}.`);
}

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
