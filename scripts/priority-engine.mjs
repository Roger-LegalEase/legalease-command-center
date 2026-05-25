const nowMs = () => Date.now();

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value || "").trim();
}

function dateDistanceDays(value = "") {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 999;
  return Math.ceil((time - nowMs()) / 86400000);
}

function statusTone(status = "") {
  const value = clean(status).toLowerCase();
  if (["blocked", "failed", "at_risk", "high", "needs_review"].includes(value)) return "blocked";
  if (["approved", "ready", "ready_to_approve", "complete", "posted"].includes(value)) return "approve";
  if (["live", "on_track", "monitor"].includes(value)) return "monitor";
  return "review";
}

function postTitle(post = {}) {
  return clean(post.title || post.hook || "Untitled post");
}

function postCaptionReady(post = {}) {
  return Boolean(clean(post.hook || post.title) && clean(post.body || post.finalExportKit?.caption));
}

function finalPngReady(post = {}) {
  return Boolean(
    post.imageFinalized ||
    post.finalPreviewConfirmed ||
    post.finalExportKit?.finalPngReady ||
    post.finalExportKit?.finalPngPath ||
    post.finalPngFilename
  );
}

function postingKitReady(post = {}) {
  return Boolean(post.postingPackageGenerated || post.postingPackage?.generated || post.finalExportKit?.postingPackage?.generated);
}

function postNextAction(post = {}) {
  if (post.status === "needs_review" || !post.copyReviewed) return "Review copy";
  if (post.complianceRisk === "high" && post.status !== "approved") return "Send to compliance review";
  if (!finalPngReady(post)) return "Generate final PNG";
  if (!postingKitReady(post)) return "Create posting kit";
  if (post.status === "approved") return "Approve publish setup";
  if (post.status === "blocked_channel_not_connected" || post.publishErrorSummary) return "Fix publish setup";
  if (post.status === "posted" || post.status === "manually_posted") return "Add metrics";
  return "Review next step";
}

function partnerNextAction(partner = {}) {
  if (!clean(partner.nextAction)) return "Add next follow-up";
  if (!clean(partner.nextFollowUpDate)) return "Set follow-up date";
  if (dateDistanceDays(partner.nextFollowUpDate) <= 1) return partner.nextAction;
  return partner.nextAction;
}

function campaignNextAction(campaign = {}) {
  if (campaign.status === "live" && !clean(campaign.trackingSlug || campaign.landingPageUrl)) return "Add tracking before scaling";
  if (["draft", "assets_needed"].includes(campaign.status)) return campaign.nextAction || "Create launch assets";
  if (campaign.complianceStatus && !["approved", "approved_with_notes"].includes(campaign.complianceStatus)) return "Send to compliance";
  return campaign.nextAction || "Review campaign status";
}

function pilotNextAction(pilot = {}) {
  if (!clean(pilot.decisionDate) && ["proposal_sent", "negotiating", "scoped"].includes(pilot.status)) return "Request decision date";
  if (!clean(pilot.successMetrics)) return "Define success metrics";
  return pilot.nextAction || "Schedule pilot check-in";
}

function dataRoomNextAction(item = {}) {
  if (["missing", "draft"].includes(clean(item.status).toLowerCase())) return item.nextAction || "Move artifact to usable";
  return item.nextAction || "Keep artifact current";
}

function nextActionFor(type, item) {
  if (type === "post") return postNextAction(item);
  if (type === "partner") return partnerNextAction(item);
  if (type === "campaign") return campaignNextAction(item);
  if (type === "pilot") return pilotNextAction(item);
  if (type === "data_room_item") return dataRoomNextAction(item);
  return clean(item.nextAction || item.nextBestAction || "Review next step");
}

function scoreDeadline(value = "") {
  const days = dateDistanceDays(value);
  if (days < 0) return 35;
  if (days <= 1) return 30;
  if (days <= 3) return 22;
  if (days <= 7) return 12;
  return 0;
}

