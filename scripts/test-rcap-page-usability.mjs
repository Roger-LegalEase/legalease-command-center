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
  "Program Summary",
  "Review Packet",
  "Review Notes",
  "Next Steps",
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
  "Mark Ready for Manual Handoff"
]) {
  assert(rcapWorkspace.includes(term), `RCAP page should include: ${term}`);
}

// Required rows in review packet
for (const row of [
  "Proposal draft",
  "Partner page draft",
  "Dashboard readiness",
  "Weekly report draft",
  "Evidence note"
]) {
  assert(rcapWorkspace.includes(row), `Review Packet should include ${row}`);
}

// Ensure old internal labels do not leak into this page
assertNoMatch(rcapWorkspace, [
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
], "RCAP page should avoid legacy handoff/internal wording");

// Ensure RCAP copy is program-facing
assert(rcapWorkspace.includes("Record Clearing Access Program"), "RCAP should be labeled as Record Clearing Access Program");
assert(rcapWorkspace.includes("RCAP Program Review"), "RCAP title should remain explicitly set in the page");

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
