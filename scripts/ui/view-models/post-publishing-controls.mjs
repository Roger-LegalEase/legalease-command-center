import {
  collectPostPublishingControlSources,
  comparePublishingControlChannels,
  normalizePublishingControlChannel,
  publishingControlChannelLabel
} from "./post-publishing-control-sources.mjs";

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

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

const OVERALL_LABELS = Object.freeze({
  needs_connection: "Needs connection",
  connected_publishing_off: "Connected, publishing off",
  needs_attention: "Needs attention",
  ready_to_publish: "Ready to publish",
  partially_published: "Partially published",
  published: "Published",
  manual_publishing_available: "Manual publishing available",
  unavailable: "Unavailable"
});

const CHANNEL_LABELS = Object.freeze({
  not_connected: "Not connected",
  connected_publishing_off: "Connected, publishing off",
  needs_attention: "Needs attention",
  ready_to_publish: "Ready to publish",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  unavailable: "Unavailable"
});

const PUBLICATION_LABELS = Object.freeze({
  no_attempt: "No publication attempt",
  scheduled: "Scheduled",
  publishing: "Publication in progress",
  published: "Published",
  failed_retryable: "Publication failed",
  failed_terminal: "Publication failed permanently",
  reconciliation_required: "Publication needs reconciliation",
  blocked: "Publication blocked",
  ambiguous: "Publication status unavailable"
});

export const POST_PUBLISHING_CONTROL_STATES = deepFreeze(Object.fromEntries(
  Object.entries(OVERALL_LABELS).map(([key, label]) => [key, { key, label }])
));

export const POST_PUBLISHING_CHANNEL_STATES = deepFreeze(Object.fromEntries(
  Object.entries(CHANNEL_LABELS).map(([key, label]) => [key, { key, label }])
));

function safeId(value = "") {
  const id = clean(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? id : "";
}

function sourceReference(collection, sourceId, relationship = "") {
  const id = safeId(sourceId);
  if (!id) return null;
  return { collection, sourceId: id, relationship: clean(relationship) || null };
}

function referenceKey(reference) {
  return reference ? `${reference.collection}:${reference.sourceId}:${reference.relationship || ""}` : "";
}

function dedupeReferences(references = []) {
  const map = new Map();
  for (const reference of references.flat(Infinity).filter(Boolean)) {
    if (!safeId(reference.sourceId) || !clean(reference.collection)) continue;
    const compact = {
      collection: clean(reference.collection),
      sourceId: safeId(reference.sourceId),
      relationship: clean(reference.relationship) || null
    };
    map.set(referenceKey(compact), compact);
  }
  return [...map.values()].sort((left, right) => referenceKey(left).localeCompare(referenceKey(right), "en-US"));
}

function lifecycle(record = {}) {
  return lower(record.lifecycleStatus || record.lifecycle || record.recordStatus || record.record_status);
}

function isHistorical(record = {}) {
  const value = lifecycle(record);
  return record.isCurrent === false || record.current === false
    || /^(?:resolved|cleared|dismissed|closed|inactive|archived|historical|superseded)$/.test(value);
}

function explicitCurrent(record = {}) {
  const value = lifecycle(record);
  return record.isCurrent === true || record.current === true || /^(?:active|open|current)$/.test(value);
}

function numericVersion(record = {}) {
  for (const value of [record.versionNumber, record.version, record.attemptNumber, record.sequence]) {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 0) return number;
  }
  return null;
}

function lineage(record = {}) {
  return safeId(record.lineageId || record.lineage_id || record.attemptLineageId || record.claimLineageId || record.idempotencyLineage);
}

function recordRevision(record = {}) {
  return clean(record.approvalRevision || record.approval_revision);
}

function channelOf(record = {}) {
  return normalizePublishingControlChannel(record.channel || record.platform);
}

function rawRecordStatus(record = {}) {
  const event = lower(record.eventType || record.action || record.result);
  if (/^(?:published|post_published|publish_succeeded|publication_succeeded)$/.test(event)) return "published";
  return lower(record.statusAfter || record.status_after || record.status || event);
}

function stableRecordOrder(left, right) {
  return clean(left.collection).localeCompare(clean(right.collection), "en-US")
    || clean(left.record.id).localeCompare(clean(right.record.id), "en-US")
    || stableSerialize(left.record).localeCompare(stableSerialize(right.record), "en-US");
}

