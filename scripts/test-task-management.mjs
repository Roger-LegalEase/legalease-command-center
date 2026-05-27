import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeTaskRecord,
  taskViews,
  updateTask,
  updateTaskInState,
  tasksForView
} from "./tasks-engine.mjs";
import { createCaptureInboxItem, routeCaptureInboxItem } from "./lee-quick-capture.mjs";
import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { buildMorningBriefRecord } from "./morning-brief.mjs";
import { buildEveningReflectionRecord } from "./evening-reflection.mjs";
import { buildOperatorSearchIndex, runOperatorSearchAction } from "./operator-search.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const now = "2026-05-27T12:00:00.000Z";
const today = "2026-05-27";
const baseTask = normalizeTaskRecord({
  id: "task-management-1",
  title: "Confirm RCAP dashboard requirements",
  description: "Roger needs the missing dashboard requirements before handoff.",
  owner: "Roger",
  status: "open",
  priority: "high",
  due_date: today,
  source: "rcap_review",
  linked_partner: "RCAP",
  linked_workflow: "RCAP",
  risk_level: "medium",
  escalation_reason: "Blocks handoff readiness.",
  review_state: "review_required"
}, { now });

assert.equal(baseTask.due_date, today, "Task should expose due_date.");
assert.equal(baseTask.dueDate, today, "Task should preserve dueDate compatibility.");
assert.equal(baseTask.source, "rcap_review", "Task should expose source.");
assert.equal(baseTask.sourceType, "rcap_review", "Task should preserve sourceType compatibility.");
assert.equal(baseTask.linked_partner, "RCAP", "Task should expose linked_partner.");
assert.equal(baseTask.linked_workflow, "RCAP", "Task should expose linked_workflow.");
assert.equal(baseTask.risk_level, "medium", "Task should expose risk_level.");
assert.equal(baseTask.escalation_reason, "Blocks handoff readiness.", "Task should expose escalation_reason.");
assert(taskViews.some(view => view.id === "today"), "Task views should include today.");
assert(taskViews.some(view => view.id === "blocked"), "Task views should include blocked.");
assert(taskViews.some(view => view.id === "waiting"), "Task views should include waiting.");
assert(taskViews.some(view => view.id === "this-week"), "Task views should include this week.");

const inProgress = updateTask(baseTask, "in_progress", { note: "Started review." }, { now: "2026-05-27T12:05:00.000Z", actor: "owner_token" });
assert.equal(inProgress.status, "in_progress", "Mark In Progress should set status.");

const waiting = updateTask(inProgress, "waiting", { waiting_on: "Roger needs partner dashboard requirements." }, { now: "2026-05-27T12:10:00.000Z", actor: "owner_token" });
assert.equal(waiting.status, "waiting", "Mark Waiting should set waiting status.");
assert.equal(waiting.waiting_on, "Roger needs partner dashboard requirements.", "Waiting transition should store waiting_on note.");

assert.throws(() => updateTask(waiting, "blocked", {}, { now: "2026-05-27T12:15:00.000Z", actor: "owner_token" }), /blocker reason|required/i, "Blocked transition should require blocker_reason.");
const blocked = updateTask(waiting, "blocked", { blocker_reason: "Missing dashboard data source." }, { now: "2026-05-27T12:15:00.000Z", actor: "owner_token" });
assert.equal(blocked.status, "blocked", "Mark Blocked should set blocked status.");
assert.equal(blocked.blocker_reason, "Missing dashboard data source.", "Blocked transition should store blocker_reason.");

const reopened = updateTask(blocked, "reopen", { note: "Data source confirmed." }, { now: "2026-05-27T12:20:00.000Z", actor: "owner_token" });
assert.equal(reopened.status, "open", "Reopen should return task to open.");

const done = updateTask(reopened, "done", { completion_note: "Dashboard requirements confirmed." }, { now: "2026-05-27T12:25:00.000Z", actor: "owner_token" });
assert.equal(done.status, "done", "Mark Done should set done status.");
assert.equal(done.completion_note, "Dashboard requirements confirmed.", "Done transition should store completion note.");

const archived = updateTask(done, "archive", { note: "Archived after completion." }, { now: "2026-05-27T12:30:00.000Z", actor: "owner_token" });
assert.equal(archived.status, "archived", "Archive should set archived status.");

const noted = updateTask(reopened, "add_note", { note: "Internal note only." }, { now: "2026-05-27T12:35:00.000Z", actor: "owner_token" });
assert(noted.history.some(entry => /Internal note only/i.test(entry.note || "")), "Add Note should add history note.");

const priorityUpdated = updateTask(noted, "update_priority", { priority: "critical" }, { now: "2026-05-27T12:40:00.000Z", actor: "owner_token" });
assert.equal(priorityUpdated.priority, "critical", "Update Priority should store priority.");

const dueUpdated = updateTask(priorityUpdated, "update_due_date", { due_date: "2026-05-29" }, { now: "2026-05-27T12:45:00.000Z", actor: "owner_token" });
assert.equal(dueUpdated.due_date, "2026-05-29", "Update Due Date should store due_date.");

const state = {
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  tasks: [baseTask],
  auditHistory: [],
  activityEvents: []
};
const stateUpdated = updateTaskInState(state, "task-management-1", "blocked", { blocker_reason: "Waiting on dashboard data." }, { now: "2026-05-27T13:00:00.000Z", actor: "owner_token" });
assert.equal(stateUpdated.task.status, "blocked", "State task transition should update the task.");
assert.equal(stateUpdated.state.auditHistory[0].action, "task status changed", "Task transition should create audit entry.");
assert.equal(stateUpdated.state.activityEvents[0].eventType, "Task status changed", "Task transition should create activity event.");
assert.equal(stateUpdated.state.activityEvents[0].metadata.externalSideEffects, false, "Task transition should be internal-only.");
assert.equal(Object.values(stateUpdated.state.runtime.livePostingGates).filter(gate => gate.enabled).length, 0, "Live gates must remain 0.");

