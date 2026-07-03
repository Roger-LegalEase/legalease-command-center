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
  const next = rest.slice(1).search(/\n\s*function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const more = functionBlock("moreWorkspaceHtml");

for (const required of [
  "Activation Center",
  "Prepare the Command Center for real daily use without turning on risky live actions too early.",
  "Tasks & Priorities",
  "Google Calendar",
  "Gmail / Email",
  "Image Generation",
  "Social Accounts",
  "Twitter / X",
  "External Action Outbox",
  "Safety Switches",
  "Ready",
  "Needs setup",
  "Draft-only",
  "Read-only",
  "Not connected",
  "Manual only"
]) {
  assert(more.includes(required), `Activation Center should include ${required}`);
}

assert(!more.includes("TikTok"), "Activation Center should not include TikTok");
assert(!more.includes("Prepare TikTok"), "Activation Center should not include Prepare TikTok");

for (const label of [
  "Status:",
  "Ready:",
  "Not ready:",
  "Next step:",
  "Safety:"
]) {
  assert(more.includes(label), `Activation cards should use compact label ${label}`);
}

for (const compactCopy of [
  "Today can show priorities, tasks, blockers, decisions, and closeout notes.",
  "Use Today to update work internally.",
  "Email drafts can be prepared for review.",
  "Outbox does not execute.",
  "Live actions stay off."
]) {
  assert(more.includes(compactCopy), `Activation cards should use compact founder copy: ${compactCopy}`);
}

assert(!more.includes("Next setup step:</strong> Prepare"), "Generic activation cards should not use verbose setup labels");
assert(more.includes("Safety state:"), "LinkedIn activation card should show the approved connector safety state");

for (const safety of [
  "socialPostureRow()",
  "emailPostureRow()",
  "Calendar writes: Off",
  "External actions: Off",
  "Connected dashboards: Off",
  "Review Safety",
  "Open App Status"
]) {
  assert(more.includes(safety), `Safety Switches should include ${safety}`);
}

assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0 in safe fallback state");

console.log("activation center tests passed.");
