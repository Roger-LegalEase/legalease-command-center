// The national expungement / record-clearance clinic directory import (2026-07-28).
//
// 249 organisations and 99 named people, arriving as a pending review queue — NOT as an
// audience. Four things this file is careful about.
//
// 1. NOTHING BECOMES CONTACTABLE. The import writes exactly two kinds of record: prospect
//    candidates at review_state "pending_review", and person-level reference rows. It never
//    writes an outreachContact, never enrols anything, and never sets "approved" (the human
//    /api/prospects/approve endpoint remains the only place that word is written). An
//    organisation with a perfect address is exactly as un-sendable after this import as the
//    fourteen with no address at all.
//
// 2. THE HEADER ROW IS FOUND, NEVER ASSUMED. Every sheet in this workbook opens with a title
//    and a description before the real column names, and the offset is a property of the
//    producer, not a constant — the next workbook may differ. detectHeaderRow() finds the
//    first row whose cells actually read like column names AND carries the columns this
//    import depends on, and throws a message naming the sheet and the missing columns when it
//    cannot. A silently mis-detected header would read "Public Email" out of the Phone column.
//
// 3. IDENTITY IS NEVER GUESSED. Three separate merge decisions are made here, and each one
//    refuses rather than guesses when it is not certain:
//      * org row -> org row (within the file): keyed on state + organisation + programme, so
//        two clinics at one institution stay two rows. Same-name-different-state pairs
//        (Community Legal Services AZ/FL) are FLAGGED, never merged.
//      * named person -> organisation: exact state + organisation-name match only. A person
//        whose organisation name matches nothing, or matches more than one row, is imported
//        UNATTACHED and reported. No prefix or fuzzy matching: "Warfield Lodge No. 44" is not
//        automatically the same organisation as "Warfield Lodge No. 44 and NAACP community
//        partnership", and a human decides that.
//      * candidate -> production: enriches an existing pending candidate ONLY when exactly one
//        production row matches on both normalised name and state. Anything else imports as a
//        new row carrying possible_prod_match ids for review.
//
// 4. EVERY ADDRESS CARRIES ITS PROVENANCE. email_type, email_source, email_research_status,
//    email_confidence and email_verified_at travel with the address, so any address on any
//    record can be traced back to the page it came from.
//
// Email Type is a first-class, filterable field because it decides HOW an organisation may be
// approached: a named staff address and a general info@ inbox are not the same permission.
// email_type keeps the workbook's exact label (16 of them); email_type_group buckets those
// labels so "approve the named people, leave the general inboxes" is one filter, not sixteen.

import crypto from "node:crypto";

import { normalizeClassification } from "./outreach-classifications.mjs";
import { readWorkbook } from "./press-workbook.mjs";
import { normalizeName, prospectKeys, PROSPECT_REVIEW, scoreCandidate } from "./prospect-discovery.mjs";

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const list = (value) => (Array.isArray(value) ? value : []);
const uniq = (values) => [...new Set(list(values).filter(Boolean))];

export const CLINIC_DIRECTORY_SOURCE = "clinic_directory_2026";
export const CLINIC_NAMED_CONTACTS_COLLECTION = "clinicNamedContacts";

// Sheet names in this workbook. The directory sheet is OPTIONAL — it supplies Organization
// Type only, so a workbook without it imports with that one field empty rather than failing.
export const CLINIC_SHEETS = Object.freeze({
  enrichment: "Email Enrichment",
  named: "Named Email Contacts",
  directory: "National Directory"
});

// The columns each sheet must actually carry. These are the import's contract with the
// workbook: if a producer renames one, the import stops instead of writing blank fields.
export const REQUIRED_ENRICHMENT_COLUMNS = Object.freeze([
  "State", "Organization", "Program / Clinic", "Tier", "Clinic Verification",
  "Public Email", "Email Contact Name", "Email Contact Role", "Email Type",
  "Alternate Email(s)", "Email Source"
]);
export const REQUIRED_NAMED_COLUMNS = Object.freeze([
  "State", "Person", "Organization", "Public Email"
]);

// ---------------------------------------------------------------------------------------------
// 1. HEADER DETECTION — the position is discovered, never hardcoded.
// ---------------------------------------------------------------------------------------------

