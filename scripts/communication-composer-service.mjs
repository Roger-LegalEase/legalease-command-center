import { recordVisibleToActor } from "./global-search-service.mjs";
import { prepareInboxDraftReply } from "./inbox-intelligence.mjs";
import { isSuppressed, normalizeEmail } from "./outreach-os.mjs";
import { partnerFollowUpDraft } from "./partner-lifecycle.mjs";
import { roleHasCapability } from "./roles.mjs";
import { prepareSupportDraftReply } from "./support-desk.mjs";
import { updateTaskInState } from "./tasks-engine.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "./ui/route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const REQUEST_PATTERN = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const UNSAFE_TEXT_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const TERMINAL_TASK_STATUSES = new Set(["done", "completed", "closed", "archived", "dismissed"]);

export const COMMUNICATION_DRAFT_STATES = Object.freeze([
  "Draft needed",
  "Draft prepared",
  "Needs review",
  "Approved to send manually",
  "Sent manually"
]);

export const COMMUNICATION_SOURCE_KINDS = Object.freeze([
  "task",
  "relationship",
  "partner",
  "inbox_signal",
  "support_issue",
  "outreach_reply"
]);

export const COMMUNICATION_COMPOSER_READ_COLLECTIONS = Object.freeze([
  "activityEvents",
  "approvalQueue",
  "auditHistory",
  "companyContacts",
  "companyOrganizations",
  "emailDrafts",
  "inboxSignals",
  "outreachContacts",
  "outreachOrganizations",
  "outreachReplies",
  "outreachSuppressions",
  "partners",
  "prospectCandidates",
  "reactivationContacts",
  "supportIssues",
  "tasks"
]);

const SOURCE_ALIASES = Object.freeze({
  task:"task",
  tasks:"task",
  relationship:"relationship",
  relationships:"relationship",
  partner:"partner",
  partners:"partner",
  inbox:"inbox_signal",
  inbox_signal:"inbox_signal",
  "inbox-signal":"inbox_signal",
  support:"support_issue",
  support_issue:"support_issue",
  "support-issue":"support_issue",
  reply:"outreach_reply",
  outreach_reply:"outreach_reply",
  "outreach-reply":"outreach_reply"
});

