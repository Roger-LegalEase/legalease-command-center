// TEMPORARY diagnostic for the heartbeat's closing write. Remove once the cause is fixed.
//
// Why this exists: three attempts to explain ~4,000 rewritten rows per tick were made offline
// against a database dump, and all three failed to reproduce it on a single row. That means the
// dump and the live read path differ. This runs INSIDE the tick, on exactly the objects
// writeChanges is about to compare, and prints what actually differs.
//
// PII: no raw string value is ever printed. Every string leaf is replaced by its length and a
// short hash, which is enough to tell "same" from "different" and enough to see key ORDER,
// while carrying no email, name, or phone number.

import { createHash } from "node:crypto";
import { coreRecordsFromState, coreMutationsBetween } from "./storage.mjs";

const MAX_SAMPLE_ROWS = 10;
const MAX_PATHS_PER_ROW = 12;

function redact(value) {
  if (typeof value === "string") {
    return `s:${value.length}:${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    // Key order is PRESERVED deliberately — a key-order difference is one of the hypotheses.
    const out = {};
    for (const key of Object.keys(value)) out[key] = redact(value[key]);
    return out;
  }
  return value;
}

// Every path where the two values differ, compared structurally.
function differingPaths(before, after, path = "", found = []) {
  if (found.length >= MAX_PATHS_PER_ROW) return found;
  const bothObjects = before && after && typeof before === "object" && typeof after === "object"
    && Array.isArray(before) === Array.isArray(after);
  if (!bothObjects) {
    if (JSON.stringify(before) !== JSON.stringify(after)) found.push(path || "(root)");
    return found;
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const key of keys) {
    differingPaths(before[key], after[key], path ? `${path}.${key}` : key, found);
    if (found.length >= MAX_PATHS_PER_ROW) break;
  }
  return found;
}

// Key-order-insensitive serialization, so we can distinguish "different content" from
// "same content, different key order" — the specific question this diagnostic must settle.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function logHeartbeatWriteDiagnostic(before = {}, after = {}, { runId = "", log = console.log } = {}) {
  try {
    const mutations = coreMutationsBetween(before, after);
    const perCollection = {};
    for (const mutation of mutations) {
      perCollection[mutation.collection] = perCollection[mutation.collection] || { changed: 0, considered: 0 };
      perCollection[mutation.collection].changed += 1;
    }
    const afterRows = coreRecordsFromState(after);
    for (const row of afterRows) {
      if (perCollection[row.collection]) perCollection[row.collection].considered += 1;
    }
    log(JSON.stringify({ level: "warn", event: "heartbeat_write_diagnostic", stage: "per_collection", runId, perCollection }));

    const largest = Object.entries(perCollection).sort((a, b) => b[1].changed - a[1].changed)[0];
    if (!largest) return;
    const [collection] = largest;

    const beforeByKey = new Map(coreRecordsFromState(before).filter((r) => r.collection === collection).map((r) => [r.item_id, r]));
    const changedIds = mutations.filter((m) => m.collection === collection).slice(0, MAX_SAMPLE_ROWS).map((m) => m.item_id);

    let orderOnly = 0;
    let realContent = 0;
    let noPrior = 0;
    for (const itemId of changedIds) {
      const prior = beforeByKey.get(itemId);
      const next = afterRows.find((r) => r.collection === collection && r.item_id === itemId);
      if (!prior) { noPrior += 1; continue; }
      const sameStable = stable(prior.payload) === stable(next.payload);
      if (sameStable) orderOnly += 1; else realContent += 1;
      log(JSON.stringify({
        level: "warn",
        event: "heartbeat_write_diagnostic",
        stage: "row_sample",
        runId,
        collection,
        // The row id is a derived hash in this collection, but redact it anyway.
        itemIdHash: createHash("sha256").update(String(itemId)).digest("hex").slice(0, 10),
        // THE question: identical content in a different key order, or genuinely different?
        identicalIgnoringKeyOrder: sameStable,
        differingPaths: differingPaths(prior.payload, next.payload),
        storedKeyOrder: Object.keys(prior.payload || {}),
        projectedKeyOrder: Object.keys(next.payload || {}),
        stored: redact(prior.payload),
        projected: redact(next.payload)
      }));
    }
    log(JSON.stringify({
      level: "warn", event: "heartbeat_write_diagnostic", stage: "summary", runId, collection,
      sampled: changedIds.length, identicalIgnoringKeyOrder: orderOnly, genuinelyDifferent: realContent, rowsWithNoPrior: noPrior
    }));
  } catch (error) {
    log(JSON.stringify({ level: "warn", event: "heartbeat_write_diagnostic", stage: "failed", runId, error: String(error?.message || error).slice(0, 300) }));
  }
}
