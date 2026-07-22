import { buildRelationshipsView } from "./relationship-service.mjs";
import {
  FounderSupportError,
  buildFounderSupportView,
  executeFounderSupportAction,
  founderSupportSafeError
} from "./founder-support-service.mjs";

const clean = (value = "") => String(value ?? "").trim();
const ALLOWED_WRITE_COLLECTIONS = new Set([
  "supportIssues",
  "inboxSignals",
  "tasks",
  "auditHistory",
  "activityEvents"
]);
const VIEW_QUERY_FIELDS = new Set(["lane", "search", "includeResolved"]);

export const FOUNDER_SUPPORT_VIEW_PATH = "/api/ui/support";
export const FOUNDER_SUPPORT_ACTION_PATH = "/api/ui/support/action";
export const FOUNDER_SUPPORT_API_BODY_LIMIT = 16 * 1024;
export const FOUNDER_SUPPORT_API_ROUTES = Object.freeze([
  `GET ${FOUNDER_SUPPORT_VIEW_PATH}`,
  `POST ${FOUNDER_SUPPORT_ACTION_PATH}`
]);

export function isFounderSupportApiPath(pathname = "") {
  const path = clean(pathname);
  return path === FOUNDER_SUPPORT_VIEW_PATH || path === FOUNDER_SUPPORT_ACTION_PATH;
}

function apiError(message, status = 400, outcome = "invalid") {
  return new FounderSupportError(message, status, outcome);
}

function queryKeys(searchParams) {
  return [...(searchParams?.keys?.() || [])];
}

function assertNoQuery(searchParams) {
  if (queryKeys(searchParams).length) {
    throw apiError("The Support action contains an unsupported filter. No changes were made.");
  }
}

function supportQuery(searchParams) {
  const keys = queryKeys(searchParams);
  if (keys.some((key) => !VIEW_QUERY_FIELDS.has(key))) {
    throw apiError("The Support filters contain an unsupported field.");
  }
  for (const key of VIEW_QUERY_FIELDS) {
    if ((searchParams?.getAll?.(key) || []).length > 1) {
      throw apiError("Choose each Support filter only once.");
    }
  }
  const includeRaw = clean(searchParams?.get?.("includeResolved"));
  if (includeRaw && !["true", "false", "1", "0"].includes(includeRaw.toLowerCase())) {
    throw apiError("Choose whether resolved Support issues should be shown.");
  }
  return {
    lane:clean(searchParams?.get?.("lane")),
    search:clean(searchParams?.get?.("search")),
    includeResolved:includeRaw ? ["true", "1"].includes(includeRaw.toLowerCase()) : true
  };
}

async function readState(store) {
  if (typeof store?.readState !== "function") {
    throw apiError("Support is temporarily unavailable.", 503, "unavailable");
  }
  return store.readState();
}

async function persistScoped(store, result = {}) {
  const collections = result.collections && typeof result.collections === "object" ? result.collections : {};
  const names = Object.keys(collections);
  if (names.some((name) => !ALLOWED_WRITE_COLLECTIONS.has(name))) {
    throw apiError("The Support change could not be saved safely. No changes were made.", 500, "failed_closed");
  }
  if (!names.length) return;
  if (typeof store?.writeCollections !== "function") {
    throw apiError("Support changes cannot be saved right now. No changes were made.", 503, "unavailable");
  }
  await store.writeCollections(Object.fromEntries(names.map((name) => [name, collections[name]])));
}

function relationshipOptions(state, actor, now) {
  try {
    const view = buildRelationshipsView(state, actor, now, { limit:100 });
    if (view.available !== true) return [];
    return view.items.map((item) => ({
      id:clean(item.id),
      label:clean(item.name || item.organization) || "Relationship",
      organization:clean(item.organization),
      category:clean(item.category?.label)
    })).filter((item) => item.id).sort((left, right) => left.label.localeCompare(right.label, "en-US"));
  } catch {
    return [];
  }
}

function readBody(view, state, actor, now) {
  if (view.authorized !== true || view.available !== true) {
    return {
      ...view,
      ok:false,
      message:"Support is available to an authorized signed-in account.",
      relationshipOptions:[],
      mutations:0,
      externalActions:0
    };
  }
  return {
    ...view,
    ok:true,
    relationshipOptions:relationshipOptions(state, actor, now),
    mutations:0,
    externalActions:0,
    safety:{ ...view.safety, fullStateReturned:false, responseSendAvailable:false }
  };
}

function mutationBody(result = {}) {
  const publicResult = result.result && typeof result.result === "object" ? result.result : {};
  return {
    ok:result.ok === true,
    outcome:result.alreadyApplied === true ? "already_applied" : "saved",
    alreadyApplied:result.alreadyApplied === true,
    message:clean(publicResult.message) || "Support issue updated.",
    result:{ ...publicResult, responseSent:false, externalActions:0 },
    mutations:result.alreadyApplied === true ? 0 : Object.keys(result.collections || {}).length,
    externalActions:0
  };
}

function safeFailure(error) {
  const safe = founderSupportSafeError(error);
  return {
    status:[400, 403, 409, 413, 503].includes(Number(safe.status)) ? Number(safe.status) : 500,
    body:{
      ...safe.body,
      mutations:0,
      responseSent:false,
      externalActions:0
    }
  };
}

export async function handleFounderSupportApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isFounderSupportApiPath(pathname)) return { matched:false };
  if (!enabled) {
    return {
      matched:true,
      status:404,
      body:{ ok:false, outcome:"not_available", message:"Support is unavailable.", mutations:0, externalActions:0 }
    };
  }

  const verb = clean(method).toUpperCase();
  try {
    if (pathname === FOUNDER_SUPPORT_VIEW_PATH && verb === "GET") {
      const query = supportQuery(searchParams);
      const state = await readState(store);
      const view = buildFounderSupportView(state, actor, now, query);
      const body = readBody(view, state, actor, now);
      return { matched:true, status:body.ok ? 200 : 403, body };
    }

    if (pathname === FOUNDER_SUPPORT_ACTION_PATH && verb === "POST") {
      assertNoQuery(searchParams);
      const state = await readState(store);
      const result = executeFounderSupportAction(state, actor, now, input);
      await persistScoped(store, result);
      return { matched:true, status:200, body:mutationBody(result) };
    }

    return {
      matched:true,
      status:405,
      body:{ ok:false, outcome:"method_not_allowed", message:"This Support action is not available.", mutations:0, externalActions:0 }
    };
  } catch (error) {
    const safe = safeFailure(error);
    return { matched:true, status:safe.status, body:safe.body };
  }
}
