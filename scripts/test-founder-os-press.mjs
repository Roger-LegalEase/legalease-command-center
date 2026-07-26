// Founder OS Release 8 — the Press outreach lane.
//
// Press sends email to real journalists, so this suite is mostly about refusals.
//
// EVERY contact in this file is synthetic and uses a reserved example domain. The real source
// workbook holds ~176 real journalists' addresses, lives only in gitignored `data/private/`, and
// no value from it appears here, in any fixture, or in any log.
//
// What is proven:
//   1. Each of the five forbidden framings is blocked, each with a positive control that passes.
//   2. Unverified, stale, seed-list and no-email contacts are unsendable, each with its reason.
//   3. Shared newsroom addresses are treated differently from direct ones.
//   4. Warm prior relationships are follow-ups, not cold pitches.
//   5. This module contains no send path at all.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  PRESS_ANGLES,
  PRESS_EMAIL_TYPES,
  PRESS_GUARDRAIL_RULES,
  PRESS_SHARED_ADDRESS_DAILY_CAP,
  PRESS_VERIFICATION_MAX_AGE_DAYS,
  evaluatePressGuardrails,
  pressAngle,
  pressEligibility,
  pressOutreachKind
} from "./press-outreach.mjs";

const NOW = "2026-07-26T12:00:00.000Z";
const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}
const verdict = (text, angleId = "") => evaluatePressGuardrails(text, angleId);

// ---------------------------------------------------------------------------------------------
// 1. The Pitch Map is a gate, not a guideline
// ---------------------------------------------------------------------------------------------

check("all eight story angles carry proof required and a guardrail", () => {
  assert.equal(PRESS_ANGLES.length, 8, "the Pitch Map defines eight angles");
  for (const angle of PRESS_ANGLES) {
    assert.ok(angle.proofRequired.length >= 3, `${angle.id} must list what a claim needs`);
    assert.ok(angle.guardrail && angle.guardrail.length > 20, `${angle.id} must carry its guardrail`);
    assert.ok(angle.rules.length >= 1, `${angle.id} must map onto at least one enforced rule`);
  }
});

check("the draft surface is given the proof list before anything goes out", () => {
  const result = verdict("A straightforward product update.", "nationwide_milestone");
  assert.ok(result.proofRequired.includes("State coverage table"),
    "the proof list must travel with the verdict so Roger sees it while drafting");
  assert.match(result.guardrail, /lawyer replacement/i);
});

check("BLOCKED: lawyer-replacement framing", () => {
  for (const bad of [
    "LegalEase replaces a lawyer for record clearing.",
    "Clear your record without an attorney.",
    "No lawyer needed to expunge your record.",
    "A lawyer-free path to a clean record."
  ]) {
    assert.equal(verdict(bad).passed, false, `must block: ${bad}`);
    assert.ok(verdict(bad).hardFails.some((f) => f.rule === "no_lawyer_replacement"));
  }
  // Positive control: describes the product honestly and must pass.
  assert.equal(verdict("LegalEase helps people navigate record clearing, with attorney review built in.").passed, true);
});

check("BLOCKED: unqualified eligibility claims", () => {
  for (const bad of [
    "You qualify for expungement today.",
    "Guaranteed record clearance in 30 days.",
    "Everyone is eligible for this process.",
    "We will clear your record."
  ]) {
    assert.equal(verdict(bad).passed, false, `must block: ${bad}`);
    assert.ok(verdict(bad).hardFails.some((f) => f.rule === "no_unqualified_eligibility"));
  }
  assert.equal(verdict("Eligibility depends on your state and your record; the product checks it for you.").passed, true);
});

