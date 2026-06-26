// B2 — Controlled Outreach OS (Phase 0: infrastructure, NO live sending).
//
// Build order (enforced by structure, not convention):
//   1. Data model  — OUTREACH_COLLECTIONS / OUTREACH_SINGLETON_COLLECTIONS are the single
//                    source of truth; storage.mjs appends them to coreStateCollections so
//                    they persist to Supabase. test-outreach-os.mjs asserts membership.
//   2. Suppression — isSuppressed() is the authoritative gate covering all 8 reasons,
//                    extends the existing RCAP suppression, sticky, enforced at BOTH
//                    queue-build (plan) and send-time (act).
//   3. CAN-SPAM    — assembleCompliantMessage() is the ONLY message builder and THROWS if
//                    the postal address is unset; validateCompliance() is a hard precondition.
//   4. Queue-then-approve — plan() queues proposals; a human approves; act() sends ONLY
//                    approved + compliant + unsuppressed + within-caps messages.
//   5. Heartbeat engine — buildOutreachEngine(); autopilot OFF by default is the OUTER gate.
//
// SAFETY: the live SendGrid call lives behind deps.runOutreachSend (injected by the server,
// like runPublishing). With no dep, or in dry-run, act() records attempts but performs NO
// network send. Autopilot OFF means act() never even runs. Three independent gates stand
// between this module and a real email: autopilot toggle, deps presence, OUTREACH_LIVE_SEND.

import crypto from "node:crypto";
import { etParts } from "./heartbeat.mjs";
import { isRcapContactSuppressed } from "./rcap-revenue-os.mjs";

// ---------------------------------------------------------------------------
// 1. DATA MODEL — single source of truth for collection membership.
// ---------------------------------------------------------------------------
export const OUTREACH_COLLECTIONS = [
  "outreachOrganizations",
  "outreachContacts",
  "outreachLists",
  "outreachCampaigns",
  "outreachSequenceSteps",
  "outreachAttempts",
  "outreachReplies",
  "outreachBounces",
  "outreachSuppressions",
  "outreachUnsubscribes"
];
// Singleton (single-object) collection: outreach config (postal address, caps, identity).
export const OUTREACH_SINGLETON_COLLECTIONS = ["outreachConfig"];

// Conservative defaults (§6). Overridable via outreachConfig.caps.
export const DEFAULT_OUTREACH_CAPS = {
  dailyCap: 25,            // global sends/day during warm-up
  perDomainPerDay: 2,      // don't hammer one org
  perClassificationPerDay: 10,
  maxTouches: 5,           // max sequence length per contact
  minSpacingBusinessDays: 2,
  windowStartHourET: 8,
  windowEndHourET: 17,     // exclusive upper bound (last send hour is 16:xx)
  weekdaysOnly: true
};

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeEmail(email = "") {
  return lower(email);
}
export function domainOfEmail(email = "") {
  const at = normalizeEmail(email).split("@");
  return at.length === 2 ? at[1] : "";
}

