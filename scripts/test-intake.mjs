#!/usr/bin/env node
// Dead-simple intake tests — type detection, sensitive-column warnings, preview purity,
// approval-before-risky-action, no-send behavior, no duplicates, sticky do-not-contact,
// persistence registration, and plain-English (no-jargon) output.
import assert from "node:assert/strict";
import {
  INTAKE_TYPES, INTAKE_ACTIONS, INTAKE_WARNING, INTAKE_AGENT_ID,
  detectIntakeType, detectSensitiveHeaders, inspectCsv, parseGenericPeopleRows,
  previewIntake, confirmIntake, verifyIntakeWrite
} from "./intake.mjs";
import { QUEUE_ITEM_TYPES, companyContactId } from "./company-memory.mjs";
import { coreStateCollections } from "./storage.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = "2026-07-03T12:00:00.000Z";
const OPTS = { sourceNote: "test upload", fileName: "list.csv", now: NOW };

const PROSPECT_CSV = [
  "Email,First Name,Organization,Website",
  "ann@acmelegal.org,Ann,Acme Legal Aid,https://acmelegal.org",
  "bo@waco.gov,Bo,City of Waco,waco.gov",
  "ann@acmelegal.org,Ann,Acme Legal Aid,acmelegal.org",
  ",Nobody,No Email Org,"
].join("\n");

const SENSITIVE_CSV = [
  "email,name,ssn,date_of_birth,case_number,charge",
  "p1@example.org,Pat,123-45-6789,1990-01-01,CR-1234,felony theft"
].join("\n");

// ---------------------------------------------------------------------------------------------

check("every intake type declares a valid queue type and allowed actions", () => {
  for (const [key, def] of Object.entries(INTAKE_TYPES)) {
    assert(QUEUE_ITEM_TYPES.includes(def.queueType), `${key} queueType "${def.queueType}" is not a known queue type`);
    assert(def.actions.length > 0 && def.actions.includes(def.defaultAction), `${key} default action must be allowed`);
    for (const action of def.actions) assert(INTAKE_ACTIONS[action], `${key} allows unknown action "${action}"`);
  }
});

check("intake writes only into collections registered for persistence", () => {
  // Every collection confirmIntake can touch must be in coreStateCollections (the "B1 trap").
  for (const name of ["queueItems", "companyContacts", "companyOrganizations", "companyEvents", "agentRuns", "approvals", "reactivationContacts", "expungementLifecycleContacts", "expungementLifecycleEvents"]) {
    assert(coreStateCollections.includes(name), `${name} missing from coreStateCollections`);
  }
});

check("type detection recognizes lifecycle, prospect, revenue, and social headers", () => {
  assert.equal(detectIntakeType(["email", "lifecycle_stage", "checkout_status"], "export.csv").type, "expungement_lifecycle");
  assert.equal(detectIntakeType(["Email", "Organization", "EIN"], "prospects.csv").type, "rcap_prospects");
  assert.equal(detectIntakeType(["invoice", "amount", "paid"], "q2.csv").type, "revenue_workbook");
  assert.equal(detectIntakeType(["platform", "caption", "hashtags"], "posts.csv").type, "social_calendar");
  const none = detectIntakeType(["colA", "colB"], "mystery.csv");
  assert.equal(none.type, "unknown");
});

check("detection reasons are plain English", () => {
  const d = detectIntakeType(["email", "lifecycle_stage", "screening_status"], "expungement-export.csv");
  assert.equal(d.confidence, "strong");
  assert(/columns look like/i.test(d.reason));
});

check("sensitive columns are detected and warned about", () => {
  const warnings = detectSensitiveHeaders(["email", "SSN", "Date of Birth", "case_number", "charge", "home_address"]);
  const notes = warnings.map((w) => w.note);
  assert(notes.includes("Social Security numbers"));
  assert(notes.includes("dates of birth"));
  assert(notes.includes("case or docket numbers"));
  assert(notes.includes("criminal record details"));
  for (const w of warnings) assert(/never imported/.test(w.message));
});

check("header inspection counts emails, duplicates, and missing values", () => {
  const inspection = inspectCsv(PROSPECT_CSV, "prospects.csv");
  assert.equal(inspection.rowCount, 4);
  assert.equal(inspection.withEmail, 2);
  assert.equal(inspection.duplicateEmails, 1);
  assert.equal(inspection.missingEmail, 1);
  assert.equal(inspection.hasEmailColumn, true);
});

