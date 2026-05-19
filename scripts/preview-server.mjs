import http from "node:http";
import crypto from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, getSupabaseHealth } from "./storage.mjs";
import {
  channelSetup,
  channelSetupMessage,
  exchangeLinkedInCode,
  fetchLinkedInUserInfo,
  linkedinAuthorizationUrl,
  publicChannelSetup
} from "./channel-connectors.mjs";

const port = Number(process.env.PORT ?? 3000);
const assetRoot = new URL("../", import.meta.url);
const assetCache = new Map();
const designSystem = loadDesignSystem();
loadLocalEnv();

function assetDataUri(relativePath, mimeType = "image/png") {
  if (assetCache.has(relativePath)) return assetCache.get(relativePath);
  const assetUrl = new URL(relativePath, assetRoot);
  if (!existsSync(assetUrl)) return "";
  try {
    const encoded = readFileSync(assetUrl).toString("base64");
    const uri = `data:${mimeType};base64,${encoded}`;
    assetCache.set(relativePath, uri);
    return uri;
  } catch {
    return "";
  }
}

function assetFileUrl(asset) {
  if (!asset?.fileUrl) return null;
  if (asset.assetType === "wilma_reference" && (asset.isDefault || (asset.tags || []).includes("canonical"))) {
    const normalizedUrl = new URL("assets/brand/wilma/wilma-reference-openai.png", assetRoot);
    if (existsSync(normalizedUrl)) return normalizedUrl;
  }
  const assetUrl = new URL(asset.fileUrl, assetRoot);
  if (existsSync(assetUrl)) return assetUrl;
  if (logoKind(asset) === "full_logo") {
    const fullLogoUrl = new URL("assets/brand/logos/legalease-logo-2025-ob.png", assetRoot);
    if (existsSync(fullLogoUrl)) return fullLogoUrl;
  }
  if (logoKind(asset) === "symbol") {
    const symbolUrl = new URL("assets/brand/logos/legalease-mark-white.png", assetRoot);
    if (existsSync(symbolUrl)) return symbolUrl;
  }
  if (asset.assetType === "wilma_reference" && (asset.isDefault || (asset.tags || []).includes("canonical"))) {
    const canonicalUrl = new URL("assets/brand/wilma/new-wilma-2025.png", assetRoot);
    if (existsSync(canonicalUrl)) return canonicalUrl;
  }
  return null;
}

const wilmaPoseMetadata = {
  1: ["primary stance", "primary_stance"],
  2: ["3/4 view", "three_quarter_view"],
  3: ["side view", "side_view"],
  4: ["back view", "back_view"],
  5: ["back 3/4 view", "back_three_quarter_view"],
  6: ["happy", "happy"],
  7: ["wave", "wave"],
  8: ["surprised", "surprised"],
  9: ["concerned", "concerned"],
  10: ["thumbs up", "thumbs_up"],
  11: ["presenting", "presenting"],
  12: ["confused", "confused"],
  13: ["walking", "walking"],
  14: ["confident arms crossed", "confident"],
  15: ["excited", "excited"],
  16: ["empathetic", "empathetic"],
  17: ["determined", "determined"],
  18: ["front view", "front_view"],
  19: ["pointing", "pointing"],
  20: ["thinking", "thinking"],
  21: ["tablet", "tablet"],
  22: ["encouraging", "encouraging"],
  23: ["laughing", "laughing"]
};

const allowedAssetTypes = ["wilma_pose", "background", "brand_mark"];
const allowedAssetExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
const poseExpressionCategories = [
  "Helpful",
  "Empathetic",
  "Confident",
  "Explaining",
  "Myth-checking",
  "Celebratory",
  "Serious but warm",
  "Curious",
  "Reassuring",
  "Determined"
];
const poseCategoryByNumber = {
  1: "Helpful",
  2: "Confident",
  3: "Explaining",
  4: "Serious but warm",
  5: "Curious",
  6: "Celebratory",
  7: "Helpful",
  8: "Curious",
  9: "Empathetic",
  10: "Confident",
  11: "Explaining",
  12: "Curious",
  13: "Determined",
  14: "Confident",
  15: "Celebratory",
  16: "Empathetic",
  17: "Determined",
  18: "Reassuring",
  19: "Explaining",
  20: "Curious",
  21: "Helpful",
  22: "Reassuring",
  23: "Celebratory"
};

function defaultWilmaPoseMappings() {
  return Array.from({ length: 23 }, (_, index) => {
    const number = index + 1;
    const [rawLabel, key] = wilmaPoseMetadata[number] || [`pose ${number}`, `pose_${number}`];
    const ref = `wilma-pose-${String(number).padStart(2, "0")}`;
    const category = poseExpressionCategories.includes(poseCategoryByNumber[number])
      ? poseCategoryByNumber[number]
      : "Helpful";
    return {
      id: ref,
      poseRefNumber: number,
      expressionCategory: category,
      label: `Wilma pose ${number}: ${rawLabel}`,
      recommendedUse: `Use for ${category.toLowerCase()} LegalEase posts that need a calm, plain-English Wilma guide visual.`,
      linkedAssetId: number === 1 ? "local-wilma-pose-01" : "",
      fallbackPlaceholder: `Fallback branded Wilma placeholder for ${rawLabel}.`,
      key,
      active: true
    };
  });
}

function localAssetDownloadUrl(filePath = "") {
  const clean = String(filePath || "").replace(/^\/+/, "");
  return clean ? `/${clean}` : "";
}

function normalizeLocalAssetPath(filePath = "") {
  const raw = String(filePath || "").trim().replace(/^\/+/, "");
  const normalized = path.posix.normalize(raw).replace(/^\/+/, "");
  if (!normalized.startsWith("data/assets/")) return "";
  if (normalized.includes("../") || normalized === "data/assets" || normalized === "data/assets/") return "";
  const ext = normalized.split(".").pop()?.toLowerCase() || "";
  if (!allowedAssetExtensions.has(ext)) return "";
  return normalized;
}

function localAssetFileUrl(filePath = "") {
  const clean = normalizeLocalAssetPath(filePath);
  if (!clean) return null;
  const assetUrl = new URL(clean, assetRoot);
  const assetPath = fileURLToPath(assetUrl);
  const dataAssetsRoot = fileURLToPath(new URL("data/assets/", assetRoot));
  if (!assetPath.startsWith(dataAssetsRoot)) return null;
  return assetUrl;
}

async function validateLocalAssetFile(filePath = "") {
  const clean = normalizeLocalAssetPath(filePath);
  if (!clean) return { ok: false, message: "Asset path must stay under data/assets/ and use png, jpg, jpeg, or webp." };
  const assetUrl = localAssetFileUrl(clean);
  if (!assetUrl) return { ok: false, message: "Asset path is not safe." };
  try {
    const info = await stat(assetUrl);
    if (!info.isFile()) return { ok: false, message: "Asset path must point to a file." };
    await readFile(assetUrl);
    return { ok: true, filePath: clean, fileSize: info.size, downloadUrl: localAssetDownloadUrl(clean) };
  } catch {
    return { ok: false, message: "Asset file was not found or is not readable." };
  }
}

function localAssetsForState(state = {}, type = "") {
  const assets = state.settings?.localAssets || [];
  return assets.filter((asset) => asset.active !== false && (!type || asset.type === type));
}

function localAssetById(state = {}, id = "") {
  return localAssetsForState(state).find((asset) => asset.id === id) || null;
}

function poseMappingsForState(state = {}) {
  const current = state.settings?.wilmaPoseMappings || [];
  const byId = new Map(current.map((item) => [item.id || `wilma-pose-${String(item.poseRefNumber).padStart(2, "0")}`, item]));
  return defaultWilmaPoseMappings().map((seed) => ({ ...seed, ...(byId.get(seed.id) || {}) }));
}

function linkedAssetForPose(state = {}, poseRefId = "") {
  const mapping = poseMappingsForState(state).find((item) => item.id === poseRefId);
  return localAssetById(state, mapping?.linkedAssetId || "") || null;
}

function wilmaPoseAssetsFromDisk() {
  const poseDir = new URL("assets/brand/wilma/poses/", assetRoot);
  if (!existsSync(poseDir)) return [];
  try {
    if (lstatSync(fileURLToPath(poseDir)).isSymbolicLink()) return [];
  } catch {
    return [];
  }
  return readdirSync(poseDir)
    .filter((file) => /^\d+\.png$/i.test(file))
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))
    .map((file) => {
      const number = Number(file.replace(/\D/g, ""));
      const [label, key] = wilmaPoseMetadata[number] || [`pose ${number}`, `pose_${number}`];
      return {
        id: `wilma-pose-${String(number).padStart(2, "0")}`,
        name: `Wilma canonical pose: ${label}`,
        slug: `wilma-canonical-pose-${key}`,
        assetType: "wilma_reference",
        fileUrl: `assets/brand/wilma/poses/${file}`,
        mimeType: "image/png",
        fileSize: 0,
        width: 1856,
        height: 1312,
        approved: true,
        isDefault: false,
        tags: ["wilma", "canonical-pose", "pose-library", "reference-only", key],
        version: 1
      };
    });
}

function loadDesignSystem() {
  const designUrl = new URL("../DESIGN.md", import.meta.url);
  const fallback = {
    version: "fallback",
    colors: {
      legalBlue: "#020D66",
      horizonOrange: "#F04800",
      skylineBlue: "#B8D8D8",
      paperWhite: "#F7F3EA",
      civicBlack: "#111111",
      infrastructureGray: "#D8D3C8",
      legalBlueLight: "#3040BF",
      horizonOrangeLight: "#F98C30",
      softLight: "#E5EBEB",
      white: "#FFFFFF"
    },
    text: ""
  };
  if (!existsSync(designUrl)) {
    return { ...fallback, version: "missing" };
  }
  let text = "";
  try {
    text = readFileSync(designUrl, "utf8");
  } catch (error) {
    console.warn(`Design system unavailable, using fallback tokens: ${error.message}`);
    return fallback;
  }
  const readToken = (key, fallback) => {
    const match = text.match(new RegExp(`${key}:[\\s\\S]*?value:\\s*"([^"]+)"`));
    return match?.[1] || fallback;
  };
  return {
    version: text.match(/^version:\s*([^\n]+)/m)?.[1]?.trim() || "1.0",
    colors: {
      legalBlue: readToken("legal_blue", "#020D66"),
      horizonOrange: readToken("horizon_orange", "#F04800"),
      skylineBlue: readToken("skyline_blue", "#B8D8D8"),
      paperWhite: readToken("paper_white", "#F7F3EA"),
      civicBlack: readToken("civic_black", "#111111"),
      infrastructureGray: readToken("infrastructure_gray", "#D8D3C8"),
      legalBlueLight: readToken("legal_blue_light", "#3040BF"),
      horizonOrangeLight: readToken("horizon_orange_light", "#F98C30"),
      softLight: readToken("soft_light", "#E5EBEB"),
      white: readToken("white", "#FFFFFF")
    },
    text
  };
}

function logoKind(asset) {
  const tags = asset?.tags || [];
  if (asset?.assetType === "icon" || tags.includes("icon") || tags.includes("symbol") || tags.includes("mark")) return "symbol";
  return "full_logo";
}

function logoColorMode(asset) {
  const tags = asset?.tags || [];
  if (tags.includes("white")) return "white";
  if (tags.includes("black")) return "black";
  return "official";
}

function approvedLogoAssets(assets) {
  return (assets || [])
    .filter((asset) => asset.approved && ["logo", "icon"].includes(asset.assetType) && assetFileUrl(asset))
    .sort((a, b) => {
      const aFull = logoKind(a) === "full_logo" ? 1 : 0;
      const bFull = logoKind(b) === "full_logo" ? 1 : 0;
      const aDefault = a.isDefault ? 1 : 0;
      const bDefault = b.isDefault ? 1 : 0;
      return bDefault - aDefault || bFull - aFull;
    });
}

function loadLocalEnv() {
  const envUrl = new URL("../.env.local", import.meta.url);
  if (!existsSync(envUrl)) return;
  let lines = [];
  try {
    lines = readFileSync(envUrl, "utf8").split(/\r?\n/);
  } catch (error) {
    console.warn(`Local env file unavailable: ${error.message}`);
    return;
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const platforms = ["linkedin", "x", "facebook", "instagram", "threads"];
const platformLabels = {
  linkedin: "LinkedIn",
  x: "X / Twitter",
  facebook: "Facebook Page",
  instagram: "Instagram",
  threads: "Threads"
};
const channelLabels = platformLabels;
const channelDescriptions = {
  linkedin: "Institutional POV, funders, workforce, partnerships.",
  x: "Short observations, punchy takes, founder voice, sharp LegalEase POV.",
  facebook: "Community trust, local updates, plain-English education, partner posts.",
  instagram: "Image-first Wilma explainers, myth checks, campaign posters, community trust.",
  threads: "Plain-English commentary, myth checks, short conversations."
};
const channelRequiredEnv = {
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_REDIRECT_URI"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI"],
  facebook: ["META_CLIENT_ID", "META_CLIENT_SECRET", "META_REDIRECT_URI"],
  instagram: ["META_CLIENT_ID", "META_CLIENT_SECRET", "META_REDIRECT_URI"],
  threads: ["THREADS_CLIENT_ID", "THREADS_CLIENT_SECRET", "THREADS_REDIRECT_URI"]
};

const livePostingEnvKeys = {
  linkedin: ["ENABLE_LIVE_LINKEDIN_POSTING"],
  x: ["ENABLE_LIVE_X_POSTING", "ENABLE_LIVE_TWITTER_POSTING"],
  facebook: ["ENABLE_LIVE_FACEBOOK_POSTING"],
  instagram: ["ENABLE_LIVE_INSTAGRAM_POSTING"],
  threads: ["ENABLE_LIVE_THREADS_POSTING"]
};

function livePostingEnabledForChannel(channel) {
  return (livePostingEnvKeys[channel] || []).some((key) => process.env[key] === "true");
}

function liveGateSummary(channel) {
  const keys = livePostingEnvKeys[channel] || [];
  return {
    channel,
    enabled: livePostingEnabledForChannel(channel),
    envVars: keys
  };
}

function graphApiVersion() {
  return process.env.META_GRAPH_VERSION || "v24.0";
}

function graphUrl(pathname = "") {
  return `https://graph.facebook.com/${graphApiVersion()}${pathname}`;
}

function threadsGraphUrl(pathname = "") {
  return `https://graph.threads.net/v1.0${pathname}`;
}

function publicAppBaseUrl() {
  return String(process.env.PUBLIC_APP_BASE_URL || process.env.APP_PUBLIC_URL || "").replace(/\/+$/, "");
}

function finalImagePublicUrl(image = {}) {
  const value = String(image.finalImageUrl || image.finalPngUrl || image.imageUrl || "").trim();
  if (/^https:\/\//i.test(value) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) return value;
  if (value.startsWith("/") && publicAppBaseUrl()) return `${publicAppBaseUrl()}${value}`;
  return "";
}

function accountEnvAccessToken(platform = "") {
  if (platform === "facebook") return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || "";
  if (platform === "instagram") return process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
  if (platform === "threads") return process.env.THREADS_ACCESS_TOKEN || "";
  if (platform === "x") return process.env.X_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN || "";
  return "";
}

function accountEnvId(platform = "") {
  if (platform === "facebook") return process.env.FACEBOOK_PAGE_ID || process.env.META_PAGE_ID || "";
  if (platform === "instagram") return process.env.INSTAGRAM_USER_ID || process.env.IG_USER_ID || "";
  if (platform === "threads") return process.env.THREADS_USER_ID || "";
  if (platform === "x") return process.env.X_USER_ID || process.env.TWITTER_USER_ID || "";
  return "";
}

function envConnectedForChannel(platform = "") {
  if (platform === "linkedin") return false;
  if (platform === "x") return Boolean(accountEnvAccessToken("x"));
  return Boolean(accountEnvAccessToken(platform) && accountEnvId(platform));
}

const credentialSpecs = [
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API key",
    category: "openai",
    severity: "required",
    description: "Generates content and images.",
    nextAction: "Add OPENAI_API_KEY to .env.local."
  },
  {
    key: "OAUTH_TOKEN_ENCRYPTION_KEY",
    label: "OAuth token encryption key",
    category: "core",
    severity: "required",
    description: "Encrypts stored social account tokens.",
    nextAction: "Add a long random OAUTH_TOKEN_ENCRYPTION_KEY before connecting channels."
  },
  {
    key: "SUPABASE_URL",
    label: "Supabase URL",
    category: "supabase",
    severity: "required",
    description: "Production database URL.",
    nextAction: "Add SUPABASE_URL from Supabase project settings."
  },
  {
    key: "SUPABASE_ANON_KEY",
    label: "Supabase anon key",
    category: "supabase",
    severity: "recommended",
    description: "Supabase public anon key for schema checks and fallback API access.",
    nextAction: "Add SUPABASE_ANON_KEY from Supabase API settings."
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase service role key",
    category: "supabase",
    severity: "required",
    description: "Server-side persistence key. Never expose this in the browser.",
    nextAction: "Add SUPABASE_SERVICE_ROLE_KEY for server-side persistence."
  },
  ...channelRequiredEnv.linkedin.map((key) => ({
    key,
    label: `LinkedIn ${key.replace("LINKEDIN_", "").replaceAll("_", " ").toLowerCase()}`,
    category: "linkedin",
    severity: "required",
    description: "Required for LinkedIn OAuth.",
    nextAction: `Add ${key} to .env.local.`
  })),
  ...["META_APP_ID", "META_CLIENT_ID", "META_APP_SECRET", "META_CLIENT_SECRET", "META_REDIRECT_URI"].map((key) => ({
    key,
    label: `Meta ${key.replace("META_", "").replaceAll("_", " ").toLowerCase()}`,
    category: "meta",
    severity: key === "META_APP_ID" || key === "META_APP_SECRET" ? "recommended" : "required",
    description: "Meta powers Facebook Page and Instagram.",
    nextAction: `Add ${key} to .env.local.`
  })),
  ...["PUBLIC_APP_BASE_URL", "FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN", "INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"].map((key) => ({
    key,
    label: key.replaceAll("_", " ").toLowerCase(),
    category: "meta",
    severity: key === "PUBLIC_APP_BASE_URL" || key === "FACEBOOK_PAGE_ACCESS_TOKEN" || key === "INSTAGRAM_ACCESS_TOKEN" ? "required" : "recommended",
    description: "Required for Facebook Page and Instagram live publishing.",
    nextAction: `Add ${key} to .env.local when enabling Meta live publishing.`
  })),
  ...["THREADS_USER_ID", "THREADS_ACCESS_TOKEN"].map((key) => ({
    key,
    label: key.replaceAll("_", " ").toLowerCase(),
    category: "threads",
    severity: "required",
    description: "Required for Threads live publishing.",
    nextAction: `Add ${key} to .env.local when enabling Threads.`
  })),
  ...["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI", "TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_TOKEN_SECRET"].map((key) => ({
    key,
    label: `X / Twitter ${key.replace(/^X_|^TWITTER_/, "").replaceAll("_", " ").toLowerCase()}`,
    category: "x",
    severity: key.startsWith("X_") ? "required" : "optional",
    description: "Required later for X / Twitter OAuth or API posting.",
    nextAction: `Add ${key} to .env.local when enabling X / Twitter.`
  })),
  {
    key: "X_ACCESS_TOKEN",
    label: "X / Twitter access token",
    category: "x",
    severity: "required",
    description: "Server-side OAuth 2 user token for X live publishing.",
    nextAction: "Add X_ACCESS_TOKEN to .env.local when enabling X / Twitter."
  },
  ...Object.values(livePostingEnvKeys).flat().map((key) => ({
    key,
    label: key.replace("ENABLE_LIVE_", "").replace("_POSTING", "").replaceAll("_", " ") + " live gate",
    category: "live-gate",
    severity: "required",
    description: "Must remain disabled until dry runs pass.",
    nextAction: `Keep ${key}=false until launch readiness passes.`
  })),
  {
    key: "USE_SUPABASE_JS_STORE",
    label: "Supabase JS store switch",
    category: "supabase",
    severity: "recommended",
    description: "Turns on Supabase runtime persistence when stable.",
    nextAction: "Keep USE_SUPABASE_JS_STORE=false until diagnostics pass without hanging."
  }
];

function envValue(key) {
  if (key === "META_CLIENT_ID") return process.env.META_CLIENT_ID || process.env.META_APP_ID || "";
  if (key === "META_CLIENT_SECRET") return process.env.META_CLIENT_SECRET || process.env.META_APP_SECRET || "";
  return process.env[key] || "";
}

function validLookingCredential(key, value) {
  if (!value) return false;
  if (key.endsWith("_REDIRECT_URI")) return /^https?:\/\/.+\/api\/oauth\/[^/]+\/callback/i.test(value);
  if (key === "SUPABASE_URL") return /^https:\/\/.+\.supabase\.co$/i.test(value);
  if (key.startsWith("ENABLE_LIVE_") || key === "USE_SUPABASE_JS_STORE") return ["true", "false"].includes(String(value).toLowerCase());
  if (key === "OAUTH_TOKEN_ENCRYPTION_KEY") return String(value).length >= 24;
  return String(value).trim().length >= 8;
}

function getCredentialReadiness() {
  return credentialSpecs.map((spec) => {
    const value = envValue(spec.key);
    const present = Boolean(value);
    const enabled = String(value).toLowerCase() === "true";
    return {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      description: spec.description,
      severity: spec.severity,
      status: present ? "present" : "missing",
      enabled,
      validLooking: present ? validLookingCredential(spec.key, value) : false,
      nextAction: present ? (validLookingCredential(spec.key, value) ? "No action needed." : `Check ${spec.key}; it does not look complete.`) : spec.nextAction
    };
  });
}

function safeChannelStatus(account = {}) {
  const setup = publicChannelSetup(account.platform);
  const envConnected = envConnectedForChannel(account.platform);
  const envAccountId = accountEnvId(account.platform);
  const connected = Boolean(account.externalAccountId || account.accountId || account.accountName || account.connectedAt || envConnected);
  const tokenExpiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;
  const expired = connected && tokenExpiresAt && tokenExpiresAt.getTime() <= Date.now();
  let status = account.status || "not_configured";
  if (!setup.configured && !envConnected) status = "setup_required";
  else if (account.lastError || status === "error") status = "error";
  else if (expired || status === "expired") status = "expired";
  else if (connected || status === "connected") status = "connected";
  else status = "ready_to_connect";
  return {
    channel: account.platform,
	    displayName: channelLabels[account.platform] || account.displayName || account.platform,
	    status,
	    connected: status === "connected",
	    configured: Boolean(setup.configured || envConnected),
	    missingEnvVars: setup.missingEnv,
	    livePostingEnabled: livePostingEnabledForChannel(account.platform),
	    liveGateEnvVars: livePostingEnvKeys[account.platform] || [],
	    accountName: account.accountName || (envConnected ? `${channelLabels[account.platform] || account.platform} env account` : ""),
    accountId: account.externalAccountId || account.accountId || envAccountId || "",
    tokenExpiresAt: account.tokenExpiresAt || "",
    lastTestedAt: account.lastTestedAt || "",
    lastErrorSummary: account.lastErrorSummary || account.lastError || "",
    hasStoredToken: Boolean(account.accessTokenEncrypted || accountEnvAccessToken(account.platform)),
    scopes: setup.scopes,
    notes: setup.notes
  };
}

function publicFileUrlFromLocalPath(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const clean = raw.replace(/^\/+/, "");
  if (/^(data\/exports\/|data\/assets\/|assets\/)/.test(clean) && !clean.includes("..")) return `/${clean}`;
  const absolute = path.resolve(raw);
  const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, "/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  if (!/^(data\/exports\/|data\/assets\/|assets\/)/.test(relative) || relative.includes("..")) return "";
  return `/${relative}`;
}

function safeImageUrl(value = "", fallbackPath = "") {
  const url = String(value || "");
  if (!url) return publicFileUrlFromLocalPath(fallbackPath);
  if (url.startsWith("data:image/svg+xml") && url.length <= 30000) return url;
  if (url.startsWith("data:")) return publicFileUrlFromLocalPath(fallbackPath);
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return url.includes("..") ? "" : url;
  return publicFileUrlFromLocalPath(url) || publicFileUrlFromLocalPath(fallbackPath);
}

function publicAssetBundleUsed(bundle = {}) {
  return {
    aspectRatio: bundle.aspectRatio || "",
    storedImagePath: bundle.storedImagePath || "",
    stylePresetName: bundle.stylePresetName || "",
    imageVariantLabel: bundle.imageVariantLabel || "",
	    finalImage: bundle.finalImage
	      ? {
	          ready: Boolean(bundle.finalImage.ready),
	          url: safeImageUrl(bundle.finalImage.url, bundle.finalImage.localPath),
	          localPath: bundle.finalImage.localPath || "",
	          fileSize: Number(bundle.finalImage.fileSize || 0),
	          width: Number(bundle.finalImage.width || 0),
	          height: Number(bundle.finalImage.height || 0),
	          createdAt: bundle.finalImage.createdAt || "",
	          watermarkPosition: bundle.finalImage.watermarkPosition || ""
	        }
	      : undefined
	  };
	}

function publicPostImage(image = {}) {
  const finalPath = image.finalPngPath || image.assetBundleUsed?.finalImage?.localPath || "";
  const finalUrl =
    safeImageUrl(image.finalPngUrl, finalPath) ||
    safeImageUrl(image.finalImageUrl, finalPath) ||
    safeImageUrl(image.assetBundleUsed?.finalImage?.url, image.assetBundleUsed?.finalImage?.localPath);
  const previewUrl = safeImageUrl(image.imageUrl, finalPath) || finalUrl;
  return {
    id: image.id,
    postId: image.postId,
	    imageUrl: previewUrl,
	    finalImageUrl: finalUrl,
	    finalPngUrl: finalUrl,
	    finalPngPath: image.finalPngPath || "",
	    finalPngFileSize: Number(image.finalPngFileSize || 0),
	    finalPngGeneratedAt: image.finalPngGeneratedAt || "",
    generationStatus: image.generationStatus,
    imageStatus: image.imageStatus,
    generationMode: image.generationMode,
    generationError: image.generationError,
    visualBucket: image.visualBucket,
    wilmaImageWorkflow: image.wilmaImageWorkflow || null,
    wilmaExpression: image.wilmaExpression || "",
    wilmaPoseReferenceId: image.wilmaPoseReferenceId || "",
    wilmaPoseReferenceName: image.wilmaPoseReferenceName || "",
    wilmaPoseReferenceCount: Number(image.wilmaPoseReferenceCount || 0),
    imagePrompt: image.imagePrompt || "",
    negativePrompt: image.negativePrompt || "",
    promptBuilderOutput: image.promptBuilderOutput || null,
    imageRiskLevel: image.imageRiskLevel,
    imageBrief: image.imageBrief,
    aspectRatio: image.aspectRatio,
    assetBundleKey: image.assetBundleKey,
    usesWilma: Boolean(image.usesWilma),
    usesLogo: Boolean(image.usesLogo),
    versionNumber: image.versionNumber,
    imageVersion: image.imageVersion,
    finalImageReady: Boolean(image.finalImageReady),
    textRenderingMode: image.textRenderingMode || "",
    watermarkPosition: image.watermarkPosition || "",
    styleProfile: image.styleProfile || image.creativeDirection?.styleProfile || "",
    imageVariantLabel: image.imageVariantLabel || image.creativeDirection?.imageVariantLabel || "",
    styleGate: image.styleGate || image.creativeDirection?.styleGate || null,
    assetBundleUsed: publicAssetBundleUsed(image.assetBundleUsed),
    createdAt: image.createdAt
  };
}

function withPublicChannelSetup(state) {
  return {
    ...state,
    settings: {
      ...(state.settings || {}),
      sourceItems: sourceItemsForState(state)
    },
    postImages: (state.postImages || []).map(publicPostImage),
    runtime: {
      ...(state.runtime || {}),
	      liveLinkedInPostingEnabled: process.env.ENABLE_LIVE_LINKEDIN_POSTING === "true",
	      livePostingGates: Object.fromEntries([...platforms, "threads"].map((platform) => [platform, liveGateSummary(platform)])),
	      openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
      oauthTokenEncryptionConfigured: Boolean(process.env.OAUTH_TOKEN_ENCRYPTION_KEY),
      imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      visualStylePreset: narrativeInfrastructurePreset,
      credentialReadiness: getCredentialReadiness(),
      manualModeActive: platforms.every((platform) => !livePostingEnabledForChannel(platform))
    },
    socialAccounts: (state.socialAccounts || []).map((account) => {
      const safe = safeChannelStatus(account);
      return {
        id: account.id,
        platform: account.platform,
        displayName: safe.displayName,
        accountType: account.accountType || "profile",
        setup: {
          configured: safe.configured,
          missingEnv: safe.missingEnvVars,
          scopes: safe.scopes,
          notes: safe.notes
        },
        status: safe.status,
        connected: safe.connected,
        accountName: safe.accountName,
        accountId: safe.accountId,
        tokenExpiresAt: safe.tokenExpiresAt,
        lastTestedAt: safe.lastTestedAt,
        lastTestMessage: account.lastTestMessage || "",
	        lastErrorSummary: safe.lastErrorSummary,
	        hasStoredToken: safe.hasStoredToken,
	        oauthConfigured: safe.configured,
	        livePostingEnabled: safe.livePostingEnabled,
	        liveGateEnvVars: safe.liveGateEnvVars
	      };
    })
  };
}

function safeChannelsResponse(state) {
  const accountsByPlatform = new Map((state.socialAccounts || []).map((account) => [account.platform, account]));
  return platforms.map((platform) =>
    safeChannelStatus(accountsByPlatform.get(platform) || { id: `channel-${platform}`, platform })
  );
}

function publishReadiness(state, post) {
  if (!post) {
    return { ok: false, status: "blocked", message: "Post not found." };
  }
  if (!["approved", "scheduled", "publishing", "retry_ready"].includes(post.status)) {
    return { ok: false, status: "blocked", message: "Only approved or scheduled posts can enter publishing." };
  }
  if (post.complianceRisk === "high") {
    return { ok: false, status: "blocked", message: "High-risk posts require final human approval before publishing." };
  }
  if (!post.imageFinalized) {
    return { ok: false, status: "blocked", message: "Finalize the image before publishing." };
  }
  if (!post.finalPreviewConfirmed) {
    return { ok: false, status: "blocked", message: "Confirm the final preview before publishing." };
  }
  const targetChannels = Array.isArray(post.targetChannels) && post.targetChannels.length ? post.targetChannels : [post.platform];
  if (!targetChannels.length) {
    return { ok: false, status: "unscheduled", message: "Choose at least one target channel." };
  }
  const channelDetails = channelReadinessDetails(state, post);
  for (const channel of targetChannels) {
    const dryRun = channelDetails.dryRuns[channel];
    if (dryRun?.status === "blocked") {
      const status = dryRun.configured === false
        ? "setup_required"
        : dryRun.connected === false
          ? "blocked_channel_not_connected"
          : "blocked";
      return {
        ok: false,
        status,
        message: dryRun.message,
        channelReadiness: channelDetails.dryRuns
      };
    }
  }
  if (!post.scheduledFor) {
    return { ok: false, status: "unscheduled", message: "Add a scheduled time before publishing." };
  }
  return {
    ok: true,
    status: "ready",
    message: "Ready for live publisher adapter. No auto-posting has run.",
    channelReadiness: channelDetails.dryRuns
  };
}

async function updatePublishingCheck(postId) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  const readiness = publishReadiness(state, post);
	  const patch = {
	    publishingStatus: readiness.status,
	    lastPublishAttemptAt: new Date().toISOString(),
	    publishErrorSummary: readiness.ok ? "" : readiness.message,
	    channelReadiness: readiness.channelReadiness || {},
	    channelDryRuns: readiness.channelReadiness || {}
	  };
  const nextState = await store.updatePost(postId, patch);
  return { readiness, state: nextState };
}

async function recordPublishEvent({ post, channel, eventType, statusBefore, statusAfter, message, errorCode = "" }) {
  return store.addPublishEvent({
    id: crypto.randomUUID(),
    postId: post?.id,
    channel: channel || post?.platform || "unknown",
    eventType,
    statusBefore: statusBefore || post?.status || "",
    statusAfter,
    message,
    errorCode,
    createdAt: new Date().toISOString()
  });
}

function scheduledDateIsDue(value) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now();
}

function composePublishText(post, channel = post.platform) {
  const adaptation = post.channelAdaptations?.[channel];
  if (adaptation?.text) return adaptation.text;
  return [post.hook, "", post.body, "", post.cta, "", (post.hashtags || []).join(" ")]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function overlayTextForPostServer(post) {
  if (post.overlayMode === "none") {
    return { mode: "none", kicker: "", headline: "", support: "" };
  }
  const supportLine = String(post.cta || post.body || "")
    .replace(/\n/g, ". ")
    .split(".")
    .filter(Boolean)[0] || "Make second chances easier to understand.";
  return {
    mode: "text",
    kicker: post.overlayKicker || post.contentBucket || post.contentFormat || "LegalEase",
    headline: post.overlayHeadline || post.hook || post.title,
    support: post.overlaySupport || supportLine
  };
}

function imageForPostFromState(state, postId) {
  return (state.postImages || [])
    .filter((image) => image.postId === postId)
    .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0] || null;
}

function finalImageIsReady(image) {
  return Boolean(
    image &&
      image.generationStatus === "generated" &&
      (image.finalImageReady ||
        image.textRenderingMode === "baked_overlay" ||
        image.textRenderingMode === "no_text_overlay" ||
        image.assetBundleUsed?.finalImage?.ready)
  );
}

function wilmaPoseAssets(state = {}) {
  const mapped = poseMappingsForState(state).map((mapping) => {
    const asset = localAssetById(state, mapping.linkedAssetId);
    return {
      id: mapping.id,
      name: mapping.label,
      slug: slugify(mapping.label),
      assetType: "wilma_reference",
      fileUrl: asset?.filePath || "",
      mimeType: "image/png",
      fileSize: asset?.fileSize || 0,
      width: 0,
      height: 0,
      approved: true,
      isDefault: mapping.poseRefNumber === 1,
      tags: ["wilma", "pose-library", "local-pose-mapping", mapping.expressionCategory],
      version: 1,
      localAssetId: asset?.id || "",
      fallbackPlaceholder: mapping.fallbackPlaceholder
    };
  });
  const legacy = (state.brandAssets || []).filter((asset) => (asset.tags || []).includes("pose-library"));
  const seen = new Set(mapped.map((asset) => asset.id));
  return [...mapped, ...legacy.filter((asset) => !seen.has(asset.id))];
}

function wilmaPoseReferenceCount(state = {}) {
  return wilmaPoseAssets(state).length;
}

function wilmaPoseAssetById(state = {}, id = "") {
  const poses = wilmaPoseAssets(state);
  return poses.find((asset) => asset.id === id) || poses[0] || null;
}

function words(value = "") {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

function wilmaOverlaySafetyReport(value = "") {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase();
  const wordCount = words(text).length;
  const guaranteePattern = /\b(guarantee|guaranteed|will\s+(clear|erase|remove|fix|qualify|win|approve)|100%|assured|promise|promised)\b/i;
  const eligibilityPattern = /\b(you\s+(are|re|'re)\s+eligible|everyone\s+qualifies|automatically\s+qualif(?:y|ies)|always\s+eligible|definitely\s+eligible|qualify\s+for\s+expungement)\b/i;
  return {
    overlayText: text,
    wordCount,
    overlayLengthOk: wordCount > 0 && wordCount <= 8,
    empty: !text,
    hasLegalGuaranteeLanguage: guaranteePattern.test(text),
    hasEligibilityPromiseLanguage: eligibilityPattern.test(text),
    bannedVisualElementsOk: wilmaBrandSafeRules.length > 0,
    mobileReadable: wordCount > 0 && wordCount <= 8,
    normalized
  };
}

function wilmaWorkflowBlockers({ post = {}, image = null, workflow = {}, requireFinal = false } = {}) {
  const overlayText = workflow.overlayText || shortOverlayHeadline(post);
  const safety = wilmaOverlaySafetyReport(overlayText);
  const blockers = [];
  if (!post.copyReviewed) blockers.push("Copy still needs review.");
  if (!workflow.imagePrompt && !post.imagePrompt && !image?.imagePrompt) blockers.push("Image prompt still needs to be generated.");
  if (!image || image.generationStatus !== "generated") blockers.push("Image has not been marked generated.");
  if (!post.overlayConfirmed) blockers.push("Overlay has not been confirmed.");
  if (requireFinal && safety.empty) blockers.push("Overlay text is empty.");
  if (requireFinal && !finalImageIsReady(image)) blockers.push("Final PNG has not been marked ready.");
  if (!workflow.platformFormatSize) blockers.push("Platform size has not been confirmed.");
  if (!composePublishText(post)) blockers.push("Manual posting copy is not ready.");
  return { blockers, safety };
}

function shortOverlayHeadline(post) {
  const overlay = overlayTextForPostServer(post);
  if (overlay.mode === "none") return "";
  const headlineWords = words(overlay.headline || post.hook || post.title);
  return headlineWords.slice(0, 8).join(" ");
}

function wilmaPlatformFormatSize(platform = "linkedin") {
  const ratio = narrativeInfrastructurePreset.recommendedAspectRatios[platform] || "1:1";
  if (ratio === "4:5") return "4:5 vertical PNG, 1080 x 1350 preview target";
  return "1:1 square PNG, 1200 x 1200 preview target";
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "item";
}

function localDateSlug(value = "") {
  const date = value ? new Date(value) : new Date();
  if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function exportFormatForPost(post = {}, overrideId = "") {
  const targetChannels = (post.targetChannels?.length ? post.targetChannels : [post.platform]).filter(Boolean);
  const platform = targetChannels[0] || post.platform || "linkedin";
  if (overrideId) {
    const exact = finalExportPlatformFormats.find((format) => format.id === overrideId);
    if (exact) return exact;
  }
  if (platform === "instagram") return finalExportPlatformFormats.find((format) => format.id === "instagram-square");
  if (platform === "linkedin") return finalExportPlatformFormats.find((format) => format.id === "linkedin-square");
  if (platform === "x") return finalExportPlatformFormats.find((format) => format.id === "x-twitter-landscape");
  return finalExportPlatformFormats.find((format) => format.id === "linkedin-square");
}

function altTextForExport(post = {}, workflow = {}) {
  const bucket = workflow.visualBucket || post.wilmaVisualBucket || post.contentBucket || "LegalEase social graphic";
  const expression = workflow.wilmaExpression || post.wilmaExpression || "helpful";
  const overlay = workflow.overlayText || shortOverlayHeadline(post);
  return [
    `LegalEase social graphic for ${bucket}.`,
    `Wilma appears in a ${String(expression).toLowerCase()} pose.`,
    overlay ? `Overlay text reads: ${overlay}.` : "",
    "Educational content only; not legal advice."
  ].filter(Boolean).join(" ");
}

function buildFinalExportKit(post = {}, image = null, workflow = {}) {
  const format = exportFormatForPost(post, post.finalExportKit?.platformFormatId || workflow.platformFormatId);
  const bucket = workflow.visualBucket || post.wilmaVisualBucket || image?.visualBucket || post.contentBucket || "LegalEase POV";
  const date = localDateSlug();
  const filename = `legalease-${slugify(bucket)}-${slugify(format.id)}-${date}-${slugify(post.id || "post")}.png`;
  const caption = composePublishText(post);
  const hashtags = (post.hashtags || []).join(" ");
  const altText = post.finalExportKit?.altText || altTextForExport(post, workflow);
  const postingNotes = post.finalExportKit?.postingNotes || post.operatorNotes || "Manual posting only. Confirm final visual and caption before uploading.";
  const finalReady = Boolean(finalImageIsReady(image) && post.imageFinalized);
  const finalImageUrl = finalImageIsReady(image) ? image?.imageUrl || "" : "";
  const finalMeta = image?.assetBundleUsed?.finalImage || {};
  const localPath = finalMeta.localPath || image?.finalPngPath || "";
  const fileSize = Number(finalMeta.fileSize || image?.finalPngFileSize || 0);
  const generatedAt = finalMeta.createdAt || image?.finalPngGeneratedAt || "";
  return {
    status: finalReady ? "ready" : "blocked",
    platformFormatId: format.id,
    platformFormatLabel: format.label,
    platform: format.platform,
    width: format.width,
    height: format.height,
    dimensions: `${format.width}x${format.height}`,
    contentBucket: bucket,
    wilmaExpression: workflow.wilmaExpression || post.wilmaExpression || image?.wilmaExpression || "",
    wilmaPoseReference: workflow.wilmaPoseReferenceName || image?.wilmaPoseReferenceName || post.wilmaPoseReferenceId || "",
    wilmaPoseReferenceId: workflow.wilmaPoseReferenceId || image?.wilmaPoseReferenceId || post.wilmaPoseReferenceId || "",
    overlayText: workflow.overlayText || shortOverlayHeadline(post),
    caption,
    hashtags,
    altText,
    postingNotes,
    exportFilename: filename,
    imageUrl: image?.imageUrl || "",
    finalImageUrl,
    finalPngUrl: finalImageUrl,
    finalPngPath: localPath,
    finalPngFileSize: fileSize,
    finalPngGeneratedAt: generatedAt,
    downloadUrl: finalImageUrl ? `/api/posts/${encodeURIComponent(post.id || "post")}/final-png` : "",
    finalPngReady: finalReady,
    livePostingDisabled: true,
    operatorMustPostManually: true,
    manualPostingKitReady: Boolean(post.finalExportKit?.manualPostingKitReady),
    updatedAt: new Date().toISOString()
  };
}

function safeDownloadFilename(value = "legalease-final.png") {
  const clean = String(value || "legalease-final.png")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean.toLowerCase().endsWith(".png") ? clean : `${clean || "legalease-final"}.png`;
}

function finalPngExportRelativePath(filename = "") {
  return `data/exports/final-pngs/${safeDownloadFilename(filename)}`;
}

function safePackageSegment(value = "post") {
  return slugify(value).replace(/[^a-z0-9-]/g, "").slice(0, 90) || "post";
}

function postingPackageRelativeDir(postId = "", dateSlug = localDateSlug()) {
  return `data/exports/posting-kits/${safePackageSegment(postId)}-${dateSlug}`;
}

function postingPackageZipFilename(postId = "post") {
  return `${safePackageSegment(postId)}-posting-kit.zip`;
}

function safeExportFilePath(relativePath = "", allowedPrefix = "data/exports/final-pngs/") {
  const clean = String(relativePath || "").replace(/^\/+/, "");
  const normalized = path.posix.normalize(clean).replace(/^\/+/, "");
  if (!normalized.startsWith(allowedPrefix) || normalized.includes("../")) return "";
  const fullPath = path.resolve(process.cwd(), normalized);
  const allowedRoot = path.resolve(process.cwd(), allowedPrefix);
  if (!fullPath.startsWith(allowedRoot)) return "";
  return fullPath;
}

function safePostingPackagePath(relativePath = "") {
  const clean = String(relativePath || "").replace(/^\/+/, "");
  const normalized = path.posix.normalize(clean).replace(/^\/+/, "");
  if (!normalized.startsWith("data/exports/posting-kits/") || normalized.includes("../")) return "";
  const fullPath = path.resolve(process.cwd(), normalized);
  const allowedRoot = path.resolve(process.cwd(), "data/exports/posting-kits");
  if (!fullPath.startsWith(allowedRoot)) return "";
  return fullPath;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function zipBuffers(entries = []) {
  const now = dosDateTime();
  const locals = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = String(entry.name || "").replace(/^\/+/, "");
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
      throw new Error("Unsafe zip entry name.");
    }
    const nameBuffer = Buffer.from(name);
    const body = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ""), "utf8");
    const checksum = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.dosTime, 10);
    localHeader.writeUInt16LE(now.dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(body.length, 18);
    localHeader.writeUInt32LE(body.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    locals.push(localHeader, nameBuffer, body);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.dosTime, 12);
    centralHeader.writeUInt16LE(now.dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(body.length, 20);
    centralHeader.writeUInt32LE(body.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + body.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...central, end]);
}

const postingPackageZipFiles = ["final.png", "caption.txt", "hashtags.txt", "alt-text.txt", "posting-notes.txt", "metadata.json"];

async function writePostingPackageZip(packageRelativePath = "", postId = "post") {
  const packagePath = safePostingPackagePath(packageRelativePath);
  if (!packagePath) throw new Error("Posting package path is unsafe.");
  const entries = [];
  for (const filename of postingPackageZipFiles) {
    const filePath = path.join(packagePath, filename);
    if (!(await pathExists(filePath))) throw new Error(`Posting package is incomplete: ${filename} is missing.`);
    entries.push({ name: filename, data: await readFile(filePath) });
  }
  const zipFilename = postingPackageZipFilename(postId);
  const zipPath = path.join(packagePath, zipFilename);
  const zipBuffer = zipBuffers(entries);
  await writeFile(zipPath, zipBuffer);
  const zipRelativePath = `${packageRelativePath.replace(/\/+$/, "")}/${zipFilename}`;
  return {
    zipFilename,
    zipPath,
    zipRelativePath,
    zipDownloadUrl: `/api/posts/${encodeURIComponent(postId)}/posting-package-zip`,
    zipFileSize: zipBuffer.length,
    zippedAt: new Date().toISOString()
  };
}

async function ensurePostingPackageZip(postId = "") {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const pkg = post.postingPackage || {};
  const relativePath = pkg.relativePath || String(post.postingPackagePath || "").replace(process.cwd() + "/", "");
  if (!relativePath) throw new Error("Export a posting package before downloading the zip.");
  const zipRecord = await writePostingPackageZip(relativePath, post.id);
  const nextPackage = {
    ...pkg,
    ...zipRecord,
    generated: true,
    relativePath,
    fileList: pkg.fileList || post.postingPackageFileList || postingPackageZipFiles
  };
  const nextState = await store.updatePost(post.id, {
    postingPackageZipGenerated: true,
    postingPackageZipPath: zipRecord.zipPath,
    postingPackageZipDownloadUrl: zipRecord.zipDownloadUrl,
    postingPackageZipFileSize: zipRecord.zipFileSize,
    postingPackageZipGeneratedAt: zipRecord.zippedAt,
    postingPackage: nextPackage,
    finalExportKit: {
      ...(post.finalExportKit || {}),
      postingPackage: nextPackage,
      postingPackageZipGenerated: true
    }
  });
  return { state: nextState, post, packageZip: zipRecord };
}

function defaultWilmaVisualBucket(post = {}) {
  const text = [post.contentFormat, post.contentBucket, post.title, post.hook].join(" ").toLowerCase();
  if (/ask|question|wilma/.test(text)) return "Ask Wilma";
  if (/translate|translation|plain english|explain/.test(text)) return "Wilma Translation";
  if (/myth|misconception|check/.test(text)) return "Wilma Myth Check";
  if (/implementation|operator|workflow|system/.test(text)) return "The Implementation Layer";
  if (/record|clearance|work|job|workforce|employment/.test(text)) return "Record Clearance & Work";
  return "LegalEase POV";
}

function defaultWilmaExpression(post = {}) {
  const text = [post.contentFormat, post.contentBucket, post.title, post.hook, post.body].join(" ").toLowerCase();
  if (/myth|misconception|wrong|not true/.test(text)) return "Myth-checking";
  if (/work|record|clearance|employment/.test(text)) return "Determined";
  if (/how|explain|translate|plain english/.test(text)) return "Explaining";
  if (/win|celebrate|progress|done|ready/.test(text)) return "Celebratory";
  if (/hard|confusing|stress|fear|uncertain/.test(text)) return "Empathetic";
  if (/trust|safe|review|human/.test(text)) return "Reassuring";
  return post.speaker === "wilma" ? "Helpful" : "Serious but warm";
}

function buildWilmaImageWorkflow(state = {}, post = {}, overrides = {}) {
  const visualBucket = wilmaVisualBuckets.includes(overrides.visualBucket)
    ? overrides.visualBucket
    : (wilmaVisualBuckets.includes(post.wilmaVisualBucket) ? post.wilmaVisualBucket : defaultWilmaVisualBucket(post));
  const wilmaExpression = wilmaExpressions.includes(overrides.wilmaExpression || overrides.expression)
    ? (overrides.wilmaExpression || overrides.expression)
    : (wilmaExpressions.includes(post.wilmaExpression) ? post.wilmaExpression : defaultWilmaExpression(post));
  const fallbackPoseId = wilmaExpressionPoseMap[wilmaExpression] || "wilma-pose-02";
  const requestedPoseId = String(overrides.wilmaPoseReferenceId || overrides.poseReferenceId || post.wilmaPoseReferenceId || fallbackPoseId);
  const pose = wilmaPoseAssetById(state, requestedPoseId) || wilmaPoseAssetById(state, fallbackPoseId);
  const poseReferenceId = pose?.id || requestedPoseId;
  const poseReferenceName = pose?.name || poseReferenceId;
  const linkedPoseAsset = localAssetById(state, overrides.wilmaAssetId || post.wilmaImageWorkflow?.wilmaAssetId || pose?.localAssetId || "") || linkedAssetForPose(state, poseReferenceId);
  const backgroundAsset = localAssetById(state, overrides.backgroundAssetId || post.wilmaImageWorkflow?.backgroundAssetId || "");
  const brandMarkAsset = localAssetById(state, overrides.brandMarkAssetId || post.wilmaImageWorkflow?.brandMarkAssetId || "");
  const overlayText = overrides.overlayText || shortOverlayHeadline(post) || "Make the next step clearer";
  const targetChannels = (post.targetChannels?.length ? post.targetChannels : [post.platform]).filter(Boolean);
  const platform = targetChannels[0] || post.platform || "linkedin";
  const formatSize = wilmaPlatformFormatSize(platform);
  const postTopic = post.hook || post.title || "LegalEase social post";
  const audience = audienceLabels[post.audience] || post.audience || "People trying to understand record clearance and second-chance pathways";
  const backgroundStyle = visualBucket === "LegalEase POV"
    ? "Clean branded editorial background with subtle civic texture and space for mobile-readable overlay text."
    : "Warm branded social background with Wilma as the guide, clear negative space, and no panic imagery.";
  const colorPalette = "LegalEase legal blue, horizon orange, paper white, civic black, and infrastructure gray.";
  const lighting = "Soft studio lighting, polished but humane, with high contrast for mobile readability.";
  const composition = visualBucket === "The Implementation Layer"
    ? "Wilma or LegalEase branded visual anchored right, simple workflow cues left, overlay in safe area."
    : "Wilma centered or three-quarter view, expressive but calm, overlay text placed in a clear safe area.";
  const negativePrompt = wilmaBrandSafeRules.join("; ");
  const complianceNote = "Educational social graphic only. Avoid specific legal advice, outcome guarantees, eligibility promises, or implied attorney-client relationship.";
  const promptBuilderOutput = {
    platform,
    postTopic,
    audience,
    visualBucket,
    wilmaExpression,
    wilmaPoseReference: `${poseReferenceName} (${poseReferenceId})`,
    backgroundStyle,
    colorPalette,
    lighting,
    composition,
    overlayText,
    negativePrompt,
    complianceNote
  };
  const imagePrompt = [
    `Create a LegalEase social graphic for ${platformLabels[platform] || platform}.`,
    `Post topic: ${postTopic}`,
    `Audience: ${audience}.`,
    `Visual bucket: ${visualBucket}.`,
    `Wilma expression: ${wilmaExpression}.`,
    `Use Wilma pose reference ${poseReferenceName} (${poseReferenceId}) from the approved pose library.`,
    `Background style: ${backgroundStyle}`,
    `Palette: ${colorPalette}`,
    `Lighting: ${lighting}`,
    `Composition: ${composition}`,
    `Overlay text: "${overlayText}".`,
    `Compliance note: ${complianceNote}`
  ].join("\n");
  return {
    state: "Image Prompt Ready",
    visualBucket,
    wilmaExpression,
    wilmaPoseReferenceId: poseReferenceId,
    wilmaPoseReferenceName: poseReferenceName,
    wilmaPoseReferenceCount: wilmaPoseReferenceCount(state),
    wilmaAssetId: linkedPoseAsset?.id || "",
    wilmaAssetLabel: linkedPoseAsset?.label || "",
    backgroundAssetId: backgroundAsset?.id || "",
    backgroundAssetLabel: backgroundAsset?.label || "",
    brandMarkAssetId: brandMarkAsset?.id || "",
    brandMarkAssetLabel: brandMarkAsset?.label || "",
    platformFormatSize: formatSize,
    overlayText,
    imagePrompt,
    negativePrompt,
    promptBuilderOutput,
    safetyReview: wilmaOverlaySafetyReport(overlayText),
    brandSafeRules: wilmaBrandSafeRules,
    overlayRules: wilmaOverlayRules,
    exportChecklist: {
      copyReviewed: Boolean(post.copyReviewed),
      imageSelectedOrGenerated: false,
      overlayConfirmed: Boolean(post.overlayConfirmed),
      finalPngGenerated: false,
      watermarkOrBrandMarkAppliedIfSelected: true,
      platformSizeConfirmed: Boolean(formatSize),
      manualPostingCopyReady: Boolean(composePublishText(post))
    },
    updatedAt: new Date().toISOString()
  };
}

function wilmaPlaceholderPreviewDataUrl(post = {}, workflow = {}) {
  const title = escapeSvg(workflow.overlayText || post.hook || post.title || "LegalEase");
  const bucket = escapeSvg(workflow.visualBucket || "LegalEase POV");
  const expression = escapeSvg(workflow.wilmaExpression || "Helpful");
  const pose = escapeSvg(workflow.wilmaPoseReferenceId || "wilma-pose");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#F7F3EA"/>
  <rect x="84" y="84" width="1032" height="1032" rx="28" fill="#111111"/>
  <rect x="120" y="120" width="960" height="960" rx="18" fill="#1F455B"/>
  <circle cx="878" cy="324" r="132" fill="#F47C20" opacity=".88"/>
  <circle cx="874" cy="320" r="84" fill="#111111"/>
  <circle cx="874" cy="320" r="38" fill="#F7F3EA" opacity=".45"/>
  <circle cx="842" cy="430" r="210" fill="#D8D3C8"/>
  <circle cx="800" cy="402" r="28" fill="#F47C20"/>
  <circle cx="908" cy="402" r="28" fill="#F47C20"/>
  <path d="M760 520c52 46 134 46 186 0" stroke="#111111" stroke-width="18" fill="none" stroke-linecap="round"/>
  <rect x="704" y="642" width="280" height="270" rx="44" fill="#111111"/>
  <rect x="752" y="682" width="184" height="56" rx="18" fill="#F47C20"/>
  <text x="132" y="206" fill="#F47C20" font-family="Arial, sans-serif" font-size="34" font-weight="700">${bucket}</text>
  <text x="132" y="272" fill="#F7F3EA" font-family="Arial, sans-serif" font-size="62" font-weight="800">Wilma prompt preview</text>
  <text x="132" y="372" fill="#F7F3EA" font-family="Arial, sans-serif" font-size="46" font-weight="700">${title}</text>
  <text x="132" y="936" fill="#F7F3EA" font-family="Arial, sans-serif" font-size="30">${expression} · ${pose}</text>
  <text x="132" y="986" fill="#D8D3C8" font-family="Arial, sans-serif" font-size="26">Local placeholder only. External image API not connected for this workflow.</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function generateWilmaImagePrompt(postId, overrides = {}) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const workflow = buildWilmaImageWorkflow(state, post, overrides);
  const nextState = await store.updatePost(postId, {
    imageWorkflowState: "Image Prompt Ready",
    wilmaImageWorkflow: workflow,
    wilmaVisualBucket: workflow.visualBucket,
    wilmaExpression: workflow.wilmaExpression,
    wilmaPoseReferenceId: workflow.wilmaPoseReferenceId,
    imagePrompt: workflow.imagePrompt,
    negativePrompt: workflow.negativePrompt,
    imageFinalized: false,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: "",
    publishErrorSummary: ""
  });
  return { state: nextState, workflow, message: "Wilma image prompt ready." };
}

async function markWilmaImageGenerated(postId, overrides = {}) {
  let state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  if (!post.wilmaImageWorkflow?.imagePrompt && !post.imagePrompt) {
    throw new Error("Generate the Wilma image prompt before marking an image generated.");
  }
  const workflow = {
    ...(post.wilmaImageWorkflow?.imagePrompt ? post.wilmaImageWorkflow : buildWilmaImageWorkflow(state, post, overrides)),
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
    state: "Image Generated",
    updatedAt: new Date().toISOString()
  };
  workflow.safetyReview = wilmaOverlaySafetyReport(workflow.overlayText || shortOverlayHeadline(post));
  workflow.exportChecklist = {
    ...(workflow.exportChecklist || {}),
    copyReviewed: Boolean(post.copyReviewed),
    imageSelectedOrGenerated: true,
    overlayConfirmed: Boolean(post.overlayConfirmed),
    finalPngGenerated: false,
    watermarkOrBrandMarkAppliedIfSelected: true,
    platformSizeConfirmed: Boolean(workflow.platformFormatSize),
    manualPostingCopyReady: Boolean(composePublishText(post))
  };
  const existing = (state.postImages || []).filter((image) => image.postId === postId);
  const versionNumber = Math.max(0, ...existing.map((image) => Number(image.versionNumber || image.imageVersion || 0))) + 1;
  const image = {
    id: crypto.randomUUID(),
    postId,
    imageUrl: wilmaPlaceholderPreviewDataUrl(post, workflow),
    generationStatus: "generated",
    imageStatus: "local_placeholder",
    generationMode: "local_wilma_placeholder_preview",
    visualBucket: workflow.visualBucket,
    wilmaImageWorkflow: workflow,
    wilmaExpression: workflow.wilmaExpression,
    wilmaPoseReferenceId: workflow.wilmaPoseReferenceId,
    wilmaPoseReferenceName: workflow.wilmaPoseReferenceName,
    wilmaPoseReferenceCount: workflow.wilmaPoseReferenceCount,
    imagePrompt: workflow.imagePrompt,
    negativePrompt: workflow.negativePrompt,
    promptBuilderOutput: workflow.promptBuilderOutput,
    promptSummary: "Local placeholder for the Wilma image workflow. Stores prompt, pose, expression, bucket, and overlay for operator review.",
    imageBrief: `${workflow.visualBucket} · ${workflow.wilmaExpression} · ${workflow.wilmaPoseReferenceName}`,
    aspectRatio: "1:1",
    assetBundleKey: "wilma_default",
    assetBundleUsed: {
      selectedAssets: {
        wilmaAssetId: workflow.wilmaAssetId || "",
        backgroundAssetId: workflow.backgroundAssetId || "",
        brandMarkAssetId: workflow.brandMarkAssetId || ""
      }
    },
    usesWilma: true,
    usesLogo: false,
    versionNumber,
    imageVersion: versionNumber,
    imageRiskLevel: post.imageRiskLevel || "medium",
    styleProfile: narrativeInfrastructurePreset.displayName,
    imageVariantLabel: "Wilma local prompt placeholder",
    textRenderingMode: "app_overlay_pending",
    watermarkPosition: post.watermarkPosition || "bottom-right",
    styleGate: { passed: true, message: "Local Wilma workflow placeholder generated for review." },
    createdAt: new Date().toISOString()
  };
  state = await store.savePostImage(image);
  state = await store.updatePost(postId, {
    imageWorkflowState: "Image Generated",
    wilmaImageWorkflow: workflow,
    wilmaVisualBucket: workflow.visualBucket,
    wilmaExpression: workflow.wilmaExpression,
    wilmaPoseReferenceId: workflow.wilmaPoseReferenceId,
    imagePrompt: workflow.imagePrompt,
    negativePrompt: workflow.negativePrompt,
    imageFinalized: false,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: "",
    publishErrorSummary: ""
  });
  return { state, image, workflow, message: "Wilma placeholder image marked generated." };
}

async function markWilmaFinalPngReady(postId) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  if (!post.copyReviewed) throw new Error("Review copy before marking the final PNG ready.");
  const image = imageForPostFromState(state, postId);
  if (!image || image.generationStatus !== "generated") throw new Error("Mark an image generated before marking the final PNG ready.");
  if (!post.overlayConfirmed) throw new Error("Confirm the overlay before marking the final PNG ready.");
  const safety = wilmaOverlaySafetyReport(post.wilmaImageWorkflow?.overlayText || shortOverlayHeadline(post));
  if (safety.empty) throw new Error("Add overlay text before marking the final PNG ready.");
  let result = await finalizePostImage(postId);
  result = await confirmFinalPreview(postId);
  const refreshed = await store.readState();
  const nextPost = refreshed.posts.find((item) => item.id === postId) || post;
  const finalImage = imageForPostFromState(refreshed, postId);
  const workflow = {
    ...(nextPost.wilmaImageWorkflow || buildWilmaImageWorkflow(refreshed, nextPost)),
    state: "Ready for Manual Posting",
    exportChecklist: {
      ...((nextPost.wilmaImageWorkflow || {}).exportChecklist || {}),
      copyReviewed: true,
      imageSelectedOrGenerated: true,
      overlayConfirmed: true,
      finalPngGenerated: true,
      watermarkOrBrandMarkAppliedIfSelected: true,
      platformSizeConfirmed: true,
      manualPostingCopyReady: Boolean(composePublishText(nextPost))
    },
    safetyReview: safety,
    updatedAt: new Date().toISOString()
  };
  const finalExportKit = buildFinalExportKit(nextPost, finalImage, workflow);
  const nextState = await store.updatePost(postId, {
    status: ["draft", "needs_review"].includes(nextPost.status) ? "approved" : nextPost.status,
    imageWorkflowState: "Ready for Manual Posting",
    wilmaImageWorkflow: workflow,
    finalExportKit,
    publishErrorSummary: ""
  });
  return { state: nextState, workflow, message: "Final PNG ready for manual posting." };
}

async function markManualPostingKitReady(postId, patch = {}) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const image = imageForPostFromState(state, postId);
  if (!finalImageIsReady(image) || !post.imageFinalized || !post.finalPreviewConfirmed) {
    throw new Error("Mark the final PNG ready before confirming the manual posting kit.");
  }
  const workflow = post.wilmaImageWorkflow || buildWilmaImageWorkflow(state, post);
  const kit = {
    ...buildFinalExportKit({ ...post, finalExportKit: { ...(post.finalExportKit || {}), ...patch } }, image, workflow),
    ...patch,
    manualPostingKitReady: true,
    manualPostingKitReadyAt: new Date().toISOString(),
    status: "ready"
  };
  const nextState = await store.updatePost(postId, {
    finalExportKit: kit,
    manualPostingKitReady: true,
    manualPostingKitReadyAt: kit.manualPostingKitReadyAt
  });
  return { state: nextState, finalExportKit: kit, message: "Manual posting kit ready." };
}

async function exportPostingPackage(postId) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const image = imageForPostFromState(state, postId);
  if (!finalImageIsReady(image) || !post.imageFinalized) throw new Error("Create Final PNG before exporting a posting package.");
  const workflow = post.wilmaImageWorkflow || buildWilmaImageWorkflow(state, post);
  const kit = {
    ...buildFinalExportKit(post, image, workflow),
    ...(post.finalExportKit || {})
  };
  if (!post.manualPostingKitReady && !kit.manualPostingKitReady) throw new Error("Mark Manual Posting Kit Ready before exporting a package.");
  if (!kit.caption && !composePublishText(post)) throw new Error("Caption is required before exporting a package.");
  if (!kit.platform && !post.platform) throw new Error("Platform is required before exporting a package.");

  const finalImageUrl = image.finalPngUrl || image.finalImageUrl || image.imageUrl || kit.finalPngUrl || "";
  const cleanFinalPath = decodeURIComponent(String(finalImageUrl || "").replace(/^\/+/, ""));
  const finalSourcePath = safeExportFilePath(cleanFinalPath, "data/exports/final-pngs/");
  if (!finalSourcePath || !existsSync(finalSourcePath)) throw new Error("Final PNG source path is missing or unsafe.");

  const dateSlug = localDateSlug();
  const packageDir = postingPackageRelativeDir(post.id, dateSlug);
  const packagePath = path.resolve(process.cwd(), packageDir);
  const packageRoot = path.resolve(process.cwd(), "data/exports/posting-kits");
  if (!packagePath.startsWith(packageRoot)) throw new Error("Posting package path is unsafe.");
  await mkdir(packagePath, { recursive: true });

  const selectedAssets = image.assetBundleUsed?.selectedAssets || {};
  const metadata = {
    postId: post.id,
    title: post.title || post.hook || "",
    topic: post.hook || post.title || "",
    platform: kit.platform || post.platform || "",
    contentBucket: kit.contentBucket || workflow.visualBucket || post.contentBucket || "",
    speaker: post.speaker || post.author || "LegalEase",
    riskLevel: post.complianceRisk || post.imageRiskLevel || "medium",
    wilmaExpression: workflow.wilmaExpression || post.wilmaExpression || "",
    wilmaPoseRef: workflow.wilmaPoseReferenceId || post.wilmaPoseReferenceId || "",
    wilmaAssetId: workflow.wilmaAssetId || selectedAssets.wilmaAssetId || "",
    backgroundAssetId: workflow.backgroundAssetId || selectedAssets.backgroundAssetId || "",
    brandMarkAssetId: workflow.brandMarkAssetId || selectedAssets.brandMarkAssetId || "",
    finalPngFilename: path.basename(finalSourcePath),
    finalPngSourcePath: finalSourcePath,
    generatedTimestamp: new Date().toISOString(),
    manualPostingKitStatus: post.manualPostingKitReady || kit.manualPostingKitReady ? "ready" : "not_ready",
    livePostingStatus: "disabled/manual-only"
  };

  const files = [
    ["caption.txt", kit.caption || composePublishText(post)],
    ["hashtags.txt", kit.hashtags || (post.hashtags || []).join(" ")],
    ["alt-text.txt", kit.altText || altTextForExport(post, workflow)],
    ["posting-notes.txt", kit.postingNotes || "Manual posting only. Confirm final visual and caption before uploading."],
    ["metadata.json", JSON.stringify(metadata, null, 2)]
  ];

  try {
    await copyFile(finalSourcePath, path.join(packagePath, "final.png"));
    for (const [filename, contents] of files) {
      await writeFile(path.join(packagePath, filename), String(contents || ""), "utf8");
    }
  } catch (error) {
    throw new Error(`Could not write posting package: ${error.message}`);
  }

  const fileList = ["final.png", ...files.map(([filename]) => filename)];
  const zipRecord = await writePostingPackageZip(packageDir, post.id);
  const packageRecord = {
    generated: true,
    path: packagePath,
    relativePath: packageDir,
    downloadUrl: `/${packageDir}/metadata.json`,
    zipFilename: zipRecord.zipFilename,
    zipPath: zipRecord.zipPath,
    zipRelativePath: zipRecord.zipRelativePath,
    zipDownloadUrl: zipRecord.zipDownloadUrl,
    zipFileSize: zipRecord.zipFileSize,
    zipGeneratedAt: zipRecord.zippedAt,
    generatedAt: metadata.generatedTimestamp,
    fileList
  };
  const nextState = await store.updatePost(post.id, {
    postingPackageGenerated: true,
    postingPackagePath: packagePath,
    postingPackageDownloadUrl: packageRecord.downloadUrl,
    postingPackageGeneratedAt: packageRecord.generatedAt,
    postingPackageFileList: fileList,
    postingPackageZipGenerated: true,
    postingPackageZipPath: zipRecord.zipPath,
    postingPackageZipDownloadUrl: zipRecord.zipDownloadUrl,
    postingPackageZipFileSize: zipRecord.zipFileSize,
    postingPackageZipGeneratedAt: zipRecord.zippedAt,
    postingPackage: packageRecord,
    finalExportKit: {
      ...kit,
      postingPackage: packageRecord,
      postingPackageGenerated: true,
      postingPackageZipGenerated: true
    }
  });

  return { state: nextState, postingPackage: packageRecord, metadata, message: "Posting package exported." };
}

function backupTimestampSlug(date = new Date()) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

function backupIdForDate(date = new Date()) {
  return `backup-${backupTimestampSlug(date)}`;
}

function safeBackupRelativePath(value = "") {
  const raw = String(value || "").trim().replace(/^\/+/, "");
  const normalized = path.posix.normalize(raw).replace(/^\/+/, "");
  if (!normalized || normalized.includes("../") || normalized.includes("..\\")) return "";
  if (normalized.startsWith(".env") || normalized.includes("/.env")) return "";
  if (normalized.startsWith("data/backups/")) return normalized;
  if (/^backup-\d{4}-\d{2}-\d{2}-\d{6}$/.test(normalized)) return `data/backups/${normalized}`;
  return "";
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(source, destination) {
  if (!(await pathExists(source))) return;
  const info = await stat(source);
  if (!info.isDirectory()) throw new Error(`${source} is not a directory.`);
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".env") || ["node_modules", ".next", ".npm-cache", ".git"].includes(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDirectory(from, to);
    else if (entry.isFile()) await copyFile(from, to);
  }
}

async function countFiles(targetPath, extension = "") {
  if (!(await pathExists(targetPath))) return 0;
  const info = await stat(targetPath);
  if (info.isFile()) return !extension || targetPath.toLowerCase().endsWith(extension) ? 1 : 0;
  if (!info.isDirectory()) return 0;
  let count = 0;
  for (const entry of await readdir(targetPath, { withFileTypes: true })) {
    count += await countFiles(path.join(targetPath, entry.name), extension);
  }
  return count;
}

async function countDirectories(targetPath) {
  if (!(await pathExists(targetPath))) return 0;
  let count = 0;
  for (const entry of await readdir(targetPath, { withFileTypes: true })) {
    if (entry.isDirectory()) count += 1;
  }
  return count;
}

function backupCounts(state = {}) {
  const posts = state.posts || [];
  const sourceItems = sourceItemsForState(state);
  return {
    sources: sourceItems.length,
    queuePosts: posts.filter((post) => !post.manuallyPostedAt && post.status !== "manually_posted" && post.status !== "posted").length,
    postedItems: posts.filter((post) => post.manuallyPostedAt || post.status === "manually_posted" || post.status === "posted").length,
    assets: (state.settings?.localAssets || []).length,
    wilmaPoseMappings: (state.settings?.wilmaPoseMappings || []).length,
    finalPngExports: 0,
    postingKits: 0
  };
}

async function createLocalBackup({ type = "local_manual", reason = "manual" } = {}) {
  const state = await store.readState();
  let createdAt = new Date();
  let backupId = backupIdForDate(createdAt);
  for (let offset = 1; await pathExists(path.resolve(process.cwd(), `data/backups/${backupId}`)); offset += 1) {
    createdAt = new Date(Date.now() + offset * 1000);
    backupId = backupIdForDate(createdAt);
  }
  const relativePath = `data/backups/${backupId}`;
  const backupRoot = path.resolve(process.cwd(), relativePath);
  const dataRoot = path.join(backupRoot, "data");
  await mkdir(dataRoot, { recursive: true });

  try {
    await copyFile(path.resolve(process.cwd(), "data/social-command-center.json"), path.join(dataRoot, "social-command-center.json"));
    await copyDirectory(path.resolve(process.cwd(), "data/assets"), path.join(dataRoot, "assets"));
    await copyDirectory(path.resolve(process.cwd(), "data/exports/final-pngs"), path.join(dataRoot, "exports/final-pngs"));
    await copyDirectory(path.resolve(process.cwd(), "data/exports/posting-kits"), path.join(dataRoot, "exports/posting-kits"));
  } catch (error) {
    throw new Error(`Backup failed: ${error.message}`);
  }

  const counts = {
    ...backupCounts(state),
    finalPngExports: await countFiles(path.join(dataRoot, "exports/final-pngs"), ".png"),
    postingKits: await countDirectories(path.join(dataRoot, "exports/posting-kits"))
  };
  const manifest = {
    backupId,
    createdTimestamp: createdAt.toISOString(),
    appName: "LegalEase Social Command Center",
    backupType: type,
    reason,
    counts,
    includedPaths: [
      "data/social-command-center.json",
      "data/assets/",
      "data/exports/final-pngs/",
      "data/exports/posting-kits/"
    ],
    excludedPaths: ["node_modules", ".next", ".npm-cache", ".git", ".env", ".env.local", ".env*"],
    livePostingStatus: "disabled/manual-only",
    secretsIncluded: false,
    notes: "Secrets and environment files are not included in local backups."
  };
  await writeFile(path.join(backupRoot, "backup-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const record = {
    backupId,
    createdAt: manifest.createdTimestamp,
    path: backupRoot,
    relativePath,
    manifestUrl: `/${relativePath}/backup-manifest.json`,
    counts
  };
  return { state, backup: record, manifest, message: "Backup created." };
}

async function listLocalBackups() {
  const backupsRoot = path.resolve(process.cwd(), "data/backups");
  await mkdir(backupsRoot, { recursive: true });
  const backups = [];
  const readManifestFast = async (manifestPath) => {
    try {
      const raw = await Promise.race([
        readFile(manifestPath, "utf8"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("manifest read timed out")), 500))
      ]);
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  for (const entry of await readdir(backupsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^backup-\d{4}-\d{2}-\d{2}-\d{6}$/.test(entry.name)) continue;
    const relativePath = `data/backups/${entry.name}`;
    const manifestPath = path.join(backupsRoot, entry.name, "backup-manifest.json");
    const manifest = await readManifestFast(manifestPath);
    backups.push({
      backupId: entry.name,
      createdAt: manifest?.createdTimestamp || "",
      relativePath,
      manifestUrl: `/${relativePath}/backup-manifest.json`,
      counts: manifest?.counts || {},
      complete: Boolean(manifest)
    });
  }
  backups.sort((a, b) => String(b.backupId).localeCompare(String(a.backupId)));
  return backups.slice(0, 5);
}

async function verifyBackupForRestore(relativePath = "") {
  const safePath = safeBackupRelativePath(relativePath);
  if (!safePath) throw new Error("Restore path must be a safe backup path under data/backups/.");
  const backupRoot = path.resolve(process.cwd(), safePath);
  const backupsRoot = path.resolve(process.cwd(), "data/backups");
  if (!backupRoot.startsWith(backupsRoot)) throw new Error("Restore path is outside data/backups/.");
  const manifestPath = path.join(backupRoot, "backup-manifest.json");
  if (!(await pathExists(manifestPath))) throw new Error("Backup manifest is missing.");
  const required = [
    "data/social-command-center.json",
    "data/assets",
    "data/exports/final-pngs",
    "data/exports/posting-kits"
  ];
  for (const item of required) {
    if (!(await pathExists(path.join(backupRoot, item)))) throw new Error(`Backup is incomplete: ${item} is missing.`);
  }
  return { safePath, backupRoot, manifest: JSON.parse(await readFile(manifestPath, "utf8")) };
}

async function restoreLocalBackup(relativePath = "") {
  const backup = await verifyBackupForRestore(relativePath);
  const safety = await createLocalBackup({ type: "local_manual", reason: "pre_restore_safety" });
  try {
    await copyFile(path.join(backup.backupRoot, "data/social-command-center.json"), path.resolve(process.cwd(), "data/social-command-center.json"));
    await rm(path.resolve(process.cwd(), "data/assets"), { recursive: true, force: true });
    await rm(path.resolve(process.cwd(), "data/exports/final-pngs"), { recursive: true, force: true });
    await rm(path.resolve(process.cwd(), "data/exports/posting-kits"), { recursive: true, force: true });
    await copyDirectory(path.join(backup.backupRoot, "data/assets"), path.resolve(process.cwd(), "data/assets"));
    await copyDirectory(path.join(backup.backupRoot, "data/exports/final-pngs"), path.resolve(process.cwd(), "data/exports/final-pngs"));
    await copyDirectory(path.join(backup.backupRoot, "data/exports/posting-kits"), path.resolve(process.cwd(), "data/exports/posting-kits"));
  } catch (error) {
    throw new Error(`Restore failed after safety backup ${safety.backup.relativePath}: ${error.message}`);
  }
  const state = await store.readState();
  return {
    state,
    restoredFrom: backup.safePath,
    safetyBackup: safety.backup,
    manifest: backup.manifest,
    message: "Backup restored."
  };
}

function performanceTotals(performance = {}) {
  return {
    impressions: Number(performance.impressions || 0),
    likes: Number(performance.likes || 0),
    comments: Number(performance.comments || 0),
    shares: Number(performance.shares || 0),
    saves: Number(performance.saves || 0),
    reposts: Number(performance.reposts || 0),
    clicks: Number(performance.clicks || 0),
    leads: Number(performance.leads || 0)
  };
}

function performanceLabelFor(performance = {}) {
  const totals = performanceTotals(performance);
  if (!totals.impressions) return "Needs Data";
  const engagement = totals.likes + totals.comments + totals.shares + totals.saves + totals.reposts + totals.clicks;
  const rate = engagement / Math.max(1, totals.impressions);
  if (rate >= 0.08 || totals.comments + totals.shares + totals.saves >= 10 || totals.leads >= 2) return "Repurpose Candidate";
  if (rate >= 0.05 || engagement >= 25) return "Strong Engagement";
  if (rate >= 0.02 || engagement >= 8) return "Good Engagement";
  return "Low Signal";
}

async function markPostManuallyPosted(postId) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const image = imageForPostFromState(state, postId);
  const kit = post.finalExportKit || {};
  const targetChannels = (post.targetChannels?.length ? post.targetChannels : [post.platform]).filter(Boolean);
  if (!post.manualPostingKitReady && !kit.manualPostingKitReady) throw new Error("Mark the manual posting kit ready before archiving this post.");
  if (!finalImageIsReady(image) || !post.imageFinalized || !post.finalPreviewConfirmed) throw new Error("Final PNG must be ready before marking manually posted.");
  if (!kit.caption && !composePublishText(post)) throw new Error("Caption is required before marking manually posted.");
  if (!kit.platformFormatId && !post.platform) throw new Error("Platform must be selected before marking manually posted.");
  if (!platforms.every((platform) => !livePostingEnabledForChannel(platform))) throw new Error("Live posting gates must remain disabled for manual posting.");
  const now = new Date().toISOString();
  const nextWorkflow = {
    ...(post.wilmaImageWorkflow || {}),
    state: "Manually Posted",
    updatedAt: now
  };
  const performance = {
    ...(post.performance || {}),
    label: performanceLabelFor(post.performance || {}),
    updatedAt: post.performance?.updatedAt || ""
  };
  const nextState = await store.updatePost(postId, {
    status: "manually_posted",
    imageWorkflowState: "Manually Posted",
    wilmaImageWorkflow: nextWorkflow,
    manuallyPostedAt: now,
    postedAt: now,
    manualPostedChannels: targetChannels,
    publishedAt: now,
    publishingStatus: "manual_posted",
    publishErrorSummary: "",
    performance,
    finalExportKit: {
      ...buildFinalExportKit(post, image, post.wilmaImageWorkflow || {}),
      ...kit,
      manualPostingKitReady: true,
      status: "posted"
    }
  });
  return { state: nextState, message: "Post archived as manually posted." };
}

async function updateManualPerformance(postId, performancePatch = {}) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const numericKeys = ["impressions", "likes", "comments", "shares", "saves", "reposts", "clicks", "leads"];
  const performance = { ...(post.performance || {}) };
  for (const key of numericKeys) {
    if (performancePatch[key] !== undefined) performance[key] = Math.max(0, Number(performancePatch[key] || 0));
  }
  performance.notes = String(performancePatch.notes ?? performance.notes ?? "");
  performance.label = performanceLabelFor(performance);
  performance.updatedAt = new Date().toISOString();
  const nextState = await store.updatePost(postId, { performance });
  return { state: nextState, performance, message: "Performance updated." };
}

function repurposeFormatLabel(formatId) {
  return repurposeFormats.find((format) => format.id === formatId)?.label || repurposeFormats[0].label;
}

function firstSentence(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)[0]
    .trim();
}

function repurposeBaseTopic(post) {
  return String(post.hook || post.title || firstSentence(post.body) || "This LegalEase idea").replace(/\s+/g, " ").trim();
}

function repurposePlatformFor(formatId, post) {
  if (formatId === "linkedin_version") return "linkedin";
  if (formatId === "instagram_version") return "instagram";
  if (formatId === "x_version") return "x";
  return post.platform || "linkedin";
}

function deterministicRepurposeCopy(post, formatId) {
  const topic = repurposeBaseTopic(post);
  const originalPlain = firstSentence(post.body) || topic;
  const format = repurposeFormatLabel(formatId);
  if (formatId === "myth_check") {
    return {
      hook: `Myth: ${topic}`,
      body: `Myth: ${topic}\n\nTruth: the real work is helping people understand what the rule means, what questions to ask, and what next step is available.\n\nLegalEase keeps the explanation plain and practical. General information only, not legal advice.`,
      cta: "Turn confusing rules into clearer next steps.",
      contentBucket: "Wilma Myth Check",
      visualBucket: "Wilma Myth Check",
      wilmaVisualBucket: "Wilma Myth Check",
      overlayHeadline: "Myth vs. next step"
    };
  }
  if (formatId === "wilma_translation") {
    return {
      hook: `Wilma translation: ${topic}`,
      body: `Wilma translation:\n\n${topic} means people need a plain-English way to understand what changed, what did not change, and what they can ask next.\n\nThe goal is not to make the system sound simple. The goal is to make the next step easier to see.`,
      cta: "Ask better questions before taking the next step.",
      contentBucket: "Wilma Translation",
      visualBucket: "Wilma Translation",
      wilmaVisualBucket: "Wilma Translation",
      overlayHeadline: "Wilma translates the rule"
    };
  }
  if (formatId === "founder_pov") {
    return {
      hook: "The real issue is not awareness. It is implementation.",
      body: `Founder POV:\n\n${topic}\n\nThe real issue is not awareness. It is implementation. People can know a second-chance option exists and still get stuck if the process is too hard to understand, too hard to start, or too easy to abandon.\n\nThat is the infrastructure LegalEase is building toward.`,
      cta: "Build the layer that helps people act.",
      contentBucket: "The Implementation Layer",
      visualBucket: "LegalEase POV",
      wilmaVisualBucket: "LegalEase POV",
      overlayHeadline: "Implementation is access"
    };
  }
  if (formatId === "carousel_outline") {
    return {
      hook: `Carousel outline: ${topic}`,
      body: `Carousel outline:\n\nSlide 1 hook: ${topic}\nSlide 2 problem: people hit complexity before they hit help.\nSlide 3 why it matters: second chances depend on usable systems.\nSlide 4 LegalEase angle: plain-English guidance and better next-step routing.\nSlide 5 CTA: make the next step easier to understand.`,
      cta: "Use this as a carousel outline before designing slides.",
      contentBucket: "LegalEase POV",
      visualBucket: "Explainer carousel",
      wilmaVisualBucket: "The Implementation Layer",
      overlayHeadline: "5-slide outline"
    };
  }
  if (formatId === "instagram_version") {
    return {
      hook: topic,
      body: `${originalPlain}\n\nMake the point visual. Keep the overlay short. Let Wilma carry the plain-English explanation, then use the caption for context.\n\nGeneral information only, not legal advice.`,
      cta: "Save this for the next confusing step.",
      contentBucket: post.finalExportKit?.contentBucket || post.contentBucket || "Ask Wilma",
      visualBucket: "Wilma answer / explainer graphic",
      wilmaVisualBucket: post.wilmaVisualBucket || "Ask Wilma",
      overlayHeadline: "Plain English matters"
    };
  }
  if (formatId === "x_version") {
    return {
      hook: "Legal access has a UX problem.",
      body: `${topic}\n\nLegal access has a UX problem. If people cannot understand the next step, the option might as well be hidden.`,
      cta: "Make the next step easier to see.",
      contentBucket: "LegalEase POV",
      visualBucket: "Quote card",
      wilmaVisualBucket: "LegalEase POV",
      overlayHeadline: "Access has a UX problem"
    };
  }
  if (formatId === "linkedin_version") {
    return {
      hook: topic,
      body: `${topic}\n\nThe durable lesson is that access work cannot stop at policy, awareness, or intent. The next layer is implementation: plain-language guidance, better routing, and tools that help people move from confusion to a better question.\n\nThat is where LegalEase is focused.`,
      cta: "Build practical infrastructure for second chances.",
      contentBucket: "The Implementation Layer",
      visualBucket: "People-centered editorial graphic",
      wilmaVisualBucket: "The Implementation Layer",
      overlayHeadline: "Policy needs implementation"
    };
  }
  return {
    hook: topic.length > 84 ? `${topic.slice(0, 81).trim()}...` : topic,
    body: `${topic}\n\nShorter version: when the system is hard to understand, people do not just need motivation. They need a clearer next step.\n\nLegalEase is built around that practical gap.`,
    cta: "Make the next step easier to understand.",
    contentBucket: post.finalExportKit?.contentBucket || post.contentBucket || "LegalEase POV",
    visualBucket: post.visualBucket || "Quote card",
    wilmaVisualBucket: post.wilmaVisualBucket || "LegalEase POV",
    overlayHeadline: "Clearer next steps"
  };
}

async function createRepurposeDraft(postId, formatId = "shorter_punchier") {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Original post not found.");
  const label = performanceLabelFor(post.performance || {});
  if (label !== "Repurpose Candidate") throw new Error("Only Repurpose Candidate posts can create repurpose drafts.");
  const safeFormatId = repurposeFormats.some((format) => format.id === formatId) ? formatId : "shorter_punchier";
  const copy = deterministicRepurposeCopy(post, safeFormatId);
  const platform = repurposePlatformFor(safeFormatId, post);
  const now = new Date().toISOString();
  const draft = {
    ...post,
    id: crypto.randomUUID(),
    title: `${copy.hook} (${repurposeFormatLabel(safeFormatId)})`,
    platform,
    targetChannels: [platform],
    status: "draft",
    sourceType: "Repurposed",
    sourceUrl: "",
    sourceSummary: `Repurposed from ${post.id} using ${repurposeFormatLabel(safeFormatId)}.`,
    sourceReference: `Repurposed from ${post.id}`,
    repurposedFromPostId: post.id,
    originalPostId: post.id,
    repurposeFormat: safeFormatId,
    repurposeFormatLabel: repurposeFormatLabel(safeFormatId),
    repurposeCreatedAt: now,
    hook: copy.hook,
    body: copy.body,
    cta: copy.cta,
    hashtags: post.hashtags || [],
    channelAdaptations: platformAdaptationsForPost({
      hook: copy.hook,
      body: copy.body,
      cta: copy.cta,
      hashtags: post.hashtags || [],
      speaker: post.speaker,
      contentBucket: copy.contentBucket
    }),
    contentBucket: copy.contentBucket,
    visualBucket: copy.visualBucket,
    wilmaVisualBucket: copy.wilmaVisualBucket,
    overlayHeadline: copy.overlayHeadline,
    overlayKicker: copy.contentBucket,
    overlaySupport: "",
    scheduledFor: "",
    copyReviewed: false,
    copyReviewedAt: "",
    imageWorkflowState: "Needs Image",
    wilmaImageWorkflow: null,
    imagePrompt: "",
    negativePrompt: "",
    overlayConfirmed: false,
    overlayConfirmedAt: "",
    imageFinalized: false,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: "",
    finalExportKit: null,
    finalPngReady: false,
    manualPostingKitReady: false,
    manualPostingKitReadyAt: "",
    manuallyPostedAt: "",
    postedAt: "",
    publishedAt: "",
    publishingStatus: "",
    publishErrorSummary: "",
    externalPostId: "",
    externalPostUrl: "",
    publishedUrl: "",
    performance: {},
    repurposeHistory: [],
    createdAt: now,
    updatedAt: now
  };
  delete draft.finalImageUrl;
  delete draft.finalImage;
  delete draft.finalPngUrl;
  delete draft.manualPostedChannels;
  await store.generatePosts([draft]);
  const historyItem = {
    draftId: draft.id,
    createdAt: now,
    formatId: safeFormatId,
    formatLabel: repurposeFormatLabel(safeFormatId)
  };
  const nextState = await store.updatePost(post.id, {
    repurposeHistory: [...(post.repurposeHistory || []), historyItem]
  });
  return { state: nextState, draft, message: "Repurpose draft created." };
}

function channelPublishText(post, channel = post.platform) {
  const adaptation = post.channelAdaptations?.[channel];
  if (adaptation?.text) return adaptation.text;
  return composePublishText(post, channel);
}

function channelDryRun(post, image, channel, safeChannel = {}) {
  const text = channelPublishText(post, channel);
  const charCount = text.length;
  const finalReady = finalImageIsReady(image);
  const aspectRatio = image?.aspectRatio || image?.assetBundleUsed?.finalImage?.aspectRatio || "";
  const squareImage =
    aspectRatio === "1:1" ||
    (image?.finalImageWidth && image.finalImageWidth === image.finalImageHeight);
  const result = {
    channel,
    displayName: channelLabels[channel] || channel,
    status: "passed",
    message: "Dry run passed.",
    accountName: safeChannel.accountName || "",
    connected: Boolean(safeChannel.connected),
    configured: Boolean(safeChannel.configured),
    finalImageReady: finalReady,
    livePostingEnabled: livePostingEnabledForChannel(channel),
    characterCount: charCount,
    imageAspectRatio: aspectRatio || "unknown",
    threadCandidate: channel === "x" && charCount > 240 && charCount <= 280
  };
  if (!safeChannel.configured) {
    return { ...result, status: "blocked", message: `${result.displayName} needs OAuth setup.` };
  }
  if (!safeChannel.connected) {
    return { ...result, status: "blocked", message: `${result.displayName} is not connected.` };
  }
  if (!finalReady) {
    return { ...result, status: "blocked", message: `${result.displayName} needs a final PNG before posting.` };
  }
  if (channel === "x" && charCount > 280) {
    return { ...result, status: "blocked", message: "X / Twitter post text is over 280 characters." };
  }
  if (channel === "instagram" && !squareImage) {
    return { ...result, status: "blocked", message: "Instagram requires a square final PNG for MVP." };
  }
  if (result.threadCandidate) {
    return { ...result, status: "warning", message: "X / Twitter text passes, but it is a thread candidate over 240 characters." };
  }
  return result;
}

function channelReadinessDetails(state, post) {
  const image = imageForPostFromState(state, post?.id);
  const safeChannels = safeChannelsResponse(state);
  const targetChannels = Array.isArray(post?.targetChannels) && post.targetChannels.length ? post.targetChannels : [post?.platform].filter(Boolean);
  const dryRuns = Object.fromEntries(
    targetChannels.map((channel) => {
      const safeChannel = safeChannels.find((item) => item.channel === channel) || {};
      const dryRun = channelDryRun(post, image, channel, safeChannel);
      return [channel, dryRun];
    })
  );
  return { targetChannels, image, dryRuns };
}

function localImagePathFromUrl(imageUrl = "") {
  if (!imageUrl || imageUrl.startsWith("data:") || /^https?:\/\//i.test(imageUrl)) return "";
  const clean = decodeURIComponent(imageUrl).replace(/^\/+/, "");
  if ((!clean.startsWith("assets/") && !clean.startsWith("data/exports/final-pngs/") && !clean.startsWith("data/assets/")) || clean.includes("..")) return "";
  return path.join(process.cwd(), clean);
}

async function imageBufferFromUrl(imageUrl = "") {
  if (!imageUrl) throw new Error("Image URL is missing.");
  const dataMatch = String(imageUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) return Buffer.from(dataMatch[2], "base64");
  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Could not download image.");
    return Buffer.from(await response.arrayBuffer());
  }
  const localPath = localImagePathFromUrl(imageUrl);
  if (!localPath || !existsSync(localPath)) throw new Error("Local image file is missing.");
  return readFile(localPath);
}

async function removeLightBackground(buffer) {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const isLight = (pixel) => {
    const red = data[pixel];
    const green = data[pixel + 1];
    const blue = data[pixel + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    return max > 238 && max - min < 24;
  };
  const seen = new Uint8Array(info.width * info.height);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const pixelIndex = y * info.width + x;
    if (seen[pixelIndex]) return;
    const dataIndex = pixelIndex * 4;
    if (!isLight(dataIndex)) return;
    seen[pixelIndex] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < info.width; x += 1) {
    push(x, 0);
    push(x, info.height - 1);
  }
  for (let y = 0; y < info.height; y += 1) {
    push(0, y);
    push(info.width - 1, y);
  }
  while (queue.length) {
    const [x, y] = queue.pop();
    const dataIndex = (y * info.width + x) * 4;
    data[dataIndex + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
    if (x % 2 === 0 && y % 2 === 0) {
      push(x + 1, y + 1);
      push(x - 1, y - 1);
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function canonicalWilmaCutoutBuffer(context = {}) {
  const { default: sharp } = await import("sharp");
  const asset = context.wilmaReferenceAssets?.[0];
  const referenceUrl = assetFileUrl(asset);
  if (!referenceUrl || !existsSync(referenceUrl)) {
    throw new Error("Wilma generation blocked: canonical reference asset missing.");
  }
  const referencePath = fileURLToPath(referenceUrl);
  const metadata = await sharp(referencePath).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  const crop = {
    left: Math.round(width * 0.5),
    top: Math.round(height * 0.07),
    width: Math.round(width * 0.45),
    height: Math.round(height * 0.58)
  };
  const extracted = await sharp(referencePath)
    .extract(crop)
    .png()
    .toBuffer();
  return removeLightBackground(extracted);
}

async function compositeCanonicalWilmaPanel(imageUrl, context = {}) {
  const { default: sharp } = await import("sharp");
  const { width, height } = finalDimensionsForImage({ aspectRatio: context.aspectRatio });
  const baseBuffer = await imageBufferFromUrl(imageUrl);
  const base = await sharp(baseBuffer)
    .resize(width, height, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  const panel = {
    width: Math.round(width * 0.34),
    height: Math.round(height * 0.43)
  };
  panel.left = Math.round(width * 0.61);
  panel.top = Math.round(height * 0.48);
  const wilma = await sharp(await canonicalWilmaCutoutBuffer(context))
    .resize({
      width: Math.round(panel.width * 0.92),
      height: Math.round(panel.height * 0.9),
      fit: "contain",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();
  const wilmaMeta = await sharp(wilma).metadata();
  const wilmaLeft = panel.left + Math.round((panel.width - (wilmaMeta.width || panel.width)) / 2);
  const wilmaTop = panel.top + Math.round(panel.height - (wilmaMeta.height || panel.height) - height * 0.015);
  const panelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="panelShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="${Math.round(height * 0.014)}" stdDeviation="${Math.round(width * 0.018)}" flood-color="#020D66" flood-opacity=".35"/>
      </filter>
      <filter id="wilmaShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="${Math.round(height * 0.016)}" stdDeviation="${Math.round(width * 0.016)}" flood-color="#020D66" flood-opacity=".34"/>
      </filter>
    </defs>
    <rect x="${panel.left}" y="${panel.top}" width="${panel.width}" height="${panel.height}" rx="${Math.round(width * 0.022)}" fill="#020D66" opacity=".88" filter="url(#panelShadow)"/>
    <rect x="${panel.left + Math.round(width * 0.012)}" y="${panel.top + Math.round(width * 0.012)}" width="${panel.width - Math.round(width * 0.024)}" height="${panel.height - Math.round(width * 0.024)}" rx="${Math.round(width * 0.016)}" fill="none" stroke="#F04800" stroke-width="${Math.max(5, Math.round(width * 0.006))}"/>
    <path d="M${Math.round(width * 0.5)} ${Math.round(height * 0.64)} C ${Math.round(width * 0.57)} ${Math.round(height * 0.64)}, ${Math.round(width * 0.56)} ${Math.round(height * 0.74)}, ${panel.left} ${Math.round(height * 0.74)}" fill="none" stroke="#F04800" stroke-width="${Math.max(5, Math.round(width * 0.006))}" stroke-linecap="round"/>
    <circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.64)}" r="${Math.round(width * 0.012)}" fill="#F04800"/>
    <ellipse cx="${panel.left + Math.round(panel.width * 0.5)}" cy="${panel.top + Math.round(panel.height * 0.88)}" rx="${Math.round(panel.width * 0.33)}" ry="${Math.round(height * 0.018)}" fill="#000" opacity=".24"/>
  </svg>`;
  const composed = await sharp(base)
    .composite([
      { input: Buffer.from(panelSvg), top: 0, left: 0 },
      { input: wilma, top: wilmaTop, left: wilmaLeft }
    ])
    .png()
    .toBuffer();
  return `data:image/png;base64,${composed.toString("base64")}`;
}

function finalDimensionsForImage(image = {}, post = {}) {
  const format = exportFormatForPost(post, post.finalExportKit?.platformFormatId);
  if (format?.width && format?.height) return { width: format.width, height: format.height };
  if (image.aspectRatio === "16:9") return { width: 1600, height: 900 };
  if (image.aspectRatio === "4:5" || image.aspectRatio === "9:16") return { width: 1080, height: 1350 };
  return { width: 1200, height: 1200 };
}

function overlaySvgForFinalImage({ post, image, width, height, brandMarkAsset = null }) {
  const overlay = overlayTextForPostServer(post);
  const scale = width / 1200;
  const margin = Math.round(width * 0.08);
  const headlineSize = Math.round(54 * scale);
  const headlineLineHeight = Math.round(58 * scale);
  const supportSize = Math.round(17 * scale);
  const supportLineHeight = Math.round(24 * scale);
  const headlineChars = width > height ? 30 : 24;
  const supportChars = width > height ? 52 : 38;
  const headlineLines = wrapSvgText(String(overlay.headline || "").toUpperCase(), headlineChars, 4);
  const supportLines = wrapSvgText(overlay.support, supportChars, 3);
  const watermarkPosition = image.watermarkPosition || image.assetBundleUsed?.watermark?.position || "none";
  const markPath = brandMarkAsset?.filePath || "assets/brand/logos/legalease-mark-white.png";
  const watermark = watermarkPosition !== "none" ? assetDataUri(markPath) : "";
  const wmWidth = Math.round(width * 0.12);
  const wmHeight = Math.round(wmWidth * 0.55);
  const wmPad = Math.round(width * 0.04);
  const wmX = watermarkPosition.endsWith("right") ? width - wmWidth - wmPad : wmPad;
  const wmY = watermarkPosition.startsWith("bottom") ? height - wmHeight - wmPad : wmPad;
  if (overlay.mode === "none") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${watermark ? `<image href="${watermark}" x="${wmX}" y="${wmY}" width="${wmWidth}" height="${wmHeight}" preserveAspectRatio="xMidYMid meet" opacity=".86"/>` : ""}
    </svg>`;
  }
  const supportY = height - margin - (supportLines.length * supportLineHeight) - Math.round(24 * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="${Math.round(4 * scale)}" stdDeviation="${Math.round(10 * scale)}" flood-color="#020D66" flood-opacity=".45"/>
      </filter>
    </defs>
    <rect x="${margin}" y="${margin}" width="${Math.round(width * 0.38)}" height="${Math.round(28 * scale)}" rx="${Math.round(4 * scale)}" fill="#020D66" opacity=".84"/>
    <text x="${margin + Math.round(12 * scale)}" y="${margin + Math.round(20 * scale)}" font-family="DM Sans,Arial,sans-serif" font-size="${Math.round(13 * scale)}" font-weight="900" letter-spacing="${Math.round(3 * scale)}" fill="#F04800">${escapeSvg(String(overlay.kicker || "").toUpperCase())}</text>
    <text x="${margin}" y="${margin + Math.round(102 * scale)}" font-family="DM Sans,Arial,sans-serif" font-size="${headlineSize}" font-weight="900" fill="#FFFFFF" letter-spacing="0" filter="url(#shadow)">${svgLineTspans(headlineLines, margin, margin + Math.round(102 * scale), headlineLineHeight)}</text>
    <rect x="${margin}" y="${supportY - Math.round(24 * scale)}" width="${Math.round(width * 0.62)}" height="${Math.round(38 * scale + supportLines.length * supportLineHeight)}" rx="${Math.round(8 * scale)}" fill="#020D66" opacity=".72"/>
    <rect x="${margin}" y="${supportY - Math.round(24 * scale)}" width="${Math.round(7 * scale)}" height="${Math.round(38 * scale + supportLines.length * supportLineHeight)}" fill="#F04800"/>
    <text x="${margin + Math.round(18 * scale)}" y="${supportY}" font-family="DM Mono,Menlo,monospace" font-size="${supportSize}" font-weight="650" fill="#E5EBEB">${svgLineTspans(supportLines, margin + Math.round(18 * scale), supportY, supportLineHeight)}</text>
    ${watermark ? `<image href="${watermark}" x="${wmX}" y="${wmY}" width="${wmWidth}" height="${wmHeight}" preserveAspectRatio="xMidYMid meet" opacity=".86"/>` : ""}
	  </svg>`;
	}

async function brandedFinalPngPlaceholderBuffer({ post = {}, image = {}, workflow = {}, width = 1200, height = 1200 } = {}) {
  const { default: sharp } = await import("sharp");
  const overlay = overlayTextForPostServer(post);
  const bucket = workflow.visualBucket || post.wilmaVisualBucket || image.visualBucket || post.contentBucket || "LegalEase";
  const speaker = post.speaker || post.author || "LegalEase";
  const expression = workflow.wilmaExpression || image.wilmaExpression || post.wilmaExpression || "Helpful";
  const pose = workflow.wilmaPoseReferenceName || image.wilmaPoseReferenceName || post.wilmaPoseReferenceId || "Wilma pose pending";
  const scale = width / 1200;
  const margin = Math.round(width * 0.065);
  const safeTitle = wrapSvgText(String(post.title || post.hook || "LegalEase social post"), width > height ? 34 : 26, 3);
  const safeBucket = String(bucket).toUpperCase();
  const footer = `Manual LegalEase social asset · ${String(speaker).replace(/_/g, " ")} · ${String(expression)} · ${String(pose).replace(/^Wilma canonical pose:\s*/i, "")}`;
  const watermark = assetDataUri("assets/brand/logos/legalease-mark-white.png");
  const wmWidth = Math.round(width * 0.14);
  const wmHeight = Math.round(wmWidth * 0.55);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#020D66"/>
        <stop offset=".62" stop-color="#2739A7"/>
        <stop offset="1" stop-color="#B8D8D8"/>
      </linearGradient>
      <pattern id="paper" width="${Math.round(46 * scale)}" height="${Math.round(46 * scale)}" patternUnits="userSpaceOnUse">
        <path d="M0 ${Math.round(45 * scale)} H${Math.round(46 * scale)} M${Math.round(45 * scale)} 0 V${Math.round(46 * scale)}" stroke="#FFFFFF" stroke-opacity=".045" stroke-width="1"/>
      </pattern>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="${Math.round(12 * scale)}" stdDeviation="${Math.round(18 * scale)}" flood-color="#020D66" flood-opacity=".34"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#paper)"/>
    <path d="M${Math.round(width * 0.08)} ${Math.round(height * 0.74)} C ${Math.round(width * 0.28)} ${Math.round(height * 0.56)}, ${Math.round(width * 0.54)} ${Math.round(height * 0.82)}, ${Math.round(width * 0.92)} ${Math.round(height * 0.24)}" fill="none" stroke="#F04800" stroke-width="${Math.max(6, Math.round(width * 0.008))}" stroke-linecap="round" opacity=".88"/>
    <circle cx="${Math.round(width * 0.08)}" cy="${Math.round(height * 0.74)}" r="${Math.round(width * 0.018)}" fill="#F04800"/>
    <circle cx="${Math.round(width * 0.92)}" cy="${Math.round(height * 0.24)}" r="${Math.round(width * 0.018)}" fill="#F04800"/>
    <rect x="${Math.round(width * 0.59)}" y="${Math.round(height * 0.13)}" width="${Math.round(width * 0.31)}" height="${Math.round(height * 0.62)}" rx="${Math.round(width * 0.025)}" fill="#F7F3EA" opacity=".96" filter="url(#shadow)"/>
    <circle cx="${Math.round(width * 0.745)}" cy="${Math.round(height * 0.31)}" r="${Math.round(width * 0.078)}" fill="#B8D8D8"/>
    <path d="M${Math.round(width * 0.69)} ${Math.round(height * 0.42)} Q${Math.round(width * 0.745)} ${Math.round(height * 0.37)} ${Math.round(width * 0.80)} ${Math.round(height * 0.42)} V${Math.round(height * 0.63)} H${Math.round(width * 0.69)} Z" fill="#020D66"/>
    <rect x="${Math.round(width * 0.64)}" y="${Math.round(height * 0.69)}" width="${Math.round(width * 0.21)}" height="${Math.round(height * 0.018)}" rx="${Math.round(width * 0.009)}" fill="#F04800"/>
    <text x="${margin}" y="${Math.round(height * 0.17)}" font-family="DM Sans,Arial,sans-serif" font-size="${Math.round(14 * scale)}" font-weight="900" letter-spacing="${Math.round(3 * scale)}" fill="#F04800">${escapeSvg(safeBucket)}</text>
    <text x="${margin}" y="${Math.round(height * 0.25)}" font-family="DM Sans,Arial,sans-serif" font-size="${Math.round(37 * scale)}" font-weight="900" fill="#FFFFFF">${svgLineTspans(safeTitle, margin, Math.round(height * 0.25), Math.round(42 * scale))}</text>
    <rect x="${margin}" y="${Math.round(height * 0.82)}" width="${Math.round(width * 0.66)}" height="${Math.round(54 * scale)}" rx="${Math.round(7 * scale)}" fill="#020D66" opacity=".72"/>
    <text x="${margin + Math.round(16 * scale)}" y="${Math.round(height * 0.855)}" font-family="DM Mono,Menlo,monospace" font-size="${Math.round(13 * scale)}" fill="#E5EBEB">${escapeSvg(footer.slice(0, 118))}</text>
    ${watermark ? `<image href="${watermark}" x="${width - wmWidth - margin}" y="${height - wmHeight - margin}" width="${wmWidth}" height="${wmHeight}" preserveAspectRatio="xMidYMid meet" opacity=".82"/>` : `<text x="${width - margin}" y="${height - margin}" text-anchor="end" font-family="DM Sans,Arial,sans-serif" font-size="${Math.round(18 * scale)}" font-weight="900" fill="#FFFFFF">LegalEase</text>`}
    ${overlay.mode === "none" ? `<text x="${margin}" y="${Math.round(height * 0.72)}" font-family="DM Sans,Arial,sans-serif" font-size="${Math.round(24 * scale)}" font-weight="800" fill="#FFFFFF">Wilma visual placeholder</text>` : ""}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function composeLocalAssetBase({ state = {}, post = {}, image = {}, workflow = {}, width = 1200, height = 1200 } = {}) {
  const { default: sharp } = await import("sharp");
  const backgroundAsset = localAssetById(state, workflow.backgroundAssetId || image.assetBundleUsed?.selectedAssets?.backgroundAssetId || "");
  const wilmaAsset = localAssetById(state, workflow.wilmaAssetId || image.assetBundleUsed?.selectedAssets?.wilmaAssetId || "") || linkedAssetForPose(state, workflow.wilmaPoseReferenceId);
  let baseBuffer;

  if (backgroundAsset?.filePath) {
    const backgroundUrl = localAssetFileUrl(backgroundAsset.filePath);
    if (backgroundUrl && existsSync(backgroundUrl)) {
      baseBuffer = await sharp(fileURLToPath(backgroundUrl))
        .resize(width, height, { fit: "cover", position: "attention" })
        .png()
        .toBuffer();
    }
  }

  if (!baseBuffer) {
    baseBuffer = await brandedFinalPngPlaceholderBuffer({ post, image, workflow, width, height });
  }

  if (!wilmaAsset?.filePath) return { buffer: baseBuffer, wilmaAsset, backgroundAsset };
  const wilmaUrl = localAssetFileUrl(wilmaAsset.filePath);
  if (!wilmaUrl || !existsSync(wilmaUrl)) return { buffer: baseBuffer, wilmaAsset: null, backgroundAsset };

  const panelWidth = Math.round(width * 0.34);
  const panelHeight = Math.round(height * 0.5);
  const wilma = await sharp(fileURLToPath(wilmaUrl))
    .resize({
      width: panelWidth,
      height: panelHeight,
      fit: "contain",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  const meta = await sharp(wilma).metadata();
  const left = Math.max(Math.round(width * 0.58), width - (meta.width || panelWidth) - Math.round(width * 0.07));
  const top = Math.max(Math.round(height * 0.22), height - (meta.height || panelHeight) - Math.round(height * 0.13));
  const assetFrame = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><filter id="assetShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${Math.round(height * 0.014)}" stdDeviation="${Math.round(width * 0.018)}" flood-color="#020D66" flood-opacity=".30"/></filter></defs>
    <rect x="${left - Math.round(width * 0.018)}" y="${top - Math.round(height * 0.018)}" width="${(meta.width || panelWidth) + Math.round(width * 0.036)}" height="${(meta.height || panelHeight) + Math.round(height * 0.036)}" rx="${Math.round(width * 0.018)}" fill="#F7F3EA" opacity=".84" filter="url(#assetShadow)"/>
  </svg>`;
  const buffer = await sharp(baseBuffer)
    .composite([
      { input: Buffer.from(assetFrame), top: 0, left: 0 },
      { input: wilma, left, top }
    ])
    .png()
    .toBuffer();
  return { buffer, wilmaAsset, backgroundAsset };
}

async function composeFinalPostImage(state, post, image) {
  const { default: sharp } = await import("sharp");
  const workflow = post.wilmaImageWorkflow || buildWilmaImageWorkflow(state, post);
  const kit = buildFinalExportKit(post, image, workflow);
  const overlay = overlayTextForPostServer(post);
  if (overlay.mode !== "none" && !String(overlay.headline || "").trim()) {
    throw new Error("Add overlay text before creating the final PNG.");
  }
  const { width, height } = finalDimensionsForImage(image, post);
  if (!width || !height) throw new Error("Choose a supported platform size before creating the final PNG.");
  const brandMarkAsset = localAssetById(state, workflow.brandMarkAssetId || image.assetBundleUsed?.selectedAssets?.brandMarkAssetId || "");
  let sourceBuffer;
  let selectedAssetResult = {};
  if (workflow.wilmaAssetId || workflow.backgroundAssetId || linkedAssetForPose(state, workflow.wilmaPoseReferenceId)) {
    selectedAssetResult = await composeLocalAssetBase({ state, post, image, workflow, width, height });
    sourceBuffer = selectedAssetResult.buffer;
  } else {
    try {
      sourceBuffer = await imageBufferFromUrl(image.imageUrl);
    } catch {
      sourceBuffer = await brandedFinalPngPlaceholderBuffer({ post, image, workflow, width, height });
    }
  }
  const base = await sharp(sourceBuffer)
    .resize(width, height, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  const overlaySvg = overlaySvgForFinalImage({ post, image, width, height, brandMarkAsset });
  const composed = await sharp(base)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
  const outputDir = new URL("data/exports/final-pngs/", assetRoot);
  await mkdir(outputDir, { recursive: true });
  const versionNumber = Math.max(1, ...((state.postImages || []).filter((item) => item.postId === post.id).map((item) => Number(item.versionNumber || 1)))) + 1;
  const filename = safeDownloadFilename(kit.exportFilename);
  const outputUrl = new URL(filename, outputDir);
  try {
    await writeFile(outputUrl, composed);
  } catch (error) {
    throw new Error(`Could not write final PNG: ${error.message}`);
  }
  const localPath = fileURLToPath(outputUrl);
  return {
    versionNumber,
    imageUrl: `/${finalPngExportRelativePath(filename)}`,
    localPath,
    fileSize: composed.length,
    generatedAt: new Date().toISOString(),
    width,
    height,
    selectedAssets: {
      wilmaAssetId: selectedAssetResult.wilmaAsset?.id || workflow.wilmaAssetId || "",
      backgroundAssetId: selectedAssetResult.backgroundAsset?.id || workflow.backgroundAssetId || "",
      brandMarkAssetId: brandMarkAsset?.id || workflow.brandMarkAssetId || ""
    }
  };
}

async function sendFinalPngDownload(postId, response) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Post not found");
    return;
  }
  const image = imageForPostFromState(state, postId);
  if (!image || !finalImageIsReady(image)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Final PNG not generated yet");
    return;
  }
  const localPath = localImagePathFromUrl(image.imageUrl);
  if (!localPath || !existsSync(localPath)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Final PNG file is missing");
    return;
  }
  const workflow = post.wilmaImageWorkflow || buildWilmaImageWorkflow(state, post);
  const kit = buildFinalExportKit(post, image, workflow);
  const body = await readFile(localPath);
  response.writeHead(200, {
    "content-type": "image/png",
    "content-length": String(body.length),
    "content-disposition": `attachment; filename="${safeDownloadFilename(kit.exportFilename)}"`,
    "cache-control": "no-store"
  });
  response.end(body);
}

async function linkedInJson(url, { method = "GET", accessToken, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-restli-protocol-version": "2.0.0"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error_description || payload.error || "LinkedIn API request failed.");
  }
  return payload;
}

async function uploadLinkedInImage({ accessToken, ownerUrn, image }) {
  if (!image?.imageUrl) return null;
  const imageBuffer = await imageBufferFromUrl(image.imageUrl);
  const registerPayload = await linkedInJson("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    accessToken,
    body: {
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: ownerUrn,
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent"
          }
        ]
      }
    }
  });
  const uploadMechanism =
    registerPayload.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"];
  const uploadUrl = uploadMechanism?.uploadUrl;
  const asset = registerPayload.value?.asset;
  if (!uploadUrl || !asset) throw new Error("LinkedIn image upload did not return an upload URL.");
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}` },
    body: imageBuffer
  });
  if (!uploadResponse.ok) throw new Error("LinkedIn image upload failed.");
  return asset;
}

async function publishLinkedInPost({ state, post }) {
  const account = (state.socialAccounts || []).find((item) => item.platform === "linkedin");
  if (!account?.accessTokenEncrypted) throw new Error("LinkedIn account token is missing.");
  const accessToken = decryptToken(account.accessTokenEncrypted);
  const personId = account.accountId || account.externalAccountId;
  if (!personId) throw new Error("LinkedIn account id is missing.");
  const ownerUrn = `urn:li:person:${personId}`;
  const image = imageForPostFromState(state, post.id);
  const imageAsset = await uploadLinkedInImage({ accessToken, ownerUrn, image });
  const body = {
    author: ownerUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
	        shareCommentary: { text: composePublishText(post, "linkedin") },
        shareMediaCategory: imageAsset ? "IMAGE" : "NONE",
        ...(imageAsset
          ? {
              media: [
                {
                  status: "READY",
                  description: { text: post.title || "LegalEase post image" },
                  media: imageAsset,
                  title: { text: post.hook || post.title || "LegalEase" }
                }
              ]
            }
          : {})
      }
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
    }
  };
  const payload = await linkedInJson("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    accessToken,
    body
  });
  const externalPostId = payload.id || "";
  return {
    externalPostId,
    externalPostUrl: externalPostId ? `https://www.linkedin.com/feed/update/${externalPostId}/` : "",
    message: imageAsset ? "Published to LinkedIn with image." : "Published to LinkedIn as text-only post."
  };
}

async function graphJson(url, { method = "GET", body, form } = {}) {
  const options = { method };
  if (form) {
    options.body = form;
  } else if (body) {
    options.headers = { "content-type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.error || {};
    throw new Error(error.message || payload.error_description || payload.error || "Graph API request failed.");
  }
  return payload;
}

async function publishFacebookPost({ state, post }) {
  const accessToken = storedOrEnvAccessToken(state, "facebook");
  const pageId = accountIdForPublishing(state, "facebook");
  const image = imageForPostFromState(state, post.id);
  const message = composePublishText(post, "facebook");
  if (!message) throw new Error("Facebook caption is missing.");
  if (image?.imageUrl) {
    const imageBuffer = await imageBufferFromUrl(image.imageUrl);
    const form = new FormData();
    form.set("access_token", accessToken);
    form.set("message", message);
    form.set("published", "true");
    form.set("source", new Blob([imageBuffer], { type: "image/png" }), "final.png");
    const payload = await graphJson(graphUrl(`/${pageId}/photos`), { method: "POST", form });
    const externalPostId = payload.post_id || payload.id || "";
    return {
      externalPostId,
      externalPostUrl: externalPostId ? `https://www.facebook.com/${externalPostId}` : "",
      message: "Published to Facebook Page with image."
    };
  }
  const form = new URLSearchParams({ access_token: accessToken, message });
  const payload = await graphJson(graphUrl(`/${pageId}/feed`), { method: "POST", form });
  const externalPostId = payload.id || "";
  return {
    externalPostId,
    externalPostUrl: externalPostId ? `https://www.facebook.com/${externalPostId}` : "",
    message: "Published to Facebook Page as text-only post."
  };
}

async function publishInstagramPost({ state, post }) {
  const accessToken = storedOrEnvAccessToken(state, "instagram");
  const igUserId = accountIdForPublishing(state, "instagram");
  const image = imageForPostFromState(state, post.id);
  const imageUrl = finalImagePublicUrl(image);
  if (!imageUrl) {
    throw new Error("Instagram requires PUBLIC_APP_BASE_URL with a public HTTPS image URL before live publishing.");
  }
  const caption = composePublishText(post, "instagram");
  if (!caption) throw new Error("Instagram caption is missing.");
  const createForm = new URLSearchParams({ access_token: accessToken, image_url: imageUrl, caption });
  const container = await graphJson(graphUrl(`/${igUserId}/media`), { method: "POST", form: createForm });
  if (!container.id) throw new Error("Instagram media container was not created.");
  const publishForm = new URLSearchParams({ access_token: accessToken, creation_id: container.id });
  const published = await graphJson(graphUrl(`/${igUserId}/media_publish`), { method: "POST", form: publishForm });
  const externalPostId = published.id || "";
  return {
    externalPostId,
    externalPostUrl: externalPostId ? `https://www.instagram.com/p/${externalPostId}/` : "",
    message: "Published to Instagram."
  };
}

async function publishThreadsPost({ state, post }) {
  const accessToken = storedOrEnvAccessToken(state, "threads");
  const threadsUserId = accountIdForPublishing(state, "threads");
  const image = imageForPostFromState(state, post.id);
  const text = composePublishText(post, "threads") || composePublishText(post, post.platform);
  if (!text) throw new Error("Threads post text is missing.");
  const imageUrl = finalImagePublicUrl(image);
  const createForm = new URLSearchParams({
    access_token: accessToken,
    media_type: imageUrl ? "IMAGE" : "TEXT",
    text
  });
  if (imageUrl) createForm.set("image_url", imageUrl);
  const container = await graphJson(threadsGraphUrl(`/${threadsUserId}/threads`), { method: "POST", form: createForm });
  if (!container.id) throw new Error("Threads media container was not created.");
  const publishForm = new URLSearchParams({ access_token: accessToken, creation_id: container.id });
  const published = await graphJson(threadsGraphUrl(`/${threadsUserId}/threads_publish`), { method: "POST", form: publishForm });
  const externalPostId = published.id || "";
  return {
    externalPostId,
    externalPostUrl: externalPostId ? `https://www.threads.net/t/${externalPostId}` : "",
    message: imageUrl ? "Published to Threads with image." : "Published to Threads as text-only post."
  };
}

async function xJson(url, { method = "GET", accessToken, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.errors?.[0] || payload.detail || payload.title || payload.error || {};
    throw new Error(error.detail || error.message || payload.detail || payload.title || "X API request failed.");
  }
  return payload;
}

async function uploadXImage({ accessToken, image }) {
  if (!image?.imageUrl) return "";
  const imageBuffer = await imageBufferFromUrl(image.imageUrl);
  const payload = await xJson("https://api.x.com/2/media/upload", {
    method: "POST",
    accessToken,
    body: {
      media: imageBuffer.toString("base64"),
      media_category: "tweet_image",
      media_type: "image/png"
    }
  });
  return payload.data?.id || payload.data?.media_id_string || "";
}

async function publishXPost({ state, post }) {
  const accessToken = storedOrEnvAccessToken(state, "x");
  const image = imageForPostFromState(state, post.id);
  const text = channelPublishText(post, "x");
  if (!text) throw new Error("X / Twitter post text is missing.");
  if (text.length > 280) throw new Error("X / Twitter post text is over 280 characters.");
  const mediaId = await uploadXImage({ accessToken, image });
  const body = {
    text,
    ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
  };
  const payload = await xJson("https://api.x.com/2/tweets", { method: "POST", accessToken, body });
  const externalPostId = payload.data?.id || "";
  return {
    externalPostId,
    externalPostUrl: externalPostId ? `https://x.com/i/web/status/${externalPostId}` : "",
    message: mediaId ? "Published to X / Twitter with image." : "Published to X / Twitter as text-only post."
  };
}

async function publishToChannel({ state, post, channel }) {
  if (channel === "linkedin") return publishLinkedInPost({ state, post });
  if (channel === "facebook") return publishFacebookPost({ state, post });
  if (channel === "instagram") return publishInstagramPost({ state, post });
  if (channel === "threads") return publishThreadsPost({ state, post });
  if (channel === "x") return publishXPost({ state, post });
  throw new Error(`${channelLabels[channel] || channel} publishing is not implemented.`);
}

async function schedulePostForPublishing(postId, { scheduledFor, targetChannels, timezone }) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const channels = (Array.isArray(targetChannels) ? targetChannels : [targetChannels]).filter(Boolean);
  if (!scheduledFor) throw new Error("Choose a scheduled time.");
  if (!channels.length) throw new Error("Choose at least one target channel.");
  const candidate = {
    ...post,
    status: "scheduled",
    scheduledFor,
    targetChannels: channels,
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
  };
  const readiness = publishReadiness(state, candidate);
  const status = readiness.ok
    ? "scheduled"
    : readiness.status === "blocked_channel_not_connected"
      ? "blocked_channel_not_connected"
      : "approved";
  const patch = {
    status,
    scheduledFor: readiness.ok ? scheduledFor : "",
    targetChannels: channels,
    timezone: candidate.timezone,
	    publishingStatus: readiness.status,
	    publishErrorSummary: readiness.ok ? "" : readiness.message,
	    lastPublishAttemptAt: "",
	    channelReadiness: readiness.channelReadiness || {},
	    channelDryRuns: readiness.channelReadiness || {}
	  };
  let nextState = await store.updatePost(postId, patch);
  nextState = await recordPublishEvent({
    post,
    channel: channels.join(","),
    eventType: status === "scheduled" ? "scheduled" : "blocked",
    statusBefore: post.status,
    statusAfter: status,
    message: readiness.ok ? "Post scheduled." : readiness.message,
    errorCode: readiness.ok ? "" : readiness.status
  });
  return { state: nextState, readiness: { ...readiness, status }, message: readiness.ok ? "Post scheduled." : readiness.message };
}

async function runPublishingWorker() {
  let state = await store.readState();
  const duePosts = state.posts.filter((post) => post.status === "scheduled" && scheduledDateIsDue(post.scheduledFor));
  const results = [];
  for (const post of duePosts) {
    const readiness = publishReadiness(state, post);
    const targetChannels = Array.isArray(post.targetChannels) && post.targetChannels.length ? post.targetChannels : [post.platform];
    const attemptCount = Number(post.publishAttemptCount || 0) + 1;
    if (!readiness.ok) {
      const blockedStatus = readiness.status === "blocked_channel_not_connected" ? "blocked_channel_not_connected" : "failed";
      state = await store.updatePost(post.id, {
        status: blockedStatus,
        publishingStatus: readiness.status,
        publishAttemptCount: attemptCount,
        lastPublishAttemptAt: new Date().toISOString(),
        publishErrorSummary: readiness.message
      });
      state = await recordPublishEvent({
        post,
        channel: targetChannels.join(","),
        eventType: "blocked",
        statusBefore: post.status,
        statusAfter: blockedStatus,
        message: readiness.message,
        errorCode: readiness.status
      });
      results.push({ postId: post.id, title: post.title, status: blockedStatus, message: readiness.message });
      continue;
    }
    const liveBlockedChannel = targetChannels.find((channel) => !livePostingEnabledForChannel(channel));
    if (liveBlockedChannel) {
      const message = `${channelLabels[liveBlockedChannel] || liveBlockedChannel} live posting is disabled. Enable ${livePostingEnvKeys[liveBlockedChannel]?.join(" or ") || "the live posting flag"} only after dry runs pass.`;
      state = await store.updatePost(post.id, {
        status: "failed",
        publishingStatus: "failed",
        publishAttemptCount: attemptCount,
        lastPublishAttemptAt: new Date().toISOString(),
        publishErrorSummary: message
      });
      state = await recordPublishEvent({
        post,
        channel: targetChannels.join(","),
        eventType: "blocked",
        statusBefore: post.status,
        statusAfter: "failed",
        message,
        errorCode: "live_gate_disabled"
      });
      results.push({ postId: post.id, title: post.title, status: "failed", message });
      continue;
    }
    state = await store.updatePost(post.id, {
      status: "publishing",
      publishingStatus: "publishing",
      publishAttemptCount: attemptCount,
      lastPublishAttemptAt: new Date().toISOString(),
      publishErrorSummary: ""
    });
    state = await recordPublishEvent({
      post,
      channel: targetChannels.join(","),
      eventType: "publishing_started",
      statusBefore: post.status,
      statusAfter: "publishing",
      message: "Publishing worker started. Live adapter check follows."
    });
	    const canLivePublish = targetChannels.length === 1 && livePostingEnabledForChannel(targetChannels[0]);
    if (canLivePublish) {
      const channel = targetChannels[0];
      try {
        const publishResult = await publishToChannel({ state, post, channel });
        state = await store.updatePost(post.id, {
          status: "posted",
          publishingStatus: "ready",
          publishErrorSummary: "",
          publishedAt: new Date().toISOString(),
          publishedUrl: publishResult.externalPostUrl,
          externalPostUrl: publishResult.externalPostUrl,
          externalPostId: publishResult.externalPostId,
          lastPublishAttemptAt: new Date().toISOString()
        });
        state = await recordPublishEvent({
          post: { ...post, status: "publishing" },
          channel,
          eventType: "published",
          statusBefore: "publishing",
          statusAfter: "posted",
          message: publishResult.message,
          errorCode: ""
        });
        results.push({ postId: post.id, title: post.title, status: "posted", message: publishResult.message });
        continue;
      } catch (error) {
        const message = safeSocialError(channel, error);
        state = await store.updatePost(post.id, {
          status: "failed",
          publishingStatus: "failed",
          publishErrorSummary: message,
          lastPublishAttemptAt: new Date().toISOString()
        });
        state = await recordPublishEvent({
          post: { ...post, status: "publishing" },
          channel,
          eventType: "publish_failed",
          statusBefore: "publishing",
          statusAfter: "failed",
          message,
          errorCode: `${channel}_publish_failed`
        });
        results.push({ postId: post.id, title: post.title, status: "failed", message });
        continue;
      }
    }
	    const message = targetChannels.length === 1 && !livePostingEnabledForChannel(targetChannels[0])
	      ? `${channelLabels[targetChannels[0]] || targetChannels[0]} live posting is disabled. Enable ${livePostingEnvKeys[targetChannels[0]]?.join(" or ") || "the live posting flag"} only after dry runs pass.`
	      : `Publishing adapter not implemented for ${targetChannels.map((channel) => channelLabels[channel] || channel).join(", ")} yet.`;
    state = await store.updatePost(post.id, {
      status: "failed",
      publishingStatus: "failed",
      publishErrorSummary: message,
      lastPublishAttemptAt: new Date().toISOString()
    });
    state = await recordPublishEvent({
      post: { ...post, status: "publishing" },
      channel: targetChannels.join(","),
      eventType: "publish_failed",
      statusBefore: "publishing",
      statusAfter: "failed",
      message,
      errorCode: "publisher_not_enabled"
    });
    results.push({ postId: post.id, title: post.title, status: "failed", message });
  }
  return { state, results, message: `${results.length} due post${results.length === 1 ? "" : "s"} processed.` };
}

async function publishPostNow(postId) {
  let state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const targetChannels = (Array.isArray(post.targetChannels) && post.targetChannels.length ? post.targetChannels : [post.platform]).filter(Boolean);
  if (!targetChannels.length) throw new Error("Choose a target channel before publishing.");
  if (targetChannels.length !== 1) throw new Error("Publish Now supports one live channel at a time.");
  const channel = targetChannels[0];
  if (!livePostingEnabledForChannel(channel)) {
    throw new Error(`${channelLabels[channel] || channel} live posting is disabled. Set ${(livePostingEnvKeys[channel] || []).join(" or ")}=true server-side after connecting.`);
  }
  const candidate = {
    ...post,
    targetChannels: [channel],
    scheduledFor: new Date().toISOString()
  };
  const readiness = publishReadiness(state, candidate);
  if (!readiness.ok) throw new Error(readiness.message);
  const attemptCount = Number(post.publishAttemptCount || 0) + 1;
  state = await store.updatePost(post.id, {
    status: "publishing",
    publishingStatus: "publishing",
    targetChannels: [channel],
    publishAttemptCount: attemptCount,
    lastPublishAttemptAt: new Date().toISOString(),
    publishErrorSummary: ""
  });
  state = await recordPublishEvent({
    post,
    channel,
    eventType: "publishing_started",
    statusBefore: post.status,
    statusAfter: "publishing",
    message: `Publish Now started for ${channelLabels[channel] || channel}.`
  });
  try {
    const publishResult = await publishToChannel({ state, post: { ...post, targetChannels: [channel] }, channel });
    state = await store.updatePost(post.id, {
      status: "posted",
      publishingStatus: "ready",
      publishErrorSummary: "",
      publishedAt: new Date().toISOString(),
      postedAt: new Date().toISOString(),
      publishedUrl: publishResult.externalPostUrl,
      externalPostUrl: publishResult.externalPostUrl,
      externalPostId: publishResult.externalPostId,
      lastPublishAttemptAt: new Date().toISOString()
    });
    state = await recordPublishEvent({
      post: { ...post, status: "publishing" },
      channel,
      eventType: "published",
      statusBefore: "publishing",
      statusAfter: "posted",
      message: publishResult.message,
      errorCode: ""
    });
    return { state, result: publishResult, message: publishResult.message };
  } catch (error) {
    const message = safeSocialError(channel, error);
    state = await store.updatePost(post.id, {
      status: "failed",
      publishingStatus: "failed",
      publishErrorSummary: message,
      lastPublishAttemptAt: new Date().toISOString()
    });
    state = await recordPublishEvent({
      post: { ...post, status: "publishing" },
      channel,
      eventType: "publish_failed",
      statusBefore: "publishing",
      statusAfter: "failed",
      message,
      errorCode: `${channel}_publish_failed`
    });
    throw new Error(message);
  }
}

async function runLinkedInDryTest() {
  let state = await store.readState();
  const account = safeChannelsResponse(state).find((channel) => channel.channel === "linkedin") || {};
  const posts = state.posts.filter((post) => {
    const targets = Array.isArray(post.targetChannels) && post.targetChannels.length ? post.targetChannels : [post.platform];
    return targets.includes("linkedin") && ["approved", "scheduled", "retry_ready", "needs_review", "draft"].includes(post.status);
  });
  const testPost =
    posts.find((post) => post.imageFinalized && post.finalPreviewConfirmed && imageForPostFromState(state, post.id)?.generationStatus === "generated") ||
    posts[0];
  const image = testPost ? imageForPostFromState(state, testPost.id) : null;
  const dryRun = testPost
    ? channelDryRun(testPost, image, "linkedin", account)
    : {
        channel: "linkedin",
        displayName: "LinkedIn",
        status: "blocked",
        message: "No LinkedIn-targeted post is available for dry testing.",
        connected: Boolean(account.connected),
        configured: Boolean(account.configured),
        finalImageReady: false,
        livePostingEnabled: livePostingEnabledForChannel("linkedin")
      };
  const checklist = {
    oauthCredentialsPresent: Boolean(account.configured),
    tokenEncryptionPresent: Boolean(process.env.OAUTH_TOKEN_ENCRYPTION_KEY),
    redirectUriConfigured: !(account.missingEnvVars || []).includes("LINKEDIN_REDIRECT_URI"),
    connectionExists: Boolean(account.connected),
    targetSelected: Boolean(account.accountName || account.accountId),
    dryRunEndpointWorks: true,
    finalPngExists: Boolean(dryRun.finalImageReady),
    liveGateDisabled: !livePostingEnabledForChannel("linkedin"),
    postPayloadShape: Boolean(testPost && channelPublishText(testPost, "linkedin"))
  };
  const passed = Object.values(checklist).every(Boolean) && dryRun.status !== "blocked";
  state = await store.updateSocialAccount("linkedin", {
    lastTestStatus: passed ? "dry_run_passed" : "dry_run_blocked",
    lastTestMessage: dryRun.message,
    lastTestedAt: new Date().toISOString(),
    oauthConfigured: Boolean(account.configured)
  });
  return {
    state,
    dryRun,
    checklist,
    message: passed ? "LinkedIn dry test passed. Live posting remains disabled." : `LinkedIn dry test blocked: ${dryRun.message}`
  };
}

function oauthSigningSecret(platform) {
  if (platform === "linkedin") return process.env.LINKEDIN_CLIENT_SECRET || "";
  if (platform === "facebook" || platform === "instagram" || platform === "threads") return process.env.META_CLIENT_SECRET || process.env.THREADS_CLIENT_SECRET || "";
  if (platform === "x") return process.env.X_CLIENT_SECRET || "";
  return "";
}

function signOAuthState(platform) {
  const payload = {
    platform,
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now()
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", oauthSigningSecret(platform)).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyOAuthState(platform, state) {
  if (!state || !state.includes(".")) return { ok: false, error: "OAuth state is missing or invalid." };
  const [encoded, signature] = state.split(".");
  const expected = crypto.createHmac("sha256", oauthSigningSecret(platform)).update(encoded).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok: false, error: "OAuth state could not be verified." };
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.platform !== platform) return { ok: false, error: "OAuth state channel mismatch." };
    if (Date.now() - Number(payload.issuedAt || 0) > 10 * 60 * 1000) {
      return { ok: false, error: "OAuth state expired. Start the connection again." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "OAuth state could not be read." };
  }
}

function tokenEncryptionKey() {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY || "";
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptToken(value) {
  if (!value) return "";
  const key = tokenEncryptionKey();
  if (!key) throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY is required before storing OAuth tokens.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptToken(value) {
  if (!value) return "";
  const key = tokenEncryptionKey();
  if (!key) throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY is required before using stored OAuth tokens.");
  const [version, iv, tag, encrypted] = String(value).split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Stored OAuth token could not be read.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function storedOrEnvAccessToken(state = {}, platform = "") {
  const account = (state.socialAccounts || []).find((item) => item.platform === platform) || {};
  if (account.accessTokenEncrypted) return decryptToken(account.accessTokenEncrypted);
  const envToken = accountEnvAccessToken(platform);
  if (envToken) return envToken;
  throw new Error(`${channelLabels[platform] || platform} access token is missing.`);
}

function accountIdForPublishing(state = {}, platform = "") {
  const account = (state.socialAccounts || []).find((item) => item.platform === platform) || {};
  const id = account.externalAccountId || account.accountId || accountEnvId(platform);
  if (!id && platform !== "x") throw new Error(`${channelLabels[platform] || platform} account id is missing.`);
  return id;
}

function safeSocialError(platform, error) {
  const label = channelLabels[platform] || platform || "Social channel";
  const message = String(error?.message || error || `${label} publishing failed.`);
  if (/token|secret|authorization|bearer|client|access_token/i.test(message)) {
    return `${label} publishing failed during secure API authorization.`;
  }
  return message.slice(0, 180);
}

function safeLinkedInError(error) {
  const message = String(error?.message || error || "LinkedIn connection failed.");
  if (/token|secret|authorization|bearer|client/i.test(message)) {
    return "LinkedIn connection failed during secure OAuth exchange.";
  }
  return message.slice(0, 160);
}

const statusLabels = {
  idea: "Idea",
  draft: "Draft",
  needs_review: "Needs Review",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  posted: "Posted",
  manually_posted: "Manually Posted",
  failed: "Failed",
  blocked_channel_not_connected: "Channel not connected",
  retry_ready: "Retry ready",
  rejected: "Rejected"
};

const contentBuckets = [
  "Implementation Layer",
  "Human Cost",
  "Workforce Argument",
  "AI Operator Lane",
  "Second Chance Culture",
  "Trust & Guidance",
  "Community Infrastructure"
];

const visualBuckets = [
  "Quote card",
  "Explainer carousel",
  "Wilma answer / explainer graphic",
  "People-centered editorial graphic",
  "Data / stat graphic",
  "Mixed-media issue graphic",
  "Product / interface support graphic",
  "Short video concept board"
];

const wilmaImageWorkflowStates = [
  "Needs Image",
  "Image Prompt Ready",
  "Image Generated",
  "Needs Overlay Edit",
  "Overlay Confirmed",
  "Needs Final PNG",
  "Ready for Manual Posting",
  "Manually Posted"
];

const wilmaExpressions = [
  "Helpful",
  "Empathetic",
  "Confident",
  "Explaining",
  "Myth-checking",
  "Celebratory",
  "Serious but warm",
  "Curious",
  "Reassuring",
  "Determined"
];

const wilmaVisualBuckets = [
  "Ask Wilma",
  "Wilma Translation",
  "Wilma Myth Check",
  "LegalEase POV",
  "The Implementation Layer",
  "Record Clearance & Work"
];

const repurposeFormats = [
  { id: "shorter_punchier", label: "Shorter punchier version" },
  { id: "wilma_translation", label: "Wilma translation version" },
  { id: "myth_check", label: "Myth check version" },
  { id: "founder_pov", label: "Founder POV version" },
  { id: "carousel_outline", label: "Carousel outline version" },
  { id: "linkedin_version", label: "LinkedIn version" },
  { id: "instagram_version", label: "Instagram version" },
  { id: "x_version", label: "X/Twitter version" }
];

const sourceTypes = [
  "Manual Idea",
  "News/Article",
  "Partner Update",
  "LegalEase Update",
  "Wilma Education",
  "Performance Insight",
  "Repurpose Input"
];

const sourceStatuses = ["New", "Reviewed", "Queued", "Ignored"];

const wilmaBrandSafeRules = [
  "No courtroom panic imagery",
  "No jail bars over people's faces",
  "No handcuffs as the main emotional hook",
  "No mugshot-style humiliation",
  "No fake legal guarantees",
  "No judge/lawyer impersonation",
  "No real customer likenesses unless explicitly provided and approved",
  "No children in criminal-record contexts",
  "No exaggerated AI robot lawyer imagery",
  "No fear-based visuals"
];

const wilmaOverlayRules = [
  "Keep overlay short",
  "Max 8 words preferred",
  "No specific legal advice",
  "No outcome guarantees",
  "No eligibility promises",
  "Must be readable on mobile",
  "Must support the caption instead of repeating the full caption"
];

const wilmaExpressionPoseMap = {
  Helpful: "wilma-pose-22",
  Empathetic: "wilma-pose-23",
  Confident: "wilma-pose-14",
  Explaining: "wilma-pose-18",
  "Myth-checking": "wilma-pose-12",
  Celebratory: "wilma-pose-13",
  "Serious but warm": "wilma-pose-02",
  Curious: "wilma-pose-15",
  Reassuring: "wilma-pose-07",
  Determined: "wilma-pose-17"
};

const finalExportPlatformFormats = [
  { id: "instagram-square", label: "Instagram Square", platform: "instagram", width: 1080, height: 1080 },
  { id: "instagram-portrait", label: "Instagram Portrait", platform: "instagram", width: 1080, height: 1350 },
  { id: "linkedin-square", label: "LinkedIn Square", platform: "linkedin", width: 1200, height: 1200 },
  { id: "linkedin-landscape", label: "LinkedIn Landscape", platform: "linkedin", width: 1200, height: 627 },
  { id: "x-twitter-landscape", label: "X/Twitter Landscape", platform: "x", width: 1600, height: 900 }
];

const narrativeInfrastructurePreset = {
  visualStyleId: "techno_afrofuturist_concept",
  displayName: "Techno Afro-Futurist Concept",
	  recommendedAspectRatios: {
	    linkedin: "1:1",
	    x: "1:1",
	    facebook: "1:1",
	    instagram: "1:1",
	    threads: "4:5",
	  },
  tokens: {
    legalBlue: designSystem.colors.legalBlue,
    horizonOrange: designSystem.colors.horizonOrange,
    skylineBlue: designSystem.colors.skylineBlue,
    paperWhite: designSystem.colors.paperWhite || "#F7F3EA",
    civicBlack: designSystem.colors.civicBlack || "#111111",
    infrastructureGray: designSystem.colors.infrastructureGray || "#D8D3C8"
  }
};

const imageVariants = {
  legalease_institutional: {
    id: "legalease_institutional",
    label: "LegalEase Institutional",
    description: "Institutional report-cover poster for LegalEase POV, implementation, workforce, policy, courts, and civic infrastructure."
  },
  wilma_guide: {
    id: "wilma_guide",
    label: "Wilma Guide",
    description: "Plain-English guide poster using canonical Wilma only when the approved reference asset is available."
  },
  human_stakes: {
    id: "human_stakes",
    label: "Human Stakes",
    description: "Dignified editorial human-stakes poster for work, family, housing, mobility, and community content."
  },
  process_map: {
    id: "process_map",
    label: "Process Map",
    description: "Editorial process-map poster for steps, workflow, clinic mode, intake, and implementation systems."
  }
};

const audienceLabels = {
  consumers: "Individuals with records",
  families: "Families and community",
  nonprofits: "Nonprofits and clinics",
  government: "Government and public agencies",
  workforce: "Employers and workforce",
  funders: "Funders and partners"
};

const speakerLabels = {
  legalease: "LegalEase",
  wilma: "Wilma",
  both: "Both"
};

const qualityLabels = {
  strong: "Strong",
  needs_rewrite: "Needs rewrite",
  rejected: "Rejected"
};

const initialState = {
  posts: [
    {
      id: "post-001",
      title: "The bill that almost clipped the runway",
      platform: "linkedin",
      status: "needs_review",
      contentType: "founder_story",
      speaker: "legalease",
      audience: "funders",
      contentFormat: "LegalEase POV",
      campaign: "Justice Tech Infrastructure",
      scheduledFor: "2026-05-07T09:00",
      hook: "A bill can kill a startup before the market ever gets a vote.",
      body:
        "LegalEase exists because people should not need a lobbyist, a cousin at the courthouse, and three spare afternoons to understand their second chance options. When policy threatens access, founders have to explain the stakes in plain English.",
      cta: "Build the tools before the gatekeepers decide who gets help.",
      hashtags: ["#JusticeTech", "#LegalTech"],
      complianceRisk: "medium",
      riskFlags: ["policy", "specific actor"],
      qualityLabel: "strong",
      complianceNotes: "Avoid naming individuals unless factual record is verified.",
      engagementRate: 4.8,
      createdAt: "2026-05-06T12:00:00.000Z"
    },
    {
      id: "post-002",
      title: "Expungement should not feel like decoding a tax form",
	      platform: "instagram",
      status: "approved",
      contentType: "expungement_education",
      speaker: "wilma",
      audience: "consumers",
      contentFormat: "Wilma translation",
      campaign: "Second Chance Access",
      scheduledFor: "2026-05-08T12:30",
      hook: "The paperwork is the punishment nobody talks about.",
      body:
        "A person can serve their time, rebuild their life, and still get blocked by records they barely know how to fix. That is not public safety. That is bad product design wearing a courthouse badge.",
      cta: "Make second chances legible.",
	      hashtags: ["#LegalEase", "#SecondChances", "#RecordClearance"],
      complianceRisk: "low",
      riskFlags: ["education"],
      qualityLabel: "strong",
      complianceNotes: "Educational framing only; no legal advice.",
      engagementRate: 6.2,
      createdAt: "2026-05-06T12:10:00.000Z"
    },
    {
      id: "post-003",
      title: "Investor note: justice has infrastructure gaps",
      platform: "x",
      status: "scheduled",
      contentType: "investor_insight",
      speaker: "legalease",
      audience: "funders",
      contentFormat: "AI for Access",
      campaign: "Fundraising Narrative",
      scheduledFor: "2026-05-09T16:00",
      hook: "The legal system has a UX problem. That means it has a market problem.",
      body:
        "The opportunity is not another document template. It is workflow, eligibility, education, intake, and routing for people the system keeps making start from zero.",
      cta: "Justice tech is infrastructure.",
      hashtags: [],
      complianceRisk: "low",
      riskFlags: ["institutional"],
      qualityLabel: "strong",
      complianceNotes: "No performance claims.",
      engagementRate: 3.4,
      createdAt: "2026-05-06T12:20:00.000Z"
    }
  ],
  library: [
    {
      id: "lib-001",
      category: "hook",
      title: "Policy tension hook",
      body: "A law can sound neutral on paper and still crush the person with the least room to maneuver.",
      status: "approved"
    },
    {
      id: "lib-002",
      category: "cta",
      title: "Movement CTA",
      body: "Make second chances easier to find, understand, and act on.",
      status: "approved"
    },
    {
      id: "lib-003",
      category: "guardrail",
      title: "No legal advice",
      body: "Do not promise eligibility, outcomes, record clearing, or agency action. Use educational language.",
      status: "restricted"
    },
    {
      id: "lib-101",
      category: "visual_reference",
      title: "Narrative Infrastructure / Implementation Layer",
      body: "The front door is broken. Approved design-language reference: assets/brand/examples/narrative-infrastructure-implementation-layer.png. Use its editorial poster energy, oversized type, square-frame crop language, route lines, checkpoint labels, paper texture, Legal Blue dominance, and Horizon Orange signal path. Do not copy the person, race, gender, headline, or exact layout.",
      status: "approved"
    },
    {
      id: "lib-102",
      category: "visual_reference",
      title: "Narrative Infrastructure / Human Cost",
      body: "A record can outlast the sentence. Editorial human crop with system barriers and status labels around the person. Dignified, not pity-driven.",
      status: "approved"
    },
    {
      id: "lib-103",
      category: "visual_reference",
      title: "Narrative Infrastructure / Workforce Argument",
      body: "Record clearance is a workforce issue. Stat poster with hiring pathway, background-check checkpoint, economic mobility line, and one clean takeaway.",
      status: "approved"
    },
    {
      id: "lib-104",
      category: "visual_reference",
      title: "Narrative Infrastructure / Trust & Guidance",
      body: "Wilma translation: paperwork should not require a secret decoder ring. Wilma in a framed guide window connected to a plain-English definition panel.",
      status: "approved"
    },
    {
      id: "lib-105",
      category: "visual_reference",
      title: "Narrative Infrastructure / Community Infrastructure",
      body: "Second chances need infrastructure. Neighborhood systems collage showing clinic, intake, screening, and follow-up as connected service nodes.",
      status: "approved"
    }
  ],
  socialAccounts: platforms.map((platform) => ({
    id: `channel-${platform}`,
    platform,
    displayName: channelLabels[platform],
    accountType: platform === "facebook" ? "page" : "profile",
    status: "not_connected",
    scopes: channelSetup(platform).scopes,
    externalAccountId: "",
    connectedAt: "",
    lastTestedAt: "",
    lastTestStatus: "",
    lastTestMessage: channelSetupMessage(platform),
    oauthConfigured: channelSetup(platform).configured
  })),
  settings: {
    brandVoice:
      "LegalEase is the institution. Wilma is the guide. LegalEase earns trust; Wilma creates closeness.",
    wilmaVoice:
      "Warm and clear with light personality. Plain-English guide for record clearance. Helpful, grounded, direct, occasionally witty. Never a lawyer, chatbot, motivational speaker, or cartoon mascot.",
    dailyTarget: 3,
    approvalMode: "review_everything",
    bannedPhrases: ["game changer", "unlock your potential", "revolutionary platform", "seamless", "pivotal", "crucial"],
    sourceFeeds: [
      {
        id: "feed-wilma-activity",
        name: "Wilma activity patterns",
        sourceType: "wilma_activity",
        topic: "Common questions about whether old records disappear automatically",
        cadence: "daily",
        active: true,
        trustLevel: "high_authenticity"
      },
      {
        id: "feed-internal-notes",
        name: "Founder/internal notes",
        sourceType: "manual_note",
        topic: "Operational lesson about making record-clearance access easier to understand",
        cadence: "daily",
        active: true,
        trustLevel: "highest_authenticity"
      },
      {
        id: "feed-workforce",
        name: "Workforce argument",
        sourceType: "research_data",
        topic: "Record clearance belongs in workforce conversations because old records can block hiring and mobility",
        cadence: "weekly",
        active: true,
        trustLevel: "authority"
      }
    ],
    sourceItems: [
      {
        id: "source-001",
        title: "Common question: do old records disappear automatically?",
        sourceType: "Wilma Education",
        sourceUrl: "",
        note: "Repeated consumer confusion about whether an old record disappears on its own.",
        audience: "consumers",
        status: "New",
        createdAt: "2026-05-12T09:00:00.000Z"
      },
      {
        id: "source-002",
        title: "Implementation is the missing layer after policy change",
        sourceType: "LegalEase Update",
        sourceUrl: "",
        note: "Founder POV about why access work must include plain-English implementation.",
        audience: "funders",
        status: "New",
        createdAt: "2026-05-12T09:05:00.000Z"
      }
    ],
    dailyAutomation: {
      target: 3,
      mix: ["wilma_consumer_education", "legalease_institutional_pov", "flexible_source_based"]
    },
    localAssets: [
      {
        id: "local-wilma-pose-01",
        type: "wilma_pose",
        label: "Wilma pose 1 local test asset",
        filePath: "data/assets/wilma-poses/wilma-pose-01.png",
        downloadUrl: "/data/assets/wilma-poses/wilma-pose-01.png",
        createdAt: "2026-05-13T00:00:00.000Z",
        notes: "Local test Wilma pose asset for final PNG composition.",
        active: true,
        fileSize: 0
      },
      {
        id: "local-brand-mark-white",
        type: "brand_mark",
        label: "LegalEase white mark",
        filePath: "data/assets/brand/legalease-mark-white.png",
        downloadUrl: "/data/assets/brand/legalease-mark-white.png",
        createdAt: "2026-05-13T00:00:00.000Z",
        notes: "Local brand watermark asset for final PNG composition.",
        active: true,
        fileSize: 0
      }
    ],
    wilmaPoseMappings: defaultWilmaPoseMappings()
  },
  brandAssets: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "LegalEase primary logo",
      slug: "legalease-primary-logo",
      assetType: "logo",
      fileUrl: "assets/brand/logos/legalease-logo-2025-ob.png",
      mimeType: "image/png",
      fileSize: 0,
      width: 1200,
      height: 400,
      approved: true,
      isDefault: true,
      tags: ["logo", "primary", "brand"],
      version: 1
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Wilma canonical reference",
      slug: "wilma-canonical-reference",
      assetType: "wilma_reference",
      fileUrl: "assets/brand/wilma/new-wilma-2025.png",
      mimeType: "image/png",
      fileSize: 0,
      width: 1200,
      height: 1200,
      approved: true,
      isDefault: true,
      tags: ["wilma", "canonical", "3d", "headset"],
      version: 1
    },
    {
      id: "24242424-2424-4242-8242-242424242424",
      name: "Wilma character sheet",
      slug: "wilma-character-sheet-2026-05-11",
      assetType: "wilma_reference",
      fileUrl: "assets/brand/wilma/wilma-character-sheet-2026-05-11.png",
      mimeType: "image/png",
      fileSize: 0,
      width: 1491,
      height: 1055,
      approved: true,
      isDefault: false,
      tags: ["wilma", "character-sheet", "approved", "poses", "expressions", "color-palette"],
      version: 1
    },
    {
      id: "25252525-2525-4252-8252-252525252525",
      name: "Wilma expanded expression sheet",
      slug: "wilma-character-sheet-expanded-2026-05-11",
      assetType: "wilma_reference",
      fileUrl: "assets/brand/wilma/wilma-character-sheet-expanded-2026-05-11.png",
      mimeType: "image/png",
      fileSize: 0,
      width: 1491,
      height: 1055,
      approved: true,
      isDefault: false,
      tags: ["wilma", "character-sheet", "approved", "expanded-poses", "expressions", "color-palette"],
      version: 1
    },
    ...wilmaPoseAssetsFromDisk(),
    {
      id: "23232323-2323-4232-8232-232323232323",
      name: "LegalEase white icon mark",
      slug: "legalease-white-icon-mark",
      assetType: "icon",
      fileUrl: "assets/brand/logos/legalease-mark-white.png",
      mimeType: "image/png",
      fileSize: 0,
      width: 1920,
      height: 1080,
      approved: true,
      isDefault: false,
      tags: ["logo", "icon", "white", "mark"],
      version: 1
    },
    {
      id: "24242424-2424-4242-8242-242424242424",
      name: "LegalEase brand one-pager",
      slug: "legalease-brand-one-pager",
      assetType: "brand_bible",
      fileUrl: "assets/brand/docs/legalease-brand-one-pager-guidelines-final-v1.pdf",
      mimeType: "application/pdf",
      fileSize: 0,
      width: 0,
      height: 0,
      approved: true,
      isDefault: false,
      tags: ["brand", "guidelines", "one-pager"],
      version: 1
    },
    {
      id: "25252525-2525-4252-8252-252525252525",
      name: "LegalEase brand application guidelines",
      slug: "legalease-brand-application-guidelines",
      assetType: "brand_bible",
      fileUrl: "assets/brand/docs/brand-application-guidelines.pdf",
      mimeType: "application/pdf",
      fileSize: 0,
      width: 0,
      height: 0,
      approved: true,
      isDefault: false,
      tags: ["brand", "application", "guidelines"],
      version: 1
    },
    {
      id: "26262626-2626-4262-8262-262626262626",
      name: "Narrative Infrastructure implementation example",
      slug: "narrative-infrastructure-implementation-example",
      assetType: "example_output",
      fileUrl: "assets/brand/examples/narrative-infrastructure-implementation-layer.png",
      mimeType: "image/png",
      fileSize: 0,
      width: 1122,
      height: 1402,
      approved: true,
      isDefault: true,
      tags: ["example", "narrative-infrastructure", "implementation-layer", "editorial-poster", "style-reference"],
      version: 1
    }
  ],
  brandRules: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      ruleGroup: "global_brand",
      name: "LegalEase global visual system",
      ruleJson: {
        summary:
          "LegalEase visual style is the Techno Afro-Futurist Concept system: semi-abstract modern techno imagery with Afro-futurist inspiration, luminous pathways, human dignity, cultural geometry, data constellations, square/portal frames, deep Legal Blue atmosphere, and Horizon Orange signal energy. Do not render logos, Wilma, or readable text in generated raster art."
      },
      active: true,
      version: 1
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      ruleGroup: "wilma",
      name: "Wilma controlled character rules",
      ruleJson: {
        mustKeep: ["stylized 3D look", "orange irises", "oversized headset", "dark navy suit", "orange tie and cuffs"],
        forbidden: ["photoreal Wilma", "anime Wilma", "flat cartoon Wilma", "removing headset", "changing eye color"]
      },
      active: true,
      version: 1
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      ruleGroup: "banned_styles",
      name: "Banned visual styles",
      ruleJson: {
        banned: [
          "generic flat vector people",
          "Canva-style infographic cards",
          "smiling stock-photo people with color overlays",
          "isometric tech platform scenes",
          "random AI dashboards",
          "glowing tech nodes",
          "generic legal icons",
          "scales of justice",
          "gavels",
          "courthouse silhouettes",
          "jail bars",
          "handcuffs",
          "generic robots",
          "giant logo badges",
          "headline at top plus illustration in middle plus logo bottom right",
          "tokenized diversity collage",
          "stereotype shorthand for race, gender, class, or legal status",
          "pity imagery",
          "implying a person shown has a criminal record without approved context",
          "low-end template look"
        ]
      },
      active: true,
      version: 1
    },
    {
      id: "12121212-1212-4121-8121-121212121212",
      ruleGroup: "voice_routing",
      name: "LegalEase and Wilma voice routing",
      ruleJson: {
        summary: "LegalEase is the institution for systems, policy, workforce, AI, funders, and partners. Wilma is the plain-English guide for consumers, FAQs, myths, process explainers, Facebook, Instagram, and Threads. Use both for complex topics.",
        legalease: ["institutional", "systems-aware", "partner-safe", "plain-English", "operationally grounded"],
        wilma: ["warm", "direct", "helpful", "slightly witty", "no legal advice", "no outcome promises"]
      },
      active: true,
      version: 1
    },
    {
      id: "13131313-1313-4131-8131-131313131313",
      ruleGroup: "compliance",
      name: "Wilma compliance gate",
      ruleJson: {
        hardRule: "Consumer-facing eligibility, paperwork, process, record-clearance, or expungement posts must pass the Wilma compliance gate before scoring.",
        forbidden: ["you are eligible", "you qualify", "we will clear your record", "erase your past", "wipe your record clean", "guaranteed expungement", "instant approval", "you do not need a lawyer", "this will get you a job", "the court will approve this"],
        approvedLanguage: ["may have options", "rules vary by state and case", "what options may be available", "general information, not legal advice", "a court makes the final decision"]
      },
      active: true,
      version: 1
    },
    {
      id: "14141414-1414-4141-8141-141414141414",
      ruleGroup: "content_scoring",
      name: "LegalEase content scoring",
      ruleJson: {
        dimensions: ["relevance", "human reality", "point of view", "trust and compliance", "anti-slop quality", "platform fit"],
        labels: { strong: "8.5-10", needs_rewrite: "7-8.4", rejected: "below 7" },
        hardRule: "Show simple labels only: Strong, Needs rewrite, Rejected."
      },
      active: true,
      version: 1
    }
  ],
  generationProfiles: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      profileName: "quote_card_profile",
      visualBucket: "Quote card",
      defaultAspectRatio: "1:1",
      usesLogo: true,
      usesWilma: false,
      promptTemplate: "Create a Techno Afro-Futurist Concept image: semi-abstract, modern, luminous, symbolic, with negative space for app-rendered text. Use route-light geometry, blank panels, and future-facing civic signal energy.",
      negativeRules: "No generic quote-card template, no tiny text, no fake court outcomes, no cliché legal props, no giant logo badge, no centered Canva layout.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111", "26262626-2626-4262-8262-262626262626"],
      platformOverrides: { x: { aspectRatio: "16:9" }, linkedin: { aspectRatio: "1:1" } },
      active: true
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      profileName: "wilma_answer_profile",
      visualBucket: "Wilma answer / explainer graphic",
      defaultAspectRatio: "1:1",
      usesLogo: true,
      usesWilma: true,
      promptTemplate: "Create a Techno Afro-Futurist Concept Wilma Guide background. Do not draw Wilma. Leave a calm guide-panel zone for app-composited canonical Wilma. Use luminous routes, blank guide panels, and calm signal geometry.",
      negativeRules: "No generic assistant character, no photoreal Wilma, no anime style, no flat cartoon style, do not remove headset or change orange irises, no giant Wilma dominating the whole composition.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      platformOverrides: { threads: { aspectRatio: "4:5" }, linkedin: { aspectRatio: "1:1" } },
      active: true
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      profileName: "mixed_media_issue_profile",
      visualBucket: "Mixed-media issue graphic",
      defaultAspectRatio: "1:1",
      usesLogo: true,
      usesWilma: false,
      promptTemplate: "Create a Techno Afro-Futurist Concept image about systems, access, and practical next steps. Combine abstract human dignity, route-light logic, blank document planes, data constellations, and square/portal frame structures.",
      negativeRules: "No generic flat vector people, no exaggerated criminal imagery, no mugshots, no offensive stereotypes, no fake legal promises, no nonprofit infographic look.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111", "26262626-2626-4262-8262-262626262626"],
      platformOverrides: { x: { aspectRatio: "16:9" } },
      active: true
    },
    {
      id: "89898989-8989-4898-8898-898989898989",
      profileName: "explainer_carousel_profile",
      visualBucket: "Explainer carousel",
      defaultAspectRatio: "4:5",
      usesLogo: true,
      usesWilma: false,
      promptTemplate: "Create a Techno Afro-Futurist Concept carousel cover background with one clear visual metaphor, blank overlay zones, luminous path logic, square/portal modules, and futuristic civic clarity.",
      negativeRules: "No dense copy, no tiny slide text, no fake filing instructions, no guaranteed outcomes, no generic process-arrow infographic.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111", "26262626-2626-4262-8262-262626262626"],
      platformOverrides: { linkedin: { aspectRatio: "1:1" }, facebook: { aspectRatio: "4:5" } },
      active: true
    },
    {
      id: "8a8a8a8a-8a8a-48a8-88a8-8a8a8a8a8a8a",
      profileName: "people_centered_editorial_profile",
      visualBucket: "People-centered editorial graphic",
      defaultAspectRatio: "1:1",
      usesLogo: true,
      usesWilma: false,
      promptTemplate: "Create a respectful Techno Afro-Futurist Concept human-stakes image: dignified portrait energy or grounded human detail with abstract luminous barriers, protective frames, future-memory atmosphere, and no testimonial implication.",
      negativeRules: "No mugshots, jail bars, handcuffs, shame imagery, fake before/after story, smiling stock-photo overlay, or exploitative criminal justice visuals.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111"],
      platformOverrides: { threads: { aspectRatio: "4:5" }, facebook: { aspectRatio: "4:5" } },
      active: true
    },
    {
      id: "8b8b8b8b-8b8b-48b8-88b8-8b8b8b8b8b8b",
      profileName: "data_stat_profile",
      visualBucket: "Data / stat graphic",
      defaultAspectRatio: "1:1",
      usesLogo: true,
      usesWilma: false,
      promptTemplate: "Create a Techno Afro-Futurist Concept data/mobility image with abstract chart fragments, orbital nodes, luminous trajectory lines, blank data panels, and workforce/economic mobility cues without readable numbers.",
      negativeRules: "No unsourced statistics, no cluttered dashboards, no decorative chart junk, no job or housing outcome promises, no generic business infographic.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111"],
      platformOverrides: { x: { aspectRatio: "16:9" }, linkedin: { aspectRatio: "1:1" } },
      active: true
    },
    {
      id: "8c8c8c8c-8c8c-48c8-88c8-8c8c8c8c8c8c",
      profileName: "product_interface_support_profile",
      visualBucket: "Product / interface support graphic",
      defaultAspectRatio: "1:1",
      usesLogo: true,
      usesWilma: false,
      promptTemplate: "Create a Techno Afro-Futurist Concept product-systems image with humane automation cues, blank interface planes, routing grids, signal processing, and document-like translucent layers.",
      negativeRules: "No generic AI robot imagery, no futuristic blue holograms, no fake user data, no legal outcome claims, no random SaaS dashboard.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111"],
      platformOverrides: { linkedin: { aspectRatio: "1:1" }, x: { aspectRatio: "16:9" } },
      active: true
    },
    {
      id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
      profileName: "short_video_concept_board_profile",
      visualBucket: "Short video concept board",
      defaultAspectRatio: "9:16",
      usesLogo: true,
      usesWilma: true,
      promptTemplate: "Create a Techno Afro-Futurist Concept short-video opening frame: one strong abstract visual metaphor, luminous motion cues, blank panels, signal paths, and no readable generated text.",
      negativeRules: "No cluttered storyboard, no unreadable captions, no sensational criminal imagery, no guaranteed outcomes, no generic vertical-template look.",
      defaultAssetIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      platformOverrides: { threads: { aspectRatio: "9:16" }, facebook: { aspectRatio: "9:16" } },
      active: true
    }
  ],
  assetBundles: [
    {
      id: "99999999-9999-4999-8999-999999999999",
      name: "Global brand default",
      bundleType: "global_brand",
      assetIds: ["11111111-1111-4111-8111-111111111111"],
      ruleIds: ["33333333-3333-4333-8333-333333333333", "55555555-5555-4555-8555-555555555555"],
      active: true
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Wilma default",
      bundleType: "wilma_default",
      assetIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        ...wilmaPoseAssetsFromDisk().map((asset) => asset.id),
        "24242424-2424-4242-8242-242424242424",
        "25252525-2525-4252-8252-252525252525"
      ],
      ruleIds: [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
        "55555555-5555-4555-8555-555555555555"
      ],
      active: true
    }
  ],
  milestones: [
    {
      id: "milestone-signed-pilots",
      title: "Signed pilots",
      target: 3,
      current: 1,
      unit: "pilots",
      status: "needs_attention",
      owner: "Roger",
      nextAction: "Move two warm partners from proposal to signed pilot.",
      dueDate: "2026-08-01",
      relatedPartners: ["partner-reentry-coalition"],
      relatedCampaigns: ["campaign-recordshield-community"],
      relatedPilots: ["pilot-reentry-coalition"],
      notes: "Investor story needs 2-3 signed pilots with usage reporting."
    },
    {
      id: "milestone-recordshield-users",
      title: "RecordShield users",
      target: 1000,
      current: 142,
      unit: "users",
      status: "at_risk",
      owner: "Growth",
      nextAction: "Launch partner campaigns with tracked RecordShield starts.",
      dueDate: "2026-11-01",
      relatedPartners: ["partner-reentry-coalition"],
      relatedCampaigns: ["campaign-recordshield-community"],
      relatedPilots: ["pilot-reentry-coalition"],
      notes: "Manual funnel inputs are acceptable until event tracking is wired."
    },
    {
      id: "milestone-partner-campaigns",
      title: "Active partner campaigns",
      target: 10,
      current: 2,
      unit: "campaigns",
      status: "needs_attention",
      owner: "Partnerships",
      nextAction: "Generate campaign kits for the next three committed partners.",
      dueDate: "2026-09-15",
      relatedPartners: ["partner-reentry-coalition"],
      relatedCampaigns: ["campaign-recordshield-community"],
      relatedPilots: [],
      notes: "Campaign kit export should make launch repeatable."
    },
    {
      id: "milestone-proof-point",
      title: "Public institutional proof point",
      target: 1,
      current: 0,
      unit: "proof point",
      status: "needs_attention",
      owner: "Roger",
      nextAction: "Request testimonial language after first pilot midpoint report.",
      dueDate: "2026-10-15",
      relatedPartners: ["partner-reentry-coalition"],
      relatedCampaigns: [],
      relatedPilots: ["pilot-reentry-coalition"],
      notes: "Could be testimonial, case study, public partner mention, or approved report excerpt."
    },
    {
      id: "milestone-conversion-tracking",
      title: "RecordShield-to-Expungement.ai conversion tracking",
      target: 1,
      current: 0,
      unit: "live tracking",
      status: "at_risk",
      owner: "Product",
      nextAction: "Define manual event fields and tracking slug convention.",
      dueDate: "2026-07-15",
      relatedPartners: [],
      relatedCampaigns: ["campaign-recordshield-community"],
      relatedPilots: [],
      notes: "Dashboard supports manual funnel snapshots now."
    },
    {
      id: "milestone-compliance-memo",
      title: "Compliance memo",
      target: "approved",
      current: "draft",
      unit: "memo",
      status: "needs_attention",
      owner: "Compliance",
      nextAction: "Route non-UPL posture memo for attorney review.",
      dueDate: "2026-07-01",
      relatedPartners: [],
      relatedCampaigns: [],
      relatedPilots: [],
      notes: "Needed for investor and acquisition conversations."
    },
    {
      id: "milestone-data-room",
      title: "Data room readiness",
      target: "investor-ready",
      current: "usable",
      unit: "status",
      status: "needs_attention",
      owner: "Operations",
      nextAction: "Add traction snapshot, compliance memo, and pilot proof artifacts.",
      dueDate: "2026-08-15",
      relatedPartners: [],
      relatedCampaigns: [],
      relatedPilots: [],
      notes: "Useable now; needs proof artifacts before external sharing."
    }
  ],
  partners: [
    {
      id: "partner-reentry-coalition",
      organizationName: "Second Chance Reentry Coalition",
      partnerType: "reentry",
      regionState: "PA",
      primaryContactName: "Program Director",
      email: "partner@example.org",
      phone: "",
      website: "",
      status: "proposal_sent",
      lastTouchDate: "2026-05-17",
      nextFollowUpDate: "2026-05-20",
      owner: "Roger",
      priority: "High",
      notes: "Warm pilot candidate for RecordShield intake and expungement education.",
      relatedCampaign: "campaign-recordshield-community",
      relatedPilot: "pilot-reentry-coalition",
      referralCount: 38,
      screenings: 24,
      recordShieldStarts: 17,
      expungementStarts: 4,
      revenue: 0
    }
  ],
  campaigns: [
    {
      id: "campaign-recordshield-community",
      campaignName: "RecordShield Community Launch",
      partnerId: "partner-reentry-coalition",
      campaignType: "reentry",
      stateRegion: "PA",
      status: "ready",
      landingPageUrl: "",
      trackingSlug: "rs-community-pa",
      sourceChannel: "partner",
      startDate: "2026-06-01",
      endDate: "2026-07-15",
      targetReferrals: 150,
      actualReferrals: 38,
      recordShieldStarts: 17,
      expungementStarts: 4,
      paidConversions: 0,
      notes: "Launch kit needed before partner announcement."
    }
  ],
  tasks: [
    {
      id: "task-followup-reentry-coalition",
      title: "Follow up on proposal",
      relatedObjectType: "partner",
      relatedObjectId: "partner-reentry-coalition",
      dueDate: "2026-05-20",
      owner: "Roger",
      priority: "High",
      status: "open",
      suggestedAction: "Ask whether the pilot scope is approved and confirm launch owner.",
      draftMessage: "Quick follow-up on the RecordShield pilot scope. Are we aligned to move into launch planning this week?"
    }
  ],
  pilots: [
    {
      id: "pilot-reentry-coalition",
      partnerId: "partner-reentry-coalition",
      pilotName: "RecordShield Reentry Pilot",
      objective: "Validate partner-led RecordShield starts and downstream expungement interest.",
      startDate: "2026-06-01",
      endDate: "2026-07-15",
      status: "scoped",
      targetUsers: 150,
      actualUsers: 17,
      successMetrics: "150 referrals, 75 RecordShield starts, 10 Expungement.ai intakes, partner testimonial.",
      internalOwner: "Roger",
      partnerOwner: "Program Director",
      weeklyReportingStatus: "not_started",
      risks: "Needs signed scope and campaign assets.",
      nextAction: "Send final pilot agreement and launch checklist.",
      publicProofStatus: "not_requested",
      checklist: {
        proposalSent: true,
        scopeApproved: false,
        agreementSigned: false,
        campaignAssetsApproved: false,
        landingPageLive: false,
        trackingActive: false,
        staffTrained: false,
        campaignLaunched: false,
        first25Users: false,
        midpointReport: false,
        finalReport: false,
        testimonialRequested: false,
        caseStudyDrafted: false,
        expansionConversationScheduled: false
      }
    }
  ],
  complianceItems: [
    {
      id: "compliance-non-upl-memo",
      itemTitle: "RecordShield non-UPL posture memo",
      itemType: "FAQ",
      riskLevel: "high",
      status: "attorney_review",
      relatedPartner: "",
      relatedCampaign: "",
      relatedPost: "",
      issueSummary: "Clarify educational guidance, no legal advice, no guaranteed outcomes.",
      requiredDisclaimer: "General information only. Rules vary by state and case. A court makes the final decision.",
      reviewer: "Attorney reviewer",
      reviewDate: "",
      notes: "Needed for investor data room."
    }
  ],
  dataRoomItems: [
    {
      id: "data-room-traction-snapshot",
      title: "Traction snapshot",
      section: "Traction",
      status: "draft",
      filePath: "",
      lastUpdated: "2026-05-18",
      owner: "Operations",
      notes: "Needs latest campaign and funnel metrics."
    },
    {
      id: "data-room-compliance-memo",
      title: "Compliance memo",
      section: "Compliance",
      status: "missing",
      filePath: "",
      lastUpdated: "",
      owner: "Compliance",
      notes: "Attach approved non-UPL memo."
    }
  ],
  funnelSnapshots: [
    {
      id: "funnel-rs-community-pa",
      partnerId: "partner-reentry-coalition",
      campaignId: "campaign-recordshield-community",
      state: "PA",
      source: "partner",
      dateRange: "2026-05",
      landingPageVisits: 210,
      recordShieldStarts: 17,
      recordShieldCompletions: 11,
      resultsViewed: 9,
      cleanupCtaClicked: 5,
      expungementIntakeStarted: 4,
      paymentStarted: 1,
      paymentCompleted: 0,
      packetGenerated: 0,
      packetCompleted: 0,
      petitionFiled: 0,
      outcomeKnown: 0,
      revenue: 0,
      usersNeedingFollowUp: 5
    }
  ],
  reports: [],
  campaignKits: [],
  activityEvents: [
    {
      id: "activity-growth-seeded",
      eventType: "Growth workspace created",
      title: "Six-month growth plan added",
      relatedObjectType: "milestone",
      relatedObjectId: "milestone-recordshield-users",
      createdAt: "2026-05-19T00:00:00.000Z"
    }
  ],
  postImages: []
};

const store = createStore(initialState);
let stateMutationQueue = Promise.resolve();

function serializeStateMutation(operation) {
  const next = stateMutationQueue.then(operation, operation);
  stateMutationQueue = next.catch(() => {});
  return next;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readBuffer(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseMultipartForm(buffer, contentType = "") {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Upload boundary missing.");
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const raw = buffer.toString("binary");
  const fields = {};
  const files = {};
  for (const part of raw.split(boundary)) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const trimmed = part.replace(/^\r\n/, "").replace(/\r\n--$/, "");
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const rawHeaders = trimmed.slice(0, headerEnd);
    const body = trimmed.slice(headerEnd + 4).replace(/\r\n$/, "");
    const disposition = rawHeaders.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    if (!disposition) continue;
    const name = disposition[1];
    const filename = disposition[2];
    const mimeType = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
    if (filename) {
      files[name] = {
        filename,
        mimeType,
        buffer: Buffer.from(body, "binary")
      };
    } else {
      fields[name] = Buffer.from(body, "binary").toString("utf8");
    }
  }
  return { fields, files };
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function serveAsset(pathname, response) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (cleanPath.includes("..")) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  const assetUrl = new URL(cleanPath, assetRoot);
  try {
    const body = await readFile(assetUrl);
    const extension = cleanPath.split(".").pop()?.toLowerCase();
    const mimeType = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      json: "application/json",
      txt: "text/plain"
    }[extension || ""] || "application/octet-stream";
    response.writeHead(200, { "content-type": mimeType, "cache-control": "public, max-age=3600" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function titleFromTopic(topic) {
  const clean = String(topic || "LegalEase content draft").replace(/[^\w\s'-]/g, "").trim();
  return clean.length > 64 ? `${clean.slice(0, 61)}...` : clean;
}

function routeContent(input, platform) {
  const topic = String(input.topic || "").toLowerCase();
  const tone = input.tone || "founder-led";
	  const platformIsConsumer = ["facebook", "instagram", "threads"].includes(platform);
  const isProcess = /eligib|expunge|clearance|paperwork|form|court|record|certified disposition|faq|myth|question|next step/i.test(topic);
  const isPolicy = /bill|law|policy|legislation|clean slate|court|prosecutor|government|agency|lawrence/i.test(topic);
  const isWorkforce = /job|workforce|employer|hiring|background check|labor|economic/i.test(topic);
  const isAi = /ai|automation|intake|screening|document|wilma|assistant|operator/i.test(topic);
  const isPartner = /clinic|nonprofit|partner|church|city|fresh start|community event|pilot/i.test(topic);
  const isHuman = /fear|shame|family|housing|second chance|barrier|blocked/i.test(topic);
  const complex = isProcess || isPolicy || isWorkforce || isAi || isPartner;

  let speaker = "legalease";
  if (platformIsConsumer || isProcess || tone === "educational") speaker = "wilma";
  if (platform === "linkedin" && (isPolicy || isWorkforce || isAi || isPartner)) speaker = "legalease";
  if ((isPolicy || isWorkforce || isAi) && platform === "threads" && !isProcess) speaker = "both";

  let audience = platformIsConsumer ? "consumers" : "funders";
  if (isPartner) audience = "nonprofits";
  if (isPolicy) audience = platform === "linkedin" ? "government" : audience;
  if (isWorkforce) audience = "workforce";
  if (isHuman && platformIsConsumer) audience = "families";

  let contentBucket = "Second Chance Culture";
  if (isPolicy) contentBucket = "Implementation Layer";
  if (isProcess) contentBucket = "Trust & Guidance";
  if (isWorkforce) contentBucket = "Workforce Argument";
  if (isAi) contentBucket = "AI Operator Lane";
  if (isPartner) contentBucket = "Community Infrastructure";
  if (isHuman && !isProcess) contentBucket = "Human Cost";

  let contentFormat = speaker === "wilma" ? "Ask Wilma" : "LegalEase POV";
  if (speaker === "both") contentFormat = "LegalEase + Wilma";
  if (isProcess && /myth|old|disappear/i.test(topic)) contentFormat = "Wilma myth check";
  if (isProcess && /certified disposition|term|mean|means|translate/i.test(topic)) contentFormat = "Wilma translation";
  if (isWorkforce) contentFormat = "Record Clearance & Work";
  if (isPolicy) contentFormat = speaker === "both" ? "LegalEase + Wilma" : "The Implementation Layer";
  if (isAi) contentFormat = "AI for Access";
  if (isPartner) contentFormat = "Partner Infrastructure";

  let visualBucket = speaker === "wilma" || speaker === "both" ? "Wilma answer / explainer graphic" : "Quote card";
  if (isPolicy || isAi) visualBucket = "Mixed-media issue graphic";
  if (isWorkforce) visualBucket = "Data / stat graphic";
  if (isPartner) visualBucket = "People-centered editorial graphic";
  if (speaker === "both" || (speaker === "wilma" && isProcess)) visualBucket = "Wilma answer / explainer graphic";

  let complianceRisk = "low";
  const riskFlags = [];
  if (isPolicy || isAi || isWorkforce || isPartner) {
    complianceRisk = "medium";
    riskFlags.push("institutional review");
  }
  if (isProcess || /eligib|qualif|file|court|state-specific|customer story|real person/i.test(topic)) {
    complianceRisk = "high";
    riskFlags.push("Wilma compliance gate");
  }
  if (isPolicy) riskFlags.push("partner-safe framing");
  if (isWorkforce) riskFlags.push("no job outcome promise");

  return { speaker, audience, contentBucket, contentFormat, visualBucket, complianceRisk, riskFlags };
}

function sourceRoutingFor(source = {}) {
  const raw = [
    source.title,
    source.note,
    source.sourceUrl,
    source.sourceType,
    source.audience
  ].filter(Boolean).join(" ");
  const text = raw.toLowerCase();
  const sourceType = source.sourceType || "Manual Idea";
  const process = /eligib|expunge|expungement|record clearance|criminal record|court|file|filing|paperwork|forms?|specific legal process|guidance|certified disposition|charge|conviction/i.test(text);
  const guarantee = /qualif|eligible|will clear|guarantee|approved|outcome/i.test(text);
  const realStory = /customer|client|real person|case story|testimonial|before and after/i.test(text);
  const mythQuestion = /myth|question|faq|what does|how do|explain|plain english|translate|disappear automatically/i.test(text);
  const workforce = /workforce|job|hiring|employer|background check|economic|mobility/i.test(text);
  const implementation = /implementation|system|infrastructure|policy|bill|law|access|operator|automation|intake/i.test(text);
  const partner = /partner|clinic|nonprofit|community|city|event|pilot/i.test(text) || sourceType === "Partner Update";
  const wilmaEducation = sourceType === "Wilma Education" || mythQuestion || process;

  let speaker = wilmaEducation ? "wilma" : "legalease";
  let contentBucket = "LegalEase POV";
  let platform = "linkedin";
  let audience = source.audience || "funders";
  let riskLevel = "Low";
  const riskFlags = [];

  if (implementation) contentBucket = "The Implementation Layer";
  if (workforce) {
    contentBucket = "Record Clearance & Work";
    audience = "workforce";
  }
  if (partner) {
    contentBucket = "Community Infrastructure";
    audience = "nonprofits";
  }
  if (wilmaEducation) {
    contentBucket = mythQuestion ? "Wilma Myth Check" : "Wilma Translation";
    platform = "facebook";
    audience = "consumers";
  }
  if (sourceType === "Performance Insight" || sourceType === "Repurpose Input") {
    contentBucket = "LegalEase POV";
    platform = "linkedin";
  }
  if (sourceType === "News/Article") {
    contentBucket = implementation ? "The Implementation Layer" : contentBucket;
    platform = "linkedin";
  }
  if (process || guarantee || realStory) {
    riskLevel = "High";
    riskFlags.push("Wilma compliance review");
  } else if (implementation || workforce || partner || sourceType === "News/Article") {
    riskLevel = "Medium";
    riskFlags.push("human review");
  }
  const wilmaComplianceRequired = riskLevel === "High" && (speaker === "wilma" || audience === "consumers" || process);
  return {
    speaker,
    audience,
    contentBucket,
    platform,
    riskLevel,
    complianceRisk: riskLevel.toLowerCase(),
    wilmaComplianceRequired,
    riskFlags
  };
}

function normalizedSourceItem(item = {}) {
  const createdAt = item.createdAt || new Date().toISOString();
  const source = {
    id: item.id || crypto.randomUUID(),
    title: item.title || item.topic || "Untitled source",
    sourceType: sourceTypes.includes(item.sourceType) ? item.sourceType : "Manual Idea",
    sourceUrl: item.sourceUrl || "",
    note: item.note || item.sourceSummary || item.topic || "",
    audience: item.audience || "",
    status: sourceStatuses.includes(item.status) ? item.status : "New",
    createdAt,
    queuedPostId: item.queuedPostId || "",
    ignoredAt: item.ignoredAt || "",
    reviewedAt: item.reviewedAt || "",
    updatedAt: item.updatedAt || createdAt
  };
  return { ...source, routing: sourceRoutingFor(source) };
}

function sourceItemsForState(state) {
  return (state.settings?.sourceItems || initialState.settings.sourceItems || []).map(normalizedSourceItem);
}

async function updateSourceItem(sourceId, patch = {}) {
  const state = await store.readState();
  const items = sourceItemsForState(state).map((item) =>
    item.id === sourceId ? normalizedSourceItem({ ...item, ...patch, updatedAt: new Date().toISOString() }) : item
  );
  const nextState = await store.updateSettings({ sourceItems: items });
  return { state: nextState, source: items.find((item) => item.id === sourceId) };
}

async function addSourceItem(input = {}) {
  const state = await store.readState();
  const source = normalizedSourceItem({
    id: crypto.randomUUID(),
    title: input.title || input.topic || "Untitled source",
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    note: input.note || input.sourceSummary || "",
    audience: input.audience,
    status: "New",
    createdAt: new Date().toISOString()
  });
  const items = [source, ...sourceItemsForState(state)];
  const nextState = await store.updateSettings({ sourceItems: items });
  return { state: nextState, source, message: "Source saved." };
}

async function ignoreSourceItem(sourceId) {
  const result = await updateSourceItem(sourceId, { status: "Ignored", ignoredAt: new Date().toISOString() });
  return { ...result, message: "Source ignored." };
}

async function reviewSourceItem(sourceId) {
  const state = await store.readState();
  const source = sourceItemsForState(state).find((item) => item.id === sourceId);
  if (!source) throw new Error("Source not found.");
  if (source.status === "Queued") throw new Error("Queued sources already have a draft.");
  const result = await updateSourceItem(sourceId, { status: "Reviewed", reviewedAt: new Date().toISOString(), ignoredAt: "" });
  return { ...result, message: "Source marked reviewed." };
}

async function restoreSourceItem(sourceId) {
  const state = await store.readState();
  const source = sourceItemsForState(state).find((item) => item.id === sourceId);
  if (!source) throw new Error("Source not found.");
  const status = source.queuedPostId ? "Queued" : "New";
  const result = await updateSourceItem(sourceId, { status, ignoredAt: "" });
  return { ...result, message: status === "Queued" ? "Source restored to queued." : "Source restored." };
}

async function createQueueDraftFromSource(sourceId) {
  const state = await store.readState();
  const source = sourceItemsForState(state).find((item) => item.id === sourceId);
  if (!source) throw new Error("Source not found.");
  if (source.status === "Ignored") throw new Error("Ignored sources must be restored before queuing.");
  const route = source.routing || sourceRoutingFor(source);
  const topic = source.title || source.note || "LegalEase source idea";
  const post = generateDraft({
    topic,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
    sourceSummary: source.note || source.title,
    platform: route.platform,
    tone: route.speaker === "wilma" ? "educational" : "founder-led",
    campaign: "Source-to-Queue",
    cta: "Make the next step easier to understand."
  }, route.platform);
  const patch = {
    ...post,
    sourceType: source.sourceType,
    sourceItemId: source.id,
    sourceTitle: source.title,
    sourceReference: `Created from source ${source.id}: ${source.title}`,
    speaker: route.speaker,
    audience: route.audience,
    contentBucket: route.contentBucket,
    platform: route.platform,
    targetChannels: [route.platform],
    complianceRisk: route.complianceRisk,
    riskFlags: route.riskFlags,
    complianceGate: {
      ...(post.complianceGate || {}),
      required: route.wilmaComplianceRequired,
      passed: !route.wilmaComplianceRequired,
      reason: route.wilmaComplianceRequired ? "High-risk consumer-facing source requires Wilma compliance review." : "No Wilma compliance review required by source routing."
    },
    complianceNotes: route.wilmaComplianceRequired
      ? "Source routing marked this as high risk. Review eligibility/process/customer-story language before use."
      : post.complianceNotes,
    status: "draft",
    copyReviewed: false,
    copyReviewedAt: "",
    imageWorkflowState: "Needs Image",
    wilmaImageWorkflow: null,
    imagePrompt: "",
    negativePrompt: "",
    overlayConfirmed: false,
    overlayConfirmedAt: "",
    imageFinalized: false,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: "",
    finalExportKit: null,
    finalPngReady: false,
    manualPostingKitReady: false,
    manualPostingKitReadyAt: "",
    manuallyPostedAt: "",
    postedAt: "",
    publishedAt: "",
    publishingStatus: "",
    publishErrorSummary: "",
    performance: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  delete patch.finalImageUrl;
  delete patch.finalImage;
  delete patch.finalPngUrl;
  await store.generatePosts([patch]);
  const afterPostState = await store.readState();
  const items = sourceItemsForState(afterPostState).map((item) =>
    item.id === source.id
      ? normalizedSourceItem({ ...item, status: "Queued", queuedPostId: patch.id, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      : item
  );
  const nextState = await store.updateSettings({ sourceItems: items });
  return { state: nextState, post: patch, source: items.find((item) => item.id === source.id), message: "Queue draft created from source." };
}

function sanitizeWilmaCopy(text) {
  return String(text || "")
    .replace(/\byou qualify\b/gi, "you may have options")
    .replace(/\byou are eligible\b/gi, "some records may be eligible")
    .replace(/\bwe will clear your record\b/gi, "LegalEase can help you understand what options may be available")
    .replace(/\bclear your record today\b/gi, "check what record-clearance options may be available")
    .replace(/\berase your past\b/gi, "understand what options may be available")
    .replace(/\bwipe your record clean\b/gi, "understand what options may be available")
    .replace(/\bguaranteed expungement\b/gi, "record-clearance options")
    .replace(/\bthe court will approve\b/gi, "a court makes the final decision")
    .replace(/\byou do not need a lawyer\b/gi, "this is general information, not legal advice");
}

function evaluateDraft({ body, hook, platform, speaker, contentBucket, complianceRisk, riskFlags }) {
  const text = `${hook} ${body}`.toLowerCase();
  let score = 9.1;
  const dimensions = {
    relevance: 9,
    humanReality: 8.5,
    pointOfView: 8.5,
    trustCompliance: 9,
    antiSlop: 9,
    platformFit: 8.5
  };
  const notes = [];
  const slop = ["revolutionize", "unlock", "game changer", "pivotal", "crucial", "seamless", "cutting-edge"];
  for (const phrase of slop) {
    if (text.includes(phrase)) {
      score -= 0.5;
      dimensions.antiSlop -= 0.7;
      notes.push(`Removed/avoid AI-slop phrase: ${phrase}.`);
    }
  }
  if (!/record|clear|expunge|second chance|workforce|policy|access|legal|court|paperwork|community|ai|intake|screen/i.test(text)) {
    score -= 1;
    dimensions.relevance -= 1.2;
    notes.push("Needs a clearer LegalEase mission connection.");
  }
  if (!/people|person|family|job|housing|paperwork|record|community|clinic|work|fear|confusing|next step/i.test(text)) {
    score -= 0.7;
    dimensions.humanReality -= 1;
    notes.push("Needs more connection to real people or real barriers.");
  }
  if (complianceRisk === "high") {
    score -= 0.5;
    dimensions.trustCompliance -= 0.6;
    notes.push("High-risk topic requires human/legal review.");
  }
  if ((riskFlags || []).length > 2) {
    score -= 0.2;
    dimensions.trustCompliance -= 0.2;
  }
  if (/guarantee|you qualify|will clear|will approve|will get you|instant approval|record will disappear/i.test(text)) {
    score -= 2.5;
    dimensions.trustCompliance -= 3;
    notes.push("Unsafe legal/outcome promise detected.");
  }
  if (speaker === "wilma" && !/may|options|rules vary|general information|not legal advice|next step/i.test(text)) {
    score -= 0.8;
    dimensions.trustCompliance -= 1;
    notes.push("Wilma copy needs safer plain-English boundary language.");
  }
  if (platform === "linkedin" && speaker === "wilma" && contentBucket !== "Trust & Guidance") {
    score -= 0.3;
    dimensions.platformFit -= 0.4;
    notes.push("LinkedIn may need a more institutional LegalEase framing.");
  }
  score = Math.max(0, Math.min(10, Number(score.toFixed(1))));
  for (const key of Object.keys(dimensions)) {
    dimensions[key] = Math.max(0, Math.min(10, Number(dimensions[key].toFixed(1))));
  }
  const label = score >= 8.5 ? "strong" : score >= 7 ? "needs_rewrite" : "rejected";
  return {
    score,
    label,
    dimensions,
    notes,
    recommendation:
      label === "strong"
        ? "Strong enough for the approval queue."
        : label === "needs_rewrite"
          ? "Rewrite before approval."
          : "Reject or rebuild from the source."
  };
}

function scoreDraft(input) {
  return evaluateDraft(input).label;
}

function wilmaComplianceGate({ body, hook, speaker, contentBucket, platform }) {
  const text = `${hook} ${body}`.toLowerCase();
  const consumerFacing = speaker === "wilma" || ["facebook", "threads"].includes(platform) || contentBucket === "Trust & Guidance";
  const sensitive = /eligib|expunge|record|paperwork|court|file|clearance|qualif|disappear|lawyer|legal advice/i.test(text);
  const forbidden = [
    "you qualify",
    "you are eligible",
    "we will clear your record",
    "clear your record today",
    "erase your past",
    "wipe your record clean",
    "guaranteed expungement",
    "instant approval",
    "you do not need a lawyer",
    "the court will approve",
    "this will get you a job",
    "this will get you housing"
  ];
  const hits = forbidden.filter((phrase) => text.includes(phrase));
  return {
    required: Boolean(consumerFacing && sensitive),
    passed: hits.length === 0,
    hits,
    rewriteApplied: hits.length > 0,
    safeLanguage: [
      "may have options",
      "rules vary by state and case",
      "general information, not legal advice",
      "a court makes the final decision"
    ]
  };
}

function selectImageVariant(post, route = {}) {
  const contentBucket = route.contentBucket || post.contentBucket || "Trust & Guidance";
  const formatText = String(post.contentFormat || "").toLowerCase();
  const contentText = `${post.title || ""} ${post.hook || ""} ${post.body || ""} ${post.contentType || ""}`.toLowerCase();
  const isWilmaFormat = /ask wilma|wilma translation|wilma myth|myth check|plain-english|plain english/.test(formatText);
  const isProcess = /how it works|process|workflow|clinic|intake|screen|screening|steps|follow-up|follow up|source-to-queue|approval|implementation workflow/.test(
    `${formatText} ${contentText}`
  );
  const isHuman =
    contentBucket === "Human Cost" ||
    contentBucket === "Second Chance Culture" ||
    /family|housing|job application|kitchen table|front porch|dignity|mobility|human story|community/.test(contentText);

  if (route.usesWilma || post.speaker === "wilma" || isWilmaFormat) {
    return {
      ...imageVariants.wilma_guide,
      reason: "Selected because the speaker or format is Wilma-led/plain-English guidance."
    };
  }
  if (isProcess) {
    return {
      ...imageVariants.process_map,
      reason: "Selected because the post explains steps, workflow, clinics, intake, or implementation process."
    };
  }
  if (isHuman) {
    return {
      ...imageVariants.human_stakes,
      reason: "Selected because the post has a strong human stakes angle."
    };
  }
	  return {
	    ...imageVariants.legalease_institutional,
	    reason: "Default LegalEase institutional poster for systems, policy, workforce, civic infrastructure, or broad POV content."
	  };
}

function platformAdaptationsForPost({ hook, body, cta, hashtags = [], speaker }) {
  const plainBody = String(body || "").replace(/\s+/g, " ").trim();
  const shortHook = String(hook || "").trim();
  const tags = Array.isArray(hashtags) ? hashtags : [];
  const facebookBody = speaker === "wilma"
    ? `${shortHook}\n\n${plainBody.split(". ").slice(0, 2).join(". ")}.\n\n${cta || "Start by checking what options may be available."}`
    : `${shortHook}\n\n${plainBody.split(". ").slice(0, 3).join(". ")}.`;
  const instagramTags = [...new Set([...tags, "#LegalEase", "#SecondChances", "#RecordClearance"])].slice(0, 6);
  const xText = `${shortHook} ${cta || ""}`.replace(/\s+/g, " ").trim();
  return {
    linkedin: {
      channel: "linkedin",
      text: [shortHook, "", body, "", cta, "", tags.join(" ")].join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      format: "institutional_text_with_image"
    },
    x: {
      channel: "x",
      text: xText.length > 280 ? `${xText.slice(0, 276).trim()}...` : xText,
      format: xText.length > 240 ? "single_post_thread_candidate" : "single_post"
    },
    facebook: {
      channel: "facebook",
      text: facebookBody.replace(/\n{3,}/g, "\n\n").trim(),
      format: "community_page_post"
    },
    instagram: {
      channel: "instagram",
      text: [shortHook, "", cta || "Clear guidance should be easier to find.", "", instagramTags.join(" ")].join("\n").trim(),
      format: "square_image_caption",
      imageRequirement: "square_png"
    }
  };
}

function inferImageRoute(post, overrides = {}) {
  const contentBucket = overrides.contentBucket || post.contentBucket || "Trust & Guidance";
  const postText = `${post.title || ""} ${post.hook || ""} ${post.body || ""} ${post.contentType || ""}`.toLowerCase();
	  const inferredWilma =
	    ["facebook", "instagram", "threads"].includes(post.platform) &&
	    /wilma|expungement|paperwork|record|eligib|myth|question|plain/i.test(postText);
  const contentFormat = overrides.contentFormat || post.contentFormat || (inferredWilma ? "Wilma translation" : "LegalEase POV");
  const speaker = overrides.speaker || post.speaker || (inferredWilma ? "wilma" : "legalease");
  const riskFlags = overrides.riskFlags || post.riskFlags || [];
  const platform = overrides.platform || post.platform || "linkedin";
  const flagsText = riskFlags.join(" ").toLowerCase();
  const formatText = String(contentFormat).toLowerCase();
  const highImageRisk =
    post.complianceRisk === "high" ||
    /eligib|legal advice|real customer|specific legal process|court outcome|filing|customer story/i.test(flagsText);

  let visualBucket = post.visualBucket || "Quote card";
  let usesWilma = speaker === "wilma" || speaker === "both";
  let usesLogo = true;
  let assetBundleKey = usesWilma ? "wilma_default" : "global_brand";

  if (speaker === "wilma") {
    visualBucket = "Wilma answer / explainer graphic";
    usesWilma = true;
	    usesLogo = !["threads", "instagram"].includes(platform) || /ask wilma|translation|myth/i.test(formatText);
    assetBundleKey = "wilma_default";
  }

  if (speaker === "both") {
    visualBucket = "Wilma answer / explainer graphic";
    usesWilma = true;
    usesLogo = true;
    assetBundleKey = "wilma_default";
  }

  if (speaker === "legalease" && contentBucket === "Implementation Layer") {
    visualBucket = formatText.includes("product") ? "Product / interface support graphic" : "Mixed-media issue graphic";
    usesWilma = false;
    usesLogo = true;
    assetBundleKey = "global_brand";
  }

  if (contentBucket === "Human Cost") {
    visualBucket = "People-centered editorial graphic";
    usesWilma = speaker === "wilma";
    usesLogo = true;
    assetBundleKey = usesWilma ? "wilma_default" : "global_brand";
  }

  if (contentBucket === "Workforce Argument") {
    visualBucket = "Data / stat graphic";
    usesWilma = false;
    usesLogo = true;
    assetBundleKey = "global_brand";
  }

  if (contentBucket === "AI Operator Lane") {
    visualBucket = "Product / interface support graphic";
    usesWilma = false;
    usesLogo = true;
    assetBundleKey = "product_support";
  }

  if (contentBucket === "Community Infrastructure") {
    visualBucket = "People-centered editorial graphic";
    usesWilma = false;
    usesLogo = true;
    assetBundleKey = "global_brand";
  }

  if (formatText.includes("quote")) {
    visualBucket = "Quote card";
    usesWilma = speaker === "wilma";
    assetBundleKey = usesWilma ? "wilma_default" : "quote_card";
  }

  if (overrides.visualBucket) visualBucket = overrides.visualBucket;
  if (Object.prototype.hasOwnProperty.call(overrides, "usesWilma")) usesWilma = overrides.usesWilma;
  if (Object.prototype.hasOwnProperty.call(overrides, "usesLogo")) usesLogo = overrides.usesLogo;

  const imageRiskLevel = highImageRisk ? "high" : post.complianceRisk === "medium" ? "medium" : "low";
  const aspectRatio =
    overrides.aspectRatio ||
	    "1:1";
  const riskLanguage = highImageRisk
    ? "Use safe, general visual language. Do not imply guaranteed outcomes, court victory, before/after transformation, eligibility, or legal advice."
    : "Use clear, grounded visual language without overclaiming.";
  const imageBrief =
    overrides.imageBrief ||
    `${visualBucket} for ${platformLabels[platform] || platform}. Speaker: ${speakerLabels[speaker] || "LegalEase"}. Audience: ${audienceLabels[post.audience] || "general"}. ${riskLanguage}`;
  const variant = selectImageVariant(post, { contentBucket, visualBucket, usesWilma });

  return {
    stylePresetId: narrativeInfrastructurePreset.visualStyleId,
    stylePresetName: narrativeInfrastructurePreset.displayName,
    imageVariant: variant.id,
    imageVariantLabel: variant.label,
    imageVariantReason: variant.reason,
    visualBucket,
    usesWilma,
    usesLogo,
    imageRiskLevel,
    imageBrief,
    aspectRatio,
    assetBundleKey
  };
}

function generateDraft(input, platform) {
  const topic = input.topic || "People need clearer legal next steps.";
  const tone = input.tone || "founder-led";
  const campaign = input.campaign || "General Narrative";
  const cta = input.cta || "Make second chances easier to find, understand, and act on.";
  const sourceType = input.sourceType || "manual_note";
  const sourceUrl = input.sourceUrl || "";
  const sourceSummary = input.sourceSummary || topic;
  const route = routeContent(input, platform);
	  const hashtagMap = {
	    linkedin: ["#JusticeTech", "#LegalTech"],
	    facebook: ["#LegalEase"],
	    instagram: ["#LegalEase", "#SecondChances", "#RecordClearance"],
	    threads: ["#SecondChances"],
	    x: []
  };
  const hookByTone = {
    witty: "The system made the paperwork the plot twist.",
    educational: "Most people do not need a lecture. They need a next step.",
    "campaign-style": "Second chances should not depend on who can decode the system fastest.",
    contrarian: "The access problem is not motivation. It is infrastructure.",
    "founder-led": route.contentBucket === "Implementation Layer"
      ? "A bill can kill a startup before the market ever gets a vote."
      : "The legal system has a front-door problem."
  };
  const platformPacing = {
    linkedin:
      "That is the part founders have to say clearly. LegalEase is not building another glossy legal landing page. We are building practical infrastructure for people trying to understand their options, prepare better questions, and move without needing insider knowledge just to begin.",
	    facebook:
	      "For regular people, the hard part is rarely caring enough. It is knowing what to do next when every answer sounds like it was written for somebody with a courthouse map in their glove box.",
	    instagram:
	      "Plain-English guidance should be visual, readable, and easy to share. The image carries the point. The caption helps people understand the next step.",
	    threads:
	      "The paperwork is not neutral when it only works for people with time, money, and someone to translate it. Better access starts with making the next step plain.",
    x:
      "Legal access has a UX problem. That means it has an infrastructure problem. The next wave of justice tech will make eligibility, intake, education, and routing easier to act on."
  };
  const legalEaseBody = `${topic}\n\n${platformPacing[platform]}`;
  const wilmaBody =
    "Wilma translation:\n\nIf the process feels confusing, you are not the problem. The system was not built in plain English.\n\nLegalEase can help you understand what options may be available, what questions to ask, and what steps may come next.\n\nRules vary by state and case. This is general information, not legal advice.";
  const bothBody =
    `LegalEase POV:\n\n${topic}\n\nPolicy opens the door. Implementation helps people walk through it.\n\nWilma translation:\n\nA law can change and people may still need help understanding what changed for them. First step: check what options may be available.`;
	  const rawBody = route.speaker === "wilma" ? wilmaBody : route.speaker === "both" ? bothBody : legalEaseBody;
	  const body = route.speaker === "wilma" || route.speaker === "both" ? sanitizeWilmaCopy(rawBody) : rawBody;
	  const hook = hookByTone[tone] || hookByTone["founder-led"];
	  const hashtags = hashtagMap[platform] || [];
	  const channelAdaptations = platformAdaptationsForPost({
	    hook,
	    body,
	    cta,
	    hashtags,
	    speaker: route.speaker,
	    contentBucket: route.contentBucket
	  });
	  const complianceGate = wilmaComplianceGate({
    body,
    hook,
    speaker: route.speaker,
    contentBucket: route.contentBucket,
    platform
  });
  const scoring = evaluateDraft({
    body,
    hook,
    platform,
    speaker: route.speaker,
    contentBucket: route.contentBucket,
    complianceRisk: route.complianceRisk,
    riskFlags: route.riskFlags
  });
  const qualityLabel = scoring.label;

  return {
    id: crypto.randomUUID(),
    title: titleFromTopic(topic),
    platform,
    status: "draft",
    contentType: tone === "educational" ? "expungement_education" : tone === "witty" ? "humor" : "founder_story",
    speaker: route.speaker,
    audience: route.audience,
    contentBucket: route.contentBucket,
    contentFormat: route.contentFormat,
    visualBucket: route.visualBucket,
    sourceType,
    sourceUrl,
    sourceSummary,
    campaign,
    scheduledFor: "",
    hook,
	    body,
	    cta,
	    hashtags,
	    channelAdaptations,
	    channelReadiness: {},
	    channelDryRuns: {},
	    channelScheduledFor: {},
	    complianceRisk: route.complianceRisk,
    riskFlags: route.riskFlags,
    qualityLabel,
    contentScore: scoring.score,
    scoringDetails: scoring,
    complianceGate,
    complianceNotes:
      route.complianceRisk === "high"
        ? "Wilma compliance gate applied. Verify eligibility/process language. No legal advice, no promises, and court makes final decisions."
        : route.complianceRisk === "medium"
          ? "Review partner-safe framing, facts, names, institutions, and claims before approval."
          : "Educational framing. Does not promise eligibility, legal outcomes, or representation.",
    engagementRate: 0,
    createdAt: new Date().toISOString()
  };
}

function sourceAutomationInputs(state) {
  const feeds = (state.settings?.sourceFeeds || []).filter((feed) => feed.active !== false);
  const fallbackFeeds = initialState.settings.sourceFeeds || [];
  const pool = feeds.length ? feeds : fallbackFeeds;
  const target = Number(state.settings?.dailyAutomation?.target || state.settings?.dailyTarget || 3);
  const defaults = [
    {
      sourceType: "wilma_activity",
      topic: "A common Wilma question about whether old records disappear automatically",
      platform: "facebook",
      tone: "educational",
      sourceSummary: "Repeated consumer confusion about old records and visibility."
    },
    {
      sourceType: "manual_note",
      topic: "Policy opens the door, but implementation helps people walk through it",
      platform: "linkedin",
      tone: "founder-led",
      sourceSummary: "Founder POV about implementation as access infrastructure."
    },
    {
      sourceType: "research_data",
      topic: "Record clearance belongs in workforce conversations because old records can block hiring and mobility",
      platform: "linkedin",
      tone: "educational",
      sourceSummary: "Workforce/economic mobility angle for institutional audiences."
    }
  ];
  return Array.from({ length: target }, (_, index) => {
    const feed = pool[index % pool.length] || {};
    const preset = defaults[index % defaults.length];
    return {
      ...preset,
      sourceType: feed.sourceType || preset.sourceType,
      topic: feed.topic || preset.topic,
      sourceSummary: feed.sourceSummary || feed.topic || preset.sourceSummary,
      sourceUrl: feed.sourceUrl || "",
      campaign: feed.campaign || "Daily Narrative Queue",
      cta: feed.cta || "Make second chances easier to find, understand, and act on.",
      platform: feed.platform || preset.platform,
      tone: feed.tone || preset.tone,
      sourceFeedId: feed.id || `feed-${index + 1}`,
      sourceFeedName: feed.name || "Default source"
    };
  });
}

async function runSourceAutomation() {
  let state = await store.readState();
  const inputs = sourceAutomationInputs(state);
  const posts = inputs.map((input) => ({
    ...generateDraft(input, input.platform),
    sourceFeedId: input.sourceFeedId,
    sourceFeedName: input.sourceFeedName
  }));
  await store.generatePosts(posts);
  for (const post of posts) {
    const result = await generateImageForPost(post.id);
    state = result.state;
  }
  state = await store.updateSettings({
    lastSourceAutomationAt: new Date().toISOString(),
    lastSourceAutomationCount: posts.length
  });
  return {
    state,
    posts,
    message: `${posts.length} source-driven draft${posts.length === 1 ? "" : "s"} generated.`
  };
}

function starterPostFromInput(input, platform, targetChannels, imageVariantLabel) {
  const basePost = generateDraft(input, platform);
  const post = {
    ...basePost,
    title: input.title || basePost.title,
    hook: input.hook || basePost.hook,
    body: input.body || basePost.body,
    cta: input.cta || basePost.cta,
    hashtags: input.hashtags || basePost.hashtags,
    speaker: input.speaker || basePost.speaker,
    audience: input.audience || basePost.audience,
    contentBucket: input.contentBucket || basePost.contentBucket,
    contentFormat: input.contentFormat || basePost.contentFormat,
    complianceRisk: input.complianceRisk || basePost.complianceRisk,
    riskFlags: input.riskFlags || basePost.riskFlags,
    complianceNotes: input.complianceNotes || basePost.complianceNotes
  };
  const route = inferImageRoute(post, {
    visualBucket: input.visualBucket,
    contentFormat: post.contentFormat,
    speaker: post.speaker,
    aspectRatio: "1:1"
  });
  const channelAdaptations = platformAdaptationsForPost({
    hook: post.hook,
    body: post.body,
    cta: post.cta,
    hashtags: post.hashtags,
    speaker: post.speaker,
    contentBucket: post.contentBucket
  });
  return {
    ...post,
    status: "needs_review",
    targetChannels,
    channelAdaptations: {
      ...channelAdaptations,
      ...(input.channelAdaptations || {})
    },
    visualBucket: input.visualBucket || route.visualBucket,
    imageVariantLabel: imageVariantLabel || route.imageVariantLabel,
    imageVariantReason: "Selected by the Launch Setup daily 3-post starter workflow.",
    imageRiskLevel: route.imageRiskLevel,
    imageBrief: input.imageBrief || route.imageBrief,
    imagePrompt: input.imagePrompt || "",
    overlayKicker: input.overlayKicker || "",
    overlayHeadline: input.overlayHeadline || "",
    overlaySupport: input.overlaySupport || "",
    overlayMode: "text",
    aspectRatio: "1:1",
    assetBundleKey: route.assetBundleKey,
    approvalStatus: "not_approved",
    dryRunStatus: "not_run",
    imageStatus: "missing",
    copyReviewed: false,
    copyReviewedAt: "",
    overlayConfirmed: false,
    overlayConfirmedAt: "",
    manuallyPostedAt: "",
    manualPostedChannels: [],
    operatorNotes: "",
    imageFinalized: false,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: "",
    channelReadiness: {},
    channelDryRuns: {},
    channelScheduledFor: {},
    scheduledFor: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function starterImagePrompt({ variantLabel, contentBucket, visualBucket, hook, supportLine, overlayText, metadataLabel }) {
  return [
    `Create a square LegalEase image in the Techno Afro-Futurist Concept style.`,
    `Variant: ${variantLabel}. Content bucket: ${contentBucket}. Visual bucket: ${visualBucket}.`,
    "The image should feel semi-abstract, modern, techno, Afro-futurist-inspired, and conceptually tied to the post copy.",
    "Use luminous pathways, orbital nodes, blank data panels, threshold portals, square/portal geometry, cultural pattern language, deep navy atmosphere, pale blue glow, and Horizon Orange as signal energy.",
    "Color direction: deep Legal Blue atmosphere, Paper White or dark negative space, Skyline Blue glow, Horizon Orange signal/pathway accents, Infrastructure Gray for quiet support.",
    `Post idea: ${hook}`,
    `Support idea: ${supportLine}`,
    `Overlay text suggestion for the app compositor: ${overlayText}`,
    `Metadata label suggestion for the app compositor: ${metadataLabel}`,
    "Export recommendation: 1:1 square PNG for LinkedIn, Facebook, X / Twitter, and Instagram MVP.",
    "Do not render readable text, logos, wordmarks, fake metadata, numbers, captions, or pseudo-letters inside the generated image. Leave clean blank regions for the app to overlay exact text afterward.",
    "Banned motifs: fake LegalEase logos, fake Wilma, scales of justice, gavels, courthouse silhouettes, jail bars, handcuffs, mugshots, AI robots, generic flat vector people, Canva infographic cards, generic legal icons, generic startup gradients, and random UI dashboards."
  ].join("\n\n");
}

function validateFirstQueuePost(post) {
  const errors = [];
  const channels = post.targetChannels || [];
  if (!post.audience) errors.push(`${post.title}: missing audience`);
  if (!channels.length) errors.push(`${post.title}: missing channel selections`);
  if (!post.hook || !post.body) errors.push(`${post.title}: missing base post text`);
  for (const channel of channels) {
    if (!post.channelAdaptations?.[channel]?.text) errors.push(`${post.title}: missing ${platformLabels[channel] || channel} copy`);
  }
  if (!post.imageVariantLabel) errors.push(`${post.title}: missing image variant`);
  if (!post.imagePrompt) errors.push(`${post.title}: missing image prompt`);
  if (!post.complianceRisk) errors.push(`${post.title}: missing risk level`);
  if (post.status !== "needs_review") errors.push(`${post.title}: status must be needs_review`);
  if (post.approvalStatus !== "not_approved") errors.push(`${post.title}: approval status must be not_approved`);
  if (post.imageStatus !== "missing") errors.push(`${post.title}: final image status must start missing`);
  if (post.dryRunStatus !== "not_run") errors.push(`${post.title}: dry run status must start not_run`);
  return errors;
}

async function createTomorrowThreePostQueue() {
  const starterInputs = [
    {
      sourceType: "wilma_activity",
      platform: "instagram",
      tone: "educational",
      campaign: "Daily Wilma Explainer",
      title: "Wilma Explainer: Eligibility",
      topic: "What does it actually mean to be eligible for expungement?",
      hook: "Eligible does not always mean ready to file.",
      body: "Wilma translation: eligibility means the rules may allow a record to be cleared. It does not mean every step is finished or that a court has already approved anything.\n\nThe first step is understanding what is on your record, what your state allows, and what paperwork may come next.",
      cta: "Quick note: this is general information, not legal advice. Rules depend on your state and your case.",
      hashtags: ["#RecordClearance", "#Expungement", "#SecondChances", "#WilmaGuide"],
      sourceSummary: "Consumer-facing plain-English explainer about eligibility and process. Review for safe eligibility language.",
      visualBucket: "Wilma answer / explainer graphic",
      targetChannels: ["facebook", "instagram"],
      imageVariantLabel: "Wilma Guide",
      speaker: "wilma",
      audience: "consumers",
      contentBucket: "Trust & Guidance",
      contentFormat: "Ask Wilma",
      complianceRisk: "medium",
      riskFlags: ["Wilma compliance gate"],
      complianceNotes: "Wilma explainer. Review for eligibility/process language. No legal advice or promises.",
      overlayKicker: "WILMA GUIDE",
      overlayHeadline: "ELIGIBLE DOESN'T ALWAYS MEAN READY TO FILE",
      overlaySupport: "Eligibility starts the question. It does not promise the outcome.",
      imageBrief: "Wilma Guide Poster for a plain-English eligibility explainer. Use typography and WILMA GUIDE metadata if the canonical Wilma asset is unavailable.",
      imagePrompt: starterImagePrompt({
        variantLabel: "Wilma Guide Poster",
        contentBucket: "Trust & Guidance",
        visualBucket: "Wilma answer / explainer graphic",
        hook: "What does it actually mean to be eligible for expungement?",
        supportLine: "Eligibility means options may exist, not that filing is complete or approval is guaranteed.",
        overlayText: "ELIGIBLE DOESN'T ALWAYS MEAN READY TO FILE",
        metadataLabel: "WILMA GUIDE"
      }),
      channelAdaptations: {
        facebook: {
          channel: "facebook",
          format: "community_page_post",
          text: "Eligible does not always mean ready to file.\n\nWilma translation: eligibility means the rules may allow a record to be cleared. It does not mean every step is finished or that a court has already approved anything.\n\nFirst step: understand what is on your record, what your state allows, and what paperwork may come next.\n\nQuick note: this is general information, not legal advice. Rules depend on your state and your case."
        },
        instagram: {
          channel: "instagram",
          format: "square_image_caption",
          imageRequirement: "square_png",
          text: "Eligible does not always mean ready to file.\n\nWilma translation: eligibility can mean options may be available. It does not promise what a court will decide.\n\nStart with your record. Then check the rules.\n\n#RecordClearance #Expungement #SecondChances #WilmaGuide"
        }
      }
    },
    {
      sourceType: "manual_note",
      platform: "linkedin",
      tone: "founder-led",
      campaign: "LegalEase POV",
      title: "LegalEase POV: Implementation Gap",
      topic: "The real problem is not just record clearance law. It is implementation.",
      hook: "The real barrier is implementation.",
      body: "Record-clearance laws can open the door. But people still need to know what changed, whether it may apply to them, and what steps are available.\n\nThat is the next phase of access: turning policy into a path people can actually use.",
      sourceSummary: "Institutional POV for implementation and partnerships.",
      cta: "Policy opens the door. Implementation helps people walk through it.",
      visualBucket: "Mixed-media issue graphic",
      targetChannels: ["linkedin", "x"],
      imageVariantLabel: "LegalEase Institutional",
      speaker: "legalease",
      audience: "government",
      contentBucket: "Implementation Layer",
      contentFormat: "LegalEase POV",
      complianceRisk: "medium",
      riskFlags: ["partner-safe framing"],
      complianceNotes: "Institutional POV. Verify policy and implementation framing before approval.",
      overlayKicker: "IMPLEMENTATION LAYER",
      overlayHeadline: "THE IMPLEMENTATION GAP IS THE REAL BARRIER",
      overlaySupport: "Policy can change. People still need a clear path in.",
      imageBrief: "LegalEase Institutional Poster about the implementation gap after record-clearance laws.",
      imagePrompt: starterImagePrompt({
        variantLabel: "LegalEase Institutional Poster",
        contentBucket: "Implementation Layer",
        visualBucket: "Mixed-media issue graphic",
        hook: "The real problem is not just record clearance law. It is implementation.",
        supportLine: "Policy creates opportunity. Implementation turns it into access.",
        overlayText: "THE IMPLEMENTATION GAP IS THE REAL BARRIER",
        metadataLabel: "LEGAL EASE / SYSTEMS NOTE"
      }),
      channelAdaptations: {
        linkedin: {
          channel: "linkedin",
          format: "institutional_text_with_image",
          text: "The real barrier is implementation.\n\nRecord-clearance laws can open the door. But people still need to know what changed, whether it may apply to them, and what steps are available.\n\nThat is the next phase of access: turning policy into a path people can actually use.\n\nPolicy opens the door. Implementation helps people walk through it."
        },
        x: {
          channel: "x",
          format: "single_post",
          text: "Record-clearance laws can open the door. Implementation is what helps people walk through it: clear guidance, intake, paperwork, and follow-up people can actually use."
        }
      }
    },
    {
      sourceType: "partner_update",
      platform: "facebook",
      tone: "campaign-style",
      campaign: "Workforce and Community",
      title: "Workforce / Community: Job Conversation",
      topic: "A cleared record can change the job conversation before it ever starts.",
      hook: "A cleared record can change the job conversation before it ever starts.",
      body: "Old records can follow people into applications, interviews, background checks, and housing searches long after the sentence is over.\n\nRecord clearance does not promise a job. It can remove one barrier so people have a fairer shot at work, stability, and participation in local economies.",
      sourceSummary: "Warm workforce/community post. Avoid promises about employment or housing outcomes.",
      cta: "Second chances work better when the path is clear.",
      visualBucket: "People-centered editorial graphic",
      targetChannels: ["facebook", "instagram", "linkedin"],
      imageVariantLabel: "Human Stakes",
      speaker: "legalease",
      audience: "workforce",
      contentBucket: "Workforce Argument",
      contentFormat: "Record Clearance & Work",
      complianceRisk: "medium",
      riskFlags: ["no job outcome promise"],
      complianceNotes: "Workforce/community framing. Do not promise jobs, housing, or individual outcomes.",
      overlayKicker: "WORKFORCE / SECOND CHANCE",
      overlayHeadline: "A RECORD SHOULD NOT BLOCK A FUTURE",
      overlaySupport: "Record clearance can remove one barrier. It does not promise an outcome.",
      imageBrief: "Human Stakes Poster connecting record clearance to work, stability, and local economic participation without promising outcomes.",
      imagePrompt: starterImagePrompt({
        variantLabel: "Human Stakes Poster",
        contentBucket: "Workforce Argument",
        visualBucket: "People-centered editorial graphic",
        hook: "A cleared record can change the job conversation before it ever starts.",
        supportLine: "Record clearance can remove one barrier in the path to work and stability.",
        overlayText: "A RECORD SHOULD NOT BLOCK A FUTURE",
        metadataLabel: "WORKFORCE / SECOND CHANCE"
      }),
      channelAdaptations: {
        facebook: {
          channel: "facebook",
          format: "community_page_post",
          text: "A cleared record can change the job conversation before it ever starts.\n\nOld records can follow people into applications, interviews, background checks, and housing searches long after the sentence is over.\n\nRecord clearance does not promise a job. It can remove one barrier so people have a fairer shot at work, stability, and participation in local economies."
        },
        instagram: {
          channel: "instagram",
          format: "square_image_caption",
          imageRequirement: "square_png",
          text: "A record should not block a future.\n\nRecord clearance does not promise a job. It can remove one barrier so people have a fairer shot at work, stability, and local economic participation.\n\n#SecondChances #RecordClearance #Workforce #Community"
        },
        linkedin: {
          channel: "linkedin",
          format: "institutional_text_with_image",
          text: "A cleared record can change the job conversation before it ever starts.\n\nOld records can follow people into applications, interviews, background checks, and housing searches long after the sentence is over.\n\nRecord clearance does not promise employment. It can remove one barrier so people have a fairer shot at work, stability, and participation in local economies."
        }
      }
    }
  ];
  const posts = starterInputs.map((input) =>
    starterPostFromInput(input, input.platform, input.targetChannels, input.imageVariantLabel)
  );
  const validationErrors = posts.flatMap(validateFirstQueuePost);
  if (validationErrors.length) {
    throw new Error(`First queue validation failed: ${validationErrors.join("; ")}`);
  }
  await store.generatePosts(posts);
  const state = await store.updateSettings({
    firstQueueReviewPostIds: posts.map((post) => post.id),
    firstQueueCreatedAt: new Date().toISOString()
  });
  return {
    state,
    posts,
    message: "Tomorrow's 3-post queue is ready for review. Images are intentionally missing until you generate or upload them."
  };
}

function profileForPost(state, post) {
  const imageRoute = inferImageRoute(post);
  const visualBucket = imageRoute.visualBucket || post.visualBucket || (post.body.toLowerCase().includes("wilma") ? "Wilma answer / explainer graphic" : "Quote card");
  return (
    (state.generationProfiles || []).find((profile) => profile.active && profile.visualBucket === visualBucket) ||
    (state.generationProfiles || []).find((profile) => profile.active) ||
    initialState.generationProfiles[0]
  );
}

function assembleBrandContext(state, post, overrides = {}) {
  const imageRoute = inferImageRoute(post, overrides);
  const routedPost = { ...post, visualBucket: imageRoute.visualBucket };
  const profile = profileForPost(state, routedPost);
  const usesWilma = imageRoute.usesWilma ?? profile.usesWilma ?? false;
  const usesLogo = imageRoute.usesLogo ?? profile.usesLogo ?? true;
  const assets = state.brandAssets || [];
  const rules = state.brandRules || [];
  const approvedWilmaReferences = assets
    .filter((asset) => asset.approved && asset.assetType === "wilma_reference" && assetFileUrl(asset))
    .sort((a, b) => {
      const score = (asset) => {
        const tags = asset.tags || [];
        if (asset.isDefault || tags.includes("canonical")) return 100;
        if (tags.includes("front_view")) return 80;
        if (tags.includes("three_quarter_view")) return 75;
        if (tags.includes("pose-library")) return 60;
        if (tags.includes("character-sheet")) return 20;
        return 0;
      };
      return score(b) - score(a);
    });
  const wilmaReferenceAssets = usesWilma ? approvedWilmaReferences.slice(0, 3) : [];
  const logoReferenceAssets = usesLogo ? approvedLogoAssets(assets) : [];
  const primaryLogoAsset = logoReferenceAssets[0] || null;
  const selectedAssets = assets.filter((asset) => {
    if (!asset.approved) return false;
    if (usesWilma && asset.assetType === "wilma_reference") return true;
    if (usesLogo && primaryLogoAsset && asset.id === primaryLogoAsset.id) return true;
    return (profile.defaultAssetIds || []).includes(asset.id);
  });
  const selectedRules = rules.filter((rule) => {
    if (!rule.active) return false;
    if (["global_brand", "approved_styles", "banned_styles", "compliance"].includes(rule.ruleGroup)) return true;
    if (usesWilma && rule.ruleGroup === "wilma") return true;
    if (usesLogo && rule.ruleGroup === "logo_usage") return true;
    return false;
  });
  const platformOverride = profile.platformOverrides?.[post.platform] || {};
  const aspectRatio = overrides.aspectRatio || imageRoute.aspectRatio || platformOverride.aspectRatio || profile.defaultAspectRatio || "1:1";
  const contentBucket = overrides.contentBucket || post.contentBucket || "Trust & Guidance";
  const visualBucket = imageRoute.visualBucket || overrides.visualBucket || profile.visualBucket;
  const imageBrief = imageRoute.imageBrief || `${visualBucket} for ${platformLabels[post.platform] || post.platform}: ${post.hook}`;
  const promptBlocks = {
    global_brand:
      selectedRules.find((rule) => rule.ruleGroup === "global_brand")?.ruleJson?.summary ||
      "LegalEase Narrative Infrastructure visual system: editorial story plus operating-system diagram plus branded frame language.",
    content_block: `Speaker: ${speakerLabels[post.speaker] || "LegalEase"}. Audience: ${audienceLabels[post.audience] || "General"}. Format: ${post.contentFormat || "LegalEase POV"}. Content bucket: ${contentBucket}. Message: ${post.hook}. Tone: calm, credible, plain-English.`,
    visual_block: `Visual bucket: ${visualBucket}. ${profile.promptTemplate}`,
    character_block: usesWilma
      ? "Wilma is a locked app-composited asset. Do not ask the image model to draw, redraw, reinterpret, or invent Wilma. Generate only the poster/background and leave a clean guide-panel area for the approved canonical Wilma PNG to be composited after generation."
      : "No Wilma character required for this visual.",
    platform_block: `${platformLabels[post.platform] || post.platform} output. Aspect ratio ${aspectRatio}. Prioritize legibility.`,
    logo_block: "Do not include a LegalEase logo, wordmark, initials, badge, symbol, or substitute mark inside the generated image. The app may apply an optional official white LegalEase watermark overlay after generation, with corner placement chosen before posting.",
    safety_block:
      `${profile.negativeRules || ""} Image risk: ${imageRoute.imageRiskLevel}. ${imageRoute.imageRiskLevel === "high" ? "Avoid visuals implying guaranteed outcomes, court victory, before/after transformation claims, eligibility, or specific legal process success." : ""} No legal advice, no guaranteed outcomes, no dense unreadable text, no AI slop aesthetics. Ban generic flat vector people, Canva infographics, isometric tech scenes, random AI dashboards, glowing AI nodes, generic robots, courthouse silhouettes, generic legal icons, scales of justice, gavels, jail bars, handcuffs, mugshots, giant logo badges, and top-headline/middle-illustration/bottom-logo compositions. No fake LegalEase logos, generated logo substitutes, retyped LegalEase logo, altered logo colors, logo-like marks, badges, initials, wordmarks, distorted proportions, stretched/cropped logos, or low-contrast logo placement.`
  };
  return {
    postId: post.id,
    contentBucket,
    visualBucket,
    platform: post.platform,
    stylePresetId: imageRoute.stylePresetId,
    stylePresetName: imageRoute.stylePresetName,
    imageVariant: imageRoute.imageVariant,
    imageVariantLabel: imageRoute.imageVariantLabel,
    imageVariantReason: imageRoute.imageVariantReason,
    usesWilma,
    usesLogo,
    aspectRatio,
    imageRiskLevel: imageRoute.imageRiskLevel,
    assetBundleKey: imageRoute.assetBundleKey,
    imageBrief,
    referenceAssets: selectedAssets,
    logoReferenceAssets,
    logoAssetId: primaryLogoAsset?.id || "",
    logoTypeUsed: primaryLogoAsset ? logoKind(primaryLogoAsset) : "",
    logoColorMode: primaryLogoAsset ? logoColorMode(primaryLogoAsset) : "",
    logoFidelityLocked: Boolean(usesLogo),
    brandGuidelineVersionUsed: designSystem.version,
    wilmaReferenceAssets,
    wilmaReferenceAssetIds: wilmaReferenceAssets.map((asset) => asset.id),
    wilmaFidelityMode: usesWilma ? "strict" : "",
    wilmaIdentityLocked: Boolean(usesWilma),
    rulesBundle: selectedRules,
    promptBlocks,
    prompt: Object.values(promptBlocks).join("\n\n")
  };
}

const creativeDirections = [
  {
    key: "abstract_signal_field",
    label: "Abstract signal field",
    direction:
      "A semi-abstract field of luminous pathways, layered grid fragments, cultural geometry, and civic signal patterns that conceptualize the post without literal legal imagery."
  },
  {
    key: "ancestral_tech_map",
    label: "Ancestral tech map",
    direction:
      "A modern Afro-futurist-inspired map language: radiant node paths, woven-line geometry, deep-space color, architectural silhouettes, and warm human-centered technology."
  },
  {
    key: "threshold_portal",
    label: "Threshold portal",
    direction:
      "A symbolic threshold or portal composition showing transition from confusion to access through abstract light, layered frames, and route-like energy lines."
  },
  {
    key: "community_orbit",
    label: "Community orbit",
    direction:
      "A community-centered orbit of abstract figures, civic forms, data constellations, and protective frame structures, dignified and future-facing."
  },
  {
    key: "operator_grid",
    label: "Operator grid",
    direction:
      "A clean techno-operational grid of glowing pathways, blank interface panels, document-like planes, and signal-routing geometry; advanced but grounded, not sci-fi cliché."
  },
  {
    key: "wilma_signal_guide",
    label: "Wilma signal guide",
    direction:
      "A Wilma guide composition with a calm abstract signal environment behind her: luminous paths, blank guide panels, and warm techno-cultural geometry."
  },
  {
    key: "data_constellation",
    label: "Data constellation",
    direction:
      "A data constellation using abstract chart fragments, orbital lines, dot matrices, and horizon-like economic mobility cues without readable numbers or fake dashboards."
  },
  {
    key: "future_memory_poster",
    label: "Future memory poster",
    direction:
      "A bold future-memory composition mixing warm portrait energy, symbolic light, deep navy space, orange signal paths, and geometric pattern language."
  }
];

const bucketVisualSystems = {
  "Implementation Layer": {
    look: "abstract civic access infrastructure with threshold, routing, and signal logic",
    use: "luminous pathways, layered grids, blank document planes, threshold portals, civic architecture as abstraction",
    avoid: "literal policy illustration, courthouse clichés, legal icons, generic dashboard art",
    directionKeys: ["ancestral_tech_map", "operator_grid", "threshold_portal"],
    reference:
      "Use the approved example assets/brand/examples/narrative-infrastructure-implementation-layer.png as a design-language standard only: editorial poster energy, oversized type, square-frame crop language, route lines, checkpoint labels, paper texture, Legal Blue dominance, and Horizon Orange signal path. Do not copy the person, race, gender, headline, or exact layout."
  },
  "Human Cost": {
    look: "symbolic human stakes rendered through dignified portrait energy and abstract barriers",
    use: "warm human presence, silhouette/portrait fragments, protective frames, luminous access paths, future-memory atmosphere",
    avoid: "pity imagery, mugshots, jail bars, handcuffs, courtroom clichés, fake testimonials",
    directionKeys: ["future_memory_poster", "threshold_portal", "community_orbit"],
    reference:
      "A record can outlast the sentence. Use an editorial human crop with system barriers and status labels around the person. Make it dignified, not pity-driven."
  },
  "Workforce Argument": {
    look: "economic mobility as data constellation and future pathway",
    use: "abstract trajectory lines, orbital data points, blank chart planes, work/mobility symbols as light and geometry",
    avoid: "generic office stock, fake dashboards, job-outcome promises, literal money graphics",
    directionKeys: ["data_constellation", "abstract_signal_field", "threshold_portal"],
    reference:
      "Record clearance is a workforce issue. Use a hiring pathway, background-check checkpoint, economic mobility line, and one clean takeaway."
  },
  "AI Operator Lane": {
    look: "grounded techno-operator system with humane automation cues",
    use: "blank interface planes, routing grids, signal processing, document-like translucent layers, warm civic technology",
    avoid: "robots, glowing AI brains, sci-fi, random SaaS dashboards",
    directionKeys: ["operator_grid", "data_constellation", "abstract_signal_field"],
    reference:
      "AI for access should feel like civic workflow infrastructure: intake, screening, routing, document preparation, follow-up, and human handoff."
  },
  "Second Chance Culture": {
    look: "future-memory campaign energy with symbolic renewal and access",
    use: "radiant threshold light, dignified portrait energy, geometric cultural pattern, orange signal points",
    avoid: "overly soft nonprofit mood, generic inspiration quotes, sentimental stock-photo treatment",
    directionKeys: ["future_memory_poster", "threshold_portal", "community_orbit"],
    reference:
      "The question is whether systems can deliver second chances. Use decisive type, dignified human energy, frame crops, and a few orange signal points."
  },
  "Trust & Guidance": {
    look: "plain-English guidance as calm techno guide space",
    use: "Wilma as composited guide node, blank definition panels, luminous route lines, calm signal geometry",
    avoid: "dense text, generic mascot scenes, legal advice framing",
    directionKeys: ["wilma_signal_guide", "abstract_signal_field", "operator_grid"],
    reference:
      "Wilma translation: paperwork should not require a secret decoder ring. Put Wilma in a framed guide window connected to a plain-English definition panel."
  },
  "Community Infrastructure": {
    look: "community systems as orbiting support network",
    use: "abstract community nodes, civic forms, protective frames, service-flow light paths, neighborhood texture",
    avoid: "generic civic illustration, taking credit for partner work, nonprofit flyer clutter",
    directionKeys: ["community_orbit", "ancestral_tech_map", "abstract_signal_field"],
    reference:
      "Second chances need infrastructure. Show clinic, intake, screening, follow-up, and community partners as connected service nodes."
  }
};

const representationVariants = [
  "Feature a Latino man in his 30s or 40s in a grounded working-class or community-service context, shown with dignity and agency.",
  "Feature a white woman in her 40s or 50s in a suburban or small-town civic context, shown as capable and respected.",
  "Feature a Black man in his 30s or 40s in a workforce or community setting, without criminalizing visual cues.",
  "Feature an Asian American woman in her 20s or 30s in an institutional navigation or service-access context, shown as thoughtful and capable.",
  "Feature a multiracial group with varied genders and adult ages, composed editorially rather than as a token diversity collage.",
  "Feature an older Latino or Black adult in a family or community-support context, dignified and calm.",
  "Feature a white man in a working-class context, with the system barriers shown through overlays rather than stereotypes.",
  "Feature a nonbinary or gender-nonconforming adult in a clean civic/service-access context, represented naturally and respectfully.",
  "Feature a Middle Eastern or South Asian adult in a professional or community navigation context, with no stereotype shorthand.",
  "Feature a diverse pair of adults from different racial or ethnic backgrounds, focused on access, paperwork, or next steps, not personal guilt or shame."
];

function directionForContext(context, seed) {
  const system = bucketVisualSystems[context.contentBucket] || bucketVisualSystems["Trust & Guidance"];
  const keys = context.usesWilma ? ["wilma_guide_node", ...(system.directionKeys || [])] : system.directionKeys || [];
  const pool = creativeDirections.filter((direction) => keys.includes(direction.key));
  const options = pool.length ? pool : creativeDirections;
  return options[parseInt(seed.slice(0, 2), 16) % options.length];
}

function legalEaseNegativePrompt(context = {}) {
  const base = [
    "no flat vector people",
    "no generic Canva infographics",
    "no random icons floating around people",
    "no fake LegalEase logos",
    "no fake marks",
    "no fake government seals",
    "no fictional partner logos",
    "no fake Wilma characters",
    "no generic assistant mascots",
    "no generic legal symbols",
    "no scales of justice",
    "no gavels",
    "no courthouse silhouettes",
    "no jail bars",
    "no handcuffs",
    "no mugshots",
    "no AI robots",
    "no hologram brains",
    "no startup gradient slop",
    "no glossy SaaS hero graphics",
    "no fake app screenshots",
    "no readable generated text",
    "no pseudo-words",
    "no retyped LegalEase wordmark",
    "no giant logo badges"
  ];
  if (context.imageRiskLevel === "high") {
    base.push("no court victory imagery", "no before/after transformation", "no eligibility promises", "no legal outcome implication");
  }
  return base.join(", ");
}

function modelSafeImagePrompt(prompt = "") {
  const wantsHuman = /human|people|work|family|job|record|paperwork|eligib|community|portrait/i.test(prompt);
  const wantsGuidePanel = /guide character|guide-panel|right-side|lower-right|wilma/i.test(prompt);
  return [
    "Create a square text-free semi-abstract modern techno Afro-futurist-inspired concept image.",
    "Style: luminous future-facing civic technology, layered dark navy atmosphere, warm orange signal paths, pale blue data glow, abstract cultural geometry, orbital route lines, blank glass panels, woven circuit-like patterns, dimensional light, and conceptual visual metaphor.",
    wantsHuman
      ? "Include one dignified diverse adult human subject, silhouette, or grounded hands-and-paperwork detail, integrated into the abstract techno geometry. Do not imply the person has any legal status or personal story."
      : "Use abstract civic process geometry, luminous paths, blank panels, data constellations, threshold forms, and system-map structure.",
    wantsGuidePanel
      ? "Leave the lower-right area calm and low-detail for an app-composited approved guide-character panel. Do not draw any guide character, assistant, mascot, avatar, headset figure, or substitute person in that area."
      : "Leave at least one calm corner for an optional app-composited watermark.",
    "ABSOLUTE TEXT BAN: zero readable text, zero words, zero letters, zero numbers, zero captions, zero signs, zero badges, zero labels with glyphs, zero UI copy, zero fake metadata, zero pseudo-typography, zero brand names, zero logos, zero wordmarks, zero initials.",
    "If the design needs a label, sign, title, button, document, form, or tag, make it completely blank or use abstract non-letter texture only.",
    "Avoid generic flat vector art, legal symbols, courthouse imagery, scales, gavels, jail imagery, handcuffs, robots, startup gradients, fake marks, and anything that looks like a Canva infographic.",
    "Keep all important subjects fully inside the canvas with generous safe margins. Do not crop words because there must be no words."
  ].join("\n\n");
}

function buildLegalEaseImagePrompt({ blocks, context, variant, direction, composition, negativePrompt }) {
  const finalPrompt = [
    `Create a ${context.aspectRatio} social image in the ${narrativeInfrastructurePreset.displayName} style.`,
    "This should feel semi-abstract, modern, techno, and Afro-futurist-inspired: conceptual visual metaphor, luminous pathway systems, layered geometry, future-facing civic technology, data constellations, cultural pattern language, and human dignity.",
    `Style preset id: ${narrativeInfrastructurePreset.visualStyleId}. Variant: ${variant.label}. Variant reason: ${variant.reason}`,
    `Variant definition: ${variant.description}`,
    `Creative direction: ${direction.direction}`,
    `Composition: ${composition}`,
    ...blocks,
    `Negative prompt / avoid list: ${negativePrompt}`,
    "Do not create a literal ad. Do not create a generic social media graphic. Make conceptual art that interprets the copy without relying on literal legal imagery."
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    finalPrompt,
    negativePrompt,
    metadata: {
      stylePresetId: narrativeInfrastructurePreset.visualStyleId,
      stylePresetName: narrativeInfrastructurePreset.displayName,
      variantId: variant.id,
      variantLabel: variant.label,
      variantReason: variant.reason,
      directionKey: direction.key,
      directionLabel: direction.label
    }
  };
}

function creativePlanForImage(post, context, versionNumber) {
  const seed = crypto
    .createHash("sha256")
    .update(`${post.id}:${versionNumber}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  const direction = directionForContext(context, seed);
  const bucketSystem = bucketVisualSystems[context.contentBucket] || bucketVisualSystems["Trust & Guidance"];
  const variant = selectImageVariant(post, context);
  const representationVariant = representationVariants[parseInt(seed.slice(8, 10), 16) % representationVariants.length];
  const compositionOptions = context.usesWilma
    ? [
        "The approved Wilma asset will sit inside a calm lower-right guide panel, surrounded by luminous pathways, blank glass panels, and warm orange signal geometry.",
        "Reserve a clean guide-window area for app-composited Wilma while the background becomes a semi-abstract techno map of clarity, access, and next steps.",
        "Use layered signal fields and cultural geometry around the Wilma panel; she supports the idea without the model drawing any character."
      ]
    : [
        "Use an asymmetrical abstract composition with one dominant conceptual form, luminous route lines, orbital nodes, cultural geometry, and deep negative space.",
        "Use a techno-systems composition with blank glass panels, pathway light, threshold forms, and signal movement from barrier to access.",
        "Use a split symbolic layout where human reality and system logic are translated into abstract light, frame geometry, and data constellation patterns."
      ];
  const composition = compositionOptions[parseInt(seed.slice(2, 4), 16) % compositionOptions.length];
  const styleProfile = narrativeInfrastructurePreset.displayName;
  const styleBlock =
    `Style profile: ${styleProfile}. Visual style id: ${narrativeInfrastructurePreset.visualStyleId}. Brand images must feel like semi-abstract modern techno concept art with Afro-futurist inspiration, not generic social graphics. The target style combines conceptual visual metaphor, human dignity, luminous pathway systems, orbital data constellations, cultural geometry, square-frame structures, deep navy atmosphere, warm orange signal energy, and polished future-facing civic technology.`;
  const defaultPromptTemplate =
    `Create a ${context.aspectRatio} social image in the "${styleProfile}" style. This should look like high-end semi-abstract concept art for a civic technology brand: modern, luminous, symbolic, Afro-futurist-inspired, grounded, and emotionally intelligent. It should not look like a startup infographic, civic-tech template, Canva card, law-firm ad, or generic social media graphic. Do not render any visible brand name or wordmark.`;
  const layoutRules =
    "Layout rules: create strong negative space for app-rendered overlay text, plus a calm low-detail corner for an optional watermark. Keep an 8-12% safe margin around subjects, faces, hands, frame corners, route nodes, and overlay zones. Do not crop faces, hands, key geometry, or pathway endpoints off the canvas. Do not render the actual headline, support line, letters, words, numbers, or captions inside the generated image. Use layered abstract panels, square/corner frame motifs, luminous route lines, nodes, portals, data constellations, woven circuit patterns, deep atmospheric gradients, and polished dimensional light.";
  const metadataRule =
    "Text-safe metadata rule: do not render readable metadata, labels, letters, or numbers in the image. Suggest information architecture with blank plates, luminous nodes, empty capsules, abstract bars, and non-letter texture only. Exact overlay text will be added later by the app.";
  const bucketBlock =
    `Bucket visual lane: ${context.contentBucket}. Look: ${bucketSystem.look}. Use: ${bucketSystem.use}. Avoid: ${bucketSystem.avoid}. Style reference concept: ${bucketSystem.reference}`;
  const styleReferenceRule = (context.referenceAssets || []).some((asset) => asset.assetType === "example_output")
    ? "An approved style reference exists in the brand library, but the new direction should be more abstract, modern, techno, and Afro-futurist-inspired. Do not copy the reference person, race, gender, headline, or layout."
    : "";
  const representationBlock =
    `Representation rule: when people appear, show diverse, dignified human representation across race, ethnicity, gender, adult age, body type, and socioeconomic context over time. For this image specifically: ${representationVariant} People should feel capable, grounded, real, and respected. Do not tokenize, stereotype, imply criminality through appearance or setting, use pity imagery, or suggest a real person's legal status/testimonial unless explicitly provided and approved. Do not default to Black women or any single demographic repeatedly. Vary human subjects across generations.`;
  const signalLanguage =
    "Signal language direction: conceptualize access, confusion, records, second chances, workforce mobility, and process through light pathways, threshold portals, blank document planes, orbital nodes, protective frames, and signal movement. Do not render actual words.";
  const palette =
    `LegalEase DESIGN.md palette only: Legal Blue ${designSystem.colors.legalBlue}, Horizon Orange ${designSystem.colors.horizonOrange}, Skyline Blue ${designSystem.colors.skylineBlue}, Paper White ${designSystem.colors.paperWhite}, Civic Black ${designSystem.colors.civicBlack}, Infrastructure Gray ${designSystem.colors.infrastructureGray}, Lighter Legal Blue ${designSystem.colors.legalBlueLight}, Lighter Horizon Orange ${designSystem.colors.horizonOrangeLight}, Soft Light ${designSystem.colors.softLight}, white ${designSystem.colors.white}. Legal Blue should dominate. Paper White, Soft Light, white, Infrastructure Gray, and Skyline Blue create breathing space. Horizon Orange is a signal for active pathways, checkpoints, warnings, CTAs, and intervention points; do not use orange as a giant blanket background.`;
  const textRule =
    "TEXT-SAFE MODE: do not render readable text, letters, words, numbers, captions, slogans, pseudo-words, fake metadata, or tiny UI copy inside the generated image. Do not attempt to spell LegalEase, post hooks, support lines, system labels, or metadata. Leave clean blank areas and simple label plates for the app to overlay exact DM Sans and DM Mono typography afterward. This prevents typos and blurred text.";
  const wilmaRule = context.usesWilma
    ? "Wilma production rule: do not draw, render, generate, reinterpret, or include Wilma in the generated raster image. The app will composite the approved canonical Wilma PNG after background generation. Leave a clean lower-right or right-side framed guide-panel area for the approved Wilma asset. Do not create any assistant character, mascot, avatar, cartoon person, headset character, or Wilma-like substitute."
    : "Do not include Wilma unless explicitly requested. Do not use generic AI avatars or legal cliché props.";
  const safetyRule =
    context.imageRiskLevel === "high"
      ? "High-risk topic. Avoid court victory imagery, before/after transformation, eligibility promises, disappearing records, gavels, scales of justice, jail bars, handcuffs, mugshots, courthouse silhouettes, generic legal icons, fake legal documents with case details, or anything implying guaranteed outcomes. Also avoid generic flat vector people, Canva infographic style, isometric tech scenes, random dashboards, glowing AI nodes, generic robots, stock-photo overlay clichés, tokenized diversity collage, stereotype shorthand, pity imagery, and implying any shown person has a criminal record without approved context."
      : "Avoid generic flat vector people, Canva infographic style, isometric tech scenes, random dashboards, glowing AI nodes, generic robots, generic legal-tech stock visuals, courthouse silhouettes, gavels, scales of justice, jail bars, mugshots, handcuffs, giant logo badges, cheap collage energy, tokenized diversity collage, stereotype shorthand, and pity imagery.";
  const logoRule = context.usesLogo
    ? "Logo lock: do not render, recreate, redraw, reinterpret, retype, approximate, or generate any LegalEase logo, wordmark, initials, badge, fake mark, brand symbol, or logo-like device inside the image. The app may overlay the official approved LegalEase watermark after generation. Leave corners clean for optional watermark placement. Do not use generic marks, fake logos, gavels, scales, courthouse icons, or legal-themed badges."
    : "Do not include a LegalEase logo or any substitute mark.";
  const brandTextBan =
    "ABSOLUTE TYPOGRAPHY RULE: the generated raster image must contain zero readable text. Do not render the word LegalEase, LEGAL, EASE, LE, logo text, partial letters, cropped lettering, fake typography, pseudo-words, numbers, metadata, labels, captions, or UI text. All typography will be added later by the app as editable overlay text or watermark. If a design area needs text, make it a blank rectangle, blank tag, abstract line, or illegible non-letter texture.";
  const negativePrompt = legalEaseNegativePrompt(context);
  const promptBuild = buildLegalEaseImagePrompt({
    context,
    variant,
    direction,
    composition,
    negativePrompt,
    blocks: [
      defaultPromptTemplate,
      styleBlock,
      bucketBlock,
      styleReferenceRule,
      representationBlock,
      `Creative direction: ${direction.direction}`,
      `Composition: ${composition}`,
      layoutRules,
      metadataRule,
      signalLanguage,
      `Post message: ${post.hook}`,
      `Content bucket: ${context.contentBucket}. Visual bucket: ${context.visualBucket}. Speaker: ${speakerLabels[post.speaker] || "LegalEase"}. Audience: ${audienceLabels[post.audience] || "general"}.`,
      palette,
      logoRule,
      brandTextBan,
      wilmaRule,
      textRule,
      safetyRule,
      `Final art direction: semi-abstract modern techno Afro-futurist-inspired concept art with conceptual clarity, human dignity, balanced negative space, polished lighting, deep navy atmosphere, orange signal energy, pale blue glow, and no visible brand text.`
    ]
  });
  return {
    seed,
    stylePresetId: promptBuild.metadata.stylePresetId,
    styleProfile,
    imageVariant: variant.id,
    imageVariantLabel: variant.label,
    imageVariantReason: variant.reason,
    negativePrompt: promptBuild.negativePrompt,
    directionKey: direction.key,
    directionLabel: direction.label,
    representationVariant,
    composition,
    prompt: promptBuild.finalPrompt
  };
}

function imageSizeForAspectRatio(aspectRatio) {
  if (aspectRatio === "16:9") return "1536x1024";
  if (aspectRatio === "4:5" || aspectRatio === "9:16") return "1024x1536";
  return "1024x1024";
}

async function generateOpenAICreativeImage(prompt, aspectRatio, referenceAssets = []) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { imageUrl: null, error: "OPENAI_API_KEY is missing." };
  let response;
  try {
    if (referenceAssets.length) {
      const form = new FormData();
      form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
      form.append("prompt", prompt);
      form.append("size", imageSizeForAspectRatio(aspectRatio));
      form.append("quality", "medium");
      form.append("n", "1");
      for (const [index, referenceAsset] of referenceAssets.entries()) {
        const referenceUrl = assetFileUrl(referenceAsset);
        if (!referenceUrl) {
          const missing = referenceAsset?.assetType === "wilma_reference"
            ? "Wilma generation blocked: canonical reference asset missing."
            : "Logo generation blocked: approved LegalEase logo asset missing.";
          return { imageUrl: null, error: missing };
        }
        const imageBlob = new Blob([readFileSync(referenceUrl)], { type: referenceAsset.mimeType || "image/png" });
        const filename = referenceAsset.fileUrl?.split("/").pop() || `brand-reference-${index + 1}.png`;
        form.append(referenceAssets.length === 1 ? "image" : "image[]", imageBlob, filename);
      }
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
          prompt,
          size: imageSizeForAspectRatio(aspectRatio),
          quality: "medium",
          n: 1
        })
      });
    }
  } catch (error) {
    return { imageUrl: null, error: safeShortError(error.message || "Image generation request failed.") };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawMessage = payload?.error?.message || response.statusText || "Image generation failed.";
    const rateLimit = imageRateLimitDetails(rawMessage);
    if (rateLimit.rateLimited) {
      return {
        imageUrl: null,
        error: rateLimit.message,
        rateLimited: true,
        retryAfterSeconds: rateLimit.retryAfterSeconds
      };
    }
    return { imageUrl: null, error: safeShortError(rawMessage) };
  }
  const item = payload.data?.[0];
  if (item?.b64_json) return { imageUrl: `data:image/png;base64,${item.b64_json}`, error: null };
  if (item?.url) return { imageUrl: item.url, error: null };
  return { imageUrl: null, error: "Image generation returned no image." };
}

function safeShortError(value) {
  return String(value || "Image generation failed.").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 180);
}

function imageRateLimitDetails(value) {
  const raw = String(value || "");
  const secondsMatch = raw.match(/try again in\s+(\d+)\s*s/i);
  const retryAfterSeconds = secondsMatch ? Number(secondsMatch[1]) : 15;
  const rateLimited = /rate limit|too many requests|limit reached/i.test(raw);
  return {
    rateLimited,
    retryAfterSeconds,
    message: rateLimited
      ? `OpenAI image generation is cooling down. Try again in ${retryAfterSeconds}s.`
      : safeShortError(raw)
  };
}

function narrativeInfrastructureStyleGate({ prompt, generationMode, usesWilma }) {
  const text = String(prompt || "").toLowerCase();
  const required = [
    "semi-abstract",
    "techno",
    "afro-futurist",
    "zero readable text",
    "luminous",
    "path",
    "geometry",
    "deep navy",
    "orange"
  ];
  const missing = required.filter((term) => !text.includes(term));
  const banned = [];
  const generated = /^openai_(image|background)/.test(String(generationMode || ""));
  const passed = generated && banned.length === 0;
  return {
    passed,
    label: passed ? "Techno concept style locked" : "Needs regeneration",
    missing,
    banned,
    message: passed
      ? "Techno Afro-Futurist Concept requirements are present."
      : "Needs regeneration: strengthen techno concept requirements before approval."
  };
}

function validateGeneratedImageStyle({ prompt, generationMode, context, creativePlan, openAIResult }) {
  const gate = narrativeInfrastructureStyleGate({
    prompt,
    generationMode,
    usesWilma: context.usesWilma
  });
  const warnings = [];
  const lowerPrompt = String(prompt || "").toLowerCase();
  if (context.usesWilma && !context.wilmaReferenceAssetIds.length) {
    warnings.push("Wilma requested without approved canonical reference asset.");
  }
  if (/include (the )?(legalease )?(logo|wordmark)|place (the )?(legalease )?(logo|wordmark)|draw (the )?(legalease )?(logo|wordmark)/.test(lowerPrompt)) {
    warnings.push("Prompt appears to request a generated logo or wordmark.");
  }
  if (!creativePlan?.stylePresetId || creativePlan.stylePresetId !== narrativeInfrastructurePreset.visualStyleId) {
    warnings.push("Techno Afro-Futurist style preset metadata missing.");
  }
  if (!openAIResult?.imageUrl) {
    warnings.push("Final generated image missing; use upload or regenerate before launch.");
  }
  const blockingWarnings = warnings.filter((warning) =>
    /missing|fake logo|wilma requested/i.test(warning)
  );
  const passed = gate.passed && Boolean(openAIResult?.imageUrl) && blockingWarnings.length === 0;
  return {
    ...gate,
    passed,
    label: passed ? "Techno concept style locked" : "Needs regeneration",
    warnings,
    message: passed
      ? "Techno Afro-Futurist Concept requirements are present."
      : `Needs regeneration: ${warnings[0] || gate.message}`
  };
}

function stricterPosterPrompt(prompt) {
  return `${prompt}

STRICT REGENERATION INSTRUCTION:
Make this less like a generic social graphic and more like semi-abstract modern techno Afro-futurist-inspired concept art with luminous pathways, orbital nodes, threshold portals, layered cultural geometry, blank glass panels, deep navy atmosphere, pale blue glow, and bright orange signal energy.

TEXT-SAFE REQUIREMENT:
Do not render actual readable text, letters, words, numbers, logo text, metadata, slogans, captions, or pseudo-words. Leave clean blank areas and label plates for exact app-rendered typography. Reject any generated text, fake logo, blurred letters, misspelled words, or pseudo UI copy.

Reject any generic flat illustration, centered person-plus-icons composition, weak typography, fake logo, fake Wilma, random legal symbols, generic UI icons, random gradients, or Canva-style layout.`;
}

function wilmaBackgroundOnlyPrompt(prompt) {
  return `${prompt}

WILMA COMPOSITION PIPELINE:
Generate only the poster background and environment. Do not draw Wilma. Do not draw any mascot, assistant, avatar, headset character, robot, or substitute guide. The approved Wilma PNG will be composited by the app after generation.

ABSOLUTE BACKGROUND TEXT BAN:
The generated background must contain zero readable text and zero text-like markings. Do not create signs, labels, badges, stickers, banners, captions, metadata plates with words, UI labels, fake words, pseudo-letters, numbers, or letter-shaped marks. If a route checkpoint or tag is needed, use an empty shape with no glyphs inside it.

SAFE COMPOSITION:
Leave the right/lower-right area low-detail and calm for the app-composited Wilma guide panel. Keep all important human faces, route lines, and frame edges away from the lower-right panel area.`;
}

function generationModeForResult(openAIResult, context, wilmaBlocked) {
  if (openAIResult.imageUrl) {
    if (context.usesWilma && openAIResult.compositedWilma) return "openai_background_with_canonical_wilma_composite";
    if (context.usesWilma) return "openai_background_generation_for_wilma";
    return "openai_image_generation";
  }
  if (context.usesWilma && !wilmaBlocked) return "wilma_composited_preview";
  return "creative_prompt_preview";
}

async function saveUploadedPostImage(request) {
  const buffer = await readBuffer(request);
  if (buffer.length > 12 * 1024 * 1024) throw new Error("Image upload is too large. Keep it under 12MB.");
  const { fields, files } = parseMultipartForm(buffer, request.headers["content-type"] || "");
  const postId = fields.postId;
  const file = files.image;
  if (!postId) throw new Error("Post id is required.");
  if (!file?.buffer?.length) throw new Error("Choose an image to upload.");
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimeType)) {
    throw new Error("Upload a PNG, JPG, WebP, or GIF image.");
  }
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const previous = (state.postImages || []).filter((image) => image.postId === postId);
  const versionNumber = previous.length + 1;
  const extension = file.mimeType.split("/")[1].replace("jpeg", "jpg");
  const uploadDir = new URL("assets/uploads/post-images/", assetRoot);
  await mkdir(uploadDir, { recursive: true });
  const safeName = `${postId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const uploadUrl = new URL(safeName, uploadDir);
  await writeFile(uploadUrl, file.buffer);
  const imageUrl = `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
  const image = {
    id: crypto.randomUUID(),
    postId,
    imageUrl,
    imagePrompt: "",
    promptSummary: "Human-uploaded image. This visual overrides generated image output for the queue item.",
    assetBundleUsed: {
      uploadPath: `assets/uploads/post-images/${safeName}`,
      originalFilename: file.filename,
      uploadedBy: "human",
      watermark: {
        position: "none",
        mode: "none",
        logoAssetId: "23232323-2323-4232-8232-232323232323"
      }
    },
    rulesBundleUsed: {
      rules: [],
      note: "Manual upload. Brand/compliance review still applies."
    },
    usesWilma: false,
    usesLogo: false,
    logoAssetId: "",
    logoTypeUsed: "",
    logoColorMode: "",
    logoFidelityLocked: false,
    brandGuidelineVersionUsed: designSystem.version,
    wilmaReferenceAssetIds: [],
    wilmaFidelityMode: "",
    wilmaIdentityLocked: false,
    wilmaReferenceMode: "",
    logoReferenceMode: "",
    watermarkPosition: "none",
    watermarkMode: "none",
    watermarkLogoAssetId: "23232323-2323-4232-8232-232323232323",
    versionNumber,
    imageVersion: versionNumber,
    generationStatus: "generated",
    imageStatus: "uploaded",
    visualBucket: post.visualBucket || "Human-uploaded image",
    imageRiskLevel: post.imageRiskLevel || post.complianceRisk || "medium",
    imageBrief: "Human-uploaded image for this post.",
    aspectRatio: "uploaded",
    assetBundleKey: "human_upload",
    templateKey: "none_manual_upload",
    generationMode: "human_uploaded_image",
    styleProfile: "Manual upload",
    styleGate: {
      passed: true,
      label: "Human uploaded",
      missing: [],
      banned: [],
      message: "Manual image upload. Review visually before approval."
    },
    styleQualityLabel: "Human uploaded",
    creativeDirection: {
      styleProfile: "Manual upload",
      directionLabel: "Human-uploaded image",
      composition: "Manual visual override"
    },
    generationError: null,
    createdAt: new Date().toISOString()
  };
  await store.updatePost(postId, {
    imageFinalized: false,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: ""
  });
  const nextState = await store.savePostImage(image);
  return { state: nextState, image, message: "Image uploaded." };
}

function designTemplateForPost(post, context) {
  const format = String(post.contentFormat || "").toLowerCase();
  if (context.usesWilma && /myth/.test(format)) return "wilma_myth_check";
  if (context.usesWilma) return "wilma_explainer_card";
  if (context.visualBucket === "Quote card") return "legalease_quote_card";
  if (post.contentBucket === "Human Cost" || context.visualBucket === "People-centered editorial graphic") return "human_cost_editorial";
  return "legalease_implementation_graphic";
}

function svgImageDataUrl(post, context, versionNumber) {
  const templateKey = context.templateKey || designTemplateForPost(post, context);
  const template = designedPreviewTemplate(post, context, templateKey);
  const previewLabel = context.usesWilma ? "Composited preview using canonical Wilma asset" : `Designed preview · ${template.label}`;
  const headline = wrapSvgText(template.headline, template.headlineChars, template.headlineLines);
  const support = wrapSvgText(template.support, template.supportChars, 2);
  const visual = template.visual;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#1f2430" flood-opacity=".14"/>
    </filter>
    <clipPath id="assetClip"><rect x="${template.assetClip.x}" y="${template.assetClip.y}" width="${template.assetClip.width}" height="${template.assetClip.height}" rx="${template.assetClip.rx}"/></clipPath>
  </defs>
  <rect width="1200" height="1200" fill="${template.background}"/>
  ${template.backdrop}
  <g transform="translate(92 92)"></g>
  <g transform="translate(${template.textX} ${template.textY})">
    <text x="0" y="0" font-family="DM Sans,Arial,sans-serif" font-size="${template.eyebrowSize}" font-weight="850" fill="${template.accent}" letter-spacing="3">${escapeSvg(template.eyebrow)}</text>
    <text x="0" y="${template.headlineY}" font-family="DM Sans,Arial,sans-serif" font-size="${template.headlineSize}" font-weight="850" fill="${template.ink}">${svgLineTspans(headline, 0, template.headlineY, template.headlineLineHeight)}</text>
    <line x1="0" y1="${template.ruleY}" x2="92" y2="${template.ruleY}" stroke="${template.accent}" stroke-width="8" stroke-linecap="round"/>
    <text x="0" y="${template.supportY}" font-family="DM Mono,Arial,sans-serif" font-size="${template.supportSize}" font-weight="560" fill="${template.muted}">${svgLineTspans(support, 0, template.supportY, template.supportLineHeight)}</text>
  </g>
  ${visual}
  <g transform="translate(92 1052)">
    <text x="0" y="0" font-family="DM Mono,Arial,sans-serif" font-size="18" font-weight="750" fill="${template.footerColor}">${escapeSvg(previewLabel)} · v${versionNumber}</text>
    <text x="0" y="30" font-family="DM Mono,Arial,sans-serif" font-size="16" fill="${template.footerMuted}">${escapeSvg(platformLabels[post.platform] || post.platform)} · ${escapeSvg(context.aspectRatio)} · ${escapeSvg(context.visualBucket)}</text>
  </g>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function designedPreviewTemplate(post, context, templateKey) {
  const base = {
    background: "#f7f4ef",
    backdrop: `<rect x="50" y="50" width="1100" height="1100" rx="38" fill="#ffffff" stroke="#ded6c8" stroke-width="3"/>`,
    textX: 96,
    textY: 230,
    headlineChars: 24,
    headlineLines: 4,
    headlineY: 72,
    headlineSize: 55,
    headlineLineHeight: 64,
    supportChars: 36,
    supportY: 430,
    supportSize: 31,
    supportLineHeight: 42,
    ruleY: 358,
    eyebrowSize: 21,
    ink: "#1f2430",
    muted: "#4e5664",
    accent: "#f14a00",
    logoLegal: "#f14a00",
    logoEase: "#20277f",
    footerColor: "#1f2430",
    footerMuted: "#6f7684",
    assetClip: { x: 650, y: 168, width: 440, height: 620, rx: 30 },
    label: "LegalEase Quote Card"
  };

  if (templateKey === "wilma_explainer_card") {
    return {
      ...base,
      background: "#101722",
      backdrop: `<rect x="50" y="50" width="1100" height="1100" rx="38" fill="#f7f4ef"/><rect x="50" y="50" width="1100" height="20" rx="10" fill="#f14a00"/><path d="M690 170c110-78 285-54 370 52v600H650V208c10-14 23-27 40-38z" fill="#1f2430"/>`,
      textX: 96,
      textY: 238,
      headlineChars: 23,
      headlineLines: 4,
      headlineSize: 53,
      supportChars: 34,
      label: "Wilma Explainer Card",
      eyebrow: "WILMA EXPLAINS",
      assetClip: { x: 670, y: 220, width: 360, height: 420, rx: 26 },
      visual: wilmaPanelVisual("explainer")
    };
  }

  if (templateKey === "wilma_myth_check") {
    return {
      ...base,
      background: "#f7f4ef",
      backdrop: `<rect x="50" y="50" width="1100" height="1100" rx="38" fill="#ffffff"/><rect x="92" y="202" width="456" height="170" rx="24" fill="#101722"/><rect x="92" y="400" width="456" height="260" rx="24" fill="#fff6ed" stroke="#f3d7c6" stroke-width="3"/><rect x="628" y="132" width="472" height="690" rx="34" fill="#1f2430"/>`,
      textX: 126,
      textY: 245,
      headlineChars: 20,
      headlineLines: 3,
      headlineSize: 45,
      headlineY: 68,
      headlineLineHeight: 54,
      supportY: 338,
      ruleY: 286,
      supportSize: 29,
      ink: "#ffffff",
      muted: "#4e5664",
      eyebrow: "MYTH CHECK",
      label: "Wilma Myth Check",
      assetClip: { x: 664, y: 174, width: 392, height: 456, rx: 28 },
      visual: wilmaPanelVisual("myth")
    };
  }

  if (templateKey === "legalease_implementation_graphic") {
    return {
      ...base,
      background: "#f4f6f6",
      backdrop: `<rect x="50" y="50" width="1100" height="1100" rx="38" fill="#ffffff" stroke="#d6e1e2" stroke-width="3"/><rect x="650" y="168" width="440" height="620" rx="30" fill="#101722"/>`,
      eyebrow: "IMPLEMENTATION LAYER",
      label: "LegalEase Implementation Graphic",
      visual: implementationVisual()
    };
  }

  if (templateKey === "human_cost_editorial") {
    return {
      ...base,
      background: "#ebe6dc",
      backdrop: `<rect x="50" y="50" width="1100" height="1100" rx="38" fill="#fbfaf7"/><rect x="650" y="168" width="440" height="620" rx="30" fill="#d9d2c4"/><circle cx="870" cy="420" r="160" fill="#b7d6d7" opacity=".55"/><rect x="720" y="560" width="300" height="110" rx="26" fill="#ffffff" opacity=".75"/>`,
      eyebrow: "HUMAN COST",
      label: "Human Cost Editorial Graphic",
      visual: humanCostVisual()
    };
  }

  return {
    ...base,
    eyebrow: "LEGALEASE POV",
    label: "LegalEase Quote Card",
    visual: quoteCardVisual()
  };
}

function wrapSvgText(value, maxChars, maxLines) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.join(" ").length > lines.join(" ").length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?]?$/, "")}...`;
  }
  return lines;
}

function svgLineTspans(lines, x, y, lineHeight) {
  return lines
    .map((line, index) => `<tspan x="${x}" y="${index === 0 ? y : y + index * lineHeight}">${escapeSvg(line)}</tspan>`)
    .join("");
}

function wilmaPanelVisual(mode = "explainer") {
  const wilma = assetDataUri("assets/brand/wilma/new-wilma-2025.png");
  if (!wilma) return "";
  const calloutY = mode === "myth" ? 668 : 670;
  return `<ellipse cx="850" cy="700" rx="156" ry="28" fill="#000000" opacity=".22"/>
    <image href="${wilma}" x="650" y="220" width="430" height="430" preserveAspectRatio="xMidYMid meet" clip-path="url(#assetClip)"/>
    <rect x="692" y="${calloutY}" width="330" height="88" rx="18" fill="#ffffff" opacity=".96"/>
    <text x="720" y="${calloutY + 36}" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="850" fill="#20277f">${mode === "myth" ? "What Wilma says" : "Wilma"}</text>
    <text x="720" y="${calloutY + 66}" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="600" fill="#4e5664">Plain-English guidance</text>`;
}

function quoteCardVisual() {
  const mark = assetDataUri("assets/brand/logos/legalease-mark-white.png");
  return `<g transform="translate(722 208)">
      ${mark ? `<image href="${mark}" x="8" y="-22" width="260" height="148" preserveAspectRatio="xMidYMid meet"/>` : ""}
      <rect x="0" y="146" width="300" height="96" rx="18" fill="#ffffff" opacity=".96"/>
      <rect x="28" y="178" width="172" height="12" rx="6" fill="#f14a00"/>
      <rect x="28" y="206" width="226" height="10" rx="5" fill="#b7d6d7"/>
      <rect x="0" y="272" width="300" height="240" rx="22" fill="#ffffff" opacity=".96"/>
      <path d="M46 340h206M46 392h162M46 444h206" stroke="#20277f" stroke-width="16" stroke-linecap="round"/>
      <circle cx="46" cy="340" r="13" fill="#f14a00"/><circle cx="46" cy="392" r="13" fill="#b7d6d7"/><circle cx="46" cy="444" r="13" fill="#9a4f3a"/>
      <rect x="66" y="548" width="168" height="44" rx="12" fill="#f14a00"/>
      <path d="M96 570h108" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
    </g>`;
}

function implementationVisual() {
  return `<g transform="translate(704 240)">
    <rect x="0" y="0" width="320" height="92" rx="18" fill="#ffffff"/>
    <path d="M32 34h190M32 62h132" stroke="#b7d6d7" stroke-width="12" stroke-linecap="round"/>
    <rect x="0" y="136" width="130" height="118" rx="18" fill="#ffffff"/>
    <rect x="190" y="136" width="130" height="118" rx="18" fill="#ffffff"/>
    <path d="M142 194h36" stroke="#f14a00" stroke-width="12" stroke-linecap="round"/>
    <path d="M174 178l18 16-18 16" fill="none" stroke="#f14a00" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M32 188h68M32 218h44M222 188h66M222 218h42" stroke="#20277f" stroke-width="12" stroke-linecap="round"/>
    <rect x="0" y="300" width="320" height="160" rx="22" fill="#ffffff"/>
    <path d="M36 356h248M36 408h180" stroke="#b7d6d7" stroke-width="16" stroke-linecap="round"/>
    <circle cx="36" cy="356" r="12" fill="#f14a00"/>
    <circle cx="36" cy="408" r="12" fill="#20277f"/>
  </g>`;
}

function humanCostVisual() {
  return `<g transform="translate(704 252)">
    <circle cx="150" cy="110" r="72" fill="#1f2430" opacity=".88"/>
    <rect x="74" y="190" width="152" height="190" rx="54" fill="#1f2430" opacity=".88"/>
    <path d="M18 432h284" stroke="#ffffff" stroke-width="22" stroke-linecap="round" opacity=".7"/>
    <path d="M42 470h236" stroke="#f14a00" stroke-width="14" stroke-linecap="round" opacity=".85"/>
    <rect x="20" y="18" width="260" height="500" rx="34" fill="none" stroke="#ffffff" stroke-width="4" opacity=".55"/>
  </g>`;
}

function creativePromptPreviewDataUrl(post, context, plan, versionNumber, error) {
  const headline = wrapSvgText("Creative image ready to generate", 28, 2);
  const support = wrapSvgText(plan.directionLabel, 34, 2);
  const reason = wrapSvgText(error || "Add OPENAI_API_KEY to generate final images.", 42, 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <rect width="1200" height="1200" fill="#101722"/>
    <rect x="70" y="70" width="1060" height="1060" rx="38" fill="#f7f4ef"/>
    <rect x="70" y="70" width="1060" height="18" rx="9" fill="#f14a00"/>
    <text x="118" y="170" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="850" fill="#9a4f3a" letter-spacing="3">CREATIVE IMAGE MODE</text>
    <text x="118" y="270" font-family="Inter,Arial,sans-serif" font-size="62" font-weight="850" fill="#1f2430">${svgLineTspans(headline, 118, 270, 72)}</text>
    <rect x="118" y="448" width="430" height="88" rx="18" fill="#ffffff" stroke="#ded6c8" stroke-width="3"/>
    <text x="148" y="502" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="800" fill="#20277f">${svgLineTspans(support, 148, 502, 36)}</text>
    <rect x="118" y="600" width="650" height="190" rx="24" fill="#ffffff" stroke="#ded6c8" stroke-width="3"/>
    <text x="148" y="656" font-family="Inter,Arial,sans-serif" font-size="27" font-weight="620" fill="#4e5664">${svgLineTspans(reason, 148, 656, 38)}</text>
    <rect x="828" y="438" width="212" height="212" rx="40" fill="#1f2430"/>
    <path d="M876 544h116M934 486v116" stroke="#f14a00" stroke-width="18" stroke-linecap="round"/>
    <text x="118" y="964" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="780" fill="#1f2430">This is not a template or final image.</text>
    <text x="118" y="1002" font-family="Inter,Arial,sans-serif" font-size="20" fill="#6f7684">Prompt generated v${versionNumber} · ${escapeSvg(context.aspectRatio)} · ${escapeSvg(post.platform)}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeSvg(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

async function generateImageForPost(postId, overrides = {}) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const previous = (state.postImages || []).filter((image) => image.postId === postId);
  const versionNumber = previous.length + 1;
  const context = assembleBrandContext(state, post, overrides);
  const routedPatch = {
    visualBucket: context.visualBucket,
    imageRiskLevel: context.imageRiskLevel,
    imageBrief: context.imageBrief,
    assetBundleKey: context.assetBundleKey,
    imageFinalized: false,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: ""
  };
  const creativePlan = creativePlanForImage(post, context, versionNumber);
  const wilmaBlocked = context.usesWilma && !context.wilmaReferenceAssets.length;
  const logoBlocked = false;
  const lockedReferenceAssets = [];
  let promptUsed = creativePlan.prompt;
  if (context.usesWilma) promptUsed = wilmaBackgroundOnlyPrompt(promptUsed);
  promptUsed = modelSafeImagePrompt(promptUsed);
  let openAIResult = wilmaBlocked
    ? { imageUrl: null, error: "Wilma generation blocked: canonical reference asset missing." }
    : logoBlocked
      ? { imageUrl: null, error: "Logo generation blocked: approved LegalEase logo asset missing." }
      : await generateOpenAICreativeImage(promptUsed, context.aspectRatio, lockedReferenceAssets);
  if (openAIResult.imageUrl && context.usesWilma) {
    try {
      openAIResult = {
        imageUrl: await compositeCanonicalWilmaPanel(openAIResult.imageUrl, context),
        error: null,
        compositedWilma: true
      };
    } catch (error) {
      openAIResult = { imageUrl: null, error: safeShortError(error.message || "Wilma compositing failed.") };
    }
  }
  let generationMode = generationModeForResult(openAIResult, context, wilmaBlocked);
  let styleGate = validateGeneratedImageStyle({
    prompt: promptUsed,
    generationMode,
    context,
    creativePlan,
    openAIResult
  });
  if (openAIResult.imageUrl && !styleGate.passed) {
    promptUsed = modelSafeImagePrompt(stricterPosterPrompt(promptUsed));
    openAIResult = await generateOpenAICreativeImage(promptUsed, context.aspectRatio, lockedReferenceAssets);
    if (openAIResult.imageUrl && context.usesWilma) {
      try {
        openAIResult = {
          imageUrl: await compositeCanonicalWilmaPanel(openAIResult.imageUrl, context),
          error: null,
          compositedWilma: true
        };
      } catch (error) {
        openAIResult = { imageUrl: null, error: safeShortError(error.message || "Wilma compositing failed.") };
      }
    }
    generationMode = generationModeForResult(openAIResult, context, wilmaBlocked);
    styleGate = validateGeneratedImageStyle({
      prompt: promptUsed,
      generationMode,
      context,
      creativePlan,
      openAIResult
    });
  }
  const fallbackImageUrl = context.usesWilma && !wilmaBlocked
    ? svgImageDataUrl(post, { ...context, templateKey: designTemplateForPost(post, context) }, versionNumber)
    : creativePromptPreviewDataUrl(post, context, creativePlan, versionNumber, openAIResult.error);
  const generatedAndPassed = Boolean(openAIResult.imageUrl && styleGate.passed);
  const generationError = openAIResult.error || (!generatedAndPassed ? styleGate.message || "Generated image failed the style gate." : null);
  const rateLimitRetryAfterSeconds = openAIResult.retryAfterSeconds || 0;
  const rateLimitRetryAt = openAIResult.rateLimited
    ? new Date(Date.now() + rateLimitRetryAfterSeconds * 1000).toISOString()
    : "";
  const image = {
    id: crypto.randomUUID(),
    postId,
    imageUrl: openAIResult.imageUrl || fallbackImageUrl,
    imagePrompt: promptUsed,
    promptSummary: openAIResult.imageUrl
      ? context.usesWilma
        ? `Text-safe poster background generated, then canonical Wilma PNG composited by the app. Exact typography should be app-rendered, not image-generated.`
        : `Text-safe poster art generated with ${creativePlan.directionLabel}. Exact typography should be app-rendered, not image-generated.`
      : context.usesWilma && !wilmaBlocked
        ? `Composited preview using canonical Wilma asset. Final reference-anchored generation did not run: ${openAIResult.error}`
        : `Creative prompt ready, but final image generation did not run: ${openAIResult.error}`,
    assetBundleUsed: {
      assets: context.referenceAssets.map((asset) => ({ id: asset.id, name: asset.name, type: asset.assetType })),
      aspectRatio: context.aspectRatio,
      stylePresetId: creativePlan.stylePresetId,
      stylePresetName: creativePlan.styleProfile,
      imageVariant: creativePlan.imageVariant,
      imageVariantLabel: creativePlan.imageVariantLabel,
      watermark: {
        position: "none",
        mode: "none",
        logoAssetId: "23232323-2323-4232-8232-232323232323"
      }
    },
    rulesBundleUsed: {
      rules: context.rulesBundle.map((rule) => ({ id: rule.id, name: rule.name, group: rule.ruleGroup })),
      promptBlocks: context.promptBlocks
    },
    usesWilma: context.usesWilma,
    usesLogo: context.usesLogo,
    logoAssetId: context.logoAssetId,
    logoTypeUsed: context.logoTypeUsed,
    logoColorMode: context.logoColorMode,
    logoFidelityLocked: context.logoFidelityLocked,
    brandGuidelineVersionUsed: context.brandGuidelineVersionUsed,
    wilmaReferenceAssetIds: context.wilmaReferenceAssetIds,
    wilmaFidelityMode: context.wilmaFidelityMode,
    wilmaIdentityLocked: context.wilmaIdentityLocked,
    wilmaReferenceMode: context.usesWilma
      ? openAIResult.imageUrl
        ? "canonical_png_composited_after_generation"
        : wilmaBlocked
          ? "blocked_missing_canonical_reference"
          : "template_composited_from_approved_png"
      : "",
    logoReferenceMode: context.usesLogo
      ? "logo_not_generated_watermark_optional"
      : "",
    watermarkPosition: "none",
    watermarkMode: "none",
    watermarkLogoAssetId: "23232323-2323-4232-8232-232323232323",
    versionNumber,
    imageVersion: versionNumber,
    generationStatus: generatedAndPassed ? "generated" : "failed",
    imageStatus: generationMode,
    visualBucket: context.visualBucket,
    imageRiskLevel: context.imageRiskLevel,
    imageBrief: context.imageBrief,
    aspectRatio: context.aspectRatio,
    assetBundleKey: context.assetBundleKey,
    templateKey: openAIResult.imageUrl ? "none_creative_generation" : context.usesWilma && !wilmaBlocked ? designTemplateForPost(post, context) : "none_creative_generation",
    generationMode,
    styleProfile: creativePlan.styleProfile,
    stylePresetId: creativePlan.stylePresetId,
    imageVariant: creativePlan.imageVariant,
    imageVariantLabel: creativePlan.imageVariantLabel,
    imageVariantReason: creativePlan.imageVariantReason,
    negativePrompt: creativePlan.negativePrompt,
    styleGate,
    styleQualityLabel: styleGate.passed ? "Poster system" : "Needs regeneration",
    safeAreaStatus: "Needs visual check",
    textRenderingMode: "app_overlay_only",
    logoPolicy: "no_generated_logo_watermark_only",
    diversityProfile: {
      representationVariant: creativePlan.representationVariant,
      rule: "Vary race, ethnicity, gender, adult age, body type, and socioeconomic context over time without stereotypes or tokenizing."
    },
    creativeDirection: { ...creativePlan, prompt: promptUsed, styleGate, negativePrompt: creativePlan.negativePrompt },
    generationError,
    rateLimited: Boolean(openAIResult.rateLimited),
    rateLimitRetryAfterSeconds,
    rateLimitRetryAt,
    createdAt: new Date().toISOString()
  };
  await store.updatePost(postId, routedPatch);
  const nextState = await store.savePostImage(image);
  return { image, state: nextState };
}

async function setImageWatermark(postId, position = "none") {
  const allowedPositions = new Set(["none", "top-left", "top-right", "bottom-left", "bottom-right"]);
  if (!allowedPositions.has(position)) throw new Error("Unsupported watermark position.");
  const state = await store.readState();
  const image = (state.postImages || [])
    .filter((item) => item.postId === postId)
    .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0];
  if (!image) throw new Error("Generate or upload an image first.");
  const watermark = {
    position,
    mode: position === "none" ? "none" : "white_mark_overlay",
    logoAssetId: "23232323-2323-4232-8232-232323232323"
  };
  const patchedImage = {
    ...image,
    watermarkPosition: watermark.position,
    watermarkMode: watermark.mode,
    watermarkLogoAssetId: watermark.logoAssetId,
    assetBundleUsed: {
      ...(image.assetBundleUsed || {}),
      watermark
    },
    updatedAt: new Date().toISOString()
  };
  const nextState = await store.savePostImage(patchedImage);
  return {
    image: patchedImage,
    state: nextState,
    message: position === "none" ? "Watermark removed." : "Watermark position updated."
  };
}

async function finalizePostImage(postId) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const image = imageForPostFromState(state, postId);
  if (!image || image.generationStatus !== "generated") {
    throw new Error("Generate or upload an image before finalizing.");
  }
  if (!post.overlayConfirmed) {
    throw new Error("Confirm the overlay before baking the final PNG.");
  }
  const finalImage = await composeFinalPostImage(state, post, image);
  const bakedImage = {
    ...image,
    id: crypto.randomUUID(),
    imageUrl: finalImage.imageUrl,
    promptSummary: "Final composed image with approved app-rendered overlay text and watermark placement baked in for publishing.",
    versionNumber: finalImage.versionNumber,
    imageVersion: finalImage.versionNumber,
    generationStatus: "generated",
    imageStatus: "final_composited",
    generationMode: "final_composited_image",
    textRenderingMode: post.overlayMode === "none" ? "no_text_overlay" : "baked_overlay",
    finalImageReady: true,
    finalImageWidth: finalImage.width,
    finalImageHeight: finalImage.height,
    assetBundleUsed: {
      ...(image.assetBundleUsed || {}),
      finalImage: {
        ready: true,
        sourceImageId: image.id,
        url: finalImage.imageUrl,
        localPath: finalImage.localPath,
        fileSize: finalImage.fileSize,
        width: finalImage.width,
        height: finalImage.height,
        textRenderingMode: post.overlayMode === "none" ? "no_text_overlay" : "baked_overlay",
        createdAt: finalImage.generatedAt
      },
      selectedAssets: finalImage.selectedAssets
    },
    finalImageUrl: finalImage.imageUrl,
    finalPngUrl: finalImage.imageUrl,
    finalPngPath: finalImage.localPath,
    finalPngFileSize: finalImage.fileSize,
    finalPngGeneratedAt: finalImage.generatedAt,
    createdAt: finalImage.generatedAt
  };
  await store.savePostImage(bakedImage);
  const workflow = post.wilmaImageWorkflow || buildWilmaImageWorkflow(state, post);
	  const finalExportKit = {
	    ...buildFinalExportKit(post, bakedImage, workflow),
	    finalPngReady: true,
	    finalPngUrl: finalImage.imageUrl,
	    finalImageUrl: finalImage.imageUrl,
	    finalPngPath: finalImage.localPath,
	    finalPngFileSize: finalImage.fileSize,
	    finalPngGeneratedAt: finalImage.generatedAt,
	    finalPngDimensions: `${finalImage.width}x${finalImage.height}`,
	    exportFilename: safeDownloadFilename(buildFinalExportKit(post, bakedImage, workflow).exportFilename),
	    downloadUrl: `/api/posts/${encodeURIComponent(post.id)}/final-png`,
	    status: "ready",
	    updatedAt: finalImage.generatedAt
	  };
  const nextState = await store.updatePost(postId, {
    imageFinalized: true,
    finalPreviewConfirmed: false,
    finalPreviewConfirmedAt: "",
    finalPngUrl: finalImage.imageUrl,
	    finalImageUrl: finalImage.imageUrl,
	    finalPngPath: finalImage.localPath,
	    finalPngFileSize: finalImage.fileSize,
	    finalPngGeneratedAt: finalImage.generatedAt,
	    finalPngDimensions: `${finalImage.width}x${finalImage.height}`,
	    finalPngFilename: finalExportKit.exportFilename,
	    finalExportKit,
	    publishErrorSummary: ""
	  });
  return { state: nextState, image: bakedImage, finalImage, message: "Final PNG created. Download it from the export kit or confirm the preview." };
}

async function registerLocalAsset(input = {}) {
  const type = allowedAssetTypes.includes(input.type) ? input.type : "";
  if (!type) throw new Error("Choose a supported asset type.");
  const validation = await validateLocalAssetFile(input.filePath || input.path || "");
  if (!validation.ok) throw new Error(validation.message);
  const now = new Date().toISOString();
  const asset = {
    id: input.id || `asset-${slugify(type)}-${crypto.randomUUID().slice(0, 8)}`,
    type,
    label: String(input.label || path.basename(validation.filePath)).trim(),
    filePath: validation.filePath,
    downloadUrl: validation.downloadUrl,
    createdAt: input.createdAt || now,
    notes: String(input.notes || "").trim(),
    active: input.active !== false,
    fileSize: validation.fileSize
  };
  const state = await store.readState();
  const localAssets = [asset, ...(state.settings?.localAssets || []).filter((item) => item.id !== asset.id)];
  const nextState = await store.updateSettings({ localAssets });
  return { state: nextState, asset, message: "Asset registered." };
}

async function confirmFinalPreview(postId) {
  const state = await store.readState();
  const post = state.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Post not found.");
  const image = imageForPostFromState(state, postId);
  if (!image || image.generationStatus !== "generated") {
    throw new Error("Generate or upload an image before confirming preview.");
  }
  if (!post.imageFinalized) {
    throw new Error("Finalize the image before confirming preview.");
  }
  const nextState = await store.updatePost(postId, {
    finalPreviewConfirmed: true,
    finalPreviewConfirmedAt: new Date().toISOString(),
    publishErrorSummary: ""
  });
  return { state: nextState, message: "Final preview confirmed." };
}

const growthCollections = new Set([
  "milestones",
  "partners",
  "campaigns",
  "tasks",
  "pilots",
  "complianceItems",
  "reports",
  "dataRoomItems",
  "funnelSnapshots"
]);

function titleForGrowthItem(collection, item = {}) {
  return item.title || item.organizationName || item.campaignName || item.pilotName || item.itemTitle || item.reportTitle || item.id || collection;
}

function appendDaysIso(days = 3) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function growthTask({ title, relatedObjectType, relatedObjectId, dueDays = 3, owner = "Roger", priority = "Normal", suggestedAction = "", draftMessage = "" }) {
  return {
    id: `task-${slugify(relatedObjectType)}-${slugify(relatedObjectId)}-${slugify(title)}-${crypto.randomUUID().slice(0, 6)}`,
    title,
    relatedObjectType,
    relatedObjectId,
    dueDate: appendDaysIso(dueDays),
    owner,
    priority,
    status: "open",
    suggestedAction,
    draftMessage
  };
}

function automaticTasksForGrowthChange(collection, item = {}, previous = {}) {
  const tasks = [];
  const statusChanged = item.status && item.status !== previous.status;
  if (collection === "partners" && statusChanged) {
    if (item.status === "outreach_sent") {
      tasks.push(growthTask({
        title: `Follow up with ${item.organizationName || "partner"}`,
        relatedObjectType: "partner",
        relatedObjectId: item.id,
        dueDays: 3,
        owner: item.owner || "Roger",
        priority: item.priority || "Normal",
        suggestedAction: "Check whether they are open to a pilot or campaign conversation.",
        draftMessage: "Quick follow-up on the LegalEase / RecordShield note. Worth finding 20 minutes to see if this helps your community?"
      }));
    }
    if (item.status === "proposal_sent") {
      tasks.push(growthTask({
        title: `3-day proposal follow-up: ${item.organizationName || "partner"}`,
        relatedObjectType: "partner",
        relatedObjectId: item.id,
        dueDays: 3,
        owner: item.owner || "Roger",
        priority: item.priority || "High",
        suggestedAction: "Confirm whether the proposal is approved or needs edits.",
        draftMessage: "Checking in on the pilot proposal. Any questions I can answer so we can move into launch planning?"
      }));
      tasks.push(growthTask({
        title: `7-day proposal follow-up: ${item.organizationName || "partner"}`,
        relatedObjectType: "partner",
        relatedObjectId: item.id,
        dueDays: 7,
        owner: item.owner || "Roger",
        priority: item.priority || "High",
        suggestedAction: "Escalate to a clear yes/no decision or revised scope.",
        draftMessage: "Wanted to keep this from going stale. Should we revise the scope, schedule a quick call, or pause for now?"
      }));
    }
    if (item.status === "signed_pilot") {
      ["Confirm launch owner", "Approve campaign assets", "Activate tracking", "Schedule weekly reporting"].forEach((title, index) => {
        tasks.push(growthTask({
          title: `${title}: ${item.organizationName || "partner"}`,
          relatedObjectType: "partner",
          relatedObjectId: item.id,
          dueDays: index + 1,
          owner: item.owner || "Roger",
          priority: "High",
          suggestedAction: title
        }));
      });
    }
  }
  if (collection === "campaigns" && statusChanged && item.status === "live") {
    tasks.push(growthTask({
      title: `Review campaign metrics: ${item.campaignName || "campaign"}`,
      relatedObjectType: "campaign",
      relatedObjectId: item.id,
      dueDays: 7,
      owner: item.owner || "Growth",
      priority: "High",
      suggestedAction: "Capture referrals, RecordShield starts, Expungement.ai starts, and blockers."
    }));
  }
  if (collection === "pilots" && statusChanged && item.status === "live") {
    tasks.push(growthTask({
      title: `Weekly pilot report: ${item.pilotName || "pilot"}`,
      relatedObjectType: "pilot",
      relatedObjectId: item.id,
      dueDays: 7,
      owner: item.internalOwner || "Roger",
      priority: "High",
      suggestedAction: "Send weekly usage, risks, next actions, and proof-point status."
    }));
  }
  if (collection === "dataRoomItems" && item.status === "missing") {
    tasks.push(growthTask({
      title: `Add data room item: ${item.title || "missing item"}`,
      relatedObjectType: "data_room_item",
      relatedObjectId: item.id,
      dueDays: 2,
      owner: item.owner || "Operations",
      priority: "High",
      suggestedAction: "Create or upload this proof artifact."
    }));
  }
  return tasks;
}

async function upsertGrowthItem(collection, input = {}) {
  return serializeStateMutation(async () => {
    if (!growthCollections.has(collection)) throw new Error("Unsupported growth collection.");
    const state = await store.readState();
    const now = new Date().toISOString();
    const current = state[collection] || [];
    const id = input.id || `${slugify(collection)}-${crypto.randomUUID().slice(0, 8)}`;
    const previous = current.find((item) => item.id === id) || {};
    const item = { ...previous, ...input, id, updatedAt: now, createdAt: previous.createdAt || input.createdAt || now };
    const autoTasks = automaticTasksForGrowthChange(collection, item, previous);
    const activity = {
      id: `activity-${slugify(collection)}-${crypto.randomUUID().slice(0, 8)}`,
      eventType: previous.id ? `${collection} updated` : `${collection} added`,
      title: titleForGrowthItem(collection, item),
      relatedObjectType: collection,
      relatedObjectId: id,
      createdAt: now
    };
    const nextState = {
      ...state,
      [collection]: [item, ...current.filter((entry) => entry.id !== id)],
      tasks: collection === "tasks" ? [item, ...current.filter((entry) => entry.id !== id)] : [...autoTasks, ...(state.tasks || [])],
      activityEvents: [activity, ...(state.activityEvents || [])].slice(0, 500)
    };
    await store.writeState(nextState);
    return { state: nextState, item, tasks: autoTasks, activity, message: `${titleForGrowthItem(collection, item)} saved.` };
  });
}

function partnerName(state = {}, partnerId = "") {
  return (state.partners || []).find((item) => item.id === partnerId)?.organizationName || "Unlinked partner";
}

function campaignName(state = {}, campaignId = "") {
  return (state.campaigns || []).find((item) => item.id === campaignId)?.campaignName || "Unlinked campaign";
}

function campaignKitMarkdown(state = {}, campaign = {}) {
  const partner = partnerName(state, campaign.partnerId);
  const tracking = campaign.trackingSlug ? `https://legalease.example/${campaign.trackingSlug}` : "[tracking URL]";
  return {
    "campaign-overview.md": `# ${campaign.campaignName}\n\nPartner: ${partner}\nRegion: ${campaign.stateRegion || "TBD"}\nGoal: Help people understand RecordShield and the next step toward Expungement.ai when appropriate.\n\nTracking URL: ${tracking}\n\nStatus: ${campaign.status || "draft"}\n`,
    "landing-page-copy.md": `# Landing Page Copy\n\nUnderstand what may be on your record and what options may be available.\n\nRecordShield helps you get a clearer picture before you decide what to do next.\n\nThis is general information, not legal advice. Rules vary by state and case.\n`,
    "email-announcement.txt": `Subject: New RecordShield resource for ${partner}\n\nHi [Name],\n\nWe're sharing a new plain-English RecordShield resource to help community members understand what may be on their record and what options may be available.\n\nStart here: ${tracking}\n\nThis is general information, not legal advice. Rules vary by state and case.\n`,
    "sms-copy.txt": `Need help understanding what may be on your record? Start with RecordShield: ${tracking} General info only; rules vary by state and case.`,
    "social-posts.md": `# Social Post Drafts\n\n1. Old records can create new barriers. RecordShield helps you understand what may be on your record and what options may be available. ${tracking}\n\n2. Second chances should be easier to understand. Start with a plain-English RecordShield check. ${tracking}\n\n3. Not sure where to begin with record clearance questions? RecordShield can help you organize the first step. ${tracking}\n\n4. Community access starts with clear information. Share RecordShield with people who need a practical starting point. ${tracking}\n\n5. This is not legal advice. It is a clearer first step. RecordShield helps explain what may come next. ${tracking}\n`,
    "flyer-copy.md": `# Flyer Copy\n\nSecond chances should not require a secret decoder ring.\n\nUse RecordShield to better understand what may be on your record and what options may be available.\n\nStart here: ${tracking}\n\nGeneral information only. Rules vary by state and case. A court makes the final decision.\n`,
    "faq.md": `# FAQ\n\n## Is this legal advice?\nNo. This is general information to help people understand possible next steps.\n\n## Does this guarantee eligibility or an outcome?\nNo. Rules vary by state and case. A court makes the final decision.\n\n## What happens after RecordShield?\nSome people may choose to start an Expungement.ai intake or talk with a qualified legal provider.\n`,
    "staff-talking-points.md": `# Staff Talking Points\n\n- RecordShield is a plain-English starting point.\n- Do not promise eligibility, filing success, or court outcomes.\n- Encourage people to review their information carefully.\n- Use the tracking URL so campaign performance can be measured.\n`,
    "disclaimers.md": `# Disclaimers\n\nGeneral information only. Not legal advice. Rules vary by state and case. A court makes the final decision. LegalEase does not guarantee eligibility, filing acceptance, court approval, employment, housing, or any legal outcome.\n`
  };
}

async function generateCampaignKit(campaignId = "") {
  return serializeStateMutation(async () => {
    const state = await store.readState();
    const campaign = (state.campaigns || []).find((item) => item.id === campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    const date = localDateSlug();
    const relativeDir = `data/exports/campaign-kits/${safePackageSegment(campaign.id)}-${date}`;
    const outputDir = path.resolve(process.cwd(), relativeDir);
    if (!outputDir.startsWith(path.resolve(process.cwd(), "data/exports/campaign-kits"))) throw new Error("Unsafe campaign kit path.");
    await mkdir(outputDir, { recursive: true });
    const files = campaignKitMarkdown(state, campaign);
    for (const [filename, body] of Object.entries(files)) await writeFile(path.join(outputDir, filename), body);
    const metadata = {
      campaignId: campaign.id,
      campaignName: campaign.campaignName,
      partnerId: campaign.partnerId,
      partnerName: partnerName(state, campaign.partnerId),
      trackingSlug: campaign.trackingSlug,
      generatedAt: new Date().toISOString(),
      livePostingStatus: "disabled/manual-only",
      files: [...Object.keys(files), "metadata.json"]
    };
    await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2));
    const kit = {
      id: `campaign-kit-${slugify(campaign.id)}-${crypto.randomUUID().slice(0, 6)}`,
      campaignId: campaign.id,
      partnerId: campaign.partnerId,
      path: relativeDir,
      generatedAt: metadata.generatedAt,
      files: metadata.files,
      status: "generated"
    };
    const nextState = {
      ...state,
      campaignKits: [kit, ...(state.campaignKits || [])],
      campaigns: (state.campaigns || []).map((item) => item.id === campaign.id ? { ...item, latestCampaignKitPath: relativeDir, latestCampaignKitAt: metadata.generatedAt } : item),
      activityEvents: [{ id: `activity-campaign-kit-${crypto.randomUUID().slice(0, 8)}`, eventType: "Campaign kit generated", title: campaign.campaignName, relatedObjectType: "campaign", relatedObjectId: campaign.id, createdAt: metadata.generatedAt }, ...(state.activityEvents || [])].slice(0, 500)
    };
    await store.writeState(nextState);
    return { state: nextState, kit, metadata, message: "Campaign kit generated." };
  });
}

function reportBody(state = {}, reportType = "weekly_internal") {
  const openTasks = (state.tasks || []).filter((task) => task.status === "open");
  const atRisk = (state.milestones || []).filter((item) => ["at_risk", "needs_attention"].includes(item.status));
  const liveCampaigns = (state.campaigns || []).filter((item) => item.status === "live" || item.status === "ready");
  const pilots = state.pilots || [];
  const funnel = state.funnelSnapshots || [];
  const posted = (state.posts || []).filter((post) => post.manuallyPostedAt || post.postedAt || post.publishedAt);
  return `# ${reportType.replaceAll("_", " ")}\n\nGenerated: ${new Date().toISOString()}\n\n## Milestones needing attention\n${atRisk.map((item) => `- ${item.title}: ${item.status}. Next: ${item.nextAction}`).join("\n") || "- None"}\n\n## Partner pipeline\n${(state.partners || []).map((item) => `- ${item.organizationName}: ${item.status}; next follow-up ${item.nextFollowUpDate || "TBD"}`).join("\n") || "- No partners yet"}\n\n## Campaigns\n${liveCampaigns.map((item) => `- ${item.campaignName}: ${item.status}; ${item.actualReferrals || 0}/${item.targetReferrals || 0} referrals`).join("\n") || "- No active campaigns"}\n\n## RecordShield funnel\n${funnel.map((item) => `- ${campaignName(state, item.campaignId)}: ${item.recordShieldStarts || 0} starts, ${item.expungementIntakeStarted || 0} Expungement.ai starts, $${item.revenue || 0} revenue`).join("\n") || "- No funnel data"}\n\n## Pilots\n${pilots.map((item) => `- ${item.pilotName}: ${item.status}; next ${item.nextAction || "TBD"}`).join("\n") || "- No pilots"}\n\n## Published content\n- Posted items: ${posted.length}\n- Posts needing metrics: ${posted.filter((post) => !post.performanceUpdatedAt).length}\n\n## Risks and next actions\n${openTasks.slice(0, 12).map((task) => `- ${task.title} (${task.dueDate || "no due date"})`).join("\n") || "- No open tasks"}\n`;
}

async function exportGrowthReport(reportType = "weekly_internal") {
  return serializeStateMutation(async () => {
    const state = await store.readState();
    const now = new Date().toISOString();
    const filename = `${slugify(reportType)}-${now.slice(0, 10)}-${crypto.randomUUID().slice(0, 6)}`;
    const relativeDir = "data/exports/reports";
    const outputDir = path.resolve(process.cwd(), relativeDir);
    if (!outputDir.startsWith(path.resolve(process.cwd(), "data/exports/reports"))) throw new Error("Unsafe report path.");
    await mkdir(outputDir, { recursive: true });
    const body = reportBody(state, reportType);
    await writeFile(path.join(outputDir, `${filename}.md`), body);
    await writeFile(path.join(outputDir, `${filename}.txt`), body.replace(/^#/gm, ""));
    const report = {
      id: `report-${filename}`,
      reportTitle: reportType.replaceAll("_", " "),
      reportType,
      markdownPath: `${relativeDir}/${filename}.md`,
      textPath: `${relativeDir}/${filename}.txt`,
      generatedAt: now,
      status: "exported"
    };
    const nextState = {
      ...state,
      reports: [report, ...(state.reports || [])],
      activityEvents: [{ id: `activity-report-${crypto.randomUUID().slice(0, 8)}`, eventType: "Report exported", title: report.reportTitle, relatedObjectType: "report", relatedObjectId: report.id, createdAt: now }, ...(state.activityEvents || [])].slice(0, 500)
    };
    await store.writeState(nextState);
    return { state: nextState, report, message: "Report exported." };
  });
}

function htmlShell() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LegalEase Social Command Center</title>
  <style>
    :root { --ink:#020D66; --paper:#E5EBEB; --line:#B8D8D8; --moss:#536b4e; --steel:#3040BF; --rust:#F04800; --gold:#F98C30; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font-family:"DM Sans",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .shell { min-height:100vh; }
    aside { background:white; border-bottom:1px solid var(--line); position:sticky; top:0; z-index:8; min-height:66px; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:0 28px; }
    .brand { padding:0; min-width:220px; }
    .brand small, .eyebrow { color:var(--rust); font-weight:800; letter-spacing:.18em; text-transform:uppercase; font-size:11px; }
    .brand h1 { margin:3px 0 0; font-size:17px; }
    nav { padding:0; display:flex; gap:6px; align-items:center; }
    nav a { color:#596070; text-decoration:none; padding:9px 11px; border-radius:6px; font-size:14px; font-weight:650; }
    nav a.active, nav a:hover { background:var(--ink); color:white; }
    header { display:none; }
    header .eyebrow, header h2 { display:none; }
    main { padding:22px 28px 48px; max-width:1240px; margin:0 auto; }
    .grid { display:grid; gap:16px; }
    .kpis { grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); }
    .layout { grid-template-columns:1.05fr .95fr; align-items:start; margin-top:22px; }
    .command { grid-template-columns:1fr; align-items:stretch; }
    .post-grid { grid-template-columns:1fr; }
    .three { grid-template-columns:repeat(3,minmax(220px,1fr)); }
    .two { grid-template-columns:repeat(2,minmax(240px,1fr)); }
    .panel,.card { background:white; border:1px solid var(--line); border-radius:8px; box-shadow:0 1px 2px rgba(31,36,48,.08); }
    .panel,.card { padding:16px; }
    .hero-panel { padding:18px 20px; display:grid; gap:14px; }
    .queue-card { display:grid; grid-template-columns:minmax(0,1fr); gap:14px; align-items:start; padding:18px; }
    .queue-content { min-width:0; display:grid; gap:12px; align-content:start; }
    .image-stage { display:grid; gap:10px; position:sticky; top:88px; }
    .image-stage-title { display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .image-stage-title strong { font-size:14px; }
    .image-stage-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .image-stage-actions .wide-action { grid-column:1 / -1; }
    .image-detail-toggle { border:1px solid var(--line); border-radius:8px; padding:10px 12px; background:rgba(229,235,235,.32); }
    .image-detail-toggle summary { cursor:pointer; font-weight:850; color:var(--ink); }
    .quick-meta { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
	    .queue-title { margin:0; font-size:22px; line-height:1.12; letter-spacing:0; }
    .queue-hook { margin:0; font-size:16px; line-height:1.35; color:#202434; }
    .queue-excerpt { margin:0; color:#596070; font-size:14px; line-height:1.5; }
	    .next-action-card { border:1px solid var(--line); border-radius:8px; padding:10px 12px; background:rgba(229,235,235,.28); display:grid; gap:8px; }
    .next-action-card .primary { min-height:48px; font-size:13px; }
    .compact-toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-top:2px; }
    .compact-toolbar .quiet { min-height:32px; font-size:11px; }
    .details-grid { display:grid; gap:12px; margin-top:12px; }
    .metric { border-top:3px solid var(--line); padding-top:8px; min-width:0; }
    .kpi-label { color:#737988; font-size:14px; font-weight:650; }
    .kpi-value { margin-top:4px; font-size:25px; font-weight:760; }
    .kpi-detail,.muted { color:#6f7684; font-size:13px; }
    .big-title { margin:0; font-size:28px; letter-spacing:0; }
    .big-copy { color:#4e5664; max-width:760px; margin:8px 0 0; }
    h3 { margin:10px 0 0; font-size:16px; }
    p { line-height:1.55; }
    .toprow,.row { display:flex; justify-content:space-between; gap:12px; align-items:start; }
    .row { align-items:center; flex-wrap:wrap; }
    .badge { display:inline-flex; align-items:center; min-height:24px; border:1px solid var(--line); border-radius:4px; padding:3px 8px; font-size:12px; font-weight:700; margin:0 5px 6px 0; text-transform:capitalize; }
    .store-pill { display:inline-flex; align-items:center; min-height:30px; border:1px solid rgba(66,100,116,.28); border-radius:6px; background:rgba(66,100,116,.1); color:var(--steel); padding:5px 10px; font-size:12px; font-weight:800; white-space:nowrap; }
    .info { background:rgba(66,100,116,.1); color:var(--steel); border-color:rgba(66,100,116,.28); }
    .warn { background:rgba(184,136,59,.12); color:#76521d; border-color:rgba(184,136,59,.35); }
    .good { background:rgba(83,107,78,.12); color:var(--moss); border-color:rgba(83,107,78,.3); }
    .danger { background:rgba(154,79,58,.12); color:var(--rust); border-color:rgba(154,79,58,.35); }
    button,.button { border:1px solid var(--line); background:white; border-radius:6px; min-height:34px; padding:0 11px; font-weight:750; cursor:pointer; color:var(--ink); }
    button:hover,.button:hover { background:var(--paper); }
    button:disabled { opacity:.45; cursor:not-allowed; background:white; color:#6f7684; }
    .primary { background:var(--ink); color:white; border:0; }
    .primary:disabled { background:#cbd5d6; color:#596070; }
    .wide { width:100%; justify-content:center; min-height:42px; }
    .danger-btn { background:rgba(154,79,58,.1); color:var(--rust); border-color:rgba(154,79,58,.28); }
    form { display:grid; gap:12px; }
    label { font-size:13px; font-weight:750; display:grid; gap:6px; }
    input,textarea,select { width:100%; border:1px solid var(--line); border-radius:6px; padding:10px; font:inherit; background:white; color:var(--ink); }
    button { font-family:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; letter-spacing:0; }
    textarea { min-height:90px; resize:vertical; }
    .split { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .post-body { white-space:pre-wrap; color:#4e5664; font-size:14px; }
	    .image-preview { margin:0; border:1px solid var(--line); background:#0f1723; border-radius:8px; min-height:260px; aspect-ratio:1 / 1; display:grid; place-items:center; overflow:hidden; }
	    .image-frame { position:relative; width:100%; height:100%; min-height:260px; display:grid; place-items:center; background:#0f1723; }
    .image-preview img.poster-image { width:100%; height:100%; object-fit:contain; display:block; }
    .poster-overlay { position:absolute; inset:8%; display:flex; flex-direction:column; justify-content:space-between; pointer-events:none; color:white; text-shadow:0 2px 16px rgba(0,0,0,.42); }
    .poster-overlay .kicker { width:max-content; max-width:82%; font-family:"DM Sans",Arial,sans-serif; font-size:11px; font-weight:900; letter-spacing:2.4px; text-transform:uppercase; color:#F04800; background:rgba(2,13,102,.78); border:1px solid rgba(255,255,255,.18); border-radius:4px; padding:6px 8px; }
    .poster-overlay .headline { max-width:78%; font-family:"DM Sans",Arial,sans-serif; font-size:clamp(24px,4.2vw,54px); line-height:.98; font-weight:900; text-transform:uppercase; letter-spacing:0; color:#fff; }
    .poster-overlay .support { max-width:72%; font-family:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace; font-size:clamp(11px,1.3vw,16px); line-height:1.35; color:#E5EBEB; background:rgba(2,13,102,.62); border-left:4px solid #F04800; padding:8px 10px; }
    .safe-frame { position:absolute; inset:6%; border:1px dashed rgba(255,255,255,.36); border-radius:4px; pointer-events:none; opacity:.6; }
    .watermark-logo { position:absolute; width:min(15%,84px); max-height:44px; object-fit:contain; opacity:.84; filter:drop-shadow(0 8px 18px rgba(0,0,0,.36)); pointer-events:none; }
    .watermark-top-left { left:16px; top:16px; }
    .watermark-top-right { right:16px; top:16px; }
    .watermark-bottom-left { left:16px; bottom:16px; }
    .watermark-bottom-right { right:16px; bottom:16px; }
    .image-empty { padding:28px; text-align:center; color:#E5EBEB; }
    .readiness-card { margin:12px 0; border:1px solid var(--line); border-radius:8px; background:rgba(229,235,235,.45); padding:12px; display:grid; gap:8px; }
    .readiness-card.good { border-color:rgba(83,107,78,.28); background:rgba(83,107,78,.08); }
    .readiness-card.warn { border-color:rgba(184,136,59,.32); background:rgba(184,136,59,.08); }
    .readiness-card.danger { border-color:rgba(154,79,58,.3); background:rgba(154,79,58,.08); }
    .readiness-title { font-weight:900; color:var(--ink); }
    .readiness-list { margin:0; padding-left:18px; color:#4e5664; font-size:13px; }
    .review-strip { grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
    .review-card { display:grid; gap:12px; }
    .review-card .image-preview { min-height:150px; }
    .review-meta { display:grid; gap:6px; padding:10px; border:1px solid var(--line); border-radius:8px; background:rgba(229,235,235,.38); }
    .review-caption { max-height:120px; overflow:auto; border-left:3px solid var(--rust); padding-left:10px; }
    .operator-review { display:grid; grid-template-columns:minmax(300px,.85fr) minmax(380px,1.15fr); gap:16px; align-items:stretch; }
    .operator-copy { display:grid; gap:12px; align-content:start; }
    .operator-copy h2 { margin:0; font-size:28px; line-height:1.05; letter-spacing:0; }
    .operator-preview { min-height:100%; display:grid; gap:12px; align-content:start; }
    .operator-preview .image-preview { min-height:420px; }
    .operator-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .operator-actions button { min-height:46px; }
    .operator-actions .primary-action { grid-column:1 / -1; min-height:54px; font-size:13px; }
    .review-progress { display:flex; justify-content:space-between; gap:10px; align-items:center; padding:10px 0 2px; border-bottom:1px solid var(--line); margin-bottom:12px; }
    .operator-next { border:1px solid var(--line); border-radius:8px; padding:12px; background:rgba(229,235,235,.38); display:grid; gap:8px; }
    .operator-next.good { border-color:rgba(83,107,78,.28); background:rgba(83,107,78,.08); }
    .operator-next.warn { border-color:rgba(184,136,59,.32); background:rgba(184,136,59,.08); }
    .operator-next.danger { border-color:rgba(154,79,58,.3); background:rgba(154,79,58,.08); }
    .operator-edit { margin-top:0; }
    .operator-edit summary { cursor:pointer; font-weight:850; }
    .setup-list { margin:8px 0 0; padding-left:18px; color:#4e5664; font-size:13px; }
    .setup-item { border:1px solid var(--line); border-radius:8px; padding:12px; background:rgba(229,235,235,.36); }
    .setup-item.good { border-color:rgba(83,107,78,.28); background:rgba(83,107,78,.08); }
    .setup-item.warn { border-color:rgba(184,136,59,.32); background:rgba(184,136,59,.08); }
    .section { margin-top:18px; scroll-margin-top:90px; }
    .page-section { display:none; }
    .page-section.active { display:grid; }
    .secondary details { background:white; border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
    .secondary summary { cursor:pointer; font-weight:850; }
    .calendar { grid-template-columns:repeat(7,minmax(130px,1fr)); }
    .day { min-height:170px; padding:12px; }
    .day-title { padding-bottom:8px; border-bottom:1px solid var(--line); font-weight:800; }
    .mini { margin-top:8px; background:var(--paper); border:1px solid var(--line); border-radius:6px; padding:8px; font-size:12px; }
    .steps { display:grid; gap:10px; }
    .step { display:grid; grid-template-columns:28px 1fr; gap:10px; align-items:start; }
    .step-number { display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:var(--ink); color:white; font-size:13px; font-weight:800; }
    .toolbar { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 16px; }
    .daily-control-bar { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; border:1px solid var(--line); border-radius:8px; background:white; padding:10px 12px; color:#4e5664; }
    .daily-control-bar strong { color:var(--ink); }
    .daily-control-bar span:not(:last-child)::after { content:"·"; margin-left:12px; color:#9aa2ad; }
	    .simple-status-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .simple-status-pill { font-size:13px; font-weight:900; min-height:28px; }
    .why-line { margin:0; color:#76521d; font-size:13px; font-weight:700; }
    .channel-grid { grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); }
    .channel-card { display:grid; gap:12px; align-content:start; }
    .channel-card h3 { margin:0; }
    .channel-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .wilma-workflow { display:grid; gap:14px; padding:14px; border:1px solid rgba(66,100,116,.18); border-radius:8px; background:#fffdfa; }
    .wilma-workflow h3 { margin:3px 0 0; }
    .wilma-grid { display:grid; grid-template-columns:minmax(260px,.9fr) minmax(300px,1.1fr); gap:14px; align-items:stretch; }
    .wilma-controls { display:grid; gap:10px; align-content:start; }
    .wilma-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .wilma-actions button { min-height:38px; }
    .button-link { display:inline-flex; align-items:center; justify-content:center; min-height:38px; padding:8px 12px; border:1px solid var(--ink); border-radius:6px; text-decoration:none; color:var(--ink); font-weight:800; font-size:12px; }
    .button-link.primary { background:var(--ink); color:white; }
    .wilma-preview { min-height:260px; }
    .wilma-preview .image-frame { min-height:260px; }
    .wilma-preview-card { min-height:260px; display:grid; place-items:center; text-align:center; gap:12px; padding:22px; border:1px dashed rgba(66,100,116,.32); border-radius:8px; background:linear-gradient(135deg,#f7f3ea,#fff); color:var(--ink); }
    .wilma-preview-card p { margin:8px 0 2px; color:var(--muted); }
    .wilma-preview-card small { color:var(--muted); }
    .preview-disc { width:112px; height:112px; border-radius:999px; background:radial-gradient(circle at 38% 32%, #fff 0 16%, #d8d3c8 17% 48%, #f47c20 49% 64%, #111 65% 100%); box-shadow:0 16px 36px rgba(17,17,17,.16); }
    .safety-review { display:grid; gap:10px; padding:12px; border:1px solid var(--line); border-radius:8px; background:rgba(229,235,235,.34); }
    .safety-review.good { border-color:rgba(83,107,78,.28); background:rgba(83,107,78,.08); }
    .safety-review.warn { border-color:rgba(184,136,59,.32); background:rgba(184,136,59,.08); }
    .safety-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; }
    .safety-grid div { display:grid; gap:4px; align-content:start; }
    .blocked-reason { border-top:1px solid rgba(66,100,116,.18); padding-top:8px; }
    .blocked-reason ul { margin:6px 0 0; padding-left:18px; color:var(--muted); }
    .wilma-details textarea { min-height:130px; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; }
    .prompt-output { display:grid; gap:7px; margin:10px 0; }
    .prompt-row { display:grid; grid-template-columns:150px 1fr; gap:10px; padding:8px 0; border-bottom:1px solid rgba(66,100,116,.12); }
    .prompt-row strong { text-transform:capitalize; color:var(--muted); }
    .compact-list, .export-checklist { margin:10px 0 0; padding-left:18px; }
    .compact-list li, .export-checklist li { margin:5px 0; color:var(--muted); }
    .export-checklist { list-style:none; padding-left:0; }
    .export-checklist li { display:flex; gap:8px; align-items:flex-start; }
    .export-checklist li.done { color:var(--ink); font-weight:700; }
    .export-checklist span { min-width:34px; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color:var(--orange); }
    .final-export-kit { display:grid; gap:14px; padding:14px; border:1px solid var(--line); border-radius:8px; background:rgba(229,235,235,.34); }
    .final-export-kit.good { border-color:rgba(83,107,78,.3); background:rgba(83,107,78,.08); }
    .final-export-kit.warn { border-color:rgba(184,136,59,.34); background:rgba(184,136,59,.08); }
    .final-export-kit h3 { margin:3px 0 0; }
    .export-grid { display:grid; grid-template-columns:minmax(280px,.95fr) minmax(320px,1.05fr); gap:14px; align-items:start; }
    .export-preview { display:grid; gap:10px; }
    .export-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .export-meta { display:grid; gap:10px; align-content:start; }
    .export-meta code { white-space:normal; overflow-wrap:anywhere; color:var(--ink); }
    .export-copy-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .export-copy-grid > div { border:1px solid rgba(66,100,116,.16); border-radius:8px; background:white; padding:10px; display:grid; gap:8px; align-content:start; }
    .posted-summary { grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); }
    .posted-card { display:grid; gap:14px; }
    .archive-grid { display:grid; grid-template-columns:minmax(280px,.85fr) minmax(320px,1.15fr); gap:14px; }
    .archive-meta { display:grid; gap:8px; align-content:start; }
    .performance-form { display:grid; gap:10px; }
    .performance-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; }
    .performance-metrics input { min-width:0; }
    .repurpose-marker { border-color:rgba(83,107,78,.38); background:rgba(83,107,78,.12); }
    .repurpose-panel { border:1px solid rgba(83,107,78,.34); border-radius:8px; background:rgba(255,255,255,.78); padding:12px; display:grid; gap:10px; }
    .repurpose-panel h4 { margin:2px 0; }
    .repurpose-history { border-top:1px solid rgba(66,100,116,.16); padding-top:8px; }
    .repurpose-history code { white-space:normal; overflow-wrap:anywhere; }
    .queue-filter { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:12px; }
    .source-summary { grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
    .source-card { display:grid; gap:12px; }
    .source-routing { border:1px solid rgba(66,100,116,.16); border-radius:8px; background:rgba(229,235,235,.3); padding:10px; }
    .source-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .secondary-action { background:white; color:var(--ink); border-color:var(--line); }
    .simple-meta { color:#596070; font-size:13px; line-height:1.5; margin:0; }
	    .card-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
	    .quiet-actions button { min-height:32px; font-size:11px; }
    .queue-content > .advanced-card-details, .image-stage.advanced-card-details { display:none; }
    .source-filter { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:12px 0; }
    .tabs { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0 16px; }
    .tab { border-color:rgba(66,100,116,.28); background:rgba(66,100,116,.08); }
    .tab.active { background:var(--ink); color:white; }
    .toast { position:fixed; right:20px; bottom:20px; background:var(--ink); color:white; padding:12px 14px; border-radius:7px; opacity:0; transform:translateY(8px); transition:.2s; z-index:10; }
    .toast.show { opacity:1; transform:translateY(0); }
    :root {
      --paper:#F6F7F5;
      --surface:#FFFFFF;
      --surface-soft:#F2F5F4;
      --line:#DCE5E3;
      --ink:#08145F;
      --text:#172033;
      --muted:#667085;
      --accent:#F15A24;
      --success:#2F6B4F;
      --warning:#9A6A19;
      --danger:#B42318;
      --shadow:0 18px 45px rgba(16,24,40,.08);
    }
    body { background:linear-gradient(180deg,#F9FAF7 0,#EEF4F3 100%); color:var(--text); }
    aside { min-height:72px; padding:0 32px; background:rgba(255,255,255,.9); backdrop-filter:blur(18px); box-shadow:0 1px 0 rgba(16,24,40,.05); }
    .brand h1 { color:var(--ink); font-size:18px; letter-spacing:0; }
    .brand small, .eyebrow { color:var(--accent); letter-spacing:.12em; }
    nav { gap:4px; }
    .nav-group { display:flex; align-items:center; gap:4px; padding-left:8px; border-left:1px solid rgba(8,20,95,.08); }
    .nav-group:first-child { border-left:0; padding-left:0; }
    .nav-label { color:#98A2B3; font-size:10px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; padding:0 4px; }
    nav a { border-radius:999px; padding:10px 14px; color:#475467; font-weight:750; }
    nav a.active, nav a:hover { background:#08145F; color:white; }
    main { max-width:1040px; padding-top:28px; }
    .panel,.card { border-color:rgba(8,20,95,.08); border-radius:14px; box-shadow:var(--shadow); background:rgba(255,255,255,.96); }
    .panel,.card { padding:20px; }
    .hero-panel { border:0; box-shadow:none; background:transparent; padding:4px 2px 10px; gap:8px; }
    .big-title { font-size:32px; line-height:1.05; color:var(--ink); letter-spacing:0; }
    .big-copy { color:var(--muted); font-size:15px; max-width:680px; }
    .daily-control-bar { border:0; border-radius:16px; background:#08145F; color:rgba(255,255,255,.78); padding:14px 16px; box-shadow:0 16px 36px rgba(8,20,95,.16); }
    .daily-control-bar strong { color:white; }
    .daily-control-bar span:not(:last-child)::after { color:rgba(255,255,255,.45); }
    .queue-filter { margin:14px 0 6px; }
    .queue-filter button, .tabs .tab, .source-filter button { border-radius:999px; min-height:38px; background:white; border-color:rgba(8,20,95,.1); color:#475467; text-transform:none; font-family:inherit; font-weight:800; }
    .queue-filter button.primary, .tabs .tab.active { background:#08145F; color:white; }
    .queue-card { padding:22px; gap:14px; border-radius:18px; }
    .queue-title { font-size:24px; line-height:1.12; color:var(--ink); max-width:820px; }
    .simple-meta { color:var(--muted); font-size:14px; }
    .simple-status-row .badge.info { display:none; }
    .queue-card .simple-status-row .badge.info { display:inline-flex; }
    .badge { border-radius:999px; min-height:26px; padding:4px 10px; font-size:12px; font-weight:850; }
    .simple-status-pill { font-size:13px; min-height:30px; padding:5px 12px; }
    .good { background:rgba(47,107,79,.1); color:var(--success); border-color:rgba(47,107,79,.2); }
    .warn { background:rgba(154,106,25,.1); color:var(--warning); border-color:rgba(154,106,25,.22); }
    .danger { background:rgba(180,35,24,.1); color:var(--danger); border-color:rgba(180,35,24,.22); }
    .next-action-card { border:0; border-radius:16px; padding:14px; background:#F4F7F6; gap:10px; }
    .next-action-card .row span { display:none; }
    .next-action-card strong { font-size:15px; color:var(--ink); }
    .next-action-card .primary { min-height:52px; border-radius:12px; font-size:15px; font-family:inherit; text-transform:none; }
    button,.button,.button-link { border-radius:10px; font-family:inherit; text-transform:none; letter-spacing:0; font-weight:800; }
    .primary, .button-link.primary { background:#08145F; color:white; box-shadow:0 10px 20px rgba(8,20,95,.16); }
    button:hover,.button:hover,.button-link:hover { transform:translateY(-1px); }
    button:disabled { transform:none; }
    .readiness-card { border-radius:14px; margin:10px 0; padding:12px 14px; background:#F7FAF9; }
    .readiness-card.asset-download, .manual-ready-note { display:none; }
    .compact-download .row { align-items:center; }
    .image-detail-toggle { border:0; border-radius:14px; padding:0; background:transparent; }
    .image-detail-toggle summary { list-style:none; display:inline-flex; align-items:center; justify-content:center; min-height:38px; border:1px solid rgba(8,20,95,.12); border-radius:999px; background:white; padding:0 14px; color:#475467; font-size:13px; font-weight:850; }
    .image-detail-toggle summary::-webkit-details-marker { display:none; }
    .image-detail-toggle[open] { padding-top:6px; }
    .image-detail-toggle[open] summary { margin-bottom:12px; }
    .toolbar { align-items:center; }
    .toolbar-more { position:relative; }
    .toolbar-more summary { list-style:none; display:inline-flex; align-items:center; min-height:38px; border:1px solid rgba(8,20,95,.12); border-radius:999px; background:white; padding:0 14px; color:#475467; font-size:13px; font-weight:850; cursor:pointer; }
    .toolbar-more summary::-webkit-details-marker { display:none; }
    .toolbar-more[open] { border:0; }
    .toolbar-more[open] .card-actions { position:absolute; z-index:9; right:0; min-width:220px; padding:12px; border:1px solid rgba(8,20,95,.1); border-radius:14px; background:white; box-shadow:var(--shadow); }
    .image-preview { border-radius:14px; border-color:rgba(8,20,95,.1); background:#111827; }
    .wilma-workflow,.final-export-kit,.source-routing,.repurpose-panel,.safety-review,.setup-item { border-radius:14px; border-color:rgba(8,20,95,.1); }
    .source-card,.posted-card,.channel-card { border-radius:16px; }
    .source-actions button, .card-actions button, .channel-actions button { min-height:38px; }
    .muted,.kpi-detail { color:var(--muted); }
    code { color:#344054; background:#F2F4F7; border-radius:6px; padding:1px 4px; }
    .empty { border:1px dashed rgba(8,20,95,.14); border-radius:16px; background:#fff; color:var(--muted); padding:24px; text-align:center; }
    input,textarea,select { border-radius:10px; border-color:rgba(8,20,95,.12); }
    input:focus,textarea:focus,select:focus,button:focus-visible,a:focus-visible,summary:focus-visible { outline:3px solid rgba(241,90,36,.22); outline-offset:2px; }
    .toast { border-radius:12px; background:#08145F; box-shadow:0 18px 44px rgba(8,20,95,.2); }
    .loading-panel { display:grid; gap:14px; box-shadow:none; border:0; background:transparent; }
    .loading-line, .loading-card { position:relative; overflow:hidden; border-radius:999px; background:#E6ECEB; }
    .loading-line { width:54%; height:18px; }
    .loading-line.wide { width:76%; height:34px; }
    .loading-card { height:180px; border-radius:18px; background:white; box-shadow:var(--shadow); }
    .loading-line::after, .loading-card::after { content:""; position:absolute; inset:0; transform:translateX(-100%); background:linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent); animation:loadingSweep 1.2s infinite; }
    @keyframes loadingSweep { to { transform:translateX(100%); } }
    .mission-grid { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr); gap:18px; align-items:stretch; }
    .executive-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .mission-card { background:#08145F; color:white; border:0; box-shadow:0 24px 60px rgba(8,20,95,.18); }
    .mission-card .big-title,.mission-card h1,.mission-card h2 { color:white; }
    .mission-card .muted,.mission-card .big-copy { color:rgba(255,255,255,.72); }
    .status-dot { display:inline-flex; width:8px; height:8px; border-radius:999px; background:currentColor; margin-right:7px; }
    .readiness-strip { display:grid; grid-template-columns:repeat(7,minmax(120px,1fr)); gap:10px; }
    .strip-card,.pipeline-step,.health-card,.priority-item,.metric-row,.activity-item { border:1px solid rgba(8,20,95,.08); background:rgba(255,255,255,.94); border-radius:16px; padding:14px; }
    .strip-card strong { display:block; color:var(--ink); font-size:24px; line-height:1; }
    .strip-card span,.pipeline-step span,.health-card span { color:var(--muted); font-size:12px; font-weight:800; }
    .pipeline-board { display:grid; grid-template-columns:repeat(8,minmax(104px,1fr)); gap:10px; }
    .pipeline-step { min-height:96px; display:flex; flex-direction:column; justify-content:space-between; }
    .pipeline-step strong { color:var(--ink); font-size:22px; }
    .health-grid { display:grid; grid-template-columns:repeat(5,minmax(150px,1fr)); gap:12px; }
    .health-card { min-height:150px; }
    .health-card h3,.priority-item h3 { margin:8px 0 4px; color:var(--ink); }
    .priority-list,.activity-list,.metric-table { display:grid; gap:10px; }
    .priority-item { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; }
    .priority-rank { width:30px; height:30px; display:grid; place-items:center; border-radius:999px; background:#F4F7F6; color:var(--ink); font-weight:900; }
    .metric-table { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .metric-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .asset-library-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
    .asset-thumb { aspect-ratio:16/10; border-radius:14px; background:linear-gradient(135deg,#08145F,#0F766E); display:grid; place-items:center; color:white; font-weight:900; overflow:hidden; }
    .asset-thumb img { width:100%; height:100%; object-fit:cover; }
    .command-overlay,.modal-backdrop { position:fixed; inset:0; z-index:50; display:grid; place-items:start center; padding-top:9vh; background:rgba(8,20,95,.32); backdrop-filter:blur(10px); }
    .command-panel,.modal-panel { width:min(760px,calc(100vw - 32px)); border-radius:20px; background:white; box-shadow:0 30px 80px rgba(8,20,95,.24); border:1px solid rgba(8,20,95,.1); padding:18px; }
    .command-input { width:100%; min-height:48px; border:0; border-bottom:1px solid rgba(8,20,95,.1); border-radius:0; font-size:18px; }
    .command-list { display:grid; gap:8px; margin-top:14px; }
    .command-item { display:flex; align-items:center; justify-content:space-between; min-height:48px; padding:10px 12px; border:1px solid rgba(8,20,95,.08); border-radius:12px; background:#F9FAF7; cursor:pointer; }
    .modal-grid { display:grid; grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr); gap:16px; }
    .publish-preview { min-height:260px; border-radius:16px; overflow:hidden; background:#111827; display:grid; place-items:center; }
    .publish-preview img { width:100%; height:100%; object-fit:cover; }
    .dialog-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:16px; flex-wrap:wrap; }
    .sort-control { display:inline-flex; align-items:center; gap:8px; margin-left:auto; color:var(--muted); font-size:13px; font-weight:850; }
    .sort-control select { min-height:38px; min-width:132px; }
    .bulk-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 12px; border:1px solid rgba(8,20,95,.1); border-radius:14px; background:#fff; }
    .board-columns { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; align-items:start; }
    .board-column { display:grid; gap:10px; min-height:120px; border:1px solid rgba(8,20,95,.08); border-radius:18px; padding:12px; background:rgba(255,255,255,.58); }
    .board-column h3 { margin:0; display:flex; justify-content:space-between; gap:10px; align-items:center; color:var(--ink); }
    .ops-table { display:grid; gap:8px; }
    .ops-row { display:grid; grid-template-columns:minmax(180px,1.4fr) repeat(4,minmax(90px,.6fr)) minmax(160px,1fr); gap:10px; align-items:center; padding:12px; border:1px solid rgba(8,20,95,.08); border-radius:14px; background:white; }
    .ops-row.header { background:transparent; box-shadow:none; border:0; color:var(--muted); font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
    .drawer-card { display:grid; gap:12px; border:1px solid rgba(8,20,95,.08); border-radius:18px; padding:16px; background:white; }
    .mini-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
    .mini-form button { align-self:end; }
    .funnel-stage { display:grid; gap:6px; padding:12px; border-radius:14px; background:#F4F7F6; border:1px solid rgba(8,20,95,.08); }
    .funnel-stage strong { color:var(--ink); font-size:20px; }
    @media (max-width:1100px) { .layout,.command,.post-grid,.three,.two,.calendar,.queue-card,.operator-review,.wilma-grid,.export-grid,.archive-grid,.executive-grid,.ops-row { grid-template-columns:1fr; } aside { position:static; min-height:auto; align-items:flex-start; flex-direction:column; padding:14px 18px; } nav { width:100%; overflow:auto; align-items:flex-start; } .nav-group { flex:0 0 auto; } header,main { padding-left:18px; padding-right:18px; } .image-stage { position:static; order:-1; } .operator-preview .image-preview { min-height:300px; } }
    @media (max-width:1100px) { .mission-grid,.readiness-strip,.pipeline-board,.health-grid,.metric-table,.asset-library-grid,.modal-grid { grid-template-columns:1fr; } .readiness-strip,.pipeline-board { overflow:visible; } }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <div class="brand"><small>LegalEase</small><h1>Social Command Center</h1></div>
      <nav>
        <div class="nav-group"><span class="nav-label">Growth</span><a href="#overview" class="active">Overview</a><a href="#milestones">Milestones</a><a href="#partners">Partners</a><a href="#campaigns">Campaigns</a><a href="#funnel">RecordShield Funnel</a></div>
        <div class="nav-group"><span class="nav-label">Production</span><a href="#sources">Sources</a><a href="#queue">Queue</a><a href="#assets">Assets</a><a href="#posted">Posted</a></div>
        <div class="nav-group"><span class="nav-label">Operations</span><a href="#pilots">Pilots</a><a href="#compliance">Compliance</a><a href="#reports">Reports</a><a href="#dataroom">Data Room</a><a href="#metrics">Metrics</a><a href="#settings">Settings</a></div>
      </nav>
    </aside>
    <div>
      <header>
        <div><div class="eyebrow">Narrative infrastructure</div><h2>Social Command Center</h2></div>
        <div class="row"><span id="storeStatus" class="store-pill" style="display:none">Current store: checking...</span><button onclick="openCommandPalette()">Command</button><button class="primary" onclick="runSystemCheck()">Run System Check</button></div>
      </header>
      <main id="app"><div class="panel loading-panel"><div class="loading-line wide"></div><div class="loading-line"></div><div class="loading-card"></div></div></main>
    </div>
  </div>
  <div id="toast" class="toast"></div>
  <div id="modalRoot"></div>
  <div id="commandPaletteRoot"></div>
  <script>
    let state = null;
    let supabaseHealth = null;
    let backups = [];
    let reviewIndex = 0;
    let queueOriginFilter = "all";
    let queueReadinessFilter = "all";
    let queueSort = "priority";
    let bulkMode = false;
    let selectedPosts = new Set();
    let pendingPublishId = "";
    let systemCheckRanAt = "";
    let currentPageId = "overview";
    let sourceFilter = "All";
    const generatingImages = new Set();
    const platforms = ${JSON.stringify(platforms)};
    const visualBuckets = ${JSON.stringify(visualBuckets)};
    const wilmaImageWorkflowStates = ${JSON.stringify(wilmaImageWorkflowStates)};
    const wilmaExpressions = ${JSON.stringify(wilmaExpressions)};
    const wilmaVisualBuckets = ${JSON.stringify(wilmaVisualBuckets)};
    const wilmaBrandSafeRules = ${JSON.stringify(wilmaBrandSafeRules)};
    const wilmaOverlayRules = ${JSON.stringify(wilmaOverlayRules)};
    const repurposeFormats = ${JSON.stringify(repurposeFormats)};
    const sourceTypes = ${JSON.stringify(sourceTypes)};
    const sourceStatuses = ${JSON.stringify(sourceStatuses)};
    const finalExportPlatformFormats = ${JSON.stringify(finalExportPlatformFormats)};
    const platformLabels = ${JSON.stringify(platformLabels)};
    const channelLabels = ${JSON.stringify(channelLabels)};
    const channelDescriptions = ${JSON.stringify(channelDescriptions)};
    const channelRequiredEnv = ${JSON.stringify(channelRequiredEnv)};
    const statusLabels = ${JSON.stringify(statusLabels)};
    const speakerLabels = ${JSON.stringify(speakerLabels)};
    const audienceLabels = ${JSON.stringify(audienceLabels)};
    const qualityLabels = ${JSON.stringify(qualityLabels)};
    const watermarkLogoDataUri = "/assets/brand/logos/legalease-mark-white.png";
    const watermarkPositions = ["none", "top-left", "top-right", "bottom-left", "bottom-right"];
    const watermarkLabels = {
      none: "No watermark",
      "top-left": "Top left",
      "top-right": "Top right",
      "bottom-left": "Bottom left",
      "bottom-right": "Bottom right"
    };

    const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
    const toneForRisk = risk => risk === "high" ? "danger" : risk === "medium" ? "warn" : "good";
    const riskLabel = risk => risk === "medium" ? "Review needed" : risk === "high" ? "Legal review" : "Low review";
    const qualityTone = label => label === "rejected" ? "danger" : label === "needs_rewrite" ? "warn" : "good";
    const channelTone = status => status === "connected" ? "good" : status === "ready_to_connect" ? "info" : status === "setup_required" || status === "expired" ? "warn" : "danger";
    const publishTone = status => status === "ready" ? "good" : status === "blocked" || status === "failed" || status === "not_connected" || status === "setup_required" ? "danger" : status ? "warn" : "info";
    const publishLabel = status => ({
      ready: "Ready to publish",
      blocked: "Blocked",
      setup_required: "Setup required",
      not_connected: "Channel not connected",
      blocked_channel_not_connected: "Channel not connected",
      unscheduled: "Needs schedule",
      publishing: "Publishing",
      pending: "Pending",
      failed: "Failed"
    }[status] || "Publish unchecked");
    const channelStatusLabel = status => ({
      connected: "Connected",
      ready_to_connect: "Ready to connect",
      setup_required: "Setup Required",
      not_configured: "Not Configured",
      expired: "Connection expired",
      error: "Error"
    }[status] || "Not Configured");
    const tomorrowMorning = (offset = 1) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      date.setHours(9 + (offset % 5), 0, 0, 0);
      return date.toISOString().slice(0, 16);
    };
    const toast = message => {
      const el = document.querySelector("#toast");
      el.textContent = message;
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), 1800);
    };
    const sectionClass = id => \`page-section \${id === currentPageId ? "active" : ""}\`;

    async function api(path, options = {}) {
      const timeoutMs = Number(options.timeoutMs || 8000);
      const requestOptions = { ...options };
      delete requestOptions.timeoutMs;
      if (typeof fetch === "function") {
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        let response;
        try {
          response = await fetch(path, { headers: { "content-type": "application/json" }, ...requestOptions, signal: controller?.signal });
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      }
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(requestOptions.method || "GET", path, true);
        xhr.timeout = timeoutMs;
        xhr.setRequestHeader("content-type", "application/json");
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(xhr.responseText || "Request failed"));
            return;
          }
          try {
            resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
          } catch (error) {
            reject(error);
          }
        };
        xhr.onerror = () => reject(new Error("Network request failed"));
        xhr.ontimeout = () => reject(new Error("Request timed out"));
        xhr.send(requestOptions.body || null);
      });
    }

    async function load() {
      try {
        state = await api("/api/state", { timeoutMs: 5000 });
        render();
      } catch (error) {
        document.querySelector("#app").innerHTML = '<div class="panel empty"><strong>Could not load Queue.</strong><br><span class="muted">' + esc(error.message || "Refresh and try again.") + '</span><div style="margin-top:14px"><button class="primary" onclick="load()">Try again</button></div></div>';
        return;
      }
      Promise.allSettled([
        api("/api/health/supabase", { timeoutMs: 2500 }),
        api("/api/backups", { timeoutMs: 2500 })
      ]).then(results => {
        if (results[0].status === "fulfilled") supabaseHealth = results[0].value;
        if (results[1].status === "fulfilled") backups = results[1].value.backups || [];
        render();
      });
    }

    function counts() {
      return state.posts.reduce((memo, post) => {
        memo[post.status] = (memo[post.status] || 0) + 1;
        return memo;
      }, {});
    }

    function imageForPost(postId) {
      const images = (state.postImages || [])
        .filter(image => image.postId === postId)
        .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
      return images.find(image => image.imageUrl && image.generationStatus === "generated") || images[0];
    }

    function imageStyleLabel(image = {}) {
      return image.styleProfile || image.creativeDirection?.styleProfile || image.assetBundleUsed?.stylePresetName || "Techno Afro-Futurist Concept";
    }

    function imageVariantLabel(image = {}) {
      return image.imageVariantLabel || image.creativeDirection?.imageVariantLabel || image.assetBundleUsed?.imageVariantLabel || "LegalEase Institutional";
    }

    function overlayTextForPost(post) {
      if (post.overlayMode === "none") return { mode:"none", kicker:"", headline:"", support:"" };
      const supportLine = String(post.cta || post.body || "").replace(/\\n/g, ". ").split(".").filter(Boolean)[0] || "Make second chances easier to understand.";
      return {
        mode:"text",
        kicker: post.overlayKicker || post.contentBucket || post.contentFormat || "LegalEase",
        headline: post.overlayHeadline || post.hook || post.title,
        support: post.overlaySupport || supportLine
      };
    }

    function finalPngReady(post, image) {
      return Boolean(
        post?.imageFinalized &&
        image &&
        image.generationStatus === "generated" &&
        (image.finalImageReady || image.textRenderingMode === "baked_overlay" || image.textRenderingMode === "no_text_overlay" || image.assetBundleUsed?.finalImage?.ready)
      );
    }

    function workflowStageForPost(post, image) {
      const approved = ["approved", "scheduled", "retry_ready", "posted"].includes(post.status);
      if (post.status === "manually_posted" || post.manuallyPostedAt) return { key:"manually_posted", label:"Manually Posted", tone:"good", actionLabel:"View Posted Record", action:"location.hash='posted'" };
      if (!post.copyReviewed) return { key:"copy_review", label:"Needs Copy Review", tone:post.complianceRisk === "high" ? "danger" : "warn", actionLabel:"Mark Copy Reviewed", action:"markCopyReviewed('" + post.id + "')" };
      if (!post.wilmaImageWorkflow?.imagePrompt && (!image || image.generationStatus !== "generated")) return { key:"needs_image", label:"Needs Image", tone:"warn", actionLabel:"Create Image Prompt", action:"generateWilmaImagePrompt('" + post.id + "')" };
      if (post.wilmaImageWorkflow?.imagePrompt && (!image || image.generationStatus !== "generated")) return { key:"image_prompt_ready", label:"Needs Image", tone:"warn", actionLabel:"Mark Image Ready", action:"markWilmaImageGenerated('" + post.id + "')" };
      if (image?.generationMode === "local_wilma_placeholder_preview" && !post.overlayConfirmed) return { key:"image_generated", label:"Needs Overlay", tone:"warn", actionLabel:"Confirm Overlay", action:"confirmOverlay('" + post.id + "')" };
      if (!post.overlayConfirmed) return { key:"overlay_edit", label:"Needs Overlay", tone:"warn", actionLabel:"Confirm Overlay", action:"confirmOverlay('" + post.id + "')" };
      if (image?.generationMode === "local_wilma_placeholder_preview" && !finalPngReady(post, image)) return { key:"final_png", label:"Needs Final PNG", tone:"warn", actionLabel:"Mark Final PNG Ready", action:"markWilmaFinalPngReady('" + post.id + "')" };
      if (!finalPngReady(post, image)) return { key:"final_png", label:"Needs Final PNG", tone:"warn", actionLabel:"Create Final PNG", action:"finalizeImage('" + post.id + "')" };
      if (!approved) return { key:"approval", label:"Needs Approval", tone:"warn", actionLabel:"Approve", action:"setStatus('" + post.id + "','approved')" };
      if (!manualPostingReady(post, image)) return { key:"manual_blocked", label:"Manual Kit Needed", tone:"warn", actionLabel:"Review Details", action:"location.hash='queue'" };
      return { key:"manual_ready", label:"Ready to Post", tone:"good", actionLabel:"Copy Manual Kit", action:"copyPost('" + post.id + "')" };
    }

    function simpleQueueStatus(post, image) {
      const text = composePreviewText(post);
      if (post.status === "manually_posted" || post.status === "posted" || post.manuallyPostedAt || post.postedAt) {
        return { key:"posted", label:"Posted", tone:"good", group:"posted", why:"" };
      }
      if (["failed", "blocked_channel_not_connected"].includes(post.status) || ["failed", "blocked"].includes(post.publishingStatus)) {
        return { key:"blocked", label:"Blocked", tone:"danger", group:"blocked", why:post.publishErrorSummary || "Manual posting setup needs attention." };
      }
      if (!text) return { key:"blocked", label:"Blocked", tone:"danger", group:"blocked", why:"Caption missing." };
      if (post.complianceGate?.required && !post.complianceGate?.passed) {
        return { key:"blocked", label:"Blocked", tone:"danger", group:"blocked", why:"Wilma review required." };
      }
      if (!post.copyReviewed) {
        return { key:"copy", label:"Needs Copy Review", tone:post.complianceRisk === "high" ? "danger" : "warn", group:"review", why:"" };
      }
      if (!image || image.generationStatus !== "generated") {
        return { key:"image", label:"Needs Image", tone:"warn", group:"review", why:"" };
      }
      if (!post.overlayConfirmed) {
        return { key:"overlay", label:"Needs Overlay", tone:"warn", group:"review", why:"" };
      }
      if (!finalPngReady(post, image)) {
        return { key:"final_png", label:"Needs Final PNG", tone:"warn", group:"review", why:"" };
      }
      if (!manualPostingReady(post, image) || !post.manualPostingKitReady) {
        return { key:"manual_kit", label:"Manual Kit Needed", tone:"warn", group:"review", why:"" };
      }
      return { key:"ready", label:"Ready to Post", tone:"good", group:"ready", why:"" };
    }

    function simpleStatusAction(status, post, image) {
      const workflow = workflowStageForPost(post, image);
      if (status.key === "posted") return { label:"View Posted", action:"location.hash='posted'" };
      if (status.key === "blocked") return { label:"Review Blocker", action:workflow.action };
      if (status.key === "manual_kit") return { label:"Mark Manual Kit Ready", action:"markManualPostingKitReady('" + post.id + "')" };
      if (status.key === "ready") return { label:"Publish Now", action:"publishNow('" + post.id + "')" };
      return { label:workflow.actionLabel, action:workflow.action };
    }

    function queueReadinessMatches(post) {
      if (queueReadinessFilter === "all") return true;
      const status = simpleQueueStatus(post, imageForPost(post.id));
      if (queueReadinessFilter === "image") return status.key === "image";
      if (queueReadinessFilter === "final_png") return status.key === "final_png";
      if (queueReadinessFilter === "manual_kit") return status.key === "manual_kit" || status.key === "ready";
      return status.group === queueReadinessFilter;
    }

    function setQueueReadinessFilter(value) {
      queueReadinessFilter = ["all", "ready", "review", "blocked", "image", "final_png", "manual_kit", "posted"].includes(value) ? value : "all";
      render();
    }

    function setQueueSort(value) {
      queueSort = ["priority", "newest", "oldest", "platform", "risk", "status"].includes(value) ? value : "priority";
      render();
    }

    function sortQueuePosts(posts) {
      const priority = { blocked:0, copy:1, image:2, overlay:3, final_png:4, manual_kit:5, ready:6, posted:7 };
      const risk = { high:0, medium:1, low:2 };
      return posts.slice().sort((a, b) => {
        if (queueSort === "newest") return String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""));
        if (queueSort === "oldest") return String(a.createdAt || a.updatedAt || "").localeCompare(String(b.createdAt || b.updatedAt || ""));
        if (queueSort === "platform") return String(a.platform || "").localeCompare(String(b.platform || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
        if (queueSort === "risk") return (risk[a.complianceRisk || "low"] ?? 3) - (risk[b.complianceRisk || "low"] ?? 3);
        if (queueSort === "status") return simpleQueueStatus(a, imageForPost(a.id)).label.localeCompare(simpleQueueStatus(b, imageForPost(b.id)).label);
        return (priority[simpleQueueStatus(a, imageForPost(a.id)).key] ?? 9) - (priority[simpleQueueStatus(b, imageForPost(b.id)).key] ?? 9);
      });
    }

    function toggleBulkMode() {
      bulkMode = !bulkMode;
      if (!bulkMode) selectedPosts = new Set();
      render();
    }

    function toggleBulkPost(id, checked) {
      if (checked) selectedPosts.add(id);
      else selectedPosts.delete(id);
      render();
    }

    function postedNeedsMetrics(post) {
      return (post.status === "manually_posted" || post.status === "posted" || post.manuallyPostedAt || post.postedAt) && performanceLabelFor(post.performance) === "Needs Data";
    }

    function dailyControlBarHtml(posts) {
      const statuses = posts.map(post => simpleQueueStatus(post, imageForPost(post.id)));
      const ready = statuses.filter(status => status.group === "ready").length;
      const review = statuses.filter(status => status.group === "review").length;
      const blocked = statuses.filter(status => status.group === "blocked").length;
      const metrics = state.posts.filter(postedNeedsMetrics).length;
      return \`<div class="daily-control-bar">
        <strong>Today:</strong>
        <span>\${ready} Ready</span>
        <span>\${review} Need Review</span>
        <span>\${blocked} Blocked</span>
        <span>\${metrics} Needs Metrics</span>
      </div>\`;
    }

    function queueEmptyHtml() {
      const messages = {
        ready: ["No ready posts.", "Finish review, image, and manual kit steps to make a post ready."],
        review: ["Nothing needs review.", "New drafts that need copy, image, overlay, or final PNG work will appear here."],
        blocked: ["Nothing is blocked.", "Good. If something breaks, the short reason will appear here."],
        image: ["No posts need images.", "Image-ready work will move to final PNG next."],
        final_png: ["No posts need final PNGs.", "Posts appear here after image and overlay are ready."],
        manual_kit: ["No manual kits are waiting.", "Ready posts can be exported or published from Queue."],
        posted: ["No posted items in Queue.", "Posted items also live on the Posted page for metrics."],
        all: ["No queue items yet.", "Create tomorrow's queue or make a draft from Sources."]
      };
      const [title, body] = messages[queueReadinessFilter] || messages.all;
      return \`<div class="panel muted"><h2>\${title}</h2><p>\${body}</p></div>\`;
    }

    function postImageMarkup(image, post) {
      const isGenerating = generatingImages.has(post.id) && !finalPngReady(post, image);
      if (isGenerating) return \`<div class="image-empty"><strong>Generating image...</strong><br>This can take 10-30 seconds. Keep this tab open.<div style="margin-top:14px"><button class="primary" disabled>Working</button></div></div>\`;
      if (!image) return \`<div class="image-empty"><strong>No image yet</strong><br>Generate or upload a branded visual.<div style="margin-top:14px"><button class="primary" onclick="regenerateImage('\${post.id}')">Generate image</button></div></div>\`;
      if (!image.imageUrl) {
        const message = image.generationError || "The latest image did not finish. Regenerate or upload a replacement.";
        const retryLabel = image.rateLimited && image.rateLimitRetryAfterSeconds
          ? \`Try again in \${Number(image.rateLimitRetryAfterSeconds)}s\`
          : "Regenerate image";
        return \`<div class="image-empty"><strong>\${image.rateLimited ? "Image API cooling down" : "No usable image yet"}</strong><br>\${esc(message)}<div style="margin-top:14px"><button class="primary" onclick="regenerateImage('\${post.id}')">\${esc(retryLabel)}</button></div></div>\`;
      }
      const bakedOverlay = image.textRenderingMode === "baked_overlay" || image.textRenderingMode === "no_text_overlay" || image.assetBundleUsed?.finalImage?.textRenderingMode === "baked_overlay" || image.assetBundleUsed?.finalImage?.textRenderingMode === "no_text_overlay";
      if (bakedOverlay) {
        return \`<div class="image-frame">
          <img class="poster-image" src="\${image.imageUrl}" alt="Final composed brand visual for \${esc(post.title)}">
          <div class="safe-frame" title="Safe area"></div>
        </div>\`;
      }
      const watermarkPosition = image.watermarkPosition || image.assetBundleUsed?.watermark?.position || "none";
      const shouldOverlayWatermark = watermarkPosition !== "none" && watermarkLogoDataUri;
      const overlay = overlayTextForPost(post);
      return \`<div class="image-frame">
        <img class="poster-image" src="\${image.imageUrl}" alt="Brand visual for \${esc(post.title)}">
        <div class="safe-frame" title="Safe area"></div>
        \${overlay.mode === "none" ? "" : \`<div class="poster-overlay">
          <div>
            <div class="kicker">\${esc(overlay.kicker)}</div>
            <div class="headline">\${esc(overlay.headline)}</div>
          </div>
          <div class="support">\${esc(overlay.support)}</div>
        </div>\`}
        \${shouldOverlayWatermark ? \`<img class="watermark-logo watermark-\${esc(watermarkPosition)}" src="\${watermarkLogoDataUri}" alt="LegalEase watermark">\` : ""}
      </div>\`;
    }

    function wilmaWorkflowForPost(post, image) {
      const workflow = post.wilmaImageWorkflow || image?.wilmaImageWorkflow || {};
      const overlay = overlayTextForPost(post);
      const overlayHeadline = overlay.mode === "none" ? "" : (workflow.overlayText || overlay.headline || post.hook || post.title || "");
      return {
        state: workflow.state || post.imageWorkflowState || "Needs Image",
        visualBucket: workflow.visualBucket || post.wilmaVisualBucket || "LegalEase POV",
        wilmaExpression: workflow.wilmaExpression || post.wilmaExpression || "Helpful",
        wilmaPoseReferenceId: workflow.wilmaPoseReferenceId || post.wilmaPoseReferenceId || "wilma-pose-02",
        wilmaPoseReferenceName: workflow.wilmaPoseReferenceName || image?.wilmaPoseReferenceName || "Approved Wilma pose",
        wilmaPoseReferenceCount: Number(workflow.wilmaPoseReferenceCount || image?.wilmaPoseReferenceCount || state.brandAssets?.filter(asset => (asset.tags || []).includes("pose-library")).length || 0),
        wilmaAssetId: workflow.wilmaAssetId || image?.assetBundleUsed?.selectedAssets?.wilmaAssetId || "",
        backgroundAssetId: workflow.backgroundAssetId || image?.assetBundleUsed?.selectedAssets?.backgroundAssetId || "",
        brandMarkAssetId: workflow.brandMarkAssetId || image?.assetBundleUsed?.selectedAssets?.brandMarkAssetId || "",
        imagePrompt: workflow.imagePrompt || post.imagePrompt || image?.imagePrompt || "",
        negativePrompt: workflow.negativePrompt || post.negativePrompt || image?.negativePrompt || wilmaBrandSafeRules.join("; "),
        overlayText: overlayHeadline,
        platformFormatSize: workflow.platformFormatSize || "1:1 square PNG, 1200 x 1200 preview target",
        promptBuilderOutput: workflow.promptBuilderOutput || image?.promptBuilderOutput || null,
        exportChecklist: workflow.exportChecklist || {}
      };
    }

    function liveGatesOff() {
      const gates = state.runtime?.livePostingGates || {};
      return !Object.values(gates).some(gate => Boolean(gate?.enabled));
    }

    function wilmaOverlaySafetyReport(text) {
      const value = String(text || "").trim();
      const wordCount = value ? value.split(/\\s+/).filter(Boolean).length : 0;
      const guaranteePattern = /\\b(guarantee|guaranteed|will\\s+(clear|erase|remove|fix|qualify|win|approve)|100%|assured|promise|promised)\\b/i;
      const eligibilityPattern = /\\b(you\\s+(are|re|'re)\\s+eligible|everyone\\s+qualifies|automatically\\s+qualif(?:y|ies)|always\\s+eligible|definitely\\s+eligible|qualify\\s+for\\s+expungement)\\b/i;
      return {
        overlayText:value,
        wordCount,
        overlayLengthOk: wordCount > 0 && wordCount <= 8,
        empty: !value,
        hasLegalGuaranteeLanguage: guaranteePattern.test(value),
        hasEligibilityPromiseLanguage: eligibilityPattern.test(value),
        bannedVisualElementsOk: true,
        mobileReadable: wordCount > 0 && wordCount <= 8
      };
    }

    function wilmaReadiness(post, image, workflow = wilmaWorkflowForPost(post, image)) {
      const safety = wilmaOverlaySafetyReport(workflow.overlayText);
      const reasons = [];
      if (!post.copyReviewed) reasons.push("Copy still needs review.");
      if (!workflow.imagePrompt) reasons.push("Image prompt still needs to be generated.");
      if (!image || image.generationStatus !== "generated") reasons.push("Image has not been marked generated.");
      if (!post.overlayConfirmed) reasons.push("Overlay has not been confirmed.");
      if (!finalPngReady(post, image)) reasons.push("Final PNG has not been marked ready.");
      if (!workflow.platformFormatSize) reasons.push("Platform size has not been confirmed.");
      if (!composePreviewText(post)) reasons.push("Manual posting copy is not ready.");
      if (!liveGatesOff()) reasons.push("Live posting gates must remain off for manual launch.");
      return {
        ready: reasons.length === 0,
        reasons,
        safety
      };
    }

    function slugify(value = "") {
      return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "item";
    }

    function localDateSlug(value = "") {
      const date = value ? new Date(value) : new Date();
      if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
      return new Date().toISOString().slice(0, 10);
    }

    function exportFormatForPost(post, overrideId = "") {
      if (overrideId) {
        const exact = finalExportPlatformFormats.find(format => format.id === overrideId);
        if (exact) return exact;
      }
      const targetChannels = (post.targetChannels?.length ? post.targetChannels : [post.platform]).filter(Boolean);
      const platform = targetChannels[0] || post.platform || "linkedin";
      if (platform === "instagram") return finalExportPlatformFormats.find(format => format.id === "instagram-square");
      if (platform === "linkedin") return finalExportPlatformFormats.find(format => format.id === "linkedin-square");
      if (platform === "x") return finalExportPlatformFormats.find(format => format.id === "x-twitter-landscape");
      return finalExportPlatformFormats.find(format => format.id === "linkedin-square");
    }

    function altTextForExport(post, workflow) {
      const bucket = workflow.visualBucket || post.wilmaVisualBucket || post.contentBucket || "LegalEase social graphic";
      const expression = workflow.wilmaExpression || post.wilmaExpression || "helpful";
      const overlay = workflow.overlayText || overlayTextForPost(post).headline || "";
      return [
        \`LegalEase social graphic for \${bucket}.\`,
        \`Wilma appears in a \${String(expression).toLowerCase()} pose.\`,
        overlay ? \`Overlay text reads: \${overlay}.\` : "",
        "Educational content only; not legal advice."
      ].filter(Boolean).join(" ");
    }

    function finalExportKitForPost(post, image, workflow = wilmaWorkflowForPost(post, image)) {
      const existing = post.finalExportKit || {};
      const format = exportFormatForPost(post, existing.platformFormatId || workflow.platformFormatId);
      const bucket = workflow.visualBucket || post.wilmaVisualBucket || image?.visualBucket || post.contentBucket || "LegalEase POV";
      const date = localDateSlug();
      const filename = \`legalease-\${slugify(bucket)}-\${slugify(format.id)}-\${date}-\${slugify(post.id || "post")}.png\`;
      const caption = existing.caption || composePreviewText(post);
      const hashtags = existing.hashtags || (post.hashtags || []).join(" ");
      const altText = existing.altText || altTextForExport(post, workflow);
	      const postingNotes = existing.postingNotes || post.operatorNotes || "Manual posting only. Confirm final visual and caption before uploading.";
	      const ready = finalPngReady(post, image);
	      const finalImageUrl = ready ? image?.finalPngUrl || image?.finalImageUrl || image?.imageUrl || "" : "";
	      const finalMeta = image?.assetBundleUsed?.finalImage || {};
	      const localPath = finalMeta.localPath || image?.finalPngPath || existing.finalPngPath || "";
	      const fileSize = Number(finalMeta.fileSize || image?.finalPngFileSize || existing.finalPngFileSize || 0);
	      const generatedAt = finalMeta.createdAt || image?.finalPngGeneratedAt || existing.finalPngGeneratedAt || "";
	      return {
        ...existing,
        status: existing.status || (ready ? "ready" : "blocked"),
        platformFormatId: format.id,
        platformFormatLabel: format.label,
        platform: format.platform,
        width: format.width,
        height: format.height,
        dimensions: \`\${format.width}x\${format.height}\`,
        contentBucket: bucket,
        wilmaExpression: workflow.wilmaExpression || post.wilmaExpression || image?.wilmaExpression || "",
        wilmaPoseReference: workflow.wilmaPoseReferenceName || image?.wilmaPoseReferenceName || post.wilmaPoseReferenceId || "",
        wilmaPoseReferenceId: workflow.wilmaPoseReferenceId || image?.wilmaPoseReferenceId || post.wilmaPoseReferenceId || "",
        overlayText: workflow.overlayText || overlayTextForPost(post).headline || "",
        caption,
        hashtags,
        altText,
	        postingNotes,
	        exportFilename: filename,
	        imageUrl: image?.imageUrl || "",
	        finalImageUrl,
	        finalPngUrl: finalImageUrl,
	        finalPngPath: localPath,
	        finalPngFileSize: fileSize,
	        finalPngGeneratedAt: generatedAt,
	        downloadUrl: finalImageUrl ? \`/api/posts/\${encodeURIComponent(post.id || "post")}/final-png\` : "",
	        finalPngReady: ready,
        livePostingDisabled: liveGatesOff(),
        operatorMustPostManually: true
      };
    }

    function performanceTotals(performance = {}) {
      return {
        impressions: Number(performance.impressions || 0),
        likes: Number(performance.likes || 0),
        comments: Number(performance.comments || 0),
        shares: Number(performance.shares || 0),
        saves: Number(performance.saves || 0),
        reposts: Number(performance.reposts || 0),
        clicks: Number(performance.clicks || 0),
        leads: Number(performance.leads || 0)
      };
    }

    function performanceEngagement(performance = {}) {
      const totals = performanceTotals(performance);
      return totals.likes + totals.comments + totals.shares + totals.saves + totals.reposts + totals.clicks;
    }

    function performanceLabelFor(performance = {}) {
      const totals = performanceTotals(performance);
      if (!totals.impressions) return "Needs Data";
      const engagement = performanceEngagement(performance);
      const rate = engagement / Math.max(1, totals.impressions);
      if (rate >= 0.08 || totals.comments + totals.shares + totals.saves >= 10 || totals.leads >= 2) return "Repurpose Candidate";
      if (rate >= 0.05 || engagement >= 25) return "Strong Engagement";
      if (rate >= 0.02 || engagement >= 8) return "Good Engagement";
      return "Low Signal";
    }

    function performanceTone(label) {
      if (label === "Repurpose Candidate" || label === "Strong Engagement") return "good";
      if (label === "Good Engagement") return "info";
      if (label === "Needs Data") return "warn";
      return "danger";
    }

    function queueOriginLabel(post) {
      return post.repurposedFromPostId || String(post.sourceType || "").toLowerCase() === "repurposed" ? "Repurposed" : "Original";
    }

    function queueOriginMatches(post) {
      const repurposed = post.repurposedFromPostId || String(post.sourceType || "").toLowerCase() === "repurposed";
      if (queueOriginFilter === "repurposed") return repurposed;
      if (queueOriginFilter === "original") return !repurposed;
      return true;
    }

    function setQueueOriginFilter(value) {
      queueOriginFilter = ["all", "original", "repurposed"].includes(value) ? value : "all";
      render();
    }

    function sourceItems() {
      return state.settings?.sourceItems || [];
    }

    function sourceRoute(source = {}) {
      return source.routing || {};
    }

    function sourceMatchesFilter(source) {
      const route = sourceRoute(source);
      if (sourceFilter === "High Risk") return route.riskLevel === "High";
      if (sourceFilter === "Wilma Required") return Boolean(route.wilmaComplianceRequired);
      if (sourceFilter === "All") return true;
      return (source.status || "New") === sourceFilter;
    }

    function setSourceFilter(value) {
      sourceFilter = ["All", ...sourceStatuses, "High Risk", "Wilma Required"].includes(value) ? value : "All";
      render();
    }

    function safetyBadge(ok, goodLabel, warnLabel) {
      return \`<span class="badge \${ok ? "good" : "warn"}">\${esc(ok ? goodLabel : warnLabel)}</span>\`;
    }

    function safetyReviewHtml(post, image, workflow) {
      const review = wilmaReadiness(post, image, workflow);
      const safety = review.safety;
      return \`<div class="safety-review \${review.ready ? "good" : "warn"}">
        <div class="toprow"><strong>Safety Review</strong><span class="badge \${review.ready ? "good" : "warn"}">\${review.ready ? "Ready" : "Needs checks"}</span></div>
        <div class="safety-grid">
          <div><span class="muted">Overlay length</span>\${safetyBadge(safety.overlayLengthOk, safety.wordCount + " words", safety.empty ? "Empty" : safety.wordCount + " words")}</div>
          <div><span class="muted">Legal guarantee</span>\${safetyBadge(!safety.hasLegalGuaranteeLanguage, "Clear", "Review wording")}</div>
          <div><span class="muted">Eligibility promise</span>\${safetyBadge(!safety.hasEligibilityPromiseLanguage, "Clear", "Review wording")}</div>
          <div><span class="muted">Banned visuals</span>\${safetyBadge(safety.bannedVisualElementsOk, "Rules loaded", "Missing rules")}</div>
          <div><span class="muted">Mobile readability</span>\${safetyBadge(safety.mobileReadable, "Short overlay", "Shorten overlay")}</div>
        </div>
        \${review.reasons.length ? \`<div class="blocked-reason"><strong>Why blocked?</strong><ul>\${review.reasons.map(reason => \`<li>\${esc(reason)}</li>\`).join("")}</ul></div>\` : \`<p class="muted" style="margin:0">All local readiness checks passed. Live gates are off.</p>\`}
      </div>\`;
    }

    function overlayWordBadge(text) {
      const count = String(text || "").trim().split(/\\s+/).filter(Boolean).length;
      const tone = count && count <= 8 ? "good" : "warn";
      return \`<span class="badge \${tone}">\${count || 0} words</span>\`;
    }

    function checklistItem(label, ok) {
      return \`<li class="\${ok ? "done" : ""}"><span>\${ok ? "[x]" : "[ ]"}</span>\${esc(label)}</li>\`;
    }

    function wilmaExportChecklist(post, image, workflow) {
      const publishText = composePreviewText(post);
      return [
        checklistItem("Copy reviewed", Boolean(post.copyReviewed || workflow.exportChecklist.copyReviewed)),
        checklistItem("Image selected/generated", Boolean(image?.generationStatus === "generated" || workflow.exportChecklist.imageSelectedOrGenerated)),
        checklistItem("Overlay confirmed", Boolean(post.overlayConfirmed || workflow.exportChecklist.overlayConfirmed)),
        checklistItem("Final PNG generated", Boolean(finalPngReady(post, image) || workflow.exportChecklist.finalPngGenerated)),
        checklistItem("Watermark/brand mark applied if selected", Boolean(workflow.exportChecklist.watermarkOrBrandMarkAppliedIfSelected ?? true)),
        checklistItem("Platform size confirmed", Boolean(workflow.platformFormatSize || workflow.exportChecklist.platformSizeConfirmed)),
        checklistItem("Manual posting copy ready", Boolean(publishText || workflow.exportChecklist.manualPostingCopyReady))
      ].join("");
    }

    function promptBuilderOutputHtml(workflow) {
      const output = workflow.promptBuilderOutput;
      if (!output) return \`<p class="muted">Generate an image prompt to populate the structured prompt builder output.</p>\`;
      return Object.entries(output).map(([key, value]) => \`
        <div class="prompt-row"><strong>\${esc(key.replace(/([A-Z])/g, " $1"))}</strong><span>\${esc(value)}</span></div>
      \`).join("");
    }

    function wilmaPlaceholderCard(post, image, workflow) {
      if (image?.imageUrl) return postImageMarkup(image, post);
      return \`<div class="wilma-preview-card">
        <div class="preview-disc"></div>
        <div>
          <strong>\${esc(workflow.visualBucket)}</strong>
          <p>\${esc(workflow.wilmaExpression)} · \${esc(workflow.wilmaPoseReferenceId)}</p>
          <small>Local prompt preview appears here after Mark Image Generated.</small>
        </div>
      </div>\`;
    }

    function localAssets(type = "") {
      return (state.settings?.localAssets || []).filter(asset => asset.active !== false && (!type || asset.type === type));
    }

    function poseMappings() {
      return state.settings?.wilmaPoseMappings || [];
    }

    function assetOptions(type, selected = "", emptyLabel = "Use fallback") {
      return \`<option value="">\${esc(emptyLabel)}</option>\${localAssets(type).map(asset => \`<option value="\${esc(asset.id)}" \${asset.id === selected ? "selected" : ""}>\${esc(asset.label)}</option>\`).join("")}\`;
    }

    function poseOptions(selected = "") {
      return poseMappings().map(mapping => \`<option value="\${esc(mapping.id)}" \${mapping.id === selected ? "selected" : ""}>#\${mapping.poseRefNumber} · \${esc(mapping.expressionCategory)} · \${esc(mapping.label.replace(/^Wilma pose \\d+:\\s*/i, ""))}</option>\`).join("");
    }

    function wilmaImagePanelHtml(post, image) {
      const workflow = wilmaWorkflowForPost(post, image);
      const readiness = wilmaReadiness(post, image, workflow);
      const canMarkGenerated = Boolean(workflow.imagePrompt);
      const canConfirmOverlay = Boolean(image?.generationStatus === "generated");
      const canMarkFinal = Boolean(post.copyReviewed && post.overlayConfirmed && image?.generationStatus === "generated" && !readiness.safety.empty);
      const promptText = workflow.imagePrompt || "No prompt yet. Use Generate Image Prompt to create the local Wilma prompt package.";
      return \`<section class="wilma-workflow">
        <div class="toprow">
          <div>
            <div class="eyebrow">Wilma Image Workflow</div>
            <h3>Image production</h3>
          </div>
          <span class="badge \${workflow.state === "Ready for Manual Posting" ? "good" : workflow.state === "Image Prompt Ready" ? "info" : "warn"}">\${esc(workflow.state)}</span>
        </div>
        <div class="wilma-grid">
          <div class="wilma-controls">
            <label>Visual content bucket<select id="wilma-bucket-\${post.id}">
              \${wilmaVisualBuckets.map(bucket => \`<option value="\${bucket}" \${bucket === workflow.visualBucket ? "selected" : ""}>\${bucket}</option>\`).join("")}
            </select></label>
            <label>Wilma expression<select id="wilma-expression-\${post.id}">
              \${wilmaExpressions.map(expression => \`<option value="\${expression}" \${expression === workflow.wilmaExpression ? "selected" : ""}>\${expression}</option>\`).join("")}
            </select></label>
            <label>Wilma pose ref<select id="wilma-pose-\${post.id}">
              \${poseOptions(workflow.wilmaPoseReferenceId)}
            </select></label>
            <p class="muted"><strong>Pose reference:</strong> \${esc(workflow.wilmaPoseReferenceName)}<br><strong>Pose library:</strong> \${workflow.wilmaPoseReferenceCount} approved references</p>
            <p class="muted"><strong>Format:</strong> \${esc(workflow.platformFormatSize)}</p>
            <p class="muted"><strong>Overlay:</strong> \${esc(workflow.overlayText || "No overlay")} \${overlayWordBadge(workflow.overlayText)}</p>
            \${safetyReviewHtml(post, image, workflow)}
            <div class="wilma-actions">
              <button class="primary" onclick="generateWilmaImagePrompt('\${post.id}')">Generate Image Prompt</button>
              <button onclick="markWilmaImageGenerated('\${post.id}')" \${canMarkGenerated ? "" : "disabled"} title="\${canMarkGenerated ? "" : "Generate an image prompt first."}">Mark Image Generated</button>
              <button onclick="confirmOverlay('\${post.id}')" \${canConfirmOverlay && !post.overlayConfirmed ? "" : "disabled"} title="\${canConfirmOverlay ? "" : "Mark an image generated first."}">Confirm Overlay</button>
              <button onclick="markWilmaFinalPngReady('\${post.id}')" \${canMarkFinal ? "" : "disabled"} title="\${canMarkFinal ? "" : "Copy, image, overlay, and final readiness checks must pass first."}">Mark Final PNG Ready</button>
            </div>
          </div>
          <div class="wilma-preview">\${wilmaPlaceholderCard(post, image, workflow)}</div>
        </div>
        <details class="wilma-details">
          <summary>Asset choices</summary>
          <div class="two">
            <label>Linked Wilma asset<select id="wilma-asset-\${post.id}">
              \${assetOptions("wilma_pose", workflow.wilmaAssetId, "Use pose fallback")}
            </select></label>
            <label>Background asset<select id="background-asset-\${post.id}">
              \${assetOptions("background", workflow.backgroundAssetId, "Use branded background")}
            </select></label>
          </div>
          <label>Brand mark / watermark<select id="brand-mark-asset-\${post.id}">
            \${assetOptions("brand_mark", workflow.brandMarkAssetId, "Use default LegalEase mark")}
          </select></label>
          <p class="muted">Local files must live under <code>data/assets/</code>. If a selected asset is missing, the final PNG keeps the branded fallback.</p>
        </details>
        <details class="wilma-details">
          <summary>Prompt builder output</summary>
          <div class="prompt-output">\${promptBuilderOutputHtml(workflow)}</div>
          <label>Image prompt<textarea readonly>\${esc(promptText)}</textarea></label>
          <label>Negative prompt / banned elements<textarea readonly>\${esc(workflow.negativePrompt)}</textarea></label>
        </details>
        <details class="wilma-details">
          <summary>Rules and export readiness</summary>
          <div class="two">
            <div><strong>Brand-safe image rules</strong><ul class="compact-list">\${wilmaBrandSafeRules.map(rule => \`<li>\${esc(rule)}</li>\`).join("")}</ul></div>
            <div><strong>Overlay rules</strong><ul class="compact-list">\${wilmaOverlayRules.map(rule => \`<li>\${esc(rule)}</li>\`).join("")}</ul></div>
          </div>
          <ul class="export-checklist">\${wilmaExportChecklist(post, image, workflow)}</ul>
        </details>
      </section>\`;
    }

	    function channelCards() {
	      const accountsByPlatform = new Map((state.socialAccounts || []).map(account => [account.platform, account]));
	      const accounts = platforms.map(platform => accountsByPlatform.get(platform) || { platform, status:"not_connected", displayName:channelLabels[platform] });
	      return accounts.map(account => {
        const label = channelLabels[account.platform] || account.displayName || account.platform;
        const status = account.status || "not_connected";
        const setup = account.setup || {};
        const missingEnv = setup.missingEnv || channelRequiredEnv[account.platform] || [];
        const oauthConfigured = Boolean(account.oauthConfigured || setup.configured);
        const connected = Boolean(account.connected || status === "connected");
        const message = !oauthConfigured
          ? \`Missing configuration: \${missingEnv.join(", ") || "server credentials"}.\`
          : connected
            ? \`Connected as \${account.accountName || account.displayName || "account"}.\`
            : account.lastTestMessage || "Ready to connect with OAuth.";
        const connectDisabled = !oauthConfigured && status !== "expired";
        const testDisabled = !connected;
	        const disconnectDisabled = !connected;
	        const liveEnabled = Boolean(account.livePostingEnabled || state.runtime?.livePostingGates?.[account.platform]?.enabled);
	        const metaNote = ["facebook", "instagram"].includes(account.platform)
	          ? '<p class="muted" style="margin:6px 0 0">Connected through Meta. Select the Facebook Page and linked Instagram Business account when OAuth is wired.</p>'
	          : "";
	        return \`<article class="card channel-card">
          <div class="toprow">
            <div>
              <h3>\${esc(label)}</h3>
              <p class="muted" style="margin:6px 0 0">\${esc(channelDescriptions[account.platform] || "Social publishing channel.")}</p>
            </div>
            <span class="badge \${channelTone(status)}">\${channelStatusLabel(status)}</span>
	          </div>
	          <p class="muted">\${esc(message)}</p>
	          \${metaNote}
	          <p class="muted">Live posting: <strong>\${liveEnabled ? "Enabled" : "Disabled"}</strong> · Dry run: <strong>\${esc(account.lastTestStatus || "not run")}</strong></p>
	          <div class="channel-actions">
	            <button class="primary" \${connectDisabled ? "disabled" : ""} onclick="connectChannel('\${account.platform}')">Connect</button>
	            <button \${testDisabled ? "disabled" : ""} onclick="testChannel('\${account.platform}')">Run Dry Test</button>
	            <button \${disconnectDisabled ? "disabled" : ""} onclick="disconnectChannel('\${account.platform}')">Disconnect</button>
	          </div>
	          <details>
	            <summary class="muted">Admin details</summary>
	            <p class="muted">Account: \${esc(account.accountName || "not connected")}<br>Account ID: \${esc(account.accountId || account.externalAccountId || "not set")}<br>Scopes: \${esc((setup.scopes || account.scopes || []).join(", ") || "none")}<br>Missing env vars: \${esc(missingEnv.join(", ") || "none")}<br>Live gate env: \${esc((account.liveGateEnvVars || state.runtime?.livePostingGates?.[account.platform]?.envVars || []).join(" or ") || "none")}<br>Token expires: \${esc(account.tokenExpiresAt || "not set")}<br>Last tested: \${esc(account.lastTestedAt || "never")}<br>Last error: \${esc(account.lastErrorSummary || "none")}<br>OAuth configured: \${oauthConfigured ? "yes" : "no"}<br>\${esc(setup.notes || "")}</p>
	          </details>
        </article>\`;
      }).join("");
    }

    function channelFor(platform) {
      return (state.socialAccounts || []).find(account => account.platform === platform) || {};
    }

    function postReadiness(post, image) {
      const issues = [];
      const targetChannels = (post.targetChannels && post.targetChannels.length ? post.targetChannels : [post.platform]).filter(Boolean);
      const approvedLike = ["approved", "scheduled", "retry_ready"].includes(post.status);
      if (!approvedLike) issues.push("Approve the copy before scheduling.");
      if (post.complianceRisk === "high") issues.push("High-risk post needs final human/legal review.");
      if (!image) issues.push("Generate or upload an image.");
      else if (image.generationStatus !== "generated") issues.push("Image needs regeneration or replacement.");
      else if (!post.imageFinalized) issues.push("Finalize the image.");
      if (post.imageFinalized && !post.finalPreviewConfirmed) issues.push("Confirm the final preview.");
      const styleGate = image?.styleGate || image?.creativeDirection?.styleGate;
      if (image && styleGate && styleGate.passed === false) issues.push(styleGate.message || "Regenerate image in Techno Afro-Futurist Concept style.");
      if (image && ["generated_with_logo_asset_anchoring", "openai_image_generation_with_logo_reference"].includes(String(image.logoReferenceMode || ""))) {
        issues.push("Regenerate image without embedded logo.");
      }
      if (!targetChannels.length) issues.push("Choose at least one channel.");
	      for (const channel of targetChannels) {
	        const account = channelFor(channel);
	        if (!account.configured && !account.oauthConfigured) issues.push(\`\${platformLabels[channel] || channel} needs OAuth setup.\`);
	        else if (!account.connected) issues.push(\`\${platformLabels[channel] || channel} is not connected.\`);
	        const channelText = post.channelAdaptations?.[channel]?.text || composePreviewText(post);
	        if (channel === "x" && channelText.length > 280) issues.push("X / Twitter copy is over 280 characters.");
	        if (channel === "instagram" && image && image.aspectRatio !== "1:1" && !(image.finalImageWidth && image.finalImageWidth === image.finalImageHeight)) {
	          issues.push("Instagram needs a square final PNG.");
	        }
	      }
      if (approvedLike && !post.scheduledFor) issues.push("Pick a scheduled time.");
      const watermarkPosition = image?.watermarkPosition || image?.assetBundleUsed?.watermark?.position || "none";
      const summary = !issues.length
        ? "Ready for scheduled publishing."
        : issues[0];
      const tone = !issues.length ? "good" : issues.length <= 2 ? "warn" : "danger";
      return {
        ok: !issues.length,
        tone,
        summary,
        issues,
        watermarkPosition,
        targetChannels
      };
    }

    function composePreviewText(post) {
      return [post.hook, "", post.body, "", post.cta, "", (post.hashtags || []).join(" ")]
        .join("\\n")
        .replace(/\\n{3,}/g, "\\n\\n")
        .trim();
    }

    function readyToPublishPosts() {
      return state.posts
        .filter(post => ["approved", "scheduled", "retry_ready"].includes(post.status))
        .map(post => ({ post, image: imageForPost(post.id) }))
        .filter(({ post, image }) => image && post.imageFinalized && post.finalPreviewConfirmed)
        .sort((a, b) => String(a.post.scheduledFor || "9999").localeCompare(String(b.post.scheduledFor || "9999")))
        .slice(0, 4);
    }

    function readyReviewHtml() {
      const items = readyToPublishPosts();
      if (!items.length) {
        return \`<div class="panel">
          <div class="eyebrow">Ready to publish</div>
          <h2>No final-ready posts yet.</h2>
          <p class="muted">The next post appears here after copy is approved, an image is finalized, and the final preview is confirmed.</p>
        </div>\`;
      }
      return \`<div class="grid review-strip">\${items.map(({ post, image }) => {
        const readiness = postReadiness(post, image);
        const targetChannels = readiness.targetChannels.length ? readiness.targetChannels : [post.platform];
        const watermarkPosition = image?.watermarkPosition || image?.assetBundleUsed?.watermark?.position || "none";
        return \`<article class="card review-card">
          <div class="toprow">
            <div>
              <span class="badge info">\${esc(targetChannels.map(channel => platformLabels[channel] || channel).join(", "))}</span>
              <span class="badge \${readiness.tone}">\${readiness.ok ? "Ready" : "Needs setup"}</span>
            </div>
            <button onclick="checkPublishing('\${post.id}')">Check</button>
          </div>
          <div class="image-preview">\${postImageMarkup(image, post)}</div>
          <div class="review-meta">
            <strong>\${esc(post.title)}</strong>
            <span class="muted">Scheduled: \${esc(post.scheduledFor || "not scheduled")} · Watermark: \${esc(watermarkLabels[watermarkPosition] || "No watermark")}</span>
            <div class="post-body review-caption">\${esc(composePreviewText(post))}</div>
          </div>
          \${readiness.ok ? \`<button class="primary" onclick="runPublishingWorker()">Run due posts</button>\` : \`<p class="muted">\${esc(readiness.summary)}</p>\`}
        </article>\`;
      }).join("")}</div>\`;
    }

    function todayReviewPosts() {
      const reviewableStatuses = ["draft", "needs_review", "approved", "failed", "blocked_channel_not_connected", "retry_ready"];
      const priority = { strong: 0, needs_rewrite: 1, rejected: 2 };
      const dailyTarget = Math.max(3, Number(state.settings?.dailyTarget || state.settings?.dailyAutomation?.target || 3));
      return state.posts
        .filter(post => reviewableStatuses.includes(post.status))
        .filter(post => post.status !== "rejected")
        .sort((a, b) => {
          const scoreA = priority[a.qualityLabel || "strong"] ?? 1;
          const scoreB = priority[b.qualityLabel || "strong"] ?? 1;
          if (scoreA !== scoreB) return scoreA - scoreB;
          return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
        })
        .slice(0, dailyTarget + 2);
    }

    function clampReviewIndex(posts) {
      if (!posts.length) {
        reviewIndex = 0;
        return;
      }
      if (reviewIndex >= posts.length) reviewIndex = 0;
      if (reviewIndex < 0) reviewIndex = posts.length - 1;
    }

    function nextStepForPost(post, image, readiness) {
      const workflow = workflowStageForPost(post, image);
      return { label: workflow.actionLabel, action: workflow.action };
    }

    function manualPostingReady(post, image) {
      if (!post || !image) return false;
      const workflow = wilmaWorkflowForPost(post, image);
      const readiness = wilmaReadiness(post, image, workflow);
      return Boolean(
        readiness.ready &&
        post.finalPreviewConfirmed &&
        ["approved", "scheduled", "retry_ready"].includes(post.status)
      );
    }

    function firstQueueNextAction(post, image) {
      return workflowStageForPost(post, image).label;
    }

    function firstQueueReviewHtml() {
      const ids = state.settings?.firstQueueReviewPostIds || [];
      const posts = ids.map(id => state.posts.find(post => post.id === id)).filter(Boolean);
      if (!posts.length) return "";
      return \`<div class="panel">
        <div class="toprow">
          <div>
            <div class="eyebrow">First Queue Review</div>
            <h2 style="margin:4px 0 0">Tomorrow's 3-post queue</h2>
            <p class="muted" style="margin:8px 0 0">Manual Mode is safest for the first 24 hours. Review copy, generate final images, then copy/export manually.</p>
          </div>
          <span class="badge warn">Manual Mode</span>
        </div>
        <div class="grid three" style="margin-top:14px">\${posts.map(post => {
          const image = imageForPost(post.id);
          const channels = (post.targetChannels || [post.platform]).filter(Boolean);
          const finalImageStatus = post.imageFinalized && post.finalPreviewConfirmed ? "final PNG ready" : post.imageStatus || image?.generationStatus || "missing";
          const approval = ["approved", "scheduled", "retry_ready"].includes(post.status) ? "approved" : "not approved";
          const workflow = workflowStageForPost(post, image);
          const nextAction = workflow.label;
          return \`<article class="card">
            <div class="toprow">
              <span class="badge \${toneForRisk(post.complianceRisk)}">\${riskLabel(post.complianceRisk)}</span>
              <span class="badge \${workflow.tone}">\${esc(nextAction)}</span>
            </div>
            <h3>\${esc(post.title)}</h3>
            <p class="muted"><strong>Audience:</strong> \${audienceLabels[post.audience] || esc(post.audience || "General")}<br><strong>Channels:</strong> \${esc(channels.map(channel => platformLabels[channel] || channel).join(", "))}<br><strong>Image variant:</strong> \${esc(post.imageVariantLabel || "Techno Afro-Futurist Concept")}<br><strong>Final image:</strong> \${esc(finalImageStatus)}<br><strong>Approval:</strong> \${esc(approval)}</p>
            <p class="post-body">\${esc(post.hook)}</p>
          </article>\`;
        }).join("")}</div>
      </div>\`;
    }

	    function finalPngDetailsHtml(post, image) {
	      const ready = finalPngReady(post, image);
	      const watermarkPosition = image?.watermarkPosition || image?.assetBundleUsed?.watermark?.position || "none";
	      const textMode = image?.textRenderingMode || image?.assetBundleUsed?.finalImage?.textRenderingMode || "pending";
	      const size = image?.finalImageWidth && image?.finalImageHeight ? image.finalImageWidth + " x " + image.finalImageHeight : image?.aspectRatio || "pending";
	      const timestamp = image?.assetBundleUsed?.finalImage?.createdAt || image?.createdAt || "not generated";
	      const finalMeta = image?.assetBundleUsed?.finalImage || {};
	      const finalUrl = ready ? image?.finalPngUrl || image?.finalImageUrl || image?.imageUrl || finalMeta.url || "" : "";
	      const localPath = finalMeta.localPath || image?.finalPngPath || "";
	      const fileSize = Number(finalMeta.fileSize || image?.finalPngFileSize || 0);
	      const fileSizeLabel = fileSize ? \`\${(fileSize / 1024 / 1024).toFixed(1)} MB\` : "pending";
	      return \`<details class="readiness-card \${ready ? "good" : "warn"}">
	        <summary><span class="readiness-title">\${ready ? "PNG generated" : "Final PNG missing"}</span></summary>
	        <p class="muted" style="margin:8px 0 0">Baked overlay: \${textMode === "baked_overlay" ? "included" : textMode === "no_text_overlay" ? "no overlay selected" : "pending"} · Watermark: \${esc(watermarkLabels[watermarkPosition] || "No watermark")} · Export size: \${esc(size)} · File size: \${esc(fileSizeLabel)} · Last generated: \${esc(timestamp)}\${finalUrl ? \`<br><strong>URL:</strong> <code>\${esc(finalUrl)}</code>\` : ""}\${localPath ? \`<br><strong>Local path:</strong> <code>\${esc(localPath)}</code>\` : ""}</p>
	      </details>\`;
	    }

    function exportKitChecklistItem(label, ok) {
      return \`<li class="\${ok ? "done" : ""}"><span>\${ok ? "[x]" : "[ ]"}</span>\${esc(label)}</li>\`;
    }

    function postingPackageHtml(post, kit) {
      const pkg = post.postingPackage || kit.postingPackage || {};
      const ready = Boolean(post.postingPackageGenerated || pkg.generated);
      const files = pkg.fileList || post.postingPackageFileList || [];
      const link = pkg.downloadUrl || post.postingPackageDownloadUrl || "";
      const zipLink = pkg.zipDownloadUrl || post.postingPackageZipDownloadUrl || (ready ? \`/api/posts/\${encodeURIComponent(post.id)}/posting-package-zip\` : "");
      const zipSize = Number(pkg.zipFileSize || post.postingPackageZipFileSize || 0);
      const zipLabel = zipSize ? \` · ZIP \${(zipSize / 1024 / 1024).toFixed(1)} MB\` : "";
      return \`<div class="readiness-card \${ready ? "good" : "warn"}" style="margin-top:12px">
        <div class="toprow">
          <div class="readiness-title">\${ready ? "Posting Package Ready" : "Posting Package"}</div>
          \${ready ? \`<div class="card-actions"><a class="button-link primary" href="\${esc(zipLink)}">Download Posting ZIP</a>\${link ? \`<a class="button-link" href="\${esc(link)}" target="_blank">Open Metadata</a>\` : ""}</div>\` : \`<button onclick="exportPostingPackage('\${post.id}')" \${kit.manualPostingKitReady || post.manualPostingKitReady ? "" : "disabled"}>Export Posting Package</button>\`}
        </div>
        <p class="muted" style="margin:0">\${ready ? \`Saved at <code>\${esc(pkg.relativePath || pkg.path || post.postingPackagePath || "")}</code>\${zipLabel}\` : "Creates final.png plus caption, hashtags, alt text, notes, and metadata for manual posting."}</p>
        <details>
          <summary>Package contents</summary>
          <ul class="compact-list">\${(files.length ? files : ["final.png", "caption.txt", "hashtags.txt", "alt-text.txt", "posting-notes.txt", "metadata.json"]).map(file => \`<li>\${esc(file)}</li>\`).join("")}\${ready ? \`<li>\${esc(pkg.zipFilename || (slugify(post.id || "post") + "-posting-kit.zip"))}</li>\` : ""}</ul>
        </details>
      </div>\`;
    }

    function finalExportKitHtml(post, image) {
      if (!finalPngReady(post, image) && post.imageWorkflowState !== "Ready for Manual Posting") return "";
      const workflow = wilmaWorkflowForPost(post, image);
      const kit = finalExportKitForPost(post, image, workflow);
	      const ready = Boolean(kit.finalPngReady && kit.caption && kit.altText && kit.platformFormatId && kit.livePostingDisabled);
		      const downloadLabel = kit.downloadUrl ? "Download Final PNG" : "Create Final PNG first";
		      const downloadButton = kit.downloadUrl
		        ? \`<a class="button-link primary" href="\${esc(kit.downloadUrl)}" download="\${esc(kit.exportFilename)}">\${downloadLabel}</a>\`
		        : \`<button class="primary" disabled>\${downloadLabel}</button>\`;
	      const generatedLabel = kit.finalPngGeneratedAt ? new Date(kit.finalPngGeneratedAt).toLocaleString() : "Not generated";
	      const fileSizeLabel = kit.finalPngFileSize ? \`\${(kit.finalPngFileSize / 1024 / 1024).toFixed(1)} MB\` : "pending";
	      return \`<section class="final-export-kit \${ready ? "good" : "warn"}">
        <div class="toprow">
          <div>
            <div class="eyebrow">Final PNG Export Kit</div>
            <h3>Manual asset package</h3>
          </div>
          <span class="badge \${ready ? "good" : "warn"}">\${ready ? "Export ready" : "Needs checks"}</span>
        </div>
        <div class="export-grid">
          <div class="export-preview">
            <div class="image-preview">\${postImageMarkup(image, post)}</div>
            <div class="export-actions">
              \${downloadButton}
              <button onclick="copyExportField('\${post.id}','filename')">Copy filename</button>
            </div>
          </div>
	          <div class="export-meta">
	            <label>Platform format<select id="export-format-\${post.id}" onchange="previewExportFormat('\${post.id}', this.value)">
	              \${finalExportPlatformFormats.map(format => \`<option value="\${format.id}" \${format.id === kit.platformFormatId ? "selected" : ""}>\${format.label} · \${format.width}x\${format.height}</option>\`).join("")}
	            </select></label>
		            <p class="muted"><strong>PNG:</strong> \${kit.finalPngReady ? "generated" : "not generated"}<br><strong>Filename:</strong> <code>\${esc(kit.exportFilename)}</code><br><strong>Generated:</strong> \${esc(generatedLabel)}</p>
	            <details>
	              <summary>Details</summary>
	              <p class="muted"><strong>Platform:</strong> \${esc(platformLabels[kit.platform] || kit.platform)}<br><strong>Dimensions:</strong> \${esc(kit.dimensions)}<br><strong>Bucket:</strong> \${esc(kit.contentBucket)}<br><strong>Wilma:</strong> \${esc(kit.wilmaExpression || "n/a")} · \${esc(kit.wilmaPoseReference || kit.wilmaPoseReferenceId || "pose pending")}<br><strong>Overlay:</strong> \${esc(kit.overlayText || "No overlay")}\${kit.finalPngPath ? \`<br><strong>Saved at:</strong> <code>\${esc(kit.finalPngPath)}</code>\` : ""}<br><strong>File size:</strong> \${esc(fileSizeLabel)}</p>
	            </details>
            <ul class="export-checklist">
              \${exportKitChecklistItem("final PNG ready", kit.finalPngReady)}
              \${exportKitChecklistItem("caption ready", Boolean(kit.caption))}
              \${exportKitChecklistItem("hashtags ready", Boolean(kit.hashtags))}
              \${exportKitChecklistItem("alt text ready", Boolean(kit.altText))}
              \${exportKitChecklistItem("platform selected", Boolean(kit.platformFormatId))}
              \${exportKitChecklistItem("live posting disabled", kit.livePostingDisabled)}
              \${exportKitChecklistItem("operator must post manually", kit.operatorMustPostManually)}
            </ul>
            <button class="primary" onclick="markManualPostingKitReady('\${post.id}')">\${kit.manualPostingKitReady ? "Manual Posting Kit Ready" : "Mark Manual Posting Kit Ready"}</button>
            \${postingPackageHtml(post, kit)}
          </div>
        </div>
        <div class="export-copy-grid">
          <div><strong>Caption</strong><p class="post-body">\${esc(kit.caption || "")}</p><button onclick="copyExportField('\${post.id}','caption')">Copy caption</button></div>
          <div><strong>Hashtags</strong><p class="post-body">\${esc(kit.hashtags || "No hashtags")}</p><button onclick="copyExportField('\${post.id}','hashtags')">Copy hashtags</button></div>
          <div><strong>Alt text</strong><p class="post-body">\${esc(kit.altText || "")}</p><button onclick="copyExportField('\${post.id}','altText')">Copy alt text</button></div>
          <div><strong>Posting notes</strong><p class="post-body">\${esc(kit.postingNotes || "")}</p><button onclick="copyExportField('\${post.id}','postingNotes')">Copy posting notes</button></div>
        </div>
      </section>\`;
    }

    function manualPostingKitHtml(post, image) {
      if (!manualPostingReady(post, image)) return "";
      const targetChannels = (post.targetChannels && post.targetChannels.length ? post.targetChannels : [post.platform]).filter(Boolean);
      return \`<div class="readiness-card good">
        <div class="toprow">
          <div class="readiness-title">Manual Posting Kit</div>
          <button onclick="markManuallyPosted('\${post.id}')">Mark Manually Posted</button>
        </div>
        <p class="muted" style="margin:0"><strong>Selected channels:</strong> \${esc(targetChannels.map(channel => platformLabels[channel] || channel).join(", "))}</p>
        \${targetChannels.map(channel => \`<div style="margin-top:10px"><p class="muted" style="margin:0"><strong>\${esc(platformLabels[channel] || channel)} copy</strong></p><p class="post-body" style="margin:0">\${esc(post.channelAdaptations?.[channel]?.text || composePreviewText(post))}</p><button onclick="copyChannelText('\${post.id}','\${channel}')">Copy \${esc(platformLabels[channel] || channel)} text</button></div>\`).join("")}
        <ul class="readiness-list">
          <li>Copy caption</li>
          <li>Download or use final image preview</li>
          <li>Post on selected channel</li>
          <li>Mark as manually posted</li>
        </ul>
      </div>\`;
    }

    function firstDayQaChecklistHtml() {
      const items = [
        "Did the image feel semi-abstract, modern, techno, and Afro-futurist inspired?",
        "Did the overlay improve the post?",
        "Did the caption fit the channel?",
        "Did anything feel legally risky?",
        "Was the final PNG easy to find?",
        "Was manual posting easy?"
      ];
      return \`<div class="panel">
        <div class="eyebrow">First-Day QA Checklist</div>
        <h2 style="margin:4px 0 0">Manual run quality check</h2>
        <ul class="readiness-list" style="margin-top:14px">\${items.map(item => \`<li>\${esc(item)}</li>\`).join("")}</ul>
      </div>\`;
    }

    function todayReviewHtml() {
      const posts = todayReviewPosts();
      clampReviewIndex(posts);
      if (!posts.length) {
        return \`<div class="panel">
          <div class="eyebrow">Today's Review</div>
          <h2>Start with tomorrow's 3-post queue.</h2>
          <p class="muted">Manual Mode is safest for the first 24 hours. Generate, review, create final images, then copy/export manually.</p>
          <button class="primary" onclick="createTomorrowQueue()">Create Tomorrow's 3-Post Queue</button>
        </div>\`;
      }
      const post = posts[reviewIndex];
      const image = imageForPost(post.id);
      const readiness = postReadiness(post, image);
      const nextStep = nextStepForPost(post, image, readiness);
      const sourceLabel = [post.sourceType || "manual_note", post.sourceUrl || ""].filter(Boolean).join(" · ");
      const targetChannels = readiness.targetChannels.length ? readiness.targetChannels : [post.platform];
      const watermarkPosition = image?.watermarkPosition || image?.assetBundleUsed?.watermark?.position || "none";
      const overlay = overlayTextForPost(post);
      const workflow = workflowStageForPost(post, image);
      return \`<div class="panel">
        <div class="review-progress">
          <div>
            <div class="eyebrow">Today's Review</div>
            <strong>\${reviewIndex + 1} of \${posts.length}</strong>
          </div>
          <div class="row">
            <button onclick="nextReview(-1)">Previous</button>
            <button onclick="nextReview(1)">Next</button>
          </div>
        </div>
        <div class="operator-review">
          <div class="operator-copy">
            <div>
              <span class="badge info">\${esc(targetChannels.map(channel => platformLabels[channel] || channel).join(", "))}</span>
              <span class="badge">\${statusLabels[post.status] || post.status}</span>
              <span class="badge \${workflow.tone}">\${esc(workflow.label)}</span>
              <span class="badge \${qualityTone(post.qualityLabel)}">\${qualityLabels[post.qualityLabel] || "Strong"}</span>
              \${post.contentScore ? \`<span class="badge info">Score \${Number(post.contentScore).toFixed(1)}</span>\` : ""}
              <span class="badge \${toneForRisk(post.complianceRisk)}">\${riskLabel(post.complianceRisk)}</span>
            </div>
            <h2>\${esc(post.hook || post.title)}</h2>
            <p class="post-body">\${esc(post.body)}</p>
            <p><strong>\${esc(post.cta)}</strong></p>
            <p class="muted">Source: \${esc(sourceLabel || "manual note")}<br>\${speakerLabels[post.speaker] || "LegalEase"} · \${esc(post.contentBucket || "Trust & Guidance")} · \${audienceLabels[post.audience] || "General"}</p>
            <div class="operator-next \${workflow.tone}">
              <div class="toprow"><strong>Next required step</strong><span class="badge \${workflow.tone}">\${esc(workflow.label)}</span></div>
              <div class="muted">\${esc(workflow.actionLabel)}</div>
              \${!post.copyReviewed && post.complianceRisk !== "low" ? \`<p class="muted" style="margin:0">This post mentions eligibility, process, or legal outcomes. Review carefully before using.</p>\` : ""}
              \${readiness.issues.length ? \`<ul class="readiness-list">\${readiness.issues.slice(0, 3).map(issue => \`<li>\${esc(issue)}</li>\`).join("")}</ul>\` : \`<p class="muted" style="margin:0">Scheduled: \${esc(post.scheduledFor || "not scheduled")} · Watermark: \${esc(watermarkLabels[watermarkPosition] || "No watermark")}</p>\`}
            </div>
            <div class="operator-actions">
              <button class="primary primary-action" onclick="\${nextStep.action}">\${esc(nextStep.label)}</button>
              <button onclick="markCopyReviewed('\${post.id}')" \${post.copyReviewed ? "disabled" : ""}>Copy Reviewed</button>
              <button onclick="regenerateImage('\${post.id}')">\${image ? "Regenerate image" : "Generate image"}</button>
              <button onclick="confirmOverlay('\${post.id}')" \${post.overlayConfirmed ? "disabled" : ""}>Overlay Confirmed</button>
              \${image && !post.imageFinalized ? \`<button onclick="finalizeImage('\${post.id}')">Use image</button>\` : \`<button \${image ? "" : "disabled"} onclick="confirmPreview('\${post.id}')">Confirm preview</button>\`}
              <button onclick="quickSchedule('\${post.id}')" \${post.imageFinalized && post.finalPreviewConfirmed ? "" : "disabled"}>Schedule</button>
              <button class="danger-btn" onclick="setStatus('\${post.id}','rejected')">Reject</button>
            </div>
            <details class="operator-edit">
              <summary>Edit copy</summary>
              <form onsubmit="editPost(event,'\${post.id}')" style="margin-top:10px">
                <input name="hook" value="\${esc(post.hook)}">
                <textarea name="body">\${esc(post.body)}</textarea>
                <input name="cta" value="\${esc(post.cta)}">
                <button class="primary">Save edits</button>
              </form>
            </details>
            <details class="operator-edit" open>
              <summary>Edit image text overlay</summary>
              <form onsubmit="editOverlayText(event,'\${post.id}')" style="margin-top:10px">
                <label>Overlay mode<select name="overlayMode">
                  <option value="text" \${post.overlayMode === "none" ? "" : "selected"}>Text overlay</option>
                  <option value="none" \${post.overlayMode === "none" ? "selected" : ""}>No text overlay</option>
                </select></label>
                <label>Kicker / category<input name="overlayKicker" maxlength="38" value="\${esc(overlay.kicker)}"></label>
                <label>Image headline<textarea name="overlayHeadline" maxlength="120">\${esc(overlay.headline)}</textarea></label>
                <label>Support line<textarea name="overlaySupport" maxlength="160">\${esc(overlay.support)}</textarea></label>
                <div class="row"><button class="primary">Update image text</button><button type="button" onclick="disableOverlayText('\${post.id}')">No text</button><button type="button" onclick="resetOverlayText('\${post.id}')">Reset overlay</button></div>
              </form>
            </details>
          </div>
          <div class="operator-preview">
            <div class="image-preview">\${postImageMarkup(image, post)}</div>
            <div class="row">
              \${image ? \`<label style="min-width:210px">Watermark<select onchange="setWatermark('\${post.id}', this.value)">
                \${watermarkPositions.map(position => \`<option value="\${position}" \${position === watermarkPosition ? "selected" : ""}>\${watermarkLabels[position]}</option>\`).join("")}
              </select></label>\` : '<span class="muted">No image yet.</span>'}
              <input id="review-upload-\${post.id}" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none" onchange="uploadImage('\${post.id}', this)">
              <button onclick="document.querySelector('#review-upload-\${post.id}').click()">Upload image</button>
            </div>
            <p class="muted">Image: \${esc(image?.generationStatus || "not generated")} · Visual: \${esc(post.visualBucket || image?.visualBucket || "pending")} · Final preview: \${post.finalPreviewConfirmed ? "confirmed" : "not confirmed"}</p>
            \${wilmaImagePanelHtml(post, image)}
            \${finalPngDetailsHtml(post, image)}
            \${finalExportKitHtml(post, image)}
            \${manualPostingKitHtml(post, image)}
            <details class="operator-edit">
              <summary>Operator Notes</summary>
              <form onsubmit="saveOperatorNotes(event,'\${post.id}')" style="margin-top:10px">
                <textarea name="operatorNotes" placeholder="Image looked generic, overlay too wordy, caption needs more Roger voice, risky legal language, reuse this format...">\${esc(post.operatorNotes || "")}</textarea>
                <button class="primary">Save notes</button>
              </form>
            </details>
          </div>
        </div>
      </div>\`;
    }

    function setupChecklistHtml() {
      const linkedin = channelFor("linkedin");
      const linkedinMissing = linkedin.setup?.missingEnv || channelRequiredEnv.linkedin || [];
      const schemaStale = Boolean(state.schemaStatus?.stale);
      const storageReady = state.persistence === "supabase" ? Boolean(supabaseHealth?.connected) && !schemaStale : false;
      const linkedinConfigured = Boolean(linkedin.oauthConfigured || linkedin.setup?.configured);
      const linkedinConnected = Boolean(linkedin.connected);
      const liveLinkedIn = Boolean(state.runtime?.liveLinkedInPostingEnabled);
      const checks = [
        {
          title: "Supabase schema",
          ok: storageReady,
          body: storageReady
            ? "Supabase is connected. The production data store is active."
            : schemaStale
            ? "Supabase schema needs update. Run the latest schema.sql before launch."
            : "Run the updated Supabase schema so production tables include source, image finalization, and final preview fields.",
          detail: schemaStale ? state.schemaStatus.detail : "Schema file: supabase/schema.sql"
        },
        {
          title: "LinkedIn OAuth credentials",
          ok: linkedinConfigured,
          body: linkedinConfigured
            ? "Server-side LinkedIn OAuth configuration is present."
            : \`Missing env vars: \${linkedinMissing.join(", ") || "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI"}.\`,
          detail: "Add credentials to .env.local. Values are never shown in the browser."
        },
        {
          title: "LinkedIn account connection",
          ok: linkedinConnected,
          body: linkedinConnected
            ? \`Connected as \${linkedin.accountName || "LinkedIn account"}.\`
            : "After credentials are present, use Settings -> Channels -> LinkedIn -> Connect.",
          detail: "OAuth tokens stay encrypted server-side."
        },
        {
          title: "Live LinkedIn posting flag",
          ok: liveLinkedIn,
          body: liveLinkedIn
            ? "Live LinkedIn posting is enabled."
            : "Keep live posting off until OAuth is tested. Enable with ENABLE_LIVE_LINKEDIN_POSTING=true.",
          detail: "The app will not fake successful publishing."
        }
      ];
      return checks.map(check => \`<div class="setup-item \${check.ok ? "good" : "warn"}">
        <div class="toprow"><strong>\${esc(check.title)}</strong><span class="badge \${check.ok ? "good" : "warn"}">\${check.ok ? "Done" : "Needs setup"}</span></div>
        <p class="muted" style="margin:8px 0 0">\${esc(check.body)}</p>
        <p class="muted" style="margin:6px 0 0">\${esc(check.detail)}</p>
      </div>\`).join("");
    }

    function credentialReadinessHtml() {
      const items = state.runtime?.credentialReadiness || [];
      const groups = ["core", "openai", "supabase", "linkedin", "meta", "threads", "x", "live-gate"];
      const groupLabels = {
        core: "Core",
        openai: "OpenAI",
        supabase: "Supabase",
        linkedin: "LinkedIn",
        meta: "Meta / Facebook + Instagram",
        threads: "Threads",
        x: "X / Twitter",
        "live-gate": "Live posting gates"
      };
      return groups.map(group => {
        const rows = items.filter(item => item.category === group);
        if (!rows.length) return "";
        return \`<div class="panel">
          <h3>\${esc(groupLabels[group] || group)}</h3>
          <div class="grid">\${rows.map(item => {
            const ok = item.status === "present" && (item.validLooking || item.category === "live-gate");
            const gate = item.category === "live-gate";
            const badgeText = gate ? (item.enabled ? "Enabled" : "Disabled") : item.status === "present" ? (item.validLooking ? "Present" : "Check") : "Missing";
            const tone = gate ? (item.enabled ? "warn" : "good") : ok ? "good" : "warn";
            return \`<div class="setup-item \${tone}">
              <div class="toprow"><strong>\${esc(item.label)}</strong><span class="badge \${tone}">\${esc(badgeText)}</span></div>
              <p class="muted" style="margin:6px 0 0">\${esc(item.key)} · \${esc(item.severity)}</p>
              <p class="muted" style="margin:6px 0 0">\${esc(item.description)}</p>
              <p class="muted" style="margin:6px 0 0"><strong>Next:</strong> \${esc(item.nextAction)}</p>
            </div>\`;
          }).join("")}</div>
        </div>\`;
      }).join("");
    }

    function linkedInDryTestChecklistHtml() {
      const account = channelFor("linkedin");
      const hasFinalPng = state.posts.some(post => {
        const image = imageForPost(post.id);
        return image?.generationStatus === "generated" && post.imageFinalized && post.finalPreviewConfirmed;
      });
      const checks = [
        { label:"LinkedIn OAuth credentials present", ok:Boolean(account.oauthConfigured || account.setup?.configured) },
        { label:"OAuth token encryption key present", ok:Boolean(state.runtime?.oauthTokenEncryptionConfigured) },
        { label:"LinkedIn redirect URI configured", ok:!(account.setup?.missingEnv || []).includes("LINKEDIN_REDIRECT_URI") },
        { label:"LinkedIn account connected", ok:Boolean(account.connected) },
        { label:"Target profile or organization selected", ok:Boolean(account.accountName || account.accountId) },
        { label:"At least one final PNG exists for a test post", ok:hasFinalPng },
        { label:"Live LinkedIn gate remains disabled", ok:!Boolean(state.runtime?.livePostingGates?.linkedin?.enabled) }
      ];
      return \`<div class="panel">
        <div class="toprow">
          <div>
            <div class="eyebrow">LinkedIn connect test</div>
            <h2 style="margin:4px 0 0">Dry test, no publishing</h2>
            <p class="muted" style="margin:8px 0 0">Checks auth state, payload readiness, final PNG availability, and the live gate.</p>
          </div>
          <button onclick="runLinkedInDryTest()">Run LinkedIn Dry Test</button>
        </div>
        <ul class="readiness-list" style="margin-top:14px">\${checks.map(check => \`<li><span class="badge \${check.ok ? "good" : "warn"}">\${check.ok ? "Pass" : "Needs setup"}</span> \${esc(check.label)}</li>\`).join("")}</ul>
      </div>\`;
    }

    function dailyRhythmHtml() {
      const steps = [
        "Add sources",
        "Generate queue",
        "Review copy",
        "Generate images",
        "Regenerate weak images",
        "Edit overlay text",
        "Use image to bake final PNG",
        "Confirm final preview",
        "Run dry test",
        "Approve post",
        "Manually post or schedule after launch readiness passes"
      ];
      return \`<div class="panel">
        <div class="eyebrow">Daily operating rhythm</div>
        <h2 style="margin:4px 0 0">LegalEase Social Command Center Rhythm</h2>
        <ol class="readiness-list" style="margin-top:14px">\${steps.map(step => \`<li>\${esc(step)}</li>\`).join("")}</ol>
      </div>\`;
    }

    function manualModeHtml() {
      const active = Boolean(state.runtime?.manualModeActive);
      return \`<div class="panel \${active ? "warn" : "good"}">
        <div class="toprow">
          <div>
            <div class="eyebrow">Publishing mode</div>
            <h2 style="margin:4px 0 0">\${active ? "Manual Mode Active" : "Live gates enabled"}</h2>
            <p class="muted" style="margin:8px 0 0">\${active ? "The system can generate posts and final images. You manually copy, export, or post while live API posting remains disabled." : "At least one live gate is enabled. Use only after dry runs pass cleanly."}</p>
          </div>
          <button onclick="createTomorrowQueue()">Create Tomorrow's 3-Post Queue</button>
        </div>
      </div>\`;
    }

	    function launchChecklistHtml() {
	      const latestImage = (state.postImages || [])[0];
	      const latestStyleGate = latestImage?.styleGate || latestImage?.creativeDirection?.styleGate;
	      const finalImages = (state.postImages || []).filter(image => image.finalImageReady || image.textRenderingMode === "baked_overlay" || image.assetBundleUsed?.finalImage?.ready);
      const readyPosts = state.posts.filter(post => {
        const image = imageForPost(post.id);
        return ["approved", "scheduled", "retry_ready"].includes(post.status) && post.imageFinalized && post.finalPreviewConfirmed && image?.generationStatus === "generated";
      });
	      const channelLaunchChecks = platforms.flatMap(platform => {
	        const account = channelFor(platform);
	        const configured = Boolean(account.oauthConfigured || account.setup?.configured);
	        const connected = Boolean(account.connected);
	        const gate = state.runtime?.livePostingGates?.[platform] || {};
	        const readyCount = readyPosts.filter(post => (post.targetChannels?.length ? post.targetChannels : [post.platform]).includes(platform)).length;
	        return [
	          {
	            title: (platformLabels[platform] || platform) + " ready",
	            ok: configured && connected,
	            body: connected ? "Connected as " + (account.accountName || platformLabels[platform]) + "." : configured ? "OAuth is configured, but no account is connected." : "Missing: " + ((account.setup?.missingEnv || channelRequiredEnv[platform] || []).join(", ")) + ".",
	            action: "Use Settings > Channels > " + (platformLabels[platform] || platform) + " to connect or reconnect."
	          },
	          {
	            title: (platformLabels[platform] || platform) + " live gate",
	            ok: Boolean(gate.enabled),
	            body: gate.enabled ? "Live posting gate is enabled." : "Live posting is disabled, which is safe for testing.",
	            action: "Enable " + (((gate.envVars || []).join(" or ")) || "the channel live gate") + " only after dry runs pass."
	          },
	          {
	            title: (platformLabels[platform] || platform) + " approved final PNG",
	            ok: readyCount > 0,
	            body: readyCount ? readyCount + " approved post" + (readyCount === 1 ? "" : "s") + " have final image previews for this channel." : "No approved final-PNG post is ready for this channel yet.",
	            action: "Approve copy, use image, confirm preview, and schedule to this channel."
	          }
	        ];
	      });
	      const checks = [
        {
          title: "Production data store",
          ok: state.persistence === "supabase" && Boolean(supabaseHealth?.connected),
          body: state.persistence === "supabase" && supabaseHealth?.connected ? "Supabase is connected." : "Still using local JSON fallback. Supabase should be connected before launch.",
          action: "Run the latest supabase/schema.sql and set SUPABASE_URL plus server-side keys."
        },
        {
          title: "OpenAI content and image key",
          ok: Boolean(state.runtime?.openAIConfigured),
          body: state.runtime?.openAIConfigured ? \`OpenAI key detected. Image model: \${state.runtime?.imageModel || "gpt-image-1"}.\` : "OPENAI_API_KEY is missing.",
          action: "Add OPENAI_API_KEY in production and confirm billing limits."
        },
        {
          title: "Final image composer",
          ok: finalImages.length > 0,
          body: finalImages.length ? \`\${finalImages.length} final composed image\${finalImages.length === 1 ? "" : "s"} ready with baked overlay text/watermark.\` : "No final composed images yet.",
          action: "Use image on a queue item to bake overlay text into the publishable asset."
        },
	        {
	          title: "Token encryption",
          ok: Boolean(state.runtime?.oauthTokenEncryptionConfigured),
          body: state.runtime?.oauthTokenEncryptionConfigured ? "OAuth token encryption key is configured." : "OAUTH_TOKEN_ENCRYPTION_KEY is missing.",
          action: "Set a long random OAUTH_TOKEN_ENCRYPTION_KEY before real OAuth."
        },
	        ...channelLaunchChecks,
	        {
	          title: "No live posting without approved final PNG",
	          ok: readyPosts.length > 0,
		          body: readyPosts.length ? readyPosts.length + " approved post" + (readyPosts.length === 1 ? "" : "s") + " have final previews confirmed." : "No approved final-PNG post is ready yet.",
	          action: "Every live post must be approved and use a final composed PNG."
	        },
        {
          title: "Last image generation",
          ok: latestImage?.generationStatus === "generated",
          body: latestImage?.generationStatus === "generated" ? \`Latest image is generated: \${latestImage.generationMode || latestImage.imageStatus || "ready"}.\` : \`Latest image is not ready: \${latestImage?.generationError || "no image generated yet"}.\`,
          action: "Regenerate or upload a replacement image if needed."
        },
        {
          title: "Techno Afro-Futurist image style",
          ok: latestImage?.generationStatus === "generated" && (!latestStyleGate || latestStyleGate.passed !== false),
          body: latestImage ? \`Style: \${imageStyleLabel(latestImage)}. Variant: \${imageVariantLabel(latestImage)}.\` : "No image generated yet.",
          action: "Regenerate if the image is generic, logo-like, text-heavy, or outside the poster system."
        }
      ];
      const done = checks.filter(check => check.ok).length;
      return \`<div class="panel">
        <div class="toprow">
          <div>
            <div class="eyebrow">Launch checklist</div>
            <h2 style="margin:4px 0 0">\${done}/\${checks.length} ready for 24-hour launch</h2>
	            <p class="muted" style="margin:8px 0 0">Target: LinkedIn, X / Twitter, Facebook Page, and Instagram with conservative per-channel gates.</p>
          </div>
          <button onclick="checkPublishingQueue()">Run readiness check</button>
        </div>
        <div class="grid three" style="margin-top:14px">\${checks.map(check => \`<div class="setup-item \${check.ok ? "good" : "warn"}">
          <div class="toprow"><strong>\${esc(check.title)}</strong><span class="badge \${check.ok ? "good" : "warn"}">\${check.ok ? "Ready" : "Fix"}</span></div>
          <p class="muted" style="margin:8px 0 0">\${esc(check.body)}</p>
          <p class="muted" style="margin:6px 0 0"><strong>Next:</strong> \${esc(check.action)}</p>
        </div>\`).join("")}</div>
      </div>\`;
    }

    function sourceRiskTone(source) {
      const risk = sourceRoute(source).riskLevel || "Low";
      return risk === "High" ? "danger" : risk === "Medium" ? "warn" : "good";
    }

    function sourceStatusTone(status) {
      return status === "Queued" ? "good" : status === "Ignored" ? "danger" : status === "Reviewed" ? "info" : "warn";
    }

    function sourceSummaryHtml() {
      const items = sourceItems();
      const high = items.filter(item => sourceRoute(item).riskLevel === "High").length;
      const required = items.filter(item => sourceRoute(item).wilmaComplianceRequired).length;
      return \`<div class="grid source-summary">
        <div class="metric"><div class="kpi-label">Total sources</div><div class="kpi-value">\${items.length}</div><div class="kpi-detail">Local intake</div></div>
        <div class="metric"><div class="kpi-label">New</div><div class="kpi-value">\${items.filter(item => (item.status || "New") === "New").length}</div><div class="kpi-detail">Needs routing review</div></div>
        <div class="metric"><div class="kpi-label">Queued</div><div class="kpi-value">\${items.filter(item => item.status === "Queued").length}</div><div class="kpi-detail">Drafts created</div></div>
        <div class="metric"><div class="kpi-label">Ignored</div><div class="kpi-value">\${items.filter(item => item.status === "Ignored").length}</div><div class="kpi-detail">Archived sources</div></div>
        <div class="metric"><div class="kpi-label">High risk</div><div class="kpi-value">\${high}</div><div class="kpi-detail">Extra review</div></div>
        <div class="metric"><div class="kpi-label">Wilma required</div><div class="kpi-value">\${required}</div><div class="kpi-detail">Compliance review</div></div>
      </div>\`;
    }

    function sourceFiltersHtml() {
      const filters = ["All", "New", "Reviewed", "Queued", "Ignored", "High Risk", "Wilma Required"];
      return \`<div class="source-filter">
        <span class="muted">Source filter</span>
        \${filters.map(filter => \`<button class="tab \${sourceFilter === filter ? "active" : ""}" onclick="setSourceFilter('\${filter}')">\${esc(filter)}</button>\`).join("")}
      </div>\`;
    }

    function sourceCardsHtml() {
      const items = sourceItems().filter(sourceMatchesFilter);
      if (!sourceItems().length) return '<div class="panel muted"><h2>No sources yet.</h2><p>Add a note, link, or idea when something should become a LegalEase post.</p></div>';
      if (!items.length) return '<div class="panel muted"><h2>No sources here.</h2><p>Try another filter or add a new source.</p></div>';
      return items.map(source => {
        const route = sourceRoute(source);
        const disabled = source.status === "Queued" || source.status === "Ignored";
        return \`<article class="card source-card">
          <div class="toprow">
            <div>
              <span class="badge \${sourceStatusTone(source.status)}">\${esc(source.status || "New")}</span>
              <span class="badge info">\${esc(source.sourceType || "Manual Idea")}</span>
              \${route.riskLevel !== "Low" ? \`<span class="badge \${sourceRiskTone(source)}">\${esc(route.riskLevel)} Risk</span>\` : ""}
              \${route.wilmaComplianceRequired ? '<span class="badge danger">Wilma Review</span>' : ""}
              <h3>\${esc(source.title || "Untitled source")}</h3>
            </div>
          </div>
          <p class="simple-meta"><strong>Suggested:</strong> \${esc(speakerLabels[route.speaker] || route.speaker || "LegalEase")} · \${esc(route.contentBucket || "LegalEase POV")}<br><strong>Platform:</strong> \${esc(platformLabels[route.platform] || route.platform || "LinkedIn")}</p>
          <div class="card-actions">
            <button class="primary" onclick="createQueueDraftFromSource('\${source.id}')" \${disabled ? "disabled" : ""}>Create Draft</button>
            <button class="secondary-action" onclick="ignoreSource('\${source.id}')" \${source.status === "Ignored" ? "disabled" : ""}>Ignore</button>
            \${source.status === "Ignored" ? \`<button class="secondary-action" onclick="restoreSource('\${source.id}')">Restore</button>\` : ""}
          </div>
          <details class="image-detail-toggle">
            <summary>Source details</summary>
            <p class="muted"><strong>Note/link:</strong> \${source.sourceUrl ? \`<a href="\${esc(source.sourceUrl)}" target="_blank" rel="noreferrer">\${esc(source.sourceUrl)}</a>\` : esc(source.note || "No note")}<br><strong>Audience:</strong> \${esc(route.audience || source.audience || "general")}<br><strong>Created:</strong> \${esc(source.createdAt || "")}\${source.queuedPostId ? \`<br><strong>Queued draft:</strong> <code>\${esc(source.queuedPostId)}</code>\` : ""}</p>
            <p class="muted"><strong>Review:</strong> \${route.wilmaComplianceRequired ? "Wilma review required" : "Standard review"}</p>
            <button onclick="reviewSource('\${source.id}')" \${source.status === "Reviewed" || source.status === "Queued" || source.status === "Ignored" ? "disabled" : ""}>Mark Reviewed</button>
          </details>
        </article>\`;
      }).join("");
    }

    function sourceIntakeHtml() {
      return \`<div class="grid two">
        <form class="panel" onsubmit="addSourceItem(event)">
          <div class="eyebrow">Source intake</div>
          <h2>Add source idea</h2>
          <label>Source title<input name="title" required placeholder="What happened or what should LegalEase say?"></label>
          <label>Source type<select name="sourceType">\${sourceTypes.map(type => \`<option value="\${type}">\${esc(type)}</option>\`).join("")}</select></label>
          <label>Source URL<input name="sourceUrl" placeholder="Optional link"></label>
          <label>Audience<input name="audience" placeholder="consumers, workforce, funders, partners..."></label>
          <label>Note<textarea name="note" placeholder="Raw note, article summary, quote, or topic"></textarea></label>
          <button class="primary">Save Source</button>
        </form>
        <div class="panel">
          <div class="eyebrow">Source suggestions</div>
          <h2>How sources are sorted</h2>
          <ul class="readiness-list">
            <li>Legal-process or customer-story topics get extra review.</li>
            <li>Consumer education usually routes to Wilma.</li>
            <li>Implementation/system commentary routes to LegalEase.</li>
            <li>Workforce/economic framing routes to LegalEase.</li>
          </ul>
        </div>
      </div>\`;
    }

    function sourceAutomationHtml() {
      const feeds = state.settings?.sourceFeeds || [];
      return \`<div class="grid two">
        <div class="panel">
          <div class="eyebrow">Daily automation</div>
          <h2>\${Number(state.settings?.dailyAutomation?.target || state.settings?.dailyTarget || 3)} strong drafts per run</h2>
          <p class="muted">Mix: one Wilma education post, one LegalEase POV post, and one flexible post from sources. Last run: \${esc(state.settings?.lastSourceAutomationAt || "never")}.</p>
          <button class="primary" onclick="runSourceAutomation()">Generate today's queue</button>
        </div>
        <div class="grid">
          \${feeds.map(feed => \`<article class="setup-item \${feed.active === false ? "warn" : "good"}">
            <div class="toprow"><strong>\${esc(feed.name)}</strong><span class="badge \${feed.active === false ? "warn" : "good"}">\${feed.active === false ? "Paused" : "Active"}</span></div>
            <p class="muted" style="margin:8px 0 0">\${esc(feed.sourceType)} · \${esc(feed.cadence || "manual")} · \${esc(feed.trustLevel || "standard")}</p>
            <p class="muted" style="margin:6px 0 0">\${esc(feed.topic || "No topic configured")}</p>
          </article>\`).join("") || '<div class="panel muted">No source feeds configured.</div>'}
        </div>
      </div>\`;
    }

    function contentIntelligenceHtml() {
      const scored = state.posts.filter(post => post.contentScore).length;
      const strong = state.posts.filter(post => (post.qualityLabel || "strong") === "strong").length;
      const needsRewrite = state.posts.filter(post => post.qualityLabel === "needs_rewrite").length;
      const rejected = state.posts.filter(post => post.qualityLabel === "rejected").length;
      const complianceRequired = state.posts.filter(post => post.complianceGate?.required).length;
      return \`<div class="grid three">
        <div class="panel"><h2>Quality labels</h2><p><span class="badge good">Strong \${strong}</span> <span class="badge warn">Needs rewrite \${needsRewrite}</span> <span class="badge danger">Rejected \${rejected}</span></p><p class="muted">\${scored} posts have detailed scoring metadata.</p></div>
        <div class="panel"><h2>Compliance gate</h2><p><span class="badge \${complianceRequired ? "warn" : "good"}">\${complianceRequired} gated</span></p><p class="muted">Consumer-facing eligibility, paperwork, record-clearance, or process posts are checked before approval.</p></div>
        <div class="panel"><h2>Anti-slop cleanup</h2><p class="muted">The scorer penalizes generic startup language, legal promises, weak mission fit, missing human reality, and poor platform fit.</p></div>
      </div>\`;
    }

    function postCard(post, actions = true) {
      const tags = post.hashtags?.length ? post.hashtags.join(" ") : "No hashtags";
      const image = imageForPost(post.id);
      const imageLabel = image?.generationStatus === "generated" ? "Image ready" : image ? "Image needs attention" : "No image";
      const publishStatus = post.publishingStatus || (post.status === "posted" ? "ready" : "");
      const targetChannels = (post.targetChannels && post.targetChannels.length ? post.targetChannels : [post.platform]).filter(Boolean);
      const watermarkPosition = image?.watermarkPosition || image?.assetBundleUsed?.watermark?.position || "none";
      const readiness = postReadiness(post, image);
      const canApprove = post.copyReviewed && ["draft", "needs_review", "retry_ready", "blocked_channel_not_connected"].includes(post.status);
      const canSchedule = ["approved", "retry_ready", "blocked_channel_not_connected"].includes(post.status) && post.imageFinalized && post.finalPreviewConfirmed;
      const canRetry = post.status === "failed";
      const canEdit = !["publishing", "posted", "manually_posted"].includes(post.status);
      const canReject = !["publishing", "posted", "manually_posted"].includes(post.status);
      const overlay = overlayTextForPost(post);
      const manualReady = manualPostingReady(post, image);
      const workflow = workflowStageForPost(post, image);
      const simpleStatus = simpleQueueStatus(post, image);
      const simpleAction = simpleStatusAction(simpleStatus, post, image);
      const isGenerating = generatingImages.has(post.id) && !finalPngReady(post, image);
      const channelSummary = targetChannels.map(channel => platformLabels[channel] || channel).join(", ") || platformLabels[post.platform] || "No channel";
      const postExcerpt = String(post.body || "").replace(/\\s+/g, " ").trim();
      const shortExcerpt = postExcerpt.length > 180 ? postExcerpt.slice(0, 177).trim() + "..." : postExcerpt;
      const finalDownloadUrl = post.finalExportKit?.downloadUrl || (finalPngReady(post, image) ? "/api/posts/" + post.id + "/final-png" : "");
      const finalDownloadFilename = post.finalPngFilename || post.finalExportKit?.exportFilename || "legalease-final-" + post.id + ".png";
      const packageRecord = post.postingPackage || post.finalExportKit?.postingPackage || {};
      const postingZipUrl = packageRecord.zipDownloadUrl || post.postingPackageZipDownloadUrl || (post.postingPackageGenerated ? "/api/posts/" + post.id + "/posting-package-zip" : "");
      const postingZipFilename = (String(post.id || "post").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "post") + "-posting-kit.zip";
      const liveChannel = targetChannels[0] || post.platform || "linkedin";
      const liveGate = state.runtime?.livePostingGates?.[liveChannel] || {};
      const liveAccount = channelFor(liveChannel);
      const canOfferLivePublish = simpleStatus.key === "ready" && finalPngReady(post, image);
      const livePublishReady = Boolean(liveGate.enabled) && Boolean(liveAccount.connected);
      const livePublishNote = liveGate.enabled
        ? (liveAccount.connected ? "Ready to publish to " + (platformLabels[liveChannel] || liveChannel) + "." : "Connect " + (platformLabels[liveChannel] || liveChannel) + " in Settings to publish from here.")
        : "Finish " + (platformLabels[liveChannel] || liveChannel) + " setup in Settings before publishing.";
      return \`<article class="card queue-card \${bulkMode && selectedPosts.has(post.id) ? "selected" : ""}">
        <div class="queue-content">
          \${bulkMode ? \`<label class="bulk-check"><input type="checkbox" \${selectedPosts.has(post.id) ? "checked" : ""} onchange="toggleBulkPost('\${post.id}', this.checked)"> Select</label>\` : ""}
          <div class="simple-status-row">
            <span class="badge \${simpleStatus.tone} simple-status-pill">\${esc(simpleStatus.label)}</span>
            <span class="badge info">\${esc(channelSummary)}</span>
            <span class="badge">\${esc(post.contentBucket || post.wilmaVisualBucket || "Content")}</span>
            <span class="badge \${toneForRisk(post.complianceRisk || "low")}">\${esc(riskLabel(post.complianceRisk || "low"))}</span>
            \${post.complianceRisk === "high" ? '<span class="badge danger">High Risk</span>' : ""}
            \${post.complianceGate?.required ? '<span class="badge danger">Wilma Review</span>' : ""}
            \${post.sourceItemId ? '<span class="badge info">Source Draft</span>' : ""}
            \${post.repurposedFromPostId ? '<span class="badge info">Repurposed</span>' : ""}
          </div>
          \${simpleStatus.group === "blocked" && simpleStatus.why ? \`<p class="why-line">Why: \${esc(simpleStatus.why)}</p>\` : ""}
          <h3 class="queue-title">\${esc(post.title)}</h3>
          <p class="simple-meta">\${esc(channelSummary)} · \${speakerLabels[post.speaker] || "LegalEase"}</p>
          \${shortExcerpt ? \`<p class="muted">\${esc(shortExcerpt)}</p>\` : ""}
          <div class="simple-status-row">
            <span class="badge \${image?.generationStatus === "generated" ? "good" : "warn"}">\${esc(imageLabel)}</span>
            <span class="badge \${finalPngReady(post, image) ? "good" : "warn"}">\${finalPngReady(post, image) ? "Final PNG ready" : "Needs final PNG"}</span>
            <span class="badge \${post.postingPackageGenerated ? "good" : "warn"}">\${post.postingPackageGenerated ? "Kit exported" : "Kit not exported"}</span>
          </div>
          <div class="next-action-card \${simpleStatus.tone}">
            <div class="row"><strong>\${esc(simpleStatus.label)}</strong><span class="badge \${simpleStatus.tone}">Next</span></div>
            <button class="primary" \${isGenerating ? "disabled" : ""} onclick="\${simpleAction.action}">\${esc(isGenerating ? "Generating image..." : simpleAction.label)}</button>
          </div>
          \${canOfferLivePublish ? \`<div class="readiness-card \${livePublishReady ? "good" : "warn"} compact-download">
            <div class="row"><strong>Live publishing</strong><span class="badge \${livePublishReady ? "good" : "warn"}">\${livePublishReady ? "Ready" : "Setup needed"}</span></div>
            <p class="muted" style="margin:6px 0 0">\${esc(livePublishNote)}</p>
          </div>\` : ""}
          \${finalDownloadUrl ? \`<div class="readiness-card good compact-download asset-download">
            <div class="row"><strong>PNG generated</strong><a class="button-link" href="\${esc(finalDownloadUrl)}" download="\${esc(finalDownloadFilename)}">Download Final PNG</a></div>
            <p class="muted" style="margin:6px 0 0"><code>\${esc(finalDownloadFilename)}</code></p>
          </div>\` : ""}
          \${postingZipUrl ? \`<div class="readiness-card good compact-download asset-download">
            <div class="row"><strong>Posting ZIP ready</strong><a class="button-link primary" href="\${esc(postingZipUrl)}" download="\${esc(postingZipFilename)}">Download Posting ZIP</a></div>
            <p class="muted" style="margin:6px 0 0">Includes final.png, caption, hashtags, alt text, notes, and metadata.</p>
          </div>\` : ""}
          <details class="image-detail-toggle">
            <summary>More options</summary>
            <div class="card-actions quiet-actions" style="margin-top:12px">
              \${simpleStatus.key !== "image" ? \`<button \${isGenerating ? "disabled" : ""} onclick="regenerateImage('\${post.id}')">\${isGenerating ? "Generating..." : image ? "Regenerate image" : "Generate image"}</button>\` : ""}
              <button onclick="document.querySelector('#upload-\${post.id}').click()">Upload image</button>
              \${image && !post.imageFinalized && simpleStatus.key !== "final_png" ? \`<button onclick="finalizeImage('\${post.id}')">Create Final PNG</button>\` : ""}
              \${post.imageFinalized && !post.finalPreviewConfirmed ? \`<button onclick="confirmPreview('\${post.id}')">Confirm preview</button>\` : ""}
            </div>
            <div class="image-preview" style="margin-top:12px">\${postImageMarkup(image, post)}</div>
            <div style="margin-top:12px">\${wilmaImagePanelHtml(post, image)}</div>
            \${finalPngDetailsHtml(post, image)}
            \${finalExportKitHtml(post, image)}
            <div class="details-grid">
              <div>
                <p class="queue-hook"><strong>\${esc(post.hook || post.title)}</strong></p>
                <p class="post-body" style="margin:0">\${esc(post.body)}</p>
                <p style="margin:10px 0 0"><strong>\${esc(post.cta)}</strong></p>
              </div>
            </div>
            <details class="operator-edit">
              <summary>Manual kit and more controls</summary>
              \${manualPostingKitHtml(post, image)}
              <div class="card-actions quiet-actions" style="margin-top:12px">
                \${canApprove ? \`<button onclick="setStatus('\${post.id}','approved')">Approve</button>\` : ""}
                \${canRetry ? \`<button onclick="retryPost('\${post.id}')">Retry</button>\` : ""}
                <button onclick="checkPublishing('\${post.id}')">Check posting</button>
                \${canReject ? \`<button class="danger-btn" onclick="setStatus('\${post.id}','rejected')">Reject</button>\` : ""}
              </div>
              <form onsubmit="saveOperatorNotes(event,'\${post.id}')" style="margin-top:10px">
                <label>Operator notes<textarea name="operatorNotes" placeholder="What worked, what was confusing, what should be reused...">\${esc(post.operatorNotes || "")}</textarea></label>
                <button>Save notes</button>
              </form>
              \${canEdit ? \`<form onsubmit="editPost(event,'\${post.id}')" style="margin-top:10px">
                <label>Edit hook<input name="hook" value="\${esc(post.hook)}"></label>
                <label>Edit body<textarea name="body">\${esc(post.body)}</textarea></label>
                <label>Edit CTA<input name="cta" value="\${esc(post.cta)}"></label>
                <button>Save copy</button>
              </form>\` : \`<p class="muted">Posted content is locked from editing.</p>\`}
              \${canEdit ? \`<form onsubmit="editOverlayText(event,'\${post.id}')" style="margin-top:10px">
                <label>Overlay mode<select name="overlayMode">
                  <option value="text" \${post.overlayMode === "none" ? "" : "selected"}>Text overlay</option>
                  <option value="none" \${post.overlayMode === "none" ? "selected" : ""}>No text overlay</option>
                </select></label>
                <label>Image kicker<input name="overlayKicker" maxlength="38" value="\${esc(overlay.kicker)}"></label>
                <label>Image headline<textarea name="overlayHeadline" maxlength="120">\${esc(overlay.headline)}</textarea></label>
                <label>Image support line<textarea name="overlaySupport" maxlength="160">\${esc(overlay.support)}</textarea></label>
                <div class="card-actions quiet-actions"><button>Update overlay</button><button type="button" onclick="disableOverlayText('\${post.id}')">No text</button><button type="button" onclick="resetOverlayText('\${post.id}')">Reset</button></div>
              </form>\` : ""}
              <form onsubmit="schedulePost(event,'\${post.id}')" class="split" style="margin-top:10px">
                <input type="datetime-local" name="scheduledFor" value="\${post.scheduledFor || ""}">
                <select name="targetChannels" multiple size="4">\${platforms.map(platform => \`<option value="\${platform}" \${targetChannels.includes(platform) ? "selected" : ""}>\${platformLabels[platform]}</option>\`).join("")}</select>
                <button \${canSchedule ? "" : "disabled"}>Schedule</button>
              </form>
              <div class="card-actions quiet-actions" style="margin-top:10px">
                \${post.status === "scheduled" ? \`<button onclick="unschedulePost('\${post.id}')">Unschedule</button>\` : ""}
                \${post.status === "blocked_channel_not_connected" ? \`<button onclick="setStatus('\${post.id}','approved')">Return to approved</button>\` : ""}
                \${canEdit ? \`<button onclick="setStatus('\${post.id}','needs_review')">Needs review</button>\` : ""}
                <button onclick="removeWilma('\${post.id}')">Remove Wilma</button>
              </div>
              <p class="muted">Posting stays manual. Live posting remains disabled.</p>
            </details>
          </details>
          <input id="upload-\${post.id}" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none" onchange="uploadImage('\${post.id}', this)">
          <details class="image-detail-toggle advanced-card-details">
            <summary>Details and controls</summary>
            <div class="details-grid">
              <div>
                <p class="post-body" style="margin:0">\${esc(post.body)}</p>
                <p style="margin:10px 0 0"><strong>\${esc(post.cta)}</strong></p>
                <p class="muted">\${esc(post.contentBucket || "Trust & Guidance")} · \${audienceLabels[post.audience] || "General"}<br>Source: \${esc(post.sourceType || "manual_note")}\${post.sourceUrl ? \` · \${esc(post.sourceUrl)}\` : ""}\${post.sourceItemId ? \`<br><strong>Created from source:</strong> \${esc(post.sourceItemId)} · \${esc(post.sourceTitle || post.sourceReference || "source item")}\` : ""}\${post.repurposedFromPostId ? \`<br><strong>Repurposed from:</strong> \${esc(post.repurposedFromPostId)} · \${esc(post.repurposeFormatLabel || post.repurposeFormat || "template")}\` : ""}<br>\${post.complianceRisk === "medium" ? "Review facts, names, and legal claims before publishing." : esc(post.complianceNotes || "")}</p>
              </div>
              <div class="readiness-card \${readiness.tone}">
                <div class="row"><span class="readiness-title">\${readiness.ok ? "Ready" : "Next step"}</span><span class="badge \${readiness.tone}">\${readiness.ok ? "Posting ready" : "Needs action"}</span></div>
                <div class="muted">\${esc(readiness.summary)}</div>
                \${readiness.issues.length ? \`<ul class="readiness-list">\${readiness.issues.slice(0, 4).map(issue => \`<li>\${esc(issue)}</li>\`).join("")}</ul>\` : \`<p class="muted" style="margin:0">Channels: \${esc(channelSummary)} · Watermark: \${esc(watermarkLabels[readiness.watermarkPosition] || "No watermark")}</p>\`}
              </div>
              \${finalPngDetailsHtml(post, image)}
              \${finalExportKitHtml(post, image)}
            </div>
          </details>
          \${manualReady ? \`<div class="readiness-card good manual-ready-note">
            <div class="readiness-title">Files are ready</div>
            <p class="muted" style="margin:0">Download and manual-posting tools are under More options.</p>
          </div>\` : ""}
        \${actions ? \`<details class="image-detail-toggle advanced-card-details">
          <summary>Advanced controls</summary>
          <div class="row" style="margin-top:10px">
          \${canApprove ? \`<button onclick="setStatus('\${post.id}','approved')">Approve</button>\` : ""}
          \${image ? \`<label style="min-width:170px">Watermark<select onchange="setWatermark('\${post.id}', this.value)">
            \${watermarkPositions.map(position => \`<option value="\${position}" \${position === watermarkPosition ? "selected" : ""}>\${watermarkLabels[position]}</option>\`).join("")}
          </select></label>\` : ""}
          \${canRetry ? \`<button onclick="retryPost('\${post.id}')">Retry</button>\` : ""}
          <button onclick="checkPublishing('\${post.id}')">Check publishing</button>
          \${canReject ? \`<button class="danger-btn" onclick="setStatus('\${post.id}','rejected')">Reject</button>\` : ""}
          </div>
        <details style="margin-top:10px"><summary class="muted">Edit, schedule, or inspect</summary>
          \${manualPostingKitHtml(post, image)}
          \${post.publishErrorSummary ? \`<p class="muted"><strong>Publishing:</strong> \${esc(post.publishErrorSummary)}</p>\` : ""}
          <div class="readiness-card \${post.finalPreviewConfirmed ? "good" : "warn"}">
            <div class="readiness-title">Final post preview</div>
            <p class="muted" style="margin:0"><strong>Channel:</strong> \${esc(targetChannels.map(channel => platformLabels[channel] || channel).join(", ") || platformLabels[post.platform])} · <strong>Scheduled:</strong> \${esc(post.scheduledFor || "not scheduled")} · <strong>Watermark:</strong> \${esc(watermarkLabels[watermarkPosition] || "No watermark")}</p>
            <p class="post-body" style="margin:0">\${esc(composePreviewText(post))}</p>
          </div>
          <div class="readiness-card \${manualReady ? "good" : "warn"}">
            <div class="readiness-title">Manual posting copy</div>
            \${targetChannels.map(channel => \`<p class="muted" style="margin:8px 0 0"><strong>\${esc(platformLabels[channel] || channel)}:</strong></p><p class="post-body" style="margin:0">\${esc(post.channelAdaptations?.[channel]?.text || composePreviewText(post))}</p>\`).join("")}
          </div>
          <form onsubmit="saveOperatorNotes(event,'\${post.id}')" style="margin-top:10px">
            <label>Operator Notes<textarea name="operatorNotes" placeholder="Image looked generic, overlay too wordy, caption needs more Roger voice, risky legal language, good post, reuse format...">\${esc(post.operatorNotes || "")}</textarea></label>
            <button class="primary">Save notes</button>
          </form>
          \${canEdit ? \`<form onsubmit="editPost(event,'\${post.id}')" style="margin-top:10px">
            <input name="hook" value="\${esc(post.hook)}">
            <textarea name="body">\${esc(post.body)}</textarea>
            <input name="cta" value="\${esc(post.cta)}">
            <button class="primary">Save edits</button>
          </form>\` : \`<p class="muted">Publishing or posted content is locked from editing.</p>\`}
          \${canEdit ? \`<form onsubmit="editOverlayText(event,'\${post.id}')" style="margin-top:10px">
            <label>Overlay mode<select name="overlayMode">
              <option value="text" \${post.overlayMode === "none" ? "" : "selected"}>Text overlay</option>
              <option value="none" \${post.overlayMode === "none" ? "selected" : ""}>No text overlay</option>
            </select></label>
            <label>Image kicker<input name="overlayKicker" maxlength="38" value="\${esc(overlay.kicker)}"></label>
            <label>Image headline<textarea name="overlayHeadline" maxlength="120">\${esc(overlay.headline)}</textarea></label>
            <label>Image support line<textarea name="overlaySupport" maxlength="160">\${esc(overlay.support)}</textarea></label>
            <div class="row"><button class="primary">Update image overlay</button><button type="button" onclick="disableOverlayText('\${post.id}')">No text</button><button type="button" onclick="resetOverlayText('\${post.id}')">Reset overlay</button></div>
          </form>\` : ""}
	          <form onsubmit="schedulePost(event,'\${post.id}')" class="split" style="margin-top:10px">
	            <input type="datetime-local" name="scheduledFor" value="\${post.scheduledFor || ""}">
	            <select name="targetChannels" multiple size="4">\${platforms.map(platform => \`<option value="\${platform}" \${targetChannels.includes(platform) ? "selected" : ""}>\${platformLabels[platform]}</option>\`).join("")}</select>
	            <button \${canSchedule ? "" : "disabled"}>Schedule</button>
	          </form>
          <div class="row" style="margin-top:10px">
            \${post.status === "scheduled" ? \`<button onclick="unschedulePost('\${post.id}')">Unschedule</button>\` : ""}
            \${post.status === "blocked_channel_not_connected" ? \`<button onclick="setStatus('\${post.id}','approved')">Return to approved</button>\` : ""}
            \${canEdit ? \`<button onclick="setStatus('\${post.id}','needs_review')">Needs review</button>\` : ""}
            <button onclick="removeWilma('\${post.id}')">Remove Wilma</button>
          </div>
          <label style="margin-top:10px">Visual direction<select onchange="swapVisualBucket('\${post.id}', this.value)">
            \${visualBuckets.map(bucket => \`<option value="\${bucket}" \${bucket === (post.visualBucket || image?.visualBucket) ? "selected" : ""}>\${bucket}</option>\`).join("")}
          </select></label>
          <p class="muted"><strong>Image brief:</strong> \${esc(image?.imageBrief || post.imageBrief || "No image generated yet.")}</p>
          <p class="muted"><strong>Publishing state:</strong> \${esc(publishLabel(post.publishingStatus))} · <strong>Scheduled:</strong> \${esc(post.scheduledFor || "not scheduled")} · <strong>Targets:</strong> \${esc(targetChannels.map(channel => platformLabels[channel] || channel).join(", ") || "none")} · <strong>Attempts:</strong> \${Number(post.publishAttemptCount || 0)}<br><strong>Last check:</strong> \${esc(post.lastPublishAttemptAt || "never")} · <strong>Published:</strong> \${esc(post.publishedAt || "not posted")} · <strong>External ID:</strong> \${esc(post.externalPostId || "none")} · <strong>URL:</strong> \${esc(post.externalPostUrl || post.publishedUrl || "none")}</p>
          <p class="muted"><strong>Style:</strong> \${esc(imageStyleLabel(image))} · <strong>Variant:</strong> \${esc(imageVariantLabel(image))}<br><strong>Mode:</strong> \${esc(image?.generationMode || "pending")} · <strong>Direction:</strong> \${esc(image?.creativeDirection?.directionLabel || "pending")} · <strong>Risk:</strong> \${esc(image?.imageRiskLevel || post.imageRiskLevel || "pending")}<br><strong>Aspect:</strong> \${esc(image?.aspectRatio || "pending")} · <strong>Bundle:</strong> \${esc(image?.assetBundleKey || post.assetBundleKey || "pending")} · <strong>Version:</strong> \${image?.imageVersion || image?.versionNumber || 0}<br><strong>Text:</strong> app overlay only · <strong>Safe area:</strong> \${esc(image?.safeAreaStatus || "visual check required")} · <strong>Diversity:</strong> \${esc(image?.diversityProfile?.representationVariant || image?.creativeDirection?.representationVariant || "not applicable")}<br><strong>Wilma:</strong> \${image?.usesWilma ? "yes" : "no"} · <strong>Logo in generated image:</strong> no · <strong>Watermark:</strong> \${esc(watermarkPosition)} · \${esc(image?.watermarkMode || image?.assetBundleUsed?.watermark?.mode || "none")}<br><strong>Wilma fidelity:</strong> \${esc(image?.wilmaFidelityMode || "n/a")} · <strong>Identity locked:</strong> \${image?.wilmaIdentityLocked ? "yes" : "no"}<br><strong>Wilma refs:</strong> \${esc((image?.wilmaReferenceAssetIds || []).join(", ") || "none")}<br><strong>Variant reason:</strong> \${esc(image?.imageVariantReason || image?.creativeDirection?.imageVariantReason || "auto-selected")}<br><strong>Content score:</strong> \${esc(post.contentScore || "n/a")} · <strong>Compliance gate:</strong> \${post.complianceGate?.required ? (post.complianceGate?.passed ? "passed" : "failed") : "not required"}<br><strong>Brand guidelines:</strong> DESIGN.md v\${esc(image?.brandGuidelineVersionUsed || "n/a")} · <strong>Logo output:</strong> \${esc(image?.logoReferenceMode || "n/a")}<br><strong>Output:</strong> \${esc(image?.wilmaReferenceMode || "n/a")} · <strong>Error:</strong> \${esc(image?.generationError || "none")}</p>
        </details>
        </details>\` : ""}
        </div>
        <aside class="image-stage advanced-card-details">
          <div class="image-stage-title">
            <strong>Image preview</strong>
            <span class="badge \${isGenerating ? "warn" : image?.generationStatus === "generated" ? "good" : "warn"}">\${isGenerating ? "Generating" : imageLabel}</span>
          </div>
          <div class="image-preview">\${postImageMarkup(image, post)}</div>
          <div class="image-stage-actions">
            <button \${isGenerating ? "disabled" : ""} onclick="regenerateImage('\${post.id}')">\${isGenerating ? "Generating..." : image ? "Regenerate" : "Generate"}</button>
            <button onclick="document.querySelector('#upload-\${post.id}').click()">Upload</button>
            \${image && !post.imageFinalized ? \`<button class="primary wide-action" onclick="finalizeImage('\${post.id}')">Use image</button>\` : ""}
            \${post.imageFinalized && !post.finalPreviewConfirmed ? \`<button class="primary wide-action" onclick="confirmPreview('\${post.id}')">Confirm final preview</button>\` : ""}
          </div>
          <p class="muted" style="margin:0"><strong>Style:</strong> \${esc(imageStyleLabel(image))}<br><strong>Variant:</strong> \${esc(imageVariantLabel(image))}</p>
        </aside>
      </article>\`;
    }

    function credentialPresent(key) {
      const readiness = state.runtime?.credentialReadiness || [];
      return Boolean(readiness.find(item => item.key === key && item.status === "present"));
    }

    function queueStatusCounts(posts) {
      const statuses = posts.map(post => simpleQueueStatus(post, imageForPost(post.id)));
      return {
        ready: statuses.filter(status => status.group === "ready").length,
        review: statuses.filter(status => status.group === "review").length,
        image: statuses.filter(status => status.key === "image").length,
        finalPng: statuses.filter(status => status.key === "final_png").length,
        manualKit: statuses.filter(status => status.key === "manual_kit").length,
        blocked: statuses.filter(status => status.group === "blocked").length,
        posted: statuses.filter(status => status.group === "posted").length
      };
    }

    function readinessStripHtml(posts) {
      const stats = queueStatusCounts(posts);
      const postedWeek = postedPosts().filter(post => {
        const value = post.manuallyPostedAt || post.postedAt || post.publishedAt || "";
        const time = value ? new Date(value).getTime() : 0;
        return time && Date.now() - time <= 7 * 24 * 60 * 60 * 1000;
      }).length;
      const repurpose = postedPosts().filter(post => performanceLabelFor(post.performance || {}) === "Repurpose Candidate").length;
      const cards = [
        ["Ready to Publish", stats.ready, "good"],
        ["Needs Review", stats.review, "warn"],
        ["Needs Image", stats.image, "warn"],
        ["Needs Final PNG", stats.finalPng, "warn"],
        ["Blocked", stats.blocked, stats.blocked ? "danger" : "good"],
        ["Posted This Week", postedWeek, "info"],
        ["Repurpose", repurpose, repurpose ? "good" : "info"]
      ];
      return \`<div class="readiness-strip">\${cards.map(([label, value, tone]) => \`<div class="strip-card"><span class="badge \${tone}">\${esc(label)}</span><strong>\${value}</strong></div>\`).join("")}</div>\`;
    }

    function channelHealthOverviewHtml() {
      return \`<div class="health-grid">\${platforms.map(platform => {
        const account = channelFor(platform);
        const gate = state.runtime?.livePostingGates?.[platform] || {};
        const connected = Boolean(account.connected || account.status === "connected");
        const configured = Boolean(account.configured || account.oauthConfigured);
        const publicRequired = ["instagram", "threads"].includes(platform);
        const publicReady = !publicRequired || credentialPresent("PUBLIC_APP_BASE_URL");
        const ready = Boolean(gate.enabled) && connected && publicReady;
        const label = ready ? "Ready" : !gate.enabled ? "Manual only" : !configured || !connected ? "Needs setup" : !publicReady ? "Local preview only" : "Failing closed";
        const tone = ready ? "good" : label === "Needs setup" ? "warn" : "info";
        return \`<article class="health-card">
          <span class="badge \${tone}"><span class="status-dot"></span>\${esc(label)}</span>
          <h3>\${esc(platformLabels[platform] || platform)}</h3>
          <p class="muted">Live gate: <strong>\${gate.enabled ? "enabled" : "disabled"}</strong><br>Account: <strong>\${connected ? "configured" : "missing"}</strong><br>Public URL: <strong>\${publicRequired ? (publicReady ? "ready" : "required") : "not required"}</strong></p>
        </article>\`;
      }).join("")}</div>\`;
    }

    function productionPipelineHtml(posts) {
      const sourceCount = sourceItems().filter(item => !["Archived", "Ignored"].includes(item.status)).length;
      const draft = posts.filter(post => ["draft", "needs_review"].includes(post.status)).length;
      const reviewed = posts.filter(post => post.copyReviewed).length;
      const imageReady = posts.filter(post => imageForPost(post.id)?.generationStatus === "generated").length;
      const finalReady = posts.filter(post => finalPngReady(post, imageForPost(post.id))).length;
      const publishReady = posts.filter(post => simpleQueueStatus(post, imageForPost(post.id)).key === "ready").length;
      const metrics = postedPosts().filter(postedNeedsMetrics).length;
      const repurpose = postedPosts().filter(post => performanceLabelFor(post.performance || {}) === "Repurpose Candidate").length;
      const steps = [
        ["Sources", sourceCount],
        ["Draft", draft],
        ["Review", reviewed],
        ["Image", imageReady],
        ["Final PNG", finalReady],
        ["Publish", publishReady],
        ["Metrics", metrics],
        ["Repurpose", repurpose]
      ];
      return \`<div class="pipeline-board">\${steps.map(([label, value]) => \`<div class="pipeline-step"><span>\${esc(label)}</span><strong>\${value}</strong></div>\`).join("")}</div>\`;
    }

    function performanceSnapshotHtml() {
      const posts = postedPosts();
      const totals = posts.reduce((memo, post) => {
        const perf = performanceTotals(post.performance || {});
        memo.impressions += perf.impressions;
        memo.engagement += performanceEngagement(post.performance || {});
        memo.clicks += perf.clicks;
        memo.leads += perf.leads;
        return memo;
      }, { impressions:0, engagement:0, clicks:0, leads:0 });
      const topPost = posts.slice().sort((a, b) => performanceEngagement(b.performance || {}) - performanceEngagement(a.performance || {}))[0];
      const hasData = totals.impressions || totals.engagement || totals.clicks || totals.leads;
      if (!hasData) return \`<div class="panel empty"><h2>No performance data yet.</h2><p>Add metrics on Posted after publishing to see winners, buckets, and channel performance.</p></div>\`;
      const rows = [
        ["Impressions", totals.impressions],
        ["Engagement", totals.engagement],
        ["Clicks", totals.clicks],
        ["Leads", totals.leads],
        ["Best platform", platformLabels[topByMetric(posts, post => post.platform, post => performanceEngagement(post.performance || {}))] || topByMetric(posts, post => post.platform, post => performanceEngagement(post.performance || {}))],
        ["Best bucket", topByMetric(posts, post => post.contentBucket || post.wilmaVisualBucket, post => performanceEngagement(post.performance || {}))]
      ];
      return \`<div class="metric-table">\${rows.map(([label, value]) => \`<div class="metric-row"><span class="muted">\${esc(label)}</span><strong>\${esc(value)}</strong></div>\`).join("")}<div class="metric-row"><span class="muted">Top post</span><strong>\${esc(topPost?.title || "Needs data")}</strong></div></div>\`;
    }

    function operatingPrioritiesHtml(posts) {
      const priorities = [
        ["Posts blocked", posts.filter(post => simpleQueueStatus(post, imageForPost(post.id)).group === "blocked").length, "blocked"],
        ["Needs review", posts.filter(post => simpleQueueStatus(post, imageForPost(post.id)).group === "review").length, "review"],
        ["Needs image", posts.filter(post => simpleQueueStatus(post, imageForPost(post.id)).key === "image").length, "image"],
        ["Ready to publish", posts.filter(post => simpleQueueStatus(post, imageForPost(post.id)).group === "ready").length, "ready"],
        ["Needs metrics", postedPosts().filter(postedNeedsMetrics).length, "posted"],
        ["Repurpose candidates", postedPosts().filter(post => performanceLabelFor(post.performance || {}) === "Repurpose Candidate").length, "posted"]
      ].filter(item => item[1] > 0);
      if (!priorities.length) return \`<div class="panel empty"><h2>Nothing urgent right now.</h2><p>Add sources or create tomorrow's queue to keep production moving.</p></div>\`;
      return \`<div class="priority-list">\${priorities.map(([label, count, filter], index) => \`<button class="priority-item" onclick="location.hash='\${filter === "posted" ? "posted" : "queue"}'; setQueueReadinessFilter('\${filter === "posted" ? "posted" : filter}')"><span class="priority-rank">\${index + 1}</span><h3>\${esc(label)}</h3><span class="badge \${filter === "blocked" ? "danger" : filter === "ready" ? "good" : "warn"}">\${count}</span></button>\`).join("")}</div>\`;
    }

    function momentumFeedHtml() {
      const events = [];
      for (const source of sourceItems().slice(-8)) events.push({ label:"Source added", title:source.title, at:source.createdAt || source.updatedAt || "" });
      for (const image of (state.postImages || []).slice(0, 8)) events.push({ label:image.finalPngReady || image.finalPngPath ? "Final PNG created" : "Image generated", title:(state.posts.find(post => post.id === image.postId) || {}).title || image.postId, at:image.finalPngGeneratedAt || image.createdAt || "" });
      for (const post of state.posts || []) {
        if (post.postingPackageGenerated) events.push({ label:"Posting kit exported", title:post.title, at:post.postingPackageGeneratedAt || "" });
        if (post.manuallyPostedAt || post.postedAt) events.push({ label:"Published", title:post.title, at:post.manuallyPostedAt || post.postedAt || "" });
        if (post.performanceUpdatedAt) events.push({ label:"Metrics updated", title:post.title, at:post.performanceUpdatedAt });
        if (post.repurposedFromPostId) events.push({ label:"Repurposed draft", title:post.title, at:post.createdAt || "" });
      }
      const sorted = events.filter(event => event.title).sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 8);
      return \`<div class="activity-list">\${sorted.map(event => \`<div class="activity-item"><span class="badge info">\${esc(event.label)}</span><h3>\${esc(event.title)}</h3><p class="muted">\${esc(event.at || "recent")}</p></div>\`).join("") || '<div class="panel empty"><h2>No recent activity yet.</h2><p>Sources, exports, publishes, and metrics will appear here.</p></div>'}</div>\`;
    }

    function systemCheckPanelHtml() {
      const backup = backups[0] || state.settings?.latestBackup;
      const checks = [
        ["App state loads", Boolean(state), "good"],
        ["Backups endpoint", Array.isArray(backups), backups.length ? "good" : "warn"],
        ["Supabase env", Boolean(supabaseHealth?.configured || state.persistence === "supabase"), supabaseHealth?.connected ? "good" : "warn"],
        ["Assets directory", Boolean((state.settings?.localAssets || []).length || (state.settings?.wilmaPoseMappings || []).length), "good"],
        ["Export directories", Boolean((state.postImages || []).some(image => image.finalPngPath) || (state.posts || []).some(post => post.postingPackageGenerated)), "good"],
        ["Live posting gates", Object.values(state.runtime?.livePostingGates || {}).some(gate => gate.enabled) ? "Live gates checked" : "Manual-only", "info"],
        ["Recent backup", Boolean(backup), backup ? "good" : "warn"]
      ];
      return \`<div class="grid two">\${checks.map(([label, value, tone]) => \`<div class="metric-row"><span>\${esc(label)}</span><span class="badge \${tone}">\${esc(value === true ? "Ready" : value === false ? "Needs attention" : value)}</span></div>\`).join("")}</div>\${systemCheckRanAt ? \`<p class="muted">Last system check: \${esc(systemCheckRanAt)}</p>\` : ""}\`;
    }

    function growthItems(collection) {
      return Array.isArray(state?.[collection]) ? state[collection] : [];
    }

    function growthTone(status = "") {
      const value = String(status || "").toLowerCase();
      if (["complete", "approved", "investor-ready", "signed_pilot", "campaign_live", "live", "ready", "done", "winner"].includes(value)) return "good";
      if (["at_risk", "blocked", "attorney_review", "needs_review", "needs_edits", "missing", "closed_lost"].includes(value)) return "danger";
      if (["needs_attention", "draft", "proposal_sent", "outreach_sent", "snoozed", "paused", "incomplete", "usable"].includes(value)) return "warn";
      return "info";
    }

    function growthLabel(value = "") {
      return String(value || "Manual data needed").replaceAll("_", " ");
    }

    function milestoneProgressValue(item = {}) {
      const target = Number(item.target);
      const current = Number(item.current);
      if (Number.isFinite(target) && Number.isFinite(current) && target > 0) return Math.min(100, Math.round((current / target) * 100));
      if (String(item.current || "").toLowerCase() === String(item.target || "").toLowerCase()) return 100;
      return item.status === "complete" ? 100 : 45;
    }

    function milestoneSummaryHtml() {
      const milestones = growthItems("milestones");
      return \`<div class="executive-grid">\${milestones.map(item => \`<article class="strip-card">
        <span class="badge \${growthTone(item.status)}">\${esc(growthLabel(item.status))}</span>
        <strong>\${esc(item.current)} / \${esc(item.target)}</strong>
        <p class="muted"><b>\${esc(item.title)}</b><br>\${milestoneProgressValue(item)}% · Owner: \${esc(item.owner || "Unassigned")}</p>
      </article>\`).join("")}</div>\`;
    }

    function partnerById(id = "") {
      return growthItems("partners").find(item => item.id === id) || null;
    }

    function campaignById(id = "") {
      return growthItems("campaigns").find(item => item.id === id) || null;
    }

    function dueSoon(value = "") {
      if (!value) return false;
      const due = new Date(value).getTime();
      return Number.isFinite(due) && due - Date.now() <= 3 * 24 * 60 * 60 * 1000;
    }

    function nextBestActionsHtml() {
      const actions = [];
      for (const task of growthItems("tasks").filter(item => item.status === "open" && dueSoon(item.dueDate)).slice(0, 6)) {
        actions.push(["Follow up", task.title, task.suggestedAction || "Complete the due task.", "tasks", "warn"]);
      }
      for (const milestone of growthItems("milestones").filter(item => ["at_risk", "needs_attention"].includes(item.status)).slice(0, 4)) {
        actions.push(["Milestone", milestone.title, milestone.nextAction, "milestones", growthTone(milestone.status)]);
      }
      for (const campaign of growthItems("campaigns").filter(item => ["draft", "assets_needed", "ready"].includes(item.status) && !item.latestCampaignKitPath).slice(0, 3)) {
        actions.push(["Generate kit", campaign.campaignName, "Create the partner-ready campaign kit.", "campaigns", "info"]);
      }
      for (const item of growthItems("dataRoomItems").filter(entry => ["missing", "draft"].includes(entry.status)).slice(0, 3)) {
        actions.push(["Add proof", item.title, item.notes || "Move this data room item toward approved.", "dataroom", growthTone(item.status)]);
      }
      return \`<div class="priority-list">\${actions.slice(0, 8).map(([label, title, detail, page, tone], index) => \`<button class="priority-item" onclick="location.hash='\${page}'"><span class="priority-rank">\${index + 1}</span><h3>\${esc(title)}<br><small class="muted">\${esc(detail || label)}</small></h3><span class="badge \${tone}">\${esc(label)}</span></button>\`).join("") || '<div class="empty">No urgent growth actions. Add partners, campaigns, or funnel snapshots to drive the plan.</div>'}</div>\`;
    }

    function growthAttentionHtml() {
      const blockedCampaigns = growthItems("campaigns").filter(item => ["assets_needed", "paused"].includes(item.status));
      const pilotGaps = growthItems("pilots").filter(item => !item.nextAction || ["stalled", "proposed", "scoped"].includes(item.status));
      const compliance = growthItems("complianceItems").filter(item => ["needs_review", "attorney_review", "needs_edits", "blocked"].includes(item.status));
      const dataRoom = growthItems("dataRoomItems").filter(item => ["missing", "draft"].includes(item.status));
      const cards = [
        ["At-risk milestones", growthItems("milestones").filter(item => ["at_risk", "needs_attention"].includes(item.status)).length, "milestones"],
        ["Due follow-ups", growthItems("tasks").filter(item => item.status === "open" && dueSoon(item.dueDate)).length, "partners"],
        ["Blocked campaigns", blockedCampaigns.length, "campaigns"],
        ["Pilots need action", pilotGaps.length, "pilots"],
        ["Compliance waiting", compliance.length, "compliance"],
        ["Data room gaps", dataRoom.length, "dataroom"]
      ];
      return \`<div class="readiness-strip">\${cards.map(([label, count, page]) => \`<button class="strip-card" onclick="location.hash='\${page}'"><span class="badge \${count ? "warn" : "good"}">\${esc(label)}</span><strong>\${count}</strong></button>\`).join("")}</div>\`;
    }

    function partnerPipelineSummaryHtml() {
      const partners = growthItems("partners");
      const signed = partners.filter(item => item.status === "signed_pilot").length;
      const proposals = partners.filter(item => item.status === "proposal_sent").length;
      const meetings = partners.filter(item => item.status === "meeting_booked").length;
      const live = partners.filter(item => item.status === "campaign_live").length;
      return \`<div class="metric-table">
        <div class="metric-row"><span>Partners</span><strong>\${partners.length}</strong></div>
        <div class="metric-row"><span>Meetings booked</span><strong>\${meetings}</strong></div>
        <div class="metric-row"><span>Proposals out</span><strong>\${proposals}</strong></div>
        <div class="metric-row"><span>Signed pilots</span><strong>\${signed}</strong></div>
        <div class="metric-row"><span>Campaign live</span><strong>\${live}</strong></div>
      </div>\`;
    }

    function funnelTotals() {
      return growthItems("funnelSnapshots").reduce((memo, item) => {
        ["landingPageVisits", "recordShieldStarts", "recordShieldCompletions", "resultsViewed", "cleanupCtaClicked", "expungementIntakeStarted", "paymentStarted", "paymentCompleted", "packetGenerated", "packetCompleted", "petitionFiled", "outcomeKnown", "revenue", "usersNeedingFollowUp"].forEach(key => memo[key] = (memo[key] || 0) + Number(item[key] || 0));
        return memo;
      }, {});
    }

    function funnelSummaryHtml() {
      const totals = funnelTotals();
      const starts = totals.recordShieldStarts || 0;
      const expungement = totals.expungementIntakeStarted || 0;
      const rate = starts ? Math.round((expungement / starts) * 100) : 0;
      return \`<div class="metric-table">
        <div class="metric-row"><span>Landing visits</span><strong>\${totals.landingPageVisits || 0}</strong></div>
        <div class="metric-row"><span>RecordShield starts</span><strong>\${starts}</strong></div>
        <div class="metric-row"><span>Expungement.ai starts</span><strong>\${expungement}</strong></div>
        <div class="metric-row"><span>RS → Exp conversion</span><strong>\${rate}%</strong></div>
        <div class="metric-row"><span>Revenue</span><strong>$\${totals.revenue || 0}</strong></div>
      </div>\`;
    }

    function growthActivityFeedHtml() {
      const events = [
        ...growthItems("activityEvents").map(event => ({ label:event.eventType, title:event.title, at:event.createdAt })),
        ...growthItems("campaignKits").map(kit => ({ label:"Campaign kit generated", title:campaignById(kit.campaignId)?.campaignName || kit.campaignId, at:kit.generatedAt })),
        ...growthItems("reports").map(report => ({ label:"Report exported", title:report.reportTitle, at:report.generatedAt }))
      ].filter(event => event.title).sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 10);
      return \`<div class="activity-list">\${events.map(event => \`<div class="activity-item"><span class="badge info">\${esc(event.label)}</span><h3>\${esc(event.title)}</h3><p class="muted">\${esc(event.at || "recent")}</p></div>\`).join("") || '<div class="empty">Growth activity will appear as partners, campaigns, reports, and proof artifacts move.</div>'}</div>\`;
    }

    function commandCenterOverviewHtml(posts) {
      const latestBackup = backups[0] || state.settings?.latestBackup;
      const lastPublish = postedPosts()[0];
      const liveEnabled = Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate.enabled).length;
      const mode = state.persistence === "supabase" ? "Production storage" : "Local";
      return \`<section class="page-section active">
        <div class="mission-grid">
          <div class="panel mission-card">
            <div class="eyebrow">Growth Command Center</div>
            <h1 class="big-title">LegalEase Growth Command Center</h1>
            <p class="big-copy">Run the six-month plan: partners, pilots, RecordShield growth, compliant campaigns, proof artifacts, and social production.</p>
            <div class="simple-status-row">
              <span class="badge good">\${esc(mode)}</span>
              <span class="badge \${liveEnabled ? "good" : "info"}">\${liveEnabled ? liveEnabled + " live gate(s) enabled" : "Manual only"}</span>
              <span class="badge info">Backup: \${esc(latestBackup?.createdAt || "not created")}</span>
              <span class="badge info">Last publish: \${esc(lastPublish?.manuallyPostedAt || lastPublish?.postedAt || "none")}</span>
            </div>
            <div class="toolbar"><button class="primary" onclick="runSystemCheck()">Run System Check</button><button onclick="location.hash='queue'">Open Queue</button></div>
          </div>
          <div class="panel">
            <div class="eyebrow">Next Best Actions</div>
            \${nextBestActionsHtml()}
          </div>
        </div>
        <div class="section"><div class="eyebrow">Six-month milestone progress</div>\${milestoneSummaryHtml()}</div>
        <div class="section"><div class="eyebrow">What needs attention today?</div>\${growthAttentionHtml()}</div>
        <div class="grid two section">
          <div class="panel"><div class="eyebrow">Partner Pipeline</div>\${partnerPipelineSummaryHtml()}</div>
          <div class="panel"><div class="eyebrow">RecordShield Funnel</div>\${funnelSummaryHtml()}</div>
        </div>
        <div class="grid two section">
          <div class="panel"><div class="eyebrow">Content Production</div>\${readinessStripHtml(posts)}</div>
          <div class="panel"><div class="eyebrow">Channel Health</div>\${channelHealthOverviewHtml()}</div>
        </div>
        <div class="section"><div class="eyebrow">Production Pipeline</div>\${productionPipelineHtml(posts)}</div>
        <div class="grid two section">
          <div class="panel"><div class="eyebrow">Performance Snapshot</div>\${performanceSnapshotHtml()}</div>
          <div class="panel"><div class="eyebrow">System Check</div>\${systemCheckPanelHtml()}</div>
        </div>
        <div class="section"><div class="eyebrow">Recent Activity</div>\${growthActivityFeedHtml()}</div>
      </section>\`;
    }

    function growthHero(pageClass, id, eyebrow, title, copy) {
      return \`<section id="\${id}" class="section secondary \${pageClass(id)}"><div class="panel hero-panel"><div class="eyebrow">\${esc(eyebrow)}</div><h1 class="big-title">\${esc(title)}</h1><p class="big-copy">\${esc(copy)}</p></div>\`;
    }

    function milestonesPageHtml(pageClass) {
      return growthHero(pageClass, "milestones", "Six-month plan", "Milestones", "Track the investor-critical goals and the next action needed to move each one.") + \`
        \${growthAttentionHtml()}
        <div class="grid post-grid section">\${growthItems("milestones").map(item => \`<article class="card drawer-card">
          <div class="row"><span class="badge \${growthTone(item.status)}">\${esc(growthLabel(item.status))}</span><strong>\${milestoneProgressValue(item)}%</strong></div>
          <h2>\${esc(item.title)}</h2>
          <p class="muted">Target: <strong>\${esc(item.target)} \${esc(item.unit || "")}</strong> · Current: <strong>\${esc(item.current)}</strong> · Owner: \${esc(item.owner || "Unassigned")} · Due: \${esc(item.dueDate || "TBD")}</p>
          <p><strong>Next:</strong> \${esc(item.nextAction || "Add next action.")}</p>
          <details><summary>Update milestone</summary>
            <form class="mini-form" onsubmit="saveMilestone(event, '\${item.id}')">
              <label>Current<input name="current" value="\${esc(item.current)}"></label>
              <label>Status<select name="status"><option value="on_track">on track</option><option value="needs_attention">needs attention</option><option value="at_risk">at risk</option><option value="complete">complete</option></select></label>
              <label>Next action<input name="nextAction" value="\${esc(item.nextAction || "")}"></label>
              <label>Due date<input type="date" name="dueDate" value="\${esc(item.dueDate || "")}"></label>
              <button class="primary">Save</button>
            </form>
          </details>
        </article>\`).join("")}</div>
      </section>\`;
    }

    function partnersPageHtml(pageClass) {
      const statuses = ["target_identified", "contact_found", "outreach_sent", "meeting_booked", "proposal_sent", "verbal_yes", "signed_pilot", "campaign_live", "paused", "closed_lost"];
      const partners = growthItems("partners");
      return growthHero(pageClass, "partners", "Partner CRM", "Partners", "Move priority organizations from target to signed pilot to live campaign.") + \`
        <details class="panel" open><summary>Add partner</summary>
          <form class="mini-form" style="margin-top:12px" onsubmit="savePartner(event)">
            <label>Organization<input name="organizationName" required></label>
            <label>Type<select name="partnerType"><option>nonprofit</option><option>government</option><option>workforce</option><option>reentry</option><option>employer</option><option>legal aid</option><option>foundation</option><option>church/community</option><option>other</option></select></label>
            <label>Region/state<input name="regionState"></label>
            <label>Contact<input name="primaryContactName"></label>
            <label>Email<input name="email" type="email"></label>
            <label>Status<select name="status">\${statuses.map(status => \`<option value="\${status}">\${growthLabel(status)}</option>\`).join("")}</select></label>
            <label>Next follow-up<input name="nextFollowUpDate" type="date"></label>
            <label>Owner<input name="owner" value="Roger"></label>
            <button class="primary">Add partner</button>
          </form>
        </details>
        <div class="section board-columns">\${statuses.slice(0, 8).map(status => {
          const items = partners.filter(item => item.status === status);
          return \`<section class="board-column"><h3>\${esc(growthLabel(status))}<span class="badge info">\${items.length}</span></h3>\${items.map(partner => \`<article class="card compact-card">
            <span class="badge \${partner.priority === "High" ? "warn" : "info"}">\${esc(partner.priority || "Normal")}</span>
            <h3>\${esc(partner.organizationName)}</h3>
            <p class="muted">\${esc(partner.partnerType || "partner")} · \${esc(partner.regionState || "region TBD")}<br>Next follow-up: \${esc(partner.nextFollowUpDate || "TBD")}</p>
            <div class="card-actions"><button onclick="quickPartnerStatus('\${partner.id}', 'proposal_sent')">Proposal sent</button><button onclick="quickPartnerStatus('\${partner.id}', 'signed_pilot')">Signed pilot</button></div>
          </article>\`).join("") || '<div class="empty">No partners here.</div>'}</section>\`;
        }).join("")}</div>
        <details class="panel section"><summary>Table view, due follow-ups, and stalled partners</summary><div class="ops-table" style="margin-top:12px">
          <div class="ops-row header"><span>Partner</span><span>Status</span><span>Owner</span><span>Follow-up</span><span>RecordShield</span><span>Next action</span></div>
          \${partners.map(partner => \`<div class="ops-row"><strong>\${esc(partner.organizationName)}</strong><span class="badge \${growthTone(partner.status)}">\${esc(growthLabel(partner.status))}</span><span>\${esc(partner.owner || "")}</span><span>\${esc(partner.nextFollowUpDate || "TBD")}</span><span>\${Number(partner.recordShieldStarts || 0)}</span><span class="muted">\${esc(partner.notes || "")}</span></div>\`).join("")}
        </div></details>
      </section>\`;
    }

    function campaignsPageHtml(pageClass) {
      const campaigns = growthItems("campaigns");
      return growthHero(pageClass, "campaigns", "Campaign operations", "Campaigns", "Build partner campaigns that turn RecordShield demand into measurable conversion data.") + \`
        <details class="panel" open><summary>Add campaign</summary>
          <form class="mini-form" style="margin-top:12px" onsubmit="saveCampaign(event)">
            <label>Name<input name="campaignName" required></label>
            <label>Partner<select name="partnerId"><option value="">Unlinked</option>\${growthItems("partners").map(partner => \`<option value="\${partner.id}">\${esc(partner.organizationName)}</option>\`).join("")}</select></label>
            <label>Type<select name="campaignType"><option>workforce/reentry</option><option>voter/civic</option><option>employer</option><option>nonprofit</option><option>government</option><option>RecordShield</option><option>expungement</option><option>awareness</option></select></label>
            <label>Status<select name="status"><option>draft</option><option>assets_needed</option><option>ready</option><option>live</option><option>paused</option><option>completed</option></select></label>
            <label>Tracking slug<input name="trackingSlug"></label>
            <label>Target referrals<input type="number" name="targetReferrals" value="100"></label>
            <button class="primary">Add campaign</button>
          </form>
        </details>
        <div class="grid post-grid section">\${campaigns.map(campaign => \`<article class="card drawer-card">
          <div class="row"><span class="badge \${growthTone(campaign.status)}">\${esc(growthLabel(campaign.status))}</span><span class="badge info">\${esc(campaign.campaignType || "campaign")}</span></div>
          <h2>\${esc(campaign.campaignName)}</h2>
          <p class="muted">Partner: \${esc(partnerById(campaign.partnerId)?.organizationName || "Unlinked")} · Region: \${esc(campaign.stateRegion || "TBD")} · Tracking: \${esc(campaign.trackingSlug || "needed")}</p>
          <div class="metric-table">
            <div class="metric-row"><span>Referrals</span><strong>\${Number(campaign.actualReferrals || 0)} / \${Number(campaign.targetReferrals || 0)}</strong></div>
            <div class="metric-row"><span>RecordShield starts</span><strong>\${Number(campaign.recordShieldStarts || 0)}</strong></div>
            <div class="metric-row"><span>Expungement.ai starts</span><strong>\${Number(campaign.expungementStarts || 0)}</strong></div>
            <div class="metric-row"><span>Paid conversions</span><strong>\${Number(campaign.paidConversions || 0)}</strong></div>
          </div>
          <div class="card-actions"><button class="primary" onclick="generateCampaignKit('\${campaign.id}')">Generate campaign kit</button><button onclick="location.hash='queue'">Create social posts</button><button onclick="addCampaignProof('\${campaign.id}')">Add proof artifact</button></div>
          <details><summary>Campaign kit and copy actions</summary><p class="muted">Landing page copy, partner email, SMS, 5 social drafts, flyer copy, FAQ, talking points, disclaimers, launch timeline, and reporting expectations are exported locally.</p><p><code>\${esc(campaign.latestCampaignKitPath || "No kit generated yet")}</code></p></details>
        </article>\`).join("") || '<div class="empty">No campaigns yet. Add one campaign to generate a launch kit.</div>'}</div>
      </section>\`;
    }

    function funnelPageHtml(pageClass) {
      const totals = funnelTotals();
      const stages = [
        ["Landing visits", totals.landingPageVisits],
        ["RecordShield starts", totals.recordShieldStarts],
        ["RecordShield completions", totals.recordShieldCompletions],
        ["Results viewed", totals.resultsViewed],
        ["Cleanup CTA clicked", totals.cleanupCtaClicked],
        ["Expungement.ai intake", totals.expungementIntakeStarted],
        ["Payment started", totals.paymentStarted],
        ["Payment completed", totals.paymentCompleted],
        ["Packet generated", totals.packetGenerated],
        ["Packet completed", totals.packetCompleted],
        ["Petition filed", totals.petitionFiled],
        ["Outcome known", totals.outcomeKnown]
      ];
      return growthHero(pageClass, "funnel", "RecordShield funnel", "RecordShield Funnel", "Manually track conversion until automated events are wired.") + \`
        <div class="grid three section">\${stages.map(([label, value], index) => {
          const prev = index ? Number(stages[index - 1][1] || 0) : Number(value || 0);
          const rate = prev ? Math.round((Number(value || 0) / prev) * 100) : 0;
          return \`<div class="funnel-stage"><span class="muted">\${esc(label)}</span><strong>\${Number(value || 0)}</strong><span class="badge \${index && rate < 50 ? "warn" : "info"}">\${index ? rate + "% from prior" : "top"}</span></div>\`;
        }).join("")}</div>
        <details class="panel section" open><summary>Add manual funnel snapshot</summary>
          <form class="mini-form" style="margin-top:12px" onsubmit="saveFunnelSnapshot(event)">
            <label>Partner<select name="partnerId"><option value="">Unlinked</option>\${growthItems("partners").map(partner => \`<option value="\${partner.id}">\${esc(partner.organizationName)}</option>\`).join("")}</select></label>
            <label>Campaign<select name="campaignId"><option value="">Unlinked</option>\${growthItems("campaigns").map(campaign => \`<option value="\${campaign.id}">\${esc(campaign.campaignName)}</option>\`).join("")}</select></label>
            <label>State<input name="state"></label>
            <label>Source<input name="source"></label>
            <label>Visits<input type="number" name="landingPageVisits" value="0"></label>
            <label>RS starts<input type="number" name="recordShieldStarts" value="0"></label>
            <label>Exp starts<input type="number" name="expungementIntakeStarted" value="0"></label>
            <label>Revenue<input type="number" name="revenue" value="0"></label>
            <button class="primary">Save snapshot</button>
          </form>
        </details>
      </section>\`;
    }

    function pilotsPageHtml(pageClass) {
      return growthHero(pageClass, "pilots", "Pilot tracker", "Pilots", "Turn partners into proof: scoped, signed, live, reported, and ready for public validation.") + \`
        <div class="grid post-grid section">\${growthItems("pilots").map(pilot => {
          const checklist = pilot.checklist || {};
          const done = Object.values(checklist).filter(Boolean).length;
          const total = Object.keys(checklist).length || 14;
          return \`<article class="card drawer-card">
            <div class="row"><span class="badge \${growthTone(pilot.status)}">\${esc(growthLabel(pilot.status))}</span><span class="badge info">Proof: \${esc(growthLabel(pilot.publicProofStatus))}</span></div>
            <h2>\${esc(pilot.pilotName)}</h2>
            <p class="muted">Partner: \${esc(partnerById(pilot.partnerId)?.organizationName || "Unlinked")} · Users: \${Number(pilot.actualUsers || 0)} / \${Number(pilot.targetUsers || 0)} · Checklist: \${done}/\${total}</p>
            <p><strong>Next:</strong> \${esc(pilot.nextAction || "Add next action.")}</p>
            <details><summary>Pilot checklist</summary><div class="grid three" style="margin-top:12px">\${Object.entries(checklist).map(([key, value]) => \`<div class="metric-row"><span>\${esc(growthLabel(key))}</span><span class="badge \${value ? "good" : "warn"}">\${value ? "Done" : "Open"}</span></div>\`).join("")}</div></details>
          </article>\`;
        }).join("") || '<div class="empty">No pilots yet. Link a signed partner to create the first pilot.</div>'}</div>
      </section>\`;
    }

    function compliancePageHtml(pageClass) {
      return growthHero(pageClass, "compliance", "Compliance queue", "Compliance", "Keep consumer-facing claims operationally honest and non-UPL safe.") + \`
        <div class="grid post-grid section">\${growthItems("complianceItems").map(item => \`<article class="card drawer-card">
          <div class="row"><span class="badge \${growthTone(item.status)}">\${esc(growthLabel(item.status))}</span><span class="badge \${growthTone(item.riskLevel)}">\${esc(item.riskLevel || "medium")} risk</span></div>
          <h2>\${esc(item.itemTitle)}</h2>
          <p class="muted">\${esc(item.itemType || "item")} · Reviewer: \${esc(item.reviewer || "Unassigned")} · Review date: \${esc(item.reviewDate || "TBD")}</p>
          <p><strong>Issue:</strong> \${esc(item.issueSummary || "Needs review.")}</p>
          <p class="muted"><strong>Disclaimer:</strong> \${esc(item.requiredDisclaimer || "General information only. Rules vary by state and case.")}</p>
          <div class="card-actions"><button onclick="quickComplianceStatus('\${item.id}', 'approved')">Approve</button><button onclick="quickComplianceStatus('\${item.id}', 'needs_edits')">Needs edits</button><button onclick="quickComplianceStatus('\${item.id}', 'blocked')">Block</button></div>
        </article>\`).join("") || '<div class="empty">No compliance items. Route campaign kits, landing pages, emails, and high-risk posts here before launch.</div>'}</div>
      </section>\`;
    }

    function reportsPageHtml(pageClass) {
      const types = ["weekly_internal", "partner_campaign", "pilot_report", "investor_update", "data_room_traction_snapshot"];
      return growthHero(pageClass, "reports", "Report generator", "Reports", "Export concise operating reports from milestones, partner pipeline, campaigns, pilots, funnel, content, risks, and next actions.") + \`
        <section class="panel section"><div class="grid three">\${types.map(type => \`<article class="card compact-card"><span class="badge info">\${esc(growthLabel(type))}</span><h3>\${esc(growthLabel(type))}</h3><p class="muted">Exports .md and .txt under data/exports/reports/.</p><button class="primary" onclick="exportGrowthReport('\${type}')">Export report</button></article>\`).join("")}</div></section>
        <div class="grid post-grid section">\${growthItems("reports").map(report => \`<article class="card drawer-card"><span class="badge good">Exported</span><h2>\${esc(growthLabel(report.reportTitle))}</h2><p class="muted">\${esc(report.generatedAt || "")}<br><code>\${esc(report.markdownPath || "")}</code><br><code>\${esc(report.textPath || "")}</code></p></article>\`).join("") || '<div class="empty">No reports exported yet.</div>'}</div>
      </section>\`;
    }

    function dataRoomPageHtml(pageClass) {
      const sections = ["Company overview", "Product suite", "Traction", "Partner pipeline", "Campaigns", "Pilots", "RecordShield funnel", "Revenue", "Compliance", "Technical architecture", "Security", "Case studies", "Press/public proof", "Financial model", "Acquisition thesis"];
      return growthHero(pageClass, "dataroom", "Investor proof system", "Data Room", "Track the artifacts that support investor, institutional, and acquisition conversations.") + \`
        <div class="readiness-strip section">\${["missing", "draft", "uploaded", "approved"].map(status => \`<button class="strip-card"><span class="badge \${growthTone(status)}">\${esc(status)}</span><strong>\${growthItems("dataRoomItems").filter(item => item.status === status).length}</strong></button>\`).join("")}</div>
        <details class="panel section" open><summary>Add data room item</summary>
          <form class="mini-form" style="margin-top:12px" onsubmit="saveDataRoomItem(event)">
            <label>Title<input name="title" required></label>
            <label>Section<select name="section">\${sections.map(section => \`<option>\${esc(section)}</option>\`).join("")}</select></label>
            <label>Status<select name="status"><option>missing</option><option>draft</option><option>uploaded</option><option>approved</option></select></label>
            <label>File/link/path<input name="filePath"></label>
            <label>Owner<input name="owner" value="Operations"></label>
            <button class="primary">Add item</button>
          </form>
        </details>
        <div class="grid post-grid section">\${growthItems("dataRoomItems").map(item => \`<article class="card drawer-card"><div class="row"><span class="badge \${growthTone(item.status)}">\${esc(item.status)}</span><span class="badge info">\${esc(item.section)}</span></div><h2>\${esc(item.title)}</h2><p class="muted">Owner: \${esc(item.owner || "Unassigned")} · Updated: \${esc(item.lastUpdated || "not yet")}<br><code>\${esc(item.filePath || "No file attached")}</code></p><p>\${esc(item.notes || "")}</p></article>\`).join("")}</div>
      </section>\`;
    }

    function assetLibraryPageHtml(pageClass) {
      const local = state.settings?.localAssets || [];
      const generatedFinals = (state.postImages || []).filter(image => image.finalPngPath).length;
      const kits = (state.posts || []).filter(post => post.postingPackageGenerated).length;
      const categories = [
        ["Wilma poses", local.filter(asset => asset.type === "wilma_pose")],
        ["Backgrounds", local.filter(asset => asset.type === "background")],
        ["Brand/watermarks", local.filter(asset => asset.type === "brand_mark")],
        ["Generated finals", Array.from({ length: generatedFinals }, (_, index) => ({ label:"Final PNG " + (index + 1), type:"generated_final", active:true, filePath:"data/exports/final-pngs/" }))],
        ["Posting kits", Array.from({ length: kits }, (_, index) => ({ label:"Posting kit " + (index + 1), type:"posting_kit", active:true, filePath:"data/exports/posting-kits/" }))]
      ];
      return \`<section id="assets" class="section secondary \${pageClass("assets")}">
        <div class="panel hero-panel"><div class="eyebrow">Asset Library</div><h1 class="big-title">Brand assets, Wilma poses, and generated files.</h1><p class="big-copy">Register files once, then use them in Final PNG rendering and posting packages.</p></div>
        <div class="asset-library-grid">\${categories.map(([title, assets]) => \`<section class="panel"><h2>\${esc(title)}</h2><div class="grid">\${assets.length ? assets.map(asset => \`<article class="card compact-card"><div class="asset-thumb">\${asset.publicUrl ? \`<img src="\${esc(asset.publicUrl)}" alt="\${esc(asset.label)}">\` : esc(String(asset.type || title).slice(0, 2).toUpperCase())}</div><h3>\${esc(asset.label || title)}</h3><p class="muted">\${esc(asset.type || "")}<br><code>\${esc(asset.filePath || "")}</code></p><span class="badge \${asset.active === false ? "warn" : "good"}">\${asset.active === false ? "inactive" : "active"}</span></article>\`).join("") : '<div class="empty">No assets in this category yet.</div>'}</div></section>\`).join("")}</div>
        <details class="panel" style="margin-top:16px"><summary>Register or inspect assets</summary><div style="margin-top:14px">\${assetsSettingsHtml()}</div></details>
      </section>\`;
    }

    function metricsDashboardHtml(pageClass) {
      const posts = postedPosts();
      const row = (label, keyFn) => {
        const totals = {};
        for (const post of posts) {
          const key = keyFn(post) || "Unassigned";
          totals[key] = (totals[key] || 0) + performanceEngagement(post.performance || {});
        }
        const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return \`<section class="panel"><h2>\${esc(label)}</h2><div class="metric-table">\${entries.length ? entries.map(([key, value]) => \`<div class="metric-row"><span>\${esc(platformLabels[key] || key)}</span><strong>\${value}</strong></div>\`).join("") : '<div class="empty">Metrics needed.</div>'}</div></section>\`;
      };
      return \`<section id="metrics" class="section secondary \${pageClass("metrics")}">
        <div class="panel hero-panel"><div class="eyebrow">Learning Layer</div><h1 class="big-title">What is producing results?</h1><p class="big-copy">Track performance by channel, bucket, speaker, Wilma usage, and post type.</p></div>
        <div style="margin-top:14px">\${postedSummaryHtml()}</div>
        <div class="grid two" style="margin-top:14px">
          \${row("By platform", post => post.platform)}
          \${row("By content bucket", post => post.contentBucket || post.wilmaVisualBucket)}
          \${row("By speaker", post => post.speaker)}
          \${row("By Wilma usage", post => post.speaker === "wilma" || post.wilmaExpression ? "Wilma used" : "No Wilma")}
        </div>
        <div class="grid two" style="margin-top:14px">
          <section class="panel"><h2>Repurpose candidates</h2><div class="grid">\${posts.filter(post => performanceLabelFor(post.performance || {}) === "Repurpose Candidate").map(post => \`<article class="metric-row"><span>\${esc(post.title)}</span><button onclick="createRepurposeDraft('\${post.id}')">Repurpose</button></article>\`).join("") || '<div class="empty">No candidates yet.</div>'}</div></section>
          <section class="panel"><h2>Posts missing metrics</h2><div class="grid">\${posts.filter(postedNeedsMetrics).map(post => \`<article class="metric-row"><span>\${esc(post.title)}</span><button onclick="location.hash='posted'">Add metrics</button></article>\`).join("") || '<div class="empty">All posted items have basic metrics.</div>'}</div></section>
        </div>
      </section>\`;
    }

    function render() {
      const c = counts();
      const queueStatuses = ["draft", "needs_review", "approved", "scheduled", "failed", "blocked_channel_not_connected", "retry_ready", "posted", "manually_posted"];
      const reviewPosts = state.posts.filter(post => queueStatuses.includes(post.status) || post.manuallyPostedAt || post.postedAt).slice().reverse();
      const visibleReviewPosts = sortQueuePosts(reviewPosts.filter(queueReadinessMatches));
      const operatorPosts = todayReviewPosts();
      const newestPosts = state.posts.slice().reverse().slice(0, 6);
      const needsReview = state.posts.filter(post => post.complianceRisk !== "low" && ["draft", "needs_review", "approved"].includes(post.status)).length;
      const strongDrafts = state.posts.filter(post => ["draft", "needs_review"].includes(post.status) && (post.qualityLabel || "strong") === "strong").length;
      const wilmaDrafts = state.posts.filter(post => ["draft", "needs_review", "approved"].includes(post.status) && post.speaker === "wilma").length;
      const legalEaseDrafts = state.posts.filter(post => ["draft", "needs_review", "approved"].includes(post.status) && post.speaker === "legalease").length;
      const latestImage = (state.postImages || [])[0];
      const imageBlocked = latestImage?.generationError;
      const imageGenerated = /^openai_(image|background)/.test(String(latestImage?.generationMode || "")) && latestImage?.generationStatus === "generated";
      const imageStatusTone = imageBlocked ? "danger" : imageGenerated ? "good" : "warn";
      const imageStatusLabel = imageBlocked ? "Blocked" : imageGenerated ? "OpenAI generated" : "Ready or untested";
      const imageStatusDetail = imageBlocked
        ? esc(imageBlocked)
        : imageGenerated
          ? \`Latest image generated with OpenAI. Version \${latestImage.versionNumber || 1}.\`
          : "Regenerate an image to test live generation.";
      const fallbackQueue = visibleReviewPosts;
      const repurposedQueueCount = reviewPosts.filter(post => post.repurposedFromPostId || String(post.sourceType || "").toLowerCase() === "repurposed").length;
      const originalQueueCount = reviewPosts.length - repurposedQueueCount;
      const approvedCount = c.approved || 0;
      const scheduledCount = c.scheduled || 0;
      const publishingCount = c.publishing || 0;
      const failedCount = c.failed || 0;
      const blockedCount = c.blocked_channel_not_connected || 0;
      const schemaStale = Boolean(state.schemaStatus?.stale);
      const requestedPage = String(location.hash || "#overview").replace("#", "");
      const pageId = ["overview", "milestones", "partners", "campaigns", "funnel", "queue", "sources", "assets", "posted", "pilots", "compliance", "reports", "dataroom", "metrics", "settings"].includes(requestedPage) ? requestedPage : "overview";
      const pageClass = id => \`page-section \${id === pageId ? "active" : ""}\`;
      document.querySelector("#storeStatus").textContent = schemaStale
        ? "Current store: Supabase schema needs update"
        : \`Current store: \${state.persistence === "supabase" ? "Supabase" : "local JSON fallback"}\`;
      const healthTone = schemaStale ? "danger" : supabaseHealth?.connected ? "good" : supabaseHealth?.configured ? "warn" : "danger";
      document.querySelector("#app").innerHTML = \`
        \${pageId === "overview" ? commandCenterOverviewHtml(reviewPosts) : ""}
        \${milestonesPageHtml(pageClass)}
        \${partnersPageHtml(pageClass)}
        \${campaignsPageHtml(pageClass)}
        \${funnelPageHtml(pageClass)}
        <section id="queue" class="grid command \${pageClass("queue")}">
          <div class="panel hero-panel">
            <div>
              <div class="eyebrow">Today's queue</div>
              <h1 class="big-title">Make the next good post.</h1>
              <p class="big-copy">\${fallbackQueue.length || reviewPosts.length} posts need attention. Start with the first card, follow the one next action, and leave the machinery tucked away.</p>
            </div>
            \${dailyControlBarHtml(reviewPosts)}
            <div class="toolbar">
              <button class="primary" onclick="createTomorrowQueue()">Add tomorrow's posts</button>
              <button onclick="toggleBulkMode()">\${bulkMode ? "Exit bulk mode" : "Bulk mode"}</button>
              <details class="toolbar-more">
                <summary>Tools</summary>
                <div class="card-actions" style="margin-top:10px">
                  <button onclick="checkPublishingQueue()">Check readiness</button>
                  <button onclick="exportPlan()">Export plan</button>
                </div>
              </details>
              <label class="sort-control">Sort
                <select onchange="setQueueSort(this.value)">
                  <option value="priority" \${queueSort === "priority" ? "selected" : ""}>Priority</option>
                  <option value="newest" \${queueSort === "newest" ? "selected" : ""}>Newest</option>
                  <option value="oldest" \${queueSort === "oldest" ? "selected" : ""}>Oldest</option>
                  <option value="platform" \${queueSort === "platform" ? "selected" : ""}>Platform</option>
                  <option value="risk" \${queueSort === "risk" ? "selected" : ""}>Risk</option>
                  <option value="status" \${queueSort === "status" ? "selected" : ""}>Status</option>
                </select>
              </label>
            </div>
            \${bulkMode ? \`<div class="bulk-bar"><strong>\${selectedPosts.size} selected</strong><button onclick="bulkMarkReviewed()">Mark reviewed</button><button onclick="bulkCreateFinalPngs()">Create final PNGs</button><button onclick="bulkExportKits()">Export kits</button><button onclick="bulkMarkManualPosted()">Mark manual posted</button></div>\` : ""}
            <div class="queue-filter">
              <span class="muted">Queue filter</span>
              <button class="tab \${queueReadinessFilter === "all" ? "active" : ""}" onclick="setQueueReadinessFilter('all')">All \${reviewPosts.length}</button>
              <button class="tab \${queueReadinessFilter === "ready" ? "active" : ""}" onclick="setQueueReadinessFilter('ready')">Ready</button>
              <button class="tab \${queueReadinessFilter === "review" ? "active" : ""}" onclick="setQueueReadinessFilter('review')">Review</button>
              <button class="tab \${queueReadinessFilter === "blocked" ? "active" : ""}" onclick="setQueueReadinessFilter('blocked')">Blocked</button>
              <button class="tab \${queueReadinessFilter === "image" ? "active" : ""}" onclick="setQueueReadinessFilter('image')">Needs Image</button>
              <button class="tab \${queueReadinessFilter === "final_png" ? "active" : ""}" onclick="setQueueReadinessFilter('final_png')">Needs Final PNG</button>
              <button class="tab \${queueReadinessFilter === "manual_kit" ? "active" : ""}" onclick="setQueueReadinessFilter('manual_kit')">Manual Kit</button>
              <button class="tab \${queueReadinessFilter === "posted" ? "active" : ""}" onclick="setQueueReadinessFilter('posted')">Posted</button>
            </div>
          </div>
          <div class="section">
            <div class="grid post-grid">\${fallbackQueue.map(post => postCard(post)).join("") || queueEmptyHtml()}</div>
          </div>
          <div class="section secondary">
            <details>
              <summary>First Queue Review</summary>
              <div style="margin-top:14px">\${firstQueueReviewHtml()}</div>
            </details>
            <details>
              <summary>First-Day QA Checklist</summary>
              <div style="margin-top:14px">\${firstDayQaChecklistHtml()}</div>
            </details>
            <details>
              <summary>Today's Review</summary>
              <div style="margin-top:14px">\${todayReviewHtml()}</div>
            </details>
            <details>
              <summary>Ready to publish</summary>
              <div style="margin-top:14px">\${readyReviewHtml()}</div>
            </details>
          </div>
        </section>
        <section id="sources" class="section secondary \${pageClass("sources")}">
          <details open>
            <summary>Source-to-Queue Intake</summary>
            <div style="margin-top:14px">\${sourceSummaryHtml()}</div>
            \${sourceFiltersHtml()}
            <div class="grid post-grid">\${sourceCardsHtml()}</div>
          </details>
          <details>
            <summary>Add source item</summary>
            <div style="margin-top:14px">\${sourceIntakeHtml()}</div>
          </details>
          <details>
            <summary>Automated source feeds</summary>
            <div style="margin-top:14px">\${sourceAutomationHtml()}</div>
          </details>
          <details>
            <summary>Legacy direct draft generator</summary>
            <form onsubmit="generate(event)" style="margin-top:14px">
              <div class="grid split">
                <label>Source type<select name="sourceType"><option value="manual_note">Manual note</option><option value="news_url">News URL</option><option value="research_data">Research/data</option><option value="partner_update">Partner/community update</option><option value="wilma_activity">Wilma activity</option></select></label>
                <label>Source URL<input name="sourceUrl" placeholder="Optional source link"></label>
              </div>
              <label>What happened or what do you want to say?<textarea name="topic" required>Lawrence tried to pass a bill that would have killed our startup.</textarea></label>
              <label>Source summary<input name="sourceSummary" placeholder="Short factual summary for review"></label>
              <input type="hidden" name="platform" value="all">
              <input type="hidden" name="tone" value="founder-led">
              <div class="grid split">
                <label>Campaign<input name="campaign" value="Justice Tech Infrastructure"></label>
                <label>CTA<input name="cta" value="Make second chances easier to find, understand, and act on."></label>
              </div>
              <button class="primary">Generate queue drafts</button>
            </form>
          </details>
        </section>
        \${assetLibraryPageHtml(pageClass)}
        <section id="posted" class="section secondary \${pageClass("posted")}">
          <details open>
            <summary>Posted Archive + Performance Feedback</summary>
            <div style="margin-top:14px">\${postedSummaryHtml()}</div>
            <div class="grid post-grid" style="margin-top:14px">\${postedArchiveHtml()}</div>
          </details>
          <details>
            <summary>Calendar and publishing admin</summary>
            <div class="grid calendar" style="margin-top:14px">\${calendarHtml()}</div>
            <div class="grid post-grid" style="margin-top:14px">\${publishingQueueHtml()}</div>
            <details style="margin-top:12px">
              <summary class="muted">Admin publish events</summary>
              <div class="grid" style="margin-top:12px">\${publishEventsHtml()}</div>
            </details>
          </details>
        </section>
        \${pilotsPageHtml(pageClass)}
        \${compliancePageHtml(pageClass)}
        \${reportsPageHtml(pageClass)}
        \${dataRoomPageHtml(pageClass)}
        \${metricsDashboardHtml(pageClass)}
        <section id="settings" class="section secondary \${pageClass("settings")}">
          <details open>
            <summary>Launch setup</summary>
            <div style="margin-top:14px">\${manualModeHtml()}</div>
            <div style="margin-top:14px">\${linkedInDryTestChecklistHtml()}</div>
            <div style="margin-top:14px">\${dailyRhythmHtml()}</div>
            <div class="grid two" style="margin-top:14px">\${credentialReadinessHtml()}</div>
          </details>
          <details open>
            <summary>Launch readiness</summary>
            <div style="margin-top:14px">\${launchChecklistHtml()}</div>
          </details>
          <details open>
            <summary>Assets</summary>
            <p class="muted">Local Wilma poses, backgrounds, and watermark files used by Final PNG rendering.</p>
            <div style="margin-top:14px">\${assetsSettingsHtml()}</div>
          </details>
          <details open>
            <summary>Backup & Restore</summary>
            <p class="muted">Local safety snapshots for operational data and generated posting files.</p>
            <div style="margin-top:14px">\${backupRestoreHtml()}</div>
          </details>
          <details open>
            <summary>Channels</summary>
            <p class="muted">Connect once. After that, approved scheduled posts can publish without you touching platform settings.</p>
            <div class="grid channel-grid" style="margin-top:14px">\${channelCards()}</div>
          </details>
          <details>
            <summary>System status</summary>
            <div class="grid three" style="margin-top:14px">
              <div class="panel"><h2>OpenAI Images</h2><p><span class="badge \${imageStatusTone}">\${imageStatusLabel}</span></p><p class="muted">\${imageStatusDetail}</p></div>
              <div class="panel"><h2>Storage</h2><p><span class="badge info">\${state.persistence === "supabase" ? "Supabase" : "local JSON fallback"}</span></p></div>
              <div class="panel"><h2>Supabase</h2><p><span class="badge \${healthTone}">\${schemaStale ? "Schema update needed" : supabaseHealth?.connected ? "Connected" : "Not connected"}</span></p><p class="muted">\${esc(state.schemaStatus?.detail || supabaseHealth?.error || "No connection errors.")}</p></div>
            </div>
          </details>
          <details style="margin-top:12px" open>
            <summary>Production setup checklist</summary>
            <p class="muted">This is the shortest path from local MVP to real publishing. It shows status only, never secret values.</p>
            <div class="grid two" style="margin-top:14px">\${setupChecklistHtml()}</div>
          </details>
          <details style="margin-top:12px">
            <summary>Content intelligence</summary>
            <p class="muted">Scoring and compliance stay mostly invisible. Normal users see simple labels; admin details explain why.</p>
            <div style="margin-top:14px">\${contentIntelligenceHtml()}</div>
          </details>
          <details style="margin-top:12px">
            <summary>Content library</summary>
            <div class="grid layout" style="margin-top:14px">
              <form class="panel" onsubmit="addLibrary(event)">
                <label>Category<select name="category"><option>hook</option><option>cta</option><option>fact</option><option>wilma</option><option>statistic</option><option>guardrail</option></select></label>
                <label>Title<input name="title" required placeholder="Approved CTA"></label>
                <label>Body<textarea name="body" required placeholder="Make second chances easier to act on."></textarea></label>
                <button class="primary">Add item</button>
              </form>
              <div class="grid">\${state.library.map(item => \`<article class="card"><span class="badge info">\${esc(item.category)}</span><h3>\${esc(item.title)}</h3><p class="muted">\${esc(item.body)}</p></article>\`).join("")}</div>
            </div>
          </details>
          <details style="margin-top:12px">
            <summary>Admin brand system</summary>
            <p class="muted">Advanced controls for assets, rules, generation defaults, and prompt debugging.</p>
            <div class="tabs">
              <button class="tab active" onclick="showBrandTab('assets', this)">Brand Assets</button>
              <button class="tab" onclick="showBrandTab('rules', this)">Brand Rules</button>
              <button class="tab" onclick="showBrandTab('defaults', this)">Image Defaults</button>
              <button class="tab" onclick="showBrandTab('advanced', this)">Advanced Prompt Controls</button>
            </div>
            <div id="brandTab"></div>
          </details>
        </section>\`;
      document.querySelectorAll("nav a").forEach(link => {
        link.classList.toggle("active", link.getAttribute("href") === "#" + pageId);
      });
      renderBrandTab("assets");
    }

    function showBrandTab(tab, button) {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      renderBrandTab(tab);
    }

    function assetTypeLabel(type = "") {
      return {
        wilma_pose: "Wilma pose",
        background: "Background",
        brand_mark: "Brand mark"
      }[type] || type;
    }

    function assetListHtml(type) {
      const assets = localAssets(type);
      if (!assets.length) {
        const folder = type === "wilma_pose" ? "data/assets/wilma-poses/" : type === "background" ? "data/assets/backgrounds/" : "data/assets/brand/";
        return \`<p class="empty">No \${esc(assetTypeLabel(type).toLowerCase())} assets yet. Place files in <code>\${folder}</code>, then register them here.</p>\`;
      }
      return assets.map(asset => \`<article class="card compact-card">
        <span class="badge info">\${esc(assetTypeLabel(asset.type))}</span>
        <span class="badge \${asset.active === false ? "warn" : "good"}">\${asset.active === false ? "inactive" : "active"}</span>
        <h3>\${esc(asset.label)}</h3>
        <p class="muted"><code>\${esc(asset.filePath)}</code><br>\${esc(asset.notes || "")}</p>
      </article>\`).join("");
    }

    function poseMappingHtml() {
      const mappings = poseMappings();
      return \`<details class="wilma-details">
        <summary>23 Wilma pose mappings</summary>
        <div class="grid three" style="margin-top:12px">\${mappings.map(mapping => {
          const asset = localAssets("wilma_pose").find(item => item.id === mapping.linkedAssetId);
          return \`<article class="card compact-card">
            <span class="badge info">Pose \${mapping.poseRefNumber}</span>
            <span class="badge \${asset ? "good" : "warn"}">\${asset ? "asset linked" : "fallback"}</span>
            <h3>\${esc(mapping.label)}</h3>
            <p class="muted"><strong>\${esc(mapping.expressionCategory)}</strong><br>\${esc(mapping.recommendedUse)}<br>\${asset ? esc(asset.label) : esc(mapping.fallbackPlaceholder)}</p>
          </article>\`;
        }).join("")}</div>
      </details>\`;
    }

    function assetsSettingsHtml() {
      return \`<div class="grid layout">
        <form class="panel" onsubmit="registerLocalAsset(event)">
          <h3>Register local asset</h3>
          <label>Label<input name="label" required placeholder="Wilma pose 7 waving"></label>
          <label>Type<select name="type"><option value="wilma_pose">Wilma pose</option><option value="background">Background</option><option value="brand_mark">Brand mark</option></select></label>
          <label>File path<input name="filePath" required placeholder="data/assets/wilma-poses/wilma-pose-07.png"></label>
          <label>Notes<textarea name="notes" placeholder="Use for helpful or reassuring posts."></textarea></label>
          <button class="primary">Register Asset</button>
          <p class="muted">Only files under <code>data/assets/</code> are allowed. Supported: PNG, JPG, JPEG, WEBP.</p>
        </form>
        <div>
          <div class="grid three">
            <section><h3>Wilma poses</h3>\${assetListHtml("wilma_pose")}</section>
            <section><h3>Backgrounds</h3>\${assetListHtml("background")}</section>
            <section><h3>Brand marks</h3>\${assetListHtml("brand_mark")}</section>
          </div>
          \${poseMappingHtml()}
        </div>
      </div>\`;
    }

    function backupCountsHtml(counts = {}) {
      return \`Sources \${Number(counts.sources || 0)} · Queue \${Number(counts.queuePosts || 0)} · Posted \${Number(counts.postedItems || 0)} · Assets \${Number(counts.assets || 0)} · PNGs \${Number(counts.finalPngExports || 0)} · Kits \${Number(counts.postingKits || 0)}\`;
    }

    function backupRestoreHtml() {
      const latest = backups[0] || state.settings?.latestBackup || null;
      return \`<div class="grid layout">
        <section class="panel">
          <h3>Create Backup</h3>
          <p class="muted">Backs up local JSON, assets, Final PNGs, and posting kits. Secrets and env files are never included.</p>
          <button class="primary" onclick="createBackup()">Create Backup</button>
          \${latest ? \`<div class="readiness-card good" style="margin-top:12px">
            <div class="readiness-title">Latest Backup</div>
            <p class="muted"><strong>\${esc(latest.backupId)}</strong><br>\${esc(latest.createdAt || "")}<br><code>\${esc(latest.relativePath || "")}</code><br>\${esc(backupCountsHtml(latest.counts || {}))}</p>
            \${latest.manifestUrl ? \`<a class="button-link" href="\${esc(latest.manifestUrl)}" target="_blank">Open Backup Manifest</a>\` : ""}
          </div>\` : \`<p class="empty">No local backups yet.</p>\`}
        </section>
        <section class="panel">
          <h3>Restore Backup</h3>
          <p class="muted"><strong>Safety warning:</strong> restore replaces current local data/assets/exports. The app creates a pre-restore safety backup first.</p>
          <label>Backup path<input id="restore-backup-path" placeholder="data/backups/backup-2026-05-14-143022"></label>
          <button class="danger" onclick="restoreBackup()">Restore Backup</button>
        </section>
        <section class="panel">
          <h3>Recent Backups</h3>
          <div class="grid">\${(backups || []).slice(0,5).map(backup => \`<article class="card compact-card">
            <span class="badge \${backup.complete ? "good" : "warn"}">\${backup.complete ? "complete" : "incomplete"}</span>
            <h3>\${esc(backup.backupId)}</h3>
            <p class="muted">\${esc(backup.createdAt || "timestamp missing")}<br><code>\${esc(backup.relativePath)}</code><br>\${esc(backupCountsHtml(backup.counts || {}))}</p>
            <button onclick="document.getElementById('restore-backup-path').value='\${esc(backup.relativePath)}'">Use for Restore</button>
          </article>\`).join("") || \`<p class="empty">No backups found in <code>data/backups/</code>.</p>\`}</div>
        </section>
      </div>\`;
    }

    function formObject(form) {
      const data = Object.fromEntries(new FormData(form).entries());
      for (const key of Object.keys(data)) {
        if (/count|starts|visits|completed|generated|filed|known|revenue|users|referrals|target|actual|screenings|clicks|leads|paid/i.test(key)) {
          const number = Number(data[key]);
          if (data[key] !== "" && Number.isFinite(number)) data[key] = number;
        }
      }
      return data;
    }

    async function saveGrowth(collection, item) {
      const result = await api("/api/growth/upsert", { method:"POST", body:JSON.stringify({ collection, item }) });
      state = result.state;
      toast(result.message || "Saved.");
      render();
      return result;
    }

    async function saveMilestone(event, id) {
      event.preventDefault();
      await saveGrowth("milestones", { ...formObject(event.target), id });
    }

    async function savePartner(event) {
      event.preventDefault();
      await saveGrowth("partners", { ...formObject(event.target), priority:"High", referralCount:0, screenings:0, recordShieldStarts:0, expungementStarts:0, revenue:0 });
      event.target.reset();
    }

    async function quickPartnerStatus(id, status) {
      const partner = partnerById(id);
      if (!partner) return;
      await saveGrowth("partners", { ...partner, status, lastTouchDate:new Date().toISOString().slice(0, 10) });
    }

    async function saveCampaign(event) {
      event.preventDefault();
      await saveGrowth("campaigns", { ...formObject(event.target), actualReferrals:0, recordShieldStarts:0, expungementStarts:0, paidConversions:0 });
      event.target.reset();
    }

    async function generateCampaignKit(campaignId) {
      const result = await api("/api/growth/campaign-kit", { method:"POST", body:JSON.stringify({ campaignId }) });
      state = result.state;
      toast(result.message || "Campaign kit generated.");
      render();
    }

    async function addCampaignProof(campaignId) {
      const campaign = campaignById(campaignId);
      if (!campaign) return;
      await saveGrowth("dataRoomItems", {
        title: \`Proof artifact: \${campaign.campaignName}\`,
        section: "Campaigns",
        status: "draft",
        filePath: campaign.latestCampaignKitPath || "",
        owner: "Operations",
        notes: "Added from campaign page. Attach campaign results, partner approval, or launch evidence."
      });
      location.hash = "dataroom";
    }

    async function saveFunnelSnapshot(event) {
      event.preventDefault();
      await saveGrowth("funnelSnapshots", { ...formObject(event.target), dateRange:new Date().toISOString().slice(0, 7) });
      event.target.reset();
    }

    async function quickComplianceStatus(id, status) {
      const item = growthItems("complianceItems").find(entry => entry.id === id);
      if (!item) return;
      await saveGrowth("complianceItems", { ...item, status, reviewDate:new Date().toISOString().slice(0, 10) });
    }

    async function exportGrowthReport(reportType) {
      const result = await api("/api/growth/report", { method:"POST", body:JSON.stringify({ reportType }) });
      state = result.state;
      toast(result.message || "Report exported.");
      render();
    }

    async function saveDataRoomItem(event) {
      event.preventDefault();
      await saveGrowth("dataRoomItems", { ...formObject(event.target), lastUpdated:new Date().toISOString().slice(0, 10) });
      event.target.reset();
    }

    function renderBrandTab(tab) {
      const target = document.querySelector("#brandTab");
      if (!target) return;
      if (tab === "assets") {
        target.innerHTML = \`<div class="grid layout">
          <form class="panel" onsubmit="addBrandAsset(event)">
            <h3>Add brand asset</h3>
            <label>Name<input name="name" required placeholder="Wilma alternate pose"></label>
            <label>Asset type<select name="assetType"><option value="logo">Logo</option><option value="wilma_reference">Wilma reference</option><option value="brand_bible">Brand bible</option><option value="template">Template</option><option value="icon">Icon</option><option value="background">Background</option><option value="example_output">Example output</option></select></label>
            <label>File URL<input name="fileUrl" required placeholder="/brand/wilma/canonical/wilma-primary.png"></label>
            <label>Tags<input name="tags" placeholder="wilma, canonical, approved"></label>
            <button class="primary">Save asset metadata</button>
          </form>
          <div class="grid">\${(state.brandAssets || []).map(asset => \`<article class="card"><span class="badge info">\${esc(asset.assetType)}</span><span class="badge \${asset.approved ? "good" : "warn"}">\${asset.approved ? "approved" : "pending"}</span><h3>\${esc(asset.name)}</h3><p class="muted">\${esc(asset.fileUrl)}<br>\${(asset.tags || []).map(esc).join(", ")}</p></article>\`).join("")}</div>
        </div>\`;
      }
      if (tab === "rules") {
        target.innerHTML = \`<div class="grid layout">
          <form class="panel" onsubmit="addBrandRule(event)">
            <h3>Add brand rule</h3>
            <label>Rule group<select name="ruleGroup"><option>global_brand</option><option>wilma</option><option>approved_styles</option><option>banned_styles</option><option>compliance</option><option>logo_usage</option></select></label>
            <label>Name<input name="name" required placeholder="Wilma must-keep traits"></label>
            <label>Rule text<textarea name="ruleText" required placeholder="Must keep orange irises, oversized headset, navy/orange outfit system."></textarea></label>
            <button class="primary">Save rule</button>
          </form>
          <div class="grid">\${(state.brandRules || []).map(rule => \`<article class="card"><span class="badge info">\${esc(rule.ruleGroup)}</span><span class="badge \${rule.active ? "good" : "warn"}">\${rule.active ? "active" : "inactive"}</span><h3>\${esc(rule.name)}</h3><p class="muted">\${esc(JSON.stringify(rule.ruleJson))}</p></article>\`).join("")}</div>
        </div>\`;
      }
      if (tab === "defaults") {
        const preset = state.runtime?.visualStylePreset || {};
        const cards = (state.generationProfiles || []).map(profile => {
          return [
            '<article class="card">',
            '<span class="badge info">' + esc(profile.defaultAspectRatio) + '</span>',
            '<span class="badge ' + (profile.usesWilma ? 'warn' : 'good') + '">Wilma: ' + (profile.usesWilma ? 'yes' : 'no') + '</span>',
            '<span class="badge">Logo: ' + (profile.usesLogo ? 'yes' : 'no') + '</span>',
            '<h3>' + esc(profile.visualBucket) + '</h3>',
            '<p class="muted">' + esc(profile.promptTemplate) + '<br><strong>Negative:</strong> ' + esc(profile.negativeRules) + '</p>',
            '</article>'
          ].join("");
        }).join("");
        target.innerHTML = '<article class="panel"><span class="badge good">Default style</span><h3>' + esc(preset.displayName || 'Techno Afro-Futurist Concept') + '</h3><p class="muted">visualStyleId: ' + esc(preset.visualStyleId || 'techno_afrofuturist_concept') + '<br>Default for LegalEase image generation. Variants are auto-selected: LegalEase Institutional, Wilma Guide, Human Stakes, and Process Map.</p></article><div class="grid three" style="margin-top:14px">' + cards + '</div>';
      }
      if (tab === "advanced") {
        target.innerHTML = \`<details class="panel"><summary><strong>Admin-only prompt/debug controls</strong></summary><p class="muted">Hidden by default. Everyday users should not edit prompts.</p><pre style="white-space:pre-wrap;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto">\${esc(JSON.stringify({ visualStylePreset: state.runtime?.visualStylePreset, profiles: state.generationProfiles, rules: state.brandRules, bundles: state.assetBundles, latestImagePrompt: (state.postImages || [])[0]?.creativeDirection?.prompt, latestNegativePrompt: (state.postImages || [])[0]?.creativeDirection?.negativePrompt, latestVariant: (state.postImages || [])[0]?.creativeDirection?.imageVariantLabel, latestVariantReason: (state.postImages || [])[0]?.creativeDirection?.imageVariantReason, latestStyleGate: (state.postImages || [])[0]?.creativeDirection?.styleGate }, null, 2))}</pre></details>\`;
      }
    }

    function calendarHtml() {
      const today = new Date();
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() + index);
        const key = date.toISOString().slice(0, 10);
        const posts = state.posts.filter(post => (post.scheduledFor || "").slice(0, 10) === key);
        return \`<div class="panel day"><div class="day-title">\${date.toLocaleDateString("en-US", { month:"short", day:"numeric" })}</div>\${posts.map(post => \`<div class="mini"><span class="badge info">\${platformLabels[post.platform]}</span><br><strong>\${esc(post.title)}</strong><br><span class="muted">\${statusLabels[post.status]}</span></div>\`).join("")}</div>\`;
      }).join("");
    }

    function publishingQueueHtml() {
      const posts = state.posts
        .filter(post => ["scheduled", "publishing", "posted", "manually_posted", "failed"].includes(post.status) || post.publishingStatus)
        .slice()
        .sort((a, b) => String(a.scheduledFor || "").localeCompare(String(b.scheduledFor || "")));
      if (!posts.length) return '<div class="panel muted">No scheduled or publishing posts yet.</div>';
      return posts.map(post => \`<article class="card">
        <div class="toprow">
          <div>
            <span class="badge info">\${platformLabels[post.platform]}</span>
            <span class="badge">\${statusLabels[post.status] || post.status}</span>
            <span class="badge \${publishTone(post.publishingStatus)}">\${publishLabel(post.publishingStatus)}</span>
            <h3>\${esc(post.title)}</h3>
          </div>
          <button onclick="checkPublishing('\${post.id}')">Check</button>
        </div>
        <p class="muted">Scheduled: \${esc(post.scheduledFor || "not scheduled")} · Last check: \${esc(post.lastPublishAttemptAt || "never")}</p>
        <p class="muted">\${esc(post.publishErrorSummary || post.publishedUrl || "No publishing issues recorded.")}</p>
      </article>\`).join("");
    }

    function postedPosts() {
      return state.posts
        .filter(post => post.status === "manually_posted" || post.status === "posted" || post.manuallyPostedAt || post.postedAt)
        .slice()
        .sort((a, b) => String(b.manuallyPostedAt || b.postedAt || b.publishedAt || "").localeCompare(String(a.manuallyPostedAt || a.postedAt || a.publishedAt || "")));
    }

    function topByMetric(posts, getKey, getValue) {
      const totals = {};
      for (const post of posts) {
        const key = getKey(post) || "Unassigned";
        totals[key] = (totals[key] || 0) + getValue(post);
      }
      return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || "Needs data";
    }

    function postedSummaryHtml() {
      const posts = postedPosts();
      const totals = posts.reduce((memo, post) => {
        const perf = performanceTotals(post.performance || {});
        memo.impressions += perf.impressions;
        memo.engagement += performanceEngagement(post.performance || {});
        memo.repurpose += performanceLabelFor(post.performance || {}) === "Repurpose Candidate" ? 1 : 0;
        return memo;
      }, { impressions:0, engagement:0, repurpose:0 });
      const needsMetrics = posts.filter(postedNeedsMetrics).length;
      const avgRate = totals.impressions ? ((totals.engagement / totals.impressions) * 100).toFixed(1) + "%" : "0.0%";
      const topBucket = topByMetric(posts, post => post.finalExportKit?.contentBucket || post.wilmaVisualBucket || post.contentBucket, post => performanceEngagement(post.performance || {}));
      const topPlatform = topByMetric(posts, post => post.finalExportKit?.platform || post.platform, post => performanceEngagement(post.performance || {}));
      return \`<div class="grid posted-summary">
        <div class="metric"><div class="kpi-label">Total posted</div><div class="kpi-value">\${posts.length}</div><div class="kpi-detail">Manual archive</div></div>
        <div class="metric"><div class="kpi-label">Impressions</div><div class="kpi-value">\${totals.impressions}</div><div class="kpi-detail">Logged manually</div></div>
        <div class="metric"><div class="kpi-label">Engagement</div><div class="kpi-value">\${totals.engagement}</div><div class="kpi-detail">Likes/comments/shares/saves/reposts/clicks</div></div>
        <div class="metric"><div class="kpi-label">Avg rate</div><div class="kpi-value">\${avgRate}</div><div class="kpi-detail">Engagement / impressions</div></div>
        <div class="metric"><div class="kpi-label">Top bucket</div><div class="kpi-value" style="font-size:18px">\${esc(topBucket)}</div><div class="kpi-detail">By engagement</div></div>
        <div class="metric"><div class="kpi-label">Top platform</div><div class="kpi-value" style="font-size:18px">\${esc(platformLabels[topPlatform] || topPlatform)}</div><div class="kpi-detail">By engagement</div></div>
        <div class="metric"><div class="kpi-label">Repurpose</div><div class="kpi-value">\${totals.repurpose}</div><div class="kpi-detail">Candidate posts</div></div>
        <div class="metric"><div class="kpi-label">Needs metrics</div><div class="kpi-value">\${needsMetrics}</div><div class="kpi-detail">Posted items missing impressions</div></div>
      </div>\`;
    }

    function repurposeHistoryHtml(post) {
      const history = post.repurposeHistory || [];
      return \`<div class="repurpose-history">
        <p class="muted" style="margin:0"><strong>Repurpose history:</strong> \${history.length} draft\${history.length === 1 ? "" : "s"} created.</p>
        \${history.length ? \`<ul class="compact-list">\${history.map(item => \`<li><code>\${esc(item.draftId)}</code> · \${esc(item.formatLabel || item.formatId || "template")} · \${esc(item.createdAt || "")}</li>\`).join("")}</ul>\` : '<p class="muted" style="margin:6px 0 0">No repurpose drafts created yet.</p>'}
      </div>\`;
    }

    function repurposePanelHtml(post, kit, perf, label) {
      if (label !== "Repurpose Candidate") return "";
      const engagement = performanceEngagement(post.performance || {});
      const rate = perf.impressions ? ((engagement / perf.impressions) * 100).toFixed(1) + "%" : "needs data";
      return \`<details class="repurpose-panel">
        <summary><strong>Repurpose</strong></summary>
        <p class="muted" style="margin:10px 0 0"><strong>Performance:</strong> \${esc(label)} · \${perf.impressions} impressions · \${esc(rate)} engagement<br><strong>Original topic:</strong> \${esc(post.hook || post.title)}</p>
        <label>Repurpose format<select id="repurpose-format-\${post.id}">
          \${repurposeFormats.map(format => \`<option value="\${format.id}">\${esc(format.label)}</option>\`).join("")}
        </select></label>
        <button onclick="createRepurposeDraft('\${post.id}')">Create Repurpose Draft</button>
        \${repurposeHistoryHtml(post)}
      </details>\`;
    }

    function postedArchiveHtml() {
      const posts = postedPosts();
      if (!posts.length) return '<div class="panel muted"><h2>No posted items yet.</h2><p>When a post is marked manually posted, it will show here for metrics and repurposing.</p></div>';
      return posts.map(post => {
        const image = imageForPost(post.id);
        const workflow = wilmaWorkflowForPost(post, image);
        const kit = finalExportKitForPost(post, image, workflow);
        const perf = performanceTotals(post.performance || {});
        const label = performanceLabelFor(post.performance || {});
        const repurpose = label === "Repurpose Candidate";
        return \`<article class="card posted-card \${repurpose ? "repurpose-marker" : ""}">
          <div class="toprow">
            <div>
              <span class="badge \${performanceTone(label)}">\${esc(label)}</span>
              \${label === "Needs Data" ? '<span class="badge warn">Needs Metrics</span>' : ""}
              \${repurpose ? '<span class="badge good">Repurpose Candidate</span>' : ""}
              <span class="badge info">\${esc(platformLabels[kit.platform] || platformLabels[post.platform] || post.platform)}</span>
              <h3>\${esc(post.title || post.hook || "Posted item")}</h3>
            </div>
            <span class="muted">\${esc(post.manuallyPostedAt || post.postedAt || post.publishedAt || "posted date missing")}</span>
          </div>
          <p class="simple-meta"><strong>Metrics:</strong> \${perf.impressions} impressions · \${performanceEngagement(post.performance || {})} engagements · \${perf.leads} leads</p>
          <div class="archive-grid">
            <div class="archive-meta">
              <details class="image-detail-toggle">
                <summary>Post details</summary>
                <p class="muted"><strong>Topic:</strong> \${esc(post.hook || post.title)}<br><strong>Bucket:</strong> \${esc(kit.contentBucket || post.contentBucket || "n/a")}<br><strong>Overlay:</strong> \${esc(kit.overlayText || "none")}<br><strong>Export:</strong> <code>\${esc(kit.exportFilename || "not generated")}</code><br><strong>Final PNG:</strong> \${finalPngReady(post, image) ? "ready" : "not ready"} · <strong>Kit:</strong> \${post.manualPostingKitReady || kit.manualPostingKitReady ? "ready" : "not ready"}</p>
                <p class="post-body"><strong>Caption</strong><br>\${esc(kit.caption || composePreviewText(post))}</p>
                <p class="muted"><strong>Hashtags:</strong> \${esc(kit.hashtags || "none")}<br><strong>Alt text:</strong> \${esc(kit.altText || "missing")}<br><strong>Posting notes:</strong> \${esc(kit.postingNotes || "none")}</p>
              </details>
              \${repurposePanelHtml(post, kit, perf, label)}
            </div>
            <form class="performance-form" onsubmit="updatePerformance(event,'\${post.id}')">
              <div class="performance-metrics">
                \${["impressions","likes","comments","shares","saves","reposts","clicks","leads"].map(key => \`<label>\${key}<input name="\${key}" type="number" min="0" value="\${perf[key] || 0}"></label>\`).join("")}
              </div>
              <label>Notes<textarea name="notes" placeholder="What worked, what comments said, whether to repeat/remix/retire...">\${esc(post.performance?.notes || "")}</textarea></label>
              <div class="toprow">
                <p class="muted" style="margin:0"><strong>Total engagement:</strong> \${performanceEngagement(post.performance || {})} · <strong>Rate:</strong> \${perf.impressions ? ((performanceEngagement(post.performance || {}) / perf.impressions) * 100).toFixed(1) + "%" : "needs data"}</p>
                <button class="primary">Update Performance</button>
              </div>
            </form>
          </div>
        </article>\`;
      }).join("");
    }

    function publishEventsHtml() {
      const events = (state.publishEvents || []).slice(0, 20);
      if (!events.length) return '<div class="panel muted">No publish events yet.</div>';
      return events.map(event => \`<article class="card">
        <span class="badge info">\${esc(event.channel)}</span>
        <span class="badge">\${esc(event.eventType)}</span>
        <h3>\${esc(event.statusBefore || "none")} → \${esc(event.statusAfter || "none")}</h3>
        <p class="muted">\${esc(event.message)}<br>\${esc(event.createdAt || "")} \${event.errorCode ? "· " + esc(event.errorCode) : ""}</p>
      </article>\`).join("");
    }

    function runSystemCheck() {
      systemCheckRanAt = new Date().toLocaleString();
      render();
      toast("System check complete");
    }

    function commandActions() {
      return [
        { label:"Open Overview", detail:"Mission control", run:() => { location.hash = "overview"; } },
        { label:"Open Milestones", detail:"Six-month plan", run:() => { location.hash = "milestones"; } },
        { label:"Open Partners", detail:"Partner CRM", run:() => { location.hash = "partners"; } },
        { label:"Open Campaigns", detail:"Campaign operations", run:() => { location.hash = "campaigns"; } },
        { label:"Open RecordShield Funnel", detail:"Conversion dashboard", run:() => { location.hash = "funnel"; } },
        { label:"Go to Queue", detail:"Production board", run:() => { location.hash = "queue"; } },
        { label:"Show Ready to Publish", detail:"Ready queue filter", run:() => { location.hash = "queue"; setQueueReadinessFilter("ready"); } },
        { label:"Show Blocked Posts", detail:"Blocked queue filter", run:() => { location.hash = "queue"; setQueueReadinessFilter("blocked"); } },
        { label:"Open Assets", detail:"Wilma and brand files", run:() => { location.hash = "assets"; } },
        { label:"Open Pilots", detail:"Proof tracker", run:() => { location.hash = "pilots"; } },
        { label:"Open Compliance", detail:"Review queue", run:() => { location.hash = "compliance"; } },
        { label:"Open Reports", detail:"Export updates", run:() => { location.hash = "reports"; } },
        { label:"Open Data Room", detail:"Investor artifacts", run:() => { location.hash = "dataroom"; } },
        { label:"Open Metrics", detail:"Learning layer", run:() => { location.hash = "metrics"; } },
        { label:"Create Backup", detail:"Save local state and assets", run:() => createBackup() },
        { label:"Run System Check", detail:"Readiness report", run:() => runSystemCheck() },
        { label:"Open Settings", detail:"Environment and channels", run:() => { location.hash = "settings"; } }
      ];
    }

    function openCommandPalette() {
      const root = document.querySelector("#commandPaletteRoot");
      const actions = commandActions();
      root.innerHTML = \`<div class="command-overlay" onclick="closeCommandPalette(event)">
        <div class="command-panel" role="dialog" aria-modal="true" aria-label="Command palette" onclick="event.stopPropagation()">
          <input id="commandSearch" class="command-input" placeholder="Type a command..." oninput="renderCommandActions(this.value)" autofocus>
          <div id="commandList" class="command-list"></div>
        </div>
      </div>\`;
      renderCommandActions("");
      setTimeout(() => document.getElementById("commandSearch")?.focus(), 0);
    }

    function renderCommandActions(query = "") {
      const normalized = String(query || "").toLowerCase();
      const actions = commandActions().filter(action => (action.label + " " + action.detail).toLowerCase().includes(normalized));
      const target = document.querySelector("#commandList");
      if (!target) return;
      target.innerHTML = actions.map((action, index) => \`<button class="command-item" onclick="runCommandAction(\${index}, '\${esc(normalized)}')"><span><strong>\${esc(action.label)}</strong><br><span class="muted">\${esc(action.detail)}</span></span><span class="badge info">Enter</span></button>\`).join("") || '<div class="empty">No commands found.</div>';
    }

    function runCommandAction(index, query = "") {
      const actions = commandActions().filter(action => (action.label + " " + action.detail).toLowerCase().includes(String(query || "").toLowerCase()));
      const action = actions[index];
      document.querySelector("#commandPaletteRoot").innerHTML = "";
      if (action) action.run();
    }

    function closeCommandPalette(event) {
      if (!event || event.target.classList.contains("command-overlay")) document.querySelector("#commandPaletteRoot").innerHTML = "";
    }

    function publishReadiness(post) {
      const image = imageForPost(post.id);
      const channel = (post.targetChannels?.length ? post.targetChannels : [post.platform]).filter(Boolean)[0] || "linkedin";
      const account = channelFor(channel);
      const gate = state.runtime?.livePostingGates?.[channel] || {};
      const publicRequired = ["instagram", "threads"].includes(channel);
      const checks = [
        { label:"Live gate", ok:Boolean(gate.enabled), reason:"Missing live gate" },
        { label:"Token/account", ok:Boolean(account.connected || account.status === "connected"), reason:"Missing token or account ID" },
        { label:"Public URL", ok:!publicRequired || credentialPresent("PUBLIC_APP_BASE_URL"), reason:"Missing public HTTPS URL" },
        { label:"Final PNG", ok:finalPngReady(post, image), reason:"Missing final PNG" },
        { label:"Preview confirmed", ok:Boolean(post.finalPreviewConfirmed || finalPngReady(post, image)), reason:"Preview not confirmed" }
      ];
      const missing = checks.filter(check => !check.ok).map(check => check.reason);
      return { channel, account, gate, image, checks, missing, ready:missing.length === 0 };
    }

    function renderPublishConfirmDialog() {
      const post = state.posts.find(item => item.id === pendingPublishId);
      const root = document.querySelector("#modalRoot");
      if (!post || !root) return;
      const readiness = publishReadiness(post);
      const image = readiness.image;
      const channelLabel = platformLabels[readiness.channel] || readiness.channel;
      root.innerHTML = \`<div class="modal-backdrop" role="presentation">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Confirm live publish">
          <div class="toprow">
            <div><div class="eyebrow">Publish Now</div><h2>This will post live to \${esc(channelLabel)}</h2></div>
            <button onclick="closePublishDialog()">Close</button>
          </div>
          <div class="modal-grid">
            <div class="publish-preview">\${image?.imageUrl ? \`<img src="\${esc(image.finalPngUrl || image.imageUrl)}" alt="Final PNG preview">\` : '<span class="muted">No final PNG preview</span>'}</div>
            <div>
              <p class="muted"><strong>Account:</strong> \${esc(readiness.account.accountName || readiness.account.displayName || "not connected")}<br><strong>Post:</strong> \${esc(post.title)}</p>
              <p class="post-body">\${esc(composePreviewText(post)).slice(0, 700)}</p>
              <div class="grid">\${readiness.checks.map(check => \`<div class="metric-row"><span>\${esc(check.label)}</span><span class="badge \${check.ok ? "good" : "danger"}">\${check.ok ? "Ready" : "Missing"}</span></div>\`).join("")}</div>
              \${readiness.ready ? '<p class="readiness-card danger"><strong>This will post live.</strong> Confirm only when the caption, image, and account are correct.</p>' : \`<p class="readiness-card warn"><strong>Cannot publish yet.</strong><br>\${esc(readiness.missing.join(" · "))}</p>\`}
            </div>
          </div>
          <div class="dialog-actions">
            <button onclick="closePublishDialog()">Cancel</button>
            <button onclick="location.hash='settings'; closePublishDialog()">Fix Setup</button>
            <button class="primary" \${readiness.ready ? "" : "disabled"} onclick="confirmPublishNow('\${esc(post.id)}')">Confirm Publish</button>
          </div>
        </div>
      </div>\`;
    }

    function closePublishDialog() {
      pendingPublishId = "";
      document.querySelector("#modalRoot").innerHTML = "";
    }

    async function bulkMarkReviewed() {
      const targets = Array.from(selectedPosts);
      for (const id of targets) await markCopyReviewed(id);
      selectedPosts = new Set();
      render();
    }

    async function bulkCreateFinalPngs() {
      const targets = Array.from(selectedPosts);
      for (const id of targets) {
        const post = state.posts.find(item => item.id === id);
        const image = imageForPost(id);
        if (post && image?.generationStatus === "generated" && post.overlayConfirmed && !finalPngReady(post, image)) await finalizeImage(id);
      }
      selectedPosts = new Set();
      render();
    }

    async function bulkExportKits() {
      const targets = Array.from(selectedPosts);
      for (const id of targets) {
        const post = state.posts.find(item => item.id === id);
        if (post && finalPngReady(post, imageForPost(id))) await exportPostingPackage(id);
      }
      selectedPosts = new Set();
      render();
    }

    async function bulkMarkManualPosted() {
      const targets = Array.from(selectedPosts);
      for (const id of targets) await markManuallyPosted(id);
      selectedPosts = new Set();
      render();
    }

    async function generate(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const result = await api("/api/generate", { method:"POST", body:JSON.stringify(payload) });
      state = result.state;
      render();
      toast(\`\${result.posts.length} draft\${result.posts.length === 1 ? "" : "s"} saved\`);
    }

    async function runSourceAutomation() {
      const result = await api("/api/sources/run-daily", { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Daily source queue generated");
    }

    async function addSourceItem(event) {
      event.preventDefault();
      const source = Object.fromEntries(new FormData(event.target).entries());
      const result = await api("/api/sources/add", {
        method:"POST",
        body:JSON.stringify(source)
      });
      state = result.state;
      event.target.reset();
      render();
      toast(result.message || "Source saved");
    }

    async function createQueueDraftFromSource(id) {
      const result = await api("/api/sources/create-draft", {
        method:"POST",
        body:JSON.stringify({ sourceId:id })
      });
      state = result.state;
      render();
      toast(result.message || "Queue draft created");
    }

    async function reviewSource(id) {
      const result = await api("/api/sources/review", {
        method:"POST",
        body:JSON.stringify({ sourceId:id })
      });
      state = result.state;
      render();
      toast(result.message || "Source reviewed");
    }

    async function ignoreSource(id) {
      const result = await api("/api/sources/ignore", {
        method:"POST",
        body:JSON.stringify({ sourceId:id })
      });
      state = result.state;
      render();
      toast(result.message || "Source ignored");
    }

    async function restoreSource(id) {
      const result = await api("/api/sources/restore", {
        method:"POST",
        body:JSON.stringify({ sourceId:id })
      });
      state = result.state;
      render();
      toast(result.message || "Source restored");
    }

    async function createTomorrowQueue() {
      const result = await api("/api/queue/create-tomorrow", { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Tomorrow's 3-post queue created");
    }

    async function runLinkedInDryTest() {
      const result = await api("/api/linkedin/dry-test", { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "LinkedIn dry test complete");
    }

    async function setStatus(id, status) {
      const post = state.posts.find(item => item.id === id);
      if (status === "approved" && !post?.copyReviewed) {
        toast("Review copy before approving");
        return;
      }
      const result = await api("/api/posts/update", { method:"POST", body:JSON.stringify({ id, patch:{ status } }) });
      state = result.state;
      render();
      toast(statusLabels[status] || status);
    }

    async function markCopyReviewed(id) {
      const result = await api("/api/posts/update", {
        method:"POST",
        body:JSON.stringify({
          id,
          patch:{
            copyReviewed:true,
            copyReviewedAt:new Date().toISOString()
          }
        })
      });
      state = result.state;
      render();
      toast("Copy reviewed");
    }

    async function confirmOverlay(id) {
      const post = state.posts.find(item => item.id === id) || {};
      const image = imageForPost(id);
      if (!image || image.generationStatus !== "generated") {
        toast("Mark an image generated before confirming overlay");
        return;
      }
      const nextWorkflow = post.wilmaImageWorkflow
        ? {
            ...post.wilmaImageWorkflow,
            state:"Overlay Confirmed",
            exportChecklist:{ ...(post.wilmaImageWorkflow.exportChecklist || {}), overlayConfirmed:true },
            updatedAt:new Date().toISOString()
          }
        : undefined;
      const result = await api("/api/posts/update", {
        method:"POST",
        body:JSON.stringify({
          id,
          patch:{
            overlayConfirmed:true,
            overlayConfirmedAt:new Date().toISOString(),
            imageWorkflowState:"Overlay Confirmed",
            ...(nextWorkflow ? { wilmaImageWorkflow:nextWorkflow } : {}),
            imageFinalized:false,
            finalPreviewConfirmed:false,
            finalPreviewConfirmedAt:""
          }
        })
      });
      state = result.state;
      render();
      toast("Overlay confirmed");
    }

    function selectedWilmaImageSettings(id) {
      return {
        visualBucket: document.getElementById("wilma-bucket-" + id)?.value || "",
        wilmaExpression: document.getElementById("wilma-expression-" + id)?.value || "",
        wilmaPoseReferenceId: document.getElementById("wilma-pose-" + id)?.value || "",
        wilmaAssetId: document.getElementById("wilma-asset-" + id)?.value || "",
        backgroundAssetId: document.getElementById("background-asset-" + id)?.value || "",
        brandMarkAssetId: document.getElementById("brand-mark-asset-" + id)?.value || ""
      };
    }

    async function generateWilmaImagePrompt(id) {
      const result = await api("/api/wilma-image/generate-prompt", {
        method:"POST",
        body:JSON.stringify({ postId:id, ...selectedWilmaImageSettings(id) })
      });
      state = result.state;
      render();
      toast(result.message || "Wilma image prompt ready");
    }

    async function markWilmaImageGenerated(id) {
      const post = state.posts.find(item => item.id === id) || {};
      const workflow = wilmaWorkflowForPost(post, imageForPost(id));
      if (!workflow.imagePrompt) {
        toast("Generate the image prompt first");
        return;
      }
      const result = await api("/api/wilma-image/mark-generated", {
        method:"POST",
        body:JSON.stringify({ postId:id, ...selectedWilmaImageSettings(id) })
      });
      state = result.state;
      render();
      toast(result.message || "Wilma image marked generated");
    }

    async function markWilmaFinalPngReady(id) {
      const post = state.posts.find(item => item.id === id) || {};
      const image = imageForPost(id);
      const workflow = wilmaWorkflowForPost(post, image);
      const readiness = wilmaReadiness(post, image, workflow);
      if (!image || image.generationStatus !== "generated") {
        toast("Mark an image generated first");
        return;
      }
      if (!post.overlayConfirmed) {
        toast("Confirm the overlay first");
        return;
      }
      if (readiness.safety.empty) {
        toast("Add overlay text before final PNG");
        return;
      }
      const result = await api("/api/wilma-image/mark-final-png-ready", {
        method:"POST",
        body:JSON.stringify({ postId:id })
      });
      state = result.state;
      render();
      toast(result.message || "Final PNG ready");
    }

    async function markManualPostingKitReady(id) {
      const post = state.posts.find(item => item.id === id) || {};
      const image = imageForPost(id);
      const workflow = wilmaWorkflowForPost(post, image);
      const kit = finalExportKitForPost(post, image, workflow);
      const result = await api("/api/final-export-kit/mark-ready", {
        method:"POST",
        body:JSON.stringify({ postId:id, finalExportKit:kit })
      });
      state = result.state;
      render();
      toast(result.message || "Manual posting kit ready");
    }

    async function exportPostingPackage(id) {
      const result = await api(\`/api/posts/\${encodeURIComponent(id)}/export-posting-package\`, { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Posting package exported");
    }

    async function markManuallyPosted(id) {
      const result = await api("/api/posts/mark-manually-posted", {
        method:"POST",
        body:JSON.stringify({ postId:id })
      });
      state = result.state;
      render();
      toast(result.message || "Marked manually posted");
    }

    async function previewExportFormat(id, platformFormatId) {
      const post = state.posts.find(item => item.id === id);
      if (!post) return;
      const image = imageForPost(id);
      const workflow = wilmaWorkflowForPost(post, image);
      const kit = finalExportKitForPost({ ...post, finalExportKit:{ ...(post.finalExportKit || {}), platformFormatId } }, image, workflow);
      const result = await api("/api/posts/update", {
        method:"POST",
        body:JSON.stringify({ id, patch:{ finalExportKit:kit } })
      });
      state = result.state;
      render();
      toast("Export format updated");
    }

    async function approveLowRisk() {
      const targets = state.posts.filter(post => post.status === "draft" && post.complianceRisk === "low");
      if (!targets.length) {
        toast("No low-review drafts to approve");
        return;
      }
      for (const post of targets) {
        const result = await api("/api/posts/update", { method:"POST", body:JSON.stringify({ id:post.id, patch:{ status:"approved" } }) });
        state = result.state;
      }
      render();
      toast(\`\${targets.length} draft\${targets.length === 1 ? "" : "s"} approved\`);
    }

    async function scheduleApproved() {
      const targets = state.posts.filter(post => post.status === "approved" && !post.scheduledFor);
      if (!targets.length) {
        toast("No approved unscheduled posts");
        return;
      }
      let index = 1;
      for (const post of targets) {
        const result = await api("/api/posts/schedule", {
          method:"POST",
          body:JSON.stringify({ id:post.id, scheduledFor:tomorrowMorning(index), targetChannels:[post.platform] })
        });
        state = result.state;
        index += 1;
      }
      render();
      toast(\`\${targets.length} post\${targets.length === 1 ? "" : "s"} scheduled\`);
    }

    function nextReview(delta) {
      const posts = todayReviewPosts();
      if (!posts.length) {
        reviewIndex = 0;
        render();
        return;
      }
      reviewIndex = (reviewIndex + delta + posts.length) % posts.length;
      render();
    }

    async function quickSchedule(id) {
      const post = state.posts.find(item => item.id === id);
      if (!post) return;
      const image = imageForPost(id);
      if (!image || image.generationStatus !== "generated") {
        toast("Generate an image first");
        return;
      }
      if (!post.imageFinalized) {
        toast("Use the image first");
        return;
      }
      if (!post.finalPreviewConfirmed) {
        toast("Confirm the final preview first");
        return;
      }
      const result = await api("/api/posts/schedule", {
        method:"POST",
        body:JSON.stringify({ id, scheduledFor:tomorrowMorning(1), targetChannels:[post.platform] })
      });
      state = result.state;
      render();
      toast(result.message || "Post scheduled");
    }

    async function regenerateImage(id, overrides = {}) {
      generatingImages.add(id);
      render();
      toast("Generating image...");
      try {
        const result = await api("/api/images/generate", { method:"POST", body:JSON.stringify({ postId:id, ...overrides }) });
        if (result.state) state = result.state;
        if (result.image) {
          state.postImages = [
            result.image,
            ...(state.postImages || []).filter(image => image.id !== result.image.id && image.postId !== id)
          ];
        } else {
          await load();
        }
        const image = result.image || imageForPost(id);
        toast(image?.rateLimited ? (image.generationError || "Image API cooling down. Try again shortly.") : "Image regenerated");
      } catch (error) {
        toast("Image generation failed. See image card.");
        console.error(error);
      } finally {
        generatingImages.delete(id);
        render();
      }
    }

    async function uploadImage(id, input) {
      const file = input.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append("postId", id);
      form.append("image", file);
      const response = await fetch("/api/images/upload", { method:"POST", body:form });
      input.value = "";
      if (!response.ok) {
        toast(await response.text());
        return;
      }
      const result = await response.json();
      state = result.state;
      render();
      toast(result.message || "Image uploaded");
    }

    async function setWatermark(id, position) {
      const result = await api("/api/images/watermark", {
        method:"POST",
        body:JSON.stringify({ postId:id, position })
      });
      state = result.state;
      render();
      toast(result.message || "Watermark updated");
    }

    async function finalizeImage(id) {
      const result = await api(\`/api/posts/\${id}/finalize-image\`, { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Image finalized");
    }

    async function confirmPreview(id) {
      const result = await api(\`/api/posts/\${id}/confirm-preview\`, { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Final preview confirmed");
    }

    async function swapVisualBucket(id, visualBucket) {
      const update = await api("/api/posts/update", { method:"POST", body:JSON.stringify({ id, patch:{ visualBucket } }) });
      state = update.state;
      await regenerateImage(id, { visualBucket });
    }

    async function removeWilma(id) {
      await regenerateImage(id, { usesWilma:false, visualBucket:"Quote card" });
    }

	    async function schedulePost(event, id) {
	      event.preventDefault();
	      const form = new FormData(event.target);
	      const scheduledFor = form.get("scheduledFor");
	      const select = event.target.querySelector('[name="targetChannels"]');
	      const targetChannels = select ? Array.from(select.selectedOptions).map(option => option.value) : form.getAll("targetChannels");
	      const result = await api("/api/posts/schedule", { method:"POST", body:JSON.stringify({ id, scheduledFor, targetChannels }) });
	      state = result.state;
      render();
      toast(result.message || "Post scheduled");
    }

    async function checkPublishing(id) {
      const result = await api(\`/api/posts/\${id}/publishing-check\`, { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Publishing checked");
    }

    async function checkPublishingQueue() {
      const result = await api("/api/publishing/check", { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Publishing queue checked");
    }

    async function runPublishingWorker() {
      const result = await api("/api/publishing/run", { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Publishing worker ran");
    }

    async function publishNow(id) {
      pendingPublishId = id;
      renderPublishConfirmDialog();
    }

    async function confirmPublishNow(id) {
      try {
        const result = await api(\`/api/posts/\${encodeURIComponent(id)}/publish-now\`, { method:"POST" });
        state = result.state;
        closePublishDialog();
        render();
        toast(result.message || "Published");
      } catch (error) {
        const raw = error?.message || String(error);
        toast(raw.replace(/^\\{\\"error\\":\\"?|\\{\\\"error\\\":\\\"?|\\\"\\}$/g, "").slice(0, 180));
      }
    }

    async function retryPost(id) {
      const result = await api(\`/api/posts/\${id}/retry\`, { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Retry ready");
    }

    async function unschedulePost(id) {
      const result = await api("/api/posts/update", { method:"POST", body:JSON.stringify({ id, patch:{ status:"approved", scheduledFor:"", publishingStatus:"", publishErrorSummary:"" } }) });
      state = result.state;
      render();
      toast("Returned to approved");
    }

    async function editPost(event, id) {
      event.preventDefault();
      const patch = Object.fromEntries(new FormData(event.target).entries());
      patch.copyReviewed = false;
      patch.copyReviewedAt = "";
      patch.finalPreviewConfirmed = false;
      patch.finalPreviewConfirmedAt = "";
      const result = await api("/api/posts/update", { method:"POST", body:JSON.stringify({ id, patch }) });
      state = result.state;
      render();
      toast("Post updated");
    }

    async function editOverlayText(event, id) {
      event.preventDefault();
      const patch = Object.fromEntries(new FormData(event.target).entries());
      patch.overlayConfirmed = false;
      patch.overlayConfirmedAt = "";
      patch.imageFinalized = false;
      patch.finalPreviewConfirmed = false;
      patch.finalPreviewConfirmedAt = "";
      const result = await api("/api/posts/update", { method:"POST", body:JSON.stringify({ id, patch }) });
      state = result.state;
      render();
      toast("Image text updated");
    }

    async function resetOverlayText(id) {
      const result = await api("/api/posts/update", {
        method:"POST",
        body:JSON.stringify({
          id,
          patch:{
            overlayMode:"text",
            overlayKicker:"",
            overlayHeadline:"",
            overlaySupport:"",
            overlayConfirmed:false,
            overlayConfirmedAt:"",
            imageFinalized:false,
            finalPreviewConfirmed:false,
            finalPreviewConfirmedAt:""
          }
        })
      });
      state = result.state;
      render();
      toast("Image overlay reset");
    }

    async function disableOverlayText(id) {
      const result = await api("/api/posts/update", {
        method:"POST",
        body:JSON.stringify({
          id,
          patch:{
            overlayMode:"none",
            overlayConfirmed:false,
            overlayConfirmedAt:"",
            imageFinalized:false,
            finalPreviewConfirmed:false,
            finalPreviewConfirmedAt:""
          }
        })
      });
      state = result.state;
      render();
      toast("Text overlay disabled");
    }

    async function addLibrary(event) {
      event.preventDefault();
      const item = Object.fromEntries(new FormData(event.target).entries());
      const result = await api("/api/library/add", { method:"POST", body:JSON.stringify(item) });
      state = result.state;
      render();
      toast("Library item saved");
    }

    async function addBrandAsset(event) {
      event.preventDefault();
      const input = Object.fromEntries(new FormData(event.target).entries());
      const payload = {
        ...input,
        slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        tags: String(input.tags || "").split(",").map(tag => tag.trim()).filter(Boolean),
        approved: true,
        isDefault: false,
        version: 1
      };
      const result = await api("/api/brand/assets/add", { method:"POST", body:JSON.stringify(payload) });
      state = result.state;
      render();
      toast("Brand asset saved");
    }

    async function registerLocalAsset(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const result = await api("/api/assets/register", { method:"POST", body:JSON.stringify(payload) });
      state = result.state;
      render();
      toast(result.message || "Asset registered");
    }

    async function createBackup() {
      const result = await api("/api/backups/create", { method:"POST", body:JSON.stringify({}) });
      state.settings = {
        ...(state.settings || {}),
        latestBackup: result.backup,
        backupHistory: [result.backup, ...((state.settings?.backupHistory || []).filter(item => item.backupId !== result.backup?.backupId))].filter(Boolean).slice(0, 10)
      };
      backups = (await api("/api/backups")).backups || [];
      render();
      toast(result.message || "Backup created");
    }

    async function restoreBackup() {
      const backupPath = document.getElementById("restore-backup-path")?.value || "";
      if (!backupPath) {
        toast("Enter a backup path first");
        return;
      }
      const ok = window.confirm("Restore replaces current local data and generated assets. A safety backup will be created first. Continue?");
      if (!ok) return;
      const result = await api("/api/backups/restore", { method:"POST", body:JSON.stringify({ backupPath }) });
      state = await api("/api/state");
      backups = (await api("/api/backups")).backups || [];
      render();
      toast(result.message || "Backup restored");
    }

    async function addBrandRule(event) {
      event.preventDefault();
      const input = Object.fromEntries(new FormData(event.target).entries());
      const payload = {
        ruleGroup: input.ruleGroup,
        name: input.name,
        ruleJson: { summary: input.ruleText },
        active: true,
        version: 1
      };
      const result = await api("/api/brand/rules/add", { method:"POST", body:JSON.stringify(payload) });
      state = result.state;
      render();
      toast("Brand rule saved");
    }

    async function connectChannel(platform) {
      const account = (state.socialAccounts || []).find(item => item.platform === platform);
      if (!account?.oauthConfigured) {
        toast("Setup required before connecting");
        return;
      }
      window.location.href = \`/api/oauth/\${platform}/start\`;
    }

    async function testChannel(platform) {
      const account = (state.socialAccounts || []).find(item => item.platform === platform);
      if (!account?.connected) {
        toast("No connected account to test");
        return;
      }
      const result = await api(\`/api/channels/\${platform}/test\`, { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Channel tested");
    }

    async function disconnectChannel(platform) {
      const account = (state.socialAccounts || []).find(item => item.platform === platform);
      if (!account?.connected) {
        toast("No connected account");
        return;
      }
      const result = await api(\`/api/channels/\${platform}/disconnect\`, { method:"POST" });
      state = result.state;
      render();
      toast(result.message || "Channel disconnected");
    }

    function copyPost(id) {
      const post = state.posts.find(item => item.id === id);
      const text = composePreviewText(post);
      navigator.clipboard.writeText(text);
      toast("Post copied");
    }

    function copyChannelText(id, channel) {
      const post = state.posts.find(item => item.id === id);
      const text = post?.channelAdaptations?.[channel]?.text || composePreviewText(post);
      navigator.clipboard.writeText(text);
      toast((platformLabels[channel] || "Channel") + " text copied");
    }

    function copyExportField(id, field) {
      const post = state.posts.find(item => item.id === id);
      if (!post) return;
      const image = imageForPost(id);
      const kit = finalExportKitForPost(post, image, wilmaWorkflowForPost(post, image));
      const values = {
        caption: kit.caption,
        hashtags: kit.hashtags,
        altText: kit.altText,
        postingNotes: kit.postingNotes,
        filename: kit.exportFilename
      };
      navigator.clipboard.writeText(values[field] || "");
      toast((field === "altText" ? "Alt text" : field === "postingNotes" ? "Posting notes" : field) + " copied");
    }

    async function saveOperatorNotes(event, id) {
      event.preventDefault();
      const patch = Object.fromEntries(new FormData(event.target).entries());
      const result = await api("/api/posts/update", { method:"POST", body:JSON.stringify({ id, patch }) });
      state = result.state;
      render();
      toast("Operator notes saved");
    }

    async function updatePerformance(event, id) {
      event.preventDefault();
      const performance = Object.fromEntries(new FormData(event.target).entries());
      const result = await api("/api/performance/update", {
        method:"POST",
        body:JSON.stringify({ postId:id, performance })
      });
      state = result.state;
      render();
      toast(result.message || "Performance updated");
    }

    async function createRepurposeDraft(id) {
      const formatId = document.getElementById("repurpose-format-" + id)?.value || "shorter_punchier";
      const result = await api("/api/repurpose/create-draft", {
        method:"POST",
        body:JSON.stringify({ postId:id, formatId })
      });
      state = result.state;
      queueOriginFilter = "repurposed";
      render();
      toast(result.message || "Repurpose draft created");
    }

    function exportPlan() {
      const rows = state.posts.map(post => [post.scheduledFor || "", platformLabels[post.platform], statusLabels[post.status], post.title, post.hook, post.body, post.cta].map(value => '"' + String(value).replaceAll('"', '""') + '"').join(","));
      const csv = ["scheduled_for,platform,status,title,hook,body,cta", ...rows].join("\\n");
      const blob = new Blob([csv], { type:"text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "legalease-content-plan.csv";
      a.click();
      URL.revokeObjectURL(url);
    }

    window.addEventListener("hashchange", () => render());
    window.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
      if (event.key === "Escape") {
        document.querySelector("#commandPaletteRoot").innerHTML = "";
        if (pendingPublishId) closePublishDialog();
      }
    });
    load();
  </script>
</body>
</html>`;
}

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

	  if (url.pathname.startsWith("/assets/") && request.method === "GET") {
	    await serveAsset(url.pathname, response);
	    return;
	  }

	  if (url.pathname.startsWith("/data/exports/final-pngs/") && request.method === "GET") {
	    await serveAsset(url.pathname, response);
	    return;
	  }

	  if (url.pathname.startsWith("/data/exports/posting-kits/") && request.method === "GET") {
	    await serveAsset(url.pathname, response);
	    return;
	  }

	  if (url.pathname.startsWith("/data/assets/") && request.method === "GET") {
	    await serveAsset(url.pathname, response);
	    return;
	  }

	  if (url.pathname.startsWith("/data/backups/") && request.method === "GET") {
	    await serveAsset(url.pathname, response);
	    return;
	  }

	  const finalPngDownload = url.pathname.match(/^\/api\/posts\/([^/]+)\/final-png$/);
	  if (finalPngDownload && request.method === "GET") {
	    await sendFinalPngDownload(decodeURIComponent(finalPngDownload[1]), response);
	    return;
	  }

	  if (url.pathname === "/api/state" && request.method === "GET") {
    sendJson(response, withPublicChannelSetup(await store.readState()));
    return;
  }

  if (url.pathname === "/api/growth/upsert" && request.method === "POST") {
    try {
      const { collection, item } = await readJson(request);
      const result = await upsertGrowthItem(collection, item || {});
      sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not save growth item." }, 400);
    }
    return;
  }

  if (url.pathname === "/api/growth/campaign-kit" && request.method === "POST") {
    try {
      const { campaignId } = await readJson(request);
      const result = await generateCampaignKit(campaignId || "");
      sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not generate campaign kit." }, 400);
    }
    return;
  }

  if (url.pathname === "/api/growth/report" && request.method === "POST") {
    try {
      const { reportType } = await readJson(request);
      const result = await exportGrowthReport(reportType || "weekly_internal");
      sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not export report." }, 400);
    }
    return;
  }

  if (url.pathname === "/api/channels" && request.method === "GET") {
    const channels = safeChannelsResponse(await store.readState()).map((channel) => ({
      channel: channel.channel,
      display_name: channel.displayName,
      status: channel.status,
      connected: channel.connected,
      configured: channel.configured,
      missing_env_vars: channel.missingEnvVars,
      account_name: channel.accountName,
	      last_tested_at: channel.lastTestedAt,
	      last_error_summary: channel.lastErrorSummary,
	      has_stored_token: channel.hasStoredToken,
	      live_posting_enabled: channel.livePostingEnabled,
	      live_gate_env_vars: channel.liveGateEnvVars
	    }));
    sendJson(response, { channels });
    return;
  }

  if (url.pathname === "/api/health/supabase" && request.method === "GET") {
    sendJson(response, await getSupabaseHealth());
    return;
  }

  if (url.pathname === "/api/backups" && request.method === "GET") {
    sendJson(response, { backups: await listLocalBackups() });
    return;
  }

  if (url.pathname === "/api/backups/create" && request.method === "POST") {
    try {
      const result = await createLocalBackup();
      sendJson(response, { backup: result.backup, manifest: result.manifest, message: result.message });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not create backup." }, 400);
    }
    return;
  }

  if (url.pathname === "/api/backups/restore" && request.method === "POST") {
    try {
      const { backupPath } = await readJson(request);
      const result = await restoreLocalBackup(backupPath || "");
      sendJson(response, {
        restoredFrom: result.restoredFrom,
        safetyBackup: result.safetyBackup,
        message: result.message
      });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not restore backup." }, 400);
    }
    return;
  }

  if ((url.pathname === "/api/generate" || url.pathname === "/api/sources/generate") && request.method === "POST") {
    const input = await readJson(request);
    const targets = input.platform === "all" ? platforms : [input.platform || "linkedin"];
    const posts = targets.map((platform) => generateDraft(input, platform));
    await store.generatePosts(posts);
    let state = await store.readState();
    for (const post of posts) {
      const result = await generateImageForPost(post.id);
      state = result.state;
    }
    sendJson(response, { posts, state: withPublicChannelSetup(state) });
    return;
  }

  if (url.pathname === "/api/sources/run-daily" && request.method === "POST") {
    const result = await runSourceAutomation();
    sendJson(response, {
      posts: result.posts,
      state: withPublicChannelSetup(result.state),
      message: result.message
    });
    return;
  }

  if (url.pathname === "/api/sources/add" && request.method === "POST") {
    const input = await readJson(request);
    const result = await addSourceItem(input);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/sources/create-draft" && request.method === "POST") {
    const { sourceId } = await readJson(request);
    const result = await createQueueDraftFromSource(sourceId);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/sources/review" && request.method === "POST") {
    const { sourceId } = await readJson(request);
    const result = await reviewSourceItem(sourceId);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/sources/ignore" && request.method === "POST") {
    const { sourceId } = await readJson(request);
    const result = await ignoreSourceItem(sourceId);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/sources/restore" && request.method === "POST") {
    const { sourceId } = await readJson(request);
    const result = await restoreSourceItem(sourceId);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/queue/create-tomorrow" && request.method === "POST") {
    const result = await createTomorrowThreePostQueue();
    sendJson(response, {
      posts: result.posts,
      state: withPublicChannelSetup(result.state),
      message: result.message
    });
    return;
  }

  if (url.pathname === "/api/linkedin/dry-test" && request.method === "POST") {
    const result = await runLinkedInDryTest();
    sendJson(response, {
      state: withPublicChannelSetup(result.state),
      dryRun: result.dryRun,
      checklist: result.checklist,
      message: result.message
    });
    return;
  }

  if (url.pathname === "/api/images/generate" && request.method === "POST") {
    const { postId, ...overrides } = await readJson(request);
    const result = await generateImageForPost(postId, overrides);
    sendJson(response, { image: result.image, message: result.message || "Image generated." });
    return;
  }

  if (url.pathname === "/api/images/upload" && request.method === "POST") {
    const result = await saveUploadedPostImage(request);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/images/watermark" && request.method === "POST") {
    const { postId, position } = await readJson(request);
    const result = await setImageWatermark(postId, position || "none");
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/wilma-image/generate-prompt" && request.method === "POST") {
    const { postId, ...overrides } = await readJson(request);
    const result = await generateWilmaImagePrompt(postId, overrides);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/wilma-image/mark-generated" && request.method === "POST") {
    const { postId, ...overrides } = await readJson(request);
    const result = await markWilmaImageGenerated(postId, overrides);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/wilma-image/mark-final-png-ready" && request.method === "POST") {
    const { postId } = await readJson(request);
    const result = await markWilmaFinalPngReady(postId);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/final-export-kit/mark-ready" && request.method === "POST") {
    const { postId, finalExportKit } = await readJson(request);
    const result = await markManualPostingKitReady(postId, finalExportKit || {});
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/posts/mark-manually-posted" && request.method === "POST") {
    const { postId } = await readJson(request);
    const result = await markPostManuallyPosted(postId);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/performance/update" && request.method === "POST") {
    const { postId, performance } = await readJson(request);
    const result = await updateManualPerformance(postId, performance || {});
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  if (url.pathname === "/api/repurpose/create-draft" && request.method === "POST") {
    const { postId, formatId } = await readJson(request);
    const result = await createRepurposeDraft(postId, formatId);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  const finalizeImage = url.pathname.match(/^\/api\/posts\/([^/]+)\/finalize-image$/);
  if (finalizeImage && request.method === "POST") {
    const result = await finalizePostImage(finalizeImage[1]);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  const exportPackage = url.pathname.match(/^\/api\/posts\/([^/]+)\/export-posting-package$/);
  if (exportPackage && request.method === "POST") {
    try {
      const result = await exportPostingPackage(decodeURIComponent(exportPackage[1]));
      sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not export posting package." }, 400);
    }
    return;
  }

  const downloadPackageZip = url.pathname.match(/^\/api\/posts\/([^/]+)\/posting-package-zip$/);
  if (downloadPackageZip && request.method === "GET") {
    try {
      const result = await ensurePostingPackageZip(decodeURIComponent(downloadPackageZip[1]));
      const body = await readFile(result.packageZip.zipPath);
      response.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${result.packageZip.zipFilename}"`,
        "content-length": body.length
      });
      response.end(body);
    } catch (error) {
      sendJson(response, { error: error.message || "Could not download posting package zip." }, 400);
    }
    return;
  }

  const confirmPreview = url.pathname.match(/^\/api\/posts\/([^/]+)\/confirm-preview$/);
  if (confirmPreview && request.method === "POST") {
    const result = await confirmFinalPreview(confirmPreview[1]);
    sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    return;
  }

  const publishingCheck = url.pathname.match(/^\/api\/posts\/([^/]+)\/publishing-check$/);
  if (publishingCheck && request.method === "POST") {
    const result = await updatePublishingCheck(publishingCheck[1]);
    sendJson(response, {
      state: withPublicChannelSetup(result.state),
      readiness: result.readiness,
      message: result.readiness.message
    });
    return;
  }

  const publishNowMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/publish-now$/);
  if (publishNowMatch && request.method === "POST") {
    try {
      const result = await publishPostNow(decodeURIComponent(publishNowMatch[1]));
      sendJson(response, {
        state: withPublicChannelSetup(result.state),
        result: result.result,
        message: result.message
      });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not publish post." }, 400);
    }
    return;
  }

  if (url.pathname === "/api/publishing/check" && request.method === "POST") {
    const currentState = await store.readState();
    const targets = currentState.posts.filter((post) => ["approved", "scheduled"].includes(post.status));
    let state = currentState;
    const results = [];
    for (const post of targets) {
      const result = await updatePublishingCheck(post.id);
      state = result.state;
      results.push({ postId: post.id, title: post.title, platform: post.platform, ...result.readiness });
    }
    sendJson(response, {
      state: withPublicChannelSetup(state),
      results,
      message: `${results.length} publishing check${results.length === 1 ? "" : "s"} completed.`
    });
    return;
  }

  if (url.pathname === "/api/publishing/run" && request.method === "POST") {
    const result = await runPublishingWorker();
    sendJson(response, {
      state: withPublicChannelSetup(result.state),
      results: result.results,
      message: result.message
    });
    return;
  }

  if (url.pathname === "/api/posts/schedule" && request.method === "POST") {
    const { id, scheduledFor, targetChannels, timezone } = await readJson(request);
    const result = await schedulePostForPublishing(id, { scheduledFor, targetChannels, timezone });
    sendJson(response, {
      state: withPublicChannelSetup(result.state),
      readiness: result.readiness,
      message: result.message
    });
    return;
  }

  const retryPost = url.pathname.match(/^\/api\/posts\/([^/]+)\/retry$/);
  if (retryPost && request.method === "POST") {
    const state = await store.readState();
    const post = state.posts.find((item) => item.id === retryPost[1]);
    if (!post) {
      sendJson(response, { error: "Post not found." }, 404);
      return;
    }
    let nextState = await store.updatePost(post.id, {
      status: "retry_ready",
      publishingStatus: "pending",
      publishErrorSummary: "",
      lastPublishAttemptAt: ""
    });
    nextState = await recordPublishEvent({
      post,
      channel: (post.targetChannels || [post.platform]).join(","),
      eventType: "retry_ready",
      statusBefore: post.status,
      statusAfter: "retry_ready",
      message: "Post marked retry ready."
    });
    sendJson(response, { state: withPublicChannelSetup(nextState), message: "Post marked retry ready." });
    return;
  }

  if (url.pathname === "/api/posts/update" && request.method === "POST") {
    const { id, patch } = await readJson(request);
    if (patch?.status === "approved") {
      const currentState = await store.readState();
      const post = currentState.posts.find((item) => item.id === id);
      if (post && !post.copyReviewed) {
        sendJson(response, { error: "Review copy before approving this post." }, 400);
        return;
      }
    }
    const state = await store.updatePost(id, patch);
    sendJson(response, { state: withPublicChannelSetup(state) });
    return;
  }

  if (url.pathname === "/api/library/add" && request.method === "POST") {
    const item = await readJson(request);
    const state = await store.addLibraryItem({ id: crypto.randomUUID(), status: "approved", ...item });
    sendJson(response, { state: withPublicChannelSetup(state) });
    return;
  }

  if (url.pathname === "/api/brand/assets/add" && request.method === "POST") {
    const asset = await readJson(request);
    const state = await store.addBrandAsset({ id: crypto.randomUUID(), ...asset });
    sendJson(response, { state: withPublicChannelSetup(state) });
    return;
  }

  if (url.pathname === "/api/assets/register" && request.method === "POST") {
    try {
      const result = await registerLocalAsset(await readJson(request));
      sendJson(response, { ...result, state: withPublicChannelSetup(result.state) });
    } catch (error) {
      sendJson(response, { error: error.message || "Could not register asset." }, 400);
    }
    return;
  }

  if (url.pathname === "/api/brand/rules/add" && request.method === "POST") {
    const rule = await readJson(request);
    const state = await store.addBrandRule({ id: crypto.randomUUID(), ...rule });
    sendJson(response, { state: withPublicChannelSetup(state) });
    return;
  }

  const channelAction = url.pathname.match(/^\/api\/channels\/([^/]+)\/(test|disconnect)$/);
  if (channelAction && request.method === "POST") {
    const [, platform, action] = channelAction;
    if (!platforms.includes(platform)) {
      sendJson(response, { error: "Unsupported platform." }, 400);
      return;
    }
    const currentState = await store.readState();
    const safeChannel = safeChannelsResponse(currentState).find((channel) => channel.channel === platform);
    if (action === "test") {
      if (!safeChannel?.connected) {
        const state = await store.updateSocialAccount(platform, {
          lastTestStatus: "not_connected",
          lastTestMessage: "No connected account to test.",
          lastErrorSummary: "No connected account to test.",
          lastTestedAt: new Date().toISOString()
        });
        sendJson(response, { state: withPublicChannelSetup(state), message: "No connected account to test." });
        return;
      }
      const state = await store.updateSocialAccount(platform, {
        status: safeChannel.status,
        lastTestStatus: "ok",
        lastTestMessage: "Connection test placeholder passed. Live token verification is next.",
        lastErrorSummary: "",
        lastTestedAt: new Date().toISOString()
      });
      sendJson(response, { state: withPublicChannelSetup(state), message: `${channelLabels[platform]} connection checked.` });
      return;
    }
    if (!safeChannel?.connected) {
      sendJson(response, { state: withPublicChannelSetup(currentState), message: "No connected account." });
      return;
    }
    const state = await store.updateSocialAccount(platform, {
      status: "ready_to_connect",
      accountName: "",
      accountId: "",
      externalAccountId: "",
      connectedAt: "",
      tokenExpiresAt: "",
      lastTestStatus: "disconnected",
      lastTestMessage: "Disconnected. No publishing will happen for this channel.",
      lastErrorSummary: "",
      lastTestedAt: new Date().toISOString()
    });
    sendJson(response, { state: withPublicChannelSetup(state), message: `${channelLabels[platform]} disconnected.` });
    return;
  }

  const oauthStart = url.pathname.match(/^\/api\/oauth\/([^/]+)\/start$/);
  if (oauthStart && request.method === "GET") {
    const platform = oauthStart[1];
    if (!platforms.includes(platform)) {
      sendJson(response, { error: "Unsupported platform." }, 400);
      return;
    }
    const setup = channelSetup(platform);
    if (!setup.configured) {
      sendJson(response, {
        error: "Setup required before connecting.",
        channel: platform,
        missing_env_vars: setup.missingEnv
      }, 400);
      return;
    }
    if (platform === "linkedin") {
      const state = signOAuthState(platform);
      response.writeHead(302, { location: linkedinAuthorizationUrl({ state }) });
      response.end();
      return;
    }
    sendJson(response, {
      channel: platform,
      status: "ready_to_connect",
      message: "OAuth start route is ready. Live provider redirect is the next implementation step."
    });
    return;
  }

  const oauthCallback = url.pathname.match(/^\/api\/oauth\/([^/]+)\/callback$/);
  if (oauthCallback && request.method === "GET") {
    const platform = oauthCallback[1];
    if (!platforms.includes(platform)) {
      sendJson(response, { error: "Unsupported platform." }, 400);
      return;
    }
    if (url.searchParams.get("error")) {
      const state = await store.updateSocialAccount(platform, {
        status: "error",
        lastErrorSummary: "OAuth provider returned an error.",
        lastError: url.searchParams.get("error_description") || url.searchParams.get("error") || "OAuth provider returned an error.",
        lastTestedAt: new Date().toISOString()
      });
      sendJson(response, { state: withPublicChannelSetup(state), message: "OAuth provider returned an error." }, 400);
      return;
    }
    const verified = verifyOAuthState(platform, url.searchParams.get("state"));
    if (!verified.ok) {
      const state = await store.updateSocialAccount(platform, {
        status: "error",
        lastErrorSummary: verified.error,
        lastError: verified.error,
        lastTestedAt: new Date().toISOString()
      });
      sendJson(response, { state: withPublicChannelSetup(state), message: verified.error }, 400);
      return;
    }
    if (!url.searchParams.get("code")) {
      sendJson(response, { channel: platform, status: "error", message: "OAuth callback is missing an authorization code." }, 400);
      return;
    }
    if (platform === "linkedin") {
      try {
        const tokenPayload = await exchangeLinkedInCode(url.searchParams.get("code"));
        const profile = await fetchLinkedInUserInfo(tokenPayload.access_token);
        const accountName = profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ") || profile.email || "LinkedIn account";
        const tokenExpiresAt = tokenPayload.expires_in
          ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
          : "";
        const state = await store.updateSocialAccount(platform, {
          status: "connected",
          displayName: channelLabels[platform],
          accountName,
          accountId: profile.sub || "",
          externalAccountId: profile.sub || "",
          accessTokenEncrypted: encryptToken(tokenPayload.access_token),
          refreshTokenEncrypted: encryptToken(tokenPayload.refresh_token || ""),
          tokenExpiresAt,
          connectedAt: new Date().toISOString(),
          lastTestStatus: "connected",
          lastTestMessage: "LinkedIn connected successfully.",
          lastErrorSummary: "",
          lastError: "",
          lastTestedAt: new Date().toISOString(),
          oauthConfigured: true
        });
        sendJson(response, {
          state: withPublicChannelSetup(state),
          channel: platform,
          status: "connected",
          message: "LinkedIn connected successfully."
        });
      } catch (error) {
        const safeError = safeLinkedInError(error);
        const state = await store.updateSocialAccount(platform, {
          status: "error",
          lastErrorSummary: safeError,
          lastError: safeError,
          lastTestStatus: "error",
          lastTestMessage: safeError,
          lastTestedAt: new Date().toISOString(),
          oauthConfigured: true
        });
        sendJson(response, { state: withPublicChannelSetup(state), channel: platform, status: "error", message: safeError }, 400);
      }
      return;
    }
    sendJson(response, {
      channel: platform,
      status: "placeholder",
      message: "OAuth callback route reserved. Token exchange is not implemented yet."
    });
    return;
  }

  if (url.pathname === "/api/channels/connect" && request.method === "POST") {
    const { platform } = await readJson(request);
    if (!platforms.includes(platform)) {
      sendJson(response, { error: "Unsupported platform." }, 400);
      return;
    }
    const setup = channelSetup(platform);
    const status = setup.configured ? "ready_to_connect" : "setup_required";
    const message = channelSetupMessage(platform);
    const state = await store.updateSocialAccount(platform, {
      status,
      displayName: channelLabels[platform],
      scopes: setup.scopes,
      lastTestStatus: "setup_required",
      lastTestMessage: message,
      lastTestedAt: new Date().toISOString(),
      oauthConfigured: setup.configured
    });
    sendJson(response, { state: withPublicChannelSetup(state), message: setup.configured ? `${channelLabels[platform]} OAuth redirect is the next step.` : `${channelLabels[platform]} needs OAuth credentials.` });
    return;
  }

  if (url.pathname === "/api/channels/test" && request.method === "POST") {
    const { platform } = await readJson(request);
    if (!platforms.includes(platform)) {
      sendJson(response, { error: "Unsupported platform." }, 400);
      return;
    }
    const setup = channelSetup(platform);
    const state = await store.updateSocialAccount(platform, {
      scopes: setup.scopes,
      lastTestStatus: setup.configured ? "token_missing" : "setup_required",
      lastTestMessage: setup.configured
        ? "OAuth app credentials are present, but no live account token is stored yet."
        : channelSetupMessage(platform),
      lastTestedAt: new Date().toISOString(),
      oauthConfigured: setup.configured
    });
    sendJson(response, { state: withPublicChannelSetup(state), message: setup.configured ? `${channelLabels[platform]} needs a connected account token.` : `${channelLabels[platform]} needs OAuth credentials.` });
    return;
  }

  if (url.pathname === "/api/channels/disconnect" && request.method === "POST") {
    const { platform } = await readJson(request);
    if (!platforms.includes(platform)) {
      sendJson(response, { error: "Unsupported platform." }, 400);
      return;
    }
    const state = await store.updateSocialAccount(platform, {
      status: "not_connected",
      scopes: [],
      externalAccountId: "",
      connectedAt: "",
      lastTestStatus: "disconnected",
      lastTestMessage: "Disconnected. No publishing will happen for this channel.",
      lastTestedAt: new Date().toISOString(),
      oauthConfigured: false
    });
    sendJson(response, { state: withPublicChannelSetup(state), message: `${channelLabels[platform]} disconnected.` });
    return;
  }

  const html = htmlShell();
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    sendJson(response, { error: error.message }, 500);
  });
});

server.listen(port, () => {
  console.log(`LegalEase preview server ready at http://localhost:${port} (${store.kind} persistence)`);
});
