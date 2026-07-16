#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
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

function serverEnvironment({ dataPath, vnext, restricted = false, restrictedCredential = "", sessionSecret = "" }) {
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
    COMMAND_CENTER_AUTH_DISABLED:restricted ? "false" : "true",
    COMMAND_CENTER_REQUIRE_AUTH:restricted ? "true" : "false",
    COMMAND_CENTER_OPERATOR_TOKEN:restricted ? restrictedCredential : "",
    COMMAND_CENTER_SESSION_SECRET:restricted ? sessionSecret : "",
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

function browserFixtureState(seed) {
  const post = Object.freeze({
    id:"browser-post-search-001",
    title:"Café launch update",
    hook:"A founder-ready résumé of the launch",
    body:"Draft-only search fixture.",
    channel:"linkedin",
    status:"draft",
    updatedAt:"2026-07-16T12:00:00.000Z"
  });
  const hiddenPost = Object.freeze({
    id:"browser-post-owner-only-001",
    title:"Owner-only launch plan",
    status:"draft",
    visibility:"owner_only",
    updatedAt:"2026-07-16T13:00:00.000Z"
  });
  const campaign = Object.freeze({
    id:"browser-campaign-001",
    name:"Example outreach campaign",
    title:"Example outreach campaign",
    campaignType:"announcement",
    goal:"Share the browser launch update.",
    status:"draft",
    channel:"email",
    createdAt:"2026-07-15T12:00:00.000Z",
    updatedAt:"2026-07-15T12:00:00.000Z"
  });
  const partner = Object.freeze({
    id:"browser-partner-001",
    name:"Example community partner",
    organization:"Example community partner",
    primaryContactName:"Example Partner",
    geography:"Québec",
    nextAction:"Review the launch plan.",
    status:"qualified",
    createdAt:"2026-07-15T12:00:00.000Z",
    updatedAt:"2026-07-15T12:00:00.000Z"
  });
  const file = Object.freeze({
    id:"browser-file-search-001",
    name:"Launch readiness brief",
    section:"Company overview",
    notes:"Browser fixture file record.",
    status:"current",
    updatedAt:"2026-07-14T12:00:00.000Z"
  });
  const task = Object.freeze({
    id:"browser-task-search-001",
    title:"Finish launch checklist",
    description:"Confirm the browser search experience.",
    nextAction:"Open the exact Task.",
    status:"open",
    priority:"high",
    updatedAt:"2026-07-13T12:00:00.000Z"
  });
  const report = Object.freeze({
    id:"browser-report-search-001",
    reportTitle:"Launch results report",
    summary:"Representative browser Search report.",
    reportingPeriod:"Q3 2026",
    status:"current",
    generatedAt:"2026-07-12T12:00:00.000Z"
  });
  return {
    ...seed,
    posts:[post, hiddenPost, ...(Array.isArray(seed.posts) ? seed.posts : []).filter((item) => ![post.id, hiddenPost.id].includes(item?.id))],
    campaigns:[campaign, ...(Array.isArray(seed.campaigns) ? seed.campaigns : []).filter((item) => item?.id !== campaign.id)],
    partners:[partner, ...(Array.isArray(seed.partners) ? seed.partners : []).filter((item) => item?.id !== partner.id)],
    dataRoomItems:[file, ...(Array.isArray(seed.dataRoomItems) ? seed.dataRoomItems : []).filter((item) => item?.id !== file.id)],
    tasks:[task, ...(Array.isArray(seed.tasks) ? seed.tasks : []).filter((item) => item?.id !== task.id)],
    reports:[report, ...(Array.isArray(seed.reports) ? seed.reports : []).filter((item) => item?.id !== report.id)]
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

async function startServer({ name, dataPath, vnext, restricted = false, restrictedCredential = "", sessionSecret = "" }) {
  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd:projectRoot,
    env:serverEnvironment({ dataPath, vnext, restricted, restrictedCredential, sessionSecret }),
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

const fixtureState = browserFixtureState(JSON.parse(await readFile(seedPath, "utf8")));
await rm(path.join(projectRoot, "playwright-report"), { recursive:true, force:true });
await rm(artifactDir, { recursive:true, force:true });
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "legalease-browser-tests-"));
const legacyDataPath = path.join(tempRoot, "legacy-state.json");
const vnextDataPath = path.join(tempRoot, "vnext-state.json");
const createDataPath = path.join(tempRoot, "create-state.json");
const restrictedDataPath = path.join(tempRoot, "restricted-state.json");
await Promise.all([
  writeFile(legacyDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(vnextDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(createDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(restrictedDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 })
]);
const restrictedCredential = crypto.randomBytes(32).toString("base64url");
const restrictedSessionSecret = crypto.randomBytes(32).toString("base64url");
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
    dataPath:legacyDataPath,
    vnext:false
  }));
  servers.push(await startServer({
    name:"vnext",
    dataPath:vnextDataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"create",
    dataPath:createDataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"restricted",
    dataPath:restrictedDataPath,
    vnext:true,
    restricted:true,
    restrictedCredential,
    sessionSecret:restrictedSessionSecret
  }));
  const runnerEnv = {
    ...inheritedEnvironment(),
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"true",
    SKIP_ENV_LOCAL_FILE:"1",
    CI:process.env.CI || "",
    BROWSER_TEST_BASE_URL:servers[0].baseURL,
    BROWSER_TEST_VNEXT_BASE_URL:servers[1].baseURL,
    BROWSER_TEST_CREATE_BASE_URL:servers[2].baseURL,
    BROWSER_TEST_RESTRICTED_BASE_URL:servers[3].baseURL,
    BROWSER_TEST_RESTRICTED_CREDENTIAL:restrictedCredential
  };
  exitCode = await runPlaywright(runnerEnv, process.argv.slice(2));
} finally {
  await shutdown(servers, tempRoot);
}

process.exitCode = exitCode;
