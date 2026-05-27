import crypto from "node:crypto";
import { partnerLifecycleTasks } from "./partner-lifecycle.mjs";

const terminalStatuses = new Set(["done", "dismissed", "archived"]);
export const supportedTaskStatuses = ["open", "in_progress", "waiting", "blocked", "done", "archived"];
export const taskViews = [
  { id: "today", label: "Today" },
  { id: "blocked", label: "Blocked" },
  { id: "waiting", label: "Waiting" },
  { id: "this-week", label: "This Week" },
  { id: "all", label: "All" }
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value || "").trim();
}

function slug(value = "") {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
}

function todayIso(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function addDaysIso(now = new Date(), days = 0) {
  const date = new Date(now);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function daysSince(value = "", now = new Date()) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return 999;
  return Math.floor((new Date(now).getTime() - time) / 86400000);
}

function daysUntil(value = "", now = new Date()) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return 999;
  return Math.ceil((time - new Date(now).getTime()) / 86400000);
}

function priority(value = "medium") {
  const normalized = clean(value).toLowerCase();
  if (["critical", "high", "medium", "low"].includes(normalized)) return normalized;
  if (normalized === "normal") return "medium";
  return "medium";
}

function status(value = "open") {
  const normalized = clean(value).toLowerCase();
  if (supportedTaskStatuses.includes(normalized)) return normalized;
  if (normalized === "dismissed") return "archived";
  if (normalized === "complete" || normalized === "completed") return "done";
  return "open";
}

function taskDueDate(input = {}, now = new Date()) {
  return input.due_date || input.dueDate || todayIso(now);
}

function sourceValue(input = {}) {
  return clean(input.source || input.sourceType);
}

function task(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const escalationKey = input.escalationKey || `${input.sourceType || "manual"}:${input.sourceId || slug(input.title)}:${slug(input.title)}`;
  return {
    id: input.id || `task-${slug(escalationKey)}-${crypto.randomUUID().slice(0, 6)}`,
    title: clean(input.title) || "Untitled task",
    description: clean(input.description),
    owner: clean(input.owner) || "Roger",
    status: status(input.status || "open"),
    priority: priority(input.priority),
    due_date: taskDueDate(input, now),
    dueDate: taskDueDate(input, now),
    source: sourceValue(input),
    sourceType: sourceValue(input),
    sourceId: clean(input.sourceId),
    linked_partner: clean(input.linked_partner || input.linkedPartner || input.partnerId),
    linked_workflow: clean(input.linked_workflow || input.linkedWorkflow || input.workflow),
    partnerId: clean(input.partnerId || input.linked_partner || input.linkedPartner),
    campaignId: clean(input.campaignId),
    pilotId: clean(input.pilotId),
    risk_level: clean(input.risk_level || input.riskLevel) || "low",
    riskLevel: clean(input.riskLevel || input.risk_level) || "low",
    nextAction: clean(input.nextAction) || clean(input.title) || "Review task",
    escalation_reason: clean(input.escalation_reason || input.escalationReason),
    escalationReason: clean(input.escalationReason || input.escalation_reason),
    blocker_reason: clean(input.blocker_reason || input.blockerReason),
    waiting_on: clean(input.waiting_on || input.waitingOn),
    completion_note: clean(input.completion_note || input.completionNote),
    review_state: clean(input.review_state || input.reviewState) || "review_required",
    escalationKey,
    history: input.history || [{ action: "created", at: now, note: input.escalationReason || "Task created." }],
    created_at: input.created_at || input.createdAt || now,
    updated_at: input.updated_at || input.updatedAt || now,
    createdAt: input.createdAt || input.created_at || now,
    updatedAt: input.updatedAt || input.updated_at || now
  };
}

export function normalizeTaskRecord(input = {}, options = {}) {
  return task(input, options);
}