check("BLOCKED: identity framing with no business substance", () => {
  const bad = verdict("A Black-owned, HBCU-founded legal technology company.");
  assert.equal(bad.passed, false);
  assert.ok(bad.hardFails.some((f) => f.rule === "no_identity_only_framing"));
  // Positive control: the SAME identity language passes once real proof is present, which is
  // exactly what the Pitch Map guardrail asks for. The substance is now KIT-PROVEN rather than
  // traction, because traction is not something a draft may state (see `no_unbacked_figure`).
  assert.equal(verdict("A Black-owned legal technology company shipping attorney-reviewed self-help workflows across all 50 states and Washington, D.C.").passed, true);
  // And the old form — identity rescued by an unbacked traction figure — must now fail, since
  // nothing in the approved source backs it.
  const unbacked = verdict("A Black-owned legal technology company that grew to 12 states and 4,000 filings.");
  assert.equal(unbacked.passed, false);
  assert.ok(unbacked.hardFails.some((f) => f.rule === "no_unbacked_figure"));
});

check("BLOCKED: causal overstatement on participant outcomes", () => {
  const bad = verdict("Because of LegalEase she got a job within a month.");
  assert.equal(bad.passed, false);
  assert.ok(bad.hardFails.some((f) => f.rule === "no_causal_overstatement"));
  // Positive control avoids BOTH a causal claim and a participant story, since either would
  // legitimately trip a different rule. A control that trips another rule proves nothing.
  assert.equal(verdict("Published research associates record clearance with improved employment rates.").passed, true);
});

check("BLOCKED: participant story without recorded consent", () => {
  const bad = verdict("One participant told us his record blocked housing for years.");
  assert.equal(bad.passed, false);
  assert.ok(bad.hardFails.some((f) => f.rule === "requires_participant_consent"));
  // The ONLY thing that satisfies it is an explicit consent marker — nothing is inferred.
  assert.equal(verdict("One participant told us his record blocked housing for years; consent recorded.").passed, true);
});

check("every guardrail rule applies to every draft, not only to its own angle", () => {
  // A lawyer-replacement claim inside a thought-leadership pitch must still fail, even though
  // that angle's guardrail is about teaching something broader. A rule that only fired on its
  // own angle would be a guideline.
  const result = verdict("LegalEase replaces a lawyer.", "thought_leadership");
  assert.equal(result.passed, false);
  assert.ok(result.hardFails.some((f) => f.rule === "no_lawyer_replacement"));
});

check("a clean draft passes and reports no failures", () => {
  const result = verdict("LegalEase now supports record clearance in all 50 states and Washington, D.C., with attorney-reviewed document logic and published limits.", "nationwide_milestone");
  assert.equal(result.passed, true);
  assert.deepEqual(result.hardFails, []);
});

check("the charter's five rules, plus the figure rule the kit decision requires", () => {
  assert.deepEqual(PRESS_GUARDRAIL_RULES.map((rule) => rule.id).sort(), [
    "no_causal_overstatement", "no_identity_only_framing", "no_lawyer_replacement",
    "no_unbacked_figure", "no_unqualified_eligibility", "requires_participant_consent"
  ]);
});

// ---------------------------------------------------------------------------------------------
// 2. Eligibility, enforced in code
// ---------------------------------------------------------------------------------------------

const contact = (over = {}) => ({
  email: "reporter@example.org",
  press_verified_at: "2026-07-26",
  press_email_type: PRESS_EMAIL_TYPES.direct,
  ...over
});

check("a seed-list contact is never sendable, whatever else is true of it", () => {
  const result = pressEligibility(contact({ press_source: "black_press_seed" }), { now: NOW });
  assert.equal(result.sendable, false);
  assert.equal(result.reason, "seed_list");
  assert.match(result.detail, /unverified research/i, "the founder must be told why");
});

check("an unverified contact is not sendable and says so", () => {
  const result = pressEligibility(contact({ press_verified_at: "" }), { now: NOW });
  assert.equal(result.sendable, false);
  assert.equal(result.reason, "unverified");
});

