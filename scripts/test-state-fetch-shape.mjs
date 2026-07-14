import assert from "node:assert/strict";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const requiredArrays = ["captureInbox", "tasks", "auditHistory", "activityEvents", "roleAssignments", "posts", "postImages"];
const syntheticSecret = ["sk", "synthetic", "shape", "canary", "not", "real"].join("-");
const server = await startPreviewServer({ seed:{
  settings:"malformed",
  posts:{ malformed:true },
  tasks:{ malformed:true },
  captureInbox:"malformed",
  auditHistory:{ malformed:true },
  activityEvents:"malformed",
  roleAssignments:"malformed",
  unsafeSecretLikeValue:syntheticSecret
} });

try {
  const login = await loginOwner(server);
  const result = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:login.cookie } });
  assert.equal(result.response.status, 200);
  assert.match(result.response.headers.get("content-type") || "", /application\/json/i);
  for (const collection of requiredArrays) assert(Array.isArray(result.json[collection]), `${collection} must hydrate as an array.`);
  assert.equal(typeof result.json.settings, "object");
  assert(Array.isArray(result.json.stateShapeWarnings));
  assert(result.json.stateShapeWarnings.length >= 5, "Malformed collections must be quarantined with safe warnings.");
  assert.equal(result.json.liveGatesCount, 0);
  assert.equal(result.text.includes(syntheticSecret), false, "Secret-shaped state must be redacted.");
} finally {
  await server.stop();
}

console.log("State fetch shape tests passed.");
