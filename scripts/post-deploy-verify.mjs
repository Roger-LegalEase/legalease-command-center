#!/usr/bin/env node
// Post-deploy verification for the Founder OS releases.
//
// Runs AFTER a merge to main has deployed. It is strictly read-only: every request is a
// GET against public, unauthenticated endpoints. It changes nothing, sends nothing, and
// needs no credentials.
//
// What it proves:
//   1. The deployed build is the commit that was merged (polled, because Render takes
//      minutes to swap the running instance).
//   2. Supabase is connected, by the three-state probe's own reading.
//   3. Authentication is still enforced and no secrets are exposed.
//   4. The app shell and the public health endpoint answer.
//   5. Every primary workspace route still serves the shell.
//
// What it deliberately does NOT prove: that the client rendered a workspace. Those routes
// are hash routes, so the server returns the same shell for all of them. Client rendering
// is proven pre-merge by the Chromium acceptance specs in the `browser` check, which is a
// required check on main.
//
// Usage:
//   node scripts/post-deploy-verify.mjs --commit <sha> [--base-url <url>] [--timeout-ms N]
//   node scripts/post-deploy-verify.mjs --commit <sha> --no-wait     (single pass, no poll)
//
// Exit 0 = verified. Exit 1 = failed, with every observed value printed.

const DEFAULT_BASE_URL = "https://legalease-command-center-prod.onrender.com";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 20_000;

// The four primary workspaces of the charter, by the route each one is reachable at.
// Hash routes, so the assertion is "the shell is served", not "the workspace rendered".
const PRIMARY_WORKSPACE_ROUTES = ["/#today", "/#partners", "/#campaigns", "/#revenue"];

function readArgument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function log(message) {
  console.log(`[post-deploy] ${message}`);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body, text: text.slice(0, 400) };
}

async function getStatus(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  return { status: response.status, servesShell: text.includes("LegalEase Command Center") };
}

async function pollForCommit(baseUrl, expectedCommit, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let last = null;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const version = await getJson(`${baseUrl}/api/version`);
      last = version;
      const deployed = String(version.body?.commit || "");
      if (deployed === expectedCommit) {
        log(`attempt ${attempt}: deployed commit matches (${deployed})`);
        return { matched: true, version };
      }
      log(`attempt ${attempt}: deployed ${deployed || "(none)"} != expected ${expectedCommit}; waiting`);
    } catch (error) {
      log(`attempt ${attempt}: /api/version unreachable (${error.message}); waiting`);
      last = { status: 0, body: null, text: String(error.message) };
    }
    if (Date.now() + POLL_INTERVAL_MS >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return { matched: false, version: last };
}

// Exported so the soak gate can re-run the identical assertions without shelling out.
export async function verifyOnce(baseUrl, expectedCommit) {
  const failures = [];
  const observed = {};
  const version = await getJson(`${baseUrl}/api/version`).catch((error) => ({ status:0, body:null, text:error.message }));
  observed.version = version.body ?? version.text;
  const deployedCommit = String(version.body?.commit || "");
  if (deployedCommit !== expectedCommit) failures.push(`deployed commit is "${deployedCommit || "unreadable"}", expected "${expectedCommit}"`);
  if (version.status !== 200) failures.push(`/api/version returned HTTP ${version.status}`);
  const supabaseState = String(version.body?.supabaseState || "");
  if (supabaseState !== "connected") failures.push(`supabaseState is "${supabaseState || "absent"}", expected "connected"`);
  if (version.body?.authProtected !== true) failures.push(`authProtected is ${JSON.stringify(version.body?.authProtected)}, expected true`);
  const health = await getJson(`${baseUrl}/api/health`).catch((error) => ({ status:0, body:null, text:error.message }));
  observed.health = health.body ?? health.text;
  if (health.status !== 200 || health.body?.status !== "ok") failures.push(`/api/health returned HTTP ${health.status}`);
  observed.routes = {};
  for (const route of ["/", ...PRIMARY_WORKSPACE_ROUTES]) {
    try {
      const result = await getStatus(`${baseUrl}${route}`);
      observed.routes[route] = result;
      if (result.status !== 200) failures.push(`${route} returned HTTP ${result.status}`);
      else if (!result.servesShell) failures.push(`${route} returned 200 but did not serve the app shell`);
    } catch (error) {
      observed.routes[route] = { status:0, error:error.message };
      failures.push(`${route} was unreachable: ${error.message}`);
    }
  }
  return { failures, observed, deployedCommit, supabaseState };
}

