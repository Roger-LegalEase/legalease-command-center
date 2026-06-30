// Expungement.ai lifecycle sync tests. Proves the ingest is import/stage ONLY and inherits the
// reactivation hold safety BEFORE it can touch the live campaign:
//   1. Collections persist (membership in coreStateCollections) + documented in the data model.
//   2. Preview never writes; confirm writes lifecycle contacts + events.
//   3. Stage classification (abandoned screening / checkout abandoned / paid).
//   4. Unsubscribed/suppressed and deleted/erasure contacts are NEVER campaign-staged.
//   5. Campaign-staged contacts are held (campaign_hold), get no wave, are ignored by
//      planReactivation(), and generate no reactivationAttempts.
//   6. No SendGrid/send function is called. Confirm requires owner/admin. No gate changes.

import assert from "node:assert";
import fs from "node:fs";
import { coreStateCollections } from "./storage.mjs";
import { buildDataModelInventory } from "./state-integrity.mjs";
import {
  classifyLifecycleStage, previewExpungementSync, confirmExpungementSync,
  csvToLifecycleRecords, resolveSyncRecords,
  EXPUNGEMENT_LIFECYCLE_COLLECTIONS, EXPUNGEMENT_SOURCE_TYPE, EXPUNGEMENT_HOLD_REASON,
  EXPUNGEMENT_SYNC_WARNING, EXPUNGEMENT_SYNC_HELD_MESSAGE
} from "./expungement-lifecycle-sync.mjs";
import { planReactivation, actReactivation, contactIdForEmail } from "./reactivation-os.mjs";
import { permissionForRequest, authorizeRequest } from "./access-control.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const NOW = "2026-06-30T00:00:00Z";
const SRC = { sourceNote: "Expungement.ai nightly export", now: NOW };

const RECORDS = [
  { email: "abandon@gmail.com", first_name: "Ann", screening_status: "abandoned", dropoff_step: "charges", state: "PA", source_record_id: "u1" },
  { email: "checkout@yahoo.com", first_name: "Cal", checkout_status: "abandoned" },
  { email: "paid@outlook.com", first_name: "Pat", payment_status: "paid" },
  { email: "done@gmail.com", first_name: "Dee", screening_status: "completed" },
  { email: "unsub@gmail.com", first_name: "Uma", unsubscribed: true, screening_status: "abandoned" },
  { email: "erased@gmail.com", first_name: "Ed", deleted_or_erasure_requested: true, screening_status: "abandoned" },
  { email: "bad", first_name: "Bo", screening_status: "abandoned" }
];

// ---- 1. Collections persist + documented --------------------------------------
for (const c of EXPUNGEMENT_LIFECYCLE_COLLECTIONS) {
  assert.ok(coreStateCollections.includes(c), `${c} must be in coreStateCollections (persists to Supabase)`);
  assert.ok(buildDataModelInventory().some((s) => s.collection === c), `${c} must be documented in buildDataModelInventory()`);
}
ok("lifecycle collections persist and are documented in the data model");

// ---- 2. Stage classification --------------------------------------------------
assert.equal(classifyLifecycleStage({ screening_status: "abandoned" }), "screening_abandoned");
assert.equal(classifyLifecycleStage({ dropoff_step: "charges" }), "screening_abandoned");
assert.equal(classifyLifecycleStage({ checkout_status: "abandoned" }), "checkout_abandoned");
assert.equal(classifyLifecycleStage({ payment_status: "paid" }), "paid");
assert.equal(classifyLifecycleStage({ lifecycle_stage: "packet_generated" }), "packet_generated");
assert.equal(classifyLifecycleStage({ unsubscribed: true }), "unsubscribed");
assert.equal(classifyLifecycleStage({ deleted_or_erasure_requested: true }), "deleted_or_erasure_requested");
ok("abandoned screening / checkout abandoned / paid are classified correctly");

