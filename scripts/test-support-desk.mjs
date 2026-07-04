#!/usr/bin/env node
// Phase 18D guard: support triage stays honest and sendless. UPL-sensitive messages are
// flagged and never machine-drafted; urgency is detected; drafts are internal-only; the
// queue projection boosts what needs Roger first.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifySupportText, normalizeSupportIssue, prepareSupportDraftReply,
  transitionSupportIssue, upsertSupportIssues, SUPPORT_STATUSES
} from "./support-desk.mjs";
import { convertGrowthInboxItem, normalizeGrowthInboxItem } from "./growth-inbox.mjs";
import { projectCompanyMemory } from "./company-memory-projector.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = "2026-07-04T16:00:00.000Z";
const nowFn = () => NOW;

check("legal-advice-seeking messages are flagged with plain reasons", () => {
  for (const text of [
    "What are my rights if my landlord evicted me?",
    "Should I plead guilty to get this over with?",
    "Do I qualify for expungement with two charges?",
    "Can you give me legal advice about my case?",
    "I think I need a lawyer for my court date"
  ]) {
    const c = classifySupportText(text);
    assert.equal(c.uplSensitive, true, `flags: ${text}`);
    assert(c.uplReasons.length > 0, "carries a readable reason");
  }
});

check("ordinary product questions are not flagged", () => {
  for (const text of [
    "I was charged twice for my packet, can you refund one?",
    "The download button gives an error",
    "How do I change my email address?",
    "Just curious, do you support Alaska yet?"
  ]) {
    assert.equal(classifySupportText(text).uplSensitive, false, `does not flag: ${text}`);
  }
});

check("urgency detection: urgent, low, and default normal", () => {
  assert.equal(classifySupportText("I was double charged, need a refund ASAP").urgency, "urgent");
  assert.equal(classifySupportText("No rush, just a suggestion for the site").urgency, "low");
  assert.equal(classifySupportText("How do I update my address?").urgency, "normal");
});

check("normalize produces one canonical shape and keeps legacy fields", () => {
  const issue = normalizeSupportIssue({
    title: "Locked out of account",
    summary: "I can't log in and I'm locked out, need help right away",
    severity: "High", legalSensitivity: "review", source: "growth_inbox"
  }, { now: nowFn });
  assert.equal(issue.status, "open");
  assert.equal(issue.urgency, "urgent");
  assert.equal(issue.upl_sensitive, false);
  assert.equal(issue.severity, "High", "legacy fields survive");
  assert(issue.id.startsWith("support-"));
  assert.throws(() => normalizeSupportIssue({ summary: "" }), /plain-English title/);
});

check("no machine draft for legal-advice-sensitive messages, ever", () => {
  const issue = normalizeSupportIssue({ title: "Question about my case", summary: "should I plead no contest? what are my rights" }, { now: nowFn });
  assert.equal(issue.upl_sensitive, true);
  const result = prepareSupportDraftReply(issue, { now: nowFn });
  assert.equal(result.ok, false);
  assert.match(result.error, /legal advice/i);
  assert.match(result.error, /personally/i);
});

check("drafts are internal skeletons with visible unfinished slots", () => {
  const issue = normalizeSupportIssue({ title: "Refund question", summary: "I was double charged, refund please asap", contact_email: "dana@example.com" }, { now: nowFn });
  const result = prepareSupportDraftReply(issue, { now: nowFn });
  assert.equal(result.ok, true);
  assert.equal(result.issue.status, "drafted");
  assert.match(result.issue.draft_reply, /^Hi dana,/);
  assert.match(result.issue.draft_reply, /\[Add the specific answer here\.\]/, "unfinished slot is visible");
  assert.match(result.issue.history[0].note, /Nothing was sent/);
});

