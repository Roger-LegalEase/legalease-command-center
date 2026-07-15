import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(os.tmpdir(), "leos-restore-drill-"));
process.env.COMMAND_CENTER_DATA_PATH = path.join(dir, "restored.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(dir, "missing.json");
const { JsonStore } = await import("./storage.mjs");
const auditEvents = Array.from({ length:1101 }, (_, index) => ({ id:`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, occurredAt:"2026-07-13T00:00:00.000Z", actorId:"synthetic", role:"system", action:"restore_drill", targetType:"synthetic_record", targetId:String(index), requestId:"restore-drill", outcome:"success", summary:{ index }, source:"test", eventHash:`hash-${index}` }));
const synthetic = {
  posts:[{ id:"synthetic-post", status:"approved", _version:1 }], auditEvents,
  runtime:{ livePostingGates:{} }, settings:{},
  outboundGates:{ email:false, outreach:false, reactivation:false, social:false }
};
const source = new JsonStore(synthetic);
await source.writeState(synthetic);
await source.appendAuditEvent({ id:"00000000-0000-4000-8000-999999999999", occurredAt:"2026-07-13T00:00:00.000Z", actorId:"synthetic", role:"system", action:"restore_verified", targetType:"synthetic_record", targetId:"final", requestId:"restore-drill", outcome:"success", summary:{ restored:true }, source:"test" });
const restarted = new JsonStore({});
const restored = await restarted.readState();
assert.equal(restored.auditEvents.length, 1102);
assert.equal(restored.posts[0].id, "synthetic-post");
assert(Object.values(restored.outboundGates).every((value) => value === false));
console.log("synthetic restore drill passed");
