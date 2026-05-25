import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
    if (logs.includes("LegalEase preview server ready")) return;
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server: ${logs}`);
}

async function main() {
  const env = readLocalEnv();
  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: rootDir,
    env: { ...process.env, ...env, PORT:String(port), LOCAL_DEMO_MODE:"true", STORAGE_BACKEND:"json", NODE_DISABLE_COMPILE_CACHE:"1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitForServer(child);
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
}

main().then(() => console.log("Hosting readiness test passed."));
