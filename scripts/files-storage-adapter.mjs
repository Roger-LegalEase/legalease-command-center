import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const clean = (value = "") => String(value ?? "").trim();
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif",
  "text/plain", "text/markdown", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

export function validateFileUpload({ fileName = "", contentType = "", size = 0 } = {}) {
  const name = clean(fileName);
  const type = clean(contentType).toLowerCase();
  const bytes = Number(size);
  if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name) || /[\\/]/.test(name) || name === "." || name === "..") throw new Error("Choose a valid file name.");
  if (!ALLOWED_TYPES.has(type)) throw new Error("This file type is not supported.");
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_FILE_BYTES) throw new Error(`Files must be between 1 byte and ${MAX_FILE_BYTES} bytes.`);
  return { fileName:name, contentType:type, size:bytes };
}

function safeObjectPath(value = "") {
  const objectPath = clean(value).replaceAll("\\", "/");
  if (!objectPath || objectPath.startsWith("/") || objectPath.length > 500 || /(?:^|\/)\.\.(?:\/|$)/.test(objectPath) || /[\u0000-\u001f\u007f]/.test(objectPath)) throw new Error("The storage path is invalid.");
  return objectPath;
}

export function createLocalFilesStorage({ rootDir } = {}) {
  const root = path.resolve(clean(rootDir));
  if (!rootDir || [path.parse(root).root, process.cwd()].includes(root)) throw new Error("A dedicated local Files directory is required.");
  const resolveTarget = (objectPath) => {
    const safe = safeObjectPath(objectPath);
    const target = path.resolve(root, ...safe.split("/"));
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("The storage path is invalid.");
    return { safe, target };
  };
  return Object.freeze({
    mode:"local",
    async put({ objectPath, bytes }) {
      const { safe, target } = resolveTarget(objectPath);
      await mkdir(path.dirname(target), { recursive:true, mode:0o700 });
      await writeFile(target, bytes, { flag:"wx", mode:0o600 });
      return { objectRef:`files/${safe}`, publicUrl:null };
    },
    async get({ objectPath }) { return readFile(resolveTarget(objectPath).target); },
    async remove({ objectPath }) { await rm(resolveTarget(objectPath).target, { force:true }); }
  });
}

export function createSupabaseFilesStorage({ baseUrl, serviceRoleKey, bucket = "command-center-files", fetchImpl = globalThis.fetch } = {}) {
  let origin;
  try { origin = new URL(clean(baseUrl)); } catch { throw new Error("Hosted Files storage is not configured."); }
  if (origin.protocol !== "https:" || !clean(serviceRoleKey) || typeof fetchImpl !== "function") throw new Error("Hosted Files storage is not configured.");
  const bucketName = clean(bucket);
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(bucketName)) throw new Error("Hosted Files storage is not configured.");
  const request = async (method, objectPath, body, contentType) => {
    const safe = safeObjectPath(objectPath);
    const endpoint = new URL(`/storage/v1/object/${encodeURIComponent(bucketName)}/${safe.split("/").map(encodeURIComponent).join("/")}`, origin);
    const response = await fetchImpl(endpoint, {
      method,
      headers:{ authorization:`Bearer ${serviceRoleKey}`, apikey:serviceRoleKey, ...(contentType ? { "content-type":contentType, "x-upsert":"false" } : {}) },
      body
    });
    if (!response.ok) throw new Error("Secure file storage did not complete.");
    return { safe, response };
  };
  return Object.freeze({
    mode:"hosted",
    async put({ objectPath, bytes, contentType }) {
      const { safe } = await request("POST", objectPath, bytes, contentType);
      return { objectRef:`supabase://${bucketName}/${safe}`, publicUrl:null };
    },
    async get({ objectPath }) { const { response } = await request("GET", objectPath); return Buffer.from(await response.arrayBuffer()); },
    async remove({ objectPath }) { await request("DELETE", objectPath); }
  });
}

export const FILE_UPLOAD_LIMITS = Object.freeze({ maxBytes:MAX_FILE_BYTES, allowedTypes:Object.freeze([...ALLOWED_TYPES].sort()) });
