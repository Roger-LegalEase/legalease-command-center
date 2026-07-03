#!/usr/bin/env node
// Phase 18B queue-foundation guard: dueAt/sourceLink/related fields, safe Open targets,
// decision audit events, and the Decisions page wiring. Pure unit checks plus source-order
// checks over preview-server.mjs (repo idiom; no browser needed).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createQueueItem, transitionQueueItem, upsertQueueItems, normalizeSourceLink, DATA_STATUSES
} from "./company-memory.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = "2026-07-03T12:00:00.000Z";
const nowFn = () => NOW;

check("queue items carry dueAt, sourceLink, and related", () => {
  const item = createQueueItem({
    type: "campaign",
    title: "Approve wave 9",
    dueAt: "2026-07-10T00:00:00.000Z",
    sourceLink: { kind: "page", target: "campaigns" },
    related: { kind: "wave", id: "9", label: "Wave 9" }
  }, { now: nowFn });
  assert.equal(item.dueAt, "2026-07-10T00:00:00.000Z");
  assert.deepEqual(item.sourceLink, { kind: "page", target: "#campaigns" });
  assert.deepEqual(item.related, { kind: "wave", id: "9", label: "Wave 9" });
});

check("Open targets are vetted: pages normalize, only https external, junk rejected", () => {
  assert.deepEqual(normalizeSourceLink({ kind: "page", target: "#prospects" }), { kind: "page", target: "#prospects" });
  assert.deepEqual(normalizeSourceLink({ kind: "page", target: "app-status" }), { kind: "page", target: "#app-status" });
  assert.deepEqual(normalizeSourceLink({ kind: "external", target: "https://github.com/x/y/pull/1" }), { kind: "external", target: "https://github.com/x/y/pull/1" });
  assert.equal(normalizeSourceLink({ kind: "external", target: "http://insecure.example" }), null);
  assert.equal(normalizeSourceLink({ kind: "page", target: "javascript:alert(1)" }), null);
  assert.equal(normalizeSourceLink({ kind: "external", target: "javascript:alert(1)" }), null);
  assert.equal(normalizeSourceLink({ kind: "page", target: "#two words" }), null);
  assert.equal(normalizeSourceLink(null), null);
  const item = createQueueItem({ type: "support", title: "x", sourceLink: { kind: "external", target: "javascript:alert(1)" } }, { now: nowFn });
  assert.equal(item.sourceLink, null, "unsafe link never survives into a queue item");
});

check("re-projection refreshes dueAt/sourceLink/related without clobbering decisions", () => {
  const first = createQueueItem({ id: "qi-1", type: "meeting", title: "Prep call" }, { now: nowFn });
  const refreshed = createQueueItem({
    id: "qi-1", type: "meeting", title: "Prep call",
    dueAt: "2026-07-05T00:00:00.000Z", sourceLink: { kind: "page", target: "meetings" }
  }, { now: nowFn });
  const merged = upsertQueueItems([first], [refreshed], { now: nowFn });
  assert.equal(merged[0].dueAt, "2026-07-05T00:00:00.000Z");
  assert.deepEqual(merged[0].sourceLink, { kind: "page", target: "#meetings" });
});

check("every decision leaves an audit event in companyEvents", () => {
  const base = { queueItems: [createQueueItem({ id: "qi-a", type: "support", title: "Reply to Dana", status: "needs_roger" }, { now: nowFn })], companyEvents: [] };
  const snoozed = transitionQueueItem(base, { id: "qi-a", status: "snoozed", actor: "roger", snoozedUntil: "2026-07-04T12:00:00.000Z", now: nowFn });
  assert.equal(snoozed.ok, true);
  const snoozeEvent = snoozed.state.companyEvents.find((e) => e.type === "queue_decision");
  assert(snoozeEvent, "snooze emits a queue_decision event");
  assert.match(snoozeEvent.summary, /roger snoozed "Reply to Dana" until 2026-07-04/);
  assert.deepEqual(snoozeEvent.raw_ref, { collection: "queueItems", itemId: "qi-a" });

  const dismissed = transitionQueueItem(snoozed.state, { id: "qi-a", status: "dismissed", actor: "roger", note: "duplicate", now: nowFn });
  const dismissEvent = dismissed.state.companyEvents.find((e) => /dismissed/.test(e.summary));
  assert(dismissEvent, "dismiss emits an audit event");
  assert.match(dismissEvent.summary, /Note: duplicate/);
});