const ROLE_ACCOUNTS = new Set([
  "info", "admin", "sales", "support", "noreply", "no-reply", "donotreply",
  "postmaster", "abuse", "webmaster", "hostmaster", "marketing", "contact", "hello"
]);
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "trashmail.com", "yopmail.com", "throwaway.email", "getnada.com"
]);
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isBadDomain(email = "") {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) return true;
  const localPart = normalized.split("@")[0];
  if (ROLE_ACCOUNTS.has(localPart)) return true;
  if (DISPOSABLE_DOMAINS.has(domainOfEmail(normalized))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 2. SUPPRESSION — authoritative gate, all 8 reasons, extends RCAP suppression.
// ---------------------------------------------------------------------------
// Returns { suppressed: boolean, reason: string }. Reason is the FIRST matching cause.
export function isSuppressed(contact = {}, context = {}) {
  const state = context.state || {};
  const email = normalizeEmail(contact.email);

  // (1) do-not-contact — explicit manual flag.
  if (contact.do_not_contact === true) return { suppressed: true, reason: "do_not_contact" };

  // (2) replied — any inbound reply halts further sends.
  if (contact.replied === true || hasReply(state, contact)) {
    return { suppressed: true, reason: "replied" };
  }

  // (3) unsubscribed + (4) bounced + status — reuse the RCAP sticky suppression check.
  if (contact.unsubscribed === true) return { suppressed: true, reason: "unsubscribed" };
  if (contact.bounced === true) return { suppressed: true, reason: "bounced" };
  if (isRcapContactSuppressed(contact)) {
    const status = lower(contact.suppression_status);
    if (/unsub/.test(status)) return { suppressed: true, reason: "unsubscribed" };
    if (/bounc/.test(status)) return { suppressed: true, reason: "bounced" };
    return { suppressed: true, reason: "manually_suppressed" };
  }

  // (5) existing customer / partner — never cold-email someone you already work with.
  if (contact.is_customer === true || isExistingRelationship(state, contact, context.org)) {
    return { suppressed: true, reason: "existing_customer" };
  }

  // (6) manually suppressed — ledger entry or flag.
  if (contact.manually_suppressed === true || inSuppressionLedger(state, contact)) {
    return { suppressed: true, reason: "manually_suppressed" };
  }

  // (7) bad domain — syntactic / role-account / disposable.
  if (isBadDomain(email)) return { suppressed: true, reason: "bad_domain" };

  // (8) duplicate — flagged during list dedup.
  if (contact.is_duplicate === true) return { suppressed: true, reason: "duplicate" };

  return { suppressed: false, reason: "" };
}

function hasReply(state = {}, contact = {}) {
  const id = clean(contact.contact_id);
  const email = normalizeEmail(contact.email);
  return list(state.outreachReplies).some(
    (r) => (id && clean(r.contact_id) === id) || (email && normalizeEmail(r.from_email) === email)
  );
}

function inSuppressionLedger(state = {}, contact = {}) {
  const id = clean(contact.contact_id);
  const email = normalizeEmail(contact.email);
  return list(state.outreachSuppressions).some(
    (s) => (id && clean(s.contact_id) === id) || (email && normalizeEmail(s.email) === email)
  );
}

function isExistingRelationship(state = {}, contact = {}, org = {}) {
  const email = normalizeEmail(contact.email);
  const domain = domainOfEmail(email);
  if (!email && !domain) return false;
  const matches = (rec) => {
    const recEmail = normalizeEmail(rec.email || rec.contactEmail || rec.contact_email);
    const recDomain = recEmail ? domainOfEmail(recEmail) : lower(rec.domain || rec.website || "");
    return (email && recEmail === email) || (domain && recDomain && recDomain.includes(domain));
  };
  return list(state.partners).some(matches) || list(state.pilots).some(matches);
}

// Sticky suppression: append a ledger entry and stamp the contact so it stays suppressed.
export function recordSuppression(state = {}, { contactId = "", email = "", reason = "manually_suppressed", source = "system" } = {}, now = nowIso()) {
  const next = { ...state };
  const entry = {
    id: `outreach-supp-${shortId()}`,
    contact_id: clean(contactId),
    email: normalizeEmail(email),
    reason,
    source,
    created_at: now
  };
  next.outreachSuppressions = [entry, ...list(state.outreachSuppressions)];
  next.outreachContacts = list(state.outreachContacts).map((c) => {
    if (clean(c.contact_id) !== clean(contactId) && normalizeEmail(c.email) !== normalizeEmail(email)) return c;
    const patch = { ...c, updated_at: now };
    if (reason === "unsubscribed") { patch.unsubscribed = true; patch.suppression_status = "Unsubscribed"; }
    else if (reason === "bounced") { patch.bounced = true; patch.suppression_status = "Bounced"; }
    else if (reason === "replied") { patch.replied = true; }
    else { patch.manually_suppressed = true; patch.suppression_status = patch.suppression_status || "Suppressed"; }
    patch.sequence_status = "Not Enrolled";
    return patch;
  });
  return next;
}

// ---------------------------------------------------------------------------
// 3. CAN-SPAM COMPLIANCE — assembleCompliantMessage is the ONLY message builder.
// ---------------------------------------------------------------------------
function outreachSigningSecret(env = process.env) {
  return env.OUTREACH_SIGNING_SECRET
    || env.COMMAND_CENTER_CRON_TOKEN
    || env.COMMAND_CENTER_OWNER_TOKEN
    || "outreach-dev-secret-change-me";
}

export function signUnsubscribeToken(payload = {}, env = process.env) {
  const body = { ...payload, issuedAt: Date.now(), nonce: crypto.randomBytes(8).toString("hex") };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", outreachSigningSecret(env)).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyUnsubscribeToken(token = "", env = process.env) {
  if (!token || !token.includes(".")) return { ok: false, error: "Malformed token." };
  const [encoded, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", outreachSigningSecret(env)).update(encoded).digest("base64url");
  if (Buffer.byteLength(sig || "") !== Buffer.byteLength(expected)) return { ok: false, error: "Bad signature." };
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false, error: "Bad signature." };
  try {
    return { ok: true, payload: JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) };
  } catch {
    return { ok: false, error: "Unreadable token." };
  }
}

