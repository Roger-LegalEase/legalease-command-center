import crypto from "node:crypto";
import { createGlobalObject } from "./global-create-service.mjs";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { normalizeComposerPatch } from "./post-composer-service.mjs";
import { roleHasCapability } from "./roles.mjs";
import { planSocialVariantMutation, SOCIAL_CHANNELS } from "./social-variant-actions.mjs";
import { buildPostChannelVariants, normalizePostChannel } from "./ui/view-models/post-channel-variants.mjs";
import { buildExactObjectLink } from "./ui/route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const REQUEST_PATTERN = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\s*\/?\s*(?:script|iframe|object|embed|svg)|\bon\w+\s*=/iu;
const PLAN_INPUT_KEYS = new Set(["requestId", "week", "objective", "themes", "inputs", "posts", "postDrafts"]);
const POST_INPUT_KEYS = new Set(["title", "idea", "status", "shared", "selectedChannels", "platforms", "variants"]);
const VARIANT_FIELDS = Object.freeze(["headline", "body", "hook", "cta", "hashtags"]);
const INPUT_FIELDS = Object.freeze(["proof", "announcement", "customerInsight", "partnerStory", "educationalIdea", "cta"]);

export const SOCIAL_WEEKLY_PLANNER_READ_COLLECTIONS = Object.freeze([
  "activityEvents",
  "auditHistory",
  "posts"
]);

export const SOCIAL_WEEKLY_STATUSES = Object.freeze([
  "planned",
  "drafting",
  "ready",
  "published_manually",
  "needs_results",
  "archived"
]);

export const SOCIAL_WEEKLY_STATUS_OPTIONS = Object.freeze([
  Object.freeze({ key:"planned", label:"Planned" }),
  Object.freeze({ key:"drafting", label:"Drafting" }),
  Object.freeze({ key:"ready", label:"Ready" }),
  Object.freeze({ key:"published_manually", label:"Published manually" }),
  Object.freeze({ key:"needs_results", label:"Needs results" }),
  Object.freeze({ key:"archived", label:"Archived" })
]);

export const SOCIAL_WEEKLY_CHANNELS = Object.freeze([...SOCIAL_CHANNELS]);

export class SocialWeeklyPlannerError extends Error {
  constructor(message, status = 400, outcome = "validation_error", field = "") {
    super(message);
    this.name = "SocialWeeklyPlannerError";
    this.status = status;
    this.outcome = outcome;
    this.field = field;
    this.safeMessage = message;
  }
}

