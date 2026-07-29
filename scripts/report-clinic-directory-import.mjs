#!/usr/bin/env node
// The clinic directory import report — what gets read BEFORE anything is written.
//
//   node scripts/report-clinic-directory-import.mjs <workbook.xlsx> [--state <state.json>]
//
// Reads the workbook, builds the same plan the import endpoint would build against the same
// state, and prints the report. It writes nothing, anywhere, ever — this is the dry run, and
// /api/clinics/import/preview returns the identical object over HTTP.
//
// It names organisations (public bodies, and Roger needs to see which ones) but prints no
// email address: the counts and the provenance are the point, and the addresses belong in the
// record, not in a terminal that gets pasted into a chat.

import { readFileSync } from "node:fs";

import { buildClinicImportPlan, clinicImportViolations, readClinicWorkbook } from "./clinic-directory-import.mjs";

const args = process.argv.slice(2);
const workbookPath = args.find((argument) => !argument.startsWith("--"));
const stateIndex = args.indexOf("--state");
const statePath = stateIndex >= 0 ? args[stateIndex + 1] : "";

if (!workbookPath) {
  console.error("usage: node scripts/report-clinic-directory-import.mjs <workbook.xlsx> [--state <state.json>]");
  process.exit(2);
}

const state = statePath ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const plan = buildClinicImportPlan(state, readClinicWorkbook(readFileSync(workbookPath)), { now: new Date().toISOString() });
const report = plan.report;

const line = (label, value) => console.log(`  ${String(label).padEnd(42)} ${value}`);
const heading = (text) => console.log(`\n${text}\n${"─".repeat(text.length)}`);

heading("Sheets read (header row detected, never assumed)");
for (const sheet of Object.values(report.sheets)) {
  line(sheet.name, `header row ${sheet.headerRow ?? "—"}, ${sheet.dataRows} data rows${sheet.note ? ` (${sheet.note})` : ""}`);
}

heading("Organisations");
line("rows read", report.organizations.rowsRead);
line("unique organisations", report.organizations.unique);
line("with a usable address", report.organizations.withEmail);
line("with no address", report.organizations.withoutEmail);
line("with a named person attached", report.organizations.withNamedPerson);

heading("Address kind (Email Type, as the workbook labels it)");
for (const [type, count] of Object.entries(report.organizations.byEmailType).sort((a, b) => b[1] - a[1])) line(type, count);
heading("Address kind, grouped");
for (const [group, count] of Object.entries(report.organizations.byEmailTypeGroup).sort((a, b) => b[1] - a[1])) line(group, count);
heading("Tier");
for (const [tier, count] of Object.entries(report.organizations.byTier).sort()) line(tier, count);

heading(`The ${report.organizations.noAddress.length} with no address (they import, visibly not contactable)`);
for (const row of report.organizations.noAddress) {
  console.log(`  ${row.state} — ${row.organization} (tier ${row.tier || "?"}): ${row.research_status || "no reason recorded"}`);
}

heading("Named people");
line("rows read", report.namedContacts.rowsRead);
line("with an address", report.namedContacts.withEmail);
line("attached to an organisation", report.namedContacts.attached);
line("organisations with more than one", report.namedContacts.organizationsWithSeveral.length);
for (const row of report.namedContacts.organizationsWithSeveral) console.log(`    ${row.state} — ${row.organization}: ${row.people} people`);
line("person preferred over the org inbox", report.namedContacts.preferredOverOrganizationInbox.length);
for (const row of report.namedContacts.preferredOverOrganizationInbox) {
  console.log(`    ${row.organization}: ${row.person} becomes primary; the ${row.demoted_email_type || "inbox"} is kept as alternate`);
}
line("NOT attached (ambiguous)", report.namedContacts.ambiguous.length);
for (const row of report.namedContacts.ambiguous) console.log(`    ${row.state} — ${row.person} @ ${row.organization}: ${row.matches} organisations share that name`);
line("NOT attached (no matching organisation)", report.namedContacts.unmatched.length);
for (const row of report.namedContacts.unmatched) console.log(`    ${row.state} — ${row.person} @ ${row.organization}`);

heading("Duplicates within the file");
line("identical rows collapsed", report.duplicatesInFile.duplicateRows.length);
for (const row of report.duplicatesInFile.duplicateRows) console.log(`    ${row.organization} (${row.state}) rows ${row.rows.join(" and ")}`);
line("same name, different state (not merged)", report.duplicatesInFile.sameNameDifferentState.length);
for (const row of report.duplicatesInFile.sameNameDifferentState) console.log(`    ${row.organization}: ${row.states.join(" / ")}`);
line("one address on several organisations", report.duplicatesInFile.sharedAddresses.length);
for (const row of report.duplicatesInFile.sharedAddresses) console.log(`    ${row.organizations.join(" | ")}`);

heading("Against what is already in production");
line("new organisations", report.production.newCandidates);
line("existing rows enriched in place", report.production.enrichedExisting);
line("  of those, gaining a first address", report.production.enrichedExistingDetail.filter((row) => row.gains_address).length);
line("ambiguous name matches (NOT merged)", report.production.ambiguousNameMatches.length);
for (const row of report.production.ambiguousNameMatches) console.log(`    ${row.state} — ${row.organization}: ${row.reason}`);
line("addresses already known to production", report.production.addressAlreadyInProduction.length);
line("addresses on a do-not-contact list", report.production.addressOnDoNotContactList.length);
for (const row of report.production.addressOnDoNotContactList) console.log(`    ${row.organization}: ${row.in.join(", ")}`);

heading("What confirming would write");
for (const [collection, count] of Object.entries(report.writes)) {
  if (collection === "note") continue;
  line(collection, count);
}
console.log(`\n  ${report.writes.note}`);
const violations = clinicImportViolations(plan);
console.log(`  Rows that would land approved or enrolled: ${violations.length}${violations.length ? " — THE IMPORT WOULD REFUSE" : ""}`);
console.log("\nNothing was written. This is a report.\n");
