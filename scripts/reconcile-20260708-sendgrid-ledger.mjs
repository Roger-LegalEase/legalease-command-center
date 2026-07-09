// Ledger reconciliation for the 2026-07-08 duplicate-send incident (Phase B PR 3).
// Source of truth: the final SendGrid activity export (authoritative per owner decision).
// See docs/incident-20260708-duplicate-sends.md and docs/phaseb-20260709-run.md.
//
// What it does, and ONLY what it does:
//   1. INSERT the 146 lost 15:00Z attempt rows (real message ids and timestamps, touch identity
//      computed from each contact's prior ledger), marked source: sendgrid-reconciliation.
//   2. PATCH the 95 synthetic 12:00Z recon rows: real message ids; the 33 duplicate-affected
//      recipients annotated as one counted touch with copies processed/delivered noted; the one
//      SendGrid drop (dcalmesejr@gmai.com) corrected from "sent" to "dropped".
//   3. INSERT backfill claims into reactivationSendClaims for every real historical send, using
//      the SAME deterministic claim id the live send path uses (reactivationClaimId), so the
//      PR 1 safety ledger covers pre-claims history too.
//   4. INSERT the two missing mandatory suppressions (one hard bounce, one unsubscribe) and
//      annotate the jaime.berrios suppression row with the recovered 12:01Z first-unsubscribe
//      evidence. Suppressions stay minimal: unsubscribes (legal) and undeliverable addresses.
//
// What it can NEVER do: no deletes of any kind, no campaign singleton writes (pause/unpause is
// NOT this script's job), no contact-row writes, no sends, no gate changes. All inserts are
// conditional (unique-key ignore-duplicates), so re-running is safe and idempotent.
//
// Usage:
//   node scripts/reconcile-20260708-sendgrid-ledger.mjs --export <csv> --plan <diff.json>
//   node scripts/reconcile-20260708-sendgrid-ledger.mjs --export <csv> --apply --yes-write-prod
//
// --plan computes the full row-level diff and writes it to the given path, touching nothing.
// --apply requires the explicit --yes-write-prod flag, applies the same computed diff via
// conditional inserts and per-row scoped PATCHes, then re-reads everything and verifies
// row-for-row before reporting success.

import { readFile, writeFile } from "node:fs/promises";
import { createStore, supabaseRestRequest } from "./storage.mjs";
import { reactivationClaimId, REACTIVATION_CAMPAIGN_ID } from "./reactivation-os.mjs";

const RECORDS_TABLE = "leos_core_records";
const INCIDENT_DATE = "2026-07-08";
// Settled incident facts used as abort guards. If the data does not match these, something
// fundamental changed and a human must look before any write happens.
const DEFAULT_EXPECTED = {
  batch12Processed: 149,
  batch12Unique: 94,
  batch15Processed: 146,
  batch15Unique: 146,
  duplicatedRecipients: 33,
  reconRows: 95,
  juneAttempts: 186,
  dropEmail: "dcalmesejr@gmai.com",
  step15Distribution: { 1: 117, 2: 29 }
};

const norm = (v = "") => String(v || "").trim().toLowerCase();
const nowIso = () => new Date().toISOString();
// Fixed stamp for rows this reconciliation creates, so --plan output is deterministic and the
// committed diff is byte-identical to what --apply writes.
const RECONCILIATION_STAMP = "2026-07-09T11:00:00.000Z";

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const toIso = (sgTimestamp) => sgTimestamp.replace(" ", "T") + "Z"; // "2026-07-08 15:00:34.000" is UTC

