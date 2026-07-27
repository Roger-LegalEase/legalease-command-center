// Founder OS — the multi-angle press campaign composer.
//
// PROPOSE-ONLY BY CONSTRUCTION. This module turns the press audience and the Pitch Map into
// campaign PROPOSALS and nothing else:
//
//   * every campaign row it produces has `status: "proposed"`, which the planner skips — it
//     considers only active/running campaigns;
//   * press contacts stay exactly as the import left them: `sequence_status: "Not Enrolled"`,
//     `press_hold: true`. This module never reads a contact to change it, only to count it;
//   * the press classification is deliberately unmapped in the classification→sequence table,
//     so even a mis-flipped campaign fails closed at the planner, contact by contact;
//   * every draft must pass the press guardrail gate AND the press-kit claims gate before a
//     plan exists at all — one failing draft refuses the whole build.
//
// STORAGE. Nothing parallel is created (the same rule the import obeys): proposals are rows in
// the EXISTING `outreachCampaigns` and `outreachSequenceSteps` collections, so a future "Run"
// decision is a status flip on a record the machinery already reads — never a second engine.
//
// ASSIGNMENT. Each contactable journalist lands on at most ONE angle, so nobody is ever queued
// for two pitches: the workbook's own "Best Pitch Angle" hint wins when it names a real angle,
// coverage-lane beat matching decides otherwise, and a contact matching nothing is reported as
// unassigned rather than shoehorned. Warm prior relationships are EXCLUDED — they are follow-ups
// Roger drafts from the recorded recommendation, not cold pitches (press-outreach.mjs says so).

import { PRESS_ANGLES, evaluatePressGuardrails } from "./press-outreach.mjs";
import { PRESS_ANGLE_BEATS, PRESS_KIT, pressProofPlan } from "./press-kit.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const PRESS_CAMPAIGN_STATUS = "proposed";
export const PRESS_CAMPAIGNS_COLLECTION = "outreachCampaigns";
export const PRESS_SEQUENCE_STEPS_COLLECTION = "outreachSequenceSteps";
export const PRESS_CAMPAIGN_PROPOSED_BY = "press_campaign_composer";

export function pressCampaignId(angleId = "") {
  return `press-${clean(angleId)}`;
}

// ---------------------------------------------------------------------------------------------
// The pitch copy — one deterministic draft per angle, written against the kit.
//
// Rules the copy is built to honour, checked by the gate rather than trusted:
//   * only kit-ratified figures appear (50 states, D.C., 51 jurisdictions, $0, $50, EN + ES,
//     four review layers) — traction is OFFERED via the approved offer lines, never stated;
//   * boundary language is carried, not contradicted (not a law firm, no legal advice or
//     representation, bounded outcomes, guidance-only where relief is automatic);
//   * the greeting is name-free BY DESIGN: shared newsroom desks reach a masthead, not a
//     person, and must never be personalised — and a no-name contact must never render a raw
//     merge token. Per-name greetings are a Run-step decision, not a compose-step default.
// ---------------------------------------------------------------------------------------------

const PITCH_BOUNDARY_PARAGRAPH =
  "One boundary we state everywhere, including here: LegalEase is not a law firm and does not "
  + "provide legal advice or representation, and outcome language stays bounded — may be able "
  + "to, never a promise.";

const PITCH_CLOSING = "Would this fit your coverage?";

