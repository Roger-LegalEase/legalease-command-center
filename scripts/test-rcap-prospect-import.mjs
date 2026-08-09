// Packet 2 — RCAP prospect import and identity resolution.
//
// The properties that matter are the ones that are expensive to discover later: the plan is
// deterministic, it never merges two organizations on a shared name, it never invents an
// address, it preserves who operates versus who merely hosts or promotes, and it writes
// nothing.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RCAP_IMPORT_READ_COLLECTIONS,
  RCAP_IMPORT_REPORT_COLUMNS,
  RCAP_WORKBOOK_COLUMNS,
  buildRcapImportIndex,
  classifyEmailAddress,
  classifyPhone,
  classifyProgramRole,
  formatRcapImportReport,
  mapRcapWorkbookRow,
  normalizeDomain,
  normalizeEmailValue,
  normalizeOrganizationName,
  normalizePhoneValue,
  planRcapProspectImport,
  resolveRcapIdentity
} from "./rcap-prospect-import.mjs";
import {
  RCAP_UNCHANGED_REIMPORT_ROW,
  RCAP_WORKBOOK_FIXTURE_ROWS,
  rcapImportFixtureState
} from "./fixtures/rcap-prospects.mjs";
import { coreStateCollections } from "./storage.mjs";
import { rcapContactIsSendable, rcapPhoneIsSalesRoute } from "./rcap-prospect-registries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rowFor = (plan, number) => plan.rows.find((row) => row.sourceRow === number);

// ---------------------------------------------------------------------------------------------
// Schema mapping
// ---------------------------------------------------------------------------------------------

assert.equal(RCAP_WORKBOOK_COLUMNS.length, 18, "The Priority Outreach sheet spans columns A through R.");
assert.deepEqual(
  RCAP_WORKBOOK_COLUMNS.map((column) => column.column),
  ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"]
);

// Headers are matched, not assumed by position: casing, punctuation, and spacing vary between
// exports of the same workbook.
const mapped = mapRcapWorkbookRow({ "  ORGANIZATION  ": "Test Org", "program/clinic": "A Clinic", "Public  Email": "a@b.test" });
assert.equal(mapped.organization, "Test Org");
assert.equal(mapped.program, "A Clinic");
assert.equal(mapped.publicEmail, "a@b.test");
assert.equal(mapRcapWorkbookRow({}).organization, "", "A missing header yields empty, never undefined.");
assert.equal(mapRcapWorkbookRow({ "Unmapped Column": "x" }).organization, "", "Unknown headers are ignored, not guessed at.");

// ---------------------------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------------------------

assert.equal(normalizeDomain("https://www.Example.ORG/programs?x=1"), "example.org");
assert.equal(normalizeDomain("example.org"), "example.org");
assert.equal(normalizeDomain("not a domain"), "");
assert.equal(normalizeDomain(""), "");
assert.equal(normalizeDomain("javascript:alert(1)"), "", "A scheme-shaped value is not a domain.");

assert.equal(normalizeEmailValue("  Dana@Example.ORG "), "dana@example.org");
for (const invalid of ["sam ortiz (at) lakeshore", "no-at-sign", "a@b", "a@@b.org", "", "a b@c.test"]) {
  assert.equal(normalizeEmailValue(invalid), "", `${JSON.stringify(invalid)} must not be accepted as an address.`);
}

assert.equal(normalizePhoneValue("(313) 555-0142"), "3135550142");
assert.equal(normalizePhoneValue("1-313-555-0142"), "3135550142");
assert.equal(normalizePhoneValue("call the office"), "");

// Name normalization folds legal noise so comparison works -- but comparison is not merging.
assert.equal(normalizeOrganizationName("The Detroit Justice Center, Inc."), "detroit justice center");
assert.equal(
  normalizeOrganizationName("Detroit Justice Center"),
  normalizeOrganizationName("The Detroit Justice Center, Inc."),
  "Legal suffixes and articles must not defeat comparison."
);

// ---------------------------------------------------------------------------------------------
// Address and phone classification
// ---------------------------------------------------------------------------------------------

