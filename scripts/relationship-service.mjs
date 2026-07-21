import { projectCompanyMemory } from "./company-memory-projector.mjs";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { isSuppressed } from "./outreach-os.mjs";
import { roleHasCapability, roles } from "./roles.mjs";
import { buildExactObjectLink, buildGenericItemLink } from "./ui/route-compatibility.mjs";
import { INTERNAL_PARTNER_STAGE_MAPPING, PARTNER_STAGE_CONTRACT } from "./ui/view-models/partner-stage.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const slug = (value = "") => lower(value).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");

export const RELATIONSHIP_CATEGORIES = Object.freeze([
  Object.freeze({ key:"partner", label:"Partner" }),
  Object.freeze({ key:"partner_prospect", label:"Partner prospect" }),
  Object.freeze({ key:"investor", label:"Investor" }),
  Object.freeze({ key:"press", label:"Press" }),
  Object.freeze({ key:"vendor", label:"Vendor" }),
  Object.freeze({ key:"customer", label:"Customer" }),
  Object.freeze({ key:"referral_source", label:"Referral source" }),
  Object.freeze({ key:"internal_team", label:"Internal team" }),
  Object.freeze({ key:"other", label:"Other" })
]);

export const RELATIONSHIP_WAITING_STATES = Object.freeze([
  Object.freeze({ key:"on_them", label:"Waiting on them" }),
  Object.freeze({ key:"on_roger", label:"Waiting on Roger" }),
  Object.freeze({ key:"none", label:"No waiting follow-up" })
]);

export const RELATIONSHIP_ELIGIBILITY_STATES = Object.freeze([
  Object.freeze({ key:"eligible", label:"Eligible" }),
  Object.freeze({ key:"suppressed", label:"Suppressed" }),
  Object.freeze({ key:"ineligible", label:"Ineligible" }),
  Object.freeze({ key:"unavailable", label:"Unavailable" })
]);

const IDENTITY_COLLECTIONS = Object.freeze([
  "companyContacts",
  "companyOrganizations",
  "partners",
  "reactivationContacts",
  "expungementLifecycleContacts",
  "outreachContacts",
  "rcapRevenueContacts",
  "outreachOrganizations",
  "rcapRevenueAccounts",
  "prospectCandidates",
  "outreachSuppressions",
  "outreachUnsubscribes"
]);

const RELATIONSHIP_SOURCE_COLLECTIONS = Object.freeze([
  ...IDENTITY_COLLECTIONS,
  "tasks",
  "inboxSignals",
  "activityEvents",
  "auditHistory",
  "automationEvents",
  "companyEvents",
  "outreachCampaigns",
  "outreachAttempts",
  "outreachReplies",
  "reactivationAttempts",
  "reactivationReplies",
  "meetingBriefs",
  "calendarSignals",
  "googleCalendarSignals",
  "dataRoomItems",
  "partnerProgramArtifacts",
  "evidencePackNotes",
  "reports"
]);

const SOURCE_RECORD_ID_FIELDS = Object.freeze([
  "id", "partnerId", "partner_id", "contact_id", "contactId", "org_id", "organizationId",
  "organization_id", "account_id", "accountId", "candidate_id", "candidateId", "event_id",
  "eventId", "task_id", "taskId", "attempt_id", "attemptId", "reply_id", "replyId", "key", "slug"
]);

const RELATION_ID_FIELDS = Object.freeze([
  "partnerId", "partner_id", "relatedPartnerId", "related_partner_id", "linked_partner", "linkedPartner",
  "contact_id", "contactId", "relatedContact", "related_contact", "organization_id", "organizationId",
  "org_id", "orgId", "account_id", "accountId", "linked_account_id", "linkedAccountId",
  "relatedOrganization", "related_organization", "sourceId", "source_id", "relatedEntityId", "related_entity_id"
]);

const EMAIL_FIELDS = Object.freeze([
  "email", "contactEmail", "contact_email", "primaryContactEmail", "primary_email", "public_email",
  "from_email", "fromEmail", "to", "recipient", "counterpartEmail"
]);

const ORGANIZATION_NAME_FIELDS = Object.freeze([
  "organizationName", "organization_name", "organization", "company", "companyName", "accountName",
  "publication", "partnerName"
]);

const OPEN_TASK_STATUSES = new Set(["open", "in_progress", "waiting", "blocked"]);
const TERMINAL_SIGNAL_STATUSES = new Set(["dismissed", "done", "resolved", "archived"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function actorContext(actor = {}) {
  const role = lower(actor.role);
  const authorized = actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal");
  return {
    authorized,
    role:authorized ? role : null,
    canReadSensitive:authorized && roleHasCapability(role, "read_sensitive")
  };
}

function visibleRecords(state = {}, collection = "", role = "viewer") {
  return list(state[collection]).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role));
}

function safeText(value = "", maximum = 500) {
  const text = clean(value).replaceAll(/\s+/g, " ").slice(0, maximum);
  if (!text || /[\u0000-\u001f\u007f<>]/u.test(text)) return null;
  if (/(?:bearer\s+|api[_ -]?key|token\s*[=:]|secret\s*[=:]|whsec_|(?:^|[^a-z0-9])sk-[a-z0-9_-]{12,})/iu.test(text)) return null;
  return text;
}

function validEmail(value = "") {
  const email = lower(value).slice(0, 320);
  return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) ? email : null;
}

function validTimestamp(value = "") {
  const text = clean(value).slice(0, 80);
  if (!text) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  return Number.isFinite(parsed) ? text : null;
}

function timestampValue(value = "") {
  const timestamp = validTimestamp(value);
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? `${timestamp}T00:00:00.000Z` : timestamp);
}

function newestTimestamp(values = []) {
  return list(values).map(validTimestamp).filter(Boolean).sort((left, right) => timestampValue(right) - timestampValue(left))[0] || null;
}

function firstTimestamp(record = {}, fields = []) {
  for (const field of fields) {
    const timestamp = validTimestamp(record[field]);
    if (timestamp) return timestamp;
  }
  return null;
}

function recordId(record = {}) {
  for (const field of SOURCE_RECORD_ID_FIELDS) {
    const value = clean(record[field]);
    if (value) return value;
  }
  return "";
}

function values(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
}

function uniqueStrings(...inputs) {
  return [...new Set(inputs.flatMap(values).flat(Infinity).map(clean).filter(Boolean))];
}

function organizationDomain(value = "") {
  const normalized = lower(value).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return normalized.includes(".") ? normalized : "";
}

function emailDomain(value = "") {
  const email = validEmail(value);
  return email ? email.slice(email.lastIndexOf("@") + 1) : "";
}

function sourceRefKey(collection = "", itemId = "") {
  return `${clean(collection)}:${clean(itemId)}`;
}

