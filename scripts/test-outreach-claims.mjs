// B2 outreach claim-before-send tests (activation run 2026-07-09, mirrors PR #40 for B1).
// Proves the cold-outreach idempotency boundary that did not exist before:
//   1. outreachSendClaims registered (coreStateCollections), append-only, never singleton,
//      and present in OUTREACH_COLLECTIONS.
//   2. Two CONCURRENT act() invocations over the same approved queue produce exactly ONE send
//      per (campaign, contact, step); the loser skips silently and logs the skip.
//   3. Failure path: a transport error marks the claim FAILED (kept forever) and REJECTS the
//      queue item; a later run does NOT re-send (the old leave-approved retry is gone).
//   4. Duplicate approved queue items for one contact yield ONE send (in-tick dedupe + claim).
//   5. Fail closed: live-send-capable invocation without a claim path sends NOTHING.
//   6. A claim-write failure blocks the send; the item stays approved, nothing sent.
//   7. Dry-run posture unchanged: gate off => dry_run attempts, ZERO claims burned.
// No live database, no network: transports and ledgers are mocks. Nothing here sends.

import assert from "node:assert";

process.env.COMMAND_CENTER_DATA_PATH = "/tmp/leos-outreach-claims-test/data.json";
process.env.COMMAND_CENTER_SEED_PATH = "/tmp/leos-outreach-claims-test/seed-does-not-exist.json";

const { coreStateCollections, singletonCollections, appendOnlyCollections } = await import("./storage.mjs");
const {
  OUTREACH_CLAIMS_COLLECTION, OUTREACH_COLLECTIONS, outreachClaimId,
  actOutreach, outreachConfigOf
} = await import("./outreach-os.mjs");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Outreach send-claim tests");

// ---- 1. registration -------------------------------------------------------------------------
{
  assert(coreStateCollections.includes(OUTREACH_CLAIMS_COLLECTION),
    "outreachSendClaims must be in coreStateCollections or Supabase silently drops it");
  assert(OUTREACH_COLLECTIONS.includes(OUTREACH_CLAIMS_COLLECTION), "must be in OUTREACH_COLLECTIONS");
  assert(!singletonCollections.has(OUTREACH_CLAIMS_COLLECTION), "claims are a list, not a singleton");
  assert(appendOnlyCollections.has(OUTREACH_CLAIMS_COLLECTION),
    "claims must be append-only: reconcile-delete would re-open the duplicate-send window");
  ok("outreachSendClaims registered, list-shaped, append-only");
}

// ---- fixtures ---------------------------------------------------------------------------------
const ENV = { OUTREACH_LIVE_SEND: "true", SENDGRID_API_KEY: "SG.fake" };
const IN_WINDOW = new Date("2026-07-01T15:00:00Z"); // Wed 11:00 ET

