import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { allowExpectedConsoleError, allowExpectedRequestFailure, expect, test } from "./support.mjs";

const screenshots = path.resolve("docs/ux-vnext/screenshots/ccx-302b");
const postId = "idea-01";
test.describe.configure({ mode:"serial" });
async function openComposer(page, width = 1440) {
  const baseURL = process.env.BROWSER_TEST_COMPOSER_BASE_URL;
  await page.setViewportSize({ width, height:width <= 390 ? 844 : 900 });
  await page.goto(`${baseURL}/#social/post/${postId}`, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("[data-post-composer]")).toBeVisible();
  await expect(page.locator("[data-composer-form]")).toBeVisible();
  return baseURL;
}
async function shot(page, name) {
  const target = path.join(screenshots, name);
  if (process.env.UPDATE_CCX302B_SCREENSHOTS !== "true") {
    try { await readFile(target); return; } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  await page.screenshot({ path:target, animations:"disabled", fullPage:true });
}

test("canonical composer edits all shared fields, preserves conflicts, and saves one versioned update", async ({ page }) => {
  test.slow(); await mkdir(screenshots, { recursive:true });
  const reads = [], saves = [], fullStateWrites = [], prohibited = [];
  page.on("request", (request) => { const url = new URL(request.url()); if (/\/api\/ui\/social\/post\/[^/]+\/composer$/.test(url.pathname)) reads.push(url.pathname); if (/\/save$/.test(url.pathname)) saves.push(url.pathname); if (request.method() !== "GET" && url.pathname === "/api/state") fullStateWrites.push(url.pathname); if (/publish|schedule|approve|provider|regenerate/i.test(url.pathname)) prohibited.push(url.pathname); });
  const baseURL = await openComposer(page);
  await shot(page, "composer-1440.png");
  const values = { headline:"Edited headline", body:"Edited caption", hook:"Edited hook", cta:"Edited CTA", hashtags:"#Edited #Safe" };
  for (const [key, value] of Object.entries(values)) await page.locator(`[data-composer-field="${key}"]`).fill(value);
  await expect(page.locator("[data-preview-headline]")).toHaveText(values.headline);
  await expect(page.locator("[data-preview-body]")).toHaveText(values.body);
  await expect(page.locator("[data-preview-hook]")).toHaveText(values.hook);
  await expect(page.locator("[data-preview-cta]")).toHaveText(values.cta);
  await expect(page.locator("[data-preview-hashtags]")).toHaveText(values.hashtags);
  await shot(page, "composer-editing-1440.png");

  allowExpectedConsoleError(page, /409 \(Conflict\)/, 1);
  await page.route("**/api/ui/social/post/*/save", (route) => route.fulfill({ status:409, contentType:"application/json", body:JSON.stringify({ ok:false, outcome:"conflict", message:"The saved Post changed. Reload the saved copy or keep editing." }) }));
  await page.locator("[data-composer-save]").click();
  await expect(page.locator("[data-conflict-actions]")).toBeVisible();
  await expect(page.locator('[data-composer-field="headline"]')).toHaveValue(values.headline);
  await shot(page, "composer-conflict-1440.png");
  await page.locator("[data-keep-editing]").click();
  await page.unroute("**/api/ui/social/post/*/save");
  const saveResponse = page.waitForResponse((response) => /\/save$/.test(new URL(response.url()).pathname));
  await page.locator("[data-composer-save]").evaluate((button) => { button.click(); button.click(); });
  expect((await saveResponse).ok()).toBe(true);
  await expect(page.locator("[data-composer-message]")).toHaveText("Saved");
  await shot(page, "composer-saved-1440.png");
  const persisted = await page.request.get(`${baseURL}/api/ui/social/post/${postId}/composer`).then((response) => response.json());
  expect(persisted.fields.headline).toBe(values.headline);
  expect(saves).toHaveLength(2); // one intercepted conflict plus one real scoped update
  expect(fullStateWrites).toEqual([]); expect(prohibited).toEqual([]); expect(reads).toHaveLength(1);

  await page.route("**/api/ui/social/post/*/composer", async (route) => { const response = await route.fetch(); const body = await response.json(); body.capabilities.edits = false; await route.fulfill({ response, json:body }); });
  for (const pathname of ["/api/today/summary","/api/lee/threads","/api/safety/posture","/api/campaign/command"]) allowExpectedRequestFailure(page, pathname, /ERR_ABORTED/);
  await page.reload(); await expect(page.locator("[data-composer-save]")).toBeDisabled(); await shot(page, "composer-readonly-1440.png");
  await page.unroute("**/api/ui/social/post/*/composer");
  expect(baseURL).toBeTruthy();
});

test("generic item stays legacy and unsaved navigation is guarded on mobile", async ({ page }) => {
  test.slow(); await mkdir(screenshots, { recursive:true }); const baseURL = await openComposer(page, 390);
  await shot(page, "composer-390.png");
  await page.locator('[data-composer-field="body"]').fill("Unsaved mobile caption");
  await page.getByRole("button", { name:"Back to Social" }).click();
  const dialog = page.getByRole("dialog", { name:"Unsaved changes" }); await expect(dialog).toBeVisible(); await shot(page, "composer-unsaved-dialog-390.png");
  await dialog.getByRole("button", { name:"Stay" }).click(); await expect(page).toHaveURL(/#social\/post\/idea-01$/); await expect(page.locator('[data-composer-field="body"]')).toHaveValue("Unsaved mobile caption");
  await page.getByRole("button", { name:"Back to Social" }).click(); await dialog.getByRole("button", { name:"Leave without saving" }).click(); await expect(page).toHaveURL(/#social\?view=ideas$/);
  await page.goto(`${baseURL}/#item/posts/${postId}`); await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
});

test("composer remains accessible and overflow-free at every required width", async ({ page }) => {
  test.slow(); await mkdir(screenshots, { recursive:true });
  const accessibility = { serious:0, critical:0, consoleErrors:0, pageErrors:0, horizontalOverflow:0 };
  for (const width of [1440,1280,1024,768,390]) {
    await openComposer(page, width);
    const severe = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["serious","critical"].includes(item.impact));
    accessibility.serious += severe.filter((item) => item.impact === "serious").length;
    accessibility.critical += severe.filter((item) => item.impact === "critical").length;
    expect(severe).toEqual([]);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    accessibility.horizontalOverflow += overflow;
    expect(overflow).toBe(0);
    if ([1024,768].includes(width)) await shot(page, `composer-${width}.png`);
  }
  await page.route("**/api/ui/social/post/*/composer", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.creative = { ...body.creative, availability:"unavailable", issues:["Creative source unavailable"] };
    await route.fulfill({ response, json:body });
  });
  await page.reload({ waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-composer-form]")).toBeVisible();
  await expect(page.locator("[data-composer-left] dl div").last().locator("dd")).toHaveText("unavailable");
  await shot(page, "composer-creative-unavailable-390.png");
  console.log("CCX302B_ACCESSIBILITY", JSON.stringify(accessibility));
});

test("required visual states have distinct screenshot hashes", async () => {
  const desktop = ["composer-1440.png","composer-editing-1440.png","composer-saved-1440.png","composer-conflict-1440.png","composer-readonly-1440.png"];
  const mobile = ["composer-390.png","composer-unsaved-dialog-390.png","composer-creative-unavailable-390.png"];
  for (const group of [desktop, mobile]) {
    const hashes = await Promise.all(group.map(async (name) => createHash("sha256").update(await readFile(path.join(screenshots, name))).digest("hex")));
    expect(new Set(hashes).size, `${group.join(", ")} must be visually distinct`).toBe(group.length);
  }
});
