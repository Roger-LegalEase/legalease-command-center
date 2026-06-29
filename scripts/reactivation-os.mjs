// MVP Reactivation OS — consumer (B2C) re-engagement campaign. SEPARATE subsystem from the RCAP
// B2 outreach OS (outreach-os.mjs): its own collections, its own live-send gate
// (REACTIVATION_LIVE_SEND), its own wave engine and threshold monitor. It REUSES B2's tested
// safety primitives so consumer sends inherit the same guarantees:
//   - isSuppressed() / recordSuppression()  — the authoritative 8-reason suppression gate.
//   - assembleCompliantMessage() / validateCompliance() — CAN-SPAM (Dover DE postal baked in),
//     HMAC unsubscribe, List-Unsubscribe one-click headers, signature + UPL disclaimer.
//   - withinSendingWindow() — ET weekday business-hours window.
//
// FOUR independent gates stand between this module and a real consumer email:
//   1. REACTIVATION_LIVE_SEND env flag (default OFF => dry-run, no network send).
//   2. Engine autopilot toggle (default OFF => act() never runs).
//   3. Wave release (a wave's contacts are inert until the operator releases that wave).
//   4. Stop-threshold monitor (auto-pauses the whole campaign if bounce/complaint/unsub trip).
// The seed test (Touch 0 to Roger only) renders copy through the SAME assembly path without
// touching any consumer.

import crypto from "node:crypto";
import { etParts } from "./heartbeat.mjs";
import {
  isSuppressed, recordSuppression, normalizeEmail, domainOfEmail, isBadDomain,
  assembleCompliantMessage, validateCompliance, withinSendingWindow,
  OUTREACH_IDENTITY_DEFAULTS, PROD_PUBLIC_BASE, outreachConfigOf
} from "./outreach-os.mjs";
import {
  REACTIVATION_CADENCE_DAYS, REACTIVATION_CTA_URL, REACTIVATION_MAX_TOUCHES,
  getReactivationTouch
} from "./reactivation-sequences.mjs";

// ---------------------------------------------------------------------------
// 1. DATA MODEL — single source of truth (MUST mirror storage.mjs coreStateCollections).
// ---------------------------------------------------------------------------
export const REACTIVATION_COLLECTIONS = [
  "reactivationContacts",
  "reactivationAttempts",
  "reactivationEvents"      // delivered / bounce / spamreport / click / unsubscribe (from SendGrid webhook)
];
export const REACTIVATION_SINGLETON_COLLECTIONS = ["reactivationCampaign"];

export const REACTIVATION_ENGINE_ID = "reactivation-sequencer";
export const REACTIVATION_CAMPAIGN_ID = "mvp-reactivation";

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);
function nowIso() { return new Date().toISOString(); }
function shortId() { return crypto.randomBytes(5).toString("hex"); }

// The single REACTIVATION_LIVE_SEND gate reader (default OFF). Mirrors outreachLiveSendEnabled.
export function reactivationLiveSendEnabled(env = process.env) {
  return ["true", "1", "yes", "on"].includes(String((env || {}).REACTIVATION_LIVE_SEND || "").toLowerCase());
}

// Stable contact id derived from the normalized email (idempotent import / dedup key).
export function contactIdForEmail(email = "") {
  const norm = normalizeEmail(email);
  return `react-${crypto.createHash("sha1").update(norm).digest("hex").slice(0, 16)}`;
}

// Coarse provider bucket used for domain stratification + per-wave reporting.
export function providerBucket(emailOrDomain = "") {
  const d = lower(emailOrDomain).includes("@") ? domainOfEmail(emailOrDomain) : lower(emailOrDomain);
  if (/gmail\.|googlemail\.|google\.com/.test(d)) return "gmail";
  if (/yahoo\.|ymail\.|rocketmail\.|myyahoo\./.test(d)) return "yahoo";
  if (/(hotmail|outlook|live|msn)\./.test(d)) return "outlook";
  if (/icloud\.|me\.com|mac\.com/.test(d)) return "icloud";
  if (/aol\./.test(d)) return "aol";
  return "other";
}

