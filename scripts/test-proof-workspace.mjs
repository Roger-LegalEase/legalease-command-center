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
const proof = functionBlock("proofWorkspaceHtml");
const routeAliases = source.match(/const routeAliases = \{([\s\S]*?)\};/)?.[1] || "";

assert(renderBlock.includes('safeRenderModule("proof", () => proofWorkspaceHtml(pageClass))'), "#proof should render the Proof workspace");
assert(routeAliases.includes('kpis:"proof"') || routeAliases.includes('kpis: "proof"'), "#kpis should route to Proof / Metrics");
assert(routeAliases.includes('metrics:"proof"') || routeAliases.includes('metrics: "proof"'), "#metrics should route to Proof / Metrics");

for (const required of [
  "Proof",
  "Capture wins, evidence, metrics, reports, and investor-ready proof.",
  "Internal only",
  "Ready for review",
  "Proof Summary",
  "Wins Captured",
  "Evidence Items",
  "Metrics Updated",
  "Reports Ready",
  "Investor Proof",
  "Partner Proof",
  "Next Proof Move",
  "Wins",
  "Evidence",
  "Metrics / KPIs",
  "Track the numbers that prove LegalEase is moving.",
  "Revenue",
  "Leads",
  "Petitions",
  "Partners",
  "Content output",
  "Proof captured",
  "Manual posts",
  "Runway",
  "Reports",
  "Investor Proof",
  "Partner Proof",
  "Data Room",
  "Proof Gaps",
  "Add Proof",
  "Add Metric",
  "Generate Report",
  "Add to Data Room",
  "Needs update",
  "No value added yet.",
  "No attachment yet",
  "Proof Outputs",
  "Turn evidence into reports, investor updates, partner materials, and data room assets.",
  "Investor Update Builder",
  "Turn proof, metrics, and wins into a review-ready investor update.",
  "Review-ready draft",
  "Investor updates are internal drafts until Roger shares them."
]) {
  assert(proof.includes(required), `Proof workspace should include ${required}`);
}

for (const action of [
  "Create Proof Item",
  "Update Metrics",
  "Add Win",
  "Turn into Proof",
  "Turn into Post",
  "Add to Investor Update",
  "Add Evidence",
  "Link to Win",
  "Turn into Report",
  "View Evidence",
  "Attach File",
  "Link Metric",
  "Update Metric",
  "Add Note",
  "Generate Investor Update",
  "Add Founder Note",
  "Review Draft",
  "Review Report",
  "Add to Pitch Deck Notes",
  "Add Partner Proof",
  "Turn into Partner Report",
  "Link to Partner",
  "Add Document",
  "Add Report",
  "Prepare Export"
]) {
  assert(proof.includes(action), `Proof workspace should include action ${action}`);
}

assert.match(source, /\.proof-preview\s*\{[^}]*min-height:/s, "Evidence cards should include preview / attachment UI");
assert(proof.includes("File attachments can be added next."), "Attach File should be disabled with a clear reason when not wired");
assert.equal((proof.match(/Not added yet\./g) || []).length, 0, "Proof metrics should use compact Needs update copy instead of repeated Not added yet.");
assert(proof.indexOf("<h2>Wins") < proof.indexOf("<h2>Evidence"), "Evidence should appear close to Wins in the main proof column");
assert(proof.indexOf("<h2>Evidence") < proof.indexOf("<h2>Reports"), "Evidence should be visible before lower report sections");
assert(proof.indexOf("<h2>Proof Outputs") < proof.indexOf("<h2>Data Room"), "Reports, investor proof, partner proof, and data room should be grouped under Proof Outputs");

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "audit event",
  "internal state",
  "generated client",
  "route map",
  "artifact",
  "live gates",
  "external action dispatcher",
  "schema",
  "diagnostics",
  "RCAP Program Review",
  "Recovery Mode",
  "Production"
]) {
  assert(!proof.includes(forbidden), `Proof normal UI should not include ${forbidden}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("proof workspace tests passed.");
