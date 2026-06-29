// MVP Reactivation — list import. Reads the verified-clean MVP users workbook ("Outreach List"
// sheet), stages each person into reactivationContacts (idempotent, suppression-honored,
// deduped, provider-bucketed), and assigns domain-stratified waves. It NEVER sends and NEVER
// releases a wave — staging only. Run it where the live store is configured (prod Render Shell):
//
//   node scripts/reactivation-import.mjs                      # dry run: parse + report, write nothing
//   node scripts/reactivation-import.mjs --confirm            # stage contacts + wave assignment
//   node scripts/reactivation-import.mjs --file <path.xlsx>   # override workbook path
//
// The workbook holds real consumer PII and is gitignored — it is read locally, never committed.
// After this stages contacts, releasing Wave 1 (the operator step, after the seed test) is what
// starts the cadence clock. Nothing leaves the building until REACTIVATION_LIVE_SEND is flipped.

import { readFileSync } from "node:fs";
import { createStore } from "./storage.mjs";
import {
  importReactivationContacts, applyWaveAssignment, reactivationCampaignOf, providerBucket
} from "./reactivation-os.mjs";

const DEFAULT_FILE = "expungement_ai_mvp_users_organized.xlsx";
const SHEET = "Outreach List";

// ---- minimal xlsx reader (no external dep): unzip via the OS, parse sharedStrings + a sheet ----
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function unzipXlsx(file) {
  const dir = mkdtempSync(path.join(tmpdir(), "react-xlsx-"));
  execFileSync("unzip", ["-o", "-q", path.resolve(file), "-d", dir]);
  return dir;
}
const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
const colIndex = (letters) => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function readSheetRows(file, sheetName) {
  const dir = unzipXlsx(file);
  const ssXml = readFileSync(path.join(dir, "xl/sharedStrings.xml"), "utf8");
  const shared = [];
  for (const m of ssXml.matchAll(/<x:si>(.*?)<\/x:si>/gs)) {
    const txt = [...m[1].matchAll(/<x:t[^>]*>(.*?)<\/x:t>/gs)].map((t) => t[1]).join("");
    shared.push(decode(txt));
  }
  const wb = readFileSync(path.join(dir, "xl/workbook.xml"), "utf8");
  const rels = readFileSync(path.join(dir, "xl/_rels/workbook.xml.rels"), "utf8");
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const t = (m[0].match(/Target="[^"]*?(sheet\d+\.xml)"/) || [])[1];
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    if (t && id) relMap[id] = t;
  }
  let sheetFile = null;
  for (const m of wb.matchAll(/name="([^"]+)"\s+sheetId="\d+"\s+r:id="([^"]+)"/g)) {
    if (m[1] === sheetName) sheetFile = relMap[m[2]];
  }
  if (!sheetFile) throw new Error(`Sheet "${sheetName}" not found.`);
  const xml = readFileSync(path.join(dir, "xl/worksheets", sheetFile), "utf8");
  const rows = [];
  for (const rm of xml.matchAll(/<x:row[^>]*>(.*?)<\/x:row>/gs)) {
    const cells = {};
    for (const cm of rm[1].matchAll(/<x:c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/x:c>)/gs)) {
      const ref = cm[1]; const attrs = cm[2] || ""; const inner = cm[3] || "";
      const isInline = (inner.match(/<x:t[^>]*>(.*?)<\/x:t>/s) || [])[1];
      const vMatch = (inner.match(/<x:v>(.*?)<\/x:v>/s) || [])[1];
      let val = "";
      if (isInline != null) val = isInline;
      else if (/t="s"/.test(attrs) && vMatch != null) val = shared[Number(vMatch)] ?? "";
      else if (vMatch != null) val = vMatch;
      cells[colIndex(ref)] = decode(val);
    }
    rows.push(cells);
  }
  const header = []; const maxCol = Math.max(0, ...rows.flatMap((r) => Object.keys(r).map(Number)));
  for (let i = 0; i <= maxCol; i++) header.push((rows[0] || {})[i] || "");
  const out = [];
  for (let r = 1; r < rows.length; r++) { const o = {}; header.forEach((h, i) => { if (h) o[h] = (rows[r] || {})[i] || ""; }); out.push(o); }
  return out;
}

// "2 - Warm re-engage" / "3 - Cold re-engage" / "3 - Never logged in" -> priority slug.
function priorityOf(label = "") {
  const l = String(label).toLowerCase();
  if (l.includes("warm")) return "warm";
  if (l.includes("never")) return "never_logged_in";
  return "cold";
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : DEFAULT_FILE;

  const sheetRows = readSheetRows(fileArg, SHEET);
  const rows = sheetRows.map((r) => ({
    email: r.Email,
    first_name: "",
    full_name: r["Full Name"],
    phone: r.Phone,
    priority: priorityOf(r["Outreach Priority"]),
    domain: r["Email Domain"]
  })).filter((r) => String(r.email || "").includes("@"));

  // Provider mix preview.
  const mix = {};
  for (const r of rows) { const b = providerBucket(r.email); mix[b] = (mix[b] || 0) + 1; }

  console.log(`Workbook        : ${fileArg}`);
  console.log(`Sheet           : ${SHEET}`);
  console.log(`Rows with email : ${rows.length}`);
  console.log(`Provider mix    :`, mix);
  console.log(`Priority warm   : ${rows.filter((r) => r.priority === "warm").length}`);
  console.log(`Priority cold   : ${rows.filter((r) => r.priority === "cold").length}`);
  console.log(`Priority never  : ${rows.filter((r) => r.priority === "never_logged_in").length}`);

  if (!confirm) {
    console.log("\nDRY RUN — nothing written. Re-run with --confirm to stage contacts + waves.");
    return;
  }

  const store = await createStore();
  const state = await store.readState();
  const imported = importReactivationContacts(state, rows);
  const config = reactivationCampaignOf(imported.state);
  const assigned = applyWaveAssignment(imported.state, config);
  // Stamp the campaign config so the wave plan + staged status persist.
  const nextState = {
    ...assigned.state,
    reactivationCampaign: {
      ...(assigned.state.reactivationCampaign || {}),
      campaignId: config.campaignId,
      status: assigned.state.reactivationCampaign?.status || "staged",
      waves: config.waves,
      releasedWaves: assigned.state.reactivationCampaign?.releasedWaves || [],
      imported_at: new Date().toISOString()
    }
  };
  await store.writeState(nextState);

  console.log("\nSTAGED.");
  console.log("Import summary  :", imported.summary);
  console.log("Wave sizes      :", assigned.waveSizes);
  console.log("Campaign status :", nextState.reactivationCampaign.status, "(no wave released; nothing enrolled)");
  console.log("\nNext: run the seed test, flip REACTIVATION_LIVE_SEND, turn on the engine autopilot, then release Wave 1.");
}

main().catch((e) => { console.error("Import failed:", e.message); process.exit(1); });
