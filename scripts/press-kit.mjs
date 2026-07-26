// Founder OS — the press kit, registered as the Press lane's approved proof and claims source.
//
// `docs/press/LegalEase_Press_Kit_July_2026_Rebuilt.pdf` is the ONE ratified source. Two things
// follow from that, and this module exists to make both enforceable rather than advisory:
//
//   1. PROOF. Every Pitch Map proof requirement resolves to a kit section that supplies it, or to
//      a follow-up artifact that does not exist yet. The Plan stage shows the split, so Roger sees
//      what he can pitch on today instead of a checklist he cannot clear.
//   2. CLAIMS. The kit's boundary language is the outer edge of what a draft may say. A draft that
//      contradicts any of it is a hard fail in the gate, in the same shape as the Pitch Map rules.
//
// FOLLOW-UP, NOT BLOCKER (Roger's decision, 2026-07-26). Traction figures and a participant story
// are NOT in the kit and do NOT gate a pitch. Roger shares traction with a journalist who shows
// interest, and pursues a story with recorded consent if one is wanted. So a draft OFFERS them on
// request and never states a figure or tells a story it does not have — which is why
// `no_unbacked_figure` exists, and why the consent rule in `press-outreach.mjs` is untouched and
// exactly as strict as it was.

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const PRESS_KIT = Object.freeze({
  id: "press_kit_2026_07",
  file: "docs/press/LegalEase_Press_Kit_July_2026_Rebuilt.pdf",
  title: "LegalEase + Expungement.ai — Press Kit, July 2026",
  // The kit dates itself on every page and in its publication note. A pitch that outlives this
  // date is pitching stale facts, which is precisely what the Mississippi angle's guardrail warns
  // about, so the date travels with the source rather than living in a comment.
  currentAsOf: "2026-07-26",
  pages: 13,
  // The media and partner addresses live in the kit's section 09 and on the public press page.
  // They are deliberately NOT duplicated here: the repo's PII gate rejects any non-reserved email
  // address in tracked source, and a second copy of a contact address is a second thing to keep
  // current.
  pressPage: "legalease.com/legalease/press",
  contactSection: "boilerplate_bios",
  approvedBy: "roger",
  registeredAt: "2026-07-26"
});

// ---------------------------------------------------------------------------------------------
// The nine sections, and what each one is allowed to prove.
// ---------------------------------------------------------------------------------------------

