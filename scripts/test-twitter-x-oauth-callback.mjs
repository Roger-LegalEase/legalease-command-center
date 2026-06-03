#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { coreRecordsFromState } from "./storage.mjs";

const rootDir = process.cwd();
const source = readFileSync(path.join(rootDir, "scripts", "preview-server.mjs"), "utf8");
const port = Number(process.env.TEST_TWITTER_X_OAUTH_CALLBACK_PORT || 3478);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "twitter-x-oauth-callback-owner-token-1234567890";
const clientSecret = "twitter-x-oauth-callback-secret-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-twitter-x-oauth-callback-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], socialAccounts:[], soc2AuditLogs:[] }, null, 2));

assert(source.includes('url.pathname === "/api/x/status"'), "Twitter / X status route should exist");
assert(source.includes('url.pathname === "/api/x/connect"'), "Twitter / X connect route should exist");
assert(source.includes('url.pathname === "/api/x/callback"'), "Twitter / X callback route should exist");
assert(source.includes("xAuthorizationUrl({ state"), "Twitter / X connect should create an OAuth authorization URL");
assert(source.includes("verifyOwnerStartedOAuthState(\"x\""), "Twitter / X callback should validate owner-started state");
assert(source.includes("Twitter / X connected. Live posting remains off."), "successful callback should use safe Settings copy");
assert(source.includes("Twitter / X connection could not be saved. Try again from Settings."), "callback should not show connected if persistence read-back fails");
assert(source.includes("persistedXStatus.connected"), "callback should verify persisted Twitter / X status before success redirect");
assert(!source.includes("Tweet Now"), "normal app source should not add Tweet Now controls");
assert(!source.includes("Send to X"), "normal app source should not add Send to X controls");

const persistedSocialAccountRows = coreRecordsFromState({
  socialAccounts: [
    {
      id: "channel-x",
      platform: "x",
      status: "connected",
      accessTokenEncrypted: "v1.redacted"
    }
  ]
}).filter((row) => row.collection === "socialAccounts");
assert.equal(persistedSocialAccountRows.length, 1, "Supabase persistence should include Twitter / X social accounts after refresh");

