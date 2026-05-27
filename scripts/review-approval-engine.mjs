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

export const rcapRequiredHandoffArtifactKeys = [
  "rcap-proposal-draft-v1",
  "rcap-partner-page-draft-v1",
  "rcap-dashboard-readiness-v1",
  "rcap-weekly-report-draft-v1",
  "rcap-production-activation-evidence-v1",
  "rcap-manual-review-checklist-v1"
];

export const rcapHandoffPacketKey = "rcap-partner-journey-handoff-packet-v1";

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

function missingPartnerDetailsForRcap(state = {}) {
  const partner = list(state.partners).find(item => item.slug === "rcap" || item.id === "partner-rcap") || {};
  const program = list(state.partnerPrograms).find(item => item.slug === "rcap" || item.id === "partner-program-rcap") || {};
  const missing = new Set();
  for (const item of list(partner.missingExternalDetailsList)) missing.add(item);
  if (partner.missing_external_details || program.missingExternalDetails) {
    missing.add("partner details marked missing");
  }
  if (!partner.primaryContact && !program.primaryContact) missing.add("RCAP primary contact");
  if (!partner.email) missing.add("partner-facing email address");
  if (!partner.website && !program.partnerLandingPageUrl) missing.add("website or partner landing destination");
  if (!list(partner.stakeholders).length) missing.add("named stakeholders and approval authority");
  if (!program.jurisdiction || program.jurisdiction === "TBD") missing.add("jurisdiction");
  if (!program.targetAudience || program.targetAudience === "TBD") missing.add("target audience");
  if (!program.packageTier || program.packageTier === "TBD") missing.add("package/program scope");
  return [...missing];
}

export function computeRcapPartnerJourneyHandoffReadiness(state = {}) {
  const current = ensureRcapReviewStates(state);
  const required = rcapRequiredHandoffArtifactKeys.map(key => {
    const found = findRcapReviewArtifact(current, key);
    const def = rcapReviewArtifactDefinitions.find(item => item.key === key);
    return {
      key,
      title: def?.title || key,
      review_state: found?.artifact?.review_state || "missing",
      artifact: found?.artifact || null
    };
  });
  const byState = stateName => required.filter(item => item.review_state === stateName).map(item => item.title);
  const approved_artifacts = byState("approved");
  const handoff_ready_artifacts = byState("handoff_ready");
  const blocked_artifacts = byState("blocked");
  const revision_required_artifacts = byState("needs_revision");
  const review_required_artifacts = required.filter(item => ["review_required", "in_review", "missing"].includes(item.review_state)).map(item => item.title);
  const missing_partner_details = missingPartnerDetailsForRcap(current);
  const required_manual_approvals = [];
  if (review_required_artifacts.length) required_manual_approvals.push("Complete review states for required artifacts");
  if (revision_required_artifacts.length) required_manual_approvals.push("Resolve revision requests");
  if (blocked_artifacts.length) required_manual_approvals.push("Resolve blockers");
  if (missing_partner_details.length) required_manual_approvals.push("Confirm missing partner details");
  const readyCount = required.filter(item => ["approved", "handoff_ready"].includes(item.review_state)).length;
  const handoff_ready = readyCount === required.length && !blocked_artifacts.length && !revision_required_artifacts.length && !review_required_artifacts.length && !missing_partner_details.length;
  const next_manual_action = handoff_ready
    ? "Roger can manually decide whether to hand this packet to the separate Partner Journey OS."
    : blocked_artifacts.length
      ? "Resolve blocked artifacts before considering handoff."
      : missing_partner_details.length
        ? "Confirm missing RCAP partner details before handoff."
        : revision_required_artifacts.length
          ? "Revise requested artifacts and re-run review."
          : "Finish artifact review and mark each required artifact approved or handoff_ready.";
  return {
    handoff_ready,
    readiness_score: Math.round((readyCount / required.length) * 100),
    readiness_count: { ready: readyCount, total: required.length },
    approved_artifacts,
    handoff_ready_artifacts,
    blocked_artifacts,
    revision_required_artifacts,
    review_required_artifacts,
    missing_partner_details,
    required_manual_approvals,
    next_manual_action,
    no_external_system_contacted: true,
    live_gates: Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length
  };
}

export function generateRcapPartnerJourneyHandoffPacket(state = {}, options = {}) {
  const current = ensureRcapReviewStates(state, options);
  const timestamp = nowIso(options);
  const actor = actorLabel(options.actor);
  const readiness = computeRcapPartnerJourneyHandoffReadiness(current);
  const packet = {
    id: "artifact-" + rcapHandoffPacketKey,
    key: rcapHandoffPacketKey,
    partnerId: "partner-rcap",
    partnerSlug: "rcap",
    partnerProgramId: "partner-program-rcap",
    artifactType: "internal_handoff_packet",
    title: "RCAP Partner Journey Handoff Packet",
    status: readiness.handoff_ready ? "handoff_ready" : "not_ready",
    reviewOnly: true,
    internalOnly: true,
    externalActionsAllowed: false,
    noExternalSystemContacted: true,
    generatedAt: timestamp,
    updatedAt: timestamp,
    readiness,
    summary: {
      question: "Is RCAP ready for Partner Journey handoff?",
      answer: readiness.handoff_ready ? "Ready for Roger's manual handoff decision." : "Not ready for handoff.",
      nextManualAction: readiness.next_manual_action
    }
  };
  const artifacts = list(current.partnerProgramArtifacts).filter(item => item.key !== rcapHandoffPacketKey);
  const next = {
    ...current,
    partnerProgramArtifacts: [packet, ...artifacts]
  };
  const auditId = `audit-rcap-handoff-packet-${Date.parse(timestamp) || Date.now()}`;
  const eventId = `activity-rcap-handoff-packet-${Date.parse(timestamp) || Date.now()}`;
  next.auditHistory = [{
    id: auditId,
    timestamp,
    actor,
    action: "rcap internal handoff packet generated",
    resourceType: "internal_handoff_packet",
    resourceId: rcapHandoffPacketKey,
    beforeValue: null,
    afterValue: {
      handoff_ready: readiness.handoff_ready,
      blockers_count: readiness.blocked_artifacts.length,
      missing_details_count: readiness.missing_partner_details.length,
      no_external_action: true
    }
  }, ...list(current.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: eventId,
    eventType: "RCAP internal handoff packet generated",
    title: readiness.handoff_ready ? "RCAP handoff packet ready for manual decision" : "RCAP handoff packet generated but not ready",
    relatedObjectType: "internal_handoff_packet",
    relatedObjectId: rcapHandoffPacketKey,
    riskLevel: readiness.handoff_ready ? "medium" : "high",
    metadata: {
      handoff_ready: readiness.handoff_ready,
      blockersCount: readiness.blocked_artifacts.length,
      missingDetailsCount: readiness.missing_partner_details.length,
      noExternalSystemContacted: true,
      externalSideEffects: false
    },
    createdAt: timestamp
  }, ...list(current.activityEvents)].slice(0, 500);
  return { state: next, packet, readiness };
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
