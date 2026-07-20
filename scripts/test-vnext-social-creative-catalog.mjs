import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  buildSocialCreativeCatalog,
  mapSocialTemplateCategory,
  SOCIAL_CREATIVE_CATEGORY_MAPPING
} from "./ui/view-models/social-creative-catalog.mjs";
import {
  SOCIAL_ASSET_SOURCE_MATRIX,
  SOCIAL_TEMPLATE_SOURCE_MATRIX
} from "./ui/view-models/social-creative-sources.mjs";
import { APPROVED_WHITE_LOGO_PATH, APPROVED_VISUAL_REFERENCE_PATH } from "./ui/brand-contract.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const operator = Object.freeze({ authenticated: true, role: "operator", id: "operator-catalog-test" });

const clone = (value) => JSON.parse(JSON.stringify(value));

function recursivelyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(recursivelyFrozen);
}

function assets(result) {
  return result.assetGroups.flatMap((group) => group.assets || []);
}

function assetById(result, id) {
  return assets(result).find((asset) => asset.id === id);
}

function templateById(result, id) {
  return result.templates.find((template) => template.id === id);
}

function sourceCollections(result) {
  return new Set(assets(result).map((asset) => asset.sourceReference.collection));
}

function baseState() {
  return {
    posts: [{ id: "post-must-not-change", title: "Existing Post", status: "draft" }],
    generationProfiles: [
      {
        id: "template-legal-education",
        profileName: "Legal education explainer",
        visualBucket: "Explainer carousel",
        description: "A stored plain-language legal education layout.",
        supportedChannels: ["linkedin", "instagram"],
        defaultAssetIds: ["background-navy"],
        active: true
      },
      {
        id: "template-faq",
        profileName: "Wilma FAQ",
        visualBucket: "Wilma answer / explainer graphic",
        supportedChannels: ["facebook", "threads"],
        usesWilma: true,
        defaultAssetIds: ["wilma-pose-01", "posting-kit-01"],
        defaultDisclaimerId: "disclaimer-01",
        previewAssetId: "wilma-pose-01",
        active: true
      },
      {
        id: "template-partner-story",
        profileName: "Partner story",
        category: "Partner proof",
        defaultAssetIds: ["background-local"],
        active: true
      },
      {
        id: "template-quote",
        profileName: "Quote card",
        visualBucket: "Quote card",
        usesLogo: true,
        defaultAssetIds: ["logo-primary"],
        active: true
      },
      {
        id: "template-product-update",
        profileName: "Product update",
        visualBucket: "Product / interface support graphic",
        defaultAssetIds: ["logo-primary"],
        active: true
      },
      {
        id: "template-proof-point",
        profileName: "Proof point",
        visualBucket: "Data / stat graphic",
        defaultAssetIds: ["visual-guidance-01"],
        active: true
      },
      {
        id: "template-community",
        profileName: "Community spotlight",
        category: "Community spotlight",
        active: true
      }
    ],
    brandAssets: [
      {
        id: "template-brand-family",
        name: "Stored FAQ layout",
        assetType: "template",
        templateCategory: "FAQ",
        description: "An explicitly approved stored template record.",
        supportedChannels: ["instagram"],
        assetIds: ["background-navy"],
        fileUrl: "assets/brand/templates/faq-layout.png",
        approved: true
      },
      {
        id: "logo-primary",
        name: "LegalEase primary logo",
        assetType: "logo",
        fileUrl: "assets/brand/logos/legalease-logo-2025-ob.png",
        tags: ["logo", "primary"],
        approved: true
      },
      {
        id: "wilma-pose-01",
        name: "Wilma pose 1",
        assetType: "wilma_reference",
        fileUrl: "assets/brand/wilma/poses/1.png",
        tags: ["wilma", "pose-library"],
        approved: true
      },
      {
        id: "background-navy",
        name: "Deep navy background",
        assetType: "background",
        fileUrl: "assets/brand/backgrounds/deep-navy.png",
        approved: true
      },
      {
        id: "logo-ai-reference",
        name: "Rendered reference logo",
        assetType: "logo",
        provenance: "ai_generated",
        fileUrl: "assets/brand/reference/rendered-logo.png",
        approved: true
      },
      {
        id: "asset-unapproved",
        name: "Unapproved substitute logo",
        assetType: "logo",
        fileUrl: "assets/brand/logos/substitute.png",
        approved: false
      },
      {
        id: "asset-deprecated",
        name: "Deprecated background",
        assetType: "background",
        fileUrl: "assets/brand/backgrounds/old.png",
        approved: true,
        status: "deprecated"
      },
      {
        id: "asset-failed",
        name: "Failed background",
        assetType: "background",
        fileUrl: "assets/brand/backgrounds/failed.png",
        approved: true,
        status: "failed"
      },
      {
        id: "asset-private-preview",
        name: "Private preview stays suppressed",
        assetType: "background",
        fileUrl: "/private/social/asset-private.png",
        notes: "storage token private-value",
        providerPayload: { raw: "private" },
        approved: true
      }
    ],
    settings: {
      localAssets: [
        {
          id: "background-local",
          label: "Approved local background",
          type: "background",
          filePath: "data/assets/backgrounds/local-approved.png",
          approved: true,
          active: true
        },
        {
          id: "local-active-not-approved",
          label: "Active alone is not approval",
          type: "background",
          filePath: "data/assets/backgrounds/not-approved.png",
          active: true
        }
      ]
    },
    library: [
      {
        id: "disclaimer-01",
        category: "disclaimer",
        title: "General information disclaimer",
        body: "General information only; rules vary by state and case.",
        status: "approved"
      },
      {
        id: "visual-guidance-01",
        category: "visual_reference",
        title: "Approved proof-point guidance",
        body: "Use one sourced proof point and a restrained data treatment.",
        status: "approved"
      },
      {
        id: "restricted-guardrail",
        category: "guardrail",
        title: "Restricted draft guidance",
        body: "Not approved for use.",
        status: "restricted"
      }
    ],
    postingKits: [
      {
        id: "posting-kit-01",
        name: "Reusable Social posting kit",
        status: "approved",
        approved: true,
        reusable: true,
        usageGuidance: "Use the reviewed channel crop references."
      },
      {
        id: "posting-kit-single-use",
        name: "One-off kit",
        approved: true,
        reusable: false
      }
    ],
    brandRules: [
      {
        id: "brand-rule-global",
        ruleGroup: "global_brand",
        name: "Global visual system",
        ruleJson: { summary: "Use approved LegalEase colors and preserve human dignity." },
        active: true
      },
      {
        id: "brand-rule-inactive",
        ruleGroup: "logo_usage",
        name: "Old logo rule",
        ruleJson: { summary: "Do not expose inactive guidance." },
        active: false
      }
    ],
    assetBundles: [
      {
        id: "bundle-global",
        name: "Global brand default",
        bundleType: "global_brand",
        assetIds: ["logo-primary", "background-navy"],
        ruleIds: ["brand-rule-global"],
        active: true
      }
    ]
  };
}