check("a stale verification is not sendable", () => {
  const stale = new Date(Date.parse(NOW) - (PRESS_VERIFICATION_MAX_AGE_DAYS + 5) * 86_400_000).toISOString().slice(0, 10);
  const result = pressEligibility(contact({ press_verified_at: stale }), { now: NOW });
  assert.equal(result.sendable, false);
  assert.equal(result.reason, "stale_verification");
  // And a verification inside the window is fine.
  const fresh = new Date(Date.parse(NOW) - 10 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(pressEligibility(contact({ press_verified_at: fresh }), { now: NOW }).sendable, true);
});

check("a contact with no email is not sendable and the reason names the form route", () => {
  const result = pressEligibility(contact({ email: "", press_email_type: PRESS_EMAIL_TYPES.form }), { now: NOW });
  assert.equal(result.sendable, false);
  assert.equal(result.reason, "no_email");
  assert.match(result.detail, /form, not email/i);
});

check("a rejected contact is not sendable", () => {
  const result = pressEligibility(contact({ press_verification_status: "rejected" }), { now: NOW });
  assert.equal(result.sendable, false);
  assert.equal(result.reason, "rejected");
});

check("shared newsroom addresses are treated differently from direct ones", () => {
  const direct = pressEligibility(contact(), { now: NOW });
  const shared = pressEligibility(contact({ press_email_type: PRESS_EMAIL_TYPES.shared }), { now: NOW });
  assert.equal(direct.sendable, true);
  assert.equal(shared.sendable, true);

  assert.equal(direct.shared, false);
  assert.equal(shared.shared, true);
  // The two things that must differ: personalisation and volume.
  assert.equal(direct.personalise, true, "a direct address is a person and may be personalised");
  assert.equal(shared.personalise, false, "a shared address is a desk and must not be personalised");
  assert.equal(shared.dailyCap, PRESS_SHARED_ADDRESS_DAILY_CAP,
    "one address representing a whole masthead needs a tighter cap");
  assert.match(shared.detail, /desk, not a person/i);
});

// ---------------------------------------------------------------------------------------------
// 3. Warm relationships are follow-ups, not cold pitches
// ---------------------------------------------------------------------------------------------

check("a prior placement is a warm follow-up carrying its recommended text", () => {
  const warm = pressOutreachKind({
    press_relationship: "Warm / syndicated",
    press_recommended_follow_up: "Offer the nationwide milestone as a follow-up to the 2025 feature."
  });
  assert.equal(warm.kind, "warm_follow_up");
  assert.match(warm.recommendedFollowUp, /nationwide milestone/,
    "the recorded recommendation must be available while drafting");
});

check("a cold contact is a cold pitch with no invented recommendation", () => {
  const cold = pressOutreachKind({ press_relationship: "Cold" });
  assert.equal(cold.kind, "cold_pitch");
  assert.equal(cold.recommendedFollowUp, null, "nothing may be invented for a cold contact");
});

// ---------------------------------------------------------------------------------------------
// 4. No send path, and no real addresses
// ---------------------------------------------------------------------------------------------

check("the press module contains no send path of its own", () => {
  const source = readFileSync(new URL("./press-outreach.mjs", import.meta.url), "utf8")
    .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of [
    "sendgrid", "SENDGRID", "fetch(", "claimReactivationSends", "claimOutreachSends",
    "recordSuppression", "releaseWave", "publishToChannel", "nodemailer", "smtp"
  ]) {
    assert.ok(!source.includes(forbidden),
      `press-outreach.mjs must contain no "${forbidden}" — every send gate is the existing outreach machinery, reached because press contacts are ordinary outreach contacts`);
  }
  assert.ok(source.includes("pressEligibility"), "the stripped source must still be substantial");
  assert.ok(source.length > 2000, `stripped source is ${source.length} bytes; the check would be vacuous`);
});

check("no real email address appears anywhere in this suite", () => {
  const source = readFileSync(new URL("./test-founder-os-press.mjs", import.meta.url), "utf8");
  const addresses = source.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  assert.ok(addresses.length > 0, "the suite should exercise at least one address");
  for (const address of addresses) {
    const domain = address.split("@").pop().toLowerCase();
    assert.ok(["example.org", "example.com", "example.net"].includes(domain),
      `${domain} is not a reserved example domain; the press corpus is real journalists' PII and must never enter a fixture`);
  }
});

