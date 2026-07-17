import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  allowExpectedConsoleError,
  allowExpectedCriticalResponse,
  expect,
  openToday,
  test
} from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-204");
const FIXED_TIME = new Date("2026-07-17T12:00:00-04:00");

async function openRefinedToday(page, { width = 1440, hash = "today" } = {}) {
  const baseURL = process.env.BROWSER_TEST_TODAY_BASE_URL;
  expect(baseURL, "The isolated Today browser fixture URL is required.").toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_TIME);
  await openToday(page, `${baseURL}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  await expect(page.locator("[data-today-page]")).toBeVisible();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  return baseURL;
}

function emptyTodayPayload({ progressAvailable = true } = {}) {
  return {
    ok:true,
    generatedAt:"2026-07-17T16:00:00.000Z",
    dateLabel:"Friday, July 17",
    nowItem:null,
    nextItems:[],
    needsMeSummary:{ count:0, urgentCount:0, highCount:0, topItems:[], href:"#inbox?group=needs-me" },
    progressSummary:{ available:progressAvailable, periodLabel:"This week", count:0, items:[], href:"#inbox?group=updates" },
    utilities:{ quickCaptureAvailable:true, reviewPlanHref:"#daily-run" }
  };
}

async function expectNoHorizontalOverflow(page, width) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body:document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document, `${width}px document overflow`).toBeLessThanOrEqual(0);
  expect(overflow.body, `${width}px body overflow`).toBeLessThanOrEqual(0);
}

test("Today is a four-question command surface with exact read-only navigation", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const todayRequests = [];
  const mutationRequests = [];
  const actionPaths = [];
  let fullStateRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/ui/today") todayRequests.push(request.method());
    if (url.pathname === "/api/state") fullStateRequests += 1;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutationRequests.push(url.pathname);
    if (/publish|send|approve|complete|snooze|launch|release|partner.*stage|file.*status|suppression|live-gate/i.test(url.pathname)) actionPaths.push(url.pathname);
  });

  const baseURL = await openRefinedToday(page);
  expect(todayRequests).toEqual(["GET"]);
  const pageRoot = page.locator("[data-today-page]");
  await expect(page.getByRole("heading", { name:"Today", level:1 })).toHaveCount(1);
  await expect(page.getByText("Your clearest path through what matters now.")).toBeVisible();
  const sections = pageRoot.locator("[data-today-answer]");
  await expect(sections).toHaveCount(4);
  expect(await sections.evaluateAll((nodes) => nodes.map((node) => node.dataset.todayAnswer))).toEqual(["now", "next", "needs-you", "progress"]);

  const now = pageRoot.locator('[data-today-answer="now"]');
  const next = pageRoot.locator('[data-today-answer="next"]');
  const needs = pageRoot.locator('[data-today-answer="needs-you"]');
  const progress = pageRoot.locator('[data-today-answer="progress"]');
  await expect(now.getByRole("heading", { name:"Prepare the current Partner brief", level:2 })).toBeVisible();
  await expect(now.getByText("This is the current Daily Run item.")).toBeVisible();
  const primary = now.getByRole("link", { name:"Resume Prepare the current Partner brief" });
  await expect(primary).toHaveText("Resume");
  await expect(primary).toHaveAttribute("href", "#item/tasks/today-browser-now-task");
  const hierarchy = await page.evaluate(() => {
    const nowNode = document.querySelector('[data-today-answer="now"]');
    const nextNode = document.querySelector('[data-today-answer="next"]');
    const nowStyle = getComputedStyle(nowNode);
    return {
      first:document.querySelector("[data-today-answer]")?.dataset.todayAnswer,
      nowHeight:nowNode.getBoundingClientRect().height,
      nextHeight:nextNode.getBoundingClientRect().height,
      nowShadow:nowStyle.boxShadow,
      actionBackground:getComputedStyle(document.querySelector(".vnext-today-primary-action")).backgroundColor
    };
  });
  expect(hierarchy.first).toBe("now");
  expect(hierarchy.nowHeight).toBeGreaterThan(250);
  expect(hierarchy.nowShadow).not.toBe("none");
  expect(hierarchy.actionBackground).toBe("rgb(240, 72, 0)");

  const nextRows = next.locator(".vnext-today-next-list > li");
  await expect(nextRows).toHaveCount(3);
  expect(await nextRows.locator("h3").allTextContents()).toEqual([
    "Review the access guide post",
    "July Partner outreach campaign",
    "Follow up with Philadelphia Reentry Coalition"
  ]);
  await expect(next).not.toContainText("Prepare the current Partner brief");
  await expect(next).not.toContainText(/Waiting|Updates/);

  const endpoint = await page.request.get(`${baseURL}/api/ui/today`);
  expect(endpoint.ok()).toBe(true);
  const payload = await endpoint.json();
  await expect(needs.getByText(`${payload.needsMeSummary.count} items need you`)).toBeVisible();
  await expect(needs.getByText(`${payload.needsMeSummary.urgentCount} urgent`)).toBeVisible();
  await expect(needs.getByText(`${payload.needsMeSummary.highCount} high priority`)).toBeVisible();
  for (const item of payload.needsMeSummary.topItems) {
    await expect(needs.getByRole("link", { name:item.title })).toHaveAttribute("href", item.href);
    expect([payload.nowItem.href, ...payload.nextItems.map((entry) => entry.href)]).not.toContain(item.href);
  }
  await expect(progress.getByRole("heading", { name:`${payload.progressSummary.count} meaningful moves`, level:2 })).toBeVisible();
  await expect(progress.locator(".vnext-today-progress-list > li")).toHaveCount(payload.progressSummary.items.length);
  await expect(pageRoot).not.toContainText(/queueItems|sourceKind|workKind|capability|review_required|technical status|health ping|Provider sync/i);
  await expect(page.locator("[data-today-quick-capture]")).toHaveCount(0);
  await expect(page.getByRole("link", { name:"Open Quick Capture" })).toHaveCount(1);
  await expect(pageRoot).not.toContainText(/System health|Live gates|Telemetry|Revenue|Full calendar|Today Flow/i);

  await page.screenshot({ path:path.join(screenshotDirectory, "today-command-surface-1440.png"), fullPage:true, animations:"disabled" });
  await now.screenshot({ path:path.join(screenshotDirectory, "today-now-1440.png"), animations:"disabled" });
  await needs.screenshot({ path:path.join(screenshotDirectory, "today-needs-you-1440.png"), animations:"disabled" });
  await progress.screenshot({ path:path.join(screenshotDirectory, "today-progress-1440.png"), animations:"disabled" });

  const historyLength = await page.evaluate(() => history.length);
  await primary.click();
  await expect(page).toHaveURL(/#item\/tasks\/today-browser-now-task$/);
  await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBeGreaterThanOrEqual(historyLength);
  expect(mutationRequests).toEqual([]);
  await page.goBack();
  await expect(page.locator("[data-today-page]")).toBeVisible();

  const exactNext = [
    ["Review the access guide post", /#social\/post\/today-browser-social-next$/],
    ["July Partner outreach campaign", /#outreach\/campaign\/today-browser-campaign-next$/],
    ["Follow up with Philadelphia Reentry Coalition", /#partners\/partner\/today-browser-partner-next$/]
  ];
  for (const [title, target] of exactNext) {
    await page.locator('[data-today-answer="next"]').getByRole("link", { name:`Open ${title}` }).click();
    await expect(page).toHaveURL(target);
    await page.goBack();
    await expect(page.locator("[data-today-page]")).toBeVisible();
  }

  await needs.getByRole("link", { name:"Open Inbox" }).click();
  await expect(page).toHaveURL(/#inbox\?group=needs-me$/);
  await expect(page.locator("[data-inbox-page]")).toBeVisible();
  await page.goBack();
  await expect(page.locator("[data-today-page]")).toBeVisible();
  const progressLink = page.locator('[data-today-answer="progress"] .vnext-today-progress-link').first();
  const progressHref = await progressLink.getAttribute("href");
  await progressLink.click();
  await expect(page).toHaveURL(new RegExp(progressHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
  await page.goBack();
  await page.locator('[data-today-answer="progress"]').getByRole("link", { name:"View updates" }).click();
  await expect(page).toHaveURL(/#inbox\?group=updates$/);
  expect(mutationRequests).toEqual([]);
  expect(actionPaths).toEqual([]);

  const initialTodayRequests = todayRequests.length;
  expect(initialTodayRequests).toBeGreaterThanOrEqual(1);
  expect(todayRequests.every((method) => method === "GET")).toBe(true);
  const metrics = await page.evaluate(() => ({ ...window.__LE_TODAY_METRICS }));
  expect(metrics.duplicateRequests).toBe(0);
  expect(metrics.fullStateRequests).toBe(0);
  expect(metrics.quickCaptureRequests).toBe(0);
  expect(metrics.searchRequestsWhileClosed).toBe(0);
  expect(metrics.createRequestsWhileClosed).toBe(0);
  expect(metrics.sourceMutations).toBe(0);
  expect(metrics.storageWrites).toBe(0);
  expect(metrics.actionExecutions).toBe(0);
  console.log("CCX204_TODAY_METRICS", JSON.stringify({
    now:{ title:payload.nowItem.title, actionLabel:payload.nowItem.actionLabel },
    next:payload.nextItems.map((item) => item.title),
    needsYou:{ count:payload.needsMeSummary.count, urgent:payload.needsMeSummary.urgentCount, high:payload.needsMeSummary.highCount },
    progress:{ count:payload.progressSummary.count, shown:payload.progressSummary.items.length },
    endpointResponseMs:metrics.lastResponseMs,
    endpointPayloadBytes:metrics.lastResponseBytes,
    initialPageRequests:1,
    navigationRefreshRequests:metrics.requests,
    duplicateRequests:metrics.duplicateRequests,
    fullStateRequestsCausedByToday:metrics.fullStateRequests,
    shellFullStateRequestsObserved:fullStateRequests,
    mutationRequests:mutationRequests.length,
    actionExecutions:actionPaths.length,
    skeletonToContentMs:metrics.skeletonToContentMs
  }));
});

test("Today compatibility aliases and retained utilities remain usable without duplicating capture", async ({ page }) => {
  test.slow();
  await openRefinedToday(page, { hash:"overview" });
  await expect(page).toHaveURL(/#today$/);
  await expect(page.locator('.vnext-primary-navigation [data-shell-destination="Today"]')).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => { location.hash = "cockpit"; });
  await expect(page).toHaveURL(/#today$/);
  await expect(page.locator("[data-today-page]")).toBeVisible();

  await page.getByRole("link", { name:"Open Quick Capture" }).click();
  await expect(page).toHaveURL(/#capture-inbox$/);
  await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  await page.goBack();
  await expect(page.locator("[data-today-page]")).toBeVisible();
  await page.getByRole("button", { name:"Search", exact:true }).click();
  await expect(page.getByRole("dialog", { name:"Search" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name:"Create", exact:true }).click();
  await expect(page.getByRole("menu", { name:"Create" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name:"Help", exact:true }).click();
  await expect(page).toHaveURL(/#operator-manual$/);
  await page.goBack();
  await page.getByRole("button", { name:"Profile", exact:true }).click();
  await expect(page.getByRole("menu", { name:"Profile" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name:"Command Center utilities" }).getByRole("link", { name:/^Inbox/ }).click();
  await expect(page).toHaveURL(/#inbox/);
  await page.goBack();
  await page.getByRole("button", { name:"Le-E", exact:true }).click();
  await expect(page.getByLabel("Le-E chat panel")).toBeVisible();
});

test("Today empty and unavailable states are truthful and screenshot-ready", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await page.route("**/api/ui/today", async (route) => {
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(emptyTodayPayload()) });
  });
  await page.route("**/api/ui/inbox?*", async (route) => {
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true, counts:{ needsMe:0 } }) });
  });
  await openRefinedToday(page);
  await expect(page.getByRole("heading", { name:"You’re clear to plan the day" })).toBeVisible();
  await expect(page.getByText("Nothing is currently ranked as your next action.")).toBeVisible();
  await expect(page.getByRole("heading", { name:"No additional priorities" })).toBeVisible();
  await expect(page.getByRole("heading", { name:"Nothing needs you" })).toBeVisible();
  await expect(page.getByRole("heading", { name:"No progress recorded this week" })).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "today-empty-1440.png"), fullPage:true, animations:"disabled" });
  await page.setViewportSize({ width:390, height:844 });
  await expectNoHorizontalOverflow(page, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "today-empty-390.png"), fullPage:true, animations:"disabled" });

  await page.unroute("**/api/ui/today");
  await page.route("**/api/ui/today", async (route) => {
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(emptyTodayPayload({ progressAvailable:false })) });
  });
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Progress is unavailable" })).toBeVisible();
  await expect(page.getByText(/authorized progress source could not be read/)).toBeVisible();
  await expect(page.getByText("No progress recorded this week")).toHaveCount(0);
});

test("Today loading, read error, one safe retry, unauthorized, and session-ended states fail closed", async ({ page }) => {
  test.slow();
  const baseURL = process.env.BROWSER_TEST_TODAY_BASE_URL;
  let releaseLoading;
  const loadingGate = new Promise((resolve) => { releaseLoading = resolve; });
  let requests = 0;
  await page.route("**/api/ui/today", async (route) => {
    requests += 1;
    if (requests === 1) await loadingGate;
    await route.continue();
  });
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-today-page]")).toBeVisible();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByText("Loading Today")).toBeVisible();
  releaseLoading();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  expect(requests).toBe(1);

  await page.goto("about:blank");
  await page.unroute("**/api/ui/today");
  let errorRequests = 0;
  let retryAllowed = false;
  allowExpectedCriticalResponse(page, "/api/ui/today", 1);
  allowExpectedConsoleError(page, /503 \(Service Unavailable\)/, 1);
  await page.route("**/api/ui/today", async (route) => {
    errorRequests += 1;
    if (!retryAllowed) {
      await route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ error:"Synthetic unavailable" }) });
      return;
    }
    await route.continue();
  });
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => errorRequests).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name:"Today could not load" })).toBeVisible();
  await expect(page.getByText("No records were changed. Try again.")).toBeVisible();
  expect(errorRequests).toBe(1);
  retryAllowed = true;
  await page.getByRole("button", { name:"Try again" }).click();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  expect(errorRequests).toBe(2);
  expect(await page.evaluate(() => window.__LE_TODAY_METRICS.duplicateRequests)).toBe(0);

  await page.goto("about:blank");
  await page.unroute("**/api/ui/today");
  allowExpectedCriticalResponse(page, "/api/ui/today", 1);
  allowExpectedConsoleError(page, /403 \(Forbidden\)/, 1);
  await page.route("**/api/ui/today", async (route) => {
    await route.fulfill({ status:403, contentType:"application/json", body:JSON.stringify({ error:"Unavailable" }) });
  });
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Today needs additional access" })).toBeVisible();
  await expect(page.getByText("No protected details were loaded.")).toBeVisible();
  await expect(page.getByText("Prepare the current Partner brief")).toHaveCount(0);
  await expect(page.getByRole("link", { name:"Open Help" })).toHaveAttribute("href", "#operator-manual");

  await page.goto("about:blank");
  await page.unroute("**/api/ui/today");
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect(page.getByText("Prepare the current Partner brief")).toBeVisible();
  await page.evaluate(() => window.__LE_SHELL_RESILIENCE.showSessionExpired());
  await expect(page.getByRole("heading", { name:"Your session ended" })).toBeVisible();
  await expect(page.getByText("Prepare the current Partner brief")).toHaveCount(0);
  await expect(page.locator("[data-shell-inbox-count]").first()).toBeHidden();
  await expect(page.getByRole("dialog", { name:"Search" })).toBeHidden();
});

test("Today stays ordered, accessible, and overflow-free at every required width", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const screenshotNames = new Map([
    [1440, "today-command-surface-1440.png"],
    [1280, "today-command-surface-1280.png"],
    [1024, "today-command-surface-1024.png"],
    [768, "today-command-surface-768.png"],
    [390, "today-command-surface-390.png"]
  ]);
  await openRefinedToday(page);
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    await expectNoHorizontalOverflow(page, width);
    const order = await page.locator("[data-today-answer]").evaluateAll((nodes) => nodes
      .map((node) => ({ key:node.dataset.todayAnswer, top:node.getBoundingClientRect().top }))
      .sort((left, right) => left.top - right.top)
      .map((entry) => entry.key));
    expect(order).toEqual(["now", "next", "needs-you", "progress"]);
    await expect(page.getByRole("link", { name:"Resume Prepare the current Partner brief" })).toBeVisible();
    await page.screenshot({ path:path.join(screenshotDirectory, screenshotNames.get(width)), fullPage:true, animations:"disabled" });
  }
  const axe = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = axe.violations.filter((violation) => violation.impact === "serious");
  const critical = axe.violations.filter((violation) => violation.impact === "critical");
  expect(serious).toEqual([]);
  expect(critical).toEqual([]);
  console.log("CCX204_ACCESSIBILITY", JSON.stringify({ serious:serious.length, critical:critical.length }));
});

test("flag-off Today keeps the legacy page and never loads the refined endpoint or controller", async ({ page }) => {
  const legacyBaseURL = process.env.BROWSER_TEST_BASE_URL;
  const todayRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/ui/today") todayRequests.push(request.url());
  });
  await page.clock.setFixedTime(FIXED_TIME);
  await openToday(page, `${legacyBaseURL}/#today`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("[data-today-page]")).toHaveCount(0);
  await expect(page.getByText("Today at LegalEase", { exact:true })).toBeVisible();
  await expect(page.getByRole("heading", { name:/Roger$/, level:1 })).toBeVisible();
  expect(todayRequests).toEqual([]);
  expect(await page.evaluate(() => typeof window.__LE_TODAY_PAGE)).toBe("undefined");
});
