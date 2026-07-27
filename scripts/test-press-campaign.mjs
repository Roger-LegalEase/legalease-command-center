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
  pressCampaignId,
  runPressCampaign,
  stopPressCampaign
} from "./press-campaign.mjs";
import { actOutreach, planOutreach } from "./outreach-os.mjs";
import { buildFounderCampaignsView } from "./ui/view-models/founder-campaigns-view.mjs";
import { FOUNDER_CAMPAIGNS_READ_COLLECTIONS } from "./founder-campaigns-api.mjs";
import { buildCampaignDetailView } from "./campaign-detail-service.mjs";
import { campaignDetailBrowserSource, renderCampaignDetail } from "./ui/pages/campaign-detail.mjs";

const NOW = "2026-07-27T12:00:00.000Z";
const checks = [];
const pending = [];
function check(name, run) {
  const result = run();
  if (result && typeof result.then === "function") pending.push(result.then(() => checks.push(name)));
  else checks.push(name);
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
  // Fresh verification: the run approval re-runs pressEligibility, which requires it.
  press_verified_at: "2026-07-20",
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

check("a campaign forced active WITHOUT the run approval still queues nothing", () => {
  // RE-PINNED (press run path): press now maps to the press-pitch sequence, so the old
  // unmapped-classification lock is gone BY DESIGN — its replacement is the recorded run
  // approval, which a bare status flip cannot forge.
  let state = applyPressCampaignProposal(fixtureState(), buildPressCampaignProposal(fixtureState(), { now: NOW }), { now: NOW });
  const target = pressCampaignId("ai_guardrails");
  state = {
    ...state,
    outreachCampaigns: state.outreachCampaigns.map((row) => row.campaign_id === target ? { ...row, status: "active" } : row),
    outreachContacts: state.outreachContacts.map((row) =>
      row.contact_id === "press-hinted" ? { ...row, campaign_id: target } : row)
  };
  const planned = planOutreach(state, { now: new Date(NOW) });
  assert.deepEqual(planned.proposals, [], "no run approval, no queue items — a status flip is not an approval");
  assert.ok(planned.observations.some((entry) => entry.type === "press_run_not_approved"),
    "the refusal must be observed by name, not silent");
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
// 6. The run path: one approval enrolls and arms; everything downstream is the old machinery
// ---------------------------------------------------------------------------------------------

const MONDAY_IN_WINDOW = "2026-07-27T15:00:00.000Z";  // Monday 11:00 ET
const SUNDAY = "2026-07-26T15:00:00.000Z";

function proposedState() {
  return applyPressCampaignProposal(fixtureState(), buildPressCampaignProposal(fixtureState(), { now: NOW }), { now: NOW });
}

check("runPressCampaign enrolls the audience, records the approval, and bounds touches to one", () => {
  const target = pressCampaignId("nationwide_milestone");
  const run = runPressCampaign(proposedState(), { campaignId: target, actor: "owner", now: NOW });
  assert.equal(run.ok, true, `run must succeed: ${run.error}`);
  assert.ok(run.enrolled >= 1, "at least one journalist enrolls");
  const campaign = run.state.outreachCampaigns.find((row) => row.campaign_id === target);
  assert.equal(campaign.status, "active");
  assert.equal(campaign.max_touches, 1, "press pitches are one touch, never a cadence");
  assert.equal(campaign.run_approved.approved_by, "owner", "the approval is recorded with its actor");
  const enrolled = run.state.outreachContacts.filter((row) => row.campaign_id === target);
  assert.equal(enrolled.length, run.enrolled);
  for (const contact of enrolled) {
    assert.equal(contact.press_hold, false, "enrollment releases the press hold");
    assert.equal(contact.sequence_status, "Enrolled");
  }
  const untouched = run.state.outreachContacts.filter((row) => row.campaign_id !== target);
  assert.ok(untouched.every((row) => row.press_hold !== false || row.classification !== "press"),
    "contacts outside the approved campaign stay exactly as they were");
});

check("one press campaign at a time, and stop is immediate and archives the queue", () => {
  const first = runPressCampaign(proposedState(), { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  const second = runPressCampaign(first.state, { campaignId: pressCampaignId("founder_growth"), actor: "owner", now: NOW });
  assert.equal(second.ok, false, "a second campaign must be refused while one runs");
  assert.match(second.error, /one press campaign at a time/i);

  const planned = planOutreach(first.state, { now: new Date(MONDAY_IN_WINDOW) });
  assert.ok(planned.proposals.length >= 1, "the running campaign queues items");
  const stopped = stopPressCampaign(planned.state, { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.archivedQueueItems, planned.proposals.length, "every unsent queue item is archived");
  assert.equal(stopped.state.outreachCampaigns.find((row) => row.campaign_id === pressCampaignId("nationwide_milestone")).status, "stopped");
  const replanned = planOutreach(stopped.state, { now: new Date(MONDAY_IN_WINDOW) });
  assert.deepEqual(replanned.proposals, [], "a stopped campaign queues nothing ever again");
  const runAgain = runPressCampaign(stopped.state, { campaignId: pressCampaignId("founder_growth"), actor: "owner", now: NOW });
  assert.equal(runAgain.ok, true, "after a stop, the next campaign may be approved");
});

check("run-approved queue items are APPROVED by the one campaign approval, in window only", () => {
  const run = runPressCampaign(proposedState(), { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  const sunday = planOutreach(run.state, { now: new Date(SUNDAY) });
  assert.deepEqual(sunday.proposals, [], "outside the weekday window nothing queues");
  assert.ok(sunday.observations.some((entry) => entry.reason === "outside_window"), "the window refusal is observed");

  const monday = planOutreach(run.state, { now: new Date(MONDAY_IN_WINDOW) });
  assert.ok(monday.proposals.length >= 1, "in window the campaign queues");
  for (const item of monday.proposals) {
    assert.equal(item.status, "approved", "the run approval covers the campaign's queue items");
    assert.equal(item.approval_source, "press_campaign_run_approval");
    assert.equal(item.approved_by, "owner", "the queue item names who approved the run");
    assert.ok(item.message.text.includes("not a law firm"), "the assembled message carries the boundary language");
    assert.ok(item.message.headers["List-Unsubscribe"], "CAN-SPAM headers are assembled by the existing machinery");
  }
});

check("act sends once (dry-run without a live executor), then the sequence is complete", async () => {
  const run = runPressCampaign(proposedState(), { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  const planned = planOutreach(run.state, { now: new Date(MONDAY_IN_WINDOW) });
  const acted = await actOutreach(planned.state, { now: new Date(MONDAY_IN_WINDOW) });
  const sent = acted.results.filter((entry) => entry.status === "dry_run");
  assert.ok(sent.length >= 1, "without a live executor every send is a recorded dry_run, never a network call");
  const replanned = planOutreach(acted.state, { now: new Date(MONDAY_IN_WINDOW) });
  assert.deepEqual(replanned.proposals, [], "max_touches 1: after the pitch, the sequence is complete");
  assert.ok(replanned.observations.some((entry) => entry.type === "sequence_complete"), "completion is observed, not silent");
});

check("a reply stops that journalist's sequence on its own", () => {
  const run = runPressCampaign(proposedState(), { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  const enrolledId = run.state.outreachContacts.find((row) => row.campaign_id === pressCampaignId("nationwide_milestone")).contact_id;
  const replied = { ...run.state, outreachReplies: [{ id: "reply-1", contact_id: enrolledId, from_email: "", received_at: NOW }] };
  const planned = planOutreach(replied, { now: new Date(MONDAY_IN_WINDOW) });
  assert.ok(!planned.proposals.some((item) => item.contact_id === enrolledId), "a replied journalist is never queued again");
  assert.ok(planned.observations.some((entry) => entry.contact_id === enrolledId && /replied/.test(String(entry.reason))),
    "the reply suppression is observed by reason");
});

check("the shared-newsroom masthead cap holds at one per day across the campaign", () => {
  // Two shared desks on the SAME angle: only one may queue on any given day.
  const base = fixtureState();
  base.outreachContacts.push(
    pressContact("desk2", { press_email_type: "Shared newsroom", press_coverage_lanes: "black founders, startups, venture capital" }),
    // A different domain, so the per-domain cap cannot fire first and mask the masthead cap.
    pressContact("desk3", { email: "desk3@example.net", press_email_type: "Shared newsroom", press_coverage_lanes: "black founders, startups, venture capital" })
  );
  const state = applyPressCampaignProposal(base, buildPressCampaignProposal(base, { now: NOW }), { now: NOW });
  const run = runPressCampaign(state, { campaignId: pressCampaignId("founder_growth"), actor: "owner", now: NOW });
  assert.equal(run.ok, true, `run must succeed: ${run.error}`);
  const planned = planOutreach(run.state, { now: new Date(MONDAY_IN_WINDOW) });
  const sharedQueued = planned.proposals.filter((item) => ["press-desk2", "press-desk3"].includes(item.contact_id));
  assert.equal(sharedQueued.length, 1, "at most ONE shared-newsroom desk queues per day");
  assert.ok(planned.observations.some((entry) => entry.type === "shared_newsroom_cap"), "the deferral is observed");
});

check("edited step copy that trips the gate blocks the whole campaign at queue time", () => {
  const run = runPressCampaign(proposedState(), { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  const doctored = {
    ...run.state,
    outreachSequenceSteps: run.state.outreachSequenceSteps.map((step) =>
      step.campaign_id === pressCampaignId("nationwide_milestone")
        ? { ...step, body: `${step.body}\n\nWe guarantee approval and your record will be cleared.` }
        : step)
  };
  const planned = planOutreach(doctored, { now: new Date(MONDAY_IN_WINDOW) });
  assert.deepEqual(planned.proposals, [], "gated copy queues nothing");
  assert.ok(planned.observations.some((entry) => entry.type === "press_guardrail_blocked"), "the block is observed by name");
  const rerun = runPressCampaign(proposedState(), { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  assert.equal(rerun.ok, true, "clean copy still runs");
});

// ---------------------------------------------------------------------------------------------
// 7. The campaign detail surface: what Roger actually sees and clicks
// ---------------------------------------------------------------------------------------------

const OWNER = { authenticated: true, role: "owner" };

check("a PROPOSED campaign's detail shows the drafted pitch and the assigned journalists", () => {
  const state = proposedState();
  const detail = buildCampaignDetailView(state, OWNER, `outreach:${pressCampaignId("ai_guardrails")}`, { tab: "messages" });
  assert.equal(detail.available, true, "the campaign detail must resolve");
  assert.equal(detail.messages.steps.length, 1, "the drafted step is in the Messages payload");
  assert.match(detail.messages.steps[0].subject, /fail-closed guardrails/i);
  assert.match(detail.messages.steps[0].body, /not a law firm/i, "the BODY itself is in the payload, not a count");
  assert.ok(detail.audience.members.length >= 1, "the assigned journalists are in the Audience payload");
  for (const member of detail.audience.members) {
    assert.ok(member.name, "each member has a name");
    assert.ok(["assigned", "held", "enrolled", "excluded"].includes(member.status), `status ${member.status} is explained`);
  }
  assert.match(detail.audience.summary, /assigned journalist/i, "the summary says assigned-and-held, not '0 enrolled'");
  assert.equal(detail.capabilities.press_run, true, "the owner is offered the one run approval");
  assert.equal(detail.capabilities.press_stop, false, "stop is not offered before run");
});

check("after the run approval the detail flips to running with an immediate stop", () => {
  const target = pressCampaignId("ai_guardrails");
  const run = runPressCampaign(proposedState(), { campaignId: target, actor: "owner", now: NOW });
  const detail = buildCampaignDetailView(run.state, OWNER, `outreach:${target}`, { tab: "audience" });
  assert.equal(detail.capabilities.press_run, false, "run is a one-time approval");
  assert.equal(detail.capabilities.press_stop, true, "stop is offered immediately");
  assert.ok(detail.audience.members.some((member) => member.status === "enrolled"), "enrolled journalists read as enrolled");
});

check("a viewer is never offered the run approval", () => {
  const detail = buildCampaignDetailView(proposedState(), { authenticated: true, role: "viewer" }, `outreach:${pressCampaignId("ai_guardrails")}`, {});
  if (detail.available) {
    assert.equal(detail.capabilities.press_run, false, "run is owner/admin only");
    assert.equal(detail.capabilities.press_stop, false, "stop is owner/admin only");
  }
});

check("the rendered page carries the pitch body, the roster and the run button", () => {
  const state = proposedState();
  const messagesView = { ...buildCampaignDetailView(state, OWNER, `outreach:${pressCampaignId("ai_guardrails")}`, { tab: "messages" }), advancedDelivery: null, repliesOutcomes: null };
  const messagesHtml = renderCampaignDetail(messagesView);
  assert.ok(messagesHtml.includes("campaign-detail-message-body"), "Messages renders the body block");
  assert.ok(messagesHtml.includes("not a law firm"), "the pitch copy is readable on the page");
  assert.ok(messagesHtml.includes('data-campaign-action="press_run"'), "the one approve action is on the page");

  const audienceView = { ...buildCampaignDetailView(state, OWNER, `outreach:${pressCampaignId("ai_guardrails")}`, { tab: "audience" }), advancedDelivery: null, repliesOutcomes: null };
  const audienceHtml = renderCampaignDetail(audienceView);
  assert.ok(audienceHtml.includes("campaign-detail-audience"), "Audience renders the roster");

  const runtime = campaignDetailBrowserSource();
  for (const marker of ["campaign-detail-message-body", "campaign-detail-audience", "press_run", "press_stop", "window.confirm"]) {
    assert.ok(runtime.includes(marker), `the browser runtime must carry ${marker}`);
  }
});

check("the Campaigns lane links each proposed campaign, and a running one reads as running", () => {
  const proposed = buildFounderCampaignsView(proposedState(), { pressEnabled: true });
  const run = proposed.lanes.find((lane) => lane.id === "press").stages.find((stage) => stage.id === "run");
  assert.ok(run.detail.proposedCampaigns.every((entry) => entry.href.startsWith("#outreach/campaign/")),
    "every proposal links to its campaign detail page");

  const active = runPressCampaign(proposedState(), { campaignId: pressCampaignId("nationwide_milestone"), actor: "owner", now: NOW });
  const runningView = buildFounderCampaignsView(active.state, { pressEnabled: true });
  const runningStage = runningView.lanes.find((lane) => lane.id === "press").stages.find((stage) => stage.id === "run");
  assert.equal(runningStage.state, "running", "an approved campaign reads as running");
  assert.ok(runningStage.detail.runningCampaign.href.startsWith("#outreach/campaign/"), "the running campaign is clickable");
});

// ---------------------------------------------------------------------------------------------
// 8. No send path, wired endpoints, no real addresses
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

await Promise.all(pending);
console.log(`test-press-campaign: ${checks.length} checks passed`);
