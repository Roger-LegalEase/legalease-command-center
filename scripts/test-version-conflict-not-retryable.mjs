// A version conflict must never be signalled as a serialization failure.
//
// 2026-07-28 incident. The CAS functions raised SQLSTATE 40001 (serialization_failure) for an
// application-level version conflict. PostgREST retries 40001 itself, server-side, unboundedly:
// ONE conflicting production request produced 157,901 raises in 126s (~1,250/s), returned 504,
// and kept retrying after the client disconnected. Because p_expected_version is fixed in the
// request body, every retry re-reads the same row and fails identically — the retry can never
// succeed. That single loop held Supabase at 99% CPU with near-zero disk I/O for a day.
//
// This guards both halves of the fix, and is the reason it cannot regress:
//   1. No shipped migration may raise 40001 (the storm code) any more.
//   2. storage.mjs must map BOTH P0001 and 40001 to StorageConflictError, so the app is safe
//      deployed either side of the migration and safe across a rollback.
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await mkdtemp(path.join(os.tmpdir(), "leos-version-conflict-"));
process.env.COMMAND_CENTER_DATA_PATH = path.join(dir, "state.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(dir, "missing-seed.json");

// ---------------------------------------------------------------------------------------
// 1. The storm code must be gone from the migrations that define these functions.
// ---------------------------------------------------------------------------------------
const migrationsDir = path.join(root, "supabase", "migrations");
const migrations = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
assert.ok(migrations.length > 0, "expected at least one migration to inspect.");

// The LAST migration that redefines each function is what production ends up running.
const CAS_FUNCTIONS = ["leos_upsert_record_cas", "leos_apply_core_mutations", "leos_claim_social_publish"];
const latestDefinition = new Map();
for (const name of migrations) {
  const sql = await readFile(path.join(migrationsDir, name), "utf8");
  for (const fn of CAS_FUNCTIONS) {
    if (new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, "i").test(sql)) {
      latestDefinition.set(fn, { migration: name, sql });
    }
  }
}

for (const fn of CAS_FUNCTIONS) {
  const found = latestDefinition.get(fn);
  assert.ok(found, `no migration defines public.${fn}.`);
  // Isolate this function's body so a sibling function in the same file cannot mask a regression.
  const start = found.sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, "i"));
  const rest = found.sql.slice(start);
  const end = rest.indexOf("$function$;");
  const body = end === -1 ? rest : rest.slice(0, end);
  assert.equal(
    /errcode\s*=\s*'40001'/i.test(body),
    false,
    `${fn} (in ${found.migration}) raises SQLSTATE 40001 for a version conflict. PostgREST retries ` +
    "40001 server-side in an unbounded, futile loop and pegs the database CPU. Raise 'P0001' instead."
  );
  assert.ok(
    /errcode\s*=\s*'P0001'\s*,\s*message\s*=\s*'version conflict'/i.test(body),
    `${fn} (in ${found.migration}) must raise 'P0001' with the 'version conflict' message.`
  );
}

// ---------------------------------------------------------------------------------------
// 2. The client must recognise both codes as a conflict.
// ---------------------------------------------------------------------------------------
const { StorageConflictError, supabaseRestRequest } = await import("./storage.mjs");

process.env.SUPABASE_URL = "https://storage-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const realFetch = globalThis.fetch;
const respondWith = (payload, status = 400) => {
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
};

const expectConflict = async (payload, status, label) => {
  respondWith(payload, status);
  await assert.rejects(
    () => supabaseRestRequest("rpc/leos_apply_core_mutations", {
      method: "POST",
      body: { p_mutations: [] },
      noRetry: true,
      collection: "priorities",
      itemId: "probe"
    }),
    (error) => {
      assert.ok(error instanceof StorageConflictError, `${label} must map to StorageConflictError, got ${error?.name}: ${error?.message}`);
      return true;
    },
    label
  );
};

try {
  // The new code, as the migration now raises it (PostgREST maps P0001 to 400).
  await expectConflict({ code: "P0001", message: "version conflict" }, 400, "P0001 version conflict");
  // The old code, so the app is safe deployed BEFORE the migration and safe across a rollback.
  await expectConflict({ code: "40001", message: "version conflict" }, 409, "40001 version conflict");
  // Message-only match: the belt-and-braces path, with the space the functions actually emit.
  await expectConflict({ code: "XXXXX", message: "version conflict" }, 400, "message-only version conflict");

  // A genuinely different failure must NOT be laundered into a conflict, or a real error would be
  // silently retried as a stale-version miss.
  respondWith({ code: "22023", message: "invalid mutation batch" }, 400);
  await assert.rejects(
    () => supabaseRestRequest("rpc/leos_apply_core_mutations", {
      method: "POST",
      body: { p_mutations: {} },
      noRetry: true
    }),
    (error) => {
      assert.equal(error instanceof StorageConflictError, false, "22023 must not be treated as a version conflict.");
      assert.equal(error.code, "22023");
      return true;
    },
    "invalid mutation batch"
  );
} finally {
  globalThis.fetch = realFetch;
}

console.log("version-conflict retry-storm guards passed.");
