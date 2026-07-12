// Company Memory projector — the adapter that fills the shared memory FROM the existing
// domain ledgers, plus the Today at LegalEase summary builder.
//
// This is how "every engine writes into the same shared memory" happens WITHOUT rewriting
// engines: the projector runs as a plan()-only heartbeat engine (no act(), structurally unable
// to send/publish/deploy) and converts what the domain engines already recorded into canonical
// Queue Items, Events, Agent Runs, and the Contact/Organization identity index. Engines that
// want to emit directly call the company-memory.mjs helpers; everything else is projected.
//
// Field names below are exact per the source builders (see each adapter's comment). Two naming
// conventions coexist in the domain collections — snake_case (reactivation/rcap/expungement/
// outreach) and camelCase (lee/autonomy/growthInbox/events) — so adapters normalize per source
// rather than guessing globally.
//
// Rules inherited from company-memory.mjs: projection not migration; stable ids; plain English
// in user-facing fields; pure state-in/state-out; identity + pointers, never case detail.

import {
  createQueueItem,
  upsertQueueItems,
  wakeSnoozedQueueItems,
  createCompanyEvent,
  appendCompanyEvents,
  createAgentRun,
  appendAgentRuns,
  upsertCompanyContact,
  upsertCompanyOrganization
} from "./company-memory.mjs";
import { campaignRates, evaluateThresholds, reactivationCampaignOf } from "./reactivation-os.mjs";
import { autonomyLevelFor } from "./autonomy-levels.mjs";
import { plainSafetyReasons } from "./campaign-command.mjs";
import { deliverabilityUtilization, DELIVERABILITY_WARNING_THRESHOLD } from "./campaign-brain.mjs";
import { sendgridWebhookHealthSummary } from "./sendgrid-webhook.mjs";

export const COMPANY_MEMORY_ENGINE_ID = "company-memory";

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------------------------------------
// Queue item projection — one adapter per existing surface
// ---------------------------------------------------------------------------------------------

// approvalQueue has TWO shapes: B2 outreach messages (outreach-os planOutreach:
// {id,type:"outreach_message",status:"queued_for_approval",to,subject,title,contact_id}) and
// review items computed by priority-engine ({id,type,title,summary,whyItMatters,
// recommendedAction,status,risk}). Both mean "a human decision is waiting".
function queueFromApprovalQueue(state) {
  const openStatuses = /^(queued_for_approval|needs_review|ready_to_approve|new|pending)$/i;
  return list(state.approvalQueue)
    .filter((item) => openStatuses.test(String(item.status || "")))
    .map((item) => {
      const isOutreach = lower(item.type) === "outreach_message";
      return createQueueItem({
        type: "approval",
        sourceEngine: isOutreach ? "outreach-sequencer" : "review-desk",
        sourceRef: { collection: "approvalQueue", itemId: clean(item.id) },
        title: clean(item.title) || (isOutreach ? "An outreach email is waiting for your approval" : "Something needs your review"),
        summary: isOutreach
          ? `Subject: "${clean(item.subject) || "(no subject)"}". Nothing sends until you approve it.`
          : clean(item.whyItMatters || item.summary),
        recommendation: clean(item.recommendedAction) || (isOutreach ? "Read the message and approve or reject it." : "Review and decide."),
        requiresApproval: true,
        riskLevel: /high|dangerous/i.test(String(item.risk || item.riskLevel)) ? "dangerous" : "caution",
        priority: 20,
        relatedContact: clean(item.contact_id),
        sourceLink: { kind: "page", target: "#queue" },
        metadata: { sourceType: clean(item.type), sourceStatus: clean(item.status) }
      });
    });
}

// autonomy-engine actions ({id,title,whyItMatters,recommendedAction,riskLevel,status:"pending",
// approvalPolicy}) — the ones a human must decide become queue items.
function queueFromAutonomyActions(state) {
  return list(state.autonomyActions)
    .filter((a) => a.status === "pending" && /approval_required|hard_human_review/.test(String(a.approvalPolicy || "")))
    .slice(0, 25)
    .map((a) => createQueueItem({
      type: "approval",
      sourceEngine: "operations-assistant",
      sourceRef: { collection: "autonomyActions", itemId: clean(a.id) },
      title: clean(a.title) || "A suggested change needs your decision",
      summary: clean(a.whyItMatters || a.description),
      recommendation: clean(a.recommendedAction) || "Review the suggestion and decide.",
      requiresApproval: true,
      riskLevel: /high/i.test(String(a.riskLevel)) ? "dangerous" : "caution",
      priority: 30,
      sourceLink: { kind: "page", target: "#autonomy" },
      metadata: { sourceStatus: clean(a.status) }
    }));
}

