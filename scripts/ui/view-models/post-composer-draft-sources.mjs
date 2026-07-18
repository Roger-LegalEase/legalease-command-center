import { collectPostReadinessSources } from "./post-readiness-sources.mjs";
import { buildPostReadiness } from "./post-readiness.mjs";
import { buildSocialCreativeCatalog } from "./social-creative-catalog.mjs";
import { collectPostChannelVariantSources } from "./post-channel-variant-sources.mjs";
import { buildPostChannelVariants } from "./post-channel-variants.mjs";

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

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function safeId(value = "") {
  const id = clean(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? id : "";
}

function uniqueIds(...values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map(safeId).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function validGeneratedAt(context = {}) {
  const value = clean(context.generatedAt || context.now);
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

function normalizedTone(value = "") {
  const tone = lower(value).replaceAll(/[\s-]+/g, "_");
  return /^[a-z0-9][a-z0-9_]{0,39}$/.test(tone) ? tone : "unspecified";
}

function fieldPresent(record = {}, fields = []) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(record, field));
}

function valueForFields(record = {}, fields = []) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) return record[field];
  }
  return undefined;
}

function selectionFact(ids = [], present = false, multiple = false) {
  const normalized = uniqueIds(ids);
  return {
    ids: normalized,
    present: present === true,
    ambiguous: !multiple && normalized.length > 1
  };
}

