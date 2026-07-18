import { recordVisibleToActor } from "../../global-search-service.mjs";
import {
  canPerformEndpoint,
  requiredCapabilitiesForEndpoint,
  roleHasCapability,
  roles
} from "../../roles.mjs";
import { buildPostPublishingControls } from "./post-publishing-controls.mjs";
import {
  currentPublishingApprovalRevision,
  normalizePublishingControlChannel
} from "./post-publishing-control-sources.mjs";
import { buildPostReadiness } from "./post-readiness.mjs";
import { buildPostView } from "./post-view.mjs";
import { buildSocialCreativeCatalog } from "./social-creative-catalog.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

const VISIBLE_COLLECTIONS = Object.freeze([
  "posts", "publishEvents", "publishClaims", "campaigns", "generationProfiles", "brandAssets",
  "brandRules", "assetBundles", "library", "postingKits", "reports", "dataRoomItems",
  "evidencePackNotes", "approvals", "approvalQueue", "queueItems", "postImages", "postVersions",
  "copyVersions", "reviewFeedback", "reviewFeedbackRecords", "postReviewFeedback", "activityEvents",
  "auditHistory", "generationBatches", "socialAccounts", "scheduleConflicts", "contentBank"
]);

export const SOCIAL_RESULTS_SOURCE_MATRIX = deepFreeze([
  { source: "CCX-300 PostView", truth: "Canonical Post identity, exact links, shared content, and exact proof/File relationships" },
  { source: "CCX-303A Social creative catalog", truth: "Authorized exact template identity and category truth" },
  { source: "CCX-305 Social readiness", truth: "Read-only reviewed content, creative, and source availability" },
  { source: "CCX-308A publishing controls", truth: "Current-revision publication precedence and safe published URLs" },
  { source: "publishEvents", truth: "Explicit per-channel successful publication results" },
  { source: "publishClaims", truth: "Current approval-revision durable publication outcomes" },
  { source: "posts.publishAttempts", truth: "Stable legacy per-channel publication outcomes" },
  { source: "posts.performance", truth: "Explicit stored Post performance values and performanceUpdatedAt snapshot time" },
  { source: "campaigns", truth: "Exact stored Campaign relationships" },
  { source: "reports / dataRoomItems / evidencePackNotes", truth: "Exact PostView proof and File relationships" },
  { source: "existing Create Post policy", truth: "Read-only reuse eligibility through manage_content_drafts" }
]);

