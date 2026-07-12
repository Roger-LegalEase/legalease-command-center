#!/usr/bin/env node
// Phase 18E guard: the campaign brain stays honest and sendless. Outreach lanes never leak
// message bodies or unsubscribe links; release-from-hold never enrolls, never reshuffles
// existing waves, and refuses suppressed people; deliverability warns BEFORE the trip and
// stays quiet below the sample size.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOutreachLaneView, previewHeldRelease, confirmHeldRelease,
  buildDeliverabilityWarnings, deliverabilityUtilization,
  DELIVERABILITY_WARNING_THRESHOLD, HELD_RELEASE_READY_STATUS, OUTREACH_LANES
} from "./campaign-brain.mjs";
import { projectCompanyMemory } from "./company-memory-projector.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = "2026-07-04T18:00:00.000Z";
const nowFn = () => NOW;

// ---- fixtures --------------------------------------------------------------------------------

function outreachItem(overrides = {}) {
  return {
    id: `outreach-q-${overrides.id || "1"}`,
    type: "outreach_message",
    status: "queued_for_approval",
    contact_id: "oc-1",
    campaign_id: "camp-1",
    step_number: 1,
    classification: "legal_aid",
    to: "director@legalaidexample.org",
    subject: "Verified reporting for reentry programs",
    title: "Outreach email 1 to director@legalaidexample.org",
    created_at: NOW,
    message: {
      subject: "Verified reporting for reentry programs",
      html: "<p>Hello</p><a href=\"https://legalease-command-center-prod.onrender.com/api/outreach/unsubscribe?token=SECRET-TOKEN\">Unsubscribe</a>",
      unsubscribeUrl: "https://legalease-command-center-prod.onrender.com/api/outreach/unsubscribe?token=SECRET-TOKEN"
    },
    ...overrides
  };
}

function heldContact(id, overrides = {}) {
  return {
    contact_id: id,
    email: `${id}@example.com`,
    first_name: id,
    campaign_hold: true,
    campaign_hold_reason: "consumer_upload_review",
    review_status: HELD_RELEASE_READY_STATUS,
    wave: null,
    ...overrides
  };
}

const CAMPAIGN_TWO_WAVES = { waves: [{ wave: 1, plannedSize: 100 }, { wave: 2, plannedSize: null }], releasedWaves: [1] };

function attempts(n, contactId = "c-sent") {
  return Array.from({ length: n }, (_, i) => ({ id: `a-${contactId}-${i}`, status: "sent", contact_id: contactId, to: `${contactId}@gmail.com` }));
}
// Healthy webhook telemetry, so deliverability tests exercise only the metric under test
// (sends with NO webhook feedback correctly raise their own telemetry warning).
const HEALTHY_TELEMETRY = { last_received_at: NOW, last_ok_at: NOW, total_batches: 2, total_events: 60, total_recorded: 60 };
function events(n, type, contactId = "c-sent") {
  // Each event gets its own identity: the threshold monitor counts DISTINCT people, so n events
  // here mean "n complainants/bouncers/unsubscribers", matching every caller's intent.
  return Array.from({ length: n }, (_, i) => ({ id: `e-${type}-${i}`, type, contact_id: i === 0 ? contactId : `${contactId}-${i}` }));
}

// ---- outreach lane view ------------------------------------------------------------------------

check("outreach lanes group by status with the four honest lanes", () => {
  const state = {
    approvalQueue: [
      outreachItem({ id: "1" }),
      outreachItem({ id: "2", status: "approved", approved_at: NOW }),
      outreachItem({ id: "3", status: "sent", sent_at: NOW }),
      outreachItem({ id: "4", status: "rejected", reject_reason: "suppressed: unsubscribed" }),
      { id: "not-outreach", type: "social_post", status: "queued_for_approval" }
    ],
    outreachAttempts: [{ id: "at-1", status: "dry_run" }, { id: "at-2", status: "sent" }],
    outreachSuppressions: [{ id: "s-1" }]
  };
  const view = buildOutreachLaneView(state, { env: {} });
  assert.equal(view.lanes.length, OUTREACH_LANES.length);
  assert.deepEqual(view.lanes.map((l) => l.count), [1, 1, 1, 1]);
  assert.equal(view.totals.dryRunAttempts, 1);
  assert.equal(view.totals.sentAttempts, 1);
  assert.equal(view.totals.suppressions, 1);
  assert.equal(view.gates.sendingOn, false);
  assert.match(view.plain, /off/i);
});

