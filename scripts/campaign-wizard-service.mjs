import { canPerformEndpoint, roleHasCapability } from "./roles.mjs";
import { buildCampaignView } from "./ui/view-models/campaign-view.mjs";

const clean = (value = "") => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const CAMPAIGN_WIZARD_ENDPOINT_PREFIX = "/api/ui/outreach/campaign";
export const CAMPAIGN_WIZARD_STEPS = Object.freeze([
  Object.freeze({ key:"goal", label:"Goal", order:1 }),
  Object.freeze({ key:"audience", label:"Audience", order:2 }),
  Object.freeze({ key:"message", label:"Message", order:3 }),
  Object.freeze({ key:"schedule", label:"Schedule", order:4 }),
  Object.freeze({ key:"review", label:"Review", order:5 })
]);
export const CAMPAIGN_WIZARD_DRAFT_VERSION = 1;

export class CampaignWizardError extends Error {
  constructor(message, status = 400, code = "invalid_campaign_wizard_request") {
    super(message);
    this.name = "CampaignWizardError";
    this.status = status;
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalRecord(state, view) {
  if (view?.source?.kind !== "canonical" || view.source.collection !== "campaigns") return null;
  return (Array.isArray(state?.campaigns) ? state.campaigns : []).find((record) => clean(record?.id) === view.source.sourceId) || null;
}

function emptyDraft() {
  return {
    schemaVersion:CAMPAIGN_WIZARD_DRAFT_VERSION,
    goal:{}, audience:{}, message:{ mode:null, steps:[] }, schedule:{}, review:{},
    lastStep:"goal",
    savedAt:null
  };
}

function normalizedStoredDraft(record = {}) {
  const stored = object(record.campaignWizardDraft || record.wizardDraft);
  const step = CAMPAIGN_WIZARD_STEPS.some((candidate) => candidate.key === stored.lastStep) ? stored.lastStep : "goal";
  return {
    ...emptyDraft(),
    goal:object(stored.goal),
    audience:object(stored.audience),
    message:{ ...object(stored.message), steps:Array.isArray(stored.message?.steps) ? stored.message.steps : [] },
    schedule:object(stored.schedule),
    review:object(stored.review),
    lastStep:step,
    savedAt:clean(stored.savedAt) || null
  };
}

function completion(draft) {
  return {
    goal:Boolean(clean(draft.goal?.campaignName) && clean(draft.goal?.campaignType) && clean(draft.goal?.desiredOutcome) && clean(draft.goal?.owner)),
    audience:Boolean(draft.audience?.selectionConfirmed === true),
    message:Boolean(draft.message?.messageComplete === true),
    schedule:Boolean(draft.schedule?.scheduleSelected === true),
    review:false
  };
}

export function buildCampaignWizardView(state = {}, actor = {}, stableIdentity = "") {
  if (actor?.authenticated !== true || !roleHasCapability(actor.role, "read_internal")) {
    return deepFreeze({ ok:false, authorized:false, available:false, campaign:null, draft:null, steps:CAMPAIGN_WIZARD_STEPS, capabilities:{ savesDraft:false, sends:false, launches:false } });
  }
  const campaign = buildCampaignView(state, clean(stableIdentity), actor);
  const record = canonicalRecord(state, campaign);
  if (!campaign || !record) {
    return deepFreeze({ ok:true, authorized:true, available:false, campaign:null, draft:null, steps:CAMPAIGN_WIZARD_STEPS, capabilities:{ savesDraft:false, sends:false, launches:false } });
  }
  const draft = normalizedStoredDraft(record);
  const decision = canPerformEndpoint(actor.role, "POST", `${CAMPAIGN_WIZARD_ENDPOINT_PREFIX}/${encodeURIComponent(campaign.stableIdentity)}/draft`);
  return deepFreeze({
    ok:true, authorized:true, available:true,
    campaign:{ stableIdentity:campaign.stableIdentity, sourceId:campaign.source.sourceId, name:campaign.name, href:campaign.exactSafeSourceLink, status:campaign.status },
    draft,
    draftVersion:Number.isSafeInteger(record.campaignWizardDraftVersion) ? record.campaignWizardDraftVersion : 0,
    steps:CAMPAIGN_WIZARD_STEPS.map((step) => ({ ...step, complete:completion(draft)[step.key] })),
    capabilities:{ savesDraft:decision.ok, sends:false, launches:false, schedules:false, approves:false }
  });
}

const STEP_KEYS = Object.freeze({
  goal:new Set(["campaignName", "campaignType", "desiredOutcome", "relatedProgramOrProduct", "owner"]),
  audience:new Set(["selection", "segmentId", "filters", "selectionConfirmed"]),
  message:new Set(["subject", "previewText", "senderIdentityId", "body", "mode", "steps", "messageComplete"]),
  schedule:new Set(["mode", "scheduledAt", "timezone", "weekdayWindow", "batchPlan", "scheduleSelected"]),
  review:new Set(["acknowledgements"])
});
const FORBIDDEN_KEYS = /^(?:send|sendNow|launch|launchCampaign|approve|execute|release|provider|live|suppressionOverride|recipientOverride)$/i;

function normalizePatch(step, fields = {}) {
  const allowed = STEP_KEYS[step];
  if (!allowed) throw new CampaignWizardError("The Campaign wizard step is invalid.");
  const input = object(fields);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key) || FORBIDDEN_KEYS.test(key)) throw new CampaignWizardError("The Campaign wizard update contains an unsupported field.");
  }
  return structuredClone(input);
}

