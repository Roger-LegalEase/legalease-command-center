import { recordVisibleToActor } from "../../global-search-service.mjs";
import { roleHasCapability, roles } from "../../roles.mjs";
import { buildExactObjectLink } from "../route-compatibility.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

export const CAMPAIGN_SOURCE_MAPPINGS = Object.freeze({
  canonical: Object.freeze({
    collection: "campaigns",
    sourceKind: "campaign",
    relationship: "record",
    exactLink: "#outreach/campaign/<id>"
  }),
  partnerOutreach: Object.freeze({
    collection: "outreachCampaigns",
    sourceKind: "partner-outreach-campaign",
    relationship: "record",
    exactLink: "#campaigns"
  }),
  reactivation: Object.freeze({
    collection: "reactivationCampaign",
    sourceKind: "reactivation-campaign",
    relationship: "record",
    exactLink: "#campaigns",
    adapterIdentityPrefix: "reactivation"
  }),
  partnerRelationships: Object.freeze({
    contacts: "outreachContacts",
    sequence: "outreachSequenceSteps",
    attempts: "outreachAttempts",
    replies: "outreachReplies",
    suppressions: "outreachSuppressions",
    unsubscribes: "outreachUnsubscribes",
    bounces: "outreachBounces",
    approvals: "approvalQueue"
  }),
  reactivationRelationships: Object.freeze({
    contacts: "reactivationContacts",
    attempts: "reactivationAttempts",
    events: "reactivationEvents",
    claims: "reactivationSendClaims",
    queue: "queueItems",
    approvals: "approvals"
  }),
  canonicalRelationships: Object.freeze({
    queue: "queueItems",
    approvals: "approvals",
    activity: Object.freeze(["activityEvents", "auditHistory"])
  })
});

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function recordId(record = {}) {
  return clean(record.id || record.campaign_id || record.campaignId || record.contact_id || record.key || record.slug);
}

