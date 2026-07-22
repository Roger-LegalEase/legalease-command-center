import { expect, openToday, test } from "./support.mjs";

test("founder plans and records a weekly Social campaign without posting", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_FOUNDER_SOCIAL_BASE_URL;
  test.skip(!baseURL, "The isolated Social browser fixture URL is required.");
  test.slow();

  const mutations = [];
  page.on("request", (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(new URL(request.url()).pathname);
  });

  await page.setViewportSize({ width:1440, height:900 });
  await page.clock.setFixedTime(new Date("2026-07-21T14:00:00.000Z"));
  await openToday(page, `${baseURL}/#social?view=weekly`);

  const planner = page.locator("[data-social-weekly-planner]");
  await expect(planner).toBeVisible();
  await expect(page.getByRole("tab", { name:"Weekly plan" })).toHaveAttribute("aria-selected", "true");
  await expect(planner.getByText("Nothing is posted automatically.")).toBeVisible();
  await expect(planner.locator("[data-weekly-create]")).toBeVisible();
  for (const platform of ["LinkedIn", "Instagram", "Facebook", "X", "Threads"]) {
    await expect(planner.getByText(platform, { exact:true }).first()).toBeVisible();
  }

  await planner.locator('[name="objective"]').fill("Turn one founder insight into useful Partner conversations.");
  await planner.locator('[name="theme1"]').fill("Founder operations");
  await planner.locator('[name="theme2"]').fill("Partner clarity");
  await planner.getByText("Add the material worth turning into content").click();
  await planner.locator('[name="proof"]').fill("A synthetic Partner handoff kept its next step visible.");

  const drafts = planner.locator("[data-create-draft]");
  await expect(drafts).toHaveCount(3);
  const first = drafts.nth(0);
  await first.locator('[name="draftTitle"]').fill("A calmer founder follow-up");
  await first.locator('[name="draftStatus"]').selectOption("ready");
  await first.locator('[data-draft-channel][value="instagram"]').check();
  const linkedInCreate = first.locator('[data-variant-editor="linkedin"]');
  const instagramCreate = first.locator('[data-variant-editor="instagram"]');
  await linkedInCreate.locator("summary").click();
  await linkedInCreate.locator('[data-variant-field="body"]').fill("LinkedIn founder note: keep the relationship, owner, and next move together.");
  await instagramCreate.locator("summary").click();
  await instagramCreate.locator('[data-variant-field="body"]').fill("Instagram checklist: one relationship, one owner, one clear next move.");
  await drafts.nth(1).locator('[name="draftTitle"]').fill("What useful context looks like");
  await drafts.nth(2).locator('[name="draftTitle"]').fill("A weekly reset for founder focus");

  await planner.getByRole("button", { name:"Save weekly plan" }).click();
  await expect(planner.getByText(/Weekly Social plan saved/)).toBeVisible();
  await expect(planner.locator("[data-plan-post]")).toHaveCount(3);
  const saved = planner.locator("[data-plan-post]", { hasText:"A calmer founder follow-up" });
  await expect(saved).toContainText("LinkedIn · Instagram");

  await planner.getByRole("button", { name:"Copy all drafts" }).click();
  await expect(planner.locator("[data-weekly-notice]")).toContainText(/All weekly drafts copied|Copy was unavailable/);
  const downloadPromise = page.waitForEvent("download");
  await planner.getByRole("button", { name:"Export Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^social-plan-.*\.md$/);
  await expect(planner.locator("[data-weekly-notice]")).toContainText("Markdown plan exported.");

  let firstSaved = planner.locator("[data-plan-post]", { hasText:"A calmer founder follow-up" });
  await firstSaved.getByText("Record a manually published URL").click();
  await firstSaved.locator('[name="channel"]').selectOption("linkedin");
  await firstSaved.locator('[name="publishedUrl"]').fill("https://www.linkedin.com/posts/synthetic-founder-plan");
  await firstSaved.getByRole("button", { name:"Record URL" }).click();
  await expect(planner.locator("[data-weekly-notice]")).toContainText(/recorded/i);

  firstSaved = planner.locator("[data-plan-post]", { hasText:"A calmer founder follow-up" });
  await firstSaved.getByText("Record a manually published URL").click();
  await firstSaved.locator('[name="channel"]').selectOption("instagram");
  await firstSaved.locator('[name="publishedUrl"]').fill("https://www.instagram.com/p/synthetic-founder-plan");
  await firstSaved.getByRole("button", { name:"Record URL" }).click();
  await expect(planner.locator("[data-plan-post]", { hasText:"A calmer founder follow-up" })).toContainText("Needs results");

  firstSaved = planner.locator("[data-plan-post]", { hasText:"A calmer founder follow-up" });
  await firstSaved.locator('[name="impressions"]').fill("1250");
  await firstSaved.locator('[name="comments"]').fill("7");
  await firstSaved.getByRole("button", { name:"Save results" }).click();
  await expect(planner.locator("[data-plan-post]", { hasText:"A calmer founder follow-up" })).toContainText("Published manually");

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    planner:document.querySelector("[data-social-weekly-planner]").scrollWidth - document.querySelector("[data-social-weekly-planner]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.planner).toBeLessThanOrEqual(0);

  expect(mutations).toContain("/api/ui/social/weekly");
  expect(mutations).toContain("/api/ui/social/weekly/export");
  expect(mutations.some((path) => path.endsWith("/manual-publication"))).toBe(true);
  expect(mutations.some((path) => path.endsWith("/results"))).toBe(true);
  expect(mutations.filter((path) => /send|\/publish(?:$|\/)|release|launch|live-gate|heartbeat|morning-brief/i.test(path))).toEqual([]);
});
