#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { buildPostSchedulePlan, POST_SCHEDULE_PLAN_STATES } from "./ui/view-models/post-schedule-plan.mjs";
import {
  collectPostSchedulePlanSources,
  POST_SCHEDULE_PLAN_SOURCE_MATRIX
} from "./ui/view-models/post-schedule-plan-sources.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const FUTURE = "2026-07-20T14:00:00.000Z";
const POST_ID = "schedule-post-01";
const ACTOR = Object.freeze({ authenticated: true, role: "operator", id: "synthetic-operator" });

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
        { id: "variant-facebook", channel: "facebook", body: "Preserved unselected Facebook caption.", scheduledFor: "2026-07-21T10:00:00.000Z", timezone: "UTC" }
      ],
      scheduledFor: FUTURE,
      timezone: "America/New_York",
      scheduleStatus: "valid",
      approvalRequired: true,
      approvalStatus: "approved",
      approvedAt: "2026-07-18T11:00:00.000Z",
      status: "scheduled",
      perChannelPublishStatus: { linkedin: "scheduled", instagram: "scheduled" },
      guidelinesGate: { passed: true, hardFails: [] },
      copyReviewed: true,
      imageIntentionallyOmitted: true,
      finalPreviewConfirmed: true,
      updatedAt: "2026-07-18T11:30:00.000Z",
      providerPayload: { accessToken: "must-not-project" },
      privatePath: "/private/must-not-project.json"
    }],
    postImages: [],
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
    approvals: [{ id: "approval-01", type: "post", sourceId: POST_ID, status: "approved" }],
    approvalQueue: [],
    queueItems: [],
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
  assert.equal(Object.isFrozen(value), true, "Every schedule-plan object and array must be frozen.");
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function planFor(state) {
  return buildPostSchedulePlan(state, ACTOR, POST_ID, NOW);
}

function sourcesFor(state) {
  return collectPostSchedulePlanSources(state, ACTOR, POST_ID, NOW);
}

assert.equal(typeof buildPostSchedulePlan, "function");
assert.equal(typeof collectPostSchedulePlanSources, "function");
assert.deepEqual(Object.values(POST_SCHEDULE_PLAN_STATES).map((state) => state.label), [
  "Unscheduled", "Schedule missing", "Scheduled", "Invalid schedule", "Schedule conflict", "Already published", "Unavailable"
]);
assert.deepEqual(POST_SCHEDULE_PLAN_SOURCE_MATRIX.map((item) => item.source), [
  "CCX-300 PostView",
  "CCX-302A ComposerDraftView",
  "CCX-304A Post channel variants",
  "CCX-305 Social readiness",
  "posts schedule fields",
  "visible channel variants",
  "publishEvents / per-channel result map"
]);

const state = fixtureState();
const before = structuredClone(state);
const plan = planFor(state);
assert.deepEqual(state, before, "Schedule projection must not mutate any source.");
assert.equal(plan.postId, POST_ID);
assert.equal(plan.href, "#social/post/schedule-post-01");
assert.equal(plan.generatedAt, NOW);
assert.equal(plan.state.key, "scheduled");
assert.equal(plan.scheduledAt, FUTURE);
assert.equal(plan.timezone, "America/New_York");
assert.deepEqual(plan.selectedChannels, ["linkedin", "instagram"]);
assert.deepEqual(plan.channelPlans.map((item) => item.channel), ["linkedin", "instagram"]);
assert.ok(plan.channelPlans.every((item) => item.state === "shared_schedule"));
assert.ok(plan.channelPlans.every((item) => item.scheduledAt === null), "A shared schedule is not copied into channel records.");
assert.ok(plan.channelPlans.every((item) => item.publicationState === "scheduled"));
assert.equal(plan.conflicts.length, 0);
assert.ok(plan.guidance.every((item) => item.executable === false));
assert.deepEqual(Object.values(plan.capabilities), Array(Object.keys(plan.capabilities).length).fill(false));
assert.doesNotMatch(JSON.stringify(plan), /must-not-project|\/private\/|accessToken|providerPayload/);

// An absent schedule is truthfully unscheduled; approval does not create one.
const unscheduledState = fixtureState();
delete unscheduledState.posts[0].scheduledFor;
delete unscheduledState.posts[0].timezone;
unscheduledState.posts[0].status = "approved";
unscheduledState.posts[0].perChannelPublishStatus = {};
const unscheduled = planFor(unscheduledState);
assert.equal(unscheduled.state.key, "unscheduled");
assert.equal(unscheduled.scheduledAt, null);
assert.equal(unscheduled.timezone, null);
assert.ok(unscheduled.guidance.some((item) => item.key === "no_schedule_selected"));

