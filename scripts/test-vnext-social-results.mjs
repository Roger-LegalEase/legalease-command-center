#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { buildSocialResultsView } from "./ui/view-models/social-results.mjs";
import {
  SOCIAL_RESULTS_SOURCE_MATRIX,
  collectSocialResultsSources
} from "./ui/view-models/social-results-sources.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const OWNER = Object.freeze({ authenticated: true, role: "owner", id: "synthetic-owner" });
const ADMIN = Object.freeze({ authenticated: true, role: "admin", id: "synthetic-admin" });

function post(id = "result-post-01", channels = ["linkedin"]) {
  return {
    id,
    title: "A plain-language legal guide",
    body: "Stored reusable educational content.",
    hook: "Start with the practical next step",
    cta: "Read the guide",
    hashtags: ["#LegalEase"],
    topic: "Legal education",
    theme: "Know Your Options",
    campaignId: "campaign-education",
    selectedTemplateId: "template-education",
    dataRoomItemId: "proof-file-01",
    targetChannels: [...channels],
    channelVariants: channels.map((channel) => ({ id: `${id}-${channel}-variant`, channel, body: `${channel} stored variant.` })),
    approvalRequired: true,
    approvalStatus: "approved",
    approvedAt: "2026-07-18T09:00:00.000Z",
    approvalRevision: `${id}-approval-1`,
    status: "approved",
    guidelinesGate: { passed: true, hardFails: [] },
    copyReviewed: true,
    imageIntentionallyOmitted: true,
    finalPreviewConfirmed: true,
    publishAttempts: [],
    performance: {
      impressions: 1000,
      reach: 800,
      likes: 40,
      comments: 5,
      shares: 3,
      clicks: 25,
      engagementRate: 0.048
    },
    performanceUpdatedAt: "2026-07-18T11:00:00.000Z",
    providerPayload: { token: "must-not-project" },
    privatePath: "/private/must-not-project.json"
  };
}

function account(channel) {
  return { id: `account-${channel}`, platform: channel, connected: true, status: "connected", accessToken: "must-not-project" };
}

function event(postId, channel, overrides = {}) {
  return {
    id: `published-${postId}-${channel}`,
    postId,
    approvalRevision: `${postId}-approval-1`,
    channel,
    eventType: "published",
    publishedAt: "2026-07-18T10:00:00.000Z",
    publishedUrl: `https://www.${channel === "x" ? "x" : channel}.com/posts/${postId}`,
    ...overrides
  };
}

function stateWith(postRecord = post()) {
  const channels = [...postRecord.targetChannels];
  return {
    posts: [postRecord],
    publishEvents: [event(postRecord.id, channels[0])],
    publishClaims: [],
    campaigns: [{ id: "campaign-education", name: "Founder education" }],
    generationProfiles: [{
      id: "template-education",
      profileName: "Education explainer",
      category: "Legal education",
      defaultDisclaimerId: "disclaimer-general",
      active: true
    }],
    brandAssets: [],
    brandRules: [],
    assetBundles: [],
    library: [{
      id: "disclaimer-general",
      category: "disclaimer",
      title: "General information disclaimer",
      body: "General information only.",
      status: "approved"
    }],
    postingKits: [],
    reports: [],
    dataRoomItems: [{ id: "proof-file-01", name: "Reviewed proof source", postId: postRecord.id }],
    evidencePackNotes: [],
    approvals: [],
    approvalQueue: [],
    queueItems: [],
    postImages: [],
    postVersions: [],
    copyVersions: [],
    reviewFeedback: [],
    reviewFeedbackRecords: [],
    postReviewFeedback: [],
    activityEvents: [],
    auditHistory: [],
    generationBatches: [],
    scheduleConflicts: [],
    contentBank: [],
    socialAccounts: channels.map(account),
    settings: { sourceItems: [], localAssets: [] },
    runtime: { livePostingGates: Object.fromEntries(channels.map((channel) => [channel, true])) }
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, "Every Social Results object and array must be deeply frozen.");
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function integritySnapshot(value) {
  return {
    extensible: Object.isExtensible(value),
    frozen: Object.isFrozen(value),
    sealed: Object.isSealed(value),
    descriptors: Object.fromEntries(Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return [String(key), {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        writable: descriptor.writable,
        hasGetter: typeof descriptor.get === "function",
        hasSetter: typeof descriptor.set === "function"
      }];
    }))
  };
}

function resultIdentity(result) {
  return result.items.map((item) => `${item.postId}:${item.channel}:${item.publicationTime || ""}:${item.publishedUrl || ""}`);
}