function projectedIdentityState(state = {}, role = "viewer", now = "") {
  const identityState = {};
  for (const collection of IDENTITY_COLLECTIONS) identityState[collection] = visibleRecords(state, collection, role);
  identityState.queueItems = [];
  identityState.companyEvents = [];
  identityState.agentRuns = [];
  identityState.approvals = [];
  const projected = projectCompanyMemory(identityState, { now:() => now, env:{} }).state;
  return {
    contacts:list(projected.companyContacts),
    organizations:list(projected.companyOrganizations)
  };
}

function sourceRecordIndex(state = {}, role = "viewer") {
  const collections = new Map();
  for (const collection of RELATIONSHIP_SOURCE_COLLECTIONS) {
    const rows = visibleRecords(state, collection, role);
    const byId = new Map();
    for (const row of rows) {
      for (const field of SOURCE_RECORD_ID_FIELDS) {
        const id = clean(row[field]);
        if (id && !byId.has(id)) byId.set(id, row);
      }
    }
    collections.set(collection, { rows, byId });
  }
  return collections;
}

function createEntity({ id, kind, partnerId = null, partner = null } = {}) {
  return {
    id,
    kind,
    partnerId,
    partner,
    organizations:[],
    contacts:[],
    sources:[],
    sourceKeys:new Set()
  };
}

function addSource(entity, collection, itemId, record = null) {
  const key = sourceRefKey(collection, itemId);
  if (!collection || !itemId || entity.sourceKeys.has(key)) return;
  entity.sourceKeys.add(key);
  entity.sources.push({ collection, itemId, record });
}

function addAlias(aliasCandidates, alias, entityId) {
  const key = clean(alias);
  if (!key || !entityId) return;
  const ids = aliasCandidates.get(key) || new Set();
  ids.add(entityId);
  aliasCandidates.set(key, ids);
}

function uniqueAlias(aliasCandidates, alias) {
  const ids = aliasCandidates.get(clean(alias));
  return ids?.size === 1 ? [...ids][0] : null;
}

function collectionRecord(index, collection, itemId) {
  return index.get(collection)?.byId.get(clean(itemId)) || null;
}

function organizationLinkPartnerId(organization = {}) {
  return list(organization.links).find((link) => clean(link.collection) === "partners" && clean(link.itemId || link.item_id))?.itemId || "";
}

function rawOrganizationName(record = {}) {
  for (const field of ORGANIZATION_NAME_FIELDS) {
    const value = safeText(record[field], 180);
    if (value) return value;
  }
  return safeText(record.name || record.title, 180);
}

function contactOrganizationName(contact = {}, sourceRecords = []) {
  const direct = rawOrganizationName(contact);
  if (direct) return direct;
  for (const record of sourceRecords) {
    const value = rawOrganizationName(record);
    if (value) return value;
  }
  return null;
}

function buildEntityGraph(state = {}, context, now = "") {
  const sourceIndex = sourceRecordIndex(state, context.role);
  const identity = projectedIdentityState(state, context.role, now);
  const entities = new Map();
  const aliases = new Map();

  for (const partner of sourceIndex.get("partners")?.rows || []) {
    const partnerId = clean(partner.id || partner.partnerId || partner.partner_id || partner.slug);
    if (!partnerId) continue;
    const entityId = `partner:${partnerId}`;
    const entity = createEntity({ id:entityId, kind:"partner", partnerId, partner });
    addSource(entity, "partners", partnerId, partner);
    entities.set(entityId, entity);
    addAlias(aliases, sourceRefKey("partners", partnerId), entityId);
    addAlias(aliases, `id:${partnerId}`, entityId);
    const name = rawOrganizationName(partner);
    if (name) addAlias(aliases, `name:${lower(name)}`, entityId);
    const domain = organizationDomain(partner.domain || partner.website || emailDomain(partner.email || partner.primaryContactEmail));
    if (domain) addAlias(aliases, `domain:${domain}`, entityId);
  }

  for (const organization of [...identity.organizations].sort((left, right) => clean(left.org_id).localeCompare(clean(right.org_id), "en-US"))) {
    const partnerId = organizationLinkPartnerId(organization);
    let entityId = partnerId ? uniqueAlias(aliases, sourceRefKey("partners", partnerId)) : null;
    if (!entityId && clean(organization.domain)) entityId = uniqueAlias(aliases, `domain:${organizationDomain(organization.domain)}`);
    if (!entityId && clean(organization.name)) entityId = uniqueAlias(aliases, `name:${lower(organization.name)}`);
    if (!entityId) {
      const organizationId = clean(organization.org_id);
      if (!organizationId) continue;
      entityId = `organization:${organizationId}`;
      entities.set(entityId, createEntity({ id:entityId, kind:"organization" }));
    }
    const entity = entities.get(entityId);
    entity.organizations.push(organization);
    addAlias(aliases, `org:${clean(organization.org_id)}`, entityId);
    addAlias(aliases, `id:${clean(organization.org_id)}`, entityId);
    if (organization.name) addAlias(aliases, `name:${lower(organization.name)}`, entityId);
    if (organization.domain) addAlias(aliases, `domain:${organizationDomain(organization.domain)}`, entityId);
    for (const link of list(organization.links)) {
      const collection = clean(link.collection);
      const itemId = clean(link.itemId || link.item_id);
      const record = collectionRecord(sourceIndex, collection, itemId);
      addSource(entity, collection, itemId, record);
      addAlias(aliases, sourceRefKey(collection, itemId), entityId);
      addAlias(aliases, `id:${itemId}`, entityId);
    }
  }

  // Partner contacts can be present only as nested fields, so add small virtual contact
  // records before resolving the shared contact index. They remain projections; no writes occur.
  for (const entity of entities.values()) {
    if (!entity.partner) continue;
    const partner = entity.partner;
    const nested = [
      ...list(partner.contacts),
      partner.primaryContactName || partner.primaryContactEmail || partner.email
        ? {
          contact_id:`partner-primary:${entity.partnerId}`,
          name:partner.primaryContactName || partner.contactName,
          title:partner.primaryContactTitle || partner.contactTitle,
          email:partner.primaryContactEmail || partner.contactEmail || partner.email,
          primary:true,
          virtual:true,
          types:["partner_contact"]
        }
        : null
    ].filter(Boolean);
    for (const raw of nested) {
      const email = validEmail(raw.email || raw.contactEmail || raw.contact_email);
      const id = clean(raw.contact_id || raw.id) || (email ? `partner-email:${email}` : "");
      if (!id) continue;
      entity.contacts.push({
        contact_id:id,
        email:email || "",
        name:clean(raw.name || raw.fullName || raw.contactName),
        title:clean(raw.title || raw.role),
        types:uniqueStrings(raw.types, "partner_contact"),
        organizations:[],
        links:[],
        primary:raw.primary === true || raw.isPrimary === true,
        virtual:true
      });
      if (email) addAlias(aliases, `email:${email}`, entity.id);
    }
  }

  for (const contact of [...identity.contacts].sort((left, right) => clean(left.contact_id).localeCompare(clean(right.contact_id), "en-US"))) {
    const sourceRecords = list(contact.links).map((link) => collectionRecord(sourceIndex, clean(link.collection), clean(link.itemId || link.item_id))).filter(Boolean);
    let entityId = null;
    for (const link of list(contact.links)) {
      entityId = uniqueAlias(aliases, sourceRefKey(clean(link.collection), clean(link.itemId || link.item_id)));
      if (entityId) break;
    }
    if (!entityId) {
      for (const organizationId of list(contact.organizations)) {
        entityId = uniqueAlias(aliases, `org:${clean(organizationId)}`)
          || uniqueAlias(aliases, `id:${clean(organizationId)}`);
        if (entityId) break;
      }
    }
    if (!entityId) {
      for (const source of sourceRecords) {
        const organizationId = clean(source.linked_account_id || source.linkedAccountId || source.organization_id || source.organizationId || source.account_id || source.accountId);
        const organizationName = rawOrganizationName(source);
        entityId = organizationId ? uniqueAlias(aliases, `id:${organizationId}`) : null;
        if (!entityId && organizationName) entityId = uniqueAlias(aliases, `name:${lower(organizationName)}`);
        if (entityId) break;
      }
    }
    const contactEmail = validEmail(contact.email);
    if (!entityId && contactEmail) entityId = uniqueAlias(aliases, `email:${contactEmail}`);
    if (!entityId) {
      const organizationName = contactOrganizationName(contact, sourceRecords);
      if (organizationName) entityId = uniqueAlias(aliases, `name:${lower(organizationName)}`);
    }
    if (!entityId) {
      const contactId = clean(contact.contact_id);
      if (!contactId) continue;
      entityId = `contact:${contactId}`;
      entities.set(entityId, createEntity({ id:entityId, kind:"contact" }));
    }
    const entity = entities.get(entityId);
    const duplicate = entity.contacts.some((existing) => clean(existing.contact_id) === clean(contact.contact_id)
      || contactEmail && validEmail(existing.email) === contactEmail);
    if (!duplicate) entity.contacts.push(contact);
    addAlias(aliases, `contact:${clean(contact.contact_id)}`, entityId);
    addAlias(aliases, `id:${clean(contact.contact_id)}`, entityId);
    if (contactEmail) addAlias(aliases, `email:${contactEmail}`, entityId);
    for (const link of list(contact.links)) {
      const collection = clean(link.collection);
      const itemId = clean(link.itemId || link.item_id);
      addSource(entity, collection, itemId, collectionRecord(sourceIndex, collection, itemId));
      addAlias(aliases, sourceRefKey(collection, itemId), entityId);
      addAlias(aliases, `id:${itemId}`, entityId);
    }
  }

  // Resolve a Partner's virtual contact email only after every organization/contact alias
  // exists, keeping identity deterministic even when state arrays arrive in a different order.
  for (const entity of entities.values()) {
    for (const contact of entity.contacts) {
      const email = validEmail(contact.email);
      if (email) addAlias(aliases, `email:${email}`, entity.id);
    }
  }

  return { entities:[...entities.values()], sourceIndex };
}