// ---------------------------------------------------------------------------
// 2. CONFIG — wave plan, caps, stop-thresholds. Overridable via state.reactivationCampaign.
// ---------------------------------------------------------------------------
export const DEFAULT_REACTIVATION_CONFIG = Object.freeze({
  campaignId: REACTIVATION_CAMPAIGN_ID,
  // Aggressive-but-staged ramp (29-yr domain). plannedSize null => remainder.
  waves: [
    { wave: 1, plannedSize: 300 },   // warm 48 + ~250
    { wave: 2, plannedSize: 700 },
    { wave: 3, plannedSize: 1200 },
    { wave: 4, plannedSize: null }   // remainder
  ],
  caps: {
    // Intraday spread: at most N sends per hourly tick (no all-at-once burst). 150/tick x the
    // 9-hour ET window (8..16) = up to ~1,350/day, so even Wave 3 (~1,200) lands within a single
    // business day, stratified by domain — the "aggressive ramp, spread over the day" intent.
    // Conservative-but-tunable: lower it to slow the ramp, raise it to compress further.
    perTickMax: 150,
    perWaveDayCap: 1400,       // ceiling on sends in a single day (covers the largest single-day wave)
    maxTouches: REACTIVATION_MAX_TOUCHES, // 5
    minSpacingDays: 2,         // floor between touches for one contact
    windowStartHourET: 8,
    windowEndHourET: 17,
    weekdaysOnly: true
  },
  cadenceDays: REACTIVATION_CADENCE_DAYS, // [1,4,9,16,30]
  ctaUrl: REACTIVATION_CTA_URL,
  // Stop-thresholds (rates, evaluated once minSampleSize sends have gone out). Trip => auto-pause.
  thresholds: { hard_bounce: 0.02, spam_complaint: 0.001, unsubscribe: 0.025 },
  minSampleSize: 100
});

export function reactivationCampaignOf(state = {}) {
  const c = state.reactivationCampaign || {};
  return {
    ...DEFAULT_REACTIVATION_CONFIG,
    ...c,
    caps: { ...DEFAULT_REACTIVATION_CONFIG.caps, ...(c.caps || {}) },
    thresholds: { ...DEFAULT_REACTIVATION_CONFIG.thresholds, ...(c.thresholds || {}) },
    waves: Array.isArray(c.waves) && c.waves.length ? c.waves : DEFAULT_REACTIVATION_CONFIG.waves,
    status: c.status || "staged",                 // staged | active | paused
    releasedWaves: list(c.releasedWaves),         // wave numbers the operator has released
    autoAdvanceWaves: c.autoAdvanceWaves === true, // default false — operator releases each wave
    pausedReason: c.pausedReason || ""
  };
}

// ---------------------------------------------------------------------------
// 3. LIST IMPORT — idempotent upsert of the verified-clean MVP list into reactivationContacts.
//    Honors suppression, drops bad/duplicate emails, stamps provider bucket + priority. Does NOT
//    enroll or send — contacts are inert until their wave is released.
// ---------------------------------------------------------------------------
// rows: [{ email, first_name, full_name, phone, priority, domain }] (priority: warm|cold|never_logged_in)
export function importReactivationContacts(state = {}, rows = [], { now = nowIso() } = {}) {
  const existing = new Map(list(state.reactivationContacts).map((c) => [clean(c.contact_id), c]));
  const seenEmail = new Set();
  let added = 0, updated = 0, skippedBad = 0, skippedDup = 0, skippedSuppressed = 0;

  for (const raw of list(rows)) {
    const email = normalizeEmail(raw.email);
    if (!email || isBadDomain(email)) { skippedBad++; continue; }
    if (seenEmail.has(email)) { skippedDup++; continue; }
    seenEmail.add(email);

    const contactId = contactIdForEmail(email);
    const supp = isSuppressed({ email, contact_id: contactId }, { state });
    const base = existing.get(contactId) || {};
    const contact = {
      contact_id: contactId,
      email,
      first_name: clean(raw.first_name) || clean(raw.full_name).split(/\s+/)[0] || "",
      full_name: clean(raw.full_name),
      phone: clean(raw.phone),
      domain: domainOfEmail(email),
      provider: providerBucket(email),
      priority: clean(raw.priority) || "cold",
      campaign_id: REACTIVATION_CAMPAIGN_ID,
      // Preserve any send/signal state on re-import.
      wave: base.wave || null,
      enrolled_at: base.enrolled_at || "",
      sequence_status: base.sequence_status || "Not Enrolled",
      replied: base.replied || false,
      clicked: base.clicked || false,
      converted: base.converted || false,
      unsubscribed: base.unsubscribed || false,
      bounced: base.bounced || false,
      complained: base.complained || false,
      do_not_contact: base.do_not_contact || false,
      // If suppressed at import (e.g. prior unsubscribe/bounce), mark it so it never enrolls.
      suppressed_at_import: supp.suppressed ? supp.reason : "",
      updated_at: now,
      created_at: base.created_at || now
    };
    if (supp.suppressed) skippedSuppressed++;
    if (existing.has(contactId)) updated++; else added++;
    existing.set(contactId, contact);
  }

  return {
    state: { ...state, reactivationContacts: [...existing.values()] },
    summary: { total: existing.size, added, updated, skippedBad, skippedDup, skippedSuppressed }
  };
}

