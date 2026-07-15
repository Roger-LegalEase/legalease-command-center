import crypto from "node:crypto";

export const PUBLISH_STATES = Object.freeze(["approved", "publish_claimed", "publishing", "published", "failed_retryable", "failed_terminal", "reconciliation_required"]);

export function socialPublishClaimId(post = {}, channel = "") {
  const revision = String(post.approvalRevision || post.approvedAt || post.approved_at || "approval-1");
  return `social-publish-${crypto.createHash("sha256").update(`${post.id}:${revision}:${channel}`).digest("hex")}`;
}

export async function acquireSocialPublishClaim(store, { post, channel, actorId = "system", requestId = "" } = {}) {
  if (!store || !post?.id || !channel) throw new Error("Publish claim input is invalid.");
  const id = socialPublishClaimId(post, channel);
  const row = {
    id,
    postId: String(post.id),
    channel: String(channel),
    approvalRevision: String(post.approvalRevision || post.approvedAt || post.approved_at || "approval-1"),
    status: "publish_claimed",
    actorId: String(actorId || "system"),
    requestId: String(requestId || ""),
    idempotencyKey: id,
    attemptCount: 1,
    claimedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const result = typeof store.claimSocialPublish === "function"
    ? await store.claimSocialPublish({ postId: post.id, expectedVersion: post._version, claim: row })
    : await store.claimCollectionItems("publishClaims", [row]);
  return { claimed: Boolean(result.claimed ?? result.inserted?.length), claim: row, idempotencyKey: id };
}

export async function transitionSocialPublishClaim(store, claimId, status, patch = {}) {
  if (!PUBLISH_STATES.includes(status) || status === "approved") throw new Error("Publish claim transition is invalid.");
  return store.mutateCollectionItem("publishClaims", claimId, (current) => {
    if (!current) throw new Error("Publish claim was not found.");
    if (["published", "failed_terminal", "reconciliation_required"].includes(current.status) && current.status !== status) throw new Error("Publish claim is terminal.");
    return { ...current, ...patch, status, updatedAt: new Date().toISOString() };
  }, { maxRetries: 1 });
}

export function safeProviderReference(value = "") {
  const text = String(value || "");
  return text ? crypto.createHash("sha256").update(text).digest("hex").slice(0, 24) : "";
}

export function reconciliationQueue(state = {}) {
  return (state.publishClaims || []).filter((claim) => ["publishing", "reconciliation_required"].includes(claim.status)).map((claim) => ({
    id: claim.id,
    postId: claim.postId,
    channel: claim.channel,
    status: claim.status,
    claimedAt: claim.claimedAt,
    updatedAt: claim.updatedAt
  }));
}
