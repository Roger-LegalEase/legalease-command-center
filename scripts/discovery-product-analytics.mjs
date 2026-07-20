const clean = (value = "") => String(value ?? "").trim();
const slugPattern = /^[a-z][a-z0-9-]{0,63}$/;
const journeyPattern = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const maxDurationMs = 7 * 24 * 60 * 60 * 1000;

export const DISCOVERY_ANALYTICS_EVENT_TYPES = Object.freeze([
  "destination_opened",
  "workflow_started",
  "workflow_completed",
  "workflow_abandoned",
  "validation_blocked",
  "action_failed",
  "time_to_first_completed_workflow",
  "search_result_selected"
]);

export const DISCOVERY_ANALYTICS_VALUES = Object.freeze({
  destinationId:Object.freeze(["today", "social", "outreach", "partners", "files", "inbox", "settings", "search"]),
  workflowId:Object.freeze(["social-post", "outreach-campaign", "partner-action", "file-upload", "global-search", "first-run-onboarding"]),
  source:Object.freeze(["route", "initial-route", "global-search", "global-create", "onboarding", "checklist", "empty-state", "contextual-help"]),
  actionId:Object.freeze(["create", "save-draft", "schedule", "launch", "publish", "upload", "search", "select-result", "update", "retry", "submit", "connect", "review", "approve", "complete", "navigate"]),
  reasonCode:Object.freeze(["navigation", "page-hidden", "validation", "missing-time", "missing-required-field", "write-unavailable", "provider-unavailable", "unauthorized", "unavailable", "conflict", "session-expired", "network", "not-ready", "unknown", "unspecified"]),
  resultType:Object.freeze(["destination", "post", "campaign", "partner", "file", "report", "task", "help"])
});

const fieldsByType = Object.freeze({
  destination_opened:Object.freeze(["destinationId", "source"]),
  workflow_started:Object.freeze(["workflowId", "destinationId", "journeyId"]),
  workflow_completed:Object.freeze(["workflowId", "destinationId", "journeyId", "durationMs"]),
  workflow_abandoned:Object.freeze(["workflowId", "destinationId", "journeyId", "durationMs", "reasonCode"]),
  validation_blocked:Object.freeze(["workflowId", "destinationId", "journeyId", "actionId", "reasonCode"]),
  action_failed:Object.freeze(["workflowId", "destinationId", "journeyId", "actionId", "reasonCode"]),
  time_to_first_completed_workflow:Object.freeze(["workflowId", "destinationId", "journeyId", "durationMs"]),
  search_result_selected:Object.freeze(["destinationId", "source", "resultType", "resultPosition"])
});

const requiredByType = Object.freeze({
  destination_opened:Object.freeze(["destinationId"]),
  workflow_started:Object.freeze(["workflowId", "destinationId", "journeyId"]),
  workflow_completed:Object.freeze(["workflowId", "destinationId", "journeyId", "durationMs"]),
  workflow_abandoned:Object.freeze(["workflowId", "destinationId", "journeyId", "durationMs"]),
  validation_blocked:Object.freeze(["workflowId", "destinationId", "journeyId", "reasonCode"]),
  action_failed:Object.freeze(["workflowId", "destinationId", "journeyId", "reasonCode"]),
  time_to_first_completed_workflow:Object.freeze(["workflowId", "destinationId", "journeyId", "durationMs"]),
  search_result_selected:Object.freeze(["destinationId", "resultType", "resultPosition"])
});

export class DiscoveryAnalyticsError extends Error {
  constructor(message) {
    super(message);
    this.name = "DiscoveryAnalyticsError";
    this.status = 400;
    this.safeMessage = message;
  }
}

function slug(value, field, required = false) {
  const normalized = clean(value).toLowerCase();
  if (!normalized && !required) return null;
  if (!slugPattern.test(normalized) || !DISCOVERY_ANALYTICS_VALUES[field]?.includes(normalized)) throw new DiscoveryAnalyticsError(`Analytics ${field} is invalid.`);
  return normalized;
}

function journeyId(value) {
  const normalized = clean(value);
  if (!journeyPattern.test(normalized)) throw new DiscoveryAnalyticsError("Analytics journeyId is invalid.");
  return normalized;
}

function boundedInteger(value, field, maximum) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > maximum) {
    throw new DiscoveryAnalyticsError(`Analytics ${field} is invalid.`);
  }
  return normalized;
}

function timestamp(value) {
  const normalized = clean(value);
  if (!normalized || !Number.isFinite(Date.parse(normalized))) throw new DiscoveryAnalyticsError("A valid analytics timestamp is required.");
  return normalized;
}