// ---- 3. Preview does not write ------------------------------------------------
{
  const before = { reactivationContacts: [], expungementLifecycleContacts: [{ lifecycle_contact_id: "keep", email: "k@x.com" }] };
  const snapshot = JSON.stringify(before);
  const prev = previewExpungementSync(before, RECORDS, SRC);
  assert.equal(prev.writesState, false);
  assert.equal(JSON.stringify(before), snapshot, "preview must not mutate state");
  assert.equal(prev.totalRecords, 7);
  assert.equal(prev.validContacts, 6, "bad-email record is not a valid contact");
  assert.equal(prev.abandonedScreenings, 2, "two abandoned screenings (incl bad email)");
  assert.equal(prev.completedNoPayment, 1);
  assert.equal(prev.checkoutAbandoned, 1);
  assert.equal(prev.paidCustomers, 1);
  assert.equal(prev.excludedUnsubscribed, 1, "unsubscribed excluded");
  assert.equal(prev.excludedDeleted, 1, "deleted excluded");
  assert.equal(prev.campaignStageable, 3, "abandon + checkout + completed are stageable");
  assert.match(prev.warning, /nothing sends/i);
  assert.ok(prev.sampleContacts.every((c) => /\*\*\*/.test(c.email) || !/@/.test(c.email)), "sample emails masked");
  ok("preview does not write; counts + masked samples correct");
}

// ---- 4. Confirm writes lifecycle contacts + events; stages held campaign contacts ----
const conf = confirmExpungementSync({}, RECORDS, SRC);
assert.equal(conf.writesState, true);
assert.equal(conf.lifecycleUpserted, 7, "all records become lifecycle rows");
assert.equal(conf.lifecycleEventsRecorded, 7, "one event per record");
assert.equal(conf.state.expungementLifecycleContacts.length, 7);
assert.equal(conf.state.expungementLifecycleEvents.length, 7);
ok("confirm writes lifecycle contacts and events");

// ---- 5. Campaign staging: only eligible, and only valid emails ----------------
{
  const staged = conf.state.reactivationContacts;
  assert.equal(staged.length, 3, "abandon + checkout + done (paid/unsub/deleted/bad excluded)");
  const emails = staged.map((c) => c.email).sort();
  assert.deepEqual(emails, ["abandon@gmail.com", "checkout@yahoo.com", "done@gmail.com"]);
  assert.ok(!emails.includes("paid@outlook.com"), "paid customer not campaign-staged");
  assert.equal(conf.reactivationStaged, 3);
  ok("only campaign-eligible, valid contacts are staged into reactivationContacts");
}

// ---- 6. Unsubscribed + deleted are excluded AND suppressed --------------------
{
  assert.equal(conf.excludedUnsubscribed, 1);
  assert.equal(conf.excludedDeleted, 1);
  const stagedEmails = conf.state.reactivationContacts.map((c) => c.email);
  assert.ok(!stagedEmails.includes("unsub@gmail.com"), "unsubscribed not staged");
  assert.ok(!stagedEmails.includes("erased@gmail.com"), "deleted not staged");
  // Hard signals also write a sticky suppression so a later import can't enroll them either.
  const suppressed = (conf.state.outreachSuppressions || []).map((s) => s.email);
  assert.ok(suppressed.includes("unsub@gmail.com"), "unsubscribed recorded as suppression");
  assert.ok(suppressed.includes("erased@gmail.com"), "deleted recorded as suppression");
  // Deletion flag is recorded on the lifecycle row.
  assert.equal(conf.state.expungementLifecycleContacts.find((c) => c.email === "erased@gmail.com").deleted_or_erasure_requested, true);
  ok("unsubscribed/suppressed and deleted/erasure contacts are not campaign-staged (and are suppressed)");
}

// ---- 7. Staged contacts are held, get no wave, are inert ----------------------
{
  for (const c of conf.state.reactivationContacts) {
    assert.equal(c.campaign_hold, true, "staged contact is held");
    assert.equal(c.campaign_hold_reason, EXPUNGEMENT_HOLD_REASON);
    assert.equal(c.import_status, "staged");
    assert.equal(c.source_type, EXPUNGEMENT_SOURCE_TYPE);
    assert.match(c.source_note, /Expungement\.ai/);
    assert.ok(c.source_imported_at && c.source_import_id, "provenance stamped");
    assert.equal(c.wave, null, "held contact gets no wave");
    assert.ok(!c.enrolled_at, "not enrolled");
    assert.equal(c.sequence_status, "Not Enrolled");
  }
  assert.equal(conf.held, 3);
  assert.equal(conf.heldMessage, EXPUNGEMENT_SYNC_HELD_MESSAGE);
  ok("campaign-staged synced contacts are held, unbucketed, and inert");
}

