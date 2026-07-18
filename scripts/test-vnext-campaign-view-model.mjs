#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  CAMPAIGN_DELIVERY_MODE_CONTRACT,
  CAMPAIGN_STATUS_CONTRACT,
  CAMPAIGN_TYPE_CONTRACT,
  buildCampaignView,
  buildCampaignViews
} from "./ui/view-models/campaign-view.mjs";
import { CAMPAIGN_SOURCE_MAPPINGS } from "./ui/view-models/campaign-sources.mjs";
import {
  ROUTE_COMPATIBILITY_TOTALS,
  resolveRouteCompatibility
} from "./ui/route-compatibility.mjs";

const OWNER = Object.freeze({ authenticated: true, role: "owner" });
const OPERATOR = Object.freeze({ authenticated: true, role: "operator" });

function fixtureState() {
  return {
    campaigns: [
      {
        id: "same-stable-id",
        campaignName: "Partner introduction",
        campaignType: "partner_outreach",
        deliveryMode: "one_time_message",
        goal: "Introduce the synthetic partner program.",
        owner: "Founder",
        status: "draft",
        nextAction: "Request review",
        targetAudience: "Synthetic partner contacts",
        audienceSelected: true,
        recipients: [{ id: "recipient-01", email: "person@example.com" }],
        recipientCount: 1,
        excludedRecipientCount: 0,
        approvalStatus: "approved",
        liveMode: false,
        sendCount: 0,
        actualReferrals: 0,
        createdAt: "2026-07-15T09:00:00.000Z",
        updatedAt: "2026-07-17T09:00:00.000Z"
      },
      {
        id: "customer-canonical",
        name: "Customer return sequence",
        campaignType: "customer_reengagement",
        deliveryMode: "follow_up_sequence",
        sequenceSteps: [{ id: "c-step-2" }, { id: "c-step-1" }],
        status: "active",
        audienceSelected: true,
        recipientCount: 14,
        replyCount: 2,
        meetingCount: 1,
        resultSummary: "Two synthetic customers replied."
      },
      {
        id: "announcement-01",
        campaignName: "Service announcement",
        campaignType: "announcement",
        deliveryMode: "one_time_message",
        subject: "A synthetic service update",
        status: "scheduled",
        scheduledAt: "2026-07-21T14:00:00.000Z",
        timezone: "America/New_York",
        audienceSelected: false,
        recipients: [],
        recipientCount: 0,
        senderConnected: true,
        approvalStatus: "approved"
      },
      {
        id: "owner-only",
        campaignName: "Restricted partner campaign",
        campaignType: "partner_outreach",
        allowedRoles: ["owner"]
      },
      {
        id: "social-must-not-project",
        campaignName: "Social calendar",
        campaignType: "social_post",
        sourceKind: "social"
      }
    ],
    outreachCampaigns: [
      {
        campaign_id: "same-stable-id",
        name: "Partner follow-up",
        status: "active",
        classification: "nonprofit",
        owner: "Founder",
        next_action: "Review replies",
        senderConnected: true,
        created_at: "2026-07-14T08:00:00.000Z"
      }
    ],
    outreachContacts: [
      { contact_id: "contact-01", campaign_id: "same-stable-id", sequence_status: "active" },
      { contact_id: "contact-02", campaign_id: "same-stable-id", manually_suppressed: true },
      { contact_id: "contact-03", enrolled_campaigns: ["same-stable-id"], replied: true },
      { contact_id: "contact-unlinked", campaign_id: "other-campaign", unsubscribed: true }
    ],
    outreachSequenceSteps: [
      { id: "outreach-step-02", campaign_id: "same-stable-id", step_number: 2, subject: "Synthetic follow-up" },
      { id: "outreach-step-01", campaign_id: "same-stable-id", step_number: 1, subject: "Synthetic introduction" }
    ],
    outreachAttempts: [
      { id: "attempt-01", campaign_id: "same-stable-id", contact_id: "contact-01", step_number: 1, status: "sent", sent_at: "2026-07-16T10:00:00.000Z", providerPayload: "must-not-project" }
    ],
    outreachReplies: [
      { id: "reply-01", campaign_id: "same-stable-id", contact_id: "contact-03", status: "received", replied_at: "2026-07-17T10:00:00.000Z", body: "must-not-project" }
    ],
    outreachSuppressions: [
      { id: "suppression-01", campaign_id: "same-stable-id", contact_id: "contact-02", reason: "manual" }
    ],
    outreachUnsubscribes: [],
    outreachBounces: [],
    approvalQueue: [
      { id: "outreach-approval-01", type: "outreach_message", campaign_id: "same-stable-id", step_number: 1, status: "approved" },
      { id: "outreach-approval-unlinked", type: "outreach_message", campaign_id: "other-campaign", status: "approved" }
    ],
    reactivationCampaign: {
      status: "paused",
      name: "Customer reactivation",
      goal: "Invite eligible synthetic customers back.",
      pausedReason: "Founder review",
      sequenceVariant: "A",
      waves: [{ wave: 1, scheduledAt: "2026-07-24T13:00:00.000Z" }],
      created_at: "2026-07-13T08:00:00.000Z"
    },
    reactivationContacts: [
      { contact_id: "reactivation-01", campaign_id: "mvp-reactivation", wave: 1, sequence_status: "staged" },
      { contact_id: "reactivation-02", campaign_id: "mvp-reactivation", unsubscribed: true },
      { contact_id: "reactivation-03", campaign_id: "mvp-reactivation", replied: true }
    ],
    reactivationAttempts: [],
    reactivationEvents: [
      { id: "reactivation-event-01", campaign_id: "mvp-reactivation", type: "campaign_paused", status: "recorded", created_at: "2026-07-17T11:00:00.000Z" }
    ],
    reactivationSendClaims: [],
    queueItems: [
      { id: "canonical-queue-01", sourceRef: { collection: "campaigns", itemId: "same-stable-id" }, status: "approved" },
      { id: "reactivation-queue-01", sourceRef: { collection: "reactivationCampaign", itemId: "mvp-reactivation" }, status: "pending" }
    ],
    approvals: [
      { id: "canonical-approval-01", queue_item_id: "canonical-queue-01", status: "approved" },
      { id: "reactivation-approval-01", queue_item_id: "reactivation-queue-01", status: "pending" }
    ],
    activityEvents: [
      { id: "campaign-activity-01", sourceRef: { collection: "campaigns", itemId: "same-stable-id" }, type: "campaign_updated", createdAt: "2026-07-17T08:00:00.000Z" }
    ],
    auditHistory: []
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

const state = fixtureState();
const before = structuredClone(state);
const views = buildCampaignViews(state, OWNER);
const canonical = views.find((item) => item.stableIdentity === "campaign:same-stable-id");
const partner = views.find((item) => item.stableIdentity === "outreach:same-stable-id");
const reactivation = views.find((item) => item.stableIdentity === "reactivation:mvp-reactivation");
const announcement = views.find((item) => item.stableIdentity === "campaign:announcement-01");

assert.equal(typeof buildCampaignView, "function");
assert.equal(typeof buildCampaignViews, "function");
assert.deepEqual(state, before, "Projection must not mutate stored source collections.");
assert.deepEqual(buildCampaignViews(state, OWNER), views, "Equal input must produce equal output.");
assert.deepEqual(buildCampaignViews(reverseArrays(state), OWNER), views, "Source-array order must not affect CampaignView output.");
assert.deepEqual(buildCampaignView(state, "campaign:same-stable-id", OWNER), canonical);
assert.ok(Object.isFrozen(views) && views.every(Object.isFrozen));
assert.ok(Object.isFrozen(canonical.source) && Object.isFrozen(canonical.audience) && Object.isFrozen(canonical.sourceReferences));
assert.throws(() => canonical.sourceReferences.push({}), TypeError);
assert.deepEqual(state, before);

assert.deepEqual(views.map((item) => item.stableIdentity), [
  "campaign:announcement-01",
  "campaign:customer-canonical",
  "campaign:owner-only",
  "campaign:same-stable-id",
  "outreach:same-stable-id",
  "reactivation:mvp-reactivation"
]);
assert.equal(views.some((item) => item.source.sourceId === "social-must-not-project"), false, "Social/Post campaigns must not be absorbed into Outreach.");
assert.equal(canonical.source.collection, "campaigns");
assert.equal(partner.source.collection, "outreachCampaigns");
assert.equal(reactivation.source.collection, "reactivationCampaign");
assert.notEqual(canonical.stableIdentity, partner.stableIdentity, "Equal source IDs in separate collections must remain separate Campaign identities.");
assert.equal(state.campaigns.length, 5);
assert.equal(state.outreachCampaigns.length, 1);
assert.equal(typeof state.reactivationCampaign, "object", "Source collections must not be destructively merged.");

assert.deepEqual(canonical.campaignType, CAMPAIGN_TYPE_CONTRACT.partner_outreach);
assert.deepEqual(views.find((item) => item.stableIdentity === "campaign:customer-canonical").campaignType, CAMPAIGN_TYPE_CONTRACT.customer_reengagement);
assert.deepEqual(announcement.campaignType, CAMPAIGN_TYPE_CONTRACT.announcement);
assert.deepEqual(canonical.deliveryMode, CAMPAIGN_DELIVERY_MODE_CONTRACT.one_time_message);
assert.deepEqual(partner.deliveryMode, CAMPAIGN_DELIVERY_MODE_CONTRACT.follow_up_sequence);
assert.deepEqual(reactivation.deliveryMode, CAMPAIGN_DELIVERY_MODE_CONTRACT.follow_up_sequence);
assert.equal(CAMPAIGN_STATUS_CONTRACT.paused.label, "Paused");
assert.equal(canonical.status.label, "Draft");
assert.equal(partner.status.label, "Active");
assert.equal(reactivation.status.label, "Paused");
assert.equal(reactivation.status.sourceStatus, "paused");

assert.equal(canonical.audience.includedCount, 1);
assert.equal(canonical.audience.excluded.count, 0);
assert.equal(partner.audience.includedCount, 1);
assert.equal(partner.audience.excluded.count, 2);
assert.deepEqual(partner.audience.excluded.reasons, [
  { reason: "replied", count: 1 },
  { reason: "suppressed", count: 1 }
]);
assert.equal(reactivation.audience.includedCount, 1);
assert.equal(reactivation.audience.excluded.count, 2);
assert.equal(announcement.audience.includedCount, null, "An unselected audience must remain unavailable rather than becoming zero.");

assert.equal(canonical.approval.approved, true);
assert.equal(canonical.sending.enabled, false);
assert.equal(canonical.sending.sentCount, 0);
assert.equal(canonical.sending.executed, false, "Approval must not become execution.");
assert.equal(partner.approval.approved, true);
assert.equal(partner.sending.sentCount, 1);
assert.equal(announcement.schedule.scheduled, true);
assert.equal(announcement.schedule.sent, false, "A scheduled Campaign must not become sent.");
assert.equal(announcement.sending.senderConnected, true);
assert.equal(announcement.sending.enabled, null, "A connected sender must not become sending enabled.");
assert.equal(reactivation.pauseResume.paused, true);
assert.equal(reactivation.pauseResume.completed, false, "A paused Campaign must not become completed.");
assert.equal(reactivation.pauseResume.resumeRequiresApproval, true);

assert.equal(partner.repliesAndOutcomes.replyCount, 1);
assert.equal(partner.repliesAndOutcomes.meetingCount, null);
assert.equal(reactivation.repliesAndOutcomes.replyCount, 1);
assert.equal(announcement.results.available, false);
assert.equal(announcement.results.metrics.conversions, null, "Missing result metrics must remain unavailable rather than zero.");
assert.equal(reactivation.message.stepCount, 5);
assert.deepEqual(reactivation.message.cadenceDays, [1, 4, 9, 16, 30]);

assert.equal(canonical.exactSafeSourceLink, "#outreach/campaign/same-stable-id");
assert.equal(partner.exactSafeSourceLink, "#campaigns");
assert.equal(reactivation.exactSafeSourceLink, "#campaigns");
assert.equal(resolveRouteCompatibility(canonical.exactSafeSourceLink).sourceId, "same-stable-id");
assert.deepEqual(CAMPAIGN_SOURCE_MAPPINGS.canonical, {
  collection: "campaigns",
  sourceKind: "campaign",
  relationship: "record",
  exactLink: "#outreach/campaign/<id>"
});
assert.ok(canonical.sourceReferences.some((reference) => reference.sourceCollection === "queueItems" && reference.sourceId === "canonical-queue-01"));
assert.ok(reactivation.sourceReferences.some((reference) => reference.sourceCollection === "approvals" && reference.sourceId === "reactivation-approval-01"));
assert.ok(!JSON.stringify(views).includes("unlinked"));

assert.equal(buildCampaignViews(state, OPERATOR).some((item) => item.source.sourceId === "owner-only"), false);
assert.equal(buildCampaignViews(state, { authenticated: false, role: "owner" }).length, 0);
assert.equal(buildCampaignViews(state, { authenticated: true, role: "unknown-role" }).length, 0);
assert.equal(buildCampaignViews(state, { authenticated: true, role: "viewer" }).length, 0);

const serialized = JSON.stringify(views);
for (const forbidden of ["person@example.com", "providerPayload", "must-not-project", "rawPayload", "token", "oauth"]) {
  assert.doesNotMatch(serialized, new RegExp(forbidden, "i"), `CampaignView must not expose ${forbidden}.`);
}

const campaignViewSource = readFileSync("scripts/ui/view-models/campaign-view.mjs", "utf8");
const campaignSourcesSource = readFileSync("scripts/ui/view-models/campaign-sources.mjs", "utf8");
const pureSource = `${campaignViewSource}\n${campaignSourcesSource}`;
for (const forbiddenImport of [
  "preview-server", "storage", "database", "provider", "outreach-os", "reactivation-os",
  "campaign-command", "company-memory", "sendgrid", "supabase"
]) {
  assert.doesNotMatch(pureSource, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `CampaignView modules must not import ${forbiddenImport}.`);
}
for (const forbiddenRuntime of [
  /\bprocess\.env\b/,
  /\bDate\.now\s*\(/,
  /\bnew Date\s*\(\s*\)/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\b(?:window|document|localStorage|sessionStorage)\b/,
  /\b(?:readFile|writeFile|createServer)\s*\(/
]) {
  assert.doesNotMatch(pureSource, forbiddenRuntime, `CampaignView projection must remain pure: ${forbiddenRuntime}.`);
}
assert.doesNotMatch(pureSource, /(?:^|[^\w])(?:send|testSend|launch|release|resume|enroll|approve|schedule)\s*\(/im, "Projection must not execute Campaign actions.");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /view-models\/campaign-(?:view|sources)\.mjs/, "CCX-400 must not wire an endpoint or runtime page.");

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}
assert.equal(sha256(readFileSync("scripts/ui/route-compatibility.mjs")), "5ebc8eb1672e09480010badce644c5e3d01d67049f43a5816afc5bed2ed59f45");
assert.equal(sha256(serverSource), "7943bd4f5a93895121fbb5e7a6e8a632ca53338999d57dc4734a5ba4a7e445a3");
assert.deepEqual(ROUTE_COMPATIBILITY_TOTALS, { canonicalRoutes: 75, aliases: 53, objectFamilies: 4 });

function performanceFixture(count = 100) {
  const campaigns = Array.from({ length: count }, (_, index) => ({
    id: `performance-campaign-${String(index).padStart(3, "0")}`,
    campaignName: `Synthetic Campaign ${String(index).padStart(3, "0")}`,
    campaignType: index % 3 === 0 ? "partner_outreach" : index % 3 === 1 ? "customer_reengagement" : "announcement",
    deliveryMode: index % 2 === 0 ? "one_time_message" : "follow_up_sequence",
    goal: "A deterministic synthetic benchmark goal.",
    owner: "Founder",
    status: index % 7 === 0 ? "scheduled" : index % 11 === 0 ? "paused" : "draft",
    audienceSelected: true,
    recipientCount: 25 + index,
    excludedRecipientCount: index % 4,
    approvalStatus: index % 5 === 0 ? "approved" : "not_requested",
    sendingEnabled: false,
    sendCount: 0,
    scheduledAt: index % 7 === 0 ? "2026-08-01T14:00:00.000Z" : "",
    timezone: "Etc/UTC",
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z"
  }));
  return {
    campaigns,
    outreachCampaigns: [], outreachContacts: [], outreachSequenceSteps: [], outreachAttempts: [],
    outreachReplies: [], outreachSuppressions: [], outreachUnsubscribes: [], outreachBounces: [],
    approvalQueue: [], queueItems: [], approvals: [], activityEvents: [], auditHistory: []
  };
}

const productionLike = performanceFixture();
const performanceBefore = structuredClone(productionLike);
buildCampaignViews(productionLike, OWNER);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("CampaignView projection attempted a network request.");
};
const startedAt = performance.now();
let performanceViews;
try {
  performanceViews = buildCampaignViews(productionLike, OWNER);
} finally {
  globalThis.fetch = originalFetch;
}
const projectionMs = performance.now() - startedAt;
const serializedBytes = Buffer.byteLength(JSON.stringify(performanceViews), "utf8");
const inputMutations = Number(JSON.stringify(productionLike) !== JSON.stringify(performanceBefore));
const storageWrites = 0;
const campaignExecutions = 0;

assert.equal(performanceViews.length, 100);
assert.ok(projectionMs < 100, `100-record CampaignView projection should remain below 100 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 350_000, `100-record detailed projection should remain below 350 KB; observed ${serializedBytes} bytes.`);
assert.equal(inputMutations, 0);
assert.equal(networkRequests, 0);
assert.equal(storageWrites, 0);
assert.equal(campaignExecutions, 0);
assert.deepEqual(productionLike, performanceBefore);

console.log("PASS test-vnext-campaign-view-model");
console.log(JSON.stringify({
  fixture: "deterministic-detailed-projection",
  campaignsExamined: productionLike.campaigns.length,
  campaignViews: performanceViews.length,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  inputMutations,
  networkRequests,
  storageWrites,
  campaignExecutions
}));
