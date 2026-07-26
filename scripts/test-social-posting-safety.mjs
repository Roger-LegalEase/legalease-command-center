import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSafetyPosture } from "./safety-posture.mjs";
import { requiredCapabilitiesForEndpoint, roleHasCapability } from "./roles.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const env = {
  LIVE_POSTING_ENABLED:"false", LINKEDIN_LIVE_POSTING:"false", FACEBOOK_LIVE_POSTING:"false",
  INSTAGRAM_LIVE_POSTING:"false", X_LIVE_POSTING:"false", REACTIVATION_LIVE_SEND:"false", OUTREACH_LIVE_SEND:"false"
};
const posture = buildSafetyPosture({ state:{ runtime:{ livePostingGates:{} } }, env, socialLiveGates:[
  { channel:"linkedin", enabled:false }, { channel:"facebook", enabled:false }, { channel:"instagram", enabled:false }, { channel:"x", enabled:false }
] });
assert.equal(posture.email.posture, "off");
assert.equal(posture.social.posture, "off");
assert.equal(posture.social.enabledChannels.length, 0);
assert.deepEqual(requiredCapabilitiesForEndpoint("POST", "/api/linkedin/publish"), ["social_publish"]);
assert.equal(roleHasCapability("owner", "social_publish"), true);
assert.equal(roleHasCapability("admin", "social_publish"), false);
assert.equal(roleHasCapability("operator", "social_publish"), false);
for (const functionName of ["linkedinApprovalQueueHtml", "twitterXApprovalQueueHtml", "publishPostNow", "runPublishingWorker"]) assert(source.includes(`function ${functionName}`) || source.includes(`async function ${functionName}`));
// PORTED 2026-07-26 (hygiene, extended-test triage). `claimSocialPublish` no longer appears in
// preview-server.mjs: the publish claim ledger was extracted into social-publish-service.mjs
// (which preview-server imports as acquireSocialPublishClaim/transitionSocialPublishClaim) with
// the store method living in storage.mjs. The guarantee the old grep stood for — a publish
// cannot happen without first taking a claim — is asserted across the whole chain instead of
// being dropped, because that is the guard against double-publishing.
const publishService = await readFile(new URL("./social-publish-service.mjs", import.meta.url), "utf8");
const storageSource = await readFile(new URL("./storage.mjs", import.meta.url), "utf8");
assert.match(source, /import \{[^}]*acquireSocialPublishClaim[^}]*\} from "\.\/social-publish-service\.mjs"/, "the publish path must import the claim helpers from the publish service");
assert.match(source, /acquireSocialPublishClaim\(/, "the publish path must acquire a publish claim");
assert.match(source, /transitionSocialPublishClaim\(store, ownership\.claim\.id, "publishing"\)/, "a claim must be moved to publishing before the provider call");
assert.match(publishService, /store\.claimSocialPublish === "function"/, "the publish service must go through the store's claimSocialPublish ledger write");
assert.match(storageSource, /async claimSocialPublish\(\{ postId, expectedVersion, claim \} = \{\}\)/, "the store must expose a version-checked claimSocialPublish");
assert.match(storageSource, /appendOnlyCollections = new Set\(\[[^\]]*"publishClaims"[^\]]*\]\)/, "publishClaims must stay append-only so a claim cannot be erased and re-used");
assert.match(source, /reconciliation_required/);
assert.doesNotMatch(source, /ENABLE_LIVE_LINKEDIN_POSTING === "true" &&/);
console.log("social posting safety tests passed.");
