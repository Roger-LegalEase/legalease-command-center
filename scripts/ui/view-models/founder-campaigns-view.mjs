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
import { PRESS_ANGLES } from "../../press-outreach.mjs";
import { PRESS_KIT, pressProofPlan } from "../../press-kit.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const slug = (value = "") => clean(value).toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");

// Every stage reports one of these. "unavailable" and "not_built" are distinct on purpose:
// the first means we could not read the source, the second means the thing does not exist yet.
// Collapsing them would let a genuine outage read as an unfinished feature.
export const FOUNDER_OS_CAMPAIGN_STAGE_STATES = Object.freeze([
  "ready", "attention", "blocked", "running", "stopped", "unavailable", "not_built"
]);

// One action shape for the whole surface, so the renderer never has to guess what a stage
// action is. `kind` decides what is drawn, and it is the ONLY thing that makes a control
// appear:
//
//   "link"    — a real anchor to a route that already resolves. Opening it navigates and
//               nothing else; no send, release, approval, publication or suppression change
//               can be caused by following it.
//   "control" — a button that calls a client operation THIS RELEASE DID NOT WRITE, named by
//               `control`. The renderer refuses to draw one it does not recognise, so a
//               handler can never be fabricated by adding a string here.
//   absent    — there is no action. The stage renders as plain status with its explanation.
//
// `route` stays exactly what it always was: the route that already implements the action,
// reported and never called from here.
function linkAction(label, href, route, options = {}) {
  return { label, href, kind: "link", route, mutates: options.mutates === true };
}

function controlAction(label, control, route, mutates = true) {
  return { label, kind: "control", control, route, mutates };
}

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
    blockedReason: clean(options.blockedReason) || null,
    // Optional structured payload for a stage that has more to say than one line — the Press Plan
    // stage's per-angle proof, for instance. Read-only like everything else here.
    detail: options.detail ? Object.freeze(options.detail) : null
  });
}

