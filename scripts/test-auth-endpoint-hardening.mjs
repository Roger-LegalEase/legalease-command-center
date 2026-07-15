import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildEndpointInventory, endpointProtectionStatus, forbiddenEndpointRules, guardForbiddenEndpoint, secretLeakageStatusFromText } from "./auth-endpoint-hardening.mjs";
import { authorizeRequest } from "./access-control.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const inventory = buildEndpointInventory(source);
assert(inventory.length > 50);
for (const endpoint of inventory) {
  assert(endpoint.method && endpoint.path && endpoint.purpose);
  assert.equal(typeof endpoint.auth_required, "boolean");
  assert.equal(typeof endpoint.state_mutation, "boolean");
  assert.equal(typeof endpoint.external_action, "boolean");
}
assert.equal(endpointProtectionStatus(source).status, "protected");
assert.equal(guardForbiddenEndpoint({ method:"POST", pathname:"/api/posts/example/publish-now", state:{ runtime:{ livePostingGates:{} } } }).ok, false);
assert(forbiddenEndpointRules.some((rule) => rule.id === "destructive-restore"));
assert.equal(secretLeakageStatusFromText("safe generic output").status, "clean");
const env = { NODE_ENV:"production" };
for (const path of ["/api/operator-search", "/api/os-health", "/api/operating-memory/today", "/api/data-integrity", "/api/auth-hardening/endpoints"]) {
  assert.equal(authorizeRequest({ method:"GET", url:path, headers:{} }, new URL(`https://command.example.com${path}`), env).ok, false, path);
  assert.equal(authorizeRequest({ method:"GET", url:path, headers:{}, authenticatedActor:{ id:"owner-session", role:"owner", authenticated:true } }, new URL(`https://command.example.com${path}`), env).ok, true, path);
}
assert(!source.includes("storedOwnerToken"));
assert(!source.includes("localStorage.setItem"));
console.log("auth endpoint hardening tests passed");
