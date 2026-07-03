#!/usr/bin/env node
// Company Memory projector tests — projection from real domain-collection shapes, engine
// contract, and the Today summary. Field names mirror the actual source builders.
import assert from "node:assert/strict";
import { projectCompanyMemory, buildCompanyMemoryEngine, buildTodaySummary, COMPANY_MEMORY_ENGINE_ID } from "./company-memory-projector.mjs";
import { HEARTBEAT_ENGINE_IDS, buildHeartbeatRegistry } from "./heartbeat-engines.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = { now: () => "2026-07-03T12:00:00.000Z" };

function sampleState() {
  return {
    // B2 outreach approval item (outreach-os planOutreach shape)
    approvalQueue: [
      { id: "outreach-q-abc", type: "outreach_message", status: "queued_for_approval", contact_id: "prospect-contact-1", to: "x@org.org", subject: "Partnering on record clearing", title: "Outreach: Fresh Start — step 1", created_at: "2026-07-02T10:00:00Z" },
      { id: "outreach-q-sent", type: "outreach_message", status: "sent", to: "y@org.org", subject: "old", title: "Outreach: sent already" },
      { id: "approval-post-p1", type: "post", status: "needs_review", title: "LinkedIn post draft", whyItMatters: "This content needs review before it can move.", recommendedAction: "Review the draft", risk: "low" }
    ],
    autonomyActions: [
      { id: "auto-1", title: "Rebuild priorities", whyItMatters: "Priorities are stale.", recommendedAction: "Approve the rebuild", riskLevel: "low", status: "pending", approvalPolicy: "approval_required" },
      { id: "auto-2", title: "Safe internal tidy", status: "pending", approvalPolicy: "auto_safe" }
    ],
    leeActionProposals: [
      { id: "lee-action-1", title: "Create a follow-up task", summary: "Le-E suggests a partner follow-up task.", riskLevel: "low", status: "proposed" }
    ],
    supportIssues: [
      { id: "s1", title: "Login problem", summary: "A user cannot log in.", status: "open" },
      { id: "s2", title: "Old", summary: "resolved thing", status: "resolved" }
    ],
    tasks: [
      { id: "task-1", title: "Fix partner page", description: "Blocked on assets", status: "blocked", priority: "high", nextAction: "Ping designer", blocker_reason: "Waiting on logo files" },
      { id: "task-2", title: "Routine thing", status: "open", priority: "low" }
    ],
    rcapRevenueQueueTasks: [
      { task_id: "rcap-t-1", task_type: "RCAP Account Review", title: "Review Fresh Start account", status: "Ready", reason: "New import", linked_account_id: "rcap-account-fs" }
    ],
    prospectCandidates: [
      { id: "prospect-cand-1", organization_name: "Justice Works", domain: "justiceworks.org", classification: "legal_aid", review_state: "pending_review" },
      { id: "prospect-cand-2", organization_name: "Approved Org", review_state: "approved" }
    ],
    googleInsights: [
      { id: "gi-1", insightType: "Meeting Prep", title: "Meeting with County Workforce Board", inferredReason: "Calendar shows a meeting tomorrow.", suggestedNextAction: "Review the prep brief.", status: "suggested" }
    ],
    activityEvents: [
      { id: "act-1", eventType: "task_created", title: "A task was created", createdAt: "2026-07-02T09:00:00Z" }
    ],
    events: [
      { id: "event-1", eventType: "capture_routed", title: "A captured note was routed", createdAt: "2026-07-02T08:00:00Z", riskLevel: "low" }
    ],
    reactivationEvents: [
      { id: "react-ev-1", contact_id: "react-abc", email: "person@example.com", type: "bounce", reason: "mailbox full", created_at: "2026-07-01T10:00:00Z" }
    ],
    heartbeatRuns: [
      { id: "codebase-health:daily:2026-07-02", bucketKey: "codebase-health:daily:2026-07-02", engineId: "codebase-health", runId: "hb-1", status: "success", acted: false, autopilot: false, ranAt: "2026-07-02T06:00:00Z" }
    ],
    autonomyRuns: [
      { id: "autonomy-run-1", startedAt: "2026-07-02T06:00:00Z", finishedAt: "2026-07-02T06:00:05Z", status: "complete", generatedCount: 3, executedCount: 1 }
    ],
    leeRuns: [
      { id: "lee-run-1", threadId: "t1", status: "complete", inputSummary: "Asked about partners", proposedActions: ["a"], createdAt: "2026-07-02T07:00:00Z", completedAt: "2026-07-02T07:00:10Z" }
    ],
    prospectDiscoveryRuns: [
      { id: "prospect-run-2026-07-02", dateKey: "2026-07-02", ran_at: "2026-07-02T05:00:00Z", fetched: 40, staged: 6, status: "success" }
    ],
    reactivationContacts: [
      { contact_id: "react-abc", email: "person@example.com", first_name: "Pat", full_name: "Pat Doe", do_not_contact: false, wave: 1, updated_at: "2026-07-01T10:00:00Z", campaign_hold: true }
    ],
    expungementLifecycleContacts: [
      { lifecycle_contact_id: "exp-1", email: "paid@example.com", first_name: "Sam", lifecycle_stage: "paid", payment_status: "paid" },
      { lifecycle_contact_id: "exp-2", email: "stuck@example.com", first_name: "Lee", lifecycle_stage: "screening", dropoff_step: "step-3", payment_status: "" },
      { lifecycle_contact_id: "exp-3", email: "erased@example.com", deleted_or_erasure_requested: true }
    ],
    outreachContacts: [
      { contact_id: "prospect-contact-1", email: "x@org.org", contact_name: "Alex Org", organization_name: "Fresh Start", linked_account_id: "prospect-org-1" }
    ],
    rcapRevenueContacts: [
      { contact_id: "rcap-contact-1", public_email: "buyer@county.gov", contact_name: "Casey County", linked_account_id: "rcap-account-1", suppression_status: "Unsubscribed" }
    ],
    outreachSuppressions: [{ email: "person@example.com" }],
    outreachUnsubscribes: [],
    partners: [{ id: "partner-1", name: "Fresh Start Network", status: "live" }],
    outreachOrganizations: [
      { account_id: "prospect-org-1", organization_name: "Fresh Start", domain: "freshstart.org", classification: "legal_aid" }
    ],
    rcapRevenueAccounts: [
      { account_id: "rcap-account-1", organization_name: "County Workforce Board", org_type: "workforce", account_status: "Imported" }
    ],
    reactivationCampaign: { campaign_id: "mvp-reactivation", status: "active", thresholds: { hard_bounce: 0.02, spam_complaint: 0.001, unsubscribe: 0.025 } },
    reactivationAttempts: [],
    stripeRevenue: { source: "stripe_live", available: true, configured: true, gross: 1234.56, sinceLabel: "Jun 1", currency: "usd" },
    signups: { source: "expungement_signups", available: true, configured: true, paid: 4, registered: 42 },
    funnelSnapshots: []
  };
}

