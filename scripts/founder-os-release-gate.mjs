#!/usr/bin/env node
// Release gate for the Founder OS releases.
//
// Replaces the two-hour soak gate, on Roger's instruction of 2026-07-26. The wall-clock wait
// is gone; the protection it existed for is not. A release may merge only when all three of
// these hold at the moment of merging:
//
//   (a) all seven required checks are green on the release's OWN pull request;
//   (b) the PREVIOUS release's post-deploy verification workflow completed with conclusion
//       "success" — proof its deploy was actually verified, not merely attempted;
//   (c) a LIVE GET /api/version right now reports the previous release's commit with
//       supabaseState "connected" — proof that verified deploy is still the thing serving
//       production, so a release never lands on top of a rolled-back or drifted deploy.
//
// (b) and (c) are deliberately both required. (b) alone could pass for a deploy that has since
// been reverted; (c) alone could pass for a commit that is serving but whose verification
// failed or never ran. Together they say: the last release was verified, and it is still live.
//
// Read-only. The same public GETs the post-deploy verification uses, plus GitHub reads through
// the `gh` CLI. It changes nothing and needs no write credentials.
//
// Usage:
//   node scripts/founder-os-release-gate.mjs --pr <number> --previous-commit <sha> [--base-url <url>]
//
// Exit 0 = the gate is satisfied and the release may merge.
// Exit 1 = not satisfied, with every failing condition and every observed value.
// Exit 2 = the invocation itself was wrong (bad arguments, or `gh` unavailable).

import { execFileSync } from "node:child_process";

import { verifyOnce } from "./post-deploy-verify.mjs";

const DEFAULT_BASE_URL = "https://legalease-command-center-prod.onrender.com";

// The seven checks branch protection requires on main. Named here so the gate cannot silently
// accept a pull request whose protection set has been narrowed.
export const REQUIRED_CHECKS = Object.freeze([
  "check",
  "extended",
  "browser",
  "canonical",
  "security",
  "privacy-and-migrations",
  "Phase 8 / production verification"
]);

const POST_DEPLOY_WORKFLOW = "post-deploy-verification.yml";

function readArgument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

// (a) Every required check green on the release's own pull request.
function requiredCheckFailures(pullRequest) {
  let rows = [];
  try {
    rows = JSON.parse(gh(["pr", "checks", String(pullRequest), "--json", "name,bucket"]));
  } catch (error) {
    return { failures: [`could not read checks for pull request ${pullRequest}: ${String(error.message || error).split("\n")[0]}`], observed: [] };
  }
  const byName = new Map(rows.map((row) => [String(row.name), String(row.bucket)]));
  const failures = [];
  for (const name of REQUIRED_CHECKS) {
    const bucket = byName.get(name);
    if (bucket === undefined) failures.push(`required check "${name}" did not run on pull request ${pullRequest}`);
    else if (bucket !== "pass") failures.push(`required check "${name}" is "${bucket}", not pass`);
  }
  return { failures, observed: rows.map((row) => ({ name: row.name, bucket: row.bucket })) };
}

// (b) The previous release's post-deploy verification completed successfully.
function postDeployVerification(previousCommit) {
  let runs = [];
  try {
    runs = JSON.parse(gh([
      "run", "list", `--workflow=${POST_DEPLOY_WORKFLOW}`, "--limit", "40",
      "--json", "headSha,status,conclusion,databaseId,createdAt"
    ]));
  } catch (error) {
    return { failures: [`could not read ${POST_DEPLOY_WORKFLOW} runs: ${String(error.message || error).split("\n")[0]}`], observed: null };
  }
  const matching = runs.filter((run) => String(run.headSha) === previousCommit);
  if (!matching.length) {
    return {
      failures: [`no ${POST_DEPLOY_WORKFLOW} run exists for the previous release ${previousCommit.slice(0, 7)}`],
      observed: null
    };
  }
  // Newest first, so a re-run supersedes an earlier attempt.
  const latest = matching.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
  const failures = [];
  if (latest.status !== "completed") failures.push(`post-deploy verification for ${previousCommit.slice(0, 7)} is "${latest.status}", not completed`);
  else if (latest.conclusion !== "success") failures.push(`post-deploy verification for ${previousCommit.slice(0, 7)} concluded "${latest.conclusion}", not success`);
  return {
    failures,
    observed: { runId: latest.databaseId, status: latest.status, conclusion: latest.conclusion, createdAt: latest.createdAt }
  };
}

const pullRequest = readArgument("pr");
const previousCommit = readArgument("previous-commit");
const baseUrl = readArgument("base-url", DEFAULT_BASE_URL).replace(/\/+$/, "");

if (!/^\d+$/.test(pullRequest)) {
  console.error("A --pr <number> is required: the gate checks the release's own pull request.");
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(previousCommit)) {
  console.error("A full 40-character --previous-commit sha is required: the gate proves the PREVIOUS release is verified and still live.");
  process.exit(2);
}

const checks = requiredCheckFailures(pullRequest);
const verification = postDeployVerification(previousCommit);
// (c) The previous release is still the deployed commit, connected, and serving every route.
// verifyOnce is the same assertion set the post-deploy workflow runs, reused rather than restated.
const live = await verifyOnce(baseUrl, previousCommit);

const failures = [
  ...checks.failures.map((failure) => `[checks] ${failure}`),
  ...verification.failures.map((failure) => `[verification] ${failure}`),
  ...live.failures.map((failure) => `[live] ${failure}`)
];

console.log("RELEASE_GATE_EVIDENCE " + JSON.stringify({
  pullRequest: Number(pullRequest),
  previousCommit,
  requiredChecks: REQUIRED_CHECKS,
  checks: checks.observed,
  postDeployVerification: verification.observed,
  deployedCommit: live.deployedCommit,
  supabaseState: live.supabaseState,
  checkedAt: new Date().toISOString(),
  observed: live.observed
}));

if (failures.length) {
  console.error("\nRelease gate NOT satisfied:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Release gate satisfied: pull request ${pullRequest} is fully green, ` +
  `${previousCommit.slice(0, 7)} verified successfully and is still the deployed commit with Supabase connected.`
);
