import { roleHasCapability } from "./roles.mjs";
import { compactSearchText, searchRecordUpdatedAt } from "./search-index-helpers.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "./ui/route-compatibility.mjs";
import { GLOBAL_SEARCH_GROUPS, GLOBAL_SEARCH_LIMITS } from "./ui/global-search-view-model.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const normalize = (value = "") => String(value ?? "").normalize("NFKC").toLocaleLowerCase("en-US");
const compact = (value = "", fallback = "") => compactSearchText(value, fallback).slice(0, 220);
const joined = (...values) => values.flat(Infinity).filter(Boolean).map((value) => compact(value, "")).filter(Boolean).join(" · ");
const safeId = (value = "") => String(value ?? "").trim().slice(0, 240);

export const GLOBAL_SEARCH_ENDPOINT = "/api/ui/search";
export { GLOBAL_SEARCH_GROUPS, GLOBAL_SEARCH_LIMITS };

export const GLOBAL_SEARCH_SOURCE_MAPPINGS = Object.freeze({
  posts:Object.freeze({ objectType:"Post", sourceKind:"post", destination:"Social", link:"#social/post/<id>" }),
  campaigns:Object.freeze({ objectType:"Campaign", sourceKind:"campaign", destination:"Outreach", link:"#outreach/campaign/<id>" }),
  partners:Object.freeze({ objectType:"Partner", sourceKind:"partner", destination:"Partners", link:"#partners/partner/<id>" }),
  dataRoomItems:Object.freeze({ objectType:"File", sourceKind:"data-room-item", destination:"Files", link:"#files/data-room-item/<id>" }),
  evidencePackNotes:Object.freeze({ objectType:"File", sourceKind:"evidence-note", destination:"Files", link:"#files/evidence-note/<id>" }),
  soc2Evidence:Object.freeze({ objectType:"File", sourceKind:"soc2-evidence", destination:"Files", link:"#files/soc2-evidence/<id>" }),
  soc2Policies:Object.freeze({ objectType:"File", sourceKind:"soc2-policy", destination:"Files", link:"#files/soc2-policy/<id>" }),
  brandAssets:Object.freeze({ objectType:"File", sourceKind:"brand-asset", destination:"Files", link:"#files/brand-asset/<id>" }),
  tasks:Object.freeze({ objectType:"Task", sourceKind:"tasks", destination:"Inbox", link:"#item/tasks/<id>" }),
  reports:Object.freeze({ objectType:"Report", sourceKind:"report", destination:"Files", link:"#files/report/<id>" })
});
export const GLOBAL_SEARCH_READ_COLLECTIONS = Object.freeze(Object.keys(GLOBAL_SEARCH_SOURCE_MAPPINGS).sort());

const GROUP_INDEX = new Map(GLOBAL_SEARCH_GROUPS.map((group, index) => [group.id, index]));
const TYPE_ALIASES = Object.freeze({
  post:"posts",
  posts:"posts",
  campaign:"campaigns",
  campaigns:"campaigns",
  partner:"partners",
  partners:"partners",
  file:"files",
  files:"files",
  task:"tasks",
  tasks:"tasks",
  report:"reports",
  reports:"reports"
});

export class GlobalSearchValidationError extends Error {
  constructor(message, code = "invalid_search") {
    super(message);
    this.name = "GlobalSearchValidationError";
    this.code = code;
    this.status = 400;
  }
}

function hasUnsupportedText(value = "") {
  const text = String(value ?? "");
  return /[\u0000-\u001f\u007f]/u.test(text)
    || /<\s*\/?\s*(?:script|style|iframe|object|embed)\b/iu.test(text)
    || /\bon[\p{L}\p{N}_-]*\s*=/iu.test(text)
    || /(?:javascript|vbscript|data)\s*:/iu.test(text);
}

export function validateGlobalSearchQuery(value = "") {
  const query = String(value ?? "").trim();
  if (query.length > GLOBAL_SEARCH_LIMITS.queryLength) {
    throw new GlobalSearchValidationError("Search is too long. Shorten it and try again.", "query_too_long");
  }
  if (hasUnsupportedText(query)) {
    throw new GlobalSearchValidationError("Search contains unsupported characters. Update it and try again.", "unsupported_query");
  }
  return query;
}

function normalizedTypes(values = []) {
  const raw = (Array.isArray(values) ? values : String(values || "").split(",")).filter((value) => String(value || "").trim());
  if (!raw.length) return new Set(GLOBAL_SEARCH_GROUPS.map((group) => group.id));
  const requested = raw
    .map((value) => TYPE_ALIASES[normalize(value).trim()])
    .filter(Boolean);
  return new Set(requested);
}

