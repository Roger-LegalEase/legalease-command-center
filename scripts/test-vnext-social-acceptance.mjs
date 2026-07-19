#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { SOCIAL_ACCEPTANCE_EXISTING_TESTS, SOCIAL_ACCEPTANCE_WORKFLOWS } from "./social-acceptance-coverage.mjs";
import { createSocialAcceptanceFixture } from "./social-acceptance-fixture.mjs";

assert.deepEqual(SOCIAL_ACCEPTANCE_WORKFLOWS.map((item) => item.id), [1,2,3,4,5,6,7,8,9,10]);
assert.equal(new Set(SOCIAL_ACCEPTANCE_WORKFLOWS.map((item) => item.requirement)).size, 10);
for (const item of SOCIAL_ACCEPTANCE_WORKFLOWS) {
  assert.ok(item.existingTest);
  assert.ok(item.existingFixture);
  assert.ok(item.existingAssertion);
  assert.ok(item.completionAssertion);
}

const sourceMarkers = new Map([
  ["tests/browser/quick-capture.spec.mjs", "all seven intents save once"],
  ["scripts/test-vnext-social-creative-catalog.mjs", "another logo must never be silently substituted"],
  ["scripts/test-vnext-social-readiness.mjs", "voice_outcome_promise"],
  ["scripts/test-social-guidelines-gate.mjs", "render QA"],
  ["scripts/test-vnext-post-channel-variants.mjs", "LinkedIn-specific copy"],
  ["scripts/test-vnext-post-schedule-plan.mjs", "Approval, scheduling, and publication remain separate stored truths"],
  ["scripts/test-social-publish-claims.mjs", "outcomes.filter((result) => result.claimed).length, 1"],
  ["scripts/test-vnext-post-publishing-controls.mjs", "manualFallback.executable"]
]);

for (const file of SOCIAL_ACCEPTANCE_EXISTING_TESTS) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.ok(source.includes(sourceMarkers.get(file)), `${file} must retain the mapped acceptance assertion.`);
}

const injectedCalls = [];
const fixture = createSocialAcceptanceFixture({
  publishAdapter:async ({ post, channel, idempotencyKey }) => {
    injectedCalls.push({ postId:post.id, channel, idempotencyKey });
    return { externalId:`synthetic-${channel}-${post.id}` };
  }
});

let result = fixture.addIdea("A clearer path through confusing rules");
const ideaId = result.activePostId;
assert.equal(result.post.status, "idea");
result = fixture.turnIdeaIntoPost();
assert.equal(result.activePostId, ideaId, "Idea conversion must retain canonical Post identity.");
assert.equal(result.post.status, "draft");

result = fixture.createFromTemplate("template-wilma-faq");
assert.equal(result.post.selectedTemplateId, "template-wilma-faq");
assert.equal(result.post.status, "draft");

result = fixture.selectAssets({ wilmaId:"wilma-pose-01", brandId:"logo-primary" });
assert.equal(result.post.wilmaPoseReferenceId, "wilma-pose-01");
assert.deepEqual(result.post.brandAssetIds, ["logo-primary"]);

result = fixture.triggerGuidelineFailure();
assert.equal(result.post.guidelinesGate.passed, false);
assert.ok(result.readiness.blocking.length > 0);
result = fixture.resolveGuidelineFailure();
assert.equal(result.post.guidelinesGate.passed, true);

result = fixture.renderImage(["missing-approved-asset"]);
assert.deepEqual(result.render, { ok:false, missing:["missing-approved-asset"], substituted:false });
assert.equal(result.metrics.providerCalls, 0);
result = fixture.renderImage(["wilma-pose-01", "logo-primary"]);
assert.equal(result.render.ok, true);
assert.equal(result.render.substituted, false);
assert.deepEqual(result.render.exactAssetIds, ["wilma-pose-01", "logo-primary"]);

result = fixture.addChannelVariants({ linkedin:"LinkedIn-specific safe copy.", instagram:"Instagram-specific safe copy." });
assert.deepEqual(result.variants.map((item) => item.channel), ["linkedin", "instagram"]);
assert.deepEqual(result.variants.map((item) => item.body), ["LinkedIn-specific safe copy.", "Instagram-specific safe copy."]);

result = fixture.schedulePost({ scheduledFor:"2026-07-21T14:00:00.000Z", timezone:"America/New_York" });
assert.equal(result.schedule.state, "scheduled");
assert.equal(result.post.status, "scheduled");
result = fixture.moveOnCalendar("2026-07-22T15:30:00.000Z");
assert.equal(result.post.scheduledFor, "2026-07-22T15:30:00.000Z");
assert.equal(result.auditEvents.length, 1);
assert.equal(result.metrics.publications, 0);

result = fixture.publishManuallyWithoutCredentials();
assert.equal(result.post.manualPublishingPackage.status, "ready");
assert.equal(result.post.status, "scheduled", "Manual fallback must not claim publication.");
assert.equal(result.metrics.providerCalls, 0);

const [firstPublish, secondPublish] = await Promise.all([
  fixture.publishWithInjectedAdapter("ccx310-publish-01"),
  fixture.publishWithInjectedAdapter("ccx310-publish-01")
]);
assert.equal(injectedCalls.length, 2, "The injected adapter must run once per selected channel.");
assert.ok(firstPublish.publishResults.every((item) => item.reused === false));
assert.ok(secondPublish.publishResults.every((item) => item.reused === true));
assert.equal(secondPublish.metrics.providerCalls, 2);
assert.equal(secondPublish.metrics.publications, 2);
assert.equal(secondPublish.claims.length, 2);
assert.equal(secondPublish.metrics.externalNetworkCalls, 0);

console.log("PASS test-vnext-social-acceptance");
console.log(JSON.stringify({
  workflows:SOCIAL_ACCEPTANCE_WORKFLOWS.length,
  mappedExistingTests:SOCIAL_ACCEPTANCE_EXISTING_TESTS.length,
  exactIdeaIdentity:true,
  missingAssetSubstitutions:0,
  manualProviderCalls:0,
  injectedChannelCalls:injectedCalls.length,
  duplicateChannelCalls:0,
  externalNetworkCalls:0
}));
