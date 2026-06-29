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
//   - The CTA is "Start Free Check" — a link to expungement.ai (with campaign UTMs) to START a
//     NEW free check on the rebuilt system. This is an entirely new build: there are NO legacy
//     accounts, so the copy NEVER implies a pre-existing account ("return / log back in / your
//     account / pick up where you left off"). Every touch opens with the Expungement.ai -> LegalEase
//     recognition bridge (first sentence or two) so a recipient who knows "Expungement.ai" places
//     it before the body asks anything. Product facts woven in: rebuilt from the ground up, free
//     check, available in all 50 states, service starts at $50. The CTA reuses the labeled-link
//     token machinery so a raw URL never shows as link text.
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

// CTA: start a NEW free check on the rebuilt system at expungement.ai, carrying campaign UTMs for
// attribution (the engine appends utm_content=touch<N> per touch at send time). Overridable via
// reactivationConfig.ctaUrl. The token [CALENDAR_LINK:label] renders as <a href="ctaUrl">label</a>
// in HTML and "label: ctaUrl" in plaintext via the shared renderer.
export const REACTIVATION_CTA_URL = "https://expungement.ai/?utm_source=legalease&utm_medium=email&utm_campaign=mvp_reactivation";

// One reactivation sequence (the consumer audience is not classification-routed the way RCAP is;
// every enrolled consumer follows this single approved sequence). The seed (Touch 0) is the
// render-check email sent ONLY to Roger before any wave.
export const REACTIVATION_SEED_TOUCH = Object.freeze({
  step_number: 0,
  day: 0,
  subject: "Seed test — MVP reactivation render check",
  body: `Hi [First Name],

This is the Day 0 seed test for the MVP reactivation campaign. Expungement.ai is now part of LegalEase. If you're reading this, the From identity, the unsubscribe footer, the signature block, and the [CALENDAR_LINK:Start Free Check] link all rendered correctly in this inbox.

No consumer has received anything. The live gate is still off.

Roger`
});

export const REACTIVATION_TOUCHES = Object.freeze([
  {
    step_number: 1,
    day: 1,
    subject: "Expungement.ai is now part of LegalEase",
    body: `Hi [First Name],

You signed up for Expungement.ai — it's now part of LegalEase, and we've rebuilt the whole thing from the ground up.

The new version is a free check that walks you through what clearing an old record involves, in plain English, and it's available in all 50 states. The check is free; if you decide to move forward, the service starts at $50.

[CALENDAR_LINK:Start Free Check]

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "A free way to see what clearing a record involves",
    body: `Hi [First Name],

Quick follow-up — Expungement.ai is now part of LegalEase, rebuilt from scratch, and the new free check is live.

A lot of people aren't sure where to start or whether it's even worth it. The check explains the general steps in plain English, works in all 50 states, and costs nothing to run. If you go ahead, the service starts at $50. It's self-help information, not legal advice.

[CALENDAR_LINK:Start Free Check]

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "What clearing an old record can change",
    body: `Hi [First Name],

Expungement.ai is now part of LegalEase, fully rebuilt — I wanted to follow up once more.

An old record can quietly get in the way of jobs, housing, and background checks. The free check helps you understand the general process across all 50 states, with no cost to look; the service itself starts at $50 if you choose to move forward.

[CALENDAR_LINK:Start Free Check]

If this isn't relevant to you, you can unsubscribe at the bottom and I won't follow up.

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "Still here when you're ready",
    body: `Hi [First Name],

No pressure on timing. Expungement.ai is now part of LegalEase, rebuilt from the ground up, and the free check is here whenever you want it — all 50 states, and $50 if you move forward.

[CALENDAR_LINK:Start Free Check]

Roger`
  },
  {
    step_number: 5,
    day: 30,
    subject: "Last note from me",
    body: `Hi [First Name],

This is the last note I'll send. Expungement.ai (now part of LegalEase) has been completely rebuilt, and the free check is open whenever you're ready — all 50 states, and $50 if you decide to go forward.

[CALENDAR_LINK:Start Free Check]

If it's not for you, no worries — you can unsubscribe below and you won't hear from me again.

Roger`
  }
]);

// Lookup helpers mirroring getSequenceTouch() in outreach-sequences.mjs.
export function getReactivationTouch(stepNumber = 1) {
  if (Number(stepNumber) === 0) return REACTIVATION_SEED_TOUCH;
  return REACTIVATION_TOUCHES.find((t) => t.step_number === Number(stepNumber)) || null;
}

export const REACTIVATION_MAX_TOUCHES = REACTIVATION_TOUCHES.length; // 5
