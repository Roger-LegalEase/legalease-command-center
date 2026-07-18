#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { buildPartnerActivity, filterPartnerActivity } from "./ui/view-models/partner-activity.mjs";
import { PARTNER_ACTIVITY_EVENT_TYPES, PARTNER_ACTIVITY_SOURCE_MATRIX } from "./ui/view-models/partner-activity-sources.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";

const OWNER = Object.freeze({ authenticated: true, role: "owner" });
const OPERATOR = Object.freeze({ authenticated: true, role: "operator" });
const NOW = "2026-07-18T12:00:00.000Z";
const PARTNER_ID = "partner stable/01";

function fixtureState() {
  return {
    partners: [
      {
        id: PARTNER_ID,
        organizationName: "Example Community Partner",
        status: "closed_lost",
        history: [
          { id: "stage-proposal", action: "stage_changed", fromStage: "meeting_booked", toStage: "proposal_sent", at: "2026-07-18T11:00:00.000Z", actor: "Roger" },
          { id: "stage-attention", action: "stage_changed", fromStage: "proposal_sent", toStage: "stalled", at: "2026-07-18T10:30:00.000Z" },
          { id: "stage-closed", action: "stage_changed", fromStage: "proposal_sent", toStage: "closed_lost", at: "2026-07-18T10:00:00.000Z" },
          { id: "partner-note", action: "note_added", note: "Sensitive note body must not project.", at: "2026-07-18T09:30:00.000Z" }
        ]
      },
      { id: "partner-empty", organizationName: "Empty Partner", history: [] },
      { id: "partner-hidden", organizationName: "Hidden Partner", ownerOnly: true }
    ],
    campaigns: [
      {
        id: "campaign-01",
        partnerId: PARTNER_ID,
        campaignName: "Partner outreach",
        distributionActions: [
          { id: "distribution-01", channel: "newsletter_sent", date: "2026-07-17", notes: "Private distribution notes." },
          { id: "distribution-fuzzy", channel: "draft", date: "2026-07-17" }
        ]
      },
      { id: "campaign-collision", partnerId: "different-partner", campaignName: "Canonical collision" },
      { id: "campaign-unlinked", campaignName: "Mentions Example Community Partner", distributionActions: [{ id: "unlinked-send", channel: "newsletter_sent", date: "2026-07-18" }] }
    ],
    outreachCampaigns: [
      { campaign_id: "outreach-campaign-01", partner_id: PARTNER_ID, name: "Follow-up sequence" },
      { campaign_id: "campaign-collision", partner_id: PARTNER_ID, name: "Distinct outreach collision" }
    ],
    posts: [
      { id: "post-01", title: "Visible Partner post" },
      { id: "post-hidden", title: "Hidden post", allowedRoles: ["admin"] }
    ],
    partnerPrograms: [{ id: "program-01", relatedPartnerId: PARTNER_ID, name: "Explicit Program" }],
    activityEvents: [
      { id: "shared-file-event", eventType: "file_shared", relatedObjectType: "data_room_item", relatedObjectId: "file-01", createdAt: "2026-07-18T09:00:00.000Z", providerPayload: { token: "must-not-project" } },
      { id: "same-upstream-send", eventId: "same-upstream-id", eventType: "email_sent", partnerId: PARTNER_ID, sentAt: "2026-07-18T08:50:00.000Z" },
      { id: "same-upstream-reply", eventId: "same-upstream-id", eventType: "email_received", partnerId: PARTNER_ID, receivedAt: "2026-07-18T08:49:00.000Z" },
      { id: "idempotency-domain", idempotencyKey: "private-idempotency-secret", eventType: "note_added", partnerId: PARTNER_ID, createdAt: "2026-07-18T08:48:30.000Z" },
      { id: "/home/private-activity-id", eventType: "note_added", partnerId: PARTNER_ID, createdAt: "2026-07-18T08:48:00.000Z" },
      { id: "fuzzy-activity", eventType: "note_added", title: "Example Community Partner mentioned only in text", createdAt: "2026-07-18T12:00:00.000Z" },
      { id: "hidden-activity", eventType: "note_added", partnerId: PARTNER_ID, allowedRoles: ["admin"], createdAt: "2026-07-18T12:00:00.000Z" }
    ],
    auditHistory: [
      { id: "audit-file-mirror", eventId: "shared-file-event", action: "file_shared", partnerId: PARTNER_ID, sourceRef: { collection: "activityEvents", id: "shared-file-event" }, timestamp: "2026-07-18T09:00:00.000Z", headers: { authorization: "must-not-project" } },
      { id: "idempotency-mirror", idempotency_key: "private-idempotency-secret", action: "note_added", partnerId: PARTNER_ID, timestamp: "2026-07-18T08:48:30.000Z" },
      { id: "audit-unique", action: "note_added", partnerId: PARTNER_ID, timestamp: "2026-07-18T08:55:00.000Z" }
    ],
    automationEvents: [
      { id: "reply-signal", eventType: "partner_email_reply", relatedEntityType: "campaign", relatedEntityId: "campaign-01", receivedAt: "2026-07-18T08:45:00.000Z", rawPayload: { body: "full email body", provider: "gmail" } },
      { id: "meeting-a", source: "calendar", eventType: "calendar_event", relatedEntityType: "partner", relatedEntityId: PARTNER_ID, title: "Partner planning call", receivedAt: "2026-07-18T08:30:00.000Z", rawPayload: { description: "Private meeting description" } },
      { id: "meeting-b", source: "calendar", eventType: "calendar_event", relatedEntityType: "partner", relatedEntityId: PARTNER_ID, title: "Partner follow-up call", receivedAt: "2026-07-18T08:30:00.000Z" },
      { id: "meeting-no-time", source: "calendar", eventType: "calendar_event", partnerId: PARTNER_ID, title: "Meeting without stored time" }
    ],
    companyEvents: [
      { id: "company-note", type: "note_added", partnerId: PARTNER_ID, postId: "post-01", occurredAt: "2026-07-18T08:00:00.000Z", summary: "Raw company-memory body must not project.", actor: "operator@example.com" },
      { id: "company-hidden-post", type: "note_added", partnerId: PARTNER_ID, postId: "post-hidden", occurredAt: "2026-07-18T07:59:00.000Z" }
    ],
    tasks: [
      { id: "task-complete", title: "Confirm next Partner step", status: "completed", partnerId: PARTNER_ID, completedAt: "2026-07-18T07:30:00.000Z", description: "Private task description" },
      { id: "task-no-completion-time", title: "Completed without a stored completion time", status: "completed", partnerId: PARTNER_ID, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "task-open", title: "Open work is not activity", status: "open", partnerId: PARTNER_ID },
      { id: "task-fuzzy", title: "Example Community Partner follow-up", status: "completed", completedAt: "2026-07-18T12:00:00.000Z" }
    ],
    outreachAttempts: [
      { id: "attempt-01", campaign_id: "outreach-campaign-01", status: "sent", sent_at: "2026-07-18T07:00:00.000Z", provider: "sendgrid", provider_message_id: "private-provider-id" },
      { id: "attempt-collision", campaign_id: "campaign-collision", status: "sent", sent_at: "2026-07-18T06:59:00.000Z" },
      { id: "attempt-dry", campaign_id: "outreach-campaign-01", status: "dry_run", created_at: "2026-07-18T07:00:00.000Z" }
    ],
    outreachReplies: [
      { id: "reply-01", campaign_id: "outreach-campaign-01", status: "received", replied_at: "2026-07-18T06:30:00.000Z", body: "Full reply body must not project." }
    ],
    reports: [
      { id: "report-01", reportTitle: "Partner progress report", partnerId: PARTNER_ID, generatedAt: "2026-07-18T06:00:00.000Z", markdownPath: "/home/private/report.md", notes: "Sensitive report notes" },
      { id: "report-fuzzy", reportTitle: "Example Community Partner report", generatedAt: "2026-07-18T12:00:00.000Z" }
    ],
    partnerProgramArtifacts: [
      { id: "artifact-01", partnerProgramId: "program-01", artifactType: "proposal", title: "Pilot proposal", generatedAt: "2026-07-18T05:30:00.000Z", html: "private proposal body" }
    ],
    evidencePackNotes: [
      { id: "note-01", title: "Relationship note", relatedPartnerId: PARTNER_ID, createdAt: "2026-07-18T05:00:00.000Z", summary: "Sensitive evidence content" }
    ],
    dataRoomItems: [
      { id: "file-01", title: "Shared Partner brief", partnerId: PARTNER_ID, status: "shared", sharedAt: "2026-07-18T04:30:00.000Z", filePath: "/home/operator/private.pdf", signedUrl: "https://example.com/file?token=secret" },
      { id: "file-shared-no-time", title: "Shared without a stored time", partnerId: PARTNER_ID, externallyShared: true, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "file-not-shared", title: "Stored only", partnerId: PARTNER_ID, status: "draft", filePath: "/tmp/private.pdf" }
    ],
    meetingBriefs: [{ id: "brief-deferred", title: "Example Community Partner meeting", start_at: "2026-07-18T13:00:00.000Z" }],
    googleInsights: [{ id: "insight-deferred", relatedPersonOrOrg: PARTNER_ID }],
    conversationNotes: [{ id: "conversation-deferred", relatedPartner: "Example Community Partner" }],
    rcapRevenueEvents: [{ id: "rcap-deferred", account_id: PARTNER_ID }],
    events: [{ id: "raw-operational", partnerId: PARTNER_ID, metadata: { token: "secret" } }],
    outreachSendClaims: [{ id: "claim-deferred", partnerId: PARTNER_ID, provider_message_id: "private" }],
    reactivationEvents: [{ id: "reactivation-deferred", partnerId: PARTNER_ID }],
    inboxSignals: [{ id: "inbox-deferred", partnerId: PARTNER_ID, evidence: "private" }],
    supportIssues: [{ id: "support-deferred", partnerId: PARTNER_ID, legalDetails: "private" }],
    calendarItems: [{ id: "calendar-deferred", partnerId: PARTNER_ID, description: "private" }]
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

const state = fixtureState();
const before = structuredClone(state);
const projection = buildPartnerActivity(state, OWNER, PARTNER_ID, NOW);
assert.equal(projection.available, true);
assert.equal(projection.availability.state, "available_with_events");
assert.equal(projection.partnerId, PARTNER_ID);
assert.equal(projection.generatedAt, NOW);
assert.deepEqual(state, before, "Partner activity projection must not mutate source state.");
assert.deepEqual(buildPartnerActivity(reverseArrays(state), OWNER, PARTNER_ID, NOW), projection, "Input order must not affect activity.");
assert.deepEqual(buildPartnerActivity(state, OWNER, PARTNER_ID, NOW), projection, "Projection must be deterministic.");
assert.ok(Object.isFrozen(projection) && Object.isFrozen(projection.events) && projection.events.every(Object.isFrozen));
assert.throws(() => projection.events.push({}), TypeError);

const labels = [...new Set(projection.events.map((event) => event.label))];
for (const label of ["Reply", "Meeting", "Note", "Stage change", "Outreach", "Document", "File", "Task"]) {
  assert.ok(labels.includes(label), `${label} must be represented by explicit source truth.`);
}
assert.deepEqual(PARTNER_ACTIVITY_EVENT_TYPES.map((item) => item.label), ["Reply", "Meeting", "Note", "Stage change", "Outreach", "Document", "File", "Task"]);
for (const source of PARTNER_ACTIVITY_SOURCE_MATRIX.included) {
  assert.ok(projection.events.some((event) => event.sourceCollection === source.collection), `${source.collection} must be covered.`);
}
for (const source of PARTNER_ACTIVITY_SOURCE_MATRIX.deferred) {
  assert.ok(Array.isArray(state[source.collection]), `${source.collection} needs a fixture.`);
  assert.equal(projection.events.some((event) => event.sourceCollection === source.collection), false, `${source.collection} must remain deferred.`);
}

const timestamps = projection.events.map((event) => event.occurredAt);
assert.equal(timestamps.at(-1), null, "Missing timestamps sort last without fabrication.");
const firstMissingTimestamp = timestamps.indexOf(null);
assert.ok(firstMissingTimestamp > 0);
assert.ok(timestamps.slice(firstMissingTimestamp).every((timestamp) => timestamp === null), "Every missing timestamp must sort after stored timestamps.");
for (let index = 1; index < firstMissingTimestamp; index += 1) {
  assert.ok(Date.parse(timestamps[index - 1]) >= Date.parse(timestamps[index]), "Stored events must sort newest first.");
}
const sameDayMeetings = projection.events.filter((event) => event.type === "meeting" && event.occurredAt === "2026-07-18T08:30:00.000Z");
assert.equal(sameDayMeetings.length, 2, "Distinct same-time meetings remain separate.");
assert.deepEqual(sameDayMeetings.map((event) => event.sourceId), ["meeting-a", "meeting-b"]);

assert.equal(projection.events.filter((event) => event.dedupeKey === "event:file:shared-file-event").length, 1, "Reliable activity/audit mirrors deduplicate.");
assert.equal(projection.counts.duplicatesRemoved, 2);
assert.equal(projection.events.some((event) => event.sourceId === "audit-file-mirror"), false);
assert.equal(projection.events.filter((event) => ["same-upstream-send", "same-upstream-reply"].includes(event.sourceId)).length, 2, "Outreach and reply events remain distinct when an upstream ID is reused.");
assert.equal(projection.events.filter((event) => ["idempotency-domain", "idempotency-mirror"].includes(event.sourceId)).length, 1, "Explicit idempotency identities deduplicate without being exposed.");
assert.equal(projection.events.some((event) => event.sourceId === "/home/private-activity-id"), false, "Unsafe source IDs fail closed.");
assert.equal(projection.events.some((event) => event.sourceId === "task-fuzzy" || event.sourceId === "report-fuzzy" || event.sourceId === "fuzzy-activity"), false, "Text and name matching must never relate activity.");
assert.equal(projection.events.some((event) => event.sourceId === "task-open" || event.sourceId === "attempt-dry" || event.sourceId === "file-not-shared"), false);

const proposalStage = projection.events.find((event) => event.sourceId === "stage-proposal").stageChange;
assert.equal(proposalStage.fromStage.label, "In conversation");
assert.equal(proposalStage.toStage.label, "Proposal");
assert.equal(proposalStage.primaryStageMovement, true);
const attentionStage = projection.events.find((event) => event.sourceId === "stage-attention").stageChange;
assert.equal(attentionStage.toStage, null, "Stalled cannot fabricate a commercial destination.");
assert.equal(attentionStage.healthAttention.to.label, "Needs attention");
assert.equal(attentionStage.changesPartnerStage, false);
const closedStage = projection.events.find((event) => event.sourceId === "stage-closed").stageChange;
assert.equal(closedStage.toStage.label, "Closed");
assert.equal(closedStage.toOutcome.label, "Lost");
assert.equal(closedStage.internalTo, "closed_lost");
assert.equal(closedStage.inferredFromCurrentPartnerStage, false);
const healthChange = buildPartnerActivity({ partners: [{ id: PARTNER_ID, history: [{ id: "health-change", action: "stage_changed", fromHealth: "on_track", toHealth: "needs_attention", at: NOW }] }] }, OWNER, PARTNER_ID, NOW).events[0].stageChange;
assert.equal(healthChange.healthAttention.from.label, "On track");
assert.equal(healthChange.healthAttention.to.label, "Needs attention");
assert.equal(healthChange.internalHealthTo, "needs_attention");

const task = projection.events.find((event) => event.sourceId === "task-complete");
assert.equal(task.sourceHref, "#item/tasks/task-complete");
assert.equal(resolveRouteCompatibility(task.sourceHref).sourceId, "task-complete");
assert.equal(projection.events.find((event) => event.sourceId === "report-01").sourceHref, "#files/report/report-01");
assert.equal(projection.events.find((event) => event.sourceId === "file-01").sourceHref, "#files/data-room-item/file-01");
assert.equal(projection.events.find((event) => event.sourceId === "reply-signal").sourceHref, "#outreach/campaign/campaign-01");
assert.equal(projection.events.find((event) => event.sourceId === "reply-01").sourceHref, null, "Legacy Partner-outreach Campaigns must not invent canonical Campaign routes.");
assert.equal(projection.events.find((event) => event.sourceId === "attempt-collision").sourceHref, null, "A same-ID canonical Campaign must not steal an outreach relationship.");
assert.ok(projection.events.find((event) => event.sourceId === "company-note").relatedObjects.some((item) => item.kind === "Post" && item.href === "#social/post/post-01"));
assert.equal(projection.events.find((event) => event.sourceId === "company-hidden-post").relatedObjects.some((item) => item.kind === "Post"), false, "Hidden related objects must not leak IDs or links.");
assert.equal(projection.events.find((event) => event.sourceId === "company-note").actor, null, "Email addresses are not safe actor labels.");
assert.ok(projection.events.every((event) => event.relatedObjects.some((item) => item.kind === "Partner" && item.href === `#partners/partner/${encodeURIComponent(PARTNER_ID)}`)));

const serialized = JSON.stringify(projection);
for (const forbidden of ["full email body", "Full reply body", "Sensitive note body", "/home/", "/tmp/", "token=secret", "provider_message_id", "private-idempotency-secret", "sendgrid", "gmail", "authorization", "private proposal body", "Sensitive evidence content", "Private meeting description"]) {
  assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
}
for (const event of projection.events) {
  assert.doesNotMatch(event.label, /_|webhook|provider|capability/i);
  assert.doesNotMatch(event.summary, /_|webhook|provider|capability/i);
}

assert.deepEqual(projection.filters.map((filter) => filter.label), ["All", "Replies", "Meetings", "Notes", "Stage changes", "Outreach", "Documents/files", "Tasks"]);
assert.equal(projection.filters[0].count, projection.events.length);
const replyFilter = filterPartnerActivity(projection, "replies");
assert.equal(replyFilter.available, true);
assert.ok(replyFilter.events.length > 0 && replyFilter.events.every((event) => event.type === "reply"));
assert.ok(Object.isFrozen(replyFilter) && Object.isFrozen(replyFilter.events));
assert.equal(filterPartnerActivity(projection, "not-a-filter").available, false);
assert.deepEqual(buildPartnerActivity(state, OWNER, PARTNER_ID, NOW), projection, "Filtering must not mutate the projection.");
const ownerWithoutHidden = structuredClone(state);
ownerWithoutHidden.activityEvents = ownerWithoutHidden.activityEvents.filter((event) => event.id !== "hidden-activity");
assert.deepEqual(buildPartnerActivity(ownerWithoutHidden, OWNER, PARTNER_ID, NOW), projection, "Hidden records must not affect events, filters, or counts.");
const operator = buildPartnerActivity(state, OPERATOR, PARTNER_ID, NOW);
assert.equal(operator.events.find((event) => event.sourceId === "meeting-a").summary, "Partner meeting recorded.");
assert.equal(operator.events.find((event) => event.sourceId === "meeting-a").visibility.redacted, true);
assert.equal(operator.events.some((event) => event.sourceId === "hidden-activity"), false);
for (const actor of [{}, { authenticated: false, role: "owner" }, { authenticated: true, role: "viewer" }, { authenticated: true, role: "unknown" }]) {
  const unavailable = buildPartnerActivity(state, actor, PARTNER_ID, NOW);
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.availability.reason, "actor_cannot_read");
  assert.equal(unavailable.counts, null, "Unavailable must not become zero activity.");
}
assert.equal(buildPartnerActivity({}, OWNER, PARTNER_ID, NOW).availability.reason, "source_data_absent");
assert.equal(buildPartnerActivity({ partners: [{ id: "partner-no-sources" }] }, OWNER, "partner-no-sources", NOW).availability.reason, "source_data_absent");
assert.equal(buildPartnerActivity(state, OPERATOR, "partner-hidden", NOW).availability.reason, "partner_not_visible");
const empty = buildPartnerActivity(state, OWNER, "partner-empty", NOW);
assert.equal(empty.available, true);
assert.equal(empty.availability.state, "available_empty");
assert.equal(empty.counts.projectedEvents, 0);
assert.deepEqual(empty.filters, []);
assert.equal(projection.events.find((event) => event.sourceId === "task-no-completion-time").occurredAt, null, "Task creation time must not be presented as completion time.");
assert.equal(projection.events.find((event) => event.sourceId === "file-shared-no-time").occurredAt, null, "File creation time must not be presented as share time.");

const sources = [
  readFileSync("scripts/ui/view-models/partner-activity-sources.mjs", "utf8"),
  readFileSync("scripts/ui/view-models/partner-activity.mjs", "utf8")
].join("\n");
for (const forbiddenImport of ["preview-server", "storage", "database", "provider", "sendgrid", "supabase", "partner-program-engine", "meeting-briefs"]) {
  assert.doesNotMatch(sources, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"));
}
for (const forbiddenRuntime of [
  /\bprocess\.env\b/, /\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/, /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\b(?:window|localStorage|sessionStorage)\b|\bdocument\s*\./,
  /\b(?:readFile|writeFile|createServer)\s*\(/
]) assert.doesNotMatch(sources, forbiddenRuntime);
assert.doesNotMatch(sources, /(?:^|[^\w])(?:save|send|email|schedule|upload|share|publish|launch|approve|updatePartner|write|migrate)\s*\(/im);
const previewSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(previewSource, /view-models\/partner-activity(?:-sources)?\.mjs/);
assert.match(readFileSync("package.json", "utf8"), /"test:vnext-partner-activity": "node scripts\/test-vnext-partner-activity\.mjs"/);
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
assert.equal(sha256(readFileSync("scripts/ui/route-compatibility.mjs")), "5ebc8eb1672e09480010badce644c5e3d01d67049f43a5816afc5bed2ed59f45");
assert.equal(sha256(previewSource), "7943bd4f5a93895121fbb5e7a6e8a632ca53338999d57dc4734a5ba4a7e445a3");

function performanceFixture() {
  const partners = Array.from({ length: 100 }, (_, index) => ({ id: `performance-partner-${index}`, organizationName: `Synthetic Partner ${index}`, history: [] }));
  const campaigns = partners.map((partner, index) => ({ id: `performance-campaign-${index}`, partnerId: partner.id }));
  const activityEvents = Array.from({ length: 400 }, (_, index) => ({
    id: `performance-activity-${index}`, eventType: index % 2 ? "note_added" : "file_shared", partnerId: partners[index % 100].id,
    createdAt: "2026-07-18T10:00:00.000Z"
  }));
  const auditHistory = activityEvents.slice(0, 100).map((event) => ({
    id: `performance-audit-${event.id}`, eventId: event.id, action: event.eventType, partnerId: event.partnerId,
    sourceRef: { collection: "activityEvents", id: event.id }, timestamp: event.createdAt
  }));
  const automationEvents = Array.from({ length: 100 }, (_, index) => ({ id: `performance-meeting-${index}`, source: "calendar", eventType: "calendar_event", relatedEntityType: "partner", relatedEntityId: partners[index].id, receivedAt: "2026-07-18T09:00:00.000Z" }));
  const tasks = Array.from({ length: 100 }, (_, index) => ({ id: `performance-task-${index}`, title: `Complete Partner task ${index}`, status: "completed", partnerId: partners[index].id, completedAt: "2026-07-18T08:00:00.000Z" }));
  const reports = Array.from({ length: 100 }, (_, index) => ({ id: `performance-report-${index}`, reportTitle: `Partner report ${index}`, partnerId: partners[index].id, generatedAt: "2026-07-18T07:00:00.000Z" }));
  const outreachAttempts = Array.from({ length: 100 }, (_, index) => ({ id: `performance-attempt-${index}`, campaign_id: campaigns[index].id, status: "sent", sent_at: "2026-07-18T06:00:00.000Z" }));
  const outreachReplies = Array.from({ length: 100 }, (_, index) => ({ id: `performance-reply-${index}`, campaign_id: campaigns[index].id, replied_at: "2026-07-18T05:00:00.000Z" }));
  const hidden = Array.from({ length: 20 }, (_, index) => ({ id: `performance-hidden-${index}`, eventType: "note_added", partnerId: partners[0].id, allowedRoles: ["admin"] }));
  return {
    partners, campaigns, outreachCampaigns: [], partnerPrograms: [],
    activityEvents: [...activityEvents, ...hidden], auditHistory, automationEvents, companyEvents: [], tasks,
    outreachAttempts, outreachReplies, reports, partnerProgramArtifacts: [], evidencePackNotes: [], dataRoomItems: []
  };
}

const detailed = performanceFixture();
const detailedBefore = structuredClone(detailed);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => { networkRequests += 1; throw new Error("Partner activity attempted a network request."); };
let benchmark;
const startedAt = performance.now();
try {
  benchmark = buildPartnerActivity(detailed, OWNER, "performance-partner-0", NOW);
} finally {
  globalThis.fetch = originalFetch;
}
const projectionMs = performance.now() - startedAt;
const serializedBytes = Buffer.byteLength(JSON.stringify(benchmark), "utf8");
const sourceMutations = Number(JSON.stringify(detailed) !== JSON.stringify(detailedBefore));
const storageWrites = 0;
const partnerStageChanges = 0;
assert.equal(benchmark.counts.candidatesScanned, 1000, "Hidden records must be filtered before diagnostic counts.");
assert.equal(benchmark.counts.authorizedEvents, 10);
assert.equal(benchmark.counts.duplicatesRemoved, 1);
assert.equal(benchmark.counts.projectedEvents, 9);
assert.ok(projectionMs < 200, `Partner activity should remain below 200 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 100_000);
assert.equal(networkRequests, 0);
assert.equal(storageWrites, 0);
assert.equal(sourceMutations, 0);
assert.equal(partnerStageChanges, 0);
assert.deepEqual(detailed, detailedBefore);

console.log("PASS test-vnext-partner-activity");
console.log(JSON.stringify({
  fixture: "production-like-partner-activity-adapter-not-an-unpaginated-endpoint-proposal",
  partners: detailed.partners.length,
  candidatesScanned: benchmark.counts.candidatesScanned,
  authorizedEvents: benchmark.counts.authorizedEvents,
  duplicatesRemoved: benchmark.counts.duplicatesRemoved,
  projectedEvents: benchmark.counts.projectedEvents,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  networkRequests,
  storageWrites,
  sourceMutations,
  partnerStageChanges
}));
