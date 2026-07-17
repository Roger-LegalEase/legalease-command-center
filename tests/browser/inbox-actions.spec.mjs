import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  allowExpectedConsoleError,
  allowExpectedCriticalResponse,
  authenticateRestricted,
  expect,
  openToday,
  test
} from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-202");
const actionURL = () => process.env.BROWSER_TEST_ACTIONS_BASE_URL;

test.describe.configure({ mode:"serial" });

function repeatedValue(value, testInfo) {
  if (testInfo.repeatEachIndex !== 1) return value;
  return String(value).replace(/-001$/, "-002");
}

function repeatedTitle(value, testInfo) {
  return testInfo.repeatEachIndex === 1 ? `${value} (repeat fixture)` : value;
}

async function openActionInbox(page, { width = 1440, hash = "inbox?group=needs-me" } = {}) {
  expect(actionURL()).toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-17T12:00:00-04:00"));
  await openToday(page, `${actionURL()}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  await expect(page.locator("[data-inbox-page]")).toBeVisible();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
}

function rowWithTitle(page, title) {
  return page.locator("[data-inbox-item]").filter({ has:page.getByRole("heading", { name:title, exact:true }) });
}

async function readState(page, baseURL = actionURL()) {
  const response = await page.request.get(`${baseURL}/api/state`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function endpointPage(page, query = "group=needs-me&limit=40") {
  const response = await page.request.get(`${actionURL()}/api/ui/inbox?${query}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function expectNoOverflow(page, width) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body:document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document, `${width}px document overflow`).toBeLessThanOrEqual(0);
  expect(overflow.body, `${width}px body overflow`).toBeLessThanOrEqual(0);
}

async function seriousViolations(page) {
  const result = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
}

test("Inbox renders only server-declared actions while Open remains exact navigation without mutation", async ({ page }, testInfo) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const mutations = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(new URL(request.url()).pathname);
  });
  await openActionInbox(page);
  await expect(page.getByRole("heading", { name:"Inbox", level:1 })).toBeVisible();
  await expect(rowWithTitle(page, repeatedTitle("Fulton County post needs two fixes", testInfo)).getByRole("button", { name:/^Approve / })).toBeVisible();
  await expect(rowWithTitle(page, repeatedTitle("Complete the reviewed support follow-up", testInfo)).getByRole("button", { name:/^Complete / })).toBeVisible();
  await expect(rowWithTitle(page, repeatedTitle("Revisit the meeting brief", testInfo)).getByRole("button", { name:/^Snooze / })).toBeVisible();
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-actions-1440.png"), animations:"disabled" });

  await page.evaluate(() => { location.hash = "inbox?group=needs-me&type=campaign"; });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  const campaign = rowWithTitle(page, "July Partner outreach campaign");
  await expect(campaign).toHaveCount(1);
  await expect(campaign.locator("[data-inbox-action]")).toHaveCount(0);
  await expect(campaign.getByRole("link", { name:/^Open / })).toBeVisible();
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-open-only-1440.png"), animations:"disabled" });
  await campaign.getByRole("link", { name:/^Open / }).click();
  await expect(page).toHaveURL(/#outreach\/campaign\/browser-inbox-campaign-001$/);
  expect(mutations).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#inbox\?group=needs-me&type=campaign$/);
});

