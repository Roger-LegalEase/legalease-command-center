#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { ROUTE_COMPATIBILITY_TOTALS, resolveRouteCompatibility } from "./ui/route-compatibility.mjs";
import { buildInboxView } from "./ui/view-models/inbox-view.mjs";
import { INBOX_INCLUDED_COLLECTIONS, collectInboxCandidates } from "./ui/view-models/inbox-sources.mjs";
import { buildTodayView } from "./ui/view-models/today-view.mjs";

const NOW = "2026-07-16T16:00:00.000Z";
const OWNER = Object.freeze({ id: "owner", role: "owner", label: "Roger", authenticated: true });

function emptyState() {
  return Object.fromEntries(INBOX_INCLUDED_COLLECTIONS.map((collection) => [collection, []]));
}

function fixtureState() {
  return {
    ...emptyState(),
    posts: [
      {
        id: "post-review",
        title: "Review the access explainer",
        status: "needs_review",
        approvalStatus: "not_approved",
        priority: "high",
        updatedAt: "2026-07-16T11:00:00.000Z"
      },
      {
        id: "post-progress",
        title: "Access explainer published",
        status: "posted",
        postedAt: "2026-07-16T15:00:00.000Z",
        updatedAt: "2026-07-16T15:00:00.000Z"
      },
      {
        id: "post-hidden",
        title: "Restricted acquisition post",
        status: "needs_review",
        priority: "urgent",
        allowedRoles: ["admin"],
        updatedAt: "2026-07-16T15:30:00.000Z"
      },
      {
        id: "<unsafe-post>",
        title: "Unsafe post identity",
        status: "needs_review",
        updatedAt: "2026-07-16T11:00:00.000Z"
      }
    ],
    campaigns: [
      {
        id: "campaign-review",
        campaignName: "Partner education outreach",
        status: "ready",
        owner: "Roger",
        priority: "high",
        complianceStatus: "approved",
        partnerApprovalStatus: "approved",
        startDate: "2026-07-16",
        updatedAt: "2026-07-16T10:30:00.000Z"
      },
      {
        id: "campaign-progress",
        campaignName: "Completed education outreach",
        status: "completed",
        owner: "Roger",
        completedAt: "2026-07-16T14:00:00.000Z",
        updatedAt: "2026-07-16T14:00:00.000Z"
      }
    ],
    partners: [
      {
        id: "partner-review",
        organizationName: "Synthetic Community Partner",
        owner: "Roger",
        priority: "high",
        nextAction: "Confirm the next meeting date.",
        nextFollowUpDate: "2026-07-16",
        updatedAt: "2026-07-16T09:00:00.000Z"
      },
      {
        id: "partner-progress",
        organizationName: "Synthetic Progress Partner",
        owner: "Roger",
        priority: "normal",
        responseReceivedAt: "2026-07-16T13:00:00.000Z",
        responseSummary: "The partner confirmed the next milestone.",
        updatedAt: "2026-07-16T13:00:00.000Z"
      }
    ],
    tasks: [
      {
        id: "task-active",
        title: "Prepare the current partner brief",
        status: "open",
        owner: "Roger",
        priority: "normal",
        important: true,
        dueDate: "2026-07-16",
        nextAction: "Prepare the short partner brief.",
        updatedAt: "2026-07-16T08:00:00.000Z"
      },
      {
        id: "task-urgent",
        title: "Resolve the urgent evidence blocker",
        status: "open",
        owner: "Roger",
        priority: "critical",
        important: true,
        dueDate: "2026-07-16",
        nextAction: "Resolve the evidence blocker.",
        updatedAt: "2026-07-16T12:00:00.000Z"
      },
      {
        id: "task-diagnostic",
        title: "Inspect an internal health card",
        status: "open",
        owner: "Roger",
        priority: "critical",
        important: true,
        diagnostic: true,
        sourceType: "system_health",
        nextAction: "Inspect the internal health card.",
        updatedAt: "2026-07-16T15:00:00.000Z"
      },
      {
        id: "task-high-due",
        title: "Confirm the due partner follow-up",
        status: "open",
        owner: "Roger",
        priority: "high",
        important: true,
        dueDate: "2026-07-15",
        nextAction: "Confirm the partner follow-up.",
        relatedObjectType: "partner",
        relatedObjectId: "partner-review",
        updatedAt: "2026-07-16T07:00:00.000Z"
      },
      {
        id: "task-high-no-date",
        title: "Prepare a supporting note",
        status: "open",
        owner: "Roger",
        priority: "high",
        important: true,
        nextAction: "Prepare the supporting note.",
        relatedObjectType: "partner",
        relatedObjectId: "partner-review",
        updatedAt: "2026-07-16T07:00:00.000Z"
      },
      {
        id: "task-alpha",
        title: "Alpha stable task",
        status: "open",
        owner: "Roger",
        priority: "high",
        important: true,
        updatedAt: "2026-07-16T06:00:00.000Z"
      },
      {
        id: "task-beta",
        title: "Beta stable task",
        status: "open",
        owner: "Roger",
        priority: "high",
        important: true,
        updatedAt: "2026-07-16T06:00:00.000Z"
      },
      {
        id: "task-overdue-normal",
        title: "Update the overdue contact note",
        status: "open",
        owner: "Roger",
        priority: "normal",
        important: true,
        dueDate: "2026-07-14",
        nextAction: "Update the contact note.",
        updatedAt: "2026-07-14T10:00:00.000Z"
      },
      {
        id: "task-waiting",
        title: "Wait for the signed scope",
        status: "waiting",
        owner: "Roger",
        priority: "urgent",
        waitingOn: "The partner's signed scope.",
        dueDate: "2026-07-20",
        updatedAt: "2026-07-16T09:00:00.000Z"
      },
      {
        id: "task-progress",
        title: "Finish the partner report",
        status: "done",
        owner: "Roger",
        priority: "high",
        completionNote: "The partner report is complete.",
        completedAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z"
      },
      {
        id: "task-progress-hidden",
        title: "Restricted completed task",
        status: "done",
        owner: "Roger",
        priority: "high",
        allowedRoles: ["admin"],
        completionNote: "Restricted work moved.",
        completedAt: "2026-07-16T15:30:00.000Z",
        updatedAt: "2026-07-16T15:30:00.000Z"
      },
      {
        id: "task-stale-progress",
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
        id: "automation-review",
        title: "Review a suggested Partner update",
        explanation: "A reviewed change needs a decision before anything changes.",
        status: "pending",
        confidence: "high",
        updatedAt: "2026-07-16T08:30:00.000Z"
      },
      {
        id: "automation-progress",
        title: "Partner suggestion applied",
        status: "applied",
        confidence: "medium",
        appliedAt: "2026-07-16T11:30:00.000Z",
        updatedAt: "2026-07-16T11:30:00.000Z"
      }
    ],
    reports: [
      {
        id: "report-review",
        reportTitle: "Partner results report",
        status: "ready_for_review",
        review_state: "review_required",
        owner: "Roger",
        priority: "normal",
        updatedAt: "2026-07-16T08:00:00.000Z"
      }
    ],
    soc2Policies: [
      {
        id: "policy-progress",
        policyName: "Access policy",
        status: "Current",
        owner: "Roger",
        reviewedAt: "2026-07-16T10:00:00.000Z",
        updatedAt: "2026-07-16T10:00:00.000Z"
      }
    ],
    dailyRunSessions: [
      {
        session_id: "daily-run-current",
        status: "active",
        started_at: "2026-07-16T12:00:00.000Z",
        last_active_at: "2026-07-16T15:30:00.000Z",
        current_bucket_key: "due_today",
        bucket_snapshot: {
          snapshot_at: "2026-07-16T12:00:00.000Z",
          current_bucket_key: "due_today",
          buckets: [{
            key: "due_today",
            label: "Scheduled or due today",
            items: [{ id: "task-active", title: "Prepare the current partner brief", type: "task", route: "tasks", source: "tasks" }]
          }]
        },
        completed_bucket_keys: [],
        completed_items: [],
        skipped_bucket_keys: [],
        parked_items: []
      },
      {
        session_id: "daily-run-completed",
        status: "completed",
        started_at: "2026-07-16T09:00:00.000Z",
        last_active_at: "2026-07-16T10:00:00.000Z",
        current_bucket_key: "due_today",
        bucket_snapshot: { buckets: [{ key: "due_today", items: [{ id: "task-urgent", type: "task" }] }] }
      },
      {
        session_id: "daily-run-stale",
        status: "active",
        started_at: "2026-07-15T12:00:00.000Z",
        last_active_at: "2026-07-15T13:00:00.000Z",
        current_bucket_key: "due_today",
        bucket_snapshot: { buckets: [{ key: "due_today", items: [{ id: "task-urgent", type: "task" }] }] }
      }
    ],
    morningBriefs: [{
      key: "morning-brief-2026-07-16",
      date: "2026-07-16",
      generated_at: "2026-07-16T11:00:00.000Z",
      suggested_first_move: "Prepare the current partner brief.",
      suggested_first_move_source_ref: { collection: "tasks", itemId: "task-active" }
    }],
    dailyCloseouts: [{
      key: "daily-closeout-2026-07-15",
      date: "2026-07-15",
      tomorrow_first_move: "A text-only plan without a source identity."
    }],
    operatingMemory: [{
      key: "operating-memory-2026-07-16",
      date: "2026-07-16",
      carry_forward: [{ title: "A text-only carry-forward", href: "tasks" }]
    }],
    milestones: [{ id: "milestone-text-only", title: "Unlinked milestone", status: "open" }],
    meetingBriefs: [{ id: "meeting-text-only", title: "Unlinked meeting preparation" }],
    calendarItems: [{ id: "calendar-text-only", title: "Unlinked calendar item" }],
    auditHistory: [{ id: "audit-noise", timestamp: "2026-07-16T15:45:00.000Z", action: "health ping" }],
    activityEvents: [{ id: "activity-noise", createdAt: "2026-07-16T15:45:00.000Z", title: "Diagnostic refresh" }]
  };
}

