import {
  buildCommunicationContext,
  communicationComposerSafeError,
  markCommunicationDraftSentManually,
  saveCommunicationDraft
} from "./communication-composer-service.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const COMMUNICATION_COMPOSER_BODY_LIMIT = 20_000;
export const COMMUNICATION_CONTEXT_PATH = "/api/ui/communications/context";
export const COMMUNICATION_DRAFTS_PATH = "/api/ui/communications/drafts";

function manualSentMatch(pathname = "") {
  const match = clean(pathname).match(/^\/api\/ui\/communications\/drafts\/([^/]+)\/manual-sent$/);
  if (!match) return null;
  let draftId = "";
  try { draftId = decodeURIComponent(match[1]); }
  catch { return { invalid:true, draftId:"" }; }
  if (!draftId || draftId.length > 240 || /[\u0000-\u001f\u007f<>"'`\\]/u.test(draftId)) return { invalid:true, draftId:"" };
  return { invalid:false, draftId };
}

export function isCommunicationComposerApiPath(pathname = "") {
  const path = clean(pathname);
  return path === COMMUNICATION_CONTEXT_PATH
    || path === COMMUNICATION_DRAFTS_PATH
    || Boolean(manualSentMatch(path));
}

function publicMutation(result = {}) {
  const { state, collections, ...body } = result;
  return body;
}

async function persist(store, result) {
  if (Object.keys(result.collections || {}).length) {
    if (typeof store?.writeCollections !== "function") throw new Error("Scoped draft persistence is unavailable.");
    await store.writeCollections(result.collections);
  }
}

export async function handleCommunicationComposerApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isCommunicationComposerApiPath(pathname)) return { matched:false };
  if (!enabled) return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Follow-up drafting is unavailable." } };
  const verb = clean(method).toUpperCase();
  try {
    if (pathname === COMMUNICATION_CONTEXT_PATH && verb === "GET") {
      const keys = [...searchParams.keys()];
      if (keys.some((key) => !["sourceKind", "sourceId"].includes(key))) {
        return { matched:true, status:400, body:{ ok:false, outcome:"validation_error", message:"The follow-up request contains an unsupported field." } };
      }
      if (typeof store?.readState !== "function") throw new Error("Draft context storage is unavailable.");
      const body = buildCommunicationContext(
        await store.readState(),
        actor,
        searchParams.get("sourceKind") || "",
        searchParams.get("sourceId") || "",
        { now }
      );
      return { matched:true, status:200, body };
    }
    if (pathname === COMMUNICATION_DRAFTS_PATH && verb === "POST") {
      if ([...searchParams.keys()].length) return { matched:true, status:400, body:{ ok:false, outcome:"validation_error", message:"The draft request contains an unsupported filter." } };
      const current = await store.readState();
      const result = saveCommunicationDraft(current, actor, input, { now });
      await persist(store, result);
      return { matched:true, status:200, body:publicMutation(result) };
    }
    const manual = manualSentMatch(pathname);
    if (manual && verb === "POST") {
      if (manual.invalid || [...searchParams.keys()].length) return { matched:true, status:400, body:{ ok:false, outcome:"validation_error", message:"The sent interaction request is invalid." } };
      const current = await store.readState();
      const result = markCommunicationDraftSentManually(current, actor, manual.draftId, input, { now });
      await persist(store, result);
      return { matched:true, status:200, body:publicMutation(result) };
    }
    return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Follow-up action not found." } };
  } catch (error) {
    const safe = communicationComposerSafeError(error);
    return { matched:true, status:safe.status, body:safe.body };
  }
}