const darkContext = Object.freeze({ generatedAt: NOW, surfaceTone: "dark" });
const baselineState = baseState();
const baselineBefore = JSON.stringify(baselineState);
const baseline = buildSocialCreativeCatalog(baselineState, operator, darkContext);

assert.equal(baseline.generatedAt, NOW);
assert.equal(baseline.availability.key, "available");
assert.equal(JSON.stringify(baselineState), baselineBefore, "projection must not mutate source state or Posts");

assert.deepEqual(SOCIAL_TEMPLATE_SOURCE_MATRIX.map((item) => item.source), ["generationProfiles", "brandAssets[type=template]"]);
assert.deepEqual(SOCIAL_ASSET_SOURCE_MATRIX.map((item) => item.source), [
  "brandContract", "brandAssets", "settings.localAssets", "library", "postingKits", "assetBundles", "brandRules"
]);
assert.ok(baseline.templates.some((template) => template.sourceReference.collection === "generationProfiles"), "generationProfiles template family must project");
assert.ok(baseline.templates.some((template) => template.sourceReference.collection === "brandAssets"), "typed brandAssets template family must project");

const categoryKeys = new Set(baseline.categories.map((category) => category.key));
for (const key of ["legal_education", "faq", "partner_story", "quote", "product_update", "proof_point", "other"]) {
  assert.ok(categoryKeys.has(key), `${key} category must project when truthfully stored`);
}
assert.equal(templateById(baseline, "template-community").category.label, "Community spotlight");
assert.equal(mapSocialTemplateCategory("Unexpected format").key, "other");
assert.equal(SOCIAL_CREATIVE_CATEGORY_MAPPING.length, 6);

