#!/usr/bin/env node
// Clinic directory import tests (2026-07-28).
//
// Every fixture here is SYNTHETIC. The real workbook holds named people's addresses, lives
// outside the repo, and never appears in a test, a fixture or a diff — the mapping is pure, so
// synthetic rows prove it just as well.
//
// What these pin, in the order the import can hurt someone:
//   1. Nothing becomes contactable: candidates land pending_review, no outreachContact is
//      written, and clinicImportViolations() catches any row that would land otherwise.
//   2. The header row is DETECTED, at whatever offset, and a missing/renamed column is a loud
//      failure rather than a column of blanks.
//   3. Identity is never guessed: same-name-different-state rows stay separate, a person whose
//      organisation is ambiguous or absent is imported unattached, and a production row is
//      enriched only on a unique name+state match.
//   4. Email Type survives onto the record and through the filter, including the group bucket
//      that separates named people from general inboxes.
//   5. The fourteen-with-no-address case: imported, visibly uncontactable, with the reason.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyClinicImportPlan, buildClinicImportPlan, classificationForOrganizationType,
  CLINIC_NAMED_CONTACTS_COLLECTION, clinicCandidateId, clinicImportViolations, detectHeaderRow,
  emailTypeGroup, excelDate, sheetRecords, splitEmails, stateCode
} from "./clinic-directory-import.mjs";
import { isFreeEmailDomain, prospectKeys } from "./prospect-discovery.mjs";
import { normalizeProspectFilter, PROSPECT_SELECTION_FACETS, selectPendingProspects } from "./prospect-selection.mjs";
import { coreStateCollections, singletonCollections } from "./storage.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

console.log("Clinic directory import tests");

// ---------------------------------------------------------------------------------------------
// Fixtures: a workbook shaped like the real one — a title row, a description row, then headers.
// ---------------------------------------------------------------------------------------------
const ENRICHMENT_HEADERS = [
  "State", "Region / Metro", "Organization", "Program / Clinic", "Tier", "Clinic Verification",
  "Public Email", "Email Contact Name", "Email Contact Role", "Email Type", "Alternate Email(s)",
  "Email Source", "Email Research Notes", "Email Confidence", "Research Status", "Verified Date",
  "Phone", "Website"
];
const NAMED_HEADERS = [
  "State", "Person", "Title / Role", "Organization", "Program / Clinic", "Public Email",
  "Alternate Email(s)", "Phone", "Email Type", "Email Relationship",
  "Why Relevant / Research Notes", "Email Source", "Tier", "Confidence", "Verified Date"
];
const DIRECTORY_HEADERS = ["State", "Organization", "Organization Type", "Program / Clinic"];

const enrichmentRow = (values = {}) => ENRICHMENT_HEADERS.map((header) => values[header] ?? "");
const namedRow = (values = {}) => NAMED_HEADERS.map((header) => values[header] ?? "");

function workbook({ titleRows = 2, enrichment = [], named = [], directory = [] } = {}) {
  const preamble = [];
  if (titleRows > 0) preamble.push(["National Expungement & Record-Clearance Clinic Directory 2026"]);
  if (titleRows > 1) preamble.push(["Every organization is accounted for. Public addresses only."]);
  for (let extra = 2; extra < titleRows; extra += 1) preamble.push(["More prose about the methodology."]);
  return new Map([
    ["Email Enrichment", [...preamble, ENRICHMENT_HEADERS, ...enrichment]],
    ["Named Email Contacts", [...preamble, NAMED_HEADERS, ...named]],
    ["National Directory", [...preamble, DIRECTORY_HEADERS, ...directory]]
  ]);
}

const NOW = "2026-07-28T12:00:00.000Z";
// The free-mail provider under test, named once rather than spelled into fixture addresses: the
// point is the CLASS of domain, and a repo-wide PII gate rightly objects to bulk addresses at
// real domains sitting in a test file.
const FREE_MAIL = "gmail.com";

