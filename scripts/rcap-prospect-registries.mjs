// RCAP Prospect CRM shared vocabulary (Wave 1, Packet 1).
//
// One registry module so the list, the Overview, the import, and their tests all read the
// same words. Every registry here is DISPLAY-SIDE: it maps existing canonical state onto
// user-facing language. None of it is a second source of truth, and nothing in this file
// writes.
//
// The rule that shapes the whole module: a user-facing stage is a projection of the
// canonical partner stage, never a replacement for it. `rcapStageFromCanonical` reads; there
// is deliberately no inverse function that writes a canonical stage from a display label,
// because a display label must never be the thing that moves a commercial stage.

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

// ---------------------------------------------------------------------------------------------
// Truth states
// ---------------------------------------------------------------------------------------------
//
// The master plan's rule 15/21: unknown, unavailable, and not-connected must never render as
// zero, and must never look like a negative business conclusion. These are the only truth
// states the RCAP surfaces may use.

export const RCAP_TRUTH_STATES = Object.freeze([
  Object.freeze({ key: "known", label: "Known", rendersAsValue: true }),
  Object.freeze({ key: "unknown", label: "Not known yet", rendersAsValue: false }),
  Object.freeze({ key: "unavailable", label: "Unavailable", rendersAsValue: false }),
  Object.freeze({ key: "not_connected", label: "Not connected", rendersAsValue: false }),
  Object.freeze({ key: "stale", label: "Needs refresh", rendersAsValue: true }),
  Object.freeze({ key: "blocked", label: "Blocked", rendersAsValue: false }),
  Object.freeze({ key: "not_applicable", label: "Not applicable", rendersAsValue: false }),
  Object.freeze({ key: "outcome_unknown", label: "Outcome unknown", rendersAsValue: false })
]);

const TRUTH_STATE_KEYS = new Set(RCAP_TRUTH_STATES.map((state) => state.key));

export function isRcapTruthState(value = "") {
  return TRUTH_STATE_KEYS.has(clean(value));
}

export function rcapTruthLabel(value = "") {
  return RCAP_TRUTH_STATES.find((state) => state.key === clean(value))?.label || "Not known yet";
}

// A value plus how much it can be trusted, in one shape. Surfaces render `label` when the
// state does not render as a value, so a missing number never becomes "0" and a missing fact
// never becomes an empty string that reads as "none".
export function rcapValue(value, state = "known") {
  const requested = isRcapTruthState(state) ? clean(state) : "unknown";
  const definition = RCAP_TRUTH_STATES.find((entry) => entry.key === requested);
  const hasValue = value !== null && value !== undefined && value !== "";
  const usable = Boolean(definition?.rendersAsValue) && hasValue;
  // Resolve the state BEFORE labelling. A caller that says "known" but supplies nothing is
  // reporting an absence, so it becomes `unknown` -- and the label has to follow, or a missing
  // value renders as the word "Known".
  const resolved = usable ? requested : (hasValue ? requested : (requested === "known" ? "unknown" : requested));
  return Object.freeze({
    value: usable ? value : null,
    state: resolved,
    label: usable ? String(value) : rcapTruthLabel(resolved),
    known: usable
  });
}

// A count that is genuinely unavailable must not be 0. Surfaces call this instead of
// defaulting a number, so "we could not read the source" and "there are none" stay distinct.
export function rcapCount(count, state = "known") {
  if (!isRcapTruthState(state) || state !== "known") return rcapValue(null, state);
  const numeric = Number(count);
  if (!Number.isFinite(numeric) || numeric < 0) return rcapValue(null, "unknown");
  return Object.freeze({ value: numeric, state: "known", label: String(numeric), known: true });
}

// ---------------------------------------------------------------------------------------------
// User-facing commercial stage
// ---------------------------------------------------------------------------------------------
//
// The ten stages the master plan names, in order, with the two side exits last. `canonical`
// lists the existing partner-stage values this display stage projects from; storage keeps
// using those values unchanged.

