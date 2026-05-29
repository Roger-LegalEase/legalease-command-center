import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");

const port = Number(process.env.TEST_BOOT_AUTH_REQUESTS_PORT || 3449);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-boot-auth-test-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-boot-auth-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({
  settings: {},
  posts: [],
  tasks: [],
  captureInbox: [],
  conversationNotes: [],
  auditHistory: [],
  activityEvents: [],
  roleAssignments: [],
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

async function readText(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return { response, text };
}

async function readJson(pathname, options = {}) {
  const { response, text } = await readText(pathname, options);
  let json = null;
  assert.doesNotThrow(() => {
    json = text ? JSON.parse(text) : {};
  }, `${pathname} should return JSON. Body: ${text.slice(0, 240)}`);
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

  const noTokenRoot = await readText("/");
  assert.match(noTokenRoot.text, /Owner access token|Unlock Command Center/i, "Missing token should show lock flow.");
  assert.doesNotMatch(noTokenRoot.text, /Failed module: state-fetch|LegalEase did not finish rendering/i, "Missing token should not render state-fetch crash.");

  const wrongTokenRoot = await readText("/", { headers: { cookie: "leos_session=wrong-token" } });
  assert.match(wrongTokenRoot.text, /Owner access token|Unlock Command Center/i, "Wrong token should show lock flow.");
  assert.doesNotMatch(wrongTokenRoot.text, /Failed module: state-fetch|LegalEase did not finish rendering/i, "Wrong token should not render state-fetch crash.");

  const state = await readJson("/api/state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(state.response.status, 200, "/api/state should succeed with owner token.");
  assert.equal(state.json.liveGatesCount, 0, "Live gates must remain 0.");

  const optionalNoToken = await readJson("/api/backups");
  assert.equal(optionalNoToken.response.status, 401, "Protected optional boot request should fail safely without token.");

  const unlocked = await readText("/", { headers: { cookie: `leos_session=${encodeURIComponent(ownerToken)}` } });
  assert.match(unlocked.text, /async function api\(path, options = \{\}\)/, "Boot should use shared token-aware api helper.");
  assert.match(unlocked.text, /credentials:"same-origin"/, "Boot fetches should include same-origin credentials.");
  assert.match(unlocked.text, /if \(token && !headers\.Authorization && !headers\.authorization\) headers\.Authorization = "Bearer " \+ token;/, "Protected startup fetches should include owner token when available.");
  assert.match(unlocked.text, /function optionalBootApi\(path, options = \{\}\)/, "Optional boot requests should use non-fatal wrapper.");
  assert.match(unlocked.text, /optionalBootApi\("\/api\/health\/supabase"/, "Supabase health startup request should be optional.");
  assert.match(unlocked.text, /optionalBootApi\("\/api\/backups"/, "Backups startup request should be optional.");
  assert.doesNotMatch(unlocked.text, /Promise\.allSettled\(\[\s*api\("\/api\/health\/supabase"[\s\S]*api\("\/api\/backups"/, "Optional boot requests should not call raw api directly.");
  assert.match(unlocked.text, /error\.status === 401 \|\| error\.status === 403/, "Optional boot 401/403 should be treated as auth-required, not fatal.");
  assert.match(unlocked.text, /Endpoint: /, "State-fetch diagnostics should include endpoint.");
  assert.match(unlocked.text, /Status: /, "State-fetch diagnostics should include status.");
  assert.match(unlocked.text, /showSafeBootShell\(formatStateFetchError\(error\), "state-fetch", error\)/, "Unexpected state-fetch failures should show detailed diagnostics and fall back to safe shell.");
  assert.match(unlocked.text, /<button onclick="window\.load && window\.load\(\)">Retry data load<\/button>/, "Retry data load should call the same load/api path.");
  assert.match(unlocked.text, /<a class="button-link" href="#queue">Open Queue<\/a>/, "Open Queue should remain a hash link and not issue a protected fetch by itself.");
} finally {
  child.kill("SIGTERM");
}

const loadBlock = source.match(/async function load\(\) \{[\s\S]*?Promise\.all\(\[[\s\S]*?\]\)\.then\(results => \{[\s\S]*?\n    \}/)?.[0] || "";
assert(loadBlock.includes('state = hydrateStatePayload(await api("/api/state"'), "Initial state fetch should hydrate through shared helper.");
assert(loadBlock.includes('optionalBootApi("/api/health/supabase"'), "Startup health fetch should be inventoried and optional.");
assert(loadBlock.includes('optionalBootApi("/api/backups"'), "Startup backups fetch should be inventoried and optional.");
assert(!/window\.__LE_FAIL_BOOT\("state-fetch"/.test(source), "State-fetch should not be hard-coded to crash on auth failures.");
assert(source.includes("handleStateFetchAuthFailure"), "State-fetch auth failures should route to auth-required handling.");

console.log("Boot auth request tests passed.");
