// Held Contacts Review surface tests. Proves the operator review layer is READ-ONLY and exposes
// only safe, masked fields BEFORE any release-from-hold path exists:
//   1. The data builder never writes/mutates state.
//   2. Lifecycle contacts are counted by stage.
//   3. Held / staged / enrolled reactivation contacts are counted.
//   4. Suppressed / deleted / revoked-consent records are identified.
//   5. Review rows mask emails and exclude raw sensitive fields (no eligibility detail, no raw email).
//   6. The endpoint requires auth (GET => "read"); anonymous is rejected.
//   7. No send / wave / enroll / gate / autopilot behavior exists in the review path.

import assert from "node:assert";
import fs from "node:fs";
import {
  confirmExpungementSync, buildHeldContactsReview
} from "./expungement-lifecycle-sync.mjs";
import { permissionForRequest, authorizeRequest } from "./access-control.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const NOW = "2026-06-30T00:00:00Z";

// Build a realistic state: a sync confirm (lifecycle + held reactivation) plus a separately-enrolled
// reactivation contact so we can prove the enrolled count.
const RECORDS = [
  { email: "ab@gmail.com", first_name: "Ann", screening_status: "abandoned", state: "PA" },
  { email: "co@yahoo.com", first_name: "Cal", checkout_status: "abandoned" },
  { email: "cp@gmail.com", first_name: "Cam", screening_status: "completed" },
  { email: "pd@outlook.com", first_name: "Pat", payment_status: "paid" },
  { email: "un@gmail.com", first_name: "Uma", unsubscribed: true },
  { email: "de@gmail.com", first_name: "Ed", deleted_or_erasure_requested: true },
  { email: "rv@gmail.com", first_name: "Rev", consent_status: "revoked", eligibility_status_summary: "SECRET CASE DETAIL SHOULD NOT LEAK" }
];
const synced = confirmExpungementSync({}, RECORDS, { sourceNote: "nightly export", now: NOW });
const STATE = {
  ...synced.state,
  reactivationContacts: [
    ...synced.state.reactivationContacts,
    { contact_id: "enr1", email: "enrolled@gmail.com", enrolled_at: NOW, sequence_status: "Enrolled", wave: 1, campaign_id: "mvp-reactivation" }
  ]
};

// ---- 1. Builder does not write/mutate state -----------------------------------
{
  const snapshot = JSON.stringify(STATE);
  const review = buildHeldContactsReview(STATE);
  assert.equal(review.writesState, false, "review reports writesState=false");
  assert.equal(JSON.stringify(STATE), snapshot, "builder must not mutate input state");
  assert.ok(!("reactivationAttempts" in review), "review surfaces no send attempts");
  ok("held review builder does not write or mutate state");
}

const review = buildHeldContactsReview(STATE);

// ---- 2. Lifecycle contacts counted by stage -----------------------------------
{
  const s = review.lifecycleByStage;
  assert.equal(review.counts.totalLifecycleContacts, 7);
  assert.equal(s.screening_abandoned, 1);
  assert.equal(s.checkout_abandoned, 1);
  assert.equal(s.screening_completed, 1);
  assert.equal(s.paid, 1);
  assert.equal(s.unsubscribed, 1);
  assert.equal(s.deleted_or_erasure_requested, 1);
  assert.equal(s.unknown, 1, "revoked-consent-only record has no recognizable stage");
  ok("lifecycle contacts are counted by stage");
}

// ---- 3. Held / staged / enrolled counted --------------------------------------
{
  assert.equal(review.counts.heldReactivation, 3, "ab + co + cp staged & held");
  assert.equal(review.counts.staged, 3);
  assert.equal(review.counts.enrolled, 1, "the separately-enrolled contact");
  assert.equal(review.heldRows.length, 3);
  ok("held / staged / enrolled reactivation contacts are counted");
}

