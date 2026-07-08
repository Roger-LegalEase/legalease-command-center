// Prod commit gate — read-only preflight for production operations.
//
// Why this exists: old operation runbooks pinned ONE exact commit and hard-stopped whenever
// production moved ahead of the pin. That is what stopped the 2026-07-08 reactivation scheduling
// operation — prod ran a NEWER main-tip commit that CONTAINED the pinned safety commit as an
// ancestor, which is safe, not a regression. The corrected rule this module encodes:
//
//   PASS when production runs (a) exactly the required safety commit, (b) an explicitly
//   approved commit, or (c) a commit that CONTAINS the required safety commit as an ancestor
//   (prod is ahead — every pinned safety fix is present).
//   FAIL when production reports no commit, an unknown/unrelated commit, or a commit that does
//   NOT contain the required safety commit (prod is behind or diverged).
//
// evaluateCommitGate is pure (ancestor check injected) so tests need no git or network. The CLI
// is read-only: it GETs /api/version (public) and asks local git about ancestry; it never writes,
// deploys, or touches any gate.
//
// CLI:
//   node scripts/prod-commit-gate.mjs --required <sha> \
//     [--base-url https://legalease-command-center-prod.onrender.com] [--approved <sha>[,<sha>]]

import { execFileSync } from "node:child_process";

const DEFAULT_BASE_URL = "https://legalease-command-center-prod.onrender.com";

const cleanSha = (v = "") => String(v || "").trim().toLowerCase();

export function evaluateCommitGate({ prodCommit = "", requiredCommit = "", approvedCommits = [], isAncestor } = {}) {
  const prod = cleanSha(prodCommit);
  const required = cleanSha(requiredCommit);
  if (!prod || prod === "unknown") {
    return { ok: false, mode: "no_prod_commit", reason: "Production did not report a commit. STOP." };
  }
  if (!required) {
    return { ok: false, mode: "no_required_commit", reason: "No required safety commit was provided. STOP." };
  }
  if (prod === required) {
    return { ok: true, mode: "exact", reason: "Production runs the required safety commit exactly." };
  }
  const approved = (Array.isArray(approvedCommits) ? approvedCommits : []).map(cleanSha).filter(Boolean);
  if (approved.includes(prod)) {
    return { ok: true, mode: "approved", reason: "Production runs an explicitly approved commit." };
  }
  if (typeof isAncestor === "function") {
    let ahead = false;
    try { ahead = isAncestor(required, prod) === true; } catch { ahead = false; }
    if (ahead) {
      return {
        ok: true,
        mode: "ancestor",
        reason: `Production (${prod.slice(0, 7)}) is ahead of the required safety commit (${required.slice(0, 7)}) and contains it as an ancestor — every pinned safety fix is present.`
      };
    }
  }
  return {
    ok: false,
    mode: "unrelated_or_behind",
    reason: `Production commit ${prod.slice(0, 7)} is neither the required safety commit ${required.slice(0, 7)}, an approved commit, nor a descendant of it. STOP.`
  };
}

// Local-git ancestor check: is `maybeAncestor` an ancestor of `commit`? Read-only.
export function gitIsAncestor(maybeAncestor, commit, { cwd = process.cwd() } = {}) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", maybeAncestor, commit], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function argValue(argv, name) {
  const withEq = argv.find((a) => a.startsWith(`${name}=`));
  if (withEq) return withEq.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : "";
}

async function main() {
  const argv = process.argv.slice(2);
  const required = argValue(argv, "--required");
  const baseUrl = argValue(argv, "--base-url") || DEFAULT_BASE_URL;
  const approved = argValue(argv, "--approved").split(",").map((s) => s.trim()).filter(Boolean);
  if (!required) {
    console.error("Usage: node scripts/prod-commit-gate.mjs --required <sha> [--base-url <url>] [--approved <sha>[,<sha>]]");
    process.exit(2);
  }
  const resp = await fetch(`${baseUrl}/api/version`);
  if (!resp.ok) {
    console.error(`GATE FAIL: GET ${baseUrl}/api/version returned HTTP ${resp.status}. STOP.`);
    process.exit(1);
  }
  const version = await resp.json();
  const checks = [
    ["authProtected", version.authProtected === true],
    ["supabaseConnected", version.supabaseConnected === true]
  ];
  const gate = evaluateCommitGate({
    prodCommit: version.commit,
    requiredCommit: required,
    approvedCommits: approved,
    isAncestor: gitIsAncestor
  });
  for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  console.log(`${gate.ok ? "PASS" : "FAIL"}: commit gate (${gate.mode}) — ${gate.reason}`);
  console.log(`prod commit: ${version.commit}`);
  const allOk = gate.ok && checks.every(([, ok]) => ok);
  process.exit(allOk ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
