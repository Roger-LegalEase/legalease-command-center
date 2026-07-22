import assert from "node:assert/strict";
import {
  FOUNDER_COMPANY_HEALTH_API_ENDPOINTS,
  handleFounderCompanyHealthApiRequest,
  isFounderCompanyHealthApiPath
} from "./founder-company-health-api.mjs";

const NOW = "2026-07-21T12:00:00.000Z";
const OWNER = Object.freeze({ authenticated:true, role:"owner", id:"founder-example" });
const OPERATOR = Object.freeze({ authenticated:true, role:"operator", id:"operator-example" });

function healthyState() {
  return {
    osHealthSnapshots:[{
      id:"health-current",
      generated_at:"2026-07-21T09:00:00.000Z",
      overall_health:"healthy",
      connection_health:{
        supabase_db:{ ok:true, status:"connected" },
        supabase_storage:{ ok:true, status:"connected" },
        owner_token_auth:{ ok:true, status:"protected" }
      },
      auth_hardening:{
        endpoint_protection:{ status:"protected" },
        secret_leakage:{ status:"clear" }
      },
      rawLog:"DATABASE_URL=never-return-this-sentinel",
      environmentName:"production-hidden"
    }],
    connectorStatus:[
      { connector:"email", configured:true, status:"connected", lastSyncAt:"2026-07-21T10:00:00.000Z" },
      { connector:"gmail", configured:true, status:"connected", lastSyncAt:"2026-07-21T10:10:00.000Z" },
      { connector:"calendar", configured:true, status:"connected", lastSyncAt:"2026-07-21T10:11:00.000Z" },
      { connector:"stripe", configured:true, status:"connected", lastSyncAt:"2026-07-21T10:12:00.000Z" },
      { connector:"website", configured:true, status:"connected", lastSyncAt:"2026-07-21T10:15:00.000Z" }
    ],
    socialAccounts:[{ platform:"google_workspace", status:"connected", connectedAt:"2026-07-21T09:50:00.000Z" }],
    sendgridWebhookHealth:{ lastOkAt:"2026-07-21T10:00:00.000Z", verified_batches:3, rejected_batches:0 },
    stripeRevenue:{ available:true, configured:true, fetchedAt:"2026-07-21T10:30:00.000Z" },
    heartbeatRuns:[{ id:"check-1", status:"success", ranAt:"2026-07-21T10:20:00.000Z" }],
    configuration:{ PAYMENT_PROVIDER_SECRET:"never-return-this-sentinel" }
  };
}

function fakeStore(state = healthyState()) {
  const reads = [];
  return {
    reads,
    store:{
      async readCollections(collectionNames) {
        reads.push([...collectionNames]);
        return Object.fromEntries(collectionNames.map((collection) => [collection, structuredClone(state[collection] ?? [])]));
      }
    }
  };
}

assert.deepEqual(FOUNDER_COMPANY_HEALTH_API_ENDPOINTS, [
  "GET /api/ui/company-health",
  "GET /api/ui/company-health?advanced=true"
]);
assert.equal(isFounderCompanyHealthApiPath("/api/ui/company-health"), true);
assert.equal(isFounderCompanyHealthApiPath("/api/ui/company-health/advanced"), false);

assert.deepEqual(await handleFounderCompanyHealthApiRequest({ pathname:"/api/ui/today" }), { matched:false });

let disabledRead = false;
const disabled = await handleFounderCompanyHealthApiRequest({
  enabled:false,
  pathname:"/api/ui/company-health",
  store:{ readCollections:async () => { disabledRead = true; return {}; } },
  actor:OWNER,
  now:NOW
});
assert.equal(disabled.status, 404);
assert.equal(disabledRead, false);

const normalStore = fakeStore();
const normal = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  method:"GET",
  pathname:"/api/ui/company-health",
  store:normalStore.store,
  actor:OWNER,
  now:NOW
});
assert.equal(normal.status, 200);
assert.equal(normal.body.ok, true);
assert.equal(normal.body.health.available, true);
assert.equal(normal.body.health.components.length, 9);
assert.equal(normal.body.health.advanced.available, false);
assert.equal(normal.body.health.advanced.reason, "not_requested");
assert.equal(normal.body.mutations, 0);
assert.equal(normal.body.externalActions, 0);
assert.equal(Object.hasOwn(normal.body, "state"), false);
assert.doesNotMatch(JSON.stringify(normal.body), /never-return-this-sentinel|DATABASE_URL|PAYMENT_PROVIDER_SECRET|production-hidden|osHealthSnapshots|connectorStatus|heartbeatRuns/);

