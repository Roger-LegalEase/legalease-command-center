// CCX-003 deployment contract. This module is pure: callers must explicitly pass
// the server environment, and no browser- or request-controlled input is read here.

export const COMMAND_CENTER_UX_VNEXT_ENV_KEY = "COMMAND_CENTER_UX_VNEXT";

export function parseCommandCenterVNextFlag(value) {
  return typeof value === "string" && value === "true";
}

export function readCommandCenterVNextConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object"
    ? serverEnvironment
    : {};
  const value = Object.prototype.hasOwnProperty.call(environment, COMMAND_CENTER_UX_VNEXT_ENV_KEY)
    ? environment[COMMAND_CENTER_UX_VNEXT_ENV_KEY]
    : undefined;
  const enabled = parseCommandCenterVNextFlag(value);

  return Object.freeze({
    enabled,
    mode: enabled ? "vnext" : "legacy",
    source: "server-environment"
  });
}
