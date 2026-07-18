import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  allowExpectedCriticalResponse,
  allowExpectedConsoleError,
  authenticateRestricted,
  expect,
  openToday,
  test
} from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-205");
const fixedTime = new Date("2026-07-17T12:00:00-04:00");
const intentLabels = ["Task", "Decision", "Blocker", "Post idea", "Partner note", "Campaign idea", "File/report note"];

function reportSevereAxeFindings(width, violations) {
  const findings = violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id:violation.id,
      impact:violation.impact,
      help:violation.help,
      nodes:violation.nodes.map((node) => ({
        target:node.target,
        failureSummary:node.failureSummary
      }))
    }));
  if (findings.length > 0) console.error("CCX205_AXE_FINDINGS", JSON.stringify({ width, findings }));
  return findings;
}

async function openCaptureToday(page, width = 1440) {
  const baseURL = process.env.BROWSER_TEST_CREATE_BASE_URL;
  expect(baseURL).toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(fixedTime);
  await openToday(page, `${baseURL}/#today`);
  await expect(page.locator("[data-today-page]")).toBeVisible();
  await expect(page.getByRole("button", { name:"Open Quick Capture" })).toHaveCount(1);
  await page.getByRole("button", { name:"Open Quick Capture" }).click();
  const dialog = page.getByRole("dialog", { name:"Create" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name:"Quick Capture" })).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(7);
  await expect(dialog.getByRole("radio", { name:/^Task/ })).toBeEnabled();
  return { baseURL, dialog };
}

async function stateOf(page, baseURL) {
  const response = await page.request.get(`${baseURL}/api/state`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function selectIntent(dialog, label) {
  const radio = dialog.getByRole("radio", { name:new RegExp(`^${label.replace("/", "\\/")}`) });
  await radio.check();
  return radio;
}

async function fillCapture(dialog, { intent, title, details = "", relatedPartner = "", campaignType = "", fileSection = "" }) {
  await selectIntent(dialog, intent);
  await dialog.getByRole("textbox", { name:"Title", exact:true }).fill(title);
  if (details) await dialog.getByRole("textbox", { name:/Details/ }).fill(details);
  if (relatedPartner) await dialog.getByRole("textbox", { name:/Related Partner/ }).fill(relatedPartner);
  if (campaignType) await dialog.locator("#quick-capture-campaign-type").selectOption(campaignType);
  if (fileSection) await dialog.locator("#quick-capture-file-section").selectOption(fileSection);
}

async function saveCapture(page, dialog) {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/ui/quick-capture"
  );
  await dialog.getByRole("button", { name:"Save", exact:true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const result = await response.json();
  await expect(dialog.getByRole("heading", { name:"Saved" })).toBeVisible();
  await expect(dialog.getByRole("link", { name:"Open", exact:true })).toHaveAttribute("href", result.canonicalHref);
  await expect(dialog.locator("[data-quick-capture-success-message]")).toHaveText(result.message);
  return result;
}

async function captureAnother(dialog) {
  await dialog.getByRole("button", { name:"Capture another" }).click();
  expect(await dialog.getByRole("radio").evaluateAll((nodes) => nodes.every((node) => !node.checked))).toBe(true);
  await expect(dialog.getByLabel("Selected destination")).toContainText("Choose an intent");
}

async function screenshotBoth(page, name, locator = page, mobileFocus = null) {
  await page.setViewportSize({ width:1440, height:900 });
  await locator.screenshot({ path:path.join(screenshotDirectory, `${name}-1440.png`), animations:"disabled" });
  await page.setViewportSize({ width:390, height:844 });
  if (mobileFocus) await mobileFocus.scrollIntoViewIfNeeded();
  await locator.screenshot({ path:path.join(screenshotDirectory, `${name}-390.png`), animations:"disabled" });
  await page.setViewportSize({ width:1440, height:900 });
}

test("Today and Global Create share one destination-confirmed seven-intent capture sheet", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const { dialog } = await openCaptureToday(page);
  expect(await dialog.getByRole("radio").evaluateAll((nodes) => nodes.map((node) => node.value))).toEqual([
    "task", "decision", "blocker", "post-idea", "partner-note", "campaign-idea", "file-report-note"
  ]);
  for (const label of intentLabels) await expect(dialog.getByRole("radio", { name:new RegExp(`^${label.replace("/", "\\/")}`) })).toBeVisible();
  await expect(dialog.getByLabel("Selected destination")).toContainText("No destination has been selected");
  await screenshotBoth(page, "quick-capture-intent-chooser", dialog);

  await selectIntent(dialog, "Post idea");
  await expect(dialog.getByLabel("Selected destination")).toContainText("Social");
  await expect(dialog.getByLabel("Selected destination")).toContainText("An inert Social idea");
  await screenshotBoth(page, "quick-capture-destination-confirmation", dialog, dialog.getByLabel("Selected destination"));

  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("vnext:open-quick-capture", {
      detail:{ returnTarget:document.querySelector("[data-today-utility] button"), suggestedIntent:"campaign-idea" }
    }));
  });
  await expect(dialog.getByText("Le-E suggests Campaign idea → Outreach.")).toBeVisible();
  await expect(dialog.getByRole("radio", { name:/^Campaign idea/ })).not.toBeChecked();
  await expect(dialog.getByLabel("Selected destination")).toContainText("No destination has been selected");
  await dialog.getByRole("button", { name:"Use Campaign idea suggestion" }).click();
  await expect(dialog.getByRole("radio", { name:/^Campaign idea/ })).toBeChecked();
  await expect(dialog.getByLabel("Selected destination")).toContainText("Outreach");
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name:"Cancel" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name:"Create", exact:true }).click();
  await page.getByRole("menu", { name:"Create" }).getByRole("menuitem", { name:/Quick note/ }).click();
  await expect(page.locator(".vnext-create-workspace")).toHaveCount(1);
  await expect(page.locator("[data-quick-capture-form]")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name:"Create" }).getByRole("heading", { name:"Quick Capture" })).toBeVisible();
  await expect(page.locator("[data-today-utility] button", { hasText:"Open Quick Capture" })).toHaveCount(1);
});

