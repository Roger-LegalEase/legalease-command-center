import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const scriptStart = source.indexOf("    let state = null;");
const scriptEnd = source.lastIndexOf("  </script>\n</body>");
assert(scriptStart > 0 && scriptEnd > scriptStart, "Active inline browser runtime should be discoverable.");
const inlineRuntime = source.slice(scriptStart, scriptEnd);

const importBlock = source.slice(0, source.indexOf("const assetRoot"));
const importedNames = new Set();
for (const match of importBlock.matchAll(/import\s+\{([\s\S]*?)\}\s+from/g)) {
  for (const rawPart of match[1].split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    importedNames.add(part.split(/\s+as\s+/).pop().trim());
  }
}

const definedNames = new Set();
for (const match of inlineRuntime.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) definedNames.add(match[1]);
for (const match of inlineRuntime.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g)) definedNames.add(match[1]);

const runtimeImportReferences = [];
for (const name of importedNames) {
  if (name === "roleCapabilities") continue; // Rendered into clientRoleCapabilities by template interpolation.
  // Match the import name only as a standalone JS identifier. Exclude hyphen/word-adjacent
  // matches so CSS class fragments like "command-stat" do not count as a reference to "stat".
  if (new RegExp(`(?<![\\w$-])${name}(?![\\w$-])`).test(inlineRuntime) && !definedNames.has(name)) runtimeImportReferences.push(name);
}
assert.deepEqual(runtimeImportReferences.sort(), [], `Imported server helpers referenced in browser runtime without browser definitions: ${runtimeImportReferences.sort().join(", ")}`);

for (const helper of [
  "buildEvidenceOverview",
  "buildEvidenceIndex",
  "latestEvidenceSummary",
  "buildSmokeTestStatus",
  "buildSmokeTestChecklist",
  "buildDataIntegritySnapshot",
  "buildDataModelInventory",
  "priorityWeight",
  "buildPartnerJourneyHandoffContractPacket",
  "validatePartnerJourneyHandoffContract",
  "handoffContractStatus",
  "latestHandoffContractPreview",
  "redactHandoffContractJson"
]) {
  assert(definedNames.has(helper), `${helper} should be defined in the active browser runtime.`);
}

for (const constantName of [
  "handoffContractVersion",
  "handoffContractRequiredTopLevelFields",
  "handoffContractRequiredPartnerFields",
  "handoffContractRequiredArtifactTypes"
]) {
  assert(definedNames.has(constantName), `${constantName} should be defined in the active browser runtime.`);
}

const port = Number(process.env.TEST_RENDER_HELPER_SCOPE_PORT || 3463);
const baseUrl = `http://127.0.0.1:${port}`;
const ownerToken = "owner-token-render-helper-scope-1234567890";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-render-helper-scope-"));
const dataPath = path.join(dataDir, "social-command-center.json");
const seedPath = path.join(dataDir, "social-command-center.seed.json");

await writeFile(seedPath, JSON.stringify({
  settings: {},
  runtime: { commitHash: "scope-test", livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  posts: [],
  tasks: [],
  captureInbox: [],
  evidencePackNotes: [],
  reports: [],
  dataRoomItems: [],
  partnerProgramArtifacts: [],
  osHealthSnapshots: [],
  smokeTestRuns: [],
  roleAssignments: [],
  auditHistory: [],
  activityEvents: []
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

async function fetchText(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return { response, text };
}

async function fetchJson(pathname, options = {}) {
  const { response, text } = await fetchText(pathname, options);
  let json = null;
  assert.doesNotThrow(() => {
    json = text ? JSON.parse(text) : {};
  }, `${pathname} should return JSON. Body: ${text.slice(0, 240)}`);
  return { response, json, text };
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
  const boot = await fetchJson("/api/boot-state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(boot.response.status, 200, "Boot-state should build without helper ReferenceError.");
  assert.equal(boot.json.liveGatesCount, 0, "Boot-state should keep live gates at 0.");

  const full = await fetchJson("/api/state", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(full.response.status, 200, "Full state should build without helper ReferenceError.");
  assert.equal(full.json.liveGatesCount, 0, "Full state should keep live gates at 0.");

  const shell = await fetchText("/", { headers: { cookie: `leos_session=${encodeURIComponent(ownerToken)}` } });
  assert.equal(shell.response.status, 200, "Authenticated shell should load.");
  assert.doesNotMatch(shell.text, /Can't find variable: (buildEvidenceOverview|buildSmokeTestStatus|buildDataIntegritySnapshot|buildPartnerJourneyHandoffContractPacket)/i, "Shell should not contain concrete missing-helper ReferenceError text.");
  assert.match(shell.text, /function buildEvidenceOverview\(/, "Shell should include browser evidence overview helper.");
  assert.match(shell.text, /function buildSmokeTestStatus\(/, "Shell should include browser smoke test status helper.");
  assert.match(shell.text, /function renderModuleFallbackHtml\(/, "Shell should include module-level render fallback helper.");
} finally {
  child.kill("SIGTERM");
}

console.log("Render helper scope tests passed.");
