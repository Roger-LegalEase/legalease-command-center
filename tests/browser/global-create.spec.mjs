import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-103");
const expectedLabels = ["Social post", "Outreach campaign", "Partner", "File or folder", "Quick note"];

async function openVNext(page, width = 1440) {
  const baseURL = process.env.BROWSER_TEST_CREATE_BASE_URL;
  expect(baseURL).toBeTruthy();
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-16T12:00:00-04:00"));
  await openToday(page, `${baseURL}/#today`);
  await expect(page.locator("body[data-command-center-shell='vnext']")).toBeVisible();
  return baseURL;
}

async function openCreateMenu(page, { keyboard = false } = {}) {
  const trigger = page.getByRole("button", { name:"Create", exact:true });
  if (keyboard) {
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
  } else {
    await trigger.click();
  }
  const menu = page.getByRole("menu", { name:"Create" });
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return { trigger, menu };
}

async function selectCreate(page, label) {
  const { menu } = await openCreateMenu(page);
  await menu.getByRole("menuitem", { name:new RegExp(`^${label}`) }).click();
  const dialog = page.getByRole("dialog", { name:"Create" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name:label, exact:true })).toBeVisible();
  return dialog;
}

async function stateOf(page, baseURL) {
  const response = await page.request.get(`${baseURL}/api/state`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function returnToToday(page, baseURL) {
  await page.goto(`${baseURL}/#today`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.getByRole("heading", { name:/Good (morning|afternoon|evening)/ }).first()).toBeVisible();
}

test("Global Create exposes the exact shared menu and complete keyboard behavior", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  await openVNext(page);
  let opened = await openCreateMenu(page, { keyboard:true });
  await expect(opened.menu.getByRole("menuitem")).toHaveCount(5);
  expect(await opened.menu.locator("strong").allTextContents()).toEqual(expectedLabels);
  await expect(opened.menu.getByRole("menuitem", { name:/Social post/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(opened.menu.getByRole("menuitem", { name:/Outreach campaign/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(opened.menu.getByRole("menuitem", { name:/Quick note/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(opened.menu.getByRole("menuitem", { name:/Social post/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opened.trigger).toBeFocused();

  opened = await openCreateMenu(page, { keyboard:true });
  await page.screenshot({ path:path.join(screenshotDirectory, "global-create-menu-1440.png"), animations:"disabled" });
  await page.locator("main#app").click({ position:{ x:20, y:20 } });
  await expect(opened.menu).toBeHidden();
  await expect(opened.trigger).toBeFocused();

  await page.setViewportSize({ width:390, height:844 });
  opened = await openCreateMenu(page, { keyboard:true });
  expect(await opened.menu.locator("strong").allTextContents()).toEqual(expectedLabels);
  await page.screenshot({ path:path.join(screenshotDirectory, "global-create-menu-390.png"), animations:"disabled" });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name:"Quick note" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opened.trigger).toBeFocused();
});

test("all five workflows create one inert real record and open its exact link", async ({ page }) => {
  test.slow();
  await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = await openVNext(page);
  const before = await stateOf(page, baseURL);
  const beforeIds = Object.freeze({
    posts:new Set(before.posts.map((item) => item.id)),
    campaigns:new Set(before.campaigns.map((item) => item.id)),
    partners:new Set(before.partners.map((item) => item.id)),
    dataRoomItems:new Set(before.dataRoomItems.map((item) => item.id)),
    captureInbox:new Set(before.captureInbox.map((item) => item.id))
  });
  const externalMutations = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/publish|send|campaign\/release|linkedin\/publish/i.test(pathname)) externalMutations.push(pathname);
  });

  let dialog = await selectCreate(page, "Social post");
  await dialog.getByLabel("Working title or idea").fill("Browser fixture social idea");
  await dialog.getByLabel("Draft copy or notes").fill("Draft notes only. Nothing should publish.");
  await dialog.getByLabel("Channel preference").selectOption("linkedin");
  await page.screenshot({ path:path.join(screenshotDirectory, "create-social-post-1440.png"), animations:"disabled" });
  await dialog.getByRole("button", { name:"Create social post" }).click();
  await expect(page).toHaveURL(/#social\/post\/post-/);
  await returnToToday(page, baseURL);

  dialog = await selectCreate(page, "Outreach campaign");
  await dialog.getByLabel("Campaign name").fill("Browser fixture outreach");
  await dialog.getByLabel("Campaign type").selectOption("partner_outreach");
  await dialog.getByLabel("Goal or desired outcome").fill("Prepare an internal draft for later review.");
  await page.screenshot({ path:path.join(screenshotDirectory, "create-outreach-campaign-1440.png"), animations:"disabled" });
  await dialog.getByRole("button", { name:"Create outreach campaign" }).click();
  await expect(page).toHaveURL(/#outreach\/campaign\/campaign-/);
  await returnToToday(page, baseURL);

  dialog = await selectCreate(page, "Partner");
  await dialog.getByLabel("Organization name").fill("Browser Example Community Organization");
  await dialog.getByLabel("Partner type").selectOption("nonprofit");
  await dialog.getByLabel("Primary contact name").fill("Example Contact");
  await dialog.getByLabel("Primary contact email").fill("contact@example.com");
  await dialog.getByLabel("Geography or jurisdiction").fill("PA");
  await page.screenshot({ path:path.join(screenshotDirectory, "create-partner-1440.png"), animations:"disabled" });
  await dialog.getByRole("button", { name:"Create partner" }).click();
  await expect(page).toHaveURL(/#partners\/partner\/partner-/);
  await returnToToday(page, baseURL);

  dialog = await selectCreate(page, "File or folder");
  await expect(dialog.getByRole("button", { name:"Create folder" })).toBeDisabled();
  await expect(dialog.getByText("Folders are not available in the current Files system yet.", { exact:true })).toBeVisible();
  await dialog.getByRole("textbox", { name:"Name", exact:true }).fill("Browser readiness document");
  await dialog.getByLabel("Collection or section").selectOption("Compliance");
  await dialog.getByLabel("Safe source link").fill("https://example.com/browser-document");
  await page.screenshot({ path:path.join(screenshotDirectory, "create-file-or-folder-1440.png"), animations:"disabled" });
  await dialog.getByRole("button", { name:"Add document record" }).click();
  await expect(page).toHaveURL(/#files\/data-room-item\/document-/);
  await returnToToday(page, baseURL);

  dialog = await selectCreate(page, "Quick note");
  await dialog.getByRole("textbox", { name:"Note", exact:true }).fill("Browser fixture internal note. Do not convert this into a task.");
  await page.screenshot({ path:path.join(screenshotDirectory, "create-quick-note-1440.png"), animations:"disabled" });
  await dialog.getByRole("button", { name:"Create quick note" }).click();
  await expect(page).toHaveURL(/#item\/captureInbox\/capture-/);

  const state = await stateOf(page, baseURL);
  const createdPosts = state.posts.filter((item) => item.createdVia === "Global Create" && !beforeIds.posts.has(item.id));
  const createdCampaigns = state.campaigns.filter((item) => item.createdVia === "Global Create" && !beforeIds.campaigns.has(item.id));
  const createdPartners = state.partners.filter((item) => item.createdVia === "Global Create" && !beforeIds.partners.has(item.id));
  const createdFiles = state.dataRoomItems.filter((item) => item.createdVia === "Global Create" && !beforeIds.dataRoomItems.has(item.id));
  const createdNotes = state.captureInbox.filter((item) => item.createdVia === "Global Create" && !beforeIds.captureInbox.has(item.id));
  expect([createdPosts.length, createdCampaigns.length, createdPartners.length, createdFiles.length, createdNotes.length]).toEqual([1, 1, 1, 1, 1]);
  expect(createdPosts[0]).toMatchObject({ status:"draft", scheduledFor:"", publishedAt:"" });
  expect(createdCampaigns[0]).toMatchObject({ status:"draft", recipientCount:0, sendCount:0, liveMode:false });
  expect(createdCampaigns[0].recipients).toEqual([]);
  expect(createdPartners[0]).toMatchObject({ status:"new", stage:"new" });
  expect(createdFiles[0]).toMatchObject({ status:"draft", binaryUploaded:false, externallyShared:false });
  expect(createdNotes[0]).toMatchObject({ capture_type:"conversation_note", review_state:"review_required" });
  expect(state.tasks.some((item) => item.sourceId === createdNotes[0].id)).toBe(false);
  expect(externalMutations).toEqual([]);

  await page.setViewportSize({ width:390, height:844 });
  dialog = await selectCreate(page, "Partner");
  await dialog.getByLabel("Organization name").fill("Mobile Example Organization");
  await page.screenshot({ path:path.join(screenshotDirectory, "create-partner-390.png"), animations:"disabled" });
  await dialog.getByRole("button", { name:"Cancel" }).click();
});

test("validation, dirty-close confirmation, duplicate protection, and restricted roles fail safely", async ({ page }, testInfo) => {
  test.slow();
  const baseURL = await openVNext(page);
  let dialog = await selectCreate(page, "Partner");
  await dialog.getByLabel("Primary contact name").fill("Preserved Contact");
  await dialog.getByRole("button", { name:"Create partner" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Add the required information");
  await expect(dialog.getByLabel("Primary contact name")).toHaveValue("Preserved Contact");

  page.once("dialog", async (confirmation) => {
    expect(confirmation.message()).toContain("Nothing has been saved");
    await confirmation.dismiss();
  });
  await dialog.getByRole("button", { name:"Close creation workspace" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Primary contact name")).toHaveValue("Preserved Contact");
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name:"Close creation workspace" }).click();
  await expect(dialog).toBeHidden();

  const retryId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(testInfo.repeatEachIndex + 1).padStart(12, "0")}`;
  const payload = { creationRequestId:retryId, title:"Idempotent browser post", draftCopy:"Draft only.", channel:"" };
  const first = await page.request.post(`${baseURL}/api/ui/create/post`, { data:payload });
  const second = await page.request.post(`${baseURL}/api/ui/create/post`, { data:payload });
  expect(first.ok()).toBe(true);
  expect(second.ok()).toBe(true);
  expect((await first.json()).alreadyExisted).toBe(false);
  expect((await second.json()).alreadyExisted).toBe(true);
  const state = await stateOf(page, baseURL);
  expect(state.posts.filter((item) => item.id === `post-${retryId}`)).toHaveLength(1);

  const restrictedURL = process.env.BROWSER_TEST_RESTRICTED_BASE_URL;
  const credential = process.env.BROWSER_TEST_RESTRICTED_CREDENTIAL;
  expect(restrictedURL).toBeTruthy();
  const login = await page.request.post(`${restrictedURL}/api/auth/login`, { data:{ credential } });
  expect(login.ok()).toBe(true);
  await page.route(`${restrictedURL}/api/**`, async (route) => {
    const request = route.request();
    const requested = new URL(request.url());
    if (request.method() !== "GET" || requested.pathname === "/api/ui/create/capabilities") {
      await route.continue();
      return;
    }
    const response = await route.fetch({
      url:`${baseURL}${requested.pathname}${requested.search}`,
      headers:{ ...request.headers(), cookie:"" }
    });
    await route.fulfill({ response });
  });
  await openToday(page, `${restrictedURL}/#today`);
  const restrictedMenu = (await openCreateMenu(page)).menu;
  await expect(restrictedMenu.locator('[data-global-create-option="quick-note"]')).toBeEnabled();
  for (const id of ["social-post", "outreach-campaign", "partner", "file-or-folder"]) {
    await expect(restrictedMenu.locator(`[data-global-create-option="${id}"]`)).toBeDisabled();
    await expect(restrictedMenu.locator(`[data-global-create-option="${id}"] [data-global-create-explanation]`)).toContainText("current access");
  }
  const cookies = await page.context().cookies(restrictedURL);
  const csrf = cookies.find((cookie) => cookie.name === "leos_csrf")?.value || "";
  const refused = await page.request.post(`${restrictedURL}/api/ui/create/partner`, {
    headers:{ "x-csrf-token":csrf },
    data:{ creationRequestId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", organizationName:"Must not exist", partnerType:"nonprofit" }
  });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toEqual({ error:"Your current access does not allow this creation action. Nothing was saved." });
});

test("the creation workspace remains accessible and inside the viewport on desktop and mobile", async ({ page }) => {
  for (const width of [1440, 390]) {
    await openVNext(page, width);
    const dialog = await selectCreate(page, "Partner");
    const overflow = await page.evaluate(() => ({
      document:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body:document.body.scrollWidth - document.body.clientWidth
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    const results = await new AxeBuilder({ page })
      .include("body")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);
    await dialog.getByRole("button", { name:"Cancel" }).click();
  }
});