export function campaignWizardHasUnsavedChanges(authoritativeDraft = {}, candidateDraft = {}) {
  return JSON.stringify(authoritativeDraft) !== JSON.stringify(candidateDraft);
}

export function createCampaignWizardSavePlan(state = {}, actor = {}, stableIdentity = "", input = {}, now = "") {
  const view = buildCampaignWizardView(state, actor, stableIdentity);
  if (!view.authorized) throw new CampaignWizardError("This account cannot view the Campaign wizard.", 403, "forbidden");
  if (!view.available) throw new CampaignWizardError("This Campaign draft is not available.", 404, "not_found");
  if (!view.capabilities.savesDraft) throw new CampaignWizardError("This account cannot save Campaign drafts.", 403, "forbidden");
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== view.draftVersion) throw new CampaignWizardError("This Campaign draft changed elsewhere. Reload before saving.", 409, "version_conflict");
  const step = clean(input.step);
  const fields = normalizePatch(step, input.fields);
  const nextDraft = { ...structuredClone(view.draft), [step]:{ ...structuredClone(view.draft[step]), ...fields }, lastStep:step, savedAt:clean(now) || null };
  return deepFreeze({
    ok:true,
    scope:{ collection:"campaigns", id:view.campaign.sourceId, expectedVersion },
    fields:{ campaignWizardDraft:nextDraft, campaignWizardDraftVersion:expectedVersion + 1 },
    audit:{ action:"campaign_wizard_draft_saved", targetType:"campaign", targetId:view.campaign.sourceId, summary:{ step, changedFields:Object.keys(fields).sort() } },
    response:{ saved:true, stableIdentity:view.campaign.stableIdentity, step, draftVersion:expectedVersion + 1, savedAt:nextDraft.savedAt },
    execution:{ sends:false, launches:false, schedules:false, approvals:false, providerCalls:false }
  });
}

export async function persistCampaignWizardDraft({ state, actor, stableIdentity, input, now, persistScoped, appendAudit } = {}) {
  if (typeof persistScoped !== "function" || typeof appendAudit !== "function") throw new CampaignWizardError("Campaign draft persistence is unavailable.", 503, "persistence_unavailable");
  const plan = createCampaignWizardSavePlan(state, actor, stableIdentity, input, now);
  await persistScoped(plan.scope, plan.fields);
  await appendAudit(plan.audit);
  return plan.response;
}
