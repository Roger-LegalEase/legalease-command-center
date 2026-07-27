// Founder OS — the multi-angle press campaign composer.
//
// The composer drafts pitches to real journalists, so this suite is mostly about what it
// CANNOT do. Every contact here is synthetic and uses a reserved example domain.
//
// What is proven:
//   1. Every angle's shipped draft passes the guardrail + claims gate, and a doctored draft
//      fails — the gate is live, not decorative.
//   2. Assignment is deterministic: the workbook hint wins, beats decide otherwise, ties go to
//      Pitch Map order, off-beat contacts land unassigned, warm relationships are excluded.
//   3. A proposal writes ONLY inert campaign/step rows: status "proposed" on every row,
//      contacts untouched, and apply refuses any row that is not an inert press proposal.
//   4. The planner cannot pick a proposal up — and even a campaign forced "active" fails
//      closed at the unmapped press classification, contact by contact.
//   5. The module contains no send path; the endpoints are wired, owner-gated and re-verify
//      the propose-only invariant server-side.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRESS_ANGLES, evaluatePressGuardrails } from "./press-outreach.mjs";
import {
  PRESS_CAMPAIGN_STATUS,
  applyPressCampaignProposal,
  assignPressAngles,
  buildPressCampaignProposal,
  draftPressPitch,
  matchAngleHint,
  pressCampaignId
} from "./press-campaign.mjs";
import { planOutreach } from "./outreach-os.mjs";
import { buildFounderCampaignsView } from "./ui/view-models/founder-campaigns-view.mjs";
import { FOUNDER_CAMPAIGNS_READ_COLLECTIONS } from "./founder-campaigns-api.mjs";

const NOW = "2026-07-27T12:00:00.000Z";
const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

// ---------------------------------------------------------------------------------------------
// Fixtures — synthetic journalists on reserved domains only.
// ---------------------------------------------------------------------------------------------

const pressContact = (id, over = {}) => ({
  contact_id: `press-${id}`,
  email: `${id}@example.org`,
  contact_name: "",
  organization_name: "Example Outlet",
  classification: "press",
  sequence_status: "Not Enrolled",
  press_hold: true,
  press_sendable: true,
  press_outreach_kind: "cold_pitch",
  press_email_type: "Direct public",
  press_coverage_lanes: "",
  press_best_angle: "",
  ...over
});

const fixtureState = () => ({
  outreachContacts: [
    // Hinted straight at an angle by the workbook, whatever the lanes say.
    pressContact("hinted", { press_best_angle: "AI guardrails in everyday legal help", press_coverage_lanes: "criminal justice" }),
    // No hint; beats decide. "black founders" + "startups" outscores any single-beat angle.
    pressContact("beats", { press_coverage_lanes: "black founders, startups, venture capital" }),
    // One beat ("ai") matches several angles equally; the tie must go to Pitch Map order.
    pressContact("tied", { press_coverage_lanes: "ai" }),
    // Off every beat: honest unassigned, never shoehorned.
    pressContact("offbeat", { press_coverage_lanes: "celebrity gossip" }),
    // Warm prior relationship: excluded from cold pitches entirely.
    pressContact("warm", { press_outreach_kind: "warm_follow_up", press_coverage_lanes: "legaltech" }),
    // Held: never considered, whatever the lanes say.
    pressContact("held", { press_sendable: false, press_coverage_lanes: "legaltech, ai" }),
    // A shared newsroom desk, counted separately in the audience split.
    pressContact("desk", { press_email_type: "Shared newsroom", press_coverage_lanes: "reentry, criminal justice, courts" }),
    // Not press at all: invisible to the composer.
    { contact_id: "org-1", email: "maria.contact@example.com", classification: "nonprofit", press_sendable: true, press_coverage_lanes: "legaltech" }
  ]
});

// ---------------------------------------------------------------------------------------------
// 1. Every shipped draft passes the gate — and the gate is live
// ---------------------------------------------------------------------------------------------