const advancedStore = fakeStore();
const advanced = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  method:"GET",
  pathname:"/api/ui/company-health",
  searchParams:new URLSearchParams("advanced=true"),
  store:advancedStore.store,
  actor:OWNER,
  now:NOW
});
assert.equal(advanced.status, 200);
assert.equal(advanced.body.health.advanced.available, true);
assert.ok(advanced.body.health.advanced.checks.length >= 9);
assert.ok(advanced.body.health.advanced.checks.every((check) => ["Healthy", "Needs attention", "Unavailable"].includes(check.status.label)));
assert.equal(advanced.body.health.advanced.summary, "Bounded health checks only. Sensitive settings and raw operational output are omitted.");
assert.doesNotMatch(JSON.stringify(advanced.body), /never-return-this-sentinel|"rawLog"\s*:|"environmentName"\s*:|"configuration"\s*:/);

const operatorAdvanced = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  pathname:"/api/ui/company-health",
  searchParams:new URLSearchParams("advanced=true"),
  store:advancedStore.store,
  actor:OPERATOR,
  now:NOW
});
assert.equal(operatorAdvanced.status, 200);
assert.equal(operatorAdvanced.body.health.advanced.available, false);
assert.equal(operatorAdvanced.body.health.advanced.reason, "diagnostic_access_required");
assert.deepEqual(operatorAdvanced.body.health.advanced.checks, []);

const viewer = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  pathname:"/api/ui/company-health",
  store:normalStore.store,
  actor:{ authenticated:true, role:"viewer" },
  now:NOW
});
assert.equal(viewer.status, 403);
assert.equal(viewer.body.ok, false);
assert.equal(viewer.body.health.components.length, 0);

const invalidStore = fakeStore();
const invalidQuery = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  pathname:"/api/ui/company-health",
  searchParams:new URLSearchParams("debug=true"),
  store:invalidStore.store,
  actor:OWNER,
  now:NOW
});
assert.equal(invalidQuery.status, 400);
assert.equal(invalidStore.reads.length, 0, "invalid queries must be rejected before state is read");

const duplicateQuery = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  pathname:"/api/ui/company-health",
  searchParams:new URLSearchParams("advanced=true&advanced=false"),
  store:invalidStore.store,
  actor:OWNER,
  now:NOW
});
assert.equal(duplicateQuery.status, 400);
assert.equal(invalidStore.reads.length, 0);

const wrongValue = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  pathname:"/api/ui/company-health",
  searchParams:new URLSearchParams("advanced=all"),
  store:invalidStore.store,
  actor:OWNER,
  now:NOW
});
assert.equal(wrongValue.status, 400);

const post = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  method:"POST",
  pathname:"/api/ui/company-health",
  store:invalidStore.store,
  actor:OWNER,
  now:NOW
});
assert.equal(post.status, 405);
assert.equal(post.body.outcome, "method_not_allowed");
assert.equal(invalidStore.reads.length, 0, "read-only method rejection must not read state");

const noStore = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  pathname:"/api/ui/company-health",
  actor:OWNER,
  now:NOW
});
assert.equal(noStore.status, 503);
assert.equal(noStore.body.message, "Company Health is temporarily unavailable.");

const failedStore = await handleFounderCompanyHealthApiRequest({
  enabled:true,
  pathname:"/api/ui/company-health",
  store:{ readCollections:async () => { throw new Error("DATABASE_URL=must-not-leak"); } },
  actor:OWNER,
  now:NOW
});
assert.equal(failedStore.status, 500);
assert.equal(failedStore.body.message, "Company Health could not load. No settings were changed.");
assert.doesNotMatch(JSON.stringify(failedStore.body), /DATABASE_URL|must-not-leak/);

console.log("PASS test-founder-company-health-api");
