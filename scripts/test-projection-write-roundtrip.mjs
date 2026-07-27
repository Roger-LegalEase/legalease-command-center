// A no-op projection must write NOTHING — proven through the real storage read path.
//
// This test exists because three fixes for the same bug were "verified" against freshly
// constructed objects that never touched the database, and the bug survived all three. The
// symptom in production was that ~3,565 companyContacts rows were rewritten every hour with
// exactly one field different, `updatedAt`, on rows nothing had touched.
//
// The cause could not be reproduced by comparing hand-built rows because it needs TWO things at
// once: a row that came back out of storage, and a contact that is upserted more than once in a
// single projection (a person present in several source collections). An early pass changes a
// field, a later pass sets it back, and every pass in between restamps the timestamp. The net
// content matches storage; the timestamp does not.
//
// So this test persists, reads back, and projects again. Anything less does not catch it.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.STORAGE_BACKEND = "json";
process.env.COMMAND_CENTER_ALLOW_JSON = "true";
process.env.LOCAL_DEMO_MODE = "true";
process.env.SKIP_ENV_LOCAL_FILE = "1";
const dir = mkdtempSync(path.join(tmpdir(), "projection-roundtrip-"));
process.env.COMMAND_CENTER_DATA_PATH = path.join(dir, "state.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(dir, "seed.json");
writeFileSync(process.env.COMMAND_CENTER_SEED_PATH, "{}");

// The shape that matters: ONE person, in TWO source collections, whose names disagree — so the
// projector upserts the same row twice in one pass.
writeFileSync(process.env.COMMAND_CENTER_DATA_PATH, JSON.stringify({
  reactivationContacts: [{ contact_id: "r1", email: "person@example.org", full_name: "pat lower", updated_at: "2026-07-01T00:00:00.000Z" }],
  expungementLifecycleContacts: [{ lifecycle_contact_id: "e1", email: "person@example.org", first_name: "Pat", lifecycle_stage: "screening", payment_status: "unpaid" }],
  companyContacts: [], companyOrganizations: [], queueItems: [], companyEvents: [], agentRuns: []
}, null, 2));

const { createStore, coreMutationsBetween } = await import("./storage.mjs");
const { projectCompanyMemory } = await import("./company-memory-projector.mjs");

const store = await createStore({
  settings: {}, library: [], brandAssets: [], brandRules: [], generationProfiles: [],
  assetBundles: [], socialAccounts: [], postImages: [], publishEvents: []
});

const PROJECTED = ["companyContacts", "companyOrganizations", "queueItems"];
const slice = (state) => Object.fromEntries(PROJECTED.map((name) => [name, state[name]]));

// Tick 1 — project and persist, exactly as the heartbeat's closing write does.
const first = await store.readState();
const projectedFirst = projectCompanyMemory(first, {}).state;
await store.writeChanges(slice(first), slice(projectedFirst));
assert.ok(projectedFirst.companyContacts.length >= 1, "the fixture must actually project a contact");

// Tick 2 — read back FROM STORAGE and project again. No source record changed.
const second = await store.readState();
const projectedSecond = projectCompanyMemory(second, {}).state;
const mutations = coreMutationsBetween(second, projectedSecond);

if (mutations.length) {
  const stored = second.companyContacts[0] || {};
  const next = projectedSecond.companyContacts[0] || {};
  const differing = Object.keys({ ...stored, ...next }).filter((key) => JSON.stringify(stored[key]) !== JSON.stringify(next[key]));
  assert.fail(`A no-op projection rewrote ${mutations.length} row(s) after a storage round-trip. Differing fields: ${differing.join(", ") || "(none — key order?)"}`);
}
console.log("  ✓ a no-op projection writes nothing after a real storage round-trip");

// And a genuine change must still be written, or the fix would be a silent data-loss bug.
// Change the LAST source pass to win, since a later upsert overwrites an earlier one's name.
const third = await store.readState();
third.expungementLifecycleContacts = [{ ...third.expungementLifecycleContacts[0], first_name: "Patricia" }];
const projectedThird = projectCompanyMemory(third, {}).state;
const realMutations = coreMutationsBetween(third, projectedThird)
  .filter((mutation) => mutation.collection === "companyContacts");
assert.ok(realMutations.length >= 1, "a genuine source change must still produce a write");
console.log("  ✓ a genuine change is still written");

// A row that reads back with its keys in a different order is NOT a change. Postgres jsonb does
// not preserve key order, so without this every such row is rewritten every tick, forever.
// Production measured 166 agentRuns rows in exactly this state.
const reordered = { agentRuns: [{ id: "x", alpha: 1, beta: { one: 1, two: 2 } }] };
const sameContentOtherOrder = { agentRuns: [{ beta: { two: 2, one: 1 }, id: "x", alpha: 1 }] };
assert.equal(
  coreMutationsBetween(reordered, sameContentOtherOrder).length, 0,
  "identical content in a different key order must not count as a change"
);
const genuinelyDifferent = { agentRuns: [{ beta: { two: 2, one: 99 }, id: "x", alpha: 1 }] };
assert.equal(
  coreMutationsBetween(reordered, genuinelyDifferent).length, 1,
  "a real value change must still count, or the comparison would hide writes"
);
console.log("  ✓ key order alone is not a change; a real value change still is");

console.log("projection write round-trip: 3 checks passed");
