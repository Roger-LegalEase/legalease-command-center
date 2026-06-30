// Expungement.ai lifecycle sync — INGEST-ONLY bridge that lets people who interacted with
// Expungement.ai (started/abandoned screening, abandoned checkout, paid, unsubscribed, requested
// deletion, etc.) appear in the Command Center WITHOUT a manual CSV upload.
//
// IMPORTANT — there is no direct read path into Expungement.ai's database from this app (the
// Command Center only reads/writes its own state-blob table). So this module is the *receiving*
// end: a future Expungement.ai export job / webhook bridge POSTs a batch of lifecycle records to
// the authenticated /api/sync/expungement-ai/{preview,confirm} endpoints, and this module:
//   1. Upserts a safe per-user lifecycle row into expungementLifecycleContacts (operational fields
//      ONLY — never raw eligibility/case details), and appends an expungementLifecycleEvents row.
//   2. OPTIONALLY stages campaign-eligible contacts into reactivationContacts via the EXISTING safe
//      import path — and they are ALWAYS held (campaign_hold:true, reason "expungement_ai_sync_review").
//
// It NEVER: sends email, calls SendGrid or any provider, enrolls a contact, releases a wave, flips a
// live-send/autopilot gate, or stages an unsubscribed/suppressed/deleted person into a campaign table.
// Preview writes nothing. Confirm requires owner/admin (enforced at the endpoint).

import {
  importReactivationContacts, applyWaveAssignment, reactivationCampaignOf, contactIdForEmail
} from "./reactivation-os.mjs";
import { normalizeEmail, isBadDomain, isSuppressed, recordSuppression } from "./outreach-os.mjs";
import { parseCsv } from "./consumer-list-import.mjs";
import crypto from "node:crypto";

// MUST stay in sync with the entries added to coreStateCollections in storage.mjs, or these
// collections silently fail to persist to Supabase. Asserted by the sync test.
export const EXPUNGEMENT_LIFECYCLE_COLLECTIONS = ["expungementLifecycleContacts", "expungementLifecycleEvents"];

export const EXPUNGEMENT_SOURCE_TYPE = "expungement_ai_sync";
export const EXPUNGEMENT_SOURCE_SYSTEM = "expungement.ai";
export const EXPUNGEMENT_HOLD_REASON = "expungement_ai_sync_review";
export const EXPUNGEMENT_IMPORT_STATUS = "staged";

// Every lifecycle stage the sync understands.
export const LIFECYCLE_STAGES = new Set([
  "screening_started", "screening_abandoned", "screening_completed",
  "checkout_started", "checkout_abandoned", "paid",
  "packet_generated", "support_requested", "unsubscribed", "deleted_or_erasure_requested"
]);

// Stages whose contacts are worth re-engaging later (and so may be staged — ALWAYS held — into the
// reactivation campaign). Converted (paid/packet), support, unsubscribed, and deleted are excluded.
export const CAMPAIGN_STAGEABLE_STAGES = new Set([
  "screening_started", "screening_abandoned", "screening_completed",
  "checkout_started", "checkout_abandoned"
]);

export const EXPUNGEMENT_SYNC_WARNING =
  "Nothing sends from sync. Lifecycle data is recorded and campaign-eligible contacts are held for review — no email goes out until they are intentionally released.";
export const EXPUNGEMENT_SYNC_HELD_MESSAGE =
  "Contacts are held for review. Nothing sends until you intentionally release them. Deleted, unsubscribed, or revoked-consent people are excluded from campaign staging.";

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);
const truthy = (v) => v === true || ["true", "1", "yes", "y", "on"].includes(lower(v));