function normalizedLimit(value) {
  if (value === undefined || value === null || value === "") return GLOBAL_SEARCH_LIMITS.defaultResults;
  if (!/^\d{1,3}$/.test(String(value))) throw new GlobalSearchValidationError("Search limit is invalid.", "invalid_limit");
  const parsed = Number(value);
  if (parsed < 1 || parsed > GLOBAL_SEARCH_LIMITS.maximumResults) {
    throw new GlobalSearchValidationError(`Search limit must be between 1 and ${GLOBAL_SEARCH_LIMITS.maximumResults}.`, "invalid_limit");
  }
  return parsed;
}

function normalizedCursor(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (!/^\d{1,8}$/.test(String(value))) throw new GlobalSearchValidationError("Search cursor is invalid.", "invalid_cursor");
  return Number(value);
}

export function recordVisibleToActor(record = {}, role = "viewer") {
  const allowedRoles = list(record.allowedRoles || record.allowed_roles).map(normalize);
  if (allowedRoles.length && !allowedRoles.includes(normalize(role))) return false;
  const visibility = normalize(record.visibility || record.access || "");
  const sensitive = record.ownerOnly === true
    || record.owner_only === true
    || record.sensitive === true
    || ["owner", "owner_only", "private", "sensitive"].includes(visibility);
  return !sensitive || roleHasCapability(role, "read_sensitive");
}

function updatedAt(record = {}) {
  return String(searchRecordUpdatedAt(record) || record.lastReviewedDate || record.date || "").slice(0, 80);
}

function titleFor(collection, record = {}) {
  if (collection === "posts") return record.title || record.workingTitle || record.hook || "Untitled Post";
  if (collection === "campaigns") return record.name || record.campaignName || record.title || "Untitled Campaign";
  if (collection === "partners") return record.organizationName || record.organization || record.name || "Untitled Partner";
  if (collection === "dataRoomItems") return record.name || record.title || "Untitled File";
  if (collection === "evidencePackNotes") return record.title || record.name || "Untitled Evidence note";
  if (collection === "soc2Evidence") return record.evidenceTitle || record.title || record.name || "Untitled Evidence";
  if (collection === "soc2Policies") return record.policyName || record.title || record.name || "Untitled Policy";
  if (collection === "brandAssets") return record.name || record.title || "Untitled Brand asset";
  if (collection === "tasks") return record.title || record.nextAction || "Untitled Task";
  if (collection === "reports") return record.reportTitle || record.title || record.name || "Untitled Report";
  return "Untitled";
}

function contextFor(collection, record = {}) {
  if (collection === "posts") return joined(record.hook, record.body || record.draftCopy || record.copy, record.channel || record.platform);
  if (collection === "campaigns") return joined(record.campaignType || record.type, record.goal || record.desiredOutcome, record.channel);
  if (collection === "partners") return joined(record.primaryContactName || record.contactName, record.geography || record.jurisdiction, record.nextAction || record.firstNextAction);
  if (collection === "dataRoomItems") return joined(record.section || record.collection, record.notes || record.summary);
  if (collection === "evidencePackNotes") return joined(record.section || record.collection, record.notes || record.summary);
  if (collection === "soc2Evidence") return joined(record.controlArea, record.notes || record.summary, record.sourceSystem);
  if (collection === "soc2Policies") return joined(record.summary, record.owner, record.lastReviewedDate);
  if (collection === "brandAssets") return joined(record.assetType || record.type, record.tags);
  if (collection === "tasks") return joined(record.description, record.nextAction, record.priority);
  if (collection === "reports") return joined(record.summary, record.reportingPeriod || record.reportPeriod || record.period, record.nextBestAction);
  return "";
}

function statusFor(collection, record = {}) {
  if (collection === "brandAssets" && record.approved === true) return "approved";
  return compact(record.status || record.stage || record.review_state || record.reviewState || "", "");
}

function linkFor(collection, id) {
  const mapping = GLOBAL_SEARCH_SOURCE_MAPPINGS[collection];
  if (!mapping) return null;
  if (collection === "tasks") return buildGenericItemLink({ collection:"tasks", sourceId:id })?.target || null;
  const objectType = collection === "reports" ? "File" : mapping.objectType;
  return buildExactObjectLink({ objectType, sourceKind:mapping.sourceKind, sourceId:id })?.target || null;
}

function groupForCollection(collection) {
  return GLOBAL_SEARCH_GROUPS.find((group) => group.collections.includes(collection));
}

