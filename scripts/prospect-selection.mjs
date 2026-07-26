// Bulk prospect approval — the selection and application layer.
//
// WHY THIS EXISTS (Roger, 2026-07-26). 313 organisations sat on the ranked list and every one
// required its own approval click, with no surface that could even issue one. Approval must
// operate on a SET: select by segment, score, source or a filtered view; review the list; approve
// the whole selection in one confirmed action. This module removes the click-count, and only the
// click-count:
//
//   * approval is still a REAL, EXPLICIT human act — the caller confirms an exact count first;
//   * "approved" is still written in exactly one place, the human /api/prospects/approve
//     endpoint, which calls applyBulkProspectDecision below. Engine code still cannot write it
//     (engineSetReviewState in prospect-discovery.mjs throws — that lockout is untouched);
//   * nothing here is autonomous and nothing is pre-approved: an empty id list approves nothing,
//     there is no "approve all" that bypasses the reviewed list, and every id must be pending;
//   * everything DOWNSTREAM of approval is unchanged: promotion still happens in the engine's
//     act() under its autopilot flag, contacts are still seeded not_contacted, and every send
//     still passes the full B2 gate chain (approval, claims ledger, suppression, caps, window).
//     Candidates carry no email at approval time, so approving N organisations makes exactly
//     zero people contactable by itself.

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const PROSPECT_PENDING_STATE = "pending_review";

// The filterable facets, fixed so the surface and the tests agree on what selection means.
// score is the rank the list is already sorted by; classification is the segment.
export const PROSPECT_SELECTION_FACETS = Object.freeze(["classification", "source", "stateCode", "minScore", "maxScore", "q"]);

function matchesFilter(candidate, filter) {
  if (filter.classification && lower(candidate.classification) !== filter.classification) return false;
  if (filter.source && lower(candidate.source) !== filter.source) return false;
  if (filter.stateCode && lower(candidate.state) !== filter.stateCode) return false;
  const score = Number(candidate.score || 0);
  if (filter.minScore !== null && score < filter.minScore) return false;
  if (filter.maxScore !== null && score > filter.maxScore) return false;
  if (filter.q) {
    const haystack = lower([candidate.organization_name, candidate.city, candidate.state, candidate.ntee_label].filter(Boolean).join(" "));
    if (!haystack.includes(filter.q)) return false;
  }
  return true;
}

export function normalizeProspectFilter(input = {}) {
  const numeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return Object.freeze({
    classification: lower(input.classification),
    source: lower(input.source),
    stateCode: lower(input.stateCode || input.state),
    minScore: input.minScore === undefined || input.minScore === "" ? null : numeric(input.minScore),
    maxScore: input.maxScore === undefined || input.maxScore === "" ? null : numeric(input.maxScore),
    q: lower(input.q)
  });
}

/**
 * The ranked, filtered view of PENDING candidates — what "select by tier, score, segment, or
 * filtered view" resolves to. PURE and read-only: ranking is score descending (the order the
 * ranked list already uses), ties broken by name so the view is stable between renders.
 *
 * Only pending_review rows are ever selectable. Approved, rejected and promoted rows cannot
 * re-enter a selection, so a stale checkbox can never re-approve or un-reject anything.
 */
export function selectPendingProspects(state = {}, filterInput = {}) {
  const filter = normalizeProspectFilter(filterInput);
  const pending = list(state.prospectCandidates)
    .filter((candidate) => lower(candidate.review_state) === PROSPECT_PENDING_STATE);

  const matched = pending.filter((candidate) => matchesFilter(candidate, filter))
    .sort((a, b) => (Number(b.score || 0) - Number(a.score || 0))
      || lower(a.organization_name).localeCompare(lower(b.organization_name)));

  const byClassification = {};
  const bySource = {};
  let withEmail = 0;
  for (const candidate of matched) {
    const segment = lower(candidate.classification) || "unclassified";
    byClassification[segment] = (byClassification[segment] || 0) + 1;
    const source = lower(candidate.source) || "unknown";
    bySource[source] = (bySource[source] || 0) + 1;
    if (clean(candidate.email)) withEmail += 1;
  }

  return Object.freeze({
    filter,
    pendingTotal: pending.length,
    matched: matched.length,
    // The honest contact count for the confirmation sentence: how many of the selected
    // organisations have any address on file at all. For discovery candidates this is 0 by
    // design — loaders never attach email — and the surface says so instead of implying reach.
    withEmail,
    byClassification: Object.freeze(byClassification),
    bySource: Object.freeze(bySource),
    rows: Object.freeze(matched.map((candidate) => Object.freeze({
      id: clean(candidate.id),
      organization_name: clean(candidate.organization_name),
      classification: lower(candidate.classification),
      score: Number(candidate.score || 0),
      source: lower(candidate.source),
      state: clean(candidate.state),
      city: clean(candidate.city),
      ntee_label: clean(candidate.ntee_label),
      hasEmail: Boolean(clean(candidate.email)),
      is_duplicate: candidate.is_duplicate === true
    })))
  });
}

/**
 * Applies one confirmed human decision to an explicit id list. Called ONLY by the human
 * /api/prospects/approve and /api/prospects/reject endpoints — this is the same single place
 * "approved" has always been written, now shared by the one-at-a-time and the bulk path.
 *
 * The ids are the EXACT list the human reviewed. Deliberately not a filter re-evaluated at
 * apply time: state can move between preview and confirm, and re-evaluating would approve rows
 * the human never saw. A row that stopped being pending after review is SKIPPED and counted,
 * never silently decided.
 */
export function applyBulkProspectDecision(candidates = [], ids = [], options = {}) {
  const decision = options.decision === "rejected" ? "rejected" : "approved";
  const actorLabel = clean(options.actorLabel) || "operator";
  const now = clean(options.now) || new Date().toISOString();
  const overrideClass = clean(options.classification);
  const wanted = new Set(list(ids).map((id) => clean(id)).filter(Boolean));

  let changed = 0;
  const next = list(candidates).map((candidate) => {
    if (!wanted.has(clean(candidate.id))) return candidate;
    if (lower(candidate.review_state) !== PROSPECT_PENDING_STATE) return candidate; // skipped, counted below
    changed += 1;
    return decision === "approved"
      ? {
        ...candidate,
        ...(overrideClass ? { classification: overrideClass } : {}),
        review_state: "approved",
        approved_at: now,
        approved_by: actorLabel
      }
      : { ...candidate, review_state: "rejected", rejected_at: now, rejected_by: actorLabel };
  });

  return Object.freeze({
    candidates: next,
    decision,
    requested: wanted.size,
    changed,
    // Ids that were asked for but no longer pending (or unknown). Reported so the confirmation
    // toast can say "approved 45, 2 were already decided" instead of a silent shortfall.
    skipped: wanted.size - changed
  });
}

/**
 * The confirmation sentence — built server-agnostic so the surface, the tests and any future
 * caller confirm with the same words. Names the exact organisation count, the exact contactable
 * count (today: zero), and what approval does and does not do.
 */
export function describeProspectApproval(selectionCount = 0, withEmail = 0) {
  const organisations = `${selectionCount} organisation${selectionCount === 1 ? "" : "s"}`;
  const contact = withEmail === 0
    ? "None of them has an email address on file yet, so this makes nobody contactable by itself."
    : `${withEmail} of them ${withEmail === 1 ? "has" : "have"} an email address on file.`;
  return `Approve ${organisations} for partner outreach? ${contact} `
    + "Contact discovery, suppression checks, sending windows and every outreach gate still apply before any email exists or sends.";
}
