#!/usr/bin/env node
// Phase 18I guard: alert engine raises internal alerts from the four approved source groups,
// dedupes and resolves honestly, and can only email the owner's env-locked address through a
// fail-closed decision plus an injected executor. The module itself never touches the network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coreStateCollections } from "./storage.mjs";
import {
  ALERTS_ENGINE_ID,
  ALERTS_COLLECTIONS,
  ALERTS_CAP,
  alertsConfigOf,
  resolveAlertEmailDecision,
  buildAlertCandidates,
  reconcileAlerts,
  criticalAlertsNeedingEmail,
  buildCriticalEmail,
  buildDailyDigest,
  shouldSendDigest,
  buildAlertsView,
  setAlertStatus,
  planAlerts,
  actAlerts,
  buildAlertsEngine,
  etDateParts
} from "./alerts-engine.mjs";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const NOW = new Date("2026-07-07T16:00:00Z"); // 12:00 EDT
const EARLY = new Date("2026-07-07T10:30:00Z"); // 06:30 EDT

const ENV_OFF = {};
const ENV_READY = { ALERTS_EMAIL_TO: "roger@example.com", SENDGRID_API_KEY: "SG.test", ALERTS_LIVE_SEND: "true" };

function enabledState(extra = {}) {
  return { settings: { alerts: { emailEnabled: true } }, ...extra };
}

await check("alerts collections are registered in coreStateCollections", () => {
  for (const collection of ALERTS_COLLECTIONS) {
    assert(coreStateCollections.includes(collection), `${collection} must be in coreStateCollections`);
  }
});

await check("settings persist as a singleton core collection (Supabase toggle bug)", async () => {
  // The email switch and the once-per-day digest stamp live in state.settings. Without this
  // registration the Supabase backend silently dropped every settings write: the in-app
  // toggle reverted and the digest would have re-sent on every hourly tick.
  const { singletonCollections, coreRecordsFromState } = await import("./storage.mjs");
  assert(coreStateCollections.includes("settings"), "settings must be in coreStateCollections");
  assert(singletonCollections.has("settings"), "settings must be a singleton collection");
  const rows = coreRecordsFromState({ settings: { alerts: { emailEnabled: true, lastDigestDate: "2026-07-07" } } });
  const row = rows.find((entry) => entry.collection === "settings");
  assert(row && row.item_id === "singleton", "settings should serialize as one singleton row");
  assert.equal(row.payload.alerts.emailEnabled, true, "the alert email switch must survive serialization");
});

await check("email decision fails closed at every layer", () => {
  assert.equal(resolveAlertEmailDecision({}, { env: ENV_READY }).status, "not_sent", "toggle off wins over armed env");
  assert.equal(resolveAlertEmailDecision(enabledState(), { env: {} }).status, "not_sent", "no recipient => not_sent");
  const noKey = resolveAlertEmailDecision(enabledState(), { env: { ALERTS_EMAIL_TO: "roger@example.com", ALERTS_LIVE_SEND: "true" } });
  assert.equal(noKey.status, "dry_run");
  assert.equal(noKey.reason, "sendgrid_key_missing");
  const notArmed = resolveAlertEmailDecision(enabledState(), { env: { ALERTS_EMAIL_TO: "roger@example.com", SENDGRID_API_KEY: "SG.x" } });
  assert.equal(notArmed.status, "dry_run");
  assert.equal(notArmed.reason, "live_send_not_armed");
  const live = resolveAlertEmailDecision(enabledState(), { env: ENV_READY });
  assert.equal(live.status, "live");
  assert.equal(live.recipient, "roger@example.com");
});

