import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { assertProductionReadiness, isHostedProduction } from "./runtime-security.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultDataDir = path.join(rootDir, "data");
const defaultDataPath = path.join(defaultDataDir, "social-command-center.json");
const defaultSeedPath = path.join(defaultDataDir, "seed", "social-command-center.seed.json");

const supabaseRecordsTable = process.env.SUPABASE_CORE_RECORDS_TABLE || "leos_core_records";
const coreStateCollections = [
  "contentBank",
  "growthInbox",
  "approvalQueue",
  "posts",
  "priorities",
  "blockers",
  "campaigns",
  "partners",
  "pilots",
  "dataRoomItems",
  "dataRoom",
  "metrics",
  "runwayInputs",
  "systemHealth",
  "socialAccounts",
  "soc2AuditLogs",
  "auditHistory",
  "events",
  "tasks",
  "supportIssues",
  "alerts",
  "meetingBriefs",
  // Operator settings (singleton). Was NEVER registered, so every settings write (alert email
  // switch, digest date stamp, daily targets, source feeds) silently failed to persist on the
  // Supabase backend while working locally on JSON — found live in prod via the 18I alert email
  // toggle. test-alerts-engine.mjs asserts membership.
  "settings",
  "evidencePackNotes",
  "autonomyActions",
  "autonomyDecisions",
  "autonomyRuns",
  "activityEvents",
  // Product-event capture (receiveProductEvent / importAutomationEvents in preview-server.mjs).
  // These were NEVER registered, so on the Supabase backend every product funnel event, funnel
  // suggestion, and connector sync stamp was silently dropped on write and vanished on the next
  // read (the same trap that killed state.settings — see the "settings" note above). Registered
  // 2026-07-08; test-scoped-write-hardening.mjs asserts membership.
  "automationEvents",
  "automationSuggestions",
  "connectorStatus",
  "reports",
  "funnelSnapshots",
  "captureInbox",
  "conversationNotes",
  "morningBriefs",
  "eveningReflections",
  "operatingMemory",
  "dailyCloseouts",
  "dailyRunSessions",
  "reviewStates",
  "osHealthSnapshots",
  "smokeTestRuns",
  "evidenceSummaries",
  "dataIntegritySnapshots",
  "roleAssignments",
  "handoffPackets",
  "productionActivationRuns",
  "partnerPrograms",
  "partnerProgramArtifacts",
  "leeThreads",
  "leeMessages",
  "leeActionProposals",
  "leeKnowledgeSources",
  "leeKnowledgeChunks",
  "leeRuns",
  "leeMemory",
  "heartbeatRuns",
  "heartbeatLease",
  "autopilotSettings",
  // B2 outreach OS (Phase 0). MUST stay in sync with OUTREACH_COLLECTIONS /
  // OUTREACH_SINGLETON_COLLECTIONS in outreach-os.mjs, or these silently fail to persist
  // to Supabase (the B1 trap). test-outreach-os.mjs asserts membership.
  "outreachOrganizations",
  "outreachContacts",
  "outreachLists",
  "outreachCampaigns",
  "outreachSequenceSteps",
  "outreachAttempts",
  "outreachReplies",
  "outreachBounces",
  "outreachSuppressions",
  "outreachUnsubscribes",
  "outreachConfig",
  // B2 outreach send-claims safety ledger (activation run, 2026-07-09). Mirrors
  // reactivationSendClaims: one row per (campaign, contact, step), written via
  // claimCollectionItems BEFORE any live SendGrid call; append-only (see
  // appendOnlyCollections below); test-outreach-claims.mjs asserts membership.
  "outreachSendClaims",
  // B5 prospect discovery. MUST stay in sync with PROSPECT_COLLECTIONS /
  // PROSPECT_SINGLETON_COLLECTIONS in prospect-discovery.mjs, or they silently fail to
  // persist to Supabase (the B1/B2 trap). test-prospect-discovery.mjs asserts membership.
  "prospectCandidates",
  "prospectDiscoveryRuns",
  "prospectConfig",
  // B3 codebase-health monitor. MUST stay in sync with CODEBASE_HEALTH_COLLECTIONS in
  // codebase-health.mjs, or the findings report silently fails to persist to Supabase (the
  // B1/B2/B5 trap). test-codebase-health.mjs asserts membership — and B3 itself flags this drift.
  "codebaseHealthSnapshots",
  // B4 engagement & growth monitor. MUST stay in sync with ENGAGEMENT_GROWTH_COLLECTIONS in
  // engagement-growth.mjs, or the report silently fails to persist to Supabase (same trap).
  // test-engagement-growth.mjs asserts membership.
  "engagementGrowthSnapshots",
  // B7 operating-loop registry. MUST stay in sync with OPERATING_PULSE_COLLECTIONS in
  // operating-loops.mjs, or the per-loop pulse snapshots silently fail to persist (same trap).
  // test-operating-loops.mjs asserts membership. (os-health loop reuses osHealthSnapshots above.)
  "operatingPulseSnapshots",
  // MVP reactivation (consumer B2C). MUST stay in sync with REACTIVATION_COLLECTIONS /
  // REACTIVATION_SINGLETON_COLLECTIONS in reactivation-os.mjs, or the contacts/attempts/events
  // silently fail to persist to Supabase (same trap). test-reactivation-os.mjs asserts membership.
  "reactivationContacts",
  "reactivationAttempts",
  "reactivationEvents",
  "reactivationCampaign",
  // Reactivation send-claims safety ledger (Phase B PR 1, 2026-07-09). One row per
  // (campaign, contact, step), written via claimCollectionItems BEFORE any live SendGrid call.
  // The unique (collection, item_id) key makes the insert the atomic idempotency test: a
  // concurrent or repeated invocation loses the insert and skips the send. Rows are never
  // deleted (failed sends mark the claim failed); see appendOnlyCollections below.
  // test-reactivation-claims.mjs asserts membership.
  "reactivationSendClaims",
  // RCAP revenue/workbook import foundation. MUST stay in sync with rcap-revenue-os.mjs, or
  // workbook accounts/contacts/deal seeds/tasks silently fail to persist to Supabase.
  "rcapRevenueAccounts",
  "rcapRevenueContacts",
  "rcapRevenueDealSeeds",
  "rcapRevenueQueueTasks",
  "rcapRevenueImportBatches",
  "rcapRevenueEvents",
  "rcapRevenueSignals",
  // Expungement.ai lifecycle sync. MUST stay in sync with EXPUNGEMENT_LIFECYCLE_COLLECTIONS in
  // expungement-lifecycle-sync.mjs, or the lifecycle contacts/events silently fail to persist to
  // Supabase. test-expungement-lifecycle-sync.mjs asserts membership.
  "expungementLifecycleContacts",
  "expungementLifecycleEvents",
  // SendGrid Event Webhook health telemetry (singleton). MUST stay in sync with
  // SENDGRID_WEBHOOK_HEALTH_COLLECTION in sendgrid-webhook.mjs, or webhook health silently
  // fails to persist (same trap). test-sendgrid-webhook.mjs asserts membership.
  "sendgridWebhookHealth",
  // Inbox intelligence (I1, 2026-07-12 owner decision: full read-only, roger@example.com
  // ONLY). MUST stay in sync with INBOX_COLLECTIONS / INBOX_SINGLETON_COLLECTIONS in
  // inbox-intelligence.mjs, or signals silently fail to persist (the B1 trap).
  // test-inbox-intelligence.mjs asserts membership. Signals store classifications,
  // summaries, and redacted evidence lines only — never bodies. Owner-visible only.
  "inboxSignals",
  "inboxConfig",
  // Phase 1 — Company Memory (company-memory.mjs). Projections + direct engine emits;
  // domain collections stay authoritative. Registered here or Supabase silently drops them.
  "queueItems",
  "companyContacts",
  "companyOrganizations",
  "companyEvents",
  "agentRuns",
  "approvals",
  // Slice 4 registration backlog (2026-07-08). Every collection below is WRITTEN by the app
  // but was never registered, so on the Supabase backend each write was silently dropped and
  // the data vanished on the next read — the same trap as "settings" above. All are
  // list-shaped; every writer stamps a stable per-item id (verified against the index-keyed
  // row shredding that destroyed reactivationContacts). assetBundles is deliberately NOT
  // registered: it is seed/read-only with no write site anywhere.
  // test-registration-backlog.mjs asserts membership.
  // -- JsonStore convenience methods (addLibraryItem, addBrandAsset, addBrandRule,
  //    upsertGenerationProfile, addPublishEvent, savePostImage):
  "library",
  "brandAssets",
  "brandRules",
  "generationProfiles",
  "publishEvents",
  // postImages payloads are compacted in coreRecordsFromState (data: URIs stripped, same as
  // the local-file path) so registering it cannot push megabyte image rows to Supabase.
  "postImages",
  // -- upsertGrowthItem computed-key writes (growthCollections set in preview-server.mjs):
  "milestones",
  "complianceItems",
  "soc2AccessReviews",
  "soc2Changes",
  "soc2Vendors",
  "soc2Incidents",
  "soc2Evidence",
  "soc2Policies",
  "soc2ControlOwners",
  "soc2TypeIChecklist",
  // -- direct route/engine writes in preview-server.mjs, google-workspace.mjs, and
  //    partner-journey-handoff-contract.mjs:
  "campaignKits",
  "emailDrafts",
  // Product registry (2026-07-13 ground-truth reset). One record per product with its real
  // stage (live / building / research) so reports state product status truthfully instead of
  // implying every product has a live funnel. Written via /api/growth/upsert.
  "products",
  "externalActionOutbox",
  "generationBatches",
  "syncRuns",
  "googleInsights",
  "dailyRunPublisherRuns",
  "handoffContractPreviews",
  // Existing Supabase authSessions rows and securityMetrics.rateLimitBuckets are legacy inert
  // records retained to avoid destructive production cleanup during this hotfix. authSessions
  // is deliberately omitted from the business-state registry; securityMetrics remains below
  // only for unrelated application security telemetry, never auth runtime state.
  "webhookReplayClaims",
  "oauthStateClaims",
  "publishClaims",
  "auditEvents",
  "securityMetrics",
  "userDiscoveryPreferences",
  "discoveryAnalyticsEvents"
];
const singletonCollections = new Set(["metrics", "runwayInputs", "systemHealth", "leeMemory", "heartbeatLease", "autopilotSettings", "outreachConfig", "prospectConfig", "reactivationCampaign", "sendgridWebhookHealth", "settings", "inboxConfig", "securityMetrics"]);
// Append-only safety ledgers: rows are inserted via claimCollectionItems and updated in place,
// NEVER bulk-reconciled away. Excluding them from the snapshot orphan-delete pass means a stale
// in-memory snapshot (the exact mechanism that shredded reactivationContacts on 2026-07-08) can
// never erase a claim that another invocation inserted directly. Deleting a claim would re-open
// the duplicate-send window it exists to close.
const appendOnlyCollections = new Set(["reactivationSendClaims", "outreachSendClaims", "webhookReplayClaims", "oauthStateClaims", "publishClaims", "auditEvents", "discoveryAnalyticsEvents"]);
const protectedReconcileCollections = new Set(appendOnlyCollections);
// Scoped snapshot reconciliation is intentionally opt-in. Most collections require explicit
// versioned delete mutations (`writeChanges`) so a stale scoped patch cannot erase a concurrent row.
const reconcileEligibleCollections = new Set(["approvalQueue"]);

