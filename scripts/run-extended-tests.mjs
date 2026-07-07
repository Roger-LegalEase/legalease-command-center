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

// Quarantine: tests that already failed on main b1c92dd when this runner was introduced
// (2026-07-03). All are STALE UI ASSERTIONS — they assert page structure/copy that the app has
// since moved past; none are environment-dependent. Fix the assertion, then delete the entry.
const KNOWN_FAILING = {
  "test-button-action-feedback.mjs": "stale: asserts removed runAction helper",
  "test-calendar-readonly-safety.mjs": "stale: calendar scope assertion pre-dates current Google wiring",
  "test-connector-readiness.mjs": "stale: asserts old Connected Accounts copy",
  "test-every-visible-button-works.mjs": "stale: asserts removed socialPageHtml block",
  "test-founder-language-and-clutter.mjs": "stale: asserts removed socialContentCardHtml block",
  "test-generated-client-script-syntax.mjs": "stale: inline-script extraction pre-dates current shell",
  "test-linkedin-approval-queue.mjs": "stale: asserts old Production page structure",
  "test-linkedin-connect-button.mjs": "stale: asserts old Connected Accounts copy",
  "test-linkedin-readiness.mjs": "stale: asserts old Production readiness copy",
  "test-privacy-route.mjs": "stale: asserts old /privacy copy",
  "test-production-hardening-health.mjs": "stale: expects ownerAuthEnabled default that changed",
  "test-proof-workspace.mjs": "stale: asserts old Proof workspace copy",
  "test-queue-workspace.mjs": "stale: asserts old Queue helper copy",
  "test-rcap-page-usability.mjs": "stale: asserts old #rcap alias behavior",
  "test-social-workspace.mjs": "stale: asserts removed socialPageHtml block",
  "test-sources-social-calendar-import.mjs": "stale: asserts old six-surface top nav",
  "test-today-email-followups.mjs": "stale: asserts old Proof evidence types",
  "test-twitter-x-approval-queue.mjs": "stale: asserts old Production page structure",
  "test-twitter-x-readiness.mjs": "stale: asserts old Production readiness copy",
  "test-ux-emergency-repair.mjs": "stale: asserts old Metrics/KPIs copy"
};

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
for (const file of toRun) {
  const result = spawnSync(process.execPath, [join("scripts", file)], { encoding: "utf8", timeout: 120000 });
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
