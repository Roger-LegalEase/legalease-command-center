// CCX-003 deployment contract. This module is pure: callers must explicitly pass
// the server environment, and no browser- or request-controlled input is read here.

export const COMMAND_CENTER_UX_VNEXT_ENV_KEY = "COMMAND_CENTER_UX_VNEXT";
export const COMMAND_CENTER_UX_VNEXT_PRODUCT_FLAGS = Object.freeze({
  social:"COMMAND_CENTER_UX_VNEXT_SOCIAL",
  outreach:"COMMAND_CENTER_UX_VNEXT_OUTREACH",
  files:"COMMAND_CENTER_UX_VNEXT_FILES",
  discovery:"COMMAND_CENTER_UX_VNEXT_DISCOVERY"
});

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

export function readCommandCenterVNextProductConfig(serverEnvironment = {}, product = "") {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const key = COMMAND_CENTER_UX_VNEXT_PRODUCT_FLAGS[String(product || "").trim().toLowerCase()];
  const global = readCommandCenterVNextConfig(environment);
  const productEnabled = Boolean(key)
    && Object.prototype.hasOwnProperty.call(environment, key)
    && parseCommandCenterVNextFlag(environment[key]);
  return Object.freeze({
    enabled:global.enabled && productEnabled,
    mode:global.enabled && productEnabled ? "vnext" : "legacy",
    product:String(product || "").trim().toLowerCase(),
    source:"server-environment"
  });
}
