import crypto from "node:crypto";
import { roleHasCapability } from "./roles.mjs";
import { buildSocialCreativeCatalog } from "./ui/view-models/social-creative-catalog.mjs";

export const SOCIAL_CREATIVE_SELECTION_ENDPOINT = "/api/ui/social/post/:postId/creative";
export const SOCIAL_CREATIVE_RENDER_ENDPOINT = "/api/ui/social/post/:postId/render";

const clean = (value = "") => String(value ?? "").trim();
const ROLES = Object.freeze({ logo:"logos", wilma:"wilma_poses", background:"backgrounds", disclaimer:"disclaimer_blocks", postingKit:"posting_kits", other:"other_assets" });

function actionError(message, status = 400, outcome = "validation_error") {
  return Object.assign(new Error(message), { status, outcome });
}

function authorize(actor, capability) {
  if (actor?.authenticated !== true || !roleHasCapability(actor.role, capability)) throw actionError("This Social action is not available.", 403, "forbidden");
}

function exactPost(state, actor, postId) {
  const catalog = buildSocialCreativeCatalog(state, actor, { postId, surfaceTone:"unspecified" });
  const matches = (Array.isArray(state?.posts) ? state.posts : []).filter((post) => clean(post?.id) === clean(postId));
  if (matches.length !== 1 || catalog.availability.key === "unavailable") throw actionError("This Post is unavailable.", 404, "unavailable");
  return matches[0];
}

function referenceKey(reference = {}) {
  return `${clean(reference.collection)}:${clean(reference.sourceId)}`;
}

function exactReference(reference, candidates, label) {
  const key = referenceKey(reference);
  if (!key || key === ":") throw actionError(`Choose an exact ${label} reference.`);
  const matches = candidates.filter((item) => referenceKey(item.sourceReference) === key);
  if (matches.length !== 1) throw actionError(`The selected ${label} is unavailable.`, 409, "selection_unavailable");
  return matches[0];
}

function assetsByGroup(catalog) {
  return new Map((catalog.assetGroups || []).map((group) => [group.key, group.assets || []]));
}

export function validateCreativeSelection(state, actor, postId, input = {}) {
  authorize(actor, "manage_content_drafts");
  const post = exactPost(state, actor, postId);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(post._version)) throw actionError("The Post changed. Reload before saving creative.", 409, "version_conflict");
  if (!clean(input.requestId) || clean(input.requestId).length > 160) throw actionError("A bounded request ID is required.");
  const surfaceTone = clean(input.surfaceTone || post.creativeSurfaceTone || "unspecified");
  const catalog = buildSocialCreativeCatalog(state, actor, { postId, surfaceTone });
  const template = exactReference(input.template, (catalog.templates || []).filter((item) => item.availability.key === "available"), "template");
  const grouped = assetsByGroup(catalog);
  const selected = {};
  for (const [role, group] of Object.entries(ROLES)) {
    const reference = input.assets?.[role];
    if (!reference) continue;
    selected[role] = exactReference(reference, grouped.get(group) || [], role === "postingKit" ? "posting kit" : role);
  }
  for (const required of template.requiredAssetRoles || []) {
    const role = required === "wilma_pose" ? "wilma" : required === "posting_kit" ? "postingKit" : required;
    if (!selected[role]) throw actionError(`The selected template requires an exact ${role} asset.`);
  }
  return Object.freeze({ post, template, selected:Object.freeze(selected), surfaceTone, catalog });
}

function compactSelection(validated) {
  const assets = Object.fromEntries(Object.entries(validated.selected).map(([role, item]) => [role, {
    id:item.id,
    sourceReference:{ ...item.sourceReference }
  }]));
  return {
    template:{ id:validated.template.id, sourceReference:{ ...validated.template.sourceReference } },
    assets,
    surfaceTone:validated.surfaceTone
  };
}

