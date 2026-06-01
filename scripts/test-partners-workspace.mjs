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
  "Track partner conversations, follow-ups, active programs, and proof-worthy movement.",
  "Manual follow-up only",
  "Partner Summary",
  "Active Partners",
  "Follow-ups Due",
  "Stalled",
  "Proof-Worthy",
  "Programs in Review",
  "RCAP Status",
  "Next Partner Move",
  "Active Programs",
  "RCAP Program",
  "Record Clearing Access Program partner review workspace.",
  "Open RCAP Program",
  "Follow-Ups",
  "Partner Pipeline",
  "Lead",
  "Qualified",
  "Intro Scheduled",
  "Proposal Sent",
  "Active",
  "Stalled",
  "Partner Proof",
  "Add Partner",
  "Open Add Partner Form"
]) {
  assert(partners.includes(required), `Partners workspace should include ${required}`);
}

for (const action of [
  "Add Partner",
  "Add Follow-Up",
  "Open RCAP Program",
  "Review Follow-Ups",
  "Review Partner Proof",
  "Add Partner Note",
  "Move to Tomorrow",
  "Mark Contacted",
  "Add Note",
  "Open Partner",
  "Move Stage",
  "Add Partner Win",
  "Turn into Proof",
  "Turn into Post",
  "Add to Investor Update"
]) {
  assert(partners.includes(action), `Partners workspace should include action ${action}`);
}

assert(partners.includes("Add a new partner prospect or program."), "Add Partner should be collapsed/lower-context copy, not the only dominant above-fold content");
assert(partners.indexOf("Partner Summary") < partners.indexOf("Open Add Partner Form"), "Partner Summary should appear before the Add Partner form");
assert(partners.indexOf("Next Partner Move") < partners.indexOf("Open Add Partner Form"), "Next Partner Move should appear before the Add Partner form");
assert(partners.indexOf("Follow-Ups") < partners.indexOf("Open Add Partner Form"), "Follow-Ups should appear before the Add Partner form");

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
