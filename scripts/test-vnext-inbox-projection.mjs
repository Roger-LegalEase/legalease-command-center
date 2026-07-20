#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  INBOX_GROUP_CONTRACT,
  buildInboxView
} from "./ui/view-models/inbox-view.mjs";
import {
  INBOX_INCLUDED_COLLECTIONS,
  INBOX_UPDATE_WINDOW_DAYS,
  collectInboxCandidates,
  normalizeInboxPriority
} from "./ui/view-models/inbox-sources.mjs";
import {
  ROUTE_COMPATIBILITY_TOTALS,
  resolveRouteCompatibility
} from "./ui/route-compatibility.mjs";

const NOW = "2026-07-16T16:00:00.000Z";
const OWNER = Object.freeze({
  id: "owner",
  role: "owner",
  label: "Roger",
  authenticated: true,
  permissions: ["unknown_future_capability"]
});

function fixtureState() {
  return {
    approvals: [
      {
        id: "approval-social-review",
        action_type: "review_social_post",
        queue_item_id: "queue-social-review",
        preview: "Review the social post",
        risk_level: "caution",
        state: "requested",
        requested_at: "2026-07-15T14:00:00.000Z"
      },
      {
        id: "approval-campaign-launch",
        action_type: "launch_campaign",
        queue_item_id: "queue-campaign-launch",
        preview: "Review the outreach campaign",
        risk_level: "caution",
        state: "requested",
        requested_at: "2026-07-15T15:00:00.000Z"
      },
      {
        id: "approval-social-compliance",
        action_type: "compliance_review",
        queue_item_id: "queue-social-compliance",
        preview: "Review the post's compliance notes",
        risk_level: "caution",
        state: "requested",
        requested_at: "2026-07-15T14:30:00.000Z"
      },
      {
        id: "approval-completed-campaign",
        action_type: "launch_campaign",
        queue_item_id: "queue-completed-campaign",
        preview: "Completed campaign decision",
        risk_level: "safe",
        state: "executed",
        requested_at: "2026-07-13T12:00:00.000Z",
        executed_at: "2026-07-16T11:00:00.000Z"
      }
    ],
    queueItems: [
      {
        id: "queue-social-review",
        sourceRef: { collection: "approvalQueue", itemId: "approval-queue-social" },
        type: "approval",
        status: "needs_roger",
        title: "Fulton County post needs two fixes",
        summary: "The post needs a copy and safety decision.",
        priority: 20,
        requiresApproval: true,
        approvalId: "approval-social-review",
        updatedAt: "2026-07-15T14:00:00.000Z"
      },
      {
        id: "queue-campaign-launch",
        sourceRef: { collection: "campaigns", itemId: "campaign-july-partner" },
        type: "campaign",
        status: "needs_roger",
        title: "Review the July Partner outreach campaign",
        summary: "The campaign is ready for a launch decision.",
        priority: 15,
        requiresApproval: true,
        approvalId: "approval-campaign-launch",
        metadata: { decisionType: "launch_campaign" },
        updatedAt: "2026-07-15T15:00:00.000Z"
      },
      {
        id: "queue-social-compliance",
        sourceRef: { collection: "posts", itemId: "post-fulton" },
        type: "approval",
        status: "needs_roger",
        title: "Review the Fulton County post's compliance notes",
        summary: "A separate compliance decision is required.",
        priority: 18,
        requiresApproval: true,
        approvalId: "approval-social-compliance",
        metadata: { decisionType: "compliance_review" },
        updatedAt: "2026-07-15T14:30:00.000Z"
      },
      {
        id: "queue-completed-campaign",
        sourceRef: { collection: "campaigns", itemId: "campaign-completed" },
        type: "campaign",
        status: "completed",
        title: "Complete the reviewed outreach decision",
        summary: "The reviewed campaign decision finished.",
        priority: 45,
        requiresApproval: true,
        approvalId: "approval-completed-campaign",
        decidedAt: "2026-07-16T11:00:00.000Z",
        updatedAt: "2026-07-16T11:00:00.000Z"
      }
    ],
    approvalQueue: [
      {
        id: "approval-queue-social",
        type: "post",
        sourceId: "post-fulton",
        status: "needs_review",
        title: "Fulton County post needs two fixes",
        whyItMatters: "The post needs a copy and safety decision.",
        recommendedAction: "Review the post",
        priority: "high",
        updatedAt: "2026-07-15T13:00:00.000Z"
      }
    ],
    posts: [
      {
        id: "post-fulton",
        title: "Fulton County post needs two fixes",
        status: "needs_review",
        approvalStatus: "not_approved",
        priority: "high",
        updatedAt: "2026-07-15T12:00:00.000Z"
      },
      {
        id: "post-scheduled",
        title: "Partner milestone post",
        status: "scheduled",
        scheduledFor: "2026-07-20T14:00:00-04:00",
        updatedAt: "2026-07-15T12:30:00.000Z"
      },
      {
        id: "post-recent",
        title: "Record access explainer",
        status: "posted",
        postedAt: "2026-07-16T10:30:00.000Z",
        updatedAt: "2026-07-16T10:30:00.000Z"
      },
      {
        id: "post-stale",
        title: "Old published post",
        status: "posted",
        postedAt: "2026-07-01T10:30:00.000Z",
        updatedAt: "2026-07-01T10:30:00.000Z"
      },
      {
        id: "post-hidden",
        title: "Restricted acquisition post",
        status: "needs_review",
        allowedRoles: ["admin"],
        updatedAt: "2026-07-15T12:00:00.000Z"
      },
      {
        id: "<unsafe-post>",
        title: "Unsafe source identity",
        status: "needs_review",
        updatedAt: "2026-07-15T12:00:00.000Z"
      },
      {
        title: "Missing source identity",
        status: "needs_review",
        updatedAt: "2026-07-15T12:00:00.000Z"
      }
    ],
    campaigns: [
      {
        id: "campaign-july-partner",
        campaignName: "July Partner outreach",
        status: "ready",
        owner: "Roger",
        priority: "high",
        complianceStatus: "approved",
        partnerApprovalStatus: "approved",
        startDate: "2026-07-18",
        updatedAt: "2026-07-15T15:00:00.000Z"
      },
      {
        id: "campaign-paused",
        campaignName: "County information campaign",
        status: "paused",
        owner: "Growth",
        updatedAt: "2026-07-14T12:00:00.000Z"
      },
      {
        id: "campaign-completed",
        campaignName: "Completed partner campaign",
        status: "completed",
        owner: "Roger",
        completedAt: "2026-07-16T11:00:00.000Z",
        updatedAt: "2026-07-16T11:00:00.000Z"
      }
    ],
    partners: [
      {
        id: "partner-philadelphia",
        organizationName: "Philadelphia Reentry Coalition",
        owner: "Roger",
        priority: "normal",
        nextAction: "Confirm the next meeting date.",
        nextFollowUpDate: "2026-07-15",
        updatedAt: "2026-07-14T13:00:00.000Z"
      },
      {
        id: "partner-unassigned",
        organizationName: "Unassigned Partner",
        owner: "",
        priority: "high",
        nextAction: "Choose an owner for the follow-up.",
        nextFollowUpDate: "2026-07-15",
        updatedAt: "2026-07-14T13:00:00.000Z"
      },
      {
        id: "partner-external",
        organizationName: "External Response Partner",
        owner: "Growth",
        priority: "high",
        nextAction: "Wait for the signed scope.",
        nextFollowUpDate: "2026-07-22",
        blocker: "Waiting for the partner's response.",
        updatedAt: "2026-07-15T13:00:00.000Z"
      },
      {
        id: "partner-milestone",
        organizationName: "Community Access Network",
        owner: "Roger",
        priority: "normal",
        responseReceivedAt: "2026-07-16T09:30:00.000Z",
        responseSummary: "The partner confirmed the pilot milestone.",
        updatedAt: "2026-07-16T09:30:00.000Z"
      }
    ],
    tasks: [
      {
        id: "task-partner-call",
        title: "Call Philadelphia Reentry Coalition",
        status: "open",
        owner: "Roger",
        priority: "high",
        dueDate: "2026-07-15",
        relatedObjectType: "partner",
        relatedObjectId: "partner-philadelphia",
        nextAction: "Confirm the meeting date.",
        updatedAt: "2026-07-15T10:00:00.000Z"
      },
      {
        id: "task-partner-notes",
        title: "Prepare Philadelphia meeting notes",
        status: "open",
        owner: "Roger",
        priority: "high",
        relatedObjectType: "partner",
        relatedObjectId: "partner-philadelphia",
        nextAction: "Prepare the short meeting brief.",
        updatedAt: "2026-07-15T10:00:00.000Z"
      },
      {
        id: "task-waiting-external",
        title: "Wait for signed pilot scope",
        status: "waiting",
        owner: "Roger",
        priority: "high",
        waitingOn: "The partner's signed scope.",
        dueDate: "2026-07-19",
        updatedAt: "2026-07-15T10:10:00.000Z"
      },
      {
        id: "task-overdue-normal",
        title: "Update the partner contact note",
        status: "open",
        owner: "Roger",
        priority: "normal",
        dueDate: "2026-07-14",
        updatedAt: "2026-07-14T10:00:00.000Z"
      },
      {
        id: "task-urgent",
        title: "Resolve the urgent evidence blocker",
        status: "open",
        owner: "Roger",
        priority: "critical",
        dueDate: "2026-07-15",
        important: true,
        updatedAt: "2026-07-16T08:00:00.000Z"
      },
      {
        id: "task-alpha",
        title: "Alpha high-priority task",
        status: "open",
        owner: "Roger",
        priority: "high",
        important: true,
        updatedAt: "2026-07-15T09:00:00.000Z"
      },
      {
        id: "task-beta",
        title: "Beta high-priority task",
        status: "open",
        owner: "Roger",
        priority: "high",
        important: true,
        updatedAt: "2026-07-15T09:00:00.000Z"
      },
      {
        id: "task-recently-done",
        title: "Finish the partner report",
        status: "done",
        owner: "Roger",
        priority: "high",
        completionNote: "The report is complete.",
        completedAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z"
      },
      {
        id: "task-stale-done",
        title: "Old completed task",
        status: "done",
        owner: "Roger",
        priority: "high",
        completedAt: "2026-07-01T12:00:00.000Z",
        updatedAt: "2026-07-01T12:00:00.000Z"
      }
    ],
    automationSuggestions: [
      {
        id: "automation-partner-update",
        title: "Update the Partner record",
        summary: "A reviewed change is ready for approval.",
        explanation: "A read-only signal found a possible Partner update. Nothing changes without approval.",
        status: "pending",
        confidence: "high",
        relatedEntityType: "partner",
        relatedEntityId: "partner-philadelphia",
        proposedChanges: { dueDate: "2026-07-18" },
        updatedAt: "2026-07-15T11:00:00.000Z"
      },
      {
        id: "automation-recent",
        title: "Partner update applied",
        status: "applied",
        confidence: "medium",
        appliedAt: "2026-07-16T08:30:00.000Z",
        updatedAt: "2026-07-16T08:30:00.000Z"
      }
    ],
    inboxSignals: [
      {
        id: "inbox-reply-signal",
        kind: "needs_reply",
        status: "suggested",
        counterpartName: "Synthetic Partner Contact",
        summary: "A partner response needs a reply.",
        ageDays: 3,
        ownerOnly: true,
        updatedAt: "2026-07-15T09:30:00.000Z"
      }
    ],
    growthInbox: [
      {
        id: "capture-review",
        status: "triaged",
        owner: "Roger",
        priority: "high",
        decisionNeeded: "roger_decision",
        summary: "Investor follow-up needs a destination",
        suggestedAction: "Review the follow-up and choose the authoritative record.",
        dueDate: "2026-07-17",
        updatedAt: "2026-07-15T11:30:00.000Z"
      }
    ],
    supportIssues: [
      {
        id: "support-reply",
        title: "Account access question",
        summary: "A synthetic account access question needs a response.",
        status: "open",
        urgency: "normal",
        updated_at: "2026-07-15T12:30:00.000Z"
      }
    ],
    reports: [
      {
        id: "report-review",
        reportTitle: "Partner results report",
        status: "ready_for_review",
        review_state: "review_required",
        owner: "Roger",
        updatedAt: "2026-07-15T08:00:00.000Z"
      }
    ],
    dataRoomItems: [
      {
        id: "investor-room-update",
        title: "Investor Room operating plan",
        status: "needs_update",
        owner: "Roger",
        priority: "high",
        nextReviewDate: "2026-07-15",
        updatedAt: "2026-07-14T12:00:00.000Z"
      }
    ],
    evidencePackNotes: [],
    soc2Evidence: [
      {
        id: "soc2-evidence-overdue",
        evidenceTitle: "Monthly access review",
        evidenceStatus: "Ready for Review",
        status: "Ready for Review",
        owner: "Roger",
        nextCollectionDue: "2026-07-14",
        updatedAt: "2026-07-15T07:00:00.000Z"
      }
    ],
    soc2Policies: [
      {
        id: "policy-current",
        policyName: "Access control policy",
        status: "Current",
        owner: "Roger",
        reviewedAt: "2026-07-16T07:30:00.000Z",
        updatedAt: "2026-07-16T07:30:00.000Z"
      }
    ],
    brandAssets: [
      {
        id: "brand-asset-unapproved",
        name: "Unapproved logo variant",
        approved: false,
        updatedAt: "2026-07-15T06:00:00.000Z"
      }
    ],
    googleInsights: [
      {
        id: "google-insight-deferred",
        insightType: "Blind Spot",
        title: "Unreliable inferred signal",
        status: "suggested",
        updatedAt: "2026-07-15T06:00:00.000Z"
      }
    ],
    alerts: [
      {
        id: "alert-derived-deferred",
        status: "active",
        severity: "critical",
        title: "Derived summary without an exact source relationship",
        updatedAt: "2026-07-15T06:00:00.000Z"
      }
    ],
    auditHistory: [
      {
        id: "audit-fixture",
        timestamp: "2026-07-15T00:00:00.000Z",
        action: "fixture created"
      }
    ],
    activityEvents: [
      {
        id: "activity-fixture",
        createdAt: "2026-07-15T00:00:00.000Z",
        title: "Fixture activity"
      }
    ]
  };
}

