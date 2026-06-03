#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.TEST_LINKEDIN_OAUTH_CALLBACK_PORT || 3468);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "linkedin-oauth-callback-owner-token-1234567890";
const clientSecret = "linkedin-oauth-callback-secret-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-linkedin-oauth-callback-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], socialAccounts:[], soc2AuditLogs:[] }, null, 2));

function signedState({ platform = "linkedin", issuedAt = Date.now() } = {}) {
  const payload = {
    platform,
    nonce: "callback-test-nonce",
    issuedAt
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", clientSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
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

function assertSettingsRedirect(response, expectedMessage, label) {
  assert.equal(response.status, 302, `${label} should redirect back to the app shell`);
  const location = response.headers.get("location") || "";
  assert.match(location, /#settings$/, `${label} should return Roger to Settings`);
  assert.match(decodeURIComponent(location), new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} should include a clear founder-facing message`);
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
    LINKEDIN_CLIENT_ID:"linkedin-callback-client-id",
    LINKEDIN_CLIENT_SECRET:clientSecret,
    LINKEDIN_REDIRECT_URI:`${baseUrl}/api/linkedin/callback`,
    OAUTH_TOKEN_ENCRYPTION_KEY:"linkedin-oauth-callback-encryption-key-1234567890",
    LINKEDIN_LIVE_POSTING_ENABLED:"false",
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const status = await fetch(`${baseUrl}/api/linkedin/status`);
  assert.equal(status.status, 401, "anonymous LinkedIn status should remain protected");
  assert.equal((await status.json()).error, "Authentication required.", "anonymous status should return the protected API auth error");

  const connect = await fetch(`${baseUrl}/api/linkedin/connect?format=json`);
  assert.equal(connect.status, 401, "anonymous LinkedIn connect JSON route should remain protected");
  assert.equal((await connect.json()).error, "Authentication required.", "anonymous connect should return the protected API auth error");

  const missingState = await fetch(`${baseUrl}/api/linkedin/callback?code=fake-code`, { redirect:"manual" });
  assertSettingsRedirect(missingState, "LinkedIn connection expired. Try again from Settings.", "missing callback state");

  const invalidState = await fetch(`${baseUrl}/api/linkedin/callback?code=fake-code&state=not-valid`, { redirect:"manual" });
  assertSettingsRedirect(invalidState, "LinkedIn connection expired. Try again from Settings.", "invalid callback state");

  const malformedState = await fetch(`${baseUrl}/api/linkedin/callback?code=fake-code&state=abc.def`, { redirect:"manual" });
  assertSettingsRedirect(malformedState, "LinkedIn connection expired. Try again from Settings.", "malformed callback state");

  const validState = signedState();
  const missingOwner = await fetch(`${baseUrl}/api/linkedin/callback?code=fake-code&state=${encodeURIComponent(validState)}`, { redirect:"manual" });
  assertSettingsRedirect(missingOwner, "Sign in as owner, then reconnect LinkedIn.", "callback without owner session");

  const ownerInvalidState = await fetch(`${baseUrl}/api/linkedin/callback?code=fake-code&state=not-valid`, {
    redirect:"manual",
    headers:{ "x-command-center-token":ownerToken }
  });
  assertSettingsRedirect(ownerInvalidState, "LinkedIn connection expired. Try again from Settings.", "owner callback with invalid state");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200, "health endpoint should remain public");
  const healthJson = await health.json();
  assert.equal(healthJson.liveGatesCount, 0, "liveGatesCount should remain 0");
} finally {
  child.kill("SIGTERM");
}

console.log("linkedin oauth callback tests passed.");
