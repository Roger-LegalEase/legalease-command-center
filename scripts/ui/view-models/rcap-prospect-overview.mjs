// Prospect Overview — complete and blocked (Wave 1, Packet 4).
//
// The primary decision surface for one RCAP account, projected over
// `buildRelationshipDetail`. It reads. The writes it offers are the existing safe contracts
// (note, activity, next action, task completion) reached through the relationship action
// path -- this module describes which of those are permitted, and performs none of them.
//
// The invariant the whole file is arranged around: an account shows EITHER one clear next
// action OR one complete blocker. Never both, never neither. `isCompleteRcapBlocker` refuses a
// half-populated blocker, so "blocked" can never degrade into an empty card.

import {
  RCAP_OVERVIEW_ACTIONS,
  isCompleteRcapBlocker,
  rcapContactEligibility,
  rcapCount,
  rcapPhoneIsSalesRoute,
  rcapRelationHasCoordinationRisk,
  rcapStageFromCanonical,
  rcapValue
} from "../../rcap-prospect-registries.mjs";
import { RCAP_PROSPECTS_CANONICAL_ROUTE, RCAP_PROSPECTS_VIEW_KEY } from "../rcap-crm-config.mjs";
import { buildRelationshipDetail } from "../../relationship-service.mjs";
import { rcapAccountHref } from "./rcap-prospect-list.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const RCAP_OVERVIEW_MAX_ACTIONS = 4;
const MAX_RECENT_ACTIVITY = 5;
const MAX_OPEN_TASKS = 4;
const MAX_FILES = 5;

// The three primary views. Profile and Activity are declared here with an `available` flag:
// a tab that leads nowhere is a dead control, so an unavailable view says why rather than
// rendering an empty page.
export function rcapProspectViews(accountId, { profileAvailable = false, activityAvailable = false } = {}) {
  const base = `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}&account=${encodeURIComponent(accountId)}`;
  return Object.freeze([
    Object.freeze({ key: "overview", label: "Overview", available: true, active: true, href: base }),
    Object.freeze({
      key: "profile",
      label: "Profile",
      available: profileAvailable,
      active: false,
      href: `${base}&pane=profile`,
      unavailableReason: profileAvailable ? null : "No structured research profile exists for this organization yet."
    }),
    Object.freeze({
      key: "activity",
      label: "Activity",
      available: activityAvailable,
      active: false,
      href: `${base}&pane=activity`,
      unavailableReason: activityAvailable ? null : "No correspondence or activity has been recorded for this organization yet."
    })
  ]);
}

// ---------------------------------------------------------------------------------------------
// Truth of an activity event
// ---------------------------------------------------------------------------------------------
//
// Prepared is not sent, scheduled is not sent, provider-accepted is not delivered, and an
// ambiguous outcome is `outcome unknown`. These map the timeline's own vocabulary onto that
// distinction rather than collapsing everything into "sent".

const OUTCOME_LABELS = Object.freeze({
  drafted: "Prepared", prepared: "Prepared", draft: "Prepared",
  approved: "Approved", scheduled: "Scheduled",
  accepted: "Provider accepted", queued: "Provider accepted",
  sent: "Sent", delivered: "Delivered",
  received: "Replied", replied: "Replied",
  bounced: "Bounced", unsubscribed: "Unsubscribed",
  failed: "Outcome unknown", unknown: "Outcome unknown"
});

export function rcapActivityOutcome(event = {}) {
  const raw = lower(event.outcomeState || event.status || event.state || event.kind);
  for (const [key, label] of Object.entries(OUTCOME_LABELS)) {
    if (raw.includes(key)) return Object.freeze({ key, label });
  }
  return Object.freeze({ key: "recorded", label: "Recorded" });
}

