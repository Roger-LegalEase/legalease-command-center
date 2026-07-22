import { recordVisibleToActor } from "./global-search-service.mjs";
import { isSuppressed, normalizeEmail } from "./outreach-os.mjs";
import { prospectKeys, scoreCandidate } from "./prospect-discovery.mjs";
import {
  contactOnHold,
  evaluateThresholds,
  reactivationCampaignOf,
  waveMetrics
} from "./reactivation-os.mjs";
import {
  REACTIVATION_CADENCE_DAYS,
  REACTIVATION_SEQUENCE_IDS,
  getReactivationSequence,
  sequenceIdForContact
} from "./reactivation-sequences.mjs";
import { normalizeRole, roleHasCapability } from "./roles.mjs";

const DAY_MS = 86_400_000;

export const AUTOMATION_CONTROL_LANES = Object.freeze([
  "Reactivation",
  "Partner prospect outreach",
  "Press outreach"
]);

export const AUTOMATION_REVIEW_POSTURE = Object.freeze({
  reviewOnly:true,
  mutationsAvailable:false,
  liveControlsAvailable:false,
  activationAvailable:false,
  releaseAvailable:false,
  sendAvailable:false,
  enrollmentAvailable:false,
  suppressionRemovalAvailable:false,
  providerCalls:0,
  externalActions:0
});

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function timestamp(value = "") {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function text(value = "", fallback = "", maximum = 500, { redactEmail = false } = {}) {
  let result = clean(value || fallback)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/<\s*\/?\s*(?:script|iframe|object|embed|svg)[^>]*>/giu, " ")
    .replace(/\b(?:state mutation|provider payload|collection|engine execution)\b/giu, "update")
    .replace(/\s+/g, " ")
    .trim();
  if (redactEmail) result = result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[contact]");
  if (!result) result = clean(fallback);
  return result.length > maximum ? `${result.slice(0, maximum - 1).trimEnd()}…` : result;
}

function contextFor(actor = {}) {
  const role = normalizeRole(actor.role);
  const authenticated = actor?.authenticated === true && Boolean(clean(actor.id));
  return {
    role,
    id:clean(actor.id),
    allowed:authenticated && roleHasCapability(role, "read_internal") && roleHasCapability(role, "read_sensitive")
  };
}

function present(state = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(state, key);
}

function visible(state = {}, collection = "", role = "viewer") {
  return list(state[collection]).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role));
}

function idOf(record = {}) {
  return clean(record.id || record.contact_id || record.campaign_id || record.account_id || record.organization_id || record.slug);
}

function emailOf(record = {}) {
  return normalizeEmail(record.email || record.contact_email || record.public_email || record.from_email || record.to);
}

function campaignIdOf(record = {}) {
  return clean(record.campaign_id || record.campaignId || record.relatedCampaignId || record.campaign?.id);
}

function contactIdOf(record = {}) {
  return clean(record.contact_id || record.contactId || record.relatedContactId || record.source_contact_id);
}

function organizationIdOf(record = {}) {
  return clean(record.linked_account_id || record.account_id || record.organization_id || record.organizationId);
}

function organizationName(record = {}) {
  return text(record.organization_name || record.organizationName || record.organization || record.publication || record.company || record.name, "", 160);
}

function contactName(record = {}) {
  return text(record.contact_name || record.contactName || record.full_name || record.fullName || record.journalist || record.name, "", 120);
}

function recordDate(record = {}) {
  return timestamp(record.updated_at || record.updatedAt || record.created_at || record.createdAt || record.sent_at || record.receivedAt);
}

function matchesIdentity(record = {}, contact = {}) {
  const recordContactId = contactIdOf(record);
  const contactId = contactIdOf(contact) || idOf(contact);
  const recordEmail = emailOf(record);
  const contactEmail = emailOf(contact);
  return Boolean((recordContactId && contactId && recordContactId === contactId)
    || (recordEmail && contactEmail && recordEmail === contactEmail));
}

function matchesCampaign(record = {}, campaignId = "") {
  return Boolean(campaignId && campaignIdOf(record) === campaignId);
}

