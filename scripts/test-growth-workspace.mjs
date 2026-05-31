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
  "Growth",
  "Manage content, campaigns, outreach, and manual social publishing.",
  "Growth Summary",
  "Ideas",
  "Drafts",
  "Ready to Publish",
  "PR Follow-ups",
  "Campaigns",
  "Stats Needed",
  "Next Growth Move",
  "Create Post from Proof",
  "Review PR Follow-ups",
  "Social Media Manager",
  "Idea → Draft → Preview → Ready → Publish manually → Track",
  "Post Ideas",
  "Published Manually",
  "PR Outreach",
  "Email sending is off.",
  "No PR follow-ups due right now.",
  "Prepare a pitch or add a media target.",
  "Proof to Content",
  "Growth Stats",
  "No growth stats added yet. Add the first",
  "Publishing is off",
  "Manual only",
  "Nothing has been published by the OS"
]) {
  assert(growth.includes(required), `Growth workspace should include ${required}`);
}

for (const action of [
  "Add Idea",
  "Create Post",
  "Prepare PR Pitch",
  "Turn into Draft",
  "Preview",
  "Copy Post",
  "Publish Manually",
  "Mark Published Manually",
  "Add Target",
  "Draft Pitch",
  "Mark Follow-Up Due",
  "Add Coverage",
  "Turn Coverage into Proof",
  "Add Campaign",
  "Review Campaign",
  "Add Update",
  "Turn into Post",
  "Turn into PR Pitch",
  "Add to Investor Update",
  "Add Stat",
  "Update Stat"
]) {
  assert(growth.includes(action), `Growth workspace should include action ${action}`);
}

assert(!growth.includes("Prepare Email"), "Growth visible UI should say Draft Pitch, not Prepare Email");
assert(growth.includes("growth-board"), "Growth should keep Social Media Manager as a board");
assert.match(source, /\.growth-board\s*\{[^}]*gap:\s*14px/s, "Social Media Manager columns should have extra breathing room");
assert.match(source, /\.growth-item-actions\s*\{[^}]*gap:\s*8px/s, "Growth item actions should not feel squeezed");

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "boost",
  "ads",
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

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("growth workspace tests passed.");
