// Phase 18I alert system (approved by Roger 2026-07-07).
//
// Raises internal alert records from four source groups (needs-Roger queue items, safety
// and deliverability, money signals, support and partners) and, behind stacked
// off-by-default gates, emails the OWNER'S single locked address only. Cadence: daily
// digest plus immediate breakthrough for active critical alerts.
//
// Safety model (mirrors outreach-os):
//   - plan() observes only; act() runs under the heartbeat autopilot toggle (default OFF).
//   - resolveAlertEmailDecision is fail-closed: "live" is the ONLY status that authorizes
//     a network send, and it requires the in-app email toggle (settings.alerts.emailEnabled,
//     default OFF) AND ALERTS_LIVE_SEND env arm AND SENDGRID_API_KEY AND ALERTS_EMAIL_TO.
//   - The recipient comes from env only. No endpoint or UI can change it, so alert email
//     can never be redirected to a contact, customer, or partner.
//   - This is not a campaign path: no lists, no sequences, no unsubscribe plumbing.

import { buildDeliverabilityWarnings } from "./campaign-brain.mjs";
import { sendgridWebhookHealthSummary } from "./sendgrid-webhook.mjs";
import { emitCompanyEvent } from "./company-memory.mjs";

export const ALERTS_ENGINE_ID = "alerts";
export const ALERTS_COLLECTIONS = ["alerts"];
export const ALERT_SEVERITIES = ["critical", "warning", "info"];
export const ALERT_SOURCE_GROUPS = ["queue", "safety", "money", "support", "partners"];
export const ALERT_STATUSES = ["active", "read", "dismissed", "resolved"];
export const ALERTS_CAP = 300;
export const DEFAULT_DIGEST_HOUR_ET = 8;

const SEVERITY_RANK = { info: 1, warning: 2, critical: 3 };

function list(value) {
  return Array.isArray(value) ? value : [];
}
function clean(value) {
  return String(value ?? "").trim();
}
function truthyFlag(value) {
  return ["true", "1", "yes", "on"].includes(clean(value).toLowerCase());
}
function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

// Eastern-time date/hour without depending on the heartbeat's internal helpers.
export function etDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false
  }).formatToParts(new Date(now));
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

export function alertsConfigOf(state = {}) {
  const raw = state.settings?.alerts && typeof state.settings.alerts === "object" ? state.settings.alerts : {};
  const digestHourEt = Number.isFinite(Number(raw.digestHourEt)) ? Math.min(23, Math.max(0, Number(raw.digestHourEt))) : DEFAULT_DIGEST_HOUR_ET;
  return {
    emailEnabled: raw.emailEnabled === true,
    digestHourEt,
    lastDigestDate: clean(raw.lastDigestDate)
  };
}

// Fail-closed email decision. "live" is the only status that authorizes a network send.
export function resolveAlertEmailDecision(state = {}, { env = process.env } = {}) {
  const config = alertsConfigOf(state);
  const recipient = clean(env.ALERTS_EMAIL_TO);
  if (!config.emailEnabled) return { status: "not_sent", reason: "email_alerts_off" };
  if (!recipient) return { status: "not_sent", reason: "no_recipient_configured" };
  const keyPresent = Boolean(clean(env.SENDGRID_API_KEY));
  const armed = truthyFlag(env.ALERTS_LIVE_SEND);
  if (armed && keyPresent) return { status: "live", liveSend: true, recipient };
  return { status: "dry_run", liveSend: false, recipient, reason: keyPresent ? "live_send_not_armed" : "sendgrid_key_missing" };
}

function candidate(dedupeKey, severity, sourceGroup, title, detail, href) {
  return {
    dedupe_key: dedupeKey,
    severity: ALERT_SEVERITIES.includes(severity) ? severity : "info",
    source_group: ALERT_SOURCE_GROUPS.includes(sourceGroup) ? sourceGroup : "safety",
    title: clean(title),
    detail: clean(detail),
    href: clean(href)
  };
}

