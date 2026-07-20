import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildLaunchGateEnvironment, VNEXT_LAUNCH_GATE_COMMANDS } from "./run-vnext-launch-gate.mjs";

const commandText = VNEXT_LAUNCH_GATE_COMMANDS.map((command) => command.join(" ")).join("\n");
for (const required of [
  "npm run check",
  "npm test",
  "npm run test:extended",
  "npm run test:browser",
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
  OUTREACH_LIVE_SEND: "true"
});
assert.equal(environment.SENDGRID_API_KEY, undefined);
assert.equal(environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(environment.COMMAND_CENTER_UX_VNEXT, "false");
assert.equal(environment.OUTREACH_LIVE_SEND, "false");
assert.equal(environment.SKIP_ENV_LOCAL_FILE, "1");

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
