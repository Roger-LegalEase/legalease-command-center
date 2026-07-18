import { collectSocialCreativeSources } from "./social-creative-sources.mjs";

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validGeneratedAt(context = {}) {
  const value = clean(context.generatedAt || context.now);
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

function categoryToken(value = "") {
  return lower(value).replaceAll(/[\s/_-]+/g, " ").replaceAll(/\s+/g, " ");
}

const CATEGORY_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "legal_education", label: "Legal education", values: Object.freeze(["legal education", "education", "expungement education", "explainer", "explainer carousel"]) }),
  Object.freeze({ key: "faq", label: "FAQ", values: Object.freeze(["faq", "frequently asked questions", "q&a", "qa", "wilma answer", "wilma answer explainer graphic"]) }),
  Object.freeze({ key: "partner_story", label: "Partner story", values: Object.freeze(["partner story", "partner proof", "case study", "testimonial"]) }),
  Object.freeze({ key: "quote", label: "Quote", values: Object.freeze(["quote", "quote card"]) }),
  Object.freeze({ key: "product_update", label: "Product update", values: Object.freeze(["product update", "feature update", "product interface support graphic"]) }),
  Object.freeze({ key: "proof_point", label: "Proof point", values: Object.freeze(["proof point", "pilot proof", "data point", "data stat graphic", "stat graphic"]) })
]);

export const SOCIAL_CREATIVE_CATEGORY_MAPPING = CATEGORY_DEFINITIONS;

function humanize(value = "") {
  const text = clean(value).replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ");
  return text ? text.charAt(0).toLocaleUpperCase("en-US") + text.slice(1) : "Other";
}

export function mapSocialTemplateCategory(value = "") {
  const token = categoryToken(value);
  for (const category of CATEGORY_DEFINITIONS) {
    if (category.values.includes(token)) return { key: category.key, label: category.label, sourceValue: clean(value) || null };
  }
  return { key: "other", label: token ? humanize(token).slice(0, 80) : "Other", sourceValue: clean(value) || null };
}

const GROUP_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "logos", label: "Approved LegalEase logos" }),
  Object.freeze({ key: "wilma_poses", label: "Wilma poses" }),
  Object.freeze({ key: "brand_colors", label: "Brand colors" }),
  Object.freeze({ key: "backgrounds", label: "Backgrounds" }),
  Object.freeze({ key: "disclaimer_blocks", label: "Approved disclaimer blocks" }),
  Object.freeze({ key: "posting_kits", label: "Reusable posting kits" }),
  Object.freeze({ key: "usage_guidance", label: "Usage guidance" }),
  Object.freeze({ key: "other_assets", label: "Other approved assets" }),
  Object.freeze({ key: "template_linked_assets", label: "Template-linked assets" })
]);

function groupKey(asset = {}) {
  const kind = lower(asset.kind);
  if (/logo|wordmark|brand_mark|icon/.test(kind)) return "logos";
  if (/wilma/.test(kind)) return "wilma_poses";
  if (kind === "brand_color" || kind === "color") return "brand_colors";
  if (/background/.test(kind)) return "backgrounds";
  if (/disclaimer|guardrail/.test(kind)) return "disclaimer_blocks";
  if (/posting_kit/.test(kind)) return "posting_kits";
  if (/guidance|brand_bible|visual_reference|example_output/.test(kind)) return "usage_guidance";
  return "other_assets";
}

function surfaceAllowed(asset = {}, surfaceTone = "unspecified") {
  const tone = lower(surfaceTone).replaceAll(/[\s-]+/g, "_");
  const dark = ["dark", "dark_only", "deep_navy", "navy", "navy_950"].includes(tone);
  const light = ["light", "light_only", "white", "pale"].includes(tone);
  if (asset.suitableSurface === "dark_only" || asset.suitableSurface === "dark") return dark;
  if (asset.suitableSurface === "light_only" || asset.suitableSurface === "light") return light;
  return true;
}

function sourceKey(reference = {}) {
  return `${clean(reference.collection)}:${clean(reference.sourceId)}`;
}

