import { expect, openToday, test } from "./support.mjs";

test("founder triages Support and turns Calendar events into internal work", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_DISCOVERY_BASE_URL;
  test.skip(!baseURL, "The isolated founder-operations fixture URL is required.");
  test.slow();
  const mutations = [];
  page.on("request", (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(new URL(request.url()).pathname);
  });

  await page.setViewportSize({ width:1440, height:900 });
  await openToday(page, `${baseURL}/#today`);
  const onboarding = page.locator("[data-discovery-onboarding]");
  if (await onboarding.isVisible()) {
    await onboarding.getByRole("button", { name:"Skip for now" }).click();
    await expect(onboarding).toBeHidden();
  }
  await page.getByRole("link", { name:"Support", exact:true }).click();
  await expect(page).toHaveURL(/#support$/);

  const support = page.locator("[data-founder-support-page]");
  await expect(support).toBeVisible();
  const issue = support.locator("[data-support-item]", { hasText:"Customer needs an intake status update" });
  await expect(issue).toBeVisible();
  await expect(issue).toContainText("New");

  await issue.getByRole("button", { name:"Draft response" }).click();
  const composer = page.locator("[data-communication-composer]");
  await expect(composer).toBeVisible();
  await expect(composer.locator('[name="subject"]')).toHaveValue("Re: Customer needs an intake status update");
  await composer.getByRole("button", { name:"Close message composer" }).click();

  await issue.getByText("More actions").click();
  await issue.getByRole("button", { name:"Set waiting status" }).click();
  const waitingForm = issue.locator('[data-support-inline="set_status"]');
  await waitingForm.locator('[name="status"]').selectOption("waiting_on_customer");
  await waitingForm.locator('[name="note"]').fill("Waiting for the synthetic customer to confirm their intake details.");
  await waitingForm.getByRole("button", { name:"Save waiting status" }).click();
  await expect(support.locator("[data-support-item]", { hasText:"Customer needs an intake status update" })).toContainText("Waiting on customer");

  let updatedIssue = support.locator("[data-support-item]", { hasText:"Customer needs an intake status update" });
  await updatedIssue.getByText("More actions").click();
  await updatedIssue.getByRole("button", { name:"Create task" }).click();
  const taskForm = updatedIssue.locator('[data-support-inline="create_task"]');
  await taskForm.getByRole("button", { name:"Create task" }).click();
  await expect(support.locator("[data-support-notice]")).toContainText(/task created/i);

  updatedIssue = support.locator("[data-support-item]", { hasText:"Customer needs an intake status update" });
  await updatedIssue.getByText("More actions").click();
  await updatedIssue.getByRole("button", { name:"Resolve" }).click();
  await expect(support.locator("[data-support-item]", { hasText:"Customer needs an intake status update" })).toContainText("Resolved");

  await page.getByRole("link", { name:"Calendar", exact:true }).click();
  await expect(page).toHaveURL(/#meetings$/);
  const calendar = page.locator("[data-founder-calendar-page]");
  await expect(calendar).toBeVisible();
  const event = calendar.locator("[data-calendar-event]", { hasText:"Partner workflow review" });
  await expect(event).toBeVisible();
  await expect(event.getByRole("link", { name:"Open in Google Calendar" })).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\//);

  await event.getByRole("button", { name:"Create preparation task" }).click();
  await expect(calendar.locator("[data-calendar-notice]")).toContainText(/task created/i);
  let updatedEvent = calendar.locator("[data-calendar-event]", { hasText:"Partner workflow review" });
  await expect(updatedEvent).toContainText(/Open tasks\s*1/);
  await updatedEvent.getByText("More actions").click();
  await updatedEvent.getByRole("button", { name:"Create post-meeting follow-up" }).click();
  await expect(calendar.locator("[data-calendar-notice]")).toContainText(/task created/i);
  updatedEvent = calendar.locator("[data-calendar-event]", { hasText:"Partner workflow review" });
  await expect(updatedEvent).toContainText(/Open tasks\s*2/);

  await calendar.getByRole("button", { name:"Plan a Google event" }).click();
  const planner = calendar.getByRole("dialog", { name:"Plan a new event" });
  await expect(planner).toBeVisible();
  await planner.locator('[name="title"]').fill("Synthetic Partner follow-up");
  await planner.locator('[name="details"]').fill("Review the next internal action before saving in Google Calendar.");
  await planner.getByRole("button", { name:"Prepare in Google Calendar" }).click();
  const prepared = planner.getByRole("link", { name:"Open event in Google Calendar" });
  await expect(prepared).toBeVisible();
  await expect(prepared).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  await planner.getByRole("button", { name:"Close event planner" }).click();

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    calendar:document.querySelector("[data-founder-calendar-page]").scrollWidth - document.querySelector("[data-founder-calendar-page]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.calendar).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name:"Open navigation" }).click();
  await page.getByRole("link", { name:"Support", exact:true }).click();
  await expect(page.locator("[data-founder-support-page]")).toBeVisible();
  const supportOverflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    support:document.querySelector("[data-founder-support-page]").scrollWidth - document.querySelector("[data-founder-support-page]").clientWidth
  }));
  expect(supportOverflow.document).toBeLessThanOrEqual(0);
  expect(supportOverflow.support).toBeLessThanOrEqual(0);

  expect(mutations).toContain("/api/ui/support/action");
  expect(mutations).toContain("/api/ui/calendar/action");
  expect(mutations).toContain("/api/ui/calendar/create-link");
  expect(mutations.filter((path) => /send|publish|release|launch|live-gate|heartbeat|morning-brief|calendar\/(?:insert|update|delete)/i.test(path))).toEqual([]);
});
