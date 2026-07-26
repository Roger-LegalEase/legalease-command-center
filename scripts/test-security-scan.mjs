import assert from "node:assert/strict";
import crypto from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { detectSecurityFindings } from "./security-scan-detectors.mjs";
import { extractArchiveText, isArchiveDocumentPath, looksLikeZipArchive } from "./security-scan-archive.mjs";

const emailCanary = ["person", "canary.example"].join("@");
const tokenCanary = ["sk", "syntheticcanaryvalue0123456789ABCDEFG"].join("-");
const text = `contact=${emailCanary}\ncredential=${tokenCanary}\n`;
const categories = detectSecurityFindings(text, "synthetic.txt");
assert.equal(categories.get("non_reserved_email"), 1);
assert.equal(categories.get("high_confidence_secret"), 1);
assert.equal(detectSecurityFindings("synthetic", "docs/phaseb-20990101-reconciliation-diff.json").get("sensitive_export_path"), 1);
assert.equal(detectSecurityFindings("synthetic", "docs/ebd3dae7-5a52-4be4-a6fa-5a842780637a.csv").get("sensitive_export_path"), 1);
const safeOutput = JSON.stringify({ path:"synthetic.txt", categories:[...categories], fileFingerprint:crypto.createHash("sha256").update(text).digest("hex").slice(0, 16) });
assert.doesNotMatch(safeOutput, new RegExp(emailCanary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(safeOutput, new RegExp(tokenCanary));
console.log("security scanner synthetic canaries passed");

// ---------------------------------------------------------------------------------------------
// Binary and ZIP-container coverage.
//
// The gate used to skip every binary blob BEFORE looking at it, so an .xlsx file — which is a
// ZIP archive — was never scanned, and neither was its filename. A suppression export in the
// exact format the privacy rule names committed clean; verified against the real scanner, not
// theorised. Both halves of that hole are asserted here.
//
// Addresses are assembled from parts so this file never contains a literal the scanner would
// flag when it scans the repository, which it does.
// ---------------------------------------------------------------------------------------------

function zipArchive(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = deflateRawSync(Buffer.from(entry.data));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(Buffer.byteLength(entry.data), 22);
    local.writeUInt16LE(name.length, 26);
    const chunk = Buffer.concat([local, name, body]);
    locals.push(chunk);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(body.length, 20);
    directory.writeUInt32LE(Buffer.byteLength(entry.data), 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([directory, name]));
    offset += chunk.length;
  }
  const directoryBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directoryBuffer, end]);
}

const workbookCanary = ["records", "canary.example"].join("@");
const workbook = zipArchive([
  { name:"xl/sharedStrings.xml", data:`<sst><si><t>${workbookCanary}</t></si></sst>` },
  { name:"xl/worksheets/sheet1.xml", data:"<worksheet/>" },
  { name:"docProps/thumbnail.jpeg", data:"opaque-entry-that-must-be-skipped" }
]);

assert.ok(looksLikeZipArchive(workbook), "a generated OOXML archive must be recognised as a ZIP");
assert.ok(isArchiveDocumentPath("data/contacts.xlsx"), ".xlsx is a ZIP-container document");
assert.ok(!isArchiveDocumentPath("notes.txt"), "plain text is not an archive document");
assert.ok(!isArchiveDocumentPath("bundle.zip"), "a general archive stays opaque on purpose");

const workbookText = extractArchiveText(workbook);
assert.match(workbookText, /records/, "sharedStrings.xml must be extracted from the workbook");
assert.doesNotMatch(workbookText, /opaque-entry-that-must-be-skipped/, "non-text entries must not be extracted");
assert.equal(
  detectSecurityFindings(workbookText, "reports/contacts.xlsx").get("non_reserved_email"),
  1,
  "an address inside a spreadsheet must be found"
);

// The name-only half of the hole: bytes the scanner cannot read, but a filename that says
// exactly what the file is. This must trip on the path alone.
assert.equal(
  detectSecurityFindings("", "data/suppression-export.xlsx").get("sensitive_export_path"),
  1,
  "a suppression export must be caught by its filename even when its contents are unreadable"
);
assert.equal(
  detectSecurityFindings("", "docs/campaign-ledger-2026.xlsx").get("sensitive_export_path"),
  1,
  "the sensitive-path pattern must cover xlsx, not only csv and json"
);

// Robustness: extraction must never throw, whatever it is handed. A gate that crashes on a
// malformed file is a gate that can be switched off by committing one.
for (const hostile of [
  Buffer.alloc(0),
  Buffer.from("PK"),
  Buffer.from("PK truncated with no central directory"),
  Buffer.concat([Buffer.from("PK"), Buffer.alloc(64, 0xff)]),
  Buffer.from("not an archive at all")
]) {
  assert.equal(typeof extractArchiveText(hostile), "string", "extraction must always return a string");
}

console.log("security scanner binary and archive coverage passed");
