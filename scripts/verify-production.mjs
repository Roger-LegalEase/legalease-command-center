import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.PRODUCTION_VERIFY_PORT || 3399);
const baseUrl = `http://127.0.0.1:${port}`;

const syntaxFiles = [
  "scripts/preview-server.mjs",
  "scripts/storage.mjs",
  "scripts/priority-engine.mjs",
  "scripts/autonomy-engine.mjs",
  "scripts/prepare-launch-demo.mjs",
  "scripts/test-soc2-export.mjs",
  "scripts/test-hosting-readiness.mjs",
  "scripts/test-autonomy-engine.mjs",
  "scripts/sync-local-json-to-supabase.mjs",
  "scripts/verify-production.mjs"
];

function readEnvFile(filename) {
  const filePath = path.join(rootDir, filename);
  const values = {};
  if (!existsSync(filePath)) return values;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

function secretValues(env) {
  return [
    env.OPENAI_API_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.OAUTH_TOKEN_ENCRYPTION_KEY,
    env.LINKEDIN_CLIENT_SECRET,
    env.META_CLIENT_SECRET,
    env.X_CLIENT_SECRET,
    env.THREADS_CLIENT_SECRET
  ].filter((value) => value && String(value).length > 12);
}

function runCheck(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
}

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (logs.includes("LegalEase preview server ready")) return logs;
    if (child.exitCode !== null) throw new Error(`Server exited before ready:\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server:\n${logs}`);
}

async function jsonGet(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: { authorization: `Bearer ${globalThis.__verifyToken || ""}` } });
  assert.equal(response.status, 200, `${pathname} should return 200`);
  return response.json();
}

async function jsonPost(pathname, body = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type":"application/json", authorization: `Bearer ${globalThis.__verifyToken || ""}` },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 200, `${pathname} should return 200`);
  return response.json();
}

function assertNoSecrets(label, payload, secrets) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const secret of secrets) {
    assert.equal(text.includes(secret), false, `${label} must not expose secret material`);
  }
}

async function main() {
  const localEnv = { ...readEnvFile(".env"), ...readEnvFile(".env.local") };
  const secrets = secretValues(localEnv);
  const productionLike = process.env.VERIFY_HOSTED_MODE === "true";
  const verifierToken = localEnv.COMMAND_CENTER_OWNER_TOKEN || "production-verify-owner-token-1234567890";
  globalThis.__verifyToken = verifierToken;
  const env = {
    ...process.env,
    ...localEnv,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_DISABLE_COMPILE_CACHE: "1",
    LOCAL_DEMO_MODE: productionLike ? "false" : "true",
    STORAGE_BACKEND: productionLike ? "supabase" : "json",
    COMMAND_CENTER_OWNER_TOKEN: verifierToken
  };

  for (const file of syntaxFiles) runCheck(process.execPath, ["--check", file]);
  runCheck("npm", ["audit", "--audit-level=high"]);

  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: rootDir,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child);
    const health = await jsonGet("/api/health");
    assert.equal(health.appRunning, true);
    assert.equal(health.liveGatesCount, 0, "live gates must remain disabled");
    assert.equal(typeof health.supabaseDbConnected, "boolean");
    assert.equal(typeof health.supabaseStorageConnected, "boolean");
    assert.equal(typeof health.openAIConfigured, "boolean");
    assertNoSecrets("/api/health", health, secrets);

    const stateResponse = await fetch(`${baseUrl}/api/state`, { headers: { authorization: `Bearer ${verifierToken}` } });
    assert.equal(stateResponse.status, 200, "/api/state should return 200");
    const stateText = await stateResponse.text();
    assertNoSecrets("/api/state", stateText, secrets);
    const state = JSON.parse(stateText);
    assert.equal(state.runtime?.livePostingGates?.linkedin?.enabled, false, "LinkedIn live gate must be disabled");
    assert.equal(state.runtime?.manualModeActive, true, "manual mode should remain active while gates are disabled");
    assert.equal(Boolean(state.runtime?.accessControl?.roles?.owner), true, "role metadata should be present");

    const autonomy = await jsonGet("/api/autonomy/status");
    assertNoSecrets("/api/autonomy/status", autonomy, secrets);
    assert.equal(autonomy.policy.forbidden.includes("live publishing"), true);
    assert.equal(autonomy.governance.safetyRails.includes("Never expose secrets."), true);

    const livePublishCheck = await jsonPost("/api/autonomy/check", { actionType:"live_publish" });
    assert.equal(livePublishCheck.ok, false, "live publishing autonomy check must fail closed");
    assert.equal(livePublishCheck.decision.approvalPolicy, "never_execute");

    const soc2 = await jsonGet("/api/soc2/evidence-snapshot");
    assertNoSecrets("/api/soc2/evidence-snapshot", soc2, secrets);

    const report = {
      mode: productionLike ? "hosted_supabase_requested" : "local_fallback",
      health: {
        storageBackend: health.storageBackend,
        supabaseDbConnected: health.supabaseDbConnected,
        supabaseStorageConnected: health.supabaseStorageConnected,
        openAIConfigured: health.openAIConfigured,
        liveGatesCount: health.liveGatesCount
      },
      checks: [
        "syntax",
        "npm audit",
        "health endpoint",
        "state secret scan",
        "autonomy rules",
        "live gate fail-closed",
        "SOC 2 snapshot"
      ],
      blockers: health.supabaseDbConnected ? [] : ["Supabase DB is not connected. Run supabase/leos-core-records.sql before hosted durable mode."],
      generatedAt: new Date().toISOString()
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
