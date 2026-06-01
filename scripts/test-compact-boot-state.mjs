import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");

const port = Number(process.env.TEST_COMPACT_BOOT_STATE_PORT || 3451);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-compact-boot-test-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-compact-boot-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

const longItems = Array.from({ length: 50 }, (_, index) => ({
  id: `heavy-${index}`,
  title: `Heavy item ${index}`,
  createdAt: new Date(Date.UTC(2026, 4, 1, 12, index)).toISOString()
}));

await writeFile(seedPath, JSON.stringify({
  settings: { companyName: "LegalEase" },
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  metrics: { pipeline: 1 },
  systemHealth: { status: "review" },
  posts: longItems,
  tasks: longItems.map((item, index) => ({ ...item, status: index % 2 ? "open" : "blocked", priority: "high" })),
  captureInbox: longItems.map((item, index) => ({ ...item, review_state: index % 2 ? "reviewed" : "review_required" })),
  auditHistory: longItems,
  activityEvents: longItems,
  dataRoomItems: longItems,
  reports: longItems,
  evidencePackNotes: longItems,
  partnerProgramArtifacts: longItems,
  roleAssignments: [{ id: "role-owner", actor_id: "owner", role: "owner", status: "active" }]
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
    COMMAND_CENTER_DATA_PATH: dataPath,
    COMMAND_CENTER_SEED_PATH: seedPath,
    NODE_DISABLE_COMPILE_CACHE: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const missing = await readJson("/api/boot-state");
  assert.equal(missing.response.status, 401, "/api/boot-state should be owner-protected.");

  const wrong = await readJson("/api/boot-state", { headers: { authorization: "Bearer wrong-token" } });
  assert.equal(wrong.response.status, 401, "/api/boot-state should reject wrong token.");

  const boot = await readJson("/api/boot-state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(boot.response.status, 200, "/api/boot-state should succeed with owner token.");
  assert.equal(boot.json.liveGatesCount, 0, "Boot state must keep live gates at 0.");
  assert.equal(boot.json.safeModeAvailable, true, "Boot state should advertise safe mode.");
  assert.equal(boot.json.heavyCollectionsDeferred, true, "Boot state should defer heavy collections.");
  assert.equal(boot.json.currentUser?.role, "owner", "Owner token should resolve current user summary.");
  assert(Array.isArray(boot.json.tasks), "Boot state should include a small tasks summary.");
  assert(boot.json.tasks.length <= 12, "Boot state should keep tasks compact.");
  assert(Array.isArray(boot.json.captureInbox), "Boot state should include a small capture inbox summary.");
  assert(boot.json.captureInbox.length <= 8, "Boot state should keep capture inbox compact.");
  for (const heavy of ["auditHistory", "activityEvents", "dataRoomItems", "reports", "evidencePackNotes", "partnerProgramArtifacts", "posts"]) {
    assert.equal(Object.hasOwn(boot.json, heavy), false, `/api/boot-state should exclude heavy collection ${heavy}.`);
  }
  assert.doesNotMatch(boot.text, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|OWNER_TOKEN|OAUTH_TOKEN_ENCRYPTION_KEY|STRIPE_SECRET_KEY|sk-[A-Za-z0-9_-]{12,}|whsec_/i, "Boot state should not leak secrets.");

  const state = await readJson("/api/state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(state.response.status, 200, "/api/state should remain available for lazy full load.");
  assert(Array.isArray(state.json.auditHistory), "Full state should still include full collections.");

  const unlocked = await readText("/", { headers: { cookie: `leos_session=${encodeURIComponent(ownerToken)}` } });
  assert.match(unlocked.text, /api\("\/api\/boot-state"/, "Client boot should fetch compact boot state first.");
  assert.match(unlocked.text, /loadFullStateInBackground/, "Client should lazy-load full state after first render.");
  assert.match(unlocked.text, /api\("\/api\/state", \{ timeoutMs: 20000 \}\)/, "Full state should remain available as lazy load.");
  assert.match(unlocked.text, /Full state unavailable\. Safe boot state loaded\./, "Lazy full state failure should warn without crashing.");
} finally {
  child.kill("SIGTERM");
}

assert(source.includes('if (url.pathname === "/api/boot-state" && request.method === "GET")'), "Boot-state endpoint should exist.");
assert(source.includes("buildCompactBootState"), "Compact boot-state builder should exist.");
assert(source.includes("heavyCollectionsDeferred:true"), "Boot state should mark heavy collections deferred.");
assert(source.includes('state = hydrateStatePayload(await api("/api/boot-state"'), "Initial client boot should hydrate from /api/boot-state.");
assert(source.includes('const fullPayload = await api("/api/state", { timeoutMs: 20000 })'), "Full state should lazy-load from /api/state.");
assert(!/showRenderFailure\(formatStateFetchError\(error\), "state-fetch"\)/.test(source), "Full state failures should not use fatal state-fetch render failure.");
assert(source.includes("showSafeBootShell(formatStateFetchError(error), \"boot-state-fetch\", error)"), "Boot-state failures should use safe shell.");
assert(source.includes("bootStateDiagnostics"), "Safe mode should show boot-state diagnostics.");
assert(source.includes("fullStateDiagnostics"), "Safe mode should show full-state diagnostics.");
assert(source.includes("Back to Today"), "Recovery Mode should include Back to Today.");
assert(source.includes("Try full app again"), "Recovery Mode should include Try full app again.");
assert(source.includes("guardForbiddenEndpoint"), "Forbidden action guard should remain wired.");

console.log("Compact boot state tests passed.");
