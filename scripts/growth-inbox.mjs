import crypto from "node:crypto";

const sourceTypeRules = [
  ["compliance_concern", /\b(compliance|legal advice|guarantee|guaranteed|eligib|court|attorney|privacy|complaint|risk|claim)\b/i],
  ["customer_support_issue", /\b(customer|support|refund|payment issue|login|bug|court rejected|document error|confused|complaint)\b/i],
  ["investor_note", /\b(investor|fundraise|raise|runway|acquirer|diligence|deck|data room|term sheet)\b/i],
  ["revenue_pipeline_update", /\b(revenue|paid|payment|stripe|pipeline|deal value|contract|pricing|invoice|budget)\b/i],
  ["pilot_update", /\b(pilot|scope|mou|decision date|success metric|launch checklist)\b/i],
  ["partner_update", /\b(partner|nonprofit|county|government|workforce|goodwill|timedone|clean slate|we must vote|fulton|harris)\b/i],
  ["campaign_idea", /\b(campaign|launch|utm|landing page|distribution|referral|newsletter|webinar)\b/i],
  ["content_idea", /\b(post|content|linkedin|thread|caption|story|idea|wilma|recordshield)\b/i],
  ["meeting_notes", /\b(meeting|call|notes|follow-up|follow up|agenda|recap)\b/i]
];

const destinationBySourceType = {
  compliance_concern: "support_issue",
  customer_support_issue: "support_issue",
  investor_note: "evidence_pack_note",
  revenue_pipeline_update: "task",
  pilot_update: "pilot_update",
  partner_update: "partner_update",
  campaign_idea: "campaign_update",
  content_idea: "content_idea",
  meeting_notes: "task"
};

function nowIso() {
  return new Date().toISOString();
}

function clean(value = "") {
  return String(value || "").trim();
}

function compact(value = "", max = 180) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function firstMatch(text = "", fallback = "meeting_notes") {
  for (const [sourceType, pattern] of sourceTypeRules) {
    if (pattern.test(text)) return sourceType;
  }
  return fallback;
}

function detectRisk(text = "", sourceType = "") {
  if (/\b(guarantee|guaranteed|legal advice|court will|eligible|you qualify|will clear|privacy breach|lawsuit|subpoena|complaint)\b/i.test(text)) return "high";
  if (sourceType === "compliance_concern" || sourceType === "customer_support_issue") return "medium";
  if (/\b(attorney|criminal record|filing|refund|payment|sensitive|pii)\b/i.test(text)) return "medium";
  return "low";
}

function detectPriority(text = "", riskLevel = "low", sourceType = "") {
  if (riskLevel === "high" || /\b(urgent|today|tomorrow|next week|follow-up|follow up|blocked|deadline|investor|customer complaint|legal|security)\b/i.test(text)) return "high";
  if (["investor_note", "revenue_pipeline_update", "pilot_update", "partner_update"].includes(sourceType)) return "medium";
  return "normal";
}

function suggestedActionFor(sourceType = "meeting_notes", riskLevel = "low") {
  if (riskLevel === "high") return "Review risk, route to the right owner, and do not externalize until approved.";
  const actions = {
    meeting_notes: "Extract the next owner, due date, and follow-up task.",
    partner_update: "Update the partner record and create the next follow-up.",
    investor_note: "Add the signal to the evidence pack or investor update backlog.",
    customer_support_issue: "Create a support issue and flag any legal/compliance sensitivity.",
    content_idea: "Turn this into a Content Bank idea for approval-first drafting.",
    campaign_idea: "Update or create the related campaign and define the next launch step.",
    pilot_update: "Update the pilot record and confirm decision date or success metric.",
    revenue_pipeline_update: "Create a revenue or pipeline task and tag the related partner/deal.",
    compliance_concern: "Create a support/compliance issue and route for human review."
  };
  return actions[sourceType] || actions.meeting_notes;
}

export function classifyGrowthInboxText(rawText = "") {
  const text = clean(rawText);
  const sourceType = firstMatch(text);
  const riskLevel = detectRisk(text, sourceType);
  const priority = detectPriority(text, riskLevel, sourceType);
  const suggestedDestination = destinationBySourceType[sourceType] || "task";
  return {
    sourceType,
    riskLevel,
    priority,
    summary: compact(text, 220),
    suggestedAction: suggestedActionFor(sourceType, riskLevel),
    suggestedDestination,
    triageMode: "rule_assisted"
  };
}