function normalizeCollectionNames(collectionNames) {
  if (!Array.isArray(collectionNames) || collectionNames.length === 0) {
    throw new TypeError("collectionNames must be a non-empty array.");
  }
  const normalized = [...new Set(collectionNames.map((name) => {
    if (typeof name !== "string" || !name.trim()) throw new TypeError("Collection names must be non-empty strings.");
    return name.trim();
  }))].sort();
  if (normalized.includes("authSessions")) throw new Error("authSessions is not available through business-state storage.");
  const unsupported = normalized.find((name) => !coreStateCollections.includes(name));
  if (unsupported) throw new Error(`Unsupported storage collection: ${unsupported}.`);
  return normalized;
}

const jsonFileQueues = new Map();
function withJsonFileLock(filePath, operation) {
  const prior = jsonFileQueues.get(filePath) || Promise.resolve();
  const next = prior.then(operation, operation);
  jsonFileQueues.set(filePath, next.then(() => undefined, () => undefined));
  return next;
}

export class StorageConflictError extends Error {
  constructor(collection, itemId, expectedVersion, actualVersion = null) {
    super(`Concurrent update conflict for ${collection}/${itemId}.`);
    this.name = "StorageConflictError";
    this.code = "STORAGE_VERSION_CONFLICT";
    this.status = 409;
    this.collection = collection;
    this.itemId = itemId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class SupabaseRequestTimeoutError extends Error {
  constructor() {
    super("Supabase request timed out.");
    this.name = "SupabaseRequestTimeoutError";
    this.code = "SUPABASE_TIMEOUT";
    this.status = 503;
  }
}

export class SupabaseRequestAbortedError extends Error {
  constructor() {
    super("Supabase request was aborted.");
    this.name = "SupabaseRequestAbortedError";
    this.code = "SUPABASE_ABORTED";
    this.status = 503;
  }
}

function validateMutableRecord(collection, itemId, record) {
  if (!coreStateCollections.includes(collection)) throw new Error("Unsupported storage collection.");
  if (!itemId || String(itemId).length > 240) throw new Error("A stable record identifier is required.");
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Stored records must be objects.");
  const encoded = JSON.stringify(record);
  if (encoded.length > 1024 * 1024) throw new Error("Stored record exceeds the 1MB boundary.");
  if (/"(?:authorization|cookie|accessToken|refreshToken|apiKey|secret)"\s*:/i.test(encoded) && !/Encrypted/i.test(encoded)) {
    throw new Error("Raw credentials may not be persisted in generic records.");
  }
  return record;
}

function payloadWithoutVersion(record = {}) {
  const { _version, ...payload } = record || {};
  return payload;
}

function parseBoolean(value = "") {
  return ["true", "1", "yes", "on"].includes(String(value || "").toLowerCase());
}

function localDemoMode() {
  return parseBoolean(process.env.LOCAL_DEMO_MODE || "false");
}

function requestedStorageBackend() {
  const explicit = String(process.env.STORAGE_BACKEND || "").toLowerCase();
  if (["json", "supabase"].includes(explicit)) return explicit;
  if (parseBoolean(process.env.USE_SUPABASE_JS_STORE || "false")) return "supabase";
  return "json";
}

function localDataPath() {
  return process.env.COMMAND_CENTER_DATA_PATH || defaultDataPath;
}

function localSeedPath() {
  return process.env.COMMAND_CENTER_SEED_PATH || defaultSeedPath;
}

function supabaseDatabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseRestBaseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1";
}

function supabaseHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  return {
    apikey: key,
    authorization: "Bearer " + key,
    ...extra
  };
}

const DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS = 8_000;
const MIN_SUPABASE_REQUEST_TIMEOUT_MS = 100;
const MAX_SUPABASE_REQUEST_TIMEOUT_MS = 15_000;
const SUPABASE_READ_RETRY_DELAY_MS = 50;
const TRANSIENT_SUPABASE_HTTP_STATUSES = new Set([502, 503, 504]);
const transientSupabaseNetworkErrors = new WeakSet();

function supabaseRequestTimeoutMs(env = process.env) {
  const raw = String(env.SUPABASE_REQUEST_TIMEOUT_MS ?? "").trim();
  if (!raw) return DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS;
  const configured = Number(raw);
  if (!Number.isFinite(configured)) return DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_SUPABASE_REQUEST_TIMEOUT_MS, Math.max(MIN_SUPABASE_REQUEST_TIMEOUT_MS, Math.trunc(configured)));
}

