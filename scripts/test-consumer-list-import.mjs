// Consumer / Expungement.ai list import tests. Proves the "Upload a list" consumer front door is
// IMPORT-ONLY and inherits the reactivation safety primitives BEFORE it can stage anyone:
//   1. Preview parses the CSV (rows, valid contacts, detected columns, sample rows) and NEVER writes.
//   2. Confirm writes contacts into reactivationContacts and ONLY that collection.
//   3. Bad / invalid / missing-email rows are skipped; duplicates are skipped.
//   4. Default priority is cold; first-name fallback is inherited from importReactivationContacts.
//   5. List type + source note are both required (preview and confirm).
//   6. The preview/confirm endpoints are auth-protected (write); anonymous is rejected.
//   7. No SendGrid/outreach send function is called (no attempts, no call sites).
//   8. No reactivation wave is released — contacts stay inert ("Not Enrolled").
//   9. No live-send / autopilot flag is changed — only reactivationContacts is touched.

import assert from "node:assert";
import fs from "node:fs";
import {
  parseCsv, parseConsumerCsv, previewConsumerImport, confirmConsumerImport,
  CONSUMER_LIST_TYPE, CONSUMER_SOURCE_TYPE, CONSUMER_IMPORT_WARNING,
  CONSUMER_HOLD_REASON, CONSUMER_IMPORT_STATUS, CONSUMER_IMPORT_HELD_MESSAGE
} from "./consumer-list-import.mjs";
import { releaseWave, planReactivation, actReactivation } from "./reactivation-os.mjs";
import { permissionForRequest, authorizeRequest } from "./access-control.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const NOW = "2026-06-29T00:00:00Z";
const SRC = { listType: "consumer", sourceNote: "manual export" };

// Common-header CSV: mixed casing, missing fields, a duplicate, an invalid email, a missing email,
// and a quoted name containing a comma.
const BASE_CSV = [
  "Email,First Name,Full Name,Phone,Priority",
  "alice@example.com,Alice,Alice Smith,555-1,warm",
  "bob@example.com,,Bob Jones,,",                          // no first name -> fallback; no priority -> cold
  "alice@example.com,Alice,,,",                            // duplicate email
  "not-an-email,,No Email,,",                            // invalid email
  ",,Ghost,,",                                           // missing email
  '"carol@example.com",Carol,"Doe, Carol",555-3,'        // quoted comma in name; blank priority -> cold
].join("\n");

// ---- CSV parser ---------------------------------------------------------------
{
  const grid = parseCsv('a,"b,c",d\n1,2,3');
  assert.deepEqual(grid[0], ["a", "b,c", "d"], "quoted comma stays inside one field");
  assert.deepEqual(grid[1], ["1", "2", "3"]);
  ok("CSV parser handles quoted fields with embedded commas");
}

// ---- 1. Preview parses CSV ----------------------------------------------------
const prev = previewConsumerImport({}, BASE_CSV, SRC);
assert.equal(prev.totalRows, 6, "6 data rows");
assert.equal(prev.validContacts, 3, "alice, bob, carol");
assert.deepEqual(
  prev.columnsDetected.map((c) => c.field),
  ["email", "first_name", "full_name", "phone", "priority"],
  "likely columns detected from common headers"
);
assert.ok(prev.sampleRows.length >= 1, "sample rows surfaced");
assert.ok(prev.sampleRows.every((r) => !/[a-z0-9]+@/i.test(String(r.Email || "")) || /\*\*\*/.test(String(r.Email || ""))), "sample emails masked");
ok("preview parses CSV (rows, valid contacts, columns, masked samples)");

// ---- 2. Preview does not write/mutate state -----------------------------------
{
  const before = { reactivationContacts: [{ contact_id: "x", email: "keep@example.com" }] };
  const snapshot = JSON.stringify(before);
  const p = previewConsumerImport(before, BASE_CSV, SRC);
  assert.equal(p.writesState, false, "preview reports writesState=false");
  assert.equal(JSON.stringify(before), snapshot, "preview must not mutate the input state");
  ok("preview does not write or mutate state");
}

// ---- 3. Confirm writes reactivationContacts -----------------------------------
const conf = confirmConsumerImport({}, BASE_CSV, { ...SRC, now: NOW });
assert.equal(conf.writesState, true);
assert.equal(conf.state.reactivationContacts.length, 3, "3 staged contacts");
ok("confirm writes contacts into reactivationContacts");