check("all eight angle drafts exist and pass the guardrail + claims gate", () => {
  for (const angle of PRESS_ANGLES) {
    const draft = draftPressPitch(angle);
    assert.ok(draft, `${angle.id} must have a draft`);
    assert.ok(draft.subject.length > 20 && draft.body.length > 400, `${angle.id} draft must be substantial`);
    const gate = evaluatePressGuardrails(`${draft.subject}\n${draft.body}`, angle.id);
    assert.deepEqual(gate.hardFails, [], `${angle.id} draft must pass: ${JSON.stringify(gate.hardFails)}`);
  }
});

check("drafts offer follow-up artifacts instead of claiming figures", () => {
  const growth = draftPressPitch(PRESS_ANGLES.find((angle) => angle.id === "founder_growth"));
  assert.match(growth.body, /available on request/i, "traction must be offered, never stated");
  assert.match(growth.body, /not a law firm/i, "the boundary language travels with every draft");
  assert.ok(!/\[First Name\]/.test(growth.body), "the greeting is name-free: no merge token may appear");
});

check("a doctored draft fails the gate — the gate is not decorative", () => {
  const gate = evaluatePressGuardrails(
    "We guarantee approval and 5,000 users already cleared their records without a lawyer.",
    "nationwide_milestone"
  );
  assert.equal(gate.passed, false, "the control draft must fail");
  assert.ok(gate.hardFails.length >= 2, "multiple rules must fire on the control draft");
});

// ---------------------------------------------------------------------------------------------
// 2. Deterministic assignment
// ---------------------------------------------------------------------------------------------

check("the workbook hint resolves conservatively", () => {
  assert.equal(matchAngleHint("AI guardrails in everyday legal help")?.id, "ai_guardrails", "exact label");
  assert.equal(matchAngleHint("nationwide milestone")?.id, "nationwide_milestone", "exact id, spaced");
  assert.equal(matchAngleHint("AI guardrails")?.id, "ai_guardrails", "multi-word label prefix");
  assert.equal(matchAngleHint("ai"), null, "a single stray word must not hijack routing");
  assert.equal(matchAngleHint(""), null, "empty hint matches nothing");
});

check("hint wins, beats decide, ties go to Pitch Map order, off-beat is unassigned", () => {
  const result = assignPressAngles(fixtureState().outreachContacts);
  const assignedIds = (angleId) => (result.assignments.get(angleId) || []).map((row) => row.contact.contact_id);

  assert.deepEqual(assignedIds("ai_guardrails").filter((id) => id === "press-hinted"), ["press-hinted"],
    "the hinted contact lands on the hinted angle despite off-angle lanes");
  assert.deepEqual(assignedIds("founder_growth"), ["press-beats"],
    "beat count decides when there is no hint");
  assert.ok(assignedIds("nationwide_milestone").includes("press-tied"),
    "a tie on beat count goes to the earlier Pitch Map angle");
  assert.deepEqual(result.unassigned.map((row) => row.contact_id), ["press-offbeat"],
    "an off-beat contact is reported unassigned, never shoehorned");
  assert.deepEqual(result.warmFollowUps.map((row) => row.contact_id), ["press-warm"],
    "warm prior relationships are excluded from cold pitches");
  assert.equal(result.contactable, 6, "held and non-press contacts are invisible");

  const everywhere = [...result.assignments.values()].flat().map((row) => row.contact.contact_id);
  assert.equal(new Set(everywhere).size, everywhere.length, "nobody may be assigned to two angles");
  assert.ok(!everywhere.includes("press-held") && !everywhere.includes("org-1"),
    "held and non-press contacts must never be assigned");
});

// ---------------------------------------------------------------------------------------------
// 3. The proposal writes only inert rows
// ---------------------------------------------------------------------------------------------