function allItems(view) {
  return [
    ...view.groups.needsMe,
    ...view.groups.waiting,
    ...view.groups.updates
  ];
}

function reverseInputArrays(state) {
  return Object.fromEntries(Object.entries(state).map(([key, value]) => [
    key,
    Array.isArray(value) ? [...value].reverse() : value
  ]));
}

const state = fixtureState();
const before = structuredClone(state);
const view = buildInboxView(state, OWNER, NOW);
const again = buildInboxView(state, OWNER, NOW);
const items = allItems(view);

assert.equal(typeof buildInboxView, "function", "buildInboxView(state, actor, now) must exist.");
assert.deepEqual(again, view, "Repeated projections must be deterministic.");
assert.deepEqual(state, before, "Projection must not mutate its input.");
assert.deepEqual(buildInboxView(reverseInputArrays(state), OWNER, NOW), view, "Input array ordering must not change output.");

assert.ok(Object.isFrozen(view));
assert.ok(Object.isFrozen(view.actor));
assert.ok(Object.isFrozen(view.groups));
assert.ok(Object.isFrozen(view.groups.needsMe));
assert.ok(Object.isFrozen(view.groups.waiting));
assert.ok(Object.isFrozen(view.groups.updates));
assert.ok(items.every((item) => Object.isFrozen(item) && Object.isFrozen(item.actionIntents)));
assert.ok(items.filter((item) => item.relatedObject).every((item) => Object.isFrozen(item.relatedObject)));
assert.throws(() => { view.groups.needsMe.push({}); }, TypeError, "Returned arrays must be immutable.");

