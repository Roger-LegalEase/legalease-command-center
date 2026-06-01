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
const appStatus = functionBlock("osHealthPageHtml");
const recovery = functionBlock("renderSafeBootShell");

assert(renderBlock.includes('"app-status":"os-health"'), "#app-status should render App Status");
assert(renderBlock.includes('recovery:"safe-mode"'), "#recovery should render Recovery Mode");

function visibleTemplateBeforeDetails(block) {
  const htmlStart = block.includes("app.innerHTML") ? block.indexOf("app.innerHTML") : block.indexOf("return `");
  const html = htmlStart >= 0 ? block.slice(htmlStart) : block;
  return html.split("<details")[0];
}

const appStatusNormal = visibleTemplateBeforeDetails(appStatus);
const recoveryNormal = visibleTemplateBeforeDetails(recovery);

for (const required of [
  "App Status",
  "Check whether the Command Center is healthy, protected, and safe to use.",
  "Command Center is protected",
  "Publishing: Off",
  "Email sending: Off",
  "Live social posting: Off",
  "Calendar writes: Off",
  "External actions: Off",
  "Owner access: Protected",
  "Database:",
  "Image generation:",
  "Refresh Status",
  "Open Recovery Mode",
  "Back to Today",
  "Show advanced details"
]) {
  assert(appStatus.includes(required), `App Status should include ${required}`);
}

for (const required of [
  "Recovery Mode",
  "Use this if something breaks or the full app does not load.",
  "Get back to steady ground.",
  "Back to Today",
  "Try full app again",
  "Open App Status",
  "Sign out",
  "Go back to Today.",
  "Try the full app again.",
  "Check App Status.",
  "If the issue continues, note the page and button that failed.",
  "Show advanced details"
]) {
  assert(recovery.includes(required), `Recovery Mode should include ${required}`);
}

assert(!/details[^>]*open/i.test(appStatus), "App Status advanced details should be collapsed by default");
assert(!/details[^>]*open/i.test(recovery), "Recovery advanced details should be collapsed by default");

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "diagnostics",
  "live gates",
  "generated client",
  "route map",
  "internal state",
  "audit event",
  "schema"
]) {
  assert(!appStatusNormal.toLowerCase().includes(forbidden.toLowerCase()), `App Status normal view should not include ${forbidden}`);
  assert(!recoveryNormal.toLowerCase().includes(forbidden.toLowerCase()), `Recovery normal view should not include ${forbidden}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(recovery.includes("leeBubbleHtml"), "Recovery Mode should keep the Le-E bubble visible");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("app status and recovery tests passed.");