function entityIdentifiers(entity) {
  const ids = new Set();
  const emails = new Set();
  const domains = new Set();
  const names = new Set();
  const sourceRefs = new Set(entity.sources.map((source) => sourceRefKey(source.collection, source.itemId)));
  if (entity.partnerId) ids.add(entity.partnerId);
  for (const organization of entity.organizations) {
    uniqueStrings(organization.org_id, list(organization.links).map((link) => link.itemId || link.item_id)).forEach((id) => ids.add(id));
    if (organization.name) names.add(lower(organization.name));
    const domain = organizationDomain(organization.domain);
    if (domain) domains.add(domain);
  }
  for (const contact of entity.contacts) {
    uniqueStrings(contact.contact_id, list(contact.links).map((link) => link.itemId || link.item_id), contact.organizations).forEach((id) => ids.add(id));
    const email = validEmail(contact.email);
    if (email) {
      emails.add(email);
      domains.add(emailDomain(email));
    }
  }
  for (const source of entity.sources) {
    ids.add(source.itemId);
    const record = source.record || {};
    for (const field of RELATION_ID_FIELDS) uniqueStrings(record[field]).forEach((id) => ids.add(id));
    for (const field of EMAIL_FIELDS) {
      const email = validEmail(record[field]);
      if (email) {
        emails.add(email);
        domains.add(emailDomain(email));
      }
    }
    const name = rawOrganizationName(record);
    if (name) names.add(lower(name));
  }
  if (entity.partner) {
    const name = rawOrganizationName(entity.partner);
    if (name) names.add(lower(name));
  }
  return { ids, emails, domains, names, sourceRefs };
}

function recordMatchesEntity(record = {}, identifiers, { allowOrganizationName = false } = {}) {
  for (const field of RELATION_ID_FIELDS) {
    if (uniqueStrings(record[field]).some((value) => identifiers.ids.has(value))) return true;
  }
  for (const field of EMAIL_FIELDS) {
    const email = validEmail(record[field]);
    if (email && identifiers.emails.has(email)) return true;
  }
  const pipeline = record.pipelineMatch;
  if (pipeline && identifiers.sourceRefs.has(sourceRefKey(pipeline.collection, pipeline.itemId))) return true;
  const sourceRef = record.sourceRef || record.source_ref;
  if (sourceRef && identifiers.sourceRefs.has(sourceRefKey(sourceRef.collection, sourceRef.itemId || sourceRef.item_id))) return true;
  if (allowOrganizationName) {
    const name = rawOrganizationName(record);
    if (name && identifiers.names.has(lower(name))) return true;
  }
  return false;
}

function relatedRows(sourceIndex, collection, identifiers, options = {}) {
  return (sourceIndex.get(collection)?.rows || []).filter((record) => recordMatchesEntity(record, identifiers, options));
}

function categoryFor(entity) {
  if (entity.kind === "partner") return RELATIONSHIP_CATEGORIES[0];
  const sourceValues = entity.sources.flatMap(({ record }) => record ? [
    record.relationshipCategory, record.relationship_category, record.category, record.contactType,
    record.contact_type, record.organizationType, record.organization_type, record.classification,
    record.type, record.tags
  ] : []);
  const typeValues = [
    ...entity.organizations.flatMap((organization) => list(organization.types)),
    ...entity.contacts.flatMap((contact) => list(contact.types)),
    ...sourceValues.flatMap(values)
  ].map(slug).filter(Boolean);
  const includes = (...patterns) => typeValues.some((value) => patterns.some((pattern) => value === pattern || value.includes(pattern)));
  let key = "other";
  if (includes("rcap_partner")) key = "partner";
  else if (includes("internal", "internal_team", "team_member", "employee")) key = "internal_team";
  else if (includes("media", "press", "journalist", "publication")) key = "press";
  else if (includes("investor", "funder", "funding")) key = "investor";
  else if (includes("vendor", "supplier")) key = "vendor";
  else if (includes("referral", "referral_source", "attorney")) key = "referral_source";
  else if (includes("paid_customer", "consumer", "customer", "support", "abandoned_screening", "checkout_abandon")) key = "customer";
  else if (includes("rcap_prospect", "prospect", "partner_contact", "legal_aid", "workforce", "nonprofit", "advocacy", "employer", "city_county")) key = "partner_prospect";
  return RELATIONSHIP_CATEGORIES.find((category) => category.key === key) || RELATIONSHIP_CATEGORIES.at(-1);
}

