import { expect, openToday, test } from "./support.mjs";

test("visible navigation keeps Today and the current Social workspace synchronized", async ({ page }) => {
  await openToday(page);
  const navigation = page.getByRole("navigation", { name:"Primary" });
  const today = navigation.getByRole("link", { name:"Today", exact:true });
  const socialWorkspace = navigation.getByRole("link", { name:"Review Desk", exact:true });

  await socialWorkspace.click();
  await expect(page).toHaveURL(/#queue$/);
  await expect(socialWorkspace).toHaveClass(/\bactive\b/);
  await expect(page.locator("main#app").getByRole("heading", { name:"Review Desk", level:1 })).toBeVisible();
  await expect(page.locator("main#app").locator(".wizard-shell")).toBeVisible();

  await today.click();
  await expect(page).toHaveURL(/#today$/);
  await expect(today).toHaveClass(/\bactive\b/);
  await expect(page.locator("main#app").getByText("Today at LegalEase", { exact:true })).toBeVisible();
});