// Le-E proposals ({id,title,summary,riskLevel,status:"proposed"}).
function queueFromLeeProposals(state) {
  return list(state.leeActionProposals)
    .filter((p) => p.status === "proposed")
    .slice(0, 25)
    .map((p) => createQueueItem({
      type: "approval",
      sourceEngine: "le-e",
      sourceRef: { collection: "leeActionProposals", itemId: clean(p.id) },
      title: clean(p.title) || "Le-E suggested something for your review",
      summary: clean(p.summary),
      recommendation: "Review Le-E's suggestion and apply or dismiss it.",
      requiresApproval: true,
      riskLevel: /high/i.test(String(p.riskLevel)) ? "dangerous" : "caution",
      priority: 35,
      sourceLink: { kind: "page", target: "#lee" }
    }));
}

function queueFromSupportIssues(state) {
  return list(state.supportIssues)
    .filter((issue) => !/resolved|closed|done|archived|dismissed/i.test(String(issue.status || "")))
    .map((issue) => {
      // Phase 18D: UPL-sensitive messages are highest risk (Roger reads them personally,
      // no machine draft); urgent ones jump the line; drafted ones point at the draft.
      const upl = Boolean(issue.upl_sensitive);
      const urgent = issue.urgency === "urgent";
      const drafted = issue.status === "drafted" && clean(issue.draft_reply);
      return createQueueItem({
        type: "support",
        sourceEngine: "support-inbox",
        sourceRef: { collection: "supportIssues", itemId: clean(issue.id) },
        title: clean(issue.title || issue.summary) || "A support request needs review",
        summary: clean(issue.summary || issue.description) || "Someone asked for help.",
        recommendation: upl
          ? "Read it yourself before anyone replies. It may ask for legal advice."
          : drafted
            ? "A draft reply is ready on the Support page. Review it, then copy it into your reply."
            : "Read the request and prepare a draft reply on the Support page.",
        riskLevel: upl ? "dangerous" : urgent ? "caution" : "safe",
        priority: upl ? 8 : urgent ? 12 : 25,
        sourceLink: { kind: "page", target: "#support" },
        metadata: { sourceStatus: clean(issue.status), urgency: clean(issue.urgency), uplSensitive: upl }
      });
    });
}

// tasks-engine records: {id,title,description,status(open|in_progress|waiting|blocked|done|
// archived),priority(critical|high|medium|low),nextAction,blocker_reason}.
function queueFromTasks(state) {
  return list(state.tasks)
    .filter((task) => task.status === "blocked" || (/^(open|waiting)$/.test(String(task.status)) && /critical|high/.test(String(task.priority))))
    .slice(0, 20)
    .map((task) => createQueueItem({
      type: "onboarding",
      sourceEngine: "task-desk",
      sourceRef: { collection: "tasks", itemId: clean(task.id) },
      title: clean(task.title) || "A task needs attention",
      summary: clean(task.blocker_reason || task.description) || "This task is blocked or high priority.",
      recommendation: clean(task.nextAction) || "Unblock or reprioritize this task.",
      priority: task.status === "blocked" ? 30 : 45,
      dueAt: clean(task.dueDate || task.due_at),
      sourceLink: { kind: "page", target: "#tasks" },
      metadata: { sourceStatus: clean(task.status), sourcePriority: clean(task.priority) }
    }));
}

// rcap-revenue-os tasks: {task_id,task_type,title,status(New|Ready|Parked|Completed|Skipped|
// Blocked),reason,linked_account_id}.
function queueFromRcapRevenueTasks(state) {
  return list(state.rcapRevenueQueueTasks)
    .filter((t) => /^(New|Ready|Blocked)$/i.test(String(t.status || "")))
    .slice(0, 20)
    .map((t) => createQueueItem({
      type: "revenue",
      sourceEngine: "rcap-revenue",
      sourceRef: { collection: "rcapRevenueQueueTasks", itemId: clean(t.task_id) },
      title: clean(t.title) || "An RCAP revenue task is ready",
      summary: clean(t.reason) || `${clean(t.task_type) || "A revenue task"} is waiting.`,
      recommendation: "Open the RCAP revenue desk and work the task.",
      priority: 40,
      relatedOrganization: clean(t.linked_account_id),
      sourceLink: { kind: "page", target: "#revenue" },
      metadata: { sourceStatus: clean(t.status), taskType: clean(t.task_type) }
    }));
}

