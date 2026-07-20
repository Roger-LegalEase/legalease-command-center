#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TEST_ID = /^test-[a-z0-9-]+\.mjs$/;
const ZERO_SHA = /^0+$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/i;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

function clean(value = "") {
  return String(value || "").trim();
}

function sorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en-US"));
}

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd:options.cwd || process.cwd(),
    env:options.env || process.env,
    encoding:"utf8",
    timeout:options.timeout || COMMAND_TIMEOUT_MS,
    maxBuffer:MAX_OUTPUT_BYTES
  });
  if (options.stream !== false) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result;
}

function requireCommand(result, label) {
  if (result.error) throw new Error(`${label} could not execute: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} ended from signal ${result.signal}.`);
  if (result.status !== 0) throw new Error(`${label} exited with status ${result.status}.`);
}

function commitExists(sha) {
  if (!COMMIT_SHA.test(sha)) return false;
  const result = command("git", ["cat-file", "-e", `${sha}^{commit}`], { stream:false });
  return !result.error && !result.signal && result.status === 0;
}

export function parseExtendedOutput(output, exitStatus, label) {
  const source = String(output || "");
  const headers = [...source.matchAll(/^Extended tests: (\d+) to run, (\d+) quarantined \((\d+) covered by npm test\)\.$/gm)];
  if (headers.length !== 1) throw new Error(`${label} output did not contain exactly one extended-suite header.`);
  const discoveredCount = Number(headers[0][1]);
  const quarantinedCount = Number(headers[0][2]);
  const executionLines = [...source.matchAll(/^(PASS|FAIL) (test-[a-z0-9-]+\.mjs)\s*$/gm)];
  const discoveredTests = sorted(executionLines.map((match) => match[2]));
  const failLines = sorted(executionLines.filter((match) => match[1] === "FAIL").map((match) => match[2]));
  if (executionLines.length !== discoveredCount || discoveredTests.length !== discoveredCount) {
    throw new Error(`${label} executed test identities did not match its discovered count.`);
  }
  const failureSummaries = [...source.matchAll(/^(\d+) extended test\(s\) failed: (.+)$/gm)];
  const successSummaries = [...source.matchAll(/^All (\d+) extended tests passed\.$/gm)];
  if (failureSummaries.length + successSummaries.length !== 1) {
    throw new Error(`${label} output did not contain exactly one parseable completion summary.`);
  }

  if (failureSummaries.length === 1) {
    if (exitStatus !== 1) throw new Error(`${label} reported test failures but exited with status ${exitStatus}.`);
    const expectedCount = Number(failureSummaries[0][1]);
    const summaryIds = sorted(failureSummaries[0][2].split(",").map(clean));
    if (summaryIds.some((id) => !TEST_ID.test(id))) throw new Error(`${label} reported an invalid failed-test identifier.`);
    if (summaryIds.length !== expectedCount || failLines.length !== expectedCount) {
      throw new Error(`${label} failure count did not match its deterministic identifiers.`);
    }
    if (JSON.stringify(summaryIds) !== JSON.stringify(failLines)) {
      throw new Error(`${label} FAIL lines did not match its completion summary.`);
    }
    return { discoveredCount, discoveredTests, quarantinedCount, failures:summaryIds };
  }

  if (exitStatus !== 0) throw new Error(`${label} reported success but exited with status ${exitStatus}.`);
  if (failLines.length) throw new Error(`${label} reported success while FAIL lines were present.`);
  if (Number(successSummaries[0][1]) !== discoveredCount) throw new Error(`${label} success count did not match its suite header.`);
  return { discoveredCount, discoveredTests, quarantinedCount, failures:[] };
}

function addWorktree(root, label, sha) {
  const directory = path.join(root, label);
  const result = command("git", ["worktree", "add", "--detach", directory, sha]);
  requireCommand(result, `git worktree add for ${label}`);
  return directory;
}

function removeWorktree(directory) {
  if (!directory) return;
  const result = command("git", ["worktree", "remove", "--force", directory]);
  requireCommand(result, `git worktree remove for ${directory}`);
}

