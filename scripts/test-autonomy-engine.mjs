import assert from "node:assert/strict";
import { buildAutonomyGovernance, buildAutonomyReport, runAutonomyCycleOnState } from "./autonomy-engine.mjs";

const state = {
  partners: [
    {
      id: "partner-stale",
      organizationName: "Stale Partner",
      owner: "Roger",
      lastTouchDate: "2026-04-01",
      nextFollowUpDate: ""
    }
  ],
  posts: [
    {
      id: "post-approved-no-png",
      title: "Approved post",
      status: "approved",
      complianceRisk: "low"
    },
    {
      id: "post-forbidden-claim",
      title: "We will clear your record",
      body: "We will clear your record instantly.",
      status: "needs_review",
      complianceRisk: "high"
    }
  ],
  automationSuggestions: [
    {
      id: "suggestion-1",
      title: "Create partner follow-up",
      status: "pending",
      confidence: "high",
      explanation: "Gmail reply detected."
    }
  ],
  tasks: [],
  activityEvents: [],
  soc2AuditLogs: []
};

const report = buildAutonomyReport(state);
assert.equal(report.summary.forbidden >= 1, true, "forbidden legal/outcome claim should be blocked");
assert.equal(report.summary.approvalRequired >= 1, true, "public-facing production work should require approval");
assert.equal(report.summary.automatic >= 1, true, "stale partner follow-up task should be automatic");

const result = runAutonomyCycleOnState(state, { executeAutomatic: true });
assert.equal(result.run.status, "complete");
assert.equal(result.state.tasks.length >= 1, true, "automatic task should be created");
assert.equal(result.state.soc2AuditLogs.length >= 1, true, "autonomy run should create audit log");
assert.equal(result.state.activityEvents.length >= 1, true, "autonomy run should create activity event when automatic work executes");
assert.equal(result.summary.forbidden >= 1, true, "forbidden actions remain surfaced after run");
assert.equal(result.state.autonomyDecisions.length >= 1, true, "autonomy run should create a decision ledger entry");

const advancedState = {
  ...state,
  partners: [
    ...state.partners,
    {
      id: "partner-pipeline",
      organizationName: "Pipeline Partner",
      owner: "",
      status: "proposal_sent",
      expectedValue: 50000,
      probability: 60,
      nextFollowUpDate: ""
    }
  ],
  campaigns: [
    {
      id: "campaign-live-no-tracking",
      campaignName: "Live Campaign Missing Tracking",
      status: "live",
      owner: "Growth",
      targetReferrals: 100,
      actualReferrals: 12,
      recordShieldStarts: 5
    }
  ],
  complianceItems: [
    {
      id: "compliance-high-risk",
      itemTitle: "High-risk landing page claim",
      riskLevel: "high",
      status: "needs_review",
      reviewer: "Compliance"
    }
  ],
  automationEvents: [
    {
      id: "event-product-unattributed",
      source: "website",
      eventType: "recordshield_user_created",
      title: "RecordShield user created",
      relatedEntityType: "unknown",
      status: "new",
      confidence: "medium",
      createdAt: "2026-05-25T00:00:00.000Z"
    },
    {
      id: "event-support",
      source: "customer_support",
      eventType: "support_feedback",
      title: "User confused by intake handoff",
      relatedEntityType: "funnel",
      status: "new",
      confidence: "high",
      createdAt: "2026-05-25T00:00:00.000Z"
    }
  ],
  connectorStatus: [
    { connector: "gmail", configured: true, lastSyncAt: "2026-04-01T00:00:00.000Z", lastSyncStatus: "success" }
  ]
};

const governance = buildAutonomyGovernance(advancedState);
assert.equal(governance.roleMatrix.some((role) => role.role === "Compliance" && role.canApprove.includes("hard_human_review")), true, "Compliance role should approve hard review lane");
assert.equal(governance.runbooks.some((runbook) => runbook.id === "runbook-live-publishing"), true, "live publishing runbook should exist");
assert.equal(governance.eventIntelligence.unattributedEvents, 1, "unattributed product/website events should be counted");
assert.equal(governance.eventIntelligence.supportSignals.length, 1, "support feedback should become an operating signal");
assert.equal(governance.revenueAwareness.weightedPipeline, 30000, "weighted pipeline should be calculated from expected value and probability");
assert.equal(governance.ownership.unownedRecords.length >= 1, true, "unowned records should be surfaced");
assert.equal(governance.actions.some((action) => action.requiredRole === "Compliance" && action.approvalPolicy === "hard_human_review"), true, "high-risk compliance action should require Compliance hard review");
assert.equal(governance.actions.some((action) => action.actionType === "live_publish" && action.approvalPolicy === "never_execute"), true, "live publishing should remain never-execute until gates are explicitly configured");

console.log("autonomy engine tests passed");
