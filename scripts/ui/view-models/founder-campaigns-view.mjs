// Founder OS Release 4 — the Campaigns lifecycle projection.
//
// One lifecycle — Plan, Review, Run, Monitor, Stop — over the campaign lanes that already
// exist (docs/founder-os/workspaces/campaigns.md).
//
// THREE RULES SHAPE EVERY LINE OF THIS FILE.
//
// 1. IT IS READ-ONLY. Reactivation is live in production with waves 1 and 2 sending and waves
//    3 and 4 held. This release changes the interface over that campaign, never the campaign,
//    so this module has no write path, adds no route, and calls no mutating function. Controls
//    are reported as the route that ALREADY implements them; nothing here invokes them.
//
// 2. IT TRANSLATES, IT DOES NOT RE-IMPLEMENT. Every number and every blocked reason comes from
//    the existing decision functions by way of `buildCampaignCommandView`. The translation
//    table changes language only; `resolveReactivationSendDecision`, `evaluateThresholds`,
//    `releaseWave`, the claim primitives and `isSuppressed` remain the enforcement layer, and
//    turning "Run" on still requires every one of them to agree before a single send happens.
//
// 3. IT NEVER INVENTS A STATE. A lane with no data says so. The Press lane says it is not
//    built, because no press engine exists in main — the charter is explicit that this must be
//    an honest not-built state and "never a fake one".

import {
  FOUNDER_OS_CAMPAIGN_LANES,
  FOUNDER_OS_CAMPAIGN_LIFECYCLE
} from "../founder-os-config.mjs";
import { buildCampaignCommandView, plainSafetyReasons } from "../../campaign-command.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();

// Every stage reports one of these. "unavailable" and "not_built" are distinct on purpose:
// the first means we could not read the source, the second means the thing does not exist yet.
// Collapsing them would let a genuine outage read as an unfinished feature.
export const FOUNDER_OS_CAMPAIGN_STAGE_STATES = Object.freeze([
  "ready", "attention", "blocked", "running", "stopped", "unavailable", "not_built"
]);

function stage(id, state, summary, options = {}) {
  const definition = FOUNDER_OS_CAMPAIGN_LIFECYCLE.find((entry) => entry.id === id);
  return Object.freeze({
    id,
    label: definition?.label || id,
    purpose: definition?.purpose || "",
    state,
    summary: clean(summary),
    // The single action available at this stage, named in founder language and pointing at the
    // route that already implements it. `route` is reported, never called.
    action: options.action ? Object.freeze({ ...options.action }) : null,
    // Why the lane cannot proceed, in the words the decision function produced. Present only
    // when there genuinely is a reason.
    blockedReason: clean(options.blockedReason) || null
  });
}

function lane(id, stages, options = {}) {
  const definition = FOUNDER_OS_CAMPAIGN_LANES.find((entry) => entry.id === id);
  return Object.freeze({
    id,
    label: definition?.label || id,
    built: definition?.built === true,
    available: options.available !== false,
    // Why the lane is unavailable or not built, stated plainly rather than left to a zero.
    unavailableReason: clean(options.unavailableReason) || null,
    stages: Object.freeze(stages),
    // Exceptions belong in the lane's Monitor view AND in Today Needs attention
    // (campaigns.md:92-97). This is the list Today reads; the projection does not push.
    exceptions: Object.freeze(list(options.exceptions).map((entry) => Object.freeze({ ...entry })))
  });
}

// A lane whose every stage is honestly unavailable, used when the source data cannot be read.
function unavailableLane(id, reason) {
  return lane(id, FOUNDER_OS_CAMPAIGN_LIFECYCLE.map((entry) =>
    stage(entry.id, "unavailable", "This could not be read, so nothing is shown.")),
  { available: false, unavailableReason: reason });
}

// ---------------------------------------------------------------------------------------------
// Reactivation — the live lane. Every value below is `buildCampaignCommandView`'s, relabelled.
// ---------------------------------------------------------------------------------------------

