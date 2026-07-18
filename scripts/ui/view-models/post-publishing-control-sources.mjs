import { recordVisibleToActor } from "../../global-search-service.mjs";
import { canPerformEndpoint, requiredCapabilitiesForEndpoint, roleHasCapability, roles } from "../../roles.mjs";
import { buildPostChannelVariants } from "./post-channel-variants.mjs";
import { buildPostComposerDraft } from "./post-composer-draft.mjs";
import { collectPostReadinessSources } from "./post-readiness-sources.mjs";
import { buildPostReadiness } from "./post-readiness.mjs";
import { buildPostReviewPlan } from "./post-review-plan.mjs";
import { buildPostSchedulePlan } from "./post-schedule-plan.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function safeId(value = "") {
  const id = clean(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? id : "";
}

function validNow(value = "") {
  const text = clean(value);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function actorRole(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal") ? role : "";
}

function relatedPostId(record = {}) {
  const type = lower(record.type || record.sourceType || record.resourceType || record.relatedObjectType || record.objectType);
  const direct = [record.postId, record.post_id, record.relatedPostId, record.related_post_id, record.sourcePostId]
    .map(clean).filter(Boolean);
  if (/^(?:post|posts|social_post|social-post|social)$/.test(type)) {
    direct.push(...[record.sourceId, record.resourceId, record.relatedObjectId].map(clean).filter(Boolean));
  }
  return [...new Set(direct)];
}

function visibleRelated(state, collection, role, postId) {
  return list(state[collection])
    .filter((record) => recordVisibleToActor(record, role) && relatedPostId(record).includes(postId))
    .map(cloneValue)
    .sort((left, right) => clean(left.id).localeCompare(clean(right.id), "en-US")
      || stableSerialize(left).localeCompare(stableSerialize(right), "en-US"));
}

function visibleNestedAttempts(post, role) {
  const attempts = Array.isArray(post.publish_attempts) ? post.publish_attempts : list(post.publishAttempts);
  return attempts
    .filter((attempt) => recordVisibleToActor(attempt, role))
    .map(cloneValue)
    .sort((left, right) => clean(left.id).localeCompare(clean(right.id), "en-US")
      || stableSerialize(left).localeCompare(stableSerialize(right), "en-US"));
}

export const POST_PUBLISHING_CONTROL_SOURCE_MATRIX = deepFreeze([
  { source: "CCX-300 PostView", truth: "Canonical authorized Post identity and exact link" },
  { source: "CCX-302A ComposerDraftView", truth: "Read-only draft, creative, approval, and readiness context" },
  { source: "CCX-304A Post channel variants", truth: "Explicit selected channels and independent stored variants" },
  { source: "CCX-305 Social readiness", truth: "Stored blocking checks, connection checks, gates, and result truth" },
  { source: "CCX-306A Social schedule plan", truth: "Exact shared and per-channel schedule truth" },
  { source: "CCX-307A Post review plan", truth: "Explicit review approval and current blocking truth" },
  { source: "socialAccounts", truth: "Visible durable per-channel connection records" },
  { source: "runtime.livePostingGates", truth: "Read-only server-side live gate state" },
  { source: "Post result maps / publishEvents", truth: "Explicit per-channel stored publication outcomes and URLs" },
  { source: "Post publishAttempts / publishClaims", truth: "Explicit stable attempt and claim lifecycle truth" },
  { source: "Post manualPublishingAvailable", truth: "Explicit manual-fallback availability only" },
  { source: "existing controlled publishing policy", truth: "Shared social_publish requirement for the reviewed controlled publication routes" }
]);

export const PUBLISHING_CONTROL_CHANNEL_ORDER = Object.freeze(["linkedin", "instagram", "facebook", "x", "threads"]);
export const PUBLISHING_CONTROL_CHANNEL_LABELS = Object.freeze({
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  threads: "Threads"
});

export function normalizePublishingControlChannel(value = "") {
  const channel = lower(value).replaceAll(" ", "");
  if (["twitter", "twitter/x", "twitter-x", "x/twitter", "x-twitter"].includes(channel)) return "x";
  if (channel.includes("linkedin")) return "linkedin";
  if (channel.includes("instagram")) return "instagram";
  if (channel.includes("facebook")) return "facebook";
  if (channel.includes("threads")) return "threads";
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(channel) ? channel : "";
}

export function publishingControlChannelLabel(channel = "") {
  if (PUBLISHING_CONTROL_CHANNEL_LABELS[channel]) return PUBLISHING_CONTROL_CHANNEL_LABELS[channel];
  const words = clean(channel).replaceAll(/[_-]+/g, " ");
  return words ? words.charAt(0).toLocaleUpperCase("en-US") + words.slice(1) : "Channel";
}

export function comparePublishingControlChannels(left = "", right = "") {
  const leftRank = PUBLISHING_CONTROL_CHANNEL_ORDER.indexOf(left);
  const rightRank = PUBLISHING_CONTROL_CHANNEL_ORDER.indexOf(right);
  if (leftRank !== -1 || rightRank !== -1) {
    if (leftRank === -1) return 1;
    if (rightRank === -1) return -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
  }
  return publishingControlChannelLabel(left).localeCompare(publishingControlChannelLabel(right), "en-US")
    || left.localeCompare(right, "en-US");
}

const CONTROLLED_PUBLISHING_POLICY_PATHS = Object.freeze([
  "/api/linkedin/publish",
  "/api/publishing/run"
]);

export function resolveControlledPublishingAuthority(role, policy = {}) {
  const requiredForEndpoint = policy.requiredCapabilitiesForEndpoint || requiredCapabilitiesForEndpoint;
  const canPerform = policy.canPerformEndpoint || canPerformEndpoint;
  const decisions = CONTROLLED_PUBLISHING_POLICY_PATHS.map((path) => ({
    required: requiredForEndpoint("POST", path),
    decision: canPerform(role, "POST", path)
  }));
  const capabilityMatches = decisions.every(({ required, decision }) =>
    Array.isArray(required) && required.length === 1 && required[0] === "social_publish"
    && Array.isArray(decision?.requiredCapabilities) && decision.requiredCapabilities.length === 1
    && decision.requiredCapabilities[0] === "social_publish"
  );
  const allowedValues = [...new Set(decisions.map(({ decision }) => decision?.ok === true))];
  if (!capabilityMatches || allowedValues.length !== 1) {
    return deepFreeze({ available: false, allowed: false, requiredCapability: "social_publish", reason: "publication_policy_unavailable" });
  }
  return deepFreeze({ available: true, allowed: allowedValues[0], requiredCapability: "social_publish", reason: null });
}

export function currentPublishingApprovalRevision(post = {}, reviewPlan = {}) {
  const explicit = clean(post.approvalRevision || post.approval_revision);
  if (explicit) return deepFreeze({ available: true, value: explicit, source: "approval_revision" });
  const approvedAt = clean(post.approvedAt || post.approved_at);
  if (approvedAt) return deepFreeze({ available: true, value: approvedAt, source: "approved_at" });
  const reviewedApproval = lower(reviewPlan.approval?.state?.key || reviewPlan.state?.key);
  const publishableStatus = lower(post.status);
  if (reviewedApproval === "approved" || ["approved", "scheduled", "publishing", "posted", "published", "retry_ready"].includes(publishableStatus)) {
    return deepFreeze({ available: true, value: "approval-1", source: "reviewed_service_fallback" });
  }
  return deepFreeze({ available: false, value: null, source: null });
}

function unavailable(generatedAt, reason) {
  return deepFreeze({ authorized: false, found: false, generatedAt, reason, publishAuthority: null });
}

export function collectPostPublishingControlSources(state = {}, actor = {}, postId = "", now = "") {
  const generatedAt = validNow(now);
  const role = actorRole(actor);
  const requestedId = safeId(postId);
  if (!generatedAt) return unavailable(null, "invalid_clock");
  if (!role || !requestedId) return unavailable(generatedAt, "actor_cannot_read");

  const readinessSource = collectPostReadinessSources(state, actor, requestedId);
  if (!readinessSource.authorized || !readinessSource.found || !readinessSource.postView) {
    return unavailable(generatedAt, readinessSource.reason || "post_not_visible");
  }

  const post = readinessSource.post;
  const composerDraft = buildPostComposerDraft(state, actor, requestedId, { now: generatedAt });
  const variants = buildPostChannelVariants(state, actor, requestedId);
  const readiness = buildPostReadiness(state, actor, requestedId, generatedAt);
  const schedulePlan = buildPostSchedulePlan(state, actor, requestedId, generatedAt);
  const reviewPlan = buildPostReviewPlan(state, actor, requestedId, generatedAt);
  if (!composerDraft.postId || !variants.postId || !readiness.available || !schedulePlan.postId || !reviewPlan.postId) {
    return unavailable(generatedAt, "required_source_unavailable");
  }

  const publishClaims = visibleRelated(state, "publishClaims", role, requestedId);
  const nestedAttempts = visibleNestedAttempts(post, role);
  const publishEvents = readinessSource.publishEvents.map(cloneValue);
  const accounts = readinessSource.accounts.map(({ channel, account }) => ({
    channel,
    account: account ? cloneValue(account) : null
  }));

  return deepFreeze({
    authorized: true,
    found: true,
    generatedAt,
    role,
    post: cloneValue(post),
    postView: readinessSource.postView,
    composerDraft,
    variants,
    readiness,
    schedulePlan,
    reviewPlan,
    accounts,
    gates: readinessSource.gates ? { ...readinessSource.gates } : null,
    publishEvents,
    publishClaims,
    nestedAttempts,
    sourcePresence: {
      socialAccounts: readinessSource.sourcePresence.socialAccounts,
      livePostingGates: readinessSource.sourcePresence.livePostingGates,
      publishEvents: readinessSource.sourcePresence.publishEvents,
      publishClaims: Array.isArray(state.publishClaims),
      publishAttempts: Object.prototype.hasOwnProperty.call(post, "publishAttempts")
        || Object.prototype.hasOwnProperty.call(post, "publish_attempts")
    },
    publishAuthority: resolveControlledPublishingAuthority(role),
    approvalRevision: currentPublishingApprovalRevision(post, reviewPlan),
    diagnostics: {
      candidatesExamined: readinessSource.candidatesExamined + publishClaims.length + nestedAttempts.length,
      postsProjected: 1
    }
  });
}
