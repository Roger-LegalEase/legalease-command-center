#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { authorizeRequest } from "./access-control.mjs";
import {
  importRcapRevenueWorkbook,
  normalizeRcapAccount,
  normalizeRcapContact,
  previewRcapRevenueWorkbook,
  rcapLandingAssignment,
  rcapRevenueFoundationSummary
} from "./rcap-revenue-os.mjs";

const now = "2026-06-10T12:00:00.000Z";
const workbook = {
  workbook_name: "rcap-paid-outreach.xlsx",
  Prospects: [
    {
      Prospect_ID: "P-001",
      organization_name: "Fulton Legal Aid",
      segment: "A1",
      priority_tier: "Tier 1",
      priority_score: "94",
      service_area: "Georgia",
      org_type: "Legal aid",
      paid_offer_fit: "High",
      likely_funding_path: "Foundation grant",
      opening_angle: "Backlog readiness",
      source_confidence: "High",
      account_status: "new",
      owner: "Roger",
      next_action_date: "2026-06-12",
      notes: "Strategic anchor",
      source_url_or_reference: "public directory",
      source_provenance: "public legal aid directory"
    },
    {
      Prospect_ID: "P-002",
      organization_name: "Workforce Bridge",
      segment: "C2",
      priority_tier: "Tier 3",
      priority_score: "52",
      source_confidence: "Medium"
    }
  ],
  Contacts_Master: [
    {
      Contact_ID: "C-001",
      linked_account_id: "P-001",
      linked_prospect_id: "P-001",
      contact_name: "Avery Director",
      title: "Executive Director",
      decision_role: "Decision maker",
      public_email: "avery@example.com",
      public_phone: "555-0100",
      contact_route: "public email",
      segment: "A1",
      outreach_priority: "High",
      recommended_first_touch: "Manual review",
      personalization_hook: "Backlog",
      budget_angle: "Grant",
      verification_note: "Verified public website",
      source_confidence: "High",
      source_provenance: "public website",
      source_url_or_reference: "https://example.org/team"
    },
    {
      Contact_ID: "C-002",
      linked_account_id: "P-002",
      contact_name: "Jordan Program",
      public_email: "jordan@example.com",
      suppression_status: "unsubscribed"
    }
  ],
  First_Wave_Contacts: [
    {
      Contact_ID: "C-003",
      linked_account_id: "P-002",
      contact_name: "Case Manager",
      public_email: "case@example.com",
      source_confidence: "Medium"
    }
  ],
  Contact_Routes_To_Verify: [
    {
      Contact_ID: "C-004",
      linked_account_id: "P-001",
      contact_name: "Route Unknown",
      verification_note: "Needs route verification"
    }
  ],
  Contact_Playbook: [{ segment: "A1", note: "Reference only" }],
  Top_25: [{ Prospect_ID: "P-001" }],
  Funding_Triggers: [{ Prospect_ID: "P-001", trigger: "grant cycle" }],
  Sales_Actions: [{ Prospect_ID: "P-002", action: "manual review" }],
  Deals: [
    {
      deal_id: "D-001",
      linked_account_id: "P-001",
      linked_contact_id: "C-001",
      proposed_offer: "RCAP pilot",
      estimated_deal_size: "$25000",
      pilot_volume: "100 clients",
      pilot_length: "90 days",
      funding_source: "Grant",
      likely_decision_maker: "Avery",
      likely_champion: "Program director",
      target_close_date: "2026-08-01",
      notes: "Only a deal seed"
    }
  ]
};

const preview = previewRcapRevenueWorkbook(workbook, {
  now,
  workbookName: "rcap-paid-outreach.xlsx",
  importedBy: "owner"
});
assert.equal(preview.status, "previewed");
assert.equal(preview.accounts_detected, 2);
assert.equal(preview.contacts_detected, 4);
assert.ok(preview.sheets_detected.includes("Prospects"));
assert.ok(preview.sheets_detected.includes("Contacts_Master"));
assert.ok(preview.warnings.includes("Contact provenance not explicit in workbook."));

const missing = previewRcapRevenueWorkbook({ Prospects: [] }, { now, workbookName: "bad.xlsx" });
assert.equal(missing.status, "failed");
assert.ok(missing.errors.includes("Missing Contacts_Master sheet."));

