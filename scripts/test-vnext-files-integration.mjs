#!/usr/bin/env node
import assert from "node:assert/strict";

import { handleFilesApiRequest, parseFilesMultipart } from "./files-api-integration.mjs";
import { INVESTOR_ROOM_REQUIREMENTS } from "./investor-room-requirements.mjs";

const actor = { authenticated:true, role:"owner", id:"founder-1", name:"Founder" };
let state = {
  reports:[], evidencePackNotes:[], soc2Evidence:[], soc2Policies:[], brandAssets:[], activityEvents:[], auditHistory:[],
  dataRoomItems:[{ id:"company-overview", title:"Company overview", fileName:"company.md", mimeType:"text/markdown", sizeBytes:18, storageRef:"files/2026/company.md", filesCollection:"investor-room", status:"current", verifiedAt:"2026-07-19T00:00:00.000Z", allowedRoles:["owner"], updatedAt:"2026-07-19T00:00:00.000Z" }]
};
let reads = 0;
let writes = 0;
const store = {
  async readState() { reads += 1; return structuredClone(state); },
  async writeCollections(patch) { writes += 1; state = { ...state, ...structuredClone(patch) }; }
};
const storage = { async get() { return Buffer.from("Synthetic overview"); }, async put() { return { objectRef:"files/2026/new.md", publicUrl:null }; }, async remove() {} };

const disabled = await handleFilesApiRequest({ enabled:false, pathname:"/api/ui/files", method:"GET", store, actor });
assert.equal(disabled.status, 404);
assert.equal(reads, 0);

const home = await handleFilesApiRequest({ enabled:true, pathname:"/api/ui/files", method:"GET", searchParams:new URLSearchParams("view=all"), store, actor, cursorSecret:"synthetic-files-cursor-secret" });
assert.equal(home.status, 200);
assert.equal(home.body.items.length, 1);
assert.match(home.body.html, /Company overview/);
assert.doesNotMatch(JSON.stringify(home.body), /synthetic-files-cursor-secret/);

const content = await handleFilesApiRequest({ enabled:true, pathname:"/api/ui/files/data-room-item/company-overview/content", method:"GET", store, storage, actor });
assert.equal(content.status, 200);
assert.equal(content.raw.body.toString(), "Synthetic overview");

const investor = await handleFilesApiRequest({ enabled:true, pathname:"/api/ui/files/investor-room", method:"GET", store, actor, requirements:INVESTOR_ROOM_REQUIREMENTS, now:"2026-07-19T12:00:00.000Z" });
assert.equal(investor.status, 200);
assert.equal(investor.body.readiness.current, 1);
assert.ok(investor.body.readiness.percentage < 100);

const organized = await handleFilesApiRequest({ enabled:true, pathname:"/api/ui/files/data-room-item/company-overview/organize", method:"POST", input:{ action:"star", requestId:"files-star-integration-1" }, store, actor, now:"2026-07-19T12:00:00.000Z" });
assert.equal(organized.body.ok, true);
assert.equal(writes, 1);
assert.equal(state.dataRoomItems[0].starred, true);

const boundary = "files-boundary-123";
const multipart = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nSynthetic upload\r\n--${boundary}\r\nContent-Disposition: form-data; name="requestId"\r\n\r\nfiles-upload-request-1\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload.md"\r\nContent-Type: text/markdown\r\n\r\nSynthetic bytes\r\n--${boundary}--\r\n`);
const parsed = parseFilesMultipart(multipart, `multipart/form-data; boundary=${boundary}`);
assert.equal(parsed.fields.fileName, "upload.md");
assert.equal(parsed.bytes.toString(), "Synthetic bytes");

console.log("PASS test-vnext-files-integration");
