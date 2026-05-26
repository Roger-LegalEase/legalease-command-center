import crypto from "node:crypto";

const terminalStatuses = new Set(["done", "dismissed"]);

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

function task(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const escalationKey = input.escalationKey || `${input.sourceType || "manual"}:${input.sourceId || slug(input.title)}:${slug(input.title)}`;
  return {
    id: input.id || `task-${slug(escalationKey)}-${crypto.randomUUID().slice(0, 6)}`,
    title: clean(input.title) || "Untitled task",
    description: clean(input.description),
    owner: clean(input.owner) || "Roger",
    status: input.status || "open",
    priority: priority(input.priority),
    dueDate: input.dueDate || todayIso(now),
    sourceType: clean(input.sourceType),
    sourceId: clean(input.sourceId),
    partnerId: clean(input.partnerId),
    campaignId: clean(input.campaignId),
    pilotId: clean(input.pilotId),
    riskLevel: clean(input.riskLevel) || "low",
    nextAction: clean(input.nextAction) || clean(input.title) || "Review task",
    escalationReason: clean(input.escalationReason),
    escalationKey,
    history: input.history || [{ action: "created", at: now, note: input.escalationReason || "Task created." }],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  };
}

export function deriveAutomaticTasks(state = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const dayOfWeek = Number.isFinite(options.dayOfWeek) ? options.dayOfWeek : new Date(now).getDay();
  const tasks = [];

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
  const history = [{ action, at: now, note: patch.note || patch.reason || "" }, ...(existing.history || [])].slice(0, 30);
  if (action === "done") return { ...existing, status: "done", completedAt: now, updatedAt: now, history };
  if (action === "dismiss") return { ...existing, status: "dismissed", dismissalReason: patch.reason || "Dismissed by operator.", updatedAt: now, history };
  if (action === "snooze") return { ...existing, status: "waiting", dueDate: addDaysIso(now, Number(patch.days || 3)), updatedAt: now, history };
  if (action === "assign") return { ...existing, owner: patch.owner || existing.owner || "Roger", updatedAt: now, history };
  if (action === "block") return { ...existing, status: "blocked", escalationReason: patch.reason || existing.escalationReason || "Blocked.", updatedAt: now, history };
  return { ...existing, ...patch, status: patch.status || action || existing.status, updatedAt: now, history };
}
