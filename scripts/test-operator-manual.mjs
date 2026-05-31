#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const serverPath = join(root, "scripts", "preview-server.mjs");
const packagePath = join(root, "package.json");
const source = readFileSync(serverPath, "utf8");
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    console.error(`Operator manual test failed: ${message}`);
    process.exit(1);
  }
}

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} exists`);
  const rest = source.slice(start);
  const next = rest.search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next) : rest;
}

assert(source.includes("operator-manual"), "#operator-manual route exists in active renderer");
assert(source.includes("cockpitOperatorManualHtml"), "cockpit Operator Manual card exists");
assert(source.includes("operatorManualPageHtml"), "operator manual page renderer exists");
assert(source.includes("Open Guide"), "cockpit links to Guide");

const manual = functionBlock("operatorManualPageHtml");
const cockpit = functionBlock("cockpitOperatorManualHtml");

[
  "What the LegalEase OS is",
  "Core Operating Loop",
  "Le-E",
  "Quick Capture + Capture Inbox",
  "Tasks",
  "Daily Rituals",
  "Search + Command Palette",
  "App Status + Self-Check",
  "Data Check",
  "Proof / Data Room",
  "RCAP Program",
  "Safety Gates",
  "Deployment Checklist",
  "Break/Fix Guide",
  "Glossary"
].forEach(section => assert(manual.includes(section), `manual section renders: ${section}`));

[
  "No emails",
  "No publishing",
  "No dashboard activation",
  "No legal promises",
  "No secret exposure"
].forEach(text => assert(manual.includes(text), `Le-E limitation renders: ${text}`));

[
  "Publishing is off",
  "No Partner Journey calls",
  "No destructive actions"
].forEach(text => assert(manual.includes(text), `safety gates language renders: ${text}`));

[
  "Deploy latest commit",
  "Hard refresh",
  "Open Today",
  "Run Self-Check",
  "Check App Status",
  "Verify no external actions"
].forEach(text => assert(manual.includes(text), `deployment checklist item renders: ${text}`));

[
  "render error screen",
  "broken buttons",
  "auth failure",
  "stale saved work",
  "route not loading",
  "health warning",
  "data integrity warning"
].forEach(text => assert(manual.toLowerCase().includes(text), `break/fix guide covers: ${text}`));

assert(manual.includes("SOC 2 Readiness"), "SOC 2 Readiness language is used");
assert(!/SOC 2 compliant|SOC 2 certified/i.test(manual), "forbidden SOC 2 compliance/certification language is not used in manual");

assert(!/onclick="[^"]*(send|publish|activate|partnerJourney|restoreBackup|runPublishingWorker)/i.test(manual), "manual has no enabled external action controls");
assert(!/\/api\/(publishing|channels|partner-journey|backups\/restore)/i.test(manual), "manual has no external action API calls");
assert(!/child_process|execCommand|spawn\(/i.test(manual), "manual does not execute shell commands");

assert(cockpit.includes("Manual status"), "cockpit card shows manual status");
assert(cockpit.includes("Last updated"), "cockpit card shows last updated");
assert(cockpit.includes("location.hash='operator-manual'"), "cockpit card opens Guide");

assert((pkg.scripts.check || "").includes("scripts/test-operator-manual.mjs"), "operator manual test is included in npm run verify");
assert((pkg.scripts.test || "").includes("scripts/test-operator-manual.mjs"), "operator manual test is included in npm test");

console.log("Operator manual checks passed.");
