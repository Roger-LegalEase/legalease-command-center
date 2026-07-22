import { normalizeRole, roleHasCapability } from "./roles.mjs";
import {
  FounderCalendarError,
  buildFounderCalendarView,
  buildGoogleCalendarCreateUrl,
  executeFounderCalendarAction,
  founderCalendarSafeError
} from "./founder-calendar-service.mjs";

const clean = (value = "") => String(value ?? "").trim();
const ALLOWED_WRITE_COLLECTIONS = new Set(["tasks", "auditHistory", "activityEvents"]);
const VIEW_QUERY_FIELDS = new Set(["range", "category", "search", "timeZone"]);
const CREATE_LINK_FIELDS = new Set(["title", "start", "end", "details", "location"]);

export const FOUNDER_CALENDAR_VIEW_PATH = "/api/ui/calendar";
export const FOUNDER_CALENDAR_ACTION_PATH = "/api/ui/calendar/action";
export const FOUNDER_CALENDAR_CREATE_LINK_PATH = "/api/ui/calendar/create-link";
export const FOUNDER_CALENDAR_API_BODY_LIMIT = 16 * 1024;
export const FOUNDER_CALENDAR_API_ROUTES = Object.freeze([
  `GET ${FOUNDER_CALENDAR_VIEW_PATH}`,
  `POST ${FOUNDER_CALENDAR_ACTION_PATH}`,
  `POST ${FOUNDER_CALENDAR_CREATE_LINK_PATH}`
]);

export function isFounderCalendarApiPath(pathname = "") {
  const path = clean(pathname);
  return [
    FOUNDER_CALENDAR_VIEW_PATH,
    FOUNDER_CALENDAR_ACTION_PATH,
    FOUNDER_CALENDAR_CREATE_LINK_PATH
  ].includes(path);
}

function apiError(message, status = 400, outcome = "invalid") {
  return new FounderCalendarError(message, status, outcome);
}

function queryKeys(searchParams) {
  return [...(searchParams?.keys?.() || [])];
}

function assertNoQuery(searchParams) {
  if (queryKeys(searchParams).length) {
    throw apiError("The Calendar action contains an unsupported filter. No changes were made.");
  }
}

function calendarQuery(searchParams) {
  const keys = queryKeys(searchParams);
  if (keys.some((key) => !VIEW_QUERY_FIELDS.has(key))) {
    throw apiError("The Calendar filters contain an unsupported field.");
  }
  for (const key of VIEW_QUERY_FIELDS) {
    if ((searchParams?.getAll?.(key) || []).length > 1) {
      throw apiError("Choose each Calendar filter only once.");
    }
  }
  return {
    range:clean(searchParams?.get?.("range")) || "all",
    category:clean(searchParams?.get?.("category")),
    search:clean(searchParams?.get?.("search")),
    timeZone:clean(searchParams?.get?.("timeZone")) || "America/Chicago"
  };
}

function createLinkInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw apiError("Enter valid event details. No changes were made.");
  }
  if (Object.keys(input).some((key) => !CREATE_LINK_FIELDS.has(key))) {
    throw apiError("The event contains unsupported information. No changes were made.");
  }
  return Object.fromEntries([...CREATE_LINK_FIELDS].map((key) => [key, clean(input[key])]).filter(([, value]) => value));
}

function canReadCalendar(actor = {}) {
  const role = normalizeRole(actor.role);
  return actor?.authenticated === true && Boolean(clean(actor.id)) && roleHasCapability(role, "read_internal");
}

async function readState(store) {
  if (typeof store?.readState !== "function") {
    throw apiError("Calendar is temporarily unavailable.", 503, "unavailable");
  }
  return store.readState();
}

async function persistScoped(store, result = {}) {
  const collections = result.collections && typeof result.collections === "object" ? result.collections : {};
  const names = Object.keys(collections);
  if (names.some((name) => !ALLOWED_WRITE_COLLECTIONS.has(name))) {
    throw apiError("The Calendar task could not be saved safely. No changes were made.", 500, "failed_closed");
  }
  if (!names.length) return;
  if (typeof store?.writeCollections !== "function") {
    throw apiError("Calendar tasks cannot be saved right now. No changes were made.", 503, "unavailable");
  }
  await store.writeCollections(Object.fromEntries(names.map((name) => [name, collections[name]])));
}

function readBody(view) {
  if (view.authorized !== true || view.available !== true) {
    return {
      ...view,
      ok:false,
      message:"Calendar is available to an authorized signed-in account.",
      mutations:0,
      externalActions:0
    };
  }
  return {
    ...view,
    ok:true,
    mutations:0,
    externalActions:0,
    safety:{ ...view.safety, fullStateReturned:false, calendarWrites:false }
  };
}

function mutationBody(result = {}) {
  const publicResult = result.result && typeof result.result === "object" ? result.result : {};
  return {
    ok:result.ok === true,
    outcome:result.alreadyApplied === true ? "already_applied" : "saved",
    alreadyApplied:result.alreadyApplied === true,
    message:clean(publicResult.message) || "Calendar task created.",
    result:{ ...publicResult, calendarChanged:false, invitationSent:false, externalActions:0 },
    mutations:result.alreadyApplied === true ? 0 : Object.keys(result.collections || {}).length,
    calendarWrites:0,
    externalActions:0
  };
}

function safeFailure(error) {
  const safe = founderCalendarSafeError(error);
  return {
    status:[400, 403, 409, 413, 503].includes(Number(safe.status)) ? Number(safe.status) : 500,
    body:{
      ...safe.body,
      mutations:0,
      calendarWrites:0,
      invitationSent:false,
      externalActions:0
    }
  };
}

export async function handleFounderCalendarApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isFounderCalendarApiPath(pathname)) return { matched:false };
  if (!enabled) {
    return {
      matched:true,
      status:404,
      body:{ ok:false, outcome:"not_available", message:"Calendar is unavailable.", mutations:0, calendarWrites:0, externalActions:0 }
    };
  }

  const verb = clean(method).toUpperCase();
  try {
    if (pathname === FOUNDER_CALENDAR_VIEW_PATH && verb === "GET") {
      const query = calendarQuery(searchParams);
      const state = await readState(store);
      const body = readBody(buildFounderCalendarView(state, actor, now, query));
      return { matched:true, status:body.ok ? 200 : 403, body };
    }

    if (pathname === FOUNDER_CALENDAR_ACTION_PATH && verb === "POST") {
      assertNoQuery(searchParams);
      const state = await readState(store);
      const result = executeFounderCalendarAction(state, actor, now, input);
      await persistScoped(store, result);
      return { matched:true, status:200, body:mutationBody(result) };
    }

    if (pathname === FOUNDER_CALENDAR_CREATE_LINK_PATH && verb === "POST") {
      assertNoQuery(searchParams);
      if (!canReadCalendar(actor)) {
        throw apiError("This Calendar action is not available for this account.", 403, "not_allowed");
      }
      const href = buildGoogleCalendarCreateUrl(createLinkInput(input));
      return {
        matched:true,
        status:200,
        body:{
          ok:true,
          outcome:"prepared",
          message:"Google Calendar event details are ready to review.",
          href,
          provider:"Google Calendar",
          mutations:0,
          calendarWrites:0,
          invitationSent:false,
          externalActions:0
        }
      };
    }

    return {
      matched:true,
      status:405,
      body:{ ok:false, outcome:"method_not_allowed", message:"This Calendar action is not available.", mutations:0, calendarWrites:0, externalActions:0 }
    };
  } catch (error) {
    const safe = safeFailure(error);
    return { matched:true, status:safe.status, body:safe.body };
  }
}
