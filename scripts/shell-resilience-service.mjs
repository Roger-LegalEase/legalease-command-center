import { roleHasCapability } from "./roles.mjs";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { routeRegistryByCanonicalRoute } from "./ui/navigation.mjs";
import { permissionLabelForCapabilities } from "./ui/permission-labels.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";

export const ROUTE_ACCESS_ENDPOINT = "/api/ui/route-access";
export const ROUTE_ACCESS_READ_COLLECTIONS = Object.freeze([
  "brandAssets",
  "campaigns",
  "dataRoomItems",
  "evidencePackNotes",
  "partners",
  "posts",
  "reports",
  "soc2Evidence",
  "soc2Policies",
  "tasks"
]);

const list = (value) => Array.isArray(value) ? value : [];

function recordId(record = {}) {
  return String(record.id || record.key || record.slug || "").trim();
}

function routeCapabilities(route, role) {
  const configured = list(route?.visibility?.actionCapabilities);
  if (!configured.length) return ["read_internal"];
  if (configured.includes("admin")) return ["admin"];
  return configured;
}

function roleAllows(role, capabilities) {
  return capabilities.every((capability) => capability === "admin"
    ? ["owner", "admin"].includes(String(role || ""))
    : roleHasCapability(role, capability));
}

export function routeAccessReadCollections(target = "") {
  const resolution = resolveRouteCompatibility(target);
  if (resolution.kind !== "object" || !ROUTE_ACCESS_READ_COLLECTIONS.includes(resolution.sourceKind)) return Object.freeze([]);
  return Object.freeze([resolution.sourceKind]);
}

export function buildRouteAccessView(state = {}, target = "", { role = "viewer" } = {}) {
  const resolution = resolveRouteCompatibility(target);
  if (resolution.kind === "unsafe" || resolution.kind === "unknown") {
    return Object.freeze({ ok:true, allowed:true, outcome:"route_recovery" });
  }
  if (resolution.kind === "object") {
    const collection = resolution.sourceKind;
    const record = list(state?.[collection]).find((candidate) => recordId(candidate) === resolution.sourceId);
    if (!record || !recordVisibleToActor(record, role)) {
      return Object.freeze({ ok:true, allowed:false, outcome:"unavailable" });
    }
    return Object.freeze({ ok:true, allowed:true, outcome:"record" });
  }
  const route = routeRegistryByCanonicalRoute[resolution.canonicalRoute];
  const capabilities = routeCapabilities(route, role);
  if (!roleAllows(role, capabilities)) {
    return Object.freeze({
      ok:true,
      allowed:false,
      outcome:"unauthorized",
      permissionLabel:permissionLabelForCapabilities(capabilities)
    });
  }
  return Object.freeze({ ok:true, allowed:true, outcome:"page" });
}