function buildApprovalItems(state = {}) {
  const items = [];
  for (const post of list(state.posts)) {
    const ready = postCaptionReady(post) && finalPngReady(post);
    if (post.status === "needs_review" || (ready && ["approved", "retry_ready", "blocked_channel_not_connected"].includes(post.status))) {
      items.push({
        id: `approval-post-${post.id}`,
        type: "post",
        title: postTitle(post),
        summary: clean(post.body || post.hook).slice(0, 220),
        whyItMatters: post.status === "needs_review" ? "This content needs Roger's review before it can move." : "This post has the assets needed for approval or publish setup.",
        recommendedAction: postNextAction(post),
        status: post.status === "needs_review" ? "needs_review" : "ready_to_approve",
        risk: post.complianceRisk || "low",
        sourceId: post.id,
        createdAt: post.updatedAt || post.createdAt || new Date().toISOString()
      });
    }
  }
  for (const report of list(state.reports).slice(0, 3)) {
    if (report.status !== "approved") {
      items.push({
        id: `approval-report-${report.id}`,
        type: "report",
        title: report.reportTitle || "Report",
        summary: report.notes || "Report export is ready for review.",
        whyItMatters: "Reports turn operating activity into investor and partner proof.",
        recommendedAction: "Review report",
        status: "needs_review",
        risk: "low",
        sourceId: report.id,
        createdAt: report.generatedAt || new Date().toISOString()
      });
    }
  }
  return items.slice(0, 20);
}

function buildBlockers(state = {}) {
  const blockers = [];
  for (const post of list(state.posts)) {
    if (["blocked_channel_not_connected", "failed"].includes(post.status) || post.publishErrorSummary) {
      blockers.push({
        id: `blocker-post-${post.id}`,
        title: postTitle(post),
        whatIsBlocked: "Publishing",
        whyBlocked: post.publishErrorSummary || "Publish setup is not ready.",
        fix: postNextAction(post),
        owner: "Roger",
        sourceType: "post",
        sourceId: post.id,
        severity: "high"
      });
    } else if (post.status === "approved" && !finalPngReady(post)) {
      blockers.push({
        id: `blocker-final-png-${post.id}`,
        title: postTitle(post),
        whatIsBlocked: "Post approval",
        whyBlocked: "Final PNG is missing.",
        fix: "Generate final PNG",
        owner: "Production",
        sourceType: "post",
        sourceId: post.id,
        severity: "medium"
      });
    }
  }
  for (const campaign of list(state.campaigns)) {
    if (campaign.status === "live" && !clean(campaign.trackingSlug || campaign.landingPageUrl)) {
      blockers.push({
        id: `blocker-campaign-tracking-${campaign.id}`,
        title: campaign.campaignName || "Campaign",
        whatIsBlocked: "Campaign tracking",
        whyBlocked: "Live campaign has no tracking slug or URL.",
        fix: "Add tracking before calling this campaign active.",
        owner: campaign.owner || "Growth",
        sourceType: "campaign",
        sourceId: campaign.id,
        severity: "high"
      });
    }
    if (campaign.complianceStatus && !["approved", "approved_with_notes", "not_required"].includes(campaign.complianceStatus)) {
      blockers.push({
        id: `blocker-campaign-compliance-${campaign.id}`,
        title: campaign.campaignName || "Campaign",
        whatIsBlocked: "Campaign launch",
        whyBlocked: "Compliance is not approved.",
        fix: "Review compliance notes.",
        owner: campaign.owner || "Growth",
        sourceType: "campaign",
        sourceId: campaign.id,
        severity: "high"
      });
    }
  }
  return blockers.slice(0, 20);
}

