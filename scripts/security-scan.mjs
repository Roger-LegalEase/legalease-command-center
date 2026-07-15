import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectSecurityFindings } from "./security-scan-detectors.mjs";

const root = process.env.SECURITY_SCAN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const mode = args.has("--history") ? "history" : args.has("--staged") ? "staged" : "tracked";

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, { cwd: root, encoding: options.encoding || "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function fingerprint(value) { return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16); }
function textBlob(buffer) { return !buffer.subarray(0, 8192).includes(0); }

function trackedEntries() {
  if (process.env.SECURITY_SCAN_FILES) {
    return process.env.SECURITY_SCAN_FILES.split(path.delimiter).filter(Boolean).map((file) => ({ path:path.basename(file), read:() => readFileSync(file) }));
  }
  const names = mode === "staged"
    ? run("git", ["diff", "--cached", "--name-only", "-z"], { encoding:"buffer" })
    : run("git", ["ls-files", "-z"], { encoding:"buffer" });
  return names.toString("utf8").split("\0").filter(Boolean).map((path) => ({ path, read: () => {
    if (mode === "staged") return Buffer.from(run("git", ["show", `:${path}`]));
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
  if (!textBlob(body)) continue;
  const text = body.toString("utf8");
  const fileFingerprint = fingerprint(body);
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
