// Deploy/version truth — is production running the latest main commit, or a stale promote?
//
// Second trust PR (docs/command-center-ground-truth-audit.md §15 item 1). The Render service
// deploys manually (autoDeploy off), and a finished BUILD is not a PROMOTED deploy — prod sat
// on c02db48 for days while main moved on, and nothing on screen said so. This module compares
// the running commit (already exposed at /api/version) against GitHub main and produces a
// plain-English verdict for the UI, so promote-vs-build drift is visible instead of guessed.
//
// This module never sends anything, never flips a gate, and performs exactly ONE kind of
// external contact: an injected, GET-only fetch to the public GitHub REST API (the repo is
// public; no token required or read). Every failure path degrades to an honest "unknown"
// verdict — it never claims "current" without proof.

const clean = (v = "") => String(v ?? "").trim();

export const DEFAULT_REPO_SLUG = "Roger-LegalEase/legalease-command-center";
export const DEFAULT_MAIN_BRANCH = "main";

export function versionTruthRepoSlug(env = process.env) {
  const value = clean((env || {}).GITHUB_REPO_SLUG);
  return /^[\w.-]+\/[\w.-]+$/.test(value) ? value : DEFAULT_REPO_SLUG;
}

export function normalizeCommitHash(value = "") {
  const hash = clean(value).toLowerCase();
  return /^[a-f0-9]{7,40}$/.test(hash) ? hash : "";
}

export function shortCommit(value = "") {
  return normalizeCommitHash(value).slice(0, 7);
}

// Prefix equality on the shorter of the two hashes (min 7 chars) — env vars sometimes carry
// short hashes while the API returns full 40-char SHAs.
export function commitsMatch(a = "", b = "") {
  const left = normalizeCommitHash(a);
  const right = normalizeCommitHash(b);
  if (!left || !right) return false;
  const len = Math.min(left.length, right.length);
  return len >= 7 && left.slice(0, len) === right.slice(0, len);
}

// Pure verdict from a GitHub compare result (base = running commit, head = main).
//   compare.status: "identical" | "ahead" | "behind" | "diverged"
//   compare.ahead_by = commits main has that the running commit does not = how far prod is behind.
export function versionTruthVerdict({ runningCommit = "", mainCommit = "", compareStatus = "", aheadBy = 0, behindBy = 0, error = "" } = {}) {
  const running = normalizeCommitHash(runningCommit);
  const main = normalizeCommitHash(mainCommit);
  if (!running) {
    return {
      status: "unknown_running_commit",
      severity: "warn",
      message: main
        ? `The running commit is unknown (no RENDER_GIT_COMMIT), so drift against main (${shortCommit(main)}) cannot be verified.`
        : "The running commit is unknown (no RENDER_GIT_COMMIT), so drift against main cannot be verified."
    };
  }
  if (error || !main) {
    return {
      status: "unverified",
      severity: "warn",
      message: `Running ${shortCommit(running)}; GitHub main could not be checked${error ? ` (${error})` : ""} — current-vs-stale is UNVERIFIED, not confirmed.`
    };
  }
  if (commitsMatch(running, main) || compareStatus === "identical") {
    return {
      status: "current",
      severity: "ok",
      message: `Production is on the latest main commit (${shortCommit(main)}).`
    };
  }
  if (compareStatus === "ahead") {
    // base(running)...head(main): main is ahead -> prod is BEHIND main. The classic
    // merged-but-never-promoted failure. This is the warning this module exists for.
    const count = Number(aheadBy) || 0;
    return {
      status: "behind_main",
      severity: "alert",
      message: `PRODUCTION IS BEHIND MAIN by ${count || "an unknown number of"} commit(s): running ${shortCommit(running)}, main is at ${shortCommit(main)}. A merge landed that was never promoted on Render (Manual Deploy → promote).`
    };
  }
  if (compareStatus === "behind") {
    return {
      status: "ahead_of_main",
      severity: "warn",
      message: `Production (${shortCommit(running)}) is AHEAD of main (${shortCommit(main)}) — it runs commits main does not have. Check what was deployed.`
    };
  }
  if (compareStatus === "diverged") {
    return {
      status: "diverged",
      severity: "alert",
      message: `Production (${shortCommit(running)}) and main (${shortCommit(main)}) have DIVERGED — prod runs commits not on main AND is missing main commits.`
    };
  }
  return {
    status: "unverified",
    severity: "warn",
    message: `Running ${shortCommit(running)}; main is at ${shortCommit(main)} but their relationship could not be determined — treat as UNVERIFIED.`
  };
}

