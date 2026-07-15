import { expect, openToday, test } from "./support.mjs";

test("the local authenticated application and Today load", async ({ page }) => {
  await openToday(page);
  await expect(page.locator("main#app").getByText("Today at LegalEase", { exact:true })).toBeVisible();
  await expect(page).toHaveURL(/#today$/);
  await expect(page.getByRole("navigation", { name:"Primary" }).getByRole("link", { name:"Today", exact:true })).toHaveClass(/\bactive\b/);
});

test("the enabled vNext compatibility boundary remains usable", async ({ page }) => {
  const compatibilityURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(compatibilityURL, "The compatibility server URL must come from the isolated fixture.").toBeTruthy();
  await openToday(page, `${compatibilityURL}/#today`);
  await expect(page.locator("main#app").getByText("Today at LegalEase", { exact:true })).toBeVisible();
});
