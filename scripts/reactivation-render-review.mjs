// MVP Reactivation — RENDER REVIEW (dry-run, no send, no store write, no network). Assembles a
// reactivation touch through the SAME compliant builder the live campaign uses and prints the
// rendered subject / HTML body / CTA href / footer for Roger's review. Pure render — it never
// reads the live contact list, never sends, and is independent of every send gate.
//
//   node scripts/reactivation-render-review.mjs                 # logged_in + never_logged_in, Touch 1
//   node scripts/reactivation-render-review.mjs <seq> <touch> <firstName>

import { assembleCompliantMessage, outreachLiveSendEnabled } from "./outreach-os.mjs";
import {
  getReactivationTouch, sequenceIdForContact, REACTIVATION_SEQUENCE_IDS,
  REACTIVATION_SEQUENCE_LOGGED_IN, REACTIVATION_SEQUENCE_NEVER_LOGGED_IN
} from "./reactivation-sequences.mjs";
import { reactivationMessageConfig, reactivationLiveSendEnabled, REACTIVATION_CAMPAIGN_ID } from "./reactivation-os.mjs";

// Render a single touch for a given sequence id + sample first name. Returns the assembled message.
export function renderReactivationTouch({ sequenceId = REACTIVATION_SEQUENCE_LOGGED_IN, touchNumber = 1, firstName = "" } = {}, state = {}, env = {}) {
  const touch = getReactivationTouch(sequenceId, touchNumber);
  if (!touch) throw new Error(`no touch ${touchNumber} for sequence ${sequenceId}`);
  const config = reactivationMessageConfig(state, { sequenceId, touchNumber });
  const contact = {
    contact_id: `review-${sequenceId}-t${touchNumber}`,
    email: "review@example.com",
    contact_name: String(firstName || "").trim()
  };
  return assembleCompliantMessage({
    contact,
    org: {},
    step: { ...touch, campaign_id: REACTIVATION_CAMPAIGN_ID, classification: "" },
    config,
    env
  });
}

// Pull the CTA href (Start Free Check) and footer block out of the rendered HTML for the report.
function ctaHrefOf(html = "") {
  const m = String(html).match(/<a href="([^"]+)">Start Free Check<\/a>/);
  return m ? m[1] : "(not found)";
}
function footerHtmlOf(html = "") {
  const idx = String(html).indexOf("—<br>");
  return idx === -1 ? "(footer not found)" : String(html).slice(idx).replace(/<\/div>$/, "");
}

function printReview(label, sequenceId, firstName) {
  const message = renderReactivationTouch({ sequenceId, touchNumber: 1, firstName }, {}, process.env);
  console.log("\n=================================================================");
  console.log(`REVIEW: ${label}  (sequence_id=${sequenceId}, sample firstNameOrThere="${firstName || "there"}")`);
  console.log("=================================================================");
  console.log(`Subject : ${message.subject}`);
  console.log(`From    : ${message.fromName} <${message.from}>   reply-to ${message.replyTo}`);
  console.log(`CTA href: ${ctaHrefOf(message.html)}`);
  console.log(`Unsub   : ${message.unsubscribeUrl ? "present" : "MISSING"}`);
  console.log(`Postal  : ${message.postalAddress}`);
  console.log("\n--- VISIBLE HTML BODY -------------------------------------------");
  console.log(message.html);
  console.log("\n--- FOOTER (HTML) -----------------------------------------------");
  console.log(footerHtmlOf(message.html));
  console.log("\n--- PLAINTEXT ---------------------------------------------------");
  console.log(message.text);
  return message;
}

// Run as a script (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  const [seqArg, touchArg, nameArg] = process.argv.slice(2);
  if (seqArg) {
    printReview(seqArg, seqArg, nameArg || "");
  } else {
    printReview("Sequence A — already used the old product", REACTIVATION_SEQUENCE_LOGGED_IN, "Tanya");
    printReview("Sequence B — created an account, never finished", REACTIVATION_SEQUENCE_NEVER_LOGGED_IN, "there");
  }
  console.log("\n=================================================================");
  console.log("GATE STATUS (render review performs NO send):");
  console.log(`  REACTIVATION_LIVE_SEND : ${reactivationLiveSendEnabled(process.env) ? "ON" : "OFF"}`);
  console.log(`  OUTREACH_LIVE_SEND     : ${outreachLiveSendEnabled(process.env) ? "ON" : "OFF"}`);
  console.log("  No live email was sent. No store was read or written. No network call was made.");
  console.log("=================================================================");
}
