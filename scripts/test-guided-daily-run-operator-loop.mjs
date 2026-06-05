#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  activeDailyRunSession,
  buildDailyRunSnapshot,
  createDailyRunSession
} from "./daily-run-session.mjs";
import {
  createDailyRunQuickCapture,
  dailyRunQuickCaptureTypes
} from "./daily-run-quick-capture.mjs";

const server = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bucketIds(state, bucketKey) {
  return list(buildDailyRunSnapshot(state, { now: "2026-06-05T14:00:00.000Z" }).buckets.find(bucket => bucket.key === bucketKey)?.items).map(item => item.id);
}

function assertNoStoredBucket(item, label) {
  for (const field of ["bucket", "bucketKey", "bucket_key", "dailyRunBucket", "daily_run_bucket"]) {
    assert.equal(Object.hasOwn(item || {}, field), false, `${label} should not store ${field}.`);
  }
}

const emptyState = {
  runtime: { livePostingGates: { linkedin: { enabled: false }, x: { enabled: false }, facebook: { enabled: false }, instagram: { enabled: false } } },
  socialAccounts: [
    { platform: "linkedin", status: "connected", connected: true },
    { platform: "x", status: "connected", connected: true }
  ],
  posts: [],
  tasks: [],
  reports: [],
  evidencePackNotes: [],
  reviewStates: [],
  dailyRunSessions: [],
  publishEvents: [],
  activityEvents: [],
  auditHistory: []
};

assert.deepEqual(
  dailyRunQuickCaptureTypes,
  ["partner_followup", "social_post", "report_task", "proof_to_content_task", "channel_review", "rcap_task"],
  "Quick Capture should support the six approved operator item types."
);

const captureCases = [
  { type:"partner_followup", collection:"tasks", bucket:"overdue_followups", title:"Follow up with Harris County", dueDate:"2026-06-04" },
  { type:"social_post", collection:"posts", bucket:"bulk_review", title:"Draft LinkedIn post about record clearing", dueDate:"" },
  { type:"report_task", collection:"reports", bucket:"reports_proof", title:"Review investor report", dueDate:"" },
  { type:"proof_to_content_task", collection:"evidencePackNotes", bucket:"reports_proof", title:"Turn proof packet into content", dueDate:"" },
  { type:"channel_review", collection:"tasks", bucket:"reports_proof", title:"Review LinkedIn channel readiness", dueDate:"" },
  { type:"rcap_task", collection:"reviewStates", bucket:"rcap_watch", title:"RCAP connection placeholder review", dueDate:"" }
];

for (const testCase of captureCases) {
  const result = createDailyRunQuickCapture(emptyState, {
    type:testCase.type,
    title:testCase.title,
    dueDate:testCase.dueDate,
    priority:"high",
    notes:"Captured during operator-loop test.",
    related:"RCAP"
  }, { now:"2026-06-05T14:05:00.000Z", actor:"owner" });
  const item = result.item;
  assert.equal(item.quickCaptureType || item.capture_type, testCase.type, `${testCase.type} should preserve its item type.`);
  assertNoStoredBucket(item, testCase.type);
  assert.equal(result.state.dailyRunSessions.length, 0, `${testCase.type} capture should not start a Daily Run session.`);
  assert(list(result.state[testCase.collection]).some(entry => entry.id === item.id), `${testCase.type} should be saved to ${testCase.collection}.`);
  assert(bucketIds(result.state, testCase.bucket).includes(item.id), `${testCase.type} should surface through Daily Run brain bucket ${testCase.bucket}.`);
  assert.match(result.message, /Captured\./, `${testCase.type} should return founder-facing capture confirmation.`);
  assert.doesNotMatch(JSON.stringify(item), /bucket_key|bucketKey|dailyRunBucket/i, `${testCase.type} should not write bucket fields into the item payload.`);
}

const activeStarted = createDailyRunSession({
  ...emptyState,
  posts: [{
    id:"existing-active-review",
    sourceType:"campaign_upload",
    sourceReference:"Campaign Upload",
    title:"Existing imported post",
    platform:"linkedin",
    status:"draft",
    imageBrief:"Use approved image.",
    createdAt:"2026-06-05T10:00:00.000Z"
  }]
}, { now:"2026-06-05T14:00:00.000Z" });
const frozenSnapshot = structuredClone(activeStarted.session.bucket_snapshot);
const capturedDuringSession = createDailyRunQuickCapture(activeStarted.state, {
  type:"social_post",
  title:"New social post during active run",
  priority:"medium"
}, { now:"2026-06-05T14:20:00.000Z", actor:"owner" });
const activeAfterCapture = activeDailyRunSession(capturedDuringSession.state, { now:"2026-06-05T14:25:00.000Z" });

assert.deepEqual(activeAfterCapture.session.bucket_snapshot, frozenSnapshot, "Quick Capture during an active session must not mutate the frozen session bucket snapshot.");
assert(activeAfterCapture.newSinceStart.items.some(item => item.id === capturedDuringSession.item.id), "Quick Capture during an active session should appear in new-since-session-start handling.");
assert(!list(activeAfterCapture.session.bucket_snapshot.buckets).some(bucket => list(bucket.items).some(item => item.id === capturedDuringSession.item.id)), "Quick Capture must not inject new items into active session buckets.");

for (const required of [
  "Quick Capture",
  "quickCaptureOperator",
  "Partner Follow-up",
  "Social Post",
  "Report Task",
  "Proof-to-Content Task",
  "Channel Review",
  "RCAP Task / Placeholder",
  "/api/daily-run/quick-capture",
  "Open in Queue",
  "Capture another",
  "Done"
]) {
  assert(server.includes(required), `Today/Command Quick Capture UI should include ${required}.`);
}

for (const forbiddenCapture of ["bucket_key:", "dailyRunBucket:", "startDailyRunSession()"]) {
  const captureBlockStart = server.indexOf("async function quickCaptureOperator");
  const captureBlockEnd = server.indexOf("async function", captureBlockStart + 1);
  const captureBlock = server.slice(captureBlockStart, captureBlockEnd);
  assert(!captureBlock.includes(forbiddenCapture), `Quick Capture client must not include ${forbiddenCapture}.`);
}

for (const required of [
  "Run Scheduled Publisher",
  "runScheduledPublisherFromCommand",
  '"/api/publishing/run"',
  "due checked",
  "published",
  "blocked",
  "failed",
  "skipped",
  "last run time"
]) {
  assert(server.includes(required), `Command publisher summary should include ${required}.`);
}

assert(server.includes("publisherSummaryFromResults"), "Publisher summary should be derived from the existing worker result.");
assert(server.includes("publisherLastRunSummary"), "Session closeout should reconcile with the latest publisher result where available.");

for (const forbidden of ["Post Now", "Publish Now", "Tweet Now", "Send Now"]) {
  const commandPublisherStart = server.indexOf("Run Scheduled Publisher");
  const commandPublisherBlock = server.slice(commandPublisherStart, commandPublisherStart + 2600);
  assert(!commandPublisherBlock.includes(forbidden), `Command publisher panel must not expose ${forbidden}.`);
}

for (const required of [
  "Today’s LegalEase OS run is complete.",
  "What moved",
  "What remains",
  "What to do first next time",
  "tomorrow’s first move"
]) {
  assert(server.includes(required), `Today closeout summary should include ${required}.`);
}

console.log("guided daily run operator loop tests passed.");
