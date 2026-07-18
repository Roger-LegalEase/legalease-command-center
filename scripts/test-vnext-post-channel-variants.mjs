#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  buildPostChannelVariants,
  normalizePostChannel
} from "./ui/view-models/post-channel-variants.mjs";
import {
  POST_CHANNEL_VARIANT_SOURCE_MATRIX,
  collectPostChannelVariantSources
} from "./ui/view-models/post-channel-variant-sources.mjs";

const POST_ID = "post-channel-01";
const ACTOR = Object.freeze({ authenticated: true, role: "operator", id: "synthetic-operator" });

function fixtureState() {
  return {
    posts: [
      {
        id: POST_ID,
        title: "Shared headline",
        body: "Shared caption with a clear next step.",
        hook: "Shared hook",
        cta: "Read the guide",
        hashtags: ["#Shared", "#LegalEase"],
        targetChannels: ["threads", "x", "instagram", "linkedin"],
        assetIds: ["brand-shared"],
        disclaimerIds: ["disclaimer-shared"],
        channelGuidance: {
          facebook: {
            characterGuidance: "Keep the stored Facebook version concise.",
            hashtagGuidance: "Use only the hashtags stored for this Post."
          }
        },
        channelVariants: [
          {
            id: "linkedin-current",
            channel: "linkedin",
            headline: "LinkedIn headline",
            body: "LinkedIn-specific copy.",
            assetIds: ["brand-linkedin"],
            disclaimerIds: ["disclaimer-linkedin"],
            formatGuidance: {
              characterGuidance: "Keep the reviewed LinkedIn message focused.",
              linkGuidance: "Use only the stored approved link.",
              limitations: ["No current platform maximum is asserted."],
              reviewed: true
            }
          },
          {
            id: "instagram-current",
            channel: "instagram",
            caption: "Instagram-specific copy.",
            hashtags: ["#Instagram", "#LegalEase"],
            assetIds: ["hidden-instagram-asset"]
          },
          {
            id: "facebook-stored",
            channel: "facebook",
            body: "Stored Facebook copy remains available.",
            assetIds: ["brand-facebook"]
          },
          {
            id: "x-empty",
            channel: "x",
            body: ""
          },
          {
            id: "unknown-stored",
            channel: "fediverse_beta",
            body: "Stored safe unknown-channel copy."
          },
          {
            id: "hidden-variant",
            channel: "discord",
            body: "Hidden variant must never affect output.",
            ownerOnly: true
          }
        ],
        updatedAt: "2026-07-18T09:00:00.000Z"
      },
      {
        id: "hidden-post",
        title: "Hidden Post",
        body: "Must not project.",
        ownerOnly: true,
        targetChannels: ["linkedin"],
        channelVariants: [{ id: "hidden-post-linkedin", channel: "linkedin", body: "Hidden" }]
      },
      {
        id: "ambiguous-post",
        title: "Ambiguous Post",
        body: "Safe shared fallback.",
        targetChannels: ["linkedin"],
        channelVariants: [
          { id: "ambiguous-one", channel: "linkedin", body: "One" },
          { id: "ambiguous-two", channel: "linkedin", body: "Two" }
        ]
      },
      {
        id: "versioned-post",
        title: "Versioned Post",
        body: "Versioned shared body.",
        targetChannels: ["linkedin"],
        channelVariants: [
          { channel: "linkedin", variantFamilyId: "linkedin-family", versionNumber: 1, body: "Version one" },
          { channel: "linkedin", variantFamilyId: "linkedin-family", versionNumber: 2, body: "Version two" }
        ]
      },
      {
        id: "explicit-blank-post",
        title: "Explicit blank Post",
        body: "Shared body remains truthful.",
        cta: "Shared CTA",
        targetChannels: ["linkedin"],
        channelVariants: [{
          id: "explicit-blank-linkedin",
          channel: "linkedin",
          body: "",
          cta: "",
          explicitBlankFields: ["cta"]
        }]
      }
    ],
    postImages: [
      { id: "post-image-shared", postId: POST_ID, finalImageReady: true, privatePath: "/private/assets/image.png" }
    ],
    brandAssets: [
      { id: "brand-shared", approved: true, fileUrl: "https://example.com/signed?token=private" },
      { id: "brand-linkedin", approved: true },
      { id: "brand-facebook", approved: true },
      { id: "hidden-instagram-asset", approved: true, ownerOnly: true }
    ],
    postingKits: [{ id: "shared-kit", postId: POST_ID, status: "ready" }],
    library: [
      { id: "disclaimer-shared", status: "approved", category: "disclaimer" },
      { id: "disclaimer-linkedin", status: "approved", category: "disclaimer" }
    ],
    contentBank: [],
    reports: [],
    dataRoomItems: [],
    evidencePackNotes: [],
    approvals: [],
    approvalQueue: [],
    queueItems: [],
    publishEvents: [],
    activityEvents: [],
    auditHistory: [],
    generationBatches: [],
    settings: { sourceItems: [], localAssets: [] }
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

const state = fixtureState();
const before = structuredClone(state);
const projection = buildPostChannelVariants(state, ACTOR, POST_ID);

assert.equal(typeof buildPostChannelVariants, "function");
assert.equal(typeof collectPostChannelVariantSources, "function");
assert.equal(normalizePostChannel("Twitter/X"), "x");
assert.deepEqual(state, before, "The projection must not mutate source state.");
assert.equal(projection.postId, POST_ID);
assert.deepEqual(projection.selectedChannels, ["linkedin", "instagram", "x", "threads"]);
assert.equal(projection.shared.headline.value, "Shared headline");
assert.equal(projection.shared.body.value, "Shared caption with a clear next step.");
assert.equal(projection.shared.hook.value, "Shared hook");
assert.equal(projection.shared.cta.value, "Read the guide");
assert.deepEqual(projection.shared.hashtags.value, ["#LegalEase", "#Shared"]);
assert.deepEqual(projection.shared.creativeReferences.map((reference) => `${reference.sourceCollection}:${reference.sourceId}`), [
  "brandAssets:brand-shared",
  "postImages:post-image-shared",
  "postingKits:shared-kit"
]);
assert.deepEqual(projection.shared.disclaimerReferences.map((reference) => reference.sourceId), ["disclaimer-shared"]);

assert.deepEqual(projection.variants.map((variant) => variant.channel), [
  "linkedin", "instagram", "facebook", "x", "threads", "fediverse_beta"
]);
const linkedin = projection.variants.find((variant) => variant.channel === "linkedin");
const instagram = projection.variants.find((variant) => variant.channel === "instagram");
const facebook = projection.variants.find((variant) => variant.channel === "facebook");
const x = projection.variants.find((variant) => variant.channel === "x");
const threads = projection.variants.find((variant) => variant.channel === "threads");
const unknown = projection.variants.find((variant) => variant.channel === "fediverse_beta");

assert.equal(linkedin.selected, true);
assert.equal(linkedin.customized, true);
assert.equal(linkedin.content.body.value, "LinkedIn-specific copy.");
assert.equal(linkedin.content.body.source, "variant");
assert.equal(linkedin.content.cta.value, "Read the guide");
assert.equal(linkedin.content.cta.source, "shared");
assert.deepEqual(linkedin.assetReferences.map((reference) => reference.sourceId), ["brand-linkedin"]);
assert.deepEqual(linkedin.disclaimerReferences.map((reference) => reference.sourceId), ["disclaimer-linkedin"]);
assert.equal(linkedin.formatGuidance.characterGuidance, "Keep the reviewed LinkedIn message focused.");
assert.equal(linkedin.formatGuidance.classification, "advisory", "Soft reviewed guidance must remain advisory.");
assert.match(linkedin.formatGuidance.scopeNote, /does not assert current platform limits/i);

assert.equal(instagram.selected, true);
assert.equal(instagram.customized, true);
assert.equal(instagram.content.body.value, "Instagram-specific copy.");
assert.equal(instagram.availability.key, "unavailable");
assert.deepEqual(instagram.assetReferences, [], "An unauthorized asset must not be substituted or exposed.");
assert.ok(projection.availability.issues.some((issue) => issue.scope === "instagram" && issue.assetId === "hidden-instagram-asset"));

assert.equal(facebook.selected, false, "A stored variant does not select its channel.");
assert.equal(facebook.customized, true);
assert.equal(facebook.content.body.value, "Stored Facebook copy remains available.");
assert.equal(facebook.formatGuidance.hashtagGuidance, "Use only the hashtags stored for this Post.");
assert.equal(x.selected, true);
assert.equal(x.customized, false, "An empty unmarked override must not erase or customize valid shared copy.");
assert.equal(x.content.body.value, "Shared caption with a clear next step.");
assert.equal(x.content.body.state, "shared_fallback_empty_override");
assert.equal(threads.selected, true, "Selected-channel truth is independent of stored customization.");
assert.equal(threads.stored, false);
assert.equal(threads.customized, false);
assert.equal(threads.content.body.source, "shared");
assert.equal(unknown.label, "Fediverse beta");
assert.equal(unknown.selected, false);
assert.equal(unknown.customized, true);
assert.ok(!projection.variants.some((variant) => variant.channel === "discord"), "Hidden variants must not affect output.");
assert.equal(projection.performance.variantsExamined, 5, "Hidden variants must not affect examined counts.");

const deselectedState = structuredClone(state);
deselectedState.posts.find((post) => post.id === POST_ID).targetChannels = ["instagram", "x", "threads"];
const deselected = buildPostChannelVariants(deselectedState, ACTOR, POST_ID);
const deselectedLinkedIn = deselected.variants.find((variant) => variant.channel === "linkedin");
assert.equal(deselectedLinkedIn.selected, false);
assert.equal(deselectedLinkedIn.customized, true);
assert.equal(deselectedLinkedIn.content.body.value, "LinkedIn-specific copy.", "Removing a channel must not delete its stored variant.");

const explicitBlank = buildPostChannelVariants(state, ACTOR, "explicit-blank-post");
const explicitBlankLinkedIn = explicitBlank.variants[0];
assert.equal(explicitBlankLinkedIn.content.body.value, "Shared body remains truthful.");
assert.equal(explicitBlankLinkedIn.content.body.state, "shared_fallback_empty_override");
assert.equal(explicitBlankLinkedIn.content.cta.value, null);
assert.equal(explicitBlankLinkedIn.content.cta.state, "explicitly_blank");
assert.equal(explicitBlankLinkedIn.content.cta.explicitlyBlank, true);

const ambiguous = buildPostChannelVariants(state, ACTOR, "ambiguous-post");
assert.equal(ambiguous.variants[0].availability.reason, "ambiguous_variant");
assert.equal(ambiguous.variants[0].customized, null);
assert.equal(ambiguous.variants[0].content.body.source, "unavailable");
assert.equal(ambiguous.variants[0].sourceReference, null);

const versioned = buildPostChannelVariants(state, ACTOR, "versioned-post");
assert.equal(versioned.variants[0].content.body.value, "Version two");
assert.equal(versioned.variants[0].sourceReference.sourceId, "linkedin-family:v2");

const missingActor = buildPostChannelVariants(state, {}, POST_ID);
assert.equal(missingActor.availability.key, "unavailable");
assert.equal(missingActor.availability.reason, "actor_cannot_read");
assert.equal(missingActor.availability.counts.variants, null);
assert.deepEqual(missingActor.variants, []);
const hiddenPost = buildPostChannelVariants(state, ACTOR, "hidden-post");
assert.equal(hiddenPost.availability.key, "unavailable");
assert.equal(hiddenPost.availability.reason, "post_not_found");
assert.equal(hiddenPost.availability.counts.variants, null);

assert.deepEqual(buildPostChannelVariants(state, ACTOR, POST_ID), projection, "Equal inputs must be deterministic.");
assert.deepEqual(buildPostChannelVariants(reverseArrays(state), ACTOR, POST_ID), projection, "Source-array order must not affect output.");
assert.ok(Object.isFrozen(projection));
assert.ok(Object.isFrozen(projection.shared) && Object.isFrozen(projection.variants));
assert.ok(projection.variants.every((variant) => Object.isFrozen(variant) && Object.isFrozen(variant.content)));
assert.throws(() => projection.variants.push({}), TypeError);
assert.throws(() => { projection.variants[0].selected = false; }, TypeError);

assert.deepEqual(POST_CHANNEL_VARIANT_SOURCE_MATRIX.map((item) => item.source), [
  "posts", "posts.channelVariants", "posts.channel_variants", "posts.variantsByChannel",
  "postImages", "brandAssets", "postingKits", "library", "settings.localAssets"
]);
const serialized = JSON.stringify(projection);
for (const forbidden of ["/private/", "signed?token", "providerPayload", "credential", "accessToken", "rawPayload"]) {
  assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
}
assert.ok(projection.sourceReferences.some((reference) => reference.sourceCollection === "posts" && reference.sourceId === POST_ID), "PostView must remain the normalized identity source.");
assert.deepEqual(projection.capabilities, {
  mutatesPost: false,
  mutatesVariant: false,
  mutatesSelection: false,
  schedules: false,
  approves: false,
  publishes: false
});

const sourceFiles = [
  "scripts/ui/view-models/post-channel-variant-sources.mjs",
  "scripts/ui/view-models/post-channel-variants.mjs"
];
const pureSource = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
for (const forbiddenImport of ["preview-server", "storage", "database", "provider", "social-publish-service", "browser", "playwright", "css"] ) {
  assert.doesNotMatch(pureSource, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `Variant modules must not import ${forbiddenImport}.`);
}
for (const forbiddenRuntime of [
  /\bprocess\.env\b/,
  /\bDate\.now\s*\(/,
  /\bnew Date\s*\(\s*\)/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\b(?:window|document|localStorage|sessionStorage)\b/,
  /\b(?:readFile|writeFile|createServer)\s*\(/
]) {
  assert.doesNotMatch(pureSource, forbiddenRuntime, `Variant projection must remain pure: ${forbiddenRuntime}.`);
}
assert.doesNotMatch(pureSource, /(?:^|[^\w])(?:send|publish|schedule|approve|save|update|delete)\s*\(/im, "Variant projection must not execute actions.");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /view-models\/post-channel-variant/, "CCX-304A must not add runtime or browser wiring.");

function performanceFixture(count = 100) {
  const channels = ["linkedin", "instagram", "facebook", "x", "threads"];
  const posts = Array.from({ length: count }, (_, index) => {
    const postId = `performance-post-${String(index).padStart(3, "0")}`;
    return {
      id: postId,
      title: `Synthetic Post ${index}`,
      body: "Synthetic shared caption.",
      targetChannels: channels.slice(0, 3),
      channelVariants: [
        ...channels.map((channel, channelIndex) => ({
          id: `${postId}-${channel}`,
          channel,
          body: channelIndex < 3 ? `${channel} customization for ${postId}.` : "",
          assetIds: channelIndex === 0 && index % 10 === 0 ? [`missing-${postId}`] : channelIndex < 3 ? [`asset-${postId}-${channel}`] : []
        })),
        ...(index % 10 === 0 ? [{ id: `${postId}-restricted`, channel: "restricted_channel", body: "Restricted", ownerOnly: true }] : [])
      ]
    };
  });
  const brandAssets = posts.flatMap((post, index) => channels.slice(0, 3).flatMap((channel, channelIndex) =>
    channelIndex === 0 && index % 10 === 0 ? [] : [{ id: `asset-${post.id}-${channel}`, approved: true }]
  ));
  return {
    posts: [
      ...posts,
      ...Array.from({ length: 5 }, (_, index) => ({ id: `restricted-post-${index}`, ownerOnly: true, title: "Restricted", channelVariants: [] }))
    ],
    brandAssets,
    postImages: [],
    postingKits: [],
    library: [],
    contentBank: [], reports: [], dataRoomItems: [], evidencePackNotes: [], approvals: [], approvalQueue: [], queueItems: [],
    publishEvents: [], activityEvents: [], auditHistory: [], generationBatches: [], settings: { sourceItems: [], localAssets: [] }
  };
}

const productionLike = performanceFixture();
const performanceBefore = structuredClone(productionLike);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("Post channel variant projection attempted a network request.");
};
let performanceViews;
const startedAt = performance.now();
try {
  performanceViews = productionLike.posts.slice(0, 100).map((post) => buildPostChannelVariants(productionLike, ACTOR, post.id));
} finally {
  globalThis.fetch = originalFetch;
}
const projectionMs = performance.now() - startedAt;
const serializedBytes = Buffer.byteLength(JSON.stringify(performanceViews), "utf8");
const variantsExamined = performanceViews.reduce((sum, view) => sum + view.performance.variantsExamined, 0);
const variantsProjected = performanceViews.reduce((sum, view) => sum + view.variants.length, 0);
const customizedVariants = performanceViews.reduce((sum, view) => sum + view.availability.counts.customizedVariants, 0);
const missingRelationships = performanceViews.reduce((sum, view) => sum + view.availability.counts.missingRelationships, 0);
const sourceMutations = Number(JSON.stringify(productionLike) !== JSON.stringify(performanceBefore));
const mutationActions = {
  networkRequests,
  storageWrites: 0,
  sourceMutations,
  postMutations: 0,
  variantMutations: 0,
  selectionMutations: 0,
  scheduleMutations: 0,
  approvalMutations: 0,
  publicationMutations: 0
};

assert.equal(performanceViews.length, 100);
assert.ok(performanceViews.every((view) => view.performance.postsExamined === 100), "Restricted Posts must not affect examined counts.");
assert.equal(variantsExamined, 500, "Restricted variants must not affect examined counts.");
assert.equal(variantsProjected, 500);
assert.equal(customizedVariants, 300);
assert.equal(missingRelationships, 10);
assert.ok(projectionMs < 2_500, `100-Post adapter benchmark should remain below 2500 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 2_000_000, `Serialized benchmark should remain below 2 MB; observed ${serializedBytes} bytes.`);
assert.deepEqual(mutationActions, {
  networkRequests: 0,
  storageWrites: 0,
  sourceMutations: 0,
  postMutations: 0,
  variantMutations: 0,
  selectionMutations: 0,
  scheduleMutations: 0,
  approvalMutations: 0,
  publicationMutations: 0
});
assert.deepEqual(productionLike, performanceBefore);

console.log("PASS test-vnext-post-channel-variants");
console.log(JSON.stringify({
  fixture: "deterministic-production-like-adapter",
  postsExamined: 100,
  variantsExamined,
  variantsProjected,
  customizedVariants,
  missingRelationships,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  ...mutationActions
}));
