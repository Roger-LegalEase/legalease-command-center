// Consumer / Expungement.ai list import — the "Upload a list" front door for consumer reactivation
// contacts. IMPORT ONLY. This module parses a CSV, previews it WITHOUT writing state, and on confirm
// routes the rows through the EXISTING reactivation import path:
//   importReactivationContacts()  — dedup / bad-email / suppression handling (reactivation-os.mjs)
//   applyWaveAssignment()         — domain-stratified wave numbers ONLY (no enroll, no release)
//
// It NEVER: releases a wave, enrolls a contact, sends an email, calls SendGrid or any provider,
// flips a live-send/autopilot gate, or activates the campaign. Imported contacts land inert
// ("Not Enrolled") and stay that way until an operator releases a wave elsewhere. The default
// first-name fallback ("" -> "there" at send time) and default priority ("cold") are inherited
// from importReactivationContacts — this module does not re-implement them.

import {
  importReactivationContacts, applyWaveAssignment, reactivationCampaignOf, contactIdForEmail
} from "./reactivation-os.mjs";
import { normalizeEmail, isBadDomain } from "./outreach-os.mjs";
import crypto from "node:crypto";

export const CONSUMER_LIST_TYPE = "consumer";
export const CONSUMER_SOURCE_TYPE = "consumer_upload";
export const CONSUMER_IMPORT_WARNING =
  "Nothing sends from import. Contacts are staged for review only — no email goes out until a wave is released elsewhere.";

const clean = (v = "") => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
const len = (v) => (Array.isArray(v) ? v.length : 0);

// ---------------------------------------------------------------------------
// Column handling — canonical field <- header aliases. Headers match case-insensitively after
// stripping spaces, underscores, and hyphens, so "First Name", "first_name", "firstName", and
// "FIRST-NAME" all collapse to first_name.
// ---------------------------------------------------------------------------
const FIELD_ALIASES = {
  email: ["email", "emailaddress", "e-mail"],
  first_name: ["firstname", "fname", "givenname"],
  full_name: ["fullname", "name", "contactname"],
  phone: ["phone", "phonenumber", "mobile", "cell", "tel"],
  priority: ["priority", "segment", "tier"],
  domain: ["domain"]
};

function normalizeHeaderKey(header = "") {
  return clean(header).toLowerCase().replace(/[\s_\-]+/g, "");
}

const HEADER_LOOKUP = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) map.set(normalizeHeaderKey(alias), field);
  }
  return map;
})();

// RFC-4180-ish CSV parser: handles quoted fields, escaped "" quotes, and commas/newlines inside
// quotes (contact names like "Doe, John" survive). Returns a grid of trimmed-by-caller cells.
export function parseCsv(text = "") {
  const src = String(text || "").replace(/^﻿/, ""); // strip BOM
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let sawField = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
      sawField = true;
    } else if (ch === ",") {
      record.push(field); field = ""; sawField = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      if (sawField || field.length) { record.push(field); rows.push(record); }
      field = ""; record = []; sawField = false;
    } else {
      field += ch; sawField = true;
    }
  }
  if (sawField || field.length || record.length) { record.push(field); rows.push(record); }
  // Drop fully-empty rows (blank lines).
  return rows.filter((r) => r.some((c) => clean(c) !== ""));
}

// Parse a consumer CSV into { headers, rows, columns, sampleRows }. `rows` are objects keyed by the
// canonical field names importReactivationContacts expects. `columns` lists the likely columns we
// detected (header -> field). `sampleRows` are the first few raw rows (email masked) for eyeballing.
export function parseConsumerCsv(text = "") {
  const grid = parseCsv(text);
  if (!grid.length) return { headers: [], rows: [], columns: [], sampleRows: [] };
  const headerCells = grid[0].map(clean);
  const fieldByIndex = headerCells.map((h) => HEADER_LOOKUP.get(normalizeHeaderKey(h)) || null);
  const columns = headerCells
    .map((header, i) => ({ header, field: fieldByIndex[i] }))
    .filter((c) => c.field);
  const rows = grid.slice(1).map((cells) => {
    const rec = {};
    headerCells.forEach((header, i) => {
      const field = fieldByIndex[i];
      if (field && !rec[field]) rec[field] = clean(cells[i]); // first matching column wins per field
    });
    return rec;
  });
  const sampleRows = grid.slice(1, 4).map((cells) =>
    headerCells.reduce((acc, header, i) => { acc[header] = clean(cells[i]); return acc; }, {}));
  return { headers: headerCells, rows, columns, sampleRows: sampleRows.map(maskSampleRow) };
}

function maskEmail(value = "") {
  const v = clean(value);
  const at = v.indexOf("@");
  if (at <= 0) return v;
  return v[0] + "***" + v.slice(at);
}

function maskSampleRow(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = /email/i.test(key) && /@/.test(String(value)) ? maskEmail(value) : value;
  }
  return out;
}

