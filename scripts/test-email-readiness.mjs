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
const appStatus = functionBlock("osHealthPageHtml");
const emailModel = functionBlock("emailReadinessState");
const emailStatus = functionBlock("emailStatusResponse");

for (const required of [
  "Gmail / Email",
  "Draft-only",
  "Email drafts can be prepared for review.",
  "Email sending is off.",
  "Prepare Email Connection.",
  "No messages sent.",
  "Prepare Email Connection",
  "Check Email Readiness"
]) {
  assert(more.includes(required), `Activation Center email readiness should include ${required}`);
}

for (const status of [
  "Not connected",
  "Ready to connect",
  "Read-only planned",
  "Draft-only planned",
  "Read/draft connected",
  "Needs setup",
  "Error"
]) {
  assert(emailModel.includes(status), `Email readiness model should define ${status}`);
}

for (const capability of [
  "Read email summaries",
  "Find important threads",
  "Prepare reply drafts",
  "Prepare outbound drafts",
  "Link email follow-ups to Today / Partners / Proof",
  "Flag unanswered partner/investor messages"
]) {
  assert(emailModel.includes(capability), `Email readiness should include capability ${capability}`);
}

for (const disabled of [
  "Send email",
  "Auto-reply",
  "Forward email",
  "Delete email",
  "Archive email",
  "Label email",
  "Modify inbox"
]) {
  assert(emailModel.includes(disabled), `Email readiness should explicitly disable ${disabled}`);
}

for (const required of [
  "Email:",
  "Email readiness:",
  "Email drafts can be prepared for review. Email sending is off.",
  "Email sending: Off"
]) {
  assert(appStatus.includes(required), `App Status should include ${required}`);
}

for (const route of [
  'url.pathname === "/api/email/status"',
  'url.pathname === "/api/email/inbox-summary"',
  'url.pathname === "/api/email/follow-ups"',
  'url.pathname === "/api/email/draft"'
]) {
  assert(source.includes(route), `Email readiness route should exist: ${route}`);
}

assert(emailStatus.includes("Email is not connected yet."), "Missing email setup should fail safely with founder-facing copy");
assert(more.includes("No messages sent."), "Email readiness should keep no-message-sent safety copy visible");
assert(!more.includes("Send Email"), "Email readiness should not expose Send Email");
assert(!more.includes("Auto Reply"), "Email readiness should not expose Auto Reply");
assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0");

console.log("email readiness tests passed.");