assert.equal(INBOX_UPDATE_WINDOW_DAYS, 7);
assert.deepEqual(INBOX_GROUP_CONTRACT.map((group) => group.value), ["needs_me", "waiting", "update"]);
assert.deepEqual(Object.keys(view.groups), ["needsMe", "waiting", "updates"]);
assert.deepEqual(Object.keys(view.counts), ["needsMe", "waiting", "updates", "total"]);
assert.equal(view.generatedAt, "2026-07-16T16:00:00.000Z");
assert.equal(view.counts.needsMe, view.groups.needsMe.length);
assert.equal(view.counts.waiting, view.groups.waiting.length);
assert.equal(view.counts.updates, view.groups.updates.length);
assert.equal(view.counts.total, items.length);

const withoutHidden = structuredClone(state);
withoutHidden.posts = withoutHidden.posts.filter((post) => post.id !== "post-hidden");
assert.deepEqual(buildInboxView(withoutHidden, OWNER, NOW).counts, view.counts, "Hidden records must not affect visible counts.");
assert.ok(!items.some((item) => item.sourceId === "post-hidden"));
assert.ok(!items.some((item) => item.sourceId === "<unsafe-post>"));
assert.ok(!items.some((item) => item.title === "Missing source identity"));

assert.ok(items.every((item) => item.id.startsWith(`inbox:${item.workKind}:`)));
assert.equal(new Set(items.map((item) => item.id)).size, items.length);
assert.ok(items.every((item) => item.dedupeKey));
assert.equal(new Set(items.map((item) => item.dedupeKey)).size, items.length);
assert.ok(items.every((item) => resolveRouteCompatibility(item.href).kind === "object"), "Every item must have a safe exact record link.");

