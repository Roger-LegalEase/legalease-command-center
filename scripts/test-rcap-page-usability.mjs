#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = readFileSync(join(root, "scripts", "preview-server.mjs"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist in preview-server.mjs`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

function assertNoMatch(text, patterns, messagePrefix) {
  for (const pattern of patterns) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
    assert(!regex.test(text), `${messagePrefix}: ${pattern}`);
  }
}

const rcapWorkspace = functionBlock("rcapReviewWorkspaceHtml");
const renderSection = functionBlock("render")
  .split("function sectionLandingPageHtml")[0];

// Required visible headings and copy
for (const term of [
  "RCAP Program Review",
  "Record Clearing Access Program",
  "Partner program review",
  "Review partner materials before anything is sent, published, or activated.",
  "Partner Summary",
  "LegalEase support",
  "Review Packet",
  "Review Notes",
  "Roger's Next Steps",
  "Missing Information",
  "Safety Status",
  "Activity"
]) {
  assert(rcapWorkspace.includes(term), `RCAP page should include ${term}`);
}

// Required safety language
for (const term of [
  "No email sent",
  "No post published",
  "No partner page published",
  "No dashboard activated",
  "Publishing is off",
  "Nothing has been sent, published, or activated.",
  "Prepare Review Packet",
  "Back to Today",
  "Mark Ready for Manual Handoff",
  "Next decision",
  "Is this ready for partner review?",
  "Ready",
  "Materials ready for final review",
  "Missing",
  "Details needed before partner review",
  "Needs decision",
  "Items waiting on Roger"
]) {
  assert(rcapWorkspace.includes(term), `RCAP page should include: ${term}`);
}

// Required rows in review packet
for (const row of [
  "<table",
  "<colgroup><col><col><col><col></colgroup>",
  "<th>Item</th>",
  "<th>Status</th>",
  "<th>Needs</th>",
  "<th>Action</th>",
  'data-label="Item"',
  'data-label="Status"',
  'data-label="Needs"',
  'data-label="Action"',
  "Proposal draft",
  "Roger review",
  "Partner page draft",
  "Confirm copy",
  "Dashboard readiness",
  "Keep internal",
  "Weekly report draft",
  "Confirm reporting format",
  "Evidence note"
]) {
  assert(rcapWorkspace.includes(row), `Review Packet should include ${row}`);
}
assert(rcapWorkspace.includes("data-rcap-key"), "Review Packet action should avoid fragile inline quoted arguments");
assert(rcapWorkspace.includes("this.dataset.rcapKey"), "Review Packet action should use data attributes for handler arguments");

// Ensure old internal labels do not leak into this page
assertNoMatch(rcapWorkspace, [
  "Prepare the first review-only production workflow",
  "Review the partner materials before anything is sent",
  "What it needs",
  "Roger review before anything goes partner-facing",
  "Confirm the dashboard stays internal until approved",
  "Review partner materials and prepare manual next steps",
  "RCAP partner</strong> ·",
  "handoff readiness summary",
  "review-only",
  "content summary",
  "operator review notes",
  "blocker or revision notes",
  "handoff packet",
  "approved artifacts",
  "hand off",
  "readiness score",
  "refresh rcap artifacts",
  "generate internal handoff packet",
  "activation review",
  "review_required",
  "rcap-review-row",
  "memory-evidence-grid",
  "memory-history-card",
  "Update Review Packet",
  "Preview Materials",
  "Add Review Note",
], "RCAP page should avoid legacy handoff/internal wording");

// Decision-screen structure: hero, readiness strip, main two-column decision area, bottom activity.
for (const className of [
  "rcap-decision-hero",
  "rcap-readiness-strip",
  "rcap-decision-layout",
  "rcap-packet-table",
  "rcap-right-rail",
  "rcap-activity-section",
  "rcap-activity-feed"
]) {
  assert(rcapWorkspace.includes(className), `RCAP page should use ${className}`);
}

