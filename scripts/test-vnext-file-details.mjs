import assert from "node:assert/strict";

import { readFileDetails } from "./ui-api/file-details-read.mjs";
import { renderFileDetails } from "./ui/pages/file-details.mjs";

const actor = { authenticated:true, role:"owner" };
const state = {
  reports:[{ id:"report-1", title:"Partner outcome report", markdownPath:"data/reports/outcome.md", status:"draft", partnerId:"partner-1", campaignId:"campaign-1", owner:"Roger", generatedAt:"2026-07-19T12:00:00.000Z" }],
  dataRoomItems:[{ id:"pdf-1", title:"Company overview", fileName:"overview.pdf", filePath:"data/uploads/overview.pdf", status:"current" }],
  brandAssets:[{ id:"image-1", name:"White logo", mimeType:"image/png", filePath:"assets/brand/logos/white.png", approved:true }],
  evidencePackNotes:[], soc2Evidence:[], soc2Policies:[],
  activityEvents:[{ id:"event-1", eventType:"file generated", relatedObjectType:"reports", relatedObjectId:"report-1", createdAt:"2026-07-19T12:00:00.000Z", payload:{ secret:"not projected" } }],
  auditHistory:[]
};

const details = readFileDetails({ state, actor, sourceKind:"report", sourceId:"report-1" });
assert.equal(details.file.id, "report:report-1");
assert.equal(details.preview.kind, "markdown");
assert.equal(details.preview.href, "/api/ui/files/report/report-1/content");
assert.equal(details.actions.downloadHref, "/api/ui/files/report/report-1/content?download=1");
assert.deepEqual(details.tabs, ["Preview", "Details", "Activity", "Sharing", "Related"]);
assert.deepEqual(details.related.map((item) => item.href).sort(), ["#outreach/campaign/campaign-1", "#partners/partner/partner-1"]);
assert.equal(JSON.stringify(details).includes("not projected"), false);
assert.equal(details.sharing.public, false);
const html = renderFileDetails(details);
assert.match(html, /data-file-tab="preview"/);
assert.match(html, /#partners\/partner\/partner-1/);
assert.doesNotMatch(html, /target="_blank"/);

const pdf = readFileDetails({ state, actor, sourceKind:"data-room-item", sourceId:"pdf-1" });
assert.equal(pdf.preview.kind, "pdf");
assert.match(renderFileDetails(pdf), /<iframe/);
const image = readFileDetails({ state, actor, sourceKind:"brand-asset", sourceId:"image-1" });
assert.equal(image.preview.kind, "image");
assert.match(renderFileDetails(image), /<img/);
assert.equal(readFileDetails({ state, actor:{ authenticated:false, role:"owner" }, sourceKind:"report", sourceId:"report-1" }), null);
assert.match(renderFileDetails(null), /File not available/);

console.log("File details tests passed.");
