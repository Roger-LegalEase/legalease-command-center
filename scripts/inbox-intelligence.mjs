// Inbox Intelligence (I-series, approved 2026-07-12) — full READ-ONLY analysis of exactly
// ONE mailbox: roger@legalease.com. Authorizing decision (scope, bounds, supersession of the
// 18I snippets-only rule for this one mailbox): docs/decisions/2026-07-12-inbox-full-read-
// roger-legalease.md.
//
// Safety walls, structurally:
//   1. Capability — this module has NO network path and NO send path; the Gmail fetch is an
//      injected read-only dep (ctx.fetchInboxThreads) exactly like B4/18H. The engine is
//      plan()-only: no act() method exists, so the heartbeat cannot run side effects for it.
//   2. Identity — the injected fetcher binds to INBOX_ALLOWED_MAILBOX; this module ALSO
//      refuses fetch results whose mailbox echo differs (belt + suspenders). Reading is
//      additionally gated on the engine's autopilot toggle: until Roger flips it (the flip
//      that writes the activation audit event), plan() performs no fetch at all.
//   3. Privacy — email BODIES are classification inputs only and are never persisted. The
//      stored signal carries classifications, one plain-English summary, and at most
//      EVIDENCE_MAX_LINES quoted lines of EVIDENCE_MAX_CHARS, each run through the shared
//      redactSupportText. test-inbox-intelligence.mjs scans this file's writer for
//      forbidden body fields.
//   4. Suggestion — every output is a suggested signal / queue item; decisions are Roger's.
//      mergeInboxSignals keeps his dismissals sticky, exactly like the queue layer.
//
// MUST stay in sync with coreStateCollections in storage.mjs, or these silently fail to
// persist to Supabase (the B1 trap). test-inbox-intelligence.mjs asserts membership.

import crypto from "node:crypto";
import { classifySupportText } from "./support-desk.mjs";
import { redactSupportText } from "./growth-inbox.mjs";
import { emitCompanyEvent } from "./company-memory.mjs";

export const INBOX_ENGINE_ID = "inbox-intelligence";
// The ONE mailbox the owner decision names. A different mailbox requires a new decision
// record and a code change here — deliberately not env-configurable, so widening scope is
// an auditable diff, never a config drift.
export const INBOX_ALLOWED_MAILBOX = "roger@legalease.com";
export const INBOX_COLLECTIONS = ["inboxSignals"];
export const INBOX_SINGLETON_COLLECTIONS = ["inboxConfig"];

export const INBOX_BACKFILL_WINDOW_DAYS = 30; // first scan only (Roger amendment: catch 1-2 week-old loops on day one)
export const INBOX_ROLLING_WINDOW_DAYS = 14;
export const INBOX_SCAN_MESSAGE_CAP = 500;
export const INBOX_SIGNALS_CAP = 500;
export const EVIDENCE_MAX_LINES = 3;
export const EVIDENCE_MAX_CHARS = 240;

export const SIGNAL_KINDS = ["needs_reply", "went_quiet", "commitment", "pipeline_inbound"];

// Internal teammates are noise, per Roger: our own threads never become signals.
const DEFAULT_INTERNAL_PEOPLE = ["lawrence", "rasheed", "britton", "roger"];
const DEFAULT_INTERNAL_DOMAINS = ["legalease.com", "legaleasepartner.com"];
// Investors + press count as pipeline (Roger amendment). Matched case-insensitively against
// sender name AND address; editable via inboxConfig.investorPatterns.
const DEFAULT_INVESTOR_PATTERNS = ["slauson", "techstars", "svsvf", "innovate mississippi", "innovatems", "innovate.ms"];
const DEFAULT_BULK_SENDER_PATTERNS = [
  "no-reply", "noreply", "donotreply", "do-not-reply", "notifications@", "notification@",
  "newsletter", "mailer-daemon", "postmaster@", "calendar-notification", "drive-shares",
  "billing@", "receipts@", "invoice+", "marketing@", "hello@substack", "bounce"
];