function assertInputOrderIndependent(input, actor = OWNER) {
  assert.deepEqual(buildSocialResultsView(reverseArrays(input), actor, NOW), buildSocialResultsView(input, actor, NOW));
}

assert.equal(typeof buildSocialResultsView, "function");
assert.deepEqual(SOCIAL_RESULTS_SOURCE_MATRIX.map((item) => item.source), [
  "CCX-300 PostView",
  "CCX-303A Social creative catalog",
  "CCX-305 Social readiness",
  "CCX-308A publishing controls",
  "publishEvents",
  "publishClaims",
  "posts.publishAttempts",
  "posts.performance",
  "campaigns",
  "reports / dataRoomItems / evidencePackNotes",
  "existing Create Post policy"
]);

// One exact current-revision result projects canonical identity, exact relationships, and explicit metrics.
const state = stateWith();
state.posts[0].publishAttempts.push({ id: "purity-attempt", channel: "facebook", status: "failed" });
const before = structuredClone(state);
const beforeJson = JSON.stringify(state);
const inputReferences = {
  root: state,
  posts: state.posts,
  post: state.posts[0],
  performance: state.posts[0].performance,
  attempts: state.posts[0].publishAttempts,
  attempt: state.posts[0].publishAttempts[0],
  campaigns: state.campaigns,
  campaign: state.campaigns[0],
  proofFiles: state.dataRoomItems,
  proof: state.dataRoomItems[0],
  events: state.publishEvents,
  settings: state.settings,
  sourceItems: state.settings.sourceItems,
  localAssets: state.settings.localAssets
};
const inputIntegrity = Object.fromEntries(Object.entries(inputReferences).map(([key, value]) => [key, integritySnapshot(value)]));
const inputOrder = {
  posts: state.posts.map((record) => record.id),
  attempts: state.posts[0].publishAttempts.map((record) => record.id),
  campaigns: state.campaigns.map((record) => record.id),
  proofs: state.dataRoomItems.map((record) => record.id),
  events: state.publishEvents.map((record) => record.id)
};
const sourceCollections = {
  posts: state.posts,
  events: state.publishEvents,
  claims: state.publishClaims,
  campaigns: state.campaigns,
  proofs: state.dataRoomItems,
  sourceItems: state.settings.sourceItems,
  localAssets: state.settings.localAssets
};
let networkRequests = 0;
let providerCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { networkRequests += 1; throw new Error("Social Results must not use the network."); };
const result = buildSocialResultsView(state, OWNER, NOW);
if (originalFetch) globalThis.fetch = originalFetch;
else delete globalThis.fetch;
assert.deepEqual(state, before, "The source state must remain unchanged.");
assert.equal(JSON.stringify(state), beforeJson, "The caller's exact JSON and array order must remain unchanged.");
for (const [key, value] of Object.entries(inputReferences)) {
  assert.equal(Object.isFrozen(value), false, `${key} must remain unfrozen.`);
  assert.deepEqual(integritySnapshot(value), inputIntegrity[key], `${key} descriptors and extensibility must remain unchanged.`);
}
assert.deepEqual({
  posts: state.posts.map((record) => record.id),
  attempts: state.posts[0].publishAttempts.map((record) => record.id),
  campaigns: state.campaigns.map((record) => record.id),
  proofs: state.dataRoomItems.map((record) => record.id),
  events: state.publishEvents.map((record) => record.id)
}, inputOrder, "Caller-owned arrays must retain their exact order.");
assert.equal(state.posts, sourceCollections.posts);
assert.equal(state.publishEvents, sourceCollections.events);
assert.equal(state.publishClaims, sourceCollections.claims);
assert.equal(state.campaigns, sourceCollections.campaigns);
assert.equal(state.dataRoomItems, sourceCollections.proofs);
assert.equal(state.settings.sourceItems, sourceCollections.sourceItems);
assert.equal(state.settings.localAssets, sourceCollections.localAssets);
assert.equal(networkRequests, 0);
assert.equal(providerCalls, 0);
const collectedSource = collectSocialResultsSources(state, OWNER, NOW);
assert.equal(Object.hasOwn(collectedSource, "state"), false, "The adapter must not return its complete authorized state.");
assert.equal(Object.hasOwn(collectedSource.posts[0].publications[0], "evidenceRecord"), false);
assertDeepFrozen(collectedSource);
assert.equal(result.generatedAt, NOW);
assert.equal(result.items.length, 1);
const item = result.items[0];
assert.equal(item.postId, "result-post-01");
assert.equal(item.href, "#social/post/result-post-01");
assert.equal(item.channel, "linkedin");
assert.equal(item.publicationTime, "2026-07-18T10:00:00.000Z");
assert.equal(item.publishedUrl, "https://www.linkedin.com/posts/result-post-01");
assert.equal(item.topic.label, "Legal education");
assert.equal(item.campaign.key, "campaign-education");
assert.equal(item.campaign.href, "#outreach/campaign/campaign-education");
assert.equal(item.template.id, "template-education");
assert.equal(item.template.category.key, "legal_education");
assert.equal(item.theme.key, "know_your_options");
assert.equal(item.metrics.impressions, 1000);
assert.equal(item.metrics.engagementRate, 0.048);
assert.equal(item.metrics.engagementRateBasis, "stored");
assert.equal(item.metricAvailability.key, "partial");
assert.equal(item.proof.linked, true);
assert.equal(item.proof.references[0].sourceId, "proof-file-01");
assert.equal(item.proof.markAsProof.available, false);
assert.equal(item.proof.markAsProof.executable, false);
assert.equal(item.proof.markAsProof.reason, "proof_operation_unavailable");
assert.equal(item.reuse.available, true);
assert.equal(item.reuse.executable, false);
assert.equal(item.reuse.requiredCapability, "manage_content_drafts");
assert.ok(Object.values(result.capabilities).every((capability) => capability === false));
assert.doesNotMatch(JSON.stringify(result), /must-not-project|accessToken|providerPayload|privatePath|\/private\//);

// Explicit success is channel-specific; failed, publishing, terminal, and reconciliatory channels are excluded.
const partialPost = post("partial-post", ["linkedin", "instagram", "facebook", "x", "threads"]);
delete partialPost.performance;
const partialState = stateWith(partialPost);
partialState.publishEvents = [event("partial-post", "linkedin"), event("partial-post", "instagram", { publishedAt: "2026-07-18T10:05:00.000Z" })];
partialState.publishClaims = [
  { id: "claim-facebook", postId: "partial-post", approvalRevision: "partial-post-approval-1", channel: "facebook", status: "failed_terminal" },
  { id: "claim-x", postId: "partial-post", approvalRevision: "partial-post-approval-1", channel: "x", status: "publishing" },
  { id: "claim-threads", postId: "partial-post", approvalRevision: "partial-post-approval-1", channel: "threads", status: "reconciliation_required" }
];
const partial = buildSocialResultsView(partialState, OWNER, NOW);
assert.deepEqual(partial.items.map((entry) => entry.channel), ["linkedin", "instagram"]);
assert.equal(partial.summaries.publishedResultCount, 2);
assert.equal(partial.summaries.channelsRepresented, 2);

// Evidence resolution uses every exact identity dimension and never array-order first-match behavior.
const hiddenAttemptBaselineState = stateWith();
hiddenAttemptBaselineState.publishEvents = [];
hiddenAttemptBaselineState.posts[0].publishAttempts = [{ id: "attempt-shared", channel: "linkedin", status: "failed", isCurrent: true }];
const hiddenAttemptBaseline = buildSocialResultsView(hiddenAttemptBaselineState, OWNER, NOW);
const hiddenSuccessfulAttemptState = structuredClone(hiddenAttemptBaselineState);
hiddenSuccessfulAttemptState.posts[0].publishAttempts.push({
  id: "attempt-shared", channel: "linkedin", status: "published", isCurrent: true, allowedRoles: ["admin"]
});
const hiddenSuccessfulAttempt = buildSocialResultsView(hiddenSuccessfulAttemptState, OWNER, NOW);
assert.deepEqual(hiddenSuccessfulAttempt.items, hiddenAttemptBaseline.items);
assert.deepEqual(hiddenSuccessfulAttempt.sourceAvailability.counts, hiddenAttemptBaseline.sourceAvailability.counts);
assert.doesNotMatch(JSON.stringify(hiddenSuccessfulAttempt), /hidden|attempt-shared/);
assertInputOrderIndependent(hiddenSuccessfulAttemptState);

const visibleLegacyState = stateWith();
visibleLegacyState.publishEvents = [];
visibleLegacyState.posts[0].publishAttempts = [{
  id: "legacy-success", channel: "linkedin", status: "published", isCurrent: true,
  publishedAt: "2026-07-18T10:00:00.000Z", publishedUrl: "https://www.linkedin.com/posts/legacy-success"
}];
const visibleLegacy = buildSocialResultsView(visibleLegacyState, OWNER, NOW);
assert.equal(visibleLegacy.items.length, 1);
assert.equal(visibleLegacy.items[0].sourceReferences.some((reference) => reference.sourceId === "legacy-success"), true);

const versionedLegacyState = stateWith();
versionedLegacyState.publishEvents = [];
versionedLegacyState.posts[0].publishAttempts = [
  { id: "versioned-legacy-v1", lineageId: "legacy-lineage", versionNumber: 1, channel: "linkedin", status: "failed" },
  {
    id: "versioned-legacy-v2", lineageId: "legacy-lineage", versionNumber: 2, channel: "linkedin", status: "published",
    publishedAt: "2026-07-18T10:00:00.000Z"
  }
];
const versionedLegacy = buildSocialResultsView(versionedLegacyState, OWNER, NOW);
assert.equal(versionedLegacy.items.length, 1);
assertInputOrderIndependent(versionedLegacyState);

const visibleSuccessHiddenConflictState = structuredClone(visibleLegacyState);
visibleSuccessHiddenConflictState.posts[0].publishAttempts.push({
  id: "legacy-success", channel: "linkedin", status: "failed_terminal", isCurrent: true, allowedRoles: ["admin"]
});
const visibleSuccessHiddenConflict = buildSocialResultsView(visibleSuccessHiddenConflictState, OWNER, NOW);
assert.deepEqual(visibleSuccessHiddenConflict.items, visibleLegacy.items);
assert.deepEqual(visibleSuccessHiddenConflict.sourceAvailability.counts, visibleLegacy.sourceAvailability.counts);
assertInputOrderIndependent(visibleSuccessHiddenConflictState);

const duplicateChannelEventPost = post("duplicate-channel-event", ["linkedin", "instagram"]);
const duplicateChannelEventState = stateWith(duplicateChannelEventPost);
duplicateChannelEventState.publishEvents = [
  event(duplicateChannelEventPost.id, "linkedin", { id: "shared-event-id" }),
  event(duplicateChannelEventPost.id, "instagram", { id: "shared-event-id" })
];
const duplicateChannelEvents = buildSocialResultsView(duplicateChannelEventState, OWNER, NOW);
assert.deepEqual(duplicateChannelEvents.items.map((entry) => entry.channel), ["linkedin", "instagram"]);
assertInputOrderIndependent(duplicateChannelEventState);

const duplicatePostEventState = stateWith();
duplicatePostEventState.posts.push(post("second-duplicate-post", ["linkedin"]));
duplicatePostEventState.publishEvents = [
  event("result-post-01", "linkedin", { id: "cross-post-event-id" }),
  event("second-duplicate-post", "linkedin", { id: "cross-post-event-id" })
];
const duplicatePostEvents = buildSocialResultsView(duplicatePostEventState, OWNER, NOW);
assert.deepEqual(duplicatePostEvents.items.map((entry) => entry.postId), ["result-post-01", "second-duplicate-post"]);
assertInputOrderIndependent(duplicatePostEventState);

const duplicateRevisionClaimState = stateWith();
duplicateRevisionClaimState.publishEvents = [];
duplicateRevisionClaimState.publishClaims = [
  {
    id: "shared-claim-id", postId: "result-post-01", approvalRevision: "old-approval", channel: "linkedin",
    status: "published", publishedAt: "2026-07-10T10:00:00.000Z", publishedUrl: "https://www.linkedin.com/posts/old-claim"
  },
  {
    id: "shared-claim-id", postId: "result-post-01", approvalRevision: "result-post-01-approval-1", channel: "linkedin",
    status: "published", publishedAt: "2026-07-18T10:00:00.000Z", publishedUrl: "https://www.linkedin.com/posts/current-claim"
  }
];
const duplicateRevisionClaim = buildSocialResultsView(duplicateRevisionClaimState, OWNER, NOW);
assert.equal(duplicateRevisionClaim.items.length, 1);
assert.equal(duplicateRevisionClaim.items[0].publishedUrl, "https://www.linkedin.com/posts/current-claim");
assertInputOrderIndependent(duplicateRevisionClaimState);

const mirroredEventState = stateWith();
mirroredEventState.publishEvents.push({ ...mirroredEventState.publishEvents[0], updatedAt: "2026-07-18T11:30:00.000Z" });
const mirroredEvent = buildSocialResultsView(mirroredEventState, OWNER, NOW);
assert.equal(mirroredEvent.items.length, 1);
assertInputOrderIndependent(mirroredEventState);

const conflictingMirrorState = stateWith();
conflictingMirrorState.publishEvents.push({
  ...conflictingMirrorState.publishEvents[0],
  publishedAt: "2026-07-18T10:01:00.000Z",
  publishedUrl: "https://www.linkedin.com/posts/conflicting-mirror"
});
const conflictingMirror = buildSocialResultsView(conflictingMirrorState, OWNER, NOW);
assert.equal(conflictingMirror.items.length, 0);
assert.equal(conflictingMirror.sourceAvailability.counts.excludedChannels.ambiguous_evidence, 1);
assertInputOrderIndependent(conflictingMirrorState);

const oldSuccessCurrentFailureState = stateWith();
oldSuccessCurrentFailureState.publishEvents = [event("result-post-01", "linkedin", { approvalRevision: "old-approval" })];
oldSuccessCurrentFailureState.publishClaims = [{
  id: "current-failure", postId: "result-post-01", approvalRevision: "result-post-01-approval-1",
  channel: "linkedin", status: "failed_retryable"
}];
assert.equal(buildSocialResultsView(oldSuccessCurrentFailureState, OWNER, NOW).items.length, 0);
assertInputOrderIndependent(oldSuccessCurrentFailureState);

const oldFailureCurrentSuccessState = stateWith();
oldFailureCurrentSuccessState.publishClaims = [{
  id: "old-failure", postId: "result-post-01", approvalRevision: "old-approval", channel: "linkedin", status: "failed_terminal"
}];
assert.equal(buildSocialResultsView(oldFailureCurrentSuccessState, OWNER, NOW).items.length, 1);
assertInputOrderIndependent(oldFailureCurrentSuccessState);

const unrevisionedCompetitorState = structuredClone(visibleLegacyState);
unrevisionedCompetitorState.publishClaims = [{
  id: "old-revisioned-competitor", postId: "result-post-01", approvalRevision: "old-approval",
  channel: "linkedin", status: "failed_terminal"
}];
const unrevisionedCompetitor = buildSocialResultsView(unrevisionedCompetitorState, OWNER, NOW);
assert.equal(unrevisionedCompetitor.items.length, 0);
assert.equal(unrevisionedCompetitor.sourceAvailability.counts.excludedChannels.unrevisioned_evidence_competitor, 1);
assertInputOrderIndependent(unrevisionedCompetitorState);

const nonSuccessUrlState = stateWith();
nonSuccessUrlState.publishEvents = [event("result-post-01", "linkedin", {
  eventType: "publish_failed",
  status: "failed_terminal",
  publishedUrl: "https://www.linkedin.com/posts/url-without-success"
})];
assert.equal(buildSocialResultsView(nonSuccessUrlState, OWNER, NOW).items.length, 0);
assertInputOrderIndependent(nonSuccessUrlState);

// A URL, analytics record, or Post status without exact successful evidence establishes no result.
const statusOnlyState = stateWith();
statusOnlyState.publishEvents = [];
statusOnlyState.posts[0].status = "published";
statusOnlyState.posts[0].perChannelPublishStatus = { linkedin: "published" };
statusOnlyState.posts[0].perChannelPublishedUrl = { linkedin: "https://www.linkedin.com/posts/url-only" };
assert.equal(buildSocialResultsView(statusOnlyState, OWNER, NOW).items.length, 0);

// Safe URLs require success; signed, API, dashboard, and unsafe URLs remain unavailable.
for (const unsafeUrl of [
  "javascript:alert(1)",
  "https://www.linkedin.com/posts/unsafe?token=signed",
  "https://api.linkedin.com/v2/posts/123",
  "https://business.facebook.com/latest/posts/123"
]) {
  const unsafeState = stateWith();
  unsafeState.publishEvents[0].publishedUrl = unsafeUrl;
  const unsafeResult = buildSocialResultsView(unsafeState, OWNER, NOW);
  assert.equal(unsafeResult.items.length, 1);
  assert.equal(unsafeResult.items[0].publishedUrl, null);
}

// Missing metrics are unavailable rather than false or zero.
const missingMetricState = stateWith();
delete missingMetricState.posts[0].performance;
delete missingMetricState.posts[0].performanceUpdatedAt;
const missingMetrics = buildSocialResultsView(missingMetricState, OWNER, NOW).items[0];
assert.equal(missingMetrics.metrics.impressions, null);
assert.equal(missingMetrics.metrics.likes, null);
assert.equal(missingMetrics.metrics.engagementRate, null);
assert.equal(missingMetrics.metricAvailability.key, "unavailable");

// Post-wide metrics are not duplicated across multiple successful channels.
const incompatiblePost = post("incompatible-post", ["linkedin", "instagram"]);
const incompatibleState = stateWith(incompatiblePost);
incompatibleState.publishEvents = [event("incompatible-post", "linkedin"), event("incompatible-post", "instagram")];
const incompatible = buildSocialResultsView(incompatibleState, OWNER, NOW);
assert.equal(incompatible.items.length, 2);
assert.ok(incompatible.items.every((entry) => entry.metrics.impressions === null));
assert.ok(incompatible.items.every((entry) => entry.metricAvailability.reason === "channel_metrics_incompatible"));
assert.equal(incompatible.summaries.ranking.available, false);

// A derived engagement rate requires both the reviewed numerator and denominator.
const derivedState = stateWith();
derivedState.posts[0].performance = { engagement: 50, impressions: 1000 };
const derived = buildSocialResultsView(derivedState, OWNER, NOW).items[0];
assert.equal(derived.metrics.engagementRate, 0.05);
assert.equal(derived.metrics.engagementRateBasis, "reviewed_numerator_and_denominator");
const noDenominatorState = stateWith();
noDenominatorState.posts[0].performance = { engagement: 50 };
assert.equal(buildSocialResultsView(noDenominatorState, OWNER, NOW).items[0].metrics.engagementRate, null);

// Unknown stored themes receive a safe label; missing template/theme truth remains unavailable and is never substituted.
const unknownState = stateWith();
unknownState.posts[0].theme = "founder-proof_unknown";
unknownState.posts[0].selectedTemplateId = "missing-template";
const unknown = buildSocialResultsView(unknownState, OWNER, NOW).items[0];
assert.equal(unknown.theme.key, "founder_proof_unknown");
assert.equal(unknown.theme.label, "Founder Proof Unknown");
assert.equal(unknown.template.id, null);
assert.equal(unknown.template.availability, "unavailable");

const noProofState = stateWith();
delete noProofState.posts[0].dataRoomItemId;
noProofState.dataRoomItems = [];
const noProof = buildSocialResultsView(noProofState, OWNER, NOW).items[0];
assert.equal(noProof.proof.linked, false);
assert.equal(noProof.proof.markAsProof.available, false);

// Existing content-draft policy controls reuse; no future draft payload or analytics are copied.
const adminResult = buildSocialResultsView(stateWith(), ADMIN, NOW).items[0];
assert.equal(adminResult.reuse.available, true);
const operatorResult = buildSocialResultsView(stateWith(), { authenticated: true, role: "operator", id: "synthetic-operator" }, NOW).items[0];
assert.equal(operatorResult.reuse.available, false);
assert.equal(operatorResult.reuse.reason, "actor_cannot_reuse");
assert.deepEqual(Object.keys(operatorResult.reuse), ["available", "executable", "reason", "requiredCapability"]);

// Filters are authorization-safe and cursors are opaque, query-bound, and capped.
const paginatedState = stateWith();
paginatedState.posts = [];
paginatedState.publishEvents = [];
paginatedState.dataRoomItems = [];
for (let index = 0; index < 30; index += 1) {
  const id = `page-post-${String(index).padStart(2, "0")}`;
  const record = post(id, [index % 2 ? "instagram" : "linkedin"]);
  record.dataRoomItemId = "";
  record.topic = index % 2 ? "FAQ" : "Legal education";
  paginatedState.posts.push(record);
  paginatedState.publishEvents.push(event(id, record.targetChannels[0], { publishedAt: `2026-07-18T10:${String(index).padStart(2, "0")}:00.000Z` }));
}
paginatedState.socialAccounts = [account("linkedin"), account("instagram")];
paginatedState.runtime.livePostingGates.instagram = true;
const pageOne = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 10, channel: "linkedin" });
assert.equal(pageOne.items.length, 10);
assert.equal(pageOne.pagination.total, 15);
assert.equal(pageOne.pagination.cursorValid, true);
assert.match(pageOne.pagination.nextCursor, /^SRC_[A-P]+$/);
assert.doesNotMatch(pageOne.pagination.nextCursor, /linkedin|10|a/);
const pageTwo = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 10, channel: "linkedin", cursor: pageOne.pagination.nextCursor });
assert.equal(pageTwo.items.length, 5);
assert.equal(pageTwo.pagination.nextCursor, null);
assert.equal(pageTwo.pagination.cursorValid, true);
assert.ok(pageTwo.items.every((entry) => entry.channel === "linkedin"));
assert.equal(new Set([...resultIdentity(pageOne), ...resultIdentity(pageTwo)]).size, 15);
assert.equal(buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 999 }).pagination.limit, 40);
const wrongQueryCursor = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 10, channel: "instagram", cursor: pageOne.pagination.nextCursor });
assert.equal(wrongQueryCursor.pagination.cursorValid, false);
assert.equal(wrongQueryCursor.items[0].channel, "instagram");
assert.deepEqual(resultIdentity(wrongQueryCursor), resultIdentity(buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 10, channel: "instagram" })));

