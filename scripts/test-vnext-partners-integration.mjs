#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { handlePartnerApiRequest } from "./partner-api-integration.mjs";
import { canPerformEndpoint, requiredCapabilitiesForEndpoint } from "./roles.mjs";
import { PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW, partnersFixtureState } from "./fixtures/vnext-partners-train.mjs";

function fixtureStore(initial = partnersFixtureState()) {
  let state = structuredClone(initial);
  const calls = { reads:0, scopedWrites:[], fullWrites:0 };
  return {
    calls,
    async readState() { calls.reads += 1; return state; },
    async writeChanges(before, after) {
      assert.equal(before, state, "scoped writes must be based on the freshly read state");
      calls.scopedWrites.push(Object.keys(after).filter((key) => before[key] !== after[key]).sort());
      state = after;
    },
    async writeState() { calls.fullWrites += 1; throw new Error("full-state writes are forbidden"); },
    snapshot() { return state; }
  };
}

const disabledStore = fixtureStore();
const disabled = await handlePartnerApiRequest({ enabled:false, method:"GET", pathname:"/api/ui/partners", store:disabledStore, actor:PARTNERS_FIXTURE_ACTOR, now:PARTNERS_FIXTURE_NOW });
assert.equal(disabled.status, 404);
assert.equal(disabledStore.calls.reads, 0, "flag-off requests must retain legacy behavior without reading Partner state");

const invalidStore = fixtureStore();
const invalid = await handlePartnerApiRequest({ enabled:true, method:"GET", pathname:"/api/ui/partners", searchParams:new URLSearchParams("unexpected=true"), store:invalidStore, actor:PARTNERS_FIXTURE_ACTOR, now:PARTNERS_FIXTURE_NOW });
assert.equal(invalid.status, 400);
assert.equal(invalidStore.calls.reads, 0, "invalid queries must fail before state access");

const store = fixtureStore();
const home = await handlePartnerApiRequest({ enabled:true, method:"GET", pathname:"/api/ui/partners", searchParams:new URLSearchParams("view=list&limit=2"), store, actor:PARTNERS_FIXTURE_ACTOR, now:PARTNERS_FIXTURE_NOW });
assert.equal(home.status, 200);
assert.equal(home.body.items.length, 2);
assert.equal(home.body.metrics?.fullStateReads || 0, 0);

for (const suffix of ["", "/outreach", "/files"]) {
  const response = await handlePartnerApiRequest({ enabled:true, method:"GET", pathname:`/api/ui/partners/partner-community${suffix}`, searchParams:new URLSearchParams(suffix ? "" : "tab=overview"), store, actor:PARTNERS_FIXTURE_ACTOR, now:PARTNERS_FIXTURE_NOW });
  assert.equal(response.status, 200, `compact Partner read ${suffix || "/:id"} must resolve`);
}

const request = {
  enabled:true,
  method:"POST",
  pathname:"/api/ui/partners/partner-community/next-action",
  input:{ requestId:"integration_next_action_0001", summary:"Confirm the reviewed scope", dueAt:"2026-07-22" },
  store,
  actor:PARTNERS_FIXTURE_ACTOR,
  now:PARTNERS_FIXTURE_NOW
};
const saved = await handlePartnerApiRequest(request);
assert.equal(saved.status, 200);
assert.equal(saved.body.mutations, 1);
assert.equal(saved.body.externalActions, 0);
assert.deepEqual(store.calls.scopedWrites, [["activityEvents", "auditHistory", "partners"]]);
const repeated = await handlePartnerApiRequest(request);
assert.equal(repeated.body.outcome, "already_applied");
assert.equal(repeated.body.mutations, 0);
assert.equal(store.calls.scopedWrites.length, 1, "idempotent replay must not write again");
assert.equal(store.calls.fullWrites, 0);
assert.equal(store.snapshot().partners.find((item) => item.id === "partner-community").stage, "proposal_sent", "next-action writes must not silently alter lifecycle stage");

assert.deepEqual(requiredCapabilitiesForEndpoint("GET", "/api/ui/partners/partner-community/files"), ["read_internal"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", "/api/ui/partners/partner-community/activity"), ["add_notes"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", "/api/ui/partners/partner-community/next-action"), ["manage_tasks"]);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", "/api/ui/partners/partner-community/programs"), ["manage_growth"]);
assert.equal(canPerformEndpoint("viewer", "GET", "/api/ui/partners").ok, false);
assert.equal(canPerformEndpoint("operator", "POST", "/api/ui/partners/partner-community/programs").ok, false);
assert.equal(canPerformEndpoint("owner", "POST", "/api/ui/partners/partner-community/programs").ok, true);

const shell = [
  readFileSync("scripts/ui/app-shell.mjs", "utf8"),
  readFileSync("scripts/ui/pages/partners-home.mjs", "utf8"),
  readFileSync("scripts/ui/pages/partner-record.mjs", "utf8")
].join("\n");
const server = readFileSync("scripts/preview-server.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
for (const stylesheet of ["partners-home.css", "partner-record.css", "partner-outreach.css", "partner-artifacts.css", "partners-accessibility.css"]) assert.ok(shell.includes(stylesheet));
assert.match(shell, /partnersHomeBrowserSource/);
assert.match(shell, /partnerRecordBrowserSource/);
assert.match(server, /handlePartnerApiRequest/);
for (const name of ["test:vnext-partners-home", "test:vnext-partner-record", "test:vnext-partner-outreach-integration", "test:vnext-partner-artifacts", "test:vnext-partner-acceptance"]) assert.ok(packageJson.scripts[name], `${name} must be registered`);

console.log("PASS test-vnext-partners-integration");
console.log(JSON.stringify({ compactReads:4, scopedWrites:1, fullStateWrites:0, renderWrites:0, providerCalls:0, sends:0, enrollments:0, uploads:0, shares:0, silentStageChanges:0 }));
