import { allowExpectedConsoleError, allowExpectedRequestFailure, expect, openToday, test } from "./support.mjs";

const scenarios = [
  "read_timeout", "write_timeout", "network_loss_during_save", "third_party_publishing_failure",
  "partial_multi_channel_publishing", "sendgrid_rejection", "expired_authorization",
  "supabase_unavailable", "missing_asset", "invalid_route", "stale_browser_action"
];

test("all required recovery states disclose outcome truth and a next action", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  await openToday(page, `${baseURL}/#today`);
  expect(await page.evaluate(() => window.__LE_RECOVERY_CONTRACT.keys)).toEqual(scenarios);
  for (const scenario of scenarios) {
    const failure = await page.evaluate((key) => window.__LE_RECOVERY_CONTRACT.describe(key), scenario);
    expect(failure).toMatchObject({ key:scenario });
    expect(failure.happened).toBeTruthy();
    expect(failure.didNotHappen).toBeTruthy();
    expect(failure.nextAction).toBeTruthy();
    expect(Object.keys(failure.facts)).toEqual(["saved", "sent", "published", "uploaded", "changed"]);
  }

  for (const scenario of ["read_timeout", "supabase_unavailable", "missing_asset", "invalid_route", "expired_authorization"]) {
    const rendered = await page.evaluate((key) => {
      const failure = window.__LE_SHELL_RESILIENCE.showFailure(key);
      const root = document.querySelector("main#app");
      return { failure, text:root?.innerText || "", state:root?.querySelector("[data-vnext-shell-state]")?.getAttribute("data-vnext-shell-state") || "" };
    }, scenario);
    expect(rendered.state).toBe("error");
    expect(rendered.text).toContain(rendered.failure.happened);
    expect(rendered.text).toContain(rendered.failure.didNotHappen);
    expect(rendered.text).toContain(rendered.failure.nextAction);
    expect(rendered.text).toContain("Saved:");
    expect(rendered.text).toContain("Published:");
  }
});

test("network loss during a Post save preserves edits and never reports success", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_COMPOSER_BASE_URL;
  await page.goto(`${baseURL}/#social/post/idea-01`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-composer-form]")).toBeVisible();
  const body = page.locator("[data-composer-field='body']");
  await body.fill("Browser-local recovery copy must survive the failed save.");
  allowExpectedRequestFailure(page, "/api/ui/social/post/idea-01/save", /ERR_INTERNET_DISCONNECTED/i);
  allowExpectedConsoleError(page, /Failed to load resource.*ERR_INTERNET_DISCONNECTED/i);
  await page.route("**/api/ui/social/post/idea-01/save", (route) => route.abort("internetdisconnected"));
  await page.locator("[data-composer-form]").getByRole("button", { name:/Save/ }).click();
  const saveMessage = page.locator("[data-composer-message]");
  await expect(saveMessage).toContainText("Connection lost before the save result was confirmed");
  await expect(saveMessage).toContainText("Nothing was sent, published, or uploaded");
  await expect(body).toHaveValue("Browser-local recovery copy must survive the failed save.");
  await expect(saveMessage).not.toContainText(/^Saved$/);
});
