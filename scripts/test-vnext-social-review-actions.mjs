#!/usr/bin/env node
import assert from "node:assert/strict";
import { approveSocialPost, requestSocialPostChanges } from "./social-review-actions.mjs";

const actor = { authenticated:true, id:"owner-synthetic", role:"owner" };
function state() { return { posts:[{ id:"review-post", _version:6, title:"Synthetic review", body:"Complete educational copy.", hook:"Start clearly", cta:"Read more", targetChannels:["linkedin"], approvalRequired:true, approvalStatus:"not_requested", status:"draft", guidelinesGate:{ passed:true, hardFails:[] }, copyReviewed:true, imageIntentionallyOmitted:true, finalPreviewConfirmed:true, updatedAt:"2026-07-19T10:00:00.000Z" }], postImages:[], postVersions:[], copyVersions:[], brandAssets:[], postingKits:[], generationProfiles:[], assetBundles:[], brandRules:[], library:[], socialAccounts:[{ id:"account", platform:"linkedin", status:"connected", connected:true }], approvals:[], approvalQueue:[], queueItems:[], reviewFeedback:[], reviewFeedbackRecords:[], postReviewFeedback:[], publishEvents:[], scheduleConflicts:[], contentBank:[], reports:[], dataRoomItems:[], evidencePackNotes:[], activityEvents:[], auditHistory:[], generationBatches:[], settings:{ sourceItems:[], localAssets:[] }, runtime:{ livePostingGates:{ linkedin:false } } }; }
const input = { expectedVersion:6, requestId:"review-request-1" };
let approvalRequest;
const approved = await approveSocialPost({ now:() => "2026-07-19T12:00:00.000Z", applyApproval:async (request) => { approvalRequest = request; return { ok:true, version:7, approvalId:"approval-synthetic" }; } }, state(), actor, "review-post", input);
assert.equal(approved.outcome, "approved"); assert.equal(approvalRequest.decision, "approve"); assert.equal(approvalRequest.reviewedPlan.state.key, "ready_for_review");
const blocked = state(); blocked.posts[0].guidelinesGate = { passed:false, hardFails:[{ category:"outcome promise", message:"raw" }] };
await assert.rejects(() => approveSocialPost({ applyApproval:async () => ({ ok:true }) }, blocked, actor, "review-post", input), /Resolve every/);
const already = state(); already.posts[0].approvalStatus = "approved"; already.posts[0].status = "approved";
assert.equal((await approveSocialPost({}, already, actor, "review-post", input)).outcome, "already_approved");
let feedbackRequest;
const feedback = await requestSocialPostChanges({ now:() => "2026-07-19T12:00:00.000Z", recordRequestedChanges:async (request) => { feedbackRequest = request; return { ok:true }; } }, state(), actor, "review-post", { ...input, feedbackId:"feedback-stable-1", summary:"Clarify the second sentence before approval." });
assert.equal(feedback.outcome, "changes_requested"); assert.deepEqual(feedbackRequest.sourceReference, { collection:"posts", sourceId:"review-post", relationship:"requested_change" });
await assert.rejects(() => requestSocialPostChanges({ recordRequestedChanges:async () => ({ ok:true }) }, state(), actor, "review-post", { ...input, feedbackId:"feedback-2", summary:"Inspect rawRuleId before approval." }), /private technical detail/);
const withChanges = state(); withChanges.reviewFeedback = [{ id:"open-feedback", postId:"review-post", summary:"Current requested change", status:"changes_requested" }];
await assert.rejects(() => approveSocialPost({ applyApproval:async () => ({ ok:true }) }, withChanges, actor, "review-post", input), /Resolve every/);
console.log("Social review action tests passed.");
