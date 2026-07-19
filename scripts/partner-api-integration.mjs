import {
  addPartnerFileRecord,
  buildPartnerFilesView,
  createPartnerProgramRecord,
  generatePartnerArtifact
} from "./partner-artifact-service.mjs";
import {
  applyPartnerStageSuggestion,
  buildOneToOnePartnerFollowUp,
  buildPartnerCampaignSelection,
  buildPartnerOutreachIntegration,
  createPartnerCampaignDraft
} from "./partner-outreach-integration.mjs";
import {
  completePartnerNextAction,
  logPartnerActivity,
  setPartnerNextAction
} from "./partner-record-actions.mjs";
import { buildAuthorizedPartnersHome } from "./partners-home-service.mjs";
import { buildPartnerRecordView } from "./ui/view-models/partner-record.mjs";

const clean = (value = "") => String(value ?? "").trim();
const PARTNER_PREFIX = "/api/ui/partners";
const HOME_QUERY_KEYS = new Set(["view", "search", "stage", "owner", "health", "limit", "cursor"]);
const DETAIL_QUERY_KEYS = new Set(["tab"]);
const NO_QUERY_KEYS = new Set();
const REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{15,95}$/i;

export const PARTNER_API_BODY_LIMIT = 32_000;

export const PARTNER_API_ENDPOINTS = Object.freeze([
  "GET /api/ui/partners",
  "GET /api/ui/partners/:id",
  "GET /api/ui/partners/:id/outreach",
  "GET /api/ui/partners/:id/files",
  "POST /api/ui/partners/:id/activity",
  "POST /api/ui/partners/:id/next-action",
  "POST /api/ui/partners/:id/next-action/complete",
  "POST /api/ui/partners/outreach/selection",
  "POST /api/ui/partners/outreach/campaign",
  "POST /api/ui/partners/:id/outreach/follow-up",
  "POST /api/ui/partners/:id/stage-suggestions/:suggestionId/apply",
  "POST /api/ui/partners/:id/programs",
  "POST /api/ui/partners/:id/programs/:programId/artifacts",
  "POST /api/ui/partners/:id/files"
]);

export function isPartnerApiPath(pathname = "") {
  const path = clean(pathname);
  return path === PARTNER_PREFIX || path.startsWith(`${PARTNER_PREFIX}/`);
}

function validationError(message, status = 400) {
  const error = new Error(message);
  error.name = "PartnerIntegrationError";
  error.status = status;
  error.safeMessage = message;
  return error;
}

function assertQuery(searchParams, allowed) {
  for (const key of searchParams?.keys?.() || []) {
    if (!allowed.has(key)) throw validationError("The Partner request contains an unsupported query field.");
  }
}

function decodeRouteValue(value, label) {
  let decoded = "";
  try { decoded = decodeURIComponent(clean(value)); }
  catch { throw validationError(`The ${label} identifier is malformed.`); }
  if (!decoded || decoded.length > 240 || decoded !== decoded.trim()
    || /[\u0000-\u001f\u007f<>"'`\\]/u.test(decoded)
    || /^(?:javascript|data|vbscript)\s*:/i.test(decoded)
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded)) {
    throw validationError(`The ${label} identifier is invalid.`);
  }
  return decoded;
}

function homeQuery(searchParams) {
  assertQuery(searchParams, HOME_QUERY_KEYS);
  return Object.fromEntries([...HOME_QUERY_KEYS].map((key) => [key, searchParams?.get?.(key) || undefined]));
}

function detailQuery(searchParams) {
  assertQuery(searchParams, DETAIL_QUERY_KEYS);
  const tab = clean(searchParams?.get?.("tab"));
  if (tab && !["overview", "activity", "outreach", "files"].includes(tab)) throw validationError("The Partner tab is invalid.");
  return { tab:tab || undefined };
}

function noQuery(searchParams) {
  assertQuery(searchParams, NO_QUERY_KEYS);
}

function requestId(input = {}) {
  const id = clean(input.requestId);
  if (!REQUEST_ID_PATTERN.test(id)) throw validationError("The Partner action request was invalid. Nothing was saved.");
  return id;
}

function requestAlreadyApplied(state = {}, id = "") {
  if (!id) return false;
  const exactSuffix = `-${id}`;
  const evidence = [
    ...(Array.isArray(state.activityEvents) ? state.activityEvents : []),
    ...(Array.isArray(state.auditHistory) ? state.auditHistory : []),
    ...(Array.isArray(state.campaigns) ? state.campaigns : []),
    ...(Array.isArray(state.partnerPrograms) ? state.partnerPrograms : []),
    ...(Array.isArray(state.partnerProgramArtifacts) ? state.partnerProgramArtifacts : []),
    ...(Array.isArray(state.dataRoomItems) ? state.dataRoomItems : [])
  ];
  return evidence.some((item) => clean(item?.id).endsWith(exactSuffix)
    || clean(item?.creationRequestId) === id
    || clean(item?.requestId) === id);
}

function changedCollections(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key]);
}