// ---- Source group: needs-Roger queue items ------------------------------------------------
function queueCandidates(state, { now }) {
  const out = [];
  const open = list(state.queueItems).filter((item) => item.status === "needs_roger");
  if (!open.length) return out;
  const dangerous = open.filter((item) => item.riskLevel === "dangerous");
  const overdue = open.filter((item) => item.dueAt && Date.parse(item.dueAt) < new Date(now).getTime());
  out.push(candidate(
    "queue-needs-roger",
    dangerous.length || overdue.length ? "warning" : "info",
    "queue",
    `${open.length} item(s) need your decision`,
    open.slice(0, 3).map((item) => item.title).filter(Boolean).join("; ") || "Open the Decisions queue to review.",
    "decisions"
  ));
  for (const item of overdue.filter((entry) => entry.riskLevel === "dangerous")) {
    out.push(candidate(
      `queue-item-${item.id}`,
      "critical",
      "queue",
      `Overdue high-risk decision: ${item.title}`,
      item.summary || "This item is past due and marked high risk.",
      "decisions"
    ));
  }
  return out;
}

// ---- Source group: safety and deliverability ----------------------------------------------
function safetyCandidates(state, { env }) {
  const out = [];
  const deliverability = buildDeliverabilityWarnings(state, { env });
  if (deliverability.level === "critical" || deliverability.level === "warning") {
    out.push(candidate(
      `deliverability-${deliverability.level}`,
      deliverability.level,
      "safety",
      deliverability.level === "critical" ? "Deliverability limit breached" : "Deliverability approaching pause limit",
      deliverability.plain || "Review campaign deliverability before releasing more sends.",
      "campaigns"
    ));
  }
  const gates = state.runtime?.livePostingGates || {};
  const enabledGates = Object.keys(gates).filter((key) => gates[key]?.enabled);
  if (enabledGates.length) {
    out.push(candidate(
      "live-gates-enabled",
      "critical",
      "safety",
      `${enabledGates.length} live posting gate(s) enabled`,
      "Live posting should stay off unless you turned it on deliberately.",
      "settings"
    ));
  }
  const sent = list(state.outreachAttempts).length;
  const webhook = sendgridWebhookHealthSummary(state.sendgridWebhookHealth || {}, { env, sent });
  if (Number(webhook.rejectedBatches || 0) > 0) {
    out.push(candidate(
      "webhook-rejected",
      "critical",
      "safety",
      "Email telemetry rejected unsigned data",
      `${webhook.rejectedBatches} unsigned or invalid delivery report batch(es) were rejected.`,
      "os-health"
    ));
  } else if (webhook.warning) {
    out.push(candidate("webhook-warning", "warning", "safety", "Email telemetry needs attention", webhook.warning, "os-health"));
  }
  const health = list(state.osHealthSnapshots)[0] || {};
  if (health.overall_health === "critical") {
    out.push(candidate("os-health-critical", "critical", "safety", "App health is critical", health.summary?.next_operator_action || "Open App Status.", "os-health"));
  } else if (health.overall_health === "needs_attention") {
    out.push(candidate("os-health-attention", "warning", "safety", "App health needs attention", health.summary?.next_operator_action || "Open App Status.", "os-health"));
  }
  return out;
}

// ---- Source group: money signals -----------------------------------------------------------
function moneyCandidates(state, { stripeRevenue }) {
  const out = [];
  const stripe = stripeRevenue || state.stripeRevenue || null;
  if (!stripe) return out;
  const failed = Number(stripe.failedPayments ?? stripe.failed_payment_count ?? 0);
  if (failed > 0) {
    out.push(candidate(
      "stripe-failed-payments",
      failed >= 3 ? "critical" : "warning",
      "money",
      `${failed} failed payment(s) need review`,
      "Open Revenue to see which payments failed.",
      "revenue"
    ));
  }
  if (stripe.configured && !stripe.available) {
    out.push(candidate("stripe-unavailable", "warning", "money", "Stripe revenue is unavailable", stripe.error || "Stripe is configured but live revenue could not be read.", "revenue"));
  }
  return out;
}

// ---- Source group: support and partners ----------------------------------------------------
function supportCandidates(state) {
  const out = [];
  const open = list(state.supportIssues).filter((issue) => !["resolved", "closed"].includes(issue.status));
  for (const issue of open.filter((entry) => entry.upl_sensitive)) {
    out.push(candidate(
      `support-upl-${issue.id}`,
      "critical",
      "support",
      `Legal-advice-sensitive support request: ${issue.title || "untitled"}`,
      "This request may touch legal advice. Review it before anyone replies.",
      "support"
    ));
  }
  for (const issue of open.filter((entry) => entry.urgency === "urgent" && !entry.upl_sensitive)) {
    out.push(candidate(`support-urgent-${issue.id}`, "warning", "support", `Urgent support request: ${issue.title || "untitled"}`, issue.summary || "Marked urgent by triage.", "support"));
  }
  return out;
}