function queueFromCampaignSafety(state) {
  const items = [];
  const campaign = reactivationCampaignOf(state);
  // evaluateThresholds takes STATE (it derives rates itself) — passing rates makes sent read
  // as 0, belowSample always true, and this monitor report "safe" forever.
  const thresholds = evaluateThresholds(state, campaign);
  if (thresholds.tripped) {
    items.push(createQueueItem({
      type: "campaign",
      sourceEngine: "reactivation-sequencer",
      sourceRef: { collection: "reactivationCampaign", itemId: "thresholds" },
      title: "Reactivation campaign paused itself — safety limit reached",
      summary: `The campaign stopped because a safety limit tripped: ${plainSafetyReasons(thresholds.reasons) || "see campaign safety"}. Nothing more sends until you decide.`,
      recommendation: "Review the bounce and complaint numbers before resuming anything.",
      requiresApproval: true,
      riskLevel: "dangerous",
      priority: 5,
      sourceLink: { kind: "page", target: "#campaigns" }
    }));
  }
  // Phase 18E: warn BEFORE the trip. Same utilization math as the cockpit meter and the
  // campaign-brain deliverability view, so the numbers can never disagree.
  if (!thresholds.tripped && !thresholds.belowSample) {
    const worst = deliverabilityUtilization(thresholds.rates, campaign.thresholds);
    if (worst.utilization >= DELIVERABILITY_WARNING_THRESHOLD) {
      items.push(createQueueItem({
        type: "campaign",
        sourceEngine: "reactivation-sequencer",
        sourceRef: { collection: "reactivationCampaign", itemId: "deliverability_warning" },
        title: "Reactivation campaign is drifting toward its safety limit",
        summary: `The worst deliverability metric is ${Math.round(worst.utilization * 100)}% of the way to the auto-pause limit. Nothing has tripped yet.`,
        recommendation: "Open the campaign page and read the deliverability warnings before releasing more people.",
        riskLevel: "caution",
        priority: 12,
        sourceLink: { kind: "page", target: "#campaigns" }
      }));
    }
  }
  // reactivationCampaignOf exposes camelCase pausedReason — the snake_case field never exists.
  if (lower(campaign.status) === "paused" && clean(campaign.pausedReason)) {
    items.push(createQueueItem({
      type: "campaign",
      sourceEngine: "reactivation-sequencer",
      sourceRef: { collection: "reactivationCampaign", itemId: "paused" },
      title: "Reactivation campaign is paused",
      summary: `Paused: ${clean(campaign.pausedReason)}.`,
      recommendation: "Decide whether to keep it paused or resume.",
      requiresApproval: true,
      riskLevel: "caution",
      priority: 10,
      sourceLink: { kind: "page", target: "#campaigns" }
    }));
  }
  return items;
}

function queueFromWebhookHealth(state, env) {
  const summary = sendgridWebhookHealthSummary(state.sendgridWebhookHealth, {
    env,
    sent: campaignRates(state).sent
  });
  if (!summary || !clean(summary.warning)) return [];
  return [createQueueItem({
    type: "webhook",
    sourceEngine: "email-telemetry",
    sourceRef: { collection: "sendgridWebhookHealth", itemId: "singleton" },
    title: "Email delivery reporting needs attention",
    summary: clean(summary.warning),
    recommendation: "Check the email provider connection so delivery results keep flowing.",
    riskLevel: "caution",
    priority: 15,
    sourceLink: { kind: "page", target: "#app-status" }
  })];
}

function queueFromProspects(state) {
  const pending = list(state.prospectCandidates).filter((c) => lower(c.review_state) === "pending_review");
  if (!pending.length) return [];
  return [createQueueItem({
    type: "prospect_followup",
    sourceEngine: "prospect-scout",
    sourceRef: { collection: "prospectCandidates", itemId: "pending_review" },
    title: `${pending.length} possible partner${pending.length === 1 ? "" : "s"} waiting for your review`,
    summary: "New organizations were found that look like a fit. None can be contacted until you approve them.",
    recommendation: "Open Prospects and approve or reject the new candidates.",
    requiresApproval: true,
    riskLevel: "safe",
    priority: 40,
    sourceLink: { kind: "page", target: "#prospects" },
    metadata: { pendingCount: pending.length }
  })];
}

