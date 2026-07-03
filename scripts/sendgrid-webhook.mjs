// SendGrid Event Webhook — verification, scoped event reduction, and health telemetry.
//
// Phase 0 trust fix (see docs/command-center-ground-truth-audit.md). Three jobs:
//   1. SIGNATURE VERIFICATION (fail closed when configured). SendGrid signs each webhook POST
//      with an ECDSA P-256 key ("Signed Event Webhook"). When SENDGRID_WEBHOOK_PUBLIC_KEY is
//      set, batches with a missing/invalid signature are REJECTED before any processing. When
//      the key is not configured we still process (backward compatible) but the health record
//      marks every batch "unverified" so the gap stays visible instead of silently trusted.
//   2. SCOPED REDUCTION. reduceSendGridEvents is a pure reducer over ONLY the collections the
//      webhook may touch (SENDGRID_WEBHOOK_COLLECTIONS). The server writes back ONLY those
//      collections, so a webhook batch can never rewrite — or be broken by — unrelated state
//      (the full-state ON CONFLICT failure mode that silenced telemetry through Wave 1).
//   3. HEALTH TELEMETRY. sendgridWebhookHealth (singleton) records lastReceivedAt / lastOkAt /
//      counters by event type / last error, and sendgridWebhookHealthSummary turns that into
//      the plain-English posture surfaced on /api/reactivation/status — including the explicit
//      "telemetry cannot be trusted" warning when sends exist but no events were ever recorded.
//
// This module never sends anything and never flips a gate. It only records what SendGrid
// reports. Collections listed here MUST stay in coreStateCollections in storage.mjs (the B1
// trap) — test-sendgrid-webhook.mjs asserts membership.

import crypto from "node:crypto";
import { recordSuppression } from "./outreach-os.mjs";
import { applyReactivationEvent } from "./reactivation-os.mjs";

// Every collection a webhook batch may write. recordSuppression touches outreachSuppressions +
// outreachContacts; bounce events append to outreachBounces; applyReactivationEvent touches
// reactivationContacts + reactivationEvents (and suppression via recordSuppression).
export const SENDGRID_WEBHOOK_COLLECTIONS = [
  "outreachSuppressions",
  "outreachContacts",
  "outreachBounces",
  "reactivationContacts",
  "reactivationEvents"
];
export const SENDGRID_WEBHOOK_HEALTH_COLLECTION = "sendgridWebhookHealth"; // singleton

export const SENDGRID_SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
export const SENDGRID_TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

const clean = (v = "") => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
function nowIso() { return new Date().toISOString(); }

export function sendgridSignatureConfigured(env = process.env) {
  return clean((env || {}).SENDGRID_WEBHOOK_PUBLIC_KEY).length > 0;
}

// Verify a SendGrid Signed Event Webhook batch: ECDSA P-256 / SHA-256 over (timestamp + rawBody),
// base64 DER signature, base64 SPKI public key (exactly what the SendGrid dashboard displays).
// Returns { checked, verified, rejected, reason }:
//   - key not configured  -> { checked:false, verified:false, rejected:false } (process, mark unverified)
//   - key configured + ok -> { checked:true,  verified:true,  rejected:false }
//   - key configured + bad-> { checked:true,  verified:false, rejected:true, reason } (fail closed)
export function verifySendGridSignature({ env = process.env, rawBody = "", signature = "", timestamp = "" } = {}) {
  const publicKeyB64 = clean((env || {}).SENDGRID_WEBHOOK_PUBLIC_KEY);
  if (!publicKeyB64) return { checked: false, verified: false, rejected: false, reason: "no_key_configured" };
  if (!clean(signature) || !clean(timestamp)) {
    return { checked: true, verified: false, rejected: true, reason: "missing_signature_headers" };
  }
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, "base64"),
      format: "der",
      type: "spki"
    });
    const verified = crypto.verify(
      "sha256",
      Buffer.from(clean(timestamp) + String(rawBody ?? ""), "utf8"),
      publicKey,
      Buffer.from(clean(signature), "base64")
    );
    return verified
      ? { checked: true, verified: true, rejected: false, reason: "" }
      : { checked: true, verified: false, rejected: true, reason: "signature_mismatch" };
  } catch (error) {
    return { checked: true, verified: false, rejected: true, reason: `verification_error:${error.message}` };
  }
}

