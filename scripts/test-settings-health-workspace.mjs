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

const renderBlock = functionBlock("render()");
const settings = functionBlock("plainSettingsPageHtml");
const connectionCards = functionBlock("plainConnectionCardsHtml");

assert(renderBlock.includes("${plainSettingsPageHtml({ imageStatusTone, imageStatusLabel, imageStatusDetail, healthTone, schemaStale })}"), "Settings should render the consolidated plain Settings surface.");
assert(renderBlock.includes('safeRenderModule("os-health", () => osHealthPageHtml(pageClass))'), "OS Health page should remain routable.");
assert(renderBlock.includes('safeRenderModule("data-integrity", () => dataIntegrityPageHtml(pageClass))'), "Data Integrity page should remain routable.");

for (const required of [
  "Company Info",
  "Connections",
  "Sending &amp; Posting Rules",
  "Contact &amp; Campaign Rules",
  "Partner Defaults",
  "Brand Assets",
  "System Health Details",
  "Operational work lives in Cockpit, Contacts, Campaigns, Revenue, Growth, Meetings, Support, Pages, and Health.",
  "Connected",
  "Needs attention",
  "Not connected",
  "Connect",
  "Reconnect",
  "Test",
  "View technical details",
  "No agent auto-sends to a human.",
  "No agent auto-posts to social.",
  "No agent auto-publishes partner pages.",
  "Suppressed, unsubscribed, bounced, and do-not-contact records are not eligible for email.",
  "This Settings page does not expose controls to enable gates."
]) {
  assert(settings.includes(required) || connectionCards.includes(required), `Settings should include ${required}`);
}

for (const connector of ["Gmail", "Google Calendar", "SendGrid", "LinkedIn", "Facebook", "Instagram", "X", "Stripe", "Supabase", "Render", "GitHub"]) {
  assert(connectionCards.includes(connector), `Settings connection cards should include ${connector}`);
}

for (const forbidden of [
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
  assert(!settings.includes(forbidden), `Consolidated Settings should not expose old or unsafe section/action: ${forbidden}`);
}

assert(!settings.includes("settingsHealthReadoutHtml()"), "Settings should not embed the operational health workspace.");
assert(settings.includes("Overall status"), "System Health Details should keep a compact health status inside the allowed health section.");
assert(settings.includes("clientLiveGatesCount(state)"), "Settings should compute live gate count from runtime state.");
assert(connectionCards.includes("connectorItems()"), "Connection cards should use connectorItems for connector readiness.");
assert(settings.includes("View technical details"), "Technical details should be hidden behind a disclosure.");

console.log("settings health workspace tests passed.");
