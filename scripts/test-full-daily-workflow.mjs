import assert from "node:assert/strict";
import { createCaptureInboxItem, routeCaptureInboxItem } from "./lee-quick-capture.mjs";
import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { buildDailyCloseoutRecord, saveDailyCloseout } from "./daily-closeout.mjs";
import { buildEveningReflectionRecord, saveEveningReflection } from "./evening-reflection.mjs";
import { buildMorningBriefRecord, saveMorningBrief } from "./morning-brief.mjs";
import { saveTodayOperatingMemory, synthesizeOperatingMemory } from "./operating-memory.mjs";
import { updateTaskInState } from "./tasks-engine.mjs";

const externalActionsConfirmation = "No emails sent, no posts published, no partner pages published, no dashboards activated, no external systems contacted.";
const date = "2026-05-27";
const tomorrow = "2026-05-28";
const actor = "qa_harness";

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function textFrom(value) {
  return JSON.stringify(value || {}).toLowerCase();
}

function assertNoExternalSideEffects(state = {}) {
  assert.equal(liveGatesCount(state), 0, "Live gates must remain 0.");
  const events = [...(state.activityEvents || []), ...(state.auditHistory || []), ...(state.events || [])];
  assert(!events.some(event => event.metadata?.externalSideEffects === true), "No event should record external side effects.");
  assert(!events.some(event => /email sent|post published|page published|dashboard activated|partner journey api/i.test(textFrom(event))), "No external action event should exist.");
}

function summaryItem(title, detail = "") {
  return `${title}${detail ? `: ${detail}` : ""}`;
}

let state = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false },
      instagram: { enabled: false }
    }
  },
  captureInbox: [],
  conversationNotes: [],
  tasks: [],
  operatingMemory: [],
  morningBriefs: [],
  eveningReflections: [],
  dailyCloseouts: [],
  partnerProgramArtifacts: [
    { key: "rcap-proposal-draft-v1", title: "RCAP Proposal Draft", review_state: "review_required", review_updated_at: `${date}T08:00:00.000Z` },
    { key: "rcap-partner-page-draft-v1", title: "RCAP Partner Page Draft", review_state: "review_required", review_updated_at: `${date}T08:05:00.000Z` },
    { key: "rcap-dashboard-readiness-v1", title: "RCAP Dashboard Readiness", review_state: "blocked", blocker_reason: "Dashboard data owner is not confirmed.", review_updated_at: `${date}T08:10:00.000Z` },
    { key: "rcap-manual-review-checklist-v1", title: "RCAP Manual Review Checklist", review_state: "review_required", review_updated_at: `${date}T08:15:00.000Z` }
  ],
  reports: [
    { key: "rcap-weekly-report-draft-v1", title: "RCAP Weekly Report Draft", review_state: "review_required", status: "draft", updatedAt: `${date}T08:20:00.000Z` }
  ],
  evidencePackNotes: [
    { key: "rcap-production-activation-evidence-v1", title: "RCAP Evidence Note", review_state: "approved", status: "recorded", notes: "Activation is review-only.", updatedAt: `${date}T08:25:00.000Z` }
  ],
  partners: [
    { id: "partner-rcap", slug: "rcap", name: "RCAP", missing_external_details: true, missingExternalDetailsList: ["primary contact", "approval authority"] }
  ],
  partnerPrograms: [
    { id: "partner-program-rcap", slug: "rcap", name: "RCAP", jurisdiction: "TBD", targetAudience: "TBD", packageTier: "TBD" }
  ],
  auditHistory: [],
  activityEvents: [],
  events: []
};

const taskCapture = createCaptureInboxItem(state, {
  raw_input: "Task: confirm the RCAP dashboard owner before handoff.",
  source_label: "Daily workflow QA",
  capture_type: "task",
  linked_workflow: "RCAP",
  linked_partner: "RCAP",
  priority: "high"
}, { now: `${date}T09:00:00.000Z`, actor });
state = taskCapture.state;

const blockerCapture = createCaptureInboxItem(state, {
  raw_input: "Blocker: dashboard data source is still missing and blocks the RCAP handoff packet.",
  source_label: "Daily workflow QA",
  capture_type: "blocker",
  linked_workflow: "RCAP",
  linked_partner: "RCAP",
  priority: "critical"
}, { now: `${date}T09:05:00.000Z`, actor });
state = blockerCapture.state;

const reflectionCapture = createCaptureInboxItem(state, {
  raw_input: "Reflection: carry forward the RCAP dashboard decision tomorrow and do not touch live publishing.",
  source_label: "Daily workflow QA",
  capture_type: "reflection_input",
  linked_workflow: "RCAP",
  linked_partner: "RCAP",
  priority: "medium"
}, { now: `${date}T09:10:00.000Z`, actor });
state = reflectionCapture.state;

const ignoredControl = createCaptureInboxItem(state, {
  raw_input: "Ignored control: fake distraction should not appear in rituals or memory.",
  source_label: "Ignored workflow QA",
  capture_type: "carry_forward",
  priority: "low"
}, { now: `${date}T09:12:00.000Z`, actor });
state = ignoredControl.state;

state = routeCaptureInboxItem(state, taskCapture.item.id, "route_task", { now: `${date}T09:20:00.000Z`, actor }).state;
state = routeCaptureInboxItem(state, blockerCapture.item.id, "route_operating_memory", { now: `${date}T09:25:00.000Z`, actor }).state;
state = routeCaptureInboxItem(state, reflectionCapture.item.id, "route_evening_reflection", { now: `${date}T09:30:00.000Z`, actor }).state;
state = routeCaptureInboxItem(state, ignoredControl.item.id, "ignore", { now: `${date}T09:35:00.000Z`, actor }).state;

