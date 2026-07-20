import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-100");
const primaryDestinations = [
  ["Today", "today"],
  ["Social", "social"],
  ["Outreach", "campaigns"],
  ["Partners", "partners"],
  ["Files", "proof"]
];

async function openVNext(page, hash = "today") {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(baseURL, "The server-enabled vNext fixture URL is required.").toBeTruthy();
  await page.clock.setFixedTime(new Date("2026-07-15T14:00:00-04:00"));
  await openToday(page, `${baseURL}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return baseURL;
}

function primaryNavigation(page) {
  return page.getByRole("navigation", { name:"Primary destinations" });
}

test("the production vNext shell uses the approved logo and five exact destinations", async ({ page }) => {
  await openVNext(page);
  const navigation = primaryNavigation(page);
  await expect(navigation.getByRole("link")).toHaveCount(5);
  for (const [label] of primaryDestinations) {
    await expect(navigation.getByRole("link", { name:label, exact:true })).toBeVisible();
  }
  await expect(navigation.getByRole("link", { name:"Today", exact:true })).toHaveAttribute("aria-current", "page");
  const logo = page.locator(".vnext-shell-logo");
  await expect(logo).toHaveAttribute("src", "/assets/brand/logos/legalease-logo-white-2025.png");
  const logoDimensions = await logo.evaluate((image) => ({
    naturalWidth:image.naturalWidth,
    naturalHeight:image.naturalHeight,
    width:image.getBoundingClientRect().width,
    height:image.getBoundingClientRect().height,
    objectFit:getComputedStyle(image).objectFit
  }));
  expect(logoDimensions.naturalWidth).toBe(1920);
  expect(logoDimensions.naturalHeight).toBe(1080);
  expect(logoDimensions.objectFit).toBe("contain");
  expect(Math.abs(logoDimensions.width / logoDimensions.height - 1920 / 1080)).toBeLessThan(0.01);
  const social = navigation.getByRole("link", { name:"Social", exact:true });
  await social.focus();
  const focusStyle = await social.evaluate((element) => ({
    focusVisible:element.matches(":focus-visible"),
    outline:getComputedStyle(element).outlineStyle
  }));
  expect(focusStyle.focusVisible).toBe(true);
  expect(focusStyle.outline).not.toBe("none");
  await expect(page.locator(".app-topbar")).toHaveCount(0);
  await expect(page.locator("main#app")).toHaveCount(1);
});

test("visible destination navigation stays synchronized and captures desktop review screenshots", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  await page.setViewportSize({ width:1440, height:900 });
  await openVNext(page);
  const navigation = primaryNavigation(page);

  for (const [label, route] of primaryDestinations) {
    const link = navigation.getByRole("link", { name:label, exact:true });
    if (label !== "Today") await link.click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
    await expect(page.locator("main#app")).not.toBeEmpty();
    await page.screenshot({
      path:path.join(screenshotDirectory, `desktop-shell-${label.toLowerCase()}-1440.png`),
      animations:"disabled"
    });
  }

  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height:900 });
    await navigation.getByRole("link", { name:"Today", exact:true }).click();
    await expect(page).toHaveURL(/#today$/);
    await page.screenshot({
      path:path.join(screenshotDirectory, `desktop-shell-today-${width}.png`),
      animations:"disabled"
    });
  }
});

test("aliases, record links, unknown routes, utilities, and top-bar controls remain functional", async ({ page }) => {
  const baseURL = await openVNext(page, "growth");
  await expect(page).toHaveURL(/#social$/);
  await expect(primaryNavigation(page).getByRole("link", { name:"Social", exact:true })).toHaveAttribute("aria-current", "page");

  const stateResponse = await page.request.get(`${baseURL}/api/state`);
  expect(stateResponse.ok()).toBe(true);
  const fixtureState = await stateResponse.json();
  const postId = fixtureState.posts?.[0]?.id;
  expect(postId).toBeTruthy();
  await page.goto(`${baseURL}/#item/posts/${encodeURIComponent(postId)}`);
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(primaryNavigation(page).getByRole("link", { name:"Social", exact:true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
  await expect(page.locator("main#app #item").getByRole("heading", { level:1 })).toBeVisible();

  await page.goto(`${baseURL}/#not-a-real-command-center-route`);
  await expect(page).toHaveURL(/#not-a-real-command-center-route$/);
  await expect(page.getByRole("heading", { name:"Page not found", level:1 })).toBeVisible();
  await expect(primaryNavigation(page).getByRole("link", { name:"Today", exact:true })).toHaveAttribute("aria-current", "page");

  await page.goto(`${baseURL}/#rcap`);
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(primaryNavigation(page).getByRole("link", { name:"Partners", exact:true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("main")).toHaveCount(1);

  await page.getByRole("navigation", { name:"Command Center utilities" }).getByRole("link", { name:/^Inbox/ }).click();
  await expect(page).toHaveURL(/#inbox(?:\?group=needs-me)?$/);
  await expect(page.getByRole("heading", { name:"Inbox", level:1 })).toBeVisible();
  await page.getByRole("button", { name:"Le-E", exact:true }).click();
  await expect(page.getByLabel("Le-E chat panel")).toBeVisible();
  await page.getByRole("navigation", { name:"Command Center utilities" }).getByRole("link", { name:"Settings", exact:true }).click();
  await expect(page).toHaveURL(/#settings$/);
  await page.getByRole("button", { name:"Search", exact:true }).click();
  await expect(page.getByRole("dialog", { name:"Search" })).toBeVisible();
  await expect(page.getByLabel("Le-E chat panel")).toBeHidden();
  await expect(page).toHaveURL(/#settings$/);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name:"Help", exact:true }).click();
  await expect(page).toHaveURL(/#operator-manual$/);
});

test("Create and Profile menus are keyboard-operable and Global Create opens a real workflow", async ({ page }) => {
  await openVNext(page);
  const create = page.getByRole("button", { name:"Create", exact:true });
  await create.focus();
  await page.keyboard.press("ArrowDown");
  await expect(create).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menu", { name:"Create" })).toBeVisible();
  await expect(page.getByRole("menu", { name:"Create" }).getByRole("menuitem")).toHaveCount(5);
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  await expect(create).toHaveAttribute("aria-expanded", "false");

  await create.click();
  await page.getByRole("menuitem", { name:/Social post/ }).click();
  await expect(page.getByRole("dialog", { name:"Create" })).toBeVisible();
  await expect(page.getByRole("heading", { name:"Social post" })).toBeVisible();
  await page.getByRole("button", { name:"Cancel" }).click();
  await expect(page.getByRole("dialog", { name:"Create" })).toBeHidden();
  const profile = page.getByRole("button", { name:"Profile", exact:true });
  await profile.click();
  await expect(profile).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menu", { name:"Profile" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(profile).toBeFocused();
  await expect(profile).toHaveAttribute("aria-expanded", "false");
});

test("the shell has no serious accessibility violations or horizontal overflow", async ({ page }) => {
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    await openVNext(page);
    const overflow = await page.evaluate(() => ({
      document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body:document.body.scrollWidth - document.body.clientWidth
    }));
    expect(overflow.document, `${width}px document must not overflow horizontally.`).toBeLessThanOrEqual(0);
    expect(overflow.body, `${width}px body must not overflow horizontally.`).toBeLessThanOrEqual(0);
  }

  await page.setViewportSize({ width:1440, height:900 });
  await openVNext(page);
  const results = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const seriousOrCritical = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  expect(seriousOrCritical).toEqual([]);
});

test("shell composition preserves the full-state payload and hash navigation stays local", async ({ page, baseURL }) => {
  const vnextBaseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(vnextBaseURL).toBeTruthy();
  const [legacyHtmlResponse, vnextHtmlResponse, legacyStateResponse, vnextStateResponse] = await Promise.all([
    page.request.get(`${baseURL}/`),
    page.request.get(`${vnextBaseURL}/`),
    page.request.get(`${baseURL}/api/state`),
    page.request.get(`${vnextBaseURL}/api/state`)
  ]);
  for (const response of [legacyHtmlResponse, vnextHtmlResponse, legacyStateResponse, vnextStateResponse]) {
    expect(response.ok()).toBe(true);
  }
  const [legacyHtml, vnextHtml, legacyState, vnextState] = await Promise.all([
    legacyHtmlResponse.text(),
    vnextHtmlResponse.text(),
    legacyStateResponse.text(),
    vnextStateResponse.text()
  ]);
  const legacyStateObject = JSON.parse(legacyState);
  const vnextStateObject = JSON.parse(vnextState);
  expect(Object.keys(vnextStateObject).sort()).toEqual(Object.keys(legacyStateObject).sort());
  const recordIdentity = (record, index) => String(record?.id || record?.contact_id || record?.postId || record?.key || `row-${index}`);
  for (const [collection, legacyRecords] of Object.entries(legacyStateObject).filter(([, value]) => Array.isArray(value))) {
    const vnextRecords = vnextStateObject[collection];
    expect(Array.isArray(vnextRecords), `${collection} must remain a list in both shell modes.`).toBe(true);
    expect(vnextRecords.map(recordIdentity), `${collection} record identities must not change with shell mode.`)
      .toEqual(legacyRecords.map(recordIdentity));
  }

  const loadStartedAt = performance.now();
  await openVNext(page);
  const loadDurationMs = Math.round(performance.now() - loadStartedAt);
  let documentRequests = 0;
  let fullStateRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.resourceType() === "document") documentRequests += 1;
    if (url.pathname === "/api/state") fullStateRequests += 1;
  });
  for (const [label] of primaryDestinations.slice(1)) {
    await primaryNavigation(page).getByRole("link", { name:label, exact:true }).click();
    await expect(primaryNavigation(page).getByRole("link", { name:label, exact:true })).toHaveAttribute("aria-current", "page");
  }
  expect(documentRequests).toBe(0);
  expect(fullStateRequests).toBe(0);

  console.log(JSON.stringify({
    ccx100Metrics:{
      legacyHtmlBytes:Buffer.byteLength(legacyHtml),
      vnextHtmlBytes:Buffer.byteLength(vnextHtml),
      legacyFullStateBytes:Buffer.byteLength(legacyState),
      vnextFullStateBytes:Buffer.byteLength(vnextState),
      fullStatePayloadChangedByShell:false,
      navigationDocumentRequests:documentRequests,
      duplicateFullStateRequests:fullStateRequests,
      vnextLoadDurationMs:loadDurationMs
    }
  }));
});
