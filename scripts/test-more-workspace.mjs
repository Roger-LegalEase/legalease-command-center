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
const more = functionBlock("moreWorkspaceHtml");

assert(renderBlock.includes('safeRenderModule("more", () => moreWorkspaceHtml(pageClass))'), "#more should render the More workspace");

for (const required of [
  "More",
  "Settings, recovery, support tools, and focused work views.",
  "Publishing is off",
  "Protected",
  "Utility Summary",
  "App Status",
  "Recovery Mode",
  "Guide",
  "Team Roles",
  "Data Check",
  "Privacy",
  "Exports / Handoff",
  "RCAP Program",
  "Utilities",
  "System Safety",
  "Publishing: Off",
  "Email sending: Off",
  "Live social posting: Off",
  "Calendar writes: Off",
  "External actions: Off",
  "If something breaks",
  "Back to Today"
]) {
  assert(more.includes(required), `More workspace should include ${required}`);
}

for (const action of [
  "Open App Status",
  "Refresh Status",
  "Open Recovery Mode",
  "Open Guide",
  "Open Course Manual",
  "Open Team Roles",
  "Add Role Note",
  "Open Data Check",
  "Review Saved Work",
  "Open Privacy",
  "Prepare Export",
  "Review Handoff Notes",
  "Open RCAP Program"
]) {
  assert(more.includes(action), `More workspace should include action ${action}`);
}

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "audit event",
  "internal state",
  "generated client",
  "route map",
  "live gates",
  "external action dispatcher",
  "schema",
  "diagnostics",
  "smoke test",
  "operator",
  "OS Health",
  "Data Integrity",
  "RCAP Program Review",
  "Recovery Mode</h1>",
  "Production",
  "Proof Summary"
]) {
  assert(!more.includes(forbidden), `More normal UI should not include ${forbidden}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("more workspace tests passed.");