// Pure reducer: apply a SendGrid event batch to the scoped state slice. Mirrors the original
// handler semantics exactly (suppression for hard signals, bounce ledger entries, reactivation
// campaign ledger + per-contact pause) and additionally counts what happened so the health
// record reflects reality rather than assumption.
export function reduceSendGridEvents(scopedState = {}, events = [], { now = nowIso() } = {}) {
  let next = { ...scopedState };
  const counters = { received: 0, recorded: 0, byType: {}, reactivationMatched: 0, skippedNoEmail: 0 };
  const reactivationEmails = new Set(list(next.reactivationContacts).map((c) => clean(c.email).toLowerCase()));

  for (const ev of list(events)) {
    counters.received += 1;
    const type = clean(ev.event || ev.type).toLowerCase();
    const email = clean(ev.email);
    if (!email) { counters.skippedNoEmail += 1; continue; }
    counters.byType[type || "unknown"] = (counters.byType[type || "unknown"] || 0) + 1;

    if (["bounce", "dropped", "blocked"].includes(type)) {
      next = recordSuppression(next, { email, reason: "bounced", source: "sendgrid_webhook" }, now);
      next.outreachBounces = [
        { id: `outreach-bounce-${Date.now().toString(16)}-${Math.round(ev.timestamp || 0)}`, email, type, reason: ev.reason || "", created_at: now },
        ...list(next.outreachBounces)
      ];
    } else if (["unsubscribe", "group_unsubscribe", "spamreport"].includes(type)) {
      next = recordSuppression(next, { email, reason: "unsubscribed", source: "sendgrid_webhook" }, now);
    }

    if (reactivationEmails.has(email.toLowerCase())) counters.reactivationMatched += 1;
    next = applyReactivationEvent(next, { event: type, email, reason: ev.reason || "" }, { now });
    counters.recorded += 1;
  }
  return { state: next, counters };
}

// Merge a batch outcome into the persisted health singleton. `outcome` is one of:
//   { ok: true, counters, verified }  — batch processed
//   { rejected: true, reason }        — signature rejected (nothing processed)
//   { error: "..." }                  — processing/store failure
export function updateSendGridWebhookHealth(prev = {}, outcome = {}, { now = nowIso() } = {}) {
  const base = {
    last_received_at: now,
    last_ok_at: prev.last_ok_at || "",
    last_error_at: prev.last_error_at || "",
    last_error: prev.last_error || "",
    total_batches: (prev.total_batches || 0) + 1,
    total_events: prev.total_events || 0,
    total_recorded: prev.total_recorded || 0,
    verified_batches: prev.verified_batches || 0,
    unverified_batches: prev.unverified_batches || 0,
    rejected_batches: prev.rejected_batches || 0,
    counts_by_type: { ...(prev.counts_by_type || {}) },
    updated_at: now
  };
  if (outcome.ok) {
    const counters = outcome.counters || {};
    base.last_ok_at = now;
    base.total_events += counters.received || 0;
    base.total_recorded += counters.recorded || 0;
    if (outcome.verified) base.verified_batches += 1; else base.unverified_batches += 1;
    for (const [type, count] of Object.entries(counters.byType || {})) {
      base.counts_by_type[type] = (base.counts_by_type[type] || 0) + count;
    }
  } else if (outcome.rejected) {
    base.rejected_batches += 1;
    base.last_error_at = now;
    base.last_error = `rejected:${outcome.reason || "signature"}`;
  } else {
    base.last_error_at = now;
    base.last_error = String(outcome.error || "unknown error").slice(0, 500);
  }
  return base;
}

// Plain-English posture for status endpoints. `sent` is the campaign's sent count so the summary
// can say, honestly, whether the auto-pause monitor is flying blind.
export function sendgridWebhookHealthSummary(health = {}, { env = process.env, sent = 0 } = {}) {
  const h = health || {};
  const totalEvents = h.total_events || 0;
  const signaturePosture = sendgridSignatureConfigured(env)
    ? "enforced"
    : "not_configured";
  let warning = "";
  if (!h.last_received_at && sent > 0) {
    warning = `Webhook batches have never been received despite ${sent} sends. Delivery telemetry and the auto-pause monitor are blind. Check the SendGrid Event Webhook URL and recent write errors.`;
  } else if (totalEvents === 0 && sent > 0) {
    warning = `Webhook batches arrive but no events have been recorded despite ${sent} sends. Check for write failures.`;
  } else if (h.last_error_at && (!h.last_ok_at || h.last_error_at > h.last_ok_at)) {
    warning = `The most recent webhook batch failed: ${h.last_error || "unknown error"}.`;
  }
  return {
    signatureVerification: signaturePosture,
    lastReceivedAt: h.last_received_at || "",
    lastOkAt: h.last_ok_at || "",
    lastErrorAt: h.last_error_at || "",
    lastError: h.last_error || "",
    totalBatches: h.total_batches || 0,
    totalEvents,
    totalRecorded: h.total_recorded || 0,
    verifiedBatches: h.verified_batches || 0,
    unverifiedBatches: h.unverified_batches || 0,
    rejectedBatches: h.rejected_batches || 0,
    countsByType: h.counts_by_type || {},
    warning
  };
}