// Shared input validation — list type and source note are both required, and the CSV must be
// non-empty. Throws a plain-English Error the endpoint surfaces as a 400.
function assertInputs(csvText, { sourceNote, listType } = {}) {
  if (!clean(listType)) throw new Error("List type is required.");
  if (clean(listType) !== CONSUMER_LIST_TYPE) {
    throw new Error('List type must be "consumer" for the consumer / Expungement.ai import.');
  }
  if (!clean(sourceNote)) throw new Error("Source note is required: add where this list came from.");
  if (!clean(csvText)) throw new Error("Choose a CSV file with a header row and at least one contact.");
}

// PREVIEW — pure, NEVER writes state. Runs the SAME engine confirm uses (importReactivationContacts)
// as a faithful dry-run, discards the resulting state, and reports the counts plus a missing-vs-
// invalid email split (display-only) and masked sample rows.
export function previewConsumerImport(state = {}, csvText = "", opts = {}) {
  assertInputs(csvText, opts);
  const parsed = parseConsumerCsv(csvText);
  const { summary } = importReactivationContacts(state, parsed.rows); // dry-run; state discarded
  let missingEmails = 0;
  let invalidEmails = 0;
  for (const row of parsed.rows) {
    const email = normalizeEmail(row.email);
    if (!email) missingEmails++;
    else if (isBadDomain(email)) invalidEmails++;
  }
  return {
    ok: true,
    listType: CONSUMER_LIST_TYPE,
    sourceNote: clean(opts.sourceNote),
    totalRows: parsed.rows.length,
    validContacts: summary.added + summary.updated,
    badEmails: summary.skippedBad,
    missingEmails,
    invalidEmails,
    duplicates: summary.skippedDup,
    suppressed: summary.skippedSuppressed,
    columnsDetected: parsed.columns,
    sampleRows: parsed.sampleRows,
    warning: CONSUMER_IMPORT_WARNING,
    writesState: false
  };
}

// The contact_ids the uploaded rows resolve to — exactly the contacts importReactivationContacts
// adds or updates (bad/missing emails never become contacts; duplicates collapse to one id).
function importedContactIds(rows = []) {
  const ids = new Set();
  for (const row of list(rows)) {
    const email = normalizeEmail(row.email);
    if (email && !isBadDomain(email)) ids.add(contactIdForEmail(email));
  }
  return ids;
}

// Stamp durable import provenance on the contacts this import touched. Adds ONLY the four safe
// source_* fields — it never reads or writes send/signal/suppression state. First-seen
// source_imported_at / source_import_id are read from `priorById` (the state BEFORE import, since
// importReactivationContacts rebuilds the contact object) so original provenance survives re-import;
// source_note / source_type refresh to the current upload.
function stampProvenance(state = {}, importedIds, priorById, { sourceNote, now, importId }) {
  const contacts = list(state.reactivationContacts).map((c) => {
    if (!importedIds.has(c.contact_id)) return c;
    const prior = priorById.get(c.contact_id) || {};
    return {
      ...c,
      source_type: CONSUMER_SOURCE_TYPE,
      source_note: clean(sourceNote),
      source_imported_at: prior.source_imported_at || c.source_imported_at || now,
      source_import_id: prior.source_import_id || c.source_import_id || importId
    };
  });
  return { ...state, reactivationContacts: contacts };
}

// CONFIRM — routes rows through the existing import path, stamps durable provenance on the touched
// contacts, then applies safe (inert) wave numbers. Returns the NEW state for the caller to persist.
// No enroll, no release, no send, no gate change.
export function confirmConsumerImport(state = {}, csvText = "", opts = {}) {
  assertInputs(csvText, opts);
  const now = opts.now || new Date().toISOString();
  const importId = opts.importId || `consumer-import-${crypto.randomBytes(6).toString("hex")}`;
  const parsed = parseConsumerCsv(csvText);
  // Capture existing provenance from the input state BEFORE import (importReactivationContacts
  // rebuilds the contact object and would otherwise drop the source_* fields).
  const priorById = new Map(list(state.reactivationContacts).map((c) => [c.contact_id, c]));
  const imported = importReactivationContacts(state, parsed.rows, { now });
  // Durable provenance (compliance + list hygiene) on just the contacts from THIS upload.
  const stamped = stampProvenance(imported.state, importedContactIds(parsed.rows), priorById, {
    sourceNote: opts.sourceNote, now, importId
  });
  // Wave assignment sets wave NUMBERS only — contacts stay "Not Enrolled" and inert.
  const waved = applyWaveAssignment(stamped, reactivationCampaignOf(stamped), { now });
  return {
    ok: true,
    listType: CONSUMER_LIST_TYPE,
    sourceNote: clean(opts.sourceNote),
    sourceImportId: importId,
    state: waved.state,
    summary: imported.summary,
    waveSizes: waved.waveSizes,
    totalContacts: len(waved.state.reactivationContacts),
    warning: CONSUMER_IMPORT_WARNING,
    writesState: true
  };
}
