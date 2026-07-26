#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { coreRecordsFromState } from "./storage.mjs";
import { permissionForRequest } from "./access-control.mjs";
import { loginAtBaseUrl } from "./test-support/preview-server-harness.mjs";

const rootDir = process.cwd();
const source = readFileSync(path.join(rootDir, "scripts", "preview-server.mjs"), "utf8");
const accessControlSource = readFileSync(path.join(rootDir, "scripts", "access-control.mjs"), "utf8");
const connectorSource = readFileSync(path.join(rootDir, "scripts", "channel-connectors.mjs"), "utf8");
const port = Number(process.env.TEST_TWITTER_X_OAUTH_CALLBACK_PORT || 3478);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "twitter-x-oauth-callback-owner-token-1234567890";
const adminToken = "twitter-x-oauth-callback-admin-token-1234567890";
const clientSecret = "twitter-x-oauth-callback-secret-1234567890";
const baseHost = new URL(baseUrl).host;
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-twitter-x-oauth-callback-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], socialAccounts:[], soc2AuditLogs:[] }, null, 2));

assert(source.includes('url.pathname === "/api/x/status"'), "Twitter / X status route should exist");
assert(source.includes('url.pathname === "/api/x/connect"'), "Twitter / X connect route should exist");
assert(source.includes('url.pathname === "/api/x/oauth-diagnostics"'), "Twitter / X should expose a protected redacted OAuth diagnostics route");
// PORTED 2026-07-26 (hygiene, extended-test triage). This assertion previously required
// '"/api/x/oauth-diagnostics"' to appear in scripts/access-control.mjs, where the only list
// of literal paths is `publicPaths`. That entry was deliberately REMOVED in commit a7d7362
// because it made a diagnostics endpoint publicly reachable. Satisfying the old assertion
// would have re-opened it, so the assertion is INVERTED: the endpoint must NOT be public,
// and its own owner/admin access decision must still gate it. The live 401 + "owner/admin"
// requiredPermission behaviour is exercised against the running server further down.
assert(!accessControlSource.includes("/api/x/oauth-diagnostics"), "Twitter / X OAuth diagnostics must never be named in access-control.mjs; the only literal-path list there is publicPaths (removed in a7d7362)");
assert.notEqual(permissionForRequest("GET", "/api/x/oauth-diagnostics"), "public", "the top-level route gate must not classify Twitter / X OAuth diagnostics as a public path");
assert.notEqual(permissionForRequest("POST", "/api/x/oauth-diagnostics"), "public", "the top-level route gate must not classify Twitter / X OAuth diagnostics writes as public either");
assert(source.includes("xOAuthDiagnosticsAccessDecision"), "Twitter / X OAuth diagnostics should use its own owner/admin access decision");
const xDiagnosticsRouteIndex = source.indexOf('url.pathname === "/api/x/oauth-diagnostics"');
assert(xDiagnosticsRouteIndex > -1, "Twitter / X OAuth diagnostics route handler should exist");
const xDiagnosticsRouteEnd = source.indexOf("url.pathname ===", xDiagnosticsRouteIndex + 1);
const xDiagnosticsRouteBlock = source.slice(xDiagnosticsRouteIndex, xDiagnosticsRouteEnd > -1 ? xDiagnosticsRouteEnd : undefined);
assert(xDiagnosticsRouteBlock.includes("xOAuthDiagnosticsAccessDecision(request)"), "the Twitter / X OAuth diagnostics route must run its owner/admin access decision on the request");
assert(/if\s*\(!\s*diagnosticsAccess\.ok\)/.test(xDiagnosticsRouteBlock), "the Twitter / X OAuth diagnostics route must return early when the access decision denies, before emitting any payload");
assert(xDiagnosticsRouteBlock.indexOf("xOAuthDiagnosticsPayload") > xDiagnosticsRouteBlock.indexOf("diagnosticsAccess.ok"), "the Twitter / X OAuth diagnostics payload must only be built after the access decision passes");
assert(source.includes('url.pathname === "/api/x/callback"'), "Twitter / X callback route should exist");
assert(source.includes("xAuthorizationUrl({ state"), "Twitter / X connect should create an OAuth authorization URL");
assert(source.includes("verifyOwnerStartedOAuthState(\"x\""), "Twitter / X callback should validate owner-started state");
assert(source.includes("Twitter / X connected. Live posting remains off."), "successful callback should use safe Settings copy");
assert(source.includes("Twitter / X connection could not be saved. Try again from Settings."), "callback should not show connected if persistence read-back fails");
assert(source.includes("persistedXStatus.connected"), "callback should verify persisted Twitter / X status before success redirect");
assert(!source.includes("Tweet Now"), "normal app source should not add Tweet Now controls");
assert(!source.includes("Send to X"), "normal app source should not add Send to X controls");
assert(connectorSource.includes('const X_BROWSER_AUTHORIZATION_URL = "https://x.com/i/oauth2/authorize"'), "Twitter / X browser authorization endpoint should be pinned to x.com");
assert(connectorSource.includes("return `${X_BROWSER_AUTHORIZATION_URL}?${params.toString()}`"), "Twitter / X connect should build from the pinned browser authorization endpoint");
assert(!connectorSource.includes("https://api.twitter.com/2/oauth2/authorize"), "Twitter / X browser authorization should never use the API authorization endpoint");
assert(connectorSource.includes('tokenUrl: "https://api.x.com/2/oauth2/token"'), "Twitter / X token exchange should remain on the API token endpoint");

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
    COMMAND_CENTER_ADMIN_TOKEN:adminToken,
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
let reloadChild = null;