check("the source workbook is not in the repository", () => {
  // The corpus lives in gitignored data/private/ only. If it ever became tracked this fails.
  const tracked = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(tracked, /^data\/private\/$/m,
    "data/private/ must remain gitignored — it holds real journalists' contact details");
});


// ---------------------------------------------------------------------------------------------
// 5. The importer — review-only, identity-preserving, and PII-safe
// ---------------------------------------------------------------------------------------------

const { buildPressImportPlan, applyPressImportPlan } = await import("./press-import.mjs");
const { mapMasterRow, mapSeedRow, sheetRecords } = await import("./press-workbook.mjs");
const { companyContactId } = await import("./company-memory.mjs");

// A synthetic two-sheet workbook in the shape readWorkbook returns. No real data involved.
function syntheticWorkbook() {
  const master = [
    ["Priority Rank", "Tier", "Journalist", "Primary Publication", "Coverage Lanes", "Geography",
      "Pitchability", "Relationship", "Public Email", "Email Type", "Reference Article / Work",
      "Reference URL", "Why LegalEase Fits", "Best Pitch Angle", "Verified", "Confidence / Notes"],
    ["1", "Tier 1", "Alex Rivera", "Example Legal Review", "LegalTech", "National / U.S.",
      "Product/news", "Cold", "alex@example.org", "Direct public", "A piece on legal AI",
      "https://example.org/a", "Covers legal AI", "nationwide_milestone", "2026-07-26", "High — official/public source"],
    ["2", "Tier 2", "Sam Okafor", "Example Desk", "Criminal Justice", "National / U.S.",
      "Investigative", "Warm", "desk@example.net", "Shared newsroom", "A reentry series",
      "https://example.net/b", "Covers reentry", "implementation_gap", "2026-07-26", "Medium — re-verify before outreach"],
    ["3", "Tier 3", "Jo Chen", "Example Weekly", "Impact", "National / U.S.",
      "Feature", "Cold", "", "Official contact form", "", "", "Covers impact", "founder_growth", "2026-07-26", "Medium"]
  ];
  const seed = [
    ["Publication", "Geographic Focus", "LegalEase Fit", "2026 Status", "Media Lane", "Recommended Angle", "Source / Verification Note"],
    ["Example Seed Press", "Southeast", "Strong", "Needs 2026 verification", "Black Press", "founder_growth", "Directory listing"],
    ["Example Verified Press", "National", "Strong", "Verified active", "Black Press", "founder_growth", "Confirmed masthead"]
  ];
  const existing = [
    ["Publication / Show", "Journalist / Host", "Coverage", "Format", "Date", "URL", "Relationship", "Recommended Follow-up"],
    ["Example Podcast", "Alex Rivera", "Founder interview", "Podcast", "2025-11-02", "https://example.org/ep", "Warm", "Offer the nationwide milestone."]
  ];
  const desks = [
    ["Outlet", "Primary Beat", "Best Contact", "Public Email", "Route Type", "Official Source / Contact URL", "How to Use"],
    ["Example Desk", "Justice", "Tips line", "tips@example.net", "Shared tips", "https://example.net/tips", "Use for breaking news"]
  ];
  return new Map([
    ["Master Media List", master], ["Black Press Seed", seed],
    ["Existing LegalEase Press", existing], ["Outlet Desks", desks]
  ]);
}

const NOW_IMPORT = "2026-07-26T12:00:00.000Z";

check("nothing imported is contactable — every record lands held and unenrolled", () => {
  const plan = buildPressImportPlan({ companyContacts: [] }, syntheticWorkbook(), { now: NOW_IMPORT });
  assert.ok(plan.outreachContacts.length >= 5, "master and seed rows must both import");
  for (const row of plan.outreachContacts) {
    assert.equal(row.press_hold, true, `${row.contact_id} must be held on import`);
    assert.equal(row.sequence_status, "Not Enrolled",
      "an enrolled contact could be picked up by a planner; import must never enrol");
    assert.equal(row.classification, "press", "press contacts are ordinary outreach contacts");
  }
});

