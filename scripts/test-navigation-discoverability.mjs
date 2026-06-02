#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

function functionBlock(name) {
  const marker = name.endsWith(")") ? `function ${name}` : `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const shellStart = source.indexOf('<nav class="top-nav" aria-label="Primary">');
const shellEnd = source.indexOf("</nav>", shellStart);
assert(shellStart >= 0 && shellEnd > shellStart, "Primary top nav should render in the shell");
const topNav = source.slice(shellStart, shellEnd);
const renderBlock = functionBlock("render()");
const sectionConfig = functionBlock("sectionLandingConfig");
const partnersPage = functionBlock("partnersPageHtml");
const proofPage = functionBlock("proofWorkspaceHtml");
const safeMode = functionBlock("renderSafeBootShell");

const primaryLinks = [
  ["Today", "#today", "today"],
  ["Command", "#command", "command"],
  ["Queue", "#queue", "queue"],
  ["Sources", "#sources", "sources"],
  ["Settings", "#settings", "settings"]
];

for (const [label, href, section] of primaryLinks) {
  assert(
    topNav.includes(`class="nav-top-link" href="${href}" data-nav-section="${section}"`) &&
      topNav.includes(`>${label}</a>`),
    `Top nav should expose ${label} as a direct ${href} link`
  );
}

assert.equal((topNav.match(/class="nav-top-link"/g) || []).length, 5, "Top nav should expose exactly five primary links");
assert.equal((topNav.match(/data-nav-section="/g) || []).length, 5, "Top nav should expose exactly five active-state targets");
assert(!topNav.includes("<details"), "Top nav should not use dropdown preview details");
assert(!topNav.includes("nav-menu-panel"), "Top nav should not render floating preview panels");
for (const label of ["Production Home", "Proof Home", "Partners Home", "More Home", "Growth Home"]) {
  assert(!topNav.includes(label), `Top nav should not show ${label}`);
}

assert(source.includes('link.dataset.navSection === navSectionForPage(pageId)'), "Active nav state should be based on the current route section");
assert(!source.includes('.nav-menu[open] > .nav-menu-summary'), "Open nav menus should not create an additional active state");

assert(renderBlock.includes('today:"overview"'), "#today should route to Today/Overview");
assert(renderBlock.includes('command:"growth"'), "#command should route to the founder command workspace");
assert(renderBlock.includes('metrics:"proof"'), "#metrics should route to Proof / Metrics");
assert(renderBlock.includes('kpis:"proof"'), "#kpis should route to Proof / Metrics");
assert(renderBlock.includes('rcap:"production-activation-rcap"'), "#rcap should route to RCAP Program Review");
assert(renderBlock.includes('safeRenderModule("proof", () => proofWorkspaceHtml(pageClass))'), "#metrics/#kpis should render Metrics under Proof");
assert(renderBlock.includes('pageId === "production-activation-rcap" ? rcapReviewWorkspaceHtml(pageClass) : ""'), "Only RCAP routes should render RCAP Program Review");

for (const [route, label] of [
  ["growth", "Growth"],
  ["production", "Production"],
  ["proof", "Proof"],
  ["more", "More"]
]) {
  assert(sectionConfig.includes(`id:"${route}"`) && sectionConfig.includes(`title:"${label}"`), `#${route} should render ${label}`);
}
assert(partnersPage.includes("Partners"), "#partners should render the Partners page");
assert(proofPage.includes("Metrics / KPIs"), "#metrics/#kpis should render Metrics / KPIs inside Proof");
assert(!proofPage.includes("RCAP Program Review"), "Proof / Metrics should not render RCAP content");
assert(safeMode.includes("<h1>Recovery Mode</h1>") || safeMode.includes('<h1 class="big-title">Recovery Mode</h1>'), "#safe-mode should render Recovery Mode");

for (const block of [partnersPage, sectionConfig]) {
  assert(block.includes("RCAP Program"), "Partners/More surfaces should include RCAP Program access");
  assert(block.includes("Open RCAP Program"), "Partners/More surfaces should include Open RCAP Program button text");
}
assert(partnersPage.includes("Record Clearing Access Program partner review workspace."), "Partners page should describe the RCAP Program clearly");
assert(sectionConfig.includes("Record Clearing Access Program review workspace"), "More page should describe the RCAP Program utility row");

for (const label of [
  "Open App Status",
  "Open Recovery Mode",
  "Open Guide",
  "Open Team Roles",
  "Review Follow-ups",
  "Review Partner Proof"
]) {
  assert(source.includes(label), `Navigation/discoverability button should use clear label: ${label}`);
}

assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("navigation discoverability tests passed.");
