import { collectPostReviewPlanSources } from "./post-review-plan-sources.mjs";

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function compactReference(reference = {}) {
  if (!reference || typeof reference !== "object") return null;
  const collection = clean(reference.collection || reference.sourceCollection);
  const sourceId = clean(reference.sourceId);
  if (!collection || !sourceId) return null;
  const output = { collection, sourceId };
  const relationship = clean(reference.relationship);
  if (relationship) output.relationship = relationship;
  const href = clean(reference.href);
  if (href.startsWith("#")) output.href = href;
  return output;
}

function referenceKey(reference = {}) {
  return `${clean(reference.collection)}:${clean(reference.sourceId)}:${clean(reference.relationship)}`;
}

function dedupeReferences(values = []) {
  const map = new Map();
  for (const value of values.flat(Infinity)) {
    const reference = compactReference(value);
    if (reference) map.set(referenceKey(reference), reference);
  }
  return [...map.values()].sort((left, right) => referenceKey(left).localeCompare(referenceKey(right), "en-US"));
}

const REVIEW_STATES = Object.freeze({
  not_ready_for_review: { key: "not_ready_for_review", label: "Not ready for review" },
  ready_for_review: { key: "ready_for_review", label: "Ready for review" },
  awaiting_review: { key: "awaiting_review", label: "Awaiting review" },
  changes_requested: { key: "changes_requested", label: "Changes requested" },
  approved: { key: "approved", label: "Approved" },
  unavailable: { key: "unavailable", label: "Unavailable" }
});

const REGENERATION_LABELS = Object.freeze({
  available: "Available",
  blocked_by_hard_failure: "Blocked by hard failure",
  in_progress: "In progress",
  failed: "Failed",
  complete: "Complete",
  unavailable: "Unavailable"
});

function blockingChecks(source) {
  return (source.readiness.checks || []).filter((check) =>
    ["Content", "Creative"].includes(check.category)
    && check.blocking === true
    && check.status?.key !== "passed"
  ).map((check) => ({
    category: check.category,
    label: check.label,
    status: check.status ? { key: check.status.key, label: check.status.label } : { key: "unavailable", label: "Unavailable" },
    explanation: check.explanation,
    hardFailure: check.hardFailure === true,
    sourceReference: compactReference(check.sourceReference)
  })).sort((left, right) => left.category.localeCompare(right.category, "en-US")
    || left.label.localeCompare(right.label, "en-US")
    || referenceKey(left.sourceReference).localeCompare(referenceKey(right.sourceReference), "en-US"));
}

function approvalProjection(source) {
  const current = source.approval.current;
  const state = source.approval.ambiguous ? "unavailable" : current?.state || "unavailable";
  const labels = {
    not_requested: "Not requested",
    awaiting_review: "Awaiting review",
    changes_requested: "Changes requested",
    approved: "Approved",
    unavailable: "Unavailable"
  };
  return {
    state: { key: state, label: labels[state] || "Unavailable" },
    required: source.composerDraft.approval?.required ?? null,
    ambiguous: source.approval.ambiguous === true,
    evidenceAt: current?.timestamp || null,
    sourceReference: compactReference(current?.sourceReference),
    historicalRecords: source.approval.historicalCount,
    approveAction: null
  };
}

function approveAction(source, state, approval, blocks, requestedChanges) {
  const requiredCapability = source.approvalAuthority?.requiredCapability || null;
  let reason = "approval_source_unavailable";
  if (source.approval.ambiguous) reason = "ambiguous_approval_truth";
  else if (blocks.length) reason = "blocked_by_review_check";
  else if (requestedChanges.length || state.key === "changes_requested") reason = "changes_requested";
  else if (state.key === "approved" || approval.state.key === "approved") reason = "already_approved";
  else if (approval.state.key === "unavailable" || !source.approval.current || !requiredCapability) reason = "approval_source_unavailable";
  else if (source.approvalAuthority?.allowed !== true) reason = "actor_cannot_approve";
  else if (["ready_for_review", "awaiting_review"].includes(state.key)) reason = "eligible_for_approval";
  return {
    available: reason === "eligible_for_approval",
    executable: false,
    reason,
    requiredCapability
  };
}

function requestedChangesProjection(source) {
  return source.feedback.current.map((feedback) => ({
    summary: feedback.summary,
    category: feedback.category,
    author: feedback.author,
    timestamp: feedback.timestamp,
    sourceReference: compactReference(feedback.sourceReference)
  }));
}

