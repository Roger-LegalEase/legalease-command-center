// MVP Reactivation — COPY / SUBJECT / FOOTER / LINK verification tests. Renders every touch of both
// sequences (reactivation_logged_in + reactivation_never_logged_in) plus the seed through the SAME
// compliant builder the live campaign uses, and asserts the copy-only patch:
//   clean subject, no calendar/booking language, no brand-transition framing, no legaleasepartner.com,
//   expungement.ai footer website, hyperlinked brand + CTA, UTM in href only, unsubscribe + postal,
//   "Hi there," fallback, no raw merge fields, gates OFF, and the staged 3,827 / 300·700·1200·1627
//   wave plan unchanged.
//
// This file intentionally does NOT assert the retired 3,833 count or the 600/900/1100/1233 wave
// sizes — those plans were superseded by the staged production plan.

import assert from "node:assert";
import {
  getReactivationTouch, sequenceIdForContact,
  REACTIVATION_SEQUENCE_LOGGED_IN, REACTIVATION_SEQUENCE_NEVER_LOGGED_IN,
  REACTIVATION_SEQUENCE_IDS, REACTIVATION_MAX_TOUCHES, REACTIVATION_SEED_TOUCH
} from "./reactivation-sequences.mjs";
import {
  reactivationLiveSendEnabled, reactivationCampaignOf, DEFAULT_REACTIVATION_CONFIG,
  importReactivationContacts, applyWaveAssignment, releaseWave, actReactivation
} from "./reactivation-os.mjs";
import { outreachLiveSendEnabled } from "./outreach-os.mjs";
import { renderReactivationTouch } from "./reactivation-render-review.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

console.log("\nMVP Reactivation — copy / subject / footer / link tests\n");

// Render every touch (1..5) of both sequences + the seed; collect subjects/html/text for sweeps.
const rendered = [];
for (const sequenceId of REACTIVATION_SEQUENCE_IDS) {
  for (let touch = 1; touch <= REACTIVATION_MAX_TOUCHES; touch++) {
    const message = renderReactivationTouch({ sequenceId, touchNumber: touch, firstName: "Tanya" }, {}, {});
    rendered.push({ sequenceId, touch, message });
  }
}
const seedMessage = renderReactivationTouch({ sequenceId: REACTIVATION_SEQUENCE_LOGGED_IN, touchNumber: 0, firstName: "Roger" }, {}, {});
const allMessages = [...rendered.map((r) => r.message), seedMessage];
const allHtml = allMessages.map((m) => m.html);
const allText = allMessages.map((m) => m.text);
const allBlobs = [...allHtml, ...allText];
const allSubjects = [...rendered.map((r) => r.message.subject), seedMessage.subject];

const everyBlob = (re, msg) => assert(allBlobs.every((b) => !re.test(b)), msg);
const visibleText = (html) => html.replace(/<[^>]+>/g, " ");                 // strip ALL tags
const visibleOutsideAnchors = (html) => html.replace(/<a\b[^>]*>.*?<\/a>/gis, " ").replace(/<[^>]+>/g, " ");

// 1. No Google Calendar URL anywhere.
everyBlob(/calendar\.google\.com/i, "no Google Calendar URL anywhere");
ok("1. no Google Calendar URL appears anywhere");

// 2 & 3. No booking / calendar language; no "grab a time".
for (const phrase of [/grab a time/i, /book a call/i, /book a quick/i, /booking/i, /\bcalendar\b/i, /pick a time/i, /15 minutes/i]) {
  everyBlob(phrase, `no booking/calendar language: ${phrase}`);
}
ok("2/3. no booking/calendar language and no \"grab a time\" anywhere");

// 4. Touch 1 subject is exactly the clean-comma version (both sequences).
for (const sequenceId of REACTIVATION_SEQUENCE_IDS) {
  assert.equal(getReactivationTouch(sequenceId, 1).subject, "Clearing your record on Expungement.ai, now $50", `${sequenceId} touch 1 subject`);
}
ok("4. Touch 1 subject is exactly \"Clearing your record on Expungement.ai, now $50\"");

// 5. No floating-comma version of the subject anywhere.
assert(allSubjects.every((s) => !s.includes("Expungement.ai , now $50")), "no floating-comma subject");
everyBlob(/Expungement\.ai , now \$50/, "no floating-comma subject in bodies");
ok("5. no floating-comma \"Expungement.ai , now $50\" anywhere");

// 6-9. No acquisition / merger / brand-transition framing.
for (const phrase of [/now part of LegalEase/i, /joined LegalEase/i, /acquired by LegalEase/i, /merged with LegalEase/i, /part of the LegalEase family/i]) {
  everyBlob(phrase, `no brand-transition framing: ${phrase}`);
  assert(allSubjects.every((s) => !phrase.test(s)), `no brand-transition framing in subject: ${phrase}`);
}
ok("6-9. no \"now part of / joined / acquired by / merged with LegalEase\" anywhere");

// 10. No legaleasepartner.com anywhere.
everyBlob(/legaleasepartner\.com/i, "no legaleasepartner.com anywhere");
ok("10. legaleasepartner.com does not appear anywhere");

