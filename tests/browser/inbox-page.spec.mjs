import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  allowExpectedConsoleError,
  allowExpectedCriticalResponse,
  allowExpectedRequestFailure,
  authenticateRestricted,
  expect,
  openToday,
  test
} from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-201");

async function openVNext(page, { width = 1440, hash = "today" } = {}) {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(baseURL).toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-16T12:00:00-04:00"));
  await openToday(page, `${baseURL}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return baseURL;
}

async function openInbox(page) {
  const inbox = page.locator('[data-shell-destination="Inbox"]').first();
  await inbox.click();
  await expect(page).toHaveURL(/#inbox(?:\?group=needs-me)?$/);
  await expect(page.locator("[data-inbox-page]")).toBeVisible();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  return page.locator("[data-inbox-page]");
}

async function seriousAxeViolations(page) {
  const result = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
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

function emptyPayload(group = "needs_me", activeFilters = {}) {
  const routeValue = group === "needs_me" ? "needs-me" : group === "waiting" ? "waiting" : "updates";
  return {
    ok:true,
    generatedAt:"2026-07-16T16:00:00.000Z",
    selectedGroup:group,
    selectedGroupRoute:routeValue,
    groups:[
      { key:"needs_me", routeValue:"needs-me", label:"Needs me", count:0 },
      { key:"waiting", routeValue:"waiting", label:"Waiting", count:0 },
      { key:"update", routeValue:"updates", label:"Updates", count:0 }
    ],
    counts:{ needsMe:0, waiting:0, updates:0, total:0 },
    filteredCount:0,
    filters:{ types:[], priorities:[], owners:[], dueStates:[] },
    activeFilters:{ type:"", priority:"", owner:"", due:"", ...activeFilters },
    items:[],
    nextCursor:null,
    truncated:false
  };
}

test("Inbox route, authorized counts, badge, exact Open links, and Back share one read-only contract", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const inboxRequests = [];
  const mutationRequests = [];
  let fullStateRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/ui/inbox") inboxRequests.push({ method:request.method(), search:url.search });
    if (url.pathname === "/api/state") fullStateRequests += 1;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutationRequests.push(url.pathname);
  });
  const baseURL = await openVNext(page);
  const stateRequestsBeforeInbox = fullStateRequests;
  const badgeMetricsBefore = await page.evaluate(() => ({ ...window.__LE_INBOX_BADGE_METRICS }));
  const inbox = await openInbox(page);

  await expect(page.getByRole("heading", { name:"Inbox", level:1 })).toBeVisible();
  const primary = page.locator(".vnext-primary-navigation [data-shell-destination]");
  await expect(primary).toHaveCount(5);
  expect((await primary.allTextContents()).map((text) => text.trim())).toEqual(["Today", "Social", "Outreach", "Partners", "Files"]);
  await expect(page.locator('[data-shell-destination="Inbox"]').first()).toHaveAttribute("aria-current", "page");

  const tabs = inbox.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  expect((await tabs.allTextContents()).map((text) => text.replace(/\d+/g, "").trim())).toEqual(["Needs me", "Waiting", "Updates"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

  const endpoint = await page.request.get(`${baseURL}/api/ui/inbox?group=needs-me&limit=30`);
  expect(endpoint.ok()).toBe(true);
  const payload = await endpoint.json();
  const badge = page.locator("[data-shell-inbox-count]").first();
  await expect(tabs.nth(0).locator("[data-inbox-group-count]")).toHaveText(String(payload.counts.needsMe));
  await expect(tabs.nth(1).locator("[data-inbox-group-count]")).toHaveText(String(payload.counts.waiting));
  await expect(tabs.nth(2).locator("[data-inbox-group-count]")).toHaveText(String(payload.counts.updates));
  if (payload.counts.needsMe > 0) await expect(badge).toHaveText(String(payload.counts.needsMe));
  expect(payload.counts.needsMe).not.toBe(payload.counts.total);
  expect(fullStateRequests).toBe(stateRequestsBeforeInbox);
  expect(inboxRequests.filter((request) => request.method === "GET").length).toBeGreaterThanOrEqual(2);
  expect(inboxRequests.every((request) => request.method === "GET")).toBe(true);
  expect(mutationRequests).toEqual([]);
  await page.screenshot({ path:path.join(screenshotDirectory, "inbox-needs-me-1440.png"), animations:"disabled" });

  const representative = [
    ["social", "Fulton County post needs two fixes", /#social\/post\/browser-inbox-post-001$/],
    ["campaign", "July Partner outreach campaign", /#outreach\/campaign\/browser-inbox-campaign-001$/],
    ["partner", "Follow up with Philadelphia Reentry Coalition", /#partners\/partner\/browser-inbox-partner-001$/],
    ["task", "Finish the Partner launch checklist", /#item\/tasks\/browser-inbox-task-001$/],
    ["file", "Investor Room operating plan", /#files\/data-room-item\/browser-inbox-file-001$/]
  ];
  for (const [type, title, href] of representative) {
    await page.evaluate((filter) => { location.hash = `inbox?group=needs-me&type=${filter}`; }, type);
    await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
    const row = page.locator("[data-inbox-item]", { hasText:title });
    await expect(row).toHaveCount(1);
    await row.getByRole("link", { name:new RegExp(`^Open ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} in `) }).click();
    await expect(page).toHaveURL(href);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#inbox\\?group=needs-me&type=${type}$`));
    await expect(page.locator("[data-inbox-page]")).toBeVisible();
    await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  }

  await page.evaluate(() => { location.hash = "inbox?group=waiting"; });
  await expect(page).toHaveURL(/#inbox\?group=waiting$/);
  await expect(page.getByRole("tab", { name:/Waiting/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.locator("[data-inbox-item]").count()).toBeGreaterThan(0);
  await page.screenshot({ path:path.join(screenshotDirectory, "inbox-waiting-1440.png"), animations:"disabled" });
  await page.getByRole("tab", { name:/Updates/ }).click();
  await expect(page).toHaveURL(/#inbox\?group=updates$/);
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-inbox-item]")).toHaveCount(1);
  await page.screenshot({ path:path.join(screenshotDirectory, "inbox-updates-1440.png"), animations:"disabled" });

  const metrics = await page.evaluate(() => ({
    page:{ ...window.__LE_INBOX_METRICS },
    badge:{ ...window.__LE_INBOX_BADGE_METRICS }
  }));
  expect(metrics.page.fullStateRequests).toBe(0);
  expect(metrics.page.sourceMutations).toBe(0);
  expect(metrics.page.storageWrites).toBe(0);
  expect(metrics.page.actionExecutions).toBe(0);
  expect(metrics.badge.requests - badgeMetricsBefore.requests).toBeLessThanOrEqual(0);
  console.log("CCX201_INBOX_READ_METRICS", JSON.stringify({
    authorizedCounts:payload.counts,
    shellBadge:payload.counts.needsMe,
    endpointResponseMs:metrics.page.lastResponseMs,
    endpointPayloadBytes:metrics.page.lastResponseBytes,
    inboxRequests:inboxRequests.length,
    badgeRequests:metrics.badge.requests,
    duplicateRequests:metrics.page.duplicateRequests,
    fullStateRequestsCausedByInbox:fullStateRequests - stateRequestsBeforeInbox,
    mutationRequests:mutationRequests.length
  }));
});

test("Inbox filters combine deterministically, clear safely, and pagination appends no duplicates", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page, { hash:"inbox?group=needs-me" });
  const pageRoot = page.locator("[data-inbox-page]");
  await expect(pageRoot).toBeVisible();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-inbox-item]", { hasText:"Fulton County post needs two fixes" })).toHaveCount(1);

  const type = page.locator('[data-inbox-filter="type"]');
  const priority = page.locator('[data-inbox-filter="priority"]');
  const owner = page.locator('[data-inbox-filter="owner"]');
  const due = page.locator('[data-inbox-filter="due"]');
  await type.selectOption("task");
  await expect(page).toHaveURL(/type=task/);
  await priority.selectOption("high");
  await owner.selectOption("Roger");
  await due.selectOption("none");
  await expect(page.locator("[data-inbox-result-summary]")).toContainText(/matching item/);
  await expect.poll(async () => page.locator("[data-inbox-item] .vnext-inbox-type").count()).toBeGreaterThan(0);
  expect(new Set(await page.locator("[data-inbox-item] .vnext-inbox-type").allTextContents())).toEqual(new Set(["Task"]));
  await page.screenshot({ path:path.join(screenshotDirectory, "inbox-filtered-1440.png"), animations:"disabled" });
  const tabCountsBefore = await page.locator("[data-inbox-group-count]").allTextContents();
  await page.getByRole("button", { name:"Clear filters" }).click();
  await expect(page).toHaveURL(/#inbox\?group=needs-me$/);
  await expect.poll(() => page.locator("[data-inbox-group-count]").allTextContents()).toEqual(tabCountsBefore);

  await page.getByRole("tab", { name:/Waiting/ }).click();
  await expect(page).toHaveURL(/#inbox\?group=waiting$/);
  const loadMore = page.getByRole("button", { name:"Load more" });
  await expect(loadMore).toBeVisible();
  const before = await page.locator("[data-inbox-item]").count();
  await loadMore.click();
  await expect.poll(() => page.locator("[data-inbox-item]").count()).toBeGreaterThan(before);
  const ids = await page.locator("[data-inbox-item]").evaluateAll((rows) => rows.map((row) => row.dataset.inboxItemId));
  expect(new Set(ids).size).toBe(ids.length);

  await page.evaluate(() => { location.hash = "inbox?group=needs-me&type=file&priority=urgent"; });
  await expect(page.getByRole("heading", { name:"No matching items" })).toBeVisible();
  await expect(page.locator("[data-inbox-state]").getByRole("button", { name:"Clear filters" })).toBeVisible();
});