function lifecycleFact(value = "", record = {}, stableLegacy = false) {
  const status = lower(value);
  if (!status || status === "approved") return { key: "no_attempt", retryable: false };
  if (["publish_claimed", "publishing", "pending", "in_progress", "in-progress", "started", "processing"].includes(status)) {
    return { key: "publishing", retryable: false };
  }
  if (["posted", "published", "succeeded", "success", "complete", "completed"].includes(status)) {
    return { key: "published", retryable: false };
  }
  if (status === "failed_retryable" || status === "retry_ready") return { key: "failed_retryable", retryable: true };
  if (status === "failed_terminal") return { key: "failed_terminal", retryable: false };
  if (status === "reconciliation_required") return { key: "reconciliation_required", retryable: false };
  if (["scheduled", "queued"].includes(status)) return { key: "scheduled", retryable: false };
  if (status === "failed") return { key: stableLegacy ? "failed_retryable" : "blocked", retryable: stableLegacy };
  if (["error", "blocked"].includes(status)) {
    const explicitlyRetryable = record.retryEligible === true || record.retryable === true || lower(record.retryability) === "retryable";
    return { key: explicitlyRetryable ? "failed_retryable" : "blocked", retryable: explicitlyRetryable };
  }
  return { key: "ambiguous", retryable: false };
}

function physicalMirrorKey(entry) {
  const id = safeId(entry.record.id);
  return id ? `${entry.collection}:${id}:${channelOf(entry.record)}:${recordRevision(entry.record)}` : "";
}

function mirrorLifecycleKey(entry) {
  const record = entry.record;
  return `${rawRecordStatus(record)}:${record.retryEligible === true}:${record.retryable === true}:${lower(record.retryability)}`;
}

function collapsePhysicalMirrors(records) {
  const groups = new Map();
  const withoutIdentity = [];
  for (const entry of records) {
    const key = physicalMirrorKey(entry);
    if (!key) withoutIdentity.push(entry);
    else groups.set(key, [...(groups.get(key) || []), entry]);
  }
  const collapsed = [...withoutIdentity];
  for (const entries of groups.values()) {
    if (new Set(entries.map(mirrorLifecycleKey)).size !== 1) return { records: [], conflict: true };
    collapsed.push([...entries].sort(stableRecordOrder)[0]);
  }
  return { records: collapsed.sort(stableRecordOrder), conflict: false };
}

function resolveCurrentClaim(source, channel) {
  const channelClaims = source.publishClaims
    .filter((record) => channelOf(record) === channel && !isHistorical(record))
    .map((record) => ({ collection: "publishClaims", record }))
    .sort(stableRecordOrder);
  if (!channelClaims.length) return { state: "none", current: null, fact: null, examined: 0, historicalExcluded: 0 };
  const revision = source.approvalRevision;
  if (!revision?.available || !revision.value) {
    return { state: "ambiguous", current: null, fact: null, examined: channelClaims.length, historicalExcluded: 0 };
  }
  const matching = channelClaims.filter(({ record }) => recordRevision(record) === revision.value);
  const unscoped = channelClaims.filter(({ record }) => !recordRevision(record));
  const historicalExcluded = channelClaims.length - matching.length - unscoped.length;
  if (unscoped.length) {
    return { state: "ambiguous", current: null, fact: null, examined: channelClaims.length, historicalExcluded };
  }
  if (!matching.length) return { state: "none", current: null, fact: null, examined: channelClaims.length, historicalExcluded };
  const collapsed = collapsePhysicalMirrors(matching);
  if (collapsed.conflict || collapsed.records.length !== 1) {
    return { state: "ambiguous", current: null, fact: null, examined: channelClaims.length, historicalExcluded };
  }
  const current = collapsed.records[0];
  return {
    state: "resolved",
    current,
    fact: lifecycleFact(rawRecordStatus(current.record), current.record, true),
    examined: channelClaims.length,
    historicalExcluded
  };
}

