import assert from "node:assert/strict";

import { createFilesSharingService, FILE_SHARING_CONTRACT } from "./ui-actions/files-sharing.mjs";
import { buildFileView } from "./ui/view-models/file-view.mjs";

let state = {
  dataRoomItems:[{ id:"private-1", title:"Private overview", fileName:"overview.pdf", status:"current", allowedRoles:["owner"], updatedAt:"2026-07-19T10:00:00.000Z", storageRef:"private/overview.pdf" }],
  reports:[], evidencePackNotes:[], soc2Evidence:[], soc2Policies:[], brandAssets:[], activityEvents:[], auditHistory:[]
};
let writes = 0;
const owner = { authenticated:true, role:"owner" };
const operator = { authenticated:true, role:"operator" };
const service = createFilesSharingService({
  readState:async () => structuredClone(state),
  writeCollections:async (patch) => { writes += 1; state = { ...state, ...structuredClone(patch) }; },
  now:() => "2026-07-19T11:00:00.000Z"
});

assert.equal(buildFileView(state, "data-room-item:private-1", operator), null);
const granted = await service.grant({ actor:owner, sourceKind:"data-room-item", sourceId:"private-1", targetRole:"operator", expectedUpdatedAt:"2026-07-19T10:00:00.000Z", requestId:"grant-1" });
assert.equal(granted.changed, true);
assert.equal(granted.public, false);
assert.ok(buildFileView(state, "data-room-item:private-1", operator));
assert.equal(buildFileView(state, "data-room-item:private-1", operator).storageRef.reference, null, "Granting record access must not grant private storage metadata.");
const retry = await service.grant({ actor:owner, sourceKind:"data-room-item", sourceId:"private-1", targetRole:"operator", requestId:"grant-1" });
assert.equal(retry.idempotent, true);
assert.equal(writes, 1);
const revoked = await service.revoke({ actor:owner, sourceKind:"data-room-item", sourceId:"private-1", targetRole:"operator", requestId:"revoke-1" });
assert.equal(revoked.changed, true);
assert.equal(buildFileView(state, "data-room-item:private-1", operator), null, "Revocation must affect the next authorized read immediately.");
assert.equal(state.auditHistory.length, 2);
await assert.rejects(service.grant({ actor:{ authenticated:true, role:"admin" }, sourceKind:"data-room-item", sourceId:"private-1", targetRole:"operator", requestId:"denied" }), /cannot change File access/);
await assert.rejects(service.revoke({ actor:owner, sourceKind:"data-room-item", sourceId:"private-1", targetRole:"owner", requestId:"owner-revoke" }), /Owner access cannot be revoked/);
assert.equal(FILE_SHARING_CONTRACT.publicLinksSupported, false);
assert.equal(JSON.stringify(state).includes("https://"), false);

console.log("Files sharing tests passed.");