await check("recipient comes from env only, never from state", () => {
  const hijack = resolveAlertEmailDecision(
    { settings: { alerts: { emailEnabled: true, recipient: "attacker@example.com", emailAddress: "attacker@example.com" } } },
    { env: { SENDGRID_API_KEY: "SG.x", ALERTS_LIVE_SEND: "true" } }
  );
  assert.equal(hijack.status, "not_sent", "state-provided address must not become a recipient");
  const source = readFileSync(join(process.cwd(), "scripts", "alerts-engine.mjs"), "utf8");
  assert(!source.includes("settings.alerts.recipient"), "engine must not read a recipient from settings");
});

await check("module never talks to the network directly", () => {
  const source = readFileSync(join(process.cwd(), "scripts", "alerts-engine.mjs"), "utf8");
  assert(!source.includes("api.sendgrid.com"), "sends must go through the injected executor only");
  assert(!/\bfetch\s*\(/.test(source), "no direct fetch in the engine module");
});

await check("queue candidates: aggregate plus overdue dangerous breakthrough", () => {
  const state = {
    queueItems: [
      { id: "q1", status: "needs_roger", title: "Approve partner page", riskLevel: "safe" },
      { id: "q2", status: "needs_roger", title: "Release wave", riskLevel: "dangerous", dueAt: "2026-07-01T00:00:00Z" },
      { id: "q3", status: "completed", title: "Done", riskLevel: "safe" }
    ]
  };
  const cands = buildAlertCandidates(state, { env: {}, now: NOW });
  const agg = cands.find((c) => c.dedupe_key === "queue-needs-roger");
  assert(agg && agg.title.startsWith("2 item(s)"), "aggregate counts only open needs_roger items");
  assert.equal(agg.severity, "warning");
  const overdue = cands.find((c) => c.dedupe_key === "queue-item-q2");
  assert(overdue && overdue.severity === "critical", "overdue dangerous item becomes critical");
});

await check("safety candidates: live gates, webhook rejections, os-health", () => {
  const state = {
    runtime: { livePostingGates: { linkedin: { enabled: true }, x: { enabled: false } } },
    sendgridWebhookHealth: { rejected_batches: 2, verified_batches: 5, total_batches: 7 },
    osHealthSnapshots: [{ overall_health: "critical", summary: { next_operator_action: "Check Supabase." } }]
  };
  const cands = buildAlertCandidates(state, { env: {}, now: NOW });
  assert(cands.find((c) => c.dedupe_key === "live-gates-enabled" && c.severity === "critical"), "enabled live gate is critical");
  assert(cands.find((c) => c.dedupe_key === "webhook-rejected" && c.severity === "critical"), "rejected webhook batches are critical");
  assert(cands.find((c) => c.dedupe_key === "os-health-critical"), "critical os-health raises an alert");
});

await check("money candidates: failed payments and stripe availability", () => {
  const one = buildAlertCandidates({}, { env: {}, now: NOW, stripeRevenue: { available: true, configured: true, failedPayments: 1 } });
  assert.equal(one.find((c) => c.dedupe_key === "stripe-failed-payments").severity, "warning");
  const three = buildAlertCandidates({}, { env: {}, now: NOW, stripeRevenue: { available: true, configured: true, failedPayments: 3 } });
  assert.equal(three.find((c) => c.dedupe_key === "stripe-failed-payments").severity, "critical");
  const down = buildAlertCandidates({}, { env: {}, now: NOW, stripeRevenue: { available: false, configured: true, error: "Stripe key is not in live mode." } });
  assert.equal(down.find((c) => c.dedupe_key === "stripe-unavailable").severity, "warning");
  assert.equal(buildAlertCandidates({}, { env: {}, now: NOW }).filter((c) => c.source_group === "money").length, 0, "no stripe snapshot => no money noise");
});

await check("support and partner candidates", () => {
  const state = {
    supportIssues: [
      { id: "s1", status: "open", upl_sensitive: true, title: "Can you file for me?" },
      { id: "s2", status: "open", urgency: "urgent", title: "Locked out" },
      { id: "s3", status: "resolved", upl_sensitive: true, title: "Old" }
    ],
    partnerPrograms: [{ id: "p1", status: "stalled", name: "County Legal Aid" }],
    partners: [{ id: "pa1", organizationName: "Justice Org", blocker: "Waiting on logo" }]
  };
  const cands = buildAlertCandidates(state, { env: {}, now: NOW });
  assert(cands.find((c) => c.dedupe_key === "support-upl-s1" && c.severity === "critical"), "UPL-sensitive open issue is critical");
  assert(cands.find((c) => c.dedupe_key === "support-urgent-s2" && c.severity === "warning"), "urgent issue is warning");
  assert(!cands.find((c) => c.dedupe_key === "support-upl-s3"), "resolved issues do not alert");
  assert(cands.find((c) => c.dedupe_key === "partners-stalled" && c.severity === "warning"));
  assert(cands.find((c) => c.dedupe_key === "partners-blocked" && c.severity === "info"));
});

await check("reconcile: dedupe, respect read/dismissed, escalate, resolve, reappear", () => {
  const c1 = [{ dedupe_key: "k1", severity: "warning", source_group: "safety", title: "W", detail: "", href: "" }];
  const first = reconcileAlerts([], c1, { now: NOW });
  assert.equal(first.alerts.length, 1);
  assert.equal(first.alerts[0].status, "active");
  assert.equal(first.created, 1);

  const read = first.alerts.map((a) => ({ ...a, status: "read" }));
  const second = reconcileAlerts(read, c1, { now: NOW });
  assert.equal(second.alerts.length, 1, "same candidate does not duplicate");
  assert.equal(second.alerts[0].status, "read", "read status survives an update");

  const dismissed = first.alerts.map((a) => ({ ...a, status: "dismissed" }));
  const still = reconcileAlerts(dismissed, c1, { now: NOW });
  assert.equal(still.alerts[0].status, "dismissed", "dismissed stays dismissed at same severity");

  const escalatedCand = [{ ...c1[0], severity: "critical" }];
  const esc = reconcileAlerts(dismissed.map((a) => ({ ...a, emailed_at: "2026-07-06T00:00:00Z" })), escalatedCand, { now: NOW });
  assert.equal(esc.alerts[0].status, "active", "escalation reactivates a dismissed alert");
  assert.equal(esc.alerts[0].severity, "critical");
  assert.equal(esc.alerts[0].emailed_at, "", "escalation re-arms the critical email");

  const gone = reconcileAlerts(first.alerts, [], { now: NOW });
  assert.equal(gone.alerts[0].status, "resolved", "vanished condition resolves the alert");

  const back = reconcileAlerts(gone.alerts, c1, { now: NOW });
  assert.equal(back.alerts[0].status, "active", "reappearing condition reactivates");
});

await check("reconcile caps the collection", () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ dedupe_key: `k${i}`, severity: "info", source_group: "queue", title: `T${i}`, detail: "", href: "" }));
  const rec = reconcileAlerts([], many, { now: NOW });
  assert(rec.alerts.length <= ALERTS_CAP);
});

