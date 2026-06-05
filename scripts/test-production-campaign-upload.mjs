#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
const course = readFileSync(join(process.cwd(), "docs", "course", "LegalEase_Command_Center_Course.html"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const production = functionBlock("productionWorkspaceHtml");

for (const required of [
  "Campaign Upload",
  "Upload a spreadsheet and turn it into a 30-day production queue.",
  "campaign-upload-input",
  "accept=\".csv,.xlsx",
  "Upload Spreadsheet",
  "Download Template",
  "Upload plan",
  "Review posts",
  "Generate images",
  "Approve schedule",
  "Uploads create internal drafts only.",
  "Nothing gets posted.",
  "Nothing gets scheduled on social platforms.",
  "You approve before anything moves forward.",
  "CSV and XLSX uploads are ready. Imports create internal queue items only.",
  "View template details",
  "View Wilma rules",
  "View overlay text options",
  "Import Preview",
  "Platform",
  "Caption Preview",
  "Image Plan",
  "Wilma",
  "Approval",
  "This file needs Date, Platform, and Caption columns before it can be imported.",
  "Confirm Import",
  "Fix Issues",
  "Cancel",
  "Confirm Import creates internal drafts only.",
  "Creative Recommendations",
  "The Command Center recommends image direction, Wilma usage, and overlay text after import.",
  "Nothing has been published by the OS",
  "Duplicate rows are skipped before saving."
]) {
  assert(production.includes(required), `Production Campaign Upload should include ${required}`);
}

assert(production.includes("Platform values: LinkedIn, Facebook, Instagram, Twitter / X."), "Campaign Upload platform guidance should include Twitter / X");
assert(!production.includes("Platform values: LinkedIn, Facebook, Instagram, TikTok."), "Campaign Upload platform guidance should not include TikTok");
assert(course.includes("Twitter / X"), "Course platform references should include Twitter / X");
assert(!course.includes("TikTok"), "Course platform references should not include TikTok");
assert(!course.includes("tiktok"), "Course platform references should not include lowercase tiktok");

for (const forbidden of [
  "Time, Platform, Campaign, Post Type, Topic, Caption, Headline",
  "Creative Recommendation Engine",
  "post_type",
  "image_direction",
  "overlay_text",
  "wilma_preference",
  "approval_owner",
  "use_wilma",
  "wilma_optional",
  "wilma_helper",
  "do_not_use_wilma",
  "never_use_wilma",
  "overlayHeadline",
  "overlaySubhead",
  "overlayCTA",
  "overlayPlacement",
  "overlayAlignment",
  "overlayStyle",
  "Post Now",
  "Publish Now",
  "TikTok",
  "tiktok",
  "OAuth",
  "token",
  "webhook",
  "API status",
  "external action dispatcher",
  "live gates"
]) {
  assert(!production.includes(forbidden), `Production Campaign Upload should not include ${forbidden}`);
}

assert(!production.includes("disabled title=\"Spreadsheet upload"), "Upload Spreadsheet should not be disabled");
assert(source.includes("function parseCampaignCsvText"), "CSV parsing should be implemented for Campaign Upload");
assert(source.includes("async function parseCampaignXlsxFile"), "XLSX parsing should be implemented for Campaign Upload");
assert(source.includes("Content Calendar"), "XLSX parser should look for the Content Calendar sheet");
assert(source.includes("function campaignScheduledAt"), "Campaign Upload should combine date/time into scheduled_at");
assert(source.includes("function campaignQueueStatus"), "Campaign Upload should normalize draft, approved, and scheduled statuses");
assert(source.includes("function campaignImportKey"), "Campaign Upload should create a stable duplicate-prevention key");
assert(source.includes("Duplicate rows are skipped before saving."), "Campaign Upload should explain duplicate prevention");
assert(source.includes("Meta is paused. Imported as draft for review only."), "Facebook and Instagram rows should stay safe while Meta is paused");
assert(source.includes("hashtags:campaignHashtags(record)"), "Campaign Upload should map hashtags into queue items");
assert(source.includes("scheduled_at:scheduledAt"), "Campaign Upload should map date/time into scheduled_at");
assert(source.includes("approvalOwner:campaignRecordValue(record, \"Approval Owner\")"), "Campaign Upload should preserve approval owner");
assert(source.includes("function handleCampaignSpreadsheetUpload"), "Campaign Upload should handle file selection");
assert(source.includes("window.handleCampaignSpreadsheetUpload = handleCampaignSpreadsheetUpload"), "Upload handler should be callable from the file input");
assert(source.includes("state.posts = [...imported"), "Confirm Import should create internal draft records only");
assert(!source.includes("CSV upload is ready. XLSX support can be added next."), "Campaign Upload should not reject XLSX as future work");
assert(source.includes(".production-workspace { display:grid; gap:18px; width:100%; max-width:min(1180px, calc(100vw - 32px));"), "Production workspace should be contained within the viewport");
assert(source.includes(".campaign-upload-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);"), "Campaign Upload grid should use safe responsive columns");
assert(source.includes(".campaign-upload-row { display:grid; grid-template-columns:minmax(60px,.72fr)"), "Campaign Upload preview rows should fit inside the card");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("production campaign upload tests passed.");