function selectedImage(context = {}) {
  const candidates = [...list(context.postImages)].sort((left, right) =>
    Number(right.versionNumber || right.imageVersion || 0) - Number(left.versionNumber || left.imageVersion || 0)
    || clean(right.createdAt || right.created_at).localeCompare(clean(left.createdAt || left.created_at), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US")
  );
  return candidates[0] || {};
}

function creativeSelectionFacts(post = {}, image = {}) {
  const workflow = post.wilmaImageWorkflow && typeof post.wilmaImageWorkflow === "object" ? post.wilmaImageWorkflow : {};
  const imageSelections = image.assetBundleUsed?.selectedAssets && typeof image.assetBundleUsed.selectedAssets === "object"
    ? image.assetBundleUsed.selectedAssets
    : {};

  const templateFields = ["selectedTemplateId", "creativeTemplateId", "generationProfileId", "templateId", "templateKey"];
  const logoFields = ["logoAssetId", "brandMarkAssetId"];
  const wilmaFields = ["wilmaAssetId", "wilmaPoseReferenceId"];
  const backgroundFields = ["backgroundAssetId"];
  const disclaimerFields = ["defaultDisclaimerId", "defaultDisclaimerReference", "disclaimerAssetId", "disclaimerAssetIds", "disclaimerId", "disclaimerIds", "sharedDisclaimerReferenceIds"];
  const otherFields = ["assetId", "assetIds", "brandAssetId", "brandAssetIds", "defaultAssetIds", "creativeReferenceId", "creativeReferenceIds", "sharedCreativeReferenceIds"];

  const templateIds = uniqueIds(
    ...templateFields.map((field) => post[field]),
    image.selectedTemplateId, image.creativeTemplateId, image.generationProfileId, image.templateId, image.templateKey,
    image.assetBundleUsed?.templateId, image.assetBundleUsed?.generationProfileId
  );
  const logoIds = uniqueIds(
    ...logoFields.map((field) => post[field]),
    workflow.logoAssetId, workflow.brandMarkAssetId,
    imageSelections.logoAssetId, imageSelections.brandMarkAssetId
  );
  const wilmaIds = uniqueIds(
    ...wilmaFields.map((field) => post[field]),
    workflow.assetId, workflow.wilmaAssetId, workflow.wilmaPoseReferenceId,
    imageSelections.wilmaAssetId, imageSelections.wilmaPoseReferenceId
  );
  const backgroundIds = uniqueIds(
    post.backgroundAssetId, workflow.backgroundAssetId, imageSelections.backgroundAssetId
  );
  const disclaimerIds = uniqueIds(...disclaimerFields.map((field) => post[field]));
  const roleIds = new Set([...logoIds, ...wilmaIds, ...backgroundIds, ...disclaimerIds]);
  const otherIds = uniqueIds(
    ...otherFields.map((field) => post[field]),
    post.finalExportKit?.assetId, post.finalExportKit?.assetIds,
    imageSelections.assetId, imageSelections.assetIds
  ).filter((id) => !roleIds.has(id));

  return {
    surfaceTone: normalizedTone(
      post.creativeSurfaceTone || post.surfaceTone || post.backgroundTone
      || workflow.surfaceTone || workflow.backgroundTone || image.surfaceTone || image.backgroundTone
    ),
    template: selectionFact(templateIds, fieldPresent(post, templateFields)
      || fieldPresent(image, templateFields)
      || fieldPresent(image.assetBundleUsed || {}, ["templateId", "generationProfileId"])),
    logo: selectionFact(logoIds, fieldPresent(post, logoFields)
      || fieldPresent(workflow, logoFields)
      || fieldPresent(imageSelections, logoFields)),
    wilma: selectionFact(wilmaIds, fieldPresent(post, wilmaFields)
      || fieldPresent(workflow, ["assetId", ...wilmaFields])
      || fieldPresent(imageSelections, wilmaFields)),
    background: selectionFact(backgroundIds, fieldPresent(post, backgroundFields)
      || fieldPresent(workflow, backgroundFields)
      || fieldPresent(imageSelections, backgroundFields)),
    disclaimers: selectionFact(disclaimerIds, fieldPresent(post, disclaimerFields), true),
    otherAssets: selectionFact(otherIds, fieldPresent(post, otherFields)
      || fieldPresent(post.finalExportKit || {}, ["assetId", "assetIds"])
      || fieldPresent(imageSelections, ["assetId", "assetIds"]), true)
  };
}

const SCHEDULE_FIELDS = Object.freeze(["scheduledFor", "scheduled_at", "planned_date", "plannedDate"]);

function scheduleFacts(post = {}, postView = {}, selectedChannels = []) {
  const sourcePresent = fieldPresent(post, SCHEDULE_FIELDS);
  const raw = clean(valueForFields(post, SCHEDULE_FIELDS));
  const storedStatus = lower(post.scheduleStatus || post.schedule_status);
  let key = "unavailable";
  if (sourcePresent && /invalid|conflict|failed|blocked/.test(storedStatus)) key = "invalid";
  else if (sourcePresent && raw && postView.schedule?.scheduled !== true) key = "invalid";
  else if (postView.schedule?.scheduled === true) key = "valid";
  else if (sourcePresent) key = "missing";
  const timezone = clean(post.timezone || post.timeZone || post.scheduleTimezone);
  return {
    state: key,
    scheduled: key === "valid",
    scheduledAt: key === "valid" ? clean(postView.schedule.scheduledAt) || null : null,
    timezone: /^[a-z0-9_+/: -]{1,80}$/i.test(timezone) ? timezone : null,
    selectedChannels: [...selectedChannels],
    sourceReference: { collection: "posts", sourceId: safeId(post.id) }
  };
}

function approvalSource(context = {}) {
  const post = context.post || {};
  const explicit = lower(post.approvalStatus || post.approval_status);
  if (explicit) return { value: explicit, sourceReference: { collection: "posts", sourceId: safeId(post.id) } };
  const ordered = [...list(context.approvals)].sort((left, right) =>
    clean(right.updatedAt || right.updated_at || right.createdAt || right.created_at)
      .localeCompare(clean(left.updatedAt || left.updated_at || left.createdAt || left.created_at), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US")
  );
  const latest = ordered[0] || {};
  return {
    value: lower(latest.status || latest.decision || latest.approvalStatus),
    sourceReference: { collection: "posts", sourceId: safeId(post.id) }
  };
}

function approvalFacts(context = {}) {
  const post = context.post || {};
  const source = approvalSource(context);
  const approved = /approved|complete/.test(source.value)
    || lower(post.status) === "approved"
    || Boolean(clean(post.approvedAt || post.approved_at));
  const explicitlyNotRequired = post.approvalRequired === false || post.approval_required === false;
  const explicitlyRequired = post.approvalRequired === true || post.approval_required === true;
  let key = "unavailable";
  if (explicitlyNotRequired) key = "not_required";
  else if (approved) key = "approved";
  else if (/reject|declin|changes|blocked/.test(source.value)) key = "changes_requested";
  else if (/await|pending|requested|in_review/.test(source.value)) key = "pending";
  else if (explicitlyRequired || /required|not_requested|needs_review|review_required/.test(source.value)) key = "required";
  return {
    state: key,
    required: explicitlyNotRequired ? false : (explicitlyRequired || ["required", "pending", "changes_requested"].includes(key) ? true : null),
    approved: key === "approved",
    sourceReference: source.sourceReference
  };
}

function stateForReadiness(state = {}, post = {}, selectedChannels = []) {
  const normalizedPost = cloneValue(post);
  normalizedPost.targetChannels = [...selectedChannels];
  delete normalizedPost.target_channels;
  delete normalizedPost.selectedChannels;
  delete normalizedPost.selected_channels;
  delete normalizedPost.platform;
  delete normalizedPost.channel;
  delete normalizedPost.channelVariants;
  delete normalizedPost.channel_variants;
  delete normalizedPost.variantsByChannel;
  return {
    ...state,
    posts: [normalizedPost]
  };
}

function unavailable(reason, generatedAt) {
  return deepFreeze({
    authorized: false,
    found: false,
    reason,
    generatedAt,
    postView: null,
    variants: null,
    catalog: null,
    readiness: null,
    creativeSelections: null,
    schedule: null,
    approval: null,
    diagnostics: { postsExamined: 0, variantsExamined: 0, creativeCandidatesScanned: 0, readinessCandidatesExamined: 0 }
  });
}

export const POST_COMPOSER_DRAFT_SOURCE_MATRIX = deepFreeze([
  { source: "PostView", truth: "Canonical Post identity, exact link, normalized source references, schedule, and stored result evidence" },
  { source: "Post channel variants", truth: "Shared content, explicit channel selection, independent stored variants, and exact creative references" },
  { source: "Social creative catalog", truth: "Authorized approved templates and brand assets, surface compatibility, and explicit relationships" },
  { source: "Social readiness", truth: "Read-only content, creative, channel, schedule, approval, and publication checks" },
  { source: "posts / related postImages", truth: "Exact stored creative-selection, schedule, and approval facts for one authorized Post" }
]);

export function collectPostComposerDraftSources(state = {}, actor = {}, postId = "", context = {}) {
  const generatedAt = validGeneratedAt(context);
  const variantSource = collectPostChannelVariantSources(state, actor, postId);
  const readinessSource = collectPostReadinessSources(state, actor, postId);
  if (!variantSource.authorized || !readinessSource.authorized) return unavailable("actor_cannot_read", generatedAt);
  if (!variantSource.postView || !readinessSource.found) return unavailable("post_not_visible", generatedAt);

  const variants = buildPostChannelVariants(state, actor, postId);
  if (variants.availability?.key === "unavailable") return unavailable(variants.availability.reason || "post_not_visible", generatedAt);
  const post = readinessSource.post;
  const image = selectedImage(readinessSource);
  const creativeSelections = creativeSelectionFacts(post, image);
  const catalog = buildSocialCreativeCatalog(state, actor, {
    generatedAt,
    surfaceTone: creativeSelections.surfaceTone
  });
  const readiness = buildPostReadiness(
    stateForReadiness(state, post, variants.selectedChannels),
    actor,
    postId,
    generatedAt || ""
  );

  return deepFreeze({
    authorized: true,
    found: true,
    reason: null,
    generatedAt,
    postView: variantSource.postView,
    variants,
    catalog,
    readiness,
    creativeSelections,
    schedule: scheduleFacts(post, variantSource.postView, variants.selectedChannels),
    approval: approvalFacts(readinessSource),
    diagnostics: {
      postsExamined: variantSource.diagnostics.postsExamined,
      variantsExamined: variantSource.diagnostics.variantsExamined,
      creativeCandidatesScanned: catalog.performance?.candidatesScanned || 0,
      readinessCandidatesExamined: readiness.performance?.sourceCandidatesExamined || 0
    }
  });
}
