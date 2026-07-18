#!/usr/bin/env node
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import {
  buildPostReadiness,
  POST_READINESS_CHECK_CATEGORIES,
  POST_READINESS_CHECK_MATRIX,
  POST_READINESS_STATES
} from "./ui/view-models/post-readiness.mjs";
import { POST_READINESS_SOURCE_MATRIX } from "./ui/view-models/post-readiness-sources.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const owner = Object.freeze({ authenticated: true, role: "owner", id: "actor-owner" });
const operator = Object.freeze({ authenticated: true, role: "operator", id: "actor-operator" });
const clone = (value) => structuredClone(value);

function baseState(overrides = {}) {
  const state = {
    posts: [{
      id: "post-1",
      title: "A plain-language update",
      body: "A clear update about record clearing.",
      status: "approved",
      approvalStatus: "approved",
      scheduledFor: "",
      targetChannels: ["linkedin"],
      guidelinesGate: { passed: true, hardFails: [] },
      imageIntentionallyOmitted: true,
      copyReviewed: true
    }],
    postImages: [],
    brandAssets: [],
    postingKits: [],
    approvals: [],
    approvalQueue: [],
    queueItems: [],
    publishEvents: [],
    socialAccounts: [{ id: "account-linkedin", platform: "linkedin", status: "connected", connectedAt: "2026-07-01T00:00:00.000Z" }],
    runtime: { livePostingGates: { linkedin: { enabled: true } } }
  };
  for (const [key, value] of Object.entries(overrides)) state[key] = value;
  return state;
}

function frozenPaths(value, path = "$", paths = []) {
  if (!value || typeof value !== "object") return paths;
  if (Object.isFrozen(value)) paths.push(path);
  for (const [key, child] of Object.entries(value)) frozenPaths(child, `${path}.${key}`, paths);
  return paths;
}

function project(state, actor = owner, id = "post-1", now = NOW) {
  const before = JSON.stringify(state);
  const frozenBefore = frozenPaths(state);
  const output = buildPostReadiness(state, actor, id, now);
  assert.equal(JSON.stringify(state), before, "projection must not mutate source state");
  assert.deepEqual(frozenPaths(state), frozenBefore, "projection must not freeze source state");
  return output;
}

function checkBy(result, key) {
  return result.checks.find((item) => item.key === key);
}

function recursivelyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(recursivelyFrozen);
}

assert.deepEqual(POST_READINESS_CHECK_CATEGORIES, ["Content", "Creative", "Channels", "Schedule", "Approval", "Publishing"]);
assert.deepEqual(POST_READINESS_CHECK_MATRIX.map((item) => item.key), ["content", "creative", "channels", "schedule", "approval", "publishing"]);
assert.deepEqual(POST_READINESS_STATES.map((item) => item.label), [
  "Ready to schedule", "Ready for review", "Ready to publish", "Needs fixes", "Needs connection",
  "Needs schedule", "Needs approval", "Publishing is off", "Published", "Unavailable"
]);
assert.ok(POST_READINESS_SOURCE_MATRIX.included.some((item) => item.collection === "PostView"), "CCX-300 PostView must be the normalized source");

const readyToSchedule = project(baseState());
assert.equal(readyToSchedule.available, true);
assert.deepEqual(readyToSchedule.availability, { key: "available", reason: null });
assert.equal(readyToSchedule.state.label, "Ready to schedule");
assert.equal(readyToSchedule.nextStep.label, "Schedule Post");
assert.equal(checkBy(readyToSchedule, "schedule").status.label, "Needs attention");
assert.equal(readyToSchedule.nextStep.href, "#social/post/post-1", "Post link must use the reviewed route contract");

const readyForReviewState = baseState();
Object.assign(readyForReviewState.posts[0], { status: "draft", approvalStatus: "not_requested" });
const readyForReview = project(readyForReviewState);
assert.equal(readyForReview.state.label, "Ready for review");
assert.equal(readyForReview.nextStep.label, "Review Post");

