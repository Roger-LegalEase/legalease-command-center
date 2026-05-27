export const rcapActivationKey = "rcap-production-activation-v1";

const keys = {
  partnerId: "partner-rcap",
  partnerProgramId: "partner-program-rcap",
  proposalTaskId: "task-rcap-proposal-draft-v1",
  proposalDraft: "rcap-proposal-draft-v1",
  partnerPageDraft: "rcap-partner-page-draft-v1",
  dashboardReadiness: "rcap-dashboard-readiness-v1",
  weeklyReportDraft: "rcap-weekly-report-draft-v1",
  evidenceNote: "rcap-production-activation-evidence-v1",
  eventId: "event-rcap-production-activation-v1",
  auditId: "audit-rcap-production-activation-v1"
};

function nowIso(options = {}) {
  return options.now || new Date().toISOString();
}

function todayIso(options = {}) {
  return nowIso(options).slice(0, 10);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter((gate) => gate?.enabled).length;
}

function upsertBy(collection = [], predicate, itemFactory) {
  const existing = collection.find(predicate);
  const item = itemFactory(existing || null);
  return {
    status: existing ? "exists" : "created",
    item,
    collection: existing
      ? collection.map((current) => (predicate(current) ? item : current))
      : [item, ...collection]
  };
}

function safeHistory(existing = {}, generatedAt = "") {
  const history = list(existing.history);
  const hasActivationHistory = history.some((item) => item.activationKey === rcapActivationKey);
  return hasActivationHistory
    ? history
    : [{ action: "production activation prepared", at: generatedAt, activationKey: rcapActivationKey, note: "Review-only RCAP workflow initialized. No external action taken." }, ...history];
}

function statusFor(state = {}, key = "", collection = "") {
  const source = list(state[collection]);
  return source.some((item) => item.key === key || item.id === key) ? "exists" : "missing";
}

export function rcapActivationStatus(state = {}) {
  return {
    activation_key: rcapActivationKey,
    partner: list(state.partners).find((item) => item.slug === "rcap" || item.id === keys.partnerId)?.name || "RCAP",
    proposal_task: { status: list(state.tasks).some((item) => item.id === keys.proposalTaskId) ? "exists" : "missing" },
    proposal_draft: { status: statusFor(state, keys.proposalDraft, "partnerProgramArtifacts") },
    partner_page_draft: { status: statusFor(state, keys.partnerPageDraft, "partnerProgramArtifacts") },
    dashboard_readiness: { status: statusFor(state, keys.dashboardReadiness, "partnerProgramArtifacts") },
    weekly_report_draft: { status: statusFor(state, keys.weeklyReportDraft, "reports") },
    evidence_note: { status: statusFor(state, keys.evidenceNote, "evidencePackNotes") },
    review_only: true,
    live_gates: liveGatesCount(state),
    external_side_effects: false
  };
}