async function supabaseRestRequestAttempt(pathname, options, method, encodedBody) {
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = Boolean(options.signal?.aborted);
  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted) onCallerAbort();
  else options.signal?.addEventListener("abort", onCallerAbort, { once:true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, supabaseRequestTimeoutMs());
  timeout.unref?.();
  let response;
  let text;
  try {
    response = await fetch(supabaseRestBaseUrl() + "/" + String(pathname || "").replace(/^\/+/, ""), {
      method,
      headers: supabaseHeaders({
        ...(encodedBody !== undefined ? { "content-type":"application/json" } : {}),
        ...(options.prefer ? { prefer: options.prefer } : {}),
        ...(options.headers || {})
      }),
      body: encodedBody,
      signal: controller.signal
    });
    text = await response.text();
    if (callerAborted || options.signal?.aborted) throw new SupabaseRequestAbortedError();
    if (timedOut) throw new SupabaseRequestTimeoutError();
  } catch (error) {
    if (callerAborted || options.signal?.aborted || error instanceof SupabaseRequestAbortedError) {
      throw new SupabaseRequestAbortedError();
    }
    if (timedOut) throw new SupabaseRequestTimeoutError();
    if (controller.signal.aborted || error?.name === "AbortError") throw new SupabaseRequestAbortedError();
    if (error && typeof error === "object") transientSupabaseNetworkErrors.add(error);
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onCallerAbort);
  }
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : data?.message || data?.error || response.statusText;
    if (data?.code === "40001" || /version_conflict/i.test(String(detail))) {
      throw new StorageConflictError(options.collection || "record", options.itemId || "unknown", options.expectedVersion ?? null);
    }
    const error = new Error("Supabase DB " + response.status + ": " + String(detail).slice(0, 300));
    error.status = response.status;
    error.code = data?.code || "SUPABASE_ERROR";
    throw error;
  }
  if (options.withContentRange) {
    const contentRange = response.headers && typeof response.headers.get === "function"
      ? (response.headers.get("content-range") || "")
      : "";
    return { data, contentRange };
  }
  return data;
}

function supabaseReadRetryEligible(error) {
  return error instanceof SupabaseRequestTimeoutError
    || transientSupabaseNetworkErrors.has(error)
    || TRANSIENT_SUPABASE_HTTP_STATUSES.has(Number(error?.status));
}

async function waitForSupabaseReadRetry(signal) {
  if (signal?.aborted) throw new SupabaseRequestAbortedError();
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      operation();
    };
    const onAbort = () => finish(() => reject(new SupabaseRequestAbortedError()));
    const timer = setTimeout(() => finish(resolve), SUPABASE_READ_RETRY_DELAY_MS);
    signal?.addEventListener("abort", onAbort, { once:true });
    if (signal?.aborted) onAbort();
  });
}

async function supabaseRestRequest(pathname, options = {}) {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    throw new Error("Supabase database env vars are missing.");
  }
  const method = String(options.method || "GET").toUpperCase();
  const encodedBody = options.body ? JSON.stringify(options.body) : undefined;
  const readOnly = method === "GET" || method === "HEAD";
  try {
    return await supabaseRestRequestAttempt(pathname, options, method, encodedBody);
  } catch (error) {
    if (!readOnly || options.signal?.aborted || !supabaseReadRetryEligible(error)) throw error;
    await waitForSupabaseReadRetry(options.signal);
    return supabaseRestRequestAttempt(pathname, options, method, encodedBody);
  }
}

// "0-999/13593" => 13593. NaN when the server sent no exact count.
function contentRangeTotal(value = "") {
  const match = String(value || "").match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : NaN;
}

// PostgREST caps EVERY response at a fixed row count (Supabase default 1000), no matter what
// limit you ask for. So a single unpaginated `select=*` SILENTLY truncates the table the moment
// it grows past the cap — whole collections vanish from hydration with no error. (This is exactly
// how engagementGrowthSnapshots / codebaseHealthSnapshots — and any collection ordered past row
// 1000 — disappeared on read once leos_core_records crossed 1000 rows.) We page with limit+offset
// under a STABLE order (collection,item_id) until a short/empty page proves we've read everything.
const SUPABASE_PAGE_SIZE = 1000;

async function supabaseFetchAllRows(selectColumns, extraQuery = "", options = {}) {
  const base = supabaseRecordsTable + "?select=" + selectColumns + (extraQuery ? "&" + extraQuery : "") + "&order=collection.asc,item_id.asc";
  const request = (pathname, requestOptions = {}) => {
    options.onRequest?.();
    return supabaseRestRequest(pathname, { ...requestOptions, signal:options.signal });
  };
  // First page asks for the exact total (Prefer: count=exact => Content-Range
  // "0-999/13593"); the REMAINING pages are then fetched CONCURRENTLY. The old
  // sequential loop put a pages-times-round-trip latency floor under every state
  // read (~3s at 14 pages), which starved the dashboard's boot fetches. Torn-read
  // exposure against concurrent writes is unchanged: the sequential loop had the
  // same window, just slower.
  const first = await request(
    base + "&limit=" + SUPABASE_PAGE_SIZE + "&offset=0",
    { prefer: "count=exact", withContentRange: true }
  );
  const firstRows = Array.isArray(first.data) ? first.data : [];
  if (!firstRows.length) return [];
  const pageSize = firstRows.length;
  const total = contentRangeTotal(first.contentRange);
  if (Number.isFinite(total)) {
    if (total <= pageSize) return firstRows;
    const offsets = [];
    for (let o = pageSize; o < total; o += pageSize) offsets.push(o);
    const pages = await Promise.all(offsets.map((o) =>
      request(base + "&limit=" + pageSize + "&offset=" + o)
    ));
    return firstRows.concat(...pages.map((p) => (Array.isArray(p) ? p : [])));
  }
  // No exact count from the server: legacy sequential paging. The effective cap is
  // whatever the first request returned; a short page proves the end. The hard page
  // ceiling is a runaway guard in case a server ever ignored offset.
  const all = [...firstRows];
  let offset = pageSize;
  for (let page = 0; page < 100000; page += 1) {
    const rows = (await request(base + "&limit=" + SUPABASE_PAGE_SIZE + "&offset=" + offset)) || [];
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  return all;
}

function coreRecordId(collection, item, index = 0) {
  if (singletonCollections.has(collection)) return "singleton";
  // contact_id must come before the index fallback: contact records carry no `id`, and
  // index-based row keys are position-dependent — two concurrent full-state writes with
  // different orderings interleave rows, duplicating some records and overwriting others
  // (this shredded reactivationContacts to 537 distinct emails across 3,838 rows on
  // 2026-07-08). A stable per-record key makes concurrent writes converge instead.
  return String(item?.id || item?.contact_id || item?.postId || item?.title || item?.name || collection + "-" + index);
}

function coreRecordsFromState(state = {}) {
  const rowsByKey = new Map();
  const addRow = (row) => {
    rowsByKey.set(row.collection + "\u0000" + row.item_id, row);
  };
  for (const collection of coreStateCollections) {
    const value = state[collection];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      // postImages parity with the local-file path (writeStateNow): strip data: URI payloads
      // before they become Supabase rows. Without this, registering postImages would upload
      // full base64 images on every write that includes the collection.
      const items = collection === "postImages" ? value.map(compactPostImageForLocal) : value;
      items.forEach((item, index) => addRow({ collection, item_id: coreRecordId(collection, item, index), payload: payloadWithoutVersion(item || {}), expected_version: Number.isInteger(item?._version) ? item._version : null, updated_at: new Date().toISOString() }));
    } else if (typeof value === "object") {
      addRow({ collection, item_id: "singleton", payload: payloadWithoutVersion(value), expected_version: Number.isInteger(value?._version) ? value._version : null, updated_at: new Date().toISOString() });
    }
  }
  return [...rowsByKey.values()];
}

function coreMutationsBetween(before = {}, after = {}) {
  const beforeRows = new Map(coreRecordsFromState(before).map((row) => [`${row.collection}\u0000${row.item_id}`, row]));
  const afterRows = new Map(coreRecordsFromState(after).map((row) => [`${row.collection}\u0000${row.item_id}`, row]));
  const changedCollections = new Set(coreStateCollections.filter((collection) => before[collection] !== after[collection]));
  const mutations = [];
  for (const [key, row] of afterRows) {
    if (!changedCollections.has(row.collection)) continue;
    const prior = beforeRows.get(key);
    if (prior && JSON.stringify(prior.payload) === JSON.stringify(row.payload)) continue;
    mutations.push({
      operation:"upsert",
      collection:row.collection,
      item_id:row.item_id,
      payload:row.payload,
      expected_version:prior ? (Number.isInteger(prior.expected_version) ? prior.expected_version : 0) : null
    });
  }
  for (const [key, row] of beforeRows) {
    if (!changedCollections.has(row.collection) || afterRows.has(key)) continue;
    mutations.push({
      operation:"delete",
      collection:row.collection,
      item_id:row.item_id,
      expected_version:Number.isInteger(row.expected_version) ? row.expected_version : 0
    });
  }
  return mutations;
}

