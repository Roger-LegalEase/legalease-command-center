import {
  buildWeeklySocialPlan,
  createWeeklySocialPlan,
  exportWeeklySocialPlan,
  recordWeeklySocialPublication,
  recordWeeklySocialResults,
  SOCIAL_WEEKLY_PLANNER_READ_COLLECTIONS,
  SocialWeeklyPlannerError,
  socialWeeklyPlannerSafeError,
  updateWeeklySocialPost
} from "./social-weekly-planner-service.mjs";

const clean = (value = "") => String(value ?? "").trim();
const ALLOWED_WRITE_COLLECTIONS = new Set(["posts", "activityEvents", "auditHistory"]);
const NO_QUERY = new Set();

export const SOCIAL_WEEKLY_API_BODY_LIMIT = 128 * 1024;
export const SOCIAL_WEEKLY_API_PREFIX = "/api/ui/social/weekly";
export const SOCIAL_WEEKLY_API_ROUTES = Object.freeze([
  "GET /api/ui/social/weekly?week=YYYY-MM-DD",
  "POST /api/ui/social/weekly",
  "POST /api/ui/social/weekly/posts/:postId",
  "POST /api/ui/social/weekly/posts/:postId/manual-publication",
  "POST /api/ui/social/weekly/posts/:postId/results",
  "POST /api/ui/social/weekly/export"
]);

function apiError(message, status = 400, outcome = "validation_error", field = "") {
  return new SocialWeeklyPlannerError(message, status, outcome, field);
}

function decodeId(value = "") {
  let decoded = "";
  try { decoded = decodeURIComponent(clean(value)); }
  catch { throw apiError("The Post identifier is malformed.", 400, "validation_error", "postId"); }
  if (!decoded || decoded.length > 240 || decoded !== decoded.trim()
    || /[\u0000-\u001f\u007f<>"'`\\]/u.test(decoded)
    || /^(?:javascript|data|vbscript)\s*:/iu.test(decoded)
    || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(decoded)) {
    throw apiError("The Post identifier is invalid.", 400, "validation_error", "postId");
  }
  return decoded;
}

function routeFor(pathname = "") {
  const path = clean(pathname);
  if (path === SOCIAL_WEEKLY_API_PREFIX) return { kind:"weekly" };
  if (path === `${SOCIAL_WEEKLY_API_PREFIX}/export`) return { kind:"export" };
  if (!path.startsWith(`${SOCIAL_WEEKLY_API_PREFIX}/posts/`)) return null;
  const remainder = path.slice(`${SOCIAL_WEEKLY_API_PREFIX}/posts/`.length);
  const parts = remainder.split("/");
  if (!parts[0] || parts.length > 2) return null;
  const postId = decodeId(parts[0]);
  if (parts.length === 1) return { kind:"update", postId };
  if (parts[1] === "manual-publication") return { kind:"manual_publication", postId };
  if (parts[1] === "results") return { kind:"results", postId };
  return null;
}

export function isSocialWeeklyPlannerApiPath(pathname = "") {
  const path = clean(pathname);
  return path === SOCIAL_WEEKLY_API_PREFIX || path.startsWith(`${SOCIAL_WEEKLY_API_PREFIX}/`);
}

function queryKeys(searchParams) {
  return [...(searchParams?.keys?.() || [])];
}

function assertNoQuery(searchParams) {
  for (const key of queryKeys(searchParams)) if (!NO_QUERY.has(key)) throw apiError("The Social action contains an unsupported filter.");
}

function weekQuery(searchParams) {
  const keys = queryKeys(searchParams);
  if (keys.some((key) => key !== "week") || (searchParams?.getAll?.("week") || []).length !== 1) {
    throw apiError("Choose one week to open.", 400, "validation_error", "week");
  }
  return clean(searchParams.get("week"));
}

async function readState(store) {
  if (typeof store?.readCollections !== "function") throw apiError("Social plan storage is unavailable.", 503, "unavailable");
  return store.readCollections(SOCIAL_WEEKLY_PLANNER_READ_COLLECTIONS);
}

async function persistScoped(store, result = {}) {
  const collections = result.collections && typeof result.collections === "object" ? result.collections : {};
  const names = Object.keys(collections);
  const unexpected = names.filter((name) => !ALLOWED_WRITE_COLLECTIONS.has(name));
  if (unexpected.length) throw apiError("The Social action attempted an unsupported persistence change.", 500, "failed_closed");
  if (!names.length) return;
  if (typeof store?.writeCollections !== "function") throw apiError("Scoped Social persistence is unavailable.", 503, "unavailable");
  await store.writeCollections(Object.fromEntries(names.map((name) => [name, collections[name]])));
}

function createBody(result = {}) {
  return {
    ok:result.ok === true,
    outcome:result.alreadyExisted ? "already_applied" : "saved",
    alreadyExisted:result.alreadyExisted === true,
    externalActions:Number(result.externalActions || 0),
    postingProviderCalls:0,
    message:clean(result.message),
    plan:result.plan || null,
    posts:Array.isArray(result.posts) ? result.posts : []
  };
}

function postMutationBody(result = {}, outcome = "saved") {
  return {
    ok:result.ok === true,
    outcome:result.alreadyExisted ? "already_applied" : outcome,
    alreadyExisted:result.alreadyExisted === true,
    externalActions:Number(result.externalActions || 0),
    postingProviderCalls:0,
    message:clean(result.message),
    post:result.post || null,
    ...(typeof result.allPlatformsRecorded === "boolean" ? { allPlatformsRecorded:result.allPlatformsRecorded } : {}),
    ...(clean(result.nextStep) ? { nextStep:clean(result.nextStep) } : {})
  };
}

function exportInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw apiError("The Social export request is invalid.");
  const keys = Object.keys(input);
  if (keys.some((key) => !["week", "format"].includes(key))) throw apiError("The Social export request contains unsupported information.");
  return { week:clean(input.week), format:clean(input.format || "markdown").toLowerCase() };
}

