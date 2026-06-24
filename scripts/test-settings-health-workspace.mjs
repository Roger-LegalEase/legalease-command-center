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
const settings = functionBlock("settingsHealthReadoutHtml");

assert(renderBlock.includes('safeRenderModule("os-health", () => osHealthPageHtml(pageClass))'), "OS Health page should remain routable.");
assert(renderBlock.includes('safeRenderModule("data-integrity", () => dataIntegrityPageHtml(pageClass))'), "Data Integrity page should remain routable.");
assert(renderBlock.includes("${settingsHealthReadoutHtml()}"), "Settings should render the Settings & Health command readout.");

for (const required of [
  "Settings &amp; Health",
  "Health, integrity, connectors, storage, and safety switches in one display-only control surface.",
  "Health &amp; Integrity",
  "Connector Readiness",
  "Live Gate Config",
  "Connected Accounts",
  "Hosted Supabase State",
  "Hosted Supabase state",
  "not yet wired",
  "state.osHealthSnapshots latest record",
  "cockpitOsHealthRecord() fallback",
  "state.dataIntegritySnapshots latest record",
  "buildDataIntegritySnapshot(state) fallback",
  "connectorItems() from connectorStatus + socialAccounts + env readiness",
  "state.runtime.livePostingGates",
  "buildSmokeTestStatus(state)",
  "linkedinSetupState(state) + runtime.livePostingGates.linkedin",
  "xSetupState(state) + runtime.livePostingGates.x",
  "metaSetupState(state) + runtime live gates",
  "state.persistence + Supabase health",
  "End-of-build confirmation remains required.",
  "Safety posture is display-only here.",
  "This surface does not enable live gates, send email, publish posts, write calendars, activate dashboards, or contact external systems.",
  "Refresh OS Health",
  "Refresh State Integrity",
  "Start Smoke Test",
  "Open Connector Inbox",
  "Open App Status",
  "Open Data Check"
]) {
  assert(settings.includes(required), `Settings & Health should include ${required}`);
}

for (const forbidden of [
  "Enable live gates",
  "Turn on publishing",
  "Send email",
  "Publish post",
  "Write calendar",
  "Activate dashboard",
  "OAuth token",
  "secret value"
]) {
  assert(!settings.includes(forbidden), `Settings & Health should not expose unsafe action/copy: ${forbidden}`);
}

assert(settings.includes("clientLiveGatesCount(state)"), "Settings should compute live gate count from runtime state.");
assert(settings.includes("connectorItems()"), "Settings should use connectorItems for connector readiness.");
assert(settings.includes("cockpitDataIntegrityRecord()"), "Settings should use the data integrity source.");
assert(settings.includes("cockpitOsHealthRecord()"), "Settings should use the OS health source.");

console.log("settings health workspace tests passed.");
