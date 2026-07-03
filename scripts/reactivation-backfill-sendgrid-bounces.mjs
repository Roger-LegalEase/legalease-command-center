// MVP Reactivation — SendGrid bounce/drop/block backfill into the production webhook.
//
// Run this in the PROD Render Shell, where SENDGRID_API_KEY and the production store env live.
//
//   node scripts/reactivation-backfill-sendgrid-bounces.mjs --date=2026-06-30
//   node scripts/reactivation-backfill-sendgrid-bounces.mjs --date=2026-06-30 --confirm
//   node scripts/reactivation-backfill-sendgrid-bounces.mjs --date=2026-06-30 --csv=/tmp/sendgrid-bounces.csv
//   node scripts/reactivation-backfill-sendgrid-bounces.mjs --date=2026-06-30 --csv=/tmp/sendgrid-bounces.csv --confirm
//
// Dry-run is the default. --confirm is required before it POSTs events to:
//   https://legalease-command-center-prod.onrender.com/api/outreach/webhooks/sendgrid
//
// Scope:
//   1. Query SendGrid Suppressions, or read a SendGrid Suppressions CSV export, for hard events.
//   2. Filter them to reactivation Wave 1/sent campaign recipients in the production store.
//   3. Replay only those matched events into the production SendGrid webhook.
//   4. Confirm /api/reactivation/status reflects hardBounces > 0.
//
// This script does not send email, release waves, toggle gates, or deploy anything.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createStore } from "./storage.mjs";
import { normalizeEmail } from "./outreach-os.mjs";
import { campaignRates } from "./reactivation-os.mjs";

const DEFAULT_BASE_URL = "https://legalease-command-center-prod.onrender.com";
const HARD_EVENTS = new Set(["bounce", "dropped", "blocked"]);

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => Array.isArray(v) ? v : [];

function fail(message) {
  console.error("ABORTED: " + message);
  process.exit(1);
}

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function previousUtcDateKey() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function dayWindow(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) fail("--date must be YYYY-MM-DD.");
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(`${dateKey}T23:59:59.999Z`);
  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startUnix: Math.floor(start.getTime() / 1000),
    endUnix: Math.floor(end.getTime() / 1000)
  };
}

function maskEmail(email = "") {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return "";
  const [local, domain] = e.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

function emailHash(email = "") {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 12);
}

function ownerToken() {
  return process.env.COMMAND_CENTER_OWNER_TOKEN || process.env.COMMAND_CENTER_ACCESS_TOKEN || "";
}

function eventInWindow(ev = {}, window) {
  const ts = Number(ev.timestamp || 0);
  if (!ts) return true; // SendGrid exports sometimes omit created time; keep it matchable.
  return ts >= window.startUnix && ts <= window.endUnix;
}

