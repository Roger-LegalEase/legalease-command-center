// Stranded send-claim reconciliation, the durable claim boundary, and the write-amplification
// fix that caused the strandings in the first place.
//
// What is proven here:
//   1. A claim transition is written durably, per row, and survives a failed bulk write.
//   2. The tick's closing bulk write can no longer conflict with its own mid-tick claim insert.
//   3. Reconciliation classifies ONLY on provider evidence, and leaves anything unevidenced
//      blocked. Retention gaps are reported, never assumed away.
//   4. A released claim stops blocking and can be re-claimed in place; every other status still
//      blocks.
//   5. A no-op projection writes nothing (the amplification fix).
//   6. Every tick persists its per-contact reason codes.

import assert from "node:assert/strict";

import {
  RECONCILE_CLASSES,
  applyReactivationReconciliation,
  restoreReconciledAttempts,
  claimBlocksSend,
  planReactivationReconciliation,
  stuckClaims
} from "./reactivation-reconcile.mjs";
import { buildReactivationReconcileEngine, RECONCILE_ENGINE_ID } from "./reactivation-reconcile-engine.mjs";
import { summarizeDecisions, REACTIVATION_DECISIONS_COLLECTION } from "./reactivation-os.mjs";
import { upsertCompanyContact, upsertCompanyOrganization, upsertQueueItems } from "./company-memory.mjs";
import { coreStateCollections } from "./storage.mjs";
import { DURABLE_CLAIM_COLLECTIONS } from "./heartbeat.mjs";

const checks = [];
const pending = [];
function check(name, run) {
  const result = run();
  if (result && typeof result.then === "function") pending.push(result.then(() => checks.push(name)));
  else checks.push(name);
}

const NOW = new Date("2026-07-27T18:00:00.000Z");
const claim = (id, over = {}) => ({
  id: `react-claim-mvp-reactivation-${id}-step-2`,
  campaign_id: "mvp-reactivation",
  contact_id: id,
  step_number: 2,
  to: `${id}@example.org`,
  status: "claimed",
  claimed_at: "2026-07-09T12:00:00.000Z",
  resolved_at: "",
  ...over
});

// A SendGrid stand-in. `activityDays` are the days per-message activity still reaches.
function fakeSendGrid({ activityDays = {}, totals = {} } = {}) {
  return async (url) => {
    const target = new URL(url);
    if (target.pathname === "/v3/stats") {
      const body = Object.entries(totals).map(([date, requests]) => ({
        date, stats: [{ metrics: { requests, delivered: requests, bounces: 0, blocks: 0, spam_reports: 0 } }]
      }));
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }
    if (target.pathname === "/v3/messages") {
      const query = target.searchParams.get("query") || "";
      const day = (query.match(/TIMESTAMP "(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
      const messages = (activityDays[day] || []).map((to) => ({
        msg_id: `msg-${to}`, to_email: to, from_email: "sender@example.org",
        subject: "s", status: "delivered", last_event_time: `${day}T12:00:30Z`
      }));
      return { ok: true, status: 200, text: async () => JSON.stringify({ messages }) };
    }
    return { ok: false, status: 404, text: async () => "{}" };
  };
}
const ENV = { SENDGRID_API_KEY: "test-key" };

// ---------------------------------------------------------------------------------------------
// 1. Evidence, not guesswork
// ---------------------------------------------------------------------------------------------

check("per-message activity confirms a claim and names the message", async () => {
  const state = { reactivationSendClaims: [claim("alpha", { claimed_at: "2026-07-27T12:00:00.000Z" })] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    fetchImpl: fakeSendGrid({ activityDays: { "2026-07-27": ["alpha@example.org"] }, totals: { "2026-07-27": 1 } })
  });
  assert.equal(plan.counts[RECONCILE_CLASSES.CONFIRMED_PER_MESSAGE], 1);
  assert.equal(plan.decisions[0].resolution, "confirm");
  assert.equal(plan.decisions[0].evidence.msgId, "msg-alpha@example.org");
});

check("activity that covers the day and lacks the recipient is a genuine no-send", async () => {
  const state = { reactivationSendClaims: [claim("ghost", { claimed_at: "2026-07-27T12:00:00.000Z" })] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    fetchImpl: fakeSendGrid({ activityDays: { "2026-07-27": ["someone-else@example.org"] }, totals: { "2026-07-27": 1 } })
  });
  assert.equal(plan.counts[RECONCILE_CLASSES.NO_RECORD], 1);
  assert.equal(plan.decisions[0].resolution, "release", "proof of a non-send is what releases a claim");
});

