#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDailyRunSnapshot,
  createDailyRunSession,
  dailyRunSessionView
} from "./daily-run-session.mjs";
import {
  canCreateRcapOutreachTask,
  generateRcapRevenueQueueTasks,
  isRcapContactSuppressed,
  rcapRevenueFoundationSummary,
  rcapRevenueTaskBucketKey
} from "./rcap-revenue-os.mjs";

const now = "2026-06-11T13:00:00.000Z";
const tierOne = {
  account_id: "A-100",
  source_prospect_id: "P-100",
  organization_name: "Anchor Legal Aid",
  segment: "A1",
  priority_tier: "Tier 1",
  priority_score: 96,
  account_status: "New",
  next_action_date: "2026-06-10",
  owner: "Roger",
  source_import_id: "import-1"
};
const activeContact = {
  contact_id: "C-100",
  linked_account_id: "A-100",
  contact_name: "Avery Executive",
  title: "Executive Director",
  decision_role: "CEO",
  public_email: "avery@example.com",
  source_confidence: "High",
  suppression_status: "Active",
  bounced: false,
  unsubscribed: false,
  email_status: "Verified",
  sequence_status: "Not Enrolled",
  source_import_id: "import-1"
};
const suppressedContact = {
  contact_id: "C-200",
  linked_account_id: "A-100",
  contact_name: "Suppressed Contact",
  title: "Board Chair",
  public_email: "suppressed@example.com",
  source_confidence: "High",
  suppression_status: "Do Not Contact",
  bounced: false,
  unsubscribed: true,
  email_status: "Verified",
  sequence_status: "Ready to Enroll",
  source_import_id: "import-1"
};
const researchContact = {
  contact_id: "C-300",
  linked_account_id: "A-100",
  contact_name: "Route To Verify",
  title: "Program Director",
  public_email: "",
  contact_route: "verify route",
  source_confidence: "Low",
  verification_note: "Needs route verification",
  suppression_status: "Active",
  source_import_id: "import-1"
};
const dealSeed = {
  deal_seed_id: "D-100",
  linked_account_id: "A-100",
  linked_contact_id: "C-100",
  proposed_offer: "RCAP pilot",
  funding_source: "Foundation grant",
  likely_decision_maker: "Avery Executive",
  target_close_date: "2026-07-01",
  source_import_id: "import-1"
};
const suppressedDealSeed = {
  deal_seed_id: "D-200",
  linked_account_id: "A-100",
  linked_contact_id: "C-200",
  proposed_offer: "Suppressed pilot",
  funding_source: "Foundation grant",
  likely_decision_maker: "Suppressed Contact",
  source_import_id: "import-1"
};
const baseState = {
  rcapRevenueAccounts: [tierOne],
  rcapRevenueContacts: [activeContact, suppressedContact, researchContact],
  rcapRevenueDealSeeds: [dealSeed, suppressedDealSeed],
  rcapRevenueImportBatches: [{
    import_id: "import-1",
    warnings: [
      "Contacts_Master row 12 lacked Contact_ID and used public_email + linked_account_id fallback identity.",
      "Duplicate contact skipped for C-200"
    ],
    duplicates_skipped: 1,
    status: "imported"
  }],
  rcapRevenueQueueTasks: [],
  posts: [],
  tasks: [],
  reports: [],
  reviewStates: [],
  dailyRunSessions: []
};

assert.equal(isRcapContactSuppressed(activeContact), false, "active contact should not be suppressed.");
for (const patch of [
  { unsubscribed: true },
  { bounced: true },
  { suppression_status: "Suppressed" },
  { suppression_status: "Do Not Contact" },
  { suppression_status: "Bounced" },
  { suppression_status: "Unsubscribed" }
]) {
  assert.equal(isRcapContactSuppressed({ ...activeContact, ...patch }), true, `suppression patch should block outreach: ${JSON.stringify(patch)}`);
  assert.equal(canCreateRcapOutreachTask({ ...activeContact, ...patch }, tierOne), false, "suppressed contacts cannot create outreach tasks.");
}
assert.equal(canCreateRcapOutreachTask(activeContact, tierOne), true, "verified active executive contact can create an internal outreach approval task.");
assert.equal(canCreateRcapOutreachTask(researchContact, tierOne), false, "research-needed contacts cannot create outreach approval tasks.");

const generated = generateRcapRevenueQueueTasks(baseState, { now, owner: "owner" });
const tasks = generated.state.rcapRevenueQueueTasks;
assert(tasks.length >= 5, "RCAP task generation should create account review, research, outreach approval, deal/proposal, and cleanup work.");
assert(generated.created.length > 0, "First generation should report newly created tasks.");
assert.equal(generateRcapRevenueQueueTasks(generated.state, { now, owner: "owner" }).created.length, 0, "RCAP task generation should not duplicate tasks.");

const taskTypes = new Set(tasks.map(task => task.task_type));
assert(taskTypes.has("RCAP Account Review"), "Tier 1 account should create Account Review.");
assert(taskTypes.has("RCAP Contact Research"), "Low/missing contact data should create Contact Research.");
assert(taskTypes.has("RCAP Outreach Approval"), "safe non-suppressed executive contact should create Outreach Approval.");
assert(taskTypes.has("RCAP Follow-Up"), "due account/deal work should create Follow-Up.");
assert(taskTypes.has("RCAP Proposal Task"), "deal seed offer/funding should create Proposal Task.");
assert(taskTypes.has("RCAP Data Cleanup"), "suppression/fallback/duplicate warnings should create Data Cleanup.");