// The -prod public host is the ONLY correct base for outbound links (stale-host webhook /
// unsubscribe URLs silently drop compliance signals — see render-deploy-gotchas).
export const PROD_PUBLIC_BASE = "https://legalease-command-center-prod.onrender.com";

export function outreachConfigOf(state = {}) {
  const cfg = state.outreachConfig || {};
  return {
    ...cfg,
    caps: { ...DEFAULT_OUTREACH_CAPS, ...(cfg.caps || {}) }
  };
}

// THROWS if the postal address is unset: no compliant message can be built, so none can
// ever be sent. This is the structural CAN-SPAM guarantee.
export function assembleCompliantMessage({ contact = {}, org = {}, step = {}, config = {}, baseUrl = PROD_PUBLIC_BASE, env = process.env } = {}) {
  const postalAddress = clean(config.postalAddress);
  if (!postalAddress) {
    throw new Error("CAN-SPAM: postal address is required to assemble any outreach message (set outreachConfig.postalAddress).");
  }
  const fromEmail = clean(config.fromEmail);
  const replyTo = clean(config.replyTo || config.fromEmail);
  if (!fromEmail) {
    throw new Error("CAN-SPAM: a real From address is required (set outreachConfig.fromEmail).");
  }
  const toEmail = normalizeEmail(contact.email);
  const subject = clean(step.subject);
  const bodyText = clean(step.body);

  const token = signUnsubscribeToken({ contact_id: contact.contact_id || "", email: toEmail, campaign_id: step.campaign_id || "" }, env);
  const unsubscribeUrl = `${String(baseUrl).replace(/\/+$/, "")}/api/outreach/unsubscribe?token=${encodeURIComponent(token)}`;

  const footer = [
    "",
    "—",
    clean(config.fromName || org.organization_name || "LegalEase"),
    postalAddress,
    `Unsubscribe: ${unsubscribeUrl}`
  ].join("\n");

  return {
    to: toEmail,
    from: fromEmail,
    fromName: clean(config.fromName),
    replyTo,
    subject,
    text: `${bodyText}\n${footer}`,
    headers: {
      // Gmail/Yahoo one-click unsubscribe (2024 bulk-sender rules).
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    },
    unsubscribeUrl,
    postalAddress,
    contact_id: contact.contact_id || "",
    campaign_id: step.campaign_id || "",
    step_number: step.step_number || 1
  };
}

// Hard precondition the send path calls. Returns { ok, errors[] }.
export function validateCompliance(message = {}) {
  const errors = [];
  if (!clean(message.postalAddress)) errors.push("missing_postal_address");
  if (!clean(message.from)) errors.push("missing_from");
  if (!clean(message.to) || isBadDomain(message.to)) errors.push("invalid_recipient");
  if (!clean(message.subject)) errors.push("missing_subject");
  if (isDeceptiveSubject(message.subject)) errors.push("deceptive_subject");
  if (!message.headers || !clean(message.headers["List-Unsubscribe"])) errors.push("missing_list_unsubscribe");
  if (!message.headers || !/one-click/i.test(clean(message.headers["List-Unsubscribe-Post"]))) errors.push("missing_one_click");
  if (!clean(message.unsubscribeUrl)) errors.push("missing_unsubscribe_link");
  if (!clean(message.text) || !clean(message.text).includes(clean(message.postalAddress))) errors.push("address_not_in_body");
  return { ok: errors.length === 0, errors };
}

function isDeceptiveSubject(subject = "") {
  const s = clean(subject);
  if (!s) return false;
  if (/^(re|fwd?):/i.test(s)) return true;                       // fake reply/forward
  const letters = s.replace(/[^a-z]/gi, "");
  if (letters.length >= 6 && letters === letters.toUpperCase()) return true; // shouty all-caps
  return false;
}

