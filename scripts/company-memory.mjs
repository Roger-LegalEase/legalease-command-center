// Company Memory — the shared operating layer every engine writes into (Phase 1).
//
// Blueprint: docs/command-center-state-of-art-architecture.md §4-§6; product spec:
// legalease-command-center-brain-nerve-center-build-plan.md ("Core architecture to build around").
//
// Design rules (deliberate, do not undo casually):
//   1. PROJECTION, NOT MIGRATION. The existing domain collections (approvalQueue, tasks,
//      reactivationContacts, heartbeatRuns, ...) stay the source of truth for their workflows.
//      This layer holds one canonical copy per concept — Queue Items, Contacts, Organizations,
//      Events, Agent Runs, Approvals — built and refreshed FROM those ledgers plus direct emits.
//      Deleting every company-memory collection must never lose domain truth.
//   2. STABLE IDS. Projected records derive their id from (source collection + source id), so
//      re-projection is idempotent: the same underlying fact never becomes two queue items.
//   3. PLAIN ENGLISH ONLY in title/summary/recommendation fields — these render directly on
//      Today at LegalEase. No engine jargon (heartbeat/act()/collection/lease) in any user-facing
//      string. Machine detail belongs in `metadata`.
//   4. NO SIDE EFFECTS. Every function here is pure state-in/state-out (heartbeat plan() style).
//      Sending, publishing, releasing, deploying stay in the existing gated executors; approving
//      a Queue Item writes an Approval record — it never directly performs the action.
//   5. IDENTITY, NOT PII. Contact/Organization records hold identity + type tags + pointers
//      (links[]) into domain collections — never case detail, never raw criminal-record data
//      (same contract as the expungement lifecycle sync: operational fields only).
//
// Every collection here must ALSO be registered in coreStateCollections (scripts/storage.mjs)
// or Supabase persistence silently drops it — the "B1 trap" codebase-health checks for.

import { createHash } from "node:crypto";
import { normalizeSourceLink } from "./ui/links.mjs";

// Compatibility export: the canonical pure policy now lives with the shared UI
// link renderer, while existing company-memory consumers keep the same API.
export { normalizeSourceLink } from "./ui/links.mjs";

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------------------------

export const COMPANY_MEMORY_COLLECTIONS = [
  "queueItems",
  "companyContacts",
  "companyOrganizations",
  "companyEvents",
  "agentRuns",
  "approvals"
];

// Retention caps — memory is an operating surface, not an archive. Domain ledgers keep history.
export const QUEUE_ITEMS_CAP = 500;
export const COMPANY_EVENTS_CAP = 1000;
export const AGENT_RUNS_CAP = 500;
export const APPROVALS_CAP = 500;

// ---------------------------------------------------------------------------------------------
// Queue Items
// ---------------------------------------------------------------------------------------------

export const QUEUE_ITEM_STATUSES = [
  "new",
  "needs_roger",
  "drafted",
  "approved",
  "scheduled",
  "blocked",
  "snoozed",
  "dismissed",
  "completed"
];

export const QUEUE_ITEM_TYPES = [
  "approval",
  "partner_followup",
  "prospect_followup",
  "support",
  "deployment",
  "campaign",
  "meeting",
  "revenue",
  "onboarding",
  "report",
  "webhook",
  "write_health",
  "system_health",
  "source_monitor",
  "funnel_alert",
  // I2 inbox intelligence (owner decision 2026-07-12): reply owed / went quiet, written
  // commitments (carry dueAt for overdue escalation), and pipeline inbound.
  "inbox_reply",
  "inbox_commitment",
  "inbox_pipeline"
];

export const QUEUE_RISK_LEVELS = ["safe", "caution", "dangerous"];

// Terminal statuses drop out of "Needs Roger" and stop counting as open work.
export const QUEUE_TERMINAL_STATUSES = ["dismissed", "completed"];