function fail(message, status = 400, outcome = "validation_error", field = "") {
  throw new SocialWeeklyPlannerError(message, status, outcome, field);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function text(value, label, maximum, options = {}) {
  if (value === undefined || value === null) {
    if (options.required) fail(`${label} is required.`, 400, "validation_error", options.field || "");
    return "";
  }
  if (typeof value !== "string") fail(`${label} is invalid.`, 400, "validation_error", options.field || "");
  const result = clean(value);
  if ((options.required && !result) || result.length > maximum || UNSAFE_TEXT.test(result)) {
    fail(`${label} is invalid or too long.`, 400, "validation_error", options.field || "");
  }
  return result;
}

function requestId(value = "") {
  const id = text(value, "Request identifier", 95, { required:true, field:"requestId" });
  if (!REQUEST_PATTERN.test(id)) fail("The weekly plan request is invalid. No changes were made.", 400, "validation_error", "requestId");
  return id;
}

function nowIso(value = "") {
  const parsed = Date.parse(clean(value || new Date().toISOString()));
  if (!Number.isFinite(parsed)) fail("A valid server timestamp is required.");
  return new Date(parsed).toISOString();
}

function validDate(value = "", field = "week") {
  const date = text(value, "Week", 10, { required:true, field });
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const parsed = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : null;
  if (!match || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() !== Number(match[2]) - 1 || parsed.getUTCDate() !== Number(match[3])) {
    fail("Choose a valid week.", 400, "validation_error", field);
  }
  return parsed;
}

export function socialWeekRange(value = "") {
  const chosen = validDate(value);
  const mondayOffset = (chosen.getUTCDay() + 6) % 7;
  const start = new Date(chosen.getTime() - mondayOffset * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return deepFreeze({
    start:start.toISOString().slice(0, 10),
    end:end.toISOString().slice(0, 10),
    id:`social-week-${start.toISOString().slice(0, 10)}`
  });
}

function assertRead(actor = {}) {
  if (actor?.authenticated !== true || !clean(actor.id)) fail("Sign in again to open the Social plan.", 401, "session_expired");
  if (!roleHasCapability(actor.role, "read_internal")) fail("This Social plan is unavailable.", 403, "unauthorized");
}

function assertWrite(actor = {}) {
  assertRead(actor);
  if (!roleHasCapability(actor.role, "manage_content_drafts")) fail("This account cannot change Social drafts.", 403, "unauthorized");
}

function actorName(actor = {}) {
  return clean(actor.label || actor.displayName || actor.name || actor.id) || "Owner";
}

function exactPost(state, actor, postId) {
  const id = text(postId, "Post identifier", 240, { required:true, field:"postId" });
  const matches = list(state.posts).filter((post) => clean(post.id) === id && recordVisibleToActor(post, actor.role));
  if (matches.length !== 1 || !clean(matches[0].socialWeekStart || matches[0].weeklyPlanId)) {
    fail("This weekly Social draft is unavailable.", 404, "not_available");
  }
  return matches[0];
}

function statusValue(value = "planned") {
  const status = lower(value).replaceAll(/[ -]+/g, "_");
  if (!SOCIAL_WEEKLY_STATUSES.includes(status)) fail("Choose a supported Social status.", 400, "validation_error", "status");
  return status;
}

function canonicalPostStatus(weeklyStatus) {
  if (weeklyStatus === "planned") return "idea";
  if (["published_manually", "needs_results"].includes(weeklyStatus)) return "manually_posted";
  if (weeklyStatus === "archived") return "archived";
  return "draft";
}

function themesValue(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) fail("Choose one to three themes.", 400, "validation_error", "themes");
  const themes = [...new Set(value.map((theme) => text(theme, "Theme", 100, { required:true, field:"themes" })) )];
  if (themes.length !== value.length) fail("Choose distinct themes.", 400, "validation_error", "themes");
  return themes;
}

function planInputs(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Weekly inputs are invalid.", 400, "validation_error", "inputs");
  if (Object.keys(value).some((key) => !INPUT_FIELDS.includes(key))) fail("Weekly inputs contain unsupported information.", 400, "validation_error", "inputs");
  return Object.fromEntries(INPUT_FIELDS.map((field) => [field, text(value[field], field === "cta" ? "Call to action" : "Weekly input", 1200, { field:`inputs.${field}` })]));
}

function hashtagsValue(value, field = "hashtags") {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) fail("Hashtags are invalid.", 400, "validation_error", field);
  return [...new Set(value.map((hashtag) => text(hashtag, "Hashtag", 100, { required:true, field })) )];
}

function sharedContent(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Shared Post copy is invalid.", 400, "validation_error", "shared");
  if (Object.keys(value).some((key) => !VARIANT_FIELDS.includes(key))) fail("Shared Post copy contains unsupported information.", 400, "validation_error", "shared");
  return {
    headline:text(value.headline, "Shared headline", 200, { field:"shared.headline" }),
    body:text(value.body, "Shared body", 5000, { field:"shared.body" }),
    hook:text(value.hook, "Shared hook", 500, { field:"shared.hook" }),
    cta:text(value.cta, "Shared call to action", 300, { field:"shared.cta" }),
    hashtags:hashtagsValue(value.hashtags, "shared.hashtags")
  };
}

function channelsValue(value, field = "selectedChannels") {
  if (!Array.isArray(value) || value.length < 1 || value.length > SOCIAL_CHANNELS.length) fail("Choose at least one supported platform.", 400, "validation_error", field);
  const channels = [...new Set(value.map(normalizePostChannel))];
  if (channels.length !== value.length || channels.some((channel) => !SOCIAL_CHANNELS.includes(channel))) {
    fail("Choose distinct supported platforms.", 400, "validation_error", field);
  }
  return SOCIAL_CHANNELS.filter((channel) => channels.includes(channel));
}

function variantContent(raw = {}, channel = "") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Platform copy is invalid.", 400, "validation_error", "variants");
  const allowed = new Set(["channel", "platform", ...VARIANT_FIELDS]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) fail("Platform copy contains unsupported information.", 400, "validation_error", "variants");
  return {
    channel,
    headline:text(raw.headline, "Platform headline", 200, { field:`variants.${channel}.headline` }),
    body:text(raw.body, "Platform body", 12_000, { field:`variants.${channel}.body` }),
    hook:text(raw.hook, "Platform hook", 500, { field:`variants.${channel}.hook` }),
    cta:text(raw.cta, "Platform call to action", 300, { field:`variants.${channel}.cta` }),
    hashtags:hashtagsValue(raw.hashtags, `variants.${channel}.hashtags`)
  };
}