// 11 & 12. Footer website is expungement.ai; Delaware address exact.
for (const m of allMessages) {
  assert(/expungement\.ai/.test(visibleText(m.html)), "footer/body shows expungement.ai");
  assert.equal(m.postalAddress, "8 The Green, Suite D, Dover, DE 19901", "exact Delaware postal address");
  assert(m.text.includes("8 The Green, Suite D") && m.text.includes("Dover, DE 19901"), "address present in body");
}
ok("11/12. footer website is expungement.ai; Delaware address exact in every message");

// 13. Every visible "Expungement.ai" in HTML is hyperlinked (none left outside an anchor).
for (const html of allHtml) {
  assert(!/Expungement\.ai/.test(visibleOutsideAnchors(html)), "no un-hyperlinked Expungement.ai in HTML");
  assert(/<a href="[^"]+">Expungement\.ai<\/a>/.test(html), "Expungement.ai rendered as an anchor");
}
ok("13. every visible Expungement.ai in HTML is hyperlinked");

// 14. Every visible "expungement.ai" (footer website) is hyperlinked.
for (const html of allHtml) {
  assert(!/expungement\.ai/i.test(visibleOutsideAnchors(html)), "no un-hyperlinked expungement.ai in HTML");
  assert(/<a href="[^"]+">expungement\.ai<\/a>/.test(html), "footer expungement.ai is an anchor");
}
ok("14. every visible expungement.ai in footer HTML is hyperlinked");

// 15. Every Start Free Check CTA is a hyperlink (none as plain visible text).
for (const r of rendered) {
  const html = r.message.html;
  assert(/<a href="[^"]+">Start Free Check<\/a>/.test(html), "Start Free Check is an anchor");
  assert(!/Start Free Check/.test(visibleOutsideAnchors(html)), "no plain-text Start Free Check");
}
ok("15. every Start Free Check CTA is a hyperlink");

// 16. The long UTM URL lives in href only — never as visible HTML text.
for (const html of allHtml) {
  const vis = visibleText(html);
  assert(!/utm_/.test(vis), "no UTM string in visible HTML text");
  assert(!/https?:\/\//.test(vis), "no raw URL in visible HTML text");
}
ok("16. long UTM URL is in href only, not visible HTML text");

// 17. UTM parameters present in every CTA href, with per-touch utm_content.
for (const r of rendered) {
  const m = r.message.html.match(/<a href="([^"]+)">Start Free Check<\/a>/);
  assert(m, "CTA href found");
  const href = m[1];
  assert(/utm_source=mvp_reactivation/.test(href), "utm_source");
  assert(/utm_medium=email/.test(href), "utm_medium");
  assert(/utm_campaign=expungement_ai_reactivation/.test(href), "utm_campaign");
  assert(new RegExp(`utm_content=${r.sequenceId}_touch_${r.touch}`).test(href), `utm_content=${r.sequenceId}_touch_${r.touch}`);
}
ok("17. UTM parameters present in every CTA href (per-touch utm_content)");

// 18. Unsubscribe link appears (header + clickable footer link).
for (const m of allMessages) {
  assert(m.unsubscribeUrl && /\/unsubscribe\?token=/.test(m.unsubscribeUrl), "unsubscribe url present");
  assert(/<a href="[^"]+">Unsubscribe<\/a>/.test(m.html), "unsubscribe is a footer anchor");
  assert(/Unsubscribe:/.test(m.text), "unsubscribe in plaintext");
  assert(m.headers && /unsubscribe/i.test(m.headers["List-Unsubscribe"] || ""), "List-Unsubscribe header");
}
ok("18. unsubscribe link appears (footer anchor + List-Unsubscribe header)");

// 19. Postal address appears in body (already exact-checked above; assert presence in plaintext).
for (const m of allMessages) assert(m.text.includes("Dover, DE 19901"), "postal address in body");
ok("19. postal address appears in every message");

// 20. No eligibility or court-outcome GUARANTEE (the disclaimer's "does not guarantee" is allowed).
for (const phrase of [/you are eligible/i, /you qualify/i, /\bguaranteed\b/i, /we can clear your record/i, /court-approved/i, /lawyer-reviewed/i]) {
  everyBlob(phrase, `no guarantee/eligibility claim: ${phrase}`);
}
ok("20. no eligibility or outcome guarantee anywhere");

// 21. No raw merge fields / unrendered tokens remain.
for (const token of ["[First Name]", "[Organization]", "[CALENDAR_LINK", "{{", "}}"]) {
  assert(allBlobs.every((b) => !b.includes(token)), `no raw token ${token}`);
}
ok("21. no raw merge fields or unrendered tokens remain");

// 22. "Hi there," fallback works when no first name is supplied.
const fallback = renderReactivationTouch({ sequenceId: REACTIVATION_SEQUENCE_NEVER_LOGGED_IN, touchNumber: 1, firstName: "" }, {}, {});
assert(fallback.text.startsWith("Hi there,"), "plaintext Hi there, fallback");
assert(/<div>Hi there,/.test(fallback.html), "html Hi there, fallback");
assert(!fallback.html.includes("[First Name]") && !fallback.text.includes("[First Name]"), "no raw merge field on fallback");
ok("22. \"Hi there,\" fallback works (no first name)");