function timestampValue(...values) {
  for (const value of values) {
    const raw = clean(value);
    if (!raw) continue;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 9_999_999_999 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return undefined;
}

async function sendgridGet(path, params = {}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) fail("SENDGRID_API_KEY is not set. Run this in the prod Render Shell.");
  const url = new URL(`https://api.sendgrid.com${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const safe = JSON.stringify(body).slice(0, 700);
    throw new Error(`${path} failed HTTP ${response.status}: ${safe}`);
  }
  return body;
}

function normalizeSendgridEvent(raw = {}, forcedType = "") {
  const email = normalizeEmail(raw.email || raw.to_email || raw.to || raw.recipient);
  if (!email) return null;
  const event = lower(forcedType || raw.event || raw.type || raw.status || raw.last_event_name || raw.reason);
  const mapped = event.includes("block") ? "blocked"
    : event.includes("drop") ? "dropped"
    : event.includes("bounce") ? "bounce"
    : HARD_EVENTS.has(event) ? event
    : "";
  if (!mapped) return null;
  return {
    email,
    event: mapped,
    reason: clean(raw.reason || raw.response || raw.status || raw.last_event_time || ""),
    timestamp: timestampValue(raw.timestamp, raw.created, raw.created_at, raw.last_event_time, raw.date)
  };
}

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((v) => clean(v))) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => lower(h).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return rows.slice(1).map((values) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj;
  });
}

async function queryCsvFile(csvPath, window) {
  const text = await readFile(csvPath, "utf8");
  const rows = parseCsv(text);
  const out = [];
  for (const row of rows) {
    const ev = normalizeSendgridEvent({
      email: row.email || row.email_address || row.recipient || row.to,
      event: row.event || row.type || row.status || "bounce",
      reason: row.reason || row.response || row.description || row.status,
      timestamp: row.timestamp || row.created || row.created_at || row.date
    }, "bounce");
    if (ev && eventInWindow(ev, window)) out.push(ev);
  }
  return out;
}

async function querySuppressionsPrimary(window) {
  const out = [];
  const sources = [
    ["/v3/suppression/bounces", "bounce"],
    ["/v3/suppression/blocks", "blocked"]
  ];
  for (const [path, type] of sources) {
    let rows = [];
    try {
      const body = await sendgridGet(path);
      rows = list(body?.result || body);
      console.log(`SendGrid Suppressions ${path} returned ${rows.length} row(s) without date params.`);
    } catch (error) {
      console.log(`SendGrid Suppressions ${path} unfiltered failed: ${error.message.slice(0, 220)}`);
    }

    // Diagnostic only: some accounts support these params, some return zero despite dashboard data.
    try {
      const filteredBody = await sendgridGet(path, { start_time: window.startUnix, end_time: window.endUnix });
      const filteredRows = list(filteredBody?.result || filteredBody);
      console.log(`SendGrid Suppressions ${path} returned ${filteredRows.length} row(s) with start_time/end_time.`);
      if (!rows.length && filteredRows.length) rows = filteredRows;
    } catch (error) {
      console.log(`SendGrid Suppressions ${path} date-param query failed: ${error.message.slice(0, 180)}`);
    }

    let kept = 0;
    for (const row of rows) {
      const ev = normalizeSendgridEvent(row, type);
      if (ev && eventInWindow(ev, window)) { out.push(ev); kept++; }
    }
    console.log(`SendGrid Suppressions ${path} kept ${kept} row(s) after client date filter.`);
  }
  return out;
}

async function queryEmailActivity(window) {
  // Email Activity gives the best event fidelity, including dropped/blocked. Some SendGrid plans do
  // not enable this endpoint; if unavailable, the script falls back to suppression endpoints.
  // /v3/messages does not accept an "event" identifier in the top-level query. Query messages by
  // delivery status/time, then inspect each message's detail events for bounce/drop/block.
  const queries = [
    `last_event_time BETWEEN TIMESTAMP "${window.startIso}" AND TIMESTAMP "${window.endIso}" AND status="not_delivered"`,
    `last_event_time BETWEEN TIMESTAMP "${window.startIso}" AND TIMESTAMP "${window.endIso}"`
  ];
  let body;
  let lastError;
  for (const query of queries) {
    try {
      body = await sendgridGet("/v3/messages", { limit: 1000, query });
      console.log(`SendGrid Email Activity query used: ${query.includes("not_delivered") ? "date + status=not_delivered" : "date only"}`);
      break;
    } catch (error) {
      lastError = error;
      console.log(`SendGrid Email Activity query failed (${query.includes("not_delivered") ? "date + status" : "date only"}): ${error.message.slice(0, 220)}`);
    }
  }
  if (!body) throw lastError || new Error("SendGrid Email Activity query failed.");
  const messages = list(body?.messages || body?.result || body);
  const out = [];
  for (const msg of messages) {
    const email = normalizeEmail(msg.to_email || msg.email || msg.to);
    const msgId = clean(msg.msg_id || msg.message_id || msg.id);
    if (!msgId) {
      const ev = normalizeSendgridEvent(msg);
      if (ev) out.push(ev);
      continue;
    }
    try {
      const detail = await sendgridGet(`/v3/messages/${encodeURIComponent(msgId)}`);
      const events = list(detail?.events || detail?.messages?.[0]?.events || detail?.result?.events);
      for (const event of events) {
        const ev = normalizeSendgridEvent({ ...event, email: event.email || email });
        if (ev && HARD_EVENTS.has(ev.event)) out.push(ev);
      }
    } catch {
      const ev = normalizeSendgridEvent(msg);
      if (ev) out.push(ev);
    }
  }
  return out;
}

function dedupeEvents(events = []) {
  const seen = new Set();
  const out = [];
  for (const ev of events) {
    if (!ev || !HARD_EVENTS.has(ev.event)) continue;
    const key = `${normalizeEmail(ev.email)}|${ev.event}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  return out;
}

function reactivationRecipientSet(state = {}) {
  const contactsById = new Map(list(state.reactivationContacts).map((c) => [clean(c.contact_id), c]));
  const emails = new Set();
  const diagnostics = {
    sentAttempts: 0,
    dateMatched: 0,
    explicitWave1: 0,
    inferredCampaign: 0,
    missingEmail: 0,
    wave1ContactsAdded: 0,
    enrolledContactsAdded: 0
  };
  for (const contact of list(state.reactivationContacts)) {
    const email = normalizeEmail(contact.email);
    if (!email) continue;
    if (Number(contact.wave) === 1) {
      emails.add(email);
      diagnostics.wave1ContactsAdded++;
    } else if (contact.enrolled_at && lower(contact.campaign_id) === "mvp-reactivation") {
      emails.add(email);
      diagnostics.enrolledContactsAdded++;
    }
  }
  for (const attempt of list(state.reactivationAttempts)) {
    if (lower(attempt.status) !== "sent") continue;
    diagnostics.sentAttempts++;
    diagnostics.dateMatched++;
    const contact = contactsById.get(clean(attempt.contact_id));
    const explicitWave1 = Number(attempt.wave) === 1 || Number(contact?.wave) === 1;
    const inferredCampaign = lower(attempt.campaign_id) === "mvp-reactivation"
      || /^react-attempt-/i.test(clean(attempt.id))
      || /^react-/i.test(clean(attempt.contact_id));
    if (!explicitWave1 && !inferredCampaign) continue;
    if (explicitWave1) diagnostics.explicitWave1++; else diagnostics.inferredCampaign++;
    const email = normalizeEmail(attempt.to || contact?.email);
    if (email) emails.add(email); else diagnostics.missingEmail++;
  }
  return { emails, diagnostics };
}

function existingHardEventKeys(state = {}) {
  const keys = new Set();
  for (const ev of list(state.reactivationEvents)) {
    const event = lower(ev.type || ev.event);
    if (!HARD_EVENTS.has(event)) continue;
    const email = normalizeEmail(ev.email);
    if (email) keys.add(`${email}|${event}`);
  }
  return keys;
}

async function postWebhook(baseUrl, events) {
  const response = await fetch(`${baseUrl}/api/outreach/webhooks/sendgrid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events)
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`webhook HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`);
  return { status: response.status, body };
}

async function fetchStatus(baseUrl) {
  const token = ownerToken();
  if (!token) return null;
  const response = await fetch(`${baseUrl}/api/reactivation/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`status HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`);
  return body;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const dateKey = argValue("date", previousUtcDateKey());
  const csvPath = argValue("csv", "");
  const baseUrl = argValue("base-url", DEFAULT_BASE_URL).replace(/\/$/, "");
  const window = dayWindow(dateKey);

  console.log("Reactivation SendGrid hard-bounce backfill");
  console.log(`  Date UTC      : ${dateKey}`);
  console.log(`  Webhook       : ${baseUrl}/api/outreach/webhooks/sendgrid`);
  console.log(`  Mode          : ${confirm ? "CONFIRM - will replay matched events" : "DRY RUN - no webhook POST"}`);
  console.log(`  CSV source    : ${csvPath || "(none)"}`);
  console.log(`  SendGrid key  : ${process.env.SENDGRID_API_KEY ? "present" : "missing"}`);
  console.log(`  Owner token   : ${ownerToken() ? "present" : "missing (status confirmation will use local rates only)"}`);

  const store = await createStore();
  const stateBefore = await store.readState();
  const beforeRates = campaignRates(stateBefore);
  const sentSet = reactivationRecipientSet(stateBefore);
  const wave1Emails = sentSet.emails;
  if (!wave1Emails.size) fail("No sent reactivation campaign attempts found in the production store.");

  console.log("\nBefore");
  console.log(`  Sent attempts : ${beforeRates.sent}`);
  console.log(`  hardBounces   : ${beforeRates.hardBounces}`);
  console.log(`  Sent reactivation attempts considered: ${sentSet.diagnostics.dateMatched}`);
  console.log(`  Recipients considered: ${wave1Emails.size}`);
  console.log(`  Explicit Wave 1 attempts: ${sentSet.diagnostics.explicitWave1}`);
  console.log(`  Inferred campaign attempts included: ${sentSet.diagnostics.inferredCampaign}`);
  console.log(`  Wave 1 contacts added to match set: ${sentSet.diagnostics.wave1ContactsAdded}`);
  if (sentSet.diagnostics.enrolledContactsAdded) console.log(`  Enrolled contacts added to match set: ${sentSet.diagnostics.enrolledContactsAdded}`);
  if (sentSet.diagnostics.missingEmail) console.log(`  Missing-email attempts skipped: ${sentSet.diagnostics.missingEmail}`);

  let sendgridEvents = [];
  if (csvPath) {
    sendgridEvents = await queryCsvFile(csvPath, window);
    console.log(`\nCSV bounce export events found: ${sendgridEvents.length}`);
  } else {
    sendgridEvents = await querySuppressionsPrimary(window);
    console.log(`\nSendGrid Suppressions hard events found: ${sendgridEvents.length}`);
    if (!sendgridEvents.length) {
      try {
        const emailActivity = await queryEmailActivity(window);
        console.log(`SendGrid Email Activity secondary events found: ${emailActivity.length}`);
        sendgridEvents = emailActivity;
      } catch (error) {
        console.log(`SendGrid Email Activity secondary unavailable: ${error.message.slice(0, 220)}`);
      }
    }
  }

  const unique = dedupeEvents(sendgridEvents);
  const existing = existingHardEventKeys(stateBefore);
  const matched = unique
    .filter((ev) => wave1Emails.has(normalizeEmail(ev.email)))
    .filter((ev) => !existing.has(`${normalizeEmail(ev.email)}|${ev.event}`));

  console.log("\nMatched reactivation campaign hard events");
  console.log(`  Unique SendGrid hard events : ${unique.length}`);
  console.log(`  Matched to sent reactivation list : ${matched.length}`);
  console.log(`  Already in reactivationEvents skipped: ${unique.filter((ev) => existing.has(`${normalizeEmail(ev.email)}|${ev.event}`)).length}`);
  const byEvent = {};
  for (const ev of matched) byEvent[ev.event] = (byEvent[ev.event] || 0) + 1;
  console.log(`  By event type: ${JSON.stringify(byEvent)}`);
  console.log(`  Masked sample: ${matched.slice(0, 5).map((ev) => `${ev.event}:${maskEmail(ev.email)}:${emailHash(ev.email)}`).join(", ") || "(none)"}`);

  if (!confirm) {
    console.log("\nDRY RUN complete. Re-run with --confirm to replay these events into the production webhook.");
    return;
  }
  if (!matched.length) fail("No new Wave 1 hard events matched; refusing to POST an empty/no-op backfill.");

  const replayPayload = matched.map((ev) => ({
    email: ev.email,
    event: ev.event,
    reason: ev.reason || "sendgrid_backfill",
    timestamp: ev.timestamp || Math.floor(Date.now() / 1000),
    source: "sendgrid_backfill_reactivation_wave1"
  }));
  const webhook = await postWebhook(baseUrl, replayPayload);
  console.log("\nWebhook replay");
  console.log(`  HTTP status : ${webhook.status}`);
  console.log(`  Processed   : ${webhook.body?.processed ?? "(unknown)"}`);

  const stateAfter = await store.readState();
  const localAfterRates = campaignRates(stateAfter);
  const remoteStatus = await fetchStatus(baseUrl).catch((error) => {
    console.log(`  Status endpoint confirmation unavailable: ${error.message.slice(0, 220)}`);
    return null;
  });
  const rates = remoteStatus?.rates || localAfterRates;

  console.log("\nAfter");
  console.log(`  hardBounces       : ${rates.hardBounces}`);
  console.log(`  hard_bounce rate  : ${((rates.hard_bounce || 0) * 100).toFixed(2)}%`);
  console.log(`  thresholdTripped  : ${remoteStatus ? remoteStatus.thresholdTripped : "(check /api/reactivation/status)"}`);
  console.log(`  thresholdReasons  : ${remoteStatus ? JSON.stringify(remoteStatus.thresholdReasons || []) : "(check /api/reactivation/status)"}`);

  if ((rates.hardBounces || 0) <= (beforeRates.hardBounces || 0)) {
    fail("Webhook POST returned success, but hardBounces did not increase. Check whether the emails matched reactivationContacts.");
  }

  console.log("\nDONE: production reactivation metrics moved from SendGrid hard events.");
  console.log("Note: this proves the webhook processing/store/status path. The webhook enforces SendGrid signature verification (fail closed) once SENDGRID_WEBHOOK_PUBLIC_KEY is set — this script replays UNSIGNED events, so run any backfill BEFORE arming that key.");
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});