check("outreach lanes never leak message bodies, unsubscribe links, or env-var names", () => {
  const state = { approvalQueue: [outreachItem({})] };
  const serialized = JSON.stringify(buildOutreachLaneView(state, { env: { SENDGRID_API_KEY: "sk-secret" } }));
  assert(!serialized.includes("SECRET-TOKEN"), "no signed unsubscribe token");
  assert(!/unsubscribe/i.test(serialized), "no unsubscribe link at all");
  assert(!/https?:\/\//i.test(serialized), "no URLs in the lane view");
  assert(!serialized.includes("<p>"), "no message html");
  assert(!serialized.includes("SENDGRID_API_KEY") && !serialized.includes("OUTREACH_LIVE_SEND"), "no secret env-var names");
  assert(serialized.includes("d***@legalaidexample.org"), "recipient is masked");
});

// ---- held-for-review preview + confirm ---------------------------------------------------------

function heldState() {
  return {
    reactivationCampaign: CAMPAIGN_TWO_WAVES,
    reactivationContacts: [
      heldContact("h1"),
      heldContact("h2", { review_status: "keep_held" }),
      heldContact("h3", { do_not_contact: true }),
      heldContact("h4", { enrolled_at: NOW }),
      { contact_id: "e1", email: "e1@example.com", wave: 1, enrolled_at: NOW, sequence_status: "Enrolled" }
    ]
  };
}

check("preview lists only approved-for-later, unsuppressed, unenrolled contacts as releasable", () => {
  const preview = previewHeldRelease(heldState());
  assert.equal(preview.writesState, false);
  assert.equal(preview.counts.held, 4);
  assert.equal(preview.counts.releasable, 1);
  assert.deepEqual(preview.rows.map((r) => r.contact_id), ["h1"]);
  assert.equal(preview.targetWave, 2, "lowest unreleased wave");
  const blockedIds = preview.blockedRows.map((r) => r.contact_id).sort();
  assert.deepEqual(blockedIds, ["h3", "h4"], "approved-for-later but suppressed/enrolled are shown blocked");
  assert(!JSON.stringify(preview).includes("h1@example.com"), "emails are masked");
  assert.match(preview.whatConfirmDoesNot, /does not enroll/i);
});

check("confirm releases into the next unreleased wave without touching enrollment", () => {
  const result = confirmHeldRelease(heldState(), { contactIds: ["h1"], actor: "roger", now: nowFn });
  assert.equal(result.ok, true);
  assert.equal(result.noSend, true);
  assert.equal(result.wave, 2);
  const h1 = result.state.reactivationContacts.find((c) => c.contact_id === "h1");
  assert.equal(h1.campaign_hold, false);
  assert.equal(h1.wave, 2);
  assert.equal(h1.released_from_hold_by, "roger");
  assert.equal(h1.enrolled_at, undefined, "never enrolls");
  assert.equal(h1.sequence_status, undefined, "never touches sequence status");
  assert.match(result.plain, /sending stays off/i);
});

check("confirm never reshuffles existing contacts across waves", () => {
  const result = confirmHeldRelease(heldState(), { contactIds: ["h1"], now: nowFn });
  const e1 = result.state.reactivationContacts.find((c) => c.contact_id === "e1");
  assert.equal(e1.wave, 1, "enrolled contact keeps its wave");
  assert.equal(e1.enrolled_at, NOW);
  const h2 = result.state.reactivationContacts.find((c) => c.contact_id === "h2");
  assert.equal(h2.campaign_hold, true, "other held contacts stay held");
});

check("confirm is all-or-nothing and refuses suppressed, enrolled, unapproved, and unknown ids", () => {
  const state = heldState();
  for (const [ids, reasonPattern] of [
    [["h1", "h2"], /review status/],
    [["h1", "h3"], /suppressed/],
    [["h1", "h4"], /enrolled/],
    [["h1", "nope"], /not_found/],
    [["e1"], /not_held/]
  ]) {
    const result = confirmHeldRelease(state, { contactIds: ids, now: nowFn });
    assert.equal(result.ok, false, `refuses ${ids.join(",")}`);
    assert(result.rejected.some((r) => reasonPattern.test(r.reason)), `reason matches ${reasonPattern}`);
    const h1 = state.reactivationContacts.find((c) => c.contact_id === "h1");
    assert.equal(h1.campaign_hold, true, "nothing changed on refusal");
  }
  assert.equal(confirmHeldRelease(state, { contactIds: [], now: nowFn }).ok, false);
});

check("confirm refuses when every wave is already released", () => {
  const state = { ...heldState(), reactivationCampaign: { ...CAMPAIGN_TWO_WAVES, releasedWaves: [1, 2] } };
  const result = confirmHeldRelease(state, { contactIds: ["h1"], now: nowFn });
  assert.equal(result.ok, false);
  assert.match(result.error, /already released/i);
  const preview = previewHeldRelease(state);
  assert.equal(preview.targetWave, null);
  assert.match(preview.whatConfirmDoes, /nothing right now/i);
});

// ---- deliverability warnings -------------------------------------------------------------------

check("deliverability is quiet with no sends and honest below the sample size", () => {
  const quiet = buildDeliverabilityWarnings({}, { env: {} });
  assert.equal(quiet.level, "quiet");
  assert.equal(quiet.warnings.length, 0);
  // 50 sends and a terrible unsub rate, but below the 100-send sample: limits are not armed.
  const below = buildDeliverabilityWarnings({
    reactivationAttempts: attempts(50),
    reactivationEvents: events(5, "unsubscribe"),
    sendgridWebhookHealth: HEALTHY_TELEMETRY
  }, { env: {} });
  assert.equal(below.belowSample, true);
  assert(!below.warnings.some((w) => /auto-pause limit/.test(w.plain)), "no approaching warning below sample");
  assert.match(below.plain, /arm after/i);
});

check("deliverability warns before the trip at 60% of a limit", () => {
  // 100 sent, 2 unsubscribes = 2% against the 2.5% limit = 80% of the way. Not tripped.
  const view = buildDeliverabilityWarnings({
    reactivationAttempts: attempts(100),
    reactivationEvents: events(2, "unsubscribe"),
    sendgridWebhookHealth: HEALTHY_TELEMETRY
  }, { env: {} });
  assert.equal(view.level, "warning");
  assert.equal(view.belowSample, false);
  assert(view.utilization >= DELIVERABILITY_WARNING_THRESHOLD);
  const warning = view.warnings.find((w) => /auto-pause limit/.test(w.plain));
  assert(warning, "approaching warning present");
  assert.equal(warning.severity, "warning");
  assert.match(warning.plain, /unsubscribes are 80% of the way/i);
});

check("deliverability goes critical when a limit trips", () => {
  const view = buildDeliverabilityWarnings({
    reactivationAttempts: attempts(100),
    reactivationEvents: events(2, "bounce"),
    sendgridWebhookHealth: HEALTHY_TELEMETRY
  }, { env: {} });
  assert.equal(view.level, "critical");
  assert.match(view.warnings[0].plain, /safety limit tripped/i);
  assert.match(view.warnings[0].plain, /hard bounces at/i, "machine tokens are translated");
});

check("a single bad wave warns even when the campaign-wide average looks fine", () => {
  const state = {
    reactivationContacts: [{ contact_id: "w1c", email: "w1c@gmail.com", wave: 1 }],
    reactivationAttempts: attempts(30, "w1c"),
    reactivationEvents: events(1, "bounce", "w1c"),
    sendgridWebhookHealth: HEALTHY_TELEMETRY
  };
  const view = buildDeliverabilityWarnings(state, { env: {} });
  const waveWarning = view.warnings.find((w) => /wave 1 on its own/i.test(w.plain));
  assert(waveWarning, "per-wave warning present");
  assert.match(waveWarning.plain, /hard bounces/);
  const w1 = view.waves.find((w) => w.wave === 1);
  assert.equal(w1.sent, 30);
});

check("utilization helper picks the worst metric", () => {
  const worst = deliverabilityUtilization(
    { hard_bounce: 0.01, spam_complaint: 0.0009, unsubscribe: 0.005 },
    { hard_bounce: 0.02, spam_complaint: 0.001, unsubscribe: 0.025 }
  );
  assert.equal(worst.metric, "spam_complaint");
  assert(Math.abs(worst.utilization - 0.9) < 1e-9);
});

// ---- projector integration ----------------------------------------------------------------------

check("the projector raises a caution queue item when drifting toward the limit", () => {
  const state = {
    reactivationAttempts: attempts(100),
    reactivationEvents: events(2, "unsubscribe"),
    sendgridWebhookHealth: HEALTHY_TELEMETRY
  };
  const projected = projectCompanyMemory(state, { env: {}, now: nowFn }).state;
  const item = projected.queueItems.find((q) => q.sourceRef?.itemId === "deliverability_warning");
  assert(item, "warning queue item exists");
  assert.equal(item.riskLevel, "caution");
  assert.match(item.summary, /80% of the way/);
  assert.deepEqual(item.sourceLink, { kind: "page", target: "#campaigns" });
  const quiet = projectCompanyMemory({}, { env: {}, now: nowFn }).state;
  assert(!quiet.queueItems.some((q) => q.sourceRef?.itemId === "deliverability_warning"), "absent when quiet");
});

// ---- structural guards ---------------------------------------------------------------------------

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const moduleSource = stripComments(readFileSync(new URL("./campaign-brain.mjs", import.meta.url), "utf8"));
const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

check("the campaign brain module has no send or enroll path at all", () => {
  assert(!/fetch\(|smtp|mailto|\.send\(/i.test(moduleSource), "no network or mail calls");
  assert(!/releaseWave\(|actReactivation\(|actOutreach\(|applyWaveAssignment\(/.test(moduleSource), "never calls release, act, or global wave reshuffle");
  assert(!/enrolled_at\s*:/.test(moduleSource), "never writes enrolled_at");
  assert(!/sequence_status\s*:/.test(moduleSource), "never writes sequence_status");
});

check("the held-release route is owner/admin gated with scoped writes and an agent run", () => {
  const brainAt = serverSource.indexOf('url.pathname === "/api/campaign/brain"');
  assert(brainAt >= 0, "brain route exists");
  const confirmAt = serverSource.indexOf('url.pathname === "/api/campaign/held-release/confirm"');
  assert(confirmAt >= 0, "confirm route exists");
  const block = serverSource.slice(confirmAt, serverSource.indexOf('url.pathname === "/api/campaign/wave-release/preview"', confirmAt));
  assert(block.includes('["owner", "admin"].includes(actorRole)'), "owner/admin only");
  assert(block.includes("writeCollections"), "scoped writes only");
  assert(!block.includes("writeState("), "never a full-state write");
  assert(block.includes("recordAgentRun"), "records the agent run");
  assert(block.includes("Nobody is enrolled and nothing was sent"), "the event copy tells the truth");
});

check("the campaigns page carries the campaign brain card and sendless copy", () => {
  for (const marker of ["Campaign brain", "loadCampaignBrain()", "heldReleaseConfirm()", "campaign-brain-result", "nothing sends from here"]) {
    assert(serverSource.includes(marker), `page has: ${marker}`);
  }
});

console.log(`\ntest-campaign-brain: all ${passed} checks passed.`);
