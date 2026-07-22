import assert from "node:assert/strict";
import {
  TaskWorkbenchError,
  applyTaskWorkbenchAction,
  buildTaskWorkbenchView,
  parseTaskWorkbenchAction
} from "./task-workbench-service.mjs";

const now = "2026-07-21T14:00:00.000Z";
const owner = { id:"founder", role:"owner", label:"Roger", authenticated:true };
const operator = { id:"operator", role:"operator", label:"Operator", authenticated:true };
const base = {
  tasks:[{
    id:"task-founder-follow-up",
    title:"Follow up with Community Partner",
    description:"Send the recap and confirm the next meeting.",
    status:"open",
    priority:"high",
    owner:"Roger",
    dueDate:"2026-07-21",
    nextAction:"Draft the follow-up",
    partnerId:"partner-community",
    sourceType:"partner",
    sourceId:"partner-community",
    createdAt:"2026-07-20T10:00:00.000Z",
    updatedAt:"2026-07-21T12:00:00.000Z",
    history:[{ action:"created", at:"2026-07-20T10:00:00.000Z", note:"Created from a meeting." }]
  }],
  partners:[{ id:"partner-community", organizationName:"Community Partner", owner:"Roger" }],
  auditHistory:[],
  activityEvents:[]
};

const opened = buildTaskWorkbenchView(base, owner, "task-founder-follow-up");
assert.equal(opened.ok, true);
assert.equal(opened.task.title, "Follow up with Community Partner");
assert.equal(opened.task.version, "2026-07-21T12:00:00.000Z");
assert.equal(opened.task.linkedSource.label, "Partner");
assert.match(opened.task.linkedSource.href, /^#partners\//);
assert.ok(opened.task.actions.includes("done"));
assert.ok(opened.task.actions.includes("blocked"));

assert.throws(
  () => parseTaskWorkbenchAction({ action:"waiting", expectedVersion:opened.task.version, waitingOn:"" }),
  (error) => error instanceof TaskWorkbenchError && error.field === "waitingOn"
);
assert.throws(
  () => parseTaskWorkbenchAction({ action:"blocked", expectedVersion:opened.task.version, blockerReason:"" }),
  (error) => error instanceof TaskWorkbenchError && error.field === "blockerReason"
);
assert.throws(
  () => parseTaskWorkbenchAction({ action:"update_due_date", expectedVersion:opened.task.version, dueDate:"2026-02-30" }),
  (error) => error instanceof TaskWorkbenchError && error.field === "dueDate"
);

const progressed = applyTaskWorkbenchAction(base, owner, "task-founder-follow-up", {
  action:"in_progress",
  expectedVersion:opened.task.version
}, { now });
assert.equal(progressed.body.task.status, "in_progress");
assert.equal(progressed.body.message, "Task marked in progress.");
assert.equal(progressed.collections.tasks.length, 1);
assert.equal(progressed.collections.auditHistory.length, 1);
assert.equal(progressed.collections.activityEvents.length, 1);
assert.equal(Object.hasOwn(progressed.body, "state"), false, "compact action must not return full state");

const waiting = applyTaskWorkbenchAction(progressed.state, owner, "task-founder-follow-up", {
  action:"waiting",
  expectedVersion:progressed.body.task.version,
  waitingOn:"Community Partner confirmation"
}, { now:"2026-07-21T14:05:00.000Z" });
assert.equal(waiting.body.task.status, "waiting");
assert.equal(waiting.body.task.waitingOn, "Community Partner confirmation");

const noted = applyTaskWorkbenchAction(waiting.state, owner, "task-founder-follow-up", {
  action:"add_note",
  expectedVersion:waiting.body.task.version,
  note:"Recap is ready for final review."
}, { now:"2026-07-21T14:10:00.000Z" });
assert.equal(noted.body.task.history[0].note, "Recap is ready for final review.");

const completed = applyTaskWorkbenchAction(noted.state, owner, "task-founder-follow-up", {
  action:"done",
  expectedVersion:noted.body.task.version,
  note:"Recap sent manually."
}, { now:"2026-07-21T14:15:00.000Z" });
assert.equal(completed.body.task.status, "done");
assert.equal(completed.body.task.completionNote, "Recap sent manually.");
assert.deepEqual(completed.body.task.actions, ["reopen", "add_note"]);

assert.throws(
  () => applyTaskWorkbenchAction(base, owner, "task-founder-follow-up", {
    action:"done",
    expectedVersion:"2026-07-20T12:00:00.000Z"
  }, { now }),
  (error) => error instanceof TaskWorkbenchError && error.status === 409
);

const legacy = { ...base, tasks:[{ id:"task-legacy", title:"Legacy task", status:"open", owner:"Roger" }] };
const legacyView = buildTaskWorkbenchView(legacy, owner, "task-legacy");
assert.equal(legacyView.task.version, "legacy");
const legacyDone = applyTaskWorkbenchAction(legacy, owner, "task-legacy", {
  action:"done",
  expectedVersion:"legacy"
}, { now });
assert.equal(legacyDone.body.task.status, "done");
assert.notEqual(legacyDone.body.task.version, "legacy");

const ownerOnly = { ...base, tasks:[{ ...base.tasks[0], ownerOnly:true }] };
assert.throws(
  () => buildTaskWorkbenchView(ownerOnly, operator, "task-founder-follow-up"),
  (error) => error instanceof TaskWorkbenchError && error.status === 404
);

console.log("PASS test-vnext-task-workbench");
