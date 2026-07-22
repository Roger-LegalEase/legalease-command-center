import { GLOBAL_UTILITIES, PRIMARY_DESTINATIONS } from "./labels.mjs";
import { GLOBAL_CREATE_OPTIONS } from "./global-create.mjs";
import { routeRegistry } from "./navigation.mjs";
import { resolveRouteCompatibility } from "./route-compatibility.mjs";

export { ITEM_COLLECTION_DESTINATIONS } from "./route-compatibility.mjs";

const list = (values) => Object.freeze(values.map((value) => Object.freeze({ ...value })));

export const PRIMARY_SHELL_DESTINATIONS = list([
  { id:"today", label:PRIMARY_DESTINATIONS.today, route:"today" },
  { id:"inbox", label:PRIMARY_DESTINATIONS.inbox, route:"inbox" },
  { id:"partners", label:PRIMARY_DESTINATIONS.partners, route:"partners" },
  { id:"social", label:PRIMARY_DESTINATIONS.social, route:"queue" },
  { id:"outreach", label:PRIMARY_DESTINATIONS.outreach, route:"campaigns" },
  { id:"scoreboard", label:PRIMARY_DESTINATIONS.scoreboard, route:"revenue" },
  { id:"support", label:PRIMARY_DESTINATIONS.support, route:"support" },
  { id:"calendar", label:PRIMARY_DESTINATIONS.calendar, route:"meetings" },
  { id:"company-health", label:PRIMARY_DESTINATIONS.companyHealth, route:"os-health" },
  { id:"files", label:PRIMARY_DESTINATIONS.files, route:"proof" }
]);

export function primaryShellDestinations({ outreachEnabled = false, filesEnabled = false } = {}) {
  return list(PRIMARY_SHELL_DESTINATIONS.map((item) => item.id === "outreach" && outreachEnabled
    ? { ...item, route:"outreach" }
    : item.id === "files" && filesEnabled ? { ...item, route:"files" } : item));
}

export const SECONDARY_SHELL_CONTROLS = list([
  { id:"lee", label:GLOBAL_UTILITIES.lee, kind:"action", action:"open-lee" },
  { id:"settings", label:GLOBAL_UTILITIES.settings, kind:"route", route:"settings" }
]);

export const TOP_BAR_CONTROLS = list([
  { id:"search", label:GLOBAL_UTILITIES.search, kind:"dialog" },
  { id:"create", label:GLOBAL_UTILITIES.create, kind:"menu" },
  { id:"help", label:GLOBAL_UTILITIES.help, kind:"route", route:"operator-manual" },
  { id:"profile", label:GLOBAL_UTILITIES.profile, kind:"menu" }
]);

export const CREATE_MENU_OPTIONS = GLOBAL_CREATE_OPTIONS;

export const DEFERRED_CREATE_OPTIONS = Object.freeze([
  "Persistent folders"
]);

const aliasTargets = new Map(
  routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]))
);

export const SHELL_DESTINATION_LABELS = Object.freeze([
  ...Object.values(PRIMARY_DESTINATIONS),
  "Partners",
  GLOBAL_UTILITIES.inbox,
  GLOBAL_UTILITIES.lee,
  GLOBAL_UTILITIES.settings,
  GLOBAL_UTILITIES.search
]);

export function canonicalRouteForShell(input = "") {
  const result = resolveRouteCompatibility(input);
  if (result.kind === "object") return "item";
  return result.kind === "page" ? result.canonicalRoute : "today";
}

export function resolveShellDestination(input = "") {
  return resolveRouteCompatibility(input).destination;
}

export const SHELL_ROUTE_DESTINATIONS = Object.freeze(
  Object.fromEntries(routeRegistry.map((entry) => [entry.canonicalRoute, resolveShellDestination(entry.canonicalRoute)]))
);

export const SHELL_ALIAS_TARGETS = Object.freeze(Object.fromEntries(aliasTargets));