function creativePatch(selection) {
  const assets = selection.assets;
  return {
    selectedTemplateId:selection.template.id,
    selectedTemplateReference:selection.template.sourceReference,
    creativeSurfaceTone:selection.surfaceTone,
    logoAssetId:assets.logo?.id || null,
    logoAssetReference:assets.logo?.sourceReference || null,
    wilmaAssetId:assets.wilma?.id || null,
    wilmaAssetReference:assets.wilma?.sourceReference || null,
    backgroundAssetId:assets.background?.id || null,
    backgroundAssetReference:assets.background?.sourceReference || null,
    disclaimerIds:assets.disclaimer ? [assets.disclaimer.id] : [],
    disclaimerReferences:assets.disclaimer ? [assets.disclaimer.sourceReference] : [],
    postingKitId:assets.postingKit?.id || null,
    postingKitReference:assets.postingKit?.sourceReference || null,
    creativeAssetIds:assets.other ? [assets.other.id] : [],
    creativeAssetReferences:assets.other ? [assets.other.sourceReference] : []
  };
}

export async function saveSocialCreativeSelection(dependencies, state, actor, postId, input = {}) {
  if (typeof dependencies?.commitPostMutation !== "function") throw actionError("Creative persistence is unavailable.", 503, "unavailable");
  const validated = validateCreativeSelection(state, actor, postId, input);
  const selection = compactSelection(validated);
  const result = await dependencies.commitPostMutation({
    postId:clean(postId), expectedVersion:input.expectedVersion, requestId:clean(input.requestId), actorId:clean(actor.id || actor.actorId),
    patch:creativePatch(selection),
    activity:{ type:"social_creative_selected", postId:clean(postId), summary:"Creative template and exact approved assets selected." },
    audit:{ action:"social_creative_selection_saved", resourceType:"post", resourceId:clean(postId), sourceReferences:[selection.template.sourceReference, ...Object.values(selection.assets).map((item) => item.sourceReference)] }
  });
  return { ok:true, outcome:"saved", version:result.version, selection };
}

function selectionFromPost(post = {}) {
  const asset = (id, reference) => id && reference ? { collection:reference.collection, sourceId:reference.sourceId } : null;
  return {
    template:asset(post.selectedTemplateId, post.selectedTemplateReference),
    assets:{
      logo:asset(post.logoAssetId, post.logoAssetReference), wilma:asset(post.wilmaAssetId, post.wilmaAssetReference),
      background:asset(post.backgroundAssetId, post.backgroundAssetReference), disclaimer:asset(post.disclaimerIds?.[0], post.disclaimerReferences?.[0]),
      postingKit:asset(post.postingKitId, post.postingKitReference), other:asset(post.creativeAssetIds?.[0], post.creativeAssetReferences?.[0])
    },
    surfaceTone:post.creativeSurfaceTone
  };
}

export async function renderSocialCreative(dependencies, state, actor, postId, input = {}) {
  authorize(actor, "manage_content_drafts");
  const post = exactPost(state, actor, postId);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(post._version)) throw actionError("The Post changed. Reload before rendering.", 409, "version_conflict");
  if (typeof dependencies?.renderPost !== "function") throw actionError("Image rendering is unavailable.", 503, "unavailable");
  const stored = selectionFromPost(post);
  const validated = validateCreativeSelection(state, actor, postId, { ...stored, expectedVersion:input.expectedVersion, requestId:input.requestId || "render-validation" });
  const selection = compactSelection(validated);
  const provenance = [selection.template.sourceReference, ...Object.values(selection.assets).map((item) => item.sourceReference)];
  const idempotencyKey = `social-render-${crypto.createHash("sha256").update(JSON.stringify([post.id, post._version, provenance])).digest("hex")}`;
  const result = await dependencies.renderPost({ post:{ ...post }, actor:{ id:clean(actor.id || actor.actorId), role:actor.role }, expectedVersion:post._version, requestId:clean(input.requestId), idempotencyKey, sourceReferences:provenance });
  if (!result?.ok || !clean(result.imageId)) return { ok:false, outcome:"render_failed", message:"The image was not rendered. The previous current image remains unchanged." };
  return { ok:true, outcome:"rendered", imageId:clean(result.imageId), reused:result.reused === true, provenance };
}