function resolveLegacyAttempt(source, channel) {
  const revision = source.approvalRevision;
  const candidates = source.nestedAttempts
    .filter((record) => channelOf(record) === channel && !isHistorical(record))
    .filter((record) => !recordRevision(record) || (revision?.available && recordRevision(record) === revision.value))
    .map((record) => ({ collection: "posts.publishAttempts", record }))
    .sort(stableRecordOrder);
  if (!candidates.length) return { state: "none", current: null, fact: null, examined: 0 };
  const collapsed = collapsePhysicalMirrors(candidates);
  if (collapsed.conflict) return { state: "ambiguous", current: null, fact: null, examined: candidates.length };
  const relevant = collapsed.records;
  if (relevant.length === 1) {
    const current = relevant[0];
    return { state: "resolved", current, fact: lifecycleFact(rawRecordStatus(current.record), current.record, true), examined: candidates.length };
  }
  const explicit = relevant.filter(({ record }) => explicitCurrent(record));
  if (explicit.length === 1) {
    const current = explicit[0];
    return { state: "resolved", current, fact: lifecycleFact(rawRecordStatus(current.record), current.record, true), examined: candidates.length };
  }
  if (explicit.length > 1) return { state: "ambiguous", current: null, fact: null, examined: candidates.length };
  const lineages = [...new Set(relevant.map(({ record }) => lineage(record)).filter(Boolean))];
  const ids = [...new Set(relevant.map(({ record }) => safeId(record.id)).filter(Boolean))];
  const versioned = (lineages.length === 1 || ids.length === 1)
    && relevant.every(({ record }) => numericVersion(record) !== null)
    && new Set(relevant.map(({ record }) => numericVersion(record))).size === relevant.length;
  if (!versioned) return { state: "ambiguous", current: null, fact: null, examined: candidates.length };
  const current = [...relevant].sort((left, right) => numericVersion(right.record) - numericVersion(left.record) || stableRecordOrder(left, right))[0];
  return { state: "resolved", current, fact: lifecycleFact(rawRecordStatus(current.record), current.record, true), examined: candidates.length };
}

function resolveExplicitSuccess(source, channel, claim) {
  const revision = source.approvalRevision;
  const claimId = safeId(claim.current?.record?.id);
  const events = source.publishEvents
    .filter((record) => channelOf(record) === channel && !isHistorical(record))
    .map((record) => ({ collection: "publishEvents", record }))
    .sort(stableRecordOrder);
  if (!events.length) return { state: "none", successes: [], examined: 0 };
  const current = events.filter(({ record }) => {
    const eventRevision = recordRevision(record);
    const linkedClaim = safeId(record.claimId || record.claim_id || record.publishClaimId);
    return (revision?.available && eventRevision && eventRevision === revision.value)
      || (claimId && linkedClaim === claimId);
  });
  const successes = current.filter(({ record }) => lifecycleFact(rawRecordStatus(record), record, false).key === "published");
  if (!successes.length) return { state: "none", successes: [], examined: events.length };
  const collapsed = collapsePhysicalMirrors(successes);
  if (collapsed.conflict) return { state: "ambiguous", successes: [], examined: events.length };
  return { state: "resolved", successes: collapsed.records, examined: events.length };
}

