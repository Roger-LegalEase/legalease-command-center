import path from "node:path";

import { readFilesHome } from "./ui-api/files-read.mjs";
import { readFileDetails } from "./ui-api/file-details-read.mjs";
import { readInvestorRoom } from "./ui-api/investor-room-read.mjs";
import { createFilesUploadService } from "./ui-actions/files-upload.mjs";
import { createFilesReportService } from "./ui-actions/files-reports.mjs";
import { createFilesSharingService } from "./ui-actions/files-sharing.mjs";
import { createFilesOrganizationService } from "./ui-actions/files-organize.mjs";
import { FILE_SOURCE_MATRIX } from "./ui/view-models/file-sources.mjs";
import { roleHasCapability } from "./roles.mjs";
import { renderFilesHome } from "./ui/pages/files-home.mjs";
import { renderFileDetails } from "./ui/pages/file-details.mjs";
import { renderInvestorRoom } from "./ui/pages/investor-room.mjs";
import { renderFileUploadDialog } from "./ui/pages/file-upload.mjs";
import { renderFilesReportActions } from "./ui/pages/files-report-actions.mjs";
import { renderFileSharingControls } from "./ui/pages/file-sharing.mjs";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const PREFIX = "/api/ui/files";
const HOME_QUERY = new Set(["view", "collection", "search", "type", "status", "sort", "limit", "cursor"]);
const CONTENT_QUERY = new Set(["download"]);
const NO_QUERY = new Set();

export const FILES_JSON_BODY_LIMIT = 32_000;
export const FILES_MULTIPART_BODY_LIMIT = (25 * 1024 * 1024) + 64_000;
export const FILES_TEXT_PREVIEW_LIMIT = 200_000;
export const FILES_READ_COLLECTIONS = Object.freeze([
  "activityEvents",
  "auditHistory",
  "brandAssets",
  "dataRoom",
  "dataRoomItems",
  "evidencePackNotes",
  "reports",
  "soc2Evidence",
  "soc2Policies"
]);

export function parseFilesMultipart(body, contentType = "") {
  const match = clean(contentType).match(/^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=?-]{1,70})"|([A-Za-z0-9'()+_,.\/:=?-]{1,70}))$/i);
  if (!match) throw error("A valid multipart File upload is required.");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const payload = Buffer.from(body || []);
  const fields = {};
  let bytes = null;
  let position = 0;
  while (position < payload.length) {
    const start = payload.indexOf(boundary, position);
    if (start < 0) break;
    const after = start + boundary.length;
    if (payload.subarray(after, after + 2).equals(Buffer.from("--"))) break;
    const headerStart = after + 2;
    const headerEnd = payload.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd < 0) throw error("The multipart File upload is malformed.");
    const next = payload.indexOf(boundary, headerEnd + 4);
    if (next < 0) throw error("The multipart File upload is malformed.");
    const headers = payload.subarray(headerStart, headerEnd).toString("utf8");
    const disposition = headers.match(/content-disposition:\s*form-data;\s*name="([A-Za-z][A-Za-z0-9_-]{0,40})"(?:;\s*filename="([^"\r\n]{1,200})")?/i);
    if (!disposition) throw error("The multipart File upload is malformed.");
    const value = payload.subarray(headerEnd + 4, Math.max(headerEnd + 4, next - 2));
    if (disposition[2] !== undefined) {
      if (disposition[1] !== "file" || bytes !== null) throw error("Upload exactly one File.");
      bytes = value;
      fields.fileName = disposition[2];
      fields.contentType = clean(headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]).toLowerCase();
    } else {
      if (!["name", "collection", "requestId"].includes(disposition[1]) || value.length > 500) throw error("The File upload contains an unsupported field.");
      fields[disposition[1]] = value.toString("utf8");
    }
    position = next;
  }
  if (!bytes || !fields.fileName || !fields.contentType || !fields.requestId) throw error("Choose one supported File and provide a stable request ID.");
  return { fields, bytes };
}

export function isFilesApiPath(pathname = "") {
  const value = clean(pathname);
  return value === PREFIX || value.startsWith(`${PREFIX}/`);
}

function error(message, status = 400, outcome = "rejected") {
  const value = new Error(message);
  value.status = status;
  value.outcome = outcome;
  return value;
}

function assertQuery(searchParams, allowed) {
  for (const key of searchParams?.keys?.() || []) if (!allowed.has(key)) throw error("The Files request contains an unsupported query field.");
}