// I2 inbox intelligence — the morning-queue sentences the owner decision was for. Each open
// signal becomes one item (stable id via sourceRef, so re-scans refresh instead of
// duplicating). A RESOLVED signal (thread moved: they replied, or Roger did) projects as
// completed — honest reconciliation of reality, distinct from auto-completing Roger's tasks
// (his open decisions stay untouched; upsertQueueItems keeps decided statuses sticky).
// Open lands on the signal artifact (#item deep link via sourceRef); the Gmail thread link
// lives on the artifact page. Signals are owner-only; queue items carry only the plain
// sentence + redacted counterpart, never evidence.
const INBOX_QUEUE_TYPE_BY_KIND = {
  needs_reply: "inbox_reply",
  went_quiet: "inbox_reply",
  commitment: "inbox_commitment",
  pipeline_inbound: "inbox_pipeline"
};
function queueFromInboxSignals(state) {
  return list(state.inboxSignals)
    .filter((s) => s && INBOX_QUEUE_TYPE_BY_KIND[s.kind] && ["suggested", "resolved"].includes(String(s.status)))
    .slice(0, 40)
    .map((signal) => {
      const resolved = String(signal.status) === "resolved";
      const who = clean(signal.counterpartName) || clean(signal.counterpartEmail) || "someone";
      return createQueueItem({
        type: INBOX_QUEUE_TYPE_BY_KIND[signal.kind],
        sourceEngine: "inbox-intelligence",
        sourceRef: { collection: "inboxSignals", itemId: clean(signal.id) },
        title: clean(signal.summary) || "Inbox item needs a look",
        summary: signal.kind === "commitment"
          ? "You put this in writing; the date came from your own words."
          : signal.kind === "went_quiet"
            ? "A pipeline thread stalled after your last reply. A short nudge usually restarts it."
            : signal.kind === "pipeline_inbound"
              ? "A pipeline contact wrote in. The evidence line is on the item page."
              : "This thread is waiting on you.",
        recommendation: signal.kind === "commitment"
          ? "Deliver it, or reply to reset the date honestly."
          : signal.kind === "went_quiet"
            ? "Send a short nudge."
            : "Open the thread and reply, or dismiss if it truly needs nothing.",
        status: resolved ? "completed" : "needs_roger",
        requiresApproval: false,
        riskLevel: signal.uplSensitive ? "caution" : "safe",
        priority: signal.kind === "commitment" ? 20 : signal.kind === "needs_reply" ? 25 : signal.kind === "went_quiet" ? 30 : 35,
        dueAt: clean(signal.dueAt),
        sourceLink: { kind: "page", target: "#decisions" },
        metadata: {
          kind: clean(signal.kind),
          counterpart: who,
          ageDays: Number(signal.ageDays) || 0,
          uplSensitive: Boolean(signal.uplSensitive)
        }
      });
    });
}

// Google read-only insights ({id,insightType,title,suggestedNextAction,status:"suggested"}) —
// meeting prep and reply gaps surface as meeting queue items.
function queueFromGoogleInsights(state) {
  return list(state.googleInsights)
    .filter((i) => i.status === "suggested" && /meeting prep/i.test(String(i.insightType || "")))
    .slice(0, 10)
    .map((i) => createQueueItem({
      type: "meeting",
      sourceEngine: "calendar-reader",
      sourceRef: { collection: "googleInsights", itemId: clean(i.id) },
      title: clean(i.title) || "A meeting is coming up",
      summary: clean(i.inferredReason) || "A meeting on your calendar could use preparation.",
      recommendation: clean(i.suggestedNextAction) || "Review the prep notes before the meeting.",
      priority: 35,
      relatedContact: "",
      dueAt: clean(i.meetingDate || i.dueAt),
      sourceLink: { kind: "page", target: "#meetings" },
      metadata: { insightType: clean(i.insightType) }
    }));
}

// ---------------------------------------------------------------------------------------------
// Events projection
// ---------------------------------------------------------------------------------------------

// activityEvents: {id,eventType,title,relatedObjectType,relatedObjectId,createdAt,riskLevel}.
function eventsFromActivity(state) {
  return list(state.activityEvents).slice(0, 100).map((ev) => {
    try {
      return createCompanyEvent({
        source: "activity",
        type: clean(ev.eventType) || "activity",
        summary: clean(ev.title || ev.summary) || "Something happened.",
        occurred_at: clean(ev.createdAt),
        risk: /high|needs/i.test(String(ev.riskLevel)) ? "watch" : "info",
        sourceRef: { collection: "activityEvents", itemId: clean(ev.id) }
      });
    } catch { return null; }
  }).filter(Boolean);
}

// events (lee/growth ledger): {id,eventType,title,riskLevel,createdAt}.
function eventsFromGenericLedger(state) {
  return list(state.events).slice(0, 100).map((ev) => {
    try {
      return createCompanyEvent({
        source: clean(ev.source) || "operations",
        type: clean(ev.eventType) || "event",
        summary: clean(ev.title) || "Something happened.",
        occurred_at: clean(ev.createdAt || ev.timestamp),
        risk: /high|needs/i.test(String(ev.riskLevel)) ? "watch" : "info",
        sourceRef: { collection: "events", itemId: clean(ev.id) }
      });
    } catch { return null; }
  }).filter(Boolean);
}

