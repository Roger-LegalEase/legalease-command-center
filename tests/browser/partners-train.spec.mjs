import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { visualDocument, visualFixture, partnersHomePageHtml, partnerRecordPageHtml } from "../../scripts/partners-visual-harness.mjs";

const widths = [1440, 1280, 1024, 768, 390];

async function setFixture(page, html, width = 1440) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.setContent(visualDocument(html), { waitUntil:"domcontentloaded" });
}

test("Partners train preserves exact links, safe actions, history, and accessibility", async ({ page }) => {
  const fixture = visualFixture();
  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await setFixture(page, partnersHomePageHtml(fixture.home("list")));

  const partnerLink = page.getByRole("link", { name:"Open Partner: Community Justice Network" });
  await expect(partnerLink).toHaveAttribute("href", "#partners/partner/partner-community");
  await partnerLink.focus();
  await expect(partnerLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#partners\/partner\/partner-community$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/#partners\/partner\/partner-community$/);
  await page.goForward();
  await expect(page).toHaveURL(/#partners\/partner\/partner-community$/);

  await setFixture(page, partnerRecordPageHtml(fixture.record("outreach")));
  await expect(page.getByRole("link", { name:"Open Campaign: Community planning outreach" })).toHaveAttribute("href", "#outreach/campaign/campaign-community");
  await page.getByRole("button", { name:"Create outreach" }).click();
  await page.getByRole("button", { name:"Add file" }).click();
  expect(requests.filter((request) => !request.startsWith("GET about:"))).toEqual([]);

  await setFixture(page, partnerRecordPageHtml(fixture.record("files")));
  await expect(page.getByRole("link", { name:"Open File: Community scope brief" })).toHaveAttribute("href", "#files/data-room-item/file-partner-brief");
  await expect(page.getByRole("button", { name:"Create proposal" })).toBeVisible();
  const appliedRecord = fixture.record("outreach", fixture.scenario.state, fixture.scenario.newPartnerId);
  await setFixture(page, partnerRecordPageHtml(appliedRecord));
  await expect(page.getByText("Applied stage: In conversation", { exact:true })).toBeVisible();
  await expect(page.getByText("Applied", { exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Review and apply" })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("Partners train covers responsive and availability states without overflow", async ({ page }) => {
  const fixture = visualFixture();
  for (const width of widths) {
    await setFixture(page, partnersHomePageHtml(fixture.home("pipeline")), width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px home overflow`).toBeLessThanOrEqual(0);
    await setFixture(page, partnerRecordPageHtml(fixture.record("overview")), width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px record overflow`).toBeLessThanOrEqual(0);
  }
  await setFixture(page, partnersHomePageHtml(null));
  await expect(page.getByRole("status")).toContainText("Loading Partners");
  await setFixture(page, partnersHomePageHtml(fixture.empty));
  await expect(page.getByRole("heading", { name:"No Partners yet" })).toBeVisible();
  await setFixture(page, partnersHomePageHtml(fixture.filteredEmpty));
  await expect(page.getByRole("heading", { name:"No Partners match these filters" })).toBeVisible();
  await setFixture(page, partnersHomePageHtml({ available:false }));
  await expect(page.getByRole("alert")).toContainText("Partners are unavailable");
  await setFixture(page, partnerRecordPageHtml({ available:false }));
  await expect(page.getByRole("alert")).toContainText("not found or this account cannot view");
  await page.setContent(visualDocument('<section role="alert"><h1>Session expired</h1><p>Sign in again. No changes were made.</p></section>'));
  await expect(page.getByRole("heading", { name:"Session expired" })).toBeVisible();
});