check("projection produces queue items from every mapped surface", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  const bySource = {};
  for (const item of state.queueItems) bySource[item.sourceEngine] = (bySource[item.sourceEngine] || 0) + 1;
  assert(bySource["outreach-sequencer"] >= 1, "outreach approval projected");
  assert(bySource["review-desk"] >= 1, "review item projected");
  assert(bySource["operations-assistant"] === 1, "only approval_required autonomy actions projected");
  assert(bySource["le-e"] === 1, "lee proposal projected");
  assert(bySource["support-inbox"] === 1, "open support issue projected (resolved skipped)");
  assert(bySource["task-desk"] === 1, "blocked task projected (routine skipped)");
  assert(bySource["rcap-revenue"] === 1, "rcap task projected");
  assert(bySource["prospect-scout"] === 1, "pending prospects projected");
  assert(bySource["calendar-reader"] === 1, "meeting prep projected");
});

check("sent/terminal source records do not become queue items", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  assert(!state.queueItems.some((i) => i.sourceRef?.itemId === "outreach-q-sent"));
  assert(!state.queueItems.some((i) => i.sourceRef?.itemId === "s2"));
});

check("all approval-requiring items land in needs_roger", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  for (const item of state.queueItems.filter((i) => i.requiresApproval)) {
    assert.equal(item.status, "needs_roger", `${item.id} (${item.title})`);
  }
});

check("projection is idempotent — second pass adds nothing", () => {
  const first = projectCompanyMemory(sampleState(), NOW);
  const second = projectCompanyMemory(first.state, NOW);
  assert.equal(second.state.queueItems.length, first.state.queueItems.length);
  assert.equal(second.state.companyEvents.length, first.state.companyEvents.length);
  assert.equal(second.state.companyContacts.length, first.state.companyContacts.length);
  assert.equal(second.state.companyOrganizations.length, first.state.companyOrganizations.length);
});

