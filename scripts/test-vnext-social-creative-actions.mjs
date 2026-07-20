#!/usr/bin/env node
import assert from "node:assert/strict";
import { renderSocialCreative, saveSocialCreativeSelection, validateCreativeSelection } from "./social-creative-actions.mjs";

const actor = { authenticated:true, id:"operator-synthetic", role:"owner" };
const refs = {
  template:{ collection:"generationProfiles", sourceId:"template-reviewed" },
  logo:{ collection:"brandContract", sourceId:"shellLogo" },
  wilma:{ collection:"brandAssets", sourceId:"wilma-reviewed" },
  background:{ collection:"brandAssets", sourceId:"background-reviewed" },
  disclaimer:{ collection:"library", sourceId:"disclaimer-reviewed" }
};
const state = {
  posts:[{ id:"post-creative", _version:4, creativeSurfaceTone:"dark" }],
  generationProfiles:[{ id:"template-reviewed", displayName:"Reviewed guide", templateCategory:"education", active:true, approved:true, surfaceTone:"dark", requiredAssetRoles:["logo","wilma_pose","background"], assetIds:["brand-contract-white-wordmark","wilma-reviewed","background-reviewed"], defaultDisclaimerId:"disclaimer-reviewed" }],
  brandAssets:[
    { id:"wilma-reviewed", name:"Reviewed Wilma", assetType:"wilma_pose", approved:true },
    { id:"background-reviewed", name:"Reviewed background", assetType:"background", approved:true },
    { id:"hidden-logo", name:"Hidden logo", assetType:"logo", approved:false }
  ],
  library:[{ id:"disclaimer-reviewed", title:"Reviewed disclaimer", category:"disclaimer", status:"approved", body:"Synthetic information only." }],
  postingKits:[], brandRules:[], settings:{ localAssets:[] }
};
const input = { expectedVersion:4, requestId:"creative-request-1", surfaceTone:"dark", template:refs.template, assets:{ logo:refs.logo, wilma:refs.wilma, background:refs.background, disclaimer:refs.disclaimer } };

assert.equal(validateCreativeSelection(state, actor, "post-creative", input).template.id, "template-reviewed");
assert.throws(() => validateCreativeSelection(state, actor, "post-creative", { ...input, assets:{ ...input.assets, logo:{ collection:"brandAssets", sourceId:"hidden-logo" } } }), /unavailable/);
assert.throws(() => validateCreativeSelection(state, actor, "post-creative", { ...input, surfaceTone:"light" }), /logo|unavailable/);
assert.throws(() => validateCreativeSelection(state, actor, "post-creative", { ...input, expectedVersion:3 }), /changed/);

let committed;
const saved = await saveSocialCreativeSelection({ commitPostMutation:async (request) => { committed = request; return { version:5 }; } }, state, actor, "post-creative", input);
assert.equal(saved.version, 5);
assert.equal(committed.patch.selectedTemplateId, "template-reviewed");
assert.deepEqual(committed.patch.logoAssetReference, refs.logo);
assert.equal(committed.activity.type, "social_creative_selected");
assert.equal(committed.audit.sourceReferences.length, 5);
assert.equal("name" in committed.patch.logoAssetReference, false, "Asset metadata is not copied into the Post.");

const reloaded = structuredClone(state);
reloaded.posts[0] = { ...reloaded.posts[0], ...committed.patch, _version:5 };
let rendered;
const firstRender = await renderSocialCreative({ renderPost:async (request) => { rendered = request; return { ok:true, imageId:"image-current", reused:false }; } }, reloaded, actor, "post-creative", { expectedVersion:5, requestId:"render-1" });
assert.equal(firstRender.ok, true);
assert.deepEqual(firstRender.provenance, rendered.sourceReferences);
assert.ok(rendered.idempotencyKey.startsWith("social-render-"));
assert.equal(JSON.stringify(firstRender).includes("/tmp/"), false);
const secondRender = await renderSocialCreative({ renderPost:async () => ({ ok:true, imageId:"image-current", reused:true }) }, reloaded, actor, "post-creative", { expectedVersion:5, requestId:"render-2" });
assert.equal(secondRender.reused, true);
const failed = await renderSocialCreative({ renderPost:async () => ({ ok:false }) }, reloaded, actor, "post-creative", { expectedVersion:5, requestId:"render-3" });
assert.deepEqual(failed, { ok:false, outcome:"render_failed", message:"The image was not rendered. The previous current image remains unchanged." });

console.log("Social creative action tests passed.");