const missingState = fixtureState();
missingState.posts[0].scheduledFor = "";
const missing = planFor(missingState);
assert.equal(missing.state.key, "schedule_missing");
assert.equal(missing.scheduledAt, null);

const invalidState = fixtureState();
invalidState.posts[0].scheduledFor = "tomorrow morning";
const invalid = planFor(invalidState);
assert.equal(invalid.state.key, "invalid_schedule");
assert.equal(invalid.scheduledAt, "tomorrow morning", "Invalid stored text remains exact and visibly invalid.");
assert.ok(invalid.conflicts.some((item) => item.key === "invalid_stored_time"));

// Current runtime truth classifies a valid past time as due, not invalid.
const pastState = fixtureState();
pastState.posts[0].scheduledFor = "2026-07-18T11:59:00.000Z";
const past = planFor(pastState);
assert.equal(past.state.key, "scheduled");
assert.ok(past.guidance.some((item) => item.key === "schedule_due_or_past"));
assert.ok(!past.conflicts.some((item) => item.key === "invalid_stored_time"));

const conflictState = fixtureState();
conflictState.posts[0].scheduleStatus = "conflict";
const conflicted = planFor(conflictState);
assert.equal(conflicted.state.key, "schedule_conflict");
assert.ok(conflicted.conflicts.some((item) => item.key === "explicit_schedule_conflict"));

const explicitRecordState = fixtureState();
explicitRecordState.scheduleConflicts = [{ id: "conflict-01", postId: POST_ID, channel: "linkedin", status: "active" }];
const explicitRecord = planFor(explicitRecordState);
assert.equal(explicitRecord.state.key, "schedule_conflict");
assert.equal(explicitRecord.conflicts[0].channel, "linkedin");

const resolvedConflictState = fixtureState();
resolvedConflictState.scheduleConflicts = [{ id: "conflict-resolved", postId: POST_ID, channel: "linkedin", status: "resolved" }];
const resolvedConflict = planFor(resolvedConflictState);
assert.equal(resolvedConflict.state.key, "scheduled");
assert.ok(!resolvedConflict.conflicts.some((item) => item.key === "explicit_schedule_conflict"));

const historicalConflictState = fixtureState();
historicalConflictState.scheduleConflicts = [{
  id: "conflict-history", postId: POST_ID, channel: "linkedin", status: "active", resolvedAt: "2026-07-17T10:00:00.000Z"
}];
const historicalConflict = planFor(historicalConflictState);
assert.equal(historicalConflict.state.key, "scheduled");
assert.equal(historicalConflict.conflicts.length, 0);

const hiddenConflictState = fixtureState();
hiddenConflictState.scheduleConflicts = [{ id: "conflict-hidden", postId: POST_ID, channel: "linkedin", status: "active", ownerOnly: true }];
const hiddenConflict = planFor(hiddenConflictState);
assert.equal(hiddenConflict.state.key, "scheduled");
assert.equal(hiddenConflict.conflicts.length, 0);
assert.equal(hiddenConflict.performance.sourceCandidatesExamined, plan.performance.sourceCandidatesExamined);
assert.deepEqual(hiddenConflict.availability.counts, plan.availability.counts);

const unknownConflictState = fixtureState();
unknownConflictState.scheduleConflicts = [{ id: "conflict-unknown", postId: POST_ID, channel: "linkedin", status: "maybe" }];
const unknownConflict = planFor(unknownConflictState);
assert.equal(unknownConflict.state.key, "scheduled");
assert.equal(unknownConflict.conflicts.length, 0);
assert.equal(unknownConflict.availability.key, "partial", "Unknown lifecycle truth fails closed instead of becoming active.");

// Channel-specific schedules are exact stored truth and never copied from shared fields.
const channelState = fixtureState();
channelState.posts[0].channelSchedules = {
  linkedin: { scheduledFor: FUTURE, timezone: "America/New_York", scheduleStatus: "valid" }
};
const channel = planFor(channelState);
const linkedin = channel.channelPlans.find((item) => item.channel === "linkedin");
const instagram = channel.channelPlans.find((item) => item.channel === "instagram");
assert.equal(linkedin.state, "scheduled");
assert.equal(linkedin.scheduledAt, FUTURE);
assert.equal(linkedin.timezone, "America/New_York");
assert.equal(linkedin.sourceReference.relationship, "channel_schedule:channelSchedules:linkedin");
assert.equal(instagram.state, "shared_schedule");
assert.equal(instagram.scheduledAt, null);