function lane(id, stages, options = {}) {
  const definition = FOUNDER_OS_CAMPAIGN_LANES.find((entry) => entry.id === id);
  return Object.freeze({
    id,
    label: definition?.label || id,
    built: definition?.built === true,
    // Fixed copy and glyph for the type card. Not data; see FOUNDER_OS_CAMPAIGN_LANES.
    description: definition?.description || "",
    icon: definition?.icon || "",
    // The named campaign records this lane can actually point at. Most lanes have none: this
    // product has one reactivation campaign and a set of press angle campaigns, and nothing
    // else in the projection is a campaign with an identity of its own. A lane with no named
    // record contributes no table row rather than a row named after the lane.
    campaigns: Object.freeze(list(options.campaigns).map((entry) => Object.freeze({ ...entry }))),
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
      // The safety limit and the switch that clears it live in the same controls. The renderer
      // draws this as a button that opens them; it cannot clear anything itself.
      action: controlAction("Open sending controls", "reactivation-controls", "GET /api/campaign/command", false)
    });
  }
  if (command.telemetry && command.telemetry.trusted === false) {
    exceptions.push({
      id: "reactivation-delivery-feedback",
      severity: "attention",
      // "SendGrid webhook health" -> "Delivery feedback connected".
      summary: "Delivery feedback is not connected.",
      detail: "Delivery and reply numbers may be incomplete until it reconnects.",
      // Connecting it is a setup step, and the connections surface already exists. The
      // exception used to carry no action at all, so the founder was told about a problem and
      // given nowhere to fix it.
      action: linkAction("Open connections", "#settings", "GET /api/connectors/status")
    });
  }

  return lane("reactivation", [
    stage("plan", releasedWaves > 0 ? "ready" : "attention",
      releasedWaves > 0
        ? `${releasedWaves} audience${releasedWaves === 1 ? "" : "s"} approved and active.`
        : "No audience is approved and active yet.",
      // Previewing, releasing, running and stopping all live in the one set of controls this
      // release did not write. Plan is a reading, so it carries no control of its own.
      {}),

    stage("review", nextWave ? "attention" : "ready",
      nextWave
        ? `The next audience is ready for your approval (${Number(nextWave.eligibleOnRelease || 0)} people).`
        : "No audience is waiting for approval.",
      nextWave
        ? { action: controlAction("Open sending controls", "reactivation-controls", "POST /api/campaign/wave-release/propose", false) }
        : {}),

    stage("run", sending ? "running" : "stopped",
      // "live mode" -> "Run / Stop"; "autopilot" -> "Campaign running".
      sending
        ? "Campaign running."
        : switchedOn
          ? "Run is on, but nothing is sending."
          : paused ? "Campaign stopped." : "Campaign not running.",
      {
        // The button opens the existing controls; it never runs or stops anything itself.
        // This surface has no write path, and a control that could send from here would be one.
        action: controlAction("Open sending controls", "reactivation-controls", "POST /api/reactivation/live-mode", false),
        // The exact reason, taken from the decision functions rather than re-derived. Precedence
        // matches theirs: a tripped limit outranks everything, then whatever the planner says.
        blockedReason: tripped
          ? safetyPlain
          : switchedOn && !sending
            ? "Run is on but sending is still off, so nobody receives an email."
            : Number(command.dueNow || 0) === 0 ? command.dueNowPlain : ""
      }),

    // `dueEligible`, not `dueNow`. Outside the send window the planner reports who is due via an
    // `outside_window` observation and `dueNow` reads 0 — which made Monitor say "0 eligible in
    // the next window" while Run correctly said the same people were queued and eligible when the
    // window opens. The sentence here promises "the next window", and `dueEligible` is that
    // number in every case: equal to `dueNow` inside the window, the queued count outside it.
    stage("monitor", tripped ? "blocked" : exceptions.length ? "attention" : "ready",
      `${Number(command.dueEligible || 0)} ${Number(command.dueEligible || 0) === 1 ? "person is" : "people are"} eligible in the next window.`,
      // Monitor is a reading, not a decision. There is no separate replies destination for
      // reactivation, so it stays plain status rather than a control that goes nowhere.
      {}),

    stage("stop", switchedOn ? "ready" : "stopped",
      switchedOn ? "Stopping takes effect immediately." : "Already stopped.",
      switchedOn
        ? { action: controlAction("Open sending controls", "reactivation-controls", "POST /api/reactivation/live-mode", false) }
        : {})
  ], {
    exceptions,
    // The one named reactivation campaign, for the Active campaigns table.
    //
    // PROGRESS is released audiences over total audiences — a ratio the campaign already
    // maintains, not an estimate of completion. A campaign with no audiences defined has no
    // progress and the cell is left out.
    //
    // OUTCOME is the recorded send count. It is the one delivery number this projection can
    // state without interpretation; open and reply rates are reported by the sending controls
    // and are not restated here.
    campaigns: clean(command.campaignId) ? [{
      id: clean(command.campaignId),
      name: clean(command.campaignId),
      subtitle: command.statusPlain || "",
      progress: list(command.waves).length
        ? {
          complete: list(command.releasedWaves).length,
          total: list(command.waves).length,
          label: `${list(command.releasedWaves).length} of ${list(command.waves).length} audiences approved`
        }
        : null,
      outcome: Number.isFinite(Number(command.rates?.sent))
        ? { value: String(Number(command.rates.sent)), label: Number(command.rates.sent) === 1 ? "email sent" : "emails sent" }
        : null,
      href: ""
    }] : []
  });
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
      { action: linkAction("Plan the week", "#social?view=weekly", "GET /api/ui/social/weekly") }),

    stage("review", awaitingReview > 0 ? "attention" : "ready",
      awaitingReview > 0
        ? `${awaitingReview} post${awaitingReview === 1 ? "" : "s"} waiting for your approval.`
        : "Nothing is waiting for approval.",
      { action: linkAction("Review drafts", "#social", "GET /api/ui/social") }),

    // "Run" for Social is a person posting by hand. Saying so is the honest translation, and it
    // is why this stage offers an export rather than a publish.
    stage("run", approved > 0 ? "ready" : "stopped",
      approved > 0
        ? `${approved} approved post${approved === 1 ? "" : "s"} ready for you to post by hand.`
        : "No approved posts ready to post.",
      // A link to the plan, where the export control already lives. Opening the plan exports
      // nothing; the existing confirmed control there does the work.
      { action: linkAction("Copy or export for posting", "#social?view=weekly", "POST /api/ui/social/weekly/export", { mutates:true }) }),

    stage("monitor", "ready",
      `${published} post${published === 1 ? "" : "s"} recorded as published.`,
      { action: linkAction("Record a published link", "#social?view=weekly", "POST /api/ui/social/weekly/posts/:postId/manual-publication", { mutates:true }) }),

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
  // Whether the ranked list could be read at all. A missing collection is NOT zero: an
  // unreadable list says so, because "0 waiting for you" and "we could not look" are
  // different sentences and only one of them is safe to act on.
  const rankedListReadable = Array.isArray(state.prospectCandidates);
  const candidates = list(state.prospectCandidates);
  const pending = candidates.filter((candidate) => slug(candidate.review_state) === "pending_review").length;
  const approved = candidates.filter((candidate) => slug(candidate.review_state) === "approved").length;

  // THE APPROVAL COUNT. It used to be `pending + every queued approvalQueue row`, and the
  // queued half was never filtered by campaign type — unlike the press lane, which is — so a
  // social or review-desk approval inflated a number labelled "partner outreach". Two rules
  // now govern it:
  //
  //   1. The number on the card is the number of records the destination shows. Review
  //      approvals opens the ranked list, whose server projection selects exactly
  //      `review_state === "pending_review"` (prospect-selection.mjs `pendingTotal`), so the
  //      card counts exactly that and nothing else.
  //   2. Nothing enters the count that Roger cannot then review. Drafted partner emails do
  //      sit in `approvalQueue`, and they ARE classifiable — `type === "outreach_message"`
  //      with a `lane` that is not press — but no reviewed client workflow can display or
  //      decide one (`POST /api/outreach/approve` still has no caller). They are reported
  //      separately, in words, and never folded into a count that promises a review.
  const queuedPartnerMessages = list(state.approvalQueue)
    .filter((item) => slug(item.type) === "outreach_message")
    .filter((item) => slug(item.status) === "queued_for_approval")
    .filter((item) => slug(item.lane) !== "press")
    .length;
  const dormantNote = queuedPartnerMessages > 0
    ? ` ${queuedPartnerMessages} drafted partner email${queuedPartnerMessages === 1 ? " is" : "s are"} also waiting, and there is no way to review ${queuedPartnerMessages === 1 ? "it" : "them"} here yet.`
    : "";

  const replies = list(state.outreachReplies).length;
  // "suppression" -> "Not eligible to contact".
  const notEligible = list(state.outreachSuppressions).length + list(state.outreachUnsubscribes).length;

  return lane("partner_outreach", [
    stage("plan", !rankedListReadable ? "unavailable" : candidates.length > 0 ? "ready" : "attention",
      !rankedListReadable
        ? "The list of organisations could not be read, so no number is shown."
        : candidates.length > 0
          ? `${candidates.length} organisation${candidates.length === 1 ? "" : "s"} on the ranked list.`
          : "No organisations on the ranked list yet.",
      rankedListReadable
        ? { action: linkAction("Open the ranked list", "#prospects", "GET /api/prospects/status") }
        : {}),

    stage("review", !rankedListReadable ? "unavailable" : pending > 0 ? "attention" : "ready",
      !rankedListReadable
        ? "The number waiting for your approval could not be read, so none is shown."
        : (pending > 0
          ? `${pending} organisation${pending === 1 ? "" : "s"} need${pending === 1 ? "s" : ""} your approval before anything goes out.`
          : "Nothing is waiting for approval.") + dormantNote,
      rankedListReadable
        ? { action: linkAction("Review approvals", "#prospects", "POST /api/prospects/approve", { mutates:true }) }
        : {}),

    stage("run", approved > 0 ? "ready" : "stopped",
      approved > 0
        ? `${approved} approved organisation${approved === 1 ? "" : "s"} can be contacted.`
        : "Nothing is approved, so nothing can be contacted.",
      // Approving is the only decision here, and it is on Review. Nothing is started from
      // this stage, so it stays plain status rather than a control that does nothing.
      { blockedReason: approved > 0 ? "" : "Approve organisations on Review before any of them can be contacted." }),

    stage("monitor", "ready",
      `${replies} repl${replies === 1 ? "y" : "ies"} received. ${notEligible} contact${notEligible === 1 ? "" : "s"} not eligible to contact.`,
      {}),

    stage("stop", "ready", "A reply stops that sequence immediately, on its own.")
  ]);
}