try {
  await waitForServer(child);

  const status = await fetch(`${baseUrl}/api/x/status`);
  assert.equal(status.status, 401, "anonymous Twitter / X status should remain protected");
  assert.equal((await status.json()).error, "Authentication required.", "anonymous status should return the protected API auth error");

  const connect = await fetch(`${baseUrl}/api/x/connect?format=json`);
  assert.equal(connect.status, 401, "anonymous Twitter / X connect JSON route should remain protected");
  assert.equal((await connect.json()).error, "Authentication required.", "anonymous connect should return the protected API auth error");

  // PORTED 2026-07-26 (hygiene, extended-test triage): static `x-command-center-token` headers no
  // longer authenticate, so every owner/admin request below goes through a real login session.
  const staticHeaderAttempt = await fetch(`${baseUrl}/api/x/status`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(staticHeaderAttempt.status, 401, "a static token header must not authenticate; only POST /api/auth/login issues a session");
  const ownerSession = await loginAtBaseUrl(baseUrl, ownerToken);
  assert.equal(ownerSession.role, "owner", "the owner bootstrap credential should log in as owner");
  const adminSession = await loginAtBaseUrl(baseUrl, adminToken);
  assert.equal(adminSession.role, "admin", "the admin bootstrap credential should log in as admin");

  const anonymousDiagnostics = await fetch(`${baseUrl}/api/x/oauth-diagnostics`);
  assert.equal(anonymousDiagnostics.status, 401, "anonymous Twitter / X OAuth diagnostics should remain protected");
  const anonymousDiagnosticsJson = await anonymousDiagnostics.json();
  assert.equal(anonymousDiagnosticsJson.error, "Authentication required.", "anonymous diagnostics should return the protected API auth error");
  // PORTED 2026-07-26 (hygiene, extended-test triage). This used to expect
  // requiredPermission "owner/admin", which was only reachable because the path was listed
  // as public at the top-level gate and therefore fell through to the route's own
  // owner/admin decision. Since a7d7362 removed it from publicPaths, anonymous callers are
  // now stopped EARLIER, by the generic route gate, which reports its own permission name.
  // That is strictly more protection, not less, so the assertion is retightened around what
  // actually matters: the denial must not be "public", and it must leak no diagnostics.
  assert.notEqual(anonymousDiagnosticsJson.requiredPermission, "public", "anonymous Twitter / X diagnostics must be denied by a real permission, never treated as public");
  assert.ok(anonymousDiagnosticsJson.requiredPermission, "the anonymous denial should name the permission that gated it");
  assert.equal(anonymousDiagnosticsJson.actor?.authenticated, false, "the anonymous denial should report an unauthenticated actor");
  for (const leakedField of ["xClientIdConfigured", "xClientIdPrefix", "clientIdPrefixOnly", "authorizeHost", "redirectUri", "scopes", "setupReady"]) {
    assert.equal(anonymousDiagnosticsJson[leakedField], undefined, `anonymous Twitter / X diagnostics denial must not include the ${leakedField} diagnostics field`);
  }

  // PORTED 2026-07-26 (hygiene, extended-test triage). These three blocks put the raw owner
  // BOOTSTRAP CREDENTIAL straight into a `leos_session` cookie. That is no longer a session: the
  // static token registry in scripts/access-control.mjs was emptied as intentional hardening, so a
  // bootstrap credential is accepted only by POST /api/auth/login, which returns an opaque session
  // id. Asserting that the raw credential works as a cookie would be asserting that a long-lived
  // static secret is a valid session cookie — the thing the hardening removed.
  //
  // Inverted: the raw credential must be REJECTED as a cookie, and the real opaque session must be
  // accepted. The duplicate-cookie case is kept, because tolerating a stale cookie ahead of a good
  // one is still a real requirement — it is just expressed with a real session now.
  const rawCredentialCookie = await fetch(`${baseUrl}/api/x/oauth-diagnostics`, {
    headers:{ cookie:`leos_session=${encodeURIComponent(ownerToken)}` }
  });
  assert.equal(rawCredentialCookie.status, 401, "the raw bootstrap credential must not work as a session cookie");

  const browserAuthDiagnostics = await fetch(`${baseUrl}/api/auth/diagnostics`, {
    headers:ownerSession.headers
  });
  assert.equal(browserAuthDiagnostics.status, 200, "an owner session should reach auth diagnostics");

  // ============================================================================================
  // LEFT FAILING DELIBERATELY 2026-07-26 (hygiene, extended-test triage) — REAL PRODUCT BUG.
  //
  // Everything above this line is ported and passing. From here the suite fails because
  // GET /api/x/oauth-diagnostics returns 500 for EVERY authorized owner or admin caller.
  //
  // Root cause: scripts/preview-server.mjs:6590, in the ok:true branch of
  // xOAuthDiagnosticsAccessDecision():
  //
  //     actor: ownerTokenMatched && !actor.authenticated
  //
  // `ownerTokenMatched` is a free variable. It is declared nowhere in the repo — the only
  // occurrence is this read. Any owner/admin request therefore reaches this line and throws a
  // ReferenceError, which the server turns into 500 {"error":"Request failed securely."}
  // (confirmed in the server log as {"status":500,"code":"ReferenceError"}). The endpoint is
  // completely non-functional for its only permitted audience; the anonymous-denial path above
  // never reaches the bug, which is why it went unnoticed.
  //
  // This is NOT test rot, so it is not being ported around. Fixing it means changing product
  // behaviour, which is out of scope for this hygiene pass and is the owner's call: the intended
  // value of `ownerTokenMatched` cannot be inferred safely, because the branch it guards
  // synthesises an owner actor for an UNAUTHENTICATED request
  // (`{ id:"owner", role:"owner", ..., authenticated:true }`) and getting that wrong would grant
  // owner identity to the wrong caller. It needs a deliberate decision, not a guess from a test.
  //
  // The assertions below are the correct expectations and should start passing once the
  // ReferenceError is fixed. Nothing here has been weakened to hide the failure.
  // ============================================================================================
  const duplicateCookieHeader = `leos_session=stale-owner-session; ${ownerSession.cookie}`;
  const duplicateCookieXDiagnostics = await fetch(`${baseUrl}/api/x/oauth-diagnostics`, {
    headers:{ cookie:duplicateCookieHeader }
  });
  assert.notEqual(
    duplicateCookieXDiagnostics.status,
    500,
    "GET /api/x/oauth-diagnostics 500s for every owner/admin caller: `ownerTokenMatched` is an undeclared free variable at scripts/preview-server.mjs:6590, so the ok:true branch of xOAuthDiagnosticsAccessDecision throws a ReferenceError. This is a real product bug, not test rot — see the comment above this assertion."
  );
  assert.equal(duplicateCookieXDiagnostics.status, 200, "Twitter / X diagnostics should still accept a valid owner session when a stale duplicate cookie appears first");

  const ownerConnect = await fetch(`${baseUrl}/api/x/connect?format=json`, {
    headers:ownerSession.headers
  });
  assert.equal(ownerConnect.status, 200, "owner-authenticated Twitter / X connect should start OAuth when setup is present");
  const ownerConnectJson = await ownerConnect.json();
  assert.equal(ownerConnectJson.livePostingEnabled, false, "Twitter / X connect should not enable live posting");
  assert.ok(ownerConnectJson.authorizationUrl.startsWith("https://x.com/i/oauth2/authorize?"), "Twitter / X connect should redirect browsers to the X authorization screen");
  assert.ok(!ownerConnectJson.authorizationUrl.startsWith("https://api.twitter.com/2/oauth2/authorize"), "Twitter / X connect should not redirect browsers to the API authorization endpoint");
  const authorizationUrl = new URL(ownerConnectJson.authorizationUrl);
  assert.equal(authorizationUrl.origin, "https://x.com", "Twitter / X authorization URL should use the browser authorization host");
  assert.equal(authorizationUrl.pathname, "/i/oauth2/authorize", "Twitter / X authorization URL should use the browser authorization path");
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code", "Twitter / X connect should use OAuth authorization code flow");
  assert.ok(authorizationUrl.searchParams.get("client_id"), "Twitter / X connect should include a client id in the provider URL");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), `${baseUrl}/api/x/callback`, "Twitter / X connect should send the exact configured redirect URI");
  const requestedScopes = (authorizationUrl.searchParams.get("scope") || "").split(/\s+/).filter(Boolean);
  assert.deepEqual(requestedScopes, ["tweet.read", "users.read", "offline.access"], "Twitter / X readiness should request read-only account scopes plus offline access");
  assert.ok(!requestedScopes.includes("tweet.write"), "Twitter / X readiness should not request write scope");
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

  const diagnostics = await fetch(`${baseUrl}/api/x/oauth-diagnostics`, {
    headers:ownerSession.headers
  });
  assert.equal(diagnostics.status, 200, "owner should be able to read redacted Twitter / X OAuth diagnostics");
  const diagnosticsJson = await diagnostics.json();
  assert.equal(diagnosticsJson.xClientIdConfigured, true, "diagnostics should report client id presence");
  assert.equal(diagnosticsJson.xClientIdPrefix, "twit", "diagnostics should expose only the first four client id characters");
  assert.equal(diagnosticsJson.authorizeHost, "x.com", "diagnostics should expose the sanitized X authorization host");
  assert.equal(diagnosticsJson.authorizePath, "/i/oauth2/authorize", "diagnostics should expose the sanitized X authorization path");
  assert.equal(diagnosticsJson.redirectUri, `${baseUrl}/api/x/callback`, "diagnostics should expose the configured redirect URI for copy/paste comparison");
  assert.deepEqual(diagnosticsJson.scopes, ["tweet.read", "users.read", "offline.access"], "diagnostics should expose the exact requested OAuth scopes");
  assert.equal(diagnosticsJson.statePresent, true, "diagnostics should verify state is present");
  assert.equal(diagnosticsJson.codeChallengePresent, true, "diagnostics should verify PKCE challenge is present");
  assert.equal(diagnosticsJson.clientIdPrefixOnly, "twitte", "diagnostics should expose only the first six client id characters");
  assert.equal(diagnosticsJson.clientIdLength, "twitter-x-callback-client-id".length, "diagnostics should expose client id length without the value");
  assert.equal(diagnosticsJson.usesOAuth2ClientIdEnvName, "X_CLIENT_ID", "diagnostics should name the OAuth 2.0 client id env var without exposing its value");
  assert.equal(diagnosticsJson.callbackRouteExists, true, "diagnostics should confirm the X callback route exists");
  assert.equal(diagnosticsJson.publicPrivacyRouteExists, true, "diagnostics should confirm the public privacy route exists");
  assert.equal(diagnosticsJson.publicTermsRouteExists, true, "diagnostics should confirm the public terms route exists");
  assert.equal(diagnosticsJson.xClientSecretConfigured, true, "diagnostics should report client secret presence without exposing it");
  assert.equal(diagnosticsJson.xRedirectUriConfigured, true, "diagnostics should report redirect URI presence");
  assert.deepEqual(diagnosticsJson.xRedirectUri, { host:baseHost, path:"/api/x/callback" }, "diagnostics should expose redirect URI host/path only");
  assert.deepEqual(diagnosticsJson.scopesRequested, ["tweet.read", "users.read", "offline.access"], "diagnostics should show read-only connection scopes");
  assert.equal(diagnosticsJson.codeChallengeMethod, "S256", "diagnostics should report S256 PKCE");
  assert.deepEqual(diagnosticsJson.authEndpoint, { host:"x.com", path:"/i/oauth2/authorize" }, "diagnostics should expose provider host/path only");
  assert.equal(`${diagnosticsJson.authEndpoint.host}${diagnosticsJson.authEndpoint.path}`, `${authorizationUrl.host}${authorizationUrl.pathname}`, "diagnostics and connect should use the same Twitter / X authorization endpoint");
  assert.equal(diagnosticsJson.setupReady, true, "diagnostics should report ready setup when env and token storage are configured");
  assert.equal(diagnosticsJson.authorizationUrlShape.responseType, "code", "diagnostics should verify authorization code flow");
  assert.equal(diagnosticsJson.authorizationUrlShape.clientIdPresent, true, "diagnostics should verify the generated URL has a client id");
  assert.equal(diagnosticsJson.authorizationUrlShape.redirectUriMatchesConfigured, true, "diagnostics should verify generated redirect URI matches configuration");
  assert.equal(diagnosticsJson.authorizationUrlShape.statePresent, true, "diagnostics should verify state is present without exposing a real signed state");
  assert.equal(diagnosticsJson.authorizationUrlShape.codeChallengePresent, true, "diagnostics should verify PKCE challenge is present");
  assert.equal(diagnosticsJson.authorizationUrlShape.codeChallengeMethod, "S256", "diagnostics should verify PKCE challenge method");
  assert.equal(diagnosticsJson.xProviderKey, "x", "diagnostics should expose the durable provider key used for storage");
  assert.equal(diagnosticsJson.xStorageBackend, "json", "diagnostics should expose the active storage backend without secrets");
  assert.equal(diagnosticsJson.xTokenRecordPresent, false, "diagnostics should report no X token record before connection");
  assert.equal(diagnosticsJson.xAccessTokenPresent, false, "diagnostics should not report an access token before connection");
  assert.equal(diagnosticsJson.xRefreshTokenPresent, false, "diagnostics should not report a refresh token before connection");
  assert.equal(diagnosticsJson.xConnectionLoadedFromSupabase, false, "local JSON diagnostics should not claim Supabase load");
  assert.equal(diagnosticsJson.xConnectionLoadedFromSession, false, "Twitter / X connection should not be session-backed");
  const diagnosticsText = JSON.stringify(diagnosticsJson);
  assert.ok(!diagnosticsText.includes(clientSecret), "diagnostics must not expose client secret");
  assert.ok(!diagnosticsText.includes("twitter-x-callback-client-id"), "diagnostics must not expose full client id");
  assert.ok(!diagnosticsText.includes(stateParam), "diagnostics must not expose signed state");
  assert.ok(!diagnosticsText.includes(statePayload.codeVerifierEncrypted), "diagnostics must not expose encrypted verifier material");

  const adminDiagnostics = await fetch(`${baseUrl}/api/x/oauth-diagnostics`, {
    headers:adminSession.headers
  });
  assert.equal(adminDiagnostics.status, 200, "admin should be able to read redacted Twitter / X OAuth diagnostics");
  const adminDiagnosticsText = JSON.stringify(await adminDiagnostics.json());
  assert.ok(!adminDiagnosticsText.includes(clientSecret), "admin diagnostics must not expose client secret");
  assert.ok(!adminDiagnosticsText.includes("twitter-x-callback-client-id"), "admin diagnostics must not expose full client id");

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
    headers:ownerSession.headers
  });
  assert.equal((await notConnectedYet.json()).connected, false, "failed callback states should not store a Twitter / X connection");

  const ownerStartedCallback = await fetch(`${baseUrl}/api/x/callback?code=twitter-x-oauth-test-success&state=${encodeURIComponent(stateParam)}`, { redirect:"manual" });
  assertSettingsRedirect(ownerStartedCallback, "Twitter / X connected. Live posting remains off.", "owner-started callback without owner cookie");

  const connectedStatus = await fetch(`${baseUrl}/api/x/status`, {
    headers:ownerSession.headers
  });
  assert.equal(connectedStatus.status, 200, "owner should be able to read Twitter / X status after callback");
  const connectedJson = await connectedStatus.json();
  assert.equal(connectedJson.connected, true, "valid owner-started callback should store the Twitter / X connection");
  assert.equal(connectedJson.livePostingEnabled, false, "successful Twitter / X connection should not enable live posting");
  assert.equal(connectedJson.providerKey, "x", "Twitter / X status should use the same durable provider key as callback and health");
  assert.equal(connectedJson.storageBackend, "json", "Twitter / X status should expose storage backend without secrets");
  assert.equal(connectedJson.connectionLoadedFromSession, false, "Twitter / X status should not depend on browser session storage");
  assert.ok(!JSON.stringify(connectedJson).includes("twitter-x-oauth-test-access-token"), "status output must not expose stored access tokens");

  const refreshedRoot = await fetch(`${baseUrl}/`, { headers:ownerSession.headers });
  assert.equal(refreshedRoot.status, 200, "owner root shell should load after Twitter / X connection");
  const refreshedHtml = await refreshedRoot.text();
  assert.match(refreshedHtml, /Twitter \/ X[\s\S]{0,500}Connected/, "Settings/root shell should read persisted Twitter / X connection after refresh");
  assert.ok(!refreshedHtml.includes("twitter-x-oauth-test-access-token"), "root shell must not expose stored Twitter / X token");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200, "health endpoint should remain public");
  const healthJson = await health.json();
  assert.equal(healthJson.xConnected, true, "health should read persisted Twitter / X connection state");
  assert.equal(healthJson.liveGatesCount, 0, "liveGatesCount should remain 0");
  assert.ok(!JSON.stringify(healthJson).includes("twitter-x-oauth-test-access-token"), "health must not expose stored Twitter / X access tokens");

  const persisted = JSON.parse(await readFile(dataPath, "utf8"));
  persisted.socialAccounts = (persisted.socialAccounts || []).map((account) =>
    account.platform === "x"
      ? {
          ...account,
          status:"connected",
          tokenExpiresAt:"2026-01-01T00:00:00.000Z",
          lastTestMessage:"Twitter / X connected with expired access token test fixture."
        }
      : account
  );
  await writeFile(dataPath, JSON.stringify(persisted, null, 2));

  const expiredStatus = await fetch(`${baseUrl}/api/x/status`, {
    headers:ownerSession.headers
  });
  const expiredStatusJson = await expiredStatus.json();
  assert.equal(expiredStatusJson.connected, true, "expired X access token with refresh token should still be treated as a durable connection");
  assert.equal(expiredStatusJson.status, "Needs refresh", "expired X access token with refresh token should show a refresh state instead of disconnecting");
  assert.equal(expiredStatusJson.needsReconnectReason, "", "refreshable X token should not ask Roger to reconnect");
  assert.match(expiredStatusJson.connectedComputedReason, /refresh token/i, "status should explain that refresh token preserves the connection");

  const expiredDiagnostics = await fetch(`${baseUrl}/api/x/oauth-diagnostics`, {
    headers:ownerSession.headers
  });
  const expiredDiagnosticsJson = await expiredDiagnostics.json();
  assert.equal(expiredDiagnosticsJson.xTokenRecordPresent, true, "diagnostics should report persisted X token record");
  assert.equal(expiredDiagnosticsJson.xAccessTokenPresent, true, "diagnostics should report access token presence without exposing it");
  assert.equal(expiredDiagnosticsJson.xRefreshTokenPresent, true, "diagnostics should report refresh token presence without exposing it");
  assert.equal(expiredDiagnosticsJson.xTokenExpiresAtPresent, true, "diagnostics should report token expiry metadata");
  assert.equal(expiredDiagnosticsJson.xAccountIdPresent, true, "diagnostics should report account id presence without the value");
  assert.equal(expiredDiagnosticsJson.xUsernamePresent, true, "diagnostics should report username/account label presence without the value");
  assert.equal(expiredDiagnosticsJson.xNeedsReconnectReason, "", "diagnostics should not request reconnect when refresh token exists");
  assert.match(expiredDiagnosticsJson.xConnectedComputedReason, /refresh token/i, "diagnostics should explain durable refresh-token read-back");
  const expiredDiagnosticsText = JSON.stringify(expiredDiagnosticsJson);
  assert.ok(!expiredDiagnosticsText.includes("twitter-x-oauth-test-refresh-token"), "diagnostics must not expose stored refresh tokens");
  assert.ok(!expiredDiagnosticsText.includes("twitter-x-oauth-test-access-token"), "diagnostics must not expose stored access tokens");

  child.kill("SIGTERM");
  reloadChild = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT:String(port + 1),
      COMMAND_CENTER_REQUIRE_AUTH:"true",
      COMMAND_CENTER_OWNER_TOKEN:ownerToken,
      COMMAND_CENTER_ADMIN_TOKEN:adminToken,
      LOCAL_DEMO_MODE:"true",
      STORAGE_BACKEND:"json",
      COMMAND_CENTER_DATA_PATH:dataPath,
      COMMAND_CENTER_SEED_PATH:seedPath,
      X_CLIENT_ID:"twitter-x-callback-client-id",
      X_CLIENT_SECRET:clientSecret,
      X_REDIRECT_URI:`http://127.0.0.1:${port + 1}/api/x/callback`,
      OAUTH_TOKEN_ENCRYPTION_KEY:"twitter-x-oauth-callback-encryption-key-1234567890",
      ENABLE_LIVE_X_POSTING:"false",
      ENABLE_LIVE_TWITTER_POSTING:"false",
      LINKEDIN_LIVE_POSTING_ENABLED:"false",
      NODE_ENV:"test",
      NODE_DISABLE_COMPILE_CACHE:"1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(reloadChild);
  const reloadBaseUrl = `http://127.0.0.1:${port + 1}`;
  const reloadedStatus = await fetch(`${reloadBaseUrl}/api/x/status`, {
    headers:ownerSession.headers
  });
  const reloadedStatusJson = await reloadedStatus.json();
  assert.equal(reloadedStatusJson.connected, true, "Twitter / X connection should survive server restart/reload");
  assert.equal(reloadedStatusJson.status, "Needs refresh", "reloaded expired X token with refresh token should still show needs refresh");
} finally {
  child.kill("SIGTERM");
  if (reloadChild) reloadChild.kill("SIGTERM");
}

console.log("twitter x oauth callback tests passed.");