function variantsValue(value, channels) {
  if (value !== undefined && !Array.isArray(value)) fail("Platform variants must be a list.", 400, "validation_error", "variants");
  const byChannel = new Map();
  for (const raw of list(value)) {
    const channel = normalizePostChannel(raw.channel || raw.platform);
    if (!SOCIAL_CHANNELS.includes(channel) || !channels.includes(channel) || byChannel.has(channel)) {
      fail("Platform variants must be unique and selected.", 400, "validation_error", "variants");
    }
    byChannel.set(channel, variantContent(raw, channel));
  }
  return channels.map((channel) => byChannel.get(channel) || variantContent({}, channel));
}

function independentReadyCopy(channels, variants) {
  const bodies = [];
  const missing = [];
  for (const channel of channels) {
    const body = clean(variants.find((variant) => variant.channel === channel)?.body);
    if (!body) missing.push(channel);
    else bodies.push(lower(body).replaceAll(/\s+/g, " "));
  }
  const duplicates = bodies.length !== new Set(bodies).size;
  return { ready:missing.length === 0 && !duplicates, missing, duplicates };
}

function normalizedPostInput(raw = {}, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`Post ${index + 1} is invalid.`, 400, "validation_error", "posts");
  if (Object.keys(raw).some((key) => !POST_INPUT_KEYS.has(key))) fail(`Post ${index + 1} contains unsupported information.`, 400, "validation_error", "posts");
  const title = text(raw.title || raw.idea, `Post ${index + 1} title`, 160, { required:true, field:`posts.${index}.title` });
  const status = statusValue(raw.status || "planned");
  if (["published_manually", "needs_results"].includes(status)) fail("Record manual publication after saving the draft.", 400, "validation_error", `posts.${index}.status`);
  const shared = sharedContent(raw.shared || {});
  const selectedChannels = channelsValue(raw.selectedChannels || raw.platforms, `posts.${index}.selectedChannels`);
  const variants = variantsValue(raw.variants, selectedChannels);
  const readiness = independentReadyCopy(selectedChannels, variants);
  if (status === "ready" && !readiness.ready) {
    fail(readiness.duplicates ? "Ready Posts need independently edited copy for each platform." : "Ready Posts need copy for every selected platform.", 400, "validation_error", `posts.${index}.variants`);
  }
  return { title, status, shared, selectedChannels, variants, readiness };
}

function parsedPlanInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("The weekly plan is invalid.");
  if (Object.keys(input).some((key) => !PLAN_INPUT_KEYS.has(key))) fail("The weekly plan contains unsupported information.");
  if (input.posts !== undefined && input.postDrafts !== undefined) fail("Use one Post draft list.", 400, "validation_error", "posts");
  const posts = input.posts ?? input.postDrafts;
  if (!Array.isArray(posts) || posts.length < 1 || posts.length > 12) fail("Create between one and twelve Post drafts.", 400, "validation_error", "posts");
  return {
    requestId:requestId(input.requestId),
    range:socialWeekRange(input.week),
    objective:text(input.objective, "Main business objective", 1000, { required:true, field:"objective" }),
    themes:themesValue(input.themes),
    inputs:planInputs(input.inputs || {}),
    posts:posts.map(normalizedPostInput)
  };
}

function derivedCreationRequestId(planRequestId, index) {
  return `weekly_post_${crypto.createHash("sha256").update(`${planRequestId}:${index}`).digest("hex").slice(0, 24)}`;
}

function postRecordFrom(created, plan, post, index, actor, now) {
  const variants = post.variants.map((variant) => ({
    id:`${created.id}:${variant.channel}`,
    channel:variant.channel,
    ...(variant.headline ? { headline:variant.headline } : {}),
    ...(variant.body ? { body:variant.body } : {}),
    ...(variant.hook ? { hook:variant.hook } : {}),
    ...(variant.cta ? { cta:variant.cta } : {}),
    ...(variant.hashtags.length ? { hashtags:variant.hashtags } : {}),
    explicitBlankFields:[]
  }));
  return {
    ...created,
    _version:1,
    title:post.title,
    headline:post.shared.headline || post.title,
    body:post.shared.body,
    hook:post.shared.hook,
    cta:post.shared.cta,
    hashtags:post.shared.hashtags,
    targetChannels:post.selectedChannels,
    channelVariants:variants,
    status:canonicalPostStatus(post.status),
    weeklyStatus:post.status,
    weeklyPlanId:plan.range.id,
    weeklyPlanRequestId:plan.requestId,
    weeklyPlanPostIndex:index,
    socialWeekStart:plan.range.start,
    socialWeekEnd:plan.range.end,
    weeklyObjective:plan.objective,
    weeklyThemes:plan.themes,
    weeklyInputs:plan.inputs,
    contentType:"weekly_social_plan",
    createdVia:"Social weekly planner",
    owner:actorName(actor),
    approvalStatus:"not_requested",
    copyReviewed:post.status === "ready",
    scheduledFor:"",
    publishedAt:"",
    autoPublish:false,
    liveMode:false,
    updatedAt:now
  };
}

