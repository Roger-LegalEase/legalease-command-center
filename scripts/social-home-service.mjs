import { recordVisibleToActor } from "./global-search-service.mjs";
import { GLOBAL_CREATE_ENDPOINTS } from "./global-create-service.mjs";
import { canPerformEndpoint } from "./roles.mjs";
import { buildPostChannelVariants } from "./ui/view-models/post-channel-variants.mjs";
import { buildPostReadiness } from "./ui/view-models/post-readiness.mjs";
import { parseStoredSchedule } from "./ui/view-models/post-schedule-plan-sources.mjs";
import { buildPostViews } from "./ui/view-models/post-view.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "./ui/route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const compactText = (value = "", maximum = 220) => clean(value).slice(0, maximum);
const STATUS_OPTIONS = Object.freeze([
  { key:"source_idea", label:"Source idea" },
  { key:"idea", label:"Idea" },
  { key:"draft", label:"Draft" },
  { key:"needs_review", label:"Needs review" },
  { key:"scheduled", label:"Scheduled" },
  { key:"published", label:"Published" }
]);

export const SOCIAL_HOME_ENDPOINT = "/api/ui/social";
export const SOCIAL_HOME_VIEWS = Object.freeze([
  Object.freeze({ key:"ideas", label:"Ideas" }),
  Object.freeze({ key:"weekly", label:"Weekly plan" }),
  Object.freeze({ key:"calendar", label:"Calendar" }),
  Object.freeze({ key:"library", label:"Library" }),
  Object.freeze({ key:"results", label:"Results" })
]);
export const SOCIAL_HOME_LIMITS = Object.freeze({ default:24, maximum:40 });

export class SocialHomeValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SocialHomeValidationError";
    this.status = 400;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validNow(value = "") {
  const now = clean(value);
  if (!now || !Number.isFinite(Date.parse(now))) throw new SocialHomeValidationError("A valid server timestamp is required.");
  return now;
}

function safeChoice(value = "", allowed = null) {
  const choice = lower(value);
  if (!choice) return "";
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(choice) || (allowed && !allowed.has(choice))) {
    throw new SocialHomeValidationError("The selected Social filter is invalid.");
  }
  return choice;
}

function safeFacet(value = "") {
  const facet = lower(value);
  if (!facet) return "";
  if (facet.length > 120 || /[\u0000-\u001f\u007f<>"'`\\]/u.test(facet)) {
    throw new SocialHomeValidationError("The selected Social filter is invalid.");
  }
  return facet;
}

function safeDate(value = "") {
  const date = clean(value);
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new SocialHomeValidationError("The selected Social date is invalid.");
  }
  return date;
}

function limitValue(value) {
  if (value === undefined || value === null || value === "") return SOCIAL_HOME_LIMITS.default;
  if (!/^\d{1,3}$/.test(String(value))) throw new SocialHomeValidationError("The Social page size is invalid.");
  const parsed = Number(value);
  if (parsed < 1 || parsed > SOCIAL_HOME_LIMITS.maximum) throw new SocialHomeValidationError("The Social page size is out of range.");
  return parsed;
}

function cursorValue(value = "") {
  const cursor = clean(value);
  if (!cursor) return 0;
  const match = /^social-(\d{1,8})$/.exec(cursor);
  if (!match) throw new SocialHomeValidationError("The Social cursor is invalid.");
  return Number(match[1]);
}

function authorizedState(state, role) {
  const next = { ...state };
  for (const [key, value] of Object.entries(state || {})) {
    if (Array.isArray(value)) next[key] = value.filter((record) => recordVisibleToActor(record, role));
  }
  if (state?.settings && typeof state.settings === "object") {
    next.settings = {
      ...state.settings,
      sourceItems:list(state.settings.sourceItems).filter((record) => recordVisibleToActor(record, role))
    };
  }
  return next;
}

function compactReadiness(state, actor, postId, now) {
  const readiness = buildPostReadiness(state, actor, postId, now);
  return {
    available:readiness.available,
    state:readiness.state,
    headline:readiness.headline,
    summary:readiness.summary,
    counts:readiness.counts,
    sourceAvailability:readiness.sourceAvailability
  };
}