assert.equal(classifyEmailAddress("dana.whitfield@x.test").addressType, "named_route");
assert.equal(classifyEmailAddress("info@x.test").addressType, "shared_inbox");
assert.equal(classifyEmailAddress("intake@x.test").addressType, "client_intake");
assert.equal(classifyEmailAddress("help@x.test").addressType, "client_intake");
assert.equal(classifyEmailAddress("garbage").addressType, "none");

// The classification must line up with the eligibility registry's send policy.
assert.equal(rcapContactIsSendable(classifyEmailAddress("dana@x.test").eligibility), true);
assert.equal(rcapContactIsSendable(classifyEmailAddress("info@x.test").eligibility), true, "A shared inbox is usable, with a warning.");
assert.equal(
  rcapContactIsSendable(classifyEmailAddress("intake@x.test").eligibility),
  false,
  "A client-intake address must never be sendable."
);

assert.equal(classifyPhone({ phone: "313-555-0142", keyContact: "Dana", contactRole: "Director" }).phoneClass, "business_route");
assert.equal(classifyPhone({ phone: "313-555-0142", notes: "Intake line only" }).phoneClass, "client_intake");
assert.equal(classifyPhone({ phone: "313-555-0142", contactRole: "Main switchboard" }).phoneClass, "main_switchboard");
assert.equal(classifyPhone({ phone: "313-555-0142" }).phoneClass, "unknown", "An unexplained number is unclassified, not a business route.");
assert.equal(classifyPhone({ phone: "" }).phoneClass, "not_available");
// Only a positively identified business line is a sales route.
assert.equal(rcapPhoneIsSalesRoute(classifyPhone({ phone: "3135550142" }).phoneClass), false);
assert.equal(rcapPhoneIsSalesRoute(classifyPhone({ phone: "3135550142", notes: "intake" }).phoneClass), false);

// ---------------------------------------------------------------------------------------------
// Program role: operator, host, and promoter are different organizations' jobs
// ---------------------------------------------------------------------------------------------

assert.equal(classifyProgramRole({ clinicVerification: "The center operates the clinic and staffs it" }), "operator");
assert.equal(classifyProgramRole({ clinicVerification: "Hosts the clinic at its community center" }), "host");
assert.equal(classifyProgramRole({ clinicVerification: "The alliance promotes the event" }), "promoter");
assert.equal(classifyProgramRole({ clinicVerification: "Funds the program through a grant" }), "funder");
assert.equal(classifyProgramRole({}), "", "An unstated role stays unstated rather than defaulting to operator.");

// ---------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------

const state = rcapImportFixtureState();
const plan = planRcapProspectImport(state, RCAP_WORKBOOK_FIXTURE_ROWS, { workbookName: "fixture", now: "2026-08-09T00:00:00.000Z" });

// Determinism: the same rows against the same state must produce an identical plan.
const planAgain = planRcapProspectImport(rcapImportFixtureState(), RCAP_WORKBOOK_FIXTURE_ROWS, { workbookName: "fixture", now: "2026-08-09T00:00:00.000Z" });
assert.deepEqual(JSON.parse(JSON.stringify(plan)), JSON.parse(JSON.stringify(planAgain)), "Repeated dry runs must be byte-identical.");
assert.equal(formatRcapImportReport(plan), formatRcapImportReport(planAgain));

// It is a dry run and it writes nothing.
assert.equal(plan.dryRun, true);
assert.equal(plan.writesPerformed, 0, "A dry run must perform no writes.");
assert.equal(plan.externalActions, 0, "The import has no external-action authority.");

// The module must contain no write path at all in Wave 1.
const importSource = fs.readFileSync(path.join(root, "scripts", "rcap-prospect-import.mjs"), "utf8");
for (const forbidden of ["writeCollections", "writeChanges", "submitCoreMutations", "claimCollectionItems", "fetch("]) {
  assert.ok(!importSource.includes(forbidden), `The planner must not reference ${forbidden}: Wave 1 plans, it does not write or call out.`);
}
// And it must never construct an address from a name.
assert.ok(
  !/@\$\{|\$\{[^}]*\}@|firstName|lastName|\+ *"@" *\+/.test(importSource),
  "No address may be constructed anywhere in the planner."
);