check("the seed list is held regardless of what its row claims", () => {
  const plan = buildPressImportPlan({ companyContacts: [] }, syntheticWorkbook(), { now: NOW_IMPORT });
  const seeds = plan.outreachContacts.filter((row) => row.press_source === "black_press_seed");
  assert.equal(seeds.length, 2);
  for (const row of seeds) {
    assert.equal(row.press_sendable, false, "a seed row marked 'Verified active' is still research, not a contact record");
    assert.equal(row.press_hold_reason, "seed_list");
  }
});

check("eligibility is recorded as a reason, never as permission", () => {
  const plan = buildPressImportPlan({ companyContacts: [] }, syntheticWorkbook(), { now: NOW_IMPORT });
  const byId = Object.fromEntries(plan.outreachContacts.map((row) => [row.contact_name || row.publication, row]));
  assert.equal(byId["Alex Rivera"].press_sendable, true);
  assert.equal(byId["Sam Okafor"].press_sendable, true);
  assert.equal(byId["Jo Chen"].press_sendable, false);
  assert.equal(byId["Jo Chen"].press_hold_reason, "no_email");
  assert.match(byId["Jo Chen"].press_hold_detail, /form, not email/i);
});

check("a journalist already in the CRM gains the media role instead of a duplicate", () => {
  const existingId = companyContactId("alex@example.org");
  const state = { companyContacts: [{ contact_id: existingId, email: "alex@example.org", name: "Alex Rivera", types: ["investor"], links: [], organizations: [] }] };
  const plan = buildPressImportPlan(state, syntheticWorkbook(), { now: NOW_IMPORT });

  assert.equal(plan.summary.matchedExistingPerson, 1, "the existing person must be matched, not duplicated");
  const patch = plan.contactPatches.find((entry) => entry.contact_id === existingId);
  assert.ok(patch.existing, "the match must be recorded as an existing person");
  assert.deepEqual([...patch.types].sort(), ["investor", "media"],
    "the press role is ADDED to the roles already held; nothing is replaced");

  const applied = applyPressImportPlan(state, plan, { now: NOW_IMPORT });
  const people = applied.companyContacts.filter((row) => row.email === "alex@example.org");
  assert.equal(people.length, 1, "exactly one person may exist for one address");
});

check("prior coverage is imported as placements carrying their recommended follow-up", () => {
  const plan = buildPressImportPlan({ companyContacts: [] }, syntheticWorkbook(), { now: NOW_IMPORT });
  assert.equal(plan.placements.length, 1);
  const placement = plan.placements[0];
  assert.equal(placement.kind, "prior_coverage");
  assert.match(placement.recommendedFollowUp, /nationwide milestone/i,
    "the recorded recommendation must be available when drafting");
  assert.equal(plan.outletRoutes.length, 1, "outlet-level routes import separately from people");
});

check("applying the plan writes records and starts no sequence", () => {
  const applied = applyPressImportPlan({ companyContacts: [] },
    buildPressImportPlan({ companyContacts: [] }, syntheticWorkbook(), { now: NOW_IMPORT }), { now: NOW_IMPORT });
  assert.ok(applied.outreachContacts.length >= 5);
  assert.ok(applied.pressPlacements.length === 1);
  assert.ok(applied.pressOutletRoutes.length === 1);
  assert.equal(applied.outreachContacts.every((row) => row.sequence_status === "Not Enrolled"), true);
});

check("the importer module contains no send path", () => {
  const source = readFileSync(new URL("./press-import.mjs", import.meta.url), "utf8")
    .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of ["sendgrid", "fetch(", "claimOutreachSends", "recordSuppression", "releaseWave", "planOutreach"]) {
    assert.ok(!source.includes(forbidden), `press-import.mjs must contain no "${forbidden}"`);
  }
  assert.ok(source.length > 1500, "stripped source must remain substantial");
});

