#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  activeDailyRunSession,
  buildDailyRunSnapshot,
  completeDailyRunSession,
  dailyRunBucketHeadline,
  dailyRunBucketRemainingCount,
  createDailyRunSession,
  dailyRunSessionIsStale,
  dailyRunSessionView,
  dailyRunTomorrowFirstMove,
  markDailyRunSessionAbandoned,
  parkDailyRunItem,
  summarizeDailyRunSession
} from "./daily-run-session.mjs";

const now = "2026-06-05T14:00:00.000Z";
const tomorrow = "2026-06-06T14:00:00.000Z";
const baseState = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: true },
      x: { enabled: true },
      facebook: { enabled: false },
      instagram: { enabled: false }
    }
  },
  socialAccounts: [
    { platform: "linkedin", status: "connected", connected: true },
    { platform: "x", status: "not_connected", connected: false }
  ],
  posts: [
    {
      id: "import-review",
      sourceType: "campaign_upload",
      sourceReference: "Campaign Upload",
      title: "Imported clean post",
      platform: "linkedin",
      status: "draft",
      scheduledFor: "2026-06-08T09:00",
      scheduled_at: "2026-06-08T09:00",
      createdAt: "2026-06-05T10:00:00.000Z"
    },
    {
      id: "import-scheduled-future",
      sourceType: "campaign_upload",
      title: "Imported approved post",
      platform: "linkedin",
      status: "scheduled",
      copyReviewed: true,
      scheduledFor: "2026-06-10T09:00",
      scheduled_at: "2026-06-10T09:00",
      createdAt: "2026-06-05T10:00:00.000Z"
    },
    {
      id: "import-creative",
      sourceType: "campaign_upload",
      title: "Imported post needing image",
      platform: "linkedin",
      status: "draft",
      imageBrief: "",
      createdAt: "2026-06-05T10:00:00.000Z"
    },
    {
      id: "import-meta",
      sourceType: "campaign_upload",
      title: "Imported Instagram post",
      platform: "instagram",
      status: "draft",
      publishingStatus: "meta_paused",
      createdAt: "2026-06-05T10:00:00.000Z"
    },
    {
      id: "due-today",
      title: "Due today scheduled post",
      platform: "linkedin",
      status: "scheduled",
      scheduledFor: "2026-06-05T16:00",
      createdAt: "2026-06-05T10:00:00.000Z"
    },
    {
      id: "ready-ship",
      title: "Approved post waiting schedule",
      platform: "x",
      status: "approved",
      copyReviewed: true,
      createdAt: "2026-06-05T10:00:00.000Z"
    }
  ],
  tasks: [
    {
      id: "partner-overdue",
      title: "Follow up with Harris County",
      sourceType: "partner",
      status: "open",
      dueDate: "2026-06-04",
      createdAt: "2026-06-01T10:00:00.000Z"
    }
  ],
  reports: [
    { id: "investor-report", reportTitle: "Investor update", status: "needs_review", createdAt: "2026-06-02T10:00:00.000Z" }
  ],
  reviewStates: [
    { id: "rcap-watch", artifact: "RCAP Connection", review_state: "waiting", createdAt: "2026-06-02T10:00:00.000Z" }
  ],
  dailyRunSessions: []
};

const snapshot = buildDailyRunSnapshot(baseState, { now });
assert.deepEqual(
  snapshot.buckets.map(bucket => bucket.key).slice(0, 9),
  [
    "blocked_live_systems",
    "due_today",
    "overdue_followups",
    "ready_to_ship",
    "bulk_review",
    "creative_prep",
    "reports_proof",
    "rcap_watch",
    "paused_future"
  ],
  "Daily Run buckets should follow consequence ranking."
);
assert.equal(snapshot.current_bucket_key, "blocked_live_systems", "Blocked live systems should gate first.");
assert(snapshot.buckets.find(bucket => bucket.key === "bulk_review").items.some(item => item.id === "import-review"), "Imported clean draft posts should route to Bulk Review/Approval.");
assert(snapshot.buckets.find(bucket => bucket.key === "creative_prep").items.some(item => item.id === "import-creative"), "Imported posts missing image/asset work should route to Creative/Image Prep.");
assert(snapshot.buckets.find(bucket => bucket.key === "paused_future").items.some(item => item.id === "import-meta"), "Meta/Facebook/Instagram imported rows should route to Paused/Future.");
assert(snapshot.buckets.find(bucket => bucket.key === "paused_future").items.some(item => item.id === "import-scheduled-future"), "Approved imported posts with future imported times should leave daily attention.");
assert(!snapshot.buckets.find(bucket => bucket.key === "bulk_review").items.some(item => item.id === "import-scheduled-future"), "Future scheduled imported posts must not become daily manual review tasks.");

const started = createDailyRunSession(baseState, { now });
assert.equal(started.session.status, "active", "Starting a Daily Run should create an active session.");
assert.equal(started.session.bucket_snapshot.current_bucket_key, "blocked_live_systems", "Session should store the initial current bucket.");
assert.equal(started.state.dailyRunSessions[0].session_id, started.session.session_id, "Session should be persisted in app state.");