export function deriveAutomaticTasks(state = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const dayOfWeek = Number.isFinite(options.dayOfWeek) ? options.dayOfWeek : new Date(now).getDay();
  const tasks = [...partnerLifecycleTasks(state, { now })];

  for (const partner of list(state.partners)) {
    const stale = !partner.nextAction || daysSince(partner.updatedAt || partner.lastTouchDate || partner.lastContacted, now) >= 7;
    if (stale) {
      tasks.push(task({
        title: `Set next action for ${partner.organizationName || partner.name || "partner"}`,
        description: "Partner motion stalls when follow-up lives in memory.",
        owner: partner.owner || "Roger",
        priority: partner.priority === "High" ? "high" : "medium",
        dueDate: todayIso(now),
        sourceType: "partner",
        sourceId: partner.id,
        partnerId: partner.id,
        nextAction: "Add next action and follow-up date.",
        escalationReason: "Partner has no next action within 7 days.",
        escalationKey: `partner-next-action:${partner.id}`
      }, { now }));
    }
  }

  for (const campaign of list(state.campaigns)) {
    const stale = daysSince(campaign.updatedAt || campaign.lastActivityAt || campaign.startDate, now) >= 7;
    if (!["completed", "killed", "report_generated"].includes(campaign.status) && stale) {
      tasks.push(task({
        title: `Add weekly campaign update: ${campaign.campaignName || "campaign"}`,
        description: "Campaigns need weekly movement, metrics, or a kill/review decision.",
        owner: campaign.owner || "Growth",
        priority: campaign.status === "live" ? "high" : "medium",
        dueDate: todayIso(now),
        sourceType: "campaign",
        sourceId: campaign.id,
        campaignId: campaign.id,
        nextAction: "Add current activity, blockers, metrics, or next report date.",
        escalationReason: "Campaign has no update this week.",
        escalationKey: `campaign-weekly-update:${campaign.id}`
      }, { now }));
    }
  }

  for (const approval of list(state.approvalQueue)) {
    if (/blocked/i.test(approval.status || "")) {
      tasks.push(task({
        title: `Clear blocked approval: ${approval.title || approval.sourceId || "approval item"}`,
        description: approval.summary || "Blocked approval item needs an owner and fix.",
        owner: "Roger",
        priority: "high",
        dueDate: todayIso(now),
        sourceType: "approval",
        sourceId: approval.id,
        riskLevel: approval.risk || "medium",
        nextAction: approval.recommendedAction || "Fix approval blocker.",
        escalationReason: "Approval item is blocked.",
        escalationKey: `approval-blocked:${approval.id}`
      }, { now }));
    }
  }

  if (dayOfWeek === 5 && !list(state.reports).some((report) => /weekly evidence/i.test(report.reportTitle || report.title || "") && String(report.generatedAt || report.createdAt || "").slice(0, 10) >= addDaysIso(now, -6))) {
    tasks.push(task({
      title: "Generate Weekly Evidence Pack",
      description: "Friday evidence pack keeps investor and partner proof current.",
      owner: "Roger",
      priority: "high",
      dueDate: todayIso(now),
      sourceType: "report",
      sourceId: "weekly-evidence-pack",
      nextAction: "Generate and review the Weekly Evidence Pack.",
      escalationReason: "Weekly evidence pack has not been generated by Friday.",
      escalationKey: "weekly-evidence-pack:friday"
    }, { now }));
  }

  for (const post of list(state.posts)) {
    if ((post.complianceRisk === "high" || post.riskLevel === "high") && !["approved", "posted", "archived"].includes(post.status) && daysSince(post.updatedAt || post.createdAt, now) >= 2) {
      tasks.push(task({
        title: `Review high-risk content: ${post.title || post.hook || "post"}`,
        description: "High-risk content has been waiting over 48 hours.",
        owner: "Compliance",
        priority: "critical",
        dueDate: todayIso(now),
        sourceType: "post",
        sourceId: post.id,
        riskLevel: "high",
        nextAction: "Route to compliance review or block.",
        escalationReason: "High-risk content waiting over 48 hours.",
        escalationKey: `high-risk-content:${post.id}`
      }, { now }));
    }
  }

  for (const pilot of list(state.pilots)) {
    if (!["completed", "expanded", "dormant", "lost"].includes(pilot.status) && daysSince(pilot.updatedAt || pilot.lastActivityAt || pilot.startDate, now) >= 14) {
      tasks.push(task({
        title: `Refresh stale pilot: ${pilot.pilotName || pilot.name || "pilot"}`,
        description: "Pilot has not moved in 14 days.",
        owner: pilot.internalOwner || pilot.owner || "Roger",
        priority: "high",
        dueDate: todayIso(now),
        sourceType: "pilot",
        sourceId: pilot.id,
        pilotId: pilot.id,
        nextAction: "Update status, decision date, or expansion path.",
        escalationReason: "Pilot stale for 14 days.",
        escalationKey: `pilot-stale:${pilot.id}`
      }, { now }));
    }
  }

  for (const item of list(state.growthInbox)) {
    if (!["converted", "ignored"].includes(item.status) && item.priority === "high") {
      tasks.push(task({
        title: `Triage Growth Inbox: ${item.summary || clean(item.rawText).slice(0, 80)}`,
        description: item.rawText || item.summary || "High-priority inbox item needs conversion.",
        owner: "Roger",
        priority: item.riskLevel === "high" ? "critical" : "high",
        dueDate: todayIso(now),
        sourceType: "growth_inbox",
        sourceId: item.id,
        riskLevel: item.riskLevel || "medium",
        nextAction: item.suggestedAction || "Triage and convert this signal.",
        escalationReason: "Growth Inbox item marked high priority.",
        escalationKey: `growth-inbox-high:${item.id}`
      }, { now }));
    }
    if (!["converted", "ignored"].includes(item.status) && String(item.status || "new").toLowerCase() === "new" && daysSince(item.createdAt || item.updatedAt, now) >= 1) {
      tasks.push(task({
        title: `Triage aging inbox item: ${item.summary || clean(item.rawText).slice(0, 80)}`,
        description: item.rawText || item.summary || "Inbox item has not been triaged.",
        owner: item.owner || "Operations",
        priority: item.riskLevel === "high" ? "critical" : "medium",
        dueDate: todayIso(now),
        sourceType: "growth_inbox",
        sourceId: item.id,
        riskLevel: item.riskLevel || "low",
        nextAction: item.suggestedAction || "Triage and route this signal.",
        escalationReason: "Growth Inbox item has been untriaged for more than 24 hours.",
        escalationKey: `growth-inbox-aging:${item.id}`
      }, { now }));
    }
  }

  for (const issue of list(state.supportIssues)) {
    if (!["done", "resolved", "closed", "dismissed"].includes(String(issue.status || "").toLowerCase()) && /high|critical/i.test(issue.severity || issue.priority || "")) {
      tasks.push(task({
        title: `Resolve support issue: ${issue.title || issue.summary || "support issue"}`,
        description: issue.summary || issue.recommendedFix || "High-severity support issue needs owner.",
        owner: issue.owner || "Roger",
        priority: /critical/i.test(issue.severity || "") ? "critical" : "high",
        dueDate: todayIso(now),
        sourceType: "support_issue",
        sourceId: issue.id,
        riskLevel: issue.riskLevel || "high",
        nextAction: issue.recommendedFix || "Review and resolve support issue.",
        escalationReason: "Support issue marked high severity.",
        escalationKey: `support-high:${issue.id}`
      }, { now }));
    }
  }

  for (const post of list(state.posts)) {
    const status = String(post.status || "").toLowerCase();
    const finalPngReady = Boolean(post.imageFinalized || post.finalPngPath || post.finalPngFilename || post.finalExportKit?.finalPngReady);
    const publicUrlReady = /^https:\/\//i.test(String(post.publicImageUrl || post.finalExportKit?.publicImageUrl || ""));
    if (["approved", "ready", "ready_to_publish"].includes(status) && !finalPngReady) {
      tasks.push(task({
        title: `Generate final PNG: ${post.title || post.hook || "approved post"}`,
        description: "Approved content cannot be distributed until a final PNG exists.",
        owner: "Production",
        priority: "high",
        dueDate: todayIso(now),
        sourceType: "post",
        sourceId: post.id,
        nextAction: "Create final PNG and confirm visual preview.",
        escalationReason: "Approved post is missing final PNG.",
        escalationKey: `post-final-png:${post.id}`
      }, { now }));
    }
    if (["approved", "ready", "ready_to_publish"].includes(status) && finalPngReady && !publicUrlReady) {
      tasks.push(task({
        title: `Upload public image URL: ${post.title || post.hook || "approved post"}`,
        description: "Most real social connectors require a public HTTPS image URL.",
        owner: "Production",
        priority: "high",
        dueDate: todayIso(now),
        sourceType: "post",
        sourceId: post.id,
        nextAction: "Upload final PNG to Supabase Storage.",
        escalationReason: "Approved post has final PNG but no public image URL.",
        escalationKey: `post-public-url:${post.id}`
      }, { now }));
    }
  }

  for (const evidence of list(state.soc2Evidence)) {
    if (!["approved", "archived"].includes(String(evidence.evidenceStatus || evidence.status || "").toLowerCase()) && evidence.nextCollectionDue && daysUntil(evidence.nextCollectionDue, now) < 0) {
      tasks.push(task({
        title: `Collect overdue evidence: ${evidence.evidenceTitle || evidence.title || "SOC 2 evidence"}`,
        description: "SOC 2 Readiness evidence cadence has slipped.",
        owner: evidence.owner || "Compliance",
        priority: "medium",
        dueDate: todayIso(now),
        sourceType: "soc2_evidence",
        sourceId: evidence.id,
        riskLevel: "medium",
        nextAction: "Collect, review, or archive this evidence record.",
        escalationReason: "SOC 2 evidence collection is overdue.",
        escalationKey: `soc2-evidence-overdue:${evidence.id}`
      }, { now }));
    }
  }

  return tasks;
}

