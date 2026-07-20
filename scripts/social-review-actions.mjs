import { roleHasCapability } from "./roles.mjs";
import { buildPostReviewPlan } from "./ui/view-models/post-review-plan.mjs";
import { renderSocialCreative } from "./social-creative-actions.mjs";

export const SOCIAL_APPROVAL_ENDPOINT = "/api/ui/social/post/:postId/approve";
export const SOCIAL_REQUEST_CHANGES_ENDPOINT = "/api/ui/social/post/:postId/request-changes";
export const SOCIAL_REGENERATE_ENDPOINT = "/api/ui/social/post/:postId/regenerate";
const clean = (value = "") => String(value ?? "").trim();
function fail(message, status = 400, outcome = "validation_error") { throw Object.assign(new Error(message), { status, outcome }); }
function authorize(actor, capability = "manage_approval_queue") { if (actor?.authenticated !== true || !roleHasCapability(actor.role, capability)) fail("This review action is not available.", 403, "forbidden"); }

function current(state, actor, postId, input, now, capability = "manage_approval_queue") {
  authorize(actor, capability);
  const posts = (Array.isArray(state?.posts) ? state.posts : []).filter((post) => clean(post?.id) === clean(postId));
  if (posts.length !== 1) fail("This Post is unavailable.", 404, "unavailable");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(posts[0]._version)) fail("The Post changed. Reload before reviewing.", 409, "version_conflict");
  if (!clean(input.requestId) || clean(input.requestId).length > 160) fail("A bounded request ID is required.");
  const plan = buildPostReviewPlan(state, actor, postId, now);
  if (plan.availability.key === "unavailable" || plan.approval?.ambiguous) fail("Review truth is unavailable or ambiguous.", 409, "review_unavailable");
  return { post:posts[0], plan };
}

export async function approveSocialPost(dependencies, state, actor, postId, input = {}) {
  const now = typeof dependencies?.now === "function" ? dependencies.now() : new Date().toISOString();
  const { post, plan } = current(state, actor, postId, input, now);
  if (plan.state.key === "approved") return { ok:true, outcome:"already_approved", version:post._version, idempotent:true };
  if (plan.blockingChecks.length || plan.requestedChanges.length || plan.approval.approveAction.available !== true) fail("Resolve every current review blocker before approval.", 409, "approval_blocked");
  if (typeof dependencies?.applyApproval !== "function") fail("Approval is unavailable.", 503, "unavailable");
  const result = await dependencies.applyApproval({ postId:clean(postId), expectedVersion:input.expectedVersion, requestId:clean(input.requestId), actorId:clean(actor.id || actor.actorId), reviewedPlan:plan, decision:"approve" });
  if (!result?.ok) fail("Approval was not recorded.", 409, "approval_failed");
  return { ok:true, outcome:"approved", version:result.version, approvalId:clean(result.approvalId) || null };
}

function safeFeedback(input = {}) {
  const feedbackId = clean(input.feedbackId);
  const summary = clean(input.summary);
  if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(feedbackId)) fail("A stable feedback ID is required.");
  if (!summary || summary.length > 280 || /[\u0000-\u001f\u007f<>]/u.test(summary) || /https?:\/\/|data:image|(?:access|refresh|oauth).{0,12}(?:token|key)|\b(?:raw)?(?:rule|audit)[-_ ]?id\b/i.test(summary)) fail("Feedback must be a bounded safe summary without private technical detail.");
  return { feedbackId, summary };
}

export async function requestSocialPostChanges(dependencies, state, actor, postId, input = {}) {
  const now = typeof dependencies?.now === "function" ? dependencies.now() : new Date().toISOString();
  const { plan } = current(state, actor, postId, input, now, "manage_content_drafts");
  const feedback = safeFeedback(input);
  if (typeof dependencies?.recordRequestedChanges !== "function") fail("Review feedback is unavailable.", 503, "unavailable");
  const result = await dependencies.recordRequestedChanges({ id:feedback.feedbackId, postId:clean(postId), expectedVersion:input.expectedVersion, requestId:clean(input.requestId), actorId:clean(actor.id || actor.actorId), summary:feedback.summary, status:"changes_requested", sourceReference:{ collection:"posts", sourceId:clean(postId), relationship:"requested_change" }, reviewedPlan:plan });
  if (!result?.ok) fail("Requested changes were not recorded.", 409, "feedback_failed");
  return { ok:true, outcome:result.reused ? "already_recorded" : "changes_requested", feedbackId:feedback.feedbackId, reused:result.reused === true };
}

export async function regenerateSocialPostImage(dependencies, state, actor, postId, input = {}) {
  authorize(actor);
  const plan = buildPostReviewPlan(state, actor, postId, typeof dependencies?.now === "function" ? dependencies.now() : new Date().toISOString());
  if (plan.availability.key === "unavailable" || plan.regeneration?.state?.key === "in_progress") fail("Image regeneration is not currently available.", 409, "regeneration_blocked");
  return renderSocialCreative({ renderPost:dependencies?.renderPost }, state, actor, postId, input);
}
