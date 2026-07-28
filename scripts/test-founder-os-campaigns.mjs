// Founder OS Release 4 — the Campaigns workspace.
//
// Reactivation is LIVE IN PRODUCTION with waves 1 and 2 sending. The single most important
// thing this suite proves is therefore not a feature but an absence: **the projection cannot
// change the campaign.** Everything else follows from that.
//
// What is proven here:
//   1. The projection is read-only — state is byte-identical after building it, no lane can
//      publish or send, and the safety contract reports zeros.
//   2. One lifecycle, the same five words in charter order, in every lane.
//   3. The translation table matches the charter verbatim, and no engine jargon reaches the
//      surface.
//   4. Blocked reasons come from the real decision functions, including the case that matters
//      most: the Run switch being on while sending is still off.
//   5. The Press lane reports NOT BUILT, never a fake zero.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FOUNDER_OS_CAMPAIGNS_ENV_KEY,
  FOUNDER_OS_CAMPAIGN_FORBIDDEN_TERMS,
  FOUNDER_OS_CAMPAIGN_LANES,
  FOUNDER_OS_CAMPAIGN_LIFECYCLE,
  FOUNDER_OS_CAMPAIGN_TRANSLATIONS,
  FOUNDER_OS_PRESS_ENV_KEY,
  readFounderOsCampaignsConfig,
  readFounderOsPressConfig
} from "./ui/founder-os-config.mjs";
import { buildFounderCampaignsView } from "./ui/view-models/founder-campaigns-view.mjs";
// The destination's own projection: the card count is asserted against what the ranked list
// will actually show, not against a second copy of the rule.
import { selectPendingProspects } from "./prospect-selection.mjs";

const NOW = new Date("2026-07-27T14:00:00.000Z"); // a Monday, 10:00 Eastern — inside the window
const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}
const laneById = (view, id) => {
  const lane = view.lanes.find((entry) => entry.id === id);
  assert.ok(lane, `lane ${id} must be projected`);
  return lane;
};
const stageById = (lane, id) => {
  const stage = lane.stages.find((entry) => entry.id === id);
  assert.ok(stage, `lane ${lane.id} must have a ${id} stage`);
  return stage;
};

// ---------------------------------------------------------------------------------------------
// The flags
// ---------------------------------------------------------------------------------------------

check("both Release 4 flags are off unless the environment says exactly true", () => {
  for (const [key, read] of [
    [FOUNDER_OS_CAMPAIGNS_ENV_KEY, readFounderOsCampaignsConfig],
    [FOUNDER_OS_PRESS_ENV_KEY, readFounderOsPressConfig]
  ]) {
    assert.equal(read({}).enabled, false);
    assert.equal(read({ [key]:"" }).enabled, false);
    assert.equal(read({ [key]:"1" }).enabled, false);
    assert.equal(read({ [key]:"TRUE" }).enabled, false);
    assert.equal(read({ [key]:"true" }).enabled, true);
  }
});

// ---------------------------------------------------------------------------------------------
// The charter contract: five words, four lanes, one translation table
// ---------------------------------------------------------------------------------------------

check("the lifecycle is exactly the charter's five words, in charter order", () => {
  assert.deepEqual(FOUNDER_OS_CAMPAIGN_LIFECYCLE.map((entry) => entry.label),
    ["Plan", "Review", "Run", "Monitor", "Stop"]);
});

check("the four lanes are the charter's four, and only press is unbuilt", () => {
  assert.deepEqual(FOUNDER_OS_CAMPAIGN_LANES.map((entry) => entry.label),
    ["Social", "Reactivation", "Partner outreach", "Press outreach"]);
  assert.deepEqual(FOUNDER_OS_CAMPAIGN_LANES.filter((entry) => !entry.built).map((entry) => entry.id), ["press"]);
});

