import { expect, openToday, test } from "./support.mjs";

const workflows = [
  ["BROWSER_TEST_TODAY_BASE_URL", "today", "Today"],
  ["BROWSER_TEST_ACTIONS_BASE_URL", "inbox?group=needs-me", "Inbox"],
  ["BROWSER_TEST_SOCIAL_BASE_URL", "social?view=ideas", "Social"],
  ["BROWSER_TEST_OUTREACH_BASE_URL", "outreach", "Outreach"],
  ["BROWSER_TEST_PARTNERS_BASE_URL", "partners", "Partners"],
  ["BROWSER_TEST_FILES_BASE_URL", "files", "Files"],
  ["BROWSER_TEST_FILES_BASE_URL", "files?collection=investor-room", "Investor Room"]
];

test("production-like primary workflows render without white screens or external authority", async ({ page }) => {
  test.setTimeout(90_000);
  for (const [environment, hash, heading] of workflows) {
    const baseURL = process.env[environment];
    await openToday(page, `${baseURL}/#${hash}`);
    await expect(page.locator("main#app").getByRole("heading", { name:heading, level:1 })).toBeVisible();
    await expect(page.locator("main#app")).not.toBeEmpty();
    await expect(page.getByText(/LegalEase did not finish rendering/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name:"Recovery Mode" })).toHaveCount(0);
  }
  const state = await page.request.get(`${process.env.BROWSER_TEST_VNEXT_BASE_URL}/api/state`).then((response) => response.json());
  const livePostingGates = Object.values(state.runtime?.livePostingGates || {});
  expect(livePostingGates.length).toBeGreaterThan(0);
  expect(livePostingGates.every((gate) => gate?.enabled === false)).toBe(true);
});

test("unauthorized access fails closed while aliases and exact object links remain usable", async ({ page }) => {
  const restricted = process.env.BROWSER_TEST_RESTRICTED_BASE_URL;
  const unauthorized = await page.request.get(`${restricted}/api/ui/today`);
  expect(unauthorized.status()).toBe(401);

  const vnext = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  await openToday(page, `${vnext}/#proof`);
  await expect(page.locator("[data-shell-current-context]")).toHaveText("Files");
  await expect(page.locator("main#app")).not.toBeEmpty();

  await openToday(page, `${process.env.BROWSER_TEST_PARTNERS_BASE_URL}/#partners/partner/partner-community`);
  await expect(page).toHaveURL(/#partners\/partner\/partner-community$/);
  await expect(page.getByRole("heading", { name:"Community Justice Network", level:1 })).toBeVisible();
});