// ---------------------------------------------------------------------------
// 4 + 6. CAPS / SENDING WINDOW — conservative, enforced at queue AND send.
// ---------------------------------------------------------------------------
function weekdayOfDateKey(dateKey = "") {
  // Noon UTC on the ET calendar date avoids any TZ rollover; getUTCDay: 0=Sun..6=Sat.
  const d = new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? 0 : d.getUTCDay();
}

export function withinSendingWindow(caps = DEFAULT_OUTREACH_CAPS, parts = etParts()) {
  const dow = weekdayOfDateKey(parts.dateKey);
  if (caps.weekdaysOnly && (dow === 0 || dow === 6)) return false; // no weekends
  return parts.hour >= caps.windowStartHourET && parts.hour < caps.windowEndHourET;
}

// Tally of sends already made today (status sent or dry_run), global + per-domain + per-class.
export function todaysSendTally(state = {}, parts = etParts()) {
  const today = parts.dateKey;
  const sentToday = list(state.outreachAttempts).filter(
    (a) => ["sent", "dry_run"].includes(lower(a.status)) && clean(a.sent_date) === today
  );
  const perDomain = {};
  const perClass = {};
  for (const a of sentToday) {
    const dom = domainOfEmail(a.to || a.email);
    if (dom) perDomain[dom] = (perDomain[dom] || 0) + 1;
    const cls = lower(a.classification);
    if (cls) perClass[cls] = (perClass[cls] || 0) + 1;
  }
  return { total: sentToday.length, perDomain, perClass };
}

// Returns { ok, reason }. tally is mutated by the caller as it commits sends in a batch.
export function capCheck({ contact = {}, classification = "", caps = DEFAULT_OUTREACH_CAPS, tally, parts = etParts() } = {}) {
  if (!withinSendingWindow(caps, parts)) return { ok: false, reason: "outside_window" };
  if (tally.total >= caps.dailyCap) return { ok: false, reason: "daily_cap" };
  const dom = domainOfEmail(contact.email);
  if (dom && (tally.perDomain[dom] || 0) >= caps.perDomainPerDay) return { ok: false, reason: "per_domain_cap" };
  const cls = lower(classification);
  if (cls && (tally.perClass[cls] || 0) >= caps.perClassificationPerDay) return { ok: false, reason: "per_classification_cap" };
  return { ok: true, reason: "" };
}

function commitTally(tally, contact = {}, classification = "") {
  tally.total += 1;
  const dom = domainOfEmail(contact.email);
  if (dom) tally.perDomain[dom] = (tally.perDomain[dom] || 0) + 1;
  const cls = lower(classification);
  if (cls) tally.perClass[cls] = (tally.perClass[cls] || 0) + 1;
}

// Touches already sent for a contact in a campaign, and the last send timestamp.
function touchesFor(state = {}, contactId = "", campaignId = "") {
  const attempts = list(state.outreachAttempts).filter(
    (a) => clean(a.contact_id) === clean(contactId)
      && clean(a.campaign_id) === clean(campaignId)
      && ["sent", "dry_run"].includes(lower(a.status))
  );
  const lastAt = attempts.map((a) => Date.parse(a.created_at || a.sent_at || "")).filter((n) => !Number.isNaN(n)).sort((x, y) => y - x)[0] || 0;
  return { count: attempts.length, lastAt };
}

function spacingElapsed(lastAt = 0, minBusinessDays = 2, now = Date.now()) {
  if (!lastAt) return true;
  // Approximate business-day spacing as calendar days * (5/7) is fragile; use a simple,
  // conservative floor: require at least minBusinessDays calendar days elapsed.
  const days = (now - lastAt) / (24 * 60 * 60 * 1000);
  return days >= minBusinessDays;
}

// ---------------------------------------------------------------------------
// 5. QUEUE-THEN-APPROVE — plan() queues; act() sends approved+compliant+unsuppressed+capped.
// ---------------------------------------------------------------------------
export const OUTREACH_ENGINE_ID = "outreach-sequencer";
export const OUTREACH_QUEUE_TYPE = "outreach_message";

function nowIso() { return new Date().toISOString(); }
function shortId() { return crypto.randomBytes(5).toString("hex"); }

