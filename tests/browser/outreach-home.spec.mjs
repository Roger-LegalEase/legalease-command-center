import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { outreachHomeBrowserSource } from "../../scripts/ui/pages/outreach-home.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-401");
const styles = (await readFile(new URL("../../assets/ui/outreach-home.css", import.meta.url), "utf8")).replaceAll("</style", "<\\/style");
const views = [
  { key:"all", label:"All", count:5 }, { key:"draft", label:"Draft", count:1 },
  { key:"scheduled", label:"Scheduled", count:1 }, { key:"active", label:"Active", count:1 },
  { key:"completed", label:"Completed", count:1 }, { key:"automation", label:"Automation control", count:null }
];
const items = [
  { id:"campaign:active", name:"Education access campaign", href:"#outreach/campaign/active", campaignType:{ label:"Announcement" }, deliveryMode:{ label:"One-time message" }, audience:{ available:true, summary:"Synthetic community educators", includedCount:24, excludedCount:2 }, status:{ key:"active", label:"Active" }, nextAction:"Review replies", nextSend:null, replies:0, outcome:{ meetings:0, outcomes:null, summary:null }, owner:"Founder" },
  { id:"campaign:scheduled", name:"Community campaign", href:"#outreach/campaign/scheduled", campaignType:{ label:"Partner outreach" }, deliveryMode:{ label:"Follow-up sequence" }, audience:{ available:true, summary:"Synthetic community partners", includedCount:18, excludedCount:1 }, status:{ key:"scheduled", label:"Scheduled" }, nextAction:null, nextSend:{ scheduledAt:"2026-07-22T14:00:00.000Z", timezone:"America/New_York" }, replies:2, outcome:{ meetings:1, outcomes:null, summary:null }, owner:"Founder" },
  { id:"campaign:draft-unavailable", name:"New partner welcome", href:"#outreach/campaign/draft-unavailable", campaignType:{ label:"Partner outreach" }, deliveryMode:{ label:"One-time message" }, audience:{ available:false, summary:null, includedCount:null, excludedCount:null }, status:{ key:"draft", label:"Draft" }, nextAction:null, nextSend:null, replies:null, outcome:{ meetings:null, outcomes:null, summary:null }, owner:null },
  { id:"campaign:paused", name:"Referral follow-up", href:"#outreach/campaign/paused", campaignType:{ label:"Partner outreach" }, deliveryMode:{ label:"Follow-up sequence" }, audience:{ available:false, summary:null, includedCount:null, excludedCount:null }, status:{ key:"paused", label:"Paused" }, nextAction:"Await founder review", nextSend:null, replies:null, outcome:{ meetings:null, outcomes:null, summary:null }, owner:"Founder" },
  { id:"campaign:completed", name:"Summer access update", href:"#outreach/campaign/completed", campaignType:{ label:"Announcement" }, deliveryMode:{ label:"One-time message" }, audience:{ available:true, summary:"Synthetic subscribers", includedCount:10, excludedCount:0 }, status:{ key:"completed", label:"Completed" }, nextAction:null, nextSend:null, replies:4, outcome:{ meetings:null, outcomes:null, summary:"Two synthetic introductions completed." }, owner:"Founder" }
];

function payload(view = "all") {
  return { ok:true, authorized:true, selectedView:view, views, items:view === "all" ? items : items.filter((item) => item.status.key === view), nextCursor:null, truncated:false, capabilities:{ createsCampaign:true, createCampaignReason:null } };
}

async function openOutreach(page, width = 1440, view = "all") {
  await page.setViewportSize({ width, height:width <= 390 ? 844 : 900 });
  await page.clock.setFixedTime(new Date("2026-07-19T15:00:00.000Z"));
  await page.route("http://outreach.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/outreach") return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(payload(url.searchParams.get("view") || "all")) });
    if (route.request().resourceType() !== "document") return route.fulfill({ status:204, body:"" });
    const controller = outreachHomeBrowserSource().replaceAll("</script", "<\\/script");
    return route.fulfill({ status:200, contentType:"text/html", body:`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${styles}</style></head><body><main id="app"></main><script>
      window.__createCalls=[];
      window.__LE_GLOBAL_CREATE={openWorkflow:(id,options)=>window.__createCalls.push({id,hasReturnTarget:Boolean(options?.returnTarget)})};
      window.__LE_VNEXT_ROUTE_COMPATIBILITY={resolve:(value)=>{const hash=String(value||"");if(hash.startsWith("#outreach/campaign/"))return{kind:"object",objectType:"Campaign",safeHash:hash,destination:"Outreach"};if(hash.startsWith("#outreach"))return{kind:"page",canonicalRoute:"outreach",destination:"Outreach",safeHash:hash};return{kind:"unknown"};}};
      ${controller}
    </script></body></html>` });
  });
  await page.goto(`http://outreach.test/#outreach?view=${view}`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("[data-outreach-page]")).toBeVisible();
  await expect(page.locator("[data-outreach-content]")).toHaveAttribute("aria-busy", "false");
}

async function expectNoOverflow(page, width) {
  const dimensions = await page.evaluate(() => ({ scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth }));
  expect(dimensions.clientWidth).toBe(width);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(width);
}

test("CCX-401 Outreach page contract is truthful, read-only, responsive, and accessible", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  const mutations = [];
  page.on("request", (request) => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await openOutreach(page);
  await expect(page.getByRole("heading", { name:"Outreach", level:1 })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(6);
  await expect(page.getByRole("tab", { name:/Paused/ })).toHaveCount(0);
  await expect(page.locator("[data-outreach-row]")).toHaveCount(5);
  await expect(page.locator("[data-outreach-table-wrap]")).toContainText("Paused");
  await expect(page.getByRole("link", { name:"Open campaign: Community campaign" })).toHaveAttribute("href", "#outreach/campaign/scheduled");
  await expect(page.locator('[data-campaign-id="campaign:active"]')).toContainText("0");
  await expect(page.locator('[data-campaign-id="campaign:draft-unavailable"]')).toContainText("Unavailable");
  await page.screenshot({ path:path.join(screenshotDirectory, "outreach-home-populated-1440.png"), fullPage:true, animations:"disabled" });

  await page.getByRole("button", { name:"New campaign" }).click();
  expect(await page.evaluate(() => window.__createCalls)).toEqual([{ id:"outreach-campaign", hasReturnTarget:true }]);
  expect(mutations).toEqual([]);

  await page.getByRole("tab", { name:/^Draft/ }).click();
  await expect(page.locator('[data-campaign-id="campaign:draft-unavailable"]')).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "outreach-home-unavailable-1440.png"), fullPage:true, animations:"disabled" });

  await page.route("http://outreach.test/api/ui/outreach?*", async (route) => {
    const selected = new URL(route.request().url()).searchParams.get("view") || "all";
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ...payload(selected), items:[] }) });
  });
  await page.getByRole("tab", { name:/^Completed/ }).click();
  await expect(page.getByRole("heading", { name:"No campaigns in this view" })).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "outreach-home-filtered-empty-1440.png"), fullPage:true, animations:"disabled" });

  await page.unrouteAll({ behavior:"wait" });
  await openOutreach(page, 390, "all");
  await expectNoOverflow(page, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "outreach-home-narrow-390.png"), fullPage:true, animations:"disabled" });
  const accessibility = await new AxeBuilder({ page }).include("[data-outreach-page]").analyze();
  expect(accessibility.violations.filter((violation) => ["critical", "serious"].includes(violation.impact))).toEqual([]);
  expect(mutations).toEqual([]);
});
