import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  allowExpectedConsoleError,
  allowExpectedCriticalResponse,
  allowExpectedRequestFailure,
  expect,
  openToday,
  test
} from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-309b");
const widths = [1440, 1024, 768, 390];
const filterKeys = ["channel", "topic", "campaign", "template", "theme", "metrics", "proof", "reuse"];

function timingValue(header, name) {
  const match = String(header || "").match(new RegExp(`${name};dur=([0-9.]+)`));
  return match ? Number(match[1]) : null;
}

async function openResults(page, width = 1440, suffix = "") {
  const baseURL = process.env.BROWSER_TEST_SOCIAL_BASE_URL;
  expect(baseURL).toBeTruthy();
  for (const pathname of ["/api/health/supabase", "/api/backups", "/api/safety/posture", "/api/version/drift"]) {
    allowExpectedRequestFailure(page, pathname, /abort/i, 2);
  }
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await openToday(page, `${baseURL}/#social?view=results${suffix}`);
  await expect(page.locator("[data-social-results-page]")).toBeVisible();
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "false");
}

async function expectNoOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(0);
  return { width, overflow };
}

test("Social Results compact endpoint settles directly on the exact browser fixture", async ({ request }) => {
  const baseURL = process.env.BROWSER_TEST_SOCIAL_BASE_URL;
  expect(baseURL).toBeTruthy();
  const startedAt = performance.now();
  const response = await request.get(`${baseURL}/api/ui/social/results?limit=24`);
  const responseMs = performance.now() - startedAt;
  const body = await response.body();
  const serverTiming = response.headers()["server-timing"] || "";
  const storeMs = timingValue(serverTiming, "store");
  const projectionMs = timingValue(serverTiming, "projection");
  const serializationMs = timingValue(serverTiming, "serialization");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(body.byteLength).toBeLessThan(64 * 1024);
  expect(storeMs).not.toBeNull();
  expect(projectionMs).not.toBeNull();
  expect(serializationMs).not.toBeNull();
  expect(projectionMs).toBeLessThan(2_000);
  expect(responseMs).toBeLessThan(3_000);
  console.log("CCX309B_ENDPOINT", JSON.stringify({
    status:response.status(),
    responseMs:Number(responseMs.toFixed(2)),
    responseBytes:body.byteLength,
    storeMs,
    projectionMs,
    serializationMs
  }));
});

test("Social Results campaign tags use exact projected internal links without mutations", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  const mutationRequests = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutationRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });

  const screenshots = [
    { width:1440, suffix:"", name:"social-results-1440.png" },
    { width:1440, suffix:"&campaign=results-campaign-community", name:"social-results-filtered-1440.png" },
    { width:1440, suffix:"&metrics=unavailable", name:"social-results-metrics-unavailable-1440.png" },
    { width:1440, suffix:"&topic=partial_publication", name:"social-results-partial-publication-1440.png" },
    { width:1024, suffix:"", name:"social-results-1024.png" },
    { width:768, suffix:"", name:"social-results-768.png" },
    { width:390, suffix:"", name:"social-results-390.png" },
    { width:390, suffix:"&metrics=unavailable", name:"social-results-filters-390.png", focus:"metrics" }
  ];
  for (const screenshot of screenshots) {
    await openResults(page, screenshot.width, screenshot.suffix);
    if (screenshot.focus) await page.locator(`[data-social-results-page] select[name='${screenshot.focus}']`).focus();
    await page.screenshot({ path:path.join(screenshotDirectory, screenshot.name), fullPage:true, animations:"disabled" });
  }

  const exactCampaignHref = "#outreach/campaign/campaign-exact-browser-fixture";
  const reconstructedCampaignHref = "#outreach/campaign/campaign-key-must-not-be-used";
  const campaignFixtureRoute = async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const items = (body.items || []).map((item, index) => ({
      ...item,
      campaign:index === 0
        ? { key:"campaign-key-must-not-be-used", label:"Exact campaign fixture", href:exactCampaignHref }
        : index === 1
          ? { key:"campaign-without-href", label:"Campaign without href", href:null }
          : { key:null, label:null, href:null }
    }));
    await route.fulfill({ response, json:{ ...body, items } });
  };
  await page.route("**/api/ui/social/results?*", campaignFixtureRoute);
  await page.evaluate(() => { location.hash = "#social?view=results&campaign=results-campaign-community"; });
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "false");

  const campaignLink = page.getByRole("link", { name:"Open campaign: Exact campaign fixture" });
  await expect(campaignLink).toHaveAttribute("href", exactCampaignHref);
  await expect(page.locator(`a[href='${reconstructedCampaignHref}']`)).toHaveCount(0);
  const missingHrefLabel = page.getByText("Campaign without href", { exact:true });
  await expect(missingHrefLabel).toBeVisible();
  expect(await missingHrefLabel.evaluate((node) => node.tagName)).toBe("SPAN");
  await expect(page.getByRole("link", { name:/Campaign without href/ })).toHaveCount(0);

  await campaignLink.click();
  expect(new URL(page.url()).hash).toBe(exactCampaignHref);
  expect(mutationRequests).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#social\?view=results&campaign=results-campaign-community$/);
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/api/ui/social/results?*", campaignFixtureRoute);
  await page.goForward();
  expect(new URL(page.url()).hash).toBe(exactCampaignHref);
  expect(mutationRequests).toEqual([]);
  console.log("CCX309B_CAMPAIGN_LINK", JSON.stringify({ exactCampaignHref, reconstructedCampaignHrefUsed:false, missingHrefClickable:false, mutations:0 }));
});

