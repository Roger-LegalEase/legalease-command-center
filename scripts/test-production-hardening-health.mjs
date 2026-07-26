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
const dataPath = path.join(await mkdtemp(path.join(os.tmpdir(), "legalease-health-")), "state.json");
const secret = "test-secret-should-not-leak-1234567890";
const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT:String(port),
    HOST:"127.0.0.1",
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_REQUIRE_AUTH:"true",
    COMMAND_CENTER_OWNER_TOKEN:"owner-token-health-hardening-1234567890",
    OPENAI_API_KEY:secret,
    DATABASE_URL:"postgres://example.invalid/db",
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio:["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);
  // PORTED 2026-07-26 (hygiene, extended-test triage). /api/health was deliberately MINIMISED in
  // d146413 and now returns only {status:"ok"}. Every posture field this suite read
  // (liveGatesCount, ownerAuthEnabled, externalActionsEnabled, …) was removed from the ANONYMOUS
  // payload on purpose, so asserting them there would be asserting that an unauthenticated caller
  // can enumerate the deployment's safety posture.
  //
  // The suite's purpose — "verifies safe health readiness output" — is preserved by splitting it:
  //   1. the PUBLIC endpoint must stay minimised and leak nothing (below), and
  //   2. the posture itself is read from /api/production/readiness, which requires the
  //      view_diagnostics permission and is where the live-gates check now lives.
  // Static bearer/header tokens no longer authenticate (the static token registry was emptied as
  // intentional hardening), so this logs in through POST /api/auth/login and uses the resulting
  // HttpOnly session, which is the only supported way to reach a protected endpoint.
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const text = await response.text();
  const health = JSON.parse(text);
  assert.equal(response.status, 200, "public health should stay reachable.");
  assert.deepEqual(Object.keys(health), ["status"], "public /api/health must stay minimised to a single status field.");
  assert.equal(health.status, "ok", "public /api/health should report ok.");
  for (const withheldField of ["liveGatesCount", "ownerAuthEnabled", "externalActionsEnabled", "socialWorkspaceEnabled", "socialLivePostingEnabled", "emailEnabled", "calendarWritesEnabled", "privacyRouteEnabled"]) {
    assert.equal(health[withheldField], undefined, `public /api/health must not publish ${withheldField}.`);
  }
  assert.doesNotMatch(text, /postgres:\/\/example\.invalid|test-secret-should-not-leak|DATABASE_URL|OPENAI_API_KEY/, "Health should not leak secret values or secret names.");

  const anonymousReadiness = await fetch(`http://127.0.0.1:${port}/api/production/readiness`);
  assert.equal(anonymousReadiness.status, 401, "production readiness must require authentication.");

  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ credential:"owner-token-health-hardening-1234567890" })
  });
  assert.equal(login.status, 200, "owner bootstrap login should succeed.");
  const sessionCookie = String((login.headers.getSetCookie?.() || []).join("; ")).match(/leos_session=([^;,\s]+)/)?.[1] || "";
  assert.ok(sessionCookie, "login should set an opaque session cookie.");

  const readinessResponse = await fetch(`http://127.0.0.1:${port}/api/production/readiness`, {
    headers:{ cookie:`leos_session=${sessionCookie}` }
  });
  assert.equal(readinessResponse.status, 200, "an owner session should be able to read production readiness.");
  const readinessText = await readinessResponse.text();
  const readiness = JSON.parse(readinessText);
  assert.equal(readiness.liveGatesCount, 0, "liveGatesCount should be 0.");
  const liveGatesCheck = readiness.checks.find((check) => check.id === "live-gates");
  assert.ok(liveGatesCheck, "readiness should report a live-gates check.");
  assert.equal(liveGatesCheck.ok, true, "live publishing gates should remain disabled.");
  assert.equal(liveGatesCheck.detail, "0 live gate(s) enabled.", "the live-gates check should state that no gate is enabled.");
  assert.equal(readiness.authenticationRequired ?? true, true, "owner authentication should be required.");
  assert.equal(readiness.noSecretsReturned, true, "readiness must declare that it returns no secrets.");
  assert.doesNotMatch(readinessText, /postgres:\/\/example\.invalid|test-secret-should-not-leak|OPENAI_API_KEY=/, "Readiness should not leak secret values.");
} finally {
  child.kill("SIGTERM");
}

console.log("production hardening health tests passed");
