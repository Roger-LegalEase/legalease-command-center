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

assert.throws(
  () => assertProductionDatabaseConfigured({ NODE_ENV: "production" }),
  /DATABASE_URL/,
  "Production durable writes should require DATABASE_URL."
);
assert.equal(databaseReadiness({ NODE_ENV: "production" }).safeForProductionWrites, false, "Production without DATABASE_URL is not safe for writes.");
assert.equal(databaseReadiness({ NODE_ENV: "production", DATABASE_URL: "postgres://example" }).storageMode, "postgres");

const adapter = await createDurableStorage({ env: { NODE_ENV: "development" } });
assert.equal(adapter.kind, "memory-dev", "Development fallback should be clearly development-only.");
await adapter.writeRecord("tasks", { id: "task-1", title: "Durability test", status: "open" });
assert.equal((await adapter.readRecord("tasks", "task-1")).title, "Durability test", "Core OS entities should read/write through adapter.");
await adapter.writeRecord("social_records", { id: "social-1", type: "draft", body: "Manual-only post", status: "draft" });
assert.equal((await adapter.readRecord("social_records", "social-1")).body, "Manual-only post", "Social entities should read/write through adapter.");

const source = readFileSync("lib/storage/index.mjs", "utf8") + readFileSync("lib/storage/memory-dev.mjs", "utf8");
assert.match(source, /blocked in production|Production durable storage is unavailable/, "Dev fallback should be blocked from production.");

console.log("storage durability tests passed");
