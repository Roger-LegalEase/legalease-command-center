import assert from "node:assert/strict";
import { loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

async function main() {
  const server = await startPreviewServer();
  try {
    const login = await loginOwner(server);
    const request = (pathname, options = {}) => {
      const method = String(options.method || "GET").toUpperCase();
      return fetch(`${server.baseUrl}${pathname}`, {
        ...options,
        headers: {
          cookie:login.cookie,
          ...(method === "GET" || method === "HEAD" ? {} : { "x-csrf-token":login.csrfToken }),
          ...(options.headers || {})
        },
        signal:options.signal || AbortSignal.timeout(10_000)
      });
    };

    const exportResponse = await request("/api/soc2/evidence-snapshot/export");
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
    assert.ok(!markdown.includes(server.ownerCredential), "markdown must not leak the synthetic owner credential");

    const snapshotResponse = await request("/api/soc2/evidence-snapshot");
    assert.equal(snapshotResponse.status, 200, "snapshot endpoint should return 200");
    const snapshotJson = await snapshotResponse.json();
    assert.ok(snapshotJson.evidenceQuality, "snapshot should include evidence quality metrics");
    assert.ok(Array.isArray(snapshotJson.controlOwners), "snapshot should include control owners");
    assert.ok(Array.isArray(snapshotJson.typeIChecklist), "snapshot should include Type I checklist");
    assert.ok(snapshotJson.readinessBand, "snapshot should include a plain-English readiness band");

    const evidenceId = `soc2-test-evidence-${Date.now()}`;
    const testEvidenceResponse = await request("/api/growth/upsert", {
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

    const readyResponse = await request(`/api/soc2/evidence/${encodeURIComponent(targetEvidence.id)}/review`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ action:"mark_ready", reviewer:"QA", reviewNotes:"Ready for auditor-style review.", evidenceQuality:"Strong", nextCollectionDue:"2099-01-01" })
    });
    assert.equal(readyResponse.status, 200, "mark ready action should return 200");
    const readyResult = await readyResponse.json();
    assert.equal(readyResult.item.evidenceStatus, "Ready for Review");
    assert.equal(readyResult.item.evidenceQuality, "Strong");
    assert.equal(readyResult.item.nextCollectionDue, "2099-01-01");

    const approveResponse = await request(`/api/soc2/evidence/${encodeURIComponent(targetEvidence.id)}/review`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ action:"approve", reviewer:"QA", reviewNotes:"Approved for readiness file." })
    });
    assert.equal(approveResponse.status, 200, "approve evidence action should return 200");
    const approveResult = await approveResponse.json();
    assert.equal(approveResult.item.evidenceStatus, "Approved");
    assert.ok(approveResult.item.reviewedAt, "approved evidence should record reviewedAt");

    const createResponse = await request("/api/soc2/evidence-snapshot", {
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

    const stateResponse = await request("/api/state");
    assert.equal(stateResponse.status, 200, "state endpoint should return 200");
    const state = await stateResponse.json();
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "soc2 markdown snapshot exported"), "export should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "evidence marked ready for review"), "mark ready should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "evidence approved"), "approve should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "evidence quality changed"), "quality change should create audit log entry");
    assert.ok((state.soc2AuditLogs || []).some(entry => entry.action === "next collection due date changed"), "next due change should create audit log entry");
    assert.equal(Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate.enabled).length, 0, "live gates must remain disabled");
  } finally {
    await server.stop();
  }
}

main().then(() => console.log("SOC 2 markdown export test passed."));
