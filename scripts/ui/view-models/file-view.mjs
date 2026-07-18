import { buildGenericItemLink, buildExactObjectLink } from "../route-compatibility.mjs";
import {
  FILE_SOURCE_MATRIX,
  collectFileSourceRecords,
  fileSourceName
} from "./file-sources.mjs";

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

function values(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
}

function uniqueText(...inputs) {
  return [...new Set(inputs.flatMap(values).map(clean).filter(Boolean))];
}

function normalizeKey(value = "") {
  return lower(value).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");
}

function validTimestamp(value = "") {
  const text = clean(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return "";
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  return Number.isFinite(parsed) ? text : "";
}

function timestampValue(value = "") {
  const timestamp = validTimestamp(value);
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? `${timestamp}T00:00:00.000Z` : timestamp);
}

function firstTimestamp(record = {}, fields = []) {
  for (const field of fields) {
    const timestamp = validTimestamp(record[field]);
    if (timestamp) return timestamp;
  }
  return null;
}

function sourceStatus(record = {}) {
  const raw = clean(
    record.status || record.evidenceStatus || record.evidence_status
    || record.review_state || record.reviewState || record.approvalStatus || record.approval_status
  ) || (record.approved === true ? "approved" : "");
  const key = normalizeKey(raw);
  return {
    available: Boolean(raw),
    key: key || null,
    label: raw ? raw.replaceAll(/[_-]+/g, " ").replace(/^./, (character) => character.toLocaleUpperCase("en-US")) : null,
    sourceStatus: raw || null
  };
}

function extensionFrom(record = {}) {
  const fields = ["fileName", "filename", "artifactFilename", "filePath", "markdownPath", "textPath", "fileUrl", "storageKey"];
  for (const field of fields) {
    const value = clean(record[field]).split(/[?#]/)[0];
    const match = value.match(/\.([a-z0-9]{1,8})$/i);
    if (match) return lower(match[1]);
  }
  return "";
}

function fileType(candidate = {}) {
  const record = candidate.record || {};
  const mime = lower(record.mimeType || record.mime_type || record.contentType || record.content_type);
  const semantic = normalizeKey(record.fileType || record.file_type || record.itemType || record.item_type || record.assetType || record.asset_type || record.type);
  const extension = extensionFrom(record);
  let key = "unknown";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension) || /(?:image|logo|photo|graphic|illustration)/.test(semantic)) key = "image";
  else if (mime === "application/pdf" || extension === "pdf" || semantic === "pdf") key = "pdf";
  else if (["md", "mdx", "markdown"].includes(extension) || semantic === "markdown") key = "markdown";
  else if (mime.startsWith("text/") || ["txt", "rtf"].includes(extension) || ["text", "note", "evidence_note", "policy"].includes(semantic)) key = "text";
  else if (["csv", "xls", "xlsx", "ods"].includes(extension) || /spreadsheet/.test(semantic)) key = "spreadsheet";
  else if (["ppt", "pptx", "odp", "key"].includes(extension) || /presentation|slide_deck/.test(semantic)) key = "presentation";
  else if (["folder", "collection", "directory"].includes(semantic)) key = "collection";
  else if (["link", "url", "website"].includes(semantic)) key = "link";
  else if (candidate.sourceKind === "report" || /report/.test(semantic)) key = "report";
  else if (["evidence-note", "soc2-policy"].includes(candidate.sourceKind)) key = "text";
  const labels = {
    image: "Image", pdf: "PDF", markdown: "Markdown", text: "Text document", link: "Link",
    report: "Report", spreadsheet: "Spreadsheet", presentation: "Presentation",
    collection: "Folder or collection", unknown: "Unknown"
  };
  return { key, label: labels[key], available: key !== "unknown", mimeType: mime || null, extension: extension || null };
}

function explicitPublic(record = {}) {
  return record.public === true
    || record.isPublic === true
    || record.publiclyAccessible === true
    || ["public", "published_public"].includes(normalizeKey(record.visibility || record.access));
}