// ---- 8. Held contacts ignored by planReactivation + no attempts ---------------
{
  const IN_WINDOW = new Date("2026-07-02T15:00:00Z");
  const due = {
    ...conf.state,
    reactivationContacts: conf.state.reactivationContacts.map((c) => ({ ...c, wave: 1, enrolled_at: "2026-06-01T00:00:00Z" })),
    reactivationCampaign: { campaignId: "mvp-reactivation", releasedWaves: [1], status: "active" }
  };
  assert.equal(planReactivation(due, { now: IN_WINDOW }).proposals.length, 0, "held synced contacts are not due");
  ok("held synced contacts are ignored by planReactivation()");
}
{
  const IN_WINDOW = new Date("2026-07-02T15:00:00Z");
  const due = {
    ...conf.state,
    reactivationContacts: conf.state.reactivationContacts.map((c) => ({ ...c, wave: 1, enrolled_at: "2026-06-01T00:00:00Z" })),
    reactivationCampaign: { campaignId: "mvp-reactivation", releasedWaves: [1], status: "active" }
  };
  const acted = await actReactivation(due, { now: IN_WINDOW });
  assert.ok(!(acted.state.reactivationAttempts && acted.state.reactivationAttempts.length), "no attempts for held synced contacts");
  ok("held synced contacts generate no reactivationAttempts");
}

// ---- 9. No send function is called; only safe collections written -------------
{
  const src = fs.readFileSync(new URL("./expungement-lifecycle-sync.mjs", import.meta.url), "utf8");
  for (const callSite of ["runOutreachSend(", "runReactivationSend(", "releaseWave(", "actReactivation(", "sgMail", ".send("]) {
    assert.ok(!src.includes(callSite), `sync module must not call ${callSite}`);
  }
  assert.ok(!(conf.state.reactivationAttempts && conf.state.reactivationAttempts.length), "no send attempts recorded");
  ok("no SendGrid/outreach send function is called (no call sites, no attempts)");
}

// ---- 10. Confirm requires owner/admin -----------------------------------------
assert.equal(permissionForRequest("POST", "/api/sync/expungement-ai/preview"), "write");
assert.equal(permissionForRequest("POST", "/api/sync/expungement-ai/confirm"), "write");
{
  const ownerToken = "x".repeat(20);
  const env = { COMMAND_CENTER_REQUIRE_AUTH: "true", COMMAND_CENTER_OWNER_TOKEN: ownerToken };
  const anon = authorizeRequest({ method: "POST", url: "/api/sync/expungement-ai/confirm", headers: {} }, null, env);
  assert.equal(anon.ok, false);
  assert.equal(anon.status, 401, "anonymous confirm rejected");
  const owner = authorizeRequest({ method: "POST", url: "/api/sync/expungement-ai/confirm", headers: { authorization: "Bearer " + ownerToken } }, null, env);
  assert.equal(owner.ok, true);
  assert.equal(owner.actor.role, "owner");
}
ok("preview + confirm require auth/owner (write); anonymous rejected, owner accepted");

// ---- 11. No live-send / autopilot gate changes --------------------------------
{
  // Confirm must not introduce or mutate any gate/toggle/campaign-status collection.
  const c2 = confirmExpungementSync({}, RECORDS, SRC);
  assert.ok(!("autopilotSettings" in c2.state), "no autopilot settings written");
  assert.ok(!("reactivationCampaign" in c2.state), "campaign config untouched (no release/activate)");
  const touched = Object.keys(c2.state).sort();
  assert.deepEqual(
    touched,
    ["expungementLifecycleContacts", "expungementLifecycleEvents", "outreachContacts", "outreachSuppressions", "reactivationContacts"],
    "confirm writes only lifecycle + suppression + staged reactivation collections"
  );
  ok("no live-send/autopilot gate changes (only safe collections written)");
}

// ---- 12. Blocker 1: operator source note persists on lifecycle rows -----------
{
  for (const c of conf.state.expungementLifecycleContacts) {
    assert.equal(c.sync_source_note, SRC.sourceNote, "lifecycle contact carries the batch source note");
    assert.ok(c.first_synced_at && c.last_synced_at, "sync timestamps recorded");
  }
  for (const e of conf.state.expungementLifecycleEvents) {
    assert.equal(e.sync_source_note, SRC.sourceNote, "lifecycle event carries the batch source note");
  }
  ok("confirm persists the operator source note on lifecycle contacts and events");
}