async function persistScopedResult(store, before, result, allowedCollections) {
  if (!result?.state || result.state === before || result.alreadyExisted || result.mutations === 0) return result;
  if (typeof store?.writeChanges !== "function") throw validationError("Scoped Partner persistence is unavailable.", 503);
  const allowed = new Set(allowedCollections);
  const changed = changedCollections(before, result.state);
  const unexpected = changed.filter((collection) => !allowed.has(collection));
  if (unexpected.length) throw validationError("The Partner action attempted an unsupported persistence change.", 500);
  const scopedAfter = { ...before };
  for (const collection of changed) scopedAfter[collection] = result.state[collection];
  await store.writeChanges(before, scopedAfter);
  return result;
}

function mutationBody(result = {}, extra = {}) {
  const alreadyExisted = result.alreadyExisted === true || result.result?.alreadyExisted === true;
  return {
    ok:true,
    outcome:alreadyExisted ? "already_applied" : "saved",
    alreadyExisted,
    mutations:Number(result.mutations ?? (alreadyExisted ? 0 : result.state ? 1 : 0)),
    externalActions:Number(result.externalActions || 0),
    sends:Number(result.sends || 0),
    enrollments:Number(result.enrollments || 0),
    approvals:Number(result.approvals || 0),
    schedules:Number(result.schedules || 0),
    uploads:Number(result.uploads || 0),
    shares:Number(result.shares || 0),
    ...extra
  };
}

async function readState(store) {
  if (typeof store?.readState !== "function") throw validationError("Partner storage is unavailable.", 503);
  return store.readState();
}

async function runMutation({ store, actor, now, input, apply, allowedCollections, response = () => ({}) }) {
  const id = requestId(input);
  const current = await readState(store);
  if (requestAlreadyApplied(current, id)) return { status:200, body:mutationBody({ alreadyExisted:true }) };
  const result = apply(current, { actor, now });
  await persistScopedResult(store, current, result, allowedCollections);
  return { status:200, body:mutationBody(result, response(result)) };
}

function matchPath(pathname) {
  const path = clean(pathname);
  if (path === PARTNER_PREFIX) return { kind:"home" };
  if (path === `${PARTNER_PREFIX}/outreach/selection`) return { kind:"selection" };
  if (path === `${PARTNER_PREFIX}/outreach/campaign`) return { kind:"campaign" };
  const parts = path.slice(PARTNER_PREFIX.length + 1).split("/");
  if (!parts[0]) return null;
  const partnerId = decodeRouteValue(parts[0], "Partner");
  if (parts.length === 1) return { kind:"record", partnerId };
  if (parts.length === 2 && parts[1] === "outreach") return { kind:"outreach", partnerId };
  if (parts.length === 2 && parts[1] === "files") return { kind:"files", partnerId };
  if (parts.length === 2 && parts[1] === "activity") return { kind:"activity", partnerId };
  if (parts.length === 2 && parts[1] === "next-action") return { kind:"next_action", partnerId };
  if (parts.length === 3 && parts[1] === "next-action" && parts[2] === "complete") return { kind:"complete_next_action", partnerId };
  if (parts.length === 3 && parts[1] === "outreach" && parts[2] === "follow-up") return { kind:"follow_up", partnerId };
  if (parts.length === 2 && parts[1] === "programs") return { kind:"program", partnerId };
  if (parts.length === 4 && parts[1] === "programs" && parts[3] === "artifacts") return { kind:"artifact", partnerId, programId:decodeRouteValue(parts[2], "Program") };
  if (parts.length === 4 && parts[1] === "stage-suggestions" && parts[3] === "apply") return { kind:"stage", partnerId, suggestionId:decodeRouteValue(parts[2], "suggestion") };
  return null;
}