function signedState({ platform = "x", issuedAt = Date.now(), ownerStarted = false, startedByRole = "", codeVerifierEncrypted = "" } = {}) {
  const payload = {
    platform,
    nonce: "twitter-x-callback-test-nonce",
    issuedAt,
    ...(ownerStarted ? { ownerStarted:true, startedByRole, returnTarget:"settings" } : {}),
    ...(codeVerifierEncrypted ? { codeVerifierEncrypted } : {})
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
  assert.match(decodeURIComponent(location), new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} should include clear founder-facing copy`);
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
    X_CLIENT_ID:"twitter-x-callback-client-id",
    X_CLIENT_SECRET:clientSecret,
    X_REDIRECT_URI:`${baseUrl}/api/x/callback`,
    OAUTH_TOKEN_ENCRYPTION_KEY:"twitter-x-oauth-callback-encryption-key-1234567890",
    ENABLE_LIVE_X_POSTING:"false",
    ENABLE_LIVE_TWITTER_POSTING:"false",
    LINKEDIN_LIVE_POSTING_ENABLED:"false",
    NODE_ENV:"test",
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const status = await fetch(`${baseUrl}/api/x/status`);
  assert.equal(status.status, 401, "anonymous Twitter / X status should remain protected");
  assert.equal((await status.json()).error, "Authentication required.", "anonymous status should return the protected API auth error");

  const connect = await fetch(`${baseUrl}/api/x/connect?format=json`);
  assert.equal(connect.status, 401, "anonymous Twitter / X connect JSON route should remain protected");
  assert.equal((await connect.json()).error, "Authentication required.", "anonymous connect should return the protected API auth error");

  const ownerConnect = await fetch(`${baseUrl}/api/x/connect?format=json`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(ownerConnect.status, 200, "owner-authenticated Twitter / X connect should start OAuth when setup is present");
  const ownerConnectJson = await ownerConnect.json();
  assert.equal(ownerConnectJson.livePostingEnabled, false, "Twitter / X connect should not enable live posting");
  const authorizationUrl = new URL(ownerConnectJson.authorizationUrl);
  assert.match(authorizationUrl.hostname, /twitter\.com|x\.com/, "Twitter / X authorization URL should use the provider authorization host");
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code", "Twitter / X connect should use OAuth authorization code flow");
  assert.ok(authorizationUrl.searchParams.get("code_challenge"), "Twitter / X connect should include a PKCE code challenge");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256", "Twitter / X connect should use S256 PKCE");
  const stateParam = authorizationUrl.searchParams.get("state");
  assert.ok(stateParam, "Twitter / X connect should include signed OAuth state");
  const [encoded] = stateParam.split(".");
  const statePayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal(statePayload.platform, "x", "OAuth state should be scoped to Twitter / X");
  assert.equal(statePayload.ownerStarted, true, "OAuth state should prove owner/admin started the flow");
  assert.equal(statePayload.startedByRole, "owner", "OAuth state should include the owner/admin role marker");
  assert.equal(statePayload.returnTarget, "settings", "OAuth state should carry the Settings return target");
  assert.ok(statePayload.codeVerifierEncrypted, "OAuth state should carry encrypted PKCE verifier material");
  assert.ok(!JSON.stringify(ownerConnectJson).includes(clientSecret), "client secret should not appear in connect output");

  const missingState = await fetch(`${baseUrl}/api/x/callback?code=fake-code`, { redirect:"manual" });
  assertSettingsRedirect(missingState, "Twitter / X connection expired. Try again from Settings.", "missing callback state");

  const invalidState = await fetch(`${baseUrl}/api/x/callback?code=fake-code&state=not-valid`, { redirect:"manual" });
  assertSettingsRedirect(invalidState, "Twitter / X connection expired. Try again from Settings.", "invalid callback state");

  const validStateWithoutOwner = signedState();
  const missingOwner = await fetch(`${baseUrl}/api/x/callback?code=fake-code&state=${encodeURIComponent(validStateWithoutOwner)}`, { redirect:"manual" });
  assertSettingsRedirect(missingOwner, "Sign in as owner, then reconnect Twitter / X.", "callback without owner-start proof");

  const expiredOwnerState = signedState({
    ownerStarted:true,
    startedByRole:"owner",
    codeVerifierEncrypted:statePayload.codeVerifierEncrypted,
    issuedAt: Date.now() - 11 * 60 * 1000
  });
  const expiredCallback = await fetch(`${baseUrl}/api/x/callback?code=twitter-x-oauth-test-success&state=${encodeURIComponent(expiredOwnerState)}`, { redirect:"manual" });
  assertSettingsRedirect(expiredCallback, "Twitter / X connection expired. Try again from Settings.", "expired owner-started callback");

  const cancelled = await fetch(`${baseUrl}/api/x/callback?error=access_denied&state=${encodeURIComponent(stateParam)}`, { redirect:"manual" });
  assertSettingsRedirect(cancelled, "Twitter / X connection was cancelled. Try again from Settings.", "cancelled callback");

  const notConnectedYet = await fetch(`${baseUrl}/api/x/status`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal((await notConnectedYet.json()).connected, false, "failed callback states should not store a Twitter / X connection");

  const ownerStartedCallback = await fetch(`${baseUrl}/api/x/callback?code=twitter-x-oauth-test-success&state=${encodeURIComponent(stateParam)}`, { redirect:"manual" });
  assertSettingsRedirect(ownerStartedCallback, "Twitter / X connected. Live posting remains off.", "owner-started callback without owner cookie");

  const connectedStatus = await fetch(`${baseUrl}/api/x/status`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(connectedStatus.status, 200, "owner should be able to read Twitter / X status after callback");
  const connectedJson = await connectedStatus.json();
  assert.equal(connectedJson.connected, true, "valid owner-started callback should store the Twitter / X connection");
  assert.equal(connectedJson.livePostingEnabled, false, "successful Twitter / X connection should not enable live posting");
  assert.ok(!JSON.stringify(connectedJson).includes("twitter-x-oauth-test-access-token"), "status output must not expose stored access tokens");

  const refreshedRoot = await fetch(`${baseUrl}/`, { headers:{ "x-command-center-token":ownerToken } });
  assert.equal(refreshedRoot.status, 200, "owner root shell should load after Twitter / X connection");
  const refreshedHtml = await refreshedRoot.text();
  assert.match(refreshedHtml, /Twitter \/ X[\s\S]{0,500}Connected/, "Settings/root shell should read persisted Twitter / X connection after refresh");
  assert.ok(!refreshedHtml.includes("twitter-x-oauth-test-access-token"), "root shell must not expose stored Twitter / X token");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200, "health endpoint should remain public");
  const healthJson = await health.json();
  assert.equal(healthJson.liveGatesCount, 0, "liveGatesCount should remain 0");
} finally {
  child.kill("SIGTERM");
}

console.log("twitter x oauth callback tests passed.");
