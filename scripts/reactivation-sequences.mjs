// MVP Reactivation — consumer (B2C) re-engagement SEQUENCES. Separate from the RCAP B2 outreach
// sequences (outreach-sequences.mjs): these go to FORMER Expungement.ai consumers (the "MVP users"
// list), not to nonprofit/partner orgs. Same cadence, same tested renderer, same CAN-SPAM
// assembly — different audience, different copy, different gate.
//
// SAFETY / UPL POSTURE (this copy is consumer-facing and must stay self-help, never legal advice):
//   - No promise that any record will be cleared, sealed, or expunged.
//   - No eligibility determination ("you are eligible"), no outcome guarantee, no deadline pressure.
//   - No "guaranteed", "court-approved", "lawyer-reviewed", or "legal advice" claims.
//   - Expungement.ai was ALWAYS part of LegalEase: NO acquisition / merger / "now part of" /
//     "joined LegalEase" brand-transition framing anywhere.
//   - The signature block (built in reactivation-os.mjs) carries the italic "Expungement.ai is a
//     LegalEase product ... not legal advice ... not a law firm" disclaimer (REACTIVATION_DISCLAIMER).
//     Dividers are HTML <hr> rules — NO em-dash characters anywhere in this campaign's copy.
//   - The ONLY CTA is "Start Free Check" — a link to https://expungement.ai/ (with campaign UTMs)
//     to start a free check on the rebuilt system. NO calendar link, NO booking link, NO "grab a
//     time / book a call". The CTA reuses the labeled-link token machinery so a raw URL never shows
//     as visible HTML text.
//
// TWO sequences (Sequence A / Sequence B), selected per contact by login history (the contact's
// `priority`): never-logged-in contacts get reactivation_never_logged_in; everyone else (warm/cold
// = signed up / used the old product) gets reactivation_logged_in. Enrollment, wave assignment, and
// cadence are UNCHANGED by this — only which copy variant renders is selected here.
//
// Sender / footer config for this campaign (overrides applied via reactivationMessageConfig in
// reactivation-os.mjs):
//   fromEmail "roger@example.com", fromName "LegalEase", replyTo "roger@example.com",
//   sendingDomain "legalease.com", postalAddress "8 The Green, Suite D, Dover, DE 19901".
//   Footer website is expungement.ai (NOT legaleasepartner.com).

import { renderTouchText, renderTouchHtml } from "./outreach-sequences.mjs";
export { renderTouchText, renderTouchHtml };

// Day offsets from enrollment for touches 1..5 — Day 1/4/9/16/30.
export const REACTIVATION_CADENCE_DAYS = Object.freeze([1, 4, 9, 16, 30]);

// Base tracked CTA URL: start a NEW free check on the rebuilt system at expungement.ai, carrying
// campaign UTMs for attribution. Per-touch utm_content (=<sequence_id>_touch_<n>) and the footer
// utm_content (=footer) are appended by the helpers below. NO calendar / booking URL anywhere.
export const REACTIVATION_CTA_URL =
  "https://expungement.ai/?utm_source=mvp_reactivation&utm_medium=email&utm_campaign=expungement_ai_reactivation";

// Campaign-facing sequence ids (used in UTM utm_content and per-contact routing).
export const REACTIVATION_SEQUENCE_LOGGED_IN = "reactivation_logged_in";
export const REACTIVATION_SEQUENCE_NEVER_LOGGED_IN = "reactivation_never_logged_in";
export const DEFAULT_REACTIVATION_SEQUENCE_ID = REACTIVATION_SEQUENCE_LOGGED_IN;
export const REACTIVATION_SEQUENCE_IDS = Object.freeze([
  REACTIVATION_SEQUENCE_LOGGED_IN,
  REACTIVATION_SEQUENCE_NEVER_LOGGED_IN
]);

// Reactivation disclaimer — rendered ITALIC in HTML, between the signature block and the CAN-SPAM
// footer. "Expungement.ai is a LegalEase product" — NEVER acquisition/merger/"now part of" framing.
export const REACTIVATION_DISCLAIMER =
  "Expungement.ai is a LegalEase product. LegalEase provides self-help technology and information, not legal advice, and is not a law firm.";

// Per-touch CTA href: base + utm_content=<sequence_id>_touch_<n>. Falls back to the base URL when
// no touch number is supplied (e.g. the seed). This is the ONLY place per-touch attribution is
// stamped onto the CTA.
export function reactivationCtaUrl(sequenceId = DEFAULT_REACTIVATION_SEQUENCE_ID, touchNumber = 0, base = REACTIVATION_CTA_URL) {
  const sep = base.includes("?") ? "&" : "?";
  const seq = String(sequenceId || "").trim();
  const n = Number(touchNumber);
  if (!seq || !n) return base;
  return `${base}${sep}utm_content=${seq}_touch_${n}`;
}

