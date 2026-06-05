#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

const navStart = source.indexOf('<nav class="top-nav" aria-label="Primary">');
const navEnd = source.indexOf("</nav>", navStart);
assert(navStart >= 0 && navEnd > navStart, "Top nav should exist");
const topNav = source.slice(navStart, navEnd);

for (const [label, href] of [
  ["Today", "#today"],
  ["Command", "#command"],
  ["Queue", "#queue"],
  ["Sources", "#sources"],
  ["Settings", "#settings"]
]) {
  assert(topNav.includes(`href="${href}"`) && topNav.includes(`>${label}</a>`), `Top nav should keep ${label}`);
}
assert.equal((topNav.match(/class="nav-top-link"/g) || []).length, 5, "Top nav should keep exactly five primary links");
assert(!topNav.includes("#production"), "Top nav should not re-add Production");

const queueStart = source.indexOf('<section id="queue"');
const sourcesStart = source.indexOf('<section id="sources"', queueStart);
const assetsStart = source.indexOf("${assetLibraryPageHtml(pageClass)}", sourcesStart);
assert(queueStart >= 0, "#queue should render");
assert(sourcesStart > queueStart, "#sources should render after #queue");
assert(assetsStart > sourcesStart, "Sources block should end before assets");

const queue = source.slice(queueStart, sourcesStart);
const sources = source.slice(sourcesStart, assetsStart);
const panelStart = source.indexOf("const socialCalendarImportHtml =");
const panelEnd = source.indexOf('return \\`<section id="production"', panelStart);
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
  "Facebook and Instagram stay draft/paused while Meta is paused.",
  "Nothing posts during import.",
  "Import Preview"
]) {
  assert(importPanel.includes(required), `Sources importer should include ${required}`);
}

assert(sources.includes("${socialCalendarImportHtml}"), "Sources should render the Import Social Calendar panel");

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