check("every proposed campaign is an inert press proposal, and empty angles are skipped", () => {
  const plan = buildPressCampaignProposal(fixtureState(), { now: NOW });
  assert.ok(plan.outreachCampaigns.length >= 3, "the fixture audience spans at least three angles");
  for (const row of plan.outreachCampaigns) {
    assert.equal(row.status, PRESS_CAMPAIGN_STATUS, `${row.campaign_id} must be proposed, never startable`);
    assert.equal(row.classification, "press", `${row.campaign_id} must stay press-classified (the fail-closed routing)`);
    assert.ok(row.audience_contact_ids.length > 0, `${row.campaign_id} must carry its audience`);
  }
  const stepCampaigns = plan.outreachSequenceSteps.map((row) => row.campaign_id).sort();
  assert.deepEqual(stepCampaigns, plan.outreachCampaigns.map((row) => row.campaign_id).sort(),
    "each proposed campaign carries exactly one drafted step");
  assert.ok(plan.summary.skippedEmptyAngles.length > 0, "angles with no audience are skipped, not written empty");
  assert.equal(plan.summary.assigned + plan.summary.unassigned + plan.summary.excludedWarmFollowUps,
    plan.summary.contactable, "the summary must account for every contactable journalist");
});

check("apply touches only the two campaign collections and never a contact", () => {
  const state = fixtureState();
  const before = JSON.stringify(state.outreachContacts);
  const plan = buildPressCampaignProposal(state, { now: NOW });
  const next = applyPressCampaignProposal(state, plan, { now: NOW });

  assert.equal(JSON.stringify(next.outreachContacts), before, "contact rows must be byte-identical");
  const changedKeys = Object.keys(next).filter((key) => next[key] !== state[key]);
  assert.deepEqual(changedKeys.sort(), ["outreachCampaigns", "outreachSequenceSteps"],
    "only the two campaign collections may change");

  const again = applyPressCampaignProposal(next, buildPressCampaignProposal(next, { now: NOW }), { now: NOW });
  assert.equal(again.outreachCampaigns.length, next.outreachCampaigns.length, "re-apply replaces, never duplicates");
});

check("apply refuses a row that is not an inert press proposal", () => {
  const plan = buildPressCampaignProposal(fixtureState(), { now: NOW });
  const doctored = { ...plan, outreachCampaigns: plan.outreachCampaigns.map((row, index) => index === 0 ? { ...row, status: "active" } : row) };
  assert.throws(() => applyPressCampaignProposal(fixtureState(), doctored, { now: NOW }),
    /refused/i, "a startable row must abort the whole apply");
});

// ---------------------------------------------------------------------------------------------
// 4. The planner cannot pick a proposal up — twice over
// ---------------------------------------------------------------------------------------------

check("the planner skips proposed campaigns entirely", () => {
  const state = applyPressCampaignProposal(fixtureState(), buildPressCampaignProposal(fixtureState(), { now: NOW }), { now: NOW });
  const planned = planOutreach(state, { now: new Date(NOW) });
  assert.deepEqual(planned.proposals, [], "a proposed campaign must queue nothing");
});

check("even a campaign forced active fails closed at the press classification", () => {
  let state = applyPressCampaignProposal(fixtureState(), buildPressCampaignProposal(fixtureState(), { now: NOW }), { now: NOW });
  const target = pressCampaignId("ai_guardrails");
  state = {
    ...state,
    // Force the worst case: an active press campaign with a contact attached to it directly.
    outreachCampaigns: state.outreachCampaigns.map((row) => row.campaign_id === target ? { ...row, status: "active" } : row),
    outreachContacts: state.outreachContacts.map((row) =>
      row.contact_id === "press-hinted" ? { ...row, campaign_id: target } : row)
  };
  const planned = planOutreach(state, { now: new Date(NOW) });
  assert.deepEqual(planned.proposals, [], "the unmapped press classification must stop every contact");
  assert.ok(planned.observations.some((entry) => entry.type === "skip_unmapped_classification"),
    "the skip must be observed by name, not silent");
});