const collections = sourceCollections(baseline);
for (const collection of ["brandContract", "brandAssets", "settings.localAssets", "library", "postingKits"]) {
  assert.ok(collections.has(collection), `${collection} asset family must project`);
}
assert.ok(baseline.brandGuidance.some((item) => item.sourceReference.collection === "brandRules"));
assert.ok(baseline.brandGuidance.some((item) => item.sourceReference.collection === "brandContract"));

const wordmark = assetById(baseline, "brand-contract-white-wordmark");
assert.equal(wordmark.name, "Official all-white LegalEase wordmark");
assert.equal(wordmark.safePreviewReference.path, APPROVED_WHITE_LOGO_PATH);
assert.equal(wordmark.suitableSurface, "dark_only");
assert.ok(!JSON.stringify(baseline).includes(APPROVED_VISUAL_REFERENCE_PATH), "visual reference must never become a logo asset");
assert.equal(assetById(baseline, "logo-ai-reference"), undefined, "explicit AI-rendered logo must be excluded");

const lightCatalog = buildSocialCreativeCatalog(baseState(), operator, { generatedAt: NOW, surfaceTone: "light" });
assert.equal(assetById(lightCatalog, "brand-contract-white-wordmark"), undefined, "white wordmark must not be offered on a light surface");
assert.ok(lightCatalog.availability.issues.some((issue) => issue.key === "white_wordmark_requires_dark_surface"));

const faq = templateById(baseline, "template-faq");
assert.deepEqual(faq.defaultDisclaimerReference, { collection: "library", sourceId: "disclaimer-01" });
assert.deepEqual(faq.previewReference, { collection: "brandAssets", sourceId: "wilma-pose-01" });
assert.ok(faq.assetReferences.some((reference) => reference.collection === "postingKits" && reference.sourceId === "posting-kit-01"));
assert.ok(faq.assetReferences.some((reference) => reference.collection === "brandAssets" && reference.sourceId === "wilma-pose-01"));
assert.ok(baseline.assetGroups.some((group) => group.key === "wilma_poses" && group.assets.some((asset) => asset.id === "wilma-pose-01")));
assert.ok(baseline.assetGroups.some((group) => group.key === "disclaimer_blocks" && group.assets.some((asset) => asset.id === "disclaimer-01")));
assert.ok(baseline.assetGroups.some((group) => group.key === "posting_kits" && group.assets.some((asset) => asset.id === "posting-kit-01")));
assert.ok(baseline.assetGroups.some((group) => group.key === "template_linked_assets" && group.assetReferences.length > 0));

for (const excluded of ["asset-unapproved", "asset-deprecated", "asset-failed", "local-active-not-approved", "posting-kit-single-use"] ) {
  assert.equal(assetById(baseline, excluded), undefined, `${excluded} must not appear as approved`);
}
const privatePreview = assetById(baseline, "asset-private-preview");
assert.equal(privatePreview.safePreviewReference, null);
assert.equal(privatePreview.usageGuidance, null);
for (const forbidden of ["providerPayload", "private-value", "/private/social", "accessToken", "refreshToken", "signedUrl", "data:image/"]) {
  assert.ok(!JSON.stringify(baseline).includes(forbidden), `catalog must suppress ${forbidden}`);
}

const missingState = baseState();
missingState.generationProfiles.push({
  id: "template-missing-logo",
  profileName: "Template with a missing logo",
  category: "Quote",
  usesLogo: true,
  defaultAssetIds: ["missing-official-logo"],
  active: true
});
missingState.brandAssets.push({
  id: "different-logo",
  name: "Missing official logo replacement",
  assetType: "logo",
  fileUrl: "assets/brand/logos/different.png",
  approved: true
});
const missing = buildSocialCreativeCatalog(missingState, operator, darkContext);
const missingTemplate = templateById(missing, "template-missing-logo");
assert.equal(missingTemplate.availability.key, "unavailable");
assert.deepEqual(missingTemplate.missingAssetReferences, [{ assetId: "missing-official-logo", reason: "asset_unavailable" }]);
assert.ok(!missingTemplate.assetReferences.some((reference) => reference.sourceId === "different-logo"), "another logo must never be silently substituted");
assert.ok(missing.availability.issues.some((issue) => issue.templateId === "template-missing-logo" && issue.assetId === "missing-official-logo"));

