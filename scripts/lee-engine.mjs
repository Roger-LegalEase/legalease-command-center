const nowIso = () => new Date().toISOString();
const list = (value) => Array.isArray(value) ? value : [];
const text = (value = "") => String(value || "").trim();
const lower = (value = "") => text(value).toLowerCase();
const uid = (prefix = "lee") => `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 10) || Math.random().toString(36).slice(2, 12)}`;

export const leeSystemPrompt = `You are Le-E, pronounced Lee, the LegalEase operating intelligence agent. You help Roger run LegalEase as COO. You are the command layer for LegalEase's growth, partner programs, reports, tasks, autonomy, and proof systems.

Rules:
- Be direct.
- Be concise by default.
- Prioritize what matters.
- Always distinguish facts from recommendations.
- Use Command Center data when available.
- Say when information is missing.
- Never pretend an action was completed if only drafted.
- Never expose secrets.
- Never make legal promises.
- Never promise eligibility.
- Never promise court outcomes.
- Never send, publish, activate, or delete without required approval.
- Prefer action-oriented responses.
- For Roger, default to 3 priorities or fewer unless asked for detail.`;

const readTools = [
  "read_today_state",
  "search_command_center",
  "get_partner_programs",
  "get_tasks",
  "get_growth_inbox",
  "get_reports",
  "get_autonomy_status",
  "get_partner_status",
  "get_campaign_status",
  "get_weekly_proof",
  "get_system_health"
];

const autoSafeTools = [
  "answer_question",
  "summarize_records",
  "create_task",
  "create_growth_inbox_item",
  "triage_growth_inbox_item",
  "create_partner_program_draft",
  "generate_proposal_draft",
  "generate_partner_page_draft",
  "generate_weekly_report_draft",
  "generate_final_report_draft",
  "generate_evidence_pack_draft",
  "create_data_room_note",
  "create_content_idea",
  "create_campaign_kit_draft"
];

const approvalRequiredTools = [
  "update_task",
  "update_partner_next_action",
  "send_email",
  "publish_social_post",
  "publish_partner_page",
  "activate_partner_dashboard",
  "mark_payment_verified",
  "approve_social_post",
  "send_report",
  "mark_proposal_sent"
];

const humanReviewTools = [
  "change_pricing",
  "refund_payment",
  "change_package_tier",
  "modify_compliance_language",
  "approve_government_partner_messaging",
  "change_live_gate"
];

const forbiddenTools = [
  "expose_secret",
  "disable_auth",
  "weaken_rls",
  "delete_audit_logs",
  "promise_eligibility",
  "promise_court_outcome",
  "provide_legal_advice",
  "delete_record"
];

export function leeTools() {
  return [
    ...readTools.map((name) => ({ name, category:"read", autonomyLevel:"auto_safe", executionMode:"read_only", allowed:true })),
    ...autoSafeTools.map((name) => ({ name, category:"write", autonomyLevel:"auto_safe", executionMode:"apply_safe_or_draft", allowed:true })),
    ...approvalRequiredTools.map((name) => ({ name, category:"dangerous", autonomyLevel:"approval_required", executionMode:"proposal_only", allowed:true })),
    ...humanReviewTools.map((name) => ({ name, category:"hard_review", autonomyLevel:"human_review_required", executionMode:"proposal_only", allowed:true })),
    ...forbiddenTools.map((name) => ({ name, category:"forbidden", autonomyLevel:"forbidden", executionMode:"blocked", allowed:false }))
  ];
}

export function leeToolPolicy(actionType = "") {
  return leeTools().find((tool) => tool.name === actionType) || {
    name: actionType || "unknown",
    category:"unknown",
    autonomyLevel:"approval_required",
    executionMode:"proposal_only",
    allowed:true
  };
}

export function createLeeThread(input = {}, options = {}) {
  const now = options.now || nowIso();
  return {
    id: input.id || uid("lee-thread"),
    title: input.title || "Le-E operating thread",
    status: input.status || "active",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    summary: input.summary || ""
  };
}

function sourceRecord({ sourceType, sourceId, title, summary, content, tags = [], businessArea = "operations", riskLevel = "low", lastUpdated = "", citationLabel = "", metadata = {} }) {
  const cleanTitle = title || sourceId || sourceType;
  return {
    id: `${sourceType}:${sourceId || cleanTitle}`,
    sourceType,
    sourceId: sourceId || cleanTitle,
    title: cleanTitle,
    summary: summary || "",
    content: content || [cleanTitle, summary].filter(Boolean).join("\n"),
    tags,
    businessArea,
    riskLevel,
    lastUpdated,
    citationLabel: citationLabel || `${sourceType}:${cleanTitle}`,
    metadata
  };
}