function stageFor(entity) {
  const sources = [entity.partner, ...entity.sources.map((source) => source.record), ...entity.organizations].filter(Boolean);
  let raw = "";
  for (const record of sources) {
    raw = clean(record.relationshipStage || record.relationship_stage || record.commercialStage || record.commercial_stage
      || record.stage || record.review_state || record.reviewState || record.account_status || record.status);
    if (raw) break;
  }
  const internal = slug(raw);
  if (!internal) return { key:"unavailable", label:"Stage unavailable", available:false };
  const mapped = INTERNAL_PARTNER_STAGE_MAPPING[internal]
    || (["pending_review", "imported", "identified", "draft"].includes(internal) ? "new" : "")
    || (["approved", "ready", "validated"].includes(internal) ? "qualified" : "")
    || (/reply|conversation|meeting/.test(internal) ? "in_conversation" : "")
    || (/proposal|contract|pilot_scoped/.test(internal) ? "proposal" : "")
    || (/active|enrolled|current/.test(internal) ? "active" : "")
    || (/stalled|paused|waiting|dormant/.test(internal) ? "stalled" : "")
    || (/closed|lost|rejected|inactive|archived/.test(internal) ? "closed" : "");
  if (mapped && PARTNER_STAGE_CONTRACT[mapped]) return { ...PARTNER_STAGE_CONTRACT[mapped], available:true };
  if (mapped === "stalled") return { key:"stalled", label:"Stalled", available:true };
  const label = safeText(raw.replaceAll(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()), 80);
  return label ? { key:internal, label, available:true } : { key:"unavailable", label:"Stage unavailable", available:false };
}

function contactView(contact = {}, context, organization = null, primary = false) {
  const email = validEmail(contact.email || contact.contactEmail || contact.contact_email);
  return {
    id:clean(contact.contact_id || contact.id) || null,
    name:safeText(contact.name || contact.fullName || contact.contactName, 160),
    title:safeText(contact.title || contact.role, 120),
    organization:safeText(organization || contact.organization || contact.organization_name, 180),
    email:context.canReadSensitive ? email : null,
    emailAvailable:Boolean(context.canReadSensitive && email),
    primary:Boolean(primary)
  };
}

function entityName(entity) {
  if (entity.partner) return rawOrganizationName(entity.partner) || "Unnamed relationship";
  const organization = entity.organizations.find((item) => clean(item.name));
  if (organization) return safeText(organization.name, 180) || "Unnamed relationship";
  const contact = entity.contacts.find((item) => clean(item.name)) || entity.contacts[0];
  return safeText(contact?.name, 160) || "Unnamed contact";
}

function entityOrganization(entity) {
  if (entity.partner) return rawOrganizationName(entity.partner);
  const organization = entity.organizations.find((item) => clean(item.name));
  if (organization) return safeText(organization.name, 180);
  const sourceName = entity.sources.map((source) => rawOrganizationName(source.record || {})).find(Boolean);
  return sourceName || null;
}

function primaryContact(entity, context) {
  const organization = entityOrganization(entity);
  const sorted = [...entity.contacts].sort((left, right) => Number(right.primary === true) - Number(left.primary === true)
    || Number(Boolean(validEmail(right.email))) - Number(Boolean(validEmail(left.email)))
    || clean(left.name).localeCompare(clean(right.name), "en-US"));
  return sorted.length ? contactView(sorted[0], context, organization, true) : null;
}

function taskView(task = {}) {
  const id = clean(task.id || task.taskId || task.task_id);
  return {
    id:id || null,
    title:safeText(task.title || task.nextAction, 180) || "Untitled task",
    status:slug(task.status || "open") || "open",
    priority:slug(task.priority || "medium") || "medium",
    owner:safeText(task.owner, 100),
    dueAt:validTimestamp(task.dueDate || task.due_date || task.due_at),
    nextAction:safeText(task.nextAction || task.next_action, 240),
    waitingOn:safeText(task.waiting_on || task.waitingOn, 240),
    blocker:safeText(task.blocker_reason || task.blockerReason, 240),
    href:id ? buildGenericItemLink({ collection:"tasks", sourceId:id })?.target || null : null
  };
}

function openTasksFor(entity, sourceIndex, identifiers) {
  return relatedRows(sourceIndex, "tasks", identifiers)
    .filter((task) => OPEN_TASK_STATUSES.has(slug(task.status || "open")))
    .map(taskView)
    .sort((left, right) => timestampValue(left.dueAt) - timestampValue(right.dueAt) || left.title.localeCompare(right.title, "en-US"));
}

function signalsFor(sourceIndex, identifiers) {
  return relatedRows(sourceIndex, "inboxSignals", identifiers, { allowOrganizationName:true })
    .filter((signal) => !TERMINAL_SIGNAL_STATUSES.has(slug(signal.status)));
}

function waitingState(tasks, signals, entity) {
  const sourceValues = [entity.partner, ...entity.sources.map((source) => source.record)].filter(Boolean);
  const explicit = sourceValues.map((record) => lower(record.waitingState || record.waiting_state || record.waitingOn || record.waiting_on)).find(Boolean) || "";
  if (/them|partner|contact|customer|reply/.test(explicit)) return RELATIONSHIP_WAITING_STATES[0];
  if (/roger|us|legal.?ease|internal|owner/.test(explicit)) return RELATIONSHIP_WAITING_STATES[1];
  if (tasks.some((task) => task.status === "waiting" || task.waitingOn)) return RELATIONSHIP_WAITING_STATES[0];
  if (signals.some((signal) => slug(signal.kind) === "went_quiet")) return RELATIONSHIP_WAITING_STATES[0];
  if (signals.some((signal) => ["needs_reply", "commitment", "pipeline_inbound"].includes(slug(signal.kind)))) return RELATIONSHIP_WAITING_STATES[1];
  if (tasks.some((task) => ["open", "in_progress", "blocked"].includes(task.status))) return RELATIONSHIP_WAITING_STATES[1];
  return RELATIONSHIP_WAITING_STATES[2];
}