export const PRESS_KIT_SECTIONS = Object.freeze([
  Object.freeze({
    id: "fact_sheet", number: "01", label: "Company + product fact sheet", pages: [3],
    proves: Object.freeze([
      "The company, the flagship live product and who it serves.",
      "The approved one-sentence description, quotable verbatim.",
      "Free screening in all 50 states and D.C.; $50 packet preparation; EN + ES support."
    ])
  }),
  Object.freeze({
    id: "architecture", number: "02", label: "Architecture summary", pages: [4],
    proves: Object.freeze([
      "The end-to-end workflow: free screening, rules engine, decision state, payment gate, Briefcase.",
      "The engine decides and Wilma explains — deterministic rules and hard gates, not a chatbot.",
      "The no-payment principle: payment is coupled to packet availability, not to asking.",
      "Partner access runs the same workflow with the same guardrails."
    ])
  }),
  Object.freeze({
    id: "human_legal_review", number: "03", label: "Human + legal review", pages: [5],
    proves: Object.freeze([
      "Four review layers: legal source review, attorney-reviewed document logic, engineering QA, human escalation.",
      "The key distinction: reviewed product logic is not review of any individual case.",
      "The escalation triggers: source uncertainty, complexity or contest, high-stakes consequences."
    ])
  }),
  Object.freeze({
    id: "where_it_stops", number: "04", label: "Where the product stops", pages: [6],
    proves: Object.freeze([
      "Six conditions that stop the workflow or withhold checkout.",
      "Six things the product will not do, including acting as a law firm and guaranteeing removal.",
      "What the user gets instead: a status, a reason, a next step, saved progress."
    ])
  }),
  Object.freeze({
    id: "screenshots", number: "05", label: "Current product screenshots", pages: [7, 8],
    proves: Object.freeze([
      "Current July 2026 product surfaces: screening, packet-ready result, Briefcase, fail-closed review state.",
      "Bounded outcome language visible in the product itself.",
      "Shown with sample or synthetic data — the kit says so, and so must any draft using them."
    ])
  }),
  Object.freeze({
    id: "state_coverage", number: "06", label: "State coverage table", pages: [9, 10, 11],
    proves: Object.freeze([
      "All 51 jurisdictions — 50 states plus D.C. — each with at least one packet-capable route.",
      "Packet-capable route examples and guidance-only / automatic examples, per jurisdiction.",
      "The table is product support, not a legal conclusion for any person or case."
    ])
  }),
  Object.freeze({
    id: "pricing", number: "07", label: "Pricing with exclusions", pages: [12],
    proves: Object.freeze([
      "$0 free eligibility check; $50 flat packet preparation per supported case; no subscription.",
      "What the $50 includes — five named items.",
      "What the $50 excludes — court and agency fees, representation, court appearance, guaranteed approval.",
      "Partner sponsorship exists and is custom-priced."
    ])
  }),
  Object.freeze({
    id: "interview_availability", number: "08", label: "Interview availability", pages: [12],
    proves: Object.freeze([
      "Roger Roman, Co-founder + COO: Tuesday–Thursday, 10:00–14:00 ET, flexible for breaking news.",
      "Five approved interview topics.",
      "What a booking request needs: outlet, topic, format, deadline, length, live or recorded."
    ])
  }),
  Object.freeze({
    id: "boilerplate_bios", number: "09", label: "Founder bios + boilerplate", pages: [13],
    proves: Object.freeze([
      "Company boilerplate, pasteable verbatim.",
      "Founder bios: Lawrence Blackmon (CEO, attorney and Mississippi state legislator, Howard) and Roger Roman (COO, Howard).",
      "Media and partner contacts, the press page and the publication note."
    ])
  })
]);

export function pressKitSection(id = "") {
  return PRESS_KIT_SECTIONS.find((section) => section.id === clean(id)) || null;
}

// The only figures the kit ratifies. Anything numeric outside this set is a claim the kit cannot
// back, which is what `no_unbacked_figure` enforces.
export const PRESS_KIT_APPROVED_FACTS = Object.freeze([
  Object.freeze({ id: "coverage", fact: "Free screening and guidance in all 50 states and Washington, D.C.", section: "state_coverage" }),
  Object.freeze({ id: "jurisdictions", fact: "51 jurisdictions listed, each with at least one packet-capable route.", section: "state_coverage" }),
  Object.freeze({ id: "free_check", fact: "$0 to start the eligibility check — no account or payment required.", section: "pricing" }),
  Object.freeze({ id: "packet_price", fact: "$50 flat packet-preparation price per supported case, no subscription.", section: "pricing" }),
  Object.freeze({ id: "languages", fact: "EN + ES user-facing support.", section: "fact_sheet" }),
  Object.freeze({ id: "review_layers", fact: "Four distinct human and legal review layers.", section: "human_legal_review" })
]);

// ---------------------------------------------------------------------------------------------
// Follow-up artifacts — offered on request, never claimed, never blocking.
// ---------------------------------------------------------------------------------------------

export const PRESS_FOLLOW_UP_ARTIFACTS = Object.freeze([
  Object.freeze({
    id: "traction_figures",
    label: "Traction and usage figures",
    // The distinction the whole design turns on: available, but not yet in an approved source.
    availability: "on_request",
    detail: "Not in the kit. Roger shares figures with a journalist who shows interest.",
    offerLine: "Usage and traction figures are available on request.",
    blocksPitch: false,
    // A draft may offer it. Stating one is a hard fail, because no approved source backs it.
    mayState: false
  }),
  Object.freeze({
    id: "participant_story",
    label: "A participant story",
    availability: "on_request",
    detail: "Not in the kit. Roger will pursue a story, and the consent record it needs, if a journalist wants one.",
    offerLine: "A participant interview can be arranged on request, with recorded consent obtained first.",
    blocksPitch: false,
    mayState: false,
    // The consent gate is unchanged and unrelaxed: if a story is ever used, consent comes first.
    requiresConsentFirst: true
  })
]);

