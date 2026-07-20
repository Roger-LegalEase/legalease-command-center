import { routeRegistry } from "./navigation.mjs";

export const ROUTE_COMPATIBILITY_LIMITS = Object.freeze({
  maxHashLength:2048,
  maxRouteLength:128,
  maxSourceIdLength:240,
  maxCollectionLength:80
});

// These are existing top-level state collections consumed by the current exact-item
// viewer. The mapping changes shell selection only; it grants no read authority.
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

export const OBJECT_SOURCE_MAPPINGS = Object.freeze({
  Post:Object.freeze({
    canonicalPrefix:"social/post",
    destination:"Social",
    sources:Object.freeze({ post:"posts" })
  }),
  Campaign:Object.freeze({
    canonicalPrefix:"outreach/campaign",
    destination:"Outreach",
    sources:Object.freeze({ campaign:"campaigns" })
  }),
  Partner:Object.freeze({
    canonicalPrefix:"partners/partner",
    destination:"Partners",
    sources:Object.freeze({ partner:"partners" })
  }),
  File:Object.freeze({
    canonicalPrefix:"files/<source-kind>",
    destination:"Files",
    sources:Object.freeze({
      report:"reports",
      "data-room-item":"dataRoomItems",
      "evidence-note":"evidencePackNotes",
      "soc2-evidence":"soc2Evidence",
      "soc2-policy":"soc2Policies",
      "brand-asset":"brandAssets"
    })
  })
});

const DESTINATION_OVERRIDES = Object.freeze({
  lee:"Le-E",
  "operator-search":"Search",
  more:"Settings",
  "safe-mode":"Settings",
  "smoke-test":"Settings",
  "soc2-audit":"Settings",
  "handoff-contract":"Partners",
  "conversation-notes":"Today"
});

const SHELL_DESTINATIONS = Object.freeze([
  "Today", "Social", "Outreach", "Partners", "Files", "Inbox", "Settings", "Le-E", "Search"
]);

function destinationForEntry(entry) {
  const override = DESTINATION_OVERRIDES[entry.canonicalRoute];
  if (override) return override;
  return SHELL_DESTINATIONS.includes(entry.vnextDestination) ? entry.vnextDestination : "Settings";
}

const ROUTE_DESTINATIONS = Object.freeze({
  ...Object.fromEntries(routeRegistry.map((entry) => [entry.canonicalRoute, destinationForEntry(entry)])),
  search:"Search",
  inbox:"Inbox"
});
const ALIAS_TARGETS = Object.freeze({
  ...Object.fromEntries(routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]))),
  social:"queue"
});

const CORE_COLLECTION_OBJECT_TYPES = Object.freeze({
  posts:"Post",
  campaigns:"Campaign",
  partners:"Partner",
  reports:"File",
  dataRoomItems:"File",
  evidencePackNotes:"File",
  soc2Evidence:"File",
  soc2Policies:"File",
  brandAssets:"File"
});

const COLLECTION_FILE_SOURCE_KINDS = Object.freeze(Object.fromEntries(
  Object.entries(OBJECT_SOURCE_MAPPINGS.File.sources).map(([sourceKind, collection]) => [collection, sourceKind])
));

export const ROUTE_COMPATIBILITY_CONTRACT = Object.freeze({
  routeDestinations:ROUTE_DESTINATIONS,
  aliasTargets:ALIAS_TARGETS,
  itemDestinations:ITEM_COLLECTION_DESTINATIONS,
  coreCollectionObjectTypes:CORE_COLLECTION_OBJECT_TYPES,
  collectionFileSourceKinds:COLLECTION_FILE_SOURCE_KINDS,
  objectSources:Object.freeze({
    post:"posts",
    campaign:"campaigns",
    partner:"partners",
    file:OBJECT_SOURCE_MAPPINGS.File.sources
  }),
  limits:ROUTE_COMPATIBILITY_LIMITS
});