function nextActionFor(entity, tasks, signals) {
  const sources = [entity.partner, ...entity.sources.map((source) => source.record)].filter(Boolean);
  let summary = null;
  let dueAt = null;
  for (const record of sources) {
    summary ||= safeText(record.nextAction || record.next_action || record.followUpAction || record.follow_up_action, 240);
    dueAt ||= validTimestamp(record.nextFollowUpAt || record.next_follow_up_at || record.nextFollowUpDate || record.next_follow_up_date
      || record.nextActionDueDate || record.next_action_due_date || record.followUpDate || record.follow_up_date || record.dueDate || record.due_date);
    if (summary && dueAt) break;
  }
  if (!summary && tasks[0]) summary = tasks[0].nextAction || tasks[0].title;
  if (!dueAt && tasks[0]) dueAt = tasks[0].dueAt;
  if (!summary && signals.length) {
    const kind = slug(signals[0].kind);
    summary = kind === "needs_reply" ? "Draft reply"
      : kind === "went_quiet" ? "Follow up"
        : kind === "commitment" ? "Complete your commitment"
          : kind === "pipeline_inbound" ? "Review and reply" : null;
  }
  if (!dueAt && signals.length) dueAt = validTimestamp(signals[0].dueAt || signals[0].due_at);
  return { summary, dueAt };
}

function campaignIdFor(record = {}) {
  return clean(record.campaign_id || record.campaignId || record.outreachCampaignId || record.outreach_campaign_id);
}

function campaignView(sourceIndex, campaignId) {
  if (!campaignId) return null;
  const outreach = sourceIndex.get("outreachCampaigns")?.rows.find((record) => campaignIdFor(record) === campaignId || clean(record.id) === campaignId);
  const campaign = outreach || null;
  return {
    id:campaignId,
    name:safeText(campaign?.name || campaign?.campaignName || campaign?.campaign_name, 180) || "Outreach campaign",
    status:safeText(campaign?.status, 80),
    href:buildExactObjectLink({ objectType:"Campaign", sourceKind:"campaign", sourceId:campaignId })?.target || "#outreach"
  };
}

function outreachContext(entity, sourceIndex, identifiers, context) {
  const outreachContacts = entity.sources.filter((source) => source.collection === "outreachContacts").map((source) => source.record).filter(Boolean);
  const reactivationContacts = entity.sources.filter((source) => source.collection === "reactivationContacts").map((source) => source.record).filter(Boolean);
  const attempts = [
    ...relatedRows(sourceIndex, "outreachAttempts", identifiers).map((record) => ({ record, lane:"outreach" })),
    ...relatedRows(sourceIndex, "reactivationAttempts", identifiers).map((record) => ({ record, lane:"reactivation" }))
  ];
  const replies = [
    ...relatedRows(sourceIndex, "outreachReplies", identifiers).map((record) => ({ record, lane:"outreach" })),
    ...relatedRows(sourceIndex, "reactivationReplies", identifiers).map((record) => ({ record, lane:"reactivation" }))
  ];
  const campaignIds = uniqueStrings(
    outreachContacts.flatMap((record) => [campaignIdFor(record), record.enrolled_campaigns]),
    reactivationContacts.map(campaignIdFor),
    attempts.map(({ record }) => campaignIdFor(record)),
    replies.map(({ record }) => campaignIdFor(record))
  );
  const campaigns = campaignIds.map((id) => campaignView(sourceIndex, id)).filter(Boolean);
  const sequenceActive = [...outreachContacts, ...reactivationContacts].some((record) => {
    const status = slug(record.sequence_status || record.sequenceStatus || record.enrollment_status || record.enrollmentStatus);
    return ["active", "enrolled", "staged", "scheduled", "in_progress"].includes(status) || Boolean(campaignIdFor(record));
  });
  const attemptViews = attempts.map(({ record, lane }) => ({
    id:recordId(record) || null,
    lane,
    status:slug(record.status || record.result) || "recorded",
    label:safeText(record.status || record.result, 80) || "Recorded",
    occurredAt:firstTimestamp(record, ["sent_at", "sentAt", "occurred_at", "occurredAt", "created_at", "createdAt"]),
    campaignId:campaignIdFor(record) || null
  })).sort((left, right) => timestampValue(right.occurredAt) - timestampValue(left.occurredAt));
  const replyViews = replies.map(({ record, lane }) => {
    const status = slug(record.classification || record.status || (record.requiresResponse ? "needs_response" : "received")) || "received";
    return {
      id:recordId(record) || null,
      lane,
      status,
      label:status === "needs_response" ? "Needs response" : status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
      occurredAt:firstTimestamp(record, ["replied_at", "repliedAt", "received_at", "receivedAt", "occurred_at", "occurredAt", "created_at", "createdAt"]),
      campaignId:campaignIdFor(record) || null,
      summary:context.canReadSensitive ? safeText(record.summary || record.snippet, 300) : null
    };
  }).sort((left, right) => timestampValue(right.occurredAt) - timestampValue(left.occurredAt));
  return { outreachContacts, reactivationContacts, campaigns, sequenceActive, attemptViews, replyViews };
}

const SUPPRESSION_DETAIL = Object.freeze({
  do_not_contact:"Marked do not contact.",
  replied:"A reply paused automated follow-up.",
  unsubscribed:"Contact unsubscribed.",
  bounced:"Email delivery failed.",
  existing_customer:"Existing relationships are excluded from automated prospecting.",
  manually_suppressed:"Excluded from automated outreach.",
  bad_domain:"The email is not eligible for automated outreach.",
  duplicate:"This is a duplicate contact."
});

function eligibilityFor(entity, primary, outreach, state) {
  const contactRecord = outreach.outreachContacts[0] || outreach.reactivationContacts[0]
    || entity.contacts.find((contact) => validEmail(contact.email)) || null;
  const email = validEmail(contactRecord?.email || contactRecord?.public_email || primary?.email);
  if (!email) return { ...RELATIONSHIP_ELIGIBILITY_STATES[3], detail:"No email is recorded." };
  const organization = entity.organizations[0] || entity.partner || {};
  const result = isSuppressed({ ...contactRecord, email }, { state, org:organization });
  if (!result.suppressed) return { ...RELATIONSHIP_ELIGIBILITY_STATES[0], detail:"No outreach exclusion is recorded." };
  const key = ["do_not_contact", "unsubscribed", "bounced", "manually_suppressed"].includes(result.reason) ? "suppressed" : "ineligible";
  const stateView = RELATIONSHIP_ELIGIBILITY_STATES.find((item) => item.key === key);
  return { ...stateView, detail:SUPPRESSION_DETAIL[result.reason] || "Not eligible for automated outreach." };
}