// plan(): pure. Compute due touches, exclude suppressed/non-compliant/over-cap, queue the
// rest as approval proposals. NEVER sends.
export function planOutreach(state = {}, ctx = {}) {
  const env = ctx.env || process.env;
  const parts = ctx.etParts || etParts(ctx.now || new Date());
  const config = outreachConfigOf(state);
  const caps = config.caps;
  const nowMs = (ctx.now ? new Date(ctx.now).getTime() : Date.now());

  let next = { ...state, approvalQueue: list(state.approvalQueue).slice() };
  const proposals = [];
  const observations = [];
  const tally = todaysSendTally(state, parts);

  const alreadyQueued = new Set(
    next.approvalQueue
      .filter((q) => q.type === OUTREACH_QUEUE_TYPE && !["approved", "sent", "archived", "rejected"].includes(lower(q.status)))
      .map((q) => `${clean(q.contact_id)}::${clean(q.campaign_id)}::${q.step_number}`)
  );

  const orgById = new Map(list(state.outreachOrganizations).map((o) => [clean(o.account_id || o.organization_id || o.id), o]));
  const stepsByCampaign = groupBy(list(state.outreachSequenceSteps), (s) => clean(s.campaign_id));

  for (const campaign of list(state.outreachCampaigns)) {
    if (lower(campaign.status) && !["active", "running"].includes(lower(campaign.status))) continue;
    const campaignId = clean(campaign.campaign_id || campaign.id);
    const steps = (stepsByCampaign.get(campaignId) || []).slice().sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
    if (!steps.length) continue;

    const enrolled = list(state.outreachContacts).filter(
      (c) => clean(c.campaign_id) === campaignId || isEnrolledIn(c, campaignId)
    );

    for (const contact of enrolled) {
      const org = orgById.get(clean(contact.linked_account_id)) || {};
      const supp = isSuppressed(contact, { state, org });
      if (supp.suppressed) { observations.push({ type: "skip_suppressed", contact_id: contact.contact_id, reason: supp.reason }); continue; }

      const { count, lastAt } = touchesFor(state, contact.contact_id, campaignId);
      if (count >= caps.maxTouches) { observations.push({ type: "sequence_complete", contact_id: contact.contact_id }); continue; }
      if (!spacingElapsed(lastAt, caps.minSpacingBusinessDays, nowMs)) { observations.push({ type: "spacing_wait", contact_id: contact.contact_id }); continue; }

      const step = steps[count] || steps[steps.length - 1];
      const key = `${clean(contact.contact_id)}::${campaignId}::${step.step_number}`;
      if (alreadyQueued.has(key)) continue;

      let message;
      try {
        message = assembleCompliantMessage({ contact, org, step: { ...step, campaign_id: campaignId }, config, baseUrl: config.publicBaseUrl || PROD_PUBLIC_BASE, env });
      } catch (error) {
        observations.push({ type: "compliance_blocked_assembly", reason: String(error.message || error) });
        continue; // e.g. no postal address — nothing can be built or sent
      }
      const compliance = validateCompliance(message);
      if (!compliance.ok) { observations.push({ type: "compliance_invalid", contact_id: contact.contact_id, errors: compliance.errors }); continue; }

      const cap = capCheck({ contact, classification: contact.classification || campaign.classification, caps, tally, parts });
      if (!cap.ok) { observations.push({ type: "cap_blocked", contact_id: contact.contact_id, reason: cap.reason }); continue; }
      commitTally(tally, contact, contact.classification || campaign.classification);

      const queueItem = {
        id: `outreach-q-${shortId()}`,
        type: OUTREACH_QUEUE_TYPE,
        status: "queued_for_approval",
        contact_id: contact.contact_id,
        campaign_id: campaignId,
        step_number: step.step_number,
        classification: contact.classification || campaign.classification || "",
        to: message.to,
        subject: message.subject,
        message,
        created_at: nowIso(),
        title: `Outreach: ${contact.contact_name || message.to} — step ${step.step_number}`
      };
      next.approvalQueue = [queueItem, ...next.approvalQueue];
      proposals.push(queueItem);
      alreadyQueued.add(key);
    }
  }

  return { state: next, proposals, observations };
}