function nowIso(options = {}) {
  return typeof options.now === "function" ? options.now() : (options.now || new Date().toISOString());
}

function clean(value = "") {
  return String(value || "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function sha16(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function emailDomain(address = "") {
  const at = lower(address).lastIndexOf("@");
  return at > 0 ? lower(address).slice(at + 1) : "";
}

function ageDays(iso, now) {
  const then = Date.parse(String(iso || ""));
  const ref = Date.parse(String(now || ""));
  if (!Number.isFinite(then) || !Number.isFinite(ref)) return 0;
  return Math.max(0, Math.floor((ref - then) / 86400000));
}

export function inboxConfigOf(state = {}) {
  const stored = state.inboxConfig && typeof state.inboxConfig === "object" ? state.inboxConfig : {};
  return {
    boundMailbox: INBOX_ALLOWED_MAILBOX,
    replyOwedAfterDays: Number.isFinite(Number(stored.replyOwedAfterDays)) && Number(stored.replyOwedAfterDays) > 0 ? Number(stored.replyOwedAfterDays) : 2,
    quietAfterDays: Number.isFinite(Number(stored.quietAfterDays)) && Number(stored.quietAfterDays) > 0 ? Number(stored.quietAfterDays) : 4,
    internalPeople: list(stored.internalPeople).length ? stored.internalPeople.map(lower) : DEFAULT_INTERNAL_PEOPLE,
    internalDomains: list(stored.internalDomains).length ? stored.internalDomains.map(lower) : DEFAULT_INTERNAL_DOMAINS,
    investorPatterns: list(stored.investorPatterns).length ? stored.investorPatterns.map(lower) : DEFAULT_INVESTOR_PATTERNS,
    bulkSenderPatterns: list(stored.bulkSenderPatterns).length ? stored.bulkSenderPatterns.map(lower) : DEFAULT_BULK_SENDER_PATTERNS,
    backfillCompletedAt: clean(stored.backfillCompletedAt),
    lastScanAt: clean(stored.lastScanAt),
    lastScanStatus: clean(stored.lastScanStatus),
    lastScanTruncated: Boolean(stored.lastScanTruncated),
    lastScanCount: Number(stored.lastScanCount) || 0,
    activationAuditAt: clean(stored.activationAuditAt)
  };
}

export function isInternalCounterpart(address = "", name = "", config = inboxConfigOf()) {
  const addr = lower(address);
  const who = lower(name);
  if (!addr && !who) return false;
  if (config.internalDomains.some((domain) => addr.endsWith("@" + domain))) return true;
  return config.internalPeople.some((person) => person && (who.includes(person) || addr.startsWith(person + "@") || addr.includes(person + ".")));
}

export function isBulkSender(address = "", name = "", config = inboxConfigOf()) {
  const haystack = lower(address) + " " + lower(name);
  return config.bulkSenderPatterns.some((pattern) => pattern && haystack.includes(pattern));
}

// ---- pipeline matching ----------------------------------------------------------------------
// A counterpart is "pipeline" when their address (or domain) appears in any relationship
// collection, or they match an investor/press pattern. Returns {collection,itemId} pointing at
// the strongest match so queue items can deep-link the record, or a synthetic investor match.
const PIPELINE_SOURCES = [
  ["outreachContacts", (row) => [row.email, row.contact_email]],
  ["reactivationContacts", (row) => [row.email, row.contact_email]],
  ["companyContacts", (row) => [row.email, row.contact_email, row.primaryEmail]],
  ["partners", (row) => [row.email, row.contactEmail, row.contact_email, row.primaryContactEmail]],
  ["prospectCandidates", (row) => [row.email, row.contactEmail, row.contact_email]]
];

export function buildPipelineIndex(state = {}, config = inboxConfigOf()) {
  const byAddress = new Map();
  const byDomain = new Map();
  for (const [collection, extract] of PIPELINE_SOURCES) {
    list(state[collection]).forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      const itemId = String(row.id || row.contact_id || row.email || collection + "-" + index);
      for (const raw of extract(row) || []) {
        const address = lower(raw);
        if (!address || !address.includes("@")) continue;
        if (!byAddress.has(address)) byAddress.set(address, { collection, itemId });
        const domain = emailDomain(address);
        // Free-mail domains identify a person, not an organization — never domain-match them.
        if (domain && !["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"].includes(domain) && !byDomain.has(domain)) {
          byDomain.set(domain, { collection, itemId });
        }
      }
    });
  }
  return { byAddress, byDomain, investorPatterns: config.investorPatterns };
}

