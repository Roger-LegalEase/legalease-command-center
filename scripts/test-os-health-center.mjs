import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOsHealthSnapshot, saveOsHealthSnapshot } from "./os-health.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const baseState = {
  runtime: {
    livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } },
    openAIConfigured: true,
    accessControl: { authRequired: true, localFallbackOpen: false },
    supabaseStorage: { connected: true, ok: true }
  },
  captureInbox: [
    { id: "capture-1", summary: "Needs review capture", review_state: "review_required", created_at: "2026-05-27T10:00:00.000Z" }
  ],
  morningBriefs: [],
  operatingMemory: [],
  eveningReflections: [],
  dailyCloseouts: [],
  activityEvents: [
    { id: "activity-1", eventType: "Quick Capture saved", title: "Capture saved", createdAt: "2026-05-27T10:00:00.000Z" }
  ],
  auditHistory: [
    { id: "audit-1", action: "quick capture saved", timestamp: "2026-05-27T10:00:00.000Z" }
  ],
  partnerProgramArtifacts: [
    { key: "rcap-dashboard-readiness-v1", title: "RCAP Dashboard Readiness", review_state: "blocked", review_updated_at: "2026-05-27T11:00:00.000Z" }
  ],
  reports: [],
  evidencePackNotes: [],
  partners: [{ slug: "rcap", missing_external_details: true, missingExternalDetailsList: ["primary contact"] }],
  partnerPrograms: [{ slug: "rcap", name: "RCAP" }],
  tasks: []
};

const snapshot = buildOsHealthSnapshot(baseState, {
  now: "2026-05-27T20:00:00.000Z",
  date: "2026-05-27",
  supabaseDbConnected: true,
  supabaseStorageConnected: true,
  openAIConfigured: true,
  ownerTokenAuthConfigured: true,
  localFallbackAvailable: true
});

assert.equal(snapshot.id, "os-health-2026-05-27", "OS health snapshot should use a stable daily id.");
assert(snapshot.overall_health, "Overall health should exist.");
assert(snapshot.connection_health.supabase_db.status === "connected", "Connection health should include Supabase DB.");
assert(snapshot.connection_health.supabase_storage.status === "connected", "Connection health should include Supabase Storage.");
assert(snapshot.connection_health.openai.status === "configured", "Connection health should include OpenAI.");
assert(snapshot.connection_health.owner_token_auth.status === "protected", "Connection health should include owner-token auth.");
assert(snapshot.connection_health.local_fallback.status, "Connection health should include local fallback state.");
assert(snapshot.workflow_health.quick_capture.status, "Workflow health should include Quick Capture.");
assert(snapshot.workflow_health.capture_inbox.status, "Workflow health should include Capture Inbox.");
assert(snapshot.workflow_health.morning_brief.status, "Workflow health should include Morning Brief.");
assert(snapshot.workflow_health.daily_operating_loop.status, "Workflow health should include Daily Operating Loop.");
assert(snapshot.workflow_health.operating_memory.status, "Workflow health should include Operating Memory.");
assert(snapshot.workflow_health.evening_reflection.status, "Workflow health should include Evening Reflection.");
assert(snapshot.workflow_health.daily_closeout.status, "Workflow health should include Daily Closeout.");
assert(snapshot.workflow_health.rcap_activation.status, "Workflow health should include RCAP Activation.");
assert(snapshot.workflow_health.rcap_review_workspace.status, "Workflow health should include RCAP Review Workspace.");
assert(snapshot.workflow_health.approval_engine.status, "Workflow health should include Approval Engine.");
assert(snapshot.workflow_health.handoff_readiness.status, "Workflow health should include Handoff Readiness.");
assert(snapshot.data_freshness.last_capture_time, "Data freshness should include last capture time.");
assert(snapshot.data_freshness.last_audit_activity_event, "Data freshness should include last audit/activity event.");
assert(snapshot.trust_warnings.some(item => /no morning brief saved today/i.test(item.title + " " + item.detail)), "Health should warn when morning brief is missing.");
assert(snapshot.trust_warnings.some(item => /no recent operating memory/i.test(item.title + " " + item.detail)), "Health should warn when operating memory is missing.");
assert(snapshot.trust_warnings.some(item => /no evening reflection saved today/i.test(item.title + " " + item.detail)), "Health should warn when evening reflection is missing.");
assert(snapshot.trust_warnings.some(item => /no closeout saved today/i.test(item.title + " " + item.detail)), "Health should warn when closeout is missing.");
assert(snapshot.trust_warnings.some(item => /capture inbox has unreviewed items/i.test(item.title + " " + item.detail)), "Health should warn for unreviewed captures.");
assert(snapshot.trust_warnings.some(item => /handoff readiness blocked/i.test(item.title + " " + item.detail)), "Health should warn for blocked handoff readiness.");
assert(snapshot.self_test_status.checklist.some(item => item.command === "npm run verify"), "Self-test checklist should include npm run verify.");
assert(snapshot.self_test_status.checklist.some(item => item.command === "npm run verify:production"), "Self-test checklist should include production verification.");
assert(snapshot.self_test_status.checklist.some(item => item.command === "npm audit --audit-level=high"), "Self-test checklist should include npm audit.");
assert(snapshot.self_test_status.checklist.some(item => item.command === "npm test"), "Self-test checklist should include npm test.");
assert(snapshot.auth_hardening.endpoint_protection.status, "OS Health should include endpoint protection status.");
assert(snapshot.auth_hardening.secret_leakage.status, "OS Health should include secret leakage status.");
assert(snapshot.auth_hardening.forbidden_action_guard.status, "OS Health should include forbidden action guard status.");
assert(snapshot.auth_hardening.last_auth_hardening_check, "OS Health should include last auth hardening check.");
assert(snapshot.summary.safe_to_trust.length > 0, "Health summary should say what is safe to trust.");
assert(snapshot.summary.needs_attention.length > 0, "Health summary should say what needs attention.");
assert(snapshot.summary.do_not_trust_yet.length > 0, "Health summary should say what not to trust yet.");
assert(snapshot.summary.next_operator_action, "Health summary should include next operator action.");
assert.equal(snapshot.live_gates_count, 0, "Live gates must remain 0.");
assert.equal(snapshot.no_external_actions_confirmation, "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no external systems contacted beyond existing internal health checks.", "Health snapshot must confirm no external actions.");

