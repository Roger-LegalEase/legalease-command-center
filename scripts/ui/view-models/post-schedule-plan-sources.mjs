import { recordVisibleToActor } from "../../global-search-service.mjs";
import { buildPostChannelVariants, normalizePostChannel } from "./post-channel-variants.mjs";
import { collectPostComposerDraftSources } from "./post-composer-draft-sources.mjs";
import { buildPostComposerDraft } from "./post-composer-draft.mjs";
import { collectPostReadinessSources } from "./post-readiness-sources.mjs";
import { buildPostReadiness } from "./post-readiness.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

const SCHEDULE_FIELDS = Object.freeze(["scheduledFor", "scheduled_at", "planned_date", "plannedDate"]);
const TIMEZONE_FIELDS = Object.freeze(["timezone", "timeZone", "scheduleTimezone"]);
const CHANNEL_SCHEDULE_MAP_FIELDS = Object.freeze([
  "channelSchedules", "channel_schedules", "perChannelSchedules", "per_channel_schedules"
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeId(value = "") {
  const id = clean(value);
  return /^[a-z0-9][a-z0-9._:-]{0,239}$/i.test(id) ? id : "";
}

function safeStoredText(value = "", limit = 160) {
  const text = clean(value);
  if (!text || text.length > limit || /[\u0000-\u001f\u007f<>]/u.test(text)) return text ? null : "";
  if (/(?:^|\s)(?:\/(?:private|home|users|var|tmp)\/|[a-z]:\\)/i.test(text)) return null;
  if (/\b(?:access|refresh|storage|service.?role|oauth)[_ -]?(?:token|key)|\bcredential|\bsecret\b/i.test(text)) return null;
  if (/https?:\/\/|data:image\//i.test(text)) return null;
  return text;
}

function firstPresent(record = {}, fields = []) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) return { present: true, field, value: record[field] };
  }
  return { present: false, field: fields[0] || "", value: undefined };
}

function validNow(value = "") {
  const exact = safeStoredText(value, 120);
  return exact && Number.isFinite(Date.parse(exact)) ? exact : null;
}

function localDateTimeParts(exact = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(exact);
  if (!match) return null;
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0),
    millisecond: Number(String(match[7] || "0").padEnd(3, "0"))
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond));
  return check.getUTCFullYear() === parts.year && check.getUTCMonth() + 1 === parts.month
    && check.getUTCDate() === parts.day && check.getUTCHours() === parts.hour
    && check.getUTCMinutes() === parts.minute && check.getUTCSeconds() === parts.second
    && check.getUTCMilliseconds() === parts.millisecond ? parts : null;
}

function formattedLocalParts(epochMs, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23"
  });
  const values = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour) === 24 ? 0 : Number(values.hour), minute: Number(values.minute),
    second: Number(values.second), millisecond: Number(values.fractionalSecond || 0)
  };
}

function sameLocalParts(left, right) {
  return ["year", "month", "day", "hour", "minute", "second", "millisecond"]
    .every((field) => left[field] === right[field]);
}

function resolveZonedLocalInstant(parts, timeZone) {
  const wallClockAsUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond
  );
  const matches = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = wallClockAsUtc - offsetMinutes * 60_000;
    if (sameLocalParts(formattedLocalParts(candidate, timeZone), parts)) matches.push(candidate);
  }
  const instants = [...new Set(matches)].sort((left, right) => left - right);
  if (instants.length === 1) return { state: "resolved", epochMs: instants[0] };
  if (instants.length > 1) return { state: "ambiguous", epochMs: null };
  return { state: "nonexistent", epochMs: null };
}

function parseStoredSchedule(value = "", timezone = { state: "unavailable", exact: null }) {
  const exact = safeStoredText(value, 120);
  if (!exact) return { exact: exact === "" ? "" : null, valid: false, epochMs: null, hasOffset: false, kind: "missing", instantState: "unavailable" };
  const format = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  if (!format.test(exact)) return { exact, valid: false, epochMs: null, hasOffset: false, kind: "invalid", instantState: "invalid" };
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(exact);
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(exact);
  if (dateOnly || hasOffset) {
    const epochMs = Date.parse(exact);
    return {
      exact,
      valid: Number.isFinite(epochMs),
      epochMs: Number.isFinite(epochMs) ? epochMs : null,
      hasOffset,
      kind: dateOnly ? "date_only" : "explicit_offset",
      instantState: Number.isFinite(epochMs) ? "resolved" : "invalid"
    };
  }
  const parts = localDateTimeParts(exact);
  if (!parts) return { exact, valid: false, epochMs: null, hasOffset: false, kind: "local_date_time", instantState: "invalid" };
  if (timezone.state !== "valid") {
    return { exact, valid: true, epochMs: null, hasOffset: false, kind: "local_date_time", instantState: "unavailable" };
  }
  const resolved = resolveZonedLocalInstant(parts, timezone.exact);
  return {
    exact,
    valid: resolved.state !== "nonexistent",
    epochMs: resolved.epochMs,
    hasOffset: false,
    kind: "local_date_time",
    instantState: resolved.state
  };
}

