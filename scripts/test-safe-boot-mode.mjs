import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");

const port = Number(process.env.TEST_SAFE_BOOT_MODE_PORT || 3450);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-safe-boot-test-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-safe-boot-"));
const brokenDataPath = path.join(dataDir, "broken-state-directory");
await mkdir(brokenDataPath);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    if (logs.includes("LegalEase preview server ready")) return logs;
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${logs}`);
    await wait(100);
  }
  throw new Error(`Timed out waiting for server: ${logs}`);
}

async function readText(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return { response, text };
}

async function readJson(pathname, options = {}) {
  const { response, text } = await readText(pathname, options);
  let json = null;
  assert.doesNotThrow(() => {
    json = text ? JSON.parse(text) : {};
  }, `${pathname} should return JSON. Body: ${text.slice(0, 240)}`);
  return { response, text, json };
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    RENDER: "true",
    COMMAND_CENTER_REQUIRE_AUTH: "true",
    COMMAND_CENTER_OWNER_TOKEN: ownerToken,
    LOCAL_DEMO_MODE: "true",
    STORAGE_BACKEND: "json",
    COMMAND_CENTER_DATA_PATH: brokenDataPath,
    NODE_DISABLE_COMPILE_CACHE: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const missingRoot = await readText("/");
  assert.match(missingRoot.text, /Owner access token|Unlock Command Center/i, "Missing token should show lock flow.");
  assert.doesNotMatch(missingRoot.text, /Failed module: state-fetch|LegalEase did not finish rendering/i, "Missing token should not render a state-fetch crash.");

  const wrongRoot = await readText("/", { headers: { cookie: "leos_session=wrong-token" } });
  assert.match(wrongRoot.text, /Owner access token|Unlock Command Center/i, "Wrong token should show lock flow.");
  assert.doesNotMatch(wrongRoot.text, /Failed module: state-fetch|LegalEase did not finish rendering/i, "Wrong token should not render a state-fetch crash.");

  const badState = await readJson("/api/state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(badState.response.status, 500, "Broken test state should reproduce a state endpoint failure.");
  assert.doesNotMatch(badState.text, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|OWNER_TOKEN|OAUTH_TOKEN_ENCRYPTION_KEY|STRIPE_SECRET_KEY|sk-|whsec_|service_role/i, "State failure response should not expose secrets.");

  const safeModeHtml = await readText("/#safe-mode", { headers: { cookie: `leos_session=${encodeURIComponent(ownerToken)}` } });
  assert.equal(safeModeHtml.response.status, 200, "Safe mode route should serve the authenticated shell.");
  assert.match(safeModeHtml.text, /renderSafeBootShell/, "Authenticated shell should include the safe boot renderer.");
  assert.match(safeModeHtml.text, /Safe Mode/, "Safe mode UI copy should be present.");
  assert.match(safeModeHtml.text, /Back to Today/, "Safe mode should offer a way back to Today without signing out.");
  assert.match(safeModeHtml.text, /Retry Full Load/, "Safe mode should offer a full-state retry.");
  assert.match(safeModeHtml.text, /Retry Full Load and Open Today/, "Safe mode should offer a retry-and-return flow.");
  assert.match(safeModeHtml.text, /Open System Health/, "Safe mode should link to System Health.");
  assert.match(safeModeHtml.text, /Sign Out \/ Clear Session/, "Safe mode should offer session clearing.");
  assert.match(safeModeHtml.text, /Live gates: 0/, "Safe mode should show live gates remain 0.");
  assert.match(safeModeHtml.text, /\/api\/health/, "Safe mode should fetch public-safe health.");
  const health = await readJson("/api/health");
  assert.equal(health.response.status, 200, "/api/health should remain public-safe.");
  assert.equal(health.json.liveGatesCount, 0, "Live gates must remain 0.");
} finally {
  child.kill("SIGTERM");
}

assert(source.includes("function renderSafeBootShell"), "Safe boot shell renderer should exist.");
assert(source.includes('normalizedPage === "safe-mode"'), "#safe-mode should bypass full state rendering.");
assert(source.includes("safeBootFallbackState"), "Bad or missing state should hydrate a limited safe fallback state.");
assert(source.includes("showSafeBootShell(formatStateFetchError(error), \"boot-state-fetch\", error)"), "Boot state failures should fall back to safe shell.");
assert(source.includes("stateFetchDiagnostics"), "Safe shell should store state-fetch diagnostics.");
assert(source.includes("Auth token present:"), "State-fetch diagnostics should include whether an auth token was present.");
assert(source.includes("Fell back to safe shell:"), "State-fetch diagnostics should include fallback status.");
assert(source.includes("retryFullStateLoad"), "Retry Full Load should use the normal token-aware load path.");
assert(source.includes("function openTodayFromSafeMode()"), "Safe mode should define Back to Today behavior.");
assert(source.includes("function retryFullStateAndOpenToday()"), "Safe mode should define retry-and-open-Today behavior.");
assert(source.includes("lockCommandCenter()"), "Safe shell sign out should clear token/cookie through lockCommandCenter.");
assert(source.includes("optionalBootApi"), "Optional boot requests should remain non-fatal.");
assert(source.includes("guardForbiddenEndpoint"), "Forbidden action guard should remain wired.");
const safeShellBlock = source.match(/function renderSafeBootShell[\s\S]*?function showSafeBootShell/)?.[0] || "";
assert(safeShellBlock, "Safe boot shell block should be available for static checks.");
assert.match(safeShellBlock, /onclick="openTodayFromSafeMode\(\)"/, "Back to Today should not use lockCommandCenter.");
assert.doesNotMatch(safeShellBlock.match(/function openTodayFromSafeMode[\s\S]*?function retryFullStateAndOpenToday/)?.[0] || "", /lockCommandCenter|clearOwnerToken|localStorage\.removeItem|sessionStorage\.removeItem/, "Back to Today must not clear the session.");
assert.doesNotMatch(safeShellBlock, /type="submit"|Send Email|Publish Page|Activate Dashboard|Enable Live Publishing/i, "Safe mode should not expose enabled mutating or external controls.");
assert.doesNotMatch(safeShellBlock, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|OWNER_TOKEN|OAUTH_TOKEN_ENCRYPTION_KEY|STRIPE_SECRET_KEY|sk-|whsec_|service_role/i, "Safe mode renderer should not include secret names or values.");

console.log("Safe boot mode tests passed.");