// ---------------------------------------------------------------------------------------------
// 5. The lane surfaces proposals without gaining a start switch
// ---------------------------------------------------------------------------------------------

check("the press lane's Run stage lists proposals and keeps its refusal", () => {
  const state = applyPressCampaignProposal(fixtureState(), buildPressCampaignProposal(fixtureState(), { now: NOW }), { now: NOW });
  const view = buildFounderCampaignsView(state, { pressEnabled: true });
  const run = view.lanes.find((lane) => lane.id === "press").stages.find((stage) => stage.id === "run");
  assert.equal(run.state, "stopped", "proposals must not make Run look running");
  assert.match(run.summary, /proposed angle campaign/i, "Roger must see what is drafted");
  assert.match(run.blockedReason, /nothing sends until you approve/i, "the refusal is unchanged");
  assert.ok(run.detail.proposedCampaigns.length >= 3, "each proposal is listed");
  for (const entry of run.detail.proposedCampaigns) {
    assert.ok(entry.assigned > 0, "each listed proposal carries its audience size");
  }
  assert.ok(FOUNDER_CAMPAIGNS_READ_COLLECTIONS.includes("outreachCampaigns"),
    "the read projection must hydrate the campaign rows the lane now lists");
});

// ---------------------------------------------------------------------------------------------
// 6. No send path, wired endpoints, no real addresses
// ---------------------------------------------------------------------------------------------

const stripped = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
  .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");

check("the composer module contains no send path", () => {
  const source = stripped("./press-campaign.mjs");
  for (const forbidden of [
    "sendgrid", "SENDGRID", "fetch(", "claimReactivationSends", "claimOutreachSends",
    "recordSuppression", "releaseWave", "publishToChannel", "nodemailer", "smtp", "planOutreach"
  ]) {
    assert.ok(!source.includes(forbidden),
      `press-campaign.mjs must contain no "${forbidden}" — a proposal is records, never a send`);
  }
  assert.ok(source.includes("buildPressCampaignProposal"), "the stripped source must still be substantial");
  assert.ok(source.length > 2000, `stripped source is ${source.length} bytes; the check would be vacuous`);
});

check("the composer endpoints are wired, owner-gated, and re-verify propose-only server-side", () => {
  const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  assert.ok(source.includes('"/api/press/campaign/preview"'), "preview endpoint must exist");
  assert.ok(source.includes('"/api/press/campaign/confirm"'), "confirm endpoint must exist");

  const confirmAt = source.indexOf('"/api/press/campaign/confirm"');
  const confirmBlock = source.slice(confirmAt, confirmAt + 3000);
  assert.ok(confirmBlock.includes('["owner", "admin"].includes(actorRole)'), "confirm must be owner/admin-gated");
  assert.ok(confirmBlock.includes('row.status !== "proposed"'), "confirm must re-verify the propose-only invariant");
  assert.ok(confirmBlock.includes("Press campaign refused"), "a violation must abort loudly");

  const previewAt = source.indexOf('"/api/press/campaign/preview"');
  const previewBlock = source.slice(previewAt, confirmAt);
  assert.ok(!previewBlock.includes("audience_contact_ids"), "preview must echo counts and drafts, never contact ids");
  assert.ok(!previewBlock.includes("applyPressCampaignProposal"), "preview must write nothing");
});

check("no real email address appears anywhere in this suite", () => {
  const source = readFileSync(new URL("./test-press-campaign.mjs", import.meta.url), "utf8");
  const addresses = source.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  assert.ok(addresses.length > 0, "the suite should exercise at least one address");
  for (const address of addresses) {
    assert.match(address, /@(example|test)\.(com|org|net)$/i, `${address} must use a reserved domain`);
  }
});

console.log(`test-press-campaign: ${checks.length} checks passed`);
