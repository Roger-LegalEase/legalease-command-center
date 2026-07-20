import { createHash } from "node:crypto";

import { buildCampaignAdvancedDelivery } from "./campaign-advanced-delivery.mjs";
import { buildCampaignAudienceStep, createCampaignAudienceSavePlan } from "./campaign-audience-step.mjs";
import { buildCampaignDetailView, createCampaignStatusActionPlan } from "./campaign-detail-service.mjs";
import { buildCampaignGoalStep, createCampaignGoalSavePlan } from "./campaign-goal-step.mjs";
import { buildCampaignMessageStep, createCampaignLeeAssistPlan, createCampaignMessageSavePlan, createCampaignTestSendPlan } from "./campaign-message-step.mjs";
import { buildCampaignRepliesOutcomes, createReplyOutcomeActionPlan } from "./campaign-replies-outcomes.mjs";
import { buildCampaignReviewStep, createCampaignLaunchPlan } from "./campaign-review-step.mjs";
import { buildCampaignScheduleStep, createCampaignScheduleSavePlan } from "./campaign-schedule-step.mjs";
import { buildCampaignWizardView, createCampaignWizardSavePlan } from "./campaign-wizard-service.mjs";
import { pauseCampaign, proposeCampaignResume } from "./campaign-command.mjs";
import { requestApproval } from "./company-memory.mjs";
import { OutreachHomeValidationError, buildAuthorizedOutreachHome } from "./outreach-home-service.mjs";
import {
  applyPartnerStageSuggestion,
  buildPartnerCampaignSelection
} from "./partner-outreach-integration.mjs";
import { logPartnerActivity, setPartnerNextAction } from "./partner-record-actions.mjs";
import { renderCampaignGoalStep } from "./ui/pages/campaign-goal-step.mjs";
import { renderCampaignAudienceStep } from "./ui/pages/campaign-audience-step.mjs";
import { renderCampaignMessageStep } from "./ui/pages/campaign-message-step.mjs";
import { renderCampaignScheduleStep } from "./ui/pages/campaign-schedule-step.mjs";
import { renderCampaignReviewStep } from "./ui/pages/campaign-review-step.mjs";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const PREFIX = "/api/ui/outreach";
const REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{15,159}$/i;
const HOME_QUERY_KEYS = new Set(["view", "limit", "cursor"]);
const DRAFT_QUERY_KEYS = new Set(["step", "limit", "cursor"]);
const DETAIL_QUERY_KEYS = new Set(["tab"]);
const NO_QUERY_KEYS = new Set();
const STEPS = new Set(["goal", "audience", "message", "schedule", "review"]);

export const OUTREACH_API_BODY_LIMIT = 32_000;
export const OUTREACH_API_ENDPOINTS = Object.freeze([
  "GET /api/ui/outreach",
  "GET /api/ui/outreach/campaign/:identity/draft",
  "POST /api/ui/outreach/campaign/:identity/draft",
  "POST /api/ui/outreach/campaign/:identity/test-send",
  "POST /api/ui/outreach/campaign/:identity/assist",
  "POST /api/ui/outreach/campaign/:identity/review-action",
  "GET /api/ui/outreach/campaign/:identity",
  "POST /api/ui/outreach/campaign/:identity/status-action",
  "POST /api/ui/outreach/campaign/:identity/reply-action"
]);

export function isOutreachApiPath(pathname = "") {
  const path = clean(pathname);
  return path === PREFIX || path.startsWith(`${PREFIX}/`);
}

function integrationError(message, status = 400, outcome = "rejected") {
  const error = new Error(message);
  error.name = "OutreachIntegrationError";
  error.status = status;
  error.outcome = outcome;
  error.safeMessage = message;
  return error;
}

function assertQuery(searchParams, allowed) {
  for (const key of searchParams?.keys?.() || []) {
    if (!allowed.has(key)) throw integrationError("The Outreach request contains an unsupported query field.");
  }
}

