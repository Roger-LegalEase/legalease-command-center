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
// Last re-pinned 2026-07-28 (the design system rides the shell): the flag-OFF shell changed on
// purpose this time, in three reviewed ways, all of them inside the legacy pages themselves:
//   * two layout repairs from the 67-page sweep — `overflow-wrap:anywhere` on .kpi-detail/.muted
//     so a slashed label stops overrunning its grid cell, and .ops-row switching from a hard
//     repeat(4) to implicit columns so Access Reviews stops wrapping onto a second line;
//   * founder language: "RCAP" became "the partner program" in the Production Activation copy;
//   * one intake sentence reworded ("internal intake lane" -> "internal place to capture").
// No flagged behaviour leaked: the diff of the hashed slice is those edits and nothing else, and
// test-founder-os-base-layer.mjs still asserts flag-off emits no .le-os root. +357 bytes.
export const LEGACY_SHELL_HASH = "051dec9df058457d226009ce8f37780b2d2a53048d513619d90fd466bd67c379";
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