export class CommunicationComposerError extends Error {
  constructor(message, status = 400, outcome = "validation_error", field = "") {
    super(message);
    this.name = "CommunicationComposerError";
    this.status = status;
    this.outcome = outcome;
    this.field = field;
    this.safeMessage = message;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeText(value, label, maximum, options = {}) {
  if (value === undefined || value === null) {
    if (options.required) throw new CommunicationComposerError(`${label} is required.`, 400, "validation_error", options.field || "");
    return "";
  }
  if (typeof value !== "string") throw new CommunicationComposerError(`${label} is invalid.`, 400, "validation_error", options.field || "");
  const text = clean(value);
  if ((options.required && !text) || text.length > maximum || UNSAFE_TEXT_PATTERN.test(text)) {
    throw new CommunicationComposerError(`${label} is invalid.`, 400, "validation_error", options.field || "");
  }
  return text;
}

function validTimestamp(value = "") {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function serverNow(value = "") {
  const timestamp = validTimestamp(value || new Date().toISOString());
  if (!timestamp) throw new CommunicationComposerError("A valid server timestamp is required.");
  return timestamp;
}

function dateOnly(value = "", field = "nextFollowUpDate") {
  const text = clean(value);
  if (!text) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : null;
  if (!match || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new CommunicationComposerError("Choose a valid next follow-up date.", 400, "validation_error", field);
  }
  return text;
}

function actorName(actor = {}) {
  return clean(actor.label || actor.displayName || actor.name || actor.id || actor.role) || "Owner";
}

function assertCapability(actor = {}, capability = "read_sensitive") {
  if (actor?.authenticated !== true || !clean(actor.id)) {
    throw new CommunicationComposerError("Sign in again to continue.", 401, "session_expired");
  }
  if (!roleHasCapability(actor.role, "read_internal") || !roleHasCapability(actor.role, capability)) {
    throw new CommunicationComposerError("Follow-up drafting is not available for this account.", 403, "unauthorized");
  }
}

function identifier(value, label = "Record") {
  return safeText(value, `${label} identifier`, 240, { required:true, field:"sourceId" });
}

function sourceKind(value = "") {
  const kind = SOURCE_ALIASES[lower(value)];
  if (!kind) throw new CommunicationComposerError("Choose a supported follow-up source.", 400, "validation_error", "sourceKind");
  return kind;
}

function recordId(record = {}) {
  return clean(record.id || record.contact_id || record.contactId || record.account_id || record.accountId || record.organization_id || record.organizationId || record.reply_id || record.replyId || record.signalId);
}

function exactVisible(state, collection, id, actor, label) {
  const matches = list(state[collection]).filter((record) => recordId(record) === id && recordVisibleToActor(record, actor.role));
  if (matches.length !== 1) throw new CommunicationComposerError(`${label} is unavailable.`, 404, "not_available");
  return matches[0];
}

function emailOf(record = {}) {
  return normalizeEmail(record.primaryContactEmail || record.contactEmail || record.contact_email || record.primaryEmail || record.public_email || record.email || record.counterpartEmail || record.fromEmail || record.from_email || record.to || "");
}

function contactNameOf(record = {}) {
  return clean(record.primaryContactName || record.contactName || record.contact_name || record.fullName || record.full_name || record.counterpartName || record.first_name || record.firstName || record.name);
}

function organizationNameOf(record = {}) {
  return clean(record.organizationName || record.organization_name || record.organization || record.companyName || record.company || record.partnerName || record.publication);
}

function firstName(value = "") {
  return clean(value).split(/\s+/u)[0] || "there";
}

function hrefFor(kind, id, collection = "") {
  if (kind === "partner") return buildExactObjectLink({ objectType:"Partner", sourceKind:"partner", sourceId:id })?.target || "";
  if (kind === "task") return buildGenericItemLink({ collection:"tasks", sourceId:id })?.target || "";
  if (collection) return buildGenericItemLink({ collection, sourceId:id })?.target || "";
  return "";
}

function sourceIds(record = {}) {
  return new Set([
    recordId(record),
    clean(record.partnerId || record.partner_id || record.relatedPartnerId || record.related_partner_id),
    clean(record.contactId || record.contact_id || record.linked_contact_id),
    clean(record.organizationId || record.organization_id || record.linked_account_id),
    clean(record.sourceId || record.source_id)
  ].filter(Boolean));
}

function recordMatchesIdentity(record = {}, ids = new Set(), email = "") {
  if ([...sourceIds(record)].some((id) => ids.has(id))) return true;
  return Boolean(email && emailOf(record) === email);
}

function organizationFor(state, record = {}) {
  const linkedId = clean(record.organizationId || record.organization_id || record.linked_account_id || record.account_id);
  if (!linkedId) return null;
  return [...list(state.companyOrganizations), ...list(state.outreachOrganizations)]
    .find((organization) => sourceIds(organization).has(linkedId)) || null;
}

function partnerForRecord(state, record = {}, actor = {}) {
  const ids = sourceIds(record);
  const email = emailOf(record);
  return list(state.partners).find((partner) => recordVisibleToActor(partner, actor.role)
    && ([...sourceIds(partner)].some((id) => ids.has(id)) || (email && emailOf(partner) === email))) || null;
}

function taskForContext(state, actor, identity = {}) {
  const ids = new Set(identity.ids || []);
  const email = normalizeEmail(identity.email);
  return list(state.tasks)
    .filter((task) => recordVisibleToActor(task, actor.role))
    .filter((task) => !TERMINAL_TASK_STATUSES.has(lower(task.status)))
    .filter((task) => recordMatchesIdentity(task, ids, email))
    .sort((a, b) => clean(a.dueDate || a.due_date).localeCompare(clean(b.dueDate || b.due_date)) || clean(b.updatedAt || b.updated_at).localeCompare(clean(a.updatedAt || a.updated_at)))[0] || null;
}

function recentActivitySummary(state, identity = {}) {
  const ids = new Set(identity.ids || []);
  const email = normalizeEmail(identity.email);
  const event = list(state.activityEvents)
    .filter((item) => recordMatchesIdentity(item, ids, email))
    .sort((a, b) => clean(b.createdAt || b.created_at || b.timestamp).localeCompare(clean(a.createdAt || a.created_at || a.timestamp)))[0];
  if (!event) return "No recent interaction is recorded.";
  const label = clean(event.title || event.eventType || event.action).slice(0, 180) || "Interaction recorded";
  const at = validTimestamp(event.createdAt || event.created_at || event.timestamp);
  return at ? `${label} · ${at.slice(0, 10)}` : label;
}

function defaultBody(name = "", context = "") {
  return [
    `Hi ${firstName(name)},`,
    "",
    context ? `Wanted to follow up on ${context}.` : "Wanted to follow up and keep the next step moving.",
    "",
    "[Add the specific update or question here.]",
    "",
    "Best,",
    "Roger"
  ].join("\n");
}

function relationshipProjection(record = {}, kind = "relationship", collection = "", state = {}) {
  const id = recordId(record);
  const partner = collection === "partners" ? record : null;
  const organization = organizationFor(state, record);
  const label = organizationNameOf(partner || organization || record) || contactNameOf(record) || "Relationship";
  return {
    kind:partner ? "partner" : kind,
    id,
    label,
    href:hrefFor(partner ? "partner" : kind, id, collection)
  };
}

function resolveRelationship(state, actor, rawId) {
  let type = "";
  let id = rawId;
  const separator = rawId.indexOf(":");
  if (separator > 0) {
    type = lower(rawId.slice(0, separator));
    id = clean(rawId.slice(separator + 1));
  }
  const collections = type === "partner"
    ? ["partners"]
    : type === "organization" || type === "org"
      ? ["companyOrganizations", "outreachOrganizations", "partners"]
      : type === "contact"
        ? ["companyContacts", "outreachContacts", "reactivationContacts", "prospectCandidates", "rcapRevenueContacts"]
        : ["partners", "companyContacts", "companyOrganizations", "outreachContacts", "outreachOrganizations", "reactivationContacts", "prospectCandidates", "rcapRevenueContacts"];
  for (const collection of collections) {
    const record = list(state[collection]).find((item) => recordId(item) === id && recordVisibleToActor(item, actor.role));
    if (record) return { record, collection, id, relationshipKind:collection === "partners" ? "partner" : collection.toLowerCase().includes("organization") ? "organization" : "contact" };
  }
  throw new CommunicationComposerError("Relationship is unavailable.", 404, "not_available");
}

function hardSuppressionFor(state, email, records = []) {
  if (!email) return { blocked:false, reason:"Add a recipient to continue." };
  const related = [
    ...records,
    ...list(state.outreachContacts).filter((record) => emailOf(record) === email),
    ...list(state.reactivationContacts).filter((record) => emailOf(record) === email),
    ...list(state.companyContacts).filter((record) => emailOf(record) === email)
  ];
  const ledger = list(state.outreachSuppressions).find((entry) => emailOf(entry) === email);
  const hard = related.find((record) => record.do_not_contact === true
    || record.doNotContact === true
    || record.unsubscribed === true
    || record.bounced === true
    || record.complained === true
    || record.complaint === true
    || record.manually_suppressed === true)
    || ledger;
  if (!hard) return { blocked:false, reason:"Eligible for a manual follow-up." };
  if (hard.unsubscribed === true || /unsub/i.test(clean(hard.reason || hard.suppression_status))) return { blocked:true, reason:"This recipient unsubscribed." };
  if (hard.bounced === true || /bounc|drop|block/i.test(clean(hard.reason || hard.suppression_status))) return { blocked:true, reason:"Delivery to this recipient previously failed." };
  if (hard.complained === true || hard.complaint === true || /complaint|spam/i.test(clean(hard.reason || hard.suppression_status))) return { blocked:true, reason:"This recipient reported an email complaint." };
  return { blocked:true, reason:"This recipient is marked do not contact." };
}

function deliveryStatus(state, email, records = [], organization = null) {
  const hard = hardSuppressionFor(state, email, records);
  const automated = records.map((record) => isSuppressed(record, { state, org:organization || {} })).find((result) => result.suppressed)
    || (email ? isSuppressed({ email }, { state, org:organization || {} }) : { suppressed:true, reason:"missing_email" });
  const automationReasons = Object.freeze({
    replied:"Automation is paused after a reply.",
    existing_customer:"Existing relationships are excluded from cold outreach.",
    do_not_contact:"This recipient is marked do not contact.",
    unsubscribed:"This recipient unsubscribed.",
    bounced:"Delivery to this recipient previously failed.",
    manually_suppressed:"This recipient is suppressed.",
    bad_domain:"This address is not eligible for automated outreach.",
    duplicate:"This address is a duplicate."
  });
  return {
    manualContactAllowed:Boolean(email) && !hard.blocked,
    manualStatus:hard.reason,
    automationEligible:Boolean(email) && !automated.suppressed,
    automationStatus:automated.suppressed ? automationReasons[automated.reason] || "Automated outreach needs review." : "Eligible for automated outreach."
  };
}

function normalizeContextSource(state, actor, rawKind, rawId, options = {}) {
  const kind = sourceKind(rawKind);
  const id = identifier(rawId);
  const now = serverNow(options.now);
  let record;
  let collection;
  let recipient = "";
  let recipientName = "";
  let recipientOrganization = "";
  let subject = "";
  let body = "";
  let relationship = null;
  let relatedTask = null;
  let commitment = "";
  let recentInteractionSummary = "";

  if (kind === "task") {
    collection = "tasks";
    record = exactVisible(state, collection, id, actor, "Task");
    const linkedPartnerId = clean(record.partnerId || record.partner_id || (lower(record.sourceType || record.source) === "partner" ? record.sourceId : ""));
    const partner = linkedPartnerId ? list(state.partners).find((item) => recordId(item) === linkedPartnerId && recordVisibleToActor(item, actor.role)) : partnerForRecord(state, record, actor);
    const contact = partner || record;
    recipient = emailOf(contact);
    recipientName = contactNameOf(contact);
    recipientOrganization = organizationNameOf(partner || contact);
    subject = `Follow-up: ${clean(record.title || record.nextAction).slice(0, 180) || "next step"}`;
    body = partner ? partnerFollowUpDraft(partner, { now }).body : defaultBody(recipientName, clean(record.nextAction || record.title).slice(0, 180));
    relationship = partner ? relationshipProjection(partner, "partner", "partners", state) : null;
    relatedTask = { id, title:clean(record.title || record.nextAction) || "Follow-up task", href:hrefFor("task", id) };
    commitment = clean(record.commitment || record.nextAction || record.description).slice(0, 400);
    recentInteractionSummary = partner ? recentActivitySummary(state, { ids:[...sourceIds(partner)], email:recipient }) : "This follow-up comes from an open task.";
  } else if (kind === "partner") {
    collection = "partners";
    record = exactVisible(state, collection, id, actor, "Partner");
    recipient = emailOf(record);
    recipientName = contactNameOf(record);
    recipientOrganization = organizationNameOf(record) || clean(record.name);
    const prepared = partnerFollowUpDraft(record, { now });
    subject = prepared.subject;
    body = prepared.body;
    relationship = relationshipProjection(record, "partner", collection, state);
    relatedTask = taskForContext(state, actor, { ids:[...sourceIds(record)], email:recipient });
    commitment = clean(record.nextAction || record.firstNextAction).slice(0, 400);
    recentInteractionSummary = recentActivitySummary(state, { ids:[...sourceIds(record)], email:recipient });
  } else if (kind === "relationship") {
    const resolved = resolveRelationship(state, actor, id);
    ({ record, collection } = resolved);
    const partner = collection === "partners" ? record : partnerForRecord(state, record, actor);
    const organization = organizationFor(state, record);
    recipient = emailOf(record) || emailOf(partner || {});
    recipientName = contactNameOf(record) || contactNameOf(partner || {});
    recipientOrganization = organizationNameOf(partner || organization || record);
    const prepared = partner ? partnerFollowUpDraft(partner, { now }) : null;
    subject = prepared?.subject || `Following up${recipientOrganization ? ` · ${recipientOrganization}` : ""}`;
    body = prepared?.body || defaultBody(recipientName, clean(record.nextAction || record.stage || recipientOrganization).slice(0, 180));
    relationship = relationshipProjection(record, resolved.relationshipKind, collection, state);
    relatedTask = taskForContext(state, actor, { ids:[...sourceIds(record), ...sourceIds(partner || {})], email:recipient });
    commitment = clean(record.nextAction || partner?.nextAction).slice(0, 400);
    recentInteractionSummary = recentActivitySummary(state, { ids:[...sourceIds(record), ...sourceIds(partner || {})], email:recipient });
  } else if (kind === "inbox_signal") {
    collection = "inboxSignals";
    record = exactVisible(state, collection, id, actor, "Inbox conversation");
    const prepared = prepareInboxDraftReply(record, { now });
    if (!prepared.ok) throw new CommunicationComposerError(prepared.error, 409, "draft_unavailable");
    recipient = normalizeEmail(record.counterpartEmail || prepared.draft.target);
    recipientName = clean(record.counterpartName);
    const partner = partnerForRecord(state, record, actor);
    const organization = organizationFor(state, record);
    recipientOrganization = organizationNameOf(partner || organization || record);
    subject = clean(record.subject) ? (/^re:/i.test(clean(record.subject)) ? clean(record.subject) : `Re: ${clean(record.subject)}`) : "Following up";
    body = prepared.draft.body;
    relationship = partner ? relationshipProjection(partner, "partner", "partners", state) : relationshipProjection(record, "contact", collection, state);
    relatedTask = taskForContext(state, actor, { ids:[...sourceIds(record), ...sourceIds(partner || {})], email:recipient });
    commitment = record.kind === "commitment" ? clean(record.summary).slice(0, 400) : "";
    recentInteractionSummary = clean(record.summary).slice(0, 400) || "A conversation needs follow-up.";
  } else if (kind === "support_issue") {
    collection = "supportIssues";
    record = exactVisible(state, collection, id, actor, "Support issue");
    const prepared = prepareSupportDraftReply(record, { now });
    if (!prepared.ok) throw new CommunicationComposerError(prepared.error, 409, "draft_unavailable");
    recipient = emailOf(record);
    recipientName = contactNameOf(record) || clean(recipient.split("@")[0]);
    recipientOrganization = organizationNameOf(record);
    subject = /^re:/i.test(clean(record.title)) ? clean(record.title) : `Re: ${clean(record.title) || "your LegalEase question"}`;
    body = prepared.issue.draft_reply;
    const partner = partnerForRecord(state, record, actor);
    relationship = partner ? relationshipProjection(partner, "partner", "partners", state) : relationshipProjection(record, "contact", collection, state);
    relatedTask = taskForContext(state, actor, { ids:[...sourceIds(record), ...sourceIds(partner || {})], email:recipient });
    recentInteractionSummary = `${clean(record.urgency) === "urgent" ? "Urgent support request" : "Support request"}: ${clean(record.title).slice(0, 220)}`;
  } else {
    collection = "outreachReplies";
    record = exactVisible(state, collection, id, actor, "Outreach reply");
    recipient = emailOf(record);
    const contact = list(state.outreachContacts).find((item) => clean(item.contact_id || item.id) === clean(record.contact_id || record.contactId) || (recipient && emailOf(item) === recipient));
    recipient = emailOf(contact || record);
    recipientName = contactNameOf(contact || record);
    const organization = organizationFor(state, contact || record);
    recipientOrganization = organizationNameOf(organization || contact || record);
    const replySubject = clean(record.subject || record.campaignName || record.campaign_name);
    subject = replySubject ? (/^re:/i.test(replySubject) ? replySubject : `Re: ${replySubject}`) : "Re: next steps";
    body = defaultBody(recipientName, "your reply").replace("Wanted to follow up on your reply.", "Thanks for getting back to me.");
    const partner = partnerForRecord(state, contact || record, actor);
    relationship = partner ? relationshipProjection(partner, "partner", "partners", state) : relationshipProjection(contact || record, "contact", contact ? "outreachContacts" : collection, state);
    relatedTask = taskForContext(state, actor, { ids:[...sourceIds(record), ...sourceIds(contact || {}), ...sourceIds(partner || {})], email:recipient });
    const classification = clean(record.classification || record.reviewedClassification).replaceAll("_", " ");
    recentInteractionSummary = classification ? `Reply received · ${classification}` : "An outreach reply is ready for follow-up.";
  }

  if (relatedTask && !relatedTask.href) relatedTask = { id:recordId(relatedTask), title:clean(relatedTask.title || relatedTask.nextAction) || "Follow-up task", href:hrefFor("task", recordId(relatedTask)) };
  else if (relatedTask && !relatedTask.id) relatedTask = { id:recordId(relatedTask), title:clean(relatedTask.title || relatedTask.nextAction) || "Follow-up task", href:hrefFor("task", recordId(relatedTask)) };
  const identityRecords = [record, ...(relationship?.kind === "partner" ? list(state.partners).filter((partner) => recordId(partner) === relationship.id) : [])];
  const organization = organizationFor(state, record);
  const delivery = deliveryStatus(state, recipient, identityRecords, organization);
  const stage = clean(record.stage || record.status).replaceAll("_", " ");
  const relationshipContext = [relationship?.label, stage, commitment ? `Next: ${commitment}` : ""].filter(Boolean).join(" · ").slice(0, 600);
  return {
    kind,
    id,
    collection,
    record,
    recipient,
    recipientName,
    recipientOrganization,
    subject:subject.slice(0, 240),
    body:body.slice(0, 12_000),
    relationship,
    relationshipContext,
    recentInteractionSummary:recentInteractionSummary.slice(0, 600),
    relatedTask:relatedTask ? { id:recordId(relatedTask) || relatedTask.id, title:clean(relatedTask.title || relatedTask.nextAction) || "Follow-up task", href:relatedTask.href || hrefFor("task", recordId(relatedTask) || relatedTask.id) } : null,
    commitment,
    delivery
  };
}

function publicDraft(draft = {}, state = {}) {
  const manualContactAllowed = draft.manualContactAllowed !== false;
  return {
    id:clean(draft.id),
    version:validTimestamp(draft.updatedAt || draft.updated_at) || "legacy",
    sourceKind:clean(draft.sourceKind),
    sourceId:clean(draft.sourceId),
    recipientName:clean(draft.recipientName),
    recipient:clean(draft.recipient || draft.target),
    recipientOrganization:clean(draft.recipientOrganization),
    subject:clean(draft.subject || draft.title),
    body:clean(draft.body),
    relationship:draft.relationship || null,
    relationshipContext:clean(draft.relationshipContext),
    recentInteractionSummary:clean(draft.recentInteractionSummary),
    relatedTask:draft.relatedTask || null,
    commitment:clean(draft.commitment),
    status:clean(draft.status) || "Needs review",
    manualContactAllowed,
    manualStatus:clean(draft.manualStatus),
    gmailComposeUrl:manualContactAllowed ? buildGmailComposeUrl(draft) : "",
    gmailUrl:manualContactAllowed ? buildGmailComposeUrl(draft) : "",
    createdAt:validTimestamp(draft.createdAt || draft.created_at),
    updatedAt:validTimestamp(draft.updatedAt || draft.updated_at),
    sentManuallyAt:validTimestamp(draft.sentManuallyAt || draft.sent_manually_at)
  };
}

function existingDraftFor(state, actor, kind, id) {
  return list(state.emailDrafts)
    .filter((draft) => recordVisibleToActor(draft, actor.role))
    .filter((draft) => lower(draft.status) !== "dismissed")
    .find((draft) => (clean(draft.sourceKind) === kind && clean(draft.sourceId) === id)
      || (kind === "inbox_signal" && clean(draft.signalId) === id)) || null;
}

export function buildGmailComposeUrl(draft = {}) {
  const recipient = normalizeEmail(draft.recipient || draft.target);
  if (!recipient || !EMAIL_PATTERN.test(recipient)) return "";
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  url.searchParams.set("to", recipient);
  const subject = clean(draft.subject || draft.title).slice(0, 240);
  const body = clean(draft.body).slice(0, 12_000);
  if (subject) url.searchParams.set("su", subject);
  if (body) url.searchParams.set("body", body);
  return url.toString();
}

export function buildCommunicationContext(state = {}, actor = {}, rawKind = "", rawId = "", options = {}) {
  assertCapability(actor, "read_sensitive");
  const source = normalizeContextSource(state, actor, rawKind, rawId, options);
  const existing = existingDraftFor(state, actor, source.kind, source.id);
  const draft = existing ? publicDraft(existing, state) : {
    id:"",
    version:"",
    sourceKind:source.kind,
    sourceId:source.id,
    recipientName:source.recipientName,
    recipient:source.recipient,
    recipientOrganization:source.recipientOrganization,
    subject:source.subject,
    body:source.body,
    relationship:source.relationship,
    relationshipContext:source.relationshipContext,
    recentInteractionSummary:source.recentInteractionSummary,
    relatedTask:source.relatedTask,
    commitment:source.commitment,
    status:"Draft needed",
    manualContactAllowed:source.delivery.manualContactAllowed,
    manualStatus:source.delivery.manualStatus,
    gmailComposeUrl:source.delivery.manualContactAllowed ? buildGmailComposeUrl(source) : "",
    createdAt:"",
    updatedAt:"",
    sentManuallyAt:""
  };
  const context = {
    sourceKind:source.kind,
    sourceId:source.id,
    title:source.relationship?.label || source.recipientName || "Follow-up",
    relationshipName:source.relationship?.label || source.recipientName || "Relationship",
    relationship:source.relationship,
    relationshipContext:source.relationshipContext,
    recentInteractionSummary:source.recentInteractionSummary,
    relatedTask:source.relatedTask,
    relatedCommitment:source.commitment,
    recipient:{ name:source.recipientName, email:draft.recipient, organization:draft.recipientOrganization },
    recipientName:source.recipientName,
    recipientEmail:draft.recipient,
    recipientOrganization:draft.recipientOrganization,
    subject:draft.subject,
    body:draft.body
  };
  return deepFreeze({
    ok:true,
    composer:draft,
    context,
    draft:existing ? draft : null,
    safety:{
      manualOnly:true,
      externalSendAvailable:false,
      message:"Draft here, then copy it or open it in Gmail. Nothing is sent by LegalEase."
    },
    automation:{
      eligible:source.delivery.automationEligible,
      status:source.delivery.automationStatus
    }
  });
}

const SAVE_KEYS = new Set(["draftId", "requestId", "expectedVersion", "sourceKind", "sourceId", "recipientName", "recipient", "recipientOrganization", "subject", "body"]);

function parsedSaveInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CommunicationComposerError("The draft is invalid.");
  if (Object.keys(input).some((key) => !SAVE_KEYS.has(key))) throw new CommunicationComposerError("The draft contains unsupported information.");
  const draftId = safeText(input.draftId, "Draft identifier", 240, { field:"draftId" });
  const requestId = safeText(input.requestId, "Request identifier", 96, { required:!draftId, field:"requestId" });
  if (requestId && !REQUEST_PATTERN.test(requestId)) throw new CommunicationComposerError("The draft request is invalid. No changes were made.", 400, "validation_error", "requestId");
  const expectedVersion = safeText(input.expectedVersion, "Draft version", 80, { required:Boolean(draftId), field:"expectedVersion" });
  if (expectedVersion && expectedVersion !== "legacy" && !validTimestamp(expectedVersion)) throw new CommunicationComposerError("Draft changed; refresh and try again.", 409, "conflict");
  const recipient = normalizeEmail(safeText(input.recipient, "Recipient", 254, { required:true, field:"recipient" }));
  if (!EMAIL_PATTERN.test(recipient)) throw new CommunicationComposerError("Add a valid recipient email.", 400, "validation_error", "recipient");
  return {
    draftId,
    requestId,
    expectedVersion:expectedVersion === "legacy" ? "legacy" : validTimestamp(expectedVersion),
    sourceKind:sourceKind(input.sourceKind),
    sourceId:identifier(input.sourceId),
    recipientName:safeText(input.recipientName, "Recipient name", 160, { field:"recipientName" }),
    recipient,
    recipientOrganization:safeText(input.recipientOrganization, "Recipient organization", 200, { field:"recipientOrganization" }),
    subject:safeText(input.subject, "Subject", 240, { required:true, field:"subject" }),
    body:safeText(input.body, "Draft body", 12_000, { required:true, field:"body" })
  };
}

function draftVersion(draft = {}) {
  return validTimestamp(draft.updatedAt || draft.updated_at) || "legacy";
}

function collectionsChanged(before, after, names) {
  return Object.fromEntries(names.filter((name) => before[name] !== after[name]).map((name) => [name, after[name]]));
}

function linkDraftToSource(state, source, draft, now) {
  if (source.kind === "inbox_signal") {
    return {
      ...state,
      inboxSignals:list(state.inboxSignals).map((signal) => recordId(signal) === source.id ? { ...signal, draftId:draft.id, updatedAt:now } : signal)
    };
  }
  if (source.kind === "support_issue") {
    return {
      ...state,
      supportIssues:list(state.supportIssues).map((issue) => recordId(issue) === source.id ? {
        ...issue,
        draftId:draft.id,
        draft_reply:draft.body,
        draft_prepared_at:issue.draft_prepared_at || now,
        status:lower(issue.status) === "open" ? "drafted" : issue.status,
        updated_at:now
      } : issue)
    };
  }
  if (source.kind === "outreach_reply") {
    return {
      ...state,
      outreachReplies:list(state.outreachReplies).map((reply) => recordId(reply) === source.id ? { ...reply, followUpDraftId:draft.id, updatedAt:now } : reply)
    };
  }
  return state;
}

export function saveCommunicationDraft(state = {}, actor = {}, input = {}, options = {}) {
  assertCapability(actor, "manage_content_drafts");
  const parsed = parsedSaveInput(input);
  const source = normalizeContextSource(state, actor, parsed.sourceKind, parsed.sourceId, options);
  const now = serverNow(options.now);
  const allDrafts = list(state.emailDrafts);
  let existing = null;
  if (parsed.draftId) {
    existing = allDrafts.find((draft) => clean(draft.id) === parsed.draftId && recordVisibleToActor(draft, actor.role));
    if (!existing) throw new CommunicationComposerError("Draft is unavailable.", 404, "not_available");
    if (clean(existing.sourceKind) !== source.kind || clean(existing.sourceId) !== source.id) throw new CommunicationComposerError("Draft does not match this follow-up. No changes were made.", 409, "conflict");
    if (draftVersion(existing) !== parsed.expectedVersion) throw new CommunicationComposerError("Draft changed; refresh and try again.", 409, "conflict");
    if (lower(existing.status) === "sent manually") throw new CommunicationComposerError("This sent interaction is already recorded.", 409, "already_recorded");
  }
  const id = existing?.id || `email-draft-communication-${parsed.requestId.toLowerCase()}`;
  const requestDuplicate = allDrafts.find((draft) => clean(draft.id) === id);
  if (!existing && requestDuplicate) {
    if (clean(requestDuplicate.sourceKind) !== source.kind || clean(requestDuplicate.sourceId) !== source.id) {
      throw new CommunicationComposerError("The draft request conflicts with another draft. No changes were made.", 409, "conflict");
    }
    return {
      ok:true,
      state,
      collections:{},
      draft:publicDraft(requestDuplicate, state),
      alreadyExisted:true,
      externalActions:0,
      message:"Draft already saved."
    };
  }
  const identityRecords = [source.record];
  const delivery = deliveryStatus(state, parsed.recipient, identityRecords, organizationFor(state, source.record));
  const draft = {
    ...(existing || {}),
    id,
    creationRequestId:existing?.creationRequestId || parsed.requestId,
    title:parsed.subject,
    target:parsed.recipient,
    recipientName:parsed.recipientName || source.recipientName,
    recipient:parsed.recipient,
    recipientOrganization:parsed.recipientOrganization,
    subject:parsed.subject,
    body:parsed.body,
    status:existing?.status || "Needs review",
    states:[...COMMUNICATION_DRAFT_STATES],
    sourceKind:source.kind,
    sourceId:source.id,
    sourceCollection:source.collection,
    signalId:source.kind === "inbox_signal" ? source.id : existing?.signalId,
    relationship:source.relationship,
    relationshipContext:source.relationshipContext,
    recentInteractionSummary:source.recentInteractionSummary,
    relatedTask:source.relatedTask,
    originatingTaskId:source.kind === "task" ? source.id : source.relatedTask?.id || existing?.originatingTaskId || "",
    commitment:source.commitment,
    manualContactAllowed:delivery.manualContactAllowed,
    manualStatus:delivery.manualStatus,
    automationEligible:delivery.automationEligible,
    automationStatus:delivery.automationStatus,
    internalOnly:true,
    ownerOnly:true,
    manualOnly:true,
    emailSentByApplication:false,
    createdAt:existing?.createdAt || now,
    updatedAt:now
  };
  let next = { ...state, emailDrafts:[draft, ...allDrafts.filter((item) => clean(item.id) !== id)].slice(0, 100) };
  next = linkDraftToSource(next, source, draft, now);
  return {
    ok:true,
    state:next,
    collections:collectionsChanged(state, next, ["emailDrafts", "inboxSignals", "supportIssues", "outreachReplies"]),
    draft:publicDraft(draft, next),
    alreadyExisted:false,
    externalActions:0,
    message:"Draft saved. Nothing was sent."
  };
}

const MANUAL_SENT_KEYS = new Set(["requestId", "expectedVersion", "completeOriginatingTask", "completionNote", "nextFollowUpDate", "nextAction"]);

function parsedManualSent(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CommunicationComposerError("The sent interaction is invalid.");
  if (Object.keys(input).some((key) => !MANUAL_SENT_KEYS.has(key))) throw new CommunicationComposerError("The sent interaction contains unsupported information.");
  const requestId = safeText(input.requestId, "Request identifier", 96, { required:true, field:"requestId" });
  if (!REQUEST_PATTERN.test(requestId)) throw new CommunicationComposerError("The sent interaction request is invalid. No changes were made.", 400, "validation_error", "requestId");
  const expectedVersion = safeText(input.expectedVersion, "Draft version", 80, { required:true, field:"expectedVersion" });
  if (expectedVersion !== "legacy" && !validTimestamp(expectedVersion)) throw new CommunicationComposerError("Draft changed; refresh and try again.", 409, "conflict");
  if (input.completeOriginatingTask !== undefined && typeof input.completeOriginatingTask !== "boolean") {
    throw new CommunicationComposerError("Task completion choice is invalid.", 400, "validation_error", "completeOriginatingTask");
  }
  return {
    requestId,
    expectedVersion:expectedVersion === "legacy" ? "legacy" : validTimestamp(expectedVersion),
    completeOriginatingTask:input.completeOriginatingTask === true,
    completionNote:safeText(input.completionNote, "Completion note", 1000, { field:"completionNote" }),
    nextFollowUpDate:dateOnly(input.nextFollowUpDate),
    nextAction:safeText(input.nextAction, "Next action", 500, { field:"nextAction" })
  };
}

function identityForDraft(draft = {}) {
  const relationshipId = clean(draft.relationship?.id);
  return {
    email:normalizeEmail(draft.recipient || draft.target),
    ids:new Set([relationshipId, clean(draft.sourceId), clean(draft.originatingTaskId)].filter(Boolean))
  };
}

function contactIdsFor(state, identity, actor) {
  return new Set([
    ...list(state.outreachContacts),
    ...list(state.reactivationContacts),
    ...list(state.companyContacts)
  ].filter((record) => recordVisibleToActor(record, actor.role) && recordMatchesIdentity(record, identity.ids, identity.email)).map(recordId).filter(Boolean));
}

function updateRelationshipRecords(state, draft, actor, now, parsed) {
  const identity = identityForDraft(draft);
  const followUp = parsed.nextFollowUpDate;
  const nextAction = parsed.nextAction;
  const day = now.slice(0, 10);
  const change = (collection, patcher) => {
    const current = list(state[collection]);
    let changed = false;
    const records = current.map((record) => {
      if (!recordVisibleToActor(record, actor.role) || !recordMatchesIdentity(record, identity.ids, identity.email)) return record;
      changed = true;
      return patcher(record);
    });
    if (changed) state = { ...state, [collection]:records };
  };
  change("partners", (record) => ({
    ...record,
    lastContacted:now,
    lastTouchDate:day,
    lastOutboundInteractionAt:now,
    ...(followUp ? { nextFollowUpDate:followUp, nextActionDueDate:followUp } : {}),
    ...(nextAction ? { nextAction } : {}),
    updatedAt:now
  }));
  change("companyContacts", (record) => ({
    ...record,
    lastContactedAt:now,
    last_contacted_at:now,
    lastOutboundAt:now,
    last_outbound_at:now,
    ...(followUp ? { nextFollowUpDate:followUp, next_follow_up_date:followUp } : {}),
    ...(nextAction ? { nextAction, next_action:nextAction } : {}),
    updatedAt:now,
    updated_at:now
  }));
  change("outreachContacts", (record) => ({
    ...record,
    lastContactedAt:now,
    last_contacted_at:now,
    lastOutboundAt:now,
    last_outbound_at:now,
    automationReviewRequired:true,
    automation_review_required:true,
    automationReviewReason:"Manual follow-up recorded; review before any automated touch.",
    ...(followUp ? { nextFollowUpDate:followUp, next_follow_up_date:followUp } : {}),
    ...(nextAction ? { nextAction, next_action:nextAction } : {}),
    updatedAt:now,
    updated_at:now
  }));
  change("reactivationContacts", (record) => ({
    ...record,
    campaign_hold:true,
    campaign_hold_reason:"manual_follow_up_recorded",
    sequence_status:/active|enrolled|running/i.test(clean(record.sequence_status)) ? "Paused" : record.sequence_status,
    automation_review_required:true,
    last_contacted_at:now,
    last_outbound_at:now,
    ...(followUp ? { next_follow_up_date:followUp } : {}),
    ...(nextAction ? { next_action:nextAction } : {}),
    updated_at:now
  }));
  change("prospectCandidates", (record) => ({
    ...record,
    lastContactedAt:now,
    last_contacted_at:now,
    automationReviewRequired:true,
    ...(followUp ? { nextFollowUpDate:followUp, next_follow_up_date:followUp } : {}),
    ...(nextAction ? { nextAction, next_action:nextAction } : {}),
    updatedAt:now,
    updated_at:now
  }));
  return { state, identity };
}

function flagQueuedAutomation(state, identity, actor, now) {
  const contactIds = contactIdsFor(state, identity, actor);
  let flagged = 0;
  const approvalQueue = list(state.approvalQueue).map((item) => {
    const matches = (identity.email && normalizeEmail(item.to || item.email || item.recipient) === identity.email)
      || contactIds.has(clean(item.contact_id || item.contactId));
    const automated = /outreach|reactivation|message/i.test(clean(item.type || item.source || item.engine));
    if (!matches || !automated || ["sent", "archived", "rejected"].includes(lower(item.status))) return item;
    flagged += 1;
    return {
      ...item,
      previousStatus:item.status,
      status:"needs_manual_review",
      manualReviewReason:"A manual follow-up was recorded for this person.",
      updatedAt:now
    };
  });
  return { state:flagged ? { ...state, approvalQueue } : state, flagged };
}

function markSourceResolved(state, draft, now) {
  const kind = clean(draft.sourceKind);
  const id = clean(draft.sourceId);
  if (kind === "inbox_signal") {
    return {
      ...state,
      inboxSignals:list(state.inboxSignals).map((signal) => recordId(signal) === id ? { ...signal, status:"done", draftId:draft.id, manualSentAt:now, resolvedAt:now, updatedAt:now } : signal)
    };
  }
  if (kind === "support_issue") {
    return {
      ...state,
      supportIssues:list(state.supportIssues).map((issue) => recordId(issue) === id ? { ...issue, draftId:draft.id, response_recorded_at:now, updated_at:now } : issue)
    };
  }
  if (kind === "outreach_reply") {
    return {
      ...state,
      outreachReplies:list(state.outreachReplies).map((reply) => recordId(reply) === id ? { ...reply, followUpDraftId:draft.id, followUpRecordedAt:now, updatedAt:now } : reply)
    };
  }
  return state;
}

export function markCommunicationDraftSentManually(state = {}, actor = {}, draftId = "", input = {}, options = {}) {
  assertCapability(actor, "manage_growth");
  const id = identifier(draftId, "Draft");
  const parsed = parsedManualSent(input);
  const now = serverNow(options.now);
  const drafts = list(state.emailDrafts);
  const draft = drafts.find((item) => clean(item.id) === id && recordVisibleToActor(item, actor.role));
  if (!draft) throw new CommunicationComposerError("Draft is unavailable.", 404, "not_available");
  const activityId = `activity-communication-manual-${parsed.requestId.toLowerCase()}`;
  if (list(state.activityEvents).some((event) => clean(event.id) === activityId)) {
    return {
      ok:true,
      state,
      collections:{},
      draft:publicDraft(draft, state),
      alreadyExisted:true,
      externalActions:0,
      message:"Sent interaction already recorded."
    };
  }
  if (draftVersion(draft) !== parsed.expectedVersion) throw new CommunicationComposerError("Draft changed; refresh and try again.", 409, "conflict");
  if (lower(draft.status) === "sent manually") throw new CommunicationComposerError("This sent interaction is already recorded.", 409, "already_recorded");

  const originatingTaskId = clean(draft.originatingTaskId || (clean(draft.sourceKind) === "task" ? draft.sourceId : ""));
  let originatingTask = null;
  if (parsed.completeOriginatingTask && originatingTaskId) {
    originatingTask = list(state.tasks).find((task) => recordId(task) === originatingTaskId && recordVisibleToActor(task, actor.role));
    if (!originatingTask) throw new CommunicationComposerError("The originating task is unavailable. No changes were made.", 409, "conflict");
  }

  const updatedDraft = {
    ...draft,
    status:"Sent manually",
    sentManuallyAt:now,
    sentManuallyBy:actorName(actor),
    sentManuallyRequestId:parsed.requestId,
    nextFollowUpDate:parsed.nextFollowUpDate,
    nextAction:parsed.nextAction,
    emailSentByApplication:false,
    externalDeliveryRecorded:true,
    updatedAt:now
  };
  let next = { ...state, emailDrafts:drafts.map((item) => clean(item.id) === id ? updatedDraft : item) };
  const relationshipUpdate = updateRelationshipRecords(next, updatedDraft, actor, now, parsed);
  next = relationshipUpdate.state;
  const automation = flagQueuedAutomation(next, relationshipUpdate.identity, actor, now);
  next = automation.state;
  next = markSourceResolved(next, updatedDraft, now);

  let taskCompleted = false;
  if (originatingTask && !TERMINAL_TASK_STATUSES.has(lower(originatingTask.status))) {
    const taskResult = updateTaskInState(next, originatingTaskId, "done", {
      completion_note:parsed.completionNote || "Manual follow-up sent and recorded."
    }, { now, actor:actorName(actor) });
    next = taskResult.state;
    taskCompleted = true;
  }

  const activity = {
    id:activityId,
    eventType:"Manual email sent",
    title:`Follow-up recorded: ${clean(updatedDraft.subject || updatedDraft.title) || "Email"}`.slice(0, 220),
    summary:"The owner recorded an email sent outside the Command Center.",
    relatedObjectType:updatedDraft.relationship?.kind || "email_draft",
    relatedObjectId:updatedDraft.relationship?.id || updatedDraft.id,
    partnerId:updatedDraft.relationship?.kind === "partner" ? updatedDraft.relationship.id : undefined,
    createdAt:now,
    metadata:{
      draftId:updatedDraft.id,
      sourceKind:updatedDraft.sourceKind,
      sourceId:updatedDraft.sourceId,
      originatingTaskId:originatingTaskId || "",
      taskCompleted,
      nextFollowUpDate:parsed.nextFollowUpDate,
      automationReviewRequired:true,
      queuedAutomationFlagged:automation.flagged,
      externalSideEffects:false,
      emailSentByApplication:false,
      recordedManually:true
    }
  };
  const audit = {
    id:`audit-communication-manual-${parsed.requestId.toLowerCase()}`,
    timestamp:now,
    actor:clean(actor.id || actor.role) || "authenticated_user",
    action:"manual_email_recorded",
    resourceType:"email_draft",
    resourceId:updatedDraft.id,
    afterValue:{ status:"Sent manually", taskCompleted, nextFollowUpDate:parsed.nextFollowUpDate },
    externalSideEffects:false,
    emailSentByApplication:false
  };
  next = {
    ...next,
    activityEvents:[activity, ...list(next.activityEvents)].slice(0, 500),
    auditHistory:[audit, ...list(next.auditHistory)].slice(0, 1000)
  };
  const collectionNames = [
    "emailDrafts", "partners", "companyContacts", "outreachContacts", "reactivationContacts", "prospectCandidates",
    "approvalQueue", "inboxSignals", "supportIssues", "outreachReplies", "tasks", "activityEvents", "auditHistory"
  ];
  const updated = next.emailDrafts.find((item) => clean(item.id) === id) || updatedDraft;
  return {
    ok:true,
    state:next,
    collections:collectionsChanged(state, next, collectionNames),
    draft:publicDraft(updated, next),
    taskCompleted,
    nextFollowUpNeeded:!parsed.nextFollowUpDate,
    automation:{ queuedItemsFlagged:automation.flagged, reviewRequired:true },
    alreadyExisted:false,
    externalActions:0,
    message:"Sent interaction recorded. No email was sent by LegalEase."
  };
}

export function communicationComposerSafeError(error = {}) {
  const known = error instanceof CommunicationComposerError;
  const status = [400, 401, 403, 404, 409, 413].includes(Number(error?.status)) ? Number(error.status) : 500;
  return deepFreeze({
    status,
    body:{
      ok:false,
      outcome:known ? error.outcome : "temporary_failure",
      ...(known && error.field ? { field:error.field } : {}),
      message:known ? error.message : "The follow-up could not be updated. No changes were made."
    }
  });
}
