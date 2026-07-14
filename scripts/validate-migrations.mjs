import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const directory = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((name) => /^\d{8}_\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
assert(files.length > 0, "At least one versioned migration is required.");
assert.equal(new Set(files).size, files.length, "Migration names must be unique.");
let combined = "";
for (const name of files) {
  const sql = await readFile(new URL(name, directory), "utf8");
  assert.match(sql, /^begin;/im, `${name} must be transactional.`);
  assert.match(sql, /commit;\s*$/im, `${name} must commit explicitly.`);
  assert(!/grant\s+.*\s+to\s+(?:anon|authenticated)\b/i.test(sql), `${name} must not grant security-definer functions to client roles.`);
  combined += sql;
  const recovery = new URL(`../supabase/recovery/${name.replace(/\.sql$/, ".md")}`, import.meta.url);
  await readFile(recovery, "utf8");
}
for (const required of ["version bigint", "leos_apply_core_mutations", "leos_upsert_record_cas", "leos_social_publish_claims", "leos_claim_social_publish", "leos_audit_events", "leos_audit_events_immutable", "leos_append_audit_event"]) assert(combined.includes(required), required);
console.log(`migration validation passed (${files.length} migration)`);
