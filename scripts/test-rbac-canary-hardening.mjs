import assert from "node:assert/strict";
import { authorizeRequest } from "./access-control.mjs";
import { viewerReportDto } from "./role-dto.mjs";

const viewer = { id:"viewer-session", role:"viewer", authenticated:true };
const env = { NODE_ENV:"production" };
const stateDecision = authorizeRequest({ method:"GET", url:"/api/state", headers:{}, authenticatedActor:viewer }, new URL("https://command.example.com/api/state"), env);
assert.equal(stateDecision.ok, false);
const aggregateDecision = authorizeRequest({ method:"GET", url:"/api/reports/aggregate", headers:{}, authenticatedActor:viewer }, new URL("https://command.example.com/api/reports/aggregate"), env);
assert.equal(aggregateDecision.ok, true);

const canaries = {
  email:["private.person", "canary.invalid"].join("@"),
  phone:["+1", "202", "555", "0199"].join("-"),
  token:"oauth-secret-canary-value",
  suppression:"suppression-reason-canary",
  provider:"provider-message-id-canary",
  note:"internal-note-canary"
};
const state = {
  products:[{ name:canaries.note, stage:canaries.token }], partners:[{ name:canaries.email, status:"active", phone:canaries.phone }],
  campaigns:[{ id:canaries.provider, status:canaries.suppression }], reactivationCampaign:{ status:canaries.note },
  funnelSnapshots:[{ screeningsStarted:2, paymentCompleted:1, revenue:3 }], reports:[{ title:canaries.note }],
  newlyAddedSensitiveCollection:[canaries]
};
const dto = viewerReportDto(state);
assert.deepEqual(Object.keys(dto).sort(), ["campaigns","funnel","generatedAt","partners","products","reports"].sort());
const serialized = JSON.stringify(dto);
for (const value of Object.values(canaries)) assert(!serialized.includes(value));
for (const path of ["/api/boot-state", "/api/queue", "/api/channels", "/api/storage/debug", "/data/backups/synthetic.json", "/assets/uploads/synthetic.png"]) {
  const decision = authorizeRequest({ method:"GET", url:path, headers:{}, authenticatedActor:viewer }, new URL(`https://command.example.com${path}`), env);
  assert.equal(decision.ok, false, path);
}
console.log("RBAC canary hardening tests passed");
