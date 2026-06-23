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
const productionCommand = functionBlock("productionCommandSurfaceHtml");

assert(renderBlock.includes('safeRenderModule("production", () => productionWorkspaceHtml(pageClass))'), "#production should render the Production workspace");
assert(production.includes("return productionCommandSurfaceHtml(pageClass);"), "Production should delegate to the command surface renderer");

for (const required of [
  "Production",
  "Content moves from draft to visual, internal review, internal schedule, and manual proof.",
  "Production pipeline",
  "Stage-filtered content",
  "posts + postImages",
  "state.posts",
  "state.postImages",
  "Drafts",
  "Needs visual",
  "Ready for review",
  "Scheduled internally",
  "Published manually",
  "Roger video",
  "rogerVideoTasks",
  "not yet wired: rogerVideoTasks is not present in state.",
  "Wilma & asset guardian",
  "Wilma protection",
  "Asset guardian",
  "display-only status",
  "Canonical pose and overlay protection logic remains unchanged.",
  "Wilma protection and asset-guardian behavior are not changed by this surface.",
  "Nothing posts itself.",
  "The OS does not publish, schedule to platforms, or perform external actions."
]) {
  assert(productionCommand.includes(required), `Production command surface should include ${required}`);
}

for (const forbidden of [
  "generateProductionImage(",
  "buildWilmaImageWorkflow(",
  "wilmaWorkflowBlockers(",
  "Post Now",
  "Publish Now",
  "Schedule to LinkedIn",
  "Schedule to Facebook",
  "Schedule to Instagram",
  "Schedule to Twitter / X",
  "TikTok",
  "tiktok",
  "API status",
  "OAuth",
  "token",
  "webhook",
  "boost",
  "ads manager",
  "external action dispatcher",
  "Recovery Mode",
  "audit event",
  "generated client",
  "route map"
]) {
  assert(!productionCommand.includes(forbidden), `Production command surface should not include ${forbidden}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("production workspace tests passed.");