const PITCH_LEDES = Object.freeze({
  nationwide_milestone: Object.freeze({
    subject: "Record-clearing paperwork at a flat $50, now with a route in all 51 US jurisdictions",
    paragraphs: Object.freeze([
      "I'm reaching out from LegalEase with a legal-tech milestone I think fits your beat: our "
      + "product Expungement.ai now offers a free record-clearing eligibility screening in all 50 "
      + "states and Washington, D.C. — 51 jurisdictions, each with at least one packet-capable route.",
      "The model is deliberately simple. The eligibility check is $0, with no account or payment "
      + "required. Packet preparation is a flat $50 per supported case, with no subscription, in EN "
      + "and ES. Where relief is automatic or agency-led, the product gives guidance only and sells "
      + "nothing."
    ])
  }),
  founder_growth: Object.freeze({
    subject: "Two Howard alumni built a 51-jurisdiction legal product that refuses to oversell",
    paragraphs: Object.freeze([
      "There's a Black founders story here with the business substance to carry it. LegalEase was "
      + "built by two Howard University alumni — Lawrence Blackmon, an attorney and Mississippi "
      + "state legislator, and Roger Roman — and its product Expungement.ai now runs in 51 "
      + "jurisdictions: attorney-reviewed document logic, a deterministic rules engine, and a hard "
      + "rule against selling where relief is automatic.",
      "The pitch is identity plus the build, never identity plus a hype number. The product is $0 "
      + "to check and a flat $50 for packet preparation, bounded outcome language throughout, and "
      + "it fails closed when a case is uncertain."
    ])
  }),
  economic_mobility: Object.freeze({
    subject: "The economics of clearing a record: $0 to find out, $50 when a route exists",
    paragraphs: Object.freeze([
      "Record clearing is an economic-mobility story, and the interesting part is the access "
      + "mechanics rather than any outcome claim. With Expungement.ai it costs $0 to find out "
      + "whether a supported record-clearing route exists, and a packet is prepared for a flat $50 "
      + "only when one does. Where relief is automatic or agency-led, the product gives guidance "
      + "and charges nothing — the point where most people never learn they had an option.",
      "A criminal record can shadow applications for work and housing for decades; the product's "
      + "aim is to make finding the legal route cheap, in EN and ES, in all 50 states and "
      + "Washington, D.C."
    ])
  }),
  ai_guardrails: Object.freeze({
    subject: "A legal AI designed to stop: fail-closed guardrails in Expungement.ai",
    paragraphs: Object.freeze([
      "Most AI-in-law coverage is about where models overreach. Expungement.ai is a story about "
      + "the opposite design: a deterministic rules engine makes the eligibility decision and the "
      + "assistant only explains it — it is not a chatbot ruling on people's records. When a case "
      + "is uncertain, complex or contested, the workflow fails closed: it stops, states the "
      + "reason, and withholds checkout rather than guessing.",
      "Behind that sit four distinct human and legal review layers, from legal source review to "
      + "attorney-reviewed document logic — reviewed product logic, not review of any individual "
      + "case. The limitations are documented in the press kit alongside the guardrails: what the "
      + "product refuses to do, and exactly when it stops."
    ])
  }),
  implementation_gap: Object.freeze({
    subject: "The record-clearing implementation gap, documented jurisdiction by jurisdiction",
    paragraphs: Object.freeze([
      "The under-covered story in record clearing is not eligibility law — it is implementation. "
      + "In a meaningful share of jurisdictions, relief exists automatically or through agency-led "
      + "processes, and no filing is required; those are exactly the places where people never "
      + "learn their options. The press kit's state coverage table documents this jurisdiction by "
      + "jurisdiction, separating packet-capable routes from guidance-only ones, drawn from "
      + "statutes, court rules and official forms.",
      "This is data-and-documents reporting rather than a launch pitch: the timing gates the "
      + "engine enforces, the barriers that differ state by state, and where the workflow stops. "
      + "Waiting periods are treated as gates; the kit publishes no per-state durations, and "
      + "neither will we."
    ])
  }),
  rcap_partner_model: Object.freeze({
    subject: "How nonprofits sponsor record-clearing help without building legal tech: the RCAP model",
    paragraphs: Object.freeze([
      "For organizations that serve people with records — reentry programs, legal aid, workforce "
      + "nonprofits — LegalEase runs a partner model called RCAP: the same screening workflow and "
      + "the same guardrails, behind a partner-sponsored payment gate, so a sponsored participant "
      + "pays nothing at checkout. Partner sponsorship is custom-priced, and the consumer "
      + "workflow is visible in the kit's current Briefcase screenshots.",
      "The honest version of this story includes the limits: implementation costs, referral "
      + "pathways, and what a partner is — and is not — responsible for."
    ])
  }),
  mississippi_to_nationwide: Object.freeze({
    subject: "From the Mississippi statehouse to a 51-jurisdiction product",
    paragraphs: Object.freeze([
      "This one is a throughline story: LegalEase started in Mississippi — co-founder Lawrence "
      + "Blackmon is an attorney and a sitting Mississippi state legislator — and today "
      + "Mississippi is one row in a 51-jurisdiction coverage listing. The current product "
      + "supersedes the early MVP: pricing today is a $0 eligibility check and a flat $50 packet "
      + "preparation, and the press kit is the up-to-date source for coverage and pricing facts, "
      + "which is exactly what this story's own guardrail asks for.",
      "The local angle still matters: record clearing is decided state by state, and the "
      + "company's roots are in one of the states where the implementation gap is widest."
    ])
  }),
  thought_leadership: Object.freeze({
    subject: "Op-ed offer: why legal automation should be designed to refuse",
    paragraphs: Object.freeze([
      "An op-ed or interview thesis, offered with the disclosure up front: I work with LegalEase, "
      + "so this is an interested perspective, and the piece should teach a pattern rather than "
      + "pitch a product. The thesis: record clearing cannot be automated with one generic "
      + "national form — it needs state-by-state rules, and an engine willing to stop. Fail-closed "
      + "design is the transferable lesson: when the system is uncertain, it should refuse to "
      + "sell, state its reason and hand back a next step.",
      "The supporting framework — rules engine, hard gates, four review layers, bounded outcome "
      + "language — is documented in the press kit; metrics are deliberately not the argument."
    ])
  })
});