// A cell reads like a column name if it is short, has letters, is not a number, and does not
// end like a sentence. "Public Email" qualifies; "249 organizations across all 50 states + D.C.,
// enriched with verified public contact routes." does not, and neither does 46231.
function looksLikeHeaderCell(value = "") {
  const text = clean(value);
  if (!text || text.length > 60) return false;
  if (/^-?[\d.,]+$/.test(text)) return false;
  if (/[.!?]$/.test(text)) return false;
  return /[A-Za-z]/.test(text);
}

// A row reads like a header row if it holds several column-name-shaped cells, nearly all of its
// filled cells are that shape, and no label repeats. The title and description rows fail on cell
// count; a data row would pass the shape test, which is why the FIRST qualifying row wins and
// why required columns are checked on top.
function looksLikeHeaderRow(row = []) {
  const filled = list(row).map(clean).filter(Boolean);
  if (filled.length < 4) return false;
  const namey = filled.filter(looksLikeHeaderCell);
  if (namey.length < 4) return false;
  if (namey.length / filled.length < 0.8) return false;
  return new Set(namey.map(lower)).size === namey.length;
}

// A header row is normally followed by data. This is the tie-breaker that keeps a run of short
// prose fragments near the bottom of a sheet from being read as headers — but it is only a
// tie-breaker: a sheet whose data rows are all empty still has a real header row, and when the
// required columns are present that is proof enough on its own.
function isFollowedByData(row = [], next = []) {
  const filled = list(row).map(clean).filter(Boolean);
  const following = list(next).map(clean).filter(Boolean);
  return following.length >= Math.max(2, Math.floor(filled.length * 0.5));
}

/**
 * Finds the 0-based index of a sheet's header row. Throws — loudly, naming the sheet, what it
 * found and what was missing — rather than returning a guess.
 */
export function detectHeaderRow(rows = [], options = {}) {
  const { sheetName = "sheet", requiredColumns = [], searchRows = 25 } = options;
  const shaped = [];
  const withData = [];
  for (let index = 0; index < Math.min(list(rows).length, searchRows); index += 1) {
    if (!looksLikeHeaderRow(rows[index])) continue;
    shaped.push(index);
    if (isFollowedByData(rows[index], rows[index + 1])) withData.push(index);
  }
  const wanted = list(requiredColumns).map(lower);
  const carriesColumns = (index) => {
    const have = new Set(list(rows[index]).map(lower));
    return wanted.every((column) => have.has(column));
  };

  // Preferred: the first header-shaped row that is followed by data AND carries the columns this
  // import reads. Then the same test without the followed-by-data tie-breaker, which is what an
  // otherwise-valid sheet with no data rows falls back to.
  for (const index of withData) if (carriesColumns(index)) return index;
  if (wanted.length) {
    for (const index of shaped) if (carriesColumns(index)) return index;
  } else if (withData.length) {
    return withData[0];
  }

  if (!shaped.length) {
    throw new Error(
      `Clinic directory import: no header row found in sheet "${sheetName}" within its first ${searchRows} rows. ` +
      "A header row is one whose cells read like column names. Nothing was imported."
    );
  }
  if (!wanted.length) return shaped[0];

  // A header-shaped row exists but none carries the columns this import reads. Name both, so
  // the failure says which column was renamed rather than "import failed".
  const best = shaped[0];
  const have = new Set(list(rows[best]).map(lower));
  const missing = list(requiredColumns).filter((column) => !have.has(lower(column)));
  throw new Error(
    `Clinic directory import: sheet "${sheetName}" has no header row carrying the required column(s): ` +
    `${missing.join(", ")}. The closest header-shaped row is row ${best + 1}, reading: ` +
    `${list(rows[best]).map(clean).filter(Boolean).join(" | ")}. Nothing was imported.`
  );
}

/** Rows of a sheet as objects keyed by its DETECTED header row. */
export function sheetRecords(rows = [], options = {}) {
  const headerIndex = detectHeaderRow(rows, options);
  const headers = list(rows[headerIndex]).map(clean);
  const records = list(rows).slice(headerIndex + 1).map((row) => {
    const record = {};
    headers.forEach((header, column) => {
      if (header) record[header] = clean(list(row)[column]);
    });
    return record;
  }).filter((record) => Object.values(record).some(Boolean));
  return { headerIndex, headers: headers.filter(Boolean), records };
}

export function readClinicWorkbook(buffer) {
  return readWorkbook(buffer);
}

// ---------------------------------------------------------------------------------------------
// 2. FIELD NORMALISATION
// ---------------------------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A usable address, or "" — the same test the report's "235 of 249" count is made of. */
export function validEmail(value = "") {
  const text = lower(value);
  return EMAIL_PATTERN.test(text) ? text : "";
}

