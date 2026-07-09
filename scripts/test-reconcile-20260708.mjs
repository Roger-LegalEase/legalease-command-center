// Tests for the 2026-07-08 ledger reconciliation script (Phase B PR 3).
// Small synthetic fixture with the same SHAPES as the incident data (duplicates, a drop, a
// missing bounce suppression, a missing unsubscribe suppression, June prior touches), guards
// overridden to fixture scale. Verifies:
//   1. touch identity: prior June touch => step 2; fresh => step 1
//   2. duplicate recipients: one counted touch, copies annotated, first message id recorded
//   3. the SendGrid drop is corrected to status dropped, never counted as a touch
//   4. claims backfill reuses reactivationClaimId exactly, one claim per (contact, step),
//      drop claim marked failed
//   5. suppression inserts are ONLY the mandatory classes (bounced, unsubscribed)
//   6. apply is idempotent (second run inserts nothing) and performs ZERO deletes
//   7. campaign singleton and contacts are never written
// No network, no live database: fetch is stubbed like test-reactivation-claims.mjs.

import assert from "node:assert";

process.env.SUPABASE_URL = "http://fake-supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STORAGE_BACKEND = "supabase";
process.env.LOCAL_DEMO_MODE = "false";

const table = new Map();
const k = (c, i) => `${c}\0${i}`;
const requests = [];
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = (opts.method || "GET").toUpperCase();
  const prefer = String((opts.headers || {}).prefer || (opts.headers || {}).Prefer || "");
  requests.push({ method, url: String(url), prefer });
  const ok = (text) => ({ ok: true, status: 200, statusText: "OK", async text() { return text; } });
  const collectionParam = (u.searchParams.get("collection") || "").replace(/^eq\./, "");
  if (method === "GET") {
    const all = [...table.values()].filter((r) => !collectionParam || r.collection === collectionParam);
    const offset = Number(u.searchParams.get("offset") || 0);
    const limit = Number(u.searchParams.get("limit") || all.length);
    return ok(JSON.stringify(all.slice(offset, offset + limit)));
  }
  if (method === "POST") {
    const rows = JSON.parse(opts.body || "[]");
    const inserted = [];
    for (const row of rows) {
      const key = k(row.collection, row.item_id);
      if (prefer.includes("ignore-duplicates")) { if (table.has(key)) continue; table.set(key, row); inserted.push(row); }
      else table.set(key, row);
    }
    if (prefer.includes("return=representation")) {
      const select = (u.searchParams.get("select") || "").split(",").filter(Boolean);
      return ok(JSON.stringify(select.length ? inserted.map((r) => Object.fromEntries(select.map((c) => [c, r[c]]))) : inserted));
    }
    return ok("");
  }
  if (method === "PATCH") {
    const itemId = (u.searchParams.get("item_id") || "").replace(/^eq\./, "");
    const body = JSON.parse(opts.body || "{}");
    const key = k(collectionParam, itemId);
    if (table.has(key)) table.set(key, { ...table.get(key), ...body });
    return ok("");
  }
  if (method === "DELETE") {
    return { ok: false, status: 500, statusText: "deletes are forbidden in this test", async text() { return "no deletes"; } };
  }
  return { ok: false, status: 405, statusText: "nope", async text() { return ""; } };
};

const { computeReconciliation, applyReconciliation, parseCsv } = await import("./reconcile-20260708-sendgrid-ledger.mjs");
const { createStore } = await import("./storage.mjs");
const { reactivationClaimId, REACTIVATION_CAMPAIGN_ID } = await import("./reactivation-os.mjs");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Reconciliation script tests");

// ---- fixture: 3 recipients at 12:00 (one duplicated, one dropped), 2 at 15:00 (one June-touched)
const CSV = `"processed","message_id","event","recv_message_id","email","type","reason"
"2026-07-08 12:00:20.000","full-a1.x","processed","short-a1","dup@x.com","",""
"2026-07-08 12:00:22.000","full-a2.x","processed","short-a2","dup@x.com","",""
"2026-07-08 12:00:24.000","full-b1.x","processed","short-b1","solo@x.com","",""
"2026-07-08 12:00:26.000","full-c1.x","drop","short-c1","gone@bad.comm","","Bounced Address"
"2026-07-08 12:00:30.000","full-a1.x","delivered","short-a1","dup@x.com","",""
"2026-07-08 12:00:31.000","full-a2.x","delivered","short-a2","dup@x.com","",""
"2026-07-08 12:00:32.000","full-b1.x","delivered","short-b1","solo@x.com","",""
"2026-07-08 15:00:34.000","full-d1.x","processed","short-d1","fresh15@x.com","",""
"2026-07-08 15:00:35.000","full-e1.x","processed","short-e1","june15@x.com","",""
"2026-07-08 15:01:00.000","full-f1.x","bounce","short-f1","bounced@x.com","bounce","550 no mailbox"
`;
const events = parseCsv(CSV);