function appendPlanEvidence(state, plan, actor, now) {
  const activity = {
    id:`activity-social-week-created-${plan.requestId.toLowerCase()}`,
    eventType:"Social weekly plan created",
    title:`Social plan for ${plan.range.start}`,
    summary:`Created ${plan.posts.length} internal Social draft${plan.posts.length === 1 ? "" : "s"}.`,
    relatedObjectType:"social_week",
    relatedObjectId:plan.range.id,
    metadata:{ postCount:plan.posts.length, externalSideEffects:false, postingProviderCalled:false },
    createdAt:now
  };
  const audit = {
    id:`audit-social-week-created-${plan.requestId.toLowerCase()}`,
    timestamp:now,
    actor:clean(actor.id || actor.role),
    action:"social_weekly_plan_created",
    resourceType:"social_week",
    resourceId:plan.range.id,
    afterValue:{ weekStart:plan.range.start, postCount:plan.posts.length },
    externalSideEffects:false,
    postingProviderCalled:false
  };
  return {
    ...state,
    activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500),
    auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000)
  };
}

function changedCollections(before, after, names) {
  return Object.fromEntries(names.filter((name) => before[name] !== after[name]).map((name) => [name, after[name]]));
}

function weeklyPosts(state, actor, range) {
  return list(state.posts).filter((post) => recordVisibleToActor(post, actor.role) && clean(post.socialWeekStart) === range.start);
}

export function createWeeklySocialPlan(state = {}, actor = {}, input = {}, options = {}) {
  assertWrite(actor);
  const plan = parsedPlanInput(input);
  const now = nowIso(options.now);
  const replay = list(state.posts).filter((post) => clean(post.weeklyPlanRequestId) === plan.requestId);
  if (replay.length) {
    if (replay.length !== plan.posts.length || replay.some((post) => clean(post.socialWeekStart) !== plan.range.start)) {
      fail("The weekly plan request conflicts with saved drafts. No changes were made.", 409, "conflict");
    }
    return {
      ok:true,
      state,
      collections:{},
      plan:buildWeeklySocialPlan(state, actor, plan.range.start, { now }),
      alreadyExisted:true,
      externalActions:0,
      message:"Weekly Social plan already saved."
    };
  }
  if (weeklyPosts(state, actor, plan.range).length) fail("A Social plan already exists for this week.", 409, "week_exists", "week");
  let next = state;
  const records = [];
  for (const [index, post] of plan.posts.entries()) {
    const created = createGlobalObject(next, "post", {
      creationRequestId:derivedCreationRequestId(plan.requestId, index),
      title:post.title,
      draftCopy:post.shared.body,
      channel:""
    }, { actor, now, initialPostStatus:"idea" });
    if (created.result.alreadyExisted) fail("The weekly plan request conflicts with an existing Post. No changes were made.", 409, "conflict");
    next = created.state;
    const record = postRecordFrom(created.record, plan, post, index, actor, now);
    next = { ...next, posts:list(next.posts).map((item) => clean(item.id) === clean(created.record.id) ? record : item) };
    records.push(record);
  }
  next = appendPlanEvidence(next, plan, actor, now);
  return {
    ok:true,
    state:next,
    collections:changedCollections(state, next, ["posts", "activityEvents", "auditHistory"]),
    plan:buildWeeklySocialPlan(next, actor, plan.range.start, { now }),
    posts:records.map((post) => ({ id:post.id, version:post._version })),
    alreadyExisted:false,
    externalActions:0,
    message:"Weekly Social plan saved. Nothing was posted."
  };
}

function statusProjection(post = {}) {
  const stored = lower(post.weeklyStatus).replaceAll(/[ -]+/g, "_");
  if (SOCIAL_WEEKLY_STATUSES.includes(stored)) return stored;
  if (lower(post.status) === "archived") return "archived";
  const published = /posted|published/.test(lower(post.status)) || Boolean(clean(post.publishedAt || post.published_at));
  if (published) {
    const hasResults = post.performance && Object.values(post.performance).some((value) => Number.isFinite(Number(value)));
    return hasResults ? "published_manually" : "needs_results";
  }
  if (post.copyReviewed === true) return "ready";
  return clean(post.body) || list(post.channelVariants).some((variant) => clean(variant.body)) ? "drafting" : "planned";
}

