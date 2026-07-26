#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = readFileSync(join(root, "scripts", "preview-server.mjs"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  // PORTED 2026-07-26 (hygiene, extended-test triage): the boundary only stopped at a sibling
  // `function`, so blocks over-captured into the following `const` declaration (proofWorkspaceHtml
  // is followed by `const MORE_DIRECTORY_GROUPS`, a nav catalogue full of route names). Stopping at
  // a sibling const/let/var too keeps the doesNotMatch assertions below honest.
  const next = rest.slice(1).search(/\n    (?:async function|function|const|let|var) [a-zA-Z0-9_$]+/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const renderBlock = functionBlock("render");
const safeModeBlock = functionBlock("renderSafeBootShell");
const routeStart = source.indexOf("const routeAliases");
assert(routeStart >= 0, "routeAliases should exist in render");
const routeBlock = source.slice(routeStart, source.indexOf("const pageClass", routeStart));
const rcapBlock = functionBlock("rcapReviewWorkspaceHtml");
const proofBlock = functionBlock("proofWorkspaceHtml");
const sectionConfigBlock = functionBlock("sectionLandingConfig");

const hiddenMarkers = ["topnav-fixed-v1", "app-layout-stable-v1", "button-audit-v1"];
const htmlShellBlock = source.includes("function htmlShell(") ? source.slice(source.indexOf("function htmlShell("), source.indexOf("<script>")) : "";
for (const marker of hiddenMarkers) {
  assert(!htmlShellBlock.includes(marker), `${marker} should not appear in normal rendered shell output`);
  assert(!source.includes(`<span>${marker}</span>`), `${marker} should not be shown as visible debug text`);
}

assert(routeBlock.includes('overview:"today"'), "#overview should render the Today page");
assert(source.includes('["today", "overview"].includes(pageId)'), "#today should render the Today page directly");
assert(routeBlock.includes('metrics:"proof"'), "#metrics should render Proof / Metrics");
assert(routeBlock.includes('kpis:"proof"'), "#kpis should render Proof / Metrics");
assert(routeBlock.includes('marketing:"growth"'), "#marketing should render Growth/Marketing");
assert(routeBlock.includes('social:"growth"'), "#social should render Growth/Marketing");
assert(routeBlock.includes('rcap:"production-activation-rcap"'), "#rcap should render RCAP Program Review");

assert(source.includes('pageId === "production-activation-rcap" ? rcapReviewWorkspaceHtml(pageClass) : ""'), "RCAP Program Review should render only on RCAP routes");
assert(source.includes('safeRenderModule("proof", () => proofWorkspaceHtml(pageClass))'), "Metrics/KPIs route should render the Proof workspace");

assert.match(proofBlock, /Metrics \/ KPIs/, "Proof should include Metrics / KPIs");
// PORTED 2026-07-26 (hygiene, extended-test triage). The section subtitle "Track the numbers that
// prove LegalEase is moving." has zero occurrences anywhere in the product: the Metrics / KPIs
// panel head now carries an "Add Metric" action instead of a subtitle, and each metric explains
// itself with a per-row note next to its value. Asserting that structure is a stronger version of
// "Metrics / KPIs should explain its purpose" than the single dead sentence was, because it fails
// if the per-metric explanation is ever dropped.
assert.match(proofBlock, /<div class="command-panel" id="metrics-kpis">/, "Metrics / KPIs should be an addressable panel");
assert.match(proofBlock, /id="metrics-kpis"[\s\S]{0,400}metrics\.map\(\(\[label, value, note\]\)/, "Metrics / KPIs should render each metric with a label, value and explanatory note");
assert.match(proofBlock, /id="metrics-kpis"[\s\S]{0,600}<b>\\\$\{esc\(label\)\}<\/b><span>\\\$\{esc\(note\)\}<\/span>/, "each Metrics / KPIs row should show its explanatory note beside the label");
assert.match(proofBlock, /Needs update/, "Metrics / KPIs should have useful missing states");
assert.match(proofBlock, /No value added yet\./, "Metrics / KPIs should explain missing values quietly");
assert.doesNotMatch(proofBlock, /RCAP Program Review|Record Clearing Access Program/, "Proof / Metrics should not include RCAP content");

assert.match(sectionConfigBlock, /title:"Growth"/, "Growth route should render Growth page");
assert.match(sectionConfigBlock, /title:"Partners"/, "Partners route should render Partners page");
assert.match(sectionConfigBlock, /title:"Production"/, "Production route should render Production page");
assert.match(sectionConfigBlock, /title:"Proof"/, "Proof route should render Proof page");
assert.match(sectionConfigBlock, /title:"More"/, "More route should render More page");

assert.match(safeModeBlock, /<h1 class="big-title">Recovery Mode<\/h1>/, "Safe Mode should be founder-facing Recovery Mode");
for (const label of ["Back to Today", "Try full app again", "Open App Status", "Sign out"]) {
  assert(safeModeBlock.includes(label), `Recovery Mode should include ${label}`);
}
assert.match(safeModeBlock, /<details[\s\S]*Show advanced details/, "Recovery Mode should hide technical details behind Advanced details");
assert.doesNotMatch(safeModeBlock.split("<details")[0], /Failed module|Content type|Timeout ms|Request aborted/, "Recovery Mode summary should not show technical table before advanced details");

for (const label of ["Partner Summary", "Review Packet", "Roger's Next Steps", "Missing Information", "Safety Status", "Activity"]) {
  assert(rcapBlock.includes(label), `RCAP Program Review should include ${label}`);
}
for (const oldLabel of ["Refresh RCAP Artifacts", "Generate Internal Handoff Packet", "activation review"]) {
  assert(!rcapBlock.includes(oldLabel), `RCAP Program Review should not show ${oldLabel}`);
}

assert(source.includes("lee-pill"), "Le-E bubble should still exist");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("UX emergency repair tests passed.");
