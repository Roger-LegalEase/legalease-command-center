import { buildRelationshipDetail } from "./relationship-service.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const RELATIONSHIP_API_PREFIX = "/api/ui/relationships/";

function safeId(pathname = "") {
  const encoded = clean(pathname).slice(RELATIONSHIP_API_PREFIX.length);
  let decoded = "";
  try { decoded = decodeURIComponent(encoded); }
  catch { return ""; }
  if (!decoded || decoded.length > 320 || decoded !== decoded.trim()
    || /[\u0000-\u001f\u007f<>"'`\\]/u.test(decoded)
    || /^(?:javascript|data|vbscript)\s*:/i.test(decoded)
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded)) return "";
  return decoded;
}

export function isRelationshipApiPath(pathname = "") {
  const path = clean(pathname);
  return path.startsWith(RELATIONSHIP_API_PREFIX) && path.length > RELATIONSHIP_API_PREFIX.length;
}

export async function handleRelationshipApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isRelationshipApiPath(pathname)) return { matched:false };
  if (!enabled || clean(method).toUpperCase() !== "GET") {
    return { matched:true, status:404, body:{ ok:false, message:"Relationship details are unavailable." } };
  }
  if ([...searchParams.keys()].length) {
    return { matched:true, status:400, body:{ ok:false, message:"The relationship request contains an unsupported filter." } };
  }
  const relationshipId = safeId(pathname);
  if (!relationshipId) {
    return { matched:true, status:400, body:{ ok:false, message:"The relationship identifier is invalid." } };
  }
  if (typeof store?.readState !== "function") {
    return { matched:true, status:503, body:{ ok:false, message:"Relationship details are temporarily unavailable." } };
  }
  try {
    const view = buildRelationshipDetail(await store.readState(), actor, relationshipId, now);
    return {
      matched:true,
      status:view.available ? 200 : view.availability?.state === "not_authorized" ? 403 : 404,
      body:{ ok:view.available, ...view, ...(!view.available ? { message:"This relationship is unavailable." } : {}) }
    };
  } catch {
    return { matched:true, status:500, body:{ ok:false, message:"Relationship details could not load. No changes were made." } };
  }
}