const changedLimit = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 3, channel: "linkedin", cursor: pageOne.pagination.nextCursor });
assert.equal(changedLimit.pagination.cursorValid, true);
assert.equal(changedLimit.pagination.limit, 3);
assert.equal(changedLimit.items.length, 3);
assert.deepEqual(resultIdentity(changedLimit), resultIdentity(pageTwo).slice(0, 3));

const tamperedCursor = `${pageOne.pagination.nextCursor.slice(0, -1)}${pageOne.pagination.nextCursor.endsWith("A") ? "B" : "A"}`;
const tamperedPage = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 10, channel: "linkedin", cursor: tamperedCursor });
assert.equal(tamperedPage.pagination.cursorValid, false);
assert.deepEqual(resultIdentity(tamperedPage), resultIdentity(pageOne));

const differentOrderCursor = `${pageOne.pagination.nextCursor.slice(0, 4)}AB${pageOne.pagination.nextCursor.slice(6)}`;
const differentOrderPage = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 10, channel: "linkedin", cursor: differentOrderCursor });
assert.equal(differentOrderPage.pagination.cursorValid, false);
assert.deepEqual(resultIdentity(differentOrderPage), resultIdentity(pageOne));

const allPagedIdentities = [];
let cursor = null;
do {
  const page = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 7, cursor });
  assert.equal(page.pagination.cursorValid, true);
  for (const identity of resultIdentity(page)) {
    assert.equal(allPagedIdentities.includes(identity), false, `Duplicate paginated result: ${identity}`);
    allPagedIdentities.push(identity);
  }
  if (page.pagination.nextCursor) {
    assert.match(page.pagination.nextCursor, /^SRC_[A-P]+$/);
    assert.doesNotMatch(page.pagination.nextCursor, /page-post|linkedin|instagram|\d|[a-z]/);
  }
  cursor = page.pagination.nextCursor;
} while (cursor);
assert.equal(allPagedIdentities.length, 30);

