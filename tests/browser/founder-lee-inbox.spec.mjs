import { expect, test } from "@playwright/test";

test("founder handles Le-E follow-ups in context without an external action", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_FOUNDER_PARTNERS_BASE_URL;
  test.skip(!baseURL, "Founder inbox browser server is required.");
  const mutations = [];
  page.on("request", (request) => {
    if (request.method() === "POST") mutations.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/inbox/scan", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({ ok:true, observations:[], lastScan:{ at:"2026-07-21T15:00:00.000Z", status:"complete", count:2, truncated:false } })
    });
  });

  await page.goto(`${baseURL}/#inbox`);
  const panel = page.locator("[data-lee-inbox-panel]");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name:"Conversations needing a next move" })).toBeVisible();
  await expect(panel.getByText("Needs your reply", { exact:true })).toBeVisible();
  await expect(panel.getByText("They went quiet", { exact:true })).toBeVisible();

  const reply = panel.locator("[data-lee-item]", { hasText:"Taylor Example" });
  await reply.getByRole("button", { name:"Open relationship" }).click();
  await expect(page.locator("[data-relationship-drawer]")).toBeVisible();
  await expect(page.locator("[data-relationship-title]")).toHaveText("Community Justice Network");
  await page.locator("[data-relationship-drawer]").getByRole("button", { name:"Close relationship details" }).click();

  await reply.getByRole("button", { name:"Draft reply" }).click();
  const composer = page.locator("[data-communication-composer]");
  await expect(composer).toBeVisible();
  await expect(composer.locator('[name="recipient"]')).toHaveValue("taylor@example.com");
  await composer.getByRole("button", { name:"Close message composer" }).click();

  await panel.getByRole("button", { name:"Refresh inbox now" }).click();
  await expect(panel.getByText(/Inbox refreshed/)).toBeVisible();

  const quiet = panel.locator("[data-lee-item]", { hasText:"Morgan Example" });
  await quiet.getByRole("button", { name:"Create task" }).click();
  await expect(panel.getByText("Follow-up task created.")).toBeVisible();
  await expect(quiet).toHaveCount(0);

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panel:document.querySelector("[data-lee-inbox-panel]").scrollWidth - document.querySelector("[data-lee-inbox-panel]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.panel).toBeLessThanOrEqual(0);

  expect(mutations).toContain("/api/inbox/scan");
  expect(mutations).toContain("/api/ui/lee-inbox/action");
  expect(mutations.filter((path) => /send|publish|release|launch|live-mode|heartbeat/i.test(path))).toEqual([]);
});
