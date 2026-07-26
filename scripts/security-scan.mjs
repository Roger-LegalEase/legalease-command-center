import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectSecurityFindings } from "./security-scan-detectors.mjs";
import { extractArchiveText, isArchiveDocumentPath, looksLikeZipArchive } from "./security-scan-archive.mjs";

const root = process.env.SECURITY_SCAN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const mode = args.has("--history")
  ? "history"
  : args.has("--branch-diff")
    ? "branch-diff"
    : args.has("--staged") ? "staged" : "tracked";

// branch-diff compares against a base ref so a pull request can be gated on just what it
// changed. Defaults to origin/main; CI must check out with enough history for the merge base
// to exist, or this mode has nothing to compare and says so rather than passing silently.
const branchDiffBase = process.env.SECURITY_SCAN_BASE || "origin/main";

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, { cwd: root, encoding: options.encoding || "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function fingerprint(value) { return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16); }
function textBlob(buffer) { return !buffer.subarray(0, 8192).includes(0); }

function trackedEntries() {
  if (process.env.SECURITY_SCAN_FILES) {
    return process.env.SECURITY_SCAN_FILES.split(path.delimiter).filter(Boolean).map((file) => ({ path:path.basename(file), read:() => readFileSync(file) }));
  }
  let names;
  if (mode === "staged") {
    names = run("git", ["diff", "--cached", "--name-only", "-z"], { encoding:"buffer" });
  } else if (mode === "branch-diff") {
    // A missing base is a broken gate, not a clean scan. Fail loudly.
    try { run("git", ["rev-parse", "--verify", branchDiffBase]); } catch {
      process.stdout.write(JSON.stringify({ mode, scanned:false, reason:`base ref ${branchDiffBase} is not available; fetch more history`, findings:[] }, null, 2) + "\n");
      process.exit(1);
    }
    names = run("git", ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${branchDiffBase}...HEAD`], { encoding:"buffer" });
  } else {
    names = run("git", ["ls-files", "-z"], { encoding:"buffer" });
  }
  return names.toString("utf8").split("\0").filter(Boolean).map((path) => ({ path, read: () => {
    // encoding:"buffer" matters. Reading a staged blob as utf8 and then wrapping it in a
    // Buffer mangles every non-text byte, which made a staged .xlsx unrecognisable as a ZIP
    // and its contents unscannable — the staged mode reported zero findings on a workbook
    // full of addresses.
    if (mode === "staged") return run("git", ["show", `:${path}`], { encoding:"buffer" });
    if (mode === "branch-diff") return run("git", ["show", `HEAD:${path}`], { encoding:"buffer" });
    return readFileSync(pathModuleJoin(root, path));
  } }));
}

function historyEntries() {
  const rows = run("git", ["rev-list", "--objects", "--all"]).split("\n").filter(Boolean);
  const seen = new Set();
  return rows.map((row) => {
    const space = row.indexOf(" ");
    const oid = space < 0 ? row : row.slice(0, space);
    const path = space < 0 ? `(object:${oid.slice(0, 12)})` : row.slice(space + 1);
    if (seen.has(oid)) return null;
    seen.add(oid);
    return { path, read: () => Buffer.from(run("git", ["cat-file", "-p", oid], { encoding:"buffer" })) };
  }).filter(Boolean);
}

function pathModuleJoin(base, relative) { return path.join(base, relative); }
let allowlist = [];
try { allowlist = JSON.parse(readFileSync(path.join(root, ".security-scan-allowlist.json"), "utf8")); } catch {}
const now = Date.now();
function allowed(finding) {
  return allowlist.some((item) => item.path === finding.path && item.category === finding.category && item.fileFingerprint === finding.fileFingerprint && Date.parse(item.expiresAt || 0) > now);
}

const findings = [];
for (const entry of mode === "history" ? historyEntries() : trackedEntries()) {
  let body;
  try { body = entry.read(); } catch { continue; }
  const fileFingerprint = fingerprint(body);
  // Text to scan, by kind of file:
  //   plain text            -> its own bytes, as before
  //   ZIP-container document -> the text inside it (an .xlsx is a ZIP; it used to be skipped)
  //   anything else binary   -> "" — no content to scan, but the FILENAME is still checked,
  //                             which is the hole this closes: `suppression-export.xlsx`
  //                             used to produce zero findings.
  const text = textBlob(body)
    ? body.toString("utf8")
    : isArchiveDocumentPath(entry.path) && looksLikeZipArchive(body) ? extractArchiveText(body) : "";
  const categories = detectSecurityFindings(text, entry.path);
  for (const [category, count] of categories) {
    if (args.has("--secrets-only") && category !== "high_confidence_secret") continue;
    if (args.has("--pii-only") && !["non_reserved_email", "phone_number", "sensitive_export_path"].includes(category)) continue;
    const finding = { path: entry.path, category, count, fileFingerprint };
    if (!allowed(finding)) findings.push(finding);
  }
}

findings.sort((a, b) => a.path.localeCompare(b.path) || a.category.localeCompare(b.category));
process.stdout.write(JSON.stringify({ mode, scanned: true, findings }, null, 2) + "\n");
if (findings.length) process.exitCode = 1;