function compactChannels(state, actor, postId) {
  const projection = buildPostChannelVariants(state, actor, postId);
  return {
    available:projection.available,
    selectedChannels:list(projection.variants).filter((variant) => variant.selected).map((variant) => ({
      key:variant.channel,
      label:variant.label,
      customized:variant.customized,
      availability:variant.availability
    }))
  };
}

function scheduleTimezone(value = "") {
  const exact = compactText(value, 80);
  if (!exact) return { exact:null, state:"unavailable" };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone:exact }).format(new Date(0));
    return { exact, state:"valid" };
  } catch {
    return { exact, state:"invalid" };
  }
}

function resolvedCalendarDate(epochMs, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar:"gregory",
    numberingSystem:"latn",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formattedDateOnly(exact) {
  const [year, month, day] = exact.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone:"UTC",
    month:"short",
    day:"numeric",
    year:"numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formattedZonedInstant(epochMs, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar:"gregory",
    numberingSystem:"latn",
    month:"short",
    day:"numeric",
    year:"numeric",
    hour:"numeric",
    minute:"2-digit",
    hour12:true,
    timeZoneName:"shortGeneric"
  }).formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  const zone = clean(parts.timeZoneName) || timeZone;
  return `${parts.month} ${parts.day}, ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${zone}`;
}

function compactSchedule(schedule = {}) {
  const exact = clean(schedule.scheduledAt);
  const channels = list(schedule.channels);
  if (schedule.scheduled !== true || !exact) {
    return {
      scheduled:false,
      scheduledAt:"",
      timezone:null,
      timezoneState:"unavailable",
      kind:"missing",
      timingState:"unavailable",
      resolvedAt:null,
      calendarDate:null,
      display:"Unscheduled",
      channels
    };
  }
  const timezone = scheduleTimezone(schedule.timezone);
  const parsed = parseStoredSchedule(exact, timezone);
  const storedDate = /^\d{4}-\d{2}-\d{2}/.exec(exact)?.[0] || null;
  const dateOnly = parsed.kind === "date_only";
  const resolvedWithTimezone = !dateOnly && parsed.epochMs !== null && timezone.state === "valid";
  const calendarDate = dateOnly
    ? storedDate
    : resolvedWithTimezone
      ? resolvedCalendarDate(parsed.epochMs, timezone.exact)
      : storedDate;
  let display;
  if (dateOnly && storedDate) display = `${formattedDateOnly(storedDate)} · Date only`;
  else if (resolvedWithTimezone) display = formattedZonedInstant(parsed.epochMs, timezone.exact);
  else if (parsed.instantState === "ambiguous") display = `${exact} · Time is ambiguous in ${timezone.exact}`;
  else if (parsed.instantState === "nonexistent") display = `${exact} · Time does not exist in ${timezone.exact}`;
  else if (timezone.state !== "valid") display = `${exact} · Timezone unavailable`;
  else display = `${exact} · Timing unavailable`;
  return {
    scheduled:true,
    scheduledAt:exact,
    timezone:timezone.exact,
    timezoneState:timezone.state,
    kind:parsed.kind,
    timingState:parsed.instantState,
    resolvedAt:parsed.epochMs !== null && !dateOnly ? new Date(parsed.epochMs).toISOString() : null,
    calendarDate,
    display,
    channels
  };
}

function compactPost(view) {
  const href = buildExactObjectLink({ objectType:"Post", sourceKind:"post", sourceId:view.id })?.target || "";
  if (!href || href !== view.href) return null;
  return {
    id:view.id,
    stableKey:view.stableKey,
    kind:"post",
    title:compactText(view.title, 160),
    summary:compactText(view.content.hook || view.content.body || "No summary available.", 280),
    status:view.status,
    topic:compactText(view.content.topic, 100),
    owner:compactText(view.content.owner, 120),
    updatedAt:view.updatedAt,
    href,
    schedule:compactSchedule(view.schedule),
    readiness:null,
    channels:{
      available:true,
      selectedChannels:list(view.channelVariants).map((variant) => ({
        key:variant.channel,
        label:variant.label,
        customized:variant.isCustomized,
        availability:{ key:"available", reason:null }
      }))
    },
    result:view.resultSummary
  };
}