const QUEUE_TRANSITIONS = {
  new: ["needs_roger", "drafted", "approved", "scheduled", "blocked", "snoozed", "dismissed", "completed"],
  needs_roger: ["approved", "drafted", "scheduled", "blocked", "snoozed", "dismissed", "completed"],
  drafted: ["needs_roger", "approved", "scheduled", "blocked", "snoozed", "dismissed", "completed"],
  approved: ["scheduled", "blocked", "completed", "dismissed"],
  scheduled: ["blocked", "completed", "dismissed", "needs_roger"],
  blocked: ["needs_roger", "snoozed", "dismissed", "completed"],
  snoozed: ["new", "needs_roger", "dismissed", "completed"],
  dismissed: [],
  completed: []
};

export function stableMemoryId(prefix = "qi", parts = []) {
  const hash = createHash("sha256").update(parts.map(clean).join("|")).digest("hex").slice(0, 16);
  return `${prefix}-${hash}`;
}

// Shared source-of-truth data statuses. Engines and UI modules describe a data source with
// exactly one of these — never a fake number standing in for a real one.
export const DATA_STATUSES = [
  "connected", "not_connected", "needs_attention", "loading", "error", "no_data", "draft", "needs_approval"
];

// Build a valid Queue Item. Throws on missing plain-English essentials — a queue item that
// cannot say what it is and why it matters must not exist.
export function createQueueItem(input = {}, { now = () => new Date().toISOString() } = {}) {
  const type = QUEUE_ITEM_TYPES.includes(input.type) ? input.type : "";
  if (!type) throw new Error(`Queue item type must be one of: ${QUEUE_ITEM_TYPES.join(", ")}`);
  const title = clean(input.title);
  if (!title) throw new Error("Queue item requires a plain-English title.");
  const status = QUEUE_ITEM_STATUSES.includes(input.status) ? input.status : "new";
  const requiresApproval = Boolean(input.requiresApproval);
  const at = now();
  return {
    id: clean(input.id) || stableMemoryId("qi", [input.sourceEngine, type, title, input.sourceRef?.collection, input.sourceRef?.itemId]),
    createdAt: clean(input.createdAt) || at,
    updatedAt: at,
    sourceEngine: clean(input.sourceEngine) || "manual",
    // Pointer back to the authoritative domain record this item projects (if any).
    sourceRef: input.sourceRef && clean(input.sourceRef.collection)
      ? { collection: clean(input.sourceRef.collection), itemId: clean(input.sourceRef.itemId) }
      : null,
    type,
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 50,
    status: requiresApproval && status === "new" ? "needs_roger" : status,
    title,
    summary: clean(input.summary),
    recommendation: clean(input.recommendation),
    requiresApproval,
    riskLevel: QUEUE_RISK_LEVELS.includes(input.riskLevel) ? input.riskLevel : (requiresApproval ? "caution" : "safe"),
    approvalId: clean(input.approvalId) || "",
    relatedContact: clean(input.relatedContact) || "",
    relatedOrganization: clean(input.relatedOrganization) || "",
    relatedEvent: clean(input.relatedEvent) || "",
    // When the work is due (optional, ISO). Distinct from snoozedUntil, which is a decision.
    dueAt: clean(input.dueAt) || "",
    // Where "Open" goes: an in-app page or a vetted https link. Null when there is nowhere to go.
    sourceLink: normalizeSourceLink(input.sourceLink),
    // Unified optional entity pointer for display ("who/what this is about").
    related: input.related && clean(input.related.id)
      ? { kind: clean(input.related.kind) || "record", id: clean(input.related.id), label: clean(input.related.label) || "" }
      : null,
    snoozedUntil: clean(input.snoozedUntil) || "",
    decidedBy: clean(input.decidedBy) || "",
    decidedAt: clean(input.decidedAt) || "",
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

// Upsert by id: projected items refresh in place (status decided by Roger is sticky — a
// re-projection never resurrects a dismissed/completed/snoozed item back to "new").
export function upsertQueueItems(existing = [], incoming = [], { now = () => new Date().toISOString() } = {}) {
  const byId = new Map(list(existing).map((item) => [item.id, item]));
  for (const raw of list(incoming)) {
    const item = raw && raw.id ? raw : createQueueItem(raw, { now });
    const prior = byId.get(item.id);
    if (prior) {
      const rogerDecided = QUEUE_TERMINAL_STATUSES.includes(prior.status) || prior.status === "snoozed" || prior.status === "approved" || prior.status === "scheduled";
      byId.set(item.id, {
        ...prior,
        // Refresh the describing fields; keep Roger's decision fields authoritative.
        title: item.title || prior.title,
        summary: item.summary || prior.summary,
        recommendation: item.recommendation || prior.recommendation,
        priority: item.priority ?? prior.priority,
        dueAt: item.dueAt || prior.dueAt || "",
        sourceLink: item.sourceLink || prior.sourceLink || null,
        related: item.related || prior.related || null,
        metadata: { ...prior.metadata, ...item.metadata },
        status: rogerDecided ? prior.status : item.status,
        updatedAt: now()
      });
    } else {
      byId.set(item.id, item);
    }
  }
  const merged = [...byId.values()];
  // Keep every open item; cap only the decided tail (newest first).
  const open = merged.filter((i) => !QUEUE_TERMINAL_STATUSES.includes(i.status));
  const closed = merged
    .filter((i) => QUEUE_TERMINAL_STATUSES.includes(i.status))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, Math.max(0, QUEUE_ITEMS_CAP - open.length));
  return [...open, ...closed];
}

export function transitionQueueItem(state = {}, { id = "", status = "", actor = "", note = "", snoozedUntil = "", now = () => new Date().toISOString() } = {}) {
  const items = list(state.queueItems);
  const item = items.find((i) => i.id === id);
  if (!item) return { state, ok: false, error: "Queue item not found." };
  if (!QUEUE_ITEM_STATUSES.includes(status)) return { state, ok: false, error: `Unknown status "${status}".` };
  const allowed = QUEUE_TRANSITIONS[item.status] || [];
  if (!allowed.includes(status)) {
    return { state, ok: false, error: `Cannot move this item from "${item.status}" to "${status}".` };
  }

  let approvals = list(state.approvals);
  let approvalId = item.approvalId;
  // Approving an approval-requiring item writes the Approval record — the audit trail the
  // gated executors check. It never performs the underlying action here. When the item was
  // proposed with a pre-linked Approval, keep that record's action_type/preview — executors
  // verify action_type, and re-deriving it from the queue item's type would corrupt it.
  if (status === "approved" && item.requiresApproval) {
    const prior = approvals.find((a) => a.id === (approvalId || "")) || null;
    const approval = createApproval({
      id: approvalId || "",
      actionType: prior?.action_type || item.type,
      queueItemId: item.id,
      preview: prior?.preview || item.summary || item.title,
      riskLevel: prior?.risk_level || item.riskLevel,
      state: "approved",
      requested_at: prior?.requested_at || "",
      approvedBy: actor || "owner",
      approvedAt: now()
    }, { now });
    approvalId = approval.id;
    approvals = upsertApprovals(approvals, [approval], { now });
  }

  const at = now();
  const decisionStatuses = ["approved", "dismissed", "completed", "snoozed"];
  const updated = items.map((i) => i.id === id ? {
    ...i,
    status,
    approvalId,
    snoozedUntil: status === "snoozed" ? (clean(snoozedUntil) || "") : "",
    decidedBy: decisionStatuses.includes(status) ? (actor || "owner") : i.decidedBy,
    decidedAt: decisionStatuses.includes(status) ? at : i.decidedAt,
    metadata: note ? { ...i.metadata, lastNote: clean(note) } : i.metadata,
    updatedAt: at
  } : i);

  // Audit trail: every decision leaves a company event. The event is the durable record of
  // who decided what and when — the queue item's own fields can be refreshed by projections.
  let companyEvents = state.companyEvents;
  if (decisionStatuses.includes(status)) {
    const verb = status === "approved" ? "approved" : status === "dismissed" ? "dismissed" : status === "completed" ? "marked complete" : "snoozed";
    companyEvents = appendCompanyEvents(companyEvents, [{
      source: "queue",
      type: "queue_decision",
      risk: "info",
      summary: `${actor || "owner"} ${verb} "${item.title}"${status === "snoozed" && clean(snoozedUntil) ? ` until ${clean(snoozedUntil)}` : ""}${clean(note) ? `. Note: ${clean(note)}` : ""}.`,
      contact_id: item.relatedContact || "",
      occurred_at: at,
      sourceRef: { collection: "queueItems", itemId: item.id }
    }], { now });
  }

  return {
    state: { ...state, queueItems: updated, approvals, companyEvents },
    ok: true,
    item: updated.find((i) => i.id === id),
    approvalId
  };
}

// Wake snoozed items whose snooze window passed. Pure; called by the projector.
export function wakeSnoozedQueueItems(items = [], { now = () => new Date().toISOString() } = {}) {
  const at = now();
  return list(items).map((item) =>
    item.status === "snoozed" && item.snoozedUntil && item.snoozedUntil <= at
      ? { ...item, status: "needs_roger", snoozedUntil: "", updatedAt: at }
      : item
  );
}

// ---------------------------------------------------------------------------------------------
// Contacts & Organizations — identity index (pointers, not migrations)
// ---------------------------------------------------------------------------------------------

export const CONTACT_TYPES = [
  "consumer",
  "paid_customer",
  "abandoned_screening",
  "checkout_abandon",
  "partner_contact",
  "prospect",
  "funder",
  "investor",
  "vendor",
  "attorney",
  "support",
  "media",
  "internal"
];

export const ORGANIZATION_TYPES = [
  "rcap_partner",
  "rcap_prospect",
  "funder",
  "city_county",
  "workforce",
  "legal_aid",
  "reentry",
  "advocacy",
  "employer",
  "nonprofit",
  "vendor",
  "investor",
  "media"
];

// Same identity rule the reactivation lane already uses: one contact per normalized email.
export function companyContactId(email = "") {
  const normalized = lower(email);
  if (!normalized || !normalized.includes("@")) return "";
  return `cc-${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
}

export function companyOrganizationId(name = "", domain = "") {
  const key = lower(domain) || lower(name);
  if (!key) return "";
  return `co-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

// Upsert one person. Never duplicates (email-keyed); merges types/links/orgs as sets.
export function upsertCompanyContact(contacts = [], input = {}, { now = () => new Date().toISOString() } = {}) {
  const email = lower(input.email);
  const id = clean(input.contact_id) || companyContactId(email);
  if (!id) return { contacts: list(contacts), contact: null };
  const at = now();
  const next = [...list(contacts)];
  const idx = next.findIndex((c) => c.contact_id === id || (email && lower(c.email) === email));
  const types = list(input.types).filter((t) => CONTACT_TYPES.includes(t));
  const links = list(input.links).filter((l) => l && clean(l.collection));
  const organizations = list(input.organizations).map(clean).filter(Boolean);
  if (idx >= 0) {
    const prior = next[idx];
    next[idx] = {
      ...prior,
      name: clean(input.name) || prior.name,
      email: prior.email || email,
      types: [...new Set([...list(prior.types), ...types])],
      organizations: [...new Set([...list(prior.organizations), ...organizations])],
      links: dedupeLinks([...list(prior.links), ...links]),
      do_not_contact: Boolean(prior.do_not_contact || input.do_not_contact),
      last_event_at: clean(input.last_event_at) || prior.last_event_at || "",
      updatedAt: at
    };
    return { contacts: next, contact: next[idx] };
  }
  const contact = {
    contact_id: id,
    email,
    name: clean(input.name),
    types,
    organizations,
    links: dedupeLinks(links),
    do_not_contact: Boolean(input.do_not_contact),
    first_seen: clean(input.first_seen) || at,
    last_event_at: clean(input.last_event_at) || "",
    createdAt: at,
    updatedAt: at
  };
  next.push(contact);
  return { contacts: next, contact };
}

export function upsertCompanyOrganization(orgs = [], input = {}, { now = () => new Date().toISOString() } = {}) {
  const id = clean(input.org_id) || companyOrganizationId(input.name, input.domain);
  if (!id) return { organizations: list(orgs), organization: null };
  const at = now();
  const next = [...list(orgs)];
  const idx = next.findIndex((o) => o.org_id === id);
  const types = list(input.types).filter((t) => ORGANIZATION_TYPES.includes(t));
  const links = list(input.links).filter((l) => l && clean(l.collection));
  if (idx >= 0) {
    const prior = next[idx];
    next[idx] = {
      ...prior,
      name: clean(input.name) || prior.name,
      domain: lower(input.domain) || prior.domain,
      types: [...new Set([...list(prior.types), ...types])],
      links: dedupeLinks([...list(prior.links), ...links]),
      stage: clean(input.stage) || prior.stage || "",
      updatedAt: at
    };
    return { organizations: next, organization: next[idx] };
  }
  const organization = {
    org_id: id,
    name: clean(input.name),
    domain: lower(input.domain),
    types,
    links: dedupeLinks(links),
    stage: clean(input.stage) || "",
    createdAt: at,
    updatedAt: at
  };
  next.push(organization);
  return { organizations: next, organization };
}

function dedupeLinks(links = []) {
  const seen = new Set();
  const out = [];
  for (const link of list(links)) {
    const key = `${clean(link.collection)}|${clean(link.itemId ?? link.item_id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ collection: clean(link.collection), itemId: clean(link.itemId ?? link.item_id) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Events — normalized timeline (projection; domain ledgers stay authoritative)
// ---------------------------------------------------------------------------------------------

export const EVENT_RISK_LEVELS = ["info", "watch", "needs_roger"];

export function createCompanyEvent(input = {}, { now = () => new Date().toISOString() } = {}) {
  const summary = clean(input.summary);
  if (!summary) throw new Error("Company event requires a plain-English summary.");
  const type = clean(input.type);
  if (!type) throw new Error("Company event requires a type.");
  return {
    id: clean(input.id) || stableMemoryId("ev", [input.source, type, summary, input.occurred_at, input.sourceRef?.itemId]),
    source: clean(input.source) || "manual",
    type,
    occurred_at: clean(input.occurred_at) || now(),
    created_at: now(),
    contact_id: clean(input.contact_id) || "",
    organization_id: clean(input.organization_id) || "",
    risk: EVENT_RISK_LEVELS.includes(input.risk) ? input.risk : "info",
    sensitive: Boolean(input.sensitive),
    summary,
    // Pointer only — never the raw payload (PII rule).
    raw_ref: input.sourceRef && clean(input.sourceRef.collection)
      ? { collection: clean(input.sourceRef.collection), itemId: clean(input.sourceRef.itemId) }
      : null
  };
}

export function appendCompanyEvents(existing = [], incoming = [], { now = () => new Date().toISOString() } = {}) {
  const byId = new Map(list(existing).map((e) => [e.id, e]));
  for (const raw of list(incoming)) {
    const event = raw && raw.id && raw.created_at ? raw : createCompanyEvent(raw, { now });
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .slice(0, COMPANY_EVENTS_CAP);
}

// ---------------------------------------------------------------------------------------------
// Agent Runs — one normalized ledger over every engine/agent execution
// ---------------------------------------------------------------------------------------------

export function createAgentRun(input = {}, { now = () => new Date().toISOString() } = {}) {
  const agent = clean(input.agent);
  if (!agent) throw new Error("Agent run requires an agent id.");
  return {
    id: clean(input.id) || stableMemoryId("ar", [agent, input.trigger, input.started_at || now()]),
    agent,
    trigger: clean(input.trigger) || "scheduled",
    input_summary: clean(input.input_summary),
    output_summary: clean(input.output_summary),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : null,
    actions_proposed: Number(input.actions_proposed) || 0,
    writes_performed: Number(input.writes_performed) || 0,
    errors: list(input.errors).map(clean).filter(Boolean),
    status: clean(input.status) || "success",
    started_at: clean(input.started_at) || now(),
    ended_at: clean(input.ended_at) || now(),
    duration_ms: Number(input.duration_ms) || 0,
    // Review layer (Phase 18C): what the run was for, how risky its output is, what should
    // happen next, and — once a human looked at it — who reviewed it and what finally happened.
    purpose: clean(input.purpose),
    risk: QUEUE_RISK_LEVELS.includes(input.risk) ? input.risk : "safe",
    recommended_next_step: clean(input.recommended_next_step),
    approval_required: Boolean(input.approval_required),
    queue_item_id: clean(input.queue_item_id),
    approval_id: clean(input.approval_id),
    reviewed_at: clean(input.reviewed_at),
    reviewed_by: clean(input.reviewed_by),
    final_action: clean(input.final_action)
  };
}

export function appendAgentRuns(existing = [], incoming = [], { now = () => new Date().toISOString() } = {}) {
  const byId = new Map(list(existing).map((r) => [r.id, r]));
  for (const raw of list(incoming)) {
    const run = raw && raw.id && raw.agent ? raw : createAgentRun(raw, { now });
    byId.set(run.id, run); // runs may update in place (same bucket re-run)
  }
  return [...byId.values()]
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
    .slice(0, AGENT_RUNS_CAP);
}

// ---------------------------------------------------------------------------------------------
// Approvals — every risky action's audit record
// ---------------------------------------------------------------------------------------------

export const APPROVAL_STATES = ["requested", "approved", "rejected", "executed", "verified", "failed"];

export function createApproval(input = {}, { now = () => new Date().toISOString() } = {}) {
  const actionType = clean(input.actionType || input.action_type);
  if (!actionType) throw new Error("Approval requires an action type.");
  return {
    id: clean(input.id) || stableMemoryId("ap", [actionType, input.queueItemId, input.preview, now()]),
    action_type: actionType,
    queue_item_id: clean(input.queueItemId || input.queue_item_id) || "",
    preview: clean(input.preview),
    risk_level: QUEUE_RISK_LEVELS.includes(input.riskLevel || input.risk_level) ? (input.riskLevel || input.risk_level) : "caution",
    state: APPROVAL_STATES.includes(input.state) ? input.state : "requested",
    requested_at: clean(input.requested_at) || now(),
    approved_by: clean(input.approvedBy || input.approved_by) || "",
    approved_at: clean(input.approvedAt || input.approved_at) || "",
    executed_at: clean(input.executed_at) || "",
    execution_result: clean(input.execution_result) || "",
    verification_result: clean(input.verification_result) || ""
  };
}

export function upsertApprovals(existing = [], incoming = [], { now = () => new Date().toISOString() } = {}) {
  const byId = new Map(list(existing).map((a) => [a.id, a]));
  for (const raw of list(incoming)) {
    const approval = raw && raw.id && raw.action_type ? raw : createApproval(raw, { now });
    const prior = byId.get(approval.id);
    byId.set(approval.id, prior ? { ...prior, ...approval } : approval);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))
    .slice(0, APPROVALS_CAP);
}

// ---------------------------------------------------------------------------------------------
// Direct emit helpers — the shared write target for engines (state-in/state-out)
// ---------------------------------------------------------------------------------------------

export function emitQueueItem(state = {}, input = {}, opts = {}) {
  return { ...state, queueItems: upsertQueueItems(state.queueItems, [input], opts) };
}

export function emitCompanyEvent(state = {}, input = {}, opts = {}) {
  return { ...state, companyEvents: appendCompanyEvents(state.companyEvents, [input], opts) };
}

export function recordAgentRun(state = {}, input = {}, opts = {}) {
  return { ...state, agentRuns: appendAgentRuns(state.agentRuns, [input], opts) };
}

export function requestApproval(state = {}, input = {}, opts = {}) {
  const approval = createApproval({ ...input, state: "requested" }, opts);
  return {
    state: { ...state, approvals: upsertApprovals(state.approvals, [approval], opts) },
    approval
  };
}
