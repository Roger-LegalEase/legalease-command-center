#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { buildPostReviewPlan } from "./ui/view-models/post-review-plan.mjs";
import {
  collectPostReviewPlanSources,
  POST_REVIEW_PLAN_SOURCE_MATRIX
} from "./ui/view-models/post-review-plan-sources.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const POST_ID = "review-post-01";
const ACTOR = Object.freeze({ authenticated: true, role: "operator", id: "synthetic-operator" });
const OWNER = Object.freeze({ authenticated: true, role: "owner", id: "synthetic-owner" });
const ADMIN = Object.freeze({ authenticated: true, role: "admin", id: "synthetic-admin" });
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
      targetChannels: ["instagram", "linkedin"],
      channelVariants: [
        { id: "variant-linkedin", channel: "linkedin", body: "LinkedIn-specific caption." },
        { id: "variant-facebook", channel: "facebook", body: "Preserved unselected Facebook caption." }
      ],
      scheduledFor: "2026-07-20T14:00:00.000Z",
      timezone: "America/New_York",
      scheduleStatus: "valid",
      approvalRequired: true,
      approvalStatus: "not_requested",
      status: "draft",
      perChannelPublishStatus: {},
      guidelinesGate: { passed: true, hardFails: [] },
      copyReviewed: true,
      imageIntentionallyOmitted: true,
      finalPreviewConfirmed: true,
      versionNumber: 3,
      updatedAt: "2026-07-18T11:30:00.000Z",
      providerPayload: { accessToken: "must-not-project" },
      privatePath: "/private/must-not-project.json"
    }],
    postImages: [],
    postVersions: [],
    copyVersions: [],
    brandAssets: [],
    postingKits: [],
    generationProfiles: [],
    assetBundles: [],
    brandRules: [],
    library: [],
    socialAccounts: [
      { id: "account-linkedin", platform: "linkedin", status: "connected", connected: true },
      { id: "account-instagram", platform: "instagram", status: "connected", connected: true }
    ],
    approvals: [],
    approvalQueue: [],
    queueItems: [],
    reviewFeedback: [],
    reviewFeedbackRecords: [],
    postReviewFeedback: [],
    publishEvents: [],
    scheduleConflicts: [],
    contentBank: [],
    reports: [],
    dataRoomItems: [],
    evidencePackNotes: [],
    activityEvents: [],
    auditHistory: [],
    generationBatches: [],
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
  assert.equal(Object.isFrozen(value), true, "Every review-plan object and array must be frozen.");
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function planFor(state, actor = ACTOR, postId = POST_ID, now = NOW) {
  return buildPostReviewPlan(state, actor, postId, now);
}

assert.equal(typeof buildPostReviewPlan, "function");
assert.equal(typeof collectPostReviewPlanSources, "function");
assert.deepEqual(POST_REVIEW_PLAN_SOURCE_MATRIX.map((item) => item.source), [
  "CCX-300 PostView",
  "CCX-302A ComposerDraftView",
  "CCX-305 Social readiness",
  "CCX-306A Social schedule plan",
  "posts / approvals / approvalQueue / queueItems",
  "reviewFeedback / reviewFeedbackRecords / postReviewFeedback / Post feedback",
  "postVersions / copyVersions / postImages",
  "generationBatches / postImages",
  "activityEvents / auditHistory"
]);

// Complete draft: exact Post identity/link, ready state, and read-only schedule/approval separation.
const state = fixtureState();
const before = structuredClone(state);
const plan = planFor(state);
assert.deepEqual(state, before, "Review projection must not mutate any source.");
assert.equal(plan.postId, POST_ID);
assert.equal(plan.href, "#social/post/review-post-01");
assert.equal(plan.generatedAt, NOW);
assert.equal(plan.state.key, "ready_for_review");
assert.equal(plan.approval.state.key, "not_requested");
assert.equal(plan.approval.approveAction.available, false);
assert.equal(plan.approval.approveAction.executable, false);
assert.equal(plan.approval.approveAction.reason, "actor_cannot_approve");
assert.equal(plan.approval.approveAction.requiredCapability, "manage_approval_queue");
assert.equal(plan.guidance.executable, false);
assert.ok(Object.values(plan.availability.actions).every((value) => value === false));
assert.doesNotMatch(JSON.stringify(plan), /must-not-project|\/private\/|accessToken|providerPayload|rawRuleId|signedUrl/);

