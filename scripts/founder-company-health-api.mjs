import {
  buildFounderCompanyHealth,
  FOUNDER_COMPANY_HEALTH_ENDPOINT
} from "./founder-company-health-service.mjs";

const clean = (value = "") => String(value ?? "").trim();
const ALLOWED_QUERY_FIELDS = new Set(["advanced"]);

export const FOUNDER_COMPANY_HEALTH_API_ENDPOINTS = Object.freeze([
  `GET ${FOUNDER_COMPANY_HEALTH_ENDPOINT}`,
  `GET ${FOUNDER_COMPANY_HEALTH_ENDPOINT}?advanced=true`
]);

export function isFounderCompanyHealthApiPath(pathname = "") {
  return clean(pathname) === FOUNDER_COMPANY_HEALTH_ENDPOINT;
}

function apiError(message, status = 400, outcome = "validation_error") {
  const error = new Error(message);
  error.name = "FounderCompanyHealthApiError";
  error.status = status;
  error.outcome = outcome;
  error.safeMessage = message;
  return error;
}

function optionsFromQuery(searchParams) {
  for (const key of searchParams?.keys?.() || []) {
    if (!ALLOWED_QUERY_FIELDS.has(key)) throw apiError("The Company Health request contains an unsupported field.");
  }
  const values = searchParams?.getAll?.("advanced") || [];
  if (!values.length) return { advanced:false };
  if (values.length !== 1 || !["true", "false"].includes(clean(values[0]).toLowerCase())) {
    throw apiError("Choose whether to show advanced checks once.");
  }
  return { advanced:clean(values[0]).toLowerCase() === "true" };
}

async function readState(store) {
  if (typeof store?.readState !== "function") {
    throw apiError("Company Health is temporarily unavailable.", 503, "unavailable");
  }
  return store.readState();
}

function safeStatus(error) {
  const status = Number(error?.status || 500);
  return [400, 403, 404, 409, 503].includes(status) ? status : 500;
}

function safeMessage(error, status) {
  if (clean(error?.safeMessage)) return clean(error.safeMessage);
  if (status >= 500) return "Company Health could not load. No settings were changed.";
  return clean(error?.message) || "The Company Health request could not be completed.";
}

export async function handleFounderCompanyHealthApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isFounderCompanyHealthApiPath(pathname)) return { matched:false };
  if (!enabled) {
    return {
      matched:true,
      status:404,
      body:{ ok:false, outcome:"not_available", message:"Company Health is unavailable." }
    };
  }

  try {
    if (clean(method).toUpperCase() !== "GET") {
      return {
        matched:true,
        status:405,
        body:{ ok:false, outcome:"method_not_allowed", message:"Company Health is read-only." }
      };
    }
    const options = optionsFromQuery(searchParams);
    const state = await readState(store);
    const health = buildFounderCompanyHealth(state, actor, now, options);
    return {
      matched:true,
      status:health.available ? 200 : health.availability?.state === "not_authorized" ? 403 : 503,
      body:{
        ok:health.available === true,
        health,
        mutations:0,
        externalActions:0
      }
    };
  } catch (error) {
    const status = safeStatus(error);
    return {
      matched:true,
      status,
      body:{
        ok:false,
        outcome:status === 403 ? "unauthorized" : status === 503 ? "unavailable" : status >= 500 ? "failed_closed" : clean(error?.outcome) || "validation_error",
        message:safeMessage(error, status),
        mutations:0,
        externalActions:0
      }
    };
  }
}
