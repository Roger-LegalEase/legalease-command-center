import { expect, test } from "@playwright/test";

import { discoveryAnalyticsBrowserSource } from "../../scripts/ui/controllers/discovery-analytics-controller.mjs";
import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

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

test.describe("integrated Discovery shell", () => {
  let server;

  test.beforeAll(async () => {
    server = await startPreviewServer({ env:{
      COMMAND_CENTER_UX_VNEXT:"true",
      COMMAND_CENTER_UX_VNEXT_SOCIAL:"true",
      COMMAND_CENTER_UX_VNEXT_OUTREACH:"true",
      COMMAND_CENTER_UX_VNEXT_FILES:"true",
      COMMAND_CENTER_UX_VNEXT_DISCOVERY:"true"
    } });
  });

  test.afterAll(async () => { await server?.stop(); });

  test("onboarding, checklist, Help, and analytics failure retain canonical workflows", async ({ page, context }, testInfo) => {
    test.slow();
    const auth = await loginOwner(server);
    await context.addCookies(auth.cookie.split("; ").map((pair) => {
      const separator = pair.indexOf("=");
      return { name:pair.slice(0, separator), value:pair.slice(separator + 1), url:server.baseUrl };
    }));
    const mutations = [];
    page.on("request", (request) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(new URL(request.url()).pathname);
    });

    await page.goto(`${server.baseUrl}/#today`);
    await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
    const onboarding = page.locator("[data-discovery-onboarding]");
    await expect(onboarding).toBeVisible();
    const onboardingShot = testInfo.outputPath("phase7-onboarding.png");
    await page.screenshot({ path:onboardingShot });
    await testInfo.attach("Phase 7 onboarding", { path:onboardingShot, contentType:"image/png" });

    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ui/discovery/onboarding" && response.request().method() === "POST"),
      onboarding.getByRole("button", { name:/Skip for now/ }).click()
    ]);
    await expect(onboarding).toBeHidden();
    await page.reload();
    await expect(onboarding).toBeHidden();

    async function reopenTour() {
      await page.evaluate(() => window.__LE_GLOBAL_CREATE?.closeWorkspace?.({ force:true, returnFocus:false }));
      await expect(page.locator("[data-global-create-workspace]")).toBeHidden();
      await page.getByRole("button", { name:"Profile" }).click();
      await page.getByRole("menuitem", { name:"Start product tour again" }).click();
      await expect(onboarding).toBeVisible();
    }
    async function choose(choiceId) {
      const button = onboarding.locator(`[data-onboarding-choice="${choiceId}"]`);
      await expect(button).toBeEnabled();
      const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ui/discovery/onboarding" && response.request().method() === "POST", { timeout:10_000 });
      await button.click();
      expect((await responsePromise).status()).toBe(200);
    }
    async function closeCreate() {
      await page.getByRole("button", { name:"Close creation workspace" }).click();
      await expect(page.locator("[data-global-create-workspace]")).toBeHidden();
    }

    await reopenTour();
    await choose("social");
    await expect(page.getByRole("heading", { name:"Social post" })).toBeVisible();
    await closeCreate();

    await reopenTour();
    await choose("outreach");
    await expect(page.getByRole("heading", { name:"Outreach campaign" })).toBeVisible();
    await closeCreate();

    await reopenTour();
    await choose("partners");
    await expect(page).toHaveURL(/#partners$/);
    await expect(page.getByRole("heading", { name:"Relationships", level:1 })).toBeVisible();

    await reopenTour();
    await choose("files");
    await expect(page).toHaveURL(/#files\?collection=investor-room$/);
    await expect(page.getByRole("heading", { name:"Investor Room", level:1 })).toBeVisible();

    await reopenTour();
    await choose("today");
    await expect(page).toHaveURL(/#today$/);
    await expect(page.getByRole("heading", { name:"Today", level:1 })).toBeVisible();

    await page.getByRole("button", { name:"Profile" }).click();
    await page.getByRole("menuitem", { name:"Getting started" }).click();
    const checklist = page.getByRole("dialog", { name:"Getting started" });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByRole("progressbar")).toBeVisible();
    const checklistShot = testInfo.outputPath("phase7-checklist.png");
    await page.screenshot({ path:checklistShot });
    await testInfo.attach("Phase 7 checklist", { path:checklistShot, contentType:"image/png" });
    await checklist.getByRole("button", { name:"Close getting started" }).click();

    const helpTrigger = page.getByRole("button", { name:"Help" });
    await helpTrigger.focus();
    await helpTrigger.click();
    const help = page.getByRole("dialog", { name:"Help for this page" });
    await expect(help).toBeVisible();
    const helpShot = testInfo.outputPath("phase7-contextual-help.png");
    await page.screenshot({ path:helpShot });
    await testInfo.attach("Phase 7 contextual Help", { path:helpShot, contentType:"image/png" });
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(helpTrigger).toBeFocused();

    const dedupeRequestId = "phase7-analytics-dedupe-request";
    const dedupeEvent = { eventType:"workflow_started", workflowId:"social-post", destinationId:"social", journeyId:"journey-phase7dedupe0001" };
    const firstAnalytics = await page.request.post(`${server.baseUrl}/api/ui/discovery/analytics`, { headers:{ "x-csrf-token":auth.csrfToken, "x-request-id":dedupeRequestId }, data:dedupeEvent });
    const repeatedAnalytics = await page.request.post(`${server.baseUrl}/api/ui/discovery/analytics`, { headers:{ "x-csrf-token":auth.csrfToken, "x-request-id":dedupeRequestId }, data:dedupeEvent });
    expect(firstAnalytics.status()).toBe(202);
    expect(repeatedAnalytics.status()).toBe(200);
    expect((await repeatedAnalytics.json()).reused).toBe(true);

    await page.route("**/api/ui/discovery/analytics", (route) => route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ ok:false, accepted:false }) }));
    await reopenTour();
    await choose("social");
    const create = page.getByRole("dialog", { name:"Create" });
    await create.getByLabel("Working title or idea").fill("Synthetic Phase 7 Post");
    await create.getByRole("button", { name:"Create social post" }).click();
    await expect(page).toHaveURL(/#social\/post\//);
    await expect(page.getByRole("heading", { name:"Post composer", level:1 })).toBeVisible();
    expect(mutations.some((path) => /send|publish|launch|provider|connect/.test(path))).toBe(false);
    expect(mutations.filter((path) => path === "/api/ui/create/post")).toHaveLength(1);
    const persisted = await page.request.get(`${server.baseUrl}/api/test/fixture-state`).then((response) => response.json());
    expect(persisted.userDiscoveryPreferences).toHaveLength(1);
    expect(persisted.discoveryAnalyticsEvents.filter((event) => event.requestId === dedupeRequestId)).toHaveLength(1);
    const analyticsKeys = new Set(["id", "requestId", "subjectId", "_version", "eventType", "occurredAt", "destinationId", "workflowId", "journeyId", "source", "actionId", "reasonCode", "resultType", "durationMs", "resultPosition"]);
    expect(persisted.discoveryAnalyticsEvents.every((event) => Object.keys(event).every((key) => analyticsKeys.has(key)))).toBe(true);
    expect(JSON.stringify(persisted.discoveryAnalyticsEvents)).not.toMatch(/Synthetic Phase 7 Post|person@example\.com|recipientAddress|legalFacts|oauth|token|partnerCommunication|emailBody|socialPostBody/i);
  });
});
