import { buildPostChannelVariants } from "./ui/view-models/post-channel-variants.mjs";
import { buildPostPublishingControls } from "./ui/view-models/post-publishing-controls.mjs";
import { buildPostReadiness } from "./ui/view-models/post-readiness.mjs";
import { buildPostSchedulePlan } from "./ui/view-models/post-schedule-plan.mjs";
import { buildSocialCreativeCatalog } from "./ui/view-models/social-creative-catalog.mjs";

const NOW = "2026-07-19T12:00:00.000Z";
const ACTOR = Object.freeze({ authenticated:true, role:"owner", id:"ccx-310-owner" });

function clone(value) {
  return structuredClone(value);
}

function fixtureState() {
  return {
    posts:[],
    contentBank:[],
    generationProfiles:[{
      id:"template-wilma-faq",
      profileName:"Wilma FAQ",
      displayName:"Wilma FAQ",
      visualBucket:"Wilma answer / explainer graphic",
      supportedChannels:["linkedin", "instagram"],
      usesWilma:true,
      defaultAssetIds:["wilma-pose-01", "logo-primary"],
      defaultDisclaimerId:"disclaimer-standard",
      active:true,
      approved:true
    }],
    brandAssets:[
      { id:"wilma-pose-01", name:"Wilma helpful guide", assetType:"wilma_reference", fileUrl:"assets/brand/wilma/poses/1.png", approved:true },
      { id:"logo-primary", name:"LegalEase primary logo", assetType:"logo", fileUrl:"assets/brand/logos/legalease-logo-2025-ob.png", approved:true },
      { id:"unapproved-substitute", name:"Unapproved substitute", assetType:"logo", fileUrl:"assets/brand/logos/substitute.png", approved:false }
    ],
    postImages:[], postingKits:[], assetBundles:[], brandRules:[], library:[
      { id:"disclaimer-standard", title:"Standard disclaimer", category:"disclaimer", status:"approved", body:"General information only; rules vary by state and case." }
    ],
    socialAccounts:[], approvals:[], approvalQueue:[], queueItems:[], publishEvents:[], publishClaims:[],
    scheduleConflicts:[], reports:[], dataRoomItems:[], evidencePackNotes:[], activityEvents:[], auditHistory:[], generationBatches:[],
    settings:{ sourceItems:[], localAssets:[] },
    runtime:{ livePostingGates:{ linkedin:false, instagram:false } }
  };
}

function catalogAssets(catalog) {
  return catalog.assetGroups.flatMap((group) => group.assets || []);
}

function requireText(value, label) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function postById(state, id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) throw new Error("Synthetic Post is unavailable.");
  return post;
}