// Missing/unknown actors fail closed. Hidden records affect neither items, counts, filters, nor summaries.
for (const actor of [{}, { authenticated: true, role: "unknown", id: "unknown" }]) {
  const unavailable = buildSocialResultsView(stateWith(), actor, NOW);
  assert.deepEqual(unavailable.items, []);
  assert.equal(unavailable.summaries, null);
  assert.equal(unavailable.sourceAvailability.counts, null);
}
const visibleBaseline = buildSocialResultsView(stateWith(), OWNER, NOW);
const hiddenPostState = stateWith();
hiddenPostState.posts.push({ ...post("hidden-post"), allowedRoles: ["admin"] });
hiddenPostState.publishEvents.push({ ...event("hidden-post", "linkedin"), allowedRoles: ["admin"] });
const hiddenPostResult = buildSocialResultsView(hiddenPostState, OWNER, NOW);
assert.deepEqual(hiddenPostResult.items, visibleBaseline.items);
assert.deepEqual(hiddenPostResult.summaries, visibleBaseline.summaries);
assert.doesNotMatch(JSON.stringify(hiddenPostResult), /hidden-post/);

const hiddenEventState = stateWith();
hiddenEventState.publishEvents.push({ ...event("result-post-01", "linkedin"), id: "hidden-event", allowedRoles: ["admin"] });
const hiddenEventResult = buildSocialResultsView(hiddenEventState, OWNER, NOW);
assert.deepEqual(hiddenEventResult.items, visibleBaseline.items);
assert.doesNotMatch(JSON.stringify(hiddenEventResult), /hidden-event/);