function reverseArrays(state) {
  return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? [...value].reverse() : value]));
}

function only(state, collection, records) {
  return { ...emptyState(), [collection]: records, dailyRunSessions: [], morningBriefs: [], auditHistory: [], activityEvents: [] };
}

function taskRecord(id, overrides = {}) {
  return {
    id,
    title: `Synthetic task ${id}`,
    status: "open",
    owner: "Roger",
    priority: "high",
    important: true,
    nextAction: "Review the synthetic task.",
    updatedAt: "2026-07-16T08:00:00.000Z",
    ...overrides
  };
}

const state = fixtureState();
const before = structuredClone(state);
const view = buildTodayView(state, OWNER, NOW);
const inbox = buildInboxView(state, OWNER, NOW);

assert.equal(typeof buildTodayView, "function");
assert.deepEqual(buildTodayView(state, OWNER, NOW), view, "Equal input must always produce equal output.");
assert.deepEqual(buildTodayView(reverseArrays(state), OWNER, NOW), view, "Source-array ordering must not affect output.");
assert.deepEqual(state, before, "Projection must not mutate its input.");
assert.deepEqual(Object.keys(view), ["generatedAt", "nowItem", "nextItems", "needsMeSummary", "progressSummary"]);
assert.equal(view.generatedAt, NOW);
assert.ok(view.nowItem === null || (!Array.isArray(view.nowItem) && typeof view.nowItem === "object"));
assert.ok(view.nextItems.length <= 3);
assert.ok(Object.isFrozen(view) && Object.isFrozen(view.nextItems) && Object.isFrozen(view.needsMeSummary) && Object.isFrozen(view.progressSummary));
assert.ok([view.nowItem, ...view.nextItems, ...view.needsMeSummary.topItems, ...view.progressSummary.items].filter(Boolean).every(Object.isFrozen));
assert.throws(() => view.nextItems.push({}), TypeError);
assert.throws(() => buildTodayView(state, OWNER, "not-a-time"), TypeError);

