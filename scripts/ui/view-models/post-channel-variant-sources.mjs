import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";
import { buildPostView } from "./post-view.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const POST_CHANNEL_ORDER = Object.freeze(["linkedin", "instagram", "facebook", "x", "threads"]);
export const POST_CHANNEL_LABELS = Object.freeze({
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  threads: "Threads"
});

export const POST_CHANNEL_VARIANT_SOURCE_MATRIX = Object.freeze([
  Object.freeze({ source: "posts", role: "Canonical Post identity and shared content through PostView" }),
  Object.freeze({ source: "posts.channelVariants", role: "Explicit embedded channel variant records" }),
  Object.freeze({ source: "posts.channel_variants", role: "Legacy explicit embedded channel variant records" }),
  Object.freeze({ source: "posts.variantsByChannel", role: "Channel-keyed embedded variant records" }),
  Object.freeze({ source: "postImages", role: "Exact shared or channel-specific Post image references" }),
  Object.freeze({ source: "brandAssets", role: "Exact shared or channel-specific brand-asset references" }),
  Object.freeze({ source: "postingKits", role: "Exact shared or channel-specific posting-kit references" }),
  Object.freeze({ source: "library", role: "Exact disclaimer and guidance references" }),
  Object.freeze({ source: "settings.localAssets", role: "Exact registered local-asset references without paths" })
]);

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
  return id && id.length <= 240 && !/[\u0000-\u001f\u007f<>]/u.test(id) ? id : "";
}

function safeText(value = "", limit = 500) {
  const text = clean(value).replaceAll(/\s+/g, " ");
  if (!text) return null;
  if (/\b(?:access|refresh|storage|service.?role|oauth)[_ -]?(?:token|key)|\bcredential|\bprovider payload|\bsigned url|\bsecret\b/i.test(text)) return null;
  if (/data:image\//i.test(text) || /(?:^|\s)(?:\/(?:private|home|users|var|tmp)\/|[a-z]:\\)/i.test(text)) return null;
  if (/https?:\/\//i.test(text)) return null;
  return text.slice(0, limit);
}

function uniqueStrings(...values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map(clean).filter(Boolean))];
}

export function normalizePostChannel(value = "") {
  const token = lower(value).replaceAll(/\s+/g, "");
  if (["twitter", "twitter/x", "twitter-x", "x/twitter", "x-twitter"].includes(token)) return "x";
  if (["linkedin", "instagram", "facebook", "x", "threads"].includes(token)) return token;
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(token) ? token : "";
}

export function postChannelLabel(channel = "") {
  const normalized = normalizePostChannel(channel);
  if (POST_CHANNEL_LABELS[normalized]) return POST_CHANNEL_LABELS[normalized];
  const words = normalized.replaceAll(/[_-]+/g, " ");
  return words ? words.charAt(0).toLocaleUpperCase("en-US") + words.slice(1) : "Channel";
}

export function comparePostChannels(left = "", right = "") {
  const leftRank = POST_CHANNEL_ORDER.indexOf(left);
  const rightRank = POST_CHANNEL_ORDER.indexOf(right);
  if (leftRank >= 0 || rightRank >= 0) {
    if (leftRank < 0) return 1;
    if (rightRank < 0) return -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
  }
  return postChannelLabel(left).localeCompare(postChannelLabel(right), "en-US") || left.localeCompare(right, "en-US");
}

function actorRole(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal") ? role : "";
}