// Keep the full algorithm in this one environment-neutral function. The browser
// bridge serializes this exact function rather than maintaining a second parser.
export function resolveRouteWithContract(input = "", contract = ROUTE_COMPATIBILITY_CONTRACT) {
  const freeze = (value) => Object.freeze(value);
  const limits = contract.limits;
  const unsafe = (reason) => freeze({
    kind:"unsafe",
    requestedHash:"",
    requestedRoute:"",
    canonicalRoute:null,
    aliasUsed:null,
    destination:"Today",
    objectType:null,
    sourceKind:null,
    sourceId:null,
    safeHash:null,
    recoveryReason:reason
  });
  const isUnsafeText = (value) => {
    const text = String(value ?? "");
    return /[\u0000-\u001f\u007f<>"'`\\]/.test(text)
      || /^(?:javascript|data|vbscript)\s*:/i.test(text)
      || /(?:^|\/)\.{1,2}(?:\/|$)/.test(text)
      || /%0[0-9a-f]|%1[0-9a-f]|%7f|%3c|%3e/i.test(text);
  };
  const decode = (value) => {
    try { return { ok:true, value:decodeURIComponent(value) }; }
    catch { return { ok:false, value:"" }; }
  };
  const validSourceId = (value) => {
    const text = String(value ?? "");
    return Boolean(text)
      && text === text.trim()
      && text.length <= limits.maxSourceIdLength
      && !isUnsafeText(text)
      && !/(?:^|[^a-z])script\s*:/i.test(text);
  };
  const objectResult = ({ requestedHash, requestedRoute, safeHash, objectType, sourceKind, sourceId, destination }) => freeze({
    kind:"object",
    requestedHash,
    requestedRoute,
    canonicalRoute:"item",
    aliasUsed:null,
    destination,
    objectType,
    sourceKind,
    sourceId,
    safeHash,
    legacyHash:`#item/${sourceKind}/${encodeURIComponent(sourceId)}`,
    recoveryReason:null
  });

  let raw = String(input ?? "").trim();
  if (raw === "/sources/import-social-calendar" || raw === "sources/import-social-calendar") raw = "#sources";
  else if (raw.includes("#")) raw = raw.slice(raw.indexOf("#"));
  else if (raw.startsWith("/")) raw = `#${raw.replace(/^\/+/, "")}`;
  else if (!raw) raw = "#cockpit";
  else if (!raw.startsWith("#")) raw = `#${raw}`;

  if (raw.length > limits.maxHashLength) return unsafe("route_too_long");
  if (isUnsafeText(raw)) return unsafe("dangerous_route_value");
  const withoutHash = raw.slice(1);
  const queryIndex = withoutHash.indexOf("?");
  const rawRoute = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const suffix = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  if (!rawRoute || rawRoute.length > limits.maxRouteLength) return unsafe("missing_or_long_route");
  if (suffix && isUnsafeText(suffix)) return unsafe("dangerous_route_context");
  const requestedHash = `#${rawRoute}${suffix}`;
  const parts = rawRoute.split("/");
  if (parts.some((part) => !part)) return unsafe("empty_route_segment");

  if (contract.socialProductionEnabled === true && parts[0] === "settings" && parts[1] === "social") {
    if (parts.length > 3) return unsafe("malformed_social_connection_route");
    const allowedChannels = new Set(["linkedin", "instagram", "facebook", "x", "threads"]);
    const channel = parts.length === 3 ? parts[2].toLowerCase() : "";
    if (channel && !allowedChannels.has(channel)) return unsafe("unknown_social_connection");
    const query = new URLSearchParams({ view:"social-connections", ...(channel ? { channel } : {}) });
    return freeze({
      kind:"page",
      requestedHash,
      requestedRoute:rawRoute,
      canonicalRoute:"settings",
      aliasUsed:rawRoute,
      destination:"Settings",
      objectType:null,
      sourceKind:null,
      sourceId:null,
      safeHash:`#settings?${query.toString()}`,
      recoveryReason:null
    });
  }

  const exactObject = (() => {
    if (parts.length !== 3) return null;
    const isPost = parts[0] === "social" && parts[1] === "post";
    const isCampaign = parts[0] === "outreach" && parts[1] === "campaign";
    const isPartner = parts[0] === "partners" && parts[1] === "partner";
    const isFile = parts[0] === "files";
    if (!isPost && !isCampaign && !isPartner && !isFile) return null;
    const decodedId = decode(parts[2]);
    if (!decodedId.ok || !validSourceId(decodedId.value)) return { unsafe:"invalid_object_id" };
    if (isPost) {
      return { objectType:"Post", sourceKind:"posts", sourceId:decodedId.value, destination:"Social", safeHash:`#social/post/${encodeURIComponent(decodedId.value)}` };
    }
    if (isCampaign) {
      return { objectType:"Campaign", sourceKind:"campaigns", sourceId:decodedId.value, destination:"Outreach", safeHash:`#outreach/campaign/${encodeURIComponent(decodedId.value)}` };
    }
    if (isPartner) {
      return { objectType:"Partner", sourceKind:"partners", sourceId:decodedId.value, destination:"Partners", safeHash:`#partners/partner/${encodeURIComponent(decodedId.value)}` };
    }
    if (isFile) {
      const sourceKind = contract.objectSources.file[parts[1]];
      if (!sourceKind) return { unsafe:"unknown_file_source" };
      return { objectType:"File", sourceKind, sourceId:decodedId.value, destination:"Files", safeHash:`#files/${parts[1]}/${encodeURIComponent(decodedId.value)}` };
    }
    return null;
  })();
  if (exactObject?.unsafe) return unsafe(exactObject.unsafe);
  if (exactObject) return objectResult({
    requestedHash,
    requestedRoute:parts.slice(0, 2).join("/"),
    ...exactObject,
    safeHash:`${exactObject.safeHash}${suffix}`
  });

  if (parts[0] === "item") {
    if (parts.length === 1) {
      return freeze({
        kind:"page",
        requestedHash,
        requestedRoute:"item",
        canonicalRoute:"item",
        aliasUsed:null,
        destination:"Today",
        objectType:null,
        sourceKind:null,
        sourceId:null,
        safeHash:`#item${suffix}`,
        recoveryReason:null
      });
    }
    if (parts.length < 3) return unsafe("incomplete_item_link");
    const decodedCollection = decode(parts[1]);
    const decodedId = decode(parts.slice(2).join("/"));
    if (!decodedCollection.ok || !decodedId.ok) return unsafe("malformed_encoding");
    const collection = decodedCollection.value;
    if (!collection || collection.length > limits.maxCollectionLength || !/^[a-z0-9_-]+$/i.test(collection)) {
      return unsafe("invalid_collection");
    }
    if (!validSourceId(decodedId.value)) return unsafe("invalid_object_id");
    const objectType = contract.coreCollectionObjectTypes[collection] || null;
    const fileSourceKind = contract.collectionFileSourceKinds[collection] || null;
    let canonicalObjectHash = null;
    if (objectType === "Post") canonicalObjectHash = `#social/post/${encodeURIComponent(decodedId.value)}`;
    if (objectType === "Campaign") canonicalObjectHash = `#outreach/campaign/${encodeURIComponent(decodedId.value)}`;
    if (objectType === "Partner") canonicalObjectHash = `#partners/partner/${encodeURIComponent(decodedId.value)}`;
    if (objectType === "File" && fileSourceKind) canonicalObjectHash = `#files/${fileSourceKind}/${encodeURIComponent(decodedId.value)}`;
    return freeze({
      kind:"object",
      requestedHash,
      requestedRoute:"item",
      canonicalRoute:"item",
      aliasUsed:null,
      destination:contract.itemDestinations[collection] || "Today",
      objectType,
      sourceKind:collection,
      sourceId:decodedId.value,
      safeHash:`#item/${collection}/${encodeURIComponent(decodedId.value)}${suffix}`,
      canonicalObjectHash:canonicalObjectHash ? `${canonicalObjectHash}${suffix}` : null,
      legacyHash:`#item/${collection}/${encodeURIComponent(decodedId.value)}`,
      recoveryReason:null
    });
  }

  if (parts.length !== 1 || !/^[a-z0-9-]+$/i.test(rawRoute)) return unsafe("malformed_route");
  const canonicalRoute = contract.aliasTargets[rawRoute] || rawRoute;
  const canonicalSuffix = contract.aliasQueries?.[rawRoute] || suffix;
  if (contract.routeDestinations[canonicalRoute]) {
    const aliasUsed = contract.aliasTargets[rawRoute] && rawRoute !== canonicalRoute ? rawRoute : null;
    return freeze({
      kind:"page",
      requestedHash,
      requestedRoute:rawRoute,
      canonicalRoute,
      aliasUsed,
      destination:contract.routeDestinations[canonicalRoute],
      objectType:null,
      sourceKind:null,
      sourceId:null,
      safeHash:`#${canonicalRoute}${canonicalSuffix}`,
      recoveryReason:null
    });
  }
  return freeze({
    kind:"unknown",
    requestedHash,
    requestedRoute:rawRoute,
    canonicalRoute:null,
    aliasUsed:null,
    destination:"Today",
    objectType:null,
    sourceKind:null,
    sourceId:null,
    safeHash:requestedHash,
    recoveryReason:"unknown_route"
  });
}

export function resolveRouteCompatibility(input = "") {
  return resolveRouteWithContract(input, ROUTE_COMPATIBILITY_CONTRACT);
}

export function buildExactObjectLink({ objectType, sourceKind = "", sourceId } = {}) {
  const type = String(objectType ?? "").trim();
  const id = String(sourceId ?? "");
  if (!id) return null;
  let candidate = "";
  if (type === "Post") candidate = `#social/post/${encodeURIComponent(id)}`;
  if (type === "Campaign") candidate = `#outreach/campaign/${encodeURIComponent(id)}`;
  if (type === "Partner") candidate = `#partners/partner/${encodeURIComponent(id)}`;
  if (type === "File") candidate = `#files/${String(sourceKind ?? "").trim()}/${encodeURIComponent(id)}`;
  const resolved = candidate ? resolveRouteCompatibility(candidate) : null;
  return resolved?.kind === "object" && resolved.objectType === type
    ? Object.freeze({ kind:"record", target:resolved.safeHash })
    : null;
}

export function buildGenericItemLink({ collection, sourceId } = {}) {
  const candidate = `#item/${String(collection ?? "").trim()}/${encodeURIComponent(String(sourceId ?? ""))}`;
  const resolved = resolveRouteCompatibility(candidate);
  return resolved.kind === "object"
    ? Object.freeze({ kind:"record", target:resolved.safeHash })
    : null;
}

export function createObjectNotAvailableContract(resolution = {}) {
  if (resolution?.kind !== "object") return null;
  return Object.freeze({
    available:false,
    title:"Record not available",
    message:"This record is not in the loaded data. It may have been removed, or this account may not be allowed to view it."
  });
}

export function routeCompatibilityBrowserSource({ socialEnabled = false, outreachEnabled = false, filesEnabled = false } = {}) {
  const contractValue = {
    ...ROUTE_COMPATIBILITY_CONTRACT,
    socialProductionEnabled:socialEnabled === true,
    routeDestinations:{
      ...ROUTE_COMPATIBILITY_CONTRACT.routeDestinations,
      ...(outreachEnabled ? { outreach:"Outreach" } : {}),
      ...(filesEnabled ? { files:"Files" } : {})
    },
    aliasTargets:{
      ...ROUTE_COMPATIBILITY_CONTRACT.aliasTargets,
      ...(socialEnabled ? { "social-calendar":"queue", "social-connections":"settings" } : {}),
      ...(outreachEnabled ? { campaigns:"outreach", campaign:"outreach", "campaign-control":"outreach", "campaigns-control":"outreach" } : {}),
      ...(filesEnabled ? { proof:"files", "data-room":"files", dataroom:"files", "evidence-room":"files", reports:"files", assets:"files", metrics:"files", kpis:"files" } : {})
    },
    aliasQueries:{
      ...(socialEnabled ? { "social-calendar":"?view=calendar", "social-connections":"?view=social-connections" } : {}),
      ...(filesEnabled ? {
        proof:"",
        "data-room":"?collection=investor-room",
        dataroom:"?collection=investor-room",
        "evidence-room":"?collection=compliance-evidence",
        reports:"?view=all",
        assets:"?collection=brand-assets",
        metrics:"?collection=investor-room",
        kpis:"?collection=investor-room"
      } : {})
    }
  };
  const contract = JSON.stringify(contractValue).replaceAll("<", "\\u003c");
  return `(() => {\n    "use strict";\n    const deepFreeze = (value) => {\n      if (value && typeof value === "object" && !Object.isFrozen(value)) {\n        Object.values(value).forEach(deepFreeze);\n        Object.freeze(value);\n      }\n      return value;\n    };\n    const contract = deepFreeze(${contract});\n    const resolveRouteWithContract = ${resolveRouteWithContract.toString()};\n    window.__LE_VNEXT_ROUTE_COMPATIBILITY = Object.freeze({\n      contract,\n      resolve:(input) => resolveRouteWithContract(input, contract)\n    });\n  })();`;
}

export const ROUTE_COMPATIBILITY_TOTALS = Object.freeze({
  canonicalRoutes:routeRegistry.length,
  aliases:Object.keys(ALIAS_TARGETS).length,
  objectFamilies:Object.keys(OBJECT_SOURCE_MAPPINGS).length
});