export function ensureRcapProductionActivation(state = {}, options = {}) {
  const generatedAt = nowIso(options);
  const generatedDate = todayIso(options);
  const liveGates = liveGatesCount(state);
  const summary = {
    activation_key: rcapActivationKey,
    partner: "RCAP",
    review_only: true,
    live_gates: liveGates,
    external_side_effects: false
  };
  const next = {
    ...state,
    partners: list(state.partners),
    tasks: list(state.tasks),
    partnerPrograms: list(state.partnerPrograms),
    partnerProgramArtifacts: list(state.partnerProgramArtifacts),
    reports: list(state.reports),
    dataRoomItems: list(state.dataRoomItems),
    evidencePackNotes: list(state.evidencePackNotes),
    activityEvents: list(state.activityEvents),
    auditHistory: list(state.auditHistory)
  };

  const partnerResult = upsertBy(next.partners, (item) => item.slug === "rcap" || item.id === keys.partnerId, (existing) => ({
    ...(existing || {}),
    id: existing?.id || keys.partnerId,
    name: "RCAP",
    slug: "rcap",
    type: existing?.type || "record_clearing_access_program",
    partnerType: existing?.partnerType || "program",
    status: "activation_review",
    stage: "production_activation",
    workflow_stage: "production_activation",
    source: "operator_cockpit",
    review_only: true,
    live_enabled: false,
    external_actions_enabled: false,
    missing_external_details: true,
    primaryContact: existing?.primaryContact || null,
    email: existing?.email || null,
    website: existing?.website || null,
    stakeholders: existing?.stakeholders || [],
    nextAction: "Review RCAP proposal draft, partner page draft, dashboard readiness, weekly report draft, and evidence note before any external action.",
    owner: existing?.owner || "Roger",
    priority: existing?.priority || "high",
    riskLevel: existing?.riskLevel || "medium",
    createdAt: existing?.createdAt || generatedAt,
    updatedAt: generatedAt,
    history: safeHistory(existing || {}, generatedAt)
  }));
  next.partners = partnerResult.collection;
  summary.partner_record = partnerResult.status;

  const programResult = upsertBy(next.partnerPrograms, (item) => item.slug === "rcap" || item.id === keys.partnerProgramId, (existing) => ({
    ...(existing || {}),
    id: existing?.id || keys.partnerProgramId,
    name: "RCAP",
    slug: "rcap",
    partnerType: existing?.partnerType || "program",
    status: "activation_review",
    workflowStage: "production_activation",
    packageTier: existing?.packageTier || "implementation",
    paymentStatus: existing?.paymentStatus || "not_verified",
    primaryContact: existing?.primaryContact || null,
    programGoal: "Prepare the first review-only production workflow for a Record-Clearing Access Program without sending, publishing, or activating anything.",
    targetAudience: existing?.targetAudience || "TBD",
    jurisdiction: existing?.jurisdiction || "TBD",
    launchDate: existing?.launchDate || null,
    partnerDashboardUrl: existing?.partnerDashboardUrl || null,
    partnerLandingPageUrl: existing?.partnerLandingPageUrl || null,
    proposalStatus: "draft",
    weeklyReportStatus: "draft",
    finalReportStatus: existing?.finalReportStatus || "not_started",
    reviewOnly: true,
    liveEnabled: false,
    externalActionsEnabled: false,
    missingExternalDetails: true,
    nextAction: "Manual review required before proposal sending, page publishing, dashboard activation, or partner communication.",
    owner: existing?.owner || "Roger",
    createdAt: existing?.createdAt || generatedAt,
    updatedAt: generatedAt,
    history: safeHistory(existing || {}, generatedAt)
  }));
  next.partnerPrograms = programResult.collection;

  const taskResult = upsertBy(next.tasks, (item) => item.id === keys.proposalTaskId, (existing) => ({
    ...(existing || {}),
    id: keys.proposalTaskId,
    title: "Draft RCAP partner proposal",
    description: "Prepare the RCAP partner proposal for Roger review. No email or external delivery is allowed from this task.",
    owner: existing?.owner || "Roger",
    status: existing?.status === "done" ? "done" : "review_ready",
    priority: "high",
    dueDate: existing?.dueDate || generatedDate,
    sourceType: "production_activation",
    sourceId: rcapActivationKey,
    partnerId: keys.partnerId,
    riskLevel: "medium",
    nextAction: "Review proposal draft and decide whether it is ready for manual partner-facing editing.",
    review_only: true,
    noEmailSideEffects: true,
    createdAt: existing?.createdAt || generatedAt,
    updatedAt: generatedAt,
    history: safeHistory(existing || {}, generatedAt)
  }));
  next.tasks = taskResult.collection;
  summary.proposal_task = taskResult.status;

  const proposalResult = upsertBy(next.partnerProgramArtifacts, (item) => item.key === keys.proposalDraft, (existing) => ({
    ...(existing || {}),
    id: existing?.id || "artifact-" + keys.proposalDraft,
    key: keys.proposalDraft,
    partnerId: keys.partnerId,
    partnerSlug: "rcap",
    partnerProgramId: keys.partnerProgramId,
    artifactType: "proposal",
    title: "RCAP Partner Proposal Draft",
    status: "draft",
    reviewOnly: true,
    externalSendAllowed: false,
    generatedAt: existing?.generatedAt || generatedAt,
    updatedAt: generatedAt,
    sections: {
      objective: "Create a review-only proposal for the first RCAP production workflow.",
      proposedWorkflow: "Partner intake, Wilma guidance, RecordShield access, Expungement.ai routing where available, partner dashboard tracking, weekly report draft, and final evidence-ready reporting.",
      implementationOutline: "Confirm missing external details, review proposal language, approve partner page draft, verify dashboard readiness, then decide manually whether to send or publish.",
      reviewChecklist: ["Confirm partner facts", "Review compliance language", "Confirm pricing/package separately", "Approve manually before any external action"],
      manualApprovalRequired: true
    },
    complianceNote: "LegalEase provides guided intake, information, workflow infrastructure, document preparation support where available, and partner reporting. LegalEase does not guarantee eligibility, court approval, filing acceptance, or legal outcomes."
  }));
  next.partnerProgramArtifacts = proposalResult.collection;
  summary.proposal_draft = proposalResult.status;

  const pageResult = upsertBy(next.partnerProgramArtifacts, (item) => item.key === keys.partnerPageDraft, (existing) => ({
    ...(existing || {}),
    id: existing?.id || "artifact-" + keys.partnerPageDraft,
    key: keys.partnerPageDraft,
    partnerId: keys.partnerId,
    partnerSlug: "rcap",
    partnerProgramId: keys.partnerProgramId,
    artifactType: "partner_page",
    title: "RCAP Partner Page Draft",
    status: "draft",
    reviewOnly: true,
    published: false,
    liveUrl: existing?.liveUrl || null,
    externalPublishAllowed: false,
    generatedAt: existing?.generatedAt || generatedAt,
    updatedAt: generatedAt,
    draftContent: {
      headline: "Record-Clearing Access Program",
      intro: "A review-only draft page for explaining RCAP access, intake, routing, reporting, and partner next steps.",
      cta: "Start with guided intake",
      faq: ["What does LegalEase provide?", "What is not guaranteed?", "What happens after intake?"],
      complianceDisclaimer: "No eligibility, filing acceptance, court approval, or legal outcome is guaranteed. This page must be reviewed before publishing."
    }
  }));
  next.partnerProgramArtifacts = pageResult.collection;
  summary.partner_page_draft = pageResult.status;

  const reportExists = next.reports.some((item) => item.key === keys.weeklyReportDraft);
  const evidenceExists = next.evidencePackNotes.some((item) => item.key === keys.evidenceNote);
  const dashboardResult = upsertBy(next.partnerProgramArtifacts, (item) => item.key === keys.dashboardReadiness, (existing) => ({
    ...(existing || {}),
    id: existing?.id || "artifact-" + keys.dashboardReadiness,
    key: keys.dashboardReadiness,
    partnerId: keys.partnerId,
    partnerSlug: "rcap",
    partnerProgramId: keys.partnerProgramId,
    artifactType: "dashboard_readiness",
    title: "RCAP Dashboard Readiness",
    status: "review_required",
    reviewOnly: true,
    dashboardLive: false,
    activationAllowed: false,
    generatedAt: existing?.generatedAt || generatedAt,
    updatedAt: generatedAt,
    checklist: {
      partnerRecordCreated: true,
      proposalDraftCreated: true,
      partnerPageDraftCreated: true,
      weeklyReportDraftCreated: reportExists || true,
      evidenceNoteCreated: evidenceExists || true,
      manualApprovalRequired: true,
      liveGatesRemainZero: liveGates === 0
    }
  }));
  next.partnerProgramArtifacts = dashboardResult.collection;
  summary.dashboard_readiness = dashboardResult.status;

  const weeklyReportResult = upsertBy(next.reports, (item) => item.key === keys.weeklyReportDraft, (existing) => ({
    ...(existing || {}),
    id: existing?.id || "report-" + keys.weeklyReportDraft,
    key: keys.weeklyReportDraft,
    partnerId: keys.partnerId,
    partnerSlug: "rcap",
    reportType: "partner_weekly_activation_report",
    title: "RCAP Weekly Activation Report Draft",
    status: "draft",
    reviewOnly: true,
    generatedAt: existing?.generatedAt || generatedAt,
    updatedAt: generatedAt,
    sections: {
      activationSummary: "RCAP production activation artifacts were prepared for internal review only.",
      completedArtifacts: ["Partner record", "Proposal task", "Proposal draft", "Partner page draft", "Dashboard readiness tracking", "Weekly report draft", "Evidence note"],
      openReviewItems: ["Confirm external partner facts", "Review proposal draft", "Review partner page draft", "Verify dashboard readiness", "Approve any external action manually"],
      noExternalActionTaken: true,
      nextManualApprovalStep: "Roger reviews the draft artifacts and decides what, if anything, moves outward."
    }
  }));
  next.reports = weeklyReportResult.collection;
  summary.weekly_report_draft = weeklyReportResult.status;

  const artifactsCreatedOrFound = {
    partnerRecord: true,
    proposalTask: true,
    proposalDraft: true,
    partnerPageDraft: true,
    dashboardReadiness: true,
    weeklyReportDraft: true,
    evidenceNote: true
  };
  const evidenceResult = upsertBy(next.evidencePackNotes, (item) => item.key === keys.evidenceNote, (existing) => ({
    ...(existing || {}),
    id: existing?.id || "evidence-" + keys.evidenceNote,
    key: keys.evidenceNote,
    title: "RCAP Production Activation Evidence",
    type: "production_activation",
    status: "recorded",
    reviewOnly: true,
    partnerId: keys.partnerId,
    partnerSlug: "rcap",
    activationKey: rcapActivationKey,
    timestamp: generatedAt,
    artifactsCreatedOrFound,
    liveGatesCount: liveGates,
    noEmailSent: true,
    noPostPublished: true,
    noPartnerPagePublished: true,
    noDashboardActivated: true,
    ownerTokenAuthUnchanged: true,
    notes: "Review-only production activation record. Unknown external contact details remain null, TBD, or review_required."
  }));
  next.evidencePackNotes = evidenceResult.collection;
  summary.evidence_note = evidenceResult.status;

  const dataRoomResult = upsertBy(next.dataRoomItems, (item) => item.id === "dataroom-" + keys.evidenceNote, (existing) => ({
    ...(existing || {}),
    id: "dataroom-" + keys.evidenceNote,
    title: "RCAP production activation evidence note",
    itemType: "evidence_note",
    status: "draft",
    owner: "Roger",
    lastUpdated: generatedDate,
    reviewOnly: true,
    sourceId: keys.evidenceNote,
    notes: "Internal evidence note for RCAP production activation. No external action was taken."
  }));
  next.dataRoomItems = dataRoomResult.collection;

  const eventResult = upsertBy(next.activityEvents, (item) => item.id === keys.eventId, (existing) => ({
    ...(existing || {}),
    id: keys.eventId,
    eventType: "production_activation",
    title: "RCAP production activation prepared",
    relatedObjectType: "partner",
    relatedObjectId: keys.partnerId,
    riskLevel: "medium",
    proofValue: "internal_readiness",
    revenueImpact: "not_booked",
    nextAction: "Manual review required before any external action.",
    metadata: {
      activationKey: rcapActivationKey,
      reviewOnly: true,
      liveGatesCount: liveGates,
      externalSideEffects: false
    },
    createdAt: existing?.createdAt || generatedAt,
    updatedAt: generatedAt
  }));
  next.activityEvents = eventResult.collection;

  const auditResult = upsertBy(next.auditHistory, (item) => item.id === keys.auditId, (existing) => ({
    ...(existing || {}),
    id: keys.auditId,
    timestamp: generatedAt,
    actor: options.actor || "local_operator",
    action: "rcap production activation prepared",
    resourceType: "production_activation",
    resourceId: rcapActivationKey,
    beforeValue: null,
    afterValue: {
      reviewOnly: true,
      liveGatesCount: liveGates,
      noEmailSent: true,
      noPostPublished: true,
      noPartnerPagePublished: true,
      noDashboardActivated: true
    }
  }));
  next.auditHistory = auditResult.collection;

  summary.data_room_evidence_note = dataRoomResult.status;
  summary.activity_event = eventResult.status;
  summary.audit_record = auditResult.status;

  return { state: next, summary: { ...rcapActivationStatus(next), ...summary } };
}