// The relationship projection normalises a timeline entry to
// {id, type, direction, label, summary, occurredAt, href} and does NOT carry provider outcome.
// Reading the outcome therefore means going back to the record the entry points at -- its id is
// `collection:itemId`. This enriches; it does not rebuild the timeline, whose composition and
// order still come from the projection.
//
// When the source carries no outcome the entry stays "Recorded". It is never upgraded to
// "Sent" or "Delivered" on the strength of a label, because a claim that a message was sent
// has to come from durable state, not from a title.
export function rcapEnrichedOutcome(entry = {}, state = {}) {
  const id = clean(entry.id);
  const separator = id.indexOf(":");
  if (separator > 0) {
    const collection = id.slice(0, separator);
    const itemId = id.slice(separator + 1);
    const record = list(state[collection]).find((row) => clean(row?.id) === itemId);
    if (record) {
      const raw = lower(record.outcomeState || record.outcome_state || record.status || record.state || record.kind);
      if (raw) {
        for (const [key, label] of Object.entries(OUTCOME_LABELS)) {
          if (raw.includes(key)) return Object.freeze({ key, label });
        }
      }
    }
  }
  return Object.freeze({ key: "recorded", label: "Recorded" });
}

// ---------------------------------------------------------------------------------------------
// Best first contact
// ---------------------------------------------------------------------------------------------

function bestContact(detail) {
  const contacts = list(detail.contacts);
  if (!contacts.length) {
    return Object.freeze({
      available: false,
      state: "no_appropriate_contact",
      stateLabel: "No appropriate contact",
      reason: "No published contact has been found for this organization yet.",
      warnings: Object.freeze(["Outreach cannot be prepared without a verified contact."]),
      ladder: Object.freeze([])
    });
  }

  const [primary, ...rest] = contacts;
  const suppressed = lower(detail.outreach?.eligibility?.key) === "suppressed"
    || Boolean(primary.suppressed || primary.doNotContact || primary.do_not_contact);
  const email = clean(primary.email);
  const eligibilityKey = suppressed
    ? "suppressed"
    : !email
      ? "unavailable"
      : /^(intake|help|apply|clinic|casework|referral)/i.test(email.split("@")[0])
        ? "client_intake"
        : /^(info|contact|hello|admin|office|general)/i.test(email.split("@")[0])
          ? "shared_public_business"
          : "direct_public_business";
  const eligibility = rcapContactEligibility(eligibilityKey);

  const warnings = [];
  if (suppressed) warnings.push("This contact is suppressed and must not be contacted.");
  if (eligibilityKey === "client_intake") warnings.push("This is a client-intake route, not a route for a partnership conversation.");
  if (eligibilityKey === "shared_public_business") warnings.push("This is a shared organizational inbox, not a named person.");
  if (!clean(primary.title)) warnings.push("This contact's title has not been verified.");

  // A phone number is shown ONLY when it is a business route. An intake or unclassified
  // number is withheld rather than displayed next to a call-to-action.
  const phoneClass = clean(primary.phoneClass) || "unknown";
  const phone = rcapPhoneIsSalesRoute(phoneClass) ? clean(primary.phone) : "";

  return Object.freeze({
    available: true,
    state: eligibilityKey,
    stateLabel: eligibility.label,
    name: rcapValue(clean(primary.name) || null),
    title: rcapValue(clean(primary.title) || null),
    organization: rcapValue(clean(detail.relationship?.organization) || null),
    email: rcapValue(email || null, suppressed ? "blocked" : "known"),
    emailType: eligibilityKey,
    phone: rcapValue(phone || null, phone ? "known" : "not_applicable"),
    phoneClass,
    sendable: eligibility.sendable && !suppressed,
    reason: clean(primary.reason) || "Listed as the published contact for this organization.",
    confidence: rcapValue(clean(primary.confidence) || null),
    lastVerifiedAt: rcapValue(clean(primary.lastVerifiedAt || primary.last_verified_at) || null),
    existingThread: Boolean(primary.hasThread || primary.existingThread),
    warnings: Object.freeze(warnings),
    // Collapsed by default. Only one cold contact is active at a time -- the ladder is
    // reference, not a list of people to contact in parallel.
    ladder: Object.freeze(rest.slice(0, 4).map((contact) => Object.freeze({
      name: clean(contact.name) || null,
      title: clean(contact.title) || null,
      eligibilityKey: clean(contact.email) ? "unverified" : "unavailable"
    }))),
    oneActiveColdContact: true
  });
}

// ---------------------------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------------------------
//
// Derived from what is actually missing. Each carries the full six-part anatomy or it is not
// emitted at all.

