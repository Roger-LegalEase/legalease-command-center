#!/usr/bin/env node
// Re-pin the legacy flag-off shell hash after a REVIEWED change.  npm run repin:shell
//
// Rewrites exactly one value: LEGACY_SHELL_HASH in scripts/test-support/legacy-shell-guard.mjs.
// It changes no test file and no assertion. Run it only when you have looked at the shell diff
// and decided the change is intended — the guard's whole job is to make you look.

import { readFileSync, writeFileSync } from "node:fs";

import {
  LEGACY_SHELL_BYTE_BUDGET,
  LEGACY_SHELL_HASH,
  legacyShellBytes,
  legacyShellHash
} from "./test-support/legacy-shell-guard.mjs";

const GUARD_FILE = "scripts/test-support/legacy-shell-guard.mjs";
const actual = legacyShellHash();
const bytes = legacyShellBytes();

if (actual === LEGACY_SHELL_HASH) {
  console.log("The legacy shell already matches the pinned hash. Nothing to re-pin.");
  console.log(`  hash  ${actual}`);
  console.log(`  bytes ${bytes.toLocaleString()} / ${LEGACY_SHELL_BYTE_BUDGET.toLocaleString()} budget`);
  process.exit(0);
}

const source = readFileSync(GUARD_FILE, "utf8");
const pattern = new RegExp(`(export const LEGACY_SHELL_HASH = ")([a-f0-9]{64})(")`);
if (!pattern.test(source)) {
  console.error(`Could not find the pinned hash literal in ${GUARD_FILE}. Re-pin by hand.`);
  process.exit(1);
}
writeFileSync(GUARD_FILE, source.replace(pattern, `$1${actual}$3`));

const overBudget = bytes > LEGACY_SHELL_BYTE_BUDGET;
console.log(`Re-pinned the legacy shell hash in ${GUARD_FILE}.`);
console.log(`  was   ${LEGACY_SHELL_HASH}`);
console.log(`  now   ${actual}`);
console.log(`  bytes ${bytes.toLocaleString()} / ${LEGACY_SHELL_BYTE_BUDGET.toLocaleString()} budget` +
  (overBudget
    ? `  *** OVER BUDGET by ${(bytes - LEGACY_SHELL_BYTE_BUDGET).toLocaleString()} ***`
    : `  (${(LEGACY_SHELL_BYTE_BUDGET - bytes).toLocaleString()} to spare)`));
if (overBudget) {
  console.error("\nThe shell is over its byte budget. Re-pinning does not make that acceptable.");
  process.exit(1);
}
console.log("\nCommit that one-line change with the reviewed shell change it belongs to.");