function stableVisibleRecords(records = [], role = "") {
  return list(records).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role)).sort((left, right) =>
    clean(left.id || left.key || left.slug).localeCompare(clean(right.id || right.key || right.slug), "en-US")
    || clean(right.updatedAt || right.updated_at || right.createdAt || right.created_at)
      .localeCompare(clean(left.updatedAt || left.updated_at || left.createdAt || left.created_at), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
}

function sourceReference(sourceCollection, sourceId, relationship = "record") {
  const id = safeId(sourceId);
  return id ? { sourceCollection, sourceId: id, relationship } : null;
}

function rawVariantContainer(post = {}) {
  if (Array.isArray(post.channelVariants)) return { collection: "posts.channelVariants", kind: "array", value: post.channelVariants };
  if (Array.isArray(post.channel_variants)) return { collection: "posts.channel_variants", kind: "array", value: post.channel_variants };
  if (post.variantsByChannel && typeof post.variantsByChannel === "object" && !Array.isArray(post.variantsByChannel)) {
    return { collection: "posts.variantsByChannel", kind: "map", value: post.variantsByChannel };
  }
  if (post.channelVariants && typeof post.channelVariants === "object" && !Array.isArray(post.channelVariants)) {
    return { collection: "posts.channelVariants", kind: "map", value: post.channelVariants };
  }
  if (post.channel_variants && typeof post.channel_variants === "object" && !Array.isArray(post.channel_variants)) {
    return { collection: "posts.channel_variants", kind: "map", value: post.channel_variants };
  }
  return { collection: "posts.channelVariants", kind: "array", value: [] };
}

function explicitBlankFields(record = {}) {
  const output = new Set(uniqueStrings(record.explicitBlankFields, record.explicit_blank_fields, record.blankFields, record.blank_fields));
  for (const [key, value] of Object.entries(record.fieldStates || record.field_states || {})) {
    if (["blank", "explicit_blank", "intentionally_blank"].includes(lower(value))) output.add(key);
  }
  for (const field of ["headline", "body", "hook", "cta", "hashtags"]) {
    if (record[`${field}ExplicitlyBlank`] === true || record[`${field}_explicitly_blank`] === true) output.add(field);
  }
  return [...output].map((field) => lower(field)).filter(Boolean).sort();
}

function valuePresence(record, fields) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) return { present: true, field, value: record[field] };
  }
  return { present: false, field: fields[0], value: undefined };
}

function contentValues(record = {}) {
  return {
    headline: valuePresence(record, ["headline", "title"]),
    body: valuePresence(record, ["body", "caption", "text", "draftCopy"]),
    hook: valuePresence(record, ["hook"]),
    cta: valuePresence(record, ["cta", "callToAction"]),
    hashtags: valuePresence(record, ["hashtags"])
  };
}

function requestedCreativeIds(record = {}) {
  return uniqueStrings(
    record.assetId,
    record.assetIds,
    record.mediaAssetId,
    record.mediaAssetIds,
    record.imageId,
    record.imageIds,
    record.brandAssetId,
    record.brandAssetIds,
    record.creativeReferenceId,
    record.creativeReferenceIds,
    record.sharedCreativeReferenceIds,
    record.finalExportKit?.assetId,
    record.finalExportKit?.assetIds,
    record.wilmaImageWorkflow?.assetId,
    record.wilmaImageWorkflow?.wilmaPoseReferenceId
  ).map(safeId).filter(Boolean).sort();
}

function requestedDisclaimerIds(record = {}) {
  return uniqueStrings(
    record.defaultDisclaimerId,
    record.defaultDisclaimerReference,
    record.disclaimerAssetId,
    record.disclaimerAssetIds,
    record.disclaimerId,
    record.disclaimerIds,
    record.sharedDisclaimerReferenceIds
  ).map(safeId).filter(Boolean).sort();
}

function guidanceValue(record = {}) {
  const source = record.formatGuidance || record.format_guidance || {};
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const limitations = uniqueStrings(source.limitations, source.channelLimitations, source.notes).map((item) => safeText(item, 240)).filter(Boolean);
  const projected = {
    characterGuidance: safeText(source.characterGuidance || source.character_guidance || source.characters, 240),
    hashtagGuidance: safeText(source.hashtagGuidance || source.hashtag_guidance || source.hashtags, 240),
    imageAspectGuidance: safeText(source.imageAspectGuidance || source.image_aspect_guidance || source.imageGuidance || source.aspectRatio, 240),
    linkGuidance: safeText(source.linkGuidance || source.link_guidance || source.links, 240),
    limitations,
    classification: source.reviewed === true && lower(source.enforcement || source.ruleType) === "hard" ? "stored_constraint" : "advisory"
  };
  return Object.values(projected).some((value) => Array.isArray(value) ? value.length : value && value !== "advisory") ? projected : null;
}

function postChannelGuidance(post = {}, channel = "") {
  const maps = [post.channelGuidance, post.channel_guidance, post.formatGuidanceByChannel, post.format_guidance_by_channel];
  for (const map of maps) {
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    const match = Object.entries(map).find(([key]) => normalizePostChannel(key) === channel);
    if (match) return guidanceValue({ formatGuidance: match[1] });
  }
  return null;
}

