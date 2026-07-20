import AxeBuilder from "@axe-core/playwright";

import { expect, openToday, test } from "./support.mjs";

const widths = [1440, 1280, 1024, 768, 390];
const surfaces = [
  { name:"Today", env:"BROWSER_TEST_TODAY_BASE_URL", hash:"today", heading:"Today" },
  { name:"Inbox", env:"BROWSER_TEST_ACTIONS_BASE_URL", hash:"inbox?group=needs-me", heading:"Inbox" },
  { name:"Social", env:"BROWSER_TEST_SOCIAL_BASE_URL", hash:"social?view=ideas", heading:"Social" },
  { name:"Outreach", env:"BROWSER_TEST_OUTREACH_BASE_URL", hash:"outreach", heading:"Outreach" },
  { name:"Partners", env:"BROWSER_TEST_PARTNERS_BASE_URL", hash:"partners", heading:"Partners" },
  { name:"Files", env:"BROWSER_TEST_FILES_BASE_URL", hash:"files", heading:"Files" },
  { name:"Investor Room", env:"BROWSER_TEST_FILES_BASE_URL", hash:"files?collection=investor-room", heading:"Investor Room" }
];

async function seriousOrCritical(page, include = "body") {
  const result = await new AxeBuilder({ page })
    .include(include)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return result.violations
    .filter((violation) => ["critical", "serious"].includes(violation.impact))
    .map((violation) => ({ id:violation.id, impact:violation.impact, targets:violation.nodes.map((node) => node.target.join(" ")).sort() }));
}

async function noHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth
  ));
  expect(overflow, `${label} must have a narrow-screen alternative without page overflow.`).toBeLessThanOrEqual(0);
}

test("all primary workflows pass axe and responsive landmark review at five required widths", async ({ page }) => {
  test.slow();
  for (const width of widths) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    for (const surface of surfaces) {
      const baseURL = process.env[surface.env];
      expect(baseURL, `${surface.name} fixture URL is required.`).toBeTruthy();
      await openToday(page, `${baseURL}/#${surface.hash}`);
      await expect(page.locator("main#app").getByRole("heading", { name:surface.heading, level:1 })).toBeVisible();
      await expect(page.locator("main#app")).toHaveCount(1);
      await expect(page.locator("nav[aria-label]")).not.toHaveCount(0);
      await noHorizontalOverflow(page, `${surface.name} at ${width}px`);
      expect(await seriousOrCritical(page), `${surface.name} at ${width}px`).toEqual([]);
    }
  }
});

test("Search, Create, and Discovery contain focus and announce complete accessible dialogs", async ({ page }) => {
  test.slow();
  for (const width of widths) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });

    const searchBase = process.env.BROWSER_TEST_VNEXT_BASE_URL;
    await openToday(page, `${searchBase}/#today`);
    const searchTrigger = page.getByRole("button", { name:"Search", exact:true });
    await searchTrigger.click();
    const search = page.getByRole("dialog", { name:"Search" });
    await expect(search).toBeVisible();
    await expect(search.getByRole("combobox", { name:"Search Command Center" })).toBeFocused();
    expect(await seriousOrCritical(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(searchTrigger).toBeFocused();

    const createBase = process.env.BROWSER_TEST_CREATE_BASE_URL;
    await openToday(page, `${createBase}/#today`);
    const createTrigger = page.getByRole("button", { name:"Create", exact:true });
    await createTrigger.click();
    const menu = page.getByRole("menu", { name:"Create" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name:/Quick note/ }).click();
    const create = page.getByRole("dialog", { name:"Create" });
    await expect(create.getByRole("heading", { name:"Quick Capture" })).toBeVisible();
    await expect(create.getByRole("textbox")).toBeFocused();
    expect(await seriousOrCritical(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(createTrigger).toBeFocused();

    const discoveryBase = process.env.BROWSER_TEST_DISCOVERY_BASE_URL;
    await openToday(page, `${discoveryBase}/#today`);
    const onboarding = page.locator("[data-discovery-onboarding]");
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByRole("dialog")).toBeVisible();
    expect(await seriousOrCritical(page)).toEqual([]);
    await noHorizontalOverflow(page, `Discovery at ${width}px`);
  }
});
