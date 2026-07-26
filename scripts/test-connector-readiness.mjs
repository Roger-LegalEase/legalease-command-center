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

const more = functionBlock("moreWorkspaceHtml");
const appStatus = functionBlock("osHealthPageHtml");
// PORTED 2026-07-26 (hygiene, extended-test triage): `productionWorkspaceHtml` is now a
// one-line delegate to `productionCommandSurfaceHtml`, so reading its block asserted nothing.
const production = functionBlock("productionCommandSurfaceHtml");
assert(production.length > 2000, "productionCommandSurfaceHtml should be the real Production surface, not a delegate");

// PORTED 2026-07-26 (hygiene, extended-test triage). The Activation Center no longer carries
// the HARDCODED string "Email sending is off." Per scripts/safety-posture.mjs, hardcoded
// safety claims were the bug ("the screen said 'Email sending: Off' because someone typed
// it"), so the email row now renders the DERIVED posture label via `emailPostureLabel()`.
// Asserting the derivation is a stronger guarantee than the old literal grep, so the literal
// is replaced by these three checks rather than dropped.
assert(more.includes("emailPostureLabel()"), "the Activation Center email row must render the derived email posture label, not a typed-in claim");
const emailPosture = readFileSync(join(process.cwd(), "scripts", "safety-posture.mjs"), "utf8");
assert(emailPosture.includes('off: "Email sending: Off"'), "the derived email posture must still report Email sending: Off when sending is off");
assert(emailPosture.includes('live: "Email sending: LIVE"'), "the derived email posture must report LIVE when sending is live, so Off is never shown while live");
// The readiness card copy that still promises no sending lives in emailReadinessState().
assert(functionBlock("emailReadinessState").includes("Email sending is off."), "the email readiness card should still promise that email sending is off");

for (const required of [
  "Calendar reads can help Today understand meetings and focus blocks.",
  "Calendar writes are off.",
  "Prepare Calendar Connection",
  "Check Calendar Readiness",
  "Email drafts can be prepared for review.",
  // "Email sending is off." is asserted above, against its derived posture source.
  "Prepare Email Connection",
  "Check Email Readiness",
  "Server-side image generation can be used when configured.",
  "Missing setup saves an image request instead.",
  "Platform checklists are available for future setup.",
  "No accounts are connected.",
  "Prepare LinkedIn",
  "Prepare Facebook",
  "Prepare Instagram",
  "Prepare Twitter / X"
]) {
  assert(more.includes(required), `Connector readiness should include ${required}`);
}

assert(!more.includes("TikTok"), "Connector readiness should not include TikTok");
assert(!more.includes("Prepare TikTok"), "Connector readiness should not include Prepare TikTok");

for (const required of [
  "Tasks and priorities:",
  "Calendar:",
  "Email:",
  "Image generation:",
  "Social accounts:",
  "External actions:"
]) {
  assert(appStatus.includes(required), `App Status should include connector readiness row ${required}`);
}

// PORTED 2026-07-26 (hygiene, extended-test triage). The "Connected Accounts" section moved
// off the Production workspace and into the Activation Center (`moreWorkspaceHtml`); none of
// this copy has any occurrence in productionCommandSurfaceHtml. The positive assertions are
// therefore made against the block that now owns the surface, and the TikTok negative is kept
// against BOTH so neither surface can quietly grow an unapproved channel.
assert(more.includes("Prepare LinkedIn"), "Connected Accounts should include Prepare LinkedIn");
assert(more.includes("Prepare Twitter / X"), "Connected Accounts should include Prepare Twitter / X");
assert(more.includes("Twitter / X") && more.includes("Not connected"), "Connected Accounts should include Twitter / X");
assert(!production.includes("TikTok"), "the Production surface should not include TikTok");
assert(!more.includes("TikTok"), "Connected Accounts should not include TikTok");
assert(!source.includes("startOAuth"), "No OAuth should start in this pass");
assert(!source.includes("google.calendar.events.insert"), "Calendar writes should not be enabled");
assert(!source.includes("gmail.users.messages.send"), "Email sending should not be enabled");
assert(!source.includes("Schedule to LinkedIn"), "Live social scheduling should not be enabled");
assert(!source.includes("Post Now"), "Live posting should not be enabled");

console.log("connector readiness tests passed.");
