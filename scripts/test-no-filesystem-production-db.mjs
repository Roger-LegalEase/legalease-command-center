import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storage = readFileSync("scripts/storage.mjs", "utf8");
const hardening = readFileSync("lib/storage/index.mjs", "utf8") + readFileSync("docs/data-storage-audit.md", "utf8");

assert.match(hardening, /DATABASE_URL/, "Production durable storage should be governed by DATABASE_URL.");
// PORTED 2026-07-26 (hygiene, extended-test triage). The phrase "Production durable storage is
// unavailable" no longer exists; the fail-closed path now reports "Supabase configuration is
// missing. Hosted startup fails closed." and reports storageMode "unavailable". Asserting both
// the operator-visible message and the machine-readable mode, so a reworded message alone
// cannot silently retire this guard.
assert.match(hardening, /Supabase configuration is missing\. Hosted startup fails closed\./, "Production missing durable storage should fail closed with a clear message.");
assert.match(hardening, /storageMode: configured \? "supabase" : isProductionLike\(env\) \? "unavailable" : "memory-dev"/, "Production missing durable storage should report an unavailable storage mode, never a silent local fallback.");
assert.match(hardening, /data\/social-command-center\.json[\s\S]*no for production/, "Local JSON store should be documented as unsafe for production source of truth.");
assert.match(hardening, /localStorage[\s\S]*not app data|Never use as source of truth/, "localStorage should not be the production data source.");
assert.match(hardening, /memory-dev[\s\S]*development-only|blocked in production/, "Memory storage should be development-only.");
assert.doesNotMatch(storage, /better-sqlite3|sqlite3|\.sqlite|\.db/, "Production store should not introduce SQLite.");

console.log("no filesystem production DB tests passed");