export function buildLeeKnowledgeIndex(state = {}, options = {}) {
  const now = options.now || nowIso();
  const sources = [];
  const add = (record) => sources.push(record);

  for (const item of list(state.growthInbox)) add(sourceRecord({
    sourceType:"growth_inbox",
    sourceId:item.id,
    title:item.summary || item.rawText || "Growth Inbox item",
    summary:item.suggestedAction || "",
    content:[item.rawText, item.summary, item.suggestedAction, item.relatedPartner, item.relatedCampaign].join("\n"),
    tags:[item.sourceType, item.priority, item.status].filter(Boolean),
    businessArea:"growth",
    riskLevel:item.riskLevel || "low",
    lastUpdated:item.updatedAt || item.createdAt || now,
    citationLabel:`Growth Inbox / ${item.summary || item.id}`
  }));
  for (const item of list(state.tasks)) add(sourceRecord({
    sourceType:"task",
    sourceId:item.id,
    title:item.title || "Task",
    summary:item.nextAction || item.description || "",
    content:[item.title, item.description, item.nextAction, item.escalationReason, item.owner, item.status, item.priority].join("\n"),
    tags:[item.status, item.priority, item.sourceType].filter(Boolean),
    businessArea:"operations",
    riskLevel:item.riskLevel || "low",
    lastUpdated:item.updatedAt || item.createdAt || now,
    citationLabel:`Task / ${item.title || item.id}`
  }));
  for (const item of list(state.partnerPrograms)) add(sourceRecord({
    sourceType:"partner_program",
    sourceId:item.id,
    title:item.name || "Partner Program",
    summary:item.nextAction || item.programGoal || "",
    content:[item.name, item.status, item.packageTier, item.paymentStatus, item.programGoal, item.targetAudience, item.jurisdiction, item.nextAction].join("\n"),
    tags:[item.status, item.packageTier, item.paymentStatus].filter(Boolean),
    businessArea:"partners",
    riskLevel:item.riskLevel || "medium",
    lastUpdated:item.updatedAt || item.createdAt || now,
    citationLabel:`Partner Program / ${item.name || item.id}`,
    metadata:{ revenueBooked:item.metrics?.revenueBooked || 0 }
  }));
  for (const item of list(state.partners)) add(sourceRecord({
    sourceType:"partner",
    sourceId:item.id,
    title:item.name || item.organizationName || "Partner",
    summary:item.nextAction || item.useCase || "",
    content:[item.name, item.organizationName, item.stage, item.type, item.useCase, item.nextAction, item.lastTouchDate].join("\n"),
    tags:[item.stage, item.type, item.priority].filter(Boolean),
    businessArea:"partners",
    riskLevel:item.riskLevel || "low",
    lastUpdated:item.updatedAt || item.lastTouchDate || now,
    citationLabel:`Partner / ${item.name || item.organizationName || item.id}`
  }));
  for (const item of list(state.campaigns)) add(sourceRecord({
    sourceType:"campaign",
    sourceId:item.id,
    title:item.campaignName || item.name || "Campaign",
    summary:item.nextAction || item.status || "",
    content:[item.campaignName, item.name, item.status, item.type, item.nextAction, item.blocker].join("\n"),
    tags:[item.status, item.type].filter(Boolean),
    businessArea:"growth",
    riskLevel:item.riskLevel || "low",
    lastUpdated:item.updatedAt || item.createdAt || now,
    citationLabel:`Campaign / ${item.campaignName || item.name || item.id}`
  }));
  for (const item of list(state.contentBank)) add(sourceRecord({
    sourceType:"content_bank",
    sourceId:item.id,
    title:item.title || "Content idea",
    summary:item.rawIdea || item.nextBestAction || "",
    content:[item.title, item.rawIdea, item.bucket, item.campaign, item.cta, item.creativeDirection].join("\n"),
    tags:[item.status, item.bucket, item.priority].filter(Boolean),
    businessArea:"production",
    riskLevel:item.complianceRisk || "low",
    lastUpdated:item.updatedAt || item.createdAt || now,
    citationLabel:`Content Bank / ${item.title || item.id}`
  }));
  for (const item of list(state.approvalQueue)) add(sourceRecord({
    sourceType:"approval_queue",
    sourceId:item.id,
    title:item.title || "Approval item",
    summary:item.whyItMatters || item.recommendedAction || "",
    content:[item.title, item.summary, item.whyItMatters, item.recommendedAction, item.status, item.risk].join("\n"),
    tags:[item.type, item.status, item.risk].filter(Boolean),
    businessArea:"production",
    riskLevel:item.risk || "low",
    lastUpdated:item.updatedAt || item.createdAt || now,
    citationLabel:`Approval Queue / ${item.title || item.id}`
  }));
  for (const item of list(state.reports)) add(sourceRecord({
    sourceType:"report",
    sourceId:item.id,
    title:item.reportTitle || item.title || "Report",
    summary:item.summary || item.reportType || "",
    content:[item.reportTitle, item.title, item.summary, item.reportType, item.markdown].join("\n"),
    tags:[item.reportType, item.status].filter(Boolean),
    businessArea:"proof",
    riskLevel:"low",
    lastUpdated:item.generatedAt || item.updatedAt || now,
    citationLabel:`Report / ${item.reportTitle || item.title || item.id}`
  }));
  for (const item of list(state.dataRoomItems || state.dataRoom)) add(sourceRecord({
    sourceType:"data_room",
    sourceId:item.id,
    title:item.title || item.artifactName || "Data Room item",
    summary:item.summary || item.nextAction || "",
    content:[item.title, item.artifactName, item.category, item.status, item.summary, item.nextAction].join("\n"),
    tags:[item.category, item.status].filter(Boolean),
    businessArea:"proof",
    riskLevel:item.riskLevel || "low",
    lastUpdated:item.updatedAt || item.createdAt || now,
    citationLabel:`Data Room / ${item.title || item.artifactName || item.id}`
  }));
  for (const item of list(state.soc2Evidence)) add(sourceRecord({
    sourceType:"soc2_readiness",
    sourceId:item.id,
    title:item.evidenceTitle || "SOC 2 Readiness evidence",
    summary:item.reviewNotes || item.notes || "",
    content:[item.evidenceTitle, item.controlArea, item.evidenceStatus, item.evidenceQuality, item.notes].join("\n"),
    tags:[item.controlArea, item.evidenceStatus, item.evidenceQuality].filter(Boolean),
    businessArea:"compliance",
    riskLevel:"medium",
    lastUpdated:item.updatedAt || item.collectionDate || now,
    citationLabel:`SOC 2 Readiness / ${item.evidenceTitle || item.id}`
  }));
  for (const item of list(state.events || state.activityEvents)) add(sourceRecord({
    sourceType:"event",
    sourceId:item.id,
    title:item.title || item.eventType || "Event",
    summary:item.summary || item.nextAction || "",
    content:[item.eventType, item.title, item.summary, item.nextAction, item.objectType, item.partnerId, item.campaignId].join("\n"),
    tags:[item.eventType, item.riskLevel].filter(Boolean),
    businessArea:"memory",
    riskLevel:item.riskLevel || "low",
    lastUpdated:item.timestamp || item.createdAt || now,
    citationLabel:`Event / ${item.title || item.eventType || item.id}`
  }));

  const chunks = sources.map((source) => ({
    id: `lee-chunk-${source.id}`,
    sourceId: source.sourceId,
    sourceType: source.sourceType,
    title: source.title,
    content: [source.title, source.summary, source.content, source.tags.join(" ")].filter(Boolean).join("\n"),
    citationLabel: source.citationLabel,
    businessArea: source.businessArea,
    riskLevel: source.riskLevel,
    lastUpdated: source.lastUpdated
  }));
  return { sources, chunks, rebuiltAt: now };
}