function referenceForAsset(asset = {}) {
  return asset.sourceReference ? { ...asset.sourceReference } : null;
}

function templateRelationshipIds(template = {}) {
  return [...new Set([
    ...template.assetIds,
    template.defaultDisclaimerId,
    template.previewAssetId
  ].map(clean).filter(Boolean))];
}

function resolveAsset(index, assetId) {
  const matches = index.get(clean(assetId)) || [];
  return matches.length === 1 ? { asset: matches[0], ambiguous: false } : { asset: null, ambiguous: matches.length > 1 };
}

function projectTemplate(template, assetIndex) {
  const missing = [];
  const assetReferences = [];
  for (const assetId of templateRelationshipIds(template)) {
    const resolved = resolveAsset(assetIndex, assetId);
    if (!resolved.asset) {
      missing.push({
        assetId,
        reason: resolved.ambiguous ? "ambiguous_asset_reference" : "asset_unavailable"
      });
      continue;
    }
    assetReferences.push(referenceForAsset(resolved.asset));
  }

  const disclaimer = template.defaultDisclaimerId ? resolveAsset(assetIndex, template.defaultDisclaimerId) : { asset: null };
  if (template.defaultDisclaimerId && disclaimer.asset?.kind !== "disclaimer_block") {
    if (!missing.some((item) => item.assetId === template.defaultDisclaimerId)) {
      missing.push({ assetId: template.defaultDisclaimerId, reason: "disclaimer_unavailable" });
    }
  }
  const preview = template.previewAssetId ? resolveAsset(assetIndex, template.previewAssetId) : { asset: null };
  const category = mapSocialTemplateCategory(template.storedCategory);
  return {
    id: template.id,
    name: template.name,
    category,
    description: template.description,
    supportedChannels: [...template.supportedChannels],
    surfaceTone: template.surfaceTone,
    requiredAssetRoles: [...template.requiredAssetRoles],
    defaultDisclaimerReference: disclaimer.asset?.kind === "disclaimer_block" ? referenceForAsset(disclaimer.asset) : null,
    previewReference: preview.asset ? referenceForAsset(preview.asset) : template.directPreviewReference,
    sourceReference: { ...template.sourceReference },
    assetReferences: assetReferences.filter(Boolean).sort((left, right) => sourceKey(left).localeCompare(sourceKey(right), "en-US")),
    missingAssetReferences: missing.sort((left, right) => left.assetId.localeCompare(right.assetId, "en-US")),
    availability: missing.length
      ? { key: "unavailable", reason: "referenced_asset_unavailable" }
      : { key: "available", reason: null }
  };
}

function categorySummary(templates = []) {
  const counts = new Map();
  for (const template of templates) {
    const current = counts.get(template.category.key) || { key: template.category.key, label: template.category.label, templateCount: 0 };
    current.templateCount += 1;
    counts.set(template.category.key, current);
  }
  const rank = new Map(CATEGORY_DEFINITIONS.map((category, index) => [category.key, index]));
  return [...counts.values()].sort((left, right) =>
    (rank.get(left.key) ?? 99) - (rank.get(right.key) ?? 99)
    || left.label.localeCompare(right.label, "en-US")
  );
}

function assetGroups(assets, linkedReferences) {
  const groups = new Map();
  for (const definition of GROUP_DEFINITIONS) groups.set(definition.key, { ...definition, assets: [], assetReferences: [] });
  for (const asset of assets) groups.get(groupKey(asset)).assets.push(asset);
  groups.get("template_linked_assets").assetReferences = linkedReferences;
  return [...groups.values()].filter((group) => group.assets.length || group.assetReferences.length).map((group) => ({
    ...group,
    assets: group.assets.sort((left, right) => left.name.localeCompare(right.name, "en-US") || left.id.localeCompare(right.id, "en-US")),
    assetReferences: group.assetReferences.sort((left, right) => sourceKey(left).localeCompare(sourceKey(right), "en-US"))
  }));
}

