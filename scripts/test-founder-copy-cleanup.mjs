#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const server = readFileSync(join(root, "scripts", "preview-server.mjs"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = server.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = server.slice(start);
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const normalBlocks = [
  "commandCenterOverviewHtml",
  "cockpitRcapActivationHtml",
  "cockpitSmokeTestHtml",
  "cockpitEvidenceRoomHtml",
  "cockpitOperatorManualHtml",
  "cockpitDataIntegrityHtml",
  "cockpitOperatorSearchHtml",
  "cockpitOperatingMemoryHtml",
  "operatingMemoryPageHtml",
  "operatorSearchPageHtml",
  "operatorManualPageHtml",
  "evidenceRoomPageHtml",
  "smokeTestPageHtml",
  "osHealthPageHtml",
  "dataIntegrityPageHtml",
  "leeBubbleHtml"
].map(functionBlock).join("\n");

for (const term of [
  "Operating Memory",
  "Operator Search",
  "OS Health",
  "Data Integrity",
  "Smoke Test",
  "Production Activation",
  "Evidence Room",
  "Operator Manual",
  "Live Gates",
  "Live gates",
  "audit event",
  "internal state",
  "generated client",
  "route map",
  "event bus",
  "API status",
  "webhook"
]) {
  assert(!normalBlocks.includes(term), `normal founder UI should not show ${term}`);
}

for (const replacement of [
  "Notes & Decisions",
  "Search",
  "App Status",
  "Data Check",
  "Self-Check",
  "Handoff Notes",
  "Proof",
  "Guide",
  "Publishing is off",
  "Activity",
  "Record Clearing Access Program",
  "RCAP Program"
]) {
  assert(server.includes(replacement), `founder-facing replacement should exist: ${replacement}`);
}

const rcapWorkspace = functionBlock("rcapReviewWorkspaceHtml");
assert(rcapWorkspace.includes("Record Clearing Access Program"), "RCAP page should define RCAP as Record Clearing Access Program");
assert(rcapWorkspace.includes("RCAP Program"), "RCAP page should use RCAP Program language");
assert(!/Recovery plan|system recovery|app recovery/i.test(rcapWorkspace), "RCAP should not mean recovery/system repair");

const systemBlocks = [
  "osHealthPageHtml",
  "dataIntegrityPageHtml",
  "smokeTestPageHtml",
  "renderModuleFallbackHtml"
].map(functionBlock).join("\n");
assert(!/RCAP Production Activation|RCAP Review Workspace|Recovery plan/i.test(systemBlocks), "system pages should not use RCAP for app recovery or launch copy");

const lee = functionBlock("leeBubbleHtml");
assert(!/API status|token usage|generated client|route map|event bus|audit event|internal state/i.test(lee), "Le-E normal UI should avoid technical copy");

console.log("founder copy cleanup tests passed");
