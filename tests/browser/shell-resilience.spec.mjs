import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  authenticateRestricted,
  expect,
  openToday,
  test
} from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-105");

async function openVNext(page, { width = 1440, hash = "today" } = {}) {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(baseURL).toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-16T12:00:00-04:00"));
  await openToday(page, `${baseURL}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return baseURL;
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

async function seriousAxeViolations(page) {
  const result = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
}

test("initial vNext loading keeps the shell visible and transitions without another full-state request", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  let releaseBoot;
  const bootGate = new Promise((resolve) => { releaseBoot = resolve; });
  let bootRequests = 0;
  let fullStateRequests = 0;
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/boot-state") bootRequests += 1;
    if (pathname === "/api/state") fullStateRequests += 1;
  });
  await page.route("**/api/boot-state", async (route) => {
    await bootGate;
    await route.continue();
  });
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  const shell = page.locator("[data-vnext-shell='desktop']");
  const skeleton = page.locator("[data-today-content][aria-busy='true']");
  await expect(shell).toBeVisible();
  await expect(page.locator(".vnext-sidebar")).toBeVisible();
  await expect(page.locator(".vnext-topbar")).toBeVisible();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  await expect(skeleton).toContainText("Loading Today");
  await expect(skeleton).not.toContainText(/\d+%|\$\d|records ready/i);
  await page.screenshot({ path:path.join(screenshotDirectory, "shell-loading-1440.png"), animations:"disabled" });
  releaseBoot();
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => fullStateRequests).toBe(1);
  expect(bootRequests).toBe(1);
  const metrics = await page.evaluate(() => ({ ...window.__LE_SHELL_RESILIENCE_METRICS }));
  expect(metrics.loadingToContentMs).toBeGreaterThanOrEqual(0);
  expect(metrics.fullStateRequests).toBe(1);
  expect(metrics.searchRequestsWhileClosed).toBe(0);
  expect(metrics.createRequestsWhileClosed).toBe(0);
  console.log("CCX105_LOADING_METRICS", JSON.stringify({
    loadingToContentMs:metrics.loadingToContentMs,
    bootRequests,
    fullStateRequests,
    searchRequestsWhileClosed:metrics.searchRequestsWhileClosed,
    createRequestsWhileClosed:metrics.createRequestsWhileClosed
  }));
});

test("a real route read shows scoped loading and recovers with one duplicate-safe retry", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page);
  let queueRequests = 0;
  let releaseQueue;
  const queueGate = new Promise((resolve) => { releaseQueue = resolve; });
  await page.route("**/api/queue", async (route) => {
    queueRequests += 1;
    if (queueRequests === 1) {
      await queueGate;
      await route.continue();
      return;
    }
    await route.continue();
  });
  await page.evaluate(() => { location.hash = "decisions"; });
  const routeLoading = page.locator("[data-vnext-shell-state='loading'][data-state-scope='module']");
  await expect(routeLoading).toBeVisible();
  await expect(routeLoading).toContainText("Loading this section");
  await expect(page.locator(".vnext-sidebar")).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "route-loading-1440.png"), animations:"disabled" });
  releaseQueue();
  await expect(page.locator("#decisions.page-section.active")).toBeVisible();

  let failQueue = true;
  let releaseRetry;
  const retryGate = new Promise((resolve) => { releaseRetry = resolve; });
  await page.unroute("**/api/queue");
  await page.route("**/api/queue", async (route) => {
    queueRequests += 1;
    if (failQueue) {
      failQueue = false;
      await route.fulfill({ status:200, contentType:"application/json", body:"{" });
      return;
    }
    await retryGate;
    await route.continue();
  });
  await page.evaluate(() => {
    companyQueue = null;
    loadDecisionsQueue();
  });
  const moduleError = page.locator("[data-vnext-shell-state='error'][data-vnext-failed-module='decisions']");
  await expect(moduleError).toBeVisible();
  await expect(moduleError).toContainText("This section could not load");
  await expect(moduleError).toContainText("No records were changed");
  await expect(moduleError).not.toContainText(/503|TypeError|ReferenceError|fixture failure|\/api\//);
  await page.screenshot({ path:path.join(screenshotDirectory, "module-error-1440.png"), animations:"disabled" });

  const retry = moduleError.getByRole("button", { name:"Try again" });
  const before = await page.evaluate(() => ({ ...window.__LE_SHELL_RESILIENCE_METRICS }));
  await retry.evaluate((button) => {
    button.click();
    button.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));
  });
  await expect(retry).toBeDisabled();
  releaseRetry();
  await expect(page.locator("#decisions.page-section.active")).toBeVisible();
  await expect(page).toHaveURL(/#decisions$/);
  const after = await page.evaluate(() => ({ ...window.__LE_SHELL_RESILIENCE_METRICS }));
  expect(after.retryRequests - before.retryRequests).toBe(1);
  expect(after.duplicateRetries - before.duplicateRetries).toBe(0);
  expect(after.routeAccessRequests - before.routeAccessRequests).toBe(1);
  expect(queueRequests).toBe(3);
  console.log("CCX105_RETRY_METRICS", JSON.stringify({
    retryRequests:after.retryRequests - before.retryRequests,
    duplicateRetryRequests:0,
    retryAuthorizationRequests:after.routeAccessRequests - before.routeAccessRequests,
    queueRequests,
    recoveryMs:after.moduleRecoveryMs
  }));
});

test("a client module exception is contained, retryable, and never becomes a white screen", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page);
  await page.evaluate(() => {
    window.__CCX105_PARTNERS_RENDERER = window.partnersPageHtml;
    window.partnersPageHtml = () => { throw new Error("private fixture stack detail"); };
    location.hash = "partners";
  });
  const error = page.locator("[data-vnext-shell-state='error'][data-vnext-failed-module='partners']");
  await expect(error).toBeVisible();
  await expect(page.locator(".vnext-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name:"Search", exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Create", exact:true })).toBeVisible();
  await expect(page.getByRole("link", { name:"Help" })).toBeVisible();
  await expect(page.getByRole("button", { name:"Profile" })).toBeVisible();
  await expect(error).not.toContainText(/private fixture|Error|stack|endpoint|secret|\/api\//i);

  await page.evaluate(() => { window.partnersPageHtml = window.__CCX105_PARTNERS_RENDERER; });
  await error.getByRole("button", { name:"Try again" }).click();
  await expect(page.locator("#partners.page-section.active")).toBeVisible();
  await expect(page).toHaveURL(/#partners$/);

  await page.evaluate(() => {
    window.partnersPageHtml = () => { throw new Error("repeat fixture failure"); };
    window.__LE_SHELL_RESILIENCE.clearAuthorization();
    location.hash = "today";
  });
  await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  await page.evaluate(() => { location.hash = "partners"; });
  const repeated = page.locator("[data-vnext-shell-state='error'][data-vnext-failed-module='partners']");
  await expect(repeated).toBeVisible();
  const requestsBefore = await page.evaluate(() => window.__LE_SHELL_RESILIENCE_METRICS.retryRequests);
  await repeated.getByRole("button", { name:"Try again" }).click();
  await expect(repeated).toBeVisible();
  const requestsAfter = await page.evaluate(() => window.__LE_SHELL_RESILIENCE_METRICS.retryRequests);
  expect(requestsAfter - requestsBefore).toBe(1);
});

test("restricted routes and exact records disclose no protected data", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const restrictedURL = await authenticateRestricted(page);
  const ownerURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  await page.route(`${restrictedURL}/api/**`, async (route) => {
    const request = route.request();
    const requested = new URL(request.url());
    if (request.method() !== "GET" || ["/api/ui/search", "/api/ui/inbox", "/api/ui/route-access"].includes(requested.pathname)) {
      await route.continue();
      return;
    }
    const response = await route.fetch({
      url:`${ownerURL}${requested.pathname}${requested.search}`,
      headers:{ ...request.headers(), cookie:"" }
    });
    await route.fulfill({ response });
  });
  await page.goto(`${restrictedURL}/#assets`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  const unauthorized = page.locator("[data-vnext-shell-state='unauthorized']");
  await expect(unauthorized).toBeVisible();
  await expect(unauthorized).toContainText("View private files");
  await expect(unauthorized).not.toContainText("view_private_assets");
  await expect(unauthorized).not.toContainText(/asset count|private asset/i);
  await page.screenshot({ path:path.join(screenshotDirectory, "unauthorized-page-1440.png"), animations:"disabled" });

  await page.evaluate(() => { location.hash = "social/post/browser-post-owner-only-001"; });
  const unavailable = page.locator("[data-vnext-shell-state='error']");
  await expect(unavailable).toContainText("Record not available");
  await expect(unavailable).not.toContainText(/browser-post-owner-only-001|Owner-only launch plan|View sensitive records/);

  const search = page.getByRole("button", { name:"Search", exact:true });
  await search.click();
  const dialog = page.getByRole("dialog", { name:"Search" });
  await dialog.getByRole("combobox", { name:"Search Command Center" }).fill("browser-post-owner-only-001");
  await expect(dialog.locator("[data-global-search-state]")).toContainText("No results found");
  await expect(dialog).not.toContainText("Owner-only launch plan");
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width:390, height:844 });
  await page.evaluate(() => { location.hash = "today"; });
  await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  await page.evaluate(() => { location.hash = "assets"; });
  await expect(unauthorized).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "unauthorized-page-390.png"), animations:"disabled" });
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test("session expiration closes authenticated layers and removes protected content", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = await openVNext(page, { hash:"partners" });
  await expect(page.locator("#partners.page-section.active")).toBeVisible();
  await page.getByRole("button", { name:"Search", exact:true }).click();
  await expect(page.getByRole("dialog", { name:"Search" })).toBeVisible();
  await page.route("**/api/ui/route-access?*", async (route) => {
    await route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({ ok:false, allowed:false, outcome:"session_expired" })
    });
  });
  await page.evaluate(() => { location.hash = "campaigns"; });
  const expired = page.locator("[data-vnext-shell-state='session_expired']");
  await expect(expired).toBeVisible();
  await expect(expired).toContainText("Your session ended");
  await expect(expired).toContainText("No records were changed");
  await expect(page.getByRole("dialog", { name:"Search" })).toBeHidden();
  await expect(page.locator(".vnext-create-workspace:not([hidden]), .vnext-profile-menu:not([hidden]), .vnext-drawer-overlay:not([hidden])")).toHaveCount(0);
  await expect(expired).not.toContainText(/Example community partner|session unavailable|cookie|token|401/i);
  await expect(page.getByRole("button", { name:"Search", exact:true })).toBeDisabled();
  await expect(page.getByRole("button", { name:"Create", exact:true })).toBeDisabled();
  await expect(expired.getByRole("button", { name:"Sign in again" })).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "session-expired-1440.png"), animations:"disabled" });
  await page.waitForTimeout(100);
  expect(page.url()).toBe(`${baseURL}/#campaigns`);
});

