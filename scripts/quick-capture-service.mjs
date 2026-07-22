import { createGlobalObject } from "./global-create-service.mjs";
import { createCaptureInboxItem } from "./lee-quick-capture.mjs";
import { canPerformEndpoint } from "./roles.mjs";
import { normalizeTaskRecord } from "./tasks-engine.mjs";
import { buildGenericItemLink } from "./ui/route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const requestIdPattern = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const unsafeTextPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\s*\/?\s*(?:script|iframe|object|embed|svg)|\bon\w+\s*=/i;

export const QUICK_CAPTURE_ENDPOINT = "/api/ui/quick-capture";
export const QUICK_CAPTURE_READ_COLLECTIONS = Object.freeze([
  "activityEvents",
  "auditHistory",
  "campaigns",
  "captureInbox",
  "dataRoomItems",
  "posts",
  "tasks"
]);
export const QUICK_CAPTURE_CAPABILITIES_ENDPOINT = "/api/ui/quick-capture/capabilities";
export const QUICK_CAPTURE_BODY_LIMIT = 12 * 1024;

const intent = (id, label, destination, operationPath, description) => Object.freeze({
  id,
  label,
  destination,
  operationPath,
  description
});

export const QUICK_CAPTURE_INTENTS = Object.freeze([
  intent("task", "Task", "Tasks", "/api/tasks/manual", "Creates one open Task. Nothing starts or completes automatically."),
  intent("decision", "Decision", "Capture Inbox", "/api/ui/create/note", "Saves a decision for explicit review and routing."),
  intent("blocker", "Blocker", "Capture Inbox", "/api/ui/create/note", "Saves a blocker for explicit review without creating a Task."),
  intent("post-idea", "Post idea", "Social", "/api/ui/create/post", "Creates one inert Social idea. Nothing is scheduled or published."),
  intent("partner-note", "Partner note", "Capture Inbox", "/api/ui/create/note", "Saves a Partner note for review without changing a Partner record."),
  intent("campaign-idea", "Campaign idea", "Outreach", "/api/ui/create/campaign", "Creates one inert Campaign draft with no audience or sending."),
  intent("file-report-note", "File/report note", "Files", "/api/ui/create/file", "Creates one draft document record. Nothing is uploaded or shared.")
]);

const intentById = new Map(QUICK_CAPTURE_INTENTS.map((item) => [item.id, item]));
const allowedCampaignTypes = new Set(["partner_outreach", "customer_reengagement", "announcement"]);
const allowedFileSections = new Set([
  "Company overview", "Product suite", "Traction", "Partner pipeline", "Campaigns",
  "Compliance", "Technical architecture", "Security", "Financial model", "Other"
]);
const captureTypes = Object.freeze({
  decision:"decision",
  blocker:"blocker",
  "partner-note":"partner_update"
});
const captureRoutes = Object.freeze({
  decision:["conversationNotes", "operatingMemory"],
  blocker:["conversationNotes", "operatingMemory", "morningBriefInputs"],
  "partner-note":["conversationNotes", "partnerUpdates"]
});
const intentForCaptureType = Object.freeze(Object.fromEntries(Object.entries(captureTypes).map(([intentId, captureType]) => [captureType, intentId])));

function failure(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.safeMessage = message;
  return error;
}

function validatedRequestId(value) {
  const result = clean(value);
  if (!requestIdPattern.test(result)) throw failure("Capture request was invalid. Nothing was saved.");
  return result;
}

function text(value, { label, required = false, maxLength = 1000 } = {}) {
  const result = clean(value);
  if (required && !result) throw failure(`${label} is required. Nothing was saved.`);
  if (result.length > maxLength) throw failure(`${label} is too long. Nothing was saved.`);
  if (unsafeTextPattern.test(result)) throw failure(`${label} contains unsupported content. Nothing was saved.`);
  return result;
}

function selection(value, allowed, label) {
  const result = clean(value);
  if (!allowed.has(result)) throw failure(`Choose a supported ${label}. Nothing was saved.`);
  return result;
}

function validateInput(input = {}) {
  const allowedKeys = new Set([
    "intent", "title", "details", "creationRequestId", "campaignType", "fileSection", "relatedPartner"
  ]);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw failure("Capture request was invalid. Nothing was saved.");
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) throw failure("Capture request included unsupported fields. Nothing was saved.");
  const selectedIntent = intentById.get(clean(input.intent));
  if (!selectedIntent) throw failure("Choose one capture intent. Nothing was saved.");
  const normalized = {
    intent:selectedIntent.id,
    title:text(input.title, { label:"Title", required:true, maxLength:160 }),
    details:text(input.details, { label:"Details", maxLength:5000 }),
    creationRequestId:validatedRequestId(input.creationRequestId),
    campaignType:"",
    fileSection:"",
    relatedPartner:""
  };
  if (selectedIntent.id === "campaign-idea") {
    normalized.campaignType = selection(input.campaignType, allowedCampaignTypes, "Campaign type");
  }
  if (selectedIntent.id === "file-report-note") {
    normalized.fileSection = selection(input.fileSection, allowedFileSections, "Files section");
  }
  if (selectedIntent.id === "partner-note") {
    normalized.relatedPartner = text(input.relatedPartner, { label:"Related Partner", maxLength:160 });
  }
  return Object.freeze(normalized);
}