check("preview is pure — it never writes state", () => {
  const state = { companyContacts: [], queueItems: [] };
  const frozen = JSON.stringify(state);
  const preview = previewIntake(state, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects" });
  assert.equal(preview.writesState, false);
  assert.equal(JSON.stringify(state), frozen, "preview mutated state");
  assert.equal(preview.warning, INTAKE_WARNING);
});

check("preview warns when the declared type disagrees with a strong detection", () => {
  const csv = "email,lifecycle_stage,checkout_status\na@b.org,paid,complete";
  const preview = previewIntake({}, csv, { ...OPTS, intakeType: "support_list", fileName: "expungement-lifecycle.csv" });
  assert(preview.warnings.some((w) => /looks more like/i.test(w)), "expected a type-mismatch warning");
});

check("preview coerces a disallowed action with a plain-English note", () => {
  const preview = previewIntake({}, "email\na@b.org", { ...OPTS, intakeType: "revenue_workbook", afterAction: "draft_outreach" });
  assert.equal(preview.afterAction, "review_only");
  assert(preview.warnings.some((w) => /not available/.test(w)));
});

check("preview requires type, source note, and content", () => {
  assert.throws(() => previewIntake({}, "email\na@b.org", { sourceNote: "x", intakeType: "nope" }));
  assert.throws(() => previewIntake({}, "email\na@b.org", { intakeType: "consumer" }));
  assert.throws(() => previewIntake({}, "", { ...OPTS, intakeType: "consumer" }));
});

check("confirm add_to_contacts writes deduped contacts + organizations and an audit trail", () => {
  const result = confirmIntake({}, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects" });
  assert.equal(result.counts.added, 2);
  assert.equal(result.counts.skippedNoEmail, 1);
  assert.equal(result.counts.organizations, 2);
  assert.equal(result.state.companyContacts.length, 2);
  assert.equal(result.state.companyOrganizations.length, 2);
  const ann = result.state.companyContacts.find((c) => c.email === "ann@acmelegal.org");
  assert(ann.types.includes("prospect"));
  assert.equal(result.state.companyEvents.length, 1);
  assert.equal(result.state.agentRuns.length, 1);
  assert.equal(result.state.agentRuns[0].agent, INTAKE_AGENT_ID);
  assert.equal(result.state.approvals.length, 1, "confirmed import writes an approval audit record");
  assert.equal(result.state.approvals[0].state, "executed");
  assert.equal(result.verified.ok, true);
});

check("re-importing the same list merges — no duplicate contacts, orgs, or events", () => {
  const first = confirmIntake({}, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects" });
  const second = confirmIntake(first.state, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects" });
  assert.equal(second.counts.added, 0);
  assert.equal(second.counts.merged, 2);
  assert.equal(second.state.companyContacts.length, 2);
  assert.equal(second.state.companyOrganizations.length, 2);
  assert.equal(second.state.companyEvents.length, 1, "same import summary dedupes by stable id");
});

check("review_only writes NO contacts and puts one review item on the Queue", () => {
  const result = confirmIntake({}, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects", afterAction: "review_only" });
  assert.equal((result.state.companyContacts || []).length, 0);
  assert.equal(result.state.queueItems.length, 1);
  const item = result.state.queueItems[0];
  assert.equal(item.status, "needs_roger");
  assert(/needs review/i.test(item.title));
});

check("suppress marks people do-not-contact and the mark is sticky on re-import", () => {
  const suppressed = confirmIntake({}, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects", afterAction: "suppress" });
  for (const c of suppressed.state.companyContacts) assert.equal(c.do_not_contact, true);
  // A later plain add must NOT clear the mark.
  const later = confirmIntake(suppressed.state, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects", afterAction: "add_to_contacts" });
  for (const c of later.state.companyContacts) assert.equal(c.do_not_contact, true, "do-not-contact must stay sticky");
  assert.equal(later.verified.ok, true);
});

check("draft_outreach requires approval: requested approval + needs_roger queue item, nothing executed", () => {
  const result = confirmIntake({}, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects", afterAction: "draft_outreach" });
  assert(result.approvalRequested, "an approval id must be returned");
  const requested = result.state.approvals.find((a) => a.id === result.approvalRequested);
  assert.equal(requested.state, "requested");
  assert.equal(requested.executed_at, "");
  const item = result.state.queueItems.find((q) => q.approvalId === result.approvalRequested);
  assert(item, "queue item linked to the approval");
  assert.equal(item.requiresApproval, true);
  assert.equal(item.status, "needs_roger");
});

check("sensitive columns create a review queue item and are never imported", () => {
  const result = confirmIntake({}, SENSITIVE_CSV, { ...OPTS, intakeType: "support_list", afterAction: "add_to_contacts" });
  const item = result.state.queueItems.find((q) => /sensitive/i.test(q.title));
  assert(item, "sensitive-columns review item expected");
  const contact = result.state.companyContacts[0];
  const stored = JSON.stringify(contact);
  assert(!/123-45-6789|CR-1234|felony|1990-01-01/.test(stored), "sensitive values leaked into the contact record");
  assert.equal(result.state.companyEvents[0].sensitive, true);
});

check("consumer route stages contacts held through the existing reactivation import", () => {
  const csv = "email,first_name\nnew1@example.org,Nia\nnew2@example.org,Ned";
  const result = confirmIntake({}, csv, { ...OPTS, intakeType: "consumer", fileName: "reactivation.csv" });
  assert.equal(result.counts.staged, 2);
  assert.equal(result.counts.held, 2);
  const contacts = result.state.reactivationContacts;
  assert.equal(contacts.length, 2);
  for (const c of contacts) {
    assert.equal(c.campaign_hold, true, "imported consumer contacts must be held");
    assert(!c.enrolled_at, "import must never enroll");
    assert(!c.wave, "held contacts get no wave");
  }
});

check("expungement route stages lifecycle contacts always held, suppressed people excluded", () => {
  const csv = [
    "email,first_name,lifecycle_stage,unsubscribed",
    "go@example.org,Gia,checkout_abandoned,",
    "no@example.org,Non,checkout_abandoned,true"
  ].join("\n");
  const result = confirmIntake({}, csv, { ...OPTS, intakeType: "expungement_lifecycle", fileName: "lifecycle.csv" });
  assert.equal(result.counts.added, 2, "both lifecycle contacts recorded");
  const staged = result.state.reactivationContacts || [];
  assert.equal(staged.length, 1, "unsubscribed person must not be staged for campaigns");
  assert.equal(staged[0].campaign_hold, true);
});

check("NO send machinery is ever touched by any intake action", () => {
  const sendCollections = ["reactivationSendLedger", "outreachSendLedger", "reactivationBounceLedger"];
  for (const [type, def] of Object.entries(INTAKE_TYPES)) {
    for (const action of def.actions) {
      const csv = type === "expungement_lifecycle"
        ? "email,lifecycle_stage\nx@example.org,paid"
        : "email,name,organization\nx@example.org,Xa,Org Inc";
      const result = confirmIntake({}, csv, { ...OPTS, intakeType: type, afterAction: action });
      for (const col of sendCollections) {
        assert.equal(result.state[col], undefined, `${type}/${action} touched ${col}`);
      }
      const dump = JSON.stringify(result.lines) + JSON.stringify(result.headline);
      assert(!/emails? (was|were) sent|sent \d|delivered to|now published/i.test(dump), `${type}/${action} claims a send happened`);
    }
  }
});

check("user-facing intake copy carries no engineering jargon", () => {
  const surfaces = [];
  for (const def of Object.values(INTAKE_TYPES)) surfaces.push(def.label, def.description);
  for (const action of Object.values(INTAKE_ACTIONS)) surfaces.push(action.label, action.happens);
  const result = confirmIntake({}, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects", afterAction: "draft_outreach" });
  surfaces.push(result.headline, ...result.lines);
  for (const q of result.state.queueItems) surfaces.push(q.title, q.summary, q.recommendation);
  for (const field of surfaces) {
    assert(!/\b(heartbeat|mutex|registry|lease|reducer|endpoint|payload|upsert)\b|act\(\)|JSON/i.test(String(field)), `jargon leaked into: ${field}`);
  }
});

check("verification recounts from the written state and fails honestly on a bad write", () => {
  const good = confirmIntake({}, PROSPECT_CSV, { ...OPTS, intakeType: "rcap_prospects" });
  assert.equal(good.verified.ok, true);
  // Simulate a lost write: verification against an empty state must NOT claim success.
  const bad = verifyIntakeWrite({ companyContacts: [] }, { intakeType: "rcap_prospects", afterAction: "add_to_contacts", csvText: PROSPECT_CSV });
  assert.equal(bad.ok, false);
});

check("generic row parsing keeps only identity fields", () => {
  const rows = parseGenericPeopleRows(SENSITIVE_CSV);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["domain", "email", "name", "organization"]);
});

check("contact ids stay canonical with Company Memory", () => {
  const result = confirmIntake({}, "email,name\nsame@example.org,Sam", { ...OPTS, intakeType: "partner_contacts", afterAction: "add_to_contacts" });
  assert.equal(result.state.companyContacts[0].contact_id, companyContactId("same@example.org"));
});

console.log(`\nAll ${passed} intake checks passed.`);