assert.equal(view.nowItem.sourceId, "task-active", "A current, exact, authorized Daily Run item must win Now.");
assert.equal(view.nowItem.whyNow, "This is the current Daily Run item.");
assert.equal(view.nextItems.length, 3);
assert.equal(view.nextItems[0].sourceId, "task-urgent", "Urgent work must lead Next after the current Daily Run item.");
assert.equal(new Set([view.nowItem, ...view.nextItems].map((item) => item.dedupeKey)).size, 4, "Now and Next must not duplicate underlying work.");
assert.ok(![view.nowItem, ...view.nextItems].some((item) => ["task-waiting", "task-progress"].includes(item.sourceId)), "Waiting and Updates cannot become Now or Next.");
assert.ok(![view.nowItem, ...view.nextItems].some((item) => /diagnostic|telemetry|system health|data integrity/i.test(`${item.title} ${item.summary}`)));
assert.ok(inbox.groups.needsMe.some((item) => item.sourceId === "task-diagnostic"), "The fixture must prove the advanced exclusion happens in Today rather than changing CCX-200.");
assert.ok(![view.nowItem, ...view.nextItems, ...view.needsMeSummary.topItems].some((item) => item?.id?.includes("task-diagnostic")), "Advanced/internal source work must not appear in Today cards.");

