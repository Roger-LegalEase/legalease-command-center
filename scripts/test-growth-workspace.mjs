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

const renderBlock = functionBlock("render");
const growth = [
  "growthWorkspaceHtml",
  "growthIdeaRows",
  "growthPostRows",
  "growthProofRows"
].map(functionBlock).join("\n");
const routeAliases = source.match(/const routeAliases = \{([\s\S]*?)\};/)?.[1] || "";
const activeGrowthRender = source.match(/safeRenderModule\("growth"[\s\S]*?\n\s*\}\)/)?.[0] || "";

assert(routeAliases.includes('marketing:"growth"') || routeAliases.includes('marketing: "growth"'), "#marketing should alias to Growth");
assert(routeAliases.includes('social:"growth"') || routeAliases.includes('social: "growth"'), "#social should alias to Growth");
assert(routeAliases.includes('"content-calendar":"growth"') || routeAliases.includes('"content-calendar": "growth"'), "#content-calendar should alias to Growth");
assert(routeAliases.includes('posts:"growth"') || routeAliases.includes('posts: "growth"'), "#posts should alias to Growth");
assert(activeGrowthRender.includes("growthWorkspaceHtml(pageClass)"), "#growth should render the Growth workspace");

for (const required of [
  "Command",
  "Move campaigns, partners, channels, and launch work from one place.",
  "Safe mode: nothing sends or publishes automatically.",
  "Command Summary",
  "Drafts",
  "Queue",
  "Proof",
  "PR Follow-ups",
  "Channels",
  "Stats Needed",
  "Next move",
  "Open Queue",
  "Review proof",
  "Workstreams",
  "Drafts and launch ideas waiting for review.",
  "Partner pushes, onboarding, and follow-ups.",
  "LinkedIn, X, Meta, Threads, and RCAP connection status.",
  "Connection point is ready for when RCAP is complete.",
  "PR targets and follow-ups before anything is sent.",
  "Evidence, reports, and wins that can become content or investor updates.",
  "Review snapshot",
  "Detailed social workflow",
  "Nothing has been published by the OS"
]) {
  assert(growth.includes(required), `Growth workspace should include ${required}`);
}

for (const action of [
  "Open Queue",
  "Review proof",
  "Open Partners",
  "Open Settings",
  "Open connection",
  "Review outreach",
  "Open Sources",
  "Turn into Draft",
  "Preview",
  "Copy Post",
  "Review in Queue",
  "Mark Published Manually",
  "Move to LinkedIn Review",
  "Move to Twitter / X Review"
]) {
  assert(growth.includes(action), `Growth workspace should include action ${action}`);
}

assert(!growth.includes("Prepare Email"), "Growth visible UI should say Draft Pitch, not Prepare Email");
assert(!growth.includes("Social Media Manager"), "Command should not expose the old Social Media Manager heading.");
assert(!growth.includes("Next Growth Move"), "Command should use Next move instead of Next Growth Move.");
assert(!growth.includes("PR Outreach"), "Command should summarize outreach instead of rendering the old PR panel.");
assert(growth.includes("command-detail-workflow"), "Detailed social workflow should be available behind a collapsed details section.");
assert(growth.includes("growth-board"), "Detailed social workflow should still preserve the old board internally.");
assert.match(source, /\.command-workstream-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s, "Command workstreams should render as readable summary cards.");
assert.match(source, /\.command-next-card\s*\{[^}]*display:grid/s, "Command should have a dedicated Next move card.");

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "risk score",
  "compliance score",
  "campaign complexity",
  "RCAP Program Review",
  "Recovery Mode",
  "Live Gates",
  "audit event",
  "internal state",
  "generated client",
  "route map"
]) {
  assert(!growth.includes(forbidden), `Growth normal UI should not include ${forbidden}`);
}

for (const forbiddenPattern of [/\bboost\b/i, /\bads\b/i]) {
  assert(!forbiddenPattern.test(growth), `Growth normal UI should not include ${forbiddenPattern}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("growth workspace tests passed.");