async function githubJson(fetcher, url) {
  const response = await fetcher(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "legalease-command-center-version-truth"
    }
  });
  if (!response || !response.ok) {
    throw new Error(`GitHub ${response ? response.status : "no-response"} for ${url.split("/repos/")[1] || url}`);
  }
  return response.json();
}

// Build the full drift payload. `fetcher` is injected (GET-only); pass globalThis.fetch in prod
// and a stub in tests. Never throws — every failure lands in an honest "unverified" verdict.
export async function buildVersionDrift({ env = process.env, fetcher = globalThis.fetch, runningCommit = "", deployedAt = "", now = () => new Date().toISOString() } = {}) {
  const repo = versionTruthRepoSlug(env);
  const running = normalizeCommitHash(runningCommit);
  let mainCommit = "";
  let mainCommitAt = "";
  let compareStatus = "";
  let aheadBy = 0;
  let behindBy = 0;
  let error = "";
  try {
    if (typeof fetcher !== "function") throw new Error("no fetch available");
    const head = await githubJson(fetcher, `https://api.github.com/repos/${repo}/commits/${DEFAULT_MAIN_BRANCH}`);
    mainCommit = normalizeCommitHash(head?.sha);
    mainCommitAt = clean(head?.commit?.committer?.date || head?.commit?.author?.date);
    if (running && mainCommit && !commitsMatch(running, mainCommit)) {
      const compared = await githubJson(fetcher, `https://api.github.com/repos/${repo}/compare/${running}...${DEFAULT_MAIN_BRANCH}`);
      compareStatus = clean(compared?.status).toLowerCase();
      aheadBy = Number(compared?.ahead_by) || 0;
      behindBy = Number(compared?.behind_by) || 0;
    } else if (running && mainCommit) {
      compareStatus = "identical";
    }
  } catch (err) {
    error = clean(err?.message) || "github_unreachable";
  }
  const verdict = versionTruthVerdict({ runningCommit: running, mainCommit, compareStatus, aheadBy, behindBy, error });
  return {
    repo,
    branch: DEFAULT_MAIN_BRANCH,
    runningCommit: running || "unknown",
    runningCommitShort: shortCommit(running) || "unknown",
    deployedAt: clean(deployedAt) || "unknown",
    mainCommit: mainCommit || "unknown",
    mainCommitShort: shortCommit(mainCommit) || "unknown",
    mainCommitAt: mainCommitAt || "unknown",
    compareStatus: compareStatus || "unknown",
    aheadBy,
    behindBy,
    ...verdict,
    error: error || "",
    checkedAt: now()
  };
}

// Small in-memory cache so a dashboard full of badges does not hammer the unauthenticated
// GitHub API (60 req/hr/IP). One entry; TTL default 5 minutes; injectable clock for tests.
export function createVersionDriftCache({ ttlMs = 5 * 60 * 1000, nowMs = () => Date.now() } = {}) {
  let cached = null;
  let cachedAtMs = 0;
  return {
    async get(build) {
      const at = nowMs();
      if (cached && at - cachedAtMs < ttlMs) return { ...cached, cached: true };
      cached = await build();
      cachedAtMs = at;
      return { ...cached, cached: false };
    },
    clear() { cached = null; cachedAtMs = 0; }
  };
}