const contacts = [
  { contact_id: "react-dup", email: "dup@x.com", wave: 1, enrolled_at: "2026-06-28T12:00:00Z" },
  { contact_id: "react-solo", email: "solo@x.com", wave: 1, enrolled_at: "2026-06-28T12:00:00Z" },
  { contact_id: "react-gone", email: "gone@bad.comm", wave: 1, enrolled_at: "2026-06-28T12:00:00Z" },
  { contact_id: "react-fresh15", email: "fresh15@x.com", wave: 2, enrolled_at: "2026-06-28T12:00:00Z" },
  { contact_id: "react-june15", email: "june15@x.com", wave: 1, enrolled_at: "2026-06-28T12:00:00Z" },
  { contact_id: "react-bounced", email: "bounced@x.com", wave: 2, enrolled_at: "2026-06-28T12:00:00Z" },
  { contact_id: "react-unsub", email: "unsub@x.com", wave: 2, enrolled_at: "2026-06-28T12:00:00Z" }
];
// pre-existing ledger: one June touch for june15; synthetic recon rows for the 12:00 three
const attempts = [
  { id: "react-attempt-june1", contact_id: "react-june15", to: "june15@x.com", wave: 1, step_number: 1, status: "sent", provider: "sendgrid", provider_message_id: "june-mid", sent_date: "2026-06-29", created_at: "2026-06-29T17:35:00Z" },
  { id: "react-attempt-recon-a", contact_id: "react-dup", to: "dup@x.com", wave: 1, step_number: 1, status: "sent", provider: "sendgrid", provider_message_id: "", sent_date: "2026-07-08", created_at: "2026-07-08T12:00:08.242Z", reconciled: true },
  { id: "react-attempt-recon-b", contact_id: "react-solo", to: "solo@x.com", wave: 1, step_number: 1, status: "sent", provider: "sendgrid", provider_message_id: "", sent_date: "2026-07-08", created_at: "2026-07-08T12:00:08.242Z", reconciled: true },
  { id: "react-attempt-recon-c", contact_id: "react-gone", to: "gone@bad.comm", wave: 1, step_number: 1, status: "sent", provider: "sendgrid", provider_message_id: "", sent_date: "2026-07-08", created_at: "2026-07-08T12:00:08.242Z", reconciled: true }
];
const suppressions = [
  { id: "outreach-supp-jaime", email: "jaime.berrios@introba.com", reason: "unsubscribed", source: "one_click", created_at: "2026-07-08T16:10:19Z" },
  { id: "outreach-supp-gone", email: "gone@bad.comm", reason: "bounced", source: "manual", created_at: "2026-07-08T14:30:53Z" }
];
const unsubscribes = [
  { id: "unsub-row-1", email: "unsub@x.com", created_at: "2026-07-08T15:02:28Z" },
  { id: "unsub-row-2", email: "jaime.berrios@introba.com", created_at: "2026-07-08T16:10:19Z" }
];
const expected = {
  batch12Processed: 3, batch12Unique: 2, batch15Processed: 2, batch15Unique: 2,
  duplicatedRecipients: 1, reconRows: 3, juneAttempts: 1,
  dropEmail: "gone@bad.comm", step15Distribution: { 1: 1, 2: 1 }
};

const plan = computeReconciliation({ events, attempts, contacts, suppressions, unsubscribes, expected });

// ---- 1. touch identity ----
{
  const fresh = plan.attemptsInsert.find((a) => a.to === "fresh15@x.com");
  const june = plan.attemptsInsert.find((a) => a.to === "june15@x.com");
  assert.equal(fresh.step_number, 1);
  assert.equal(june.step_number, 2, "prior June touch makes the 15:00 send step 2");
  assert.equal(fresh.provider_message_id, "short-d1");
  assert.equal(fresh.sendgrid_message_id, "full-d1.x");
  assert.equal(fresh.created_at, "2026-07-08T15:00:34.000Z");
  assert.equal(fresh.source, "sendgrid-reconciliation");
  ok("15:00 inserts carry computed step, real ids, real timestamps, recon source");
}