// ---- 4. Bad / invalid / missing / duplicate handling --------------------------
assert.equal(prev.invalidEmails, 1, "one invalid-domain email");
assert.equal(prev.missingEmails, 1, "one missing email");
assert.equal(prev.badEmails, 2, "missing + invalid counted as bad");
assert.equal(conf.summary.skippedBad, 2);
ok("bad emails are skipped");
ok("missing email rows are skipped");
assert.equal(conf.summary.skippedDup, 1, "one duplicate email");
ok("duplicate emails are skipped");

// ---- 5. Defaults + fallbacks (inherited from importReactivationContacts) -------
{
  const byEmail = Object.fromEntries(conf.state.reactivationContacts.map((c) => [c.email, c]));
  assert.equal(byEmail["carol@example.com"].priority, "cold", "blank priority -> cold");
  assert.equal(byEmail["bob@example.com"].priority, "cold", "missing priority -> cold");
  assert.equal(byEmail["alice@example.com"].priority, "warm", "explicit priority preserved");
  ok("default priority is cold when missing");
  assert.equal(byEmail["bob@example.com"].first_name, "Bob", "first-name fallback from full_name");
  ok("first-name fallback uses existing reactivation behavior");
}

// ---- 6. Required inputs --------------------------------------------------------
assert.throws(() => previewConsumerImport({}, BASE_CSV, { listType: "consumer", sourceNote: "" }), /source note/i);
assert.throws(() => confirmConsumerImport({}, BASE_CSV, { listType: "consumer", sourceNote: "   " }), /source note/i);
ok("source note is required (preview + confirm)");
assert.throws(() => previewConsumerImport({}, BASE_CSV, { sourceNote: "x" }), /list type is required/i);
assert.throws(() => previewConsumerImport({}, BASE_CSV, { listType: "rcap_prospect", sourceNote: "x" }), /must be "consumer"/i);
ok("list type is required and must be consumer");

// ---- 7. Endpoints are auth-protected ------------------------------------------
assert.equal(permissionForRequest("POST", "/api/upload/consumer/preview"), "write", "preview gated as write");
assert.equal(permissionForRequest("POST", "/api/upload/consumer/confirm"), "write", "confirm gated as write");
{
  const ownerToken = "x".repeat(20);
  const env = { COMMAND_CENTER_REQUIRE_AUTH: "true", COMMAND_CENTER_OWNER_TOKEN: ownerToken };
  const anon = authorizeRequest({ method: "POST", url: "/api/upload/consumer/confirm", headers: {} }, null, env);
  assert.equal(anon.ok, false, "anonymous confirm rejected");
  assert.equal(anon.status, 401, "401 without a token");
  const owner = authorizeRequest({ method: "POST", url: "/api/upload/consumer/confirm", headers:{}, authenticatedActor:{ id:"synthetic-session", role:"owner", authenticated:true, session:{ id:"synthetic-session" } } }, null, env);
  assert.equal(owner.ok, true, "owner session accepted");
  assert.equal(owner.actor.role, "owner");
}
ok("confirm + preview require auth/owner (write); anonymous rejected, owner session accepted");

// ---- 8. No send function is called --------------------------------------------
{
  const src = fs.readFileSync(new URL("./consumer-list-import.mjs", import.meta.url), "utf8");
  for (const call of ["runOutreachSend(", "runReactivationSend(", "releaseWave(", "actReactivation(", "sgMail", ".send("]) {
    assert.ok(!src.includes(call), `import module must not call ${call}`);
  }
  assert.ok(!(conf.state.reactivationAttempts && conf.state.reactivationAttempts.length), "no send attempts recorded");
  ok("no SendGrid/outreach send function is called (no call sites, no attempts)");
}

// ---- 9. No wave released — contacts inert -------------------------------------
{
  assert.ok(conf.state.reactivationContacts.every((c) => !c.enrolled_at), "no contact enrolled");
  assert.ok(conf.state.reactivationContacts.every((c) => c.sequence_status === "Not Enrolled"), "all Not Enrolled");
  const campaign = conf.state.reactivationCampaign || {};
  assert.ok(!(campaign.releasedWaves && campaign.releasedWaves.length), "no released waves");
  assert.notEqual(campaign.status, "active", "campaign not activated");
  ok("no reactivation wave is released (contacts staged + inert)");
}

