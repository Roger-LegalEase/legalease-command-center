// Text extraction from ZIP-container documents, for the PII gate.
//
// Why this exists: `security-scan.mjs` skipped every binary blob before looking at it, and an
// .xlsx file is a ZIP archive — so a spreadsheet full of contact addresses was never scanned,
// and neither was its filename. A suppression export in the exact format the privacy rule
// names (`05_DATA_AND_INTEGRATION_CONTRACT.md`) committed clean. Proven, not theorised:
// a file named `suppression-export.xlsx` with binary bytes produced zero findings.
//
// This reads the archive's central directory and inflates only the entries that can hold
// human text (the XML parts of an OOXML workbook, and any plain text inside). It is
// deliberately conservative: bounded, non-recursive, and it never throws — an archive it
// cannot parse returns "" and the caller falls back to treating the file as opaque, which is
// the behaviour that existed before.

import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

// Bounds. A gate that can be made to run out of memory by a crafted commit is not a gate.
const MAX_ENTRIES = 512;
const MAX_TOTAL_EXTRACTED_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_EXTRACTED_BYTES = 4 * 1024 * 1024;

// Extensions of ZIP-container document formats worth opening. Scoped to the office formats
// the privacy rule is about; a general-purpose .zip is left opaque on purpose, because
// recursing into arbitrary archives is a different and much larger problem.
const ARCHIVE_DOCUMENT_PATTERN = /\.(?:xlsx|xlsm|xltx|docx|pptx|odt|ods)$/i;

// Entries inside the archive that can carry addresses. An OOXML workbook keeps its cell
// strings in sharedStrings.xml and its cells in sheet XML; ODF keeps them in content.xml.
const TEXT_ENTRY_PATTERN = /\.(?:xml|rels|txt|csv|json)$/i;

export function looksLikeZipArchive(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.readUInt32LE(0) === LOCAL_SIGNATURE;
}

export function isArchiveDocumentPath(filePath = "") {
  return ARCHIVE_DOCUMENT_PATTERN.test(String(filePath));
}

function findEndOfCentralDirectory(buffer) {
  // The EOCD sits at the tail, after a comment of up to 65535 bytes.
  const earliest = Math.max(0, buffer.length - (22 + 65_535));
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function entryDataOffset(buffer, localHeaderOffset) {
  if (localHeaderOffset + 30 > buffer.length) return -1;
  if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_SIGNATURE) return -1;
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  return localHeaderOffset + 30 + nameLength + extraLength;
}

/**
 * Returns the concatenated text of the archive's text-bearing entries, or "" if the buffer is
 * not a parseable archive. Never throws.
 */
export function extractArchiveText(buffer) {
  if (!looksLikeZipArchive(buffer)) return "";
  let eocd = -1;
  try { eocd = findEndOfCentralDirectory(buffer); } catch { return ""; }
  if (eocd < 0) return "";

  let entryCount = 0;
  let cursor = 0;
  try {
    entryCount = Math.min(buffer.readUInt16LE(eocd + 10), MAX_ENTRIES);
    cursor = buffer.readUInt32LE(eocd + 16);
  } catch { return ""; }

  const parts = [];
  let extracted = 0;

  for (let index = 0; index < entryCount; index += 1) {
    try {
      if (cursor + 46 > buffer.length) break;
      if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) break;
      const method = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const uncompressedSize = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
      const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
      cursor += 46 + nameLength + extraLength + commentLength;

      if (!TEXT_ENTRY_PATTERN.test(name)) continue;
      if (uncompressedSize > MAX_ENTRY_EXTRACTED_BYTES) continue;
      if (extracted + uncompressedSize > MAX_TOTAL_EXTRACTED_BYTES) break;

      const start = entryDataOffset(buffer, localHeaderOffset);
      if (start < 0) continue;
      const raw = buffer.subarray(start, start + (method === 0 ? uncompressedSize : compressedSize));
      const body = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
      if (!body) continue;
      extracted += body.length;
      parts.push(body.toString("utf8"));
    } catch {
      // A single unreadable entry must not blind the scan to the rest of the archive.
      continue;
    }
  }

  return parts.join("\n");
}