function tokenize(value = "") {
  return lower(value).split(/[^a-z0-9$]+/).filter((part) => part.length > 2);
}

export function searchLeeKnowledge(indexOrState = {}, query = "", options = {}) {
  const index = Array.isArray(indexOrState.chunks) ? indexOrState : buildLeeKnowledgeIndex(indexOrState);
  const terms = tokenize(query);
  const results = index.chunks.map((chunk) => {
    const content = lower([chunk.title, chunk.content, chunk.sourceType, chunk.businessArea].join(" "));
    const score = terms.reduce((sum, term) => sum + (content.includes(term) ? 1 : 0), 0);
    return { ...chunk, score };
  }).filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || String(b.lastUpdated || "").localeCompare(String(a.lastUpdated || "")))
    .slice(0, options.limit || 8);
  return { query, results, rebuiltAt:index.rebuiltAt };
}

function openTasks(state = {}) {
  return list(state.tasks).filter((task) => !["done", "dismissed", "archived"].includes(lower(task.status)));
}

function operatingSummary(state = {}) {
  const tasks = openTasks(state);
  const inbox = list(state.growthInbox).filter((item) => !["converted", "ignored"].includes(lower(item.status)));
  const approvals = list(state.approvalQueue).filter((item) => !["approved", "archived", "ignored"].includes(lower(item.status)));
  const blockers = list(state.blockers);
  const stalledPartners = [
    ...list(state.partners).filter((item) => lower(item.stage) === "stalled" || /stalled|follow/i.test([item.nextAction, item.status].join(" "))),
    ...list(state.partnerPrograms).filter((item) => lower(item.status) === "stalled")
  ];
  const proofEvents = list(state.events || state.activityEvents).filter((event) => /proof|report|evidence|pilot|partner|conversion/i.test([event.eventType, event.title].join(" ")));
  return { tasks, inbox, approvals, blockers, stalledPartners, proofEvents };
}

function sourceRefsFromSearch(search = {}) {
  return list(search.results).slice(0, 5).map((item) => ({
    sourceType:item.sourceType,
    sourceId:item.sourceId,
    title:item.title,
    citationLabel:item.citationLabel
  }));
}

function actionProposal(input = {}, options = {}) {
  const now = options.now || nowIso();
  const policy = leeToolPolicy(input.actionType || "create_task");
  return {
    id: input.id || uid("lee-action"),
    threadId: input.threadId || "",
    actionType: input.actionType || "create_task",
    objectType: input.objectType || "task",
    objectId: input.objectId || "",
    title: input.title || "Proposed action",
    summary: input.summary || "",
    proposedChanges: input.proposedChanges || {},
    autonomyLevel: input.autonomyLevel || policy.autonomyLevel,
    riskLevel: input.riskLevel || "low",
    requiredApproval: input.requiredApproval ?? policy.executionMode === "proposal_only",
    status: policy.allowed === false ? "blocked" : "proposed",
    createdAt: input.createdAt || now,
    appliedAt: "",
    auditHistory: [{
      at: now,
      action: policy.allowed === false ? "blocked" : "proposed",
      actor: "Le-E",
      note: input.summary || input.title || "Le-E proposed action."
    }]
  };
}