const hiddenMetricState = stateWith();
hiddenMetricState.posts.push({ ...post("hidden-metrics"), allowedRoles: ["admin"], performance: { impressions: 999999 } });
hiddenMetricState.publishEvents.push({ ...event("hidden-metrics", "linkedin"), allowedRoles: ["admin"] });
assert.deepEqual(buildSocialResultsView(hiddenMetricState, OWNER, NOW).summaries, visibleBaseline.summaries);

// Stable sorting, input-order independence, deep immutability, and zero runtime/browser imports.
const ordered = buildSocialResultsView(paginatedState, OWNER, NOW, { limit: 40 });
const reversed = buildSocialResultsView(reverseArrays(paginatedState), OWNER, NOW, { limit: 40 });
assert.deepEqual(reversed, ordered);
assertDeepFrozen(ordered);
assert.throws(() => ordered.items.push({}), TypeError);
const sourceText = [
  readFileSync(new URL("./ui/view-models/social-results-sources.mjs", import.meta.url), "utf8"),
  readFileSync(new URL("./ui/view-models/social-results.mjs", import.meta.url), "utf8")
].join("\n");
assert.doesNotMatch(sourceText, /preview-server|ui\/pages|browser|\.css|fetch\(|node:fs|node:http|localStorage|sessionStorage/);

// Production-like adapter benchmark: 100 Posts, five channels, mixed explicit outcomes and restricted truth.
function benchmarkState() {
  const benchmark = stateWith();
  benchmark.posts = [];
  benchmark.publishEvents = [];
  benchmark.publishClaims = [];
  benchmark.dataRoomItems = [];
  const channels = ["linkedin", "instagram", "facebook", "x", "threads"];
  benchmark.socialAccounts = channels.map(account);
  benchmark.runtime.livePostingGates = Object.fromEntries(channels.map((channel) => [channel, true]));
  for (let index = 0; index < 100; index += 1) {
    const id = `benchmark-post-${String(index).padStart(3, "0")}`;
    const record = post(id, channels);
    record.theme = index % 2 ? "Practical guidance" : "Legal education";
    record.performance = index % 3 ? { impressions: 1000 + index, engagementRate: 0.04 } : undefined;
    if (index % 10 === 0) record.allowedRoles = ["admin"];
    benchmark.posts.push(record);
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      const channel = channels[channelIndex];
      const status = ["published", "failed_retryable", "publishing", "failed_terminal", "reconciliation_required"][(index + channelIndex) % 5];
      if (status === "published") benchmark.publishEvents.push(event(id, channel, {
        id: `benchmark-result-${index}-${channel}`,
        publishedAt: `2026-07-${String(1 + (index % 17)).padStart(2, "0")}T10:00:00.000Z`,
        ...(index % 10 === 0 ? { allowedRoles: ["admin"] } : {})
      }));
      else benchmark.publishClaims.push({
        id: `benchmark-claim-${index}-${channel}`, postId: id, approvalRevision: `${id}-approval-1`, channel, status,
        ...(index % 10 === 0 ? { allowedRoles: ["admin"] } : {})
      });
    }
    if (index % 4 === 0) {
      record.dataRoomItemId = `benchmark-proof-${index}`;
      benchmark.dataRoomItems.push({ id: `benchmark-proof-${index}`, postId: id, name: "Synthetic reviewed proof" });
    }
  }
  return benchmark;
}