export const RCAP_STAGES = Object.freeze([
  Object.freeze({ key: "research", label: "Research", order: 1, sideExit: false }),
  Object.freeze({ key: "ready", label: "Ready", order: 2, sideExit: false }),
  Object.freeze({ key: "contacted", label: "Contacted", order: 3, sideExit: false }),
  Object.freeze({ key: "conversation", label: "Conversation", order: 4, sideExit: false }),
  Object.freeze({ key: "meeting", label: "Meeting", order: 5, sideExit: false }),
  Object.freeze({ key: "proposal", label: "Proposal", order: 6, sideExit: false }),
  Object.freeze({ key: "onboarding", label: "Onboarding", order: 7, sideExit: false }),
  Object.freeze({ key: "partner", label: "Partner", order: 8, sideExit: false }),
  Object.freeze({ key: "nurture", label: "Nurture", order: 9, sideExit: true }),
  Object.freeze({ key: "inactive", label: "Inactive", order: 10, sideExit: true })
]);

const STAGE_KEYS = new Set(RCAP_STAGES.map((stage) => stage.key));

// Canonical partner/pipeline values seen in the existing stores, mapped onto the display
// vocabulary. Unrecognised canonical values deliberately fall through to `research` with an
// `unknown` truth state rather than being silently assigned a flattering stage.
const CANONICAL_STAGE_MAP = Object.freeze({
  prospect: "research",
  prospecting: "research",
  research: "research",
  researching: "research",
  identified: "research",
  qualified: "ready",
  ready: "ready",
  ready_to_contact: "ready",
  contacted: "contacted",
  outreach: "contacted",
  outreach_sent: "contacted",
  engaged: "conversation",
  conversation: "conversation",
  in_conversation: "conversation",
  replied: "conversation",
  meeting: "meeting",
  meeting_booked: "meeting",
  discovery: "meeting",
  proposal: "proposal",
  proposal_sent: "proposal",
  negotiation: "proposal",
  onboarding: "onboarding",
  activating: "onboarding",
  active: "partner",
  partner: "partner",
  live: "partner",
  nurture: "nurture",
  paused: "nurture",
  stalled: "nurture",
  inactive: "inactive",
  archived: "inactive",
  disqualified: "inactive",
  lost: "inactive",
  closed_lost: "inactive"
});

export function rcapStageFromCanonical(canonicalStage = "") {
  const normalized = lower(canonicalStage).replaceAll(/[\s-]+/g, "_");
  if (!normalized) return Object.freeze({ key: "research", label: "Research", state: "unknown", canonical: "" });
  const key = CANONICAL_STAGE_MAP[normalized];
  if (!key) {
    return Object.freeze({ key: "research", label: "Research", state: "unknown", canonical: clean(canonicalStage) });
  }
  const stage = RCAP_STAGES.find((entry) => entry.key === key);
  return Object.freeze({ key: stage.key, label: stage.label, state: "known", canonical: clean(canonicalStage) });
}

export function isRcapStage(value = "") {
  return STAGE_KEYS.has(clean(value));
}

// ---------------------------------------------------------------------------------------------
// Profile sections (the 15-section contract)
// ---------------------------------------------------------------------------------------------
//
// Declared in Packet 1 because the list and Overview both summarise profile completeness, and
// a summary that counts sections must agree with the workspace Wave 2 builds. Wave 1 writes no
// section records -- it only reports honestly that none exist.

export const RCAP_PROFILE_SECTION_GROUPS = Object.freeze([
  Object.freeze({ key: "account_strategy", label: "Account & Strategy", sections: Object.freeze([1, 2, 3, 4]) }),
  Object.freeze({ key: "initial_message", label: "Initial Message", sections: Object.freeze([5, 6, 7, 8]) }),
  Object.freeze({ key: "follow_up", label: "Follow-Up", sections: Object.freeze([9, 10]) }),
  Object.freeze({ key: "commercial_path", label: "Commercial Path", sections: Object.freeze([11, 12, 13, 14]) }),
  Object.freeze({ key: "outreach_plan", label: "Outreach Plan", sections: Object.freeze([15]) })
]);

