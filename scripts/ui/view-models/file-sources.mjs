import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";
import { buildExactObjectLink } from "../route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const FILE_SOURCE_MATRIX = deepFreeze({
  included: [
    { collection: "reports", sourceKind: "report", nameFields: ["reportTitle", "title", "name"], aliases: [] },
    { collection: "dataRoomItems", sourceKind: "data-room-item", nameFields: ["title", "name", "fileName"], aliases: ["dataRoom"] },
    { collection: "evidencePackNotes", sourceKind: "evidence-note", nameFields: ["title", "name"], aliases: [] },
    { collection: "soc2Evidence", sourceKind: "soc2-evidence", nameFields: ["evidenceTitle", "title", "name", "artifactFilename"], aliases: [] },
    { collection: "soc2Policies", sourceKind: "soc2-policy", nameFields: ["policyName", "title", "name"], aliases: [] },
    { collection: "brandAssets", sourceKind: "brand-asset", nameFields: ["name", "title", "slug"], aliases: [] }
  ],
  deferred: [
    { collection: "partnerProgramArtifacts", family: "Partner program artifacts", reason: "The current reviewed route remains under Partners, not Files." },
    { collection: "postImages", family: "Social image versions", reason: "The current reviewed route remains under Social and each image version must stay attached to its Post." },
    { collection: "localAssets", family: "Local operational assets", reason: "Local path metadata is private and no typed File route exists." },
    { collection: "postingKits", family: "Social posting kits", reason: "No reviewed File source-kind exists." },
    { collection: "campaignKits", family: "Campaign result/export kits", reason: "No reviewed File source-kind exists; explicitly linked reports remain included as reports." },
    { collection: "evidenceSummaries", family: "Evidence summaries", reason: "No reviewed File source-kind exists." },
    { collection: "handoffPackets", family: "Partner handoff packets", reason: "The current reviewed route remains under Partners." },
    { collection: "soc2AccessReviews", family: "SOC 2 access reviews", reason: "The current reviewed route remains under Settings." },
    { collection: "soc2Changes", family: "SOC 2 change records", reason: "The current reviewed route remains under Settings." },
    { collection: "soc2Incidents", family: "SOC 2 incident records", reason: "The current reviewed route remains under Settings." },
    { collection: "soc2AuditLogs", family: "SOC 2 audit logs", reason: "Raw audit records are not Files and must not be copied." },
    { collection: "assetBundles", family: "Asset bundles", reason: "The collection is seed/read-only and has no registered writer or reviewed File route." }
  ]
});

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function sourceId(record = {}) {
  return clean(record.id || record.key || record.slug);
}

function updatedAt(record = {}) {
  return clean(
    record.updatedAt || record.updated_at || record.lastUpdated || record.last_updated
    || record.generatedAt || record.generated_at || record.createdAt || record.created_at
  );
}

function knownActorRole(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true
    && roles.includes(role)
    && roleHasCapability(role, "read_internal")
    ? role
    : "";
}

function exactHref(sourceKind, id) {
  return buildExactObjectLink({ objectType: "File", sourceKind, sourceId: id })?.target || "";
}

function sourceRecords(state, config) {
  return [
    ...list(state[config.collection]).map((record) => ({ record, rawCollection: config.collection, alias: false })),
    ...config.aliases.flatMap((collection) => list(state[collection]).map((record) => ({ record, rawCollection: collection, alias: true })))
  ];
}

export function collectFileSourceRecords(state = {}, actor = {}) {
  const role = knownActorRole(actor);
  if (!role) return { role: "", canViewPrivateAssets: false, candidates: [], candidateRecordsScanned: 0 };
  const candidates = [];
  for (const config of FILE_SOURCE_MATRIX.included) {
    for (const item of sourceRecords(state, config)) {
      if (!recordVisibleToActor(item.record, role)) continue;
      const id = sourceId(item.record);
      const href = exactHref(config.sourceKind, id);
      if (!id || !href) continue;
      candidates.push({
        ...item,
        config,
        sourceCollection: config.collection,
        sourceKind: config.sourceKind,
        sourceId: id,
        stableKey: `${config.sourceKind}:${id}`,
        href
      });
    }
  }
  candidates.sort((left, right) =>
    left.stableKey.localeCompare(right.stableKey, "en-US")
    || Number(left.alias) - Number(right.alias)
    || updatedAt(right.record).localeCompare(updatedAt(left.record), "en-US")
    || stableSerialize(left.record).localeCompare(stableSerialize(right.record), "en-US")
  );
  return {
    role,
    canViewPrivateAssets: roleHasCapability(role, "view_private_assets"),
    candidates,
    candidateRecordsScanned: candidates.length
  };
}

export function fileSourceName(candidate = {}) {
  for (const field of candidate.config?.nameFields || []) {
    const value = clean(candidate.record?.[field]);
    if (value) return value;
  }
  return null;
}