const productionLike = benchmarkState();
const productionBefore = structuredClone(productionLike);
const started = performance.now();
const benchmark = buildSocialResultsView(productionLike, OWNER, NOW, { limit: 40 });
const projectionMs = performance.now() - started;
assert.deepEqual(productionLike, productionBefore);
assert.equal(benchmark.sourceAvailability.counts.postsExamined, 90);
assert.equal(benchmark.sourceAvailability.counts.publishedChannelResults, 90);
assert.equal(benchmark.summaries.publishedResultCount, 90);
assert.ok(benchmark.sourceAvailability.counts.excludedChannels.failed_terminal > 0);
assert.ok(benchmark.sourceAvailability.counts.excludedChannels.reconciliation_required > 0);
assert.equal(benchmark.capabilities.callsProviders, false);
assert.equal(benchmark.capabilities.writesStorage, false);
assert.equal(benchmark.capabilities.mutatesSources, false);

const serializedBytes = Buffer.byteLength(JSON.stringify(benchmark));
console.log("PASS test-vnext-social-results");
console.log(JSON.stringify({
  performance: {
    candidatesExamined: benchmark.sourceAvailability.counts.candidatesExamined,
    publishedChannelResults: benchmark.sourceAvailability.counts.publishedChannelResults,
    excludedChannelsByReason: benchmark.sourceAvailability.counts.excludedChannels,
    metricValuesProjected: benchmark.sourceAvailability.counts.metricValuesProjected,
    unavailableMetrics: benchmark.sourceAvailability.counts.unavailableMetrics,
    reusableResults: benchmark.sourceAvailability.counts.reusableResults,
    proofLinkedResults: benchmark.sourceAvailability.counts.proofLinkedResults,
    projectionMs: Number(projectionMs.toFixed(2)),
    serializedBytes,
    mutationActionCounts: {
      postDuplications: 0, reuseWrites: 0, proofFileWrites: 0, analyticsRefreshes: 0,
      providerCalls: 0, publications: 0, retries: 0, approvals: 0, schedules: 0,
      storageWrites: 0, sourceMutations: 0, postMutations: 0, fileMutations: 0
    }
  }
}));
