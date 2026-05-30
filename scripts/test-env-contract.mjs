import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const envExample = readFileSync(".env.example", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const docs = readFileSync("docs/secrets-and-env.md", "utf8");
const storage = readFileSync("lib/storage/index.mjs", "utf8");

for (const key of ["DATABASE_URL", "COMMAND_CENTER_OWNER_TOKEN", "OPENAI_API_KEY", "PUBLIC_APP_BASE_URL"]) {
  assert(envExample.includes(`${key}=`), `.env.example should document ${key}.`);
}
assert.match(gitignore, /^\.env$/m, ".env should be gitignored.");
assert.match(gitignore, /^\.env\.\*$/m, ".env.local and other env files should be gitignored.");
assert.match(docs, /server-only/i, "Secret docs should distinguish server-only secrets.");
assert.match(docs, /No `DATABASE_URL` may appear in browser/i, "Secret docs should block DATABASE_URL in client output.");
assert.match(storage, /requiredProductionEnv|assertProductionDatabaseConfigured/, "Production env validation should exist.");

console.log("env contract tests passed");
