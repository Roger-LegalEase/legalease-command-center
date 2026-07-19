#!/usr/bin/env node
import assert from "node:assert/strict";
import { INVESTOR_ROOM_REQUIREMENTS, INVESTOR_ROOM_REQUIREMENTS_VERSION } from "./investor-room-requirements.mjs";
import { INVESTOR_ROOM_SECTIONS, buildInvestorRoom } from "./ui/view-models/investor-room.mjs";

assert.equal(INVESTOR_ROOM_REQUIREMENTS_VERSION, "v1.1");
assert.deepEqual([...new Set(INVESTOR_ROOM_REQUIREMENTS.map((item) => item.section))].sort(), [...INVESTOR_ROOM_SECTIONS].sort());
assert.equal(new Set(INVESTOR_ROOM_REQUIREMENTS.map((item) => item.id)).size, INVESTOR_ROOM_REQUIREMENTS.length);
for (const item of INVESTOR_ROOM_REQUIREMENTS) {
  assert.match(item.id, /^[a-z][a-z0-9-]+$/);
  assert.ok(item.name && item.ownerRule && item.owner);
  assert.ok(item.sourceRefs.length > 0);
  assert.ok(item.sourceRefs.every((ref) => item.acceptedSourceKinds.includes(ref.split(":")[0])));
}

const state = { dataRoomItems:[{ id:"not-a-reviewed-id", title:"Company overview", status:"current", verifiedAt:"2026-07-19T00:00:00.000Z" }] };
const view = buildInvestorRoom(state, { authenticated:true, role:"owner" }, INVESTOR_ROOM_REQUIREMENTS, "2026-07-19T12:00:00.000Z");
assert.equal(view.readiness.percentage, 0, "A fuzzy title match must not satisfy an exact requirement.");
assert.equal(view.summary.missing, INVESTOR_ROOM_REQUIREMENTS.length);

console.log("PASS test-vnext-investor-room-requirements");
