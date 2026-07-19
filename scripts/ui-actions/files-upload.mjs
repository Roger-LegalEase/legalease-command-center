import { roleHasCapability, roles } from "../roles.mjs";
import { validateFileUpload } from "../files-storage-adapter.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const safeId = (value = "") => clean(value).replaceAll(/[^a-zA-Z0-9_-]+/g, "-").replaceAll(/^-+|-+$/g, "").slice(0, 120);

function assertUploadActor(actor = {}) {
  const role = lower(actor.role);
  if (actor.authenticated !== true || !roles.includes(role) || !roleHasCapability(role, "manage_growth")) throw new Error("This account cannot upload Files.");
  return role;
}

function collectionPatch(state, record, activity, audit) {
  return {
    dataRoomItems:[record, ...list(state.dataRoomItems).filter((item) => clean(item.id) !== record.id)],
    activityEvents:[activity, ...list(state.activityEvents).filter((item) => clean(item.id) !== activity.id)].slice(0, 500),
    auditHistory:[audit, ...list(state.auditHistory).filter((item) => clean(item.id) !== audit.id)].slice(0, 1000)
  };
}

export function createFilesUploadService({ readState, writeCollections, storage, now = () => new Date().toISOString(), randomId = () => crypto.randomUUID() } = {}) {
  if (typeof readState !== "function" || typeof writeCollections !== "function" || !storage?.put || !storage?.remove) throw new Error("Files upload persistence is not configured.");
  async function save({ actor = {}, input = {}, bytes, replaces = null } = {}) {
    const role = assertUploadActor(actor);
    const binary = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
    const validated = validateFileUpload({ fileName:input.fileName, contentType:input.contentType, size:binary.byteLength });
    const requestId = safeId(input.requestId);
    if (!requestId) throw new Error("A stable upload request ID is required.");
    const state = await readState();
    const existingRequest = list(state.dataRoomItems).find((item) => clean(item.uploadRequestId) === requestId);
    if (existingRequest) return { ok:true, created:false, fileId:existingRequest.id, href:`#files/data-room-item/${encodeURIComponent(existingRequest.id)}` };
    if (replaces && !list(state.dataRoomItems).some((item) => clean(item.id) === clean(replaces))) throw new Error("The File to replace is no longer available.");
    const timestamp = clean(now());
    if (!Number.isFinite(Date.parse(timestamp))) throw new Error("A valid upload timestamp is required.");
    const id = `upload-${safeId(randomId())}`;
    if (id === "upload-") throw new Error("A stable File ID could not be created.");
    const objectPath = `${timestamp.slice(0, 10)}/${id}/${validated.fileName}`;
    let stored = false;
    try {
      const result = await storage.put({ objectPath, bytes:binary, contentType:validated.contentType });
      stored = true;
      const record = {
        id,
        title:clean(input.name) || validated.fileName,
        fileName:validated.fileName,
        mimeType:validated.contentType,
        sizeBytes:validated.size,
        storageRef:result.objectRef,
        status:"draft",
        filesCollection:clean(input.collection) || null,
        owner:clean(input.owner) || clean(actor.name) || role,
        uploadRequestId:requestId,
        createdAt:timestamp,
        updatedAt:timestamp,
        ...(replaces ? { versionOfId:clean(replaces), previousVersionId:clean(replaces) } : {})
      };
      const activity = { id:`file-uploaded-${id}`, eventType:replaces ? "file replaced" : "file uploaded", relatedObjectType:"dataRoomItems", relatedObjectId:id, createdAt:timestamp };
      const audit = { id:`audit-file-uploaded-${id}`, action:replaces ? "file version uploaded" : "file uploaded", resourceType:"dataRoomItems", resourceId:id, actor:role, timestamp };
      await writeCollections(collectionPatch(state, record, activity, audit));
      return { ok:true, created:true, fileId:id, href:`#files/data-room-item/${encodeURIComponent(id)}`, versionOf:replaces || null, publicUrl:null };
    } catch (error) {
      if (stored) await storage.remove({ objectPath }).catch(() => {});
      throw error;
    }
  }
  return Object.freeze({
    upload:(options) => save(options),
    replace:(options) => save({ ...options, replaces:clean(options?.replaces) })
  });
}
