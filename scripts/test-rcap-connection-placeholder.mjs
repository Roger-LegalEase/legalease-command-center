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

const nav = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const routeAliases = source.match(/const routeAliases = \{([\s\S]*?)\};/)?.[1] || "";
const settingsArea = functionBlock("plainSettingsPageHtml");
const rcapCard = functionBlock("rcapConnectionCardHtml");
const rcapHelper = functionBlock("openRcapConnectionChecklist");
const channelCards = functionBlock("channelCards");

assert(settingsArea.includes("<summary>Integrations</summary>"), "Settings should expose an Integrations section.");
assert(settingsArea.includes("rcapConnectionCardHtml()"), "Settings integrations should render RCAP Connection.");
assert(settingsArea.includes("channel-readiness-strip"), "Channels should show one section-level safety strip.");
assert(settingsArea.includes("channel-readiness-list"), "Channels should render as a calm readiness list.");
assert(!settingsArea.includes("grid channel-grid settings-card-grid"), "Channels should not render the old cramped card grid.");
assert(channelCards.includes("channel-row"), "Channels should render readable rows.");
assert(!channelCards.includes("card channel-card"), "Channels should not render cramped channel cards.");
assert(!channelCards.includes("Enable live publishing"), "Channels should not show live publishing controls in normal view.");
assert(!channelCards.includes("Live posting:"), "Channels should not repeat live posting status on every row.");
assert(!channelCards.includes("Run Dry Test"), "Channels should not show disabled dry-run controls on every row.");
assert(!channelCards.includes("Disconnect"), "Channels should not show disabled disconnect controls on every row.");

for (const required of [
  "RCAP Connection",
  "Not connected",
  "RCAP is being built separately.",
  "partner pages, dashboards, Wilma eligibility chat, signup, Briefcase, and document generation",
  "Prepare connection",
  "Connection checklist",
  "Partner landing pages",
  "Partner dashboards",
  "Wilma eligibility chat",
  "End-user signup",
  "End-user dashboard / Briefcase",
  "Document generation",
  "Command Center integration",
  "Waiting",
  "Needs connection"
]) {
  assert(rcapCard.includes(required), `RCAP connection placeholder should include ${required}`);
}

assert(rcapHelper.includes("rcap-connection-details"), "Prepare connection should open the checklist details panel.");
assert(rcapHelper.includes("Nothing is connected yet"), "Prepare connection should clearly say nothing is connected.");
assert(rcapCard.includes("rcap-connection-list"), "RCAP checklist should use the dedicated full-width checklist list.");
assert(rcapCard.includes("rcap-connection-row"), "RCAP checklist items should render as readable rows.");
assert(!rcapCard.includes("metric-table"), "RCAP checklist should not use the generic metric table layout.");
assert(source.includes(".rcap-connection-card { grid-column:1 / -1; }"), "RCAP card should span the integrations grid.");
assert(source.includes(".rcap-connection-row { display:flex;"), "RCAP checklist rows should use a readable row layout.");
assert(source.includes("word-break:normal"), "RCAP checklist labels should not wrap letter by letter.");
assert(routeAliases.includes('rcap:"production-activation-rcap"'), "#rcap route alias should remain preserved.");
assert(!nav.includes(">RCAP<") && !nav.includes("RCAP Connection"), "RCAP should not become a top-level nav item.");

for (const forbidden of [
  "Generate Live Petition",
  "Send Petition",
  "File Petition",
  "Send to LinkedIn",
  "Post Now",
  "Publish Now",
  "Send Email",
  "Connected</span>",
  "Live</span>",
  "Ready</span>"
]) {
  assert(!rcapCard.includes(forbidden), `RCAP connection placeholder should not include ${forbidden}`);
}

assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0.");

console.log("RCAP connection placeholder tests passed.");
