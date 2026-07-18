import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const PARTNER_ACTIVITY_SOURCE_MATRIX = deepFreeze({
  included: [
    { collection: "partners.history", sourceKind: "partner-history", family: "Partner history" },
    { collection: "activityEvents", sourceKind: "activity-event", family: "Activity events" },
    { collection: "auditHistory", sourceKind: "audit-event", family: "Audit mirrors" },
    { collection: "automationEvents", sourceKind: "automation-event", family: "Read-only reply and meeting signals" },
    { collection: "companyEvents", sourceKind: "company-event", family: "Company-memory events" },
    { collection: "tasks", sourceKind: "task", family: "Completed tasks" },
    { collection: "outreachAttempts", sourceKind: "outreach-attempt", family: "Outreach sends" },
    { collection: "outreachReplies", sourceKind: "outreach-reply", family: "Outreach replies" },
    { collection: "campaigns.distributionActions", sourceKind: "campaign-distribution", family: "Partner Campaign distribution" },
    { collection: "reports", sourceKind: "report", family: "Partner reports" },
    { collection: "partnerProgramArtifacts", sourceKind: "partner-program-artifact", family: "Partner Program artifacts" },
    { collection: "evidencePackNotes", sourceKind: "evidence-note", family: "Partner notes" },
    { collection: "dataRoomItems", sourceKind: "data-room-item", family: "Explicitly shared files" }
  ],
  deferred: [
    { collection: "meetingBriefs", reason: "Current brief records identify attendees and Calendar events, not stable Partner IDs." },
    { collection: "googleInsights", reason: "relatedPersonOrOrg is not a typed Partner relationship." },
    { collection: "conversationNotes", reason: "Current captures may store a Partner name, not a stable Partner ID." },
    { collection: "rcapRevenueEvents", reason: "RCAP account/contact identities are not canonical Partner IDs." },
    { collection: "events", reason: "Operational access records and raw metadata are not founder-facing relationship activity." },
    { collection: "outreachSendClaims", reason: "Idempotency and provider ledgers are operational safety records." },
    { collection: "reactivationEvents", reason: "Reactivation contacts are not typed Partner relationships." },
    { collection: "inboxSignals", reason: "Inbox intelligence is contact/thread scoped and may contain restricted evidence." },
    { collection: "supportIssues", reason: "Support and legal case content is outside Partner activity." },
    { collection: "calendarItems", reason: "Raw Calendar records have no persisted typed Partner relationship." }
  ]
});

export const PARTNER_ACTIVITY_EVENT_TYPES = deepFreeze([
  { key: "reply", label: "Reply", filterKey: "replies", filterLabel: "Replies" },
  { key: "meeting", label: "Meeting", filterKey: "meetings", filterLabel: "Meetings" },
  { key: "note", label: "Note", filterKey: "notes", filterLabel: "Notes" },
  { key: "stage_change", label: "Stage change", filterKey: "stage_changes", filterLabel: "Stage changes" },
  { key: "outreach", label: "Outreach", filterKey: "outreach", filterLabel: "Outreach" },
  { key: "document", label: "Document", filterKey: "documents_files", filterLabel: "Documents/files" },
  { key: "file", label: "File", filterKey: "documents_files", filterLabel: "Documents/files" },
  { key: "task", label: "Task", filterKey: "tasks", filterLabel: "Tasks" }
]);

export function partnerActivityActorContext(actor = {}) {
  const role = lower(actor.role);
  const authorized = actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal");
  return deepFreeze({
    authorized,
    role: authorized ? role : null,
    canReadSensitive: authorized && roleHasCapability(role, "read_sensitive")
  });
}

export function authorizedSourceRecords(state = {}, collection = "", role = "") {
  return list(state[collection]).filter((record) => recordVisibleToActor(record, role));
}

export function sourceRecordId(record = {}) {
  return clean(record.id || record.eventId || record.event_id || record.auditId || record.audit_id
    || record.taskId || record.task_id || record.reportId || record.report_id
    || record.campaignId || record.campaign_id
    || record.attemptId || record.attempt_id || record.replyId || record.reply_id
    || record.key || record.slug);
}