// ---- 13. Blocker 1: re-sync updates the note predictably (first-seen preserved) ----
{
  const first = confirmExpungementSync({}, RECORDS, { sourceNote: "batch one", now: NOW });
  const resync = confirmExpungementSync(first.state, RECORDS, { sourceNote: "batch two", now: "2026-07-10T00:00:00Z" });
  const lc = resync.state.expungementLifecycleContacts.find((c) => c.email === "abandon@gmail.com");
  const lc0 = first.state.expungementLifecycleContacts.find((c) => c.email === "abandon@gmail.com");
  assert.equal(lc.sync_source_note, "batch two", "latest batch note wins on re-sync");
  assert.equal(lc.first_synced_at, lc0.first_synced_at, "first_synced_at preserved across re-sync");
  assert.equal(lc.last_synced_at, "2026-07-10T00:00:00Z", "last_synced_at refreshes");
  assert.equal(resync.state.expungementLifecycleContacts.length, first.state.expungementLifecycleContacts.length, "no duplicate lifecycle contacts");
  // Each sync appends an event carrying its own note (immutable per-sync history).
  assert.ok(resync.state.expungementLifecycleEvents.some((e) => e.sync_source_note === "batch two"), "new event carries the new note");
  assert.ok(resync.state.expungementLifecycleEvents.some((e) => e.sync_source_note === "batch one"), "prior event note preserved");
  ok("re-sync updates the source note predictably (latest wins; per-sync events immutable)");
}

// ---- 14. Blocker 2: revoked consent => sticky suppression, never staged -------
{
  const recs = [{ email: "revoked@gmail.com", first_name: "Rev", consent_status: "revoked", screening_status: "abandoned", source_record_id: "r1" }];
  const r = confirmExpungementSync({}, recs, { sourceNote: "consent test", now: NOW });
  // Lifecycle-recorded with consent_status preserved.
  const lc = r.state.expungementLifecycleContacts.find((c) => c.email === "revoked@gmail.com");
  assert.ok(lc, "revoked-consent contact is lifecycle-recorded");
  assert.equal(lc.consent_status, "revoked", "consent_status preserved on the lifecycle row");
  // Not campaign-staged.
  assert.ok(!(r.state.reactivationContacts || []).some((c) => c.email === "revoked@gmail.com"), "revoked consent not campaign-staged");
  assert.equal(r.excludedUnsubscribed, 1, "revoked consent counted as an exclusion");
  // Sticky suppression written.
  const supp = (r.state.outreachSuppressions || []).find((s) => s.email === "revoked@gmail.com");
  assert.ok(supp, "revoked consent writes a sticky suppression");
  assert.ok(["manually_suppressed", "do_not_contact"].includes(supp.reason), "uses a supported non-contact reason");
  ok("revoked consent is recorded, excluded from staging, and writes sticky suppression");
}

// ---- 15. Blocker 2: suppression blocks a PRE-EXISTING reactivation contact ----
{
  // The person is already an enrolled, released, due reactivation contact. After a revoked-consent
  // sync, the suppression ledger must make planReactivation stop proposing them.
  const id = contactIdForEmail("already@gmail.com");
  const seeded = {
    reactivationContacts: [{ contact_id: id, email: "already@gmail.com", wave: 1, enrolled_at: "2026-06-01T00:00:00Z", sequence_status: "Enrolled", campaign_id: "mvp-reactivation" }],
    reactivationCampaign: { campaignId: "mvp-reactivation", releasedWaves: [1], status: "active" }
  };
  const IN_WINDOW = new Date("2026-07-02T15:00:00Z");
  // Sanity: before the sync they WOULD be due (proves the test setup is live).
  assert.ok(planReactivation(seeded, { now: IN_WINDOW }).proposals.some((p) => p.contact.email === "already@gmail.com"), "contact is due before suppression");
  const synced = confirmExpungementSync(seeded, [{ email: "already@gmail.com", consent_status: "withdrawn" }], { sourceNote: "consent test", now: NOW });
  const due = { ...synced.state, reactivationCampaign: { campaignId: "mvp-reactivation", releasedWaves: [1], status: "active" } };
  assert.ok(!planReactivation(due, { now: IN_WINDOW }).proposals.some((p) => p.contact.email === "already@gmail.com"), "after revoked-consent sync, planReactivation no longer proposes them");
  ok("revoked-consent suppression blocks a pre-existing reactivation contact from planReactivation()");
}