// ---------------------------------------------------------------------------
// 4. WAVE ASSIGNMENT — domain-stratified so NO wave is all-Gmail. Warm contacts pinned to Wave 1;
//    the rest are interleaved across provider buckets (round-robin) then sliced by wave size, so
//    each contiguous wave slice carries ~the overall provider mix. Deterministic (no randomness).
// ---------------------------------------------------------------------------
export function assignWaves(contacts = [], config = DEFAULT_REACTIVATION_CONFIG) {
  const eligible = list(contacts).filter((c) => !c.suppressed_at_import && !isSuppressed(c, {}).suppressed);
  const warm = eligible.filter((c) => lower(c.priority).startsWith("warm"));
  const rest = eligible.filter((c) => !lower(c.priority).startsWith("warm"));

  // Round-robin interleave `rest` by provider bucket so any prefix is provider-balanced.
  const buckets = new Map();
  for (const c of rest) {
    const b = c.provider || providerBucket(c.email);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(c);
  }
  // Order buckets largest-first for stable interleave; stable sort within bucket by email.
  const bucketLists = [...buckets.values()]
    .map((arr) => arr.slice().sort((a, b) => a.email.localeCompare(b.email)))
    .sort((a, b) => b.length - a.length);
  const interleaved = [];
  let i = 0;
  while (interleaved.length < rest.length) {
    let advanced = false;
    for (const bl of bucketLists) {
      if (bl[i]) { interleaved.push(bl[i]); advanced = true; }
    }
    if (!advanced) break;
    i++;
  }

  // Warm pinned to the front of the ordering (Wave 1 core), then the balanced remainder.
  const ordered = [...warm.sort((a, b) => a.email.localeCompare(b.email)), ...interleaved];

  // Slice by wave plannedSize; null = remainder (everything left).
  const waves = list(config.waves);
  const assignment = new Map(); // contact_id -> wave
  let cursor = 0;
  for (let w = 0; w < waves.length; w++) {
    const plan = waves[w];
    const isLast = w === waves.length - 1 || plan.plannedSize == null;
    const size = isLast ? ordered.length - cursor : Math.min(plan.plannedSize, ordered.length - cursor);
    for (let k = 0; k < size; k++) assignment.set(ordered[cursor + k].contact_id, plan.wave);
    cursor += size;
    if (cursor >= ordered.length) break;
  }
  return assignment; // Map(contact_id -> waveNumber)
}

// Persist wave assignments onto contacts (call after import). Returns new state + per-wave sizes.
export function applyWaveAssignment(state = {}, config = reactivationCampaignOf(state), { now = nowIso() } = {}) {
  const assignment = assignWaves(state.reactivationContacts, config);
  const sizes = {};
  const contacts = list(state.reactivationContacts).map((c) => {
    const wave = assignment.get(c.contact_id) || null;
    if (wave) sizes[wave] = (sizes[wave] || 0) + 1;
    return wave === c.wave ? c : { ...c, wave, updated_at: now };
  });
  return { state: { ...state, reactivationContacts: contacts }, waveSizes: sizes };
}

