import assert from "node:assert/strict";
import { actorFromRequest, authRequiredForEnv, authorizeRequest, permissionForRequest, roleDefinitions } from "./access-control.mjs";

assert.equal(authRequiredForEnv({ STORAGE_BACKEND:"json", LOCAL_DEMO_MODE:"true" }), false);
assert.equal(authRequiredForEnv({ NODE_ENV:"production", STORAGE_BACKEND:"" }), true);
const env = { NODE_ENV:"production" };
const anonymous = authorizeRequest({ method:"GET", url:"/api/state", headers:{} }, new URL("https://command.example.com/api/state"), env);
assert.equal(anonymous.ok, false);
assert.equal(anonymous.status, 401);
const ownerRequest = { method:"POST", url:"/api/approval/item/approve", headers:{}, authenticatedActor:{ id:"owner-session", role:"owner", authenticated:true } };
assert.equal(authorizeRequest(ownerRequest, new URL("https://command.example.com/api/approval/item/approve"), env).ok, true);
const viewer = { id:"viewer-session", role:"viewer", authenticated:true };
assert.equal(authorizeRequest({ method:"GET", url:"/api/state", headers:{}, authenticatedActor:viewer }, new URL("https://command.example.com/api/state"), env).ok, false);
assert.equal(authorizeRequest({ method:"GET", url:"/api/reports/aggregate", headers:{}, authenticatedActor:viewer }, new URL("https://command.example.com/api/reports/aggregate"), env).ok, true);
assert.equal(actorFromRequest({ headers:{ authorization:"Bearer legacy-bootstrap-token-value-123456" } }, { ...env, COMMAND_CENTER_OWNER_TOKEN:"legacy-bootstrap-token-value-123456" }).authenticated, false);
assert.equal(permissionForRequest("POST", "/api/channels/linkedin/test"), "admin");
assert.equal(roleDefinitions.owner.can.includes("social_publish"), true);
assert.equal(roleDefinitions.viewer.can.includes("read"), false);
console.log("access control tests passed");