export function pressFollowUpArtifact(id = "") {
  return PRESS_FOLLOW_UP_ARTIFACTS.find((entry) => entry.id === clean(id)) || null;
}

/** The approved lines a draft uses to offer what it cannot claim. */
export function pressOfferLines() {
  return Object.freeze(PRESS_FOLLOW_UP_ARTIFACTS.map((entry) => entry.offerLine));
}

// ---------------------------------------------------------------------------------------------
// The boundary claims. Seven, verbatim from the kit, each with the contradiction that fails.
//
// These are what "the kit is the approved-claims source" MEANS in enforcement terms: a draft
// inherits this language, and a draft that contradicts it cannot be approved.
// ---------------------------------------------------------------------------------------------

export const PRESS_KIT_BOUNDARY_CLAIMS = Object.freeze([
  Object.freeze({
    id: "not_a_law_firm",
    claim: "LegalEase is not a law firm and does not provide legal advice or representation.",
    section: "where_it_stops",
    summary: "Contradicts the kit: LegalEase is not a law firm.",
    // "we are a law firm", "LegalEase, a law firm", "as your law firm"
    contradiction: /\b(is|are|as|being|your|our)\s+(a\s+)?law firm\b|\blaw firm\s+(behind|called)\s+legalease\b|\bcreates? an attorney[- ]client relationship\b/i
  }),
  Object.freeze({
    id: "no_legal_advice_or_representation",
    claim: "LegalEase does not provide legal advice or representation.",
    section: "human_legal_review",
    summary: "Contradicts the kit: the product does not provide legal advice or representation.",
    contradiction: /\b(provid\w*|offer\w*|giv\w*|deliver\w*|includ\w*)\b[^.]{0,40}\b(legal advice|legal representation|legal strategy)\b|\b(represents?|representing)\s+(you|users|clients|the user)\b|\bour (lawyers|attorneys)\s+(represent|advise|will)\b/i
  }),
  Object.freeze({
    id: "may_be_able_to",
    claim: "Outcome language stays bounded — 'may be able to', never a promise.",
    section: "screenshots",
    summary: "Contradicts the kit: outcome language must stay bounded ('may be able to').",
    // Definite-outcome phrasing where the kit uses conditional phrasing.
    contradiction: /\b(we|legalease|expungement\.ai|the (product|platform|engine))\s+(will|can|does)\s+(clear|expunge|seal|erase|remove)\b|\byour record (will|is going to) be (cleared|expunged|sealed|removed)\b|\bgets? your record (cleared|expunged|sealed)\b/i
  }),
  Object.freeze({
    id: "guidance_only",
    claim: "Automatic, agency-led or no-filing relief is guidance only — no packet is sold for it.",
    section: "state_coverage",
    summary: "Contradicts the kit: automatic and no-filing relief is guidance only, never a paid packet.",
    contradiction: /\bautomatic\w*\b[^.]{0,60}\b(packet|paid|\$50|checkout|purchase)\b|\b(packet|paid|\$50)\b[^.]{0,60}\bautomatic\w*\s+(relief|sealing|expungement|clean slate)\b|\bwe file\b[^.]{0,30}\bautomatic\w*/i
  }),
  Object.freeze({
    id: "no_guaranteed_outcome",
    claim: "The product will not guarantee eligibility, filing acceptance, court approval or record removal.",
    section: "where_it_stops",
    summary: "Contradicts the kit: no guaranteed approval, acceptance or record removal.",
    contradiction: /\b(guarantee\w*)\b[^.]{0,40}\b(approval|acceptance|removal|expungement|outcome|result|eligibility|your record)\b|\b(approval|acceptance|removal)\b[^.]{0,20}\bis guaranteed\b|\bpromis\w+\b[^.]{0,30}\b(outcome|removal|approval)\b/i
  }),
  Object.freeze({
    id: "fifty_dollar_excludes_representation",
    claim: "The standard $50 product does not include legal representation, an attorney-client relationship, court appearance or individualized legal advice.",
    section: "pricing",
    summary: "Contradicts the kit: the $50 path does not include representation.",
    contradiction: /\$50\b[^.]{0,80}\b(includ\w*|cover\w*|comes with|gets you|buys you|with)\b[^.]{0,40}\b(attorney|lawyer|representation|court appearance|legal advice)\b|\b(attorney|lawyer|representation|court appearance)\b[^.]{0,60}\bfor \$50\b|\b\$50\b[^.]{0,30}\b(attorney|lawyer)\b[^.]{0,20}\breview\w*\s+your\b/i
  }),
  Object.freeze({
    id: "state_table_is_product_support",
    claim: "The state table describes LegalEase product support, not a legal conclusion for any person or case.",
    section: "state_coverage",
    summary: "Contradicts the kit: the state table is product support, not a legal conclusion.",
    contradiction: /\b(eligible|qualif\w+|can (clear|expunge|seal))\b[^.]{0,40}\bin all 50 states\b|\ball 50 states\b[^.]{0,40}\b(are|is) eligible\b|\bthe (table|chart|coverage map)\b[^.]{0,40}\b(means|proves|confirms|shows)\b[^.]{0,40}\b(you|your record|anyone)\b/i
  })
]);

