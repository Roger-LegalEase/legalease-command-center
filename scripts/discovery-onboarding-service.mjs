import { roleHasCapability } from "./roles.mjs";

const clean = (value = "") => String(value ?? "").trim();
const requestIdPattern = /^[a-z0-9][a-z0-9_-]{15,95}$/i;
const preferenceVersionPattern = /^(?:0|[1-9]\d{0,8})$/;

export const DISCOVERY_ONBOARDING_ENDPOINT = "/api/ui/discovery/onboarding";

export const DISCOVERY_ONBOARDING_CHOICES = Object.freeze([
  Object.freeze({
    id:"social",
    label:"Create and schedule social content",
    description:"Start a real Social Post, then continue in the composer.",
    action:Object.freeze({ kind:"global-create", workflowId:"social-post", expectedDestination:"Social" })
  }),
  Object.freeze({
    id:"outreach",
    label:"Run partner or customer outreach",
    description:"Start one inert Outreach Campaign draft. Nothing is sent.",
    action:Object.freeze({ kind:"global-create", workflowId:"outreach-campaign", expectedDestination:"Outreach" })
  }),
  Object.freeze({
    id:"partners",
    label:"Manage partner relationships",
    description:"Open the canonical Partners workspace.",
    action:Object.freeze({ kind:"route", href:"#partners", expectedDestination:"Partners" })
  }),
  Object.freeze({
    id:"files",
    label:"Organize company and investor files",
    description:"Open the Investor Room collection in Files.",
    action:Object.freeze({ kind:"route", href:"#files?collection=investor-room", expectedDestination:"Files" })
  }),
  Object.freeze({
    id:"today",
    label:"Plan my work for today",
    description:"Open the canonical Today command surface.",
    action:Object.freeze({ kind:"route", href:"#today", expectedDestination:"Today" })
  })
]);

export class DiscoveryOnboardingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "DiscoveryOnboardingError";
    this.status = status;
    this.safeMessage = message;
  }
}

function authorize(actor = {}, capability = "read_internal") {
  if (actor.authenticated !== true || !clean(actor.id) || !roleHasCapability(actor.role, capability)) {
    throw new DiscoveryOnboardingError("Onboarding is not available for this account.", 403);
  }
}

function preferenceVersion(value) {
  const normalized = String(value ?? "0");
  if (!preferenceVersionPattern.test(normalized)) throw new DiscoveryOnboardingError("Onboarding changed in another session. Reload and try again.", 409);
  return Number(normalized);
}

function normalizedPreference(preference = {}) {
  const status = ["new", "deferred", "completed"].includes(clean(preference.status)) ? clean(preference.status) : "new";
  const choiceId = DISCOVERY_ONBOARDING_CHOICES.some((choice) => choice.id === clean(preference.choiceId)) ? clean(preference.choiceId) : null;
  return Object.freeze({
    status,
    choiceId,
    version:preferenceVersion(preference.version),
    completedAt:status === "completed" && Number.isFinite(Date.parse(clean(preference.completedAt))) ? clean(preference.completedAt) : null,
    deferredAt:status === "deferred" && Number.isFinite(Date.parse(clean(preference.deferredAt))) ? clean(preference.deferredAt) : null
  });
}

export function buildFirstRunOnboarding({ actor = {}, preference = {}, now = "" } = {}) {
  authorize(actor);
  const generatedAt = clean(now);
  if (!Number.isFinite(Date.parse(generatedAt))) throw new DiscoveryOnboardingError("A valid server timestamp is required.");
  const current = normalizedPreference(preference);
  return Object.freeze({
    ok:true,
    authorized:true,
    generatedAt,
    shouldOpen:current.status !== "completed",
    preference:current,
    title:"What would you like to do?",
    description:"Choose a real workflow to start. You can skip this and return from your profile menu.",
    choices:DISCOVERY_ONBOARDING_CHOICES,
    capabilities:Object.freeze({
      canSave:roleHasCapability(actor.role, "mutate_state"),
      enablesIntegrations:false,
      enablesExternalActions:false,
      writesProductFlags:false
    })
  });
}

function validatedInput(input = {}) {
  const intent = clean(input.intent);
  if (!["select", "defer"].includes(intent)) throw new DiscoveryOnboardingError("Choose a workflow or skip for now. Nothing was saved.");
  const choice = intent === "select" ? DISCOVERY_ONBOARDING_CHOICES.find((entry) => entry.id === clean(input.choiceId)) : null;
  if (intent === "select" && !choice) throw new DiscoveryOnboardingError("Choose a supported workflow. Nothing was saved.");
  const requestId = clean(input.requestId);
  if (!requestIdPattern.test(requestId)) throw new DiscoveryOnboardingError("The onboarding request was invalid. Nothing was saved.");
  return Object.freeze({ intent, choice, requestId, expectedVersion:preferenceVersion(input.expectedVersion) });
}

export async function saveFirstRunOnboarding({ actor = {}, currentPreference = {}, input = {}, now = "", commitPreference } = {}) {
  authorize(actor, "mutate_state");
  if (typeof commitPreference !== "function") throw new DiscoveryOnboardingError("Onboarding could not be saved. Nothing was changed.", 503);
  const timestamp = clean(now);
  if (!Number.isFinite(Date.parse(timestamp))) throw new DiscoveryOnboardingError("A valid server timestamp is required.");
  const current = normalizedPreference(currentPreference);
  const command = validatedInput(input);
  if (command.expectedVersion !== current.version) throw new DiscoveryOnboardingError("Onboarding changed in another session. Reload and try again.", 409);
  const patch = command.intent === "select"
    ? Object.freeze({ status:"completed", choiceId:command.choice.id, completedAt:timestamp, deferredAt:null })
    : Object.freeze({ status:"deferred", choiceId:null, completedAt:null, deferredAt:timestamp });
  const evidence = Object.freeze({
    activity:Object.freeze({ type:"discovery_onboarding_updated", summary:command.intent === "select" ? "First-run workflow selected." : "First-run onboarding deferred.", occurredAt:timestamp }),
    audit:Object.freeze({ action:"discovery_onboarding_update", resourceType:"user_discovery_preference", actorId:clean(actor.id), occurredAt:timestamp, externalSideEffects:false })
  });
  const committed = await commitPreference(Object.freeze({
    actorId:clean(actor.id),
    expectedVersion:current.version,
    requestId:command.requestId,
    patch,
    evidence
  }));
  if (!committed?.ok) throw new DiscoveryOnboardingError(clean(committed?.safeMessage) || "Onboarding could not be saved. Nothing was changed.", committed?.status || 503);
  return Object.freeze({
    ok:true,
    preference:normalizedPreference({ ...patch, version:committed.version ?? current.version + 1 }),
    action:command.choice?.action || null,
    reused:committed.reused === true,
    integrationsChanged:false,
    externalActions:0,
    productFlagsChanged:false
  });
}
