#!/usr/bin/env node
// Phase 18G guard: Settings is nine plain-English business sections, display-only, with ALL
// technical detail behind a single "View technical details" disclosure at the end. No
// developer-speak in primary copy; no controls that enable gates, send, publish, or activate.
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

const renderBlock = functionBlock("render()");
const settings = functionBlock("plainSettingsPageHtml");
const connectionCards = functionBlock("plainConnectionCardsHtml");

assert(renderBlock.includes("${plainSettingsPageHtml({ imageStatusTone, imageStatusLabel, imageStatusDetail, healthTone, schemaStale })}"), "Settings should render the consolidated plain Settings surface.");
assert(renderBlock.includes('safeRenderModule("os-health", () => osHealthPageHtml(pageClass))'), "OS Health page should remain routable.");
assert(renderBlock.includes('safeRenderModule("data-integrity", () => dataIntegrityPageHtml(pageClass))'), "Data Integrity page should remain routable.");

// The nine business sections, in order.
const SECTIONS = [
  "Company profile",
  "Email and campaigns",
  "Social media",
  "Partner program",
  "Customer support",
  "Revenue and Stripe",
  "Notifications",
  "Safety and approvals",
  "Integrations"
];
let cursor = -1;
for (const name of SECTIONS) {
  const idx = settings.indexOf(`<summary>${name}</summary>`);
  assert(idx >= 0, `Settings should have a ${name} section`);
  assert(idx > cursor, `Settings section ${name} should come after the previous section`);
  cursor = idx;
}

// ONE technical disclosure, after all nine business sections.
const techIdx = settings.indexOf("<summary>View technical details</summary>");
assert(techIdx > cursor, "Technical detail should live in one disclosure after the nine business sections.");
assert.equal(settings.split("View technical details").length - 1, 1, "Settings should have exactly one technical-details disclosure.");

// Plain-language safety and honesty copy that must survive.
for (const required of [
  "Operational work lives in Cockpit, Contacts, Campaigns, Revenue, Growth, Meetings, Support, Pages, and Health.",
  "No agent auto-sends to a human.",
  "No agent auto-posts to social.",
  "No agent auto-publishes partner pages.",
  "Suppressed, unsubscribed, bounced, and do-not-contact records are not eligible for email.",
  "This Settings page does not expose controls to enable gates.",
  "No caps exist",
  "Email alerts go only to Roger at a locked address.",
  "The switch lives on the Alerts page, not here.",
  "Payments and billing are never changed from this app.",
  "Support replies are drafted for your review only.",
  "Overall status"
]) {
  assert(settings.includes(required), `Settings should include: ${required}`);
}

// Status vocabulary and connection controls stay on the connection cards.
for (const required of ["Connected", "Needs attention", "Not connected", "Connect", "Reconnect", "Test", "View technical details", "connectorItems()"]) {
  assert(connectionCards.includes(required), `Connection cards should include ${required}`);
}
for (const connector of ["Gmail", "Google Calendar", "SendGrid", "LinkedIn", "Facebook", "Instagram", "X", "Stripe", "Supabase", "Render", "GitHub"]) {
  assert(connectionCards.includes(connector), `Settings connection cards should include ${connector}`);
}

// Real data sources, not hardcoded claims.
assert(settings.includes("clientLiveGatesCount(state)"), "Settings should compute live gate count from runtime state.");
assert(settings.includes("emailPostureRow()"), "Email status should come from the verified safety posture.");
assert(settings.includes("socialPostureRow()"), "Social status should come from the verified safety posture.");
assert(settings.includes("revenueOperatorSummary()"), "Stripe status should come from the shared revenue summary.");
assert(settings.includes("partnerProgramOverviewClient()"), "Partner counts should come from the shared partner overview.");
assert(settings.includes("state.supportIssues"), "Support counts should come from supportIssues.");
assert(settings.includes("rcapConnectionCardHtml()"), "Integrations should render the RCAP connection placeholder.");
assert(settings.includes("plainConnectionCardsHtml()"), "Integrations should render the shared connection cards.");

// Old sections and unsafe actions must not come back.
for (const forbidden of [
  "<summary>Company Info</summary>",
  "<summary>Connections</summary>",
  "<summary>Sending &amp; Posting Rules</summary>",
  "<summary>Contact &amp; Campaign Rules</summary>",
  "<summary>Partner Defaults</summary>",
  "<summary>System Health Details</summary>",
  "<summary>Launch setup</summary>",
  "<summary>Launch readiness</summary>",
  "<summary>Backup & Restore</summary>",
  "<summary>Admin seed data</summary>",
  "<summary>Channels / Integrations</summary>",
  "<summary>Production setup checklist</summary>",
  "<summary>Content intelligence</summary>",
  "<summary>Content library</summary>",
  "<summary>Admin brand system</summary>",
  "Enable live gates",
  "Turn on publishing",
  "Send email",
  "Publish post",
  "Write calendar",
  "Activate dashboard",
  "secret value"
]) {
  assert(!settings.includes(forbidden), `Settings should not expose old or unsafe section/action: ${forbidden}`);
}

// No developer-speak in primary copy: everything before the technical disclosure must not
// print code paths or internal record names as visible text.
const primary = settings.slice(0, techIdx);
for (const devSpeak of [
  "Source: state.",
  "state.runtime.livePostingGates",
  "buildSmokeTestStatus",
  "osHealthSnapshots",
  "dataIntegritySnapshots",
  "connectorStatus + socialAccounts",
  "JSON.stringify",
  "code-block"
]) {
  assert(!primary.includes(devSpeak), `Primary Settings copy should not contain developer-speak: ${devSpeak}`);
}

// The old operational health workspace stays dead.
assert(!source.includes("function settingsHealthReadoutHtml"), "The retired settings health readout should not return.");

console.log("settings health workspace tests passed.");