function compactVariant(variant = {}) {
  const value = (field) => {
    const fieldValue = variant.content?.[field]?.value;
    if (field === "hashtags") return Array.isArray(fieldValue) ? fieldValue : [];
    return clean(fieldValue);
  };
  return {
    channel:variant.channel,
    label:variant.label,
    selected:variant.selected === true,
    independentlyEdited:variant.customized === true && variant.content?.body?.source === "variant",
    headline:value("headline"),
    body:value("body"),
    hook:value("hook"),
    cta:value("cta"),
    hashtags:value("hashtags"),
    availability:variant.availability
  };
}

function safeHttpsUrl(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  let url;
  try { url = new URL(raw); }
  catch { return ""; }
  if (url.protocol !== "https:" || url.username || url.password || /[?&](?:token|signature|sig|key|credential)=/iu.test(url.search)) return "";
  return url.toString();
}

function postProjection(state, actor, post) {
  const channels = buildPostChannelVariants(state, actor, post.id);
  const variants = list(channels.variants).filter((variant) => variant.selected).map(compactVariant);
  const status = statusProjection(post);
  const statusOption = SOCIAL_WEEKLY_STATUS_OPTIONS.find((option) => option.key === status);
  const publishedUrls = post.perChannelPublishedUrl || post.per_channel_published_url || {};
  const publicationStatuses = post.perChannelPublishStatus || post.per_channel_publish_status || {};
  return {
    id:post.id,
    version:Number.isSafeInteger(Number(post._version ?? post.version)) ? Number(post._version ?? post.version) : null,
    title:clean(post.title || post.headline) || "Untitled Post",
    status:{ ...statusOption },
    href:buildExactObjectLink({ objectType:"Post", sourceKind:"post", sourceId:post.id })?.target || "",
    selectedChannels:variants.map((variant) => ({ key:variant.channel, label:variant.label })),
    variants,
    independentlyEdited:variants.length > 0 && variants.every((variant) => variant.independentlyEdited) && new Set(variants.map((variant) => lower(variant.body).replaceAll(/\s+/g, " "))).size === variants.length,
    publication:{
      allRecorded:variants.length > 0 && variants.every((variant) => /posted|published/.test(lower(publicationStatuses[variant.channel]))),
      channels:variants.map((variant) => ({
        channel:variant.channel,
        label:variant.label,
        status:clean(publicationStatuses[variant.channel]) || "Not recorded",
        url:safeHttpsUrl(publishedUrls[variant.channel])
      }))
    },
    updatedAt:clean(post.updatedAt || post.updated_at),
    capabilities:{ edit:roleHasCapability(actor.role, "manage_content_drafts"), postAutomatically:false }
  };
}

function copyAllText(posts = []) {
  return posts.map((post) => [
    post.title,
    ...post.variants.map((variant) => [
      variant.label,
      variant.headline,
      variant.hook,
      variant.body,
      variant.cta,
      variant.hashtags.join(" ")
    ].filter(Boolean).join("\n"))
  ].filter(Boolean).join("\n\n")).join("\n\n---\n\n");
}

function exportedObject(plan = {}) {
  return {
    week:{ start:plan.week.start, end:plan.week.end },
    objective:plan.objective,
    themes:plan.themes,
    inputs:plan.inputs,
    posts:plan.posts.map((post) => ({
      title:post.title,
      status:post.status.label,
      platforms:post.variants.map((variant) => ({
        platform:variant.label,
        headline:variant.headline,
        hook:variant.hook,
        body:variant.body,
        cta:variant.cta,
        hashtags:variant.hashtags
      }))
    }))
  };
}

export function exportWeeklySocialPlan(plan = {}, format = "markdown") {
  if (!plan?.ok || !plan.week || !Array.isArray(plan.posts)) fail("The weekly Social plan is unavailable.", 400, "not_available");
  if (format === "text") return plan.copyAllText;
  if (format === "json") return JSON.stringify(exportedObject(plan), null, 2);
  if (format !== "markdown") fail("Choose a supported Social export format.", 400, "validation_error", "format");
  const output = exportedObject(plan);
  const lines = [
    `# Social plan · ${output.week.start} to ${output.week.end}`,
    "",
    `Objective: ${output.objective || "Not set"}`,
    `Themes: ${output.themes.join(", ") || "Not set"}`,
    ""
  ];
  for (const post of output.posts) {
    lines.push(`## ${post.title}`, "", `Status: ${post.status}`, "");
    for (const variant of post.platforms) {
      lines.push(`### ${variant.platform}`, "", variant.headline, variant.hook, variant.body, variant.cta, variant.hashtags.join(" "), "");
    }
  }
  return lines.filter((line, index, values) => line !== "" || values[index - 1] !== "").join("\n").trim();
}