/** Every address in a cell that may hold several, separated by ; , / or whitespace. */
export function splitEmails(value = "") {
  return uniq(clean(value).split(/[;,\s/]+/).map(validEmail));
}

const US_STATES = Object.freeze({
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "puerto rico": "PR", guam: "GU", "virgin islands": "VI", "american samoa": "AS",
  "northern mariana islands": "MP"
});

/**
 * The 2-letter code for a state name, or "" for national/unknown. Production candidates carry
 * codes and this workbook carries names, so the two only compare through here — and a value
 * that resolves to "" NEVER matches a production row (an unknown state is not a match).
 */
export function stateCode(value = "") {
  const text = lower(value).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (US_STATES[text]) return US_STATES[text];
  if (/^[a-z]{2}$/.test(text)) return text.toUpperCase();
  // "Hawaiʻi", "Statewide / virtual" and similar: try the first word, then give up.
  const first = text.split(" ")[0];
  return US_STATES[first] || "";
}

// Excel serial date -> ISO day. The workbook stores Last Verified / Verified Date as serials
// (46231 = 2026-07-28); leaving them as "46231" would make provenance unreadable.
export function excelDate(value = "") {
  const text = clean(value);
  if (!/^\d{5}$/.test(text)) return text ? text : "";
  const serial = Number(text);
  if (!Number.isFinite(serial)) return "";
  return new Date(Date.UTC(1899, 11, 30) + (serial * 86400000)).toISOString().slice(0, 10);
}

// Email Type buckets. The workbook uses 16 distinct labels; these five groups are what an
// approval decision actually turns on. Order matters — "Named partner staff email" is a named
// person before it is a partnership address.
const EMAIL_TYPE_GROUP_RULES = Object.freeze([
  ["named_person", /named .*(staff|email)|named organization email/i],
  ["media_inbox", /communications|media|press/i],
  ["partnership_inbox", /partnership|partner program|development|coalition|foundation/i],
  ["program_inbox", /program|clinic|community outreach/i],
  ["administrative_inbox", /administrative|office|website/i],
  ["organization_inbox", /general|organization inbox|public contact|info/i]
]);

export const EMAIL_TYPE_GROUPS = Object.freeze([
  "named_person", "program_inbox", "organization_inbox",
  "media_inbox", "partnership_inbox", "administrative_inbox", "none"
]);

/** The approval-relevant bucket for a workbook Email Type label. "none" when there is none. */
export function emailTypeGroup(label = "") {
  const text = clean(label);
  if (!text) return "none";
  for (const [group, pattern] of EMAIL_TYPE_GROUP_RULES) {
    if (pattern.test(text)) return group;
  }
  return "organization_inbox";
}

// Organization Type is free text (89 distinct labels across 249 rows), so it is stored verbatim
// AND mapped to the outreach vocabulary, which is a closed set the sequences key off. The map
// is a default only: an existing production candidate keeps the classification it already has.
const ORGANIZATION_TYPE_RULES = Object.freeze([
  ["public_defender", /public defender|defender/i],
  ["legal_aid", /legal aid|legal services|legal-aid/i],
  ["clinic", /law school|clinic|pro bono|bar association|bar \/|bar and|student practice/i],
  ["government", /government|municipal|prosecutor|attorney general|court|library|state agency|workforce/i],
  ["county_reentry", /reentry|re-entry/i]
]);

export function classificationForOrganizationType(label = "") {
  const text = clean(label);
  for (const [classification, pattern] of ORGANIZATION_TYPE_RULES) {
    if (pattern.test(text)) return classification;
  }
  return text ? "nonprofit" : "";
}

// Identity within the file: state + organisation + programme. Programme is part of the key
// because one institution legitimately runs several distinct clinics, and collapsing those on
// name alone would silently drop rows.
function organizationKey(row = {}) {
  return [lower(stateCode(row.state) || row.state), normalizeName(row.organization_name), normalizeName(row.program)].join("|");
}

function hashId(prefix, key) {
  return `${prefix}${crypto.createHash("sha1").update(String(key)).digest("hex").slice(0, 16)}`;
}

/**
 * The candidate id for a directory organisation. Deliberately NOT prospectCandidateId(): that
 * keys on domain when there is no EIN, and seven distinct organisations in this file share
 * gmail.com — they would have collapsed into a single record. Hashing the file's own identity
 * key keeps them seven, and stays inside the prospect-cand- family so every existing surface
 * (workbench, approval, promotion) treats them like any other candidate.
 */
