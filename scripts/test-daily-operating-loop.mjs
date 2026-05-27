import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const sampleState = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false },
      instagram: { enabled: false }
    }
  },
  partnerProgramArtifacts: [
    {
      key: "rcap-proposal-draft-v1",
      title: "RCAP Partner Proposal Draft",
      review_state: "needs_revision",
      review_updated_at: "2026-05-26T10:00:00.000Z"
    },
    {
      key: "rcap-partner-page-draft-v1",
      title: "RCAP Partner Page Draft",
      review_state: "review_required",
      review_updated_at: "2026-05-26T10:00:00.000Z"
    },
    {
      key: "rcap-dashboard-readiness-v1",
      title: "RCAP Dashboard Readiness",
      review_state: "blocked",
      blocker_reason: "Dashboard requirements are not confirmed.",
      review_updated_at: "2026-05-26T10:00:00.000Z"
    },
    {
      key: "rcap-manual-review-checklist-v1",
      title: "RCAP Manual Review Checklist",
      review_state: "review_required",
      review_updated_at: "2026-05-26T10:00:00.000Z"
    }
  ],
  reports: [
    {
      key: "rcap-weekly-report-draft-v1",
      title: "RCAP Weekly Activation Report Draft",
      review_state: "review_required",
      review_updated_at: "2026-05-26T10:00:00.000Z"
    }
  ],
  evidencePackNotes: [
    {
      key: "rcap-production-activation-evidence-v1",
      title: "RCAP Production Activation Evidence",
      review_state: "approved",
      review_updated_at: "2026-05-26T10:00:00.000Z"
    }
  ],
  tasks: [
    {
      id: "task-rcap-proposal-draft-v1",
      title: "Draft RCAP partner proposal",
      status: "open",
      priority: "high",
      review_state: "review_required",
      review_updated_at: "2026-05-26T10:00:00.000Z"
    },
    {
      id: "task-open-general",
      title: "Review investor proof note",
      status: "open",
      priority: "medium",
      createdAt: "2026-05-26T09:00:00.000Z"
    }
  ],
  partners: [
    {
      id: "partner-rcap",
      slug: "rcap",
      name: "RCAP",
      missing_external_details: true,
      missingExternalDetailsList: ["approval authority", "primary contact"]
    }
  ],
  partnerPrograms: [
    {
      id: "partner-program-rcap",
      slug: "rcap",
      name: "RCAP",
      jurisdiction: "TBD",
      targetAudience: "TBD",
      packageTier: "TBD"
    }
  ],
  activityEvents: [
    {
      eventType: "RCAP review state changed",
      title: "Dashboard Readiness: review_required to blocked",
      createdAt: "2026-05-26T12:00:00.000Z"
    }
  ],
  auditHistory: [
    {
      action: "rcap internal handoff packet generated",
      timestamp: "2026-05-26T13:00:00.000Z"
    }
  ]
};

const loop = buildDailyOperatingLoop(sampleState);

assert.equal(loop.readOnly, true, "Daily Operating Loop must be read-only.");
assert.equal(loop.noExternalSideEffects, true, "Daily Operating Loop must not create external side effects.");
assert.equal(loop.liveGatesCount, 0, "Daily Operating Loop must preserve live gates at 0.");
assert.equal(loop.top3.length, 3, "Daily Operating Loop must return exactly three Top 3 actions.");
assert(loop.waitingOn.length > 0, "Waiting On should render from missing details or blockers.");
assert(loop.decisionsNeeded.length > 0, "Decisions Needed should render from review or handoff state.");
assert(loop.doNotTouchToday.length > 0, "Do Not Touch Today should render safety boundaries.");
assert(loop.momentum.length > 0, "Momentum should render from recent audit or activity events.");
assert(loop.top3.some(item => /blocked|dashboard/i.test(item.title + " " + item.why)), "Blocked RCAP review state should influence Top 3.");
assert(loop.waitingOn.some(item => /primary contact|approval authority|missing|dashboard/i.test(item.title + " " + item.detail)), "Missing RCAP partner details should influence Waiting On.");
assert(loop.decisionsNeeded.some(item => /RCAP|handoff|review/i.test(item.title + " " + item.detail)), "RCAP handoff or review state should influence Decisions Needed.");
assert(loop.doNotTouchToday.every(item => !/send|publish|activate/i.test(item.action || "")), "Do Not Touch Today must not expose external action controls.");

assert(serverSource.includes("function cockpitDailyOperatingLoopHtml"), "Active cockpit must render Daily Operating Loop.");
assert(serverSource.includes("Daily Operating Loop"), "Daily Operating Loop heading must exist.");
assert(serverSource.includes("Today's Top 3"), "Today's Top 3 section must render.");
assert(serverSource.includes("Waiting On"), "Waiting On section must render.");
assert(serverSource.includes("Decisions Needed"), "Decisions Needed section must render.");
assert(serverSource.includes("Do Not Touch Today"), "Do Not Touch Today section must render.");
assert(serverSource.includes("Momentum"), "Momentum section must render.");
assert(serverSource.includes("cockpitDailyOperatingLoopHtml()"), "Overview must include the Daily Operating Loop.");
assert(!/daily-operating-loop[\s\S]{0,2000}(send email|publish page|activate dashboard|enable live)/i.test(serverSource), "Daily Operating Loop must not enable external controls.");

console.log("Daily Operating Loop tests passed.");
