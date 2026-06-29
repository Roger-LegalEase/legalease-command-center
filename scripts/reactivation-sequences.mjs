// MVP Reactivation — consumer (B2C) re-engagement SEQUENCES. Separate from the RCAP B2 outreach
// sequences (outreach-sequences.mjs): these go to FORMER Expungement.ai / LegalEase consumers
// (the "MVP users" list), not to nonprofit/partner orgs. Same cadence, same tested renderer,
// same CAN-SPAM assembly — different audience, different copy, different gate.
//
// SAFETY / UPL POSTURE (this copy is consumer-facing and must stay self-help, never legal advice):
//   - No promise that any record will be cleared, sealed, or expunged.
//   - No eligibility determination ("you qualify"), no outcome guarantee, no deadline pressure.
//   - Frames LegalEase as self-help technology + information; the signature block already carries
//     the "not a law firm / does not provide legal advice" disclaimer (OUTREACH_SIGNATURE_LINES).
//   - The CTA is "return to the account you already started" — a re-engagement link, NOT a sales
//     calendar. It reuses the labeled-link token machinery so a raw URL never shows as link text.
//
// >>> DRAFT COPY — PENDING ROGER'S APPROVAL. <<<
// The wording below is a first draft built to the staging spec. It is wired in so the system is
// fully staged and the seed test can render it, but it is NOT to be treated as approved campaign
// copy until Roger signs off. Nothing can send while REACTIVATION_LIVE_SEND is off (default).

import { renderTouchText, renderTouchHtml } from "./outreach-sequences.mjs";
export { renderTouchText, renderTouchHtml };

// Day offsets from enrollment for touches 1..5 — matches the spec (Day 1/4/9/16/30) and the
// existing OUTREACH_CADENCE_DAYS, kept as its own constant so the consumer campaign stays
// decoupled from the RCAP sequences.
export const REACTIVATION_CADENCE_DAYS = Object.freeze([1, 4, 9, 16, 30]);

// Re-engagement CTA: send the person back to the account they already created. Overridable via
// reactivationConfig.ctaUrl (e.g. a tracked deep link). The token [CALENDAR_LINK:label] renders
// as <a href="ctaUrl">label</a> in HTML and "label: ctaUrl" in plaintext via the shared renderer.
export const REACTIVATION_CTA_URL = "https://app.expungement.ai/login";

// One reactivation sequence (the consumer audience is not classification-routed the way RCAP is;
// every enrolled consumer follows this single approved sequence). The seed (Touch 0) is the
// render-check email sent ONLY to Roger before any wave.
export const REACTIVATION_SEED_TOUCH = Object.freeze({
  step_number: 0,
  day: 0,
  subject: "Seed test — MVP reactivation render check",
  body: `Hi [First Name],

This is the Day 0 seed test for the MVP reactivation campaign. If you're reading this, the From identity, the unsubscribe footer, the signature block, and the [CALENDAR_LINK:return link] all rendered correctly in this inbox.

No consumer has received anything. The live gate is still off.

Roger`
});

export const REACTIVATION_TOUCHES = Object.freeze([
  {
    step_number: 1,
    day: 1,
    subject: "You started looking into clearing your record",
    body: `Hi [First Name],

A while back you started checking your record-clearing options with Expungement.ai (part of LegalEase). It looks like you didn't get to finish.

Nothing on your account has changed, and picking back up takes a few minutes. The tool walks you through what information to gather and what the general process looks like, in plain English.

If you want to pick up where you left off, [CALENDAR_LINK:open your account here]

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "A quick way to see where you stand",
    body: `Hi [First Name],

Following up in case it's useful. A lot of people aren't sure whether an old record can be cleared, or where to even start.

Expungement.ai is built to make that first part less confusing: you answer a few questions and it helps you understand the general steps involved and what to organize. It's self-help information, not legal advice, and there's no cost to look.

You can [CALENDAR_LINK:continue where you left off] whenever you have a few minutes.

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "What clearing a record can change",
    body: `Hi [First Name],

For a lot of people, an old record quietly gets in the way — jobs, housing, background checks. Understanding your options is the first step, and it costs nothing to get oriented.

Your account is still set up from before. If now is a better time, [CALENDAR_LINK:jump back in here]

If this isn't relevant to you anymore, you can unsubscribe at the bottom and I won't follow up.

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "Still here when you're ready",
    body: `Hi [First Name],

No pressure on timing — I just don't want the account you started to go to waste.

Whenever you're ready, the tool is in the same place and will pick up where you left off. [CALENDAR_LINK:open it here]

Roger`
  },
  {
    step_number: 5,
    day: 30,
    subject: "Last note from me",
    body: `Hi [First Name],

This is the last reminder I'll send about the account you started with Expungement.ai.

If clearing an old record is still something you want to understand, the tool is here whenever you are: [CALENDAR_LINK:pick it back up here]

If not, no worries at all — you can unsubscribe below and you won't hear from me again.

Roger`
  }
]);

// Lookup helpers mirroring getSequenceTouch() in outreach-sequences.mjs.
export function getReactivationTouch(stepNumber = 1) {
  if (Number(stepNumber) === 0) return REACTIVATION_SEED_TOUCH;
  return REACTIVATION_TOUCHES.find((t) => t.step_number === Number(stepNumber)) || null;
}

export const REACTIVATION_MAX_TOUCHES = REACTIVATION_TOUCHES.length; // 5