function stableRecords(value = []) {
  return [...list(value)].sort((left, right) =>
    recordId(left).localeCompare(recordId(right), "en-US")
    || clean(left?.step_number || left?.stepNumber).localeCompare(clean(right?.step_number || right?.stepNumber), "en-US", { numeric: true })
    || clean(left?.updatedAt || left?.updated_at || left?.createdAt || left?.created_at)
      .localeCompare(clean(right?.updatedAt || right?.updated_at || right?.createdAt || right?.created_at), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
}

function values(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
}

function campaignIds(record = {}) {
  return [...new Set([
    record.campaign_id,
    record.campaignId,
    record.sourceCampaignId,
    ...values(record.campaign_ids),
    ...values(record.campaignIds),
    ...values(record.enrolled_campaigns),
    ...values(record.enrolledCampaigns)
  ].map(clean).filter(Boolean))];
}

function refMatches(record = {}, collection = "", sourceId = "") {
  const ref = record.sourceRef || record.source_ref || record.relatedObject || {};
  return clean(ref.collection || ref.sourceCollection) === collection
    && clean(ref.itemId || ref.sourceId || ref.id) === sourceId;
}

function directCampaignMatch(record = {}, campaignId = "") {
  return campaignIds(record).includes(campaignId);
}

function visibleRecords(value, role) {
  return stableRecords(value).filter((record) => recordVisibleToActor(record, role));
}

function allowedActor(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true
    && roles.includes(role)
    && roleHasCapability(role, "read_internal")
    ? role
    : "";
}

function canonicalHref(sourceId) {
  return buildExactObjectLink({ objectType: "Campaign", sourceKind: "campaign", sourceId })?.target || "";
}

function canonicalOutreachTruth(record = {}) {
  const type = lower(record.campaignType || record.campaign_type || record.type);
  const sourceKind = lower(record.sourceKind || record.source_kind || record.domain || record.workspace);
  if (/social|post|content/.test(sourceKind)) return false;
  if (/^(?:social|social_post|post|content|content_campaign)$/.test(type)) return false;
  return true;
}

function collectionAvailability(state, names) {
  return Object.fromEntries(names.map((name) => [name, Array.isArray(state[name])]));
}

function queueApprovalContext(state, role, collection, sourceId) {
  const queueItems = visibleRecords(state.queueItems, role)
    .filter((item) => refMatches(item, collection, sourceId));
  const queueIds = new Set(queueItems.map(recordId).filter(Boolean));
  const approvals = visibleRecords(state.approvals, role)
    .filter((approval) =>
      refMatches(approval, collection, sourceId)
      || queueIds.has(clean(approval.queue_item_id || approval.queueItemId || approval.sourceId))
    );
  return { queueItems, approvals };
}

function canonicalActivity(state, role, sourceId) {
  const collections = CAMPAIGN_SOURCE_MAPPINGS.canonicalRelationships.activity;
  return collections.flatMap((collection) => visibleRecords(state[collection], role)
    .filter((event) =>
      refMatches(event, "campaigns", sourceId)
      || (/(?:^|[_-])campaign(?:s)?(?:$|[_-])/.test(lower(event.type || event.sourceType || event.resourceType || event.objectType))
        && [event.resourceId, event.relatedObjectId, event.objectId, event.sourceId].map(clean).includes(sourceId))
    )
    .map((record) => ({ collection, record }))
  );
}

function canonicalContexts(state, role) {
  const seen = new Set();
  return visibleRecords(state.campaigns, role)
    .filter(canonicalOutreachTruth)
    .filter((record) => {
      const id = recordId(record);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((record) => {
      const sourceId = recordId(record);
      const approvals = queueApprovalContext(state, role, "campaigns", sourceId);
      return {
        kind: "canonical",
        sourceCollection: "campaigns",
        sourceKind: "campaign",
        sourceId,
        stableIdentity: `campaign:${sourceId}`,
        href: canonicalHref(sourceId),
        record,
        queueItems: approvals.queueItems,
        approvals: approvals.approvals,
        activity: canonicalActivity(state, role, sourceId),
        availability: collectionAvailability(state, ["queueItems", "approvals", "activityEvents", "auditHistory"])
      };
    });
}

function partnerContexts(state, role) {
  const seen = new Set();
  return visibleRecords(state.outreachCampaigns, role)
    .filter((record) => {
      const id = recordId(record);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((record) => {
      const sourceId = recordId(record);
      const contacts = visibleRecords(state.outreachContacts, role).filter((item) => directCampaignMatch(item, sourceId));
      const contactIds = new Set(contacts.map(recordId).filter(Boolean));
      const related = (name) => visibleRecords(state[name], role).filter((item) =>
        directCampaignMatch(item, sourceId) || contactIds.has(clean(item.contact_id || item.contactId))
      );
      const approvals = visibleRecords(state.approvalQueue, role).filter((item) =>
        lower(item.type || item.sourceType) === "outreach_message" && directCampaignMatch(item, sourceId)
      );
      return {
        kind: "partnerOutreach",
        sourceCollection: "outreachCampaigns",
        sourceKind: "partner-outreach-campaign",
        sourceId,
        stableIdentity: `outreach:${sourceId}`,
        href: "#campaigns",
        record,
        contacts,
        sequenceSteps: visibleRecords(state.outreachSequenceSteps, role).filter((item) => directCampaignMatch(item, sourceId)),
        attempts: related("outreachAttempts"),
        replies: related("outreachReplies"),
        suppressions: related("outreachSuppressions"),
        unsubscribes: related("outreachUnsubscribes"),
        bounces: related("outreachBounces"),
        approvals,
        availability: collectionAvailability(state, [
          "outreachContacts", "outreachSequenceSteps", "outreachAttempts", "outreachReplies",
          "outreachSuppressions", "outreachUnsubscribes", "outreachBounces", "approvalQueue"
        ])
      };
    });
}

function reactivationContext(state, role) {
  const record = state.reactivationCampaign;
  if (!record || typeof record !== "object" || Array.isArray(record) || !Object.keys(record).length) return [];
  if (!recordVisibleToActor(record, role)) return [];
  const sourceId = recordId(record) || "mvp-reactivation";
  const contacts = visibleRecords(state.reactivationContacts, role).filter((item) => {
    const ids = campaignIds(item);
    return ids.length ? ids.includes(sourceId) : sourceId === "mvp-reactivation";
  });
  const contactIds = new Set(contacts.map(recordId).filter(Boolean));
  const related = (name) => visibleRecords(state[name], role).filter((item) => {
    const ids = campaignIds(item);
    const contactId = clean(item.contact_id || item.contactId);
    return ids.includes(sourceId) || contactIds.has(contactId) || (!ids.length && !contactId && sourceId === "mvp-reactivation");
  });
  const approvalContext = queueApprovalContext(state, role, "reactivationCampaign", sourceId);
  return [{
    kind: "reactivation",
    sourceCollection: "reactivationCampaign",
    sourceKind: "reactivation-campaign",
    sourceId,
    stableIdentity: `reactivation:${sourceId}`,
    href: "#campaigns",
    record,
    contacts,
    attempts: related("reactivationAttempts"),
    events: related("reactivationEvents"),
    claims: related("reactivationSendClaims"),
    queueItems: approvalContext.queueItems,
    approvals: approvalContext.approvals,
    availability: collectionAvailability(state, [
      "reactivationContacts", "reactivationAttempts", "reactivationEvents",
      "reactivationSendClaims", "queueItems", "approvals"
    ])
  }];
}

export function collectCampaignSourceContexts(state = {}, actor = {}) {
  const role = allowedActor(actor);
  if (!role) return [];
  return [
    ...canonicalContexts(state, role),
    ...partnerContexts(state, role),
    ...reactivationContext(state, role)
  ].sort((left, right) => left.stableIdentity.localeCompare(right.stableIdentity, "en-US"));
}