function applyCoreRecordsToState(baseState = {}, rows = []) {
  const next = { ...baseState };
  for (const collection of coreStateCollections) {
    if (singletonCollections.has(collection)) continue;
    if (next[collection] === undefined) next[collection] = [];
  }
  const grouped = new Map();
  for (const row of rows || []) {
    const collection = row.collection;
    if (!coreStateCollections.includes(collection)) continue;
    if (!grouped.has(collection)) grouped.set(collection, []);
    grouped.get(collection).push(row);
  }
  for (const [collection, records] of grouped.entries()) {
    if (singletonCollections.has(collection)) {
      next[collection] = records[0]?.payload ? { ...records[0].payload, _version: Number(records[0].version || 1) } : {};
    } else {
      next[collection] = records.map((row) => row.payload ? { ...row.payload, _version: Number(row.version || 1) } : null).filter(Boolean);
    }
  }
  if (!next.dataRoomItems?.length && Array.isArray(next.dataRoom)) next.dataRoomItems = next.dataRoom;
  if (!next.dataRoom?.length && Array.isArray(next.dataRoomItems)) next.dataRoom = next.dataRoomItems;
  return next;
}

function applyRequestedCoreRecords(baseState = {}, rows = [], collectionNames = []) {
  const requested = new Set(collectionNames);
  const next = {};
  const grouped = new Map(collectionNames.map((collection) => [collection, []]));
  for (const row of rows || []) {
    if (requested.has(row?.collection)) grouped.get(row.collection).push(row);
  }
  for (const collection of collectionNames) {
    const records = grouped.get(collection) || [];
    if (records.length) {
      next[collection] = singletonCollections.has(collection)
        ? { ...(records[0].payload || {}), _version:Number(records[0].version || 1) }
        : records.map((row) => row.payload ? { ...row.payload, _version:Number(row.version || 1) } : null).filter(Boolean);
      continue;
    }
    const fallback = baseState[collection];
    next[collection] = singletonCollections.has(collection)
      ? (fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {})
      : (Array.isArray(fallback) ? fallback : []);
  }
  return next;
}

function loadLocalEnv() {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "test"
    || parseBoolean(process.env.COMMAND_CENTER_TEST_MODE)
    || parseBoolean(process.env.SKIP_ENV_LOCAL_FILE)) return;
  const envPath = path.join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = awaitableRead(envPath);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function awaitableRead(filePath) {
  return existsSync(filePath) ? String(globalThis.__storageReadFileSync?.(filePath) || "") : "";
}

async function readLocalEnv() {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "test"
    || parseBoolean(process.env.COMMAND_CENTER_TEST_MODE)
    || parseBoolean(process.env.SKIP_ENV_LOCAL_FILE)) return;
  const envPath = path.join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function mergeById(raw = [], seeded = []) {
  const seen = new Set(raw.map((item) => item.id));
  return [...raw, ...seeded.filter((item) => !seen.has(item.id))];
}

function mergeSocialAccounts(raw = [], seeded = []) {
  const seen = new Set(raw.map((item) => item.platform));
  return [...raw, ...seeded.filter((item) => !seen.has(item.platform))];
}

function compactImageReference(value = "") {
  const text = String(value || "");
  if (text.startsWith("data:image/")) return "";
  if (text.length > 10000 && !text.startsWith("http") && !text.startsWith("/")) return "";
  return text;
}

function compactPostImageForLocal(image = {}) {
  const localPlaceholderImageUrl = image.generationMode === "local_branded_placeholder"
    && String(image.imageUrl || "").startsWith("data:image/svg+xml")
    ? image.imageUrl
    : compactImageReference(image.imageUrl);
  return {
    ...image,
    imageUrl: localPlaceholderImageUrl,
    finalImageUrl: compactImageReference(image.finalImageUrl),
    finalPngUrl: compactImageReference(image.finalPngUrl),
    imagePrompt: image.imagePrompt || "",
    generationError: image.generationError || "",
    rateLimited: Boolean(image.rateLimited),
    rateLimitRetryAfterSeconds: image.rateLimitRetryAfterSeconds || 0,
    rateLimitRetryAt: image.rateLimitRetryAt || "",
    createdAt: image.createdAt || new Date().toISOString()
  };
}

export async function getSupabaseHealth() {
  await readLocalEnv();
  const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
  const requestedBackend = requestedStorageBackend();
  const mode = localDemoMode() ? "local_demo" : requestedBackend === "supabase" ? "supabase" : "local_json_fallback";
  if (!configured) {
    return { configured:false, connected:false, mode, table:supabaseRecordsTable, requestedBackend, error:"Supabase env vars are missing. Using local JSON fallback when needed." };
  }
  try {
    await supabaseRestRequest(supabaseRecordsTable + "?select=collection,item_id&collection=neq.authSessions&limit=1");
    return { configured:true, connected:true, mode, table:supabaseRecordsTable, requestedBackend, error:"" };
  } catch (error) {
    return { configured:true, connected:false, mode, table:supabaseRecordsTable, requestedBackend, error:String(error.message || error).slice(0, 500) };
  }
}

export class JsonStore {
  constructor(initialState) {
    this.initialState = initialState;
    this.kind = "json";
    this.writeQueue = Promise.resolve();
    this.dataPath = localDataPath();
    this.dataDir = path.dirname(this.dataPath);
    this.seedPath = localSeedPath();
  }

  async ensure() {
    await mkdir(this.dataDir, { recursive: true });
    if (!existsSync(this.dataPath)) {
      if (existsSync(this.seedPath)) {
        const seed = JSON.parse(await readFile(this.seedPath, "utf8"));
        await writeFile(this.dataPath, JSON.stringify({ ...this.initialState, ...seed }, null, 2));
      } else {
        await writeFile(this.dataPath, JSON.stringify(this.initialState, null, 2));
      }
    }
  }

