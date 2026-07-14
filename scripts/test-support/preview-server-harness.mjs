import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const FETCH_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 3_000;
const activeChildren = new Set();

const OWNER_CREDENTIAL = ["owner", "integration", "credential", "2026", "A7v9"].join("-");

function safeChildEnvironment(overrides, dataPath, seedPath) {
  const inherited = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]
    .reduce((result, name) => process.env[name] ? { ...result, [name]:process.env[name] } : result, {});
  return {
    ...inherited,
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"true",
    SKIP_ENV_LOCAL_FILE:"1",
    HOST:"127.0.0.1",
    PORT:"0",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_ALLOW_JSON:"true",
    LOCAL_DEMO_MODE:"true",
    COMMAND_CENTER_REQUIRE_AUTH:"true",
    COMMAND_CENTER_OWNER_TOKEN:OWNER_CREDENTIAL,
    COMMAND_CENTER_SESSION_SECRET:["session", "integration", "secret", "2026", "Q4m8"].join("-"),
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_SEED_PATH:seedPath,
    SENDGRID_WEBHOOK_ENABLED:"false",
    PRODUCT_WEBHOOK_ENABLED:"false",
    LIVE_POSTING_ENABLED:"false",
    LINKEDIN_LIVE_POSTING:"false",
    FACEBOOK_LIVE_POSTING:"false",
    INSTAGRAM_LIVE_POSTING:"false",
    X_LIVE_POSTING:"false",
    REACTIVATION_LIVE_SEND:"false",
    OUTREACH_LIVE_SEND:"false",
    NODE_DISABLE_COMPILE_CACHE:"1",
    ...overrides
  };
}

function safeLogs(value) {
  return String(value || "")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .slice(-4_000);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForChildExit(child, timeoutMs = SHUTDOWN_TIMEOUT_MS) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(false), timeoutMs);
    const finish = (exited) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  if (!await waitForChildExit(child)) {
    child.kill("SIGKILL");
    if (!await waitForChildExit(child)) throw new Error("Preview server did not terminate after SIGKILL.");
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  activeChildren.delete(child);
}

// A failed assertion or an outer command timeout must not orphan a listening preview server.
// The exit hook is synchronous by design: it sends the signal while Node still owns the child.
process.once("exit", () => {
  for (const child of activeChildren) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
});

export async function startPreviewServer({ seed = {}, env = {} } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "leos-preview-test-"));
  const dataPath = path.join(dataDir, "state.json");
  const seedPath = path.join(dataDir, "seed.json");
  await writeFile(seedPath, `${JSON.stringify({
    settings:{},
    posts:[],
    tasks:[],
    captureInbox:[],
    roleAssignments:[],
    runtime:{ livePostingGates:{} },
    ...seed
  }, null, 2)}\n`, { mode:0o600 });

  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd:process.cwd(),
    env:safeChildEnvironment(env, dataPath, seedPath),
    stdio:["ignore", "pipe", "pipe"]
  });
  activeChildren.add(child);
  child.once("exit", () => activeChildren.delete(child));
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });

  let port = 0;
  try {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15_000) {
      const match = logs.match(/LegalEase preview server ready at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        port = Number(match[1]);
        break;
      }
      if (child.exitCode !== null) throw new Error(`Preview server exited before ready: ${safeLogs(logs)}`);
      await wait(50);
    }
    if (!port) throw new Error(`Preview server did not become ready: ${safeLogs(logs)}`);
  } catch (error) {
    await stopChild(child);
    throw error;
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    dataPath,
    ownerCredential:OWNER_CREDENTIAL,
    logs:() => safeLogs(logs),
    async stop() {
      await stopChild(child);
    }
  };
}

export async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    signal:options.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const text = await response.text();
  let json;
  assert.doesNotThrow(() => { json = text ? JSON.parse(text) : {}; }, `${pathname} must return safe JSON.`);
  return { response, json, text };
}

function cookiePair(setCookie, name) {
  const match = String(setCookie || "").match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : "";
}

export async function loginWithCredential(server, credential) {
  const result = await jsonRequest(server.baseUrl, "/api/auth/login", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ credential })
  });
  assert.equal(result.response.status, 200, "Synthetic role login must succeed.");
  const setCookie = result.response.headers.get("set-cookie") || "";
  const session = cookiePair(setCookie, "leos_session");
  const csrf = cookiePair(setCookie, "leos_csrf");
  assert(session && csrf, "Login must set session and CSRF cookies.");
  return {
    setCookie,
    cookie:`${session}; ${csrf}`,
    csrfToken:decodeURIComponent(csrf.slice("leos_csrf=".length))
  };
}

export async function loginOwner(server) {
  return loginWithCredential(server, server.ownerCredential);
}
