#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { coreRecordsFromState } from "./storage.mjs";
import { loginAtBaseUrl } from "./test-support/preview-server-harness.mjs";

const rootDir = process.cwd();
const source = readFileSync(path.join(rootDir, "scripts", "preview-server.mjs"), "utf8");
const port = Number(process.env.TEST_LINKEDIN_OAUTH_CALLBACK_PORT || 3468);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "linkedin-oauth-callback-owner-token-1234567890";
const clientSecret = "linkedin-oauth-callback-secret-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-linkedin-oauth-callback-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], socialAccounts:[], soc2AuditLogs:[] }, null, 2));

assert(source.includes("linkedinConnectorBannerHtml"), "Settings should render a dedicated LinkedIn callback banner");
assert(source.includes("LinkedIn was not connected. Sign in as owner, then try again."), "failed owner callback should make the not-connected state obvious");
assert(source.includes("LinkedIn connected. Live posting remains off."), "successful callback should show connected state and live-posting safety");
assert(source.includes("LinkedIn connection could not be saved. Try again from Settings."), "callback should not show connected if persistence cannot read the connection back");
assert(source.includes("persistedLinkedInStatus.connected"), "callback should verify persisted LinkedIn status before success redirect");
assert(source.includes("linkedin-return-note"), "LinkedIn row should include a return-state note near the row");
assert(source.includes("bottom:128px"), "toast should sit above the Le-E bubble instead of overlapping it");

const persistedSocialAccountRows = coreRecordsFromState({
  socialAccounts: [
    {
      id: "channel-linkedin",
      platform: "linkedin",
      status: "connected",
      accessTokenEncrypted: "v1.redacted"
    }
  ]
}).filter((row) => row.collection === "socialAccounts");
assert.equal(persistedSocialAccountRows.length, 1, "Supabase persistence should include social accounts so LinkedIn remains connected after refresh");

