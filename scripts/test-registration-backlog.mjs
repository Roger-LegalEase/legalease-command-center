#!/usr/bin/env node
// Slice 4 registration backlog tests — the silent-drop trap, swept once and pinned.
//
// coreRecordsFromState() only persists collections listed in coreStateCollections, so a
// collection the app writes but never registered is silently dropped on every Supabase write
// and vanishes on the next read (this killed state.settings in #26 and the product-event
// collections in #30). The 2026-07-08 sweep found 24 written-but-unregistered collections:
// the JsonStore convenience-method collections, every growthCollections member the operator
// can upsert (milestones, complianceItems, the full soc2 family), and eight direct
// route/engine writes. These tests pin:
//   1. All 24 are registered, list-shaped (none misclassified as singletons).
//   2. Every member of preview-server's growthCollections set is registered — the upsert
//      route writes by computed key, so a future growth collection that skips registration
//      re-opens the trap.
//   3. postImages payloads are compacted on the Supabase path exactly like the local-file
//      path (data: URIs stripped, the small local branded-placeholder SVG kept), so
//      registration cannot push base64 image rows.
//   4. Rows for the new collections keep stable per-item keys (never the index fallback that
//      shredded reactivationContacts under concurrent writes).
//   5. assetBundles stays UNREGISTERED on purpose: seed/read-only, no write site. If this
//      assert fails because a writer was added, register it instead of deleting the assert.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { coreStateCollections, singletonCollections, coreRecordsFromState } from "./storage.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

console.log("Registration backlog tests");

const backlog = [
  // JsonStore convenience methods
  "library", "brandAssets", "brandRules", "generationProfiles", "publishEvents", "postImages",
  // upsertGrowthItem computed-key writes
  "milestones", "complianceItems", "soc2AccessReviews", "soc2Changes", "soc2Vendors",
  "soc2Incidents", "soc2Evidence", "soc2Policies", "soc2ControlOwners", "soc2TypeIChecklist",
  // direct route/engine writes
  "campaignKits", "emailDrafts", "externalActionOutbox", "generationBatches", "syncRuns",
  "googleInsights", "dailyRunPublisherRuns", "handoffContractPreviews"
];

// ---- 1. Every backlog collection is registered, list-shaped -----------------------------------
{
  for (const collection of backlog) {
    assert(coreStateCollections.includes(collection), `${collection} must be in coreStateCollections`);
    assert(!singletonCollections.has(collection), `${collection} is a list, not a singleton`);
  }
  assert.equal(new Set(coreStateCollections).size, coreStateCollections.length, "no duplicate registrations");
  ok(`all ${backlog.length} backlog collections registered as lists, registry duplicate-free`);
}

// ---- 2. growthCollections ⊆ coreStateCollections (computed-key upsert route) -------------------
{
  const src = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const start = src.indexOf("const growthCollections = new Set([");
  assert(start >= 0, "growthCollections set found in preview-server.mjs");
  const literal = src.slice(start, src.indexOf("])", start));
  const members = [...literal.matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
  assert(members.length >= 15, "growthCollections literal parsed");
  for (const collection of members) {
    assert(coreStateCollections.includes(collection), `growth collection ${collection} must be registered or upsertGrowthItem writes are dropped on Supabase`);
  }
  ok(`every growthCollections member (${members.length}) is registered`);
}

// ---- 3. postImages compaction on the Supabase row path ----------------------------------------
{
  const bigPng = "data:image/png;base64," + "A".repeat(20000);
  const placeholderSvg = "data:image/svg+xml;utf8," + "<svg>".padEnd(200, "x");
  const rows = coreRecordsFromState({
    postImages: [
      { id: "img-remote", imageUrl: "https://cdn.example.com/a.png", finalImageUrl: bigPng },
      { id: "img-inline", imageUrl: bigPng, finalPngUrl: bigPng },
      { id: "img-placeholder", generationMode: "local_branded_placeholder", imageUrl: placeholderSvg }
    ]
  }).filter((row) => row.collection === "postImages");
  const byId = new Map(rows.map((row) => [row.item_id, row.payload]));
  assert.equal(rows.length, 3, "three postImage rows produced");
  assert.equal(byId.get("img-remote").imageUrl, "https://cdn.example.com/a.png", "http URLs pass through");
  assert.equal(byId.get("img-remote").finalImageUrl, "", "data: URI finalImageUrl stripped");
  assert.equal(byId.get("img-inline").imageUrl, "", "data: URI imageUrl stripped");
  assert.equal(byId.get("img-inline").finalPngUrl, "", "data: URI finalPngUrl stripped");
  assert.equal(byId.get("img-placeholder").imageUrl, placeholderSvg, "local branded-placeholder SVG kept");
  for (const row of rows) {
    assert(JSON.stringify(row.payload).length < 5000, "no oversized payload reaches the row set");
  }
  ok("postImages rows are compacted (data: URIs stripped, placeholder SVG kept)");
}

// ---- 4. Stable row keys for every backlog collection (no index fallback) ----------------------
{
  const state = Object.fromEntries(backlog.map((collection) => [
    collection,
    [{ id: `${collection}-item-1` }, { id: `${collection}-item-2` }]
  ]));
  const rows = coreRecordsFromState(state);
  for (const collection of backlog) {
    const ids = rows.filter((row) => row.collection === collection).map((row) => row.item_id).sort();
    assert.deepEqual(ids, [`${collection}-item-1`, `${collection}-item-2`], `${collection} rows keyed by item id, not index`);
  }
  ok("rows for all backlog collections use stable per-item ids");
}

// ---- 5. assetBundles stays out until something writes it --------------------------------------
{
  assert(!coreStateCollections.includes("assetBundles"), "assetBundles is seed/read-only with no write site; register it (and update this test) only when a writer exists");
  ok("assetBundles deliberately unregistered (no writer exists)");
}

console.log(`registration backlog tests passed (${passed} checks).`);