// Release a wave: enroll its (unsuppressed) contacts so the cadence clock starts. This is the
// per-wave HUMAN gate — contacts are inert until released. Returns new state + count enrolled.
export function releaseWave(state = {}, waveNumber, { now = nowIso() } = {}) {
  const campaign = reactivationCampaignOf(state);
  let enrolled = 0;
  const contacts = list(state.reactivationContacts).map((c) => {
    if (Number(c.wave) !== Number(waveNumber)) return c;
    if (c.suppressed_at_import || isSuppressed(c, { state }).suppressed) return c;
    if (c.enrolled_at) return c; // already enrolled (idempotent)
    enrolled++;
    return { ...c, sequence_status: "Enrolled", enrolled_at: now, updated_at: now };
  });
  const released = Array.from(new Set([...campaign.releasedWaves, Number(waveNumber)]));
  return {
    state: {
      ...state,
      reactivationContacts: contacts,
      reactivationCampaign: { ...(state.reactivationCampaign || {}), campaignId: REACTIVATION_CAMPAIGN_ID, status: "active", releasedWaves: released }
    },
    enrolled
  };
}

// ---------------------------------------------------------------------------
// 5. STOP-THRESHOLD MONITOR — bounce / complaint / unsubscribe rates. Trip => pause campaign.
// ---------------------------------------------------------------------------
export function campaignRates(state = {}) {
  const attempts = list(state.reactivationAttempts).filter((a) => lower(a.status) === "sent");
  const sent = attempts.length;
  const events = list(state.reactivationEvents);
  const count = (types) => events.filter((e) => types.includes(lower(e.type))).length;
  const hardBounces = count(["bounce", "dropped", "blocked"]);
  const complaints = count(["spamreport", "complaint"]);
  const unsubs = count(["unsubscribe", "group_unsubscribe"]);
  const rate = (n) => (sent > 0 ? n / sent : 0);
  return {
    sent,
    delivered: count(["delivered"]),
    clicks: count(["click"]),
    hardBounces, complaints, unsubs,
    hard_bounce: rate(hardBounces),
    spam_complaint: rate(complaints),
    unsubscribe: rate(unsubs)
  };
}

export function evaluateThresholds(state = {}, config = reactivationCampaignOf(state)) {
  const rates = campaignRates(state);
  const t = config.thresholds;
  if (rates.sent < (config.minSampleSize || 0)) {
    return { tripped: false, reasons: [], rates, belowSample: true };
  }
  const reasons = [];
  if (rates.hard_bounce >= t.hard_bounce) reasons.push(`hard_bounce ${(rates.hard_bounce * 100).toFixed(2)}% >= ${(t.hard_bounce * 100).toFixed(2)}%`);
  if (rates.spam_complaint >= t.spam_complaint) reasons.push(`spam_complaint ${(rates.spam_complaint * 100).toFixed(3)}% >= ${(t.spam_complaint * 100).toFixed(3)}%`);
  if (rates.unsubscribe >= t.unsubscribe) reasons.push(`unsubscribe ${(rates.unsubscribe * 100).toFixed(2)}% >= ${(t.unsubscribe * 100).toFixed(2)}%`);
  return { tripped: reasons.length > 0, reasons, rates, belowSample: false };
}

// Per-wave metrics for reporting (sent/delivered/bounced/complaints/unsubs/clicks + domain mix).
export function waveMetrics(state = {}) {
  const contactById = new Map(list(state.reactivationContacts).map((c) => [clean(c.contact_id), c]));
  const emailToContact = new Map(list(state.reactivationContacts).map((c) => [normalizeEmail(c.email), c]));
  const waveOf = (idOrEmail) => {
    const c = contactById.get(clean(idOrEmail)) || emailToContact.get(normalizeEmail(idOrEmail));
    return c ? (c.wave || 0) : 0;
  };
  const waves = {};
  const bump = (w, key, email) => {
    waves[w] = waves[w] || { wave: w, sent: 0, delivered: 0, bounced: 0, complaints: 0, unsubscribes: 0, clicks: 0, byProvider: {} };
    waves[w][key] += 1;
    if (key === "sent" && email) {
      const p = providerBucket(email);
      waves[w].byProvider[p] = (waves[w].byProvider[p] || 0) + 1;
    }
  };
  for (const a of list(state.reactivationAttempts)) {
    if (lower(a.status) !== "sent") continue;
    bump(waveOf(a.contact_id || a.to), "sent", a.to);
  }
  for (const e of list(state.reactivationEvents)) {
    const w = waveOf(e.contact_id || e.email);
    const type = lower(e.type);
    if (type === "delivered") bump(w, "delivered");
    else if (["bounce", "dropped", "blocked"].includes(type)) bump(w, "bounced");
    else if (["spamreport", "complaint"].includes(type)) bump(w, "complaints");
    else if (["unsubscribe", "group_unsubscribe"].includes(type)) bump(w, "unsubscribes");
    else if (type === "click") bump(w, "clicks");
  }
  return waves;
}