const ALABAMA = enrichmentRow({
  State: "Alabama", "Region / Metro": "Statewide / virtual", Organization: "Legal Services Alabama",
  "Program / Clinic": "Road to Redemption virtual expungement clinics", Tier: "A",
  "Clinic Verification": "Verified recurring clinic organizer", "Public Email": "jjackson@example.org",
  "Email Contact Name": "Dana Whitfield", "Email Contact Role": "Communications Manager",
  "Email Type": "Named staff email", "Alternate Email(s)": "info@example.org",
  "Email Source": "https://legalservicesalabama.org/pro-bono/", "Email Confidence": "High",
  "Research Status": "Newly verified public email", "Verified Date": "46231",
  Phone: "1-866-456-4995", Website: "https://legalservicesalabama.org/"
});
const NO_EMAIL = enrichmentRow({
  State: "Wyoming", Organization: "Legal Aid of Wyoming", "Program / Clinic": "Expungement help",
  Tier: "A", "Clinic Verification": "Ongoing program; cadence unclear",
  "Research Status": "No public email found"
});
const INBOX_ONLY = enrichmentRow({
  State: "Alabama", Organization: "Alabama State Bar Volunteer Lawyers Program",
  "Program / Clinic": "Free expungement clinic", Tier: "A",
  "Clinic Verification": "Verified recent clinic host/co-host", "Public Email": "vlp2@example.com",
  "Email Contact Role": "Volunteer Lawyers Program", "Email Type": "Program inbox",
  "Email Source": "https://www.alabar.org/programs/volunteer-lawyers/", "Research Status": "Newly verified public email"
});

// ---------------------------------------------------------------------------------------------
// 1. Header detection
// ---------------------------------------------------------------------------------------------
{
  const rows = workbook({ enrichment: [ALABAMA] }).get("Email Enrichment");
  assert.equal(detectHeaderRow(rows, { sheetName: "Email Enrichment" }), 2);
  ok("header row is found below the title and description, not assumed to be row 0");
}
{
  // Same sheet, a deeper preamble: the offset is a property of the file, not a constant.
  const rows = workbook({ titleRows: 6, enrichment: [ALABAMA] }).get("Email Enrichment");
  assert.equal(detectHeaderRow(rows, { sheetName: "Email Enrichment" }), 6);
  const read = sheetRecords(rows, { sheetName: "Email Enrichment" });
  assert.equal(read.records[0]["Public Email"], "jjackson@example.org");
  ok("a different preamble length is detected, not mis-read by one column or one row");
}
{
  assert.throws(
    () => detectHeaderRow([["A title"], ["A description sentence."], ["just one cell"]], { sheetName: "Broken" }),
    /no header row found in sheet "Broken"/,
    "a sheet with no header row must fail loudly"
  );
  ok("a sheet with no header row throws, naming the sheet");
}
{
  const rows = workbook({ enrichment: [ALABAMA] }).get("Email Enrichment");
  const renamed = rows.map((row) => row.map((cell) => (cell === "Email Type" ? "Address Category" : cell)));
  assert.throws(
    () => detectHeaderRow(renamed, { sheetName: "Email Enrichment", requiredColumns: ["State", "Organization", "Public Email", "Email Type"] }),
    /no header row carrying the required column\(s\): Email Type/,
    "a renamed required column must fail loudly, naming the column"
  );
  ok("a renamed required column throws and names the column that moved");
}
{
  const complete = workbook({ enrichment: [ALABAMA] });
  assert.throws(
    () => buildClinicImportPlan({}, new Map([["Email Enrichment", complete.get("Email Enrichment")]]), { now: NOW }),
    /sheet "Named Email Contacts" is missing/
  );
  ok("a missing sheet throws and lists the sheets that are present");
}