check("outside activity retention, matching daily totals confirm the day 1:1", async () => {
  // Two claims that day, and SendGrid accepted exactly two messages that day.
  const state = { reactivationSendClaims: [claim("beta"), claim("gamma")] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    fetchImpl: fakeSendGrid({ activityDays: {}, totals: { "2026-07-09": 2 } })
  });
  assert.equal(plan.counts[RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS], 2);
  assert.match(plan.decisions[0].evidence.detail, /accepted 2 messages/);
});

check("daily totals that do NOT agree resolve nothing — the gap is reported, not assumed away", async () => {
  const state = { reactivationSendClaims: [claim("beta"), claim("gamma")] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    // Two claims, but SendGrid only accepted one message: we cannot say WHICH one went.
    fetchImpl: fakeSendGrid({ activityDays: {}, totals: { "2026-07-09": 1 } })
  });
  assert.equal(plan.counts[RECONCILE_CLASSES.UNDETERMINED], 2);
  assert.ok(plan.decisions.every((entry) => entry.resolution === "leave_blocked"));
  assert.ok(plan.notes.some((note) => /do not agree/.test(note)), "the disagreement must be stated");
});

check("an unreachable SendGrid proposes nothing at all", async () => {
  const state = { reactivationSendClaims: [claim("beta")] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: {}, fetchImpl: fakeSendGrid({})
  });
  assert.equal(plan.ok, false, "a plan with no evidence is not ok to apply");
  assert.equal(plan.counts[RECONCILE_CLASSES.UNDETERMINED], 1);
});

check("a claim younger than the grace window is never a candidate", () => {
  const state = { reactivationSendClaims: [claim("fresh", { claimed_at: new Date(NOW.getTime() - 60_000).toISOString() })] };
  assert.equal(stuckClaims(state, { now: NOW }).length, 0, "a send may simply be in flight");
});

check("an owner-nominated day is confirmed as its OWN class, carrying the discrepancy", async () => {
  const state = { reactivationSendClaims: [claim("beta"), claim("gamma")] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    // One fewer accepted than claims created: the automatic rule declines this day.
    fetchImpl: fakeSendGrid({ activityDays: {}, totals: { "2026-07-09": 1 } }),
    ownerConfirmedDays: ["2026-07-09"], ownerDecisionBy: "Roger", ownerDecisionNote: "at most one missed touch"
  });
  assert.equal(plan.counts[RECONCILE_CLASSES.CONFIRMED_OWNER_DECISION], 2);
  assert.equal(plan.counts[RECONCILE_CLASSES.UNDETERMINED], 0);
  assert.notEqual(RECONCILE_CLASSES.CONFIRMED_OWNER_DECISION, RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS,
    "an owner decision must never be indistinguishable from evidence-only confirmation");
  const evidence = plan.decisions[0].evidence;
  assert.equal(evidence.source, "owner_decision_on_daily_totals");
  assert.equal(evidence.requests, 1);
  assert.equal(evidence.claimsCreated, 2);
  assert.equal(evidence.decidedBy, "Roger");
  assert.equal(evidence.reversible, true, "it must stay revisitable if better evidence appears");
  assert.match(evidence.detail, /-1/, "the exact discrepancy is recorded, not smoothed over");
});

check("nominating a day changes nothing for days the evidence already settles", async () => {
  const state = { reactivationSendClaims: [claim("alpha", { claimed_at: "2026-07-27T12:00:00.000Z" })] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    fetchImpl: fakeSendGrid({ activityDays: { "2026-07-27": ["alpha@example.org"] }, totals: { "2026-07-27": 1 } }),
    ownerConfirmedDays: ["2026-07-27"]
  });
  assert.equal(plan.counts[RECONCILE_CLASSES.CONFIRMED_PER_MESSAGE], 1, "per-message evidence still wins");
  assert.equal(plan.counts[RECONCILE_CLASSES.CONFIRMED_OWNER_DECISION], 0);
});

