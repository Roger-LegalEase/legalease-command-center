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

import { PRESS_ANGLES, evaluatePressGuardrails, pressEligibility } from "./press-outreach.mjs";
import { PRESS_ANGLE_BEATS, PRESS_KIT, pressProofPlan } from "./press-kit.mjs";
// The suppression truth used at queue and send time — re-used here so an enrollment decision
// can never be more permissive than the machinery that will actually send.
import { isSuppressed } from "./outreach-os.mjs";

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
    subject: "Record-clearing help now runs in all 51 US jurisdictions",
    paragraphs: Object.freeze([
      "A free check for whether a criminal record can be cleared now exists in all 50 states and "
      + "Washington, D.C. — 51 jurisdictions, each with at least one route that produces "
      + "filing-ready paperwork. It is built by LegalEase, and the product is Expungement.ai.",
      "The model is deliberately simple. The eligibility check is $0, with no account or payment "
      + "required. Packet preparation is a flat $50 per supported case, with no subscription, in EN "
      + "and ES. Where relief is automatic or agency-led, the product gives guidance only and sells "
      + "nothing."
    ])
  }),
  founder_growth: Object.freeze({
    subject: "The attorney-legislator behind a 50-state legal product",
    paragraphs: Object.freeze([
      "Two Howard University alumni — Lawrence Blackmon, an attorney and sitting Mississippi state "
      + "legislator, and Roger Roman — built record-clearing software whose defining feature is "
      + "what it refuses to sell. LegalEase is the company; its product Expungement.ai now runs in 51 "
      + "jurisdictions: attorney-reviewed document logic, a deterministic rules engine, and a hard "
      + "rule against selling where relief is automatic.",
      "The pitch is identity plus the build, never identity plus a hype number. The product is $0 "
      + "to check and a flat $50 for packet preparation, bounded outcome language throughout, and "
      + "it fails closed when a case is uncertain."
    ])
  }),
  economic_mobility: Object.freeze({
    subject: "A record follows you for decades. Finding out is free.",
    paragraphs: Object.freeze([
      "A criminal record can shadow applications for work and housing for decades, and the first "
      + "barrier is usually not the law but the cost of finding out whether relief exists at all. "
      + "With LegalEase's Expungement.ai it costs $0 to find out "
      + "whether a supported record-clearing route exists, and a packet is prepared for a flat $50 "
      + "only when one does. Where relief is automatic or agency-led, the product gives guidance "
      + "and charges nothing — the point where most people never learn they had an option.",
      "A criminal record can shadow applications for work and housing for decades; the product's "
      + "aim is to make finding the legal route cheap, in EN and ES, in all 50 states and "
      + "Washington, D.C."
    ])
  }),
  ai_guardrails: Object.freeze({
    subject: "The legal AI that stops when the case gets hard",
    paragraphs: Object.freeze([
      "Most reporting on AI in law is about where models overreach; the more useful story may be "
      + "software built to do the opposite — to stop, say why, and refuse the sale. That is the "
      + "design behind LegalEase's Expungement.ai: a deterministic rules engine makes the eligibility decision and the "
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
    subject: "In some states, expungement is automatic. Few know it.",
    paragraphs: Object.freeze([
      "In a meaningful share of US jurisdictions, record relief is already automatic or agency-led "
      + "— no filing required — and those are precisely the places where people never learn they "
      + "had an option. The under-covered story in record clearing is not eligibility law; it is "
      + "implementation. LegalEase's press kit documents this jurisdiction by "
      + "jurisdiction, separating packet-capable routes from guidance-only ones, drawn from "
      + "statutes, court rules and official forms.",
      "This is data-and-documents reporting rather than a launch pitch: the timing gates the "
      + "engine enforces, the barriers that differ state by state, and where the workflow stops. "
      + "Waiting periods are treated as gates; the kit publishes no per-state durations, and "
      + "neither will we."
    ])
  }),
  rcap_partner_model: Object.freeze({
    subject: "How nonprofits sponsor record clearing they don't build",
    paragraphs: Object.freeze([
      "Reentry programs, legal aid offices and workforce nonprofits increasingly want to offer "
      + "record-clearing help without building or buying legal technology themselves. "
      + "LegalEase runs a partner model called RCAP for exactly that: the same screening workflow and "
      + "the same guardrails, behind a partner-sponsored payment gate, so a sponsored participant "
      + "pays nothing at checkout. Partner sponsorship is custom-priced, and the consumer "
      + "workflow is visible in the kit's current Briefcase screenshots.",
      "The honest version of this story includes the limits: implementation costs, referral "
      + "pathways, and what a partner is — and is not — responsible for."
    ])
  }),
  mississippi_to_nationwide: Object.freeze({
    subject: "From a Mississippi statehouse to all 50 states",
    paragraphs: Object.freeze([
      "Record clearing is decided state by state, which is why a company that started in "
      + "Mississippi — one of the states where the implementation gap is widest — is a useful lens "
      + "on all 51 jurisdictions. LegalEase began there; co-founder Lawrence "
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
    subject: "Why legal automation should be built to refuse",
    paragraphs: Object.freeze([
      "Record clearing cannot be automated with one generic national form; it needs state-by-state "
      + "rules and software willing to stop. Offered as an op-ed or interview thesis, with the "
      + "disclosure up front: I work with LegalEase, "
      + "so this is an interested perspective, and the piece should teach a pattern rather than "
      + "pitch a product. Fail-closed "
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
    // Subject standards are checked HERE, at compose time, and deliberately not in the run gate
    // below: a campaign Roger has already approved must not become unrunnable because the standard
    // moved under it. New copy is held to it; stored copy keeps whatever verdict it was approved on.
    const gate = evaluatePressGuardrails(`${draft.subject}\n${draft.body}`, angle.id, { subject: draft.subject });
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

// ---------------------------------------------------------------------------------------------
// Run — the one explicit approval per angle campaign.
//
// Modeled on reactivation: ONE recorded owner decision arms the campaign, and everything after
// it is the existing machinery under its existing gates (window, caps, suppression, compliance,
// durable claims — none of which this module implements or touches). What the approval does:
//   * re-verifies the campaign is a press proposal and that NO other press campaign is running
//     (one campaign at a time, enforced here and nowhere weaker);
//   * re-runs the guardrail + claims gate over the stored step copy;
//   * enrolls each assigned journalist ONLY if they still pass, per contact: press_sendable,
//     fresh pressEligibility (verification staleness re-checked at run time), and isSuppressed
//     — the same suppression truth the send path re-checks again later;
//   * records the approval on the campaign row. The planner refuses press campaigns without it.
// ---------------------------------------------------------------------------------------------

export function runPressCampaign(state = {}, { campaignId = "", actor = "", now = new Date().toISOString() } = {}) {
  const id = clean(campaignId);
  const campaigns = list(state[PRESS_CAMPAIGNS_COLLECTION]);
  const campaign = campaigns.find((row) => clean(row.campaign_id || row.id) === id);
  if (!campaign) return { ok: false, error: "This press campaign does not exist." };
  if (lower(campaign.classification) !== "press") return { ok: false, error: "Only a press campaign can be run from here." };
  if (lower(campaign.status) !== PRESS_CAMPAIGN_STATUS) {
    return { ok: false, error: `This campaign is ${clean(campaign.status) || "not proposed"}, so there is nothing to approve.` };
  }
  const running = campaigns.find((row) =>
    lower(row.classification) === "press" && ["active", "running"].includes(lower(row.status)));
  if (running) {
    return { ok: false, error: `One press campaign at a time: "${clean(running.name) || clean(running.campaign_id)}" is already running. Stop it first.` };
  }
  const steps = list(state[PRESS_SEQUENCE_STEPS_COLLECTION]).filter((row) => clean(row.campaign_id) === id);
  if (!steps.length) return { ok: false, error: "This campaign has no drafted pitch, so it cannot run." };
  for (const step of steps) {
    const gate = evaluatePressGuardrails(`${clean(step.subject)}\n${clean(step.body)}`, clean(campaign.angle_id));
    if (!gate.passed) {
      return { ok: false, error: `The drafted pitch no longer passes the guardrail gate (${gate.hardFails.map((f) => f.rule).join(", ")}). Nothing was started.` };
    }
  }

  const audienceIds = new Set(list(campaign.audience_contact_ids).map(clean).filter(Boolean));
  let enrolled = 0;
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };

  const outreachContacts = list(state.outreachContacts).map((contact) => {
    if (!audienceIds.has(clean(contact.contact_id))) return contact;
    // Per-contact re-checks at ENROLLMENT time. The send path re-checks suppression, routing,
    // compliance and caps again at queue AND send time — this is the first gate, not the last.
    if (contact.press_sendable !== true) { skip("not_sendable"); return contact; }
    const eligibility = pressEligibility(contact, { now });
    if (eligibility.sendable !== true) { skip(eligibility.reason || "ineligible"); return contact; }
    const suppression = isSuppressed(contact, { state, org: {} });
    if (suppression.suppressed) { skip(`suppressed_${suppression.reason}`); return contact; }
    enrolled += 1;
    return {
      ...contact,
      campaign_id: id,
      sequence_status: "Enrolled",
      enrolled_at: now,
      press_hold: false,
      press_hold_reason: null,
      press_hold_detail: null,
      press_released_at: now,
      press_release_campaign: id,
      updated_at: now
    };
  });

  if (!enrolled) {
    return { ok: false, error: "No assigned journalist passed the enrollment re-checks, so nothing was started.", skipped };
  }

  const run_approved = { approved_by: clean(actor) || "owner", approved_at: now };
  const nextCampaigns = campaigns.map((row) => clean(row.campaign_id || row.id) === id
    ? {
      ...row,
      status: "active",
      run_approved,
      // Press pitches are exactly one touch: no automated follow-up, ever. A reply is the
      // only continuation, and a reply suppresses further sends anyway.
      max_touches: 1,
      activated_at: now,
      updated_at: now
    }
    : row);

  return {
    ok: true,
    state: { ...state, [PRESS_CAMPAIGNS_COLLECTION]: nextCampaigns, outreachContacts },
    campaignId: id,
    enrolled,
    skipped,
    run_approved
  };
}

// Stop — immediate. The campaign leaves the planner's reach (status), and every unsent press
// queue item for it is archived so an already-approved item cannot ride a later tick out.
export function stopPressCampaign(state = {}, { campaignId = "", actor = "", now = new Date().toISOString() } = {}) {
  const id = clean(campaignId);
  const campaigns = list(state[PRESS_CAMPAIGNS_COLLECTION]);
  const campaign = campaigns.find((row) => clean(row.campaign_id || row.id) === id);
  if (!campaign) return { ok: false, error: "This press campaign does not exist." };
  if (lower(campaign.classification) !== "press") return { ok: false, error: "Only a press campaign can be stopped from here." };
  if (!["active", "running"].includes(lower(campaign.status))) {
    return { ok: false, error: `This campaign is ${clean(campaign.status) || "not running"}, so there is nothing to stop.` };
  }

  let archivedQueueItems = 0;
  const approvalQueue = list(state.approvalQueue).map((item) => {
    if (clean(item.campaign_id) !== id) return item;
    if (!["queued_for_approval", "approved"].includes(lower(item.status))) return item;
    archivedQueueItems += 1;
    return { ...item, status: "archived", archived_reason: "campaign_stopped", archived_at: now };
  });

  const nextCampaigns = campaigns.map((row) => clean(row.campaign_id || row.id) === id
    ? { ...row, status: "stopped", stopped_at: now, stopped_by: clean(actor) || "owner", updated_at: now }
    : row);

  return {
    ok: true,
    state: { ...state, [PRESS_CAMPAIGNS_COLLECTION]: nextCampaigns, approvalQueue },
    campaignId: id,
    archivedQueueItems
  };
}