// ---------------------------------------------------------------------------------------------
// 2. Field mapping and the fields that must survive onto the record
// ---------------------------------------------------------------------------------------------
{
  assert.equal(stateCode("Alabama"), "AL");
  assert.equal(stateCode("District of Columbia"), "DC");
  assert.equal(stateCode("AL"), "AL");
  assert.equal(stateCode("National"), "", "an unknown state must not resolve to a code");
  assert.equal(excelDate("46231"), "2026-07-28");
  assert.deepEqual(splitEmails("one@example.org; two@example.net"), ["one@example.org", "two@example.net"]);
  assert.equal(emailTypeGroup("Named staff email"), "named_person");
  assert.equal(emailTypeGroup("Named partner staff email"), "named_person");
  assert.equal(emailTypeGroup("General organization inbox"), "organization_inbox");
  assert.equal(emailTypeGroup("Existing public contact"), "organization_inbox");
  assert.equal(emailTypeGroup("Program inbox"), "program_inbox");
  assert.equal(emailTypeGroup("Communications/media inbox"), "media_inbox");
  assert.equal(emailTypeGroup("Development/partnership inbox"), "partnership_inbox");
  assert.equal(emailTypeGroup(""), "none");
  assert.equal(classificationForOrganizationType("Legal aid"), "legal_aid");
  assert.equal(classificationForOrganizationType("Holistic public defender"), "public_defender");
  assert.equal(classificationForOrganizationType("Law school clinic"), "clinic");
  assert.equal(classificationForOrganizationType(""), "");
  ok("state codes, Excel dates, address lists, email-type groups and org types map as specified");
}
{
  const plan = buildClinicImportPlan({}, workbook({
    enrichment: [ALABAMA],
    directory: [["Alabama", "Legal Services Alabama", "Legal aid", "Road to Redemption"]]
  }), { now: NOW });
  const [candidate] = plan.candidates;
  assert.equal(candidate.email_type, "Named staff email");
  assert.equal(candidate.email_type_group, "named_person");
  assert.equal(candidate.tier, "A");
  assert.equal(candidate.state, "AL");
  assert.equal(candidate.state_name, "Alabama");
  assert.equal(candidate.organization_type, "Legal aid");
  assert.equal(candidate.classification, "legal_aid");
  assert.equal(candidate.program, "Road to Redemption virtual expungement clinics");
  assert.equal(candidate.clinic_verification, "Verified recurring clinic organizer");
  assert.equal(candidate.contact_name, "Dana Whitfield");
  assert.equal(candidate.contact_role, "Communications Manager");
  assert.equal(candidate.email_source, "https://legalservicesalabama.org/pro-bono/");
  assert.equal(candidate.email_verified_at, "2026-07-28");
  assert.deepEqual(candidate.alternate_emails, ["info@example.org"]);
  assert.equal(candidate.source_row, 4, "the spreadsheet row travels with the record for tracing");
  ok("Email Type, tier, state, org type, programme, verification, contact and source all land on the record");
}

// ---------------------------------------------------------------------------------------------
// 3. Nothing becomes contactable
// ---------------------------------------------------------------------------------------------
{
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [ALABAMA, INBOX_ONLY, NO_EMAIL] }), { now: NOW });
  assert.equal(plan.candidates.length, 3);
  for (const candidate of plan.candidates) {
    assert.equal(candidate.review_state, "pending_review");
    assert.equal(candidate.sequence_status, undefined);
  }
  assert.equal(plan.report.writes.outreachContacts, 0);
  assert.deepEqual(clinicImportViolations(plan), []);
  const applied = applyClinicImportPlan({}, plan, { now: NOW });
  assert.equal((applied.outreachContacts || []).length, 0, "the import must write no outreach contact");
  ok("every organisation lands pending_review and no outreach contact is written");
}
{
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [ALABAMA] }), { now: NOW });
  plan.candidates[0].review_state = "approved";
  const violations = clinicImportViolations(plan);
  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /would land review_state "approved"/);
  ok("a candidate tampered to approved is caught by the confirm-time invariant");
}
{
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [ALABAMA] }), { now: NOW });
  plan.candidates[0].sequence_status = "Enrolled";
  assert.match(clinicImportViolations(plan)[0].reason, /enrolment field/);
  ok("a candidate carrying an enrolment field is caught by the same invariant");
}

// ---------------------------------------------------------------------------------------------
// 4. The organisations with no address
// ---------------------------------------------------------------------------------------------
{
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [ALABAMA, NO_EMAIL] }), { now: NOW });
  const wyoming = plan.candidates.find((row) => row.state === "WY");
  assert.ok(wyoming, "the organisation with no address must still be imported");
  assert.equal(wyoming.email, "");
  assert.equal(wyoming.contact_status, "no_address");
  assert.equal(wyoming.email_research_status, "No public email found");
  assert.equal(plan.report.organizations.withoutEmail, 1);
  assert.deepEqual(plan.report.organizations.noAddress, [{
    organization: "Legal Aid of Wyoming", state: "Wyoming", tier: "A", research_status: "No public email found"
  }]);
  const view = selectPendingProspects({ prospectCandidates: plan.candidates });
  const row = view.rows.find((entry) => entry.organization_name === "Legal Aid of Wyoming");
  assert.equal(row.hasEmail, false);
  assert.equal(row.no_email_reason, "No public email found");
  ok("an organisation with no address imports, visibly uncontactable, carrying the reason");
}

