import { buildPartnerProgramAutonomyActions } from "./partner-program-engine.mjs";

const nowIso = () => new Date().toISOString();
const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value || "").trim();
const lower = (value = "") => clean(value).toLowerCase();

const forbiddenActionTypes = new Set([
  "send_email",
  "live_publish",
  "change_pricing",
  "material_legal_policy_change",
  "expose_secret",
  "destructive_delete",
  "disable_rls",
  "remove_audit_logs"
]);

const humanReviewCategories = new Set(["legal", "compliance", "security", "financial"]);

function uid(prefix = "autonomy") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 10) || Math.random().toString(36).slice(2, 12)}`;
}

function stableId(parts = []) {
  return parts.map((part) => lower(part).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter(Boolean).join("-").slice(0, 120);
}

function daysSince(value = "") {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 999;
  return Math.floor((Date.now() - time) / 86400000);
}

function nextDate(days = 3) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function classifyAction(input = {}) {
  const risk = lower(input.riskLevel || "low");
  const category = lower(input.category || "operations");
  const type = lower(input.actionType || "");
  const text = lower([input.title, input.description, input.recommendedAction].join(" "));
  if (forbiddenActionTypes.has(type)) return "forbidden";
  if (/guarantee|you qualify|we will clear|court will approve|instant approval|legal advice/.test(text)) return "forbidden";
  if (risk === "critical") return "forbidden";
  if (humanReviewCategories.has(category) || risk === "high") return "human_review";
  if (input.externalImpact || input.publicFacing || risk === "medium") return "approval_required";
  return "automatic";
}

function autonomyAction(input = {}) {
  const decisionClass = input.decisionClass || classifyAction(input);
  const category = input.category || "operations";
  const approvalPolicy = decisionClass === "automatic"
    ? "auto_safe"
    : decisionClass === "approval_required"
      ? "approval_required"
      : decisionClass === "human_review"
        ? "hard_human_review"
        : "never_execute";
  const requiredRole = category === "compliance" || category === "legal"
    ? "Compliance"
    : category === "security"
      ? "Admin"
      : category === "financial"
        ? "Owner"
        : decisionClass === "approval_required"
          ? "Owner"
          : "System";
  return {
    id: input.id || `auto-${stableId([input.actionType, input.sourceType, input.sourceId, input.title]) || uid("action")}`,
    title: input.title || "Review automation action",
    description: input.description || "",
    actionType: input.actionType || "review",
    category,
    sourceType: input.sourceType || "system",
    sourceId: input.sourceId || "",
    riskLevel: input.riskLevel || "low",
    decisionClass,
    approvalPolicy,
    requiredRole,
    status: decisionClass === "forbidden" ? "blocked" : "pending",
    owner: input.owner || "Operations",
    whyItMatters: input.whyItMatters || input.description || "",
    recommendedAction: input.recommendedAction || "Review",
    blockedReason: decisionClass === "forbidden" ? input.blockedReason || "Policy prevents this action from running." : input.blockedReason || "",
    canExecuteAutomatically: decisionClass === "automatic" && Boolean(input.safeExecutor),
    safeExecutor: input.safeExecutor || "",
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function existingOpenTask(state = {}, sourceType = "", sourceId = "", title = "") {
  return list(state.tasks).some((task) =>
    lower(task.relatedObjectType || task.relatedType) === lower(sourceType)
    && clean(task.relatedObjectId || task.relatedId) === clean(sourceId)
    && lower(task.title) === lower(title)
    && !/done|closed|archived/i.test(task.status || "")
  );
}

function postHasPublicUrl(post = {}) {
  return Boolean(post.publicImageUrl || post.finalExportKit?.publicImageUrl || post.image?.publicImageUrl);
}

function postHasFinalPng(post = {}) {
  return Boolean(post.finalPngPath || post.finalPngFilename || post.finalExportKit?.finalPngPath || post.finalExportKit?.finalPngReady || post.imageFinalized);
}

export function buildAutonomyActions(state = {}) {
  const actions = [];
  const add = (action) => actions.push(autonomyAction(action));

  add({
    id: "auto-refresh-operating-priorities",
    title: "Refresh operating priorities",
    description: "Rebuild the COO brief, priorities, blockers, approvals, growth signals, and next best actions from current state.",
    actionType: "refresh_priorities",
    category: "operations",
    riskLevel: "low",
    owner: "System",
    recommendedAction: "Run automatically",
    safeExecutor: "refresh_priorities"
  });

  for (const partner of list(state.partners)) {
    const name = partner.organizationName || partner.name || "Partner";
    const sourceId = partner.id || name;
    if (!clean(partner.nextFollowUpDate) && !existingOpenTask(state, "partner", sourceId, `Set follow-up for ${name}`)) {
      add({
        title: `Set follow-up for ${name}`,
        description: "Partner has no next follow-up date, so the system should create a task instead of letting it disappear.",
        actionType: "create_task",
        category: "operations",
        sourceType: "partner",
        sourceId,
        riskLevel: "low",
        owner: partner.owner || "Roger",
        recommendedAction: "Create follow-up task",
        safeExecutor: "create_task"
      });
    }
    if (daysSince(partner.lastTouchDate || partner.updatedAt) >= 14 && !existingOpenTask(state, "partner", sourceId, `Follow up with ${name}`)) {
      add({
        title: `Follow up with ${name}`,
        description: "Partner has not been touched in 14+ days.",
        actionType: "create_task",
        category: "operations",
        sourceType: "partner",
        sourceId,
        riskLevel: "low",
        owner: partner.owner || "Roger",
        recommendedAction: "Create follow-up task",
        safeExecutor: "create_task"
      });
    }
  }

  for (const post of list(state.posts)) {
    const title = post.title || post.hook || "Post";
    if (post.status === "approved" && !postHasFinalPng(post)) {
      add({
        title: `Create final PNG: ${title}`,
        description: "Approved content still needs a final PNG before it can become a posting package or public-ready asset.",
        actionType: "create_final_png",
        category: "production",
        sourceType: "post",
        sourceId: post.id,
        riskLevel: post.complianceRisk === "high" ? "high" : "medium",
        publicFacing: true,
        owner: "Production",
        recommendedAction: "Generate final PNG"
      });
    }
    if (postHasFinalPng(post) && !postHasPublicUrl(post) && ["approved", "scheduled", "retry_ready"].includes(post.status)) {
      add({
        title: `Upload public image: ${title}`,
        description: "Social platforms that fetch media by URL need a public image URL before live publishing diagnostics can pass.",
        actionType: "upload_public_image",
        category: "production",
        sourceType: "post",
        sourceId: post.id,
        riskLevel: "medium",
        externalImpact: true,
        owner: "Production",
        recommendedAction: "Upload public image"
      });
    }
    if (/guarantee|you qualify|we will clear|court will approve|instant approval|legal advice/i.test([post.title, post.hook, post.body, post.caption].join(" "))) {
      add({
        title: `Forbidden claim detected: ${title}`,
        description: "This post appears to contain language that could imply legal advice, eligibility, or guaranteed outcomes.",
        actionType: "legal_claim_block",
        category: "legal",
        sourceType: "post",
        sourceId: post.id,
        riskLevel: "critical",
        owner: "Compliance",
        recommendedAction: "Rewrite before approval",
        blockedReason: "Forbidden legal/outcome claim."
      });
    }
  }

  for (const suggestion of list(state.automationSuggestions).filter((item) => ["pending", "edited"].includes(item.status))) {
    add({
      title: `Review automation suggestion: ${suggestion.title}`,
      description: suggestion.explanation || "Automation found a possible update. Human approval is required before it changes operating records.",
      actionType: "approve_automation_suggestion",
      category: "operations",
      sourceType: "automationSuggestion",
      sourceId: suggestion.id,
      riskLevel: suggestion.confidence === "high" ? "medium" : "low",
      owner: "Operations",
      recommendedAction: "Approve, edit, or ignore"
    });
  }

  for (const item of list(state.complianceItems).filter((entry) => ["high", "critical"].includes(lower(entry.riskLevel)) && !/approved/i.test(entry.status || ""))) {
    add({
      title: `Compliance review required: ${item.itemTitle || item.title || "Item"}`,
      description: item.issueSummary || "High-risk consumer-facing content requires hard human review.",
      actionType: "compliance_review",
      category: "compliance",
      sourceType: "complianceItem",
      sourceId: item.id,
      riskLevel: item.riskLevel || "high",
      owner: item.reviewer || "Compliance",
      recommendedAction: "Review before launch"
    });
  }

  for (const program of list(state.partnerPrograms)) {
    for (const action of buildPartnerProgramAutonomyActions(program)) {
      add(action);
    }
  }

  add({
    id: "auto-live-publishing-disabled",
    title: "Live publishing remains fail-closed",
    description: "The system must not publish to social platforms unless live gates, credentials, public image URLs, and confirmation checks pass.",
    actionType: "live_publish",
    category: "production",
    riskLevel: "critical",
    owner: "System",
    recommendedAction: "Keep blocked until explicitly configured",
    blockedReason: "Live external publishing requires explicit operator setup and confirmation."
  });

  return actions;
}

function mergeAutonomyActions(existing = [], generated = []) {
  const byId = new Map(list(existing).map((item) => [item.id, item]));
  return generated.map((action) => {
    const previous = byId.get(action.id);
    if (!previous) return action;
    if (["approved", "executed", "ignored", "blocked"].includes(previous.status) && previous.updatedAt >= action.createdAt) {
      return { ...action, ...previous, title: action.title, description: action.description, decisionClass: action.decisionClass, blockedReason: action.blockedReason || previous.blockedReason };
    }
    return { ...previous, ...action, createdAt: previous.createdAt || action.createdAt };
  }).concat(list(existing).filter((item) => !generated.some((action) => action.id === item.id)).slice(0, 50)).slice(0, 120);
}

function taskFromAction(action = {}) {
  return {
    id: uid("task-autonomy"),
    title: action.title,
    relatedObjectType: action.sourceType,
    relatedObjectId: action.sourceId,
    dueDate: nextDate(action.sourceType === "partner" ? 2 : 3),
    owner: action.owner || "Operations",
    priority: action.riskLevel === "medium" ? "Normal" : "Low",
    status: "open",
    suggestedAction: action.recommendedAction || action.title,
    draftMessage: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    source: "autonomy_engine"
  };
}

export function runAutonomyCycleOnState(state = {}, options = {}) {
  const now = nowIso();
  const generated = buildAutonomyActions(state);
  const merged = mergeAutonomyActions(state.autonomyActions || [], generated);
  const executed = [];
  const tasks = [...list(state.tasks)];
  const taskKeys = new Set(tasks.map((task) => [lower(task.title), lower(task.relatedObjectType), clean(task.relatedObjectId), lower(task.status)].join("|")));
  const nextActions = merged.map((action) => {
    if (!options.executeAutomatic || action.decisionClass !== "automatic" || action.status !== "pending" || !action.safeExecutor) return action;
    if (action.safeExecutor === "create_task") {
      const task = taskFromAction(action);
      const key = [lower(task.title), lower(task.relatedObjectType), clean(task.relatedObjectId), lower(task.status)].join("|");
      if (!taskKeys.has(key)) {
        tasks.unshift(task);
        taskKeys.add(key);
        executed.push({ ...action, executionResult: "Task created" });
      }
      return { ...action, status: "executed", executedAt: now, updatedAt: now, executionResult: "Task created or already existed" };
    }
    if (action.safeExecutor === "refresh_priorities") {
      executed.push({ ...action, executionResult: "Priority rebuild requested" });
      return { ...action, status: "executed", executedAt: now, updatedAt: now, executionResult: "Priority rebuild requested" };
    }
    return action;
  });
  const run = {
    id: uid("autonomy-run"),
    startedAt: now,
    finishedAt: nowIso(),
    status: "complete",
    generatedCount: generated.length,
    automaticCount: nextActions.filter((item) => item.decisionClass === "automatic").length,
    approvalRequiredCount: nextActions.filter((item) => item.decisionClass === "approval_required").length,
    humanReviewCount: nextActions.filter((item) => item.decisionClass === "human_review").length,
    forbiddenCount: nextActions.filter((item) => item.decisionClass === "forbidden").length,
    executedCount: executed.length,
    notes: "Routine internal actions only. No emails, live publishing, pricing, secrets, legal policy changes, or destructive database actions were executed."
  };
  const activity = executed.length ? [{
    id: uid("activity-autonomy"),
    eventType: "Autonomy cycle",
    title: `${executed.length} routine action(s) handled automatically`,
    relatedObjectType: "autonomy",
    relatedObjectId: run.id,
    createdAt: run.finishedAt
  }] : [];
  const audit = [{
    id: uid("soc2-audit-autonomy"),
    timestamp: run.finishedAt,
    actor: "autonomy_engine",
    action: "autonomy cycle run",
    resourceType: "autonomy",
    resourceId: run.id,
    controlArea: "AI Governance",
    beforeValue: null,
    afterValue: {
      generatedCount: run.generatedCount,
      executedCount: run.executedCount,
      forbiddenCount: run.forbiddenCount
    },
    ip: "local",
    userAgent: "preview-server"
  }];
  const decisions = nextActions.map((action) => ({
    id: uid("autonomy-decision"),
    timestamp: run.finishedAt,
    actionId: action.id,
    actionType: action.actionType,
    title: action.title,
    decisionClass: action.decisionClass,
    approvalPolicy: action.approvalPolicy,
    requiredRole: action.requiredRole,
    status: action.status,
    owner: action.owner,
    sourceType: action.sourceType,
    sourceId: action.sourceId,
    reason: action.blockedReason || action.description || action.whyItMatters || "",
    runId: run.id
  }));
  return {
    state: {
      ...state,
      autonomyActions: nextActions,
      autonomyRuns: [run, ...list(state.autonomyRuns)].slice(0, 100),
      autonomyDecisions: [...decisions, ...list(state.autonomyDecisions)].slice(0, 1000),
      tasks,
      activityEvents: [...activity, ...list(state.activityEvents)].slice(0, 500),
      soc2AuditLogs: [...audit, ...list(state.soc2AuditLogs)]
    },
    run,
    executed,
    actions: nextActions,
    summary: autonomySummaryForActions(nextActions, run)
  };
}

export function autonomySummaryForActions(actions = [], latestRun = null) {
  const active = list(actions).filter((item) => !["ignored", "archived"].includes(item.status));
  return {
    total: active.length,
    automatic: active.filter((item) => item.decisionClass === "automatic").length,
    approvalRequired: active.filter((item) => item.decisionClass === "approval_required").length,
    humanReview: active.filter((item) => item.decisionClass === "human_review").length,
    forbidden: active.filter((item) => item.decisionClass === "forbidden").length,
    executed: active.filter((item) => item.status === "executed").length,
    pendingDecision: active.filter((item) => ["approval_required", "human_review"].includes(item.decisionClass) && item.status === "pending").length,
    latestRunAt: latestRun?.finishedAt || "",
    latestRunStatus: latestRun?.status || "not_run"
  };
}

export function buildAutonomyReport(state = {}) {
  const generated = buildAutonomyActions(state);
  const actions = mergeAutonomyActions(state.autonomyActions || [], generated);
  const latestRun = list(state.autonomyRuns)[0] || null;
  return {
    summary: autonomySummaryForActions(actions, latestRun),
    actions,
    policy: {
      automatic: "Routine, internal, reversible actions may run automatically.",
      approvalRequired: "Public-facing, external, or medium-risk actions wait for human approval.",
      humanReview: "Legal, compliance, security, financial, and high-risk actions require hard human review.",
      forbidden: "Email sending, live publishing, pricing changes, legal outcome promises, destructive database work, secret exposure, RLS weakening, and audit-log removal never execute automatically."
    },
    latestRun
  };
}

function roleMatrix() {
  return [
    { role: "Owner", canApprove: ["approval_required", "hard_human_review"], canRun: ["auto_safe"], notes: "Owns business, finance, live gate, investor, and final external decisions." },
    { role: "Admin", canApprove: ["approval_required", "hard_human_review"], canRun: ["auto_safe"], notes: "Owns infrastructure, vendor, access, and deployment controls." },
    { role: "Marketing", canApprove: ["approval_required"], canRun: ["auto_safe"], notes: "Can prepare and approve normal marketing production, never legal-sensitive claims." },
    { role: "Reviewer", canApprove: ["approval_required"], canRun: [], notes: "Can review content and reports but not override safety gates." },
    { role: "Compliance", canApprove: ["hard_human_review"], canRun: [], notes: "Required for high-risk legal, compliance, AI governance, and policy-sensitive actions." },
    { role: "Partner", canApprove: [], canRun: [], notes: "Partner-specific read or review access only." },
    { role: "Investor Readonly", canApprove: [], canRun: [], notes: "Read-only diligence surface; no operational actions." }
  ];
}

function productionRunbooks() {
  return [
    {
      id: "runbook-live-publishing",
      title: "Enable live publishing",
      owner: "Owner",
      trigger: "Only after diagnostics, approval, public image URL, channel account, and live gate all pass.",
      stopConditions: ["missing approval", "missing final PNG", "missing public URL", "missing token", "failed autonomy check", "live gate disabled"],
      rollback: "Disable the platform live gate and return to manual posting."
    },
    {
      id: "runbook-secret-exposure",
      title: "Secret exposure response",
      owner: "Admin",
      trigger: "Any suspected key/token exposure in logs, HTML, exports, or state endpoints.",
      stopConditions: ["secret visible in browser", "secret visible in report", "service role used client-side"],
      rollback: "Rotate affected keys, invalidate tokens, audit logs, and redeploy."
    },
    {
      id: "runbook-supabase-hosted-mode",
      title: "Hosted persistence cutover",
      owner: "Admin",
      trigger: "Render deployment switches STORAGE_BACKEND=supabase.",
      stopConditions: ["leos_core_records missing", "RLS disabled", "service role unavailable", "health endpoint failing"],
      rollback: "Set STORAGE_BACKEND=json locally and keep hosted app paused until DB checks pass."
    },
    {
      id: "runbook-compliance-review",
      title: "High-risk content review",
      owner: "Compliance",
      trigger: "Eligibility, court, legal-process, pricing, refund, AI-output, or sensitive legal-data claims.",
      stopConditions: ["outcome promise", "legal advice", "missing disclaimer", "reviewer missing"],
      rollback: "Block content and create rewrite task."
    }
  ];
}

function eventIntelligence(state = {}) {
  const events = [
    ...list(state.activityEvents).map((event) => ({ ...event, source: event.source || "activity", eventType: event.eventType || "activity" })),
    ...list(state.automationEvents),
    ...list(state.syncRuns).map((event) => ({ ...event, source: event.connector || "sync", eventType: "sync_run" }))
  ];
  const unattributedEvents = events.filter((event) =>
    ["website", "recordshield", "expungement_ai", "product"].includes(lower(event.source))
    && !clean(event.partnerId || event.campaignId || event.relatedEntityId)
  ).length;
  const supportSignals = events.filter((event) => /support|complaint|refund|confus|error|court rejection|legal advice/i.test([event.source, event.eventType, event.title, event.summary].join(" "))).slice(0, 10);
  const staleConnectors = list(state.connectorStatus).filter((connector) => {
    if (!connector.configured) return false;
    if (!connector.lastSyncAt) return true;
    return daysSince(connector.lastSyncAt) >= 7;
  });
  return {
    totalEvents: events.length,
    unattributedEvents,
    supportSignals,
    staleConnectors,
    latestEvents: events.sort((a, b) => String(b.createdAt || b.receivedAt || b.finishedAt || "").localeCompare(String(a.createdAt || a.receivedAt || a.finishedAt || ""))).slice(0, 10)
  };
}

function revenueAwareness(state = {}) {
  const partners = list(state.partners);
  const pilots = list(state.pilots);
  const campaigns = list(state.campaigns);
  const expectedPipeline = [...partners, ...pilots].reduce((sum, item) => sum + Number(item.expectedValue || item.price || 0), 0);
  const weightedPipeline = [...partners, ...pilots].reduce((sum, item) => {
    const value = Number(item.expectedValue || item.price || 0);
    const probability = Number(item.probability || item.closeProbability || 0) / 100;
    return sum + Math.round(value * probability);
  }, 0);
  const revenueTagged = campaigns.reduce((sum, item) => sum + Number(item.revenue || item.paidConversionsRevenue || 0), 0);
  const sponsoredUserValue = campaigns.reduce((sum, item) => sum + Number(item.sponsoredUserValue || 0), 0);
  return {
    expectedPipeline,
    weightedPipeline,
    revenueTagged,
    sponsoredUserValue,
    revenueSignals: campaigns.filter((item) => Number(item.revenue || item.paidConversions || item.sponsoredUserValue || 0) > 0).slice(0, 10)
  };
}

function ownershipGaps(state = {}) {
  const collections = [
    ["partner", list(state.partners), "organizationName"],
    ["campaign", list(state.campaigns), "campaignName"],
    ["pilot", list(state.pilots), "pilotName"],
    ["task", list(state.tasks), "title"],
    ["data_room_item", list(state.dataRoomItems), "title"],
    ["compliance_item", list(state.complianceItems), "itemTitle"]
  ];
  const unownedRecords = [];
  const missingNextAction = [];
  for (const [type, records, titleKey] of collections) {
    for (const record of records) {
      if (!clean(record.owner || record.internalOwner || record.reviewer)) {
        unownedRecords.push({ type, id: record.id, title: record[titleKey] || record.title || record.id || type });
      }
      if (!clean(record.nextAction || record.nextBestAction || record.suggestedAction) && type !== "compliance_item") {
        missingNextAction.push({ type, id: record.id, title: record[titleKey] || record.title || record.id || type });
      }
    }
  }
  return { unownedRecords, missingNextAction };
}

export function buildAutonomyGovernance(state = {}) {
  const actions = buildAutonomyActions(state);
  const events = eventIntelligence(state);
  const revenue = revenueAwareness(state);
  const ownership = ownershipGaps(state);
  return {
    actions,
    roleMatrix: roleMatrix(),
    runbooks: productionRunbooks(),
    eventIntelligence: events,
    revenueAwareness: revenue,
    ownership,
    safetyRails: [
      "Never expose secrets.",
      "Never loosen fail-closed publishing.",
      "Never auto-publish without live gate, approval, and autonomy clearance.",
      "Never send emails without approval.",
      "Never generate legal advice.",
      "Never promise eligibility.",
      "Never promise court outcomes.",
      "Never delete production data without explicit confirmation.",
      "Never remove audit logs.",
      "Never weaken RLS or access control in production.",
      "Never commit API keys or tokens."
    ]
  };
}