// ---------------------------------------------------------------------------------------------
// 6. The lane surface
// ---------------------------------------------------------------------------------------------

const { buildFounderCampaignsView } = await import("./ui/view-models/founder-campaigns-view.mjs");

const laneState = () => applyPressImportPlan({ companyContacts: [] },
  buildPressImportPlan({ companyContacts: [] }, syntheticWorkbook(), { now: NOW_IMPORT }), { now: NOW_IMPORT });

const pressLaneOf = (state, pressEnabled) => buildFounderCampaignsView(
  { posts: [], prospectCandidates: [], outreachReplies: [], outreachSuppressions: [], outreachUnsubscribes: [], approvalQueue: [], ...state },
  { env: {}, now: new Date(NOW_IMPORT), pressEnabled }
).lanes.find((lane) => lane.id === "press");

check("with FOUNDER_OS_PRESS off the lane keeps its honest not-built state", () => {
  const lane = pressLaneOf(laneState(), false);
  assert.equal(lane.built, false);
  assert.equal(lane.available, false);
  for (const stage of lane.stages) assert.equal(stage.state, "not_built");
});

check("with the flag on the lane shows contactable versus held, with the reasons", () => {
  const lane = pressLaneOf(laneState(), true);
  const stage = (id) => lane.stages.find((entry) => entry.id === id);
  assert.deepEqual(lane.stages.map((entry) => entry.label), ["Plan", "Review", "Run", "Monitor", "Stop"]);
  assert.match(stage("plan").summary, /8 story angles/, "Plan offers the angles and their proof");
  assert.match(stage("review").summary, /2 contactable, 3 held/);
  assert.match(stage("review").summary, /seed list|no email/i, "held contacts must show WHY");
});

check("Run cannot start anything without approval, and says so", () => {
  const lane = pressLaneOf(laneState(), true);
  const run = lane.stages.find((entry) => entry.id === "run");
  assert.equal(run.state, "stopped", "no press campaign may be running by default");
  assert.match(run.blockedReason, /nothing sends until you approve/i);
  assert.equal(run.action.route, "POST /api/outreach/approve",
    "Run routes through the EXISTING approval endpoint — there is no press send route");
});

check("warm prior relationships surface as follow-ups, not cold pitches", () => {
  const lane = pressLaneOf(laneState(), true);
  const warm = lane.exceptions.find((entry) => entry.id === "press-warm-follow-ups");
  assert.ok(warm, "prior relationships must be surfaced");
  assert.match(warm.detail, /follow-ups, not cold pitches/i);
});

check("no press stage offers a publish or send route", () => {
  for (const stage of pressLaneOf(laneState(), true).stages) {
    const route = String(stage.action?.route || "");
    assert.ok(!/\/send\b|publish/.test(route), `press stage ${stage.id} must not offer ${route}`);
  }
});

// ---------------------------------------------------------------------------------------------
// 7. The press kit as the approved proof and claims source
// ---------------------------------------------------------------------------------------------

const {
  PRESS_FOLLOW_UP_ARTIFACTS,
  PRESS_KIT,
  PRESS_KIT_BOUNDARY_CLAIMS,
  PRESS_KIT_SECTIONS,
  PRESS_PROOF_SOURCES,
  pressAngleAudience,
  pressProofPlan
} = await import("./press-kit.mjs");

check("the registered kit is the file Roger approved, and it exists on disk", () => {
  assert.equal(PRESS_KIT.file, "docs/press/LegalEase_Press_Kit_July_2026_Rebuilt.pdf");
  assert.ok(existsSync(new URL(`../${PRESS_KIT.file}`, import.meta.url)),
    "the approved-claims source must be a file that is actually there");
  assert.equal(PRESS_KIT_SECTIONS.length, 9, "the kit is a nine-part reference");
});