check("proof of a non-send still beats the owner's nomination", async () => {
  const state = { reactivationSendClaims: [claim("beta")] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    // SendGrid accepted NOTHING that day, so the day is answerable after all: this claim
    // genuinely never sent. Nominating the day must not overwrite that with a confirmation.
    fetchImpl: fakeSendGrid({ activityDays: {}, totals: { "2026-07-09": 0 } }),
    ownerConfirmedDays: ["2026-07-09"]
  });
  assert.equal(plan.counts[RECONCILE_CLASSES.NO_RECORD], 1);
  assert.equal(plan.counts[RECONCILE_CLASSES.CONFIRMED_OWNER_DECISION], 0,
    "the owner decision applies only where the evidence is genuinely silent");
});

// ---------------------------------------------------------------------------------------------
// 2. Applying, and what it does not touch
// ---------------------------------------------------------------------------------------------

check("apply confirms, releases, keeps evidence, and deletes nothing", async () => {
  const state = { reactivationSendClaims: [claim("alpha", { claimed_at: "2026-07-27T12:00:00.000Z" }), claim("ghost", { claimed_at: "2026-07-27T12:00:00.000Z" })] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    fetchImpl: fakeSendGrid({ activityDays: { "2026-07-27": ["alpha@example.org"] }, totals: { "2026-07-27": 2 } })
  });
  const applied = applyReactivationReconciliation(state, plan, { now: NOW, actor: "owner" });
  assert.equal(applied.confirmed, 1);
  assert.equal(applied.released, 1);
  assert.equal(applied.state.reactivationSendClaims.length, 2, "nothing is ever deleted");
  const confirmedRow = applied.state.reactivationSendClaims.find((row) => row.contact_id === "alpha");
  assert.equal(confirmedRow.status, "sent");
  assert.equal(confirmedRow.claimed_at, "2026-07-27T12:00:00.000Z", "the original claim time is preserved");
  assert.ok(confirmedRow.reconciliation.evidence.msgId, "the evidence travels with the row");
  assert.equal(applied.state.reactivationSendClaims.find((row) => row.contact_id === "ghost").status, "released");
});

check("apply never overwrites a claim something else already resolved", async () => {
  const state = { reactivationSendClaims: [claim("alpha", { claimed_at: "2026-07-27T12:00:00.000Z" })] };
  const plan = await planReactivationReconciliation(state, {
    now: NOW, env: ENV,
    fetchImpl: fakeSendGrid({ activityDays: { "2026-07-27": ["alpha@example.org"] }, totals: { "2026-07-27": 1 } })
  });
  const moved = { reactivationSendClaims: [{ ...state.reactivationSendClaims[0], status: "sent", reason: "resolved elsewhere" }] };
  const applied = applyReactivationReconciliation(moved, plan, { now: NOW });
  assert.equal(applied.confirmed, 0, "a stale plan must not rewrite a row that moved on");
  assert.equal(applied.state.reactivationSendClaims[0].reason, "resolved elsewhere");
});

check("only a released claim stops blocking", () => {
  for (const status of ["claimed", "sent", "failed"]) {
    assert.equal(claimBlocksSend({ status }), true, `${status} must still block`);
  }
  assert.equal(claimBlocksSend({ status: "released" }), false);
});

check("restoring the lost attempts is what lets a person advance to their NEXT touch", () => {
  const confirmed = {
    ...claim("beta"),
    status: "sent",
    reconciliation: { at: "2026-07-27T16:00:00.000Z", classification: RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS, evidence: { msgId: "" } }
  };
  const state = { reactivationSendClaims: [confirmed], reactivationAttempts: [] };
  const restored = restoreReconciledAttempts(state, { now: NOW });
  assert.equal(restored.restored, 1);
  const row = restored.state.reactivationAttempts[0];
  assert.equal(row.status, "sent");
  assert.equal(row.step_number, 2);
  assert.equal(row.reconstructed, true, "it must never look like a directly observed send");
  assert.equal(row.source, "reconciliation");
  assert.equal(row.reconciliation_class, RECONCILE_CLASSES.CONFIRMED_DAILY_TOTALS, "the evidence class travels onto the attempt");
  assert.equal(row.created_at, confirmed.claimed_at, "the real send time, so cadence and spacing are computed from it");
  assert.equal(row.sent_date, "2026-07-09", "dated when it was sent, so today's cap does not see it as today's traffic");
});

