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

const more = functionBlock("moreWorkspaceHtml");
const draftWorkflow = functionBlock("cockpitEmailDraftWorkflowHtml");
const draftResponse = functionBlock("emailDraftResponse");
const prepareDraft = functionBlock("prepareEmailDraft");
const emailBlocks = [more, draftWorkflow, draftResponse, prepareDraft, source.includes("emailDrafts") ? "emailDrafts" : ""].join("\n");

for (const required of [
  "Email Draft Workflow",
  "Draft Needed",
  "Prepare reply",
  "Draft Prepared",
  "Ready for review",
  "Needs Review",
  "Roger approval needed",
  "Approved to Send Manually",
  "Manual send only",
  "Roger sends outside the OS.",
  "Sent Manually",
  "Logged after Roger sends",
  "No email was sent by the OS.",
  "Prepare Draft",
  "Review Draft",
  "Mark Sent Manually",
  "prepareEmailDraft",
  "/api/email/draft",
  "emailDrafts",
  "Drafts are internal until Roger reviews them. Email sending is off.",
  "Email draft",
  "Partner follow-up",
  "Prepared email draft for review",
  "Email sending: Off"
]) {
  assert(emailBlocks.includes(required), `Email draft safety UI should include ${required}`);
}

assert(!draftWorkflow.includes("<strong>Review</strong>"), "Email Draft Workflow cards should not all use generic Review values");

for (const forbidden of [
  "Send Email",
  "Auto Reply",
  "Forward Email",
  "Delete Email",
  "Execute Email",
  "Run Email"
]) {
  assert(!emailBlocks.includes(forbidden), `Email draft workflow should not expose ${forbidden}`);
}

for (const forbiddenRoute of [
  'url.pathname === "/api/email/send"',
  'url.pathname === "/api/email/forward"',
  'url.pathname === "/api/email/delete"',
  'url.pathname === "/api/email/archive"',
  'url.pathname === "/api/email/label"',
  "gmail.users.messages.send"
]) {
  assert(!source.includes(forbiddenRoute), `Email safety should not include ${forbiddenRoute}`);
}

for (const secretPhrase of [
  "access token",
  "refresh token",
  "api key",
  "provider secret"
]) {
  assert(!emailBlocks.toLowerCase().includes(secretPhrase), `Email UI should not expose ${secretPhrase}`);
}

assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0");

console.log("email draft safety tests passed.");
