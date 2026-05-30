import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createDurableStorage } from "../lib/storage/index.mjs";
import { localStateToDurableRecords, migrationSummary } from "../lib/storage/migrations.mjs";

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const sourcePath = process.env.COMMAND_CENTER_DATA_PATH || path.join(rootDir, "data", "social-command-center.json");
const backupDir = path.join(rootDir, "data", "backups", "local-migration");

function safeLog(payload) {
  const text = JSON.stringify(payload, null, 2).replace(/postgres:\/\/[^"'\s]+/g, "postgres://[redacted]");
  console.log(text);
}

async function main() {
  const summary = {
    source: path.relative(rootDir, sourcePath),
    dry_run: dryRun,
    backup_created: false,
    records_found: 0,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    errors: []
  };

  if (!existsSync(sourcePath)) {
    safeLog({ ...summary, message: "No local JSON state file was found. No migration was needed." });
    return;
  }

  const state = JSON.parse(await readFile(sourcePath, "utf8"));
  const records = localStateToDurableRecords(state);
  Object.assign(summary, migrationSummary(records));

  if (dryRun) {
    safeLog({ ...summary, message: "Dry run complete. No records were written." });
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to import local data into durable Postgres storage.");
  }

  await mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `social-command-center-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await copyFile(sourcePath, backupPath);
  summary.backup_created = true;
  summary.backup_path = path.relative(rootDir, backupPath);

  const storage = await createDurableStorage({ env: process.env });
  try {
    for (const { entityType, record } of records) {
      try {
        const existing = await storage.readRecord(entityType, record.id);
        await storage.writeRecord(entityType, record);
        if (existing) summary.records_updated += 1;
        else summary.records_inserted += 1;
      } catch (error) {
        summary.errors.push({ entityType, id: record.id, message: error.message || "Import failed" });
      }
    }
  } finally {
    await storage.close?.();
  }

  safeLog(summary);
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/postgres:\/\/[^"'\s]+/g, "postgres://[redacted]"));
  process.exit(1);
});
