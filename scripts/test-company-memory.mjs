#!/usr/bin/env node
// Company Memory core tests — schemas, identity dedup, transitions, caps, emit helpers.
import assert from "node:assert/strict";
import {
  COMPANY_MEMORY_COLLECTIONS,
  QUEUE_ITEM_STATUSES,
  QUEUE_ITEM_TYPES,
  createQueueItem,
  upsertQueueItems,
  transitionQueueItem,
  wakeSnoozedQueueItems,
  companyContactId,
  upsertCompanyContact,
  upsertCompanyOrganization,
  createCompanyEvent,
  appendCompanyEvents,
  createAgentRun,
  appendAgentRuns,
  createApproval,
  APPROVAL_STATES,
  emitQueueItem,
  emitCompanyEvent,
  recordAgentRun,
  requestApproval,
  COMPANY_EVENTS_CAP,
  upsertCompanyContacts,
  upsertCompanyOrganizations
} from "./company-memory.mjs";
import { coreStateCollections } from "./storage.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = { now: () => "2026-07-03T12:00:00.000Z" };

check("every company-memory collection is registered in coreStateCollections", () => {
  for (const name of COMPANY_MEMORY_COLLECTIONS) {
    assert(coreStateCollections.includes(name), `${name} missing from coreStateCollections — it would silently fail to persist`);
  }
});

check("queue item requires a known type and a title", () => {
  assert.throws(() => createQueueItem({ title: "x" }, NOW));
  assert.throws(() => createQueueItem({ type: "approval" }, NOW));
  const item = createQueueItem({ type: "approval", title: "Approve outreach batch", sourceEngine: "outreach-sequencer" }, NOW);
  assert.equal(item.status, "new");
  assert(QUEUE_ITEM_TYPES.includes(item.type));
});

check("requiresApproval items land in needs_roger with caution risk", () => {
  const item = createQueueItem({ type: "campaign", title: "Release Wave 3", requiresApproval: true }, NOW);
  assert.equal(item.status, "needs_roger");
  assert.equal(item.riskLevel, "caution");
});

check("projection ids are stable — same fact never becomes two items", () => {
  const a = createQueueItem({ type: "support", title: "Login issue", sourceEngine: "support", sourceRef: { collection: "supportIssues", itemId: "s1" } }, NOW);
  const b = createQueueItem({ type: "support", title: "Login issue", sourceEngine: "support", sourceRef: { collection: "supportIssues", itemId: "s1" } }, NOW);
  assert.equal(a.id, b.id);
  const merged = upsertQueueItems([a], [b], NOW);
  assert.equal(merged.length, 1);
});

check("re-projection never resurrects a decision Roger already made", () => {
  const item = createQueueItem({ type: "support", title: "Old issue", sourceRef: { collection: "supportIssues", itemId: "s2" } }, NOW);
  const dismissed = { ...item, status: "dismissed" };
  const merged = upsertQueueItems([dismissed], [createQueueItem({ type: "support", title: "Old issue", sourceRef: { collection: "supportIssues", itemId: "s2" } }, NOW)], NOW);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "dismissed");
});

check("approve transition writes an Approval record, never performs the action", () => {
  const item = createQueueItem({ type: "campaign", title: "Release Wave 3", requiresApproval: true }, NOW);
  let state = { queueItems: [item], approvals: [] };
  const result = transitionQueueItem(state, { id: item.id, status: "approved", actor: "roger", now: NOW.now });
  assert.equal(result.ok, true);
  assert.equal(result.item.status, "approved");
  assert.equal(result.state.approvals.length, 1);
  assert.equal(result.state.approvals[0].state, "approved");
  assert.equal(result.state.approvals[0].queue_item_id, item.id);
  assert.equal(result.item.approvalId, result.state.approvals[0].id);
});

check("illegal transitions are refused with a plain-English error", () => {
  const item = createQueueItem({ type: "support", title: "Done thing" }, NOW);
  const completed = { ...item, status: "completed" };
  const result = transitionQueueItem({ queueItems: [completed], approvals: [] }, { id: item.id, status: "approved", now: NOW.now });
  assert.equal(result.ok, false);
  assert(/Cannot move/.test(result.error));
});