export function mergeAutomaticTasks(state = {}, automaticTasks = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const existing = list(state.tasks);
  const existingKeys = new Set(existing.filter((task) => !terminalStatuses.has(task.status)).map((item) => item.escalationKey || `${item.sourceType}:${item.sourceId}:${slug(item.title)}`));
  const additions = automaticTasks.filter((item) => !existingKeys.has(item.escalationKey || `${item.sourceType}:${item.sourceId}:${slug(item.title)}`));
  return {
    ...state,
    tasks: [
      ...additions.map((item) => ({ ...item, createdAt: item.createdAt || now, updatedAt: item.updatedAt || now })),
      ...existing
    ]
  };
}

export function updateTask(existing = {}, action = "in_progress", patch = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const normalizedAction = String(action || "in_progress").replaceAll("-", "_");
  const note = clean(patch.note || patch.reason || patch.blocker_reason || patch.waiting_on || patch.completion_note);
  const history = [{ action: normalizedAction, at: now, actor: options.actor || "owner_token", note }, ...(existing.history || [])].slice(0, 50);
  const base = { ...normalizeTaskRecord(existing, { now }), history, updated_at: now, updatedAt: now };
  if (normalizedAction === "in_progress") return { ...base, status: "in_progress" };
  if (normalizedAction === "waiting") return { ...base, status: "waiting", waiting_on: clean(patch.waiting_on || patch.waitingOn || patch.note || patch.reason), waitingOn: clean(patch.waiting_on || patch.waitingOn || patch.note || patch.reason) };
  if (normalizedAction === "blocked" || normalizedAction === "block") {
    const blockerReason = clean(patch.blocker_reason || patch.blockerReason || patch.reason || patch.note);
    if (!blockerReason) throw new Error("Blocked task transition requires blocker reason.");
    return { ...base, status: "blocked", blocker_reason: blockerReason, blockerReason, escalation_reason: blockerReason, escalationReason: blockerReason };
  }
  if (normalizedAction === "done") {
    const completionNote = clean(patch.completion_note || patch.completionNote || patch.note || "Task completed.");
    return { ...base, status: "done", completion_note: completionNote, completionNote, completed_at: now, completedAt: now };
  }
  if (normalizedAction === "reopen") return { ...base, status: "open", blocker_reason: "", blockerReason: "", waiting_on: "", waitingOn: "" };
  if (normalizedAction === "archive" || normalizedAction === "dismiss") return { ...base, status: "archived", archive_reason: patch.reason || patch.note || "Archived by operator.", dismissalReason: patch.reason || patch.note || "Archived by operator." };
  if (normalizedAction === "add_note") return base;
  if (normalizedAction === "update_priority") return { ...base, priority: priority(patch.priority || existing.priority) };
  if (normalizedAction === "update_due_date") {
    const due = patch.due_date || patch.dueDate || existing.due_date || existing.dueDate || todayIso(now);
    return { ...base, due_date: due, dueDate: due };
  }
  if (normalizedAction === "snooze") {
    const due = addDaysIso(now, Number(patch.days || 3));
    return { ...base, status: "waiting", due_date: due, dueDate: due, waiting_on: patch.waiting_on || "Snoozed by operator.", waitingOn: patch.waiting_on || "Snoozed by operator." };
  }
  if (normalizedAction === "assign") return { ...base, owner: patch.owner || existing.owner || "Roger" };
  return normalizeTaskRecord({ ...base, ...patch, status: patch.status || normalizedAction || existing.status }, { now });
}

