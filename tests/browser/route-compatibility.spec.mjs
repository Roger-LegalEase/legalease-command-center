import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-102");

async function openCompatibility(page, hash = "today", width = 1440) {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(baseURL, "The server-enabled vNext fixture URL is required.").toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-15T14:00:00-04:00"));
  await openToday(page, `${baseURL}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return baseURL;
}

function primaryNavigation(page) {
  return page.getByRole("navigation", { name:"Primary destinations" });
}

async function setHash(page, hash) {
  await page.evaluate((nextHash) => { location.hash = nextHash; }, hash);
}

test("canonical pages and aliases resolve identically without reload and preserve browser history", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  await openCompatibility(page);
  let documentRequests = 0;
  let fullStateRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.resourceType() === "document") documentRequests += 1;
    if (url.pathname === "/api/state") fullStateRequests += 1;
  });

  const routePairs = [
    ["today", "overview", "Today"],
    ["growth", "social", "Social"],
    ["campaigns", "campaign", "Outreach"],
    ["partners", "partner", "Partners"],
    ["proof", "metrics", "Files"]
  ];
  for (const [canonical, alias, destination] of routePairs) {
    await setHash(page, canonical);
    await expect(page).toHaveURL(new RegExp(`#${canonical}$`));
    const canonicalHeading = await page.locator("main#app").getByRole("heading", { level:1 }).first().textContent();
    await setHash(page, alias);
    await expect(page).toHaveURL(new RegExp(`#${canonical}$`));
    await expect(primaryNavigation(page).getByRole("link", { name:destination, exact:true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toHaveText(canonicalHeading || "");
  }
  await page.screenshot({
    path:path.join(screenshotDirectory, "route-alias-canonicalized-1440.png"),
    animations:"disabled"
  });

  await setHash(page, "today");
  await expect(page).toHaveURL(/#today$/);
  await setHash(page, "social");
  await expect(page).toHaveURL(/#growth$/);
  await page.goBack();
  await expect(page).toHaveURL(/#today$/);
  await page.goForward();
  await expect(page).toHaveURL(/#growth$/);
  expect(documentRequests).toBe(0);
  expect(fullStateRequests).toBe(0);
});

test("canonical Post, Campaign, Partner, and File links open exact fixture records", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = await openCompatibility(page);
  const stateResponse = await page.request.get(`${baseURL}/api/state`);
  expect(stateResponse.ok()).toBe(true);
  const state = await stateResponse.json();
  const post = state.posts.find((item) => item.id === "post-001") || state.posts[0];
  const campaign = state.campaigns.find((item) => item.id === "browser-campaign-001");
  const partner = state.partners.find((item) => item.id === "browser-partner-001");
  const file = state.reports[0];
  for (const record of [post, campaign, partner, file]) expect(record).toBeTruthy();

  const fixtures = [
    ["post", `social/post/${encodeURIComponent(post.id)}`, post.title, "Social", "post-deep-link-1440.png"],
    ["campaign", `outreach/campaign/${encodeURIComponent(campaign.id)}`, campaign.title, "Outreach", "campaign-deep-link-1440.png"],
    ["partner", `partners/partner/${encodeURIComponent(partner.id)}`, partner.name, "Partners", "partner-deep-link-1440.png"],
    ["file", `files/report/${encodeURIComponent(file.id)}`, file.reportTitle, "Files", "file-deep-link-1440.png"]
  ];
  for (const [, hash, title, destination, screenshot] of fixtures) {
    await setHash(page, hash);
    await expect(page).toHaveURL(new RegExp(`#${hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
    await expect(page.locator("main#app #item").getByRole("heading", { level:1 })).toHaveText(title);
    await expect(primaryNavigation(page).getByRole("link", { name:destination, exact:true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path:path.join(screenshotDirectory, screenshot), animations:"disabled" });
  }
});

test("generic item links retain exact identity and missing records show a truthful state", async ({ page }) => {
  const baseURL = await openCompatibility(page);
  const state = await page.request.get(`${baseURL}/api/state`).then((response) => response.json());
  const post = state.posts[0];
  await setHash(page, `item/posts/${encodeURIComponent(post.id)}`);
  await expect(page).toHaveURL(new RegExp(`#item/posts/${encodeURIComponent(post.id)}$`));
  await expect(page.locator("main#app #item").getByRole("heading", { level:1 })).toHaveText(post.title);
  await expect(primaryNavigation(page).getByRole("link", { name:"Social", exact:true })).toHaveAttribute("aria-current", "page");

  await setHash(page, "social/post/missing-post-record");
  await expect(page).toHaveURL(/#social\/post\/missing-post-record$/);
  await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
  await expect(page.getByText(/This record is not in the loaded data/i)).toBeVisible();
  await expect(page.getByText(/Nothing on this page sends or publishes/i)).toBeVisible();
});

test("unknown safe routes show recovery with working Today and Search actions", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  await openCompatibility(page, "old-incomplete-link");
  await expect(page).toHaveURL(/#old-incomplete-link$/);
  const recovery = page.locator("[data-vnext-route-recovery]");
  await expect(recovery.getByRole("heading", { name:"Page not found", level:1 })).toBeVisible();
  await expect(recovery.getByText("The link may be old or incomplete. No data was changed.")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await page.screenshot({ path:path.join(screenshotDirectory, "unknown-route-recovery-1440.png"), animations:"disabled" });

  await recovery.getByRole("link", { name:"Search", exact:true }).click();
  await expect(page).toHaveURL(/#operator-search$/);
  await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  await setHash(page, "another-old-link");
  await expect(page.locator("[data-vnext-route-recovery]")).toBeVisible();
  await page.getByRole("link", { name:"Go to Today", exact:true }).click();
  await expect(page).toHaveURL(/#today$/);

  await openCompatibility(page, "old-incomplete-link", 390);
  await expect(page.locator("[data-vnext-route-recovery]")).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "unknown-route-recovery-390.png"), animations:"disabled" });
});

test("unsafe route values fail closed without mutations or raw-payload rendering", async ({ page }) => {
  const baseURL = await openCompatibility(page);
  const mutationRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin === new URL(baseURL).origin && request.method() !== "GET") {
      mutationRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  const unsafeHashes = [
    "item/posts/%E0%A4%A",
    "item/posts/%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "item/posts/..%2Fprivate",
    "item/posts/back%5Cslash",
    "files/unknown-source/record-1",
    `item/posts/${"x".repeat(241)}`
  ];
  for (const hash of unsafeHashes) {
    await setHash(page, hash);
    await expect(page.locator("[data-vnext-route-recovery]")).toBeVisible();
    await expect(page.locator("main#app #item.page-section.active")).toHaveCount(0);
    await expect(page.locator("main#app")).not.toContainText("<script>alert(1)</script>");
  }
  expect(mutationRequests).toEqual([]);
});

test("route recovery and exact links remain accessible, synchronized, and overflow-free", async ({ page }) => {
  test.slow();
  let fullStateRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/state") fullStateRequests += 1;
  });
  await openCompatibility(page, "old-incomplete-link");
  await expect.poll(() => fullStateRequests).toBe(1);
  const axe = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    await setHash(page, "social/post/post-001");
    await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
    if (width <= 768) await expect(page.locator("[data-shell-current-context]")).toHaveText("Social");
    else await expect(primaryNavigation(page).getByRole("link", { name:"Social", exact:true })).toHaveAttribute("aria-current", "page");
    const overflow = await page.evaluate(() => ({
      document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body:document.body.scrollWidth - document.body.clientWidth
    }));
    expect(overflow.document, `${width}px document must not overflow horizontally.`).toBeLessThanOrEqual(0);
    expect(overflow.body, `${width}px body must not overflow horizontally.`).toBeLessThanOrEqual(0);
  }
  expect(fullStateRequests).toBe(1);
});