// ---------------------------------------------------------------------------------------------
// 5. Identity: never a silent merge
// ---------------------------------------------------------------------------------------------
{
  const arizona = enrichmentRow({ State: "Arizona", Organization: "Community Legal Services", "Program / Clinic": "Set-aside assistance", Tier: "B", "Public Email": "info@example.net", "Email Type": "General organization inbox" });
  const florida = enrichmentRow({ State: "Florida", Organization: "Community Legal Services", "Program / Clinic": "Record sealing", Tier: "B", "Public Email": "contact@example.net", "Email Type": "General organization inbox" });
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [arizona, florida] }), { now: NOW });
  assert.equal(plan.candidates.length, 2, "two same-named organisations in different states stay two records");
  assert.notEqual(plan.candidates[0].id, plan.candidates[1].id);
  assert.deepEqual(plan.candidates[0].name_collision_with, ["Community Legal Services (Florida)"]);
  assert.equal(plan.report.duplicatesInFile.sameNameDifferentState.length, 1);
  ok("same name in two states is flagged for review, never merged");
}
{
  const first = enrichmentRow({ State: "Kansas", Organization: "Kansas Legal Services", "Program / Clinic": "Expungement clinic", "Public Email": "clinic@example.com", "Email Type": "Program inbox" });
  const second = enrichmentRow({ State: "Kansas", Organization: "Koch Pro Bono Program", "Program / Clinic": "Clinic partner", "Public Email": "clinic@example.com", "Email Type": "Program inbox" });
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [first, second] }), { now: NOW });
  assert.equal(plan.report.duplicatesInFile.sharedAddresses.length, 1);
  assert.deepEqual(plan.candidates[0].shared_address_with, ["Koch Pro Bono Program"]);
  ok("one address on two organisations is reported and flagged on both rows");
}
{
  const twice = [ALABAMA, ALABAMA];
  const plan = buildClinicImportPlan({}, workbook({ enrichment: twice }), { now: NOW });
  assert.equal(plan.candidates.length, 1, "the same organisation listed twice is one record");
  assert.equal(plan.report.duplicatesInFile.duplicateRows.length, 1);
  ok("a genuinely duplicated row collapses once and is reported");
}
{
  // Seven organisations on gmail.com must stay seven — the pre-existing domain key would have
  // made them one candidate and, at promotion, one organisation.
  const gmailRows = ["Expunge Colorado", "Connecticut Pardon Team", "Path2Redemption"].map((name, index) =>
    enrichmentRow({ State: ["Colorado", "Connecticut", "Delaware"][index], Organization: name, "Program / Clinic": "Clinic", "Public Email": `clinic${index}@${FREE_MAIL}`, "Email Type": "General organization inbox" }));
  const plan = buildClinicImportPlan({}, workbook({ enrichment: gmailRows }), { now: NOW });
  assert.equal(new Set(plan.candidates.map((row) => row.id)).size, 3);
  assert.equal(isFreeEmailDomain(`someone@${FREE_MAIL}`), true);
  assert.equal(isFreeEmailDomain("someone@example.org"), false);
  assert.ok(!prospectKeys({ organization_name: "Expunge Colorado", email: `a@${FREE_MAIL}` }).some((key) => key.startsWith("domain:")),
    "a free-mail domain must not become an identity key");
  assert.ok(prospectKeys({ organization_name: "Kansas Legal Services", email: "a@example.org" }).includes("domain:example.org"));
  ok("organisations sharing a free-mail provider stay distinct; institutional domains still key");
}