export function pipelineMatchFor(address = "", name = "", index) {
  if (!index) return null;
  const addr = lower(address);
  const exact = addr ? index.byAddress.get(addr) : null;
  if (exact) return { ...exact, matchedBy: "address" };
  const domain = emailDomain(addr);
  const byDomain = domain ? index.byDomain.get(domain) : null;
  if (byDomain) return { ...byDomain, matchedBy: "domain" };
  const haystack = addr + " " + lower(name);
  const investor = (index.investorPatterns || []).find((pattern) => pattern && haystack.includes(pattern));
  if (investor) return { collection: "", itemId: "", matchedBy: "investor_pattern", pattern: investor };
  return null;
}

// ---- commitment detection (conservative on purpose, per Roger) -------------------------------
// Only explicit first-person promises with an explicit timeframe. Fuzzy promises are a tuning
// pass after the 3-day acceptance run, driven by what Roger dismisses.
const COMMITMENT_RE = /\b(i(?:'|’)?ll|i will|i can(?: get you)?|i(?:'|’)?m going to)\s+([^.!\n]{3,120}?)\s*(?:by|before|)\s*\b(today|tomorrow|tonight|this week|next week|end of (?:the )?week|eow|eod|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function impliedDeadline(timeframe = "", sentAtIso = "") {
  const sent = new Date(Date.parse(String(sentAtIso || "")) || Date.now());
  const frame = lower(timeframe);
  const endOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 0)).toISOString();
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  if (["today", "tonight", "eod"].includes(frame)) return endOfDay(sent);
  if (frame === "tomorrow") return endOfDay(addDays(sent, 1));
  if (["this week", "end of week", "end of the week", "eow"].includes(frame)) {
    const toFriday = (5 - sent.getUTCDay() + 7) % 7;
    return endOfDay(addDays(sent, toFriday === 0 && sent.getUTCDay() !== 5 ? 5 : toFriday));
  }
  if (frame === "next week") {
    const toFriday = ((5 - sent.getUTCDay() + 7) % 7) + 7;
    return endOfDay(addDays(sent, toFriday));
  }
  const weekdayIndex = WEEKDAYS.indexOf(frame);
  if (weekdayIndex >= 0) {
    let delta = (weekdayIndex - sent.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return endOfDay(addDays(sent, delta));
  }
  return "";
}

export function detectCommitment(bodyText = "", sentAtIso = "") {
  const match = COMMITMENT_RE.exec(String(bodyText || ""));
  if (!match) return null;
  const dueAt = impliedDeadline(match[3], sentAtIso);
  if (!dueAt) return null;
  const line = clean(match[0]).replace(/\s+/g, " ").slice(0, EVIDENCE_MAX_CHARS);
  return { promiseLine: line, what: clean(match[2]).slice(0, 90), timeframe: lower(match[3]), dueAt };
}

// ---- evidence -------------------------------------------------------------------------------
export function evidenceLines(text = "", max = EVIDENCE_MAX_LINES) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => clean(line).replace(/\s+/g, " "))
    .filter((line) => line.length > 8)
    .filter((line) => !line.startsWith(">") && !/^on .+ wrote:$/i.test(line) && !/^--/.test(line))
    .slice(0, max)
    .map((line) => redactSupportText(line).slice(0, EVIDENCE_MAX_CHARS));
}

