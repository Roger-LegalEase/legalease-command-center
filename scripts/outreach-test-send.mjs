// B2 — ONE-OFF MANUAL TEST SEND. Sends exactly ONE live email: Touch 1 of verified-reporting,
// classification nonprofit, to roger@legalease.com ONLY. This is NOT the autopilot path — it
// does not read the queue, does not loop, and touches no other recipient. Run it in an
// environment that already has SENDGRID_API_KEY + OUTREACH_LIVE_SEND set (e.g. the prod Render
// Shell) so no secret is ever typed or logged.
//
//   node scripts/outreach-test-send.mjs --confirm-live-send
//
// Safety: the recipient is HARD-LOCKED to roger@legalease.com. It refuses to send unless the
// live gate is genuinely on (flag + key); otherwise it reports the dry-run decision and sends
// nothing. It never prints the API key.

import {
  outreachConfigOf, assembleCompliantMessage, validateCompliance, resolveOutreachSendDecision
} from "./outreach-os.mjs";
import { getSequenceTouch } from "./outreach-sequences.mjs";

// ---- HARD LOCKS (a manual test, not a campaign) ---------------------------
const RECIPIENT = "roger@legalease.com";
const SEQUENCE = "verified-reporting";
const TOUCH = 1;
const CLASSIFICATION = "nonprofit";

function fail(msg) { console.error("ABORTED: " + msg); process.exit(1); }

if (!process.argv.includes("--confirm-live-send")) {
  fail("refusing to send without the explicit --confirm-live-send flag.");
}

const env = process.env;
const touch = getSequenceTouch(SEQUENCE, TOUCH);
if (!touch) fail(`could not load ${SEQUENCE} touch ${TOUCH}.`);

const config = outreachConfigOf({}); // baked Delaware compliance identity
const contact = {
  contact_id: "manual-test-roger",
  contact_name: "Roger Roman",
  email: RECIPIENT,
  classification: CLASSIFICATION
};
const org = { organization_name: "LegalEase (manual test)" };
const step = { campaign_id: SEQUENCE, step_number: TOUCH, subject: touch.subject, body: touch.body, classification: CLASSIFICATION };

const message = assembleCompliantMessage({ contact, org, step, config, env });

// Belt-and-suspenders: never let anything but the locked recipient through.
if (message.to !== RECIPIENT) fail(`recipient mismatch (${message.to} != ${RECIPIENT}).`);
const compliance = validateCompliance(message);
if (!compliance.ok) fail(`message not compliant: ${compliance.errors.join(",")}`);

const decision = resolveOutreachSendDecision(message, { env });
console.log("Recipient   :", message.to, "(LOCKED)");
console.log("Sequence    :", decision.sequence || message.sequence);
console.log("Touch       :", decision.touch || message.touch);
console.log("Classification:", message.classification);
console.log("Subject     :", message.subject);
console.log("Decision    :", decision.status, decision.liveSend === undefined ? "" : `(liveSend=${decision.liveSend})`);

if (decision.status !== "live") {
  console.log("\nNo live send performed. The live gate is not fully on (need OUTREACH_LIVE_SEND=true AND SENDGRID_API_KEY).");
  console.log("Status would be:", decision.status, decision.reason ? `(${decision.reason})` : "");
  process.exit(0);
}

// Live path — the SAME SendGrid v3 payload runOutreachSend uses. Exactly one POST.
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

console.log("\n--- SendGrid response ---");
console.log("HTTP status :", resp.status, resp.statusText);
console.log("x-message-id:", resp.headers.get("x-message-id") || "(none)");

if (!resp.ok) {
  const detail = await resp.text().catch(() => "");
  console.log("body        :", String(detail).slice(0, 500));
  fail(`SendGrid returned ${resp.status} — message NOT sent.`);
}

console.log("\nRESULT: status=sent provider=sendgrid (HTTP " + resp.status + ")");
console.log("Sent exactly ONE email to " + RECIPIENT + ".");