// ---------------------------------------------------------------------------
// CSV / paste support — convert a pasted CSV export into the SAME lifecycle record shape the JSON
// path uses, so previewExpungementSync()/confirmExpungementSync() are unchanged. Headers match
// case/space/underscore/hyphen-insensitively. First matching column wins per canonical field.
// ---------------------------------------------------------------------------
const CSV_FIELD_ALIASES = {
  email: ["email", "emailaddress", "e-mail"],
  first_name: ["firstname", "fname", "givenname"],
  full_name: ["fullname", "name", "contactname"],
  phone: ["phone", "phonenumber", "mobile", "cell", "tel"],
  state: ["state"],
  jurisdiction: ["jurisdiction"],
  lifecycle_stage: ["lifecyclestage"],
  stage: ["stage"],
  event: ["event", "eventtype"],
  screening_status: ["screeningstatus"],
  checkout_status: ["checkoutstatus"],
  payment_status: ["paymentstatus"],
  dropoff_step: ["dropoffstep", "dropoff"],
  source_record_id: ["sourcerecordid", "recordid"],
  last_seen_at: ["lastseenat", "lastseen"],
  eligibility_status_summary: ["eligibilitystatussummary", "eligibilitysummary"],
  consent_status: ["consentstatus", "consent"],
  consent_captured_at: ["consentcapturedat"],
  privacy_version: ["privacyversion"],
  utm_source: ["utmsource"],
  utm_campaign: ["utmcampaign"],
  referrer: ["referrer", "referer"],
  unsubscribed: ["unsubscribed", "unsub"],
  bounced: ["bounced", "bounce"],
  complained: ["complained", "complaint"],
  do_not_contact: ["donotcontact", "dnc"],
  deleted_or_erasure_requested: ["deletedorerasurerequested", "deleted", "erasure", "erasurerequested", "deletionrequested"]
};

const normalizeHeaderKey = (header = "") => clean(header).toLowerCase().replace(/[\s_\-]+/g, "");

const CSV_HEADER_LOOKUP = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
    for (const alias of aliases) map.set(normalizeHeaderKey(alias), field);
  }
  return map;
})();

// Parse pasted CSV text into lifecycle record objects keyed by the canonical field names that
// classifyLifecycleStage()/buildLifecycleContact() already understand. Reuses the consumer import's
// RFC-4180 parser (quoted fields, embedded commas, BOM). Unknown columns are ignored.
export function csvToLifecycleRecords(csvText = "") {
  const grid = parseCsv(csvText);
  if (grid.length < 1) return [];
  const headers = grid[0].map(clean);
  const fieldByIndex = headers.map((h) => CSV_HEADER_LOOKUP.get(normalizeHeaderKey(h)) || null);
  return grid.slice(1).map((cells) => {
    const rec = {};
    headers.forEach((h, i) => {
      const field = fieldByIndex[i];
      if (field && rec[field] === undefined) rec[field] = clean(cells[i]); // first matching column wins
    });
    return rec;
  });
}

// Resolve either a JSON `records` array or pasted `csvText` into the lifecycle record array. CSV
// takes precedence only when records is absent/empty, so the JSON path is unchanged.
export function resolveSyncRecords({ records, csvText } = {}) {
  if (Array.isArray(records) && records.length) return records;
  if (clean(csvText)) return csvToLifecycleRecords(csvText);
  return Array.isArray(records) ? records : [];
}

// Stable id for a lifecycle contact (own namespace, distinct from react-* ids).
export function lifecycleIdForEmail(email = "") {
  return `exp-${crypto.createHash("sha1").update(normalizeEmail(email)).digest("hex").slice(0, 16)}`;
}

// Derive a lifecycle stage from an explicit field or from status/flag signals. Returns "" if the
// record carries no recognizable stage (such a record is recorded but never campaign-staged).
export function classifyLifecycleStage(raw = {}) {
  const explicit = lower(raw.lifecycle_stage || raw.stage || raw.event || raw.event_type);
  if (LIFECYCLE_STAGES.has(explicit)) return explicit;
  if (truthy(raw.deleted_or_erasure_requested) || /delet|erasure|gdpr|ccpa/.test(lower(raw.privacy_request))) return "deleted_or_erasure_requested";
  if (truthy(raw.unsubscribed)) return "unsubscribed";
  if (["paid", "completed", "succeeded", "success"].includes(lower(raw.payment_status))) return "paid";
  if (truthy(raw.packet_generated) || truthy(raw.packet_completed)) return "packet_generated";
  if (truthy(raw.support_requested)) return "support_requested";
  if (truthy(raw.checkout_abandoned) || lower(raw.checkout_status) === "abandoned") return "checkout_abandoned";
  if (truthy(raw.checkout_started) || lower(raw.checkout_status) === "started") return "checkout_started";
  if (truthy(raw.screening_completed) || lower(raw.screening_status) === "completed") return "screening_completed";
  if (truthy(raw.screening_abandoned) || lower(raw.screening_status) === "abandoned" || clean(raw.dropoff_step)) return "screening_abandoned";
  if (truthy(raw.screening_started) || lower(raw.screening_status) === "started") return "screening_started";
  return "";
}