function reactivationLane(state, environment, now) {
  let command = null;
  try {
    command = buildCampaignCommandView(state, { env: environment, now });
  } catch {
    return unavailableLane("reactivation", "Campaign status could not be read.");
  }
  if (!command || command.ok !== true) {
    return unavailableLane("reactivation", "Campaign status could not be read.");
  }

  // Two different truths, kept apart on purpose. `liveMode` is the position of the Run/Stop
  // switch. `sendingOn` is whether an email can actually leave, which also requires autopilot
  // and a provider key. Reporting the switch as "Campaign running" when sending is off would be
  // the exact false-completion the charter forbids, so the surface says "armed but not sending"
  // and gives the reason.
  const switchedOn = command.gates?.liveMode === true;
  const sending = command.gates?.sendingOn === true;
  const paused = String(command.status || "").toLowerCase() === "paused";
  const tripped = command.thresholds?.tripped === true;
  // plainSafetyReasons is the existing translator for threshold strings; reusing it keeps one
  // wording for a tripped limit everywhere it appears.
  const safetyPlain = plainSafetyReasons(command.thresholds?.reasons || []);

  const releasedWaves = list(command.releasedWaves).length;
  const nextWave = list(command.waves).find((wave) => wave.released !== true && Number(wave.eligibleOnRelease || 0) > 0);

  const exceptions = [];
  if (tripped) {
    exceptions.push({
      id: "reactivation-safety-limit",
      severity: "blocked",
      // "threshold trip" -> "Campaign stopped for safety", per the translation table.
      summary: "Campaign stopped for safety.",
      detail: safetyPlain || "A safety limit was reached.",
      action: { label: "Review the safety limit", route: "GET /api/campaign/command" }
    });
  }
  if (command.telemetry && command.telemetry.trusted === false) {
    exceptions.push({
      id: "reactivation-delivery-feedback",
      severity: "attention",
      // "SendGrid webhook health" -> "Delivery feedback connected".
      summary: "Delivery feedback is not connected.",
      detail: "Delivery and reply numbers may be incomplete until it reconnects.",
      action: null
    });
  }

  return lane("reactivation", [
    stage("plan", releasedWaves > 0 ? "ready" : "attention",
      releasedWaves > 0
        ? `${releasedWaves} audience${releasedWaves === 1 ? "" : "s"} approved and active.`
        : "No audience is approved and active yet.",
      { action: { label: "Preview next sends", route: "GET /api/campaign/command", mutates: false } }),

    stage("review", nextWave ? "attention" : "ready",
      nextWave
        ? `The next audience is ready for your approval (${Number(nextWave.eligibleOnRelease || 0)} people).`
        : "No audience is waiting for approval.",
      nextWave
        ? { action: { label: "Release next approved audience", route: "POST /api/campaign/wave-release/propose", mutates: true } }
        : {}),

    stage("run", sending ? "running" : "stopped",
      // "live mode" -> "Run / Stop"; "autopilot" -> "Campaign running".
      sending
        ? "Campaign running."
        : switchedOn
          ? "Run is on, but nothing is sending."
          : paused ? "Campaign stopped." : "Campaign not running.",
      {
        action: { label: switchedOn ? "Stop" : "Run", route: "POST /api/reactivation/live-mode", mutates: true },
        // The exact reason, taken from the decision functions rather than re-derived. Precedence
        // matches theirs: a tripped limit outranks everything, then whatever the planner says.
        blockedReason: tripped
          ? safetyPlain
          : switchedOn && !sending
            ? "Run is on but sending is still off, so nobody receives an email."
            : Number(command.dueNow || 0) === 0 ? command.dueNowPlain : ""
      }),

    stage("monitor", tripped ? "blocked" : exceptions.length ? "attention" : "ready",
      `${Number(command.dueNow || 0)} ${Number(command.dueNow || 0) === 1 ? "person is" : "people are"} eligible in the next window.`,
      { action: { label: "Review replies", route: "GET /api/campaign/command", mutates: false } }),

    stage("stop", switchedOn ? "ready" : "stopped",
      switchedOn ? "Stopping takes effect immediately." : "Already stopped.",
      { action: { label: "Stop", route: "POST /api/reactivation/live-mode", mutates: true } })
  ], { exceptions });
}

// ---------------------------------------------------------------------------------------------
// Social — manual posting IS the product. The live-publishing pipeline stays in Advanced, so
// this lane deliberately exposes NO publish affordance at all.
//
// campaigns.md:53-58 forbids the new surface from inheriting the Publish Now gap. The safest
// reading of that rule, and the one taken here, is that the lane relocates no publish route
// whatsoever: it plans, approves and exports for manual posting. Nothing on this lane can send
// or publish, so there is no gate for it to bypass.
// ---------------------------------------------------------------------------------------------

function socialLane(state) {
  const posts = list(state.posts);
  if (!Array.isArray(state.posts)) return unavailableLane("social", "Social posts could not be read.");

  const statusOf = (post) => String(post?.status || "").toLowerCase();
  const drafts = posts.filter((post) => ["draft", "drafted", "draft_generated"].includes(statusOf(post))).length;
  const awaitingReview = posts.filter((post) => ["needs_review", "in_review", "pending_review"].includes(statusOf(post))).length;
  const approved = posts.filter((post) => statusOf(post) === "approved").length;
  const published = posts.filter((post) => ["published", "posted"].includes(statusOf(post))).length;

  return lane("social", [
    stage("plan", drafts > 0 ? "ready" : "attention",
      drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"} in progress.` : "No drafts in progress.",
      { action: { label: "Plan the week", route: "GET /api/ui/social/weekly", mutates: false } }),

    stage("review", awaitingReview > 0 ? "attention" : "ready",
      awaitingReview > 0
        ? `${awaitingReview} post${awaitingReview === 1 ? "" : "s"} waiting for your approval.`
        : "Nothing is waiting for approval.",
      { action: { label: "Review drafts", route: "GET /api/ui/social", mutates: false } }),

    // "Run" for Social is a person posting by hand. Saying so is the honest translation, and it
    // is why this stage offers an export rather than a publish.
    stage("run", approved > 0 ? "ready" : "stopped",
      approved > 0
        ? `${approved} approved post${approved === 1 ? "" : "s"} ready for you to post by hand.`
        : "No approved posts ready to post.",
      { action: { label: "Copy or export for posting", route: "POST /api/ui/social/weekly/export", mutates: true } }),

    stage("monitor", "ready",
      `${published} post${published === 1 ? "" : "s"} recorded as published.`,
      { action: { label: "Record a published link", route: "POST /api/ui/social/weekly/posts/:postId/manual-publication", mutates: true } }),

    // Nothing automatic is running, so there is nothing to stop. Saying that plainly beats
    // showing a Stop button that does nothing.
    stage("stop", "ready", "Posting is manual, so there is nothing running to stop.")
  ]);
}