function partnerCandidates(state) {
  const out = [];
  const stalled = list(state.partnerPrograms).filter((program) => program.status === "stalled");
  if (stalled.length) {
    out.push(candidate(
      "partners-stalled",
      "warning",
      "partners",
      `${stalled.length} partner program(s) stalled`,
      stalled.slice(0, 3).map((program) => program.name).filter(Boolean).join("; ") || "Open Partners to restart them.",
      "partners"
    ));
  }
  const blocked = list(state.partners).filter((partner) => clean(partner.blocker));
  if (blocked.length) {
    out.push(candidate("partners-blocked", "info", "partners", `${blocked.length} partner(s) waiting on a blocker`, blocked.slice(0, 3).map((partner) => partner.organizationName || partner.name).filter(Boolean).join("; "), "partners"));
  }
  return out;
}

export function buildAlertCandidates(state = {}, { env = process.env, now = new Date(), stripeRevenue = null } = {}) {
  return [
    ...queueCandidates(state, { now }),
    ...safetyCandidates(state, { env }),
    ...moneyCandidates(state, { stripeRevenue }),
    ...supportCandidates(state),
    ...partnerCandidates(state)
  ];
}

// Dedupe candidates against existing alerts. Read/dismissed states are respected; a severity
// escalation reactivates and re-arms the critical email; a vanished condition resolves.
export function reconcileAlerts(existing = [], candidates = [], { now = new Date() } = {}) {
  const at = nowIso(now);
  const byKey = new Map(list(existing).map((alert) => [alert.dedupe_key, alert]));
  const seen = new Set();
  const next = [];
  let created = 0;
  let escalated = 0;
  let resolved = 0;

  for (const cand of candidates) {
    if (!cand.dedupe_key || seen.has(cand.dedupe_key)) continue;
    seen.add(cand.dedupe_key);
    const prior = byKey.get(cand.dedupe_key);
    if (!prior) {
      created += 1;
      next.push({
        id: `alert-${cand.dedupe_key}`,
        ...cand,
        status: "active",
        created_at: at,
        first_seen_at: at,
        last_seen_at: at,
        resolved_at: "",
        emailed_at: ""
      });
      continue;
    }
    const updated = { ...prior, title: cand.title, detail: cand.detail, href: cand.href, source_group: cand.source_group, last_seen_at: at };
    if (SEVERITY_RANK[cand.severity] > SEVERITY_RANK[prior.severity]) {
      escalated += 1;
      updated.severity = cand.severity;
      updated.status = "active";
      updated.resolved_at = "";
      if (cand.severity === "critical") updated.emailed_at = "";
    } else if (prior.status === "resolved") {
      // Condition went away and came back: alert again.
      updated.status = "active";
      updated.resolved_at = "";
      updated.emailed_at = "";
      created += 1;
    }
    next.push(updated);
  }

  for (const alert of list(existing)) {
    if (seen.has(alert.dedupe_key)) continue;
    if (alert.status === "active" || alert.status === "read") {
      resolved += 1;
      next.push({ ...alert, status: "resolved", resolved_at: at });
    } else {
      next.push(alert);
    }
  }

  next.sort((a, b) => {
    const active = (alert) => (alert.status === "active" || alert.status === "read" ? 1 : 0);
    if (active(b) !== active(a)) return active(b) - active(a);
    if (SEVERITY_RANK[b.severity] !== SEVERITY_RANK[a.severity]) return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return String(b.last_seen_at).localeCompare(String(a.last_seen_at));
  });

  const keep = next.filter((alert) => alert.status !== "resolved");
  const resolvedKept = next.filter((alert) => alert.status === "resolved").slice(0, Math.max(0, ALERTS_CAP - keep.length));
  return { alerts: [...keep, ...resolvedKept].slice(0, ALERTS_CAP), created, escalated, resolved };
}

export function criticalAlertsNeedingEmail(alerts = []) {
  return list(alerts).filter((alert) => alert.status === "active" && alert.severity === "critical" && !alert.emailed_at);
}

function senderFor(env = process.env) {
  return clean(env.ALERTS_EMAIL_FROM) || "roger@example.com";
}

