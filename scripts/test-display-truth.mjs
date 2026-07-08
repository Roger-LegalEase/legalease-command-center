#!/usr/bin/env node
// Display truth: no hardcoded safety-posture literal may render as status.
//
// The 2026-07-02 ground-truth audit found the UI's safety claims were typed constants:
// the screen said "Email sending: Off" because someone wrote that string, not because
// anything checked the gates. Derivation now lives in safety-posture.mjs (server) and
// the *PostureRow/*PostureLabel client helpers. These checks pin that arrangement so a
// future page cannot quietly reintroduce a literal that keeps saying Off after a real
// gate flips (Slice 1 of docs/hardening-run-20260708.md).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

console.log("Display-truth tests");

const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
const posture = readFileSync(new URL("./safety-posture.mjs", import.meta.url), "utf8");

function occurrences(haystack, needle) {
  let count = 0, at = 0;
  for (;;) {
    at = haystack.indexOf(needle, at);
    if (at < 0) return count;
    count += 1;
    at += needle.length;
  }
}

// Which client helper function owns a given index in the server source?
function insideFunction(source, index, fnName) {
  const fnStart = source.indexOf(`function ${fnName}(`);
  assert(fnStart >= 0, `${fnName} exists`);
  const fnEnd = source.indexOf("\n    }", fnStart);
  return index > fnStart && index < fnEnd;
}

// ---- 1. The email posture literal lives ONLY in the derivation module ----------------------
{
  assert.equal(occurrences(server, "Email sending: Off"), 0, "preview-server has zero hardcoded 'Email sending: Off'");
  assert(posture.includes('"Email sending: Off"'), "safety-posture.mjs owns the off label");
  assert(server.includes('"Email sending: Unverified"'), "client fallback says Unverified, never a comforting Off");
  ok("email posture: literal exists only inside the gate-derived vocabulary");
}

// ---- 2. Outreach automation label is derived, with exactly one vocabulary literal ----------
{
  assert.equal(occurrences(server, "Outreach automation: Off"), 1, "exactly one 'Outreach automation: Off' (the vocabulary line)");
  assert(insideFunction(server, server.indexOf("Outreach automation: Off"), "outreachAutomationLabel"), "the literal sits inside outreachAutomationLabel()");
  assert(server.includes('"Outreach automation: Unverified"'), "outreach fallback says Unverified");
  assert(server.includes("esc(outreachAutomationLabel())"), "the RCAP status line renders the derived label");
  ok("outreach automation posture: derived from /api/safety/posture, not typed");
}

// ---- 3. Publishing posture is derived, with exactly one vocabulary literal -----------------
{
  assert.equal(occurrences(server, "Publishing: Off"), 1, "exactly one 'Publishing: Off' (the vocabulary line)");
  assert(insideFunction(server, server.indexOf("Publishing: Off"), "publishingPostureRow"), "the literal sits inside publishingPostureRow()");
  assert(server.includes('"Publishing: Unverified"'), "publishing fallback says Unverified");
  assert.equal(occurrences(server, "publishingPostureRow()"), occurrences(server, "publishingPostureRow()"), "helper referenced");
  assert(occurrences(server, "publishingPostureRow()") >= 3, "safety lists and the support page render the derived publishing row");
  ok("publishing posture: derived from the live posting gates, not typed");
}

// ---- 4. The fabricated External Action Outbox records are gone -----------------------------
{
  for (const ghost of [
    "LinkedIn post published after final confirmation",
    "Approved LinkedIn post waiting for final confirmation",
    "Prepared email draft for review"
  ]) {
    assert(!server.includes(ghost), `fabricated outbox record absent: ${ghost}`);
  }
  assert(server.includes("The outbox is not built yet"), "outbox section states the honest-zero truth");
  ok("External Action Outbox shows honest-zero, not fabricated sample records");
}

// ---- 5. Slash-separated every-possible-status strings are gone -----------------------------
{
  for (const ambiguous of ["Not connected / Connected", "Not connected / Read-only", "Not connected / Draft-only"]) {
    assert.equal(occurrences(server, ambiguous), 0, `ambiguous status absent: ${ambiguous}`);
  }
  assert(server.includes("moreAccountConnected("), "More page derives connection state from socialAccounts signals");
  ok("connection statuses are single derived states, not menus of possibilities");
}

console.log(`\nAll ${passed} display-truth checks passed.`);