const variantScheduleState = fixtureState();
variantScheduleState.posts[0].channelVariants[0].scheduledFor = FUTURE;
variantScheduleState.posts[0].channelVariants[0].timezone = "America/New_York";
const variantSchedule = planFor(variantScheduleState);
assert.equal(variantSchedule.channelPlans[0].scheduledAt, FUTURE);
assert.equal(variantSchedule.channelPlans[0].sourceReference.collection, "posts.channelVariants");

const inconsistentState = fixtureState();
inconsistentState.posts[0].channelSchedules = {
  linkedin: { scheduledFor: "2026-07-20T15:00:00.000Z", timezone: "America/New_York" }
};
const inconsistent = planFor(inconsistentState);
assert.equal(inconsistent.state.key, "schedule_conflict");
assert.ok(inconsistent.conflicts.some((item) => item.key === "inconsistent_channel_schedule" && item.channel === "linkedin"));

// Stored variants for unselected channels remain outside channel plans.
assert.ok(!plan.channelPlans.some((item) => item.channel === "facebook"));

// Approval, scheduling, and publication remain separate stored truths.
const approvedUnscheduledState = fixtureState();
approvedUnscheduledState.posts[0].status = "approved";
approvedUnscheduledState.posts[0].scheduledFor = "";
approvedUnscheduledState.posts[0].perChannelPublishStatus = {};
const approvedUnscheduled = planFor(approvedUnscheduledState);
assert.equal(approvedUnscheduled.state.key, "unscheduled");

const publishedState = fixtureState();
publishedState.posts[0].status = "published";
publishedState.posts[0].publishedAt = "2026-07-18T11:45:00.000Z";
publishedState.posts[0].perChannelPublishStatus = { linkedin: "published", instagram: "success" };
const published = planFor(publishedState);
assert.equal(published.state.key, "already_published");
assert.ok(published.channelPlans.every((item) => item.state === "already_published"));

const partialState = fixtureState();
partialState.posts[0].perChannelPublishStatus = { linkedin: "published", instagram: "failed" };
const partial = planFor(partialState);
assert.equal(partial.state.key, "scheduled");
assert.equal(partial.channelPlans.find((item) => item.channel === "linkedin").state, "already_published");
assert.equal(partial.channelPlans.find((item) => item.channel === "instagram").state, "failed_publication");
assert.ok(partial.guidance.some((item) => item.key === "preserve_published_channels"));

const retryState = structuredClone(partialState);
retryState.posts[0].retryChannels = ["linkedin", "instagram"];
const retry = planFor(retryState);
assert.equal(retry.state.key, "schedule_conflict");
assert.ok(retry.conflicts.some((item) => item.key === "published_channel_in_retry_plan" && item.channel === "linkedin"));

// Offset-less local times resolve only through their exact stored IANA timezone.
const easternLocalState = fixtureState();
easternLocalState.posts[0].scheduledFor = "2026-07-20T14:00:00";
easternLocalState.posts[0].timezone = "America/New_York";
const easternLocalSources = sourcesFor(easternLocalState);
const easternLocal = planFor(easternLocalState);
assert.equal(easternLocalSources.sharedSchedule.instantState, "resolved");
assert.equal(easternLocalSources.sharedSchedule.epochMs, Date.parse("2026-07-20T18:00:00Z"));
assert.notEqual(easternLocalSources.sharedSchedule.epochMs, Date.parse("2026-07-20T14:00:00Z"));
assert.equal(easternLocal.state.key, "scheduled");

const coastDifferenceState = structuredClone(easternLocalState);
coastDifferenceState.posts[0].channelSchedules = {
  linkedin: { scheduledFor: "2026-07-20T14:00:00", timezone: "America/Los_Angeles" }
};
const coastDifferenceSources = sourcesFor(coastDifferenceState);
const coastDifference = planFor(coastDifferenceState);
assert.notEqual(
  coastDifferenceSources.sharedSchedule.epochMs,
  coastDifferenceSources.channelSchedules.find((item) => item.channel === "linkedin").candidate.epochMs
);
assert.ok(coastDifference.conflicts.some((item) => item.key === "inconsistent_channel_schedule"));

