import { expect, openToday, test } from "./support.mjs";

test("the local authenticated application and Today load", async ({ page }) => {
  await openToday(page);
  await expect(page.locator("main#app").getByText("Today at LegalEase", { exact:true })).toBeVisible();
  await expect(page).toHaveURL(/#today$/);
  await expect(page.getByRole("navigation", { name:"Primary" }).getByRole("link", { name:"Today", exact:true })).toHaveClass(/\bactive\b/);
});

test("the enabled vNext desktop shell remains usable", async ({ page }) => {
  const vnextURL = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(vnextURL, "The vNext server URL must come from the isolated fixture.").toBeTruthy();
  await openToday(page, `${vnextURL}/#today`);
  await expect(page.locator("[data-today-page]").getByRole("heading", { name:"Today", exact:true })).toBeVisible();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
});
