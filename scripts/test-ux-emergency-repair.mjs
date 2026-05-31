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
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const renderBlock = functionBlock("render");
const safeModeBlock = functionBlock("renderSafeBootShell");
const routeStart = source.indexOf("const routeAliases");
assert(routeStart >= 0, "routeAliases should exist in render");
const routeBlock = source.slice(routeStart, source.indexOf("const pageClass", routeStart));
const rcapBlock = functionBlock("rcapReviewWorkspaceHtml");
const metricsBlock = functionBlock("metricsDashboardHtml");
const sectionConfigBlock = functionBlock("sectionLandingConfig");

const hiddenMarkers = ["topnav-fixed-v1", "app-layout-stable-v1", "button-audit-v1"];
const htmlShellBlock = source.includes("function htmlShell(") ? source.slice(source.indexOf("function htmlShell("), source.indexOf("<script>")) : "";
for (const marker of hiddenMarkers) {
  assert(!htmlShellBlock.includes(marker), `${marker} should not appear in normal rendered shell output`);
  assert(!source.includes(`<span>${marker}</span>`), `${marker} should not be shown as visible debug text`);
}

assert(routeBlock.includes('today:"overview"'), "#today should render the Today/Overview page");
assert(routeBlock.includes('kpis:"metrics"'), "#kpis should render Metrics");
assert(routeBlock.includes('marketing:"growth"'), "#marketing should render Growth/Marketing");
assert(routeBlock.includes('social:"growth"'), "#social should render Growth/Marketing");
assert(routeBlock.includes('rcap:"production-activation-rcap"'), "#rcap should render RCAP Program Review");

assert(source.includes('pageId === "production-activation-rcap" ? rcapReviewWorkspaceHtml(pageClass) : ""'), "RCAP Program Review should render only on RCAP routes");
assert(source.includes('["metrics", "kpis"].includes(pageId)'), "Metrics/KPIs route should render the metrics page");

assert.match(metricsBlock, /<h1 class="big-title">Metrics<\/h1>/, "Metrics page should have a Metrics title");
assert.match(metricsBlock, /Track the numbers that show whether the company is moving\./, "Metrics page should explain its purpose");
assert.match(metricsBlock, /No metrics added yet\. Add your first metric\./, "Metrics page should have a useful empty state");
assert.doesNotMatch(metricsBlock, /RCAP Program Review|Record Clearing Access Program/, "Metrics page should not include RCAP content");

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

for (const label of ["Program Summary", "Review Packet", "Next Steps", "Missing Information", "Safety Status", "Activity"]) {
  assert(rcapBlock.includes(label), `RCAP Program Review should include ${label}`);
}
for (const oldLabel of ["Refresh RCAP Artifacts", "Generate Internal Handoff Packet", "activation review"]) {
  assert(!rcapBlock.includes(oldLabel), `RCAP Program Review should not show ${oldLabel}`);
}

assert(source.includes("lee-pill"), "Le-E bubble should still exist");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("UX emergency repair tests passed.");
