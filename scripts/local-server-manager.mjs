import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localDir = resolve(projectRoot, ".local");
const pidPath = resolve(localDir, "preview-server.pid");
const logPath = resolve(localDir, "preview-server.log");
const port = Number(process.env.PORT || 3001);
const url = `http://127.0.0.1:${port}/#queue`;
const healthUrl = `http://127.0.0.1:${port}/api/debug/env`;

function ensureLocalDir() {
  mkdirSync(localDir, { recursive: true });
}

function readPid() {
  if (!existsSync(pidPath)) return 0;
  const value = Number(readFileSync(pidPath, "utf8").trim());
  return Number.isFinite(value) ? value : 0;
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    return false;
  }
}

async function isHttpReady() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReady(timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isHttpReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function status({ quiet = false } = {}) {
  const pid = readPid();
  const processAlive = isProcessAlive(pid);
  const httpReady = await isHttpReady();
  const state = {
    pid,
    processAlive,
    httpReady,
    url,
    logPath,
    pidPath
  };
  if (!quiet) {
    console.log(JSON.stringify(state, null, 2));
  }
  return state;
}

async function start() {
  ensureLocalDir();
  const current = await status({ quiet: true });
  if (current.httpReady) {
    console.log(`LegalEase is already running at ${url}`);
    return current;
  }
  if (current.pid && !current.processAlive) {
    rmSync(pidPath, { force: true });
  }

  appendFileSync(logPath, `\n\n[${new Date().toISOString()}] Starting LegalEase preview server on port ${port}\n`);
  const outputFd = openSync(logPath, "a");
  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", outputFd, outputFd],
    env: {
      ...process.env,
      PORT: String(port),
      NODE_DISABLE_COMPILE_CACHE: "1"
    }
  });
  child.unref();
  writeFileSync(pidPath, String(child.pid));

  const ready = await waitForReady();
  if (!ready) {
    console.error(`Started process ${child.pid}, but the app did not become ready. Check ${logPath}`);
    process.exitCode = 1;
    return status({ quiet: true });
  }
  console.log(`LegalEase is running at ${url}`);
  return status({ quiet: true });
}

async function stop() {
  const pid = readPid();
  if (!pid) {
    console.log("No saved LegalEase server PID found.");
    return;
  }
  if (isProcessAlive(pid)) {
    process.kill(pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (isProcessAlive(pid)) process.kill(pid, "SIGKILL");
    console.log(`Stopped LegalEase server process ${pid}.`);
  } else {
    console.log(`Saved PID ${pid} is not running.`);
  }
  rmSync(pidPath, { force: true });
}

async function restart() {
  await stop();
  await start();
}

async function keepAlive() {
  ensureLocalDir();
  console.log(`Keeping LegalEase visible at ${url}`);
  console.log(`Logs: ${logPath}`);
  await start();
  setInterval(async () => {
    const current = await status({ quiet: true });
    if (!current.httpReady) {
      console.log(`[${new Date().toISOString()}] App not reachable. Restarting...`);
      await restart();
    }
  }, 5000);
}

const command = process.argv[2] || "status";

if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "restart") await restart();
else if (command === "status") await status();
else if (command === "keepalive") await keepAlive();
else {
  console.error("Usage: node scripts/local-server-manager.mjs [start|stop|restart|status|keepalive]");
  process.exitCode = 1;
}