// ---- classification -------------------------------------------------------------------------
// threads: [{ threadId, subject, messages: [{ id, fromEmail, fromName, isFromMe, at, bodyText }] }]
// bodyText is a TRANSIENT classification input; nothing in the returned signals contains it
// beyond the redacted evidence lines.
export function classifyInboxThreads(threads = [], { state = {}, config = inboxConfigOf(), now = new Date().toISOString() } = {}) {
  const index = buildPipelineIndex(state, config);
  const signals = [];
  let skippedInternal = 0;
  let skippedBulk = 0;
  for (const thread of list(threads)) {
    const messages = list(thread.messages)
      .filter((m) => m && m.at)
      .slice()
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (!messages.length) continue;
    const last = messages[messages.length - 1];
    const counterpartMessage = messages.slice().reverse().find((m) => !m.isFromMe) || null;
    const counterpartEmail = lower(counterpartMessage ? counterpartMessage.fromEmail : "");
    const counterpartName = clean(counterpartMessage ? counterpartMessage.fromName : "");
    if (counterpartMessage && isInternalCounterpart(counterpartEmail, counterpartName, config)) {
      skippedInternal += 1;
      continue;
    }
    const subject = redactSupportText(clean(thread.subject)).slice(0, 140);
    const pipeline = counterpartMessage ? pipelineMatchFor(counterpartEmail, counterpartName, index) : null;
    const uplSensitive = Boolean(counterpartMessage && classifySupportText(String(counterpartMessage.bodyText || "")).uplSensitive);
    const base = {
      threadId: String(thread.threadId || ""),
      subject,
      counterpartName: counterpartName.slice(0, 80),
      counterpartEmail,
      counterpartDomain: emailDomain(counterpartEmail),
      pipelineMatch: pipeline,
      uplSensitive,
      occurredAt: String(last.at),
      status: "suggested",
      internalOnly: true,
      ownerOnly: true,
      pii_redacted: true
    };
    const who = counterpartName || counterpartEmail || "someone";

    // 1. You owe a reply.
    if (!last.isFromMe) {
      const days = ageDays(last.at, now);
      if (days >= config.replyOwedAfterDays && !isBulkSender(counterpartEmail, counterpartName, config)) {
        signals.push({
          ...base,
          id: "inbox-needs-reply-" + sha16(base.threadId + "|needs_reply"),
          kind: "needs_reply",
          ageDays: days,
          summary: "You owe " + who + " a reply - " + days + (days === 1 ? " day." : " days."),
          evidence: evidenceLines(last.bodyText),
          confidence: 0.8
        });
      } else if (!last.isFromMe && isBulkSender(counterpartEmail, counterpartName, config)) {
        skippedBulk += 1;
      }
      // 4. Pipeline inbound (any recency inside the scan window).
      if (pipeline && !isBulkSender(counterpartEmail, counterpartName, config)) {
        signals.push({
          ...base,
          id: "inbox-pipeline-" + sha16(base.threadId + "|pipeline|" + String(last.id || "")),
          kind: "pipeline_inbound",
          ageDays: ageDays(last.at, now),
          summary: "Inbound from a pipeline contact: " + who + " wrote" + (subject ? ' about "' + subject + '".' : "."),
          evidence: evidenceLines(last.bodyText),
          confidence: 0.75
        });
      }
    }

    // 2. They went quiet after your reply (pipeline contacts only).
    if (last.isFromMe && counterpartMessage && pipeline) {
      const days = ageDays(last.at, now);
      if (days >= config.quietAfterDays) {
        signals.push({
          ...base,
          id: "inbox-quiet-" + sha16(base.threadId + "|went_quiet"),
          kind: "went_quiet",
          ageDays: days,
          summary: who + " went quiet after your reply - " + days + (days === 1 ? " day." : " days."),
          evidence: evidenceLines(last.bodyText),
          confidence: 0.7
        });
      }
    }

    // 3. Commitments you made in writing (from any of your messages in the thread).
    for (const message of messages) {
      if (!message.isFromMe) continue;
      const commitment = detectCommitment(message.bodyText, message.at);
      if (!commitment) continue;
      signals.push({
        ...base,
        id: "inbox-commitment-" + sha16(base.threadId + "|commitment|" + sha16(commitment.promiseLine)),
        kind: "commitment",
        ageDays: ageDays(message.at, now),
        occurredAt: String(message.at),
        dueAt: commitment.dueAt,
        summary: 'You wrote "' + redactSupportText(commitment.promiseLine) + '"' + (who !== "someone" ? " to " + who : "") + " - that lands " + commitment.dueAt.slice(0, 10) + ".",
        evidence: [redactSupportText(commitment.promiseLine)],
        confidence: 0.7
      });
    }
  }
  return { signals, skippedInternal, skippedBulk };
}