// ---------------------------------------------------------------------------------------------
// Press outreach — not built.
// ---------------------------------------------------------------------------------------------

function pressLane(state, pressEnabled) {
  // Until the lane is switched on it reports NOT BUILT for every stage rather than zeros. A zero
  // would read as "no journalists yet" when the truth is "this does not exist yet"
  // (campaigns.md:89-90). That remains the flag-off behaviour.
  if (!pressEnabled) {
    return lane("press", FOUNDER_OS_CAMPAIGN_LIFECYCLE.map((entry) =>
      stage(entry.id, "not_built", "Press outreach is not built yet.")),
    {
      available: false,
      unavailableReason: "Press outreach is not built yet. Nothing here is real, and nothing can be sent."
    });
  }

  const contacts = list(state.outreachContacts).filter((row) => slug(row.classification) === "press");
  // Multi-angle composer proposals: inert campaign rows the composer wrote with status
  // "proposed". Surfaced so Roger can see what is drafted; starting one stays a separate,
  // approval-gated decision that this read-only surface cannot take.
  const proposedCampaigns = list(state.outreachCampaigns)
    .filter((row) => slug(row.classification) === "press" && slug(row.status) === "proposed");
  const activePress = list(state.outreachCampaigns)
    .find((row) => slug(row.classification) === "press" && ["active", "running"].includes(slug(row.status)));
  const sendable = contacts.filter((row) => row.press_sendable === true);
  const held = contacts.filter((row) => row.press_sendable !== true);
  const warm = contacts.filter((row) => slug(row.press_outreach_kind) === "warm_follow_up");
  const placements = list(state.pressPlacements);
  const approvals = list(state.approvalQueue).filter((row) => slug(row.lane) === "press" && slug(row.status) === "queued_for_approval");
  const replies = list(state.outreachReplies).filter((row) => slug(row.lane) === "press");

  // Held reasons, counted, so Review can show WHY rather than just a smaller number.
  const reasons = new Map();
  for (const row of held) {
    const reason = clean(row.press_hold_reason) || "unknown";
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  const reasonSummary = [...reasons.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${count} ${reason.replace(/_/g, " ")}`)
    .join(", ");

  // Every angle, resolved against the approved source. Nothing here is an outstanding-artifact
  // warning: the kit proves what it proves, and what it does not prove is offered on request
  // rather than shown as a checklist Roger is failing to clear.
  const angles = PRESS_ANGLES.map((angle) => {
    const proof = pressProofPlan(angle);
    return Object.freeze({
      id: angle.id,
      label: angle.label,
      guardrail: angle.guardrail,
      // What the kit supplies — the only list on this stage that is a to-do in any sense, and it
      // is already done.
      provenByKit: Object.freeze(proof.satisfied.map((entry) => entry.requirement)),
      // Proof the kit shapes but does not specify. Pitchable, with the note as the limit.
      provenInPart: Object.freeze(proof.partial.map((entry) =>
        Object.freeze({ requirement: entry.requirement, limit: entry.note }))),
      // NOT blockers. Offered, never claimed.
      offeredOnRequest: Object.freeze(proof.followUp.map((entry) => entry.requirement)),
      offers: proof.offers,
      reframe: proof.reframe,
      kitCoverage: proof.kitCoverage
    });
  });
  const fullyProven = angles.filter((angle) => angle.offeredOnRequest.length === 0 && angle.provenInPart.length === 0);

  return lane("press", [
    stage("plan", "ready",
      `${angles.length} story angles, all pitchable on the press kit alone. `
      + `${fullyProven.length} need nothing beyond it; the rest carry the same claims and offer figures or a participant story on request.`,
      {
        // The angles are shown here, in full. There is nowhere else to go, so this stage
        // carries no control.
        detail: {
          approvedSource: PRESS_KIT.file,
          approvedSourceCurrentAsOf: PRESS_KIT.currentAsOf,
          angles: Object.freeze(angles),
          // Stated once, here, so the surface never renders these as a gap.
          followUpPolicy: "Traction figures and a participant story are offered on request, not required to pitch. A draft may offer them; it may never state a figure or tell a story it does not have, and a story needs recorded consent first."
        }
      }),

    stage("review", approvals.length ? "attention" : sendable.length ? "ready" : "attention",
      `${sendable.length} contactable, ${held.length} held (${reasonSummary || "no reasons recorded"}).`,
      {
        blockedReason: sendable.length
          ? "Approving the audience happens on the campaign itself, one campaign at a time."
          : "Nothing is contactable yet, so nothing can be approved."
      }),

    // Run is deliberately identical in shape to reactivation: one approval, no autonomous send.
    activePress
      ? stage("run", "running",
        `"${clean(activePress.name) || clean(activePress.campaign_id)}" is running — one touch per journalist, stop is immediate, a reply stops that journalist on its own.`,
        {
          action: linkAction("Open the running campaign",
            `#outreach/campaign/${encodeURIComponent(`outreach:${clean(activePress.campaign_id || activePress.id)}`)}`,
            `#outreach/campaign/${encodeURIComponent(`outreach:${clean(activePress.campaign_id || activePress.id)}`)}`),
          detail: {
            runningCampaign: Object.freeze({
              campaignId: clean(activePress.campaign_id || activePress.id),
              label: clean(activePress.angle_label || activePress.name) || null,
              href: `#outreach/campaign/${encodeURIComponent(`outreach:${clean(activePress.campaign_id || activePress.id)}`)}`,
              approvedAt: clean(activePress.run_approved?.approved_at) || null
            })
          }
        })
      : stage("run", "stopped",
        (proposedCampaigns.length
          ? `${proposedCampaigns.length} proposed angle campaign${proposedCampaigns.length === 1 ? "" : "s"} drafted and waiting — open one to read the pitch and approve it. `
          : "")
        + "No press campaign is running. Sending requires your approval, one campaign at a time.",
        {
          // The approval lives on the campaign itself. When one is drafted, the control is a
          // link to it; with nothing drafted there is nothing to open, and the stage says so.
          action: proposedCampaigns.length
            ? linkAction("Open the first drafted campaign",
              `#outreach/campaign/${encodeURIComponent(`outreach:${clean(proposedCampaigns[0].campaign_id || proposedCampaigns[0].id)}`)}`,
              "POST /api/outreach/approve", { mutates:true })
            : null,
          blockedReason: "Nothing sends until you approve a campaign, and approval is the only thing that starts it.",
          detail: proposedCampaigns.length
            ? {
              proposedCampaigns: Object.freeze(proposedCampaigns.map((row) => Object.freeze({
                angleId: clean(row.angle_id) || null,
                label: clean(row.angle_label || row.name) || null,
                assigned: Number(row.audience?.assigned) || 0,
                direct: Number(row.audience?.direct) || 0,
                sharedNewsroom: Number(row.audience?.sharedNewsroom) || 0,
                proposedAt: clean(row.proposed_at) || null,
                // The click path: the campaign detail page, where Messages carries the drafted
                // pitch, Audience the assigned journalists, and the one approval lives.
                href: `#outreach/campaign/${encodeURIComponent(`outreach:${clean(row.campaign_id || row.id)}`)}`
              }))),
              composeRoute: "POST /api/press/campaign/preview"
            }
            : null
        }),

    stage("monitor", "ready",
      `${replies.length} repl${replies.length === 1 ? "y" : "ies"}. ${placements.length} placement${placements.length === 1 ? "" : "s"} recorded.`,
      {}),

    stage("stop", "ready", "A reply stops that sequence immediately, on its own.")
  ], {
    // The named press campaigns, for the Active campaigns table: the running one, then each
    // drafted angle campaign. `assigned` is the journalist count the campaign actually carries,
    // reported as the outcome; there is no denominator for it, so no progress bar is drawn.
    campaigns: [
      ...(activePress ? [{
        id: clean(activePress.campaign_id || activePress.id),
        name: clean(activePress.angle_label || activePress.name) || clean(activePress.campaign_id),
        subtitle: "Running — one touch per journalist",
        progress: null,
        outcome: null,
        href: `#outreach/campaign/${encodeURIComponent(`outreach:${clean(activePress.campaign_id || activePress.id)}`)}`
      }] : []),
      ...proposedCampaigns.map((row) => ({
        id: clean(row.campaign_id || row.id),
        name: clean(row.angle_label || row.name) || clean(row.campaign_id || row.id),
        subtitle: "Drafted — waiting for your approval",
        progress: null,
        outcome: Number(row.audience?.assigned)
          ? { value: String(Number(row.audience.assigned)), label: "journalists assigned" }
          : null,
        href: `#outreach/campaign/${encodeURIComponent(`outreach:${clean(row.campaign_id || row.id)}`)}`
      }))
    ],
    exceptions: warm.length
      ? [{
        id: "press-warm-follow-ups",
        severity: "attention",
        summary: `${warm.length} prior relationship${warm.length === 1 ? "" : "s"} ready for a follow-up.`,
        detail: "These people have covered LegalEase before. They are follow-ups, not cold pitches.",
        action: null
      }]
      : []
  });
}