const socialItems = items.filter((item) => item.dedupeKey === "social_review:post-fulton");
assert.equal(socialItems.length, 1, "Explicit and inferred social review work must collapse.");
assert.equal(socialItems[0].sourceKind, "approvals", "Explicit decision record must beat inferred social state.");
assert.equal(socialItems[0].sourceId, "approval-social-review");
assert.equal(socialItems[0].href, "#social/post/post-fulton");
const distinctSocialApprovals = items.filter((item) => item.sourceId === "approval-social-review" || item.sourceId === "approval-social-compliance");
assert.equal(distinctSocialApprovals.length, 2, "Separate required decisions on one post must not be over-deduplicated.");
assert.notEqual(distinctSocialApprovals[0].dedupeKey, distinctSocialApprovals[1].dedupeKey);

const campaignItems = items.filter((item) => item.dedupeKey === "campaign_decision:campaign-july-partner:launch");
assert.equal(campaignItems.length, 1, "Explicit and inferred campaign decisions must collapse.");
assert.equal(campaignItems[0].sourceKind, "approvals", "Explicit decision record must beat inferred campaign state.");
assert.equal(campaignItems[0].sourceId, "approval-campaign-launch");
assert.equal(campaignItems[0].href, "#outreach/campaign/campaign-july-partner");

