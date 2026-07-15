import { buildDailyRunSnapshot } from "./daily-run-session.mjs";

export const dailyRunQuickCaptureTypes = [
  "partner_followup",
  "social_post",
  "report_task",
  "proof_to_content_task",
  "channel_review",
  "rcap_task"
];

const typeLabels = {
  partner_followup: "Partner Follow-up",
  social_post: "Social Post",
  report_task: "Report Task",
  proof_to_content_task: "Proof-to-Content Task",
  channel_review: "Channel Review",
  rcap_task: "RCAP Task / Placeholder"
};

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function asText(value = "") {
  return String(value ?? "").trim();
}

function slug(value = "") {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "item";
}

function normalizeType(value = "") {
  const type = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return dailyRunQuickCaptureTypes.includes(type) ? type : "partner_followup";
}

function baseItem(input = {}, options = {}) {
  const timestamp = isoNow(options);
  const type = normalizeType(input.type || input.quickCaptureType || input.capture_type);
  const title = asText(input.title || input.description || input.raw_input || input.rawInput) || typeLabels[type];
  return {
    id: input.id || `quick-capture-${Date.parse(timestamp) || Date.now()}-${slug(type)}-${slug(title)}`,
    quickCaptureType: type,
    title,
    priority: asText(input.priority) || "medium",
    notes: asText(input.notes),
    related: asText(input.related || input.relatedSource || input.relatedCampaign || input.relatedPartner),
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceType: "quick_capture",
    sourceReference: "Daily Run Quick Capture",
    externalSideEffects: false
  };
}

function itemForInput(input = {}, options = {}) {
  const timestamp = isoNow(options);
  const base = baseItem(input, options);
  const dueDate = asText(input.dueDate || input.due_date);
  if (base.quickCaptureType === "social_post") {
    return {
      collection: "posts",
      item: {
        ...base,
        platform: asText(input.platform) || "linkedin",
        targetChannels: [asText(input.platform) || "linkedin"],
        status: "draft",
        caption: asText(input.caption || input.description || input.notes || base.title),
        body: asText(input.caption || input.description || input.notes || base.title),
        campaign: asText(input.campaign || input.relatedCampaign || input.related),
        dueDate,
        sourceTitle: "Quick Capture",
        copyReviewed: false
      }
    };
  }
  if (base.quickCaptureType === "report_task") {
    return {
      collection: "reports",
      item: {
        ...base,
        reportTitle: base.title,
        type: "report",
        status: "needs_review",
        nextAction: "Review report task captured during Daily Run.",
        dueDate
      }
    };
  }
  if (base.quickCaptureType === "proof_to_content_task") {
    return {
      collection: "evidencePackNotes",
      item: {
        ...base,
        key: base.id,
        type: "proof_to_content",
        status: "needs_review",
        summary: base.notes || base.title,
        dueDate
      }
    };
  }
  if (base.quickCaptureType === "rcap_task") {
    return {
      collection: "reviewStates",
      item: {
        ...base,
        artifact: base.title,
        review_state: "waiting",
        status: "waiting",
        next_required_action: base.notes || "Review RCAP connection placeholder.",
        dueDate
      }
    };
  }
  const category = base.quickCaptureType === "channel_review" ? "Channel Review" : "Partner Follow-up";
  return {
    collection: "tasks",
    item: {
      ...base,
      category,
      description: base.notes || base.title,
      status: "open",
      owner: "Roger",
      dueDate,
      due_date: dueDate,
      source: "quick_capture",
      linked_partner: asText(input.relatedPartner || input.related),
      linked_workflow: category,
      nextAction: base.quickCaptureType === "channel_review" ? "Review channel readiness." : "Prepare partner follow-up."
    }
  };
}

function upsert(collection = [], item = {}) {
  return [item, ...list(collection).filter(existing => existing.id !== item.id)].slice(0, 500);
}

function surfacingFor(state = {}, itemId = "", options = {}) {
  const snapshot = buildDailyRunSnapshot(state, options);
  for (const bucket of list(snapshot.buckets)) {
    if (list(bucket.items).some(item => item.id === itemId)) return bucket;
  }
  return null;
}

export function createDailyRunQuickCapture(state = {}, input = {}, options = {}) {
  const { collection, item } = itemForInput(input, options);
  const nextState = {
    ...state,
    [collection]: upsert(state[collection], item),
    auditHistory: [{
      id: `audit-${item.id}-quick-capture`,
      timestamp: isoNow(options),
      actor: options.actor || "owner",
      action: "daily run quick capture saved",
      resourceType: collection,
      resourceId: item.id,
      afterValue: { quickCaptureType: item.quickCaptureType, externalSideEffects: false }
    }, ...list(state.auditHistory)],
    activityEvents: [{
      id: `activity-${item.id}-quick-capture`,
      eventType: "Daily Run Quick Capture saved",
      title: item.title,
      relatedObjectType: collection,
      relatedObjectId: item.id,
      riskLevel: "low",
      metadata: { quickCaptureType: item.quickCaptureType, externalSideEffects: false, noExternalSystemsContacted: true },
      createdAt: isoNow(options)
    }, ...list(state.activityEvents)].slice(0, 500)
  };
  const bucket = surfacingFor(nextState, item.id, options);
  const message = bucket
    ? `Captured. It will surface in ${bucket.label}.`
    : `Captured. Added to ${typeLabels[item.quickCaptureType] || "Quick Capture"}.`;
  return { state: nextState, item, collection, surfacingBucket: bucket, message };
}