// ---------------------------------------------------------------------------------------------
// The type card, the stepper and the table.
//
// All three are DERIVED FROM THE LANES ABOVE. Nothing below reads state, adds a number, or
// invents a state: it re-shapes what the lanes already reported into the three compositions the
// concept screen shows.
// ---------------------------------------------------------------------------------------------

// Where a lane is in the lifecycle right now.
//
// The rule, applied in this order and applied once: the earliest stage that is BLOCKED, then the
// earliest WAITING ON A PERSON, then the one that is RUNNING, then the earliest that is STOPPED.
// A lane whose every stage is ready, unreadable or not built has no current step, and none is
// marked for it.
//
// This is a reading of the stage states the decision functions produced, not a second opinion
// about them.
function currentStageOf(lane) {
  const stages = list(lane.stages);
  return stages.find((entry) => entry.state === "blocked")
    || stages.find((entry) => entry.state === "attention")
    || stages.find((entry) => entry.state === "running")
    || stages.find((entry) => entry.state === "stopped")
    || null;
}

// The four type cards. Each carries the lane's fixed description, its real current stage, and
// the one action that stage already offers. The concept also shows a headline number on every
// card ("9 planned this week"); no lane reports a single figure that could fill it, so no card
// draws one — see the omissions list in the release notes.
function typeCard(lane) {
  const current = currentStageOf(lane);
  return Object.freeze({
    id: lane.id,
    label: lane.label,
    description: lane.description,
    icon: lane.icon,
    built: lane.built,
    available: lane.available,
    unavailableReason: lane.unavailableReason,
    // The status pill: the current stage's name, and its state for colour. A lane with no
    // current step reports none rather than a default.
    stage: current ? Object.freeze({ id: current.id, label: current.label, state: current.state }) : null,
    // The status line beneath the description, in the lane's own words.
    status: current ? current.summary : (lane.stages[0]?.summary || ""),
    action: current?.action ? Object.freeze({ ...current.action }) : null
  });
}