function actorLabel(actor = {}) {
  return clean(actor.label || actor.name || actor.id) || "Owner";
}

function recordsForRequest(state = {}, creationRequestId = "") {
  const requestId = clean(creationRequestId).toLowerCase();
  const expected = [
    { intent:"task", record:list(state.tasks).find((item) => item.id === `task-quick-${requestId}`), valid:(record) => record.sourceType === "quick_capture" && clean(record.sourceId).toLowerCase() === requestId },
    { intent:"", record:list(state.captureInbox).find((item) => item.id === `capture-${requestId}`), valid:(record) => record.source_label === "Unified Quick Capture" && Boolean(intentForCaptureType[record.capture_type]) },
    { intent:"post-idea", record:list(state.posts).find((item) => item.id === `post-${requestId}`), valid:(record) => record.captureIntent === "post-idea" },
    { intent:"campaign-idea", record:list(state.campaigns).find((item) => item.id === `campaign-${requestId}`), valid:(record) => record.captureIntent === "campaign-idea" },
    { intent:"file-report-note", record:list(state.dataRoomItems).find((item) => item.id === `document-${requestId}`), valid:(record) => record.captureIntent === "file-report-note" }
  ];
  return expected.filter((candidate) => candidate.record).map((candidate) => ({
    intent:candidate.intent || intentForCaptureType[candidate.record.capture_type] || "",
    valid:candidate.valid(candidate.record)
  }));
}

function assertRequestBoundToIntent(state = {}, input = {}) {
  const existing = recordsForRequest(state, input.creationRequestId);
  if (!existing.length) return;
  if (existing.length !== 1 || existing[0].intent !== input.intent || !existing[0].valid) {
    throw failure("Capture request conflicts with an existing intent. Nothing was saved.", 409);
  }
}

function taskResult(state = {}, input = {}, options = {}) {
  const now = clean(options.now) || new Date().toISOString();
  const id = `task-quick-${input.creationRequestId.toLowerCase()}`;
  const existing = list(state.tasks).find((item) => item.id === id);
  if (existing && !(existing.sourceType === "quick_capture" && clean(existing.sourceId).toLowerCase() === input.creationRequestId.toLowerCase())) {
    throw failure("Capture request conflicts with an existing record. Nothing was saved.", 409);
  }
  if (existing) return { state, record:existing, alreadyExisted:true };
  const record = Object.freeze({
    ...normalizeTaskRecord({
      id,
      title:input.title,
      description:input.details,
      owner:actorLabel(options.actor),
      status:"open",
      priority:"medium",
      dueDate:now.slice(0, 10),
      source:"quick_capture",
      sourceType:"quick_capture",
      sourceId:input.creationRequestId,
      nextAction:input.title,
      review_state:"review_required",
      createdAt:now,
      updatedAt:now
    }, { now }),
    captureIntent:"task"
  });
  const activity = Object.freeze({
    id:`activity-quick-capture-${id}`,
    eventType:"Task created",
    title:"Task created with Quick Capture",
    relatedObjectType:"tasks",
    relatedObjectId:id,
    metadata:Object.freeze({ creationSource:"quick_capture", externalSideEffects:false, noExternalSystemsContacted:true }),
    createdAt:now
  });
  const audit = Object.freeze({
    id:`audit-quick-capture-${id}`,
    timestamp:now,
    actor:clean(options.actor?.id || options.actor?.role) || "authenticated_user",
    action:"quick_capture",
    resourceType:"Task",
    resourceId:id,
    creationSource:"quick_capture",
    summary:"Task created through Quick Capture.",
    externalSideEffects:false
  });
  return {
    state:{
      ...state,
      tasks:[record, ...list(state.tasks)],
      activityEvents:[activity, ...list(state.activityEvents)].slice(0, 500),
      auditHistory:[audit, ...list(state.auditHistory)].slice(0, 1000)
    },
    record,
    alreadyExisted:false
  };
}

function reviewedCaptureResult(state = {}, input = {}, options = {}) {
  const now = clean(options.now) || new Date().toISOString();
  const id = `capture-${input.creationRequestId.toLowerCase()}`;
  const existing = list(state.captureInbox).find((item) => item.id === id);
  const expectedType = captureTypes[input.intent];
  if (existing && !(existing.source_label === "Unified Quick Capture" && existing.capture_type === expectedType)) {
    throw failure("Capture request conflicts with an existing record. Nothing was saved.", 409);
  }
  if (existing) return { state, record:existing, alreadyExisted:true };
  const rawInput = [input.title, input.details].filter(Boolean).join("\n\n");
  const created = createCaptureInboxItem(state, {
    id,
    raw_input:rawInput,
    source_label:"Unified Quick Capture",
    capture_type:expectedType,
    summary:input.title,
    priority:"medium",
    linked_partner:input.relatedPartner,
    linked_workflow:intentById.get(input.intent)?.label || "Quick Capture",
    suggested_routes:captureRoutes[input.intent]
  }, { actor:clean(options.actor?.role || options.actor?.id) || "owner_token", now });
  return { state:created.state, record:created.item, alreadyExisted:false };
}

