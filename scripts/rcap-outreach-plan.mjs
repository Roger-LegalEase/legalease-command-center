// RCAP contact strategy and Outreach Plan (Wave 3, Packet 9).
//
// Decides who to approach first, by what route, and what the at-most-four-touch sequence is --
// and, just as importantly, when the sequence must stop.
//
// Pure and deterministic: no clock, no network, no writes. The caller passes `now`.
//
// The rules this module exists to enforce, from the master plan's non-negotiables:
//
//   rule 6  — no guessed private email address. A pattern-derived address is not a route.
//   rule 7  — no client-intake phone number used as a sales route.
//   rule 8  — no simultaneous cold outreach to multiple people at one organization.
//   rule 11 — no follow-up that exists merely to say "just following up".
//   rule 13 — no premature automatic escalation over the first contact's head.
//   rule 14 — a reply never mutates commercial stage; it STOPS the sequence and hands to a person.
//
// A plan is a proposal. Nothing here sends, schedules, or contacts anybody, and the plan carries
// no send authority of any kind -- Packet 11 is where execution is even discussed.

import {
  RCAP_CONTACT_ROLES,
  RCAP_PHONE_CLASSES,
  rcapContactEligibility,
  rcapContactIsSendable,
  rcapPhoneIsSalesRoute
} from "./rcap-prospect-registries.mjs";
import { rcapContentHash, rcapRecordId } from "./rcap-profile-contracts.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();

// MUST stay in sync with coreStateCollections in scripts/storage.mjs.
export const RCAP_PLAN_COLLECTIONS = Object.freeze(["rcapOutreachPlans"]);

// Four is the ceiling, not the target. The master plan fixes it because a fifth touch on a cold
// organization is pestering, not persistence.
export const RCAP_MAX_TOUCHES = 4;

export const RCAP_TOUCH_KINDS = Object.freeze([
  Object.freeze({ key: "email", label: "Email", manual: false }),
  // A call is always a task for a person. This system does not dial, and a "call step" that
  // pretended to be automated would be a dead control with a phone number attached.
  Object.freeze({ key: "call", label: "Call", manual: true })
]);

export const RCAP_PLAN_STATES = Object.freeze([
  "draft", "needs_review", "approved", "blocked", "invalidated", "stopped", "complete"
]);

// Every reason a sequence must stop. Each one is a fact about the world, not a preference.
export const RCAP_STOP_RULES = Object.freeze([
  Object.freeze({ key: "reply_received", label: "They replied", detail: "A person takes it from here. A reply never advances the stage by itself." }),
  Object.freeze({ key: "meeting_booked", label: "A meeting is booked", detail: "The sequence has done its job." }),
  Object.freeze({ key: "unsubscribed", label: "They unsubscribed", detail: "No further contact on this route, ever." }),
  Object.freeze({ key: "bounced", label: "The address bounced", detail: "The route is not usable and must not be retried." }),
  Object.freeze({ key: "suppressed", label: "The organization is suppressed", detail: "Suppression outranks every plan." }),
  Object.freeze({ key: "do_not_contact", label: "Marked do not contact", detail: "A person decided this; the plan does not get a vote." }),
  Object.freeze({ key: "sequence_complete", label: "Every touch has happened", detail: "Four touches is the ceiling. Starting again needs a new decision." })
]);

const STOP_BY_KEY = new Map(RCAP_STOP_RULES.map((entry) => [entry.key, entry]));
const ROLE_RANK = new Map(RCAP_CONTACT_ROLES.map((entry) => [entry.key, entry.ladderRank]));

// ---------------------------------------------------------------------------------------------
// Contact ladder
// ---------------------------------------------------------------------------------------------

// A guessed address is one nobody published: derived from a pattern, or explicitly marked as a
// guess. Rule 6 -- it is never a route, however plausible it looks.
const GUESS_MARKERS = /\b(guess(?:ed)?|likely|probably|assumed|pattern|inferred)\b/i;

export function rcapAddressIsGuessed(contact = {}) {
  if (contact.guessed === true || contact.derived === true) return true;
  const provenance = `${clean(contact.source)} ${clean(contact.provenance)} ${clean(contact.confidence)} ${clean(contact.note)}`;
  return GUESS_MARKERS.test(provenance);
}