function isPaidRecord(raw = {}) {
  return ["paid", "completed", "succeeded", "success"].includes(lower(raw.payment_status)) || classifyLifecycleStage(raw) === "paid";
}

// A record carries a hard suppression signal (must never be campaign-staged, and we record a sticky
// suppression so a later CSV import can't enroll them either).
function hasSuppressionSignal(raw = {}) {
  return truthy(raw.unsubscribed) || truthy(raw.bounced) || truthy(raw.complained) || truthy(raw.do_not_contact);
}

function isDeleted(raw = {}) {
  return truthy(raw.deleted_or_erasure_requested) || classifyLifecycleStage(raw) === "deleted_or_erasure_requested";
}

// Consent, if explicitly captured, must not be revoked/declined for campaign staging.
function consentRevoked(raw = {}) {
  const c = lower(raw.consent_status);
  return ["revoked", "declined", "withdrawn", "denied", "false", "no"].includes(c);
}

function maskEmail(value = "") {
  const v = clean(value);
  const at = v.indexOf("@");
  if (at <= 0) return v;
  return v[0] + "***" + v.slice(at);
}

function sourceNoteForStage(stage = "") {
  const map = {
    screening_started: "Expungement.ai started screening",
    screening_abandoned: "Expungement.ai abandoned screening",
    screening_completed: "Expungement.ai completed screening (no payment)",
    checkout_started: "Expungement.ai started checkout",
    checkout_abandoned: "Expungement.ai abandoned checkout"
  };
  return map[stage] || "Expungement.ai lifecycle sync";
}

// Build the safe lifecycle-contact row — operational fields ONLY. Sensitive eligibility/case detail
// is never copied; only a short eligibility_status_summary string is kept. First-seen created_at,
// source_record_id, and synced_at are preserved on re-sync; sync_source_note refreshes to the
// operator-provided note for the LATEST sync batch (events keep the per-sync note immutably).
function buildLifecycleContact(raw, email, stage, now, sourceNote, prior = {}) {
  return {
    lifecycle_contact_id: lifecycleIdForEmail(email),
    email,
    first_name: clean(raw.first_name) || clean(raw.full_name).split(/\s+/)[0] || "",
    phone: clean(raw.phone),
    state: clean(raw.state),
    jurisdiction: clean(raw.jurisdiction),
    lifecycle_stage: stage,
    dropoff_step: clean(raw.dropoff_step),
    payment_status: lower(raw.payment_status),
    sync_source_note: clean(sourceNote),
    first_synced_at: prior.first_synced_at || now,
    last_synced_at: now,
    eligibility_status_summary: clean(raw.eligibility_status_summary).slice(0, 160),
    last_seen_at: clean(raw.last_seen_at) || prior.last_seen_at || now,
    source_type: EXPUNGEMENT_SOURCE_TYPE,
    source_system: EXPUNGEMENT_SOURCE_SYSTEM,
    source_record_id: clean(raw.source_record_id) || prior.source_record_id || "",
    consent_status: lower(raw.consent_status) || prior.consent_status || "",
    consent_captured_at: clean(raw.consent_captured_at) || prior.consent_captured_at || "",
    privacy_version: clean(raw.privacy_version) || prior.privacy_version || "",
    utm_source: clean(raw.utm_source) || prior.utm_source || "",
    utm_campaign: clean(raw.utm_campaign) || prior.utm_campaign || "",
    referrer: clean(raw.referrer) || prior.referrer || "",
    do_not_contact: truthy(raw.do_not_contact) || prior.do_not_contact === true,
    unsubscribed: truthy(raw.unsubscribed) || prior.unsubscribed === true,
    bounced: truthy(raw.bounced) || prior.bounced === true,
    complained: truthy(raw.complained) || prior.complained === true,
    deleted_or_erasure_requested: isDeleted(raw) || prior.deleted_or_erasure_requested === true,
    created_at: prior.created_at || now,
    updated_at: now
  };
}

function assertSyncInputs(records, { sourceNote } = {}) {
  if (!Array.isArray(records)) throw new Error("Sync records must be an array of lifecycle records.");
  if (!records.length) throw new Error("Provide at least one Expungement.ai lifecycle record to sync.");
  if (!clean(sourceNote)) throw new Error("Source note is required: add where this sync batch came from.");
}

