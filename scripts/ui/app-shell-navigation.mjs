import { GLOBAL_UTILITIES, PRIMARY_DESTINATIONS } from "./labels.mjs";
import { routeRegistry } from "./navigation.mjs";

const list = (values) => Object.freeze(values.map((value) => Object.freeze({ ...value })));

export const PRIMARY_SHELL_DESTINATIONS = list([
  { id:"today", label:PRIMARY_DESTINATIONS.today, route:"today" },
  { id:"social", label:PRIMARY_DESTINATIONS.social, route:"queue" },
  { id:"outreach", label:PRIMARY_DESTINATIONS.outreach, route:"campaigns" },
  { id:"partners", label:PRIMARY_DESTINATIONS.partners, route:"partners" },
  { id:"files", label:PRIMARY_DESTINATIONS.files, route:"proof" }
]);

export const SECONDARY_SHELL_CONTROLS = list([
  { id:"inbox", label:GLOBAL_UTILITIES.inbox, kind:"route", route:"decisions" },
  { id:"lee", label:GLOBAL_UTILITIES.lee, kind:"action", action:"open-lee" },
  { id:"settings", label:GLOBAL_UTILITIES.settings, kind:"route", route:"settings" }
]);

export const TOP_BAR_CONTROLS = list([
  { id:"search", label:GLOBAL_UTILITIES.search, kind:"route", route:"operator-search" },
  { id:"create", label:GLOBAL_UTILITIES.create, kind:"menu" },
  { id:"help", label:GLOBAL_UTILITIES.help, kind:"route", route:"operator-manual" },
  { id:"profile", label:GLOBAL_UTILITIES.profile, kind:"menu" }
]);

export const CREATE_MENU_OPTIONS = list([
  {
    id:"social-post",
    label:"Social post",
    route:"content-bank",
    description:"Open the existing draft and idea workflow."
  },
  {
    id:"task",
    label:"Task",
    route:"tasks",
    description:"Open the existing task creation workflow."
  }
]);

export const DEFERRED_CREATE_OPTIONS = Object.freeze([
  "Quick capture",
  "Campaign",
  "Partner",
  "File or document record"
]);

// Exact collection ownership for the generic #item/<collection>/<id> bridge. This
// deliberately avoids substring guessing and changes only shell highlighting.
export const ITEM_COLLECTION_DESTINATIONS = Object.freeze({
  posts:"Social",
  postImages:"Social",
  approvalQueue:"Social",
  contentBank:"Social",
  sources:"Social",
  publishEvents:"Social",
  postingKits:"Social",
  campaigns:"Outreach",
  campaignKits:"Outreach",
  outreachContacts:"Outreach",
  outreachAttempts:"Outreach",
  outreachApprovalQueue:"Outreach",
  reactivationCampaign:"Outreach",
  reactivationContacts:"Outreach",
  prospectCandidates:"Outreach",
  companyContacts:"Outreach",
  partners:"Partners",
  partnerPrograms:"Partners",
  partnerProgramArtifacts:"Partners",
  pilots:"Partners",
  meetingBriefs:"Partners",
  reports:"Files",
  dataRoomItems:"Files",
  evidencePackNotes:"Files",
  soc2Evidence:"Files",
  soc2Policies:"Files",
  brandAssets:"Files",
  localAssets:"Files",
  queueItems:"Inbox",
  inboxSignals:"Inbox",
  tasks:"Inbox",
  captureInbox:"Inbox",
  growthInbox:"Inbox",
  supportIssues:"Inbox",
  alerts:"Inbox",
  automationSuggestions:"Inbox",
  morningBriefs:"Today",
  eveningReflections:"Today",
  dailyCloseouts:"Today",
  operatingMemory:"Today",
  milestones:"Today",
  roleAssignments:"Settings",
  soc2AccessReviews:"Settings",
  soc2Changes:"Settings",
  soc2Vendors:"Settings",
  soc2Incidents:"Settings"
});

const canonicalEntries = new Map(routeRegistry.map((entry) => [entry.canonicalRoute, entry]));
const aliasTargets = new Map(
  routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]))
);

const destinationOverrides = Object.freeze({
  lee:"Le-E",
  "operator-search":"Search",
  more:"Settings",
  "safe-mode":"Settings",
  "smoke-test":"Settings",
  "soc2-audit":"Settings",
  "handoff-contract":"Partners",
  "conversation-notes":"Today"
});

export const SHELL_DESTINATION_LABELS = Object.freeze([
  ...Object.values(PRIMARY_DESTINATIONS),
  GLOBAL_UTILITIES.inbox,
  GLOBAL_UTILITIES.lee,
  GLOBAL_UTILITIES.settings,
  GLOBAL_UTILITIES.search
]);

function routeValue(input = "") {
  const raw = String(input ?? "").trim();
  if (raw === "/sources/import-social-calendar" || raw === "sources/import-social-calendar") return "sources";
  const hashValue = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw;
  return hashValue.replace(/^\/+/, "").split("?")[0];
}

function itemReference(value = "") {
  if (!value.startsWith("item/")) return null;
  const parts = value.split("/");
  const collection = String(parts[1] || "").replace(/[^a-zA-Z0-9_-]/g, "");
  return collection && parts.slice(2).join("/") ? Object.freeze({ collection }) : null;
}

export function canonicalRouteForShell(input = "") {
  const requested = routeValue(input);
  if (!requested) return "today";
  if (itemReference(requested)) return "item";
  const canonical = aliasTargets.get(requested) || requested;
  return canonicalEntries.has(canonical) ? canonical : "today";
}

export function resolveShellDestination(input = "") {
  const requested = routeValue(input);
  const reference = itemReference(requested);
  if (reference) return ITEM_COLLECTION_DESTINATIONS[reference.collection] || "Today";
  const canonicalRoute = canonicalRouteForShell(requested);
  const override = destinationOverrides[canonicalRoute];
  if (override) return override;
  const destination = canonicalEntries.get(canonicalRoute)?.vnextDestination;
  return SHELL_DESTINATION_LABELS.includes(destination) ? destination : "Settings";
}

export const SHELL_ROUTE_DESTINATIONS = Object.freeze(
  Object.fromEntries(routeRegistry.map((entry) => [entry.canonicalRoute, resolveShellDestination(entry.canonicalRoute)]))
);

export const SHELL_ALIAS_TARGETS = Object.freeze(Object.fromEntries(aliasTargets));