function compliantMessage(to, step = 1) {
  return {
    to,
    from: "roger@example.com",
    subject: "Operational walkthrough",
    classification: "nonprofit",
    step_number: step,
    postalAddress: "8 The Green, Suite D, Dover, DE 19901",
    unsubscribeUrl: "https://example.com/u/x",
    text: `Hi there,\n\nShort operational note.\n\nRoger\n\nLegalEase, 8 The Green, Suite D, Dover, DE 19901\nUnsubscribe: https://example.com/u/x`,
    html: `<p>Hi</p><p><a href="https://example.com/u/x">Unsubscribe</a></p><p>8 The Green, Suite D, Dover, DE 19901</p>`,
    headers: { "List-Unsubscribe": "<https://example.com/u/x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  };
}

function queueItem(i, over = {}) {
  return {
    id: `outreach-q-test-${i}`,
    type: "outreach_message",
    status: "approved",
    contact_id: `oc-${i}`,
    campaign_id: "rcap-outreach-1",
    step_number: 1,
    classification: "nonprofit",
    to: `person${i}@org${i}.example.org`,
    message: compliantMessage(`person${i}@org${i}.example.org`),
    ...over
  };
}

function armedState(n = 3, extraQueue = []) {
  return {
    approvalQueue: [...Array.from({ length: n }, (_, i) => queueItem(i)), ...extraQueue],
    outreachContacts: Array.from({ length: n }, (_, i) => ({ contact_id: `oc-${i}`, email: `person${i}@org${i}.example.org` })),
    outreachOrganizations: [],
    outreachAttempts: [],
    outreachSuppressions: [],
    outreachBounces: [],
    outreachUnsubscribes: [],
    outreachSendClaims: [],
    outreachConfig: {}
  };
}

function claimLedger() {
  const rows = new Map();
  return {
    rows,
    fn: async (claims) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const inserted = [];
      const skipped = [];
      for (const claim of claims) {
        if (rows.has(claim.id)) { skipped.push(claim); continue; }
        rows.set(claim.id, { ...claim });
        inserted.push(claim);
      }
      return { inserted, skipped };
    }
  };
}

function mockTransport() {
  const sends = [];
  return {
    sends,
    fn: async (message) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      sends.push(message.to);
      return { status: "sent", provider: "mock", provider_message_id: `mid-${sends.length}` };
    }
  };
}

// The outreach queue TYPE constant lives inside outreach-os; assert the fixture type matches
// what actOutreach filters on by checking a send actually happens in test 2.

// ---- 2. concurrent double invocation => one send per (contact, step) --------------------------
{
  const state = armedState(3);
  const ledger = claimLedger();
  const transport = mockTransport();
  const ctx = { env: ENV, now: IN_WINDOW, claimOutreachSends: ledger.fn, runOutreachSend: transport.fn };
  const [a, b] = await Promise.all([actOutreach(state, ctx), actOutreach(state, ctx)]);
  assert.equal(transport.sends.length, 3, `3 unique sends expected, got ${transport.sends.length} (check OUTREACH_QUEUE_TYPE fixture)`);
  assert.equal(new Set(transport.sends).size, 3, "no recipient received a duplicate");
  const skips = [...a.results, ...b.results].filter((r) => r.reason === "already_claimed_concurrent");
  assert.equal(skips.length, 3, "the losing invocation skipped silently and logged every skip");
  assert.equal(ledger.rows.size, 3, "one claim per (contact, step)");
  const resolved = [...a.state.outreachSendClaims, ...b.state.outreachSendClaims].filter((c) => c.status === "sent");
  assert.equal(resolved.length, 3, "winner marked its claims sent with the message id");
  assert(resolved.every((c) => c.provider_message_id.startsWith("mid-")));
  ok("concurrent double invocation: one send per (contact, step), loser skips and logs");
}

// ---- 3. transport failure: claim failed + queue item rejected, no retry -----------------------
{
  const state = armedState(2);
  const ledger = claimLedger();
  const failingTransport = async (message) => {
    if (message.to.startsWith("person0@")) throw new Error("SendGrid timeout");
    return { status: "sent", provider: "mock", provider_message_id: "mid-ok" };
  };
  const first = await actOutreach(state, { env: ENV, now: IN_WINDOW, claimOutreachSends: ledger.fn, runOutreachSend: failingTransport });
  const failedClaim = first.state.outreachSendClaims.find((c) => c.to.startsWith("person0@"));
  assert(failedClaim, "claim for the failed send exists");
  assert.equal(failedClaim.status, "failed");
  assert(failedClaim.reason.includes("SendGrid timeout"));
  const failedItem = first.state.approvalQueue.find((q) => q.contact_id === "oc-0");
  assert.equal(failedItem.status, "rejected", "the old leave-approved silent retry is GONE");
  assert(failedItem.reject_reason.startsWith("send_error:"));
  // Re-run over the resulting state: nothing approved remains for oc-0, and even a manually
  // re-approved duplicate is blocked by the claim.
  const retry = mockTransport();
  const reapproved = {
    ...first.state,
    approvalQueue: first.state.approvalQueue.map((q) => (q.contact_id === "oc-0" ? { ...q, status: "approved" } : q))
  };
  const second = await actOutreach(reapproved, { env: ENV, now: IN_WINDOW, claimOutreachSends: ledger.fn, runOutreachSend: retry.fn });
  assert(!retry.sends.some((to) => to.startsWith("person0@")), "a failed claim is NEVER silently re-sent");
  assert(second.results.some((r) => r.reason === "already_claimed"), "the skip is logged");
  const rejectedAgain = second.state.approvalQueue.find((q) => q.contact_id === "oc-0");
  assert.equal(rejectedAgain.status, "rejected", "the duplicate item is rejected so it stops replaying");
  ok("transport failure: claim failed, queue item rejected, re-approval cannot double-send");
}