test("Inbox empty states remain selectable and truthful", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await page.route("**/api/ui/inbox?*", async (route) => {
    const request = new URL(route.request().url());
    const groupValue = request.searchParams.get("group") || "needs-me";
    const group = groupValue === "waiting" ? "waiting" : groupValue === "updates" ? "update" : "needs_me";
    const active = request.searchParams.get("type") ? { type:request.searchParams.get("type") } : {};
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(emptyPayload(group, active)) });
  });
  await openVNext(page, { hash:"inbox?group=needs-me" });
  await expect(page.getByRole("heading", { name:"You’re caught up" })).toBeVisible();
  await expect(page.getByText("Nothing needs your attention right now.")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator("[data-shell-inbox-count]").first()).toBeHidden();
  await page.screenshot({ path:path.join(screenshotDirectory, "inbox-caught-up-1440.png"), animations:"disabled" });

  await page.getByRole("tab", { name:/Waiting/ }).click();
  await expect(page.getByRole("heading", { name:"Nothing is waiting" })).toBeVisible();
  await page.getByRole("tab", { name:/Updates/ }).click();
  await expect(page.getByRole("heading", { name:"No recent updates" })).toBeVisible();

  await page.evaluate(() => { location.hash = "inbox?group=needs-me&type=task"; });
  await expect(page.getByRole("heading", { name:"No matching items" })).toBeVisible();
  await expect(page.locator("[data-inbox-state]").getByRole("button", { name:"Clear filters" })).toBeVisible();
});

