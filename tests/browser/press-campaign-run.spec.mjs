// The press campaign run approval, exercised the way Roger uses it: in a browser, by clicking.
//
// This spec exists because of a shipped outage. Node-level suites proved the engine enrolled,
// the projection rendered and the capability was offered — and the button was still dead in
// production, because the request it sent resolved the campaign by a field the detail payload
// trimmed away. The click is the only thing that proves the click works.
import { allowExpectedConsoleError, allowExpectedCriticalResponse, expect, test } from "./support.mjs";

// Serial and order-dependent on purpose: these tests share one fixture server, and the whole
// point is that the FIRST click changes what the SECOND test sees. Approving is not idempotent.
test.describe.configure({ mode:"serial" });

const CAMPAIGN = "#outreach/campaign/" + encodeURIComponent("outreach:press-ai_guardrails");

// Land on the app first, then move by hash the way the shell does. Navigating straight to a
// deep hash aborts the load: the route layer rewrites the hash while the navigation is pending.
async function openHash(page, baseURL, hash) {
  if (new URL(page.url() || "http://unset/").host !== new URL(baseURL).host) {
    await page.goto(`${baseURL}/#campaigns`, { waitUntil:"domcontentloaded" });
  }
  await page.evaluate((value) => { window.location.hash = value; }, hash);
}

async function openCampaign(page, baseURL, tab = "") {
  await openHash(page, baseURL, `${CAMPAIGN}${tab ? `?tab=${tab}` : ""}`.slice(1));
  await expect(page.locator("[data-campaign-detail]")).toBeVisible({ timeout:15_000 });
}

test("the pitch and the assigned journalists are readable before anything is approved", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_PRESS_CAMPAIGN_BASE_URL;
  expect(baseURL).toBeTruthy();

  await openCampaign(page, baseURL, "messages");
  const body = page.locator(".campaign-detail-message-body").first();
  await expect(body).toBeVisible();
  await expect(body).toContainText("not a law firm");

  await openCampaign(page, baseURL, "audience");
  await expect(page.locator(".campaign-detail-audience li").first()).toBeVisible();
  await expect(page.locator(".campaign-detail-audience")).toContainText(/held/i);
});

test("clicking the run approval turns the campaign active, enrolls the journalists and offers Stop", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_PRESS_CAMPAIGN_BASE_URL;
  expect(baseURL).toBeTruthy();

  const responses = [];
  page.on("response", (response) => {
    if (response.url().includes("/status-action")) responses.push(response.status());
  });
  page.on("dialog", (dialog) => dialog.accept());

  await openCampaign(page, baseURL, "audience");
  const approve = page.getByRole("button", { name:"Approve and run this campaign" });
  await expect(approve).toBeVisible();
  await approve.click();

  // The page must reflect the approval, not merely have sent a request.
  await expect(page.getByRole("button", { name:"Stop campaign" })).toBeVisible({ timeout:15_000 });
  await expect(page.getByRole("button", { name:"Approve and run this campaign" })).toHaveCount(0);
  await expect(page.locator(".campaign-detail-status")).toContainText(/active/i);
  await expect(page.locator(".campaign-detail-audience")).toContainText(/enrolled/i);
  await expect(page.locator("[data-campaign-action-error]")).toHaveCount(0);
  expect(responses).toEqual([200]);

  // And it must survive a reload: the approval is persisted, not a client-side illusion.
  await openCampaign(page, baseURL, "audience");
  await expect(page.getByRole("button", { name:"Stop campaign" })).toBeVisible();
  await expect(page.locator(".campaign-detail-status")).toContainText(/active/i);
});

test("a refused action tells the operator instead of failing silently", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_PRESS_CAMPAIGN_BASE_URL;
  expect(baseURL).toBeTruthy();
  page.on("dialog", (dialog) => dialog.accept());
  // The refusal IS the subject of this test: the 409 and its console noise are expected.
  const route = `/api/ui/outreach/campaign/${encodeURIComponent("outreach:press-founder_growth")}/status-action`;
  allowExpectedCriticalResponse(page, route);
  allowExpectedConsoleError(page, /409/);

  // A second angle cannot run while the first one is active (one press campaign at a time).
  // Whatever the server answers, the operator must SEE the answer.
  await openHash(page, baseURL, `outreach/campaign/${encodeURIComponent("outreach:press-founder_growth")}`);
  await expect(page.locator("[data-campaign-detail]")).toBeVisible({ timeout:15_000 });
  const approve = page.getByRole("button", { name:"Approve and run this campaign" });
  await expect(approve).toBeVisible();
  await approve.click();

  const outcome = page.locator("[data-campaign-action-error]");
  await expect(outcome).toBeVisible({ timeout:15_000 });
  await expect(outcome).toContainText(/one press campaign at a time/i);
  // Refused means refused: the campaign must not have started behind the message.
  await expect(page.getByRole("button", { name:"Stop campaign" })).toHaveCount(0);
  await expect(approve).toBeEnabled();
});