// PREVIEW — pure, NEVER writes. Classifies the batch and reports the counts + masked samples.
export function previewExpungementSync(state = {}, records = [], opts = {}) {
  assertSyncInputs(records, opts);
  let totalRecords = 0, validContacts = 0, abandonedScreenings = 0, completedNoPayment = 0,
    checkoutAbandoned = 0, paidCustomers = 0, excludedUnsubscribed = 0, excludedDeleted = 0, campaignStageable = 0;
  const sampleContacts = [];
  for (const raw of list(records)) {
    totalRecords++;
    const email = normalizeEmail(raw.email);
    const validEmail = Boolean(email) && !isBadDomain(email);
    if (validEmail) validContacts++;
    const stage = classifyLifecycleStage(raw);
    if (stage === "screening_abandoned") abandonedScreenings++;
    if (stage === "screening_completed" && !isPaidRecord(raw)) completedNoPayment++;
    if (stage === "checkout_abandoned") checkoutAbandoned++;
    if (stage === "paid") paidCustomers++;
    if (isDeleted(raw)) {
      excludedDeleted++;
    } else if (hasSuppressionSignal(raw) || consentRevoked(raw) || (validEmail && isSuppressed({ email, contact_id: contactIdForEmail(email) }, { state }).suppressed)) {
      excludedUnsubscribed++;
    } else if (validEmail && CAMPAIGN_STAGEABLE_STAGES.has(stage)) {
      campaignStageable++;
    }
    if (sampleContacts.length < 5 && validEmail) {
      sampleContacts.push({ email: maskEmail(email), lifecycle_stage: stage || "unknown", payment_status: lower(raw.payment_status), state: clean(raw.state || raw.jurisdiction) });
    }
  }
  return {
    ok: true,
    sourceNote: clean(opts.sourceNote),
    totalRecords,
    validContacts,
    abandonedScreenings,
    completedNoPayment,
    checkoutAbandoned,
    paidCustomers,
    excludedUnsubscribed,
    excludedDeleted,
    campaignStageable,
    sampleContacts,
    warning: EXPUNGEMENT_SYNC_WARNING,
    writesState: false
  };
}