export function normalizeGrowthInboxItem(input = {}, options = {}) {
  const rawText = clean(input.rawText || input.text || input.note || "");
  if (!rawText) throw new Error("Growth Inbox item needs raw text.");
  const now = options.now || nowIso();
  const classification = classifyGrowthInboxText(rawText);
  const sourceType = clean(input.sourceType) || (clean(input.relatedPartner) ? "partner_update" : classification.sourceType);
  const riskLevel = clean(input.riskLevel) || classification.riskLevel;
  const priority = clean(input.priority) || classification.priority;
  return {
    id: input.id || `growth-inbox-${crypto.randomUUID().slice(0, 8)}`,
    rawText,
    summary: clean(input.summary) || classification.summary,
    sourceType,
    priority,
    relatedPartner: clean(input.relatedPartner),
    relatedCampaign: clean(input.relatedCampaign),
    relatedPilot: clean(input.relatedPilot),
    riskLevel,
    suggestedAction: clean(input.suggestedAction) || suggestedActionFor(sourceType, riskLevel),
    suggestedDestination: clean(input.suggestedDestination) || destinationBySourceType[sourceType] || classification.suggestedDestination,
    aiTriage: input.aiTriage || null,
    status: input.status || "new",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    history: [
      ...(Array.isArray(input.history) ? input.history : []),
      { action: "created", at: now, note: "Growth Inbox item created." }
    ]
  };
}

export function triageGrowthInboxItem(item = {}, patch = {}, options = {}) {
  const now = options.now || nowIso();
  const classification = classifyGrowthInboxText([item.rawText, patch.rawText].filter(Boolean).join("\n"));
  return {
    ...item,
    summary: clean(patch.summary) || item.summary || classification.summary,
    sourceType: clean(patch.sourceType) || item.sourceType || classification.sourceType,
    priority: clean(patch.priority) || item.priority || classification.priority,
    riskLevel: clean(patch.riskLevel) || item.riskLevel || classification.riskLevel,
    suggestedAction: clean(patch.suggestedAction) || item.suggestedAction || classification.suggestedAction,
    suggestedDestination: clean(patch.suggestedDestination) || item.suggestedDestination || classification.suggestedDestination,
    aiTriage: patch.aiTriage || item.aiTriage || { mode: classification.triageMode, generatedAt: now },
    status: "triaged",
    updatedAt: now,
    history: [
      { action: "triaged", at: now, note: "Draft triage updated." },
      ...(item.history || [])
    ].slice(0, 30)
  };
}