function blockersFor(detail, contact, relatedConflicts) {
  const owner = clean(detail.relationship?.owner) || "Unassigned";
  const blockers = [];

  if (contact.state === "no_appropriate_contact") {
    blockers.push({
      kind: "no_verified_contact",
      whatIsBlocked: "Preparing outreach",
      whyBlocked: "No published contact has been found for this organization.",
      whatCanContinue: "Research, notes, files, and contact review all remain available.",
      owner,
      requiredDecision: "Find and verify a first contact, or record that no appropriate route exists.",
      primaryAction: "Review contacts"
    });
  } else if (contact.state === "client_intake") {
    blockers.push({
      kind: "intake_address_only",
      whatIsBlocked: "Preparing outreach",
      whyBlocked: "The only published address is a client-intake route, which is not a route for a partnership conversation.",
      whatCanContinue: "Research and contact discovery remain available.",
      owner,
      requiredDecision: "Find a business contact for this organization.",
      primaryAction: "Review contacts"
    });
  } else if (contact.state === "suppressed") {
    blockers.push({
      kind: "contact_suppressed",
      whatIsBlocked: "All outreach to this contact",
      whyBlocked: "This contact is suppressed.",
      whatCanContinue: "Research and notes remain available; another verified contact may be proposed.",
      owner,
      requiredDecision: "Identify another verified contact, or leave the account in nurture.",
      primaryAction: "Review contacts"
    });
  }

  for (const conflict of relatedConflicts) {
    blockers.push({
      kind: "related_active_conversation",
      whatIsBlocked: "Starting a new conversation",
      whyBlocked: `A related organization (${conflict.name}) is already in an active conversation.`,
      whatCanContinue: "Research, notes, and coordination with the other owner remain available.",
      owner,
      requiredDecision: "Coordinate with the owner of the related conversation before contacting this organization.",
      primaryAction: "Review related accounts"
    });
  }

  return blockers.filter(isCompleteRcapBlocker).map((blocker) => Object.freeze(blocker));
}

// ---------------------------------------------------------------------------------------------
// Related accounts
// ---------------------------------------------------------------------------------------------

function relatedAccounts(detail, options = {}) {
  const related = list(options.relatedAccounts);
  return Object.freeze(related.map((entry) => Object.freeze({
    id: clean(entry.id),
    name: clean(entry.name),
    relationKey: clean(entry.relation),
    coordinationRisk: rcapRelationHasCoordinationRisk(entry.relation),
    activeConversation: Boolean(entry.activeConversation),
    href: clean(entry.id) ? rcapAccountHref({ id: entry.id }) : null
  })).filter((entry) => entry.id && entry.name));
}

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------

