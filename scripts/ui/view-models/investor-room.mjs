import { buildFileViews } from "./file-view.mjs";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const INVESTOR_ROOM_SECTIONS = freeze(["Company", "Financial", "Product", "Traction", "Legal & Compliance", "Team"]);

function normalizeRequirement(requirement = {}) {
  const id = clean(requirement.id);
  const section = clean(requirement.section);
  const sourceRefs = list(requirement.sourceRefs).map(clean).filter((value) => /^[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(value));
  if (!id || !clean(requirement.name) || !INVESTOR_ROOM_SECTIONS.includes(section) || !sourceRefs.length) return null;
  return {
    id,
    name:clean(requirement.name),
    section,
    owner:clean(requirement.owner) || null,
    required:requirement.required !== false,
    staleAfterDays:Number.isSafeInteger(requirement.staleAfterDays) && requirement.staleAfterDays > 0 ? requirement.staleAfterDays : null,
    sourceRefs:[...new Set(sourceRefs)].sort()
  };
}

function itemState(requirement, file, now) {
  if (!file) return { key:"missing", label:"Missing", current:false, reason:"No authorized File is attached to this requirement." };
  if (["missing", "needs_update", "needs-update", "stale"].includes(file.status?.key)) return { key:"needs-update", label:"Needs update", current:false, reason:"The source File is marked as missing or needing an update." };
  if (requirement.staleAfterDays) {
    if (!file.verifiedAt) return { key:"needs-update", label:"Needs update", current:false, reason:"A verification date is required to confirm freshness." };
    const age = Date.parse(now) - Date.parse(file.verifiedAt);
    if (!Number.isFinite(age) || age > requirement.staleAfterDays * 86400000) return { key:"needs-update", label:"Needs update", current:false, reason:"The last verification is outside the approved freshness window." };
  }
  if (file.status?.key === "current") return { key:"current", label:"Current", current:true, reason:null };
  return { key:"draft", label:file.status?.label || "Draft", current:false, reason:"The source File is available but is not explicitly current." };
}

export function buildInvestorRoom(state = {}, actor = {}, requirements = [], now = "") {
  const timestamp = clean(now);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("Investor Room requires a valid current timestamp.");
  const normalized = list(requirements).map(normalizeRequirement).filter(Boolean);
  const files = new Map(buildFileViews(state, actor).map((file) => [file.stableKey, file]));
  const items = normalized.map((requirement) => {
    const file = requirement.sourceRefs.map((ref) => files.get(ref)).find(Boolean) || null;
    const readiness = itemState(requirement, file, timestamp);
    return {
      id:requirement.id,
      name:requirement.name,
      section:requirement.section,
      owner:requirement.owner || file?.owner || null,
      required:requirement.required,
      status:readiness,
      lastVerifiedAt:file?.verifiedAt || null,
      shareStatus:file ? (file.permissions.allowedRoles.length ? "Restricted access set" : "Access unavailable") : null,
      file:file ? { id:file.stableKey, name:file.name, href:file.href } : null
    };
  });
  const required = items.filter((item) => item.required);
  const current = required.filter((item) => item.status.current).length;
  const percentage = required.length ? Math.round((current / required.length) * 100) : null;
  return freeze({
    ok:true,
    generatedAt:timestamp,
    readiness:{ available:percentage !== null, percentage, band:percentage === null ? "Unavailable" : percentage === 100 ? "Ready" : percentage >= 70 ? "Nearly ready" : "Needs work", required:required.length, current },
    summary:{ missing:items.filter((item) => item.status.key === "missing").length, needsUpdate:items.filter((item) => item.status.key === "needs-update").length, current:items.filter((item) => item.status.key === "current").length },
    sections:INVESTOR_ROOM_SECTIONS.map((section) => ({ section, items:items.filter((item) => item.section === section) }))
  });
}