function proposalsForPrompt(state = {}, prompt = "", threadId = "", options = {}) {
  const now = options.now || nowIso();
  const query = lower(prompt);
  const proposals = [];
  if (/task|growth inbox|inbox/.test(query)) {
    for (const item of list(state.growthInbox).filter((entry) => !["converted", "ignored"].includes(lower(entry.status))).slice(0, 5)) {
      proposals.push(actionProposal({
        threadId,
        actionType:"create_task",
        objectType:"growth_inbox",
        objectId:item.id,
        title:`Create task from Growth Inbox: ${item.summary || item.rawText || item.id}`,
        summary:item.suggestedAction || "Turn this signal into owned work.",
        proposedChanges:{
          title:item.summary || item.rawText || "Follow up on Growth Inbox item",
          description:item.rawText || item.summary || "",
          owner:item.owner || "Roger",
          status:"open",
          priority:item.priority === "high" ? "high" : "medium",
          dueDate:new Date(Date.parse(now) + 2 * 86400000).toISOString().slice(0, 10),
          sourceType:"lee",
          sourceId:item.id,
          riskLevel:item.riskLevel || "low",
          nextAction:item.suggestedAction || "Review and route this signal."
        },
        riskLevel:item.riskLevel || "low"
      }, { now }));
    }
  }
  if (/fulton|partner program|create.*partner/.test(query)) {
    proposals.push(actionProposal({
      threadId,
      actionType:"create_partner_program_draft",
      objectType:"partner_program",
      title:"Draft Fulton County RCAP partner program",
      summary:"Create an internal draft only. No proposal is sent and no dashboard is activated.",
      proposedChanges:{
        name:"Fulton County RCAP",
        slug:"fulton-county-rcap",
        partnerType:"county",
        status:"proposal_draft",
        packageTier:"implementation",
        paymentStatus:"unpaid",
        programGoal:"30-day backlog triage and resident services record-clearing access pilot.",
        jurisdiction:"Georgia",
        nextAction:"Review proposal scope and decision date.",
        owner:"Roger"
      },
      riskLevel:"medium"
    }, { now }));
  }
  if (/weekly report|we must vote/.test(query)) {
    const program = list(state.partnerPrograms).find((item) => /we must vote/i.test(item.name || "")) || list(state.partnerPrograms)[0];
    if (program) {
      proposals.push(actionProposal({
        threadId,
        actionType:"generate_weekly_report_draft",
        objectType:"partner_program",
        objectId:program.id,
        title:`Generate weekly report draft for ${program.name}`,
        summary:"Draft report for internal review. It will not be sent automatically.",
        proposedChanges:{ partnerProgramId:program.id, reportType:"weekly_partner_report", status:"draft" },
        riskLevel:"low"
      }, { now }));
    }
  }
  if (/publish|send email|activate|payment|pricing|delete|eligibility|court outcome|legal advice/.test(query)) {
    const actionType = /eligibility/.test(query) ? "promise_eligibility"
      : /court outcome/.test(query) ? "promise_court_outcome"
        : /legal advice/.test(query) ? "provide_legal_advice"
          : /delete/.test(query) ? "delete_record"
            : /pricing/.test(query) ? "change_pricing"
              : /payment/.test(query) ? "mark_payment_verified"
                : /activate/.test(query) ? "activate_partner_dashboard"
                  : /email/.test(query) ? "send_email"
                    : "publish_social_post";
    proposals.push(actionProposal({
      threadId,
      actionType,
      objectType:"safety_policy",
      title:`Safety review: ${actionType.replaceAll("_", " ")}`,
      summary:"Le-E will not perform this directly. It is blocked or proposal-only under autonomy policy.",
      proposedChanges:{ requestedPrompt: prompt },
      riskLevel:leeToolPolicy(actionType).autonomyLevel === "forbidden" ? "critical" : "high"
    }, { now }));
  }
  return proposals;
}