/**
 * Drafts the one pitch a proposed angle campaign carries. PURE and deterministic — the same
 * angle always yields the same draft, so a preview IS the copy a confirm would store.
 */
export function draftPressPitch(angle) {
  const lede = PITCH_LEDES[angle?.id];
  if (!lede) return null;
  const proof = pressProofPlan(angle);
  const offerSentences = proof.offers.length ? `${proof.offers.join(" ")} ` : "";
  const availability =
    `${offerSentences}Co-founder and COO Roger Roman is available for interviews Tuesday through `
    + "Thursday, 10:00 to 14:00 ET, and the full press kit — current screenshots, the state "
    + "coverage table and pricing — is one reply away.";
  const body = [
    "Hello,",
    "",
    ...lede.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    PITCH_BOUNDARY_PARAGRAPH,
    "",
    availability,
    "",
    PITCH_CLOSING
  ].join("\n");
  return Object.freeze({ subject: lede.subject, body });
}

// ---------------------------------------------------------------------------------------------
// Assignment — one angle per journalist, decided deterministically.
// ---------------------------------------------------------------------------------------------

const slugify = (value = "") => lower(value).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Resolves the workbook's free-text "Best Pitch Angle" hint to a real angle, conservatively:
 * an exact match on the angle id or label, or a multi-word prefix of either. Anything looser
 * would let a stray word like "ai" hijack the routing.
 */
export function matchAngleHint(hint = "", angles = PRESS_ANGLES) {
  const slug = slugify(hint);
  if (!slug) return null;
  const multiWord = slug.includes(" ");
  for (const angle of angles) {
    const idSlug = slugify(angle.id);
    const labelSlug = slugify(angle.label);
    if (slug === idSlug || slug === labelSlug) return angle;
    if (multiWord && (idSlug.startsWith(`${slug} `) || labelSlug.startsWith(`${slug} `))) return angle;
  }
  return null;
}

/**
 * Assigns each contactable press contact to at most one angle. PURE — reads rows, returns a
 * grouping, changes nothing. Warm prior relationships are set aside, never cold-pitched.
 */
export function assignPressAngles(contacts = [], { angleIds = null } = {}) {
  const wanted = list(angleIds).map(clean).filter(Boolean);
  const angles = PRESS_ANGLES.filter((angle) => !wanted.length || wanted.includes(angle.id));
  const sendable = list(contacts).filter(
    (row) => lower(row.classification) === "press" && row.press_sendable === true
  );

  const assignments = new Map(angles.map((angle) => [angle.id, []]));
  const unassigned = [];
  const warmFollowUps = [];

  for (const contact of sendable) {
    if (lower(contact.press_outreach_kind) === "warm_follow_up") {
      warmFollowUps.push(contact);
      continue;
    }
    const hinted = matchAngleHint(contact.press_best_angle, angles);
    if (hinted) {
      assignments.get(hinted.id).push({ contact, via: "hint" });
      continue;
    }
    const lanes = lower(contact.press_coverage_lanes);
    let best = null;
    let bestScore = 0;
    for (const angle of angles) {
      const beats = PRESS_ANGLE_BEATS[angle.id] || [];
      const score = beats.filter((beat) => lanes.includes(beat)).length;
      // Strictly-greater keeps the tie-break on Pitch Map order: the first angle to reach the
      // top score holds it.
      if (score > bestScore) { best = angle; bestScore = score; }
    }
    if (best) assignments.get(best.id).push({ contact, via: "beats" });
    else unassigned.push(contact);
  }

  return { angles, assignments, unassigned, warmFollowUps, contactable: sendable.length };
}

// ---------------------------------------------------------------------------------------------
// The proposal plan.
// ---------------------------------------------------------------------------------------------

/**
 * Builds the multi-angle campaign proposal. PURE — reads state, returns records, writes
 * nothing. The caller persists, so the whole proposal can be previewed before anything is
 * saved. Throws — refusing the ENTIRE build — if any draft fails the guardrail or claims gate.
 */
