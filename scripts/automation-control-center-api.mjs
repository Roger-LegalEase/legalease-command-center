import { buildAutomationControlCenterView } from "./automation-control-center-service.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const AUTOMATION_CONTROL_CENTER_ENDPOINT = "/api/ui/automation-control-center";
export const AUTOMATION_CONTROL_CENTER_API_ENDPOINTS = Object.freeze([
  `GET ${AUTOMATION_CONTROL_CENTER_ENDPOINT}`
]);

export function isAutomationControlCenterApiPath(pathname = "") {
  return clean(pathname) === AUTOMATION_CONTROL_CENTER_ENDPOINT;
}

function apiError(message, status = 400, outcome = "validation_error") {
  const error = new Error(message);
  error.name = "AutomationControlCenterApiError";
  error.status = status;
  error.outcome = outcome;
  error.safeMessage = message;
  return error;
}

function assertNoQuery(searchParams) {
  if ([...(searchParams?.keys?.() || [])].length) {
    throw apiError("The automation review request contains an unsupported filter.");
  }
}

async function readState(store) {
  if (typeof store?.readState !== "function") {
    throw apiError("Automation review is temporarily unavailable.", 503, "unavailable");
  }
  return store.readState();
}

function safeStatus(error) {
  const status = Number(error?.status || 500);
  return [400, 403, 404, 405, 503].includes(status) ? status : 500;
}

function safeMessage(error, status) {
  if (clean(error?.safeMessage)) return clean(error.safeMessage);
  if (status >= 500) return "Automation review could not load. No settings were changed.";
  return clean(error?.message) || "The automation review request could not be completed.";
}

export async function handleAutomationControlCenterApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isAutomationControlCenterApiPath(pathname)) return { matched:false };
  if (!enabled) {
    return {
      matched:true,
      status:404,
      body:{
        ok:false,
        outcome:"not_available",
        message:"Automation review is unavailable.",
        mutations:0,
        externalActions:0,
        providerCalls:0
      }
    };
  }

  try {
    if (clean(method).toUpperCase() !== "GET") {
      return {
        matched:true,
        status:405,
        body:{
          ok:false,
          outcome:"method_not_allowed",
          message:"Automation review is read-only.",
          mutations:0,
          externalActions:0,
          providerCalls:0
        }
      };
    }
    assertNoQuery(searchParams);
    const controlCenter = buildAutomationControlCenterView(await readState(store), actor, now);
    return {
      matched:true,
      status:controlCenter.available ? 200 : 403,
      body:{
        ok:controlCenter.available === true,
        authorized:controlCenter.authorized === true,
        controlCenter,
        mutations:0,
        externalActions:0,
        providerCalls:0
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
        externalActions:0,
        providerCalls:0
      }
    };
  }
}