function countStatuses(records = []) {
  const byStatus = {};
  for (const record of records) {
    const status = lower(record.status || record.state || record.event || record.type || "unknown") || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  return { total:records.length, byStatus };
}

function claimSummary(records = [], nowMs = Date.now()) {
  const summary = { total:records.length, claimed:0, sent:0, failed:0, dryRun:0, unconfirmed:0 };
  for (const record of records) {
    const status = lower(record.status);
    if (status === "claimed") {
      summary.claimed += 1;
      const claimedAt = Date.parse(record.claimed_at || record.claimedAt || "");
      if (Number.isFinite(claimedAt) && nowMs - claimedAt > 15 * 60 * 1000) summary.unconfirmed += 1;
    } else if (status === "sent") summary.sent += 1;
    else if (status === "failed") summary.failed += 1;
    else if (status === "dry_run") summary.dryRun += 1;
  }
  return summary;
}

function approvalState(record = {}) {
  const status = lower(record.status || record.state || record.decision || record.approvalStatus || record.approval_status);
  if (["approved", "executed", "verified"].includes(status)) return "Approved";
  if (["rejected", "denied", "changes_requested"].includes(status)) return "Changes requested";
  if (["pending", "requested", "needs_review", "queued_for_approval", "awaiting_approval"].includes(status)) return "Needs review";
  return "Unavailable";
}

function relatedApprovals(state = {}, role = "viewer", identifiers = []) {
  const ids = new Set(identifiers.map(clean).filter(Boolean));
  return [
    ...visible(state, "approvalQueue", role),
    ...visible(state, "approvals", role),
    ...visible(state, "outreachApprovalQueue", role)
  ].filter((record) => [
    idOf(record),
    campaignIdOf(record),
    contactIdOf(record),
    clean(record.resourceId || record.resource_id || record.relatedEntityId || record.sourceId)
  ].some((id) => id && ids.has(id)));
}

function approvedByRecordOrApproval(record = {}, approvals = []) {
  if (record.approved === true || record.contentApproved === true || record.pitchApproved === true) return true;
  if (approvalState(record) === "Approved") return true;
  return approvals.some((approval) => approvalState(approval) === "Approved");
}

function readiness({ available = true, blockers = [], warnings = [] } = {}) {
  const cleanBlockers = blockers.map((item) => text(item, "", 240, { redactEmail:true })).filter(Boolean);
  const cleanWarnings = warnings.map((item) => text(item, "", 240, { redactEmail:true })).filter(Boolean);
  return {
    state:!available ? "Unavailable" : cleanBlockers.length ? "Needs attention" : "Ready for review",
    readyForFutureActivationReview:available && cleanBlockers.length === 0,
    blockers:cleanBlockers,
    warnings:cleanWarnings,
    actualActivationAvailable:false
  };
}

function suppressionView(result = {}) {
  const labels = {
    do_not_contact:"Do not contact",
    replied:"Replied",
    unsubscribed:"Unsubscribed",
    bounced:"Bounced",
    existing_customer:"Existing relationship",
    manually_suppressed:"Suppressed",
    bad_domain:"Invalid or ineligible address",
    duplicate:"Duplicate"
  };
  return {
    suppressed:result.suppressed === true,
    reason:result.suppressed ? labels[result.reason] || "Not eligible" : null,
    reasonCode:result.suppressed ? clean(result.reason) : null
  };
}

function sequenceApproval(state = {}, role = "viewer", campaignId = "", steps = []) {
  const approvals = relatedApprovals(state, role, [campaignId, ...steps.map(idOf)]);
  const first = steps.slice().sort((left, right) => Number(left.step_number || left.stepNumber || 0) - Number(right.step_number || right.stepNumber || 0))[0] || null;
  if (!first) return { status:"Unavailable", subject:null, body:null, draftPreview:null, sourceId:null };
  const approved = approvedByRecordOrApproval(first, approvals);
  const body = text(first.body || first.bodyText || first.copy || first.pitch, "", 2000);
  return {
    status:approved ? "Approved" : "Needs review",
    subject:text(first.subject, "", 240) || null,
    body:approved ? body || null : null,
    draftPreview:approved ? null : text(body, "", 360) || null,
    sourceId:idOf(first) || null
  };
}

function thresholdReason(value = "") {
  return text(value, "", 240)
    .replace(/hard_bounce/giu, "hard bounces")
    .replace(/spam_complaint/giu, "spam complaints")
    .replace(/unsubscribe/giu, "unsubscribes")
    .replace(/>=/g, "reached the limit of");
}

function reactivationApprovedContent(state = {}, context = {}) {
  const campaign = state.reactivationCampaign || {};
  const campaignApproval = approvalState(campaign);
  const approvedIds = new Set(list(campaign.approvedContentIds || campaign.approved_content_ids).map(clean));
  const contentApprovals = visible(state, "reactivationContentApprovals", context.role);
  return REACTIVATION_SEQUENCE_IDS.map((sequenceId) => {
    const sequence = getReactivationSequence(sequenceId);
    return {
      id:sequenceId,
      label:sequenceId === "reactivation_never_logged_in" ? "Never logged in" : "Previously logged in",
      cadenceDays:[...REACTIVATION_CADENCE_DAYS],
      touches:sequence.touches.map((touch) => {
        const touchId = `${sequenceId}:touch:${touch.step_number}`;
        const approval = contentApprovals.find((record) => clean(record.sequenceId || record.sequence_id) === sequenceId
          && Number(record.touchNumber || record.step_number) === Number(touch.step_number));
        const approved = campaign.contentApproved === true
          || campaignApproval === "Approved"
          || approvedIds.has(touchId)
          || approvalState(approval || {}) === "Approved";
        return {
          id:touchId,
          touch:Number(touch.step_number),
          day:Number(touch.day),
          subject:text(touch.subject, "", 240),
          approval:approved ? "Approved" : "Needs review",
          bodyPreview:text(touch.body, "", approved ? 500 : 240)
        };
      })
    };
  });
}

function contactAttempts(records = [], contact = {}, campaignId = "") {
  return records.filter((record) => matchesIdentity(record, contact) && (!campaignId || !campaignIdOf(record) || matchesCampaign(record, campaignId)));
}

function reactivationContactView(state = {}, context = {}, contact = {}, config = {}, nowMs = 0) {
  const attempts = contactAttempts(visible(state, "reactivationAttempts", context.role), contact, config.campaignId);
  const replies = [
    ...visible(state, "reactivationReplies", context.role),
    ...visible(state, "outreachReplies", context.role)
  ].filter((record) => matchesIdentity(record, contact) && (!campaignIdOf(record) || campaignIdOf(record) === config.campaignId));
  const suppression = suppressionView(isSuppressed(contact, { state }));
  const paused = Boolean(contact.replied || contact.clicked || contact.converted || contact.unsubscribed || contact.bounced || contact.complained || contact.do_not_contact);
  const held = contactOnHold(contact);
  const sequenceId = sequenceIdForContact(contact);
  const sequence = getReactivationSequence(sequenceId);
  const completedAttempts = attempts.filter((record) => ["sent", "delivered", "dry_run"].includes(lower(record.status))).length;
  const nextTouch = sequence.touches[Math.min(completedAttempts, sequence.touches.length - 1)] || null;
  const enrolledAt = Date.parse(contact.enrolled_at || contact.enrolledAt || "");
  const dueAt = nextTouch && Number.isFinite(enrolledAt)
    ? new Date(enrolledAt + Number(nextTouch.day) * DAY_MS).toISOString()
    : "";
  const released = list(config.releasedWaves).map(Number).includes(Number(contact.wave));
  const eligible = !held && !suppression.suppressed && !paused;
  return {
    id:contactIdOf(contact) || idOf(contact),
    name:contactName(contact) || "Customer",
    email:emailOf(contact) || null,
    wave:Number(contact.wave) || null,
    released,
    held,
    eligible,
    enrolled:Boolean(contact.enrolled_at || contact.enrolledAt),
    sequence:{ id:sequenceId, nextTouch:nextTouch ? Number(nextTouch.step_number) : null },
    nextDueAt:dueAt || null,
    dueNow:Boolean(dueAt && Date.parse(dueAt) <= nowMs && eligible && released),
    suppression,
    pausedSignals:{
      replied:Boolean(contact.replied || replies.length),
      clicked:Boolean(contact.clicked),
      converted:Boolean(contact.converted),
      bounced:Boolean(contact.bounced),
      complained:Boolean(contact.complained),
      unsubscribed:Boolean(contact.unsubscribed)
    },
    attempts:countStatuses(attempts),
    replies:replies.length,
    lastUpdatedAt:recordDate(contact) || null
  };
}

function buildReactivationLane(state = {}, context = {}, nowIso = "") {
  const available = present(state, "reactivationContacts") || present(state, "reactivationCampaign");
  const config = reactivationCampaignOf(state);
  const now = new Date(nowIso);
  const nowMs = now.getTime();
  const contacts = visible(state, "reactivationContacts", context.role).map((contact) => reactivationContactView(state, context, contact, config, nowMs));
  const attempts = visible(state, "reactivationAttempts", context.role);
  const events = visible(state, "reactivationEvents", context.role);
  const replies = visible(state, "reactivationReplies", context.role);
  const claims = visible(state, "reactivationSendClaims", context.role);
  const threshold = evaluateThresholds(state, config, { now });
  const sequences = reactivationApprovedContent(state, context);
  const approvedTouches = sequences.flatMap((sequence) => sequence.touches).filter((touch) => touch.approval === "Approved").length;
  const suppressionReasons = {};
  for (const contact of contacts.filter((entry) => entry.suppression.suppressed)) {
    const reason = contact.suppression.reason || "Not eligible";
    suppressionReasons[reason] = (suppressionReasons[reason] || 0) + 1;
  }
  const metric = (types) => events.filter((event) => types.includes(lower(event.type || event.event))).length;
  const replyIdentities = new Set();
  for (const reply of replies) replyIdentities.add(contactIdOf(reply) || emailOf(reply) || idOf(reply));
  for (const contact of contacts.filter((entry) => entry.pausedSignals.replied)) replyIdentities.add(contact.id || contact.email);
  replyIdentities.delete("");
  const storedLive = state.reactivationCampaign?.liveMode?.enabled === true
    || state.autopilotSettings?.["reactivation-sequencer"]?.enabled === true;
  const blockers = [];
  if (!contacts.length) blockers.push("No reactivation audience is available.");
  if (!approvedTouches) blockers.push("Reactivation copy still needs approval.");
  if (threshold.tripped) blockers.push("A safety threshold needs attention.");
  const warnings = [];
  if (storedLive) warnings.push("Stored automation settings indicate an active control. This review surface cannot change it.");
  if (lower(config.status) === "paused" && config.pausedReason) warnings.push(`Campaign is paused: ${config.pausedReason}`);
  return {
    id:"reactivation",
    label:"Reactivation",
    availability:available ? "Available" : "Unavailable",
    storedState:text(config.status, "Staged", 80),
    readiness:readiness({ available, blockers, warnings }),
    audience:{
      total:contacts.length,
      eligible:contacts.filter((contact) => contact.eligible).length,
      dueNow:contacts.filter((contact) => contact.dueNow).length,
      held:contacts.filter((contact) => contact.held).length,
      suppressed:contacts.filter((contact) => contact.suppression.suppressed).length,
      suppressionReasons
    },
    sequence:{ cadenceDays:[...REACTIVATION_CADENCE_DAYS], variants:sequences, approvedTouches },
    activity:{
      attempts:countStatuses(attempts),
      replies:replyIdentities.size,
      delivered:metric(["delivered"]),
      bounces:metric(["bounce", "dropped", "blocked"]),
      complaints:metric(["spamreport", "complaint"]),
      unsubscribes:metric(["unsubscribe", "group_unsubscribe"]),
      clicks:metric(["click"]),
      claims:claimSummary(claims, nowMs),
      waves:waveMetrics(state)
    },
    threshold:{
      state:threshold.tripped ? "Needs attention" : threshold.belowSample ? "Monitoring" : "Within limits",
      tripped:threshold.tripped,
      belowSample:threshold.belowSample,
      reasons:threshold.reasons.map(thresholdReason),
      rates:{
        sent:threshold.rates.sent,
        hardBounce:threshold.rates.hard_bounce,
        spamComplaint:threshold.rates.spam_complaint,
        unsubscribe:threshold.rates.unsubscribe,
        windowDays:threshold.rates.windowDays
      },
      limits:{
        hardBounce:Number(config.thresholds?.hard_bounce),
        spamComplaint:Number(config.thresholds?.spam_complaint),
        unsubscribe:Number(config.thresholds?.unsubscribe),
        minimumSample:Number(config.minSampleSize)
      }
    },
    contacts:contacts.slice(0, 200),
    posture:AUTOMATION_REVIEW_POSTURE
  };
}

function pressRecord(record = {}) {
  return /\bpress|media|journalist|reporter|publication|newsroom|editorial|public relations|pr outreach\b/u.test(lower([
    record.campaignType,
    record.campaign_type,
    record.type,
    record.category,
    record.classification,
    record.relationshipCategory,
    record.contactType,
    record.organizationType,
    record.publication,
    record.journalist,
    record.beat,
    record.name,
    record.campaignName,
    record.campaign_name
  ].join(" ")));
}

function campaignCollections(state = {}, context = {}) {
  return [
    ...visible(state, "outreachCampaigns", context.role).map((record) => ({ ...record, _sourceCollection:"outreachCampaigns" })),
    ...visible(state, "campaigns", context.role).map((record) => ({ ...record, _sourceCollection:"campaigns" }))
  ];
}

function outreachOrganization(state = {}, context = {}, contact = {}) {
  const id = organizationIdOf(contact);
  const organizations = visible(state, "outreachOrganizations", context.role);
  return organizations.find((record) => id && idOf(record) === id)
    || organizations.find((record) => organizationName(record) && lower(organizationName(record)) === lower(organizationName(contact)))
    || {};
}

function outreachRepliesFor(state = {}, context = {}, contact = {}, campaignId = "") {
  return [
    ...visible(state, "outreachReplies", context.role),
    ...visible(state, "campaignReplies", context.role)
  ].filter((record) => matchesIdentity(record, contact) && (!campaignId || !campaignIdOf(record) || matchesCampaign(record, campaignId)));
}

function outreachAttemptsFor(state = {}, context = {}, contact = {}, campaignId = "") {
  return visible(state, "outreachAttempts", context.role)
    .filter((record) => matchesIdentity(record, contact) && (!campaignId || !campaignIdOf(record) || matchesCampaign(record, campaignId)));
}

function sequenceForCampaign(state = {}, context = {}, campaign = {}, contact = {}) {
  const campaignId = campaignIdOf(campaign) || idOf(campaign) || campaignIdOf(contact);
  return visible(state, "outreachSequenceSteps", context.role)
    .filter((step) => matchesCampaign(step, campaignId)
      || (clean(step.sequence_id || step.sequenceId) && clean(step.sequence_id || step.sequenceId) === clean(contact.sequence_id || contact.sequenceId)))
    .sort((left, right) => Number(left.step_number || left.stepNumber || 0) - Number(right.step_number || right.stepNumber || 0));
}

function existingProspectKeys(state = {}, context = {}) {
  const keys = new Set();
  for (const record of [
    ...visible(state, "outreachOrganizations", context.role),
    ...visible(state, "partners", context.role)
  ]) {
    prospectKeys({
      organization_name:organizationName(record),
      domain:record.domain || record.website,
      email:emailOf(record),
      ein:record.ein
    }).forEach((key) => keys.add(key));
  }
  return keys;
}

function matchingOutreachContact(state = {}, context = {}, candidate = {}) {
  const candidateId = idOf(candidate);
  const candidateEmail = emailOf(candidate);
  const candidateOrg = lower(organizationName(candidate));
  return visible(state, "outreachContacts", context.role).find((contact) =>
    clean(contact.source_prospect_id || contact.prospectCandidateId || contact.prospect_id) === candidateId
      || (candidateEmail && emailOf(contact) === candidateEmail)
      || (candidateOrg && lower(organizationName(contact)) === candidateOrg)
  ) || null;
}

function matchingPartnerCampaign(state = {}, context = {}, candidate = {}, contact = {}) {
  const campaigns = campaignCollections(state, context).filter((campaign) => !pressRecord(campaign));
  const campaignId = campaignIdOf(contact);
  return campaigns.find((campaign) => campaignId && (campaignIdOf(campaign) || idOf(campaign)) === campaignId)
    || campaigns.find((campaign) => lower(campaign.classification) === lower(candidate.classification))
    || campaigns.find((campaign) => /partner|outreach/u.test(lower(campaign.campaignType || campaign.campaign_type || campaign.type)))
    || null;
}

function partnerCandidateView(state = {}, context = {}, candidate = {}, existingKeys = new Set()) {
  const contact = matchingOutreachContact(state, context, candidate) || {};
  const campaign = matchingPartnerCampaign(state, context, candidate, contact) || {};
  const organization = outreachOrganization(state, context, contact);
  const campaignId = campaignIdOf(campaign) || idOf(campaign) || campaignIdOf(contact);
  const steps = sequenceForCampaign(state, context, campaign, contact);
  const approvals = relatedApprovals(state, context.role, [idOf(candidate), idOf(contact), campaignId, ...steps.map(idOf)]);
  const firstTouch = sequenceApproval(state, context.role, campaignId, steps);
  const suppression = suppressionView(isSuppressed(Object.keys(contact).length ? contact : candidate, { state, org:organization }));
  const keys = prospectKeys(candidate);
  const existingRelationship = keys.some((key) => existingKeys.has(key));
  const duplicate = candidate.is_duplicate === true;
  const replies = outreachRepliesFor(state, context, contact, campaignId);
  const attempts = outreachAttemptsFor(state, context, contact, campaignId);
  const score = Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : scoreCandidate(candidate);
  const reviewState = lower(candidate.review_state || candidate.reviewState || candidate.status) || "pending_review";
  let nextAction = "Review fit and contact details.";
  if (duplicate || existingRelationship) nextAction = "Resolve the duplicate or existing relationship before outreach.";
  else if (replies.length) nextAction = "Review the reply and set the relationship next action.";
  else if (suppression.suppressed) nextAction = "Review the ineligibility reason. Do not contact this person.";
  else if (firstTouch.status !== "Approved") nextAction = "Review and approve the first-touch copy.";
  else if (!emailOf(contact) && !emailOf(candidate)) nextAction = "Add a verified contact before activation review.";
  else nextAction = "Ready for a controlled activation review.";
  return {
    id:idOf(candidate),
    organization:organizationName(candidate) || organizationName(organization) || "Organization",
    fitReason:text(candidate.fit_reason || candidate.fitReason || candidate.match_reason || candidate.description || candidate.ntee_label, "No fit reason recorded.", 400),
    score,
    reviewState:text(reviewState.replace(/_/g, " "), "Needs review", 80),
    contact:{
      id:idOf(contact) || null,
      name:contactName(contact) || contactName(candidate) || null,
      email:emailOf(contact) || emailOf(candidate) || null
    },
    duplicateOrExisting:{ duplicate, existingRelationship, clear:!duplicate && !existingRelationship },
    suppression,
    campaign:{ id:campaignId || null, name:text(campaign.campaign_name || campaign.campaignName || campaign.name, "", 160) || null },
    firstTouch,
    sequence:steps.map((step) => ({
      id:idOf(step) || null,
      touch:Number(step.step_number || step.stepNumber) || null,
      delayDays:Number(step.delay_days || step.delayDays || step.day) || 0,
      subject:text(step.subject, "", 240),
      approval:approvedByRecordOrApproval(step, approvals) ? "Approved" : "Needs review"
    })),
    attempts:countStatuses(attempts),
    replies:replies.map((reply) => ({
      id:idOf(reply),
      state:text(reply.classification || reply.replyState || reply.status, "Received", 80),
      summary:text(reply.summary || reply.snippet, "Reply received.", 320, { redactEmail:true }),
      receivedAt:recordDate(reply) || null
    })).slice(0, 20),
    nextAction,
    posture:AUTOMATION_REVIEW_POSTURE
  };
}

function buildPartnerProspectLane(state = {}, context = {}, nowIso = "") {
  const available = present(state, "prospectCandidates") || present(state, "outreachContacts");
  const existingKeys = existingProspectKeys(state, context);
  const candidates = visible(state, "prospectCandidates", context.role)
    .filter((candidate) => !pressRecord(candidate))
    .map((candidate) => partnerCandidateView(state, context, candidate, existingKeys))
    .sort((left, right) => right.score - left.score || left.organization.localeCompare(right.organization, "en-US"));
  const campaigns = campaignCollections(state, context).filter((campaign) => !pressRecord(campaign));
  const claims = visible(state, "outreachSendClaims", context.role).filter((claim) => {
    const campaignId = campaignIdOf(claim);
    return !campaignId || campaigns.some((campaign) => (campaignIdOf(campaign) || idOf(campaign)) === campaignId);
  });
  const blockers = [];
  if (!candidates.length) blockers.push("No Partner prospects are available for review.");
  if (candidates.length && !candidates.some((candidate) => candidate.contact.email)) blockers.push("No verified prospect contact is available.");
  if (candidates.length && !candidates.some((candidate) => candidate.firstTouch.status === "Approved")) blockers.push("First-touch copy still needs approval.");
  const unresolved = candidates.filter((candidate) => !candidate.duplicateOrExisting.clear || candidate.suppression.suppressed).length;
  const warnings = unresolved ? [`${unresolved} prospect${unresolved === 1 ? "" : "s"} need duplicate or eligibility review.`] : [];
  const storedLive = campaigns.some((campaign) => campaign.liveMode === true || campaign.sendingEnabled === true || ["active", "running"].includes(lower(campaign.status)));
  if (storedLive) warnings.push("A stored campaign is marked active. This review surface cannot release or send it.");
  return {
    id:"partner-prospect-outreach",
    label:"Partner prospect outreach",
    availability:available ? "Available" : "Unavailable",
    storedState:storedLive ? "Active record present" : campaigns.length ? "Staged" : "Unavailable",
    readiness:readiness({ available, blockers, warnings }),
    summary:{
      candidates:candidates.length,
      pendingReview:candidates.filter((candidate) => /pending|review/u.test(lower(candidate.reviewState))).length,
      contactable:candidates.filter((candidate) => candidate.contact.email && candidate.duplicateOrExisting.clear && !candidate.suppression.suppressed).length,
      duplicatesOrExisting:candidates.filter((candidate) => !candidate.duplicateOrExisting.clear).length,
      suppressedOrIneligible:candidates.filter((candidate) => candidate.suppression.suppressed).length,
      replies:candidates.reduce((sum, candidate) => sum + candidate.replies.length, 0),
      campaigns:campaigns.length,
      claims:claimSummary(claims, Date.parse(nowIso))
    },
    candidates:candidates.slice(0, 250),
    posture:AUTOMATION_REVIEW_POSTURE
  };
}

function pressCampaignsAndContacts(state = {}, context = {}) {
  const campaigns = campaignCollections(state, context).filter(pressRecord);
  const campaignIds = new Set(campaigns.map((campaign) => campaignIdOf(campaign) || idOf(campaign)).filter(Boolean));
  const possible = [
    ...visible(state, "outreachContacts", context.role),
    ...visible(state, "companyContacts", context.role),
    ...visible(state, "prospectCandidates", context.role)
  ].filter((contact) => pressRecord(contact) || (campaignIdOf(contact) && campaignIds.has(campaignIdOf(contact))));
  const seen = new Set();
  const contacts = possible.filter((contact) => {
    const key = emailOf(contact) || idOf(contact);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { campaigns, contacts };
}

function matchingPressCampaign(campaigns = [], contact = {}) {
  const id = campaignIdOf(contact);
  return campaigns.find((campaign) => id && (campaignIdOf(campaign) || idOf(campaign)) === id) || campaigns[0] || {};
}

function approvedFacts(contact = {}, campaign = {}, organization = {}) {
  const raw = contact.approvedFacts || contact.approved_facts || campaign.approvedFacts || campaign.approved_facts || organization.approvedFacts;
  return (Array.isArray(raw) ? raw : clean(raw) ? [raw] : []).map((fact) => text(fact, "", 500)).filter(Boolean).slice(0, 20);
}

function pitchRecord(contact = {}, campaign = {}) {
  const pitch = contact.pitch && typeof contact.pitch === "object" ? contact.pitch
    : campaign.pitch && typeof campaign.pitch === "object" ? campaign.pitch : {};
  return {
    subject:text(pitch.subject || contact.pitchSubject || contact.pitch_subject || campaign.pitchSubject, "", 240),
    body:text(pitch.body || pitch.copy || contact.pitchBody || contact.pitch_body || (typeof contact.pitch === "string" ? contact.pitch : "") || campaign.pitchBody, "", 2500),
    status:approvalState(pitch.status ? pitch : contact.pitchApproved || contact.approvalStatus ? contact : campaign)
  };
}

function pressContactView(state = {}, context = {}, contact = {}, campaigns = []) {
  const campaign = matchingPressCampaign(campaigns, contact);
  const campaignId = campaignIdOf(campaign) || idOf(campaign) || campaignIdOf(contact);
  const organization = outreachOrganization(state, context, contact);
  const steps = sequenceForCampaign(state, context, campaign, contact);
  const approvals = relatedApprovals(state, context.role, [idOf(contact), campaignId, ...steps.map(idOf)]);
  const pitch = pitchRecord(contact, campaign);
  if (pitch.status === "Unavailable" && approvedByRecordOrApproval(contact, approvals)) pitch.status = "Approved";
  const suppression = suppressionView(isSuppressed(contact, { state, org:organization }));
  const attempts = outreachAttemptsFor(state, context, contact, campaignId);
  const replies = outreachRepliesFor(state, context, contact, campaignId);
  const sequence = steps.map((step) => ({
    id:idOf(step) || null,
    touch:Number(step.step_number || step.stepNumber) || null,
    delayDays:Number(step.delay_days || step.delayDays || step.day) || 0,
    subject:text(step.subject, "", 240),
    approval:approvedByRecordOrApproval(step, approvals) ? "Approved" : "Needs review"
  }));
  let nextAction = "Review the journalist and story angle.";
  if (replies.length) nextAction = "Review the reply and record the coverage outcome or next follow-up.";
  else if (suppression.suppressed) nextAction = "Review the ineligibility reason. Do not contact this person.";
  else if (!pitch.body) nextAction = "Draft the pitch for review.";
  else if (pitch.status !== "Approved") nextAction = "Review and approve the pitch.";
  else if (!approvedFacts(contact, campaign, organization).length) nextAction = "Add approved facts before activation review.";
  else nextAction = "Ready for a controlled activation review.";
  return {
    id:idOf(contact),
    publication:text(contact.publication || organization.publication || organizationName(organization) || organizationName(contact), "Publication unavailable", 180),
    journalist:contactName(contact) || "Journalist unavailable",
    email:emailOf(contact) || null,
    beat:text(contact.beat || organization.beat || campaign.beat, "Beat unavailable", 140),
    recentRelevantCoverage:text(contact.recentRelevantCoverage || contact.recent_relevant_coverage || contact.recentCoverage || organization.recentCoverage, "", 800) || null,
    storyAngle:text(contact.storyAngle || contact.story_angle || campaign.storyAngle || campaign.story_angle, "", 800) || null,
    approvedFacts:approvedFacts(contact, campaign, organization),
    pitch:{ ...pitch, subject:pitch.subject || null, body:pitch.body || null },
    followUpSequence:sequence,
    coverageResult:text(contact.coverageResult || contact.coverage_result || campaign.coverageResult, "", 500) || null,
    campaign:{ id:campaignId || null, name:text(campaign.campaignName || campaign.campaign_name || campaign.name, "", 180) || null },
    suppression,
    attempts:countStatuses(attempts),
    replies:replies.map((reply) => ({
      id:idOf(reply),
      state:text(reply.classification || reply.replyState || reply.status, "Received", 80),
      summary:text(reply.summary || reply.snippet, "Reply received.", 400, { redactEmail:true }),
      receivedAt:recordDate(reply) || null
    })).slice(0, 20),
    nextAction,
    posture:AUTOMATION_REVIEW_POSTURE
  };
}

function buildPressLane(state = {}, context = {}, nowIso = "") {
  const { campaigns, contacts:sourceContacts } = pressCampaignsAndContacts(state, context);
  const available = present(state, "outreachContacts") || present(state, "companyContacts") || present(state, "campaigns") || present(state, "outreachCampaigns");
  const contacts = sourceContacts.map((contact) => pressContactView(state, context, contact, campaigns))
    .sort((left, right) => left.publication.localeCompare(right.publication, "en-US") || left.journalist.localeCompare(right.journalist, "en-US"));
  const campaignIds = new Set(campaigns.map((campaign) => campaignIdOf(campaign) || idOf(campaign)).filter(Boolean));
  const claims = visible(state, "outreachSendClaims", context.role).filter((claim) => campaignIds.has(campaignIdOf(claim)));
  const blockers = [];
  if (!contacts.length) blockers.push("No press contacts are available for review.");
  if (contacts.length && !contacts.some((contact) => contact.pitch.body)) blockers.push("No press pitch is available for review.");
  if (contacts.length && !contacts.some((contact) => contact.pitch.status === "Approved")) blockers.push("Press pitch copy still needs approval.");
  if (contacts.length && !contacts.some((contact) => contact.approvedFacts.length)) blockers.push("Approved facts are missing from the press lane.");
  const incomplete = contacts.filter((contact) => !contact.storyAngle || contact.beat === "Beat unavailable" || !contact.recentRelevantCoverage).length;
  const warnings = incomplete ? [`${incomplete} press contact${incomplete === 1 ? "" : "s"} need research context completed.`] : [];
  const storedLive = campaigns.some((campaign) => campaign.liveMode === true || campaign.sendingEnabled === true || ["active", "running"].includes(lower(campaign.status)));
  if (storedLive) warnings.push("A stored press campaign is marked active. This review surface cannot release or send it.");
  return {
    id:"press-outreach",
    label:"Press outreach",
    availability:available ? "Available" : "Unavailable",
    storedState:storedLive ? "Active record present" : campaigns.length ? "Staged" : contacts.length ? "Contacts only" : "Unavailable",
    readiness:readiness({ available, blockers, warnings }),
    summary:{
      campaigns:campaigns.length,
      contacts:contacts.length,
      pitchesApproved:contacts.filter((contact) => contact.pitch.body && contact.pitch.status === "Approved").length,
      pitchesNeedingReview:contacts.filter((contact) => contact.pitch.body && contact.pitch.status !== "Approved").length,
      suppressedOrIneligible:contacts.filter((contact) => contact.suppression.suppressed).length,
      replies:contacts.reduce((sum, contact) => sum + contact.replies.length, 0),
      coverageRecorded:contacts.filter((contact) => contact.coverageResult).length,
      claims:claimSummary(claims, Date.parse(nowIso))
    },
    contacts:contacts.slice(0, 250),
    posture:AUTOMATION_REVIEW_POSTURE
  };
}

export function buildAutomationControlCenterView(state = {}, actor = {}, now = new Date().toISOString()) {
  const context = contextFor(actor);
  const generatedAt = timestamp(now);
  if (!context.allowed || !generatedAt) {
    return deepFreeze({
      ok:Boolean(generatedAt),
      authorized:false,
      available:false,
      generatedAt:generatedAt || null,
      mode:"Review only",
      laneLabels:AUTOMATION_CONTROL_LANES,
      lanes:[],
      posture:AUTOMATION_REVIEW_POSTURE
    });
  }
  const lanes = [
    buildReactivationLane(state, context, generatedAt),
    buildPartnerProspectLane(state, context, generatedAt),
    buildPressLane(state, context, generatedAt)
  ];
  return deepFreeze({
    ok:true,
    authorized:true,
    available:true,
    generatedAt,
    mode:"Review only",
    laneLabels:AUTOMATION_CONTROL_LANES,
    summary:{
      readyForReview:lanes.filter((lane) => lane.readiness.state === "Ready for review").length,
      needsAttention:lanes.filter((lane) => lane.readiness.state === "Needs attention").length,
      unavailable:lanes.filter((lane) => lane.readiness.state === "Unavailable").length
    },
    lanes,
    posture:AUTOMATION_REVIEW_POSTURE
  });
}
