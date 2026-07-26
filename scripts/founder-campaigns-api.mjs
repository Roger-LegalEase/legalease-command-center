// Founder OS Release 4 — the read-only Campaigns lifecycle endpoint.
//
// One GET. No mutations, ever. Reactivation is live in production, so the founder surface for
// it must be incapable of changing it: every control the projection names is a route that
// already exists and is invoked by the founder's own click on that existing route, not here.
//
// It reads through a frozen targeted collection list rather than `store.readState()`.
// `GET /api/campaign/command` still takes a full state read (`preview-server.mjs:38770`), which
// `05_DATA_AND_INTEGRATION_CONTRACT.md` names as a legacy full-state route to migrate "as they
// are wrapped". Release 4 wraps it, so this is that migration for the founder surface: the same
// projection, without the full-table hydration that caused the Supabase load incidents.

import { buildFounderCampaignsView } from "./ui/view-models/founder-campaigns-view.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const FOUNDER_CAMPAIGNS_ENDPOINT = "/api/ui/campaigns";

// Exactly what buildFounderCampaignsView and buildCampaignCommandView read, and nothing else.
export const FOUNDER_CAMPAIGNS_READ_COLLECTIONS = Object.freeze([
  "approvalQueue",
  "autopilotSettings",
  "outreachContacts",
  "outreachReplies",
  "outreachSuppressions",
  "outreachUnsubscribes",
  "posts",
  "prospectCandidates",
  "reactivationAttempts",
  "reactivationCampaign",
  "reactivationContacts",
  "reactivationEvents",
  "sendgridWebhookHealth"
].sort());

export const FOUNDER_CAMPAIGNS_API_ENDPOINTS = Object.freeze([`GET ${FOUNDER_CAMPAIGNS_ENDPOINT}`]);

export function isFounderCampaignsApiPath(pathname = "") {
  return clean(pathname) === FOUNDER_CAMPAIGNS_ENDPOINT;
}

function apiError(message, status = 400, outcome = "validation_error") {
  const error = new Error(message);
  error.name = "FounderCampaignsApiError";
  error.status = status;
  error.outcome = outcome;
  error.safeMessage = message;
  return error;
}

function safeStatus(error) {
  const status = Number(error?.status || 500);
  return [400, 403, 404, 405, 503].includes(status) ? status : 500;
}

export async function handleFounderCampaignsApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  store,
  actor = {},
  now = new Date().toISOString(),
  env = {}
} = {}) {
  if (!isFounderCampaignsApiPath(pathname)) return { matched:false };
  if (!enabled) {
    return { matched:true, status:404, body:{ ok:false, outcome:"not_available", message:"Campaigns are unavailable." } };
  }
  if (clean(method).toUpperCase() !== "GET") {
    // There is deliberately no write verb here. Campaign state changes go through the routes
    // that already own them, with the approvals they already require.
    return {
      matched:true,
      status:405,
      body:{ ok:false, outcome:"method_not_allowed", message:"Campaigns are read-only from here.", mutations:0, externalActions:0 }
    };
  }

  try {
    for (const key of searchParams?.keys?.() || []) {
      throw apiError(`The Campaigns request contains an unsupported field: ${clean(key)}.`);
    }
    // Owner-only, matching every other founder surface. An unauthorized caller is told nothing
    // about the campaign.
    if (actor?.authenticated !== true) {
      throw apiError("Campaigns need additional access.", 403, "not_authorized");
    }
    if (typeof store?.readCollections !== "function") {
      throw apiError("Campaigns are temporarily unavailable.", 503, "unavailable");
    }
    const state = await store.readCollections(FOUNDER_CAMPAIGNS_READ_COLLECTIONS);
    const view = buildFounderCampaignsView(state, { env, now:new Date(now) });
    return { matched:true, status:200, body:{ ok:true, generatedAt:clean(now), ...view } };
  } catch (error) {
    const status = safeStatus(error);
    return {
      matched:true,
      status,
      body:{
        ok:false,
        outcome:clean(error?.outcome) || "error",
        message:clean(error?.safeMessage) || "Campaigns could not load. Nothing was changed.",
        mutations:0,
        externalActions:0
      }
    };
  }
}
