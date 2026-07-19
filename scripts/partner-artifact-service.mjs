import { createGlobalObject } from "./global-create-service.mjs";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { buildPartnerProgramArtifact, normalizePartnerProgram } from "./partner-program-engine.mjs";
import { roleHasCapability, roles } from "./roles.mjs";
import { buildFileViews } from "./ui/view-models/file-view.mjs";
import { buildPartnerStageView } from "./ui/view-models/partner-stage.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const requestPattern = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const artifactTypes = new Set(["proposal", "landing_page", "weekly_report", "final_report"]);

export const PARTNER_ARTIFACT_ENDPOINTS = Object.freeze({
  createProgram:"/api/ui/partners/:partnerId/programs",
  generateArtifact:"/api/ui/partners/:partnerId/programs/:programId/artifacts",
  addFile:"/api/ui/partners/:partnerId/files"
});

export class PartnerArtifactError extends Error {
  constructor(message, status = 400) { super(message); this.name = "PartnerArtifactError"; this.status = status; this.safeMessage = message; }
}

function authorize(actor, capability = "read_internal") {
  const role = clean(actor?.role).toLowerCase();
  if (actor?.authenticated !== true || !roles.includes(role) || !roleHasCapability(role, capability)) throw new PartnerArtifactError("Partner Files are not available for this account.", 403);
  return role;
}

function requestId(value) {
  const id = clean(value);
  if (!requestPattern.test(id)) throw new PartnerArtifactError("The Partner File request was invalid. Nothing was saved.");
  return id;
}

function text(value, label, maximum = 1000, required = false) {
  const result = clean(value);
  if (required && !result) throw new PartnerArtifactError(`${label} is required. Nothing was saved.`);
  if (result.length > maximum || /[\u0000-\u001f\u007f<>]/u.test(result) || /(?:bearer\s+|api[_ -]?key|token[=:]|secret[=:]|whsec_)/i.test(result)) throw new PartnerArtifactError(`${label} contains unsupported content. Nothing was saved.`);
  return result;
}

function partnerContext(state, actor, partnerId, capability = "read_internal") {
  const role = authorize(actor, capability);
  const id = clean(partnerId);
  const view = buildPartnerStageView(state, `partner:${id}`, actor);
  const record = list(state.partners).find((partner) => clean(partner.id || partner.partnerId) === id && recordVisibleToActor(partner, role));
  if (!view || !record) throw new PartnerArtifactError("Partner was not found or is not available for this account.", 404);
  return { role, id, view, record };
}

function programContext(state, actor, partnerId, programId, capability = "read_internal") {
  const partner = partnerContext(state, actor, partnerId, capability);
  const id = clean(programId);
  const program = list(state.partnerPrograms).find((item) => clean(item.id) === id && clean(item.relatedPartnerId || item.partnerId) === partner.id && recordVisibleToActor(item, partner.role));
  if (!program) throw new PartnerArtifactError("Partner program was not found or is not available for this account.", 404);
  return { ...partner, programId:id, program };
}

export function createPartnerProgramRecord(state = {}, partnerId = "", input = {}, options = {}) {
  const ctx = partnerContext(state, options.actor, partnerId, "manage_growth");
  const request = requestId(input.requestId);
  const id = `partner-program-${request.toLowerCase()}`;
  const existing = list(state.partnerPrograms).find((program) => program.id === id);
  if (existing) return Object.freeze({ state, program:existing, alreadyExisted:true, mutations:0, externalActions:0 });
  const now = text(options.now, "Server timestamp", 80, true);
  if (!Number.isFinite(Date.parse(now))) throw new PartnerArtifactError("A valid server timestamp is required. Nothing was saved.");
  const program = normalizePartnerProgram({
    id,
    name:text(input.name || `${ctx.view.name} Program`, "Program name", 180, true),
    partnerType:ctx.record.partnerType || ctx.record.type,
    packageTier:text(input.packageTier || "starter", "Package tier", 80),
    status:"lead",
    relatedPartnerId:ctx.id,
    owner:text(input.owner || ctx.view.owner || "Owner", "Owner", 120),
    programGoal:text(input.programGoal, "Program goal", 800),
    targetAudience:text(input.targetAudience, "Target audience", 500),
    jurisdiction:text(input.jurisdiction || ctx.record.geography || ctx.record.regionState, "Jurisdiction", 160),
    history:[{ id:`history-program-${request}`, action:"created", at:now, note:"Partner Program record created for review." }]
  }, { now });
  const activity = { id:`activity-partner-program-${request}`, eventType:"partner_program_created", title:"Partner Program record created", partnerId:ctx.id, partnerProgramId:id, relatedObjectType:"partnerPrograms", relatedObjectId:id, createdAt:now, metadata:{ externalAction:false, publicAccessGranted:false } };
  const audit = { id:`audit-partner-program-${request}`, timestamp:now, actor:clean(options.actor.id || options.actor.role), action:"partner_program_created", resourceType:"PartnerProgram", resourceId:id, partnerId:ctx.id, externalSideEffects:false };
  return Object.freeze({ state:{ ...state, partnerPrograms:[program, ...list(state.partnerPrograms)], activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500), auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000) }, program:Object.freeze(program), activity:Object.freeze(activity), audit:Object.freeze(audit), alreadyExisted:false, mutations:1, externalActions:0 });
}

