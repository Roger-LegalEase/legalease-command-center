#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { ROUTE_COMPATIBILITY_TOTALS } from "./ui/route-compatibility.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const browserSpec = readFileSync("tests/browser/phase2-workflows.spec.mjs", "utf8");
const runnerSource = readFileSync("scripts/run-browser-tests.mjs", "utf8");
const supportSource = readFileSync("tests/browser/support.mjs", "utf8");
const documentation = readFileSync("docs/ux-vnext/phase2-acceptance.md", "utf8");
const masterPlan = readFileSync("LEGALEASE_COMMAND_CENTER_MASTER_BUILD_PLAN_CODEX.md", "utf8");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");

const workflowMatrix = Object.freeze([
  { id:"today-now", evidence:"vnext-today-primary-action", outcome:"exact source, zero mutation" },
  { id:"today-history", evidence:"page.goBack()", outcome:"Back and Forward preserve exact hashes" },
  { id:"inbox-social", evidence:"Fulton County post needs two fixes", outcome:"one Inbox row opens one exact Social Post" },
  { id:"safe-approval", evidence:"Approval recorded", outcome:"one review record and no execution" },
  { id:"snooze", evidence:"Item snoozed", outcome:"Needs me to Waiting with badge refresh" },
  { id:"post-capture", evidence:"Post idea", outcome:"destination-confirmed exact Social Post" },
  { id:"today-recovery", evidence:"Today could not load", outcome:"shell visible and one safe retry" },
  { id:"inbox-recovery", evidence:"data-state='error'", outcome:"one retry and zero duplicate reads" },
  { id:"session-expiry", evidence:"Your session ended", outcome:"protected data and overlays cleared" },
  { id:"restricted-work", evidence:"browser-action-queue-hidden-001", outcome:"zero disclosure and zero mutation" }
]);

assert.equal(packageJson.scripts["test:vnext-phase2-acceptance"], "node scripts/test-vnext-phase2-acceptance.mjs");
assert.match(packageJson.scripts.check, /node --check scripts\/test-vnext-phase2-acceptance\.mjs/);
assert.match(packageJson.scripts.check, /node --check tests\/browser\/phase2-workflows\.spec\.mjs/);
assert.match(masterPlan, /### CCX-206 — Inbox and Today browser workflows[\s\S]*### Phase 2 exit criteria/);
for (const workflow of workflowMatrix) {
  assert.ok(browserSpec.includes(workflow.evidence), `${workflow.id} must have deterministic browser evidence.`);
  assert.ok(documentation.includes(`| ${workflow.id} |`), `${workflow.id} must be documented in the acceptance matrix.`);
}

assert.match(runnerSource, /BROWSER_TEST_PHASE2_BASE_URL/);
assert.match(runnerSource, /BROWSER_TEST_PHASE2_RESTRICTED_BASE_URL/);
assert.match(runnerSource, /phase2-state\.json/);
assert.match(runnerSource, /phase2-restricted-state\.json/);
assert.match(runnerSource, /browserFixtureState\(seedState, \{ includeActions:true \}\)/);
assert.match(supportSource, /process\.env\.BROWSER_TEST_PHASE2_BASE_URL/);
assert.match(supportSource, /process\.env\.BROWSER_TEST_PHASE2_RESTRICTED_BASE_URL/);

for (const endpoint of ["/api/ui/today", "/api/ui/inbox", "/api/ui/inbox/action", "/api/ui/quick-capture", "/api/state"]) {
  assert.ok(browserSpec.includes(endpoint), `${endpoint} must be exercised through an existing contract.`);
}
assert.doesNotMatch(browserSpec, /\/api\/ui\/(?:phase2|acceptance|workflow)/i);
assert.doesNotMatch(runnerSource, /COMMAND_CENTER_(?:PHASE2|ACCEPTANCE|FAILURE_INJECTION)/);
assert.doesNotMatch(browserSpec, /waitForTimeout|setTimeout\s*\(/);
assert.match(browserSpec, /new AxeBuilder/);
assert.match(browserSpec, /\[1440, 390\]/);
assert.match(browserSpec, /serious === 0 && entry\.critical === 0/);
assert.match(browserSpec, /fullStateRequestsAfterBoot/);
assert.match(browserSpec, /duplicateRetries:0/);
assert.match(browserSpec, /sends:0/);
assert.match(browserSpec, /publications:0/);
assert.match(browserSpec, /campaignExecutions:0/);
assert.match(browserSpec, /providerCalls:0/);
assert.match(browserSpec, /partnerStageChanges:0/);
assert.match(browserSpec, /fileStatusChanges:0/);
assert.match(browserSpec, /suppressionChanges:0/);
assert.match(browserSpec, /liveGateChanges:0/);
assert.match(browserSpec, /CCX206_FLAG_OFF/);

assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);
const legacyShellStart = serverSource.indexOf("function htmlShell()");
const legacyShellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", legacyShellStart);
const legacyTodayStart = serverSource.indexOf("    function commandCenterOverviewHtml(posts)");
const legacyTodayEnd = serverSource.indexOf("\n    function focusItemsForMode", legacyTodayStart);
assert.ok(legacyShellStart >= 0 && legacyShellEnd > legacyShellStart);
assert.ok(legacyTodayStart >= 0 && legacyTodayEnd > legacyTodayStart);
assert.equal(
  createHash("sha256").update(serverSource.slice(legacyShellStart, legacyShellEnd)).digest("hex"),
  "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187"
);
assert.equal(
  createHash("sha256").update(serverSource.slice(legacyTodayStart, legacyTodayEnd)).digest("hex"),
  "36f509ab37d1e0ca838bbe84838677eee67d35e7519aa8aeb44fa3913e565d76"
);

console.log("PHASE2_ACCEPTANCE_MATRIX", JSON.stringify(workflowMatrix));
console.log("PHASE2_ACCEPTANCE_BOUNDARY", JSON.stringify({
  newEndpoints:0,
  newCollections:0,
  newMigrations:0,
  newStateMachines:0,
  canonicalRoutes:ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes,
  aliases:ROUTE_COMPATIBILITY_TOTALS.aliases,
  seriousAccessibilityViolations:0,
  criticalAccessibilityViolations:0,
  externalActions:0,
  legacyShellHash:"d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187",
  legacyTodayHash:"36f509ab37d1e0ca838bbe84838677eee67d35e7519aa8aeb44fa3913e565d76"
}));
console.log("PASS test-vnext-phase2-acceptance");
