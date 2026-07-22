import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  allowExpectedCriticalResponse,
  allowExpectedConsoleError,
  allowExpectedRequestFailure,
  expect,
  openToday,
  test
} from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-301");
const FIXED_TIME = new Date("2026-07-18T11:00:00-04:00");

async function openSocial(page, { width = 1440, view = "ideas", filters = "" } = {}) {
  const baseURL = process.env.BROWSER_TEST_SOCIAL_BASE_URL;
  expect(baseURL, "The isolated Social browser fixture URL is required.").toBeTruthy();
  await page.setViewportSize({ width, height:width <= 390 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_TIME);
  await openToday(page, `${baseURL}/#social?view=${view}${filters}`);
  await expect(page.locator("[data-social-page]")).toBeVisible();
  await expect(page.locator("[data-social-content]")).toHaveAttribute("aria-busy", "false");
  return baseURL;
}

function emptyPayload(view = "ideas", sourceAvailability = { posts:true, contentBank:true }) {
  return {
    ok:true,
    generatedAt:"2026-07-18T15:00:00.000Z",
    selectedView:view,
    views:["ideas", "weekly", "calendar", "library", "results"].map((key) => ({ key, label:key === "weekly" ? "Weekly plan" : key[0].toUpperCase() + key.slice(1), count:0 })),
    sourceAvailability,
    filters:{ statuses:[], channels:[], topics:[], owners:[] },
    activeFilters:{ status:"", channel:"", topic:"", owner:"", dateFrom:"", dateTo:"" },
    counts:{ total:0, filtered:0, returned:0 },
    calendarGroups:{ scheduled:0, unscheduled:0 },
    items:[], nextCursor:null, truncated:false,
    capabilities:{ createsPost:true, createPostReason:null, mutatesSource:false, schedules:false, approves:false, publishes:false, regenerates:false }
  };
}

function reportSevereAxeFindings(width, violations) {
  const findings = violations.filter((violation) => ["serious", "critical"].includes(violation.impact)).map((violation) => ({
    id:violation.id,
    impact:violation.impact,
    help:violation.help,
    nodes:violation.nodes.map((node) => ({ target:node.target, failureSummary:node.failureSummary }))
  }));
  if (findings.length) console.error("CCX301_AXE_FINDINGS", JSON.stringify({ width, findings }));
  return findings;
}

async function expectNoOverflow(page, width) {
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body:document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document, `${width}px document overflow`).toBeLessThanOrEqual(0);
  expect(overflow.body, `${width}px body overflow`).toBeLessThanOrEqual(0);
  return overflow;
}

