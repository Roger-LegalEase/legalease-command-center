import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createLocalFilesStorage } from "./files-storage-adapter.mjs";
import { createFilesOrganizationService } from "./ui-actions/files-organize.mjs";
import { createFilesReportService } from "./ui-actions/files-reports.mjs";
import { createFilesUploadService } from "./ui-actions/files-upload.mjs";
import { buildFileDetails } from "./ui/view-models/file-details.mjs";
import { buildFilesHome } from "./ui/view-models/files-home.mjs";
import { buildInvestorRoom } from "./ui/view-models/investor-room.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ccx-607-files-"));
try {
  const owner = { authenticated:true, role:"owner", name:"Roger" };
  let state = { reports:[], dataRoomItems:[], evidencePackNotes:[], soc2Evidence:[], soc2Policies:[], brandAssets:[], activityEvents:[], auditHistory:[] };
  const readState = async () => structuredClone(state);
  const writeCollections = async (patch) => { state = { ...state, ...structuredClone(patch) }; };
  const upload = createFilesUploadService({ readState, writeCollections, storage:createLocalFilesStorage({ rootDir:root }), now:() => "2026-07-19T10:00:00.000Z", randomId:() => "acceptance-upload" });
  const created = await upload.upload({ actor:owner, input:{ requestId:"accept-upload", name:"Partner brief", fileName:"partner-brief.md", contentType:"text/markdown", collection:"partner-files" }, bytes:Buffer.from("Synthetic partner brief") });
  assert.equal(created.created, true);
  assert.equal(buildFileDetails(state, `data-room-item:${created.fileId}`, owner).preview.kind, "markdown");

  const organize = createFilesOrganizationService({ readState, writeCollections, now:() => "2026-07-19T10:05:00.000Z" });
  await organize.apply({ actor:owner, sourceKind:"data-room-item", sourceId:created.fileId, action:"relate-partner", value:"partner-1", requestId:"relate-1" });
  await organize.apply({ actor:owner, sourceKind:"data-room-item", sourceId:created.fileId, action:"star", requestId:"star-1" });
  const home = buildFilesHome(state, owner, { view:"recent" }, { cursorSecret:"acceptance-cursor-secret" });
  assert.equal(home.items.some((item) => item.id === `data-room-item:${created.fileId}` && item.starred), true);
  assert.equal(buildFileDetails(state, `data-room-item:${created.fileId}`, owner).related.some((item) => item.href === "#partners/partner/partner-1"), true);

  const reports = createFilesReportService({ readState, writeCollections, now:() => "2026-07-19T10:10:00.000Z", generateReport:async ({ requestId }) => { const report = { id:"acceptance-report", title:"Investor update", status:"current", verifiedAt:"2026-07-19T10:10:00.000Z", generatedAt:"2026-07-19T10:10:00.000Z", markdownPath:"data/reports/investor.md", filesGenerationRequestId:requestId }; state.reports = [report, ...state.reports]; return { report }; } });
  const report = await reports.generate({ actor:owner, reportType:"investor_update", requestId:"report-1" });
  await reports.place({ actor:owner, reportId:"acceptance-report", collection:"investor-room" });
  assert.equal(report.file.href, "#files/report/acceptance-report");

  state.dataRoomItems.push({ id:"stale-legal", title:"Legal review", fileName:"legal.pdf", status:"current", verifiedAt:"2025-01-01T00:00:00.000Z", allowedRoles:["owner"] });
  const investor = buildInvestorRoom(state, owner, [
    { id:"investor-update", name:"Investor update", section:"Traction", sourceRefs:["report:acceptance-report"], staleAfterDays:30 },
    { id:"legal-review", name:"Legal review", section:"Legal & Compliance", sourceRefs:["data-room-item:stale-legal"], staleAfterDays:90 }
  ], "2026-07-19T12:00:00.000Z");
  assert.equal(investor.readiness.percentage, 50);
  assert.equal(investor.summary.needsUpdate, 1);
  assert.equal(buildFileDetails(state, "data-room-item:stale-legal", { authenticated:true, role:"operator" }), null);

  const beforeFailure = JSON.stringify(state);
  const failedUpload = createFilesUploadService({ readState, writeCollections, storage:{ put:async () => { throw new Error("storage unavailable"); }, remove:async () => {} }, now:() => "2026-07-19T12:00:00.000Z", randomId:() => "failed" });
  await assert.rejects(failedUpload.upload({ actor:owner, input:{ requestId:"failed", fileName:"failed.pdf", contentType:"application/pdf" }, bytes:Buffer.from("x") }), /storage unavailable/);
  assert.equal(JSON.stringify(state), beforeFailure);
  const failedReadiness = buildInvestorRoom(state, owner, [{ id:"failed", name:"Failed upload", section:"Company", sourceRefs:["data-room-item:failed"] }], "2026-07-19T12:00:00.000Z");
  assert.equal(failedReadiness.readiness.percentage, 0);
  assert.equal(failedReadiness.summary.missing, 1);
  assert.equal(state.auditHistory.some((item) => /publish|send|provider/i.test(item.action)), false);
} finally {
  await rm(root, { recursive:true, force:true });
}

console.log("Files end-to-end acceptance tests passed.");
