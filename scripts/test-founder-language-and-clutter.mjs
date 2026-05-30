import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

function blockBetween(startPattern, endPattern) {
  const start = source.search(startPattern);
  assert(start >= 0, `Missing block start: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert(end > 0, `Missing block end: ${endPattern}`);
  return rest.slice(0, end);
}

const nav = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const today = blockBetween(/function commandCenterOverviewHtml\(posts\)/, /function focusItemsForMode/);
const work = blockBetween(/function workPageHtml\(pageClass\)/, /function proofPageHtml/);
const proof = blockBetween(/function proofPageHtml\(pageClass\)/, /function sectionLandingConfig/);
const search = blockBetween(/function operatorSearchPageHtml\(pageClass\)/, /function conversationNotesPageHtml/);
const morning = blockBetween(/function morningBriefPageHtml\(pageClass\)/, /function eveningReflectionPageHtml/);

const normalUi = [nav, today, work, proof, search, morning].join("\n");
const forbidden = [
  "Triage",
  "RCAP",
  "Production Activation",
  "Operating Memory",
  "Operator Search",
  "OS Health",
  "Data Integrity",
  "Smoke Test",
  "Safe Boot",
  "Handoff Contract",
  "Live Gates",
  "Live gates",
  "compliance score",
  "risk score",
  "campaign complexity",
  "API status",
  "generated client",
  "route map",
  "schema",
  "diagnostics",
  "event bus",
  "manifest",
  "audit event",
  "internal state",
  "delegated listener",
  "technical details"
];

for (const term of forbidden) {
  assert(!normalUi.includes(term), `Normal founder UI should not show "${term}".`);
}

const navLabels = [...nav.matchAll(/data-nav-section="[^"]+"[^>]*>([^<]+)/g)].map(match => match[1].trim());
assert.deepEqual(navLabels, ["Today", "Work", "Proof", "Search", "Settings"], "Top nav labels should be founder-simple.");
assert.equal(navLabels.length, 5, "Top nav should have no more than five primary items.");

for (const label of [
  "Today",
  "Focus on the few things that move the company forward.",
  "Publishing is off",
  "App is protected",
  "Today’s Focus",
  "Top 3",
  "Quick Capture",
  "Tasks",
  "Decisions &amp; Blockers",
  "What Moved",
  "Tomorrow Plan",
  "App Status"
]) {
  assert(today.includes(label), `Today should render ${label}.`);
}

assert.equal((today.match(/class="founder-card quick-capture"/g) || []).length, 1, "Today should have one visible Quick Capture card.");
assert.equal((today.match(/Ask Le-E/g) || []).length, 0, "Today should not duplicate Le-E chat panels.");
assert.equal((today.match(/aria-label="Tasks"/g) || []).length, 1, "Today should have one task section.");
assert(today.includes("Publishing is off"), "Normal UI should say Publishing is off.");
assert(!today.includes("Live gates"), "Today should not expose live gate terminology.");
assert(!today.includes("cockpitRcapSignalHtml"), "Today should not render deep recovery workflow cards.");
assert(!today.includes("cockpitDataIntegrityHtml"), "Today should not render data check detail cards.");
assert(!today.includes("cockpitSmokeTestHtml"), "Today should not render self-check detail cards.");

console.log("founder language and clutter tests passed");