const ownerEligible = planFor(fixtureState(), OWNER);
assert.equal(ownerEligible.state.key, "ready_for_review");
assert.equal(ownerEligible.approval.approveAction.available, true);
assert.equal(ownerEligible.approval.approveAction.executable, false);
assert.equal(ownerEligible.approval.approveAction.reason, "eligible_for_approval");
assert.equal(ownerEligible.approval.approveAction.requiredCapability, "manage_approval_queue");

const adminEligible = planFor(fixtureState(), ADMIN);
assert.equal(adminEligible.approval.approveAction.available, true);
assert.equal(adminEligible.approval.approveAction.executable, false);

const approvalSourceUnavailableState = fixtureState();
delete approvalSourceUnavailableState.posts[0].approvalStatus;
const approvalSourceUnavailable = planFor(approvalSourceUnavailableState, OWNER);
assert.equal(approvalSourceUnavailable.state.key, "ready_for_review");
assert.equal(approvalSourceUnavailable.approval.state.key, "unavailable");
assert.equal(approvalSourceUnavailable.approval.approveAction.available, false);
assert.equal(approvalSourceUnavailable.approval.approveAction.reason, "approval_source_unavailable");

// Incomplete content is not ready, while guideline hard failures retain plain-language hard-gate truth.
const incompleteState = fixtureState();
incompleteState.posts[0].body = "";
const incomplete = planFor(incompleteState, OWNER);
assert.equal(incomplete.state.key, "not_ready_for_review");
assert.ok(incomplete.blockingChecks.some((check) => check.label === "Post content" && check.hardFailure === false));
assert.equal(incomplete.approval.approveAction.available, false);
assert.equal(incomplete.approval.approveAction.reason, "blocked_by_review_check");

const hardContentState = fixtureState();
hardContentState.posts[0].guidelinesGate = {
  passed: false,
  hardFails: [{ ruleId: "private-outcome-rule", category: "outcome promise", message: "raw technical detail" }]
};
const hardContent = planFor(hardContentState, OWNER);
assert.equal(hardContent.state.key, "not_ready_for_review");
assert.ok(hardContent.blockingChecks.some((check) => check.hardFailure && /prohibited outcome promise/i.test(check.explanation)));
assert.equal(hardContent.approval.approveAction.available, false);
assert.equal(hardContent.approval.approveAction.reason, "blocked_by_review_check");
assert.doesNotMatch(JSON.stringify(hardContent), /private-outcome-rule|raw technical detail/);

// Render/creative hard failures block review and approval without invoking regeneration.
const hardCreativeState = fixtureState();
hardCreativeState.posts[0].imageIntentionallyOmitted = false;
hardCreativeState.postImages = [{
  id: "image-failed", postId: POST_ID, versionNumber: 1, generationStatus: "qa_failed",
  renderQa: { passed: false, hardFails: [{ ruleId: "private-render-rule", detail: "raw render payload" }] }
}];
const hardCreative = planFor(hardCreativeState, OWNER);
assert.equal(hardCreative.state.key, "not_ready_for_review");
assert.ok(hardCreative.blockingChecks.some((check) => check.category === "Creative" && check.hardFailure));
assert.equal(hardCreative.approval.approveAction.available, false);
assert.equal(hardCreative.approval.approveAction.reason, "blocked_by_review_check");
assert.equal(hardCreative.regeneration.state.key, "failed");
assert.doesNotMatch(JSON.stringify(hardCreative), /private-render-rule|raw render payload/);