// act(): runs ONLY when autopilot is ON (the heartbeat gates this). Sends ONLY messages that
// are approved AND (re-checked) unsuppressed + compliant + within caps. The live network
// send is delegated to ctx.runOutreachSend; absent/dry-run => NO real send.
export async function actOutreach(state = {}, ctx = {}) {
  const env = ctx.env || process.env;
  const parts = ctx.etParts || etParts(ctx.now || new Date());
  const config = outreachConfigOf(state);
  const caps = config.caps;

  let next = { ...state, approvalQueue: list(state.approvalQueue).slice(), outreachAttempts: list(state.outreachAttempts).slice() };
  const results = [];
  const tally = todaysSendTally(state, parts);

  const approved = next.approvalQueue.filter((q) => q.type === OUTREACH_QUEUE_TYPE && lower(q.status) === "approved");
  const contactsById = new Map(list(state.outreachContacts).map((c) => [clean(c.contact_id), c]));
  const orgById = new Map(list(state.outreachOrganizations).map((o) => [clean(o.account_id || o.organization_id || o.id), o]));

  for (const item of approved) {
    const contact = contactsById.get(clean(item.contact_id)) || { email: item.to, contact_id: item.contact_id };
    const org = orgById.get(clean(contact.linked_account_id)) || {};

    // Re-check suppression at SEND time (status can change between queue and send).
    const supp = isSuppressed(contact, { state, org });
    if (supp.suppressed) {
      markQueue(next, item.id, "rejected", { reject_reason: `suppressed:${supp.reason}` });
      results.push({ contact_id: item.contact_id, status: "blocked", reason: `suppressed:${supp.reason}` });
      continue;
    }
    // Re-validate compliance at SEND time.
    const compliance = validateCompliance(item.message || {});
    if (!compliance.ok) {
      markQueue(next, item.id, "rejected", { reject_reason: `compliance:${compliance.errors.join(",")}` });
      results.push({ contact_id: item.contact_id, status: "blocked", reason: "compliance" });
      continue;
    }
    // Re-check caps at SEND time.
    const cap = capCheck({ contact, classification: item.classification, caps, tally, parts });
    if (!cap.ok) {
      results.push({ contact_id: item.contact_id, status: "deferred", reason: cap.reason });
      continue; // leave approved; a later in-window tick can send it
    }

    // DELEGATED SEND. No dep, or dry-run => record an attempt, perform NO network send.
    let sendOutcome = { status: "dry_run", provider: "none" };
    if (typeof ctx.runOutreachSend === "function") {
      try {
        const r = (await ctx.runOutreachSend(item.message, { env })) || {};
        sendOutcome = { status: lower(r.status) === "sent" ? "sent" : (r.status || "dry_run"), provider: r.provider || "unknown", provider_message_id: r.provider_message_id || "" };
      } catch (error) {
        markQueue(next, item.id, "approved", {}); // leave for retry
        results.push({ contact_id: item.contact_id, status: "error", reason: String(error.message || error) });
        continue;
      }
    }

    const attempt = {
      id: `outreach-attempt-${shortId()}`,
      contact_id: item.contact_id,
      campaign_id: item.campaign_id,
      step_number: item.step_number,
      to: item.to,
      classification: item.classification || "",
      status: sendOutcome.status,            // "sent" only when a live provider actually sent
      provider: sendOutcome.provider,
      provider_message_id: sendOutcome.provider_message_id || "",
      sent_date: parts.dateKey,
      created_at: nowIso()
    };
    next.outreachAttempts = [attempt, ...next.outreachAttempts];
    commitTally(tally, contact, item.classification);
    markQueue(next, item.id, "sent", { sent_at: nowIso(), attempt_id: attempt.id });
    results.push({ contact_id: item.contact_id, status: sendOutcome.status, provider: sendOutcome.provider });
  }

  return { state: next, results };
}

function markQueue(state, id, status, patch = {}) {
  state.approvalQueue = list(state.approvalQueue).map((q) => (q.id === id ? { ...q, status, ...patch, updated_at: nowIso() } : q));
}
function isEnrolledIn(contact = {}, campaignId = "") {
  return list(contact.enrolled_campaigns).map((x) => clean(x)).includes(clean(campaignId))
    && /enroll/i.test(lower(contact.sequence_status));
}
function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

// ---------------------------------------------------------------------------
// Heartbeat engine descriptor. autopilot OFF by default is enforced by heartbeat.mjs.
// ---------------------------------------------------------------------------
export function buildOutreachEngine(deps = {}) {
  return {
    id: OUTREACH_ENGINE_ID,
    cadence: "hourly",
    plan(state, ctx) {
      return planOutreach(state, ctx);
    },
    async act(state, ctx) {
      // ctx.runOutreachSend injected by the server; absent => dry-run (no network send).
      return actOutreach(state, { ...ctx, runOutreachSend: deps.runOutreachSend });
    }
  };
}
