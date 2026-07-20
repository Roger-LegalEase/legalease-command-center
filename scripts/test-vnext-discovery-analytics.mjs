#!/usr/bin/env node
import assert from "node:assert/strict";

import { buildPrivacySafeAnalyticsEvent, createDiscoveryAnalyticsTracker, DISCOVERY_ANALYTICS_EVENT_TYPES } from "./discovery-product-analytics.mjs";
import { discoveryAnalyticsBrowserSource } from "./ui/controllers/discovery-analytics-controller.mjs";

let milliseconds = Date.parse("2026-07-19T12:00:00.000Z");
const events = [];
let sequence = 0;
const tracker = createDiscoveryAnalyticsTracker({
  emit:(event) => events.push(event),
  now:() => new Date(milliseconds).toISOString(),
  randomId:() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
});

tracker.openDestination({ destinationId:"Social", source:"route" });
const social = tracker.startWorkflow({ workflowId:"social-post", destinationId:"social" });
milliseconds += 250;
tracker.validationBlocked({ journeyId:social.journeyId, actionId:"schedule", reasonCode:"missing-time" });
tracker.actionFailed({ journeyId:social.journeyId, actionId:"save-draft", reasonCode:"write-unavailable" });
milliseconds += 750;
tracker.completeWorkflow({ journeyId:social.journeyId });
tracker.selectSearchResult({ destinationId:"files", resultType:"file", resultPosition:2 });
const outreach = tracker.startWorkflow({ workflowId:"outreach-campaign", destinationId:"outreach" });
milliseconds += 400;
tracker.abandonWorkflow({ journeyId:outreach.journeyId, reasonCode:"navigation" });

assert.deepEqual(new Set(events.map((event) => event.eventType)), new Set(DISCOVERY_ANALYTICS_EVENT_TYPES));
assert.equal(events.find((event) => event.eventType === "workflow_completed").durationMs, 1000);
assert.equal(events.find((event) => event.eventType === "time_to_first_completed_workflow").durationMs, 1000);
assert.equal(events.find((event) => event.eventType === "workflow_abandoned").durationMs, 400);
assert.equal(tracker.activeJourneyCount(), 0);
assert.ok(events.every(Object.isFrozen));
assert.ok(events.every((event) => !Object.hasOwn(event, "actorId") && !Object.hasOwn(event, "metadata")));

const sensitive = {
  eventType:"workflow_started",
  workflowId:"social-post",
  destinationId:"social",
  journeyId:"journey-0000000000000001",
  emailBody:"Private email body"
};
const before = structuredClone(sensitive);
assert.throws(() => buildPrivacySafeAnalyticsEvent(sensitive, { now:"2026-07-19T12:00:00.000Z" }), /emailBody is not allowed/);
assert.deepEqual(sensitive, before);
assert.throws(() => buildPrivacySafeAnalyticsEvent({ eventType:"search_result_selected", destinationId:"files", resultType:"file", resultPosition:1, metadata:{ recipientAddress:"person@example.com" } }, { now:"2026-07-19T12:00:00.000Z" }), /metadata is not allowed/);
assert.throws(() => buildPrivacySafeAnalyticsEvent({ eventType:"action_failed", workflowId:"social-post", destinationId:"social", journeyId:"short", reasonCode:"failed" }, { now:"2026-07-19T12:00:00.000Z" }), /journeyId is invalid/);
assert.throws(() => buildPrivacySafeAnalyticsEvent({ eventType:"action_failed", workflowId:"social-post", destinationId:"social", journeyId:"journey-0000000000000001", reasonCode:"private-case-facts" }, { now:"2026-07-19T12:00:00.000Z" }), /reasonCode is invalid/);

const serialized = JSON.stringify(events);
for (const forbidden of ["emailBody", "socialPostBody", "legalFacts", "recipientAddress", "oauthToken", "secretValue", "partnerCommunication", "person@example.com"]) {
  assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
}
const browser = discoveryAnalyticsBrowserSource();
assert.match(browser, /pagehide/);
assert.match(browser, /time_to_first_completed_workflow/);
assert.doesNotMatch(browser, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/);

console.log("PASS test-vnext-discovery-analytics");
console.log(JSON.stringify({ eventTypes:DISCOVERY_ANALYTICS_EVENT_TYPES.length, completedJourneys:1, abandonedJourneys:1, sensitiveFieldsRecorded:0, providerCalls:0, externalActions:0 }));