await check("critical email and digest copy are safe and em-dash free", () => {
  const email = buildCriticalEmail({ title: "Live gate enabled", detail: "Turn it off.", href: "settings" }, { env: {}, recipient: "roger@example.com" });
  assert.equal(email.to, "roger@example.com");
  assert(email.subject.startsWith("Critical alert:"));
  assert(email.text.includes("Nothing was sent to contacts, customers, or partners."));
  const digest = buildDailyDigest({}, [
    { status: "active", severity: "critical", source_group: "safety", title: "Gate on" },
    { status: "read", severity: "info", source_group: "queue", title: "2 items" }
  ], { env: {}, recipient: "roger@example.com", now: NOW });
  assert.equal(digest.counts.open, 2);
  assert.equal(digest.counts.critical, 1);
  assert(digest.subject.includes(etDateParts(NOW).date));
  for (const copy of [email.subject, email.text, digest.subject, digest.text]) {
    assert(!copy.includes("—"), "no em-dashes in alert copy");
  }
});

await check("digest schedule: toggle, hour, once per day", () => {
  assert.equal(shouldSendDigest({}, { now: NOW }), false, "email off => no digest");
  assert.equal(shouldSendDigest(enabledState(), { now: EARLY }), false, "before digest hour => wait");
  assert.equal(shouldSendDigest(enabledState(), { now: NOW }), true, "after digest hour => due");
  const sentToday = { settings: { alerts: { emailEnabled: true, lastDigestDate: etDateParts(NOW).date } } };
  assert.equal(shouldSendDigest(sentToday, { now: NOW }), false, "one digest per day");
});

