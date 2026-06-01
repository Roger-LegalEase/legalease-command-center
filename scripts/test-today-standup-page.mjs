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
const intention = functionBlock("cockpitDailyIntention");
const timeline = functionBlock("cockpitTimelineHtml");
const timelineBlocks = functionBlock("cockpitTimelineBlocks");
const todayHelpers = [
  "cockpitTodayStandupBoardHtml",
  "cockpitTop3StandupHtml",
  "cockpitNeedsAttentionHtml",
  "cockpitBlockersDecisionsHtml",
  "cockpitQuickCaptureHtml",
  "cockpitWhatMovedHtml",
  "cockpitPressingHtml",
  "todayUrgencyBadgeHtml",
  "cockpitCloseoutPlanHtml",
  "cockpitFooterGates"
].map(functionBlock).join("\n");
const todayVisibleSource = today + "\n" + todayHelpers;
const renderBlock = functionBlock("render()");

assert(renderBlock.includes('today:"overview"'), "#today should route to the Today standup");
assert(today.includes("operator-v31"), "Today should keep the existing LegalEase cockpit visual style");
assert(today.includes("app-intention"), "Today should keep the large intention hero");
assert(intention.includes("Today is for"), "Today hero should use the Today is for framing");
assert(intention.includes("protecting the main thread"), "Today hero should use the corrected protecting phrase");
assert(intention.includes("turning movement into proof"), "Today hero should keep the proof outcome");
assert(today.includes("Rewrite with Le-E"), "Today hero should keep the Le-E rewrite action");
assert(today.includes('aria-label="Now"'), "Today should include the Now / Current Focus block");
assert(today.includes("Start with"), "Now block should include the Start with list");
assert(timeline.includes("Today’s Flow") || timeline.includes("Today's Flow"), "Today should keep Today’s Flow");
assert(timeline.includes("timeline-now") || timeline.includes("tl-now-marker"), "Today’s Flow should include a current-time marker");
assert(timeline.includes("timeline-block-title"), "Today’s Flow blocks should expose readable titles");
assert(timeline.includes("timeline-block-meta"), "Today’s Flow blocks should expose compact time/status metadata");
assert(timelineBlocks.includes("Closeout"), "Today’s Flow should include a closeout block");
assert(today.includes("Needs Follow-Up"), "Today right rail should use Needs Follow-Up");
assert(today.includes("Waiting on you"), "Needs Follow-Up should use founder-facing helper copy");
assert(!today.includes("Threads Open"), "Today should no longer show Threads Open");
assert(today.includes("follow-up-filters"), "Needs Follow-Up should expose filter pills");
for (const filterLabel of ["All", "Partners", "Tasks", "Proof"]) {
  assert(today.includes(`>${filterLabel}</button>`) || today.includes(`>${filterLabel}</span>`), `Needs Follow-Up should include ${filterLabel} filter`);
}
assert(today.includes("View all follow-ups"), "Needs Follow-Up should cap visible items and offer a route to the full list");

for (const required of [
  "Top 3",
  "Needs Attention",
  "Blockers & Decisions",
  "Quick Capture",
  "What Moved",
  "Closeout",
  "Tomorrow Plan",
  "Publishing is off"
]) {
  assert(todayVisibleSource.includes(required), `Today standup should include ${required}`);
}

assert(todayVisibleSource.includes("Capture a task, idea, decision, blocker, update, or post idea"), "Quick Capture should use the founder-friendly placeholder");
assert(todayVisibleSource.includes("Post Idea"), "Quick Capture should support post ideas without exposing live posting");
const quickCapture = functionBlock("cockpitQuickCaptureHtml");
assert.equal((quickCapture.match(/<h2>Quick Capture<\/h2>/g) || []).length, 1, "Quick Capture card should have one visible heading");
assert(!quickCapture.includes('<label class="sr-only" for="cockpit-capture">Quick Capture</label>'), "Quick Capture card should not repeat the same visible/screen-reader label inside the card");
assert(quickCapture.includes("Save a thought before it becomes a loose end."), "Quick Capture should include concise helper text");
assert.equal((todayVisibleSource.match(/<h2>What Moved<\/h2>/g) || []).length, 1, "Today should render one visible What Moved section");
assert(!today.includes('<div class="cockpit-card-head"><h2>What Moved</h2>'), "Today right rail should not duplicate What Moved");
assert(source.includes("--urgent: #F04800") || source.includes("--urgent:#F04800") || source.includes("--rust:#F04800"), "Today should have LegalEase orange available for urgent states");
for (const urgencyClass of [".urgent", ".critical", ".pressing", ".status-urgent", ".pill-urgent"]) {
  assert(source.includes(urgencyClass), `Today should define urgency class ${urgencyClass}`);
}
assert(todayVisibleSource.includes("Pressing"), "Today right rail should include a compact Pressing card for urgent items");
assert(!today.includes("${cockpitOsHealthHtml()}"), "Today should not pull in the full App Status system card");
assert(!today.includes("${cockpitDataIntegrityHtml()}"), "Today should not pull in the full Data Check system card");
assert(!today.includes("${cockpitSmokeTestHtml()}"), "Today should not pull in the full Self-Check system card");
assert(!today.includes("${cockpitOperatingMemoryHtml()}"), "Today should not pull in full Notes & Decisions system detail");
assert(!today.includes("rcapReviewQueueHtml"), "Today should not render RCAP review workspace widgets");
assert(!today.includes("rcapHandoffReadinessCardHtml"), "Today should not render RCAP readiness widgets");

for (const debugLabel of ["nav: topnav-fixed-v1", "shell: app-layout-stable-v1", "controls: button-audit-v1"]) {
  assert(!today.includes(debugLabel), `Today should not show ${debugLabel}`);
}

for (const technicalTerm of [
  "Operating Memory",
  "Live Gates",
  "audit event",
  "internal state",
  "generated client",
  "route map",
  "artifact"
]) {
  assert(!today.includes(technicalTerm), `Today normal UI should not show ${technicalTerm}`);
}

assert(!today.includes("RCAP Program Review"), "Today should not render RCAP Program Review as the main page");
assert(!today.includes("Recovery Mode"), "Today should not render Recovery Mode as the main page");
assert.match(source, /\.operator-v31\s*\{[^}]*max-width:\s*100vw[^}]*overflow-x:\s*hidden/s, "Today shell should prevent horizontal overflow");
assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("today standup page tests passed.");