export function createSocialAcceptanceFixture({ publishAdapter } = {}) {
  if (typeof publishAdapter !== "function") throw new TypeError("An injected test publish adapter is required.");
  const state = fixtureState();
  const claims = new Map();
  const claimCompletions = new Map();
  const metrics = { providerCalls:0, externalNetworkCalls:0, manualPackages:0, publications:0, duplicatePublishes:0 };
  let activePostId = null;
  let sequence = 0;

  function catalog() {
    return buildSocialCreativeCatalog(state, ACTOR, { generatedAt:NOW, surfaceTone:"dark" });
  }

  function activePost() {
    return postById(state, activePostId);
  }

  function publicSnapshot(lastAction = null) {
    const post = activePostId ? activePost() : null;
    const creativeCatalog = catalog();
    const variants = post ? buildPostChannelVariants(state, ACTOR, post.id) : null;
    const readiness = post ? buildPostReadiness(state, ACTOR, post.id, NOW) : null;
    const schedule = post ? buildPostSchedulePlan(state, ACTOR, post.id, NOW) : null;
    const publishing = post ? buildPostPublishingControls(state, ACTOR, post.id, NOW) : null;
    return clone({
      lastAction,
      activePostId,
      post,
      catalog:{ templates:creativeCatalog.templates.map((item) => item.id), assets:catalogAssets(creativeCatalog).map((item) => item.id) },
      variants:variants ? variants.variants.map((item) => ({ channel:item.channel, selected:item.selected, body:item.content.body.value })) : [],
      readiness:readiness ? { state:readiness.state.key, headline:readiness.headline, blocking:readiness.checks.filter((item) => item.blocking && item.status.key !== "passed").map((item) => item.key) } : null,
      schedule:schedule ? { state:schedule.state.key, scheduledAt:schedule.scheduledAt, timezone:schedule.timezone } : null,
      publishing:publishing ? { state:publishing.state.key, manualFallback:publishing.manualFallback.state } : null,
      metrics,
      claims:[...claims.values()],
      auditEvents:state.auditHistory.map((item) => ({ id:item.id, eventType:item.eventType, before:item.before, after:item.after }))
    });
  }

  function addIdea(title) {
    const id = `ccx310-idea-${String(++sequence).padStart(2, "0")}`;
    state.posts.push({
      id, title:requireText(title, "Idea title"), status:"idea", body:"", hook:"", cta:"", hashtags:[], targetChannels:[], channelVariants:[],
      scheduledFor:"", timezone:"", guidelinesGate:{ passed:true, hardFails:[] }, imageIntentionallyOmitted:true,
      approvalRequired:false, approvalStatus:"not_required", manualPublishingAvailable:false, _version:1
    });
    activePostId = id;
    return publicSnapshot("idea_added");
  }

  function turnIdeaIntoPost() {
    const post = activePost();
    if (post.status !== "idea") throw new Error("Only an idea can be turned into a Post.");
    post.status = "draft";
    post.body = "A plain-language draft for review.";
    post._version += 1;
    return publicSnapshot("idea_turned_into_post");
  }

  function createFromTemplate(templateId) {
    const exactId = requireText(templateId, "Template");
    const template = catalog().templates.find((item) => item.id === exactId && item.availability.key === "available");
    if (!template) throw new Error("The exact authorized template is unavailable.");
    const id = `ccx310-template-post-${String(++sequence).padStart(2, "0")}`;
    state.posts.push({
      id, title:"Wilma explains the next step", status:"draft", body:"Start with what the rule may allow, then confirm the facts.",
      hook:"A clearer next step", cta:"Read the guide", hashtags:["#LegalEase"], selectedTemplateId:exactId,
      targetChannels:[], channelVariants:[], scheduledFor:"", timezone:"", guidelinesGate:{ passed:true, hardFails:[] },
      imageIntentionallyOmitted:false, approvalRequired:false, approvalStatus:"not_required", manualPublishingAvailable:true, _version:1
    });
    activePostId = id;
    return publicSnapshot("post_created_from_template");
  }

  function selectAssets({ wilmaId, brandId }) {
    const assets = catalogAssets(catalog());
    const wilma = assets.find((item) => item.id === wilmaId);
    const brand = assets.find((item) => item.id === brandId);
    if (!wilma || !brand) throw new Error("Every selected asset must be an exact authorized catalog record.");
    const post = activePost();
    post.wilmaPoseReferenceId = wilma.id;
    post.wilmaAssetId = wilma.id;
    post.logoAssetId = brand.id;
    post.brandAssetIds = [brand.id];
    post.assetReferences = [
      { collection:wilma.sourceReference.collection, sourceId:wilma.sourceReference.sourceId, relationship:"wilma_pose" },
      { collection:brand.sourceReference.collection, sourceId:brand.sourceReference.sourceId, relationship:"brand_asset" }
    ];
    post._version += 1;
    return publicSnapshot("assets_selected");
  }

  function triggerGuidelineFailure() {
    const post = activePost();
    post.body = "We guarantee this outcome for every person.";
    post.guidelinesGate = { passed:false, hardFails:[{ ruleId:"voice_outcome_promise" }] };
    post._version += 1;
    return publicSnapshot("guideline_failure_triggered");
  }

  function resolveGuidelineFailure() {
    const post = activePost();
    post.body = "Options depend on the facts, the state, and the court's decision. This is general information.";
    post.guidelinesGate = { passed:true, hardFails:[] };
    post._version += 1;
    return publicSnapshot("guideline_failure_resolved");
  }

  function renderImage(requestedAssetIds) {
    const requested = [...new Set((requestedAssetIds || []).map((item) => requireText(item, "Asset ID")))];
    const allowed = new Set(catalogAssets(catalog()).map((item) => item.id));
    const missing = requested.filter((id) => !allowed.has(id));
    if (missing.length) return { ...publicSnapshot("render_blocked"), render:{ ok:false, missing, substituted:false } };
    const post = activePost();
    const selected = [post.wilmaPoseReferenceId, ...(post.brandAssetIds || [])].filter(Boolean);
    if (!requested.length || requested.some((id) => !selected.includes(id)) || selected.some((id) => !requested.includes(id))) {
      return { ...publicSnapshot("render_blocked"), render:{ ok:false, missing:[], substituted:false, reason:"selected_asset_mismatch" } };
    }
    state.postImages = state.postImages.filter((item) => item.postId !== post.id);
    state.postImages.push({
      id:`image-${post.id}`, postId:post.id, generationStatus:"generated", finalImageReady:true,
      renderQa:{ passed:true }, styleGate:{ passed:true }, exactAssetIds:requested, provider:"injected_test_renderer"
    });
    post.imageIntentionallyOmitted = false;
    post.finalPreviewConfirmed = true;
    return { ...publicSnapshot("image_rendered"), render:{ ok:true, exactAssetIds:requested, substituted:false } };
  }

  function addChannelVariants({ linkedin, instagram }) {
    const post = activePost();
    post.targetChannels = ["linkedin", "instagram"];
    post.channelVariants = [
      { id:`${post.id}-linkedin`, channel:"linkedin", body:requireText(linkedin, "LinkedIn copy") },
      { id:`${post.id}-instagram`, channel:"instagram", body:requireText(instagram, "Instagram copy") }
    ];
    post._version += 1;
    return publicSnapshot("channel_variants_added");
  }

  function schedulePost({ scheduledFor, timezone }) {
    const post = activePost();
    post.scheduledFor = requireText(scheduledFor, "Schedule");
    post.timezone = requireText(timezone, "Timezone");
    post.scheduleStatus = "valid";
    post.status = "scheduled";
    post.perChannelPublishStatus = Object.fromEntries(post.targetChannels.map((channel) => [channel, "scheduled"]));
    return publicSnapshot("post_scheduled");
  }

  function moveOnCalendar(nextScheduledFor) {
    const post = activePost();
    const before = requireText(post.scheduledFor, "Existing schedule");
    const after = requireText(nextScheduledFor, "New schedule");
    post.scheduledFor = after;
    state.auditHistory.push({ id:`audit-move-${post.id}`, eventType:"post_schedule_moved", sourceId:post.id, before, after });
    return publicSnapshot("post_moved_on_calendar");
  }

  function publishManuallyWithoutCredentials() {
    const post = activePost();
    if (state.socialAccounts.length || Object.values(state.runtime.livePostingGates).some(Boolean)) throw new Error("Manual fixture must have no credentials and live gates off.");
    metrics.manualPackages += 1;
    post.manualPublishingPackage = { id:`manual-${post.id}`, status:"ready", channels:[...post.targetChannels] };
    return publicSnapshot("manual_package_created");
  }

  async function publishWithInjectedAdapter(idempotencyKey) {
    const key = requireText(idempotencyKey, "Idempotency key");
    const post = activePost();
    state.socialAccounts = post.targetChannels.map((channel) => ({ id:`test-${channel}`, platform:channel, status:"connected", connected:true }));
    state.runtime.livePostingGates = Object.fromEntries(post.targetChannels.map((channel) => [channel, true]));
    const plans = [];
    for (const channel of post.targetChannels) {
      const claimKey = `${post.id}:${channel}:${key}`;
      if (claims.has(claimKey)) {
        metrics.duplicatePublishes += 1;
        plans.push({ channel, claimKey, reused:true });
        continue;
      }
      let resolveCompletion;
      let rejectCompletion;
      const completion = new Promise((resolve, reject) => { resolveCompletion = resolve; rejectCompletion = reject; });
      completion.catch(() => {});
      const claim = { claimKey, channel, status:"publishing", externalId:null };
      claims.set(claimKey, claim);
      claimCompletions.set(claimKey, { completion, resolveCompletion, rejectCompletion });
      plans.push({ channel, claimKey, reused:false });
    }
    const results = [];
    for (const plan of plans) {
      const claim = claims.get(plan.claimKey);
      const deferred = claimCompletions.get(plan.claimKey);
      if (plan.reused) {
        await deferred.completion;
        results.push({ channel:plan.channel, reused:true, externalId:claim.externalId });
        continue;
      }
      try {
        metrics.providerCalls += 1;
        const published = await publishAdapter({ post:clone(post), channel:plan.channel, idempotencyKey:key });
        claim.status = "published";
        claim.externalId = requireText(published?.externalId, "Injected external ID");
        post.perChannelPublishStatus[plan.channel] = "published";
        metrics.publications += 1;
        deferred.resolveCompletion(claim.externalId);
        results.push({ channel:plan.channel, reused:false, externalId:claim.externalId });
      } catch (error) {
        claim.status = "failed";
        deferred.rejectCompletion(error);
        throw error;
      }
    }
    if (post.targetChannels.every((channel) => post.perChannelPublishStatus[channel] === "published")) post.status = "published";
    return { ...publicSnapshot("gated_publish_checked"), publishResults:results };
  }

  return Object.freeze({
    addIdea, turnIdeaIntoPost, createFromTemplate, selectAssets, triggerGuidelineFailure, resolveGuidelineFailure,
    renderImage, addChannelVariants, schedulePost, moveOnCalendar, publishManuallyWithoutCredentials,
    publishWithInjectedAdapter, snapshot:() => publicSnapshot("snapshot")
  });
}