check("status transitions are validated and resolution is stamped", () => {
  const issue = normalizeSupportIssue({ title: "x", summary: "hello" }, { now: nowFn });
  const bad = transitionSupportIssue([issue], { id: issue.id, status: "made_up", now: nowFn });
  assert.equal(bad.ok, false);
  const resolved = transitionSupportIssue([issue], { id: issue.id, status: "resolved", actor: "roger", now: nowFn });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.issue.resolved_by, "roger");
  assert.equal(resolved.issue.resolved_at, NOW);
  const reopened = transitionSupportIssue(resolved.issues, { id: issue.id, status: "open", now: nowFn });
  assert.equal(reopened.ok, true, "resolved can reopen");
  const closed = transitionSupportIssue(resolved.issues, { id: issue.id, status: "closed", now: nowFn });
  const stuck = transitionSupportIssue(closed.issues, { id: issue.id, status: "open", now: nowFn });
  assert.equal(stuck.ok, false, "closed is terminal");
});

check("growth-inbox conversion produces the canonical support shape", () => {
  const item = normalizeGrowthInboxItem({ rawText: "Customer says: what are my rights after my conviction? urgent!" }, { now: NOW });
  const converted = convertGrowthInboxItem(item, "support_issue", { now: NOW });
  const record = converted.convertedRecord.record;
  assert.equal(converted.convertedRecord.collection, "supportIssues");
  assert.equal(record.upl_sensitive, true);
  assert.equal(record.urgency, "urgent");
  assert(SUPPORT_STATUSES.includes(record.status));
});

check("the queue projection puts sensitive and urgent support first", () => {
  const state = {
    supportIssues: [
      normalizeSupportIssue({ id: "support-upl", title: "About my case", summary: "what are my rights?" }, { now: nowFn }),
      normalizeSupportIssue({ id: "support-urgent", title: "Double charged", summary: "charged twice, asap please" }, { now: nowFn }),
      normalizeSupportIssue({ id: "support-normal", title: "Address change", summary: "how do I update my address" }, { now: nowFn })
    ]
  };
  const projected = projectCompanyMemory(state, { env: {}, now: nowFn }).state;
  const support = projected.queueItems.filter((q) => q.type === "support");
  const upl = support.find((q) => q.sourceRef?.itemId === "support-upl");
  const urgent = support.find((q) => q.sourceRef?.itemId === "support-urgent");
  const normal = support.find((q) => q.sourceRef?.itemId === "support-normal");
  assert.equal(upl.riskLevel, "dangerous");
  assert.match(upl.recommendation, /legal advice/i);
  assert.equal(urgent.riskLevel, "caution");
  assert(upl.priority < urgent.priority && urgent.priority < normal.priority, "sensitive first, urgent second");
  assert.deepEqual(upl.sourceLink, { kind: "page", target: "#support" });
});

check("dedupe by id on upsert", () => {
  const a = normalizeSupportIssue({ id: "support-1", title: "One", summary: "first" }, { now: nowFn });
  const b = { ...a, summary: "updated" };
  const merged = upsertSupportIssues([a], [b], { now: nowFn });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].summary, "updated");
});

const moduleSource = readFileSync(new URL("./support-desk.mjs", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

check("the support module has no send path at all", () => {
  assert(!/fetch\(|sendgrid|smtp|mailto|https?:\/\//i.test(moduleSource), "no network or mail references in support-desk.mjs");
});

check("the support routes persist with scoped writes and record the agent run", () => {
  const intakeAt = serverSource.indexOf('url.pathname === "/api/support/intake"');
  assert(intakeAt >= 0, "intake route exists");
  const actionAt = serverSource.indexOf("/^\\/api\\/support\\/([^/]+)\\/(draft|transition)$/");
  assert(actionAt >= 0, "draft/transition routes exist");
  const block = serverSource.slice(intakeAt, serverSource.indexOf('url.pathname === "/api/growth-inbox"', intakeAt));
  assert(block.includes("writeCollections"), "scoped writes only");
  assert(!block.includes("writeState("), "never a full-state write");
  assert(block.includes("agentRuns: nextState.agentRuns"), "draft prep records an agent run");
  assert(block.includes("Nothing was sent"), "copy tells the truth");
});

check("the support page carries triage lanes and sendless controls", () => {
  for (const marker of ["Needs you first", "Drafts ready to review", "Prepare draft reply", "Copy reply", "supportIntake(event)", "nothing sends from here"]) {
    assert(serverSource.includes(marker), `page has: ${marker}`);
  }
  assert(serverSource.includes("May ask for legal advice"), "UPL chip present");
});

console.log(`\ntest-support-desk: all ${passed} checks passed.`);
