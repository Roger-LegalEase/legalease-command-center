import { recordVisibleToActor } from "../../global-search-service.mjs";
import { canPerformEndpoint, requiredCapabilitiesForEndpoint } from "../../roles.mjs";
import { collectPostComposerDraftSources } from "./post-composer-draft-sources.mjs";
import { buildPostComposerDraft } from "./post-composer-draft.mjs";
import { collectPostReadinessSources } from "./post-readiness-sources.mjs";
import { buildPostReadiness } from "./post-readiness.mjs";
import { buildPostSchedulePlan } from "./post-schedule-plan.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

const APPROVAL_COLLECTIONS = Object.freeze(["approvals", "approvalQueue", "queueItems"]);
const FEEDBACK_COLLECTIONS = Object.freeze(["reviewFeedback", "reviewFeedbackRecords", "postReviewFeedback"]);
const VERSION_COLLECTIONS = Object.freeze(["postVersions", "copyVersions"]);
const POST_APPROVAL_POLICY_PATH = "/api/approval/item/approve";
const TERMINAL_STATES = new Set(["resolved", "superseded", "dismissed", "closed", "inactive", "archived", "cancelled"]);
const CURRENT_FEEDBACK_STATES = new Set(["active", "open", "current", "changes_requested", "requested", "pending"]);
const TERMINAL_FIELDS = Object.freeze([
  "resolvedAt", "resolved_at", "supersededAt", "superseded_at", "dismissedAt", "dismissed_at",
  "closedAt", "closed_at", "archivedAt", "archived_at", "cancelledAt", "cancelled_at"
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function safeId(value = "") {
  const id = clean(value);
  return /^[a-z0-9][a-z0-9._:-]{0,239}$/i.test(id) ? id : "";
}

function safeText(value = "", limit = 280) {
  const text = clean(value);
  if (!text || text.length > limit || /[\u0000-\u001f\u007f<>]/u.test(text)) return null;
  if (/(?:^|\s)(?:\/(?:private|home|users|var|tmp)\/|[a-z]:\\)/i.test(text)) return null;
  if (/\b(?:access|refresh|storage|service.?role|oauth)[_ -]?(?:token|key)|\bcredential|\bsecret\b/i.test(text)) return null;
  if (/https?:\/\/|data:image\//i.test(text)) return null;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return null;
  return text;
}

function safeTimestamp(value = "") {
  const exact = clean(value);
  return exact && exact.length <= 120 && Number.isFinite(Date.parse(exact)) ? exact : null;
}

function sourceReference(collection = "", sourceId = "", relationship = "") {
  const safeCollection = safeId(collection);
  const safeSourceId = safeId(sourceId);
  if (!safeCollection || !safeSourceId) return null;
  const output = { collection: safeCollection, sourceId: safeSourceId };
  const safeRelationship = safeId(relationship);
  if (safeRelationship) output.relationship = safeRelationship;
  return output;
}

function isPostType(value = "") {
  return ["post", "posts", "social", "social_post", "social-post"].includes(lower(value));
}

function relatedPostIds(record = {}, collection = "") {
  const ids = [
    record.postId, record.post_id, record.relatedPostId, record.related_post_id,
    record.queuedPostId, record.sourcePostId, ...list(record.postIds), ...list(record.post_ids)
  ].map(clean).filter(Boolean);
  if ([...APPROVAL_COLLECTIONS, ...FEEDBACK_COLLECTIONS].includes(collection)
    && isPostType(record.type || record.sourceType || record.resourceType || record.relatedObjectType || record.objectType)) {
    ids.push(...[record.sourceId, record.resourceId, record.relatedObjectId].map(clean).filter(Boolean));
  }
  const reference = record.sourceRef || record.relatedObject || {};
  if (lower(reference.collection || reference.sourceCollection) === "posts") {
    ids.push(clean(reference.itemId || reference.sourceId || reference.id));
  }
  return [...new Set(ids.filter(Boolean))];
}

function visibleRelatedRecords(state, collection, postId, role) {
  return list(state[collection])
    .filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role))
    .filter((record) => relatedPostIds(record, collection).includes(postId))
    .map(cloneValue);
}

function recordTimestamp(record = {}) {
  return safeTimestamp(
    record.decidedAt || record.decided_at || record.approvedAt || record.approved_at
    || record.requestedAt || record.requested_at || record.reviewedAt || record.reviewed_at
    || record.updatedAt || record.updated_at || record.createdAt || record.created_at
  );
}

function normalizedApprovalState(record = {}) {
  const value = lower(record.status || record.state || record.decision || record.approvalStatus || record.approval_status || record.reviewState || record.review_state);
  if (/not_requested|required|draft|ready/.test(value)) return "not_requested";
  if (/changes|revision|reject|declin|block/.test(value)) return "changes_requested";
  if (/approved|accept|complete/.test(value)) return "approved";
  if (/await|pending|requested|in_review|needs_review|review_required/.test(value)) return "awaiting_review";
  return "unavailable";
}

function terminalRecord(record = {}) {
  if (TERMINAL_FIELDS.some((field) => Boolean(clean(record[field])))) return true;
  return TERMINAL_STATES.has(lower(record.lifecycleStatus || record.lifecycle_status || record.recordStatus || record.record_status));
}

function versionFact(record = {}) {
  const raw = record.versionNumber ?? record.version_number ?? record.approvalVersion ?? record.approval_version ?? record.version;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function lineageFact(record = {}) {
  return safeId(record.approvalFamilyId || record.approval_family_id || record.reviewFamilyId || record.review_family_id || record.lineageId || record.lineage_id);
}

function approvalCandidate(collection, record) {
  const id = safeId(record.id);
  const state = normalizedApprovalState(record);
  if (!id || state === "unavailable" || terminalRecord(record)) return null;
  return {
    id,
    collection,
    state,
    timestamp: recordTimestamp(record),
    current: record.isCurrent === true || record.current === true || lower(record.lifecycleStatus || record.lifecycle_status) === "current",
    version: versionFact(record),
    lineage: lineageFact(record),
    sourceReference: sourceReference(collection, id, "approval")
  };
}

function resolveVersionedCandidates(candidates = []) {
  if (candidates.length === 1) return { candidate: candidates[0], ambiguous: false };
  const explicitCurrent = candidates.filter((candidate) => candidate.current);
  if (explicitCurrent.length === 1) return { candidate: explicitCurrent[0], ambiguous: false };
  if (explicitCurrent.length > 1) return { candidate: null, ambiguous: true };
  const lineages = [...new Set(candidates.map((candidate) => candidate.lineage).filter(Boolean))];
  if (lineages.length === 1 && candidates.every((candidate) => candidate.lineage === lineages[0] && candidate.version !== null)) {
    const highest = Math.max(...candidates.map((candidate) => candidate.version));
    const atHighest = candidates.filter((candidate) => candidate.version === highest);
    return atHighest.length === 1 ? { candidate: atHighest[0], ambiguous: false } : { candidate: null, ambiguous: true };
  }
  return { candidate: null, ambiguous: candidates.length > 1 };
}

function approvalFacts(state, context) {
  const post = context.post;
  const records = APPROVAL_COLLECTIONS.flatMap((collection) =>
    visibleRelatedRecords(state, collection, clean(post.id), context.role).map((record) => ({ collection, record }))
  );
  const candidates = records.map(({ collection, record }) => approvalCandidate(collection, record)).filter(Boolean);
  const explicitPostStatus = lower(post.status) === "approved" ? "approved" : "";
  const postState = normalizedApprovalState({
    status: post.approvalStatus || post.approval_status || post.reviewState || post.review_state || explicitPostStatus
  });
  const postTimestamp = safeTimestamp(post.approvedAt || post.approved_at || post.reviewUpdatedAt || post.review_updated_at || post.updatedAt || post.updated_at);
  let resolved;
  if (postState !== "unavailable") {
    resolved = {
      candidate: {
        id: clean(post.id), collection: "posts", state: postState, timestamp: postTimestamp,
        current: true, version: versionFact(post), lineage: lineageFact(post),
        sourceReference: sourceReference("posts", post.id, "approval")
      },
      ambiguous: false
    };
  } else {
    resolved = resolveVersionedCandidates(candidates);
  }
  return {
    current: resolved.candidate,
    ambiguous: resolved.ambiguous,
    records,
    candidates,
    historicalCount: records.length - candidates.length,
    examined: records.length + 1
  };
}

function approvalAuthority(actor = {}) {
  const required = requiredCapabilitiesForEndpoint("POST", POST_APPROVAL_POLICY_PATH);
  const decision = canPerformEndpoint(actor.role, "POST", POST_APPROVAL_POLICY_PATH);
  return {
    allowed: actor.authenticated === true && decision.ok,
    requiredCapability: required.length === 1 ? required[0] : null
  };
}

function feedbackLifecycle(record = {}) {
  if (TERMINAL_FIELDS.some((field) => Boolean(clean(record[field])))) return "historical";
  const value = lower(record.lifecycleStatus || record.lifecycle_status || record.feedbackStatus || record.feedback_status || record.status || record.state);
  if (TERMINAL_STATES.has(value)) return "historical";
  if (CURRENT_FEEDBACK_STATES.has(value) || record.isCurrent === true || record.current === true) return "current";
  return "unknown";
}

function nestedFeedback(post = {}) {
  const output = [];
  for (const [field, values] of [["reviewFeedback", post.reviewFeedback], ["requestedChanges", post.requestedChanges], ["requested_changes", post.requested_changes]]) {
    for (const record of list(values)) output.push({ collection: `posts.${field}`, record: cloneValue(record) });
  }
  return output;
}

function feedbackFacts(state, context) {
  const postId = clean(context.post.id);
  const related = FEEDBACK_COLLECTIONS.flatMap((collection) =>
    visibleRelatedRecords(state, collection, postId, context.role).map((record) => ({ collection, record }))
  );
  const nested = nestedFeedback(context.post).filter(({ record }) => recordVisibleToActor(record, context.role));
  const current = [];
  let historicalCount = 0;
  let unavailableCount = 0;
  for (const { collection, record } of [...related, ...nested]) {
    const lifecycle = feedbackLifecycle(record);
    if (lifecycle === "historical") {
      historicalCount += 1;
      continue;
    }
    const id = safeId(record.id);
    const summary = safeText(record.summary || record.changeSummary || record.change_summary || record.feedbackSummary || record.feedback_summary || record.revisionReason || record.revision_reason, 280);
    const category = safeText(record.category || record.feedbackCategory || record.feedback_category || "Review feedback", 80);
    const timestamp = recordTimestamp(record);
    const reference = sourceReference(collection, id, "requested_change");
    if (lifecycle !== "current" || !id || !summary || !reference) {
      unavailableCount += 1;
      continue;
    }
    const authorCandidate = record.authorVisible === false || record.author_visible === false
      ? null
      : safeText(record.authorName || record.author_name || record.requestedByName || record.requested_by_name || record.reviewerName || record.reviewer_name, 80);
    current.push({
      id,
      summary,
      category: category || "Review feedback",
      author: authorCandidate,
      timestamp,
      sourceReference: reference
    });
  }
  current.sort((left, right) => clean(right.timestamp).localeCompare(clean(left.timestamp), "en-US") || left.id.localeCompare(right.id, "en-US"));
  return {
    current,
    historicalCount,
    unavailableCount,
    examined: related.length + nested.length
  };
}

function versionNumber(record = {}) {
  const value = Number(record.versionNumber ?? record.version_number ?? record.copyVersion ?? record.copy_version ?? record.imageVersion ?? record.image_version ?? record.version);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function versionTimestamp(record = {}) {
  return safeTimestamp(record.createdAt || record.created_at || record.updatedAt || record.updated_at || record.generatedAt || record.generated_at);
}

function versionFacts(state, context) {
  const postId = clean(context.post.id);
  const previous = [];
  for (const collection of VERSION_COLLECTIONS) {
    for (const record of visibleRelatedRecords(state, collection, postId, context.role)) {
      const id = safeId(record.id);
      const reference = sourceReference(collection, id, collection === "postVersions" ? "post_version" : "copy_version");
      if (!id || !reference) continue;
      previous.push({
        id,
        kind: collection === "postVersions" ? "post" : "copy",
        version: versionNumber(record),
        timestamp: versionTimestamp(record),
        sourceReference: reference
      });
    }
  }
  previous.sort((left, right) => (right.version ?? -1) - (left.version ?? -1)
    || clean(right.timestamp).localeCompare(clean(left.timestamp), "en-US") || left.id.localeCompare(right.id, "en-US"));

  const images = list(context.postImages).flatMap((record) => {
    const id = safeId(record.id);
    const reference = sourceReference("postImages", id, "image_version");
    return id && reference ? [{
      id, kind: "image", version: versionNumber(record), timestamp: versionTimestamp(record),
      generationStatus: lower(record.generationStatus || record.generation_status || record.imageStatus || record.image_status) || null,
      finalImageApproved: record.imageApproved === true || record.finalImageApproved === true,
      sourceReference: reference,
      raw: record
    }] : [];
  }).sort((left, right) => (right.version ?? -1) - (left.version ?? -1)
    || clean(right.timestamp).localeCompare(clean(left.timestamp), "en-US") || left.id.localeCompare(right.id, "en-US"));

  return {
    currentPost: {
      id: postId,
      kind: "post",
      version: versionNumber(context.post),
      timestamp: versionTimestamp(context.post),
      sourceReference: sourceReference("posts", postId, "current_version")
    },
    previous,
    images,
    examined: previous.length + images.length + 1
  };
}

const REVIEW_EVENT_LABELS = Object.freeze({
  review_requested: "Review requested",
  review_started: "Review started",
  changes_requested: "Changes requested",
  approval_requested: "Approval requested",
  approved: "Approved",
  approval_changed: "Approval changed",
  image_generation_started: "Image generation started",
  image_generation_failed: "Image generation failed",
  image_generation_completed: "Image generation completed"
});

function normalizedEventKind(record = {}) {
  const value = lower(record.eventType || record.event_type || record.action || record.type).replaceAll(/[\s-]+/g, "_");
  if (/changes?_requested|revision_requested/.test(value)) return "changes_requested";
  if (/approval_requested/.test(value)) return "approval_requested";
  if (/review_requested|needs_review/.test(value)) return "review_requested";
  if (/review_started|in_review/.test(value)) return "review_started";
  if (/approved|approval_complete/.test(value)) return "approved";
  if (/approval/.test(value)) return "approval_changed";
  if (/image.*(?:started|queued|pending|generating)/.test(value)) return "image_generation_started";
  if (/image.*(?:failed|error|qa_failed)/.test(value)) return "image_generation_failed";
  if (/image.*(?:complete|generated)/.test(value)) return "image_generation_completed";
  return "";
}

function activityRelated(record = {}, postId = "") {
  const type = lower(record.relatedObjectType || record.resourceType || record.sourceType);
  const id = clean(record.relatedObjectId || record.resourceId || record.sourceId || record.postId || record.post_id);
  return isPostType(type) && id === postId;
}

function activityFacts(state, context) {
  const postId = clean(context.post.id);
  const output = [];
  let examined = 0;
  for (const collection of ["activityEvents", "auditHistory"]) {
    const visible = list(state[collection]).filter((record) =>
      record && typeof record === "object" && recordVisibleToActor(record, context.role)
    );
    examined += visible.length;
    for (const record of visible) {
      if (!activityRelated(record, postId)) continue;
      const id = safeId(record.id);
      const kind = normalizedEventKind(record);
      const reference = sourceReference(collection, id, "review_activity");
      if (!id || !kind || !reference) continue;
      output.push({ kind, label: REVIEW_EVENT_LABELS[kind], timestamp: recordTimestamp(record), sourceReference: reference });
    }
  }
  output.sort((left, right) => clean(right.timestamp).localeCompare(clean(left.timestamp), "en-US")
    || left.kind.localeCompare(right.kind, "en-US")
    || left.sourceReference.sourceId.localeCompare(right.sourceReference.sourceId, "en-US"));
  return { events: output, examined };
}

function generationFacts(state, context, versions) {
  const postId = clean(context.post.id);
  const batches = list(state.generationBatches)
    .filter((record) => record && typeof record === "object" && recordVisibleToActor(record, context.role))
    .filter((record) => relatedPostIds(record, "generationBatches").includes(postId))
    .map(cloneValue);
  const latestImage = versions.images[0]?.raw || null;
  const orderedBatches = batches.sort((left, right) => clean(recordTimestamp(right)).localeCompare(clean(recordTimestamp(left)), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US"));
  return {
    latestImage,
    latestBatch: orderedBatches[0] || null,
    examined: versions.images.length + batches.length
  };
}

function unavailable(reason, generatedAt) {
  return deepFreeze({
    authorized: false,
    found: false,
    reason,
    generatedAt,
    post: null,
    postView: null,
    composerDraft: null,
    readiness: null,
    schedulePlan: null,
    approval: null,
    approvalAuthority: null,
    feedback: null,
    versions: null,
    activity: null,
    generation: null,
    diagnostics: { sourceCandidatesExamined: 0 }
  });
}

export const POST_REVIEW_PLAN_SOURCE_MATRIX = deepFreeze([
  { source: "CCX-300 PostView", truth: "Canonical Post identity, exact link, normalized versions, assets, and evidence references" },
  { source: "CCX-302A ComposerDraftView", truth: "Authorized draft, exact shared and variant facts, creative availability, and non-executable readiness guidance" },
  { source: "CCX-305 Social readiness", truth: "Plain-language content, creative, render, style, and required-brand blocking checks" },
  { source: "CCX-306A Social schedule plan", truth: "Read-only schedule and publication separation; neither derives review state" },
  { source: "posts / approvals / approvalQueue / queueItems", truth: "Explicit current Post approval or related stable/versioned approval evidence" },
  { source: "reviewFeedback / reviewFeedbackRecords / postReviewFeedback / Post feedback", truth: "Explicit current requested changes with lifecycle truth and exact Post relationships" },
  { source: "postVersions / copyVersions / postImages", truth: "Explicit stable Post, copy, and image version references" },
  { source: "generationBatches / postImages", truth: "Explicit image-generation lifecycle; generation completion never establishes image approval" },
  { source: "activityEvents / auditHistory", truth: "Meaningful explicitly related review events for display only, never review-state authority" }
]);

export function collectPostReviewPlanSources(state = {}, actor = {}, postId = "", now = "") {
  const generatedAt = safeTimestamp(now);
  if (!generatedAt) return unavailable("clock_unavailable", null);
  const readinessSource = collectPostReadinessSources(state, actor, postId);
  const composerSource = collectPostComposerDraftSources(state, actor, postId, { generatedAt });
  if (!readinessSource.authorized || !composerSource.authorized) return unavailable("actor_cannot_read", generatedAt);
  if (!readinessSource.found || !composerSource.found || !composerSource.postView) return unavailable("post_not_visible", generatedAt);

  const composerDraft = buildPostComposerDraft(state, actor, postId, { generatedAt });
  const readiness = buildPostReadiness(state, actor, postId, generatedAt);
  const schedulePlan = buildPostSchedulePlan(state, actor, postId, generatedAt);
  if (composerDraft.availability?.key === "unavailable" || !readiness.available || schedulePlan.availability?.key === "unavailable") {
    return unavailable("post_not_visible", generatedAt);
  }

  const approval = approvalFacts(state, readinessSource);
  const feedback = feedbackFacts(state, readinessSource);
  const versions = versionFacts(state, readinessSource);
  const activity = activityFacts(state, readinessSource);
  const generation = generationFacts(state, readinessSource, versions);
  const sourceCandidatesExamined = Number(composerSource.diagnostics.postsExamined || 0)
    + Number(composerSource.diagnostics.variantsExamined || 0)
    + Number(composerSource.diagnostics.creativeCandidatesScanned || 0)
    + Number(composerSource.diagnostics.readinessCandidatesExamined || 0)
    + Number(approval.examined || 0) + Number(feedback.examined || 0) + Number(versions.examined || 0)
    + Number(activity.examined || 0) + Number(generation.examined || 0);

  return deepFreeze({
    authorized: true,
    found: true,
    reason: null,
    generatedAt,
    role: readinessSource.role,
    post: cloneValue(readinessSource.post),
    postView: cloneValue(composerSource.postView),
    composerDraft: cloneValue(composerDraft),
    readiness: cloneValue(readiness),
    schedulePlan: cloneValue(schedulePlan),
    approval,
    approvalAuthority: approvalAuthority(actor),
    feedback,
    versions,
    activity,
    generation,
    diagnostics: { sourceCandidatesExamined }
  });
}