function runExtendedDirectory(directory, label, sha) {
  console.log(`\n::group::${label} npm ci (${sha})`);
  const install = command("npm", ["ci"], { cwd:directory });
  console.log("::endgroup::");
  requireCommand(install, `${label} npm ci`);

  console.log(`\n::group::${label} raw extended output (${sha})`);
  const result = command("npm", ["run", "test:extended"], {
    cwd:directory,
    env:{ ...process.env, SKIP_ENV_LOCAL_FILE:"true" }
  });
  console.log("::endgroup::");
  if (result.error) throw new Error(`${label} extended suite could not execute: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} extended suite ended from signal ${result.signal}.`);
  if (![0, 1].includes(result.status)) throw new Error(`${label} extended suite exited with status ${result.status}.`);
  const parsed = parseExtendedOutput(`${result.stdout || ""}\n${result.stderr || ""}`, result.status, label);
  return parsed;
}

function printList(label, values) {
  console.log(`${label}: ${JSON.stringify(values)}`);
}

function main() {
  const eventName = clean(process.env.EXTENDED_PARITY_EVENT_NAME);
  const baseSha = clean(process.env.EXTENDED_PARITY_BASE_SHA);
  const headSha = clean(process.env.EXTENDED_PARITY_HEAD_SHA);
  const isPullRequest = eventName === "pull_request";
  if (!COMMIT_SHA.test(headSha) || !commitExists(headSha)) throw new Error(`Head commit is unavailable: ${headSha || "missing"}.`);

  const root = mkdtempSync(path.join(tmpdir(), "extended-parity-"));
  let baseDirectory = "";
  let headDirectory = "";
  try {
    const baseAvailable = COMMIT_SHA.test(baseSha) && !ZERO_SHA.test(baseSha) && commitExists(baseSha);
    if (!baseAvailable) {
      if (isPullRequest) throw new Error(`PR base commit is unavailable: ${baseSha || "missing"}.`);
      console.log(`No safe push base is available (${baseSha || "missing"}); retaining strict head behavior.`);
      headDirectory = addWorktree(root, "head", headSha);
      const head = runExtendedDirectory(headDirectory, "head", headSha);
      console.log(`Extended strict head failure count: ${head.failures.length}`);
      console.log(`Extended strict head quarantined count: ${head.quarantinedCount}`);
      printList("Extended strict head failures", head.failures);
      if (head.quarantinedCount) throw new Error("Extended tests may not be quarantined.");
      if (head.failures.length) throw new Error("Strict extended head suite is not clean.");
      return;
    }

    baseDirectory = addWorktree(root, "base", baseSha);
    const base = runExtendedDirectory(baseDirectory, "base", baseSha);
    headDirectory = addWorktree(root, "head", headSha);
    const head = runExtendedDirectory(headDirectory, "head", headSha);
    const baseFailures = new Set(base.failures);
    const headFailures = new Set(head.failures);
    const headTests = new Set(head.discoveredTests);
    const added = sorted(head.failures.filter((id) => !baseFailures.has(id)));
    const missing = sorted(base.failures.filter((id) => !headFailures.has(id)));
    const removedTests = sorted(base.discoveredTests.filter((id) => !headTests.has(id)));

    console.log("\nExtended failure-set parity summary");
    console.log(`Extended parity base SHA: ${baseSha}`);
    console.log(`Extended parity head SHA: ${headSha}`);
    console.log(`Extended parity base discovered count: ${base.discoveredCount}`);
    console.log(`Extended parity head discovered count: ${head.discoveredCount}`);
    console.log(`Extended parity base failure count: ${base.failures.length}`);
    console.log(`Extended parity head failure count: ${head.failures.length}`);
    console.log(`Extended parity base quarantined count: ${base.quarantinedCount}`);
    console.log(`Extended parity head quarantined count: ${head.quarantinedCount}`);
    printList("Extended parity added failures", added);
    printList("Extended parity missing failures", missing);
    printList("Extended parity removed tests", removedTests);
    if (base.quarantinedCount || head.quarantinedCount) throw new Error("Extended tests may not be quarantined.");
    if (head.discoveredCount < base.discoveredCount) throw new Error("Extended discovery count dropped.");
    if (removedTests.length) throw new Error("Previously discovered extended tests disappeared.");
    if (added.length || missing.length) throw new Error("Extended failure-set parity changed.");
  } finally {
    removeWorktree(headDirectory);
    removeWorktree(baseDirectory);
    rmSync(root, { recursive:true, force:true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Extended parity comparison failed: ${error?.message || error}`);
  process.exitCode = 1;
}
