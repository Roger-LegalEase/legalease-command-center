import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSmokeTestStatus as serverBuildSmokeTestStatus } from "./smoke-test-center.mjs";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
assert.deepEqual(serverBuildSmokeTestStatus({}), {
  status:"not_started", last_status:"not_started", last_run_at:null, last_run_timestamp:"",
  failed_count:0, passed_count:0, not_tested_count:0, latest_run_id:"", latest_commit_hash:"",
  smoke_test_after_latest_commit:true, warning:"No smoke test run recorded yet."
});

const server = await startPreviewServer({ seed:{ smokeTestRuns:{ malformed:true } } });
try {
  const login = await loginOwner(server);
  const boot = await jsonRequest(server.baseUrl, "/api/boot-state", { headers:{ cookie:login.cookie } });
  assert.equal(boot.response.status, 200);
  assert.equal(boot.json.liveGatesCount, 0);
  const full = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:login.cookie } });
  assert.equal(full.response.status, 200);
  assert(Array.isArray(full.json.smokeTestRuns));
} finally {
  await server.stop();
}

assert(source.includes("function buildSmokeTestStatus(state = {}, options = {})"));
assert(source.includes('warning:"No smoke test run recorded yet."'));
assert(source.includes("Array.isArray(state.smokeTestRuns) ? state.smokeTestRuns : []"));
assert(source.includes("buildCompactBootState"));
console.log("Smoke test status helper tests passed.");