export const RCAP_PROFILE_SECTIONS = Object.freeze([
  Object.freeze({ number: 1, key: "strategic_verdict", label: "Strategic Verdict", group: "account_strategy" }),
  Object.freeze({ number: 2, key: "crm_corrections", label: "CRM Corrections", group: "account_strategy" }),
  Object.freeze({ number: 3, key: "best_contact_strategy", label: "Best Contact Strategy", group: "account_strategy" }),
  Object.freeze({ number: 4, key: "strongest_sales_angle", label: "Strongest Sales Angle", group: "account_strategy" }),
  Object.freeze({ number: 5, key: "best_subject_line", label: "Best Subject Line", group: "initial_message" }),
  Object.freeze({ number: 6, key: "send_ready_initial_email", label: "Send-Ready Initial Email", group: "initial_message" }),
  Object.freeze({ number: 7, key: "why_the_message_works", label: "Why the Message Works", group: "initial_message" }),
  Object.freeze({ number: 8, key: "what_to_send", label: "What to Send", group: "initial_message" }),
  Object.freeze({ number: 9, key: "first_follow_up_email", label: "First Follow-Up Email", group: "follow_up" }),
  Object.freeze({ number: 10, key: "follow_up_attachment", label: "Follow-Up Attachment", group: "follow_up" }),
  Object.freeze({ number: 11, key: "likely_objections", label: "Likely Objections", group: "commercial_path" }),
  Object.freeze({ number: 12, key: "discovery_call_objective", label: "Discovery-Call Objective", group: "commercial_path" }),
  Object.freeze({ number: 13, key: "recommended_pilot", label: "Recommended Pilot or Initial Offer", group: "commercial_path" }),
  Object.freeze({ number: 14, key: "deal_path", label: "Deal Path", group: "commercial_path" }),
  Object.freeze({ number: 15, key: "outreach_sequence", label: "Outreach Sequence", group: "outreach_plan" })
]);

export const RCAP_PROFILE_SECTION_STATES = Object.freeze([
  "draft", "needs_review", "approved", "human_edited", "stale", "blocked", "rejected"
]);

// Research-profile lifecycle (master plan 12.1). Wave 1 accounts are all `not_started` unless
// an existing record proves otherwise.
export const RCAP_PROFILE_STATUSES = Object.freeze([
  Object.freeze({ key: "not_started", label: "Not started" }),
  Object.freeze({ key: "queued", label: "Queued" }),
  Object.freeze({ key: "researching", label: "Researching" }),
  Object.freeze({ key: "needs_review", label: "Needs review" }),
  Object.freeze({ key: "approved", label: "Approved" }),
  Object.freeze({ key: "stale", label: "Needs refresh" }),
  Object.freeze({ key: "blocked", label: "Blocked" }),
  Object.freeze({ key: "failed", label: "Failed" }),
  Object.freeze({ key: "disqualified", label: "Disqualified" })
]);

// A clean disqualification is a SUCCESSFUL research outcome (master plan rule 24), so it must
// not be rendered in the same visual register as `failed` or `blocked`.
export const RCAP_SUCCESSFUL_PROFILE_OUTCOMES = Object.freeze(["approved", "disqualified"]);

// ---------------------------------------------------------------------------------------------
// Fact classes
// ---------------------------------------------------------------------------------------------
//
// Rule 23: a source-backed fact and a Le-E recommendation must never look identical. Wave 1
// consumes this only for labelling existing values; Wave 2 attaches it to claim records.

export const RCAP_FACT_CLASSES = Object.freeze([
  Object.freeze({ key: "verified_fact", label: "Verified", requiresSource: true }),
  Object.freeze({ key: "supported_inference", label: "Inferred", requiresSource: true }),
  Object.freeze({ key: "open_question", label: "Open question", requiresSource: false }),
  Object.freeze({ key: "recommendation", label: "Le-E recommendation", requiresSource: false }),
  Object.freeze({ key: "pilot_hypothesis", label: "Pilot hypothesis", requiresSource: false }),
  Object.freeze({ key: "human_note", label: "Human note", requiresSource: false })
]);

// ---------------------------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------------------------