const viewState = {
  runtime: state.runtime,
  tasks: [
    baseTask,
    { ...baseTask, id: "task-blocked", title: "Blocked task", status: "blocked", blocker_reason: "Missing approval.", due_date: today, dueDate: today },
    { ...baseTask, id: "task-waiting", title: "Waiting task", status: "waiting", waiting_on: "Partner reply.", due_date: today, dueDate: today },
    { ...baseTask, id: "task-week", title: "This week task", status: "open", due_date: "2026-05-30", dueDate: "2026-05-30" }
  ]
};
assert(tasksForView(viewState, "today", { now }).some(task => task.id === "task-management-1"), "Today view should include due today tasks.");
assert(tasksForView(viewState, "blocked", { now }).every(task => task.status === "blocked"), "Blocked view should include blocked tasks.");
assert(tasksForView(viewState, "waiting", { now }).every(task => task.status === "waiting"), "Waiting view should include waiting tasks.");
assert(tasksForView(viewState, "this-week", { now }).some(task => task.id === "task-week"), "This week view should include this week's tasks.");

const captured = createCaptureInboxItem(state, {
  raw_input: "Create a task to confirm the RCAP dashboard owner.",
  source_label: "Task management test",
  linked_workflow: "RCAP",
  linked_partner: "RCAP",
  priority: "high"
}, { now: "2026-05-27T13:10:00.000Z", actor: "owner_token" });
const routed = routeCaptureInboxItem(captured.state, captured.item.id, "route_task", { now: "2026-05-27T13:15:00.000Z", actor: "owner_token" });
const routedTask = routed.state.tasks.find(task => task.sourceId === captured.item.id);
assert(routedTask, "Quick Capture routed to task should create a task.");
assert(routedTask.due_date, "Quick Capture task should include due_date.");
assert(routedTask.source, "Quick Capture task should include source.");
assert(routedTask.linked_partner === "RCAP", "Quick Capture task should include linked_partner.");
assert(routedTask.linked_workflow === "RCAP", "Quick Capture task should include linked_workflow.");

const loop = buildDailyOperatingLoop(viewState);
assert(loop.top3.some(item => /task/i.test(item.source || "") || /task/i.test(item.title + " " + item.detail)), "Daily Operating Loop should see task state.");

const morning = buildMorningBriefRecord(viewState, { now, date: today });
assert(morning.top_3_actions.some(item => /task|RCAP|dashboard/i.test(item.title + " " + item.detail)), "Morning Brief should include today or high-priority tasks.");

const completedState = updateTaskInState(viewState, "task-management-1", "done", { completion_note: "Finished task movement." }, { now: "2026-05-27T14:00:00.000Z", actor: "owner_token" }).state;
const evening = buildEveningReflectionRecord(completedState, { now: "2026-05-27T20:00:00.000Z", date: today });
assert(evening.state_changes.some(item => /Task status changed|Finished task movement|Confirm RCAP/i.test(item.title + " " + item.detail)), "Evening Reflection should see completed or moved tasks through activity events.");

const index = buildOperatorSearchIndex(viewState);
const taskResult = index.find(item => item.type === "task" && item.id === "task-management-1");
assert(taskResult, "Operator Search should index tasks.");
assert(taskResult.safe_actions.some(action => action.action === "task_mark_done"), "Operator Search should expose safe task actions.");
const searchAction = runOperatorSearchAction(viewState, { action: "task_mark_done", targetId: "task-management-1", note: "Done from search." }, { now: "2026-05-27T14:30:00.000Z", actor: "owner_token" });
assert.equal(searchAction.state.tasks.find(task => task.id === "task-management-1").status, "done", "Operator Search task action should update task internally.");
assert.equal(searchAction.state.activityEvents[0].metadata.externalSideEffects, false, "Operator Search task action should be internal-only.");

assert(serverSource.includes("\"tasks-today\""), "#tasks-today route must be registered.");
assert(serverSource.includes("\"tasks-blocked\""), "#tasks-blocked route must be registered.");
assert(serverSource.includes("\"tasks-waiting\""), "#tasks-waiting route must be registered.");
assert(serverSource.includes("\"tasks-this-week\""), "#tasks-this-week route must be registered.");
assert(serverSource.includes("function cockpitTasksHtml"), "Cockpit task card should render.");
assert(serverSource.includes("Mark In Progress"), "Task actions should include Mark In Progress.");
assert(serverSource.includes("Mark Waiting"), "Task actions should include Mark Waiting.");
assert(serverSource.includes("Mark Blocked"), "Task actions should include Mark Blocked.");
assert(serverSource.includes("Mark Done"), "Task actions should include Mark Done.");
assert(serverSource.includes("Update Priority"), "Task actions should include Update Priority.");
assert(serverSource.includes("Update Due Date"), "Task actions should include Update Due Date.");
assert(serverSource.includes("/api/tasks/"), "Task action endpoint must exist.");
const taskRendererSource = serverSource.match(/function tasksPageHtml[\s\S]*?function partnerProgramList/)?.[0] || "";
assert(!/(send email|publish page|post content|activate dashboard|change live gates|Partner Journey API)/i.test(taskRendererSource), "Task management must not expose external controls.");

console.log("task management tests passed");