function variantCandidate(record, channel, collection, postId, mapKey = "") {
  const content = contentValues(record);
  const variantId = safeId(record.id || record.variantRecordId || record.variant_record_id);
  const lineageId = safeId(record.variantFamilyId || record.variant_family_id || record.variantKey || record.variant_key || record.variantId || record.variant_id);
  const versionValue = record.versionNumber ?? record.version_number ?? record.version;
  const version = Number.isInteger(Number(versionValue)) && Number(versionValue) >= 0 ? Number(versionValue) : null;
  const derivedId = safeId(`${postId}:${channel}${version === null ? "" : `:v${version}`}`);
  const versionedLineageId = lineageId && version !== null ? safeId(`${lineageId}:v${version}`) : lineageId;
  return {
    channel,
    content,
    explicitBlankFields: explicitBlankFields(record),
    creativeIds: requestedCreativeIds(record),
    disclaimerIds: requestedDisclaimerIds(record),
    formatGuidance: guidanceValue(record),
    sourceReference: sourceReference(collection, variantId || versionedLineageId || derivedId, "variant"),
    identity: {
      stableId: variantId || lineageId || (mapKey ? derivedId : ""),
      lineageId,
      version,
      isCurrent: record.isCurrent === true || record.is_current === true || record.current === true,
      mapKey: safeId(mapKey)
    }
  };
}

function visibleVariantCandidates(post = {}, role = "") {
  const postId = safeId(post.id);
  const container = rawVariantContainer(post);
  const output = [];
  if (container.kind === "array") {
    for (const record of list(container.value)) {
      if (!record || typeof record !== "object" || !recordVisibleToActor(record, role)) continue;
      const channel = normalizePostChannel(record.channel || record.platform);
      if (!channel) continue;
      output.push(variantCandidate(record, channel, container.collection, postId));
    }
  } else {
    for (const [key, value] of Object.entries(container.value).sort(([left], [right]) => left.localeCompare(right, "en-US"))) {
      if (!value || typeof value !== "object" || !recordVisibleToActor(value, role)) continue;
      const channel = normalizePostChannel(key);
      if (!channel) continue;
      output.push(variantCandidate(value, channel, container.collection, postId, key));
    }
  }
  return output.sort((left, right) => comparePostChannels(left.channel, right.channel)
    || stableSerialize(left.identity).localeCompare(stableSerialize(right.identity), "en-US")
    || stableSerialize(left.content).localeCompare(stableSerialize(right.content), "en-US"));
}

function explicitSelectedChannels(post = {}) {
  const fields = ["targetChannels", "target_channels", "selectedChannels", "selected_channels"];
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(post, field)) continue;
    return [...new Set(list(post[field]).map(normalizePostChannel).filter(Boolean))].sort(comparePostChannels);
  }
  return [...new Set([post.platform, post.channel].map(normalizePostChannel).filter(Boolean))].sort(comparePostChannels);
}

const POST_VIEW_COLLECTIONS = Object.freeze([
  "contentBank", "reports", "dataRoomItems", "evidencePackNotes", "approvals", "approvalQueue", "queueItems",
  "postImages", "brandAssets", "postingKits", "publishEvents", "activityEvents", "auditHistory", "generationBatches"
]);

function recordMatchesRequestedId(record, requestedIds) {
  if (!requestedIds.size) return false;
  return uniqueStrings(record.id, record.key, record.slug).some((id) => requestedIds.has(id));
}

function authorizedPostViewState(state, role, post, requestedIds) {
  const filteredPost = cloneValue(post);
  const candidates = visibleVariantCandidates(post, role);
  filteredPost.channelVariants = candidates.map((candidate) => ({
    channel: candidate.channel,
    id: candidate.identity.stableId || candidate.identity.lineageId,
    ...Object.fromEntries(Object.entries(candidate.content).filter(([, presence]) => presence.present).map(([field, presence]) => [field, cloneValue(presence.value)])),
    assetIds: [...candidate.creativeIds]
  }));
  delete filteredPost.channel_variants;
  delete filteredPost.variantsByChannel;
  const output = { posts: [filteredPost] };
  for (const collection of POST_VIEW_COLLECTIONS) {
    let records = stableVisibleRecords(state[collection], role);
    if (collection === "brandAssets") records = records.filter((record) => recordMatchesRequestedId(record, requestedIds));
    if (["postImages", "postingKits"].includes(collection)) {
      records = records.filter((record) => clean(record.postId || record.post_id) === clean(post.id) || recordMatchesRequestedId(record, requestedIds));
    }
    output[collection] = records.map(cloneValue);
  }
  output.settings = { sourceItems: stableVisibleRecords(state.settings?.sourceItems, role).map(cloneValue) };
  return output;
}

