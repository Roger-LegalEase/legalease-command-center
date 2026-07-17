import {
  buildExactObjectLink,
  buildGenericItemLink
} from "../route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

const PROOF_COLLECTIONS = Object.freeze({
  reports: Object.freeze({ sourceKind: "report", objectType: "File", fileSourceKind: "report" }),
  dataRoomItems: Object.freeze({ sourceKind: "data-room-item", objectType: "File", fileSourceKind: "data-room-item" }),
  evidencePackNotes: Object.freeze({ sourceKind: "evidence-note", objectType: "File", fileSourceKind: "evidence-note" })
});

export const POST_SOURCE_MAPPINGS = Object.freeze({
  canonical: Object.freeze({ collection: "posts", sourceKind: "post", relationship: "record" }),
  idea: Object.freeze({ collection: "contentBank", sourceKind: "content-bank", relationship: "idea" }),
  intake: Object.freeze({ collection: "settings.sourceItems", sourceKind: "source-item", relationship: "source" }),
  calendar: Object.freeze({ collection: "embedded-calendar-import", sourceKind: "calendar-import", relationship: "calendar" }),
  proof: PROOF_COLLECTIONS,
  approvals: Object.freeze(["approvals", "approvalQueue", "queueItems"]),
  assets: Object.freeze(["postImages", "brandAssets", "postingKits"]),
  results: Object.freeze(["publishEvents"]),
  activity: Object.freeze(["activityEvents", "auditHistory", "publishEvents"])
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function stableId(record = {}) {
  return clean(record.id || record.key || record.slug);
}

function stableRecords(value = []) {
  return [...list(value)].sort((left, right) =>
    stableId(left).localeCompare(stableId(right), "en-US")
    || clean(left?.updatedAt || left?.updated_at || left?.createdAt || left?.created_at)
      .localeCompare(clean(right?.updatedAt || right?.updated_at || right?.createdAt || right?.created_at), "en-US")
  );
}

function values(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

function uniqueIds(...inputs) {
  return [...new Set(inputs.flatMap(values).map(clean).filter(Boolean))];
}

function genericHref(collection, sourceId) {
  return buildGenericItemLink({ collection, sourceId })?.target || "";
}

function exactHref(objectType, sourceKind, sourceId) {
  return buildExactObjectLink({ objectType, sourceKind, sourceId })?.target || "";
}

function sourceReference({
  sourceKind,
  sourceCollection,
  sourceId,
  relationship,
  href = ""
} = {}) {
  const id = clean(sourceId);
  const kind = clean(sourceKind);
  const collection = clean(sourceCollection);
  if (!kind || !id || !relationship) return null;
  return {
    sourceKind: kind,
    sourceCollection: collection,
    sourceId: id,
    relationship,
    href: clean(href)
  };
}

function referenceKey(reference = {}) {
  return [reference.relationship, reference.sourceCollection, reference.sourceKind, reference.sourceId].join(":");
}

function dedupeReferences(references = []) {
  const ranking = Object.freeze({ record: 0, idea: 1, source: 2, calendar: 3, proof: 4, repurposed_from: 5, generation: 6, approval: 7 });
  const ordered = references.filter(Boolean).sort((left, right) =>
    (ranking[left.relationship] ?? 99) - (ranking[right.relationship] ?? 99)
    || clean(left.sourceCollection).localeCompare(clean(right.sourceCollection), "en-US")
    || clean(left.sourceId).localeCompare(clean(right.sourceId), "en-US")
  );
  const seen = new Set();
  return ordered.filter((reference) => {
    const key = referenceKey(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recordPointsToPost(record = {}, postId = "") {
  const direct = uniqueIds(
    record.postId,
    record.post_id,
    record.relatedPostId,
    record.related_post_id,
    record.queuedPostId,
    record.generatedPostId,
    record.sourcePostId
  );
  const plural = uniqueIds(record.postIds, record.post_ids, record.generatedPostIds, record.relatedPostIds);
  return direct.includes(postId) || plural.includes(postId);
}

function explicitSourceRefs(post = {}) {
  return [post.sourceRef, post.proofSourceRef, ...list(post.sourceRefs), ...list(post.sourceReferences)]
    .filter((reference) => reference && typeof reference === "object")
    .map((reference) => ({
      collection: clean(reference.collection || reference.sourceCollection),
      sourceId: clean(reference.itemId || reference.sourceId || reference.id),
      sourceKind: clean(reference.sourceKind),
      relationship: clean(reference.relationship)
    }))
    .filter((reference) => reference.collection && reference.sourceId);
}

function contentBankReferences(state, post) {
  const postId = clean(post.id);
  const directIds = uniqueIds(post.contentBankIdeaId, post.content_bank_idea_id, post.ideaId);
  return stableRecords(state.contentBank)
    .filter((idea) => directIds.includes(stableId(idea)) || recordPointsToPost(idea, postId))
    .map((idea) => sourceReference({
      sourceKind: "content-bank",
      sourceCollection: "contentBank",
      sourceId: stableId(idea),
      relationship: "idea",
      href: genericHref("contentBank", stableId(idea))
    }));
}

function intakeReferences(state, post) {
  const postId = clean(post.id);
  const directIds = uniqueIds(post.sourceItemId, post.source_item_id);
  return stableRecords(state.settings?.sourceItems)
    .filter((item) => directIds.includes(stableId(item)) || clean(item.queuedPostId) === postId)
    .map((item) => sourceReference({
      sourceKind: "source-item",
      sourceCollection: "settings.sourceItems",
      sourceId: stableId(item),
      relationship: "source",
      href: ""
    }));
}

function calendarReferences(post) {
  const sourceType = lower(post.sourceType || post.source_type || post.sourceReference);
  const importId = clean(post.importKey || post.calendarImportKey || post.sourceItemId);
  if (!importId || !/campaign_upload|social_calendar|calendar import/.test(sourceType)) return [];
  return [sourceReference({
    sourceKind: "calendar-import",
    sourceCollection: "embedded-calendar-import",
    sourceId: importId,
    relationship: "calendar",
    href: exactHref("Post", "post", post.id)
  })];
}

const PROOF_FIELD_IDS = Object.freeze({
  reports: Object.freeze(["reportId", "sourceReportId"]),
  dataRoomItems: Object.freeze(["dataRoomItemId", "proofItemId", "proofSourceId"]),
  evidencePackNotes: Object.freeze(["evidencePackNoteId", "evidenceNoteId"])
});

function proofReferences(state, post) {
  const postId = clean(post.id);
  const refs = explicitSourceRefs(post);
  const output = [];
  for (const [collection, mapping] of Object.entries(PROOF_COLLECTIONS)) {
    const directIds = uniqueIds(...PROOF_FIELD_IDS[collection].map((field) => post[field]));
    for (const reference of refs.filter((item) => item.collection === collection)) directIds.push(reference.sourceId);
    for (const record of stableRecords(state[collection])) {
      const id = stableId(record);
      if (!directIds.includes(id) && !recordPointsToPost(record, postId)) continue;
      output.push(sourceReference({
        sourceKind: mapping.sourceKind,
        sourceCollection: collection,
        sourceId: id,
        relationship: "proof",
        href: exactHref(mapping.objectType, mapping.fileSourceKind, id)
      }));
    }
  }
  return output;
}

function otherExplicitReferences(post) {
  const output = [];
  for (const reference of explicitSourceRefs(post)) {
    if (reference.collection === "posts" && reference.sourceId === clean(post.id)) continue;
    if (reference.collection === "contentBank" || PROOF_COLLECTIONS[reference.collection]) continue;
    output.push(sourceReference({
      sourceKind: reference.sourceKind || reference.collection,
      sourceCollection: reference.collection,
      sourceId: reference.sourceId,
      relationship: reference.relationship || "source",
      href: genericHref(reference.collection, reference.sourceId)
    }));
  }
  const repurposedId = clean(post.repurposedFromPostId || post.repurposed_from_post_id);
  if (repurposedId) {
    output.push(sourceReference({
      sourceKind: "post",
      sourceCollection: "posts",
      sourceId: repurposedId,
      relationship: "repurposed_from",
      href: exactHref("Post", "post", repurposedId)
    }));
  }
  return output;
}

function generationReferences(state, postId) {
  return stableRecords(state.generationBatches)
    .filter((batch) => uniqueIds(batch.postIds, batch.post_ids).includes(postId))
    .map((batch) => sourceReference({
      sourceKind: "generation-batch",
      sourceCollection: "generationBatches",
      sourceId: stableId(batch),
      relationship: "generation",
      href: genericHref("generationBatches", stableId(batch))
    }));
}

function isPostType(value = "") {
  return ["post", "posts", "social_post", "social-post", "social"].includes(lower(value));
}

function approvalMatches(record = {}, postId = "") {
  const ref = record.sourceRef || record.relatedObject || {};
  return (isPostType(record.type || record.sourceType || record.resourceType || record.relatedObjectType)
      && uniqueIds(record.sourceId, record.postId, record.resourceId, record.relatedObjectId).includes(postId))
    || (clean(ref.collection) === "posts" && clean(ref.itemId || ref.sourceId || ref.id) === postId);
}

function approvalContext(state, postId) {
  const output = [];
  for (const collection of POST_SOURCE_MAPPINGS.approvals) {
    for (const record of stableRecords(state[collection])) {
      if (!approvalMatches(record, postId)) continue;
      const id = stableId(record);
      if (!id) continue;
      output.push({
        sourceCollection: collection,
        sourceId: id,
        status: clean(record.status || record.decision || record.approvalStatus),
        occurredAt: clean(record.decidedAt || record.approvedAt || record.approved_at || record.rejectedAt || record.updatedAt || record.updated_at || record.createdAt || record.created_at),
        href: genericHref(collection, id)
      });
    }
  }
  return output.sort((left, right) =>
    clean(right.occurredAt).localeCompare(clean(left.occurredAt), "en-US")
    || clean(left.sourceCollection).localeCompare(clean(right.sourceCollection), "en-US")
    || clean(left.sourceId).localeCompare(clean(right.sourceId), "en-US")
  );
}

function approvalReferences(approvals = []) {
  return approvals.map((approval) => sourceReference({
    sourceKind: "approval",
    sourceCollection: approval.sourceCollection,
    sourceId: approval.sourceId,
    relationship: "approval",
    href: approval.href
  }));
}

function referencedBrandAssetIds(post = {}) {
  return uniqueIds(
    post.assetId,
    post.assetIds,
    post.brandAssetId,
    post.brandAssetIds,
    post.defaultAssetIds,
    post.logoAssetId,
    post.wilmaAssetId,
    post.image,
    post.finalExportKit?.assetId,
    post.finalExportKit?.assetIds,
    post.wilmaImageWorkflow?.assetId,
    post.wilmaImageWorkflow?.wilmaPoseReferenceId
  );
}

function assetStatus(record = {}) {
  if (record.renderQa?.passed === false || record.styleGate?.passed === false || /failed|blocked|qa_failed/.test(lower(record.generationStatus || record.imageStatus || record.status))) {
    return { key: "needs_review", label: "Needs review" };
  }
  if (record.finalImageReady || record.approved || /generated|ready|current|approved|final/.test(lower(record.generationStatus || record.imageStatus || record.status))) {
    return { key: "ready", label: "Ready" };
  }
  return { key: "draft", label: "Draft" };
}

function assetReference({ collection, sourceId, kind, role, status, href }) {
  const id = clean(sourceId);
  if (!id) return null;
  return {
    id: `${collection}:${id}`,
    sourceCollection: collection,
    sourceId: id,
    kind,
    role,
    status,
    href: clean(href)
  };
}

function assetReferences(state, post) {
  const postId = clean(post.id);
  const output = [];
  for (const image of stableRecords(state.postImages)) {
    if (clean(image.postId || image.post_id) !== postId) continue;
    const id = stableId(image);
    output.push(assetReference({
      collection: "postImages",
      sourceId: id,
      kind: "image",
      role: "Post image",
      status: assetStatus(image),
      href: genericHref("postImages", id)
    }));
  }

  const requestedAssets = referencedBrandAssetIds(post);
  for (const asset of stableRecords(state.brandAssets)) {
    const id = stableId(asset);
    if (!requestedAssets.includes(id) && !requestedAssets.includes(clean(asset.slug))) continue;
    output.push(assetReference({
      collection: "brandAssets",
      sourceId: id,
      kind: "brand_asset",
      role: clean(asset.assetType) || "Brand asset",
      status: assetStatus(asset),
      href: exactHref("File", "brand-asset", id)
    }));
  }

  for (const kit of stableRecords(state.postingKits)) {
    if (clean(kit.postId || kit.post_id) !== postId) continue;
    const id = stableId(kit);
    output.push(assetReference({
      collection: "postingKits",
      sourceId: id,
      kind: "posting_kit",
      role: "Posting kit",
      status: assetStatus(kit),
      href: genericHref("postingKits", id)
    }));
  }

  const seen = new Set();
  return output.filter(Boolean).sort((left, right) =>
    clean(left.sourceCollection).localeCompare(clean(right.sourceCollection), "en-US")
    || clean(left.sourceId).localeCompare(clean(right.sourceId), "en-US")
  ).filter((reference) => {
    if (seen.has(reference.id)) return false;
    seen.add(reference.id);
    return true;
  });
}

function publishEvents(state, postId) {
  return stableRecords(state.publishEvents)
    .filter((event) => clean(event.postId || event.post_id || event.relatedObjectId) === postId)
    .map((event) => ({
      sourceCollection: "publishEvents",
      sourceId: stableId(event),
      channel: clean(event.channel || event.platform),
      eventType: clean(event.eventType || event.type),
      status: clean(event.statusAfter || event.status || event.outcome),
      publishedUrl: clean(event.publishedUrl || event.published_url || event.url),
      occurredAt: clean(event.createdAt || event.created_at || event.occurredAt || event.timestamp),
      href: genericHref("publishEvents", stableId(event))
    }));
}

function activityMatches(record = {}, postId = "") {
  const ref = record.sourceRef || {};
  return (isPostType(record.relatedObjectType || record.resourceType || record.objectType || record.sourceType)
      && uniqueIds(record.relatedObjectId, record.resourceId, record.objectId, record.postId).includes(postId))
    || (clean(ref.collection) === "posts" && clean(ref.itemId || ref.sourceId) === postId);
}

function activityContext(state, post, approvals, publicationEvents) {
  const postId = clean(post.id);
  const output = [];
  for (const event of stableRecords(state.activityEvents)) {
    if (!activityMatches(event, postId)) continue;
    output.push({
      sourceCollection: "activityEvents",
      sourceId: stableId(event),
      activityKind: "activity",
      action: clean(event.eventType || event.type),
      status: clean(event.status),
      channel: clean(event.channel || event.platform),
      occurredAt: clean(event.createdAt || event.created_at || event.updatedAt || event.timestamp),
      href: genericHref("activityEvents", stableId(event))
    });
  }
  for (const event of stableRecords(state.auditHistory)) {
    if (!activityMatches(event, postId)) continue;
    output.push({
      sourceCollection: "auditHistory",
      sourceId: stableId(event),
      activityKind: "audit",
      action: clean(event.action || event.eventType),
      status: clean(event.status || event.outcome),
      channel: clean(event.channel || event.platform),
      occurredAt: clean(event.timestamp || event.createdAt || event.created_at || event.updatedAt),
      href: genericHref("auditHistory", stableId(event))
    });
  }
  for (const approval of approvals) {
    output.push({
      ...approval,
      activityKind: "approval",
      action: "approval",
      channel: ""
    });
  }
  for (const event of publicationEvents) {
    output.push({ ...event, activityKind: "publication", action: event.eventType });
  }
  for (const [index, attempt] of list(post.publish_attempts || post.publishAttempts).entries()) {
    output.push({
      sourceCollection: "posts.publishAttempts",
      sourceId: clean(attempt.id) || `${postId}:${index}`,
      activityKind: "publication",
      action: clean(attempt.eventType || attempt.action || "publish_attempt"),
      status: clean(attempt.status || attempt.outcome),
      channel: clean(attempt.channel || attempt.platform),
      occurredAt: clean(attempt.createdAt || attempt.created_at || attempt.at),
      href: exactHref("Post", "post", postId)
    });
  }
  return output.sort((left, right) =>
    clean(right.occurredAt).localeCompare(clean(left.occurredAt), "en-US")
    || clean(left.sourceCollection).localeCompare(clean(right.sourceCollection), "en-US")
    || clean(left.sourceId).localeCompare(clean(right.sourceId), "en-US")
  );
}

export function collectPostSourceContext(state = {}, post = {}) {
  const postId = clean(post.id);
  const href = exactHref("Post", "post", postId);
  if (!postId || !href) return null;
  const approvals = approvalContext(state, postId);
  const publicationEvents = publishEvents(state, postId);
  const sources = dedupeReferences([
    sourceReference({
      sourceKind: "post",
      sourceCollection: "posts",
      sourceId: postId,
      relationship: "record",
      href
    }),
    ...contentBankReferences(state, post),
    ...intakeReferences(state, post),
    ...calendarReferences(post),
    ...proofReferences(state, post),
    ...otherExplicitReferences(post),
    ...generationReferences(state, postId),
    ...approvalReferences(approvals)
  ]);
  return deepFreeze({
    href,
    sourceReferences: sources,
    assetReferences: assetReferences(state, post),
    approvals,
    publishEvents: publicationEvents,
    activityRecords: activityContext(state, post, approvals, publicationEvents)
  });
}