export function clinicCandidateId(row = {}) {
  return hashId("prospect-cand-", `clinic:${organizationKey(row)}`);
}

export function clinicNamedContactId(row = {}) {
  return hashId("clinic-person-", `clinic-person:${lower(stateCode(row.state) || row.state)}|${normalizeName(row.organization_name)}|${lower(row.person)}|${validEmail(row.email)}`);
}

// ---------------------------------------------------------------------------------------------
// 3. ROW -> RECORD. Pure, so the mapping is tested against synthetic rows and never needs the
//    real corpus (which holds real people's addresses and stays out of the repo).
// ---------------------------------------------------------------------------------------------

export function mapEnrichmentRow(row = {}) {
  const email = validEmail(row["Public Email"]);
  const emailType = clean(row["Email Type"]);
  return {
    state_name: clean(row.State),
    state: stateCode(row.State),
    region_metro: clean(row["Region / Metro"]),
    organization_name: clean(row.Organization),
    program: clean(row["Program / Clinic"]),
    tier: clean(row.Tier).toUpperCase(),
    clinic_verification: clean(row["Clinic Verification"]),
    email,
    email_type: emailType,
    email_type_group: email ? emailTypeGroup(emailType) : "none",
    contact_name: clean(row["Email Contact Name"]),
    contact_role: clean(row["Email Contact Role"]),
    alternate_emails: splitEmails(row["Alternate Email(s)"]).filter((address) => address !== email),
    email_source: clean(row["Email Source"]),
    email_research_notes: clean(row["Email Research Notes"]),
    email_confidence: clean(row["Email Confidence"]),
    email_research_status: clean(row["Research Status"] || row["Email Research Status"]),
    email_verified_at: excelDate(row["Verified Date"] || row["Email Verified"]),
    phone: clean(row.Phone),
    website: clean(row.Website)
  };
}

export function mapNamedContactRow(row = {}) {
  const email = validEmail(row["Public Email"]);
  return {
    state_name: clean(row.State),
    state: stateCode(row.State),
    person: clean(row.Person),
    title_role: clean(row["Title / Role"]),
    organization_name: clean(row.Organization),
    program: clean(row["Program / Clinic"]),
    email,
    alternate_emails: splitEmails(row["Alternate Email(s)"]).filter((address) => address !== email),
    phone: clean(row.Phone),
    email_type: clean(row["Email Type"]),
    email_relationship: clean(row["Email Relationship"]),
    notes: clean(row["Why Relevant / Research Notes"]),
    email_source: clean(row["Email Source"]),
    tier: clean(row.Tier).toUpperCase(),
    confidence: clean(row.Confidence),
    verified_at: excelDate(row["Verified Date"])
  };
}

// ---------------------------------------------------------------------------------------------
// 4. THE PLAN. Pure: reads state, returns records and a full report, writes nothing. The report
//    is the thing a human reads BEFORE any of this is applied.
// ---------------------------------------------------------------------------------------------

/**
 * Builds the import plan and its report.
 *
 * @param state    current application state (read-only)
 * @param workbook Map of sheetName -> rows[][], from readClinicWorkbook()
 */
