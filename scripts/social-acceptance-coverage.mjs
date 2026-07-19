export const SOCIAL_ACCEPTANCE_WORKFLOWS = Object.freeze([
  Object.freeze({
    id:1,
    requirement:"Add an idea and turn it into a Post.",
    existingTest:"tests/browser/quick-capture.spec.mjs",
    existingFixture:"BROWSER_TEST_TODAY_BASE_URL synthetic Quick Capture fixture",
    existingAssertion:"Post idea saves once as status idea and returns its exact Open link.",
    completionAssertion:"CCX-310 keeps the same canonical Post ID while moving the idea to an editable draft."
  }),
  Object.freeze({
    id:2,
    requirement:"Create a Post from a template.",
    existingTest:"scripts/test-vnext-social-creative-catalog.mjs",
    existingFixture:"Synthetic generationProfiles and approved template assets",
    existingAssertion:"Templates project only by exact authorized stable identity.",
    completionAssertion:"CCX-310 creates one inert Post carrying the exact selectedTemplateId."
  }),
  Object.freeze({
    id:3,
    requirement:"Select Wilma and a brand asset.",
    existingTest:"scripts/test-vnext-social-creative-catalog.mjs",
    existingFixture:"Approved Wilma pose and LegalEase logo catalog records",
    existingAssertion:"Approved assets project with exact source references; hidden or missing assets do not substitute.",
    completionAssertion:"CCX-310 persists the exact Wilma and brand asset IDs on the synthetic Post."
  }),
  Object.freeze({
    id:4,
    requirement:"Trigger a guideline failure and resolve it.",
    existingTest:"scripts/test-vnext-social-readiness.mjs",
    existingFixture:"Synthetic Post guidelinesGate hard-failure states",
    existingAssertion:"A stored outcome-promise failure is blocking and founder-facing.",
    completionAssertion:"CCX-310 renders a blocking state, then clears it only after safe copy and an explicit passing gate."
  }),
  Object.freeze({
    id:5,
    requirement:"Generate or render an image without silent asset substitution.",
    existingTest:"scripts/test-social-guidelines-gate.mjs",
    existingFixture:"Synthetic render-gate source inspection plus authorized creative catalog",
    existingAssertion:"Render and asset-integrity failures remain hard gates.",
    completionAssertion:"CCX-310 rejects a missing requested asset with no image, then renders only the exact selected assets."
  }),
  Object.freeze({
    id:6,
    requirement:"Add LinkedIn and Instagram variants.",
    existingTest:"scripts/test-vnext-post-channel-variants.mjs",
    existingFixture:"Synthetic canonical Post with independent stored channelVariants",
    existingAssertion:"LinkedIn and Instagram copy remain independent and deselection does not erase variants.",
    completionAssertion:"CCX-310 stores and reprojects two exact independent variants."
  }),
  Object.freeze({
    id:7,
    requirement:"Schedule the Post.",
    existingTest:"scripts/test-vnext-post-schedule-plan.mjs",
    existingFixture:"Synthetic exact Post schedule and per-channel projection",
    existingAssertion:"Stored schedule truth remains exact and distinct from publication.",
    completionAssertion:"CCX-310 schedules the synthetic Post with exact UTC time and timezone."
  }),
  Object.freeze({
    id:8,
    requirement:"Move it on the calendar.",
    existingTest:"scripts/test-vnext-post-schedule-plan.mjs",
    existingFixture:"Synthetic Post schedule projection and conflict records",
    existingAssertion:"Stored schedule truth remains exact and scheduling is distinct from publication.",
    completionAssertion:"CCX-310 changes only the schedule and appends one exact move audit event."
  }),
  Object.freeze({
    id:9,
    requirement:"Publish manually in the no-credentials fixture.",
    existingTest:"scripts/test-vnext-post-publishing-controls.mjs",
    existingFixture:"Synthetic manualPublishingAvailable Post with live gate off",
    existingAssertion:"Manual fallback is informational, explicit, and non-executable.",
    completionAssertion:"CCX-310 creates one manual package, performs zero provider calls, and does not claim publication."
  }),
  Object.freeze({
    id:10,
    requirement:"Verify a gated live-publish fixture cannot double-post.",
    existingTest:"scripts/test-social-publish-claims.mjs",
    existingFixture:"Two temporary JsonStore instances racing for one exact Post/channel/revision claim",
    existingAssertion:"Exactly one contender acquires the durable publish claim and ambiguous reconciliation cannot become Published.",
    completionAssertion:"CCX-310 invokes each injected channel adapter once for one idempotency key; the repeated browser action is reused."
  })
]);

export const SOCIAL_ACCEPTANCE_EXISTING_TESTS = Object.freeze([
  "tests/browser/quick-capture.spec.mjs",
  "scripts/test-vnext-social-creative-catalog.mjs",
  "scripts/test-vnext-social-readiness.mjs",
  "scripts/test-social-guidelines-gate.mjs",
  "scripts/test-vnext-post-channel-variants.mjs",
  "scripts/test-vnext-post-schedule-plan.mjs",
  "scripts/test-social-publish-claims.mjs",
  "scripts/test-vnext-post-publishing-controls.mjs"
]);
