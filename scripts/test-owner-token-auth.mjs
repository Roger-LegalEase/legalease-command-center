import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.TEST_OWNER_AUTH_PORT || 3431);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-auth-test-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-owner-auth-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], soc2AuditLogs:[] }, null, 2));

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
    RENDER:"true",
    COMMAND_CENTER_REQUIRE_AUTH:"true",
    COMMAND_CENTER_OWNER_TOKEN:`"${ownerToken}"`,
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

  const noToken = await fetch(`${baseUrl}/api/state`);
  assert.equal(noToken.status, 401, "missing token should be rejected");

  const wrongToken = await fetch(`${baseUrl}/api/state`, {
    headers:{ authorization:"Bearer wrong-token" }
  });
  assert.equal(wrongToken.status, 401, "wrong token should be rejected");

  const diagnosticsWrong = await fetch(`${baseUrl}/api/auth/diagnostics`, {
    headers:{ authorization:"Bearer wrong-token" }
  });
  assert.equal(diagnosticsWrong.status, 200, "auth diagnostics should be safe and public");
  const wrongDiagnosticJson = await diagnosticsWrong.json();
  assert.equal(wrongDiagnosticJson.hostedMode, true);
  assert.equal(wrongDiagnosticJson.ownerTokenConfigured, true);
  assert.equal(wrongDiagnosticJson.receivedAuthHeaderPresent, true);
  assert.equal(wrongDiagnosticJson.tokenMatch, false);
  assert.equal(wrongDiagnosticJson.requiredPermission, "read");
  assert.equal(Object.keys(wrongDiagnosticJson).includes("configuredToken"), false, "diagnostics must not return configured token value");

  const correctToken = await fetch(`${baseUrl}/api/state`, {
    headers:{ authorization:"Bearer " + ownerToken }
  });
  assert.equal(correctToken.status, 200, "correct owner token should be accepted even if env value is wrapped in quotes");

  const diagnosticsCorrect = await fetch(`${baseUrl}/api/auth/diagnostics`, {
    headers:{ authorization:"Bearer " + ownerToken }
  });
  assert.equal(diagnosticsCorrect.status, 200);
  const correctDiagnosticJson = await diagnosticsCorrect.json();
  assert.equal(correctDiagnosticJson.tokenMatch, true);
  assert.equal(correctDiagnosticJson.receivedBearerTokenLength, ownerToken.length);
  assert.equal(correctDiagnosticJson.configuredTokenLength, ownerToken.length);

  const lockedPage = await fetch(`${baseUrl}/`).then(response => response.text());
  assert.match(lockedPage, /No token entered\./);
  assert.match(lockedPage, /Token not accepted\./);
  assert.match(lockedPage, /Server owner token is not configured\./);
  assert.match(lockedPage, /Access granted\./);
  assert.ok(!lockedPage.includes(ownerToken), "owner token must never appear in page HTML");
} finally {
  child.kill("SIGTERM");
}

console.log("owner token auth test passed");