// ---- 10. Only reactivationContacts is touched (no gate/flag changes) -----------
{
  const c2 = confirmConsumerImport({}, BASE_CSV, { ...SRC, now: NOW });
  assert.deepEqual(Object.keys(c2.state).sort(), ["reactivationContacts"], "import writes ONLY reactivationContacts");
  ok("no live-send/autopilot flag is changed (only reactivationContacts written)");
}

// ---- 11. Durable import provenance on every imported contact -------------------
{
  for (const c of conf.state.reactivationContacts) {
    assert.equal(c.source_note, SRC.sourceNote, "source_note persisted = required source note");
    assert.equal(c.source_type, CONSUMER_SOURCE_TYPE, 'source_type = "consumer_upload"');
    assert.equal(c.source_type, "consumer_upload");
    assert.ok(c.source_imported_at, "source_imported_at present");
    assert.ok(c.source_import_id, "source_import_id present");
  }
  ok("confirmed contacts carry source_note / consumer_upload / source_imported_at / source_import_id");
}

// ---- 12. Provenance does not disturb send/signal/suppression state -------------
{
  // Pre-existing contact carrying live signal + first-seen provenance, plus a real suppression
  // ledger entry (so suppressed_at_import recomputes truthy). A re-import must refresh provenance
  // ONLY and leave all send/signal/suppression state intact. (alice already exists in conf.state.)
  const aliceId = conf.state.reactivationContacts.find((c) => c.email === "alice@example.com").contact_id;
  const seeded = {
    outreachSuppressions: [{ id: "supp-1", contact_id: aliceId, email: "alice@example.com", reason: "unsubscribed", source: "test" }],
    reactivationContacts: conf.state.reactivationContacts.map((c) => c.contact_id === aliceId
      ? { ...c, enrolled_at: "2026-01-01T00:00:00Z", sequence_status: "Paused", replied: true, clicked: true,
          converted: true, unsubscribed: true, bounced: true, complained: true, do_not_contact: true,
          source_import_id: "first-batch", source_imported_at: "2026-01-01T00:00:00Z" }
      : c)
  };
  const reimport = confirmConsumerImport(seeded, BASE_CSV, { listType: "consumer", sourceNote: "second pass", now: "2026-08-01T00:00:00Z" });
  const alice = reimport.state.reactivationContacts.find((c) => c.contact_id === aliceId);
  // Send / signal state preserved exactly.
  assert.equal(alice.enrolled_at, "2026-01-01T00:00:00Z", "enrolled_at preserved");
  assert.equal(alice.sequence_status, "Paused", "sequence_status preserved");
  for (const flag of ["replied", "clicked", "converted", "unsubscribed", "bounced", "complained", "do_not_contact"]) {
    assert.equal(alice[flag], true, `${flag} preserved`);
  }
  assert.ok(alice.suppressed_at_import, "suppressed_at_import stays set (ledger entry honored)");
  // First-seen provenance preserved; note refreshes; no duplicate row.
  assert.equal(alice.source_import_id, "first-batch", "first-seen source_import_id preserved on re-import");
  assert.equal(alice.source_imported_at, "2026-01-01T00:00:00Z", "first-seen source_imported_at preserved");
  assert.equal(alice.source_note, "second pass", "source_note refreshes to the latest upload");
  assert.equal(reimport.state.reactivationContacts.length, conf.state.reactivationContacts.length, "re-import does not duplicate");
  ok("re-import inherits provenance + preserves send/signal/suppression state, no duplicates");
}

// ---- 13. Newly imported contacts are explicitly staged + held -----------------
{
  for (const c of conf.state.reactivationContacts) {
    assert.equal(c.import_status, CONSUMER_IMPORT_STATUS, 'import_status = "staged"');
    assert.equal(c.import_status, "staged");
    assert.equal(c.campaign_hold, true, "campaign_hold = true");
    assert.equal(c.campaign_hold_reason, CONSUMER_HOLD_REASON, 'campaign_hold_reason = "consumer_upload_review"');
    assert.equal(c.campaign_hold_reason, "consumer_upload_review");
    assert.equal(c.wave, null, "held contact is NOT bucketed into a wave");
  }
  assert.equal(conf.held, conf.state.reactivationContacts.length, "held count = newly imported contacts");
  assert.equal(conf.heldMessage, CONSUMER_IMPORT_HELD_MESSAGE);
  assert.match(conf.heldMessage, /held for review/i);
  ok("confirm stamps campaign_hold=true / import_status=staged on newly imported contacts");
}

