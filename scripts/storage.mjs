import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  "externalActionOutbox",
  "generationBatches",
  "syncRuns",
  "googleInsights",
  "dailyRunPublisherRuns",
  "handoffContractPreviews"
];
const singletonCollections = new Set(["metrics", "runwayInputs", "systemHealth", "leeMemory", "heartbeatLease", "autopilotSettings", "outreachConfig", "prospectConfig", "reactivationCampaign", "sendgridWebhookHealth", "settings"]);
// Append-only safety ledgers: rows are inserted via claimCollectionItems and updated in place,
// NEVER bulk-reconciled away. Excluding them from the snapshot orphan-delete pass means a stale
// in-memory snapshot (the exact mechanism that shredded reactivationContacts on 2026-07-08) can
// never erase a claim that another invocation inserted directly. Deleting a claim would re-open
// the duplicate-send window it exists to close.
const appendOnlyCollections = new Set(["reactivationSendClaims"]);

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

async function supabaseRestRequest(pathname, options = {}) {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    throw new Error("Supabase database env vars are missing.");
  }
  const response = await fetch(supabaseRestBaseUrl() + "/" + String(pathname || "").replace(/^\/+/, ""), {
    method: options.method || "GET",
    headers: supabaseHeaders({
      ...(options.body ? { "content-type":"application/json" } : {}),
      ...(options.prefer ? { prefer: options.prefer } : {}),
      ...(options.headers || {})
    }),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : data?.message || data?.error || response.statusText;
    throw new Error("Supabase DB " + response.status + ": " + detail);
  }
  return data;
}

// PostgREST caps EVERY response at a fixed row count (Supabase default 1000), no matter what
// limit you ask for. So a single unpaginated `select=*` SILENTLY truncates the table the moment
// it grows past the cap — whole collections vanish from hydration with no error. (This is exactly
// how engagementGrowthSnapshots / codebaseHealthSnapshots — and any collection ordered past row
// 1000 — disappeared on read once leos_core_records crossed 1000 rows.) We page with limit+offset
// under a STABLE order (collection,item_id) until a short/empty page proves we've read everything.
const SUPABASE_PAGE_SIZE = 1000;

async function supabaseFetchAllRows(selectColumns) {
  const base = supabaseRecordsTable + "?select=" + selectColumns + "&order=collection.asc,item_id.asc";
  const all = [];
  let offset = 0;
  let pageSize = 0;
  // The server's effective cap is whatever the first request returns; once a page comes back
  // smaller than that cap we've reached the end. The hard page ceiling is a runaway guard in
  // case a server ever ignored offset (it would otherwise loop forever).
  for (let page = 0; page < 100000; page += 1) {
    const rows = (await supabaseRestRequest(base + "&limit=" + SUPABASE_PAGE_SIZE + "&offset=" + offset)) || [];
    if (!rows.length) break;
    all.push(...rows);
    if (pageSize === 0) pageSize = rows.length;
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
      items.forEach((item, index) => addRow({ collection, item_id: coreRecordId(collection, item, index), payload: item || {}, updated_at: new Date().toISOString() }));
    } else if (typeof value === "object") {
      addRow({ collection, item_id: "singleton", payload: value, updated_at: new Date().toISOString() });
    }
  }
  return [...rowsByKey.values()];
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
      next[collection] = records[0]?.payload || {};
    } else {
      next[collection] = records.map((row) => row.payload).filter(Boolean);
    }
  }
  if (!next.dataRoomItems?.length && Array.isArray(next.dataRoom)) next.dataRoomItems = next.dataRoom;
  if (!next.dataRoom?.length && Array.isArray(next.dataRoomItems)) next.dataRoom = next.dataRoomItems;
  return next;
}

