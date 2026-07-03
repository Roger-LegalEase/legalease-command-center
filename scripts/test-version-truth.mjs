// Deploy/version truth tests (second trust PR, audit §15 item 1). Proves:
//  1. Commit normalization + prefix matching (short env hashes vs full API SHAs).
//  2. The verdict is honest on every path: current only with proof; BEHIND MAIN is loud;
//     unknown running commit / GitHub unreachable degrade to warnings, never to "current".
//  3. buildVersionDrift drives the injected GET-only fetcher correctly (head lookup, compare
//     only when hashes differ) and never throws on fetch failure.
//  4. The drift cache serves within TTL and rebuilds after expiry.

import assert from "node:assert";
import {
  DEFAULT_REPO_SLUG,
  versionTruthRepoSlug,
  normalizeCommitHash,
  shortCommit,
  commitsMatch,
  versionTruthVerdict,
  buildVersionDrift,
  createVersionDriftCache
} from "./version-truth.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const MAIN_SHA = "b1c92ddb1afc4d8d6b19042edbbe2d2c7c88d3fe";
const OLD_SHA = "c02db48607f4181cb363c64e0b489781c53b9f87";

// ---- 1. Normalization + matching ------------------------------------------------------------
{
  assert.equal(normalizeCommitHash("  B1C92DD  "), "b1c92dd");
  assert.equal(normalizeCommitHash("not-a-sha"), "");
  assert.equal(normalizeCommitHash("abc123"), "", "6 chars is too short to trust");
  assert.equal(shortCommit(MAIN_SHA), "b1c92dd");
  ok("commit hashes normalize (lowercase, length-guarded)");

  assert.equal(commitsMatch("b1c92dd", MAIN_SHA), true, "short env hash matches full SHA");
  assert.equal(commitsMatch(MAIN_SHA, MAIN_SHA), true);
  assert.equal(commitsMatch(OLD_SHA, MAIN_SHA), false);
  assert.equal(commitsMatch("", MAIN_SHA), false);
  ok("prefix matching works for short-vs-full hashes and rejects mismatches");

  assert.equal(versionTruthRepoSlug({}), DEFAULT_REPO_SLUG);
  assert.equal(versionTruthRepoSlug({ GITHUB_REPO_SLUG: "acme/other" }), "acme/other");
  assert.equal(versionTruthRepoSlug({ GITHUB_REPO_SLUG: "not a slug!!" }), DEFAULT_REPO_SLUG);
  ok("repo slug env override validates or falls back");
}

// ---- 2. Verdicts are honest on every path ---------------------------------------------------
{
  const current = versionTruthVerdict({ runningCommit: MAIN_SHA, mainCommit: MAIN_SHA, compareStatus: "identical" });
  assert.equal(current.status, "current");
  assert.equal(current.severity, "ok");
  ok("identical commits -> current");

  const behind = versionTruthVerdict({ runningCommit: OLD_SHA, mainCommit: MAIN_SHA, compareStatus: "ahead", aheadBy: 3 });
  assert.equal(behind.status, "behind_main");
  assert.equal(behind.severity, "alert");
  assert.ok(/BEHIND MAIN by 3/.test(behind.message), "message names the drift count");
  assert.ok(/promote/i.test(behind.message), "message says what to do (promote)");
  ok("main ahead of running commit -> loud BEHIND MAIN alert with promote instruction");

  const unknownRunning = versionTruthVerdict({ runningCommit: "unknown", mainCommit: MAIN_SHA });
  assert.equal(unknownRunning.status, "unknown_running_commit");
  assert.equal(unknownRunning.severity, "warn");
  ok("unknown running commit -> warning, never a claim of current");

  const unreachable = versionTruthVerdict({ runningCommit: OLD_SHA, mainCommit: "", error: "GitHub 503" });
  assert.equal(unreachable.status, "unverified");
  assert.ok(/UNVERIFIED/.test(unreachable.message));
  ok("GitHub unreachable -> UNVERIFIED, not a comforting answer");

  const diverged = versionTruthVerdict({ runningCommit: OLD_SHA, mainCommit: MAIN_SHA, compareStatus: "diverged", aheadBy: 2, behindBy: 1 });
  assert.equal(diverged.status, "diverged");
  assert.equal(diverged.severity, "alert");
  const aheadOfMain = versionTruthVerdict({ runningCommit: OLD_SHA, mainCommit: MAIN_SHA, compareStatus: "behind" });
  assert.equal(aheadOfMain.status, "ahead_of_main");
  ok("diverged and ahead-of-main verdicts classify correctly");
}

// ---- 3. buildVersionDrift drives the injected fetcher ---------------------------------------
function fakeFetcher(routes) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    for (const [pattern, body] of routes) {
      if (url.includes(pattern)) return { ok: true, status: 200, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetcher, calls };
}

{
  const { fetcher, calls } = fakeFetcher([
    ["/commits/main", { sha: MAIN_SHA, commit: { committer: { date: "2026-07-03T10:00:00Z" } } }]
  ]);
  const drift = await buildVersionDrift({ env: {}, fetcher, runningCommit: MAIN_SHA, deployedAt: "2026-07-03T11:00:00Z", now: () => "2026-07-03T12:00:00Z" });
  assert.equal(drift.status, "current");
  assert.equal(drift.mainCommitShort, "b1c92dd");
  assert.equal(drift.checkedAt, "2026-07-03T12:00:00Z");
  assert.equal(calls.length, 1, "no compare call when hashes already match");
  ok("running == main: one head lookup, verdict current, no compare call");
}

{
  const { fetcher, calls } = fakeFetcher([
    ["/commits/main", { sha: MAIN_SHA, commit: { committer: { date: "2026-07-03T10:00:00Z" } } }],
    [`/compare/${OLD_SHA}...main`, { status: "ahead", ahead_by: 5, behind_by: 0 }]
  ]);
  const drift = await buildVersionDrift({ env: {}, fetcher, runningCommit: OLD_SHA, now: () => "t" });
  assert.equal(drift.status, "behind_main");
  assert.equal(drift.aheadBy, 5);
  assert.equal(calls.length, 2, "head lookup + compare");
  ok("running != main: compare call runs and BEHIND MAIN verdict carries the count");
}

{
  const failing = async () => { throw new Error("network down"); };
  const drift = await buildVersionDrift({ env: {}, fetcher: failing, runningCommit: OLD_SHA, now: () => "t" });
  assert.equal(drift.status, "unverified");
  assert.equal(drift.error, "network down");
  ok("fetch failure never throws — honest unverified payload");

  const noFetch = await buildVersionDrift({ env: {}, fetcher: null, runningCommit: OLD_SHA, now: () => "t" });
  assert.equal(noFetch.status, "unverified");
  ok("missing fetch implementation degrades the same way");
}

// ---- 4. Cache -------------------------------------------------------------------------------
{
  let clock = 0;
  let builds = 0;
  const cache = createVersionDriftCache({ ttlMs: 1000, nowMs: () => clock });
  const build = async () => ({ status: "current", build: ++builds });
  const first = await cache.get(build);
  assert.equal(first.cached, false);
  clock = 500;
  const second = await cache.get(build);
  assert.deepEqual({ cached: second.cached, build: second.build }, { cached: true, build: 1 });
  clock = 1500;
  const third = await cache.get(build);
  assert.deepEqual({ cached: third.cached, build: third.build }, { cached: false, build: 2 });
  ok("drift cache serves within TTL and rebuilds after expiry");
}

console.log(`\ntest-version-truth: ${passed} checks passed`);