export const RCAP_CONTACT_ROLES = Object.freeze([
  Object.freeze({ key: "operational_champion", label: "Operational champion", ladderRank: 1 }),
  Object.freeze({ key: "program_decision_maker", label: "Program decision-maker", ladderRank: 2 }),
  Object.freeze({ key: "community_outreach_lead", label: "Community outreach lead", ladderRank: 3 }),
  Object.freeze({ key: "volunteer_pro_bono_lead", label: "Volunteer / pro bono lead", ladderRank: 4 }),
  Object.freeze({ key: "legal_reviewer", label: "Legal reviewer", ladderRank: 5 }),
  Object.freeze({ key: "budget_owner", label: "Budget owner", ladderRank: 6 }),
  Object.freeze({ key: "executive_sponsor", label: "Executive sponsor", ladderRank: 7 }),
  Object.freeze({ key: "funder_or_connector", label: "Funder or connector", ladderRank: 8 }),
  Object.freeze({ key: "shared_org_route", label: "Shared organizational route", ladderRank: 9 })
]);

// Eligibility of a contact POINT (an address or number), not of a person. `sendable` is the
// only thing a later wave's send gate may consult, and every value that is not a verified
// business route is false here. `client_intake` is false by policy, not by data quality:
// rule 7 forbids using an intake line as a sales route even when it is perfectly valid.
export const RCAP_CONTACT_ELIGIBILITY = Object.freeze([
  Object.freeze({ key: "direct_public_business", label: "Verified direct", sendable: true, warn: false }),
  Object.freeze({ key: "shared_public_business", label: "Shared inbox", sendable: true, warn: true }),
  Object.freeze({ key: "existing_gmail_relationship", label: "Existing thread", sendable: true, warn: false }),
  Object.freeze({ key: "client_intake", label: "Client-intake route", sendable: false, warn: true }),
  Object.freeze({ key: "unverified", label: "Needs verification", sendable: false, warn: true }),
  Object.freeze({ key: "unavailable", label: "No appropriate contact", sendable: false, warn: true }),
  Object.freeze({ key: "suppressed", label: "Suppressed", sendable: false, warn: true }),
  Object.freeze({ key: "bounced", label: "Bounced", sendable: false, warn: true }),
  Object.freeze({ key: "do_not_contact", label: "Do not contact", sendable: false, warn: true })
]);

const ELIGIBILITY_BY_KEY = new Map(RCAP_CONTACT_ELIGIBILITY.map((entry) => [entry.key, entry]));

export function rcapContactEligibility(key = "") {
  return ELIGIBILITY_BY_KEY.get(clean(key)) || ELIGIBILITY_BY_KEY.get("unverified");
}

export function rcapContactIsSendable(key = "") {
  return Boolean(ELIGIBILITY_BY_KEY.get(clean(key))?.sendable);
}

// Phone classification (master plan 13.3). Only an explicit business route is a sales route;
// everything else, including `unknown`, is not.
export const RCAP_PHONE_CLASSES = Object.freeze([
  Object.freeze({ key: "business_route", label: "Business line", salesRoute: true }),
  Object.freeze({ key: "client_intake", label: "Client-intake line", salesRoute: false }),
  Object.freeze({ key: "main_switchboard", label: "Main switchboard", salesRoute: false }),
  Object.freeze({ key: "personal_professional", label: "Personal / public professional line", salesRoute: false }),
  Object.freeze({ key: "unknown", label: "Unclassified", salesRoute: false }),
  Object.freeze({ key: "not_available", label: "Not available", salesRoute: false })
]);

const PHONE_CLASS_BY_KEY = new Map(RCAP_PHONE_CLASSES.map((entry) => [entry.key, entry]));

export function rcapPhoneIsSalesRoute(key = "") {
  return Boolean(PHONE_CLASS_BY_KEY.get(clean(key))?.salesRoute);
}

// ---------------------------------------------------------------------------------------------
// Account relations
// ---------------------------------------------------------------------------------------------
//
// The distinctions the import must not flatten: an organization may promote a clinic it does
// not operate, and a host is not a legal-services operator. `coordinationRisk` marks the
// relations that require a coordination warning before outreach.