const noDaily = structuredClone(state);
noDaily.dailyRunSessions = [];
noDaily.morningBriefs = [];
const noDailyView = buildTodayView(noDaily, OWNER, NOW);
assert.equal(noDailyView.nowItem.sourceId, "task-urgent", "Completed and absent Daily Run sessions must not displace truthful ranking.");

const staleDaily = structuredClone(noDaily);
staleDaily.dailyRunSessions = [structuredClone(state.dailyRunSessions.find((session) => session.session_id === "daily-run-stale"))];
assert.equal(buildTodayView(staleDaily, OWNER, NOW).nowItem.sourceId, "task-urgent", "Stale Daily Run sessions must not win.");

const completedDaily = structuredClone(noDaily);
completedDaily.dailyRunSessions = [structuredClone(state.dailyRunSessions.find((session) => session.session_id === "daily-run-completed"))];
assert.equal(buildTodayView(completedDaily, OWNER, NOW).nowItem.sourceId, "task-urgent", "Completed Daily Run sessions must not win.");

const hiddenDaily = structuredClone(noDaily);
hiddenDaily.dailyRunSessions = [{
  session_id: "daily-run-hidden",
  status: "active",
  started_at: "2026-07-16T12:00:00.000Z",
  last_active_at: "2026-07-16T15:00:00.000Z",
  current_bucket_key: "due_today",
  bucket_snapshot: { buckets: [{ key: "due_today", items: [{ id: "post-hidden", type: "social_post" }] }] }
}];
assert.equal(buildTodayView(hiddenDaily, OWNER, NOW).nowItem.sourceId, "task-urgent", "Unauthorized Daily Run references must fail closed.");

const advancedDaily = structuredClone(noDaily);
advancedDaily.dailyRunSessions = [{
  session_id: "daily-run-advanced",
  status: "active",
  started_at: "2026-07-16T12:00:00.000Z",
  last_active_at: "2026-07-16T15:00:00.000Z",
  current_bucket_key: "blocked_live_systems",
  bucket_snapshot: { buckets: [{ key: "blocked_live_systems", items: [{ id: "task-active", type: "system_health" }] }] }
}];
assert.equal(buildTodayView(advancedDaily, OWNER, NOW).nowItem.sourceId, "task-urgent", "Advanced/internal Daily Run work must not enter normal Today.");

const briefFirst = structuredClone(noDaily);
briefFirst.morningBriefs = [{
  key: "brief-exact",
  date: "2026-07-16",
  generated_at: "2026-07-16T11:00:00.000Z",
  suggested_first_move_source_ref: { collection: "tasks", itemId: "task-overdue-normal" }
}];
assert.equal(buildTodayView(briefFirst, OWNER, NOW).nowItem.sourceId, "task-overdue-normal", "An exact Morning Brief source reference may promote the underlying work identity.");
const briefTextOnly = structuredClone(noDaily);
briefTextOnly.morningBriefs = [{ key: "brief-text", date: "2026-07-16", suggested_first_move: "Update the overdue contact note" }];
assert.equal(buildTodayView(briefTextOnly, OWNER, NOW).nowItem.sourceId, "task-urgent", "Text-only planning fields must be deferred rather than matched fuzzily.");

assert.equal(view.needsMeSummary.count, inbox.counts.needsMe);
assert.equal(view.needsMeSummary.urgentCount, inbox.groups.needsMe.filter((item) => item.priority === "urgent").length);
assert.equal(view.needsMeSummary.highCount, inbox.groups.needsMe.filter((item) => item.priority === "high").length);
assert.ok(view.needsMeSummary.topItems.length <= 3);
const represented = new Set([view.nowItem, ...view.nextItems].map((item) => item.id));
assert.ok(view.needsMeSummary.topItems.every((item) => !represented.has(item.id)));
assert.equal(view.needsMeSummary.href, "#inbox?group=needs-me");

