import { roleHasCapability } from "./roles.mjs";
import { buildPostChannelVariants, normalizePostChannel } from "./ui/view-models/post-channel-variants.mjs";

export const SOCIAL_VARIANTS_ENDPOINT = "/api/ui/social/post/:postId/variants";
export const SOCIAL_CHANNELS = Object.freeze(["linkedin", "instagram", "facebook", "x", "threads"]);
const FIELDS = Object.freeze(["headline", "body", "hook", "cta", "hashtags"]);
const clean = (value = "") => String(value ?? "").trim();

function fail(message, status = 400, outcome = "validation_error") { throw Object.assign(new Error(message), { status, outcome }); }
function authorize(actor) { if (actor?.authenticated !== true || !roleHasCapability(actor.role, "manage_content_drafts")) fail("This Social action is not available.", 403, "forbidden"); }
function postMatches(state, postId) { return (Array.isArray(state?.posts) ? state.posts : []).filter((post) => clean(post?.id) === clean(postId)); }
function bounded(value, limit) { if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value) || value.length > limit) fail("Variant copy is invalid or too long."); return value; }

function normalizeField(field, spec) {
  if (!spec || typeof spec !== "object" || !["fallback", "custom", "blank"].includes(spec.mode)) fail(`Choose how ${field} should behave.`);
  if (spec.mode === "fallback") return { mode:"fallback" };
  if (spec.mode === "blank") return { mode:"blank", value:field === "hashtags" ? [] : "" };
  if (field === "hashtags") {
    if (!Array.isArray(spec.value) || spec.value.length > 40 || spec.value.some((item) => typeof item !== "string" || item.length > 100)) fail("Variant hashtags are invalid.");
    return { mode:"custom", value:[...new Set(spec.value.map((item) => item.trim()).filter(Boolean))] };
  }
  const limits = { headline:200, body:12000, hook:500, cta:300 };
  const value = bounded(spec.value, limits[field]);
  if (!value.trim()) fail(`Use explicit blank or shared fallback for an empty ${field}.`);
  return { mode:"custom", value };
}

export function planSocialVariantMutation(state, actor, postId, input = {}) {
  authorize(actor);
  const matches = postMatches(state, postId);
  if (matches.length !== 1) fail("This Post is unavailable.", 404, "unavailable");
  const post = matches[0];
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(post._version)) fail("The Post changed. Reload before saving channels.", 409, "version_conflict");
  if (!clean(input.requestId) || clean(input.requestId).length > 160) fail("A bounded request ID is required.");
  const projection = buildPostChannelVariants(state, actor, postId);
  if (projection.availability.key === "unavailable" || projection.variants.some((variant) => variant.availability.reason === "ambiguous_variant")) fail("Channel variant truth is ambiguous.", 409, "ambiguous_variant");
  if (!Array.isArray(input.selectedChannels)) fail("Selected channels must be a list.");
  const selected = [...new Set(input.selectedChannels.map(normalizePostChannel))];
  if (selected.some((channel) => !SOCIAL_CHANNELS.includes(channel))) fail("A selected channel is not supported.");
  const requested = new Map();
  for (const item of Array.isArray(input.variants) ? input.variants : []) {
    const channel = normalizePostChannel(item.channel);
    if (!SOCIAL_CHANNELS.includes(channel) || requested.has(channel)) fail("Channel variants must be unique and supported.");
    const fields = {};
    for (const [field, spec] of Object.entries(item.fields || {})) {
      if (!FIELDS.includes(field)) fail("A variant field is not supported.");
      fields[field] = normalizeField(field, spec);
    }
    requested.set(channel, fields);
  }
  for (const variant of projection.variants) {
    if (variant.selected && !selected.includes(variant.channel) && variant.customized && input.confirmCustomizedRemoval !== true) fail(`Confirm removing ${variant.label}; its saved customization will be preserved.`, 409, "confirmation_required");
  }
  const existing = Array.isArray(post.channelVariants) ? post.channelVariants : Array.isArray(post.channel_variants) ? post.channel_variants : [];
  const next = existing.map((variant) => ({ ...variant }));
  for (const [channel, fields] of requested) {
    let index = next.findIndex((variant) => normalizePostChannel(variant.channel || variant.platform) === channel);
    if (index < 0) { next.push({ id:`${post.id}:${channel}`, channel, explicitBlankFields:[] }); index = next.length - 1; }
    const variant = { ...next[index], channel };
    const explicit = new Set(Array.isArray(variant.explicitBlankFields) ? variant.explicitBlankFields : []);
    for (const [field, spec] of Object.entries(fields)) {
      if (spec.mode === "fallback") { delete variant[field]; explicit.delete(field); }
      else if (spec.mode === "blank") { variant[field] = spec.value; explicit.add(field); }
      else { variant[field] = spec.value; explicit.delete(field); }
    }
    variant.explicitBlankFields = [...explicit].sort();
    next[index] = variant;
  }
  return Object.freeze({ post, selectedChannels:selected, channelVariants:next, projection });
}

export async function saveSocialVariants(dependencies, state, actor, postId, input = {}) {
  if (typeof dependencies?.commitPostMutation !== "function") fail("Channel persistence is unavailable.", 503, "unavailable");
  const plan = planSocialVariantMutation(state, actor, postId, input);
  const result = await dependencies.commitPostMutation({
    postId:clean(postId), expectedVersion:input.expectedVersion, requestId:clean(input.requestId), actorId:clean(actor.id || actor.actorId),
    patch:{ targetChannels:plan.selectedChannels, channelVariants:plan.channelVariants },
    activity:{ type:"social_channel_variants_saved", postId:clean(postId), summary:"Selected Social channels and saved independent channel copy." },
    audit:{ action:"social_channel_variants_saved", resourceType:"post", resourceId:clean(postId), selectedChannels:plan.selectedChannels }
  });
  return { ok:true, outcome:"saved", version:result.version, selectedChannels:plan.selectedChannels };
}