// Ranks an organization's contacts into the ladder, with the reason each one is where it is.
// The reason travels with the rank because "why this person" is the question the founder will
// actually ask, and a ladder that cannot answer it is just a sorted list.
export function buildRcapContactLadder(contacts = [], options = {}) {
  const rungs = list(contacts).map((contact) => {
    const email = clean(contact.email);
    const eligibility = rcapContactEligibility(contact.eligibility || contact.contactEligibility || contact.addressType);
    const guessed = rcapAddressIsGuessed(contact);
    const roleKey = lower(contact.roleKey || contact.role);
    const rank = ROLE_RANK.get(roleKey) || 99;

    const blockers = [];
    if (!email) blockers.push("No address is on record for this person.");
    if (guessed) blockers.push("The address was inferred rather than published. A guessed address is not a route.");
    if (eligibility && !rcapContactIsSendable(eligibility.key)) blockers.push(eligibility.reason || `${eligibility.label} is not a route for a partnership conversation.`);
    if (contact.suppressed === true || contact.doNotContact === true) blockers.push("This person is suppressed or marked do-not-contact.");

    return Object.freeze({
      id: clean(contact.id || contact.contact_id || contact.contactId),
      name: clean(contact.name || contact.contact_name) || "Unnamed contact",
      title: clean(contact.title || contact.contactRole),
      email,
      roleKey,
      rank,
      eligibilityKey: eligibility ? eligibility.key : "",
      eligibilityLabel: eligibility ? eligibility.label : "",
      guessed,
      emailable: blockers.length === 0,
      blockers: Object.freeze(blockers),
      // Why this rung sits where it does, in one sentence.
      reason: blockers.length
        ? blockers[0]
        : rank <= 2
          ? "Owns the programme this partnership would run through."
          : "Reachable, but further from the decision than the rungs above."
    });
  }).sort((a, b) => (a.rank - b.rank) || (b.emailable - a.emailable) || a.name.localeCompare(b.name));

  const first = rungs.find((rung) => rung.emailable) || null;

  return Object.freeze({
    rungs: Object.freeze(rungs),
    // Rule 8: ONE person at a time. The ladder names a single first contact; the rest are the
    // fallback order if that person does not answer, not a list to approach in parallel.
    firstContact: first,
    firstContactReason: first
      ? `${first.name} is the highest rung with a usable published address. ${first.reason}`
      : "",
    // Rule 13: escalation over someone's head is a human decision, never an automatic step.
    escalation: Object.freeze({
      automatic: false,
      reason: "Approaching someone above the first contact is a decision a person makes, after the first contact has had a fair chance."
    }),
    blocked: !first,
    blockedReason: first ? "" : (rungs.length
      ? "No contact on record has a usable published address."
      : "No contact has been found for this organization yet.")
  });
}

// Rule 7. A client-intake line is how people in trouble reach help; using it to sell is both
// wrong and counterproductive, so it is not a route regardless of the plan.
export function rcapCallRouteFor(phones = []) {
  const usable = list(phones)
    .map((phone) => ({
      number: clean(phone.number || phone.value || phone),
      classKey: lower(phone.classKey || phone.class || phone.kind)
    }))
    .filter((phone) => phone.number);

  const sales = usable.find((phone) => rcapPhoneIsSalesRoute(phone.classKey));
  if (sales) return Object.freeze({ available: true, number: sales.number, classKey: sales.classKey, reason: "" });

  const other = usable.find((phone) => !rcapPhoneIsSalesRoute(phone.classKey));
  const label = other ? (RCAP_PHONE_CLASSES.find((entry) => entry.key === other.classKey)?.label || "number") : "";
  return Object.freeze({
    available: false,
    number: "",
    classKey: other ? other.classKey : "",
    reason: other
      ? `The only number on record is a ${label.toLowerCase()}. That is not a route for a partnership conversation.`
      : "No business line is on record for this organization."
  });
}

// ---------------------------------------------------------------------------------------------
// Existing threads
// ---------------------------------------------------------------------------------------------

// Rule 20 in spirit: an existing conversation must not be talked over. If a thread is already
// open with this person, the plan defers to it rather than opening a second one.
export function rcapExistingThread(timeline = [], contact = {}) {
  const email = lower(contact?.email);
  if (!email) return null;
  const match = list(timeline).find((entry) => {
    const participants = `${lower(entry.email)} ${lower(entry.to)} ${lower(entry.from)}`;
    return participants.includes(email) && clean(entry.threadId || entry.thread_id);
  });
  if (!match) return null;
  return Object.freeze({
    threadId: clean(match.threadId || match.thread_id),
    lastAt: clean(match.occurredAt),
    reason: "A conversation is already open with this person. A new sequence would talk over it."
  });
}

// ---------------------------------------------------------------------------------------------
// Stop rules and invalidation
// ---------------------------------------------------------------------------------------------

// Which stop rules already apply. Evaluated from recorded facts only.
export function rcapActiveStopRules(input = {}) {
  const active = [];
  const add = (key, evidence) => { if (STOP_BY_KEY.has(key)) active.push(Object.freeze({ ...STOP_BY_KEY.get(key), evidence: clean(evidence) })); };

  if (input.suppressed === true) add("suppressed", clean(input.suppressionReason));
  if (input.doNotContact === true) add("do_not_contact", "");
  if (input.unsubscribed === true) add("unsubscribed", "");
  if (input.bounced === true) add("bounced", "");

  for (const entry of list(input.timeline)) {
    const outcome = lower(entry.outcomeState || entry.outcome || entry.kind);
    const direction = lower(entry.direction);
    if (direction === "inbound" || /reply|replied|received/.test(outcome)) add("reply_received", clean(entry.title));
    if (/meeting|calendar/.test(lower(entry.kind || entry.type))) add("meeting_booked", clean(entry.title));
    if (/unsubscrib/.test(outcome)) add("unsubscribed", clean(entry.title));
    if (/bounce/.test(outcome)) add("bounced", clean(entry.title));
  }

  if (Number(input.completedTouches) >= RCAP_MAX_TOUCHES) add("sequence_complete", "");

  // One entry per rule, first evidence wins.
  const seen = new Set();
  return Object.freeze(active.filter((entry) => (seen.has(entry.key) ? false : seen.add(entry.key))));
}