export function generatePartnerArtifact(state = {}, partnerId = "", programId = "", input = {}, options = {}) {
  const ctx = programContext(state, options.actor, partnerId, programId, "manage_growth");
  const request = requestId(input.requestId);
  const type = clean(input.artifactType).toLowerCase().replaceAll("-", "_");
  if (!artifactTypes.has(type)) throw new PartnerArtifactError("Choose a supported Partner artifact. Nothing was saved.");
  const artifactId = `partner-artifact-${type}-${request.toLowerCase()}`;
  const fileId = `partner-artifact-file-${request.toLowerCase()}`;
  const existing = list(state.partnerProgramArtifacts).find((artifact) => artifact.id === artifactId);
  if (existing) {
    const file = list(state.reports).find((report) => report.id === fileId) || null;
    return Object.freeze({ state, artifact:existing, file, alreadyExisted:true, mutations:0, externalActions:0 });
  }
  const now = text(options.now, "Server timestamp", 80, true);
  if (!Number.isFinite(Date.parse(now))) throw new PartnerArtifactError("A valid server timestamp is required. Nothing was saved.");
  let generated;
  try { generated = buildPartnerProgramArtifact(ctx.program, type, { now }); }
  catch { throw new PartnerArtifactError("Partner artifact generation failed. No File or Activity item was created.", 500); }
  const artifact = {
    ...generated,
    id:artifactId,
    partnerId:ctx.id,
    partnerProgramId:ctx.programId,
    status:"draft",
    reviewRequired:true,
    externalSendAllowed:false,
    publicAccess:false,
    generationMetadata:{ engine:"partner-program-engine", generatedSourceId:generated.id, sourceTemplate:generated.sourceTemplate, generatedAt:now }
  };
  const file = {
    id:fileId,
    reportTitle:artifact.title,
    status:"draft",
    owner:ctx.program.owner || ctx.view.owner || null,
    partnerId:ctx.id,
    programId:ctx.programId,
    partnerProgramId:ctx.programId,
    generatedAt:now,
    updatedAt:now,
    sourceRef:{ collection:"partnerProgramArtifacts", itemId:artifactId },
    generationMetadata:{ artifactType:type, sourceTemplate:generated.sourceTemplate, authoritativeCollection:"partnerProgramArtifacts", authoritativeId:artifactId },
    metadataOnly:true,
    externallyShared:false,
    publicAccess:false
  };
  const activity = { id:`activity-partner-artifact-${request}`, eventType:"document_generated", title:artifact.title, partnerId:ctx.id, partnerProgramId:ctx.programId, reportId:fileId, relatedObjectType:"partnerProgramArtifacts", relatedObjectId:artifactId, createdAt:now, sourceRef:{ collection:"partnerProgramArtifacts", itemId:artifactId }, metadata:{ status:"draft", reviewRequired:true, externalAction:false, publicAccessGranted:false } };
  const audit = { id:`audit-partner-artifact-${request}`, timestamp:now, actor:clean(options.actor.id || options.actor.role), action:"partner_artifact_generated", resourceType:"PartnerProgramArtifact", resourceId:artifactId, partnerId:ctx.id, reportId:fileId, externalSideEffects:false };
  return Object.freeze({ state:{ ...state, partnerProgramArtifacts:[artifact, ...list(state.partnerProgramArtifacts)], reports:[file, ...list(state.reports)], activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500), auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000) }, artifact:Object.freeze(artifact), file:Object.freeze(file), activity:Object.freeze(activity), audit:Object.freeze(audit), alreadyExisted:false, mutations:1, externalActions:0, copies:0 });
}

export function addPartnerFileRecord(state = {}, partnerId = "", input = {}, options = {}) {
  const ctx = partnerContext(state, options.actor, partnerId, "manage_growth");
  const created = createGlobalObject(state, "file", input, options);
  if (created.result.alreadyExisted) return Object.freeze({ ...created, uploads:0, shares:0, externalActions:0 });
  const records = created.state.dataRoomItems.map((record) => record.id === created.record.id ? { ...record, partnerId:ctx.id, binaryUploaded:false, externallyShared:false, publicAccess:false } : record);
  const record = records.find((item) => item.id === created.record.id);
  return Object.freeze({ ...created, state:{ ...created.state, dataRoomItems:records }, record:Object.freeze(record), uploads:0, shares:0, externalActions:0 });
}

export function buildPartnerFilesView(state = {}, actor = {}, partnerId = "", now = "") {
  const ctx = partnerContext(state, actor, partnerId, "read_internal");
  const items = buildFileViews(state, actor, now).filter((file) => file.relatedObjects.some((related) => related.kind === "Partner" && related.id === ctx.id));
  const programs = list(state.partnerPrograms).filter((program) => clean(program.relatedPartnerId || program.partnerId) === ctx.id && recordVisibleToActor(program, ctx.role)).map((program) => ({ id:clean(program.id), name:clean(program.name) || "Partner Program", status:clean(program.status) || null }));
  return Object.freeze({ available:true, state:items.length ? "available" : "available_empty", partner:{ id:ctx.id, name:ctx.view.name, href:ctx.view.exactPartnerLink }, items:Object.freeze(items), programs:Object.freeze(programs), actions:Object.freeze({ createProgram:PARTNER_ARTIFACT_ENDPOINTS.createProgram.replace(":partnerId", encodeURIComponent(ctx.id)), addFile:PARTNER_ARTIFACT_ENDPOINTS.addFile.replace(":partnerId", encodeURIComponent(ctx.id)) }), safety:Object.freeze({ fileProjectionAuthoritative:true, documentCopies:0, publicAccessGranted:false, externalActions:0 }) });
}