// ---------------------------------------------------------------------------------------------
// 6. The person-level layer
// ---------------------------------------------------------------------------------------------
{
  const person = namedRow({
    State: "Alabama", Person: "Dana Whitfield", "Title / Role": "Communications Manager",
    Organization: "Legal Services Alabama", "Public Email": "jjackson@example.org",
    "Email Type": "Named staff email", "Email Source": "https://legalservicesalabama.org/pro-bono/", Tier: "A"
  });
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [ALABAMA], named: [person] }), { now: NOW });
  const [candidate] = plan.candidates;
  assert.equal(candidate.has_named_contact, true);
  assert.equal(candidate.named_contact_count, 1);
  assert.equal(candidate.contact_status, "named_person");
  assert.equal(plan.namedContacts[0].match_status, "attached");
  assert.equal(plan.namedContacts[0].candidate_id, candidate.id);
  ok("a named person attaches to their organisation by state and name");
}
{
  // The person's address differs from the organisation inbox: the person wins, the inbox is kept.
  const georgiaOrg = enrichmentRow({ State: "Georgia", Organization: "Georgia Justice Project", "Program / Clinic": "Record clearing", Tier: "A", "Public Email": "intake@example.org", "Email Type": "Existing public contact", "Email Source": "https://gjp.org/" });
  const georgiaPerson = namedRow({ State: "Georgia", Person: "Rowan Ellery", "Title / Role": "Legal Director", Organization: "Georgia Justice Project", "Public Email": "director@example.org", "Email Type": "Named staff email", "Email Source": "https://gjp.org/staff/" });
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [georgiaOrg], named: [georgiaPerson] }), { now: NOW });
  const [candidate] = plan.candidates;
  assert.equal(candidate.email, "director@example.org", "the named person is the better contact");
  assert.ok(candidate.alternate_emails.includes("intake@example.org"), "the organisation inbox is kept as an alternate, not discarded");
  assert.equal(candidate.contact_name, "Rowan Ellery");
  assert.equal(plan.report.namedContacts.preferredOverOrganizationInbox.length, 1);
  ok("a named person's address becomes primary and the organisation inbox becomes the alternate");
}
{
  const orphan = namedRow({ State: "Tennessee", Person: "Marcus Trent", Organization: "Warfield Lodge No. 44", "Public Email": "lodge-contact@example.com", "Email Type": "Named staff email" });
  const lodge = enrichmentRow({ State: "Tennessee", Organization: "Warfield Lodge No. 44 and NAACP community partnership", "Program / Clinic": "Community clinic", "Public Email": `lodge@${FREE_MAIL}`, "Email Type": "General organization inbox" });
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [lodge], named: [orphan] }), { now: NOW });
  assert.equal(plan.namedContacts[0].match_status, "unmatched");
  assert.equal(plan.namedContacts[0].candidate_id, "");
  assert.equal(plan.candidates[0].has_named_contact, false, "a near-name must not attach on its own");
  assert.equal(plan.report.namedContacts.unmatched.length, 1);
  ok("a person whose organisation only resembles a row is imported unattached and reported");
}
{
  // Two organisations with the same name in one state: the person attaches to neither.
  const a = enrichmentRow({ State: "Ohio", Organization: "Community Legal Aid", "Program / Clinic": "Sealing clinic", "Public Email": "a@example.net", "Email Type": "Program inbox" });
  const b = enrichmentRow({ State: "Ohio", Organization: "Community Legal Aid", "Program / Clinic": "Reentry desk", "Public Email": "b@example.net", "Email Type": "Program inbox" });
  const person = namedRow({ State: "Ohio", Person: "Someone Real", Organization: "Community Legal Aid", "Public Email": "someone@example.net" });
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [a, b], named: [person] }), { now: NOW });
  assert.equal(plan.namedContacts[0].match_status, "ambiguous");
  assert.equal(plan.report.namedContacts.ambiguous.length, 1);
  assert.ok(plan.candidates.every((row) => row.has_named_contact === false));
  ok("an ambiguous organisation name leaves the person unattached rather than picking one");
}
{
  const person = namedRow({ State: "Alabama", Person: "Dana Whitfield", Organization: "Legal Services Alabama", "Public Email": "jjackson@example.org" });
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [ALABAMA], named: [person] }), { now: NOW });
  const applied = applyClinicImportPlan({}, plan, { now: NOW });
  assert.equal(applied[CLINIC_NAMED_CONTACTS_COLLECTION].length, 1);
  assert.ok(applied[CLINIC_NAMED_CONTACTS_COLLECTION][0].id, "person rows carry an id, so Supabase keys them stably");
  ok("named people are written to their own collection, keyed by id");
}