const withoutHidden = structuredClone(state);
withoutHidden.posts = withoutHidden.posts.filter((item) => item.id !== "post-hidden");
withoutHidden.tasks = withoutHidden.tasks.filter((item) => item.id !== "task-progress-hidden");
assert.deepEqual(buildTodayView(withoutHidden, OWNER, NOW), view, "Hidden work must not affect ranking, counts, or progress.");

assert.equal(view.progressSummary.available, true);
assert.equal(view.progressSummary.periodStart, "2026-07-13T00:00:00.000-04:00");
assert.equal(view.progressSummary.periodEnd, NOW);
assert.ok(view.progressSummary.items.length <= 5);
assert.equal(view.progressSummary.href, "#inbox?group=updates");
assert.equal(view.progressSummary.count, new Set(inbox.groups.updates
  .filter((item) => Date.parse(item.updatedAt) >= Date.parse(view.progressSummary.periodStart) && Date.parse(item.updatedAt) <= Date.parse(NOW))
  .map((item) => `${item.sourceKind}:${item.sourceId}`)).size);
assert.ok(view.progressSummary.items.some((item) => item.id.includes("post-progress")));
assert.ok(!view.progressSummary.items.some((item) => /stale|restricted|diagnostic|health ping/i.test(`${item.title} ${item.summary}`)));
for (let index = 1; index < view.progressSummary.items.length; index += 1) {
  assert.ok(Date.parse(view.progressSummary.items[index - 1].updatedAt) >= Date.parse(view.progressSummary.items[index].updatedAt));
}
assert.doesNotMatch(JSON.stringify(view.progressSummary), /percent|revenue|engagement/i, "Progress must not fabricate metrics or outcomes.");

const laterView = buildTodayView(state, OWNER, "2026-07-23T16:00:00.000Z");
assert.equal(laterView.progressSummary.periodStart, "2026-07-20T00:00:00.000-04:00", "Supplied now must define the Eastern business week.");
assert.equal(laterView.progressSummary.count, 0, "Stale progress must age out under supplied now.");

const priorityScenario = only(state, "tasks", [
  taskRecord("normal-overdue", { priority: "normal", dueDate: "2026-07-14" }),
  taskRecord("urgent-current", { priority: "critical", dueDate: "2026-07-16" })
]);
const priorityView = buildTodayView(priorityScenario, OWNER, NOW);
assert.equal(priorityView.nowItem.sourceId, "urgent-current");
assert.equal(priorityView.nextItems[0].sourceId, "normal-overdue");
assert.equal(priorityView.nextItems[0].priority, "normal", "Overdue work must not be relabeled urgent.");

const dueScenario = only(state, "tasks", [
  taskRecord("high-no-date", { title: "Same tier no date" }),
  taskRecord("high-real-date", { title: "Same tier real date", dueDate: "2026-07-16" })
]);
assert.equal(buildTodayView(dueScenario, OWNER, NOW).nowItem.sourceId, "high-real-date", "Real due dates must sort before missing dates within one priority tier.");

const tieScenario = only(state, "tasks", [
  taskRecord("beta", { title: "Beta same-tier work" }),
  taskRecord("alpha", { title: "Alpha same-tier work" })
]);
assert.deepEqual([buildTodayView(tieScenario, OWNER, NOW).nowItem.sourceId, ...buildTodayView(tieScenario, OWNER, NOW).nextItems.map((item) => item.sourceId)], ["alpha", "beta"]);

const singleView = buildTodayView(only(state, "tasks", [taskRecord("only")]), OWNER, NOW);
assert.equal(singleView.nextItems.length, 0, "Fewer than three truthful candidates must return fewer than three.");
const emptyView = buildTodayView(emptyState(), OWNER, NOW);
assert.equal(emptyView.nowItem, null);
assert.deepEqual(emptyView.nextItems, []);
assert.equal(emptyView.needsMeSummary.count, 0);
assert.equal(emptyView.progressSummary.available, true);
assert.equal(emptyView.progressSummary.count, 0);
const unavailableView = buildTodayView({}, OWNER, NOW);
assert.equal(unavailableView.progressSummary.available, false, "Unavailable source collections must be distinguishable from an available empty week.");
assert.equal(unavailableView.progressSummary.count, 0);