function enrichPageItem(item, state, actor, now) {
  if (item?.kind !== "post") return item;
  return {
    ...item,
    readiness:compactReadiness(state, actor, item.id, now),
    channels:compactChannels(state, actor, item.id)
  };
}

function sourceTitle(record = {}) {
  return clean(record.title || record.idea || record.topic || record.hook || record.name) || "Untitled idea";
}

function compactContentBank(record = {}) {
  const id = clean(record.id || record.key || record.slug);
  const href = buildGenericItemLink({ collection:"contentBank", sourceId:id })?.target || "";
  if (!id || !href) return null;
  return {
    id,
    stableKey:`contentBank:${id}`,
    kind:"source_idea",
    title:compactText(sourceTitle(record), 160),
    summary:compactText(clean(record.summary || record.notes || record.description || record.hook) || "Source idea", 280),
    status:{ key:"source_idea", label:"Source idea" },
    topic:compactText(record.topic || record.contentBucket, 100),
    owner:compactText(record.owner, 120),
    updatedAt:clean(record.updatedAt || record.updated_at || record.createdAt || record.created_at),
    href,
    schedule:{ scheduled:false, scheduledAt:"", timezone:"", channels:[] },
    readiness:null,
    channels:{ available:false, selectedChannels:[] },
    result:null
  };
}