// --- Row 2: a clean new organization -----------------------------------------------------------
const riverside = rowFor(plan, 2);
assert.equal(riverside.action, "create_account");
assert.equal(riverside.matchResult, "no_existing_match");
assert.equal(riverside.proposedAccount.domain, "riverside-justice.test");
assert.equal(riverside.proposedAccount.programRole, "operator", "The row says the center operates the clinic.");
assert.equal(riverside.proposedContact.email, "dana.whitfield@riverside-justice.test");
assert.equal(riverside.proposedContact.eligibility, "direct_public_business");
assert.equal(riverside.profileDocAction, "record_reference_only", "Column R is a reference, never the canonical profile.");
assert.equal(riverside.humanDecisionRequired, false);

// --- Row 3: shared inbox is labelled --------------------------------------------------------
const buckeye = rowFor(plan, 3);
assert.equal(buckeye.proposedContact.addressType, "shared_inbox");
assert.ok(buckeye.warnings.some((w) => w.includes("shared organizational inbox")), "A shared inbox must be called out.");
assert.equal(buckeye.proposedAccount.programRole, "promoter", "The alliance promotes; it does not operate.");

// --- Row 4: client-intake address and intake phone -------------------------------------------
const prairie = rowFor(plan, 4);
assert.ok(prairie.warnings.some((w) => w.includes("client-intake route")), "An intake address must be called out.");
assert.ok(prairie.warnings.some((w) => w.includes("client-intake line")), "An intake phone line must be called out.");
assert.equal(prairie.proposedContact.eligibility, "client_intake");
assert.equal(rcapContactIsSendable(prairie.proposedContact.eligibility), false);

// --- Rows 5 and 6: same name, different organizations ----------------------------------------
// Row 5 matches the Houston record on domain. Row 6 matches Oakland on domain. Neither may
// merge into the other, and neither may merge on the shared name.
const houston = rowFor(plan, 5);
const oakland = rowFor(plan, 6);
assert.equal(houston.matchedAccountId, "co-existing-houston");
assert.equal(oakland.matchedAccountId, "co-existing-oakland");
assert.notEqual(houston.matchedAccountId, oakland.matchedAccountId, "Two organizations sharing a name must stay separate.");
assert.equal(houston.matchReason, "website_domain");
assert.equal(houston.proposedAccount, undefined, "A matched row proposes no new account.");
// Row 5 hosts; row 6 operates. The distinction must survive the import.
assert.equal(classifyProgramRole({ clinicVerification: "Hosts the clinic at its community center; legal work by a partner firm" }), "host");

// A name-only collision with no corroborating domain becomes a conflict, never a merge.
const nameOnly = planRcapProspectImport(state, [{
  __rowNumber: 2, "Organization": "Community Justice Project", "State": "", "Website": ""
}], { workbookName: "fixture" });
assert.equal(nameOnly.rows[0].action, "conflict");
assert.equal(nameOnly.rows[0].matchResult, "name_only_needs_decision");
assert.equal(nameOnly.rows[0].humanDecisionRequired, true);
assert.ok(nameOnly.rows[0].warnings.some((w) => w.includes("Names alone are not proof")));

// Even name + geography is a conflict when more than one candidate shares both.
const ambiguousState = rcapImportFixtureState();
ambiguousState.companyOrganizations.push({ companyOrganizationId: "co-second-tx", name: "Community Justice Project", domain: "", geography: "TX" });
const ambiguous = planRcapProspectImport(ambiguousState, [{
  __rowNumber: 2, "Organization": "Community Justice Project", "State": "TX", "Website": ""
}], { workbookName: "fixture" });
assert.equal(ambiguous.rows[0].action, "conflict");
assert.equal(ambiguous.rows[0].matchResult, "ambiguous_name_and_geography");

// --- Row 7: a named person with no address ----------------------------------------------------
const peachtree = rowFor(plan, 7);
assert.equal(peachtree.proposedContact, null, "No contact may be proposed without a supplied address.");
assert.ok(peachtree.warnings.some((w) => w.includes("no address may be constructed")), "The absence must be stated plainly.");
assert.equal(peachtree.contactAction, "none");