// ---- 4. duplicate approved items for one contact => one send ----------------------------------
{
  const dup = queueItem(0, { id: "outreach-q-test-dup" });
  const state = armedState(2, [dup]);
  const ledger = claimLedger();
  const transport = mockTransport();
  const result = await actOutreach(state, { env: ENV, now: IN_WINDOW, claimOutreachSends: ledger.fn, runOutreachSend: transport.fn });
  assert.equal(transport.sends.filter((to) => to.startsWith("person0@")).length, 1, "duplicate items produce ONE send");
  assert.equal(transport.sends.length, 2);
  assert(result.results.some((r) => r.reason === "duplicate_contact_in_tick"));
  assert.equal(ledger.rows.size, 2);
  ok("duplicate approved queue items: one claim, one send, skip logged");
}

// ---- 5. fail closed without a claim path ------------------------------------------------------
{
  const transport = mockTransport();
  const result = await actOutreach(armedState(2), { env: ENV, now: IN_WINDOW, runOutreachSend: transport.fn });
  assert.equal(transport.sends.length, 0, "no durable claim path => zero SendGrid calls");
  assert(result.results.length >= 2 && result.results.every((r) => r.status === "not_sent" && r.reason === "no_claim_path"));
  assert(result.state.approvalQueue.every((q) => q.status === "approved"), "items stay approved for a correctly wired tick");
  ok("no claim path: live send fails closed, nothing reaches the transport");
}

// ---- 6. claim-write failure blocks the send ----------------------------------------------------
{
  const transport = mockTransport();
  const result = await actOutreach(armedState(2), {
    env: ENV, now: IN_WINDOW, runOutreachSend: transport.fn,
    claimOutreachSends: async () => { throw new Error("supabase down"); }
  });
  assert.equal(transport.sends.length, 0);
  assert(result.results.every((r) => r.status === "error" && r.reason.startsWith("claim_write_failed:")));
  assert(result.state.approvalQueue.every((q) => q.status === "approved"), "nothing happened; items remain approved");
  ok("claim-write failure: fail closed, the ledger is the permission to send");
}

// ---- 7. dry-run posture unchanged: gate off burns zero claims ---------------------------------
{
  const ledger = claimLedger();
  const transport = mockTransport();
  const result = await actOutreach(armedState(2), {
    env: { OUTREACH_LIVE_SEND: "false", SENDGRID_API_KEY: "SG.fake" },
    now: IN_WINDOW, claimOutreachSends: ledger.fn, runOutreachSend: async (m) => ({ status: "dry_run", provider: "none" })
  });
  assert(result.state.outreachAttempts.length === 2 && result.state.outreachAttempts.every((a) => a.status === "dry_run"));
  assert.equal(ledger.rows.size, 0, "dry runs never consume durable claims");
  assert.equal(result.state.outreachSendClaims.length, 0);
  ok("dry-run path records attempts but burns no claims");
}

// claim id determinism
{
  assert.equal(outreachClaimId("c1", "k1", 2), "outreach-claim-c1-k1-step-2");
  ok("claim id format is deterministic");
}

console.log(`\nAll ${passed} outreach send-claim tests passed.`);
