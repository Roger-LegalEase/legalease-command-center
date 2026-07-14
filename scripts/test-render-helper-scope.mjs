import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const scriptStart = source.indexOf("    let state = null;");
const scriptEnd = source.lastIndexOf("  </script>\n</body>");
assert(scriptStart > 0 && scriptEnd > scriptStart);
const runtime = source.slice(scriptStart, scriptEnd);
const importBlock = source.slice(0, source.indexOf("const assetRoot"));
const imported = new Set();
for (const match of importBlock.matchAll(/import\s+\{([\s\S]*?)\}\s+from/g)) {
  for (const raw of match[1].split(",")) if (raw.trim()) imported.add(raw.trim().split(/\s+as\s+/).pop().trim());
}
const defined = new Set();
for (const match of runtime.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(match[1]);
for (const match of runtime.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g)) defined.add(match[1]);
const invalidReferences = [...imported].filter(name => name !== "roleCapabilities" && new RegExp(`(?<![\\w$-])${name}(?![\\w$-])`).test(runtime) && !defined.has(name));
assert.deepEqual(invalidReferences.sort(), []);
for (const helper of ["buildEvidenceOverview", "buildEvidenceIndex", "latestEvidenceSummary", "buildSmokeTestStatus", "buildSmokeTestChecklist", "buildDataIntegritySnapshot", "buildDataModelInventory", "priorityWeight", "buildPartnerJourneyHandoffContractPacket", "validatePartnerJourneyHandoffContract", "handoffContractStatus", "latestHandoffContractPreview", "redactHandoffContractJson"]) assert(defined.has(helper), `${helper} must exist in the active browser runtime.`);
for (const constantName of ["handoffContractVersion", "handoffContractRequiredTopLevelFields", "handoffContractRequiredPartnerFields", "handoffContractRequiredArtifactTypes"]) assert(defined.has(constantName));

const server = await startPreviewServer();
try {
  const login = await loginOwner(server);
  const boot = await jsonRequest(server.baseUrl, "/api/boot-state", { headers:{ cookie:login.cookie } });
  assert.equal(boot.response.status, 200);
  const full = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:login.cookie } });
  assert.equal(full.response.status, 200);
  const shell = await fetch(`${server.baseUrl}/`, { headers:{ cookie:login.cookie } }).then(response => response.text());
  assert.match(shell, /function buildEvidenceOverview\(/);
  assert.match(shell, /function buildSmokeTestStatus\(/);
  assert.match(shell, /function renderModuleFallbackHtml\(/);
} finally {
  await server.stop();
}
console.log("Render helper scope tests passed.");