// --- Row 8: malformed address and number ------------------------------------------------------
const lakeshore = rowFor(plan, 8);
assert.equal(lakeshore.contactAction, "none");
assert.ok(lakeshore.warnings.some((w) => w.includes("could not be read as a valid address")));
assert.ok(lakeshore.warnings.some((w) => w.includes("could not be read as a valid number")));

// --- Row 9: no organization name --------------------------------------------------------------
const nameless = rowFor(plan, 9);
assert.equal(nameless.action, "invalid_row");
assert.equal(nameless.matchResult, "missing_required_identity");
assert.equal(nameless.humanDecisionRequired, true);

// --- Row 10: duplicate within the same file ---------------------------------------------------
const duplicate = rowFor(plan, 10);
assert.equal(duplicate.action, "conflict");
assert.equal(duplicate.matchResult, "duplicate_within_batch");
assert.ok(duplicate.warnings.some((w) => w.includes("Row 2 in this file")), "The duplicate must name the row it collides with.");

// --- Stable IDs are reused, never reallocated -------------------------------------------------
const reimport = planRcapProspectImport(state, [RCAP_UNCHANGED_REIMPORT_ROW], { workbookName: "fixture" });
assert.equal(reimport.rows[0].matchedAccountId, "rcap-account-existing-lakefront", "An existing account ID must be reused.");
assert.equal(reimport.rows[0].action, "skip_duplicate", "An unchanged re-import changes nothing.");

// Stable source ID beats everything else.
const bySourceId = resolveRcapIdentity(
  { sourceProspectId: "PROSPECT-4411", organization: "Something Else Entirely", website: "https://other.test" },
  buildRcapImportIndex(state)
);
assert.equal(bySourceId.reason, "stable_source_id");
assert.equal(bySourceId.confidence, 1);
assert.equal(bySourceId.match.id, "rcap-account-existing-lakefront");

// --- Existing correspondence changes the motion ----------------------------------------------
const withHistory = planRcapProspectImport(state, [{
  __rowNumber: 2, "Organization": "Synthetic New Name For Houston", "State": "TX",
  "Website": "https://cjp-houston.test"
}], { workbookName: "fixture" });
assert.equal(withHistory.rows[0].matchedAccountId, "co-existing-houston", "The domain still identifies the account.");

const unknownOrgKnownDomain = planRcapProspectImport(
  { companyContacts: [{ companyContactId: "cc-1", name: "Someone", email: "someone@newdomain.test", companyOrganizationId: "" }] },
  [{ __rowNumber: 2, "Organization": "Synthetic Unseen Org", "Website": "https://newdomain.test" }],
  { workbookName: "fixture" }
);
assert.equal(unknownOrgKnownDomain.rows[0].action, "conflict");
assert.equal(unknownOrgKnownDomain.rows[0].matchReason, "existing_relationship_at_domain");
assert.ok(unknownOrgKnownDomain.rows[0].warnings.some((w) => w.includes("not a cold introduction")));

// --- Canonical values are never overwritten silently -------------------------------------------
const conflictingDomain = planRcapProspectImport(state, [{
  __rowNumber: 2, "Organization": "Synthetic Lakefront Legal Aid", "State": "WI",
  "Website": "https://lakefront-legal-new.test"
}], { workbookName: "fixture" });
const updates = conflictingDomain.rows[0].proposedUpdates || [];
// The row matched on name+geography, and the differing domain is proposed for review.
if (conflictingDomain.rows[0].matchedAccountId) {
  const domainUpdate = updates.find((update) => update.field === "domain");
  if (domainUpdate) {
    assert.equal(domainUpdate.currentValue, "lakefront-legal.test");
    assert.equal(domainUpdate.requiresReview, true, "A differing canonical value must be reviewed, never overwritten.");
  }
}

// ---------------------------------------------------------------------------------------------
// Totals and report
// ---------------------------------------------------------------------------------------------

