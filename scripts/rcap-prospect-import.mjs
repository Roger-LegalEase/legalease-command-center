// RCAP prospect import and identity resolution (Wave 1, Packet 2).
//
// A DRY-RUN PLANNER. Nothing in this module writes. `planRcapProspectImport` reads the
// existing canonical collections, decides what an import would do to each workbook row, and
// returns a report. Applying that plan is a separate, explicitly confirmed step that reuses
// the existing stores -- this file never creates an account, contact, or program record of
// its own, because a second account or contact source of truth is prohibited.
//
// Determinism is a hard requirement: the same rows against the same state must produce a
// byte-identical report, so nothing here reads the clock or a random source. Timestamps
// arrive through `options.now`.
//
// Two rules shape most of the logic:
//
//   1. Never merge on a similar organization name alone. Two legal-aid organizations in
//      different states routinely share a name. A name match without corroborating geography
//      or domain becomes a CONFLICT for a human, never a silent merge.
//   2. Never invent a contact route. An address is used only if the workbook supplies it.
//      There is no firstname.lastname@domain construction anywhere in this file, and the
//      suite asserts its absence.

import { companyContactId, companyOrganizationId } from "./company-memory.mjs";
import {
  RCAP_ACCOUNT_RELATIONS,
  rcapContactEligibility
} from "./rcap-prospect-registries.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value = "") => String(value ?? "").replaceAll(/\s+/g, " ").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

// ---------------------------------------------------------------------------------------------
// Workbook schema (Priority Outreach, columns A-R)
// ---------------------------------------------------------------------------------------------
//
// `keys` are the header spellings accepted for each column. The header row is matched, never
// assumed by position -- the clinic-directory import learned that lesson against a real
// workbook whose producer moved columns between exports.

export const RCAP_WORKBOOK_COLUMNS = Object.freeze([
  Object.freeze({ column: "A", field: "tier", keys: ["tier", "priority tier"] }),
  Object.freeze({ column: "B", field: "state", keys: ["state"] }),
  Object.freeze({ column: "C", field: "region", keys: ["region / metro", "region", "metro", "region/metro"] }),
  Object.freeze({ column: "D", field: "organization", keys: ["organization", "organisation", "org"], required: true }),
  Object.freeze({ column: "E", field: "program", keys: ["program / clinic", "program", "clinic", "program/clinic"] }),
  Object.freeze({ column: "F", field: "clinicVerification", keys: ["clinic verification", "verification"] }),
  Object.freeze({ column: "G", field: "cadence", keys: ["cadence / most recent", "cadence", "most recent"] }),
  Object.freeze({ column: "H", field: "keyContact", keys: ["key contact", "contact", "contact name"] }),
  Object.freeze({ column: "I", field: "contactRole", keys: ["contact role", "role", "title"] }),
  Object.freeze({ column: "J", field: "publicEmail", keys: ["public email", "email"] }),
  Object.freeze({ column: "K", field: "phone", keys: ["phone", "telephone"] }),
  Object.freeze({ column: "L", field: "whyItMatters", keys: ["why it matters", "why"] }),
  Object.freeze({ column: "M", field: "partnershipAngle", keys: ["recommended partnership angle", "partnership angle", "angle"] }),
  Object.freeze({ column: "N", field: "website", keys: ["website", "url", "site"] }),
  Object.freeze({ column: "O", field: "evidenceSource", keys: ["evidence source", "source"] }),
  Object.freeze({ column: "P", field: "confidence", keys: ["confidence"] }),
  Object.freeze({ column: "Q", field: "lastVerified", keys: ["last verified", "verified"] }),
  Object.freeze({ column: "R", field: "notes", keys: ["notes", "note", "research profile", "google doc"] })
]);

const COLUMN_BY_FIELD = new Map(RCAP_WORKBOOK_COLUMNS.map((entry) => [entry.field, entry]));

const headerKey = (value = "") => lower(value).replaceAll(/[^a-z0-9]+/g, " ").trim();

