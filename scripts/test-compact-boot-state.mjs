import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const items = Array.from({ length:50 }, (_, index) => ({ id:`synthetic-${index}`, title:`Synthetic ${index}`, status:index % 2 ? "open" : "blocked" }));
const server = await startPreviewServer({ seed:{
  posts:items,
  tasks:items,
  captureInbox:items,
  auditHistory:items,
  activityEvents:items,
  reports:items,
  roleAssignments:[{ id:"role-owner", actor_id:"owner", role:"owner", status:"active" }]
} });

try {
  const missing = await jsonRequest(server.baseUrl, "/api/boot-state");
  assert.equal(missing.response.status, 401);
  const bearer = await jsonRequest(server.baseUrl, "/api/boot-state", { headers:{ authorization:`Bearer ${server.ownerCredential}` } });
  assert.equal(bearer.response.status, 401, "Static bearer authentication must remain retired.");

  const login = await loginOwner(server);
  const boot = await jsonRequest(server.baseUrl, "/api/boot-state", { headers:{ cookie:login.cookie } });
  assert.equal(boot.response.status, 200);
  assert.equal(boot.json.liveGatesCount, 0);
  assert.equal(boot.json.safeModeAvailable, true);
  assert.equal(boot.json.heavyCollectionsDeferred, true);
  assert.equal(boot.json.currentUser?.role, "owner");
  assert(Array.isArray(boot.json.tasks) && boot.json.tasks.length <= 12);
  assert(Array.isArray(boot.json.captureInbox) && boot.json.captureInbox.length <= 8);
  for (const heavy of ["auditHistory", "activityEvents", "reports", "posts", "authSessions"]) assert.equal(Object.hasOwn(boot.json, heavy), false);

  const state = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:login.cookie } });
  assert.equal(state.response.status, 200);
  assert(Array.isArray(state.json.auditHistory));
} finally {
  await server.stop();
}

assert(source.includes('if (url.pathname === "/api/boot-state" && request.method === "GET")'));
assert(source.includes("buildCompactBootState"));
assert(source.includes("heavyCollectionsDeferred:true"));
assert(source.includes('const fullPayload = await api("/api/state", { timeoutMs: 20000 })'));
assert(source.includes("showSafeBootShell(formatStateFetchError(error), \"boot-state-fetch\", error)"));

console.log("Compact boot state tests passed.");
