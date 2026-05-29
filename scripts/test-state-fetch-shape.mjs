import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");

const port = Number(process.env.TEST_STATE_FETCH_SHAPE_PORT || 3448);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-state-shape-test-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-state-shape-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

const requiredArrayCollections = [
  "captureInbox",
  "tasks",
  "conversationNotes",
  "morningBriefs",
  "eveningReflections",
  "operatingMemory",
  "dailyCloseouts",
  "reviewStates",
  "auditHistory",
  "activityEvents",
  "partnerPrograms",
  "partnerProgramArtifacts",
  "evidencePackNotes",
  "reports",
  "dataRoomItems",
  "osHealthSnapshots",
  "smokeTestRuns",
  "roleAssignments",
  "handoffPackets",
  "handoffContractPreviews",
  "posts",
  "library",
  "socialAccounts",
  "postImages"
];

await writeFile(seedPath, JSON.stringify({
  settings: "malformed-settings",
  posts: { malformed: true },
  tasks: { malformed: true },
  captureInbox: "not-an-array",
  conversationNotes: null,
  morningBriefs: { bad: true },
  eveningReflections: 42,
  operatingMemory: "bad",
  dailyCloseouts: { bad: true },
  reviewStates: "bad",
  auditHistory: { bad: true },
  activityEvents: "bad",
  partnerPrograms: { bad: true },
  partnerProgramArtifacts: "bad",
  evidencePackNotes: { bad: true },
  reports: "bad",
  dataRoomItems: { bad: true },
  osHealthSnapshots: "bad",
  smokeTestRuns: { bad: true },
  roleAssignments: "bad",
  handoffPackets: { bad: true },
  handoffContractPreviews: "bad",
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  unsafeSecretLikeValue: "sk-thisShouldBeRedacted123456789"
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

async function readResponse(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let json = null;
  assert.doesNotThrow(() => {
    json = text ? JSON.parse(text) : {};
  }, `${pathname} should return valid JSON. Body: ${text.slice(0, 240)}`);
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

  const stateResult = await readResponse("/api/state", {
    headers: { authorization: `Bearer ${ownerToken}` }
  });
  assert.equal(stateResult.response.status, 200, `/api/state should succeed with owner token. Body: ${stateResult.text.slice(0, 500)}`);
  assert.match(stateResult.response.headers.get("content-type") || "", /application\/json/i, "/api/state should be JSON.");

  for (const collection of requiredArrayCollections) {
    assert(Array.isArray(stateResult.json[collection]), `${collection} should hydrate as an array.`);
  }
  assert.equal(typeof stateResult.json.settings, "object", "settings should hydrate as an object.");
  assert.equal(typeof stateResult.json.runtime, "object", "runtime should hydrate as an object.");
  assert(Array.isArray(stateResult.json.stateShapeWarnings), "stateShapeWarnings should be present for quarantined collections.");
  assert(stateResult.json.stateShapeWarnings.length >= 8, "malformed collections should be quarantined with warnings.");
  assert.equal(stateResult.json.liveGatesCount, 0, "liveGatesCount should exist and remain 0.");
  assert.doesNotMatch(stateResult.text, /sk-thisShouldBeRedacted|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|OWNER_TOKEN|service_role|whsec_/i, "State response should not leak secrets.");

  const unlocked = await fetch(`${baseUrl}/`, {
    headers: { cookie: `leos_session=${encodeURIComponent(ownerToken)}` }
  }).then(response => response.text());
  assert.match(unlocked, /hydrateStatePayload/, "Client boot should hydrate and normalize state payloads.");
  assert.match(unlocked, /stateShapeWarnings/, "Client boot should retain state shape warnings.");
  assert.match(unlocked, /formatStateFetchError/, "State-fetch failures should include diagnostics.");
  assert.match(unlocked, /Status:/, "State-fetch diagnostics should include HTTP status.");
  assert.match(unlocked, /Content type:/, "State-fetch diagnostics should include content type.");
  assert.match(unlocked, /JSON parse error:/, "State-fetch diagnostics should include JSON parse errors.");

  assert(serverSource.includes("normalizeStateForClient"), "Server should normalize state shape before sending /api/state.");
  assert(serverSource.includes("liveGatesCount"), "Server should include liveGatesCount in boot state.");
  assert(serverSource.includes("stateShapeWarnings"), "Server should expose safe state shape warnings.");
} finally {
  child.kill("SIGTERM");
}

console.log("State fetch shape tests passed.");