// ---- 16. CSV/paste support: parser + header aliasing -------------------------
{
  // Mixed-case / spaced headers, a quoted name with an embedded comma, plus boolean string cells.
  const CSV = [
    "Email,First Name,Full Name,Payment Status,Screening Status,Checkout Status,Consent Status,Unsubscribed,Deleted Or Erasure Requested,State",
    'ab@gmail.com,Ann,"Smith, Ann",,abandoned,,,,,PA',
    "co@yahoo.com,Cal,,,,abandoned,,,,",
    "pd@outlook.com,Pat,,paid,,,,,,",
    "un@gmail.com,Uma,,,abandoned,,,true,,",
    "de@gmail.com,Ed,,,abandoned,,,,true,",
    "rv@gmail.com,Rev,,,,,revoked,,,"
  ].join("\n");
  const recs = csvToLifecycleRecords(CSV);
  assert.equal(recs.length, 6, "one record per CSV data row");
  // Header aliasing: First Name / Full Name / Payment Status map to canonical fields.
  assert.equal(recs[0].first_name, "Ann");
  assert.equal(recs[0].full_name, "Smith, Ann", "quoted comma stays inside one field");
  assert.equal(recs[0].state, "PA");
  assert.equal(recs[2].payment_status, "paid", "Payment Status header mapped");
  assert.equal(recs[0].screening_status, "abandoned", "Screening Status header mapped");
  // resolveSyncRecords prefers JSON records, falls back to CSV.
  assert.equal(resolveSyncRecords({ records: [{ email: "x@y.com" }] }).length, 1, "JSON records path preserved");
  assert.equal(resolveSyncRecords({ csvText: CSV }).length, 6, "CSV text path resolves");
  ok("CSV parser handles normal + First Name/Full Name/Payment Status headers + quoted commas");

  // Preview from CSV writes nothing; sample masked; warning says nothing sends.
  const before = { reactivationContacts: [], expungementLifecycleContacts: [] };
  const snap = JSON.stringify(before);
  const prev = previewExpungementSync(before, resolveSyncRecords({ csvText: CSV }), { sourceNote: "CSV paste" });
  assert.equal(prev.writesState, false);
  assert.equal(JSON.stringify(before), snap, "CSV preview must not mutate state");
  assert.equal(prev.totalRecords, 6);
  assert.equal(prev.abandonedScreenings, 1, "abandoned counted");
  assert.equal(prev.paidCustomers, 1, "paid counted");
  assert.ok(prev.checkoutAbandoned >= 1, "checkout counted");
  assert.ok(prev.sampleContacts.every((c) => /\*\*\*/.test(c.email) || !/@/.test(c.email)), "CSV sample emails masked");
  assert.match(prev.warning, /nothing sends/i);
  ok("preview from CSV writes nothing; samples masked; warning says nothing sends");

  // Confirm from CSV writes lifecycle contacts/events; campaign-stageable held; excludes enforced.
  const conf = confirmExpungementSync({}, resolveSyncRecords({ csvText: CSV }), { sourceNote: "CSV paste", now: NOW });
  assert.equal(conf.writesState, true);
  assert.equal(conf.state.expungementLifecycleContacts.length, 6, "CSV confirm writes lifecycle contacts");
  assert.equal(conf.state.expungementLifecycleEvents.length, 6, "CSV confirm writes lifecycle events");
  const stagedEmails = conf.state.reactivationContacts.map((c) => c.email).sort();
  assert.deepEqual(stagedEmails, ["ab@gmail.com", "co@yahoo.com"], "only screening/checkout-abandoned staged");
  for (const c of conf.state.reactivationContacts) {
    assert.equal(c.campaign_hold, true, "CSV-staged contact is held");
    assert.equal(c.campaign_hold_reason, EXPUNGEMENT_HOLD_REASON);
    assert.equal(c.wave, null, "held CSV contact gets no wave");
    assert.ok(!c.enrolled_at, "not enrolled");
  }
  assert.ok(!stagedEmails.includes("pd@outlook.com"), "paid CSV contact not campaign-staged");
  const supp = (conf.state.outreachSuppressions || []).map((s) => s.email);
  assert.ok(supp.includes("un@gmail.com"), "unsubscribed CSV contact suppressed");
  assert.ok(supp.includes("de@gmail.com"), "deleted CSV contact suppressed");
  assert.ok(supp.includes("rv@gmail.com"), "revoked-consent CSV contact suppressed");
  assert.ok(!stagedEmails.includes("un@gmail.com") && !stagedEmails.includes("de@gmail.com") && !stagedEmails.includes("rv@gmail.com"), "unsub/deleted/revoked CSV contacts not staged");
  // No send attempts; only safe collections written.
  assert.ok(!(conf.state.reactivationAttempts && conf.state.reactivationAttempts.length), "no send attempts from CSV confirm");
  assert.ok(!("autopilotSettings" in conf.state) && !("reactivationCampaign" in conf.state), "no gate/autopilot/campaign mutation from CSV confirm");
  ok("confirm from CSV writes lifecycle + holds eligible; paid/unsub/deleted/revoked excluded; no send/gate change");
}

console.log(`\nAll ${passed} expungement-lifecycle-sync checks passed.`);