const contentFailure = baseState();
contentFailure.posts[0].guidelinesGate = { passed: false, hardFails: [{ ruleId: "voice_ai_phrase" }] };
let result = project(contentFailure);
assert.equal(result.state.label, "Needs fixes");
assert.equal(result.nextStep.label, "Fix content");
assert.equal(checkBy(result, "content_safety").status.label, "Blocked");
assert.equal(checkBy(result, "content_safety").hardFailure, true);
assert.equal(checkBy(result, "approval").explanation, "Approval is blocked until hard failures are fixed.");

const promiseFailure = baseState();
promiseFailure.posts[0].guidelinesGate = { passed: false, hardFails: [{ ruleId: "voice_outcome_promise", providerPayload: "private" }] };
result = project(promiseFailure);
assert.equal(checkBy(result, "content_outcome_claims").status.label, "Blocked");
assert.equal(checkBy(result, "content_outcome_claims").hardFailure, true);
assert.match(checkBy(result, "content_outcome_claims").explanation, /prohibited outcome promise/);
assert.ok(!JSON.stringify(result).includes("voice_outcome_promise"), "technical rule IDs must not appear in founder output");
assert.ok(!JSON.stringify(result).includes("providerPayload"), "raw provider fields must not appear");

const disclaimerFailure = baseState();
disclaimerFailure.posts[0].guidelinesGate = { passed: false, hardFails: [{ key: "required_disclaimer_missing" }] };
result = project(disclaimerFailure);
assert.equal(checkBy(result, "content_disclaimer").status.label, "Blocked");

const missingContent = baseState();
missingContent.posts[0].body = "";
assert.equal(checkBy(project(missingContent), "content_present").status.label, "Blocked");

const missingCreative = baseState();
missingCreative.posts[0].imageIntentionallyOmitted = false;
result = project(missingCreative);
assert.equal(result.state.label, "Needs fixes");
assert.equal(result.nextStep.label, "Add creative");
assert.equal(checkBy(result, "creative").status.label, "Blocked");

const failedCreative = baseState({ postImages: [{ id: "image-1", postId: "post-1", generationStatus: "complete", finalImageReady: true, renderQa: { passed: false }, styleGate: { passed: true } }] });
failedCreative.posts[0].imageIntentionallyOmitted = false;
assert.equal(checkBy(project(failedCreative), "creative_quality").status.label, "Blocked");
assert.equal(checkBy(project(failedCreative), "creative_quality").hardFailure, true);

const nestedStyleFailure = baseState({ postImages: [{ id: "image-style", postId: "post-1", generationStatus: "complete", finalImageReady: true, renderQa: { passed: true }, creativeDirection: { styleGate: { passed: false, ruleId: "private-style-rule" } } }] });
nestedStyleFailure.posts[0].imageIntentionallyOmitted = false;
result = project(nestedStyleFailure);
assert.equal(checkBy(result, "creative_brand").hardFailure, true);
assert.ok(!JSON.stringify(result).includes("private-style-rule"));

const assetOnly = baseState({ postImages: [{ id: "image-asset-only", postId: "post-1", assetId: "asset-1" }] });
assetOnly.posts[0].imageIntentionallyOmitted = false;
assert.equal(checkBy(project(assetOnly), "creative").status.label, "Unavailable", "asset ID alone must not establish creative readiness");

const passedCreative = baseState({ postImages: [{ id: "image-ready", postId: "post-1", finalImageReady: true, renderQa: { passed: true }, styleGate: { passed: true } }] });
passedCreative.posts[0].imageIntentionallyOmitted = false;
assert.equal(checkBy(project(passedCreative), "creative").status.label, "Passed");

const disconnected = baseState({ socialAccounts: [] });
result = project(disconnected);
assert.equal(result.state.label, "Needs connection");
assert.equal(result.nextStep.label, "Connect LinkedIn");
assert.equal(result.nextStep.href, "#settings");