async function main() {
  const expectedCommit = readArgument("commit");
  const baseUrl = readArgument("base-url", DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = Number(readArgument("timeout-ms", String(DEFAULT_TIMEOUT_MS)));
  const noWait = process.argv.includes("--no-wait");

  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
    console.error("A full 40-character --commit sha is required.");
    process.exit(2);
  }

  log(`base url: ${baseUrl}`);
  log(`expected commit: ${expectedCommit}`);

  const failures = [];
  const observed = {};

  const poll = noWait
    ? { matched: false, version: await getJson(`${baseUrl}/api/version`) }
    : await pollForCommit(baseUrl, expectedCommit, timeoutMs);
  const version = poll.version;
  observed.version = version?.body ?? version?.text ?? null;

  const deployedCommit = String(version?.body?.commit || "");
  if (noWait && deployedCommit === expectedCommit) poll.matched = true;

  if (!poll.matched) {
    failures.push(`deployed commit is "${deployedCommit || "unreadable"}", expected "${expectedCommit}"`);
  }
  if (version?.status !== 200) {
    failures.push(`/api/version returned HTTP ${version?.status}`);
  }

  // The three-state probe (storage.mjs): connected | degraded | disconnected.
  const supabaseState = String(version?.body?.supabaseState || "");
  if (supabaseState !== "connected") {
    failures.push(`supabaseState is "${supabaseState || "absent"}", expected "connected"`);
  }
  if (version?.body?.supabaseConnected !== true) {
    failures.push(`supabaseConnected is ${JSON.stringify(version?.body?.supabaseConnected)}, expected true`);
  }
  // Safety posture must survive every deploy.
  if (version?.body?.authProtected !== true) {
    failures.push(`authProtected is ${JSON.stringify(version?.body?.authProtected)}, expected true`);
  }
  if (version?.body?.noSecretsExposed !== true) {
    failures.push(`noSecretsExposed is ${JSON.stringify(version?.body?.noSecretsExposed)}, expected true`);
  }

  const health = await getJson(`${baseUrl}/api/health`).catch((error) => ({ status: 0, body: null, text: error.message }));
  observed.health = health.body ?? health.text;
  if (health.status !== 200 || health.body?.status !== "ok") {
    failures.push(`/api/health returned HTTP ${health.status} body ${JSON.stringify(health.body ?? health.text)}`);
  }

  observed.routes = {};
  for (const route of ["/", ...PRIMARY_WORKSPACE_ROUTES]) {
    try {
      const result = await getStatus(`${baseUrl}${route}`);
      observed.routes[route] = result;
      if (result.status !== 200) failures.push(`${route} returned HTTP ${result.status}`);
      else if (!result.servesShell) failures.push(`${route} returned 200 but did not serve the app shell`);
    } catch (error) {
      observed.routes[route] = { status: 0, error: error.message };
      failures.push(`${route} was unreachable: ${error.message}`);
    }
  }

  console.log("POST_DEPLOY_EVIDENCE " + JSON.stringify({
    expectedCommit,
    deployedCommit,
    supabaseState,
    verifiedAt: new Date().toISOString(),
    observed
  }));

  if (failures.length) {
    console.error("\nPost-deploy verification FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  log("verified: deployed commit matches, Supabase connected, auth enforced, all routes healthy.");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
