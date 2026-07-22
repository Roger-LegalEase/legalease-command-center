#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  FOUNDER_COMPANY_HEALTH_ENDPOINT,
  FOUNDER_HEALTH_COMPONENTS,
  FOUNDER_HEALTH_STATUSES,
  buildFounderCompanyHealth
} from "./founder-company-health-service.mjs";

const NOW = "2026-07-21T12:00:00.000Z";
const OWNER = { authenticated:true, role:"owner", id:"founder-example" };
const OPERATOR = { authenticated:true, role:"operator", id:"operator-example" };

function byId(view, id) {
  const found = view.components.find((item) => item.id === id);
  assert.ok(found, `missing Company Health component: ${id}`);
  return found;
}

const healthyState = {
  osHealthSnapshots:[
    {
      id:"health-hidden",
      generated_at:"2026-07-21T11:30:00.000Z",
      overall_health:"critical",
      allowedRoles:["admin"]
    },
    {
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
      rawLog:"must not leave the server",
      environmentName:"production-secret-name"
    }
  ],
  runtime:{
    applicationHealthy:true,
    supabaseDbConnected:true,
    supabaseStorage:{ connected:true, lastCheckedAt:"2026-07-21T09:00:00.000Z" },
    accessControl:{ authRequired:true, checkedAt:"2026-07-21T09:00:00.000Z" }
  },
  connectorStatus:[
    { connector:"email", configured:true, status:"connected", lastSyncStatus:"connected", lastSyncAt:"2026-07-21T10:00:00.000Z" },
    { connector:"gmail", configured:true, status:"connected", lastSyncStatus:"connected", lastSyncAt:"2026-07-21T10:10:00.000Z" },
    { connector:"calendar", configured:true, status:"connected", lastSyncStatus:"connected", lastSyncAt:"2026-07-21T10:11:00.000Z" },
    { connector:"website", configured:true, status:"connected", lastSyncStatus:"connected", lastSyncAt:"2026-07-21T10:15:00.000Z" }
  ],
  socialAccounts:[
    { platform:"google_workspace", status:"connected", connectedAt:"2026-07-01T12:00:00.000Z", updatedAt:"2026-07-21T10:12:00.000Z" }
  ],
  sendgridWebhookHealth:{ lastOkAt:"2026-07-21T10:00:00.000Z", verified_batches:8, rejected_batches:0 },
  stripeRevenue:{ available:true, configured:true, gross:1000, fetchedAt:"2026-07-21T10:30:00.000Z" },
  funnelSnapshots:[],
  heartbeatRuns:[
    { id:"job-current", status:"success", ranAt:"2026-07-21T10:20:00.000Z" }
  ],
  logs:["raw operational output must never be returned"],
  configuration:{ PAYMENT_PROVIDER_SECRET:"must-not-leak" }
};

assert.equal(FOUNDER_COMPANY_HEALTH_ENDPOINT, "/api/ui/company-health");
const before = structuredClone(healthyState);
const health = buildFounderCompanyHealth(healthyState, OWNER, NOW);
assert.equal(health.available, true);
assert.equal(health.overall.status.label, "Healthy");
assert.deepEqual(health.components.map((item) => item.id), FOUNDER_HEALTH_COMPONENTS.map((item) => item.id));
assert.equal(health.components.length, 9);
assert.ok(health.components.every((item) => item.status.label === "Healthy"));
assert.ok(health.components.every((item) => ["Healthy", "Needs attention", "Unavailable"].includes(item.status.label)));
assert.equal(health.lastSuccessfulOperation.available, true);
assert.equal(health.lastSuccessfulOperation.area, "Stripe");
assert.equal(health.lastSuccessfulOperation.occurredAt, "2026-07-21T10:30:00.000Z");
assert.equal(health.advanced.available, false);
assert.equal(health.advanced.reason, "not_requested");
assert.equal(health.safety.rawLogsReturned, false);
assert.equal(health.safety.sensitiveSettingsReturned, false);
assert.equal(health.safety.externalActions, 0);
assert.ok(Object.isFrozen(health) && Object.isFrozen(health.components[0]));
assert.deepEqual(healthyState, before, "Company Health projection must not mutate state");
assert.equal(byId(health, "application").summary, "The latest application check completed successfully.", "an unauthorized newer snapshot must not affect the owner view");

const normalJson = JSON.stringify(health);
for (const forbidden of [
  "must not leave the server",
  "production-secret-name",
  "PAYMENT_PROVIDER_SECRET",
  "must-not-leak",
  "raw operational output",
  "process.env",
  "connectorStatus",
  "osHealthSnapshots",
  "heartbeatRuns",
  "provider payload",
  "storage backend"
]) assert.ok(!normalJson.includes(forbidden), `normal Company Health must omit ${forbidden}`);

const advanced = buildFounderCompanyHealth(healthyState, OWNER, NOW, { advanced:true });
assert.equal(advanced.advanced.available, true);
assert.ok(advanced.advanced.checks.length >= 9 && advanced.advanced.checks.length <= 16);
assert.ok(advanced.advanced.checks.every((check) => ["Healthy", "Needs attention", "Unavailable"].includes(check.status.label)));
assert.ok(advanced.advanced.checks.some((check) => check.id === "request_protection" && check.status.label === "Healthy"));
assert.ok(advanced.advanced.checks.some((check) => check.id === "response_safety" && check.status.label === "Healthy"));
const advancedJson = JSON.stringify(advanced.advanced);
for (const forbidden of ["rawLog", "environmentName", "PAYMENT_PROVIDER_SECRET", "must-not-leak", "connectorStatus", "osHealthSnapshots", "heartbeatRuns"]) {
  assert.ok(!advancedJson.includes(forbidden), `advanced view must omit ${forbidden}`);
}

