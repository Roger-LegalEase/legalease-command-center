import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-101");
const drawerId = "#vnext-navigation-drawer";
const primaryDestinations = [
  ["Today", "today"],
  ["Social", "social"],
  ["Outreach", "campaigns"],
  ["Partners", "partners"],
  ["Files", "proof"]
];

async function openResponsive(page, width, hash = "today") {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(baseURL, "The server-enabled vNext fixture URL is required.").toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-15T14:00:00-04:00"));
  await openToday(page, `${baseURL}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return baseURL;
}

async function openDrawer(page) {
  const trigger = page.getByRole("button", { name:"Open navigation" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const drawer = page.getByRole("dialog", { name:"Command Center navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name:"Close navigation" })).toBeFocused();
  return { drawer, trigger };
}

async function expectNoOverflow(page, width) {
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body:document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document, `${width}px document must not overflow horizontally.`).toBeLessThanOrEqual(0);
  expect(overflow.body, `${width}px body must not overflow horizontally.`).toBeLessThanOrEqual(0);
}

test("the tablet and mobile drawer traps focus and closes through Escape or the overlay", async ({ page }) => {
  for (const width of [768, 390]) {
    await openResponsive(page, width);
    const { drawer, trigger } = await openDrawer(page);
    await expect(page.locator("body")).toHaveClass(/\bvnext-navigation-open\b/);
    await expect(page.locator(".vnext-routed-content")).toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name:"Create", exact:true })).not.toHaveAttribute("inert", "");
    await drawer.getByRole("link", { name:"LegalEase Command Center home" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(drawer.getByRole("link", { name:"Settings", exact:true })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(drawerId)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("body")).not.toHaveClass(/\bvnext-navigation-open\b/);

    await openDrawer(page);
    await page.mouse.click(width - 10, 100);
    await expect(trigger).toBeFocused();
    await expect(page.locator(drawerId)).toHaveAttribute("aria-hidden", "true");
  }
});

test("all five destinations navigate through the mobile drawer and keep active state synchronized", async ({ page }) => {
  await openResponsive(page, 390);
  for (const [label, route] of primaryDestinations) {
    const { drawer, trigger } = await openDrawer(page);
    const link = drawer.getByRole("link", { name:label, exact:true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(drawerId)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(`[data-shell-destination="${label}"]`).first()).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-shell-current-context]")).toHaveText(label);
    await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  }
  await expect(page.locator(".vnext-primary-navigation")).toHaveCount(1);
  await expect(page.locator(".app-topbar")).toHaveCount(0);
});

test("mobile utilities and the shared Global Create workflow remain reachable", async ({ page }) => {
  await openResponsive(page, 390);
  let opened = await openDrawer(page);
  await opened.drawer.getByRole("link", { name:/^Inbox/ }).click();
  await expect(page).toHaveURL(/#inbox(?:\?group=needs-me)?$/);
  await expect(page.getByRole("heading", { name:"Inbox", level:1 })).toBeVisible();

  opened = await openDrawer(page);
  await opened.drawer.getByRole("button", { name:"Le-E", exact:true }).click();
  await expect(page.getByLabel("Le-E chat panel")).toBeVisible();
  await expect(opened.trigger).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name:"Close Le-E" }).click();
  await expect(page.getByLabel("Le-E chat panel")).toBeHidden();

  opened = await openDrawer(page);
  await opened.drawer.getByRole("link", { name:"Settings", exact:true }).click();
  await expect(page).toHaveURL(/#settings$/);

  const create = page.getByRole("button", { name:"Create", exact:true });
  await expect(create).toBeVisible();
  await create.click();
  await expect(page.getByRole("menu", { name:"Create" })).toBeVisible();
  await expect(page.getByRole("menu", { name:"Create" }).getByRole("menuitem")).toHaveCount(5);
  await page.getByRole("menuitem", { name:/Quick note/ }).click();
  await expect(page.getByRole("dialog", { name:"Create" })).toBeVisible();
  await expect(page.getByRole("heading", { name:"Quick Capture" })).toBeVisible();
  await page.getByRole("button", { name:"Cancel" }).click();
});

test("mobile aliases, record links, unknown fallback, and the legacy shell stay compatible", async ({ page, baseURL }) => {
  const vnextURL = await openResponsive(page, 390, "growth");
  await expect(page).toHaveURL(/#social$/);
  await expect(page.locator("[data-shell-current-context]")).toHaveText("Social");

  const state = await page.request.get(`${vnextURL}/api/state`).then((response) => response.json());
  const postId = state.posts?.[0]?.id;
  expect(postId).toBeTruthy();
  await page.goto(`${vnextURL}/#item/posts/${encodeURIComponent(postId)}`);
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("[data-shell-current-context]")).toHaveText("Social");

  await page.goto(`${vnextURL}/#not-a-responsive-route`);
  await expect(page).toHaveURL(/#not-a-responsive-route$/);
  await expect(page.getByRole("heading", { name:"Page not found", level:1 })).toBeVisible();
  await expect(page.locator("[data-shell-current-context]")).toHaveText("Today");

  await page.goto(`${baseURL}/#growth`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page).toHaveURL(/#growth$/);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name:"Primary" })).toBeVisible();
});

test("the responsive shell has no overflow or serious accessibility findings and captures review screenshots", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await openResponsive(page, width);
    await expectNoOverflow(page, width);
    if (width > 860) {
      await expect(page.locator(".vnext-sidebar")).toBeVisible();
      await expect(page.getByRole("button", { name:"Open navigation" })).toBeHidden();
    } else {
      await expect(page.locator(".vnext-sidebar")).toBeHidden();
      await expect(page.getByRole("button", { name:"Open navigation" })).toBeVisible();
      await expect(page.getByRole("button", { name:"Create", exact:true })).toBeVisible();
    }
    await page.screenshot({
      path:path.join(screenshotDirectory, `responsive-shell-today-${width}.png`),
      animations:"disabled"
    });

    if (width === 768 || width === 390) {
      await openDrawer(page);
      await expectNoOverflow(page, width);
      const logo = page.getByRole("dialog", { name:"Command Center navigation" }).locator(".vnext-shell-logo");
      await expect(logo).toHaveAttribute("src", "/assets/brand/logos/legalease-logo-white-2025.png");
      const dimensions = await logo.evaluate((image) => ({
        naturalWidth:image.naturalWidth,
        naturalHeight:image.naturalHeight,
        width:image.getBoundingClientRect().width,
        height:image.getBoundingClientRect().height,
        objectFit:getComputedStyle(image).objectFit
      }));
      expect(dimensions.naturalWidth).toBe(1920);
      expect(dimensions.naturalHeight).toBe(1080);
      expect(dimensions.objectFit).toBe("contain");
      expect(Math.abs(dimensions.width / dimensions.height - 1920 / 1080)).toBeLessThan(0.01);
      const axe = await new AxeBuilder({ page })
        .include("body")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);
      await page.screenshot({
        path:path.join(screenshotDirectory, `responsive-shell-drawer-${width}.png`),
        animations:"disabled"
      });
      await page.keyboard.press("Escape");
    }
  }

  await openResponsive(page, 390);
  const opened = await openDrawer(page);
  await opened.drawer.getByRole("link", { name:"Social", exact:true }).click();
  await expect(page).toHaveURL(/#social$/);
  await page.screenshot({
    path:path.join(screenshotDirectory, "responsive-shell-social-390.png"),
    animations:"disabled"
  });
});