function resultFor(outreach) {
  const reply = outreach.replyViews[0];
  const attempt = outreach.attemptViews[0];
  if (reply && (!attempt || timestampValue(reply.occurredAt) >= timestampValue(attempt.occurredAt))) {
    return { key:"reply_received", label:"Reply received", at:reply.occurredAt };
  }
  return attempt ? { key:attempt.status, label:attempt.label, at:attempt.occurredAt } : null;
}

function interactionTimeline(entity, sourceIndex, identifiers, context, outreach) {
  const items = [];
  const add = (input) => {
    const occurredAt = validTimestamp(input.occurredAt);
    const id = clean(input.id);
    if (!id || !occurredAt) return;
    items.push({
      id,
      type:input.type,
      direction:input.direction || null,
      label:safeText(input.label, 120) || "Activity recorded",
      summary:safeText(input.summary, 400),
      occurredAt,
      href:input.href || null
    });
  };
  for (const attempt of outreach.attemptViews) add({ id:`attempt:${attempt.lane}:${attempt.id}`, type:"outreach", direction:"outbound", label:"Outreach recorded", summary:attempt.label, occurredAt:attempt.occurredAt, href:"#outreach" });
  for (const reply of outreach.replyViews) add({ id:`reply:${reply.lane}:${reply.id}`, type:"reply", direction:"inbound", label:"Reply received", summary:reply.summary, occurredAt:reply.occurredAt, href:"#outreach" });
  for (const signal of signalsFor(sourceIndex, identifiers)) {
    const kind = slug(signal.kind);
    const direction = kind === "went_quiet" ? "outbound" : "inbound";
    add({ id:`inbox:${recordId(signal)}`, type:"inbox", direction, label:kind === "went_quiet" ? "Follow-up is quiet" : "Inbox follow-up", summary:context.canReadSensitive ? signal.summary : null, occurredAt:signal.occurredAt || signal.updatedAt || signal.createdAt, href:"#inbox" });
  }
  for (const collection of ["activityEvents", "automationEvents", "companyEvents", "auditHistory"]) {
    for (const record of relatedRows(sourceIndex, collection, identifiers)) {
      const text = lower(record.eventType || record.event_type || record.type || record.action || record.title);
      const direction = /reply_received|inbound|responded/.test(text) ? "inbound" : /sent|outreach|outbound|manual.*sent/.test(text) ? "outbound" : null;
      const type = /meeting/.test(text) ? "meeting" : /note/.test(text) ? "note" : /stage|status/.test(text) ? "stage_change" : direction === "inbound" ? "reply" : direction === "outbound" ? "outreach" : "activity";
      add({
        id:`${collection}:${recordId(record)}`,
        type,
        direction,
        label:record.title || record.label || record.action || record.eventType || record.type || "Activity recorded",
        summary:context.canReadSensitive ? record.summary || record.note || record.description : null,
        occurredAt:record.occurredAt || record.occurred_at || record.createdAt || record.created_at || record.timestamp || record.updatedAt || record.updated_at
      });
    }
  }
  for (const history of list(entity.partner?.history)) {
    const text = lower(history.action || history.type || history.title);
    add({
      id:`partner-history:${clean(history.id) || clean(history.at || history.createdAt)}:${slug(text)}`,
      type:/meeting/.test(text) ? "meeting" : /note/.test(text) ? "note" : /stage|status/.test(text) ? "stage_change" : /reply/.test(text) ? "reply" : /outreach|sent/.test(text) ? "outreach" : "activity",
      direction:/reply|inbound/.test(text) ? "inbound" : /outreach|sent|outbound/.test(text) ? "outbound" : null,
      label:history.title || history.action || history.type || "Relationship updated",
      summary:context.canReadSensitive ? history.summary || history.note : null,
      occurredAt:history.at || history.createdAt || history.created_at || history.updatedAt || history.updated_at
    });
  }
  const unique = new Map();
  for (const item of items) if (!unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()].sort((left, right) => timestampValue(right.occurredAt) - timestampValue(left.occurredAt) || left.id.localeCompare(right.id, "en-US")).slice(0, 100);
}

function meetingsFor(sourceIndex, identifiers) {
  const meetings = [];
  for (const collection of ["meetingBriefs", "calendarSignals", "googleCalendarSignals"]) {
    for (const record of sourceIndex.get(collection)?.rows || []) {
      const attendees = [...list(record.attendees), ...list(record.known_attendees)];
      const attendeeMatch = attendees.some((attendee) => {
        const email = validEmail(attendee.email);
        const organization = lower(attendee.organization);
        return email && identifiers.emails.has(email) || organization && identifiers.names.has(organization);
      });
      if (!attendeeMatch && !recordMatchesEntity(record, identifiers, { allowOrganizationName:true })) continue;
      const id = recordId(record);
      if (!id) continue;
      const rawHref = clean(record.htmlLink || record.html_link || record.eventUrl || record.event_url);
      meetings.push({
        id,
        title:safeText(record.title || record.summary, 180) || "Meeting",
        startAt:validTimestamp(record.start_at || record.startAt || record.start?.dateTime || record.start?.date),
        endAt:validTimestamp(record.end_at || record.endAt || record.end?.dateTime || record.end?.date),
        status:safeText(record.status, 80),
        href:/^https:\/\//i.test(rawHref) ? rawHref : "#meetings"
      });
    }
  }
  return meetings.sort((left, right) => timestampValue(right.startAt) - timestampValue(left.startAt)).slice(0, 50);
}

function fileHref(collection, id) {
  const sourceKind = collection === "dataRoomItems" ? "data-room-item"
    : collection === "evidencePackNotes" ? "evidence-note"
      : collection === "partnerProgramArtifacts" ? "data-room-item" : "report";
  return buildExactObjectLink({ objectType:"File", sourceKind, sourceId:id })?.target
    || buildGenericItemLink({ collection, sourceId:id })?.target || "#files";
}

function filesFor(sourceIndex, identifiers) {
  const files = [];
  for (const collection of ["dataRoomItems", "partnerProgramArtifacts", "evidencePackNotes", "reports"]) {
    for (const record of relatedRows(sourceIndex, collection, identifiers, { allowOrganizationName:false })) {
      const id = recordId(record);
      if (!id) continue;
      files.push({
        id,
        title:safeText(record.title || record.name || record.reportTitle || record.evidenceTitle, 180) || "File",
        kind:collection === "reports" ? "Report" : "File",
        updatedAt:validTimestamp(record.updatedAt || record.updated_at || record.generatedAt || record.createdAt || record.created_at),
        href:fileHref(collection, id)
      });
    }
  }
  return files.sort((left, right) => timestampValue(right.updatedAt) - timestampValue(left.updatedAt)).slice(0, 50);
}