function globalCreateResult(state = {}, input = {}, options = {}) {
  if (input.intent === "post-idea") {
    return markGlobalCapture(createGlobalObject(state, "post", {
      creationRequestId:input.creationRequestId,
      title:input.title,
      draftCopy:input.details,
      channel:""
    }, { ...options, initialPostStatus:"idea" }), "posts", input);
  }
  if (input.intent === "campaign-idea") {
    return markGlobalCapture(createGlobalObject(state, "campaign", {
      creationRequestId:input.creationRequestId,
      campaignName:input.title,
      campaignType:input.campaignType,
      goal:input.details
    }, options), "campaigns", input);
  }
  return markGlobalCapture(createGlobalObject(state, "file", {
    creationRequestId:input.creationRequestId,
    name:input.title,
    section:input.fileSection,
    sourceLink:"",
    notes:input.details
  }, options), "dataRoomItems", input);
}

function markGlobalCapture(created = {}, collection = "", input = {}) {
  if (created.result?.alreadyExisted) return created;
  const record = Object.freeze({
    ...created.record,
    captureIntent:input.intent,
    creationRequestId:input.creationRequestId
  });
  return Object.freeze({
    ...created,
    record,
    state:{
      ...created.state,
      [collection]:list(created.state?.[collection]).map((item) => item.id === record.id ? record : item)
    }
  });
}

function resultBody(intentContract, input, record, canonicalHref, alreadyExisted) {
  const savedTitle = clean(record?.title || record?.campaignName || record?.summary) || input.title;
  const body = {
    ok:true,
    intent:intentContract.id,
    intentLabel:intentContract.label,
    title:savedTitle,
    destination:intentContract.destination,
    canonicalHref,
    alreadyExisted:Boolean(alreadyExisted),
    message:`${savedTitle} ${alreadyExisted ? "is already saved" : "was saved"} to ${intentContract.destination}.`
  };
  return Object.freeze(body);
}

export function buildQuickCaptureCapabilities(role = "viewer") {
  return Object.freeze({
    ok:true,
    intents:Object.freeze(QUICK_CAPTURE_INTENTS.map((item) => {
      const decision = canPerformEndpoint(role, "POST", item.operationPath);
      return Object.freeze({
        id:item.id,
        label:item.label,
        destination:item.destination,
        description:item.description,
        enabled:decision.ok,
        reason:decision.ok ? "" : `Your current access does not allow saving ${item.label.toLowerCase()} captures.`
      });
    }))
  });
}

export function quickCaptureAuthority(role = "viewer", intentId = "") {
  const selectedIntent = intentById.get(clean(intentId));
  if (!selectedIntent) return Object.freeze({ ok:false, reason:"Choose one capture intent." });
  const decision = canPerformEndpoint(role, "POST", selectedIntent.operationPath);
  return Object.freeze({ ok:decision.ok, reason:decision.ok ? "" : "Your current access does not allow this capture. Nothing was saved." });
}

export function createQuickCapture(state = {}, rawInput = {}, options = {}) {
  const input = validateInput(rawInput);
  const selectedIntent = intentById.get(input.intent);
  const authority = quickCaptureAuthority(options.actor?.role || "viewer", input.intent);
  if (!authority.ok) throw failure(authority.reason, 403);
  assertRequestBoundToIntent(state, input);
  if (input.intent === "task") {
    const created = taskResult(state, input, options);
    const link = buildGenericItemLink({ collection:"tasks", sourceId:created.record.id });
    return Object.freeze({
      state:created.state,
      body:resultBody(selectedIntent, input, created.record, link?.target || "", created.alreadyExisted)
    });
  }
  if (captureTypes[input.intent]) {
    const created = reviewedCaptureResult(state, input, options);
    const link = buildGenericItemLink({ collection:"captureInbox", sourceId:created.record.id });
    return Object.freeze({
      state:created.state,
      body:resultBody(selectedIntent, input, created.record, link?.target || "", created.alreadyExisted)
    });
  }
  const created = globalCreateResult(state, input, options);
  return Object.freeze({
    state:created.state,
    body:resultBody(selectedIntent, input, created.record, created.result.canonicalHref, created.result.alreadyExisted)
  });
}

export function quickCaptureSafeError(error = null) {
  const safeMessage = clean(error?.safeMessage);
  return Object.freeze({
    status:Number(error?.status || 400),
    body:Object.freeze({
      ok:false,
      outcome:Number(error?.status) === 403 ? "not_authorized" : "not_saved",
      message:safeMessage || "Quick Capture could not save. Nothing was changed. Check the form and try again."
    })
  });
}