async function pullCollection(collection) {
  const out = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const rows = await supabaseRestRequest(
      `${RECORDS_TABLE}?collection=eq.${collection}&select=item_id,payload,updated_at&order=item_id.asc&offset=${offset}&limit=${page}`
    );
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

// Pure diff computation from the export plus current prod rows. Throws on any mismatch with the
// settled incident facts. Returns { attemptsInsert, attemptsPatch, claimsInsert,
// suppressionsInsert, suppressionsPatch, summary }.
export function computeReconciliation({ events, attempts, contacts, suppressions, unsubscribes, expected }) {
  const assert = (cond, msg) => { if (!cond) throw new Error("GUARD FAILED: " + msg); };
  const EXPECTED = expected || DEFAULT_EXPECTED;

  const processed = events.filter((e) => e.event === "processed" && e.processed.startsWith(INCIDENT_DATE));
  const batch12 = processed.filter((e) => e.processed < `${INCIDENT_DATE} 13:00`);
  const batch15 = processed.filter((e) => e.processed >= `${INCIDENT_DATE} 15:00` && e.processed < `${INCIDENT_DATE} 16:00`);
  assert(batch12.length + batch15.length === processed.length, "unexpected 07-08 processed events outside the 12:00 and 15:00 batches");
  assert(batch12.length === EXPECTED.batch12Processed, `12:00 processed ${batch12.length} != ${EXPECTED.batch12Processed}`);
  assert(batch15.length === EXPECTED.batch15Processed, `15:00 processed ${batch15.length} != ${EXPECTED.batch15Processed}`);

  const byEmail12 = new Map();
  for (const e of batch12) {
    const k = norm(e.email);
    if (!byEmail12.has(k)) byEmail12.set(k, []);
    byEmail12.get(k).push(e);
  }
  const byEmail15 = new Map();
  for (const e of batch15) {
    const k = norm(e.email);
    if (!byEmail15.has(k)) byEmail15.set(k, []);
    byEmail15.get(k).push(e);
  }
  assert(byEmail12.size === EXPECTED.batch12Unique, `12:00 unique ${byEmail12.size} != ${EXPECTED.batch12Unique}`);
  assert(byEmail15.size === EXPECTED.batch15Unique, `15:00 unique ${byEmail15.size} != ${EXPECTED.batch15Unique}`);
  assert([...byEmail15.values()].every((l) => l.length === 1), "15:00 batch must have zero duplicates");
  assert([...byEmail15.keys()].every((k) => !byEmail12.has(k)), "12:00 and 15:00 batches must not overlap");
  const dups12 = [...byEmail12.entries()].filter(([, l]) => l.length > 1);
  assert(dups12.length === EXPECTED.duplicatedRecipients, `duplicated recipients ${dups12.length} != ${EXPECTED.duplicatedRecipients}`);

  const drops = events.filter((e) => e.event === "drop");
  assert(drops.length === 1 && norm(drops[0].email) === EXPECTED.dropEmail, "expected exactly one drop event for " + EXPECTED.dropEmail);
  const dropEvent = drops[0];

  const deliveredCount = (email) =>
    events.filter((e) => e.event === "delivered" && e.processed.startsWith(INCIDENT_DATE) && norm(e.email) === email).length;

  const contactByEmail = new Map(contacts.map((c) => [norm(c.email), c]));
  const reconRows = attempts.filter((a) => String(a.id || "").startsWith("react-attempt-recon"));
  const juneRows = attempts.filter((a) => !String(a.id || "").startsWith("react-attempt-recon"));
  assert(reconRows.length === EXPECTED.reconRows, `recon rows ${reconRows.length} != ${EXPECTED.reconRows}`);
  assert(juneRows.length === EXPECTED.juneAttempts, `june rows ${juneRows.length} != ${EXPECTED.juneAttempts}`);
  assert(attempts.every((a) => norm(a.status) === "sent"), "pre-reconciliation ledger must be all status sent");

  // ---- 1. the 146 lost 15:00 attempts -------------------------------------------------------
  const attemptsInsert = [];
  const stepDist = {};
  for (const [email, list] of byEmail15) {
    const ev = list[0];
    const contact = contactByEmail.get(email);
    assert(contact, `15:00 recipient ${email} has no contact row`);
    const prior = attempts.filter((a) =>
      norm(a.contact_id) === norm(contact.contact_id) &&
      ["sent", "dry_run"].includes(norm(a.status)) &&
      String(a.created_at || "") < `${INCIDENT_DATE}T15:00`);
    const step = prior.length + 1;
    stepDist[step] = (stepDist[step] || 0) + 1;
    attemptsInsert.push({
      id: `react-attempt-recon2-${contact.contact_id}`,
      contact_id: contact.contact_id,
      campaign_id: REACTIVATION_CAMPAIGN_ID,
      wave: contact.wave,
      step_number: step,
      to: norm(ev.email),
      provider: "sendgrid",
      provider_message_id: ev.recv_message_id || "",
      sendgrid_message_id: ev.message_id || "",
      status: "sent",
      sent_date: INCIDENT_DATE,
      created_at: toIso(ev.processed),
      source: "sendgrid-reconciliation",
      reconciled: true,
      reconciled_note: "restored from the final SendGrid export: 15:00Z 2026-07-08 batch records lost with the tick's closing write"
    });
  }
  assert(JSON.stringify(stepDist) === JSON.stringify(EXPECTED.step15Distribution),
    `15:00 step distribution ${JSON.stringify(stepDist)} != ${JSON.stringify(EXPECTED.step15Distribution)}`);

  // ---- 2. patches on the 95 synthetic 12:00 rows ---------------------------------------------
  const attemptsPatch = [];
  for (const row of reconRows) {
    const email = norm(row.to);
    const copies = byEmail12.get(email) || [];
    const patch = { reconciled_source: "sendgrid-reconciliation" };
    if (email === EXPECTED.dropEmail) {
      assert(copies.length === 0, "the drop recipient must have no processed event");
      patch.status = "dropped";
      patch.provider_message_id = dropEvent.recv_message_id || "";
      patch.sendgrid_message_id = dropEvent.message_id || "";
      patch.drop_reason = dropEvent.reason || "sendgrid_drop";
      patch.reconciled_note = "corrected from the final SendGrid export: SendGrid dropped this send at 12:00:26Z (no processed event); address is undeliverable and suppressed";
    } else {
      assert(copies.length >= 1, `recon row ${email} has no 12:00 processed event`);
      const first = copies.slice().sort((a, b) => a.processed.localeCompare(b.processed))[0];
      patch.provider_message_id = first.recv_message_id || "";
      patch.sendgrid_message_id = first.message_id || "";
      if (copies.length > 1) {
        patch.duplicate_copies_processed = copies.length;
        patch.duplicate_copies_delivered = deliveredCount(email);
        patch.duplicates_note = `one counted touch; ${copies.length} copies processed 12:00Z 2026-07-08 (shredded duplicate rows, single tick), ${deliveredCount(email)} delivered per SendGrid`;
      }
    }
    attemptsPatch.push({ id: row.id, current: row, patch });
  }
  assert(attemptsPatch.filter((p) => p.patch.duplicate_copies_processed).length === EXPECTED.duplicatedRecipients,
    "duplicate annotations must cover exactly the duplicated recipients");

  // ---- 3. claims backfill: one claim per real historical (contact, step) ---------------------
  // Post-reconciliation sent attempts = June + the 94 truly-sent 12:00 rows + the 146 inserts.
  // The drop gets a FAILED claim (attempted, provider refused) so the claim ledger blocks that
  // (contact, step) too. Ids come from reactivationClaimId, the exact live-path format.
  const claimsInsert = [];
  const seenClaimIds = new Set();
  const addClaim = (attempt, status, reason) => {
    const claimId = reactivationClaimId(REACTIVATION_CAMPAIGN_ID, attempt.contact_id, attempt.step_number);
    assert(!seenClaimIds.has(claimId), `claim id collision: ${claimId}`);
    seenClaimIds.add(claimId);
    claimsInsert.push({
      id: claimId,
      campaign_id: REACTIVATION_CAMPAIGN_ID,
      contact_id: attempt.contact_id,
      step_number: attempt.step_number,
      wave: attempt.wave,
      to: norm(attempt.to),
      status,
      reason: reason || "",
      provider: "sendgrid",
      provider_message_id: attempt.provider_message_id || "",
      claimed_at: attempt.created_at,
      resolved_at: attempt.created_at,
      run_id: "",
      claimed_by: "sendgrid-reconciliation",
      source: "sendgrid-reconciliation"
    });
  };
  for (const a of juneRows) addClaim(a, "sent");
  for (const p of attemptsPatch) {
    const merged = { ...p.current, ...p.patch };
    if (norm(merged.to) === EXPECTED.dropEmail) addClaim(merged, "failed", "sendgrid_drop:" + (dropEvent.reason || ""));
    else addClaim(merged, "sent");
  }
  for (const a of attemptsInsert) addClaim(a, "sent");
  assert(claimsInsert.length === EXPECTED.juneAttempts + EXPECTED.reconRows + EXPECTED.batch15Unique,
    `claims ${claimsInsert.length} != ${EXPECTED.juneAttempts + EXPECTED.reconRows + EXPECTED.batch15Unique}`);

  // ---- 4. mandatory suppressions -------------------------------------------------------------
  const suppressedEmails = new Set(suppressions.map((s) => norm(s.email)));
  const suppressionsInsert = [];
  const bounceEmails = new Map();
  for (const e of events.filter((x) => x.event === "bounce")) {
    const k = norm(e.email);
    if (!bounceEmails.has(k)) bounceEmails.set(k, e);
  }
  for (const [email, ev] of bounceEmails) {
    if (suppressedEmails.has(email)) continue;
    const contact = contactByEmail.get(email);
    suppressionsInsert.push({
      id: `outreach-supp-recon2-${(contact?.contact_id || email).replace(/^react-/, "").replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
      email,
      reason: "bounced",
      source: "sendgrid-reconciliation",
      contact_id: contact?.contact_id || "",
      created_at: RECONCILIATION_STAMP,
      evidence: `SendGrid ${ev.type} ${ev.processed}Z: ${(ev.reason || "").slice(0, 120)}`
    });
  }
  // Unsubscribes recorded in the unsubscribe ledger but missing a suppression row (legal).
  for (const u of unsubscribes) {
    const email = norm(u.email);
    if (suppressedEmails.has(email) || suppressionsInsert.some((s) => s.email === email)) continue;
    const contact = contactByEmail.get(email);
    suppressionsInsert.push({
      id: `outreach-supp-recon2-${(contact?.contact_id || email).replace(/^react-/, "").replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
      email,
      reason: "unsubscribed",
      source: "sendgrid-reconciliation",
      contact_id: contact?.contact_id || u.contact_id || "",
      created_at: RECONCILIATION_STAMP,
      evidence: `unsubscribe ledger row ${u.id || ""} at ${u.created_at || u.at || ""}; suppression row was missing`
    });
  }

  // jaime.berrios: annotate the recovered first-unsubscribe evidence on the existing row.
  const suppressionsPatch = [];
  const jaime = suppressions.find((s) => norm(s.email) === "jaime.berrios@introba.com");
  if (jaime && !jaime.first_unsubscribe_evidence) {
    suppressionsPatch.push({
      id: jaime.id,
      current: jaime,
      patch: {
        first_unsubscribe_evidence:
          "SendGrid export shows unsubscribe-link clicks 2026-07-08T12:00:56Z to 12:01:08Z from both duplicate 12:00Z copies; that ledger row was lost with the tick's closing write; suppression honored via re-clicks 16:10Z onward (this row)"
      }
    });
  }

  const summary = {
    attemptsInsert: attemptsInsert.length,
    attemptsPatch: attemptsPatch.length,
    duplicateAnnotations: attemptsPatch.filter((p) => p.patch.duplicate_copies_processed).length,
    dropCorrections: attemptsPatch.filter((p) => p.patch.status === "dropped").length,
    claimsInsert: claimsInsert.length,
    claimsSent: claimsInsert.filter((c) => c.status === "sent").length,
    claimsFailed: claimsInsert.filter((c) => c.status === "failed").length,
    suppressionsInsert: suppressionsInsert.length,
    suppressionsPatch: suppressionsPatch.length,
    step15Distribution: stepDist,
    ledgerSentAfter: EXPECTED.juneAttempts + (EXPECTED.reconRows - 1) + EXPECTED.batch15Unique
  };
  return { attemptsInsert, attemptsPatch, claimsInsert, suppressionsInsert, suppressionsPatch, summary };
}

async function patchRow(collection, itemId, currentPayload, patch) {
  const payload = { ...currentPayload, ...patch };
  await supabaseRestRequest(
    `${RECORDS_TABLE}?collection=eq.${encodeURIComponent(collection)}&item_id=eq.${encodeURIComponent(itemId)}`,
    { method: "PATCH", body: { payload, updated_at: nowIso() }, prefer: "return=minimal" }
  );
  return payload;
}

export async function applyReconciliation(plan, store) {
  const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));
  const outcome = { inserted: {}, skipped: {}, patched: {} };
  for (const [collection, rows] of [
    ["reactivationAttempts", plan.attemptsInsert],
    ["reactivationSendClaims", plan.claimsInsert],
    ["outreachSuppressions", plan.suppressionsInsert]
  ]) {
    outcome.inserted[collection] = 0;
    outcome.skipped[collection] = 0;
    for (const chunk of chunks(rows, 100)) {
      const r = await store.claimCollectionItems(collection, chunk);
      outcome.inserted[collection] += r.inserted.length;
      outcome.skipped[collection] += r.skipped.length;
    }
  }
  outcome.patched.reactivationAttempts = 0;
  for (const p of plan.attemptsPatch) {
    await patchRow("reactivationAttempts", p.id, p.current, p.patch);
    outcome.patched.reactivationAttempts += 1;
  }
  outcome.patched.outreachSuppressions = 0;
  for (const p of plan.suppressionsPatch) {
    await patchRow("outreachSuppressions", p.id, p.current, p.patch);
    outcome.patched.outreachSuppressions += 1;
  }
  return outcome;
}