// An approved plan is approved for the facts it was approved against. When those facts move, the
// approval does not survive: it is invalidated and goes back to a person, rather than continuing
// to authorise a sequence written for a world that no longer exists.
export function rcapPlanInvalidatedBy(plan = {}, changes = {}) {
  const reasons = [];
  const contactChanged = clean(changes.firstContactId) && clean(changes.firstContactId) !== clean(plan.firstContactId);
  if (contactChanged) reasons.push("The first contact changed.");
  if (clean(changes.claimsHash) && clean(changes.claimsHash) !== clean(plan.claimsHash)) {
    reasons.push("The claims the plan was written from changed.");
  }
  for (const rule of list(changes.stopRules)) reasons.push(`${rule.label}. ${rule.detail}`);
  return Object.freeze({
    invalidated: reasons.length > 0,
    reasons: Object.freeze(reasons)
  });
}

// ---------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------

// Builds the at-most-four-touch sequence. Each touch carries WHY it exists, because rule 11
// forbids a follow-up whose only content is that it is a follow-up -- a step with no distinct
// purpose is not generated at all.
export function buildRcapOutreachPlan(input = {}) {
  const accountId = clean(input.accountId);
  const now = clean(input.now);
  const ladder = input.ladder || buildRcapContactLadder(input.contacts, input);
  const callRoute = rcapCallRouteFor(input.phones);
  const existingThread = ladder.firstContact ? rcapExistingThread(input.timeline, ladder.firstContact) : null;
  const stopRules = rcapActiveStopRules(input);

  // The distinct reasons a touch may exist. A plan only includes the ones it can actually
  // justify from what is known about THIS organization.
  const angle = clean(input.angle);
  const specifics = list(input.specifics).map(clean).filter(Boolean);

  const touches = [];
  const addTouch = (kind, purpose, waitDays) => {
    if (touches.length >= RCAP_MAX_TOUCHES) return;
    touches.push(Object.freeze({
      number: touches.length + 1,
      kind,
      kindLabel: RCAP_TOUCH_KINDS.find((entry) => entry.key === kind)?.label || kind,
      manual: RCAP_TOUCH_KINDS.find((entry) => entry.key === kind)?.manual === true,
      purpose,
      waitDays: Number(waitDays) || 0,
      // Nothing in a plan is authorised to leave the building. Packet 11 is where that is even
      // discussed, and it is gated on a scope that does not exist yet.
      sendAuthority: false
    }));
  };

  const blocked = Boolean(stopRules.length) || ladder.blocked || Boolean(existingThread);

  if (!blocked) {
    addTouch("email", angle
      ? `Open on ${angle}.`
      : "Open on what this organization actually does, using the recorded facts.", 0);

    // A second touch needs a reason of its own. With only one specific to say, there is nothing
    // to add and the plan stops at one rather than padding itself to four.
    if (specifics.length >= 1) {
      addTouch("email", `Add a specific the first message did not use: ${specifics[0]}`, 8);
    }
    if (callRoute.available) {
      addTouch("call", "A short call to the business line, as a person, if neither message lands.", 6);
    }
    if (specifics.length >= 2) {
      addTouch("email", `Close the sequence with the last distinct reason to reply: ${specifics[1]}`, 10);
    }
  }

  const claimsHash = rcapContentHash({ angle, specifics });

  let state = "draft";
  if (blocked) state = "blocked";
  else if (touches.length) state = "needs_review";

  const blockedReason = stopRules.length
    ? `${stopRules[0].label}. ${stopRules[0].detail}`
    : existingThread
      ? existingThread.reason
      : ladder.blockedReason;

  return Object.freeze({
    id: accountId ? rcapRecordId("rplan", accountId, claimsHash) : "",
    accountId,
    state,
    createdAt: now,
    firstContactId: ladder.firstContact ? ladder.firstContact.id : "",
    firstContactName: ladder.firstContact ? ladder.firstContact.name : "",
    firstContactReason: ladder.firstContactReason,
    ladder: ladder.rungs,
    escalation: ladder.escalation,
    callRoute,
    existingThread,
    touches: Object.freeze(touches),
    touchCeiling: RCAP_MAX_TOUCHES,
    stopRules,
    claimsHash,
    blocked,
    blockedReason: blocked ? blockedReason : "",
    // Every manual step becomes a task for a person rather than something the system claims it
    // will do. A call step with no owner is a promise nobody made.
    manualTasks: Object.freeze(touches.filter((touch) => touch.manual).map((touch) => Object.freeze({
      title: `Call ${ladder.firstContact ? ladder.firstContact.name : "the organization"}`,
      detail: touch.purpose,
      route: callRoute.number,
      afterTouch: touch.number
    }))),
    safety: Object.freeze({ externalActions: 0, sendControls: 0, scheduled: 0 })
  });
}
