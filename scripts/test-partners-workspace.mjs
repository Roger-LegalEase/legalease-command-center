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
const partners = functionBlock("partnersPageHtml");

assert(renderBlock.includes('safeRenderModule("partners", () => partnersPageHtml(pageClass))'), "#partners should render the Partners workspace");

for (const required of [
  "Partners",
  "RCAP, pilots, programs, and partner follow-ups.",
  "command-surface",
  "Review follow-ups",
  "Partner pipeline",
  "normalizePartnerLifecycle + partnerLifecycleInsights",
  "Money",
  "partners, programs, pilots",
  "Programs & pilots",
  "partnerPrograms + pilots",
  "Safety rails",
  "status-only display",
  "Suppression matrix",
  "Suppression behavior was not changed.",
  "Approval rules",
  "Approval still prepares drafts; it does not execute sends or handoffs.",
  "command-not-wired",
  "Suppression and approval run silently."
]) {
  assert(partners.includes(required), `Partners workspace should include ${required}`);
}

for (const action of [
  "Review",
  "Open programs",
  "partner-programs",
  "pilots"
]) {
  assert(partners.includes(action), `Partners workspace should include action ${action}`);
}

assert(partners.includes('growthItems("partners").map(partner => normalizePartnerLifecycle(partner))'), "Partners should normalize partner lifecycle records before rendering.");
assert(partners.includes("partnerLifecycleInsights({ ...state, partners })"), "Partners should read lifecycle insights for partner movement.");
assert(partners.includes("state.partnerPrograms || []"), "Partners should read partnerPrograms directly.");
assert(partners.includes("state.pilots || []"), "Partners should read pilots directly.");
assert(!partners.includes("Add a new partner prospect or program."), "Top-level Partners should not lead with the old add-partner form.");

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "audit event",
  "internal state",
  "generated client",
  "route map",
  "live gates",
  "production activation",
  "RCAP Program Review",
  "Recovery Mode"
]) {
  assert(!partners.includes(forbidden), `Partners normal UI should not include ${forbidden}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("partners workspace tests passed.");