export const RCAP_ACCOUNT_RELATIONS = Object.freeze([
  Object.freeze({ key: "parent", label: "Parent organization", coordinationRisk: true }),
  Object.freeze({ key: "affiliate", label: "Local affiliate", coordinationRisk: true }),
  Object.freeze({ key: "operator", label: "Program operator", coordinationRisk: true }),
  Object.freeze({ key: "host", label: "Clinic host", coordinationRisk: true }),
  Object.freeze({ key: "promoter", label: "Clinic promoter", coordinationRisk: false }),
  Object.freeze({ key: "legal_provider", label: "Legal-services provider", coordinationRisk: true }),
  Object.freeze({ key: "funder", label: "Funder", coordinationRisk: false }),
  Object.freeze({ key: "coalition", label: "Coalition partner", coordinationRisk: true }),
  Object.freeze({ key: "same_market", label: "Same market", coordinationRisk: true })
]);

export function rcapRelationHasCoordinationRisk(key = "") {
  return Boolean(RCAP_ACCOUNT_RELATIONS.find((entry) => entry.key === clean(key))?.coordinationRisk);
}

// ---------------------------------------------------------------------------------------------
// Attention reasons
// ---------------------------------------------------------------------------------------------
//
// The list shows exactly ONE reason per row (master plan 16.2), so these carry an explicit
// priority and the projector takes the lowest number present. Plain language only: no queue,
// engine, or machine-state vocabulary reaches the founder surface.

export const RCAP_ATTENTION_REASONS = Object.freeze([
  Object.freeze({ key: "reply_needs_response", label: "Reply needs response", priority: 1, tone: "urgent" }),
  Object.freeze({ key: "related_account_conflict", label: "Related-account conflict", priority: 2, tone: "warn" }),
  Object.freeze({ key: "blocked", label: "Blocked", priority: 3, tone: "warn" }),
  Object.freeze({ key: "draft_ready", label: "Draft ready", priority: 4, tone: "action" }),
  Object.freeze({ key: "follow_up_due", label: "Follow-up due", priority: 5, tone: "action" }),
  Object.freeze({ key: "contact_unverified", label: "Contact unverified", priority: 6, tone: "warn" }),
  Object.freeze({ key: "profile_stale", label: "Profile needs refresh", priority: 7, tone: "warn" }),
  Object.freeze({ key: "profile_not_started", label: "Profile not started", priority: 8, tone: "info" }),
  Object.freeze({ key: "source_unavailable", label: "Source unavailable", priority: 9, tone: "info" }),
  Object.freeze({ key: "no_next_action", label: "No next action", priority: 10, tone: "info" }),
  Object.freeze({ key: "none", label: "", priority: 99, tone: "none" })
]);

const ATTENTION_BY_KEY = new Map(RCAP_ATTENTION_REASONS.map((entry) => [entry.key, entry]));

// Takes every reason that applies and returns the single one the row should show.
export function rcapPrimaryAttention(reasonKeys = []) {
  const candidates = (Array.isArray(reasonKeys) ? reasonKeys : [])
    .map((key) => ATTENTION_BY_KEY.get(clean(key)))
    .filter(Boolean)
    .filter((entry) => entry.key !== "none");
  if (!candidates.length) return ATTENTION_BY_KEY.get("none");
  return candidates.reduce((best, entry) => (entry.priority < best.priority ? entry : best));
}

// ---------------------------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------------------------
//
// Filters over one projected list, never separate fetches -- the same rule the Founder OS
// relationship views follow. `summaryStrip` marks the six counts the prototype's header shows.

export const RCAP_SAVED_VIEWS = Object.freeze([
  Object.freeze({ key: "all", label: "All RCAP Prospects", summaryStrip: false }),
  Object.freeze({ key: "needs_research", label: "Needs Research", summaryStrip: true }),
  Object.freeze({ key: "needs_review", label: "Needs Review", summaryStrip: true }),
  Object.freeze({ key: "ready_to_contact", label: "Ready to Contact", summaryStrip: true }),
  Object.freeze({ key: "follow_up_due", label: "Follow-Up Due", summaryStrip: true }),
  Object.freeze({ key: "replies", label: "Replies", summaryStrip: true }),
  Object.freeze({ key: "blocked", label: "Blocked", summaryStrip: true }),
  Object.freeze({ key: "active_conversations", label: "Active Conversations", summaryStrip: false }),
  Object.freeze({ key: "proposals", label: "Proposals", summaryStrip: false }),
  Object.freeze({ key: "partners", label: "Partners", summaryStrip: false }),
  Object.freeze({ key: "nurture", label: "Nurture", summaryStrip: false })
]);

