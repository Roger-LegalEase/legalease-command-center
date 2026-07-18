import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";
import {
  APPROVED_WHITE_LOGO_PATH,
  LOGO_USAGE_RULES,
  OFFICIAL_COLORS
} from "../brand-contract.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function safeId(value = "") {
  const id = clean(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? id : "";
}

function safeText(value = "", limit = 320) {
  const text = clean(value).replaceAll(/\s+/g, " ");
  if (!text) return null;
  if (/\b(?:access|refresh|storage|service.?role|oauth)[_ -]?(?:token|key)|\bcredential|\bprovider payload|\bsigned url|\bsecret\b/i.test(text)) return null;
  if (/data:image\//i.test(text) || /(?:^|\s)(?:\/(?:private|home|users|var|tmp)\/|[a-z]:\\)/i.test(text)) return null;
  if (/https?:\/\//i.test(text)) return null;
  return text.slice(0, limit);
}

function stableRecords(records = []) {
  return [...list(records)].sort((left, right) =>
    clean(left?.id || left?.key || left?.slug).localeCompare(clean(right?.id || right?.key || right?.slug), "en-US")
    || clean(left?.updatedAt || left?.updated_at || left?.createdAt || left?.created_at)
      .localeCompare(clean(right?.updatedAt || right?.updated_at || right?.createdAt || right?.created_at), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
}

function uniqueStrings(...values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map(clean).filter(Boolean))];
}

function sourceReference(collection, sourceId) {
  const id = safeId(sourceId);
  return id ? { collection, sourceId: id } : null;
}

function safePreviewReference(value = "") {
  let path = clean(value);
  if (!path || path.includes("\\") || path.includes("?") || path.includes("#") || path.split("/").includes("..")) return null;
  if (path.startsWith("/")) path = path.slice(1);
  if (!/^(?:assets|data\/assets)\/[a-z0-9_./-]+\.(?:png|jpe?g|webp|svg|pdf)$/i.test(path)) return null;
  return { kind: "repository_asset", path };
}

function actorRole(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal") ? role : "";
}

function visibleRecords(records, role) {
  return stableRecords(records).filter((record) => recordVisibleToActor(record, role)).map(cloneValue);
}

function failedOrDeprecated(record = {}) {
  const status = lower(record.status || record.assetStatus || record.templateStatus || record.generationStatus);
  return record.deprecated === true || record.failed === true || /^(?:deprecated|failed|blocked|error|rejected|retired)$/.test(status);
}

function explicitAiLogo(record = {}, kind = "") {
  if (!/logo|brand_mark|wordmark|icon/.test(kind)) return false;
  const provenance = lower(record.provenance || record.sourceType || record.generationMode);
  return record.aiGenerated === true || /^(?:ai|ai_generated|ai_rendered|generated_reference|visual_reference)$/.test(provenance);
}

function humanize(value = "") {
  const text = clean(value).replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ");
  return text ? text.charAt(0).toLocaleUpperCase("en-US") + text.slice(1) : "";
}

function normalizeKind(value = "") {
  return lower(value).replaceAll(/[\s-]+/g, "_");
}

function normalizedChannels(record = {}) {
  const values = uniqueStrings(record.supportedChannels, record.channels, record.platforms, Object.keys(record.platformOverrides || {}));
  return values.map((value) => {
    const channel = lower(value).replaceAll(" ", "");
    return ["twitter", "twitter/x", "twitter-x", "x/twitter", "x-twitter"].includes(channel) ? "x" : channel;
  }).filter((value) => /^[a-z0-9][a-z0-9_-]{0,39}$/.test(value)).sort((left, right) => left.localeCompare(right, "en-US"));
}

function relationshipIds(record = {}) {
  return uniqueStrings(
    record.assetId,
    record.assetIds,
    record.defaultAssetId,
    record.defaultAssetIds,
    record.requiredAssetIds,
    record.templateAssetIds,
    record.logoAssetId,
    record.wilmaAssetId,
    record.backgroundAssetId,
    record.postingKitId
  ).filter(safeId);
}

function requiredRoles(record = {}) {
  const output = uniqueStrings(record.requiredAssetRoles).map((role) => normalizeKind(role)).filter(Boolean);
  if (record.usesLogo === true && !output.includes("logo")) output.push("logo");
  if (record.usesWilma === true && !output.includes("wilma_pose")) output.push("wilma_pose");
  return output.sort((left, right) => left.localeCompare(right, "en-US"));
}

function templateCandidate(record, family) {
  const id = safeId(record.id || record.key || record.slug);
  if (!id || failedOrDeprecated(record)) return null;
  if (family === "generationProfiles" && (record.active !== true || record.approved === false)) return null;
  if (family === "brandAssets" && (normalizeKind(record.assetType || record.type) !== "template" || record.approved !== true)) return null;
  const source = sourceReference(family, id);
  if (!source) return null;
  return {
    id,
    name: safeText(record.displayName || record.name || record.profileName || record.title, 120) || humanize(id),
    storedCategory: safeText(record.templateCategory || record.category || record.contentType || record.visualBucket, 80),
    description: safeText(record.description || record.summary || record.usageGuidance, 320),
    supportedChannels: normalizedChannels(record),
    surfaceTone: normalizeKind(record.surfaceTone || record.suitableSurface || record.backgroundTone) || "unspecified",
    requiredAssetRoles: requiredRoles(record),
    defaultDisclaimerId: safeId(record.defaultDisclaimerId || record.disclaimerAssetId || record.defaultDisclaimerReference),
    previewAssetId: safeId(record.previewAssetId || record.previewReferenceId),
    directPreviewReference: safePreviewReference(record.previewReference || record.previewUrl || (family === "brandAssets" ? record.fileUrl : "")),
    assetIds: relationshipIds(record),
    sourceReference: source
  };
}

function suitableSurface(record = {}, kind = "") {
  const explicit = normalizeKind(record.suitableSurface || record.surfaceTone || record.backgroundTone);
  if (["dark", "dark_only", "light", "light_only", "any"].includes(explicit)) return explicit;
  const tags = list(record.tags).map(lower);
  if (record.whiteAsset === true || record.colorVariant === "white" || tags.includes("white")) return "dark_only";
  if (/background/.test(kind)) return "any";
  return "unspecified";
}

function storedAssetCandidate(record, family, options = {}) {
  const id = safeId(record.id || record.key || record.slug);
  const kind = normalizeKind(options.kind || record.assetType || record.type || record.kind || record.category);
  if (!id || !kind || failedOrDeprecated(record) || explicitAiLogo(record, kind)) return null;
  const source = sourceReference(family, id);
  if (!source) return null;
  return {
    id,
    name: safeText(record.name || record.label || record.title, 120) || humanize(id),
    kind,
    role: safeText(record.role || record.assetRole, 100) || humanize(kind),
    status: "approved",
    approved: true,
    suitableSurface: suitableSurface(record, kind),
    sourceReference: source,
    safePreviewReference: safePreviewReference(record.previewReference || record.previewUrl || record.downloadUrl || record.fileUrl || record.filePath),
    usageGuidance: safeText(record.usageGuidance || record.notes || options.usageGuidance, 320),
    value: safeText(record.value, 40)
  };
}

function brandAssetCandidate(record) {
  if (normalizeKind(record.assetType || record.type) === "template" || record.approved !== true) return null;
  return storedAssetCandidate(record, "brandAssets");
}

function localAssetCandidate(record) {
  if (record.approved !== true || record.active === false) return null;
  return storedAssetCandidate(record, "settings.localAssets");
}

function libraryAssetCandidate(record) {
  const category = normalizeKind(record.category || record.type);
  if (lower(record.status) !== "approved") return null;
  if (!["disclaimer", "disclaimer_block", "guardrail", "visual_reference", "usage_guidance"].includes(category)) return null;
  const kind = ["disclaimer", "disclaimer_block", "guardrail"].includes(category) ? "disclaimer_block" : "usage_guidance";
  return storedAssetCandidate(record, "library", { kind, usageGuidance: record.body });
}

function postingKitCandidate(record) {
  if (record.approved !== true || record.reusable !== true) return null;
  return storedAssetCandidate(record, "postingKits", { kind: "posting_kit" });
}

function staticAssets() {
  const wordmark = {
    id: "brand-contract-white-wordmark",
    name: "Official all-white LegalEase wordmark",
    kind: "logo",
    role: "Official white wordmark",
    status: "approved",
    approved: true,
    suitableSurface: "dark_only",
    sourceReference: sourceReference("brandContract", "shellLogo"),
    safePreviewReference: safePreviewReference(APPROVED_WHITE_LOGO_PATH),
    usageGuidance: "Use the exact official wordmark without redrawing, recoloring, or substitution.",
    value: null
  };
  const colors = Object.entries(OFFICIAL_COLORS).map(([key, color]) => ({
    id: `brand-color-${key}`,
    name: humanize(key),
    kind: "brand_color",
    role: clean(color.role),
    status: "approved",
    approved: true,
    suitableSurface: "any",
    sourceReference: sourceReference("brandContract", `color-${key}`),
    safePreviewReference: null,
    usageGuidance: safeText(color.role, 160),
    value: clean(color.value)
  }));
  return [wordmark, ...colors];
}

function guidanceRecords(records, role) {
  const guidance = [{
    id: "brand-contract-logo-usage",
    name: "Official logo usage",
    group: "logo_usage",
    summary: LOGO_USAGE_RULES.join(" "),
    sourceReference: sourceReference("brandContract", "logoUsageRules")
  }];
  for (const record of visibleRecords(records, role)) {
    const id = safeId(record.id || record.key || record.slug);
    if (!id || record.active !== true || failedOrDeprecated(record)) continue;
    const summary = safeText(record.summary || record.ruleJson?.summary || record.ruleJson?.hardRule || record.usageGuidance, 500);
    if (!summary) continue;
    guidance.push({
      id,
      name: safeText(record.name || record.title, 120) || humanize(id),
      group: normalizeKind(record.ruleGroup || record.category) || "brand_guidance",
      summary,
      sourceReference: sourceReference("brandRules", id)
    });
  }
  return guidance.sort((left, right) => left.id.localeCompare(right.id, "en-US"));
}

export const SOCIAL_TEMPLATE_SOURCE_MATRIX = deepFreeze([
  { source: "generationProfiles", role: "Active stored creative profiles and their explicit asset relationships" },
  { source: "brandAssets[type=template]", role: "Explicitly approved stored template records" }
]);

export const SOCIAL_ASSET_SOURCE_MATRIX = deepFreeze([
  { source: "brandContract", role: "Official white wordmark, approved colors, and logo usage guidance" },
  { source: "brandAssets", role: "Approved logos, Wilma references, backgrounds, examples, and other stored brand assets" },
  { source: "settings.localAssets", role: "Explicitly approved local asset registrations; paths remain private unless safely repository-relative" },
  { source: "library", role: "Approved disclaimer blocks, visual references, and usage guidance" },
  { source: "postingKits", role: "Explicitly approved reusable posting kits" },
  { source: "assetBundles", role: "Explicit asset and brand-rule relationships only" },
  { source: "brandRules", role: "Active compact usage guidance; raw rule payloads are not returned" }
]);

export function collectSocialCreativeSources(state = {}, actor = {}, context = {}) {
  const role = actorRole(actor);
  if (!role) return deepFreeze({ authorized: false, reason: "actor_cannot_read", templates: [], assets: [], guidance: [], bundles: [], diagnostics: { candidatesScanned: 0, excludedRecords: 0 } });

  const profileRecords = visibleRecords(state.generationProfiles, role);
  const brandAssetRecords = visibleRecords(state.brandAssets, role);
  const localAssetRecords = visibleRecords(state.settings?.localAssets, role);
  const libraryRecords = visibleRecords(state.library, role);
  const postingKitRecords = visibleRecords(state.postingKits, role);
  const brandRuleRecords = visibleRecords(state.brandRules, role);
  const bundleRecords = visibleRecords(state.assetBundles, role);

  const templates = [
    ...profileRecords.map((record) => templateCandidate(record, "generationProfiles")),
    ...brandAssetRecords.map((record) => templateCandidate(record, "brandAssets"))
  ].filter(Boolean).sort((left, right) => left.id.localeCompare(right.id, "en-US") || stableSerialize(left).localeCompare(stableSerialize(right), "en-US"));

  const storedAssets = [
    ...brandAssetRecords.map(brandAssetCandidate),
    ...localAssetRecords.map(localAssetCandidate),
    ...libraryRecords.map(libraryAssetCandidate),
    ...postingKitRecords.map(postingKitCandidate)
  ].filter(Boolean);
  const assets = [...staticAssets(), ...storedAssets].sort((left, right) =>
    left.id.localeCompare(right.id, "en-US") || left.sourceReference.collection.localeCompare(right.sourceReference.collection, "en-US")
  );

  const bundles = bundleRecords.filter((record) => record.active === true && !failedOrDeprecated(record)).map((record) => ({
    id: safeId(record.id || record.key || record.slug),
    name: safeText(record.name || record.title, 120),
    bundleType: normalizeKind(record.bundleType || record.type),
    assetIds: uniqueStrings(record.assetIds).filter(safeId),
    ruleIds: uniqueStrings(record.ruleIds).filter(safeId),
    sourceReference: sourceReference("assetBundles", record.id || record.key || record.slug)
  })).filter((record) => record.id && record.sourceReference).sort((left, right) => left.id.localeCompare(right.id, "en-US"));

  const visibleCandidates = profileRecords.length + brandAssetRecords.length + localAssetRecords.length + libraryRecords.length
    + postingKitRecords.length + brandRuleRecords.length + bundleRecords.length;
  const includedStored = templates.length + storedAssets.length + guidanceRecords(brandRuleRecords, role).length - 1 + bundles.length;

  return deepFreeze({
    authorized: true,
    reason: null,
    surfaceTone: normalizeKind(context.surfaceTone || context.creativeSurfaceTone) || "unspecified",
    templates,
    assets,
    guidance: guidanceRecords(brandRuleRecords, role),
    bundles,
    sourcePresence: {
      generationProfiles: Array.isArray(state.generationProfiles),
      brandAssets: Array.isArray(state.brandAssets),
      localAssets: Array.isArray(state.settings?.localAssets),
      library: Array.isArray(state.library),
      postingKits: Array.isArray(state.postingKits),
      brandRules: Array.isArray(state.brandRules),
      assetBundles: Array.isArray(state.assetBundles)
    },
    diagnostics: {
      candidatesScanned: visibleCandidates + staticAssets().length,
      excludedRecords: Math.max(0, visibleCandidates - includedStored)
    }
  });
}
