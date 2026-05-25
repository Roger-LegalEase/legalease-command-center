import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(name) {
  const envPath = path.join(rootDir, name);
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const { coreRecordsFromState, supabaseRestRequest } = await import("./storage.mjs");
const sourcePath = path.join(rootDir, "data/social-command-center.json");
const reportDir = path.join(rootDir, "data/exports/reports");
const startedAt = new Date().toISOString();

if (!existsSync(sourcePath)) throw new Error("Local state file not found: data/social-command-center.json");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to sync local JSON to Supabase.");
}

const state = JSON.parse(readFileSync(sourcePath, "utf8"));
const rows = coreRecordsFromState(state);
const table = process.env.SUPABASE_CORE_RECORDS_TABLE || "leos_core_records";
const chunkSize = 200;
let upserted = 0;
const errors = [];

for (let index = 0; index < rows.length; index += chunkSize) {
  const chunk = rows.slice(index, index + chunkSize);
  try {
    await supabaseRestRequest(table + "?on_conflict=collection,item_id", {
      method: "POST",
      body: chunk,
      prefer: "resolution=merge-duplicates,return=minimal"
    });
    upserted += chunk.length;
  } catch (error) {
    errors.push({ index, count: chunk.length, error: String(error.message || error).slice(0, 500) });
  }
}

const finishedAt = new Date().toISOString();
const report = {
  ok: errors.length === 0,
  startedAt,
  finishedAt,
  sourcePath: "data/social-command-center.json",
  table,
  totalRows: rows.length,
  upserted,
  failedChunks: errors.length,
  errors,
  collections: rows.reduce((memo, row) => {
    memo[row.collection] = (memo[row.collection] || 0) + 1;
    return memo;
  }, {})
};

await mkdir(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `supabase-sync-report-${finishedAt.replace(/[:.]/g, "-")}.json`);
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, reportPath:path.relative(rootDir, reportPath) }, null, 2));
if (errors.length) process.exitCode = 1;
