import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSmokeTestChecklist,
  buildSmokeTestStatus,
  finishSmokeTestRun,
  markSmokeTestItem,
  saveSmokeTestRun,
  startSmokeTestRun
} from "./smoke-test-center.mjs";
import { buildOsHealthSnapshot } from "./os-health.mjs";
import { guardForbiddenEndpoint } from "./auth-endpoint-hardening.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const state = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false },
      instagram: { enabled: false }
    }
  },
  smokeTestRuns: [],
  auditHistory: [],
  activityEvents: [],
  osHealthSnapshots: []
};

const checklist = buildSmokeTestChecklist();
assert.equal(checklist.length, 9, "Smoke Test Center should render 9 checklist groups.");
for (const groupName of [
  "App Shell",
  "Auth + Endpoint Safety",
  "Quick Capture + Capture Inbox",
  "Tasks",
  "Daily Rituals",
  "Operating Memory + Closeout",
  "Search + Health + Integrity",
  "RCAP Workflow",
  "Safety Confirmation"
]) {
  const group = checklist.find(item => item.name === groupName);
  assert(group, `${groupName} checklist group should render.`);
  assert(group.items.length > 0, `${groupName} should include checklist items.`);
}
assert(checklist.flatMap(group => group.items).some(item => item.label === "Live gates remain 0"), "Safety checklist should include live gates remain 0.");
assert(checklist.flatMap(group => group.items).some(item => item.label === "No Partner Journey API is contacted"), "RCAP checklist should include no Partner Journey API contact.");

const started = startSmokeTestRun(state, {
  id: "smoke-test-render-32a2526",
  commit_hash: "32a25268b30e65e65bc0f4ed7a20cd7a81759e32",
  environment: "hosted"
}, { now: "2026-05-28T14:00:00.000Z", actor: "owner_token" });
assert.equal(started.run.id, "smoke-test-render-32a2526", "Start Smoke Test Run should use provided run id.");
assert.equal(started.run.overall_status, "in_progress", "Started smoke test should be in progress.");
assert.equal(started.run.groups.length, 9, "Started run should copy checklist groups.");
assert.equal(started.run.live_gates_count, 0, "Live gates must remain 0 on smoke test run.");
assert.equal(started.state.smokeTestRuns.length, 1, "Start should create one smoke test run.");

const firstItemId = started.run.groups[0].items[0].id;
const passed = markSmokeTestItem(started.state, started.run.id, firstItemId, "pass", "Overview opened.", { now: "2026-05-28T14:05:00.000Z", actor: "owner_token" });
assert.equal(passed.run.checklist_items.find(item => item.id === firstItemId).status, "pass", "Mark Item Passed should update item status.");
assert.equal(passed.run.passed_count, 1, "Passed count should update.");

const secondItemId = passed.run.groups[0].items[1].id;
const failed = markSmokeTestItem(passed.state, passed.run.id, secondItemId, "fail", "Nav needs a second look.", { now: "2026-05-28T14:06:00.000Z", actor: "owner_token" });
assert.equal(failed.run.checklist_items.find(item => item.id === secondItemId).status, "fail", "Mark Item Failed should update item status.");
assert.equal(failed.run.failed_count, 1, "Failed count should update.");

const thirdItemId = failed.run.groups[0].items[2].id;
const notTested = markSmokeTestItem(failed.state, failed.run.id, thirdItemId, "not_tested", "Will test after deploy completes.", { now: "2026-05-28T14:07:00.000Z", actor: "owner_token" });
assert.equal(notTested.run.checklist_items.find(item => item.id === thirdItemId).status, "not_tested", "Mark Item Not Tested should update item status.");

const saved = saveSmokeTestRun(notTested.state, notTested.run.id, { notes: "Post-deploy smoke run in progress." }, { now: "2026-05-28T14:08:00.000Z", actor: "owner_token" });
assert.equal(saved.run.notes, "Post-deploy smoke run in progress.", "Save Smoke Test Run should store notes.");