const connectionSourceAbsent = baseState();
delete connectionSourceAbsent.socialAccounts;
result = project(connectionSourceAbsent);
assert.equal(checkBy(result, "channel_linkedin").status.label, "Unavailable");
assert.equal(result.state.label, "Unavailable");

const gateOff = baseState({ runtime: { livePostingGates: { linkedin: { enabled: false } } } });
gateOff.posts[0].scheduledFor = "2026-07-20T10:00:00.000Z";
result = project(gateOff);
assert.equal(result.state.label, "Publishing is off");
assert.match(checkBy(result, "channel_linkedin").explanation, /connected, but publishing is off/);
assert.match(checkBy(result, "publishing").explanation, /Publishing is off/);
assert.equal(result.nextStep.href, "#settings");

const mixedChannels = baseState({
  socialAccounts: [{ id: "account-linkedin", platform: "linkedin", status: "connected", connectedAt: NOW }],
  runtime: { livePostingGates: { linkedin: { enabled: true }, x: { enabled: true } } }
});
mixedChannels.posts[0].targetChannels = ["x", "linkedin"];
result = project(mixedChannels);
assert.equal(result.state.label, "Needs connection");
assert.equal(checkBy(result, "channel_linkedin").status.label, "Passed");
assert.equal(checkBy(result, "channel_x").status.label, "Blocked");

const validSchedule = baseState();
validSchedule.posts[0].scheduledFor = "2026-07-20T10:00:00.000Z";
result = project(validSchedule);
assert.equal(checkBy(result, "schedule").status.label, "Passed");
assert.equal(result.state.label, "Ready to publish");

const invalidSchedule = baseState();
invalidSchedule.posts[0].scheduledFor = "tomorrow morning";
result = project(invalidSchedule);
assert.equal(checkBy(result, "schedule").status.label, "Blocked");
assert.equal(result.state.label, "Needs fixes");

const conflictingSchedule = baseState();
Object.assign(conflictingSchedule.posts[0], { scheduledFor: "2026-07-20T10:00:00.000Z", scheduleStatus: "conflict" });
assert.equal(checkBy(project(conflictingSchedule), "schedule").status.label, "Blocked");

const missingRequiredSchedule = baseState();
missingRequiredSchedule.posts[0].scheduleRequired = true;
result = project(missingRequiredSchedule);
assert.equal(result.state.label, "Needs schedule");
assert.equal(result.nextStep.label, "Choose a schedule");

const approvalRequired = baseState();
Object.assign(approvalRequired.posts[0], { status: "draft", approvalStatus: "required" });
assert.equal(project(approvalRequired).state.label, "Ready for review");

const awaitingApproval = baseState();
Object.assign(awaitingApproval.posts[0], { status: "draft", approvalStatus: "awaiting_approval" });
result = project(awaitingApproval);
assert.equal(result.state.label, "Needs approval");
assert.equal(result.nextStep.label, "Request approval");
assert.equal(result.nextStep.href, "#queue");

const approvalChanges = baseState();
Object.assign(approvalChanges.posts[0], { status: "draft", approvalStatus: "changes_requested" });
result = project(approvalChanges);
assert.equal(result.state.label, "Needs fixes");
assert.equal(result.headline, "1 fix before scheduling");
assert.equal(result.nextStep.label, "Fix requested changes");

const typedApproval = baseState({
  approvals: [],
  approvalQueue: [{ id: "approval-typed", type: "Post", sourceId: "post-1", status: "approved" }],
  queueItems: []
});
Object.assign(typedApproval.posts[0], { status: "draft", approvalStatus: "" });
result = project(typedApproval);
assert.equal(checkBy(result, "approval").status.label, "Passed", "typed CCX-300 Post approval relationships must be honored");

const approvedNotPublished = baseState();
approvedNotPublished.posts[0].scheduledFor = "2026-07-20T10:00:00.000Z";
result = project(approvedNotPublished);
assert.equal(checkBy(result, "approval").status.label, "Passed");
assert.notEqual(result.state.label, "Published", "approval must not imply publication");