check("the translation table matches docs/founder-os/workspaces/campaigns.md verbatim", () => {
  // Parsed out of the charter rather than retyped, so the table cannot drift from the document
  // that defines it. If the charter changes, this fails and the code must follow.
  const charter = readFileSync(new URL("../docs/founder-os/workspaces/campaigns.md", import.meta.url), "utf8");
  const rows = charter.split("\n")
    .filter((line) => /^\|/.test(line) && !/^\|\s*-+/.test(line) && !/Internal mechanism/.test(line))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length === 2);
  assert.equal(rows.length, 8, `the charter defines 8 translations, found ${rows.length}`);
  assert.deepEqual(
    FOUNDER_OS_CAMPAIGN_TRANSLATIONS.map((entry) => [entry.internal, entry.founder]),
    rows,
    "the translation table must match the charter exactly"
  );
});

check("every lane carries all five stages, in the same order, with no lane-specific jargon", () => {
  const view = buildFounderCampaignsView(baseState(), { env:{}, now:NOW });
  assert.equal(view.lanes.length, 4);
  for (const lane of view.lanes) {
    assert.deepEqual(lane.stages.map((entry) => entry.id), ["plan", "review", "run", "monitor", "stop"],
      `lane ${lane.id} must use the shared lifecycle`);
    assert.deepEqual(lane.stages.map((entry) => entry.label), ["Plan", "Review", "Run", "Monitor", "Stop"]);
  }
});