function decodeRouteValue(value) {
  let decoded = "";
  try { decoded = decodeURIComponent(clean(value)); }
  catch { throw integrationError("The Campaign identifier is malformed."); }
  if (!decoded || decoded.length > 240 || decoded !== decoded.trim()
    || /[\u0000-\u001f\u007f<>"'`\\/]/u.test(decoded)
    || /^(?:javascript|data|vbscript)\s*:/i.test(decoded)
    || decoded === "." || decoded === "..") {
    throw integrationError("The Campaign identifier is invalid.");
  }
  return decoded;
}

function matchPath(pathname) {
  const path = clean(pathname);
  if (path === PREFIX) return { kind:"home" };
  const parts = path.slice(PREFIX.length + 1).split("/");
  if (parts.length < 2 || parts[0] !== "campaign") return null;
  const identity = decodeRouteValue(parts[1]);
  if (parts.length === 2) return { kind:"detail", identity };
  const action = parts[2];
  const kinds = new Map([
    ["draft", "draft"],
    ["test-send", "test_send"],
    ["assist", "assist"],
    ["review-action", "review_action"],
    ["status-action", "status_action"],
    ["reply-action", "reply_action"]
  ]);
  return parts.length === 3 && kinds.has(action) ? { kind:kinds.get(action), identity } : null;
}

function requireRequestId(value, label = "request ID") {
  const id = clean(value);
  if (!REQUEST_ID_PATTERN.test(id)) throw integrationError(`A valid ${label} is required.`);
  return id;
}

function readState(store) {
  if (typeof store?.readState !== "function") throw integrationError("Outreach storage is unavailable.", 503, "unavailable");
  return store.readState();
}

async function writeScoped(store, before, after, allowedCollections) {
  if (!after || after === before) return;
  if (typeof store?.writeChanges !== "function") throw integrationError("Scoped Outreach persistence is unavailable.", 503, "unavailable");
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]);
  const allowed = new Set(allowedCollections);
  if (keys.some((key) => !allowed.has(key))) throw integrationError("The Outreach action attempted an unsupported persistence change.", 500, "failed_closed");
  await store.writeChanges(before, after);
}

function requestAlreadyApplied(state, requestId) {
  const id = clean(requestId);
  return Boolean(id) && [
    ...list(state.auditHistory),
    ...list(state.activityEvents),
    ...list(state.approvals),
    ...list(state.companyEvents)
  ].some((item) => clean(item?.requestId) === id || clean(item?.id).endsWith(`-${id}`));
}

function auditRecord(requestId, action, identity, actor, now, extra = {}) {
  return {
    id:`audit-outreach-${action}-${requestId}`,
    requestId,
    timestamp:now,
    actor:clean(actor?.id || actor?.role) || "authenticated_user",
    action,
    resourceType:"Campaign",
    resourceId:identity,
    externalSideEffects:false,
    ...extra
  };
}

function appendAudit(state, record) {
  return { ...state, auditHistory:[record, ...list(state.auditHistory)].slice(0, 1000) };
}

function homeOptions(searchParams) {
  assertQuery(searchParams, HOME_QUERY_KEYS);
  return {
    view:searchParams?.get?.("view") || undefined,
    limit:searchParams?.get?.("limit") || undefined,
    cursor:searchParams?.get?.("cursor") || undefined
  };
}

function draftOptions(searchParams) {
  assertQuery(searchParams, DRAFT_QUERY_KEYS);
  const step = clean(searchParams?.get?.("step")) || "goal";
  if (!STEPS.has(step)) throw integrationError("The Campaign wizard step is invalid.");
  return { step, limit:searchParams?.get?.("limit") || undefined, cursor:searchParams?.get?.("cursor") || undefined };
}

function detailOptions(searchParams) {
  assertQuery(searchParams, DETAIL_QUERY_KEYS);
  const tab = clean(searchParams?.get?.("tab")) || "overview";
  if (!["overview", "messages", "audience", "replies", "results", "activity"].includes(tab)) throw integrationError("The Campaign detail tab is invalid.");
  return { tab };
}

function noQuery(searchParams) {
  assertQuery(searchParams, NO_QUERY_KEYS);
}

function buildStep(state, actor, identity, options) {
  if (options.step === "goal") return buildCampaignGoalStep(state, actor, identity);
  if (options.step === "audience") return buildCampaignAudienceStep(state, actor, identity, { limit:options.limit, cursor:options.cursor });
  if (options.step === "message") return buildCampaignMessageStep(state, actor, identity);
  if (options.step === "schedule") return buildCampaignScheduleStep(state, actor, identity);
  return buildCampaignReviewStep(state, actor, identity);
}

function renderStep(step, view) {
  if (step === "goal") return renderCampaignGoalStep(view);
  if (step === "audience") return renderCampaignAudienceStep(view);
  if (step === "message") return renderCampaignMessageStep(view);
  if (step === "schedule") return renderCampaignScheduleStep(view);
  return renderCampaignReviewStep(view);
}