export function buildClinicImportPlan(state = {}, workbook, options = {}) {
  const now = clean(options.now) || new Date().toISOString();
  const sheets = workbook instanceof Map ? workbook : new Map(Object.entries(workbook || {}));

  const readSheet = (name, requiredColumns, { optional = false } = {}) => {
    const rows = sheets.get(name);
    if (!rows) {
      if (optional) return { headerIndex: -1, headers: [], records: [] };
      throw new Error(
        `Clinic directory import: sheet "${name}" is missing. Sheets present: ` +
        `${[...sheets.keys()].join(", ") || "(none)"}. Nothing was imported.`
      );
    }
    return sheetRecords(rows, { sheetName: name, requiredColumns });
  };

  const enrichment = readSheet(CLINIC_SHEETS.enrichment, REQUIRED_ENRICHMENT_COLUMNS);
  const namedSheet = readSheet(CLINIC_SHEETS.named, REQUIRED_NAMED_COLUMNS);
  const directory = readSheet(CLINIC_SHEETS.directory, [], { optional: true });

  if (!enrichment.records.length) {
    throw new Error(`Clinic directory import: sheet "${CLINIC_SHEETS.enrichment}" has a header row but no data rows. Nothing was imported.`);
  }

  // Organization Type lives on the directory sheet; joined on state + name, and ONLY when that
  // join is unique. An ambiguous join leaves the field empty rather than guessing a type.
  const directoryByKey = new Map();
  for (const row of directory.records) {
    const key = `${lower(stateCode(row.State) || row.State)}|${normalizeName(row.Organization)}`;
    if (!directoryByKey.has(key)) directoryByKey.set(key, []);
    directoryByKey.get(key).push(row);
  }
  const organizationType = (mapped) => {
    const hits = directoryByKey.get(`${lower(mapped.state || mapped.state_name)}|${normalizeName(mapped.organization_name)}`) || [];
    return hits.length === 1 ? clean(hits[0]["Organization Type"]) : "";
  };

  // ---- organisations ------------------------------------------------------------------------
  const organizations = [];
  const byKey = new Map();
  const duplicateRowsInFile = [];
  enrichment.records.forEach((raw, index) => {
    const mapped = mapEnrichmentRow(raw);
    if (!mapped.organization_name) return;
    const key = organizationKey(mapped);
    const record = {
      ...mapped,
      organization_type: organizationType(mapped),
      source_row: enrichment.headerIndex + 2 + index,   // 1-based spreadsheet row, for tracing
      named_contacts: []
    };
    const seen = byKey.get(key);
    if (seen) {
      // Same state, organisation AND programme: one organisation listed twice. Recorded, not
      // written twice, and reported so the file's own duplication is visible.
      duplicateRowsInFile.push({
        organization: record.organization_name,
        state: record.state_name,
        program: record.program,
        rows: [seen.source_row, record.source_row]
      });
      return;
    }
    byKey.set(key, record);
    organizations.push(record);
  });

  // Same organisation NAME in different states, and one address on several organisations. Both
  // are flagged on the record and reported; neither merges anything.
  const byNormalizedName = new Map();
  const byAddress = new Map();
  for (const record of organizations) {
    const nameKey = normalizeName(record.organization_name);
    if (nameKey) {
      if (!byNormalizedName.has(nameKey)) byNormalizedName.set(nameKey, []);
      byNormalizedName.get(nameKey).push(record);
    }
    if (record.email) {
      if (!byAddress.has(record.email)) byAddress.set(record.email, []);
      byAddress.get(record.email).push(record);
    }
  }
  const nameCollisions = [];
  for (const group of byNormalizedName.values()) {
    if (group.length < 2) continue;
    nameCollisions.push({
      organization: group[0].organization_name,
      states: group.map((record) => record.state_name),
      programs: group.map((record) => record.program)
    });
    for (const record of group) {
      record.name_collision_with = group.filter((other) => other !== record)
        .map((other) => `${other.organization_name} (${other.state_name})`);
    }
  }
  const sharedAddresses = [];
  for (const [address, group] of byAddress) {
    if (group.length < 2) continue;
    sharedAddresses.push({ address, organizations: group.map((record) => record.organization_name) });
    for (const record of group) {
      record.shared_address_with = group.filter((other) => other !== record).map((other) => other.organization_name);
    }
  }

  // ---- named people -> organisations ---------------------------------------------------------
  const orgsByStateName = new Map();
  for (const record of organizations) {
    const key = `${lower(record.state || record.state_name)}|${normalizeName(record.organization_name)}`;
    if (!orgsByStateName.has(key)) orgsByStateName.set(key, []);
    orgsByStateName.get(key).push(record);
  }

  const namedContacts = [];
  const unmatchedPeople = [];
  const ambiguousPeople = [];
  const promotedOverInbox = [];
  namedSheet.records.forEach((raw, index) => {
    const person = mapNamedContactRow(raw);
    if (!person.person && !person.email) return;
    const key = `${lower(person.state || person.state_name)}|${normalizeName(person.organization_name)}`;
    const hits = orgsByStateName.get(key) || [];
    const row = {
      id: clinicNamedContactId(person),
      type: "clinic_named_contact",
      ...person,
      source: CLINIC_DIRECTORY_SOURCE,
      source_row: namedSheet.headerIndex + 2 + index,
      candidate_id: "",
      match_status: "unmatched",
      match_detail: "",
      imported_at: now
    };

    if (hits.length === 1) {
      const organization = hits[0];
      row.candidate_id = clinicCandidateId(organization);
      row.match_status = "attached";
      row.match_detail = `state + organisation name (${organization.organization_name}, ${organization.state_name})`;
      organization.named_contacts.push({
        id: row.id, person: row.person, title_role: row.title_role, email: row.email,
        email_type: row.email_type, email_source: row.email_source, phone: row.phone
      });
      // The person is the better route. The organisation inbox is demoted to an alternate,
      // never discarded — an unanswered personal address still leaves the inbox to fall back to.
      if (row.email && organization.email && row.email !== organization.email) {
        promotedOverInbox.push({
          organization: organization.organization_name,
          person: row.person,
          demoted_email_type: organization.email_type
        });
        organization.alternate_emails = uniq([organization.email, ...organization.alternate_emails, ...row.alternate_emails]);
        organization.email = row.email;
        organization.contact_name = row.person || organization.contact_name;
        organization.contact_role = row.title_role || organization.contact_role;
        organization.email_source = row.email_source || organization.email_source;
      } else if (row.email && !organization.email) {
        organization.email = row.email;
        organization.email_type = row.email_type || organization.email_type;
        organization.email_type_group = emailTypeGroup(row.email_type);
        organization.contact_name = row.person || organization.contact_name;
        organization.contact_role = row.title_role || organization.contact_role;
        organization.email_source = row.email_source || organization.email_source;
        organization.alternate_emails = uniq([...organization.alternate_emails, ...row.alternate_emails]);
      }
    } else if (hits.length > 1) {
      row.match_status = "ambiguous";
      row.match_detail = `${hits.length} organisations in ${person.state_name} share this name; not attached`;
      ambiguousPeople.push({ person: row.person, organization: row.organization_name, state: row.state_name, matches: hits.length });
    } else {
      row.match_detail = `no organisation named "${person.organization_name}" in ${person.state_name || "this state"}; not attached`;
      unmatchedPeople.push({ person: row.person, organization: row.organization_name, state: row.state_name });
    }
    namedContacts.push(row);
  });

  // ---- production: enrich, or import as new, never a silent merge -----------------------------
  const productionCandidates = list(state.prospectCandidates);
  const prodByName = new Map();
  for (const candidate of productionCandidates) {
    const key = normalizeName(candidate.organization_name);
    if (!key) continue;
    if (!prodByName.has(key)) prodByName.set(key, []);
    prodByName.get(key).push(candidate);
  }

  // Every address already known to production, and why it matters (a suppressed or unsubscribed
  // address must never quietly re-enter the funnel through an import).
  const productionEmails = new Map();
  const noteEmail = (value, where) => {
    const address = validEmail(value);
    if (!address) return;
    if (!productionEmails.has(address)) productionEmails.set(address, new Set());
    productionEmails.get(address).add(where);
  };
  for (const row of list(state.companyContacts)) noteEmail(row.email, "companyContacts");
  for (const row of list(state.outreachContacts)) noteEmail(row.email, "outreachContacts");
  for (const row of list(state.reactivationContacts)) noteEmail(row.email, "reactivationContacts");
  for (const row of productionCandidates) noteEmail(row.email, "prospectCandidates");
  for (const row of list(state.outreachSuppressions)) noteEmail(row.email, "outreachSuppressions");
  for (const row of list(state.outreachUnsubscribes)) noteEmail(row.email, "outreachUnsubscribes");
  for (const row of list(state.outreachBounces)) noteEmail(row.email, "outreachBounces");

  const enrichedExisting = [];
  const ambiguousProduction = [];
  const emailAlreadyInProduction = [];
  const doNotContactMatches = [];
  const candidates = [];

  for (const record of organizations) {
    const nameHits = prodByName.get(normalizeName(record.organization_name)) || [];
    const sameState = nameHits.filter((candidate) => lower(candidate.state) === lower(record.state) && record.state);
    const existing = sameState.length === 1 ? sameState[0] : null;
    if (!existing && nameHits.length) {
      ambiguousProduction.push({
        organization: record.organization_name,
        state: record.state_name,
        reason: sameState.length > 1
          ? `${sameState.length} production rows share this name in ${record.state}`
          : `production row(s) with this name are in ${uniq(nameHits.map((hit) => hit.state)).join("/") || "another state"}`,
        production_ids: nameHits.map((hit) => clean(hit.id))
      });
    }

    for (const address of [record.email, ...record.alternate_emails].filter(Boolean)) {
      const where = productionEmails.get(address);
      if (!where) continue;
      emailAlreadyInProduction.push({ organization: record.organization_name, in: [...where] });
      if (where.has("outreachSuppressions") || where.has("outreachUnsubscribes") || where.has("outreachBounces")) {
        doNotContactMatches.push({ organization: record.organization_name, in: [...where] });
      }
      break;
    }

    const base = {
      id: existing ? clean(existing.id) : clinicCandidateId(record),
      type: "prospect_candidate",
      organization_name: record.organization_name,
      // Directory fields — every one of them filterable, every address traceable.
      state: record.state,
      state_name: record.state_name,
      region_metro: record.region_metro,
      tier: record.tier,
      program: record.program,
      clinic_verification: record.clinic_verification,
      organization_type: record.organization_type,
      email: record.email,
      email_type: record.email_type,
      email_type_group: record.email_type_group,
      contact_name: record.contact_name,
      contact_role: record.contact_role,
      alternate_emails: record.alternate_emails,
      email_source: record.email_source,
      email_research_notes: record.email_research_notes,
      email_confidence: record.email_confidence,
      email_research_status: record.email_research_status,
      email_verified_at: record.email_verified_at,
      website: record.website,
      phone: record.phone,
      named_contacts: record.named_contacts,
      named_contact_count: record.named_contacts.length,
      has_named_contact: record.named_contacts.length > 0,
      // What a human sees at a glance: an address to a person, an address to an inbox, or none.
      contact_status: !record.email ? "no_address"
        : (record.named_contacts.length || record.email_type_group === "named_person") ? "named_person"
          : "organization_inbox",
      name_collision_with: record.name_collision_with || [],
      shared_address_with: record.shared_address_with || [],
      possible_prod_match: (!existing && nameHits.length) ? nameHits.map((hit) => clean(hit.id)) : [],
      source_row: record.source_row,
      directory_source: CLINIC_DIRECTORY_SOURCE,
      source_url: record.email_source,
      imported_at: now
    };

    if (existing) {
      // Enrichment, not replacement: provenance, review state and discovery history all belong
      // to the row that was already there. An already-approved or promoted row keeps that state.
      base.source = clean(existing.source) || CLINIC_DIRECTORY_SOURCE;
      base.sources = uniq([...list(existing.sources), existing.source, CLINIC_DIRECTORY_SOURCE]);
      base.classification = normalizeClassification(existing.classification)
        || classificationForOrganizationType(record.organization_type);
      base.review_state = clean(existing.review_state) || PROSPECT_REVIEW.PENDING;
      base.discovered_at = clean(existing.discovered_at) || now;
      base.enriched_at = now;
      enrichedExisting.push({
        organization: record.organization_name,
        state: record.state_name,
        production_id: clean(existing.id),
        production_source: clean(existing.source),
        gains_address: Boolean(record.email) && !validEmail(existing.email)
      });
    } else {
      base.source = CLINIC_DIRECTORY_SOURCE;
      base.sources = [CLINIC_DIRECTORY_SOURCE];
      base.classification = classificationForOrganizationType(record.organization_type);
      // The structural guarantee: a newly imported organisation is only ever pending review.
      base.review_state = PROSPECT_REVIEW.PENDING;
      base.discovered_at = now;
    }
    base.tos_risk = "low";
    base.score = scoreCandidate(base);
    candidates.push(base);
  }

  // ---- the report ---------------------------------------------------------------------------
  const tally = (rows, pick) => rows.reduce((totals, row) => {
    const key = clean(pick(row)) || "(none)";
    totals[key] = (totals[key] || 0) + 1;
    return totals;
  }, {});

  const withEmail = organizations.filter((record) => record.email);
  const withoutEmail = organizations.filter((record) => !record.email);
  const withNamedPerson = organizations.filter((record) => record.named_contacts.length);

  const report = {
    sheets: {
      enrichment: { name: CLINIC_SHEETS.enrichment, headerRow: enrichment.headerIndex + 1, dataRows: enrichment.records.length },
      namedContacts: { name: CLINIC_SHEETS.named, headerRow: namedSheet.headerIndex + 1, dataRows: namedSheet.records.length },
      directory: directory.headerIndex < 0
        ? { name: CLINIC_SHEETS.directory, headerRow: null, dataRows: 0, note: "not present; Organization Type left empty" }
        : { name: CLINIC_SHEETS.directory, headerRow: directory.headerIndex + 1, dataRows: directory.records.length }
    },
    organizations: {
      rowsRead: enrichment.records.length,
      unique: organizations.length,
      withEmail: withEmail.length,
      withoutEmail: withoutEmail.length,
      byEmailType: tally(withEmail, (record) => record.email_type),
      byEmailTypeGroup: tally(withEmail, (record) => record.email_type_group),
      byTier: tally(organizations, (record) => record.tier),
      byContactStatus: tally(candidates, (record) => record.contact_status),
      withNamedPerson: withNamedPerson.length,
      noAddress: withoutEmail.map((record) => ({
        organization: record.organization_name,
        state: record.state_name,
        tier: record.tier,
        research_status: record.email_research_status
      }))
    },
    namedContacts: {
      rowsRead: namedSheet.records.length,
      withEmail: namedContacts.filter((row) => row.email).length,
      attached: namedContacts.filter((row) => row.match_status === "attached").length,
      organizationsWithNamedPerson: withNamedPerson.length,
      organizationsWithSeveral: withNamedPerson.filter((record) => record.named_contacts.length > 1)
        .map((record) => ({ organization: record.organization_name, state: record.state_name, people: record.named_contacts.length })),
      preferredOverOrganizationInbox: promotedOverInbox,
      unmatched: unmatchedPeople,
      ambiguous: ambiguousPeople
    },
    duplicatesInFile: {
      duplicateRows: duplicateRowsInFile,
      sameNameDifferentState: nameCollisions,
      sharedAddresses
    },
    production: {
      newCandidates: candidates.length - enrichedExisting.length,
      enrichedExisting: enrichedExisting.length,
      enrichedExistingDetail: enrichedExisting,
      ambiguousNameMatches: ambiguousProduction,
      addressAlreadyInProduction: emailAlreadyInProduction,
      addressOnDoNotContactList: doNotContactMatches
    },
    writes: {
      prospectCandidates: candidates.length,
      [CLINIC_NAMED_CONTACTS_COLLECTION]: namedContacts.length,
      outreachContacts: 0,
      note: "Nothing here is contactable: candidates land pending_review and no outreach contact is written."
    }
  };

  return { candidates, namedContacts, report, summary: report.organizations };
}

