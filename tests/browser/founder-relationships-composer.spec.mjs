import { expect, test } from "@playwright/test";

test("founder reviews a relationship, drafts a follow-up, and records the manual send", async ({ page, context }) => {
  test.slow();
  const baseURL = process.env.BROWSER_TEST_PARTNERS_BASE_URL;
  test.skip(!baseURL, "Partners browser server is required.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin:new URL(baseURL).origin });
  const mutations = [];
  page.on("request", (request) => {
    if (request.method() === "POST") mutations.push(new URL(request.url()).pathname);
  });

  await page.goto(`${baseURL}/#partners`);
  const onboarding = page.getByRole("button", { name:"Skip for now" });
  if (await onboarding.isVisible().catch(() => false)) await onboarding.click();
  await expect(page.locator("[data-partners-page]")).toBeVisible();
  await expect(page.getByRole("heading", { name:"Relationships", exact:true })).toBeVisible();
  await expect(page.getByText("Community Justice Network", { exact:true }).first()).toBeVisible();

  const relationship = page.locator("[data-relationship-row]", { hasText:"Community Justice Network" });
  await relationship.getByRole("button", { name:"Open relationship" }).click();
  const detail = page.locator("[data-relationship-drawer]");
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-relationship-title]")).toHaveText("Community Justice Network");
  await expect(detail.getByText("Taylor Example", { exact:true }).first()).toBeVisible();

  await detail.getByRole("button", { name:"Set next action", exact:true }).click();
  let actionPanel = detail.locator("[data-relationship-action-panel]");
  await actionPanel.getByLabel("Next action").fill("Confirm the pilot decision owner");
  await actionPanel.getByLabel("Follow-up date").fill("2026-08-05");
  await actionPanel.getByRole("button", { name:"Save", exact:true }).click();
  await expect(detail.getByText("Confirm the pilot decision owner", { exact:true }).first()).toBeVisible();

  await detail.getByRole("button", { name:"Complete next action", exact:true }).click();
  await expect(detail.getByRole("button", { name:"Complete next action", exact:true })).toBeHidden();

  await detail.getByRole("button", { name:"Add task", exact:true }).click();
  actionPanel = detail.locator("[data-relationship-action-panel]");
  await actionPanel.getByLabel("Task title").fill("Prepare pilot decision brief");
  await actionPanel.getByLabel("Description").fill("Summarize the open decision and recommended next step.");
  await actionPanel.getByLabel("Due date").fill("2026-08-04");
  await actionPanel.getByLabel("Priority").selectOption("high");
  await actionPanel.getByRole("button", { name:"Save", exact:true }).click();
  await expect(detail.getByRole("button", { name:"Prepare pilot decision brief", exact:true })).toBeVisible();

  await detail.getByRole("button", { name:"Log activity", exact:true }).click();
  actionPanel = detail.locator("[data-relationship-action-panel]");
  await actionPanel.getByLabel("Activity type").selectOption("meeting_completed");
  await actionPanel.getByLabel("What happened?").fill("Reviewed the pilot decision path together.");
  await actionPanel.getByRole("button", { name:"Save", exact:true }).click();
  await expect(detail.getByText("Reviewed the pilot decision path together.", { exact:true }).first()).toBeVisible();

  await detail.getByRole("button", { name:"Add note", exact:true }).click();
  actionPanel = detail.locator("[data-relationship-action-panel]");
  await actionPanel.getByLabel("Note").fill("Taylor prefers a concise decision memo before the next call.");
  await actionPanel.getByRole("button", { name:"Save", exact:true }).click();
  await expect(detail.getByText("Taylor prefers a concise decision memo before the next call.", { exact:true }).first()).toBeVisible();

  await detail.getByRole("button", { name:"Add or edit contact", exact:true }).click();
  actionPanel = detail.locator("[data-relationship-action-panel]");
  await actionPanel.getByLabel("Name").fill("Morgan Example");
  await actionPanel.getByLabel("Email").fill("morgan@example.com");
  await actionPanel.getByLabel("Role or title").fill("Program lead");
  await actionPanel.getByLabel("Primary contact").selectOption("false");
  await actionPanel.getByRole("button", { name:"Save", exact:true }).click();
  await expect(detail.getByText("Morgan Example", { exact:true }).first()).toBeVisible();

  await detail.getByRole("button", { name:"Add or edit contact", exact:true }).click();
  actionPanel = detail.locator("[data-relationship-action-panel]");
  await actionPanel.locator('select[name="contactId"]').selectOption({ label:"Morgan Example" });
  await actionPanel.getByLabel("Role or title").fill("Partnerships lead");
  await actionPanel.getByRole("button", { name:"Save", exact:true }).click();
  await expect(detail.getByText(/Partnerships lead/).first()).toBeVisible();

  await detail.getByRole("button", { name:"Change stage", exact:true }).click();
  actionPanel = detail.locator("[data-relationship-action-panel]");
  await actionPanel.getByLabel("Relationship stage").selectOption("active");
  await actionPanel.getByRole("button", { name:"Save", exact:true }).click();
  await expect(detail.locator('[data-relationship-chips]')).toContainText("Active");

  await detail.getByRole("button", { name:"Draft follow-up" }).click();
  const composer = page.locator("[data-communication-composer]");
  await expect(composer).toBeVisible();
  await expect(composer.locator('[name="recipient"]')).toHaveValue("taylor@example.com");
  await composer.locator('[name="subject"]').fill("Community access pilot next step");
  await composer.locator('[name="body"]').fill("Hi Taylor,\n\nThanks for reviewing the pilot scope. Could we confirm the decision date this week?\n\nBest,\nRoger");
  await composer.getByRole("button", { name:"Save draft" }).click();
  await expect(composer.getByText("Draft saved. Nothing was sent.")).toBeVisible();

  await composer.getByRole("button", { name:"Copy", exact:true }).click();
  await expect(composer.getByText("Draft copied.")).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("Community access pilot next step");

  await page.evaluate(() => {
    window.__founderGmailUrl = "";
    window.open = (url) => { window.__founderGmailUrl = String(url || ""); return null; };
  });
  await composer.getByRole("button", { name:"Open in Gmail" }).click();
  await expect(composer.getByText("Draft saved and opened in Gmail.")).toBeVisible();
  const gmail = new URL(await page.evaluate(() => window.__founderGmailUrl));
  expect(gmail.origin).toBe("https://mail.google.com");
  expect(gmail.searchParams.get("to")).toBe("taylor@example.com");

  await composer.getByRole("button", { name:"Mark as sent manually" }).click();
  await composer.locator('[name="nextFollowUpDate"]').fill("2026-07-30");
  await composer.getByRole("button", { name:"Record sent" }).click();
  await expect(composer.getByText("Sent interaction recorded. No email was sent by LegalEase.")).toBeVisible();

  await page.setViewportSize({ width:390, height:844 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    composer:document.querySelector("[data-communication-composer]").scrollWidth - document.querySelector("[data-communication-composer]").clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.composer).toBeLessThanOrEqual(0);

  await composer.getByLabel("Close message composer").click();
  await relationship.getByRole("button", { name:"Open relationship" }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name:"Add or edit contact", exact:true }).click();
  await expect(detail.locator("[data-relationship-action-panel]")).toBeVisible();
  const mobile = await page.evaluate(() => {
    const drawer = document.querySelector("[data-relationship-drawer]");
    const panel = document.querySelector("[data-relationship-action-panel]");
    const targets = [...document.querySelectorAll("[data-relationship-action-menu] button:not([hidden]), [data-relationship-action-panel] button")]
      .filter((target) => target.getClientRects().length);
    return {
      document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      drawer:drawer.scrollWidth - drawer.clientWidth,
      panel:panel.scrollWidth - panel.clientWidth,
      minimumTapHeight:Math.min(...targets.map((target) => target.getBoundingClientRect().height))
    };
  });
  expect(mobile.document).toBeLessThanOrEqual(0);
  expect(mobile.drawer).toBeLessThanOrEqual(0);
  expect(mobile.panel).toBeLessThanOrEqual(0);
  expect(mobile.minimumTapHeight).toBeGreaterThanOrEqual(44);

  expect(mutations).toContain("/api/ui/communications/drafts");
  expect(mutations.filter((path) => /\/api\/ui\/relationships\/[^/]+\/action$/.test(path))).toHaveLength(8);
  expect(mutations.some((path) => /\/api\/ui\/communications\/drafts\/[^/]+\/manual-sent$/.test(path))).toBe(true);
  expect(mutations.filter((path) => /send|publish|release|launch|live-mode|heartbeat/i.test(path)
    && !path.endsWith("/manual-sent"))).toEqual([]);
});