check("snoozed items wake after their window", () => {
  const item = { ...createQueueItem({ type: "partner_followup", title: "Nudge partner" }, NOW), status: "snoozed", snoozedUntil: "2026-07-03T11:00:00.000Z" };
  const woken = wakeSnoozedQueueItems([item], NOW);
  assert.equal(woken[0].status, "needs_roger");
  assert.equal(woken[0].snoozedUntil, "");
});

check("contacts never duplicate — email-keyed identity with merged types and links", () => {
  let { contacts } = upsertCompanyContact([], { email: "Jane@example.com", name: "Jane", types: ["consumer"], links: [{ collection: "reactivationContacts", itemId: "r1" }] }, NOW);
  ({ contacts } = upsertCompanyContact(contacts, { email: "jane@example.com", types: ["media"], links: [{ collection: "reactivationContacts", itemId: "r1" }, { collection: "outreachContacts", itemId: "o1" }] }, NOW));
  assert.equal(contacts.length, 1);
  assert.deepEqual(contacts[0].types.sort(), ["consumer", "media"]);
  assert.equal(contacts[0].links.length, 2);
  assert.equal(contacts[0].contact_id, companyContactId("jane@example.com"));
});

check("do_not_contact is sticky once set", () => {
  let { contacts } = upsertCompanyContact([], { email: "no@example.com", do_not_contact: true }, NOW);
  ({ contacts } = upsertCompanyContact(contacts, { email: "no@example.com", do_not_contact: false }, NOW));
  assert.equal(contacts[0].do_not_contact, true);
});

check("organizations dedupe by domain/name and merge types", () => {
  let { organizations } = upsertCompanyOrganization([], { name: "Fresh Start", domain: "freshstart.org", types: ["rcap_partner"] }, NOW);
  ({ organizations } = upsertCompanyOrganization(organizations, { name: "Fresh Start Network", domain: "freshstart.org", types: ["reentry"] }, NOW));
  assert.equal(organizations.length, 1);
  assert.deepEqual(organizations[0].types.sort(), ["rcap_partner", "reentry"]);
});

check("events require a plain-English summary and dedupe by id", () => {
  assert.throws(() => createCompanyEvent({ type: "payment_succeeded" }, NOW));
  const ev = createCompanyEvent({ source: "stripe", type: "payment_succeeded", summary: "A customer paid.", occurred_at: "2026-07-02T10:00:00Z" }, NOW);
  const events = appendCompanyEvents([], [ev, ev], NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].risk, "info");
});