// ---- merge (decisions sticky, resolved threads retire) ---------------------------------------
const STICKY_STATUSES = new Set(["dismissed", "done", "queued", "snoozed"]);

export function mergeInboxSignals(existing = [], incoming = [], { now = new Date().toISOString() } = {}) {
  const byId = new Map(list(existing).map((signal) => [signal.id, signal]));
  const seen = new Set();
  for (const signal of list(incoming)) {
    seen.add(signal.id);
    const prior = byId.get(signal.id);
    if (prior && STICKY_STATUSES.has(String(prior.status))) {
      // Roger decided; a re-scan refreshes freshness fields only, never resurrects.
      byId.set(signal.id, { ...prior, ageDays: signal.ageDays, lastSeenAt: now, updatedAt: now });
      continue;
    }
    byId.set(signal.id, {
      ...(prior || {}),
      ...signal,
      createdAt: prior?.createdAt || now,
      updatedAt: now,
      lastSeenAt: now
    });
  }
  // A previously open reply/quiet signal that no longer classifies means the thread moved
  // (they replied, or you did). Retire it honestly instead of leaving a stale nag.
  for (const [id, signal] of byId) {
    if (seen.has(id)) continue;
    if (["needs_reply", "went_quiet"].includes(String(signal.kind)) && String(signal.status) === "suggested") {
      byId.set(id, { ...signal, status: "resolved", resolvedAt: now, updatedAt: now });
    }
  }
  const all = [...byId.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const open = all.filter((signal) => signal.status === "suggested");
  const decided = all.filter((signal) => signal.status !== "suggested").slice(0, Math.max(0, INBOX_SIGNALS_CAP - open.length));
  return [...open, ...decided];
}

// ---- activation audit (the decision record's mandate) ----------------------------------------
export function recordInboxActivationAudit(state = {}, { actor = "owner", now = new Date().toISOString() } = {}) {
  const config = inboxConfigOf(state);
  if (config.activationAuditAt) return state; // once, ever
  const auditRow = {
    id: "audit-inbox-activation-" + sha16(now),
    timestamp: now,
    actor,
    action: "inbox full-read decision recorded",
    resourceType: "owner_decision",
    resourceId: "docs/decisions/2026-07-12-inbox-full-read-roger-legalease.md",
    beforeValue: { mailbox: INBOX_ALLOWED_MAILBOX, posture: "off" },
    afterValue: { mailbox: INBOX_ALLOWED_MAILBOX, posture: "read_active", scopes: "gmail.readonly (send-incapable)" }
  };
  let next = {
    ...state,
    auditHistory: [auditRow, ...list(state.auditHistory)].slice(0, 1000),
    inboxConfig: { ...(state.inboxConfig || {}), activationAuditAt: now }
  };
  next = emitCompanyEvent(next, {
    source: INBOX_ENGINE_ID,
    type: "inbox_full_read_activated",
    occurred_at: now,
    risk: "info",
    summary: "Owner activated full read-only inbox analysis for the one authorized mailbox. Decision record: docs/decisions/2026-07-12-inbox-full-read-roger-legalease.md. No send capability exists.",
    raw_ref: { collection: "auditHistory", itemId: auditRow.id }
  });
  return next;
}

// ---- the engine ------------------------------------------------------------------------------
export function planInboxIntelligence(state = {}, ctx = {}) {
  const now = nowIso(ctx);
  const config = inboxConfigOf(state);
  const observations = [];
  const enabledCheck = typeof ctx.inboxReadEnabled === "function" ? ctx.inboxReadEnabled : () => false;
  if (!enabledCheck(state)) {
    observations.push({ type: "inbox_intelligence", status: "off", detail: "Inbox reading is off until the owner flips the inbox toggle (the flip records the activation audit event)." });
    return { state, observations };
  }
  if (typeof ctx.fetchInboxThreads !== "function") {
    observations.push({ type: "inbox_intelligence", status: "not_queried", detail: "No inbox fetcher injected this run; nothing was read and nothing is fabricated." });
    return { state, observations };
  }
  const windowDays = config.backfillCompletedAt ? INBOX_ROLLING_WINDOW_DAYS : INBOX_BACKFILL_WINDOW_DAYS;
  return Promise.resolve(ctx.fetchInboxThreads({ windowDays, messageCap: INBOX_SCAN_MESSAGE_CAP })).then((fetched) => {
    if (!fetched || fetched.ok !== true) {
      const reason = clean(fetched && fetched.reason) || "fetch_failed";
      observations.push({ type: "inbox_intelligence", status: "blocked", detail: "Inbox scan did not run: " + reason + ". Nothing was read from any other account." });
      const nextConfig = { ...(state.inboxConfig || {}), lastScanAt: now, lastScanStatus: reason };
      return { state: { ...state, inboxConfig: nextConfig }, observations };
    }
    if (lower(fetched.mailbox) !== INBOX_ALLOWED_MAILBOX) {
      observations.push({ type: "inbox_intelligence", status: "blocked", detail: "Connected mailbox is not the authorized one; full read refused (identity wall)." });
      const nextConfig = { ...(state.inboxConfig || {}), lastScanAt: now, lastScanStatus: "mailbox_not_authorized" };
      return { state: { ...state, inboxConfig: nextConfig }, observations };
    }
    const { signals, skippedInternal, skippedBulk } = classifyInboxThreads(fetched.threads, { state, config, now });
    const merged = mergeInboxSignals(state.inboxSignals, signals, { now });
    const truncated = Boolean(fetched.truncated);
    const nextConfig = {
      ...(state.inboxConfig || {}),
      lastScanAt: now,
      lastScanStatus: "ok",
      lastScanTruncated: truncated,
      lastScanCount: Number(fetched.scannedCount) || 0,
      // Backfill completes only when a BACKFILL-window scan finished untruncated; a capped
      // backfill resumes at 30 days on the next scan (Roger amendment: day-one loops must
      // not age out because of the message cap).
      backfillCompletedAt: config.backfillCompletedAt || (!truncated ? now : "")
    };
    observations.push({
      type: "inbox_intelligence",
      status: "scanned",
      windowDays,
      scannedCount: Number(fetched.scannedCount) || 0,
      truncated,
      openSignals: merged.filter((s) => s.status === "suggested").length,
      skippedInternal,
      skippedBulk,
      detail: truncated ? "Scan hit the " + INBOX_SCAN_MESSAGE_CAP + "-message cap; the window resumes next scan (nothing silently dropped)." : ""
    });
    return { state: { ...state, inboxSignals: merged, inboxConfig: nextConfig }, observations };
  });
}

export function buildInboxIntelligenceEngine(deps = {}) {
  return {
    id: INBOX_ENGINE_ID,
    cadence: "daily",
    // plan()-only BY DESIGN: no act() method exists, so the heartbeat structurally cannot
    // run side effects for this engine even with autopilot ON (heartbeat.mjs skips act()
    // when absent). The autopilot toggle instead gates READING, via inboxReadEnabled.
    plan(state, ctx = {}) {
      return planInboxIntelligence(state, {
        ...ctx,
        fetchInboxThreads: deps.fetchInboxThreads,
        inboxReadEnabled: deps.inboxReadEnabled
      });
    }
  };
}