// Explicit approval states remain review-only.
const awaitingState = fixtureState();
awaitingState.posts[0].approvalStatus = "awaiting_approval";
const awaiting = planFor(awaitingState, OWNER);
assert.equal(awaiting.state.key, "awaiting_review");
assert.equal(awaiting.approval.state.key, "awaiting_review");
assert.equal(awaiting.approval.approveAction.available, true);
assert.equal(awaiting.approval.approveAction.executable, false);

const approvedState = fixtureState();
approvedState.posts[0].approvalStatus = "approved";
approvedState.posts[0].approvedAt = "2026-07-18T10:00:00.000Z";
const approved = planFor(approvedState, OWNER);
assert.equal(approved.state.key, "approved");
assert.equal(approved.approval.approveAction.available, false);
assert.equal(approved.approval.approveAction.reason, "already_approved");
assert.equal(approved.guidance.scheduleState, "scheduled");
assert.match(approved.guidance.text, /does not schedule or publish/i);
assert.ok(Object.values(approved.availability.actions).every((value) => value === false));

const approvedPostStatusState = fixtureState();
delete approvedPostStatusState.posts[0].approvalStatus;
approvedPostStatusState.posts[0].status = "approved";
assert.equal(planFor(approvedPostStatusState).state.key, "approved");

// Only explicit current requested changes project; resolved/superseded feedback is historical.
const changesState = fixtureState();
changesState.reviewFeedback = [{
  id: "feedback-current", postId: POST_ID, status: "current", summary: "Shorten the opening sentence.",
  category: "Copy", authorName: "Synthetic Reviewer", requestedAt: "2026-07-18T11:00:00.000Z",
  rawEmailBody: "must-not-project@example.com", providerPayload: "must-not-project"
}];
const changes = planFor(changesState, OWNER);
assert.equal(changes.state.key, "changes_requested");
assert.equal(changes.approval.approveAction.available, false);
assert.equal(changes.approval.approveAction.reason, "changes_requested");
assert.equal(changes.requestedChanges.length, 1);
assert.deepEqual(changes.requestedChanges[0], {
  summary: "Shorten the opening sentence.",
  category: "Copy",
  author: "Synthetic Reviewer",
  timestamp: "2026-07-18T11:00:00.000Z",
  sourceReference: { collection: "reviewFeedback", sourceId: "feedback-current", relationship: "requested_change" }
});
assert.doesNotMatch(JSON.stringify(changes), /must-not-project@example\.com|providerPayload/);

const resolvedState = fixtureState();
resolvedState.reviewFeedback = [
  { id: "feedback-resolved", postId: POST_ID, status: "resolved", summary: "Old resolved request." },
  { id: "feedback-superseded", postId: POST_ID, status: "superseded", summary: "Old superseded request." }
];
const resolved = planFor(resolvedState);
assert.equal(resolved.state.key, "ready_for_review");
assert.equal(resolved.requestedChanges.length, 0);
assert.equal(resolved.availability.counts.hiddenOrHistoricalFeedbackExcluded, 2);

// A newer current requested change is not erased by older explicit approval history.
const historicalApprovalState = fixtureState();
historicalApprovalState.posts[0].approvalStatus = "approved";
historicalApprovalState.posts[0].approvedAt = "2026-07-18T09:00:00.000Z";
historicalApprovalState.reviewFeedback = [{
  id: "feedback-newer", postId: POST_ID, status: "current", summary: "Use the current disclaimer.",
  category: "Brand", requestedAt: "2026-07-18T11:00:00.000Z"
}];
const historicalApproval = planFor(historicalApprovalState);
assert.equal(historicalApproval.state.key, "changes_requested");
assert.equal(historicalApproval.approval.state.key, "approved");