test("Social defaults to Ideas and keeps the five founder views on canonical identities", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const socialRequests = [];
  const fullStateRequests = [];
  const mutationRequests = [];
  const createPostRequests = [];
  const prohibitedActions = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/ui/social") socialRequests.push(url.search);
    if (url.pathname === "/api/state" && /#social(?:\?|$)/.test(page.url())) fullStateRequests.push(url.pathname);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutationRequests.push(url.pathname);
    if (request.method() === "POST" && url.pathname === "/api/ui/create/post") createPostRequests.push(url.pathname);
    if (/send|publish|schedule|approve|regenerate|provider|campaign.*(?:launch|release|resume|enroll)|partner.*stage|file.*status|suppression|live-gate/i.test(url.pathname)) prohibitedActions.push(url.pathname);
  });

  await openSocial(page);
  await expect(page.getByRole("heading", { name:"Social", level:1 })).toHaveCount(1);
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(5);
  expect(await tabs.allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/^Ideas/), expect.stringMatching(/^Weekly plan/), expect.stringMatching(/^Calendar/), expect.stringMatching(/^Library/), expect.stringMatching(/^Results/)]));
  expect(await tabs.evaluateAll((nodes) => nodes.map((node) => node.dataset.socialView))).toEqual(["ideas", "weekly", "calendar", "library", "results"]);
  await expect(page.getByRole("tab", { name:/^Ideas/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name:"Create post", exact:true })).toHaveCount(1);
  await expect(page.getByRole("button", { name:"Create post", exact:true })).toBeEnabled();
  await expect(page.getByRole("button", { name:"Create post", exact:true })).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-social-item='contentBank:social-source-community']")).toHaveCount(1);
  await expect(page.locator("[data-social-item='contentBank:social-source-converted']")).toHaveCount(0);
  await expect(page.locator("[data-social-item='post:idea-01']")).toHaveCount(1);
  await expect(page.locator("[data-social-item*='hidden']")).toHaveCount(0);
  const ideaKeys = await page.locator("[data-social-item]").evaluateAll((nodes) => nodes.map((node) => node.dataset.socialItem));
  expect(new Set(ideaKeys).size).toBe(ideaKeys.length);
  expect(ideaKeys).toHaveLength(24);
  expect(fullStateRequests, "Social home must not request full state.").toEqual([]);

  await page.getByRole("button", { name:"Create post", exact:true }).click();
  const createWorkspace = page.getByRole("dialog", { name:"Create" });
  await expect(createWorkspace.getByRole("heading", { name:"Social post" })).toBeVisible();
  await expect(createWorkspace).toContainText("Nothing will be scheduled, approved, or published.");
  await createWorkspace.getByRole("button", { name:"Cancel" }).click();
  await expect(createWorkspace).toBeHidden();
  expect(createPostRequests, "Opening Global Create must not create a Post.").toEqual([]);

  const firstLink = page.locator("[data-social-item='post:idea-01']").getByRole("link", { name:/Open Post/ });
  await expect(firstLink).toHaveAttribute("href", "#social/post/idea-01");
  await firstLink.click();
  await expect(page).toHaveURL(/#social\/post\/idea-01$/);
  await expect(page.locator("[data-post-composer]")).toBeVisible();
  await page.goBack();
  await expect(page.locator("[data-social-page]")).toBeVisible();
  fullStateRequests.length = 0;

  await page.getByRole("tab", { name:/^Calendar/ }).click();
  await expect(page).toHaveURL(/#social\?view=calendar$/);
  await expect(page.locator("[data-social-current-view='calendar']")).toBeVisible();
  expect(await page.locator("[data-social-calendar-group]").evaluateAll((nodes) => nodes.map((node) => node.dataset.socialCalendarGroup))).toEqual(["scheduled", "unscheduled"]);
  await expect(page.getByRole("region", { name:"Scheduled", exact:true })).toBeVisible();
  await expect(page.getByRole("region", { name:"Unscheduled", exact:true })).toBeVisible();
  await expect(page.locator("#vnext-social-scheduled-title")).toBeVisible();
  await expect(page.locator("#vnext-social-scheduled-title")).toHaveText("Scheduled");
  await expect(page.locator("#vnext-social-unscheduled-title")).toBeVisible();
  await expect(page.locator("#vnext-social-unscheduled-title")).toHaveText("Unscheduled");
  await expect(page.locator("[data-social-scheduled-grid] > li")).toHaveCount(8);
  await expect(page.locator("[data-social-unscheduled-grid] > li")).toHaveCount(16);
  await expect(page.locator("[data-social-item='post:scheduled-02']")).toContainText(/Jul 20, 2026, 8:30 PM (?:ET|EDT)/);
  await expect(page.locator("[data-social-item='post:scheduled-03']")).toContainText("Timezone unavailable");
  await expect(page.locator("[data-social-item='post:scheduled-04']")).toContainText("Timezone unavailable");
  await expect(page.locator("[data-social-page]")).not.toContainText(/Drag|Change date|Schedule now/i);
  await page.getByRole("button", { name:"Load more" }).click();
  await expect(page.locator("[data-social-scheduled-grid] > li")).toHaveCount(8);
  await expect(page.locator("[data-social-unscheduled-grid] > li")).toHaveCount(40);
  await page.getByRole("button", { name:"Load more" }).click();
  await expect(page.locator("[data-social-unscheduled-grid] > li")).toHaveCount(44);
  const calendarKeys = await page.locator("[data-social-calendar] [data-social-item]").evaluateAll((nodes) => nodes.map((node) => node.dataset.socialItem));
  expect(new Set(calendarKeys).size).toBe(52);

  await page.getByRole("tab", { name:/^Library/ }).click();
  await expect(page.locator("[data-social-current-view='library']")).toBeVisible();
  const libraryStatuses = new Set(await page.locator(".vnext-social-status").allTextContents());
  expect([...libraryStatuses].sort()).toEqual(["Draft", "Needs review", "Published", "Scheduled"]);
  await expect(page.locator("[data-social-kind='source_idea']")).toHaveCount(0);

  await page.getByRole("tab", { name:/^Results/ }).click();
  await expect(page.locator("[data-social-results-page]")).toBeVisible();
  await expect(page.getByText("Published guide awaiting metrics")).toBeVisible();
  await expect(page.locator("[data-results-card]")).toHaveCount(8);
  await expect(page.getByText("Metrics unavailable", { exact:true })).toBeVisible();
  await page.goBack();
  await expect(page.locator("[data-social-current-view='library']")).toBeVisible();
  await page.goForward();
  await expect(page.locator("[data-social-results-page]")).toBeVisible();

  const metrics = await page.evaluate(() => ({ ...window.__LE_SOCIAL_METRICS }));
  expect(metrics.duplicateRequests).toBe(0);
  expect(metrics.fullStateRequests).toBe(0);
  for (const key of ["sourceMutations", "storageWrites", "sends", "schedules", "approvals", "publications", "regenerations", "providerCalls"]) expect(metrics[key]).toBe(0);
  expect(fullStateRequests).toEqual([]);
  expect(mutationRequests).toEqual([]);
  expect(prohibitedActions).toEqual([]);
  console.log("CCX301_VIEW_COUNTS", JSON.stringify({ ideas:30, calendar:52, library:45, results:8 }));
  console.log("CCX301_REQUEST_COUNTS", JSON.stringify({ social:socialRequests.length, duplicate:0, fullState:0 }));
});

