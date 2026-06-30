// Held Contact Disposition tests. Proves the operator can record what should happen to a held
// contact LATER without releasing, enrolling, sending, or wave-assigning anything:
//   1. Endpoint requires owner/admin; anonymous rejected.
//   2. Rejects non-held or enrolled contacts.
//   3. Disposition updates review_status / review_note / reviewed_at / reviewed_by.
//   4. campaign_hold stays true after EVERY disposition (and wave/enroll/sequence untouched).
//   5. "suppress" writes sticky suppression + do_not_contact, still no enroll/release/send/wave.
//   6. No SendGrid/send function in the disposition path. No live gate / autopilot change.
//   7. The held review reflects disposition fields; no raw sensitive detail is exposed.

import assert from "node:assert";
import fs from "node:fs";
import {
  confirmExpungementSync, applyHeldDisposition, buildHeldContactsReview,
  HELD_REVIEW_STATUSES, OPERATOR_REVIEWED_HOLD_REASON
} from "./expungement-lifecycle-sync.mjs";
import { contactIdForEmail, planReactivation, actReactivation } from "./reactivation-os.mjs";
import { permissionForRequest, authorizeRequest } from "./access-control.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }
const NOW = "2026-07-01T00:00:00Z";

// Build a state: two synced held contacts (ab, co), one held+enrolled (edge), one non-held plain.
const synced = confirmExpungementSync({}, [
  { email: "ab@gmail.com", first_name: "Ann", screening_status: "abandoned", state: "PA" },
  { email: "co@yahoo.com", first_name: "Cal", checkout_status: "abandoned" }
], { sourceNote: "x", now: "2026-06-30T00:00:00Z" });
const AB = contactIdForEmail("ab@gmail.com");
const CO = contactIdForEmail("co@yahoo.com");
const BASE_STATE = {
  ...synced.state,
  reactivationContacts: [
    ...synced.state.reactivationContacts,
    // held AND enrolled (must be rejected by the enrolled guard)
    { contact_id: "held-enrolled", email: "he@gmail.com", campaign_hold: true, enrolled_at: NOW, sequence_status: "Enrolled", wave: 1, campaign_id: "mvp-reactivation" },
    // not held
    { contact_id: "plain", email: "plain@gmail.com", campaign_id: "mvp-reactivation" }
  ]
};

// ---- 1. Endpoint auth ---------------------------------------------------------
assert.equal(permissionForRequest("POST", "/api/contacts/held-review/disposition"), "write");
{
  const env = { COMMAND_CENTER_REQUIRE_AUTH: "true", COMMAND_CENTER_OWNER_TOKEN: "x".repeat(20) };
  const anon = authorizeRequest({ method: "POST", url: "/api/contacts/held-review/disposition", headers: {} }, null, env);
  assert.equal(anon.ok, false);
  assert.equal(anon.status, 401, "anonymous disposition rejected");
  const owner = authorizeRequest({ method: "POST", url: "/api/contacts/held-review/disposition", headers: { authorization: "Bearer " + "x".repeat(20) } }, null, env);
  assert.equal(owner.ok, true);
  assert.equal(owner.actor.role, "owner");
}
ok("disposition endpoint requires owner/admin; anonymous rejected");

// ---- 2. Rejects non-held or enrolled contacts --------------------------------
{
  assert.throws(
    () => applyHeldDisposition(BASE_STATE, { contactIds: ["plain", "held-enrolled"], review_status: "keep_held", now: NOW }),
    (error) => {
      assert.equal(error.message, "Disposition can only update held, non-enrolled contacts.");
      const reasons = Object.fromEntries(error.rejected.map((s) => [s.contact_id, s.reason]));
      assert.equal(reasons["plain"], "not_held");
      assert.equal(reasons["held-enrolled"], "enrolled", "held+enrolled contact rejected by enrolled guard");
      return true;
    }
  );
  const r = applyHeldDisposition(BASE_STATE, { contact_id: AB, review_status: "keep_held", now: NOW });
  const plain = BASE_STATE.reactivationContacts.find((c) => c.contact_id === "plain");
  const he = BASE_STATE.reactivationContacts.find((c) => c.contact_id === "held-enrolled");
  assert.ok(!plain.review_status, "non-held contact not modified");
  assert.equal(he.sequence_status, "Enrolled", "enrolled contact not modified");
  assert.equal(r.updatedCount, 1, "snake_case contact_id is accepted");
  ok("rejects non-held or enrolled contacts");
}

