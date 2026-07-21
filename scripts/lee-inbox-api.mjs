import { normalizeRole } from "./roles.mjs";
import {
  buildLeeInboxView,
  executeLeeInboxAction,
  leeInboxSafeError
} from "./lee-inbox-service.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const LEE_INBOX_PATH = "/api/ui/lee-inbox";
export const LEE_INBOX_ACTION_PATH = "/api/ui/lee-inbox/action";
export const LEE_INBOX_BODY_LIMIT = 8_192;

export function isLeeInboxApiPath(pathname = "") {
  return [LEE_INBOX_PATH, LEE_INBOX_ACTION_PATH].includes(clean(pathname));
}

function ownerOnly(actor = {}) {
  return actor?.authenticated === true && normalizeRole(actor.role) === "owner";
}

function publicMutation(result = {}) {
  const { state, collections, ...body } = result;
  return body;
}

export async function handleLeeInboxApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isLeeInboxApiPath(pathname)) return { matched:false };
  if (!enabled) {
    return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Le-E follow-ups are unavailable." } };
  }
  if (!ownerOnly(actor)) {
    return { matched:true, status:403, body:{ ok:false, outcome:"unauthorized", message:"Le-E follow-ups are available to the signed-in owner." } };
  }
  if (typeof store?.readState !== "function") {
    return { matched:true, status:503, body:{ ok:false, outcome:"temporary_failure", message:"Le-E follow-ups are temporarily unavailable." } };
  }

  const verb = clean(method).toUpperCase();
  try {
    if (pathname === LEE_INBOX_PATH && verb === "GET") {
      const allowed = new Set(["category", "search"]);
      if ([...searchParams.keys()].some((key) => !allowed.has(key))) {
        return { matched:true, status:400, body:{ ok:false, outcome:"invalid", message:"The inbox filters are invalid." } };
      }
      const body = buildLeeInboxView(await store.readState(), actor, now, {
        category:searchParams.get("category") || "",
        search:searchParams.get("search") || ""
      });
      return { matched:true, status:200, body };
    }

    if (pathname === LEE_INBOX_ACTION_PATH && verb === "POST") {
      if ([...searchParams.keys()].length) {
        return { matched:true, status:400, body:{ ok:false, outcome:"invalid", message:"The inbox action request contains unsupported filters." } };
      }
      const result = executeLeeInboxAction(await store.readState(), actor, now, input);
      if (Object.keys(result.collections || {}).length) {
        if (typeof store?.writeCollections !== "function") throw new Error("Scoped inbox persistence is unavailable.");
        await store.writeCollections(result.collections);
      }
      return { matched:true, status:200, body:publicMutation(result) };
    }

    return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Le-E inbox action not found." } };
  } catch (error) {
    const safe = leeInboxSafeError(error);
    return { matched:true, status:safe.status, body:safe.body };
  }
}
