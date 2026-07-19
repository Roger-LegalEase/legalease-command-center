import { expect, test } from "./support.mjs";

test("integrated Files routes use compact flag-gated reads without browser writes", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_FILES_BASE_URL;
  expect(baseURL).toBeTruthy();
  const requests = [];
  const mutations = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) return;
    requests.push(`${request.method()} ${url.pathname}`);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });

  await page.goto(`${baseURL}/#proof`, { waitUntil:"domcontentloaded" });
  await expect(page).toHaveURL(/#files$/);
  await expect(page.getByRole("heading", { name:"Files", level:1 })).toBeVisible();
  const fileLink = page.getByRole("link", { name:"Synthetic company overview", exact:true });
  await expect(fileLink).toHaveAttribute("href", "#files/data-room-item/company-overview");
  expect(requests.filter((entry) => entry === "GET /api/ui/files")).toHaveLength(1);
  expect(requests.some((entry) => entry.endsWith(" /api/state"))).toBe(false);
  expect(mutations).toEqual([]);

  requests.length = 0;
  await page.goto(`${baseURL}/#data-room`);
  await expect(page).toHaveURL(/#files\?collection=investor-room$/);
  await expect(page.getByRole("heading", { name:"Investor Room", level:1 })).toBeVisible();
  expect(requests.filter((entry) => entry === "GET /api/ui/files/investor-room")).toHaveLength(1);
  expect(requests.some((entry) => entry.endsWith(" /api/state"))).toBe(false);
  expect(mutations).toEqual([]);
});