const unapprovedRelationship = baseState();
unapprovedRelationship.generationProfiles.push({
  id: "template-unapproved-relationship",
  profileName: "Unapproved relationship",
  category: "Product update",
  defaultAssetIds: ["asset-unapproved"],
  active: true
});
assert.equal(templateById(buildSocialCreativeCatalog(unapprovedRelationship, operator, darkContext), "template-unapproved-relationship").availability.key, "unavailable", "an asset ID alone must not establish approval");

const similarTitleState = baseState();
similarTitleState.generationProfiles.push({
  id: "template-explicit-only",
  profileName: "Explicit relationships only",
  category: "Partner story",
  defaultAssetIds: ["exact-background-id"],
  active: true
});
similarTitleState.brandAssets.push({
  id: "similar-background-id",
  name: "Exact background id",
  assetType: "background",
  fileUrl: "assets/brand/backgrounds/similar.png",
  approved: true
});
assert.equal(templateById(buildSocialCreativeCatalog(similarTitleState, operator, darkContext), "template-explicit-only").availability.key, "unavailable", "filename and title similarity must never create a relationship");

const withHidden = baseState();
withHidden.generationProfiles.push({ id: "hidden-template", profileName: "Hidden template", category: "FAQ", active: true, ownerOnly: true });
withHidden.brandAssets.push({ id: "hidden-asset", name: "Hidden asset", assetType: "background", fileUrl: "assets/brand/backgrounds/hidden.png", approved: true, ownerOnly: true });
const withoutHidden = baseState();
assert.deepEqual(
  buildSocialCreativeCatalog(withHidden, operator, darkContext),
  buildSocialCreativeCatalog(withoutHidden, operator, darkContext),
  "hidden templates and assets must not affect categories, counts, issues, or diagnostics"
);

const missingActor = buildSocialCreativeCatalog(baseState(), {}, darkContext);
assert.equal(missingActor.availability.key, "unavailable");
assert.equal(missingActor.availability.reason, "actor_cannot_read");
assert.equal(missingActor.availability.counts.templates, null);
assert.deepEqual(missingActor.templates, []);
assert.deepEqual(buildSocialCreativeCatalog(baseState(), { authenticated: true, role: "unknown" }, darkContext).templates, []);

const reordered = baseState();
for (const key of ["generationProfiles", "brandAssets", "library", "postingKits", "brandRules", "assetBundles"]) reordered[key].reverse();
reordered.settings.localAssets.reverse();
assert.deepEqual(buildSocialCreativeCatalog(reordered, operator, darkContext), baseline, "input order must not affect the catalog");
assert.deepEqual(buildSocialCreativeCatalog(baseState(), operator, darkContext), baseline, "same sources and supplied time must be deterministic");
assert.ok(recursivelyFrozen(baseline), "catalog result must be recursively immutable");
assert.ok(recursivelyFrozen(SOCIAL_TEMPLATE_SOURCE_MATRIX));
assert.ok(recursivelyFrozen(SOCIAL_ASSET_SOURCE_MATRIX));
assert.ok(recursivelyFrozen(SOCIAL_CREATIVE_CATEGORY_MAPPING));
assert.throws(() => { baseline.templates.push({}); }, TypeError);

