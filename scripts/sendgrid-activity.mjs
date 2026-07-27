// Read-only SendGrid activity client. GETs only — this module can never send.
//
// Two endpoints, because they answer different questions and have very different retention:
//
//   GET /v3/messages  (Email Activity)  — per-message records. Definitive, but retention is
//                                         short. Measured 2026-07-27: only that same day was
//                                         still queryable; 07-08/07-09/07-13/07-14, all of
//                                         which carried real sends, returned zero.
//   GET /v3/stats     (aggregate)       — per-day totals. Far longer retention, and the only
//                                         thing that can speak for sends older than activity
//                                         retention. It cannot name a recipient.
//
// The reconciliation uses per-message evidence where it exists and falls back to the daily
// totals where it does not, and it always records WHICH of the two answered.
//
// House rules held here (see sendgrid-domain-auth.mjs): key comes from an injected env,
// is never logged and never interpolated into an error; response is read as text then parsed
// in a try/catch; provider error detail is truncated; missing key fails closed before any
// network contact.

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const SENDGRID_API_BASE = "https://api.sendgrid.com";
// No SendGrid call in this repo previously set a timeout. A reconciliation runs unattended,
// so it gets one: a hung provider read must not hold the heartbeat open.
export const SENDGRID_REQUEST_TIMEOUT_MS = 20_000;

export class SendGridUnavailableError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "SendGridUnavailableError";
    this.status = status;
  }
}

export function sendGridApiKey(env = process.env) {
  return clean((env || {}).SENDGRID_API_KEY);
}

async function sendgridGet(path, params = {}, { env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = sendGridApiKey(env);
  // Fail closed BEFORE any network contact.
  if (!apiKey) throw new SendGridUnavailableError("SendGrid API key is not configured; no activity could be read.");
  const url = new URL(`${SENDGRID_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(SENDGRID_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new SendGridUnavailableError(`SendGrid ${path} could not be reached: ${clean(error?.message).slice(0, 200)}`);
  }
  const text = await response.text().catch(() => "");
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    // Provider status and body only — never the key, never the Authorization header.
    throw new SendGridUnavailableError(
      `SendGrid ${path} failed HTTP ${response.status}: ${clean(text).slice(0, 300)}`,
      response.status
    );
  }
  return body;
}

function isoDay(value = "") {
  return clean(value).slice(0, 10);
}

// Per-message activity for one calendar day. Returns [] when the day is outside retention —
// which is indistinguishable at the API from "nothing was sent", so callers must corroborate
// with dailyTotals before concluding anything from an empty result.
export async function messagesForDay(day, options = {}) {
  const date = isoDay(day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("messagesForDay needs a YYYY-MM-DD day.");
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const query = `last_event_time BETWEEN TIMESTAMP "${date}T00:00:00Z" AND TIMESTAMP "${next}T00:00:00Z"`;
  const body = await sendgridGet("/v3/messages", { limit: options.limit || 1000, query }, options);
  return list(body?.messages).map((message) => ({
    msgId: clean(message.msg_id),
    to: clean(message.to_email).toLowerCase(),
    from: clean(message.from_email),
    subject: clean(message.subject),
    status: clean(message.status),
    lastEventTime: clean(message.last_event_time)
  }));
}

// Aggregate per-day totals. `requests` is what SendGrid accepted from us — the number that can
// be compared against how many claims we created that day.
export async function dailyTotals(startDay, endDay, options = {}) {
  const body = await sendgridGet("/v3/stats", {
    start_date: isoDay(startDay),
    end_date: isoDay(endDay),
    aggregated_by: "day"
  }, options);
  const rows = [];
  for (const entry of list(body)) {
    const metrics = list(entry?.stats)[0]?.metrics || {};
    rows.push({
      date: isoDay(entry?.date),
      requests: Number(metrics.requests || 0),
      delivered: Number(metrics.delivered || 0),
      bounces: Number(metrics.bounces || 0),
      blocks: Number(metrics.blocks || 0),
      spamReports: Number(metrics.spam_reports || 0)
    });
  }
  return rows;
}

// Probe which days per-message activity can still answer for. Used to state retention as a
// measured fact rather than an assumption: a day is "covered" when activity returns at least
// one message OR the daily totals say nothing was sent that day (so emptiness is honest).
export async function activityCoverage(days = [], options = {}) {
  const wanted = [...new Set(days.map(isoDay).filter(Boolean))].sort();
  if (!wanted.length) return { covered: [], uncovered: [], totalsByDay: {} };
  const totals = await dailyTotals(wanted[0], wanted[wanted.length - 1], options);
  const totalsByDay = Object.fromEntries(totals.map((row) => [row.date, row]));
  const covered = [];
  const uncovered = [];
  for (const day of wanted) {
    const sentThatDay = Number(totalsByDay[day]?.requests || 0);
    let messages = [];
    try { messages = await messagesForDay(day, options); }
    catch (error) {
      if (!(error instanceof SendGridUnavailableError)) throw error;
      uncovered.push({ day, reason: `activity_unavailable: ${clean(error.message).slice(0, 160)}`, requests: sentThatDay });
      continue;
    }
    if (messages.length) covered.push({ day, messages: messages.length, requests: sentThatDay });
    else if (sentThatDay === 0) covered.push({ day, messages: 0, requests: 0, note: "nothing was sent that day" });
    else uncovered.push({ day, reason: "outside_activity_retention", requests: sentThatDay });
  }
  return { covered, uncovered, totalsByDay };
}
