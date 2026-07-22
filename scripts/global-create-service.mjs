import { normalizePartnerLifecycle } from "./partner-lifecycle.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "./ui/route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const requestIdPattern = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const unsafeTextPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\s*\/?\s*(?:script|iframe|object|embed|svg)|\bon\w+\s*=/i;

export const GLOBAL_CREATE_ENDPOINTS = Object.freeze({
  post:"/api/ui/create/post",
  campaign:"/api/ui/create/campaign",
  partner:"/api/ui/create/partner",
  file:"/api/ui/create/file",
  note:"/api/ui/create/note"
});

export const GLOBAL_CREATE_SOURCE_MAPPINGS = Object.freeze({
  post:Object.freeze({ collection:"posts", objectType:"Post", destination:"Social", sourceKind:"post" }),
  campaign:Object.freeze({ collection:"campaigns", objectType:"Campaign", destination:"Outreach", sourceKind:"campaign" }),
  partner:Object.freeze({ collection:"partners", objectType:"Partner", destination:"Partners", sourceKind:"partner" }),
  file:Object.freeze({ collection:"dataRoomItems", objectType:"File", destination:"Files", sourceKind:"data-room-item" }),
  note:Object.freeze({ collection:"captureInbox", objectType:"Note", destination:"Inbox", sourceKind:"captureInbox" })
});
export const GLOBAL_CREATE_READ_COLLECTIONS_BY_KIND = Object.freeze(Object.fromEntries(
  Object.entries(GLOBAL_CREATE_SOURCE_MAPPINGS).map(([kind, mapping]) => [
    kind,
    Object.freeze(["activityEvents", "auditHistory", mapping.collection].sort())
  ])
));

const allowedChannels = new Set(["", "linkedin", "instagram", "facebook", "x", "threads"]);
const allowedCampaignTypes = new Set(["partner_outreach", "customer_reengagement", "announcement"]);
const allowedPartnerTypes = new Set(["", "nonprofit", "legal_aid", "government", "workforce", "funder", "enterprise", "other"]);
const allowedDataRoomSections = new Set([
  "Company overview", "Product suite", "Traction", "Partner pipeline", "Campaigns",
  "Compliance", "Technical architecture", "Security", "Financial model", "Other"
]);

function failure(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.safeMessage = message;
  return error;
}

function validatedRequestId(value) {
  const id = clean(value);
  if (!requestIdPattern.test(id)) throw failure("Creation request was invalid. Nothing was saved.");
  return id;
}

function text(value, { label, required = false, maxLength = 1000 } = {}) {
  const result = clean(value);
  if (required && !result) throw failure(`${label} is required. Nothing was saved.`);
  if (result.length > maxLength) throw failure(`${label} is too long. Nothing was saved.`);
  if (unsafeTextPattern.test(result)) throw failure(`${label} contains unsupported content. Nothing was saved.`);
  return result;
}

function choice(value, allowed, label) {
  const result = clean(value);
  if (!allowed.has(result)) throw failure(`Choose a supported ${label}. Nothing was saved.`);
  return result;
}

function email(value) {
  const result = text(value, { label:"Primary contact email", maxLength:254 });
  if (!result) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result)) throw failure("Partner was not created. Add a valid contact email and try again.");
  return result;
}