check("contacts index: suppression makes do_not_contact true; erasure-requested rows are skipped", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  const suppressed = state.companyContacts.find((c) => c.email === "person@example.com");
  assert(suppressed && suppressed.do_not_contact === true);
  const rcap = state.companyContacts.find((c) => c.email === "buyer@county.gov");
  assert(rcap && rcap.do_not_contact === true, "rcap suppression_status honored");
  assert(!state.companyContacts.some((c) => c.email === "erased@example.com"), "erasure request respected");
});

check("contact types classify from lifecycle: paid_customer and abandoned_screening", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  assert(state.companyContacts.find((c) => c.email === "paid@example.com").types.includes("paid_customer"));
  assert(state.companyContacts.find((c) => c.email === "stuck@example.com").types.includes("abandoned_screening"));
});

check("organizations dedupe across sources and classify legal_aid/workforce", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  const freshStart = state.companyOrganizations.filter((o) => /fresh start$/i.test(o.name));
  assert.equal(freshStart.length, 1, "freshstart.org deduped by domain");
  assert(freshStart[0].types.includes("legal_aid"));
  const county = state.companyOrganizations.find((o) => /county workforce/i.test(o.name));
  assert(county && county.types.includes("workforce"));
});

check("events project PII-free from reactivation (no email address in summaries)", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  const bounce = state.companyEvents.find((e) => e.type === "bounce");
  assert(bounce, "bounce event projected");
  assert(!bounce.summary.includes("@"), "summary contains no email address");
  assert.equal(bounce.risk, "watch");
});

check("agent runs normalize from all four ledgers", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  const agents = new Set(state.agentRuns.map((r) => r.agent));
  for (const agent of ["codebase-health", "autonomy-cycle", "le-e", "prospect-scout"]) {
    assert(agents.has(agent), `${agent} run projected`);
  }
});

check("engine is plan()-only, registered in the registry and id list", () => {
  const engine = buildCompanyMemoryEngine();
  assert.equal(engine.id, COMPANY_MEMORY_ENGINE_ID);
  assert.equal(typeof engine.plan, "function");
  assert.equal(engine.act, undefined, "projector must have NO act() path");
  assert(HEARTBEAT_ENGINE_IDS.includes(COMPANY_MEMORY_ENGINE_ID));
  const registry = buildHeartbeatRegistry({});
  assert(registry.some((e) => e.id === COMPANY_MEMORY_ENGINE_ID), "registered in buildHeartbeatRegistry");
  assert.equal(registry[registry.length - 1].id, COMPANY_MEMORY_ENGINE_ID, "runs last so it sees the tick's writes");
});

check("today summary aggregates without writing and stays honest about sources", () => {
  const state = sampleState();
  const before = JSON.stringify(state.queueItems || []);
  const summary = buildTodaySummary(state, { env: {}, now: NOW.now });
  assert.equal(JSON.stringify(state.queueItems || []), before, "summary computation must not mutate state");
  assert(summary.counts.needsRoger >= 5);
  assert.equal(summary.goodMorning.paid, 4);
  assert.equal(summary.goodMorning.registered, 42);
  assert.equal(summary.goodMorning.funnelConnected, false, "no funnel snapshots -> honest false");
  assert.equal(summary.money.stripeConnected, true);
  assert.equal(summary.money.gross, 1234.56);
  assert.equal(summary.peopleStuck.heldContacts, 1);
  assert.equal(summary.peopleStuck.suppressedContacts, 1);
  assert.equal(summary.peopleStuck.abandonedScreenings, 1);
  assert.equal(summary.partners.live, 1);
  assert.equal(summary.partners.prospectsPendingReview, 1);
  assert.equal(summary.meetings.length, 1);
});

check("today summary money section is honest when Stripe is absent", () => {
  const state = sampleState();
  delete state.stripeRevenue;
  const summary = buildTodaySummary(state, { env: {}, now: NOW.now });
  assert.equal(summary.money.stripeConnected, false);
  assert.equal(summary.money.gross, null);
  assert(/connected/i.test(summary.money.note));
});

check("no engineering jargon in any user-facing projected string", () => {
  const { state } = projectCompanyMemory(sampleState(), NOW);
  const strings = [];
  for (const i of state.queueItems) strings.push(i.title, i.summary, i.recommendation);
  for (const e of state.companyEvents) strings.push(e.summary);
  for (const r of state.agentRuns) strings.push(r.output_summary);
  for (const s of strings) {
    assert(!/heartbeat|mutex|act\(\)|registry|lease|\bJSON\b|autopilot|webhook health singleton/i.test(String(s)), `jargon leaked: ${s}`);
  }
});

console.log(`\ntest-company-memory-projector: ${passed} checks passed`);
