import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { allowExpectedRequestFailure, expect, test } from "./support.mjs";
import { buildSocialCalendarContract } from "../../scripts/social-calendar-service.mjs";
import { buildSocialConnectionsContract } from "../../scripts/social-connections-service.mjs";
import { renderSocialCalendarPage, socialCalendarBrowserSource } from "../../scripts/ui/pages/social-calendar.mjs";
import { renderSocialConnectionsPage } from "../../scripts/ui/pages/social-connections.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/social-production");
const actor = { authenticated:true, role:"owner", id:"browser-owner" };
test.describe.configure({ mode:"serial" });

async function shot(page, name) { await page.screenshot({ path:path.join(screenshotDirectory, name), fullPage:true, animations:"disabled" }); }
async function reloadComposer(page) { await page.reload({ waitUntil:"networkidle" }); await expect(page.locator("[data-composer-form]")).toBeVisible(); }

test("production composer integrates exact creative, variants, schedule, review, manual fallback, and claimed publishing", async ({ page }) => {
  test.slow(); await mkdir(screenshotDirectory, { recursive:true });
  const baseURL = process.env.BROWSER_TEST_COMPOSER_BASE_URL; expect(baseURL).toBeTruthy();
  let model; let renderCalls = 0; let scheduleMoves = 0; let adapterCalls = 0; let publicationMode = "success"; const claims = new Set();
  const exact = { template:{ collection:"generationProfiles", sourceId:"production-template" }, logo:{ collection:"brandContract", sourceId:"shellLogo" }, wilma:{ collection:"brandAssets", sourceId:"production-wilma" }, background:{ collection:"brandAssets", sourceId:"production-background" }, disclaimer:{ collection:"library", sourceId:"production-disclaimer" } };
  await page.route("**/api/ui/social/post/idea-01/composer", async (route) => {
    if (!model) {
      const response = await route.fetch(); model = await response.json();
      model.version = 20; model.productionEnabled = true; model.capabilities = { ...model.capabilities, edits:true, creative:true, variants:true, schedules:true, approves:true, requestsChanges:true, regenerates:true, publishes:false, manualPackage:false };
      model.creative = { ...model.creative, surfaceTone:"dark", catalog:{ categories:[{ key:"legal_education", label:"Legal education", templateCount:1 }], templates:[{ id:"production-template", name:"Reviewed education template", category:{ key:"legal_education", label:"Legal education" }, description:"Synthetic reviewed template.", sourceReference:exact.template, availability:{ key:"available" } }], groups:[{ key:"logos", label:"Logos", assets:[{ id:"shellLogo", name:"Official white wordmark", sourceReference:exact.logo, suitableSurface:"dark_only" }] },{ key:"wilma_poses", label:"Wilma", assets:[{ id:"production-wilma", name:"Reviewed Wilma guide pose", sourceReference:exact.wilma }] },{ key:"backgrounds", label:"Backgrounds", assets:[{ id:"production-background", name:"Reviewed navy background", sourceReference:exact.background }] },{ key:"disclaimer_blocks", label:"Disclaimers", assets:[{ id:"production-disclaimer", name:"Reviewed information disclaimer", sourceReference:exact.disclaimer }] }], guidance:[], availability:{ key:"available" } } };
      model.channels = { ...model.channels, variants:["linkedin","instagram","facebook","x","threads"].map((channel) => ({ channel, label:channel === "linkedin" ? "LinkedIn" : channel === "instagram" ? "Instagram" : channel[0].toUpperCase()+channel.slice(1), selected:false, customized:false, stored:false, content:{ body:{ value:model.fields.body, source:"shared", state:"shared_fallback", explicitlyBlank:false } }, creativeReferences:[], guidance:{ characterGuidance:"Use the stored reviewed format guidance." }, availability:{ key:"available" } })) };
      model.readiness = { state:"ready", label:"Ready", checks:[{ label:"Content", state:"passed" },{ label:"Creative", state:"passed" },{ label:"Approval", state:"passed" }] };
      model.review = { ...model.review, state:"ready_for_review", label:"Ready for review", blockingChecks:[], requestedChanges:[], versions:{ previous:[] }, activity:[], guidance:{ text:"Ready for explicit review." } };
      model.publishing = { ...model.publishing, channels:[], guidance:[{ text:"Review controlled publishing." }] };
    }
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(model) });
  });
  await page.route("**/api/ui/social/post/idea-01/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname; const kind = pathname.split("/").at(-1); if (kind === "composer") return route.fallback();
    const body = JSON.parse(route.request().postData() || "{}");
    if (kind === "creative") { expect(body.template).toEqual(exact.template); expect(body.assets).toMatchObject({ logo:exact.logo, wilma:exact.wilma, background:exact.background, disclaimer:exact.disclaimer }); model.creative = { ...model.creative, template:{ name:"Reviewed education template", sourceReference:exact.template, available:true }, logo:{ name:"Official white wordmark", sourceReference:exact.logo, available:true }, wilma:{ name:"Reviewed Wilma guide pose", sourceReference:exact.wilma, available:true }, background:{ name:"Reviewed navy background", sourceReference:exact.background, available:true }, disclaimer:{ name:"Reviewed information disclaimer", sourceReference:exact.disclaimer, available:true } }; model.version += 1; return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true }) }); }
    if (["render","regenerate"].includes(kind)) { renderCalls += 1; expect(model.creative.wilma.sourceReference).toEqual(exact.wilma); expect(model.creative.logo.sourceReference).toEqual(exact.logo); return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true, imageId:"image-exact", reused:renderCalls > 1 }) }); }
    if (kind === "variants") { const selected = body.selectedChannels; expect(selected).toEqual(expect.arrayContaining(["linkedin","instagram"])); model.channels.selected = selected.map((key) => ({ key, label:key === "linkedin" ? "LinkedIn" : "Instagram" })); model.channels.variants = model.channels.variants.map((item) => { const update = body.variants.find((variant) => variant.channel === item.channel); return update ? { ...item, selected:selected.includes(item.channel), customized:update.fields.body.mode === "custom", stored:true, content:{ body:{ value:update.fields.body.value, source:update.fields.body.mode === "custom" ? "variant" : "shared", state:update.fields.body.mode } } } : item; }); model.version += 1; return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true }) }); }
    if (kind === "schedule") { scheduleMoves += 1; model.schedule = { state:"scheduled", display:"Scheduled", scheduledAt:body.scheduledAt, timezone:body.timezone }; model.version += 1; return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true }) }); }
    if (kind === "approve") { model.review = { ...model.review, state:"approved", label:"Approved", guidance:{ text:"Approval is recorded; it did not schedule or publish." } }; model.capabilities.approves = false; model.version += 1; return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true, outcome:"approved" }) }); }
    if (kind === "manual-package") return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true, outcome:"manual_package_created", packageId:"manual-browser", marksPublished:false }) });
    if (kind === "publish") { const key = "approved-revision:linkedin"; if (!claims.has(key)) { claims.add(key); adapterCalls += 1; } if (publicationMode === "partial") { model.publishing.channels = [{ channel:"linkedin", label:"LinkedIn", state:{ key:"published" }, connectionState:{ label:"Ready to publish" }, gateState:{ label:"Enabled" }, publicationState:{ label:"Published" } },{ channel:"instagram", label:"Instagram", state:{ key:"failed" }, connectionState:{ label:"Ready to publish" }, gateState:{ label:"Enabled" }, publicationState:{ label:"Failed — retry available" } }]; return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true, outcome:"partial", channels:[{ channel:"linkedin", state:"published" },{ channel:"instagram", state:"failed_retryable" }] }) }); } return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:true, outcome:claims.has(key) ? "published" : "not_published" }) }); }
    return route.fulfill({ status:404, contentType:"application/json", body:JSON.stringify({ ok:false }) });
  });

  for (const pathname of ["/api/campaign/command","/api/lee/threads","/api/ui/route-access","/api/today/summary","/api/safety/posture","/api/backups","/api/health/supabase","/api/version/drift"]) allowExpectedRequestFailure(page, pathname, /ERR_ABORTED/, 10);
  await page.setViewportSize({ width:1440, height:1000 }); await page.goto(`${baseURL}/#social/post/idea-01`, { waitUntil:"networkidle" }); await expect(page.locator("[data-composer-form]")).toBeVisible();
  await shot(page, "creative-drawer.png");
  await page.locator('[data-creative-ref="template"]').selectOption("generationProfiles:production-template"); await page.locator('[data-creative-ref="logo"]').selectOption("brandContract:shellLogo"); await page.locator('[data-creative-ref="wilma"]').selectOption("brandAssets:production-wilma"); await page.locator('[data-creative-ref="background"]').selectOption("brandAssets:production-background"); await page.locator('[data-creative-ref="disclaimer"]').selectOption("library:production-disclaimer"); await page.locator("[data-save-creative]").click(); await expect(page.locator("[data-creative-message]")).toHaveText("Creative saved."); await expect(page.locator("[data-composer-left]")).toContainText("Reviewed Wilma guide pose"); await shot(page, "template-exact-assets.png");
  model.creative.catalog.groups.find((group) => group.key === "backgrounds").assets = []; await reloadComposer(page); await expect(page.locator('[data-creative-ref="background"] option')).toHaveCount(1); await shot(page, "asset-unavailable.png"); model.creative.catalog.groups.find((group) => group.key === "backgrounds").assets = [{ id:"production-background", name:"Reviewed navy background", sourceReference:exact.background }]; await reloadComposer(page);
  model.review.blockingChecks = [{ label:"Guideline check", explanation:"Revise the outcome claim.", hardFailure:true }]; model.review.guidance = { text:"One blocking check needs attention." }; model.capabilities.approves = false; await reloadComposer(page); await shot(page, "review-blocked.png"); model.review.blockingChecks = []; model.review.guidance = { text:"Ready for explicit review." }; model.capabilities.approves = true; await reloadComposer(page); await shot(page, "review-ready.png");
  await page.locator("[data-render-creative]").click(); await expect(page.locator("[data-creative-message]")).toContainText("Image rendered"); expect(renderCalls).toBe(1);
  for (const [channel, copy, filename] of [["linkedin","Independent LinkedIn copy.","linkedin-variant.png"],["instagram","Independent Instagram copy.","instagram-variant.png"]]) { const field = page.locator(`[data-channel-variant="${channel}"]`); await field.locator("[data-channel-selected]").check(); await field.locator("[data-variant-mode]").selectOption("custom"); await field.locator("[data-variant-body]").fill(copy); await shot(page, filename); } await page.locator("[data-save-variants]").click(); await expect(page.locator("[data-variant-message]")).toHaveText("Channels saved."); expect(model.channels.variants.find((item) => item.channel === "linkedin").content.body.value).not.toBe(model.channels.variants.find((item) => item.channel === "instagram").content.body.value);
  await page.locator(".vnext-schedule-editor").evaluate((details) => { details.open = true; }); await page.locator("[data-schedule-at]").fill("2026-08-10T09:30:00-04:00"); await page.locator("[data-schedule-zone]").fill("America/New_York"); await shot(page, "schedule-dialog.png"); await page.locator("[data-save-schedule]").click(); await expect(page.locator("[data-schedule-message]")).toContainText("Schedule saved"); await page.locator(".vnext-schedule-editor").evaluate((details) => { details.open = true; }); await page.locator("[data-schedule-at]").fill("2026-08-11T09:30:00-04:00"); await page.locator("[data-save-schedule]").click(); await expect(page.locator("[data-schedule-message]")).toContainText("Schedule saved"); expect(scheduleMoves).toBe(2);
  await page.locator("[data-approve-post]").click(); await expect(page.locator("[data-review-message]")).toContainText("Approved");
  model.capabilities.manualPackage = true; model.capabilities.publishes = false; model.publishing.guidance = [{ text:"No credentials are available; use the explicit manual fallback." }]; await reloadComposer(page); await page.locator("[data-manual-package]").click(); await expect(page.locator("[data-publishing-message]")).toContainText("No channel was marked Published"); await shot(page, "manual-fallback.png");
  model.capabilities.manualPackage = false; model.capabilities.publishes = true; model.publishing.channels = [{ channel:"linkedin", label:"LinkedIn", state:{ key:"ready_to_publish" }, connectionState:{ label:"Ready to publish" }, gateState:{ label:"Enabled" }, publicationState:{ label:"No attempt" } }]; model.publishing.guidance = [{ text:"Ready for controlled publishing." }]; await reloadComposer(page); await shot(page, "publishing-ready.png"); await page.locator("[data-publish-now]").evaluate((button) => { button.click(); button.click(); }); await expect.poll(() => adapterCalls).toBe(1);
  publicationMode = "partial"; claims.clear(); await page.locator("[data-publish-now]").click(); await expect(page.locator("[data-publishing-message]")).toContainText("Some channels published"); await shot(page, "partial-publication-failure.png");
  await page.setViewportSize({ width:390, height:844 }); await reloadComposer(page); await shot(page, "composer-390.png"); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const severe = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["serious","critical"].includes(item.impact)); expect(severe).toEqual([]);
});

