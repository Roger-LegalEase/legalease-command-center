import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requiredProductionEnv } from "../lib/storage/index.mjs";

const envExample = readFileSync(".env.example", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const docs = readFileSync("docs/secrets-and-env.md", "utf8");
const storage = readFileSync("lib/storage/index.mjs", "utf8");

// PORTED 2026-07-26 (hygiene, extended-test triage). Three assertions here described a storage
// contract the product abandoned:
//   - `DATABASE_URL` is deliberately NOT in .env.example any more. lib/storage/index.mjs
//     createDurableStorage() throws "The legacy DATABASE_URL adapter is disabled for hosted
//     production; use the active Supabase adapter." Demanding it be documented would advertise
//     a disabled adapter as the production contract.
//   - `PUBLIC_APP_BASE_URL` was renamed `APP_BASE_URL`.
//   - docs/secrets-and-env.md no longer says "server-only" or the DATABASE_URL-in-browser line;
//     it says credentials "must remain server-side" and forbids exposing them through
//     NEXT_PUBLIC_*, HTML, diagnostics, logs, audit summaries, fixtures or reports — a broader
//     claim than the single-variable one, so it is asserted instead.
// The required-key list is now imported from lib/storage/index.mjs rather than hardcoded, so
// .env.example can never silently drift from the list production actually enforces.
for (const key of [...requiredProductionEnv, "APP_BASE_URL", "OPENAI_API_KEY"]) {
  assert(envExample.includes(`${key}=`), `.env.example should document ${key}.`);
}
assert(!envExample.includes("DATABASE_URL="), ".env.example must not advertise the disabled legacy DATABASE_URL adapter.");
assert.match(gitignore, /^\.env$/m, ".env should be gitignored.");
assert.match(gitignore, /^\.env\.\*$/m, ".env.local and other env files should be gitignored.");
assert.match(docs, /must remain server-side/i, "Secret docs should require provider credentials to stay server-side.");
assert.match(docs, /Never expose credentials through `NEXT_PUBLIC_\*`, HTML, diagnostics, logs, audit summaries, fixtures, or reports\./, "Secret docs should block credentials from every client-visible output channel.");
assert.match(storage, /The legacy DATABASE_URL adapter is disabled for hosted production/, "the legacy DATABASE_URL adapter must stay disabled for hosted production.");
assert.match(storage, /requiredProductionEnv|assertProductionDatabaseConfigured/, "Production env validation should exist.");

console.log("env contract tests passed");
