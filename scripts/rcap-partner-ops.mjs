// RCAP partner ops (Phase 18F) — display-only views of the partner side of the Record
// Clearing Access Program: observed usage windows, onboarding progress, and packet counts.
//
// HARD RULES:
//   - DISPLAY ONLY. Every builder in this module is a pure read. Nothing here returns a
//     mutated state, writes a collection, calls the network, or queues an approval.
//   - There is NO partner cap in this system. RCAP packet generation lives outside this
//     repo and reports usage inbound via signed `partner_usage_window` product events.
//     This module shows what those events say happened — it never counts down an
//     allowance, blocks a packet, throttles a partner, or creates enforcement of any kind.
//   - Numbers are honest: observed events and approved funnel snapshots are shown as the
//     separate things they are, and a partner whose stage says "stalled" gets a paused
//     checklist, not fabricated progress.

import { normalizePartnerLifecycle } from "./partner-lifecycle.mjs";

const clean = (v = "") => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
const count = (n, noun) => `${Number(n || 0).toLocaleString("en-US")} ${noun}${Number(n || 0) === 1 ? "" : "s"}`;

export const RCAP_PARTNER_OPS_NOTE =
  "Display only. There is no partner cap anywhere in this system: nothing on this view counts down an allowance, blocks a packet, or throttles a partner. It shows what the inbound events say happened — nothing more.";

function partnerDirectory(state = {}) {
  const byId = new Map();
  for (const partner of list(state.partners)) {
    if (partner && clean(partner.id)) byId.set(clean(partner.id), normalizePartnerLifecycle(partner));
  }
  return byId;
}

function partnerLabel(byId, partnerId) {
  const partner = byId.get(clean(partnerId));
  return partner ? clean(partner.organizationName || partner.name) || "Unnamed partner" : "Unmatched partner";
}

// Which partner an inbound product event belongs to. receiveProductEvent stores the caller's
// partnerId in rawPayload and also resolves relatedEntityType/Id when it can.
function eventPartnerId(event = {}) {
  const raw = event.rawPayload || {};
  if (clean(raw.partnerId)) return clean(raw.partnerId);
  if (clean(event.relatedEntityType) === "partner") return clean(event.relatedEntityId);
  return "";
}

function eventMonth(event = {}) {
  const stamp = clean(event.rawPayload?.timestamp) || clean(event.receivedAt) || clean(event.createdAt);
  return /^\d{4}-\d{2}/.test(stamp) ? stamp.slice(0, 7) : "unknown";
}

// Same key precedence receiveProductEvent uses when it turns a partner_usage_window event
// into a funnel metric, so the displayed count can never disagree with the recorded one.
export function partnerUsageWindowCount(metadata = {}) {
  const raw = Number(
    metadata.partnerUsageWindow ?? metadata.partner_usage_window ?? metadata.used ??
    metadata.usedCount ?? metadata.used_count ?? metadata.count ?? 1
  );
  return Number.isFinite(raw) ? Math.max(0, raw) : 1;
}

// ---------------------------------------------------------------------------------------------
// 1. Partner usage — observed `partner_usage_window` events, grouped by partner and month.
// ---------------------------------------------------------------------------------------------