const newlyArrived = {
  ...started.state,
  posts: [
    { id: "new-after-start", sourceType: "campaign_upload", title: "New after start", platform: "linkedin", status: "draft", createdAt: "2026-06-05T15:00:00.000Z" },
    ...started.state.posts
  ]
};
const active = activeDailyRunSession(newlyArrived, { now: "2026-06-05T15:10:00.000Z" });
assert.equal(active.session.bucket_snapshot.current_bucket_key, "blocked_live_systems", "Active snapshot should not live-recompute after new non-critical work arrives.");
assert(active.newSinceStart.items.some(item => item.id === "new-after-start"), "New non-critical items should appear in New since session started.");

const parked = parkDailyRunItem(started.state, started.session.session_id, "blocked_live_systems", "x-live-disconnected", "Cannot resolve until X session is repaired.", { now });
assert.equal(parked.session.current_bucket_key, "due_today", "Parked blocked-live items should stop gating the current session.");
assert.equal(parked.session.parked_items.length, 1, "Parked items should remain recorded with a reason.");

assert.equal(dailyRunSessionIsStale(started.session, { now: tomorrow }), true, "Sessions older than the local day should be stale.");
assert.equal(dailyRunSessionIsStale(started.session, { now: "2026-06-05T23:01:00.000Z" }), true, "Sessions idle for more than eight hours should be stale.");

const easternEveningSession = {
  status: "active",
  started_at: "2026-06-05T23:30:00.000Z",
  last_active_at: "2026-06-05T23:30:00.000Z"
};
assert.equal(
  dailyRunSessionIsStale(easternEveningSession, { now: "2026-06-06T00:30:00.000Z" }),
  false,
  "A 7:30pm ET session checked at 8:30pm ET the same June evening must not stale at UTC midnight."
);
assert.equal(
  dailyRunSessionIsStale({
    status: "active",
    started_at: "2026-06-05T18:00:00.000Z",
    last_active_at: "2026-06-05T18:00:00.000Z"
  }, { now: "2026-06-06T03:00:01.000Z" }),
  true,
  "A 2pm ET session checked after 11pm ET should stale because the eight-hour rule still fires."
);
assert.equal(
  dailyRunSessionIsStale({
    status: "active",
    started_at: "2026-06-05T14:00:00.000Z",
    last_active_at: "2026-06-05T14:00:00.000Z"
  }, { now: "2026-06-06T13:00:00.000Z" }),
  true,
  "A session from the previous Eastern local day should be stale."
);
assert.equal(
  dailyRunSessionIsStale({
    status: "active",
    started_at: "2026-06-05T13:00:00.000Z",
    last_active_at: "2026-06-05T13:00:00.000Z"
  }, { now: "2026-06-05T16:00:00.000Z" }),
  false,
  "A same-day Eastern session under eight hours should not be stale."
);

const threeBlockedBucket = {
  key: "blocked_live_systems",
  label: "Blocked live systems",
  items: [
    { id: "blocked-1" },
    { id: "blocked-2" },
    { id: "blocked-3" }
  ]
};
assert.equal(dailyRunBucketRemainingCount(threeBlockedBucket), 3, "Start Here count should match the active bucket item count.");
assert.equal(dailyRunBucketHeadline(threeBlockedBucket), "3 blocked items", "Start Here headline should include active bucket count.");
assert.equal(
  dailyRunBucketRemainingCount(threeBlockedBucket, { parked_items: [{ bucket_key: "blocked_live_systems", item_id: "blocked-1" }] }),
  2,
  "Parked items should be excluded from the active bucket headline count."
);
assert.equal(
  dailyRunBucketRemainingCount(threeBlockedBucket, { skipped_bucket_keys: [{ bucket_key: "blocked_live_systems", item_id: "blocked-2" }] }),
  2,
  "Skipped items should be excluded from the active bucket headline count."
);
assert.equal(
  dailyRunBucketRemainingCount(threeBlockedBucket, { completed_bucket_keys: ["blocked_live_systems"] }),
  0,
  "Completed buckets should report zero remaining items."
);
assert.equal(
  dailyRunSessionView({ ...baseState, runtime: { livePostingGates: { linkedin: { enabled: false }, x: { enabled: false } } } }, { now }).bestBucket.key,
  "due_today",
  "Zero-count higher-ranked buckets should not be selected as Start Here."
);
assert.equal(
  dailyRunSessionView(baseState, { now }).bestBucketHeadline,
  "1 blocked item",
  "Daily Run view should expose a Start Here headline with the active bucket count."
);

const abandoned = markDailyRunSessionAbandoned(started.state, started.session.session_id, { now });
assert.equal(abandoned.session.status, "abandoned", "Mark Abandoned should only close the session.");
assert.equal(abandoned.state.posts.length, started.state.posts.length, "Abandoning a session must not alter work items.");

const completed = completeDailyRunSession(parked.state, parked.session.session_id, { now });
assert.equal(completed.session.status, "completed", "End Session should complete the active session.");
assert.equal(Boolean(completed.session.tomorrow_first_move), true, "Completed sessions should keep tomorrow_first_move populated.");
assert.equal(completed.session.tomorrow_first_move, dailyRunTomorrowFirstMove(completed.session), "Commit 1 tomorrow_first_move should use highest-ranked uncleared bucket.");
const summary = summarizeDailyRunSession(completed.session);
for (const key of ["items_reviewed", "items_approved", "posts_scheduled", "posts_published", "followups_prepared", "blockers_parked", "blockers_remaining", "tomorrow_first_move"]) {
  assert(Object.hasOwn(summary, key), `Session summary should include ${key}.`);
}

console.log("daily run session brain tests passed.");