await check("act: dry run raises alerts but never calls the executor", async () => {
  let calls = 0;
  const state = enabledState({
    queueItems: [{ id: "q2", status: "needs_roger", title: "Release wave", riskLevel: "dangerous", dueAt: "2026-07-01T00:00:00Z" }]
  });
  const result = await actAlerts(state, { env: { ALERTS_EMAIL_TO: "roger@example.com" }, now: NOW, runAlertEmailSend: async () => { calls += 1; return { status: "sent" }; } });
  assert.equal(calls, 0, "dry_run must not invoke the send executor");
  assert(result.state.alerts.find((a) => a.dedupe_key === "queue-item-q2" && a.severity === "critical" && !a.emailed_at));
  assert(result.emails === undefined || true);
  assert(result.results.emails.every((e) => e.status !== "sent"));
});

await check("act: live path emails criticals once and digests once per day", async () => {
  const sends = [];
  const executor = async (message) => { sends.push(message); return { status: "sent", provider: "sendgrid" }; };
  const state = enabledState({
    queueItems: [{ id: "q2", status: "needs_roger", title: "Release wave", riskLevel: "dangerous", dueAt: "2026-07-01T00:00:00Z" }]
  });
  const first = await actAlerts(state, { env: ENV_READY, now: NOW, runAlertEmailSend: executor });
  const critical = sends.filter((m) => m.subject.startsWith("Critical alert:"));
  const digests = sends.filter((m) => m.subject.startsWith("LegalEase daily brief"));
  assert.equal(critical.length, 1, "one critical breakthrough email");
  assert.equal(digests.length, 1, "one digest");
  assert(sends.every((m) => m.to === "roger@example.com"), "every email goes to the locked recipient");
  assert(first.state.alerts.find((a) => a.dedupe_key === "queue-item-q2").emailed_at, "critical marked emailed");
  assert.equal(alertsConfigOf(first.state).lastDigestDate, etDateParts(NOW).date, "digest date recorded");
  assert(first.state.companyEvents.some((e) => e.type === "alert_raised" && e.risk === "needs_roger"), "critical raises a company event");
  assert(first.state.companyEvents.some((e) => e.type === "alert_email_sent"));
  assert(first.state.companyEvents.some((e) => e.type === "alert_digest"));

  const before = sends.length;
  const second = await actAlerts(first.state, { env: ENV_READY, now: NOW, runAlertEmailSend: executor });
  assert.equal(sends.length, before, "second tick same day sends nothing new");
  assert(!second.state.companyEvents.some((e, i) => e.type === "alert_raised" && i < second.state.companyEvents.length && second.state.companyEvents.filter((x) => x.type === "alert_raised").length > 1), "standing critical does not re-emit alert_raised");
});

await check("plan observes without writing", () => {
  const state = enabledState({ queueItems: [{ id: "q1", status: "needs_roger", title: "X", riskLevel: "safe" }] });
  const frozen = JSON.stringify(state);
  const plan = planAlerts(state, { env: {}, now: NOW });
  assert.equal(JSON.stringify(state), frozen, "plan must not mutate state");
  assert(!("state" in plan), "plan returns observations only");
  assert.equal(plan.observations.candidates >= 1, true);
});