export function pressKitBoundaryClaim(id = "") {
  return PRESS_KIT_BOUNDARY_CLAIMS.find((entry) => entry.id === clean(id)) || null;
}

// ---------------------------------------------------------------------------------------------
// Negation-aware matching.
//
// The approved language CONTAINS the forbidden words — "does not provide legal advice or
// representation" contains "provide legal advice". A naive regex would fail the kit's own
// sentences, so a contradiction counts only when it is ASSERTED: matched, and not negated within
// the 50 characters of the same sentence that precede it.
// ---------------------------------------------------------------------------------------------

const NEGATOR = /\b(not|never|no|without|nor|cannot|can't|doesn't|don't|isn't|aren't|won't|neither|rather than|instead of|excludes?|excluding)\b/i;
const NEGATION_LOOKBACK = 50;

export function assertsContradiction(text = "", pattern) {
  const body = clean(text);
  if (!body || !pattern) return false;
  const scan = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = scan.exec(body)) !== null) {
    // Never look back past the start of the sentence — a negation two sentences ago negates
    // nothing here.
    const sentenceStart = Math.max(
      body.lastIndexOf(".", match.index - 1),
      body.lastIndexOf("!", match.index - 1),
      body.lastIndexOf("?", match.index - 1),
      body.lastIndexOf("\n", match.index - 1)
    ) + 1;
    const from = Math.max(sentenceStart, match.index - NEGATION_LOOKBACK);
    const prefix = body.slice(from, match.index);
    // The negation can sit INSIDE the match as easily as before it. "…no packet is sold for it"
    // and "the $50 product does not include representation" both match on proximity, and in both
    // the word that cancels the assertion is inside the span the pattern captured. Checking only
    // the prefix would fail the kit on its own sentences.
    if (!NEGATOR.test(prefix) && !NEGATOR.test(match[0])) return true;
    if (match.index === scan.lastIndex) scan.lastIndex += 1;
  }
  return false;
}

/**
 * Checks a draft against every boundary claim the kit ratifies.
 * Returns the contradictions, each naming the claim it broke and the section that ratifies it.
 */
