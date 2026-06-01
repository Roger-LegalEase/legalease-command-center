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

const sectionConfig = functionBlock("sectionLandingConfig");
const partnersPage = functionBlock("partnersPageHtml");
const rcapPage = functionBlock("rcapReviewWorkspaceHtml");

assert.match(source, /html,\s*body,\s*\.shell,\s*#app\s*\{[^}]*overflow-x:\s*hidden/s, "Global shell should prevent horizontal scroll.");
assert.match(source, /main\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/s, "Main should be explicitly contained.");
assert.match(source, /\.page-section\.active\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*min\(1240px,100%\)[^}]*overflow-x:\s*hidden/s, "Active route sections should be width-contained.");
assert.doesNotMatch(source, /\.shell,\s*#app,\s*#app main\s*\{[^}]*contain:\s*layout paint/s, "Shell paint containment should not duplicate route content in screenshots.");
assert.match(source, /\.landing-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(320px,\s*420px\)/s, "Landing pages should use a contained main column and readable action rail.");
assert.match(source, /\.landing-actions a\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*\.82fr\)\s*minmax\(0,\s*1fr\)\s*minmax\(128px,\s*auto\)/s, "Landing action rows should reserve space for clear action labels.");
assert.match(source, /\.landing-actions a\s*\{[^}]*overflow-wrap:\s*break-word/s, "Landing action rows should wrap instead of clipping.");
assert.match(source, /\.landing-actions a strong\s*\{[^}]*white-space:\s*normal/s, "Landing action labels should wrap naturally.");
assert.match(source, /\.landing-actions a:not\(:has\(small\)\)\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s*minmax\(150px,auto\)/s, "Landing rows without descriptions should leave room for labels and actions.");

for (const debugLabel of ["nav: topnav-fixed-v1", "shell: app-layout-stable-v1", "controls: button-audit-v1"]) {
  assert(!sectionConfig.includes(debugLabel), `Normal landing pages should not show ${debugLabel}`);
  assert(!partnersPage.includes(debugLabel), `Partners should not show ${debugLabel}`);
  assert(!rcapPage.includes(debugLabel), `RCAP should not show ${debugLabel}`);
}

for (const label of ["Production Home", "Proof Home", "Partners Home", "More Home"]) {
  assert(!source.includes(label), `Normal UI should not expose floating preview label ${label}`);
}

for (const label of [
  "Open Tasks",
  "Open Today Tools",
  "Review Blocked Tasks",
  "Review Waiting Tasks",
  "Review This Week",
  "Open Roundtable Notes",
  "Open RCAP Program",
  "Open Guide",
  "Open Team Roles",
  "Open App Status",
  "Open Recovery Mode"
]) {
  assert(sectionConfig.includes(label), `More page should use readable action label: ${label}`);
}

assert(partnersPage.includes("Open RCAP Program"), "Partners page should keep Open RCAP Program.");
assert(sectionConfig.includes("Open RCAP Program"), "More page should keep Open RCAP Program.");
assert(rcapPage.includes("RCAP Program Review"), "RCAP route should still render RCAP Program Review.");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0.");

console.log("global layout containment tests passed.");
