// Write-amplification guard (2026-07-26).
//
// The defect class this suite pins shut: a recurring writer presenting a WHOLE collection to
// the store when it changed a handful of rows. On 2026-07-26 the SendGrid webhook wrote 5,311
// rows every ~5 minutes and the heartbeat ~22,800 rows hourly — ~86,000 row-writes an hour with
// almost nothing changing — holding database CPU at 91% and contributing to two outages. Same
// class as the writeChanges convoy (#118), different code.
//
// The guard: for each unattended recurring writer, rows WRITTEN may not exceed rows CHANGED by
// more than MAX_WRITE_AMPLIFICATION. "Changed" is measured by the store's own diff
// (coreMutationsBetween), so the test and the store cannot disagree about what changed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The defined factor. Written == changed is the design point (the store diff IS the write
// set); the slack above 1 exists only so an intentional companion row — a health stamp, a
// ledger entry riding along — can never flake the suite. Anything above this is the defect.
export const MAX_WRITE_AMPLIFICATION = 4;

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

const { coreMutationsBetween } = await import("./storage.mjs");
const { reduceSendGridEvents, updateSendGridWebhookHealth, SENDGRID_WEBHOOK_COLLECTIONS, SENDGRID_WEBHOOK_HEALTH_COLLECTION } = await import("./sendgrid-webhook.mjs");

// ---------------------------------------------------------------------------------------------
// 1. The SendGrid webhook batch: thousands considered, a handful written
// ---------------------------------------------------------------------------------------------

function webhookScopedState(contactCount) {
  const contacts = Array.from({ length: contactCount }, (unused, index) => ({
    contact_id: `react-${index}`,
    email: `person${index}@example.org`,
    wave: 1 + (index % 4),
    sequence_status: index % 3 === 0 ? "Enrolled" : "Not Enrolled",
    enrolled_at: index % 3 === 0 ? "2026-07-01T00:00:00.000Z" : "",
    _version: 3
  }));
  return {
    outreachSuppressions: Array.from({ length: 400 }, (unused, index) => ({ id: `supp-${index}`, email: `old${index}@example.org`, reason: "unsubscribed", _version: 2 })),
    outreachContacts: [],
    outreachBounces: Array.from({ length: 250 }, (unused, index) => ({ id: `bounce-${index}`, email: `b${index}@example.org`, type: "bounce", _version: 2 })),
    reactivationContacts: contacts,
    reactivationEvents: Array.from({ length: 600 }, (unused, index) => ({ id: `ev-${index}`, contact_id: `react-${index % contactCount}`, type: "open", _version: 2 }))
  };
}

check("a 3-event batch over 5,000+ rows writes a handful of rows, never the collections", () => {
  const scoped = webhookScopedState(4000);
  const totalRows = Object.values(scoped).reduce((sum, rows) => sum + rows.length, 0);
  assert.ok(totalRows >= 5000, "the fixture must be production-sized for the guard to mean anything");

  const events = [
    { event: "bounce", email: "person7@example.org", reason: "550 mailbox unavailable", timestamp: 1785000000 },
    { event: "open", email: "person8@example.org", timestamp: 1785000001 },
    { event: "unsubscribe", email: "person9@example.org", timestamp: 1785000002 }
  ];
  const { state: reduced } = reduceSendGridEvents(scoped, events, { now: "2026-07-26T23:00:00.000Z" });
  const after = {};
  for (const collection of SENDGRID_WEBHOOK_COLLECTIONS) after[collection] = reduced[collection];
  after[SENDGRID_WEBHOOK_HEALTH_COLLECTION] = updateSendGridWebhookHealth({}, { ok: true, counters: { received: 3 } }, { now: "2026-07-26T23:00:00.000Z" });
  const before = { ...scoped, [SENDGRID_WEBHOOK_HEALTH_COLLECTION]: {} };

  const written = coreMutationsBetween(before, after).length;
  // Independent change count: rows whose payload differs, counted without the store's diff.
  const changed = countChangedRows(before, after);
  assert.ok(changed >= 4, `the batch must genuinely change rows (changed=${changed})`);
  assert.ok(written <= changed * MAX_WRITE_AMPLIFICATION,
    `rows written (${written}) exceeds rows changed (${changed}) by more than ${MAX_WRITE_AMPLIFICATION}x`);
  assert.ok(written < totalRows / 100,
    `rows written (${written}) is within two orders of magnitude of the collection size (${totalRows}) — the snapshot rewrite is back`);
});