function buildGrowthSignals(state = {}) {
  const signals = [];
  for (const campaign of list(state.campaigns)) {
    const starts = Number(campaign.recordShieldStarts || 0);
    const conversions = Number(campaign.expungementStarts || campaign.paidConversions || 0);
    if (starts || conversions || campaign.status === "live") {
      signals.push({
        id: `signal-campaign-${campaign.id}`,
        title: campaign.campaignName || "Campaign movement",
        summary: `${starts} RecordShield starts${conversions ? `, ${conversions} Expungement.ai signals` : ""}.`,
        sourceType: "campaign",
        sourceId: campaign.id,
        strength: starts > 50 || conversions > 5 ? "strong" : "monitor",
        createdAt: campaign.updatedAt || campaign.lastActivityAt || new Date().toISOString()
      });
    }
  }
  for (const partner of list(state.partners)) {
    if (["signed_pilot", "campaign_live", "verbal_yes", "proposal_sent"].includes(partner.status)) {
      signals.push({
        id: `signal-partner-${partner.id}`,
        title: partner.organizationName || "Partner movement",
        summary: `${partner.status || "movement"} - ${partner.nextAction || "next action needed"}`,
        sourceType: "partner",
        sourceId: partner.id,
        strength: ["signed_pilot", "campaign_live"].includes(partner.status) ? "strong" : "monitor",
        createdAt: partner.updatedAt || partner.lastTouchDate || new Date().toISOString()
      });
    }
  }
  for (const pilot of list(state.pilots)) {
    if (["active", "signed", "proposal_sent"].includes(pilot.status)) {
      signals.push({
        id: `signal-pilot-${pilot.id}`,
        title: pilot.pilotName || "Pilot movement",
        summary: pilot.nextAction || pilot.objective || "Pilot needs next action.",
        sourceType: "pilot",
        sourceId: pilot.id,
        strength: ["active", "signed"].includes(pilot.status) ? "strong" : "monitor",
        createdAt: pilot.updatedAt || pilot.startDate || new Date().toISOString()
      });
    }
  }
  return signals
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 12);
}

function buildRecommendedActions(state = {}, approvalItems = [], blockers = [], growthSignals = []) {
  const actions = [];
  const add = (item) => actions.push({ status: "open", ...item });
  for (const blocker of blockers.slice(0, 5)) {
    add({
      id: `action-${blocker.id}`,
      title: blocker.fix,
      description: blocker.whyBlocked,
      relatedRecordType: blocker.sourceType,
      relatedRecordId: blocker.sourceId,
      priority: blocker.severity === "high" ? "high" : "medium",
      owner: blocker.owner,
      dueDate: "",
      cta: "Fix blocker",
      reasonGenerated: "Blocked item cannot move without action."
    });
  }
  for (const item of approvalItems.slice(0, 5)) {
    add({
      id: `action-${item.id}`,
      title: item.recommendedAction,
      description: item.whyItMatters,
      relatedRecordType: item.type,
      relatedRecordId: item.sourceId,
      priority: item.risk === "high" ? "high" : "medium",
      owner: "Roger",
      dueDate: "",
      cta: "Review",
      reasonGenerated: "Approval item is waiting on Roger."
    });
  }
  for (const partner of list(state.partners)) {
    if (!clean(partner.nextFollowUpDate) || dateDistanceDays(partner.nextFollowUpDate) <= 0) {
      add({
        id: `action-partner-${partner.id}`,
        title: partnerNextAction(partner),
        description: "Partner movement needs a clear follow-up date.",
        relatedRecordType: "partner",
        relatedRecordId: partner.id,
        priority: partner.priority === "High" ? "high" : "medium",
        owner: partner.owner || "Roger",
        dueDate: partner.nextFollowUpDate || "",
        cta: "Follow up",
        reasonGenerated: "Partner follow-up is due or missing."
      });
    }
  }
  for (const signal of growthSignals.filter((item) => item.strength === "strong").slice(0, 3)) {
    add({
      id: `action-proof-${signal.id}`,
      title: "Turn traction into proof",
      description: signal.summary,
      relatedRecordType: signal.sourceType,
      relatedRecordId: signal.sourceId,
      priority: "medium",
      owner: "Growth",
      dueDate: "",
      cta: "Add to report",
      reasonGenerated: "Strong growth signal should become investor evidence."
    });
  }
  return actions.slice(0, 20);
}

