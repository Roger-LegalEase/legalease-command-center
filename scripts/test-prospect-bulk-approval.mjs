// Bulk prospect approval — the set-based selection and the one confirmed decision.
//
// What is proven:
//   1. Selection is pending-only, ranked, and filterable by segment, source, score and text —
//      and reports the exact counts the confirmation sentence needs BEFORE anything is decided.
//   2. The decision applies to the EXACT reviewed id list: only pending rows change, everything
//      else is skipped and counted, never silently decided.
//   3. Approval is still not reachable by engine code — the structural lockout is untouched.
//   4. The surface carries one explicit confirmation naming exact counts, and no bulk path
//      bypasses it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyBulkProspectDecision,
  describeProspectApproval,
  normalizeProspectFilter,
  selectPendingProspects
} from "./prospect-selection.mjs";

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

const NOW = "2026-07-26T21:30:00.000Z";

const candidate = (id, over = {}) => ({
  id,
  type: "prospect_candidate",
  organization_name: `Org ${id}`,
  classification: "legal_aid",
  score: 40,
  source: "irs_bmf",
  review_state: "pending_review",
  city: "Jackson",
  state: "MS",
  ntee_label: "Legal services",
  email: "",
  ...over
});

const fixture = () => ({
  prospectCandidates: [
    candidate("a", { score: 45, classification: "legal_aid", source: "irs_bmf" }),
    candidate("b", { score: 42, classification: "nonprofit", source: "lsc_grantees", state: "TX", city: "Austin" }),
    candidate("c", { score: 42, classification: "nonprofit", source: "irs_bmf", organization_name: "Aardvark Reentry" }),
    candidate("d", { score: 30, classification: "legal_aid", source: "lsc_grantees", email: "intake@example.org" }),
    candidate("e", { score: 44, review_state: "approved" }),
    candidate("f", { score: 44, review_state: "rejected" }),
    candidate("g", { score: 44, review_state: "promoted" })
  ]
});

// ---------------------------------------------------------------------------------------------
// 1. Selection
// ---------------------------------------------------------------------------------------------

check("selection is pending-only: approved, rejected and promoted rows can never be selected", () => {
  const view = selectPendingProspects(fixture());
  assert.equal(view.pendingTotal, 4);
  assert.equal(view.matched, 4);
  assert.ok(!view.rows.some((row) => ["e", "f", "g"].includes(row.id)),
    "a decided row must not reappear in any selection");
});

check("the list is ranked: score descending, ties broken by name, stable for review", () => {
  const view = selectPendingProspects(fixture());
  assert.deepEqual(view.rows.map((row) => row.id), ["a", "c", "b", "d"],
    "45 first, then the 42-tie in name order (Aardvark before Org b), then 30");
});

check("segment, source, score and text filters each narrow the selection", () => {
  const bySegment = selectPendingProspects(fixture(), { classification: "nonprofit" });
  assert.deepEqual(bySegment.rows.map((row) => row.id), ["c", "b"]);
  const bySource = selectPendingProspects(fixture(), { source: "lsc_grantees" });
  assert.deepEqual(bySource.rows.map((row) => row.id).sort(), ["b", "d"]);
  const byScore = selectPendingProspects(fixture(), { minScore: 42 });
  assert.deepEqual(byScore.rows.map((row) => row.id), ["a", "c", "b"]);
  const byText = selectPendingProspects(fixture(), { q: "aardvark" });
  assert.deepEqual(byText.rows.map((row) => row.id), ["c"]);
  const byState = selectPendingProspects(fixture(), { stateCode: "tx" });
  assert.deepEqual(byState.rows.map((row) => row.id), ["b"]);
});

check("the selection reports the exact counts the confirmation needs", () => {
  const view = selectPendingProspects(fixture());
  assert.equal(view.withEmail, 1, "only d has an address on file");
  assert.deepEqual(view.byClassification, { legal_aid: 2, nonprofit: 2 });
  assert.deepEqual(view.bySource, { irs_bmf: 2, lsc_grantees: 2 });
});

check("filter normalization tolerates blanks and junk without widening the selection", () => {
  const filter = normalizeProspectFilter({ minScore: "", maxScore: "not-a-number", classification: "  Legal_Aid " });
  assert.equal(filter.minScore, null);
  assert.equal(filter.maxScore, null);
  assert.equal(filter.classification, "legal_aid");
});

// ---------------------------------------------------------------------------------------------
// 2. The decision
// ---------------------------------------------------------------------------------------------