// ---- 2. duplicate annotation ----
{
  const dup = plan.attemptsPatch.find((p) => p.current.to === "dup@x.com");
  assert.equal(dup.patch.duplicate_copies_processed, 2);
  assert.equal(dup.patch.duplicate_copies_delivered, 2);
  assert.equal(dup.patch.provider_message_id, "short-a1", "first copy's message id");
  const solo = plan.attemptsPatch.find((p) => p.current.to === "solo@x.com");
  assert.equal(solo.patch.duplicate_copies_processed, undefined, "non-duplicated rows get no dup annotation");
  assert.equal(solo.patch.provider_message_id, "short-b1");
  ok("duplicates annotated as one counted touch with copies noted");
}

// ---- 3. drop correction ----
{
  const drop = plan.attemptsPatch.find((p) => p.current.to === "gone@bad.comm");
  assert.equal(drop.patch.status, "dropped");
  assert(drop.patch.drop_reason.includes("Bounced Address"));
  ok("the SendGrid drop is corrected to dropped, not counted as a touch");
}

// ---- 4. claims backfill ----
{
  assert.equal(plan.claimsInsert.length, 6, "june 1 + 12:00 three + 15:00 two");
  const juneClaim = plan.claimsInsert.find((c) => c.contact_id === "react-june15" && c.step_number === 1);
  assert.equal(juneClaim.id, reactivationClaimId(REACTIVATION_CAMPAIGN_ID, "react-june15", 1), "exact live-path claim id format");
  const dropClaim = plan.claimsInsert.find((c) => c.contact_id === "react-gone");
  assert.equal(dropClaim.status, "failed");
  assert(dropClaim.reason.startsWith("sendgrid_drop:"));
  assert.equal(new Set(plan.claimsInsert.map((c) => c.id)).size, 6, "no claim id collisions");
  assert(plan.claimsInsert.every((c) => c.claimed_by === "sendgrid-reconciliation"));
  ok("claims backfill: live-path ids, one per (contact, step), drop claim failed");
}

// ---- 5. suppressions minimal and mandatory ----
{
  assert.equal(plan.suppressionsInsert.length, 2);
  const bounced = plan.suppressionsInsert.find((s) => s.email === "bounced@x.com");
  assert.equal(bounced.reason, "bounced");
  const unsub = plan.suppressionsInsert.find((s) => s.email === "unsub@x.com");
  assert.equal(unsub.reason, "unsubscribed");
  assert.equal(plan.suppressionsPatch.length, 1);
  assert(plan.suppressionsPatch[0].patch.first_unsubscribe_evidence.includes("12:00:56Z"));
  ok("suppression inserts are only the missing bounce and unsubscribe; jaime annotated");
}

// ---- 6/7. apply: idempotent, zero deletes, campaign and contacts untouched ----
{
  const store = createStore({});
  assert.equal(store.kind, "supabase");
  table.set(k("reactivationCampaign", "singleton"), { collection: "reactivationCampaign", item_id: "singleton", payload: { status: "paused" }, updated_at: "seed" });
  for (const p of [...plan.attemptsPatch]) table.set(k("reactivationAttempts", p.id), { collection: "reactivationAttempts", item_id: p.id, payload: p.current, updated_at: "seed" });
  for (const p of [...plan.suppressionsPatch]) table.set(k("outreachSuppressions", p.id), { collection: "outreachSuppressions", item_id: p.id, payload: p.current, updated_at: "seed" });
  requests.length = 0;
  const first = await applyReconciliation(plan, store);
  assert.equal(first.inserted.reactivationAttempts, 2);
  assert.equal(first.inserted.reactivationSendClaims, 6);
  assert.equal(first.inserted.outreachSuppressions, 2);
  assert.equal(first.patched.reactivationAttempts, 3);
  assert.equal(first.patched.outreachSuppressions, 1);
  const second = await applyReconciliation(plan, store);
  assert.equal(second.inserted.reactivationAttempts + second.inserted.reactivationSendClaims + second.inserted.outreachSuppressions, 0, "second apply inserts nothing");
  assert.equal(second.skipped.reactivationSendClaims, 6);
  assert(!requests.some((r) => r.method === "DELETE"), "zero deletes ever");
  assert(!requests.some((r) => r.url.includes("reactivationCampaign") && r.method !== "GET"), "campaign singleton never written");
  assert(!requests.some((r) => r.url.includes("reactivationContacts") && r.method !== "GET"), "contacts never written");
  assert.equal(table.get(k("reactivationCampaign", "singleton")).payload.status, "paused", "pause untouched by reconciliation");
  const patchedDup = table.get(k("reactivationAttempts", "react-attempt-recon-a")).payload;
  assert.equal(patchedDup.duplicate_copies_processed, 2, "patch landed");
  assert.equal(patchedDup.status, "sent", "duplicated recipient still one counted touch");
  ok("apply: correct counts, idempotent re-run, zero deletes, campaign and contacts untouched");
}

console.log(`\nAll ${passed} reconciliation script tests passed.`);
