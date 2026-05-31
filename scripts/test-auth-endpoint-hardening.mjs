import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildEndpointInventory,
  endpointProtectionStatus,
  forbiddenEndpointRules,
  guardForbiddenEndpoint,
  secretLeakageStatusFromText
} from "./auth-endpoint-hardening.mjs";

const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const inventory = buildEndpointInventory(serverSource);

assert(inventory.length > 50, "Endpoint inventory should discover the active API surface.");
for (const endpoint of inventory) {
  assert(endpoint.method, "Endpoint inventory must include method.");
  assert(endpoint.path, "Endpoint inventory must include path.");
  assert(endpoint.purpose, `${endpoint.method} ${endpoint.path} must include purpose.`);
  assert(typeof endpoint.auth_required === "boolean", `${endpoint.method} ${endpoint.path} must include auth_required.`);
  assert(typeof endpoint.state_mutation === "boolean", `${endpoint.method} ${endpoint.path} must include state_mutation.`);
  assert(typeof endpoint.external_action === "boolean", `${endpoint.method} ${endpoint.path} must include external_action.`);
  assert(endpoint.live_gate_dependency, `${endpoint.method} ${endpoint.path} must include live gate dependency.`);
  assert(endpoint.risk_level, `${endpoint.method} ${endpoint.path} must include risk level.`);
}

const requiredInventoryPaths = [
  "GET /api/health",
  "GET /api/operator-search",
  "POST /api/operator-search/action",
  "GET /api/os-health",
  "POST /api/os-health/refresh",
  "GET /api/operating-memory/today",
  "POST /api/operating-memory/today/save",
  "GET /api/production-activation/rcap",
  "POST /api/production-activation/rcap/start",
  "GET /api/data-integrity",
  "POST /api/data-integrity/refresh"
];
for (const key of requiredInventoryPaths) {
  assert(inventory.some(endpoint => `${endpoint.method} ${endpoint.path}` === key), `Endpoint inventory should include ${key}.`);
}

const protection = endpointProtectionStatus(serverSource);
assert.equal(protection.status, "protected", "Endpoint protection status should be protected.");
assert.equal(protection.mutating_unprotected_count, 0, "Mutating endpoints must not be public.");

const forbiddenGuard = guardForbiddenEndpoint({ method: "POST", pathname: "/api/posts/example-post/publish-now", state: { runtime: { livePostingGates: {} } } });
assert.equal(forbiddenGuard.ok, false, "Publish-now endpoint should be blocked by forbidden action guard.");
assert.equal(forbiddenGuard.status, 403, "Forbidden action guard should return 403.");
assert(forbiddenEndpointRules.some(rule => rule.id === "destructive-restore"), "Forbidden action guard should include destructive restore.");
assert.equal(guardForbiddenEndpoint({ method: "POST", pathname: "/api/backups/restore" }).ok, false, "Destructive restore endpoint should be blocked.");
assert.equal(guardForbiddenEndpoint({ method: "POST", pathname: "/api/partner-journey/handoff" }).ok, false, "Partner Journey API calls should be blocked.");

const port = Number(process.env.TEST_AUTH_HARDENING_PORT || 3439);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-hardening-test-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-auth-hardening-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({
  settings: {},
  posts: [],
  contentBank: [],
  captureInbox: [],
  tasks: [],
  partnerPrograms: [{ id: "partner-program-rcap", slug: "rcap", name: "RCAP", status: "activation_review" }],
  partnerProgramArtifacts: [],
  reports: [],
  evidencePackNotes: [],
  auditHistory: [],
  activityEvents: [],
  soc2AuditLogs: [],
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } }
}, null, 2));

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

function secretLeakagePatterns() {
  return [
    /SUPABASE_SERVICE_ROLE_KEY/,
    /OPENAI_API_KEY/,
    /OWNER_TOKEN/,
    /OAUTH_TOKEN_ENCRYPTION_KEY/,
    /STRIPE_SECRET_KEY/,
    /service_role/i,
    /\bsk-[A-Za-z0-9_-]{8,}/,
    /\bwhsec_[A-Za-z0-9_-]{8,}/,
    /Bearer\s+[A-Za-z0-9._~+/-]{16,}/i
  ];
}

