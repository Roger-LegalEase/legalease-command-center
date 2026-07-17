import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";
import { buildExactObjectLink } from "../route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const PARTNER_STAGE_CONTRACT = Object.freeze({
  new: Object.freeze({
    key: "new",
    label: "New",
    explanation: "This relationship is newly recorded or still at the lead stage."
  }),
  qualified: Object.freeze({
    key: "qualified",
    label: "Qualified",
    explanation: "The stored Partner lifecycle says this organization is qualified for continued work."
  }),
  in_conversation: Object.freeze({
    key: "in_conversation",
    label: "In conversation",
    explanation: "The stored Partner lifecycle explicitly records an introduction or meeting conversation."
  }),
  proposal: Object.freeze({
    key: "proposal",
    label: "Proposal",
    explanation: "The stored Partner lifecycle explicitly records proposal, pilot-scoping, verbal-yes, or contract work."
  }),
  active: Object.freeze({
    key: "active",
    label: "Active",
    explanation: "The stored Partner lifecycle explicitly records an active pilot, delivery, reporting, renewal, or expansion state."
  }),
  closed: Object.freeze({
    key: "closed",
    label: "Closed",
    explanation: "The Partner record is explicitly lost, inactive, or archived; the outcome preserves which condition applies."
  }),
  unavailable: Object.freeze({
    key: "unavailable",
    label: "Stage unavailable",
    explanation: "The stored Partner stage does not map safely to a founder-facing commercial stage."
  })
});

export const INTERNAL_PARTNER_STAGE_MAPPING = Object.freeze({
  new: "new",
  lead: "new",
  target_identified: "new",
  contact_found: "new",
  qualified: "qualified",
  outreach_sent: "qualified",
  pitching: "qualified",
  intro_scheduled: "in_conversation",
  meeting_requested: "in_conversation",
  meeting_scheduling: "in_conversation",
  meeting_booked: "in_conversation",
  proposal_sent: "proposal",
  pilot_scoped: "proposal",
  verbal_yes: "proposal",
  contract_pending: "proposal",
  active_pilot: "active",
  signed_pilot: "active",
  reporting: "active",
  campaign_live: "active",
  onboarded: "active",
  renewal: "active",
  case_study: "active",
  expansion: "active",
  active: "active",
  live: "active",
  lost: "closed",
  closed_lost: "closed",
  inactive: "closed",
  archived: "closed"
});

export const PARTNER_ATTENTION_STAGES = Object.freeze(["stalled", "paused", "dormant"]);
export const OPERATIONAL_ONLY_PARTNER_STAGES = Object.freeze(["production_activation"]);

