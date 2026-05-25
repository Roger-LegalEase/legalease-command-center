import assert from "node:assert/strict";
import { actorFromRequest, authRequiredForEnv, authorizeRequest, permissionForRequest, roleDefinitions } from "./access-control.mjs";

assert.equal(authRequiredForEnv({ STORAGE_BACKEND:"json", LOCAL_DEMO_MODE:"true" }), false);
assert.equal(authRequiredForEnv({ STORAGE_BACKEND:"supabase", LOCAL_DEMO_MODE:"false" }), true);

const env = {
  STORAGE_BACKEND: "supabase",
  LOCAL_DEMO_MODE: "false",
  COMMAND_CENTER_OWNER_TOKEN: "owner-token-1234567890",
  COMMAND_CENTER_INVESTOR_TOKEN: "investor-token-1234567890",
  COMMAND_CENTER_COMPLIANCE_TOKEN: "compliance-token-1234567890"
};

const anonymous = authorizeRequest({ method:"GET", url:"/api/state", headers:{} }, new URL("http://local/api/state"), env);
assert.equal(anonymous.ok, false);
assert.equal(anonymous.status, 401);

const owner = authorizeRequest(
  { method:"POST", url:"/api/approval/item/approve", headers:{ "x-command-center-token":"owner-token-1234567890" } },
  new URL("http://local/api/approval/item/approve"),
  env
);
assert.equal(owner.ok, true);
assert.equal(owner.actor.role, "owner");

const investorWrite = authorizeRequest(
  { method:"POST", url:"/api/approval/item/approve", headers:{ "x-command-center-token":"investor-token-1234567890" } },
  new URL("http://local/api/approval/item/approve"),
  env
);
assert.equal(investorWrite.ok, false);
assert.equal(investorWrite.status, 403);

const investorRead = authorizeRequest(
  { method:"GET", url:"/api/state", headers:{ authorization:"Bearer investor-token-1234567890" } },
  new URL("http://local/api/state"),
  env
);
assert.equal(investorRead.ok, true);
assert.equal(investorRead.actor.role, "investor_readonly");

const compliance = actorFromRequest({ headers:{ "x-command-center-token":"compliance-token-1234567890" } }, env);
assert.equal(compliance.permissions.includes("compliance_review"), true);
assert.equal(permissionForRequest("POST", "/api/channels/linkedin/test"), "admin");
assert.equal(roleDefinitions.owner.can.includes("admin"), true);

console.log("access control tests passed");