  async readState() {
    await this.ensure();
    let rawState = {};
    try {
      rawState = JSON.parse(await readFile(this.dataPath, "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
      rawState = JSON.parse(await readFile(this.dataPath, "utf8"));
    }
    return {
      ...this.initialState,
      ...rawState,
      settings: { ...(this.initialState.settings || {}), ...(rawState.settings || {}) },
      library: mergeById(rawState.library || [], this.initialState.library || []),
      brandAssets: mergeById(rawState.brandAssets || [], this.initialState.brandAssets || []),
      brandRules: mergeById(rawState.brandRules || [], this.initialState.brandRules || []),
      generationProfiles: mergeById(rawState.generationProfiles || [], this.initialState.generationProfiles || []),
      assetBundles: mergeById(rawState.assetBundles || [], this.initialState.assetBundles || []),
      socialAccounts: mergeSocialAccounts(rawState.socialAccounts || [], this.initialState.socialAccounts || []),
      postImages: rawState.postImages || this.initialState.postImages || [],
      publishEvents: rawState.publishEvents || this.initialState.publishEvents || [],
      persistence: "json"
    };
  }

  async readCollections(collectionNames, _options = {}) {
    const names = normalizeCollectionNames(collectionNames);
    const state = await this.readState();
    return {
      ...Object.fromEntries(names.map((name) => [name, state[name] ?? (singletonCollections.has(name) ? {} : [])])),
      persistence:"json"
    };
  }

  async writeState(state) {
    // Re-arm on failure: the caller must see the rejection, but the QUEUE must not
    // stay rejected, or one failed write would brick every later write until restart.
    return withJsonFileLock(this.dataPath, () => this.writeStateNow(state));
  }

  // Scoped write: persist ONLY the collections in `patch`, leaving everything else untouched.
  // The JSON backend rewrites the whole file, so a partial state must be merged into a fresh
  // read first — writing `patch` directly would WIPE every other collection from the file.
  // (The Supabase backend overrides this with a true partial write.)
  async writeCollections(patch = {}) {
    return withJsonFileLock(this.dataPath, async () => {
      const state = await this.readState();
      return this.writeStateNow({ ...state, ...patch });
    });
  }

  async writeChanges(before = {}, after = {}) {
    const mutations = coreMutationsBetween(before, after);
    if (!mutations.length) return this.readState();
    return withJsonFileLock(this.dataPath, async () => {
      const state = await this.readState();
      const staged = new Map();
      for (const mutation of mutations) {
        const singleton = singletonCollections.has(mutation.collection);
        const currentRows = singleton ? [state[mutation.collection] || null] : (Array.isArray(state[mutation.collection]) ? state[mutation.collection] : []);
        const currentIndex = singleton ? (currentRows[0] ? 0 : -1) : currentRows.findIndex((item, index) => coreRecordId(mutation.collection, item, index) === mutation.item_id);
        const current = currentIndex >= 0 ? currentRows[currentIndex] : null;
        const actualVersion = current ? Number(current._version || 0) : null;
        if (mutation.expected_version === null ? Boolean(current) : (!current || actualVersion !== mutation.expected_version)) {
          throw new StorageConflictError(mutation.collection, mutation.item_id, mutation.expected_version, actualVersion);
        }
        if (mutation.operation === "upsert") validateMutableRecord(mutation.collection, mutation.item_id, mutation.payload);
        staged.set(`${mutation.collection}\u0000${mutation.item_id}`, { mutation, currentIndex, actualVersion });
      }
      const nextState = { ...state };
      for (const collection of new Set(mutations.map((mutation) => mutation.collection))) {
        const singleton = singletonCollections.has(collection);
        let rows = singleton ? (state[collection] ? [state[collection]] : []) : [...(Array.isArray(state[collection]) ? state[collection] : [])];
        for (const mutation of mutations.filter((item) => item.collection === collection)) {
          const index = singleton ? (rows.length ? 0 : -1) : rows.findIndex((item, itemIndex) => coreRecordId(collection, item, itemIndex) === mutation.item_id);
          if (mutation.operation === "delete") {
            if (index >= 0) rows.splice(index, 1);
            continue;
          }
          const record = { ...mutation.payload, _version:Number(staged.get(`${collection}\u0000${mutation.item_id}`)?.actualVersion || 0) + 1 };
          if (index >= 0) rows[index] = record;
          else rows.unshift(record);
        }
        nextState[collection] = singleton ? (rows[0] || {}) : rows;
      }
      await this.writeStateNow(nextState);
      return nextState;
    });
  }

  async writeStateNow(state) {
    await this.ensure();
    const { persistence, ...persistedState } = state;
    persistedState.postImages = (persistedState.postImages || []).map(compactPostImageForLocal);
    const tempPath = `${this.dataPath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(tempPath, JSON.stringify(persistedState, null, 2));
    await rename(tempPath, this.dataPath);
    this.recordWriteOutcome();
  }

  // Write-health telemetry (Phase 0 trust fix): stamps of the last successful/failed persist and
  // a running failure count, so status endpoints can surface "writes are failing" instead of the
  // store failing silently. Shared by both backends.
  recordWriteOutcome(error = null) {
    const now = new Date().toISOString();
    if (error) {
      this.lastWriteErrorAt = now;
      this.lastWriteError = String(error.message || error).slice(0, 500);
      this.failedWriteCount = (this.failedWriteCount || 0) + 1;
      if (error instanceof StorageConflictError) this.conflictCount = (this.conflictCount || 0) + 1;
    } else {
      this.lastWriteOkAt = now;
      this.lastWriteError = "";
    }
  }

  writeHealth() {
    return {
      backend: this.kind,
      lastWriteOkAt: this.lastWriteOkAt || "",
      lastWriteErrorAt: this.lastWriteErrorAt || "",
      lastWriteError: this.lastWriteError || "",
      failedWriteCount: this.failedWriteCount || 0,
      conflictCount: this.conflictCount || 0
    };
  }

  async generatePosts(posts) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    await this.claimCollectionItems("posts", posts);
    return this.readState();
  }

  async updatePost(id, patch, options = {}) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    const result = await this.mutateCollectionItem("posts", id, (post) => ({ ...post, ...patch, updatedAt: new Date().toISOString() }), options);
    return result.state;
  }

  async addLibraryItem(item) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    await this.claimCollectionItems("library", [item]);
    return this.readState();
  }

  async savePostImage(image) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    const result = await this.mutateCollectionItem("postImages", image.id, () => image, { createIfMissing: true, expectedVersion: image._version });
    return result.state;
  }

  async addBrandAsset(asset) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    await this.claimCollectionItems("brandAssets", [asset]);
    return this.readState();
  }

  async addBrandRule(rule) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    await this.claimCollectionItems("brandRules", [rule]);
    return this.readState();
  }

  async upsertGenerationProfile(profile) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    const result = await this.mutateCollectionItem("generationProfiles", profile.id, () => profile, { createIfMissing: true, expectedVersion: profile._version });
    return result.state;
  }

  async updateSocialAccount(platform, patch) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    const state = await this.readState();
    const existing =
      (state.socialAccounts || []).find((account) => account.platform === platform) ||
      (this.initialState.socialAccounts || []).find((account) => account.platform === platform) ||
      { id: `channel-${platform}`, platform };
    const result = await this.mutateCollectionItem("socialAccounts", coreRecordId("socialAccounts", existing, 0), (account) => ({ ...account, ...patch, platform, id: account?.id || existing.id, updatedAt: new Date().toISOString() }), { createIfMissing: true });
    return result.state;
  }

  async addPublishEvent(event) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    await this.claimCollectionItems("publishEvents", [event]);
    return this.readState();
  }

  async updateSettings(patch) {
    // Shallow copy: readState can return a graph SHARED with concurrent readers
    // (single-flight). This mutator assigns top-level keys; the copy keeps that
    // private so reference-diff closing writes (heartbeat) stay honest.
    const result = await this.mutateCollectionItem("settings", "singleton", (settings) => ({ ...settings, ...patch }), { createIfMissing: true });
    return result.state;
  }

  async mutateCollectionItem(collection, itemId, mutate, options = {}) {
    if (typeof mutate !== "function") throw new Error("A record mutator is required.");
    return withJsonFileLock(this.dataPath, async () => {
      const state = await this.readState();
      const singleton = singletonCollections.has(collection);
      const rows = singleton ? [state[collection] || {}] : (Array.isArray(state[collection]) ? state[collection] : []);
      const index = singleton ? 0 : rows.findIndex((item, i) => coreRecordId(collection, item, i) === String(itemId));
      const current = index >= 0 ? rows[index] : null;
      if (!current && !options.createIfMissing) throw new Error("Record not found.");
      const actualVersion = Number(current?._version || 0);
      if (options.expectedVersion !== undefined && options.expectedVersion !== null && Number(options.expectedVersion) !== actualVersion) {
        throw new StorageConflictError(collection, itemId, Number(options.expectedVersion), actualVersion);
      }
      const changed = validateMutableRecord(collection, itemId, await mutate(current ? { ...current } : null));
      const record = { ...payloadWithoutVersion(changed), _version: actualVersion + 1 };
      const nextValue = singleton ? record : index >= 0 ? rows.map((item, i) => i === index ? record : item) : [record, ...rows];
      const nextState = { ...state, [collection]: nextValue };
      await this.writeStateNow(nextState);
      return options.returnState === false
        ? { record, version:record._version }
        : { state:nextState, record, version:record._version };
    });
  }

  async appendAuditEvent(event = {}) {
    return withJsonFileLock(this.dataPath, async () => {
      const state = await this.readState();
      const current = Array.isArray(state.auditEvents) ? state.auditEvents : [];
      const previousHash = String(current[0]?.eventHash || "");
      const safeEvent = validateMutableRecord("auditEvents", event.id, { ...event, previousHash });
      const eventHash = crypto.createHash("sha256").update(previousHash).update(JSON.stringify(safeEvent)).digest("hex");
      const record = { ...safeEvent, eventHash, _version: 1 };
      const nextState = { ...state, auditEvents: [record, ...current] };
      await this.writeStateNow(nextState);
      return record;
    });
  }

  async claimSocialPublish({ postId, expectedVersion, claim } = {}) {
    return withJsonFileLock(this.dataPath, async () => {
      const state = await this.readState();
      const posts = Array.isArray(state.posts) ? state.posts : [];
      const index = posts.findIndex((post) => String(post.id) === String(postId));
      if (index < 0) throw new Error("Post not found.");
      const post = posts[index];
      const claims = Array.isArray(state.publishClaims) ? state.publishClaims : [];
      if (claims.some((item) => item.id === claim.id)) return { claimed: false, claim };
      const actualVersion = Number(post._version || 0);
      if (expectedVersion !== undefined && Number(expectedVersion) !== actualVersion) throw new StorageConflictError("posts", postId, Number(expectedVersion), actualVersion);
      if (!["approved", "scheduled", "retry_ready"].includes(String(post.status || ""))) throw new Error("Post is not approved for publishing.");
      const nextPost = { ...post, status: "publish_claimed", publishingStatus: "publish_claimed", _version: actualVersion + 1 };
      const nextState = { ...state, posts: posts.map((item, i) => i === index ? nextPost : item), publishClaims: [{ ...claim, _version: 1 }, ...claims] };
      await this.writeStateNow(nextState);
      return { claimed: true, claim, state: nextState };
    });
  }

  // Atomic claim: insert each item ONLY if no row with its id already exists in `collection`,
  // and report which items were inserted vs skipped. This is the idempotency primitive under
  // the reactivation send path — a claim must be durable BEFORE the SendGrid call, and a
  // second invocation racing on the same (campaign, contact, step) must lose the insert and
  // skip the send. JSON flavor: the whole read-check-append-write runs on the store's write
  // queue, so two in-process callers cannot both observe "absent". (Cross-process atomicity
  // is the Supabase backend's unique-key job; the JSON backend is local/dev single-process.)
  async claimCollectionItems(collection, items = []) {
    const claim = async () => {
      const state = await this.readState();
      const current = Array.isArray(state[collection]) ? state[collection] : [];
      const existingIds = new Set(current.map((item, index) => coreRecordId(collection, item, index)));
      const inserted = [];
      const skipped = [];
      for (const item of items) {
        const itemId = coreRecordId(collection, item, current.length + inserted.length);
        if (existingIds.has(itemId)) { skipped.push(item); continue; }
        existingIds.add(itemId);
        inserted.push(item);
      }
      if (inserted.length) {
        try {
          await this.writeStateNow({ ...state, [collection]: [...inserted, ...current] });
        } catch (error) {
          this.recordWriteOutcome(error);
          throw error;
        }
      }
      return { inserted, skipped };
    };
    return withJsonFileLock(this.dataPath, claim);
  }
}


export class SupabaseCoreStore extends JsonStore {
  constructor(initialState) {
    super(initialState);
    this.kind = "supabase";
    this.lastError = "";
    // Single-flight read state (2026-07-09 OOM fix). Every readState builds a full
    // ~13k-row object graph; during a send tick the heartbeat, SendGrid webhook bursts,
    // and UI polls each built their OWN concurrent copy, and the sum blew the default
    // ~256MB heap (10 OOM crashes on 2026-07-09, one per hourly tick during send hours).
    // Concurrent readers now share ONE in-flight fetch and ONE returned graph. Safe by
    // the codebase-wide invariant that state transforms are immutable spread-copies
    // (writeChangedCollections already depends on exactly that invariant to diff by
    // reference), so readers never mutate the shared graph in place.
    this._readInFlight = null;
    this._readInFlightGen = -1;
    // Write generation: bumped after EVERY durable mutation (full/scoped writes and
    // claim inserts). A reader may only JOIN an in-flight read that started at the
    // current generation; after a write lands, the next readState starts fresh. Without
    // this, a serialized mutation could read a graph fetched BEFORE the previous
    // mutation's write and compute on stale state (lost update).
    this._writeGen = 0;
    // Cross-request state cache (2026-07-12 latency fix). Before this, EVERY request that
    // touched state re-paged the whole table (~14 round-trips, ~1.5-3s) — 236 readState
    // call sites, so every button click and page load paid it, often twice. The cache
    // holds the LAST successfully hydrated graph and serves it while it is provably
    // current:
    //   - In-process coherence is exact: the cache is keyed to _writeGen, and every
    //     durable mutation (writes AND claims, success or failure) bumps _writeGen, so a
    //     write-then-read can never see the pre-write graph.
    //   - Cross-process coherence (another deploy, a local script against the same table)
    //     is bounded by STATE_CACHE_TTL_MS (default 3000): inside that burst window the
    //     graph is served as-is; past it, ONE cheap signature probe (exact row count +
    //     max updated_at, a single round-trip) decides between reuse and a full refetch.
    //     Every writer in this codebase stamps updated_at on every row, so external
    //     upserts and deletes both move the signature. (Raw-SQL edits that keep
    //     updated_at AND row count unchanged are the documented blind spot.)
    // Readers share the cached graph exactly like single-flight readers always have —
    // the codebase invariant that state transforms are immutable spread-copies is what
    // makes both safe. STATE_CACHE_TTL_MS=0 disables the cache entirely.
    this._stateCache = null;
    this._stateCacheGen = -1;
    this._stateCacheAt = 0;
    this._stateCacheSignature = "";
    this._lastFetchSignature = "";
    // Founder/vNext reads cache each collection independently. A scoped mutation only
    // evicts the collections it can have changed, so unrelated page data stays hot.
    this._collectionCache = new Map();
    this._collectionReadInFlight = new Map();
    this._collectionGeneration = new Map();
    this._readPerformance = (!isHostedProduction(process.env) && String(process.env.NODE_ENV || "").toLowerCase() !== "production")
      || parseBoolean(process.env.COMMAND_CENTER_TEST_MODE)
      ? { supabaseRequests:0, readStateCalls:0, targetedReadCalls:0, returnedRowCount:0, requestedCollectionSets:[] }
      : null;
    // The JsonStore fallback layer parses the on-disk seed/data file (~590KB) on every
    // read. Under the supabase backend that file is static deploy content (all writes go
    // to Supabase), so it is parsed once per process and reused.
    this._fallbackCache = null;
  }

  _stateCacheTtlMs() {
    const raw = process.env.STATE_CACHE_TTL_MS;
    if (raw === undefined || raw === "") return 3000;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3000;
  }

  readPerformanceCounters() {
    if (!this._readPerformance) return null;
    return {
      ...this._readPerformance,
      requestedCollectionSets:this._readPerformance.requestedCollectionSets.map((names) => [...names])
    };
  }

  resetReadPerformanceCounters() {
    if (!this._readPerformance) return null;
    this._readPerformance = { supabaseRequests:0, readStateCalls:0, targetedReadCalls:0, returnedRowCount:0, requestedCollectionSets:[] };
    return this.readPerformanceCounters();
  }

  _invalidateCollectionCache(collectionNames = []) {
    for (const collection of collectionNames) {
      this._collectionCache.delete(collection);
      this._collectionGeneration.set(collection, Number(this._collectionGeneration.get(collection) || 0) + 1);
    }
  }

  async _fallbackState() {
    let fallback = this._fallbackCache;
    if (!fallback) {
      try {
        fallback = (existsSync(this.dataPath) || existsSync(this.seedPath))
          ? await super.readState()
          : { ...this.initialState };
      } catch {
        fallback = { ...this.initialState };
      }
      this._fallbackCache = fallback;
    }
    return fallback;
  }

  async readCollections(collectionNames, options = {}) {
    const names = normalizeCollectionNames(collectionNames);
    if (this._readPerformance) {
      this._readPerformance.targetedReadCalls += 1;
      this._readPerformance.requestedCollectionSets.push([...names]);
    }
    const ttlMs = this._stateCacheTtlMs();
    const now = Date.now();
    const values = new Map();
    const missing = [];
    for (const name of names) {
      const cached = this._collectionCache.get(name);
      if (options.cache !== false && ttlMs > 0 && cached && now - cached.at < ttlMs) values.set(name, cached.value);
      else missing.push(name);
    }
    if (missing.length) {
      const generations = new Map(missing.map((name) => [name, Number(this._collectionGeneration.get(name) || 0)]));
      const key = missing.map((name) => `${name}:${generations.get(name)}`).join("\u0000");
      let inFlight = this._collectionReadInFlight.get(key);
      if (!inFlight) {
        inFlight = this._readCollectionsFresh(missing, options, generations).finally(() => {
          if (this._collectionReadInFlight.get(key) === inFlight) this._collectionReadInFlight.delete(key);
        });
        this._collectionReadInFlight.set(key, inFlight);
      }
      const fetched = await inFlight;
      for (const name of missing) values.set(name, fetched[name]);
    }
    return {
      ...Object.fromEntries(names.map((name) => [name, values.get(name)])),
      persistence:"supabase"
    };
  }

  async _readCollectionsFresh(names, options = {}, generations = new Map()) {
    const collectionFilter = "collection=in.(" + names.map((name) => encodeURIComponent(name)).join(",") + ")";
    const rows = await supabaseFetchAllRows(
      "collection,item_id,payload,version,updated_at",
      collectionFilter,
      {
        signal:options.signal,
        onRequest:() => { if (this._readPerformance) this._readPerformance.supabaseRequests += 1; }
      }
    );
    if (this._readPerformance) this._readPerformance.returnedRowCount += rows.length;
    const state = applyRequestedCoreRecords(await this._fallbackState(), rows, names);
    if (options.cache !== false && this._stateCacheTtlMs() > 0) {
      const cachedAt = Date.now();
      for (const name of names) {
        if (Number(this._collectionGeneration.get(name) || 0) === Number(generations.get(name) || 0)) {
          this._collectionCache.set(name, { value:state[name], at:cachedAt });
        }
      }
    }
    this.lastError = "";
    return state;
  }

  async readState() {
    if (this._readPerformance) this._readPerformance.readStateCalls += 1;
    const ttlMs = this._stateCacheTtlMs();
    // Burst path: same generation (no in-process write since) and inside the TTL window —
    // serve the shared graph with zero round-trips.
    if (
      ttlMs > 0
      && this._stateCache
      && this._stateCacheGen === this._writeGen
      && Date.now() - this._stateCacheAt < ttlMs
    ) {
      return this._stateCache;
    }
    if (this._readInFlight && this._readInFlightGen === this._writeGen) return this._readInFlight;
    const genAtStart = this._writeGen;
    const promise = this._readStateCachedOrFresh(genAtStart, ttlMs).finally(() => {
      if (this._readInFlight === promise) this._readInFlight = null;
    });
    this._readInFlight = promise;
    this._readInFlightGen = genAtStart;
    return promise;
  }

  async _readStateCachedOrFresh(genAtStart, ttlMs) {
    // Probe path: we hold a graph for the current generation but the burst window has
    // passed. One cheap signature request decides between reuse and a full refetch; any
    // probe failure falls through to the authoritative full read.
    if (ttlMs > 0 && this._stateCache && this._stateCacheGen === genAtStart && this._stateCacheSignature) {
      const signature = await this._remoteStateSignature();
      if (signature && signature === this._stateCacheSignature && this._writeGen === genAtStart) {
        this._stateCacheAt = Date.now();
        return this._stateCache;
      }
    }
    const state = await this._readStateFresh();
    // Cache only clean supabase reads, and only if no write landed while the fetch was in
    // flight (a mid-flight write means this graph may be torn; the gen mismatch would
    // make the cache unusable anyway, so don't install it).
    if (ttlMs > 0 && state && state.persistence === "supabase" && this._writeGen === genAtStart) {
      this._stateCache = state;
      this._stateCacheGen = genAtStart;
      this._stateCacheAt = Date.now();
      this._stateCacheSignature = this._lastFetchSignature || "";
    }
    return state;
  }

  // Signature of the remote table: exact row count + newest updated_at, from a single
  // 1-row request. Returns "" when the server cannot provide it (missing headers, error),
  // which callers must treat as "cannot prove freshness" (full refetch).
  async _remoteStateSignature() {
    try {
      if (this._readPerformance) this._readPerformance.supabaseRequests += 1;
      const result = await supabaseRestRequest(
        supabaseRecordsTable + "?select=updated_at&collection=neq.authSessions&order=updated_at.desc&limit=1",
        { prefer: "count=exact", withContentRange: true }
      );
      const total = contentRangeTotal(result?.contentRange || "");
      if (!Number.isFinite(total)) return "";
      if (this._readPerformance) this._readPerformance.returnedRowCount += Array.isArray(result?.data) ? result.data.length : 0;
      const newest = Array.isArray(result?.data) && result.data[0] ? String(result.data[0].updated_at || "") : "";
      return total + "|" + newest;
    } catch {
      return "";
    }
  }

  async _readStateFresh() {
    const fallback = await this._fallbackState();
    try {
      const rows = await supabaseFetchAllRows(
        "collection,item_id,payload,version,updated_at",
        "collection=neq.authSessions",
        {
          onRequest:() => { if (this._readPerformance) this._readPerformance.supabaseRequests += 1; }
        }
      );
      if (this._readPerformance) this._readPerformance.returnedRowCount += rows.length;
      this.lastError = "";
      // Signature of THIS fetch (same shape as _remoteStateSignature): lets the cache
      // later prove via one cheap probe that the table has not moved under it.
      let newest = "";
      for (const row of rows || []) {
        const stamp = String(row?.updated_at || "");
        if (stamp > newest) newest = stamp;
      }
      this._lastFetchSignature = (rows || []).length + "|" + newest;
      return { ...applyCoreRecordsToState(fallback, rows || []), persistence:"supabase" };
    } catch (error) {
      this.lastError = String(error.message || error).slice(0, 500);
      return { ...fallback, persistence:"supabase_unavailable", persistenceError:this.lastError };
    }
  }

  async writeState(state) {
    // Re-arm on failure: the caller must see the rejection, but the QUEUE must not
    // stay rejected, or one failed write would brick every later write until restart.
    const next = this.writeQueue.then(() => this.writeStateNow(state));
    this.writeQueue = next.catch(() => {});
    return next;
  }

  // Scoped write, Supabase flavor: writeStateNow already only upserts + reconciles collections
  // PRESENT in the snapshot, so passing the patch through IS the partial write — no read-merge
  // needed and no risk to absent collections.
  async writeCollections(patch = {}) {
    return this.writeState(patch);
  }

  async writeChanges(before = {}, after = {}) {
    const mutations = coreMutationsBetween(before, after);
    if (!mutations.length) return after;
    for (const mutation of mutations) {
      if (mutation.operation === "upsert") validateMutableRecord(mutation.collection, mutation.item_id, mutation.payload);
    }
    try {
      await supabaseRestRequest("rpc/leos_apply_core_mutations", {
        method:"POST",
        body:{ p_mutations:mutations },
        prefer:"return=representation",
        collection:"batch",
        expectedVersion:"record versions"
      });
      this.lastError = "";
      this.recordWriteOutcome();
      return after;
    } catch (error) {
      this.recordWriteOutcome(error);
      throw error;
    } finally {
      this._invalidateCollectionCache(new Set(mutations.map((mutation) => mutation.collection)));
      this._writeGen += 1;
    }
  }

  async writeStateNow(state) {
    try {
      await this.writeStateToSupabase(state);
      this.lastError = "";
      this.recordWriteOutcome();
    } catch (error) {
      this.recordWriteOutcome(error);
      throw error;
    } finally {
      // Invalidate in-flight read sharing even on failure: a partial write (upsert
      // succeeded, reconcile failed) may have changed rows, so the safe direction is
      // a fresh read.
      this._invalidateCollectionCache(Object.keys(state || {}).filter((name) => coreStateCollections.includes(name)));
      this._writeGen += 1;
    }
  }

  async writeStateToSupabase(state) {
    const rows = coreRecordsFromState(state);
    for (const row of rows) {
      validateMutableRecord(row.collection, row.item_id, row.payload);
    }
    if (rows.length) await supabaseRestRequest("rpc/leos_apply_core_mutations", {
      method: "POST",
      body: { p_mutations: rows.map((row) => ({ operation:"upsert", collection:row.collection, item_id:row.item_id, payload:row.payload, expected_version:row.expected_version })) },
      prefer: "return=representation"
    });
    // Reconcile so the snapshot is the source of truth, matching the JSON backend.
    // Upsert happens first (current data is never at risk); then, within each collection
    // that is present in this snapshot, delete any table rows whose (collection,item_id)
    // is no longer part of the snapshot. This stops regenerated ids and removed items from
    // accumulating as orphan duplicates. Collections absent from the snapshot are left
    // untouched, so a partial state write can never mass-delete persisted data.
    // Append-only ledgers are additionally excluded: their rows can be inserted by a
    // concurrent claimCollectionItems call that this snapshot has never seen, so
    // reconciling them against the snapshot would delete live claims.
    const presentCollections = new Set(
      coreStateCollections.filter(
        (collection) =>
          Object.prototype.hasOwnProperty.call(state, collection)
          && Array.isArray(state[collection])
          && reconcileEligibleCollections.has(collection)
          && !protectedReconcileCollections.has(collection)
      )
    );
    if (presentCollections.size) {
      const keep = new Set(rows.map((row) => row.collection + "\0" + row.item_id));
      // Must page too: a truncated read here would hide orphans past row 1000, leaving stale
      // rows to accumulate (and, before the readState fix, could resurrect deleted items).
      // Scoped to the collections present in THIS snapshot (2026-07-12 latency fix): rows in
      // other collections can never be orphans of this write, so fetching them was pure
      // round-trip cost — for a typical scoped write (one or two collections) this turns a
      // ~14-page full-table sweep into a single small request. Collection names are
      // registry-controlled identifiers (coreStateCollections), safe to embed in the filter.
      const collectionFilter = "collection=in.(" + [...presentCollections].map((name) => encodeURIComponent(name)).join(",") + ")";
      const existing = (await supabaseFetchAllRows("collection,item_id", collectionFilter)) || [];
      const orphans = existing.filter(
        (row) => presentCollections.has(row.collection) && !keep.has(row.collection + "\0" + row.item_id)
      );
      for (let i = 0; i < orphans.length; i += 25) {
        await Promise.all(orphans.slice(i, i + 25).map((row) =>
          supabaseRestRequest(
            supabaseRecordsTable
              + "?collection=eq." + encodeURIComponent(row.collection)
              + "&item_id=eq." + encodeURIComponent(row.item_id),
            { method:"DELETE", prefer:"return=minimal" }
          )
        ));
      }
    }
  }

  // Atomic claim, Supabase flavor: a single conditional INSERT with
  // `on_conflict=(collection,item_id)` + `Prefer: resolution=ignore-duplicates` — PostgREST
  // turns that into INSERT ... ON CONFLICT DO NOTHING RETURNING, so the database's unique key
  // is the atomicity test and the response contains ONLY the rows this caller actually won.
  // Works across processes and restarts, which the in-memory serialization (PR #30) cannot.
  // Errors are recorded in writeHealth and rethrown: a claim that cannot be made durable must
  // fail CLOSED (the caller must not send).
  async claimCollectionItems(collection, items = []) {
    const now = new Date().toISOString();
    const rows = items.map((item) => ({
      collection,
      item_id: coreRecordId(collection, item, 0),
      payload: payloadWithoutVersion(validateMutableRecord(collection, coreRecordId(collection, item, 0), item || {})),
      version: 1,
      updated_at: now
    }));
    if (!rows.length) return { inserted: [], skipped: [] };
    try {
      const returned = await supabaseRestRequest(
        supabaseRecordsTable + "?on_conflict=collection,item_id&select=item_id",
        { method: "POST", body: rows, prefer: "resolution=ignore-duplicates,return=representation" }
      );
      const insertedIds = new Set((Array.isArray(returned) ? returned : []).map((row) => row.item_id));
      const inserted = items.filter((item, index) => insertedIds.has(rows[index].item_id));
      const skipped = items.filter((item, index) => !insertedIds.has(rows[index].item_id));
      this.lastError = "";
      this.recordWriteOutcome();
      return { inserted, skipped };
    } catch (error) {
      this.recordWriteOutcome(error);
      throw error;
    } finally {
      // Claims are durable mutations too: never let a post-claim reader join a
      // pre-claim in-flight read.
      this._invalidateCollectionCache([collection]);
      this._writeGen += 1;
    }
  }

  async appendAuditEvent(event = {}) {
    const safeEvent = validateMutableRecord("auditEvents", event.id, event);
    const returned = await supabaseRestRequest("rpc/leos_append_audit_event", { method: "POST", body: { p_event: safeEvent }, prefer: "return=representation" });
    this._invalidateCollectionCache(["auditEvents"]);
    this._writeGen += 1;
    return Array.isArray(returned) ? returned[0] : returned;
  }

  async claimSocialPublish({ postId, expectedVersion, claim } = {}) {
    const returned = await supabaseRestRequest("rpc/leos_claim_social_publish", {
      method: "POST",
      body: { p_post_id: String(postId), p_expected_version: expectedVersion === undefined ? null : Number(expectedVersion), p_claim: validateMutableRecord("publishClaims", claim.id, claim) },
      prefer: "return=representation"
    });
    this._invalidateCollectionCache(["posts", "publishClaims"]);
    this._writeGen += 1;
    const row = Array.isArray(returned) ? returned[0] : returned;
    return { claimed: Boolean(row?.claimed), claim };
  }

  async mutateCollectionItem(collection, itemId, mutate, options = {}) {
    if (typeof mutate !== "function") throw new Error("A record mutator is required.");
    // Legacy authSessions rows are intentionally inert during this hotfix. Reject
    // unsupported collections before even issuing a targeted Supabase read.
    if (!coreStateCollections.includes(collection)) throw new Error("Unsupported storage collection.");
    const maxRetries = Math.min(3, Math.max(0, Number(options.maxRetries ?? 2)));
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const rows = await supabaseRestRequest(
        `${supabaseRecordsTable}?select=collection,item_id,payload,version&collection=eq.${encodeURIComponent(collection)}&item_id=eq.${encodeURIComponent(itemId)}&limit=1`
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row && !options.createIfMissing) throw new Error("Record not found.");
      const actualVersion = Number(row?.version || 0);
      const expectedVersion = options.expectedVersion !== undefined && options.expectedVersion !== null ? Number(options.expectedVersion) : actualVersion;
      if (expectedVersion !== actualVersion) throw new StorageConflictError(collection, itemId, expectedVersion, actualVersion);
      const changed = validateMutableRecord(collection, itemId, await mutate(row ? { ...row.payload, _version: actualVersion } : null));
      try {
        const returned = await supabaseRestRequest("rpc/leos_upsert_record_cas", {
          method: "POST", collection, itemId, expectedVersion,
          body: { p_collection: collection, p_item_id: String(itemId), p_payload: payloadWithoutVersion(changed), p_expected_version: row ? expectedVersion : null },
          prefer: "return=representation"
        });
        const resultRow = Array.isArray(returned) ? returned[0] : returned;
        this._invalidateCollectionCache([collection]);
        this._writeGen += 1;
        const version = Number(resultRow?.version || actualVersion + 1);
        const record = { ...payloadWithoutVersion(changed), _version:version };
        if (options.returnState === false) return { record, version };
        const state = await this.readState();
        return { state, record, version };
      } catch (error) {
        if (!(error instanceof StorageConflictError) || options.expectedVersion !== undefined || attempt >= maxRetries) throw error;
      }
    }
    throw new StorageConflictError(collection, itemId, options.expectedVersion ?? null);
  }
}

export function createStore(initialState) {
  const backend = requestedStorageBackend();
  if (!localDemoMode() && backend === "supabase" && supabaseDatabaseConfigured()) {
    return new SupabaseCoreStore(initialState);
  }
  if (isHostedProduction(process.env)) {
    assertProductionReadiness(process.env, { activeStorageBackend: "json" });
    throw new Error("Durable production storage is unavailable.");
  }
  if (backend !== "json" || (!localDemoMode() && !parseBoolean(process.env.COMMAND_CENTER_ALLOW_JSON || "false"))) {
    throw new Error("Local JSON storage requires explicit development configuration.");
  }
  return new JsonStore(initialState);
}

export function storageRuntimeConfig() {
  return {
    localDemoMode: localDemoMode(),
    requestedStorageBackend: requestedStorageBackend(),
    activeStorageBackend: !localDemoMode() && requestedStorageBackend() === "supabase" && supabaseDatabaseConfigured() ? "supabase" : "json",
    appBaseUrl: process.env.APP_BASE_URL || process.env.PUBLIC_APP_BASE_URL || "",
    supabaseDbConfigured: supabaseDatabaseConfigured(),
    supabaseRecordsTable
  };
}

export { coreStateCollections, singletonCollections, appendOnlyCollections, coreRecordsFromState, coreMutationsBetween, normalizeCollectionNames, supabaseRequestTimeoutMs, supabaseRestRequest };
