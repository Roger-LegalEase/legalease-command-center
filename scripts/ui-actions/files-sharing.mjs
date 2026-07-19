import { roleHasCapability, roles } from "../roles.mjs";
import { FILE_SOURCE_MATRIX } from "../ui/view-models/file-sources.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const SHAREABLE_ROLES = new Set(["owner", "admin", "operator", "viewer"]);

function assertActor(actor = {}) {
  const role = lower(actor.role);
  if (actor.authenticated !== true || !roles.includes(role) || !roleHasCapability(role, "manage_roles")) throw new Error("This account cannot change File access.");
  return role;
}

function sourceConfig(sourceKind) {
  return FILE_SOURCE_MATRIX.included.find((item) => item.sourceKind === clean(sourceKind)) || null;
}

function recordId(record = {}) { return clean(record.id || record.key || record.slug); }

export function createFilesSharingService({ readState, writeCollections, now = () => new Date().toISOString() } = {}) {
  if (typeof readState !== "function" || typeof writeCollections !== "function") throw new Error("File access persistence is not configured.");
  async function apply(action, { actor = {}, sourceKind = "", sourceId = "", targetRole = "", expectedUpdatedAt = "", requestId = "" } = {}) {
    const actorRole = assertActor(actor);
    const config = sourceConfig(sourceKind);
    const id = clean(sourceId);
    const role = lower(targetRole);
    const idempotencyKey = clean(requestId);
    if (!config || !id || !SHAREABLE_ROLES.has(role) || !idempotencyKey) throw new Error("A valid File, role, and request ID are required.");
    const state = await readState();
    if (list(state.auditHistory).some((item) => clean(item.requestId) === idempotencyKey)) return { ok:true, changed:false, idempotent:true };
    const record = list(state[config.collection]).find((item) => recordId(item) === id);
    if (!record) throw new Error("The File is no longer available.");
    const updatedAt = clean(record.updatedAt || record.updated_at || record.lastUpdated || record.last_updated || record.generatedAt || record.generated_at);
    if (expectedUpdatedAt && clean(expectedUpdatedAt) !== updatedAt) throw new Error("File access changed. Refresh before trying again.");
    const current = new Set(list(record.allowedRoles || record.allowed_roles).map(lower).filter(SHAREABLE_ROLES.has.bind(SHAREABLE_ROLES)));
    const had = current.has(role);
    if (action === "grant") current.add(role); else current.delete(role);
    if (action === "revoke" && role === "owner") throw new Error("Owner access cannot be revoked from Files.");
    const changed = action === "grant" ? !had : had;
    if (!changed) return { ok:true, changed:false, idempotent:false };
    const timestamp = clean(now());
    const updated = { ...record, allowedRoles:[...current].sort(), updatedAt:timestamp };
    const event = { id:`file-access-${action}-${config.sourceKind}-${id}-${role}-${idempotencyKey}`, eventType:action === "grant" ? "file shared" : "file access revoked", relatedObjectType:config.collection, relatedObjectId:id, createdAt:timestamp };
    const audit = { id:`audit-${event.id}`, requestId:idempotencyKey, action:`file access ${action}ed`, resourceType:config.collection, resourceId:id, actor:actorRole, targetRole:role, timestamp };
    await writeCollections({
      [config.collection]:[updated, ...list(state[config.collection]).filter((item) => recordId(item) !== id)],
      activityEvents:[event, ...list(state.activityEvents).filter((item) => clean(item.id) !== event.id)].slice(0, 500),
      auditHistory:[audit, ...list(state.auditHistory).filter((item) => clean(item.id) !== audit.id)].slice(0, 1000)
    });
    return { ok:true, changed:true, access:{ role, granted:action === "grant" }, public:false, href:`#files/${encodeURIComponent(config.sourceKind)}/${encodeURIComponent(id)}` };
  }
  return Object.freeze({ grant:(input) => apply("grant", input), revoke:(input) => apply("revoke", input) });
}

export const FILE_SHARING_CONTRACT = Object.freeze({ publicLinksSupported:false, reason:"The current security model has no reviewed expiring public-link authority." });