// ---- 4. Suppressed / deleted / revoked identified -----------------------------
{
  assert.equal(review.counts.excludedSuppressed, 3, "unsub + deleted + revoked");
  assert.equal(review.counts.deleted, 1);
  assert.equal(review.counts.revokedConsent, 1);
  assert.ok(review.lifecycleRows.some((r) => r.consent_status === "revoked" && r.suppressed), "revoked row flagged suppressed");
  assert.ok(review.lifecycleRows.some((r) => r.deleted_or_erasure_requested && r.suppressed), "deleted row flagged suppressed");
  ok("suppressed / deleted / revoked-consent records are identified");
}

// ---- 5. Masked emails + no raw sensitive fields -------------------------------
{
  assert.ok(review.heldRows.every((r) => /\*\*\*/.test(r.masked_email)), "held rows mask email");
  assert.ok(review.lifecycleRows.every((r) => /\*\*\*/.test(r.masked_email)), "lifecycle rows mask email");
  assert.ok(review.recentEvents.every((e) => /\*\*\*/.test(e.masked_email) || !/@/.test(e.masked_email)), "events mask email");
  // No raw email field and no raw eligibility/case detail anywhere in the rows or events.
  const allRows = [...review.heldRows, ...review.lifecycleRows, ...review.recentEvents];
  for (const row of allRows) {
    assert.ok(!("email" in row), "no raw email field");
    assert.ok(!("eligibility_status_summary" in row), "no eligibility summary field");
    assert.ok(!("eligibility_details" in row), "no eligibility details field");
  }
  // The secret eligibility string must never appear in the serialized review.
  assert.ok(!JSON.stringify(review).includes("SECRET CASE DETAIL"), "raw eligibility/case detail is never exposed");
  ok("review rows mask emails and exclude raw sensitive fields");
}

// ---- 6. Endpoint requires auth ------------------------------------------------
assert.equal(permissionForRequest("GET", "/api/contacts/held-review"), "read", "GET review requires read permission");
{
  const env = { COMMAND_CENTER_REQUIRE_AUTH: "true", COMMAND_CENTER_OWNER_TOKEN: "x".repeat(20) };
  const anon = authorizeRequest({ method: "GET", url: "/api/contacts/held-review", headers: {} }, null, env);
  assert.equal(anon.ok, false, "anonymous review rejected");
  assert.equal(anon.status, 401);
  const owner = authorizeRequest({ method: "GET", url: "/api/contacts/held-review", headers: { authorization: "Bearer " + "x".repeat(20) } }, null, env);
  assert.equal(owner.ok, true, "authenticated review allowed");
}
ok("held review endpoint requires auth; anonymous rejected, authenticated allowed");

// ---- 7. No send / wave / enroll / gate / autopilot in the review path ---------
{
  const src = fs.readFileSync(new URL("./expungement-lifecycle-sync.mjs", import.meta.url), "utf8");
  // Isolate the builder function body and assert it has no mutating/sending call sites.
  const start = src.indexOf("export function buildHeldContactsReview");
  assert.ok(start !== -1, "builder present");
  // Bound the slice to JUST the builder function (stop at the next top-level export), so unrelated
  // functions later in the module (e.g. applyHeldDisposition, which legitimately suppresses) don't
  // bleed into this structural check.
  const after = src.indexOf("\nexport ", start + 1);
  const body = src.slice(start, after === -1 ? undefined : after);
  for (const callSite of ["writeState", "recordSuppression(", "releaseWave(", "actReactivation(", "runOutreachSend(", "runReactivationSend(", ".send(", "enrolled_at:"]) {
    assert.ok(!body.includes(callSite), `held review builder must not contain ${callSite}`);
  }
  // Behavioral: review introduces no attempts/suppression/campaign mutation.
  const before = JSON.stringify(STATE);
  buildHeldContactsReview(STATE);
  assert.equal(JSON.stringify(STATE), before, "no state change from building the review");
  ok("no send/wave/enroll/gate/autopilot behavior in the held review path");
}

console.log(`\nAll ${passed} held-contacts-review checks passed.`);