test("calendar and connection production surfaces use the real additive renderers", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  const calendarState = { posts:[{ id:"calendar-one", title:"Scheduled education Post", targetChannels:["linkedin"], scheduledFor:"2026-08-10T09:30:00-04:00", timezone:"America/New_York", scheduleStatus:"valid", status:"draft" },{ id:"calendar-two", title:"Unscheduled partner Post", targetChannels:["instagram"], status:"draft" }], approvals:[], approvalQueue:[], queueItems:[], publishEvents:[], activityEvents:[], auditHistory:[], postImages:[], brandAssets:[], postingKits:[], generationBatches:[], library:[], settings:{ sourceItems:[], localAssets:[] } };
  const calendar = buildSocialCalendarContract(calendarState, actor, { generatedAt:"2026-07-19T12:00:00.000Z" }); const calendarCss = await readFile("assets/ui/social-calendar.css", "utf8");
  await page.setViewportSize({ width:1440, height:900 }); await page.setContent(`<style>${calendarCss}</style>${renderSocialCalendarPage(calendar)}<script>${socialCalendarBrowserSource()}</script>`); await shot(page, "calendar-month.png"); await page.getByRole("button", { name:"Week" }).click(); await expect(page.getByRole("button", { name:"Week" })).toHaveAttribute("aria-pressed", "true"); await expect(page.locator("[data-calendar-view-status]")).toContainText("Week view"); await page.setViewportSize({ width:390, height:844 }); await shot(page, "calendar-week-mobile.png");
  const connectionsState = { socialAccounts:[{ id:"linkedin-safe", platform:"linkedin", status:"connected", connected:true, accessToken:"never-render" },{ id:"instagram-safe", platform:"instagram", status:"connected", connected:true }], runtime:{ livePostingGates:{ linkedin:false, instagram:true } } }; const connections = buildSocialConnectionsContract(connectionsState, actor, "2026-07-19T12:00:00.000Z"); const connectionCss = await readFile("assets/ui/social-connections.css", "utf8"); await page.setViewportSize({ width:1280, height:900 }); await page.setContent(`<style>${connectionCss}</style>${renderSocialConnectionsPage(connections)}`); expect(await page.textContent("body")).not.toContain("never-render"); await shot(page, "social-connections.png");
});

