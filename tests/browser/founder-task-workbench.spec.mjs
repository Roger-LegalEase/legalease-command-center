import { expect, openToday, test } from "./support.mjs";

test("founder completes the full task workflow from Today and reopens it from Inbox", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_FOUNDER_TASK_BASE_URL;
  test.skip(!baseURL, "The isolated Today browser fixture URL is required.");
  const mutations = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST") mutations.push(url.pathname);
  });

  await openToday(page, `${baseURL}/#today`);
  await expect(page.locator("[data-today-page]")).toBeVisible();
  const onboarding = page.getByRole("button", { name:"Skip for now" });
  if (await onboarding.isVisible().catch(() => false)) await onboarding.click();
  const primary = page.locator('[data-today-answer="now"] [data-task-open]');
  await expect(primary).toBeVisible();
  await primary.click();

  const drawer = page.locator("[data-task-workbench]");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-task-title]")).toHaveText("Prepare the current Partner brief");
  await expect(drawer.getByText("Medium priority")).toBeVisible();

  await drawer.getByRole("button", { name:"Mark in progress" }).click();
  await expect(drawer.getByText("Task marked in progress.")).toBeVisible();
  await expect(drawer.locator("[data-task-status-chip]")).toHaveText("In progress");

  await drawer.locator('[data-task-form="waiting"] input').fill("Partner confirmation");
  await drawer.getByRole("button", { name:"Set waiting" }).click();
  await expect(drawer.getByText("Task marked waiting.")).toBeVisible();
  await expect(drawer.getByText("Waiting on: Partner confirmation")).toBeVisible();

  await drawer.locator('[data-task-form="blocked"] input').fill("Need the signed memo");
  await drawer.getByRole("button", { name:"Mark blocked" }).click();
  await expect(drawer.getByText("Task marked blocked.")).toBeVisible();
  await expect(drawer.getByText("Blocker: Need the signed memo")).toBeVisible();

  await drawer.locator('[data-task-form="snooze"] select').selectOption("1");
  await drawer.getByRole("button", { name:"Snooze" }).click();
  await expect(drawer.getByText("Task snoozed.")).toBeVisible();

  await drawer.locator('[data-task-form="due"] input').fill("2026-07-21");
  await drawer.getByRole("button", { name:"Change due date" }).click();
  await expect(drawer.getByText("Due date changed.")).toBeVisible();

  await drawer.locator('[data-task-form="priority"] select').selectOption("critical");
  await drawer.getByRole("button", { name:"Change priority" }).click();
  await expect(drawer.getByText("Priority changed.")).toBeVisible();
  await expect(drawer.getByText("Critical priority")).toBeVisible();

  await drawer.locator('[data-task-form="note"] textarea').fill("Draft reviewed with current relationship context.");
  await drawer.getByRole("button", { name:"Add note" }).click();
  await expect(drawer.getByText("Note added.")).toBeVisible();
  await expect(drawer.getByText("Draft reviewed with current relationship context.")).toBeVisible();

  await drawer.locator('[data-task-form="note"] textarea').fill("Follow-up completed manually.");
  await drawer.getByRole("button", { name:"Mark done" }).click();
  await expect(drawer.getByText("Task marked done.")).toBeVisible();
  await expect(drawer.getByText("Completion note: Follow-up completed manually.")).toBeVisible();
  await drawer.getByRole("button", { name:"Reopen" }).click();
  await expect(drawer.getByText("Task reopened.")).toBeVisible();

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    drawer:document.querySelector("[data-task-workbench]").scrollWidth - document.querySelector("[data-task-workbench]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.drawer).toBeLessThanOrEqual(0);

  await drawer.getByRole("button", { name:"Close", exact:true }).click();
  await page.goto(`${baseURL}/#inbox?group=needs-me&type=task`);
  await expect(page.locator("[data-inbox-page]")).toBeVisible();
  const taskRow = page.locator('[data-inbox-item][data-task-id="today-browser-now-task"]');
  await expect(taskRow).toBeVisible();
  await taskRow.getByRole("button", { name:/Open Prepare the current Partner brief/ }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-task-title]")).toHaveText("Prepare the current Partner brief");

  expect(new Set(mutations.filter((path) => path.includes("/tasks/"))))
    .toEqual(new Set(["/api/ui/tasks/today-browser-now-task/action"]));
  expect(mutations.filter((path) => /send|publish|release|launch|live-mode|heartbeat/i.test(path))).toEqual([]);
});