export async function verifyReconciliation(plan) {
  const failures = [];
  const attempts = (await pullCollection("reactivationAttempts")).map((r) => r.payload);
  const claims = (await pullCollection("reactivationSendClaims")).map((r) => r.payload);
  const suppressions = (await pullCollection("outreachSuppressions")).map((r) => r.payload);
  const attemptById = new Map(attempts.map((a) => [a.id, a]));
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const suppById = new Map(suppressions.map((s) => [s.id, s]));
  for (const row of plan.attemptsInsert) {
    const got = attemptById.get(row.id);
    if (!got) { failures.push(`missing attempt ${row.id}`); continue; }
    for (const k of ["contact_id", "step_number", "to", "provider_message_id", "status", "sent_date", "created_at", "source"]) {
      if (JSON.stringify(got[k]) !== JSON.stringify(row[k])) failures.push(`attempt ${row.id} field ${k}: ${JSON.stringify(got[k])} != ${JSON.stringify(row[k])}`);
    }
  }
  for (const row of plan.claimsInsert) {
    const got = claimById.get(row.id);
    if (!got) { failures.push(`missing claim ${row.id}`); continue; }
    for (const k of ["contact_id", "step_number", "status", "provider_message_id", "claimed_by"]) {
      if (JSON.stringify(got[k]) !== JSON.stringify(row[k])) failures.push(`claim ${row.id} field ${k}: ${JSON.stringify(got[k])} != ${JSON.stringify(row[k])}`);
    }
  }
  for (const row of plan.suppressionsInsert) {
    if (!suppById.get(row.id)) failures.push(`missing suppression ${row.id}`);
  }
  for (const p of [...plan.attemptsPatch]) {
    const got = attemptById.get(p.id);
    if (!got) { failures.push(`missing patched attempt ${p.id}`); continue; }
    for (const [k, v] of Object.entries(p.patch)) {
      if (JSON.stringify(got[k]) !== JSON.stringify(v)) failures.push(`patched attempt ${p.id} field ${k} not applied`);
    }
  }
  for (const p of [...plan.suppressionsPatch]) {
    const got = suppById.get(p.id);
    if (!got) { failures.push(`missing patched suppression ${p.id}`); continue; }
    for (const [k, v] of Object.entries(p.patch)) {
      if (JSON.stringify(got[k]) !== JSON.stringify(v)) failures.push(`patched suppression ${p.id} field ${k} not applied`);
    }
  }
  return { failures, counts: { attempts: attempts.length, claims: claims.length, suppressions: suppressions.length } };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const exportPath = val("--export");
  if (!exportPath) { console.error("--export <csv> is required"); process.exit(1); }

  const events = parseCsv(await readFile(exportPath, "utf8"));
  const [attempts, contacts, suppressions, unsubscribes] = await Promise.all([
    pullCollection("reactivationAttempts"),
    pullCollection("reactivationContacts"),
    pullCollection("outreachSuppressions"),
    pullCollection("outreachUnsubscribes")
  ]);
  const plan = computeReconciliation({
    events,
    attempts: attempts.map((r) => r.payload),
    contacts: contacts.map((r) => r.payload),
    suppressions: suppressions.map((r) => r.payload),
    unsubscribes: unsubscribes.map((r) => r.payload)
  });
  console.log("reconciliation summary:", JSON.stringify(plan.summary, null, 1));

  const planPath = val("--plan");
  if (planPath) {
    await writeFile(planPath, JSON.stringify(plan, null, 1));
    console.log("row-level diff written to", planPath);
  }
  if (flag("--apply")) {
    if (!flag("--yes-write-prod")) { console.error("refusing to apply without --yes-write-prod"); process.exit(1); }
    const store = createStore({});
    if (store.kind !== "supabase") { console.error("apply requires the supabase backend"); process.exit(1); }
    const outcome = await applyReconciliation(plan, store);
    console.log("apply outcome:", JSON.stringify(outcome, null, 1));
    const verification = await verifyReconciliation(plan);
    console.log("verify-after-write counts:", JSON.stringify(verification.counts));
    if (verification.failures.length) {
      console.error("VERIFY-AFTER-WRITE FAILURES:");
      for (const f of verification.failures) console.error("  " + f);
      process.exit(1);
    }
    console.log("verify-after-write: every planned row present and correct");
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly) {
  main().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
}
