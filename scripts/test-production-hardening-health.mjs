import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
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
    if (logs.includes("LegalEase preview server ready")) return;
    if (child.exitCode !== null) throw new Error(logs);
    await wait(100);
  }
  throw new Error(logs || "Timed out waiting for server.");
}

const port = await availablePort();
const dataPath = path.join(await mkdtemp(path.join(os.tmpdir(), "legalease-health-")), "state.json");
const secret = "test-secret-should-not-leak-1234567890";
const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT:String(port),
    HOST:"127.0.0.1",
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_REQUIRE_AUTH:"true",
    COMMAND_CENTER_OWNER_TOKEN:"owner-token-health-hardening-1234567890",
    OPENAI_API_KEY:secret,
    DATABASE_URL:"postgres://example.invalid/db",
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio:["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const text = await response.text();
  const health = JSON.parse(text);
  assert.equal(health.liveGatesCount, 0, "liveGatesCount should be 0.");
  assert.equal(health.ownerAuthEnabled, true, "ownerAuthEnabled should be true.");
  assert.equal(health.externalActionsEnabled, false, "externalActionsEnabled should be false.");
  assert.equal(health.socialWorkspaceEnabled, true, "Social workspace should be enabled.");
  assert.equal(health.socialLivePostingEnabled, false, "Social live posting should be off.");
  assert.equal(health.emailEnabled, false, "Email should be disabled.");
  assert.equal(health.calendarWritesEnabled, false, "Calendar writes should be disabled.");
  assert.equal(health.privacyRouteEnabled, true, "Privacy route should be enabled.");
  assert.doesNotMatch(text, /postgres:\/\/example\.invalid|test-secret-should-not-leak|DATABASE_URL|OPENAI_API_KEY/, "Health should not leak secret values or secret names.");
} finally {
  child.kill("SIGTERM");
}

console.log("production hardening health tests passed");