export function buildWeeklySocialPlan(state = {}, actor = {}, week = "", options = {}) {
  assertRead(actor);
  const range = socialWeekRange(week);
  const now = nowIso(options.now);
  const rawPosts = weeklyPosts(state, actor, range).sort((left, right) => Number(left.weeklyPlanPostIndex ?? 999) - Number(right.weeklyPlanPostIndex ?? 999) || clean(left.id).localeCompare(clean(right.id)));
  const first = rawPosts[0] || {};
  const objective = clean(first.weeklyObjective);
  const themes = list(first.weeklyThemes).map(clean).filter(Boolean).slice(0, 3);
  const inputs = Object.fromEntries(INPUT_FIELDS.map((field) => [field, clean(first.weeklyInputs?.[field])]));
  const consistent = rawPosts.every((post) => clean(post.weeklyObjective) === objective && JSON.stringify(list(post.weeklyThemes)) === JSON.stringify(list(first.weeklyThemes)));
  const posts = rawPosts.map((post) => postProjection(state, actor, post));
  const counts = Object.fromEntries(SOCIAL_WEEKLY_STATUSES.map((status) => [status, posts.filter((post) => post.status.key === status).length]));
  const result = {
    ok:true,
    generatedAt:now,
    planId:range.id,
    week:{ ...range },
    objective:objective || null,
    themes,
    inputs,
    contextConsistent:consistent,
    statuses:SOCIAL_WEEKLY_STATUS_OPTIONS.map((status) => ({ ...status, count:counts[status.key] })),
    counts:{ posts:posts.length, ...counts },
    posts,
    copyAllText:copyAllText(posts),
    safety:{ automaticPosting:false, providerCalls:0, message:"Copy or export these drafts for manual posting." },
    capabilities:{ create:roleHasCapability(actor.role, "manage_content_drafts"), edit:roleHasCapability(actor.role, "manage_content_drafts"), copy:true, export:true, postAutomatically:false }
  };
  return deepFreeze(result);
}

const UPDATE_KEYS = new Set(["requestId", "expectedVersion", "status", "fields", "selectedChannels", "variants", "confirmCustomizedRemoval"]);

function updateEvidence(state, post, actor, request, now, summary) {
  const activity = {
    id:`activity-social-week-update-${request.toLowerCase()}`,
    eventType:"Social weekly draft updated",
    title:post.title || "Social draft updated",
    summary,
    relatedObjectType:"post",
    relatedObjectId:post.id,
    metadata:{ weeklyPlanId:post.weeklyPlanId, externalSideEffects:false, postingProviderCalled:false },
    createdAt:now
  };
  const audit = {
    id:`audit-social-week-update-${request.toLowerCase()}`,
    timestamp:now,
    actor:clean(actor.id || actor.role),
    action:"social_weekly_draft_updated",
    resourceType:"post",
    resourceId:post.id,
    externalSideEffects:false,
    postingProviderCalled:false
  };
  return {
    ...state,
    activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500),
    auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000)
  };
}

export function updateWeeklySocialPost(state = {}, actor = {}, postId = "", input = {}, options = {}) {
  assertWrite(actor);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !UPDATE_KEYS.has(key))) fail("The Social draft update is invalid.");
  const request = requestId(input.requestId);
  const activityId = `activity-social-week-update-${request.toLowerCase()}`;
  if (list(state.activityEvents).some((event) => clean(event.id) === activityId)) {
    const unchanged = exactPost(state, actor, postId);
    return { ok:true, state, collections:{}, post:postProjection(state, actor, unchanged), alreadyExisted:true, externalActions:0, message:"Social draft already saved." };
  }
  const post = exactPost(state, actor, postId);
  if (!Number.isSafeInteger(input.expectedVersion) || Number(post._version ?? post.version) !== input.expectedVersion) fail("The Post changed. Refresh and try again.", 409, "version_conflict");
  const status = statusValue(input.status || post.weeklyStatus || "drafting");
  if (["published_manually", "needs_results"].includes(status)) fail("Use the manual publication action to record a published Post.", 400, "validation_error", "status");
  let sharedPatch = {};
  let variantPlan;
  try {
    sharedPatch = input.fields === undefined ? {} : normalizeComposerPatch({ fields:input.fields });
    const selectedChannels = channelsValue(input.selectedChannels === undefined ? list(post.targetChannels) : input.selectedChannels);
    variantPlan = planSocialVariantMutation(state, actor, post.id, {
      expectedVersion:input.expectedVersion,
      requestId:request,
      selectedChannels,
      variants:list(input.variants),
      confirmCustomizedRemoval:input.confirmCustomizedRemoval === true
    });
  } catch (error) {
    if (error instanceof SocialWeeklyPlannerError) throw error;
    fail(clean(error?.message) || "The platform copy is invalid.", Number(error?.status) || 400, clean(error?.outcome) || "validation_error");
  }
  const now = nowIso(options.now);
  let updated = {
    ...post,
    ...sharedPatch,
    targetChannels:variantPlan.selectedChannels,
    channelVariants:variantPlan.channelVariants,
    weeklyStatus:status,
    status:canonicalPostStatus(status),
    copyReviewed:status === "ready",
    _version:input.expectedVersion + 1,
    updatedAt:now
  };
  if (status === "ready") {
    const selected = list(updated.targetChannels);
    const readiness = independentReadyCopy(selected, list(updated.channelVariants).map((variant) => ({ channel:normalizePostChannel(variant.channel), body:Object.prototype.hasOwnProperty.call(variant, "body") ? clean(variant.body) : "" })));
    if (!readiness.ready) fail(readiness.duplicates ? "Ready Posts need independently edited copy for each platform." : "Ready Posts need copy for every selected platform.", 400, "validation_error", "variants");
  }
  let next = { ...state, posts:list(state.posts).map((item) => clean(item.id) === post.id ? updated : item) };
  next = updateEvidence(next, updated, actor, request, now, "Saved independent platform copy in the weekly Social plan.");
  return {
    ok:true,
    state:next,
    collections:changedCollections(state, next, ["posts", "activityEvents", "auditHistory"]),
    post:postProjection(next, actor, updated),
    alreadyExisted:false,
    externalActions:0,
    message:"Social draft saved. Nothing was posted."
  };
}

