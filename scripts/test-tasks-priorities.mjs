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

const top3 = functionBlock("cockpitTop3StandupHtml");
const seed = functionBlock("cockpitTodayOperatingSeedData");
const now = seed + "\n" + functionBlock("cockpitNowItem");
const intention = seed + "\n" + functionBlock("cockpitDailyIntention");
const timeline = seed + "\n" + functionBlock("cockpitTimelineBlocks");
const needsAttention = functionBlock("cockpitNeedsAttentionHtml");
const blockers = functionBlock("cockpitBlockersDecisionsHtml");
const followups = functionBlock("commandCenterOverviewHtml");
const closeout = functionBlock("cockpitCloseoutPlanHtml");
const quickCapture = functionBlock("cockpitQuickCaptureHtml");
const loop = seed + "\n" + functionBlock("cockpitDailyOperatingLoop");

for (const required of [
  "Today is for",
  "closing the highest-trust follow-ups",
  "turning movement into execution"
]) {
  assert(intention.includes(required), `Today intention should include ${required}`);
}

for (const required of [
  "Send We Must Vote report",
  "This is the most urgent trust-building deliverable.",
  "Pull the latest RCAP / expungement status details.",
  "Draft the report in plain language.",
  "Send or prepare for review today."
]) {
  assert(now.includes(required), `Today Now block should include ${required}`);
}

for (const required of [
  "Morning: Send We Must Vote report",
  "Midday: RCAP co-branded page template",
  "Afternoon: Checkr integration",
  "Late day: Investor update draft and NBA proposal outline",
  "Closeout: Log what moved, blockers, and tomorrow’s first move"
]) {
  assert(timeline.includes(required), `Today's Flow should include ${required}`);
}

for (const required of [
  "Finish co-branded RCAP web page template",
  "Finish Checkr integration",
  "NBA proposal",
  "Send We Must Vote report",
  "Investor updates",
  "Harris County meeting",
  "Clean Slate Initiative",
  "Urban League",
  "Chicago",
  "Send press release and photo to BlackPR",
  "Build 30-day social media content plan",
  "Compile national expungement clinic list",
  "Paying Quantum Pulse",
  "Decide what minimum RCAP template must include before it is done",
  "Decide whether Checkr launch needs to be staged or fully active",
  "Decide NBA proposal scope: sponsorship, partnership, pilot, or full platform pitch",
  "Decide Quantum Pulse payment plan / whether anything is blocked until payment is handled"
]) {
  assert(loop.includes(required), `Today operating data should include ${required}`);
}

for (const required of [
  "Top 3",
  "Add Priority",
  "Edit Priority",
  "Mark Done",
  "Move to Tomorrow"
]) {
  assert(top3.includes(required), `Top 3 should support ${required}`);
}

for (const required of [
  "Add Task",
  "Mark Done"
]) {
  assert(needsAttention.includes(required) || quickCapture.includes(required), `Today should support ${required}`);
}

for (const required of [
  "Add Blocker",
  "Resolve Blocker",
  "Add Decision",
  "Move to Tomorrow"
]) {
  assert(blockers.includes(required), `Blockers & Decisions should support ${required}`);
}

assert(followups.includes("Add Follow-Up"), "Today follow-ups should support Add Follow-Up");
assert(closeout.includes("Closeout") && closeout.includes("Close the Day"), "Today should support closeout notes");
assert(source.includes("No external calls") || source.includes("internal only"), "Task and priority actions should remain internal only");

console.log("tasks and priorities tests passed.");
