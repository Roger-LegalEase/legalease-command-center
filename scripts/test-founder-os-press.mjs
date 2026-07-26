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
import { readFileSync } from "node:fs";

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
  // exactly what the Pitch Map guardrail asks for.
  assert.equal(verdict("A Black-owned legal technology company that grew to 12 states and 4,000 filings.").passed, true);
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
  const result = verdict("LegalEase now supports record clearance in 12 states, with attorney review and published limits.", "nationwide_milestone");
  assert.equal(result.passed, true);
  assert.deepEqual(result.hardFails, []);
});

check("the five rules are exactly the five the charter names", () => {
  assert.deepEqual(PRESS_GUARDRAIL_RULES.map((rule) => rule.id).sort(), [
    "no_causal_overstatement", "no_identity_only_framing", "no_lawyer_replacement",
    "no_unqualified_eligibility", "requires_participant_consent"
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

console.log(`Founder OS Release 8 press: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