// reactivationEvents: {id,contact_id,email,type,reason,created_at}. Summary stays PII-free —
// pointer + contact_id only, never the email address.
function eventsFromReactivation(state) {
  return list(state.reactivationEvents).slice(0, 100).map((ev) => {
    try {
      const type = clean(ev.type) || "email_event";
      return createCompanyEvent({
        source: "reactivation",
        type,
        summary: `Email ${type.replace(/_/g, " ")} recorded for a campaign recipient.`,
        occurred_at: clean(ev.created_at),
        risk: /bounce|complaint|spam|unsubscribe|dropped|blocked/i.test(type) ? "watch" : "info",
        contact_id: clean(ev.contact_id),
        sourceRef: { collection: "reactivationEvents", itemId: clean(ev.id) }
      });
    } catch { return null; }
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// Agent runs projection — every existing run ledger, one normalized view
// ---------------------------------------------------------------------------------------------

function agentRunsFromLedgers(state) {
  const runs = [];
  // heartbeatRuns: {id/bucketKey,engineId,runId,status,acted,autopilot,ranAt}.
  for (const entry of list(state.heartbeatRuns).slice(0, 100)) {
    try {
      runs.push(createAgentRun({
        id: `ar-hb-${clean(entry.bucketKey || entry.id)}`,
        agent: clean(entry.engineId) || "scheduler",
        trigger: "scheduled",
        output_summary: entry.acted ? "Checked and acted within its approvals." : "Checked; nothing needed action.",
        status: clean(entry.status) || "success",
        started_at: clean(entry.ranAt),
        ended_at: clean(entry.ranAt)
      }));
    } catch { /* skip malformed */ }
  }
  // autonomyRuns: {id,startedAt,finishedAt,status:"complete",generatedCount,executedCount,notes}.
  for (const entry of list(state.autonomyRuns).slice(0, 50)) {
    try {
      runs.push(createAgentRun({
        id: `ar-auto-${clean(entry.id)}`,
        agent: "autonomy-cycle",
        trigger: "scheduled",
        output_summary: `${Number(entry.generatedCount || 0)} suggestions prepared; ${Number(entry.executedCount || 0)} safe internal updates performed.`,
        actions_proposed: Number(entry.generatedCount) || 0,
        writes_performed: Number(entry.executedCount) || 0,
        status: clean(entry.status) || "success",
        started_at: clean(entry.startedAt),
        ended_at: clean(entry.finishedAt || entry.startedAt)
      }));
    } catch { /* skip malformed */ }
  }
  // leeRuns: {id,threadId,status:"complete",mode,inputSummary,proposedActions,createdAt,completedAt}.
  for (const entry of list(state.leeRuns).slice(0, 50)) {
    try {
      runs.push(createAgentRun({
        id: `ar-lee-${clean(entry.id)}`,
        agent: "le-e",
        trigger: "conversation",
        input_summary: clean(entry.inputSummary),
        output_summary: `${Number(list(entry.proposedActions).length || entry.proposedActions || 0)} suggestion(s) prepared for review.`,
        status: clean(entry.status) || "success",
        started_at: clean(entry.createdAt),
        ended_at: clean(entry.completedAt || entry.createdAt)
      }));
    } catch { /* skip malformed */ }
  }
  // prospectDiscoveryRuns: {id,dateKey,ran_at,sources,fetched,staged,status}.
  for (const entry of list(state.prospectDiscoveryRuns).slice(0, 30)) {
    try {
      runs.push(createAgentRun({
        id: `ar-prospect-${clean(entry.id || entry.dateKey)}`,
        agent: "prospect-scout",
        trigger: "scheduled",
        output_summary: `Looked at ${Number(entry.fetched || 0)} organizations; staged ${Number(entry.staged || 0)} for your review.`,
        status: clean(entry.status) || "success",
        started_at: clean(entry.ran_at),
        ended_at: clean(entry.ran_at)
      }));
    } catch { /* skip malformed */ }
  }
  return runs;
}

// ---------------------------------------------------------------------------------------------
// Contact / Organization identity index
// ---------------------------------------------------------------------------------------------

function suppressedEmailSet(state) {
  const suppressed = new Set();
  for (const row of [...list(state.outreachSuppressions), ...list(state.outreachUnsubscribes)]) {
    const email = lower(row.email || row.address);
    if (email) suppressed.add(email);
  }
  return suppressed;
}

function projectContacts(state, { now }) {
  let contacts = list(state.companyContacts);
  const suppressed = suppressedEmailSet(state);

  // reactivationContacts: snake_case; {contact_id,email,first_name,full_name,do_not_contact,
  // unsubscribed,priority,wave}.
  for (const row of list(state.reactivationContacts)) {
    const email = lower(row.email);
    if (!email) continue;
    ({ contacts } = upsertCompanyContact(contacts, {
      email,
      name: clean(row.full_name || row.first_name),
      types: ["consumer"],
      links: [{ collection: "reactivationContacts", itemId: clean(row.contact_id) }],
      do_not_contact: suppressed.has(email) || Boolean(row.do_not_contact || row.unsubscribed),
      last_event_at: clean(row.updated_at)
    }, { now }));
  }

  // expungementLifecycleContacts: {lifecycle_contact_id,email,first_name,lifecycle_stage,
  // payment_status,do_not_contact,unsubscribed,deleted_or_erasure_requested}. Operational
  // fields only — no case detail crosses into the index.
  for (const row of list(state.expungementLifecycleContacts)) {
    const email = lower(row.email);
    if (!email || row.deleted_or_erasure_requested) continue;
    const types = /paid/i.test(String(row.payment_status)) ? ["paid_customer"]
      : /screening/i.test(String(row.lifecycle_stage)) && clean(row.dropoff_step) ? ["abandoned_screening"]
      : /checkout/i.test(String(row.lifecycle_stage)) ? ["checkout_abandon"]
      : ["consumer"];
    ({ contacts } = upsertCompanyContact(contacts, {
      email,
      name: clean(row.first_name),
      types,
      links: [{ collection: "expungementLifecycleContacts", itemId: clean(row.lifecycle_contact_id) }],
      do_not_contact: suppressed.has(email) || Boolean(row.do_not_contact || row.unsubscribed),
      last_event_at: clean(row.last_seen_at || row.updated_at)
    }, { now }));
  }

  // outreachContacts: {contact_id,email,contact_name,organization_name,linked_account_id}.
  for (const row of list(state.outreachContacts)) {
    const email = lower(row.email);
    if (!email) continue;
    ({ contacts } = upsertCompanyContact(contacts, {
      email,
      name: clean(row.contact_name),
      types: ["partner_contact", "prospect"],
      organizations: [clean(row.linked_account_id)].filter(Boolean),
      links: [{ collection: "outreachContacts", itemId: clean(row.contact_id) }],
      do_not_contact: suppressed.has(email)
    }, { now }));
  }

  // rcapRevenueContacts use public_email + suppression_status, not email/do_not_contact.
  for (const row of list(state.rcapRevenueContacts)) {
    const email = lower(row.public_email);
    if (!email) continue;
    ({ contacts } = upsertCompanyContact(contacts, {
      email,
      name: clean(row.contact_name),
      types: ["partner_contact"],
      organizations: [clean(row.linked_account_id)].filter(Boolean),
      links: [{ collection: "rcapRevenueContacts", itemId: clean(row.contact_id) }],
      do_not_contact: suppressed.has(email) || /bounced|unsubscribed|suppressed/i.test(String(row.suppression_status)),
      last_event_at: clean(row.last_touch)
    }, { now }));
  }

  return contacts;
}

function projectOrganizations(state, { now }) {
  let organizations = list(state.companyOrganizations);
  const classify = (text) => /legal.aid/i.test(text) ? ["legal_aid"]
    : /reentry/i.test(text) ? ["reentry"]
    : /workforce/i.test(text) ? ["workforce"]
    : /nonprofit/i.test(text) ? ["nonprofit"]
    : [];

  // partners: loosely-shaped records; name/id are the stable bits.
  for (const row of list(state.partners)) {
    const name = clean(row.name || row.partnerName || row.organization || row.title);
    if (!name) continue;
    ({ organizations } = upsertCompanyOrganization(organizations, {
      name,
      types: ["rcap_partner"],
      links: [{ collection: "partners", itemId: clean(row.id) }],
      stage: clean(row.status || row.stage)
    }, { now }));
  }

  // outreachOrganizations: {account_id,organization_name,domain,website,classification}.
  for (const row of list(state.outreachOrganizations)) {
    const name = clean(row.organization_name);
    if (!name) continue;
    ({ organizations } = upsertCompanyOrganization(organizations, {
      name,
      domain: lower(row.domain || row.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      types: ["rcap_prospect", ...classify(String(row.classification))],
      links: [{ collection: "outreachOrganizations", itemId: clean(row.account_id) }]
    }, { now }));
  }

  // rcapRevenueAccounts: {account_id,organization_name,org_type,segment,account_status}.
  for (const row of list(state.rcapRevenueAccounts)) {
    const name = clean(row.organization_name);
    if (!name) continue;
    ({ organizations } = upsertCompanyOrganization(organizations, {
      name,
      types: ["rcap_prospect", ...classify(String(row.org_type))],
      links: [{ collection: "rcapRevenueAccounts", itemId: clean(row.account_id) }],
      stage: clean(row.account_status)
    }, { now }));
  }

  // prospectCandidates: {id,organization_name,domain,website,classification,review_state}.
  for (const row of list(state.prospectCandidates)) {
    const name = clean(row.organization_name);
    if (!name) continue;
    ({ organizations } = upsertCompanyOrganization(organizations, {
      name,
      domain: lower(row.domain || row.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      types: ["rcap_prospect", ...classify(String(row.classification))],
      links: [{ collection: "prospectCandidates", itemId: clean(row.id) }],
      stage: clean(row.review_state)
    }, { now }));
  }

  return organizations;
}

// ---------------------------------------------------------------------------------------------
// The projection pass (pure) + the heartbeat engine wrapper
// ---------------------------------------------------------------------------------------------

export function projectCompanyMemory(state = {}, { now = () => new Date().toISOString(), env = process.env } = {}) {
  const opts = { now };
  const incomingQueue = [
    ...queueFromApprovalQueue(state),
    ...queueFromAutonomyActions(state),
    ...queueFromLeeProposals(state),
    ...queueFromSupportIssues(state),
    ...queueFromTasks(state),
    ...queueFromRcapRevenueTasks(state),
    ...queueFromCampaignSafety(state),
    ...queueFromWebhookHealth(state, env),
    ...queueFromProspects(state),
    ...queueFromGoogleInsights(state),
    ...queueFromInboxSignals(state)
  ];
  const queueItems = wakeSnoozedQueueItems(
    upsertQueueItems(state.queueItems, incomingQueue, opts),
    opts
  );
  const companyEvents = appendCompanyEvents(state.companyEvents, [
    ...eventsFromActivity(state),
    ...eventsFromGenericLedger(state),
    ...eventsFromReactivation(state)
  ], opts);
  const agentRuns = appendAgentRuns(state.agentRuns, agentRunsFromLedgers(state), opts);
  const companyContacts = projectContacts(state, opts);
  const companyOrganizations = projectOrganizations(state, opts);

  return {
    state: { ...state, queueItems, companyEvents, agentRuns, companyContacts, companyOrganizations },
    observations: [{
      type: "company_memory_projection",
      queueOpen: queueItems.filter((i) => !["dismissed", "completed"].includes(i.status)).length,
      needsRoger: queueItems.filter((i) => i.status === "needs_roger").length,
      contacts: companyContacts.length,
      organizations: companyOrganizations.length,
      events: companyEvents.length,
      agentRuns: agentRuns.length
    }]
  };
}

// plan()-only heartbeat engine: refreshes the shared memory every tick. NO act() — the memory
// layer records and organizes; it never sends, publishes, releases, or deploys.
export function buildCompanyMemoryEngine() {
  return {
    id: COMPANY_MEMORY_ENGINE_ID,
    cadence: "hourly",
    plan(state, ctx = {}) {
      return projectCompanyMemory(state, { env: ctx.env || process.env });
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Today at LegalEase summary (server-side aggregate the page consumes in one call)
// ---------------------------------------------------------------------------------------------

// Aggregate the conversion funnel across ALL funnelSnapshots rows. Product events
// auto-apply one row per event (each carrying a single metric increment), so reading
// only snapshots[0] showed whichever metric happened to arrive last and zero for the
// rest. Each metric accepts the product-event key (the only key the ingest writes)
// plus the legacy aggregate-row spellings; a row is counted once per metric via the
// first key it carries, so a mixed-spelling row can never double-count.
function aggregateFunnelMetrics(state) {
  const rows = list(state.funnelSnapshots).filter((row) => row && typeof row === "object");
  const sumFirst = (keys) => rows.reduce((total, row) => {
    for (const key of keys) {
      if (row[key] !== undefined) return total + (Number(row[key]) || 0);
    }
    return total;
  }, 0);
  return {
    connected: rows.some((row) => clean(row.id || row.capturedAt || row.created_at || row.createdAt)),
    screeningsStarted: sumFirst(["expungementIntakeStarted", "screenings_started", "screeningsStarted"]),
    checkouts: sumFirst(["paymentStarted", "checkouts", "checkout_started"]),
    webVisits: sumFirst(["landingPageVisits", "landing_page_visits"])
  };
}

export function buildTodaySummary(state = {}, { env = process.env, now = () => new Date().toISOString(), project = projectCompanyMemory } = {}) {
  // Computed on demand from a projection — reading the page never writes anything. The
  // caller may pass a memoizing `project` (preview-server does): the projection is pure
  // over the domain ledgers, so per-request recomputation over an unchanged graph was
  // pure latency (2026-07-12 fix).
  const projected = project(state, { now, env }).state;
  const queue = list(projected.queueItems);
  const open = queue.filter((i) => !["dismissed", "completed"].includes(i.status));
  const needsRoger = open
    .filter((i) => i.status === "needs_roger")
    .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  const watchlist = open.filter((i) =>
    ["webhook", "write_health", "system_health", "campaign", "funnel_alert", "source_monitor"].includes(i.type)
    && i.status !== "snoozed");

  const campaign = reactivationCampaignOf(state);
  const funnel = aggregateFunnelMetrics(state);
  const suppressed = suppressedEmailSet(state).size;
  const held = list(state.reactivationContacts).filter((c) => Boolean(c.campaign_hold)).length;
  const stripe = state.stripeRevenue && typeof state.stripeRevenue === "object" ? state.stripeRevenue : null;
  const signups = state.signups && typeof state.signups === "object" ? state.signups : null;

  const drafts = queue.filter((i) => i.status === "drafted");
  const recentRuns = list(projected.agentRuns).slice(0, 20);
  const monitors = [...new Set(recentRuns.map((r) => r.agent))].slice(0, 10);
  // Phase 18C: each running helper's declared autonomy ceiling (plain English) and its
  // latest prepared-work records, so the cockpit can show what agents did and may do.
  const agentDirectory = monitors.map((id) => autonomyLevelFor(id));
  const recentAgentRuns = recentRuns.slice(0, 8).map((r) => ({
    agent: r.agent,
    status: clean(r.status) || "success",
    started_at: clean(r.started_at),
    purpose: clean(r.purpose),
    output: clean(r.output_summary),
    risk: clean(r.risk) || "safe",
    approvalRequired: Boolean(r.approval_required),
    queueItemId: clean(r.queue_item_id),
    finalAction: clean(r.final_action)
  }));

  return {
    generatedAt: now(),
    goodMorning: {
      // Honest-zero convention: only claim what a real source recorded.
      screeningsStarted: funnel.screeningsStarted,
      checkouts: funnel.checkouts,
      webVisits: funnel.webVisits,
      paid: signups && signups.available ? Number(signups.paid) || 0 : 0,
      registered: signups && signups.available ? Number(signups.registered) || 0 : 0,
      funnelConnected: funnel.connected,
      signupsConnected: Boolean(signups && signups.available),
      supportOpen: list(state.supportIssues).filter((i) => !/resolved|closed|done|archived/i.test(String(i.status || ""))).length,
      partnerFollowups: open.filter((i) => i.type === "partner_followup" || i.type === "prospect_followup").length,
      campaignSafe: !evaluateThresholds(state, campaign).tripped,
      campaignStatus: clean(campaign.status) || "unknown"
    },
    needsRoger: needsRoger.slice(0, 12),
    counts: {
      needsRoger: needsRoger.length,
      open: open.length,
      drafts: drafts.length,
      watchlist: watchlist.length
    },
    runningAutomatically: monitors,
    agentDirectory,
    recentAgentRuns,
    watchlist: watchlist.slice(0, 8),
    money: {
      stripeConnected: Boolean(stripe && stripe.available),
      gross: stripe && stripe.available ? Number(stripe.gross) || 0 : null,
      sinceLabel: stripe ? clean(stripe.sinceLabel) : "",
      since: stripe && stripe.available ? clean(stripe.since) : "",
      currency: stripe ? clean(stripe.currency) || "usd" : "usd",
      // Display-only per-day breakdown of the same charges behind `gross` (when the
      // source provides it) so the UI can draw an honest daily chart, never a fake one.
      daily: stripe && stripe.available && stripe.dailyGross && typeof stripe.dailyGross === "object" ? stripe.dailyGross : null,
      note: stripe && stripe.available ? "" : "Money numbers appear when the payment source is connected."
    },
    peopleStuck: {
      heldContacts: held,
      suppressedContacts: suppressed,
      abandonedScreenings: list(state.expungementLifecycleContacts).filter((c) => /screening/i.test(String(c.lifecycle_stage)) && clean(c.dropoff_step)).length,
      checkoutAbandoned: list(state.expungementLifecycleContacts).filter((c) => /checkout/i.test(String(c.lifecycle_stage)) && !/paid/i.test(String(c.payment_status))).length
    },
    partners: {
      live: list(state.partners).length,
      prospectsPendingReview: list(state.prospectCandidates).filter((c) => lower(c.review_state) === "pending_review").length,
      followupsDue: open.filter((i) => i.type === "partner_followup" || i.type === "prospect_followup").length
    },
    meetings: open.filter((i) => i.type === "meeting").slice(0, 6),
    draftsReady: drafts.slice(0, 8),
    recentEvents: list(projected.companyEvents).slice(0, 10)
  };
}
