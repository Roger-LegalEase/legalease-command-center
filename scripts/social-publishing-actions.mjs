import { roleHasCapability } from "./roles.mjs";
import { buildPostPublishingControls } from "./ui/view-models/post-publishing-controls.mjs";
import { acquireSocialPublishClaim, transitionSocialPublishClaim } from "./social-publish-service.mjs";

export const SOCIAL_PUBLISH_ENDPOINT = "/api/ui/social/post/:postId/publish";
export const SOCIAL_MANUAL_PACKAGE_ENDPOINT = "/api/ui/social/post/:postId/manual-package";
const clean = (value = "") => String(value ?? "").trim();
function fail(message, status = 400, outcome = "validation_error") { throw Object.assign(new Error(message), { status, outcome }); }
function authorize(actor) { if (actor?.authenticated !== true || !roleHasCapability(actor.role, "social_publish")) fail("Publishing is not available.", 403, "forbidden"); }
function exactPost(state, postId) { const matches = (Array.isArray(state?.posts) ? state.posts : []).filter((post) => clean(post?.id) === clean(postId)); if (matches.length !== 1) fail("This Post is unavailable.", 404, "unavailable"); return matches[0]; }
function safePublishedUrl(value = "") {
  const text = clean(value); if (!text || text.length > 500) return null;
  try { const url = new URL(text); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /(?:api|dashboard|admin|oauth|token|credential|signature|signed)/i.test(`${url.hostname}${url.pathname}`)) return null; return url.toString(); } catch { return null; }
}

function approvedRevision(post = {}) { return clean(post.approvalRevision || post.approval_revision || post.approvedAt || post.approved_at); }

export async function publishSocialPost(dependencies, initialState, actor, postId, input = {}) {
  authorize(actor);
  if (!clean(input.requestId) || clean(input.requestId).length > 160) fail("A bounded request ID is required.");
  if (typeof dependencies?.loadState !== "function" || typeof dependencies?.publishChannel !== "function") fail("Controlled publishing is unavailable.", 503, "unavailable");
  const initialPost = exactPost(initialState, postId);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(initialPost._version)) fail("The Post changed. Reload before publishing.", 409, "version_conflict");
  const initialControls = buildPostPublishingControls(initialState, actor, postId, dependencies.now?.() || new Date().toISOString());
  if (initialControls.availability.key !== "available") fail("Publishing truth is unavailable.", 409, "publishing_unavailable");
  const requested = Array.isArray(input.channels) && input.channels.length ? [...new Set(input.channels.map(clean))] : initialControls.channels.map((channel) => channel.channel);
  if (requested.some((channel) => !initialControls.channels.some((item) => item.channel === channel))) fail("A requested channel is not selected for this Post.");
  const outcomes = [];
  for (const channel of requested) {
    const state = await dependencies.loadState();
    const post = exactPost(state, postId);
    const controls = buildPostPublishingControls(state, actor, postId, dependencies.now?.() || new Date().toISOString());
    const control = controls.channels.find((item) => item.channel === channel);
    if (!control) { outcomes.push({ channel, state:"blocked", reason:"channel_unavailable" }); continue; }
    if (control.publicationState.key === "published") { outcomes.push({ channel, state:"published", reused:true, publishedUrl:control.publicationState.publishedUrl || null }); continue; }
    if (control.eligibility.available !== true) { outcomes.push({ channel, state:"blocked", reason:control.eligibility.reason || "not_eligible" }); continue; }
    const acquire = dependencies.acquireClaim || ((request) => acquireSocialPublishClaim(dependencies.store, request));
    const claim = await acquire({ post, channel, actorId:clean(actor.id || actor.actorId), requestId:clean(input.requestId) });
    if (!claim?.claimed) { outcomes.push({ channel, state:"in_progress", reused:true, claimId:clean(claim?.claim?.id) || null }); continue; }
    const transition = dependencies.transitionClaim || ((claimId, status, patch) => transitionSocialPublishClaim(dependencies.store, claimId, status, patch));
    await transition(claim.claim.id, "publishing");
    let result;
    try {
      result = await dependencies.publishChannel({ postId:clean(postId), channel, approvedRevision:approvedRevision(post), idempotencyKey:claim.idempotencyKey, claimId:claim.claim.id });
    } catch {
      result = { ok:false, state:"reconciliation_required", errorCode:"adapter_result_unavailable" };
    }
    if (result?.ok === true) {
      const publishedUrl = safePublishedUrl(result.publishedUrl);
      await transition(claim.claim.id, "published", { publishedUrl, providerReference:clean(result.providerReference).slice(0, 120) || null });
      await dependencies.recordPublicationResult?.({ postId:clean(postId), channel, approvalRevision:approvedRevision(post), claimId:claim.claim.id, status:"published", publishedUrl, requestId:clean(input.requestId) });
      outcomes.push({ channel, state:"published", publishedUrl });
    } else {
      const stateKey = ["failed_retryable", "failed_terminal", "reconciliation_required"].includes(result?.state) ? result.state : "reconciliation_required";
      await transition(claim.claim.id, stateKey, { errorCode:clean(result?.errorCode).slice(0, 100) || "publication_failed" });
      await dependencies.recordPublicationResult?.({ postId:clean(postId), channel, approvalRevision:approvedRevision(post), claimId:claim.claim.id, status:stateKey, requestId:clean(input.requestId) });
      outcomes.push({ channel, state:stateKey });
    }
  }
  return { ok:true, outcome:outcomes.every((item) => item.state === "published") ? "published" : outcomes.some((item) => item.state === "published") ? "partial" : "not_published", channels:outcomes };
}

export async function createSocialManualPackage(dependencies, state, actor, postId, input = {}) {
  authorize(actor); const post = exactPost(state, postId);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(post._version)) fail("The Post changed. Reload before creating a package.", 409, "version_conflict");
  const controls = buildPostPublishingControls(state, actor, postId, dependencies.now?.() || new Date().toISOString());
  if (controls.manualFallback?.available !== true) fail("Manual publishing is not currently available.", 409, "manual_fallback_unavailable");
  if (typeof dependencies?.buildManualPackage !== "function") fail("Manual publishing is unavailable.", 503, "unavailable");
  const result = await dependencies.buildManualPackage({ postId:clean(postId), expectedVersion:input.expectedVersion, requestId:clean(input.requestId), actorId:clean(actor.id || actor.actorId), selectedChannels:controls.channels.filter((channel) => channel.state.key !== "published").map((channel) => channel.channel) });
  if (!result?.ok || !clean(result.packageId)) fail("The manual package could not be created.", 409, "manual_package_failed");
  return { ok:true, outcome:"manual_package_created", packageId:clean(result.packageId), marksPublished:false };
}

export { safePublishedUrl };
