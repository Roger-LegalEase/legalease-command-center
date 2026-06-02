import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.TEST_PORT || 3199);
const baseUrl = `http://127.0.0.1:${port}`;

function readLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  const values = {};
  if (!existsSync(envPath)) return values;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[trimmed.slice(0, index).trim()] = value;
  }
  return values;
}

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    if (logs.includes("LegalEase preview server ready")) return;
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server: ${logs}`);
}

async function main() {
  const env = readLocalEnv();
  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: rootDir,
    env: { ...process.env, ...env, PORT:String(port), NODE_DISABLE_COMPILE_CACHE:"1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitForServer(child);
    const exportResponse = await fetch(`${baseUrl}/api/soc2/evidence-snapshot/export`);
    assert.equal(exportResponse.status, 200, "export endpoint should return 200");
    assert.match(exportResponse.headers.get("content-type") || "", /text\/markdown/, "export should be markdown");
    assert.match(exportResponse.headers.get("content-disposition") || "", /legalease-soc2-readiness-snapshot-\d{4}-\d{2}\.md/, "export should suggest a safe filename");
    const markdown = await exportResponse.text();
    for (const heading of [
      "# LegalEase SOC 2 Readiness Snapshot",
      "## Executive Summary",
      "## Readiness by Control Area",
      "## AI Governance Summary",
      "## Evidence Collected This Month",
      "## Evidence Quality",
      "## Evidence Review Summary",
      "## Overdue Evidence Collection",
      "## Control Owners",
      "## Type I Readiness Checklist",
      "## Audit Log Highlights",
      "## Type I Readiness Gaps",
      "## Type II Readiness Gaps",
      "## Disclaimer"
    ]) {
      assert.ok(markdown.includes(heading), `markdown should include ${heading}`);
    }
    assert.ok(markdown.includes("SOC 2 Readiness, not SOC 2 compliance"), "markdown should avoid compliance claims");
    for (const secretKey of ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const secret = env[secretKey];
      if (secret) assert.ok(!markdown.includes(secret), `markdown must not leak ${secretKey}`);
    }

    const snapshotResponse = await fetch(`${baseUrl}/api/soc2/evidence-snapshot`);
    assert.equal(snapshotResponse.status, 200, "snapshot endpoint should return 200");
    const snapshotJson = await snapshotResponse.json();
    assert.ok(snapshotJson.evidenceQuality, "snapshot should include evidence quality metrics");
    assert.ok(Array.isArray(snapshotJson.controlOwners), "snapshot should include control owners");
    assert.ok(Array.isArray(snapshotJson.typeIChecklist), "snapshot should include Type I checklist");
    assert.ok(snapshotJson.readinessBand, "snapshot should include a plain-English readiness band");

    const evidenceId = `soc2-test-evidence-${Date.now()}`;
    const testEvidenceResponse = await fetch(`${baseUrl}/api/growth/upsert`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({
        collection:"soc2Evidence",
        item:{
          id:evidenceId,
          evidenceTitle:"SOC 2 QA evidence review fixture",
          controlArea:"Evidence Collection",
          sourceSystem:"QA",
          owner:"QA",
          evidenceStatus:"Draft",
          evidenceQuality:"Acceptable",
          collectionDate:new Date().toISOString().slice(0, 10)
        }
      })
    });
    assert.equal(testEvidenceResponse.status, 200, "test should create an isolated evidence record");
    const testEvidence = await testEvidenceResponse.json();
    const targetEvidence = testEvidence.item;
    assert.ok(targetEvidence?.id, "test needs an evidence record to review");

    const readyResponse = await fetch(`${baseUrl}/api/soc2/evidence/${encodeURIComponent(targetEvidence.id)}/review`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ action:"mark_ready", reviewer:"QA", reviewNotes:"Ready for auditor-style review.", evidenceQuality:"Strong", nextCollectionDue:"2099-01-01" })
    });
    assert.equal(readyResponse.status, 200, "mark ready action should return 200");
    const readyResult = await readyResponse.json();
    assert.equal(readyResult.item.evidenceStatus, "Ready for Review");
    assert.equal(readyResult.item.evidenceQuality, "Strong");
    assert.equal(readyResult.item.nextCollectionDue, "2099-01-01");

    const approveResponse = await fetch(`${baseUrl}/api/soc2/evidence/${encodeURIComponent(targetEvidence.id)}/review`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ action:"approve", reviewer:"QA", reviewNotes:"Approved for readiness file." })
    });
    assert.equal(approveResponse.status, 200, "approve evidence action should return 200");
    const approveResult = await approveResponse.json();
    assert.equal(approveResult.item.evidenceStatus, "Approved");
    assert.ok(approveResult.item.reviewedAt, "approved evidence should record reviewedAt");

    const createResponse = await fetch(`${baseUrl}/api/soc2/evidence-snapshot`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:"{}"
    });
    assert.equal(createResponse.status, 200, "snapshot creation should return 200");
    const created = await createResponse.json();
    assert.equal(created.item.controlArea, "Evidence Collection");
    assert.match(created.item.artifactFilename || "", /legalease-soc2-readiness-snapshot-\d{4}-\d{2}\.md/);
    assert.equal(created.item.link, "/api/soc2/evidence-snapshot/export");
    assert.ok(created.item.generatedAt, "snapshot evidence should record generatedAt");

    const stateResponse = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateResponse.status, 200, "state endpoint should return 200");
    const state = await stateResponse.json();
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "soc2 markdown snapshot exported"), "export should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "evidence marked ready for review"), "mark ready should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "evidence approved"), "approve should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "evidence quality changed"), "quality change should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "next collection due date changed"), "next due change should create audit log entry");
    assert.equal(Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate.enabled).length, 0, "live gates must remain disabled");
  } finally {
    child.kill("SIGTERM");
  }
}

main().then(() => console.log("SOC 2 markdown export test passed."));
