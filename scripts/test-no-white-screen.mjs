import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

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

const port = await availablePort();
const dataPath = path.join(await mkdtemp(path.join(os.tmpdir(), "legalease-no-white-screen-")), "state.json");
const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT:String(port), HOST:"127.0.0.1", LOCAL_DEMO_MODE:"true", STORAGE_BACKEND:"json", COMMAND_CENTER_DATA_PATH:dataPath, NODE_DISABLE_COMPILE_CACHE:"1" },
  stdio:["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);
  for (const route of ["#today", "#work", "#social", "#proof", "#search", "#safe-mode", "#settings", "#morning-brief"]) {
    const response = await fetch(`http://127.0.0.1:${port}/${route}`);
    const html = await response.text();
    assert.equal(response.status, 200, `${route} should respond.`);
    assert(html.replace(/<[^>]+>/g, " ").trim().length > 200, `${route} should not be blank.`);
    assert.match(html, /Today|Work|Social|Proof|Search|Recovery Mode|App Status|Morning Brief|Publishing is off/i, `${route} should show useful fallback text.`);
  }
} finally {
  child.kill("SIGTERM");
}

console.log("no white screen tests passed");
