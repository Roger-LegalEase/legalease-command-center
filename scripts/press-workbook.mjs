// Founder OS Release 8 — reading the press workbook.
//
// A minimal, dependency-free .xlsx reader plus the row→record mapping for the press corpus.
//
// TWO THINGS THIS FILE IS CAREFUL ABOUT.
//
// 1. PII. The workbook holds ~176 real journalists' addresses. It lives only in gitignored
//    `data/private/`. Nothing here prints a cell value; the runner reports counts. No address
//    reaches a log, a fixture or a diff.
//
// 2. COLUMN ACCURACY. Empty cells in this producer's output are self-closing (`<x:c r="D4"/>`),
//    so a naive scan drops them and shifts every later column. Reading a journalist's address
//    into the "relationship" field would be silently wrong in a lane that sends email. Every
//    cell is therefore placed by its own `r="D4"` reference, never by position. A first pass at
//    this made exactly that mistake and made clean data look corrupt.

import { inflateRawSync } from "node:zlib";

const clean = (value = "") => String(value ?? "").trim();

function unescapeXml(value = "") {
  return String(value)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#10;/g, " ").replace(/&amp;/g, "&");
}

// Walks local file headers rather than the central directory: this producer writes entries the
// central-directory scan does not resolve.
function unzip(buffer) {
  const files = new Map();
  let offset = 0;
  while (offset < buffer.length - 4 && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(start, start + compressed);
    try { files.set(name, method === 0 ? raw : inflateRawSync(raw)); } catch { /* skip unreadable entry */ }
    offset = start + compressed;
  }
  return files;
}

function columnIndex(reference = "") {
  const letters = String(reference).match(/^([A-Z]+)/)?.[1] || "";
  let index = 0;
  for (const character of letters) index = index * 26 + (character.charCodeAt(0) - 64);
  return index - 1;
}

/** Returns { sheetName: rows[][] } with every cell at its true column. Never throws on a bad file. */
export function readWorkbook(buffer) {
  const files = unzip(buffer);
  const text = (key) => files.get(key)?.toString("utf8") || "";

  const relationships = new Map();
  for (const element of text("xl/_rels/workbook.xml.rels").match(/<Relationship\b[^>]*\/>/g) || []) {
    const id = element.match(/Id="([^"]+)"/)?.[1];
    const target = element.match(/Target="([^"]+)"/)?.[1];
    if (id && target) relationships.set(id, target);
  }

  // Shared strings are empty in this producer's output (values are inline), but a workbook saved
  // by Excel would use them, so both are supported.
  const shared = text("xl/sharedStrings.xml").split(/<x:si>|<si>/).slice(1)
    .map((entry) => (entry.match(/<(?:x:)?t[^>]*>([\s\S]*?)<\/(?:x:)?t>/g) || [])
      .map((part) => unescapeXml(part.replace(/<[^>]+>/g, ""))).join(""));

  const sheets = new Map();
  for (const match of text("xl/workbook.xml").matchAll(/<x:sheet\s+name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const name = unescapeXml(match[1]);
    const target = String(relationships.get(match[2]) || "").replace(/^\/+/, "").replace(/^xl\//, "");
    const xml = text(`xl/${target}`);
    const rows = [];
    for (const rowMatch of xml.match(/<x:row\b[\s\S]*?<\/x:row>/g) || []) {
      const cells = [];
      for (const cell of rowMatch.matchAll(/<x:c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/x:c>)/g)) {
        const reference = cell[1].match(/r="([A-Z]+\d+)"/)?.[1];
        if (!reference) continue;
        const inner = cell[2] || "";
        const raw = inner.match(/<x:v>([\s\S]*?)<\/x:v>/)?.[1] ?? "";
        const isShared = /t="s"/.test(cell[1]);
        cells[columnIndex(reference)] = unescapeXml(isShared ? (shared[Number(raw)] ?? "") : raw);
      }
      rows.push(cells);
    }
    sheets.set(name, rows);
  }
  return sheets;
}

