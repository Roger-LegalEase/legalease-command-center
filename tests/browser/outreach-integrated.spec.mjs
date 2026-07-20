import { expect, test } from "./support.mjs";

test("integrated Outreach home uses the compact flag-gated route without full-state reads", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_OUTREACH_BASE_URL;
  expect(baseURL).toBeTruthy();
  const requests = [];
  const mutations = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) return;
    requests.push(`${request.method()} ${url.pathname}`);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });

  await page.goto(`${baseURL}/#campaigns`, { waitUntil:"domcontentloaded" });
  await expect(page).toHaveURL(/#outreach$/);
  await expect(page.getByRole("heading", { name:"Outreach", level:1 })).toBeVisible();
  await expect(page.locator("[data-outreach-content]")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("link", { name:"Outreach", exact:true })).toHaveAttribute("href", "#outreach");
  await expect(page.getByRole("link", { name:/Open campaign:/ }).first()).toHaveAttribute("href", /#outreach\/campaign\//);

  expect(requests.filter((entry) => entry === "GET /api/ui/outreach")).toHaveLength(1);
  expect(requests.some((entry) => entry.endsWith(" /api/state"))).toBe(false);
  expect(mutations).toEqual([]);
});