const PUBLICATION_KEYS = new Set(["requestId", "expectedVersion", "channel", "publishedUrl"]);

export function recordWeeklySocialPublication(state = {}, actor = {}, postId = "", input = {}, options = {}) {
  assertWrite(actor);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !PUBLICATION_KEYS.has(key))) fail("The publication record is invalid.");
  const request = requestId(input.requestId);
  const activityId = `activity-social-week-manual-publication-${request.toLowerCase()}`;
  if (list(state.activityEvents).some((event) => clean(event.id) === activityId)) {
    const unchanged = exactPost(state, actor, postId);
    return { ok:true, state, collections:{}, post:postProjection(state, actor, unchanged), alreadyExisted:true, externalActions:0, message:"Manual publication already recorded." };
  }
  const post = exactPost(state, actor, postId);
  if (!Number.isSafeInteger(input.expectedVersion) || Number(post._version ?? post.version) !== input.expectedVersion) fail("The Post changed. Refresh and try again.", 409, "version_conflict");
  if (statusProjection(post) === "archived") fail("Reopen the archived Post before recording publication.", 409, "archived");
  const channel = normalizePostChannel(input.channel);
  if (!SOCIAL_CHANNELS.includes(channel) || !list(post.targetChannels).map(normalizePostChannel).includes(channel)) fail("Choose a selected platform.", 400, "validation_error", "channel");
  const url = safeHttpsUrl(text(input.publishedUrl, "Published URL", 1500, { required:true, field:"publishedUrl" }));
  if (!url) fail("Add a valid HTTPS published URL.", 400, "validation_error", "publishedUrl");
  const now = nowIso(options.now);
  const statuses = { ...(post.perChannelPublishStatus || post.per_channel_publish_status || {}), [channel]:"posted_manually" };
  const urls = { ...(post.perChannelPublishedUrl || post.per_channel_published_url || {}), [channel]:url };
  const selected = list(post.targetChannels).map(normalizePostChannel).filter(Boolean);
  const allRecorded = selected.length > 0 && selected.every((item) => /posted|published/.test(lower(statuses[item])));
  const updated = {
    ...post,
    perChannelPublishStatus:statuses,
    perChannelPublishedUrl:urls,
    status:allRecorded ? "manually_posted" : "draft",
    weeklyStatus:allRecorded ? "needs_results" : "ready",
    ...(allRecorded ? { publishedAt:now, publishedUrl:selected.length === 1 ? url : "" } : {}),
    manualPublicationRecorded:true,
    autoPublish:false,
    _version:input.expectedVersion + 1,
    updatedAt:now
  };
  const activity = {
    id:activityId,
    eventType:"Manual Social publication recorded",
    title:`${channel} publication recorded`,
    summary:"The owner recorded a Post published outside the Command Center.",
    relatedObjectType:"post",
    relatedObjectId:post.id,
    createdAt:now,
    metadata:{ channel, publishedUrl:url, externalSideEffects:false, postedByApplication:false, postingProviderCalled:false }
  };
  const audit = {
    id:`audit-social-week-manual-publication-${request.toLowerCase()}`,
    timestamp:now,
    actor:clean(actor.id || actor.role),
    action:"manual_social_publication_recorded",
    resourceType:"post",
    resourceId:post.id,
    afterValue:{ channel, allRecorded },
    externalSideEffects:false,
    postedByApplication:false
  };
  const next = {
    ...state,
    posts:list(state.posts).map((item) => clean(item.id) === post.id ? updated : item),
    activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500),
    auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000)
  };
  return {
    ok:true,
    state:next,
    collections:changedCollections(state, next, ["posts", "activityEvents", "auditHistory"]),
    post:postProjection(next, actor, updated),
    allPlatformsRecorded:allRecorded,
    nextStep:allRecorded ? "Add results when they are available." : "Record the remaining platform URLs after posting.",
    alreadyExisted:false,
    externalActions:0,
    message:"Manual publication recorded. Nothing was posted by LegalEase."
  };
}