// ---- 3 + 4. Disposition updates review fields; hold stays true -----------------
{
  for (const status of [...HELD_REVIEW_STATUSES]) {
    const r = applyHeldDisposition(BASE_STATE, { contactId: AB, review_status: status, review_note: "n-" + status, reviewed_by: "Roger", now: NOW });
    const ab = r.state.reactivationContacts.find((c) => c.contact_id === AB);
    assert.equal(ab.review_status, status, status + " applied");
    assert.equal(ab.review_note, "n-" + status);
    assert.equal(ab.reviewed_at, NOW);
    assert.equal(ab.reviewed_by, "Roger");
    assert.equal(ab.campaign_hold, true, "campaign_hold stays true for " + status);
    assert.equal(ab.campaign_hold_reason, OPERATOR_REVIEWED_HOLD_REASON);
    assert.ok(!ab.enrolled_at, "never enrolled");
    assert.equal(ab.wave, null, "never wave-assigned");
    assert.notEqual(ab.sequence_status, "Enrolled");
  }
  ok("disposition sets review_status/note/at/by; campaign_hold stays true; no enroll/wave");
}

// ---- 5. Suppress writes sticky suppression + do_not_contact, still inert -------
{
  const r = applyHeldDisposition(BASE_STATE, { contactId: CO, review_status: "suppress", now: NOW });
  const co = r.state.reactivationContacts.find((c) => c.contact_id === CO);
  assert.equal(co.do_not_contact, true, "do_not_contact set");
  assert.equal(co.campaign_hold, true, "still held");
  assert.equal(co.import_status, "suppressed");
  assert.ok(!co.enrolled_at && co.wave === null, "not enrolled, no wave");
  assert.ok((r.state.outreachSuppressions || []).some((s) => /co@yahoo/.test(s.email)), "sticky suppression written");
  assert.ok(r.state.expungementLifecycleContacts.some((c) => c.email === "co@yahoo.com"), "lifecycle record preserved");
  // No attempts; planReactivation never proposes the suppressed contact even if forced due.
  const forced = {
    ...r.state,
    reactivationContacts: r.state.reactivationContacts.map((c) => c.contact_id === CO ? { ...c, enrolled_at: "2026-06-01T00:00:00Z", wave: 1 } : c),
    reactivationCampaign: { campaignId: "mvp-reactivation", releasedWaves: [1], status: "active" }
  };
  const plan = planReactivation(forced, { now: new Date("2026-07-02T15:00:00Z") });
  assert.ok(!plan.proposals.some((p) => p.contact.contact_id === CO), "suppressed contact never proposed");
  ok("suppress writes sticky suppression + do_not_contact; no enroll/release/send/wave");
}

// ---- 6. No send/gate path; behavioral no-attempts -----------------------------
{
  const src = fs.readFileSync(new URL("./expungement-lifecycle-sync.mjs", import.meta.url), "utf8");
  const start = src.indexOf("export function applyHeldDisposition");
  const body = src.slice(start);
  for (const callSite of ["releaseWave(", "actReactivation(", "runOutreachSend(", "runReactivationSend(", ".send(", "enrolled_at:", "autopilot"]) {
    assert.ok(!body.includes(callSite), "disposition must not contain " + callSite);
  }
  const r = applyHeldDisposition(BASE_STATE, { contactId: AB, review_status: "approved_for_later", now: NOW });
  assert.ok(!(r.state.reactivationAttempts && r.state.reactivationAttempts.length), "no send attempts");
  assert.ok(!("autopilotSettings" in r.state), "no autopilot settings written");
  assert.ok(!("reactivationCampaign" in r.state) || JSON.stringify(r.state.reactivationCampaign) === JSON.stringify(BASE_STATE.reactivationCampaign), "campaign config unchanged");
  ok("no send function called; no live-send/autopilot change in disposition");
}

// ---- 7. Held review reflects disposition; no raw sensitive detail --------------
{
  const r = applyHeldDisposition(BASE_STATE, { contactId: AB, review_status: "approved_for_later", review_note: "good fit", reviewed_by: "Roger", now: NOW });
  const review = buildHeldContactsReview(r.state);
  const row = review.heldRows.find((x) => x.contact_id === AB);
  assert.ok(row, "held row present");
  assert.equal(row.review_status, "approved_for_later", "review reflects disposition");
  assert.equal(row.review_note, "good fit");
  assert.ok(/\*\*\*/.test(row.masked_email), "email masked in review");
  assert.ok(!("email" in row), "no raw email");
  assert.ok(!("eligibility_status_summary" in row), "no eligibility detail");
  assert.ok(!JSON.stringify(review).includes("eligibility_details"), "no raw case detail exposed");
  ok("held review reflects disposition fields; no raw sensitive detail exposed");
}

console.log(`\nAll ${passed} held-contact-disposition checks passed.`);
