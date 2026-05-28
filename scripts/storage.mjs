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
  "systemHealth",
  "soc2AuditLogs",
  "auditHistory",
  "events",
  "tasks",
  "supportIssues",
  "evidencePackNotes",
  "autonomyActions",
  "autonomyDecisions",
  "autonomyRuns",
  "activityEvents",
  "reports",
  "funnelSnapshots",
  "captureInbox",
  "conversationNotes",
  "morningBriefs",
  "eveningReflections",
  "operatingMemory",
  "dailyCloseouts",
  "reviewStates",
  "osHealthSnapshots",
  "smokeTestRuns",
  "dataIntegritySnapshots",
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
  "leeMemory"
];
const singletonCollections = new Set(["metrics", "systemHealth", "leeMemory"]);

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

function coreRecordId(collection, item, index = 0) {
  if (singletonCollections.has(collection)) return "singleton";
  return String(item?.id || item?.postId || item?.title || item?.name || collection + "-" + index);
}

function coreRecordsFromState(state = {}) {
  const rows = [];
  for (const collection of coreStateCollections) {
    const value = state[collection];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => rows.push({ collection, item_id: coreRecordId(collection, item, index), payload: item || {}, updated_at: new Date().toISOString() }));
    } else if (typeof value === "object") {
      rows.push({ collection, item_id: "singleton", payload: value, updated_at: new Date().toISOString() });
    }
  }
  return rows;
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

  async writeStateNow(state) {
    await this.ensure();
    const { persistence, ...persistedState } = state;
    persistedState.postImages = (persistedState.postImages || []).map(compactPostImageForLocal);
    const tempPath = `${this.dataPath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(tempPath, JSON.stringify(persistedState, null, 2));
    await rename(tempPath, this.dataPath);
  }

  async generatePosts(posts) {
    const state = await this.readState();
    state.posts = [...(state.posts || []), ...posts];
    await this.writeState(state);
    return state;
  }

  async updatePost(id, patch) {
    const state = await this.readState();
    state.posts = (state.posts || []).map((post) =>
      post.id === id ? { ...post, ...patch, updatedAt: new Date().toISOString() } : post
    );
    await this.writeState(state);
    return state;
  }

  async addLibraryItem(item) {
    const state = await this.readState();
    state.library = [item, ...(state.library || [])];
    await this.writeState(state);
    return state;
  }

  async savePostImage(image) {
    const state = await this.readState();
    state.postImages = [image, ...(state.postImages || []).filter((item) => item.id !== image.id)];
    await this.writeState(state);
    return state;
  }

  async addBrandAsset(asset) {
    const state = await this.readState();
    state.brandAssets = [asset, ...(state.brandAssets || [])];
    await this.writeState(state);
    return state;
  }

  async addBrandRule(rule) {
    const state = await this.readState();
    state.brandRules = [rule, ...(state.brandRules || [])];
    await this.writeState(state);
    return state;
  }

  async upsertGenerationProfile(profile) {
    const state = await this.readState();
    state.generationProfiles = [profile, ...(state.generationProfiles || []).filter((item) => item.id !== profile.id)];
    await this.writeState(state);
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
    await this.writeState(state);
    return state;
  }

  async addPublishEvent(event) {
    const state = await this.readState();
    state.publishEvents = [event, ...(state.publishEvents || [])].slice(0, 500);
    await this.writeState(state);
    return state;
  }

  async updateSettings(patch) {
    const state = await this.readState();
    state.settings = { ...(state.settings || {}), ...patch };
    await this.writeState(state);
    return state;
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
      const rows = await supabaseRestRequest(supabaseRecordsTable + "?select=collection,item_id,payload,updated_at");
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

  async writeStateNow(state) {
    const rows = coreRecordsFromState(state);
    if (!rows.length) return;
    await supabaseRestRequest(supabaseRecordsTable + "?on_conflict=collection,item_id", {
      method:"POST",
      body: rows,
      prefer:"resolution=merge-duplicates,return=minimal"
    });
    this.lastError = "";
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

export { coreStateCollections, coreRecordsFromState, supabaseRestRequest };