const noApprovalNeeded = baseState();
Object.assign(noApprovalNeeded.posts[0], { status: "draft", approvalStatus: "", approvalRequired: false });
assert.equal(checkBy(project(noApprovalNeeded), "approval").explanation, "Approval is explicitly not required.");

const manual = baseState({ runtime: { livePostingGates: { linkedin: { enabled: false } } } });
Object.assign(manual.posts[0], { scheduledFor: "2026-07-20T10:00:00.000Z", manualPublishingAvailable: true });
result = project(manual);
assert.equal(result.state.label, "Publishing is off");
assert.equal(result.nextStep.label, "Publish manually");

const scheduled = baseState();
Object.assign(scheduled.posts[0], { status: "scheduled", scheduledFor: "2026-07-20T10:00:00.000Z", per_channel_publish_status: { linkedin: "scheduled" } });
result = project(scheduled);
assert.match(checkBy(result, "publishing").explanation, /scheduled but has not been published/);

const published = baseState();
Object.assign(published.posts[0], { status: "posted", per_channel_publish_status: { linkedin: "posted" }, posted_at: "2026-07-18T11:00:00.000Z" });
result = project(published);
assert.equal(result.state.label, "Published");
assert.equal(result.nextStep.label, "Open published result");
assert.equal(checkBy(result, "publishing_results").status.label, "Unavailable", "missing analytics must remain unavailable");

const partial = baseState({
  socialAccounts: [
    { id: "account-linkedin", platform: "linkedin", status: "connected", connectedAt: NOW },
    { id: "account-x", platform: "x", status: "connected", connectedAt: NOW }
  ],
  runtime: { livePostingGates: { linkedin: true, x: true } }
});
Object.assign(partial.posts[0], { targetChannels: ["linkedin", "x"], per_channel_publish_status: { linkedin: "posted", x: "failed" } });
result = project(partial);
assert.match(checkBy(result, "publishing").explanation, /partial channel result/);
assert.notEqual(result.state.label, "Published");

const ambiguousGlobalPublication = clone(partial);
Object.assign(ambiguousGlobalPublication.posts[0], { status: "posted", per_channel_publish_status: {} });
result = project(ambiguousGlobalPublication);
assert.equal(checkBy(result, "publishing").status.label, "Unavailable", "global publication must not fabricate per-channel results");
assert.notEqual(result.state.label, "Published");

const unavailableSources = baseState({ runtime: {} });
result = project(unavailableSources);
assert.equal(checkBy(result, "channel_linkedin").status.label, "Unavailable", "missing gate truth must remain unavailable per selected channel");
assert.equal(checkBy(result, "publishing").status.label, "Unavailable");
assert.equal(result.state.label, "Unavailable");

const missingScheduleSource = baseState();
delete missingScheduleSource.posts[0].scheduledFor;
result = project(missingScheduleSource);
assert.equal(checkBy(result, "schedule").status.label, "Unavailable");
assert.equal(result.sourceAvailability.schedule, false);

const missingAccountSource = baseState();
delete missingAccountSource.socialAccounts;
result = project(missingAccountSource);
assert.equal(checkBy(result, "channel_linkedin").status.label, "Unavailable");

const recordOnlyAccount = baseState({ socialAccounts: [{ id: "account-linkedin", platform: "linkedin", status: "connected" }] });
assert.equal(checkBy(project(recordOnlyAccount), "channel_linkedin").status.label, "Blocked", "a connection record alone must not establish connection truth");

const missingActor = project(baseState(), {});
assert.equal(missingActor.available, false);
assert.equal(missingActor.availability.reason, "actor_cannot_read");
assert.equal(missingActor.state.label, "Unavailable");
assert.deepEqual(missingActor.checks, []);
assert.equal(project(baseState(), { authenticated: true, role: "mystery" }).state.label, "Unavailable");