// Footer website href: base + utm_content=footer.
export function reactivationFooterUrl(base = REACTIVATION_CTA_URL) {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}utm_content=footer`;
}

// The seed (Touch 0) is the render-check email sent ONLY to Roger before any wave.
export const REACTIVATION_SEED_TOUCH = Object.freeze({
  step_number: 0,
  day: 0,
  subject: "Seed test — MVP reactivation render check",
  body: `Hi [First Name],

This is the Day 0 seed test for the MVP reactivation campaign. If you're reading this, the From identity, the unsubscribe footer, the signature block, and the [CALENDAR_LINK:Start Free Check] link all rendered correctly in this inbox.

No consumer has received anything. The live gate is still off.

Best,

Roger`
});

// ---------------------------------------------------------------------------
// Sequence A — reactivation_logged_in (signed up / used the old Mississippi product).
// ---------------------------------------------------------------------------
const LOGGED_IN_TOUCHES = Object.freeze([
  {
    step_number: 1,
    day: 1,
    subject: "Clearing your record on Expungement.ai, now $50",
    body: `Hi [First Name],

You signed up for Expungement.ai when we first launched in Mississippi.

Since then, we rebuilt Expungement.ai from the ground up. It now supports all 50 states plus D.C., the experience is easier to use, and the paid packet path is now $50 instead of the old $150 / $500 pricing.

The check is still free. The $50 only applies if there is a supported paid packet path and you decide to move forward.

If clearing or sealing a record is still something you want to look into, you can start a new free check here:

[CALENDAR_LINK:Start Free Check]

No pressure either way. I just wanted to make sure you knew the rebuilt version is live.

Best,

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "A lot changed since you signed up",
    body: `Hi [First Name],

Quick follow-up.

When we first launched Expungement.ai, it was early, limited, and only active in Mississippi. We learned a lot from that first version.

The rebuilt platform now supports all 50 states plus D.C. It is built to be clearer, more secure, and easier to use. It walks you through a free check, explains possible next steps in plain English, and only moves forward when there is a supported path.

The price is much lower now too. The free check is still free, and the supported paid packet path is now $50 instead of the old $150 / $500 pricing.

You can start again here:

[CALENDAR_LINK:Start Free Check]

Best,

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "Still want to check your options?",
    body: `Hi [First Name],

A lot of people put this off because the process feels confusing, expensive, or embarrassing.

That is exactly why we rebuilt Expungement.ai.

You can answer the questions privately, from home, and see whether there may be a record-clearing path available for your situation.

It is not legal advice, and it does not guarantee a court outcome. But it can help you understand possible next steps without paying thousands up front.

Start a free check here:

[CALENDAR_LINK:Start Free Check]

Best,

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "$50, not $150",
    body: `Hi [First Name],

One of the biggest changes since you first signed up is the price.

The old version had higher pricing. The rebuilt version is simple: the free check is free, and when there is a supported paid packet path, it is $50.

We made that change because record-clearing help should not be out of reach for people who need a fresh start.

If this is still on your mind, you can start here:

[CALENDAR_LINK:Start Free Check]

Best,

Roger`
  },
  {
    step_number: 5,
    day: 30,
    subject: "Should I close the loop?",
    body: `Hi [First Name],

I do not want to keep bothering you.

You signed up for Expungement.ai when we were still early and Mississippi-only. The rebuilt version is now live, supports all 50 states plus D.C., and the supported paid packet path is now $50.

If clearing or sealing a record is still something you want to explore, you can start a free check here:

[CALENDAR_LINK:Start Free Check]

If not, no problem. You can ignore this, or unsubscribe below and we will not keep emailing you.

Wishing you the best either way.

Best,

Roger`
  }
]);

