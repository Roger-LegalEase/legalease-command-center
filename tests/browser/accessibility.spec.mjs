import AxeBuilder from "@axe-core/playwright";
import { expect, openToday, test } from "./support.mjs";
import { accessibilityBaseline } from "./baselines.mjs";

async function seriousOrCriticalViolations(page) {
  const results = await new AxeBuilder({ page })
    .include("main#app")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((violation) => ["critical", "serious"].includes(violation.impact))
    .map((violation) => ({
      rule:violation.id,
      impact:violation.impact,
      targets:violation.nodes.map((node) => node.target.join(" ")).sort()
    }));
}

test("Today has no unbaselined serious or critical axe violations", async ({ page }) => {
  await openToday(page);
  expect(await seriousOrCriticalViolations(page)).toEqual(accessibilityBaseline.today);
});

test("the current Social workspace has no unbaselined serious or critical axe violations", async ({ page }) => {
  await openToday(page);
  await page.getByRole("navigation", { name:"Primary" }).getByRole("link", { name:"Review Desk", exact:true }).click();
  await expect(page).toHaveURL(/#queue$/);
  await expect(page.locator("main#app").getByRole("heading", { name:"Review Desk", level:1 })).toBeVisible();
  expect(await seriousOrCriticalViolations(page)).toEqual(accessibilityBaseline.social);
});