export function buildPrivacySafeAnalyticsEvent(input = {}, { now = "" } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DiscoveryAnalyticsError("Analytics input must be an object.");
  const eventType = clean(input.eventType);
  if (!DISCOVERY_ANALYTICS_EVENT_TYPES.includes(eventType)) throw new DiscoveryAnalyticsError("Analytics eventType is unsupported.");
  const allowed = new Set(["eventType", ...fieldsByType[eventType]]);
  const unknown = Object.keys(input).find((key) => !allowed.has(key));
  if (unknown) throw new DiscoveryAnalyticsError(`Analytics field ${unknown} is not allowed.`);
  for (const field of requiredByType[eventType]) {
    if (input[field] === undefined || input[field] === null || input[field] === "") throw new DiscoveryAnalyticsError(`Analytics ${field} is required.`);
  }

  const event = { eventType, occurredAt:timestamp(now) };
  for (const field of fieldsByType[eventType]) {
    if (input[field] === undefined || input[field] === null || input[field] === "") continue;
    if (["destinationId", "workflowId", "source", "actionId", "reasonCode", "resultType"].includes(field)) event[field] = slug(input[field], field, requiredByType[eventType].includes(field));
    else if (field === "journeyId") event[field] = journeyId(input[field]);
    else if (field === "durationMs") event[field] = boundedInteger(input[field], field, maxDurationMs);
    else if (field === "resultPosition") event[field] = boundedInteger(input[field], field, 9999);
  }
  return Object.freeze(event);
}

function validNow(now) {
  const value = timestamp(now());
  return { value, milliseconds:Date.parse(value) };
}

export function createDiscoveryAnalyticsTracker({ emit, now = () => new Date().toISOString(), randomId = () => crypto.randomUUID() } = {}) {
  if (typeof emit !== "function") throw new DiscoveryAnalyticsError("An analytics event sink is required.");
  if (typeof now !== "function" || typeof randomId !== "function") throw new DiscoveryAnalyticsError("Analytics clock and identity providers are required.");
  const firstSeenAt = validNow(now).milliseconds;
  const active = new Map();
  let firstCompletionRecorded = false;

  function capture(input, at = validNow(now)) {
    const event = buildPrivacySafeAnalyticsEvent(input, { now:at.value });
    emit(event);
    return event;
  }

  function findJourney(reference = {}) {
    const exact = clean(reference.journeyId);
    if (exact && active.has(exact)) return active.get(exact);
    const workflowId = clean(reference.workflowId).toLowerCase();
    return [...active.values()].find((journey) => journey.workflowId === workflowId) || null;
  }

  function openDestination({ destinationId, source = "route" } = {}) {
    return capture({ eventType:"destination_opened", destinationId, source });
  }

  function startWorkflow({ workflowId, destinationId } = {}) {
    const at = validNow(now);
    const id = `journey-${clean(randomId()).replaceAll("-", "").slice(0, 72)}`;
    const started = buildPrivacySafeAnalyticsEvent({ eventType:"workflow_started", workflowId, destinationId, journeyId:id }, { now:at.value });
    const journey = Object.freeze({ journeyId:id, workflowId:started.workflowId, destinationId:started.destinationId, startedAt:at.milliseconds });
    active.set(id, journey);
    emit(started);
    return journey;
  }

  function signal(eventType, reference = {}) {
    const journey = findJourney(reference);
    if (!journey) throw new DiscoveryAnalyticsError("An active analytics journey is required.");
    return capture({ eventType, workflowId:journey.workflowId, destinationId:journey.destinationId, journeyId:journey.journeyId, actionId:reference.actionId, reasonCode:reference.reasonCode });
  }

  function finish(eventType, reference = {}) {
    const journey = findJourney(reference);
    if (!journey) throw new DiscoveryAnalyticsError("An active analytics journey is required.");
    const at = validNow(now);
    const durationMs = Math.max(0, at.milliseconds - journey.startedAt);
    const input = { eventType, workflowId:journey.workflowId, destinationId:journey.destinationId, journeyId:journey.journeyId, durationMs };
    if (eventType === "workflow_abandoned") input.reasonCode = reference.reasonCode;
    const event = capture(input, at);
    active.delete(journey.journeyId);
    if (eventType === "workflow_completed" && !firstCompletionRecorded) {
      firstCompletionRecorded = true;
      capture({ eventType:"time_to_first_completed_workflow", workflowId:journey.workflowId, destinationId:journey.destinationId, journeyId:journey.journeyId, durationMs:Math.max(0, at.milliseconds - firstSeenAt) }, at);
    }
    return event;
  }

  return Object.freeze({
    openDestination,
    startWorkflow,
    completeWorkflow:(reference) => finish("workflow_completed", reference),
    abandonWorkflow:(reference) => finish("workflow_abandoned", reference),
    validationBlocked:(reference) => signal("validation_blocked", reference),
    actionFailed:(reference) => signal("action_failed", reference),
    selectSearchResult:({ destinationId, source = "global-search", resultType, resultPosition } = {}) => capture({ eventType:"search_result_selected", destinationId, source, resultType, resultPosition }),
    activeJourneyCount:() => active.size
  });
}
