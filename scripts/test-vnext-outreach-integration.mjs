#!/usr/bin/env node
import assert from "node:assert/strict";

import { handleOutreachApiRequest } from "./outreach-api-integration.mjs";
import { readCommandCenterVNextProductConfig } from "./ui/vnext-config.mjs";

const actor = { authenticated:true, role:"owner", id:"founder-1" };
const state = {
  campaigns:[{
    id:"campaign-integration-1",
    name:"Synthetic Partner Outreach",
    status:"draft",
    campaignType:"partner_outreach",
    owner:"founder-1",
    createdAt:"2026-07-19T10:00:00.000Z",
    updatedAt:"2026-07-19T10:00:00.000Z",
    draftVersion:0,
    liveMode:false,
    recipients:[]
  }],
  partners:[], activityEvents:[], auditHistory:[], roleAssignments:[{ id:"founder-1", name:"Founder" }]
};
let reads = 0;
let writes = 0;
const store = {
  async readState() { reads += 1; return state; },
  async writeChanges() { writes += 1; }
};

assert.equal(readCommandCenterVNextProductConfig({ COMMAND_CENTER_UX_VNEXT:"true" }, "outreach").enabled, false);
assert.equal(readCommandCenterVNextProductConfig({ COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_UX_VNEXT_OUTREACH:"true" }, "outreach").enabled, true);
assert.equal(readCommandCenterVNextProductConfig({ COMMAND_CENTER_UX_VNEXT:"false", COMMAND_CENTER_UX_VNEXT_OUTREACH:"true" }, "outreach").enabled, false);
assert.equal(readCommandCenterVNextProductConfig(Object.create({ COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_UX_VNEXT_OUTREACH:"true" }), "outreach").enabled, false);

const disabled = await handleOutreachApiRequest({ enabled:false, pathname:"/api/ui/outreach", method:"GET", store, actor });
assert.equal(disabled.status, 404);
assert.equal(reads, 0);

const home = await handleOutreachApiRequest({ enabled:true, pathname:"/api/ui/outreach", method:"GET", searchParams:new URLSearchParams("view=all"), store, actor, now:"2026-07-19T12:00:00.000Z" });
assert.equal(home.status, 200);
assert.equal(home.body.authorized, true);
assert.equal(reads, 1);
assert.equal(writes, 0);
assert.doesNotMatch(JSON.stringify(home.body), /providerPayload|authorization|api[_-]?key/i);

const invalid = await handleOutreachApiRequest({ enabled:true, pathname:"/api/ui/outreach", method:"GET", searchParams:new URLSearchParams("collection=campaigns"), store, actor });
assert.equal(invalid.status, 400);
assert.equal(reads, 1);
assert.equal(writes, 0);

console.log("PASS test-vnext-outreach-integration");