function safeHttpsUrl(value) {
  const result = text(value, { label:"Source link", maxLength:1000 });
  if (!result) return "";
  let parsed;
  try { parsed = new URL(result); }
  catch { throw failure("File record was not created. Add a valid HTTPS source link or leave it blank."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw failure("File record was not created. Add a valid HTTPS source link or leave it blank.");
  }
  return parsed.toString();
}

function identifier(type, creationRequestId) {
  return `${type}-${creationRequestId.toLowerCase()}`;
}

const recordIdPrefixes = Object.freeze({ post:"post", campaign:"campaign", partner:"partner", file:"document", note:"capture" });

function activityFor(mapping, id, now) {
  return Object.freeze({
    id:`activity-global-create-${id}`,
    eventType:`${mapping.objectType} created`,
    title:`${mapping.objectType} created with Global Create`,
    relatedObjectType:mapping.collection,
    relatedObjectId:id,
    metadata:Object.freeze({ creationSource:"global_create", externalSideEffects:false }),
    createdAt:now
  });
}

function auditFor(mapping, id, now, actor = {}) {
  return Object.freeze({
    id:`audit-global-create-${id}`,
    timestamp:now,
    actor:clean(actor.id || actor.role) || "authenticated_user",
    action:"global_create",
    resourceType:mapping.objectType,
    resourceId:id,
    creationSource:"global_create",
    summary:`${mapping.objectType} created through Global Create.`,
    externalSideEffects:false
  });
}

function creationResult(mapping, record, { alreadyExisted = false } = {}) {
  const link = mapping.objectType === "Note"
    ? buildGenericItemLink({ collection:mapping.collection, sourceId:record.id })
    : buildExactObjectLink({ objectType:mapping.objectType, sourceKind:mapping.sourceKind, sourceId:record.id });
  return Object.freeze({
    ok:true,
    objectType:mapping.objectType,
    id:record.id,
    title:record.title || record.campaignName || record.organizationName || record.summary || mapping.objectType,
    canonicalHref:link?.target || "",
    destination:mapping.destination,
    createdAt:record.createdAt || record.created_at || "",
    alreadyExisted
  });
}

function postRecord(input, requestId, now, _actor = {}, options = {}) {
  const title = text(input.title, { label:"Working title or idea", required:true, maxLength:160 });
  const draftCopy = text(input.draftCopy, { label:"Draft copy or notes", maxLength:5000 });
  const platform = choice(input.channel, allowedChannels, "channel preference");
  const ideaOnly = options.initialPostStatus === "idea";
  return {
    id:identifier("post", requestId),
    title,
    platform,
    status:ideaOnly ? "idea" : draftCopy ? "draft" : "idea",
    body:ideaOnly ? "" : draftCopy,
    notes:draftCopy,
    contentType:"idea",
    approvalStatus:"not_requested",
    scheduledFor:"",
    publishedAt:"",
    createdVia:"Global Create",
    createdAt:now,
    updatedAt:now
  };
}

function campaignRecord(input, requestId, now) {
  const campaignName = text(input.campaignName, { label:"Campaign name", required:true, maxLength:160 });
  const campaignType = choice(input.campaignType, allowedCampaignTypes, "campaign type");
  const goal = text(input.goal, { label:"Goal or desired outcome", maxLength:1000 });
  return {
    id:identifier("campaign", requestId),
    campaignName,
    campaignType,
    goal,
    status:"draft",
    recipients:[],
    recipientCount:0,
    sendCount:0,
    actualReferrals:0,
    recordShieldStarts:0,
    expungementStarts:0,
    paidConversions:0,
    audienceSelected:false,
    liveMode:false,
    approvalStatus:"not_requested",
    createdVia:"Global Create",
    createdAt:now,
    updatedAt:now
  };
}

function partnerRecord(input, requestId, now, actor = {}) {
  const organizationName = text(input.organizationName, { label:"Organization name", required:true, maxLength:160 });
  const partnerType = choice(input.partnerType, allowedPartnerTypes, "partner type");
  const primaryContactName = text(input.primaryContactName, { label:"Primary contact name", maxLength:160 });
  const primaryContactEmail = email(input.primaryContactEmail);
  const geography = text(input.geography, { label:"Geography or jurisdiction", maxLength:160 });
  const nextAction = text(input.nextAction, { label:"First next action", maxLength:1000 });
  const normalized = normalizePartnerLifecycle({
    id:identifier("partner", requestId),
    organizationName,
    name:organizationName,
    partnerType,
    primaryContactName,
    email:primaryContactEmail,
    geography,
    regionState:geography,
    nextAction,
    status:"new",
    stage:"new",
    owner:clean(actor.label || actor.name || actor.id) || "Owner",
    priority:"medium",
    referralCount:0,
    screenings:0,
    recordShieldStarts:0,
    expungementStarts:0,
    revenue:0,
    createdVia:"Global Create",
    createdAt:now,
    updatedAt:now
  }, { now });
  if (partnerType) return normalized;
  const { type:unusedType, partnerType:unusedPartnerType, ...untypedPartner } = normalized;
  return untypedPartner;
}

function fileRecord(input, requestId, now) {
  const title = text(input.name, { label:"Name", required:true, maxLength:200 });
  const section = choice(input.section, allowedDataRoomSections, "collection or section");
  const sourceLink = safeHttpsUrl(input.sourceLink);
  const notes = text(input.notes, { label:"Notes", maxLength:2000 });
  return {
    id:identifier("document", requestId),
    title,
    section,
    status:"draft",
    filePath:"",
    sourceLink,
    notes,
    owner:"Operations",
    lastUpdated:now.slice(0, 10),
    binaryUploaded:false,
    externallyShared:false,
    createdVia:"Global Create",
    createdAt:now,
    updatedAt:now
  };
}

function noteRecord(input, requestId, now) {
  const note = text(input.note, { label:"Note", required:true, maxLength:5000 });
  return {
    id:identifier("capture", requestId),
    date:now.slice(0, 10),
    raw_input:note,
    source_label:"Global Create",
    capture_type:"conversation_note",
    inferred_type:"conversation_note",
    summary:"Internal note saved for review.",
    priority:"medium",
    linked_partner:"",
    linked_workflow:"",
    suggested_routes:["conversationNotes"],
    review_state:"review_required",
    routed_to:[],
    review_history:[],
    createdVia:"Global Create",
    created_at:now,
    updated_at:now
  };
}

const builders = Object.freeze({
  post:postRecord,
  campaign:campaignRecord,
  partner:partnerRecord,
  file:fileRecord,
  note:noteRecord
});

export function createGlobalObject(state = {}, kind = "", input = {}, options = {}) {
  const mapping = GLOBAL_CREATE_SOURCE_MAPPINGS[kind];
  const build = builders[kind];
  if (!mapping || !build) throw failure("This creation option is not available. Nothing was saved.");
  const creationRequestId = validatedRequestId(input.creationRequestId);
  const current = list(state[mapping.collection]);
  const expectedId = identifier(recordIdPrefixes[kind], creationRequestId);
  const now = clean(options.now) || new Date().toISOString();
  const record = build(input, creationRequestId, now, options.actor || {}, options);
  const existing = current.find((record) => record.id === expectedId);
  if (existing && existing.createdVia !== "Global Create") {
    throw failure("Creation request conflicts with an existing record. Nothing was saved.", 409);
  }
  if (existing) return Object.freeze({ state, record:existing, activity:null, audit:null, result:creationResult(mapping, existing, { alreadyExisted:true }) });
  const activity = activityFor(mapping, record.id, now);
  const audit = auditFor(mapping, record.id, now, options.actor || {});
  const nextState = {
    ...state,
    [mapping.collection]:[record, ...current],
    activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500),
    auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000)
  };
  return Object.freeze({ state:nextState, record:Object.freeze({ ...record }), activity, audit, result:creationResult(mapping, record) });
}

export function globalCreateSafeError(kind = "", error = null) {
  const labels = { post:"Social post", campaign:"Campaign", partner:"Partner", file:"File record", note:"Quick note" };
  const label = labels[kind] || "Record";
  const known = clean(error?.safeMessage);
  return known || `${label} was not created. Nothing was saved. Check the form and try again.`;
}