check("no engine vocabulary reaches the founder surface", () => {
  // The whole rendered payload, flattened. A term leaking into any summary, action label or
  // blocked reason fails here — this is the mechanical form of "Roger never sees engine IDs".
  const view = buildFounderCampaignsView(runningState(), { env:{ SENDGRID_API_KEY:"synthetic" }, now:NOW });
  const surface = view.lanes.flatMap((lane) => [
    lane.label, lane.unavailableReason,
    ...lane.stages.flatMap((entry) => [entry.summary, entry.blockedReason, entry.action?.label]),
    ...lane.exceptions.flatMap((entry) => [entry.summary, entry.detail, entry.action?.label])
  ]).filter(Boolean).join(" \n ").toLowerCase();
  for (const term of FOUNDER_OS_CAMPAIGN_FORBIDDEN_TERMS) {
    assert.ok(!surface.includes(term.toLowerCase()),
      `the founder surface must not contain "${term}"; found it in: ${surface.slice(0, 400)}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

function baseState(overrides = {}) {
  return {
    posts:[
      { id:"post-1", status:"draft", targetChannels:["linkedin"] },
      { id:"post-2", status:"needs_review", targetChannels:["linkedin"] },
      { id:"post-3", status:"approved", targetChannels:["instagram"] },
      { id:"post-4", status:"published", targetChannels:["linkedin"] }
    ],
    reactivationContacts:[],
    reactivationAttempts:[],
    reactivationEvents:[],
    prospectCandidates:[
      { id:"cand-1", review_state:"pending_review", organization_name:"Alpha Legal Aid" },
      { id:"cand-2", review_state:"approved", organization_name:"Beta Reentry" }
    ],
    outreachContacts:[],
    outreachReplies:[],
    outreachSuppressions:[],
    outreachUnsubscribes:[],
    approvalQueue:[],
    ...overrides
  };
}

// A campaign that is switched on, with a released wave and contacts enrolled.
function runningState() {
  return baseState({
    reactivationCampaign:{
      campaignId:"mvp-reactivation",
      status:"active",
      // liveMode is an object, not a boolean (reactivation-os.mjs:78-86), and the engine id is
      // "reactivation-sequencer" (reactivation-os.mjs:45). Getting either wrong makes a fixture
      // that silently reports "not running" and proves nothing.
      liveMode:{ enabled:true, updatedAt:"2026-07-20T12:00:00.000Z", updatedBy:"owner" },
      releasedWaves:[1, 2]
    },
    autopilotSettings:{ "reactivation-sequencer":{ enabled:true } },
    reactivationContacts:[
      { contact_id:"react-1", email:"one@example.org", wave:1, enrolled_at:"2026-07-20T12:00:00.000Z", sequence_status:"Enrolled" },
      { contact_id:"react-2", email:"two@example.org", wave:3, sequence_status:"Not Enrolled" }
    ]
  });
}

// ---------------------------------------------------------------------------------------------
// 1. The projection cannot change the campaign
// ---------------------------------------------------------------------------------------------

check("building the projection does not mutate state — the live campaign is untouched", () => {
  const state = runningState();
  const before = JSON.stringify(state);
  buildFounderCampaignsView(state, { env:{ SENDGRID_API_KEY:"synthetic" }, now:NOW });
  buildFounderCampaignsView(state, { env:{}, now:NOW });
  assert.equal(JSON.stringify(state), before,
    "Release 4 changes the interface over the campaign, never the campaign");
});

check("the safety contract reports zero mutations, zero external actions, zero publish affordances", () => {
  const view = buildFounderCampaignsView(runningState(), { env:{}, now:NOW });
  assert.deepEqual(view.safety, {
    fullStateReturned:false, mutations:0, externalActions:0, publishAffordances:0
  });
});

check("no stage on any lane offers a publish or send action", () => {
  const view = buildFounderCampaignsView(runningState(), { env:{ SENDGRID_API_KEY:"synthetic" }, now:NOW });
  for (const lane of view.lanes) {
    for (const entry of lane.stages) {
      const route = String(entry.action?.route || "");
      assert.ok(!/publish-now|\/publish\b/.test(route),
        `lane ${lane.id} stage ${entry.id} must not offer a publish route, got ${route}`);
      assert.ok(!/\/send\b/.test(route),
        `lane ${lane.id} stage ${entry.id} must not offer a send route, got ${route}`);
    }
  }
});

check("the Social lane exposes no publish affordance at all — manual posting is the product", () => {
  const social = laneById(buildFounderCampaignsView(baseState(), { env:{}, now:NOW }), "social");
  const labels = social.stages.map((entry) => entry.action?.label).filter(Boolean).join(" ").toLowerCase();
  assert.ok(!labels.includes("publish now"), "no Publish Now affordance may be inherited");
  // Its Run stage is a person posting by hand, and it says so.
  assert.match(stageById(social, "run").action.label, /copy or export/i);
  assert.match(stageById(social, "stop").summary, /posting is manual/i);
});

check("every mutating route the projection reports is one that already exists", () => {
  // Release 4 adds no route of its own. Each mutating route named here must be a route the
  // repository already serves, so the surface can only ever drive machinery that predates it.
  const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const social = readFileSync(new URL("./social-weekly-planner-api.mjs", import.meta.url), "utf8");
  const sources = `${server}\n${social}`;
  const view = buildFounderCampaignsView(runningState(), { env:{ SENDGRID_API_KEY:"synthetic" }, now:NOW });
  const mutating = view.lanes.flatMap((lane) => lane.stages)
    .filter((entry) => entry.action?.mutates === true)
    .map((entry) => entry.action.route);
  assert.ok(mutating.length > 0, "the fixture must exercise at least one mutating control");
  for (const route of mutating) {
    // Compare on the path, ignoring the method and any :param segment.
    const path = route.replace(/^[A-Z]+\s+/, "").split("/:")[0];
    assert.ok(sources.includes(path), `${route} must already be served; ${path} was not found in the server`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. Blocked reasons come from the real decision functions
// ---------------------------------------------------------------------------------------------

check("Run reports the switch and whether anything can actually send, as two separate truths", () => {
  // Switch on, but no provider key: sending cannot happen. The surface must NOT claim running.
  const armed = laneById(buildFounderCampaignsView(runningState(), { env:{}, now:NOW }), "reactivation");
  const armedRun = stageById(armed, "run");
  assert.equal(armedRun.state, "stopped", "with sending off the Run stage is not 'running'");
  assert.match(armedRun.summary, /nothing is sending/i);
  assert.ok(armedRun.blockedReason, "the founder must be told why nothing is sending");
  assert.match(armedRun.blockedReason, /nobody receives an email/i);
  // The one control opens the existing sending controls. It never runs or stops anything
  // itself: a button on this surface that could send would give it the write path the release
  // is defined by not having.
  assert.equal(armedRun.action.label, "Open sending controls");
  assert.equal(armedRun.action.kind, "control");
  assert.equal(armedRun.action.mutates, false);

  // Switch on AND provider key present: genuinely running.
  const live = laneById(buildFounderCampaignsView(runningState(), { env:{ SENDGRID_API_KEY:"synthetic" }, now:NOW }), "reactivation");
  assert.equal(stageById(live, "run").state, "running");
  assert.equal(stageById(live, "run").summary, "Campaign running.");
});

check("outside the window, Run and Monitor tell ONE story about who is queued", () => {
  // The 2026-07-26 production contradiction: Run said people were "queued and eligible when the
  // window opens" while Monitor said "0 people are eligible in the next window". Cause: outside
  // the send window the planner reports the due count via an `outside_window` observation and
  // `dueNow` reads 0, and Monitor was reading `dueNow` under a sentence that promises "the next
  // window". Monitor must read `dueEligible`, which is that number inside AND outside the window.
  const sunday = new Date("2026-07-26T14:00:00.000Z"); // a Sunday — outside weekdays-only window
  const lane = laneById(
    buildFounderCampaignsView(runningState(), { env:{ SENDGRID_API_KEY:"synthetic" }, now:sunday }),
    "reactivation");
  const run = stageById(lane, "run");
  const monitor = stageById(lane, "monitor");
  // The fixture's react-1 is enrolled with no touches recorded, so exactly one person is due.
  assert.match(monitor.summary, /^1 person is eligible in the next window\./,
    "Monitor must report the queued person, not 0, when the window is merely closed");
  assert.match(run.blockedReason, /outside the weekday/i);
  assert.match(run.blockedReason, /1 person is queued and eligible when the window opens/i,
    "Run keeps explaining the closed window and the queue behind it");
  // The agreement itself: both surfaces carry the same count.
  const count = (text) => Number((text.match(/(\d+) (?:person|people)/) || [])[1]);
  assert.equal(count(monitor.summary), count(run.blockedReason),
    "Run and Monitor may not disagree about the same queue");
});

check("a stopped campaign reports stopped, and Stop stays available", () => {
  const state = runningState();
  state.reactivationCampaign.liveMode = false;
  const lane = laneById(buildFounderCampaignsView(state, { env:{}, now:NOW }), "reactivation");
  assert.equal(stageById(lane, "run").action.label, "Open sending controls");
  assert.equal(stageById(lane, "stop").state, "stopped");
  assert.match(stageById(lane, "stop").summary, /already stopped/i);
});

check("a released audience reads as approved and active, and a held one as awaiting approval", () => {
  const lane = laneById(buildFounderCampaignsView(runningState(), { env:{ SENDGRID_API_KEY:"synthetic" }, now:NOW }), "reactivation");
  // "released wave" -> "Audience approved and active".
  assert.match(stageById(lane, "plan").summary, /2 audiences approved and active/i);
  // Wave 3 has an unenrolled contact, so it is the next audience awaiting approval.
  assert.equal(stageById(lane, "review").state, "attention");
  assert.match(stageById(lane, "review").summary, /ready for your approval/i);
  assert.equal(stageById(lane, "review").action.route, "POST /api/campaign/wave-release/propose");
});

check("an unreadable lane says so instead of showing zeros", () => {
  // No posts array at all: the Social lane cannot be read.
  const view = buildFounderCampaignsView({ prospectCandidates:[] }, { env:{}, now:NOW });
  const social = laneById(view, "social");
  assert.equal(social.available, false);
  assert.match(social.unavailableReason, /could not be read/i);
  for (const entry of social.stages) assert.equal(entry.state, "unavailable");
});

// ---------------------------------------------------------------------------------------------
// 3. Partner outreach — approval is a human act
// ---------------------------------------------------------------------------------------------

check("Partner outreach reports what needs approval before anything goes out", () => {
  const lane = laneById(buildFounderCampaignsView(baseState(), { env:{}, now:NOW }), "partner_outreach");
  assert.equal(stageById(lane, "review").state, "attention");
  assert.match(stageById(lane, "review").summary, /your approval before anything goes out/i);
  assert.equal(stageById(lane, "review").action.route, "POST /api/prospects/approve");
  // The button says what it does and goes where the records are.
  assert.equal(stageById(lane, "review").action.label, "Review approvals");
  assert.equal(stageById(lane, "review").action.kind, "link");
  assert.equal(stageById(lane, "review").action.href, "#prospects");
  // "suppression" -> "Not eligible to contact".
  assert.match(stageById(lane, "monitor").summary, /not eligible to contact/i);
  assert.match(stageById(lane, "stop").summary, /a reply stops that sequence immediately/i);
});

// ---------------------------------------------------------------------------------------------
// The approval count. It was `pending prospects + EVERY queued approvalQueue row`, with the
// queued half never filtered by campaign type — so a social or review-desk approval inflated a
// number labelled "partner outreach", and half of what it counted had no interface at all.
// ---------------------------------------------------------------------------------------------

const countOf = (text) => Number((String(text).match(/^(\d+) organisation/) || [])[1]);

check("the approval count equals the records the ranked list will show, and nothing else", () => {
  const state = baseState({
    prospectCandidates:[
      { id:"c1", review_state:"pending_review" },
      { id:"c2", review_state:"pending_review" },
      { id:"c3", review_state:"approved" },
      { id:"c4", review_state:"rejected" }
    ],
    approvalQueue:[
      // Not partner outreach at all: a review-desk item with no campaign type. It used to be
      // counted purely because its status was queued.
      { id:"q1", type:"content_review", status:"queued_for_approval", title:"A post needs review" },
      // Partner outreach, correctly discriminated — but no reviewed workflow can show it.
      { id:"q2", type:"outreach_message", status:"queued_for_approval", to:"a@example.org" },
      // Press, which belongs to the press lane and never to this one.
      { id:"q3", type:"outreach_message", lane:"press", status:"queued_for_approval" },
      // Already approved: not waiting for anything.
      { id:"q4", type:"outreach_message", status:"approved" }
    ]
  });
  const review = stageById(laneById(buildFounderCampaignsView(state, { env:{}, now:NOW }), "partner_outreach"), "review");
  // The destination selects exactly `review_state === "pending_review"`
  // (prospect-selection.mjs pendingTotal). Two of the four candidates qualify.
  const pendingTotal = selectPendingProspects(state, {}).pendingTotal;
  assert.equal(pendingTotal, 2, "the fixture must have two reviewable records");
  assert.equal(countOf(review.summary), pendingTotal,
    "the number on the card must equal the number of records the destination shows");
  // The one genuinely partner-outreach queued message is reported in words, never folded in.
  assert.match(review.summary, /1 drafted partner email is also waiting/i);
  assert.match(review.summary, /no way to review it here yet/i);
  assert.ok(!review.summary.includes("3 organisation"), "unclassifiable rows may not inflate the count");
});

check("an unreadable ranked list says so instead of reporting zero waiting for approval", () => {
  const state = baseState();
  delete state.prospectCandidates;
  const lane = laneById(buildFounderCampaignsView(state, { env:{}, now:NOW }), "partner_outreach");
  const review = stageById(lane, "review");
  assert.equal(review.state, "unavailable");
  assert.match(review.summary, /could not be read/i);
  assert.ok(!/\b0\b/.test(review.summary), "missing data must never be shown as a zero");
  assert.equal(review.action, null, "there is no review to offer when the list cannot be read");
});

check("with nothing approved, Partner outreach says nothing can be contacted", () => {
  const state = baseState();
  state.prospectCandidates = [{ id:"cand-1", review_state:"pending_review" }];
  const lane = laneById(buildFounderCampaignsView(state, { env:{}, now:NOW }), "partner_outreach");
  assert.equal(stageById(lane, "run").state, "stopped");
  assert.match(stageById(lane, "run").summary, /nothing can be contacted/i);
});

// ---------------------------------------------------------------------------------------------
// 4. Press — honestly not built
// ---------------------------------------------------------------------------------------------

check("the Press lane reports NOT BUILT on every stage, never a zero", () => {
  const press = laneById(buildFounderCampaignsView(baseState(), { env:{}, now:NOW }), "press");
  assert.equal(press.built, false);
  assert.equal(press.available, false);
  assert.match(press.unavailableReason, /not built yet/i);
  assert.match(press.unavailableReason, /nothing can be sent/i);
  for (const entry of press.stages) {
    assert.equal(entry.state, "not_built", "a not-built lane must not report a readable state");
    assert.match(entry.summary, /not built yet/i);
    assert.equal(entry.action, null, "a lane that does not exist offers no actions");
  }
});

check("turning the press sub-flag on does not fabricate a press campaign", () => {
  // The flag exists so the lane has one switch, but nothing is behind it yet. Enabling it must
  // not turn the honest not-built state into a real-looking empty campaign.
  assert.equal(readFounderOsPressConfig({ [FOUNDER_OS_PRESS_ENV_KEY]:"true" }).enabled, true);
  const press = laneById(buildFounderCampaignsView(baseState(), { env:{ FOUNDER_OS_PRESS:"true" }, now:NOW }), "press");
  assert.equal(press.built, false);
  for (const entry of press.stages) assert.equal(entry.state, "not_built");
});

// ---------------------------------------------------------------------------------------------
// 5. Exceptions reach Today
// ---------------------------------------------------------------------------------------------

check("a tripped safety limit becomes an exception in plain language", () => {
  const state = runningState();
  // The rate is over DISTINCT PEOPLE, not events (reactivation-os.mjs:412-418) — sixty events
  // sharing one contact_id count as one bounce, which is the correct design and the reason an
  // earlier version of this fixture never tripped anything. Thirty distinct people out of two
  // hundred sends is 15%, far above every threshold.
  state.reactivationAttempts = Array.from({ length:200 }, (_, index) => ({
    id:`attempt-${index}`, contact_id:`react-${index}`, status:"sent", created_at:"2026-07-25T12:00:00.000Z"
  }));
  state.reactivationEvents = Array.from({ length:30 }, (_, index) => ({
    id:`event-${index}`, contact_id:`react-${index}`, email:`bounced-${index}@example.org`,
    type:"bounce", created_at:"2026-07-25T12:30:00.000Z"
  }));

  const view = buildFounderCampaignsView(state, { env:{ SENDGRID_API_KEY:"synthetic" }, now:NOW });
  const lane = laneById(view, "reactivation");
  const tripped = lane.exceptions.find((entry) => entry.id === "reactivation-safety-limit");
  assert.ok(tripped, "a 15% hard-bounce rate over 200 sends must trip a safety limit");
  // "threshold trip" -> "Campaign stopped for safety".
  assert.equal(tripped.summary, "Campaign stopped for safety.");
  assert.equal(tripped.severity, "blocked");
  assert.ok(tripped.detail, "the founder must be told which limit was reached");
  assert.ok(view.exceptions.some((entry) => entry.id === tripped.id),
    "a lane exception must also appear in the view-level list Today reads");
  assert.equal(stageById(lane, "monitor").state, "blocked");
  // A tripped limit outranks every other reason on the Run stage.
  assert.equal(stageById(lane, "run").blockedReason, tripped.detail);
  // And the plain wording must not leak the raw threshold key.
  assert.ok(!/threshold_tripped|hard_bounce/.test(tripped.detail),
    `the reason must be translated, got: ${tripped.detail}`);
});

console.log(`Founder OS Release 4 campaigns: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
