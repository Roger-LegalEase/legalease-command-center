import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.TEST_ROOT_SHELL_AUTH_BOUNDARY_PORT || 3438);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "root-shell-auth-boundary-token-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-root-shell-auth-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], socialAccounts:[], soc2AuditLogs:[] }, null, 2));

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    if (logs.includes("LegalEase preview server ready")) return logs;
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server: ${logs}`);
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT:String(port),
    COMMAND_CENTER_REQUIRE_AUTH:"true",
    COMMAND_CENTER_OWNER_TOKEN:ownerToken,
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_SEED_PATH:seedPath,
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const root = await fetch(`${baseUrl}/`);
  const rootText = await root.text();
  assert.equal(root.status, 200, "anonymous root should load the HTML shell so the owner can sign in");
  assert.match(root.headers.get("content-type") || "", /text\/html/i, "anonymous root should be HTML, not JSON");
  assert.match(rootText, /<!doctype html>/i, "anonymous root should return an HTML document");
  assert.match(rootText, /LegalEase Command Center/, "anonymous root should render the Command Center shell");
  assert.doesNotMatch(rootText, /"Authentication required|Authentication required/i, "anonymous root should not render the raw JSON auth error");

  const rootHead = await fetch(`${baseUrl}/`, { method:"HEAD" });
  assert.equal(rootHead.status, 200, "anonymous HEAD / should use the same app-shell boundary");
  assert.match(rootHead.headers.get("content-type") || "", /text\/html/i, "anonymous HEAD / should advertise HTML, not JSON");

  const linkedinStatus = await fetch(`${baseUrl}/api/linkedin/status`);
  assert.equal(linkedinStatus.status, 401, "anonymous LinkedIn status API should remain protected");
  assert.match(linkedinStatus.headers.get("content-type") || "", /application\/json/i, "protected LinkedIn status should return JSON");
  const linkedinStatusJson = await linkedinStatus.json();
  assert.equal(linkedinStatusJson.error, "Authentication required.", "LinkedIn status should return the auth error for anonymous API callers");

  const linkedinConnect = await fetch(`${baseUrl}/api/linkedin/connect?format=json`);
  assert.equal(linkedinConnect.status, 401, "anonymous LinkedIn connect API should remain protected");
  assert.match(linkedinConnect.headers.get("content-type") || "", /application\/json/i, "protected LinkedIn connect should return JSON");
  const linkedinConnectJson = await linkedinConnect.json();
  assert.equal(linkedinConnectJson.error, "Authentication required.", "LinkedIn connect should return the auth error for anonymous API callers");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200, "health endpoint should remain public");
  const healthJson = await health.json();
  assert.equal(healthJson.liveGatesCount, 0, "health should keep liveGatesCount at 0");
} finally {
  child.kill("SIGTERM");
}

console.log("root shell auth boundary tests passed");