test("Inbox loading, recoverable read error, and duplicate-safe retry preserve safe view state", async ({ page }) => {
  test.slow();
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  let releaseLoading;
  const loadingGate = new Promise((resolve) => { releaseLoading = resolve; });
  let requests = 0;
  await page.route("**/api/ui/inbox?*", async (route) => {
    requests += 1;
    if (requests === 1) {
      await loadingGate;
      await route.continue();
      return;
    }
    await route.continue();
  });
  await page.goto(`${baseURL}/#inbox?group=waiting&priority=high`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-vnext-shell='desktop']")).toBeVisible();
  await expect(page.locator("[data-inbox-loading]")).toBeVisible();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "true");
  releaseLoading();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/api/ui/inbox?*");

  let failOnce = true;
  await page.route("**/api/ui/inbox?*", async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ error:"redacted" }) });
      return;
    }
    await route.continue();
  });
  await page.evaluate(() => window.__LE_INBOX_PAGE.refresh());
  const error = page.locator("[data-inbox-state][data-state='error']");
  await expect(error).toBeVisible();
  await expect(error).toContainText("Inbox could not load");
  await expect(error).toContainText("No records were changed");
  await expect(error).not.toContainText(/500|redacted|stack|endpoint|\/api\//i);
  const beforeRetry = requests;
  await error.getByRole("button", { name:"Try again" }).evaluate((button) => {
    button.click();
    button.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));
  });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await expect(page).toHaveURL(/#inbox\?group=waiting&priority=high$/);
  expect(requests - beforeRetry).toBeLessThanOrEqual(1);
});