function timezoneFact(record = {}) {
  const presence = firstPresent(record, TIMEZONE_FIELDS);
  const exact = safeStoredText(presence.value, 80);
  if (!presence.present) return { present: false, exact: null, state: "unavailable" };
  if (exact === "") return { present: true, exact: null, state: "missing" };
  if (exact === null) return { present: true, exact: null, state: "invalid" };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: exact }).format(new Date(0));
    return { present: true, exact, state: "valid" };
  } catch {
    return { present: true, exact, state: "invalid" };
  }
}

function scheduleFact(record = {}, sourceReference = null) {
  const presence = firstPresent(record, SCHEDULE_FIELDS);
  const timezone = timezoneFact(record);
  const parsed = parseStoredSchedule(presence.value, timezone);
  const storedStatus = lower(record.scheduleStatus || record.schedule_status);
  return {
    present: presence.present,
    field: presence.field,
    exact: presence.present ? parsed.exact : null,
    valid: presence.present && Boolean(parsed.exact) && parsed.valid,
    epochMs: parsed.epochMs,
    hasOffset: parsed.hasOffset,
    kind: parsed.kind,
    instantState: parsed.instantState,
    status: storedStatus,
    timezone,
    sourceReference
  };
}

function sourceReference(collection, sourceId, relationship) {
  const id = safeId(sourceId);
  return id ? { collection, sourceId: id, relationship } : null;
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

function variantSourceId(record = {}, postId = "", channel = "") {
  const direct = safeId(record.id || record.variantRecordId || record.variant_record_id);
  if (direct) return direct;
  const lineage = safeId(record.variantFamilyId || record.variant_family_id || record.variantKey || record.variant_key || record.variantId || record.variant_id);
  const rawVersion = record.versionNumber ?? record.version_number ?? record.version;
  const version = Number.isInteger(Number(rawVersion)) && Number(rawVersion) >= 0 ? Number(rawVersion) : null;
  if (lineage) return version === null ? lineage : safeId(`${lineage}:v${version}`);
  return safeId(`${postId}:${channel}${version === null ? "" : `:v${version}`}`);
}

function visibleVariantScheduleFacts(post = {}, role = "") {
  const container = rawVariantContainer(post);
  const entries = container.kind === "array"
    ? list(container.value).map((record) => [record?.channel || record?.platform, record])
    : Object.entries(container.value);
  const facts = [];
  for (const [rawChannel, record] of entries) {
    if (!record || typeof record !== "object" || !recordVisibleToActor(record, role)) continue;
    const channel = normalizePostChannel(rawChannel || record.channel || record.platform);
    if (!channel) continue;
    const id = variantSourceId(record, safeId(post.id), channel);
    const reference = sourceReference(container.collection, id, "channel_schedule");
    const fact = scheduleFact(record, reference);
    if (!fact.present && !fact.timezone.present && !fact.status) continue;
    facts.push({ channel, ...fact });
  }
  return facts;
}

function mappedChannelScheduleFacts(post = {}) {
  const facts = [];
  for (const field of CHANNEL_SCHEDULE_MAP_FIELDS) {
    const map = post[field];
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const [rawChannel, rawValue] of Object.entries(map)) {
      const channel = normalizePostChannel(rawChannel);
      if (!channel) continue;
      const record = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
        ? rawValue
        : { scheduledFor: rawValue };
      facts.push({
        channel,
        ...scheduleFact(record, sourceReference("posts", post.id, `channel_schedule:${field}:${channel}`))
      });
    }
  }
  return facts;
}

function sameSchedule(left, right) {
  return left.exact === right.exact && left.timezone.exact === right.timezone.exact && left.status === right.status;
}