function loadLocalEnv() {
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
    await supabaseRestRequest(supabaseRecordsTable + "?select=collection,item_id&limit=1");
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

  async writeState(state) {
    this.writeQueue = this.writeQueue.then(() => this.writeStateNow(state));
    return this.writeQueue;
  }

  // Scoped write: persist ONLY the collections in `patch`, leaving everything else untouched.
  // The JSON backend rewrites the whole file, so a partial state must be merged into a fresh
  // read first — writing `patch` directly would WIPE every other collection from the file.
  // (The Supabase backend overrides this with a true partial write.)
  async writeCollections(patch = {}) {
    const state = await this.readState();
    return this.writeState({ ...state, ...patch });
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
      failedWriteCount: this.failedWriteCount || 0
    };
  }

  async generatePosts(posts) {
    const state = await this.readState();
    state.posts = [...(state.posts || []), ...posts];
    await this.writeCollections({ posts: state.posts });
    return state;
  }

  async updatePost(id, patch) {
    const state = await this.readState();
    state.posts = (state.posts || []).map((post) =>
      post.id === id ? { ...post, ...patch, updatedAt: new Date().toISOString() } : post
    );
    await this.writeCollections({ posts: state.posts });
    return state;
  }

  async addLibraryItem(item) {
    const state = await this.readState();
    state.library = [item, ...(state.library || [])];
    await this.writeCollections({ library: state.library });
    return state;
  }

  async savePostImage(image) {
    const state = await this.readState();
    state.postImages = [image, ...(state.postImages || []).filter((item) => item.id !== image.id)];
    await this.writeCollections({ postImages: state.postImages });
    return state;
  }

  async addBrandAsset(asset) {
    const state = await this.readState();
    state.brandAssets = [asset, ...(state.brandAssets || [])];
    await this.writeCollections({ brandAssets: state.brandAssets });
    return state;
  }

  async addBrandRule(rule) {
    const state = await this.readState();
    state.brandRules = [rule, ...(state.brandRules || [])];
    await this.writeCollections({ brandRules: state.brandRules });
    return state;
  }

  async upsertGenerationProfile(profile) {
    const state = await this.readState();
    state.generationProfiles = [profile, ...(state.generationProfiles || []).filter((item) => item.id !== profile.id)];
    await this.writeCollections({ generationProfiles: state.generationProfiles });
    return state;
  }

  async updateSocialAccount(platform, patch) {
    const state = await this.readState();
    const existing =
      (state.socialAccounts || []).find((account) => account.platform === platform) ||
      (this.initialState.socialAccounts || []).find((account) => account.platform === platform) ||
      { id: `channel-${platform}`, platform };
    const account = { ...existing, ...patch, platform, updatedAt: new Date().toISOString() };
    state.socialAccounts = [account, ...(state.socialAccounts || []).filter((item) => item.platform !== platform)];
    // Scoped: this method is reachable from the PUBLIC Google OAuth callback (any bot GET with
    // ?error= writes an error status), so a full-state write here carried the same clobber
    // exposure as the PR #30 denial-storm path. Only socialAccounts changes; only it is written.
    await this.writeCollections({ socialAccounts: state.socialAccounts });
    return state;
  }

  async addPublishEvent(event) {
    const state = await this.readState();
    state.publishEvents = [event, ...(state.publishEvents || [])].slice(0, 500);
    await this.writeCollections({ publishEvents: state.publishEvents });
    return state;
  }

  async updateSettings(patch) {
    const state = await this.readState();
    state.settings = { ...(state.settings || {}), ...patch };
    await this.writeCollections({ settings: state.settings });
    return state;
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
    const result = this.writeQueue.then(claim, claim);
    // Keep the queue itself always-resolved so one failed claim cannot poison later writes.
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}


export class SupabaseCoreStore extends JsonStore {
  constructor(initialState) {
    super(initialState);
    this.kind = "supabase";
    this.lastError = "";
  }

  async readState() {
    let fallback = { ...this.initialState };
    try {
      if (existsSync(this.dataPath) || existsSync(this.seedPath)) fallback = await super.readState();
    } catch {
      fallback = { ...this.initialState };
    }
    try {
      const rows = await supabaseFetchAllRows("collection,item_id,payload,updated_at");
      this.lastError = "";
      return { ...applyCoreRecordsToState(fallback, rows || []), persistence:"supabase" };
    } catch (error) {
      this.lastError = String(error.message || error).slice(0, 500);
      return { ...fallback, persistence:"supabase_unavailable", persistenceError:this.lastError };
    }
  }

  async writeState(state) {
    this.writeQueue = this.writeQueue.then(() => this.writeStateNow(state));
    return this.writeQueue;
  }

  // Scoped write, Supabase flavor: writeStateNow already only upserts + reconciles collections
  // PRESENT in the snapshot, so passing the patch through IS the partial write — no read-merge
  // needed and no risk to absent collections.
  async writeCollections(patch = {}) {
    return this.writeState(patch);
  }

  async writeStateNow(state) {
    try {
      await this.writeStateToSupabase(state);
      this.lastError = "";
      this.recordWriteOutcome();
    } catch (error) {
      this.recordWriteOutcome(error);
      throw error;
    }
  }

  async writeStateToSupabase(state) {
    const rows = coreRecordsFromState(state);
    if (rows.length) {
      await supabaseRestRequest(supabaseRecordsTable + "?on_conflict=collection,item_id", {
        method:"POST",
        body: rows,
        prefer:"resolution=merge-duplicates,return=minimal"
      });
    }
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
        (collection) => state[collection] !== undefined && !appendOnlyCollections.has(collection)
      )
    );
    if (presentCollections.size) {
      const keep = new Set(rows.map((row) => row.collection + "\0" + row.item_id));
      // Must page too: a truncated read here would hide orphans past row 1000, leaving stale
      // rows to accumulate (and, before the readState fix, could resurrect deleted items).
      const existing = (await supabaseFetchAllRows("collection,item_id")) || [];
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
      payload: item || {},
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
    }
  }
}

export function createStore(initialState) {
  const backend = requestedStorageBackend();
  if (!localDemoMode() && backend === "supabase" && supabaseDatabaseConfigured()) {
    return new SupabaseCoreStore(initialState);
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

export { coreStateCollections, singletonCollections, appendOnlyCollections, coreRecordsFromState, supabaseRestRequest };