test("all seven intents save once, return exact Open links, and execute no external action", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const { baseURL, dialog } = await openCaptureToday(page);
  const before = await stateOf(page, baseURL);
  const beforeIds = {
    tasks:new Set(before.tasks.map((item) => item.id)),
    captureInbox:new Set(before.captureInbox.map((item) => item.id)),
    posts:new Set(before.posts.map((item) => item.id)),
    campaigns:new Set(before.campaigns.map((item) => item.id)),
    dataRoomItems:new Set(before.dataRoomItems.map((item) => item.id))
  };
  const mutationPaths = [];
  const externalActions = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutationPaths.push(pathname);
    if (/send|publish|launch|release|enroll|approve|provider|partner.*stage|file.*status|suppression|live-gate/i.test(pathname)) externalActions.push(pathname);
  });

  const matrix = [];
  await fillCapture(dialog, { intent:"Task", title:"CCX-205 founder follow-up", details:"One open internal Task." });
  await expect(dialog.getByLabel("Selected destination")).toContainText("Tasks");
  matrix.push(await saveCapture(page, dialog));
  await screenshotBoth(page, "quick-capture-task-success", dialog);
  await captureAnother(dialog);

  await fillCapture(dialog, { intent:"Decision", title:"Choose the next review window", details:"Keep this decision in review." });
  matrix.push(await saveCapture(page, dialog));
  await captureAnother(dialog);

  await fillCapture(dialog, { intent:"Blocker", title:"Source approval is still missing", details:"Do not turn this blocker into a Task." });
  matrix.push(await saveCapture(page, dialog));
  await captureAnother(dialog);

  await fillCapture(dialog, { intent:"Post idea", title:"A calmer path through legal complexity", details:"Draft-only Social idea." });
  matrix.push(await saveCapture(page, dialog));
  await screenshotBoth(page, "quick-capture-post-idea-success", dialog);
  await captureAnother(dialog);

  await fillCapture(dialog, { intent:"Partner note", title:"Community Partner requested a follow-up", details:"Review before routing.", relatedPartner:"Example Community Partner" });
  matrix.push(await saveCapture(page, dialog));
  await screenshotBoth(page, "quick-capture-partner-note-success", dialog);
  await captureAnother(dialog);

  await fillCapture(dialog, { intent:"Campaign idea", title:"August Partner education", details:"Inert draft only.", campaignType:"partner_outreach" });
  await expect(dialog.locator("#quick-capture-campaign-type")).toHaveValue("partner_outreach");
  matrix.push(await saveCapture(page, dialog));
  await captureAnother(dialog);

  await fillCapture(dialog, { intent:"File/report note", title:"July operating report note", details:"Draft document record only.", fileSection:"Company overview" });
  await expect(dialog.locator("#quick-capture-file-section")).toHaveValue("Company overview");
  matrix.push(await saveCapture(page, dialog));

  expect(matrix.map((item) => item.intentLabel)).toEqual(intentLabels);
  expect(matrix.map((item) => item.destination)).toEqual(["Tasks", "Capture Inbox", "Capture Inbox", "Social", "Capture Inbox", "Outreach", "Files"]);
  expect(matrix.map((item) => item.canonicalHref)).toEqual([
    expect.stringMatching(/^#item\/tasks\/task-quick-/),
    expect.stringMatching(/^#item\/captureInbox\/capture-/),
    expect.stringMatching(/^#item\/captureInbox\/capture-/),
    expect.stringMatching(/^#social\/post\/post-/),
    expect.stringMatching(/^#item\/captureInbox\/capture-/),
    expect.stringMatching(/^#outreach\/campaign\/campaign-/),
    expect.stringMatching(/^#files\/data-room-item\/document-/)
  ]);

  await dialog.getByRole("link", { name:"Open", exact:true }).click();
  await expect(page).toHaveURL(new RegExp(matrix.at(-1).canonicalHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
  await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
  for (const [index, result] of matrix.entries()) {
    await page.goto(new URL(result.canonicalHref, `${baseURL}/`).href, { waitUntil:"domcontentloaded" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
    await expect(page).toHaveURL(new RegExp(result.canonicalHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
    const exactObject = page.locator("main#app #item.page-section.active");
    await expect(exactObject).toBeVisible();
    if (index === 0) await screenshotBoth(page, "quick-capture-exact-open", exactObject);
  }

  const after = await stateOf(page, baseURL);
  const created = {
    tasks:after.tasks.filter((item) => !beforeIds.tasks.has(item.id) && item.sourceType === "quick_capture"),
    captures:after.captureInbox.filter((item) => !beforeIds.captureInbox.has(item.id) && item.source_label === "Unified Quick Capture"),
    posts:after.posts.filter((item) => !beforeIds.posts.has(item.id) && item.captureIntent === "post-idea"),
    campaigns:after.campaigns.filter((item) => !beforeIds.campaigns.has(item.id) && item.captureIntent === "campaign-idea"),
    files:after.dataRoomItems.filter((item) => !beforeIds.dataRoomItems.has(item.id) && item.captureIntent === "file-report-note")
  };
  expect(created.tasks).toHaveLength(1);
  expect(created.captures).toHaveLength(3);
  expect(created.captures.map((item) => item.capture_type).sort()).toEqual(["blocker", "decision", "partner_update"]);
  expect(created.posts).toHaveLength(1);
  expect(created.campaigns).toHaveLength(1);
  expect(created.files).toHaveLength(1);
  expect(created.posts[0]).toMatchObject({ status:"idea", body:"", scheduledFor:"", publishedAt:"" });
  expect(created.campaigns[0]).toMatchObject({ status:"draft", sendCount:0, liveMode:false });
  expect(created.campaigns[0].recipients).toEqual([]);
  expect(created.files[0]).toMatchObject({ status:"draft", binaryUploaded:false, externallyShared:false });
  expect(after.tasks.filter((item) => !beforeIds.tasks.has(item.id))).toHaveLength(1);
  expect(after.partners).toEqual(before.partners);
  for (const collection of ["posts", "campaigns", "dataRoomItems"]) {
    for (const prior of before[collection]) {
      expect(after[collection].find((item) => item.id === prior.id)).toEqual(prior);
    }
  }
  for (const key of ["approvalQueue", "publishEvents", "outreachSuppressions", "reactivationCampaign", "autopilotSettings"]) {
    expect(after[key]).toEqual(before[key]);
  }
  expect(after.runtime?.livePostingGates).toEqual(before.runtime?.livePostingGates);
  expect(after.runtime?.liveGatesCount).toBe(before.runtime?.liveGatesCount);
  expect(mutationPaths.filter((pathname) => pathname === "/api/ui/quick-capture")).toHaveLength(7);
  expect(externalActions).toEqual([]);
  console.log("CCX205_BROWSER_MATRIX", JSON.stringify(matrix.map((item) => ({ intent:item.intentLabel, destination:item.destination, href:item.canonicalHref }))));
  console.log("CCX205_BROWSER_COUNTS", JSON.stringify({ task:1, decision:1, blocker:1, postIdea:1, partnerNote:1, campaignIdea:1, fileReportNote:1 }));
  console.log("CCX205_BROWSER_ACTIONS", JSON.stringify({ sends:0, publications:0, externalActions:0 }));
});

test("validation, duplicate clicks, repeated requests, authorization, and session expiry fail safely", async ({ page, browser }, testInfo) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const { baseURL, dialog } = await openCaptureToday(page);
  const before = await stateOf(page, baseURL);
  await selectIntent(dialog, "Task");
  const submit = dialog.getByRole("button", { name:"Save", exact:true });
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("required information");
  await screenshotBoth(page, "quick-capture-validation", dialog, dialog.getByRole("alert"));
  const afterValidation = await stateOf(page, baseURL);
  expect(afterValidation.tasks).toEqual(before.tasks);
  await expect(submit).not.toHaveAttribute("aria-busy", "true");

  await dialog.getByRole("textbox", { name:"Title", exact:true }).fill(`Duplicate click capture ${testInfo.repeatEachIndex}`);
  const requestBodies = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ui/quick-capture") requestBodies.push(request.postDataJSON());
  });
  await submit.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(dialog.getByRole("heading", { name:"Saved" })).toBeVisible();
  expect(requestBodies).toHaveLength(1);
  expect(new Set(requestBodies.map((body) => body.creationRequestId)).size).toBe(1);
  const duplicateId = requestBodies[0].creationRequestId;
  const duplicateState = await stateOf(page, baseURL);
  expect(duplicateState.tasks.filter((item) => item.id === `task-quick-${duplicateId}`)).toHaveLength(1);
  expect(duplicateState.auditHistory.filter((item) => item.resourceId === `task-quick-${duplicateId}`)).toHaveLength(1);
  expect(duplicateState.activityEvents.filter((item) => item.relatedObjectId === `task-quick-${duplicateId}`)).toHaveLength(1);

  const repeated = await page.request.post(`${baseURL}/api/ui/quick-capture`, { data:requestBodies[0] });
  expect(repeated.ok()).toBe(true);
  expect((await repeated.json()).alreadyExisted).toBe(true);
  const repeatedState = await stateOf(page, baseURL);
  expect(repeatedState.tasks.filter((item) => item.id === `task-quick-${duplicateId}`)).toHaveLength(1);

  const conflicting = await page.request.post(`${baseURL}/api/ui/quick-capture`, {
    data:{ ...requestBodies[0], intent:"blocker", title:"Must not become a Blocker" }
  });
  expect(conflicting.status()).toBe(409);
  expect((await conflicting.json()).message).toContain("existing intent");
  const conflictState = await stateOf(page, baseURL);
  expect(conflictState.tasks.filter((item) => item.id === `task-quick-${duplicateId}`)).toHaveLength(1);
  expect(conflictState.captureInbox.filter((item) => item.id === `capture-${duplicateId}`)).toHaveLength(0);
  expect(conflictState.auditHistory.filter((item) => item.resourceId === `task-quick-${duplicateId}`)).toHaveLength(1);
  await captureAnother(dialog);
  await dialog.getByRole("button", { name:"Cancel" }).click();
  await expect(dialog).toBeHidden();

  const restrictedContext = await browser.newContext();
  const restrictedPage = await restrictedContext.newPage();
  const restrictedURL = await authenticateRestricted(restrictedPage);
  const cookies = await restrictedPage.context().cookies(restrictedURL);
  const csrf = cookies.find((cookie) => cookie.name === "leos_csrf")?.value || "";
  const refused = await restrictedPage.request.post(`${restrictedURL}/api/ui/quick-capture`, {
    headers:{ "x-csrf-token":csrf },
    data:{ intent:"post-idea", title:"Must not exist", details:"Unauthorized.", creationRequestId:"99999999-9999-4999-8999-999999999999" }
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).outcome).toBe("not_authorized");
  await restrictedContext.close();

  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await page.getByRole("button", { name:"Open Quick Capture" }).click();
  const sessionDialog = page.getByRole("dialog", { name:"Create" });
  await fillCapture(sessionDialog, { intent:"Decision", title:"Session expiry fixture" });
  allowExpectedCriticalResponse(page, "/api/ui/quick-capture");
  allowExpectedConsoleError(page, /Failed to load resource: the server responded with a status of 401/);
  await page.route("**/api/ui/quick-capture", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status:401, contentType:"application/json", body:JSON.stringify({ ok:false, outcome:"session_expired", message:"Your session ended." }) });
  });
  await sessionDialog.getByRole("button", { name:"Save", exact:true }).click();
  await expect(page.getByRole("heading", { name:"Your session ended" })).toBeVisible();
  await expect(sessionDialog).toBeHidden();
});

test("Quick Capture is keyboard-contained, responsive, accessible, and absent from flag-off shell", async ({ page, baseURL }) => {
  test.slow();
  const accessibility = [];
  const { dialog } = await openCaptureToday(page, 1440);
  await selectIntent(dialog, "Partner note");
  await dialog.getByRole("textbox", { name:"Title", exact:true }).fill("Dirty close protection");
  page.once("dialog", async (confirmation) => {
    expect(confirmation.message()).toContain("Nothing has been saved");
    await confirmation.dismiss();
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name:"Open Quick Capture" })).toBeFocused();

  for (const width of [1440, 390]) {
    const opened = await openCaptureToday(page, width);
    await selectIntent(opened.dialog, "File/report note");
    const overflow = await page.evaluate(() => ({
      document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body:document.body.scrollWidth - document.body.clientWidth
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
    const save = opened.dialog.getByRole("button", { name:"Save", exact:true });
    const box = await save.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const axe = await new AxeBuilder({ page })
      .include("body")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const findings = reportSevereAxeFindings(width, axe.violations);
    const serious = findings.filter((violation) => violation.impact === "serious").length;
    const critical = findings.filter((violation) => violation.impact === "critical").length;
    accessibility.push({ width, serious, critical });
    expect(serious).toBe(0);
    expect(critical).toBe(0);
    page.once("dialog", (confirmation) => confirmation.accept());
    await opened.dialog.getByRole("button", { name:"Cancel" }).click();
    await expect(opened.dialog).toBeHidden();
  }

  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toHaveCount(0);
  await expect(page.locator("[data-quick-capture-form]")).toHaveCount(0);
  await expect(page.getByText("Today at LegalEase", { exact:true })).toBeVisible();
  await expect(page.getByRole("heading", { name:/Roger$/, level:1 })).toBeVisible();
  console.log("CCX205_ACCESSIBILITY", JSON.stringify(accessibility));
  console.log("CCX205_FLAG_OFF", JSON.stringify({ vNextShell:0, quickCaptureForms:0, legacyToday:true }));
});
