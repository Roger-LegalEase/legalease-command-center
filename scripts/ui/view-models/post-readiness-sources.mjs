import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";
import { buildPostView } from "./post-view.mjs";

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

export const POST_READINESS_SOURCE_MATRIX = deepFreeze({
  included: [
    { collection: "posts", truth: "Content, selected channels, schedule, approval, and publication state" },
    { collection: "postImages", truth: "Explicit image generation, render QA, style, and final-asset state" },
    { collection: "brandAssets", truth: "Explicitly related approved brand assets" },
    { collection: "postingKits", truth: "Explicitly related creative output state" },
    { collection: "socialAccounts", truth: "Per-channel durable connection state" },
    { collection: "runtime.livePostingGates", truth: "Read-only per-channel publication gates" },
    { collection: "approvals / approvalQueue / queueItems", truth: "Explicit Post review and approval state" },
    { collection: "publishEvents", truth: "Explicit publication results and channel outcomes" },
    { collection: "PostView", truth: "CCX-300 normalized Post identity, variants, schedule, assets, and results" }
  ],
  deferred: [
    { collection: "provider payloads and token records", reason: "Operational secrets and raw provider bodies are never projection inputs." },
    { collection: "activityEvents / auditHistory", reason: "Text and timestamps cannot establish connection, approval, schedule, or publication truth." },
    { collection: "analytics providers", reason: "No provider is called; only explicitly stored Post result fields are read." },
    { collection: "environment configuration", reason: "The projection reads normalized runtime gate truth and never reads environment values." }
  ]
});

export const READINESS_CHANNEL_ORDER = Object.freeze(["linkedin", "instagram", "facebook", "x", "threads"]);
export const READINESS_CHANNEL_LABELS = Object.freeze({
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  threads: "Threads"
});

export function normalizeReadinessChannel(value = "") {
  const channel = lower(value).replaceAll(" ", "");
  if (["twitter", "twitter/x", "twitter-x", "x/twitter", "x-twitter"].includes(channel)) return "x";
  if (channel.includes("linkedin")) return "linkedin";
  if (channel.includes("instagram")) return "instagram";
  if (channel.includes("facebook")) return "facebook";
  if (channel.includes("threads")) return "threads";
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(channel) ? channel : "";
}

export function readinessChannelLabel(channel = "") {
  if (READINESS_CHANNEL_LABELS[channel]) return READINESS_CHANNEL_LABELS[channel];
  const words = clean(channel).replaceAll(/[_-]+/g, " ");
  return words ? words.charAt(0).toLocaleUpperCase("en-US") + words.slice(1) : "Channel";
}

function actorRole(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal") ? role : "";
}

function visibleRecords(state, collection, role) {
  return list(state[collection]).filter((record) => recordVisibleToActor(record, role)).map(cloneValue);
}

function postIds(record = {}, collection = "") {
  const ids = [
    record.postId, record.post_id, record.relatedPostId, record.related_post_id,
    record.queuedPostId, record.generatedPostId, record.sourcePostId,
    ...list(record.postIds), ...list(record.post_ids)
  ].map(clean).filter(Boolean);
  const type = lower(record.type || record.sourceType || record.resourceType || record.relatedObjectType || record.objectType);
  if (["approvals", "approvalQueue", "queueItems"].includes(collection)
    && /^(?:post|posts|social_post|social-post|social)$/.test(type)) {
    ids.push(...[record.sourceId, record.resourceId, record.relatedObjectId].map(clean).filter(Boolean));
  }
  if (collection === "publishEvents") ids.push(clean(record.relatedObjectId));
  const sourceRef = record.sourceRef || {};
  if (clean(sourceRef.collection || sourceRef.sourceCollection) === "posts") {
    ids.push(clean(sourceRef.itemId || sourceRef.sourceId || sourceRef.id));
  }
  return [...new Set(ids.filter(Boolean))];
}

function relatedToPost(record, postId, collection) {
  return postIds(record, collection).includes(postId);
}