const forbiddenStates = /Ready to Enroll|Active Sequence|Sent|Scheduled Send|Auto Send|Email Ready|Gmail Drafted/i;
for (const task of tasks) {
  assert(!forbiddenStates.test([task.status, task.safe_action_type, task.title, task.reason].join(" ")), `task must not use send/enroll adjacent states: ${task.task_id}`);
  assert(["New", "Ready", "Parked", "Completed", "Skipped", "Blocked"].includes(task.status), `task uses allowed status: ${task.status}`);
}
const suppressedOutreach = tasks.filter(task =>
  task.linked_contact_id === suppressedContact.contact_id &&
  /Outreach Approval|Follow-Up|Proposal/i.test(task.task_type)
);
assert.equal(suppressedOutreach.length, 0, "suppressed contacts must never receive outreach/follow-up/proposal-to-contact tasks.");
const suppressedCleanup = tasks.filter(task => task.linked_contact_id === suppressedContact.contact_id && task.task_type === "RCAP Data Cleanup");
assert(suppressedCleanup.length >= 1, "suppressed contact should create data cleanup work only.");

const bucketByType = Object.fromEntries(tasks.map(task => [task.task_type, rcapRevenueTaskBucketKey(task, { now })]));
assert.equal(bucketByType["RCAP Data Cleanup"], "reports_proof");
assert.equal(bucketByType["RCAP Contact Research"], "rcap_watch");
assert.equal(bucketByType["RCAP Account Review"], "bulk_review");
assert.equal(bucketByType["RCAP Outreach Approval"], "bulk_review");
assert.equal(bucketByType["RCAP Follow-Up"], "overdue_followups");
assert.equal(bucketByType["RCAP Proposal Task"], "ready_to_ship");

const snapshot = buildDailyRunSnapshot(generated.state, { now });
const flatSnapshotItems = snapshot.buckets.flatMap(bucket => bucket.items.map(item => ({ ...item, bucketKey: bucket.key })));
assert(flatSnapshotItems.some(item => item.source === "rcap_revenue_task" && item.type === "rcap_task"), "Daily Run should include RCAP revenue tasks.");
assert(flatSnapshotItems.some(item => item.bucketKey === "overdue_followups" && /Follow-Up/.test(item.title)), "Due RCAP follow-ups should map to overdue follow-ups.");
assert(flatSnapshotItems.some(item => item.bucketKey === "reports_proof" && /Data Cleanup/.test(item.title)), "RCAP cleanup should map to reports/proof-style review.");

const started = createDailyRunSession({ ...baseState, rcapRevenueQueueTasks: [] }, { now: "2026-06-11T12:00:00.000Z" });
const originalSnapshot = structuredClone(started.session.bucket_snapshot);
const generatedMidSession = generateRcapRevenueQueueTasks(started.state, { now, owner: "owner" }).state;
const activeView = dailyRunSessionView(generatedMidSession, { now });
assert.deepEqual(activeView.activeSession.bucket_snapshot, originalSnapshot, "Generating RCAP tasks mid-session must not mutate the frozen active Daily Run snapshot.");
assert.equal(activeView.activeBucketRemainingCount, originalSnapshot.buckets[0] ? activeView.activeBucketRemainingCount : 0, "Active session remaining count should remain based on the stored snapshot.");
assert(activeView.newSinceStart.count >= 1, "RCAP tasks created mid-session should surface as new-since-start/next-session work.");
assert(!Object.values(activeView.bucketItemsByKey || {}).flat().some(item => tasks.some(task => task.task_id === item.id)), "New RCAP tasks should not inject into active frozen session buckets mid-session.");

const summary = rcapRevenueFoundationSummary(generated.state);
assert.equal(summary.queueTasks, tasks.length);
assert.equal(summary.queueTaskGenerationActive, true);
assert.equal(summary.suppressionLatchActive, true);
assert.equal(summary.emailSendingEnabled, false);
assert.equal(summary.calendarWritesEnabled, false);
assert.equal(summary.externalActionsEnabled, false);

const server = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
for (const required of [
  "rcapRevenueQueueRows",
  "RCAP Task",
  "Suppressed contact — data cleanup only",
  "Queue task generation: Active",
  "Suppression latch: Active",
  "tasksCreated",
  "rcapRevenueTaskSummary"
]) {
  assert(server.includes(required), `Preview server should expose RCAP queue task UI/status: ${required}`);
}
const queueBlock = server.slice(server.indexOf("function rcapRevenueQueueRows"), server.indexOf("function queueReviewRows"));
for (const forbidden of ["Send", "Enroll", "Gmail", "Calendar", "Call", "SMS", "Tweet Now", "Publish Now", "Post Now"]) {
  assert(!queueBlock.includes(forbidden), `RCAP Queue task UI must not expose forbidden action: ${forbidden}`);
}

console.log("RCAP Revenue OS queue task tests passed.");
