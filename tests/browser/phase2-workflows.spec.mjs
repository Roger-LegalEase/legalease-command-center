import AxeBuilder from "@axe-core/playwright";

import {
  allowExpectedConsoleError,
  allowExpectedCriticalResponse,
  expect,
  openToday,
  test
} from "./support.mjs";

const FIXED_TIME = new Date("2026-07-17T12:00:00-04:00");
const phase2URL = () => process.env.BROWSER_TEST_PHASE2_BASE_URL;

test.describe.configure({ mode:"serial" });

function repeatedValue(value, testInfo) {
  if (testInfo.repeatEachIndex !== 1) return value;
  return String(value).replace(/-001$/, "-002");
}

function repeatedTitle(value, testInfo) {
  return testInfo.repeatEachIndex === 1 ? `${value} (repeat fixture)` : value;
}

function exactHashPattern(href) {
  return new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

async function openPhase2(page, hash = "today", width = 1440) {
  expect(phase2URL(), "The isolated Phase 2 browser fixture URL is required.").toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_TIME);
  await openToday(page, `${phase2URL()}/#${hash}`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return phase2URL();
}

async function readState(page, baseURL = phase2URL()) {
  const response = await page.request.get(`${baseURL}/api/state`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function readInbox(page, query = "group=needs-me&limit=40", baseURL = phase2URL()) {
  const response = await page.request.get(`${baseURL}/api/ui/inbox?${query}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

function rowWithTitle(page, title) {
  return page.locator("[data-inbox-item]").filter({ has:page.getByRole("heading", { name:title, exact:true }) });
}

async function expectNoOverflow(page, width, surface) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  const overflow = await page.evaluate(() => ({
    document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body:document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document, `${surface} document overflow at ${width}px`).toBeLessThanOrEqual(0);
  expect(overflow.body, `${surface} body overflow at ${width}px`).toBeLessThanOrEqual(0);
  return Math.max(overflow.document, overflow.body, 0);
}

async function severeAxeFindings(page, width, surface) {
  const result = await new AxeBuilder({ page })
    .include("body")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const findings = result.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact))
    .map((violation) => ({
      id:violation.id,
      impact:violation.impact,
      help:violation.help,
      nodes:violation.nodes.map((node) => ({ target:node.target, failureSummary:node.failureSummary }))
    }));
  if (findings.length) console.error("CCX206_AXE_FINDINGS", JSON.stringify({ surface, width, findings }));
  return {
    surface,
    width,
    serious:findings.filter((finding) => finding.impact === "serious").length,
    critical:findings.filter((finding) => finding.impact === "critical").length
  };
}

function safetySnapshot(state) {
  return structuredClone({
    campaigns:state.campaigns,
    partners:state.partners,
    dataRoomItems:state.dataRoomItems,
    approvalQueue:state.approvalQueue,
    publishEvents:state.publishEvents,
    outreachSuppressions:state.outreachSuppressions,
    reactivationCampaign:state.reactivationCampaign,
    autopilotSettings:state.autopilotSettings,
    livePostingGates:state.runtime?.livePostingGates,
    liveGatesCount:state.runtime?.liveGatesCount
  });
}

test("Today, Inbox actions, and Quick Capture form one exact, duplicate-safe founder workflow", async ({ page }, testInfo) => {
  test.slow();
  const requestCounts = {
    bootOrFullState:0,
    today:0,
    inbox:0,
    inboxActions:0,
    quickCapture:0,
    routeAccess:0
  };
  const mutationPaths = [];
  const prohibitedActionPaths = [];
  const actionBodies = [];
  const captureBodies = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["/api/boot-state", "/api/state"].includes(url.pathname)) requestCounts.bootOrFullState += 1;
    if (url.pathname === "/api/ui/today") requestCounts.today += 1;
    if (url.pathname === "/api/ui/inbox") requestCounts.inbox += 1;
    if (url.pathname === "/api/ui/route-access") requestCounts.routeAccess += 1;
    if (url.pathname === "/api/ui/inbox/action") {
      requestCounts.inboxActions += 1;
      actionBodies.push(request.postDataJSON());
    }
    if (url.pathname === "/api/ui/quick-capture" && request.method() === "POST") {
      requestCounts.quickCapture += 1;
      captureBodies.push(request.postDataJSON());
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutationPaths.push(url.pathname);
    if (/send|publish|launch|release|resume|enroll|provider|partner.*stage|file.*status|suppression|live-gate/i.test(url.pathname)) {
      prohibitedActionPaths.push(url.pathname);
    }
  });

  const baseURL = await openPhase2(page);
  await expect(page.locator("[data-today-page]")).toBeVisible();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  const fullStateAtReady = requestCounts.bootOrFullState;
  const initialState = await readState(page);
  const initialSafety = safetySnapshot(initialState);
  const initialToday = await page.request.get(`${baseURL}/api/ui/today`).then((response) => response.json());

  const sections = page.locator("[data-today-answer]");
  expect(await sections.evaluateAll((nodes) => nodes.map((node) => node.dataset.todayAnswer))).toEqual([
    "now", "next", "needs-you", "progress"
  ]);
  const nowLink = page.locator('[data-today-answer="now"] .vnext-today-primary-action');
  const nowHref = await nowLink.getAttribute("href");
  expect(nowHref).toBe(initialToday.nowItem.href);
  expect(["Start", "Resume"]).toContain((await nowLink.textContent()).trim());
  const mutationsBeforeStart = mutationPaths.length;
  await nowLink.click();
  await expect(page).toHaveURL(exactHashPattern(nowHref));
  await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
  expect(mutationPaths).toHaveLength(mutationsBeforeStart);
  await page.goBack();
  await expect(page.locator("[data-today-page]")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(exactHashPattern(nowHref));
  await page.goBack();
  await expect(page.locator("[data-today-page]")).toBeVisible();

  await page.locator('[data-shell-destination="Inbox"]').first().click();
  await expect(page.locator("[data-inbox-page]")).toBeVisible();
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => { location.hash = "inbox?group=needs-me&type=social"; });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  const socialTitle = repeatedTitle("Fulton County post needs two fixes", testInfo);
  const socialRow = rowWithTitle(page, socialTitle);
  await expect(socialRow).toHaveCount(1);
  const sourceLink = socialRow.getByRole("link", { name:new RegExp(`^Open ${socialTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} in Social post$`) });
  const sourceHref = await sourceLink.getAttribute("href");
  expect(sourceHref).toBe(`#social/post/${repeatedValue("browser-inbox-post-001", testInfo)}`);
  await sourceLink.click();
  await expect(page).toHaveURL(exactHashPattern(sourceHref));
  await page.goBack();
  await expect(page).toHaveURL(/#inbox\?group=needs-me&type=social$/);
  await expect(rowWithTitle(page, socialTitle)).toHaveCount(1);

  const beforeApprovalPayload = await readInbox(page, "group=needs-me&type=social&limit=40");
  const beforeApprovalState = await readState(page);
  const approve = rowWithTitle(page, socialTitle).getByRole("button", { name:/^Approve / });
  await approve.click();
  const approvalDialog = page.locator("[data-inbox-action-dialog]");
  await expect(approvalDialog).toContainText("does not send, publish, launch, or release anything");
  await approvalDialog.getByRole("button", { name:"Approve" }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Approval recorded");
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  expect(actionBodies).toHaveLength(1);

  const approvalId = repeatedValue("browser-inbox-approval-001", testInfo);
  const postId = repeatedValue("browser-inbox-post-001", testInfo);
  const approvedState = await readState(page);
  expect(approvedState.approvals.filter((item) => item.id === approvalId)).toHaveLength(1);
  expect(approvedState.approvals.find((item) => item.id === approvalId).state).toBe("approved");
  expect(approvedState.posts.find((item) => item.id === postId)).toEqual(beforeApprovalState.posts.find((item) => item.id === postId));
  expect((approvedState.companyEvents || []).length - (beforeApprovalState.companyEvents || []).length).toBe(1);
  const repeatApproval = await page.request.post(`${baseURL}/api/ui/inbox/action`, { data:actionBodies[0] });
  expect(repeatApproval.ok()).toBe(true);
  expect((await repeatApproval.json()).alreadyApplied).toBe(true);
  const repeatedApprovalState = await readState(page);
  expect(repeatedApprovalState.approvals.filter((item) => item.id === approvalId)).toHaveLength(1);
  expect((repeatedApprovalState.companyEvents || []).length).toBe((approvedState.companyEvents || []).length);
  const afterApprovalPayload = await readInbox(page, "group=needs-me&type=social&limit=40");
  expect(afterApprovalPayload.counts.needsMe).toBe(beforeApprovalPayload.counts.needsMe - 1);
  await expect(page.locator("[data-shell-inbox-count]").first()).toHaveText(String(afterApprovalPayload.counts.needsMe));

  await page.evaluate(() => { location.hash = "inbox?group=needs-me&type=decision"; });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  const snoozeTitle = repeatedTitle("Revisit the meeting brief", testInfo);
  const snoozeRow = rowWithTitle(page, snoozeTitle);
  await expect(snoozeRow).toHaveCount(1);
  const beforeSnoozePayload = await readInbox(page, "group=needs-me&type=decision&limit=40");
  await snoozeRow.getByRole("button", { name:/^Snooze / }).click();
  const snoozeDialog = page.locator("[data-inbox-action-dialog]");
  await expect(snoozeDialog.getByLabel("Tomorrow")).toBeChecked();
  await snoozeDialog.getByRole("button", { name:"Snooze" }).click();
  await expect(page.locator("[data-inbox-action-announcer]")).toContainText("Item snoozed");
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await expect(rowWithTitle(page, snoozeTitle)).toHaveCount(0);
  const afterSnoozePayload = await readInbox(page, "group=needs-me&type=decision&limit=40");
  expect(afterSnoozePayload.counts.needsMe).toBe(beforeSnoozePayload.counts.needsMe - 1);
  await expect(page.locator("[data-shell-inbox-count]").first()).toHaveText(String(afterSnoozePayload.counts.needsMe));
  await page.evaluate(() => { location.hash = "inbox?group=waiting&type=decision"; });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  await expect(rowWithTitle(page, snoozeTitle)).toHaveCount(1);
  const snoozedState = await readState(page);
  expect(snoozedState.queueItems.find((item) => item.id === repeatedValue("browser-action-queue-snooze-001", testInfo)).status).toBe("snoozed");

  await page.evaluate(() => { location.hash = "today"; });
  await expect(page.locator("[data-today-page]")).toBeVisible();
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name:"Open Quick Capture" }).click();
  const captureDialog = page.getByRole("dialog", { name:"Create" });
  await expect(captureDialog.getByRole("heading", { name:"Quick Capture" })).toBeVisible();
  await captureDialog.getByRole("radio", { name:/^Post idea/ }).check();
  await expect(captureDialog.getByLabel("Selected destination")).toContainText("Social");
  const captureTitle = `Phase 2 exact Post idea ${testInfo.repeatEachIndex + 1}`;
  await captureDialog.getByRole("textbox", { name:"Title", exact:true }).fill(captureTitle);
  const captureResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/ui/quick-capture"
  );
  await captureDialog.getByRole("button", { name:"Save", exact:true }).evaluate((button) => {
    button.click();
    button.click();
  });
  const captureResponse = await captureResponsePromise;
  expect(captureResponse.ok()).toBe(true);
  const captureResult = await captureResponse.json();
  await expect(captureDialog.getByRole("heading", { name:"Saved" })).toBeVisible();
  await expect(captureDialog.locator("[data-quick-capture-success-message]")).toContainText("saved to Social");
  const openCapture = captureDialog.getByRole("link", { name:"Open", exact:true });
  await expect(openCapture).toHaveAttribute("href", captureResult.canonicalHref);
  expect(captureBodies).toHaveLength(1);
  await openCapture.click();
  await expect(page).toHaveURL(exactHashPattern(captureResult.canonicalHref));
  await expect(page.locator("[data-post-composer]")).toBeVisible();
  await expect(page.getByRole("heading", { name:captureTitle, level:2 })).toBeVisible();

  const finalState = await readState(page);
  const capturedPostId = captureResult.canonicalHref.split("/").at(-1);
  expect(finalState.posts.filter((item) => item.id === capturedPostId && item.captureIntent === "post-idea")).toHaveLength(1);
  expect(finalState.auditHistory.filter((item) => item.resourceId === capturedPostId)).toHaveLength(1);
  expect(finalState.activityEvents.filter((item) => item.relatedObjectId === capturedPostId)).toHaveLength(1);
  expect(safetySnapshot(finalState)).toEqual(initialSafety);
  expect(requestCounts.bootOrFullState, "Phase 2 interactions must not add a full-state request after boot.").toBe(fullStateAtReady);
  expect(mutationPaths).toEqual([
    "/api/ui/inbox/action",
    "/api/ui/inbox/action",
    "/api/ui/quick-capture"
  ]);
  expect(prohibitedActionPaths).toEqual([]);
  expect(actionBodies).toHaveLength(2);

  console.log("CCX206_WORKFLOW_MATRIX", JSON.stringify({
    todayNow:{ href:nowHref, mutationRequests:0, back:true, forward:true },
    socialReview:{ href:sourceHref, duplicateInboxItems:0, back:true },
    approval:{ records:1, duplicateWrites:0, externalExecutions:0 },
    snooze:{ movedTo:"waiting", badgeDelta:-1, duplicateItems:0 },
    postIdea:{ href:captureResult.canonicalHref, records:1, auditRecords:1, activityRecords:1 }
  }));
  console.log("CCX206_REQUEST_COUNTS", JSON.stringify({
    ...requestCounts,
    fullStateRequestsAfterBoot:requestCounts.bootOrFullState - fullStateAtReady,
    repeatedApprovalRequests:1,
    mutationRequests:mutationPaths.length
  }));
  console.log("CCX206_MUTATION_COUNTS", JSON.stringify({
    approvals:1,
    snoozes:1,
    captures:1,
    sends:0,
    publications:0,
    campaignExecutions:0,
    providerCalls:0,
    partnerStageChanges:0,
    fileStatusChanges:0,
    suppressionChanges:0,
    liveGateChanges:0
  }));
});

test("Phase 2 read failures recover once, session expiry clears overlays, and restricted work stays hidden", async ({ page, browser }) => {
  test.slow();
  const baseURL = phase2URL();
  await page.setViewportSize({ width:1440, height:900 });
  await page.clock.setFixedTime(FIXED_TIME);

  let todayRequests = 0;
  let allowTodayRecovery = false;
  allowExpectedCriticalResponse(page, "/api/ui/today", 1);
  allowExpectedConsoleError(page, /503 \(Service Unavailable\)/, 1);
  await page.route("**/api/ui/today", async (route) => {
    todayRequests += 1;
    if (!allowTodayRecovery) {
      await route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ error:"Synthetic unavailable" }) });
      return;
    }
    await route.continue();
  });
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-vnext-shell='desktop']")).toBeVisible();
  await expect(page.getByRole("heading", { name:"Today could not load" })).toBeVisible();
  await expect(page.locator("main#app")).not.toBeEmpty();
  expect(todayRequests).toBe(1);
  allowTodayRecovery = true;
  await page.getByRole("button", { name:"Try again" }).evaluate((button) => {
    button.click();
    button.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));
  });
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
  expect(todayRequests).toBe(2);
  expect(await page.evaluate(() => window.__LE_TODAY_METRICS.duplicateRequests)).toBe(0);
  await page.unroute("**/api/ui/today");

  await page.evaluate(() => { location.hash = "inbox?group=needs-me"; });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  let inboxRequests = 0;
  let failInboxOnce = true;
  await page.route("**/api/ui/inbox?*", async (route) => {
    inboxRequests += 1;
    if (failInboxOnce) {
      failInboxOnce = false;
      await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ error:"redacted" }) });
      return;
    }
    await route.continue();
  });
  await page.evaluate(() => window.__LE_INBOX_PAGE.refresh());
  const inboxError = page.locator("[data-inbox-state][data-state='error']");
  await expect(inboxError).toBeVisible();
  await expect(page.locator("[data-vnext-shell='desktop']")).toBeVisible();
  expect(inboxRequests).toBe(1);
  await inboxError.getByRole("button", { name:"Try again" }).evaluate((button) => {
    button.click();
    button.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));
  });
  await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
  expect(inboxRequests).toBe(2);
  expect(await page.evaluate(() => window.__LE_INBOX_METRICS.duplicateRequests)).toBe(0);
  await page.unroute("**/api/ui/inbox?*");

  const accessibility = [];
  const overflow = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    await page.evaluate(() => { location.hash = "today"; });
    await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false");
    overflow.push({ surface:"today", width, overflow:await expectNoOverflow(page, width, "Today") });
    accessibility.push(await severeAxeFindings(page, width, "today"));
    await page.getByRole("button", { name:"Open Quick Capture" }).click();
    const captureDialog = page.getByRole("dialog", { name:"Create" });
    await expect(captureDialog.getByRole("heading", { name:"Quick Capture" })).toBeVisible();
    await captureDialog.getByRole("radio", { name:/^Post idea/ }).check();
    overflow.push({ surface:"quick-capture", width, overflow:await expectNoOverflow(page, width, "Quick Capture") });
    accessibility.push(await severeAxeFindings(page, width, "quick-capture"));
    page.once("dialog", (confirmation) => confirmation.accept());
    await captureDialog.getByRole("button", { name:"Cancel" }).click();
    await page.evaluate(() => { location.hash = "inbox?group=needs-me"; });
    await expect(page.locator("[data-inbox-content]")).toHaveAttribute("aria-busy", "false");
    overflow.push({ surface:"inbox", width, overflow:await expectNoOverflow(page, width, "Inbox") });
    accessibility.push(await severeAxeFindings(page, width, "inbox"));
  }
  expect(accessibility.every((entry) => entry.serious === 0 && entry.critical === 0)).toBe(true);
  expect(overflow.every((entry) => entry.overflow === 0)).toBe(true);

  const protectedTitle = (await page.locator("[data-inbox-item] h2, [data-inbox-item] h3").first().textContent())?.trim();
  await page.getByRole("button", { name:"Create", exact:true }).click();
  await page.getByRole("menu", { name:"Create" }).getByRole("menuitem", { name:/Quick note/ }).click();
  const authenticatedOverlay = page.getByRole("dialog", { name:"Create" });
  await expect(authenticatedOverlay).toBeVisible();
  await authenticatedOverlay.getByRole("radio", { name:/^Decision/ }).check();
  await authenticatedOverlay.getByRole("textbox", { name:"Title", exact:true }).fill("Protected unsaved text");
  await page.evaluate(() => window.__LE_SHELL_RESILIENCE.showSessionExpired());
  await expect(page.getByRole("heading", { name:"Your session ended" })).toBeVisible();
  await expect(authenticatedOverlay).toBeHidden();
  await expect(page.locator("[data-inbox-item]")).toHaveCount(0);
  await expect(page.locator("[data-shell-inbox-count]").first()).toBeHidden();
  await expect(page.getByText("Protected unsaved text")).toHaveCount(0);
  if (protectedTitle) await expect(page.getByText(protectedTitle, { exact:true })).toHaveCount(0);

  const restrictedURL = process.env.BROWSER_TEST_PHASE2_RESTRICTED_BASE_URL;
  const credential = process.env.BROWSER_TEST_RESTRICTED_CREDENTIAL;
  expect(restrictedURL).toBeTruthy();
  expect(credential).toBeTruthy();
  const restrictedContext = await browser.newContext();
  const restrictedPage = await restrictedContext.newPage();
  const login = await restrictedPage.request.post(`${restrictedURL}/api/auth/login`, { data:{ credential } });
  expect(login.ok()).toBe(true);
  const hiddenTitle = "Confidential owner action";
  const restrictedBefore = await readInbox(restrictedPage, "group=needs-me&limit=40", restrictedURL);
  expect(JSON.stringify(restrictedBefore)).not.toContain(hiddenTitle);
  expect(JSON.stringify(restrictedBefore)).not.toContain("browser-action-queue-hidden-001");
  const csrf = (await restrictedContext.cookies(restrictedURL)).find((cookie) => cookie.name === "leos_csrf")?.value || "";
  const guessed = await restrictedPage.request.post(`${restrictedURL}/api/ui/inbox/action`, {
    headers:{ "x-csrf-token":csrf },
    data:{
      inboxItemId:"inbox:decision:decision%3Aqueue%3Abrowser-action-queue-hidden-001%3Adecision",
      intent:"approve",
      requestId:"phase2-hidden-action-001",
      expectedUpdatedAt:"2026-07-17T15:00:00.000Z"
    }
  });
  expect(guessed.status()).toBe(404);
  expect(JSON.stringify(await guessed.json())).not.toMatch(/Confidential|queueItems|manage_|capability/);
  const restrictedAfter = await readInbox(restrictedPage, "group=needs-me&limit=40", restrictedURL);
  expect(restrictedAfter.counts).toEqual(restrictedBefore.counts);
  expect(restrictedAfter.items).toEqual(restrictedBefore.items);
  await restrictedContext.close();

  console.log("CCX206_RESILIENCE", JSON.stringify({
    todayReadRequests:todayRequests,
    todayRetries:1,
    inboxReadRequests:inboxRequests,
    inboxRetries:1,
    duplicateRetries:0,
    whiteScreens:0,
    sessionProtectedItemsAfterExpiry:0,
    restrictedHiddenItemsDisclosed:0,
    restrictedHiddenMutations:0
  }));
  console.log("CCX206_ACCESSIBILITY", JSON.stringify(accessibility));
  console.log("CCX206_OVERFLOW", JSON.stringify(overflow));
});

test("legacy flag-off Today and Inbox remain outside the Phase 2 vNext workflow", async ({ page }) => {
  const legacyURL = process.env.BROWSER_TEST_BASE_URL;
  const vNextRequests = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (["/api/ui/today", "/api/ui/inbox", "/api/ui/inbox/action", "/api/ui/quick-capture"].includes(pathname)) {
      vNextRequests.push(pathname);
    }
  });
  await page.clock.setFixedTime(FIXED_TIME);
  await openToday(page, `${legacyURL}/#today`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("[data-today-page], [data-inbox-page], [data-quick-capture-form]")).toHaveCount(0);
  await expect(page.getByText("Today at LegalEase", { exact:true })).toBeVisible();
  await expect(page.getByRole("heading", { name:/Roger$/, level:1 })).toBeVisible();
  expect(vNextRequests).toEqual([]);
  console.log("CCX206_FLAG_OFF", JSON.stringify({ vNextShell:0, phase2Pages:0, phase2Requests:0, legacyToday:true }));
});
