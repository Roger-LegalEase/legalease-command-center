import { buildPostComposerDraft } from "./ui/view-models/post-composer-draft.mjs";
import { canPerformEndpoint } from "./roles.mjs";
import { buildPostSchedulePlan } from "./ui/view-models/post-schedule-plan.mjs";
import { buildPostReviewPlan } from "./ui/view-models/post-review-plan.mjs";
import { buildPostPublishingControls } from "./ui/view-models/post-publishing-controls.mjs";
import { buildSocialCreativeCatalog } from "./ui/view-models/social-creative-catalog.mjs";
import { buildPostChannelVariants } from "./ui/view-models/post-channel-variants.mjs";

export const POST_COMPOSER_ENDPOINT = "/api/ui/social/post";
export const POST_COMPOSER_SAVE_SUFFIX = "/save";
const FIELDS = ["headline", "body", "hook", "cta", "hashtags"];
const LIMITS = Object.freeze({ headline:200, body:12000, hook:500, cta:300, hashtags:40 });
const text = (v, n = 5000) => String(v ?? "").slice(0, n);
const cleanField = (field, value) => {
  if (field === "hashtags") {
    if (!Array.isArray(value)) throw Object.assign(new Error("Hashtags must be a list."), { status:400, field });
    if (value.length > LIMITS.hashtags || value.some((x) => typeof x !== "string" || /[\u0000-\u001f\u007f]/u.test(x) || x.length > 100)) throw Object.assign(new Error("Hashtags contain an invalid value."), { status:400, field });
    return value.map((x) => x.trim());
  }
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value) || value.length > LIMITS[field]) throw Object.assign(new Error(`${field} is invalid or too long.`), { status:400, field });
  return value;
};

export function composerSavePath(id) { return `${POST_COMPOSER_ENDPOINT}/${encodeURIComponent(id)}/save`; }

function fieldValues(draft) {
  return Object.fromEntries(FIELDS.map((field) => [field, field === "hashtags"
    ? (Array.isArray(draft.sharedContent?.[field]?.value) ? draft.sharedContent[field].value : [])
    : text(draft.sharedContent?.[field]?.value || "") ]));
}