export function buildPartnerUsageView(state = {}) {
  const byId = partnerDirectory(state);
  const events = list(state.automationEvents).filter((e) => e && clean(e.eventType) === "partner_usage_window");
  const partners = new Map();
  for (const event of events) {
    const partnerId = eventPartnerId(event);
    const key = partnerId || "unmatched";
    const entry = partners.get(key) || {
      partnerId,
      partnerName: partnerId ? partnerLabel(byId, partnerId) : "Unmatched partner",
      stage: byId.get(partnerId)?.stage || "",
      observedTotal: 0,
      events: 0,
      lastEventAt: "",
      months: new Map()
    };
    const used = partnerUsageWindowCount(event.rawPayload?.metadata || {});
    const month = eventMonth(event);
    entry.observedTotal += used;
    entry.events += 1;
    entry.months.set(month, (entry.months.get(month) || 0) + used);
    const at = clean(event.receivedAt) || clean(event.createdAt);
    if (at > entry.lastEventAt) entry.lastEventAt = at;
    partners.set(key, entry);
  }

  // Approved funnel snapshots carry the same metric after Roger approves the suggestion.
  // Shown separately — an observed event and an approved snapshot are different facts.
  const funnelByPartner = new Map();
  for (const row of list(state.funnelSnapshots)) {
    const used = Number(row?.partnerUsageWindow || 0);
    if (!used) continue;
    const key = clean(row.partnerId) || "unmatched";
    funnelByPartner.set(key, (funnelByPartner.get(key) || 0) + used);
  }

  const rows = [...partners.entries()].map(([key, entry]) => ({
    partnerId: entry.partnerId,
    partnerName: entry.partnerName,
    stage: entry.stage,
    observedTotal: entry.observedTotal,
    events: entry.events,
    lastEventAt: entry.lastEventAt,
    approvedFunnelTotal: funnelByPartner.get(key) || 0,
    months: [...entry.months.entries()].sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, observed]) => ({ month, observed }))
  })).sort((a, b) => b.observedTotal - a.observedTotal);

  const observedTotal = rows.reduce((sum, r) => sum + r.observedTotal, 0);
  return {
    ok: true,
    writesState: false,
    displayOnly: true,
    capEnforcement: "none",
    partners: rows,
    totals: {
      observed: observedTotal,
      events: events.length,
      approvedFunnel: [...funnelByPartner.values()].reduce((sum, v) => sum + v, 0),
      partnersReporting: rows.filter((r) => r.partnerId).length
    },
    plain: events.length === 0
      ? "No partner usage events have arrived yet. When RCAP reports a partner_usage_window event, the observed usage shows up here."
      : `${count(observedTotal, "usage window")} observed across ${count(rows.filter((r) => r.partnerId).length, "partner")}, from ${count(events.length, "inbound event")}.`,
    note: RCAP_PARTNER_OPS_NOTE
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Onboarding checklist — derived from lifecycle stages, nothing invented.
// ---------------------------------------------------------------------------------------------

export const ONBOARDING_STEPS = [
  { key: "lead", label: "Partner identified" },
  { key: "qualified", label: "Qualified as a fit" },
  { key: "intro_scheduled", label: "Intro conversation scheduled" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "pilot_scoped", label: "Pilot scoped" },
  { key: "active_pilot", label: "Pilot live" },
  { key: "reporting", label: "Reporting live" }
];

// Highest checklist index a stage PROVES was reached. Stages past "reporting" (renewal,
// case_study, expansion) prove the whole checklist. contract_pending sits with pilot_scoped.
const STAGE_PROOF_INDEX = {
  lead: 0, qualified: 1, intro_scheduled: 2, proposal_sent: 3,
  pilot_scoped: 4, contract_pending: 4, active_pilot: 5,
  reporting: 6, renewal: 6, case_study: 6, expansion: 6
};

export function buildOnboardingChecklist(state = {}) {
  const partners = list(state.partners).map((p) => normalizePartnerLifecycle(p));
  const rows = partners.map((partner) => {
    const stage = clean(partner.stage).toLowerCase();
    const paused = stage === "stalled";
    const closed = stage === "lost";
    const provenIndex = STAGE_PROOF_INDEX[stage];
    // A stalled or lost stage proves nothing about how far onboarding got, so no step is
    // shown as done — showing progress we cannot prove would be a fabricated number.
    const steps = ONBOARDING_STEPS.map((step, index) => ({
      ...step,
      done: Number.isInteger(provenIndex) && index <= provenIndex
    }));
    const doneCount = steps.filter((s) => s.done).length;
    const nextStep = paused || closed ? null : steps.find((s) => !s.done) || null;
    return {
      partnerId: clean(partner.id),
      partnerName: clean(partner.organizationName || partner.name) || "Unnamed partner",
      stage,
      paused,
      closed,
      steps,
      doneCount,
      totalSteps: ONBOARDING_STEPS.length,
      nextStep: nextStep ? nextStep.label : "",
      plain: closed
        ? "Closed lost. The checklist is retired for this partner."
        : paused
          ? "Progress is paused. The stage does not record how far onboarding got, so no steps are marked done."
          : doneCount === ONBOARDING_STEPS.length
            ? "Fully onboarded and reporting."
            : `${doneCount} of ${ONBOARDING_STEPS.length} steps done. Next: ${nextStep?.label || ""}.`
    };
  }).sort((a, b) => b.doneCount - a.doneCount || a.partnerName.localeCompare(b.partnerName));
  return {
    ok: true,
    writesState: false,
    displayOnly: true,
    partners: rows,
    plain: rows.length === 0
      ? "No partners are on record yet, so there is no onboarding to show."
      : `${count(rows.length, "partner")} on the checklist; ${count(rows.filter((r) => r.doneCount === ONBOARDING_STEPS.length).length, "partner")} fully onboarded, ${count(rows.filter((r) => r.paused).length, "partner")} paused.`,
    note: RCAP_PARTNER_OPS_NOTE
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Packet counts — from the inbound event metrics that already exist.
// ---------------------------------------------------------------------------------------------

const PACKET_EVENT_TYPES = { packet_generated: "generated", packet_completed: "completed" };

export function buildPacketCounts(state = {}) {
  const byId = partnerDirectory(state);
  const observed = { generated: 0, completed: 0 };
  const partners = new Map();
  for (const event of list(state.automationEvents)) {
    const kind = PACKET_EVENT_TYPES[clean(event?.eventType)];
    if (!kind) continue;
    observed[kind] += 1;
    const partnerId = eventPartnerId(event);
    const key = partnerId || "unmatched";
    const entry = partners.get(key) || {
      partnerId,
      partnerName: partnerId ? partnerLabel(byId, partnerId) : "Unmatched partner",
      observed: { generated: 0, completed: 0 },
      funnel: { generated: 0, completed: 0 }
    };
    entry.observed[kind] += 1;
    partners.set(key, entry);
  }

  const funnel = { generated: 0, completed: 0 };
  for (const row of list(state.funnelSnapshots)) {
    const generated = Number(row?.packetGenerated || 0);
    const completed = Number(row?.packetCompleted || 0);
    if (!generated && !completed) continue;
    funnel.generated += generated;
    funnel.completed += completed;
    const key = clean(row.partnerId) || "unmatched";
    const entry = partners.get(key) || {
      partnerId: clean(row.partnerId),
      partnerName: clean(row.partnerId) ? partnerLabel(byId, row.partnerId) : "Unmatched partner",
      observed: { generated: 0, completed: 0 },
      funnel: { generated: 0, completed: 0 }
    };
    entry.funnel.generated += generated;
    entry.funnel.completed += completed;
    partners.set(key, entry);
  }

  const rows = [...partners.values()].sort((a, b) =>
    (b.observed.generated + b.funnel.generated) - (a.observed.generated + a.funnel.generated));
  return {
    ok: true,
    writesState: false,
    displayOnly: true,
    totals: { observed, funnel },
    partners: rows,
    plain: observed.generated + observed.completed + funnel.generated + funnel.completed === 0
      ? "No packet events have arrived yet. Packet generation happens outside this system; when it reports in, the counts show up here."
      : `Observed events: ${count(observed.generated, "packet")} generated, ${count(observed.completed, "packet")} completed. Approved funnel snapshots: ${funnel.generated} generated, ${funnel.completed} completed.`,
    note: RCAP_PARTNER_OPS_NOTE
  };
}
