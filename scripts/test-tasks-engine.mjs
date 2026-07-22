import assert from "node:assert/strict";
import {
  deriveAutomaticTasks,
  mergeAutomaticTasks,
  normalizeTaskRecord,
  updateTask
} from "./tasks-engine.mjs";

const state = {
  partners: [
    { id: "partner-1", organizationName: "Goodwill", owner: "Roger", nextAction: "", updatedAt: "2026-05-01T00:00:00.000Z" }
  ],
  campaigns: [
    { id: "campaign-1", campaignName: "RecordShield Launch", owner: "Growth", status: "live", updatedAt: "2026-05-01T00:00:00.000Z" }
  ],
  approvalQueue: [
    { id: "approval-1", title: "Blocked post", status: "blocked", sourceId: "post-1", type: "post" }
  ],
  growthInbox: [
    { id: "inbox-1", summary: "Urgent investor follow-up", priority: "high", riskLevel: "medium", status: "new", createdAt: "2026-05-25T00:00:00.000Z" },
    { id: "inbox-2", summary: "Old normal signal", priority: "normal", riskLevel: "low", status: "new", createdAt: "2026-05-24T00:00:00.000Z" }
  ],
  supportIssues: [
    { id: "support-1", title: "Customer complaint", severity: "High", status: "open" }
  ],
  posts: [
    { id: "post-1", title: "Approved missing final", status: "approved" },
    { id: "post-2", title: "Approved missing public URL", status: "approved", imageFinalized: true }
  ],
  soc2Evidence: [
    { id: "evidence-1", evidenceTitle: "Monthly access review", evidenceStatus: "Ready for Review", nextCollectionDue: "2026-05-20" }
  ],
  reports: []
};

const tasks = deriveAutomaticTasks(state, { now: "2026-05-26T12:00:00.000Z", dayOfWeek: 5 });

assert.ok(tasks.find((task) => task.sourceType === "partner" && task.sourceId === "partner-1"));
assert.ok(tasks.find((task) => task.sourceType === "campaign" && task.sourceId === "campaign-1"));
assert.ok(tasks.find((task) => task.sourceType === "approval" && task.sourceId === "approval-1"));
assert.ok(tasks.find((task) => task.sourceType === "growth_inbox" && task.sourceId === "inbox-1"));
assert.ok(tasks.find((task) => task.escalationKey === "growth-inbox-aging:inbox-2"));
assert.ok(tasks.find((task) => task.sourceType === "support_issue" && task.sourceId === "support-1"));
assert.ok(tasks.find((task) => task.sourceType === "report" && /evidence pack/i.test(task.title)));
assert.ok(tasks.find((task) => task.escalationKey === "post-final-png:post-1"));
assert.ok(tasks.find((task) => task.escalationKey === "post-public-url:post-2"));
assert.ok(tasks.find((task) => task.escalationKey === "soc2-evidence-overdue:evidence-1"));

const manual = normalizeTaskRecord({ title: "Call partner", sourceType: "manual" }, { now: "2026-05-26T12:00:00.000Z" });
assert.equal(manual.status, "open");
assert.equal(manual.owner, "Roger");
assert.equal(manual.dueDate, "2026-05-26");

const merged = mergeAutomaticTasks({ tasks: [tasks[0]] }, tasks, { now: "2026-05-26T12:00:00.000Z" });
assert.equal(merged.tasks.filter((task) => task.escalationKey === tasks[0].escalationKey).length, 1);

const done = updateTask(merged.tasks[0], "done", { note: "Handled." }, { now: "2026-05-26T13:00:00.000Z" });
assert.equal(done.status, "done");
assert.equal(done.history[0].action, "done");

const versioned = updateTask({ ...merged.tasks[0], _version:7 }, "done", { note:"Handled safely." }, { now:"2026-05-26T13:00:00.000Z" });
assert.equal(versioned._version, 7, "task mutations preserve the storage compare-and-swap version");

const snoozed = updateTask(merged.tasks[1], "snooze", { days: 3 }, { now: "2026-05-26T13:00:00.000Z" });
assert.equal(snoozed.status, "waiting");
assert.equal(snoozed.dueDate, "2026-05-29");

console.log("tasks engine tests passed");
