#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
const storage = readFileSync(join(process.cwd(), "scripts", "storage.mjs"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const today = functionBlock("commandCenterOverviewHtml");
const dailyRunPanel = functionBlock("dailyRunTodayPanelHtml");
const renderBlock = functionBlock("render()");
const navStart = source.indexOf('<nav class="top-nav" aria-label="Primary">');
const navEnd = source.indexOf("</nav>", navStart);
assert(navStart >= 0 && navEnd > navStart, "Primary top nav should exist.");
const topNav = source.slice(navStart, navEnd);

assert(source.includes('from "./daily-run-session.mjs"'), "Preview server should use the shared Daily Run session brain.");
assert(storage.includes('"dailyRunSessions"'), "Daily Run sessions should persist through the existing durable core state pattern.");
assert(source.includes('"dailyRunSessions"'), "Client state should normalize dailyRunSessions as an array.");

for (const route of [
  'url.pathname === "/api/daily-run"',
  'url.pathname === "/api/daily-run/start"',
  'url.pathname === "/api/daily-run/end"',
  'url.pathname === "/api/daily-run/abandon"',
  'url.pathname === "/api/daily-run/park"'
]) {
  assert(source.includes(route), `Daily Run API route should exist: ${route}`);
}

for (const required of [
  "Start here:",
  "Start Session",
  "Resume Session",
  "Current bucket",
  "Progress",
  "Parked",
  "New since start",
  "End Session",
  "You have an unfinished session from earlier.",
  "Start Fresh",
  "Mark Abandoned",
  "Session summary",
  "tomorrow’s first move",
  "Surface → Move → Confirm"
]) {
  assert(dailyRunPanel.includes(required), `Today Daily Run panel should include ${required}`);
}

for (const compactCount of [
  "blocked",
  "due today",
  "overdue follow-ups",
  "ready to approve",
  "scheduled today"
]) {
  assert(dailyRunPanel.toLowerCase().includes(compactCount), `Today start bookend should show compact count for ${compactCount}.`);
}

for (const action of [
  "startDailyRunSession",
  "resumeDailyRunSession",
  "endDailyRunSession",
  "abandonDailyRunSession",
  "startFreshDailyRunSession"
]) {
  assert(source.includes(`async function ${action}`), `${action} client action should exist.`);
}

assert(today.includes("${dailyRunTodayPanelHtml()}"), "Today should render the Daily Run bookend panel.");
assert(dailyRunPanel.includes("bestBucketHeadline"), "Today Start Here headline should use the brain-provided bucket count headline.");
assert(renderBlock.includes('overview:"today"'), "#overview should still route to the approved Today page.");
assert(renderBlock.includes('["today", "overview"].includes(pageId)'), "#today should render the approved Today page directly.");
assert(topNav.includes("#production"), "Production should now be a primary surface in the approved six-surface nav.");
assert(topNav.includes("Settings &amp; Health"), "Settings & Health should be visible in the approved six-surface nav.");
assert(source.includes('state.runwayInputs || {}'), "Today runway should read the dedicated manual operator-input state.");
assert(!source.includes('state.metrics?.monthlyBurn || state.metrics?.burnMonthly || state.runway?.monthlyBurn'), "Today runway should not infer monthly burn from legacy metrics.");
assert(source.includes('add cash + burn to compute'), "Runway should show the required no-guess placeholder.");
assert(source.includes('bookedWired'), "Revenue should distinguish confirmed rows from missing sources.");
assert(source.includes('No confirmed funnel, campaign, or partner-program revenue rows.'), "Revenue should render a not-wired state when no confirmed rows exist.");
assert(source.includes('buildFounderCapacityPulse(state'), "Your load should use the shared Founder Capacity pulse source.");
assert(source.includes('todayDailyRunBuckets()'), "Needs you now and systems should read Daily Run buckets.");
assert(source.includes('buildDailyRunSnapshot(state).buckets'), "Today should fall back to the real Daily Run snapshot brain when no session snapshot is active.");
assert(source.includes('command-not-wired'), "Today should have an obvious not-wired state for missing business metrics.");
assert(source.includes('async function saveRunwayInputs(event)'), "Runway manual inputs should have a client save handler.");
assert(source.includes('url.pathname === "/api/runway-inputs"'), "Runway manual inputs should persist through a dedicated API route.");
assert(source.includes('name="currentCashBalance"'), "Runway form should include current cash balance.");
assert(source.includes('name="monthlyBurn"'), "Runway form should include monthly burn.");

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Tweet Now",
  "Send to X",
  "Send to LinkedIn"
]) {
  assert(!dailyRunPanel.includes(forbidden), `Daily Run Today panel should not expose ${forbidden}.`);
}

console.log("daily run today UI tests passed.");
