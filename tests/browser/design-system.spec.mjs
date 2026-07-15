import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "./support.mjs";

const showcasePath = "/__vnext/design-system";
const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-006");

async function openShowcase(page) {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(baseURL, "The vNext fixture URL is required.").toBeTruthy();
  await page.goto(`${baseURL}${showcasePath}`, { waitUntil:"domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`${showcasePath.replaceAll("/", "\\/")}$`));
  await expect(page.getByRole("heading", { name:"Approved design system", level:1 })).toBeVisible();
}

test("the showcase is enabled only by the server-side vNext mode", async ({ page, baseURL }) => {
  const disabled = await page.request.get(`${baseURL}${showcasePath}`, { maxRedirects:0 });
  expect(disabled.status()).toBe(302);
  expect(disabled.headers().location).toBe("/#today");
  await openShowcase(page);
  await expect(page.locator("body[data-vnext-design-system='true']")).toBeVisible();
});

test("the exact white logo and core component states render without distortion", async ({ page }) => {
  await openShowcase(page);
  const logo = page.locator(".ds-sidebar .ds-logo").first();
  await expect(logo).toHaveAttribute("src", "/assets/brand/logos/legalease-logo-white-2025.png");
  const dimensions = await logo.evaluate((image) => ({
    complete:image.complete,
    naturalWidth:image.naturalWidth,
    naturalHeight:image.naturalHeight,
    width:image.getBoundingClientRect().width,
    height:image.getBoundingClientRect().height,
    objectFit:getComputedStyle(image).objectFit,
    overflow:getComputedStyle(image.parentElement).overflow
  }));
  expect(dimensions.complete).toBe(true);
  expect(dimensions.naturalWidth).toBe(1920);
  expect(dimensions.naturalHeight).toBe(1080);
  expect(dimensions.objectFit).toBe("contain");
  expect(Math.abs(dimensions.width / dimensions.height - 1920 / 1080)).toBeLessThan(0.01);
  expect(dimensions.overflow).not.toBe("hidden");

  for (const label of ["Create item", "Preview", "View details", "Delete draft", "Working…", "Needs attention"]) {
    await expect(page.getByText(label, { exact:true }).first()).toBeVisible();
  }
  await expect(page.getByLabel("Example form")).toBeVisible();
  await expect(page.getByRole("dialog", { name:"Design-system record" })).toBeVisible();
  await page.getByRole("button", { name:"Create item" }).first().click();
  await expect(page.locator("#showcase-status")).toContainText("Working…");
  await page.getByRole("button", { name:"Close record drawer" }).click();
  await expect(page.getByRole("dialog", { name:"Design-system record" })).toBeHidden();
  await page.getByRole("button", { name:"Show record drawer" }).click();
  await expect(page.getByRole("dialog", { name:"Design-system record" })).toBeVisible();
});

test("the showcase has visible keyboard focus and no serious or critical axe violations", async ({ page }) => {
  await openShowcase(page);
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return {
      tag:element?.tagName,
      visible:element?.matches(":focus-visible"),
      outline:style.outlineStyle,
      shadow:style.boxShadow
    };
  });
  expect(focus.tag).toBe("A");
  expect(focus.visible).toBe(true);
  expect(focus.outline).not.toBe("none");
  expect(focus.shadow).not.toBe("none");

  const results = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const seriousOrCritical = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  expect(seriousOrCritical).toEqual([]);
});

test("the showcase has no horizontal overflow and captures all required review widths", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    await openShowcase(page);
    const overflow = await page.evaluate(() => ({
      document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body:document.body.scrollWidth - document.body.clientWidth
    }));
    expect(overflow.document, `${width}px document must not overflow horizontally.`).toBeLessThanOrEqual(0);
    expect(overflow.body, `${width}px body must not overflow horizontally.`).toBeLessThanOrEqual(0);
    if (width === 390) {
      await expect(page.getByRole("heading", { name:"Mobile navigation sample" })).toBeVisible();
      await expect(page.getByLabel("Mobile navigation drawer sample").locator(".ds-mobile-drawer")).toBeVisible();
    }
    await page.screenshot({
      path:path.join(screenshotDirectory, `showcase-${width}.png`),
      fullPage:true,
      animations:"disabled"
    });
  }
});

test("reduced motion removes non-essential animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion:"reduce" });
  await openShowcase(page);
  const durationMs = await page.locator(".ui-control-progress").evaluate((element) => {
    const value = getComputedStyle(element).animationDuration;
    return value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
  });
  expect(durationMs).toBeLessThanOrEqual(0.001);
});