const account = normalizeRcapAccount(workbook.Prospects[0], {
  now,
  importedAt: now,
  workbookName: "rcap-paid-outreach.xlsx",
  importId: "rcap-import-test",
  sourceSheet: "Prospects",
  sourceRowNumber: 2
});
assert.equal(account.account_id, "P-001");
assert.equal(account.source_prospect_id, "P-001");
assert.equal(account.rcap_campaign_segment, "A1");
assert.equal(account.rcap_cobranded_page_status, "Draft Needed");
assert.equal(account.rcap_landing_page_url, "/rcap/legal-aid-readiness-pilot");
assert.equal(account.source_sheet, "Prospects");
assert.equal(account.source_workbook_name, "rcap-paid-outreach.xlsx");
assert.equal(account.source_import_id, "rcap-import-test");
assert.equal(account.source_row_number, 2);
assert.equal(account.source_provenance, "public legal aid directory");

const tier3 = rcapLandingAssignment(workbook.Prospects[1]);
assert.equal(tier3.rcap_landing_page_url, "/rcap");
assert.equal(tier3.rcap_cobranded_page_status, "Master RCAP Page");

const contact = normalizeRcapContact(workbook.Contacts_Master[0], {
  now,
  importedAt: now,
  workbookName: "rcap-paid-outreach.xlsx",
  importId: "rcap-import-test",
  sourceSheet: "Contacts_Master",
  sourceRowNumber: 2
});
assert.equal(contact.contact_id, "C-001");
assert.equal(contact.source_contact_id, "C-001");
assert.equal(contact.source_sheet, "Contacts_Master");
assert.equal(contact.source_row_number, 2);
assert.equal(contact.source_confidence, "High");
assert.equal(contact.verification_note, "Verified public website");
assert.equal(contact.contact_route, "public email");
assert.equal(contact.source_provenance, "public website");
assert.equal(contact.email_status, "Not Verified");
assert.equal(contact.sequence_status, "Not Enrolled");
assert.equal(contact.suppression_status, "Active");
assert.equal(contact.bounced, false);
assert.equal(contact.unsubscribed, false);

const suppressed = normalizeRcapContact(workbook.Contacts_Master[1], { now, importedAt: now });
assert.equal(suppressed.suppression_status, "Unsubscribed");
assert.equal(suppressed.unsubscribed, true);
assert.equal(suppressed.email_status, "Not Verified");
assert.equal(suppressed.sequence_status, "Not Enrolled");

let result = importRcapRevenueWorkbook({}, workbook, {
  now,
  workbookName: "rcap-paid-outreach.xlsx",
  importedBy: "owner"
});
assert.equal(result.batch.status, "imported");
assert.equal(result.batch.accounts_imported, 2);
assert.equal(result.batch.contacts_imported, 4);
assert.equal(result.imported.dealSeeds.length, 1);
assert.equal(result.state.rcapRevenueAccounts.length, 2);
assert.equal(result.state.rcapRevenueContacts.length, 4);
assert.equal(result.state.rcapRevenueDealSeeds.length, 1);
assert.equal(result.state.rcapRevenueImportBatches.length, 1);
assert.equal(result.state.rcapRevenueReferences.contactPlaybook.length, 1);
assert.equal(result.state.posts || undefined, undefined);
assert.equal(result.state.tasks || undefined, undefined);

result = importRcapRevenueWorkbook(result.state, workbook, {
  now: "2026-06-10T12:05:00.000Z",
  workbookName: "rcap-paid-outreach.xlsx",
  importedBy: "owner"
});
assert.equal(result.batch.accounts_imported, 0);
assert.equal(result.batch.contacts_imported, 0);
assert.equal(result.batch.duplicates_skipped >= 6, true);
assert.equal(result.state.rcapRevenueAccounts.length, 2);
assert.equal(result.state.rcapRevenueContacts.length, 4);

