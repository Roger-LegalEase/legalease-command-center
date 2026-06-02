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
const calendarModel = functionBlock("calendarReadinessState");
const calendarStatus = functionBlock("calendarStatusResponse");

for (const required of [
  "Google Calendar",
  "Status:",
  "Ready:",
  "Calendar reads can help Today understand meetings and focus blocks.",
  "Not ready:",
  "Calendar writes are off.",
  "Next step:",
  "Prepare Calendar Connection.",
  "Safety:",
  "Read-only. No events or invites.",
  "Prepare Calendar Connection",
  "Check Calendar Readiness",
  "Calendar reads can help Today understand your day. Calendar writes are off."
]) {
  assert(more.includes(required), `Activation Center calendar readiness should include ${required}`);
}

for (const status of [
  "Not connected",
  "Ready to connect",
  "Read-only connected",
  "Needs setup",
  "Error"
]) {
  assert(calendarModel.includes(status), `Calendar readiness model should define ${status}`);
}

for (const required of [
  "Calendar:",
  "Calendar writes: Off",
  "Calendar reads can help Today understand your day. Calendar writes are off.",
  "Read today’s events",
  "Read upcoming meetings",
  "Detect focus windows",
  "Suggest Today’s Flow blocks",
  "Show meeting conflicts"
]) {
  assert(appStatus.includes(required) || calendarModel.includes(required), `App Status/calendar model should include ${required}`);
}

for (const disabled of [
  "Create events",
  "Edit events",
  "Delete events",
  "Send invites",
  "Write to calendar"
]) {
  assert(calendarModel.includes(disabled), `Calendar readiness should explicitly disable ${disabled}`);
}

for (const route of [
  'url.pathname === "/api/calendar/status"',
  'url.pathname === "/api/calendar/today"',
  'url.pathname === "/api/calendar/upcoming"'
]) {
  assert(source.includes(route), `Calendar read-only route should exist: ${route}`);
}

assert(calendarStatus.includes("Calendar is not connected yet."), "Missing calendar setup should fail safely with founder-facing copy");
assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0");

console.log("calendar readiness tests passed.");
