import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (logs.includes("LegalEase preview server ready")) return;
    if (child.exitCode !== null) throw new Error(logs);
    await wait(100);
  }
  throw new Error(logs || "Timed out waiting for server.");
}

const source = readFileSync("scripts/preview-server.mjs", "utf8");
assert.match(source, /href="\/privacy"/, "Privacy should be linked from Settings or footer.");
assert.match(readFileSync("docs/privacy-data-inventory.md", "utf8"), /Social ideas, drafts, planned posts/i, "Privacy data inventory should include Social records.");

const port = await availablePort();
const dataPath = path.join(await mkdtemp(path.join(os.tmpdir(), "legalease-privacy-")), "state.json");
const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT:String(port), HOST:"127.0.0.1", LOCAL_DEMO_MODE:"true", STORAGE_BACKEND:"json", COMMAND_CENTER_DATA_PATH:dataPath, NODE_DISABLE_COMPILE_CACHE:"1" },
  stdio:["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);
  const response = await fetch(`http://127.0.0.1:${port}/privacy`);
  const html = await response.text();
  assert.equal(response.status, 200, "/privacy should render.");
  for (const phrase of ["Privacy Policy", "Last updated", "Data collected", "How data is used", "Storage and providers", "Access and deletion", "Social ideas", "does not currently publish to social platforms"]) {
    assert(html.includes(phrase), `/privacy should include ${phrase}.`);
  }
  assert.doesNotMatch(html, /GDPR compliant|SOC 2 certified|certified compliant/i, "Privacy page should not claim fake compliance certification.");
  assert.doesNotMatch(html, /SendGrid is active|Stripe is active|social publishing is active/i, "Privacy page should not claim inactive providers are active.");
} finally {
  child.kill("SIGTERM");
}

console.log("privacy route tests passed");
