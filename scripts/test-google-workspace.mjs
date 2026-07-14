import assert from "node:assert/strict";
import {
  classifyGoogleWorkspaceSignal,
  googleConnectionStatusFromDiagnostics,
  googleWorkspaceDraftOutputs,
  googleWorkspaceDiagnostics
} from "./google-workspace.mjs";

const gmailEvent = {
  id: "automation-event-gmail-1",
  source: "gmail",
  sourceEventId: "gmail:m1",
  eventType: "email_received",
  title: "Proposal request from Goodwill",
  summary: "Can you send the pilot proposal and data room link?",
  relatedEntityType: "partner",
  relatedEntityId: "partner-goodwill",
  rawPayload: { from: "person@example.com", threadId: "thread-1" },
  receivedAt: "2026-05-26T12:00:00.000Z"
};

const calendarEvent = {
  id: "automation-event-calendar-1",
  source: "calendar",
  sourceEventId: "calendar:c1",
  eventType: "calendar_event",
  title: "Investor meeting with Acquirer Fund",
  summary: "Discuss LegalEase traction and acquisition readiness.",
  relatedEntityType: "unknown",
  relatedEntityId: "",
  rawPayload: { startTime: "2026-05-28T15:00:00.000Z" },
  receivedAt: "2026-05-25T12:00:00.000Z"
};

const complaintEvent = {
  id: "automation-event-gmail-2",
  source: "gmail",
  sourceEventId: "gmail:m2",
  eventType: "email_received",
  title: "Customer complaint about legal advice",
  summary: "Customer says the product promised eligibility and wants a refund.",
  rawPayload: {},
  receivedAt: "2026-05-26T13:00:00.000Z"
};

const proposal = classifyGoogleWorkspaceSignal(gmailEvent);
assert.equal(proposal.sourceType, "partner_update");
assert.equal(proposal.priority, "high");
assert.equal(proposal.suggestedDestination, "task");
assert.match(proposal.suggestedAction, /proposal/i);

const complaint = classifyGoogleWorkspaceSignal(complaintEvent);
assert.equal(complaint.sourceType, "compliance_concern");
assert.equal(complaint.riskLevel, "high");
assert.equal(complaint.suggestedDestination, "support_issue");

const outputs = googleWorkspaceDraftOutputs([gmailEvent, calendarEvent, complaintEvent], {
  now: "2026-05-26T14:00:00.000Z"
});
assert.equal(outputs.growthInbox.length, 3);
assert.ok(outputs.tasks.find((task) => task.escalationKey.startsWith("google-workspace:proposal-follow-up:")));
assert.ok(outputs.tasks.find((task) => task.escalationKey.startsWith("google-workspace:meeting-prep:")));
assert.ok(outputs.evidencePackNotes.find((note) => /Google Calendar signal/i.test(note.title)));
assert.ok(outputs.events.every((event) => event.source === "google_workspace"));
const outputsJson = JSON.stringify(outputs);
for (const forbidden of [
  "gmail:m1",
  "gmail:m2",
  "calendar:c1",
  "thread-1",
  "Proposal request from Goodwill",
  "Customer complaint about legal advice",
  "Investor meeting with Acquirer Fund",
  "Can you send the pilot proposal",
  "Discuss LegalEase traction",
  "Customer says the product promised",
  "person@example.com"
]) {
  assert.equal(outputsJson.includes(forbidden), false, `Google workspace draft outputs should not persist ${forbidden}`);
}
assert.ok(outputs.tasks.every((task) => task.sourceId && !/gmail:|calendar:/.test(task.sourceId)));
assert.ok(outputs.growthInbox.every((item) => item.sourceEventId && !/gmail:|calendar:/.test(item.sourceEventId)));
assert.ok(outputs.events.every((event) => event.objectId && !/gmail:|calendar:/.test(event.objectId)));

const diagnostics = googleWorkspaceDiagnostics({
  env: {
    APP_BASE_URL: "https://example.com",
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
    OAUTH_TOKEN_ENCRYPTION_KEY: "x".repeat(32)
  },
  account: { status: "connected", accountName: "roger@example.com", accessTokenEncrypted: "encrypted" },
  connectorStatus: [{ connector: "gmail", configured: true }, { connector: "calendar", configured: true }]
});
assert.equal(diagnostics.oauthConfigured, true);
assert.equal(diagnostics.redirectUri, "https://example.com/api/google/callback");
assert.equal(diagnostics.connected, true);
assert.equal(diagnostics.hasStoredToken, true);
assert.equal(Object.values(diagnostics).some((value) => String(value).includes("secret")), false);

assert.deepEqual(
  googleConnectionStatusFromDiagnostics({ connected: true, hasAccessToken: true, hasRefreshToken: true }),
  { connected: true, status: "connected", needsRefresh: false, needsReconnectReason: "" }
);
assert.deepEqual(
  googleConnectionStatusFromDiagnostics({ connected: true, hasAccessToken: false, hasRefreshToken: true }),
  { connected: false, status: "needs_refresh", needsRefresh: true, needsReconnectReason: "Google reconnect required: token missing or expired." }
);
assert.deepEqual(
  googleConnectionStatusFromDiagnostics({ connected: true, hasAccessToken: false, hasRefreshToken: false }),
  { connected: false, status: "disconnected", needsRefresh: false, needsReconnectReason: "Google reconnect required: token missing or expired." }
);

console.log("google workspace tests passed");
