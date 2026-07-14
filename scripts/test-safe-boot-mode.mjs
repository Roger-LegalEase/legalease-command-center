import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const server = await startPreviewServer();
try {
  const missingRoot = await fetch(`${server.baseUrl}/`).then(response => response.text());
  assert.match(missingRoot, /Unlock Command Center/i);
  assert.doesNotMatch(missingRoot, /Failed module: state-fetch|did not finish rendering/i);

  const wrongRoot = await fetch(`${server.baseUrl}/`, { headers:{ cookie:"leos_session=invalid" } }).then(response => response.text());
  assert.match(wrongRoot, /Unlock Command Center/i);

  const login = await loginOwner(server);
  const safeMode = await fetch(`${server.baseUrl}/#safe-mode`, { headers:{ cookie:login.cookie } }).then(response => response.text());
  assert.match(safeMode, /renderSafeBootShell/);
  assert.match(safeMode, /Recovery Mode/);
  assert.match(safeMode, /Try full app again/);
  assert.match(safeMode, /Sign out/);
  assert.match(safeMode, /Publishing is off|Publishing[^<]*Off/i);

  const health = await jsonRequest(server.baseUrl, "/api/health");
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.json, { status:"ok" }, "Public liveness must expose only a fixed safe DTO.");
} finally {
  await server.stop();
}

assert(source.includes("function renderSafeBootShell"));
assert(source.includes('pageId === "safe-mode"'));
assert(source.includes("safeBootFallbackState"));
assert(source.includes("showSafeBootShell(formatStateFetchError(error), \"boot-state-fetch\", error)"));
assert(source.includes("retryFullStateLoad"));
const safeShellBlock = source.match(/function renderSafeBootShell[\s\S]*?function showSafeBootShell/)?.[0] || "";
assert(safeShellBlock);
assert.doesNotMatch(safeShellBlock, /type="submit"|Send Email|Publish Page|Activate Dashboard|Enable Live Publishing/i);

console.log("Safe boot mode tests passed.");