const saved = saveOsHealthSnapshot(baseState, {
  now: "2026-05-27T20:05:00.000Z",
  date: "2026-05-27",
  actor: "owner_token",
  supabaseDbConnected: true,
  supabaseStorageConnected: true,
  openAIConfigured: true,
  ownerTokenAuthConfigured: true,
  localFallbackAvailable: true
});
assert.equal(saved.state.osHealthSnapshots.length, 1, "Refresh App Status should create one snapshot.");
assert.equal(saved.state.auditHistory[0].action, "os health snapshot refreshed", "Refresh should create audit entry.");
assert.equal(saved.state.activityEvents[0].eventType, "OS Health Snapshot refreshed", "Refresh should create activity event.");
const savedAgain = saveOsHealthSnapshot(saved.state, {
  now: "2026-05-27T20:10:00.000Z",
  date: "2026-05-27",
  actor: "owner_token",
  supabaseDbConnected: true,
  supabaseStorageConnected: true,
  openAIConfigured: true,
  ownerTokenAuthConfigured: true,
  localFallbackAvailable: true
});
assert.equal(savedAgain.state.osHealthSnapshots.length, 1, "Refresh should update today's snapshot instead of duplicating.");

assert(serverSource.includes("function cockpitOsHealthHtml"), "Cockpit App Status card must render.");
assert(serverSource.includes("App Status"), "App Status label must exist.");
assert(serverSource.includes("osHealthPageHtml"), "#os-health route renderer must exist.");
assert(serverSource.includes("\"os-health\""), "#os-health route must be registered.");
assert(serverSource.includes("Connection Health"), "Connection Health section must render.");
assert(serverSource.includes("Workflow Status"), "Workflow Status section must render.");
assert(serverSource.includes("Data Freshness"), "Data Freshness section must render.");
assert(serverSource.includes("Trust Warnings"), "Trust Warnings section must render.");
assert(serverSource.includes("Test Status"), "Test Status section must render.");
assert(serverSource.includes("Access Protection"), "Access protection section must render in App Status.");
assert(serverSource.includes("Endpoint protection status"), "Endpoint protection status must render.");
assert(serverSource.includes("Secret leakage status"), "Secret leakage status must render.");
assert(serverSource.includes("Forbidden action guard status"), "Forbidden action guard status must render.");
assert(serverSource.includes("Refresh App Status"), "Refresh App Status action must render.");
assert(serverSource.includes("/api/os-health/refresh"), "OS Health refresh endpoint must exist.");
assert(!/os-health[\s\S]{0,2600}(send email|publish page|activate dashboard|enable live)/i.test(serverSource), "OS Health must not enable external controls.");

console.log("OS Health Center tests passed.");
