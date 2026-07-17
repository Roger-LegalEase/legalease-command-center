import { collectCampaignSourceContexts } from "./campaign-sources.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const CAMPAIGN_TYPE_CONTRACT = Object.freeze({
  partner_outreach: Object.freeze({ key: "partner_outreach", label: "Partner outreach" }),
  customer_reengagement: Object.freeze({ key: "customer_reengagement", label: "Customer re-engagement" }),
  announcement: Object.freeze({ key: "announcement", label: "Announcement" })
});

export const CAMPAIGN_DELIVERY_MODE_CONTRACT = Object.freeze({
  one_time_message: Object.freeze({ key: "one_time_message", label: "One-time message" }),
  follow_up_sequence: Object.freeze({ key: "follow_up_sequence", label: "Follow-up sequence" })
});

export const CAMPAIGN_STATUS_CONTRACT = Object.freeze({
  draft: Object.freeze({ key: "draft", label: "Draft" }),
  scheduled: Object.freeze({ key: "scheduled", label: "Scheduled" }),
  active: Object.freeze({ key: "active", label: "Active" }),
  paused: Object.freeze({ key: "paused", label: "Paused" }),
  completed: Object.freeze({ key: "completed", label: "Completed" })
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function hasOwn(record, field) {
  return Object.prototype.hasOwnProperty.call(record || {}, field);
}

function firstText(...values) {
  return values.map(clean).find(Boolean) || "";
}

function firstBoolean(record = {}, fields = []) {
  for (const field of fields) if (hasOwn(record, field) && typeof record[field] === "boolean") return record[field];
  return null;
}

function firstNumber(record = {}, fields = []) {
  for (const field of fields) {
    if (!hasOwn(record, field) || record[field] === "" || record[field] === null) continue;
    const value = Number(record[field]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function validTimestamp(value = "") {
  const text = clean(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return "";
  const parseValue = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T00:00:00.000Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text.replace(" ", "T")}Z`;
  return Number.isFinite(Date.parse(parseValue)) ? text : "";
}

function recordId(record = {}) {
  return clean(record.id || record.campaign_id || record.campaignId || record.contact_id || record.key || record.slug);
}

function eventTimestamp(record = {}) {
  return validTimestamp(firstText(
    record.occurredAt, record.occurred_at, record.sentAt, record.sent_at, record.sent_date,
    record.repliedAt, record.replied_at, record.approvedAt, record.approved_at,
    record.decidedAt, record.updatedAt, record.updated_at, record.createdAt, record.created_at
  ));
}

function typeProjection(context) {
  if (context.kind === "partnerOutreach") return CAMPAIGN_TYPE_CONTRACT.partner_outreach;
  if (context.kind === "reactivation") return CAMPAIGN_TYPE_CONTRACT.customer_reengagement;
  const record = context.record;
  const type = lower(record.campaignType || record.campaign_type || record.type).replaceAll(/[ -]+/g, "_");
  if (CAMPAIGN_TYPE_CONTRACT[type]) return CAMPAIGN_TYPE_CONTRACT[type];
  if (firstText(record.partnerId, record.partner_id, record.partnerName, record.partner_name)) {
    return CAMPAIGN_TYPE_CONTRACT.partner_outreach;
  }
  return null;
}

function deliveryModeProjection(context) {
  if (context.kind === "reactivation") return CAMPAIGN_DELIVERY_MODE_CONTRACT.follow_up_sequence;
  const record = context.record;
  const explicit = lower(record.deliveryMode || record.delivery_mode || record.messageMode || record.message_mode)
    .replaceAll(/[ -]+/g, "_");
  if (["one_time", "one_time_message", "single", "single_message", "broadcast"].includes(explicit)) {
    return CAMPAIGN_DELIVERY_MODE_CONTRACT.one_time_message;
  }
  if (["sequence", "follow_up", "follow_up_sequence", "multi_step"].includes(explicit)) {
    return CAMPAIGN_DELIVERY_MODE_CONTRACT.follow_up_sequence;
  }
  const steps = context.kind === "partnerOutreach"
    ? context.sequenceSteps
    : list(record.sequenceSteps || record.sequence_steps || record.steps);
  if (steps.length > 1) return CAMPAIGN_DELIVERY_MODE_CONTRACT.follow_up_sequence;
  if (steps.length === 1) return CAMPAIGN_DELIVERY_MODE_CONTRACT.one_time_message;
  if (firstText(record.message, record.messageSummary, record.message_summary, record.subject)) {
    return CAMPAIGN_DELIVERY_MODE_CONTRACT.one_time_message;
  }
  return null;
}

function statusProjection(record = {}) {
  const sourceStatus = lower(record.status || record.stage || record.state);
  let status = CAMPAIGN_STATUS_CONTRACT.draft;
  if (/complete|completed|closed|finished/.test(sourceStatus)) status = CAMPAIGN_STATUS_CONTRACT.completed;
  else if (/pause|paused|hold|held/.test(sourceStatus)) status = CAMPAIGN_STATUS_CONTRACT.paused;
  else if (/schedule|scheduled|queued_for_release/.test(sourceStatus)) status = CAMPAIGN_STATUS_CONTRACT.scheduled;
  else if (/active|live|running|in_progress|released/.test(sourceStatus)) status = CAMPAIGN_STATUS_CONTRACT.active;
  return { ...status, sourceStatus: sourceStatus || null };
}

function contactExclusionReasons(contact = {}, context) {
  const reasons = [];
  if (contact.do_not_contact === true || contact.doNotContact === true) reasons.push("do_not_contact");
  if (contact.unsubscribed === true || lower(contact.status) === "unsubscribed") reasons.push("unsubscribed");
  if (contact.bounced === true || lower(contact.status) === "bounced") reasons.push("bounced");
  if (contact.complained === true) reasons.push("complained");
  if (contact.replied === true) reasons.push("replied");
  if (contact.is_customer === true || contact.isCustomer === true) reasons.push("existing_customer");
  if (contact.manually_suppressed === true || contact.manuallySuppressed === true || contact.suppressed_at_import === true) reasons.push("suppressed");
  if (contact.campaign_hold === true || contact.campaignHold === true) reasons.push("hold");
  if (contact.is_duplicate === true || contact.isDuplicate === true) reasons.push("duplicate");
  const id = recordId(contact);
  const linked = (records) => records.some((item) => clean(item.contact_id || item.contactId) === id);
  if (linked(context.suppressions || [])) reasons.push("suppressed");
  if (linked(context.unsubscribes || [])) reasons.push("unsubscribed");
  if (linked(context.bounces || [])) reasons.push("bounced");
  return [...new Set(reasons)].sort((left, right) => left.localeCompare(right, "en-US"));
}

function exclusionSummary(context, contacts, contactsAvailable) {
  if (!contactsAvailable) return { count: null, reasons: [] };
  const counts = new Map();
  let excluded = 0;
  for (const contact of contacts) {
    const reasons = contactExclusionReasons(contact, context);
    if (!reasons.length) continue;
    excluded += 1;
    for (const reason of reasons) counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return {
    count: excluded,
    reasons: [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([reason, count]) => ({ reason, count }))
  };
}

function canonicalAudience(context) {
  const record = context.record;
  const recipients = list(record.recipients || record.includedRecipients || record.included_recipients);
  const selected = firstBoolean(record, ["audienceSelected", "audience_selected"]);
  const explicitCount = firstNumber(record, ["recipientCount", "recipient_count", "includedRecipientCount", "included_recipient_count", "audienceCount"]);
  const includedCount = selected === false && !recipients.length
    ? null
    : explicitCount ?? (recipients.length ? recipients.length : null);
  const excludedCount = firstNumber(record, ["excludedRecipientCount", "excluded_recipient_count", "suppressionCount", "suppressedCount"]);
  return {
    available: Boolean(firstText(record.audienceSummary, record.audience_summary, record.targetAudience, record.target_audience)) || includedCount !== null || excludedCount !== null,
    summary: firstText(record.audienceSummary, record.audience_summary, record.targetAudience, record.target_audience) || null,
    includedCount,
    excluded: { count: excludedCount, reasons: [] }
  };
}

function relatedAudience(context) {
  const collection = context.kind === "partnerOutreach" ? "outreachContacts" : "reactivationContacts";
  const available = context.availability[collection] === true;
  const contacts = context.contacts;
  const excluded = exclusionSummary(context, contacts, available);
  return {
    available,
    summary: available ? `${contacts.length} enrolled recipient${contacts.length === 1 ? "" : "s"}` : null,
    includedCount: available ? contacts.length - excluded.count : null,
    excluded
  };
}

function audienceProjection(context) {
  return context.kind === "canonical" ? canonicalAudience(context) : relatedAudience(context);
}

function messageProjection(context, deliveryMode) {
  const record = context.record;
  const steps = context.kind === "partnerOutreach"
    ? context.sequenceSteps
    : list(record.sequenceSteps || record.sequence_steps || record.steps);
  const stepCount = context.kind === "reactivation" ? 5 : steps.length || firstNumber(record, ["stepCount", "step_count"]);
  return {
    available: Boolean(deliveryMode || stepCount || firstText(record.messageSummary, record.message_summary, record.subject, record.sequenceName, record.sequence_name)),
    mode: deliveryMode,
    summary: firstText(record.messageSummary, record.message_summary, record.sequenceSummary, record.sequence_summary) || null,
    sequenceName: firstText(record.sequenceName, record.sequence_name, record.sequenceVariant, record.sequence_variant) || null,
    stepCount: stepCount || null,
    firstSubject: firstText(steps[0]?.subject, record.subject) || null,
    cadenceDays: context.kind === "reactivation" ? [1, 4, 9, 16, 30] : []
  };
}

function scheduleProjection(context, status) {
  const record = context.record;
  const waves = list(record.waves);
  const firstScheduledWave = waves.find((wave) => validTimestamp(firstText(
    wave.scheduledAt, wave.scheduled_at, wave.releaseAt, wave.release_at
  )));
  const scheduledAt = validTimestamp(firstText(
    record.scheduledAt, record.scheduled_at, record.scheduledFor, record.scheduled_for,
    record.startAt, record.start_at, record.startDate, record.start_date,
    firstScheduledWave?.scheduledAt, firstScheduledWave?.scheduled_at,
    firstScheduledWave?.releaseAt, firstScheduledWave?.release_at
  ));
  return {
    scheduled: status.key === "scheduled" || Boolean(scheduledAt),
    scheduledAt: scheduledAt || null,
    timezone: firstText(record.timezone, record.timeZone, record.scheduleTimezone, record.schedule_timezone) || null,
    sent: false
  };
}

function approvalProjection(context) {
  const record = context.record;
  const explicit = lower(record.approvalStatus || record.approval_status || record.approvalState);
  const statuses = [...list(context.queueItems), ...list(context.approvals)]
    .map((item) => lower(item.status || item.decision || item.approvalStatus))
    .filter(Boolean);
  let state = explicit || null;
  if (!state && statuses.length) {
    const approved = statuses.filter((status) => /approved|sent|released/.test(status)).length;
    const rejected = statuses.some((status) => /reject|changes_requested/.test(status));
    state = rejected ? "rejected" : approved === statuses.length ? "approved" : approved ? "partially_approved" : "pending";
  }
  const approved = state ? /^(?:approved|released)$/.test(state) : null;
  return {
    available: state !== null,
    state,
    approved,
    recordCount: statuses.length,
    executionSeparate: true
  };
}

function sentAttempt(record = {}) {
  return /sent|delivered|accepted|success/.test(lower(record.status || record.event || record.type))
    || Boolean(firstText(record.sentAt, record.sent_at, record.sent_date));
}

function sendingProjection(context) {
  const record = context.record;
  const attempts = list(context.attempts);
  const attemptCollection = context.kind === "partnerOutreach" ? "outreachAttempts" : "reactivationAttempts";
  const explicitSent = firstNumber(record, ["sendCount", "send_count", "sentCount", "sent_count"]);
  const sentCount = explicitSent ?? (context.availability[attemptCollection] ? attempts.filter(sentAttempt).length : null);
  let enabled = firstBoolean(record, ["sendingEnabled", "sending_enabled"]);
  const liveMode = firstBoolean(record, ["liveMode", "live_mode"]);
  if (enabled === null && liveMode === false) enabled = false;
  const connected = firstBoolean(record, ["senderConnected", "sender_connected"]);
  const ready = firstBoolean(record, ["readyToSend", "ready_to_send", "sendingReady", "sending_ready"]);
  return {
    available: sentCount !== null || enabled !== null || connected !== null || ready !== null,
    enabled,
    senderConnected: connected,
    ready,
    sentCount,
    executed: sentCount === null ? null : sentCount > 0,
    note: connected === true && enabled !== true ? "Sender connection does not enable sending." : null
  };
}

function pauseResumeProjection(context, status) {
  const record = context.record;
  const paused = status.key === "paused";
  return {
    paused,
    completed: status.key === "completed",
    reason: paused ? firstText(record.pausedReason, record.paused_reason, record.holdReason, record.hold_reason) || null : null,
    resumeState: firstText(record.resumeStatus, record.resume_status, record.resumeApprovalStatus, record.resume_approval_status) || null,
    resumeRequiresApproval: context.kind === "reactivation",
    canResume: paused ? firstBoolean(record, ["canResume", "can_resume"]) : false
  };
}

function repliesAndOutcomes(context) {
  const record = context.record;
  const contactCollection = context.kind === "partnerOutreach" ? "outreachContacts" : "reactivationContacts";
  let replyCount = firstNumber(record, ["replyCount", "reply_count", "replies"]);
  if (replyCount === null && context.kind === "partnerOutreach" && context.availability.outreachReplies) replyCount = context.replies.length;
  if (replyCount === null && context.kind === "reactivation" && context.availability[contactCollection]) {
    replyCount = context.contacts.filter((contact) => contact.replied === true || Boolean(firstText(contact.repliedAt, contact.replied_at))).length;
  }
  const meetingCount = firstNumber(record, ["meetingCount", "meeting_count", "meetingsBooked", "meetings_booked"]);
  const outcomeCount = firstNumber(record, ["outcomeCount", "outcome_count"]);
  return {
    available: replyCount !== null || meetingCount !== null || outcomeCount !== null || Boolean(firstText(record.outcomeSummary, record.outcome_summary)),
    replyCount,
    meetingCount,
    outcomeCount,
    outcomeSummary: firstText(record.outcomeSummary, record.outcome_summary) || null
  };
}

const RESULT_FIELDS = Object.freeze({
  referrals: ["actualReferrals", "actual_referrals"],
  visits: ["visits"],
  starts: ["starts"],
  recordShieldStarts: ["recordShieldStarts", "record_shield_starts"],
  expungementStarts: ["expungementStarts", "expungement_starts"],
  conversions: ["conversions"],
  paidConversions: ["paidConversions", "paid_conversions"],
  revenue: ["revenue"]
});

function resultProjection(record = {}) {
  const metrics = Object.fromEntries(Object.entries(RESULT_FIELDS).map(([key, fields]) => [key, firstNumber(record, fields)]));
  return {
    available: Object.values(metrics).some((value) => value !== null) || Boolean(firstText(record.resultSummary, record.result_summary)),
    summary: firstText(record.resultSummary, record.result_summary) || null,
    metrics
  };
}

function sourceReference(sourceCollection, sourceKind, sourceId, relationship, href = "") {
  const id = clean(sourceId);
  return id ? { sourceCollection, sourceKind, sourceId: id, relationship, href: clean(href) || null } : null;
}

function referenceRecords(context) {
  const references = [sourceReference(context.sourceCollection, context.sourceKind, context.sourceId, "record", context.href)];
  const mappings = context.kind === "canonical"
    ? [["queueItems", "approval-queue", "approval"], ["approvals", "approval", "approval"]]
    : context.kind === "partnerOutreach"
      ? [["sequenceSteps", "outreach-sequence-step", "sequence"], ["attempts", "outreach-attempt", "attempt"], ["replies", "outreach-reply", "reply"], ["suppressions", "outreach-suppression", "exclusion"], ["unsubscribes", "outreach-unsubscribe", "exclusion"], ["bounces", "outreach-bounce", "exclusion"], ["approvals", "outreach-approval", "approval"]]
      : [["queueItems", "approval-queue", "approval"], ["approvals", "approval", "approval"], ["attempts", "reactivation-attempt", "attempt"], ["events", "reactivation-event", "activity"]];
  for (const [field, kind, relationship] of mappings) {
    for (const record of list(context[field])) {
      references.push(sourceReference(field === "queueItems" || field === "approvals" ? field : context.kind === "partnerOutreach" ? `outreach${field[0].toUpperCase()}${field.slice(1)}` : `reactivation${field[0].toUpperCase()}${field.slice(1)}`, kind, recordId(record), relationship));
    }
  }
  const seen = new Set();
  return references.filter(Boolean).sort((left, right) =>
    left.relationship.localeCompare(right.relationship, "en-US")
    || left.sourceCollection.localeCompare(right.sourceCollection, "en-US")
    || left.sourceId.localeCompare(right.sourceId, "en-US")
  ).filter((reference) => {
    const key = `${reference.relationship}:${reference.sourceCollection}:${reference.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function activityProjection(context) {
  const sources = context.kind === "canonical"
    ? context.activity.map((entry) => ({ collection: entry.collection, record: entry.record }))
    : context.kind === "partnerOutreach"
      ? [
          ...context.attempts.map((record) => ({ collection: "outreachAttempts", record })),
          ...context.replies.map((record) => ({ collection: "outreachReplies", record })),
          ...context.approvals.map((record) => ({ collection: "approvalQueue", record }))
        ]
      : [
          ...context.attempts.map((record) => ({ collection: "reactivationAttempts", record })),
          ...context.events.map((record) => ({ collection: "reactivationEvents", record })),
          ...context.approvals.map((record) => ({ collection: "approvals", record }))
        ];
  return sources.map(({ collection, record }) => ({
    id: recordId(record),
    sourceCollection: collection,
    kind: lower(record.type || record.event || record.action || collection),
    status: lower(record.status || record.decision) || null,
    occurredAt: eventTimestamp(record) || null
  })).filter((item) => item.id).sort((left, right) =>
    clean(left.occurredAt).localeCompare(clean(right.occurredAt), "en-US")
    || left.sourceCollection.localeCompare(right.sourceCollection, "en-US")
    || left.id.localeCompare(right.id, "en-US")
  );
}

function projectCampaign(context) {
  const record = context.record;
  const type = typeProjection(context);
  const deliveryMode = deliveryModeProjection(context);
  const status = statusProjection(record);
  const schedule = scheduleProjection(context, status);
  const sending = sendingProjection(context);
  schedule.sent = sending.executed === true;
  return {
    id: context.stableIdentity,
    stableIdentity: context.stableIdentity,
    source: {
      kind: context.kind,
      sourceKind: context.sourceKind,
      collection: context.sourceCollection,
      sourceId: context.sourceId,
      href: context.href
    },
    sourceReferences: referenceRecords(context),
    campaignType: type,
    deliveryMode,
    name: firstText(record.name, record.campaignName, record.campaign_name, record.title) || null,
    goal: firstText(record.goal, record.desiredOutcome, record.desired_outcome, record.objective) || null,
    owner: firstText(record.owner, record.ownerName, record.owner_name) || null,
    status,
    nextAction: firstText(record.nextAction, record.next_action) || null,
    audience: audienceProjection(context),
    message: messageProjection(context, deliveryMode),
    schedule,
    approval: approvalProjection(context),
    sending,
    pauseResume: pauseResumeProjection(context, status),
    repliesAndOutcomes: repliesAndOutcomes(context),
    results: resultProjection(record),
    activity: activityProjection(context),
    timestamps: {
      createdAt: validTimestamp(firstText(record.createdAt, record.created_at)) || null,
      updatedAt: validTimestamp(firstText(record.updatedAt, record.updated_at)) || null,
      completedAt: validTimestamp(firstText(record.completedAt, record.completed_at)) || null
    },
    exactSafeSourceLink: context.href
  };
}

export function buildCampaignViews(state = {}, actor = {}) {
  return deepFreeze(collectCampaignSourceContexts(state, actor).map(projectCampaign));
}

export function buildCampaignView(state = {}, stableIdentity = "", actor = {}) {
  return buildCampaignViews(state, actor).find((campaign) => campaign.stableIdentity === clean(stableIdentity)) || null;
}
