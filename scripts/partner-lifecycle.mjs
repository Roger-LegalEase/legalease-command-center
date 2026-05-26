const terminalStages = new Set(["lost"]);
const stalledStages = new Set(["stalled"]);
const proofStages = new Set(["active_pilot", "reporting", "renewal", "case_study", "expansion"]);

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

function normalizePriority(value = "") {
  const normalized = clean(value).toLowerCase();
  if (["critical", "high", "medium", "low"].includes(normalized)) return normalized;
  if (normalized === "normal") return "medium";
  return "medium";
}

function normalizeRisk(value = "") {
  const normalized = clean(value).toLowerCase();
  if (["critical", "high", "medium", "low"].includes(normalized)) return normalized;
  return "medium";
}

export function partnerLifecycleStage(partner = {}) {
  const explicit = clean(partner.stage || partner.lifecycleStage).toLowerCase();
  if (explicit) return explicit;
  const status = clean(partner.status).toLowerCase();
  const map = {
    target_identified: "lead",
    contact_found: "lead",
    outreach_sent: "qualified",
    meeting_booked: "intro_scheduled",
    proposal_sent: "proposal_sent",
    verbal_yes: "pilot_scoped",
    signed_pilot: "active_pilot",
    campaign_live: "reporting",
    paused: "stalled",
    dormant: "stalled",
    closed_lost: "lost"
  };
  return map[status] || status || "lead";
}

export function normalizePartnerLifecycle(partner = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const name = clean(partner.name || partner.organizationName || partner.partnerName || "Unnamed partner");
  const stage = partnerLifecycleStage(partner);
  const type = clean(partner.type || partner.partnerType || "nonprofit").toLowerCase().replace(/\s+/g, "_");
  const lastTouchDate = partner.lastTouchDate || partner.lastContacted || partner.updatedAt || partner.createdAt || "";
  const nextActionDueDate = partner.nextActionDueDate || partner.nextFollowUpDate || "";
  return {
    ...partner,
    name,
    organizationName: partner.organizationName || name,
    type,
    partnerType: partner.partnerType || type,
    stage,
    status: partner.status || stage,
    owner: clean(partner.owner) || "Roger",
    nextAction: clean(partner.nextAction),
    nextActionDueDate,
    nextFollowUpDate: partner.nextFollowUpDate || nextActionDueDate,
    lastTouchDate,
    priority: normalizePriority(partner.priority),
    revenuePotential: Number(partner.revenuePotential || partner.expectedValue || 0),
    proofValue: partner.proofValue || partner.proofPotential || "medium",
    riskLevel: normalizeRisk(partner.riskLevel),
    relatedCampaigns: list(partner.relatedCampaigns || (partner.relatedCampaign ? [partner.relatedCampaign] : [])),
    relatedPilots: list(partner.relatedPilots || (partner.relatedPilot ? [partner.relatedPilot] : [])),
    relatedReports: list(partner.relatedReports),
    history: list(partner.history).length ? partner.history : [{ action: "partner lifecycle initialized", at: now, note: "Lifecycle fields normalized for operating workflow." }]
  };
}

function isStrongProof(partner = {}) {
  const proof = partner.proofValue;
  if (Number.isFinite(Number(proof)) && Number(proof) >= 4) return true;
  if (/strong|high|critical|public|case|signed|live/i.test(clean(proof))) return true;
  if (proofStages.has(partner.stage)) return true;
  return list(partner.relatedReports).length > 0 || list(partner.relatedPilots).length > 0;
}

function latestReportForPartner(partner = {}, reports = []) {
  const ids = new Set([partner.id, partner.name, partner.organizationName].filter(Boolean));
  return list(reports)
    .filter((report) => ids.has(report.partnerId) || ids.has(report.relatedPartnerId) || ids.has(report.partnerName) || list(partner.relatedReports).includes(report.id))
    .sort((a, b) => String(b.generatedAt || b.createdAt || b.updatedAt || "").localeCompare(String(a.generatedAt || a.createdAt || a.updatedAt || "")))[0] || null;
}

function task(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    id: `task-${slug(input.escalationKey || input.title)}-${Math.random().toString(16).slice(2, 8)}`,
    title: clean(input.title),
    description: clean(input.description),
    owner: clean(input.owner) || "Roger",
    status: "open",
    priority: normalizePriority(input.priority),
    dueDate: input.dueDate || todayIso(now),
    sourceType: "partner",
    sourceId: input.partnerId,
    partnerId: input.partnerId,
    riskLevel: normalizeRisk(input.riskLevel),
    nextAction: clean(input.nextAction) || clean(input.title),
    escalationReason: clean(input.escalationReason),
    escalationKey: input.escalationKey,
    history: [{ action: "created", at: now, note: input.escalationReason || "Partner lifecycle automation created this task." }],
    createdAt: now,
    updatedAt: now
  };
}

