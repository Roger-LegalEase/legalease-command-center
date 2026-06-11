function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value || "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function slug(value = "") {
  return lower(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
}

function normalizedKey(value = "") {
  return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function rowValue(row = {}, keys = []) {
  const map = new Map(Object.entries(row || {}).map(([key, value]) => [normalizedKey(key), value]));
  for (const key of keys) {
    const normalized = normalizedKey(key);
    if (map.has(normalized)) return clean(map.get(normalized));
  }
  return "";
}

function boolFromWorkbook(value = "") {
  return /^(true|yes|y|1|bounced|unsubscribed|suppressed)$/i.test(clean(value));
}

function numberFromWorkbook(value = "", fallback = 0) {
  const parsed = Number(clean(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function importId(now = nowIso(), workbookName = "rcap-workbook") {
  return `rcap-import-${slug(workbookName)}-${now.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

function sourceReference(row = {}) {
  return rowValue(row, ["source_url_or_reference", "source_reference", "source_url", "source", "url"]);
}

function provenance(row = {}, fallback = "workbook_import_unspecified") {
  return rowValue(row, ["source_provenance", "provenance", "source_detail"]) || fallback;
}

function sourceConfidence(row = {}) {
  return rowValue(row, ["source_confidence", "confidence", "public_private_confidence"]) || "";
}

function prospectStableKey(row = {}) {
  return rowValue(row, ["source_prospect_id", "prospect_id", "Prospect_ID", "account_id"]);
}

function contactStableKey(row = {}) {
  return rowValue(row, ["source_contact_id", "contact_id", "Contact_ID"]);
}

function isSuppressionStatus(value = "") {
  return /unsubscribe|bounc|suppress|do not contact|do-not-contact/i.test(clean(value));
}

function isSuppressedContact(contact = {}) {
  return Boolean(contact.unsubscribed || contact.bounced || isSuppressionStatus(contact.suppression_status));
}

function safeEmailStatus(contact = {}, fallback = "Not Verified") {
  if (isSuppressedContact(contact)) return "Not Verified";
  const value = clean(contact.email_status);
  return /ready|enrollable/i.test(value) ? fallback : value || fallback;
}

function safeSequenceStatus(contact = {}, fallback = "Not Enrolled") {
  if (isSuppressedContact(contact)) return "Not Enrolled";
  const value = clean(contact.sequence_status);
  return /ready|enroll/i.test(value) ? fallback : value || fallback;
}

function stickySuppressionPatch(existing = {}, incoming = {}) {
  const existingSuppressed = isSuppressedContact(existing);
  const incomingSuppressed = isSuppressedContact(incoming);
  if (!existingSuppressed && !incomingSuppressed) return null;
  const bounced = Boolean(existing.bounced || incoming.bounced);
  const unsubscribed = Boolean(existing.unsubscribed || incoming.unsubscribed);
  const status = bounced
    ? "Bounced"
    : unsubscribed
      ? "Unsubscribed"
      : existingSuppressed
        ? clean(existing.suppression_status) || "Suppressed"
        : clean(incoming.suppression_status) || "Suppressed";
  return {
    ...existing,
    suppression_status: isSuppressionStatus(status) ? status : "Suppressed",
    bounced,
    unsubscribed,
    email_status: "Not Verified",
    sequence_status: "Not Enrolled",
    updated_at: incoming.updated_at || existing.updated_at
  };
}

export function normalizeRcapSegment(value = "", row = {}) {
  const text = lower([value, rowValue(row, ["segment", "rcap_campaign_segment", "org_type", "service_area", "organization_name"])].join(" "));
  if (/a1|anchor|legal aid anchor/.test(text)) return "A1";
  if (/a2|legal aid|legal-aid|clinic|program|operational/.test(text)) return "A2";
  if (/c1|reentry|community|executive/.test(text)) return "C1";
  if (/c2|workforce|case management|program buyer|navigation/.test(text)) return "C2";
  return clean(value || rowValue(row, ["segment", "rcap_campaign_segment"])) || "Unsegmented";
}

export function rcapLandingAssignment(row = {}) {
  const score = numberFromWorkbook(rowValue(row, ["priority_score", "score"]), 0);
  const rawTier = lower(rowValue(row, ["priority_tier", "tier"]));
  const priorityTier = /1|tier one|tier_1|tier-1|top/.test(rawTier) || score >= 90
    ? "Tier 1"
    : /2|tier two|tier_2|tier-2/.test(rawTier) || score >= 70
      ? "Tier 2"
      : "Tier 3";
  const segment = normalizeRcapSegment(rowValue(row, ["segment", "rcap_campaign_segment"]), row);
  const segmentPages = {
    A1: "/rcap/legal-aid-readiness-pilot",
    A2: "/rcap/legal-aid-workflow",
    C1: "/rcap/community-reentry-pilot",
    C2: "/rcap/workforce-record-relief-navigation"
  };
  if (priorityTier === "Tier 1") {
    return {
      priority_tier: priorityTier,
      rcap_campaign_segment: segment,
      rcap_landing_page_url: segmentPages[segment] || "/rcap",
      rcap_cobranded_page_status: "Draft Needed"
    };
  }
  if (priorityTier === "Tier 2") {
    return {
      priority_tier: priorityTier,
      rcap_campaign_segment: segment,
      rcap_landing_page_url: segmentPages[segment] || "/rcap",
      rcap_cobranded_page_status: "Segment Page"
    };
  }
  return {
    priority_tier: priorityTier,
    rcap_campaign_segment: segment,
    rcap_landing_page_url: "/rcap",
    rcap_cobranded_page_status: "Master RCAP Page"
  };
}

export function normalizeRcapAccount(row = {}, context = {}) {
  const importedAt = context.importedAt || nowIso();
  const assignment = rcapLandingAssignment(row);
  const sourceProspectId = rowValue(row, ["source_prospect_id", "prospect_id", "Prospect_ID"]);
  const organizationName = rowValue(row, ["organization_name", "organization", "account_name", "prospect_name"]) || "Unnamed RCAP account";
  return {
    account_id: rowValue(row, ["account_id"]) || sourceProspectId || `rcap-account-${slug(organizationName)}`,
    source_prospect_id: sourceProspectId,
    organization_name: organizationName,
    segment: assignment.rcap_campaign_segment,
    priority_tier: assignment.priority_tier,
    priority_score: numberFromWorkbook(rowValue(row, ["priority_score", "score"]), 0),
    service_area: rowValue(row, ["service_area"]),
    org_type: rowValue(row, ["org_type", "organization_type"]),
    paid_offer_fit: rowValue(row, ["paid_offer_fit"]),
    likely_funding_path: rowValue(row, ["likely_funding_path", "funding_path"]),
    opening_angle: rowValue(row, ["opening_angle"]),
    source_confidence: sourceConfidence(row),
    account_status: rowValue(row, ["account_status", "status"]) || "Imported",
    owner: rowValue(row, ["owner"]) || "Roger",
    next_action_date: rowValue(row, ["next_action_date", "next_touch"]),
    notes: rowValue(row, ["notes"]),
    rcap_campaign_segment: assignment.rcap_campaign_segment,
    rcap_landing_page_url: assignment.rcap_landing_page_url,
    rcap_cobranded_page_status: assignment.rcap_cobranded_page_status,
    source_sheet: context.sourceSheet || "Prospects",
    source_workbook_name: context.workbookName || "",
    source_import_id: context.importId || "",
    source_row_number: context.sourceRowNumber || "",
    source_url_or_reference: sourceReference(row),
    source_provenance: provenance(row),
    imported_at: importedAt,
    updated_at: importedAt
  };
}

export function normalizeRcapContact(row = {}, context = {}) {
  const importedAt = context.importedAt || nowIso();
  const sourceContactId = rowValue(row, ["source_contact_id", "contact_id", "Contact_ID"]);
  const fallbackIdentity = !sourceContactId;
  const publicEmail = rowValue(row, ["public_email", "email"]);
  const suppressionText = lower(rowValue(row, ["suppression_status", "status", "email_status"]));
  const bounced = boolFromWorkbook(rowValue(row, ["bounced"])) || /bounce/.test(suppressionText);
  const unsubscribed = boolFromWorkbook(rowValue(row, ["unsubscribed"])) || /unsubscribe/.test(suppressionText);
  const suppressed = /suppress|do not contact|unsubscribe|bounce/.test(suppressionText);
  const provenanceValue = provenance(row);
  const contact = {
    contact_id: rowValue(row, ["contact_id"]) || sourceContactId || `rcap-contact-${slug([rowValue(row, ["linked_account_id", "account_id", "prospect_id"]), publicEmail, rowValue(row, ["contact_name", "name"])].filter(Boolean).join("-"))}`,
    source_contact_id: sourceContactId,
    linked_account_id: rowValue(row, ["linked_account_id", "account_id", "prospect_id"]),
    linked_prospect_id: rowValue(row, ["linked_prospect_id", "prospect_id", "Prospect_ID"]),
    contact_name: rowValue(row, ["contact_name", "name"]) || "Unnamed contact",
    title: rowValue(row, ["title"]),
    decision_role: rowValue(row, ["decision_role", "role"]),
    public_email: publicEmail,
    public_phone: rowValue(row, ["public_phone", "phone"]),
    contact_route: rowValue(row, ["contact_route", "route"]),
    segment: normalizeRcapSegment(rowValue(row, ["segment"]), row),
    outreach_priority: rowValue(row, ["outreach_priority", "priority"]),
    recommended_first_touch: rowValue(row, ["recommended_first_touch", "first_touch"]),
    personalization_hook: rowValue(row, ["personalization_hook"]),
    budget_angle: rowValue(row, ["budget_angle"]),
    verification_note: rowValue(row, ["verification_note"]),
    source_confidence: sourceConfidence(row),
    source_sheet: context.sourceSheet || "Contacts_Master",
    source_workbook_name: context.workbookName || "",
    source_import_id: context.importId || "",
    source_row_number: context.sourceRowNumber || "",
    source_url_or_reference: sourceReference(row),
    source_provenance: provenanceValue,
    email_status: rowValue(row, ["email_status"]) || "Not Verified",
    sequence_status: rowValue(row, ["sequence_status"]) || "Not Enrolled",
    suppression_status: bounced ? "Bounced" : unsubscribed ? "Unsubscribed" : suppressed ? "Suppressed" : rowValue(row, ["suppression_status"]) || "Active",
    bounced,
    unsubscribed,
    last_touch: rowValue(row, ["last_touch"]),
    next_touch: rowValue(row, ["next_touch", "next_action_date"]),
    imported_at: importedAt,
    updated_at: importedAt
  };
  return {
    ...contact,
    email_status: fallbackIdentity ? "Not Verified" : safeEmailStatus(contact),
    sequence_status: fallbackIdentity ? "Not Enrolled" : safeSequenceStatus(contact)
  };
}

export function normalizeRcapDealSeed(row = {}, context = {}) {
  const importedAt = context.importedAt || nowIso();
  return {
    deal_seed_id: rowValue(row, ["deal_seed_id", "deal_id"]) || `rcap-deal-seed-${slug([rowValue(row, ["linked_account_id", "account_id", "prospect_id"]), rowValue(row, ["proposed_offer", "offer"])].filter(Boolean).join("-"))}`,
    linked_account_id: rowValue(row, ["linked_account_id", "account_id", "prospect_id"]),
    linked_contact_id: rowValue(row, ["linked_contact_id", "contact_id"]),
    proposed_offer: rowValue(row, ["proposed_offer", "offer"]),
    estimated_deal_size: rowValue(row, ["estimated_deal_size", "deal_size"]),
    pilot_volume: rowValue(row, ["pilot_volume"]),
    pilot_length: rowValue(row, ["pilot_length"]),
    funding_source: rowValue(row, ["funding_source"]),
    likely_decision_maker: rowValue(row, ["likely_decision_maker", "decision_maker"]),
    likely_champion: rowValue(row, ["likely_champion", "champion"]),
    target_close_date: rowValue(row, ["target_close_date"]),
    notes: rowValue(row, ["notes"]),
    created_from_import: true,
    source_import_id: context.importId || "",
    imported_at: importedAt,
    updated_at: importedAt
  };
}

function appendUnique(existing = [], incoming = [], keyFn = item => item.id) {
  const seen = new Set(list(existing).map(keyFn).filter(Boolean));
  const added = [];
  const duplicates = [];
  for (const item of list(incoming)) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      duplicates.push(item);
      continue;
    }
    seen.add(key);
    added.push(item);
  }
  return { list: [...list(existing), ...added], added, duplicates };
}

function mergeContactsWithStickySuppression(existing = [], incoming = []) {
  const current = list(existing).map(contact => isSuppressedContact(contact) ? stickySuppressionPatch(contact, {}) : contact);
  const indexByKey = new Map(current.map((item, index) => [contactKey(item), index]).filter(([key]) => Boolean(key)));
  const added = [];
  const duplicates = [];
  for (const contact of list(incoming)) {
    const key = contactKey(contact);
    if (!key || indexByKey.has(key)) {
      duplicates.push(contact);
      const index = indexByKey.get(key);
      if (index !== undefined) {
        const patched = stickySuppressionPatch(current[index], contact);
        if (patched) current[index] = patched;
      }
      continue;
    }
    indexByKey.set(key, current.length);
    current.push(contact);
    added.push(contact);
  }
  return { list: current, added, duplicates };
}

function contactKey(contact = {}) {
  const emailKey = lower(contact.public_email);
  return contact.source_contact_id || contact.contact_id || (emailKey && contact.linked_account_id ? `${emailKey}:${contact.linked_account_id}` : "");
}

function sheetRows(workbook = {}, name = "") {
  return list(workbook[name]);
}

export function previewRcapRevenueWorkbook(workbook = {}, options = {}) {
  const importedAt = options.now || nowIso();
  const workbookName = options.workbookName || workbook.workbook_name || "RCAP workbook";
  const id = options.importId || importId(importedAt, workbookName);
  const warnings = [];
  const errors = [];
  const sheetsDetected = Object.keys(workbook).filter(key => Array.isArray(workbook[key]));
  for (const sheet of ["Prospects", "Contacts_Master"]) {
    if (!Array.isArray(workbook[sheet])) errors.push(`Missing ${sheet} sheet.`);
  }
  const contactsToCheck = [...sheetRows(workbook, "Contacts_Master"), ...sheetRows(workbook, "First_Wave_Contacts"), ...sheetRows(workbook, "Contact_Routes_To_Verify")];
  if (contactsToCheck.some(row => !sourceConfidence(row) || provenance(row) === "workbook_import_unspecified")) {
    warnings.push("Contact provenance not explicit in workbook.");
  }
  sheetRows(workbook, "Prospects").forEach((row, index) => {
    if (!prospectStableKey(row)) warnings.push(`Prospects row ${index + 2} lacked a stable Prospect_ID and will be skipped.`);
  });
  return {
    import_id: id,
    workbook_name: workbookName,
    imported_at: importedAt,
    imported_by: options.importedBy || "owner",
    sheets_detected: sheetsDetected,
    accounts_detected: sheetRows(workbook, "Prospects").length,
    contacts_detected: contactsToCheck.length,
    accounts_imported: 0,
    contacts_imported: 0,
    duplicates_skipped: 0,
    warnings,
    errors,
    status: errors.length ? "failed" : "previewed"
  };
}

export function importRcapRevenueWorkbook(state = {}, workbook = {}, options = {}) {
  const preview = previewRcapRevenueWorkbook(workbook, options);
  if (preview.errors.length) {
    return {
      state: {
        ...state,
        rcapRevenueImportBatches: [preview, ...list(state.rcapRevenueImportBatches)].slice(0, 50)
      },
      batch: preview,
      imported: { accounts: [], contacts: [], dealSeeds: [] }
    };
  }

  const baseContext = {
    importedAt: preview.imported_at,
    workbookName: preview.workbook_name,
    importId: preview.import_id
  };
  const rowWarnings = [];
  const accounts = sheetRows(workbook, "Prospects")
    .map((row, index) => ({ row, sourceRowNumber: index + 2 }))
    .filter(({ row, sourceRowNumber }) => {
      if (prospectStableKey(row)) return true;
      rowWarnings.push(`Prospects row ${sourceRowNumber} lacked a stable Prospect_ID and was skipped.`);
      return false;
    })
    .map(({ row, sourceRowNumber }) => normalizeRcapAccount(row, { ...baseContext, sourceSheet: "Prospects", sourceRowNumber }));
  const accountKeys = new Set([
    ...list(state.rcapRevenueAccounts).flatMap(account => [account.account_id, account.source_prospect_id].filter(Boolean)),
    ...accounts.flatMap(account => [account.account_id, account.source_prospect_id].filter(Boolean))
  ]);
  const contactRows = [
    ...sheetRows(workbook, "Contacts_Master").map((row, index) => ({ row, sourceSheet: "Contacts_Master", sourceRowNumber: index + 2 })),
    ...sheetRows(workbook, "First_Wave_Contacts").map((row, index) => ({ row, sourceSheet: "First_Wave_Contacts", sourceRowNumber: index + 2 })),
    ...sheetRows(workbook, "Contact_Routes_To_Verify").map((row, index) => ({ row, sourceSheet: "Contact_Routes_To_Verify", sourceRowNumber: index + 2 }))
  ];
  const contacts = contactRows
    .filter(({ row, sourceSheet, sourceRowNumber }) => {
      if (contactStableKey(row)) return true;
      const publicEmail = rowValue(row, ["public_email", "email"]);
      const linkedAccountId = rowValue(row, ["linked_account_id", "account_id", "prospect_id"]);
      if (publicEmail && linkedAccountId && accountKeys.has(linkedAccountId)) {
        rowWarnings.push(`${sourceSheet} row ${sourceRowNumber} lacked Contact_ID and used public_email + linked_account_id fallback identity.`);
        return true;
      }
      rowWarnings.push(`${sourceSheet} row ${sourceRowNumber} lacked Contact_ID and safe fallback identity and was skipped.`);
      return false;
    })
    .map(({ row, sourceSheet, sourceRowNumber }) => normalizeRcapContact(row, { ...baseContext, sourceSheet, sourceRowNumber }));
  const dealSeeds = [...sheetRows(workbook, "Deals"), ...sheetRows(workbook, "Opportunities")]
    .filter(row => rowValue(row, ["deal_stage", "stage", "proposed_offer", "estimated_deal_size", "pilot_volume", "funding_source"]))
    .map((row, index) => normalizeRcapDealSeed(row, { ...baseContext, sourceRowNumber: index + 2 }));

  // RCAP-1 uses skip-on-duplicate as the foundation behavior. A future update-existing
  // importer must preserve sticky suppression before changing any duplicate merge rules.
  const accountMerge = appendUnique(state.rcapRevenueAccounts, accounts, item => item.source_prospect_id || item.account_id);
  const contactMerge = mergeContactsWithStickySuppression(state.rcapRevenueContacts, contacts);
  const dealMerge = appendUnique(state.rcapRevenueDealSeeds, dealSeeds, item => item.deal_seed_id);
  const batch = {
    ...preview,
    warnings: [...preview.warnings, ...rowWarnings],
    accounts_imported: accountMerge.added.length,
    contacts_imported: contactMerge.added.length,
    duplicates_skipped: accountMerge.duplicates.length + contactMerge.duplicates.length + dealMerge.duplicates.length,
    status: "imported"
  };
  return {
    state: {
      ...state,
      rcapRevenueAccounts: accountMerge.list,
      rcapRevenueContacts: contactMerge.list,
      rcapRevenueDealSeeds: dealMerge.list,
      rcapRevenueImportBatches: [batch, ...list(state.rcapRevenueImportBatches)].slice(0, 50),
      rcapRevenueReferences: {
        contactPlaybook: sheetRows(workbook, "Contact_Playbook"),
        top25: sheetRows(workbook, "Top_25"),
        fundingTriggers: sheetRows(workbook, "Funding_Triggers"),
        salesActions: sheetRows(workbook, "Sales_Actions")
      }
    },
    batch,
    imported: { accounts: accountMerge.added, contacts: contactMerge.added, dealSeeds: dealMerge.added }
  };
}

export function rcapRevenueFoundationSummary(state = {}) {
  const latest = list(state.rcapRevenueImportBatches)[0] || {};
  return {
    accounts: list(state.rcapRevenueAccounts).length,
    contacts: list(state.rcapRevenueContacts).length,
    dealSeeds: list(state.rcapRevenueDealSeeds).length,
    importBatches: list(state.rcapRevenueImportBatches).length,
    latestStatus: latest.status || "not imported",
    emailSendingEnabled: false,
    calendarWritesEnabled: false,
    externalActionsEnabled: false
  };
}