const SAVED_VIEW_KEYS = new Set(RCAP_SAVED_VIEWS.map((view) => view.key));

export function isRcapSavedView(value = "") {
  return SAVED_VIEW_KEYS.has(clean(value));
}

export function normalizeRcapSavedView(value = "") {
  const key = clean(value);
  return SAVED_VIEW_KEYS.has(key) ? key : "all";
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------
//
// The visible action vocabulary. `external` is false on every entry in Wave 1 and the test
// suite asserts that, so a send control cannot be added to these surfaces by accident.
// `writes` names the existing safe contract each action delegates to -- none of them is a new
// write path.

export const RCAP_OVERVIEW_ACTIONS = Object.freeze([
  Object.freeze({ key: "draft_email", label: "Draft email", primary: true, external: false, writes: null, opens: "outreach-review" }),
  Object.freeze({ key: "add_note", label: "Add note", primary: false, external: false, writes: "activityEvents", opens: null }),
  Object.freeze({ key: "log_activity", label: "Log activity", primary: false, external: false, writes: "activityEvents", opens: null }),
  Object.freeze({ key: "set_next_step", label: "Set next step", primary: false, external: false, writes: "tasks", opens: null })
]);

export const RCAP_LIST_ROW_ACTIONS = Object.freeze([
  Object.freeze({ key: "open", label: "Open", external: false }),
  Object.freeze({ key: "add_note", label: "Add note", external: false }),
  Object.freeze({ key: "set_next_step", label: "Set next step", external: false })
]);

// Wave 1 grants no external authority at all. Asserted by the foundation suite.
export const RCAP_WAVE1_EXTERNAL_ACTION_COUNT = 0;

// ---------------------------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------------------------
//
// Master plan 16.4: a blocker is only useful if it names what is blocked, why, what may
// continue, who owns it, and the one action that resolves it. The shape is enforced by
// `isCompleteRcapBlocker` so a half-populated blocker cannot ship as a blank card.

export const RCAP_BLOCKER_FIELDS = Object.freeze([
  "whatIsBlocked", "whyBlocked", "whatCanContinue", "owner", "requiredDecision", "primaryAction"
]);

export function isCompleteRcapBlocker(blocker = {}) {
  if (!blocker || typeof blocker !== "object") return false;
  return RCAP_BLOCKER_FIELDS.every((field) => Boolean(clean(blocker[field])));
}

export const RCAP_BLOCKER_KINDS = Object.freeze([
  Object.freeze({ key: "operator_unresolved", label: "Program operator unresolved" }),
  Object.freeze({ key: "no_verified_contact", label: "No verified first contact" }),
  Object.freeze({ key: "intake_address_only", label: "Only a client-intake address is available" }),
  Object.freeze({ key: "contact_title_conflict", label: "Contact title conflict" }),
  Object.freeze({ key: "related_active_conversation", label: "Related account already in conversation" }),
  Object.freeze({ key: "source_conflict", label: "Sources conflict" }),
  Object.freeze({ key: "profile_incomplete", label: "Profile incomplete" }),
  Object.freeze({ key: "source_unavailable", label: "Source could not be read" }),
  Object.freeze({ key: "contact_suppressed", label: "Contact is suppressed" })
]);

// ---------------------------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------------------------
//
// Wave 0 decision B5, ratified in the Wave 1 prompt: no fifth role. These three capability
// names express the RCAP semantics over the existing four roles. They are registered in
// scripts/roles.mjs; this constant exists so the RCAP modules and their tests refer to one
// spelling. A capability string that is not in roles.mjs silently denies EVERY role
// (the live `prospects` route carried exactly that bug), so the suite asserts registration.

export const RCAP_CAPABILITIES = Object.freeze({
  read: "read_rcap_prospects",
  manage: "manage_rcap_prospects",
  approve: "approve_rcap_prospect_work"
});