function decode(value, label) {
  let result;
  try { result = decodeURIComponent(clean(value)); } catch { throw error(`The ${label} is malformed.`); }
  if (!result || result.length > 240 || result !== result.trim() || /[\u0000-\u001f\u007f<>"'`\\/]/u.test(result) || /^(?:javascript|data|vbscript)\s*:/i.test(result) || result === "." || result === "..") throw error(`The ${label} is invalid.`);
  return result;
}

function route(pathname) {
  const value = clean(pathname);
  if (value === PREFIX) return { kind:"home" };
  if (value === `${PREFIX}/investor-room`) return { kind:"investor_room" };
  if (value === `${PREFIX}/upload`) return { kind:"upload" };
  if (value === `${PREFIX}/reports/generate`) return { kind:"report_generate" };
  const reportCollection = value.match(/^\/api\/ui\/files\/reports\/([^/]+)\/collection$/);
  if (reportCollection) return { kind:"report_collection", reportId:decode(reportCollection[1], "report identifier") };
  const match = value.match(/^\/api\/ui\/files\/([^/]+)\/([^/]+)(?:\/(content|replace|organize|access\/(grant|revoke)))?$/);
  if (!match) return null;
  const sourceKind = decode(match[1], "File source kind");
  const sourceId = decode(match[2], "File identifier");
  const action = match[3] || "";
  if (!action) return { kind:"detail", sourceKind, sourceId };
  if (action === "content") return { kind:"content", sourceKind, sourceId };
  if (action === "replace") return { kind:"replace", sourceKind, sourceId };
  if (action === "organize") return { kind:"organize", sourceKind, sourceId };
  return { kind:`access_${match[4]}`, sourceKind, sourceId };
}

function ports(store) {
  if (typeof store?.readCollections !== "function" || typeof store?.writeCollections !== "function") throw error("Scoped Files persistence is unavailable.", 503, "failed_closed");
  return { readState:() => store.readCollections(FILES_READ_COLLECTIONS), writeCollections:(patch) => store.writeCollections(patch) };
}

function homeQuery(searchParams) {
  assertQuery(searchParams, HOME_QUERY);
  return Object.fromEntries([...HOME_QUERY].flatMap((key) => searchParams?.has?.(key) ? [[key, searchParams.get(key)]] : []));
}

function sourceRecord(state, sourceKind, sourceId) {
  const config = FILE_SOURCE_MATRIX.included.find((item) => item.sourceKind === sourceKind);
  if (!config) return null;
  return list(state[config.collection]).find((item) => clean(item?.id || item?.key || item?.slug) === sourceId) || null;
}

function privateObjectPath(reference = "") {
  const value = clean(reference).replaceAll("\\", "/");
  if (value.startsWith("files/")) return value.slice("files/".length);
  if (value.startsWith("supabase://")) {
    const remainder = value.slice("supabase://".length);
    const slash = remainder.indexOf("/");
    return slash > 0 ? remainder.slice(slash + 1) : "";
  }
  return "";
}

async function contentResult({ state, actor, sourceKind, sourceId, storage, download }) {
  const details = readFileDetails({ state, actor, sourceKind, sourceId });
  if (!details) throw error("The File is not available.", 404, "not_available");
  const record = sourceRecord(state, sourceKind, sourceId);
  const objectPath = privateObjectPath(record?.storageRef || record?.storage_ref);
  if (!objectPath || typeof storage?.get !== "function") throw error("A private preview is not available for this File.", 404, "not_available");
  const bytes = Buffer.from(await storage.get({ objectPath }));
  const type = clean(record?.mimeType || record?.contentType || "application/octet-stream").toLowerCase();
  const text = type.startsWith("text/");
  const body = text ? bytes.subarray(0, FILES_TEXT_PREVIEW_LIMIT) : bytes;
  return { status:200, raw:{ body, contentType:type, download:download === true, fileName:path.basename(clean(record?.fileName) || "file") } };
}

export async function handleFilesApiRequest({
  enabled = false, method = "GET", pathname = "", searchParams = new URLSearchParams(), input = {}, upload = null,
  store, storage, reportGenerator, cursorSecret = "", requirements = [], actor = {}, now = new Date().toISOString()
} = {}) {
  if (!isFilesApiPath(pathname)) return { matched:false };
  try {
    const selected = route(pathname);
    if (!selected) return { matched:true, status:404, body:{ ok:false, error:"Files route not found." } };
    if (!enabled) return { matched:true, status:404, body:{ ok:false, error:"Files are unavailable." } };
    const verb = clean(method).toUpperCase();
    if (selected.kind === "home" && verb === "GET") {
      if (clean(cursorSecret).length < 16) throw error("Files are temporarily unavailable.", 503, "failed_closed");
      const state = await store.readCollections(FILES_READ_COLLECTIONS);
      const view = readFilesHome({ state, actor, query:homeQuery(searchParams), cursorSecret });
      return { matched:true, status:200, body:{ ...view, html:`${renderFilesHome(view)}${renderFileUploadDialog()}${renderFilesReportActions()}` } };
    }
    if (selected.kind === "investor_room" && verb === "GET") {
      assertQuery(searchParams, NO_QUERY);
      const state = await store.readCollections(FILES_READ_COLLECTIONS);
      const view = readInvestorRoom({ state, actor, requirements, now });
      return { matched:true, status:200, body:{ ...view, html:renderInvestorRoom(view) } };
    }
    if (selected.kind === "detail" && verb === "GET") {
      assertQuery(searchParams, NO_QUERY);
      const state = await store.readCollections(FILES_READ_COLLECTIONS);
      const body = readFileDetails({ state, actor, sourceKind:selected.sourceKind, sourceId:selected.sourceId });
      const sharingControls = body ? renderFileSharingControls({ file:body.file, sharing:body.sharing, canManage:roleHasCapability(actor.role, "manage_roles") }) : "";
      return { matched:true, status:body ? 200 : 404, body:body ? { ...body, html:renderFileDetails(body, { sharingControls }) } : { ok:false, outcome:"not_available", error:"The File is not available." } };
    }
    if (selected.kind === "content" && verb === "GET") {
      assertQuery(searchParams, CONTENT_QUERY);
      const state = await store.readCollections(FILES_READ_COLLECTIONS);
      return { matched:true, ...(await contentResult({ state, actor, sourceKind:selected.sourceKind, sourceId:selected.sourceId, storage, download:searchParams.get("download") === "1" })) };
    }
    const servicePorts = ports(store);
    if (selected.kind === "upload" && verb === "POST") {
      assertQuery(searchParams, NO_QUERY);
      const service = createFilesUploadService({ ...servicePorts, storage, now:() => now });
      return { matched:true, status:200, body:await service.upload({ actor, input:upload?.fields || {}, bytes:upload?.bytes }) };
    }
    if (selected.kind === "replace" && verb === "POST") {
      assertQuery(searchParams, NO_QUERY);
      if (selected.sourceKind !== "data-room-item") throw error("Only reviewed uploaded Files can be replaced.", 409, "conflict");
      const service = createFilesUploadService({ ...servicePorts, storage, now:() => now });
      return { matched:true, status:200, body:await service.replace({ actor, replaces:selected.sourceId, input:upload?.fields || {}, bytes:upload?.bytes }) };
    }
    if (selected.kind === "report_generate" && verb === "POST") {
      assertQuery(searchParams, NO_QUERY);
      const service = createFilesReportService({ ...servicePorts, generateReport:reportGenerator, now:() => now });
      return { matched:true, status:200, body:await service.generate({ actor, reportType:input.reportType, requestId:input.requestId }) };
    }
    if (selected.kind === "report_collection" && verb === "POST") {
      assertQuery(searchParams, NO_QUERY);
      const service = createFilesReportService({ ...servicePorts, generateReport:reportGenerator, now:() => now });
      return { matched:true, status:200, body:await service.place({ actor, reportId:selected.reportId, collection:input.collection, expectedUpdatedAt:input.expectedUpdatedAt }) };
    }
    if (selected.kind === "organize" && verb === "POST") {
      assertQuery(searchParams, NO_QUERY);
      const service = createFilesOrganizationService({ ...servicePorts, now:() => now });
      return { matched:true, status:200, body:await service.apply({ actor, sourceKind:selected.sourceKind, sourceId:selected.sourceId, action:input.action, value:input.value, requestId:input.requestId }) };
    }
    if (["access_grant", "access_revoke"].includes(selected.kind) && verb === "POST") {
      assertQuery(searchParams, NO_QUERY);
      const service = createFilesSharingService({ ...servicePorts, now:() => now });
      const action = selected.kind === "access_grant" ? "grant" : "revoke";
      return { matched:true, status:200, body:await service[action]({ actor, sourceKind:selected.sourceKind, sourceId:selected.sourceId, targetRole:input.targetRole, expectedUpdatedAt:input.expectedUpdatedAt, requestId:input.requestId }) };
    }
    return { matched:true, status:405, body:{ ok:false, error:"Files method not allowed." } };
  } catch (cause) {
    const status = [400, 403, 404, 409, 413, 503].includes(Number(cause?.status)) ? Number(cause.status) : 400;
    return { matched:true, status, body:{ ok:false, outcome:cause?.outcome || (status === 404 ? "not_available" : status === 409 ? "conflict" : status >= 500 ? "failed_closed" : "rejected"), error:status >= 500 ? "Files could not complete this request. No public access or external action occurred." : clean(cause?.message) || "The Files request was rejected." } };
  }
}