function unavailableResult(context, reason) {
  return deepFreeze({
    generatedAt: validGeneratedAt(context),
    categories: [],
    templates: [],
    assetGroups: [],
    brandGuidance: [],
    availability: {
      key: "unavailable",
      reason,
      counts: { categories: null, templates: null, assets: null, missingRelationships: null, excludedRecords: null },
      issues: []
    },
    performance: { candidatesScanned: 0 },
    capabilities: { mutatesPosts: false, persistsSelection: false, generatesImages: false }
  });
}
export function buildSocialCreativeCatalog(state = {}, actor = {}, context = {}) {
  const sources = collectSocialCreativeSources(state, actor, context);
  if (!sources.authorized) return unavailableResult(context, sources.reason);

  const issues = [];
  const assets = sources.assets.filter((asset) => {
    const allowed = surfaceAllowed(asset, sources.surfaceTone);
    if (!allowed && asset.id === "brand-contract-white-wordmark" && ["light", "light_only", "white", "pale"].includes(sources.surfaceTone)) {
      issues.push({
        key: "white_wordmark_requires_dark_surface",
        sourceReference: { ...asset.sourceReference },
        message: "The official white LegalEase wordmark is unavailable on a light creative surface."
      });
    }
    return allowed;
  });

  const assetIndex = new Map();
  for (const asset of assets) {
    const matches = assetIndex.get(asset.id) || [];
    matches.push(asset);
    assetIndex.set(asset.id, matches);
  }

  const templates = sources.templates.map((template) => projectTemplate(template, assetIndex));
  for (const template of templates) {
    for (const missing of template.missingAssetReferences) {
      issues.push({
        key: missing.reason,
        templateId: template.id,
        assetId: missing.assetId,
        message: `Template ${template.id} cannot use referenced asset ${missing.assetId}.`
      });
    }
  }

  for (const bundle of sources.bundles) {
    for (const assetId of bundle.assetIds) {
      const resolved = resolveAsset(assetIndex, assetId);
      if (!resolved.asset) {
        issues.push({
          key: resolved.ambiguous ? "ambiguous_bundle_asset_reference" : "bundle_asset_unavailable",
          bundleId: bundle.id,
          assetId,
          message: `Asset bundle ${bundle.id} cannot use referenced asset ${assetId}.`
        });
      }
    }
  }

  const linkedMap = new Map();
  for (const template of templates) {
    for (const reference of template.assetReferences) linkedMap.set(sourceKey(reference), reference);
  }
  const linkedReferences = [...linkedMap.values()];
  const groups = assetGroups(assets, linkedReferences);
  const categories = categorySummary(templates);
  const missingRelationships = issues.filter((issue) => /asset|disclaimer/.test(issue.key)).length;
  const availableTemplates = templates.filter((template) => template.availability.key === "available").length;
  const assetCount = groups.filter((group) => group.key !== "template_linked_assets").reduce((sum, group) => sum + group.assets.length, 0);

  let availabilityKey = "available";
  let availabilityReason = null;
  if (!templates.length && !assetCount) {
    availabilityKey = "unavailable";
    availabilityReason = "catalog_sources_unavailable";
  } else if (issues.length || availableTemplates < templates.length || !templates.length) {
    availabilityKey = "partial";
    availabilityReason = issues.length ? "catalog_relationships_incomplete" : "template_sources_unavailable";
  }

  return deepFreeze({
    generatedAt: validGeneratedAt(context),
    categories,
    templates,
    assetGroups: groups,
    brandGuidance: sources.guidance.map((item) => ({ ...item, sourceReference: { ...item.sourceReference } })),
    availability: {
      key: availabilityKey,
      reason: availabilityReason,
      counts: {
        categories: categories.length,
        templates: templates.length,
        availableTemplates,
        assets: assetCount,
        missingRelationships,
        excludedRecords: sources.diagnostics.excludedRecords + (sources.assets.length - assets.length)
      },
      issues
    },
    performance: { candidatesScanned: sources.diagnostics.candidatesScanned },
    capabilities: { mutatesPosts: false, persistsSelection: false, generatesImages: false }
  });
}