function answerForPrompt(state = {}, prompt = "", search = {}, proposals = []) {
  const summary = operatingSummary(state);
  const q = lower(prompt);
  const priorities = [
    ...summary.blockers.map((item) => ({ title:item.title || item.whatIsBlocked || "Blocked work", why:item.whyBlocked || item.reason || "Blocked", action:item.fix || item.recommendedAction || "Fix blocker" })),
    ...summary.inbox.filter((item) => item.priority === "high" || item.riskLevel === "high").map((item) => ({ title:item.summary || item.rawText || "Growth Inbox signal", why:"High-priority company signal", action:item.suggestedAction || "Triage" })),
    ...summary.tasks.filter((task) => /roger/i.test(task.owner || "") || task.priority === "high").map((task) => ({ title:task.title, why:task.escalationReason || "Owned task", action:task.nextAction || "Complete or snooze" }))
  ].slice(0, 3);

  if (/proof|this week|evidence/.test(q)) {
    const proof = summary.proofEvents.slice(0, 5);
    return [
      "What matters",
      proof.length ? proof.map((event, index) => `${index + 1}. ${event.title || event.eventType}`).join("\n") : "No proof events are recorded yet this week.",
      "",
      "Why it matters",
      "Weekly proof becomes investor updates, partner confidence, and Data Room evidence.",
      "",
      "Recommended action",
      "Build the Weekly Evidence Pack and move the strongest proof into the Data Room."
    ].join("\n");
  }

  if (/partner.*stalled|stalled.*partner/.test(q)) {
    const stalled = summary.stalledPartners.slice(0, 5);
    return [
      "What matters",
      stalled.length ? stalled.map((partner, index) => `${index + 1}. ${partner.name || partner.organizationName || partner.id}: ${partner.nextAction || "Needs next action"}`).join("\n") : "No stalled partners are currently flagged.",
      "",
      "Why it matters",
      "Stalled partners either need a cleaner next step or a decision to close the loop.",
      "",
      "Recommended action",
      stalled[0]?.nextAction || "Review partner follow-ups in Focus Mode."
    ].join("\n");
  }

  if (/task|growth inbox|inbox/.test(q)) {
    return [
      "What matters",
      proposals.length
        ? `Le-E found ${proposals.length} Growth Inbox item${proposals.length === 1 ? "" : "s"} that can become owned work.`
        : "Growth Inbox is clear for task creation right now.",
      "",
      "Why it matters",
      "Raw company signals should turn into owned tasks instead of staying in Roger's head.",
      "",
      "Recommended action",
      proposals.length ? "Review the proposed task cards below and apply the safe ones." : "Capture the next partner update, meeting note, support issue, or concern in Quick Capture."
    ].join("\n");
  }

  if (/publish|send email|activate|payment|pricing|delete|eligibility|court outcome|legal advice/.test(q) && proposals.length) {
    const blocked = proposals.some((proposal) => proposal.status === "blocked" || proposal.autonomyLevel === "forbidden");
    return [
      "What matters",
      blocked ? "That request includes a forbidden or legal-sensitive action." : "That request is approval-required and cannot happen silently.",
      "",
      "Why it matters",
      "Le-E protects live posting, outbound messages, partner activation, payment status, legal claims, and security controls.",
      "",
      "Recommended action",
      blocked ? "Do not proceed. Use compliant, non-promissory wording or route it to human review." : "Review the proposal below. It stays internal until the required approval workflow clears it."
    ].join("\n");
  }

  const lines = priorities.length
    ? priorities.map((item, index) => `${index + 1}. ${item.title} — ${item.action}`)
    : ["1. Capture any new operating signal.", "2. Review Focus Mode.", "3. Build weekly proof if nothing is blocked."];

  return [
    "What matters",
    lines.join("\n"),
    "",
    "Why it matters",
    `There are ${summary.inbox.length} open inbox item(s), ${summary.tasks.length} open task(s), ${summary.approvals.length} approval item(s), and ${summary.blockers.length} blocker(s).`,
    "",
    "Recommended action",
    proposals.length ? `Review ${proposals.length} proposed action${proposals.length === 1 ? "" : "s"} below before applying anything.` : "Start Focus Mode and handle the first Now item.",
    "",
    search.results?.length ? `Sources: ${search.results.slice(0, 3).map((item) => item.citationLabel).join("; ")}` : "Sources: Command Center operating state."
  ].filter(Boolean).join("\n");
}

function leeEvent(eventType, input = {}, options = {}) {
  const now = options.now || nowIso();
  return {
    id: uid("event-lee"),
    eventType,
    title: input.title || eventType.replaceAll("_", " "),
    actor: input.actor || "Le-E",
    source: "lee",
    objectType: input.objectType || "lee",
    objectId: input.objectId || "",
    riskLevel: input.riskLevel || "low",
    proofValue: input.proofValue || "low",
    revenueImpact: input.revenueImpact || "none",
    nextAction: input.nextAction || "",
    metadata: input.metadata || {},
    createdAt: now,
    timestamp: now
  };
}

function appendEvents(state = {}, events = []) {
  return {
    ...state,
    events: [...events, ...list(state.events)].slice(0, 1000),
    activityEvents: [
      ...events.map((event) => ({
        id: event.id.replace(/^event-/, "activity-"),
        eventType: event.eventType,
        title: event.title,
        relatedObjectType: event.objectType,
        relatedObjectId: event.objectId,
        createdAt: event.createdAt
      })),
      ...list(state.activityEvents)
    ].slice(0, 500)
  };
}