// ---------------------------------------------------------------------------------------------
// 7. Matching against what is already in production
// ---------------------------------------------------------------------------------------------
{
  const production = {
    prospectCandidates: [{
      id: "prospect-cand-existing", organization_name: "Legal Services Alabama", state: "AL",
      email: "", source: "lsc_grantees", classification: "legal_aid", review_state: "pending_review",
      discovered_at: "2026-07-11T10:00:00.000Z", score: 30, _version: 4
    }]
  };
  const plan = buildClinicImportPlan(production, workbook({ enrichment: [ALABAMA] }), { now: NOW });
  const [candidate] = plan.candidates;
  assert.equal(candidate.id, "prospect-cand-existing", "a unique name+state match enriches the row that is already there");
  assert.equal(candidate.source, "lsc_grantees", "the original provenance is kept");
  assert.deepEqual(candidate.sources, ["lsc_grantees", "clinic_directory_2026"]);
  assert.equal(candidate.discovered_at, "2026-07-11T10:00:00.000Z");
  assert.equal(candidate.email, "jjackson@example.org");
  assert.equal(plan.report.production.enrichedExisting, 1);
  assert.equal(plan.report.production.newCandidates, 0);
  const applied = applyClinicImportPlan(production, plan, { now: NOW });
  assert.equal(applied.prospectCandidates.length, 1, "enrichment must not create a second row");
  assert.equal(applied.prospectCandidates[0]._version, 4, "the row's version survives the merge");
  ok("a unique production match is enriched in place, keeping provenance and version");
}
{
  const production = {
    prospectCandidates: [
      { id: "prospect-cand-az", organization_name: "Community Legal Services", state: "AZ", review_state: "pending_review" },
      { id: "prospect-cand-pa", organization_name: "Community Legal Services", state: "PA", review_state: "pending_review" }
    ]
  };
  const florida = enrichmentRow({ State: "Florida", Organization: "Community Legal Services", "Program / Clinic": "Record sealing", "Public Email": "contact@example.net", "Email Type": "General organization inbox" });
  const plan = buildClinicImportPlan(production, workbook({ enrichment: [florida] }), { now: NOW });
  assert.equal(plan.candidates[0].id, clinicCandidateId({ state: "FL", organization_name: "Community Legal Services", program: "Record sealing" }));
  assert.deepEqual(plan.candidates[0].possible_prod_match, ["prospect-cand-az", "prospect-cand-pa"]);
  assert.equal(plan.report.production.ambiguousNameMatches.length, 1);
  ok("a name that matches production only in another state imports separately, carrying the ids to review");
}
{
  const production = {
    prospectCandidates: [{ id: "prospect-cand-approved", organization_name: "Legal Services Alabama", state: "AL", review_state: "approved", source: "lsc_grantees" }]
  };
  const plan = buildClinicImportPlan(production, workbook({ enrichment: [ALABAMA] }), { now: NOW });
  assert.equal(plan.candidates[0].review_state, "approved", "enrichment must not reset a decision already made");
  assert.deepEqual(clinicImportViolations(plan), []);
  ok("enriching an already-approved row keeps its decision and passes the invariant");
}
{
  const production = { outreachUnsubscribes: [{ email: "jjackson@example.org" }] };
  const plan = buildClinicImportPlan(production, workbook({ enrichment: [ALABAMA] }), { now: NOW });
  assert.equal(plan.report.production.addressOnDoNotContactList.length, 1);
  ok("an address already unsubscribed or suppressed is surfaced in the report before anything is written");
}