function reviewState(source, blocks, approval, requestedChanges) {
  if (source.approval.ambiguous) return { ...REVIEW_STATES.unavailable };
  if (blocks.length) return { ...REVIEW_STATES.not_ready_for_review };
  if (requestedChanges.length || approval.state.key === "changes_requested") return { ...REVIEW_STATES.changes_requested };
  if (approval.state.key === "approved") return { ...REVIEW_STATES.approved };
  if (approval.state.key === "awaiting_review") return { ...REVIEW_STATES.awaiting_review };
  return { ...REVIEW_STATES.ready_for_review };
}

function versionsProjection(source) {
  const currentImageId = source.versions.images[0]?.id || null;
  return {
    current: {
      post: {
        id: source.versions.currentPost.id,
        version: source.versions.currentPost.version,
        timestamp: source.versions.currentPost.timestamp,
        sourceReference: compactReference(source.versions.currentPost.sourceReference)
      },
      image: source.versions.images[0] ? {
        id: source.versions.images[0].id,
        version: source.versions.images[0].version,
        timestamp: source.versions.images[0].timestamp,
        generationStatus: source.versions.images[0].generationStatus,
        finalImageApproved: source.versions.images[0].finalImageApproved,
        sourceReference: compactReference(source.versions.images[0].sourceReference)
      } : null
    },
    previous: source.versions.previous.map((version) => ({
      id: version.id,
      kind: version.kind,
      version: version.version,
      timestamp: version.timestamp,
      sourceReference: compactReference(version.sourceReference)
    })),
    images: source.versions.images.map((version) => ({
      id: version.id,
      version: version.version,
      current: version.id === currentImageId,
      timestamp: version.timestamp,
      generationStatus: version.generationStatus,
      finalImageApproved: version.finalImageApproved,
      sourceReference: compactReference(version.sourceReference)
    }))
  };
}

function generationStatus(record = {}) {
  return lower(record.regenerationStatus || record.regeneration_status || record.generationStatus || record.generation_status || record.imageStatus || record.image_status || record.status);
}

function regenerationProjection(source, blocks) {
  const image = source.generation.latestImage || {};
  const batch = source.generation.latestBatch || {};
  const post = source.post || {};
  const explicit = generationStatus(image) || generationStatus(batch) || lower(post.regenerationStatus || post.regeneration_status);
  const hardContentBlock = blocks.some((check) => check.category === "Content" && check.hardFailure);
  let key = "unavailable";
  let reference = null;
  if (/generating|in_progress|pending|queued|started/.test(explicit)) key = "in_progress";
  else if (/failed|error|qa_failed/.test(explicit)) key = "failed";
  else if (/complete|generated|ready|success/.test(explicit)) key = "complete";
  else if (post.regenerationAvailable === true || post.regeneration_available === true
    || image.regenerationAvailable === true || image.regeneration_available === true) key = "available";
  else if (hardContentBlock) key = "blocked_by_hard_failure";
  if (image.id) reference = { collection: "postImages", sourceId: clean(image.id), relationship: "image_generation" };
  else if (batch.id) reference = { collection: "generationBatches", sourceId: clean(batch.id), relationship: "image_generation" };
  else if (key === "available" || key === "blocked_by_hard_failure") reference = { collection: "posts", sourceId: clean(post.id), relationship: "image_generation" };
  return {
    state: { key, label: REGENERATION_LABELS[key] },
    finalImageApproved: image.imageApproved === true || image.finalImageApproved === true,
    sourceReference: compactReference(reference),
    operation: null,
    executable: false
  };
}

function activityProjection(source) {
  const derived = [];
  if (source.approval.current?.sourceReference) {
    const labels = {
      approved: "Approved",
      awaiting_review: "Review requested",
      changes_requested: "Changes requested",
      not_requested: "Approval state recorded"
    };
    derived.push({
      kind: source.approval.current.state,
      label: labels[source.approval.current.state] || "Approval state recorded",
      timestamp: source.approval.current.timestamp,
      sourceReference: compactReference(source.approval.current.sourceReference)
    });
  }
  for (const feedback of source.feedback.current) {
    derived.push({
      kind: "changes_requested",
      label: "Changes requested",
      timestamp: feedback.timestamp,
      sourceReference: compactReference(feedback.sourceReference)
    });
  }
  const map = new Map();
  for (const event of [...source.activity.events, ...derived]) {
    const output = {
      kind: event.kind,
      label: event.label,
      timestamp: event.timestamp || null,
      sourceReference: compactReference(event.sourceReference)
    };
    map.set(`${output.kind}:${output.timestamp || ""}:${referenceKey(output.sourceReference)}`, output);
  }
  return [...map.values()].sort((left, right) => clean(right.timestamp).localeCompare(clean(left.timestamp), "en-US")
    || left.kind.localeCompare(right.kind, "en-US")
    || referenceKey(left.sourceReference).localeCompare(referenceKey(right.sourceReference), "en-US"));
}