function conversionRecord(item = {}, destination = "task", options = {}) {
  const now = options.now || nowIso();
  const title = compact(item.summary || item.rawText || "Growth Inbox item", 90);
  const base = {
    sourceId: item.id,
    createdAt: now,
    updatedAt: now,
    notes: `Created from Growth Inbox: ${compact(item.rawText, 320)}`
  };
  if (destination === "task") {
    return {
      collection: "tasks",
      record: {
        id: `task-${item.id}`,
        title,
        description: item.suggestedAction || item.summary || "",
        owner: "Roger",
        priority: item.priority || "normal",
        status: "open",
        riskLevel: item.riskLevel || "low",
        relatedPartner: item.relatedPartner || "",
        relatedCampaign: item.relatedCampaign || "",
        relatedPilot: item.relatedPilot || "",
        nextBestAction: item.suggestedAction || "Review task",
        ...base
      }
    };
  }
  if (destination === "content_idea") {
    return {
      collection: "contentBank",
      record: {
        id: `idea-${item.id}`,
        title,
        rawIdea: item.rawText,
        bucket: "LegalEase Growth",
        audience: item.sourceType === "investor_note" ? "investor" : "partners",
        platforms: ["linkedin"],
        campaign: item.relatedCampaign || "",
        cta: "Learn more",
        creativeDirection: "Create a clean, text-free LegalEase visual that supports the idea without overclaiming.",
        usesWilma: item.riskLevel === "high" ? "optional" : "no",
        complianceRisk: item.riskLevel === "high" ? "high" : item.riskLevel === "medium" ? "medium" : "low",
        priority: item.priority || "normal",
        status: "idea",
        nextBestAction: "Generate draft when ready",
        ...base
      }
    };
  }
  if (destination === "partner_update") {
    return {
      collection: "partners",
      record: {
        id: `partner-update-${item.id}`,
        organizationName: item.relatedPartner || title,
        status: "needs_follow_up",
        owner: "Roger",
        priority: item.priority === "high" ? "High" : "Normal",
        nextAction: item.suggestedAction || "Follow up",
        notes: item.rawText,
        lastTouchDate: now.slice(0, 10),
        ...base
      }
    };
  }
  if (destination === "campaign_update") {
    return {
      collection: "campaigns",
      record: {
        id: `campaign-update-${item.id}`,
        campaignName: item.relatedCampaign || title,
        status: "draft",
        owner: "Growth",
        complianceStatus: item.riskLevel === "high" ? "needs_review" : "not_required",
        nextAction: item.suggestedAction || "Define campaign next step",
        notes: item.rawText,
        ...base
      }
    };
  }
  if (destination === "support_issue") {
    return {
      collection: "supportIssues",
      record: {
        id: `support-${item.id}`,
        title,
        source: "growth_inbox",
        category: item.sourceType === "compliance_concern" ? "legal advice risk" : "partner question",
        severity: item.riskLevel === "high" ? "High" : "Medium",
        riskLevel: item.riskLevel || "medium",
        legalSensitivity: item.riskLevel === "high" ? "human_review_required" : "review",
        summary: item.summary || item.rawText,
        recommendedFix: item.suggestedAction || "Review support issue",
        status: "open",
        history: [{ action: "created_from_growth_inbox", at: now }],
        ...base
      }
    };
  }
  if (destination === "evidence_pack_note") {
    return {
      collection: "evidencePackNotes",
      record: {
        id: `evidence-note-${item.id}`,
        title,
        summary: item.summary || item.rawText,
        sourceType: item.sourceType || "growth_inbox",
        riskLevel: item.riskLevel || "low",
        status: "draft",
        nextBestAction: "Review for Weekly Evidence Pack",
        ...base
      }
    };
  }
  return conversionRecord(item, "task", options);
}

export function convertGrowthInboxItem(item = {}, destination = "task", options = {}) {
  const now = options.now || nowIso();
  const normalizedDestination = destination === "ignore" ? "ignore" : clean(destination || item.suggestedDestination || "task");
  if (normalizedDestination === "ignore") {
    const ignored = {
      ...item,
      status: "ignored",
      ignoreReason: clean(options.reason) || "Ignored by operator.",
      updatedAt: now,
      history: [
        { action: "ignored", at: now, note: clean(options.reason) || "Ignored by operator." },
        ...(item.history || [])
      ].slice(0, 30)
    };
    return {
      item: ignored,
      convertedRecord: null,
      event: growthInboxEvent("growth_inbox_item_ignored", ignored, { reason: ignored.ignoreReason }, now)
    };
  }
  const convertedRecord = conversionRecord(item, normalizedDestination, { now });
  const converted = {
    ...item,
    status: "converted",
    convertedTo: convertedRecord.collection,
    convertedRecordId: convertedRecord.record.id,
    updatedAt: now,
    history: [
      { action: "converted", at: now, note: `Converted to ${convertedRecord.collection}.` },
      ...(item.history || [])
    ].slice(0, 30)
  };
  return {
    item: converted,
    convertedRecord,
    event: growthInboxEvent("growth_inbox_item_converted", converted, { destination: normalizedDestination, collection: convertedRecord.collection, recordId: convertedRecord.record.id }, now)
  };
}

export function growthInboxEvent(eventType = "growth_inbox_item_created", item = {}, metadata = {}, now = nowIso()) {
  return {
    id: `event-${eventType}-${crypto.randomUUID().slice(0, 8)}`,
    eventType,
    title: item.summary || compact(item.rawText || "Growth Inbox item", 120),
    source: "growth_inbox",
    objectType: "growth_inbox_item",
    objectId: item.id || "",
    partnerId: item.relatedPartner || "",
    campaignId: item.relatedCampaign || "",
    riskLevel: item.riskLevel || "low",
    proofValue: item.sourceType === "investor_note" || item.suggestedDestination === "evidence_pack_note" ? "medium" : "low",
    revenueImpact: item.sourceType === "revenue_pipeline_update" ? "medium" : "low",
    nextAction: item.suggestedAction || "",
    metadata,
    createdAt: now,
    timestamp: now
  };
}
