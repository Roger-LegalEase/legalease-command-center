import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

const overviewMatch = server.match(/function commandCenterOverviewHtml\(posts\) \{[\s\S]*?function focusItemsForMode/);
assert.ok(overviewMatch, "Today renderer should be present.");
const overview = overviewMatch[0];

assert.match(server, /<nav class="sidebar-nav top-nav" aria-label="Primary">/, "Primary navigation should exist.");
assert.match(server, /href="#today" data-nav-section="today"[\s\S]*?>Today/, "Today top nav item should be a real route.");
assert.match(server, /href="#work" data-nav-section="work"[\s\S]*?>Work/, "Work top nav item should be a real route.");
assert.match(server, /href="#marketing" data-nav-section="marketing"[\s\S]*?>Marketing/, "Marketing top nav item should be a real route.");
assert.match(server, /href="#data-room" data-nav-section="data-room"[\s\S]*?>Data Room/, "Data Room top nav item should be a real route.");
assert.match(server, /href="#partnerships" data-nav-section="partnerships"[\s\S]*?>Partnerships/, "Partnerships top nav item should be a real route.");
assert.match(server, /href="#kpis" data-nav-section="kpis"[\s\S]*?>KPIs/, "KPIs top nav item should be a real route.");
assert.match(server, /href="#proof" data-nav-section="proof"[\s\S]*?>Proof/, "Proof top nav item should be a real route.");
assert.match(server, /href="#search" data-nav-section="search"[\s\S]*?>Search/, "Search top nav item should be a real route.");
assert.doesNotMatch(server.match(/<nav class="sidebar-nav top-nav"[\s\S]*?<\/nav>/)?.[0] || "", /Settings/, "Settings should not be a primary nav item.");
assert.match(server, /href="#settings"/, "Settings should remain reachable secondarily.");

for (const label of [
  "Today",
  "Your founder standup for the day.",
  "Publishing off",
  "Protected",
  "Founder Focus",
  "Set focus",
  "Top 3 priorities",
  "Priority 1",
  "Department Pulse",
  "Quick Capture",
  "Post idea",
  "Tasks",
  "Decisions &amp; Blockers",
  "What Moved",
  "End of Day"
]) {
  assert.match(overview, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Today should render ${label}.`);
}

assert.match(server, /function workPageHtml\(pageClass\)/, "Work hub should exist.");
assert.match(server, /function marketingPageHtml\(pageClass\)/, "Marketing workspace should exist.");
assert.match(server, /aria-label="Marketing \/ Content"/, "Today should include a compact Marketing / Content card.");
assert.match(server, /function dataRoomWorkspaceHtml\(pageClass\)/, "Data Room workspace should exist.");
assert.match(server, /function partnershipsPageHtml\(pageClass\)/, "Partnerships workspace should exist.");
assert.match(server, /function kpisPageHtml\(pageClass\)/, "KPIs workspace should exist.");
assert.match(server, /function proofPageHtml\(pageClass\)/, "Proof hub should exist.");
assert.match(server, /function founderText/, "Founder-facing copy sanitizer should exist.");
assert.match(server, /function quickCapture\(event\)/, "Quick Capture should have a submit handler.");
assert.match(server, /api\("\/api\/capture-inbox"/, "Quick Capture should save into the inbox.");
assert.match(server, /route_task/, "Save as task should route into Tasks.");
assert.match(server, /function setFounderCaptureType/, "Founder action buttons should focus the single Quick Capture input.");
assert.match(server, /function founderSetTodayFocus/, "Set today’s focus should be wired.");
assert.match(server, /function founderPlanTomorrow/, "Plan tomorrow should be wired.");
assert.match(server, /class="lee-floating-button"/, "Le-E should remain available as one compact entry point.");
assert.doesNotMatch(overview, /Triage|RCAP|Production Activation|Operating Memory|Operator Search|OS Health|Data Integrity|Smoke Test|Safe Mode|Handoff Contract|Live gates/, "Today should use founder language.");
assert.doesNotMatch(overview, /cockpitRcapSignalHtml|cockpitRoleProtectionHtml|cockpitSmokeTestHtml|cockpitDataIntegrityHtml/, "Today should not render deep system cards.");
assert.doesNotMatch(server, /word-break:\s*break-all/, "Shell should never force one-letter vertical text.");
assert.doesNotMatch(server, /writing-mode:/, "Shell should not use vertical writing modes.");

console.log("operator experience tests passed");
