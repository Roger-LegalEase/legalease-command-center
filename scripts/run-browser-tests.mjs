#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(projectRoot, "data", "seed", "social-command-center.seed.json");
const networkGuardPath = path.join(projectRoot, "scripts", "test-support", "browser-network-guard.mjs");
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const artifactDir = path.join(projectRoot, "test-results");
const inheritedNames = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];
const activeChildren = new Set();
let shutdownPromise = null;

function inheritedEnvironment() {
  return Object.fromEntries(inheritedNames.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
}

function sanitizedLog(value = "") {
  return String(value)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]");
}

function serverEnvironment({ dataPath, vnext }) {
  return {
    ...inheritedEnvironment(),
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"true",
    SKIP_ENV_LOCAL_FILE:"1",
    NODE_DISABLE_COMPILE_CACHE:"1",
    NODE_OPTIONS:`--import=${networkGuardPath}`,
    HOST:"127.0.0.1",
    PORT:"0",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_ALLOW_JSON:"true",
    LOCAL_DEMO_MODE:"true",
    COMMAND_CENTER_AUTH_DISABLED:"true",
    COMMAND_CENTER_REQUIRE_AUTH:"false",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_SEED_PATH:seedPath,
    COMMAND_CENTER_UX_VNEXT:vnext ? "true" : "false",
    LIVE_POSTING_ENABLED:"false",
    ENABLE_LIVE_LINKEDIN_POSTING:"false",
    ENABLE_LIVE_FACEBOOK_POSTING:"false",
    ENABLE_LIVE_INSTAGRAM_POSTING:"false",
    ENABLE_LIVE_X_POSTING:"false",
    ENABLE_LIVE_THREADS_POSTING:"false",
    ENABLE_LIVE_TIKTOK_POSTING:"false",
    LINKEDIN_LIVE_POSTING:"false",
    FACEBOOK_LIVE_POSTING:"false",
    INSTAGRAM_LIVE_POSTING:"false",
    X_LIVE_POSTING:"false",
    REACTIVATION_LIVE_SEND:"false",
    OUTREACH_LIVE_SEND:"false",
    ALERT_EMAIL_LIVE_SEND:"false",
    PROSPECT_LIVE_DISCOVERY:"false",
    SENDGRID_WEBHOOK_ENABLED:"false",
    PRODUCT_EVENT_WEBHOOK_ENABLED:"false",
    PRODUCT_WEBHOOK_ENABLED:"false",
    ALLOW_LOCAL_IMAGE_FALLBACK:"false"
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(child, timeoutMs = 3_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
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
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (!await waitForExit(child)) {
    child.kill("SIGKILL");
    await waitForExit(child);
  }
  activeChildren.delete(child);
}

async function startServer({ name, dataPath, vnext }) {
  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd:projectRoot,
    env:serverEnvironment({ dataPath, vnext }),
    stdio:["ignore", "pipe", "pipe"]
  });
  activeChildren.add(child);
  child.once("exit", () => activeChildren.delete(child));
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  const startedAt = Date.now();
  let port = 0;
  while (Date.now() - startedAt < 20_000) {
    const match = logs.match(/LegalEase preview server ready at http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) {
      port = Number(match[1]);
      break;
    }
    if (child.exitCode !== null) throw new Error(`${name} server exited before readiness:\n${sanitizedLog(logs).slice(-4_000)}`);
    await wait(50);
  }
  if (!port) {
    await stopChild(child);
    throw new Error(`${name} server did not announce readiness:\n${sanitizedLog(logs).slice(-4_000)}`);
  }

  const baseURL = `http://127.0.0.1:${port}`;
  const healthStartedAt = Date.now();
  while (Date.now() - healthStartedAt < 10_000) {
    try {
      const response = await fetch(`${baseURL}/api/health`, { signal:AbortSignal.timeout(1_000) });
      if (response.ok && (await response.json()).status === "ok") {
        return { name, baseURL, child, logs:() => sanitizedLog(logs) };
      }
    } catch {
      // Readiness is bounded below; transient connection failures are expected during startup.
    }
    await wait(50);
  }
  await stopChild(child);
  throw new Error(`${name} server failed its health check:\n${sanitizedLog(logs).slice(-4_000)}`);
}

async function writeServerLogs(servers) {
  await mkdir(artifactDir, { recursive:true });
  await Promise.all(servers.map((server) => writeFile(
    path.join(artifactDir, `browser-server-${server.name}.log`),
    `${server.logs()}\n`,
    { mode:0o600 }
  )));
}

async function shutdown(servers, tempRoot) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    await writeServerLogs(servers).catch(() => {});
    await Promise.all([...activeChildren].map((child) => stopChild(child)));
    if (tempRoot) await rm(tempRoot, { recursive:true, force:true });
  })();
  return shutdownPromise;
}

function runPlaywright(env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, "test", ...args], {
      cwd:projectRoot,
      env,
      stdio:"inherit"
    });
    activeChildren.add(child);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChildren.delete(child);
      if (signal) resolve(1);
      else resolve(Number(code) || 0);
    });
  });
}

await readFile(seedPath, "utf8");
await rm(path.join(projectRoot, "playwright-report"), { recursive:true, force:true });
await rm(artifactDir, { recursive:true, force:true });
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "legalease-browser-tests-"));
const servers = [];

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await shutdown(servers, tempRoot);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

let exitCode = 1;
try {
  servers.push(await startServer({
    name:"legacy",
    dataPath:path.join(tempRoot, "legacy-state.json"),
    vnext:false
  }));
  servers.push(await startServer({
    name:"vnext",
    dataPath:path.join(tempRoot, "vnext-state.json"),
    vnext:true
  }));
  const runnerEnv = {
    ...inheritedEnvironment(),
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"true",
    SKIP_ENV_LOCAL_FILE:"1",
    CI:process.env.CI || "",
    BROWSER_TEST_BASE_URL:servers[0].baseURL,
    BROWSER_TEST_VNEXT_BASE_URL:servers[1].baseURL
  };
  exitCode = await runPlaywright(runnerEnv, process.argv.slice(2));
} finally {
  await shutdown(servers, tempRoot);
}

process.exitCode = exitCode;