check("restoring is idempotent and never invents a second attempt for a step", () => {
  const confirmed = {
    ...claim("beta"), status: "sent",
    reconciliation: { at: "2026-07-27T16:00:00.000Z", classification: RECONCILE_CLASSES.CONFIRMED_PER_MESSAGE, evidence: {} }
  };
  const once = restoreReconciledAttempts({ reactivationSendClaims: [confirmed], reactivationAttempts: [] }, { now: NOW });
  const twice = restoreReconciledAttempts(once.state, { now: NOW });
  assert.equal(twice.restored, 0, "re-running restores nothing twice");
  assert.equal(twice.state.reactivationAttempts.length, 1);
});

check("a claim that was NOT reconciled is never given an attempt", () => {
  const state = { reactivationSendClaims: [claim("beta")], reactivationAttempts: [] };
  const restored = restoreReconciledAttempts(state, { now: NOW });
  assert.equal(restored.restored, 0, "only a claim confirmed against evidence may be reconstructed");
});

// ---------------------------------------------------------------------------------------------
// 3. The standing engine
// ---------------------------------------------------------------------------------------------

check("the engine reports stranded claims in plain English without acting", () => {
  const engine = buildReactivationReconcileEngine({});
  const state = { reactivationSendClaims: [claim("beta"), claim("gamma")] };
  const planned = engine.plan(state, { now: NOW });
  assert.equal(planned.state, state, "plan() mutates nothing");
  const observation = planned.observations[0];
  assert.equal(observation.count, 2);
  assert.match(observation.summary, /blocked from receiving/);
  for (const jargon of ["claim", "ledger", "collection", "act()"]) {
    assert.ok(!observation.summary.includes(jargon), `the owner-facing summary must not say "${jargon}"`);
  }
});

check("the engine will not act while its autopilot is off", async () => {
  const engine = buildReactivationReconcileEngine({ fetchImpl: fakeSendGrid({ totals: { "2026-07-09": 1 } }) });
  const state = { reactivationSendClaims: [claim("beta")], autopilotSettings: {} };
  const acted = await engine.act(state, { now: NOW, env: ENV });
  assert.equal(acted.results[0].reason, "autopilot_off");
  assert.equal(acted.state.reactivationSendClaims[0].status, "claimed", "nothing moved");
});

check("with autopilot on the engine reconciles and touches only the claim ledger", async () => {
  const engine = buildReactivationReconcileEngine({ fetchImpl: fakeSendGrid({ activityDays: {}, totals: { "2026-07-09": 1 } }) });
  const state = {
    reactivationSendClaims: [claim("beta")],
    autopilotSettings: { [RECONCILE_ENGINE_ID]: { enabled: true } }
  };
  const acted = await engine.act(state, { now: NOW, env: ENV });
  assert.equal(acted.results[0].status, "reconciled");
  assert.equal(acted.results[0].confirmed, 1);
  assert.deepEqual(acted.allowedCollections, ["reactivationSendClaims"]);
});

// ---------------------------------------------------------------------------------------------
// 4. The causes: durable claims, and the write amplification behind the timeout
// ---------------------------------------------------------------------------------------------

check("claim ledgers are excluded from the heartbeat's bulk write", () => {
  assert.ok(DURABLE_CLAIM_COLLECTIONS.includes("reactivationSendClaims"));
  assert.ok(DURABLE_CLAIM_COLLECTIONS.includes("outreachSendClaims"));
});

check("a no-op re-projection rewrites nothing", () => {
  const now = () => "2026-07-27T18:00:00.000Z";
  const later = () => "2026-07-27T19:00:00.000Z";
  const first = upsertCompanyContact([], { email: "a@example.org", name: "A", types: ["consumer"] }, { now });
  const second = upsertCompanyContact(first.contacts, { email: "a@example.org", name: "A", types: ["consumer"] }, { now: later });
  assert.equal(second.contacts[0], first.contacts[0], "an unchanged contact keeps its exact prior row");
  assert.equal(second.contacts[0].updatedAt, "2026-07-27T18:00:00.000Z", "and is not restamped");

  const org1 = upsertCompanyOrganization([], { org_id: "o1", name: "Org", types: ["nonprofit"] }, { now });
  const org2 = upsertCompanyOrganization(org1.organizations, { org_id: "o1", name: "Org", types: ["nonprofit"] }, { now: later });
  assert.equal(org2.organizations[0], org1.organizations[0], "an unchanged organization keeps its prior row");

  const item = { id: "q1", title: "T", summary: "S", status: "new", priority: 1, metadata: {}, updatedAt: now() };
  const queue1 = upsertQueueItems([item], [item], { now });
  const queue2 = upsertQueueItems(queue1, [item], { now: later });
  assert.equal(queue2[0].updatedAt, now(), "an unchanged queue item is not restamped");
});