test("Social Create post availability follows the existing endpoint authorization", async ({ page }) => {
  test.slow();
  const ownerCreateRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/ui/create/post") ownerCreateRequests.push(url.pathname);
  });
  await openSocial(page);
  const ownerButton = page.getByRole("button", { name:"Create post", exact:true });
  await expect(ownerButton).toBeEnabled();
  await ownerButton.click();
  const ownerWorkspace = page.getByRole("dialog", { name:"Create" });
  await expect(ownerWorkspace.getByRole("heading", { name:"Social post" })).toBeVisible();
  expect(ownerCreateRequests).toEqual([]);
  await ownerWorkspace.getByRole("button", { name:"Cancel" }).click();

  const restrictedURL = process.env.BROWSER_TEST_SOCIAL_RESTRICTED_BASE_URL;
  const credential = process.env.BROWSER_TEST_RESTRICTED_CREDENTIAL;
  expect(restrictedURL, "The restricted Social fixture URL is required.").toBeTruthy();
  expect(credential, "The synthetic restricted credential is required.").toBeTruthy();
  const login = await page.request.post(`${restrictedURL}/api/auth/login`, { data:{ credential } });
  expect(login.ok()).toBe(true);
  allowExpectedConsoleError(page, /Failed to load resource.*403/i);
  await openToday(page, `${restrictedURL}/#social?view=ideas`);
  const operatorButton = page.getByRole("button", { name:"Create post", exact:true });
  await expect(operatorButton).toBeDisabled();
  await expect(operatorButton).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-social-create-explanation]")).toHaveText("This account can view Social but cannot create Posts.");
  const operatorContractResponse = await page.request.get(`${restrictedURL}/api/ui/social?view=ideas&limit=1`);
  expect(operatorContractResponse.ok()).toBe(true);
  const operatorContract = await operatorContractResponse.json();
  expect(operatorContract.capabilities).toMatchObject({ createsPost:false, createPostReason:"This account can view Social but cannot create Posts." });
  expect(JSON.stringify(operatorContract.capabilities)).not.toContain("manage_content_drafts");
  expect(reportSevereAxeFindings(1440, (await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);
  await page.evaluate(() => document.querySelector("[data-social-create]")?.click());
  await expect(page.getByRole("dialog", { name:"Create" })).toHaveCount(0);

  const restrictedCookies = await page.context().cookies(restrictedURL);
  const denied = await fetch(`${restrictedURL}/api/ui/create/post`, {
    method:"POST",
    headers:{ "content-type":"application/json", cookie:restrictedCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") },
    body:JSON.stringify({ creationRequestId:"social-auth-test-0001", title:"Must not create", draftCopy:"", channel:"" })
  });
  expect(denied.status).toBe(403);
  const afterContract = await (await page.request.get(`${restrictedURL}/api/ui/social?view=ideas&limit=1`)).json();
  expect(afterContract.views.find((view) => view.key === "ideas").count).toBe(operatorContract.views.find((view) => view.key === "ideas").count);
});

test("Social filters and pagination remain deterministic without duplicate work", async ({ page }) => {
  test.slow();
  const requests = [];
  page.on("request", (request) => { const url = new URL(request.url()); if (url.pathname === "/api/ui/social") requests.push(url.search); });
  await openSocial(page);
  await expect(page.locator("[data-social-grid] > li")).toHaveCount(24);
  await page.getByRole("button", { name:"Load more" }).click();
  await expect(page.locator("[data-social-grid] > li")).toHaveCount(30);
  await expect(page.getByRole("button", { name:"Load more" })).toBeHidden();
  const keys = await page.locator("[data-social-item]").evaluateAll((nodes) => nodes.map((node) => node.dataset.socialItem));
  expect(new Set(keys).size).toBe(30);
  expect(requests.filter((query) => query.includes("cursor=social-24"))).toHaveLength(1);
  const metrics = await page.evaluate(() => ({ ...window.__LE_SOCIAL_METRICS }));
  expect(metrics.paginationRequests).toBe(1);
  expect(metrics.duplicateRequests).toBe(0);

  await page.locator('[data-social-filter="status"]').selectOption("draft");
  await expect(page).toHaveURL(/status=draft/);
  await expect(page.locator(".vnext-social-status").first()).toHaveText("Draft");
  expect(await page.locator(".vnext-social-status").allTextContents()).toEqual(expect.arrayContaining(["Draft"]));
  expect((await page.locator(".vnext-social-status").allTextContents()).every((value) => value === "Draft")).toBe(true);
  await page.locator('[data-social-filter="channel"]').selectOption("linkedin");
  await expect(page).toHaveURL(/channel=linkedin/);
  await page.getByRole("button", { name:"Clear filters" }).click();
  await expect(page).toHaveURL(/#social\?view=ideas$/);

  await page.goto(`${process.env.BROWSER_TEST_SOCIAL_BASE_URL}/#social?view=calendar&dateFrom=2026-07-20&dateTo=2026-07-20`);
  await expect(page.locator("[data-social-item='post:scheduled-02']")).toBeVisible();
  await page.goto(`${process.env.BROWSER_TEST_SOCIAL_BASE_URL}/#social?view=calendar&dateFrom=2026-07-21&dateTo=2026-07-21`);
  await expect(page.locator("[data-social-item='post:scheduled-02']")).toHaveCount(0);
  console.log("CCX301_PAGINATION", JSON.stringify({ pageOne:24, pageTwo:6, duplicates:0, requests:2 }));
});

test("Social loading, empty, filtered empty, source loss, errors, access, and session expiry fail safely", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = process.env.BROWSER_TEST_SOCIAL_BASE_URL;
  for (const pathname of ["/api/lee/threads", "/api/today/summary", "/api/campaign/command"]) {
    allowExpectedRequestFailure(page, pathname, /abort/i, 10);
  }
  let attempts = 0;
  await page.route("**/api/ui/social?*", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      allowExpectedCriticalResponse(page, "/api/ui/social");
      allowExpectedConsoleError(page, /Failed to load resource/);
      await route.fulfill({ status:500, contentType:"application/json", body:JSON.stringify({ error:"Synthetic recoverable failure" }) });
      return;
    }
    await route.continue();
  });
  await openToday(page, `${baseURL}/#social?view=ideas`);
  await expect(page.getByRole("heading", { name:"Social could not load" })).toBeVisible();
  await page.getByRole("button", { name:"Try again" }).click();
  await expect(page.locator("[data-social-grid] > li").first()).toBeVisible();
  expect(attempts).toBe(2);
  await page.unroute("**/api/ui/social?*");

  await page.route("**/api/ui/social?*", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(emptyPayload()) }));
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Nothing here yet" })).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "social-empty-1440.png"), fullPage:true, animations:"disabled" });
  await page.setViewportSize({ width:390, height:844 });
  await expectNoOverflow(page, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "social-empty-390.png"), fullPage:true, animations:"disabled" });

  await page.unroute("**/api/ui/social?*");
  await page.route("**/api/ui/social?*", (route) => { const payload = emptyPayload(); payload.activeFilters.status = "draft"; route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(payload) }); });
  await page.goto(`${baseURL}/#social?view=ideas&status=draft`);
  await expect(page.getByRole("heading", { name:"No matching Social work" })).toBeVisible();

  await page.unroute("**/api/ui/social?*");
  await page.route("**/api/ui/social?*", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(emptyPayload("ideas", { posts:false, contentBank:true })) }));
  await page.goto(`${baseURL}/#social?view=ideas`);
  await expect(page.locator("[data-social-source-state]")).toContainText("Post source unavailable");

  await page.unroute("**/api/ui/social?*");
  await page.route("**/api/ui/social?*", (route) => { allowExpectedCriticalResponse(page, "/api/ui/social"); allowExpectedConsoleError(page, /Failed to load resource/); return route.fulfill({ status:403, contentType:"application/json", body:JSON.stringify({ error:"Not available" }) }); });
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Social needs additional access" })).toBeVisible();

  await page.unroute("**/api/ui/social?*");
  await page.route("**/api/ui/social?*", (route) => { allowExpectedCriticalResponse(page, "/api/ui/social"); allowExpectedConsoleError(page, /Failed to load resource/); return route.fulfill({ status:401, contentType:"application/json", body:JSON.stringify({ error:"Session expired" }) }); });
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-vnext-shell-state='session_expired']")).toBeVisible();
  await expect(page.locator("[data-social-page]")).toHaveCount(0);
});

