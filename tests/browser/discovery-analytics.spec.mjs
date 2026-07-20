import { expect, test } from "@playwright/test";

import { discoveryAnalyticsBrowserSource } from "../../scripts/ui/controllers/discovery-analytics-controller.mjs";

test("Discovery analytics records the safe lifecycle and drops sensitive detail", async ({ page }) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.setContent(`<!doctype html><html><body><a href="#files" data-analytics-search-result data-analytics-destination="files" data-analytics-result-type="file" data-analytics-result-position="3">Open result</a></body></html>`);
  await page.evaluate(() => {
    location.hash = "today";
    window.__capturedDiscoveryAnalytics = [];
    window.__LE_DISCOVERY_ANALYTICS_CAPTURE = (event) => window.__capturedDiscoveryAnalytics.push(event);
  });
  await page.addScriptTag({ content:discoveryAnalyticsBrowserSource() });

  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("vnext:workflow-started", { detail:{ workflowId:"social-post", destinationId:"social", emailBody:"Private launch message", recipientAddress:"person@example.com" } }));
    document.dispatchEvent(new CustomEvent("vnext:validation-blocked", { detail:{ workflowId:"social-post", actionId:"schedule", reasonCode:"missing-time", legalFacts:"Private case facts" } }));
    document.dispatchEvent(new CustomEvent("vnext:action-failed", { detail:{ workflowId:"social-post", actionId:"save-draft", reasonCode:"write-unavailable", oauthToken:"not-a-real-token" } }));
    document.dispatchEvent(new CustomEvent("vnext:workflow-completed", { detail:{ workflowId:"social-post", socialPostBody:"Private post" } }));
    document.dispatchEvent(new CustomEvent("vnext:workflow-started", { detail:{ workflowId:"outreach-campaign", destinationId:"outreach", partnerCommunication:"Private note" } }));
    window.dispatchEvent(new Event("pagehide"));
  });
  await page.getByRole("link", { name:"Open result" }).click();
  await expect.poll(() => page.evaluate(() => window.__capturedDiscoveryAnalytics.length)).toBeGreaterThanOrEqual(9);

  const events = await page.evaluate(() => window.__capturedDiscoveryAnalytics);
  expect(new Set(events.map((event) => event.eventType))).toEqual(new Set([
    "destination_opened",
    "workflow_started",
    "workflow_completed",
    "workflow_abandoned",
    "validation_blocked",
    "action_failed",
    "time_to_first_completed_workflow",
    "search_result_selected"
  ]));
  expect(events.find((event) => event.eventType === "workflow_abandoned").reasonCode).toBe("page-hidden");
  expect(events.find((event) => event.eventType === "search_result_selected")).toMatchObject({ destinationId:"files", resultType:"file", resultPosition:3 });
  expect(JSON.stringify(events)).not.toMatch(/Private|person@example\.com|oauthToken|recipientAddress|legalFacts|partnerCommunication|emailBody|socialPostBody/i);
  expect(await page.evaluate(() => window.__LE_DISCOVERY_ANALYTICS.activeJourneyCount())).toBe(0);
  expect(browserErrors).toEqual([]);
});
