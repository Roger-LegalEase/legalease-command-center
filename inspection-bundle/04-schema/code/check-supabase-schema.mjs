import { existsSync, readFileSync } from "node:fs";
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

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(
    "Missing server-side Supabase env vars. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local. Do not expose service role keys to client code."
  );
  process.exit(1);
}

const { supabaseRestRequest } = await import("./storage.mjs");

const table = process.env.SUPABASE_CORE_RECORDS_TABLE || "leos_core_records";

try {
  const rows = await supabaseRestRequest(`${table}?select=collection,item_id&limit=1`, {
    method: "GET",
    prefer: "count=exact"
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        table,
        reachable: true,
        sampleRowsReturned: Array.isArray(rows) ? rows.length : 0
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        table,
        reachable: false,
        safeMessage: error?.message || "Supabase table check failed."
      },
      null,
      2
    )
  );
  process.exit(1);
}
