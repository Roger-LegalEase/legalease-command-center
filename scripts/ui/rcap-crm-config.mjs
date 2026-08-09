// RCAP Prospect CRM deployment contract (Wave 1, Packet 1).
//
// Pure module, same shape and same strict "true" parsing as vnext-config.mjs and
// founder-os-config.mjs, so the flag behaves identically for an operator and nothing
// browser- or request-controlled is ever read here. Callers pass the server environment
// explicitly.
//
// COMMAND_CENTER_RCAP_CRM_V1 turns on the RCAP Prospects saved view inside the existing
// Relationships/Partners workspace and the RCAP prospect account surfaces. Default off.
// Turning it off restores the current Partners experience exactly, which is the release's
// rollback path -- it hides a projection, so no record is deleted or altered by the flag in
// either direction.
//
// The flag deliberately does NOT depend on COMMAND_CENTER_UX_VNEXT or FOUNDER_OS_SHELL.
// The Wave 0 audit could not read the hosted values of those flags (blocker B1), so the
// RCAP read models live in the shared service layer and render under whichever shell is
// active. This module answers "is the RCAP CRM on?" and nothing about which shell shows it.

export const RCAP_CRM_ENV_KEY = "COMMAND_CENTER_RCAP_CRM_V1";

export function parseRcapCrmFlag(value) {
  return typeof value === "string" && value === "true";
}

export function readRcapCrmConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, RCAP_CRM_ENV_KEY)
    && parseRcapCrmFlag(environment[RCAP_CRM_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// The saved view's identity. `view` is the query value on the canonical route; `route` is the
// canonical workspace it lives inside. There is no second workspace and no second route
// family -- RCAP Prospects is a view over Relationships/Partners, per the Wave 0 decision.
export const RCAP_PROSPECTS_VIEW_KEY = "rcap-prospects";
export const RCAP_PROSPECTS_CANONICAL_ROUTE = "partners";
export const RCAP_PROSPECTS_ALIAS_ROUTE = "relationships";

export const RCAP_PROSPECTS_CANONICAL_HASH = `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}`;
export const RCAP_PROSPECTS_ALIAS_HASH = `#${RCAP_PROSPECTS_ALIAS_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}`;