function signedState({ platform = "linkedin", issuedAt = Date.now(), ownerStarted = false, startedByRole = "" } = {}) {
  const payload = {
    platform,
    nonce: "callback-test-nonce",
    issuedAt,
    ...(ownerStarted ? { ownerStarted:true, startedByRole, returnTarget:"settings" } : {})
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
    NODE_ENV:"test",
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

  // PORTED 2026-07-26 (hygiene, extended-test triage). Every owner-authenticated request in this
  // suite used a static `x-command-center-token` header. That stopped authenticating when the static
  // token registry in scripts/access-control.mjs was emptied as intentional hardening: bootstrap
  // credentials are now accepted only by POST /api/auth/login, which returns an opaque HttpOnly
  // session. The header requests were therefore being treated as anonymous and getting 401s. Ported
  // to the real login flow; the anonymous-protection assertions above are untouched, and this adds
  // a check that the bootstrap credential is still refused as a bearer-style header credential.
  const staticHeaderAttempt = await fetch(`${baseUrl}/api/linkedin/status`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(staticHeaderAttempt.status, 401, "a static token header must not authenticate; only POST /api/auth/login issues a session");
  const ownerSession = await loginAtBaseUrl(baseUrl, ownerToken);
  assert.equal(ownerSession.role, "owner", "the bootstrap credential should log in as owner");

  const ownerConnect = await fetch(`${baseUrl}/api/linkedin/connect?format=json`, {
    headers:ownerSession.headers
  });
  assert.equal(ownerConnect.status, 200, "owner-authenticated LinkedIn connect should start OAuth");
  const ownerConnectJson = await ownerConnect.json();
  const stateParam = new URL(ownerConnectJson.authorizationUrl).searchParams.get("state");
  assert.ok(stateParam, "owner connect should include signed OAuth state");
  const [encoded] = stateParam.split(".");
  const statePayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal(statePayload.platform, "linkedin", "OAuth state should be scoped to LinkedIn");
  assert.equal(statePayload.ownerStarted, true, "OAuth state should prove owner/admin started the flow");
  assert.equal(statePayload.startedByRole, "owner", "OAuth state should include the owner/admin role marker");
  assert.equal(statePayload.returnTarget, "settings", "OAuth state should carry the Settings return target");

  // PORTED 2026-07-26 (hygiene, extended-test triage). The OAuth callback contract was deliberately
  // hardened and no longer redirects failures back to Settings with a founder-facing message. Every
  // callback now requires BOTH an authenticated owner session and a state that is signed, expiring,
  // session-bound and single-use (the guarantee the public privacy page advertises). Anything else
  // fails closed with `400 {"error":"OAuth callback rejected."}` instead of a 302.
  //
  // The old assertions demanded the friendly redirects, which means they demanded a callback that
  // accepts a self-signed state with no session. Satisfying them would have re-opened exactly the
  // hole the hardening closed, so they are inverted to assert the fail-closed rejection. Two
  // guarantees the old suite could not express are added: a validly signed owner-started state is
  // still rejected without a session, and a state cannot be replayed.
  async function assertCallbackRejected(query, label, headers = {}) {
    const rejected = await fetch(`${baseUrl}/api/linkedin/callback?${query}`, { redirect:"manual", headers });
    assert.equal(rejected.status, 400, `${label} should fail closed with 400, not redirect`);
    assert.deepEqual(await rejected.json(), { error:"OAuth callback rejected." }, `${label} should return the generic rejection without leaking why`);
  }

  await assertCallbackRejected("code=fake-code", "missing callback state");
  await assertCallbackRejected("code=fake-code&state=not-valid", "invalid callback state");
  await assertCallbackRejected("code=fake-code&state=abc.def", "malformed callback state");
  await assertCallbackRejected(`code=fake-code&state=${encodeURIComponent(signedState())}`, "signed state without owner-start proof");
  await assertCallbackRejected("code=fake-code&state=not-valid", "owner-session callback with invalid state", ownerSession.headers);
  await assertCallbackRejected(
    `code=linkedin-oauth-test-success&state=${encodeURIComponent(signedState({ ownerStarted:true, startedByRole:"owner", issuedAt: Date.now() - 11 * 60 * 1000 }))}`,
    "expired owner-started state",
    ownerSession.headers
  );
  // The state is session-bound: a correctly signed, unexpired, owner-started state must still be
  // refused when it is presented without the session that started the flow.
  await assertCallbackRejected(
    `code=linkedin-oauth-test-success&state=${encodeURIComponent(signedState({ ownerStarted:true, startedByRole:"owner" }))}`,
    "owner-started state presented without the owner session"
  );

  const notConnectedYet = await fetch(`${baseUrl}/api/linkedin/status`, {
    headers:ownerSession.headers
  });
  assert.equal((await notConnectedYet.json()).connected, false, "rejected callback states should not store a LinkedIn connection");

  // The only accepted path: the state minted by this owner session's own /connect call, replayed
  // once, from that same session.
  const ownerStartedCallback = await fetch(`${baseUrl}/api/linkedin/callback?code=linkedin-oauth-test-success&state=${encodeURIComponent(stateParam)}`, {
    redirect:"manual",
    headers:ownerSession.headers
  });
  assertSettingsRedirect(ownerStartedCallback, "LinkedIn connected. Live posting remains off.", "owner-started callback from the session that began the flow");

  // Single-use: the same state must not work twice.
  await assertCallbackRejected(`code=linkedin-oauth-test-success&state=${encodeURIComponent(stateParam)}`, "replayed callback state", ownerSession.headers);

  const connectedStatus = await fetch(`${baseUrl}/api/linkedin/status`, {
    headers:ownerSession.headers
  });
  assert.equal(connectedStatus.status, 200, "owner should be able to read LinkedIn status after callback");
  const connectedJson = await connectedStatus.json();
  assert.equal(connectedJson.connected, true, "valid owner-started callback should store the LinkedIn connection");
  assert.equal(connectedJson.livePostingEnabled, false, "successful connection should not enable live posting");

  // /api/health was minimised in d146413; liveGatesCount is no longer published to anonymous
  // callers, so this asserts the minimisation rather than reading a value that must not be public.
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200, "health endpoint should remain public");
  const healthJson = await health.json();
  assert.deepEqual(Object.keys(healthJson), ["status"], "public /api/health must stay minimised");
  assert.equal(healthJson.liveGatesCount, undefined, "public /api/health must not publish live gate counts");
} finally {
  child.kill("SIGTERM");
}

console.log("linkedin oauth callback tests passed.");