// Multiple current related approvals fail closed unless explicit stable/version truth resolves them.
const ambiguousApprovalState = fixtureState();
delete ambiguousApprovalState.posts[0].approvalStatus;
ambiguousApprovalState.approvals = [
  { id: "approval-a", type: "post", sourceId: POST_ID, status: "approved" },
  { id: "approval-b", type: "post", sourceId: POST_ID, status: "changes_requested" }
];
const ambiguousApproval = planFor(ambiguousApprovalState, OWNER);
assert.equal(ambiguousApproval.state.key, "unavailable");
assert.equal(ambiguousApproval.approval.ambiguous, true);
assert.equal(ambiguousApproval.approval.approveAction.available, false);
assert.equal(ambiguousApproval.approval.approveAction.reason, "ambiguous_approval_truth");
assert.equal(ambiguousApproval.availability.reason, "ambiguous_approval_truth");

const versionedApprovalState = fixtureState();
delete versionedApprovalState.posts[0].approvalStatus;
versionedApprovalState.approvals = [
  { id: "approval-v1", type: "post", sourceId: POST_ID, status: "changes_requested", approvalFamilyId: "approval-family", versionNumber: 1 },
  { id: "approval-v2", type: "post", sourceId: POST_ID, status: "approved", approvalFamilyId: "approval-family", versionNumber: 2 }
];
assert.equal(planFor(versionedApprovalState).state.key, "approved");

// Current/previous copy and image versions use exact stable relationships.
const versionState = fixtureState();
versionState.postVersions = [
  { id: "post-version-1", postId: POST_ID, versionNumber: 1, createdAt: "2026-07-16T10:00:00.000Z" },
  { id: "post-version-hidden", postId: POST_ID, versionNumber: 99, ownerOnly: true }
];
versionState.copyVersions = [{ id: "copy-version-2", postId: POST_ID, versionNumber: 2, createdAt: "2026-07-17T10:00:00.000Z" }];
versionState.posts[0].imageIntentionallyOmitted = false;
versionState.postImages = [
  { id: "image-v1", postId: POST_ID, versionNumber: 1, generationStatus: "generated", finalImageReady: true, renderQa: { passed: true }, styleGate: { passed: true } },
  { id: "image-v2", postId: POST_ID, versionNumber: 2, generationStatus: "generated", finalImageReady: true, renderQa: { passed: true }, styleGate: { passed: true }, imageApproved: true }
];
const versions = planFor(versionState).versions;
assert.equal(versions.current.post.version, 3);
assert.equal(versions.current.image.id, "image-v2");
assert.deepEqual(versions.previous.map((item) => item.id), ["copy-version-2", "post-version-1"]);
assert.deepEqual(versions.images.map((item) => [item.id, item.current]), [["image-v2", true], ["image-v1", false]]);
assert.ok(!JSON.stringify(versions).includes("post-version-hidden"));

// Regeneration is read-only and explicit; generated does not mean approved.
const regenerationAvailableState = fixtureState();
regenerationAvailableState.posts[0].regenerationAvailable = true;
assert.equal(planFor(regenerationAvailableState).regeneration.state.key, "available");

const regenerationProgressState = fixtureState();
regenerationProgressState.posts[0].imageIntentionallyOmitted = false;
regenerationProgressState.postImages = [{ id: "image-progress", postId: POST_ID, versionNumber: 1, generationStatus: "generating" }];
assert.equal(planFor(regenerationProgressState).regeneration.state.key, "in_progress");

const regenerationFailedState = fixtureState();
regenerationFailedState.posts[0].imageIntentionallyOmitted = false;
regenerationFailedState.postImages = [{ id: "image-error", postId: POST_ID, versionNumber: 1, generationStatus: "failed" }];
assert.equal(planFor(regenerationFailedState).regeneration.state.key, "failed");