test("Approve confirms its limited consequence, creates one authoritative decision, and double activation stays idempotent", async ({ page }, testInfo) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const actionRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/ui/inbox/action") actionRequests.push(request.postDataJSON());
  });
  await openActionInbox(page, { hash:"inbox?group=needs-me&type=social" });
  const payloadBefore = await endpointPage(page, "group=needs-me&type=social&limit=40");
  const stateBefore = await readState(page);
  const row = rowWithTitle(page, repeatedTitle("Fulton County post needs two fixes", testInfo));
  await row.getByRole("button", { name:/^Approve / }).click();
  const dialog = page.locator("[data-inbox-action-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name:"Approve this item?" })).toBeVisible();
  await expect(dialog).toContainText("does not send, publish, launch, or release anything");
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-approve-confirmation-1440.png"), animations:"disabled" });
  await dialog.getByRole("button", { name:"Approve" }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Approval recorded");
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  expect(actionRequests).toHaveLength(1);
  expect(Object.keys(actionRequests[0]).sort()).toEqual(["expectedUpdatedAt", "inboxItemId", "intent", "requestId"]);
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-action-success-1440.png"), animations:"disabled" });

  const stateAfter = await readState(page);
  const approvalId = repeatedValue("browser-inbox-approval-001", testInfo);
  const postId = repeatedValue("browser-inbox-post-001", testInfo);
  const approvalBefore = stateBefore.approvals.find((item) => item.id === approvalId);
  const approvalAfter = stateAfter.approvals.find((item) => item.id === approvalId);
  expect(approvalBefore.state).toBe("requested");
  expect(approvalAfter.state).toBe("approved");
  expect(stateAfter.approvals.filter((item) => item.id === approvalAfter.id)).toHaveLength(1);
  expect((stateAfter.companyEvents || []).length - (stateBefore.companyEvents || []).length).toBe(1);
  expect(stateAfter.posts.find((item) => item.id === postId).status).toBe("needs_review");
  expect(stateAfter.campaigns).toEqual(stateBefore.campaigns);

  const repeated = await page.request.post(`${actionURL()}/api/ui/inbox/action`, { data:actionRequests[0] });
  expect(repeated.ok()).toBe(true);
  expect((await repeated.json()).alreadyApplied).toBe(true);
  const stateRepeated = await readState(page);
  expect(stateRepeated.approvals.length).toBe(stateAfter.approvals.length);
  expect((stateRepeated.companyEvents || []).length).toBe((stateAfter.companyEvents || []).length);
  const payloadAfter = await endpointPage(page, "group=needs-me&type=social&limit=40");
  expect(payloadAfter.counts.needsMe).toBe(payloadBefore.counts.needsMe - 1);
  await expect(page.locator("[data-shell-inbox-count]").first()).toHaveText(String(payloadAfter.counts.needsMe));

  const metrics = await page.evaluate(() => ({ ...window.__LE_INBOX_ACTION_METRICS }));
  expect(metrics.duplicateActivations).toBeLessThanOrEqual(1);
  expect(metrics.successfulTransitions).toBe(1);
  console.log("CCX202_APPROVAL_METRICS", JSON.stringify({
    response:metrics.byIntent.approve[0],
    actionRequests:actionRequests.length,
    duplicateTransitions:0,
    approvalRecordsCreated:0,
    approvalRecordsUpdated:1,
    companyEventsCreated:1,
    inboxRefreshRequests:metrics.inboxRefreshRequests,
    badgeRefreshRequests:metrics.badgeRefreshRequests,
    fullStateRequestsCausedByAction:metrics.fullStateRequests
  }));
});

test("Task completion shows Working, performs one Task transition, and refreshes counts without broad writes", async ({ page }, testInfo) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openActionInbox(page, { hash:"inbox?group=needs-me&type=task" });
  const before = await readState(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/ui/inbox/action", async (route) => {
    await gate;
    await route.continue();
  });
  const row = rowWithTitle(page, repeatedTitle("Finish the Partner launch checklist", testInfo));
  const complete = row.getByRole("button", { name:/^Complete / });
  await complete.click();
  await expect(complete).toHaveText("Working…");
  await expect(complete).toBeDisabled();
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-complete-working-1440.png"), animations:"disabled" });
  release();
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Task marked complete");
  await page.unroute("**/api/ui/inbox/action");
  const after = await readState(page);
  expect(after.tasks.find((item) => item.id === repeatedValue("browser-inbox-task-001", testInfo)).status).toBe("done");
  expect((after.auditHistory || []).length - (before.auditHistory || []).length).toBe(1);
  expect((after.activityEvents || []).length - (before.activityEvents || []).length).toBe(1);
  expect(after.partners).toEqual(before.partners);
  expect(after.posts).toEqual(before.posts);
  const metrics = await page.evaluate(() => ({ ...window.__LE_INBOX_ACTION_METRICS }));
  console.log("CCX202_TASK_COMPLETE_METRICS", JSON.stringify({
    response:metrics.byIntent.complete[0],
    sourceTransitions:1,
    auditEvents:1,
    activityEvents:1,
    inboxRefreshRequests:metrics.inboxRefreshRequests,
    badgeRefreshRequests:metrics.badgeRefreshRequests,
    fullStateRequestsCausedByAction:metrics.fullStateRequests
  }));
});

