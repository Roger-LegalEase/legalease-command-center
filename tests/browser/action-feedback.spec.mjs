import { expect, openToday, test } from "./support.mjs";

test("a local runway update shows progress, prevents duplicate activation, and stays local", async ({ page, baseURL }) => {
  await openToday(page);
  await page.goto("/#daily-run", { waitUntil:"domcontentloaded" });
  await expect(page).toHaveURL(/#daily-run$/);
  await expect(page.getByRole("heading", { name:"Good morning, Roger." })).toBeVisible();
  const beforeSafety = await page.request.get(`${baseURL}/api/safety/posture`).then((response) => response.json());
  let requestCount = 0;
  let releaseRequest;
  const held = new Promise((resolve) => { releaseRequest = resolve; });
  let markRequestSeen;
  const requestSeen = new Promise((resolve) => { markRequestSeen = resolve; });

  await page.route("**/api/runway-inputs", async (route) => {
    requestCount += 1;
    markRequestSeen();
    await held;
    await route.continue();
  });

  const form = page.locator("form.runway-input-form");
  const save = form.getByRole("button", { name:"Save", exact:true });
  await form.getByRole("spinbutton", { name:"Current cash balance" }).fill("1000");
  await form.getByRole("spinbutton", { name:"Monthly burn" }).fill("100");
  const completed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/runway-inputs" && response.request().method() === "POST");
  await save.click();
  await requestSeen;
  await expect(save).toHaveAttribute("aria-busy", "true");
  await save.dispatchEvent("click");
  expect(requestCount, "A busy action must not submit a duplicate request.").toBe(1);
  releaseRequest();
  await expect((await completed).status()).toBe(200);
  await expect(page.locator("#toast")).toHaveClass(/\bshow\b/);
  await expect(page.locator("#toast")).toContainText(/Runway inputs saved/i);

  const afterSafety = await page.request.get(`${baseURL}/api/safety/posture`).then((response) => response.json());
  expect(afterSafety, "A local runway update must not alter any sending or publishing posture.").toEqual(beforeSafety);
});
