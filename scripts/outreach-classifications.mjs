// Shared outreach classification vocabulary — the SINGLE source of truth imported by BOTH
// B2 (outreach-os.mjs) and B5 (prospect-discovery.mjs). B5 may only assign a classification
// drawn from this list, and B2's outreachSequenceSteps / campaigns key their copy off the
// same constant — so a B5 prospect's label ALWAYS matches a B2 sequence key exactly. Adding
// a classification here is the only way to introduce a new RCAP-fit segment; an LLM (B5
// discovery decision #1) can never invent a label outside this set because every label is
// validated through normalizeClassification() before it is stored or promoted.
//
// Order is significant: more specific / higher-fit segments come first so that when text
// matches multiple rules the earliest (most specific) classification wins.
export const OUTREACH_CLASSIFICATIONS = Object.freeze([
  "legal_aid",
  "public_defender",
  "county_reentry",
  "second_chance_employer",
  "nonprofit",
  "government"
]);

export const OUTREACH_CLASSIFICATION_SET = new Set(OUTREACH_CLASSIFICATIONS);

// True only for an exact, normalized member of the vocab.
export function isOutreachClassification(value = "") {
  return OUTREACH_CLASSIFICATION_SET.has(String(value ?? "").trim().toLowerCase());
}

// Returns the canonical classification string, or "" if the input is not in the vocab.
// This is the validation chokepoint: anything not in OUTREACH_CLASSIFICATIONS is dropped to
// "" rather than stored, so no stray/hallucinated label can ever reach the B2 collections.
export function normalizeClassification(value = "") {
  const v = String(value ?? "").trim().toLowerCase();
  return OUTREACH_CLASSIFICATION_SET.has(v) ? v : "";
}