check("approval decisions are audited and still never execute anything", () => {
  const base = {
    queueItems: [createQueueItem({ id: "qi-b", type: "campaign", title: "Approve wave 9", requiresApproval: true, status: "needs_roger" }, { now: nowFn })],
    approvals: [], companyEvents: []
  };
  const result = transitionQueueItem(base, { id: "qi-b", status: "approved", actor: "roger", now: nowFn });
  assert.equal(result.ok, true);
  assert(result.state.companyEvents.some((e) => /roger approved "Approve wave 9"/.test(e.summary)), "approve emits an audit event");
  const approval = result.state.approvals.find((a) => a.id === result.approvalId);
  assert.equal(approval.state, "approved");
  assert.equal(approval.executed_at, "", "approving records the approval; execution stays with the gated executors");
});

check("non-decision transitions do not spam the audit trail", () => {
  const base = { queueItems: [createQueueItem({ id: "qi-c", type: "support", title: "x", status: "new" }, { now: nowFn })], companyEvents: [] };
  const moved = transitionQueueItem(base, { id: "qi-c", status: "needs_roger", now: nowFn });
  assert.equal(moved.ok, true);
  assert.equal((moved.state.companyEvents || []).length, 0, "routine status moves emit no decision event");
});

check("the shared data-status vocabulary is exported", () => {
  for (const status of ["connected", "not_connected", "needs_attention", "loading", "error", "no_data", "draft", "needs_approval"]) {
    assert(DATA_STATUSES.includes(status), `DATA_STATUSES includes ${status}`);
  }
});

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

check("the Decisions page exists with the four controls and safe Open rendering", () => {
  assert(source.includes('"decisions",'), "decisions is a known page");
  assert(source.includes("function decisionsPageHtml("), "page renderer exists");
  assert(source.includes('pageId === "decisions" ? decisionsPageHtml(pageClass)'), "page is dispatched");
  assert(source.includes('pageId === "decisions" && !companyQueue && !companyQueueLoading) loadDecisionsQueue()'), "queue loads lazily on open");
  assert(source.includes("function ckOpenControlHtml("), "Open control helper exists");
  assert(source.includes('rel="noopener noreferrer"'), "external links open safely");
  assert(source.includes("ckOpenControlHtml(item.sourceLink)"), "Needs Roger cards carry the Open control");
  const decideFn = source.slice(source.indexOf("async function decideQueueItem"), source.indexOf("async function loadDecisionsQueue"));
  assert(decideFn.includes('"complete"'), "mark-complete is wired through the same decide path");
});

check("decision endpoints persist the audit events", () => {
  const decideAt = source.indexOf('url.pathname === "/api/approvals/decide"');
  const transitionAt = source.indexOf('url.pathname === "/api/queue/transition"');
  assert(decideAt >= 0 && transitionAt > decideAt, "both server handlers exist");
  const decide = source.slice(decideAt, transitionAt);
  assert(decide.includes("companyEvents: result.state.companyEvents"), "approve endpoint persists companyEvents");
  const transition = source.slice(transitionAt, transitionAt + 3000);
  assert(transition.includes("companyEvents: result.state.companyEvents"), "transition endpoint persists companyEvents");
});

check("the social-post Review Desk keeps its route", () => {
  assert(source.includes('<section id="queue" class="queue-review-shell'), "the posts Review Desk still renders at #queue");
});

console.log(`\ntest-queue-foundation: all ${passed} checks passed.`);
