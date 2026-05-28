import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDataModelInventory,
  checkStateIntegrity,
  createStateSnapshot,
  restoreStateDryRun,
  saveStateSnapshotFile
} from "./state-integrity.mjs";

const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");

const validState = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false },
      instagram: { enabled: false }
    }
  },
  captureInbox: [
    {
      id: "capture-1",
      date: "2026-05-27",
      raw_input: "Task: confirm dashboard owner.",
      capture_type: "task",
      inferred_type: "task",
      review_state: "routed",
      routed_to: ["tasks"],
      created_at: "2026-05-27T09:00:00.000Z",
      updated_at: "2026-05-27T09:10:00.000Z"
    }
  ],
  tasks: [
    {
      id: "task-1",
      title: "Confirm dashboard owner",
      status: "blocked",
      priority: "high",
      created_at: "2026-05-27T09:15:00.000Z",
      updated_at: "2026-05-27T10:00:00.000Z",
      blocker_reason: "Owner is not confirmed."
    }
  ],
  conversationNotes: [],
  morningBriefs: [
    { key: "morning-brief-2026-05-27", date: "2026-05-27", generated_at: "2026-05-27T08:00:00.000Z" }
  ],
  eveningReflections: [
    { key: "evening-reflection-2026-05-27", date: "2026-05-27", generated_at: "2026-05-27T18:00:00.000Z" }
  ],
  operatingMemory: [
    { key: "operating-memory-2026-05-27", date: "2026-05-27", generated_at: "2026-05-27T19:00:00.000Z" }
  ],
  dailyCloseouts: [
    { key: "daily-closeout-2026-05-27", date: "2026-05-27", generated_at: "2026-05-27T20:00:00.000Z" }
  ],
  reviewStates: [],
  auditHistory: [
    { id: "audit-1", action: "task blocked", timestamp: "2026-05-27T10:00:00.000Z" }
  ],
  activityEvents: [
    { id: "activity-1", eventType: "Task blocked", title: "Task blocked", createdAt: "2026-05-27T10:00:00.000Z" }
  ],
  partnerPrograms: [
    { id: "partner-program-rcap", slug: "rcap", name: "RCAP", status: "activation_review" }
  ],
  partnerProgramArtifacts: [
    { key: "rcap-proposal-draft-v1", title: "RCAP Proposal Draft", review_state: "review_required", status: "draft" }
  ],
  evidencePackNotes: [
    { key: "rcap-production-activation-evidence-v1", title: "RCAP Evidence Note", status: "recorded" }
  ],
  reports: [
    { key: "rcap-weekly-report-draft-v1", title: "RCAP Weekly Report Draft", status: "draft" }
  ],
  dataRoomItems: [],
  osHealthSnapshots: [],
  handoffPackets: [
    { key: "rcap-handoff-packet-v1", title: "RCAP Internal Handoff Packet", status: "internal_only" }
  ],
  settings: {
    publicValue: "ok",
    COMMAND_CENTER_OWNER_TOKEN: "do-not-export",
    nested: { apiKey: "do-not-export" }
  }
};

const inventory = buildDataModelInventory();
assert(inventory.length >= 18, "Data model inventory should cover major LegalEase OS collections.");
for (const collectionName of ["captureInbox", "tasks", "morningBriefs", "dailyCloseouts", "auditHistory", "activityEvents", "partnerPrograms", "partnerProgramArtifacts", "evidencePackNotes", "reports", "dataRoomItems", "osHealthSnapshots", "handoffPackets"]) {
  const entry = inventory.find(item => item.collection === collectionName);
  assert(entry, `${collectionName} should be in the inventory.`);
  assert(entry.purpose, `${collectionName} inventory entry should document purpose.`);
  assert(entry.storage_mode, `${collectionName} inventory entry should document storage mode.`);
  assert(Array.isArray(entry.required_fields), `${collectionName} should list required fields.`);
  assert(Array.isArray(entry.stable_key_fields), `${collectionName} should list stable key fields.`);
  assert(entry.idempotency_rules, `${collectionName} should document idempotency rules.`);
  assert(entry.audit_behavior, `${collectionName} should document audit behavior.`);
  assert(Array.isArray(entry.related_tests), `${collectionName} should list related tests.`);
  assert(entry.duplicate_risk_level, `${collectionName} should document duplicate risk level.`);
}

const validReport = checkStateIntegrity(validState);
assert.equal(validReport.ok, true, "Valid fixture state should pass integrity checks.");
assert.equal(validReport.live_gates_count, 0, "Live gates must remain 0.");
assert.equal(validReport.summary.errors, 0, "Valid fixture should not have errors.");