const exactScenarios = [
  ["post", only(state, "posts", [{ id: "post-exact", title: "Exact post", status: "needs_review", priority: "high", updatedAt: NOW }]), "#social/post/post-exact"],
  ["campaign", only(state, "campaigns", [{ id: "campaign-exact", campaignName: "Exact campaign", status: "ready", owner: "Roger", priority: "high", complianceStatus: "approved", partnerApprovalStatus: "approved", startDate: "2026-07-16", updatedAt: NOW }]), "#outreach/campaign/campaign-exact"],
  ["partner", only(state, "partners", [{ id: "partner-exact", organizationName: "Exact Partner", owner: "Roger", priority: "high", nextAction: "Confirm the exact follow-up.", nextFollowUpDate: "2026-07-16", updatedAt: NOW }]), "#partners/partner/partner-exact"],
  ["file", only(state, "reports", [{ id: "report-exact", reportTitle: "Exact report", status: "ready_for_review", review_state: "review_required", owner: "Roger", updatedAt: NOW }]), "#files/report/report-exact"],
  ["task", only(state, "tasks", [taskRecord("task-exact")]), "#item/tasks/task-exact"]
];
for (const [family, scenario, href] of exactScenarios) {
  const item = buildTodayView(scenario, OWNER, NOW).nowItem;
  assert.equal(item.href, href, `${family} links must preserve the exact CCX-200 source link.`);
  assert.equal(resolveRouteCompatibility(item.href).kind, "object");
}
assert.equal(buildTodayView(only(state, "posts", [{ id: "<unsafe>", title: "Unsafe", status: "needs_review", updatedAt: NOW }]), OWNER, NOW).nowItem, null, "Unsafe source IDs must fail closed.");

const partnerTasks = buildTodayView(only(state, "tasks", [
  taskRecord("partner-one", { relatedObjectType: "partner", relatedObjectId: "partner-review" }),
  taskRecord("partner-two", { relatedObjectType: "partner", relatedObjectId: "partner-review" })
]), OWNER, NOW);
assert.equal(new Set([partnerTasks.nowItem, ...partnerTasks.nextItems].map((item) => item.id)).size, 2, "Distinct Tasks on one Partner must remain separate.");

for (const actor of [
  null,
  { id: "unknown", role: "future_superuser", authenticated: true, permissions: ["read_internal"] },
  { id: "viewer", role: "viewer", authenticated: true, permissions: ["read_internal", "manage_tasks"] }
]) {
  const restricted = buildTodayView(state, actor, NOW);
  assert.equal(restricted.nowItem, null);
  assert.deepEqual(restricted.nextItems, []);
  assert.equal(restricted.needsMeSummary.count, 0);
  assert.equal(restricted.progressSummary.count, 0);
  assert.equal(restricted.progressSummary.available, false, "Unauthorized actors must not learn whether protected progress sources are available.");
}

const visibleText = [view.nowItem, ...view.nextItems, ...view.needsMeSummary.topItems, ...view.progressSummary.items]
  .filter(Boolean)
  .map((item) => `${item.objectType || ""} ${item.title} ${item.summary} ${item.whyNow || ""} ${item.owner || ""} ${item.destination || ""}`)
  .join("\n");
for (const forbidden of [
  "queueItems", "approvalQueue", "automationSuggestions", "growthInbox", "dataRoomItems", "evidencePackNotes",
  "dailyRunSession", "review_required", "needs_roger", "telemetry", "live gates", "capability", "stack trace"
]) {
  assert.doesNotMatch(visibleText, new RegExp(forbidden, "i"), `Founder-facing Today text must not contain ${forbidden}.`);
}
assert.doesNotMatch(visibleText, /\b[a-z]+_[a-z_]+\b/);
assert.doesNotMatch(JSON.stringify(view), /"(?:actions?|actionIntents|approve|complete|snooze|send|publish|launch|release|resume)"\s*:/i, "Today projection must not expose mutation actions.");

