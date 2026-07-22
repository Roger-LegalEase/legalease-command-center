import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

process.env.SKIP_ENV_LOCAL_FILE = "1";

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (logs.includes("LegalEase preview server ready")) return logs;
    if (child.exitCode !== null) throw new Error(logs || "Server exited before startup.");
    await wait(100);
  }
  throw new Error(logs || "Timed out waiting for server.");
}

const port = await availablePort();
const dataPath = path.join(await mkdtemp(path.join(os.tmpdir(), "legalease-version-endpoint-")), "state.json");
const secretValues = {
  ownerToken:"test-owner-token-1234567890",
  serviceRole:"placeholder-supabase-service-role-key",
  cronToken:"placeholder-cron-token",
  oauthToken:"placeholder-oauth-token",
  email:"private@example.com"
};

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT:String(port),
    HOST:"127.0.0.1",
    COMMAND_CENTER_REQUIRE_AUTH:"true",
    COMMAND_CENTER_OWNER_TOKEN:secretValues.ownerToken,
    COMMAND_CENTER_CRON_TOKEN:secretValues.cronToken,
    SUPABASE_SERVICE_ROLE_KEY:secretValues.serviceRole,
    GOOGLE_REFRESH_TOKEN:secretValues.oauthToken,
    RENDER_GIT_COMMIT:"abcdef1234567890abcdef1234567890abcdef12",
    RENDER_DEPLOY_CREATED_AT:"2026-06-29T19:30:00.000Z",
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_DATA_PATH:dataPath,
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio:["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const versionResponse = await fetch(`http://127.0.0.1:${port}/api/version`);
  const versionText = await versionResponse.text();
  assert.equal(versionResponse.status, 200, "/api/version should work without an owner token.");
  const version = JSON.parse(versionText);

  assert.equal(version.app, "LegalEase Command Center");
  assert.equal(version.commit, "abcdef1234567890abcdef1234567890abcdef12");
  assert.equal(version.deployedAt, "2026-06-29T19:30:00.000Z");
  assert.equal(version.authProtected, true);
  assert.equal(version.noSecretsExposed, true);
  assert.equal(version.authStoreBackend, "memory");
  assert.equal(version.authStoreConnected, true);
  assert.equal(typeof version.supabaseConnected, "boolean");
  assert.equal(typeof version.localDemoMode, "boolean");
  assert.equal(typeof version.liveGatesCount, "number");
  assert.deepEqual(Object.keys(version).sort(), [
    "app",
    "authProtected",
    "authStoreBackend",
    "authStoreConnected",
    "commit",
    "deployedAt",
    "environment",
    "liveGatesCount",
    "localDemoMode",
    "noSecretsExposed",
    "storageBackend",
    "supabaseConnected"
  ].sort());

  for (const forbidden of [
    secretValues.ownerToken,
    secretValues.serviceRole,
    secretValues.cronToken,
    secretValues.oauthToken,
    secretValues.email,
    "SUPABASE_SERVICE_ROLE_KEY",
    "COMMAND_CENTER_OWNER_TOKEN",
    "GOOGLE_REFRESH_TOKEN",
    "DATABASE_URL",
    "contacts",
    "emails",
    "outreachContacts",
    "reactivationContacts",
    "privateState",
    "stack"
  ]) {
    assert(!versionText.includes(forbidden), `/api/version should not expose ${forbidden}.`);
  }

  const stateResponse = await fetch(`http://127.0.0.1:${port}/api/state`);
  assert.equal(stateResponse.status, 401, "/api/state should still require auth while /api/version is public.");
} finally {
  child.kill("SIGTERM");
}

console.log("version endpoint tests passed");