// CONFIRM — upserts lifecycle contacts/events, records sticky suppression for hard signals, and
// stages campaign-eligible contacts into reactivationContacts ALWAYS held. Returns the NEW state.
export function confirmExpungementSync(state = {}, records = [], opts = {}) {
  assertSyncInputs(records, opts);
  const now = opts.now || new Date().toISOString();
  const importId = opts.importId || `exp-sync-${crypto.randomBytes(6).toString("hex")}`;

  const lcById = new Map(list(state.expungementLifecycleContacts).map((c) => [c.lifecycle_contact_id, c]));
  const newEvents = [];
  let lifecycleUpserted = 0;
  let excludedUnsubscribed = 0, excludedDeleted = 0;
  const stageable = []; // { email, first_name, phone, stage }
  let nextState = { ...state };

  for (const raw of list(records)) {
    const email = normalizeEmail(raw.email);
    if (!email) continue; // identity-less record — cannot record a contact
    const stage = classifyLifecycleStage(raw);
    const lc = buildLifecycleContact(raw, email, stage, now, opts.sourceNote, lcById.get(lifecycleIdForEmail(email)));
    lcById.set(lc.lifecycle_contact_id, lc);
    lifecycleUpserted++;
    newEvents.push({
      id: `exp-ev-${crypto.randomBytes(5).toString("hex")}`,
      lifecycle_contact_id: lc.lifecycle_contact_id,
      email,
      stage: stage || "unknown",
      payment_status: lc.payment_status,
      source_type: EXPUNGEMENT_SOURCE_TYPE,
      source_record_id: lc.source_record_id,
      sync_source_note: clean(opts.sourceNote),
      import_id: importId,
      created_at: now
    });

    // Honor unsubscribe/bounce/complaint/deletion AND revoked consent by recording a sticky
    // suppression so NO path (this sync or a later CSV import) can ever enroll them.
    if (hasSuppressionSignal(raw) || isDeleted(raw) || consentRevoked(raw)) {
      const reason = (truthy(raw.bounced) && !isDeleted(raw)) ? "bounced"
        : (truthy(raw.unsubscribed) && !isDeleted(raw)) ? "unsubscribed"
        : "manually_suppressed"; // deletion + revoked-consent + do_not_contact/complaint => manual suppression
      nextState = recordSuppression(nextState, { contactId: contactIdForEmail(email), email, reason, source: "expungement_ai_sync" }, now);
    }

    // Campaign-staging eligibility (never deleted, never suppressed, consent not revoked). Mirrors
    // the preview counting: a bad-domain email is just non-stageable noise, not an "exclusion".
    if (isDeleted(raw)) { excludedDeleted++; continue; }
    const validEmail = !isBadDomain(email);
    if (hasSuppressionSignal(raw) || consentRevoked(raw) || (validEmail && isSuppressed({ email, contact_id: contactIdForEmail(email) }, { state: nextState }).suppressed)) {
      excludedUnsubscribed++;
      continue;
    }
    if (validEmail && CAMPAIGN_STAGEABLE_STAGES.has(stage)) {
      stageable.push({ email, first_name: lc.first_name, phone: lc.phone, stage });
    }
  }

  nextState = {
    ...nextState,
    expungementLifecycleContacts: [...lcById.values()],
    expungementLifecycleEvents: [...newEvents, ...list(state.expungementLifecycleEvents)].slice(0, 50000)
  };

  // Stage campaign-eligible contacts via the EXISTING reactivation import path, then stamp provenance
  // + an explicit hold. Held contacts get no wave (assignWaves skips holds). Never enroll/send.
  let reactivationStaged = 0, held = 0;
  if (stageable.length) {
    const priorById = new Map(list(nextState.reactivationContacts).map((c) => [c.contact_id, c]));
    const stageByContactId = new Map(stageable.map((s) => [contactIdForEmail(s.email), s.stage]));
    const rows = stageable.map((s) => ({ email: s.email, first_name: s.first_name, phone: s.phone, priority: "cold" }));
    const imported = importReactivationContacts(nextState, rows, { now });
    reactivationStaged = imported.summary.added + imported.summary.updated;
    const stamped = list(imported.state.reactivationContacts).map((c) => {
      if (!stageByContactId.has(c.contact_id)) return c;
      const isNew = !priorById.has(c.contact_id);
      const prior = priorById.get(c.contact_id) || {};
      const out = {
        ...c,
        source_type: EXPUNGEMENT_SOURCE_TYPE,
        source_note: sourceNoteForStage(stageByContactId.get(c.contact_id)),
        source_imported_at: prior.source_imported_at || now,
        source_import_id: prior.source_import_id || importId
      };
      if (isNew) {
        out.import_status = EXPUNGEMENT_IMPORT_STATUS;
        out.campaign_hold = true;
        out.campaign_hold_reason = EXPUNGEMENT_HOLD_REASON;
        held++;
      } else {
        if (prior.import_status !== undefined) out.import_status = prior.import_status;
        if (prior.campaign_hold !== undefined) out.campaign_hold = prior.campaign_hold;
        if (prior.campaign_hold_reason !== undefined) out.campaign_hold_reason = prior.campaign_hold_reason;
      }
      return out;
    });
    const stagedState = { ...imported.state, reactivationContacts: stamped };
    nextState = applyWaveAssignment(stagedState, reactivationCampaignOf(stagedState), { now }).state;
  }

  return {
    ok: true,
    sourceNote: clean(opts.sourceNote),
    sourceImportId: importId,
    state: nextState,
    lifecycleUpserted,
    lifecycleEventsRecorded: newEvents.length,
    reactivationStaged,
    held,
    excludedUnsubscribed,
    excludedDeleted,
    warning: EXPUNGEMENT_SYNC_WARNING,
    heldMessage: EXPUNGEMENT_SYNC_HELD_MESSAGE,
    noSend: true,
    writesState: true
  };
}

// ---------------------------------------------------------------------------
// HELD CONTACTS REVIEW — read-only operator surface. Pure: NEVER writes state, never sends,
// never enrolls/releases. Returns SAFE fields only (emails masked; no raw eligibility/case detail).
// Joins each held reactivation contact to its Expungement.ai lifecycle row (by email) for
// state/jurisdiction/stage when available. Used by GET /api/contacts/held-review.
// ---------------------------------------------------------------------------
const REVOKED_CONSENT_VALUES = ["revoked", "declined", "withdrawn", "denied"];

