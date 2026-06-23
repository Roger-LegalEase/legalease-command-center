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

const production = functionBlock("productionCommandSurfaceHtml");
const importSurface = functionBlock("socialCalendarImportHtml");

assert(!production.includes("Campaign Upload"), "Production command surface should not expose the old Campaign Upload panel");
assert(importSurface.includes("Import Social Calendar"), "Campaign import should remain available as an internal import surface");

for (const required of [
  "XLSX or CSV into Queue",
  "sources-calendar-upload-input",
  "accept=\".csv,.xlsx",
  "Import Social Calendar",
  "Download Template",
  "Review Import Preview",
  "Nothing posts during import.",
  "Facebook and Instagram stay draft/paused while Meta is paused.",
  "LinkedIn and Twitter / X rows stay internal until review.",
  "Duplicate rows are skipped before saving.",
  "Date",
  "Platform",
  "Caption Preview",
  "Image Plan",
  "Wilma",
  "Approval",
  "Confirm Import",
  "Cancel",
  "Confirm Import creates internal Queue items only. No provider APIs are called."
]) {
  assert(importSurface.includes(required), `Campaign import surface should include ${required}`);
}

assert(course.includes("Twitter / X"), "Course platform references should include Twitter / X");
assert(!course.includes("TikTok"), "Course platform references should not include TikTok");
assert(!course.includes("tiktok"), "Course platform references should not include lowercase tiktok");

for (const forbidden of [
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
  assert(!importSurface.includes(forbidden), `Campaign import surface should not include ${forbidden}`);
}

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
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("production campaign upload tests passed.");