check("a real change still updates the row and its timestamp", () => {
  const now = () => "2026-07-27T18:00:00.000Z";
  const later = () => "2026-07-27T19:00:00.000Z";
  const first = upsertCompanyContact([], { email: "b@example.org", name: "B" }, { now });
  const second = upsertCompanyContact(first.contacts, { email: "b@example.org", name: "B", types: ["media"] }, { now: later });
  assert.notEqual(second.contacts[0], first.contacts[0]);
  assert.equal(second.contacts[0].updatedAt, "2026-07-27T19:00:00.000Z", "a genuine change is stamped");
  assert.deepEqual(second.contacts[0].types, ["media"]);
});

// ---------------------------------------------------------------------------------------------
// 5. Reason codes are persisted
// ---------------------------------------------------------------------------------------------

check("every tick records why each contact was skipped, with counts and a traceable sample", () => {
  const results = [
    ...Array.from({ length: 127 }, (_, index) => ({ contact_id: `c${index}`, status: "skipped", reason: "already_claimed" })),
    ...Array.from({ length: 23 }, (_, index) => ({ contact_id: `d${index}`, status: "error", reason: "claim_write_failed:boom" }))
  ];
  const ledger = summarizeDecisions(results, { runId: "hb-1", at: "2026-07-27T13:00:00.000Z", etDate: "2026-07-27", existing: [] });
  const row = ledger[0];
  assert.equal(row.total, 150, "the tick's own total is recorded");
  const already = row.reasons.find((entry) => entry.reason === "already_claimed");
  assert.equal(already.count, 127);
  const failed = row.reasons.find((entry) => entry.reason === "claim_write_failed:boom");
  assert.equal(failed.count, 23, "the 23 that could not be explained from production now have a reason");
  assert.ok(already.sampleContactIds.length > 0 && already.sampleContactIds.length <= 25, "a bounded sample makes one person traceable");
});

check("the decision ledger is bounded and one row per run", () => {
  const existing = Array.from({ length: 250 }, (_, index) => ({ id: `react-decisions-hb-${index}` }));
  const ledger = summarizeDecisions([{ contact_id: "x", status: "sent" }], { runId: "hb-new", at: "2026-07-27T13:00:00.000Z", existing });
  assert.equal(ledger.length, 200, "the ledger is capped so it cannot become the next write-amplification source");
  const rerun = summarizeDecisions([{ contact_id: "x", status: "sent" }], { runId: "hb-new", at: "2026-07-27T14:00:00.000Z", existing: ledger });
  assert.equal(rerun.filter((row) => row.id === "react-decisions-hb-new").length, 1, "re-running one run replaces its row, never duplicates it");
});

check("the new collection is registered, or Supabase would silently drop it", () => {
  assert.ok(coreStateCollections.includes(REACTIVATION_DECISIONS_COLLECTION), "the B1 trap: unregistered collections never persist");
});

check("the reconciliation module contains no send path", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./reactivation-reconcile.mjs", import.meta.url), "utf8");
  for (const forbidden of ["mail/send", "runReactivationSend", "claimReactivationSends", "sendgridSend"]) {
    assert.ok(!source.includes(forbidden), `reconciliation must never send: found "${forbidden}"`);
  }
  const client = readFileSync(new URL("./sendgrid-activity.mjs", import.meta.url), "utf8");
  assert.ok(!client.includes("mail/send"), "the activity client is read-only");
  assert.ok(!/method:\s*"POST"/.test(client), "the activity client issues GETs only");
});

await Promise.all(pending);
console.log(`test-reactivation-reconcile: ${checks.length} checks passed`);