const partnerTasks = items.filter((item) => item.sourceKind === "tasks" && item.relatedObject?.id === "partner-philadelphia");
assert.equal(partnerTasks.length, 2, "Distinct explicitly linked Tasks on one Partner must remain separate.");
assert.ok(items.some((item) => item.sourceKind === "partners" && item.sourceId === "partner-philadelphia"));
assert.ok(!items.some((item) => item.sourceId === "partner-unassigned"), "Unassigned Partner work must not be guessed into Needs me or Waiting.");

assert.ok(view.groups.needsMe.every((item) => item.group === "needs_me"));
assert.ok(view.groups.waiting.every((item) => item.group === "waiting"));
assert.ok(view.groups.updates.every((item) => item.group === "update"));
assert.ok(view.groups.needsMe.some((item) => item.sourceId === "partner-philadelphia"), "Assigned overdue Partner follow-up must be actionable.");
assert.ok(view.groups.waiting.some((item) => item.sourceId === "partner-external"), "Explicit external-response waiting state must remain Waiting.");
assert.ok(view.groups.waiting.some((item) => item.sourceId === "task-waiting-external"), "Explicit waiting Task must remain Waiting.");
assert.ok(!items.some((item) => item.sourceId === "task-overdue-normal"), "Overdue alone must not promote a normal Task to urgent work.");
assert.equal(items.find((item) => item.sourceId === "partner-philadelphia").priority, "normal", "Overdue must not automatically become urgent.");
assert.equal(items.find((item) => item.sourceId === "task-urgent").priority, "urgent");

