import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(os.tmpdir(), "leos-storage-concurrency-"));
process.env.COMMAND_CENTER_DATA_PATH = path.join(dir, "state.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(dir, "missing-seed.json");
const { JsonStore, StorageConflictError } = await import("./storage.mjs");
const initial = {
  posts:[{ id:"post-a", title:"A", status:"approved", _version:1 }, { id:"post-b", title:"B", status:"approved", _version:1 }],
  reactivationContacts:[{ id:"contact-a", state:"ready", _version:1 }, { id:"contact-b", state:"ready", _version:1 }],
  reactivationSendClaims:[], publishClaims:[], auditEvents:[], heartbeatLease:{}
};
const a = new JsonStore(initial);
const b = new JsonStore(initial);
await a.writeState(initial);

await Promise.all([
  a.mutateCollectionItem("posts", "post-a", (row) => ({ ...row, title:"A2" }), { expectedVersion:1 }),
  b.mutateCollectionItem("posts", "post-b", (row) => ({ ...row, title:"B2" }), { expectedVersion:1 })
]);
let state = await a.readState();
assert.equal(state.posts.find((row) => row.id === "post-a").title, "A2");
assert.equal(state.posts.find((row) => row.id === "post-b").title, "B2");

const firstSnapshot = await a.readState();
const secondSnapshot = await b.readState();
await Promise.all([
  a.writeChanges(firstSnapshot, { ...firstSnapshot, posts:firstSnapshot.posts.map((row) => row.id === "post-a" ? { ...row, title:"A3" } : row) }),
  b.writeChanges(secondSnapshot, { ...secondSnapshot, posts:secondSnapshot.posts.map((row) => row.id === "post-b" ? { ...row, title:"B3" } : row) })
]);
state = await a.readState();
assert.equal(state.posts.find((row) => row.id === "post-a").title, "A3");
assert.equal(state.posts.find((row) => row.id === "post-b").title, "B3");

await Promise.all([
  a.mutateCollectionItem("reactivationContacts", "contact-a", (row) => ({ ...row, state:"paused" }), { expectedVersion:1 }),
  b.mutateCollectionItem("reactivationContacts", "contact-b", (row) => ({ ...row, state:"sent" }), { expectedVersion:1 })
]);
state = await b.readState();
assert.equal(state.reactivationContacts.find((row) => row.id === "contact-a").state, "paused");
assert.equal(state.reactivationContacts.find((row) => row.id === "contact-b").state, "sent");

const version = state.posts.find((row) => row.id === "post-a")._version;
const sameRecord = await Promise.allSettled([
  a.mutateCollectionItem("posts", "post-a", (row) => ({ ...row, title:"winner-one" }), { expectedVersion:version }),
  b.mutateCollectionItem("posts", "post-a", (row) => ({ ...row, title:"winner-two" }), { expectedVersion:version })
]);
assert.equal(sameRecord.filter((result) => result.status === "fulfilled").length, 1);
const rejected = sameRecord.find((result) => result.status === "rejected");
assert(rejected.reason instanceof StorageConflictError);
assert.equal(rejected.reason.code, "STORAGE_VERSION_CONFLICT");

const beforeInvalid = JSON.stringify(await a.readState());
await assert.rejects(() => a.mutateCollectionItem("posts", "post-a", () => "invalid"));
assert.equal(JSON.stringify(await b.readState()), beforeInvalid);

const claim = { id:"send-claim-one", status:"claimed" };
const claims = await Promise.all([a.claimCollectionItems("reactivationSendClaims", [claim]), b.claimCollectionItems("reactivationSendClaims", [claim])]);
assert.equal(claims.reduce((sum, result) => sum + result.inserted.length, 0), 1);
console.log("storage concurrency hardening tests passed");
