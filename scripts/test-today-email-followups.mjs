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
  const next = rest.slice(1).search(/\n(?:    )?function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const today = functionBlock("commandCenterOverviewHtml");
const todayEmail = functionBlock("emailReadinessState") + "\n" + functionBlock("cockpitEmailFollowupsHtml");
const partners = functionBlock("partnersPageHtml");
const proof = functionBlock("proofWorkspaceHtml");

assert(today.includes("${cockpitEmailFollowupsHtml()}"), "Today should render email follow-up readiness without replacing standup");
assert(today.includes("${cockpitTodayStandupBoardHtml()}"), "Today email follow-ups should not overwrite the standup board");

for (const required of [
  "Email Follow-Ups",
  "Email is not connected yet. Follow-ups are using internal planning items.",
  "Email drafts can be prepared for review. Email sending is off.",
  "Partner follow-up",
  "Draft needed",
  "Review Harris County / Clean Slate follow-up context.",
  "Investor update",
  "Needs review",
  "Prepare language internally before Roger sends manually.",
  "Prepare Draft",
  "Review Draft",
  "Review internal follow-ups"
]) {
  assert(todayEmail.includes(required), `Today email follow-up fallback should include ${required}`);
}

for (const broken of ["neededReview", "reviewPrepare"]) {
  assert(!todayEmail.includes(broken), `Today email follow-ups should not include broken concatenated copy ${broken}`);
}

for (const requiredClass of [
  "email-followup-row",
  "email-followup-title",
  "email-followup-status",
  "email-followup-detail"
]) {
  assert(todayEmail.includes(requiredClass), `Today email follow-ups should use structured class ${requiredClass}`);
}

assert(partners.includes("Approval still prepares drafts; it does not execute sends or handoffs."), "Partners should show approval as status-only display.");
assert(partners.includes("Approval does not send."), "Partners should preserve draft-only partner follow-up discipline.");
assert(!partners.includes("Partner Email Follow-Ups"), "Top-level Partners should not render the old email follow-up panel.");

assert(proof.includes("Email note"), "Proof should support Email note as an evidence type");

for (const forbidden of [
  "Send Email",
  "Auto Reply",
  "Forward Email",
  "Delete Email",
  "Post Now",
  "Publish Now"
]) {
  assert(!todayEmail.includes(forbidden), `Today email follow-ups should not include ${forbidden}`);
  assert(!partners.includes(forbidden), `Partner email follow-ups should not include ${forbidden}`);
}

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0");

console.log("today email follow-up tests passed.");