function taskUpdatedAt(task = {}) {
  return task.updated_at || task.updatedAt || task.created_at || task.createdAt || "";
}

function isOpenTask(task = {}) {
  return !terminalStatuses.has(String(task.status || "open").toLowerCase());
}

function withinThisWeek(dateValue = "", options = {}) {
  const due = Date.parse(dateValue || "");
  if (!Number.isFinite(due)) return false;
  const start = new Date(options.now || new Date());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return due >= start.getTime() && due <= end.getTime();
}

export function tasksForView(state = {}, view = "all", options = {}) {
  const today = todayIso(options.now || new Date());
  return list(state.tasks).map(task => normalizeTaskRecord(task, options)).filter(task => {
    const currentStatus = String(task.status || "open").toLowerCase();
    if (view === "today") return isOpenTask(task) && (task.due_date === today || task.dueDate === today || task.priority === "critical" || task.priority === "high" || /today/i.test(task.review_state || task.source || ""));
    if (view === "blocked") return currentStatus === "blocked";
    if (view === "waiting") return currentStatus === "waiting";
    if (view === "this-week") return isOpenTask(task) && (withinThisWeek(task.due_date || task.dueDate, options) || /this[_ -]?week|weekly/i.test([task.linked_workflow, task.source, task.title, task.description].join(" ")));
    return true;
  }).sort((a, b) => {
    const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)
      || String(a.due_date || "").localeCompare(String(b.due_date || ""))
      || String(taskUpdatedAt(b)).localeCompare(String(taskUpdatedAt(a)));
  });
}