const equivalentInstantState = structuredClone(easternLocalState);
equivalentInstantState.posts[0].channelSchedules = {
  linkedin: { scheduledFor: "2026-07-20T18:00:00Z", timezone: "America/Los_Angeles" }
};
const equivalentInstant = planFor(equivalentInstantState);
assert.ok(!equivalentInstant.conflicts.some((item) => item.key === "inconsistent_channel_schedule"));
assert.equal(equivalentInstant.channelPlans.find((item) => item.channel === "linkedin").state, "scheduled");

const identicalLocalState = structuredClone(easternLocalState);
identicalLocalState.posts[0].channelSchedules = {
  linkedin: { scheduledFor: "2026-07-20T14:00:00", timezone: "America/New_York" }
};
const identicalLocal = planFor(identicalLocalState);
assert.ok(!identicalLocal.conflicts.some((item) => ["inconsistent_channel_schedule", "comparison_unavailable"].includes(item.key)));

const unavailableComparisonState = fixtureState();
unavailableComparisonState.posts[0].scheduledFor = "2026-07-20T14:00:00";
delete unavailableComparisonState.posts[0].timezone;
unavailableComparisonState.posts[0].channelSchedules = {
  linkedin: { scheduledFor: "2026-07-20T18:00:00Z", timezone: "UTC" }
};
const unavailableComparison = planFor(unavailableComparisonState);
assert.equal(unavailableComparison.state.key, "scheduled");
assert.ok(unavailableComparison.conflicts.some((item) => item.key === "comparison_unavailable"));
assert.ok(!unavailableComparison.conflicts.some((item) => item.key === "inconsistent_channel_schedule"));
assert.equal(unavailableComparison.availability.key, "partial");

// Offset-less stored time without timezone remains exact but has no fabricated instant.
const missingTimezoneState = fixtureState();
missingTimezoneState.posts[0].scheduledFor = "2026-07-18T11:00:00";
delete missingTimezoneState.posts[0].timezone;
const missingTimezoneSources = sourcesFor(missingTimezoneState);
const missingTimezone = planFor(missingTimezoneState);
assert.equal(missingTimezone.state.key, "scheduled");
assert.equal(missingTimezone.scheduledAt, "2026-07-18T11:00:00");
assert.equal(missingTimezone.timezone, null);
assert.equal(missingTimezoneSources.sharedSchedule.epochMs, null);
assert.equal(missingTimezoneSources.sharedSchedule.instantState, "unavailable");
assert.equal(missingTimezone.availability.key, "partial");
assert.ok(missingTimezone.guidance.some((item) => item.key === "timezone_unavailable"));
assert.ok(!missingTimezone.guidance.some((item) => item.key === "schedule_due_or_past"));

const invalidTimezoneState = fixtureState();
invalidTimezoneState.posts[0].scheduledFor = "2026-07-20T14:00:00";
invalidTimezoneState.posts[0].timezone = "Not/A_Timezone";
const invalidTimezone = planFor(invalidTimezoneState);
assert.equal(invalidTimezone.state.key, "invalid_schedule");
assert.equal(invalidTimezone.timezone, "Not/A_Timezone");
assert.ok(invalidTimezone.conflicts.some((item) => item.key === "invalid_timezone"));

const springGapState = fixtureState();
springGapState.posts[0].scheduledFor = "2026-03-08T02:30:00";
springGapState.posts[0].timezone = "America/New_York";
const springGapSources = sourcesFor(springGapState);
const springGap = planFor(springGapState);
assert.equal(springGapSources.sharedSchedule.instantState, "nonexistent");
assert.equal(springGap.state.key, "invalid_schedule");
assert.ok(springGap.conflicts.some((item) => item.key === "nonexistent_local_time"));
assert.ok(!springGap.guidance.some((item) => item.key === "schedule_due_or_past"));

const fallFoldState = fixtureState();
fallFoldState.posts[0].scheduledFor = "2026-11-01T01:30:00";
fallFoldState.posts[0].timezone = "America/New_York";
const fallFoldSources = sourcesFor(fallFoldState);
const fallFold = planFor(fallFoldState);
assert.equal(fallFoldSources.sharedSchedule.instantState, "ambiguous");
assert.equal(fallFoldSources.sharedSchedule.epochMs, null);
assert.equal(fallFold.state.key, "schedule_conflict");
assert.ok(fallFold.conflicts.some((item) => item.key === "ambiguous_local_time"));