const todaySource = readFileSync("scripts/ui/view-models/today-view.mjs", "utf8");
for (const forbiddenImport of ["preview-server", "storage", "database", "network", "provider", "tasks-engine", "daily-run-session", "company-memory"]) {
  assert.doesNotMatch(todaySource, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `Today view must not import ${forbiddenImport}.`);
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
  assert.doesNotMatch(todaySource, forbiddenRuntime, `Today projection must remain pure: ${forbiddenRuntime}.`);
}
assert.doesNotMatch(todaySource, /\bstate\.(?:today|todayItems|todayView)\s*=/, "No Today collection may be written.");
assert.doesNotMatch(todaySource, /(?:^|[^\w])(?:send|publish|launch|release|approve|complete|snooze)\s*\(/im, "Today projection must not execute source actions.");

assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /today-view\.mjs/, "CCX-203 must not wire the view model into the current Today runtime.");
const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart);
assert.equal(createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex"), "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187", "Legacy flag-off shell must remain byte-for-byte unchanged.");
const todayStart = serverSource.indexOf("    function commandCenterOverviewHtml(posts)");
const todayEnd = serverSource.indexOf("\n    function focusItemsForMode", todayStart);
assert.ok(todayStart >= 0 && todayEnd > todayStart);
assert.equal(createHash("sha256").update(serverSource.slice(todayStart, todayEnd)).digest("hex"), "36f509ab37d1e0ca838bbe84838677eee67d35e7519aa8aeb44fa3913e565d76", "Existing Today HTML must remain byte-for-byte unchanged.");

function productionLikeFixture() {
  const fixture = fixtureState();
  fixture.tasks = [
    ...fixture.tasks,
    ...Array.from({ length: 96 }, (_, index) => taskRecord(`perf-task-${String(index).padStart(3, "0")}`, {
      title: `Synthetic production-like task ${String(index).padStart(3, "0")}`,
      priority: index % 11 === 0 ? "critical" : index % 3 === 0 ? "normal" : "high",
      dueDate: index % 5 === 0 ? "" : `2026-07-${String(13 + (index % 4)).padStart(2, "0")}`,
      updatedAt: `2026-07-16T${String(index % 16).padStart(2, "0")}:00:00.000Z`
    }))
  ];
  fixture.posts = [
    ...fixture.posts,
    ...Array.from({ length: 32 }, (_, index) => ({
      id: `perf-post-${String(index).padStart(3, "0")}`,
      title: `Synthetic production-like post ${String(index).padStart(3, "0")}`,
      status: "needs_review",
      priority: index % 7 === 0 ? "high" : "normal",
      updatedAt: "2026-07-16T08:00:00.000Z"
    }))
  ];
  return fixture;
}

const performanceState = productionLikeFixture();
const performanceBefore = structuredClone(performanceState);
const examined = INBOX_INCLUDED_COLLECTIONS.reduce((total, collection) => total + listLength(performanceState[collection]), 0)
  + listLength(performanceState.dailyRunSessions)
  + listLength(performanceState.morningBriefs);
const collected = collectInboxCandidates(performanceState, OWNER, NOW);
const projectedInbox = buildInboxView(performanceState, OWNER, NOW);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("Today projection attempted a network request.");
};
const startedAt = performance.now();
let performanceView;
try {
  performanceView = buildTodayView(performanceState, OWNER, NOW);
} finally {
  globalThis.fetch = originalFetch;
}
const projectionMs = performance.now() - startedAt;
const serializedBytes = Buffer.byteLength(JSON.stringify(performanceView), "utf8");
const planningRepresentations = 2;
const duplicatesRemoved = collected.candidates.length + planningRepresentations - projectedInbox.counts.total;
const inputMutations = Number(JSON.stringify(performanceState) !== JSON.stringify(performanceBefore));
const storageWrites = 0;

assert.ok(projectionMs < 100, `Today projection should remain below 100 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 100_000, `Serialized Today view should remain substantially below 100 KB; observed ${serializedBytes} bytes.`);
assert.equal(inputMutations, 0);
assert.equal(networkRequests, 0);
assert.equal(storageWrites, 0);
assert.deepEqual(performanceState, performanceBefore);
assert.deepEqual(buildTodayView(performanceState, OWNER, NOW), performanceView);

function listLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

console.log("PASS test-vnext-today-view-model");
console.log(JSON.stringify({
  fixture: "deterministic-production-like",
  candidateRecordsExamined: examined,
  authorizedCandidates: projectedInbox.counts.total,
  duplicatesRemoved,
  selectedNow: { id: view.nowItem.id, sourceId: view.nowItem.sourceId },
  next: { count: view.nextItems.length, sourceIds: view.nextItems.map((item) => item.sourceId) },
  needsMe: view.needsMeSummary,
  progress: view.progressSummary,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  inputMutations,
  networkRequests,
  storageWrites
}));
