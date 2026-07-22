import {
  buildFounderScoreboard,
  FOUNDER_SCOREBOARD_READ_COLLECTIONS,
  FOUNDER_FINANCE_INPUT_ENDPOINT,
  FOUNDER_SCOREBOARD_ENDPOINT,
  FounderScoreboardValidationError,
  updateFounderFinanceInputs
} from "./founder-scoreboard-service.mjs";

const clean = (value = "") => String(value ?? "").trim();
const NO_QUERY_FIELDS = new Set();
const FINANCE_INPUT_FIELDS = new Set([
  "currentCashBalance",
  "monthlyBurn",
  "asOfDate",
  "expectedUpdatedAt"
]);

export const FOUNDER_SCOREBOARD_BODY_LIMIT = 8 * 1024;
export const FOUNDER_SCOREBOARD_API_ENDPOINTS = Object.freeze([
  `GET ${FOUNDER_SCOREBOARD_ENDPOINT}`,
  `POST ${FOUNDER_FINANCE_INPUT_ENDPOINT}`
]);

export function isFounderScoreboardApiPath(pathname = "") {
  const path = clean(pathname);
  return path === FOUNDER_SCOREBOARD_ENDPOINT || path === FOUNDER_FINANCE_INPUT_ENDPOINT;
}

function apiError(message, status = 400, outcome = "validation_error") {
  const error = new Error(message);
  error.name = "FounderScoreboardApiError";
  error.status = status;
  error.outcome = outcome;
  error.safeMessage = message;
  return error;
}

function assertNoQuery(searchParams) {
  for (const key of searchParams?.keys?.() || []) {
    if (!NO_QUERY_FIELDS.has(key)) throw apiError("The Scoreboard request contains an unsupported field.");
  }
}

function financeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw apiError("Enter valid cash and burn information.");
  }
  const unexpected = Object.keys(input).filter((key) => !FINANCE_INPUT_FIELDS.has(key));
  if (unexpected.length) throw apiError("The financial update contains unsupported information.");
  return Object.fromEntries(Object.entries(input).filter(([key]) => FINANCE_INPUT_FIELDS.has(key)));
}

async function readState(store) {
  if (typeof store?.readCollections !== "function") {
    throw apiError("Scoreboard information is temporarily unavailable.", 503, "unavailable");
  }
  return store.readCollections(FOUNDER_SCOREBOARD_READ_COLLECTIONS);
}

async function persistFinance(store, result) {
  const names = Object.keys(result?.patch || {});
  if (names.length !== 1 || names[0] !== "runwayInputs"
    || result?.changedCollections?.length !== 1
    || result.changedCollections[0] !== "runwayInputs") {
    throw apiError("The financial update could not be saved safely. No changes were made.", 500, "failed_closed");
  }
  if (typeof store?.writeCollections !== "function") {
    throw apiError("Financial inputs cannot be saved right now. No changes were made.", 503, "unavailable");
  }
  await store.writeCollections({ runwayInputs:result.patch.runwayInputs });
}

function scoreboardBody(view) {
  return {
    ok:view.available === true,
    scoreboard:view,
    mutations:0,
    externalActions:0
  };
}

function safeStatus(error) {
  const status = Number(error?.status || 500);
  return [400, 403, 409, 413, 503].includes(status) ? status : 500;
}

function safeOutcome(error, status) {
  if (status === 403) return "unauthorized";
  if (status === 409) return "conflict";
  if (status === 503) return "unavailable";
  if (status >= 500) return "failed_closed";
  return clean(error?.outcome || error?.code) || "validation_error";
}

function safeMessage(error, status) {
  if (clean(error?.safeMessage)) return clean(error.safeMessage);
  if (status >= 500) return "Scoreboard changes could not be saved. No changes were made.";
  return clean(error?.message) || "The Scoreboard request could not be completed.";
}

export async function handleFounderScoreboardApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  input = {},
  store,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  if (!isFounderScoreboardApiPath(pathname)) return { matched:false };
  if (!enabled) {
    return {
      matched:true,
      status:404,
      body:{ ok:false, outcome:"not_available", message:"Scoreboard is unavailable." }
    };
  }

  try {
    const verb = clean(method).toUpperCase();
    if (pathname === FOUNDER_SCOREBOARD_ENDPOINT && verb === "GET") {
      assertNoQuery(searchParams);
      const state = await readState(store);
      const view = buildFounderScoreboard(state, actor, now);
      return {
        matched:true,
        status:view.available ? 200 : view.availability?.state === "not_authorized" ? 403 : 503,
        body:scoreboardBody(view)
      };
    }

    if (pathname === FOUNDER_FINANCE_INPUT_ENDPOINT && verb === "POST") {
      assertNoQuery(searchParams);
      const current = await readState(store);
      const result = updateFounderFinanceInputs(current, actor, financeInput(input), now);
      await persistFinance(store, result);
      const scoreboard = buildFounderScoreboard(result.state, actor, now);
      return {
        matched:true,
        status:200,
        body:{
          ok:true,
          outcome:"saved",
          message:result.message,
          scoreboard,
          finance:scoreboard.manualFinance,
          mutations:1,
          externalActions:0
        }
      };
    }

    return {
      matched:true,
      status:405,
      body:{ ok:false, outcome:"method_not_allowed", message:"Scoreboard method not allowed." }
    };
  } catch (error) {
    const status = safeStatus(error);
    const body = {
      ok:false,
      outcome:safeOutcome(error, status),
      message:safeMessage(error, status),
      mutations:0,
      externalActions:0
    };
    if (error instanceof FounderScoreboardValidationError && error.code) body.code = error.code;
    return { matched:true, status, body };
  }
}