// 23. Live send gate defaults OFF.
assert.equal(reactivationLiveSendEnabled({}), false, "REACTIVATION_LIVE_SEND default OFF");
assert.equal(outreachLiveSendEnabled({}), false, "OUTREACH_LIVE_SEND default OFF");
ok("23. live send remains OFF (both gates default off)");

// 24. Autopilot / auto-advance OFF by default; campaign staged, operator releases each wave.
const camp = reactivationCampaignOf({});
assert.equal(camp.status, "staged", "campaign staged by default");
assert.equal(camp.autoAdvanceWaves, false, "wave auto-advance OFF by default");
assert.equal(camp.releasedWaves.length, 0, "no waves released by default");
ok("24. autopilot/auto-advance remains OFF; campaign staged");

// 25 & 26. Dry-run renders Touch 1 for both variants; act() without a live dep performs NO send.
const loggedInT1 = renderReactivationTouch({ sequenceId: REACTIVATION_SEQUENCE_LOGGED_IN, touchNumber: 1, firstName: "Tanya" }, {}, {});
const neverT1 = renderReactivationTouch({ sequenceId: REACTIVATION_SEQUENCE_NEVER_LOGGED_IN, touchNumber: 1, firstName: "there" }, {}, {});
assert.equal(loggedInT1.subject, "Clearing your record on Expungement.ai, now $50");
assert.equal(neverT1.subject, "Clearing your record on Expungement.ai, now $50");
assert(loggedInT1.text.includes("You signed up for Expungement.ai"), "logged_in variant copy");
assert(neverT1.text.includes("You created an Expungement.ai account"), "never_logged_in variant copy");
ok("26. dry-run renders Touch 1 for both logged-in and never-logged-in variants");

(async () => {
  // Build a tiny released-wave state and run act() with NO live dep => dry_run only, no SendGrid.
  const imp = importReactivationContacts({}, [
    { email: "warm1@gmail.com", full_name: "Warm One", priority: "warm" },
    { email: "never1@gmail.com", full_name: "Never One", priority: "never_logged_in" }
  ]);
  const applied = applyWaveAssignment(imp.state, reactivationCampaignOf(imp.state));
  const enrolledAt = new Date("2026-06-29T15:00:00Z").getTime() - 3 * 24 * 60 * 60 * 1000;
  const rel = releaseWave(applied.state, 1, { now: new Date(enrolledAt).toISOString() });
  const dry = await actReactivation(rel.state, { now: new Date("2026-07-01T15:00:00Z") }); // no runReactivationSend
  assert(dry.state.reactivationAttempts.length > 0, "dry_run attempts recorded");
  assert(dry.state.reactivationAttempts.every((a) => a.status === "dry_run"), "no live dep => dry_run only (SendGrid not called)");
  ok("25. SendGrid is not called while the live flag is off (act() is dry_run without a dep)");

  // Correct sequence selection by login history.
  assert.equal(sequenceIdForContact({ priority: "never_logged_in" }), REACTIVATION_SEQUENCE_NEVER_LOGGED_IN);
  assert.equal(sequenceIdForContact({ priority: "warm" }), REACTIVATION_SEQUENCE_LOGGED_IN);
  assert.equal(sequenceIdForContact({ priority: "cold" }), REACTIVATION_SEQUENCE_LOGGED_IN);
  ok("routing: never_logged_in -> Sequence B; warm/cold -> Sequence A");

  // 27 & 28. Staged plan unchanged: 3,827 contacts split into 300 / 700 / 1200 / 1627.
  assert.deepEqual(
    DEFAULT_REACTIVATION_CONFIG.waves.map((w) => w.plannedSize),
    [300, 700, 1200, null],
    "wave plan is 300 / 700 / 1200 / remainder"
  );
  const rows = Array.from({ length: 3827 }, (_, i) => ({ email: `mvp${i}@gmail.com`, full_name: `MVP ${i}`, priority: "cold" }));
  const bulk = importReactivationContacts({}, rows);
  assert.equal(bulk.state.reactivationContacts.length, 3827, "3,827 contacts loaded");
  const waved = applyWaveAssignment(bulk.state, reactivationCampaignOf(bulk.state));
  assert.deepEqual(waved.waveSizes, { 1: 300, 2: 700, 3: 1200, 4: 1627 }, "waves remain 300 / 700 / 1200 / 1627");
  ok("27/28. 3,827 contacts split into waves 300 / 700 / 1200 / 1627 (plan unchanged)");

  // Sanity: the seed touch and max touches.
  assert.equal(REACTIVATION_SEED_TOUCH.step_number, 0, "seed is Touch 0");
  assert.equal(REACTIVATION_MAX_TOUCHES, 5, "5 cadence touches");

  console.log(`\nAll ${passed} reactivation-copy checks passed.`);
})();