export function buildHeldContactsReview(state = {}) {
  const lifecycle = list(state.expungementLifecycleContacts);
  const lifecycleById = new Map(lifecycle.map((c) => [c.lifecycle_contact_id, c]));
  const reactivation = list(state.reactivationContacts);
  const ledgerEmails = new Set(list(state.outreachSuppressions).map((s) => normalizeEmail(s.email)).filter(Boolean));

  // Lifecycle contacts by stage (all known stages present + an "unknown" bucket).
  const lifecycleByStage = { unknown: 0 };
  for (const stage of LIFECYCLE_STAGES) lifecycleByStage[stage] = 0;
  let deleted = 0, revokedConsent = 0, excludedSuppressed = 0;
  const lifecycleRows = [];
  for (const c of lifecycle) {
    const stage = c.lifecycle_stage || "unknown";
    lifecycleByStage[stage] = (lifecycleByStage[stage] || 0) + 1;
    const isDeleted = c.deleted_or_erasure_requested === true;
    const revoked = REVOKED_CONSENT_VALUES.includes(lower(c.consent_status));
    const suppressed = c.unsubscribed === true || c.bounced === true || c.complained === true
      || c.do_not_contact === true || ledgerEmails.has(normalizeEmail(c.email)) || revoked || isDeleted;
    if (isDeleted) deleted++;
    if (revoked) revokedConsent++;
    if (suppressed) excludedSuppressed++;
    lifecycleRows.push({
      masked_email: maskEmail(c.email),
      first_name: c.first_name || "",
      state: c.state || "",
      jurisdiction: c.jurisdiction || "",
      lifecycle_stage: c.lifecycle_stage || "",
      sync_source_note: c.sync_source_note || "",
      source_type: c.source_type || "",
      last_synced_at: c.last_synced_at || "",
      unsubscribed: c.unsubscribed === true,
      bounced: c.bounced === true,
      complained: c.complained === true,
      do_not_contact: c.do_not_contact === true,
      deleted_or_erasure_requested: isDeleted,
      consent_status: c.consent_status || "",
      suppressed
    });
  }

  // Held reactivation contacts (campaign_hold) — joined to lifecycle for state/stage when present.
  let held = 0, staged = 0, enrolled = 0;
  const heldRows = [];
  for (const c of reactivation) {
    if (c.enrolled_at) enrolled++;
    if (c.import_status === "staged") staged++;
    if (c.campaign_hold === true) {
      held++;
      const lc = lifecycleById.get(lifecycleIdForEmail(c.email)) || {};
      heldRows.push({
        contact_id: c.contact_id || "", // stable hash id (not PII) — lets the UI target a disposition
        masked_email: maskEmail(c.email),
        first_name: c.first_name || "",
        state: lc.state || "",
        jurisdiction: lc.jurisdiction || "",
        lifecycle_stage: lc.lifecycle_stage || "",
        source_note: c.source_note || "",
        source_type: c.source_type || "",
        source_imported_at: c.source_imported_at || "",
        campaign_hold_reason: c.campaign_hold_reason || "",
        import_status: c.import_status || "",
        wave: c.wave == null ? null : c.wave,
        enrolled: Boolean(c.enrolled_at),
        review_status: c.review_status || "held",
        review_note: c.review_note || "",
        reviewed_at: c.reviewed_at || "",
        reviewed_by: c.reviewed_by || "",
        do_not_contact: c.do_not_contact === true
      });
    }
  }

  const recentEvents = list(state.expungementLifecycleEvents).slice(0, 25).map((e) => ({
    masked_email: maskEmail(e.email),
    stage: e.stage || "",
    payment_status: e.payment_status || "",
    sync_source_note: e.sync_source_note || "",
    created_at: e.created_at || ""
  }));

  return {
    ok: true,
    writesState: false,
    counts: {
      totalLifecycleContacts: lifecycle.length,
      heldReactivation: held,
      staged,
      enrolled,
      excludedSuppressed,
      deleted,
      revokedConsent
    },
    lifecycleByStage,
    heldRows,
    lifecycleRows,
    recentEvents
  };
}

