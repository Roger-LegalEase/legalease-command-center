import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dataPath = path.join(dataDir, "social-command-center.json");

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

function compactPostImageForLocal(image = {}) {
  return {
    ...image,
    imageUrl: image.imageUrl || "",
    finalImageUrl: image.finalImageUrl || "",
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
  return {
    configured,
    connected: false,
    mode: "local_json_fallback",
    error: configured
      ? "Supabase runtime store is disabled locally. Using local JSON fallback."
      : "Supabase env vars are missing. Using local JSON fallback."
  };
}

export class JsonStore {
  constructor(initialState) {
    this.initialState = initialState;
    this.kind = "json";
    this.writeQueue = Promise.resolve();
  }

  async ensure() {
    await mkdir(dataDir, { recursive: true });
    if (!existsSync(dataPath)) {
      await writeFile(dataPath, JSON.stringify(this.initialState, null, 2));
    }
  }

  async readState() {
    await this.ensure();
    let rawState = {};
    try {
      rawState = JSON.parse(await readFile(dataPath, "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
      rawState = JSON.parse(await readFile(dataPath, "utf8"));
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
    const tempPath = `${dataPath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(tempPath, JSON.stringify(persistedState, null, 2));
    await rename(tempPath, dataPath);
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

export function createStore(initialState) {
  return new JsonStore(initialState);
}