export function updateTaskInState(state = {}, taskId = "", action = "in_progress", patch = {}, options = {}) {
  const tasks = list(state.tasks);
  const existing = tasks.find(task => task.id === taskId);
  if (!existing) throw new Error("Task not found.");
  const beforeStatus = existing.status || "open";
  const updated = updateTask(existing, action, patch, options);
  const timestamp = options.now || new Date().toISOString();
  const actor = options.actor || "owner_token";
  const normalizedAction = String(action || "").replaceAll("-", "_");
  const next = {
    ...state,
    tasks: tasks.map(task => task.id === taskId ? updated : task)
  };
  next.auditHistory = [{
    id: `audit-task-${taskId}-${normalizedAction}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: "task status changed",
    resourceType: "task",
    resourceId: taskId,
    beforeValue: { status: beforeStatus },
    afterValue: {
      status: updated.status,
      action: normalizedAction,
      priority: updated.priority,
      due_date: updated.due_date,
      externalSideEffects: false
    }
  }, ...list(state.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: `activity-task-${taskId}-${normalizedAction}-${Date.parse(timestamp) || Date.now()}`,
    eventType: "Task status changed",
    title: updated.title || "Task updated",
    summary: patch.completion_note || patch.blocker_reason || patch.waiting_on || patch.note || `Task moved from ${beforeStatus} to ${updated.status}.`,
    relatedObjectType: "task",
    relatedObjectId: taskId,
    riskLevel: updated.risk_level || updated.riskLevel || "low",
    metadata: {
      oldStatus: beforeStatus,
      newStatus: updated.status,
      action: normalizedAction,
      externalSideEffects: false,
      noExternalSystemsContacted: true
    },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, task: updated };
}
