import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.TEST_PUBLIC_LEGAL_PAGES_PORT || 3489);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "public-legal-pages-owner-token-1234567890";
const fakeSecret = "public-legal-pages-secret-must-not-render";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-public-legal-pages-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({ settings:{}, posts:[], contentBank:[], socialAccounts:[], soc2AuditLogs:[] }, null, 2));

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

function assertPublicHtml(response, html, title) {
  assert.equal(response.status, 200, `${title} should return 200 for anonymous users`);
  assert.match(response.headers.get("content-type") || "", /text\/html/i, `${title} should return HTML`);
  assert.match(html, /<!doctype html>/i, `${title} should be a full HTML document`);
  assert.match(html, /LegalEase/, `${title} should use the LegalEase public header`);
  assert.doesNotMatch(html, /"Authentication required|Authentication required/i, `${title} should not render a JSON auth error`);
  assert.doesNotMatch(html, /COMMAND_CENTER_OWNER_TOKEN|X_CLIENT_SECRET|LINKEDIN_CLIENT_SECRET|OAUTH_TOKEN_ENCRYPTION_KEY/i, `${title} should not expose env var names`);
  assert.doesNotMatch(html, /api key/i, `${title} should not expose raw credential language`);
  assert.ok(!html.includes(fakeSecret), `${title} should not expose configured secret values`);
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT:String(port),
    COMMAND_CENTER_REQUIRE_AUTH:"true",
    COMMAND_CENTER_OWNER_TOKEN:ownerToken,
    LINKEDIN_CLIENT_SECRET:fakeSecret,
    X_CLIENT_SECRET:fakeSecret,
    OAUTH_TOKEN_ENCRYPTION_KEY:fakeSecret,
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

  const privacy = await fetch(`${baseUrl}/privacy`);
  const privacyHtml = await privacy.text();
  assertPublicHtml(privacy, privacyHtml, "Privacy Policy");
  assert.match(privacyHtml, /Privacy Policy/, "privacy page should include its page title");
  assert.match(privacyHtml, /LegalEase Command Center is used by LegalEase to manage internal operations and approved social media workflows\./, "privacy page should explain Command Center use");
  assert.match(privacyHtml, /Connected account tokens may be stored securely and encrypted\./, "privacy page should explain secure connected account token storage");
  assert.match(privacyHtml, /The app does not sell personal information\./, "privacy page should include no-sale language");
  assert.match(privacyHtml, /The app does not resell X data\./, "privacy page should include X data resale language");
  assert.match(privacyHtml, /Live posting remains disabled unless separately authorized by LegalEase\./, "privacy page should keep live posting safety language");

  const privacyHead = await fetch(`${baseUrl}/privacy`, { method:"HEAD" });
  assert.equal(privacyHead.status, 200, "anonymous HEAD /privacy should return valid headers");
  assert.match(privacyHead.headers.get("content-type") || "", /text\/html/i, "anonymous HEAD /privacy should advertise HTML");

  const terms = await fetch(`${baseUrl}/terms`);
  const termsHtml = await terms.text();
  assertPublicHtml(terms, termsHtml, "Terms of Service");
  assert.match(termsHtml, /Terms of Service/, "terms page should include its page title");
  assert.match(termsHtml, /The Command Center is an internal operations tool for LegalEase\./, "terms page should state app purpose");
  assert.match(termsHtml, /Users must be authorized by LegalEase\./, "terms page should state authorized-use requirement");
  assert.match(termsHtml, /Users may not misuse, resell, scrape, or redistribute data from connected platforms\./, "terms page should include platform-data misuse rule");
  assert.match(termsHtml, /Connecting social accounts does not enable automatic live posting\./, "terms page should include social account safety language");
  assert.match(termsHtml, /Any publishing, sending, or filing features must remain subject to separate authorization and safety controls\./, "terms page should include approval control language");

  const termsHead = await fetch(`${baseUrl}/terms`, { method:"HEAD" });
  assert.equal(termsHead.status, 200, "anonymous HEAD /terms should return valid headers");
  assert.match(termsHead.headers.get("content-type") || "", /text\/html/i, "anonymous HEAD /terms should advertise HTML");

  const xDiagnostics = await fetch(`${baseUrl}/api/x/oauth-diagnostics`);
  assert.equal(xDiagnostics.status, 401, "anonymous X OAuth diagnostics should remain protected");
  assert.equal((await xDiagnostics.json()).error, "Authentication required.", "X OAuth diagnostics should return protected auth JSON");

  const linkedinStatus = await fetch(`${baseUrl}/api/linkedin/status`);
  assert.equal(linkedinStatus.status, 401, "anonymous LinkedIn status should remain protected");
  assert.equal((await linkedinStatus.json()).error, "Authentication required.", "LinkedIn status should return protected auth JSON");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200, "health should remain public");
  assert.equal((await health.json()).liveGatesCount, 0, "liveGatesCount should remain 0");
} finally {
  child.kill("SIGTERM");
}

console.log("public legal pages tests passed.");