check("every Pitch Map proof requirement resolves to the kit or to a follow-up artifact", () => {
  for (const angle of PRESS_ANGLES) {
    for (const requirement of angle.proofRequired) {
      const source = PRESS_PROOF_SOURCES[requirement];
      assert.ok(source, `${angle.id}: "${requirement}" is not mapped to the kit`);
      assert.ok(["kit", "kit_partial", "follow_up"].includes(source.kind));
      // A kit-backed requirement must name sections that really exist.
      for (const id of source.sections) {
        assert.ok(PRESS_KIT_SECTIONS.some((section) => section.id === id), `unknown kit section ${id}`);
      }
    }
  }
});

check("no angle is dead: every one is pitchable on the kit alone, and every one has a route", () => {
  for (const angle of PRESS_ANGLES) {
    const plan = pressProofPlan(angle);
    assert.equal(plan.pitchableOnKitAlone, true, `${angle.id} must be pitchable on the kit alone`);
    assert.ok(plan.reframe, `${angle.id} must say how it is pitched as it stands`);
    // The follow-ups are never presented as blockers, and each carries an offer line instead.
    for (const entry of plan.followUp) {
      assert.ok(entry.offerLine, `${angle.id}: ${entry.requirement} must be offerable, not just absent`);
    }
  }
  // The AI-guardrails angle is the one the kit satisfies outright — no follow-up, no partial.
  const guardrails = pressProofPlan(pressAngle("ai_guardrails"));
  assert.equal(guardrails.followUp.length, 0);
  assert.equal(guardrails.partial.length, 0);
  assert.equal(guardrails.kitCoverage.satisfied, 4);
});

check("traction and a participant story are follow-up artifacts, not blockers", () => {
  assert.equal(PRESS_FOLLOW_UP_ARTIFACTS.length, 2);
  for (const artifact of PRESS_FOLLOW_UP_ARTIFACTS) {
    assert.equal(artifact.blocksPitch, false, `${artifact.id} must never block a pitch`);
    assert.equal(artifact.mayState, false, `${artifact.id} must never be stated without a source`);
    assert.equal(artifact.availability, "on_request");
    assert.ok(artifact.offerLine.length > 10);
  }
  // The consent requirement survives the reclassification intact.
  const story = PRESS_FOLLOW_UP_ARTIFACTS.find((entry) => entry.id === "participant_story");
  assert.equal(story.requiresConsentFirst, true);
  assert.match(story.offerLine, /consent/i);
});

check("BLOCKED: a draft contradicting any of the kit's boundary claims", () => {
  // One case per ratified boundary claim. Each must fail, and must fail by NAME.
  const cases = [
    ["not_a_law_firm", "LegalEase is a law firm for people with records."],
    ["no_legal_advice_or_representation", "We provide legal advice to every customer who buys a packet."],
    ["may_be_able_to", "LegalEase will clear your record in 60 days."],
    ["guidance_only", "Automatic Clean Slate sealing is included in the $50 packet."],
    ["no_guaranteed_outcome", "We guarantee court approval of your petition."],
    ["fifty_dollar_excludes_representation", "The $50 includes attorney representation and a court appearance."],
    ["state_table_is_product_support", "The coverage map shows you qualify wherever your record is."]
  ];
  assert.equal(cases.length, PRESS_KIT_BOUNDARY_CLAIMS.length,
    "every ratified boundary claim needs a draft that contradicts it");
  for (const [rule, draft] of cases) {
    const result = verdict(draft);
    assert.equal(result.passed, false, `must block: ${draft}`);
    assert.ok(result.hardFails.some((fail) => fail.rule === rule),
      `"${draft}" must fail as ${rule}, got ${result.hardFails.map((f) => f.rule).join(",") || "nothing"}`);
    // The failure carries the kit's own sentence, so the reason is the claim, not a rule id.
    const named = result.hardFails.find((fail) => fail.rule === rule);
    assert.ok(named.claim && named.claim.length > 20, `${rule} must report the claim it broke`);
  }
});