function safePublicUrl(value = "") {
  const text = clean(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeInternalReference(value = "") {
  const text = clean(value);
  if (!text || text.length > 500 || /[\u0000-\u001f\u007f]/.test(text)) return null;
  if (/^(?:file:|[a-z]:[\\/]|\\\\|\/home\/|\/tmp\/|\/workspaces\/)/i.test(text)) return null;
  if (text.startsWith("/") && !/^\/(?:api|assets|data)\//.test(text)) return null;
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(text)) return null;
  if (/^https?:/i.test(text)) return null;
  if (/[?&](?:token|signature|sig|key|credential|x-amz-)[^=]*=/i.test(text)) return null;
  return text;
}

function storageReference(record = {}, canViewPrivateAssets = false) {
  const publicCandidates = [record.publicUrl, record.public_url, record.sourceLink, record.source_link, record.link, record.fileUrl, record.file_url];
  const publicUrl = explicitPublic(record)
    ? publicCandidates.map(safePublicUrl).find(Boolean) || null
    : null;
  const referenceFields = [
    "storageRef", "storage_ref", "storageKey", "storage_key", "objectKey", "object_key",
    "fileUrl", "file_url", "filePath", "file_path", "markdownPath", "markdown_path",
    "textPath", "text_path", "artifactFilename", "downloadUrl", "download_url", "link", "sourceLink", "source_link"
  ];
  const allPrivateReferences = uniqueText(referenceFields.map((field) => record[field]))
    .map(safeInternalReference).filter(Boolean);
  const references = canViewPrivateAssets ? allPrivateReferences : [];
  const generated = Boolean(validTimestamp(record.generatedAt || record.generated_at) || clean(record.artifactFilename));
  const linked = Boolean(clean(record.sourceLink || record.source_link || record.link));
  const kind = generated ? "generated" : linked ? "linked" : allPrivateReferences.length ? "stored" : "metadata_only";
  return {
    kind,
    available: Boolean(publicUrl || references.length),
    reference: references[0] || null,
    alternateReferences: references.slice(1),
    publicUrl,
    privateReferenceSuppressed: !canViewPrivateAssets && allPrivateReferences.length > 0,
    signedUrlReturned: false,
    localAbsolutePathReturned: false
  };
}

function exactRelatedLink(kind, id, sourceKind = "") {
  if (!id) return null;
  if (kind === "Partner") return buildExactObjectLink({ objectType: "Partner", sourceKind: "partner", sourceId: id })?.target || null;
  if (kind === "Campaign") return buildExactObjectLink({ objectType: "Campaign", sourceKind: "campaign", sourceId: id })?.target || null;
  if (kind === "Post") return buildExactObjectLink({ objectType: "Post", sourceKind: "post", sourceId: id })?.target || null;
  if (kind === "File") return buildExactObjectLink({ objectType: "File", sourceKind, sourceId: id })?.target || null;
  if (kind === "Program") return buildGenericItemLink({ collection: "partnerPrograms", sourceId: id })?.target || null;
  return null;
}

function relatedObjects(candidate = {}) {
  const record = candidate.record || {};
  const relationships = [];
  const add = (kind, ids, relationship, sourceCollection, sourceKind = "") => {
    for (const id of uniqueText(ids)) {
      const href = exactRelatedLink(kind, id, sourceKind);
      if (!href) continue;
      relationships.push({ kind, id, relationship, sourceCollection, sourceKind: sourceKind || null, href });
    }
  };
  add("Partner", [record.partnerId, record.partner_id, record.relatedPartnerId, record.related_partner_id, record.relatedPartner], "related_partner", "partners");
  add("Campaign", [record.campaignId, record.campaign_id, record.relatedCampaignId, record.related_campaign_id, record.relatedCampaign], "related_campaign", "campaigns");
  add("Post", [record.postId, record.post_id, record.postIds, record.post_ids, record.relatedPostId, record.related_post_id, record.relatedPost], "related_post", "posts");
  add("Program", [record.programId, record.program_id, record.partnerProgramId, record.partner_program_id, record.relatedProgramId, record.related_program_id], "related_program", "partnerPrograms");
  add("File", [record.reportId, record.report_id], "related_report", "reports", "report");
  add("File", [record.evidenceId, record.evidence_id], "related_evidence", "evidencePackNotes", "evidence-note");
  const explicitSource = record.sourceRef || record.source_ref;
  if (explicitSource && typeof explicitSource === "object") {
    const collection = clean(explicitSource.collection || explicitSource.sourceCollection);
    const id = clean(explicitSource.id || explicitSource.itemId || explicitSource.sourceId);
    const config = FILE_SOURCE_MATRIX.included.find((item) => item.collection === collection);
    if (config) add("File", id, "explicit_source", collection, config.sourceKind);
  }
  const versionFields = [
    [record.versionOfId || record.version_of_id, "version_of"],
    [record.previousVersionId || record.previous_version_id, "replaces"],
    [record.supersedesId || record.supersedes_id, "supersedes"]
  ];
  for (const [id, relationship] of versionFields) add("File", id, relationship, candidate.sourceCollection, candidate.sourceKind);
  const seen = new Set();
  return relationships.sort((left, right) =>
    left.relationship.localeCompare(right.relationship, "en-US")
    || left.kind.localeCompare(right.kind, "en-US")
    || left.id.localeCompare(right.id, "en-US")
  ).filter((item) => {
    const key = `${item.relationship}:${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function eventId(event = {}) {
  return clean(event.id || event.eventId || event.event_id || event.auditId || event.audit_id);
}

function eventTimestamp(event = {}) {
  return firstTimestamp(event, ["occurredAt", "occurred_at", "timestamp", "eventAt", "event_at", "createdAt", "created_at", "at"]);
}

function eventKind(event = {}) {
  const text = normalizeKey(event.kind || event.eventType || event.event_type || event.action || event.type);
  if (/creat|upload/.test(text)) return "created";
  if (/replac|supersed|new_version/.test(text)) return "replaced";
  if (/verif/.test(text)) return "verified";
  if (/shar/.test(text)) return "shared";
  if (/generat|export/.test(text)) return "generated";
  if (/updat|edit/.test(text)) return "updated";
  return "";
}

function eventLinkParts(event = {}) {
  const ref = event.sourceRef || event.source_ref || event.relatedObject || {};
  const ids = uniqueText(event.sourceId, event.source_id, event.resourceId, event.resource_id, event.relatedObjectId, event.related_object_id, event.objectId, ref.id, ref.itemId, ref.sourceId);
  const types = uniqueText(event.sourceCollection, event.source_collection, event.resourceType, event.resource_type, event.relatedObjectType, event.related_object_type, event.objectType, ref.collection, ref.sourceCollection).map(normalizeKey);
  return { ids, types };
}

function createActivityIndex(state = {}) {
  const index = new Map();
  const add = (key, value) => {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(value);
  };
  const sharedEvents = [
    ...list(state.activityEvents).map((event) => ({ event, sourceCollection: "activityEvents" })),
    ...list(state.auditHistory).map((event) => ({ event, sourceCollection: "auditHistory" }))
  ];
  for (const { event, sourceCollection } of sharedEvents) {
    const id = eventId(event);
    const kind = eventKind(event);
    const occurredAt = eventTimestamp(event);
    if (!id || !kind || !occurredAt) continue;
    const projected = { id, kind, occurredAt, sourceCollection };
    const { ids, types } = eventLinkParts(event);
    for (const type of types) {
      if (type === "file") continue;
      for (const sourceId of ids) add(`${type}:${sourceId}`, projected);
    }
  }
  return index;
}

function activity(activityIndex, candidate = {}) {
  const localEvents = [...list(candidate.record.activity), ...list(candidate.record.history)].map((event) => ({ event, sourceCollection: candidate.sourceCollection, local: true }));
  const sharedEvents = [
    ...list(activityIndex.get(`${normalizeKey(candidate.sourceCollection)}:${candidate.sourceId}`)),
    ...list(activityIndex.get(`${normalizeKey(candidate.sourceKind)}:${candidate.sourceId}`))
  ];
  const labels = { created: "File created", replaced: "File replaced", verified: "File verified", shared: "File shared", generated: "File generated", updated: "File updated" };
  const seen = new Set();
  return [
    ...localEvents.map(({ event, sourceCollection }) => ({
      id: eventId(event), kind: eventKind(event), occurredAt: eventTimestamp(event), sourceCollection
    })),
    ...sharedEvents
  ].map((event) => {
    return event.id && event.kind && event.occurredAt
      ? { ...event, label: labels[event.kind] }
      : null;
  }).filter(Boolean).sort((left, right) =>
    timestampValue(right.occurredAt) - timestampValue(left.occurredAt)
    || left.id.localeCompare(right.id, "en-US")
  ).filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

function permissions(record = {}, role = "", canViewPrivateAssets = false) {
  const allowedRoles = uniqueText(record.allowedRoles, record.allowed_roles).map(lower).sort();
  const visibility = normalizeKey(record.visibility || record.access);
  return {
    actorRole: role,
    visibility: visibility || "unavailable",
    allowedRoles,
    ownerOnly: record.ownerOnly === true || record.owner_only === true || ["owner", "owner_only"].includes(visibility),
    sensitive: record.sensitive === true || ["private", "sensitive"].includes(visibility),
    canViewRecord: true,
    canViewPrivateStorageMetadata: canViewPrivateAssets,
    grantsAccess: false
  };
}

function explicitDuplicateTarget(candidate = {}) {
  return clean(candidate.record.duplicateOfId || candidate.record.duplicate_of_id || candidate.record.canonicalSourceId || candidate.record.canonical_source_id);
}

function projectCandidate(state, candidate, context, duplicateSourceIds = [], mirrorCollections = []) {
  const record = candidate.record;
  return {
    id: candidate.stableKey,
    stableKey: candidate.stableKey,
    name: fileSourceName(candidate),
    fileType: fileType(candidate),
    sourceCollection: candidate.sourceCollection,
    sourceKind: candidate.sourceKind,
    sourceId: candidate.sourceId,
    status: sourceStatus(record),
    owner: clean(record.owner || record.createdBy || record.created_by) || null,
    modifiedAt: firstTimestamp(record, ["updatedAt", "updated_at", "lastUpdated", "last_updated", "generatedAt", "generated_at", "createdAt", "created_at"]),
    verifiedAt: firstTimestamp(record, ["verifiedAt", "verified_at", "verificationDate", "verification_date"]),
    storageRef: storageReference(record, context.canViewPrivateAssets),
    sourceRef: {
      collection: candidate.sourceCollection,
      sourceKind: candidate.sourceKind,
      sourceId: candidate.sourceId,
      rawCollection: candidate.rawCollection,
      mirrorCollections: [...mirrorCollections].sort(),
      duplicateSourceIds: [...duplicateSourceIds].sort()
    },
    relatedObjects: relatedObjects(candidate),
    permissions: permissions(record, context.role, context.canViewPrivateAssets),
    activity: activity(context.activityIndex, candidate),
    href: candidate.href
  };
}

export function buildFileProjection(state = {}, actor = {}, _now = "") {
  const context = collectFileSourceRecords(state, actor);
  if (!context.role) return deepFreeze({
    files: [],
    diagnostics: { candidateRecordsScanned: 0, projectedFiles: 0, deduplications: 0 }
  });
  const byStableKey = new Map();
  const mirrorCollectionsByTarget = new Map();
  context.activityIndex = createActivityIndex(state);
  let deduplications = 0;
  for (const candidate of context.candidates) {
    if (byStableKey.has(candidate.stableKey)) {
      const canonical = byStableKey.get(candidate.stableKey);
      if (candidate.rawCollection !== canonical.rawCollection) {
        if (!mirrorCollectionsByTarget.has(candidate.stableKey)) mirrorCollectionsByTarget.set(candidate.stableKey, []);
        mirrorCollectionsByTarget.get(candidate.stableKey).push(candidate.rawCollection);
      }
      deduplications += 1;
      continue;
    }
    byStableKey.set(candidate.stableKey, candidate);
  }
  const duplicateIdsByTarget = new Map();
  const suppressed = new Set();
  for (const candidate of byStableKey.values()) {
    const targetId = explicitDuplicateTarget(candidate);
    if (!targetId || targetId === candidate.sourceId) continue;
    const targetKey = `${candidate.sourceKind}:${targetId}`;
    if (!byStableKey.has(targetKey)) continue;
    suppressed.add(candidate.stableKey);
    if (!duplicateIdsByTarget.has(targetKey)) duplicateIdsByTarget.set(targetKey, []);
    duplicateIdsByTarget.get(targetKey).push(candidate.sourceId);
    deduplications += 1;
  }
  const files = [...byStableKey.values()]
    .filter((candidate) => !suppressed.has(candidate.stableKey))
    .map((candidate) => projectCandidate(
      state,
      candidate,
      context,
      duplicateIdsByTarget.get(candidate.stableKey) || [],
      mirrorCollectionsByTarget.get(candidate.stableKey) || []
    ))
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey, "en-US"));
  return deepFreeze({
    files,
    diagnostics: {
      candidateRecordsScanned: context.candidateRecordsScanned,
      projectedFiles: files.length,
      deduplications
    }
  });
}

export function buildFileViews(state = {}, actor = {}, now = "") {
  return buildFileProjection(state, actor, now).files;
}

export function buildFileView(state = {}, stableKey = "", actor = {}, now = "") {
  return buildFileViews(state, actor, now).find((file) => file.stableKey === clean(stableKey)) || null;
}
