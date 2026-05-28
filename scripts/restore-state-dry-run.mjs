import { restoreStateDryRun } from "./state-integrity.mjs";

const snapshotPath = process.argv[2];

if (!snapshotPath) {
  console.error("Usage: node scripts/restore-state-dry-run.mjs <snapshot-file>");
  process.exit(1);
}

const result = await restoreStateDryRun(snapshotPath);
console.log(JSON.stringify(result, null, 2));

if (!result.valid) process.exitCode = 1;