check("the kit's OWN boundary language passes — negation is not a contradiction", () => {
  // The trap this gate has to survive: the approved sentences contain the forbidden words.
  for (const claim of PRESS_KIT_BOUNDARY_CLAIMS) {
    assert.equal(verdict(claim.claim).passed, true,
      `the kit's own ratified sentence must pass: "${claim.claim}"`);
  }
  assert.equal(verdict("LegalEase is not a law firm and does not provide legal advice or representation. The $50 path does not include representation, and the state table is product support, not a legal conclusion.").passed, true);
});

check("BLOCKED: stating a figure the kit cannot back; ALLOWED: offering it", () => {
  for (const bad of [
    "We have served 3,000 users across the country.",
    "Revenue grew 40% last quarter.",
    "LegalEase has prepared 1,200 filings to date.",
    "We raised $2 million to build it."
  ]) {
    const result = verdict(bad);
    assert.equal(result.passed, false, `must block: ${bad}`);
    assert.ok(result.hardFails.some((fail) => fail.rule === "no_unbacked_figure"));
  }
  // The kit's own figures are not traction, and must never trip it.
  assert.equal(verdict("Free screening in all 50 states and Washington, D.C., with a $50 flat packet price and EN + ES support.").passed, true);
  // Offering what cannot be claimed is the approved behaviour, not a failure.
  assert.equal(verdict("Usage and traction figures are available on request. A participant interview can be arranged on request, with recorded consent obtained first.").passed, true);
});

check("the verdict hands the draft surface the kit, its offers and its proof plan", () => {
  const result = verdict("A straightforward product update.", "economic_mobility");
  assert.equal(result.approvedClaimsSource, PRESS_KIT.file);
  assert.equal(result.approvedClaimsCurrentAsOf, PRESS_KIT.currentAsOf);
  assert.ok(result.offers.length >= 1, "a draft must be told what to offer instead of claiming");
  // The story-heavy angle is carried entirely by the cost half of "Cost/time comparisons" —
  // partial proof, but real proof, and enough to pitch on.
  assert.equal(result.proofPlan.satisfied.length + result.proofPlan.partial.length >= 1, true);
  assert.equal(result.proofPlan.pitchableOnKitAlone, true);
  assert.match(result.proofPlan.reframe, /cost/i);
});

check("the Plan stage shows kit-proven proof and offers, never an unclearable warning", () => {
  const plan = pressLaneOf(laneState(), true).stages.find((entry) => entry.id === "plan");
  assert.equal(plan.state, "ready", "Plan is never in attention for proof Roger has decided about");
  assert.equal(plan.blockedReason, null, "nothing about proof blocks planning");
  assert.match(plan.summary, /pitchable on the press kit alone/i);
  assert.equal(plan.detail.approvedSource, PRESS_KIT.file);
  assert.equal(plan.detail.angles.length, 8);
  for (const angle of plan.detail.angles) {
    assert.ok(angle.provenByKit.length + angle.provenInPart.length >= 1,
      `${angle.id} must show what the kit proves`);
    // The surface must not carry a "missing" list — follow-ups are offers.
    assert.equal(angle.missing, undefined);
    if (angle.offeredOnRequest.length) assert.ok(angle.offers.length >= 1);
  }
  assert.match(plan.detail.followUpPolicy, /offered on request, not required to pitch/i);
  assert.match(plan.detail.followUpPolicy, /recorded consent/i);
});

check("the audience an angle actually reaches is counted from eligibility, not guessed", () => {
  const audience = pressAngleAudience(laneState().outreachContacts, "ai_guardrails");
  assert.equal(audience.contactable, 2, "only the contactable rows count");
  assert.ok(audience.onBeat <= audience.contactable, "an angle cannot reach more than are contactable");
  // Held rows can never enter an audience, whatever their beat.
  const held = laneState().outreachContacts.filter((row) => row.press_sendable !== true);
  assert.ok(held.length >= 1);
  assert.ok(!held.some((row) => row.press_sendable === true));
});

console.log(`Founder OS Release 8 press: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
