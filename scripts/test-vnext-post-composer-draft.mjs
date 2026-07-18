#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { buildPostComposerDraft } from "./ui/view-models/post-composer-draft.mjs";
import {
  POST_COMPOSER_DRAFT_SOURCE_MATRIX,
  collectPostComposerDraftSources
} from "./ui/view-models/post-composer-draft-sources.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const POST_ID = "composer-post-01";
const ACTOR = Object.freeze({ authenticated: true, role: "operator", id: "synthetic-operator" });

function fixtureState() {
  return {
    posts: [{
      id: POST_ID,
      title: "Know the next step",
      body: "Stored shared caption with no outcome promise.",
      hook: "Clarity starts here",
      cta: "Read the guide",
      hashtags: ["#LegalEase", "#LegalEducation"],
      targetChannels: ["instagram", "linkedin"],
      channelVariants: [
        { id: "variant-linkedin", channel: "linkedin", body: "Stored LinkedIn customization.", assetIds: ["asset-other"] },
        { id: "variant-facebook", channel: "facebook", body: "Preserved unselected Facebook copy." }
      ],
      selectedTemplateId: "template-education",
      logoAssetId: "brand-contract-white-wordmark",
      wilmaAssetId: "wilma-wave",
      backgroundAssetId: "background-navy",
      disclaimerIds: ["disclaimer-standard"],
      assetIds: ["asset-other"],
      creativeSurfaceTone: "dark",
      scheduledFor: "2026-07-20T14:00:00.000Z",
      timezone: "America/New_York",
      scheduleStatus: "valid",
      approvalRequired: true,
      approvalStatus: "approved",
      approvedAt: "2026-07-18T11:00:00.000Z",
      status: "approved",
      guidelinesGate: { passed: true, hardFails: [] },
      copyReviewed: true,
      finalPreviewConfirmed: true,
      updatedAt: "2026-07-18T11:30:00.000Z",
      credential: "must-not-project",
      providerPayload: { accessToken: "must-not-project" }
    }],
    generationProfiles: [{
      id: "template-education",
      displayName: "Legal education card",
      templateCategory: "Legal education",
      description: "A reviewed education layout.",
      supportedChannels: ["linkedin", "instagram"],
      surfaceTone: "dark",
      requiredAssetRoles: ["logo", "wilma_pose", "background"],
      assetIds: ["brand-contract-white-wordmark", "wilma-wave", "background-navy", "asset-other"],
      defaultDisclaimerId: "disclaimer-standard",
      active: true,
      approved: true
    }],
    brandAssets: [
      { id: "wilma-wave", name: "Wilma wave", assetType: "wilma_pose", approved: true, filePath: "/private/wilma.png" },
      { id: "background-navy", name: "Navy background", assetType: "background", approved: true, fileUrl: "https://example.com/background.png?token=secret" },
      { id: "asset-other", name: "Approved accent", assetType: "visual_reference", approved: true },
      { id: "unapproved-logo", name: "Unapproved logo", assetType: "logo", approved: false }
    ],
    postImages: [{
      id: "post-image-final",
      postId: POST_ID,
      generationStatus: "generated",
      finalImageReady: true,
      renderQa: { passed: true },
      styleGate: { passed: true },
      versionNumber: 1,
      privateAssetPath: "/private/final.png",
      providerPayload: { storageToken: "must-not-project" }
    }],
    library: [{
      id: "disclaimer-standard",
      title: "Standard disclaimer",
      category: "disclaimer",
      status: "approved",
      body: "Informational only; not legal advice."
    }],
    postingKits: [],
    socialAccounts: [
      { id: "account-linkedin", platform: "linkedin", status: "connected", connected: true },
      { id: "account-instagram", platform: "instagram", status: "connected", connected: true }
    ],
    approvals: [{ id: "approval-01", type: "post", sourceId: POST_ID, status: "approved", updatedAt: "2026-07-18T11:00:00.000Z" }],
    approvalQueue: [],
    queueItems: [],
    publishEvents: [],
    contentBank: [],
    reports: [],
    dataRoomItems: [],
    evidencePackNotes: [],
    activityEvents: [],
    auditHistory: [],
    generationBatches: [],
    assetBundles: [],
    brandRules: [],
    settings: { sourceItems: [], localAssets: [] },
    runtime: { livePostingGates: { linkedin: true, instagram: true } }
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, "Every object and array in the draft contract must be frozen.");
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

assert.equal(typeof buildPostComposerDraft, "function");
assert.equal(typeof collectPostComposerDraftSources, "function");
assert.deepEqual(POST_COMPOSER_DRAFT_SOURCE_MATRIX.map((item) => item.source), [
  "PostView", "Post channel variants", "Social creative catalog", "Social readiness", "posts / related postImages"
]);

const state = fixtureState();
const before = structuredClone(state);
const draft = buildPostComposerDraft(state, ACTOR, POST_ID, { generatedAt: NOW });
assert.deepEqual(state, before, "Composer projection must not mutate any source.");
assert.equal(draft.postId, POST_ID);
assert.equal(draft.href, "#social/post/composer-post-01");
assert.equal(draft.generatedAt, NOW);
assert.equal(draft.availability.key, "available");

// Shared content is canonical CCX-304A fallback truth, not duplicated storage.
assert.equal(draft.sharedContent.headline.value, "Know the next step");
assert.equal(draft.sharedContent.body.value, "Stored shared caption with no outcome promise.");
assert.equal(draft.sharedContent.hook.value, "Clarity starts here");
assert.equal(draft.sharedContent.cta.value, "Read the guide");
assert.deepEqual(draft.sharedContent.hashtags.value, ["#LegalEase", "#LegalEducation"]);
assert.deepEqual(draft.selectedChannels, ["linkedin", "instagram"]);
assert.deepEqual(draft.channelVariants.map((variant) => variant.channel), ["linkedin", "instagram", "facebook"]);

const linkedin = draft.channelVariants.find((variant) => variant.channel === "linkedin");
const instagram = draft.channelVariants.find((variant) => variant.channel === "instagram");
const facebook = draft.channelVariants.find((variant) => variant.channel === "facebook");
assert.equal(linkedin.selected, true);
assert.equal(linkedin.customized, true);
assert.equal(linkedin.content.body.source, "variant");
assert.equal(instagram.selected, true);
assert.equal(instagram.customized, false, "A selected channel must not imply customization.");
assert.equal(instagram.stored, false);
assert.equal(instagram.content.body.source, "shared", "Shared copy remains fallback presentation only.");
assert.equal(facebook.selected, false, "A stored variant must not select its channel.");
assert.equal(facebook.customized, true);
assert.equal(facebook.stored, true, "Unselected stored variants remain preserved.");

// Exact creative selection; catalog approval and surface truth remain authoritative.
assert.equal(draft.creative.template.value.id, "template-education");
assert.equal(draft.creative.logo.value.id, "brand-contract-white-wordmark");
assert.equal(draft.creative.logo.value.suitableSurface, "dark_only");
assert.equal(draft.creative.wilma.value.id, "wilma-wave");
assert.equal(draft.creative.background.value.id, "background-navy");
assert.deepEqual(draft.creative.disclaimers.values.map((asset) => asset.id), ["disclaimer-standard"]);
assert.deepEqual(draft.creative.otherAssets.values.map((asset) => asset.id), ["asset-other"]);
assert.ok(draft.creative.template.value.assetReferences.some((reference) => reference.sourceId === "wilma-wave"));
assert.ok(draft.creative.sharedReferences.some((reference) => reference.sourceId === "post-image-final"));
assert.doesNotMatch(JSON.stringify(draft), /\/private\/|token=|must-not-project|accessToken|storageToken|providerPayload/);

assert.equal(draft.schedule.state, "valid");
assert.equal(draft.schedule.scheduled, true);
assert.equal(draft.schedule.scheduledAt, "2026-07-20T14:00:00.000Z");
assert.equal(draft.approval.state, "approved");
assert.equal(draft.approval.approved, true);
assert.equal(draft.readiness.state.key, "ready_to_publish");
assert.ok(draft.readiness.checks.every((check) => check.executable === false));
assert.equal(draft.readiness.nextStep.executable, false);
assert.equal(draft.readiness.publication.state, "unavailable", "Approval and schedule cannot fabricate publication.");
assert.ok(draft.sourceReferences.some((reference) => reference.collection === "posts" && reference.sourceId === POST_ID));
assert.deepEqual(Object.values(draft.capabilities), Array(Object.keys(draft.capabilities).length).fill(false));

// Light surfaces exclude the exact white wordmark; no replacement is selected.
const lightState = fixtureState();
lightState.posts[0].creativeSurfaceTone = "light";
const light = buildPostComposerDraft(lightState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(light.creative.logo.selected, false);
assert.equal(light.creative.logo.requestedIds[0], "brand-contract-white-wordmark");
assert.equal(light.creative.logo.availability.reason, "incompatible_surface");
assert.equal(light.creative.logo.value, null);
assert.equal(light.creative.template.availability.key, "unavailable", "Template relationships honor the same surface rule.");

// Missing and incompatible relationships are unavailable, never silently substituted.
const missingState = fixtureState();
missingState.posts[0].backgroundAssetId = "missing-background";
missingState.posts[0].wilmaAssetId = "unapproved-logo";
const missing = buildPostComposerDraft(missingState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(missing.availability.key, "partial");
assert.equal(missing.creative.background.requestedIds[0], "missing-background");
assert.equal(missing.creative.background.value, null);
assert.equal(missing.creative.background.availability.reason, "asset_unavailable");
assert.equal(missing.creative.wilma.value, null);
assert.equal(missing.creative.wilma.availability.reason, "asset_unavailable");
assert.notEqual(missing.creative.background.value?.id, "background-navy");

// Incomplete copy and hard content/creative failures remain blocking.
const blockedState = fixtureState();
blockedState.posts[0].body = "A guaranteed outcome for every person.";
blockedState.posts[0].guidelinesGate = {
  passed: false,
  hardFails: [{ ruleId: "raw-rule-must-not-project", category: "outcome_promise", message: "Prohibited promise" }]
};
blockedState.postImages[0].generationStatus = "failed";
const blocked = buildPostComposerDraft(blockedState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(blocked.readiness.state.key, "needs_fixes");
assert.equal(blocked.readiness.checks.find((check) => check.key === "content_outcome_claims").hardFailure, true);
assert.equal(blocked.readiness.checks.find((check) => check.key === "creative").hardFailure, true);
assert.doesNotMatch(JSON.stringify(blocked), /raw-rule-must-not-project/);

const incompleteState = fixtureState();
incompleteState.posts[0].body = "";
const incomplete = buildPostComposerDraft(incompleteState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(incomplete.sharedContent.body.state, "missing");
assert.equal(incomplete.readiness.checks.find((check) => check.key === "content_present").status.key, "blocked");

// Schedule truth is independent of approval and publication.
const missingScheduleState = fixtureState();
missingScheduleState.posts[0].scheduledFor = "";
const missingSchedule = buildPostComposerDraft(missingScheduleState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(missingSchedule.schedule.state, "missing");
assert.equal(missingSchedule.approval.state, "approved");
assert.notEqual(missingSchedule.readiness.publication.state, "published");

const invalidScheduleState = fixtureState();
invalidScheduleState.posts[0].scheduledFor = "not-a-date";
const invalidSchedule = buildPostComposerDraft(invalidScheduleState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(invalidSchedule.schedule.state, "invalid");
assert.equal(invalidSchedule.schedule.scheduledAt, null);

for (const [status, expected] of [["needs_review", "required"], ["pending", "pending"], ["approved", "approved"]]) {
  const approvalState = fixtureState();
  approvalState.posts[0].approvalStatus = status;
  delete approvalState.posts[0].approvedAt;
  approvalState.posts[0].status = "draft";
  approvalState.approvals = status === "approved" ? [{ id: "approval-explicit", type: "post", sourceId: POST_ID, status: "approved" }] : [];
  const projected = buildPostComposerDraft(approvalState, ACTOR, POST_ID, { generatedAt: NOW });
  assert.equal(projected.approval.state, expected);
  assert.equal(projected.schedule.state, "valid", "Approval does not rewrite schedule truth.");
  assert.notEqual(projected.readiness.publication.state, "published");
}

// Published truth requires explicit selected-channel evidence.
const publishedState = fixtureState();
publishedState.posts[0].status = "published";
publishedState.posts[0].perChannelPublishStatus = { linkedin: "published", instagram: "success" };
publishedState.posts[0].publishedAt = "2026-07-18T11:45:00.000Z";
const published = buildPostComposerDraft(publishedState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(published.readiness.state.key, "published");
assert.equal(published.readiness.publication.state, "published");
assert.equal(published.readiness.publication.explicitEvidence, true);
assert.equal(published.approval.state, "approved");
assert.equal(published.schedule.state, "valid", "Publication does not rewrite the stored schedule.");

const partialState = fixtureState();
partialState.posts[0].perChannelPublishStatus = { linkedin: "published", instagram: "failed" };
const partial = buildPostComposerDraft(partialState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(partial.readiness.publication.state, "partial");
assert.equal(partial.readiness.state.key, "needs_fixes");

// Missing and unknown actors fail closed; hidden Posts disclose no identifier or counts.
for (const actor of [{}, { authenticated: true, role: "unknown" }]) {
  const unavailable = buildPostComposerDraft(fixtureState(), actor, POST_ID, { generatedAt: NOW });
  assert.equal(unavailable.postId, null);
  assert.equal(unavailable.href, null);
  assert.equal(unavailable.availability.key, "unavailable");
  assert.equal(unavailable.availability.counts, null);
}
const hiddenState = fixtureState();
hiddenState.posts[0].ownerOnly = true;
const hidden = buildPostComposerDraft(hiddenState, ACTOR, POST_ID, { generatedAt: NOW });
assert.equal(hidden.postId, null);
assert.equal(hidden.sourceReferences.length, 0);

// Deterministic, order-independent, and deeply immutable.
assert.deepEqual(buildPostComposerDraft(fixtureState(), ACTOR, POST_ID, { generatedAt: NOW }), draft);
assert.deepEqual(buildPostComposerDraft(reverseArrays(fixtureState()), ACTOR, POST_ID, { generatedAt: NOW }), draft);
assertDeepFrozen(draft);
assert.throws(() => { draft.selectedChannels.push("x"); }, TypeError);

const sourceFiles = [
  "scripts/ui/view-models/post-composer-draft-sources.mjs",
  "scripts/ui/view-models/post-composer-draft.mjs"
];
const pureSource = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
for (const forbiddenImport of ["preview-server", "playwright", "browser", "social-publish-service", "provider", "storage.mjs", "database", ".css"]) {
  assert.doesNotMatch(pureSource, new RegExp(`from [\"'][^\"']*${forbiddenImport}`, "i"));
}
for (const forbiddenBehavior of [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\b(?:localStorage|sessionStorage)\b/,
  /\b(?:writeFile|appendFile|unlink|rename|mkdir)\s*\(/,
  /(?:^|[^\w])(?:send|publish|schedule|approve|save|update|delete|generateImage)\s*\(/im
]) assert.doesNotMatch(pureSource, forbiddenBehavior);
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /view-models\/post-composer-draft/, "CCX-302A must not add runtime or browser wiring.");

function benchmarkFixture() {
  const benchmark = fixtureState();
  const basePost = benchmark.posts[0];
  const baseImage = benchmark.postImages[0];
  benchmark.posts = Array.from({ length: 100 }, (_, index) => {
    const postId = `benchmark-composer-${String(index).padStart(3, "0")}`;
    const backgroundAssetId = index % 10 === 0 ? `missing-background-${index}` : "background-navy";
    return {
      ...structuredClone(basePost),
      id: postId,
      title: `Detailed draft ${index}`,
      body: `Detailed stored shared caption ${index}.`,
      targetChannels: ["linkedin", "instagram", "facebook", "x", "threads"],
      backgroundAssetId,
      channelVariants: [
        { id: `${postId}-linkedin`, channel: "linkedin", body: `LinkedIn ${index}`, assetIds: ["asset-other"] },
        { id: `${postId}-instagram`, channel: "instagram", body: `Instagram ${index}` },
        { id: `${postId}-facebook`, channel: "facebook", body: `Facebook ${index}` },
        { id: `${postId}-x`, channel: "x" },
        { id: `${postId}-threads`, channel: "threads" }
      ]
    };
  });
  benchmark.postImages = benchmark.posts.map((post, index) => ({ ...structuredClone(baseImage), id: `benchmark-image-${index}`, postId: post.id }));
  benchmark.approvals = benchmark.posts.map((post, index) => ({ id: `benchmark-approval-${index}`, type: "post", sourceId: post.id, status: "approved" }));
  benchmark.socialAccounts = ["linkedin", "instagram", "facebook", "x", "threads"].map((channel) => ({
    id: `benchmark-account-${channel}`, platform: channel, status: "connected", connected: true
  }));
  benchmark.runtime.livePostingGates = { linkedin: true, instagram: true, facebook: true, x: true, threads: true };
  return benchmark;
}

const benchmarkState = benchmarkFixture();
const benchmarkBefore = structuredClone(benchmarkState);
const startedAt = performance.now();
const benchmarkDrafts = benchmarkState.posts.map((post) => buildPostComposerDraft(benchmarkState, ACTOR, post.id, { generatedAt: NOW }));
const projectionMs = Number((performance.now() - startedAt).toFixed(3));
assert.deepEqual(benchmarkState, benchmarkBefore);
assert.equal(benchmarkDrafts.length, 100);
assert.equal(benchmarkDrafts.reduce((sum, item) => sum + item.channelVariants.length, 0), 500);
assert.equal(benchmarkDrafts.filter((item) => item.creative.availability.key === "partial").length, 10);
assert.ok(projectionMs < 15_000, `100-draft adapter benchmark took ${projectionMs}ms`);

const benchmark = {
  fixture: "deterministic-production-like-composer-adapter",
  draftsProjected: benchmarkDrafts.length,
  variants: benchmarkDrafts.reduce((sum, item) => sum + item.channelVariants.length, 0),
  assetRelationships: benchmarkDrafts.reduce((sum, item) => sum + item.availability.counts.assetRelationships, 0),
  unavailableRelationships: benchmarkDrafts.reduce((sum, item) => sum + item.availability.counts.unavailableRelationships, 0),
  readinessChecks: benchmarkDrafts.reduce((sum, item) => sum + item.availability.counts.readinessChecks, 0),
  projectionMs,
  serializedBytes: Buffer.byteLength(JSON.stringify(benchmarkDrafts)),
  editMutations: 0,
  selectionMutations: 0,
  variantWrites: 0,
  autosaves: 0,
  scheduleMutations: 0,
  approvalMutations: 0,
  publicationMutations: 0,
  imageGenerations: 0,
  providerCalls: 0,
  networkRequests: 0,
  storageWrites: 0,
  sourceMutations: 0,
  postMutations: 0
};

console.log("PASS test-vnext-post-composer-draft");
console.log(JSON.stringify(benchmark));