function explicitChannelSchedules(post, role, variants) {
  const rawFacts = [...mappedChannelScheduleFacts(post), ...visibleVariantScheduleFacts(post, role)];
  const projectedReferences = new Map(variants.variants.map((variant) => [variant.channel, variant.sourceReference]));
  const selected = new Set(variants.selectedChannels);
  const byChannel = new Map();
  for (const fact of rawFacts) {
    if (!selected.has(fact.channel)) continue;
    if (fact.sourceReference?.collection.startsWith("posts.channel") || fact.sourceReference?.collection === "posts.variantsByChannel") {
      const projected = projectedReferences.get(fact.channel);
      if (!projected || clean(projected.sourceCollection || projected.collection) !== fact.sourceReference.collection
        || clean(projected.sourceId) !== clean(fact.sourceReference.sourceId)) continue;
    }
    const values = byChannel.get(fact.channel) || [];
    values.push(fact);
    byChannel.set(fact.channel, values);
  }
  return variants.selectedChannels.map((channel) => {
    const facts = byChannel.get(channel) || [];
    const unique = facts.filter((fact, index) => facts.findIndex((candidate) => sameSchedule(candidate, fact)) === index);
    return {
      channel,
      candidate: unique.length === 1 ? unique[0] : null,
      ambiguous: unique.length > 1,
      candidates: unique.length
    };
  });
}

function publicationState(value = "") {
  const status = lower(value);
  if (/posted|published|success|complete/.test(status)) return "published";
  if (/failed|blocked|error|retry/.test(status)) return "failed";
  if (/scheduled|queued|pending|publishing/.test(status)) return "scheduled";
  return "unavailable";
}

