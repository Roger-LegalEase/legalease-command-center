import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUTOMATION_CONTROL_CENTER_API_ENDPOINTS,
  AUTOMATION_CONTROL_CENTER_ENDPOINT,
  handleAutomationControlCenterApiRequest,
  isAutomationControlCenterApiPath
} from "./automation-control-center-api.mjs";

const NOW = "2026-07-21T15:00:00.000Z";
const OWNER = { authenticated:true, id:"owner-roger", role:"owner" };
const OPERATOR = { authenticated:true, id:"operator-1", role:"operator" };
const SECRET = "SYNTHETIC-PROVIDER-SECRET-MUST-NOT-LEAK";
const STATE = {
  reactivationCampaign:{ campaignId:"reactivation-review", status:"paused", contentApproved:true },
  reactivationContacts:[{ contact_id:"react-1", email:"founder-review@example.com", full_name:"Synthetic Customer" }],
  prospectCandidates:[{ id:"partner-1", organization_name:"Example Foundation", fit_reason:"Synthetic Partner fit.", score:82, email:"partner@example.com" }],
  outreachContacts:[{
    contact_id:"press-1",
    contactType:"journalist",
    publication:"Example Daily",
    journalist:"Jamie Example",
    email:"press@example.com",
    beat:"Access to justice",
    storyAngle:"A synthetic founder story.",
    approvedFacts:["LegalEase provides self-help information."],
    pitch:{ subject:"Synthetic pitch", body:"Synthetic review-only pitch." },
    pitchApproved:true,
    providerPayload:{ token:SECRET }
  }],
  outreachCampaigns:[{ campaign_id:"press-campaign", campaignType:"press_outreach", status:"draft" }],
  runtime:{ token:SECRET }
};

function storeFor(state = STATE) {
  const calls = { reads:0, writes:0 };
  return {
    calls,
    async readState() { calls.reads += 1; return state; },
    async writeCollections() { calls.writes += 1; throw new Error("read-only endpoint attempted a write"); }
  };
}

console.log("Automation Control Center API tests");

assert.equal(AUTOMATION_CONTROL_CENTER_ENDPOINT, "/api/ui/automation-control-center");
assert.deepEqual(AUTOMATION_CONTROL_CENTER_API_ENDPOINTS, ["GET /api/ui/automation-control-center"]);
assert.equal(isAutomationControlCenterApiPath(AUTOMATION_CONTROL_CENTER_ENDPOINT), true);
assert.equal(isAutomationControlCenterApiPath("/api/ui/automation-control-center/activate"), false);

{
  const result = await handleAutomationControlCenterApiRequest({ enabled:true, pathname:"/api/ui/another-page" });
  assert.deepEqual(result, { matched:false });
}

{
  const result = await handleAutomationControlCenterApiRequest({ enabled:false, method:"GET", pathname:AUTOMATION_CONTROL_CENTER_ENDPOINT });
  assert.equal(result.status, 404);
  assert.equal(result.body.externalActions, 0);
  assert.equal(result.body.providerCalls, 0);
}

{
  const store = storeFor();
  const before = JSON.stringify(STATE);
  const result = await handleAutomationControlCenterApiRequest({
    enabled:true,
    method:"GET",
    pathname:AUTOMATION_CONTROL_CENTER_ENDPOINT,
    store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.authorized, true);
  assert.equal(result.body.controlCenter.mode, "Review only");
  assert.deepEqual(result.body.controlCenter.lanes.map((lane) => lane.label), ["Reactivation", "Partner prospect outreach", "Press outreach"]);
  assert.equal(result.body.controlCenter.posture.mutationsAvailable, false);
  assert.equal(result.body.controlCenter.posture.sendAvailable, false);
  assert.equal(result.body.mutations, 0);
  assert.equal(result.body.externalActions, 0);
  assert.equal(result.body.providerCalls, 0);
  assert.equal(store.calls.reads, 1);
  assert.equal(store.calls.writes, 0);
  assert.equal(JSON.stringify(STATE), before);
  assert.equal(JSON.stringify(result.body).includes(SECRET), false);
  assert.equal(JSON.stringify(result.body).includes("providerPayload"), false);
}

{
  const store = storeFor();
  const result = await handleAutomationControlCenterApiRequest({
    enabled:true,
    method:"GET",
    pathname:AUTOMATION_CONTROL_CENTER_ENDPOINT,
    store,
    actor:OPERATOR,
    now:NOW
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.controlCenter.lanes.length, 0);
  assert.equal(JSON.stringify(result.body).includes("partner@example.com"), false);
  assert.equal(store.calls.writes, 0);
}

{
  const store = storeFor();
  const result = await handleAutomationControlCenterApiRequest({
    enabled:true,
    method:"GET",
    pathname:AUTOMATION_CONTROL_CENTER_ENDPOINT,
    searchParams:new URLSearchParams("release=true"),
    store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.outcome, "validation_error");
  assert.equal(store.calls.reads, 0);
  assert.equal(store.calls.writes, 0);
}

{
  const store = storeFor();
  const result = await handleAutomationControlCenterApiRequest({
    enabled:true,
    method:"POST",
    pathname:AUTOMATION_CONTROL_CENTER_ENDPOINT,
    store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(result.status, 405);
  assert.match(result.body.message, /read-only/i);
  assert.equal(store.calls.reads, 0);
  assert.equal(store.calls.writes, 0);
}

{
  const result = await handleAutomationControlCenterApiRequest({
    enabled:true,
    method:"GET",
    pathname:AUTOMATION_CONTROL_CENTER_ENDPOINT,
    actor:OWNER,
    now:NOW
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.outcome, "unavailable");
  assert.equal(result.body.externalActions, 0);
}

{
  const source = readFileSync(new URL("./automation-control-center-api.mjs", import.meta.url), "utf8");
  assert.equal(/writeCollections|writeState|process\.env|\bfetch\s*\(/u.test(source), false);
  assert.equal(/(?:send|release|activate|enroll)(?:Campaign|Wave|Contact|Automation)?\s*\(/iu.test(source), false);
}

console.log("PASS test-automation-control-center-api");