// ---------------------------------------------------------------------------------------------
// 8. Email Type is filterable
// ---------------------------------------------------------------------------------------------
{
  const plan = buildClinicImportPlan({}, workbook({ enrichment: [ALABAMA, INBOX_ONLY, NO_EMAIL] }), { now: NOW });
  const state = { prospectCandidates: plan.candidates };

  const named = selectPendingProspects(state, { emailTypeGroup: "named_person" });
  assert.equal(named.matched, 1);
  assert.equal(named.rows[0].organization_name, "Legal Services Alabama");

  const inboxes = selectPendingProspects(state, { emailTypeGroup: "program_inbox" });
  assert.equal(inboxes.matched, 1);
  assert.equal(inboxes.rows[0].organization_name, "Alabama State Bar Volunteer Lawyers Program");

  const exact = selectPendingProspects(state, { emailType: "named staff email" });
  assert.equal(exact.matched, 1, "the workbook's exact label filters too");

  const tierA = selectPendingProspects(state, { tier: "a" });
  assert.equal(tierA.matched, 3);

  const all = selectPendingProspects(state, {});
  assert.equal(all.withNamedContact, 0, "no named people in this fixture");
  assert.deepEqual(all.byEmailTypeGroup, { named_person: 1, program_inbox: 1, none: 1 },
    "the organisation with no address counts as its own group rather than disappearing");
  assert.equal(all.byTier.A, 3);
  assert.equal(all.rows[0].email_type.length > 0 || all.rows[0].contact_status === "no_address", true);
  assert.ok(normalizeProspectFilter({ emailTypeGroup: "Named_Person" }).emailTypeGroup === "named_person");
  ok("Email Type filters the ranked list by exact label and by group, and tier filters alongside it");
}
{
  // Provenance must not hide an enriched row from the source filter.
  const production = { prospectCandidates: [{ id: "prospect-cand-existing", organization_name: "Legal Services Alabama", state: "AL", source: "lsc_grantees", review_state: "pending_review" }] };
  const plan = buildClinicImportPlan(production, workbook({ enrichment: [ALABAMA] }), { now: NOW });
  const state = { prospectCandidates: plan.candidates };
  assert.equal(selectPendingProspects(state, { source: "lsc_grantees" }).matched, 1);
  assert.equal(selectPendingProspects(state, { source: "clinic_directory_2026" }).matched, 1);
  ok("an enriched row is found under both its original source and the directory");
}

// ---------------------------------------------------------------------------------------------
// 9. The request path. A facet the module understands but the endpoint never reads matches
//    EVERYTHING — which turns a filtered approval into an approval of the whole list. Found
//    exactly that way (the filters worked in the module and were ignored over HTTP), so it is
//    pinned here: every facet must be read out of the query string by the handler.
// ---------------------------------------------------------------------------------------------
{
  const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const handler = server.slice(server.indexOf('url.pathname === "/api/prospects/selection"'));
  const block = handler.slice(0, handler.indexOf("return;"));
  for (const facet of PROSPECT_SELECTION_FACETS) {
    const parameter = facet === "stateCode" ? "state" : facet;
    assert.ok(block.includes(`url.searchParams.get("${parameter}")`),
      `/api/prospects/selection must read the "${parameter}" facet, or filtering by it silently matches everything`);
  }
  ok("every selection facet is read from the query string by the endpoint, not just by the module");
}
{
  const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  assert.ok(server.includes('url.pathname === "/api/clinics/import/preview"'), "the preview endpoint must exist");
  assert.ok(server.includes('url.pathname === "/api/clinics/import/confirm"'), "the confirm endpoint must exist");
  // A 212 KB workbook is ~283 KB base64 — over the default JSON bound. Both endpoints must read
  // at the import bound or the upload 413s with "Request body is too large".
  const clinicBlock = server.slice(server.indexOf('url.pathname === "/api/clinics/import/preview"'));
  const bounded = (clinicBlock.match(/readBoundedJson\(request, \{ limit: REQUEST_LIMITS\.import \}\)/g) || []).length;
  assert.equal(bounded, 2, "both clinic import endpoints must read the body at the import bound");
  assert.ok(clinicBlock.includes("clinicImportViolations(plan)"), "confirm must re-check the invariant before writing");
  ok("both import endpoints exist, read the body at the import bound, and re-check the invariant");
}

// ---------------------------------------------------------------------------------------------
// 10. Registration — the silent-drop trap
// ---------------------------------------------------------------------------------------------
{
  assert.ok(coreStateCollections.includes(CLINIC_NAMED_CONTACTS_COLLECTION),
    `${CLINIC_NAMED_CONTACTS_COLLECTION} must be registered in coreStateCollections or every write is silently dropped`);
  assert.ok(!singletonCollections.has(CLINIC_NAMED_CONTACTS_COLLECTION), "it is a list, not a singleton");
  assert.ok(coreStateCollections.includes("prospectCandidates"));
  ok("the named-contacts collection is registered and list-shaped");
}

console.log(`\n${passed} clinic directory import checks passed`);