check("event timeline is newest-first and capped", () => {
  const many = [];
  for (let i = 0; i < COMPANY_EVENTS_CAP + 50; i++) {
    many.push(createCompanyEvent({ source: "test", type: "tick", summary: `Event ${i}`, occurred_at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}Z` }, NOW));
  }
  const events = appendCompanyEvents([], many, NOW);
  assert.equal(events.length, COMPANY_EVENTS_CAP);
  assert(events[0].occurred_at >= events[events.length - 1].occurred_at);
});

check("agent runs normalize and update in place on re-run", () => {
  const run = createAgentRun({ agent: "codebase-health", trigger: "scheduled", output_summary: "No drift found.", started_at: "2026-07-03T06:00:00Z" }, NOW);
  let runs = appendAgentRuns([], [run], NOW);
  runs = appendAgentRuns(runs, [{ ...run, output_summary: "Two findings." }], NOW);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].output_summary, "Two findings.");
});

check("approvals validate state and merge by id", () => {
  const approval = createApproval({ actionType: "campaign", preview: "Send Wave 3 to 700 people", state: "nonsense" }, NOW);
  assert.equal(approval.state, "requested");
  assert(APPROVAL_STATES.includes(approval.state));
});

check("emit helpers are pure state-in/state-out", () => {
  let state = { queueItems: [], companyEvents: [], agentRuns: [], approvals: [] };
  state = emitQueueItem(state, { type: "revenue", title: "Refund spike to review" }, NOW);
  state = emitCompanyEvent(state, { source: "stripe", type: "refund", summary: "A refund was issued." }, NOW);
  state = recordAgentRun(state, { agent: "revenue-monitor", output_summary: "1 anomaly." }, NOW);
  const { state: withApproval, approval } = requestApproval(state, { actionType: "campaign", preview: "Release wave" }, NOW);
  assert.equal(withApproval.queueItems.length, 1);
  assert.equal(withApproval.companyEvents.length, 1);
  assert.equal(withApproval.agentRuns.length, 1);
  assert.equal(withApproval.approvals.length, 1);
  assert.equal(approval.state, "requested");
});

check("user-facing fields carry no engineering jargon defaults", () => {
  const item = createQueueItem({ type: "system_health", title: "Production needs a fresh deploy", summary: "The running version is older than the latest approved changes." }, NOW);
  for (const field of [item.title, item.summary, item.recommendation]) {
    assert(!/heartbeat|mutex|act\(\)|registry|lease|collection|JSON/i.test(field), `jargon leaked into: ${field}`);
  }
});


// ---------------------------------------------------------------------------------------------
// The indexed upsert must be indistinguishable from the one it replaced (2026-07-29).
// The single-item function was O(n) per call — a copy plus a linear scan — which made the
// relationship projection quadratic and cost 3.4s of CPU on every GET /api/ui/partners. The batch
// path builds one index instead. If these two ever disagree, the projection silently changes
// shape, so the equivalence is pinned rather than assumed.
// ---------------------------------------------------------------------------------------------
check("batch contact upsert equals folding the single-item upsert over the same rows", () => {
  const now = () => "2026-07-29T00:00:00.000Z";
  const seed = [
    { contact_id:"cc-1", email:"a@example.org", name:"A", types:["consumer"], organizations:[], links:[{ collection:"x", itemId:"1" }] },
    { contact_id:"cc-2", email:"b@example.org", name:"B", types:["prospect"], organizations:["org-1"], links:[] }
  ];
  const inputs = [
    { email:"a@example.org", name:"A updated", types:["prospect"], links:[{ collection:"y", itemId:"2" }] },
    { email:"c@example.org", name:"C", types:["media"] },
    { contact_id:"cc-2", email:"b@example.org", do_not_contact:true, organizations:["org-2"] },
    { email:"", name:"no identity" },
    { email:"C@EXAMPLE.ORG", name:"C again", types:["investor"] }
  ];
  let folded = seed;
  for (const input of inputs) ({ contacts: folded } = upsertCompanyContact(folded, input, { now }));
  const { contacts: batched } = upsertCompanyContacts(seed, inputs, { now });
  assert.deepEqual(batched, folded, "batch and folded single-item upserts must produce identical arrays");
  assert.equal(batched.length, 3, "two seeded plus one new contact");
  assert.equal(batched[0].types.includes("prospect"), true, "types merge as a set");
  assert.equal(batched[2].types.includes("investor"), true, "a case-different email matches the same person");
  assert.deepEqual(seed.map((row) => row.name), ["A", "B"], "the input array is never mutated");
});

check("batch organisation upsert equals folding the single-item upsert", () => {
  const now = () => "2026-07-29T00:00:00.000Z";
  const seed = [{ org_id:"co-1", name:"One", domain:"one.org", types:["legal_aid"], links:[] }];
  const inputs = [
    { org_id:"co-1", name:"One renamed", types:["reentry"] },
    { name:"Two", domain:"two.org", types:["legal_aid"] },
    { name:"", domain:"" },
    { name:"Two", domain:"two.org", stage:"approved" }
  ];
  let folded = seed;
  for (const input of inputs) ({ organizations: folded } = upsertCompanyOrganization(folded, input, { now }));
  const { organizations: batched } = upsertCompanyOrganizations(seed, inputs, { now });
  assert.deepEqual(batched, folded);
  assert.equal(batched.length, 2, "domain-or-name identity keeps Two a single organisation");
});

console.log(`\ntest-company-memory: ${passed} checks passed`);