// ---------------------------------------------------------------------------
// 6. PER-CONTACT PAUSE SIGNALS — reply / click / convert / unsubscribe / bounce / complaint.
// ---------------------------------------------------------------------------
function contactPaused(contact = {}) {
  return Boolean(contact.replied || contact.clicked || contact.converted || contact.unsubscribed || contact.bounced || contact.complained || contact.do_not_contact);
}

// Apply a SendGrid (or internal) event to campaign state: suppression for hard signals + flag the
// contact so the cadence pauses, and append to reactivationEvents for metrics. Pure reducer the
// server's webhook calls. Returns new state (unchanged if the email isn't a reactivation contact).
export function applyReactivationEvent(state = {}, ev = {}, { now = nowIso() } = {}) {
  const email = normalizeEmail(ev.email);
  if (!email) return state;
  const type = lower(ev.event || ev.type);
  const contact = list(state.reactivationContacts).find((c) => normalizeEmail(c.email) === email);
  if (!contact) return state; // not ours — leave the RCAP/B2 path to handle it
  let next = { ...state };
  next.reactivationEvents = [
    { id: `react-ev-${shortId()}`, contact_id: contact.contact_id, email, type, reason: clean(ev.reason), created_at: now },
    ...list(state.reactivationEvents)
  ].slice(0, 50000);

  const patchContact = (patch) => {
    next.reactivationContacts = list(next.reactivationContacts).map((c) =>
      c.contact_id === contact.contact_id ? { ...c, ...patch, sequence_status: "Paused", updated_at: now } : c);
  };
  if (["bounce", "dropped", "blocked"].includes(type)) {
    next = recordSuppression(next, { contactId: contact.contact_id, email, reason: "bounced", source: "sendgrid_webhook" });
    patchContact({ bounced: true });
  } else if (["unsubscribe", "group_unsubscribe"].includes(type)) {
    next = recordSuppression(next, { contactId: contact.contact_id, email, reason: "unsubscribed", source: "sendgrid_webhook" });
    patchContact({ unsubscribed: true });
  } else if (["spamreport", "complaint"].includes(type)) {
    next = recordSuppression(next, { contactId: contact.contact_id, email, reason: "unsubscribed", source: "spam_complaint" });
    patchContact({ complained: true });
  } else if (type === "click") {
    patchContact({ clicked: true }); // engaged — pause cadence, hand to lifecycle
  }
  return next;
}

// ---------------------------------------------------------------------------
// 7. PLAN / ACT — wave-released, suppression-checked, compliant, capped, threshold-paused sends.
// ---------------------------------------------------------------------------
function reactivationMessageConfig(state = {}) {
  // Reuse the B2 compliance identity (Dover DE postal, From, signature) — same legal footer.
  return outreachConfigOf(state);
}

function todaysReactivationTally(state = {}, parts = etParts()) {
  const today = parts.dateKey;
  const sentToday = list(state.reactivationAttempts).filter(
    (a) => ["sent", "dry_run"].includes(lower(a.status)) && clean(a.sent_date) === today);
  return { total: sentToday.length };
}

function touchesSentFor(state = {}, contactId = "") {
  const attempts = list(state.reactivationAttempts).filter(
    (a) => clean(a.contact_id) === clean(contactId) && ["sent", "dry_run"].includes(lower(a.status)));
  const lastAt = attempts.map((a) => Date.parse(a.created_at || "")).filter((n) => !Number.isNaN(n)).sort((x, y) => y - x)[0] || 0;
  return { count: attempts.length, lastAt };
}