const moduleSource = [
  readFileSync(new URL("./ui/view-models/social-creative-sources.mjs", import.meta.url), "utf8"),
  readFileSync(new URL("./ui/view-models/social-creative-catalog.mjs", import.meta.url), "utf8")
].join("\n");
for (const forbidden of [
  /preview-server/, /playwright/, /node:fs/, /\bprocess\.env\b/, /\bDate\.now\s*\(/,
  /\bfetch\s*\(/, /\b(?:window|document|localStorage|sessionStorage)\b/,
  /\b(?:saveState|writeState|updatePost|generateImage|approvePost|schedulePost|publishPost)\s*\(/
]) {
  assert.doesNotMatch(moduleSource, forbidden, `pure catalog modules must exclude ${forbidden}`);
}
const previewServerSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
assert.match(
  previewServerSource,
  /import \{ buildSocialCreativeCatalog \} from "\.\/ui\/view-models\/social-creative-catalog\.mjs";/,
  "The integrated Discovery checklist must reuse the reviewed Social creative catalog projection."
);
assert.doesNotMatch(
  previewServerSource,
  /(?:GET|POST|PUT|PATCH|DELETE) \/api\/ui\/social\/creative-catalog/,
  "The pure catalog must not gain a standalone mutation or browser endpoint."
);

const benchmarkState = {
  posts: [{ id: "benchmark-post", title: "Must remain unchanged", status: "draft" }],
  generationProfiles: [],
  brandAssets: [],
  settings: { localAssets: [] },
  library: [],
  postingKits: [],
  brandRules: [],
  assetBundles: []
};
const benchmarkCategories = ["Legal education", "FAQ", "Partner story", "Quote", "Product update", "Proof point"];
for (let index = 0; index < 100; index += 1) {
  benchmarkState.generationProfiles.push({
    id: `benchmark-template-${String(index).padStart(3, "0")}`,
    profileName: `Benchmark template ${index}`,
    category: benchmarkCategories[index % benchmarkCategories.length],
    defaultAssetIds: index % 10 === 0 ? [`missing-asset-${index}`] : [`benchmark-asset-${String(index % 480).padStart(3, "0")}`],
    supportedChannels: index % 2 ? ["linkedin"] : ["instagram", "facebook"],
    active: true
  });
}
for (let index = 0; index < 500; index += 1) {
  benchmarkState.brandAssets.push({
    id: `benchmark-asset-${String(index).padStart(3, "0")}`,
    name: `Benchmark background ${index}`,
    assetType: "background",
    fileUrl: `assets/brand/backgrounds/benchmark-${String(index).padStart(3, "0")}.png`,
    approved: true,
    ...(index >= 480 ? { ownerOnly: true } : {})
  });
}
const benchmarkBefore = JSON.stringify(benchmarkState);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("Social creative catalog attempted a network request.");
};
const started = performance.now();
let benchmarkCatalog;
try {
  benchmarkCatalog = buildSocialCreativeCatalog(benchmarkState, operator, { generatedAt: NOW, surfaceTone: "dark" });
} finally {
  globalThis.fetch = originalFetch;
}
const elapsed = performance.now() - started;
assert.equal(JSON.stringify(benchmarkState), benchmarkBefore, "benchmark must not mutate templates, assets, or Posts");
assert.equal(benchmarkCatalog.templates.length, 100);
assert.equal(benchmarkCatalog.availability.counts.missingRelationships, 10);
assert.equal(benchmarkCatalog.categories.length, 6);
assert.ok(elapsed < 2000, `production-like catalog projection should remain adapter-scale (${elapsed.toFixed(3)} ms)`);
assert.equal(networkRequests, 0);

const benchmark = {
  physicalCandidates: 600,
  candidatesScanned: benchmarkCatalog.performance.candidatesScanned,
  authorizedTemplates: benchmarkCatalog.templates.length,
  authorizedStoredAssets: assets(benchmarkCatalog).filter((asset) => asset.sourceReference.collection !== "brandContract").length,
  missingRelationships: benchmarkCatalog.availability.counts.missingRelationships,
  excludedRecords: 20,
  restrictedRecords: 20,
  categories: benchmarkCatalog.categories.length,
  projectionMs: Number(elapsed.toFixed(3)),
  serializedBytes: Buffer.byteLength(JSON.stringify(benchmarkCatalog)),
  networkRequests,
  storageWrites: 0,
  sourceMutations: 0,
  postMutations: 0,
  imageGenerations: 0,
  selectionWrites: 0,
  scope: "pure catalog benchmark, not a composer or persistence proposal"
};

console.log("PASS test-vnext-social-creative-catalog");
console.log(JSON.stringify(benchmark));
