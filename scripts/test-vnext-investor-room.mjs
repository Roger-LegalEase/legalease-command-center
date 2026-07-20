import assert from "node:assert/strict";

import { readInvestorRoom } from "./ui-api/investor-room-read.mjs";
import { renderInvestorRoom } from "./ui/pages/investor-room.mjs";

const actor = { authenticated:true, role:"owner" };
const requirements = [
  { id:"company-overview", name:"Company overview", section:"Company", required:true, sourceRefs:["data-room-item:company"], staleAfterDays:90, owner:"Roger" },
  { id:"financial-model", name:"Financial model", section:"Financial", required:true, sourceRefs:["data-room-item:financial"], staleAfterDays:30 },
  { id:"traction-report", name:"Traction report", section:"Traction", required:true, sourceRefs:["report:traction"] },
  { id:"legal-review", name:"Legal review", section:"Legal & Compliance", required:true, sourceRefs:["soc2-evidence:legal"] }
];
const state = {
  dataRoomItems:[
    { id:"company", title:"Company overview", fileName:"company.pdf", status:"current", verifiedAt:"2026-07-01T00:00:00.000Z", owner:"Roger" },
    { id:"financial", title:"Financial model", fileName:"model.xlsx", status:"current", verifiedAt:"2026-05-01T00:00:00.000Z" }
  ],
  reports:[{ id:"traction", title:"Traction report", status:"draft", generatedAt:"2026-07-18T00:00:00.000Z" }],
  soc2Evidence:[], evidencePackNotes:[], soc2Policies:[], brandAssets:[], activityEvents:[], auditHistory:[]
};

const view = readInvestorRoom({ state, actor, requirements, now:"2026-07-19T00:00:00.000Z" });
assert.equal(view.readiness.percentage, 25);
assert.equal(view.readiness.current, 1);
assert.equal(view.summary.current, 1);
assert.equal(view.summary.needsUpdate, 1);
assert.equal(view.summary.missing, 1);
const items = view.sections.flatMap((section) => section.items);
assert.equal(items.find((item) => item.id === "company-overview").status.key, "current");
assert.equal(items.find((item) => item.id === "financial-model").status.key, "needs-update");
assert.equal(items.find((item) => item.id === "traction-report").status.key, "draft");
assert.equal(items.find((item) => item.id === "legal-review").status.key, "missing");
assert.match(renderInvestorRoom(view), /25%/);
assert.match(renderInvestorRoom(view), /No authorized File is attached/);

const noRequirements = readInvestorRoom({ state, actor, requirements:[], now:"2026-07-19T00:00:00.000Z" });
assert.equal(noRequirements.readiness.available, false);
assert.equal(noRequirements.readiness.percentage, null);
assert.match(renderInvestorRoom(noRequirements), /data-guided-empty-kind="unavailable"/);
assert.match(renderInvestorRoom(noRequirements), /Current information is unavailable/);
assert.match(renderInvestorRoom(noRequirements), /data-guided-empty-action="retry"/);
const hiddenState = structuredClone(state);
hiddenState.dataRoomItems[0].allowedRoles = ["admin"];
const operator = readInvestorRoom({ state:hiddenState, actor:{ authenticated:true, role:"operator" }, requirements, now:"2026-07-19T00:00:00.000Z" });
assert.equal(operator.sections.flatMap((section) => section.items).find((item) => item.id === "company-overview").status.key, "missing");
assert.equal(JSON.stringify(operator).includes("company.pdf"), false);

console.log("Investor Room tests passed.");