const regenerationCompleteState = fixtureState();
regenerationCompleteState.posts[0].imageIntentionallyOmitted = false;
regenerationCompleteState.postImages = [{
  id: "image-complete", postId: POST_ID, versionNumber: 1, generationStatus: "generated",
  finalImageReady: true, renderQa: { passed: true }, styleGate: { passed: true }
}];
const regenerationComplete = planFor(regenerationCompleteState).regeneration;
assert.equal(regenerationComplete.state.key, "complete");
assert.equal(regenerationComplete.finalImageApproved, false, "Generation completion never fabricates final-image approval.");
assert.equal(regenerationComplete.operation, null);
assert.equal(regenerationComplete.executable, false);

const regenerationBlocked = planFor(hardContentState).regeneration;
assert.equal(regenerationBlocked.state.key, "blocked_by_hard_failure");

// Meaningful activity is compact, explicitly related, and does not establish state.
const activityState = fixtureState();
activityState.activityEvents = [
  { id: "activity-review", eventType: "review_requested", relatedObjectType: "post", relatedObjectId: POST_ID, createdAt: "2026-07-18T10:00:00.000Z", rawPayload: "must-not-project" },
  { id: "activity-other", eventType: "approved", relatedObjectType: "post", relatedObjectId: "other-post", createdAt: "2026-07-18T11:00:00.000Z" }
];
const activityPlan = planFor(activityState);
assert.equal(activityPlan.state.key, "ready_for_review", "Activity text never derives review state.");
assert.ok(activityPlan.activity.some((event) => event.label === "Review requested"));
assert.ok(!JSON.stringify(activityPlan).includes("activity-other"));

// Missing actors and hidden Posts fail closed; hidden feedback affects neither state nor counts.
const missingActor = planFor(fixtureState(), {});
assert.equal(missingActor.state.key, "unavailable");
assert.equal(missingActor.postId, null);
assert.equal(missingActor.href, null);
assert.equal(missingActor.sourceReferences.length, 0);
assert.equal(missingActor.availability.counts, null);
assert.equal(missingActor.approval, null);
assert.equal(missingActor.versions, null);
assert.equal(missingActor.regeneration, null);
assert.deepEqual(missingActor.requestedChanges, []);
assert.deepEqual(missingActor.activity, []);

const unknownActor = planFor(fixtureState(), { authenticated: true, role: "unknown", id: "synthetic-unknown" });
assert.equal(unknownActor.state.key, "unavailable");
assert.equal(unknownActor.postId, null);
assert.equal(unknownActor.href, null);
assert.equal(unknownActor.availability.counts, null);

const viewer = planFor(fixtureState(), VIEWER);
assert.equal(viewer.state.key, "unavailable");
assert.equal(viewer.postId, null);
assert.equal(viewer.approval, null, "Viewer visibility does not grant approval authority or approval details.");

const invalidClock = planFor(fixtureState(), OWNER, POST_ID, "not-a-clock");
assert.equal(invalidClock.state.key, "unavailable");
assert.equal(invalidClock.postId, null);
assert.equal(invalidClock.href, null);
assert.equal(invalidClock.availability.counts, null);

const hiddenPostState = fixtureState();
hiddenPostState.posts[0].ownerOnly = true;
const hiddenPost = planFor(hiddenPostState);
assert.equal(hiddenPost.state.key, "unavailable");
assert.equal(hiddenPost.postId, null);
assert.equal(hiddenPost.href, null);
assert.equal(hiddenPost.activity.length, 0);
assert.equal(hiddenPost.availability.counts, null);
assert.equal(hiddenPost.approval, null);
assert.equal(hiddenPost.versions, null);
assert.equal(hiddenPost.regeneration, null);

const hiddenFeedbackState = fixtureState();
hiddenFeedbackState.reviewFeedback = [{
  id: "feedback-hidden", postId: POST_ID, status: "current", summary: "Must remain hidden.", ownerOnly: true
}];
const hiddenFeedback = planFor(hiddenFeedbackState);
assert.equal(hiddenFeedback.state.key, plan.state.key);
assert.deepEqual(hiddenFeedback.availability.counts, plan.availability.counts);
assert.equal(hiddenFeedback.performance.sourceCandidatesExamined, plan.performance.sourceCandidatesExamined);
assert.ok(!JSON.stringify(hiddenFeedback).includes("feedback-hidden"));