const hiddenState = baseState();
hiddenState.posts[0].ownerOnly = true;
const hidden = project(hiddenState, operator);
const absent = project(baseState(), operator, "post-does-not-exist");
assert.equal(hidden.state.label, absent.state.label, "hidden Post must be indistinguishable from absent Post");
assert.equal(hidden.headline, absent.headline);
assert.ok(!JSON.stringify(hidden).includes("plain-language update"), "hidden Post content must not leak");
assert.equal(hidden.counts.total, null, "hidden records must not affect counts");

const unsafeIdState = baseState();
unsafeIdState.posts[0].id = "https://storage.example.com/private?token=secret";
assert.equal(project(unsafeIdState, owner, unsafeIdState.posts[0].id).state.label, "Unavailable", "unsafe source IDs must fail closed");

const hiddenRelatedState = baseState({
  postImages: [
    { id: "image-visible", postId: "post-1", versionNumber: 1, finalImageReady: true, renderQa: { passed: true }, styleGate: { passed: true } },
    { id: "image-hidden", postId: "post-1", versionNumber: 2, ownerOnly: true, generationStatus: "qa_failed", renderQa: { passed: false } }
  ]
});
hiddenRelatedState.posts[0].imageIntentionallyOmitted = false;
result = project(hiddenRelatedState, operator);
assert.equal(checkBy(result, "creative").status.label, "Passed", "hidden related records must not change checks");
assert.equal(result.performance.sourceCandidatesExamined, 3, "hidden related records must not affect diagnostic counts");

const deterministicState = baseState({
  approvals: [
    { id: "approval-b", postId: "post-1", status: "approved", updatedAt: "2026-07-02T00:00:00.000Z" },
    { id: "approval-a", postId: "post-1", status: "pending", updatedAt: "2026-07-01T00:00:00.000Z" }
  ],
  socialAccounts: [
    { id: "account-z", platform: "linkedin", status: "connected", connectedAt: NOW },
    { id: "account-a", platform: "linkedin", status: "connected", connectedAt: NOW },
    { id: "account-newer-but-unproven", platform: "linkedin", status: "connected", updatedAt: "2026-07-19T00:00:00.000Z" }
  ],
  publishEvents: [
    { id: "publish-old", postId: "post-1", channel: "linkedin", status: "scheduled", occurredAt: "2026-07-01T00:00:00.000Z" },
    { id: "publish-new", postId: "post-1", channel: "linkedin", status: "published", occurredAt: "2026-07-02T00:00:00.000Z" }
  ]
});
delete deterministicState.posts[0].approvalStatus;
const first = project(deterministicState);
const reordered = clone(deterministicState);
for (const key of ["posts", "approvals", "socialAccounts", "publishEvents"]) reordered[key].reverse();
assert.deepEqual(project(reordered), first, "input order must not affect projection output");
assert.deepEqual(project(deterministicState), first, "same input and supplied clock must be deterministic");
assert.equal(checkBy(first, "channel_linkedin").status.label, "Passed", "an unproven duplicate account must not displace durable connection truth");
assert.ok(recursivelyFrozen(first), "result must be recursively immutable");
assert.ok(recursivelyFrozen(POST_READINESS_CHECK_MATRIX), "check-category matrix must be recursively immutable");
assert.throws(() => { first.checks.push({}); }, TypeError);

const sensitiveState = baseState();
Object.assign(sensitiveState.posts[0], {
  privatePath: "/private/social/post-1.png",
  signedUrl: "https://example.com/private?token=secret",
  providerPayload: { raw: "private" },
  guidelinesGate: { passed: false, hardFails: [{ ruleId: "outcome_promise", providerPayload: "private" }] }
});
Object.assign(sensitiveState.socialAccounts[0], {
  accessTokenEncrypted: "encrypted-token",
  refreshTokenEncrypted: "encrypted-refresh",
  externalAccountId: "provider-account-private"
});
const privacyText = JSON.stringify(project(sensitiveState));
for (const forbidden of ["accessTokenEncrypted", "refreshTokenEncrypted", "idempotency", "privatePath", "signedUrl", "providerPayload", "process.env"]) {
  assert.ok(!privacyText.includes(forbidden), `output must omit ${forbidden}`);
}
assert.ok(!privacyText.includes("provider-account-private"), "provider account identity must not be projected");