test("restricted and unauthorized Inbox reads reveal no hidden work, and session expiration clears data and badge", async ({ page }) => {
  test.slow();
  const restrictedURL = await authenticateRestricted(page);
  const ownerReadURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  await page.route(`${restrictedURL}/api/**`, async (route) => {
    const request = route.request();
    const requested = new URL(request.url());
    if (request.method() !== "GET" || ["/api/ui/search", "/api/ui/inbox", "/api/ui/route-access"].includes(requested.pathname)) {
      await route.continue();
      return;
    }
    const response = await route.fetch({
      url:`${ownerReadURL}${requested.pathname}${requested.search}`,
      headers:{ ...request.headers(), cookie:"" }
    });
    await route.fulfill({ response });
  });
  await page.goto(`${restrictedURL}/#inbox?group=needs-me`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("[data-inbox-page]")).toBeVisible();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("main#app")).not.toContainText("Confidential acquisition post");
  const restrictedPayload = await page.request.get(`${restrictedURL}/api/ui/inbox?group=needs-me&limit=30`);
  expect(restrictedPayload.ok()).toBe(true);
  const restrictedBody = await restrictedPayload.json();
  if (restrictedBody.counts.needsMe > 0) await expect(page.locator("[data-shell-inbox-count]").first()).toHaveText(String(restrictedBody.counts.needsMe));
  else await expect(page.locator("[data-shell-inbox-count]").first()).toBeHidden();
  expect(JSON.stringify(restrictedBody)).not.toContain("browser-inbox-hidden-001");

  const ownerURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  await page.context().clearCookies();
  await page.route(`${ownerURL}/api/ui/inbox?*`, async (route) => {
    allowExpectedCriticalResponse(page, "/api/ui/inbox");
    allowExpectedConsoleError(page, /Failed to load resource.*403/i);
    await route.fulfill({ status:403, contentType:"application/json", body:JSON.stringify({ error:"not available" }) });
  });
  await page.goto(`${ownerURL}/#inbox?group=needs-me`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-inbox-state][data-state='unauthorized']")).toBeVisible();
  await expect(page.locator("main#app")).not.toContainText(/Confidential acquisition post|browser-inbox-hidden-001|manage_|read_internal/);
  await page.unroute(`${ownerURL}/api/ui/inbox?*`);

  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-inbox-page]")).toBeVisible();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await page.route(`${ownerURL}/api/ui/inbox?*`, async (route) => {
    allowExpectedCriticalResponse(page, "/api/ui/inbox");
    allowExpectedConsoleError(page, /Failed to load resource.*401/i);
    await route.fulfill({ status:401, contentType:"application/json", body:JSON.stringify({ error:"session" }) });
  });
  allowExpectedRequestFailure(page, "/api/ui/inbox");
  await page.evaluate(() => window.__LE_INBOX_PAGE.refresh());
  await expect(page.locator("[data-vnext-shell-state='session_expired']")).toBeVisible();
  await expect(page.locator("[data-inbox-item]")).toHaveCount(0);
  await expect(page.locator("[data-shell-inbox-count]").first()).toBeHidden();
});

test("responsive Inbox remains accessible, overflow-free, and keeps shell utilities usable", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page, { hash:"inbox?group=needs-me" });
  const screenshots = [
    [1024, "inbox-needs-me-1024.png"],
    [768, "inbox-needs-me-768.png"],
    [390, "inbox-needs-me-390.png"]
  ];
  for (const [width, filename] of screenshots) {
    await expectNoHorizontalOverflow(page, width);
    await page.screenshot({ path:path.join(screenshotDirectory, filename), animations:"disabled" });
  }
  await expect(page.getByRole("button", { name:"Search", exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Create", exact:true })).toBeVisible();
  await expect(page.getByRole("link", { name:"Help" })).toBeVisible();
  await expect(page.getByRole("button", { name:"Profile" })).toBeVisible();
  await page.getByRole("button", { name:"Open navigation" }).click();
  await expect(page.locator('[data-shell-action="open-lee"]')).toBeVisible();
  const drawerBadge = page.locator("#vnext-navigation-drawer [data-shell-inbox-count]");
  const desktopBadgeValue = await drawerBadge.textContent();
  expect(desktopBadgeValue).toBe(String((await page.request.get(`${process.env.BROWSER_TEST_VNEXT_BASE_URL}/api/ui/inbox?group=needs-me&limit=1`).then((response) => response.json())).counts.needsMe));
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/vnext-navigation-open/);

  await page.locator('[data-inbox-filter="type"]').selectOption("task");
  await page.locator('[data-inbox-filter="priority"]').selectOption("high");
  await expectNoHorizontalOverflow(page, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "inbox-filtered-390.png"), animations:"disabled" });
  await expect(page.getByRole("link", { name:/^Approve|^Complete|^Snooze/ })).toHaveCount(0);
  await expect.poll(() => page.locator("[data-inbox-action]").count()).toBeGreaterThan(0);
  expect(await page.locator("[data-inbox-action]").evaluateAll((controls) => controls.every((control) => control.getAttribute("aria-disabled") !== "true"))).toBe(true);
  const violations = await seriousAxeViolations(page);
  expect(violations).toEqual([]);
  console.log("CCX201_ACCESSIBILITY", JSON.stringify({ serious:0, critical:0, widths:[1440, 1024, 768, 390] }));
});

test("legacy flag-off shell keeps its existing Inbox destination and does not expose the vNext page", async ({ page }) => {
  const legacyURL = process.env.BROWSER_TEST_BASE_URL;
  await page.goto(`${legacyURL}/#inbox`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("[data-inbox-page]")).toHaveCount(0);
  await expect(page.getByText("Page not found")).toHaveCount(0);
});
