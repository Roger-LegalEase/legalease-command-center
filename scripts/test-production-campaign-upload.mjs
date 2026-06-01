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

for (const required of [
  "Campaign Upload",
  "Upload a 30-day content plan and turn it into a review-ready production queue.",
  "Upload Spreadsheet",
  "Download Template",
  "Review Imported Posts",
  "Generate Image Plan",
  "Send to Approval Queue",
  "Upload content plan",
  "Review imported posts",
  "Generate image plan",
  "Send to approval queue",
  "Date",
  "Time",
  "Platform",
  "Campaign",
  "Post Type",
  "Image Direction",
  "Overlay Text",
  "Wilma Preference",
  "Auto",
  "Yes",
  "No",
  "Helper",
  "Creative Recommendations",
  "Use Wilma",
  "Wilma optional",
  "Use Wilma as helper",
  "Do not use Wilma",
  "Never use Wilma",
  "Headline",
  "Subhead",
  "CTA",
  "Placement",
  "Alignment",
  "Style",
  "Caption Preview",
  "Image Plan",
  "This is an internal schedule only. Nothing has been posted or scheduled on social platforms.",
  "Uploads create internal drafts only.",
  "Nothing has been published by the OS"
]) {
  assert(production.includes(required), `Production Campaign Upload should include ${required}`);
}

for (const forbidden of [
  "post_type",
  "image_direction",
  "overlay_text",
  "wilma_preference",
  "approval_owner",
  "Creative Recommendation Engine",
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
  "OAuth",
  "token",
  "webhook",
  "API status",
  "external action dispatcher",
  "live gates"
]) {
  assert(!production.includes(forbidden), `Production Campaign Upload should not include ${forbidden}`);
}

assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("production campaign upload tests passed.");
