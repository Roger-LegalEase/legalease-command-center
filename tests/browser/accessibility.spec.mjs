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
      targets:violation.nodes.map((node) => {
        // axe chooses the shortest unique CSS selector, so the same chip may be `.ok`
        // locally and `.ok.ck-chip` when another `.ok` element is present in CI. Anchor
        // this one known baseline node to its semantic class pair instead of uniqueness.
        if (/class=["'][^"']*\bck-chip\b[^"']*\bok\b[^"']*["']/.test(node.html)) return ".ck-chip.ok";
        return node.target.join(" ");
      }).sort()
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
