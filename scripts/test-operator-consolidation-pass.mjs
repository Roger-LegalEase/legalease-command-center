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

const cockpit = functionBlock("cockpitHomeHtml");
const upload = functionBlock("uploadListPageHtml");
const contacts = functionBlock("contactsPageHtml");
const campaigns = functionBlock("campaignsControlPageHtml");
const settings = functionBlock("plainSettingsPageHtml");
const render = functionBlock("render()");
const queueRows = functionBlock("unifiedReviewQueueItems");

for (const area of [
  "Today / Needs Roger",
  "Inbox & Replies",
  "Contacts & Lists",
  "Campaigns",
  "RCAP Prospects",
  "Partners",
  "Support",
  "Growth",
  "Revenue",
  "Meetings",
  "Pages",
  "Health",
  "Settings status"
]) {
  assert(cockpit.includes(area), `Cockpit should include ${area}`);
}

assert(cockpit.includes("Upload a list"), "Cockpit should expose one obvious Upload a list action.");
for (const action of ["Review contacts", "Review campaigns", "Review meetings", "Review revenue", "Review support", "Review pages", "Review health"]) {
  assert(cockpit.includes(action), `Cockpit should expose ${action}.`);
}
assert(upload.includes("What kind of list is this?"), "Upload flow should ask for list type.");
assert(upload.includes("Where did this list come from?"), "Upload flow should require source note.");
assert(upload.includes('name="listType" required'), "Upload flow should require list type.");
assert(upload.includes('name="sourceNote" required'), "Upload flow should require source note.");
for (const type of ["Consumer / Expungement.ai list", "RCAP prospect list", "Social content calendar", "RCAP revenue workbook"]) {
  assert(upload.includes(type), `Upload flow should include ${type}`);
}
for (const check of ["missing emails", "invalid emails", "duplicates", "suppressed/unsubscribed/bounced/do-not-contact"]) {
  assert(source.includes(check), `Upload flow should explain ${check}`);
}

for (const collection of [
  "outreachContacts",
  "reactivationContacts",
  "rcapRevenueContacts",
  "prospectCandidates",
  "partners",
  "growthInbox",
  "googleInsights",
  "tasks"
]) {
  assert(source.includes(`state.${collection}`), `Consolidated UI should read ${collection}`);
}

for (const collection of [
  "outreachCampaigns",
  "outreachLists",
  "outreachAttempts",
  "reactivationCampaign",
  "reactivationContacts",
  "campaigns",
  "posts"
]) {
  assert(source.includes(`state.${collection}`), `Campaigns view should read ${collection}`);
}

assert(contacts.includes("Unified contacts"), "Contacts page should render unified contact rows.");
assert(campaigns.includes("No campaign will send without approval and live-send gates"), "Campaigns page should state safety gate plainly.");

for (const route of ['"upload"', '"contacts"', '"prospects"', '"revenue"', '"meetings"', '"support"', '"pages"']) {
  assert(render.includes(route), `Render whitelist should include ${route}`);
}
for (const alias of ['"upload-list":"upload"', '"list-upload":"upload"', 'contact:"contacts"', '"campaign-control":"campaigns"', '"meeting-prep":"meetings"', '"support-inbox":"support"', '"page-review":"pages"', 'payments:"revenue"']) {
  assert(render.includes(alias), `Route aliases should include ${alias}`);
}

for (const sourceName of ["approvalQueue", "tasks", "growthInbox", "googleInsights", "prospectCandidates", "campaigns", "partners", "pages", "health"]) {
  assert(queueRows.includes(sourceName), `Unified review queue should pull from ${sourceName}`);
}

for (const safe of [
  "No agent auto-sends to a human.",
  "No agent auto-posts to social.",
  "No agent auto-publishes partner pages.",
  "View technical details"
]) {
  assert(settings.includes(safe), `Settings should preserve safety language: ${safe}`);
}

for (const forbidden of [
  "Post Now",
  "Publish Now",
  "Send Now",
  "Auto-send",
  "Auto-post",
  "Publish page now",
  "modify production code"
]) {
  assert(!cockpit.includes(forbidden) && !upload.includes(forbidden) && !campaigns.includes(forbidden), `New operator surfaces should not expose ${forbidden}`);
}

for (const collection of [
  "rcapRevenueAccounts",
  "rcapRevenueContacts",
  "rcapRevenueDealSeeds",
  "rcapRevenueQueueTasks",
  "rcapRevenueImportBatches"
]) {
  assert(storage.includes(`"${collection}"`), `Storage should persist ${collection}`);
  assert(source.includes(`"${collection}"`), `Client hydration should include ${collection}`);
}

console.log("operator consolidation pass tests passed.");
