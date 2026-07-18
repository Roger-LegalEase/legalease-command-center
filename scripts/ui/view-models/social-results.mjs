import { buildExactObjectLink } from "../route-compatibility.mjs";
import {
  SOCIAL_RESULTS_METRIC_FIELDS,
  collectSocialResultsSources,
  socialResultsSafeText
} from "./social-results-sources.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const CHANNEL_ORDER = Object.freeze(["linkedin", "instagram", "facebook", "x", "threads"]);
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 40;
const CURSOR_ORDER_VERSION = 2;
const CURSOR_PREFIX = "SRC_";
const CURSOR_ALPHABET = "ABCDEFGHIJKLMNOP";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeKey(value = "") {
  const key = lower(value).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");
  return key.slice(0, 80) || null;
}

function safeLabel(value = "", fallback = "Unknown") {
  const text = socialResultsSafeText(value, 100);
  if (!text) return fallback;
  return text.replaceAll(/[_-]+/g, " ").replaceAll(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-US"));
}

function safeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function uniqueReferences(references = []) {
  const seen = new Set();
  return list(references).filter(Boolean).map((reference) => ({ ...reference })).sort((left, right) =>
    clean(left.sourceCollection || left.collection).localeCompare(clean(right.sourceCollection || right.collection), "en-US")
    || clean(left.sourceId).localeCompare(clean(right.sourceId), "en-US")
    || clean(left.relationship).localeCompare(clean(right.relationship), "en-US")
  ).filter((reference) => {
    const key = `${clean(reference.sourceCollection || reference.collection)}:${clean(reference.sourceId)}:${clean(reference.relationship)}`;
    if (!clean(reference.sourceId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function metricSource(post = {}) {
  return post.performance && typeof post.performance === "object" ? post.performance : null;
}

function metricProjection(post, publicationCount) {
  const empty = Object.fromEntries(SOCIAL_RESULTS_METRIC_FIELDS.map((field) => [field, null]));
  const unavailable = [...SOCIAL_RESULTS_METRIC_FIELDS, "engagementRate"];
  if (publicationCount !== 1) return {
    metrics: { ...empty, engagementRate: null, snapshotAt: null, sourceReference: null },
    availability: { key: "unavailable", reason: publicationCount > 1 ? "channel_metrics_incompatible" : "metrics_unavailable", availableFields: [], unavailableFields: unavailable }
  };
  const stored = metricSource(post);
  if (!stored) return {
    metrics: { ...empty, engagementRate: null, snapshotAt: null, sourceReference: null },
    availability: { key: "unavailable", reason: "metrics_unavailable", availableFields: [], unavailableFields: unavailable }
  };

  const metrics = {};
  const availableFields = [];
  for (const field of SOCIAL_RESULTS_METRIC_FIELDS) {
    metrics[field] = safeNumber(stored[field]);
    if (metrics[field] !== null) availableFields.push(field);
  }
  const explicitRate = safeNumber(stored.engagementRate ?? stored.engagement_rate);
  const numerator = safeNumber(stored.engagement ?? stored.engagementTotal ?? stored.engagement_total);
  const denominator = safeNumber(stored.impressions);
  metrics.engagementRate = explicitRate;
  let rateBasis = explicitRate !== null ? "stored" : null;
  if (metrics.engagementRate === null && numerator !== null && denominator !== null && denominator > 0) {
    metrics.engagementRate = numerator / denominator;
    rateBasis = "reviewed_numerator_and_denominator";
  }
  if (metrics.engagementRate !== null) availableFields.push("engagementRate");
  const snapshotAt = clean(post.performanceUpdatedAt || post.performance_updated_at || stored.snapshotAt || stored.snapshot_at);
  metrics.snapshotAt = snapshotAt && Number.isFinite(Date.parse(snapshotAt)) ? snapshotAt : null;
  metrics.sourceReference = { collection: "posts", sourceId: clean(post.id), relationship: "performance" };
  metrics.engagementRateBasis = rateBasis;
  const unavailableFields = unavailable.filter((field) => !availableFields.includes(field));
  return {
    metrics,
    availability: {
      key: availableFields.length === unavailable.length ? "available" : availableFields.length ? "partial" : "unavailable",
      reason: availableFields.length ? (unavailableFields.length ? "some_metrics_unavailable" : null) : "metrics_unavailable",
      availableFields,
      unavailableFields
    }
  };
}

function campaignProjection(context) {
  if (!context.campaignId) return { key: null, label: null, href: null, availability: "unavailable", sourceReference: null };
  if (!context.campaign) return { key: null, label: null, href: null, availability: "unavailable", sourceReference: null };
  return {
    key: clean(context.campaignId),
    label: socialResultsSafeText(context.campaign.name || context.campaign.title, 120) || "Campaign",
    href: buildExactObjectLink({ objectType: "Campaign", sourceKind: "campaign", sourceId: context.campaignId })?.target || null,
    availability: "available",
    sourceReference: { collection: "campaigns", sourceId: context.campaignId, relationship: "campaign" }
  };
}

function templateProjection(context, catalog) {
  if (!context.templateId) return { id: null, name: null, category: null, availability: "unavailable", sourceReference: null };
  const template = list(catalog?.templates).find((candidate) => clean(candidate.id) === context.templateId);
  if (!template) return { id: null, name: null, category: null, availability: "unavailable", sourceReference: null };
  return {
    id: template.id,
    name: template.name,
    category: template.category ? { ...template.category } : null,
    availability: template.availability?.key || "unavailable",
    sourceReference: template.sourceReference ? { ...template.sourceReference } : null
  };
}

function themeProjection(post = {}) {
  const stored = socialResultsSafeText(post.themeId || post.theme || post.contentTheme || post.content_theme, 100);
  if (!stored) return { key: null, label: null, availability: "unavailable", sourceReference: null };
  return {
    key: safeKey(stored),
    label: safeLabel(stored),
    availability: "available",
    sourceReference: { collection: "posts", sourceId: clean(post.id), relationship: "theme" }
  };
}

function topicProjection(post = {}) {
  const stored = socialResultsSafeText(post.topic || post.contentBucket || post.content_bucket, 120);
  return stored ? { key: safeKey(stored), label: stored, availability: "available" } : { key: null, label: null, availability: "unavailable" };
}

function proofProjection(postView) {
  const references = list(postView.sourceReferences).filter((reference) => reference.relationship === "proof");
  return {
    linked: references.length > 0,
    references: uniqueReferences(references),
    markAsProof: {
      available: false,
      executable: false,
      reason: "proof_operation_unavailable",
      requiredCapability: null
    }
  };
}

function reusableContent(postView) {
  return Boolean(clean(postView.content?.body || postView.content?.hook || postView.title));
}

function reuseProjection(context, source, ambiguous) {
  let reason = "reuse_available";
  let available = true;
  if (!source.reusePolicy?.available) {
    available = false;
    reason = "reuse_policy_unavailable";
  } else if (!source.reusePolicy.allowed) {
    available = false;
    reason = "actor_cannot_reuse";
  } else if (ambiguous) {
    available = false;
    reason = "publication_source_ambiguous";
  } else if (!reusableContent(context.postView)) {
    available = false;
    reason = "reusable_content_unavailable";
  }
  return {
    available,
    executable: false,
    reason,
    requiredCapability: source.reusePolicy?.requiredCapability || "manage_content_drafts"
  };
}

function channelRank(channel) {
  const rank = CHANNEL_ORDER.indexOf(channel);
  return rank === -1 ? CHANNEL_ORDER.length : rank;
}

function itemSort(left, right) {
  return channelRank(left.channel) - channelRank(right.channel)
    || (channelRank(left.channel) === CHANNEL_ORDER.length ? left.channel.localeCompare(right.channel, "en-US") : 0)
    || clean(right.publicationTime).localeCompare(clean(left.publicationTime), "en-US")
    || left.postId.localeCompare(right.postId, "en-US");
}

function projectItems(source) {
  const output = [];
  for (const context of source.posts) {
    const publicationCount = context.publications.length;
    const metrics = metricProjection(context.post, publicationCount);
    const campaign = campaignProjection(context);
    const template = templateProjection(context, source.catalog);
    const theme = themeProjection(context.post);
    const topic = topicProjection(context.post);
    const proof = proofProjection(context.postView);
    const byChannel = new Map();
    for (const publication of context.publications) {
      const existing = byChannel.get(publication.channel) || [];
      existing.push(publication);
      byChannel.set(publication.channel, existing);
    }
    for (const [channel, publications] of byChannel) {
      const ambiguous = publications.length !== 1;
      if (ambiguous) continue;
      const publication = publications[0];
      const sourceReferences = uniqueReferences([
        { ...publication.evidenceReference },
        ...list(context.postView.sourceReferences),
        campaign.sourceReference,
        template.sourceReference,
        theme.sourceReference,
        metrics.metrics.sourceReference
      ]);
      output.push({
        postId: context.postView.id,
        href: context.postView.href,
        title: context.postView.title,
        channel,
        channelLabel: publication.label,
        publicationTime: publication.publishedAt,
        publishedUrl: publication.publishedUrl,
        topic: { ...topic },
        campaign,
        template,
        theme,
        metrics: { ...metrics.metrics },
        metricAvailability: { ...metrics.availability, availableFields: [...metrics.availability.availableFields], unavailableFields: [...metrics.availability.unavailableFields] },
        reuse: reuseProjection(context, source, ambiguous),
        proof,
        sourceReferences
      });
    }
  }
  return output.sort(itemSort);
}

function normalizedQuery(query = {}) {
  const integer = Number.parseInt(query.limit, 10);
  return {
    channel: safeKey(query.channel),
    topic: safeKey(query.topic),
    campaign: safeKey(query.campaign),
    template: safeKey(query.template),
    theme: safeKey(query.theme),
    metrics: ["available", "unavailable"].includes(lower(query.metrics)) ? lower(query.metrics) : null,
    proof: ["linked", "unavailable"].includes(lower(query.proof)) ? lower(query.proof) : null,
    reuse: ["available", "unavailable"].includes(lower(query.reuse)) ? lower(query.reuse) : null,
    limit: Number.isInteger(integer) ? Math.max(1, Math.min(MAX_LIMIT, integer)) : DEFAULT_LIMIT,
    cursor: clean(query.cursor) || null
  };
}

function hashText(text, seed = 2166136261) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  return hash >>> 0;
}

function queryFingerprint(query) {
  const filters = [query.channel, query.topic, query.campaign, query.template, query.theme, query.metrics, query.proof, query.reuse]
    .map((value) => value || "").join("|");
  return hashText(`social-results-order-v${CURSOR_ORDER_VERSION}|${filters}`);
}

function writeUint32(bytes, index, value) {
  bytes[index] = (value >>> 24) & 255;
  bytes[index + 1] = (value >>> 16) & 255;
  bytes[index + 2] = (value >>> 8) & 255;
  bytes[index + 3] = value & 255;
}

function readUint32(bytes, index) {
  return ((bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3]) >>> 0;
}

function opaqueBytes(bytes) {
  let output = "";
  for (const byte of bytes) output += CURSOR_ALPHABET[byte >>> 4] + CURSOR_ALPHABET[byte & 15];
  return output;
}

function parseOpaqueBytes(value) {
  if (!value || value.length % 2) return null;
  const bytes = [];
  for (let index = 0; index < value.length; index += 2) {
    const high = CURSOR_ALPHABET.indexOf(value[index]);
    const lowNibble = CURSOR_ALPHABET.indexOf(value[index + 1]);
    if (high < 0 || lowNibble < 0) return null;
    bytes.push((high << 4) | lowNibble);
  }
  return bytes;
}

function cursorChecksum(bytes) {
  return hashText(bytes.map((byte) => String.fromCharCode(byte)).join(""), 0x9e3779b9);
}

function cursorMask(fingerprint) {
  return hashText(`cursor-mask|${CURSOR_ORDER_VERSION}|${fingerprint}`, 0x85ebca6b);
}

function encodeCursor(offset, query) {
  const fingerprint = queryFingerprint(query);
  const bytes = Array(13).fill(0);
  bytes[0] = CURSOR_ORDER_VERSION;
  writeUint32(bytes, 1, fingerprint);
  writeUint32(bytes, 5, (offset ^ cursorMask(fingerprint)) >>> 0);
  writeUint32(bytes, 9, cursorChecksum(bytes.slice(0, 9)));
  return `${CURSOR_PREFIX}${opaqueBytes(bytes)}`;
}

function decodeCursor(cursor, query) {
  const value = clean(cursor);
  if (!value.startsWith(CURSOR_PREFIX)) return { valid: false, offset: 0 };
  const bytes = parseOpaqueBytes(value.slice(CURSOR_PREFIX.length));
  if (!bytes || bytes.length !== 13 || bytes[0] !== CURSOR_ORDER_VERSION) return { valid: false, offset: 0 };
  const fingerprint = readUint32(bytes, 1);
  if (fingerprint !== queryFingerprint(query) || readUint32(bytes, 9) !== cursorChecksum(bytes.slice(0, 9))) {
    return { valid: false, offset: 0 };
  }
  return { valid: true, offset: (readUint32(bytes, 5) ^ cursorMask(fingerprint)) >>> 0 };
}

function itemMatches(item, query) {
  return (!query.channel || item.channel === query.channel)
    && (!query.topic || item.topic.key === query.topic)
    && (!query.campaign || safeKey(item.campaign.key) === query.campaign)
    && (!query.template || safeKey(item.template.id) === query.template)
    && (!query.theme || item.theme.key === query.theme)
    && (!query.metrics || (query.metrics === "available" ? item.metricAvailability.availableFields.length > 0 : item.metricAvailability.availableFields.length === 0))
    && (!query.proof || (query.proof === "linked" ? item.proof.linked : !item.proof.linked))
    && (!query.reuse || (query.reuse === "available" ? item.reuse.available : !item.reuse.available));
}

function optionList(items, getter) {
  const options = new Map();
  for (const item of items) {
    const value = getter(item);
    if (!value?.key) continue;
    const current = options.get(value.key) || { key: value.key, label: value.label || safeLabel(value.key), count: 0 };
    current.count += 1;
    options.set(value.key, current);
  }
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label, "en-US") || left.key.localeCompare(right.key, "en-US"));
}

function filters(items) {
  return {
    channels: optionList(items, (item) => ({ key: item.channel, label: item.channelLabel })),
    topics: optionList(items, (item) => item.topic),
    campaigns: optionList(items, (item) => ({ key: item.campaign.key, label: item.campaign.label })),
    templates: optionList(items, (item) => ({ key: item.template.id, label: item.template.name })),
    themes: optionList(items, (item) => item.theme)
  };
}

function summaries(items) {
  const channels = new Set(items.map((item) => item.channel));
  const templates = new Set(items.map((item) => item.template.id).filter(Boolean));
  const themes = new Set(items.map((item) => item.theme.key).filter(Boolean));
  const metricsAvailable = items.filter((item) => item.metricAvailability.availableFields.length).length;
  return {
    publishedResultCount: items.length,
    channelsRepresented: channels.size,
    metricsAvailableCount: metricsAvailable,
    metricsUnavailableCount: items.length - metricsAvailable,
    templatesRepresented: templates.size,
    themesRepresented: themes.size,
    reusableResultCount: items.filter((item) => item.reuse.available).length,
    proofLinkedCount: items.filter((item) => item.proof.linked).length,
    ranking: { available: false, reason: "comparison_set_not_guaranteed_comparable", metric: null, items: [] }
  };
}

function unavailableResult(generatedAt, reason) {
  return deepFreeze({
    generatedAt,
    items: [],
    summaries: null,
    filters: { channels: [], topics: [], campaigns: [], templates: [], themes: [] },
    activeFilters: {},
    pagination: { limit: DEFAULT_LIMIT, returned: 0, total: null, nextCursor: null, cursorValid: false },
    sourceAvailability: { key: "unavailable", reason, counts: null },
    capabilities: {
      duplicatesPosts: false, writesProofFiles: false, refreshesAnalytics: false, callsProviders: false,
      publishes: false, retries: false, approves: false, schedules: false, writesStorage: false, mutatesSources: false
    }
  });
}

export function buildSocialResultsView(state = {}, actor = {}, now = "", query = {}) {
  const source = collectSocialResultsSources(state, actor, now);
  if (!source.authorized) return unavailableResult(source.generatedAt, source.reason);
  const active = normalizedQuery(query);
  const allItems = projectItems(source);
  const matching = allItems.filter((item) => itemMatches(item, active));
  const decodedCursor = active.cursor ? decodeCursor(active.cursor, active) : { valid: true, offset: 0 };
  const offset = decodedCursor.valid ? decodedCursor.offset : 0;
  const pageItems = matching.slice(offset, offset + active.limit);
  const nextOffset = offset + pageItems.length;
  const nextCursor = nextOffset < matching.length ? encodeCursor(nextOffset, active) : null;
  const unavailableMetrics = allItems.reduce((total, item) => total + item.metricAvailability.unavailableFields.length, 0);
  return deepFreeze({
    generatedAt: source.generatedAt,
    items: pageItems,
    summaries: summaries(matching),
    filters: filters(allItems),
    activeFilters: {
      channel: active.channel, topic: active.topic, campaign: active.campaign, template: active.template,
      theme: active.theme, metrics: active.metrics, proof: active.proof, reuse: active.reuse
    },
    pagination: {
      limit: active.limit,
      returned: pageItems.length,
      total: matching.length,
      nextCursor,
      cursorValid: decodedCursor.valid
    },
    sourceAvailability: {
      key: allItems.length ? "available" : "partial",
      reason: allItems.length ? null : "published_results_unavailable",
      sources: { ...source.sourcePresence },
      counts: {
        candidatesExamined: source.diagnostics.candidatesExamined,
        postsExamined: source.diagnostics.postsExamined,
        publishedChannelResults: allItems.length,
        excludedChannels: { ...source.diagnostics.excludedChannels },
        metricValuesProjected: allItems.reduce((total, item) => total + item.metricAvailability.availableFields.length, 0),
        unavailableMetrics,
        reusableResults: allItems.filter((item) => item.reuse.available).length,
        proofLinkedResults: allItems.filter((item) => item.proof.linked).length
      }
    },
    capabilities: {
      duplicatesPosts: false, writesProofFiles: false, refreshesAnalytics: false, callsProviders: false,
      publishes: false, retries: false, approves: false, schedules: false, writesStorage: false, mutatesSources: false
    }
  });
}
