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
assert.match(source, /claimSocialPublish/);
assert.match(source, /reconciliation_required/);
assert.doesNotMatch(source, /ENABLE_LIVE_LINKEDIN_POSTING === "true" &&/);
console.log("social posting safety tests passed.");