check("a batch that changes NOTHING (all-duplicate events) writes at most the health stamp", () => {
  const scoped = webhookScopedState(1000);
  // An event for an address that matches no contact and triggers no suppression.
  const { state: reduced } = reduceSendGridEvents(scoped, [{ event: "open", email: "nobody@example.org", timestamp: 1785000003 }], { now: "2026-07-26T23:00:00.000Z" });
  const after = {};
  for (const collection of SENDGRID_WEBHOOK_COLLECTIONS) after[collection] = reduced[collection];
  const written = coreMutationsBetween(scoped, after).length;
  assert.equal(written, 0, "no material change may write no rows at all (health rides separately)");
});

function countChangedRows(before, after) {
  let changed = 0;
  for (const collection of Object.keys(after)) {
    const beforeValue = before[collection];
    const afterValue = after[collection];
    if (Array.isArray(afterValue)) {
      const beforeById = new Map((Array.isArray(beforeValue) ? beforeValue : []).map((row, index) => [String(row.id || row.contact_id || index), JSON.stringify(row)]));
      const seen = new Set();
      afterValue.forEach((row, index) => {
        const key = String(row.id || row.contact_id || index);
        seen.add(key);
        if (beforeById.get(key) !== JSON.stringify(row)) changed += 1;
      });
      for (const key of beforeById.keys()) if (!seen.has(key)) changed += 1;
    } else if (JSON.stringify(beforeValue || {}) !== JSON.stringify(afterValue || {})) {
      changed += 1;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// 2. The heartbeat closing write: engines spread freely, the write stays narrow
// ---------------------------------------------------------------------------------------------

check("an idle-ish tick over a large state writes the ledger and the real change, nothing else", async () => {
  const { runHeartbeat } = await import("./heartbeat.mjs");
  const bigCollection = Array.from({ length: 1500 }, (unused, index) => ({ id: `task-${index}`, title: `Task ${index}`, status: "open", _version: 5 }));
  let state = { tasks: bigCollection, heartbeatRuns: [], heartbeatLease: null, autopilotSettings: {} };

  let capturedBefore = null;
  let capturedAfter = null;
  const store = {
    async readState() { return { ...state, tasks: [...state.tasks] }; },
    async writeCollections(patch) { state = { ...state, ...patch }; },
    async writeChanges(before, after) { capturedBefore = before; capturedAfter = after; state = { ...state, ...after }; return state; },
    async mutateCollectionItem(collection, itemId, mutate) { state = { ...state, [collection]: await mutate(state[collection]) }; return { state }; }
  };

  // An engine in the worst faith the contract allows: it spread-copies EVERY row (new array,
  // new objects, identical payloads) and materially changes exactly one.
  const engine = {
    id: "amplification-probe",
    cadence: "hourly",
    plan(current) {
      const tasks = current.tasks.map((task) => ({ ...task }));
      tasks[7] = { ...tasks[7], status: "done" };
      return { state: { ...current, tasks }, proposals: [], observations: [] };
    }
  };

  const result = await runHeartbeat({ store, registry: [engine], env: {}, now: new Date("2026-07-27T14:00:00.000Z"), runId: "amp-probe-run" });
  assert.equal(result.ok, true, "the tick must complete");
  assert.ok(capturedAfter, "the closing write must go through writeChanges — writeCollections is the amplification path");

  const written = coreMutationsBetween(capturedBefore, capturedAfter).length;
  // Changed for real: one task + one heartbeatRuns ledger entry.
  const changed = 2;
  assert.ok(written <= changed * MAX_WRITE_AMPLIFICATION,
    `rows written (${written}) exceeds rows changed (${changed}) by more than ${MAX_WRITE_AMPLIFICATION}x`);
  assert.ok(written < bigCollection.length / 100,
    `rows written (${written}) approaches the presented collection size (${bigCollection.length}) — the snapshot rewrite is back`);
});

// ---------------------------------------------------------------------------------------------
// 3. The store emits the ratio in production telemetry
// ---------------------------------------------------------------------------------------------

check("writeChanges telemetry reports rowsConsidered, rowsChanged and amplification 1.0", async () => {
  const { startFakeSupabase } = await import("./test-support/fake-supabase-server.mjs");
  const fake = await startFakeSupabase({
    rows: Array.from({ length: 300 }, (unused, index) => ({ collection: "tasks", item_id: `task-${index}`, payload: { id: `task-${index}`, title: `T${index}`, status: "open" } }))
  });
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "amplification-guard-test-key";
  const storage = await import("./storage.mjs");
  const lines = [];
  storage.setCoreMutationTelemetrySinkForTests((line) => lines.push(line));
  try {
    const store = new storage.SupabaseCoreStore({});
    const before = { tasks: Array.from({ length: 300 }, (unused, index) => ({ id: `task-${index}`, title: `T${index}`, status: "open", _version: 1 })) };
    const after = { tasks: before.tasks.map((task, index) => index === 3 ? { ...task, status: "done" } : task) };
    await store.writeChanges(before, after);
    const line = lines.find((entry) => entry.operationClass === "writeChanges");
    assert.ok(line, "writeChanges must emit a telemetry line");
    assert.equal(line.mutationCount, 1, "one changed row, one mutation");
    assert.equal(line.rowsConsidered, 300, "the line must show what a snapshot write would have cost");
    assert.equal(line.rowsChanged, 1);
    assert.equal(line.amplification, 1, "written == changed is the healthy baseline");
  } finally {
    storage.setCoreMutationTelemetrySinkForTests(null);
    process.env.SUPABASE_URL = previousUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    await fake.stop();
  }
});

// ---------------------------------------------------------------------------------------------
// 4. The two hot paths are structurally pinned to the diff write
// ---------------------------------------------------------------------------------------------

check("the SendGrid webhook batch write goes through writeChanges, never a snapshot write", () => {
  const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  // The handler condition, not the route string — the same literal also sits in the
  // public-paths and csrf-exempt lists far earlier in the file.
  const start = source.indexOf('url.pathname === "/api/outreach/webhooks/sendgrid"');
  assert.ok(start > 0, "webhook handler must exist");
  const block = source.slice(start, source.indexOf('url.pathname === "/api/outreach/approve"', start));
  assert.ok(block.includes("store.writeChanges(changedBefore, changedAfter)"),
    "the batch write must be the row diff");
  // The ONLY writeCollections left in the handler is the one-row health stamp on the error
  // path (recordWebhookHealth). A second one means the snapshot write came back.
  const snapshotWrites = block.split("store.writeCollections(").length - 1;
  assert.ok(snapshotWrites <= 1, `webhook handler has ${snapshotWrites} snapshot writes; only the error-path health stamp is allowed`);
});

check("the heartbeat closing write goes through writeChanges, never a snapshot write", () => {
  const source = readFileSync(new URL("./heartbeat.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("store.writeChanges(patchBefore, patch)"),
    "the closing write must hand the store before/after for a row diff");
  assert.ok(!source.includes("store.writeCollections("),
    "no snapshot write may remain in the heartbeat");
});

console.log(`Write-amplification guard: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