function guidanceFor(state, blocks, requestedChanges, approval, regeneration, scheduleState) {
  let text = "Review truth is unavailable until the underlying approval evidence is unambiguous.";
  if (state.key === "not_ready_for_review") text = `${blocks.length} blocking review ${blocks.length === 1 ? "check needs" : "checks need"} attention before approval.`;
  else if (state.key === "ready_for_review") text = "The stored draft is ready to enter the separate review workflow.";
  else if (state.key === "awaiting_review") text = "Review is awaiting an explicit decision; no approval is inferred.";
  else if (state.key === "changes_requested") text = `${requestedChanges.length || 1} current requested ${requestedChanges.length === 1 ? "change remains" : "changes remain"} open.`;
  else if (state.key === "approved") text = "Approval is recorded as review truth only; it does not schedule or publish the Post.";
  return {
    text,
    approvalState: approval.state.key,
    regenerationState: regeneration.state.key,
    scheduleState: clean(scheduleState) || "unavailable",
    executable: false
  };
}

function unavailableResult(generatedAt, reason) {
  return deepFreeze({
    postId: null,
    href: null,
    generatedAt,
    state: { ...REVIEW_STATES.unavailable },
    approval: null,
    blockingChecks: [],
    requestedChanges: [],
    versions: null,
    regeneration: null,
    activity: [],
    guidance: { text: "Review truth is unavailable.", approvalState: "unavailable", regenerationState: "unavailable", scheduleState: null, executable: false },
    sourceReferences: [],
    availability: {
      key: "unavailable", reason,
      counts: null,
      actions: { approvalWrites: false, requestedChangeWrites: false, postEdits: false, imageGenerations: false, scheduleWrites: false, publications: false, providerCalls: false, networkRequests: false, storageWrites: false, sourceMutations: false }
    },
    performance: { sourceCandidatesExamined: 0 }
  });
}

export function buildPostReviewPlan(state = {}, actor = {}, postId = "", now = "") {
  const source = collectPostReviewPlanSources(state, actor, postId, now);
  if (!source.authorized || !source.found || !source.postView) return unavailableResult(source.generatedAt, source.reason);

  const blocks = blockingChecks(source);
  const approval = approvalProjection(source);
  const requestedChanges = requestedChangesProjection(source);
  const stateFact = reviewState(source, blocks, approval, requestedChanges);
  approval.approveAction = approveAction(source, stateFact, approval, blocks, requestedChanges);
  const versions = versionsProjection(source);
  const regeneration = regenerationProjection(source, blocks);
  const activity = activityProjection(source);
  const partial = source.feedback.unavailableCount > 0 || source.approval.ambiguous;
  const sourceReferences = dedupeReferences([
    source.postView.sourceReferences,
    source.composerDraft.sourceReferences,
    source.schedulePlan.sourceReferences,
    approval.sourceReference,
    blocks.map((check) => check.sourceReference),
    requestedChanges.map((feedback) => feedback.sourceReference),
    versions.current.post?.sourceReference,
    versions.current.image?.sourceReference,
    versions.previous.map((version) => version.sourceReference),
    versions.images.map((version) => version.sourceReference),
    regeneration.sourceReference,
    activity.map((event) => event.sourceReference)
  ]);
  const href = clean(source.postView.href).startsWith("#") ? source.postView.href : null;
  return deepFreeze({
    postId: clean(source.post.id),
    href,
    generatedAt: source.generatedAt,
    state: stateFact,
    approval,
    blockingChecks: blocks,
    requestedChanges,
    versions,
    regeneration,
    activity,
    guidance: guidanceFor(stateFact, blocks, requestedChanges, approval, regeneration, source.schedulePlan.state?.key),
    sourceReferences,
    availability: {
      key: stateFact.key === "unavailable" ? "unavailable" : partial ? "partial" : "available",
      reason: source.approval.ambiguous ? "ambiguous_approval_truth" : source.feedback.unavailableCount ? "feedback_lifecycle_unavailable" : null,
      counts: {
        blockingChecks: blocks.length,
        requestedChanges: requestedChanges.length,
        previousVersions: versions.previous.length,
        imageVersions: versions.images.length,
        activityEvents: activity.length,
        hiddenOrHistoricalFeedbackExcluded: source.feedback.historicalCount
      },
      actions: {
        approvalWrites: false,
        requestedChangeWrites: false,
        postEdits: false,
        imageGenerations: false,
        scheduleWrites: false,
        publications: false,
        providerCalls: false,
        networkRequests: false,
        storageWrites: false,
        sourceMutations: false
      }
    },
    performance: { sourceCandidatesExamined: source.diagnostics.sourceCandidatesExamined }
  });
}
