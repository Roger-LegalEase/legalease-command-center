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

const command = functionBlock("growthWorkspaceHtml");

assert(command.includes("command-surface"), "Growth should use the shared command surface layout.");
assert(command.includes("command-cols"), "Growth should keep the main work list and right rail in the shared layout.");
assert(command.includes("Warm audience — review & reach out"), "Growth should lead with the consolidated warm-audience list.");
assert(command.includes("Audience pipeline"), "Growth right rail should show the audience pipeline panel.");
assert(command.includes("Make content"), "Growth right rail should show the make-content panel.");
assert(command.includes("command-not-wired"), "Growth should render honest not-wired states for absent sources.");
assert(command.includes("Email sending, social posting, and external actions remain off."), "Growth should keep the safety footer visible.");

for (const rejected of [
  "Social Media Manager",
  "Next Growth Move",
  "PR Outreach",
  "Growth Stats",
  "Detailed social workflow",
  "growth-board"
]) {
  assert(!command.includes(rejected), `Command should not render the old ${rejected} panel.`);
}

assert(source.includes(".command-cols { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(300px,.95fr);"), "Growth should use the shared command column layout.");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0.");

console.log("growth right rail layout tests passed.");
