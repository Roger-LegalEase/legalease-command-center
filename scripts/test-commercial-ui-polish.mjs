import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "preview-server.mjs"), "utf8");

function sliceBetween(startNeedle, endNeedle, label = startNeedle) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `${label} should exist.`);
  const end = source.indexOf(endNeedle, start);
  assert(end > start, `${label} should have an end boundary.`);
  return source.slice(start, end);
}

const topbar = sliceBetween('<header class="app-topbar">', '</header>', "topbar");
const overview = sliceBetween("function commandCenterOverviewHtml(posts)", "function focusItemsForMode", "overview renderer");
const cockpitSurface = [
  overview,
  sliceBetween("function cockpitDailyOperatingLoopHtml()", "function todayOperatingMemoryDate", "today focus helper"),
  sliceBetween("function cockpitTasksHtml()", "function operatorSearchClientIndex", "tasks snapshot helper"),
  sliceBetween("function cockpitOsHealthHtml()", "function normalizedClientRole", "system health helper"),
  sliceBetween("function cockpitWaitingBlockedHtml", "function commandCenterOverviewHtml(posts)", "commercial cockpit rail helpers")
].join("\n");
const moreMenu = topbar.match(/data-nav-section="more"[\s\S]*?<\/details>/)?.[0] || "";
const safeMode = sliceBetween('id="safe-mode"', 'function fetchSafeModeHealth', "safe mode");

for (const marker of [
  "nav: topnav-fixed-v1",
  "shell: app-layout-stable-v1",
  "controls: button-audit-v1",
  "layout: cockpit-grid-fixed-v1"
]) {
  assert(!topbar.includes(marker), `${marker} should not be visible in normal header.`);
  assert(!overview.includes(marker), `${marker} should not be visible in Today cockpit.`);
  assert(source.includes(marker), `${marker} may remain available in diagnostics/tests.`);
}

for (const nav of ["Today", "Growth", "Partners", "Production", "Proof", "More"]) {
  assert(topbar.includes(nav), `${nav} should remain in top navigation.`);
}
assert.match(topbar, /class="top-nav"/, "top nav should remain present.");
assert.match(topbar, /class="nav-menu-panel"/, "dropdown panels should remain present.");

for (const group of ["Daily Ops", "Work", "Partners", "Proof", "System"]) {
  assert(moreMenu.includes(group), `More menu should group ${group}.`);
}
for (const label of ["Morning Brief", "End-of-Day Reflection", "Closeout", "Carry Forward", "Tasks", "Captures", "Search", "RCAP Review", "Handoff Status", "Handoff Contract", "Evidence Room", "Data Room", "SOC 2 Readiness", "System Health", "System Checks", "Smoke Test", "Roles", "Operator Manual", "Safe Mode"]) {
  assert(moreMenu.includes(label), `More menu should include ${label}.`);
}

for (const label of [
  "Mission Today",
  "Today’s Top 3",
  "Quick Capture",
  "Tasks Snapshot",
  "Waiting / Blocked",
  "Decisions Needed",
  "What Moved",
  "System Health",
  "Live Gates: 0"
]) {
  assert(cockpitSurface.includes(label), `Today cockpit should show ${label}.`);
}

for (const hidden of [
  "cockpitRoleProtectionHtml()",
  "cockpitSmokeTestHtml()",
  "cockpitEvidenceRoomHtml()",
  "cockpitHandoffContractHtml()",
  "cockpitOperatorManualHtml()",
  "cockpitDataIntegrityHtml()",
  "rcapReviewQueueHtml()"
]) {
  assert(!overview.includes(hidden), `${hidden} should not render directly on Today.`);
}

for (const operatorLabel of [
  "Today’s Focus",
  "Carry Forward",
  "End-of-Day Reflection",
  "Closeout",
  "Handoff Status",
  "System Checks",
  "Captures",
  "Search"
]) {
  assert(source.includes(operatorLabel), `${operatorLabel} operator label should exist.`);
}

assert(!/Daily Operating Loop<\/h2>|Operating Memory<\/h2>|Capture Inbox<\/h2>|Operator Search<\/h2>|Review Queue<\/h2>|Partner Journey Handoff Contract<\/h2>/.test(overview), "Today should avoid internal architecture labels.");
assert(!/Risk Level|Compliance Score|Campaign Complexity|Boost|Run Ad|Auto Publish|autonomous posting/i.test(overview), "Today should not expose complex social/publishing language.");

const normalUiSource = topbar + overview;
assert(!/<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*(Send|Publish|Post|Schedule|Activate|Connect Platform|Enable Live|Destructive Restore|Run Ad|Boost)\b/i.test(normalUiSource), "Normal UI should not expose enabled unavailable external-action buttons.");

if (source.includes('id="social"') || source.includes("#social")) {
  const social = source.match(/function [a-zA-Z0-9_]*social[a-zA-Z0-9_]*Html[\s\S]*?function [a-zA-Z0-9_]+\(/i)?.[0] || source;
  assert(!/Risk Level|Compliance Score|Campaign Complexity|Boost|Run Ad|Auto Publish|autonomous posting/i.test(social), "Social UI should stay simple.");
  assert(social.includes("Manual publishing only. Nothing posts without your click."), "Social UI should include manual publishing language.");
  assert(!/<button(?![^>]*(?:disabled|aria-disabled="true"))[^>]*>\s*Publish Now\b/i.test(social), "Publish Now must be hidden or disabled unless configured and gated.");
}

assert(safeMode.includes("Live gates") || safeMode.includes("Live Gates"), "Safe Mode should still show live gates.");
assert(source.includes('"safe-mode"'), "Safe Mode route should remain registered.");
assert(!/Can't find variable: build[A-Z]|ReferenceError: build[A-Z]/.test(source), "Source should not contain concrete render-helper ReferenceError output.");
assert(/liveGatesCount[^,\n]*0|Live Gates: 0|Live gates[^<]*0/i.test(source), "Live gates 0 signal should remain represented.");

console.log("Commercial UI polish tests passed.");