// Maps a raw row object (header -> cell) onto the canonical field names above. Unknown headers
// are ignored rather than guessed at.
export function mapRcapWorkbookRow(rawRow = {}) {
  const byHeader = new Map(Object.entries(rawRow || {}).map(([key, value]) => [headerKey(key), value]));
  const mapped = {};
  for (const column of RCAP_WORKBOOK_COLUMNS) {
    let found = "";
    for (const key of column.keys) {
      const candidate = byHeader.get(headerKey(key));
      if (candidate !== undefined && candidate !== null && clean(candidate)) { found = clean(candidate); break; }
    }
    mapped[column.field] = found;
  }
  return mapped;
}

// ---------------------------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------------------------

export function normalizeDomain(value = "") {
  const text = lower(value).replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  const host = text.split(/[/?#]/)[0].replace(/:\d+$/, "");
  if (!host || !host.includes(".") || /\s/.test(host)) return "";
  if (!/^[a-z0-9.-]+$/.test(host)) return "";
  return host;
}

// Deliberately conservative: enough to reject junk, never enough to "repair" an address.
const EMAIL_PATTERN = /^[^\s@,;<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function normalizeEmailValue(value = "") {
  const text = lower(value);
  if (!text || !EMAIL_PATTERN.test(text)) return "";
  return text;
}

// A shared organizational route -- real, usable, but not a named person. It must be visible as
// such on the row, because approving a named contact and approving a general inbox are
// different decisions.
const SHARED_INBOX_LOCALS = new Set([
  "info", "contact", "contactus", "hello", "admin", "office", "general", "mail", "email",
  "inquiries", "enquiries", "team", "staff", "reception", "frontdesk", "communications", "press", "media"
]);

// Rule 7: a client-intake route is never a sales route, however valid the address is.
const CLIENT_INTAKE_LOCALS = new Set([
  "intake", "apply", "application", "applications", "help", "helpline", "clinic", "clinics",
  "casework", "cases", "client", "clients", "services", "referral", "referrals", "support", "assistance", "legalaid"
]);

export function classifyEmailAddress(value = "") {
  const email = normalizeEmailValue(value);
  if (!email) return Object.freeze({ email: "", eligibility: "unavailable", addressType: "none" });
  const local = email.split("@")[0].replaceAll(/[._-]/g, "");
  if (CLIENT_INTAKE_LOCALS.has(local)) {
    return Object.freeze({ email, eligibility: "client_intake", addressType: "client_intake" });
  }
  if (SHARED_INBOX_LOCALS.has(local)) {
    return Object.freeze({ email, eligibility: "shared_public_business", addressType: "shared_inbox" });
  }
  return Object.freeze({ email, eligibility: "direct_public_business", addressType: "named_route" });
}

export function normalizePhoneValue(value = "") {
  const digits = clean(value).replaceAll(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : "";
}

// Phone classification uses the surrounding row, not the number: the digits never say whether
// a line is an intake line. Anything not positively identified stays `unknown`, which is not a
// sales route.
export function classifyPhone(row = {}) {
  const phone = normalizePhoneValue(row.phone);
  if (!phone) return Object.freeze({ phone: "", phoneClass: "not_available" });
  const context = lower([row.contactRole, row.program, row.notes, row.keyContact].join(" "));
  if (/intake|apply|application|hotline|help ?line|screening|eligibility/.test(context)) {
    return Object.freeze({ phone, phoneClass: "client_intake" });
  }
  if (/main|switchboard|reception|front desk|general/.test(context)) {
    return Object.freeze({ phone, phoneClass: "main_switchboard" });
  }
  // A named person with a stated role is the only case that yields a business route.
  if (clean(row.keyContact) && clean(row.contactRole)) {
    return Object.freeze({ phone, phoneClass: "business_route" });
  }
  return Object.freeze({ phone, phoneClass: "unknown" });
}

// Organization-name normalization for comparison ONLY. Legal suffixes and articles are folded
// away so "The Detroit Justice Center, Inc." and "Detroit Justice Center" compare equal -- but
// a comparison equal is never by itself a merge.
const NAME_NOISE = /\b(inc|incorporated|llc|llp|lp|pc|pllc|corp|corporation|co|company|foundation|fund|the|of|and|a|an)\b/g;

export function normalizeOrganizationName(value = "") {
  const text = lower(value).replaceAll(/[^a-z0-9\s]/g, " ").replaceAll(NAME_NOISE, " ");
  return text.replaceAll(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------
// Program role
// ---------------------------------------------------------------------------------------------
//
// An organization may promote a clinic it does not operate; a host is not a legal-services
// operator. The import must preserve the distinction rather than flattening every row to
// "runs a clinic".

const RELATION_KEYS = new Set(RCAP_ACCOUNT_RELATIONS.map((entry) => entry.key));

export function classifyProgramRole(row = {}) {
  const text = lower([row.program, row.clinicVerification, row.whyItMatters, row.evidenceSource].join(" "));

  // Order is the whole point. A row routinely describes TWO organizations -- "the alliance
  // promotes the event; a partner legal aid provides the attorneys" -- and only the first
  // clause is about the organization on this row. Testing the promoter and host signals first
  // stops a partner's legal work from being read as this organization's, which is precisely the
  // operator/host/promoter flattening the import must not do.
  if (/\bpromot|publiciz|publicis|advertis|shares the clinic|refers\b/.test(text)) return "promoter";
  if (/\bhosts?\b|venue|site partner|hosted at\b/.test(text)) return "host";

  // Self-attributed operation only. "provides the attorneys" is deliberately NOT here: in this
  // workbook it is far more often said of a partner than of the subject.
  if (/\boperates?\b|\boperating\b|runs the clinic|staffs it|its own attorneys|own legal staff|legal services provider\b/.test(text)) return "operator";

  if (/\bfunds?\b|funder|grant|sponsor/.test(text)) return "funder";
  if (/\bcoalition|collaborative|alliance|network member\b/.test(text)) return "coalition";
  if (/\blegal aid|pro bono|attorney|counsel|law\b/.test(text)) return "legal_provider";
  return "";
}

// ---------------------------------------------------------------------------------------------
// Existing-record index
// ---------------------------------------------------------------------------------------------
//
// Built from the canonical collections the Wave 0 audit identified. This is a READ index; it
// exists so matching can be deterministic and cheap, and it is discarded after planning.

export const RCAP_IMPORT_READ_COLLECTIONS = Object.freeze([
  "rcapRevenueAccounts",
  "rcapRevenueContacts",
  "companyOrganizations",
  "companyContacts",
  "outreachOrganizations",
  "outreachContacts",
  "clinicNamedContacts",
  "partners"
]);

function accountRecords(state = {}) {
  const out = [];
  for (const account of list(state.rcapRevenueAccounts)) {
    out.push({
      id: clean(account.account_id) || clean(account.id),
      source: "rcapRevenueAccounts",
      name: clean(account.organization_name),
      domain: normalizeDomain(account.website || account.domain || ""),
      geography: clean(account.service_area || account.state || ""),
      sourceProspectId: clean(account.source_prospect_id),
      aliases: list(account.aliases).map(clean).filter(Boolean),
      parentId: clean(account.parent_account_id)
    });
  }
  for (const org of list(state.companyOrganizations)) {
    out.push({
      id: clean(org.companyOrganizationId) || clean(org.id),
      source: "companyOrganizations",
      name: clean(org.name),
      domain: normalizeDomain(org.domain || org.website || ""),
      geography: clean(org.geography || org.state || ""),
      sourceProspectId: "",
      aliases: list(org.aliases).map(clean).filter(Boolean),
      parentId: clean(org.parentOrganizationId)
    });
  }
  for (const partner of list(state.partners)) {
    out.push({
      id: clean(partner.id),
      source: "partners",
      name: clean(partner.name || partner.organization),
      domain: normalizeDomain(partner.website || partner.domain || ""),
      geography: clean(partner.geography || partner.state || ""),
      sourceProspectId: "",
      aliases: list(partner.aliases).map(clean).filter(Boolean),
      parentId: ""
    });
  }
  for (const org of list(state.outreachOrganizations)) {
    out.push({
      id: clean(org.id),
      source: "outreachOrganizations",
      name: clean(org.name),
      domain: normalizeDomain(org.domain || org.website || ""),
      geography: clean(org.geography || org.state || ""),
      sourceProspectId: "",
      aliases: list(org.aliases).map(clean).filter(Boolean),
      parentId: ""
    });
  }
  return out.filter((record) => record.id && record.name);
}

function contactRecords(state = {}) {
  const out = [];
  const push = (source, id, name, email, accountId) => {
    const normalized = normalizeEmailValue(email);
    if (!id) return;
    out.push({ source, id: clean(id), name: clean(name), email: normalized, accountId: clean(accountId) });
  };
  for (const contact of list(state.rcapRevenueContacts)) {
    push("rcapRevenueContacts", contact.contact_id || contact.id, contact.contact_name || contact.name, contact.email, contact.account_id);
  }
  for (const contact of list(state.companyContacts)) {
    push("companyContacts", contact.companyContactId || contact.id, contact.name, contact.email, contact.companyOrganizationId);
  }
  for (const contact of list(state.outreachContacts)) {
    push("outreachContacts", contact.id, contact.name, contact.email, contact.organizationId);
  }
  for (const contact of list(state.clinicNamedContacts)) {
    push("clinicNamedContacts", contact.id, contact.contact_name || contact.name, contact.email, contact.organization_id);
  }
  return out;
}

export function buildRcapImportIndex(state = {}) {
  const accounts = accountRecords(state);
  const contacts = contactRecords(state);
  const byDomain = new Map();
  const byNormalizedName = new Map();
  const bySourceProspectId = new Map();
  const byAlias = new Map();
  const byEmail = new Map();
  const domainsWithHistory = new Set();

  for (const account of accounts) {
    if (account.domain && !byDomain.has(account.domain)) byDomain.set(account.domain, account);
    const normalizedName = normalizeOrganizationName(account.name);
    if (normalizedName) {
      if (!byNormalizedName.has(normalizedName)) byNormalizedName.set(normalizedName, []);
      byNormalizedName.get(normalizedName).push(account);
    }
    if (account.sourceProspectId && !bySourceProspectId.has(account.sourceProspectId)) {
      bySourceProspectId.set(account.sourceProspectId, account);
    }
    for (const alias of account.aliases) {
      const normalizedAlias = normalizeOrganizationName(alias);
      if (normalizedAlias && !byAlias.has(normalizedAlias)) byAlias.set(normalizedAlias, account);
    }
  }
  for (const contact of contacts) {
    if (contact.email && !byEmail.has(contact.email)) byEmail.set(contact.email, contact);
    // An existing contact at a domain is evidence of an existing relationship, which changes a
    // cold introduction into thread-aware follow-up.
    if (contact.email && contact.source === "companyContacts") domainsWithHistory.add(contact.email.split("@")[1]);
  }
  return Object.freeze({ accounts, contacts, byDomain, byNormalizedName, bySourceProspectId, byAlias, byEmail, domainsWithHistory });
}

// ---------------------------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------------------------
//
// Ordered, deterministic, and explicit about WHY. Each outcome carries the reason and a
// confidence so the report can be reviewed rather than trusted.

export function resolveRcapIdentity(row = {}, index, options = {}) {
  const sourceProspectId = clean(row.sourceProspectId || row.prospectId);
  const domain = normalizeDomain(row.website);
  const normalizedName = normalizeOrganizationName(row.organization);
  const geography = lower(row.state);

  // 1. An existing stable source ID is definitive.
  if (sourceProspectId && index.bySourceProspectId.has(sourceProspectId)) {
    return { match: index.bySourceProspectId.get(sourceProspectId), reason: "stable_source_id", confidence: 1, humanReviewRequired: false };
  }

  // 2. Canonical website domain.
  if (domain && index.byDomain.has(domain)) {
    return { match: index.byDomain.get(domain), reason: "website_domain", confidence: 0.95, humanReviewRequired: false };
  }

  // 3. Normalized name PLUS geography. Name alone is never enough (rule 1 of this module).
  const nameMatches = index.byNormalizedName.get(normalizedName) || [];
  if (normalizedName && nameMatches.length) {
    const geographyMatches = geography
      ? nameMatches.filter((candidate) => lower(candidate.geography) && lower(candidate.geography).includes(geography))
      : [];
    if (geographyMatches.length === 1) {
      return { match: geographyMatches[0], reason: "name_and_geography", confidence: 0.85, humanReviewRequired: false };
    }
    if (geographyMatches.length > 1) {
      return { match: null, reason: "ambiguous_name_and_geography", confidence: 0.4, humanReviewRequired: true, candidates: geographyMatches };
    }
    // Same name, no corroborating geography: two organizations may legitimately share a name
    // in different states. A human decides.
    return { match: null, reason: "name_only_needs_decision", confidence: 0.4, humanReviewRequired: true, candidates: nameMatches };
  }

  // 4. A known alias on an existing account.
  if (normalizedName && index.byAlias.has(normalizedName)) {
    return { match: index.byAlias.get(normalizedName), reason: "known_alias", confidence: 0.85, humanReviewRequired: false };
  }

  // 5. An existing contact at this exact address implies the account already exists.
  const email = normalizeEmailValue(row.publicEmail);
  if (email && index.byEmail.has(email)) {
    const contact = index.byEmail.get(email);
    const owner = index.accounts.find((account) => account.id === contact.accountId) || null;
    if (owner) {
      return { match: owner, reason: "existing_contact_identity", confidence: 0.8, humanReviewRequired: false };
    }
  }

  // 6. Existing correspondence with the domain: not an account match, but it must be surfaced,
  // because it changes the outreach motion.
  if (domain && index.domainsWithHistory.has(domain)) {
    return { match: null, reason: "existing_relationship_at_domain", confidence: 0.5, humanReviewRequired: true, candidates: [] };
  }

  return { match: null, reason: "no_match", confidence: 0, humanReviewRequired: false, candidates: [] };
}

// ---------------------------------------------------------------------------------------------
// Row planning
// ---------------------------------------------------------------------------------------------

export const RCAP_IMPORT_ACTIONS = Object.freeze([
  "create_account", "update_account", "add_program", "add_contact", "conflict", "skip_duplicate", "invalid_row"
]);

function planRow(mapped, index, context) {
  const warnings = [];
  const rowNumber = context.rowNumber;
  const organization = clean(mapped.organization);

  if (!organization) {
    return {
      sourceRow: rowNumber,
      organization: "",
      action: "invalid_row",
      matchResult: "missing_required_identity",
      matchConfidence: 0,
      matchedAccountId: "",
      matchReason: "missing_organization",
      programAction: "none",
      contactAction: "none",
      sourceAction: "none",
      profileDocAction: "none",
      warnings: ["The row has no organization name, which is the minimum identity an account needs."],
      humanDecisionRequired: true
    };
  }

  const identity = resolveRcapIdentity(mapped, index, context);
  const programRole = classifyProgramRole(mapped);
  const emailInfo = classifyEmailAddress(mapped.publicEmail);
  const phoneInfo = classifyPhone(mapped);
  const domain = normalizeDomain(mapped.website);

  // Contact handling. An address is used only if the workbook supplied a valid one; nothing is
  // ever constructed from a person's name and a domain.
  let contactAction = "none";
  if (clean(mapped.publicEmail) && !emailInfo.email) {
    contactAction = "none";
    warnings.push("The email value could not be read as a valid address, so no contact is proposed.");
  } else if (emailInfo.email) {
    const existing = index.byEmail.get(emailInfo.email);
    contactAction = existing ? "reuse_existing_contact" : "add_contact";
    if (emailInfo.addressType === "shared_inbox") {
      warnings.push("The only address is a shared organizational inbox, not a named person.");
    }
    if (emailInfo.addressType === "client_intake") {
      warnings.push("The address is a client-intake route and is not usable for outreach.");
    }
  } else if (clean(mapped.keyContact)) {
    warnings.push("A named contact is listed with no address; no address may be constructed for them.");
  }

  if (phoneInfo.phoneClass === "client_intake") {
    warnings.push("The phone number is a client-intake line and is not a sales route.");
  }
  if (clean(mapped.phone) && !phoneInfo.phone) {
    warnings.push("The phone value could not be read as a valid number.");
  }

  const programAction = clean(mapped.program) ? (identity.match ? "add_program_to_existing_account" : "create_program_with_account") : "none";
  if (clean(mapped.program) && !programRole) {
    warnings.push("The organization's role in the program is unclear; operator, host, and promoter must not be assumed.");
  }

  // Column R is a research-profile REFERENCE. It is never treated as the canonical profile --
  // that is Wave 2's job, and it requires Drive access this session does not have.
  const profileDocAction = /https?:\/\//i.test(clean(mapped.notes)) ? "record_reference_only" : "none";
  const sourceAction = clean(mapped.evidenceSource) || domain ? "record_source" : "none";

  if (identity.humanReviewRequired) {
    const candidateNames = list(identity.candidates).map((candidate) => `${candidate.name} (${candidate.source})`);
    if (identity.reason === "existing_relationship_at_domain") {
      warnings.push("There is existing correspondence with this domain, so this is not a cold introduction.");
    } else {
      warnings.push(
        candidateNames.length
          ? `An existing organization has the same name: ${candidateNames.join(", ")}. Names alone are not proof of the same organization.`
          : "This row needs a human identity decision."
      );
    }
    return {
      sourceRow: rowNumber,
      organization,
      action: "conflict",
      matchResult: identity.reason,
      matchConfidence: identity.confidence,
      matchedAccountId: "",
      matchReason: identity.reason,
      programAction,
      contactAction,
      sourceAction,
      profileDocAction,
      warnings,
      humanDecisionRequired: true
    };
  }

  if (identity.match) {
    // "Unchanged" is decided by whether there is anything to do, not by which rule matched.
    // A row that adds no program, no contact, and no differing field is a genuine no-op
    // however it was identified -- re-importing the same file twice must not churn accounts.
    const updates = proposedUpdatesFor(identity.match, mapped, domain);
    const unchanged = !clean(mapped.program) && contactAction !== "add_contact" && !updates.length;
    return {
      sourceRow: rowNumber,
      organization,
      action: unchanged ? "skip_duplicate" : (contactAction === "add_contact" ? "add_contact" : (programAction !== "none" ? "add_program" : "update_account")),
      matchResult: "matched_existing_account",
      matchConfidence: identity.confidence,
      matchedAccountId: identity.match.id,
      matchReason: identity.reason,
      programAction,
      contactAction,
      sourceAction,
      profileDocAction,
      warnings,
      humanDecisionRequired: false,
      // An existing account's canonical values are never overwritten by an import; a differing
      // value is proposed for review instead.
      proposedUpdates: updates
    };
  }

  return {
    sourceRow: rowNumber,
    organization,
    action: "create_account",
    matchResult: "no_existing_match",
    matchConfidence: identity.confidence,
    matchedAccountId: "",
    matchReason: identity.reason,
    programAction,
    contactAction,
    sourceAction,
    profileDocAction,
    warnings,
    humanDecisionRequired: false,
    proposedAccount: Object.freeze({
      // A proposed identity only. The ID is derived, not allocated, so a dry run allocates nothing.
      proposedOrganizationId: companyOrganizationId(organization, domain),
      name: organization,
      domain,
      geography: clean(mapped.state),
      region: clean(mapped.region),
      programRole
    }),
    proposedContact: emailInfo.email
      ? Object.freeze({
        proposedContactId: companyContactId(emailInfo.email),
        name: clean(mapped.keyContact),
        title: clean(mapped.contactRole),
        email: emailInfo.email,
        eligibility: emailInfo.eligibility,
        addressType: emailInfo.addressType
      })
      : null
  };
}

// Never overwrite silently: report what differs and let a human decide.
function proposedUpdatesFor(match, mapped, domain) {
  const updates = [];
  if (domain && match.domain && domain !== match.domain) {
    updates.push({ field: "domain", currentValue: match.domain, proposedValue: domain, requiresReview: true });
  }
  if (domain && !match.domain) {
    updates.push({ field: "domain", currentValue: "", proposedValue: domain, requiresReview: false });
  }
  const geography = clean(mapped.state);
  if (geography && !clean(match.geography)) {
    updates.push({ field: "geography", currentValue: "", proposedValue: geography, requiresReview: false });
  }
  return Object.freeze(updates);
}

// ---------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------

export function planRcapProspectImport(state = {}, rawRows = [], options = {}) {
  const rows = list(rawRows);
  const index = buildRcapImportIndex(state);
  const workbookName = clean(options.workbookName) || "fixture";
  const planned = [];

  // Within-batch duplicates matter as much as duplicates against stored state: two rows for the
  // same organization in one file must not silently become two accounts.
  const seenInBatch = new Map();

  rows.forEach((rawRow, position) => {
    const mapped = mapRcapWorkbookRow(rawRow);
    const rowNumber = Number(rawRow?.__rowNumber) || position + 2;
    const decision = planRow(mapped, index, { rowNumber, workbookName });

    if (decision.action === "create_account") {
      const key = decision.proposedAccount?.domain || normalizeOrganizationName(decision.organization);
      const previous = seenInBatch.get(key);
      if (key && previous) {
        decision.action = "conflict";
        decision.matchResult = "duplicate_within_batch";
        decision.matchReason = "duplicate_within_batch";
        decision.humanDecisionRequired = true;
        decision.warnings = [...decision.warnings, `Row ${previous} in this file already proposes the same organization.`];
      } else if (key) {
        seenInBatch.set(key, rowNumber);
      }
    }
    planned.push(Object.freeze(decision));
  });

  const count = (predicate) => planned.filter(predicate).length;
  const warningCount = (fragment) => planned.filter((row) => row.warnings.some((warning) => warning.includes(fragment))).length;

  return Object.freeze({
    workbookName,
    dryRun: true,
    // Wave 1 has no path from this planner to a production write. Asserted by the suite.
    writesPerformed: 0,
    externalActions: 0,
    totals: Object.freeze({
      totalRows: planned.length,
      validRows: count((row) => row.action !== "invalid_row"),
      matchedAccounts: count((row) => Boolean(row.matchedAccountId)),
      proposedNewAccounts: count((row) => row.action === "create_account"),
      matchedContacts: count((row) => row.contactAction === "reuse_existing_contact"),
      proposedNewContacts: count((row) => row.contactAction === "add_contact"),
      proposedProgramRecords: count((row) => row.programAction !== "none"),
      proposedRelationships: count((row) => Boolean(row.proposedAccount?.programRole)),
      proposedUpdates: count((row) => list(row.proposedUpdates).length > 0),
      conflicts: count((row) => row.action === "conflict"),
      skippedRows: count((row) => row.action === "skip_duplicate"),
      invalidEmails: warningCount("could not be read as a valid address"),
      sharedInboxes: warningCount("shared organizational inbox"),
      clientIntakePhoneWarnings: warningCount("client-intake line"),
      missingRequiredIdentity: count((row) => row.matchResult === "missing_required_identity"),
      sourceRowsRetained: planned.length
    }),
    rows: Object.freeze(planned),
    // One audit event per planned decision, ready for the existing audit contract to record when
    // (and only when) a human confirms the plan.
    auditEvents: Object.freeze(planned.map((row) => Object.freeze({
      kind: "rcap_prospect_import_planned",
      workbookName,
      sourceRow: row.sourceRow,
      organization: row.organization,
      action: row.action,
      matchReason: row.matchReason,
      matchConfidence: row.matchConfidence,
      humanDecisionRequired: row.humanDecisionRequired,
      occurredAt: clean(options.now) || ""
    })))
  });
}

// The report columns the master plan requires, in order, as a stable text table for review.
export const RCAP_IMPORT_REPORT_COLUMNS = Object.freeze([
  "source_row", "organization", "proposed_account_id", "match_result", "match_confidence",
  "program_action", "contact_action", "source_action", "profile_doc_action", "warnings", "human_decision_required"
]);

export function formatRcapImportReport(plan = {}) {
  const rows = list(plan.rows).map((row) => [
    String(row.sourceRow),
    row.organization,
    row.matchedAccountId || row.proposedAccount?.proposedOrganizationId || "",
    row.matchResult,
    row.matchConfidence.toFixed(2),
    row.programAction,
    row.contactAction,
    row.sourceAction,
    row.profileDocAction,
    row.warnings.join(" | "),
    row.humanDecisionRequired ? "yes" : "no"
  ]);
  return [RCAP_IMPORT_REPORT_COLUMNS.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
}

export { COLUMN_BY_FIELD, RELATION_KEYS };