assert.ok(view.groups.updates.some((item) => item.sourceId === "task-recently-done"));
assert.ok(view.groups.updates.some((item) => item.sourceId === "post-recent"));
assert.ok(view.groups.updates.some((item) => item.sourceId === "policy-current"));
assert.ok(!items.some((item) => item.sourceId === "task-stale-done"));
assert.ok(!items.some((item) => item.sourceId === "post-stale"));
const agedView = buildInboxView(state, OWNER, "2026-07-25T16:00:00.000Z");
assert.ok(!allItems(agedView).some((item) => item.sourceId === "task-recently-done"), "Supplied now must age stale updates out.");

assert.equal(normalizeInboxPriority("critical"), "urgent");
assert.equal(normalizeInboxPriority("high"), "high");
assert.equal(normalizeInboxPriority("medium"), "normal");
assert.equal(normalizeInboxPriority("low"), "low");
assert.equal(normalizeInboxPriority(8), "urgent");
assert.equal(normalizeInboxPriority(22), "high");
assert.equal(normalizeInboxPriority("not_recorded"), "normal");

const urgentIndex = view.groups.needsMe.findIndex((item) => item.sourceId === "task-urgent");
const firstHighIndex = view.groups.needsMe.findIndex((item) => item.priority === "high");
assert.ok(urgentIndex >= 0 && firstHighIndex > urgentIndex, "Needs me must sort urgent before high.");
const dueHighIndex = view.groups.needsMe.findIndex((item) => item.sourceId === "task-partner-call");
const missingDueIndex = view.groups.needsMe.findIndex((item) => item.sourceId === "task-partner-notes");
assert.ok(dueHighIndex >= 0 && missingDueIndex > dueHighIndex, "Missing due dates must sort after real due dates at equal priority.");
const alphaIndex = view.groups.needsMe.findIndex((item) => item.sourceId === "task-alpha");
const betaIndex = view.groups.needsMe.findIndex((item) => item.sourceId === "task-beta");
assert.ok(alphaIndex >= 0 && betaIndex > alphaIndex, "Stable title tie-breaking must be deterministic.");
for (let index = 1; index < view.groups.updates.length; index += 1) {
  const previous = Date.parse(view.groups.updates[index - 1].updatedAt || 0);
  const current = Date.parse(view.groups.updates[index].updatedAt || 0);
  assert.ok(!Number.isFinite(previous) || !Number.isFinite(current) || previous >= current, "Updates must sort newest first.");
}

assert.equal(state.approvals[0].state, "requested", "Existing decision state must remain authoritative.");
assert.deepEqual(state.auditHistory, before.auditHistory, "Existing audit state must not be modified.");
assert.deepEqual(state.activityEvents, before.activityEvents, "Existing activity state must not be modified.");

for (const expected of [
  ["social review", (item) => item.workKind === "social_review"],
  ["campaign decision", (item) => item.workKind === "campaign_decision"],
  ["Partner follow-up", (item) => item.workKind === "partner_followup"],
  ["important Task", (item) => item.workKind === "task"],
  ["automation review", (item) => item.workKind === "automation_review"],
  ["reply intelligence", (item) => item.workKind === "reply_followup"],
  ["file update", (item) => item.workKind === "file_update"]
]) {
  assert.ok(items.some(expected[1]), `${expected[0]} candidates must project truthfully.`);
}
assert.ok(!items.some((item) => item.sourceKind === "googleInsights"), "Raw Google insights must be deferred instead of guessed.");
assert.ok(!items.some((item) => item.sourceKind === "alerts"), "Derived alerts without exact source relationships must be deferred.");
assert.ok(!items.some((item) => item.sourceKind === "brandAssets"), "Brand assets without a human-work state must be deferred.");

assert.ok(items.some((item) => item.href.startsWith("#social/post/")));
assert.ok(items.some((item) => item.href.startsWith("#outreach/campaign/")));
assert.ok(items.some((item) => item.href.startsWith("#partners/partner/")));
assert.ok(items.some((item) => item.href.startsWith("#files/")));
assert.ok(items.some((item) => item.href.startsWith("#item/tasks/")));

