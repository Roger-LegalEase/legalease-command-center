import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.cwd();
const port = Number(process.env.TEST_PORT || 3299);
const baseUrl = `http://127.0.0.1:${port}`;

function readLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  const values = {};
  if (!existsSync(envPath)) return values;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[trimmed.slice(0, index).trim()] = value;
  }
  return values;
}

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

async function main() {
  const env = readLocalEnv();
  const testDataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-hosting-readiness-"));
  const testDataPath = path.join(testDataDir, "social-command-center.json");
  const testSeedPath = path.join(testDataDir, "social-command-center.seed.json");
  await writeFile(testSeedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], soc2AuditLogs:[] }, null, 2));
  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: rootDir,
    env: { ...process.env, ...env, PORT:String(port), LOCAL_DEMO_MODE:"true", STORAGE_BACKEND:"json", COMMAND_CENTER_DATA_PATH:testDataPath, COMMAND_CENTER_SEED_PATH:testSeedPath, NODE_DISABLE_COMPILE_CACHE:"1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    const logs = await waitForServer(child);
    assert.match(logs, new RegExp(`http://127\\.0\\.0\\.1:${port}`), "local server should bind to 127.0.0.1 by default");
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200, "health endpoint should return 200");
    const health = await healthResponse.json();
    assert.equal(health.appRunning, true);
    assert.equal(health.storageBackend, "json");
    assert.equal(typeof health.supabaseDbConnected, "boolean");
    assert.equal(typeof health.supabaseStorageConnected, "boolean");
    assert.equal(typeof health.openAIConfigured, "boolean");
    assert.equal(health.liveGatesCount, 0, "live gates must remain disabled");
    assert.ok(!JSON.stringify(health).includes(env.OPENAI_API_KEY || "__missing__"), "health must not expose OpenAI key");
    assert.ok(!JSON.stringify(health).includes(env.SUPABASE_SERVICE_ROLE_KEY || "__missing__"), "health must not expose Supabase service role key");

    const stateResponse = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateResponse.status, 200, "state endpoint should return 200");
    const stateText = await stateResponse.text();
    assert.ok(!stateText.includes(env.OPENAI_API_KEY || "__missing__"), "state must not expose OpenAI key");
    assert.ok(!stateText.includes(env.SUPABASE_SERVICE_ROLE_KEY || "__missing__"), "state must not expose Supabase service role key");
    const state = JSON.parse(stateText);
    assert.equal(state.runtime?.hosting?.storageBackend, "json");
    assert.equal(state.runtime?.hosting?.localDemoMode, true);
    assert.equal(state.runtime?.accessControl?.localFallbackOpen, true);
    assert.equal(Boolean(state.runtime?.accessControl?.roles?.owner), true);
  } finally {
    child.kill("SIGTERM");
  }

  const renderPort = port + 1;
  const ownerToken = "test-owner-token-1234567890";
  const renderChild = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: rootDir,
    env: { ...process.env, ...env, PORT:String(renderPort), RENDER:"true", COMMAND_CENTER_REQUIRE_AUTH:"true", COMMAND_CENTER_OWNER_TOKEN:ownerToken, LOCAL_DEMO_MODE:"true", STORAGE_BACKEND:"json", COMMAND_CENTER_DATA_PATH:path.join(testDataDir, "hosted-social-command-center.json"), COMMAND_CENTER_SEED_PATH:testSeedPath, NODE_DISABLE_COMPILE_CACHE:"1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    const renderLogs = await waitForServer(renderChild);
    assert.match(renderLogs, new RegExp(`http://0\\.0\\.0\\.0:${renderPort}`), "Render server should bind to 0.0.0.0 when HOST is not explicitly set");
    const healthResponse = await fetch(`http://127.0.0.1:${renderPort}/api/health`);
    assert.equal(healthResponse.status, 200, "Render-bound health endpoint should still be reachable locally");
    const lockedResponse = await fetch(`http://127.0.0.1:${renderPort}/`);
    assert.equal(lockedResponse.status, 401, "hosted root should remain protected without a token");
    const lockedHtml = await lockedResponse.text();
    assert.match(lockedHtml, /Owner access token/, "hosted lock screen should ask for owner token");
    assert.match(lockedHtml, /Unlock Command Center/, "hosted lock screen should include unlock button");
    assert.match(lockedHtml, /localStorage\.setItem/, "hosted lock screen should store the token locally after successful validation");
    assert.match(lockedHtml, /Authorization/, "hosted lock screen should validate access with Authorization header");

    const wrongTokenResponse = await fetch(`http://127.0.0.1:${renderPort}/api/state`, {
      headers:{ authorization:"Bearer wrong-token" }
    });
    assert.equal(wrongTokenResponse.status, 401, "wrong token should stay locked");

    const correctTokenResponse = await fetch(`http://127.0.0.1:${renderPort}/api/state`, {
      headers:{ authorization:"Bearer " + ownerToken }
    });
    assert.equal(correctTokenResponse.status, 200, "correct owner token should unlock protected API state");
    const unlockedRootResponse = await fetch(`http://127.0.0.1:${renderPort}/`, {
      headers:{ cookie:"leos_session=" + encodeURIComponent(ownerToken) }
    });
    assert.equal(unlockedRootResponse.status, 200, "owner token cookie should unlock dashboard HTML navigation");
    const unlockedHtml = await unlockedRootResponse.text();
    assert.match(unlockedHtml, /lockCommandCenter/, "unlocked app should include a lock/sign out action");
  } finally {
    renderChild.kill("SIGTERM");
  }
}

main().then(() => console.log("Hosting readiness test passed."));