export const SOCIAL_RESULTS_METRIC_FIELDS = deepFreeze([
  "impressions", "reach", "likes", "reactions", "comments", "shares", "reposts", "clicks", "saves", "videoViews"
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

function safeId(value = "") {
  const id = clean(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? id : "";
}

function safeText(value = "", limit = 240) {
  const text = clean(value).replaceAll(/\s+/g, " ");
  if (!text || /[\u0000-\u001f\u007f<>`]/u.test(text)) return null;
  if (/\b(?:access|refresh|storage|service.?role|oauth)[_ -]?(?:token|key)|\bcredential|\bprovider payload|\bsigned url|\bsecret\b/i.test(text)) return null;
  if (/(?:^|\s)(?:\/(?:private|home|users|var|tmp)\/|[a-z]:\\)/i.test(text)) return null;
  return text.slice(0, limit);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function stableRecords(records = []) {
  return [...list(records)].sort((left, right) =>
    safeId(left?.id || left?.key || left?.slug).localeCompare(safeId(right?.id || right?.key || right?.slug), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
}

function actorRole(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal") ? role : "";
}

function visibleRecords(records, role) {
  return stableRecords(records).filter((record) => recordVisibleToActor(record, role)).map(cloneValue);
}

function visiblePost(record, role) {
  const output = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (key === "publishAttempts" || key === "publish_attempts") continue;
    output[key] = cloneValue(value);
  }
  if (Array.isArray(record?.publishAttempts)) output.publishAttempts = visibleRecords(record.publishAttempts, role);
  if (Array.isArray(record?.publish_attempts)) output.publish_attempts = visibleRecords(record.publish_attempts, role);
  return output;
}

function visibleState(state, role) {
  const output = {};
  for (const [key, value] of Object.entries(state || {})) {
    if (VISIBLE_COLLECTIONS.includes(key) || key === "settings") continue;
    output[key] = cloneValue(value);
  }
  for (const collection of VISIBLE_COLLECTIONS) {
    output[collection] = collection === "posts"
      ? stableRecords(state.posts).filter((record) => recordVisibleToActor(record, role)).map((record) => visiblePost(record, role))
      : visibleRecords(state[collection], role);
  }
  const settings = state.settings && typeof state.settings === "object" ? state.settings : {};
  output.settings = Object.fromEntries(Object.entries(settings)
    .filter(([key]) => key !== "sourceItems" && key !== "localAssets")
    .map(([key, value]) => [key, cloneValue(value)]));
  output.settings.sourceItems = visibleRecords(settings.sourceItems, role);
  output.settings.localAssets = visibleRecords(settings.localAssets, role);
  return output;
}

function relatedPostId(record = {}) {
  return safeId(record.postId || record.post_id || record.relatedPostId || record.related_post_id || record.relatedObjectId);
}

function recordId(record = {}) {
  return safeId(record.id || record.key || record.slug);
}

function sourceReference(collection, sourceId, relationship) {
  const id = safeId(sourceId);
  return id ? { collection: clean(collection), sourceId: id, relationship: clean(relationship) || null } : null;
}

function timestamp(record = {}) {
  const value = clean(
    record.publishedAt || record.published_at || record.occurredAt || record.occurred_at
    || record.createdAt || record.created_at || record.timestamp || record.at
  );
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

function recordRevision(record = {}) {
  return clean(record.approvalRevision || record.approval_revision);
}

function recordChannel(record = {}) {
  return normalizePublishingControlChannel(record.channel || record.platform);
}

function recordLifecycle(record = {}) {
  const event = lower(record.eventType || record.event_type || record.action || record.result);
  if (["published", "post_published", "publish_succeeded", "publication_succeeded"].includes(event)) return "published";
  const status = lower(record.statusAfter || record.status_after || record.status || event);
  if (["posted", "published", "succeeded", "success", "complete", "completed"].includes(status)) return "published";
  if (["publish_claimed", "publishing", "pending", "in_progress", "in-progress", "started", "processing"].includes(status)) return "publishing";
  if (["failed_retryable", "retry_ready", "failed", "error"].includes(status)) return "failed";
  if (status === "failed_terminal") return "failed_terminal";
  if (status === "reconciliation_required") return "reconciliation_required";
  return status || "unavailable";
}

function recordLineage(record = {}) {
  return safeId(record.lineageId || record.lineage_id || record.attemptLineageId || record.claimLineageId || record.idempotencyLineage);
}

function recordVersion(record = {}) {
  const raw = record.versionNumber ?? record.version_number ?? record.attemptVersion ?? record.claimVersion ?? record.version;
  const number = Number(raw);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function eventUrl(record = {}) {
  return clean(record.publishedUrl || record.published_url || record.externalPostUrl || record.external_post_url || record.resultUrl);
}

function evidenceFact(collection, record, postId, channel) {
  return {
    collection,
    sourceId: recordId(record),
    postId,
    channel,
    approvalRevision: recordRevision(record) || null,
    lifecycle: recordLifecycle(record),
    lineageId: recordLineage(record) || null,
    version: recordVersion(record),
    publishedAt: timestamp(record),
    publishedUrl: eventUrl(record) || null
  };
}

function evidenceCandidates(state, post, collection) {
  if (collection === "publishEvents" || collection === "publishClaims") return list(state[collection]);
  if (collection === "posts.publishAttempts") {
    return [...list(post.publishAttempts), ...list(post.publish_attempts)];
  }
  return [];
}

function recordMatchesPost(record, postId, nested) {
  const related = relatedPostId(record);
  return nested ? !related || related === postId : related === postId;
}

function sameChannelRevisionedRecords(state, post, postId, channel) {
  return [
    ...list(state.publishEvents),
    ...list(state.publishClaims),
    ...list(post.publishAttempts),
    ...list(post.publish_attempts)
  ].filter((record) => recordMatchesPost(record, postId, list(post.publishAttempts).includes(record) || list(post.publish_attempts).includes(record))
    && recordChannel(record) === channel && Boolean(recordRevision(record)));
}

function selectStableAttemptVersion(candidates) {
  if (candidates.length < 2) return { candidates, ambiguous: false };
  const versions = candidates.map(recordVersion);
  if (versions.every((version) => version === null)) return { candidates, ambiguous: false };
  const lineages = [...new Set(candidates.map(recordLineage).filter(Boolean))];
  if (versions.some((version) => version === null) || lineages.length !== 1) return { candidates: [], ambiguous: true };
  const highest = Math.max(...versions);
  return { candidates: candidates.filter((record) => recordVersion(record) === highest), ambiguous: false };
}

function resolveEvidenceReference(state, post, channel, revision, reference) {
  const collection = clean(reference?.collection || reference?.sourceCollection);
  const sourceId = safeId(reference?.sourceId);
  const postId = safeId(post.id);
  if (!sourceId || !["publishEvents", "publishClaims", "posts.publishAttempts"].includes(collection)) {
    return { state: "unavailable", reason: "evidence_reference_unavailable" };
  }
  const nested = collection === "posts.publishAttempts";
  const exact = evidenceCandidates(state, post, collection).filter((record) =>
    recordId(record) === sourceId
    && recordMatchesPost(record, postId, nested)
    && recordChannel(record) === channel
  );
  if (!exact.length) return { state: "unavailable", reason: "evidence_reference_unavailable" };

  const current = revision.available ? exact.filter((record) => recordRevision(record) === revision.value) : [];
  const unrevisioned = exact.filter((record) => !recordRevision(record));
  let selected;
  if (current.length) {
    selected = current;
  } else if (revision.available) {
    const hasRevisionedCompetitor = sameChannelRevisionedRecords(state, post, postId, channel).length > 0;
    if (!unrevisioned.length) return { state: "historical", reason: "historical_revision" };
    if (hasRevisionedCompetitor) return { state: "unavailable", reason: "unrevisioned_evidence_competitor" };
    selected = unrevisioned;
  } else {
    const revisions = [...new Set(exact.map(recordRevision).filter(Boolean))];
    if (revisions.length > 1 || (revisions.length && unrevisioned.length)) {
      return { state: "ambiguous", reason: "ambiguous_evidence" };
    }
    selected = revisions.length ? exact.filter((record) => recordRevision(record) === revisions[0]) : unrevisioned;
  }

  if (nested) {
    const versioned = selectStableAttemptVersion(selected);
    if (versioned.ambiguous) return { state: "ambiguous", reason: "ambiguous_evidence" };
    selected = versioned.candidates;
  }
  const facts = new Map(selected.map((record) => {
    const fact = evidenceFact(collection, record, postId, channel);
    return [stableSerialize(fact), fact];
  }));
  if (facts.size !== 1) return { state: "ambiguous", reason: "ambiguous_evidence" };
  const fact = [...facts.values()][0];
  if (fact.lifecycle !== "published") return { state: "not_success", reason: "evidence_not_successful" };
  return {
    state: "resolved",
    reason: null,
    publishedAt: fact.publishedAt,
    evidenceReference: sourceReference(collection, sourceId, clean(reference.relationship) || "publication_result"),
    approvalRevision: revision.available ? revision.value : fact.approvalRevision
  };
}

function currentRevision(post, controls) {
  return currentPublishingApprovalRevision(post, { approval: controls.approval || {} });
}

function publicationEvidence(state, post, controls) {
  const output = [];
  const excluded = {};
  const revision = currentRevision(post, controls);
  for (const channel of controls.channels || []) {
    const publicationKey = clean(channel.publicationState?.key) || "unavailable";
    if (publicationKey !== "published") {
      excluded[publicationKey] = (excluded[publicationKey] || 0) + 1;
      continue;
    }
    const resultReference = list(channel.sourceReferences).find((reference) => reference.relationship === "publication_result") || null;
    const attemptReference = channel.attemptReference || list(channel.sourceReferences).find((reference) => reference.relationship === "publication_attempt") || null;
    const resolutions = [resultReference, attemptReference].filter(Boolean).map((reference) =>
      resolveEvidenceReference(state, post, normalizePublishingControlChannel(channel.channel), revision, reference));
    const unsafe = resolutions.find((resolution) => ["ambiguous", "not_success"].includes(resolution.state));
    const resolved = unsafe ? null : resolutions.find((resolution) => resolution.state === "resolved");
    if (!resolved) {
      const reason = unsafe?.reason || resolutions.find((resolution) => resolution.reason)?.reason || "status_only";
      excluded[reason] = (excluded[reason] || 0) + 1;
      continue;
    }
    output.push({
      channel: normalizePublishingControlChannel(channel.channel),
      label: safeText(channel.label, 80) || clean(channel.channel),
      publishedAt: resolved.publishedAt,
      publishedUrl: clean(channel.publishedUrl) || null,
      evidenceReference: { ...resolved.evidenceReference },
      approvalRevision: resolved.approvalRevision || null
    });
  }
  return { output, excluded };
}

function selectedTemplateId(post = {}) {
  return safeId(
    post.selectedTemplateId || post.creativeTemplateId || post.generationProfileId || post.templateId || post.templateKey
    || post.finalExportKit?.templateId || post.assetBundleUsed?.templateId || post.assetBundleUsed?.generationProfileId
  );
}

function campaignId(post = {}) {
  return safeId(post.campaignId || post.campaign_id || post.relatedCampaignId || post.related_campaign_id);
}

function campaignRecord(state, post) {
  const id = campaignId(post);
  const record = id ? list(state.campaigns).find((candidate) => recordId(candidate) === id) || null : null;
  return record ? {
    id,
    name: safeText(record.name || record.title, 120),
    title: safeText(record.title || record.name, 120)
  } : null;
}

function compactPostFacts(post = {}) {
  return {
    id: safeId(post.id),
    topic: safeText(post.topic, 120),
    contentBucket: safeText(post.contentBucket || post.content_bucket, 120),
    themeId: safeText(post.themeId, 100),
    theme: safeText(post.theme, 100),
    contentTheme: safeText(post.contentTheme || post.content_theme, 100),
    performance: post.performance && typeof post.performance === "object" ? cloneValue(post.performance) : null,
    performanceUpdatedAt: clean(post.performanceUpdatedAt || post.performance_updated_at) || null
  };
}

function reusePolicy(role) {
  const path = "/api/ui/create/post";
  const required = requiredCapabilitiesForEndpoint("POST", path);
  const decision = canPerformEndpoint(role, "POST", path);
  const available = Array.isArray(required) && required.length === 1 && required[0] === "manage_content_drafts"
    && Array.isArray(decision.requiredCapabilities) && decision.requiredCapabilities.length === 1
    && decision.requiredCapabilities[0] === "manage_content_drafts";
  return {
    available,
    allowed: available && decision.ok === true,
    requiredCapability: "manage_content_drafts"
  };
}

function countVisibleCandidates(state) {
  return VISIBLE_COLLECTIONS.reduce((total, collection) => total + list(state[collection]).length, 0)
    + list(state.settings?.sourceItems).length + list(state.settings?.localAssets).length
    + list(state.posts).reduce((total, post) => total + list(post.publishAttempts).length + list(post.publish_attempts).length, 0);
}

function unavailable(generatedAt, reason) {
  return deepFreeze({
    authorized: false,
    generatedAt,
    reason,
    role: null,
    catalog: null,
    reusePolicy: null,
    posts: [],
    sourcePresence: {},
    diagnostics: { candidatesExamined: 0, postsExamined: 0, excludedChannels: {} }
  });
}

export function collectSocialResultsSources(state = {}, actor = {}, now = "") {
  const generatedAt = clean(now);
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) return unavailable(null, "invalid_clock");
  const role = actorRole(actor);
  if (!role) return unavailable(generatedAt, "actor_cannot_read");

  const authorizedState = visibleState(state, role);
  const catalog = buildSocialCreativeCatalog(authorizedState, actor, { generatedAt });
  const policy = reusePolicy(role);
  const contexts = [];
  const excludedChannels = {};
  for (const post of authorizedState.posts) {
    const id = safeId(post.id);
    if (!id) continue;
    const postView = buildPostView(authorizedState, post);
    if (!postView?.id || !postView.href) continue;
    const controls = buildPostPublishingControls(authorizedState, actor, id, generatedAt);
    const readiness = buildPostReadiness(authorizedState, actor, id, generatedAt);
    if (!controls.postId || !readiness.available) continue;
    const evidence = publicationEvidence(authorizedState, post, controls);
    for (const [reason, count] of Object.entries(evidence.excluded)) excludedChannels[reason] = (excludedChannels[reason] || 0) + count;
    contexts.push({
      post: compactPostFacts(post),
      postView,
      publications: evidence.output,
      campaign: campaignRecord(authorizedState, post),
      campaignId: campaignId(post),
      templateId: selectedTemplateId(post)
    });
  }

  return deepFreeze({
    authorized: true,
    generatedAt,
    reason: null,
    role,
    catalog,
    reusePolicy: policy,
    posts: contexts,
    sourcePresence: {
      posts: Array.isArray(state.posts),
      publishEvents: Array.isArray(state.publishEvents),
      publishClaims: Array.isArray(state.publishClaims),
      campaigns: Array.isArray(state.campaigns),
      performance: authorizedState.posts.some((post) => post.performance && typeof post.performance === "object"),
      creativeCatalog: catalog.availability?.key === "available",
      proofFiles: [state.reports, state.dataRoomItems, state.evidencePackNotes].some(Array.isArray)
    },
    diagnostics: {
      candidatesExamined: countVisibleCandidates(authorizedState),
      postsExamined: contexts.length,
      excludedChannels
    }
  });
}

export function socialResultsSafeText(value = "", limit = 240) {
  return safeText(value, limit);
}

export function socialResultsSourceReference(collection, sourceId, relationship) {
  return sourceReference(collection, sourceId, relationship);
}

export function socialResultsRecordId(record = {}) {
  return recordId(record);
}
