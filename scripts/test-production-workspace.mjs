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

const renderBlock = functionBlock("render()");
const production = functionBlock("productionWorkspaceHtml");

assert(renderBlock.includes('safeRenderModule("production", () => productionWorkspaceHtml(pageClass))'), "#production should render the Production workspace");

for (const required of [
  "Production",
  "Create, preview, schedule, and track content before anything goes live.",
  "Production Summary",
  "Drafts",
  "Needs Image",
  "Ready for Review",
  "Scheduled Internally",
  "Published Manually",
  "Stats Needed",
  "Next Production Move",
  "Content Queue",
  "Draft → Image → Preview → Review → Scheduled → Published manually",
  "Image Studio",
  "Platform Preview",
  "Internal Schedule",
  "Results",
  "Connected Accounts",
  "LinkedIn",
  "Facebook",
  "Instagram",
  "TikTok",
  "Posting is off",
  "Manual only",
  "Nothing has been published by the OS",
  "Internal schedule only",
  "Generate Image",
  "Image generation is not connected yet. You can save image requests now.",
  "Preview only. Nothing has been published.",
  "This is an internal schedule only.",
  "Manual stats until accounts are connected.",
  "Not connected",
  "Image Requests",
  "Generated Images",
  "Needs Review",
  "Approved Images",
  "Image: Needed",
  "production-thumbnail",
  "Image needed",
  "Platform note",
  "Caption preview",
  "Checklist",
  "Prepare future posting and analytics connections.",
  "posting · scheduling · analytics",
  "Coming later",
  "Prepare LinkedIn",
  "Prepare Facebook",
  "Prepare Instagram",
  "Prepare TikTok",
  "Live posting will require connected accounts, permissions, and manual approval."
]) {
  assert(production.includes(required), `Production workspace should include ${required}`);
}

assert(
  production.includes("Image: Requested") || production.includes("Image: Generated") || production.includes("Image: Approved"),
  "Production workspace should show requested, generated, or approved image status labels"
);

for (const action of [
  "Create Post",
  "Open Calendar",
  "Add Result",
  "Review Ready Posts",
  "Edit Post",
  "Preview",
  "Move to Review",
  "Schedule Internally",
  "Mark Published Manually",
  "Regenerate",
  "Approve Image",
  "Attach to Post",
  "Preview LinkedIn",
  "Preview Facebook",
  "Preview Instagram",
  "Preview TikTok",
  "Copy Caption",
  "Download Image",
  "Add to Internal Schedule",
  "Move Date",
  "Update Result",
  "Turn Result into Proof",
  "Review Image",
  "Check Image"
]) {
  assert(production.includes(action), `Production workspace should include action ${action}`);
}

assert(!production.includes("Prepare Image Prompt"), "Production should not use prompt-prep language for image generation");
assert(production.includes("Today") && production.includes("This Week") && production.includes("Upcoming"), "Internal Schedule should show planning groups");
assert.match(source, /\.production-board\s*\{[^}]*overflow-x:\s*auto/s, "Content Queue lanes should scroll inside the board instead of squeezing the page");
assert.match(source, /\.production-lane\s*\{[^}]*min-width:\s*(?:220|240|260)px/s, "Content Queue lanes should have comfortable minimum width");
assert.match(source, /\.production-board\s*\{[^}]*scroll-snap-type:\s*x proximity/s, "Content Queue should support clean horizontal scrolling");
assert.match(source, /\.production-thumbnail\s*\{[^}]*min-height:/s, "Content cards should include thumbnail or image placeholder UI");

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Schedule to LinkedIn",
  "Schedule to Facebook",
  "Schedule to Instagram",
  "Schedule to TikTok",
  "API status",
  "OAuth",
  "token",
  "webhook",
  "boost",
  "ads manager",
  "live gates",
  "external action dispatcher",
  "RCAP Program Review",
  "Recovery Mode",
  "audit event",
  "internal state",
  "generated client",
  "route map"
]) {
  assert(!production.includes(forbidden), `Production normal UI should not include ${forbidden}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("production workspace tests passed.");