/** Turns a sheet's rows into objects keyed by its header row. */
export function sheetRecords(rows = []) {
  if (!rows.length) return [];
  const headers = rows[0].map((header) => clean(header));
  return rows.slice(1).map((row) => {
    const record = {};
    for (const [index, header] of headers.entries()) {
      if (!header) continue;
      record[header] = clean(row[index]);
    }
    return record;
  }).filter((record) => Object.values(record).some(Boolean));
}

export const PRESS_SHEETS = Object.freeze({
  master: "Master Media List",
  priority: "Top 50 Priority",
  existing: "Existing LegalEase Press",
  desks: "Outlet Desks",
  pitchMap: "Pitch Map",
  seed: "Black Press Seed",
  coverage: "Coverage Matrix"
});

// ---------------------------------------------------------------------------------------------
// Row → record mapping. Pure, so it is tested against synthetic rows and never needs the corpus.
// ---------------------------------------------------------------------------------------------

const validEmail = (value = "") => {
  const text = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
};

/**
 * Maps one Master Media List row onto the press fields carried on an outreach contact.
 * Everything the charter asks to carry through is preserved; nothing is invented.
 */
export function mapMasterRow(row = {}, { source = "master_media_list" } = {}) {
  const email = validEmail(row["Public Email"]);
  return {
    email,
    name: clean(row.Journalist),
    publication: clean(row["Primary Publication"]),
    otherOutlets: clean(row["Other / Freelance Outlets"]),
    press_source: source,
    press_tier: clean(row.Tier),
    press_role_status: clean(row["Role / Status"]),
    press_coverage_lanes: clean(row["Coverage Lanes"]),
    press_geography: clean(row.Geography),
    press_pitchability: clean(row.Pitchability),
    press_relationship: clean(row.Relationship),
    press_email_type: clean(row["Email Type"]),
    press_reference_article: clean(row["Reference Article / Work"]),
    press_reference_date: clean(row["Reference Date"]),
    press_reference_url: clean(row["Reference URL"]),
    press_contact_url: clean(row["Author / Contact URL"]),
    press_why_fits: clean(row["Why LegalEase Fits"]),
    press_best_angle: clean(row["Best Pitch Angle"]),
    press_verified_at: clean(row.Verified),
    press_confidence: clean(row["Confidence / Notes"]),
    press_priority_rank: clean(row["Priority Rank"])
  };
}

/** Black Press Seed rows are research, not contact records. They carry no address at all. */
export function mapSeedRow(row = {}) {
  return {
    email: "",
    name: "",
    publication: clean(row.Publication),
    press_source: "black_press_seed",
    press_geography: clean(row["Geographic Focus"]),
    press_why_fits: clean(row["LegalEase Fit"]),
    press_verification_status: /verified active/i.test(clean(row["2026 Status"])) ? "verified_active" : "unverified",
    press_verified_at: "",
    press_coverage_lanes: clean(row["Media Lane"]),
    press_best_angle: clean(row["Recommended Angle"]),
    press_confidence: clean(row["Source / Verification Note"])
  };
}

/** Outlet Desks are outlet-level routes, not people. */
export function mapDeskRow(row = {}) {
  return {
    outlet: clean(row.Outlet),
    beat: clean(row["Primary Beat"]),
    bestContact: clean(row["Best Contact"]),
    email: validEmail(row["Public Email"]),
    routeType: clean(row["Route Type"]),
    sourceUrl: clean(row["Official Source / Contact URL"]),
    howToUse: clean(row["How to Use"])
  };
}

/** Existing LegalEase Press rows are coverage that already ran. */
export function mapPlacementRow(row = {}) {
  return {
    publication: clean(row["Publication / Show"]),
    journalist: clean(row["Journalist / Host"]),
    coverage: clean(row.Coverage),
    format: clean(row.Format),
    placedAt: clean(row.Date),
    url: clean(row.URL),
    relationship: clean(row.Relationship),
    recommendedFollowUp: clean(row["Recommended Follow-up"])
  };
}
