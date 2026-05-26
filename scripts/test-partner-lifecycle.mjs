import assert from "node:assert/strict";
import {
  normalizePartnerLifecycle,
  partnerFollowUpDraft,
  partnerLifecycleInsights,
  partnerLifecycleTasks
} from "./partner-lifecycle.mjs";

const now = "2026-05-26T12:00:00.000Z";
const state = {
  partners: [
    {
      id: "partner-proposal",
      organizationName: "Fulton County Solicitor General",
      partnerType: "county",
      status: "proposal_sent",
      owner: "Roger",
      lastTouchDate: "2026-05-14",
      nextAction: "Ask for decision date",
      proofValue: "medium"
    },
    {
      id: "partner-active",
      organizationName: "Goodwill of Mississippi",
      partnerType: "workforce",
      stage: "active_pilot",
      owner: "Growth",
      lastTouchDate: "2026-05-01",
      nextAction: "Prepare campaign report",
      proofValue: "high"
    },
    {
      id: "partner-stalled",
      name: "TimeDone",
      type: "nonprofit",
      stage: "stalled",
      owner: "Roger",
      lastTouchDate: "2026-04-20",
      nextAction: "Reframe as lower-cost pilot",
      proofValue: 5
    },
    {
      id: "partner-reporting",
      organizationName: "Clean Slate Initiative",
      partnerType: "nonprofit",
      stage: "reporting",
      owner: "Roger",
      lastTouchDate: "2026-05-24",
      nextAction: "Turn report into proof",
      proofValue: "strong"
    }
  ],
  reports: [
    { id: "old-report", partnerId: "partner-active", generatedAt: "2026-05-01T00:00:00.000Z", title: "Old pilot report" }
  ]
};

const normalized = normalizePartnerLifecycle(state.partners[0], { now });
assert.equal(normalized.name, "Fulton County Solicitor General");
assert.equal(normalized.type, "county");
assert.equal(normalized.stage, "proposal_sent");
assert.equal(normalized.priority, "medium");
assert.equal(normalized.riskLevel, "medium");
assert.ok(Array.isArray(normalized.history));
assert.equal(normalizePartnerLifecycle({ organizationName: "Missing Next" }, { now }).nextAction, "");

const tasks = partnerLifecycleTasks(state, { now });
assert.ok(tasks.find((task) => task.escalationKey === "partner-proposal-follow-up:partner-proposal"));
assert.ok(tasks.find((task) => task.escalationKey === "partner-active-pilot-report:partner-active"));
assert.ok(tasks.find((task) => task.escalationKey === "partner-proof-note:partner-stalled"));
assert.ok(tasks.find((task) => task.escalationKey === "partner-case-study:partner-reporting"));

const insights = partnerLifecycleInsights(state, { now });
assert.equal(insights.stalledPartners.length, 1);
assert.equal(insights.proofWorthyPartners.length, 3);
assert.ok(insights.partnerMovement.find((item) => item.id === "partner-reporting"));
assert.match(insights.followUpDrafts[0].body, /approval/i);

const draft = partnerFollowUpDraft(state.partners[0], { now });
assert.match(draft.subject, /Fulton County/);
assert.match(draft.body, /not sent automatically/i);

console.log("partner lifecycle tests passed");
