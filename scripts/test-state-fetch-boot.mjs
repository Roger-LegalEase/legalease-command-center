import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");

const port = Number(process.env.TEST_STATE_FETCH_BOOT_PORT || 3447);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-state-fetch-test-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-state-fetch-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({
  settings: {},
  posts: [],
  contentBank: [],
  tasks: [],
  captureInbox: [],
  roleAssignments: [],
  auditHistory: [],
  activityEvents: [],
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } }
}, null, 2));

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    if (logs.includes("LegalEase preview server ready")) return logs;
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${logs}`);
    await wait(100);
  }
  throw new Error(`Timed out waiting for server: ${logs}`);
}

async function readJsonResponse(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let json = null;
  assert.doesNotThrow(() => {
    json = text ? JSON.parse(text) : {};
  }, `${pathname} should return valid JSON. Body: ${text.slice(0, 200)}`);
  return { response, text, json };
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    RENDER: "true",
    COMMAND_CENTER_REQUIRE_AUTH: "true",
    COMMAND_CENTER_OWNER_TOKEN: ownerToken,
    LOCAL_DEMO_MODE: "true",
    STORAGE_BACKEND: "json",
    COMMAND_CENTER_DATA_PATH: dataPath,
    COMMAND_CENTER_SEED_PATH: seedPath,
    NODE_DISABLE_COMPILE_CACHE: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const missing = await readJsonResponse("/api/state");
  assert.equal(missing.response.status, 401, "Missing token should fail safely.");
  assert.match(missing.json.error || "", /Authentication required/i, "Missing token should return auth-required JSON.");

  const wrong = await readJsonResponse("/api/state", {
    headers: { authorization: "Bearer wrong-token" }
  });
  assert.equal(wrong.response.status, 401, "Wrong token should fail safely.");
  assert.match(wrong.json.error || "", /Authentication required/i, "Wrong token should return auth-required JSON.");

  const correct = await readJsonResponse("/api/state", {
    headers: { authorization: `Bearer ${ownerToken}` }
  });
  assert.equal(correct.response.status, 200, "Correct owner token should fetch state.");
  for (const collection of ["posts", "tasks", "captureInbox", "roleAssignments", "auditHistory", "activityEvents"]) {
    assert(Array.isArray(correct.json[collection]), `${collection} should default to an array.`);
  }
  assert.equal(Object.values(correct.json.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length, 0, "Live gates must remain 0.");

  const lock = await fetch(`${baseUrl}/`).then(response => response.text());
  assert.match(lock, /Owner access token|Unlock Command Center/i, "Missing token root should show lock screen.");
  assert.doesNotMatch(lock, /Failed module: state-fetch|LegalEase did not finish rendering/i, "Auth-required root should not render crash screen.");

  const unlocked = await fetch(`${baseUrl}/`, {
    headers: { cookie: `leos_session=${encodeURIComponent(ownerToken)}` }
  }).then(response => response.text());
  assert.match(unlocked, /async function load\(\)/, "Unlocked app should include client boot loader.");
  assert.match(unlocked, /handleStateFetchAuthFailure/, "Client boot should handle state-fetch auth failures explicitly.");
  assert.match(unlocked, /error\.status !== 401 && error\.status !== 403|error\.status === 401 \|\| error\.status === 403/, "Client boot should treat 401/403 as auth state, not render failure.");
  const loadBlock = unlocked.match(/async function load\(\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(loadBlock, /handleStateFetchAuthFailure/, "State-fetch catch should route auth failures to lock flow.");
  assert.doesNotMatch(loadBlock, /catch \(error\) \{\s*showRenderFailure/, "State-fetch catch should not immediately show render failure for auth errors.");
} finally {
  child.kill("SIGTERM");
}

assert(serverSource.includes('if (url.pathname === "/api/state" && request.method === "GET")'), "State endpoint must exist.");
assert(serverSource.includes("guardForbiddenEndpoint"), "Forbidden-action guard remains wired.");
assert(!/\/api\/state[\s\S]{0,400}guardForbiddenEndpoint/.test(serverSource), "State read should not be specifically blocked by forbidden-action guard.");

console.log("State fetch boot tests passed.");