function revalidatedAudienceInput(state, actor, input) {
  const selection = list(input?.fields?.selection || input?.selection);
  const partnerIds = selection.filter((item) => clean(item?.sourceKind) === "partner").map((item) => clean(item?.sourceId)).filter(Boolean);
  if (!partnerIds.length) return input;
  const validation = buildPartnerCampaignSelection(state, actor, partnerIds);
  const eligible = new Set(validation.selected.map((item) => item.id));
  const nextSelection = selection.filter((item) => clean(item?.sourceKind) !== "partner" || eligible.has(clean(item?.sourceId)));
  return { ...input, selection:nextSelection, fields:{ ...(input.fields || {}), selection:nextSelection } };
}

function savePlan(state, actor, identity, input, now) {
  const step = clean(input?.step);
  if (step === "goal") return createCampaignGoalSavePlan(state, actor, identity, input, now);
  if (step === "audience") return createCampaignAudienceSavePlan(state, actor, identity, revalidatedAudienceInput(state, actor, input), now);
  if (step === "message") return createCampaignMessageSavePlan(state, actor, identity, input, now);
  if (step === "schedule") return createCampaignScheduleSavePlan(state, actor, identity, input, now);
  if (step === "review") return createCampaignWizardSavePlan(state, actor, identity, input, now);
  throw integrationError("The Campaign wizard step is invalid.");
}

async function persistDraft(store, state, plan, actor, now) {
  if (plan?.ok === false) return { status:Number(plan.status || 400), body:plan };
  const index = list(state.campaigns).findIndex((item) => clean(item?.id) === clean(plan.scope?.id));
  if (index < 0) throw integrationError("This Campaign draft is not available.", 404, "not_available");
  const campaigns = state.campaigns.map((item, itemIndex) => itemIndex === index ? { ...item, ...plan.fields, updatedAt:now } : item);
  const requestId = `draft-${clean(plan.scope.id)}-${plan.response.draftVersion}`.replace(/[^a-z0-9_-]/gi, "_").slice(0, 159);
  const audit = auditRecord(requestId, "campaign_wizard_draft_saved", clean(plan.scope.id), actor, now, { summary:plan.audit?.summary || {} });
  const next = appendAudit({ ...state, campaigns }, audit);
  await writeScoped(store, state, next, ["campaigns", "auditHistory"]);
  return { status:200, body:{ ok:true, ...plan.response, execution:plan.execution, mutations:1, externalActions:0 } };
}

function replyClassification(state, plan, actor, now) {
  const collection = clean(plan.replyReference?.collection);
  if (!["outreachReplies", "campaignReplies", "reactivationReplies"].includes(collection)) throw integrationError("The reply source is unavailable.", 409);
  const id = clean(plan.replyReference?.id);
  const index = list(state[collection]).findIndex((item) => clean(item?.id || item?.replyId || item?.reply_id) === id);
  if (index < 0) throw integrationError("The reply is no longer available.", 409);
  const records = state[collection].map((item, itemIndex) => itemIndex === index ? {
    ...item,
    classification:plan.fields.classification,
    classificationReviewed:true,
    reviewedAt:now,
    reviewedBy:clean(actor?.id || actor?.role)
  } : item);
  const activity = {
    id:`activity-outreach-reply-${plan.requestId}`,
    requestId:plan.requestId,
    eventType:"reply_classified",
    title:"Campaign reply classification reviewed",
    sourceRef:{ collection, itemId:id },
    createdAt:now,
    metadata:{ externalAction:false }
  };
  return appendAudit({ ...state, [collection]:records, activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500) }, auditRecord(plan.requestId, "campaign_reply_classified", plan.campaignStableIdentity, actor, now, { sourceRef:{ collection, itemId:id } }));
}

function applyReplyPlan(state, plan, actor, now) {
  const options = { actor, now };
  if (plan.adapter === "scoped_reply_classification") return { state:replyClassification(state, plan, actor, now), allowed:[plan.replyReference.collection, "activityEvents", "auditHistory"] };
  if (plan.adapter === "partner_set_next_action") return { result:setPartnerNextAction(state, plan.fields.partnerId, { ...plan.fields, requestId:plan.requestId }, options), allowed:["partners", "activityEvents", "auditHistory"] };
  if (plan.adapter === "partner_log_activity") return { result:logPartnerActivity(state, plan.fields.partnerId, { ...plan.fields, requestId:plan.requestId }, options), allowed:["partners", "activityEvents", "auditHistory"] };
  if (plan.adapter === "partner_stage_suggestion") return { result:applyPartnerStageSuggestion(state, plan.fields.partnerId, { ...plan.fields, requestId:plan.requestId }, options), allowed:["partners", "activityEvents", "auditHistory"] };
  throw integrationError("The reviewed reply action is unavailable.", 503, "unavailable");
}

