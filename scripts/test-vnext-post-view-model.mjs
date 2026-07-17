#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  POST_STATUS_CONTRACT,
  adaptPostStatus,
  buildPostView,
  buildPostViews
} from "./ui/view-models/post-view.mjs";
import { POST_SOURCE_MAPPINGS } from "./ui/view-models/post-sources.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";

const POST_ID = "post stable/01";

function fixtureState() {
  return {
    posts: [
      {
        id: POST_ID,
        title: "A clear next step",
        body: "Shared post copy.",
        hook: "Start with facts.",
        cta: "Check the guide.",
        hashtags: ["#LegalEase", "#ClearSteps"],
        status: "scheduled",
        approvalStatus: "approved",
        platform: "linkedin",
        targetChannels: ["instagram", "linkedin", "twitter"],
        channelVariants: [
          { channel: "linkedin", body: "Older LinkedIn copy.", updatedAt: "2026-07-16T08:00:00.000Z" },
          { channel: "instagram", caption: "Instagram-specific copy." },
          { channel: "linkedin", body: "LinkedIn-specific copy.", assetIds: ["brand-logo"], updatedAt: "2026-07-17T08:00:00.000Z" }
        ],
        contentBankIdeaId: "idea-01",
        sourceItemId: "source-01",
        sourceType: "campaign_upload",
        sourceReference: "Campaign Upload",
        importKey: "2026-07-20|09:00|linkedin|clear-steps",
        dataRoomItemId: "proof-01",
        evidencePackNoteId: "evidence-01",
        repurposedFromPostId: "post-original",
        brandAssetIds: ["brand-logo"],
        copyReviewed: true,
        imageFinalized: true,
        finalPreviewConfirmed: true,
        guidelinesGate: { passed: true, hardFails: [] },
        scheduledFor: "2026-07-20T09:00:00-04:00",
        timezone: "America/New_York",
        publishingStatus: "ready",
        per_channel_publish_status: { linkedin: "scheduled", instagram: "scheduled", x: "scheduled" },
        createdAt: "2026-07-16T10:00:00.000Z",
        updatedAt: "2026-07-17T10:00:00.000Z",
        publishAttempts: [{ id: "attempt-01", channel: "linkedin", status: "blocked", createdAt: "2026-07-17T09:00:00.000Z", providerPayload: "must-not-project" }]
      },
      { id: "post-idea", title: "An idea", contentType: "idea", status: "idea", createdAt: "2026-07-17T08:00:00.000Z" },
      { id: "post-draft", title: "A draft", body: "Draft body", status: "approved", platform: "linkedin", imageIntentionallyOmitted: true, finalPreviewConfirmed: true, updatedAt: "2026-07-17T09:00:00.000Z" },
      { id: "post-review", title: "Needs review", body: "Review body", status: "needs_review", platform: "linkedin", copyReviewed: false },
      { id: "post-published", title: "Published post", body: "Published body", status: "manually_posted", platform: "linkedin", targetChannels: ["linkedin", "x"], publishedAt: "2026-07-16T15:00:00.000Z", per_channel_publish_status: { linkedin: "posted", x: "failed" }, per_channel_published_url: { linkedin: "https://example.com/posts/01", x: "javascript:blocked" }, performance: { impressions: 1000, likes: 50, comments: 10, shares: 5, clicks: 20 } },
      { id: "post-original", title: "Original post", status: "draft" },
      { id: "<unsafe-post>", title: "Unsafe identity", status: "draft" },
      { id: "post-draft", title: "Older duplicate identity", status: "needs_review", updatedAt: "2020-01-01T00:00:00.000Z" }
    ],
    contentBank: [
      { id: "idea-01", title: "Source idea", status: "generated" },
      { id: "unconverted-idea", title: "Unconverted idea", status: "idea" }
    ],
    settings: {
      sourceItems: [
        { id: "source-01", title: "Source signal" },
        { id: "source-unlinked", title: "Unlinked source" }
      ]
    },
    reports: [
      { id: "report-01", title: "Explicit report", postIds: [POST_ID] },
      { id: "report-unlinked", title: "Unlinked report" }
    ],
    dataRoomItems: [
      { id: "proof-01", title: "Explicit proof" },
      { id: "proof-unlinked", title: "Unlinked proof" }
    ],
    evidencePackNotes: [
      { id: "evidence-01", title: "Explicit evidence" },
      { id: "evidence-unlinked", title: "Unlinked evidence" }
    ],
    generationBatches: [
      { id: "batch-01", postIds: [POST_ID] },
      { id: "batch-unlinked", postIds: ["post-other"] }
    ],
    approvals: [],
    approvalQueue: [
      { id: "approval-01", type: "post", sourceId: POST_ID, status: "approved", approvedAt: "2026-07-17T08:00:00.000Z" },
      { id: "approval-unlinked", type: "post", sourceId: "post-other", status: "pending" }
    ],
    queueItems: [
      { id: "queue-01", type: "post", sourceId: POST_ID, status: "approved", updatedAt: "2026-07-17T08:30:00.000Z" }
    ],
    postImages: [
      { id: "image-old", postId: POST_ID, versionNumber: 1, generationStatus: "qa_failed", renderQa: { passed: false } },
      { id: "image-current", postId: POST_ID, versionNumber: 2, generationStatus: "generated", finalImageReady: true, renderQa: { passed: true } },
      { id: "image-unlinked", postId: "post-other", generationStatus: "generated" }
    ],
    brandAssets: [
      { id: "brand-logo", slug: "legal-logo", assetType: "logo", approved: true },
      { id: "brand-unlinked", slug: "unlinked", assetType: "logo", approved: true }
    ],
    postingKits: [
      { id: "kit-01", postId: POST_ID, status: "ready" },
      { id: "kit-unlinked", postId: "post-other", status: "ready" }
    ],
    publishEvents: [
      { id: "publish-01", relatedObjectId: POST_ID, channel: "linkedin", eventType: "post_scheduled", statusAfter: "scheduled", createdAt: "2026-07-17T09:30:00.000Z", message: "raw provider detail must not project" },
      { id: "publish-02", postId: "post-published", channel: "linkedin", eventType: "post_published", statusAfter: "posted", publishedUrl: "https://example.com/posts/01", createdAt: "2026-07-16T15:00:00.000Z" }
    ],
    activityEvents: [
      { id: "activity-01", eventType: "Post updated", relatedObjectType: "posts", relatedObjectId: POST_ID, createdAt: "2026-07-17T10:00:00.000Z", rawPayload: { secret: "must-not-project" } },
      { id: "activity-unlinked", eventType: "Other updated", relatedObjectType: "posts", relatedObjectId: "post-other", createdAt: "2026-07-17T10:00:00.000Z" }
    ],
    auditHistory: [
      { id: "audit-01", action: "post_updated", resourceType: "Post", resourceId: POST_ID, timestamp: "2026-07-17T09:45:00.000Z", actor: "internal-user", providerPayload: "must-not-project" }
    ],
    runtime: {
      livePostingGates: {
        linkedin: { enabled: false },
        instagram: { enabled: false },
        x: { enabled: false }
      }
    }
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

const state = fixtureState();
const before = structuredClone(state);
const views = buildPostViews(state);
const post = views.find((item) => item.id === POST_ID);

assert.equal(typeof buildPostView, "function");
assert.equal(typeof buildPostViews, "function");
assert.equal(typeof adaptPostStatus, "function");
assert.deepEqual(state, before, "Projection must not mutate source state.");
assert.deepEqual(buildPostViews(state), views, "Equal input must produce equal output.");
assert.deepEqual(buildPostViews(reverseArrays(state)), views, "Source-array order must not affect the projection.");
assert.deepEqual(buildPostView(state, POST_ID), post, "Single and list projections must normalize the same Post contract.");
assert.equal(buildPostView(state, POST_ID).stableKey, `post:${POST_ID}`);
assert.equal(views.filter((item) => item.id === "post-draft").length, 1, "Duplicate stored IDs must not create duplicate Post identity.");
assert.ok(!views.some((item) => item.id === "<unsafe-post>"), "Posts without a safe exact link must fail closed.");
assert.ok(!views.some((item) => item.id === "unconverted-idea"), "An unconverted Content Bank idea is not silently converted into a Post.");
assert.ok(Object.isFrozen(views) && views.every(Object.isFrozen));
assert.ok(Object.isFrozen(post.sourceReferences) && Object.isFrozen(post.channelVariants) && Object.isFrozen(post.readinessSummary));
assert.throws(() => post.channelVariants.push({}), TypeError);

assert.equal(post.id, POST_ID);
assert.equal(post.stableKey, `post:${POST_ID}`);
assert.equal(post.objectType, "Post");
assert.equal(post.href, "#social/post/post%20stable%2F01");
assert.deepEqual(resolveRouteCompatibility(post.href), {
  kind: "object",
  requestedHash: post.href,
  requestedRoute: "social/post",
  canonicalRoute: "item",
  aliasUsed: null,
  destination: "Social",
  objectType: "Post",
  sourceKind: "posts",
  sourceId: POST_ID,
  safeHash: post.href,
  legacyHash: "#item/posts/post%20stable%2F01",
  recoveryReason: null
});

assert.deepEqual(POST_SOURCE_MAPPINGS.canonical, { collection: "posts", sourceKind: "post", relationship: "record" });
assert.deepEqual(post.sourceReferences.map((reference) => [reference.relationship, reference.sourceCollection, reference.sourceId]), [
  ["record", "posts", POST_ID],
  ["idea", "contentBank", "idea-01"],
  ["source", "settings.sourceItems", "source-01"],
  ["calendar", "embedded-calendar-import", "2026-07-20|09:00|linkedin|clear-steps"],
  ["proof", "dataRoomItems", "proof-01"],
  ["proof", "evidencePackNotes", "evidence-01"],
  ["proof", "reports", "report-01"],
  ["repurposed_from", "posts", "post-original"],
  ["generation", "generationBatches", "batch-01"],
  ["approval", "approvalQueue", "approval-01"],
  ["approval", "queueItems", "queue-01"]
]);
assert.ok(!JSON.stringify(post).includes("unlinked"));

assert.deepEqual(post.channelVariants.map((variant) => variant.channel), ["linkedin", "instagram", "x"]);
assert.equal(post.channelVariants[0].content.body, "LinkedIn-specific copy.");
assert.equal(post.channelVariants[0].isCustomized, true);
assert.equal(post.channelVariants[1].content.body, "Instagram-specific copy.");
assert.equal(post.channelVariants[2].content.body, "Shared post copy.");
assert.equal(post.channelVariants[2].label, "X");
assert.equal(post.channelVariants[2].isCustomized, false);

assert.deepEqual(post.assetReferences.map((reference) => reference.id), [
  "brandAssets:brand-logo",
  "postImages:image-current",
  "postImages:image-old",
  "postingKits:kit-01"
]);
assert.equal(post.assetReferences.find((reference) => reference.id === "brandAssets:brand-logo").href, "#files/brand-asset/brand-logo");
assert.equal(post.schedule.scheduled, true);
assert.equal(post.schedule.scheduledAt, "2026-07-20T09:00:00-04:00");
assert.equal(post.schedule.timezone, "America/New_York");
assert.deepEqual(post.schedule.channels, ["linkedin", "instagram", "x"]);

assert.equal(post.status.label, "Scheduled");
assert.equal(post.readinessSummary.key, "scheduled");
assert.equal(post.readinessSummary.label, "Scheduled");
assert.equal(post.readinessSummary.blockerCount, 0);
assert.equal(post.readinessSummary.approval.label, "Approved");
assert.deepEqual(post.readinessSummary.warnings, [{ key: "publishing", label: "Publishing is off" }]);
assert.equal(post.resultSummary.available, false);
assert.equal(post.resultSummary.label, "Results unavailable");
assert.equal(post.resultSummary.metrics.impressions, null, "Unavailable metrics must remain null rather than zero.");

assert.deepEqual(views.map((item) => [item.id, item.status.label]), [
  [POST_ID, "Scheduled"],
  ["post-draft", "Draft"],
  ["post-idea", "Idea"],
  ["post-original", "Draft"],
  ["post-published", "Published"],
  ["post-review", "Needs review"]
]);
assert.equal(POST_STATUS_CONTRACT.idea.label, "Idea");
assert.equal(adaptPostStatus({ status: "posted" }).label, "Published");
assert.equal(adaptPostStatus({ status: "blocked_channel_not_connected", scheduledFor: "2026-07-20" }).label, "Needs review");

const published = views.find((item) => item.id === "post-published");
assert.equal(published.resultSummary.available, true);
assert.equal(published.resultSummary.label, "Results available");
assert.equal(published.resultSummary.metrics.impressions, 1000);
assert.equal(published.resultSummary.metrics.saves, null);
assert.equal(published.resultSummary.engagementRate, 8.5);
assert.equal(published.resultSummary.channelResults[0].publishedUrl, "https://example.com/posts/01");
assert.equal(published.resultSummary.channelResults[1].publishedUrl, "", "Unsafe result URLs must fail closed.");
assert.equal(published.resultSummary.channelResults[1].status.label, "Needs review");

assert.deepEqual(post.activity.map((item) => item.id), [
  "activityEvents:activity-01",
  "auditHistory:audit-01",
  "publishEvents:publish-01",
  "posts.publishAttempts:attempt-01",
  "queueItems:queue-01",
  "approvalQueue:approval-01"
]);
const serialized = JSON.stringify(post);
for (const forbidden of ["providerPayload", "rawPayload", "must-not-project", "external_post_id", "oauth", "token"]) {
  assert.doesNotMatch(serialized, new RegExp(forbidden, "i"), `PostView must not expose ${forbidden}.`);
}

const invalidScheduleState = { posts: [{ id: "invalid-schedule", title: "Invalid schedule", status: "scheduled", scheduledFor: "next Tuesday", platform: "linkedin" }] };
const invalidSchedule = buildPostViews(invalidScheduleState)[0];
assert.equal(invalidSchedule.schedule.scheduled, false);
assert.equal(invalidSchedule.schedule.scheduledAt, "");

const fixesState = {
  posts: [{ id: "fixes", title: "Fixes", status: "needs_review", platform: "linkedin", copyReviewed: false, complianceRisk: "high", guidelinesGate: { passed: false, hardFails: [{ rule: "private-rule", detail: "raw detail" }] } }],
  postImages: [{ id: "fixes-image", postId: "fixes", generationStatus: "qa_failed", renderQa: { passed: false, hardFails: [{ detail: "raw image detail" }] } }]
};
const fixes = buildPostViews(fixesState)[0];
assert.equal(fixes.readinessSummary.label, "Fixes needed");
assert.ok(fixes.readinessSummary.blockerCount >= 4);
assert.doesNotMatch(JSON.stringify(fixes.readinessSummary), /private-rule|raw detail|raw image detail/);

const postViewSource = readFileSync("scripts/ui/view-models/post-view.mjs", "utf8");
const postSourcesSource = readFileSync("scripts/ui/view-models/post-sources.mjs", "utf8");
const pureSource = `${postViewSource}\n${postSourcesSource}`;
for (const forbiddenImport of ["preview-server", "storage", "database", "provider", "social-publish-service", "company-memory"]) {
  assert.doesNotMatch(pureSource, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `PostView modules must not import ${forbiddenImport}.`);
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
  assert.doesNotMatch(pureSource, forbiddenRuntime, `PostView projection must remain pure: ${forbiddenRuntime}.`);
}
assert.doesNotMatch(pureSource, /(?:^|[^\w])(?:send|publish|schedule|approve)\s*\(/im, "Projection must not execute Social actions.");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /view-models\/post-(?:view|sources)\.mjs/, "CCX-300 must not wire a runtime endpoint or visible Social page.");

function performanceFixture(count = 100) {
  const posts = Array.from({ length: count }, (_, index) => ({
    id: `performance-post-${String(index).padStart(3, "0")}`,
    title: `Synthetic post ${String(index).padStart(3, "0")}`,
    body: "Synthetic, non-sensitive post body.",
    status: index % 5 === 0 ? "manually_posted" : index % 3 === 0 ? "scheduled" : "approved",
    platform: "linkedin",
    targetChannels: ["linkedin"],
    contentBankIdeaId: `performance-idea-${String(index).padStart(3, "0")}`,
    copyReviewed: true,
    imageFinalized: true,
    finalPreviewConfirmed: true,
    guidelinesGate: { passed: true, hardFails: [] },
    scheduledFor: index % 3 === 0 ? "2026-07-20T09:00:00-04:00" : "",
    updatedAt: "2026-07-17T12:00:00.000Z"
  }));
  return {
    posts,
    contentBank: posts.map((post, index) => ({ id: post.contentBankIdeaId, title: `Synthetic idea ${index}`, status: "generated" })),
    postImages: posts.map((post, index) => ({ id: `performance-image-${index}`, postId: post.id, finalImageReady: true, generationStatus: "generated" })),
    approvalQueue: posts.map((post, index) => ({ id: `performance-approval-${index}`, type: "post", sourceId: post.id, status: "approved" })),
    publishEvents: posts.filter((_, index) => index % 5 === 0).map((post, index) => ({ id: `performance-publish-${index}`, postId: post.id, channel: "linkedin", statusAfter: "posted", eventType: "post_published" })),
    activityEvents: posts.map((post, index) => ({ id: `performance-activity-${index}`, relatedObjectType: "posts", relatedObjectId: post.id, eventType: "Post updated" })),
    approvals: [], queueItems: [], reports: [], dataRoomItems: [], evidencePackNotes: [], generationBatches: [], brandAssets: [], postingKits: [], auditHistory: [], settings: { sourceItems: [] }
  };
}

const productionLike = performanceFixture();
const performanceBefore = structuredClone(productionLike);
buildPostViews(productionLike);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("PostView projection attempted a network request.");
};
const startedAt = performance.now();
let performanceViews;
try {
  performanceViews = buildPostViews(productionLike);
} finally {
  globalThis.fetch = originalFetch;
}
const projectionMs = performance.now() - startedAt;
const serializedBytes = Buffer.byteLength(JSON.stringify(performanceViews), "utf8");
const inputMutations = Number(JSON.stringify(productionLike) !== JSON.stringify(performanceBefore));
const storageWrites = 0;

assert.equal(performanceViews.length, 100);
assert.ok(projectionMs < 100, `100-record PostView projection should remain below 100 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 300_000, `100-record serialized projection should remain below 300 KB; observed ${serializedBytes} bytes.`);
assert.equal(inputMutations, 0);
assert.equal(networkRequests, 0);
assert.equal(storageWrites, 0);
assert.deepEqual(productionLike, performanceBefore);

console.log("PASS test-vnext-post-view-model");
console.log(JSON.stringify({
  fixture: "deterministic-production-like",
  postsExamined: productionLike.posts.length,
  postViews: performanceViews.length,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  inputMutations,
  networkRequests,
  storageWrites
}));