export function buildPostComposerContract(state, actor, postId, now = new Date().toISOString(), options = {}) {
  const productionEnabled = options.productionEnabled === true;
  const rawMatches = (Array.isArray(state?.posts) ? state.posts : [])
    .filter((item) => String(item?.id || "") === String(postId || ""));
  if (rawMatches.length !== 1) return { ok:false, outcome:"unavailable", generatedAt:now, capabilities:{ edits:false } };
  const draft = buildPostComposerDraft(state, actor, postId, { now });
  const schedulePlan = buildPostSchedulePlan(state, actor, postId, now);
  const reviewPlan = buildPostReviewPlan(state, actor, postId, now);
  const publishingControls = buildPostPublishingControls(state, actor, postId, now);
  const creativeCatalog = buildSocialCreativeCatalog(state, actor, { postId, surfaceTone:draft.creative?.surfaceTone || "unspecified", generatedAt:now });
  const channelProjection = buildPostChannelVariants(state, actor, postId);
  const editable = canPerformEndpoint(actor?.role || "viewer", "POST", composerSavePath(postId)).ok;
  if (!draft.postId) return { ok:false, outcome:"unavailable", generatedAt:now, capabilities:{ edits:false } };
  const compactAsset = (value) => value?.value ? { name:value.value.name || "Selected asset", sourceReference:value.value.sourceReference || value.sourceReference || null, available:true } : { name:null, sourceReference:null, available:false, issue:value?.availability?.reason || "unavailable" };
  return {
    ok:true, generatedAt:now, productionEnabled, post:{ id:draft.postId, href:draft.href, title:text(draft.sharedContent?.headline?.value || "Post", 180) },
    version:draft.version, fields:fieldValues(draft),
    creative:{
      template:compactAsset(draft.creative?.template), logo:compactAsset(draft.creative?.logo), wilma:compactAsset(draft.creative?.wilma), background:compactAsset(draft.creative?.background), disclaimer:compactAsset(draft.creative?.disclaimers?.values?.[0]), availability:draft.creative?.availability?.key || "unavailable",
      surfaceTone:draft.creative?.surfaceTone || "unspecified",
      catalog:{ categories:(creativeCatalog.categories || []).map((item) => ({ key:item.key, label:item.label, templateCount:item.templateCount })), templates:(creativeCatalog.templates || []).map((item) => ({ id:item.id, name:item.name, category:item.category, description:item.description, sourceReference:item.sourceReference, availability:item.availability })), groups:(creativeCatalog.assetGroups || []).map((group) => ({ key:group.key, label:group.label, assets:(group.assets || []).map((asset) => ({ id:asset.id, name:asset.name, role:asset.role, sourceReference:asset.sourceReference, usageGuidance:asset.usageGuidance, suitableSurface:asset.suitableSurface })) })), guidance:(creativeCatalog.brandGuidance || []).map((item) => ({ name:item.name, summary:item.summary })), availability:creativeCatalog.availability }
    },
    channels:{ selected:(draft.selectedChannels || []).map((x) => ({ key:x.key || x.channel, label:x.label || x.channel })), customizedCount:(draft.channelVariants || []).filter((x) => x.customized).length, variants:(channelProjection.variants || []).map((variant) => ({ channel:variant.channel, label:variant.label, selected:variant.selected, customized:variant.customized, stored:variant.stored, content:Object.fromEntries(Object.entries(variant.content || {}).map(([field, value]) => [field, { value:value.value, source:value.source, state:value.state, explicitlyBlank:value.explicitlyBlank }])), creativeReferences:variant.assetReferences, guidance:variant.formatGuidance, availability:variant.availability })), availability:channelProjection.availability },
    schedule:{ state:schedulePlan.state?.key || draft.schedule?.state || "unavailable", display:schedulePlan.state?.label || "Unavailable", timezone:schedulePlan.timezone || null, scheduledAt:schedulePlan.scheduledAt || null },
    readiness:{ state:draft.readiness?.state?.key || draft.readiness?.state || "unavailable", label:draft.readiness?.state?.label || null, checks:(draft.readiness?.checks || []).map((x) => ({ label:x.label || x.key, state:x.state?.key || x.state || "unavailable" })) },
    review:{ state:reviewPlan.state?.key || draft.approval?.status || draft.approval?.state || "unavailable", label:reviewPlan.state?.label || null, blockingChecks:(reviewPlan.blockingChecks || []).map((check) => ({ category:check.category, label:check.label, status:check.status, explanation:check.explanation, hardFailure:check.hardFailure })), requestedChanges:reviewPlan.requestedChanges || [], versions:reviewPlan.versions, regeneration:reviewPlan.regeneration, activity:(reviewPlan.activity || []).slice(0, 20), guidance:reviewPlan.guidance, approval:reviewPlan.approval },
    publishing:{ state:publishingControls.state?.key || "unavailable", label:publishingControls.state?.label || "Unavailable", publication:publishingControls.publicationSummary?.state || "unavailable", connectedChannels:publishingControls.availability?.counts?.connectedChannels ?? null, channels:(publishingControls.channels || []).map((channel) => ({ channel:channel.channel, label:channel.label, state:channel.state, connectionState:channel.connectionState, gateState:channel.publishingGateState, publicationState:channel.publicationState, eligibility:channel.eligibility, manualFallback:channel.manualFallback })), manualFallback:publishingControls.manualFallback, guidance:publishingControls.guidance },
    availability:draft.availability, capabilities:{ reads:true, edits:editable && draft.version !== null, creative:productionEnabled && editable && draft.version !== null && creativeCatalog.availability.key !== "unavailable", variants:productionEnabled && editable && draft.version !== null && channelProjection.availability.key !== "unavailable", editReason:draft.version === null ? "This Post cannot be safely saved because its current version is unavailable." : null, mutatesSource:false, schedules:productionEnabled && editable && draft.version !== null, approves:productionEnabled && reviewPlan.approval?.approveAction?.available === true && draft.version !== null, requestsChanges:productionEnabled && reviewPlan.availability?.key !== "unavailable" && draft.version !== null, publishes:productionEnabled && draft.version !== null && publishingControls.channels?.some((channel) => channel.eligibility?.available === true), manualPackage:productionEnabled && draft.version !== null && publishingControls.manualFallback?.available === true, regenerates:productionEnabled && editable && draft.version !== null && reviewPlan.regeneration?.state?.key !== "in_progress" },
    sourceUnavailable:draft.availability?.key !== "available"
  };
}

export function normalizeComposerPatch(input = {}) {
  const fields = input.fields && typeof input.fields === "object" ? input.fields : input;
  const unknown = Object.keys(fields).filter((key) => !FIELDS.includes(key));
  if (unknown.length) throw Object.assign(new Error("Only shared Post copy can be saved."), { status:400 });
  const patch = {};
  for (const field of FIELDS) {
    if (!(field in fields)) continue;
    patch[field] = cleanField(field, fields[field]);
  }
  if (!Object.keys(patch).length) throw Object.assign(new Error("Add a shared copy change before saving."), { status:400 });
  return patch;
}

export const POST_COMPOSER_FIELDS = FIELDS;