function channelMap(post = {}, ...keys) {
  for (const key of keys) {
    const value = post[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
}

function safePublishedUrl(value = "") {
  const text = clean(value);
  if (!text || text.length > 2048) return null;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some((key) => /token|signature|credential|secret|api.?key|auth/i.test(key))) return null;
    const host = lower(url.hostname);
    if (host.startsWith("api.") || host.startsWith("developers.") || host.includes("dashboard")
      || host === "business.facebook.com" || host === "business.linkedin.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function eventUrl(record = {}) {
  return record.publishedUrl || record.published_url || record.externalPostUrl || record.external_post_url || record.resultUrl;
}

function publicationProjection(source, channel) {
  const statusMap = channelMap(source.post, "per_channel_publish_status", "perChannelPublishStatus");
  const urlMap = channelMap(source.post, "per_channel_published_url", "perChannelPublishedUrl", "publishedUrls");
  const singleSelectedChannel = source.variants.selectedChannels.length === 1
    && normalizePublishingControlChannel(source.variants.selectedChannels[0]) === channel;
  const claim = resolveCurrentClaim(source, channel);
  const result = resolveExplicitSuccess(source, channel, claim);
  const attempt = resolveLegacyAttempt(source, channel);
  const mappedCandidate = Object.prototype.hasOwnProperty.call(statusMap, channel)
    ? lifecycleFact(statusMap[channel], {}, true)
    : null;
  const mappedFact = mappedCandidate?.key === "ambiguous" ? null : mappedCandidate;
  const globalCandidate = singleSelectedChannel
    ? source.postView.status?.key === "published"
      ? { key: "published", retryable: false }
      : lifecycleFact(source.post.status, {}, true)
    : null;
  const globalFact = globalCandidate?.key === "ambiguous" ? null : globalCandidate;

  let fact = { key: "no_attempt", retryable: false };
  let authority = null;
  let authorityConflict = false;
  if (claim.state === "ambiguous" || result.state === "ambiguous") {
    fact = { key: "ambiguous", retryable: false };
  } else if (result.state === "resolved") {
    if (claim.fact?.key === "reconciliation_required") {
      fact = { key: "reconciliation_required", retryable: false };
      authority = claim.current;
      authorityConflict = true;
    } else if (claim.fact?.key === "publishing") {
      fact = { key: "ambiguous", retryable: false };
      authority = claim.current;
      authorityConflict = true;
    } else {
      fact = { key: "published", retryable: false };
      authority = result.successes[0];
    }
  } else if (claim.state === "resolved") {
    fact = claim.fact;
    authority = claim.current;
  } else if (attempt.state === "ambiguous") {
    fact = { key: "ambiguous", retryable: false };
  } else if (attempt.state === "resolved") {
    fact = attempt.fact;
    authority = attempt.current;
  } else if (mappedFact) {
    fact = mappedFact;
  } else if (globalFact) {
    fact = globalFact;
  }
  const state = fact.key;

  let url = null;
  if (state === "published") {
    const resultUrls = [...new Set(result.successes.map(({ record }) => safePublishedUrl(eventUrl(record))).filter(Boolean))];
    if (resultUrls.length === 1) url = resultUrls[0];
    if (!url && authority) url = safePublishedUrl(eventUrl(authority.record));
    if (!url) url = safePublishedUrl(urlMap[channel]);
    if (!url && singleSelectedChannel) url = safePublishedUrl(source.post.publishedUrl || source.post.externalPostUrl);
  }
  const attemptReference = authority && authority.collection !== "publishEvents"
    ? sourceReference(authority.collection, authority.record.id, "publication_attempt")
    : null;
  const resultReference = state === "published" && result.successes[0]
    ? sourceReference(result.successes[0].collection, result.successes[0].record.id, "publication_result")
    : null;
  return {
    state,
    label: PUBLICATION_LABELS[state],
    publishedUrl: url,
    publishedUrlAvailability: state !== "published" ? "not_applicable" : url ? "available" : "unavailable",
    attemptReference,
    resultReference,
    retryable: fact.retryable === true,
    ambiguous: state === "ambiguous",
    authorityConflict,
    historicalClaimsExcluded: claim.historicalExcluded,
    recordsExamined: claim.examined + attempt.examined + result.examined
  };
}

function connectedAccount(source, channel) {
  const item = source.accounts.find((candidate) => candidate.channel === channel);
  const account = item?.account || null;
  if (!source.sourcePresence.socialAccounts) return { key: "unavailable", account: null };
  if (!account) return { key: "not_connected", account: null };
  const status = lower(account.status || account.connectionStatus);
  const durableIdentity = Boolean(account.connectedAt || account.externalAccountId || account.accountId || account.accountName);
  const connected = account.connected === true || (status === "connected" && durableIdentity)
    || (Boolean(account.connectedAt) && !/expired|error|disconnect|refresh/.test(status));
  if (connected) return { key: "connected", account };
  return { key: /error|refresh|attention|expired/.test(status) ? "needs_attention" : "not_connected", account };
}

function gateFor(source, channel) {
  if (!source.sourcePresence.livePostingGates || !source.gates
    || !Object.prototype.hasOwnProperty.call(source.gates, channel)) return "unavailable";
  return source.gates[channel] === true ? "enabled" : source.gates[channel] === false ? "off" : "unavailable";
}

function manualFallbackFor(source, publication) {
  if (publication.state === "published") return { state: "not_needed", label: "Not needed", available: false, executable: false };
  if (source.post.manualPublishingAvailable === true || source.post.manual_publishing_available === true) {
    return { state: "available", label: "Manual publishing available", available: true, executable: false };
  }
  if (source.post.manualPublishingAvailable === false || source.post.manual_publishing_available === false) {
    return { state: "unavailable", label: "Manual publishing unavailable", available: false, executable: false };
  }
  return { state: "status_unavailable", label: "Manual publishing status unavailable", available: false, executable: false };
}

function readinessBlocked(source) {
  return list(source.readiness.checks).some((check) => ["Content", "Creative"].includes(check.category)
    && check.blocking === true && check.status?.key !== "passed");
}

function scheduleFor(source, channel) {
  return source.schedulePlan.channelPlans.find((plan) => plan.channel === channel) || null;
}

function eligibility(source, channel, facts) {
  const requiredCapability = "social_publish";
  const result = (available, reason) => ({ available, executable: false, reason, requiredCapability });
  if (!source.publishAuthority?.available) return result(false, "publication_policy_unavailable");
  if (source.readiness.availability?.key === "unavailable"
    || source.reviewPlan.availability?.key === "unavailable" || source.schedulePlan.availability?.key === "unavailable") {
    return result(false, "source_unavailable");
  }
  if (facts.publication.state === "published") return result(false, "already_published");
  if (facts.publication.state === "ambiguous") return result(false, "ambiguous_attempt");
  if (facts.publication.state === "reconciliation_required") return result(false, "reconciliation_required");
  if (facts.publication.state === "failed_terminal") return result(false, "terminal_failure");
  if (facts.publication.state === "publishing") return result(false, "attempt_in_progress");
  if (facts.publication.state === "blocked") return result(false, "publication_not_retryable");
  if (!source.publishAuthority.allowed) return result(false, "actor_cannot_publish");
  if (facts.connection.key === "not_connected") return result(false, "channel_not_connected");
  if (facts.connection.key === "needs_attention") return result(false, "connection_needs_attention");
  if (facts.connection.key === "unavailable") return result(false, "connection_source_unavailable");
  if (facts.gate === "off") return result(false, "publishing_off");
  if (facts.gate === "unavailable") return result(false, "gate_source_unavailable");
  const approvalRequired = source.post.approvalRequired !== false && source.post.approval_required !== false;
  if (approvalRequired && source.reviewPlan.state.key !== "approved") return result(false, "review_not_approved");
  if (readinessBlocked(source)) return result(false, "readiness_blocked");
  if (!facts.schedule || ["invalid_schedule", "schedule_conflict", "schedule_missing", "unavailable"].includes(source.schedulePlan.state.key)
    || facts.schedule.availability?.key === "unavailable") return result(false, "schedule_not_permitted");
  if (["scheduled", "shared_schedule"].includes(facts.schedule.state)) return result(false, "scheduled_publication_pending");
  return result(true, facts.publication.retryable ? "eligible_for_retry" : "eligible_for_publication");
}

function channelState(facts) {
  if (facts.publication.state === "published") return "published";
  if (facts.publication.state === "ambiguous" || facts.connection.key === "unavailable" || facts.gate === "unavailable") return "unavailable";
  if (facts.publication.state === "reconciliation_required") return "needs_attention";
  if (facts.publication.state === "publishing") return "publishing";
  if (["failed_retryable", "failed_terminal", "blocked"].includes(facts.publication.state)) return "failed";
  if (facts.connection.key === "not_connected") return "not_connected";
  if (facts.connection.key === "needs_attention") return "needs_attention";
  if (facts.gate === "off") return "connected_publishing_off";
  if (facts.schedule && ["scheduled", "shared_schedule"].includes(facts.schedule.state)) return "scheduled";
  if (facts.eligibility.available) return "ready_to_publish";
  return "needs_attention";
}

function channelProjection(source, channel) {
  const connection = connectedAccount(source, channel);
  const gate = gateFor(source, channel);
  const publication = publicationProjection(source, channel);
  const schedule = scheduleFor(source, channel);
  const manualFallback = manualFallbackFor(source, publication);
  const facts = { connection, gate, publication, schedule };
  const eligible = eligibility(source, channel, facts);
  facts.eligibility = eligible;
  const key = channelState(facts);
  const accountRef = connection.account ? sourceReference("socialAccounts", connection.account.id, "channel_connection") : null;
  const scheduleRef = schedule?.sourceReference ? { ...schedule.sourceReference } : null;
  return {
    channel,
    label: publishingControlChannelLabel(channel),
    state: { ...POST_PUBLISHING_CHANNEL_STATES[key] },
    connectionState: {
      key: connection.key,
      label: connection.key === "connected" ? "Connected" : connection.key === "not_connected" ? "Not connected" : connection.key === "needs_attention" ? "Connection needs attention" : "Connection unavailable"
    },
    publishingGateState: {
      key: gate,
      label: gate === "enabled" ? "Publishing enabled" : gate === "off" ? "Publishing off" : "Publishing gate unavailable"
    },
    reviewState: { ...source.reviewPlan.state },
    scheduleState: schedule ? { key: schedule.state, label: schedule.stateLabel } : { key: "unavailable", label: "Schedule unavailable" },
    publicationState: {
      key: publication.state,
      label: publication.label,
      retryEligible: publication.retryable && eligible.available,
      authorityConflict: publication.authorityConflict,
      historicalClaimsExcluded: publication.historicalClaimsExcluded
    },
    publishedUrl: publication.publishedUrl,
    publishedUrlAvailability: publication.publishedUrlAvailability,
    attemptReference: publication.attemptReference,
    manualFallback,
    eligibility: eligible,
    sourceReferences: dedupeReferences([accountRef, scheduleRef, publication.attemptReference, publication.resultReference])
  };
}

function overallState(channels, manualFallback) {
  if (!channels.length) return "needs_attention";
  const published = channels.filter((channel) => channel.state.key === "published").length;
  if (published === channels.length) return "published";
  if (published > 0) return "partially_published";
  if (channels.some((channel) => channel.state.key === "not_connected")) return "needs_connection";
  if (channels.every((channel) => channel.state.key === "ready_to_publish")) return "ready_to_publish";
  if (manualFallback.state === "available") return "manual_publishing_available";
  const attention = channels.some((channel) => ["needs_attention", "failed", "publishing", "scheduled", "unavailable"].includes(channel.state.key));
  if (!attention && channels.some((channel) => channel.state.key === "connected_publishing_off")) return "connected_publishing_off";
  return "needs_attention";
}

function overallManualFallback(channels) {
  if (channels.length && channels.every((channel) => channel.manualFallback.state === "not_needed")) {
    return { state: "not_needed", label: "Manual publishing not needed", available: false, executable: false };
  }
  if (channels.some((channel) => channel.manualFallback.state === "available" && channel.state.key !== "published")) {
    return { state: "available", label: "Manual publishing available", available: true, executable: false };
  }
  if (channels.length && channels.every((channel) => ["unavailable", "not_needed"].includes(channel.manualFallback.state))) {
    return { state: "unavailable", label: "Manual publishing unavailable", available: false, executable: false };
  }
  return { state: "status_unavailable", label: "Manual publishing status unavailable", available: false, executable: false };
}

function guidanceFor(key, channels) {
  const guidance = [];
  if (key === "needs_connection") guidance.push({ key: "review_connections", text: "Connect each selected channel through the separately controlled connection workflow.", executable: false });
  if (key === "connected_publishing_off") guidance.push({ key: "publishing_off", text: "The channel is connected, but only server-side configuration can enable controlled publishing.", executable: false });
  if (key === "ready_to_publish") guidance.push({ key: "read_only_eligibility", text: "Eligibility is informational; the publication endpoint must reauthorize and revalidate every condition.", executable: false });
  if (key === "partially_published") guidance.push({ key: "preserve_success", text: "Successful channels remain complete and are never included in retry eligibility.", executable: false });
  if (key === "published") guidance.push({ key: "stored_success", text: "Every selected channel has explicit stored success evidence.", executable: false });
  if (key === "manual_publishing_available") guidance.push({ key: "manual_fallback", text: "Manual fallback is separately stored availability and does not mark any channel published.", executable: false });
  if (channels.some((channel) => channel.publicationState.key === "ambiguous")) guidance.push({ key: "attempt_ambiguity", text: "Attempt lineage is ambiguous, so another attempt is not presented as eligible.", executable: false });
  if (!guidance.length) guidance.push({ key: "review_controls", text: "Review the stored channel controls; no connection, gate, schedule, review, or publication action is executed here.", executable: false });
  return guidance;
}

function unavailableResult(generatedAt, reason) {
  return deepFreeze({
    postId: null,
    href: null,
    generatedAt,
    state: { ...POST_PUBLISHING_CONTROL_STATES.unavailable },
    channels: [],
    manualFallback: null,
    approval: null,
    schedule: null,
    review: null,
    publicationSummary: null,
    guidance: [],
    sourceReferences: [],
    availability: { key: "unavailable", reason, counts: null },
    performance: { candidatesExamined: 0, postsProjected: 0 },
    capabilities: {
      connects: false, readsCredentials: false, changesGates: false, publishes: false, retries: false,
      createsAttempts: false, createsIdempotencyKeys: false, writesSchedules: false, approves: false,
      callsProviders: false, networkRequests: false, writesStorage: false, mutatesSource: false,
      mutatesPost: false, mutatesVariant: false
    }
  });
}

export function buildPostPublishingControls(state = {}, actor = {}, postId = "", now = "") {
  const source = collectPostPublishingControlSources(state, actor, postId, now);
  if (!source.authorized || !source.found || !source.postView) return unavailableResult(source.generatedAt, source.reason);

  const channels = [...source.variants.selectedChannels]
    .map((channel) => normalizePublishingControlChannel(channel))
    .filter(Boolean)
    .sort(comparePublishingControlChannels)
    .map((channel) => channelProjection(source, channel));
  const manualFallback = overallManualFallback(channels);
  const stateKey = overallState(channels, manualFallback);
  const counts = {
    selectedChannels: channels.length,
    connectedChannels: channels.filter((channel) => channel.connectionState.key === "connected").length,
    gatedChannels: channels.filter((channel) => channel.publishingGateState.key === "enabled").length,
    eligibleChannels: channels.filter((channel) => channel.eligibility.available).length,
    publishedChannels: channels.filter((channel) => channel.publicationState.key === "published").length,
    failedChannels: channels.filter((channel) => ["failed_retryable", "failed_terminal", "blocked"].includes(channel.publicationState.key)).length,
    ambiguousRecords: channels.filter((channel) => channel.publicationState.key === "ambiguous").length,
    historicalClaimsExcluded: channels.reduce((total, channel) => total + Number(channel.publicationState.historicalClaimsExcluded || 0), 0)
  };
  const sourceReferences = dedupeReferences([
    source.postView.sourceReferences,
    source.composerDraft.sourceReferences,
    source.variants.sourceReferences,
    source.schedulePlan.sourceReferences,
    source.reviewPlan.sourceReferences,
    channels.map((channel) => channel.sourceReferences)
  ]);
  return deepFreeze({
    postId: source.postView.id,
    href: clean(source.postView.href).startsWith("#") ? source.postView.href : null,
    generatedAt: source.generatedAt,
    state: { ...POST_PUBLISHING_CONTROL_STATES[stateKey] },
    channels,
    manualFallback,
    approval: {
      required: source.post.approvalRequired !== false && source.post.approval_required !== false,
      state: { ...source.reviewPlan.approval.state },
      sourceReference: source.reviewPlan.approval.sourceReference ? { ...source.reviewPlan.approval.sourceReference } : null,
      executable: false
    },
    schedule: {
      state: { ...source.schedulePlan.state },
      scheduledAt: source.schedulePlan.scheduledAt,
      timezone: source.schedulePlan.timezone,
      executable: false
    },
    review: {
      state: { ...source.reviewPlan.state },
      blockingChecks: source.reviewPlan.blockingChecks.length,
      requestedChanges: source.reviewPlan.requestedChanges.length,
      executable: false
    },
    publicationSummary: {
      state: stateKey,
      counts: { ...counts },
      explicitSuccessRequired: true,
      executable: false
    },
    guidance: guidanceFor(stateKey, channels),
    sourceReferences,
    availability: { key: "available", reason: null, counts: { ...counts } },
    performance: { ...source.diagnostics },
    capabilities: {
      connects: false, readsCredentials: false, changesGates: false, publishes: false, retries: false,
      createsAttempts: false, createsIdempotencyKeys: false, writesSchedules: false, approves: false,
      callsProviders: false, networkRequests: false, writesStorage: false, mutatesSource: false,
      mutatesPost: false, mutatesVariant: false
    }
  });
}
