import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

function functionBody(name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist.`);
  const next = source.indexOf("\n    function ", start + 12);
  return source.slice(start, next === -1 ? source.length : next);
}

const normalBlocks = [
  functionBody("commandCenterOverviewHtml"),
  functionBody("workPageHtml"),
  functionBody("socialPageHtml"),
  functionBody("proofPageHtml"),
  functionBody("operatorSearchPageHtml"),
  functionBody("morningBriefPageHtml"),
  functionBody("operatingMemoryPageHtml"),
  functionBody("leeBubbleHtml")
].join("\n");

for (const term of [
  "Operating Memory",
  "Operator Search",
  "OS Health",
  "Data Integrity",
  "Smoke Test",
  "Production Activation",
  "generated client",
  "route map",
  "event bus",
  "diagnostics",
  "schema",
  "API status",
  "OAuth",
  "webhook",
  "audit event",
  "internal state",
  "Live Gates",
  "Live gates"
]) {
  assert(!normalBlocks.includes(term), `Normal founder UI should not show "${term}".`);
}

for (const replacement of [
  "Notes &amp; Decisions",
  "Search",
  "App Status",
  "Data Check",
  "Self-Check",
  "Launch Checklist",
  "Handoff Notes",
  "Proof",
  "Guide",
  "Recovery Mode",
  "Publishing is off",
  "Activity"
]) {
  assert(source.includes(replacement), `Founder-facing replacement should appear: ${replacement}`);
}

const founderTextBody = functionBody("founderText");
assert(!founderTextBody.includes("[/\\\\bRCAP\\\\b/g, \"Recovery plan\"]"), "RCAP must not be globally rewritten as Recovery plan.");

const rcapPage = functionBody("rcapReviewWorkspaceHtml");
assert.match(rcapPage, /Record Clearing Access Program|RCAP Program/, "RCAP page should clearly mean Record Clearing Access Program.");
assert.doesNotMatch(rcapPage, /Recovery plan/, "RCAP page should not use app-recovery meaning.");

const systemCopy = [
  functionBody("osHealthPageHtml"),
  functionBody("smokeTestPageHtml"),
  functionBody("dataIntegrityPageHtml")
].join("\n");
assert.doesNotMatch(systemCopy, /RCAP Review Workspace|RCAP Production Activation|Recovery plan/, "System pages should not use RCAP as recovery/system language.");
assert(systemCopy.includes("Advanced") || source.includes("Advanced details"), "System copy should expose technical content only behind an advanced affordance.");

const social = functionBody("socialPageHtml");
for (const term of ["API status", "OAuth", "token", "webhook", "compliance score", "risk score", "campaign complexity", "boost"]) {
  assert(!social.includes(term), `Marketing/Social UI should not show ${term}.`);
}
assert(social.includes("Publishing is off"), "Social should clearly say Publishing is off.");
assert(social.includes("Nothing has been published by the OS"), "Social should clearly say nothing has been published by the OS.");

console.log("founder copy cleanup tests passed");
