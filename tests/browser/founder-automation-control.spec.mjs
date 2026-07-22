import { expect, test } from "./support.mjs";

test("founder reviews each automation lane without changing or sending anything", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_OUTREACH_BASE_URL;
  test.skip(!baseURL, "The isolated Outreach browser fixture URL is required.");
  const requests = [];
  const mutations = [];
  const errors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) return;
    requests.push(`${request.method()} ${url.pathname}`);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setViewportSize({ width:1440, height:900 });
  await page.goto(`${baseURL}/#outreach`, { waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Outreach", level:1 })).toBeVisible();
  await page.getByRole("tab", { name:/Automation control/ }).click();
  await expect(page).toHaveURL(/#outreach\?view=automation$/);

  const control = page.locator("[data-automation-control-center]");
  await expect(control).toBeVisible();
  await expect(control.getByRole("heading", { name:"Automation Control Center", level:1 })).toBeVisible();
  await expect(control).toContainText("Nothing on this page can start, release, enroll, or send.");
  await expect(control.getByRole("tab")).toHaveCount(3);
  await expect(control.getByRole("heading", { name:"Reactivation", exact:true })).toBeVisible();
  await expect(control).toContainText("Safety thresholds");
  await expect(control).toContainText("Current reactivation sequences");

  await control.getByRole("tab", { name:/Partner prospects/ }).click();
  await expect(control.getByRole("heading", { name:"Partner prospect outreach", exact:true })).toBeVisible();
  await expect(control).toContainText("Partner prospect readiness");

  await control.getByRole("tab", { name:/Press outreach/ }).click();
  await expect(control.getByRole("heading", { name:"Press outreach", exact:true })).toBeVisible();
  await expect(control).toContainText("Journalists and pitches");

  await control.getByRole("button", { name:"Refresh" }).click();
  await expect(control.locator("[data-automation-message]")).toContainText("Automation review refreshed. No settings were changed.");

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    control:document.querySelector("[data-automation-control-center]").scrollWidth - document.querySelector("[data-automation-control-center]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.control).toBeLessThanOrEqual(0);

  const metrics = await page.evaluate(() => window.__LE_AUTOMATION_CONTROL_CENTER_METRICS);
  expect(metrics.mutations).toBe(0);
  expect(metrics.externalActions).toBe(0);
  expect(metrics.providerCalls).toBe(0);
  expect(metrics.fullStateRequests).toBe(0);
  expect(requests.filter((entry) => entry === "GET /api/ui/automation-control-center").length).toBeGreaterThanOrEqual(1);
  expect(requests.some((entry) => entry.endsWith(" /api/state"))).toBe(false);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});