export function buildRcapProspectOverview(state = {}, actor = {}, accountId = "", now = "", options = {}) {
  if (options.rcapCrmEnabled !== true) {
    return Object.freeze({
      available: false,
      enabled: false,
      availability: Object.freeze({ state: "feature_off", reason: "The RCAP prospect workspace is not enabled." }),
      safety: Object.freeze({ mutations: 0, externalActions: 0, sendControls: 0 })
    });
  }

  const detail = buildRelationshipDetail(state, actor, accountId, now, options);
  if (!detail.available) {
    return Object.freeze({
      available: false,
      enabled: true,
      availability: detail.availability,
      safety: Object.freeze({ mutations: 0, externalActions: 0, sendControls: 0 })
    });
  }

  const relationship = detail.relationship || {};
  const stage = rcapStageFromCanonical(relationship.stage?.key || relationship.stage?.label || "");
  const contact = bestContact(detail);
  const related = relatedAccounts(detail, options);
  const conflicts = related.filter((entry) => entry.activeConversation && entry.coordinationRisk);
  const blockers = blockersFor(detail, contact, conflicts);
  const blocked = blockers.length > 0;

  const timeline = list(detail.timeline);
  const tasks = list(detail.tasks);
  const files = list(detail.files);

  // Next Best Step. When the account is blocked, the blocker IS the next step -- the surface
  // must never show a cheerful action that cannot be completed.
  const storedNextAction = clean(relationship.nextAction);
  const nextBestStep = blocked
    ? Object.freeze({
      available: true,
      blocked: true,
      title: blockers[0].primaryAction,
      rationale: blockers[0].whyBlocked,
      owner: clean(relationship.owner) || "Unassigned",
      dueAt: relationship.nextFollowUpAt || null,
      recommendationSource: "Derived from what this account is missing.",
      blocker: blockers[0],
      primaryAction: Object.freeze({ key: "review_contacts", label: blockers[0].primaryAction, external: false }),
      secondaryAction: Object.freeze({ key: "add_note", label: "Add note", external: false }),
      snoozeAvailable: false
    })
    : storedNextAction
      ? Object.freeze({
        available: true,
        blocked: false,
        title: storedNextAction,
        rationale: "This is the next action recorded for the account.",
        owner: clean(relationship.owner) || "Unassigned",
        dueAt: relationship.nextFollowUpAt || null,
        recommendationSource: "Recorded by a person.",
        blocker: null,
        primaryAction: Object.freeze({ key: "complete_next_action", label: "Mark complete", external: false }),
        secondaryAction: Object.freeze({ key: "set_next_step", label: "Change next step", external: false }),
        snoozeAvailable: true
      })
      // Neither an action nor a blocker is itself the thing to fix, and the surface says so
      // rather than rendering an empty card.
      : Object.freeze({
        available: true,
        blocked: false,
        title: "Set the next step",
        rationale: "No next action has been recorded for this organization.",
        owner: clean(relationship.owner) || "Unassigned",
        dueAt: null,
        recommendationSource: "Derived from the absence of a recorded next action.",
        blocker: null,
        primaryAction: Object.freeze({ key: "set_next_step", label: "Set next step", external: false }),
        secondaryAction: Object.freeze({ key: "add_note", label: "Add note", external: false }),
        snoozeAvailable: false
      });

  // Actions. Draft email is withheld entirely when the account is blocked -- a control that
  // cannot complete its work is a dead control.
  const actions = RCAP_OVERVIEW_ACTIONS
    .filter((action) => (action.key === "draft_email" ? !blocked : true))
    .map((action) => Object.freeze({
      key: action.key,
      label: action.label,
      primary: action.primary === true,
      external: false,
      // Wave 1 has no Outreach Review workspace. Draft email routes to a truthful
      // not-yet-available state that contains no send control, rather than to the existing
      // campaign detail surface, which is broken.
      href: action.key === "draft_email"
        ? `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}&account=${encodeURIComponent(accountId)}&pane=outreach-review`
        : null,
      opensReviewOnly: action.key === "draft_email"
    }));

  return Object.freeze({
    available: true,
    enabled: true,
    availability: Object.freeze({ state: "ready", reason: null }),
    accountId,
    blocked,

    header: Object.freeze({
      organizationName: clean(relationship.organization) || clean(relationship.name),
      programLabel: rcapValue(clean(relationship.campaign?.name) || null),
      organizationType: rcapValue(clean(relationship.categoryLabel) || null),
      geography: rcapValue(clean(relationship.geography) || null),
      whyThisMatters: rcapValue(clean(relationship.summary) || null),
      stage: Object.freeze({ key: stage.key, label: stage.label, truth: stage.state }),
      priority: rcapValue(clean(relationship.strategicPriority?.label || relationship.priority) || null),
      owner: rcapValue(clean(relationship.owner) || null),
      // Wave 1 builds no profile engine. Reporting "not started" is the truth; a completeness
      // figure here would be invented.
      profileStatus: Object.freeze({ key: "not_started", label: "Not started" }),
      lastMeaningfulTouch: rcapValue(relationship.lastOutboundAt || relationship.lastInboundAt || null)
    }),

    views: rcapProspectViews(accountId, {
      profileAvailable: false,
      activityAvailable: timeline.length > 0
    }),

    actions: Object.freeze(actions),
    nextBestStep,

    // Account Snapshot. Nothing is fabricated: with no structured profile, each section
    // reports that it is not known yet rather than inventing a sentence.
    snapshot: Object.freeze({
      whatTheyDo: rcapValue(clean(relationship.summary) || null),
      whyRcapMayFit: rcapValue(null, "unknown"),
      whatNotToPitch: rcapValue(null, "unknown"),
      openQuestion: rcapValue(null, "unknown"),
      sourceNote: "A structured profile has not been built for this organization yet."
    }),

    bestContact: contact,

    // No plan records exist in Wave 1, so the honest state is "no approved plan". Campaign
    // vocabulary is deliberately absent.
    outreachPlan: Object.freeze({
      available: false,
      state: "no_approved_plan",
      label: "No approved plan",
      reason: "No outreach plan has been prepared and approved for this organization.",
      steps: Object.freeze([]),
      sendControls: 0
    }),

    recentActivity: Object.freeze(timeline.slice(0, MAX_RECENT_ACTIVITY).map((event) => {
      const outcome = rcapEnrichedOutcome(event, state);
      return Object.freeze({
        id: clean(event.id),
        kind: clean(event.type),
        title: clean(event.label) || clean(event.summary) || "Recorded activity",
        occurredAt: event.occurredAt || null,
        direction: clean(event.direction) || null,
        outcomeKey: outcome.key,
        outcomeLabel: outcome.label
      });
    })),

    profileSummary: Object.freeze({
      status: Object.freeze({ key: "not_started", label: "Not started" }),
      currentVersion: rcapValue(null, "not_applicable"),
      lastRefreshedAt: rcapValue(null, "not_applicable"),
      primaryStory: rcapValue(null, "unknown"),
      strongestOpenQuestion: rcapValue(null, "unknown"),
      whatNotToPitch: rcapValue(null, "unknown"),
      blocked: rcapValue(null, "not_applicable"),
      note: "Structured research profiles arrive in a later release. Nothing is claimed about this organization that has not been recorded by a person."
    }),

    contextRail: Object.freeze({
      whereThingsStand: Object.freeze({
        priority: rcapValue(clean(relationship.strategicPriority?.label || relationship.priority) || null),
        stage: Object.freeze({ key: stage.key, label: stage.label }),
        relationshipStrength: rcapValue(clean(relationship.relationshipStrength?.label) || null),
        profileStatus: Object.freeze({ key: "not_started", label: "Not started" }),
        lastInboundAt: rcapValue(relationship.lastInboundAt || null),
        lastOutboundAt: rcapValue(relationship.lastOutboundAt || null),
        nextFollowUpAt: rcapValue(relationship.nextFollowUpAt || null),
        owner: rcapValue(clean(relationship.owner) || null),
        outreachState: rcapValue(detail.outreach?.automated ? "In automated outreach" : "Not in outreach"),
        contactEligibility: Object.freeze({ key: contact.state, label: contact.stateLabel })
      }),
      openTasks: Object.freeze(tasks.slice(0, MAX_OPEN_TASKS).map((task) => Object.freeze({
        id: clean(task.id),
        title: clean(task.title) || "Untitled task",
        dueAt: task.dueDate || task.dueAt || null,
        owner: clean(task.owner) || null,
        // Completing a task must never move a stage or contact anyone.
        completionChangesStage: false,
        completionSends: false
      }))),
      openTaskCount: rcapCount(tasks.length),
      files: Object.freeze(files.slice(0, MAX_FILES).map((file) => Object.freeze({
        id: clean(file.id),
        title: clean(file.title || file.name) || "Untitled file",
        updatedAt: file.updatedAt || null
      }))),
      relatedAccounts: related,
      // Shown BEFORE outreach, not after it starts.
      coordinationWarning: conflicts.length
        ? Object.freeze({
          present: true,
          message: `A related organization is already in an active conversation: ${conflicts.map((entry) => entry.name).join(", ")}.`,
          accounts: Object.freeze(conflicts.map((entry) => entry.name))
        })
        : Object.freeze({ present: false, message: null, accounts: Object.freeze([]) })
    }),

    blockers: Object.freeze(blockers),

    // Which safe writes this actor may perform. Each delegates to an existing contract; this
    // module performs none of them, and none of them can send.
    permittedWrites: Object.freeze({
      addNote: Boolean(detail.capabilities?.draftFollowUp ?? false) || Boolean(detail.capabilities?.setNextAction),
      logActivity: Boolean(detail.capabilities?.setNextAction),
      setNextAction: Boolean(detail.capabilities?.setNextAction),
      completeTask: Boolean(detail.capabilities?.completeNextAction),
      changeStage: false,
      send: false
    }),

    safety: Object.freeze({
      mutations: 0,
      externalActions: 0,
      sendControls: 0,
      fullStateReturned: false,
      stageMutatedBySideEffect: false
    })
  });
}