// The lifecycle bar. A step is marked current when at least one lane is standing on it; the
// earliest such step is THE current one, so exactly one is highlighted or none is.
function lifecycleSteps(lanes) {
  const standing = new Set(lanes.map((entry) => currentStageOf(entry)?.id).filter(Boolean));
  const currentId = FOUNDER_OS_CAMPAIGN_LIFECYCLE.find((step) => standing.has(step.id))?.id || "";
  return Object.freeze(FOUNDER_OS_CAMPAIGN_LIFECYCLE.map((step, index) => Object.freeze({
    ...step,
    position: index + 1,
    current: step.id === currentId,
    // How many lanes are standing on this step. Real, and it is what makes the highlight
    // explicable rather than decorative.
    lanes: lanes.filter((entry) => currentStageOf(entry)?.id === step.id).map((entry) => entry.label)
  })));
}

// The Active campaigns table. One row per NAMED campaign record; a lane that cannot name one
// contributes nothing, and the surface says which lanes those are rather than inventing a row
// named after the lane.
function campaignRows(lanes) {
  return Object.freeze(lanes.flatMap((entry) => {
    const current = currentStageOf(entry);
    return list(entry.campaigns).map((campaign) => Object.freeze({
      ...campaign,
      laneId: entry.id,
      laneLabel: entry.label,
      icon: entry.icon,
      stage: current ? Object.freeze({ id: current.id, label: current.label, state: current.state }) : null,
      nextAction: current?.action ? Object.freeze({ ...current.action }) : null
    }));
  }));
}

export function buildFounderCampaignsView(state = {}, options = {}) {
  const environment = options.env && typeof options.env === "object" ? options.env : {};
  const now = options.now instanceof Date ? options.now : new Date(0);

  const lanes = [
    socialLane(state),
    reactivationLane(state, environment, now),
    partnerOutreachLane(state),
    pressLane(state, options.pressEnabled === true)
  ];

  return Object.freeze({
    lifecycle: lifecycleSteps(lanes),
    // The four type cards, in the concept's order.
    types: Object.freeze(lanes.map(typeCard)),
    // Every named campaign, and the lanes that have none.
    campaigns: campaignRows(lanes),
    unnamedLanes: Object.freeze(lanes.filter((entry) => entry.available && !list(entry.campaigns).length).map((entry) => entry.label)),
    lanes: Object.freeze(lanes),
    // Plan and setup for the workspace as a whole, not for one lane. Bringing an audience in
    // is the first step of Plan for every lane that has an audience, and until now the only
    // way to reach it was a button on the legacy page — which the Outreach flag deleted.
    // It lives here so it survives both flags and does not depend on any legacy markup.
    setup: Object.freeze([
      Object.freeze(linkAction("Import audience", "#upload", "POST /api/intake/preview", { mutates:true }))
    ]),
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
