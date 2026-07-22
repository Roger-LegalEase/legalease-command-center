import { expect, openToday, test } from "./support.mjs";

test("founder reviews truthful KPIs and saves manual runway inputs", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_FOUNDER_TASK_BASE_URL;
  test.skip(!baseURL, "The isolated founder browser fixture URL is required.");
  const mutations = [];
  page.on("request", (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(new URL(request.url()).pathname);
  });

  await page.setViewportSize({ width:1440, height:900 });
  await openToday(page, `${baseURL}/#today`);
  await page.getByRole("link", { name:"Scoreboard", exact:true }).click();
  await expect(page).toHaveURL(/#revenue$/);

  const scoreboard = page.locator("[data-founder-scoreboard]");
  await expect(scoreboard).toBeVisible();
  await expect(scoreboard).toHaveAttribute("data-loaded", "true");
  await expect(scoreboard.locator("[data-scoreboard-card]")).toHaveCount(35);
  for (const group of ["Financial", "Acquisition", "Relationships", "Customer", "Marketing", "Health"]) {
    await expect(scoreboard.getByRole("heading", { name:group, exact:true })).toBeVisible();
  }

  const badges = await scoreboard.locator(".founder-scoreboard__badge").allTextContents();
  expect(badges.length).toBe(35);
  expect(badges.every((value) => ["Live", "Manual", "Unavailable", "Needs attention"].includes(value.trim()))).toBe(true);
  await expect(scoreboard.locator("[data-scoreboard-card]").first().getByText("Source", { exact:true })).toBeVisible();
  await expect(scoreboard.locator("[data-scoreboard-card]").first().getByText("Last refreshed", { exact:true })).toBeVisible();

  const form = scoreboard.locator("[data-scoreboard-finance-form]");
  await form.locator('[name="currentCashBalance"]').fill("125000");
  await form.locator('[name="monthlyBurn"]').fill("10000");
  await form.locator('[name="asOfDate"]').fill(new Date().toISOString().slice(0, 10));
  await form.getByRole("button", { name:"Save financial inputs" }).click();
  await expect(scoreboard.locator("[data-scoreboard-message]")).toContainText(/saved|updated/i);
  await expect(scoreboard.locator('[data-scoreboard-card="cash_available"]')).toContainText("$125,000");
  await expect(scoreboard.locator('[data-scoreboard-card="monthly_burn"]')).toContainText("$10,000");
  await expect(scoreboard.locator('[data-scoreboard-card="runway"]')).toContainText("12.5 months");

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scoreboard:document.querySelector("[data-founder-scoreboard]").scrollWidth - document.querySelector("[data-founder-scoreboard]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.scoreboard).toBeLessThanOrEqual(0);

  expect(mutations).toContain("/api/ui/scoreboard/finance");
  expect(mutations.filter((path) => /send|publish|release|launch|live-gate|heartbeat|morning-brief/i.test(path))).toEqual([]);
});
