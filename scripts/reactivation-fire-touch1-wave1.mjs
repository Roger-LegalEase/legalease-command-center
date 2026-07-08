// MVP Reactivation — ONE-SHOT: fire Touch 1 to ENROLLED WAVE 1 contacts, NOW.
//
// WHY THIS EXISTS (read before running): the heartbeat reactivation engine cannot currently send a
// live reactivation email. Its act() delegates the send to runOutreachSend, which routes through
// resolveOutreachSendDecision and (a) gates on OUTREACH_LIVE_SEND, not REACTIVATION_LIVE_SEND, and
// (b) rejects any message whose RCAP `classification` is empty — and reactivation messages carry
// classification:"" — returning not_sent. So every heartbeat tick records not_sent and sends 0.
// This script is the operator escape hatch: it assembles each message through the SAME tested path
// (assembleCompliantMessage + validateCompliance) but performs the send DIRECTLY via the SendGrid
// v3 API (exactly like reactivation-seed-test.mjs), gated on the INTENDED REACTIVATION_LIVE_SEND
// flag. It bypasses the broken classification routing; it does NOT bypass suppression, compliance,
// caps, provider stratification, or the Wave-1/enrolled/Touch-1 lock.
//
// HARD SCOPE — it will only ever send to a contact that is ALL of:
//   wave === 1  AND  enrolled_at set  AND  not suppressed  AND  not paused  AND  0 prior touches.
// Touch 1 only. No other wave, no other touch, no contact outside reactivationContacts.
//
// CAPS / FAIRNESS — at most caps.perTickMax (150) sends per run, provider-stratified (round-robin by
// domain bucket so no run is all-Gmail), counted against caps.perWaveDayCap minus today's tally.
// Re-run it to send the next batch: contacts that already have a Touch-1 attempt are skipped, so it
// is idempotent and safe to run repeatedly until the wave is drained.
//
// USAGE (prod Render Shell, where the live store + SENDGRID_API_KEY live):
//
//   node scripts/reactivation-fire-touch1-wave1.mjs                       # DRY RUN: diagnose + preview, send + write NOTHING
//   REACTIVATION_LIVE_SEND=true \
//     node scripts/reactivation-fire-touch1-wave1.mjs --confirm-live-send # SEND (needs SENDGRID_API_KEY too)
//
// Optional flags:
//   --max=N            override the per-run cap (default = caps.perTickMax = 150). Still floored by perWaveDayCap.
//   --ignore-window    send even outside the 8-17 ET weekday window (default: refuse outside it).

import crypto from "node:crypto";
import { createStore } from "./storage.mjs";
import { etParts } from "./heartbeat.mjs";
import {
  isSuppressed, normalizeEmail, withinSendingWindow,
  assembleCompliantMessage, validateCompliance, PROD_PUBLIC_BASE
} from "./outreach-os.mjs";
import {
  reactivationMessageConfig, reactivationCampaignOf, providerBucket,
  reactivationLiveSendEnabled, REACTIVATION_CAMPAIGN_ID
} from "./reactivation-os.mjs";
import {
  sequenceIdForContact, getReactivationTouch
} from "./reactivation-sequences.mjs";

const env = process.env;
const args = process.argv.slice(2);
const confirm = args.includes("--confirm-live-send");
const ignoreWindow = args.includes("--ignore-window");
const maxArg = args.find((a) => /^--max=\d+$/.test(a));

const lower = (v = "") => String(v ?? "").trim().toLowerCase();
const clean = (v = "") => String(v ?? "").trim();
const nowIso = () => new Date().toISOString();
const shortId = () => crypto.randomBytes(5).toString("hex");
function fail(msg) { console.error("ABORTED: " + msg); process.exit(1); }

// Same per-contact pause signals the engine uses (reply/click/convert/unsub/bounce/complaint/dnc).
function contactPaused(c = {}) {
  return Boolean(c.replied || c.clicked || c.converted || c.unsubscribed || c.bounced || c.complained || c.do_not_contact);
}

// Round-robin interleave by provider bucket so any prefix (the per-run cap slice) is balanced.
function stratifyByProvider(items = []) {
  const buckets = new Map();
  for (const it of items) {
    const b = providerBucket(it.contact.email);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(it);
  }
  const lists = [...buckets.values()].sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  while (out.length < items.length) {
    let advanced = false;
    for (const l of lists) { if (l[i]) { out.push(l[i]); advanced = true; } }
    if (!advanced) break;
    i++;
  }
  return out;
}