// Which touch is due for a contact, given enrollment date + cadence + touches already sent.
function dueTouch(contact, sentCount, lastAt, cadenceDays, minSpacingDays, nowMs) {
  if (sentCount >= REACTIVATION_MAX_TOUCHES) return null;
  if (!contact.enrolled_at) return null;
  const enrolledMs = Date.parse(contact.enrolled_at);
  if (Number.isNaN(enrolledMs)) return null;
  const stepNumber = sentCount + 1;                 // 1..5
  const dueDay = cadenceDays[sentCount];            // day offset for this touch
  const dayMs = 24 * 60 * 60 * 1000;
  if (nowMs < enrolledMs + dueDay * dayMs) return null;            // not yet due
  if (lastAt && nowMs < lastAt + minSpacingDays * dayMs) return null; // spacing floor
  return stepNumber;
}

// Build the set of due sends for released, active waves. Pure — records observations, NO send.
export function planReactivation(state = {}, ctx = {}) {
  const env = ctx.env || process.env;
  const parts = ctx.etParts || etParts(ctx.now || new Date());
  const config = reactivationCampaignOf(state);
  const nowMs = ctx.now ? new Date(ctx.now).getTime() : Date.now();
  const observations = [];

  // Threshold gate first — if tripped, surface a pause recommendation and queue nothing.
  const thr = evaluateThresholds(state, config);
  if (config.status === "paused") {
    observations.push({ type: "campaign_paused", reason: config.pausedReason || "paused" });
    return { state, proposals: [], observations };
  }
  if (thr.tripped) {
    observations.push({ type: "threshold_tripped", reasons: thr.reasons, rates: thr.rates });
    return { state, proposals: [], observations };
  }

  const releasable = new Set(config.releasedWaves.map(Number));
  const caps = config.caps;
  let budget = Math.min(caps.perTickMax, Math.max(0, caps.perWaveDayCap - todaysReactivationTally(state, parts).total));
  const withinWindow = withinSendingWindow({ ...caps, weekdaysOnly: caps.weekdaysOnly }, parts);
  const due = [];

  for (const contact of list(state.reactivationContacts)) {
    if (!releasable.has(Number(contact.wave))) continue;
    if (!contact.enrolled_at) continue;
    if (contactPaused(contact)) { continue; }
    if (isSuppressed(contact, { state }).suppressed) continue;
    const { count, lastAt } = touchesSentFor(state, contact.contact_id);
    const step = dueTouch(contact, count, lastAt, config.cadenceDays, caps.minSpacingDays, nowMs);
    if (!step) continue;
    due.push({ contact, step });
  }

  if (!withinWindow) {
    observations.push({ type: "outside_window", due: due.length });
    return { state, proposals: [], observations };
  }
  observations.push({ type: "due_sends", due: due.length, budget, releasedWaves: [...releasable] });
  return { state, proposals: due.slice(0, budget), observations };
}

