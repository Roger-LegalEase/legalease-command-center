import { recordVisibleToActor } from "../../global-search-service.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "../route-compatibility.mjs";
import { adaptPartnerStage } from "./partner-stage.mjs";
import {
  PARTNER_ACTIVITY_EVENT_TYPES,
  PARTNER_ACTIVITY_SOURCE_MATRIX,
  authorizedSourceRecords,
  partnerActivityActorContext,
  sourceRecordId
} from "./partner-activity-sources.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const GENERIC_EVENT_COLLECTIONS = new Set(["activityEvents", "auditHistory", "automationEvents", "companyEvents"]);
const DEDUPE_REFERENCE_COLLECTIONS = new Set([
  "activityEvents", "auditHistory", "automationEvents", "companyEvents", "tasks", "reports",
  "partnerProgramArtifacts", "evidencePackNotes", "dataRoomItems", "campaigns", "outreachCampaigns",
  "partnerPrograms", "posts"
]);
const SOURCE_PRIORITY = new Map([
  ["partners.history", 10], ["outreachReplies", 20], ["outreachAttempts", 21], ["tasks", 22],
  ["reports", 23], ["partnerProgramArtifacts", 24], ["evidencePackNotes", 25], ["dataRoomItems", 26],
  ["campaigns.distributionActions", 27], ["automationEvents", 40], ["companyEvents", 50],
  ["activityEvents", 60], ["auditHistory", 70]
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function values(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
}

function uniqueText(...inputs) {
  return [...new Set(inputs.flatMap(values).map(clean).filter(Boolean))];
}

function normalizeKey(value = "") {
  return lower(value).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");
}

function stableRecords(records = []) {
  return [...records].sort((left, right) =>
    sourceRecordId(left).localeCompare(sourceRecordId(right), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
}

function validTimestamp(value = "") {
  const text = clean(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return "";
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  return Number.isFinite(parsed) ? text : "";
}

function safeIdentifier(value = "") {
  const id = clean(value);
  if (!id || /^(?:\/|[a-z]:\\|https?:\/\/)/i.test(id)
    || /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(id)
    || /(?:bearer\s+|service[_ -]?role|api[_ -]?key|token[=:]|secret[=:]|(?:^|[^a-z0-9])sk-[a-z0-9_-]{12,}|whsec_)/i.test(id)) return "";
  return buildGenericItemLink({ collection: "tasks", sourceId: id }) ? id : "";
}

function timestampValue(value = "") {
  const timestamp = validTimestamp(value);
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? `${timestamp}T00:00:00.000Z` : timestamp);
}

function occurredAt(record = {}, collection = "") {
  const fields = {
    "partners.history": ["occurredAt", "occurred_at", "timestamp", "eventAt", "event_at", "at", "createdAt", "created_at", "date"],
    outreachReplies: ["repliedAt", "replied_at", "receivedAt", "received_at", "occurredAt", "occurred_at", "createdAt", "created_at"],
    outreachAttempts: ["sentAt", "sent_at", "occurredAt", "occurred_at", "createdAt", "created_at"],
    tasks: ["completedAt", "completed_at"],
    reports: ["generatedAt", "generated_at", "createdAt", "created_at"],
    partnerProgramArtifacts: ["generatedAt", "generated_at", "createdAt", "created_at"],
    evidencePackNotes: ["occurredAt", "occurred_at", "timestamp", "createdAt", "created_at", "date"],
    dataRoomItems: ["sharedAt", "shared_at"],
    "campaigns.distributionActions": ["occurredAt", "occurred_at", "sentAt", "sent_at", "sharedAt", "shared_at", "timestamp", "date"]
  }[collection] || [
    "occurredAt", "occurred_at", "repliedAt", "replied_at", "receivedAt", "received_at",
    "sentAt", "sent_at", "timestamp", "eventAt", "event_at", "at", "createdAt", "created_at", "date"
  ];
  for (const field of fields) {
    const timestamp = validTimestamp(record[field]);
    if (timestamp) return timestamp;
  }
  return null;
}

function exactLink(kind, id, sourceKind = "") {
  const sourceId = clean(id);
  if (!sourceId) return null;
  if (kind === "Task" || kind === "Program" || kind === "Artifact") {
    const collection = kind === "Task" ? "tasks" : kind === "Program" ? "partnerPrograms" : "partnerProgramArtifacts";
    return buildGenericItemLink({ collection, sourceId })?.target || null;
  }
  return buildExactObjectLink({ objectType: kind, sourceKind, sourceId })?.target || null;
}

function recordPartnerIds(record = {}) {
  const ids = uniqueText(record.partnerId, record.partner_id, record.relatedPartnerId, record.related_partner_id);
  const refs = [record.sourceRef, record.source_ref, record.relatedObject].filter((item) => item && typeof item === "object");
  for (const ref of refs) {
    const type = normalizeKey(ref.type || ref.kind || ref.objectType || ref.collection || ref.sourceCollection);
    if (["partner", "partners"].includes(type)) ids.push(clean(ref.id || ref.itemId || ref.sourceId));
  }
  for (const related of list(record.relatedObjects)) {
    if (["partner", "partners"].includes(normalizeKey(related.type || related.kind || related.objectType))) {
      ids.push(clean(related.id || related.sourceId));
    }
  }
  const relatedType = normalizeKey(record.relatedObjectType || record.related_object_type || record.resourceType || record.resource_type || record.objectType);
  if (["partner", "partners"].includes(relatedType)) {
    ids.push(clean(record.relatedObjectId || record.related_object_id || record.resourceId || record.resource_id || record.objectId));
  }
  if (normalizeKey(record.relatedEntityType || record.related_entity_type) === "partner") {
    ids.push(clean(record.relatedEntityId || record.related_entity_id));
  }
  return [...new Set(ids.filter(Boolean))];
}

function relatedId(record = {}, kind = "") {
  const fields = {
    campaign: ["campaignId", "campaign_id", "relatedCampaignId", "related_campaign_id"],
    task: ["taskId", "task_id", "relatedTaskId", "related_task_id"],
    post: ["postId", "post_id", "relatedPostId", "related_post_id"],
    program: ["partnerProgramId", "partner_program_id", "programId", "program_id"],
    report: ["reportId", "report_id"],
    file: ["dataRoomItemId", "data_room_item_id", "fileId", "file_id"]
  }[kind] || [];
  for (const field of fields) if (clean(record[field])) return clean(record[field]);
  const relatedType = normalizeKey(record.relatedObjectType || record.related_object_type || record.resourceType || record.resource_type);
  if (relatedType === kind || relatedType === `${kind}s`) {
    return clean(record.relatedObjectId || record.related_object_id || record.resourceId || record.resource_id);
  }
  const entityType = normalizeKey(record.relatedEntityType || record.related_entity_type);
  if (entityType === kind || entityType === `${kind}s`) {
    return clean(record.relatedEntityId || record.related_entity_id);
  }
  return "";
}

function visibleRecordMap(state, collection, role) {
  const records = new Map();
  for (const record of stableRecords(authorizedSourceRecords(state, collection, role))) {
    const id = sourceRecordId(record);
    if (id && !records.has(id)) records.set(id, record);
  }
  return records;
}

function createRelationshipIndex(state = {}, role = "") {
  const campaignByCollection = new Map([
    ["campaigns", visibleRecordMap(state, "campaigns", role)],
    ["outreachCampaigns", visibleRecordMap(state, "outreachCampaigns", role)]
  ]);
  const programById = visibleRecordMap(state, "partnerPrograms", role);
  const postById = visibleRecordMap(state, "posts", role);
  const linkedByCollection = new Map();
  for (const collection of ["tasks", "reports", "dataRoomItems", "evidencePackNotes", "partnerProgramArtifacts"]) {
    linkedByCollection.set(collection, visibleRecordMap(state, collection, role));
  }
  return { campaignByCollection, programById, postById, linkedByCollection };
}

function campaignRecord(index, campaignId = "", preferredCollection = "") {
  const id = clean(campaignId);
  if (!id) return null;
  if (preferredCollection) {
    const preferred = index.campaignByCollection.get(preferredCollection)?.get(id);
    if (preferred) return { collection: preferredCollection, record: preferred };
  }
  const matches = ["campaigns", "outreachCampaigns"].map((collection) => ({
    collection,
    record: index.campaignByCollection.get(collection)?.get(id)
  })).filter((item) => item.record);
  if (matches.length === 1) return matches[0];
  if (matches.length === 2) {
    const left = recordPartnerIds(matches[0].record).sort();
    const right = recordPartnerIds(matches[1].record).sort();
    if (stableSerialize(left) === stableSerialize(right)) return matches[0];
  }
  return null;
}

function campaignPartnerIds(index, campaignId = "", preferredCollection = "") {
  const item = campaignRecord(index, campaignId, preferredCollection);
  return item ? recordPartnerIds(item.record) : [];
}

function programPartnerIds(index, programId = "") {
  const program = index.programById.get(clean(programId));
  return program ? recordPartnerIds(program) : [];
}

function explicitPartnerIds(record, collection, index) {
  const ids = recordPartnerIds(record);
  const campaignId = relatedId(record, "campaign") || (collection.startsWith("outreach") ? clean(record.campaignId || record.campaign_id) : "");
  const ref = sourceReference(record);
  const preferredCampaignCollection = ["campaigns", "outreachCampaigns"].includes(ref?.collection)
    ? ref.collection
    : collection.startsWith("outreach") ? "outreachCampaigns" : "";
  ids.push(...campaignPartnerIds(index, campaignId, preferredCampaignCollection));
  const programId = relatedId(record, "program") || (collection === "partnerProgramArtifacts" ? clean(record.partnerProgramId) : "");
  ids.push(...programPartnerIds(index, programId));
  const typeToCollection = {
    task: "tasks", tasks: "tasks", report: "reports", reports: "reports",
    data_room_item: "dataRoomItems", dataroomitem: "dataRoomItems", dataroomitems: "dataRoomItems",
    evidence_note: "evidencePackNotes", evidencepacknotes: "evidencePackNotes",
    partner_program_artifact: "partnerProgramArtifacts", partnerprogramartifacts: "partnerProgramArtifacts"
  };
  const relatedType = normalizeKey(record.relatedObjectType || record.related_object_type || record.resourceType || record.resource_type);
  const linkedCollection = ref?.collection || typeToCollection[relatedType] || "";
  const linkedId = ref?.id || clean(record.relatedObjectId || record.related_object_id || record.resourceId || record.resource_id);
  const linked = index.linkedByCollection.get(linkedCollection)?.get(linkedId);
  if (linked) {
    ids.push(...recordPartnerIds(linked));
    ids.push(...campaignPartnerIds(index, relatedId(linked, "campaign"), linkedCollection === "outreachCampaigns" ? "outreachCampaigns" : ""));
    ids.push(...programPartnerIds(index, relatedId(linked, "program") || linked.partnerProgramId));
  }
  return [...new Set(ids.filter(Boolean))];
}

function sourceReference(record = {}) {
  const ref = record.sourceRef || record.source_ref;
  if (!ref || typeof ref !== "object") return null;
  const collection = clean(ref.collection || ref.sourceCollection);
  const id = clean(ref.id || ref.itemId || ref.sourceId);
  return collection && id ? { collection, id } : null;
}

function eventKind(record = {}, collection = "") {
  const status = normalizeKey(record.status || record.state);
  const text = normalizeKey(record.eventType || record.event_type || record.action || record.kind || record.type || record.activityType || record.channel);
  if (collection === "outreachReplies") return "reply";
  if (collection === "outreachAttempts") return status === "sent" ? "outreach" : "";
  if (collection === "tasks") return ["done", "completed", "complete"].includes(status) ? "task" : "";
  if (collection === "reports" || collection === "partnerProgramArtifacts") return "document";
  if (collection === "evidencePackNotes") return "note";
  if (collection === "dataRoomItems") {
    return record.shared === true || record.externallyShared === true || record.sharedExternally === true
      || status === "shared" || validTimestamp(record.sharedAt || record.shared_at) ? "file" : "";
  }
  if (collection === "campaigns.distributionActions") return /sent|shared|distributed|published/.test(text) ? "outreach" : "";
  const hasStageValues = uniqueText(record.fromStage, record.from_stage, record.toStage, record.to_stage, record.previousStage, record.previous_stage).length > 0;
  if (hasStageValues || /stage_(?:change|changed|transition)|lifecycle_(?:change|changed|transition)/.test(text)) return "stage_change";
  if (/reply|response_received|email_received/.test(text)) return "reply";
  if (/meeting|calendar_event|intro_(?:held|completed)/.test(text)) return "meeting";
  if (/note|comment_added/.test(text)) return "note";
  if (/outreach.*(?:sent|completed)|message_sent|email_sent/.test(text)) return "outreach";
  if (/proposal_(?:created|generated)|report_(?:created|generated|exported)|document_(?:created|generated)/.test(text)) return "document";
  if (/file_(?:shared|replaced)|document_shared/.test(text)) return "file";
  if (/task_(?:completed|done)|completed_task/.test(text)) return "task";
  return "";
}

function eventTypeContract(kind = "") {
  return PARTNER_ACTIVITY_EVENT_TYPES.find((item) => item.key === kind) || null;
}

function safeDisplayText(value = "", max = 160) {
  const text = clean(value).replaceAll(/\s+/g, " ").slice(0, max);
  if (!text || /^(?:\/|[a-z]:\\|https?:\/\/)/i.test(text)
    || /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(text)
    || /(?:bearer\s+|service[_ -]?role|api[_ -]?key|token[=:]|secret[=:]|(?:^|[^a-z0-9])sk-[a-z0-9_-]{12,}|whsec_)/i.test(text)) return null;
  return text;
}

function stagePresentation(value = "") {
  const internal = clean(value);
  if (!internal) return { internal: null, uiStage: null, outcome: null, attention: null };
  const adapted = adaptPartnerStage({ stage: internal });
  return {
    internal,
    uiStage: adapted.uiStageKey === "unavailable" ? null : { key: adapted.uiStageKey, label: adapted.uiStageLabel },
    outcome: adapted.outcome.available ? { key: adapted.outcome.key, label: adapted.outcome.label } : null,
    attention: adapted.attentionCondition ? { ...adapted.attentionCondition } : null
  };
}

function stageChange(record = {}, kind = "") {
  if (kind !== "stage_change") return null;
  const fromValue = clean(record.fromStage || record.from_stage || record.previousStage || record.previous_stage || record.oldStage || record.old_stage);
  const toValue = clean(record.toStage || record.to_stage || record.newStage || record.new_stage);
  const from = stagePresentation(fromValue);
  const to = stagePresentation(toValue);
  const internalHealthFrom = safeDisplayText(record.fromHealth || record.from_health, 80);
  const internalHealthTo = safeDisplayText(record.toHealth || record.to_health, 80);
  const healthPresentation = (value) => {
    const key = normalizeKey(value);
    if (["healthy", "on_track", "good", "green"].includes(key)) return { key: "on_track", label: "On track" };
    if (["needs_attention", "at_risk", "watch", "yellow", "stalled", "paused", "dormant", "blocked", "critical", "red"].includes(key)) {
      return { key: "needs_attention", label: "Needs attention" };
    }
    return null;
  };
  return {
    available: Boolean(fromValue || toValue || internalHealthFrom || internalHealthTo),
    internalFrom: from.internal,
    internalTo: to.internal,
    fromStage: from.uiStage,
    toStage: to.uiStage,
    fromOutcome: from.outcome,
    toOutcome: to.outcome,
    internalHealthFrom,
    internalHealthTo,
    healthAttention: {
      from: from.attention || healthPresentation(internalHealthFrom),
      to: to.attention || healthPresentation(internalHealthTo)
    },
    primaryStageMovement: Boolean(from.uiStage && to.uiStage && from.uiStage.key !== to.uiStage.key),
    inferredFromCurrentPartnerStage: false,
    changesPartnerStage: false
  };
}

function eventSummary(kind, record, stage, canReadSensitive) {
  if (kind === "stage_change") {
    if (stage?.fromStage && stage?.toStage) return `${stage.fromStage.label} to ${stage.toStage.label}.`;
    if (stage?.toOutcome) return `Partner outcome recorded as ${stage.toOutcome.label}.`;
    if (stage?.healthAttention?.to) return "Relationship attention changed.";
    return "Partner stage change recorded.";
  }
  if (kind === "reply") return "Partner reply recorded.";
  if (kind === "meeting") return canReadSensitive && safeDisplayText(record.title || record.name, 120) || "Partner meeting recorded.";
  if (kind === "note") return "Partner note recorded.";
  if (kind === "outreach") return "Partner outreach sent.";
  if (kind === "document") return safeDisplayText(record.reportTitle || record.title || record.name, 120) || "Partner document created.";
  if (kind === "file") return safeDisplayText(record.title || record.name || record.fileName, 120) || "Partner file shared.";
  if (kind === "task") return safeDisplayText(record.title || record.name, 120) || "Partner task completed.";
  return "Partner activity recorded.";
}

function safeActor(record = {}) {
  const value = safeDisplayText(record.actorName || record.actor || record.owner || record.createdBy || record.created_by, 80);
  if (!value || /[_:@]|sendgrid|google|webhook|provider|system/i.test(value)) return null;
  return value;
}

function candidateSourceId(record, collection, partnerId = "") {
  const id = safeIdentifier(sourceRecordId(record));
  if (id) return id;
  if (collection === "partners.history") return safeIdentifier(`${partnerId}:history:${stableHash(stableSerialize(record))}`);
  return "";
}

function identityKeys(record, collection, sourceId, kind) {
  const keys = [];
  for (const value of uniqueText(record.sharedEventId, record.shared_event_id, record.eventId, record.event_id)) {
    const id = safeIdentifier(value);
    if (id) keys.push(`event:${kind}:${id}`);
  }
  const ref = sourceReference(record);
  const refId = safeIdentifier(ref?.id);
  if (refId && DEDUPE_REFERENCE_COLLECTIONS.has(ref.collection)) {
    keys.push(`source:${kind}:${ref.collection}:${refId}`);
    if (GENERIC_EVENT_COLLECTIONS.has(ref.collection)) keys.push(`event:${kind}:${refId}`);
  }
  for (const key of uniqueText(record.idempotencyKey, record.idempotency_key, record.providerEventId, record.provider_event_id)) {
    keys.push(`idempotency:${kind}:${key}`);
  }
  if (GENERIC_EVENT_COLLECTIONS.has(collection)) keys.push(`event:${kind}:${sourceId}`);
  keys.push(`source:${kind}:${collection}:${sourceId}`);
  return [...new Set(keys)];
}

function publicIdentityKey(key = "") {
  const match = /^idempotency:([^:]+):([\s\S]+)$/.exec(key);
  return match ? `idempotency:${match[1]}:${stableHash(match[2])}` : key;
}

function canonicalCampaignHref(index, campaignId = "", preferredCollection = "") {
  const item = campaignRecord(index, campaignId, preferredCollection);
  return item?.collection === "campaigns" ? exactLink("Campaign", campaignId, "campaign") : null;
}

function sourceHref(collection, record, sourceId, index) {
  if (collection === "partners.history") return exactLink("Partner", record.__partnerId, "partner");
  if (collection === "tasks") return exactLink("Task", sourceId);
  if (collection === "reports") return exactLink("File", sourceId, "report");
  if (collection === "evidencePackNotes") return exactLink("File", sourceId, "evidence-note");
  if (collection === "dataRoomItems") return exactLink("File", sourceId, "data-room-item");
  if (collection === "partnerProgramArtifacts") return exactLink("Artifact", sourceId);
  const campaignId = relatedId(record, "campaign") || clean(record.campaignId || record.campaign_id || record.__campaignId);
  const preferredCollection = collection.startsWith("outreach") ? "outreachCampaigns" : collection === "campaigns.distributionActions" ? "campaigns" : "";
  if (campaignId) return canonicalCampaignHref(index, campaignId, preferredCollection);
  return null;
}

function relatedObjects(record, collection, partnerId, sourceId, index) {
  const items = [{ kind: "Partner", id: partnerId, href: exactLink("Partner", partnerId, "partner") }];
  const add = (kind, id, sourceKind = "", visible = true) => {
    const cleanId = clean(id);
    if (!cleanId || !visible) return;
    const href = exactLink(kind, cleanId, sourceKind);
    if (href) items.push({ kind, id: cleanId, href });
  };
  const campaignId = relatedId(record, "campaign") || clean(record.campaignId || record.campaign_id || record.__campaignId);
  const preferredCampaignCollection = collection.startsWith("outreach") ? "outreachCampaigns" : collection === "campaigns.distributionActions" ? "campaigns" : "";
  const campaignHref = canonicalCampaignHref(index, campaignId, preferredCampaignCollection);
  if (campaignHref) items.push({ kind: "Campaign", id: campaignId, href: campaignHref });
  const taskId = relatedId(record, "task") || (collection === "tasks" ? sourceId : "");
  const postId = relatedId(record, "post");
  const programId = relatedId(record, "program") || (collection === "partnerProgramArtifacts" ? record.partnerProgramId : "");
  const reportId = relatedId(record, "report") || (collection === "reports" ? sourceId : "");
  const fileId = relatedId(record, "file") || (collection === "dataRoomItems" ? sourceId : "");
  add("Task", taskId, "", index.linkedByCollection.get("tasks")?.has(clean(taskId)));
  add("Post", postId, "post", index.postById.has(clean(postId)));
  add("Program", programId, "", index.programById.has(clean(programId)));
  add("File", reportId, "report", index.linkedByCollection.get("reports")?.has(clean(reportId)));
  add("File", fileId, "data-room-item", index.linkedByCollection.get("dataRoomItems")?.has(clean(fileId)));
  const linkedType = normalizeKey(record.relatedObjectType || record.related_object_type || record.resourceType || record.resource_type);
  const linkedId = clean(record.relatedObjectId || record.related_object_id || record.resourceId || record.resource_id);
  if (["data_room_item", "dataroomitem", "dataroomitems"].includes(linkedType)) add("File", linkedId, "data-room-item", index.linkedByCollection.get("dataRoomItems")?.has(linkedId));
  if (["report", "reports"].includes(linkedType)) add("File", linkedId, "report", index.linkedByCollection.get("reports")?.has(linkedId));
  if (["evidence_note", "evidencepacknotes"].includes(linkedType)) add("File", linkedId, "evidence-note", index.linkedByCollection.get("evidencePackNotes")?.has(linkedId));
  const seen = new Set();
  return items.sort((left, right) => left.kind.localeCompare(right.kind, "en-US") || left.id.localeCompare(right.id, "en-US")).filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (!item.href || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function projectCandidate(raw, context) {
  const { record, collection, sourceKind, partnerId } = raw;
  const { index, actorContext } = context;
  const kind = eventKind(record, collection);
  const contract = eventTypeContract(kind);
  const sourceId = candidateSourceId(record, collection, partnerId);
  if (!contract || !sourceId) return null;
  const stage = stageChange(record, kind);
  const id = `${collection}:${sourceId}:${kind}`;
  return {
    id,
    dedupeKey: null,
    type: contract.key,
    label: contract.label,
    summary: eventSummary(kind, record, stage, actorContext.canReadSensitive),
    occurredAt: occurredAt(record, collection),
    actor: safeActor(record),
    sourceCollection: collection,
    sourceKind,
    sourceId,
    sourceHref: sourceHref(collection, record, sourceId, index),
    relatedObjects: relatedObjects(record, collection, partnerId, sourceId, index),
    stageChange: stage,
    visibility: {
      actorRole: actorContext.role,
      redacted: Boolean(!actorContext.canReadSensitive && kind === "meeting"),
      sensitiveContentReturned: false
    },
    __identityKeys: identityKeys(record, collection, sourceId, kind)
  };
}

function sourceRows(state, role, targetPartner, index) {
  const rows = [];
  let candidatesScanned = 0;
  const add = (collection, sourceKind, record, forcedPartnerIds = []) => {
    candidatesScanned += 1;
    const partnerIds = forcedPartnerIds.length ? forcedPartnerIds : explicitPartnerIds(record, collection, index);
    if (!partnerIds.includes(targetPartner.id)) return;
    rows.push({ collection, sourceKind, record, partnerId: targetPartner.id });
  };
  for (const history of list(targetPartner.record.history)) {
    if (!recordVisibleToActor(history, role)) continue;
    add("partners.history", "partner-history", { ...history, __partnerId: targetPartner.id }, [targetPartner.id]);
  }
  for (const source of PARTNER_ACTIVITY_SOURCE_MATRIX.included) {
    if (source.collection === "partners.history" || source.collection === "campaigns.distributionActions") continue;
    for (const record of authorizedSourceRecords(state, source.collection, role)) add(source.collection, source.sourceKind, record);
  }
  for (const [campaignId, campaign] of index.campaignByCollection.get("campaigns").entries()) {
    const partnerIds = recordPartnerIds(campaign);
    for (const action of list(campaign.distributionActions || campaign.distribution_actions)) {
      if (!recordVisibleToActor(action, role)) continue;
      add("campaigns.distributionActions", "campaign-distribution", { ...action, __campaignId: campaignId }, partnerIds);
    }
  }
  return { rows, candidatesScanned };
}

function sourceDataPresent(state, partnerRecord) {
  if (Array.isArray(partnerRecord.history)) return true;
  for (const source of PARTNER_ACTIVITY_SOURCE_MATRIX.included) {
    const collection = source.collection === "campaigns.distributionActions" ? "campaigns" : source.collection;
    if (collection === "partners.history") continue;
    if (Array.isArray(state[collection])) return true;
  }
  return false;
}

function deduplicate(candidates) {
  const ordered = [...candidates].sort((left, right) =>
    (SOURCE_PRIORITY.get(left.sourceCollection) || 100) - (SOURCE_PRIORITY.get(right.sourceCollection) || 100)
    || left.sourceCollection.localeCompare(right.sourceCollection, "en-US")
    || left.sourceId.localeCompare(right.sourceId, "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
  const keyToEvent = new Map();
  const selected = [];
  let duplicatesRemoved = 0;
  for (const event of ordered) {
    const existing = event.__identityKeys.map((key) => keyToEvent.get(key)).find(Boolean);
    if (existing) {
      duplicatesRemoved += 1;
      for (const key of event.__identityKeys) keyToEvent.set(key, existing);
      continue;
    }
    const projected = { ...event, dedupeKey: publicIdentityKey(event.__identityKeys[0]) };
    delete projected.__identityKeys;
    selected.push(projected);
    for (const key of event.__identityKeys) keyToEvent.set(key, projected);
  }
  return { events: selected, duplicatesRemoved };
}

function sortedEvents(events) {
  return [...events].sort((left, right) =>
    timestampValue(right.occurredAt) - timestampValue(left.occurredAt)
    || left.label.localeCompare(right.label, "en-US")
    || left.id.localeCompare(right.id, "en-US")
  );
}

function filtersFor(events) {
  if (!events.length) return [];
  const represented = new Set(events.map((event) => eventTypeContract(event.type)?.filterKey).filter(Boolean));
  const filters = [{ key: "all", label: "All", count: events.length }];
  for (const type of PARTNER_ACTIVITY_EVENT_TYPES) {
    if (!represented.has(type.filterKey) || filters.some((item) => item.key === type.filterKey)) continue;
    filters.push({ key: type.filterKey, label: type.filterLabel, count: events.filter((event) => eventTypeContract(event.type)?.filterKey === type.filterKey).length });
  }
  return filters;
}

function unavailable(partnerId, generatedAt, reason) {
  return deepFreeze({
    partnerId: clean(partnerId) || null,
    generatedAt,
    available: false,
    availability: { state: "unavailable", reason },
    events: [],
    filters: [],
    counts: null
  });
}

export function buildPartnerActivity(state = {}, actor = {}, partnerId = "", now = "") {
  const generatedAt = validTimestamp(now) || null;
  const id = safeIdentifier(partnerId);
  const actorContext = partnerActivityActorContext(actor);
  if (!actorContext.authorized) return unavailable(id, generatedAt, "actor_cannot_read");
  if (!Array.isArray(state.partners)) return unavailable(id, generatedAt, "source_data_absent");
  const partnerRecord = stableRecords(authorizedSourceRecords(state, "partners", actorContext.role))
    .find((record) => sourceRecordId(record) === id);
  if (!partnerRecord) return unavailable(id, generatedAt, "partner_not_visible");
  if (!sourceDataPresent(state, partnerRecord)) return unavailable(id, generatedAt, "source_data_absent");
  const index = createRelationshipIndex(state, actorContext.role);
  const targetPartner = { id, record: partnerRecord };
  const collected = sourceRows(state, actorContext.role, targetPartner, index);
  const candidates = collected.rows.map((row) => projectCandidate(row, { index, actorContext })).filter(Boolean);
  const deduped = deduplicate(candidates);
  const events = sortedEvents(deduped.events);
  return deepFreeze({
    partnerId: id,
    generatedAt,
    available: true,
    availability: { state: events.length ? "available_with_events" : "available_empty", reason: null },
    events,
    filters: filtersFor(events),
    counts: {
      candidatesScanned: collected.candidatesScanned,
      authorizedEvents: candidates.length,
      duplicatesRemoved: deduped.duplicatesRemoved,
      projectedEvents: events.length
    }
  });
}

export function filterPartnerActivity(projection = {}, filterKey = "all") {
  const requested = clean(filterKey) || "all";
  if (projection?.available !== true || !Array.isArray(projection.events) || !Array.isArray(projection.filters)) {
    return deepFreeze({ available: false, filterKey: null, events: [] });
  }
  const option = projection.filters.find((filter) => filter.key === requested);
  if (!option) return deepFreeze({ available: false, filterKey: null, events: [] });
  const events = requested === "all" ? [...projection.events] : projection.events.filter((event) =>
    eventTypeContract(event.type)?.filterKey === requested
  );
  return deepFreeze({ available: true, filterKey: requested, events });
}