async function runReplyAction(store, state, actor, identity, input, now) {
  const plan = createReplyOutcomeActionPlan(state, actor, identity, input);
  if (requestAlreadyApplied(state, plan.requestId)) return { status:200, body:{ ok:true, outcome:"already_applied", duplicate:true, mutations:0, externalActions:0, partnerStageChanged:false } };
  const applied = applyReplyPlan(state, plan, actor, now);
  const next = applied.state || applied.result?.state;
  await writeScoped(store, state, next, applied.allowed);
  return { status:200, body:{ ok:true, outcome:"saved", duplicate:false, mutations:1, externalActions:0, partnerStageChanged:plan.adapter === "partner_stage_suggestion" } };
}

async function runReviewAction(store, state, actor, identity, input, now, adapters) {
  const plan = createCampaignLaunchPlan(state, actor, identity, input);
  const requestId = requireRequestId(plan.idempotencyKey, "idempotency key");
  if (requestAlreadyApplied(state, requestId)) return { status:200, body:{ ok:true, duplicate:true, executed:false, mutations:0, externalActions:0 } };
  if (plan.action === "request_approval") {
    const approvalId = `approval-outreach-${createHash("sha256").update(`${plan.campaignStableIdentity}:${requestId}`).digest("hex").slice(0, 20)}`;
    const requested = requestApproval(state, {
      id:approvalId,
      actionType:"campaign_launch",
      preview:"Review the current Campaign launch plan. Approval does not execute it.",
      riskLevel:"dangerous",
      requested_at:now
    }, { now:() => now });
    const next = appendAudit(requested.state, auditRecord(requestId, "campaign_launch_approval_requested", plan.campaignStableIdentity, actor, now, { approvalId }));
    await writeScoped(store, state, next, ["approvals", "auditHistory"]);
    return { status:200, body:{ ok:true, duplicate:false, executed:false, approvalRequested:true, approvalId, mutations:1, externalActions:0 } };
  }
  if (typeof adapters?.launchCampaign !== "function") throw integrationError("The reviewed Campaign execution adapter is unavailable. Nothing was sent.", 503, "failed_closed");
  const result = await adapters.launchCampaign({ state, actor, plan, now });
  if (!result?.state) throw integrationError("The Campaign execution did not return a scoped result.", 503, "failed_closed");
  const next = appendAudit(result.state, auditRecord(requestId, "campaign_launch_executed", plan.campaignStableIdentity, actor, now, { externalSideEffects:true }));
  await writeScoped(store, state, next, result.allowedCollections || ["campaigns", "outreachAttempts", "outreachSendClaims", "activityEvents", "auditHistory"]);
  return { status:200, body:{ ok:result.ok === true, duplicate:false, executed:true, outcome:result.outcome || null } };
}

async function runStatusAction(store, state, actor, identity, input, now, environment) {
  const plan = createCampaignStatusActionPlan(state, actor, identity, input);
  const requestId = requireRequestId(plan.idempotencyKey, "idempotency key");
  if (requestAlreadyApplied(state, requestId)) return { status:200, body:{ ok:true, duplicate:true, executed:false, mutations:0, externalActions:0 } };
  const detail = buildCampaignDetailView(state, actor, identity);
  if (!detail.available) throw integrationError("Campaign is not available.", 404, "not_available");
  if (!clean(detail.campaign.stableIdentity).startsWith("reactivation:")) throw integrationError("No reviewed status engine is available for this Campaign type.", 503, "failed_closed");
  let result;
  if (plan.action === "campaign_pause") result = pauseCampaign(state, { reason:clean(input.reason), actor:clean(actor?.id || actor?.role), now });
  else if (plan.action === "campaign_resume") result = proposeCampaignResume(state, { actor:clean(actor?.id || actor?.role), env:environment, now });
  else throw integrationError("Choose a supported Campaign status action.");
  if (!result?.ok || !result.state) throw integrationError(clean(result?.error) || "The Campaign status action was rejected.", 409, "rejected");
  const next = appendAudit(result.state, auditRecord(requestId, plan.action, detail.campaign.stableIdentity, actor, now));
  await writeScoped(store, state, next, ["reactivationCampaign", "approvals", "queueItems", "companyEvents", "agentRuns", "auditHistory"]);
  return { status:200, body:{ ok:true, duplicate:false, executed:clean(input.action) === "pause", approvalRequested:clean(input.action) === "resume", mutations:1, externalActions:0 } };
}

