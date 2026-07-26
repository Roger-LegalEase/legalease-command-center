// Founder OS Release 8 — the Press outreach lane.
//
// Press sends email to real journalists, so this module contains NO SEND PATH. It decides two
// things and nothing else:
//
//   1. WHO may be contacted at all (eligibility), and
//   2. WHETHER a drafted pitch is allowed to exist (the Pitch Map guardrail gate).
//
// Everything after that — approval, suppression, reply-stop, CAN-SPAM assembly, sending window,
// volume caps, durable send claims — is the EXISTING partner-outreach machinery in
// `outreach-os.mjs`, reached because press contacts are stored as ordinary `outreachContacts`
// with a press classification. There is deliberately no press equivalent of any of it.
//
// STORAGE. Nothing parallel is created:
//   * identity      -> `companyContacts` with the existing `media` contact type, so a journalist
//                      who is already in the CRM gains a role instead of a duplicate record.
//   * outreach      -> `outreachContacts` with classification `press`, so every existing gate,
//                      cap, claim and suppression check applies unchanged.
//   * press detail  -> fields on that same outreach row (beat, coverage lanes, verification,
//                      confidence, email type, prior coverage).
//   * placements    -> `pressPlacements`, the one genuinely new collection, because coverage that
//                      has already run is not a contact and belongs nowhere else.

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

// ---------------------------------------------------------------------------------------------
// The Pitch Map — 8 angles, verbatim from the source workbook's Pitch Map sheet.
//
// These are NOT guidance. Each guardrail is a hard fail in the same style as the social
// guidelines gate: a draft that trips one cannot be approved, and the failure names the rule.
// The proof list travels with the angle so the draft surface can show what a claim needs BEFORE
// it goes out, rather than after an editor asks.
// ---------------------------------------------------------------------------------------------

export const PRESS_ANGLES = Object.freeze([
  Object.freeze({
    id: "nationwide_milestone",
    label: "Nationwide legal-tech milestone",
    proofRequired: Object.freeze(["Current product screenshots", "State coverage table", "Pricing", "Guardrails", "Usage/traction", "Founder availability"]),
    guardrail: "Do not call it a lawyer replacement or make unqualified eligibility claims.",
    rules: Object.freeze(["no_lawyer_replacement", "no_unqualified_eligibility"])
  }),
  Object.freeze({
    id: "founder_growth",
    label: "Black/HBCU founder growth story",
    proofRequired: Object.freeze(["Founder bios", "Current traction", "Funding history", "Jobs/partner outcomes", "Nationwide milestone"]),
    guardrail: "Avoid relying only on identity; include hard business and impact proof.",
    rules: Object.freeze(["no_identity_only_framing"])
  }),
  Object.freeze({
    id: "economic_mobility",
    label: "Record clearance as economic mobility",
    proofRequired: Object.freeze(["Participant outcomes", "Employment/housing stories", "Partner data", "Cost/time comparisons"]),
    guardrail: "Use consented participant stories and do not overstate causal outcomes.",
    rules: Object.freeze(["no_causal_overstatement", "requires_participant_consent"])
  }),
  Object.freeze({
    id: "ai_guardrails",
    label: "AI guardrails in everyday legal help",
    proofRequired: Object.freeze(["Architecture summary", "Human/legal review", "Claims guardrails", "Examples of when the product stops"]),
    guardrail: "Be transparent about limitations, errors, unsupported cases and legal-advice boundaries.",
    rules: Object.freeze(["no_lawyer_replacement", "no_unqualified_eligibility"])
  }),
  Object.freeze({
    id: "implementation_gap",
    label: "The record-clearing implementation gap",
    proofRequired: Object.freeze(["Anonymized funnel data", "State-by-state barriers", "Abandonment points", "Filing timelines", "Court/agency sources"]),
    guardrail: "This is not a launch pitch; provide data, records and independently interviewable people.",
    rules: Object.freeze(["no_causal_overstatement"])
  }),
  Object.freeze({
    id: "rcap_partner_model",
    label: "RCAP partner model",
    proofRequired: Object.freeze(["Partner workflow", "Sample dashboard", "Pilot results", "Partner quotes", "Privacy/security model"]),
    guardrail: "Discuss implementation costs, limits, referral pathways and partner responsibilities.",
    rules: Object.freeze(["no_unqualified_eligibility"])
  }),
  Object.freeze({
    id: "mississippi_to_nationwide",
    label: "Mississippi-to-nationwide proof",
    proofRequired: Object.freeze(["Mississippi traction", "Local founder roots", "Partner history", "Current nationwide product"]),
    guardrail: "Update old pricing/coverage facts before pitching; distinguish historical MVP from current product.",
    rules: Object.freeze(["no_unqualified_eligibility"])
  }),
  Object.freeze({
    id: "thought_leadership",
    label: "Founder/operator thought leadership",
    proofRequired: Object.freeze(["Specific lessons", "Failures", "Metrics", "Framework", "Non-promotional thesis"]),
    guardrail: "The piece must teach something broader than LegalEase and disclose company interests.",
    rules: Object.freeze(["no_identity_only_framing"])
  })
]);