check("approval changes exactly the reviewed pending ids, stamps who and when", () => {
  const result = applyBulkProspectDecision(fixture().prospectCandidates, ["a", "b"], {
    decision: "approved", actorLabel: "owner", now: NOW
  });
  assert.equal(result.changed, 2);
  assert.equal(result.skipped, 0);
  const byId = new Map(result.candidates.map((row) => [row.id, row]));
  assert.equal(byId.get("a").review_state, "approved");
  assert.equal(byId.get("a").approved_by, "owner");
  assert.equal(byId.get("a").approved_at, NOW);
  assert.equal(byId.get("c").review_state, "pending_review", "unreviewed rows are untouched");
});

check("non-pending and unknown ids are skipped and COUNTED, never silently decided", () => {
  const result = applyBulkProspectDecision(fixture().prospectCandidates, ["a", "e", "f", "ghost"], {
    decision: "approved", now: NOW
  });
  assert.equal(result.changed, 1, "only the pending row changes");
  assert.equal(result.skipped, 3, "already-approved, already-rejected and unknown all count as skipped");
  const byId = new Map(result.candidates.map((row) => [row.id, row]));
  assert.equal(byId.get("f").review_state, "rejected", "a rejected row cannot be re-decided by a stale selection");
});

check("an empty selection decides nothing", () => {
  const result = applyBulkProspectDecision(fixture().prospectCandidates, [], { decision: "approved", now: NOW });
  assert.equal(result.changed, 0);
  assert.equal(result.requested, 0);
  assert.deepEqual(result.candidates.map((row) => row.review_state), fixture().prospectCandidates.map((row) => row.review_state));
});

check("rejection is symmetric and stamps its own fields", () => {
  const result = applyBulkProspectDecision(fixture().prospectCandidates, ["d"], {
    decision: "rejected", actorLabel: "owner", now: NOW
  });
  const row = result.candidates.find((entry) => entry.id === "d");
  assert.equal(row.review_state, "rejected");
  assert.equal(row.rejected_by, "owner");
  assert.equal(row.approved_at, undefined);
});

check("the classification override applies only to rows actually approved", () => {
  const result = applyBulkProspectDecision(fixture().prospectCandidates, ["a", "e"], {
    decision: "approved", classification: "reentry_program", now: NOW
  });
  const byId = new Map(result.candidates.map((row) => [row.id, row]));
  assert.equal(byId.get("a").classification, "reentry_program");
  assert.equal(byId.get("e").classification, "legal_aid", "a skipped row keeps its classification");
});

// ---------------------------------------------------------------------------------------------
// 3. The structural lockout is untouched
// ---------------------------------------------------------------------------------------------

check("engine code still cannot write approved — bulk changed the caller count, not the rule", async () => {
  const { engineSetReviewState } = await import("./prospect-discovery.mjs");
  assert.throws(() => engineSetReviewState(candidate("x"), "approved"),
    /approved.*human|human.*approved/is,
    "the self-approval lockout must survive the bulk path");
});

// ---------------------------------------------------------------------------------------------
// 4. The confirmation contract
// ---------------------------------------------------------------------------------------------

check("the confirmation sentence names exact counts and what approval does NOT do", () => {
  const zero = describeProspectApproval(313, 0);
  assert.match(zero, /^Approve 313 organisations for partner outreach\?/);
  assert.match(zero, /makes nobody contactable by itself/i);
  assert.match(zero, /every outreach gate still appl/i);
  const some = describeProspectApproval(1, 1);
  assert.match(some, /^Approve 1 organisation for partner outreach\?/);
  assert.match(some, /1 of them has an email address on file/);
});

check("the surface wires one explicit confirmation and the reviewed-ids contract", () => {
  const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  // The bulk decision goes through window.confirm with the exact-count sentence...
  assert.ok(source.includes("if (!window.confirm(message)) return;"),
    "the decision must be gated on one explicit confirmation");
  assert.ok(source.includes("makes nobody contactable by itself"),
    "the confirmation must carry the honest contactable count");
  // ...the POST sends the explicit reviewed id list, never a filter...
  assert.ok(source.includes('await api(route, { method: "POST", body: JSON.stringify({ ids })'),
    "approval must post the exact reviewed ids");
  assert.ok(!/api\/prospects\/approve[^\n]*filter/.test(source),
    "no approval call may pass a filter to be re-evaluated server-side");
  // ...rows are individually removable and the count is shown before confirming...
  assert.ok(source.includes('data-prospect-id="${esc(row.id)}"') || source.includes("data-prospect-id"),
    "each row must be individually checkable");
  assert.ok(source.includes('id="prospect-selection-count"'), "the live selection count must be visible");
  // ...and the server endpoints run the same tested module.
  assert.ok(source.includes("applyBulkProspectDecision(serverList(currentState.prospectCandidates), ids"),
    "both endpoints must apply decisions through the shared tested module");
  assert.ok(source.includes("selectPendingProspects(currentState"),
    "the read-only selection endpoint must use the shared module");
});

console.log(`Prospect bulk approval: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