const RESULT_KEYS = new Set(["requestId", "expectedVersion", "impressions", "likes", "comments", "shares", "saves", "clicks", "reposts", "engagementRate"]);
const METRIC_FIELDS = Object.freeze(["impressions", "likes", "comments", "shares", "saves", "clicks", "reposts", "engagementRate"]);

export function recordWeeklySocialResults(state = {}, actor = {}, postId = "", input = {}, options = {}) {
  assertWrite(actor);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !RESULT_KEYS.has(key))) fail("The Social results are invalid.");
  const request = requestId(input.requestId);
  const activityId = `activity-social-week-results-${request.toLowerCase()}`;
  if (list(state.activityEvents).some((event) => clean(event.id) === activityId)) {
    const unchanged = exactPost(state, actor, postId);
    return { ok:true, state, collections:{}, post:postProjection(state, actor, unchanged), alreadyExisted:true, externalActions:0, message:"Social results already saved." };
  }
  const post = exactPost(state, actor, postId);
  if (!Number.isSafeInteger(input.expectedVersion) || Number(post._version ?? post.version) !== input.expectedVersion) fail("The Post changed. Refresh and try again.", 409, "version_conflict");
  if (!/posted|published/.test(lower(post.status)) && !clean(post.publishedAt)) fail("Record the manual publication before adding results.", 409, "publication_required");
  const metrics = {};
  for (const field of METRIC_FIELDS) {
    if (input[field] === undefined || input[field] === "") continue;
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < 0 || (field !== "engagementRate" && !Number.isInteger(value))) fail("Social result values must be zero or greater.", 400, "validation_error", field);
    metrics[field] = value;
  }
  if (!Object.keys(metrics).length) fail("Add at least one Social result.", 400, "validation_error", "results");
  const now = nowIso(options.now);
  const updated = {
    ...post,
    performance:{ ...(post.performance || {}), ...metrics },
    weeklyStatus:"published_manually",
    resultsRecordedAt:now,
    _version:input.expectedVersion + 1,
    updatedAt:now
  };
  const activity = {
    id:activityId,
    eventType:"Social results recorded",
    title:`Results added: ${post.title || "Social Post"}`,
    summary:"Manual Social performance was recorded.",
    relatedObjectType:"post",
    relatedObjectId:post.id,
    createdAt:now,
    metadata:{ fields:Object.keys(metrics), externalSideEffects:false, postingProviderCalled:false }
  };
  const audit = {
    id:`audit-social-week-results-${request.toLowerCase()}`,
    timestamp:now,
    actor:clean(actor.id || actor.role),
    action:"social_results_recorded",
    resourceType:"post",
    resourceId:post.id,
    externalSideEffects:false
  };
  const next = {
    ...state,
    posts:list(state.posts).map((item) => clean(item.id) === post.id ? updated : item),
    activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500),
    auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000)
  };
  return {
    ok:true,
    state:next,
    collections:changedCollections(state, next, ["posts", "activityEvents", "auditHistory"]),
    post:postProjection(next, actor, updated),
    alreadyExisted:false,
    externalActions:0,
    message:"Social results saved."
  };
}

export function socialWeeklyPlannerSafeError(error = {}) {
  const known = error instanceof SocialWeeklyPlannerError || typeof error?.safeMessage === "string";
  const status = [400, 401, 403, 404, 409, 413].includes(Number(error?.status)) ? Number(error.status) : 500;
  return deepFreeze({
    status,
    body:{
      ok:false,
      outcome:known ? clean(error.outcome) || "validation_error" : "temporary_failure",
      ...(known && clean(error.field) ? { field:clean(error.field) } : {}),
      message:known ? clean(error.safeMessage || error.message) : "The weekly Social plan could not be updated. No changes were made."
    }
  });
}
