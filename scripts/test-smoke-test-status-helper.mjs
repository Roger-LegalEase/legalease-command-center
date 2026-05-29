import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSmokeTestStatus as serverBuildSmokeTestStatus } from "./smoke-test-center.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");

const port = Number(process.env.TEST_SMOKE_STATUS_HELPER_PORT || 3452);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-smoke-status-helper-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-smoke-status-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

assert.deepEqual(serverBuildSmokeTestStatus({}), {
  status: "not_started",
  last_status: "not_started",
  last_run_at: null,
  last_run_timestamp: "",
  failed_count: 0,
  passed_count: 0,
  not_tested_count: 0,
  latest_run_id: "",
  latest_commit_hash: "",
  smoke_test_after_latest_commit: true,
  warning: "No smoke test run recorded yet."
}, "Server smoke status helper should default safely.");

await writeFile(seedPath, JSON.stringify({
  settings: {},
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  posts: [],
  tasks: [],
  captureInbox: [],
  smokeTestRuns: { malformed: true },
  osHealthSnapshots: [],
  roleAssignments: [],
  auditHistory: [],
  activityEvents: []
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

  const boot = await readJson("/api/boot-state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(boot.response.status, 200, "Boot state should build with malformed smokeTestRuns.");
  assert.equal(boot.json.liveGatesCount, 0, "Boot state should keep live gates at 0.");

  const full = await readJson("/api/state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(full.response.status, 200, "Full state should build with malformed smokeTestRuns.");
  assert(Array.isArray(full.json.smokeTestRuns), "Full state should default malformed smokeTestRuns to an array.");

  const unlocked = await readText("/", { headers: { cookie: `leos_session=${encodeURIComponent(ownerToken)}` } });
  assert.match(unlocked.text, /function buildSmokeTestStatus\(state = \{\}, options = \{\}\)/, "Browser smoke status helper should be defined in the inline runtime.");
  assert.match(unlocked.text, /No smoke test run recorded yet\./, "Browser smoke status helper should include safe default warning.");
  assert.doesNotMatch(unlocked.text, /Can't find variable: buildSmokeTestStatus|ReferenceError/i, "Authenticated shell should not contain smoke status ReferenceError.");
} finally {
  child.kill("SIGTERM");
}

assert(source.includes("function buildSmokeTestStatus(state = {}, options = {})"), "Client runtime should define buildSmokeTestStatus where render helpers call it.");
assert(source.includes('warning:"No smoke test run recorded yet."'), "Client helper should return safe default warning when there are no smoke test runs.");
assert(source.includes("Array.isArray(state.smokeTestRuns) ? state.smokeTestRuns : []"), "Client helper should tolerate missing or malformed smokeTestRuns.");
assert(source.includes("buildCompactBootState"), "Boot-state builder should exist.");
assert(source.includes('if (url.pathname === "/api/boot-state" && request.method === "GET")'), "Boot-state endpoint should exist.");
assert(source.includes("liveGatesCount"), "Live gates count should remain represented in boot/full state.");

console.log("Smoke test status helper tests passed.");