test("Queue completion, dated snooze, safe failure retry, and stale two-tab state preserve authoritative truth", async ({ page, context }, testInfo) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openActionInbox(page, { hash:"inbox?group=needs-me&type=decision" });
  const before = await readState(page);
  const completionRow = rowWithTitle(page, repeatedTitle("Complete the reviewed support follow-up", testInfo));
  await completionRow.getByRole("button", { name:/^Complete / }).click();
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Item marked complete");

  const snoozeRow = rowWithTitle(page, repeatedTitle("Revisit the meeting brief", testInfo));
  await snoozeRow.getByRole("button", { name:/^Snooze / }).click();
  const snoozeDialog = page.locator("[data-inbox-action-dialog]");
  await expect(snoozeDialog.getByRole("heading", { name:"Snooze this item" })).toBeVisible();
  await expect(snoozeDialog.getByLabel("Tomorrow")).toBeChecked();
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-snooze-dialog-1440.png"), animations:"disabled" });
  await snoozeDialog.getByRole("button", { name:"Snooze" }).click();
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Item snoozed");

  let failedOnce = false;
  await page.route("**/api/ui/inbox/action", async (route) => {
    const body = route.request().postDataJSON();
    if (!failedOnce && String(body.inboxItemId).includes(repeatedValue("browser-action-queue-failure-001", testInfo))) {
      failedOnce = true;
      allowExpectedCriticalResponse(page, "/api/ui/inbox/action");
      allowExpectedConsoleError(page, /Failed to load resource.*503/i);
      await route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ ok:false, outcome:"temporary_failure", message:"redacted" }) });
      return;
    }
    await route.continue();
  });
  const failureRow = rowWithTitle(page, repeatedTitle("Retry the temporary follow-up update", testInfo));
  await failureRow.getByRole("button", { name:/^Complete / }).click();
  await expect(failureRow.locator("[data-inbox-item-action-status]")).toContainText("No records were changed");
  await expect(failureRow.getByRole("button", { name:"Try again" })).toBeVisible();
  await expect(failureRow.getByRole("button", { name:/^Complete / })).toBeEnabled();
  await expect(failureRow.getByRole("button", { name:/^Complete / })).toHaveText("Complete");
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-action-failure-1440.png"), animations:"disabled" });
  await failureRow.getByRole("button", { name:"Try again" }).click();
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Item marked complete");
  await page.unroute("**/api/ui/inbox/action");

  const second = await context.newPage();
  await openActionInbox(second, { hash:"inbox?group=needs-me&type=decision" });
  const staleRowSecond = rowWithTitle(second, repeatedTitle("Resolve the two-tab report review", testInfo));
  const staleItemId = await staleRowSecond.getAttribute("data-inbox-item-id");
  const staleVersion = await staleRowSecond.getAttribute("data-inbox-item-version");
  const staleRowFirst = rowWithTitle(page, repeatedTitle("Resolve the two-tab report review", testInfo));
  await staleRowFirst.getByRole("button", { name:/^Snooze / }).click();
  await page.locator("[data-inbox-action-dialog]").getByRole("button", { name:"Snooze" }).click();
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Item snoozed");
  const staleResponse = await second.request.post(`${actionURL()}/api/ui/inbox/action`, {
    data:{
      inboxItemId:staleItemId,
      intent:"complete",
      requestId:"two-tab-stale-request-001",
      expectedUpdatedAt:staleVersion
    }
  });
  expect(staleResponse.status()).toBe(409);
  expect(await staleResponse.json()).toMatchObject({ ok:false, outcome:"stale" });
  await second.close();

  const after = await readState(page);
  expect(after.queueItems.find((item) => item.id === repeatedValue("browser-action-queue-complete-001", testInfo)).status).toBe("completed");
  expect(after.queueItems.find((item) => item.id === repeatedValue("browser-action-queue-snooze-001", testInfo)).status).toBe("snoozed");
  expect(after.queueItems.find((item) => item.id === repeatedValue("browser-action-queue-snooze-001", testInfo)).snoozedUntil).toMatch(/^2026-07-18T23:59:59\.999-04:00$/);
  expect(after.queueItems.find((item) => item.id === repeatedValue("browser-action-queue-stale-001", testInfo)).status).toBe("snoozed");
  expect(after.queueItems.find((item) => item.id === repeatedValue("browser-action-queue-failure-001", testInfo)).status).toBe("completed");
  expect((after.companyEvents || []).length - (before.companyEvents || []).length).toBe(4);
  const metrics = await page.evaluate(() => ({ ...window.__LE_INBOX_ACTION_METRICS }));
  console.log("CCX202_QUEUE_ACTION_METRICS", JSON.stringify({
    completeResponse:metrics.byIntent.complete[0],
    snoozeResponse:metrics.byIntent.snooze[0],
    successfulSourceTransitions:4,
    companyEventsCreated:4,
    staleTransitions:0,
    inboxRefreshRequests:metrics.inboxRefreshRequests,
    badgeRefreshRequests:metrics.badgeRefreshRequests,
    fullStateRequestsCausedByAction:metrics.fullStateRequests
  }));
});

