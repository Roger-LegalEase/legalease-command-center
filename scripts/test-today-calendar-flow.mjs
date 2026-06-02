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

const today = functionBlock("commandCenterOverviewHtml");
const timelineBlocks = functionBlock("cockpitTimelineBlocks");
const calendarSection = functionBlock("cockpitCalendarReadHtml");
const suggestions = functionBlock("cockpitCalendarSuggestions");
const calendarEvents = functionBlock("cockpitCalendarEventsForToday");
const calendarModel = functionBlock("calendarReadinessState");

for (const required of [
  "Today’s Calendar",
  "Calendar is not connected yet. Today’s Flow is using internal planning blocks.",
  "location"
]) {
  assert(calendarSection.includes(required), `Today calendar read section should include ${required}`);
}

assert(calendarModel.includes("Calendar reads can help Today understand your day. Calendar writes are off."), "Today calendar readiness copy should remain founder-facing");

for (const kind of ["meeting", "focus", "hold"]) {
  assert(calendarEvents.includes(kind), `Today calendar event normalizer should support ${kind}`);
}

for (const required of [
  "You have a 90-minute focus window before your next meeting.",
  "Do the We Must Vote report before the afternoon block.",
  "Investor update draft fits in the late-day window.",
  "internal only"
]) {
  assert(suggestions.includes(required), `Calendar suggestions should include ${required}`);
}

assert(today.includes("${cockpitCalendarReadHtml()}"), "Today should render the Calendar Read section");
assert(timelineBlocks.includes("cockpitCalendarEventsForToday"), "Today’s Flow should be able to include calendar events when available");
assert(timelineBlocks.includes("internal priorities"), "Today’s Flow should still preserve internal priority blocks");
assert(calendarEvents.includes("state.calendarSignals") || calendarEvents.includes("state.googleCalendarSignals") || calendarEvents.includes("state.automationEvents"), "Today calendar should read existing internal calendar signals");

for (const forbidden of [
  "event ID",
  "calendar ID",
  "provider response",
  "API status",
  "OAuth",
  "token"
]) {
  assert(!calendarSection.toLowerCase().includes(forbidden.toLowerCase()), `Today calendar section should not show ${forbidden}`);
}

assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0");

console.log("today calendar flow tests passed.");