export function buildCriticalEmail(alert = {}, { env = process.env, recipient = "" } = {}) {
  const title = clean(alert.title) || "Critical alert";
  const detail = clean(alert.detail);
  const where = clean(alert.href);
  const text = [
    `Critical alert from the LegalEase Command Center.`,
    "",
    title,
    detail,
    where ? `Open the Command Center and go to: ${where}` : "",
    "",
    "This message goes only to you. Nothing was sent to contacts, customers, or partners."
  ].filter((line) => line !== null).join("\n");
  return {
    to: recipient,
    from: senderFor(env),
    subject: `Critical alert: ${title}`.slice(0, 160),
    text,
    html: `<p><strong>Critical alert from the LegalEase Command Center.</strong></p><p>${escapeHtml(title)}</p><p>${escapeHtml(detail)}</p>${where ? `<p>Open the Command Center and go to: <strong>${escapeHtml(where)}</strong></p>` : ""}<p style="color:#5B6572">This message goes only to you. Nothing was sent to contacts, customers, or partners.</p>`
  };
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

export function buildDailyDigest(state = {}, alerts = [], { env = process.env, recipient = "", now = new Date() } = {}) {
  const open = list(alerts).filter((alert) => alert.status === "active" || alert.status === "read");
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const alert of open) bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
  const groups = ALERT_SOURCE_GROUPS.map((group) => ({
    group,
    items: open.filter((alert) => alert.source_group === group)
  }));
  const groupLabel = { queue: "Decisions waiting", safety: "Safety and deliverability", money: "Money", support: "Support", partners: "Partners" };
  const lines = [
    "Daily alert digest from the LegalEase Command Center.",
    "",
    open.length
      ? `${open.length} open alert(s): ${bySeverity.critical} critical, ${bySeverity.warning} warning, ${bySeverity.info} info.`
      : "No open alerts. Nothing needs you right now.",
    ""
  ];
  for (const { group, items } of groups) {
    lines.push(`${groupLabel[group]}: ${items.length ? "" : "quiet"}`);
    for (const alert of items.slice(0, 5)) lines.push(`  - [${alert.severity}] ${alert.title}`);
    lines.push("");
  }
  lines.push("This digest goes only to you. Nothing was sent to contacts, customers, or partners.");
  const { date } = etDateParts(now);
  return {
    to: recipient,
    from: senderFor(env),
    subject: `LegalEase daily brief for ${date}: ${open.length} open alert(s)`,
    text: lines.join("\n"),
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(lines.join("\n"))}</pre>`,
    counts: { open: open.length, ...bySeverity }
  };
}

export function shouldSendDigest(state = {}, { now = new Date() } = {}) {
  const config = alertsConfigOf(state);
  if (!config.emailEnabled) return false;
  const { date, hour } = etDateParts(now);
  return config.lastDigestDate !== date && hour >= config.digestHourEt;
}

// Read model for GET /api/alerts and the Alerts page. Display-only and honest about gates.
export function buildAlertsView(state = {}, { env = process.env } = {}) {
  const config = alertsConfigOf(state);
  const alerts = list(state.alerts);
  const open = alerts.filter((alert) => alert.status === "active" || alert.status === "read");
  const decision = resolveAlertEmailDecision(state, { env });
  const recipient = clean(env.ALERTS_EMAIL_TO);
  return {
    generated_at: nowIso(),
    alerts,
    counts: {
      open: open.length,
      unread: alerts.filter((alert) => alert.status === "active").length,
      critical: open.filter((alert) => alert.severity === "critical").length,
      warning: open.filter((alert) => alert.severity === "warning").length,
      info: open.filter((alert) => alert.severity === "info").length
    },
    email: {
      enabled: config.emailEnabled,
      digestHourEt: config.digestHourEt,
      lastDigestDate: config.lastDigestDate,
      recipientConfigured: Boolean(recipient),
      recipientMasked: recipient ? maskEmail(recipient) : "",
      liveArmed: truthyFlag(env.ALERTS_LIVE_SEND),
      providerKeyPresent: Boolean(clean(env.SENDGRID_API_KEY)),
      decision: decision.status,
      decisionReason: decision.reason || ""
    }
  };
}

function maskEmail(value = "") {
  const [user, domain] = String(value).split("@");
  if (!domain) return "";
  return `${user.slice(0, 1)}***@${domain}`;
}

// Update one alert's status from the UI. Only read/dismissed/active transitions are allowed.
export function setAlertStatus(state = {}, { id = "", status = "" } = {}, { now = new Date() } = {}) {
  if (!["read", "dismissed", "active"].includes(status)) return { ok: false, reason: "invalid_status" };
  const alerts = list(state.alerts);
  const target = alerts.find((alert) => alert.id === id);
  if (!target) return { ok: false, reason: "not_found" };
  const at = nowIso(now);
  return {
    ok: true,
    state: { ...state, alerts: alerts.map((alert) => (alert.id === id ? { ...alert, status, updated_at: at } : alert)) }
  };
}

// ---- Heartbeat engine ----------------------------------------------------------------------

export function planAlerts(state = {}, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  const candidates = buildAlertCandidates(state, { env, now, stripeRevenue: ctx.stripeRevenue || null });
  return {
    observations: {
      candidates: candidates.length,
      critical: candidates.filter((cand) => cand.severity === "critical").length,
      emailDecision: resolveAlertEmailDecision(state, { env }).status
    }
  };
}

export async function actAlerts(state = {}, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  const candidates = buildAlertCandidates(state, { env, now, stripeRevenue: ctx.stripeRevenue || null });
  const rec = reconcileAlerts(list(state.alerts), candidates, { now });
  let next = { ...state, alerts: rec.alerts };
  const results = { created: rec.created, escalated: rec.escalated, resolved: rec.resolved, emails: [] };

  // Emit a company event only for alerts that BECAME critical in this pass (never re-emit
  // for a critical that was already standing, or every tick would spam the event log).
  const priorCritical = new Set(list(state.alerts)
    .filter((alert) => alert.severity === "critical" && (alert.status === "active" || alert.status === "read"))
    .map((alert) => alert.dedupe_key));
  for (const alert of rec.alerts.filter((entry) => entry.status === "active" && entry.severity === "critical" && !priorCritical.has(entry.dedupe_key))) {
    next = emitCompanyEvent(next, { source: ALERTS_ENGINE_ID, type: "alert_raised", risk: "needs_roger", summary: `Critical alert: ${alert.title}` });
  }

  const decision = resolveAlertEmailDecision(next, { env });
  const pendingCritical = criticalAlertsNeedingEmail(next.alerts);
  for (const alert of pendingCritical) {
    if (decision.status !== "live") {
      results.emails.push({ kind: "critical", alert: alert.id, status: decision.status, reason: decision.reason || "" });
      continue;
    }
    try {
      const sent = await ctx.runAlertEmailSend(buildCriticalEmail(alert, { env, recipient: decision.recipient }), { env });
      if (sent && sent.status === "sent") {
        const at = nowIso(now);
        next = { ...next, alerts: list(next.alerts).map((entry) => (entry.id === alert.id ? { ...entry, emailed_at: at } : entry)) };
        next = emitCompanyEvent(next, { source: ALERTS_ENGINE_ID, type: "alert_email_sent", risk: "info", summary: `Critical alert emailed to owner: ${alert.title}` });
        results.emails.push({ kind: "critical", alert: alert.id, status: "sent" });
      } else {
        results.emails.push({ kind: "critical", alert: alert.id, status: sent?.status || "not_sent", reason: sent?.reason || "" });
      }
    } catch (error) {
      results.emails.push({ kind: "critical", alert: alert.id, status: "error", error: String(error?.message || error) });
    }
  }

  if (shouldSendDigest(next, { now })) {
    const digest = buildDailyDigest(next, next.alerts, { env, recipient: decision.recipient || "", now });
    let digestStatus = decision.status;
    if (decision.status === "live") {
      try {
        const sent = await ctx.runAlertEmailSend(digest, { env });
        digestStatus = sent?.status === "sent" ? "sent" : sent?.status || "not_sent";
      } catch (error) {
        digestStatus = "error";
        results.emails.push({ kind: "digest", status: "error", error: String(error?.message || error) });
      }
    }
    if (digestStatus !== "error") {
      const { date } = etDateParts(now);
      next = {
        ...next,
        settings: { ...(next.settings || {}), alerts: { ...(next.settings?.alerts || {}), lastDigestDate: date } }
      };
      next = emitCompanyEvent(next, { source: ALERTS_ENGINE_ID, type: "alert_digest", risk: "info", summary: `Daily alert digest ${digestStatus === "sent" ? "emailed to owner" : `prepared (${digestStatus})`}: ${digest.counts.open} open alert(s).` });
      results.emails.push({ kind: "digest", status: digestStatus });
    }
  }

  return { state: next, results };
}

export function buildAlertsEngine(deps = {}) {
  return {
    id: ALERTS_ENGINE_ID,
    cadence: "hourly",
    plan(state, ctx) {
      return planAlerts(state, ctx);
    },
    async act(state, ctx) {
      return actAlerts(state, { ...ctx, runAlertEmailSend: deps.runAlertEmailSend });
    }
  };
}