const foldEarlyState = fixtureState();
foldEarlyState.posts[0].scheduledFor = "2026-11-01T01:30:00-04:00";
foldEarlyState.posts[0].timezone = "America/New_York";
const foldLateState = fixtureState();
foldLateState.posts[0].scheduledFor = "2026-11-01T01:30:00-05:00";
foldLateState.posts[0].timezone = "America/New_York";
const foldEarlySources = sourcesFor(foldEarlyState);
const foldLateSources = sourcesFor(foldLateState);
assert.equal(foldEarlySources.sharedSchedule.instantState, "resolved");
assert.equal(foldLateSources.sharedSchedule.instantState, "resolved");
assert.notEqual(foldEarlySources.sharedSchedule.epochMs, foldLateSources.sharedSchedule.epochMs);
assert.equal(planFor(foldEarlyState).state.key, "scheduled");
assert.equal(planFor(foldLateState).state.key, "scheduled");

// Date-only values reuse the current runtime Date parsing rule without adapter-added midnight text.
const dateOnlyState = fixtureState();
dateOnlyState.posts[0].scheduledFor = "2026-07-20";
delete dateOnlyState.posts[0].timezone;
const dateOnlySources = sourcesFor(dateOnlyState);
const dateOnly = planFor(dateOnlyState);
assert.equal(dateOnlySources.sharedSchedule.kind, "date_only");
assert.equal(dateOnlySources.sharedSchedule.epochMs, Date.parse("2026-07-20"));
assert.equal(dateOnly.scheduledAt, "2026-07-20");
assert.equal(dateOnly.state.key, "scheduled");
assert.equal(dateOnly.availability.key, "available");

// Hidden variant schedules are filtered before sources and counts.
const hiddenVariantState = fixtureState();
hiddenVariantState.posts[0].channelVariants[0].ownerOnly = true;
hiddenVariantState.posts[0].channelVariants[0].scheduledFor = "2026-07-25T10:00:00.000Z";
const hiddenVariant = planFor(hiddenVariantState);
assert.equal(hiddenVariant.channelPlans.find((item) => item.channel === "linkedin").state, "shared_schedule");
assert.equal(hiddenVariant.channelPlans.find((item) => item.channel === "linkedin").sourceReference, null);
assert.equal(hiddenVariant.channelPlans.length, 2);

// Missing actors and hidden Posts fail closed with no identifier, href, sources, or counts.
for (const actor of [{}, { authenticated: true, role: "unknown" }]) {
  const unavailable = buildPostSchedulePlan(fixtureState(), actor, POST_ID, NOW);
  assert.equal(unavailable.postId, null);
  assert.equal(unavailable.href, null);
  assert.equal(unavailable.availability.key, "unavailable");
  assert.equal(unavailable.availability.counts, null);
}
const hiddenPostState = fixtureState();
hiddenPostState.posts[0].ownerOnly = true;
const hiddenPost = planFor(hiddenPostState);
assert.equal(hiddenPost.postId, null);
assert.equal(hiddenPost.href, null);
assert.deepEqual(hiddenPost.sourceReferences, []);
assert.equal(hiddenPost.performance.postsProjected, 0);

const invalidClock = buildPostSchedulePlan(fixtureState(), ACTOR, POST_ID, "not-a-clock");
assert.equal(invalidClock.postId, null);
assert.equal(invalidClock.availability.reason, "clock_unavailable");

// Sorting, input order, determinism, and deep immutability.
assert.deepEqual(planFor(fixtureState()), plan);
assert.deepEqual(planFor(reverseArrays(fixtureState())), plan);
const orderedConflictState = fixtureState();
orderedConflictState.scheduleConflicts = [
  { id: "conflict-active", postId: POST_ID, channel: "instagram", status: "open" },
  { id: "conflict-old", postId: POST_ID, channel: "linkedin", status: "closed" }
];
assert.deepEqual(planFor(orderedConflictState), planFor(reverseArrays(orderedConflictState)));
assertDeepFrozen(plan);
assert.throws(() => { plan.channelPlans.push({}); }, TypeError);

