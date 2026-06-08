import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  googleInsightSummary,
  googleInsightsFromEvents,
  googleInsightToQueueTask,
  googleReadOnlyScopes,
  googleWorkspaceDiagnostics,
  googleWorkspaceRedirectUri,
  mergeGoogleInsights
} from "./google-workspace.mjs";
import {
  activeDailyRunSession,
  buildDailyRunSnapshot,
  createDailyRunSession
} from "./daily-run-session.mjs";

const previewSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
const accessSource = readFileSync(new URL("./access-control.mjs", import.meta.url), "utf8");

assert.equal(
  googleWorkspaceRedirectUri({ APP_BASE_URL: "https://legalease-command-center.onrender.com" }),
  "https://legalease-command-center.onrender.com/api/google/callback"
);

assert.ok(googleReadOnlyScopes.includes("https://www.googleapis.com/auth/gmail.readonly"));
assert.ok(googleReadOnlyScopes.includes("https://www.googleapis.com/auth/calendar.readonly"));
assert.equal(googleReadOnlyScopes.some((scope) => /send|modify|compose|calendar\.events(?!\.readonly)|contacts/i.test(scope)), false);

const diagnostics = googleWorkspaceDiagnostics({
  env: {
    GOOGLE_CLIENT_ID: "google-client-id-full-value",
    GOOGLE_CLIENT_SECRET: "google-client-secret-full-value",
    GOOGLE_REDIRECT_URI: "https://legalease-command-center.onrender.com/api/google/callback",
    OAUTH_TOKEN_ENCRYPTION_KEY: "x".repeat(32)
  },
  account: {
    platform: "google_workspace",
    status: "connected",
    accountName: "roger@example.com",
    accessTokenEncrypted: "encrypted-access-token",
    refreshTokenEncrypted: "encrypted-refresh-token",
    tokenExpiresAt: "2026-06-09T12:00:00.000Z",
    scopes: googleReadOnlyScopes
  },
  connectorStatus: [{ connector: "gmail", configured: true }, { connector: "calendar", configured: true }]
});

assert.equal(diagnostics.googleClientIdConfigured, true);
assert.equal(diagnostics.googleClientSecretConfigured, true);
assert.equal(diagnostics.googleRedirectUriHost, "legalease-command-center.onrender.com");
assert.equal(diagnostics.googleRedirectUriPath, "/api/google/callback");
assert.equal(diagnostics.gmailReadonlyGranted, true);
assert.equal(diagnostics.calendarReadonlyGranted, true);
assert.equal(diagnostics.emailSendingEnabled, false);
assert.equal(diagnostics.calendarWritesEnabled, false);
assert.equal(diagnostics.connectRouteExists, true);
assert.equal(diagnostics.callbackRouteExists, true);
assert.equal(diagnostics.statusRouteExists, true);
assert.equal(diagnostics.scanRouteExists, true);
assert.equal(JSON.stringify(diagnostics).includes("google-client-secret-full-value"), false);
assert.equal(JSON.stringify(diagnostics).includes("encrypted-refresh-token"), false);

const gmailEvent = {
  id: "gmail-event-1",
  source: "gmail",
  sourceEventId: "gmail:thread-1",
  eventType: "email_received",
  title: "Proposal follow up from Goodwill",
  summary: "Can you send the pilot proposal and next steps?",
  rawPayload: { from: "Partner <partner@example.org>", threadId: "thread-1", snippet: "Can you send the pilot proposal?" },
  receivedAt: "2026-06-08T13:00:00.000Z"
};

const calendarEvent = {
  id: "calendar-event-1",
  source: "calendar",
  sourceEventId: "calendar:meeting-1",
  eventType: "calendar_event",
  title: "Partner meeting with Goodwill",
  summary: "Discuss launch checklist and decision owner.",
  rawPayload: { startTime: "2026-06-08T15:00:00.000Z", htmlLink: "https://calendar.google.com/event" },
  receivedAt: "2026-06-08T12:00:00.000Z"
};

const insights = googleInsightsFromEvents([gmailEvent, calendarEvent], { now: "2026-06-08T14:00:00.000Z" });
assert.equal(insights.length, 2);
assert.ok(insights.find((item) => item.source === "gmail" && ["Needs Reply", "Partner Opportunity", "Follow-up Overdue"].includes(item.insightType)));
assert.ok(insights.find((item) => item.source === "calendar" && ["Meeting Prep", "Post-Meeting Follow-up"].includes(item.insightType)));
assert.equal(insights.every((item) => item.status === "suggested" && item.noOutboundAction === true), true);
assert.equal(insights.some((item) => String(item.sourceEventId || "").includes("thread-1")), false);

let state = mergeGoogleInsights({ googleInsights: [] }, insights, { now: "2026-06-08T14:01:00.000Z" });
assert.equal(state.googleInsights.length, 2);
state = mergeGoogleInsights({ googleInsights: [{ ...state.googleInsights[0], status: "dismissed" }] }, [state.googleInsights[0]], { now: "2026-06-08T14:02:00.000Z" });
assert.equal(state.googleInsights[0].status, "dismissed");

const task = googleInsightToQueueTask(insights[0], { now: "2026-06-08T14:05:00.000Z", id: "task-google-insight-test" });
assert.equal(task.sourceType, "gmail");
assert.equal(task.googleInsightId, insights[0].id);
assert.match(task.history[0].note, /No email or calendar changes/);

const rankedSnapshot = buildDailyRunSnapshot({
  posts: [{ id: "post-1", status: "draft", sourceType: "campaign_upload", caption: "Review imported social post", createdAt: "2026-06-08T13:30:00.000Z" }],
  googleInsights: insights
}, { now: "2026-06-08T14:10:00.000Z" });
assert.equal(rankedSnapshot.buckets[0].key, "overdue_followups");
assert.ok(rankedSnapshot.buckets[0].items.find((item) => item.source === "gmail"));

const sessionSeed = createDailyRunSession({ posts: [], googleInsights: [] }, {
  now: "2026-06-08T14:00:00.000Z",
  session_id: "daily-run-google-frozen"
});
const frozenSnapshot = JSON.stringify(sessionSeed.session.bucket_snapshot);
const active = activeDailyRunSession({
  ...sessionSeed.state,
  googleInsights: [{ ...insights[0], createdAt: "2026-06-08T14:30:00.000Z", created_at: "2026-06-08T14:30:00.000Z" }]
}, { now: "2026-06-08T14:45:00.000Z" });
assert.equal(JSON.stringify(active.session.bucket_snapshot), frozenSnapshot);
assert.equal(active.newSinceStart.count, 1);
assert.equal(active.newSinceStart.items[0].source, "gmail");

const summary = googleInsightSummary([{ ...insights[0], status: "suggested" }, { ...insights[1], status: "queued" }]);
assert.equal(summary.total, 1);
assert.equal(summary.queued, 1);

for (const route of ["/api/google/start", "/api/google/callback", "/api/google/status", "/api/google/diagnostics", "/api/google/scan", "/api/google/insights"]) {
  assert.ok(previewSource.includes(route), `${route} route should exist`);
}
assert.ok(previewSource.includes('include_granted_scopes: "true"'));
assert.ok(previewSource.includes("googleReadOnlyScopes.join"));
assert.ok(previewSource.includes("emailSendingEnabled:false"));
assert.ok(previewSource.includes("calendarWritesEnabled:false"));
assert.ok(accessSource.includes('pathname.startsWith("/api/google/callback")'));
assert.equal(previewSource.includes("gmail.send"), false);
assert.equal(previewSource.includes("calendar.events"), false);

console.log("google read-only intelligence tests passed");
