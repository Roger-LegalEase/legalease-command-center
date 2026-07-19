import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { authenticateRestricted, expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-104");
const groups = ["Posts", "Campaigns", "Partners", "Files", "Tasks", "Reports"];

async function openVNext(page, { width = 1440, hash = "today" } = {}) {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(baseURL).toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-16T12:00:00-04:00"));
  await openToday(page, `${baseURL}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return baseURL;
}

async function openSearch(page, { keyboard = false } = {}) {
  const trigger = page.getByRole("button", { name:"Search", exact:true });
  if (keyboard) {
    await trigger.focus();
    await page.keyboard.press("Control+k");
  } else {
    await trigger.click();
  }
  const dialog = page.getByRole("dialog", { name:"Search" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name:"Search", exact:true })).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByRole("combobox", { name:"Search Command Center" })).toBeFocused();
  return { trigger, dialog, input:dialog.getByRole("combobox", { name:"Search Command Center" }) };
}

async function searchFor(page, query) {
  const dialog = page.getByRole("dialog", { name:"Search" });
  const input = dialog.getByRole("combobox", { name:"Search Command Center" });
  await input.fill(query);
  await expect(dialog.locator("[data-global-search-result]").first()).toBeVisible();
  return { dialog, input };
}

async function closeSearch(page) {
  const trigger = page.getByRole("button", { name:"Search", exact:true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name:"Search" })).toBeHidden();
  await expect(trigger).toBeFocused();
}

test("Search trigger, shortcuts, focus, dismissal, and typing guard share one contract", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page);
  let opened = await openSearch(page);
  await expect(opened.trigger).toContainText("Search");
  await expect(opened.trigger.locator("kbd")).toHaveText("Ctrl K");
  await page.screenshot({ path:path.join(screenshotDirectory, "global-search-empty-1440.png"), animations:"disabled" });
  await closeSearch(page);

  opened = await openSearch(page, { keyboard:true });
  await opened.input.fill("launch");
  await expect(opened.dialog.locator("[data-global-search-result]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opened.trigger).toBeFocused();

  opened = await openSearch(page);
  await page.locator("[data-global-search-backdrop]").click({ position:{ x:5, y:5 } });
  await expect(opened.dialog).toBeHidden();
  await expect(opened.trigger).toBeFocused();

  const create = page.getByRole("button", { name:"Create", exact:true });
  await create.click();
  await page.getByRole("menu", { name:"Create" }).getByRole("menuitem", { name:/Quick note/ }).click();
  const createDialog = page.getByRole("dialog", { name:"Create" });
  const note = createDialog.getByRole("textbox", { name:"Title", exact:true });
  await note.fill("Typing here must not open Search.");
  await note.focus();
  await page.keyboard.press("Control+k");
  await expect(createDialog).toBeVisible();
  await expect(page.getByRole("dialog", { name:"Search" })).toBeHidden();
  page.once("dialog", (confirmation) => confirmation.accept());
  await createDialog.getByRole("button", { name:"Cancel" }).click();
});

test("Meta+K opens Search on a macOS platform contract", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { configurable:true, get:() => "MacIntel" });
    Object.defineProperty(navigator, "userAgentData", { configurable:true, get:() => ({ platform:"macOS" }) });
  });
  await openVNext(page);
  await expect(page.getByRole("button", { name:"Search", exact:true }).locator("kbd")).toHaveText("⌘ K");
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("dialog", { name:"Search" })).toBeVisible();
  await expect(page.getByRole("combobox", { name:"Search Command Center" })).toBeFocused();
  await closeSearch(page);
});

test("grouped Search supports filters and complete result keyboard navigation", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = await openVNext(page);
  const opened = await openSearch(page);
  await searchFor(page, "launch");
  const headings = await opened.dialog.locator("[data-global-search-group] h3").allTextContents();
  expect(headings).toEqual(groups);
  expect(await opened.dialog.locator('[data-global-search-group="files"] [data-global-search-result]').allTextContents()).not.toContain("Launch results report");
  console.log("GLOBAL_SEARCH_GROUP_METRICS", JSON.stringify(await page.evaluate(() => window.__LE_GLOBAL_SEARCH_METRICS)));
  await page.screenshot({ path:path.join(screenshotDirectory, "global-search-grouped-results-1440.png"), animations:"disabled" });

  const rows = opened.dialog.locator("[data-global-search-result]");
  await opened.input.press("ArrowDown");
  await expect(rows.first()).toHaveAttribute("aria-selected", "true");
  await opened.input.press("ArrowDown");
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
  await opened.input.press("ArrowUp");
  await expect(rows.first()).toHaveAttribute("aria-selected", "true");
  await opened.input.press("End");
  await expect(rows.last()).toHaveAttribute("aria-selected", "true");
  await opened.input.press("Home");
  await expect(rows.first()).toHaveAttribute("aria-selected", "true");
  await expect(opened.input).toHaveAttribute("aria-activedescendant", await rows.first().getAttribute("id"));

  const reportFilter = opened.dialog.getByRole("checkbox", { name:"Reports" });
  await reportFilter.uncheck();
  await expect(opened.dialog.locator('[data-global-search-group="reports"]')).toHaveCount(0);
  await reportFilter.check();
  await expect(opened.dialog.locator('[data-global-search-group="reports"]')).toBeVisible();
  await closeSearch(page);

  const fixtures = [
    ["Café launch update", /#social\/post\/browser-post-search-001$/, "Café launch update", "global-search-post-result-1440.png"],
    ["Example outreach campaign", /#outreach\/campaign\/browser-campaign-001$/, "Example outreach campaign", ""],
    ["Example community partner", /#partners\/partner\/browser-partner-001$/, "Example community partner", "global-search-partner-result-1440.png"],
    ["Launch readiness brief", /#files\/data-room-item\/browser-file-search-001$/, "Launch readiness brief", ""],
    ["Finish launch checklist", /#item\/tasks\/browser-task-search-001$/, "Finish launch checklist", ""],
    ["Launch results report", /#files\/report\/browser-report-search-001$/, "Launch results report", ""]
  ];
  for (const [query, href, heading, screenshot] of fixtures) {
    await page.evaluate(() => { location.hash = "today"; });
    await expect(page).toHaveURL(/#today$/);
    const search = await openSearch(page);
    await search.input.fill(query);
    const row = search.dialog.getByRole("option", { name:new RegExp(`^Open ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} in `) });
    await expect(row).toBeVisible();
    if (screenshot) await page.screenshot({ path:path.join(screenshotDirectory, screenshot), animations:"disabled" });
    await row.click();
    await expect(page).toHaveURL(href);
    if (href.test("#social/post/browser-post-search-001")) await expect(page.locator("[data-post-composer]").getByRole("heading", { level:2, name:heading })).toBeVisible();
    else await expect(page.locator("main#app #item").getByRole("heading", { level:1 })).toHaveText(heading);
  }

  await page.evaluate(() => { location.hash = "today"; });
  await expect(page).toHaveURL(/#today$/);
  const keyboardOpen = await openSearch(page);
  await keyboardOpen.input.fill("Café launch update");
  await expect(keyboardOpen.dialog.locator("[data-global-search-result]").first()).toBeVisible();
  await keyboardOpen.input.press("ArrowDown");
  await keyboardOpen.input.press("Enter");
  await expect(page).toHaveURL(/#social\/post\/browser-post-search-001$/);
  await page.goBack();
  await expect(page).toHaveURL(/#today$/);
});

test("loading, no-results, error recovery, stale requests, duplicate suppression, and recents are truthful", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = await openVNext(page);
  const searchRequests = [];
  let fullStateRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/ui/search") searchRequests.push(url.search);
    if (url.pathname === "/api/state") fullStateRequests += 1;
  });
  const opened = await openSearch(page);
  const stateNode = opened.dialog.locator("[data-global-search-state]");

  let releaseLoading;
  const loadingGate = new Promise((resolve) => { releaseLoading = resolve; });
  await page.route("**/api/ui/search?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("q") !== "loading fixture") {
      await route.continue();
      return;
    }
    await loadingGate;
    await route.continue();
  });
  await opened.input.fill("loading fixture");
  await expect(stateNode).toContainText("Loading Search results");
  releaseLoading();
  await expect(stateNode).toContainText("No results found");
  await page.unroute("**/api/ui/search?*");

  await opened.input.fill("not a real Command Center record");
  await expect(stateNode.getByText("No results found")).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "global-search-no-results-1440.png"), animations:"disabled" });
  await stateNode.getByRole("button", { name:"Clear search" }).click();
  await expect(opened.input).toHaveValue("");

  let failOnce = true;
  await page.route("**/api/ui/search?*", async (route) => {
    if (failOnce && new URL(route.request().url()).searchParams.get("q") === "recoverable") {
      failOnce = false;
      await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ error:"fixture" }) });
      return;
    }
    await route.continue();
  });
  await opened.input.fill("recoverable");
  await expect(stateNode).toContainText("Search could not load");
  await expect(opened.input).toHaveValue("recoverable");
  await stateNode.getByRole("button", { name:"Retry" }).click();
  await expect(stateNode).toContainText("No results found");
  await page.unroute("**/api/ui/search?*");

  let releaseStale;
  const staleGate = new Promise((resolve) => { releaseStale = resolve; });
  await page.route("**/api/ui/search?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "Café") {
      await staleGate;
      await route.continue().catch(() => {});
      return;
    }
    await route.continue();
  });
  await opened.input.fill("Café");
  await expect.poll(() => searchRequests.some((query) => new URLSearchParams(query).get("q") === "Café")).toBe(true);
  await opened.input.fill("Launch results report");
  await expect(opened.dialog.getByRole("option", { name:/Open Launch results report/ })).toBeVisible();
  releaseStale();
  await expect(opened.dialog.getByRole("option", { name:/Open Launch results report/ })).toBeVisible();
  await page.unroute("**/api/ui/search?*");

  const beforeDuplicate = searchRequests.length;
  await opened.input.fill("Café launch update");
  await opened.input.dispatchEvent("input");
  await opened.input.dispatchEvent("input");
  await expect(opened.dialog.getByRole("option", { name:/Open Café launch update/ })).toBeVisible();
  expect(searchRequests.length - beforeDuplicate).toBe(1);
  const representativeMetrics = await page.evaluate(() => ({ ...window.__LE_GLOBAL_SEARCH_METRICS }));
  expect(representativeMetrics.lastResponseBytes).toBeLessThan(100_000);
  expect(representativeMetrics.lastResponseMs).toBeLessThan(750);
  await opened.dialog.getByRole("option", { name:/Open Café launch update/ }).click();
  await expect(page).toHaveURL(/#social\/post\/browser-post-search-001$/);
  await page.goBack();
  const recentSearch = await openSearch(page);
  await expect(recentSearch.dialog.getByRole("heading", { name:"Recently opened" })).toBeVisible();
  await expect(recentSearch.dialog.getByRole("option", { name:/Open Café launch update/ })).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path:path.join(screenshotDirectory, "global-search-recent-1440.png"), animations:"disabled" });

  const metrics = await page.evaluate(() => window.__LE_GLOBAL_SEARCH_METRICS);
  expect(metrics.lastResponseBytes).toBeLessThan(100_000);
  expect(metrics.lastResponseMs).toBeLessThan(750);
  expect(metrics.fullStateRequests).toBe(0);
  expect(metrics.abortedRequests + metrics.ignoredStaleResponses).toBeGreaterThanOrEqual(1);
  expect(fullStateRequests).toBe(0);
  console.log("GLOBAL_SEARCH_REQUEST_METRICS", JSON.stringify({ representative:representativeMetrics, final:metrics, networkRequests:searchRequests.length, fullStateRequests }));
  const persisted = await page.evaluate(() => ({
    local:Object.entries(localStorage),
    session:Object.entries(sessionStorage)
  }));
  expect(JSON.stringify(persisted)).not.toContain("Café launch update");

  await page.reload({ waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  const afterReload = await openSearch(page);
  await expect(afterReload.dialog.getByRole("heading", { name:"Recently opened" })).toHaveCount(0);
  await expect(afterReload.dialog.locator("[data-global-search-state]")).toContainText("Type a name");
  expect(baseURL).toBeTruthy();
});

test("compatibility routes, restricted visibility, and browser Back remain understandable", async ({ page }) => {
  test.slow();
  const baseURL = await openVNext(page, { hash:"search" });
  let dialog = page.getByRole("dialog", { name:"Search" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name:"Search Command Center" })).toBeFocused();
  await dialog.getByRole("button", { name:"Close Search" }).click();
  await expect(page).toHaveURL(/#today$/);

  await page.goto(`${baseURL}/#operator-search`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  dialog = page.getByRole("dialog", { name:"Search" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name:"Search Command Center" }).fill("Finish launch checklist");
  await dialog.getByRole("option", { name:/Open Finish launch checklist/ }).click();
  await expect(page).toHaveURL(/#item\/tasks\/browser-task-search-001$/);
  await page.goBack();
  await expect(page).toHaveURL(/#operator-search$/);
  await expect(page.getByRole("dialog", { name:"Search" })).toBeVisible();

  const restrictedURL = await authenticateRestricted(page);
  await page.route(`${restrictedURL}/api/**`, async (route) => {
    const request = route.request();
    const requested = new URL(request.url());
    if (request.method() !== "GET" || requested.pathname === "/api/ui/search") {
      await route.continue();
      return;
    }
    const response = await route.fetch({
      url:`${baseURL}${requested.pathname}${requested.search}`,
      headers:{ ...request.headers(), cookie:"" }
    });
    await route.fulfill({ response });
  });
  await page.goto(`${restrictedURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  const restrictedSearch = await openSearch(page);
  await restrictedSearch.input.fill("browser-post-owner-only-001");
  await expect(restrictedSearch.dialog.locator("[data-global-search-state]")).toContainText("No results found");
  const unauthorized = await page.request.get(`${restrictedURL}/api/ui/search?q=browser-post-owner-only-001`);
  expect(unauthorized.ok()).toBe(true);
  expect(await unauthorized.json()).toMatchObject({ total:0, groups:[] });
  await restrictedSearch.input.fill("Finish launch checklist");
  await expect(restrictedSearch.dialog.getByRole("option", { name:/Open Finish launch checklist/ })).toBeVisible();

  const legacyURL = process.env.BROWSER_TEST_BASE_URL;
  await page.context().clearCookies();
  await page.goto(`${legacyURL}/#operator-search`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("#operator-search.page-section.active")).toBeVisible();
  await expect(page.getByRole("dialog", { name:"Search" })).toHaveCount(0);
  await expect(page.getByLabel("Search LegalEase OS")).toBeVisible();
});

test("mobile Search clears competing layers and remains accessible and overflow-free", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page, { width:390 });
  const body = page.locator("body");
  const drawer = page.locator("#vnext-navigation-drawer");
  const drawerOverlay = page.locator(".vnext-drawer-overlay");
  const routedContent = page.locator(".vnext-routed-content");
  const searchTrigger = page.getByRole("button", { name:"Search", exact:true });

  await page.getByRole("button", { name:"Open navigation" }).click();
  await expect(body).toHaveClass(/\bvnext-navigation-open\b/);
  await expect(routedContent).toHaveAttribute("inert", "");
  await expect(searchTrigger).toBeVisible();
  await searchTrigger.click();
  const dialog = page.getByRole("dialog", { name:"Search" });
  await expect(body).not.toHaveClass(/\bvnext-navigation-open\b/);
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(drawer).toHaveAttribute("inert", "");
  await expect(drawerOverlay).toBeHidden();
  await expect(routedContent).not.toHaveAttribute("inert", "");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name:"Search Command Center" })).toBeFocused();
  await expect(page.locator(".vnext-search-dialog:not([hidden])")).toHaveCount(1);
  await expect(page.locator(".vnext-search-backdrop:not([hidden])")).toHaveCount(1);
  await expect(page.locator(".vnext-create-workspace:not([hidden]), .vnext-create-menu:not([hidden]), .vnext-profile-menu:not([hidden]), .vnext-drawer-overlay:not([hidden])")).toHaveCount(0);

  await dialog.getByRole("combobox", { name:"Search Command Center" }).fill("launch");
  await expect(dialog.locator("[data-global-search-result]").first()).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "global-search-results-390.png"), animations:"disabled" });
  await dialog.getByRole("combobox", { name:"Search Command Center" }).fill("no mobile result exists");
  await expect(dialog.locator("[data-global-search-state]")).toContainText("No results found");
  await page.screenshot({ path:path.join(screenshotDirectory, "global-search-no-results-390.png"), animations:"disabled" });
  await closeSearch(page);

  await page.getByRole("button", { name:"Create", exact:true }).click();
  await expect(page.getByRole("menu", { name:"Create" })).toBeVisible();
  await searchTrigger.click();
  await expect(page.getByRole("menu", { name:"Create" })).toBeHidden();
  await expect(dialog).toBeVisible();
  await closeSearch(page);

  await page.getByRole("button", { name:"Profile" }).click();
  await expect(page.getByRole("menu", { name:"Profile" })).toBeVisible();
  await searchTrigger.click();
  await expect(page.getByRole("menu", { name:"Profile" })).toBeHidden();
  await expect(dialog).toBeVisible();

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    const overflow = await page.evaluate(() => ({
      document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body:document.body.scrollWidth - document.body.clientWidth,
      dialog:document.querySelector(".vnext-search-dialog:not([hidden])")?.getBoundingClientRect()
    }));
    expect(overflow.document, `${width}px document overflow`).toBeLessThanOrEqual(0);
    expect(overflow.body, `${width}px body overflow`).toBeLessThanOrEqual(0);
    expect(overflow.dialog.x).toBeGreaterThanOrEqual(0);
    expect(overflow.dialog.right).toBeLessThanOrEqual(width + 1);
  }
  const axe = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);
  await closeSearch(page);
});