function projection(collection, record, role) {
  if (!recordVisibleToActor(record, role)) return null;
  const mapping = GLOBAL_SEARCH_SOURCE_MAPPINGS[collection];
  const group = groupForCollection(collection);
  const id = safeId(record.id || record.key || record.slug);
  const canonicalHref = linkFor(collection, id);
  if (!mapping || !group || !id || !canonicalHref) return null;
  const title = compact(titleFor(collection, record), "Untitled");
  const context = compact(contextFor(collection, record), "");
  const searchable = [
    id,
    title,
    context,
    statusFor(collection, record),
    collection === "partners" && roleHasCapability(role, "read_sensitive")
      ? compact(record.primaryContactEmail || record.email, "").slice(0, 320)
      : ""
  ].filter(Boolean).join(" ");
  return Object.freeze({
    id,
    objectType:mapping.objectType,
    title,
    context,
    status:statusFor(collection, record),
    updatedAt:updatedAt(record),
    canonicalHref,
    destination:mapping.destination,
    sourceKind:mapping.sourceKind,
    groupId:group.id,
    searchText:normalize(searchable)
  });
}

export function buildGlobalSearchIndex(state = {}, { role = "viewer" } = {}) {
  const seen = new Set();
  const projected = [];
  for (const group of GLOBAL_SEARCH_GROUPS) {
    for (const collection of group.collections) {
      for (const record of list(state[collection])) {
        const item = projection(collection, record, role);
        if (!item || seen.has(item.canonicalHref)) continue;
        seen.add(item.canonicalHref);
        projected.push(item);
      }
    }
  }
  return Object.freeze(projected);
}

function words(value = "") {
  return normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
}

function relevance(item, query) {
  const normalizedQuery = normalize(query);
  const normalizedTitle = normalize(item.title);
  if (normalize(item.id) === normalizedQuery) return 1;
  if (normalizedTitle === normalizedQuery) return 2;
  if (normalizedTitle.startsWith(normalizedQuery)) return 3;
  const titleTokens = new Set(words(item.title));
  const queryTokens = words(query);
  if (queryTokens.length && queryTokens.every((token) => titleTokens.has(token))) return 4;
  if (normalizedTitle.includes(normalizedQuery)) return 5;
  if (item.searchText.includes(normalizedQuery)) return 6;
  return Number.POSITIVE_INFINITY;
}

function compareRanked(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const dateDifference = Date.parse(b.item.updatedAt || "") - Date.parse(a.item.updatedAt || "");
  if (Number.isFinite(dateDifference) && dateDifference !== 0) return dateDifference;
  const groupDifference = GROUP_INDEX.get(a.item.groupId) - GROUP_INDEX.get(b.item.groupId);
  if (groupDifference) return groupDifference;
  return normalize(a.item.title).localeCompare(normalize(b.item.title), "en-US")
    || normalize(a.item.id).localeCompare(normalize(b.item.id), "en-US");
}

function publicResult(item) {
  return Object.freeze({
    id:item.id,
    objectType:item.objectType,
    title:item.title,
    context:item.context,
    status:item.status,
    updatedAt:item.updatedAt,
    canonicalHref:item.canonicalHref,
    destination:item.destination,
    sourceKind:item.sourceKind
  });
}

function groupsFor(items) {
  return Object.freeze(GLOBAL_SEARCH_GROUPS.flatMap((group) => {
    const results = items.filter((item) => item.groupId === group.id).map(publicResult);
    return results.length ? [Object.freeze({ id:group.id, label:group.label, results:Object.freeze(results) })] : [];
  }));
}

export function searchGlobalRecords(state = {}, query = "", options = {}) {
  const validatedQuery = validateGlobalSearchQuery(query);
  const role = String(options.role || "viewer");
  const types = normalizedTypes(options.types);
  const limit = normalizedLimit(options.limit);
  const offset = normalizedCursor(options.cursor);
  const index = buildGlobalSearchIndex(state, { role });
  const recentHrefs = [...new Set(list(options.recentHrefs).map((value) => String(value || "").slice(0, 500)).filter(Boolean))]
    .slice(0, GLOBAL_SEARCH_LIMITS.recentRecords);

  if (!validatedQuery) {
    const byHref = new Map(index.map((item) => [item.canonicalHref, item]));
    const recentResults = recentHrefs.flatMap((href) => byHref.has(href) ? [publicResult(byHref.get(href))] : []);
    return Object.freeze({
      ok:true,
      groups:Object.freeze([]),
      recentResults:Object.freeze(recentResults),
      total:recentResults.length,
      returned:recentResults.length,
      truncated:false,
      nextCursor:null,
      limit,
      indexSize:index.length
    });
  }

  const ranked = index
    .filter((item) => types.has(item.groupId))
    .map((item) => ({ item, rank:relevance(item, validatedQuery) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort(compareRanked);
  const page = ranked.slice(offset, offset + limit).map((entry) => entry.item);
  const nextOffset = offset + page.length;
  return Object.freeze({
    ok:true,
    groups:groupsFor(page),
    recentResults:Object.freeze([]),
    total:ranked.length,
    returned:page.length,
    truncated:nextOffset < ranked.length,
    nextCursor:nextOffset < ranked.length ? String(nextOffset) : null,
    limit,
    indexSize:index.length
  });
}
