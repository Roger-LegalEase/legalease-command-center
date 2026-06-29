// MVP Reactivation — Day 0 SEED TEST. Sends the seed touch (Touch 0) to ROGER ONLY, to confirm
// render + inbox placement (Gmail + iCloud/Outlook) BEFORE any wave. This is NOT the campaign
// path: it does not read contacts, does not loop, and HARD-REFUSES to send to anyone who is in
// the reactivation list (so it can never accidentally seed a real consumer).
//
//   REACTIVATION_SEED_RECIPIENTS="roger@legalease.com,roman.roger@gmail.com,roger@icloud.com" \
//     node scripts/reactivation-seed-test.mjs --confirm-live-send
//
// Requires REACTIVATION_LIVE_SEND=true AND SENDGRID_API_KEY in env (e.g. the prod Render Shell),
// so no secret is ever typed or logged. With the gate off it prints the dry-run decision and
// sends nothing. Defaults to Roger's two known addresses if REACTIVATION_SEED_RECIPIENTS is unset.

import {
  outreachConfigOf, assembleCompliantMessage, validateCompliance, resolveOutreachSendDecision,
  normalizeEmail
} from "./outreach-os.mjs";
import { REACTIVATION_CTA_URL, getReactivationTouch } from "./reactivation-sequences.mjs";
import { reactivationLiveSendEnabled } from "./reactivation-os.mjs";
import { createStore } from "./storage.mjs";

const env = process.env;
function fail(msg) { console.error("ABORTED: " + msg); process.exit(1); }

if (!process.argv.includes("--confirm-live-send")) {
  fail("refusing to send without the explicit --confirm-live-send flag.");
}

const DEFAULT_RECIPIENTS = ["roger@legalease.com", "roman.roger@gmail.com"];
const recipients = (env.REACTIVATION_SEED_RECIPIENTS
  ? env.REACTIVATION_SEED_RECIPIENTS.split(",")
  : DEFAULT_RECIPIENTS
).map((r) => normalizeEmail(r)).filter(Boolean);

if (!recipients.length) fail("no seed recipients resolved.");

// HARD GUARD: none of the recipients may be a real reactivation contact.
const store = await createStore();
const state = await store.readState();
const contactEmails = new Set((state.reactivationContacts || []).map((c) => normalizeEmail(c.email)));
for (const r of recipients) {
  if (contactEmails.has(r)) fail(`recipient ${r} is in the reactivation list — refusing (seed test is for Roger only).`);
}

const config = outreachConfigOf(state); // baked Delaware compliance identity
const touch = getReactivationTouch(0);  // Touch 0 = seed
if (!touch) fail("could not load the seed touch.");

const live = reactivationLiveSendEnabled(env) && Boolean(env.SENDGRID_API_KEY);
console.log("Seed recipients :", recipients.join(", "));
console.log("Live gate       :", live ? "ON (REACTIVATION_LIVE_SEND + SENDGRID_API_KEY)" : "OFF — dry run, no send");

for (const recipient of recipients) {
  const contact = { contact_id: `seed-${recipient}`, contact_name: "Roger Roman", email: recipient };
  let message = assembleCompliantMessage({
    contact, org: {}, step: { ...touch, campaign_id: "mvp-reactivation", classification: "" },
    config, env
  });
  // Retarget the CTA link from the calendar default to the reactivation URL.
  message = {
    ...message,
    text: String(message.text).split(/https:\/\/calendar\.google\.com\/[^\s)]+/).join(REACTIVATION_CTA_URL),
    html: String(message.html).split(/https:\/\/calendar\.google\.com\/[^"<\s)]+/).join(REACTIVATION_CTA_URL)
  };
  if (message.to !== recipient) fail(`recipient mismatch (${message.to} != ${recipient}).`);
  const compliance = validateCompliance(message);
  if (!compliance.ok) fail(`message not compliant: ${compliance.errors.join(",")}`);
  const decision = resolveOutreachSendDecision({ ...message, classification: "nonprofit" }, { env });
  // NOTE: resolveOutreachSendDecision routes on RCAP classification; for the seed we only use it
  // to read the dry_run/live posture, not to authorize — the live send below is gated on the
  // reactivation flag explicitly.
  console.log(`\nTo        : ${message.to}`);
  console.log(`Subject   : ${message.subject}`);
  console.log(`Posture   : ${live ? "live" : "dry_run"} (compliance ok)`);

  if (!live) { console.log("No send performed (gate off)."); continue; }

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
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) { const d = await resp.text().catch(() => ""); fail(`SendGrid failed: ${resp.status} ${String(d).slice(0, 200)}`); }
  console.log("SENT      :", resp.headers.get("x-message-id") || "(no id)");
}