const missingRequired = checkStateIntegrity({ ...validState, tasks: [{ id: "task-missing-status", title: "Missing status" }] });
assert.equal(missingRequired.ok, false, "Integrity check should detect missing required task fields.");
assert(missingRequired.errors.some(item => /tasks.*status/i.test(item.message)), "Missing required field warning should mention task status.");

const duplicateKeys = checkStateIntegrity({
  ...validState,
  morningBriefs: [
    ...validState.morningBriefs,
    { key: "morning-brief-2026-05-27", date: "2026-05-27", generated_at: "2026-05-27T08:10:00.000Z" }
  ]
});
assert.equal(duplicateKeys.ok, false, "Integrity check should detect duplicate stable keys.");
assert(duplicateKeys.errors.some(item => /duplicate/i.test(item.message)), "Duplicate warning should be explicit.");

const duplicateDaily = checkStateIntegrity({
  ...validState,
  dailyCloseouts: [
    ...validState.dailyCloseouts,
    { key: "daily-closeout-duplicate", date: "2026-05-27", generated_at: "2026-05-27T20:05:00.000Z" }
  ]
});
assert.equal(duplicateDaily.ok, false, "Daily records should be unique by date.");

const badReviewState = checkStateIntegrity({
  ...validState,
  partnerProgramArtifacts: [{ key: "bad-review-state", title: "Bad review", review_state: "externally_published" }]
});
assert.equal(badReviewState.ok, false, "Invalid review states should fail integrity checks.");

const badTaskStatus = checkStateIntegrity({
  ...validState,
  tasks: [{ ...validState.tasks[0], status: "emailed" }]
});
assert.equal(badTaskStatus.ok, false, "Invalid task statuses should fail integrity checks.");

const secretReport = checkStateIntegrity(validState);
assert(secretReport.warnings.some(item => /secret/i.test(item.message)), "Integrity check should warn about obvious secret-like fields.");

const snapshot = createStateSnapshot(validState, { now: "2026-05-27T21:00:00.000Z" });
const snapshotText = JSON.stringify(snapshot);
assert.equal(snapshot.live_gates_count, 0, "Snapshot should include live gates count.");
assert(snapshot.collection_counts.tasks === 1, "Snapshot should include collection counts.");
assert.equal(snapshot.no_external_actions_confirmation, "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no external systems contacted.", "Snapshot should confirm no external actions.");
assert(!snapshotText.includes("do-not-export"), "Snapshot should redact secret values.");
assert(snapshotText.includes("[REDACTED]"), "Snapshot should mark redacted secret fields.");

const tempDir = await mkdtemp(path.join(os.tmpdir(), "leos-state-integrity-"));
try {
  const exportResult = await saveStateSnapshotFile(validState, {
    now: "2026-05-27T21:00:00.000Z",
    outputDir: tempDir
  });
  assert(exportResult.filePath.endsWith(".json"), "Export should write a JSON snapshot file.");
  const exported = JSON.parse(await readFile(exportResult.filePath, "utf8"));
  assert.equal(exported.generated_at, "2026-05-27T21:00:00.000Z", "Export should keep generated_at.");
  assert.equal(exported.live_gates_count, 0, "Export should keep live gates count.");

  const beforeDryRun = JSON.stringify(validState);
  const dryRun = await restoreStateDryRun(exportResult.filePath, { currentState: validState });
  assert.equal(dryRun.valid, true, "Restore dry run should validate exported snapshot.");
  assert.equal(dryRun.mutated, false, "Restore dry run must not mutate state.");
  assert.equal(JSON.stringify(validState), beforeDryRun, "Restore dry run must leave current state unchanged.");
  assert(dryRun.would_restore.collections.tasks === 1, "Restore dry run should report collection counts.");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

assert(serverSource.includes("function cockpitDataIntegrityHtml"), "Cockpit Data Integrity card must render.");
assert(serverSource.includes("dataIntegrityPageHtml"), "#data-integrity route renderer must exist.");
assert(serverSource.includes("\"data-integrity\""), "#data-integrity route must be registered.");
assert(serverSource.includes("Data Model Inventory"), "Data Integrity page should render inventory.");
assert(serverSource.includes("Integrity Status"), "Data Integrity page should render integrity status.");
assert(serverSource.includes("Duplicate Warnings"), "Data Integrity page should render duplicate warnings.");
assert(serverSource.includes("Latest Export Snapshot"), "Data Integrity page should render latest export snapshot.");
assert(serverSource.includes("Refresh Data Integrity"), "Data Integrity page should expose internal refresh action.");
assert(!/data-integrity[\s\S]{0,2800}(send email|publish page|activate dashboard|enable live|Partner Journey API)/i.test(serverSource), "Data Integrity must not expose external controls.");

console.log("State Integrity tests passed.");