const activeOverwriteWorkbook = {
  ...workbook,
  Contacts_Master: [
    {
      Contact_ID: "C-002",
      linked_account_id: "P-002",
      contact_name: "Jordan Program",
      public_email: "jordan@example.com",
      email_status: "Verified",
      sequence_status: "Ready to Enroll",
      suppression_status: "Active",
      unsubscribed: "false",
      bounced: "false"
    },
    {
      Contact_ID: "C-005",
      linked_account_id: "P-001",
      contact_name: "Bounced Contact",
      public_email: "bounced@example.com",
      suppression_status: "Bounced",
      bounced: "true"
    }
  ],
  First_Wave_Contacts: [],
  Contact_Routes_To_Verify: []
};

result = importRcapRevenueWorkbook(result.state, activeOverwriteWorkbook, {
  now: "2026-06-10T12:10:00.000Z",
  workbookName: "rcap-paid-outreach.xlsx",
  importedBy: "owner"
});
let stickyUnsubscribed = result.state.rcapRevenueContacts.find(item => item.contact_id === "C-002");
assert.equal(stickyUnsubscribed.suppression_status, "Unsubscribed");
assert.equal(stickyUnsubscribed.unsubscribed, true);
assert.equal(stickyUnsubscribed.bounced, false);
assert.equal(stickyUnsubscribed.email_status, "Not Verified");
assert.equal(stickyUnsubscribed.sequence_status, "Not Enrolled");

const incomingSuppressionWorkbook = {
  ...workbook,
  Contacts_Master: [
    {
      Contact_ID: "C-001",
      linked_account_id: "P-001",
      contact_name: "Avery Director",
      public_email: "avery@example.com",
      suppression_status: "Do Not Contact",
      unsubscribed: "true"
    }
  ],
  First_Wave_Contacts: [],
  Contact_Routes_To_Verify: []
};
result = importRcapRevenueWorkbook(result.state, incomingSuppressionWorkbook, {
  now: "2026-06-10T12:12:00.000Z",
  workbookName: "rcap-paid-outreach.xlsx",
  importedBy: "owner"
});
const newlySuppressed = result.state.rcapRevenueContacts.find(item => item.contact_id === "C-001");
assert.equal(newlySuppressed.suppression_status, "Unsubscribed");
assert.equal(newlySuppressed.unsubscribed, true);
assert.equal(newlySuppressed.email_status, "Not Verified");
assert.equal(newlySuppressed.sequence_status, "Not Enrolled");

const bouncedOverwriteWorkbook = {
  ...workbook,
  Contacts_Master: [
    {
      Contact_ID: "C-005",
      linked_account_id: "P-001",
      contact_name: "Bounced Contact",
      public_email: "bounced@example.com",
      email_status: "Verified",
      sequence_status: "Ready to Enroll",
      suppression_status: "Active",
      bounced: "false",
      unsubscribed: "false"
    }
  ],
  First_Wave_Contacts: [],
  Contact_Routes_To_Verify: []
};
result = importRcapRevenueWorkbook(result.state, bouncedOverwriteWorkbook, {
  now: "2026-06-10T12:15:00.000Z",
  workbookName: "rcap-paid-outreach.xlsx",
  importedBy: "owner"
});
const stickyBounced = result.state.rcapRevenueContacts.find(item => item.contact_id === "C-005");
assert.equal(stickyBounced.suppression_status, "Bounced");
assert.equal(stickyBounced.bounced, true);
assert.equal(stickyBounced.unsubscribed, false);
assert.equal(stickyBounced.email_status, "Not Verified");
assert.equal(stickyBounced.sequence_status, "Not Enrolled");
assert.equal(result.state.rcapRevenueContacts.length, 5);

