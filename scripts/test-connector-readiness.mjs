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

const more = functionBlock("moreWorkspaceHtml");
const appStatus = functionBlock("osHealthPageHtml");
const production = functionBlock("productionWorkspaceHtml");

for (const required of [
  "Calendar reads can help Today understand focus blocks.",
  "Calendar writes are off.",
  "Prepare Calendar Connection",
  "Check Calendar Readiness",
  "Email drafts can be prepared for review.",
  "Email sending is off.",
  "Prepare Email Connection",
  "Check Email Readiness",
  "Server-side image generation can be used when configured.",
  "Missing setup saves an image request instead.",
  "Platform checklists are available for future setup.",
  "No accounts are connected.",
  "Prepare LinkedIn",
  "Prepare Facebook",
  "Prepare Instagram",
  "Prepare TikTok"
]) {
  assert(more.includes(required), `Connector readiness should include ${required}`);
}

for (const required of [
  "Tasks and priorities:",
  "Calendar:",
  "Email:",
  "Image generation:",
  "Social accounts:",
  "External actions:"
]) {
  assert(appStatus.includes(required), `App Status should include connector readiness row ${required}`);
}

assert(production.includes("Prepare LinkedIn"), "Production Connected Accounts should include Prepare LinkedIn");
assert(production.includes("Prepare TikTok"), "Production Connected Accounts should include Prepare TikTok");
assert(!source.includes("startOAuth"), "No OAuth should start in this pass");
assert(!source.includes("google.calendar.events.insert"), "Calendar writes should not be enabled");
assert(!source.includes("gmail.users.messages.send"), "Email sending should not be enabled");
assert(!source.includes("Schedule to LinkedIn"), "Live social scheduling should not be enabled");
assert(!source.includes("Post Now"), "Live posting should not be enabled");

console.log("connector readiness tests passed.");
