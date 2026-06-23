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
  "growthOpenInboxItems",
  "growthActiveGoogleInsights",
  "growthOpenTasks",
  "growthWarmAudienceItems",
  "growthWarmAudiencePanelHtml",
  "growthAudiencePipelineRows",
  "growthContentRows"
].map(functionBlock).join("\n");
const routeAliases = source.match(/const routeAliases = \{([\s\S]*?)\};/)?.[1] || "";
const activeGrowthRender = source.match(/safeRenderModule\("growth"[\s\S]*?\n\s*\}\)/)?.[0] || "";

assert(routeAliases.includes('marketing:"growth"') || routeAliases.includes('marketing: "growth"'), "#marketing should alias to Growth");
assert(routeAliases.includes('social:"growth"') || routeAliases.includes('social: "growth"'), "#social should alias to Growth");
assert(routeAliases.includes('"content-calendar":"growth"') || routeAliases.includes('"content-calendar": "growth"'), "#content-calendar should alias to Growth");
assert(routeAliases.includes('posts:"growth"') || routeAliases.includes('posts: "growth"'), "#posts should alias to Growth");
assert(activeGrowthRender.includes("growthWorkspaceHtml(pageClass)"), "#growth should render the Growth workspace");

for (const required of [
  "Growth",
  "Everything you make and everyone you reach.",
  "Review warm audience",
  "Warm audience — review & reach out",
  "one filtered list · inbox, tasks, Google read-only",
  "Audience pipeline",
  "real intake signals",
  "Make content",
  "contentBank, posts, campaigns",
  "growthOpenInboxItems",
  "growthActiveGoogleInsights",
  "growthOpenTasks",
  "growthWarmAudienceItems",
  "growthAudiencePipelineRows",
  "growthContentRows",
  "command-not-wired",
  "Approval only prepares outreach for review.",
  "Email sending, social posting, and external actions remain off.",
  "Nothing posts itself. Outreach and content are prepared for your approval only."
]) {
  assert(growth.includes(required), `Growth workspace should include ${required}`);
}

for (const action of [
  "Review",
  "Skip",
  "growth-inbox",
  "tasks",
  "queue",
  "campaigns",
  "content-bank"
]) {
  assert(growth.includes(action), `Growth workspace should include action ${action}`);
}

assert(!growth.includes("Prepare Email"), "Growth visible UI should say Draft Pitch, not Prepare Email");
assert(!growth.includes("Social Media Manager"), "Command should not expose the old Social Media Manager heading.");
assert(!growth.includes("Next Growth Move"), "Command should use Next move instead of Next Growth Move.");
assert(!growth.includes("PR Outreach"), "Command should summarize outreach instead of rendering the old PR panel.");
assert(!growth.includes("Detailed social workflow"), "Growth should not expose the old workflow board as the primary surface.");
assert(!growth.includes("growth-board"), "Growth should collapse the old queue board into panel summaries.");
assert(growth.includes("state.growthInbox || []"), "Growth should read Growth Inbox state directly.");
assert(growth.includes("state.googleInsights"), "Growth should read Google insights state directly.");
assert(growth.includes("state.tasks || []"), "Growth should read task state directly.");
assert(growth.includes("state.contentBank || []"), "Growth should read contentBank state directly.");
assert(growth.includes("state.posts || []"), "Growth should read posts state directly.");
assert(growth.includes("state.campaigns || []"), "Growth should read campaign state directly.");

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
