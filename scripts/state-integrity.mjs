import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const noExternalActionsConfirmation = "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no external systems contacted.";

const validReviewStates = new Set(["review_required", "in_review", "approved", "needs_revision", "blocked", "handoff_ready", "reviewed", "routed", "ignored", ""]);
const validTaskStatuses = new Set(["open", "in_progress", "waiting", "blocked", "done", "archived", "dismissed", ""]);
const validCaptureRoutes = new Set(["tasks", "conversationNotes", "operatingMemory", "morningBriefInputs", "eveningReflectionInputs", "evidenceNotes", "partnerUpdates", "ideas"]);
const secretKeyPattern = /(secret|token|api[_-]?key|password|credential|authorization|service[_-]?role|webhook[_-]?secret)/i;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function collectionCount(state = {}, collection = "") {
  const value = state[collection];
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return 1;
  return 0;
}

function firstValue(item = {}, fields = []) {
  for (const field of fields) {
    if (item?.[field] !== undefined && item?.[field] !== null && String(item[field]).trim() !== "") return item[field];
  }
  return "";
}

function stableValue(item = {}, fields = []) {
  return String(firstValue(item, fields) || "").trim();
}

function issue(severity, collection, message, itemId = "") {
  return { severity, collection, message, itemId };
}

export function buildDataModelInventory() {
  return [
    {
      collection: "captureInbox",
      purpose: "Unified Le-E Quick Capture intake for tasks, blockers, decisions, risks, notes, and routing.",
      storage_mode: "hybrid",
      required_fields: ["id", "raw_input", "capture_type", "review_state", "created_at"],
      optional_fields: ["date", "source_label", "inferred_type", "summary", "priority", "linked_partner", "linked_workflow", "suggested_routes", "routed_to", "updated_at"],
      stable_key_fields: ["id"],
      idempotency_rules: "Capture ids must be unique. Routed destinations must not duplicate within one capture.",
      audit_behavior: "Create auditHistory and activityEvents entries on capture, review, route, or ignore.",
      related_routes: ["#overview", "#capture-inbox"],
      related_tests: ["scripts/test-lee-quick-capture.mjs", "scripts/test-full-daily-workflow.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "roleAssignments",
      purpose: "Internal role assignments for owner, admin, operator, and viewer access after hosted owner-token auth.",
      storage_mode: "hybrid",
      required_fields: ["id", "actor_id", "display_name", "role", "status", "created_at", "updated_at", "created_by"],
      optional_fields: ["email", "notes"],
      stable_key_fields: ["actor_id"],
      idempotency_rules: "One active assignment per actor_id. The default owner assignment must remain active.",
      audit_behavior: "Every role change creates auditHistory and activityEvents entries.",
      related_routes: ["#roles", "#os-health"],
      related_tests: ["scripts/test-role-system.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "critical"
    },
    {
      collection: "tasks",
      purpose: "Internal work Roger can view, filter, and transition without external side effects.",
      storage_mode: "hybrid",
      required_fields: ["id", "title", "status", "created_at"],
      optional_fields: ["description", "owner", "priority", "due_date", "source", "sourceId", "linked_partner", "linked_workflow", "risk_level", "blocker_reason", "review_state", "updated_at", "history"],
      stable_key_fields: ["id"],
      idempotency_rules: "Task ids must be unique. Capture-routed tasks use sourceId to avoid duplicates.",
      audit_behavior: "Every task state transition creates auditHistory and activityEvents entries.",
      related_routes: ["#tasks", "#tasks-today", "#tasks-blocked", "#tasks-waiting", "#tasks-this-week"],
      related_tests: ["scripts/test-task-management.mjs", "scripts/test-full-daily-workflow.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "conversationNotes",
      purpose: "Internal reviewed context notes used by Le-E rituals and memory.",
      storage_mode: "hybrid",
      required_fields: ["id", "raw_note", "review_state", "created_at"],
      optional_fields: ["date", "source_type", "source_label", "summary", "classification", "priority", "linked_workflow", "linked_partner", "updated_at"],
      stable_key_fields: ["id"],
      idempotency_rules: "Note ids must be unique.",
      audit_behavior: "Review/apply/ignore actions create audit and activity entries.",
      related_routes: ["#conversation-notes"],
      related_tests: ["scripts/test-lee-conversation-context.mjs", "scripts/test-lee-quick-capture.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "morningBriefs",
      purpose: "Idempotent daily Mission Today, Top 3, decisions, risks, and first move.",
      storage_mode: "hybrid",
      required_fields: ["key", "date", "generated_at"],
      optional_fields: ["mission_today", "top_3_actions", "decisions_needed", "waiting_on", "risks", "do_not_touch", "suggested_first_move", "source_counts"],
      stable_key_fields: ["key"],
      idempotency_rules: "Exactly one Morning Brief per date. Stable key format morning-brief-YYYY-MM-DD.",
      audit_behavior: "Saving today's brief creates auditHistory and activityEvents entries.",
      related_routes: ["#morning-brief"],
      related_tests: ["scripts/test-daily-rituals.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "eveningReflections",
      purpose: "Idempotent end-of-day reflection used by closeout and memory.",
      storage_mode: "hybrid",
      required_fields: ["key", "date", "generated_at"],
      optional_fields: ["moved_today", "decisions_made", "state_changes", "blockers_remaining", "carry_forward", "resurface_tomorrow", "notes_for_tomorrow"],
      stable_key_fields: ["key"],
      idempotency_rules: "Exactly one Evening Reflection per date. Stable key format evening-reflection-YYYY-MM-DD.",
      audit_behavior: "Saving reflection creates auditHistory and activityEvents entries.",
      related_routes: ["#evening-reflection"],
      related_tests: ["scripts/test-daily-rituals.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "operatingMemory",
      purpose: "Day-over-day memory of what moved, stayed blocked, carries forward, and resurfaces.",
      storage_mode: "hybrid",
      required_fields: ["key", "date", "generated_at"],
      optional_fields: ["moved_today", "decisions_made", "still_blocked", "carry_forward", "resurface_tomorrow", "do_not_carry_forward", "risk_notes"],
      stable_key_fields: ["key"],
      idempotency_rules: "Exactly one Operating Memory record per date. Stable key format operating-memory-YYYY-MM-DD.",
      audit_behavior: "Saving memory creates auditHistory and activityEvents entries.",
      related_routes: ["#operating-memory"],
      related_tests: ["scripts/test-operating-memory.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "dailyCloseouts",
      purpose: "Idempotent closeout plus Tomorrow Plan.",
      storage_mode: "hybrid",
      required_fields: ["key", "date", "generated_at"],
      optional_fields: ["moved_today", "decisions_made", "blocked_items", "carry_forward", "dropped_items", "risks", "tomorrow_mission", "tomorrow_top_3"],
      stable_key_fields: ["key"],
      idempotency_rules: "Exactly one Daily Closeout per date. Stable key format daily-closeout-YYYY-MM-DD.",
      audit_behavior: "Saving closeout creates auditHistory and activityEvents entries.",
      related_routes: ["#daily-closeout"],
      related_tests: ["scripts/test-daily-closeout.mjs", "scripts/test-full-daily-workflow.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "reviewStates",
      purpose: "Optional normalized review state transition records for internal artifacts.",
      storage_mode: "hybrid",
      required_fields: ["id", "review_state", "review_updated_at"],
      optional_fields: ["artifact_key", "review_updated_by", "review_notes", "blocker_reason", "revision_reason"],
      stable_key_fields: ["id", "artifact_key"],
      idempotency_rules: "One active review state per artifact key when normalized records are present.",
      audit_behavior: "Review transitions create auditHistory and activityEvents entries.",
      related_routes: ["#production-activation-rcap"],
      related_tests: ["scripts/test-review-approval-engine.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "auditHistory",
      purpose: "Append-only internal audit trail for state transitions and generated internal artifacts.",
      storage_mode: "hybrid",
      required_fields: ["id", "timestamp"],
      optional_fields: ["actor", "action", "resourceType", "resourceId", "beforeValue", "afterValue"],
      stable_key_fields: ["id"],
      idempotency_rules: "Audit ids should be unique. Entries should never contain secrets.",
      audit_behavior: "This is the audit log.",
      related_routes: ["#os-health", "#data-integrity"],
      related_tests: ["scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "activityEvents",
      purpose: "Readable internal activity stream for operational movement and ritual evidence.",
      storage_mode: "hybrid",
      required_fields: ["id"],
      optional_fields: ["eventType", "title", "summary", "createdAt", "metadata"],
      stable_key_fields: ["id"],
      idempotency_rules: "Activity ids should be unique. Entries should never imply external side effects unless true.",
      audit_behavior: "Generated alongside important internal actions.",
      related_routes: ["#os-health", "#data-integrity"],
      related_tests: ["scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "partnerPrograms",
      purpose: "Internal partner program operating records, including RCAP activation.",
      storage_mode: "hybrid",
      required_fields: ["id", "name"],
      optional_fields: ["slug", "status", "packageTier", "paymentStatus", "programGoal", "owner", "createdAt", "updatedAt"],
      stable_key_fields: ["id", "slug"],
      idempotency_rules: "Partner program ids/slugs should be unique. RCAP uses slug rcap.",
      audit_behavior: "Creation and important status changes create audit/activity entries.",
      related_routes: ["#partner-programs", "#production-activation-rcap"],
      related_tests: ["scripts/test-partner-program-engine.mjs", "scripts/test-rcap-production-activation.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "partnerProgramArtifacts",
      purpose: "Internal proposal, page, dashboard readiness, and handoff artifacts for partner programs.",
      storage_mode: "hybrid",
      required_fields: ["key", "title"],
      optional_fields: ["status", "review_state", "review_updated_at", "summary", "content", "artifactType"],
      stable_key_fields: ["key", "id"],
      idempotency_rules: "Artifact keys must be unique. RCAP artifacts use stable rcap-* keys.",
      audit_behavior: "Generation and review state changes create audit/activity entries.",
      related_routes: ["#production-activation-rcap", "#partner-proposals", "#partner-pages", "#partner-reports"],
      related_tests: ["scripts/test-rcap-review-workspace.mjs", "scripts/test-review-approval-engine.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "evidencePackNotes",
      purpose: "Internal proof/evidence notes for weekly packs, data room, and RCAP activation evidence.",
      storage_mode: "hybrid",
      required_fields: ["key", "title"],
      optional_fields: ["type", "status", "review_state", "notes", "createdAt", "updatedAt"],
      stable_key_fields: ["key", "id"],
      idempotency_rules: "Evidence note keys should be unique for generated artifacts.",
      audit_behavior: "Generated evidence notes create audit/activity entries.",
      related_routes: ["#proof", "#dataroom", "#production-activation-rcap"],
      related_tests: ["scripts/test-rcap-production-activation.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "reports",
      purpose: "Internal report drafts and report records, including weekly RCAP drafts.",
      storage_mode: "hybrid",
      required_fields: ["key", "title"],
      optional_fields: ["status", "review_state", "sections", "createdAt", "updatedAt"],
      stable_key_fields: ["key", "id"],
      idempotency_rules: "Generated report draft keys should be unique.",
      audit_behavior: "Report draft generation and review actions create audit/activity entries.",
      related_routes: ["#reports", "#partner-reports", "#production-activation-rcap"],
      related_tests: ["scripts/test-partner-program-engine.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "dataRoomItems",
      purpose: "Internal data room artifacts and saved proof/report outputs.",
      storage_mode: "hybrid",
      required_fields: ["id"],
      optional_fields: ["title", "type", "status", "createdAt", "updatedAt"],
      stable_key_fields: ["id", "key"],
      idempotency_rules: "Data room item ids should be unique.",
      audit_behavior: "Saving artifacts to Data Room creates audit/activity entries.",
      related_routes: ["#dataroom"],
      related_tests: ["scripts/test-soc2-export.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "osHealthSnapshots",
      purpose: "Saved internal OS health and self-test status snapshots.",
      storage_mode: "hybrid",
      required_fields: ["id", "generated_at", "overall_health"],
      optional_fields: ["connection_health", "workflow_health", "data_freshness", "trust_warnings", "self_test_status", "summary"],
      stable_key_fields: ["id"],
      idempotency_rules: "One OS Health snapshot per date. Stable id format os-health-YYYY-MM-DD.",
      audit_behavior: "Refresh creates auditHistory and activityEvents entries.",
      related_routes: ["#os-health"],
      related_tests: ["scripts/test-os-health-center.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "smokeTestRuns",
      purpose: "Internal post-deploy smoke test checklist runs for validating hosted usability after Render deploys.",
      storage_mode: "hybrid",
      required_fields: ["id", "overall_status", "started_at", "groups", "live_gates_count"],
      optional_fields: ["commit_hash", "environment", "completed_at", "checklist_items", "passed_count", "failed_count", "not_tested_count", "notes", "updated_at"],
      stable_key_fields: ["id"],
      idempotency_rules: "Smoke test runs are idempotent by run id so multiple deploy checks can happen on the same date.",
      audit_behavior: "Start, item updates, save, and finish create auditHistory and activityEvents entries.",
      related_routes: ["#smoke-test", "#os-health"],
      related_tests: ["scripts/test-smoke-test-center.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "evidenceSummaries",
      purpose: "Review-only internal proof room summaries generated from evidence notes, reports, Data Room artifacts, SOC 2 readiness evidence, audit history, and activity events.",
      storage_mode: "hybrid",
      required_fields: ["key", "title", "status", "generated_at", "live_gates_count"],
      optional_fields: ["overview", "evidence_sources", "data_room_index", "top_evidence_items", "missing_proof_warnings", "stale_evidence_warnings", "updated_at"],
      stable_key_fields: ["key", "id"],
      idempotency_rules: "Evidence summaries are idempotent per date. Stable key format evidence-summary-YYYY-MM-DD.",
      audit_behavior: "Generate Evidence Summary creates auditHistory and activityEvents entries.",
      related_routes: ["#evidence-room", "#os-health", "#dataroom"],
      related_tests: ["scripts/test-evidence-room.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "handoffPackets",
      purpose: "Internal Partner Journey handoff packet records. No external handoff is triggered here.",
      storage_mode: "hybrid",
      required_fields: ["key"],
      optional_fields: ["title", "status", "handoff_ready", "summary", "generated_at", "updated_at"],
      stable_key_fields: ["key", "id"],
      idempotency_rules: "One packet per activation key/version. RCAP uses rcap-handoff-packet-v1.",
      audit_behavior: "Generating/updating packet creates auditHistory and activityEvents entries.",
      related_routes: ["#production-activation-rcap"],
      related_tests: ["scripts/test-partner-handoff-readiness.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "productionActivationRuns",
      purpose: "Internal idempotent production activation run records and summaries.",
      storage_mode: "hybrid",
      required_fields: ["key"],
      optional_fields: ["status", "generated_at", "summary", "artifacts"],
      stable_key_fields: ["key", "id"],
      idempotency_rules: "Activation key must be unique. RCAP uses rcap-production-activation-v1.",
      audit_behavior: "Activation creates auditHistory and activityEvents entries.",
      related_routes: ["#production-activation-rcap", "#overview"],
      related_tests: ["scripts/test-rcap-production-activation.mjs", "scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "high"
    },
    {
      collection: "dataIntegritySnapshots",
      purpose: "Saved data model inventory and integrity check snapshots.",
      storage_mode: "hybrid",
      required_fields: ["id", "generated_at", "integrity_status"],
      optional_fields: ["collection_counts", "errors", "warnings", "inventory"],
      stable_key_fields: ["id"],
      idempotency_rules: "One Data Integrity snapshot per date. Stable id format data-integrity-YYYY-MM-DD.",
      audit_behavior: "Refresh creates auditHistory and activityEvents entries.",
      related_routes: ["#data-integrity"],
      related_tests: ["scripts/test-state-integrity.mjs"],
      duplicate_risk_level: "medium"
    },
    {
      collection: "codebaseHealthSnapshots",
      purpose: "B3 codebase-health monitor reports: read-only structural source audit findings (registration drift, dead/orphaned code, documentation/CI gaps), severity-ranked, with deltas since the last run.",
      storage_mode: "hybrid",
      required_fields: ["id", "generated_at", "status"],
      optional_fields: ["counts", "scan_error", "findings", "deltas", "scanned", "no_external_actions_confirmation"],
      stable_key_fields: ["id"],
      idempotency_rules: "One Codebase Health snapshot per date. Stable id format codebase-health-YYYY-MM-DD.",
      audit_behavior: "Each daily plan() run creates auditHistory and activityEvents entries. B3 has no act() path; it never modifies source files.",
      related_routes: ["#codebase-health"],
      related_tests: ["scripts/test-codebase-health.mjs"],
      duplicate_risk_level: "medium"
    }
  ];
}

const inventoryByCollection = new Map(buildDataModelInventory().map(item => [item.collection, item]));
const dailyCollections = new Set(["morningBriefs", "eveningReflections", "operatingMemory", "dailyCloseouts"]);

function validateRequiredFields(state = {}, errors = []) {
  for (const spec of buildDataModelInventory()) {
    const items = list(state[spec.collection]);
    for (const item of items) {
      for (const field of spec.required_fields) {
        if (firstValue(item, [field]) === "") {
          errors.push(issue("error", spec.collection, `${spec.collection} record is missing required field ${field}.`, stableValue(item, spec.stable_key_fields)));
        }
      }
    }
  }
}

function validateStableKeys(state = {}, errors = []) {
  for (const spec of buildDataModelInventory()) {
    const seen = new Map();
    for (const item of list(state[spec.collection])) {
      const key = stableValue(item, spec.stable_key_fields);
      if (!key) continue;
      if (seen.has(key)) {
        errors.push(issue("error", spec.collection, `Duplicate stable key ${key} in ${spec.collection}.`, key));
      }
      seen.set(key, item);
    }
  }
}

function validateDailyUniqueness(state = {}, errors = []) {
  for (const collection of dailyCollections) {
    const seen = new Set();
    for (const item of list(state[collection])) {
      const date = String(item.date || "").trim();
      if (!date) continue;
      if (seen.has(date)) errors.push(issue("error", collection, `${collection} has more than one record for ${date}.`, item.key || item.id || date));
      seen.add(date);
    }
  }
}

function validateReviewStates(state = {}, errors = []) {
  for (const collection of ["reviewStates", "partnerProgramArtifacts", "reports", "evidencePackNotes", "handoffPackets", "captureInbox"]) {
    for (const item of list(state[collection])) {
      const reviewState = String(item.review_state || "").trim();
      if (reviewState && !validReviewStates.has(reviewState)) {
        errors.push(issue("error", collection, `${collection} has invalid review_state ${reviewState}.`, item.key || item.id || ""));
      }
    }
  }
}

function validateTaskStatuses(state = {}, errors = []) {
  for (const task of list(state.tasks)) {
    const status = String(task.status || "").trim();
    if (!validTaskStatuses.has(status)) {
      errors.push(issue("error", "tasks", `tasks has invalid status ${status}.`, task.id || ""));
    }
  }
}

function validateAuditTimestamps(state = {}, warnings = []) {
  for (const item of list(state.auditHistory)) {
    if (!item.timestamp && !item.createdAt && !item.created_at) warnings.push(issue("warning", "auditHistory", "Audit entry is missing a timestamp.", item.id || ""));
  }
  for (const item of list(state.activityEvents)) {
    if (!item.createdAt && !item.created_at && !item.timestamp) warnings.push(issue("warning", "activityEvents", "Activity event is missing a timestamp.", item.id || ""));
  }
}

function validateCaptureRoutes(state = {}, errors = []) {
  for (const capture of list(state.captureInbox)) {
    for (const route of list(capture.routed_to)) {
      if (!validCaptureRoutes.has(route)) errors.push(issue("error", "captureInbox", `Capture is routed to unknown destination ${route}.`, capture.id || ""));
    }
  }
}

function scanSecretFields(value, pathParts = [], warnings = []) {
  if (!value || typeof value !== "object") return warnings;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecretFields(item, [...pathParts, String(index)], warnings));
    return warnings;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (secretKeyPattern.test(key) && child !== undefined && child !== null && String(child) !== "") {
      warnings.push(issue("warning", pathParts[0] || "state", `Possible secret-like field present at ${nextPath.join(".")}.`, nextPath.join(".")));
    }
    if (child && typeof child === "object") scanSecretFields(child, nextPath, warnings);
  }
  return warnings;
}

export function checkStateIntegrity(state = {}) {
  const errors = [];
  const warnings = [];
  for (const spec of buildDataModelInventory()) {
    if (state[spec.collection] === undefined) warnings.push(issue("warning", spec.collection, `Collection ${spec.collection} is missing from state.`));
    else if (!Array.isArray(state[spec.collection]) && spec.collection !== "runtime") warnings.push(issue("warning", spec.collection, `Collection ${spec.collection} should be an array.`));
  }
  validateRequiredFields(state, errors);
  validateStableKeys(state, errors);
  validateDailyUniqueness(state, errors);
  validateReviewStates(state, errors);
  validateTaskStatuses(state, errors);
  validateAuditTimestamps(state, warnings);
  validateCaptureRoutes(state, errors);
  scanSecretFields(state, [], warnings);
  const liveGates = liveGatesCount(state);
  if (liveGates !== 0) errors.push(issue("error", "runtime", `Live gates count must remain 0. Current count: ${liveGates}.`));
  return {
    ok: errors.length === 0,
    generated_at: new Date().toISOString(),
    live_gates_count: liveGates,
    errors,
    warnings,
    summary: {
      collections: buildDataModelInventory().length,
      errors: errors.length,
      warnings: warnings.length
    }
  };
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = secretKeyPattern.test(key) ? "[REDACTED]" : redactSecrets(child);
  }
  return next;
}

function snapshotCollectionCounts(state = {}) {
  const counts = {};
  for (const spec of buildDataModelInventory()) counts[spec.collection] = collectionCount(state, spec.collection);
  return counts;
}

export function createStateSnapshot(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const integrity = checkStateIntegrity(state);
  return {
    id: `state-snapshot-${generatedAt.replace(/[:.]/g, "-")}`,
    generated_at: generatedAt,
    collection_counts: snapshotCollectionCounts(state),
    live_gates_count: liveGatesCount(state),
    no_external_actions_confirmation: noExternalActionsConfirmation,
    integrity_status: integrity.ok ? "passed" : "needs_attention",
    integrity_summary: integrity.summary,
    inventory_version: "state-integrity-v1",
    state: redactSecrets(state)
  };
}

export async function saveStateSnapshotFile(state = {}, options = {}) {
  const outputDir = options.outputDir || path.resolve(process.cwd(), "data/exports/state");
  await mkdir(outputDir, { recursive: true });
  const snapshot = createStateSnapshot(state, options);
  const filename = `${snapshot.id}.json`;
  const filePath = path.join(outputDir, filename);
  await writeFile(filePath, JSON.stringify(snapshot, null, 2));
  return { filePath, filename, snapshot };
}

export async function restoreStateDryRun(snapshotPath, options = {}) {
  const raw = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw);
  const state = snapshot.state || {};
  const integrity = checkStateIntegrity(state);
  return {
    valid: Boolean(snapshot.generated_at && snapshot.collection_counts && snapshot.state && integrity.errors.length === 0),
    mutated: false,
    source_file: snapshotPath,
    generated_at: snapshot.generated_at || "",
    would_restore: {
      collections: snapshotCollectionCounts(state),
      live_gates_count: liveGatesCount(state)
    },
    integrity
  };
}

export function buildDataIntegritySnapshot(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const date = generatedAt.slice(0, 10);
  const integrity = checkStateIntegrity(state);
  const inventory = buildDataModelInventory();
  return {
    id: `data-integrity-${date}`,
    generated_at: generatedAt,
    integrity_status: integrity.ok ? "passed" : "needs_attention",
    inventory,
    collection_counts: snapshotCollectionCounts(state),
    errors: integrity.errors,
    warnings: integrity.warnings,
    duplicate_warnings: [...integrity.errors, ...integrity.warnings].filter(item => /duplicate/i.test(item.message)),
    missing_field_warnings: [...integrity.errors, ...integrity.warnings].filter(item => /missing required field|missing from state/i.test(item.message)),
    latest_export_snapshot: options.latestExportSnapshot || null,
    last_integrity_check_time: generatedAt,
    live_gates_count: integrity.live_gates_count,
    no_external_actions_confirmation: noExternalActionsConfirmation
  };
}

export function saveDataIntegritySnapshot(state = {}, options = {}) {
  const snapshot = buildDataIntegritySnapshot(state, options);
  const timestamp = snapshot.generated_at;
  const actor = options.actor || "owner_token";
  const next = {
    ...state,
    dataIntegritySnapshots: [snapshot, ...list(state.dataIntegritySnapshots).filter(item => item.id !== snapshot.id)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${snapshot.id}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: "data integrity snapshot refreshed",
    resourceType: "data_integrity_snapshot",
    resourceId: snapshot.id,
    beforeValue: null,
    afterValue: {
      integrity_status: snapshot.integrity_status,
      errors: snapshot.errors.length,
      warnings: snapshot.warnings.length,
      live_gates_count: snapshot.live_gates_count
    }
  }, ...list(state.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: `activity-${snapshot.id}-${Date.parse(timestamp) || Date.now()}`,
    eventType: "Data Integrity Snapshot refreshed",
    title: "Data Integrity Snapshot refreshed",
    summary: `Data Integrity Snapshot refreshed. Status: ${snapshot.integrity_status}. No external action was taken.`,
    relatedObjectType: "data_integrity_snapshot",
    relatedObjectId: snapshot.id,
    riskLevel: snapshot.integrity_status === "passed" ? "low" : "medium",
    metadata: { liveGatesCount: snapshot.live_gates_count, externalSideEffects: false, noExternalSystemsContacted: true },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, snapshot };
}

export function dataModelSpecFor(collection = "") {
  return inventoryByCollection.get(collection) || null;
}
