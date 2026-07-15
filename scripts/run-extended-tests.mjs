#!/usr/bin/env node
// Extended test runner — every scripts/test-*.mjs NOT in the main `npm test` chain runs here.
//
// Registration hygiene (ground-truth audit §15 item 3): 65 test files had rotted outside the
// chain, silently — 5 of them were failing against real branch changes and nothing noticed.
// This runner closes that hole by DISCOVERY, not by list: any new test-*.mjs file is picked up
// automatically. A test can only be excluded by an explicit entry in KNOWN_FAILING below, with
// a reason — silent orphaning is no longer possible.
//
//   npm run test:extended             # run all discovered extended tests
//   npm run test:extended -- --all    # also run the KNOWN_FAILING quarantine (see what still fails)
//
// Exit code is non-zero if any non-quarantined test fails.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Security-critical behavior is never quarantined. Stale assertions must be repaired or removed.
const KNOWN_FAILING = {};

const runQuarantined = process.argv.includes("--all");
const scriptsDir = join(process.cwd(), "scripts");
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const mainChain = new Set((pkg.scripts.test.match(/scripts\/(test-[a-z0-9-]+\.mjs)/g) || [])
  .map((m) => m.replace("scripts/", "")));

const discovered = readdirSync(scriptsDir)
  .filter((f) => f.startsWith("test-") && f.endsWith(".mjs") && !mainChain.has(f))
  .sort();

const toRun = discovered.filter((f) => runQuarantined || !KNOWN_FAILING[f]);
const quarantined = discovered.filter((f) => KNOWN_FAILING[f]);

console.log(`Extended tests: ${toRun.length} to run, ${quarantined.length} quarantined (${mainChain.size} covered by npm test).`);
if (!runQuarantined && quarantined.length) {
  console.log("Quarantined (fix the assertion, then remove from KNOWN_FAILING):");
  for (const f of quarantined) console.log(`  - ${f}: ${KNOWN_FAILING[f]}`);
}

const failures = [];
const testEnv = {
  PATH:process.env.PATH, HOME:process.env.HOME, TMPDIR:process.env.TMPDIR || "/tmp",
  NODE_ENV:"test", COMMAND_CENTER_TEST_MODE:"true", SKIP_ENV_LOCAL_FILE:"true",
  STORAGE_BACKEND:"json", LOCAL_DEMO_MODE:"true", COMMAND_CENTER_ALLOW_JSON:"true",
  ENABLE_LIVE_LINKEDIN_POSTING:"false", ENABLE_LIVE_FACEBOOK_POSTING:"false", ENABLE_LIVE_INSTAGRAM_POSTING:"false",
  ENABLE_LIVE_X_POSTING:"false", ENABLE_LIVE_THREADS_POSTING:"false", ENABLE_LIVE_TIKTOK_POSTING:"false",
  REACTIVATION_LIVE_SEND:"false", OUTREACH_LIVE_SEND:"false", ALERT_EMAIL_LIVE_SEND:"false",
  PROSPECT_LIVE_DISCOVERY:"false", ALLOW_LOCAL_IMAGE_FALLBACK:"false",
  SENDGRID_WEBHOOK_ENABLED:"false", PRODUCT_EVENT_WEBHOOK_ENABLED:"false"
};
for (const file of toRun) {
  const result = spawnSync(process.execPath, [join("scripts", file)], { encoding: "utf8", timeout: 120000, env:testEnv });
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${file}`);
  if (!ok) {
    failures.push(file);
    const tail = `${result.stdout || ""}\n${result.stderr || ""}`.trim().split("\n").slice(-8).join("\n");
    console.log(tail.replace(/^/gm, "     "));
  }
}

if (failures.length) {
  console.error(`\n${failures.length} extended test(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nAll ${toRun.length} extended tests passed.`);