export async function handleOutreachApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString(),
  environment = {},
  adapters = {}
} = {}) {
  if (!isOutreachApiPath(pathname)) return { matched:false };
  try {
    const route = matchPath(pathname);
    if (!route) return { matched:true, status:404, body:{ ok:false, error:"Outreach route not found." } };
    if (!enabled) return { matched:true, status:404, body:{ ok:false, error:"Outreach is unavailable." } };
    const verb = clean(method).toUpperCase();

    if (route.kind === "home" && verb === "GET") {
      const options = homeOptions(searchParams);
      const state = await readState(store);
      return { matched:true, status:200, body:buildAuthorizedOutreachHome(state, actor, now, options) };
    }
    if (route.kind === "draft" && verb === "GET") {
      const options = draftOptions(searchParams);
      const state = await readState(store);
      const wizard = buildCampaignWizardView(state, actor, route.identity);
      const stepView = buildStep(state, actor, route.identity, options);
      return { matched:true, status:wizard.available ? 200 : 404, body:{ ...wizard, activeStep:options.step, stepView, stepHtml:renderStep(options.step, stepView) } };
    }
    if (route.kind === "draft" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      return { matched:true, ...(await persistDraft(store, state, savePlan(state, actor, route.identity, input, now), actor, now)) };
    }
    if (route.kind === "detail" && verb === "GET") {
      const options = detailOptions(searchParams);
      const state = await readState(store);
      const detail = buildCampaignDetailView(state, actor, route.identity, options);
      return { matched:true, status:detail.available ? 200 : 404, body:{ ...detail, repliesOutcomes:options.tab === "replies" ? buildCampaignRepliesOutcomes(state, actor, route.identity) : null, advancedDelivery:buildCampaignAdvancedDelivery(state, actor, route.identity) } };
    }
    if (route.kind === "reply_action" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      return { matched:true, ...(await runReplyAction(store, state, actor, route.identity, input, now)) };
    }
    if (route.kind === "review_action" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      return { matched:true, ...(await runReviewAction(store, state, actor, route.identity, input, now, adapters)) };
    }
    if (route.kind === "status_action" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      return { matched:true, ...(await runStatusAction(store, state, actor, route.identity, input, now, environment)) };
    }
    if (route.kind === "test_send" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      const requestId = requireRequestId(input?.idempotencyKey, "idempotency key");
      const plan = createCampaignTestSendPlan(state, actor, route.identity, input);
      if (typeof adapters?.sendCampaignTest !== "function") throw integrationError("The reviewed Campaign test-send adapter is unavailable. Nothing was sent.", 503, "failed_closed");
      const result = await adapters.sendCampaignTest({ state, actor, plan, requestId, now });
      return { matched:true, status:200, body:{ ok:result?.ok === true, sent:result?.sent === true, recipients:result?.sent === true ? 1 : 0 } };
    }
    if (route.kind === "assist" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      const plan = createCampaignLeeAssistPlan(state, actor, route.identity, input);
      if (typeof adapters?.assistCampaignMessage !== "function") throw integrationError("Campaign writing assistance is unavailable. The draft was not changed.", 503, "failed_closed");
      const result = await adapters.assistCampaignMessage({ state, actor, plan, now });
      return { matched:true, status:200, body:{ ok:result?.ok === true, applied:false, suggestion:result?.suggestion || null, externalActions:0 } };
    }
    return { matched:true, status:405, body:{ ok:false, error:"Outreach method not allowed." } };
  } catch (error) {
    const status = Number(error?.status || (error instanceof OutreachHomeValidationError ? 400 : 500));
    const safeStatus = [400, 403, 404, 409, 413, 503].includes(status) ? status : 500;
    return {
      matched:true,
      status:safeStatus,
      body:{
        ok:false,
        outcome:error?.outcome || (safeStatus === 403 ? "unauthorized" : safeStatus === 404 ? "not_available" : safeStatus === 409 ? "conflict" : safeStatus >= 500 ? "failed_closed" : "rejected"),
        error:safeStatus >= 500 ? clean(error?.safeMessage) || "Outreach could not complete this request. No external action occurred." : clean(error?.safeMessage || error?.message) || "The Outreach request was rejected."
      }
    };
  }
}
