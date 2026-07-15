import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAuditService } from "./audit-service.mjs";

const dir = await mkdtemp(path.join(os.tmpdir(), "leos-audit-service-"));
process.env.COMMAND_CENTER_DATA_PATH = path.join(dir, "state.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(dir, "missing-seed.json");
const { JsonStore } = await import("./storage.mjs");

const historical = Array.from({ length:1_001 }, (_, index) => ({
  id:`historical-${index}`,
  occurredAt:"2026-07-14T00:00:00.000Z",
  actorId:"system",
  role:"system",
  action:"historical event",
  targetType:"record",
  targetId:`record-${index}`,
  requestId:`request-${index}`,
  outcome:"success",
  summary:{},
  source:"test",
  _version:1
}));
const firstStore = new JsonStore({ auditEvents:[] });
await firstStore.writeState({ auditEvents:historical });
const audit = createAuditService({ store:firstStore, now:() => new Date("2026-07-14T01:00:00.000Z") });
const appended = await audit.append({
  actor:{ id:"session-owner", role:"owner" },
  action:"approve record",
  targetType:"post",
  targetId:"post-synthetic",
  requestId:"request-synthetic",
  summary:{ status:"approved", nested:{ excluded:true } }
});

assert.equal(appended.actorId, "session-owner");
assert.deepEqual(appended.summary, { status:"approved" });
assert.equal(typeof appended.eventHash, "string");
assert.equal(appended.eventHash.length, 64);

const restartedStore = new JsonStore({ auditEvents:[] });
const restarted = await restartedStore.readState();
assert.equal(restarted.auditEvents.length, 1_002, "Audit history must not be truncated at 1,000 events.");
assert.equal(restarted.auditEvents[0].id, appended.id, "The appended event must persist across adapter restart.");
console.log("audit service tests passed");