test("Social Results is a compact read-only workspace with exact truth and history-safe filters", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  const resultsRequests = [];
  const fullStateRequests = [];
  const mutations = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/ui/social/results") resultsRequests.push(url.search);
    if (url.pathname === "/api/state") fullStateRequests.push(url.pathname);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });

  await openResults(page);
  await expect(page.getByRole("heading", { name:"Results", level:1 })).toBeVisible();
  await expect(page.getByText("Published results", { exact:true })).toBeVisible();
  await expect(page.getByText("Results with metrics", { exact:true })).toBeVisible();
  await expect(page.getByText("Results without metrics", { exact:true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("tab", { name:"Results" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-results-card]")).toHaveCount(8);
  await expect(page.locator("[data-results-grid]")).not.toContainText(/Publishing|Failed|Reconciliation|status-only/i);
  await expect(page.getByRole("link", { name:"Open Post", exact:true }).first()).toHaveAttribute("href", /#social\/post\//);
  await expect(page.locator("[data-results-grid] a[target='_blank']").first()).toHaveAttribute("rel", /noopener/);
  await expect(page.getByRole("link", { name:"Open proof file" })).toHaveAttribute("href", "#files/data-room-item/browser-file-search-001");
  for (const key of filterKeys) {
    const control = page.locator(`[data-results-filter='${key}']`);
    await expect(control).toBeVisible();
    expect(await control.locator("option").count(), `${key} options`).toBeGreaterThan(1);
  }
  await page.screenshot({ path:path.join(screenshotDirectory, "social-results-1440.png"), fullPage:true, animations:"disabled" });

  const campaign = page.locator("[data-social-results-page] select[name='campaign']");
  await campaign.selectOption("results-campaign-community");
  await expect(page).toHaveURL(/campaign=results-campaign-community/);
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "false");
  await expect(campaign).toHaveValue("results-campaign-community");
  await page.screenshot({ path:path.join(screenshotDirectory, "social-results-filtered-1440.png"), fullPage:true, animations:"disabled" });
  await page.goBack();
  await expect(page).toHaveURL(/#social\?view=results$/);
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "false");
  await expect(campaign).toHaveValue("");
  await page.goForward();
  await expect(page).toHaveURL(/campaign=results-campaign-community/);
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "false");
  await expect(campaign).toHaveValue("results-campaign-community");

  await openResults(page, 1440, "&metrics=unavailable");
  await expect(page.locator("[data-results-card]")).toHaveCount(1);
  await expect(page.getByText("Metrics unavailable", { exact:true })).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "social-results-metrics-unavailable-1440.png"), fullPage:true, animations:"disabled" });

  await openResults(page, 1440, "&topic=partial_publication");
  await expect(page.locator("[data-results-card]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name:"Published Post 03" })).toBeVisible();
  await expect(page.locator("[data-results-grid]")).not.toContainText(/Facebook|failed/i);
  await page.screenshot({ path:path.join(screenshotDirectory, "social-results-partial-publication-1440.png"), fullPage:true, animations:"disabled" });

  await openResults(page, 1440, "&channel=threads");
  await expect(page.getByRole("heading", { name:"No matching results" })).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "social-results-empty-1440.png"), fullPage:true, animations:"disabled" });
  await openResults(page, 390, "&channel=threads");
  await expectNoOverflow(page, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "social-results-empty-390.png"), fullPage:true, animations:"disabled" });

  const clientMetrics = await page.evaluate(() => window.__LE_SOCIAL_RESULTS_METRICS);
  expect(clientMetrics.maximumActiveRequests).toBe(1);
  expect(clientMetrics.activeRequests).toBe(0);
  expect(clientMetrics.fullStateRequests).toBe(0);
  expect(clientMetrics.mutations).toBe(0);
  expect(clientMetrics.providerCalls).toBe(0);
  expect(resultsRequests.length).toBeGreaterThan(0);
  expect(resultsRequests.every((query) => query.includes("limit=24"))).toBe(true);
  expect(fullStateRequests).toEqual([]);
  expect(mutations).toEqual([]);
  console.log("CCX309B_REQUESTS", JSON.stringify({
    results:resultsRequests.length,
    maximumActive:clientMetrics.maximumActiveRequests,
    fullStateReads:fullStateRequests.length,
    fullStateWrites:0,
    mutations:mutations.length,
    providerCalls:clientMetrics.providerCalls
  }));
});