// act(): runs ONLY when autopilot is ON. Sends due touches for released waves, re-checking
// suppression + thresholds + caps + compliance at send time. Live send delegated to
// ctx.runReactivationSend (the server injects runOutreachSend); absent/dry-run => NO network send.
export async function actReactivation(state = {}, ctx = {}) {
  const env = ctx.env || process.env;
  const parts = ctx.etParts || etParts(ctx.now || new Date());
  const config = reactivationCampaignOf(state);
  const messageConfig = { ...reactivationMessageConfig(state), publicBaseUrl: PROD_PUBLIC_BASE };
  let next = { ...state, reactivationAttempts: list(state.reactivationAttempts).slice() };
  const results = [];

  // Auto-pause BEFORE sending if thresholds trip.
  const thr = evaluateThresholds(next, config);
  if (thr.tripped) {
    next.reactivationCampaign = { ...(next.reactivationCampaign || {}), campaignId: REACTIVATION_CAMPAIGN_ID, status: "paused", pausedReason: thr.reasons.join("; "), paused_at: nowIso() };
    return { state: next, results: [{ status: "paused", reason: thr.reasons.join("; ") }] };
  }
  if (config.status === "paused") return { state: next, results: [{ status: "paused", reason: config.pausedReason }] };

  const plan = planReactivation(next, ctx);
  for (const { contact, step } of plan.proposals) {
    // Re-check suppression + pause at SEND time.
    if (contactPaused(contact) || isSuppressed(contact, { state: next }).suppressed) {
      results.push({ contact_id: contact.contact_id, status: "skipped", reason: "suppressed_or_paused" });
      continue;
    }
    const touch = getReactivationTouch(step);
    if (!touch) { results.push({ contact_id: contact.contact_id, status: "not_sent", reason: "no_touch" }); continue; }

    let message;
    try {
      message = assembleCompliantMessage({
        contact: { ...contact, contact_name: contact.full_name || contact.first_name, classification: "" },
        org: {},
        step: { ...touch, campaign_id: REACTIVATION_CAMPAIGN_ID, classification: "" },
        config: messageConfig,
        baseUrl: PROD_PUBLIC_BASE,
        env
      });
    } catch (error) {
      results.push({ contact_id: contact.contact_id, status: "not_sent", reason: `assembly:${error.message}` });
      continue;
    }
    // Re-point the CTA link at the reactivation URL (assembleCompliantMessage renders the
    // [CALENDAR_LINK] token with the calendar URL; for consumers we want the return link).
    message = retargetCta(message, config.ctaUrl, touch);

    const compliance = validateCompliance(message);
    if (!compliance.ok) { results.push({ contact_id: contact.contact_id, status: "not_sent", reason: `compliance:${compliance.errors.join(",")}` }); continue; }

    // DELEGATED SEND. No dep, or dry-run => record an attempt, perform NO network send.
    let sendOutcome = { status: "dry_run", provider: "none" };
    if (typeof ctx.runReactivationSend === "function") {
      try {
        const r = (await ctx.runReactivationSend(message, { env })) || {};
        if (lower(r.status) === "not_sent") { results.push({ contact_id: contact.contact_id, status: "not_sent", reason: r.reason || "not_sent" }); continue; }
        sendOutcome = { status: lower(r.status) === "sent" ? "sent" : (r.status || "dry_run"), provider: r.provider || "unknown", provider_message_id: r.provider_message_id || "" };
      } catch (error) {
        results.push({ contact_id: contact.contact_id, status: "error", reason: String(error.message || error) });
        continue;
      }
    }

    const attempt = {
      id: `react-attempt-${shortId()}`,
      contact_id: contact.contact_id,
      campaign_id: REACTIVATION_CAMPAIGN_ID,
      wave: contact.wave,
      step_number: step,
      to: message.to,
      provider: sendOutcome.provider,
      provider_message_id: sendOutcome.provider_message_id || "",
      status: sendOutcome.status,         // "sent" only when a live provider actually sent
      sent_date: parts.dateKey,
      created_at: nowIso()
    };
    next.reactivationAttempts = [attempt, ...next.reactivationAttempts];
    results.push({ contact_id: contact.contact_id, status: sendOutcome.status, wave: contact.wave, step });
  }
  return { state: next, results };
}

// Swap the rendered CTA link target/label from the calendar default to the reactivation URL.
// assembleCompliantMessage renders [CALENDAR_LINK:label] using CALENDAR_URL; here we replace that
// specific URL with the consumer return URL in both text and html bodies.
function retargetCta(message, ctaUrl, touch) {
  if (!ctaUrl) return message;
  const calMatch = String(touch.body).match(/\[CALENDAR_LINK:([^\]]+)\]/);
  void calMatch;
  // Replace the calendar URL occurrences (text + href) with the reactivation URL.
  const text = String(message.text || "").split(/https:\/\/calendar\.google\.com\/[^\s)]+/).join(ctaUrl);
  const html = String(message.html || "").split(/https:\/\/calendar\.google\.com\/[^"<\s)]+/).join(ctaUrl);
  return { ...message, text, html };
}

// ---------------------------------------------------------------------------
// Heartbeat engine descriptor. autopilot OFF by default (heartbeat.mjs enforces).
// ---------------------------------------------------------------------------
export function buildReactivationEngine(deps = {}) {
  return {
    id: REACTIVATION_ENGINE_ID,
    cadence: "hourly",
    plan(state, ctx) { return planReactivation(state, ctx); },
    async act(state, ctx) {
      return actReactivation(state, { ...ctx, runReactivationSend: deps.runReactivationSend });
    }
  };
}
