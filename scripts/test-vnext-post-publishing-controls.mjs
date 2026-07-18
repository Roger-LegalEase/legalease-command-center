#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  buildPostPublishingControls,
  POST_PUBLISHING_CHANNEL_STATES,
  POST_PUBLISHING_CONTROL_STATES
} from "./ui/view-models/post-publishing-controls.mjs";
import {
  collectPostPublishingControlSources,
  POST_PUBLISHING_CONTROL_SOURCE_MATRIX,
  resolveControlledPublishingAuthority
} from "./ui/view-models/post-publishing-control-sources.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const POST_ID = "publishing-post-01";
const OWNER = Object.freeze({ authenticated: true, role: "owner", id: "synthetic-owner" });
const ADMIN = Object.freeze({ authenticated: true, role: "admin", id: "synthetic-admin" });
const OPERATOR = Object.freeze({ authenticated: true, role: "operator", id: "synthetic-operator" });
const VIEWER = Object.freeze({ authenticated: true, role: "viewer", id: "synthetic-viewer" });

function fixtureState() {
  return {
    posts: [{
      id: POST_ID,
      title: "Understand the next step",
      body: "Stored educational caption.",
      hook: "Clarity starts here",
      cta: "Read the guide",
      hashtags: ["#LegalEase"],
      targetChannels: ["linkedin"],
      channelVariants: [{ id: "variant-linkedin", channel: "linkedin", body: "LinkedIn-specific caption." }],
      approvalRequired: true,
      approvalStatus: "approved",
      approvedAt: "2026-07-18T11:00:00.000Z",
      approvalRevision: "approval-1",
      status: "approved",
      perChannelPublishStatus: {},
      perChannelPublishedUrl: {},
      guidelinesGate: { passed: true, hardFails: [] },
      copyReviewed: true,
      imageIntentionallyOmitted: true,
      finalPreviewConfirmed: true,
      manualPublishingAvailable: false,
      publishAttempts: [],
      updatedAt: "2026-07-18T11:30:00.000Z",
      providerPayload: { accessToken: "must-not-project" },
      privatePath: "/private/must-not-project.json",
      signedUrl: "https://example.com/private?token=must-not-project"
    }],
    postImages: [],
    postVersions: [],
    copyVersions: [],
    brandAssets: [],
    socialTemplates: [],
    postTemplates: [],
    contentTemplates: [],
    creativeTemplates: [],
    postingKits: [],
    generationProfiles: [],
    assetBundles: [],
    brandRules: [],
    library: [],
    socialAccounts: [{ id: "account-linkedin", platform: "linkedin", status: "connected", connected: true, accountId: "safe-account-reference", accessToken: "must-not-project" }],
    approvals: [],
    approvalQueue: [],
    queueItems: [],
    reviewFeedback: [],
    reviewFeedbackRecords: [],
    postReviewFeedback: [],
    publishEvents: [],
    publishClaims: [],
    scheduleConflicts: [],
    contentBank: [],
    reports: [],
    dataRoomItems: [],
    evidencePackNotes: [],
    activityEvents: [],
    auditHistory: [],
    generationBatches: [],
    settings: { sourceItems: [], localAssets: [] },
    runtime: { livePostingGates: { linkedin: true } }
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, "Every publishing-control object and array must be frozen.");
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function controlsFor(state, actor = OWNER, postId = POST_ID, now = NOW) {
  return buildPostPublishingControls(state, actor, postId, now);
}

function firstChannel(result) {
  return result.channels[0];
}

assert.equal(typeof buildPostPublishingControls, "function");
assert.equal(typeof collectPostPublishingControlSources, "function");
assert.deepEqual(Object.keys(POST_PUBLISHING_CONTROL_STATES), [
  "needs_connection", "connected_publishing_off", "needs_attention", "ready_to_publish",
  "partially_published", "published", "manual_publishing_available", "unavailable"
]);
assert.deepEqual(Object.keys(POST_PUBLISHING_CHANNEL_STATES), [
  "not_connected", "connected_publishing_off", "needs_attention", "ready_to_publish",
  "scheduled", "publishing", "published", "failed", "unavailable"
]);
assert.deepEqual(POST_PUBLISHING_CONTROL_SOURCE_MATRIX.map((item) => item.source), [
  "CCX-300 PostView",
  "CCX-302A ComposerDraftView",
  "CCX-304A Post channel variants",
  "CCX-305 Social readiness",
  "CCX-306A Social schedule plan",
  "CCX-307A Post review plan",
  "socialAccounts",
  "runtime.livePostingGates",
  "Post result maps / publishEvents",
  "Post publishAttempts / publishClaims",
  "Post manualPublishingAvailable",
  "existing controlled publishing policy"
]);

assert.deepEqual(resolveControlledPublishingAuthority("owner"), {
  available: true, allowed: true, requiredCapability: "social_publish", reason: null
});
for (const role of ["admin", "operator", "viewer"]) {
  assert.deepEqual(resolveControlledPublishingAuthority(role), {
    available: true, allowed: false, requiredCapability: "social_publish", reason: null
  });
}
const mismatchedPolicy = resolveControlledPublishingAuthority("owner", {
  requiredCapabilitiesForEndpoint: (_method, path) => path === "/api/publishing/run" ? ["mutate_state"] : ["social_publish"],
  canPerformEndpoint: (_role, _method, path) => ({
    ok: true,
    requiredCapabilities: path === "/api/publishing/run" ? ["mutate_state"] : ["social_publish"]
  })
});
assert.deepEqual(mismatchedPolicy, {
  available: false, allowed: false, requiredCapability: "social_publish", reason: "publication_policy_unavailable"
});

// Approved and otherwise ready: exact Post identity/link and read-only eligibility.
const state = fixtureState();
const before = structuredClone(state);
const ready = controlsFor(state);
assert.deepEqual(state, before, "Publishing controls must not mutate source truth.");
assert.equal(ready.postId, POST_ID);
assert.equal(ready.href, "#social/post/publishing-post-01");
assert.equal(ready.generatedAt, NOW);
assert.equal(ready.state.key, "ready_to_publish");
assert.equal(firstChannel(ready).state.key, "ready_to_publish");
assert.equal(firstChannel(ready).connectionState.key, "connected");
assert.equal(firstChannel(ready).publishingGateState.key, "enabled");
assert.equal(firstChannel(ready).reviewState.key, "approved");
assert.equal(firstChannel(ready).publicationState.key, "no_attempt");
assert.equal(firstChannel(ready).eligibility.available, true);
assert.equal(firstChannel(ready).eligibility.executable, false);
assert.equal(firstChannel(ready).eligibility.reason, "eligible_for_publication");
assert.equal(firstChannel(ready).eligibility.requiredCapability, "social_publish");
assert.ok(Object.values(ready.capabilities).every((value) => value === false));
assert.ok(ready.guidance.every((item) => item.executable === false));
assert.doesNotMatch(JSON.stringify(ready), /must-not-project|\/private\/|accessToken|providerPayload|signedUrl|safe-account-reference/);

// Existing controlled routes share social_publish: owner is informationally eligible; admin/operator are not.
for (const actor of [ADMIN, OPERATOR]) {
  const denied = controlsFor(fixtureState(), actor);
  assert.equal(denied.postId, POST_ID);
  assert.equal(firstChannel(denied).eligibility.available, false);
  assert.equal(firstChannel(denied).eligibility.reason, "actor_cannot_publish");
  assert.equal(firstChannel(denied).eligibility.requiredCapability, "social_publish");
  assert.equal(firstChannel(denied).eligibility.executable, false);
}
assert.doesNotMatch(JSON.stringify(ready), /\/api\/linkedin\/publish|\/api\/publishing\/run|publish-now/);

// Durable connection, gate, review, and readiness remain independent.
const disconnectedState = fixtureState();
disconnectedState.socialAccounts = [];
const disconnected = controlsFor(disconnectedState);
assert.equal(disconnected.state.key, "needs_connection");
assert.equal(firstChannel(disconnected).state.key, "not_connected");
assert.equal(firstChannel(disconnected).eligibility.reason, "channel_not_connected");

const gateOffState = fixtureState();
gateOffState.runtime.livePostingGates.linkedin = false;
const gateOff = controlsFor(gateOffState);
assert.equal(gateOff.state.key, "connected_publishing_off");
assert.equal(firstChannel(gateOff).connectionState.key, "connected");
assert.equal(firstChannel(gateOff).publishingGateState.key, "off");
assert.equal(firstChannel(gateOff).eligibility.reason, "publishing_off");

const gateMissingState = fixtureState();
gateMissingState.runtime.livePostingGates = {};
const gateMissing = controlsFor(gateMissingState);
assert.equal(firstChannel(gateMissing).state.key, "unavailable");
assert.equal(firstChannel(gateMissing).eligibility.reason, "gate_source_unavailable");

const reviewBlockedState = fixtureState();
reviewBlockedState.posts[0].approvalStatus = "awaiting_approval";
reviewBlockedState.posts[0].status = "draft";
delete reviewBlockedState.posts[0].approvedAt;
const reviewBlocked = controlsFor(reviewBlockedState);
assert.equal(firstChannel(reviewBlocked).eligibility.reason, "review_not_approved");
assert.equal(firstChannel(reviewBlocked).eligibility.available, false);

const readinessBlockedState = fixtureState();
readinessBlockedState.posts[0].approvalRequired = false;
readinessBlockedState.posts[0].body = "";
const readinessBlocked = controlsFor(readinessBlockedState);
assert.equal(firstChannel(readinessBlocked).eligibility.reason, "readiness_blocked");
assert.equal(firstChannel(readinessBlocked).eligibility.available, false);

// A stored schedule remains separate from publication and is not an executable publication opportunity.
const scheduledState = fixtureState();
Object.assign(scheduledState.posts[0], {
  status: "scheduled",
  scheduledFor: "2026-07-20T14:00:00.000Z",
  timezone: "UTC",
  scheduleStatus: "valid",
  perChannelPublishStatus: { linkedin: "scheduled" }
});
const scheduled = controlsFor(scheduledState);
assert.equal(firstChannel(scheduled).state.key, "scheduled");
assert.equal(firstChannel(scheduled).publicationState.key, "scheduled");
assert.equal(firstChannel(scheduled).eligibility.reason, "scheduled_publication_pending");
assert.equal(scheduled.approval.state.key, "approved");
assert.equal(scheduled.publicationSummary.counts.publishedChannels, 0);

// Attempts and explicit results: in progress, successful, failed, partial, and stable retry isolation.
const inProgressState = fixtureState();
inProgressState.publishClaims = [{
  id: "claim-linkedin-1", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing", isCurrent: true,
  providerPayload: { accessToken: "must-not-project" }
}];
const inProgress = controlsFor(inProgressState);
assert.equal(firstChannel(inProgress).state.key, "publishing");
assert.equal(firstChannel(inProgress).eligibility.reason, "attempt_in_progress");
assert.equal(firstChannel(inProgress).attemptReference.sourceId, "claim-linkedin-1");
assert.doesNotMatch(JSON.stringify(inProgress), /providerPayload|accessToken/);

for (const staleMapStatus of ["failed", "scheduled"]) {
  const claimWinsState = fixtureState();
  claimWinsState.posts[0].perChannelPublishStatus = { linkedin: staleMapStatus };
  claimWinsState.publishClaims = [{
    id: `claim-wins-${staleMapStatus}`, postId: POST_ID, approvalRevision: "approval-1",
    channel: "linkedin", status: "publish_claimed"
  }];
  const claimWins = controlsFor(claimWinsState);
  assert.equal(firstChannel(claimWins).publicationState.key, "publishing");
  assert.equal(firstChannel(claimWins).publicationState.retryEligible, false);
  assert.equal(firstChannel(claimWins).eligibility.reason, "attempt_in_progress");
}

const publishedState = fixtureState();
publishedState.posts[0].perChannelPublishStatus = { linkedin: "posted" };
publishedState.posts[0].perChannelPublishedUrl = { linkedin: "https://www.linkedin.com/feed/update/urn:li:activity:123" };
const published = controlsFor(publishedState);
assert.equal(published.state.key, "published");
assert.equal(firstChannel(published).state.key, "published");
assert.equal(firstChannel(published).publishedUrl, "https://www.linkedin.com/feed/update/urn:li:activity:123");
assert.equal(firstChannel(published).eligibility.reason, "already_published");
assert.equal(firstChannel(published).publicationState.retryEligible, false);
assert.equal(published.manualFallback.state, "not_needed");

const currentRuntimePublishedState = fixtureState();
currentRuntimePublishedState.posts[0].status = "posted";
currentRuntimePublishedState.posts[0].publishedUrl = "https://www.linkedin.com/posts/runtime-result";
const currentRuntimePublished = controlsFor(currentRuntimePublishedState);
assert.equal(firstChannel(currentRuntimePublished).publicationState.key, "published");
assert.equal(firstChannel(currentRuntimePublished).publishedUrl, "https://www.linkedin.com/posts/runtime-result");

const failedState = fixtureState();
failedState.posts[0].perChannelPublishStatus = { linkedin: "failed" };
failedState.posts[0].publishAttempts = [{ id: "attempt-failed", channel: "linkedin", status: "failed", isCurrent: true, providerError: "must-not-project" }];
const failed = controlsFor(failedState);
assert.equal(firstChannel(failed).state.key, "failed");
assert.equal(firstChannel(failed).publicationState.key, "failed_retryable");
assert.equal(firstChannel(failed).eligibility.available, true);
assert.equal(firstChannel(failed).eligibility.reason, "eligible_for_retry");
assert.equal(firstChannel(failed).publicationState.retryEligible, true);
assert.doesNotMatch(JSON.stringify(failed), /providerError|must-not-project/);

const partialState = fixtureState();
partialState.posts[0].targetChannels = ["instagram", "linkedin"];
partialState.posts[0].channelVariants.push({ id: "variant-instagram", channel: "instagram", body: "Instagram copy." });
partialState.posts[0].perChannelPublishStatus = { linkedin: "posted", instagram: "failed" };
partialState.posts[0].perChannelPublishedUrl = { linkedin: "https://www.linkedin.com/posts/123" };
partialState.socialAccounts.push({ id: "account-instagram", platform: "instagram", status: "connected", connected: true });
partialState.runtime.livePostingGates.instagram = true;
const partial = controlsFor(partialState);
assert.equal(partial.state.key, "partially_published");
assert.deepEqual(partial.channels.map((item) => item.channel), ["linkedin", "instagram"]);
assert.equal(partial.channels[0].publicationState.key, "published");
assert.equal(partial.channels[0].publicationState.retryEligible, false);
assert.equal(partial.channels[1].publicationState.key, "failed_retryable");
assert.equal(partial.channels[1].publicationState.retryEligible, true);
assert.ok(partial.guidance.some((item) => item.key === "preserve_success"));

// Durable claims are scoped to the exact current approval revision; historical revisions cannot control it.
const revisionState = fixtureState();
revisionState.publishClaims = [
  { id: "claim-old-failed", postId: POST_ID, approvalRevision: "approval-0", channel: "linkedin", status: "failed_retryable" },
  { id: "claim-current-publishing", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing" }
];
const revisionScoped = controlsFor(revisionState);
assert.equal(firstChannel(revisionScoped).publicationState.key, "publishing");
assert.equal(firstChannel(revisionScoped).publicationState.retryEligible, false);
assert.equal(firstChannel(revisionScoped).publicationState.historicalClaimsExcluded, 1);
assert.equal(firstChannel(revisionScoped).attemptReference.sourceId, "claim-current-publishing");
assert.deepEqual(controlsFor(reverseArrays(revisionState)), revisionScoped);

const oldPublishedState = fixtureState();
oldPublishedState.posts[0].approvalRevision = "approval-2";
oldPublishedState.publishClaims = [{
  id: "claim-old-published", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "published"
}];
const oldPublished = controlsFor(oldPublishedState);
assert.equal(firstChannel(oldPublished).publicationState.key, "no_attempt");
assert.equal(firstChannel(oldPublished).publicationState.historicalClaimsExcluded, 1);
assert.equal(firstChannel(oldPublished).eligibility.reason, "eligible_for_publication");

const unavailableRevisionState = fixtureState();
delete unavailableRevisionState.posts[0].approvalRevision;
delete unavailableRevisionState.posts[0].approvedAt;
unavailableRevisionState.posts[0].approvalStatus = "not_requested";
unavailableRevisionState.posts[0].status = "draft";
unavailableRevisionState.publishClaims = [
  { id: "claim-unknown-revision-a", postId: POST_ID, approvalRevision: "approval-a", channel: "linkedin", status: "failed_retryable" },
  { id: "claim-unknown-revision-b", postId: POST_ID, approvalRevision: "approval-b", channel: "linkedin", status: "publishing" }
];
const unavailableRevision = controlsFor(unavailableRevisionState);
assert.equal(firstChannel(unavailableRevision).publicationState.key, "ambiguous");
assert.equal(firstChannel(unavailableRevision).publicationState.retryEligible, false);
assert.equal(firstChannel(unavailableRevision).eligibility.reason, "ambiguous_attempt");

const matchingClaimState = fixtureState();
matchingClaimState.publishClaims = [{
  id: "claim-current-retryable", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "failed_retryable"
}];
const matchingClaim = controlsFor(matchingClaimState);
assert.equal(firstChannel(matchingClaim).publicationState.key, "failed_retryable");
assert.equal(firstChannel(matchingClaim).eligibility.reason, "eligible_for_retry");

const conflictingClaimsState = fixtureState();
conflictingClaimsState.publishClaims = [
  { id: "claim-conflict", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing" },
  { id: "claim-conflict", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "failed_retryable" }
];
const conflictingClaims = controlsFor(conflictingClaimsState);
assert.equal(firstChannel(conflictingClaims).publicationState.key, "ambiguous");
assert.equal(firstChannel(conflictingClaims).eligibility.reason, "ambiguous_attempt");
assert.equal(firstChannel(conflictingClaims).publicationState.retryEligible, false);

const multipleCurrentClaimsState = fixtureState();
multipleCurrentClaimsState.publishClaims = [
  { id: "claim-current-a", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing" },
  { id: "claim-current-b", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing" }
];
const multipleCurrentClaims = controlsFor(multipleCurrentClaimsState);
assert.equal(firstChannel(multipleCurrentClaims).publicationState.key, "ambiguous");
assert.equal(firstChannel(multipleCurrentClaims).eligibility.reason, "ambiguous_attempt");
assert.equal(firstChannel(multipleCurrentClaims).publicationState.retryEligible, false);

const mirroredClaimState = fixtureState();
mirroredClaimState.publishClaims = [
  { id: "claim-mirror", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing", updatedAt: "2026-07-18T10:00:00.000Z" },
  { id: "claim-mirror", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing", updatedAt: "2026-07-18T11:00:00.000Z" }
];
const mirroredClaim = controlsFor(mirroredClaimState);
assert.equal(firstChannel(mirroredClaim).publicationState.key, "publishing");
assert.equal(firstChannel(mirroredClaim).attemptReference.sourceId, "claim-mirror");

const hiddenClaimBaseline = controlsFor(fixtureState());
const hiddenMatchingClaimState = fixtureState();
hiddenMatchingClaimState.publishClaims = [{
  id: "hidden-matching-claim", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin",
  status: "publishing", allowedRoles: ["admin"]
}];
const hiddenMatchingClaim = controlsFor(hiddenMatchingClaimState);
assert.deepEqual(hiddenMatchingClaim.channels, hiddenClaimBaseline.channels);
assert.deepEqual(hiddenMatchingClaim.availability.counts, hiddenClaimBaseline.availability.counts);
assert.equal(hiddenMatchingClaim.performance.candidatesExamined, hiddenClaimBaseline.performance.candidatesExamined);
assert.doesNotMatch(JSON.stringify(hiddenMatchingClaim), /hidden-matching-claim/);

// Strong current result/claim truth precedes legacy attempts and Post status fallbacks.
const eventWinsState = fixtureState();
eventWinsState.posts[0].perChannelPublishStatus = { linkedin: "failed" };
eventWinsState.publishEvents = [{
  id: "result-current-published", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin",
  eventType: "published", statusAfter: "failed", publishedUrl: "https://www.linkedin.com/posts/current-result"
}];
const eventWins = controlsFor(eventWinsState);
assert.equal(firstChannel(eventWins).publicationState.key, "published");
assert.equal(firstChannel(eventWins).publishedUrl, "https://www.linkedin.com/posts/current-result");
assert.equal(firstChannel(eventWins).publicationState.retryEligible, false);
assert.equal(firstChannel(eventWins).eligibility.reason, "already_published");

const multiGlobalState = fixtureState();
multiGlobalState.posts[0].status = "published";
multiGlobalState.posts[0].targetChannels = ["linkedin", "instagram"];
multiGlobalState.posts[0].channelVariants.push({ id: "variant-instagram", channel: "instagram", body: "Instagram copy." });
multiGlobalState.socialAccounts.push({ id: "account-instagram", platform: "instagram", status: "connected", connected: true });
multiGlobalState.runtime.livePostingGates.instagram = true;
const multiGlobal = controlsFor(multiGlobalState);
assert.ok(multiGlobal.channels.every((channel) => channel.publicationState.key === "no_attempt"));
assert.equal(multiGlobal.publicationSummary.counts.publishedChannels, 0);

const claimPublishedState = fixtureState();
claimPublishedState.posts[0].perChannelPublishStatus = { linkedin: "failed" };
claimPublishedState.posts[0].publishAttempts = [{ id: "stale-failed-attempt", channel: "linkedin", status: "failed" }];
claimPublishedState.publishClaims = [{
  id: "claim-current-published", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin",
  status: "published", externalPostUrl: "https://www.linkedin.com/posts/claim-result"
}];
const claimPublished = controlsFor(claimPublishedState);
assert.equal(firstChannel(claimPublished).publicationState.key, "published");
assert.equal(firstChannel(claimPublished).publicationState.retryEligible, false);
assert.equal(firstChannel(claimPublished).eligibility.reason, "already_published");

const reconciliationConflictState = fixtureState();
reconciliationConflictState.publishClaims = [{
  id: "claim-current-reconcile", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "reconciliation_required"
}];
reconciliationConflictState.publishEvents = [{
  id: "result-current-success-conflict", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "published"
}];
const reconciliationConflict = controlsFor(reconciliationConflictState);
assert.equal(firstChannel(reconciliationConflict).state.key, "needs_attention");
assert.equal(firstChannel(reconciliationConflict).publicationState.key, "reconciliation_required");
assert.equal(firstChannel(reconciliationConflict).publicationState.authorityConflict, true);
assert.equal(firstChannel(reconciliationConflict).publicationState.retryEligible, false);
assert.equal(firstChannel(reconciliationConflict).eligibility.reason, "reconciliation_required");

// Full durable and legacy lifecycle truth is preserved without broadening retry eligibility.
const lifecycleCases = [
  ["publish_claimed", "publishing", "attempt_in_progress", false],
  ["publishing", "publishing", "attempt_in_progress", false],
  ["published", "published", "already_published", false],
  ["failed_retryable", "failed_retryable", "eligible_for_retry", true],
  ["failed_terminal", "failed_terminal", "terminal_failure", false],
  ["reconciliation_required", "reconciliation_required", "reconciliation_required", false]
];
for (const [status, publicationKey, reason, available] of lifecycleCases) {
  const lifecycleState = fixtureState();
  lifecycleState.publishClaims = [{
    id: `claim-lifecycle-${status}`, postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status
  }];
  const lifecycleResult = controlsFor(lifecycleState);
  assert.equal(firstChannel(lifecycleResult).publicationState.key, publicationKey);
  assert.equal(firstChannel(lifecycleResult).publicationState.retryEligible, available);
  assert.equal(firstChannel(lifecycleResult).eligibility.available, available);
  assert.equal(firstChannel(lifecycleResult).eligibility.reason, reason);
  assert.equal(firstChannel(lifecycleResult).eligibility.executable, false);
}

const retryGateOffState = fixtureState();
retryGateOffState.publishClaims = [{
  id: "claim-retryable-gate-off", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "failed_retryable"
}];
retryGateOffState.runtime.livePostingGates.linkedin = false;
const retryGateOff = controlsFor(retryGateOffState);
assert.equal(firstChannel(retryGateOff).publicationState.key, "failed_retryable");
assert.equal(firstChannel(retryGateOff).publicationState.retryEligible, false);
assert.equal(firstChannel(retryGateOff).eligibility.reason, "publishing_off");

for (const [status, expectedKey, reason, available] of [
  ["retry_ready", "failed_retryable", "eligible_for_retry", true],
  ["failed", "failed_retryable", "eligible_for_retry", true],
  ["error", "blocked", "publication_not_retryable", false],
  ["blocked", "blocked", "publication_not_retryable", false]
]) {
  const legacyState = fixtureState();
  legacyState.posts[0].publishAttempts = [{ id: `legacy-${status}`, channel: "linkedin", status, isCurrent: true }];
  const legacy = controlsFor(legacyState);
  assert.equal(firstChannel(legacy).publicationState.key, expectedKey);
  assert.equal(firstChannel(legacy).publicationState.retryEligible, available);
  assert.equal(firstChannel(legacy).eligibility.reason, reason);
}

// Repeated attempts resolve only with explicit lineage/version truth; ambiguity fails closed.
const versionedState = fixtureState();
versionedState.posts[0].publishAttempts = [
  { id: "attempt-v1", lineageId: "lineage-linkedin", versionNumber: 1, channel: "linkedin", status: "failed" },
  { id: "attempt-v2", lineageId: "lineage-linkedin", versionNumber: 2, channel: "linkedin", status: "publishing" }
];
const versioned = controlsFor(versionedState);
assert.equal(firstChannel(versioned).publicationState.key, "publishing");
assert.equal(firstChannel(versioned).attemptReference.sourceId, "attempt-v2");

const ambiguousState = fixtureState();
ambiguousState.posts[0].perChannelPublishStatus = { linkedin: "failed" };
ambiguousState.posts[0].publishAttempts = [
  { id: "attempt-a", channel: "linkedin", status: "failed" },
  { id: "attempt-b", channel: "linkedin", status: "publishing" }
];
const ambiguous = controlsFor(ambiguousState);
assert.equal(firstChannel(ambiguous).state.key, "unavailable");
assert.equal(firstChannel(ambiguous).publicationState.key, "ambiguous");
assert.equal(firstChannel(ambiguous).eligibility.reason, "ambiguous_attempt");
assert.equal(firstChannel(ambiguous).publicationState.retryEligible, false);

// URL truth: valid explicit result only; unsafe, API, signed, dashboard, and URL-only values are suppressed.
for (const unsafeUrl of [
  "javascript:alert(1)",
  "https://example.com/post?token=signed",
  "https://api.linkedin.com/v2/posts/123",
  "https://business.facebook.com/latest/posts/123"
]) {
  const unsafeState = fixtureState();
  unsafeState.posts[0].perChannelPublishStatus = { linkedin: "posted" };
  unsafeState.posts[0].perChannelPublishedUrl = { linkedin: unsafeUrl };
  const unsafe = controlsFor(unsafeState);
  assert.equal(firstChannel(unsafe).publicationState.key, "published");
  assert.equal(firstChannel(unsafe).publishedUrl, null);
  assert.equal(firstChannel(unsafe).publishedUrlAvailability, "unavailable");
}
const urlOnlyState = fixtureState();
urlOnlyState.posts[0].perChannelPublishedUrl = { linkedin: "https://www.linkedin.com/posts/url-only" };
const urlOnly = controlsFor(urlOnlyState);
assert.equal(firstChannel(urlOnly).publicationState.key, "no_attempt");
assert.equal(firstChannel(urlOnly).publishedUrl, null);

// Manual fallback is explicit, remains non-executable, and never establishes publication.
const manualState = fixtureState();
manualState.posts[0].manualPublishingAvailable = true;
manualState.runtime.livePostingGates.linkedin = false;
const manual = controlsFor(manualState);
assert.equal(manual.state.key, "manual_publishing_available");
assert.equal(manual.manualFallback.state, "available");
assert.equal(manual.manualFallback.available, true);
assert.equal(manual.manualFallback.executable, false);
assert.equal(firstChannel(manual).publicationState.key, "no_attempt");

const manualUnknownState = fixtureState();
delete manualUnknownState.posts[0].manualPublishingAvailable;
manualUnknownState.runtime.livePostingGates.linkedin = false;
const manualUnknown = controlsFor(manualUnknownState);
assert.equal(manualUnknown.manualFallback.state, "status_unavailable");
assert.equal(manualUnknown.manualFallback.available, false);

// Authorization is identityless and hidden records affect neither output nor counts.
for (const actor of [{}, { authenticated: true, role: "unknown", id: "unknown" }, VIEWER]) {
  const unavailable = controlsFor(fixtureState(), actor);
  assert.equal(unavailable.postId, null);
  assert.equal(unavailable.href, null);
  assert.deepEqual(unavailable.channels, []);
  assert.deepEqual(unavailable.sourceReferences, []);
  assert.equal(unavailable.availability.counts, null);
  assert.equal(unavailable.publicationSummary, null);
}
const hiddenPostState = fixtureState();
hiddenPostState.posts[0].allowedRoles = ["admin"];
const hiddenPost = controlsFor(hiddenPostState);
assert.equal(hiddenPost.postId, null);
assert.equal(hiddenPost.href, null);
assert.equal(hiddenPost.availability.counts, null);

const hiddenBaseState = fixtureState();
hiddenBaseState.socialAccounts = [];
const hiddenBase = controlsFor(hiddenBaseState);
const hiddenRecordsState = fixtureState();
hiddenRecordsState.socialAccounts = [{ id: "hidden-account", platform: "linkedin", connected: true, allowedRoles: ["admin"] }];
hiddenRecordsState.publishEvents = [{ id: "hidden-result", postId: POST_ID, channel: "linkedin", status: "published", allowedRoles: ["admin"] }];
hiddenRecordsState.publishClaims = [{ id: "hidden-attempt", postId: POST_ID, approvalRevision: "approval-1", channel: "linkedin", status: "publishing", allowedRoles: ["admin"] }];
const hiddenRecords = controlsFor(hiddenRecordsState);
assert.deepEqual(hiddenRecords.channels, hiddenBase.channels);
assert.deepEqual(hiddenRecords.availability.counts, hiddenBase.availability.counts);
assert.equal(hiddenRecords.performance.candidatesExamined, hiddenBase.performance.candidatesExamined);
assert.doesNotMatch(JSON.stringify(hiddenRecords), /hidden-account|hidden-result|hidden-attempt/);

// Stable order, deterministic output, deep immutability, and no browser/runtime dependencies.
assert.deepEqual(controlsFor(reverseArrays(partialState)), partial);
assert.deepEqual(controlsFor(structuredClone(partialState)), partial);
assertDeepFrozen(partial);
assert.throws(() => { partial.channels.push({}); }, TypeError);
const sourceText = [
  readFileSync(new URL("./ui/view-models/post-publishing-control-sources.mjs", import.meta.url), "utf8"),
  readFileSync(new URL("./ui/view-models/post-publishing-controls.mjs", import.meta.url), "utf8")
].join("\n");
assert.doesNotMatch(sourceText, /preview-server|ui\/pages|browser|document\.|window\.|fetch\(|https?:\/\//i);

// Production-like adapter benchmark: 100 detailed Posts, five channels, outcomes, restrictions, and attempts.
function performanceFixture(count = 100) {
  const channels = ["linkedin", "instagram", "facebook", "x", "threads"];
  const base = fixtureState();
  base.posts = Array.from({ length: count }, (_, index) => {
    const id = `performance-control-${String(index).padStart(3, "0")}`;
    const statusMap = {};
    if (index % 10 === 0) statusMap.linkedin = "posted";
    if (index % 10 === 1) statusMap.instagram = "failed";
    return {
      ...structuredClone(base.posts[0]),
      id,
      targetChannels: [...channels],
      channelVariants: channels.map((channel) => ({ id: `${id}-${channel}`, channel, body: `${channel} stored copy ${index}` })),
      perChannelPublishStatus: statusMap,
      perChannelPublishedUrl: statusMap.linkedin === "posted" ? { linkedin: `https://www.linkedin.com/posts/${id}` } : {},
      publishAttempts: index % 10 === 1
        ? [{ id: `${id}-failed`, channel: "instagram", status: "failed", isCurrent: true }]
        : index % 10 === 2
          ? [{ id: `${id}-pending`, channel: "facebook", status: "publishing", isCurrent: true }]
          : [],
      manualPublishingAvailable: index % 9 === 0,
      updatedAt: `2026-07-18T11:${String(index % 60).padStart(2, "0")}:00.000Z`
    };
  });
  base.socialAccounts = channels.map((channel) => ({ id: `performance-account-${channel}`, platform: channel, status: "connected", connected: true }));
  base.runtime.livePostingGates = Object.fromEntries(channels.map((channel) => [channel, true]));
  return base;
}

const productionLike = performanceFixture();
const performanceBefore = structuredClone(productionLike);
const performanceStarted = performance.now();
const performanceControls = productionLike.posts.map((post) => buildPostPublishingControls(productionLike, OWNER, post.id, NOW));
const projectionMs = performance.now() - performanceStarted;
const serializedBytes = Buffer.byteLength(JSON.stringify(performanceControls), "utf8");
const channelControls = performanceControls.reduce((total, result) => total + result.channels.length, 0);
const connectedChannels = performanceControls.reduce((total, result) => total + result.availability.counts.connectedChannels, 0);
const gatedChannels = performanceControls.reduce((total, result) => total + result.availability.counts.gatedChannels, 0);
const eligibleChannels = performanceControls.reduce((total, result) => total + result.availability.counts.eligibleChannels, 0);
const publishedChannels = performanceControls.reduce((total, result) => total + result.availability.counts.publishedChannels, 0);
const failedChannels = performanceControls.reduce((total, result) => total + result.availability.counts.failedChannels, 0);
const ambiguousRecords = performanceControls.reduce((total, result) => total + result.availability.counts.ambiguousRecords, 0);
const candidatesExamined = performanceControls.reduce((total, result) => total + result.performance.candidatesExamined, 0);
assert.equal(performanceControls.length, 100);
assert.equal(channelControls, 500);
assert.equal(connectedChannels, 500);
assert.equal(gatedChannels, 500);
assert.equal(publishedChannels, 10);
assert.equal(failedChannels, 10);
assert.equal(ambiguousRecords, 0);
assert.deepEqual(productionLike, performanceBefore);
assert.ok(performanceControls.every((result) => Object.values(result.capabilities).every((value) => value === false)));

const benchmark = {
  fixture: "deterministic-production-like-publishing-control-adapter",
  candidatesExamined,
  postsProjected: performanceControls.length,
  channelControls,
  connectedChannels,
  gatedChannels,
  eligibleChannels,
  publishedChannels,
  failedChannels,
  ambiguousRecords,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  connections: 0,
  credentialReads: 0,
  gateChanges: 0,
  publications: 0,
  retries: 0,
  attemptCreations: 0,
  idempotencyKeyCreations: 0,
  scheduleWrites: 0,
  approvals: 0,
  providerCalls: 0,
  networkRequests: 0,
  storageWrites: 0,
  sourceMutations: 0,
  postMutations: 0,
  variantMutations: 0
};

console.log("PASS test-vnext-post-publishing-controls");
console.log(JSON.stringify(benchmark));