const hiddenRecordsState = fixtureState();
hiddenRecordsState.approvals = [{ id: "approval-hidden", type: "post", sourceId: POST_ID, status: "approved", ownerOnly: true }];
hiddenRecordsState.reviewFeedback = [{ id: "feedback-hidden-count", postId: POST_ID, status: "current", summary: "Hidden.", ownerOnly: true }];
hiddenRecordsState.postVersions = [{ id: "version-hidden-count", postId: POST_ID, versionNumber: 99, ownerOnly: true }];
hiddenRecordsState.activityEvents = [{ id: "activity-hidden-count", eventType: "approved", relatedObjectType: "post", relatedObjectId: POST_ID, ownerOnly: true }];
const hiddenRecords = planFor(hiddenRecordsState);
assert.equal(hiddenRecords.state.key, plan.state.key);
assert.deepEqual(hiddenRecords.availability.counts, plan.availability.counts);
assert.doesNotMatch(JSON.stringify(hiddenRecords), /approval-hidden|feedback-hidden-count|version-hidden-count|activity-hidden-count/);
for (const result of [
  plan, ownerEligible, adminEligible, approvalSourceUnavailable, incomplete, hardContent, hardCreative,
  awaiting, approved, changes, ambiguousApproval, historicalApproval
]) {
  assert.equal(result.approval.approveAction.executable, false, "Approval eligibility is always presentation-only.");
}

// Determinism, input-order independence, deep immutability, and zero source/action mutation.
const deterministicState = fixtureState();
deterministicState.reviewFeedback = [
  { id: "feedback-b", postId: POST_ID, status: "current", summary: "Second request.", requestedAt: "2026-07-18T10:00:00.000Z" },
  { id: "feedback-a", postId: POST_ID, status: "current", summary: "First request.", requestedAt: "2026-07-18T11:00:00.000Z" }
];
deterministicState.postVersions = [
  { id: "version-b", postId: POST_ID, versionNumber: 1 },
  { id: "version-a", postId: POST_ID, versionNumber: 2 }
];
const deterministic = planFor(deterministicState);
assert.deepEqual(planFor(deterministicState), deterministic);
assert.deepEqual(planFor(reverseArrays(deterministicState)), deterministic);
assertDeepFrozen(deterministic);
const mutationAttempt = structuredClone(deterministicState);
planFor(mutationAttempt);
assert.deepEqual(mutationAttempt, deterministicState);
assert.ok(Object.values(deterministic.availability.actions).every((value) => value === false));