export function evaluatePressKitClaims(text = "") {
  const contradictions = [];
  for (const entry of PRESS_KIT_BOUNDARY_CLAIMS) {
    if (!assertsContradiction(text, entry.contradiction)) continue;
    contradictions.push(Object.freeze({
      rule: entry.id,
      summary: entry.summary,
      claim: entry.claim,
      section: entry.section,
      source: PRESS_KIT.file
    }));
  }
  return Object.freeze(contradictions);
}

// ---------------------------------------------------------------------------------------------
// Proof mapping — every Pitch Map proof requirement, resolved against the kit.
//
// `kind` is the whole point:
//   kit         -> the kit supplies it outright; pitch it today.
//   kit_partial -> the kit supplies the shape of it but not the specifics; say only what it proves.
//   follow_up   -> not in the kit, offered on request, and NOT a blocker.
// ---------------------------------------------------------------------------------------------

const KIT = (...sections) => Object.freeze({ kind: "kit", sections: Object.freeze(sections) });
const PARTIAL = (note, ...sections) => Object.freeze({ kind: "kit_partial", note, sections: Object.freeze(sections) });
const FOLLOW_UP = (artifact) => Object.freeze({ kind: "follow_up", artifact, sections: Object.freeze([]) });

export const PRESS_PROOF_SOURCES = Object.freeze({
  // Angle 1 — nationwide milestone
  "Current product screenshots": KIT("screenshots"),
  "State coverage table": KIT("state_coverage"),
  "Pricing": KIT("pricing"),
  "Guardrails": KIT("human_legal_review", "where_it_stops"),
  "Usage/traction": FOLLOW_UP("traction_figures"),
  "Founder availability": KIT("interview_availability"),

  // Angle 2 — founder growth
  "Founder bios": KIT("boilerplate_bios"),
  "Current traction": FOLLOW_UP("traction_figures"),
  "Funding history": FOLLOW_UP("traction_figures"),
  "Jobs/partner outcomes": FOLLOW_UP("traction_figures"),
  "Nationwide milestone": KIT("fact_sheet", "state_coverage"),

  // Angle 3 — economic mobility
  "Participant outcomes": FOLLOW_UP("participant_story"),
  "Employment/housing stories": FOLLOW_UP("participant_story"),
  "Partner data": FOLLOW_UP("traction_figures"),
  "Cost/time comparisons": PARTIAL(
    "The kit proves the cost side in full — $0 to check, $50 flat, and what the $50 excludes. It carries no time comparison, so pitch cost and say nothing about elapsed time.",
    "pricing", "architecture"),

  // Angle 4 — AI guardrails
  "Architecture summary": KIT("architecture"),
  "Human/legal review": KIT("human_legal_review"),
  "Claims guardrails": KIT("where_it_stops"),
  "Examples of when the product stops": KIT("where_it_stops", "screenshots"),

  // Angle 5 — implementation gap
  "Anonymized funnel data": FOLLOW_UP("traction_figures"),
  "State-by-state barriers": KIT("state_coverage"),
  "Abandonment points": FOLLOW_UP("traction_figures"),
  "Filing timelines": PARTIAL(
    "The kit names waiting periods and timing gates as things the engine enforces, but publishes no per-state timeline. Pitch that timing is a gate; do not state a duration.",
    "architecture", "where_it_stops"),
  "Court/agency sources": PARTIAL(
    "The kit proves the sources are researched and mapped — statutes, court rules, official forms, waiting periods, exclusions, filing destinations — without listing them. Pitch the method; supply citations on request.",
    "human_legal_review"),

  // Angle 6 — RCAP partner model
  "Partner workflow": KIT("architecture", "pricing"),
  "Sample dashboard": KIT("screenshots"),
  "Pilot results": FOLLOW_UP("traction_figures"),
  "Partner quotes": FOLLOW_UP("participant_story"),
  "Privacy/security model": PARTIAL(
    "The kit proves the user-facing posture — no account wall, privately saved answers, common guardrails and security across the product family — but is not a security document. Pitch the posture, not a control set.",
    "architecture", "fact_sheet"),

  // Angle 7 — Mississippi to nationwide
  "Mississippi traction": FOLLOW_UP("traction_figures"),
  "Local founder roots": KIT("boilerplate_bios"),
  "Partner history": FOLLOW_UP("traction_figures"),
  "Current nationwide product": KIT("fact_sheet", "state_coverage"),

  // Angle 8 — thought leadership
  "Specific lessons": KIT("architecture", "human_legal_review", "where_it_stops"),
  "Failures": PARTIAL(
    "The kit proves the designed-failure story — uncertain states fail closed, checkout is withheld, the product stops and says why. Founder-told failure anecdotes are not in it.",
    "where_it_stops", "architecture"),
  "Metrics": FOLLOW_UP("traction_figures"),
  "Framework": KIT("architecture", "where_it_stops"),
  "Non-promotional thesis": KIT("interview_availability")
});