export async function handlePartnerApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isPartnerApiPath(pathname)) return { matched:false };
  try {
    const route = matchPath(pathname);
    if (!route) return { matched:true, status:404, body:{ ok:false, error:"Partner route not found." } };
    if (!enabled) return { matched:true, status:404, body:{ ok:false, error:"Partners are unavailable." } };
    const verb = clean(method).toUpperCase();

    if (route.kind === "home" && verb === "GET") {
      const query = homeQuery(searchParams);
      const state = await readState(store);
      return { matched:true, status:200, body:{ ok:true, ...buildAuthorizedPartnersHome(state, actor, now, query) } };
    }
    if (route.kind === "record" && verb === "GET") {
      const query = detailQuery(searchParams);
      const state = await readState(store);
      const view = buildPartnerRecordView(state, actor, route.partnerId, now, query);
      return { matched:true, status:view.available ? 200 : 404, body:{ ok:view.available, ...view } };
    }
    if (route.kind === "outreach" && verb === "GET") {
      noQuery(searchParams);
      const state = await readState(store);
      const view = buildPartnerOutreachIntegration(state, actor, route.partnerId, now);
      return { matched:true, status:view.available ? 200 : 404, body:{ ok:view.available, ...view } };
    }
    if (route.kind === "files" && verb === "GET") {
      noQuery(searchParams);
      const state = await readState(store);
      const view = buildPartnerFilesView(state, actor, route.partnerId, now);
      return { matched:true, status:view.available ? 200 : 404, body:{ ok:view.available, ...view } };
    }
    if (route.kind === "selection" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      const selection = buildPartnerCampaignSelection(state, actor, input.partnerIds);
      return { matched:true, status:200, body:{ ok:true, ...selection, mutations:0, externalActions:0 } };
    }
    if (route.kind === "follow_up" && verb === "POST") {
      noQuery(searchParams);
      const state = await readState(store);
      return { matched:true, status:200, body:{ ok:true, ...buildOneToOnePartnerFollowUp(state, actor, route.partnerId, now) } };
    }
    if (route.kind === "activity" && verb === "POST") {
      noQuery(searchParams);
      const result = await runMutation({ store, actor, now, input, apply:(state, options) => logPartnerActivity(state, route.partnerId, input, options), allowedCollections:["partners", "activityEvents", "auditHistory"], response:(saved) => ({ activityId:saved.activity?.id || null }) });
      return { matched:true, ...result };
    }
    if (route.kind === "next_action" && verb === "POST") {
      noQuery(searchParams);
      const result = await runMutation({ store, actor, now, input, apply:(state, options) => setPartnerNextAction(state, route.partnerId, input, options), allowedCollections:["partners", "activityEvents", "auditHistory"], response:() => ({ partnerId:route.partnerId }) });
      return { matched:true, ...result };
    }
    if (route.kind === "complete_next_action" && verb === "POST") {
      noQuery(searchParams);
      const result = await runMutation({ store, actor, now, input, apply:(state, options) => completePartnerNextAction(state, route.partnerId, input, options), allowedCollections:["partners", "activityEvents", "auditHistory"], response:(saved) => ({ partnerId:route.partnerId, completedSummary:saved.completedSummary || null }) });
      return { matched:true, ...result };
    }
    if (route.kind === "campaign" && verb === "POST") {
      noQuery(searchParams);
      const result = await runMutation({ store, actor, now, input, apply:(state, options) => createPartnerCampaignDraft(state, input, options), allowedCollections:["campaigns", "activityEvents", "auditHistory"], response:(saved) => ({ campaignId:saved.record?.id || null, campaignHref:saved.record?.id ? `#outreach/campaign/${encodeURIComponent(saved.record.id)}` : null, eligiblePartners:saved.selection?.eligibleCount || 0 }) });
      return { matched:true, ...result };
    }
    if (route.kind === "stage" && verb === "POST") {
      noQuery(searchParams);
      const stageInput = { ...input, suggestionId:route.suggestionId };
      const result = await runMutation({ store, actor, now, input:stageInput, apply:(state, options) => applyPartnerStageSuggestion(state, route.partnerId, stageInput, options), allowedCollections:["partners", "activityEvents", "auditHistory"], response:(saved) => ({ partnerId:route.partnerId, uiStage:saved.suggestion?.proposedUiStage || null }) });
      return { matched:true, ...result };
    }
    if (route.kind === "program" && verb === "POST") {
      noQuery(searchParams);
      const result = await runMutation({ store, actor, now, input, apply:(state, options) => createPartnerProgramRecord(state, route.partnerId, input, options), allowedCollections:["partnerPrograms", "activityEvents", "auditHistory"], response:(saved) => ({ partnerId:route.partnerId, programId:saved.program?.id || null }) });
      return { matched:true, ...result };
    }
    if (route.kind === "artifact" && verb === "POST") {
      noQuery(searchParams);
      const result = await runMutation({ store, actor, now, input, apply:(state, options) => generatePartnerArtifact(state, route.partnerId, route.programId, input, options), allowedCollections:["partnerProgramArtifacts", "reports", "activityEvents", "auditHistory"], response:(saved) => ({ partnerId:route.partnerId, artifactId:saved.artifact?.id || null, fileId:saved.file?.id || null }) });
      return { matched:true, ...result };
    }
    if (route.kind === "files" && verb === "POST") {
      noQuery(searchParams);
      const fileInput = { ...input, creationRequestId:input.requestId };
      const result = await runMutation({ store, actor, now, input, apply:(state, options) => addPartnerFileRecord(state, route.partnerId, fileInput, options), allowedCollections:["dataRoomItems", "activityEvents", "auditHistory"], response:(saved) => ({ partnerId:route.partnerId, fileId:saved.record?.id || null }) });
      return { matched:true, ...result };
    }
    return { matched:true, status:405, body:{ ok:false, error:"Partner method not allowed." } };
  } catch (error) {
    const status = Number(error?.status || 500);
    return {
      matched:true,
      status:[400, 403, 404, 409, 413, 503].includes(status) ? status : 500,
      body:{
        ok:false,
        outcome:status === 403 ? "unauthorized" : status === 404 ? "not_available" : status === 409 ? "conflict" : "validation_or_recoverable_error",
        error:status >= 500 ? "Partner request could not be completed. No external action occurred." : clean(error?.safeMessage || error?.message) || "Partner request was rejected."
      }
    };
  }
}
