import { expect, openToday, test } from "./support.mjs";

test("primary route changes issue one compact read and begin feedback within 100 ms", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  const reads = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/ui/")) reads.push(`${request.method()} ${url.pathname}`);
  });

  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  const feedbackAt = await page.evaluate(async () => {
    const startedAt = performance.now();
    location.hash = "social";
    while (!document.querySelector("main#app [aria-busy='true'], main#app .social-home-state, main#app [data-social-home]")) {
      if (performance.now() - startedAt > 500) return 501;
      await new Promise(requestAnimationFrame);
    }
    return performance.now() - startedAt;
  });
  expect(feedbackAt).toBeLessThan(100);
  await expect(page.locator("main#app").getByRole("heading", { name:"Social", level:1 })).toBeVisible();

  reads.length = 0;
  await page.getByRole("navigation", { name:"Primary destinations" }).getByRole("link", { name:"Today", exact:true }).click();
  await openToday(page, `${baseURL}/#today`);
  expect(reads.filter((value) => value === "GET /api/ui/today")).toHaveLength(1);
  expect(reads.some((value) => /\/api\/(?:state|boot-state)$/.test(value))).toBe(false);
});