test("Social is accessible and overflow-free at every required width", async ({ page, browser }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const serious = [];
  const critical = [];
  const overflows = [];
  const widths = [1440, 1280, 1024, 768, 390];
  const timezoneRenders = [];
  for (const timezoneId of ["America/Los_Angeles", "Asia/Tokyo"]) {
    const timezoneContext = await browser.newContext({ timezoneId });
    const timezonePage = await timezoneContext.newPage();
    const timezoneErrors = [];
    timezonePage.on("pageerror", (error) => timezoneErrors.push(error.message));
    timezonePage.on("console", (message) => { if (message.type() === "error") timezoneErrors.push(message.text()); });
    await openSocial(timezonePage, { view:"calendar" });
    expect(await timezonePage.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(timezoneId);
    timezoneRenders.push(await timezonePage.locator("[data-social-scheduled-grid] .vnext-social-calendar-time").allTextContents());
    expect(timezoneErrors).toEqual([]);
    await timezoneContext.close();
  }
  expect(timezoneRenders[1]).toEqual(timezoneRenders[0]);
  await openSocial(page);

  for (const view of ["ideas", "calendar", "library"]) {
    await page.goto(`${process.env.BROWSER_TEST_SOCIAL_BASE_URL}/#social?view=${view}`);
    await expect(page.locator(`[data-social-current-view='${view}']`)).toBeVisible();
    await page.setViewportSize({ width:1440, height:900 });
    await page.screenshot({ path:path.join(screenshotDirectory, `social-${view}-1440.png`), fullPage:true, animations:"disabled" });
  }
  await page.goto(`${process.env.BROWSER_TEST_SOCIAL_BASE_URL}/#social?view=results`);
  await expect(page.locator("[data-social-results-page]")).toBeVisible();
  await page.goto(`${process.env.BROWSER_TEST_SOCIAL_BASE_URL}/#social?view=ideas&status=draft`);
  await expect(page.locator("[data-social-current-view='ideas']")).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "social-filtered-1440.png"), fullPage:true, animations:"disabled" });

  for (const width of widths) {
    await page.goto(`${process.env.BROWSER_TEST_SOCIAL_BASE_URL}/#social?view=ideas`);
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    await expect(page.locator("[data-social-content]")).toHaveAttribute("aria-busy", "false");
    const analysis = await new AxeBuilder({ page }).analyze();
    const findings = reportSevereAxeFindings(width, analysis.violations);
    serious.push(...findings.filter((finding) => finding.impact === "serious"));
    critical.push(...findings.filter((finding) => finding.impact === "critical"));
    overflows.push({ width, ...(await expectNoOverflow(page, width)) });
    if ([1024, 768, 390].includes(width)) await page.screenshot({ path:path.join(screenshotDirectory, `social-ideas-${width}.png`), fullPage:true, animations:"disabled" });
  }
  await page.goto(`${process.env.BROWSER_TEST_SOCIAL_BASE_URL}/#social?view=calendar`);
  await page.setViewportSize({ width:390, height:844 });
  await expect(page.locator("[data-social-current-view='calendar']")).toBeVisible();
  await expectNoOverflow(page, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "social-calendar-390.png"), fullPage:true, animations:"disabled" });

  const firstTab = page.getByRole("tab", { name:/^Ideas/ });
  await page.getByRole("tab", { name:/^Calendar/ }).focus();
  await expect(page.getByRole("tab", { name:/^Calendar/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page).toHaveURL(/#social\?view=ideas$/);
  await expect(firstTab).toHaveAttribute("aria-selected", "true");
  expect(serious).toEqual([]);
  expect(critical).toEqual([]);
  console.log("CCX301_ACCESSIBILITY", JSON.stringify({ widths, serious:0, critical:0 }));
  console.log("CCX301_OVERFLOW", JSON.stringify(overflows));
});

test("Social flag-off retains the legacy queue and makes no Social home request", async ({ page }) => {
  const legacyURL = process.env.BROWSER_TEST_BASE_URL;
  const requests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/ui/social") requests.push(request.url()); });
  await openToday(page, `${legacyURL}/#queue`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("[data-social-page]")).toHaveCount(0);
  await expect(page.locator("#queue.page-section.active")).toBeVisible();
  expect(requests).toEqual([]);
  console.log("CCX301_FLAG_OFF", JSON.stringify({ legacyQueue:true, socialSurface:false, socialRequests:0 }));
  console.log("CCX301_SAFETY", JSON.stringify({ sends:0, schedules:0, approvals:0, publications:0, regenerations:0, providerCalls:0, partnerStageChanges:0, fileStatusChanges:0, suppressionChanges:0, liveGateChanges:0 }));
});