test("Social Results covers loading, retry, authorization, and session states", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_SOCIAL_BASE_URL;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/ui/social/results?*", async (route) => { await gate; await route.continue(); });
  await openToday(page, `${baseURL}/#social?view=results`);
  await expect(page.getByText("Loading Results", { exact:true })).toBeVisible();
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "true");
  release();
  await expect(page.locator("[data-results-content]")).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/api/ui/social/results?*");

  let attempts = 0;
  await page.route("**/api/ui/social/results?*", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      allowExpectedCriticalResponse(page, "/api/ui/social/results");
      allowExpectedConsoleError(page, /Failed to load resource/);
      await route.fulfill({ status:500, contentType:"application/json", body:JSON.stringify({ ok:false, error:"Synthetic recoverable failure" }) });
      return;
    }
    await route.continue();
  });
  allowExpectedRequestFailure(page, "/api/lee/threads", /^net::ERR_ABORTED$/, 1);
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Results could not load" })).toBeVisible();
  await page.getByRole("button", { name:"Try again" }).click();
  await expect(page.locator("[data-results-card]").first()).toBeVisible();
  expect(attempts).toBe(2);
  await page.unroute("**/api/ui/social/results?*");

  await page.route("**/api/ui/social/results?*", async (route) => {
    allowExpectedCriticalResponse(page, "/api/ui/social/results");
    allowExpectedConsoleError(page, /Failed to load resource/);
    await route.fulfill({ status:403, contentType:"application/json", body:JSON.stringify({ ok:false, error:"Not available" }) });
  });
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Results need additional access" })).toBeVisible();
  await page.unroute("**/api/ui/social/results?*");

  await page.route("**/api/ui/social/results?*", async (route) => {
    allowExpectedCriticalResponse(page, "/api/ui/social/results");
    allowExpectedConsoleError(page, /Failed to load resource/);
    await route.fulfill({ status:401, contentType:"application/json", body:JSON.stringify({ ok:false, error:"Session expired" }) });
  });
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-vnext-shell-state='session_expired']")).toBeVisible();
  await expect(page.locator("[data-social-results-page]")).toHaveCount(0);
});

test("Social Results is accessible and overflow-free at every required width", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  const serious = [];
  const critical = [];
  const overflows = [];
  for (const width of widths) {
    await openResults(page, width);
    overflows.push(await expectNoOverflow(page, width));
    await expect(page.locator("[data-results-filters]")).toBeVisible();
    await expect(page.getByText("Results without metrics", { exact:true })).toBeVisible();
    const analysis = await new AxeBuilder({ page }).analyze();
    serious.push(...analysis.violations.filter((violation) => violation.impact === "serious"));
    critical.push(...analysis.violations.filter((violation) => violation.impact === "critical"));
    await page.screenshot({ path:path.join(screenshotDirectory, `social-results-${width}.png`), fullPage:true, animations:"disabled" });
  }
  await openResults(page, 390, "&metrics=unavailable");
  await page.locator("[data-social-results-page] select[name='metrics']").focus();
  await expectNoOverflow(page, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "social-results-filters-390.png"), fullPage:true, animations:"disabled" });
  expect(serious).toEqual([]);
  expect(critical).toEqual([]);
  console.log("CCX309B_ACCESSIBILITY", JSON.stringify({ widths, serious:0, critical:0 }));
  console.log("CCX309B_OVERFLOW", JSON.stringify(overflows));
});

test("Social Results flag-off retains legacy Social and makes no Results request", async ({ page }) => {
  const legacyURL = process.env.BROWSER_TEST_BASE_URL;
  const requests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/ui/social/results") requests.push(request.url()); });
  await openToday(page, `${legacyURL}/#queue`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("[data-social-results-page]")).toHaveCount(0);
  await expect(page.locator("#queue.page-section.active")).toBeVisible();
  expect(requests).toEqual([]);
  console.log("CCX309B_FLAG_OFF", JSON.stringify({ legacyQueue:true, resultsSurface:false, resultsRequests:0 }));
});
