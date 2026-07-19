import assert from "node:assert/strict";

import { createFilesReportService } from "./ui-actions/files-reports.mjs";
import { buildFileViews } from "./ui/view-models/file-view.mjs";

const actor = { authenticated:true, role:"owner" };
let state = { reports:[], dataRoomItems:[], evidencePackNotes:[{ id:"evidence-1", title:"Reviewed evidence", status:"draft" }], soc2Evidence:[], soc2Policies:[], brandAssets:[], activityEvents:[], auditHistory:[] };
let generations = 0;
let writes = 0;
const service = createFilesReportService({
  generateReport:async ({ reportType, requestId }) => {
    generations += 1;
    const report = { id:"generated-1", title:"Campaign results", reportType, status:"draft", generatedAt:"2026-07-19T14:00:00.000Z", markdownPath:"data/reports/generated-1.md", filesGenerationRequestId:requestId };
    state.reports = [report];
    return { report };
  },
  readState:async () => structuredClone(state),
  writeCollections:async (patch) => { writes += 1; state = { ...state, ...structuredClone(patch) }; },
  now:() => "2026-07-19T15:00:00.000Z"
});

const generated = await service.generate({ actor, reportType:"campaign_results", requestId:"request-1" });
assert.equal(generated.created, true);
assert.equal(generated.file.id, "report:generated-1");
assert.equal(generated.file.href, "#files/report/generated-1");
assert.equal(generated.file.status.key, "draft");
assert.equal(state.dataRoomItems.length, 0, "Generating a report must not copy it into another File source.");
const repeated = await service.generate({ actor, reportType:"campaign_results", requestId:"request-1" });
assert.equal(repeated.created, false);
assert.equal(generations, 1);

const placed = await service.place({ actor, reportId:"generated-1", collection:"investor-room", expectedUpdatedAt:"2026-07-19T14:00:00.000Z" });
assert.equal(placed.changed, true);
assert.equal(state.reports[0].filesCollection, "investor-room");
assert.equal(writes, 1);
const placedAgain = await service.place({ actor, reportId:"generated-1", collection:"investor-room" });
assert.equal(placedAgain.changed, false);
assert.equal(writes, 1);
const views = buildFileViews(state, actor);
assert.equal(views.filter((file) => file.sourceId === "generated-1").length, 1);
assert.equal(views.some((file) => file.sourceKind === "evidence-note" && file.sourceId === "evidence-1"), true, "Evidence remains discoverable through its source projection.");
await assert.rejects(service.place({ actor:{ authenticated:true, role:"viewer" }, reportId:"generated-1", collection:"investor-room" }), /cannot generate or organize/);
await assert.rejects(service.place({ actor, reportId:"generated-1", collection:"fake" }), /valid Files collection/);

console.log("Files report integration tests passed.");