function assetRecords(state, role, postId, requestedIds) {
  const output = [];
  const append = (collection, records, options = {}) => {
    for (const record of stableVisibleRecords(records, role)) {
      const id = safeId(record.id || record.key || record.slug);
      if (!id) continue;
      if (options.linkedToPost && clean(record.postId || record.post_id) !== postId && !recordMatchesRequestedId(record, requestedIds)) continue;
      if (options.requestedOnly && !recordMatchesRequestedId(record, requestedIds)) continue;
      output.push({
        canonicalId: id,
        aliases: uniqueStrings(id, record.slug).map(safeId).filter(Boolean),
        sourceReference: sourceReference(collection, id, options.relationship || "asset"),
        sharedByPost: options.linkedToPost === true
      });
    }
  };
  append("postImages", state.postImages, { linkedToPost: true });
  append("brandAssets", state.brandAssets, { requestedOnly: true });
  append("postingKits", state.postingKits, { linkedToPost: true });
  append("library", state.library, { requestedOnly: true });
  append("settings.localAssets", state.settings?.localAssets, { requestedOnly: true });
  return output.sort((left, right) => left.sourceReference.sourceCollection.localeCompare(right.sourceReference.sourceCollection, "en-US")
    || left.canonicalId.localeCompare(right.canonicalId, "en-US"));
}

function sharedContent(post = {}) {
  return {
    values: contentValues(post),
    explicitBlankFields: explicitBlankFields(post),
    creativeIds: requestedCreativeIds(post),
    disclaimerIds: requestedDisclaimerIds(post)
  };
}

function unavailable(reason, postsExamined = 0) {
  return deepFreeze({
    authorized: false,
    reason,
    postView: null,
    shared: null,
    selectedChannels: [],
    variantCandidates: [],
    assetRecords: [],
    postGuidance: [],
    diagnostics: { postsExamined, variantsExamined: 0, excludedRecords: 0 }
  });
}

export function collectPostChannelVariantSources(state = {}, actor = {}, postId = "") {
  const role = actorRole(actor);
  if (!role) return unavailable("actor_cannot_read");
  const requestedId = safeId(postId);
  if (!requestedId) return unavailable("post_not_found", stableVisibleRecords(state.posts, role).length);
  const visiblePosts = stableVisibleRecords(state.posts, role);
  const candidates = visiblePosts.filter((post) => clean(post.id) === requestedId);
  if (!candidates.length) return unavailable("post_not_found", visiblePosts.length);
  const post = candidates[0];
  const variantCandidates = visibleVariantCandidates(post, role);
  const shared = sharedContent(post);
  const requestedIds = new Set([
    ...shared.creativeIds,
    ...shared.disclaimerIds,
    ...variantCandidates.flatMap((candidate) => [...candidate.creativeIds, ...candidate.disclaimerIds])
  ]);
  const postView = buildPostView(authorizedPostViewState(state, role, post, requestedIds), requestedId);
  if (!postView) return unavailable("post_not_found", visiblePosts.length);
  const guidanceChannels = [...new Set([...explicitSelectedChannels(post), ...variantCandidates.map((candidate) => candidate.channel)])].sort(comparePostChannels);
  return deepFreeze({
    authorized: true,
    reason: null,
    postView,
    shared,
    selectedChannels: explicitSelectedChannels(post),
    variantCandidates,
    assetRecords: assetRecords(state, role, requestedId, requestedIds),
    postGuidance: guidanceChannels.map((channel) => ({ channel, guidance: postChannelGuidance(post, channel) })).filter((item) => item.guidance),
    diagnostics: {
      postsExamined: visiblePosts.length,
      variantsExamined: variantCandidates.length,
      excludedRecords: Math.max(0, visiblePosts.length - candidates.length)
    }
  });
}