const malformedWorkbook = {
  workbook_name: "rcap-malformed.xlsx",
  Prospects: [
    { organization_name: "No Prospect ID Org", source_confidence: "Low" },
    { Prospect_ID: "P-010", organization_name: "Valid Org", source_confidence: "High" }
  ],
  Contacts_Master: [
    { contact_name: "No Safe Contact", linked_account_id: "P-010" },
    { contact_name: "Safe Fallback Contact", linked_account_id: "P-010", public_email: "safe@example.com", email_status: "Verified", sequence_status: "Ready to Enroll" }
  ]
};
const malformedResult = importRcapRevenueWorkbook({}, malformedWorkbook, {
  now: "2026-06-10T12:20:00.000Z",
  workbookName: "rcap-malformed.xlsx",
  importedBy: "owner"
});
assert.equal(malformedResult.state.rcapRevenueAccounts.length, 1);
assert.equal(malformedResult.state.rcapRevenueAccounts[0].account_id, "P-010");
assert.equal(malformedResult.state.rcapRevenueContacts.length, 1);
assert.equal(malformedResult.state.rcapRevenueContacts[0].public_email, "safe@example.com");
assert.equal(malformedResult.state.rcapRevenueContacts[0].email_status, "Not Verified");
assert.equal(malformedResult.state.rcapRevenueContacts[0].sequence_status, "Not Enrolled");
assert.ok(malformedResult.batch.warnings.some(warning => warning.includes("lacked a stable Prospect_ID")));
assert.ok(malformedResult.batch.warnings.some(warning => warning.includes("lacked Contact_ID and safe fallback identity")));
assert.ok(malformedResult.batch.warnings.some(warning => warning.includes("used public_email + linked_account_id fallback identity")));

const summary = rcapRevenueFoundationSummary(result.state);
assert.equal(summary.accounts, 2);
assert.equal(summary.contacts, 5);
assert.equal(summary.dealSeeds, 1);
assert.equal(summary.emailSendingEnabled, false);
assert.equal(summary.calendarWritesEnabled, false);
assert.equal(summary.externalActionsEnabled, false);

const server = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
assert(server.includes('"/api/rcap-revenue/import"'), "RCAP Revenue import API route should exist.");
assert(server.includes('["owner", "admin"].includes(actorRole)'), "RCAP Revenue import route should be owner/admin-only.");
assert(server.includes('requiredPermission:"owner/admin"'), "RCAP Revenue import route should report owner/admin access.");
assert(server.includes("rcapRevenueFoundationSummary"), "Preview server should render RCAP Revenue foundation status.");
assert(server.includes("RCAP Revenue OS"), "UI should expose RCAP Revenue OS foundation copy.");
assert(server.includes("RCAP-1 uses skip-on-duplicate"), "RCAP-1 skip-on-duplicate decision should be recorded.");
assert(!server.includes("sendRcapEmail"), "RCAP-1 must not add email sending.");
assert(!server.includes("createGmailDraft"), "RCAP-1 must not add Gmail drafts.");
assert(!server.includes("calendar.events.insert"), "RCAP-1 must not add calendar writes.");
assert(!server.includes("rcapLeadStatus("), "RCAP-1 must not add lead scoring UI/server logic.");

const authEnv = {
  STORAGE_BACKEND:"supabase",
  LOCAL_DEMO_MODE:"false",
  COMMAND_CENTER_OWNER_TOKEN:"owner-token-rcap-revenue-1234567890",
  COMMAND_CENTER_ADMIN_TOKEN:"admin-token-rcap-revenue-1234567890",
  COMMAND_CENTER_OPERATOR_TOKEN:"operator-token-rcap-revenue-1234567890",
  COMMAND_CENTER_VIEWER_TOKEN:"viewer-token-rcap-revenue-1234567890"
};
const routeUrl = new URL("http://local/api/rcap-revenue/import");
const authDecision = role => authorizeRequest(
  { method:"POST", url:"/api/rcap-revenue/import", headers:{}, authenticatedActor:role ? { id:`session-${role}`, role, authenticated:true, session:{ id:`session-${role}` } } : null },
  routeUrl,
  authEnv
);
assert.equal(authDecision("").ok, false, "Unauthenticated RCAP Revenue import should fail the protected API gate.");
assert.equal(authDecision("").status, 401, "Unauthenticated RCAP Revenue import should return 401.");
assert.equal(authDecision("viewer").ok, false, "Viewer RCAP Revenue import should fail the generic mutation gate.");
assert.equal(authDecision("operator").ok, true, "Operator passes generic mutation gate, so the route-specific owner/admin guard is required.");
assert.equal(authDecision("admin").ok, true, "Admin should pass the generic gate before the route-specific guard allows import.");
assert.equal(authDecision("owner").ok, true, "Owner should pass the generic gate before the route-specific guard allows import.");

console.log("RCAP Revenue OS foundation tests passed.");
