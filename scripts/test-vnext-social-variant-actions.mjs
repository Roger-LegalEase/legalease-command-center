#!/usr/bin/env node
import assert from "node:assert/strict";
import { planSocialVariantMutation, saveSocialVariants } from "./social-variant-actions.mjs";

const actor = { authenticated:true, id:"operator-synthetic", role:"owner" };
const state = { posts:[{ id:"variant-post", _version:8, headline:"Shared", body:"Shared body", targetChannels:["linkedin","instagram","facebook"], channelVariants:[
  { id:"linkedin-stable", channel:"linkedin", body:"LinkedIn only", assetIds:["linkedin-image"] },
  { id:"instagram-stable", channel:"instagram", body:"Instagram only" },
  { id:"facebook-stable", channel:"facebook", body:"Saved Facebook", explicitBlankFields:[] }
] }], postImages:[], brandAssets:[{ id:"linkedin-image", approved:true }], postingKits:[], library:[], settings:{ localAssets:[] }, contentBank:[], reports:[], dataRoomItems:[], evidencePackNotes:[], approvals:[], approvalQueue:[], queueItems:[], publishEvents:[], activityEvents:[], auditHistory:[], generationBatches:[] };
const input = { expectedVersion:8, requestId:"variant-request-1", selectedChannels:["linkedin","instagram"], confirmCustomizedRemoval:true, variants:[
  { channel:"linkedin", fields:{ body:{ mode:"custom", value:"Updated LinkedIn only" }, cta:{ mode:"blank" } } },
  { channel:"instagram", fields:{ body:{ mode:"fallback" }, hashtags:{ mode:"custom", value:["#Synthetic"] } } }
] };
const plan = planSocialVariantMutation(state, actor, "variant-post", input);
assert.deepEqual(plan.selectedChannels, ["linkedin","instagram"]);
assert.equal(plan.channelVariants.find((item) => item.channel === "linkedin").id, "linkedin-stable");
assert.equal(plan.channelVariants.find((item) => item.channel === "linkedin").body, "Updated LinkedIn only");
assert.deepEqual(plan.channelVariants.find((item) => item.channel === "linkedin").explicitBlankFields, ["cta"]);
assert.equal("body" in plan.channelVariants.find((item) => item.channel === "instagram"), false, "Fallback is not copied into a variant.");
assert.equal(plan.channelVariants.find((item) => item.channel === "facebook").body, "Saved Facebook", "Deselection preserves the stored variant.");
assert.deepEqual(plan.channelVariants.find((item) => item.channel === "linkedin").assetIds, ["linkedin-image"], "Channel creative remains attached.");
assert.equal(state.posts[0].channelVariants[0].body, "LinkedIn only", "Planning is pure.");
assert.throws(() => planSocialVariantMutation(state, actor, "variant-post", { ...input, confirmCustomizedRemoval:false }), /Confirm removing Facebook/);
assert.throws(() => planSocialVariantMutation(state, actor, "variant-post", { ...input, variants:[...input.variants, input.variants[0]] }), /unique/);
assert.throws(() => planSocialVariantMutation(state, actor, "variant-post", { ...input, expectedVersion:7 }), /changed/);

let committed;
const saved = await saveSocialVariants({ commitPostMutation:async (request) => { committed = request; return { version:9 }; } }, state, actor, "variant-post", input);
assert.equal(saved.version, 9);
assert.deepEqual(committed.patch.targetChannels, ["linkedin","instagram"]);
assert.equal(committed.patch.channelVariants.find((item) => item.channel === "facebook").body, "Saved Facebook");
assert.equal(committed.audit.action, "social_channel_variants_saved");
console.log("Social variant action tests passed.");