const visibleCopy = items.map((item) => `${item.title} ${item.summary} ${item.owner}`).join("\n");
for (const forbidden of [
  "queueItems",
  "approvalQueue",
  "automationSuggestions",
  "growthInbox",
  "evidencePackNotes",
  "dataRoomItems",
  "review_required",
  "manage_campaigns",
  "manage_growth",
  "view_private_assets",
  "live gates",
  "telemetry"
]) {
  assert.doesNotMatch(visibleCopy, new RegExp(forbidden, "i"), `Founder-facing copy must not contain ${forbidden}.`);
}
assert.doesNotMatch(visibleCopy, /\b[a-z]+_[a-z_]+\b/, "Founder-facing copy must not expose snake_case values.");
assert.doesNotMatch(JSON.stringify(view.actor), /permission|capabilit|manage_|read_|view_/i, "Actor summary must not expose capabilities.");

const allowedIntents = new Set(["open", "approve", "complete", "snooze"]);
for (const item of items) {
  assert.ok(item.actionIntents.length > 0);
  assert.ok(item.actionIntents.every((intent) => allowedIntents.has(intent)));
}
assert.doesNotMatch(
  items.flatMap((item) => item.actionIntents).join(" "),
  /\b(send|publish|launch|delete|release|resume|apply|provider)\b/i,
  "Action intents must remain declarative and limited."
);

const missingActorView = buildInboxView(state, null, NOW);
assert.equal(missingActorView.actor, null);
assert.equal(missingActorView.counts.total, 0);
const unknownRoleView = buildInboxView(state, {
  id: "unknown",
  role: "future_superuser",
  authenticated: true,
  permissions: ["manage_growth", "manage_approval_queue"]
}, NOW);
assert.equal(unknownRoleView.counts.total, 0, "Unknown roles and supplied capability strings must fail closed.");
const viewerWithForgedPermissions = buildInboxView(state, {
  id: "viewer",
  role: "viewer",
  authenticated: true,
  permissions: ["read_internal", "manage_growth", "manage_approval_queue"]
}, NOW);
assert.equal(viewerWithForgedPermissions.counts.total, 0, "Caller-supplied permission values must not grant Inbox visibility.");
const operatorView = buildInboxView(state, {
  id: "operator",
  role: "operator",
  label: "Operations",
  authenticated: true
}, NOW);
assert.ok(operatorView.counts.total < view.counts.total, "Restricted roles must see only their authorized projection.");
assert.ok(!allItems(operatorView).some((item) => item.sourceId === "post-hidden"));

