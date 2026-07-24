#!/usr/bin/env node
// Pre-commit PII gate — refuses a commit when staged content would leak consumer data.
// Wired from .githooks/pre-commit (activate with: npm run hooks:install).
//
// Blocks, in order:
//   1. Any staged path whose basename matches suppression_*.csv, anywhere in the tree.
//   2. Any PII finding from the existing security-scan tooling over ALL staged text files
//      (emails, phone numbers, sensitive export filenames) — `--staged --pii-only`.
//   3. Email addresses inside staged .csv and .xlsx/.xls files specifically: staged blobs are
//      materialized (xlsx text is extracted from the zip's XML parts) and re-scanned through
//      security-scan via SECURITY_SCAN_FILES, so binary workbooks cannot slip past the
//      text-only staged scan.
//
// Exit code is non-zero on any finding; nothing is written outside a temp directory.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: options.encoding || "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...options });
}

const staged = run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], { encoding: "buffer" })
  .toString("utf8").split("\0").filter(Boolean);

if (!staged.length) process.exit(0);

let failed = false;

// 1. Suppression exports are never committed, from any directory.
const suppressionNamed = staged.filter((file) => /^suppression_.*\.csv$/i.test(path.basename(file)));
for (const file of suppressionNamed) {
  console.error(`pre-commit PII gate: ${file} matches suppression_*.csv — suppression exports are never committed.`);
  failed = true;
}

// 2. Existing tooling over every staged text file.
try {
  run("node", ["scripts/security-scan.mjs", "--staged", "--pii-only"], { env: { ...process.env, SECURITY_SCAN_ROOT: root }, stdio: ["ignore", "inherit", "inherit"] });
} catch {
  console.error("pre-commit PII gate: security-scan found PII in staged files (see findings above).");
  failed = true;
}

// 3. Staged .csv / .xlsx content, including text extracted from workbook XML.
const tabular = staged.filter((file) => /\.(csv|xlsx?)$/i.test(file));
if (tabular.length) {
  const extractDir = mkdtempSync(path.join(tmpdir(), "pii-gate-"));
  const extracted = [];
  try {
    for (const [index, file] of tabular.entries()) {
      const blob = run("git", ["show", `:${file}`], { encoding: "buffer" });
      if (/\.xlsx?$/i.test(file)) {
        const workbookPath = path.join(extractDir, `${index}-workbook`);
        writeFileSync(workbookPath, blob);
        let text = "";
        try {
          text = run("unzip", ["-p", workbookPath, "xl/sharedStrings.xml", "xl/worksheets/*.xml"]);
        } catch (error) {
          text = String(error.stdout || "");
          if (!text) {
            console.error(`pre-commit PII gate: could not extract text from ${file} — refusing to commit an unreadable workbook.`);
            failed = true;
            continue;
          }
        }
        const textPath = path.join(extractDir, `${index}-${path.basename(file)}.extracted.txt`);
        writeFileSync(textPath, text);
        extracted.push(textPath);
      } else {
        const csvPath = path.join(extractDir, `${index}-${path.basename(file)}`);
        writeFileSync(csvPath, blob);
        extracted.push(csvPath);
      }
    }
    if (extracted.length) {
      try {
        run("node", ["scripts/security-scan.mjs", "--pii-only"], {
          env: { ...process.env, SECURITY_SCAN_ROOT: root, SECURITY_SCAN_FILES: extracted.join(path.delimiter) },
          stdio: ["ignore", "inherit", "inherit"]
        });
      } catch {
        console.error("pre-commit PII gate: staged .csv/.xlsx content contains PII (see findings above).");
        failed = true;
      }
    }
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

if (failed) {
  console.error("pre-commit PII gate: commit blocked. Move consumer data under data/private/ (gitignored) instead of committing it.");
  process.exit(1);
}
