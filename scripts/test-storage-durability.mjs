import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertProductionDatabaseConfigured, createDurableStorage, databaseReadiness, durableEntityTypes, socialDurableFields } from "../lib/storage/index.mjs";

assert(durableEntityTypes.includes("captures"), "Durable entities should include captures.");
assert(durableEntityTypes.includes("tasks"), "Durable entities should include tasks.");
assert(durableEntityTypes.includes("social_records"), "Durable entities should include Social records.");
assert(durableEntityTypes.includes("proof_items"), "Durable entities should include Proof records.");

for (const field of ["id", "type", "body", "status", "created_at", "updated_at", "published_url"]) {
  assert(socialDurableFields.includes(field), `Social durable model should include ${field}.`);
}

// PORTED 2026-07-26 (hygiene, extended-test triage). The canonical production storage contract
// is Supabase, not `DATABASE_URL` Postgres: createDurableStorage() now throws "The legacy
// DATABASE_URL adapter is disabled for hosted production" and databaseReadiness() derives
// `configured` from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. So the old assertions were
// demanding the disabled adapter. Ported to the live contract, and strengthened: supplying
// DATABASE_URL alone must NOT make production look storable, which is the regression that
// would matter if someone tried to revive the legacy path.
assert.throws(
  () => assertProductionDatabaseConfigured({ NODE_ENV: "production" }),
  /supabase_url_required/,
  "Production durable writes should require Supabase configuration."
);
assert.throws(
  () => assertProductionDatabaseConfigured({ NODE_ENV: "production" }),
  /supabase_service_role_key_required/,
  "Production durable writes should require the Supabase service role key."
);
assert.equal(databaseReadiness({ NODE_ENV: "production" }).safeForProductionWrites, false, "Production without Supabase is not safe for writes.");
assert.equal(databaseReadiness({ NODE_ENV: "production" }).storageMode, "unavailable", "Production without Supabase should report storage unavailable, never a silent fallback.");
assert.equal(databaseReadiness({ NODE_ENV: "production", DATABASE_URL: "postgres://example" }).storageMode, "unavailable", "the legacy DATABASE_URL adapter must not satisfy the production storage contract.");
assert.equal(databaseReadiness({ NODE_ENV: "production", DATABASE_URL: "postgres://example" }).configured, false, "DATABASE_URL alone must not count as configured durable storage.");
assert.equal(databaseReadiness({ NODE_ENV: "production", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }).storageMode, "supabase", "Supabase configuration should select the Supabase adapter.");
await assert.rejects(
  () => createDurableStorage({ env: { NODE_ENV: "production", DATABASE_URL: "postgres://example" } }),
  /The legacy DATABASE_URL adapter is disabled for hosted production/,
  "hosted production must refuse the legacy Postgres adapter outright."
);

const adapter = await createDurableStorage({ env: { NODE_ENV: "development" } });
assert.equal(adapter.kind, "memory-dev", "Development fallback should be clearly development-only.");
await adapter.writeRecord("tasks", { id: "task-1", title: "Durability test", status: "open" });
assert.equal((await adapter.readRecord("tasks", "task-1")).title, "Durability test", "Core OS entities should read/write through adapter.");
await adapter.writeRecord("social_records", { id: "social-1", type: "draft", body: "Manual-only post", status: "draft" });
assert.equal((await adapter.readRecord("social_records", "social-1")).body, "Manual-only post", "Social entities should read/write through adapter.");

const source = readFileSync("lib/storage/index.mjs", "utf8") + readFileSync("lib/storage/memory-dev.mjs", "utf8");
assert.match(source, /blocked in production|Production durable storage is unavailable/, "Dev fallback should be blocked from production.");

console.log("storage durability tests passed");