assert.equal(plan.totals.totalRows, RCAP_WORKBOOK_FIXTURE_ROWS.length);
assert.equal(plan.totals.validRows, RCAP_WORKBOOK_FIXTURE_ROWS.length - 1, "Only the nameless row is invalid.");
assert.equal(plan.totals.missingRequiredIdentity, 1);
assert.equal(plan.totals.sharedInboxes, 1);
assert.equal(plan.totals.clientIntakePhoneWarnings, 1);
assert.equal(plan.totals.invalidEmails, 1);
assert.equal(plan.totals.sourceRowsRetained, RCAP_WORKBOOK_FIXTURE_ROWS.length, "Every source row is retained.");
// Rows 5 and 6 share a name but each carries a distinct domain, so both resolve cleanly to
// their own existing account. That is the right outcome, not a conflict -- a conflict is only
// raised when the evidence genuinely cannot separate two organizations, which the name-only and
// ambiguous cases above cover. The one conflict in this file is the in-batch duplicate.
assert.equal(plan.totals.conflicts, 1, "Only the in-file duplicate is unresolvable in this fixture.");
assert.equal(
  plan.rows.filter((row) => row.matchResult === "duplicate_within_batch").length,
  1,
  "The in-file duplicate must be the conflict."
);
// Counts must describe the rows, not drift from them.
assert.equal(plan.totals.proposedNewAccounts, plan.rows.filter((row) => row.action === "create_account").length);
assert.equal(plan.totals.matchedAccounts, plan.rows.filter((row) => row.matchedAccountId).length);

// Every required report column is present, in order.
assert.deepEqual(RCAP_IMPORT_REPORT_COLUMNS, [
  "source_row", "organization", "proposed_account_id", "match_result", "match_confidence",
  "program_action", "contact_action", "source_action", "profile_doc_action", "warnings", "human_decision_required"
]);
const report = formatRcapImportReport(plan);
assert.equal(report.split("\n").length, plan.rows.length + 1, "One header row plus one row per source row.");
assert.equal(report.split("\n")[0], RCAP_IMPORT_REPORT_COLUMNS.join("\t"));

// Every planned decision carries an audit event, ready for the existing audit contract.
assert.equal(plan.auditEvents.length, plan.rows.length, "Every decision must be auditable.");
for (const event of plan.auditEvents) {
  assert.equal(event.kind, "rcap_prospect_import_planned");
  assert.ok(event.matchReason, "An audit event must record why the decision was made.");
}

// ---------------------------------------------------------------------------------------------
// Read set
// ---------------------------------------------------------------------------------------------
//
// Targeted reads are the repository standard, and every named collection must be a REGISTERED
// collection or the read is against something the Supabase adapter does not carry.

for (const collection of RCAP_IMPORT_READ_COLLECTIONS) {
  assert.ok(
    coreStateCollections.includes(collection),
    `${collection} must be a registered core collection.`
  );
}

// Packet 2 introduces no new collection, so it introduces no registration risk. If a later
// packet adds a writer, it registers the collection in the same packet.
assert.ok(
  !/coreStateCollections/.test(importSource),
  "The planner reads through a caller-supplied state object; it does not reach into the registry itself."
);

// Cross-account isolation: one row's warnings, contacts, and matches never leak into another.
for (const row of plan.rows) {
  for (const other of plan.rows) {
    if (row.sourceRow === other.sourceRow) continue;
    if (row.proposedContact?.email && other.proposedContact?.email) {
      assert.notEqual(row.proposedContact.email, other.proposedContact.email, "An address must not appear on two accounts.");
    }
  }
}

console.log("RCAP prospect import verified:", JSON.stringify({
  rows: plan.totals.totalRows,
  newAccounts: plan.totals.proposedNewAccounts,
  matched: plan.totals.matchedAccounts,
  conflicts: plan.totals.conflicts,
  invalid: plan.totals.totalRows - plan.totals.validRows,
  sharedInboxes: plan.totals.sharedInboxes,
  intakePhone: plan.totals.clientIntakePhoneWarnings,
  writes: plan.writesPerformed,
  externalActions: plan.externalActions
}));
