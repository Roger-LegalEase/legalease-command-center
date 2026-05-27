export const reviewStates = ["review_required", "in_review", "approved", "needs_revision", "blocked", "handoff_ready"];

export const rcapReviewArtifactDefinitions = [
  { key: "rcap-proposal-task-v1", title: "Proposal Task", collection: "tasks", match: item => item.id === "task-rcap-proposal-draft-v1", priority: "high" },
  { key: "rcap-proposal-draft-v1", title: "Proposal Draft", collection: "partnerProgramArtifacts", match: item => item.key === "rcap-proposal-draft-v1", priority: "high" },
  { key: "rcap-partner-page-draft-v1", title: "Partner Page Draft", collection: "partnerProgramArtifacts", match: item => item.key === "rcap-partner-page-draft-v1", priority: "high" },
  { key: "rcap-dashboard-readiness-v1", title: "Dashboard Readiness", collection: "partnerProgramArtifacts", match: item => item.key === "rcap-dashboard-readiness-v1", priority: "critical" },
  { key: "rcap-weekly-report-draft-v1", title: "Weekly Report Draft", collection: "reports", match: item => item.key === "rcap-weekly-report-draft-v1", priority: "medium" },
  { key: "rcap-production-activation-evidence-v1", title: "Evidence Note", collection: "evidencePackNotes", match: item => item.key === "rcap-production-activation-evidence-v1", priority: "medium" },
  { key: "rcap-manual-review-checklist-v1", title: "Manual Review Checklist", collection: "partnerProgramArtifacts", match: item => item.key === "rcap-manual-review-checklist-v1", priority: "high" }
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso(options = {}) {
  return options.now || new Date().toISOString();
}

function actorLabel(actor = "") {
  return actor || "owner_token";
}

export function defaultReviewFields(reviewState = "review_required", options = {}) {
  const timestamp = nowIso(options);
  return {
    review_state: reviewState,
    review_updated_at: options.review_updated_at || timestamp,
    review_updated_by: options.review_updated_by || actorLabel(options.actor),
    review_notes: options.review_notes || "",
    blocker_reason: options.blocker_reason || "",
    revision_reason: options.revision_reason || ""
  };
}

export function normalizeReviewStateRecord(record = {}, options = {}) {
  const reviewState = reviewStates.includes(record.review_state) ? record.review_state : "review_required";
  return {
    ...defaultReviewFields(reviewState, options),
    ...record,
    review_state: reviewState,
    review_updated_at: record.review_updated_at || options.review_updated_at || nowIso(options),
    review_updated_by: record.review_updated_by || options.review_updated_by || actorLabel(options.actor)
  };
}

export function ensureRcapReviewStates(state = {}, options = {}) {
  const next = { ...state };
  for (const def of rcapReviewArtifactDefinitions) {
    next[def.collection] = list(next[def.collection]).map(item => def.match(item) ? normalizeReviewStateRecord(item, options) : item);
  }
  return next;
}

export function findRcapReviewArtifact(state = {}, artifactKey = "") {
  const def = rcapReviewArtifactDefinitions.find(item => item.key === artifactKey || item.title === artifactKey);
  if (!def) return null;
  const collection = list(state[def.collection]);
  const index = collection.findIndex(item => def.match(item));
  if (index < 0) return { def, collection, index, artifact: null };
  return { def, collection, index, artifact: collection[index] };
}

export function rcapReviewQueue(state = {}) {
  const current = ensureRcapReviewStates(state);
  return rcapReviewArtifactDefinitions
    .map(def => {
      const found = findRcapReviewArtifact(current, def.key);
      if (!found?.artifact) return null;
      const artifact = found.artifact;
      return {
        artifact: def.title,
        key: def.key,
        partner: artifact.partnerSlug || "rcap",
        program: artifact.partnerProgramId || artifact.partnerId || "RCAP",
        review_state: artifact.review_state || "review_required",
        priority: artifact.priority || def.priority,
        last_updated: artifact.review_updated_at || artifact.updatedAt || artifact.createdAt || "",
        next_required_action: artifact.review_state === "blocked"
          ? "Resolve blocker before review can continue."
          : artifact.review_state === "needs_revision"
            ? "Revise artifact and resubmit for review."
            : "Review and choose an approval state."
      };
    })
    .filter(Boolean)
    .filter(item => ["review_required", "blocked", "needs_revision"].includes(item.review_state));
}

export function rcapHandoffReadinessSummary(state = {}) {
  const current = ensureRcapReviewStates(state);
  const artifacts = rcapReviewArtifactDefinitions.map(def => {
    const found = findRcapReviewArtifact(current, def.key);
    return { ...def, artifact: found?.artifact || null, review_state: found?.artifact?.review_state || "missing" };
  });
  const byState = stateName => artifacts.filter(item => item.review_state === stateName).map(item => item.title);
  const blocked = byState("blocked");
  const needsRevision = byState("needs_revision");
  const handoffReady = byState("handoff_ready");
  const approved = byState("approved");
  const stillOpen = artifacts.filter(item => ["review_required", "in_review", "missing"].includes(item.review_state)).map(item => item.title);
  const readyForPartnerJourneyHandoff = artifacts.length > 0
    && artifacts.every(item => ["approved", "handoff_ready"].includes(item.review_state))
    && blocked.length === 0
    && needsRevision.length === 0;
  return { approved, blocked, needsRevision, handoffReady, stillOpen, readyForPartnerJourneyHandoff };
}

export function transitionRcapReviewArtifact(state = {}, artifactKey = "", nextReviewState = "", options = {}) {
  if (!reviewStates.includes(nextReviewState)) throw new Error("Unsupported review state.");
  const current = ensureRcapReviewStates(state, options);
  const found = findRcapReviewArtifact(current, artifactKey);
  if (!found?.artifact) throw new Error("Review artifact not found.");

  const timestamp = nowIso(options);
  const actor = actorLabel(options.actor);
  const oldState = found.artifact.review_state || "review_required";
  const notes = String(options.notes || "").trim();
  const blockerReason = nextReviewState === "blocked" ? String(options.blocker_reason || notes || "Blocked pending operator review.").trim() : "";
  const revisionReason = nextReviewState === "needs_revision" ? String(options.revision_reason || notes || "Revision requested by operator.").trim() : "";
  const updated = {
    ...found.artifact,
    review_state: nextReviewState,
    review_updated_at: timestamp,
    review_updated_by: actor,
    review_notes: notes || found.artifact.review_notes || "",
    blocker_reason: blockerReason,
    revision_reason: revisionReason,
    review_history: [
      { at: timestamp, actor, old_state: oldState, new_state: nextReviewState, notes, blocker_reason: blockerReason, revision_reason: revisionReason },
      ...list(found.artifact.review_history)
    ].slice(0, 50)
  };

  const nextCollection = [...found.collection];
  nextCollection[found.index] = updated;
  const next = {
    ...current,
    [found.def.collection]: nextCollection
  };

  const auditId = `audit-rcap-review-${artifactKey}-${Date.parse(timestamp) || Date.now()}`;
  const eventId = `activity-rcap-review-${artifactKey}-${Date.parse(timestamp) || Date.now()}`;
  next.auditHistory = [{
    id: auditId,
    timestamp,
    actor,
    action: "rcap artifact review state changed",
    resourceType: "rcap_review_artifact",
    resourceId: artifactKey,
    beforeValue: { review_state: oldState },
    afterValue: { review_state: nextReviewState, notes, blocker_reason: blockerReason, revision_reason: revisionReason }
  }, ...list(current.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: eventId,
    eventType: "RCAP review state changed",
    title: `${found.def.title}: ${oldState} to ${nextReviewState}`,
    relatedObjectType: "rcap_review_artifact",
    relatedObjectId: artifactKey,
    riskLevel: nextReviewState === "blocked" ? "high" : "medium",
    metadata: { oldState, newState: nextReviewState, notes, externalSideEffects: false },
    createdAt: timestamp
  }, ...list(current.activityEvents)].slice(0, 500);

  return {
    state: next,
    artifact: updated,
    queue: rcapReviewQueue(next),
    handoffReadiness: rcapHandoffReadinessSummary(next)
  };
}