function notesFor(entity, sourceIndex, identifiers, context) {
  if (!context.canReadSensitive) return [];
  const notes = [];
  const add = (id, value, at = null) => {
    const summary = safeText(value?.summary || value?.text || value?.note || value, 500);
    if (!summary) return;
    notes.push({ id:clean(id) || `note:${notes.length + 1}`, summary, at:validTimestamp(at) });
  };
  list(entity.partner?.notes).forEach((note, index) => add(`partner-note:${index}`, note, note?.at || note?.createdAt));
  list(entity.partner?.relationshipNotes).forEach((note, index) => add(`partner-relationship-note:${index}`, note, note?.at || note?.createdAt));
  if (typeof entity.partner?.notes === "string") add("partner-note", entity.partner.notes, entity.partner.updatedAt);
  for (const record of relatedRows(sourceIndex, "evidencePackNotes", identifiers)) add(`evidence-note:${recordId(record)}`, record.notes || record.summary || record.text, record.updatedAt || record.createdAt);
  for (const record of relatedRows(sourceIndex, "activityEvents", identifiers).filter((item) => /note/i.test(clean(item.eventType || item.type || item.action)))) {
    add(`activity-note:${recordId(record)}`, record.note || record.summary || record.description, record.createdAt || record.occurredAt);
  }
  return notes.sort((left, right) => timestampValue(right.at) - timestampValue(left.at)).slice(0, 100);
}

function ownerFor(entity) {
  const sources = [entity.partner, ...entity.sources.map((source) => source.record)].filter(Boolean);
  return sources.map((record) => safeText(record.owner || record.assignedTo || record.assigned_to || record.internalOwner || record.internal_owner, 100)).find(Boolean) || null;
}

function summaryFor(entity) {
  const sources = [entity.partner, ...entity.sources.map((source) => source.record)].filter(Boolean);
  return sources.map((record) => safeText(record.relationshipSummary || record.relationship_summary || record.summary
    || record.opportunity || record.programOpportunity || record.fitReason || record.fit_reason || record.storyAngle || record.story_angle, 320)).find(Boolean) || null;
}

function entityProjection(entity, state, sourceIndex, context, now) {
  const identifiers = entityIdentifiers(entity);
  const tasks = openTasksFor(entity, sourceIndex, identifiers);
  const signals = signalsFor(sourceIndex, identifiers);
  const primary = primaryContact(entity, context);
  const outreach = outreachContext(entity, sourceIndex, identifiers, context);
  const timeline = interactionTimeline(entity, sourceIndex, identifiers, context, outreach);
  const nextAction = nextActionFor(entity, tasks, signals);
  const waiting = waitingState(tasks, signals, entity);
  const lastInboundAt = newestTimestamp(timeline.filter((item) => item.direction === "inbound").map((item) => item.occurredAt));
  const lastOutboundAt = newestTimestamp(timeline.filter((item) => item.direction === "outbound").map((item) => item.occurredAt));
  const eligibility = eligibilityFor(entity, primary, outreach, state);
  const partnerHref = entity.partnerId ? buildExactObjectLink({ objectType:"Partner", sourceKind:"partner", sourceId:entity.partnerId })?.target : null;
  return {
    id:entity.id,
    name:entityName(entity),
    organization:entityOrganization(entity),
    summary:summaryFor(entity),
    category:categoryFor(entity),
    primaryContact:primary?.name || null,
    email:primary?.email || null,
    stage:stageFor(entity),
    owner:ownerFor(entity),
    lastInboundAt,
    lastOutboundAt,
    nextAction:nextAction.summary,
    nextFollowUpAt:nextAction.dueAt,
    followUpDue:Boolean(nextAction.dueAt && timestampValue(nextAction.dueAt) <= timestampValue(now)),
    openTaskCount:tasks.length,
    campaign:outreach.campaigns[0] || null,
    result:resultFor(outreach),
    replyState:outreach.replyViews[0] ? { key:outreach.replyViews[0].status, label:outreach.replyViews[0].label, at:outreach.replyViews[0].occurredAt } : null,
    eligibility,
    waitingState:waiting,
    automatedOutreach:outreach.sequenceActive,
    href:partnerHref || `#partners/relationship/${encodeURIComponent(entity.id)}`,
    partnerId:entity.partnerId,
    _detail:{ entity, identifiers, tasks, signals, outreach, timeline, primary }
  };
}

function publicItem(item) {
  const { _detail, ...visible } = item;
  return {
    ...visible,
    // Compatibility aliases keep the global drawer and list projections on one payload
    // while callers migrate from the older Partner naming convention.
    organizationName:visible.organization,
    categoryLabel:visible.category?.label || null,
    stageLabel:visible.stage?.label || null,
    nextFollowUpDate:visible.nextFollowUpAt,
    replyStateLabel:visible.replyState?.label || null,
    eligibilityStatus:visible.eligibility?.label || null,
    fullRecordHref:visible.href
  };
}

function optionCounts(items, field) {
  const values = new Map();
  for (const item of items) {
    const value = field(item);
    if (!value?.key) continue;
    const current = values.get(value.key) || { key:value.key, label:value.label, count:0 };
    current.count += 1;
    values.set(value.key, current);
  }
  return [...values.values()].sort((left, right) => left.label.localeCompare(right.label, "en-US"));
}

function normalizedQuery(query = {}) {
  const search = clean(query.search).slice(0, 120);
  const automationRaw = lower(query.automation);
  return {
    search,
    category:slug(query.category),
    stage:slug(query.stage),
    followUp:[true, "true", "due", "yes"].includes(query.followUp) ? "due" : slug(query.followUp),
    waiting:slug(query.waiting),
    automation:["automated", "yes", "true", "active"].includes(automationRaw) ? "automated" : ["manual", "no", "false", "none"].includes(automationRaw) ? "manual" : "",
    eligibility:slug(query.eligibility),
    owner:lower(query.owner),
    offset:Number.isInteger(Number(query.offset)) && Number(query.offset) >= 0 ? Number(query.offset) : 0,
    limit:Number.isInteger(Number(query.limit)) && Number(query.limit) > 0 ? Math.min(100, Number(query.limit)) : 50
  };
}

function itemMatches(item, query, context) {
  if (query.search) {
    const haystack = lower([
      item.name, item.organization, item.category.label, item.primaryContact, context.canReadSensitive ? item.email : null,
      item.stage.label, item.owner, item.nextAction, item.campaign?.name, item.result?.label
    ].filter(Boolean).join(" "));
    if (!haystack.includes(lower(query.search))) return false;
  }
  if (query.category && item.category.key !== query.category) return false;
  if (query.stage && item.stage.key !== query.stage) return false;
  if (query.followUp === "due" && !item.followUpDue) return false;
  if (query.waiting && item.waitingState.key !== query.waiting) return false;
  if (query.automation === "automated" && !item.automatedOutreach) return false;
  if (query.automation === "manual" && item.automatedOutreach) return false;
  if (query.eligibility && item.eligibility.key !== query.eligibility) return false;
  if (query.owner && lower(item.owner) !== query.owner) return false;
  return true;
}

