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
const detailStart = command.indexOf("Detailed social workflow");
const boardStart = command.indexOf("growth-board");

assert(command.includes("Command"), "Command route should render the founder command cockpit.");
assert(command.includes("Next move"), "Command should show a clear Next move.");
assert(command.includes("Workstreams"), "Command should summarize workstreams.");
assert(command.includes("Review snapshot"), "Command should show a compact review snapshot.");
assert(command.includes("Safe mode: nothing sends or publishes automatically."), "Command should keep safety visible but calm.");
assert(command.includes("command-workstream-grid"), "Command should use readable workstream summaries.");
assert(command.includes("command-snapshot-list"), "Command should use a compact status list.");
assert(command.includes("command-detail-workflow"), "Detailed social workflow should be collapsed behind a details panel.");
assert(detailStart >= 0 && boardStart > detailStart, "The social workflow board should appear only after the collapsed details summary.");

for (const rejected of [
  "Social Media Manager",
  "Next Growth Move",
  "PR Outreach",
  "Growth Stats"
]) {
  assert(!command.includes(rejected), `Command should not render the old ${rejected} panel.`);
}

assert(source.includes(".command-workstream-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));"), "Command workstreams should be full, readable cards.");
assert(source.includes("@media (max-width:860px) { .command-workstream-grid { grid-template-columns:1fr; }"), "Command workstreams should stack before becoming cramped.");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0.");

console.log("growth right rail layout tests passed.");