// ---------------------------------------------------------------------------------------------
// Partner outreach — the engine requires a human approval that code can never write.
// ---------------------------------------------------------------------------------------------

function partnerOutreachLane(state) {
  if (!Array.isArray(state.prospectCandidates) && !Array.isArray(state.outreachContacts)) {
    return unavailableLane("partner_outreach", "Partner outreach data could not be read.");
  }
  const candidates = list(state.prospectCandidates);
  const pending = candidates.filter((candidate) => String(candidate.review_state || "") === "pending_review").length;
  const approved = candidates.filter((candidate) => String(candidate.review_state || "") === "approved").length;
  const queued = list(state.approvalQueue).filter((item) => String(item.status || "") === "queued_for_approval").length;
  const replies = list(state.outreachReplies).length;
  // "suppression" -> "Not eligible to contact".
  const notEligible = list(state.outreachSuppressions).length + list(state.outreachUnsubscribes).length;

  return lane("partner_outreach", [
    stage("plan", candidates.length > 0 ? "ready" : "attention",
      candidates.length > 0
        ? `${candidates.length} organisation${candidates.length === 1 ? "" : "s"} on the ranked list.`
        : "No organisations on the ranked list yet.",
      { action: { label: "Review the ranked list", route: "GET /api/prospects/status", mutates: false } }),

    stage("review", pending > 0 || queued > 0 ? "attention" : "ready",
      pending > 0 || queued > 0
        ? `${pending + queued} item${pending + queued === 1 ? "" : "s"} need your approval before anything goes out.`
        : "Nothing is waiting for approval.",
      { action: { label: "Approve or reject", route: "POST /api/prospects/approve", mutates: true } }),

    stage("run", approved > 0 ? "ready" : "stopped",
      approved > 0
        ? `${approved} approved organisation${approved === 1 ? "" : "s"} can be contacted.`
        : "Nothing is approved, so nothing can be contacted.",
      { action: { label: "Review outreach status", route: "GET /api/outreach/status", mutates: false } },
    ),

    stage("monitor", "ready",
      `${replies} repl${replies === 1 ? "y" : "ies"} received. ${notEligible} contact${notEligible === 1 ? "" : "s"} not eligible to contact.`,
      { action: { label: "Review replies", route: "GET /api/outreach/status", mutates: false } }),

    stage("stop", "ready", "A reply stops that sequence immediately, on its own.")
  ]);
}

// ---------------------------------------------------------------------------------------------
// Press outreach — not built.
// ---------------------------------------------------------------------------------------------

function pressLane() {
  // Deliberately reports NOT BUILT for every stage rather than zeros. A zero would read as "no
  // journalists yet" when the truth is "this does not exist yet" (campaigns.md:89-90).
  return lane("press", FOUNDER_OS_CAMPAIGN_LIFECYCLE.map((entry) =>
    stage(entry.id, "not_built", "Press outreach is not built yet.")),
  {
    available: false,
    unavailableReason: "Press outreach is not built yet. Nothing here is real, and nothing can be sent."
  });
}

// ---------------------------------------------------------------------------------------------

export function buildFounderCampaignsView(state = {}, options = {}) {
  const environment = options.env && typeof options.env === "object" ? options.env : {};
  const now = options.now instanceof Date ? options.now : new Date(0);

  const lanes = [
    socialLane(state),
    reactivationLane(state, environment, now),
    partnerOutreachLane(state),
    pressLane()
  ];

  return Object.freeze({
    lifecycle: FOUNDER_OS_CAMPAIGN_LIFECYCLE,
    lanes: Object.freeze(lanes),
    // Every exception across every lane, for Today Needs attention to read.
    exceptions: Object.freeze(lanes.flatMap((entry) => entry.exceptions)),
    // The projection's own contract. Asserted by the test suite: this release reads, and that
    // is all it does.
    safety: Object.freeze({
      fullStateReturned: false,
      mutations: 0,
      externalActions: 0,
      // No stage on any lane can publish or send. The only mutating routes reported are the
      // ones that already existed, and reporting a route is not calling it.
      publishAffordances: 0
    })
  });
}