async function main() {
  const store = await createStore();
  const full = await store.readState();
  console.log(`Store backend   : ${full.persistence || "json"}`);

  // CRITICAL SAFETY: read+write ONLY the reactivation collections (same scoped pattern as
  // reactivation-release-wave.mjs / reactivation-import.mjs) so no other prod collection is touched.
  const scoped = {
    reactivationContacts: Array.isArray(full.reactivationContacts) ? full.reactivationContacts : [],
    reactivationAttempts: Array.isArray(full.reactivationAttempts) ? full.reactivationAttempts : [],
    reactivationEvents: Array.isArray(full.reactivationEvents) ? full.reactivationEvents : [],
    reactivationCampaign: full.reactivationCampaign || {}
  };

  const config = reactivationCampaignOf(scoped);
  const parts = etParts();
  const inWindow = withinSendingWindow({ ...config.caps, weekdaysOnly: config.caps.weekdaysOnly }, parts);

  // Prior Touch-1 (and any) attempts per contact: count sent OR dry_run so re-runs don't double-send.
  const touchedCount = new Map();
  for (const a of scoped.reactivationAttempts) {
    if (!["sent", "dry_run"].includes(lower(a.status))) continue;
    const k = clean(a.contact_id);
    touchedCount.set(k, (touchedCount.get(k) || 0) + 1);
  }
  const sentToday = scoped.reactivationAttempts.filter(
    (a) => ["sent", "dry_run"].includes(lower(a.status)) && clean(a.sent_date) === parts.dateKey).length;

  // --- SELECTION: hard-locked to enrolled Wave 1, Touch 1, unsuppressed, unpaused, untouched. ---
  const wave1 = scoped.reactivationContacts.filter((c) => Number(c.wave) === 1);
  const enrolled = wave1.filter((c) => Boolean(c.enrolled_at));
  const diag = { suppressed: 0, paused: 0, alreadyTouched: 0, eligible: 0 };
  const eligible = [];
  for (const c of enrolled) {
    if (c.suppressed_at_import || isSuppressed(c, { state: scoped }).suppressed) { diag.suppressed++; continue; }
    if (contactPaused(c)) { diag.paused++; continue; }
    if ((touchedCount.get(clean(c.contact_id)) || 0) > 0) { diag.alreadyTouched++; continue; }
    eligible.push({ contact: c });
  }
  diag.eligible = eligible.length;

  // --- CAPS: per-run cap (default perTickMax) floored by remaining day cap. ---
  const perRun = maxArg ? Number(maxArg.split("=")[1]) : config.caps.perTickMax;
  const dayRemaining = Math.max(0, config.caps.perWaveDayCap - sentToday);
  const budget = Math.max(0, Math.min(perRun, dayRemaining));
  const batch = stratifyByProvider(eligible).slice(0, budget);

  // --- DIAGNOSIS (answers "are the enrolled Wave 1 contacts actually due / sendable?") ---
  const enrolledAtSample = [...new Set(enrolled.map((c) => clean(c.enrolled_at)))].slice(0, 3);
  const liveGate = reactivationLiveSendEnabled(env) && Boolean(env.SENDGRID_API_KEY);
  console.log(`\nWave 1 diagnosis`);
  console.log(`  In wave 1            : ${wave1.length}`);
  console.log(`  Enrolled (enrolled_at): ${enrolled.length}`);
  console.log(`  enrolled_at sample   : ${enrolledAtSample.join(" | ") || "(none)"}`);
  console.log(`  Skipped suppressed   : ${diag.suppressed}`);
  console.log(`  Skipped paused       : ${diag.paused}`);
  console.log(`  Skipped already-sent : ${diag.alreadyTouched}`);
  console.log(`  ELIGIBLE for Touch 1 : ${diag.eligible}`);
  console.log(`  Sent today (tally)   : ${sentToday}`);
  console.log(`  Per-run cap / dayRem : ${perRun} / ${dayRemaining}  -> budget ${budget}`);
  console.log(`  This run will send   : ${batch.length}`);
  const mix = {};
  for (const b of batch) { const p = providerBucket(b.contact.email); mix[p] = (mix[p] || 0) + 1; }
  console.log(`  Batch provider mix   :`, mix);
  console.log(`\nGates`);
  console.log(`  REACTIVATION_LIVE_SEND : ${reactivationLiveSendEnabled(env) ? "ON" : "OFF"}`);
  console.log(`  SENDGRID_API_KEY set   : ${Boolean(env.SENDGRID_API_KEY)}`);
  console.log(`  In send window (ET)    : ${inWindow ? "YES" : "NO"}${ignoreWindow ? " (ignored via --ignore-window)" : ""}`);
  console.log(`  campaign status/released: ${config.status} / [${config.releasedWaves.join(", ")}]`);

  if (!config.releasedWaves.map(Number).includes(1)) {
    fail("Wave 1 is not in releasedWaves — release it first (reactivation-release-wave.mjs 1 --confirm). Refusing.");
  }
  if (!inWindow && !ignoreWindow) {
    fail("outside the 8-17 ET weekday send window. Re-run in-window, or pass --ignore-window to override.");
  }
  if (!batch.length) {
    console.log("\nNothing to send (0 eligible after locks/caps). No send, no write.");
    return;
  }
  if (!confirm) {
    console.log(`\nDRY RUN — no send, no write. Re-run with --confirm-live-send (and REACTIVATION_LIVE_SEND=true) to fire Touch 1 to ${batch.length} contacts.`);
    return;
  }
  if (!liveGate) {
    fail("--confirm-live-send given but the live gate is OFF (need REACTIVATION_LIVE_SEND=true AND SENDGRID_API_KEY). Refusing to no-op silently.");
  }

  // --- SEND: assemble through the tested path, validate compliance, POST to SendGrid directly. ---
  const newAttempts = [];
  let sent = 0, failed = 0, skipped = 0;
  for (const { contact } of batch) {
    // Re-check suppression/pause at send time (defense in depth).
    if (contact.suppressed_at_import || isSuppressed(contact, { state: scoped }).suppressed || contactPaused(contact)) {
      skipped++; continue;
    }
    const sequenceId = sequenceIdForContact(contact);
    const touch = getReactivationTouch(sequenceId, 1); // Touch 1 ONLY
    if (!touch) { failed++; console.error(`  no_touch for ${contact.email}`); continue; }

    const messageConfig = { ...reactivationMessageConfig(scoped, { sequenceId, touchNumber: 1 }), publicBaseUrl: PROD_PUBLIC_BASE };
    let message;
    try {
      message = assembleCompliantMessage({
        contact: { ...contact, contact_name: contact.full_name || contact.first_name, classification: "" },
        org: {},
        step: { ...touch, campaign_id: REACTIVATION_CAMPAIGN_ID, classification: "" },
        config: messageConfig, baseUrl: PROD_PUBLIC_BASE, env
      });
    } catch (e) { failed++; console.error(`  assembly_failed ${contact.email}: ${e.message}`); continue; }

    const compliance = validateCompliance(message);
    if (!compliance.ok) { failed++; console.error(`  not_compliant ${contact.email}: ${compliance.errors.join(",")}`); continue; }
    if (message.to !== normalizeEmail(contact.email)) { failed++; console.error(`  recipient_mismatch ${contact.email}`); continue; }

    const payload = {
      personalizations: [{ to: [{ email: message.to }] }],
      from: message.fromName ? { email: message.from, name: message.fromName } : { email: message.from },
      ...(message.replyTo ? { reply_to: { email: message.replyTo } } : {}),
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.text },
        ...(message.html ? [{ type: "text/html", value: message.html }] : [])
      ],
      ...(message.headers && Object.keys(message.headers).length ? { headers: message.headers } : {})
    };
    let providerMessageId = "";
    try {
      const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const d = await resp.text().catch(() => "");
        failed++; console.error(`  sendgrid_${resp.status} ${contact.email}: ${String(d).slice(0, 160)}`); continue;
      }
      providerMessageId = resp.headers.get("x-message-id") || "";
    } catch (e) { failed++; console.error(`  send_error ${contact.email}: ${e.message}`); continue; }

    newAttempts.push({
      id: `react-attempt-${shortId()}`,
      contact_id: contact.contact_id,
      campaign_id: REACTIVATION_CAMPAIGN_ID,
      wave: 1,
      step_number: 1,
      to: message.to,
      provider: "sendgrid",
      provider_message_id: providerMessageId,
      status: "sent",
      sent_date: parts.dateKey,
      created_at: nowIso()
    });
    sent++;
    if (sent % 25 === 0) console.log(`  ... ${sent} sent`);
  }

  // --- SCOPED WRITE: append attempts; leave contacts/events/campaign untouched. ---
  const writeState = {
    reactivationContacts: scoped.reactivationContacts,
    reactivationAttempts: [...newAttempts, ...scoped.reactivationAttempts],
    reactivationEvents: scoped.reactivationEvents,
    reactivationCampaign: scoped.reactivationCampaign
  };
  // writeCollections instead of writeState: identical scoped behavior on Supabase (only the
  // collections present reconcile) and SAFE on the JSON backend, where a partial writeState
  // would have replaced the whole file with just these collections (latent wipe hazard).
  await store.writeCollections(writeState);

  console.log(`\nDONE (reactivation collections only — no other prod data touched).`);
  console.log(`  Sent     : ${sent}`);
  console.log(`  Failed   : ${failed}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Recorded : ${newAttempts.length} attempts (status "sent")`);
  const remaining = diag.eligible - sent;
  if (remaining > 0) console.log(`  Remaining eligible Touch-1: ${remaining} — re-run this script to send the next batch (up to ${perRun}).`);
}

main().catch((e) => { console.error("Fire failed:", e.message); process.exit(1); });
