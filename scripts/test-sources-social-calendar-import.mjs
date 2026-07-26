#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

const navStart = source.indexOf('<nav class="top-nav" aria-label="Primary">');
const navEnd = source.indexOf("</nav>", navStart);
assert(navStart >= 0 && navEnd > navStart, "Top nav should exist");
const topNav = source.slice(navStart, navEnd);

// PORTED 2026-07-26 (hygiene, extended-test triage). This asserted the pre-Release-1 seven-item
// primary nav (Today / Growth / Partners / Production / Proof / Settings & Health / Le-E). The
// simplified shell replaced it with a six-item nav: Today / Queue / Campaigns / Review Desk /
// Reports / More. Ported to the live nav, matching what test-route-map-integrity already asserts,
// so the two suites cannot disagree about the shell. The load-bearing part of this suite — that
// Sources is NOT a primary nav item and lives under a workspace instead — is unchanged.
for (const [label, href] of [
  ["Today", "#today"],
  ["Queue", "#decisions"],
  ["Campaigns", "#campaigns"],
  ["Review Desk", "#queue"],
  ["Reports", "#reports"],
  ["More", "#more"]
]) {
  assert(topNav.includes(`href="${href}"`) && topNav.includes(`>${label}</a>`), `Top nav should keep ${label}`);
}
assert.equal((topNav.match(/class="nav-top-link"/g) || []).length, 6, "Top nav should keep exactly six primary surfaces");
assert(!topNav.includes("#sources"), "Sources should live under a workspace instead of primary nav");

const queueStart = source.indexOf('<section id="queue"');
const sourcesStart = source.indexOf('<section id="sources"', queueStart);
const assetsStart = source.indexOf("${assetLibraryPageHtml(pageClass)}", sourcesStart);
assert(queueStart >= 0, "#queue should render");
assert(sourcesStart > queueStart, "#sources should render after #queue");
assert(assetsStart > sourcesStart, "Sources block should end before assets");

const queue = source.slice(queueStart, sourcesStart);
const sources = source.slice(sourcesStart, assetsStart);
const panelStart = source.indexOf("function socialCalendarImportHtml()");
const panelEnd = source.indexOf("function productionWorkspaceHtml", panelStart);
assert(panelStart >= 0 && panelEnd > panelStart, "Social calendar import panel should be defined");
const importPanel = source.slice(panelStart, panelEnd);

assert(queue.includes("Import Calendar"), "Queue should include the Import Calendar shortcut copy");

for (const required of [
  "Import Social Calendar",
  "Upload Roger's XLSX or CSV calendar, preview rows, then add safe internal Queue items.",
  "sources-calendar-upload-input",
  "accept=\".csv,.xlsx",
  "handleCampaignSpreadsheetUpload(this.files && this.files[0])",
  "Review Import Preview",
  "Confirm Import",
  "Duplicate rows are skipped before saving.",
  "Some rows may be skipped if they already exist in Queue. To reload the calendar, delete existing imported drafts first.",
  "Facebook and Instagram stay draft/paused while Meta is paused.",
  "Nothing posts during import.",
  "Import Preview",
  "draft posts into Queue.",
  "Open Queue"
]) {
  assert(importPanel.includes(required), `Sources importer should include ${required}`);
}

assert(sources.includes("${socialCalendarImportHtml()}"), "Sources should render the Import Social Calendar panel with a shared helper call");
assert(sources.includes('\\${surfaceTabsHtml("growth", currentPageId)}'), "Sources should render under the Growth surface tabs");
assert(!sources.includes("${socialCalendarImportHtml}"), "Sources should not interpolate an out-of-scope import variable or function object");

for (const required of [
  "async function parseCampaignXlsxFile",
  "Content Calendar",
  "function campaignScheduledAt",
  "function campaignQueueStatus",
  "function campaignImportKey",
  "state.posts = [...imported"
]) {
  assert(source.includes(required), `Sources importer should reuse existing bulk upload logic: ${required}`);
}

assert(source.includes("location.href='/sources/import-social-calendar'"), "Queue shortcut should use the direct /sources/import-social-calendar route");
assert(source.includes('"sources/import-social-calendar"'), "Direct /sources/import-social-calendar route should be recognized by the client router");
assert(source.includes('pathRoute === "sources/import-social-calendar"'), "Direct import route should resolve into Sources");
assert(!source.includes("/api/import-social-calendar"), "Importer should not create a duplicate import API route");

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Tweet Now",
  "Send to X",
  "Send to LinkedIn"
]) {
  assert(!sources.includes(forbidden), `Sources importer should not expose ${forbidden}`);
}

console.log("sources social calendar import tests passed.");