// ---------------------------------------------------------------------------
// HELD CONTACT DISPOSITION — let an owner/admin record what should happen to a held contact LATER,
// without releasing, enrolling, sending, or wave-assigning anything. Every disposition keeps
// campaign_hold === true. "suppress" additionally writes a sticky outreach suppression + sets
// do_not_contact (the lifecycle record is preserved). Pure reducer the endpoint calls.
// ---------------------------------------------------------------------------
export const HELD_REVIEW_STATUSES = new Set([
  "held", "approved_for_later", "keep_held", "suppress", "needs_more_info", "exclude_paid_customer"
]);
export const OPERATOR_REVIEWED_HOLD_REASON = "operator_reviewed_hold";

export function applyHeldDisposition(state = {}, opts = {}) {
  const reviewStatus = clean(opts.review_status);
  if (!HELD_REVIEW_STATUSES.has(reviewStatus)) {
    throw new Error('Invalid review status. Allowed: ' + [...HELD_REVIEW_STATUSES].join(", ") + ".");
  }
  const ids = [
    ...list(opts.contactIds),
    ...list(opts.contact_ids)
  ].map(clean).filter(Boolean);
  if (clean(opts.contactId)) ids.push(clean(opts.contactId));
  if (clean(opts.contact_id)) ids.push(clean(opts.contact_id));
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) throw new Error("Provide at least one held contact_id.");
  const now = opts.now || new Date().toISOString();
  const reviewedBy = clean(opts.reviewed_by) || "owner";
  const reviewNote = clean(opts.review_note).slice(0, 500);

  const byId = new Map(list(state.reactivationContacts).map((c) => [clean(c.contact_id), c]));
  const rejected = [];
  for (const id of uniqueIds) {
    const c = byId.get(id);
    if (!c) { rejected.push({ contact_id: id, reason: "not_found" }); continue; }
    if (c.campaign_hold !== true) { rejected.push({ contact_id: id, reason: "not_held" }); continue; }
    if (c.enrolled_at || lower(c.sequence_status) === "enrolled") { rejected.push({ contact_id: id, reason: "enrolled" }); continue; }
  }
  if (rejected.length) {
    const error = new Error("Disposition can only update held, non-enrolled contacts.");
    error.rejected = rejected;
    throw error;
  }
  const applyIds = new Set(uniqueIds);

  let nextState = { ...state };
  // suppress => sticky outreach suppression first (so the ledger blocks any future planning/send).
  if (reviewStatus === "suppress") {
    for (const id of applyIds) {
      const c = byId.get(id);
      nextState = recordSuppression(nextState, { contactId: id, email: c.email, reason: "manually_suppressed", source: "operator_held_disposition" }, now);
    }
  }

  const newContacts = list(nextState.reactivationContacts).map((c) => {
    const id = clean(c.contact_id);
    if (!applyIds.has(id)) return c;
    const patch = {
      ...c,
      review_status: reviewStatus,
      review_note: reviewNote,
      reviewed_at: now,
      reviewed_by: reviewedBy,
      campaign_hold: true,                          // ALWAYS stays held in this slice
      campaign_hold_reason: OPERATOR_REVIEWED_HOLD_REASON,
      updated_at: now
    };
    if (reviewStatus === "suppress") {
      patch.do_not_contact = true;
      patch.import_status = "suppressed";
    } else if (reviewStatus === "exclude_paid_customer") {
      patch.import_status = "excluded";
    } else {
      patch.import_status = c.import_status || "staged";
    }
    // NEVER touch wave / enrolled_at / sequence_status — held contacts stay unbucketed + Not Enrolled.
    return patch;
  });
  nextState = { ...nextState, reactivationContacts: newContacts };

  const updated = [...applyIds].map((id) => {
    const c = newContacts.find((x) => clean(x.contact_id) === id);
    return {
      contact_id: id,
      masked_email: maskEmail(c.email),
      review_status: c.review_status,
      review_note: c.review_note,
      reviewed_at: c.reviewed_at,
      reviewed_by: c.reviewed_by,
      campaign_hold: c.campaign_hold === true,
      campaign_hold_reason: c.campaign_hold_reason,
      import_status: c.import_status,
      do_not_contact: c.do_not_contact === true,
      wave: c.wave == null ? null : c.wave,
      enrolled: Boolean(c.enrolled_at)
    };
  });

  return {
    ok: true,
    writesState: true,
    review_status: reviewStatus,
    updatedCount: applyIds.size,
    rejected: [],
    updated,
    noSend: true,
    state: nextState
  };
}