test("guessed hidden actions disclose nothing and session expiration closes action UI and clears the badge", async ({ page }, testInfo) => {
  test.slow();
  const restrictedURL = await authenticateRestricted(page);
  const csrf = (await page.context().cookies(restrictedURL)).find((cookie) => cookie.name === "leos_csrf")?.value || "";
  const hiddenResponse = await page.request.post(`${restrictedURL}/api/ui/inbox/action`, {
    headers:{ "x-csrf-token":csrf },
    data:{
      inboxItemId:"inbox:decision:decision%3Aqueue%3Abrowser-action-queue-hidden-001%3Adecision",
      intent:"approve",
      requestId:"guessed-hidden-request-001",
      expectedUpdatedAt:"2026-07-17T15:00:00.000Z"
    }
  });
  const hiddenResult = { status:hiddenResponse.status(), body:await hiddenResponse.json() };
  expect(hiddenResult.status).toBe(404);
  expect(JSON.stringify(hiddenResult.body)).not.toMatch(/Confidential|owner action|queueItems|manage_|capability/);

  await page.context().clearCookies();
  await openActionInbox(page, { hash:"inbox?group=needs-me&type=social" });
  const mobile = rowWithTitle(page, repeatedTitle("Mobile approval review", testInfo));
  await mobile.getByRole("button", { name:/^Approve / }).click();
  await expect(page.locator("[data-inbox-action-dialog]")).toBeVisible();
  await page.route("**/api/ui/inbox/action", async (route) => {
    allowExpectedCriticalResponse(page, "/api/ui/inbox/action");
    allowExpectedConsoleError(page, /Failed to load resource.*401/i);
    await route.fulfill({ status:401, contentType:"application/json", body:JSON.stringify({ ok:false, outcome:"session_expired", message:"Session ended." }) });
  });
  await page.locator("[data-inbox-action-dialog]").getByRole("button", { name:"Approve" }).click();
  await expect(page.locator("[data-inbox-action-dialog]")).not.toBeVisible();
  await expect(page.locator("[data-vnext-shell-state='session_expired']")).toBeVisible();
  await expect(page.locator("[data-shell-inbox-count]").first()).toBeHidden();
  await expect(page.locator("[data-inbox-item]")).toHaveCount(0);
});

test("mobile confirmation and snooze remain accessible, focused, utility-safe, and overflow-free", async ({ page }, testInfo) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  await openActionInbox(page, { width:390, hash:"inbox?group=needs-me&type=social" });
  const approval = rowWithTitle(page, repeatedTitle("Mobile approval review", testInfo));
  const approvalTrigger = approval.getByRole("button", { name:/^Approve / });
  await approvalTrigger.click();
  const dialog = page.locator("[data-inbox-action-dialog]");
  await expect(dialog).toBeVisible();
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-approve-confirmation-390.png"), animations:"disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(approvalTrigger).toBeFocused();

  await page.evaluate(() => { location.hash = "inbox?group=needs-me&type=decision"; });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  const snooze = rowWithTitle(page, repeatedTitle("Mobile snooze review", testInfo));
  await snooze.getByRole("button", { name:/^Snooze / }).click();
  await expect(dialog).toBeVisible();
  if (testInfo.repeatEachIndex === 0) await page.screenshot({ path:path.join(screenshotDirectory, "inbox-snooze-dialog-390.png"), animations:"disabled" });
  await expectNoOverflow(page, 390);
  const violations = await seriousViolations(page);
  expect(violations).toEqual([]);
  await page.keyboard.press("Escape");
  for (const width of [1440, 1024, 768, 390]) await expectNoOverflow(page, width);
  await expect(page.getByRole("button", { name:"Search", exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Create", exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Profile" })).toBeVisible();
  await expect(page.locator('[data-shell-action="open-lee"]')).toHaveCount(1);
  console.log("CCX202_ACCESSIBILITY", JSON.stringify({ serious:0, critical:0, consoleErrors:0, pageErrors:0, overflow:[1440, 1024, 768, 390] }));
});

test("legacy flag-off behavior has no Inbox action adapter", async ({ page }) => {
  const legacyURL = process.env.BROWSER_TEST_BASE_URL;
  await page.goto(`${legacyURL}/#inbox`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("[data-inbox-action]")).toHaveCount(0);
  const response = await page.request.post(`${legacyURL}/api/ui/inbox/action`, {
    data:{ inboxItemId:"none", intent:"complete", requestId:"legacy-action-001", expectedUpdatedAt:"2026-07-17T00:00:00.000Z" }
  });
  expect(response.status()).toBe(404);
});