// How an angle whose core claim leans on a figure or a story is pitched WITHOUT one. Every angle
// has a route; none is dead for lack of traction (Roger, 2026-07-26).
export const PRESS_ANGLE_REFRAMES = Object.freeze({
  nationwide_milestone:
    "Pitch the milestone as coverage, not usage: 51 jurisdictions, each with at least one packet-capable route, at a published $50. That is the kit's own claim and needs no usage figure.",
  founder_growth:
    "Pitch what was built rather than how fast it grew: two Howard alumni shipped a bounded, attorney-reviewed product across all 51 jurisdictions, with an engine that refuses to sell where relief is automatic. Identity plus the build, never identity plus a number.",
  economic_mobility:
    "Pitch the access mechanics instead of outcomes: $0 to find out, $50 only when a supported route exists, nothing sold where relief is automatic. The cost structure is the story; the causal claim is not made.",
  ai_guardrails:
    "No reframe needed. Every proof point is in the kit.",
  implementation_gap:
    "Pitch the gap the law itself creates, not the funnel: the kit's guidance-only column documents, jurisdiction by jurisdiction, where relief exists automatically and no filing is required — which is exactly where people do not know they qualify. The evidence is the table, not the analytics.",
  rcap_partner_model:
    "Pitch the model's mechanics rather than its results: the same workflow and guardrails behind a partner-sponsored payment gate, with the consumer path visible in the Briefcase screenshots. Pilot numbers and partner quotes come on request.",
  mississippi_to_nationwide:
    "Pitch the throughline, not the tally: a Mississippi state legislator co-founded it, and Mississippi is one row in a 51-jurisdiction table. The kit also satisfies this angle's own guardrail — it is the current-facts update that supersedes old pricing and coverage.",
  thought_leadership:
    "Pitch the thesis the kit already approves — why record clearing needs state-by-state rules rather than a generic national form — and use fail-closed design as the lesson. Metrics are not the argument here."
});

/**
 * Resolves one angle's proof requirements against the kit.
 *
 * Returns what the kit supplies, what is offered on request, and — because no angle is dead for
 * lack of a figure — how to pitch it as it stands. PURE; reads the frozen tables only.
 */
