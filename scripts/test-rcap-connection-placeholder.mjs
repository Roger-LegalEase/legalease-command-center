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
const settingsArea = source.match(/<section id="settings"[\s\S]*?\$\{leeBubbleHtml\(\)\}/)?.[0] || "";
const rcapCard = functionBlock("rcapConnectionCardHtml");
const rcapHelper = functionBlock("openRcapConnectionChecklist");

assert(settingsArea.includes("Channels / Integrations"), "Settings should expose Channels / Integrations.");
assert(settingsArea.includes("rcapConnectionCardHtml()"), "Settings integrations should render RCAP Connection.");

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