const operatorAdvanced = buildFounderCompanyHealth(healthyState, OPERATOR, NOW, { advanced:true });
assert.equal(operatorAdvanced.available, true);
assert.equal(operatorAdvanced.advanced.available, false);
assert.equal(operatorAdvanced.advanced.reason, "diagnostic_access_required");

const attentionState = {
  osHealthSnapshots:[{
    id:"attention",
    generated_at:"2026-07-21T09:00:00.000Z",
    overall_health:"critical",
    connection_health:{
      supabase_db:{ ok:false, status:"unavailable" },
      supabase_storage:{ ok:false, status:"unavailable" },
      owner_token_auth:{ ok:false, status:"unverified" }
    },
    auth_hardening:{
      endpoint_protection:{ status:"unprotected" },
      secret_leakage:{ status:"leak_detected" }
    }
  }],
  connectorStatus:[
    { connector:"email", configured:true, status:"failed", lastSyncStatus:"failed", lastSyncAt:"2026-07-21T10:00:00.000Z", lastError:"PAYMENT_PROVIDER_SECRET=must-not-leak" },
    { connector:"gmail", configured:true, status:"needs_refresh", lastSyncStatus:"needs refresh", lastSyncAt:"2026-07-21T10:10:00.000Z", lastError:"OAUTH_TOKEN=must-not-leak" },
    { connector:"calendar", configured:true, status:"failed", lastSyncStatus:"failed", lastSyncAt:"2026-07-21T10:11:00.000Z" },
    { connector:"website", configured:true, status:"failed", lastSyncStatus:"failed", lastSyncAt:"2026-07-21T10:15:00.000Z", lastError:"ANALYTICS_KEY=must-not-leak" }
  ],
  socialAccounts:[{ platform:"google_workspace", status:"needs_refresh", connectedAt:"2026-07-01T12:00:00.000Z", lastError:"OAUTH_TOKEN=must-not-leak" }],
  sendgridWebhookHealth:{ last_error:"SIGNATURE_SECRET=must-not-leak", rejected_batches:5, verified_batches:1 },
  stripeRevenue:{ available:false, configured:true, error:"STRIPE_SECRET_KEY=must-not-leak", fetchedAt:"2026-07-21T10:30:00.000Z" },
  heartbeatRuns:[{ id:"job-failed", status:"failed", ranAt:"2026-07-21T10:20:00.000Z", rawError:"DATABASE_URL=must-not-leak" }]
};
const attention = buildFounderCompanyHealth(attentionState, OWNER, NOW, { advanced:true });
assert.equal(attention.overall.status.label, "Needs attention");
assert.equal(attention.overall.counts.needsAttention, 9);
assert.ok(attention.components.every((item) => item.status.label === "Needs attention"));
assert.equal(attention.lastSuccessfulOperation.available, false);
assert.equal(byId(attention, "google").summary, "The Google connection needs attention.");
assert.equal(byId(attention, "stripe").summary, "The payment connection needs attention.");
assert.equal(byId(attention, "background_jobs").summary, "Scheduled background checks need attention.");
const attentionJson = JSON.stringify(attention);
for (const forbidden of ["PAYMENT_PROVIDER_SECRET", "OAUTH_TOKEN", "ANALYTICS_KEY", "SIGNATURE_SECRET", "STRIPE_SECRET_KEY", "DATABASE_URL", "must-not-leak"]) {
  assert.ok(!attentionJson.includes(forbidden), `error details must not leak ${forbidden}`);
}

const unavailable = buildFounderCompanyHealth({}, OWNER, NOW);
assert.equal(unavailable.available, true);
assert.equal(unavailable.overall.status.label, "Unavailable");
assert.equal(unavailable.overall.counts.unavailable, 9);
assert.ok(unavailable.components.every((item) => item.status.label === "Unavailable"));
assert.equal(unavailable.lastSuccessfulOperation.available, false);

const mixed = buildFounderCompanyHealth({ runtime:{ applicationHealthy:true } }, OWNER, NOW);
assert.equal(mixed.overall.status.label, "Healthy");
assert.equal(mixed.overall.counts.healthy, 1);
assert.equal(mixed.overall.counts.unavailable, 8);

const staleJobs = buildFounderCompanyHealth({ heartbeatRuns:[{ id:"old-job", status:"success", ranAt:"2026-07-17T10:00:00.000Z" }] }, OWNER, NOW);
assert.equal(byId(staleJobs, "background_jobs").status.label, "Needs attention");
assert.equal(byId(staleJobs, "background_jobs").lastSuccessfulAt, "2026-07-17T10:00:00.000Z");

const unauthorized = buildFounderCompanyHealth({}, { authenticated:true, role:"viewer" }, NOW, { advanced:true });
assert.equal(unauthorized.available, false);
assert.equal(unauthorized.components.length, 0);
assert.equal(unauthorized.advanced.available, false);

assert.equal(FOUNDER_HEALTH_STATUSES.healthy.label, "Healthy");
assert.equal(FOUNDER_HEALTH_STATUSES.needs_attention.label, "Needs attention");
assert.equal(FOUNDER_HEALTH_STATUSES.unavailable.label, "Unavailable");

console.log("PASS test-founder-company-health-service");
console.log(JSON.stringify({ components:health.components.length, overall:health.overall.status.label, advancedChecks:advanced.advanced.checks.length, attentionAreas:attention.overall.counts.needsAttention, rawLogs:0, sensitiveSettings:0, externalActions:0 }));