const finished = finishSmokeTestRun(saved.state, saved.run.id, { now: "2026-05-28T14:10:00.000Z", actor: "owner_token" });
assert.equal(finished.run.overall_status, "fail", "Finish Smoke Test Run should fail when any item failed.");
assert.equal(finished.run.completed_at, "2026-05-28T14:10:00.000Z", "Finish should set completed_at.");
assert(finished.state.auditHistory.length >= 5, "Smoke test actions should create audit entries.");
assert(finished.state.activityEvents.length >= 5, "Smoke test actions should create activity entries.");
assert.equal(finished.state.smokeTestRuns.length, 1, "Smoke test run should be idempotent by run id.");

const restarted = startSmokeTestRun(finished.state, { id: finished.run.id, environment: "hosted" }, { now: "2026-05-28T15:00:00.000Z", actor: "owner_token" });
assert.equal(restarted.state.smokeTestRuns.length, 1, "Starting same run id should not duplicate.");

const status = buildSmokeTestStatus(finished.state);
assert.equal(status.last_status, "fail", "Smoke test status should expose last run status.");
assert.equal(status.failed_count, 1, "Smoke test status should expose failed step count.");
assert.equal(status.last_run_timestamp, "2026-05-28T14:10:00.000Z", "Smoke test status should expose last run timestamp.");

const health = buildOsHealthSnapshot(finished.state, { now: "2026-05-28T15:30:00.000Z", date: "2026-05-28", supabaseDbConnected: true, supabaseStorageConnected: true, openAIConfigured: true, ownerTokenAuthConfigured: true });
assert(health.smoke_test_status, "OS Health should include smoke test status.");
assert.equal(health.smoke_test_status.last_status, "fail", "OS Health should show last smoke test status.");
assert.equal(health.smoke_test_status.failed_count, 1, "OS Health should show failed smoke test count.");

assert.equal(guardForbiddenEndpoint({ method: "POST", pathname: "/api/posts/example/publish-now", state: finished.state }).ok, false, "Forbidden actions remain blocked.");
assert.equal(finished.run.live_gates_count, 0, "Live gates remain 0.");
assert.equal(finished.run.no_external_actions_confirmation, "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no destructive restore, no shell commands executed from browser.", "Smoke test run should confirm no external actions.");

assert(serverSource.includes("function cockpitSmokeTestHtml"), "Cockpit Self-Check card must render.");
assert(serverSource.includes("smokeTestPageHtml"), "#smoke-test route renderer must exist.");
assert(serverSource.includes("\"smoke-test\""), "#smoke-test route must be registered.");
assert(serverSource.includes("Start Self-Check"), "Start Self-Check action must render.");
assert(serverSource.includes("Finish Self-Check"), "Finish Self-Check action must render.");
assert(serverSource.includes("buildSmokeTestChecklist"), "Smoke test checklist groups must render from the shared checklist helper.");
assert(serverSource.includes("group.name"), "Smoke test page must render checklist group names.");
assert(serverSource.includes("/api/smoke-test/start"), "Smoke test start API must exist.");
assert(serverSource.includes("/api/smoke-test/") && serverSource.includes("/item"), "Smoke test item API must exist.");
assert(serverSource.includes("last self-check status") || serverSource.includes("Last self-check status"), "App Status should render self-check status.");
assert(!/smoke-test[\s\S]{0,4200}(child_process|execCommand|exec\(|spawn\()/i.test(serverSource), "Smoke Test Center must not expose browser shell execution.");
assert(!/smoke-test[\s\S]{0,4200}(send email|publish page|activate dashboard|partner[-_ ]journey.*fetch|partner[-_ ]journey.*api.*call)/i.test(serverSource), "Smoke Test Center must not expose external action controls.");

console.log("Smoke Test Center tests passed.");
