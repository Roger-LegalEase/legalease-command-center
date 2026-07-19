import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { buildFileViews } from "./file-view.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const FILES_PAGE_SIZE = 24;
export const FILES_VIEWS = freeze([
  { key:"home", label:"Home" },
  { key:"all", label:"All files" },
  { key:"recent", label:"Recent" },
  { key:"starred", label:"Starred" },
  { key:"shared", label:"Shared" },
  { key:"trash", label:"Trash" }
]);
export const FILES_COLLECTIONS = freeze([
  { key:"brand-assets", label:"Brand Assets" },
  { key:"partner-files", label:"Partner Files" },
  { key:"campaign-assets", label:"Campaign Assets" },
  { key:"investor-room", label:"Investor Room" },
  { key:"compliance-evidence", label:"Compliance & Evidence" }
]);

function sourceRecord(state, file) {
  return list(state[file.sourceCollection]).find((record) => clean(record?.id || record?.key || record?.slug) === file.sourceId) || {};
}

function collectionKey(file, record) {
  const explicit = lower(record.filesCollection || record.fileCollection || record.collection || record.section).replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
  if (["brand-assets", "partner-files", "campaign-assets", "investor-room", "compliance-evidence"].includes(explicit)) return explicit;
  if (file.sourceKind === "brand-asset") return "brand-assets";
  if (["evidence-note", "soc2-evidence", "soc2-policy"].includes(file.sourceKind)) return "compliance-evidence";
  if (file.relatedObjects.some((item) => item.kind === "Partner")) return "partner-files";
  if (file.relatedObjects.some((item) => item.kind === "Campaign" || item.kind === "Post")) return "campaign-assets";
  if (file.sourceKind === "data-room-item") return "investor-room";
  return null;
}

function itemFromFile(state, file) {
  const record = sourceRecord(state, file);
  const trashed = ["trash", "trashed", "deleted", "archived"].includes(lower(record.filesDisposition || record.status));
  return {
    id:file.stableKey,
    name:file.name,
    fileType:file.fileType,
    status:file.status,
    owner:file.owner,
    modifiedAt:file.modifiedAt,
    verifiedAt:file.verifiedAt,
    href:file.href,
    sourceRef:file.sourceRef,
    collection:collectionKey(file, record),
    starred:record.starred === true,
    shared:Array.isArray(record.allowedRoles) ? record.allowedRoles.length > 0 : record.shared === true,
    trashed,
    relatedObjects:file.relatedObjects,
    permissions:file.permissions
  };
}

function fingerprint(query) {
  return createHash("sha256").update(JSON.stringify(query)).digest("hex").slice(0, 24);
}

function encodeCursor(offset, query, secret) {
  const body = Buffer.from(JSON.stringify({ v:1, offset, filter:fingerprint(query) })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeCursor(cursor, query, secret) {
  if (!cursor) return 0;
  const [body, signature, extra] = clean(cursor).split(".");
  if (!body || !signature || extra) throw new Error("The Files cursor is invalid.");
  const expected = createHmac("sha256", secret).update(body).digest();
  let actual;
  try { actual = Buffer.from(signature, "base64url"); } catch { throw new Error("The Files cursor is invalid."); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("The Files cursor is invalid.");
  let parsed;
  try { parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new Error("The Files cursor is invalid."); }
  if (parsed?.v !== 1 || parsed.filter !== fingerprint(query) || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error("The Files cursor does not match these filters.");
  return parsed.offset;
}

function compareItems(left, right, sort) {
  if (sort === "name") return clean(left.name).localeCompare(clean(right.name), "en-US") || left.id.localeCompare(right.id, "en-US");
  if (sort === "owner") return clean(left.owner).localeCompare(clean(right.owner), "en-US") || clean(left.name).localeCompare(clean(right.name), "en-US");
  return clean(right.modifiedAt).localeCompare(clean(left.modifiedAt), "en-US") || clean(left.name).localeCompare(clean(right.name), "en-US") || left.id.localeCompare(right.id, "en-US");
}

export function buildFilesHome(state = {}, actor = {}, input = {}, options = {}) {
  const cursorSecret = clean(options.cursorSecret);
  if (cursorSecret.length < 16) throw new Error("A Files cursor secret is required.");
  const requestedView = lower(input.view || "home");
  const view = FILES_VIEWS.some((item) => item.key === requestedView) ? requestedView : "home";
  const requestedCollection = lower(input.collection);
  const collection = FILES_COLLECTIONS.some((item) => item.key === requestedCollection) ? requestedCollection : "";
  const search = clean(input.search).slice(0, 160);
  const type = lower(input.type);
  const status = lower(input.status);
  const sort = ["recent", "name", "owner"].includes(lower(input.sort)) ? lower(input.sort) : "recent";
  const query = { view, collection, search:lower(search), type, status, sort };
  const limit = Math.min(50, Math.max(1, Number.parseInt(input.limit, 10) || FILES_PAGE_SIZE));
  const offset = decodeCursor(input.cursor, query, cursorSecret);
  const allItems = buildFileViews(state, actor).map((file) => itemFromFile(state, file));
  const visible = allItems.filter((item) => {
    if (view !== "trash" && item.trashed) return false;
    if (view === "trash" && !item.trashed) return false;
    if (view === "starred" && !item.starred) return false;
    if (view === "shared" && !item.shared) return false;
    if (collection && item.collection !== collection) return false;
    if (type && item.fileType?.key !== type) return false;
    if (status && item.status?.key !== status) return false;
    if (search && !lower([item.name, item.owner, item.fileType?.label, item.status?.label].filter(Boolean).join(" ")).includes(lower(search))) return false;
    return true;
  }).sort((left, right) => compareItems(left, right, sort));
  const items = visible.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const count = (predicate) => allItems.filter(predicate).length;
  const facets = (field) => [...new Set(allItems.map((item) => clean(field(item))).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en-US"));
  return freeze({
    ok:true,
    query,
    navigation:{ views:FILES_VIEWS, collections:FILES_COLLECTIONS },
    summary:{
      available:count((item) => !item.trashed),
      recent:count((item) => !item.trashed && Boolean(item.modifiedAt)),
      starred:count((item) => !item.trashed && item.starred),
      shared:count((item) => !item.trashed && item.shared),
      trash:count((item) => item.trashed)
    },
    filters:{ types:facets((item) => item.fileType?.key), statuses:facets((item) => item.status?.key) },
    items,
    pagination:{ limit, returned:items.length, total:visible.length, nextCursor:nextOffset < visible.length ? encodeCursor(nextOffset, query, cursorSecret) : null }
  });
}