function convertedSourceIds(posts = []) {
  const ids = new Set();
  for (const post of posts) {
    for (const value of [post.contentBankIdeaId, post.content_bank_idea_id, post.ideaId]) {
      if (clean(value)) ids.add(clean(value));
    }
    for (const reference of [post.sourceRef, ...list(post.sourceRefs), ...list(post.sourceReferences)]) {
      if (!reference || typeof reference !== "object") continue;
      if (clean(reference.collection || reference.sourceCollection) !== "contentBank") continue;
      const id = clean(reference.itemId || reference.sourceId || reference.id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function sortItems(items) {
  return [...items].sort((left, right) =>
    clean(right.schedule?.scheduledAt || right.updatedAt).localeCompare(clean(left.schedule?.scheduledAt || left.updatedAt), "en-US")
    || left.title.localeCompare(right.title, "en-US")
    || left.stableKey.localeCompare(right.stableKey, "en-US")
  );
}

function calendarItems(posts) {
  const scheduled = posts.filter((item) => item.schedule.scheduled).sort((left, right) =>
    clean(left.schedule.calendarDate).localeCompare(clean(right.schedule.calendarDate), "en-US")
    || clean(left.schedule.resolvedAt || left.schedule.scheduledAt).localeCompare(clean(right.schedule.resolvedAt || right.schedule.scheduledAt), "en-US")
    || left.stableKey.localeCompare(right.stableKey, "en-US")
  );
  const unscheduled = sortItems(posts.filter((item) => !item.schedule.scheduled));
  return [...scheduled, ...unscheduled];
}

function itemsByView(posts, sources) {
  return {
    ideas:sortItems([...posts.filter((item) => ["idea", "draft"].includes(item.status.key)), ...sources]),
    weekly:[],
    calendar:calendarItems(posts),
    library:sortItems(posts.filter((item) => ["draft", "needs_review", "scheduled", "published"].includes(item.status.key))),
    results:sortItems(posts.filter((item) => item.status.key === "published" && item.result?.available === true))
  };
}

function optionValues(items, key) {
  return [...new Set(items.map((item) => clean(item[key])).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en-US"));
}

function channelOptions(items) {
  const options = new Map();
  for (const item of items) for (const channel of item.channels?.selectedChannels || []) options.set(channel.key, channel.label);
  return [...options].sort((left, right) => left[1].localeCompare(right[1], "en-US")).map(([key, label]) => ({ key, label }));
}

function itemDate(item) {
  return clean(item.schedule?.calendarDate || item.result?.publishedAt || item.updatedAt).slice(0, 10);
}

function filtered(items, filters) {
  return items.filter((item) => {
    if (filters.status && item.status.key !== filters.status) return false;
    if (filters.channel && !item.channels?.selectedChannels?.some((channel) => channel.key === filters.channel)) return false;
    if (filters.topic && lower(item.topic) !== filters.topic) return false;
    if (filters.owner && lower(item.owner) !== filters.owner) return false;
    const date = itemDate(item);
    if (filters.dateFrom && (!date || date < filters.dateFrom)) return false;
    if (filters.dateTo && (!date || date > filters.dateTo)) return false;
    return true;
  });
}

export function buildAuthorizedSocialHome(state = {}, actor = {}, now = "", query = {}) {
  const generatedAt = validNow(now);
  const role = clean(actor?.role) || "viewer";
  const visibleState = authorizedState(state, role);
  const postViews = buildPostViews(visibleState);
  // Build and filter inexpensive summaries for the full authorized collection, then run the
  // detail-grade readiness/channel projections only for the requested page. Those projections
  // intentionally inspect related ledgers and were previously repeated for every stored Post,
  // making a 25-item read scale like a detail endpoint over the whole collection.
  const posts = postViews.map(compactPost).filter(Boolean);
  const converted = convertedSourceIds(visibleState.posts);
  const sources = list(visibleState.contentBank)
    .filter((record) => !converted.has(clean(record.id || record.key || record.slug)))
    .map(compactContentBank)
    .filter(Boolean);
  const allItems = [...posts, ...sources];
  const viewKeys = new Set(SOCIAL_HOME_VIEWS.map((view) => view.key));
  const selectedView = safeChoice(query.view || "ideas", viewKeys) || "ideas";
  const statuses = STATUS_OPTIONS.map((status) => status.key);
  const channels = channelOptions(allItems);
  const filters = {
    status:safeChoice(query.status || "", new Set(statuses)),
    channel:safeChoice(query.channel || "", new Set(channels.map((channel) => channel.key))),
    topic:safeFacet(query.topic || ""),
    owner:safeFacet(query.owner || ""),
    dateFrom:safeDate(query.dateFrom || ""),
    dateTo:safeDate(query.dateTo || "")
  };
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new SocialHomeValidationError("The Social date range is invalid.");
  const views = itemsByView(posts, sources);
  const matching = filtered(views[selectedView], filters);
  const offset = cursorValue(query.cursor);
  const limit = limitValue(query.limit);
  const page = matching.slice(offset, offset + limit)
    .map((item) => enrichPageItem(item, visibleState, actor, generatedAt));
  const nextOffset = offset + page.length;
  const createPostDecision = actor?.authenticated === true
    ? canPerformEndpoint(role, "POST", GLOBAL_CREATE_ENDPOINTS.post)
    : { ok:false };
  const calendarGroupItems = selectedView === "calendar" ? matching : views.calendar;
  const calendarScheduled = calendarGroupItems.filter((item) => item.schedule.scheduled).length;
  return deepFreeze({
    ok:true,
    generatedAt,
    selectedView,
    views:SOCIAL_HOME_VIEWS.map((view) => ({ ...view, count:views[view.key].length })),
    sourceAvailability:{ posts:Array.isArray(state.posts), contentBank:Array.isArray(state.contentBank) },
    filters:{
      statuses:STATUS_OPTIONS.map((status) => ({ ...status })),
      channels,
      topics:optionValues(allItems, "topic"),
      owners:optionValues(allItems, "owner")
    },
    activeFilters:filters,
    counts:{ total:views[selectedView].length, filtered:matching.length, returned:page.length },
    calendarGroups:{ scheduled:calendarScheduled, unscheduled:calendarGroupItems.length - calendarScheduled },
    items:page,
    nextCursor:nextOffset < matching.length ? `social-${nextOffset}` : null,
    truncated:nextOffset < matching.length,
    capabilities:{
      createsPost:createPostDecision.ok === true,
      createPostReason:createPostDecision.ok === true ? null : "This account can view Social but cannot create Posts.",
      mutatesSource:false,
      schedules:false,
      approves:false,
      publishes:false,
      regenerates:false
    }
  });
}