test("boot failure uses Recovery Mode, retries once, and remains responsive", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  let failBoot = true;
  await page.route("**/api/boot-state", async (route) => {
    if (failBoot) {
      await route.fulfill({ status:200, contentType:"application/json", body:"{" });
      return;
    }
    await route.continue();
  });
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  const recovery = page.locator("[data-vnext-shell-state='recovery']");
  await expect(recovery).toBeVisible();
  await expect(page.locator(".vnext-sidebar")).toBeVisible();
  await expect(recovery).toContainText("Recovery Mode");
  await expect(recovery).toContainText("Publishing is off");
  await expect(recovery).not.toContainText(/fixture boot failure|503|\/api\/boot-state|stack|token|secret/i);
  await expect(page.getByRole("button", { name:"Search", exact:true })).toBeDisabled();
  await expect(page.getByRole("button", { name:"Create", exact:true })).toBeDisabled();
  await page.screenshot({ path:path.join(screenshotDirectory, "recovery-mode-1440.png"), animations:"disabled" });

  failBoot = false;
  const retry = recovery.getByRole("button", { name:"Try full app again" });
  await retry.evaluate((button) => {
    button.click();
    button.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));
  });
  await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  await expect(recovery).toHaveCount(0);
  const metrics = await page.evaluate(() => ({ ...window.__LE_SHELL_RESILIENCE_METRICS }));
  expect(metrics.retryRequests).toBe(1);
  expect(metrics.duplicateRetries).toBe(0);

  await page.evaluate(() => window.__LE_SHELL_RESILIENCE.showRecovery());
  await page.setViewportSize({ width:390, height:844 });
  await expect(recovery).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "recovery-mode-390.png"), animations:"disabled" });
  await expectNoHorizontalOverflow(page, 390);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test("mobile module failure is contained and shell states remain overflow-free", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page, { width:390 });
  await page.evaluate(() => {
    window.__CCX105_PARTNERS_RENDERER = window.partnersPageHtml;
    window.partnersPageHtml = () => { throw new Error("mobile fixture failure"); };
    location.hash = "partners";
  });
  const error = page.locator("[data-vnext-shell-state='error'][data-vnext-failed-module='partners']");
  await expect(error).toBeVisible();
  await expect(page.locator(".vnext-topbar")).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "module-error-390.png"), animations:"disabled" });
  for (const width of [1440, 1024, 768, 390]) await expectNoHorizontalOverflow(page, width);
  expect(await seriousAxeViolations(page)).toEqual([]);
});
