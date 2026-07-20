#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const VNEXT_LAUNCH_GATE_COMMANDS = Object.freeze([
  Object.freeze(["npm", "run", "check"]),
  Object.freeze(["npm", "test"]),
  Object.freeze(["npm", "run", "test:extended"]),
  Object.freeze(["npm", "run", "test:browser"]),
  Object.freeze(["npm", "run", "verify:vnext-production"]),
  Object.freeze(["npm", "run", "test:security-hardening"]),
  Object.freeze(["npm", "run", "secret:scan"]),
  Object.freeze(["npm", "run", "pii:scan"]),
  Object.freeze(["npm", "run", "migrations:validate"]),
  Object.freeze(["npm", "run", "restore:drill"]),
  Object.freeze(["npm", "audit", "--audit-level=high"])
]);

const FORCED_OFF = Object.freeze([
  "COMMAND_CENTER_UX_VNEXT",
  "COMMAND_CENTER_UX_VNEXT_SOCIAL",
  "COMMAND_CENTER_UX_VNEXT_OUTREACH",
  "COMMAND_CENTER_UX_VNEXT_FILES",
  "COMMAND_CENTER_UX_VNEXT_DISCOVERY",
  "ENABLE_LIVE_LINKEDIN_POSTING",
  "ENABLE_LIVE_FACEBOOK_POSTING",
  "ENABLE_LIVE_INSTAGRAM_POSTING",
  "ENABLE_LIVE_X_POSTING",
  "ENABLE_LIVE_THREADS_POSTING",
  "ENABLE_LIVE_TIKTOK_POSTING",
  "REACTIVATION_LIVE_SEND",
  "OUTREACH_LIVE_SEND",
  "ALERT_EMAIL_LIVE_SEND",
  "PROSPECT_LIVE_DISCOVERY"
]);

export function buildLaunchGateEnvironment(environment = process.env) {
  const safe = {
    PATH: environment.PATH,
    HOME: environment.HOME,
    TMPDIR: environment.TMPDIR || "/tmp",
    LANG: environment.LANG || "C.UTF-8",
    TERM: environment.TERM || "dumb",
    CI: environment.CI || "",
    NODE_ENV: "test",
    COMMAND_CENTER_TEST_MODE: "true",
    SKIP_ENV_LOCAL_FILE: "1",
    STORAGE_BACKEND: "json",
    LOCAL_DEMO_MODE: "true",
    COMMAND_CENTER_ALLOW_JSON: "true",
    SENDGRID_WEBHOOK_ENABLED: "false",
    PRODUCT_EVENT_WEBHOOK_ENABLED: "false",
    ALLOW_LOCAL_IMAGE_FALLBACK: "false",
    npm_config_userconfig: "/dev/null"
  };
  for (const key of FORCED_OFF) safe[key] = "false";
  return safe;
}

function runCommand(command, environment) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit"
    });
    child.on("error", (error) => resolve({
      command: command.join(" "),
      passed: false,
      exitCode: null,
      durationMs: Date.now() - startedAt,
      error: error.message
    }));
    child.on("exit", (code, signal) => resolve({
      command: command.join(" "),
      passed: code === 0,
      exitCode: code,
      signal: signal || "",
      durationMs: Date.now() - startedAt
    }));
  });
}

export async function runVNextLaunchGate() {
  const startedAt = new Date().toISOString();
  const environment = buildLaunchGateEnvironment();
  const results = [];
  for (const command of VNEXT_LAUNCH_GATE_COMMANDS) {
    console.log(`\nLAUNCH GATE: ${command.join(" ")}`);
    results.push(await runCommand(command, environment));
  }

  const evidence = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    passed: results.every((result) => result.passed),
    credentialsInherited: false,
    featureFlagsDefaultedOn: false,
    externalActionsEnabled: false,
    results
  };
  const evidencePath = path.resolve(environment.TMPDIR, "legalease-vnext-launch-gate.json");
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`\nLAUNCH GATE RESULT: ${evidence.passed ? "PASS" : "FAIL"}`);
  console.log(`Evidence: ${evidencePath}`);
  if (!evidence.passed) process.exitCode = 1;
  return evidence;
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryUrl === import.meta.url) {
  await runVNextLaunchGate();
}
