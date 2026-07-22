import { expect, openToday, test } from "./support.mjs";

test("founder reviews calm Company Health without exposing diagnostics", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_TODAY_BASE_URL;
  test.skip(!baseURL, "The isolated founder browser fixture URL is required.");
  const mutations = [];
  page.on("request", (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(new URL(request.url()).pathname);
  });

  await page.setViewportSize({ width:1440, height:900 });
  await openToday(page, `${baseURL}/#today`);
  await page.getByRole("link", { name:"Company Health", exact:true }).click();
  await expect(page).toHaveURL(/#os-health$/);

  const health = page.locator("[data-founder-company-health]");
  await expect(health).toBeVisible();
  await expect(health).toHaveAttribute("data-loaded", "true");
  await expect(health.locator("[data-health-area]")).toHaveCount(9);
  for (const area of ["Production application", "Supabase", "Authentication", "Storage", "Google connection", "Email provider", "Stripe", "Website analytics", "Background jobs"]) {
    await expect(health.getByRole("heading", { name:area, exact:true })).toBeVisible();
  }
  const badges = await health.locator(".founder-health__card .founder-health__badge").allTextContents();
  expect(badges).toHaveLength(9);
  expect(badges.every((value) => ["Healthy", "Needs attention", "Unavailable"].includes(value.trim()))).toBe(true);
  await expect(health).toContainText("Last successful operation");
  await expect(health).not.toContainText(/provider payload|storage backend|environment variable|internal collection|raw log/i);

  await health.getByRole("button", { name:"Show advanced checks" }).click();
  const advanced = health.locator("[data-health-advanced-panel]");
  await expect(advanced).toBeVisible();
  await expect(advanced).toContainText(/bounded|not available/i);
  await health.getByRole("button", { name:"Hide advanced checks" }).click();
  await expect(advanced).toBeHidden();

  await health.getByRole("button", { name:"Refresh" }).click();
  await expect(health.locator("[data-health-message]")).toContainText("Company Health refreshed.");

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    health:document.querySelector("[data-founder-company-health]").scrollWidth - document.querySelector("[data-founder-company-health]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.health).toBeLessThanOrEqual(0);

  expect(mutations).toEqual([]);
});
