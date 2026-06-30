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
  CONSUMER_LIST_TYPE, CONSUMER_IMPORT_WARNING
} from "./consumer-list-import.mjs";
import { permissionForRequest, authorizeRequest } from "./access-control.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const NOW = "2026-06-29T00:00:00Z";
const SRC = { listType: "consumer", sourceNote: "manual export" };

// Common-header CSV: mixed casing, missing fields, a duplicate, an invalid email, a missing email,
// and a quoted name containing a comma.
const BASE_CSV = [
  "Email,First Name,Full Name,Phone,Priority",
  "alice@gmail.com,Alice,Alice Smith,555-1,warm",
  "bob@yahoo.com,,Bob Jones,,",                          // no first name -> fallback; no priority -> cold
  "alice@gmail.com,Alice,,,",                            // duplicate email
  "not-an-email,,No Email,,",                            // invalid email
  ",,Ghost,,",                                           // missing email
  '"carol@outlook.com",Carol,"Doe, Carol",555-3,'        // quoted comma in name; blank priority -> cold
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
  assert.equal(byEmail["carol@outlook.com"].priority, "cold", "blank priority -> cold");
  assert.equal(byEmail["bob@yahoo.com"].priority, "cold", "missing priority -> cold");
  assert.equal(byEmail["alice@gmail.com"].priority, "warm", "explicit priority preserved");
  ok("default priority is cold when missing");
  assert.equal(byEmail["bob@yahoo.com"].first_name, "Bob", "first-name fallback from full_name");
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
  const owner = authorizeRequest({ method: "POST", url: "/api/upload/consumer/confirm", headers: { authorization: "Bearer " + ownerToken } }, null, env);
  assert.equal(owner.ok, true, "owner token accepted");
  assert.equal(owner.actor.role, "owner");
}
ok("confirm + preview require auth/owner (write); anonymous rejected, owner accepted");

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

// ---- warning + idempotency ----------------------------------------------------
assert.equal(prev.warning, CONSUMER_IMPORT_WARNING);
assert.match(prev.warning, /nothing sends/i);
ok("preview surfaces the 'nothing sends from import' warning");
{
  const again = confirmConsumerImport(conf.state, BASE_CSV, { ...SRC, now: NOW });
  assert.equal(again.state.reactivationContacts.length, 3, "re-import does not duplicate");
  ok("re-import is idempotent (stable contact ids)");
}

console.log(`\nAll ${passed} consumer-list-import checks passed.`);