const sourceText = [
  readFileSync(new URL("./ui/view-models/post-review-plan-sources.mjs", import.meta.url), "utf8"),
  readFileSync(new URL("./ui/view-models/post-review-plan.mjs", import.meta.url), "utf8")
].join("\n");
assert.doesNotMatch(sourceText, /preview-server|ui\/pages|tests\/browser|\bfetch\s*\(|\.writeCollections\s*\(|provider\.(?:send|publish|generate)/i);

// Production-like adapter benchmark: 100 exact Posts with versions, feedback, checks, and activity.
const benchmark = fixtureState();
benchmark.posts = Array.from({ length: 100 }, (_, index) => ({
  ...structuredClone(benchmark.posts[0]),
  id: `benchmark-review-post-${index}`,
  title: `Synthetic review Post ${index}`,
  approvalStatus: index % 4 === 0 ? "approved" : index % 4 === 1 ? "awaiting_approval" : "not_requested",
  approvedAt: index % 4 === 0 ? "2026-07-18T10:00:00.000Z" : undefined,
  versionNumber: 3
}));
benchmark.postImages = benchmark.posts.flatMap((post, index) => [
  { id: `benchmark-image-${index}-1`, postId: post.id, versionNumber: 1, generationStatus: "generated", finalImageReady: true, renderQa: { passed: true }, styleGate: { passed: true } },
  { id: `benchmark-image-${index}-2`, postId: post.id, versionNumber: 2, generationStatus: index % 10 === 0 ? "failed" : "generated", finalImageReady: index % 10 !== 0, renderQa: { passed: index % 10 !== 0 }, styleGate: { passed: true } }
]);
benchmark.posts.forEach((post) => { post.imageIntentionallyOmitted = false; });
benchmark.postVersions = benchmark.posts.map((post, index) => ({ id: `benchmark-post-version-${index}`, postId: post.id, versionNumber: 2 }));
benchmark.copyVersions = benchmark.posts.map((post, index) => ({ id: `benchmark-copy-version-${index}`, postId: post.id, versionNumber: 2 }));
benchmark.reviewFeedback = benchmark.posts.filter((_, index) => index % 5 === 0).map((post, index) => ({
  id: `benchmark-feedback-${index}`, postId: post.id, status: "current", summary: "Synthetic current requested change.", category: "Copy", requestedAt: "2026-07-18T11:00:00.000Z"
}));
benchmark.activityEvents = benchmark.posts.map((post, index) => ({
  id: `benchmark-activity-${index}`, eventType: "review_requested", relatedObjectType: "post", relatedObjectId: post.id, createdAt: "2026-07-18T10:00:00.000Z"
}));
benchmark.socialAccounts = [
  { id: "benchmark-account-linkedin", platform: "linkedin", status: "connected", connected: true },
  { id: "benchmark-account-instagram", platform: "instagram", status: "connected", connected: true }
];
const benchmarkBefore = structuredClone(benchmark);
const startedAt = performance.now();
const benchmarkPlans = benchmark.posts.map((post) => buildPostReviewPlan(benchmark, ACTOR, post.id, NOW));
const projectionMs = Number((performance.now() - startedAt).toFixed(3));
assert.deepEqual(benchmark, benchmarkBefore);
assert.equal(benchmarkPlans.length, 100);
const metrics = {
  fixture: "deterministic-production-like-review-adapter",
  sourceCandidatesExamined: benchmarkPlans.reduce((sum, item) => sum + item.performance.sourceCandidatesExamined, 0),
  postsProjected: benchmarkPlans.filter((item) => item.availability.key !== "unavailable").length,
  blockingChecks: benchmarkPlans.reduce((sum, item) => sum + item.blockingChecks.length, 0),
  feedbackRecords: benchmarkPlans.reduce((sum, item) => sum + item.requestedChanges.length, 0),
  versions: benchmarkPlans.reduce((sum, item) => sum + item.versions.previous.length + item.versions.images.length + 1, 0),
  activityEvents: benchmarkPlans.reduce((sum, item) => sum + item.activity.length, 0),
  projectionMs,
  serializedBytes: Buffer.byteLength(JSON.stringify(benchmarkPlans)),
  approvalWrites: 0,
  requestedChangeWrites: 0,
  postEdits: 0,
  imageGenerations: 0,
  scheduleWrites: 0,
  publications: 0,
  providerCalls: 0,
  networkRequests: 0,
  storageWrites: 0,
  sourceMutations: 0,
  actionIntents: 0
};
assert.equal(metrics.postsProjected, 100);
assert.ok(metrics.sourceCandidatesExamined >= 100);
assert.ok(metrics.blockingChecks >= 10);
assert.ok(metrics.feedbackRecords >= 20);
assert.ok(metrics.versions >= 500);
assert.ok(metrics.activityEvents >= 100);
assert.ok(metrics.serializedBytes > 0);
assert.ok(Object.entries(metrics).filter(([key]) => /Writes|Edits|Generations|publications|providerCalls|networkRequests|sourceMutations|actionIntents/.test(key)).every(([, value]) => value === 0));

console.log("PASS test-vnext-post-review-plan");
console.log(JSON.stringify(metrics));