const sourceFiles = [
  "scripts/ui/view-models/post-schedule-plan-sources.mjs",
  "scripts/ui/view-models/post-schedule-plan.mjs"
];
const pureSource = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
for (const forbiddenImport of ["preview-server", "playwright", "browser", "social-publish-service", "provider", "storage.mjs", "database", ".css"]) {
  assert.doesNotMatch(pureSource, new RegExp(`from ["'][^"']*${forbiddenImport}`, "i"));
}
for (const forbiddenBehavior of [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\b(?:localStorage|sessionStorage)\b/,
  /\b(?:writeFile|appendFile|unlink|rename|mkdir)\s*\(/,
  /(?:^|[^\w])(?:send|publish|approve|save|update|delete|generateImage)\s*\(/im
]) assert.doesNotMatch(pureSource, forbiddenBehavior);
assert.doesNotMatch(pureSource, /Date\.now\s*\(|new Date\(\s*\)/, "The supplied now value must be the only clock.");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /view-models\/post-schedule-plan/, "CCX-306A must not add runtime or browser wiring.");

function benchmarkFixture() {
  const benchmark = fixtureState();
  const basePost = benchmark.posts[0];
  benchmark.posts = Array.from({ length: 100 }, (_, index) => {
    const postId = `benchmark-schedule-${String(index).padStart(3, "0")}`;
    const scheduledFor = index % 5 === 0
      ? `2026-07-${String(20 + (index % 8)).padStart(2, "0")}T14:00:00`
      : `2026-07-${String(20 + (index % 8)).padStart(2, "0")}T14:00:00.000Z`;
    return {
      ...structuredClone(basePost),
      id: postId,
      title: `Detailed schedule ${index}`,
      body: `Stored schedule caption ${index}.`,
      targetChannels: ["linkedin", "instagram", "facebook", "x", "threads"],
      scheduledFor,
      timezone: index % 5 === 0 ? "" : "America/New_York",
      scheduleStatus: index % 10 === 0 ? "conflict" : "valid",
      perChannelPublishStatus: { linkedin: "scheduled", instagram: "scheduled", facebook: "scheduled", x: "scheduled", threads: "scheduled" },
      channelVariants: ["linkedin", "instagram", "facebook", "x", "threads"].map((channel) => ({
        id: `${postId}-${channel}`,
        channel,
        body: `${channel} caption ${index}`,
        ...(channel === "linkedin" ? { scheduledFor, timezone: index % 5 === 0 ? "" : "America/New_York" } : {})
      }))
    };
  });
  benchmark.socialAccounts = ["linkedin", "instagram", "facebook", "x", "threads"].map((channel) => ({
    id: `benchmark-account-${channel}`, platform: channel, status: "connected", connected: true
  }));
  benchmark.approvals = benchmark.posts.map((post, index) => ({
    id: `benchmark-approval-${index}`, type: "post", sourceId: post.id, status: "approved"
  }));
  benchmark.runtime.livePostingGates = { linkedin: true, instagram: true, facebook: true, x: true, threads: true };
  return benchmark;
}

const benchmarkState = benchmarkFixture();
const benchmarkBefore = structuredClone(benchmarkState);
const startedAt = performance.now();
const benchmarkPlans = benchmarkState.posts.map((post) => buildPostSchedulePlan(benchmarkState, ACTOR, post.id, NOW));
const projectionMs = Number((performance.now() - startedAt).toFixed(3));
assert.deepEqual(benchmarkState, benchmarkBefore);
assert.equal(benchmarkPlans.length, 100);
assert.equal(benchmarkPlans.reduce((sum, item) => sum + item.channelPlans.length, 0), 500);
assert.equal(benchmarkPlans.reduce((sum, item) => sum + item.availability.counts.conflicts, 0), 10);
assert.ok(projectionMs < 25_000, `100-schedule adapter benchmark took ${projectionMs}ms`);

const benchmark = {
  fixture: "deterministic-production-like-schedule-adapter",
  sourceCandidatesExamined: benchmarkPlans.reduce((sum, item) => sum + item.performance.sourceCandidatesExamined, 0),
  postsProjected: benchmarkPlans.length,
  channelPlans: benchmarkPlans.reduce((sum, item) => sum + item.channelPlans.length, 0),
  scheduledPlans: benchmarkPlans.reduce((sum, item) => sum + item.availability.counts.scheduledPlans, 0),
  conflicts: benchmarkPlans.reduce((sum, item) => sum + item.availability.counts.conflicts, 0),
  unavailableFields: benchmarkPlans.reduce((sum, item) => sum + item.availability.counts.unavailableFields, 0),
  projectionMs,
  serializedBytes: Buffer.byteLength(JSON.stringify(benchmarkPlans)),
  scheduleWrites: 0,
  dateMoves: 0,
  dragOperations: 0,
  approvalMutations: 0,
  publicationMutations: 0,
  retryMutations: 0,
  providerCalls: 0,
  networkRequests: 0,
  storageWrites: 0,
  sourceMutations: 0,
  postMutations: 0,
  variantMutations: 0,
  actionIntents: 0
};

console.log("PASS test-vnext-post-schedule-plan");
console.log(JSON.stringify(benchmark));