export const PARTNER_SOURCE_MAPPINGS = Object.freeze({
  canonical: Object.freeze({ collection: "partners", sourceKind: "partner", relationship: "record" }),
  pilots: Object.freeze({ collection: "pilots", sourceKind: "pilot", relationship: "pilot" }),
  programs: Object.freeze({ collection: "partnerPrograms", sourceKind: "partner-program", relationship: "program" }),
  activity: Object.freeze(["activityEvents", "auditHistory", "automationEvents", "partners.history"])
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function recordId(record = {}) {
  return clean(record.id || record.partnerId || record.partner_id || record.key || record.slug);
}

function recordUpdatedAt(record = {}) {
  return clean(record.updatedAt || record.updated_at || record.createdAt || record.created_at);
}

function stableRecords(value = []) {
  return [...list(value)].sort((left, right) =>
    recordId(left).localeCompare(recordId(right), "en-US")
    || recordUpdatedAt(right).localeCompare(recordUpdatedAt(left), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
}

function values(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
}

function uniqueIds(...inputs) {
  return [...new Set(inputs.flatMap(values).map(clean).filter(Boolean))];
}

function knownActorRole(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true
    && roles.includes(role)
    && roleHasCapability(role, "read_internal")
    ? role
    : "";
}

function validTimestamp(value = "") {
  const text = clean(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return "";
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  return Number.isFinite(parsed) ? text : "";
}

function timestampValue(value = "") {
  const timestamp = validTimestamp(value);
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? `${timestamp}T00:00:00.000Z` : timestamp);
}

function normalizedStage(value = "") {
  return lower(value).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");
}

function internalStage(partner = {}) {
  return clean(partner.stage || partner.lifecycleStage || partner.lifecycle_stage || partner.status);
}

function explicitClosedOutcome(partner = {}, internalKey = "") {
  const archived = internalKey === "archived"
    || partner.archived === true
    || partner.isArchived === true
    || Boolean(validTimestamp(partner.archivedAt || partner.archived_at));
  const inactive = internalKey === "inactive"
    || partner.inactive === true
    || partner.isInactive === true
    || Boolean(validTimestamp(partner.inactiveAt || partner.inactive_at));
  if (archived) return { available: true, key: "archived", label: "Archived", source: internalKey === "archived" ? "internal_stage" : "explicit_archive_truth" };
  if (inactive) return { available: true, key: "inactive", label: "Inactive", source: internalKey === "inactive" ? "internal_stage" : "explicit_inactive_truth" };
  if (["lost", "closed_lost"].includes(internalKey)) return { available: true, key: "lost", label: "Lost", source: "internal_stage" };
  return { available: false, key: null, label: null, source: null };
}

function mappedCommercialStage(value = "") {
  const internalKey = normalizedStage(value);
  const uiStageKey = INTERNAL_PARTNER_STAGE_MAPPING[internalKey] || "";
  return uiStageKey && uiStageKey !== "closed" ? { internalKey, uiStageKey } : null;
}

function explicitCommercialStage(partner = {}) {
  const fields = [
    "commercialStage", "commercial_stage", "currentCommercialStage", "current_commercial_stage",
    "priorCommercialStage", "prior_commercial_stage", "previousCommercialStage", "previous_commercial_stage",
    "previousStage", "previous_stage"
  ];
  for (const field of fields) {
    const mapped = mappedCommercialStage(partner[field]);
    if (mapped) return { ...mapped, source: "explicit_commercial_stage", field };
  }
  const history = list(partner.history).map((entry) => ({
    entry,
    at: validTimestamp(entry?.at || entry?.timestamp || entry?.occurredAt || entry?.createdAt)
  })).filter(({ at }) => at).sort((left, right) =>
    timestampValue(right.at) - timestampValue(left.at)
    || stableSerialize(left.entry).localeCompare(stableSerialize(right.entry), "en-US")
  );
  const historyFields = [
    "commercialStage", "commercial_stage", "currentCommercialStage", "current_commercial_stage",
    "toStage", "to_stage", "stage", "lifecycleStage", "lifecycle_stage",
    "fromStage", "from_stage", "priorCommercialStage", "prior_commercial_stage",
    "previousStage", "previous_stage"
  ];
  for (const { entry } of history) {
    for (const field of historyFields) {
      const mapped = mappedCommercialStage(entry[field]);
      if (mapped) return { ...mapped, source: "authoritative_history", field };
    }
  }
  return null;
}

export function adaptPartnerStage(partner = {}) {
  const internal = internalStage(partner);
  const internalKey = normalizedStage(internal);
  const closedOutcome = explicitClosedOutcome(partner, internalKey);
  const attentionCondition = PARTNER_ATTENTION_STAGES.includes(internalKey);
  const commercialEvidence = attentionCondition ? explicitCommercialStage(partner) : null;
  const uiStageKey = closedOutcome.available
    ? "closed"
    : attentionCondition
      ? commercialEvidence?.uiStageKey || "unavailable"
      : INTERNAL_PARTNER_STAGE_MAPPING[internalKey] || "unavailable";
  const contract = PARTNER_STAGE_CONTRACT[uiStageKey];
  let fallback = null;
  if (uiStageKey === "unavailable") {
    if (!internalKey) fallback = "missing_internal_stage";
    else if (attentionCondition) fallback = "attention_without_commercial_stage";
    else if (OPERATIONAL_ONLY_PARTNER_STAGES.includes(internalKey)) fallback = "operational_only_stage";
    else fallback = "unknown_internal_stage";
  }
  const source = closedOutcome.available
    ? closedOutcome.source
    : commercialEvidence?.source || (attentionCondition ? "attention_only" : "internal_stage");
  return {
    internalStage: internal || null,
    internalStageKey: internalKey || null,
    uiStageKey: contract.key,
    uiStageLabel: contract.label,
    uiStageExplanation: contract.explanation,
    uiStageFallback: fallback,
    uiStageSource: source,
    uiStageEvidence: commercialEvidence ? {
      internalStageKey: commercialEvidence.internalKey,
      source: commercialEvidence.source,
      field: commercialEvidence.field
    } : null,
    attentionCondition: attentionCondition ? {
      key: "needs_attention",
      label: "Needs attention",
      source: "internal_stage"
    } : null,
    outcome: closedOutcome
  };
}

function exactPartnerLink(sourceId) {
  return buildExactObjectLink({ objectType: "Partner", sourceKind: "partner", sourceId })?.target || "";
}

function sourceReference(sourceCollection, sourceKind, sourceId, relationship, href = "") {
  const id = clean(sourceId);
  return id ? {
    sourceCollection,
    sourceKind,
    sourceId: id,
    relationship,
    href: clean(href) || null
  } : null;
}

function referenceKey(reference = {}) {
  return [reference.relationship, reference.sourceCollection, reference.sourceId].join(":");
}

function stableReferences(references = []) {
  const seen = new Set();
  return references.filter(Boolean).sort((left, right) =>
    left.relationship.localeCompare(right.relationship, "en-US")
    || left.sourceCollection.localeCompare(right.sourceCollection, "en-US")
    || left.sourceId.localeCompare(right.sourceId, "en-US")
  ).filter((reference) => {
    const key = referenceKey(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linkedPilotIds(partner = {}) {
  return uniqueIds(partner.relatedPilot, partner.relatedPilotId, partner.relatedPilots, partner.relatedPilotIds);
}

function linkedProgramIds(partner = {}) {
  return uniqueIds(partner.relatedProgram, partner.relatedProgramId, partner.relatedPrograms, partner.relatedProgramIds);
}

function addGrouped(map, key, record) {
  const id = clean(key);
  if (!id) return;
  if (!map.has(id)) map.set(id, []);
  map.get(id).push(record);
}

function uniqueRecords(records = []) {
  const seen = new Set();
  return stableRecords(records).filter((record) => {
    const key = recordId(record) || stableSerialize(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function relatedContext(index, partner) {
  const partnerId = recordId(partner);
  const pilots = uniqueRecords([
    ...list(index.pilotsByPartner.get(partnerId)),
    ...linkedPilotIds(partner).map((id) => index.pilotsById.get(id)).filter(Boolean)
  ]);
  const programs = uniqueRecords([
    ...list(index.programsByPartner.get(partnerId)),
    ...linkedProgramIds(partner).map((id) => index.programsById.get(id)).filter(Boolean)
  ]);
  return {
    pilots,
    programs,
    availability: index.availability
  };
}

function activityId(record = {}, collection = "") {
  return recordId(record) || clean(record.event_id || record.eventId || record.audit_id || record.auditId)
    || `${collection}:${validTimestamp(record.timestamp || record.occurredAt || record.createdAt)}:${normalizedStage(record.action || record.eventType || record.type)}`;
}

function activityTimestamp(record = {}) {
  return validTimestamp(
    record.occurredAt || record.occurred_at || record.timestamp || record.eventAt || record.event_at
    || record.lastActivityAt || record.last_activity_at || record.updatedAt || record.updated_at
    || record.createdAt || record.created_at || record.at
  );
}

function activitySummary(record = {}) {
  const text = clean(record.title || record.action || record.eventType || record.event_type || record.type);
  return text ? text.slice(0, 180) : "Partner activity recorded.";
}

function directActivityCandidates(partner = {}) {
  const candidates = [
    ["partner_response", "Partner response recorded.", partner.responseReceivedAt || partner.response_received_at],
    ["partner_activity", "Partner activity recorded.", partner.lastActivityAt || partner.last_activity_at],
    ["partner_touch", "Partner touch recorded.", partner.lastTouchDate || partner.last_touch_date],
    ["partner_contact", "Partner contact recorded.", partner.lastContacted || partner.last_contacted]
  ];
  return candidates.map(([kind, summary, at]) => ({
    id: `partners:${recordId(partner)}:${kind}`,
    sourceCollection: "partners",
    sourceKind: "partner",
    kind,
    summary,
    occurredAt: validTimestamp(at),
    sourceId: recordId(partner)
  })).filter((candidate) => candidate.occurredAt);
}

function historyActivityCandidates(partner = {}) {
  return list(partner.history).map((entry) => {
    const occurredAt = activityTimestamp(entry);
    const kind = normalizedStage(entry.action || entry.type) || "partner_history";
    return {
      id: clean(entry.id) || `partner-history:${recordId(partner)}:${occurredAt}:${kind}`,
      sourceCollection: "partners.history",
      sourceKind: "partner-history",
      kind,
      summary: activitySummary(entry),
      occurredAt,
      sourceId: clean(entry.id) || `${recordId(partner)}:${occurredAt}:${kind}`
    };
  }).filter((candidate) => candidate.occurredAt);
}

function collectionActivityCandidates(index, partner) {
  const partnerId = recordId(partner);
  return list(index.activityByPartner.get(partnerId));
}

function activityContext(index, partner) {
  const candidates = [
    ...directActivityCandidates(partner),
    ...historyActivityCandidates(partner),
    ...collectionActivityCandidates(index, partner)
  ].sort((left, right) =>
    timestampValue(right.occurredAt) - timestampValue(left.occurredAt)
    || left.sourceCollection.localeCompare(right.sourceCollection, "en-US")
    || left.id.localeCompare(right.id, "en-US")
  );
  const latest = candidates[0];
  if (!latest) return { available: false, id: null, kind: null, summary: null, occurredAt: null, sourceReference: null };
  return {
    available: true,
    id: latest.id,
    kind: latest.kind || "partner_activity",
    summary: latest.summary,
    occurredAt: latest.occurredAt,
    sourceReference: sourceReference(latest.sourceCollection, latest.sourceKind, latest.sourceId, "activity")
  };
}

function recordPartnerIds(record = {}) {
  const ids = uniqueIds(record.partnerId, record.partner_id);
  const ref = record.sourceRef || record.source_ref || record.relatedObject || {};
  if (clean(ref.collection || ref.sourceCollection) === "partners") {
    ids.push(clean(ref.itemId || ref.sourceId || ref.id));
  }
  const type = normalizedStage(record.relatedObjectType || record.resourceType || record.sourceType || record.objectType);
  if (["partner", "partners"].includes(type)) {
    ids.push(clean(record.relatedObjectId || record.resourceId || record.sourceId || record.objectId));
  }
  if (normalizedStage(record.relatedEntityType) === "partner") ids.push(clean(record.relatedEntityId));
  return [...new Set(ids.filter(Boolean))];
}

function createProjectionIndex(state, role) {
  const visible = (records) => stableRecords(records).filter((record) => recordVisibleToActor(record, role));
  const pilots = visible(state.pilots);
  const programs = visible(state.partnerPrograms);
  const pilotsById = new Map(pilots.map((record) => [recordId(record), record]).filter(([id]) => id));
  const programsById = new Map(programs.map((record) => [recordId(record), record]).filter(([id]) => id));
  const pilotsByPartner = new Map();
  const programsByPartner = new Map();
  const activityByPartner = new Map();
  for (const pilot of pilots) addGrouped(pilotsByPartner, clean(pilot.partnerId || pilot.partner_id || pilot.relatedPartnerId || pilot.related_partner_id), pilot);
  for (const program of programs) addGrouped(programsByPartner, clean(program.relatedPartnerId || program.related_partner_id || program.partnerId || program.partner_id), program);
  const activityMappings = [
    ["activityEvents", "partner-activity"],
    ["auditHistory", "partner-audit"],
    ["automationEvents", "partner-automation-event"]
  ];
  for (const [collection, sourceKind] of activityMappings) {
    for (const record of visible(state[collection])) {
      const candidate = {
        id: activityId(record, collection),
        sourceCollection: collection,
        sourceKind,
        kind: normalizedStage(record.action || record.eventType || record.event_type || record.type || collection),
        summary: activitySummary(record),
        occurredAt: activityTimestamp(record),
        sourceId: activityId(record, collection)
      };
      if (!candidate.id || !candidate.occurredAt) continue;
      for (const partnerId of recordPartnerIds(record)) addGrouped(activityByPartner, partnerId, candidate);
    }
  }
  return {
    pilotsById,
    programsById,
    pilotsByPartner,
    programsByPartner,
    activityByPartner,
    availability: {
      pilots: Array.isArray(state.pilots),
      programs: Array.isArray(state.partnerPrograms)
    }
  };
}

function explicitQualification(partner = {}) {
  const status = normalizedStage(partner.qualificationStatus || partner.qualification_status || partner.qualification);
  const boolean = typeof partner.qualified === "boolean" ? partner.qualified
    : typeof partner.isQualified === "boolean" ? partner.isQualified
      : typeof partner.is_qualified === "boolean" ? partner.is_qualified : null;
  const qualifiedAt = validTimestamp(partner.qualifiedAt || partner.qualified_at);
  let state = null;
  if (boolean === true || ["qualified", "approved", "confirmed"].includes(status) || qualifiedAt) state = "qualified";
  else if (boolean === false || ["not_qualified", "disqualified", "rejected"].includes(status)) state = "not_qualified";
  else if (status) state = status;
  return {
    available: state !== null,
    state,
    label: state === "qualified" ? "Qualified" : state === "not_qualified" ? "Not qualified" : state ? "Qualification recorded" : null,
    qualifiedAt: qualifiedAt || null,
    explicit: state !== null,
    inferredFromNotes: false
  };
}

function relationshipSummary(partner = {}, stage = {}) {
  const risk = normalizedStage(partner.riskLevel || partner.risk_level);
  const health = normalizedStage(partner.relationshipHealth || partner.relationship_health || partner.health);
  const blocker = clean(partner.blocker || partner.riskSummary || partner.risk_summary);
  const stageAttention = Boolean(stage.attentionCondition);
  const explicitAttention = stageAttention
    || ["needs_attention", "at_risk", "unhealthy", "poor", "critical", "blocked"].includes(health)
    || ["high", "critical"].includes(risk);
  const attentionSource = stageAttention ? "internal_stage"
    : ["needs_attention", "at_risk", "unhealthy", "poor", "critical", "blocked"].includes(health) ? "relationship_health"
      : ["high", "critical"].includes(risk) ? "risk_level" : null;
  let summary = null;
  if (stageAttention) summary = "The stored Partner stage explicitly indicates this relationship needs attention.";
  else if (health) summary = `Relationship health is recorded as ${health.replaceAll("_", " ")}.`;
  else if (risk) summary = `Relationship risk is recorded as ${risk.replaceAll("_", " ")}.`;
  else if (blocker) summary = "A Partner blocker is recorded; no risk level is inferred.";
  return {
    available: Boolean(risk || health || blocker || stageAttention),
    riskLevel: risk || null,
    health: health || null,
    blocker: blocker || null,
    summary,
    attention: {
      available: explicitAttention,
      key: explicitAttention ? "needs_attention" : null,
      label: explicitAttention ? "Needs attention" : null,
      source: attentionSource
    },
    inferredFromActivityAge: false
  };
}

function relatedProjection(context) {
  const project = (record, sourceCollection) => ({
    id: recordId(record),
    sourceCollection,
    name: clean(record.pilotName || record.name || record.partnerName) || null,
    status: clean(record.status || record.stage) || null,
    owner: clean(record.owner || record.internalOwner) || null
  });
  return {
    pilotsAvailable: context.availability.pilots,
    programsAvailable: context.availability.programs,
    pilots: context.pilots.map((record) => project(record, "pilots")),
    programs: context.programs.map((record) => project(record, "partnerPrograms")),
    changesPartnerStage: false
  };
}

function referencesFor(partner, href, related, activity) {
  const references = [sourceReference("partners", "partner", recordId(partner), "record", href)];
  for (const pilot of related.pilots) references.push(sourceReference("pilots", "pilot", recordId(pilot), "pilot"));
  for (const program of related.programs) references.push(sourceReference("partnerPrograms", "partner-program", recordId(program), "program"));
  if (activity.sourceReference) references.push(activity.sourceReference);
  return stableReferences(references);
}

function projectPartner(index, partner) {
  const sourceId = recordId(partner);
  const href = exactPartnerLink(sourceId);
  if (!href) return null;
  const stage = adaptPartnerStage(partner);
  const related = relatedContext(index, partner);
  const activity = activityContext(index, partner);
  return {
    id: `partner:${sourceId}`,
    stableIdentity: `partner:${sourceId}`,
    name: clean(partner.organizationName || partner.name || partner.partnerName || partner.organization) || null,
    source: {
      collection: "partners",
      sourceKind: "partner",
      sourceId,
      href
    },
    sourceReferences: referencesFor(partner, href, related, activity),
    internalStage: stage.internalStage,
    internalStageKey: stage.internalStageKey,
    uiStage: {
      key: stage.uiStageKey,
      label: stage.uiStageLabel,
      explanation: stage.uiStageExplanation,
      fallback: stage.uiStageFallback,
      source: stage.uiStageSource,
      evidence: stage.uiStageEvidence
    },
    outcome: stage.outcome,
    qualification: explicitQualification(partner),
    nextAction: {
      summary: clean(partner.nextAction || partner.firstNextAction || partner.suggestedAction) || null,
      dueAt: validTimestamp(partner.nextActionDueDate || partner.next_action_due_date || partner.nextFollowUpDate || partner.next_follow_up_date) || null
    },
    owner: clean(partner.owner || partner.currentOwner || partner.internalOwner) || null,
    relationship: relationshipSummary(partner, stage),
    pilotAndProgramContext: relatedProjection(related),
    lastMeaningfulActivity: activity,
    exactPartnerLink: href,
    timestamps: {
      createdAt: validTimestamp(partner.createdAt || partner.created_at) || null,
      updatedAt: validTimestamp(partner.updatedAt || partner.updated_at) || null,
      archivedAt: validTimestamp(partner.archivedAt || partner.archived_at) || null,
      inactiveAt: validTimestamp(partner.inactiveAt || partner.inactive_at) || null
    }
  };
}

export function buildPartnerStageViews(state = {}, actor = {}) {
  const role = knownActorRole(actor);
  if (!role) return deepFreeze([]);
  const index = createProjectionIndex(state, role);
  const seen = new Set();
  const views = stableRecords(state.partners)
    .filter((partner) => recordVisibleToActor(partner, role))
    .filter((partner) => {
      const id = recordId(partner);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((partner) => projectPartner(index, partner))
    .filter(Boolean)
    .sort((left, right) => left.stableIdentity.localeCompare(right.stableIdentity, "en-US"));
  return deepFreeze(views);
}

export function buildPartnerStageView(state = {}, stableIdentity = "", actor = {}) {
  return buildPartnerStageViews(state, actor).find((view) => view.stableIdentity === clean(stableIdentity)) || null;
}