function sortedItems(items) {
  return [...items].sort((left, right) => Number(right.followUpDue) - Number(left.followUpDue)
    || timestampValue(left.nextFollowUpAt) - timestampValue(right.nextFollowUpAt)
    || left.name.localeCompare(right.name, "en-US")
    || left.id.localeCompare(right.id, "en-US"));
}

function projectionBundle(state, actor, now) {
  const context = actorContext(actor);
  if (!context.authorized) return { context, available:false, availability:{ state:"not_authorized", reason:"read_access_required" }, projected:[], graph:null };
  const sourceAvailable = RELATIONSHIP_SOURCE_COLLECTIONS.some((collection) => Array.isArray(state[collection]));
  if (!sourceAvailable) return { context, available:false, availability:{ state:"unavailable", reason:"relationship_data_absent" }, projected:[], graph:null };
  const graph = buildEntityGraph(state, context, now);
  const projected = graph.entities.map((entity) => entityProjection(entity, state, graph.sourceIndex, context, now));
  return {
    context,
    available:true,
    availability:{ state:projected.length ? "available" : "empty", reason:null },
    projected,
    graph
  };
}

export function buildRelationshipsView(state = {}, actor = {}, now = "", rawQuery = {}) {
  const generatedAt = validTimestamp(now);
  const bundle = projectionBundle(state, actor, generatedAt || new Date(0).toISOString());
  const query = normalizedQuery(rawQuery);
  if (!bundle.available) return deepFreeze({
    available:false,
    generatedAt:generatedAt || null,
    availability:bundle.availability,
    items:[],
    summary:{ totalRelationships:0, matchingRelationships:0, followUpsDue:0, waitingOnThem:0, waitingOnRoger:0, automatedOutreach:0, suppressedOrIneligible:0 },
    filters:{ categories:[], stages:[], owners:[], waitingStates:[], eligibility:[] },
    query,
    pagination:{ offset:query.offset, limit:query.limit, returned:0, hasMore:false },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0, sensitiveContentAuthorized:false }
  });
  const allItems = sortedItems(bundle.projected);
  const filtered = allItems.filter((item) => itemMatches(item, query, bundle.context));
  const page = filtered.slice(query.offset, query.offset + query.limit).map(publicItem);
  const owners = [...new Set(allItems.map((item) => item.owner).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en-US"))
    .map((label) => ({ key:lower(label), label, count:allItems.filter((item) => lower(item.owner) === lower(label)).length }));
  const availability = filtered.length ? bundle.availability : { state:allItems.length ? "filtered_empty" : "empty", reason:null };
  return deepFreeze({
    available:true,
    generatedAt,
    availability,
    items:page,
    summary:{
      totalRelationships:allItems.length,
      matchingRelationships:filtered.length,
      followUpsDue:allItems.filter((item) => item.followUpDue).length,
      waitingOnThem:allItems.filter((item) => item.waitingState.key === "on_them").length,
      waitingOnRoger:allItems.filter((item) => item.waitingState.key === "on_roger").length,
      automatedOutreach:allItems.filter((item) => item.automatedOutreach).length,
      suppressedOrIneligible:allItems.filter((item) => ["suppressed", "ineligible"].includes(item.eligibility.key)).length
    },
    filters:{
      categories:optionCounts(allItems, (item) => item.category),
      stages:optionCounts(allItems, (item) => item.stage),
      owners,
      waitingStates:optionCounts(allItems, (item) => item.waitingState),
      eligibility:optionCounts(allItems, (item) => item.eligibility)
    },
    query,
    pagination:{ offset:query.offset, limit:query.limit, returned:page.length, hasMore:query.offset + page.length < filtered.length },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0, sensitiveContentAuthorized:bundle.context.canReadSensitive }
  });
}

export function buildRelationshipDetail(state = {}, actor = {}, relationshipId = "", now = "") {
  const generatedAt = validTimestamp(now);
  const id = clean(relationshipId).slice(0, 320);
  const bundle = projectionBundle(state, actor, generatedAt || new Date(0).toISOString());
  if (!bundle.available) return deepFreeze({
    available:false,
    generatedAt:generatedAt || null,
    relationshipId:id || null,
    availability:bundle.availability,
    safety:{ fullStateReturned:false, mutations:0, externalActions:0, sensitiveContentAuthorized:false }
  });
  const projection = bundle.projected.find((item) => item.id === id);
  if (!projection) return deepFreeze({
    available:false,
    generatedAt,
    relationshipId:id || null,
    availability:{ state:"not_found_or_unauthorized", reason:null },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0, sensitiveContentAuthorized:bundle.context.canReadSensitive }
  });
  const detail = projection._detail;
  const organization = projection.organization;
  const contacts = [...detail.entity.contacts]
    .sort((left, right) => Number(right.primary === true) - Number(left.primary === true) || clean(left.name).localeCompare(clean(right.name), "en-US"))
    .map((contact, index) => contactView(contact, bundle.context, organization, index === 0 || contact.primary === true));
  const meetings = meetingsFor(bundle.graph.sourceIndex, detail.identifiers);
  const files = filesFor(bundle.graph.sourceIndex, detail.identifiers);
  const notes = notesFor(detail.entity, bundle.graph.sourceIndex, detail.identifiers, bundle.context);
  return deepFreeze({
    available:true,
    generatedAt,
    relationshipId:id,
    availability:{ state:"available", reason:null },
    relationship:publicItem(projection),
    contacts,
    timeline:detail.timeline,
    tasks:detail.tasks,
    outreach:{
      available:Boolean(detail.outreach.campaigns.length || detail.outreach.attemptViews.length || detail.outreach.replyViews.length || detail.outreach.sequenceActive),
      automated:detail.outreach.sequenceActive,
      campaigns:detail.outreach.campaigns,
      attempts:detail.outreach.attemptViews,
      replies:detail.outreach.replyViews,
      eligibility:projection.eligibility
    },
    meetings,
    notes,
    files,
    links:{
      primary:projection.href,
      partner:projection.partnerId ? buildExactObjectLink({ objectType:"Partner", sourceKind:"partner", sourceId:projection.partnerId })?.target || null : null,
      outreach:"#outreach",
      inbox:"#inbox",
      calendar:"#meetings",
      files:"#files"
    },
    capabilities:{
      draftFollowUp:roleHasCapability(bundle.context.role, "manage_content_drafts") || roleHasCapability(bundle.context.role, "add_notes"),
      setNextAction:roleHasCapability(bundle.context.role, "manage_tasks"),
      addTask:roleHasCapability(bundle.context.role, "manage_tasks"),
      addNote:roleHasCapability(bundle.context.role, "add_notes"),
      editContact:roleHasCapability(bundle.context.role, "manage_growth")
    },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0, sensitiveContentAuthorized:bundle.context.canReadSensitive }
  });
}