function parseVisibleReplaceCommand(prompt = "") {
  const normalized = text(prompt).replace(/[“”]/g, "\"").replace(/[‘’]/g, "'");
  const match = normalized.match(/\b(?:change|replace)\s+["']?(.+?)["']?\s+(?:to|with|into)\s+["']?(.+?)["']?\s*\.?$/i)
    || normalized.match(/\bmake\s+(?:this|it|today|the current focus)\s+about\s+["']?(.+?)["']?\s+instead\s+of\s+["']?(.+?)["']?\s*\.?$/i);
  if (!match) return null;
  const makeInstead = /\bmake\s+/i.test(match[0]) && /\binstead of\b/i.test(match[0]);
  const from = text(makeInstead ? match[2] : match[1]).replace(/^["']|["']$/g, "").replace(/[.?!]+$/g, "");
  const to = text(makeInstead ? match[1] : match[2]).replace(/^["']|["']$/g, "").replace(/[.?!]+$/g, "");
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  return { from, to };
}

function replaceAllVisibleText(value = "", from = "", to = "") {
  const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return String(value || "").replace(pattern, to);
}

function visibleReplaceRecords(state = {}, from = "") {
  const has = value => new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(String(value || ""));
  const records = [];
  const add = (collection, id, fields = [], item = {}) => {
    const matchingFields = fields.filter(field => has(item[field]));
    if (matchingFields.length) records.push({ collection, id, item, fields:matchingFields });
  };
  for (const task of openTasks(state).slice(0, 8)) add("tasks", task.id, ["title", "description", "nextAction", "escalationReason", "blocker_reason"], task);
  for (const item of list(state.growthInbox).filter(entry => !["converted", "ignored"].includes(lower(entry.status))).slice(0, 8)) add("growthInbox", item.id, ["summary", "rawText", "suggestedAction"], item);
  for (const program of list(state.partnerPrograms).slice(0, 8)) add("partnerPrograms", program.id, ["name", "programGoal", "nextAction"], program);
  for (const brief of list(state.morningBriefs).slice(0, 5)) add("morningBriefs", brief.id || brief.key, ["mission_today", "suggested_first_move"], brief);
  return records;
}

function applyVisibleReplaceCommand(state = {}, input = {}, threadId = "", options = {}) {
  const now = options.now || nowIso();
  const command = parseVisibleReplaceCommand(input.message || "");
  if (!command) return null;
  const { from, to } = command;
  const records = visibleReplaceRecords(state, from);
  const audit = (action, note, resourceId = "") => ({
    id: uid("audit-lee"),
    action,
    actor: "Le-E",
    resourceType: "lee_visible_action",
    resourceId,
    note,
    timestamp: now,
    createdAt: now
  });

  if (!records.length) {
    const capture = {
      id: uid("capture-lee"),
      date: now.slice(0, 10),
      raw_input: input.message || `Replace ${from} with ${to}`,
      source_label: "Le-E visible action",
      capture_type: "auto_classify",
      inferred_type: "task",
      summary: `Could not find ${from}; review requested change to ${to}.`,
      priority: "medium",
      linked_partner: "",
      linked_workflow: "today",
      suggested_routes: ["tasks", "operatingMemory"],
      review_state: "review_required",
      routed_to: [],
      created_at: now,
      updated_at: now
    };
    return {
      state:{
        ...state,
        captureInbox:[capture, ...list(state.captureInbox)].slice(0, 500),
        auditHistory:[audit("lee capture fallback", `No visible match for ${from}; saved capture for review.`, capture.id), ...list(state.auditHistory)].slice(0, 1000)
      },
      message:`I couldn’t find ${from} in the current focus. I saved this as a capture for review.`,
      proposals:[],
      events:[leeEvent("Le-E capture fallback", { title:`Le-E saved unmatched change for review`, objectType:"capture_inbox", objectId:capture.id, metadata:{ from, to } }, { now })]
    };
  }

  if (records.length > 1) {
    const proposal = actionProposal({
      threadId,
      actionType:"update_task",
      objectType:"visible_focus",
      objectId:records.map(record => record.id).join(","),
      title:`Review replacement: ${from} to ${to}`,
      summary:`I found ${records.length} internal records containing ${from}. Review before applying broadly.`,
      proposedChanges:{
        from,
        to,
        targets:records.map(record => ({ collection:record.collection, id:record.id, fields:record.fields }))
      },
      riskLevel:"low"
    }, { now });
    return {
      state,
      message:`I found ${records.length} places with ${from}. I created proposed changes so Roger can apply the right one.`,
      proposals:[proposal],
      events:[leeEvent("lee_visible_update_proposed", { title:proposal.title, objectType:"lee_action", objectId:proposal.id, metadata:{ from, to, targets:records.length } }, { now })]
    };
  }

  const target = records[0];
  const updatedItem = { ...target.item, updatedAt:now };
  for (const field of target.fields) updatedItem[field] = replaceAllVisibleText(updatedItem[field], from, to);
  const nextCollection = list(state[target.collection]).map(item => (item.id || item.key) === target.id ? updatedItem : item);
  return {
    state:{
      ...state,
      [target.collection]:nextCollection,
      auditHistory:[audit("lee visible update", `Updated current focus from ${from} to ${to}.`, target.id), ...list(state.auditHistory)].slice(0, 1000)
    },
    message:`Updated the current focus from ${from} to ${to}.`,
    proposals:[],
    events:[leeEvent("Le-E visible update", { title:`Updated current focus from ${from} to ${to}`, objectType:target.collection, objectId:target.id, metadata:{ from, to, fields:target.fields } }, { now })]
  };
}

export function leeChat(state = {}, input = {}, options = {}) {
  const now = options.now || nowIso();
  const threadId = input.threadId || list(state.leeThreads)[0]?.id || uid("lee-thread");
  const existingThread = list(state.leeThreads).find((thread) => thread.id === threadId);
  const thread = existingThread || createLeeThread({ id:threadId, title:text(input.message).slice(0, 72) || "Le-E thread" }, { now });
  const userMessage = {
    id: uid("lee-msg"),
    threadId,
    role:"user",
    content:text(input.message),
    createdAt:now,
    sourceRefs:[],
    proposedActions:[],
    status:"sent"
  };
  const visibleAction = applyVisibleReplaceCommand(state, input, threadId, { now });
  if (visibleAction) {
    const assistant = {
      id: uid("lee-msg"),
      threadId,
      role:"assistant",
      content:visibleAction.message,
      createdAt:now,
      sourceRefs:[],
      proposedActions:visibleAction.proposals.map((proposal) => proposal.id),
      status:"complete"
    };
    const run = {
      id: uid("lee-run"),
      threadId,
      status:"complete",
      mode:"local_visible_action",
      inputSummary:text(input.message).slice(0, 180),
      sourcesUsed:0,
      proposedActions:visibleAction.proposals.length,
      createdAt:now,
      completedAt:now
    };
    const nextState = appendEvents({
      ...visibleAction.state,
      leeThreads:[{ ...thread, updatedAt:now }, ...list(visibleAction.state.leeThreads).filter((item) => item.id !== threadId)].slice(0, 100),
      leeMessages:[userMessage, assistant, ...list(visibleAction.state.leeMessages)].slice(0, 1000),
      leeActionProposals:[...visibleAction.proposals, ...list(visibleAction.state.leeActionProposals)].slice(0, 500),
      leeRuns:[run, ...list(visibleAction.state.leeRuns)].slice(0, 300),
      leeMemory:{
        ...(visibleAction.state.leeMemory || {}),
        lastThreadId:threadId,
        lastPrompt:text(input.message).slice(0, 240),
        updatedAt:now
      }
    }, [
      leeEvent("lee_question_asked", { title:"Le-E question asked", objectType:"lee_thread", objectId:threadId, metadata:{ visibleAction:true } }, { now }),
      ...visibleAction.events
    ]);
    return { state:nextState, thread:{ ...thread, updatedAt:now }, messages:[userMessage, assistant], assistant, proposals:visibleAction.proposals, sources:[], run, search:{ query:input.message || "", results:[] } };
  }
  const index = buildLeeKnowledgeIndex(state, { now });
  const search = searchLeeKnowledge(index, input.message || "", { limit:6 });
  const proposals = proposalsForPrompt(state, input.message || "", threadId, { now });
  const assistantContent = answerForPrompt(state, input.message || "", search, proposals);
  const assistant = {
    id: uid("lee-msg"),
    threadId,
    role:"assistant",
    content:assistantContent,
    createdAt:now,
    sourceRefs:sourceRefsFromSearch(search),
    proposedActions:proposals.map((proposal) => proposal.id),
    status:"complete"
  };
  const run = {
    id: uid("lee-run"),
    threadId,
    status:"complete",
    mode: options.openAIConfigured ? "operating_intelligence" : "local_operating_intelligence",
    inputSummary:text(input.message).slice(0, 180),
    sourcesUsed:assistant.sourceRefs.length,
    proposedActions:proposals.length,
    createdAt:now,
    completedAt:now
  };
  const events = [
    leeEvent("lee_question_asked", { title:"Le-E question asked", objectType:"lee_thread", objectId:threadId }, { now }),
    leeEvent("lee_knowledge_search_performed", { title:"Le-E knowledge search performed", objectType:"lee_thread", objectId:threadId, metadata:{ query:input.message, results:search.results.length } }, { now }),
    leeEvent("lee_answer_generated", { title:"Le-E answer generated", objectType:"lee_thread", objectId:threadId, metadata:{ proposedActions:proposals.length } }, { now }),
    ...proposals.map((proposal) => leeEvent(proposal.status === "blocked" ? "lee_action_blocked" : "lee_action_proposed", { title:proposal.title, objectType:proposal.objectType, objectId:proposal.objectId, riskLevel:proposal.riskLevel, metadata:{ actionType:proposal.actionType, autonomyLevel:proposal.autonomyLevel } }, { now }))
  ];
  const nextState = appendEvents({
    ...state,
    leeThreads:[{ ...thread, updatedAt:now }, ...list(state.leeThreads).filter((item) => item.id !== threadId)].slice(0, 100),
    leeMessages:[userMessage, assistant, ...list(state.leeMessages)].slice(0, 1000),
    leeActionProposals:[...proposals, ...list(state.leeActionProposals)].slice(0, 500),
    leeKnowledgeSources:index.sources,
    leeKnowledgeChunks:index.chunks,
    leeRuns:[run, ...list(state.leeRuns)].slice(0, 300),
    leeMemory:{
      ...(state.leeMemory || {}),
      lastThreadId:threadId,
      lastPrompt:text(input.message).slice(0, 240),
      updatedAt:now
    }
  }, events);
  return { state:nextState, thread:{ ...thread, updatedAt:now }, messages:[userMessage, assistant], assistant, proposals, sources:assistant.sourceRefs, run, search };
}

export function applyLeeActionProposal(originalState = {}, proposalId = "", stateWithProposals = originalState, options = {}) {
  const now = options.now || nowIso();
  const proposal = list(stateWithProposals.leeActionProposals).find((item) => item.id === proposalId);
  if (!proposal) throw new Error("Le-E action proposal not found.");
  const policy = leeToolPolicy(proposal.actionType);
  if (!policy.allowed) throw new Error("Le-E action is forbidden by safety policy.");
  if (policy.executionMode === "proposal_only") throw new Error("This Le-E action is proposal-only and requires human workflow approval.");
  if (proposal.status === "applied") return { state:stateWithProposals, proposal };

  let nextState = { ...stateWithProposals };
  if (proposal.actionType === "create_task") {
    const task = {
      id: uid("task-lee"),
      title:proposal.proposedChanges?.title || proposal.title,
      description:proposal.proposedChanges?.description || proposal.summary || "",
      owner:proposal.proposedChanges?.owner || "Roger",
      status:proposal.proposedChanges?.status || "open",
      priority:proposal.proposedChanges?.priority || "medium",
      dueDate:proposal.proposedChanges?.dueDate || "",
      sourceType:"lee",
      sourceId:proposal.objectId || proposal.id,
      riskLevel:proposal.proposedChanges?.riskLevel || proposal.riskLevel || "low",
      nextAction:proposal.proposedChanges?.nextAction || proposal.summary || "Review task.",
      history:[{ at:now, action:"created_by_lee", actor:"Le-E", proposalId:proposal.id }],
      createdAt:now,
      updatedAt:now
    };
    nextState = { ...nextState, tasks:[task, ...list(nextState.tasks)] };
  } else if (proposal.actionType === "create_growth_inbox_item") {
    const item = {
      id:uid("inbox-lee"),
      rawText:proposal.proposedChanges?.rawText || proposal.summary || proposal.title,
      sourceType:proposal.proposedChanges?.sourceType || "meeting_notes",
      priority:proposal.proposedChanges?.priority || "medium",
      riskLevel:proposal.riskLevel || "low",
      suggestedAction:proposal.proposedChanges?.suggestedAction || "Review and route.",
      status:"new",
      createdAt:now,
      history:[{ at:now, action:"created_by_lee", actor:"Le-E", proposalId:proposal.id }]
    };
    nextState = { ...nextState, growthInbox:[item, ...list(nextState.growthInbox)] };
  } else if (proposal.actionType === "create_content_idea") {
    const idea = {
      id:uid("idea-lee"),
      title:proposal.proposedChanges?.title || proposal.title,
      rawIdea:proposal.proposedChanges?.rawIdea || proposal.summary,
      bucket:proposal.proposedChanges?.bucket || "LegalEase Growth",
      platforms:proposal.proposedChanges?.platforms || ["linkedin"],
      status:"idea",
      priority:proposal.riskLevel === "high" ? "high" : "medium",
      createdAt:now,
      updatedAt:now,
      nextBestAction:"Review and generate draft."
    };
    nextState = { ...nextState, contentBank:[idea, ...list(nextState.contentBank)] };
  } else {
    throw new Error("This Le-E safe action is not implemented yet.");
  }

  const updatedProposal = {
    ...proposal,
    status:"applied",
    appliedAt:now,
    auditHistory:[...(proposal.auditHistory || []), { at:now, action:"applied", actor:"Roger", note:"Applied through Le-E." }]
  };
  nextState = appendEvents({
    ...nextState,
    leeActionProposals:list(nextState.leeActionProposals).map((item) => item.id === proposal.id ? updatedProposal : item)
  }, [leeEvent("lee_action_applied", { title:proposal.title, objectType:proposal.objectType, objectId:proposal.objectId, riskLevel:proposal.riskLevel, metadata:{ actionType:proposal.actionType } }, { now })]);
  return { state:nextState, proposal:updatedProposal, message:"Le-E safe action applied." };
}

export function updateLeeActionProposal(state = {}, proposalId = "", action = "approved", options = {}) {
  const now = options.now || nowIso();
  const proposal = list(state.leeActionProposals).find((item) => item.id === proposalId);
  if (!proposal) throw new Error("Le-E action proposal not found.");
  const status = action === "reject" ? "rejected" : action === "approve" ? "approved" : action;
  const updated = {
    ...proposal,
    status,
    auditHistory:[...(proposal.auditHistory || []), { at:now, action:status, actor:options.actor || "Roger", note:options.reason || "" }]
  };
  const eventType = status === "rejected" ? "lee_action_rejected" : status === "approved" ? "lee_action_approved" : "lee_action_updated";
  return {
    state: appendEvents({
      ...state,
      leeActionProposals:list(state.leeActionProposals).map((item) => item.id === proposalId ? updated : item)
    }, [leeEvent(eventType, { title:updated.title, objectType:updated.objectType, objectId:updated.objectId, riskLevel:updated.riskLevel, metadata:{ actionType:updated.actionType } }, { now })]),
    proposal:updated,
    message:`Le-E action ${status}.`
  };
}

export function buildLeeStatus(state = {}, options = {}) {
  const indexCount = list(state.leeKnowledgeChunks).length || buildLeeKnowledgeIndex(state, { now:options.now }).chunks.length;
  const liveGates = Object.values(state.runtime?.livePostingGates || {}).filter((gate) => gate?.enabled).length;
  return {
    openAIConfigured:Boolean(options.openAIConfigured ?? state.runtime?.openAIConfigured),
    knowledgeIndexRecords:indexCount,
    lastIndexRebuild:state.leeMemory?.lastIndexRebuildAt || state.leeKnowledgeRebuiltAt || "",
    availableToolsCount:leeTools().length,
    pendingProposedActions:list(state.leeActionProposals).filter((item) => item.status === "proposed").length,
    blockedActions:list(state.leeActionProposals).filter((item) => item.status === "blocked").length,
    safeModeActive:true,
    liveGatesCount:liveGates
  };
}

export function rebuildLeeIndexState(state = {}, options = {}) {
  const now = options.now || nowIso();
  const index = buildLeeKnowledgeIndex(state, { now });
  return {
    ...state,
    leeKnowledgeSources:index.sources,
    leeKnowledgeChunks:index.chunks,
    leeMemory:{ ...(state.leeMemory || {}), lastIndexRebuildAt:now, updatedAt:now }
  };
}
