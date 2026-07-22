import {
  RELATIONSHIP_ACTION_WRITE_COLLECTIONS,
  RelationshipActionError,
  buildRelationshipDetail,
  executeRelationshipAction,
  relationshipActionSafeError
} from "./relationship-service.mjs";

const clean = (value = "") => String(value ?? "").trim();
const ALLOWED_WRITE_COLLECTIONS = new Set(RELATIONSHIP_ACTION_WRITE_COLLECTIONS);

export const RELATIONSHIP_API_PREFIX = "/api/ui/relationships/";
export const RELATIONSHIP_ACTION_BODY_LIMIT = 20_000;

function safeId(encoded = "") {
  let decoded = "";
  try { decoded = decodeURIComponent(clean(encoded)); }
  catch { return ""; }
  if (!decoded || decoded.length > 320 || decoded !== decoded.trim()
    || /[\u0000-\u001f\u007f<>"'`\\]/u.test(decoded)
    || /^(?:javascript|data|vbscript)\s*:/i.test(decoded)
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded)) return "";
  return decoded;
}

function matchRelationshipRoute(pathname = "") {
  const path = clean(pathname);
  if (!path.startsWith(RELATIONSHIP_API_PREFIX) || path.length <= RELATIONSHIP_API_PREFIX.length) return null;
  const remainder = path.slice(RELATIONSHIP_API_PREFIX.length);
  const actionSuffix = "/action";
  const kind = remainder.endsWith(actionSuffix) ? "action" : "detail";
  const encodedId = kind === "action" ? remainder.slice(0, -actionSuffix.length) : remainder;
  if (!encodedId || encodedId.includes("/")) return { kind:"invalid", relationshipId:"" };
  const relationshipId = safeId(encodedId);
  return relationshipId ? { kind, relationshipId } : { kind:"invalid", relationshipId:"" };
}

export function isRelationshipApiPath(pathname = "") {
  return Boolean(matchRelationshipRoute(pathname));
}

function assertNoQuery(searchParams) {
  if ([...(searchParams?.keys?.() || [])].length) {
    throw new RelationshipActionError("The relationship request contains an unsupported filter. No changes were made.");
  }
}

async function readState(store) {
  if (typeof store?.readState !== "function") {
    throw new RelationshipActionError("Relationships are temporarily unavailable.", 503, "unavailable");
  }
  return store.readState();
}

async function persistScoped(store, result = {}) {
  const collections = result.collections && typeof result.collections === "object" ? result.collections : {};
  const names = Object.keys(collections);
  if (names.some((name) => !ALLOWED_WRITE_COLLECTIONS.has(name))) {
    throw new RelationshipActionError("The relationship change could not be saved safely. No changes were made.", 500, "failed_closed");
  }
  if (!names.length) return;
  if (typeof store?.writeCollections !== "function") {
    throw new RelationshipActionError("Relationship changes cannot be saved right now. No changes were made.", 503, "unavailable");
  }
  await store.writeCollections(Object.fromEntries(names.map((name) => [name, collections[name]])));
}

function mutationBody(result = {}) {
  return {
    ok:true,
    outcome:result.alreadyApplied === true ? "already_applied" : "saved",
    alreadyApplied:result.alreadyApplied === true,
    message:clean(result.result?.message) || "Relationship updated.",
    result:{ ...(result.result || {}), externalActions:0 },
    detail:result.detail,
    mutations:result.alreadyApplied === true ? 0 : Number(result.mutations || Object.keys(result.collections || {}).length),
    externalActions:0
  };
}

function safeFailure(error) {
  const safe = relationshipActionSafeError(error);
  return {
    status:[400, 403, 404, 409, 413, 503].includes(Number(safe.status)) ? Number(safe.status) : 500,
    body:{ ...safe.body, mutations:0, externalActions:0 }
  };
}

export async function handleRelationshipApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  const route = matchRelationshipRoute(pathname);
  if (!route) return { matched:false };
  if (!enabled) {
    return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Relationships are unavailable.", mutations:0, externalActions:0 } };
  }
  if (route.kind === "invalid") {
    return { matched:true, status:400, body:{ ok:false, outcome:"validation_error", message:"The relationship identifier is invalid.", mutations:0, externalActions:0 } };
  }

  const verb = clean(method).toUpperCase();
  try {
    if (route.kind === "detail" && verb === "GET") {
      assertNoQuery(searchParams);
      const view = buildRelationshipDetail(await readState(store), actor, route.relationshipId, now);
      return {
        matched:true,
        status:view.available ? 200 : view.availability?.state === "not_authorized" ? 403 : 404,
        body:{ ok:view.available, ...view, ...(!view.available ? { message:"This relationship is unavailable." } : {}) }
      };
    }

    if (route.kind === "action" && verb === "POST") {
      assertNoQuery(searchParams);
      const state = await readState(store);
      const result = executeRelationshipAction(state, actor, route.relationshipId, now, input);
      await persistScoped(store, result);
      return { matched:true, status:200, body:mutationBody(result) };
    }

    return {
      matched:true,
      status:405,
      body:{ ok:false, outcome:"method_not_allowed", message:"This relationship action is not available.", mutations:0, externalActions:0 }
    };
  } catch (error) {
    const safe = safeFailure(error);
    return { matched:true, status:safe.status, body:safe.body };
  }
}