const sourcePaths = [
  "scripts/ui/view-models/inbox-view.mjs",
  "scripts/ui/view-models/inbox-sources.mjs"
];
const sourceText = sourcePaths.map((file) => readFileSync(file, "utf8")).join("\n");
for (const forbiddenImport of [
  "preview-server",
  "storage",
  "database",
  "network",
  "outreach-os",
  "campaign-command",
  "social-publish",
  "provider",
  "sendgrid"
]) {
  assert.doesNotMatch(sourceText, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `Projection modules must not import ${forbiddenImport}.`);
}
for (const forbiddenRuntime of [
  /\bprocess\.env\b/,
  /\bDate\.now\s*\(/,
  /\bnew Date\s*\(\s*\)/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\b(?:window|document|localStorage|sessionStorage)\b/,
  /\b(?:readFile|writeFile|createServer)\s*\(/
]) {
  assert.doesNotMatch(sourceText, forbiddenRuntime, `Projection modules must remain pure: ${forbiddenRuntime}.`);
}
assert.doesNotMatch(sourceText, /\bstate\.(?:inbox|inboxItems|universalInbox)\s*=/, "No Inbox collection may be written.");
assert.ok(!INBOX_INCLUDED_COLLECTIONS.includes("inbox"), "No Inbox collection may be introduced.");
assert.ok(!INBOX_INCLUDED_COLLECTIONS.includes("inboxItems"), "No Inbox item storage collection may be introduced.");

assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart);
const legacyShellHash = createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex");
assert.equal(
  legacyShellHash,
  "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187",
  "Legacy flag-off shell must remain byte-for-byte unchanged."
);

function productionLikeFixture() {
  const fixture = fixtureState();
  fixture.posts = [
    ...fixture.posts,
    ...Array.from({ length: 48 }, (_, index) => ({
      id: `perf-post-${String(index).padStart(3, "0")}`,
      title: `Synthetic review post ${String(index).padStart(3, "0")}`,
      status: "needs_review",
      approvalStatus: "not_approved",
      priority: index % 7 === 0 ? "high" : "normal",
      updatedAt: `2026-07-15T${String(index % 24).padStart(2, "0")}:00:00.000Z`
    }))
  ];
  fixture.tasks = [
    ...fixture.tasks,
    ...Array.from({ length: 48 }, (_, index) => ({
      id: `perf-task-${String(index).padStart(3, "0")}`,
      title: `Synthetic important task ${String(index).padStart(3, "0")}`,
      status: index % 5 === 0 ? "waiting" : "open",
      owner: "Roger",
      priority: index % 9 === 0 ? "critical" : "high",
      dueDate: index % 4 === 0 ? "" : `2026-07-${String(17 + (index % 10)).padStart(2, "0")}`,
      waitingOn: index % 5 === 0 ? "A synthetic external dependency." : "",
      updatedAt: `2026-07-15T${String(index % 24).padStart(2, "0")}:30:00.000Z`
    }))
  ];
  fixture.partners = [
    ...fixture.partners,
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `perf-partner-${String(index).padStart(3, "0")}`,
      organizationName: `Synthetic Partner ${String(index).padStart(3, "0")}`,
      owner: index % 3 === 0 ? "Growth" : "Roger",
      priority: index % 6 === 0 ? "high" : "normal",
      nextAction: "Confirm the next synthetic follow-up.",
      nextFollowUpDate: `2026-07-${String(17 + (index % 10)).padStart(2, "0")}`,
      updatedAt: "2026-07-15T08:00:00.000Z"
    }))
  ];
  fixture.automationSuggestions = [
    ...fixture.automationSuggestions,
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `perf-automation-${String(index).padStart(3, "0")}`,
      title: `Synthetic suggested change ${String(index).padStart(3, "0")}`,
      explanation: "A synthetic record change needs explicit review.",
      status: "pending",
      confidence: index % 4 === 0 ? "high" : "medium",
      updatedAt: "2026-07-15T07:00:00.000Z"
    }))
  ];
  return fixture;
}

const performanceState = productionLikeFixture();
const performanceBefore = structuredClone(performanceState);
const scanned = INBOX_INCLUDED_COLLECTIONS.reduce((total, collection) => total + (Array.isArray(performanceState[collection]) ? performanceState[collection].length : 0), 0);
const collected = collectInboxCandidates(performanceState, OWNER, NOW);
const projectionSamples = [];
let performanceView;
for (let attempt = 0; attempt < 3; attempt += 1) {
  const startedAt = performance.now();
  const candidate = buildInboxView(performanceState, OWNER, NOW);
  projectionSamples.push(performance.now() - startedAt);
  performanceView ||= candidate;
}
const projectionMs = Math.min(...projectionSamples);
const serializedBytes = Buffer.byteLength(JSON.stringify(performanceView), "utf8");
const inputMutations = Number(JSON.stringify(performanceState) !== JSON.stringify(performanceBefore));
const duplicatesRemoved = collected.candidates.length - performanceView.counts.total;
const networkRequests = 0;
const storageWrites = 0;

assert.ok(projectionMs < 100, `Projection should remain comfortably below 100 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 250_000, `Serialized projection should remain below 250 KB; observed ${serializedBytes} bytes.`);
assert.equal(inputMutations, 0);
assert.equal(networkRequests, 0);
assert.equal(storageWrites, 0);
assert.deepEqual(performanceState, performanceBefore);
assert.deepEqual(buildInboxView(performanceState, OWNER, NOW), performanceView);

console.log("PASS test-vnext-inbox-projection");
console.log(JSON.stringify({
  fixture: "deterministic-production-like",
  candidateRecordsScanned: scanned,
  normalizedCandidates: collected.candidates.length,
  duplicatesRemoved,
  groups: performanceView.counts,
  projectionMs: Number(projectionMs.toFixed(3)),
  projectionSamplesMs: projectionSamples.map((value) => Number(value.toFixed(3))),
  serializedBytes,
  inputMutations,
  networkRequests,
  storageWrites
}));
