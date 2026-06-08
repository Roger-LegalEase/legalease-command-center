import assert from "node:assert/strict";
import {
  classifyGoogleWorkspaceSignal,
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
  rawPayload: { from: "person@goodwill.org", threadId: "thread-1" },
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
assert.ok(outputs.tasks.find((task) => task.escalationKey === "google-workspace:proposal-follow-up:gmail:m1"));
assert.ok(outputs.tasks.find((task) => task.escalationKey === "google-workspace:meeting-prep:calendar:c1"));
assert.ok(outputs.evidencePackNotes.find((note) => /Investor meeting/i.test(note.title)));
assert.ok(outputs.events.every((event) => event.source === "google_workspace"));

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

console.log("google workspace tests passed");