function exactAccountForChannel(accounts, channel) {
  const exact = accounts.filter((account) => normalizeReadinessChannel(account.platform || account.channel) === channel);
  const connectedRank = (account) => {
    const status = lower(account.status || account.connectionStatus);
    const durableIdentity = Boolean(account.connectedAt || account.externalAccountId || account.accountId || account.accountName);
    const connected = account.connected === true || (status === "connected" && durableIdentity)
      || (Boolean(account.connectedAt) && !/expired|error|disconnect|refresh/.test(status));
    return connected ? 0 : /error|refresh|attention/.test(status) ? 1 : 2;
  };
  exact.sort((left, right) =>
    connectedRank(left) - connectedRank(right)
    || clean(right.updatedAt || right.updated_at || right.connectedAt).localeCompare(clean(left.updatedAt || left.updated_at || left.connectedAt), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
  return exact[0] || null;
}

function selectedChannels(post = {}, postView = {}) {
  const fromView = list(postView.channelVariants).map((variant) => variant.channel || variant.platform);
  const values = [...list(post.targetChannels), ...list(post.target_channels), post.platform, post.channel, ...fromView];
  return [...new Set(values.map(normalizeReadinessChannel).filter(Boolean))].sort((left, right) => {
    const leftRank = READINESS_CHANNEL_ORDER.indexOf(left);
    const rightRank = READINESS_CHANNEL_ORDER.indexOf(right);
    if (leftRank >= 0 || rightRank >= 0) {
      if (leftRank < 0) return 1;
      if (rightRank < 0) return -1;
      if (leftRank !== rightRank) return leftRank - rightRank;
    }
    return left.localeCompare(right, "en-US");
  });
}

function runtimeGates(state = {}) {
  const gates = state.runtime?.livePostingGates;
  if (!gates || typeof gates !== "object" || Array.isArray(gates)) return null;
  return Object.fromEntries(Object.entries(gates).flatMap(([rawChannel, gate]) => {
    const channel = normalizeReadinessChannel(rawChannel);
    if (!channel) return [];
    if (typeof gate === "boolean") return [[channel, gate]];
    if (gate && typeof gate === "object" && typeof gate.enabled === "boolean") return [[channel, gate.enabled]];
    return [[channel, null]];
  }));
}

export function collectPostReadinessSources(state = {}, actor = {}, postId = "") {
  const role = actorRole(actor);
  const requestedId = safeId(postId);
  if (!role || !requestedId) return deepFreeze({ authorized: false, found: false, reason: "actor_cannot_read" });
  if (!Array.isArray(state.posts)) return deepFreeze({ authorized: true, found: false, reason: "source_data_absent" });

  const posts = visibleRecords(state, "posts", role).sort((left, right) =>
    clean(left.id).localeCompare(clean(right.id), "en-US")
    || clean(right.updatedAt || right.updated_at || right.createdAt || right.created_at)
      .localeCompare(clean(left.updatedAt || left.updated_at || left.createdAt || left.created_at), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
  const post = posts.find((candidate) => clean(candidate.id) === requestedId) || null;
  if (!post) return deepFreeze({ authorized: true, found: false, reason: "post_not_visible" });

  const relatedCollections = ["postImages", "brandAssets", "postingKits", "approvals", "approvalQueue", "queueItems", "publishEvents"];
  const gates = runtimeGates(state);
  const filteredState = { runtime: { livePostingGates: gates } };
  const sourcePresence = Object.fromEntries(relatedCollections.map((collection) => [collection, Array.isArray(state[collection])]));
  let candidatesExamined = posts.length;
  for (const collection of relatedCollections) {
    const visible = visibleRecords(state, collection, role);
    candidatesExamined += visible.length;
    filteredState[collection] = collection === "brandAssets"
      ? visible
      : visible.filter((record) => relatedToPost(record, requestedId, collection));
  }
  filteredState.settings = { sourceItems: [] };
  const postView = buildPostView(filteredState, post);
  const channels = selectedChannels(post, postView);
  const accounts = visibleRecords(state, "socialAccounts", role);
  candidatesExamined += accounts.length;

  return Object.freeze({
    authorized: true,
    found: true,
    role,
    post,
    postView,
    channels: Object.freeze([...channels]),
    accounts: Object.freeze(channels.map((channel) => Object.freeze({ channel, account: exactAccountForChannel(accounts, channel) }))),
    postImages: Object.freeze([...filteredState.postImages]),
    approvals: Object.freeze([...filteredState.approvals, ...filteredState.approvalQueue, ...filteredState.queueItems]),
    publishEvents: Object.freeze([...filteredState.publishEvents]),
    gates: gates ? Object.freeze({ ...gates }) : null,
    sourcePresence: Object.freeze({
      ...sourcePresence,
      socialAccounts: Array.isArray(state.socialAccounts),
      livePostingGates: gates !== null
    }),
    candidatesExamined
  });
}