assert(source.includes("position:sticky"), "Right rail should be sticky on desktop");
assert(
  source.includes("grid-template-columns:minmax(0,1fr) clamp(300px,32vw,380px)"),
  "RCAP grids should fit laptop width with a clamped right rail"
);
assert(
  source.includes(".rcap-decision-card {") && source.includes("min-width:0"),
  "RCAP cards should allow grid children to shrink instead of causing overflow"
);
assert(
  source.includes(".rcap-packet-table { width:100%; table-layout:fixed; border-collapse:collapse; min-width:0; }"),
  "Review Packet table should not force page-level horizontal overflow"
);
assert(
  source.includes(".rcap-packet-table col:nth-child(1) { width:26%; }") &&
  source.includes(".rcap-packet-table col:nth-child(2) { width:22%; }") &&
  source.includes(".rcap-packet-table col:nth-child(3) { width:32%; }") &&
  source.includes(".rcap-packet-table col:nth-child(4) { width:20%; }"),
  "Review Packet table should use the requested column proportions"
);
assert(
  source.includes("overflow-wrap:break-word") && source.includes("white-space:normal"),
  "RCAP content should wrap naturally instead of clipping"
);
assert(
  source.includes("@media (max-width:900px)") && source.includes("content:attr(data-label)"),
  "Review Packet should become stacked labeled rows below 900px"
);

// Ensure RCAP copy is program-facing
assert(rcapWorkspace.includes("Record Clearing Access Program"), "RCAP should be labeled as Record Clearing Access Program");
assert(rcapWorkspace.includes("RCAP Program Review"), "RCAP title should remain explicitly set in the page");
assert(
  rcapWorkspace.includes("Review materials and prepare manual next steps"),
  "LegalEase support should use the short wrapping-safe value"
);

// No debug markers visible on RCAP page
assertNoMatch(rcapWorkspace, [
  "topnav-fixed-v1",
  "app-layout-stable-v1",
  "button-audit-v1"
], "Debug marker should not appear in RCAP page output");

// Ensure no forbidden publishing controls are present
assertNoMatch(rcapWorkspace, [
  /<button[^>]*>\s*Send\b/i,
  /<button[^>]*>\s*Publish\b/i,
  /activate dashboard/i,
  /new window\.open\(["']https?:/i
], "No publishing controls should be exposed in RCAP review page");

// Typography guardrails
const normalizedRcapWorkspace = rcapWorkspace
  .replace(/\\"/g, '"')
  .replace(/\\'/g, "'")
  .replace(/\\"/g, '"');
const hasGeist = /["']Geist["']/i.test(normalizedRcapWorkspace) || /\bGeist\b/i.test(normalizedRcapWorkspace);
const hasInter = /["']Inter["']/i.test(normalizedRcapWorkspace) || /\bInter\b/i.test(normalizedRcapWorkspace);
const hasSystemUi = /system-ui/i.test(normalizedRcapWorkspace);
assert(hasGeist && hasInter && hasSystemUi, "RCAP page should use Geist/Inter/system-ui stack");
assert(!/Fraunces/i.test(rcapWorkspace), "RCAP page must not use Fraunces");

// Route rendering should be isolated to RCAP routes only
assert(
  /safeRenderModule\("production-activation-rcap"\s*,\s*\(\)\s*=>\s*pageId\s*===\s*"production-activation-rcap"\s*\?\s*rcapReviewWorkspaceHtml\(pageClass\)\s*:\s*""\)/.test(source),
  "RCAP workspace should render only for production-activation-rcap route"
);

// Check aliases
const routeAliasesIndex = source.indexOf("const routeAliases =");
assert(routeAliasesIndex >= 0, "routeAliases should exist");
const routeAliasesBlock = source.slice(routeAliasesIndex, routeAliasesIndex + 260);
assert(routeAliasesBlock.includes('rcap:"production-activation-rcap"'), "#rcap should still alias to #production-activation-rcap");

// Health check: static fallback path should keep gates off in known fallback payload
assert(source.includes("liveGatesCount:0"), "safe boot state should carry liveGatesCount: 0");

console.log("RCAP page usability tests passed.");