// ---------------------------------------------------------------------------
// Sequence B — reactivation_never_logged_in (created an account, never finished).
// ---------------------------------------------------------------------------
const NEVER_LOGGED_IN_TOUCHES = Object.freeze([
  {
    step_number: 1,
    day: 1,
    subject: "Clearing your record on Expungement.ai, now $50",
    body: `Hi [First Name],

You created an Expungement.ai account when we first launched in Mississippi, but you may not have gotten all the way through.

Since then, we rebuilt Expungement.ai from the ground up. It now supports all 50 states plus D.C., the experience is easier to use, and the paid packet path is now $50 instead of the old $150 / $500 pricing.

The check is still free. The $50 only applies if there is a supported paid packet path and you decide to move forward.

If clearing or sealing a record is still something you want to look into, you can start a new free check here:

[CALENDAR_LINK:Start Free Check]

No pressure either way. I just wanted to make sure you knew the rebuilt version is live.

Best,

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "A lot changed since you created your account",
    body: `Hi [First Name],

Quick follow-up.

The first version of Expungement.ai was early, limited, and only active in Mississippi. The rebuilt version is much easier to use and now supports all 50 states plus D.C.

You can answer the questions privately, from home, and see whether there may be a supported path for your situation.

The free check is still free. If there is a supported paid packet path and you decide to move forward, it is now $50 instead of the old $150 / $500 pricing.

You can start here:

[CALENDAR_LINK:Start Free Check]

Best,

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "Still want to check your options?",
    body: `Hi [First Name],

A lot of people put this off because the process feels confusing, expensive, or embarrassing.

That is exactly why we rebuilt Expungement.ai.

You do not have to call a law office just to understand where to start. You can answer the questions privately, from home, and see whether there may be a record-clearing path available for your situation.

It is not legal advice, and it does not guarantee a court outcome. But it can help you understand possible next steps without paying thousands up front.

Start a free check here:

[CALENDAR_LINK:Start Free Check]

Best,

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "$50, not $150",
    body: `Hi [First Name],

One of the biggest changes since the first version is the price.

The rebuilt version is simple: the free check is free, and when there is a supported paid packet path, it is $50.

We made that change because record-clearing help should not be out of reach for people who need a fresh start.

If this is still on your mind, you can start here:

[CALENDAR_LINK:Start Free Check]

Best,

Roger`
  },
  {
    step_number: 5,
    day: 30,
    subject: "Should I close the loop?",
    body: `Hi [First Name],

I do not want to keep bothering you.

You created an Expungement.ai account when we were still early and Mississippi-only. The rebuilt version is now live, supports all 50 states plus D.C., and the supported paid packet path is now $50.

If clearing or sealing a record is still something you want to explore, you can start a free check here:

[CALENDAR_LINK:Start Free Check]

If not, no problem. You can ignore this, or unsubscribe below and we will not keep emailing you.

Wishing you the best either way.

Best,

Roger`
  }
]);

export const REACTIVATION_SEQUENCES = Object.freeze({
  [REACTIVATION_SEQUENCE_LOGGED_IN]: Object.freeze({
    id: REACTIVATION_SEQUENCE_LOGGED_IN,
    cadence: REACTIVATION_CADENCE_DAYS,
    touches: LOGGED_IN_TOUCHES
  }),
  [REACTIVATION_SEQUENCE_NEVER_LOGGED_IN]: Object.freeze({
    id: REACTIVATION_SEQUENCE_NEVER_LOGGED_IN,
    cadence: REACTIVATION_CADENCE_DAYS,
    touches: NEVER_LOGGED_IN_TOUCHES
  })
});

// Backward-compatible: the live (logged-in) sequence is the default touch set; the seed test and
// the existing test-reactivation-os.mjs call getReactivationTouch(0) / getReactivationTouch(5).
export const REACTIVATION_TOUCHES = LOGGED_IN_TOUCHES;

// Which sequence a contact belongs to, by login history. never_logged_in priority => Sequence B;
// everyone else (warm/cold = signed up / used the old product) => Sequence A. Selection only — does
// not touch enrollment or wave assignment.
export function sequenceIdForContact(contact = {}) {
  const priority = String(contact.priority ?? "").trim().toLowerCase();
  return priority === "never_logged_in" ? REACTIVATION_SEQUENCE_NEVER_LOGGED_IN : REACTIVATION_SEQUENCE_LOGGED_IN;
}

export function getReactivationSequence(sequenceId = DEFAULT_REACTIVATION_SEQUENCE_ID) {
  return REACTIVATION_SEQUENCES[String(sequenceId || "").trim()] || REACTIVATION_SEQUENCES[DEFAULT_REACTIVATION_SEQUENCE_ID];
}

// Lookup helper. Backward-compatible calling conventions:
//   getReactivationTouch(step)                 -> default (logged-in) sequence touch
//   getReactivationTouch(sequenceId, step)     -> a specific sequence's touch
// Touch 0 (the seed) is shared across both sequences.
export function getReactivationTouch(a, b) {
  let sequenceId, step;
  if (b === undefined) { sequenceId = DEFAULT_REACTIVATION_SEQUENCE_ID; step = a; }
  else { sequenceId = a; step = b; }
  if (Number(step) === 0) return REACTIVATION_SEED_TOUCH;
  const seq = getReactivationSequence(sequenceId);
  return seq.touches.find((t) => t.step_number === Number(step)) || null;
}

export const REACTIVATION_MAX_TOUCHES = LOGGED_IN_TOUCHES.length; // 5
