import { roleHasCapability, roles } from "../roles.mjs";
import { FILE_SOURCE_MATRIX } from "../ui/view-models/file-sources.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const COLLECTIONS = new Set(["brand-assets", "partner-files", "campaign-assets", "investor-room", "compliance-evidence"]);
const RELATION_FIELDS = Object.freeze({ Partner:"partnerId", Campaign:"campaignId", Post:"postId" });
const recordId = (record = {}) => clean(record.id || record.key || record.slug);
const configFor = (kind) => FILE_SOURCE_MATRIX.included.find((item) => item.sourceKind === clean(kind)) || null;

export function createFilesOrganizationService({ readState, writeCollections, now = () => new Date().toISOString() } = {}) {
  if (typeof readState !== "function" || typeof writeCollections !== "function") throw new Error("Files organization persistence is not configured.");
  return Object.freeze({
    async apply({ actor = {}, sourceKind = "", sourceId = "", action = "", value = "", requestId = "" } = {}) {
      const role = lower(actor.role);
      if (actor.authenticated !== true || !roles.includes(role) || !roleHasCapability(role, "manage_growth")) throw new Error("This account cannot organize Files.");
      const config = configFor(sourceKind);
      const id = clean(sourceId);
      const operation = lower(action);
      const request = clean(requestId);
      if (!config || !id || !request || !["star", "unstar", "move", "trash", "restore", "relate-partner", "relate-campaign", "relate-post"].includes(operation)) throw new Error("A valid File organization action is required.");
      const state = await readState();
      if (list(state.auditHistory).some((item) => clean(item.requestId) === request)) return { ok:true, changed:false, idempotent:true };
      const record = list(state[config.collection]).find((item) => recordId(item) === id);
      if (!record) throw new Error("The File is no longer available.");
      const patch = {};
      if (["star", "unstar"].includes(operation)) patch.starred = operation === "star";
      if (operation === "move") {
        if (!COLLECTIONS.has(clean(value))) throw new Error("Choose a valid Files collection.");
        patch.filesCollection = clean(value);
      }
      if (operation === "trash") patch.filesDisposition = "trash";
      if (operation === "restore") patch.filesDisposition = "active";
      if (operation.startsWith("relate-")) {
        const kind = operation.slice(7).replace(/^./, (character) => character.toUpperCase());
        const relatedId = clean(value);
        if (!RELATION_FIELDS[kind] || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/.test(relatedId)) throw new Error("Choose a valid related record.");
        patch[RELATION_FIELDS[kind]] = relatedId;
      }
      const timestamp = clean(now());
      const updated = { ...record, ...patch, updatedAt:timestamp };
      const event = { id:`file-organized-${config.sourceKind}-${id}-${request}`, eventType:"file updated", relatedObjectType:config.collection, relatedObjectId:id, createdAt:timestamp };
      const audit = { id:`audit-${event.id}`, requestId:request, action:`file ${operation}`, resourceType:config.collection, resourceId:id, actor:role, timestamp };
      await writeCollections({
        [config.collection]:[updated, ...list(state[config.collection]).filter((item) => recordId(item) !== id)],
        activityEvents:[event, ...list(state.activityEvents).filter((item) => clean(item.id) !== event.id)].slice(0, 500),
        auditHistory:[audit, ...list(state.auditHistory).filter((item) => clean(item.id) !== audit.id)].slice(0, 1000)
      });
      return { ok:true, changed:true, href:`#files/${encodeURIComponent(config.sourceKind)}/${encodeURIComponent(id)}` };
    }
  });
}