const routedTask = state.tasks.find(task => task.sourceId === taskCapture.item.id);
assert(routedTask, "Route to Task should create a task from capture.");
assert.equal(routedTask.linked_workflow, "RCAP", "Routed task should keep linked workflow.");
assert.equal(routedTask.linked_partner, "RCAP", "Routed task should keep linked partner.");

let transition = updateTaskInState(state, routedTask.id, "in_progress", { note: "Started from full workflow QA." }, { now: `${date}T10:00:00.000Z`, actor });
state = transition.state;
transition = updateTaskInState(state, routedTask.id, "blocked", { blocker_reason: "Dashboard owner is still missing." }, { now: `${date}T10:15:00.000Z`, actor });
state = transition.state;
assert.equal(transition.task.status, "blocked", "Task should be marked blocked.");
assert.equal(transition.task.blocker_reason, "Dashboard owner is still missing.", "Blocked task should keep blocker reason.");

const morning = saveMorningBrief(state, { now: `${date}T10:30:00.000Z`, date, actor });
state = morning.state;
const loop = buildDailyOperatingLoop(state);
assert.equal(loop.top3.length, 3, "Daily Operating Loop should produce exactly three Top 3 actions.");

const memory = saveTodayOperatingMemory(state, { now: `${date}T11:00:00.000Z`, date, actor });
state = memory.state;

const reflection = saveEveningReflection(state, { now: `${date}T18:00:00.000Z`, date, actor });
state = reflection.state;

const closeout = saveDailyCloseout(state, { now: `${date}T19:00:00.000Z`, date, actor });
state = closeout.state;

const tomorrowPlan = buildDailyCloseoutRecord(state, { now: `${date}T19:05:00.000Z`, date });
assert.equal(tomorrowPlan.tomorrow_top_3.length, 3, "Tomorrow Plan should include exactly three actions.");

const tomorrowBrief = buildMorningBriefRecord(state, { now: `${tomorrow}T08:00:00.000Z`, date: tomorrow });
assert(
  tomorrowBrief.top_3_actions.some(item => /dashboard|RCAP|handoff|blocker/i.test(`${item.title} ${item.detail}`)),
  "Prior-day Tomorrow Plan should influence next Morning Brief."
);

const synthesizedMemory = synthesizeOperatingMemory(state, { now: `${date}T20:00:00.000Z`, date });
const synthesizedReflection = buildEveningReflectionRecord(state, { now: `${date}T20:05:00.000Z`, date });
assert(!textFrom(synthesizedMemory).includes("fake distraction"), "Ignored capture should not influence operating memory.");
assert(!textFrom(synthesizedReflection).includes("fake distraction"), "Ignored capture should not influence evening reflection.");
assert(!textFrom(tomorrowBrief).includes("fake distraction"), "Ignored capture should not influence tomorrow brief.");

assert(state.morningBriefs.some(item => item.key === `morning-brief-${date}`), "Morning Brief should be saved.");
assert(state.operatingMemory.some(item => item.key === `operating-memory-${date}`), "Operating Memory should be saved.");
assert(state.eveningReflections.some(item => item.key === `evening-reflection-${date}`), "Evening Reflection should be saved.");
assert(state.dailyCloseouts.some(item => item.key === `daily-closeout-${date}`), "Daily Closeout should be saved.");
assert(state.auditHistory.length >= 10, "Audit events should be created throughout the workflow.");
assert(state.activityEvents.length >= 10, "Activity events should be created throughout the workflow.");
assert.equal(morning.record.external_actions_confirmation, externalActionsConfirmation, "Morning Brief must confirm no external actions.");
assert.equal(memory.record.external_actions_confirmation, externalActionsConfirmation, "Operating Memory must confirm no external actions.");
assert.equal(reflection.record.external_actions_confirmation, externalActionsConfirmation, "Evening Reflection must confirm no external actions.");
assert.equal(closeout.record.no_external_actions_confirmation, externalActionsConfirmation, "Daily Closeout must confirm no external actions.");
assertNoExternalSideEffects(state);

const summary = {
  capturesCreated: 3,
  ignoredControlCapturesCreated: 1,
  capturesRouted: {
    task: taskCapture.item.id,
    operatingMemory: blockerCapture.item.id,
    eveningReflection: reflectionCapture.item.id,
    ignored: ignoredControl.item.id
  },
  tasksCreated: state.tasks.length,
  taskTransitionsCompleted: ["in_progress", "blocked"],
  morningBriefSaved: Boolean(state.morningBriefs.find(item => item.key === `morning-brief-${date}`)),
  dailyOperatingLoopTop3: loop.top3.map(item => summaryItem(item.title, item.detail)),
  operatingMemorySaved: Boolean(state.operatingMemory.find(item => item.key === `operating-memory-${date}`)),
  eveningReflectionSaved: Boolean(state.eveningReflections.find(item => item.key === `evening-reflection-${date}`)),
  dailyCloseoutSaved: Boolean(state.dailyCloseouts.find(item => item.key === `daily-closeout-${date}`)),
  tomorrowPlanGenerated: tomorrowPlan.tomorrow_top_3.map(item => summaryItem(item.title, item.detail)),
  nextMorningBriefInfluenced: tomorrowBrief.top_3_actions.slice(0, 3).map(item => summaryItem(item.title, item.detail)),
  auditEventsCreated: state.auditHistory.length,
  activityEventsCreated: state.activityEvents.length,
  liveGatesCount: liveGatesCount(state),
  externalActionsConfirmation
};

console.log(JSON.stringify(summary, null, 2));
console.log("full daily workflow QA harness passed");