export function pressAngle(id = "") {
  return PRESS_ANGLES.find((angle) => angle.id === clean(id)) || null;
}

// ---------------------------------------------------------------------------------------------
// The guardrail gate.
//
// Five forbidden framings, each drawn from a Pitch Map guardrail. Every rule applies to EVERY
// draft — an angle's own `rules` are the ones it emphasises, but nothing may claim to replace a
// lawyer just because the angle did not mention it. A rule that only fired on some angles would
// be a guideline, and the charter asked for a gate.
// ---------------------------------------------------------------------------------------------

export const PRESS_GUARDRAIL_RULES = Object.freeze([
  Object.freeze({
    id: "no_lawyer_replacement",
    summary: "No lawyer-replacement framing.",
    // "replaces a lawyer", "instead of hiring an attorney", "no lawyer needed", "lawyer-free"
    pattern: /\b(replac\w*|instead of|no need for|without)\s+(a\s+|an\s+|your\s+|hiring\s+a\s+|hiring\s+an\s+)?(lawyer|attorney|counsel)\b|\b(lawyer|attorney)[- ]free\b|\bno (lawyer|attorney)s? (needed|required)\b/i
  }),
  Object.freeze({
    id: "no_unqualified_eligibility",
    summary: "No unqualified eligibility claim.",
    // "you qualify", "everyone is eligible", "guaranteed expungement", "will clear your record"
    pattern: /\b(guarantee\w*|guaranteed)\b|\beveryone (is|will be) eligible\b|\byou (qualify|are eligible)\b|\bwill (clear|expunge|erase) your record\b|\banyone can (clear|expunge)\b/i
  }),
  Object.freeze({
    id: "no_identity_only_framing",
    summary: "Identity framing without business substance.",
    // Trips only when identity language appears with NO business/impact proof alongside it.
    pattern: /\b(black[- ]owned|black founder|hbcu|minority[- ]owned|first black)\b/i,
    requiresSubstance: true
  }),
  Object.freeze({
    id: "no_causal_overstatement",
    summary: "Causal overstatement on participant outcomes.",
    // "because of LegalEase they got a job", "led directly to employment", "caused"
    pattern: /\b(because of|thanks to|as a direct result of|directly (led|resulted) (to|in)|caused)\b[^.]{0,80}\b(job|employment|housing|hired|apartment)\b|\b(job|employment|housing)\b[^.]{0,40}\bbecause (of )?(legalease|us|the product)\b/i
  }),
  Object.freeze({
    id: "requires_participant_consent",
    summary: "Participant story without recorded consent.",
    // Any named-participant story shape; satisfied only by an explicit consent marker.
    pattern: /\b(one (client|participant|user)|a (client|participant|user) (named|called)|his|her|their) (record|case|story)\b/i,
    requiresConsentMarker: true
  })
]);

// Substance markers that rescue an identity-framed draft: a number, a named outcome, or a
// business fact. Presence of ANY means the draft is not identity-only.
const SUBSTANCE_PATTERN = /\b\d[\d,.]*\s*(%|percent|users|customers|states|partners|clients|records|filings|months|jobs)\b|\b(revenue|traction|funding|partnership|pilot|raised|grew|expanded)\b/i;

// The only thing that satisfies the consent rule. Deliberately explicit: nothing infers consent.
const CONSENT_MARKER_PATTERN = /\bconsent (recorded|on file|obtained|given)\b|\bconsented\b|\brelease signed\b/i;

/**
 * Hard-fail gate for a press draft. Mirrors the social guidelines gate's shape: a list of
 * hardFails, and a `passed` boolean that callers treat as blocking.
 */
