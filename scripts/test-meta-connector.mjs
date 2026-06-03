#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const source = readFileSync(path.join(rootDir, "scripts", "preview-server.mjs"), "utf8");
const connectorSource = readFileSync(path.join(rootDir, "scripts", "channel-connectors.mjs"), "utf8");
const port = Number(process.env.TEST_META_CONNECTOR_PORT || 3486);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "meta-connector-owner-token-1234567890";
const metaSecret = "meta-connector-secret-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-meta-connector-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], socialAccounts:[], soc2AuditLogs:[] }, null, 2));

assert(source.includes('url.pathname === "/api/meta/status"'), "Meta status route should exist");
assert(source.includes('url.pathname === "/api/meta/start"'), "Meta OAuth start route should exist");
assert(source.includes('url.pathname === "/api/meta/callback"'), "Meta OAuth callback route should exist");
assert(source.includes('url.pathname === "/api/meta/pages"'), "Meta account discovery route should exist");
assert(source.includes('url.pathname === "/api/meta/select-account"'), "Meta account selection route should exist");
assert(source.includes('url.pathname === "/api/meta/diagnostics"'), "Meta safe diagnostics route should exist");
assert(source.includes("verifyOwnerStartedOAuthState(\"meta\""), "Meta callback should validate owner-started OAuth state");
assert(source.includes("SOCIAL_PUBLIC_ASSETS_BUCKET"), "Public image hosting should prefer SOCIAL_PUBLIC_ASSETS_BUCKET");
assert(source.includes('"social-public-assets"'), "Public image hosting should use social-public-assets as the fallback bucket");
assert(source.includes("social-posts/"), "Public image uploads should store objects under social-posts/{postId}");
assert(source.includes("public_image_url"), "Public image persistence should include the snake_case public_image_url field");
assert(source.includes("validatePublicSocialImageUrl"), "Meta image publishing should validate external HTTPS image URLs");
assert(connectorSource.includes("metaOAuthScopes"), "Meta OAuth scopes should be centralized");
assert(connectorSource.includes("instagram_business_content_publish"), "Meta OAuth should request Instagram Business publishing readiness scope");
assert(!connectorSource.includes("META_CLIENT_SECRET || META_APP_SECRET || \"\"; console"), "Meta code should not log secrets");

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
  assert.equal(response.status, 302, `${label} should redirect back to Settings`);
  const location = response.headers.get("location") || "";
  assert.match(location, /#settings$/, `${label} should return to Settings`);
  assert.match(decodeURIComponent(location), new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} should include clear Settings copy`);
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
    META_CLIENT_ID:"meta-connector-client-id",
    META_CLIENT_SECRET:metaSecret,
    META_REDIRECT_URI:`${baseUrl}/api/meta/callback`,
    OAUTH_TOKEN_ENCRYPTION_KEY:"meta-connector-encryption-key-1234567890",
    SOCIAL_PUBLIC_ASSETS_BUCKET:"social-public-assets",
    ENABLE_LIVE_FACEBOOK_POSTING:"false",
    ENABLE_LIVE_INSTAGRAM_POSTING:"false",
    LINKEDIN_LIVE_POSTING_ENABLED:"false",
    NODE_ENV:"test",
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const anonymousStatus = await fetch(`${baseUrl}/api/meta/status`);
  assert.equal(anonymousStatus.status, 401, "anonymous Meta status should remain protected");
  assert.equal((await anonymousStatus.json()).error, "Authentication required.", "anonymous Meta status should return the protected API auth error");

  const anonymousStart = await fetch(`${baseUrl}/api/meta/start?format=json`);
  assert.equal(anonymousStart.status, 401, "anonymous Meta start should remain protected");
  assert.equal((await anonymousStart.json()).error, "Authentication required.", "anonymous Meta start should return the protected API auth error");

  const anonymousDiagnostics = await fetch(`${baseUrl}/api/meta/diagnostics`);
  assert.equal(anonymousDiagnostics.status, 401, "anonymous Meta diagnostics should remain protected");

  const ownerStatusBefore = await fetch(`${baseUrl}/api/meta/status`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(ownerStatusBefore.status, 200, "owner should be able to read Meta status");
  const ownerStatusBeforeJson = await ownerStatusBefore.json();
  assert.equal(ownerStatusBeforeJson.status, "Ready to connect", "Meta should be ready to connect when env and token storage are configured");
  assert.equal(ownerStatusBeforeJson.livePostingEnabled, false, "Meta status should keep live posting off");

  const diagnostics = await fetch(`${baseUrl}/api/meta/diagnostics`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(diagnostics.status, 200, "owner should be able to read safe Meta diagnostics");
  const diagnosticsJson = await diagnostics.json();
  assert.equal(diagnosticsJson.authorizeHost, "www.facebook.com", "Meta diagnostics should show the browser OAuth host only");
  assert.equal(diagnosticsJson.authorizePath, "/v24.0/dialog/oauth", "Meta diagnostics should show the browser OAuth path only");
  assert.equal(diagnosticsJson.redirectUri, `${baseUrl}/api/meta/callback`, "Meta diagnostics should expose the configured redirect URI for comparison");
  assert.equal(diagnosticsJson.clientIdPrefixOnly, "meta-c", "Meta diagnostics should expose only a short client id prefix");
  assert.equal(diagnosticsJson.clientIdLength, "meta-connector-client-id".length, "Meta diagnostics should expose client id length without the full value");
  assert.equal(diagnosticsJson.metaClientSecretConfigured, true, "Meta diagnostics should report secret presence as a boolean only");
  assert.equal(diagnosticsJson.setupReady, true, "Meta diagnostics should report setup readiness");
  assert.deepEqual(diagnosticsJson.authorizationUrlShape.scopesRequested, [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "instagram_business_basic",
    "instagram_business_content_publish"
  ], "Meta diagnostics should expose the requested account/readiness scopes");
  const diagnosticsText = JSON.stringify(diagnosticsJson);
  assert.ok(!diagnosticsText.includes(metaSecret), "Meta diagnostics must not expose the client secret");
  assert.ok(!diagnosticsText.includes("meta-connector-client-id"), "Meta diagnostics must not expose the full client id");
  assert.ok(!diagnosticsText.includes("meta-oauth-test"), "Meta diagnostics must not expose test tokens");

  const ownerStart = await fetch(`${baseUrl}/api/meta/start?format=json`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(ownerStart.status, 200, "owner-authenticated Meta start should generate an OAuth URL");
  const ownerStartJson = await ownerStart.json();
  assert.equal(ownerStartJson.livePostingEnabled, false, "Meta OAuth start should not enable live posting");
  assert.ok(ownerStartJson.authorizationUrl.startsWith("https://www.facebook.com/v24.0/dialog/oauth?"), "Meta start should use the Facebook browser OAuth dialog");
  const authUrl = new URL(ownerStartJson.authorizationUrl);
  assert.equal(authUrl.searchParams.get("response_type"), "code", "Meta OAuth should use authorization code flow");
  assert.equal(authUrl.searchParams.get("client_id"), "meta-connector-client-id", "Meta OAuth URL should include the configured client id");
  assert.equal(authUrl.searchParams.get("redirect_uri"), `${baseUrl}/api/meta/callback`, "Meta OAuth URL should use the exact configured callback");
  assert.ok(authUrl.searchParams.get("state"), "Meta OAuth URL should include signed state");
  assert.deepEqual((authUrl.searchParams.get("scope") || "").split(","), [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "instagram_business_basic",
    "instagram_business_content_publish"
  ], "Meta OAuth URL should include the expected scopes");
  assert.ok(!JSON.stringify(ownerStartJson).includes(metaSecret), "Meta OAuth start must not expose the client secret");

  const missingState = await fetch(`${baseUrl}/api/meta/callback?code=fake-code`, { redirect:"manual" });
  assertSettingsRedirect(missingState, "Meta connection expired. Try again from Settings.", "missing state callback");

  const stateParam = authUrl.searchParams.get("state");
  const cancelled = await fetch(`${baseUrl}/api/meta/callback?error=access_denied&state=${encodeURIComponent(stateParam)}`, { redirect:"manual" });
  assertSettingsRedirect(cancelled, "Meta connection was cancelled. Try again from Settings.", "cancelled callback");

  const success = await fetch(`${baseUrl}/api/meta/callback?code=meta-oauth-test-success&state=${encodeURIComponent(stateParam)}`, { redirect:"manual" });
  assertSettingsRedirect(success, "Meta connected. Select a Facebook Page and Instagram Business account in Settings. Live posting remains off.", "successful callback");

  const pages = await fetch(`${baseUrl}/api/meta/pages`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  assert.equal(pages.status, 200, "owner should be able to discover sanitized Meta pages");
  const pagesJson = await pages.json();
  assert.equal(pagesJson.pages.length, 1, "Meta page discovery should return sanitized pages");
  assert.equal(pagesJson.pages[0].id, "meta-page-1", "Meta page discovery should include the Page id");
  assert.equal(pagesJson.pages[0].instagramBusinessAccount.id, "meta-ig-1", "Meta page discovery should include linked Instagram Business id");
  assert.ok(!JSON.stringify(pagesJson).includes("meta-oauth-test-page-token"), "Meta pages response must not expose page access tokens");

  const selected = await fetch(`${baseUrl}/api/meta/select-account`, {
    method:"POST",
    headers:{ "content-type":"application/json", "x-command-center-token":ownerToken },
    body:JSON.stringify({ facebookPageId:"meta-page-1" })
  });
  assert.equal(selected.status, 200, "owner should be able to select a Meta Page");
  const selectedJson = await selected.json();
  assert.equal(selectedJson.livePostingEnabled, false, "Meta selection should not enable live posting");
  assert.equal(selectedJson.page.id, "meta-page-1", "Meta selection should return the selected sanitized Page");
  assert.equal(selectedJson.instagramBusinessAccount.id, "meta-ig-1", "Meta selection should return the selected sanitized Instagram Business account");
  const selectedText = JSON.stringify(selectedJson);
  assert.ok(!selectedText.includes("meta-oauth-test-page-token"), "Meta selection response must not expose page access tokens");
  assert.ok(!selectedText.includes("meta-oauth-test-user-token"), "Meta selection response must not expose user access tokens");

  const ownerStatusAfter = await fetch(`${baseUrl}/api/meta/status`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  const ownerStatusAfterJson = await ownerStatusAfter.json();
  assert.equal(ownerStatusAfterJson.facebookConnected, true, "Meta status should read selected Facebook Page as connected");
  assert.equal(ownerStatusAfterJson.instagramConnected, true, "Meta status should read selected Instagram Business as connected");
  assert.equal(ownerStatusAfterJson.livePostingEnabled, false, "Meta status after selection should keep live posting off");

  const stateResponse = await fetch(`${baseUrl}/api/state`, {
    headers:{ "x-command-center-token":ownerToken }
  });
  const stateJson = await stateResponse.json();
  const facebook = stateJson.socialAccounts.find(account => account.platform === "facebook");
  const instagram = stateJson.socialAccounts.find(account => account.platform === "instagram");
  assert.equal(facebook.status, "connected", "public state should show the selected Facebook Page as connected");
  assert.equal(instagram.status, "connected", "public state should show the selected Instagram account as connected");
  assert.equal(facebook.hasStoredToken, true, "public state should report token presence without exposing the token");
  assert.equal(instagram.hasStoredToken, true, "public state should report token presence without exposing the token");
  assert.ok(!JSON.stringify(stateJson).includes("accessTokenEncrypted"), "public state must not expose encrypted token fields");
  assert.ok(!JSON.stringify(stateJson).includes("meta-oauth-test"), "public state must not expose raw token values");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200, "/api/health should remain public");
  const healthJson = await health.json();
  assert.equal(healthJson.liveGatesCount, 0, "liveGatesCount should remain zero");
  assert.equal(healthJson.metaOAuthConfigured, true, "health should expose safe Meta setup readiness");
  assert.equal(healthJson.metaConnected, true, "health should expose safe Meta connection state");
  assert.equal(healthJson.facebookConnected, true, "health should expose safe Facebook connection state");
  assert.equal(healthJson.instagramConnected, true, "health should expose safe Instagram connection state");
  assert.equal(healthJson.metaLivePostingEnabled, false, "health should keep Meta live posting disabled");
  assert.equal(healthJson.socialPublicAssetsBucket, "social-public-assets", "health should expose the configured public assets bucket name");
} finally {
  child.kill("SIGTERM");
}

console.log("Meta connector readiness checks passed.");