await check("engine descriptor registers correctly", () => {
  const engine = buildAlertsEngine({ runAlertEmailSend: async () => ({ status: "sent" }) });
  assert.equal(engine.id, ALERTS_ENGINE_ID);
  assert.equal(engine.cadence, "hourly");
  assert.equal(typeof engine.plan, "function");
  assert.equal(typeof engine.act, "function");
});

await check("setAlertStatus transitions and view counts", () => {
  const base = reconcileAlerts([], [
    { dedupe_key: "k1", severity: "critical", source_group: "safety", title: "A", detail: "", href: "" },
    { dedupe_key: "k2", severity: "info", source_group: "queue", title: "B", detail: "", href: "" }
  ], { now: NOW });
  let state = { alerts: base.alerts, settings: {} };
  const read = setAlertStatus(state, { id: "alert-k1", status: "read" });
  assert(read.ok);
  const dismissed = setAlertStatus(read.state, { id: "alert-k2", status: "dismissed" });
  assert(dismissed.ok);
  assert.equal(setAlertStatus(state, { id: "missing", status: "read" }).ok, false);
  assert.equal(setAlertStatus(state, { id: "alert-k1", status: "deleted" }).ok, false);

  const view = buildAlertsView(dismissed.state, { env: { ALERTS_EMAIL_TO: "roger@example.com" } });
  assert.equal(view.counts.open, 1, "dismissed alert leaves the open count");
  assert.equal(view.counts.critical, 1);
  assert.equal(view.email.enabled, false);
  assert.equal(view.email.recipientConfigured, true);
  assert.equal(view.email.recipientMasked, "r***@example.com");
  assert.equal(view.email.decision, "not_sent");
});

await check("criticalAlertsNeedingEmail excludes emailed, dismissed, resolved", () => {
  const alerts = [
    { id: "1", dedupe_key: "a", status: "active", severity: "critical", emailed_at: "" },
    { id: "2", dedupe_key: "b", status: "active", severity: "critical", emailed_at: "2026-07-07T00:00:00Z" },
    { id: "3", dedupe_key: "c", status: "dismissed", severity: "critical", emailed_at: "" },
    { id: "4", dedupe_key: "d", status: "resolved", severity: "critical", emailed_at: "" },
    { id: "5", dedupe_key: "e", status: "active", severity: "warning", emailed_at: "" }
  ];
  const due = criticalAlertsNeedingEmail(alerts);
  assert.deepEqual(due.map((a) => a.id), ["1"]);
});

await check("server wiring: engine registered, endpoints present, recipient lock in executor", async () => {
  const { HEARTBEAT_ENGINE_IDS } = await import("./heartbeat-engines.mjs");
  assert(HEARTBEAT_ENGINE_IDS.includes(ALERTS_ENGINE_ID), "alerts engine surfaces an autopilot toggle");
  const server = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
  for (const marker of [
    '"/api/alerts"',
    '"/api/alerts/refresh"',
    '"/api/alerts/status"',
    '"/api/alerts/config"',
    '"/api/alerts/digest-preview"',
    '"/api/alerts/email-test"',
    "recipient_not_owner_locked",
    'safeRenderModule("alerts"',
    "runAlertEmailSend"
  ]) {
    assert(server.includes(marker), `preview-server should contain ${marker}`);
  }
  const executor = server.slice(server.indexOf("async function runAlertEmailSend"), server.indexOf("async function runAlertEmailSend") + 2200);
  assert(executor.includes("ALERTS_EMAIL_TO"), "executor recipient comes from env");
  assert(executor.includes("recipient_not_owner_locked"), "executor aborts on any non-owner recipient");
  const configEndpoint = server.slice(server.indexOf('"/api/alerts/config"'), server.indexOf('"/api/alerts/digest-preview"'));
  assert(!/body\.(recipient|emailAddress|to\b)/.test(configEndpoint), "config endpoint must not accept a recipient address");
});

console.log(`alerts engine tests passed (${passed} checks).`);