function buildPriorities(state = {}, approvalItems = [], blockers = [], growthSignals = [], actions = []) {
  const items = [];
  for (const blocker of blockers.slice(0, 3)) {
    items.push({
      id: `priority-${blocker.id}`,
      title: blocker.title,
      whyItMatters: blocker.whyBlocked,
      recommendedAction: blocker.fix,
      status: "blocked",
      score: blocker.severity === "high" ? 100 : 82,
      sourceType: blocker.sourceType,
      sourceId: blocker.sourceId
    });
  }
  for (const approval of approvalItems.slice(0, 4)) {
    items.push({
      id: `priority-${approval.id}`,
      title: approval.title,
      whyItMatters: approval.whyItMatters,
      recommendedAction: approval.recommendedAction,
      status: approval.status === "ready_to_approve" ? "approve" : "review",
      score: approval.risk === "high" ? 90 : 76,
      sourceType: approval.type,
      sourceId: approval.sourceId
    });
  }
  for (const signal of growthSignals.slice(0, 3)) {
    items.push({
      id: `priority-${signal.id}`,
      title: signal.title,
      whyItMatters: signal.summary,
      recommendedAction: signal.strength === "strong" ? "Turn this into proof" : "Monitor",
      status: "monitor",
      score: signal.strength === "strong" ? 70 : 55,
      sourceType: signal.sourceType,
      sourceId: signal.sourceId
    });
  }
  for (const action of actions.slice(0, 3)) {
    items.push({
      id: `priority-${action.id}`,
      title: action.title,
      whyItMatters: action.description,
      recommendedAction: action.cta,
      status: action.priority === "high" ? "review" : "monitor",
      score: action.priority === "high" ? 88 : 60,
      sourceType: action.relatedRecordType,
      sourceId: action.relatedRecordId
    });
  }
  return items
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 5);
}

function buildCooBrief(priorities = [], approvalItems = [], blockers = [], growthSignals = []) {
  const strongestSignal = growthSignals.find((item) => item.strength === "strong") || growthSignals[0];
  return {
    today: priorities.slice(0, 3).map((item) => item.title),
    approvals: approvalItems.length,
    blocked: {
      count: blockers.length,
      mainReason: blockers[0]?.whyBlocked || "No major blockers."
    },
    growth: strongestSignal ? `${strongestSignal.title}: ${strongestSignal.summary}` : "No traction signal recorded yet.",
    recommendedMove: priorities[0]?.recommendedAction || "Add the next source, partner follow-up, or campaign update.",
    generatedAt: new Date().toISOString()
  };
}

export function addNextBestActions(state = {}) {
  const nextState = { ...state };
  nextState.posts = list(state.posts).map((item) => ({ ...item, nextBestAction: nextActionFor("post", item) }));
  nextState.partners = list(state.partners).map((item) => ({ ...item, nextBestAction: nextActionFor("partner", item) }));
  nextState.campaigns = list(state.campaigns).map((item) => ({ ...item, nextBestAction: nextActionFor("campaign", item) }));
  nextState.pilots = list(state.pilots).map((item) => ({ ...item, nextBestAction: nextActionFor("pilot", item) }));
  nextState.dataRoomItems = list(state.dataRoomItems).map((item) => ({ ...item, nextBestAction: nextActionFor("data_room_item", item) }));
  nextState.reports = list(state.reports).map((item) => ({ ...item, nextBestAction: item.nextBestAction || "Review report" }));
  nextState.funnelSnapshots = list(state.funnelSnapshots).map((item) => ({ ...item, nextBestAction: item.nextBestAction || "Update funnel snapshot" }));
  return nextState;
}

export function analyzeOperations(state = {}) {
  const withActions = addNextBestActions(state);
  const approvalItems = buildApprovalItems(withActions);
  const blockers = buildBlockers(withActions);
  const growthSignals = buildGrowthSignals(withActions);
  const recommendedActions = buildRecommendedActions(withActions, approvalItems, blockers, growthSignals);
  const priorities = buildPriorities(withActions, approvalItems, blockers, growthSignals, recommendedActions);
  const cooBrief = buildCooBrief(priorities, approvalItems, blockers, growthSignals);
  return {
    ...withActions,
    approvalQueue: approvalItems,
    blockers,
    growthSignals,
    nextBestActions: recommendedActions,
    recommendedActions,
    priorities,
    cooBrief
  };
}

export function priorityStatusTone(status = "") {
  return statusTone(status);
}