function exportBody(plan, format) {
  const content = exportWeeklySocialPlan(plan, format);
  const extension = format === "json" ? "json" : format === "text" ? "txt" : "md";
  const mimeType = format === "json" ? "application/json" : "text/plain; charset=utf-8";
  return {
    ok:true,
    outcome:"exported",
    format,
    filename:`social-plan-${plan.week.start}.${extension}`,
    mimeType,
    content,
    externalActions:0,
    postingProviderCalls:0
  };
}

export async function handleSocialWeeklyPlannerApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isSocialWeeklyPlannerApiPath(pathname)) return { matched:false };
  if (!enabled) return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Weekly Social planning is unavailable." } };
  try {
    const route = routeFor(pathname);
    if (!route) return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Social action not found." } };
    const verb = clean(method).toUpperCase();

    if (route.kind === "weekly" && verb === "GET") {
      const week = weekQuery(searchParams);
      const state = await readState(store);
      return { matched:true, status:200, body:buildWeeklySocialPlan(state, actor, week, { now }) };
    }
    if (route.kind === "weekly" && verb === "POST") {
      assertNoQuery(searchParams);
      const current = await readState(store);
      const result = createWeeklySocialPlan(current, actor, input, { now });
      await persistScoped(store, result);
      return { matched:true, status:200, body:createBody(result) };
    }
    if (route.kind === "update" && verb === "POST") {
      assertNoQuery(searchParams);
      const current = await readState(store);
      const result = updateWeeklySocialPost(current, actor, route.postId, input, { now });
      await persistScoped(store, result);
      return { matched:true, status:200, body:postMutationBody(result) };
    }
    if (route.kind === "manual_publication" && verb === "POST") {
      assertNoQuery(searchParams);
      const current = await readState(store);
      const result = recordWeeklySocialPublication(current, actor, route.postId, input, { now });
      await persistScoped(store, result);
      return { matched:true, status:200, body:postMutationBody(result, "recorded") };
    }
    if (route.kind === "results" && verb === "POST") {
      assertNoQuery(searchParams);
      const current = await readState(store);
      const result = recordWeeklySocialResults(current, actor, route.postId, input, { now });
      await persistScoped(store, result);
      return { matched:true, status:200, body:postMutationBody(result) };
    }
    if (route.kind === "export" && verb === "POST") {
      assertNoQuery(searchParams);
      const requested = exportInput(input);
      const state = await readState(store);
      const plan = buildWeeklySocialPlan(state, actor, requested.week, { now });
      return { matched:true, status:200, body:exportBody(plan, requested.format) };
    }
    return { matched:true, status:405, body:{ ok:false, outcome:"method_not_allowed", message:"Social action not allowed." } };
  } catch (error) {
    if (error instanceof SocialWeeklyPlannerError && Number(error.status) === 503) {
      return {
        matched:true,
        status:503,
        body:{ ok:false, outcome:clean(error.outcome) || "unavailable", message:clean(error.safeMessage) || "Scoped Social persistence is unavailable." }
      };
    }
    const safe = socialWeeklyPlannerSafeError(error);
    return { matched:true, status:safe.status, body:safe.body };
  }
}