export function evaluatePressGuardrails(text = "", angleId = "") {
  const body = clean(text);
  const angle = pressAngle(angleId);
  const hardFails = [];

  for (const rule of PRESS_GUARDRAIL_RULES) {
    if (!rule.pattern.test(body)) continue;
    if (rule.requiresSubstance && SUBSTANCE_PATTERN.test(body)) continue;
    if (rule.requiresConsentMarker && CONSENT_MARKER_PATTERN.test(body)) continue;
    hardFails.push({ rule: rule.id, summary: rule.summary });
  }

  return Object.freeze({
    passed: hardFails.length === 0,
    hardFails: Object.freeze(hardFails),
    angleId: angle?.id || null,
    // Shown in the draft surface so Roger sees what a claim needs BEFORE it goes out.
    proofRequired: angle ? angle.proofRequired : Object.freeze([]),
    guardrail: angle ? angle.guardrail : null,
    ruleSource: "docs/founder-os/workspaces/campaigns.md + Pitch Map (LegalEase_Media_Targets_2026)",
    checkedAt: null
  });
}

// ---------------------------------------------------------------------------------------------
// Eligibility — enforced here, not in documentation.
// ---------------------------------------------------------------------------------------------

export const PRESS_EMAIL_TYPES = Object.freeze({
  direct: "Direct public",
  shared: "Shared newsroom",
  form: "Official contact form",
  submission: "Official submission/contact form"
});

// A shared newsroom address reaches a desk, not a person. It is still contactable, but it must
// never receive a personalised "I read your piece on…" pitch, and it counts against a tighter
// cap because one address can represent an entire masthead.
export const PRESS_SHARED_ADDRESS_DAILY_CAP = 1;

export const PRESS_INELIGIBLE_REASONS = Object.freeze({
  no_email: "No email address on record — this outlet takes pitches through a form, not email.",
  unverified: "This contact has not been verified.",
  stale_verification: "The verification on this contact is out of date.",
  seed_list: "From the Black Press seed list, which is unverified research rather than a contact record.",
  rejected: "This contact was rejected during verification."
});

// A verification older than this is stale. Journalists move desks constantly; a year-old
// verification is a guess.
export const PRESS_VERIFICATION_MAX_AGE_DAYS = 180;

/**
 * Decides whether a press contact may be contacted by email at all, and says why not when not.
 * This runs BEFORE any of the existing outreach gates — it never replaces them.
 */
export function pressEligibility(contact = {}, { now = new Date().toISOString() } = {}) {
  const ineligible = (reason) => Object.freeze({
    sendable: false,
    reason,
    detail: PRESS_INELIGIBLE_REASONS[reason] || "Not eligible to contact.",
    emailType: clean(contact.press_email_type) || null,
    shared: false
  });

  if (contact.press_source === "black_press_seed") return ineligible("seed_list");
  if (lower(contact.press_verification_status) === "rejected") return ineligible("rejected");

  const verifiedAt = clean(contact.press_verified_at);
  if (!verifiedAt) return ineligible("unverified");
  const verifiedMs = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) ? `${verifiedAt}T00:00:00.000Z` : verifiedAt);
  if (!Number.isFinite(verifiedMs)) return ineligible("unverified");
  const ageDays = (Date.parse(now) - verifiedMs) / 86_400_000;
  if (Number.isFinite(ageDays) && ageDays > PRESS_VERIFICATION_MAX_AGE_DAYS) return ineligible("stale_verification");

  const email = clean(contact.email);
  if (!email || !email.includes("@")) return ineligible("no_email");

  const type = clean(contact.press_email_type);
  const shared = type === PRESS_EMAIL_TYPES.shared;

  return Object.freeze({
    sendable: true,
    reason: null,
    detail: shared
      ? "Shared newsroom address — reaches a desk, not a person. Do not personalise, and it counts against a tighter cap."
      : "Direct public address.",
    emailType: type || null,
    shared,
    // Consumed by the caller when it asks the existing outreach caps for a decision.
    dailyCap: shared ? PRESS_SHARED_ADDRESS_DAILY_CAP : null,
    personalise: !shared
  });
}

// The 19 prior placements are warm follow-ups, not cold pitches. Saying so in code stops a
// warm contact being swept into a cold sequence.
export function pressOutreachKind(contact = {}) {
  const relationship = lower(contact.press_relationship);
  if (relationship.includes("warm")) {
    return Object.freeze({
      kind: "warm_follow_up",
      label: "Warm follow-up",
      // Made available to the composer so Roger is drafting from the recorded recommendation.
      recommendedFollowUp: clean(contact.press_recommended_follow_up) || null
    });
  }
  if (relationship.includes("adjacent")) return Object.freeze({ kind: "adjacent", label: "Adjacent relationship", recommendedFollowUp: null });
  return Object.freeze({ kind: "cold_pitch", label: "Cold pitch", recommendedFollowUp: null });
}

// The one genuinely new collection: coverage that has already run.
export const PRESS_PLACEMENT_COLLECTION = "pressPlacements";
