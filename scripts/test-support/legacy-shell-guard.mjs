// The one place the legacy flag-off shell hash is pinned.
//
// What this guards: with the Founder OS flags OFF, the legacy shell must stay byte-for-byte
// unchanged, because that is the rollback path. If a flagged change leaks into the flag-off
// output, rolling a flag back no longer restores the previous UI.
//
// Why it lives here: the hash was pinned as a literal in ELEVEN suites, so any edit to any
// inline page failed all eleven — discovered one 10-minute CI cycle at a time. It is one
// concern and it now has one owner. Re-pinning after a reviewed change is a single edit to
// LEGACY_SHELL_HASH below, and `npm run repin:shell` makes that edit for you.
//
// The guard's protection is unchanged: an unreviewed shell change still fails.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const LEGACY_SHELL_SOURCE_FILE = "scripts/preview-server.mjs";
const SHELL_START_MARKER = "function htmlShell()";
const SHELL_END_MARKER = "\nfunction renderLegacyApp()";

// Budget for the initial inline client payload. The authoritative live measurement is
// scripts/test-vnext-performance-contract.mjs; this static slice size is the cheap proxy the
// re-pin flow reports so a shell change shows its cost at the moment you re-pin it.
export const LEGACY_SHELL_BYTE_BUDGET = 1_650_000;

// ---------------------------------------------------------------------------------------------
// THE PINNED VALUE. Re-pin with: npm run repin:shell
// Last re-pinned 2026-07-26 (prospect bulk approval): the #prospects page swapped its
// metrics-only body for a container plus a loader for the LAZY prospect-workbench runtime,
// keeping bulk approval out of the initial client payload.
export const LEGACY_SHELL_HASH = "44345c9c3f8854821a6a40f76447ab132b8052963eb5c83ce082ee1f16a913db";
// ---------------------------------------------------------------------------------------------

export function readLegacyShellSource(file = LEGACY_SHELL_SOURCE_FILE) {
  const source = readFileSync(file, "utf8");
  const start = source.indexOf(SHELL_START_MARKER);
  if (start < 0) throw new Error(`legacy shell guard: "${SHELL_START_MARKER}" not found in ${file}.`);
  const end = source.indexOf(SHELL_END_MARKER, start);
  if (end < 0) throw new Error(`legacy shell guard: "${SHELL_END_MARKER.trim()}" not found after the shell in ${file}.`);
  return source.slice(start, end);
}

export function legacyShellHash(file = LEGACY_SHELL_SOURCE_FILE) {
  return createHash("sha256").update(readLegacyShellSource(file)).digest("hex");
}

export function legacyShellBytes(file = LEGACY_SHELL_SOURCE_FILE) {
  return Buffer.byteLength(readLegacyShellSource(file));
}

// Throws with a message that tells you what to do next, rather than two hex strings.
export function assertLegacyShellUnchanged({ file = LEGACY_SHELL_SOURCE_FILE } = {}) {
  const actual = legacyShellHash(file);
  if (actual === LEGACY_SHELL_HASH) return { ok: true, hash: actual, bytes: legacyShellBytes(file) };

  const bytes = legacyShellBytes(file);
  const overBudget = bytes > LEGACY_SHELL_BYTE_BUDGET;
  throw new Error([
    "",
    "The legacy flag-off shell changed.",
    "",
    `  expected hash : ${LEGACY_SHELL_HASH}`,
    `  actual hash   : ${actual}`,
    `  shell bytes   : ${bytes.toLocaleString()} against a ${LEGACY_SHELL_BYTE_BUDGET.toLocaleString()} budget` +
      (overBudget ? `  *** OVER BUDGET by ${(bytes - LEGACY_SHELL_BYTE_BUDGET).toLocaleString()} bytes ***` : ` (${(LEGACY_SHELL_BYTE_BUDGET - bytes).toLocaleString()} to spare)`),
    "",
    "This guard exists so a flagged change cannot leak into the flag-OFF output, which is the",
    "rollback path. If your change is intended and reviewed, re-pin it:",
    "",
    "  npm run repin:shell",
    "",
    "That rewrites one value in scripts/test-support/legacy-shell-guard.mjs. If you did NOT mean",
    "to change the shell, the diff in " + file + " is the thing to look at.",
    ""
  ].join("\n"));
}
