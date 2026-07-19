import { buildFileDetails } from "../ui/view-models/file-details.mjs";

export function readFileDetails({ state = {}, actor = {}, sourceKind = "", sourceId = "" } = {}) {
  const stableKey = `${String(sourceKind || "").trim()}:${String(sourceId || "").trim()}`;
  return buildFileDetails(state, stableKey, actor);
}