// ---- 14. releaseWave() does NOT enroll held contacts --------------------------
{
  // Force the held contacts onto wave 1 so releaseWave WOULD enroll them but for the hold.
  const onWave1 = { ...conf.state, reactivationContacts: conf.state.reactivationContacts.map((c) => ({ ...c, wave: 1 })) };
  const released = releaseWave(onWave1, 1, { now: "2026-07-01T00:00:00Z" });
  assert.equal(released.enrolled, 0, "no held contact enrolled by releaseWave");
  assert.ok(released.state.reactivationContacts.every((c) => !c.enrolled_at), "held contacts stay Not Enrolled after release");
  assert.ok(released.state.reactivationContacts.every((c) => c.sequence_status === "Not Enrolled"), "sequence_status unchanged");
  ok("held contacts are not enrolled by releaseWave()");
}

// ---- 15. planReactivation() ignores held; actReactivation() makes no attempt ---
{
  const IN_WINDOW = new Date("2026-07-02T15:00:00Z"); // Thu ~11:00 ET, inside the send window
  // Make the held contacts look fully due (wave 1, enrolled, released active campaign).
  const due = {
    ...conf.state,
    reactivationContacts: conf.state.reactivationContacts.map((c) => ({ ...c, wave: 1, enrolled_at: "2026-06-01T00:00:00Z" })),
    reactivationCampaign: { campaignId: "mvp-reactivation", releasedWaves: [1], status: "active" }
  };
  assert.equal(planReactivation(due, { now: IN_WINDOW }).proposals.length, 0, "held contacts are not due");
  // Control: with the hold removed, the SAME contacts ARE due — proves the hold is the blocker.
  const unheld = { ...due, reactivationContacts: due.reactivationContacts.map((c) => ({ ...c, campaign_hold: false })) };
  assert.ok(planReactivation(unheld, { now: IN_WINDOW }).proposals.length > 0, "without hold the contacts would be due");
  ok("held contacts are ignored by planReactivation() (control proves the gate)");
}
{
  const IN_WINDOW = new Date("2026-07-02T15:00:00Z");
  const due = {
    ...conf.state,
    reactivationContacts: conf.state.reactivationContacts.map((c) => ({ ...c, wave: 1, enrolled_at: "2026-06-01T00:00:00Z" })),
    reactivationCampaign: { campaignId: "mvp-reactivation", releasedWaves: [1], status: "active" }
  };
  const acted = await actReactivation(due, { now: IN_WINDOW }); // no live dep -> dry-run path
  assert.ok(!(acted.state.reactivationAttempts && acted.state.reactivationAttempts.length), "held contacts generate no attempts");
  ok("held contacts generate no reactivationAttempts");
}

// ---- 16. Existing enrolled contact is NOT force-held on re-import --------------
{
  const aliceId = conf.state.reactivationContacts.find((c) => c.email === "alice@example.com").contact_id;
  // Pre-existing, enrolled, NOT held (e.g. a live campaign contact).
  const live = {
    reactivationContacts: [{
      contact_id: aliceId, email: "alice@example.com", wave: 1, enrolled_at: "2026-02-01T00:00:00Z",
      sequence_status: "Enrolled", campaign_id: "mvp-reactivation"
    }]
  };
  const reimport = confirmConsumerImport(live, BASE_CSV, { listType: "consumer", sourceNote: "re-sync", now: "2026-09-01T00:00:00Z" });
  const alice = reimport.state.reactivationContacts.find((c) => c.contact_id === aliceId);
  assert.notEqual(alice.campaign_hold, true, "existing enrolled contact is NOT force-held");
  assert.equal(alice.enrolled_at, "2026-02-01T00:00:00Z", "enrolled_at preserved");
  assert.equal(alice.sequence_status, "Enrolled", "sequence_status preserved");
  assert.equal(alice.source_note, "re-sync", "provenance still stamped on the existing contact");
  ok("re-import does not sweep an already-enrolled contact into a hold");
}

// ---- warning ------------------------------------------------------------------
assert.equal(prev.warning, CONSUMER_IMPORT_WARNING);
assert.match(prev.warning, /nothing sends/i);
ok("preview surfaces the 'nothing sends from import' warning");

console.log(`\nAll ${passed} consumer-list-import checks passed.`);