export function pressProofPlan(angle) {
  const requirements = Array.isArray(angle?.proofRequired) ? angle.proofRequired : [];
  const satisfied = [];
  const partial = [];
  const followUp = [];

  for (const requirement of requirements) {
    const source = PRESS_PROOF_SOURCES[requirement];
    if (!source) {
      // An unmapped requirement is a gap in THIS table, not a licence to pitch it unproven.
      partial.push(Object.freeze({ requirement, kind: "unmapped", note: "Not yet mapped to the kit.", sections: Object.freeze([]) }));
      continue;
    }
    const entry = Object.freeze({
      requirement,
      kind: source.kind,
      sections: source.sections,
      sectionLabels: Object.freeze(source.sections.map((id) => pressKitSection(id)?.label || id)),
      note: source.note || null,
      artifact: source.artifact || null,
      offerLine: source.artifact ? pressFollowUpArtifact(source.artifact)?.offerLine || null : null
    });
    if (source.kind === "kit") satisfied.push(entry);
    else if (source.kind === "kit_partial") partial.push(entry);
    else followUp.push(entry);
  }

  const offers = [...new Set(followUp.map((entry) => entry.offerLine).filter(Boolean))];

  return Object.freeze({
    angleId: angle?.id || null,
    label: angle?.label || null,
    source: PRESS_KIT.file,
    satisfied: Object.freeze(satisfied),
    partial: Object.freeze(partial),
    // Named `followUp`, never `missing`. These do not block, and the Plan stage must not show
    // them as an outstanding checklist Roger is failing to clear.
    followUp: Object.freeze(followUp),
    offers: Object.freeze(offers),
    // Every angle is pitchable: the kit proves something for all eight, and what it does not
    // prove is offered rather than claimed. Partial counts — economic mobility, for one, is
    // carried entirely by the cost half of a cost/time requirement, and that is a real pitch.
    pitchableOnKitAlone: satisfied.length + partial.length > 0,
    // A count Roger can read at a glance: proof points the kit carries outright.
    kitCoverage: Object.freeze({
      satisfied: satisfied.length,
      partial: partial.length,
      followUp: followUp.length,
      total: requirements.length
    }),
    reframe: PRESS_ANGLE_REFRAMES[angle?.id] || null
  });
}

// ---------------------------------------------------------------------------------------------
// Audience — which contactable journalists an angle actually reaches.
// ---------------------------------------------------------------------------------------------

// Coverage-lane keywords per angle, matched against the workbook's own `press_coverage_lanes`.
export const PRESS_ANGLE_BEATS = Object.freeze({
  nationwide_milestone: Object.freeze(["legaltech", "legal ai", "ai", "technology", "startups", "access to justice"]),
  founder_growth: Object.freeze(["black founders", "black tech", "hbcu", "black business", "startups", "venture capital"]),
  economic_mobility: Object.freeze(["reentry", "record clearance", "criminal justice", "impact", "economic justice", "equity"]),
  ai_guardrails: Object.freeze(["ai", "legaltech", "legal ai", "technology", "surveillance", "data"]),
  implementation_gap: Object.freeze(["criminal justice", "public policy", "record clearance", "reentry", "courts"]),
  rcap_partner_model: Object.freeze(["impact", "social innovation", "nonprofit", "cities", "equity", "criminal justice"]),
  mississippi_to_nationwide: Object.freeze(["regional", "black press", "criminal justice", "black communities", "policy"]),
  thought_leadership: Object.freeze(["legaltech", "ai", "startups", "legal industry", "products", "innovation"])
});

/**
 * Counts the contactable audience for an angle. Reads `press_sendable`, which was decided by
 * `pressEligibility` at import — this never re-decides eligibility, and reaching a number here
 * still sends nothing.
 */
export function pressAngleAudience(contacts = [], angleId = "") {
  const beats = PRESS_ANGLE_BEATS[clean(angleId)] || [];
  const press = (Array.isArray(contacts) ? contacts : [])
    .filter((row) => lower(row.classification) === "press" && row.press_sendable === true);
  const matched = press.filter((row) => {
    const lanes = lower(row.press_coverage_lanes);
    return beats.some((beat) => lanes.includes(beat));
  });
  const shared = matched.filter((row) => lower(row.press_email_type) === "shared newsroom");
  const warm = matched.filter((row) => lower(row.press_outreach_kind) === "warm_follow_up");

  return Object.freeze({
    angleId: clean(angleId) || null,
    contactable: press.length,
    onBeat: matched.length,
    direct: matched.length - shared.length,
    sharedNewsroom: shared.length,
    warmFollowUps: warm.length,
    tiers: Object.freeze([...matched.reduce((counts, row) => {
      const tier = clean(row.press_tier) || "untiered";
      return counts.set(tier, (counts.get(tier) || 0) + 1);
    }, new Map())].sort((left, right) => right[1] - left[1]).map(([tier, count]) => Object.freeze({ tier, count })))
  });
}
