import assert from "node:assert/strict";
import {
  LEE_INBOX_ACTION_PATH,
  LEE_INBOX_PATH,
  handleLeeInboxApiRequest,
  isLeeInboxApiPath
} from "./lee-inbox-api.mjs";

const NOW = "2026-07-21T15:00:00.000Z";
const OWNER = { authenticated:true, id:"owner-roger", role:"owner", label:"Roger" };
const ADMIN = { authenticated:true, id:"admin", role:"admin", label:"Admin" };
const state = {
  connectorStatus:[{ connector:"gmail", status:"connected", connected:true }],
  inboxConfig:{ lastScanAt:"2026-07-21T14:00:00.000Z" },
  inboxSignals:[{
    id:"signal-1",
    kind:"needs_reply",
    status:"suggested",
    counterpartName:"Example Person",
    counterpartEmail:"person@example.com",
    summary:"A concise saved conversation summary.",
    threadId:"thread-1",
    confidence:0.9,
    updatedAt:"2026-07-21T14:00:00.000Z",
    bodyText:"FULL BODY MUST NOT LEAK"
  }],
  tasks:[],
  auditHistory:[],
  activityEvents:[]
};
const writes = [];
const store = {
  current:structuredClone(state),
  async readState() { return this.current; },
  async writeCollections(patch) { writes.push(patch); this.current = { ...this.current, ...patch }; }
};

assert.equal(isLeeInboxApiPath(LEE_INBOX_PATH), true);
assert.equal(isLeeInboxApiPath(LEE_INBOX_ACTION_PATH), true);
assert.equal(isLeeInboxApiPath("/api/state"), false);

const forbidden = await handleLeeInboxApiRequest({ enabled:true, method:"GET", pathname:LEE_INBOX_PATH, store, actor:ADMIN, now:NOW });
assert.equal(forbidden.status, 403);
assert.equal(JSON.stringify(forbidden.body).includes("FULL BODY"), false);

const read = await handleLeeInboxApiRequest({ enabled:true, method:"GET", pathname:LEE_INBOX_PATH, store, actor:OWNER, now:NOW });
assert.equal(read.status, 200);
assert.equal(read.body.items.length, 1);
assert.equal(JSON.stringify(read.body).includes("FULL BODY"), false);

const changed = await handleLeeInboxApiRequest({
  enabled:true,
  method:"POST",
  pathname:LEE_INBOX_ACTION_PATH,
  store,
  actor:OWNER,
  now:NOW,
  input:{
    itemId:"inbox:signal-1",
    action:"create_task",
    requestId:"lee_inbox_api_request_0001",
    expectedVersion:"2026-07-21T14:00:00.000Z"
  }
});
assert.equal(changed.status, 200);
assert.equal(changed.body.ok, true);
assert.equal(changed.body.result.externalActions, 0);
assert.equal("state" in changed.body, false);
assert.equal("collections" in changed.body, false);
assert.equal(writes.length, 1);
assert.deepEqual(Object.keys(writes[0]).sort(), ["activityEvents", "auditHistory", "inboxSignals", "tasks"]);

console.log("PASS test-vnext-lee-inbox-api");
