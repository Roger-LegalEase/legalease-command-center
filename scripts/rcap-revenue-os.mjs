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

export function isRcapContactSuppressed(contact = {}) {
  return isSuppressedContact(contact);
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

const allowedRcapTaskStatuses = new Set(["New", "Ready", "Parked", "Completed", "Skipped", "Blocked"]);
const suppressedOutreachTaskTypes = new Set(["RCAP Outreach Approval", "RCAP Follow-Up", "RCAP Proposal Task"]);

function accountKey(account = {}) {
  return account.account_id || account.source_prospect_id || "";
}

function findAccount(accounts = [], id = "") {
  return list(accounts).find(account => account.account_id === id || account.source_prospect_id === id) || {};
}

function findContact(contacts = [], id = "") {
  return list(contacts).find(contact => contact.contact_id === id || contact.source_contact_id === id) || {};
}

function rcapTaskSlug(value = "") {
  return slug(value).slice(0, 60);
}

function rcapTaskId(type = "", parts = []) {
  return `rcap-task-${rcapTaskSlug(type)}-${rcapTaskSlug(parts.filter(Boolean).join("-"))}`;
}

function isHighPriorityAccount(account = {}) {
  return /tier\s*1/i.test(clean(account.priority_tier)) || Number(account.priority_score || 0) >= 90;
}

function accountIsNew(account = {}) {
  return !clean(account.account_status) || /new|imported/i.test(clean(account.account_status));
}

function confidenceIsSafe(value = "") {
  return /^(high|medium)$/i.test(clean(value));
}

function confidenceNeedsResearch(value = "") {
  return !clean(value) || /low|unknown|missing|verify/i.test(clean(value));
}

function contactHasFallbackIdentity(contact = {}) {
  return !clean(contact.source_contact_id) || /^rcap-contact-/i.test(clean(contact.contact_id));
}

function contactNeedsResearch(contact = {}) {
  const note = lower(contact.verification_note);
  const route = lower(contact.contact_route);
  return !clean(contact.public_email)
    || contactHasFallbackIdentity(contact)
    || confidenceNeedsResearch(contact.source_confidence)
    || /caution|verify|unverified|needs|unknown|missing|route/.test(note)
    || /verify|fallback|unknown|missing/.test(route)
    || Boolean(contact.bounced);
}

function contactIsDecisionRelevant(contact = {}, account = {}) {
  const text = lower([
    contact.title,
    contact.decision_role,
    contact.outreach_priority,
    account.rcap_cobranded_page_status,
    account.paid_offer_fit
  ].join(" "));
  return isHighPriorityAccount(account)
    || /executive|ceo|chief|director|board chair|chair|funder|decision|champion|co-?branded|priority|high/.test(text);
}

function combinedApprovalText(account = {}, contact = {}, action = {}) {
  return lower([
    account.organization_name,
    account.priority_tier,
    account.rcap_cobranded_page_status,
    contact.title,
    contact.decision_role,
    contact.source_confidence,
    action.title,
    action.body,
    action.summary,
    action.notes,
    action.page_type,
    action.page_label,
    action.pricing,
    action.clinic_date
  ].join(" "));
}

function tierIsOne(account = {}) {
  return /^tier\s*1$/i.test(clean(account.priority_tier));
}

function tierIsTwoOrThree(account = {}) {
  return /^tier\s*[23]$/i.test(clean(account.priority_tier));
}

function confidenceLevel(value = "") {
  if (value === null || value === undefined) return "missing";
  const text = lower(value);
  if (/^medium$/.test(text)) return "medium";
  if (/^low$/.test(text)) return "low";
  if (/^high$/.test(text)) return "high";
  return text || "missing";
}

function publicEmailVerified(contact = {}) {
  return Boolean(clean(contact.public_email) && /^verified$/i.test(clean(contact.email_status)));
}

function hasClearSegment(account = {}, contact = {}) {
  const segment = clean(contact.segment || account.segment || account.rcap_campaign_segment);
  return Boolean(segment && !/unsegmented|unknown|missing|none/i.test(segment));
}

function actionIsCoBranded(account = {}, action = {}) {
  return /co-?branded/.test(combinedApprovalText(account, {}, action));
}

function actionIsGenericPage(account = {}, action = {}) {
  const text = lower([
    account.rcap_cobranded_page_status,
    action.page_type,
    action.page_label,
    action.page_status
  ].join(" "));
  return /generic|master rcap page|segment page|standard|default/.test(text) && !/co-?branded/.test(text);
}

function actionReferencesClinicDate(action = {}) {
  const text = lower([action.clinic_date, action.body, action.summary, action.notes].join(" "));
  return Boolean(clean(action.clinic_date))
    || /clinic\s*(date|on|at|event|next|this|upcoming)|upcoming clinic|expungement clinic|record relief clinic/.test(text)
    || /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b/.test(text)
    || /\b(event|workshop)\s+date\b/.test(text)
    || /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/.test(text)
    || (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|202\d/.test(text) && /clinic|event|workshop/.test(text));
}

function actionIncludesPricing(action = {}) {
  const text = lower([action.pricing, action.body, action.summary, action.notes].join(" "));
  return Boolean(clean(action.pricing))
    || /\$\s*\d|dollars?|pricing|price|cost|fee|paid|budget|investment|invoice|payment|rate|retainer|per month|per seat|per participant|pilot investment/.test(text)
    || /(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\s+(dollars?|payment|budget|investment|fee|cost)/.test(text);
}

function actionHasSensitiveClaim(action = {}) {
  const value = action.sensitive_claim;
  if (value === true) return true;
  const text = lower([value, action.body, action.summary, action.notes].join(" "));
  return /guarantee|guaranteed|legal advice|eligibility promise|court will approve|record will be cleared|outcome/.test(text);
}

function suppressionReasonsFor(contact = {}) {
  const reasons = [];
  if (contact.unsubscribed) reasons.push("unsubscribed");
  if (contact.bounced) reasons.push("bounced");
  if (isSuppressionStatus(contact.suppression_status)) reasons.push("suppression_status");
  if (!reasons.length && isRcapContactSuppressed(contact)) reasons.push("suppressed");
  return [...new Set(reasons)];
}

export function evaluateRcapApproval(account = {}, contact = {}, action = {}) {
  if (isRcapContactSuppressed(contact)) {
    const suppressionReasons = suppressionReasonsFor(contact);
    return {
      status: "blocked_suppressed",
      reasons: suppressionReasons,
      mustApproveReasons: [],
      missingAllowlistReasons: [],
      suppressionReasons
    };
  }

  const mustApproveReasons = [];
  const titleRole = lower([contact.title, contact.decision_role].join(" "));
  const confidence = confidenceLevel(contact.source_confidence);
  if (tierIsOne(account)) mustApproveReasons.push("tier_1_account");
  if (/executive director|\be\.?d\.?\b/.test(titleRole)) mustApproveReasons.push("executive_director_contact");
  if (/\bceo\b|chief executive|chief exec/.test(titleRole)) mustApproveReasons.push("ceo_contact");
  if (/board chair|chair of the board|board.*chair|board president/.test(titleRole)) mustApproveReasons.push("board_chair_contact");
  if (/\bfunder\b|grantmaker|foundation officer|philanthropy|foundation.*program officer|program officer.*foundation/.test(titleRole)) mustApproveReasons.push("funder_contact");
  if (/\bsenior\b|chief|president|founder|principal|partner|director/.test(titleRole) && !mustApproveReasons.length) mustApproveReasons.push("senior_ambiguous_contact");
  if (confidence === "medium") mustApproveReasons.push("medium_source_confidence");
  if (confidence === "low") mustApproveReasons.push("low_source_confidence");
  if (!clean(contact.public_email)) mustApproveReasons.push("missing_public_email");
  if (actionIsCoBranded(account, action)) mustApproveReasons.push("co_branded_page");
  if (actionReferencesClinicDate(action)) mustApproveReasons.push("clinic_date_reference");
  if (actionIncludesPricing(action)) mustApproveReasons.push("pricing_reference");

  const missingAllowlistReasons = [];
  if (!tierIsTwoOrThree(account)) missingAllowlistReasons.push("tier_2_or_3_required");
  if (confidence === "missing") missingAllowlistReasons.push("missing_source_confidence");
  if (!["high", "medium", "low", "missing"].includes(confidence)) missingAllowlistReasons.push("unknown_source_confidence");
  if (!publicEmailVerified(contact)) missingAllowlistReasons.push("email_not_verified");
  if (!hasClearSegment(account, contact)) missingAllowlistReasons.push("missing_clear_segment");
  if (actionHasSensitiveClaim(action)) missingAllowlistReasons.push("sensitive_claim_present");
  if (!actionIsGenericPage(account, action)) missingAllowlistReasons.push("generic_page_required");
  if (actionReferencesClinicDate(action)) missingAllowlistReasons.push("no_clinic_date_required");
  if (actionIncludesPricing(action)) missingAllowlistReasons.push("no_pricing_required");

  const reasons = [...new Set([...mustApproveReasons, ...missingAllowlistReasons])];
  return {
    status: reasons.length ? "needs_human_approval" : "auto_ready",
    reasons,
    mustApproveReasons,
    missingAllowlistReasons,
    suppressionReasons: []
  };
}

export function applyRcapApprovalDecision(account = {}, contact = {}, action = {}, options = {}) {
  const evaluation = evaluateRcapApproval(account, contact, action);
  if (evaluation.status === "blocked_suppressed") {
    return {
      ok: false,
      status: "blocked_suppressed",
      readyState: "Blocked - Suppressed",
      readyToEnroll: false,
      internalOnly: true,
      externalActionsTriggered: [],
      evaluation
    };
  }
  const decision = lower(options.decision || (evaluation.status === "auto_ready" ? "auto_ready" : ""));
  const approved = evaluation.status === "auto_ready" || ["approve", "approved", "reapprove", "human_approved"].includes(decision);
  if (!approved) {
    return {
      ok: false,
      status: "needs_human_approval",
      readyState: "Needs Human Approval",
      readyToEnroll: false,
      internalOnly: true,
      externalActionsTriggered: [],
      evaluation
    };
  }
  return {
    ok: true,
    status: "ready_to_enroll",
    readyState: "Ready to Enroll",
    readyToEnroll: true,
    approvalSource: evaluation.status === "auto_ready" ? "auto_ready" : "human_approved",
    approvedBy: options.approvedBy || "owner",
    internalOnly: true,
    externalActionsTriggered: [],
    evaluation
  };
}

export function canCreateRcapOutreachTask(contact = {}, account = {}) {
  if (!contact || isRcapContactSuppressed(contact)) return false;
  if (!/active/i.test(clean(contact.suppression_status || "Active"))) return false;
  if (!clean(contact.public_email)) return false;
  if (!confidenceIsSafe(contact.source_confidence)) return false;
  if (!/^not enrolled$/i.test(clean(contact.sequence_status || "Not Enrolled"))) return false;
  if (!/^(not verified|verified)$/i.test(clean(contact.email_status || "Not Verified"))) return false;
  return contactIsDecisionRelevant(contact, account);
}

// These behavioral signals are intentionally deferred until LegalEase has real,
// consented tracking sensors. They are listed for auditability and score 0.
export const RCAP_DEFERRED_BEHAVIORAL_SIGNALS = [
  "email opens",
  "email clicks",
  "page views",
  "pricing clicks",
  "pilot-scope clicks",
  "funding-language downloads",
  "co-branded page views"
];

const rcapInternalScoreWeights = new Map([
  ["manual_positive_reply", 75],
  ["manual_meeting_booked", 75],
  ["manual_form_submitted", 50],
  ["manual_proposal_requested", 50],
  ["manual_budget_path_identified", 40],
  ["manual_discovery_completed", 35],
  ["manual_referred_to_another_person", 20],
  ["manual_proposal_sent", 20],
  ["closed_won", 100]
]);

const rcapDeferredSignalLabels = new Map([
  ["email_open", "email opens"],
  ["email_opens", "email opens"],
  ["email_click", "email clicks"],
  ["email_clicks", "email clicks"],
  ["click", "email clicks"],
  ["page_view", "page views"],
  ["page_views", "page views"],
  ["pricing_click", "pricing clicks"],
  ["pricing_clicks", "pricing clicks"],
  ["pilot_scope_click", "pilot-scope clicks"],
  ["pilot_scope_clicks", "pilot-scope clicks"],
  ["pilot-scope_click", "pilot-scope clicks"],
  ["funding_language_download", "funding-language downloads"],
  ["funding_language_downloads", "funding-language downloads"],
  ["co_branded_page_view", "co-branded page views"],
  ["co_branded_page_views", "co-branded page views"],
  ["cobranded_page_view", "co-branded page views"],
  ["cobranded_page_views", "co-branded page views"]
]);

function rcapScoreSignal(event = {}) {
  return normalizedKey(event.event_type || event.type || event.signal || event.action || event.name || "");
}

function rcapScoreRecordIds(account = {}, contact = {}, dealSeed = {}) {
  return new Set([
    account.account_id,
    account.source_prospect_id,
    contact.contact_id,
    contact.source_contact_id,
    contact.linked_account_id,
    contact.linked_prospect_id,
    dealSeed.deal_seed_id,
    dealSeed.linked_account_id,
    dealSeed.linked_contact_id
  ].map(clean).filter(Boolean));
}

function rcapScoreEventIds(event = {}) {
  return [
    event.account_id,
    event.linked_account_id,
    event.source_prospect_id,
    event.contact_id,
    event.linked_contact_id,
    event.source_contact_id,
    event.deal_seed_id,
    event.linked_deal_seed_id
  ].map(clean).filter(Boolean);
}

function rcapEventMatchesRecord(event = {}, account = {}, contact = {}, dealSeed = {}) {
  const eventIds = rcapScoreEventIds(event);
  if (!eventIds.length) return true;
  const recordIds = rcapScoreRecordIds(account, contact, dealSeed);
  return eventIds.some(id => recordIds.has(id));
}

function rcapStatusForScore(score = 0) {
  if (score >= 75) return "Immediate Follow-Up";
  if (score >= 50) return "Sales Qualified";
  if (score >= 25) return "Warm";
  if (score >= 10) return "Light Engagement";
  return "Cold";
}

function rcapEventReason(signal = "", points = 0) {
  return `${signal.replace(/_/g, " ")}${points ? ` +${points}` : ""}`;
}

export function calculateRcapInternalScore(account = {}, contact = {}, dealSeed = {}, tasks = [], events = []) {
  const matchedEvents = list(events).filter(event => rcapEventMatchesRecord(event, account, contact, dealSeed));
  const reasons = [];
  const deferredSignals = [];
  let score = 0;
  let closedLost = false;
  let suppressed = isRcapContactSuppressed(contact);

  for (const event of matchedEvents) {
    const signal = rcapScoreSignal(event);
    if (!signal) continue;
    if (["suppressed", "bounced", "unsubscribed", "do_not_contact", "do-not-contact"].includes(signal)) {
      suppressed = true;
      reasons.push(rcapEventReason(signal));
      continue;
    }
    if (signal === "closed_lost") {
      closedLost = true;
      reasons.push("closed lost history");
      continue;
    }
    if (rcapDeferredSignalLabels.has(signal)) {
      deferredSignals.push(rcapDeferredSignalLabels.get(signal));
      continue;
    }
    if (!rcapInternalScoreWeights.has(signal)) continue;
    const points = rcapInternalScoreWeights.get(signal);
    score += points;
    reasons.push(rcapEventReason(signal, points));
  }

  for (const task of list(tasks)) {
    const taskText = lower([task.task_type, task.safe_action_type, task.status, task.reason].join(" "));
    if (/suppression|data cleanup/.test(taskText)) reasons.push("cleanup/review task present");
    if (/needs human approval/.test(taskText)) reasons.push("needs human approval");
  }

  if (closedLost && score === 0) {
    return {
      score: 0,
      status: suppressed ? "Suppressed" : "Cold",
      reasons: [...new Set(reasons)],
      suppressed,
      source: "internal_only",
      deferredSignals: [...new Set(deferredSignals)]
    };
  }

  return {
    score,
    status: suppressed ? "Suppressed" : rcapStatusForScore(score),
    reasons: [...new Set(reasons)],
    suppressed,
    source: "internal_only",
    deferredSignals: [...new Set(deferredSignals)]
  };
}

const rcapSavedViewDefinitions = [
  {
    key: "first_wave_ready",
    label: "First Wave Ready",
    description: "Clean, non-suppressed contacts that can enter the first internal review wave.",
    filterOnly: true,
    actions: []
  },
  {
    key: "needs_human_approval",
    label: "Needs Human Approval",
    description: "Decision-relevant records requiring Roger before any future outreach step.",
    filterOnly: true,
    actions: []
  },
  {
    key: "suppression_data_cleanup",
    label: "Suppression / Data Cleanup",
    description: "Suppressed, bounced, unsubscribed, missing-provenance, or cleanup-only records.",
    filterOnly: true,
    actions: []
  },
  {
    key: "hot_accounts",
    label: "Hot Accounts",
    description: "Non-suppressed accounts with strong manual/internal buying signals.",
    filterOnly: true,
    actions: []
  },
  {
    key: "proposal_follow_up",
    label: "Proposal Follow-Up",
    description: "Proposal or deal-seed records that need internal follow-up review.",
    filterOnly: true,
    actions: []
  },
  {
    key: "funding_nurture",
    label: "Funding Nurture",
    description: "Accounts with known funding paths or budget angles to watch internally.",
    filterOnly: true,
    actions: []
  },
  {
    key: "reply_queue",
    label: "Reply Queue",
    description: "Manual positive replies and referral signals from non-suppressed contacts.",
    filterOnly: true,
    actions: []
  },
  {
    key: "closed_won_onboarding",
    label: "Closed Won / Onboarding",
    description: "Closed-won records that need internal onboarding review only.",
    filterOnly: true,
    actions: []
  }
];

export function rcapRevenueSavedViewDefinitions() {
  return rcapSavedViewDefinitions.map(view => ({
    ...view,
    actions: [...view.actions]
  }));
}

function rcapSavedViewItem(fields = {}) {
  return {
    ...fields,
    filterOnly: true,
    actions: []
  };
}

function dedupeSavedViewItems(items = []) {
  const seen = new Set();
  return list(items).filter(item => {
    const key = [
      item.kind,
      item.account_id,
      item.contact_id,
      item.deal_seed_id,
      item.task_id,
      item.import_id,
      item.title
    ].map(clean).filter(Boolean).join("|");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rcapGenericApprovalAction() {
  return {
    page_type: "generic",
    page_label: "Generic RCAP page",
    body: "Internal RCAP saved-view review. No sending, enrollment, calendar write, or external action.",
    sensitive_claim: false,
    clinic_date: "",
    pricing: ""
  };
}

function rcapContactMatchesAccount(contact = {}, account = {}) {
  const ids = new Set([account.account_id, account.source_prospect_id].map(clean).filter(Boolean));
  return ids.has(clean(contact.linked_account_id)) || ids.has(clean(contact.linked_prospect_id));
}

function rcapEventsForRecord(events = [], account = {}, contact = {}, dealSeed = {}) {
  return list(events).filter(event => rcapEventMatchesRecord(event, account, contact, dealSeed));
}

function rcapTasksForRecord(tasks = [], account = {}, contact = {}, dealSeed = {}) {
  return list(tasks).filter(task => rcapEventMatchesRecord({
    linked_account_id: task.linked_account_id,
    linked_contact_id: task.linked_contact_id,
    linked_deal_seed_id: task.linked_deal_seed_id
  }, account, contact, dealSeed));
}

function rcapContactDisplay(contact = {}) {
  return clean(contact.contact_name) || clean(contact.public_email) || clean(contact.contact_id) || "RCAP contact";
}

function rcapAccountDisplay(account = {}) {
  return clean(account.organization_name) || clean(account.account_id) || "RCAP account";
}

export function rcapRevenueSavedViews(state = {}, options = {}) {
  const accounts = list(state.rcapRevenueAccounts);
  const contacts = list(state.rcapRevenueContacts);
  const dealSeeds = list(state.rcapRevenueDealSeeds);
  const tasks = list(state.rcapRevenueQueueTasks);
  const batches = list(state.rcapRevenueImportBatches);
  const events = [
    ...list(state.rcapRevenueEvents),
    ...list(state.rcapRevenueSignals),
    ...list(options.events)
  ];
  const views = Object.fromEntries(rcapSavedViewDefinitions.map(definition => [definition.key, []]));
  const approvalAction = rcapGenericApprovalAction();

  for (const contact of contacts) {
    const account = findAccount(accounts, contact.linked_account_id || contact.linked_prospect_id);
    const deal = dealSeeds.find(seed => seed.linked_contact_id === contact.contact_id || seed.linked_account_id === accountKey(account)) || {};
    const recordEvents = rcapEventsForRecord(events, account, contact, deal);
    const recordTasks = rcapTasksForRecord(tasks, account, contact, deal);
    const score = calculateRcapInternalScore(account, contact, deal, recordTasks, recordEvents);
    const approval = evaluateRcapApproval(account, contact, approvalAction);
    const suppressed = score.suppressed || isRcapContactSuppressed(contact);
    const safeItem = extra => rcapSavedViewItem({
      kind: "contact",
      account_id: accountKey(account),
      contact_id: contact.contact_id,
      title: `${rcapContactDisplay(contact)} · ${rcapAccountDisplay(account)}`,
      score: score.score,
      scoringStatus: score.status,
      suppressed,
      ...extra
    });

    if (!suppressed && approval.status === "auto_ready" && publicEmailVerified(contact) && /^not enrolled$/i.test(clean(contact.sequence_status || "Not Enrolled"))) {
      views.first_wave_ready.push(safeItem({ reason: "Clean verified contact; first-wave internal review candidate." }));
    }
    if (!suppressed && approval.status === "needs_human_approval") {
      views.needs_human_approval.push(safeItem({ reason: approval.reasons.join(", ") || "Human approval required." }));
    }
    if (suppressed || contactNeedsResearch(contact) || /cleanup|data/i.test(recordTasks.map(task => [task.task_type, task.reason].join(" ")).join(" "))) {
      views.suppression_data_cleanup.push(safeItem({ reason: suppressed ? "Suppressed contact — cleanup only." : "Contact data needs cleanup before any future outreach." }));
    }
    if (!suppressed && ["Sales Qualified", "Immediate Follow-Up"].includes(score.status)) {
      views.hot_accounts.push(rcapSavedViewItem({
        kind: "account",
        account_id: accountKey(account),
        contact_id: contact.contact_id,
        title: rcapAccountDisplay(account),
        score: score.score,
        scoringStatus: score.status,
        reason: score.reasons.join(", ") || "Internal signal score."
      }));
    }
    if (!suppressed && recordEvents.some(event => ["manual_positive_reply", "manual_referred_to_another_person"].includes(rcapScoreSignal(event)))) {
      views.reply_queue.push(safeItem({ reason: "Manual reply/referral signal." }));
    }
  }

  for (const account of accounts) {
    const accountContacts = contacts.filter(contact => rcapContactMatchesAccount(contact, account));
    const anyUnsuppressedContact = !accountContacts.length || accountContacts.some(contact => !isRcapContactSuppressed(contact));
    if (anyUnsuppressedContact && /fund|grant|budget|foundation|state|city|county|workforce/i.test([account.likely_funding_path, account.paid_offer_fit, account.opening_angle, account.notes].join(" "))) {
      views.funding_nurture.push(rcapSavedViewItem({
        kind: "account",
        account_id: accountKey(account),
        title: rcapAccountDisplay(account),
        reason: clean(account.likely_funding_path || account.paid_offer_fit || "Known funding/budget angle."),
        score: Math.max(0, Number(account.priority_score || 0))
      }));
    }
    if (/closed won/i.test(clean(account.account_status))) {
      views.closed_won_onboarding.push(rcapSavedViewItem({
        kind: "account",
        account_id: accountKey(account),
        title: rcapAccountDisplay(account),
        reason: "Closed Won account — internal onboarding review only."
      }));
    }
  }

  for (const deal of dealSeeds) {
    const account = findAccount(accounts, deal.linked_account_id);
    const contact = findContact(contacts, deal.linked_contact_id);
    const suppressed = deal.linked_contact_id && isRcapContactSuppressed(contact);
    const dealEvents = rcapEventsForRecord(events, account, contact, deal);
    if (!suppressed && (clean(deal.proposed_offer) || clean(deal.funding_source) || dealEvents.some(event => ["manual_proposal_requested", "manual_proposal_sent"].includes(rcapScoreSignal(event))))) {
      views.proposal_follow_up.push(rcapSavedViewItem({
        kind: "deal_seed",
        account_id: accountKey(account) || deal.linked_account_id,
        contact_id: deal.linked_contact_id,
        deal_seed_id: deal.deal_seed_id,
        title: clean(deal.proposed_offer) || `Proposal review for ${rcapAccountDisplay(account)}`,
        reason: "Proposal/deal seed needs internal follow-up review."
      }));
    }
    if (/closed won/i.test([deal.stage, deal.status, deal.notes].join(" "))) {
      views.closed_won_onboarding.push(rcapSavedViewItem({
        kind: "deal_seed",
        account_id: accountKey(account) || deal.linked_account_id,
        contact_id: deal.linked_contact_id,
        deal_seed_id: deal.deal_seed_id,
        title: clean(deal.proposed_offer) || `Closed Won follow-through for ${rcapAccountDisplay(account)}`,
        reason: "Closed Won deal seed — internal onboarding review only."
      }));
    }
  }

  for (const task of tasks) {
    if (/completed|skipped|parked/i.test(clean(task.status))) continue;
    const item = rcapSavedViewItem({
      kind: "task",
      task_id: task.task_id,
      account_id: task.linked_account_id,
      contact_id: task.linked_contact_id,
      deal_seed_id: task.linked_deal_seed_id,
      title: clean(task.title) || clean(task.task_type) || "RCAP task",
      reason: clean(task.reason) || "Internal RCAP task."
    });
    if (/Data Cleanup/i.test(clean(task.task_type))) views.suppression_data_cleanup.push(item);
    if (/Outreach Approval|Account Review/i.test(clean(task.task_type))) views.needs_human_approval.push(item);
    if (/Proposal|Follow-Up/i.test(clean(task.task_type))) views.proposal_follow_up.push(item);
    if (/Onboarding/i.test(clean(task.task_type))) views.closed_won_onboarding.push(item);
  }

  for (const batch of batches) {
    for (const warning of list(batch.warnings)) {
      if (!/lacked|fallback|duplicate|suppression|bounced|unsubscribed|provenance/i.test(warning)) continue;
      views.suppression_data_cleanup.push(rcapSavedViewItem({
        kind: "import_warning",
        import_id: batch.import_id,
        title: "Import cleanup warning",
        reason: warning
      }));
    }
  }

  return rcapSavedViewDefinitions.map(definition => {
    const items = dedupeSavedViewItems(views[definition.key]);
    return {
      ...definition,
      count: items.length,
      items,
      actions: []
    };
  });
}

export function assertNoSuppressedOutreachTask(task = {}, contact = {}) {
  if (isRcapContactSuppressed(contact) && suppressedOutreachTaskTypes.has(task.task_type)) {
    throw new Error("Suppressed RCAP contacts cannot receive outreach, follow-up, or proposal tasks.");
  }
  return true;
}

function normalizeTaskStatus(value = "New") {
  const status = clean(value) || "New";
  return allowedRcapTaskStatuses.has(status) ? status : "New";
}

function buildRcapTask(fields = {}, options = {}) {
  const now = options.now || nowIso();
  const task = {
    task_id: fields.task_id,
    task_type: fields.task_type,
    title: fields.title,
    linked_account_id: fields.linked_account_id || "",
    linked_contact_id: fields.linked_contact_id || "",
    linked_deal_seed_id: fields.linked_deal_seed_id || "",
    segment: fields.segment || "",
    priority_tier: fields.priority_tier || "",
    source_import_id: fields.source_import_id || "",
    due_date: fields.due_date || "",
    owner: fields.owner || options.owner || "owner",
    status: normalizeTaskStatus(fields.status || "New"),
    reason: fields.reason || "",
    safe_action_type: fields.safe_action_type || "internal_review",
    created_at: fields.created_at || now,
    updated_at: fields.updated_at || now
  };
  if (/send|sent|enroll|gmail|calendar|sms|call|publish|post now/i.test([task.status, task.safe_action_type, task.title, task.reason].join(" "))) {
    task.status = "New";
    task.safe_action_type = "internal_review";
    task.reason = "Internal review task only. No outreach action is enabled.";
  }
  return task;
}

function addUniqueTask(tasks = [], existingIds = new Set(), task = {}) {
  if (!task.task_id || existingIds.has(task.task_id)) return false;
  existingIds.add(task.task_id);
  tasks.push(task);
  return true;
}

function taskOpen(task = {}) {
  return !/completed|skipped|parked/i.test(clean(task.status));
}

function taskDueOrPast(task = {}, now = nowIso()) {
  const due = clean(task.due_date);
  if (!due) return false;
  return due.slice(0, 10) <= now.slice(0, 10);
}

export function rcapRevenueTaskBucketKey(task = {}, options = {}) {
  const now = options.now || nowIso();
  if (!taskOpen(task)) return "";
  switch (task.task_type) {
    case "RCAP Data Cleanup":
      return "reports_proof";
    case "RCAP Contact Research":
      return "rcap_watch";
    case "RCAP Account Review":
    case "RCAP Outreach Approval":
      return "bulk_review";
    case "RCAP Follow-Up":
      return taskDueOrPast(task, now) ? "overdue_followups" : "bulk_review";
    case "RCAP Proposal Task":
    case "RCAP Deal Task":
    case "RCAP Onboarding Task":
      return "ready_to_ship";
    default:
      return "rcap_watch";
  }
}

export function rcapRevenueTaskSummary(state = {}) {
  const tasks = list(state.rcapRevenueQueueTasks);
  return {
    total: tasks.length,
    open: tasks.filter(taskOpen).length,
    accountReview: tasks.filter(task => task.task_type === "RCAP Account Review").length,
    contactResearch: tasks.filter(task => task.task_type === "RCAP Contact Research").length,
    outreachApproval: tasks.filter(task => task.task_type === "RCAP Outreach Approval").length,
    followUp: tasks.filter(task => task.task_type === "RCAP Follow-Up").length,
    dataCleanup: tasks.filter(task => task.task_type === "RCAP Data Cleanup").length
  };
}

export function generateRcapRevenueQueueTasks(state = {}, options = {}) {
  const now = options.now || nowIso();
  const accounts = list(state.rcapRevenueAccounts);
  const contacts = list(state.rcapRevenueContacts);
  const dealSeeds = list(state.rcapRevenueDealSeeds);
  const batches = list(state.rcapRevenueImportBatches);
  const nextTasks = list(state.rcapRevenueQueueTasks).slice();
  const existingIds = new Set(nextTasks.map(task => task.task_id).filter(Boolean));
  const created = [];
  const add = (task, contact = {}) => {
    assertNoSuppressedOutreachTask(task, contact);
    if (addUniqueTask(nextTasks, existingIds, task)) created.push(task);
  };

  for (const account of accounts) {
    const key = accountKey(account);
    if (isHighPriorityAccount(account) && accountIsNew(account) && clean(account.organization_name)) {
      add(buildRcapTask({
        task_id: rcapTaskId("account-review", [key]),
        task_type: "RCAP Account Review",
        title: `Review RCAP account: ${clean(account.organization_name)}`,
        linked_account_id: key,
        segment: account.segment || account.rcap_campaign_segment,
        priority_tier: account.priority_tier,
        source_import_id: account.source_import_id,
        due_date: account.next_action_date,
        owner: account.owner,
        status: "Ready",
        reason: "Tier 1 or high-priority imported account needs internal review.",
        safe_action_type: "internal_account_review"
      }, { now, owner: options.owner }));
    }
    if (/closed won/i.test(clean(account.account_status))) {
      add(buildRcapTask({
        task_id: rcapTaskId("onboarding", [key]),
        task_type: "RCAP Onboarding Task",
        title: `Prepare RCAP onboarding review: ${clean(account.organization_name)}`,
        linked_account_id: key,
        segment: account.segment || account.rcap_campaign_segment,
        priority_tier: account.priority_tier,
        source_import_id: account.source_import_id,
        status: "New",
        reason: "Imported account is explicitly Closed Won.",
        safe_action_type: "internal_onboarding_review"
      }, { now, owner: options.owner }));
    }
  }

  for (const contact of contacts) {
    const account = findAccount(accounts, contact.linked_account_id || contact.linked_prospect_id);
    if (contactNeedsResearch(contact)) {
      add(buildRcapTask({
        task_id: rcapTaskId("contact-research", [contact.contact_id]),
        task_type: "RCAP Contact Research",
        title: `Research RCAP contact: ${clean(contact.contact_name) || "Contact"}`,
        linked_account_id: accountKey(account) || contact.linked_account_id,
        linked_contact_id: contact.contact_id,
        segment: contact.segment || account.segment,
        priority_tier: account.priority_tier,
        source_import_id: contact.source_import_id,
        status: "New",
        reason: "Contact route, identity, confidence, or email needs manual verification.",
        safe_action_type: "internal_contact_research"
      }, { now, owner: options.owner }));
    }
    if (canCreateRcapOutreachTask(contact, account)) {
      add(buildRcapTask({
        task_id: rcapTaskId("outreach-approval", [contact.contact_id]),
        task_type: "RCAP Outreach Approval",
        title: `Approve RCAP first touch: ${clean(contact.contact_name)}`,
        linked_account_id: accountKey(account) || contact.linked_account_id,
        linked_contact_id: contact.contact_id,
        segment: contact.segment || account.segment,
        priority_tier: account.priority_tier,
        source_import_id: contact.source_import_id,
        status: "Ready",
        reason: "Safe, non-suppressed decision-relevant contact needs internal approval before any future outreach.",
        safe_action_type: "internal_outreach_approval_review"
      }, { now, owner: options.owner }), contact);
    }
    if (isRcapContactSuppressed(contact)) {
      add(buildRcapTask({
        task_id: rcapTaskId("data-cleanup-suppression", [contact.contact_id]),
        task_type: "RCAP Data Cleanup",
        title: `RCAP Data Cleanup: verify suppression for ${clean(contact.contact_name) || "contact"}`,
        linked_account_id: contact.linked_account_id,
        linked_contact_id: contact.contact_id,
        segment: contact.segment,
        source_import_id: contact.source_import_id,
        status: "New",
        reason: "Suppressed contact — data cleanup only.",
        safe_action_type: "internal_data_cleanup"
      }, { now, owner: options.owner }));
    }
  }

  for (const deal of dealSeeds) {
    const account = findAccount(accounts, deal.linked_account_id);
    const contact = findContact(contacts, deal.linked_contact_id);
    const contactBlocked = deal.linked_contact_id && isRcapContactSuppressed(contact);
    if ((clean(deal.likely_decision_maker) || clean(account.next_action_date) || /engaged/i.test(clean(account.account_status))) && !contactBlocked) {
      add(buildRcapTask({
        task_id: rcapTaskId("follow-up", [deal.deal_seed_id || accountKey(account)]),
        task_type: "RCAP Follow-Up",
        title: `Review RCAP Follow-Up: ${clean(account.organization_name) || clean(deal.likely_decision_maker) || "deal seed"}`,
        linked_account_id: accountKey(account) || deal.linked_account_id,
        linked_contact_id: deal.linked_contact_id,
        linked_deal_seed_id: deal.deal_seed_id,
        segment: account.segment,
        priority_tier: account.priority_tier,
        source_import_id: deal.source_import_id,
        due_date: account.next_action_date,
        status: "New",
        reason: "Deal seed or account movement needs an internal follow-up decision.",
        safe_action_type: "internal_follow_up_review"
      }, { now, owner: options.owner }), contact);
    }
    if (clean(deal.proposed_offer) && clean(deal.funding_source) && !contactBlocked) {
      add(buildRcapTask({
        task_id: rcapTaskId("proposal", [deal.deal_seed_id]),
        task_type: "RCAP Proposal Task",
        title: `Review RCAP proposal seed: ${clean(deal.proposed_offer)}`,
        linked_account_id: accountKey(account) || deal.linked_account_id,
        linked_contact_id: deal.linked_contact_id,
        linked_deal_seed_id: deal.deal_seed_id,
        segment: account.segment,
        priority_tier: account.priority_tier,
        source_import_id: deal.source_import_id,
        due_date: deal.target_close_date,
        status: "New",
        reason: "Proposed offer and funding source are present. Review only; no document creation or sending.",
        safe_action_type: "internal_proposal_review"
      }, { now, owner: options.owner }), contact);
    }
    if (contactBlocked) {
      add(buildRcapTask({
        task_id: rcapTaskId("data-cleanup-suppressed-deal", [deal.deal_seed_id, deal.linked_contact_id]),
        task_type: "RCAP Data Cleanup",
        title: "RCAP Data Cleanup: suppressed contact on deal seed",
        linked_account_id: deal.linked_account_id,
        linked_contact_id: deal.linked_contact_id,
        linked_deal_seed_id: deal.deal_seed_id,
        source_import_id: deal.source_import_id,
        status: "New",
        reason: "Suppressed contact appears on a deal seed. Keep this as cleanup only.",
        safe_action_type: "internal_data_cleanup"
      }, { now, owner: options.owner }));
    }
  }

  for (const batch of batches) {
    for (const warning of list(batch.warnings)) {
      if (!/lacked|fallback|duplicate|suppression|bounced|unsubscribed/i.test(warning)) continue;
      add(buildRcapTask({
        task_id: rcapTaskId("data-cleanup-warning", [batch.import_id, warning]),
        task_type: "RCAP Data Cleanup",
        title: "RCAP Data Cleanup: review import warning",
        source_import_id: batch.import_id,
        status: "New",
        reason: warning,
        safe_action_type: "internal_data_cleanup"
      }, { now, owner: options.owner }));
    }
  }

  const nextBatches = created.length && batches.length
    ? [{ ...batches[0], tasks_created: Number(batches[0].tasks_created || 0) + created.length }, ...batches.slice(1)]
    : batches;
  return {
    state: {
      ...state,
      rcapRevenueQueueTasks: nextTasks,
      rcapRevenueImportBatches: nextBatches
    },
    created,
    summary: rcapRevenueTaskSummary({ ...state, rcapRevenueQueueTasks: nextTasks })
  };
}

export function rcapRevenueFoundationSummary(state = {}) {
  const latest = list(state.rcapRevenueImportBatches)[0] || {};
  const taskSummary = rcapRevenueTaskSummary(state);
  const savedViews = rcapRevenueSavedViews(state).map(view => ({
    key: view.key,
    label: view.label,
    count: view.count,
    filterOnly: true
  }));
  return {
    accounts: list(state.rcapRevenueAccounts).length,
    contacts: list(state.rcapRevenueContacts).length,
    dealSeeds: list(state.rcapRevenueDealSeeds).length,
    queueTasks: taskSummary.total,
    openQueueTasks: taskSummary.open,
    queueTaskGenerationActive: true,
    suppressionLatchActive: true,
    importBatches: list(state.rcapRevenueImportBatches).length,
    latestStatus: latest.status || "not imported",
    tasksCreated: latest.tasks_created || 0,
    internalScoringActive: true,
    scoringSource: "internal_only",
    behavioralScoringDeferred: true,
    savedViews,
    emailSendingEnabled: false,
    calendarWritesEnabled: false,
    externalActionsEnabled: false
  };
}