function channelPublicationFacts(context, selectedChannels, composerDraft) {
  const results = new Map();
  const events = [...context.publishEvents].sort((left, right) =>
    clean(left.occurredAt || left.occurred_at || left.updatedAt || left.updated_at || left.createdAt || left.created_at)
      .localeCompare(clean(right.occurredAt || right.occurred_at || right.updatedAt || right.updated_at || right.createdAt || right.created_at), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US")
  );
  for (const event of events) {
    const channel = normalizePostChannel(event.channel || event.platform);
    if (!selectedChannels.includes(channel)) continue;
    const value = publicationState(event.statusAfter || event.status || event.eventType || event.action);
    if (value !== "unavailable") results.set(channel, value);
  }
  const raw = context.post.per_channel_publish_status || context.post.perChannelPublishStatus || {};
  for (const channel of selectedChannels) {
    const value = publicationState(raw[channel]);
    if (value !== "unavailable") results.set(channel, value);
  }
  if (selectedChannels.length === 1 && composerDraft.readiness?.publication?.state === "published") {
    results.set(selectedChannels[0], "published");
  }
  return selectedChannels.map((channel) => ({ channel, state: results.get(channel) || "unavailable" }));
}

function retryChannels(post = {}) {
  const presence = firstPresent(post, ["retryChannels", "retry_channels"]);
  return presence.present
    ? [...new Set(list(presence.value).map(normalizePostChannel).filter(Boolean))].sort()
    : [];
}

const ACTIVE_CONFLICT_STATES = new Set(["active", "open", "current", "conflicting"]);
const INACTIVE_CONFLICT_STATES = new Set(["resolved", "cleared", "dismissed", "closed", "inactive", "archived"]);
const TERMINAL_CONFLICT_FIELDS = Object.freeze([
  "resolvedAt", "resolved_at", "clearedAt", "cleared_at", "dismissedAt", "dismissed_at",
  "closedAt", "closed_at", "archivedAt", "archived_at"
]);

function conflictLifecycle(record = {}) {
  if (TERMINAL_CONFLICT_FIELDS.some((field) => Boolean(clean(record[field])))) return "inactive";
  const status = lower(record.conflictStatus || record.conflict_status || record.lifecycleStatus || record.lifecycle_status || record.status || record.state);
  if (ACTIVE_CONFLICT_STATES.has(status)) return "active";
  if (INACTIVE_CONFLICT_STATES.has(status)) return "inactive";
  return "unknown";
}

function storedConflictFacts(state, context) {
  const nested = list(context.post.scheduleConflicts || context.post.schedule_conflicts)
    .filter((record) => record && typeof record === "object" && recordVisibleToActor(record, context.role))
    .map((record) => ({ collection: "posts.scheduleConflicts", record }));
  const related = list(state.scheduleConflicts || state.schedule_conflicts)
    .filter((record) => record && typeof record === "object" && recordVisibleToActor(record, context.role))
    .filter((record) => clean(record.postId || record.post_id || record.relatedPostId || record.related_post_id) === clean(context.post.id))
    .map((record) => ({ collection: "scheduleConflicts", record }));
  const active = [];
  let unavailable = 0;
  for (const { collection, record } of [...nested, ...related]) {
    const lifecycle = conflictLifecycle(record);
    if (lifecycle === "inactive") continue;
    const reference = sourceReference(collection, record.id, "schedule_conflict");
    if (lifecycle !== "active" || !reference) {
      unavailable += 1;
      continue;
    }
    active.push({
      key: "explicit_schedule_conflict",
      channel: normalizePostChannel(record.channel || record.platform) || null,
      sourceReference: reference
    });
  }
  active.sort((left, right) => clean(left.channel).localeCompare(clean(right.channel), "en-US")
    || clean(left.sourceReference.sourceId).localeCompare(clean(right.sourceReference.sourceId), "en-US"));
  return { active, unavailable };
}

function unavailable(reason, generatedAt) {
  return deepFreeze({
    authorized: false,
    found: false,
    reason,
    generatedAt,
    postView: null,
    composerDraft: null,
    variants: null,
    readiness: null,
    schedulePolicy: null,
    sharedSchedule: null,
    channelSchedules: [],
    publication: [],
    retryChannels: [],
    storedConflicts: [],
    conflictLifecycleUnavailable: 0,
    diagnostics: { sourceCandidatesExamined: 0 }
  });
}

export const POST_SCHEDULE_PLAN_SOURCE_MATRIX = deepFreeze([
  { source: "CCX-300 PostView", truth: "Canonical Post identity, exact link, normalized shared schedule, and stored publication evidence" },
  { source: "CCX-302A ComposerDraftView", truth: "Authorized exact Post composition, separate approval/readiness/publication truth, and non-executable guidance" },
  { source: "CCX-304A Post channel variants", truth: "Explicit selected channels, visible independent variants, stable channel identity, and exact variant references" },
  { source: "CCX-305 Social readiness", truth: "Reviewed read-only schedule, approval, and publication checks without mutation intent" },
  { source: "posts schedule fields", truth: "Exact shared timestamp, timezone, schedule status, explicit channel maps, retry channels, and stored conflict records" },
  { source: "visible channel variants", truth: "Channel-specific timestamps and timezones only when carried by the exact CCX-304A-resolved stored variant" },
  { source: "publishEvents / per-channel result map", truth: "Explicit scheduled, failed, and published channel outcomes" }
]);

export function collectPostSchedulePlanSources(state = {}, actor = {}, postId = "", now = "") {
  const generatedAt = validNow(now);
  if (!generatedAt) return unavailable("clock_unavailable", null);
  const readinessSource = collectPostReadinessSources(state, actor, postId);
  const composerSource = collectPostComposerDraftSources(state, actor, postId, { generatedAt });
  if (!readinessSource.authorized || !composerSource.authorized) return unavailable("actor_cannot_read", generatedAt);
  if (!readinessSource.found || !composerSource.found || !composerSource.postView) return unavailable("post_not_visible", generatedAt);

  const composerDraft = buildPostComposerDraft(state, actor, postId, { generatedAt });
  const variants = buildPostChannelVariants(state, actor, postId);
  const readiness = buildPostReadiness(state, actor, postId, generatedAt);
  if (composerDraft.availability?.key === "unavailable" || variants.availability?.key === "unavailable" || !readiness.available) {
    return unavailable("post_not_visible", generatedAt);
  }

  const post = readinessSource.post;
  const channelSchedules = explicitChannelSchedules(post, readinessSource.role, variants);
  const conflictFacts = storedConflictFacts(state, readinessSource);
  const sourceCandidatesExamined = Number(composerSource.diagnostics.postsExamined || 0)
    + Number(composerSource.diagnostics.variantsExamined || 0)
    + Number(composerSource.diagnostics.creativeCandidatesScanned || 0)
    + Number(composerSource.diagnostics.readinessCandidatesExamined || 0)
    + channelSchedules.reduce((sum, item) => sum + item.candidates, 0)
    + conflictFacts.active.length
    + conflictFacts.unavailable;
  return deepFreeze({
    authorized: true,
    found: true,
    reason: null,
    generatedAt,
    postView: composerSource.postView,
    composerDraft,
    variants,
    readiness,
    schedulePolicy: {
      status: lower(post.status),
      required: post.scheduleRequired === true || post.schedule_required === true
    },
    sharedSchedule: scheduleFact(post, sourceReference("posts", post.id, "shared_schedule")),
    channelSchedules,
    publication: channelPublicationFacts(readinessSource, variants.selectedChannels, composerDraft),
    retryChannels: retryChannels(post),
    storedConflicts: conflictFacts.active,
    conflictLifecycleUnavailable: conflictFacts.unavailable,
    diagnostics: { sourceCandidatesExamined }
  });
}

export { parseStoredSchedule };
