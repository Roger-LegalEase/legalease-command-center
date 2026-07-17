import {
  READINESS_AND_SAFETY_LABELS,
  WORKFLOW_STATUSES
} from "../labels.mjs";
import { collectPostSourceContext } from "./post-sources.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

const CHANNEL_ORDER = Object.freeze(["linkedin", "instagram", "facebook", "x", "threads"]);
const CHANNEL_LABELS = Object.freeze({
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  threads: "Threads"
});
const PERFORMANCE_FIELDS = Object.freeze(["impressions", "likes", "comments", "shares", "saves", "reposts", "clicks", "leads"]);

export const POST_STATUS_CONTRACT = Object.freeze({
  idea: Object.freeze({ key: "idea", label: WORKFLOW_STATUSES.post[0] }),
  draft: Object.freeze({ key: "draft", label: WORKFLOW_STATUSES.post[1] }),
  needsReview: Object.freeze({ key: "needs_review", label: WORKFLOW_STATUSES.post[2] }),
  scheduled: Object.freeze({ key: "scheduled", label: WORKFLOW_STATUSES.post[3] }),
  published: Object.freeze({ key: "published", label: WORKFLOW_STATUSES.post[4] })
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function addGrouped(map, key, record) {
  const id = clean(key);
  if (!id) return;
  if (!map.has(id)) map.set(id, []);
  map.get(id).push(record);
}

function commonPostIds(record = {}) {
  return [...new Set([
    record.postId,
    record.post_id,
    record.relatedPostId,
    record.related_post_id,
    record.queuedPostId,
    record.generatedPostId,
    record.sourcePostId,
    ...list(record.postIds),
    ...list(record.post_ids),
    ...list(record.generatedPostIds),
    ...list(record.relatedPostIds)
  ].map(clean).filter(Boolean))];
}

function recordPostIds(record = {}, collection = "") {
  const ids = commonPostIds(record);
  const type = lower(record.type || record.sourceType || record.resourceType || record.relatedObjectType || record.objectType);
  if (["approvals", "approvalQueue", "queueItems"].includes(collection) && /^(?:post|posts|social_post|social-post|social)$/.test(type)) {
    ids.push(...[record.sourceId, record.resourceId, record.relatedObjectId].map(clean).filter(Boolean));
  }
  if (collection === "publishEvents") ids.push(clean(record.relatedObjectId));
  if (["activityEvents", "auditHistory"].includes(collection) && /^(?:post|posts|social_post|social-post|social)$/.test(type)) {
    ids.push(...[record.resourceId, record.relatedObjectId, record.objectId].map(clean).filter(Boolean));
  }
  const ref = record.sourceRef || {};
  if (clean(ref.collection) === "posts") ids.push(clean(ref.itemId || ref.sourceId || ref.id));
  return [...new Set(ids.filter(Boolean))];
}

function collectionIndex(state = {}, collection = "") {
  const byId = new Map();
  const byPost = new Map();
  const source = collection === "settings.sourceItems" ? state.settings?.sourceItems : state[collection];
  for (const record of list(source)) {
    const id = clean(record?.id || record?.key || record?.slug);
    if (id && !byId.has(id)) byId.set(id, record);
    for (const postId of recordPostIds(record, collection)) addGrouped(byPost, postId, record);
  }
  return { byId, byPost };
}

const INDEXED_SOURCE_COLLECTIONS = Object.freeze([
  "contentBank",
  "settings.sourceItems",
  "reports",
  "dataRoomItems",
  "evidencePackNotes",
  "approvals",
  "approvalQueue",
  "queueItems",
  "postImages",
  "brandAssets",
  "postingKits",
  "publishEvents",
  "activityEvents",
  "auditHistory",
  "generationBatches"
]);

function createProjectionIndex(state = {}) {
  return Object.fromEntries(INDEXED_SOURCE_COLLECTIONS.map((collection) => [collection, collectionIndex(state, collection)]));
}

function explicitPostReferenceIds(post = {}, collection = "") {
  const references = [post.sourceRef, post.proofSourceRef, ...list(post.sourceRefs), ...list(post.sourceReferences)]
    .filter((reference) => reference && typeof reference === "object" && clean(reference.collection || reference.sourceCollection) === collection)
    .map((reference) => clean(reference.itemId || reference.sourceId || reference.id));
  const fields = {
    contentBank: [post.contentBankIdeaId, post.content_bank_idea_id, post.ideaId],
    "settings.sourceItems": [post.sourceItemId, post.source_item_id],
    reports: [post.reportId, post.sourceReportId],
    dataRoomItems: [post.dataRoomItemId, post.proofItemId, post.proofSourceId],
    evidencePackNotes: [post.evidencePackNoteId, post.evidenceNoteId]
  };
  return [...new Set([...(fields[collection] || []), ...references].map(clean).filter(Boolean))];
}

function explicitBrandAssetIds(post = {}) {
  const variants = variantEntries(post);
  return [...new Set([
    post.assetId,
    ...list(post.assetIds),
    post.brandAssetId,
    ...list(post.brandAssetIds),
    ...list(post.defaultAssetIds),
    post.logoAssetId,
    post.wilmaAssetId,
    post.image,
    post.finalExportKit?.assetId,
    ...list(post.finalExportKit?.assetIds),
    post.wilmaImageWorkflow?.assetId,
    post.wilmaImageWorkflow?.wilmaPoseReferenceId,
    ...[...variants.values()].flatMap((variant) => [variant.assetId, variant.imageId, variant.mediaId, ...list(variant.assetIds), ...list(variant.mediaAssetIds)])
  ].map(clean).filter(Boolean))];
}

function recordsForPost(index, post, collection) {
  const postId = clean(post.id);
  const source = index[collection];
  const records = [...(source?.byPost.get(postId) || [])];
  for (const id of explicitPostReferenceIds(post, collection)) {
    const record = source?.byId.get(id);
    if (record) records.push(record);
  }
  const seen = new Set();
  return records.filter((record) => {
    const id = clean(record?.id || record?.key || record?.slug);
    const key = id || record;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function indexedStateForPost(state, index, post) {
  const brandAssets = [];
  for (const id of explicitBrandAssetIds(post)) {
    const direct = index.brandAssets.byId.get(id);
    if (direct) brandAssets.push(direct);
    for (const asset of index.brandAssets.byId.values()) {
      if (clean(asset.slug) === id) brandAssets.push(asset);
    }
  }
  return {
    runtime: state.runtime,
    contentBank: recordsForPost(index, post, "contentBank"),
    reports: recordsForPost(index, post, "reports"),
    dataRoomItems: recordsForPost(index, post, "dataRoomItems"),
    evidencePackNotes: recordsForPost(index, post, "evidencePackNotes"),
    approvals: recordsForPost(index, post, "approvals"),
    approvalQueue: recordsForPost(index, post, "approvalQueue"),
    queueItems: recordsForPost(index, post, "queueItems"),
    postImages: recordsForPost(index, post, "postImages"),
    brandAssets,
    postingKits: recordsForPost(index, post, "postingKits"),
    publishEvents: recordsForPost(index, post, "publishEvents"),
    activityEvents: recordsForPost(index, post, "activityEvents"),
    auditHistory: recordsForPost(index, post, "auditHistory"),
    generationBatches: recordsForPost(index, post, "generationBatches"),
    settings: { sourceItems: recordsForPost(index, post, "settings.sourceItems") }
  };
}

function firstText(...values) {
  return values.map(clean).find(Boolean) || "";
}

function uniqueText(values = []) {
  return [...new Set(list(values).map(clean).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function objectMap(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function channelMap(post = {}, snakeName, camelName, fallbackName = "") {
  return objectMap(post[snakeName], post[camelName], fallbackName ? post[fallbackName] : null);
}

function normalizedChannel(value = "") {
  const channel = lower(value).replaceAll(" ", "");
  if (["twitter", "twitter/x", "twitter-x", "x/twitter", "x-twitter"].includes(channel)) return "x";
  if (channel.includes("linkedin")) return "linkedin";
  if (channel.includes("instagram")) return "instagram";
  if (channel.includes("facebook")) return "facebook";
  if (channel.includes("threads")) return "threads";
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(channel) ? channel : "";
}

function channelLabel(channel = "") {
  if (CHANNEL_LABELS[channel]) return CHANNEL_LABELS[channel];
  const words = clean(channel).replaceAll(/[_-]+/g, " ");
  return words ? words.charAt(0).toLocaleUpperCase("en-US") + words.slice(1) : "Channel";
}

function compareChannels(left, right) {
  const leftRank = CHANNEL_ORDER.indexOf(left);
  const rightRank = CHANNEL_ORDER.indexOf(right);
  if (leftRank >= 0 || rightRank >= 0) {
    if (leftRank < 0) return 1;
    if (rightRank < 0) return -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
  }
  return left.localeCompare(right, "en-US");
}

function variantEntries(post = {}) {
  const raw = post.channelVariants || post.channel_variants || post.variantsByChannel || {};
  const entries = Array.isArray(raw)
    ? [...raw].sort((left, right) =>
      normalizedChannel(left?.channel || left?.platform).localeCompare(normalizedChannel(right?.channel || right?.platform), "en-US")
      || clean(right?.updatedAt || right?.updated_at || right?.createdAt || right?.created_at)
        .localeCompare(clean(left?.updatedAt || left?.updated_at || left?.createdAt || left?.created_at), "en-US")
      || clean(left?.body || left?.caption || left?.text).localeCompare(clean(right?.body || right?.caption || right?.text), "en-US")
    ).map((variant) => [normalizedChannel(variant?.channel || variant?.platform), variant])
    : Object.entries(raw).map(([channel, variant]) => [normalizedChannel(channel), variant]);
  const map = new Map();
  for (const [channel, variant] of entries) {
    if (channel && variant && typeof variant === "object" && !map.has(channel)) map.set(channel, variant);
  }
  return map;
}

function postChannels(post = {}, context = {}) {
  const variants = variantEntries(post);
  const publishStatuses = channelMap(post, "per_channel_publish_status", "perChannelPublishStatus");
  const publishedUrls = channelMap(post, "per_channel_published_url", "perChannelPublishedUrl", "publishedUrls");
  const values = [
    ...list(post.targetChannels),
    ...list(post.target_channels),
    ...list(post.manualPostedChannels),
    post.platform,
    post.channel,
    ...variants.keys(),
    ...Object.keys(publishStatuses),
    ...Object.keys(publishedUrls),
    ...list(context.publishEvents).map((event) => event.channel)
  ].map(normalizedChannel).filter(Boolean);
  return [...new Set(values)].sort(compareChannels);
}

function hashtags(value) {
  if (Array.isArray(value)) return uniqueText(value);
  return uniqueText(clean(value).split(/[\s,]+/u));
}

function variantAssetIds(variant = {}, assetReferences = []) {
  const requested = new Set([
    ...list(variant.assetIds),
    ...list(variant.mediaAssetIds),
    variant.assetId,
    variant.imageId,
    variant.mediaId
  ].map(clean).filter(Boolean));
  const matches = assetReferences.filter((asset) => requested.has(asset.sourceId) || requested.has(asset.id));
  return (requested.size ? matches : assetReferences.filter((asset) => asset.kind === "image"))
    .map((asset) => asset.id);
}

function channelVariants(post, context) {
  const variants = variantEntries(post);
  const sharedTitle = firstText(post.title, post.headline, post.topic, post.hook, "Untitled post");
  const sharedBody = firstText(post.body, post.caption, post.text, post.notes);
  return postChannels(post, context).map((channel) => {
    const variant = variants.get(channel) || {};
    return {
      channel,
      label: channelLabel(channel),
      isCustomized: variants.has(channel),
      content: {
        title: firstText(variant.title, variant.headline, sharedTitle),
        body: firstText(variant.body, variant.caption, variant.text, sharedBody),
        hook: firstText(variant.hook, variant.headline, post.hook, post.headline),
        cta: firstText(variant.cta, post.cta),
        hashtags: variant.hashtags !== undefined ? hashtags(variant.hashtags) : hashtags(post.hashtags)
      },
      assetReferenceIds: variantAssetIds(variant, context.assetReferences)
    };
  });
}

function publishStatusValues(post = {}) {
  return Object.values(channelMap(post, "per_channel_publish_status", "perChannelPublishStatus")).map(lower);
}

function hasPublishedTruth(post = {}) {
  const status = lower(post.status || post.type);
  return /^(?:posted|published|manually_posted|manually_published)$/.test(status)
    || Boolean(firstText(post.publishedAt, post.published_at, post.manuallyPostedAt, post.manually_published_at, post.postedAt, post.posted_at, post.publishedUrl, post.published_url))
    || publishStatusValues(post).some((value) => /posted|published|success/.test(value));
}

export function adaptPostStatus(post = {}) {
  const status = lower(post.status || post.type || post.approvalStatus);
  const approval = lower(post.approvalStatus || post.approval_status);
  const publishing = lower(post.publishingStatus || post.publishing_status);
  if (hasPublishedTruth(post)) return POST_STATUS_CONTRACT.published;
  if (/failed|blocked|needs_review|review_required|needs_approval|changes_requested/.test(`${status} ${approval} ${publishing}`)) {
    return POST_STATUS_CONTRACT.needsReview;
  }
  if (status === "scheduled" || Boolean(firstText(post.scheduledFor, post.scheduled_at, post.planned_date, post.plannedDate))) {
    return POST_STATUS_CONTRACT.scheduled;
  }
  if (status === "idea" || status === "ready_to_generate" || (lower(post.contentType) === "idea" && !firstText(post.body, post.caption, post.text))) {
    return POST_STATUS_CONTRACT.idea;
  }
  return POST_STATUS_CONTRACT.draft;
}

function validScheduleValue(value = "") {
  const text = clean(value);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return "";
  const parseValue = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T00:00:00.000Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text.replace(" ", "T")}Z`;
  return Number.isFinite(Date.parse(parseValue)) ? text : "";
}

function scheduleProjection(post = {}, variants = []) {
  const scheduledAt = validScheduleValue(firstText(post.scheduledFor, post.scheduled_at, post.planned_date, post.plannedDate));
  return {
    scheduled: Boolean(scheduledAt),
    scheduledAt,
    timezone: firstText(post.timezone, post.timeZone, post.scheduleTimezone),
    channels: variants.map((variant) => variant.channel)
  };
}

function latestPostImage(state = {}, postId = "") {
  return list(state.postImages)
    .filter((image) => clean(image?.postId || image?.post_id) === postId)
    .sort((left, right) =>
      Number(right.versionNumber || right.imageVersion || 0) - Number(left.versionNumber || left.imageVersion || 0)
      || clean(right.createdAt || right.created_at).localeCompare(clean(left.createdAt || left.created_at), "en-US")
      || clean(left.id).localeCompare(clean(right.id), "en-US")
    )[0] || null;
}

function approvalSummary(post = {}, approvals = []) {
  const postStatus = lower(post.status);
  const postApproval = lower(post.approvalStatus || post.approval_status);
  const latest = approvals[0] || {};
  const latestStatus = lower(latest.status);
  if (hasPublishedTruth(post) || ["approved", "scheduled", "publishing", "retry_ready"].includes(postStatus)
    || /approved|complete/.test(postApproval) || /approved|complete/.test(latestStatus)
    || firstText(post.approvedAt, post.approved_at)) {
    return { key: "approved", label: READINESS_AND_SAFETY_LABELS.approved };
  }
  if (/reject|declin|changes_requested|blocked/.test(`${postApproval} ${latestStatus}`)) {
    return { key: "changes_requested", label: "Changes requested" };
  }
  return { key: "needs_approval", label: READINESS_AND_SAFETY_LABELS.needsApproval };
}

function uniqueMessages(messages = []) {
  const seen = new Set();
  return messages.filter((message) => {
    if (!message?.key || seen.has(message.key)) return false;
    seen.add(message.key);
    return true;
  });
}

function publishingIsExplicitlyOff(state = {}, variants = []) {
  const gates = state.runtime?.livePostingGates;
  if (!gates || typeof gates !== "object") return false;
  const selected = variants.map((variant) => gates[variant.channel]).filter((gate) => gate !== undefined);
  return selected.some((gate) => gate === false || gate?.enabled === false);
}

function readinessSummary(state, post, status, variants, scheduleValue, context) {
  if (status.key === "published") {
    return {
      key: "published",
      label: POST_STATUS_CONTRACT.published.label,
      approval: { key: "approved", label: READINESS_AND_SAFETY_LABELS.approved },
      blockers: [],
      warnings: [],
      blockerCount: 0,
      warningCount: 0
    };
  }
  const blockers = [];
  const warnings = [];
  const approval = approvalSummary(post, context.approvals);
  const latestImage = latestPostImage(state, clean(post.id));
  const guidelines = post.guidelinesGate || post.guidelines_gate;
  const guidelinesFailed = guidelines?.passed === false || list(guidelines?.hardFails).length > 0;
  const imageFailed = latestImage && (
    latestImage.renderQa?.passed === false
    || latestImage.styleGate?.passed === false
    || /failed|qa_failed|blocked/.test(lower(latestImage.generationStatus || latestImage.imageStatus))
  );
  const publishingStatus = lower(post.publishingStatus || post.publishing_status);
  const imageReady = Boolean(post.imageFinalized || post.image_finalized || latestImage?.finalImageReady || latestImage?.final_image_ready);
  const imageOmitted = Boolean(post.imageIntentionallyOmitted || post.image_intentionally_omitted);
  const previewConfirmed = Boolean(post.finalPreviewConfirmed || post.final_preview_confirmed || imageOmitted);

  if (status.key === "idea") blockers.push({ key: "draft", label: "Turn the idea into a draft." });
  if (guidelinesFailed) blockers.push({ key: "content", label: "Copy needs changes before review." });
  if (lower(post.complianceRisk || post.compliance_risk) === "high") blockers.push({ key: "content_review", label: "A high-risk content review is still required." });
  if (status.key !== "idea" && post.copyReviewed === false) blockers.push({ key: "copy_review", label: "Copy needs review." });
  if (imageFailed) blockers.push({ key: "image_review", label: "The image needs changes before scheduling." });
  if (status.key !== "idea" && !imageReady && !imageOmitted) blockers.push({ key: "image", label: "Prepare the final image." });
  if (status.key !== "idea" && (imageReady || imageOmitted) && !previewConfirmed) blockers.push({ key: "preview", label: "Confirm the final preview." });
  if (status.key !== "idea" && !variants.length) blockers.push({ key: "channel", label: "Choose at least one channel." });
  if (/blocked|failed|setup_required|not_connected/.test(publishingStatus)) blockers.push({ key: "connection", label: "A channel connection needs attention." });
  if (!guidelines || typeof guidelines.passed !== "boolean") warnings.push({ key: "content_check", label: "Content checks will run again before scheduling." });
  if (publishingIsExplicitlyOff(state, variants)) warnings.push({ key: "publishing", label: READINESS_AND_SAFETY_LABELS.publishingOff });

  const normalizedBlockers = uniqueMessages(blockers);
  const normalizedWarnings = uniqueMessages(warnings);
  let key = "ready_to_schedule";
  let label = READINESS_AND_SAFETY_LABELS.readyToSchedule;
  if (normalizedBlockers.length) {
    key = "fixes_needed";
    label = READINESS_AND_SAFETY_LABELS.fixesNeeded;
  } else if (approval.key !== "approved") {
    key = "needs_approval";
    label = READINESS_AND_SAFETY_LABELS.needsApproval;
  } else if (status.key === "scheduled" || scheduleValue.scheduled) {
    key = "scheduled";
    label = POST_STATUS_CONTRACT.scheduled.label;
  }
  return {
    key,
    label,
    approval,
    blockers: normalizedBlockers,
    warnings: normalizedWarnings,
    blockerCount: normalizedBlockers.length,
    warningCount: normalizedWarnings.length
  };
}

function safeHttpsUrl(value = "") {
  const text = clean(value);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function metricValue(performance, key) {
  if (!performance || !Object.prototype.hasOwnProperty.call(performance, key)) return null;
  const number = Number(performance[key]);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function resultStatus(value = "", fallback = null) {
  const status = lower(value);
  if (/posted|published|success|complete/.test(status)) return POST_STATUS_CONTRACT.published;
  if (/scheduled|queued|pending/.test(status)) return POST_STATUS_CONTRACT.scheduled;
  if (/failed|blocked|error|retry/.test(status)) return POST_STATUS_CONTRACT.needsReview;
  return fallback || Object.freeze({ key: "unavailable", label: "Unavailable" });
}

function publishedUrlMap(post = {}) {
  return channelMap(post, "per_channel_published_url", "perChannelPublishedUrl", "publishedUrls");
}

function resultSummary(post, status, variants, context) {
  const performance = post.performance && typeof post.performance === "object" ? post.performance : null;
  const metrics = Object.fromEntries(PERFORMANCE_FIELDS.map((field) => [field, metricValue(performance, field)]));
  const metricsAvailable = Object.values(metrics).some((value) => value !== null);
  const explicitRate = Number(performance?.engagementRate ?? post.engagementRate);
  const engagementTotal = ["likes", "comments", "shares", "saves", "reposts", "clicks"]
    .reduce((sum, field) => sum + Number(metrics[field] || 0), 0);
  const engagementRate = Number.isFinite(explicitRate) && explicitRate >= 0
    ? explicitRate
    : metrics.impressions > 0 ? Number(((engagementTotal / metrics.impressions) * 100).toFixed(2)) : null;
  const perChannelStatus = channelMap(post, "per_channel_publish_status", "perChannelPublishStatus");
  const perChannelUrls = publishedUrlMap(post);
  const globalPublishedAt = firstText(post.publishedAt, post.published_at, post.manuallyPostedAt, post.manually_published_at, post.postedAt, post.posted_at);
  const globalUrl = safeHttpsUrl(firstText(post.publishedUrl, post.published_url, post.postUrl));
  const channelResults = variants.map((variant) => {
    const events = context.publishEvents.filter((event) => normalizedChannel(event.channel) === variant.channel);
    const latest = [...events].sort((left, right) => clean(right.occurredAt).localeCompare(clean(left.occurredAt), "en-US"))[0] || {};
    const url = safeHttpsUrl(firstText(perChannelUrls[variant.channel], latest.publishedUrl, variants.length === 1 ? globalUrl : ""));
    const channelStatus = resultStatus(firstText(perChannelStatus[variant.channel], latest.status, latest.eventType), status.key === "published" ? status : null);
    return {
      channel: variant.channel,
      label: variant.label,
      status: channelStatus,
      publishedAt: channelStatus.key === "published" ? firstText(latest.occurredAt, globalPublishedAt) : "",
      publishedUrl: url
    };
  });
  const confirmedPublication = status.key === "published" || channelResults.some((result) => result.status.key === "published");
  const available = confirmedPublication || metricsAvailable || Boolean(globalUrl) || channelResults.some((result) => result.publishedUrl);
  return {
    available,
    label: available ? (metricsAvailable ? "Results available" : "Published; results unavailable") : "Results unavailable",
    publishedAt: globalPublishedAt,
    publishedUrl: globalUrl,
    metricsAvailable,
    metrics,
    engagementRate,
    channelResults
  };
}

function activityLabel(record = {}) {
  const text = lower(`${record.action || ""} ${record.status || ""}`);
  if (record.activityKind === "approval") {
    if (/approved|complete/.test(text)) return "Post approved";
    if (/reject|declin|changes/.test(text)) return "Changes requested";
    return "Post review updated";
  }
  if (record.activityKind === "publication") {
    if (/posted|published|success|complete/.test(text)) return "Post published";
    if (/scheduled|queued/.test(text)) return "Post scheduled";
    if (/failed|blocked|error/.test(text)) return "Publishing update needs review";
    return "Publishing activity recorded";
  }
  if (/creat|draft|generated/.test(text)) return "Post created";
  if (/schedul/.test(text)) return "Post scheduled";
  if (/publish|posted/.test(text)) return "Post published";
  if (/approv/.test(text)) return "Post approved";
  if (/request|reject|change/.test(text)) return "Changes requested";
  if (/image|asset|preview/.test(text)) return "Post creative updated";
  return "Post activity recorded";
}

function activity(context = {}) {
  const seen = new Set();
  return context.activityRecords.map((record) => {
    const id = `${record.sourceCollection}:${record.sourceId}`;
    return {
      id,
      type: record.activityKind,
      label: activityLabel(record),
      channel: normalizedChannel(record.channel),
      channelLabel: record.channel ? channelLabel(normalizedChannel(record.channel)) : "",
      occurredAt: clean(record.occurredAt),
      href: clean(record.href)
    };
  }).filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function stablePosts(value = []) {
  const ordered = [...list(value)].filter((post) => post && typeof post === "object").sort((left, right) =>
    clean(left.id).localeCompare(clean(right.id), "en-US")
    || clean(right.updatedAt || right.updated_at || right.createdAt || right.created_at)
      .localeCompare(clean(left.updatedAt || left.updated_at || left.createdAt || left.created_at), "en-US")
    || clean(left.title || left.hook || left.body).localeCompare(clean(right.title || right.hook || right.body), "en-US")
  );
  const seen = new Set();
  return ordered.filter((post) => {
    const id = clean(post.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function projectPostView(state = {}, postOrId = {}, sourceState = state) {
  const post = typeof postOrId === "string"
    ? stablePosts(state.posts).find((candidate) => clean(candidate.id) === clean(postOrId))
    : postOrId;
  if (!post || typeof post !== "object") return null;
  const context = collectPostSourceContext(sourceState, post);
  if (!context) return null;
  const status = adaptPostStatus(post);
  const variants = channelVariants(post, context);
  const scheduleValue = scheduleProjection(post, variants);
  const title = firstText(post.title, post.headline, post.topic, post.hook, "Untitled post");
  const result = {
    id: clean(post.id),
    stableKey: `post:${clean(post.id)}`,
    objectType: "Post",
    title,
    content: {
      body: firstText(post.body, post.caption, post.text, post.notes),
      hook: firstText(post.hook, post.headline),
      cta: clean(post.cta),
      hashtags: hashtags(post.hashtags),
      audience: clean(post.audience),
      campaign: clean(post.campaign),
      topic: clean(post.topic || post.contentBucket),
      owner: clean(post.owner)
    },
    status: { ...status },
    sourceReferences: context.sourceReferences.map((reference) => ({ ...reference })),
    channelVariants: variants,
    assetReferences: context.assetReferences.map((reference) => ({ ...reference, status: { ...reference.status } })),
    schedule: scheduleValue,
    readinessSummary: readinessSummary(sourceState, post, status, variants, scheduleValue, context),
    resultSummary: resultSummary(post, status, variants, context),
    activity: activity(context),
    createdAt: firstText(post.createdAt, post.created_at),
    updatedAt: firstText(post.updatedAt, post.updated_at, post.createdAt, post.created_at),
    href: context.href
  };
  return deepFreeze(result);
}

export function buildPostView(state = {}, postOrId = {}) {
  return projectPostView(state, postOrId, state);
}

export function buildPostViews(state = {}) {
  const posts = stablePosts(state.posts);
  const index = createProjectionIndex(state);
  return deepFreeze(posts.map((post) => projectPostView(state, post, indexedStateForPost(state, index, post))).filter(Boolean));
}