export function partnerFollowUpDraft(partner = {}, options = {}) {
  const normalized = normalizePartnerLifecycle(partner, options);
  const subjectAction = normalized.stage === "proposal_sent" ? "proposal next steps" : normalized.stage === "stalled" ? "a smaller pilot path" : "next steps";
  return {
    subject: `${normalized.name} - ${subjectAction}`,
    body: [
      `Draft only - not sent automatically and requires approval before use.`,
      "",
      `Hi ${clean(normalized.primaryContactName) || "there"},`,
      "",
      `Wanted to follow up on ${normalized.name} and the next step we discussed: ${normalized.nextAction || "confirming the next committed partner action"}`,
      "",
      "LegalEase is positioning this work as implementation infrastructure: policy created the opportunity, and implementation is the next chapter.",
      "",
      "Would it be useful to set a clear decision date, pilot scope, or reporting milestone so we can keep the work moving responsibly?",
      "",
      "Roger"
    ].join("\n")
  };
}

export function partnerLifecycleTasks(state = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const partners = list(state.partners).map((partner) => normalizePartnerLifecycle(partner, { now }));
  const reports = list(state.reports);
  const tasks = [];
  for (const partner of partners) {
    const daysFromTouch = daysSince(partner.lastTouchDate || partner.updatedAt || partner.createdAt, now);
    if (partner.stage === "proposal_sent" && daysFromTouch >= 7) {
      tasks.push(task({
        title: `Follow up on proposal: ${partner.name}`,
        description: "Proposal has been out for more than 7 days without recorded movement.",
        owner: partner.owner,
        priority: partner.priority === "high" ? "high" : "medium",
        dueDate: todayIso(now),
        partnerId: partner.id,
        riskLevel: partner.riskLevel,
        nextAction: "Send an approved follow-up or ask for a decision date.",
        escalationReason: "Proposal sent with no update in 7 days.",
        escalationKey: `partner-proposal-follow-up:${partner.id}`
      }, { now }));
    }

    if (partner.stage === "active_pilot") {
      const latestReport = latestReportForPartner(partner, reports);
      const daysFromReport = daysSince(latestReport?.generatedAt || latestReport?.createdAt || partner.lastReportAt || partner.updatedAt || partner.lastTouchDate, now);
      if (daysFromReport >= 14) {
        tasks.push(task({
          title: `Create partner pilot report: ${partner.name}`,
          description: "Active pilot has not had a partner-facing report in 14 days.",
          owner: partner.owner,
          priority: "high",
          dueDate: todayIso(now),
          partnerId: partner.id,
          riskLevel: partner.riskLevel,
          nextAction: "Generate a partner report draft and route it for approval.",
          escalationReason: "Active pilot has no recent report in 14 days.",
          escalationKey: `partner-active-pilot-report:${partner.id}`
        }, { now }));
      }
    }

    if (isStrongProof(partner)) {
      tasks.push(task({
        title: `Add partner proof note: ${partner.name}`,
        description: "Partner has evidence value that should be captured for investor, acquirer, or public proof workflows.",
        owner: partner.owner,
        priority: partner.proofValue === "critical" ? "high" : "medium",
        dueDate: addDaysIso(now, 2),
        partnerId: partner.id,
        riskLevel: partner.riskLevel,
        nextAction: "Convert this partner movement into an evidence pack note.",
        escalationReason: "Partner has strong proof value.",
        escalationKey: `partner-proof-note:${partner.id}`
      }, { now }));
    }

    if (partner.stage === "reporting") {
      tasks.push(task({
        title: `Draft case study path: ${partner.name}`,
        description: "Partner has reached reporting stage and may be ready for a case study or public proof request.",
        owner: partner.owner,
        priority: "medium",
        dueDate: addDaysIso(now, 3),
        partnerId: partner.id,
        riskLevel: partner.riskLevel,
        nextAction: "Draft a case study or public proof permission request for approval.",
        escalationReason: "Partner reached reporting stage.",
        escalationKey: `partner-case-study:${partner.id}`
      }, { now }));
    }
  }
  return tasks;
}

export function partnerLifecycleInsights(state = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const partners = list(state.partners).map((partner) => normalizePartnerLifecycle(partner, { now }));
  const stalledPartners = partners.filter((partner) => stalledStages.has(partner.stage) && !terminalStages.has(partner.stage));
  const proofWorthyPartners = partners.filter(isStrongProof);
  const partnerMovement = partners
    .filter((partner) => ["proposal_sent", "pilot_scoped", "contract_pending", "active_pilot", "reporting", "renewal", "case_study", "expansion"].includes(partner.stage))
    .sort((a, b) => String(b.lastTouchDate || b.updatedAt || "").localeCompare(String(a.lastTouchDate || a.updatedAt || "")))
    .slice(0, 12);
  return {
    partners,
    stalledPartners,
    proofWorthyPartners,
    partnerMovement,
    followUpDrafts: partners
      .filter((partner) => ["proposal_sent", "stalled", "qualified", "pilot_scoped"].includes(partner.stage))
      .slice(0, 6)
      .map((partner) => ({ partnerId: partner.id, partnerName: partner.name, ...partnerFollowUpDraft(partner, { now }) }))
  };
}
