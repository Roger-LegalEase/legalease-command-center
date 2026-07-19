import { roleHasCapability, roles } from "../roles.mjs";
import { buildFileView } from "../ui/view-models/file-view.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const COLLECTIONS = new Set(["brand-assets", "partner-files", "campaign-assets", "investor-room", "compliance-evidence"]);

function assertActor(actor = {}) {
  const role = lower(actor.role);
  if (actor.authenticated !== true || !roles.includes(role) || !roleHasCapability(role, "manage_growth")) throw new Error("This account cannot generate or organize reports.");
  return role;
}

function reportId(record = {}) { return clean(record.id || record.key || record.slug); }

export function createFilesReportService({ generateReport, readState, writeCollections, now = () => new Date().toISOString() } = {}) {
  if (typeof generateReport !== "function" || typeof readState !== "function" || typeof writeCollections !== "function") throw new Error("Report integration is not configured.");
  return Object.freeze({
    async generate({ actor = {}, reportType = "", requestId = "" } = {}) {
      assertActor(actor);
      const type = clean(reportType);
      const idempotencyKey = clean(requestId);
      if (!type || !idempotencyKey) throw new Error("Report type and request ID are required.");
      const before = await readState();
      const existing = list(before.reports).find((report) => clean(report.filesGenerationRequestId) === idempotencyKey);
      const generated = existing || await generateReport({ reportType:type, requestId:idempotencyKey, actor });
      const id = reportId(generated?.report || generated);
      if (!id) throw new Error("The authoritative report generator did not return a stable report ID.");
      const state = await readState();
      const file = buildFileView(state, `report:${id}`, actor);
      if (!file) throw new Error("The generated report is not available as an authorized File.");
      return { ok:true, created:!existing, file:{ id:file.stableKey, name:file.name, href:file.href, status:file.status, generatedAt:file.modifiedAt, sourceRef:file.sourceRef } };
    },
    async place({ actor = {}, reportId:id = "", collection = "", expectedUpdatedAt = "" } = {}) {
      const role = assertActor(actor);
      const target = clean(collection);
      if (!COLLECTIONS.has(target)) throw new Error("Choose a valid Files collection.");
      const state = await readState();
      const current = list(state.reports).find((report) => reportId(report) === clean(id));
      if (!current) throw new Error("The report is no longer available.");
      const currentUpdatedAt = clean(current.updatedAt || current.updated_at || current.generatedAt || current.generated_at);
      if (expectedUpdatedAt && clean(expectedUpdatedAt) !== currentUpdatedAt) throw new Error("The report changed. Refresh before organizing it.");
      if (clean(current.filesCollection) === target) return { ok:true, changed:false, href:`#files/report/${encodeURIComponent(reportId(current))}` };
      const timestamp = clean(now());
      const updated = { ...current, filesCollection:target, updatedAt:timestamp };
      const event = { id:`report-file-placed-${reportId(current)}-${target}`, eventType:"file updated", relatedObjectType:"reports", relatedObjectId:reportId(current), createdAt:timestamp };
      const audit = { id:`audit-report-file-placed-${reportId(current)}-${target}`, action:"report organized in Files", resourceType:"reports", resourceId:reportId(current), actor:role, timestamp };
      await writeCollections({
        reports:[updated, ...list(state.reports).filter((report) => reportId(report) !== reportId(current))],
        activityEvents:[event, ...list(state.activityEvents).filter((item) => clean(item.id) !== event.id)].slice(0, 500),
        auditHistory:[audit, ...list(state.auditHistory).filter((item) => clean(item.id) !== audit.id)].slice(0, 1000)
      });
      return { ok:true, changed:true, href:`#files/report/${encodeURIComponent(reportId(current))}`, collection:target };
    }
  });
}
