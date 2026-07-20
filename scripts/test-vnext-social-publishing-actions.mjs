#!/usr/bin/env node
import assert from "node:assert/strict";
import { createSocialManualPackage, publishSocialPost, safePublishedUrl } from "./social-publishing-actions.mjs";
import { buildSocialConnectionsContract } from "./social-connections-service.mjs";
import { renderSocialConnectionsPage } from "./ui/pages/social-connections.mjs";

const actor = { authenticated:true, id:"owner-synthetic", role:"owner" };
function fixture(channels = ["linkedin"]) { return { posts:[{ id:"publish-post", _version:11, title:"Synthetic Post", body:"Reviewed synthetic copy.", hook:"Clear hook", cta:"Read more", targetChannels:channels, channelVariants:channels.map((channel) => ({ id:`variant-${channel}`, channel, body:`${channel} copy` })), approvalRequired:true, approvalStatus:"approved", approvedAt:"2026-07-19T10:00:00.000Z", approvalRevision:"approved-revision-11", status:"approved", guidelinesGate:{ passed:true, hardFails:[] }, copyReviewed:true, imageIntentionallyOmitted:true, finalPreviewConfirmed:true, manualPublishingAvailable:false, perChannelPublishStatus:{}, perChannelPublishedUrl:{} }], socialAccounts:channels.map((channel) => ({ id:`account-${channel}`, platform:channel, status:"connected", connected:true, accessToken:"never-project" })), runtime:{ livePostingGates:Object.fromEntries(channels.map((channel) => [channel, true])) }, postImages:[], postVersions:[], copyVersions:[], brandAssets:[], socialTemplates:[], postTemplates:[], contentTemplates:[], creativeTemplates:[], postingKits:[], generationProfiles:[], assetBundles:[], brandRules:[], library:[], approvals:[], approvalQueue:[], queueItems:[], reviewFeedback:[], reviewFeedbackRecords:[], postReviewFeedback:[], publishEvents:[], publishClaims:[], scheduleConflicts:[], contentBank:[], reports:[], dataRoomItems:[], evidencePackNotes:[], activityEvents:[], auditHistory:[], generationBatches:[], settings:{ sourceItems:[], localAssets:[] } }; }

assert.equal(safePublishedUrl("https://social.example.com/post/123"), "https://social.example.com/post/123");
assert.equal(safePublishedUrl("https://social.example.com/api/post?token=secret"), null);
const connections = buildSocialConnectionsContract(fixture(["linkedin","instagram"]), actor, "2026-07-19T12:00:00.000Z");
assert.equal(connections.connections.find((item) => item.channel === "linkedin").state.key, "ready_to_publish");
assert.equal(connections.connections.find((item) => item.channel === "facebook").state.key, "not_connected");
assert.doesNotMatch(JSON.stringify(connections), /accessToken|never-project/);
assert.match(renderSocialConnectionsPage(connections), /Connected, publishing off|Ready to publish/);

const shared = fixture(); const claims = new Map(); let calls = 0;
const deps = {
  now:() => "2026-07-19T12:00:00.000Z", loadState:async () => structuredClone(shared),
  acquireClaim:async ({ post, channel }) => { const id = `claim-${post.approvalRevision}-${channel}`; if (claims.has(id)) return { claimed:false, claim:claims.get(id), idempotencyKey:id }; const claim = { id, channel }; claims.set(id, claim); return { claimed:true, claim, idempotencyKey:id }; },
  transitionClaim:async () => {},
  publishChannel:async ({ channel, idempotencyKey }) => { calls += 1; return { ok:true, publishedUrl:`https://social.example.com/${channel}/post-1`, providerReference:idempotencyKey }; },
  recordPublicationResult:async (result) => { shared.publishEvents.push({ id:`event-${result.claimId}`, postId:result.postId, channel:result.channel, approvalRevision:result.approvalRevision, eventType:result.status, status:result.status, publishedAt:"2026-07-19T12:00:01.000Z", publishedUrl:result.publishedUrl }); }
};
const [one, two] = await Promise.all([
  publishSocialPost(deps, shared, actor, "publish-post", { expectedVersion:11, requestId:"publish-one" }),
  publishSocialPost(deps, shared, actor, "publish-post", { expectedVersion:11, requestId:"publish-two" })
]);
assert.equal(calls, 1, "Concurrent Publish actions make one adapter call for the revision/channel claim.");
assert.equal([one, two].flatMap((result) => result.channels).filter((item) => item.state === "published").length >= 1, true);

const partialState = fixture(["linkedin","instagram"]); const partialClaims = new Set(); const partialCalls = [];
const partial = await publishSocialPost({ now:deps.now, loadState:async () => structuredClone(partialState), acquireClaim:async ({ post, channel }) => { const id = `${post.approvalRevision}:${channel}`; if (partialClaims.has(id)) return { claimed:false, claim:{ id }, idempotencyKey:id }; partialClaims.add(id); return { claimed:true, claim:{ id }, idempotencyKey:id }; }, transitionClaim:async () => {}, publishChannel:async ({ channel }) => { partialCalls.push(channel); return channel === "linkedin" ? { ok:true, publishedUrl:"https://social.example.com/linkedin/success" } : { ok:false, state:"failed_retryable", errorCode:"synthetic_failure" }; }, recordPublicationResult:async (result) => { partialState.publishEvents.push({ id:`event-${result.claimId}`, postId:result.postId, channel:result.channel, approvalRevision:result.approvalRevision, eventType:result.status, status:result.status, publishedAt:"2026-07-19T12:00:01.000Z", publishedUrl:result.publishedUrl }); } }, partialState, actor, "publish-post", { expectedVersion:11, requestId:"partial" });
assert.equal(partial.outcome, "partial"); assert.deepEqual(partial.channels.map((item) => [item.channel,item.state]), [["linkedin","published"],["instagram","failed_retryable"]]);
assert.deepEqual(partialCalls, ["linkedin","instagram"]);
const retry = await publishSocialPost({ ...deps, loadState:async () => structuredClone(partialState), acquireClaim:async ({ post, channel }) => ({ claimed:channel !== "instagram", claim:{ id:`retry-${post.approvalRevision}-${channel}` }, idempotencyKey:`retry-${channel}` }), publishChannel:async ({ channel }) => { assert.notEqual(channel, "linkedin", "Successful channels are never retried."); return { ok:false, state:"failed_terminal" }; } }, partialState, actor, "publish-post", { expectedVersion:11, requestId:"retry" });
assert.equal(retry.channels.find((item) => item.channel === "linkedin").state, "published");

const manualState = fixture(); manualState.runtime.livePostingGates.linkedin = false; manualState.posts[0].manualPublishingAvailable = true;
const manual = await createSocialManualPackage({ now:deps.now, buildManualPackage:async () => ({ ok:true, packageId:"manual-package-1" }) }, manualState, actor, "publish-post", { expectedVersion:11, requestId:"manual" });
assert.deepEqual(manual, { ok:true, outcome:"manual_package_created", packageId:"manual-package-1", marksPublished:false });
assert.equal(manualState.publishEvents.length, 0);
console.log("Social publishing action tests passed.");