export function buildPressCampaignProposal(state = {}, { now = new Date().toISOString(), angleIds = null } = {}) {
  const assignment = assignPressAngles(list(state.outreachContacts), { angleIds });

  const outreachCampaigns = [];
  const outreachSequenceSteps = [];
  const drafts = [];
  const skippedEmptyAngles = [];
  const byAngle = [];

  for (const angle of assignment.angles) {
    const rows = assignment.assignments.get(angle.id) || [];
    if (!rows.length) {
      skippedEmptyAngles.push(angle.id);
      continue;
    }

    const draft = draftPressPitch(angle);
    if (!draft) {
      throw new Error(`Press campaign refused: no pitch copy exists for the ${angle.id} angle. Nothing was written.`);
    }
    const gate = evaluatePressGuardrails(`${draft.subject}\n${draft.body}`, angle.id);
    if (!gate.passed) {
      const rules = gate.hardFails.map((failure) => failure.rule).join(", ");
      throw new Error(`Press campaign refused: the ${angle.id} draft failed the guardrail gate (${rules}). Nothing was written.`);
    }

    const shared = rows.filter((row) => lower(row.contact.press_email_type) === "shared newsroom");
    const viaHint = rows.filter((row) => row.via === "hint").length;
    const audienceContactIds = rows.map((row) => clean(row.contact.contact_id)).filter(Boolean).sort();
    const campaignId = pressCampaignId(angle.id);

    outreachCampaigns.push({
      campaign_id: campaignId,
      id: campaignId,
      name: `Press — ${angle.label}`,
      classification: "press",
      lane: "press",
      // The field that keeps this inert: the planner reads only active/running campaigns, and
      // nothing in this module (or its endpoints) can write any other status.
      status: PRESS_CAMPAIGN_STATUS,
      angle_id: angle.id,
      angle_label: angle.label,
      guardrail: angle.guardrail,
      approved_claims_source: PRESS_KIT.file,
      approved_claims_current_as_of: PRESS_KIT.currentAsOf,
      audience_contact_ids: audienceContactIds,
      audience: {
        assigned: rows.length,
        viaHint,
        viaBeats: rows.length - viaHint,
        direct: rows.length - shared.length,
        sharedNewsroom: shared.length
      },
      personalization_note:
        "The draft greeting is name-free by design: shared newsroom desks must never be "
        + "personalised, and a no-name contact must never render a raw merge token.",
      proposed_at: now,
      proposed_by: PRESS_CAMPAIGN_PROPOSED_BY
    });

    outreachSequenceSteps.push({
      id: `press-step-${angle.id}-1`,
      campaign_id: campaignId,
      step_number: 1,
      subject: draft.subject,
      body: draft.body,
      angle_id: angle.id,
      proposed_at: now
    });

    drafts.push({
      angleId: angle.id,
      label: angle.label,
      subject: draft.subject,
      body: draft.body,
      guardrails: { passed: true, hardFails: [] },
      offers: gate.offers,
      assigned: rows.length
    });

    byAngle.push({
      angleId: angle.id,
      label: angle.label,
      assigned: rows.length,
      viaHint,
      viaBeats: rows.length - viaHint,
      direct: rows.length - shared.length,
      sharedNewsroom: shared.length
    });
  }

  const assignedTotal = byAngle.reduce((total, entry) => total + entry.assigned, 0);

  return {
    outreachCampaigns,
    outreachSequenceSteps,
    drafts,
    summary: {
      contactable: assignment.contactable,
      assigned: assignedTotal,
      unassigned: assignment.unassigned.length,
      excludedWarmFollowUps: assignment.warmFollowUps.length,
      skippedEmptyAngles,
      byAngle,
      approvedClaimsSource: PRESS_KIT.file,
      approvedClaimsCurrentAsOf: PRESS_KIT.currentAsOf
    }
  };
}

/**
 * Applies a proposal to state. Still propose-only — it writes campaign and step records and
 * touches NOTHING else: no contact row, no queue item, no status other than "proposed" can
 * leave here, whatever the plan says.
 */
export function applyPressCampaignProposal(state = {}, plan = {}, { now = new Date().toISOString() } = {}) {
  for (const row of list(plan.outreachCampaigns)) {
    if (row.status !== PRESS_CAMPAIGN_STATUS || row.classification !== "press") {
      throw new Error("Press campaign apply refused: a campaign row is not an inert press proposal. Nothing was written.");
    }
  }

  const next = { ...state };

  const campaigns = new Map(list(next[PRESS_CAMPAIGNS_COLLECTION]).map((row) => [clean(row.campaign_id || row.id), row]));
  for (const row of list(plan.outreachCampaigns)) {
    campaigns.set(clean(row.campaign_id), { ...campaigns.get(clean(row.campaign_id)), ...row, updated_at: now });
  }
  next[PRESS_CAMPAIGNS_COLLECTION] = [...campaigns.values()];

  const steps = new Map(list(next[PRESS_SEQUENCE_STEPS_COLLECTION]).map((row) => [clean(row.id), row]));
  for (const row of list(plan.outreachSequenceSteps)) {
    steps.set(clean(row.id), { ...steps.get(clean(row.id)), ...row, updated_at: now });
  }
  next[PRESS_SEQUENCE_STEPS_COLLECTION] = [...steps.values()];

  return next;
}