/**
 * Applies a plan to state. Records only — no send path, no enrolment, no approval. Existing
 * candidate rows are merged into (not replaced), so _version and any field production carries
 * that this import does not know about survive.
 */
export function applyClinicImportPlan(state = {}, plan = {}, options = {}) {
  const now = clean(options.now) || new Date().toISOString();
  const next = { ...state };

  const byId = new Map(list(next.prospectCandidates).map((row) => [clean(row.id), row]));
  for (const candidate of list(plan.candidates)) {
    const existing = byId.get(candidate.id);
    byId.set(candidate.id, { ...existing, ...candidate, updated_at: now });
  }
  next.prospectCandidates = [...byId.values()];

  const people = new Map(list(next[CLINIC_NAMED_CONTACTS_COLLECTION]).map((row) => [clean(row.id), row]));
  for (const person of list(plan.namedContacts)) {
    people.set(person.id, { ...people.get(person.id), ...person, updated_at: now });
  }
  next[CLINIC_NAMED_CONTACTS_COLLECTION] = [...people.values()];

  return next;
}

/**
 * The invariant the confirm endpoint re-checks on every row before anything is written: an
 * import may only ever produce pending, un-enrolled, un-approved candidates. Returns the
 * offending rows; an empty array means the write is safe to perform.
 */
export function clinicImportViolations(plan = {}) {
  const violations = [];
  for (const candidate of list(plan.candidates)) {
    const reviewState = lower(candidate.review_state);
    if (candidate.enriched_at) {
      // An enriched row keeps whatever review state production already gave it; the only thing
      // forbidden is this import CREATING an approval.
      if (![PROSPECT_REVIEW.PENDING, PROSPECT_REVIEW.APPROVED, PROSPECT_REVIEW.REJECTED,
        PROSPECT_REVIEW.PROMOTED, PROSPECT_REVIEW.PROMOTION_FAILED].includes(reviewState)) {
        violations.push({ id: candidate.id, reason: `unknown review_state "${candidate.review_state}"` });
      }
    } else if (reviewState !== PROSPECT_REVIEW.PENDING) {
      violations.push({ id: candidate.id, reason: `new candidate would land review_state "${candidate.review_state}"` });
    }
    if (candidate.sequence_status || candidate.enrolled_at) {
      violations.push({ id: candidate.id, reason: "candidate carries an enrolment field" });
    }
  }
  return violations;
}

/** Keys a candidate participates in, for callers that want the existing dedup semantics. */
export function clinicCandidateKeys(candidate = {}) {
  return prospectKeys(candidate);
}