test("integrated Social production fixture preserves exact truth and controlled publication claims", async ({ page }) => {
  test.slow();
  const baseURL = process.env.BROWSER_TEST_SOCIAL_PRODUCTION_BASE_URL;
  expect(baseURL).toBeTruthy();
  const fullStateRequests = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (["/api/state", "/api/state/full", "/api/company-state"].includes(pathname)) fullStateRequests.push(pathname);
  });

  await page.goto(`${baseURL}/#social/post/production-post`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-composer-form]")).toBeVisible();
  await expect(page.locator('[data-creative-ref="template"]')).toBeEnabled();
  await page.locator('[data-creative-ref="template"]').selectOption("generationProfiles:production-template");
  await page.locator('[data-creative-ref="logo"]').selectOption("brandContract:shellLogo");
  await page.locator('[data-creative-ref="wilma"]').selectOption("brandAssets:production-wilma");
  await page.evaluate(() => {
    if (typeof window.render !== "function") throw new Error("The shared legacy renderer is unavailable.");
    window.render();
  });
  await expect(page.locator('[data-creative-ref="template"]')).toHaveValue("generationProfiles:production-template");
  await expect(page.locator('[data-creative-ref="logo"]')).toHaveValue("brandContract:shellLogo");
  await expect(page.locator('[data-creative-ref="wilma"]')).toHaveValue("brandAssets:production-wilma");
  await page.locator('[data-creative-ref="background"]').selectOption("brandAssets:production-background");
  await page.locator('[data-creative-ref="disclaimer"]').selectOption("library:production-disclaimer");
  await page.locator("[data-save-creative]").click();
  await expect(page.locator("[data-creative-message]")).toHaveText("Creative saved.");
  await reloadComposer(page);
  await expect(page.locator('[data-creative-ref="template"]')).toHaveValue("generationProfiles:production-template");
  await expect(page.locator('[data-creative-ref="wilma"]')).toHaveValue("brandAssets:production-wilma");

  for (const [channel, copy] of [["linkedin", "Independent integrated LinkedIn copy."], ["instagram", "Independent integrated Instagram copy."]]) {
    const editor = page.locator(`[data-channel-variant="${channel}"]`);
    await editor.locator("[data-channel-selected]").check();
    await editor.locator("[data-variant-mode]").selectOption("custom");
    await editor.locator("[data-variant-body]").fill(copy);
  }
  await page.locator("[data-save-variants]").click();
  await expect(page.locator("[data-variant-message]")).toHaveText("Channels saved.");
  await reloadComposer(page);
  await expect(page.locator('[data-channel-variant="linkedin"] [data-variant-body]')).toHaveValue("Independent integrated LinkedIn copy.");
  await expect(page.locator('[data-channel-variant="instagram"] [data-variant-body]')).toHaveValue("Independent integrated Instagram copy.");

  const scheduledAt = new Date(Date.now() + (2 * 24 * 60 * 60 * 1_000)).toISOString();
  await page.locator(".vnext-schedule-editor").evaluate((details) => { details.open = true; });
  await page.locator("[data-schedule-at]").fill(scheduledAt);
  await page.locator("[data-schedule-zone]").fill("Etc/UTC");
  await page.locator("[data-save-schedule]").click();
  await expect(page.locator("[data-schedule-message]")).toContainText("Nothing was published");
  let state = await (await page.request.get(`${baseURL}/api/test/fixture-state`)).json();
  expect(state.publishEvents).toEqual([]);

  await expect(page.locator("[data-approve-post]")).toBeEnabled();
  await page.locator("[data-approve-post]").click();
  await expect(page.locator("[data-review-message]")).toContainText("Nothing was scheduled or published");
  state = await (await page.request.get(`${baseURL}/api/test/fixture-state`)).json();
  expect(state.publishEvents).toEqual([]);

  const currentModel = await (await page.request.get(`${baseURL}/api/ui/social/post/production-publish/composer`)).json();
  const publishResults = await page.evaluate(async ({ version }) => Promise.all([
    fetch("/api/ui/social/post/production-publish/publish", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ expectedVersion:version, requestId:"production-browser-publish-one" }) }).then((response) => response.json()),
    fetch("/api/ui/social/post/production-publish/publish", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ expectedVersion:version, requestId:"production-browser-publish-two" }) }).then((response) => response.json())
  ]), { version:currentModel.version });
  expect(publishResults.some((result) => result.outcome === "partial"), JSON.stringify(publishResults)).toBe(true);

  state = await (await page.request.get(`${baseURL}/api/test/fixture-state`)).json();
  const providerCalls = state.activityEvents.filter((event) => event.type === "social_provider_adapter_called");
  expect(providerCalls.map((event) => event.channel).sort()).toEqual(["instagram", "linkedin"]);
  expect(state.publishClaims.filter((claim) => claim.postId === "production-publish")).toHaveLength(2);
  expect(state.publishEvents.find((event) => event.postId === "production-publish" && event.channel === "linkedin")?.status).toBe("published");
  expect(state.publishEvents.find((event) => event.postId === "production-publish" && event.channel === "instagram")?.status).toBe("failed_retryable");
  const saved = state.posts.find((post) => post.id === "production-post");
  expect(saved.selectedTemplateId).toBe("production-template");
  expect(saved.wilmaAssetReference).toEqual({ collection:"brandAssets", sourceId:"production-wilma" });
  expect(saved.channelVariants.find((variant) => variant.channel === "linkedin").body).toBe("Independent integrated LinkedIn copy.");
  expect(saved.channelVariants.find((variant) => variant.channel === "instagram").body).toBe("Independent integrated Instagram copy.");
  expect(saved.scheduledFor).toBe(scheduledAt);

  const blocked = await (await page.request.get(`${baseURL}/api/ui/social/post/production-blocked/composer`)).json();
  expect(blocked.capabilities.approves).toBe(false);
  const blockedApproval = await page.request.post(`${baseURL}/api/ui/social/post/production-blocked/approve`, { data:{ expectedVersion:blocked.version, requestId:"production-browser-blocked-approval" } });
  expect(blockedApproval.status()).toBe(409);

  await page.goto(`${baseURL}/#social/post/production-manual`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-composer-form]")).toBeVisible();
  await expect(page.locator("[data-manual-package]")).toBeEnabled();
  await page.locator("[data-manual-package]").click();
  await expect(page.locator("[data-publishing-message]")).toContainText("No channel was marked Published");
  state = await (await page.request.get(`${baseURL}/api/test/fixture-state`)).json();
  expect(state.posts.find((post) => post.id === "production-manual").status).toBe("approved");
  expect(state.posts.find((post) => post.id === "production-manual").postingPackage.manualOnly).toBe(true);

  await page.goto(`${baseURL}/#social-calendar`, { waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Calendar", exact:true })).toBeVisible();
  await expect(page.locator("[data-social-production-surface='calendar']")).toBeVisible();
  await page.goto(`${baseURL}/#social-connections`, { waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Social connections", exact:true })).toBeVisible();
  expect(await page.locator("body").textContent()).not.toContain("accessToken");
  expect(fullStateRequests).toEqual([]);
});