const moduleSource = [
  readFileSync(new URL("./ui/view-models/post-readiness-sources.mjs", import.meta.url), "utf8"),
  readFileSync(new URL("./ui/view-models/post-readiness.mjs", import.meta.url), "utf8")
].join("\n");
for (const forbiddenImport of ["preview-server", "browser", "playwright", "storage", "social-publish-service", "provider", "fetch("]) {
  assert.ok(!moduleSource.includes(`from \"${forbiddenImport}`) && !moduleSource.includes(`from '../${forbiddenImport}`) && !moduleSource.includes(`from \"../../${forbiddenImport}`), `pure modules must not import ${forbiddenImport}`);
}
assert.ok(!/\b(?:approvePost|schedulePost|publishPost|sendPost|saveState|writeState)\s*\(/.test(moduleSource), "projection must not contain mutation calls");
for (const forbiddenRuntime of [/\bprocess\.env\b/, /\bDate\.now\s*\(/, /\bfetch\s*\(/, /\b(?:window|document|localStorage|sessionStorage)\b/, /node:fs/]) {
  assert.doesNotMatch(moduleSource, forbiddenRuntime, `projection must remain runtime-free: ${forbiddenRuntime}`);
}
const previewServerSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
assert.doesNotMatch(previewServerSource, /view-models\/post-readiness(?:-sources)?\.mjs/, "CCX-305 must not add an endpoint, page, or runtime import");

const benchmarkState = baseState({ posts: [], postImages: [], approvals: [] });
for (let index = 0; index < 100; index += 1) {
  benchmarkState.posts.push({
    ...clone(baseState().posts[0]),
    id: `post-benchmark-${String(index).padStart(3, "0")}`,
    scheduledFor: "2026-07-20T10:00:00.000Z",
    imageIntentionallyOmitted: false
  });
  benchmarkState.postImages.push({
    id: `image-benchmark-${String(index).padStart(3, "0")}`,
    postId: `post-benchmark-${String(index).padStart(3, "0")}`,
    finalImageReady: true,
    renderQa: { passed: true },
    styleGate: { passed: true }
  });
}
const benchmarkBefore = JSON.stringify(benchmarkState);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("Social readiness projection attempted a network request.");
};
const started = performance.now();
let projections;
try {
  projections = benchmarkState.posts.map((post) => buildPostReadiness(benchmarkState, owner, post.id, NOW));
} finally {
  globalThis.fetch = originalFetch;
}
const elapsed = performance.now() - started;
assert.equal(projections.length, 100);
assert.equal(JSON.stringify(benchmarkState), benchmarkBefore, "benchmark must not mutate sources");
assert.ok(elapsed < 2000, `100 projections should remain adapter-scale (${elapsed.toFixed(3)} ms)`);
const benchmark = {
  projections: projections.length,
  sourceCandidatesExamined: projections.reduce((sum, item) => sum + item.performance.sourceCandidatesExamined, 0),
  checksProduced: projections.reduce((sum, item) => sum + item.counts.total, 0),
  blockingChecks: projections.reduce((sum, item) => sum + item.checks.filter((check) => check.blocking && check.status.key !== "passed").length, 0),
  unavailableChecks: projections.reduce((sum, item) => sum + item.counts.unavailable, 0),
  projectionMs: Number(elapsed.toFixed(3)),
  serializedBytes: Buffer.byteLength(JSON.stringify(projections)),
  networkRequests,
  storageWrites: 0,
  sourceMutations: 0,
  approvals: 0,
  schedules: 0,
  sendsOrPublications: 0,
  providerCalls: 0,
  externalActions: 0,
  scope: "adapter benchmark, not an unpaginated endpoint proposal"
};

console.log("PASS test-vnext-social-readiness");
console.log(JSON.stringify(benchmark));
