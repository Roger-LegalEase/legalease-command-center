import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildLaunchGateEnvironment, VNEXT_LAUNCH_GATE_BASE_SHA, VNEXT_LAUNCH_GATE_COMMANDS } from "./run-vnext-launch-gate.mjs";

const commandText = VNEXT_LAUNCH_GATE_COMMANDS.map((command) => command.join(" ")).join("\n");
for (const required of [
  "npm run check",
  "npm test",
  "node scripts/compare-extended-tests.mjs",
  "npm run test:browser",
  "npm run test:vnext-performance",
  "npm run test:vnext-accessibility",
  "npm run test:vnext-recovery",
  "npm run verify:vnext-production",
  "npm run test:security-hardening",
  "npm run secret:scan",
  "npm run pii:scan",
  "npm run migrations:validate",
  "npm run restore:drill",
  "npm audit --audit-level=high"
]) {
  assert.match(commandText, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const environment = buildLaunchGateEnvironment({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  SENDGRID_API_KEY: "must-not-inherit",
  SUPABASE_SERVICE_ROLE_KEY: "must-not-inherit",
  COMMAND_CENTER_UX_VNEXT: "true",
  OUTREACH_LIVE_SEND: "true",
  VNEXT_LAUNCH_GATE_HEAD_SHA: "e2aefe13263fe83c8ce9ed1b0b80de9fc1af51bc"
});
assert.equal(environment.SENDGRID_API_KEY, undefined);
assert.equal(environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(environment.COMMAND_CENTER_UX_VNEXT, "false");
assert.equal(environment.OUTREACH_LIVE_SEND, "false");
assert.equal(environment.SKIP_ENV_LOCAL_FILE, "1");
assert.equal(environment.EXTENDED_PARITY_EVENT_NAME, "pull_request");
assert.equal(environment.EXTENDED_PARITY_BASE_SHA, VNEXT_LAUNCH_GATE_BASE_SHA);
assert.equal(environment.EXTENDED_PARITY_HEAD_SHA, "e2aefe13263fe83c8ce9ed1b0b80de9fc1af51bc");
assert.match(environment.COMMAND_CENTER_DATA_PATH, /^\/tmp\/legalease-vnext-launch-gate-\d+\.json$/);

const comparator = readFileSync(path.resolve(import.meta.dirname, "compare-extended-tests.mjs"), "utf8");
for (const requiredGuard of ["Extended tests may not be quarantined", "Extended discovery count dropped", "Previously discovered extended tests disappeared"]) {
  assert.match(comparator, new RegExp(requiredGuard));
}

const report = readFileSync(path.resolve(import.meta.dirname, "../docs/ux-vnext/final-launch-gate.md"), "utf8");
for (const heading of ["Product", "Brand", "Social", "Outreach", "Partners", "Files", "Engineering", "Rollback", "Flag decision", "Known limitations"]) {
  assert.match(report, new RegExp(`^## ${heading}$`, "m"));
}
for (const phrase of [
  "five primary destinations",
  "no dead visible controls",
  "founder-facing language",
  "exact object links",
  "real persistence",
  "official white logo",
  "#F04800",
  "idempotent publishing",
  "idempotent sending",
  "suppression",
  "Investor Room",
  "high-severity"
]) {
  assert.match(report, new RegExp(phrase, "i"));
}

console.log("PASS vNext final launch-gate contract");