function assertNoSecretLeak(label, text) {
  const helperStatus = secretLeakageStatusFromText(text);
  assert.equal(helperStatus.status, "clean", `${label} should pass helper secret scan. Matches: ${helperStatus.matches.join(", ")}`);
  for (const pattern of secretLeakagePatterns()) {
    assert.doesNotMatch(text, pattern, `${label} must not leak secret-like value matching ${pattern}.`);
  }
  assert(!text.includes(ownerToken), `${label} must not contain owner token.`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  assertNoSecretLeak(`${options.method || "GET"} ${pathname}`, text);
  return { response, text, json: () => JSON.parse(text || "{}") };
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
    COMMAND_CENTER_DATA_PATH: dataPath,
    COMMAND_CENTER_SEED_PATH: seedPath,
    NODE_DISABLE_COMPILE_CACHE: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const publicHealth = await request("/api/health");
  assert.equal(publicHealth.response.status, 200, "/api/health should remain public-safe.");
  assertNoSecretLeak("health response", publicHealth.text);

  const protectedCases = [
    { method:"GET", path:"/api/operator-search" },
    { method:"POST", path:"/api/operator-search/action", body:{ action:"open_os_health" } },
    { method:"GET", path:"/api/os-health" },
    { method:"POST", path:"/api/os-health/refresh", body:{} },
    { method:"GET", path:"/api/operating-memory/today" },
    { method:"POST", path:"/api/operating-memory/today/save", body:{} },
    { method:"GET", path:"/api/production-activation/rcap" },
    { method:"POST", path:"/api/production-activation/rcap/start", body:{} },
    { method:"GET", path:"/api/data-integrity" },
    { method:"POST", path:"/api/data-integrity/refresh", body:{} },
    { method:"GET", path:"/api/auth-hardening/endpoints" },
    { method:"POST", path:"/api/tasks/rebuild", body:{} }
  ];

  for (const item of protectedCases) {
    const noToken = await request(item.path, {
      method: item.method,
      headers: item.body ? { "content-type":"application/json" } : {},
      body: item.body ? JSON.stringify(item.body) : undefined
    });
    assert.equal(noToken.response.status, 401, `${item.method} ${item.path} should reject missing token.`);

    const wrongToken = await request(item.path, {
      method: item.method,
      headers: { ...(item.body ? { "content-type":"application/json" } : {}), authorization:"Bearer wrong-token" },
      body: item.body ? JSON.stringify(item.body) : undefined
    });
    assert.equal(wrongToken.response.status, 401, `${item.method} ${item.path} should reject wrong token.`);

    const correct = await request(item.path, {
      method: item.method,
      headers: { ...(item.body ? { "content-type":"application/json" } : {}), authorization:`Bearer ${ownerToken}` },
      body: item.body ? JSON.stringify(item.body) : undefined
    });
    assert(correct.response.status >= 200 && correct.response.status < 300, `${item.method} ${item.path} should succeed with correct owner token. Got ${correct.response.status}: ${correct.text}`);
  }

  const forbiddenPublish = await request("/api/posts/example/publish-now", {
    method:"POST",
    headers:{ authorization:`Bearer ${ownerToken}` }
  });
  assert.equal(forbiddenPublish.response.status, 403, "Publish endpoint should be blocked even with owner token.");
  assert.match(forbiddenPublish.text, /forbidden_external_action_blocked|Live publishing is blocked/i);

  const forbiddenRestore = await request("/api/backups/restore", {
    method:"POST",
    headers:{ "content-type":"application/json", authorization:`Bearer ${ownerToken}` },
    body:JSON.stringify({ backupPath:"/tmp/blocked.json" })
  });
  assert.equal(forbiddenRestore.response.status, 403, "Destructive restore should be blocked even with owner token.");

  const hardening = await request("/api/auth-hardening/endpoints", {
    headers:{ authorization:`Bearer ${ownerToken}` }
  });
  const hardeningJson = hardening.json();
  assert(hardeningJson.inventory.length >= inventory.length - 2, "Hosted endpoint inventory should be returned.");
  assert.equal(hardeningJson.summary.endpoint_protection.status, "protected", "Hosted hardening summary should report protected endpoints.");
  assert.equal(hardeningJson.summary.forbidden_action_guard.live_gates_count, 0, "Live gates must remain 0.");

  const osHealth = await request("/api/os-health", {
    headers:{ authorization:`Bearer ${ownerToken}` }
  });
  const osHealthJson = osHealth.json();
  assert(osHealthJson.snapshot.auth_hardening, "OS Health should include auth hardening status.");
  assert.equal(osHealthJson.snapshot.auth_hardening.endpoint_protection.status, "protected", "OS Health should render endpoint protection status.");
  assert.equal(osHealthJson.snapshot.auth_hardening.secret_leakage.status, "clean", "OS Health should render secret leakage status.");
  assert.equal(osHealthJson.snapshot.auth_hardening.forbidden_action_guard.status, "blocked", "OS Health should render forbidden action guard status.");

  const deniedState = JSON.parse(await readFile(dataPath, "utf8"));
  assert((deniedState.soc2AuditLogs || []).some(item => item.action === "access denied"), "Failed auth attempts should be recorded safely in SOC 2 audit logs.");
  assert.equal(Object.values(deniedState.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length, 0, "Live gates must remain 0.");

  const lockedPage = await request("/");
  assertNoSecretLeak("locked page html", lockedPage.text);
  assert.match(lockedPage.text, /Owner access token|Unlock Command Center|Lock|Sign out/i, "Hosted lock page should preserve owner-token login/lock language.");
} finally {
  child.kill("SIGTERM");
}

assert(serverSource.includes("Access Protection"), "App Status page should render founder-facing access protection.");
assert(serverSource.includes("/api/auth-hardening/endpoints"), "Auth hardening endpoint inventory API should exist.");
assert(serverSource.includes("guardForbiddenEndpoint"), "Central forbidden endpoint guard should be wired into the preview server.");

console.log("Auth endpoint hardening tests passed.");
