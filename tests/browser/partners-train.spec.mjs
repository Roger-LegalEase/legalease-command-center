import AxeBuilder from "@axe-core/playwright";

import { allowExpectedConsoleError, allowExpectedCriticalResponse, expect, openToday, test } from "./support.mjs";

const widths = [1440, 1280, 1024, 768, 390];
const baseURL = () => {
  expect(process.env.BROWSER_TEST_PARTNERS_BASE_URL, "The integrated Partners fixture URL is required.").toBeTruthy();
  return process.env.BROWSER_TEST_PARTNERS_BASE_URL;
};

async function openPartners(page, hash = "#partners") {
  await openToday(page, `${baseURL()}/${hash}`);
  await expect(page.locator("main#app").getByRole("heading", { name:hash.startsWith("#partners/partner/") ? /.+/ : "Partners", level:1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.max(window.__LE_PARTNERS_HOME_METRICS?.activeRequests || 0, window.__LE_PARTNER_RECORD_METRICS?.activeRequests || 0))).toBe(0);
}

async function waitForPartnerReads(page) {
  await expect.poll(() => page.evaluate(() => Math.max(window.__LE_PARTNERS_HOME_METRICS?.activeRequests || 0, window.__LE_PARTNER_RECORD_METRICS?.activeRequests || 0))).toBe(0);
}

test("Partners train preserves exact links, safe actions, history, and accessibility", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push({ method:request.method(), pathname:new URL(request.url()).pathname }));
  await openPartners(page);

  const partnerLink = page.getByRole("link", { name:"Open Partner: Community Justice Network" });
  await expect(partnerLink).toHaveAttribute("href", "#partners/partner/partner-community");
  await partnerLink.focus();
  await expect(partnerLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#partners\/partner\/partner-community$/);
  await expect(page.getByRole("heading", { name:"Community Justice Network", level:1 })).toBeVisible();
  await waitForPartnerReads(page);
  await page.goBack();
  await expect(page.getByRole("heading", { name:"Partners", level:1 })).toBeVisible();
  await waitForPartnerReads(page);
  await page.goForward();
  await expect(page.getByRole("heading", { name:"Community Justice Network", level:1 })).toBeVisible();
  await waitForPartnerReads(page);

  await page.getByRole("navigation", { name:"Partner record sections" }).getByRole("link", { name:"Outreach", exact:true }).click();
  await expect(page.getByRole("link", { name:"Open Campaign: Community planning outreach" })).toHaveAttribute("href", "#outreach/campaign/campaign-community");
  const mutationsBeforeOpening = requests.filter((request) => request.method !== "GET").length;
  await page.getByRole("button", { name:"Add file" }).click();
  await expect(page.getByRole("heading", { name:"File or folder" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name:"Close creation workspace" }).click();
  expect(requests.filter((request) => request.method !== "GET")).toHaveLength(mutationsBeforeOpening);

  await page.getByRole("navigation", { name:"Partner record sections" }).getByRole("link", { name:"Files", exact:true }).click();
  await expect(page.getByRole("link", { name:"Open File: Community scope brief" })).toHaveAttribute("href", "#files/data-room-item/file-partner-brief");
  await expect(page.getByRole("button", { name:"Create proposal" })).toBeVisible();

  await openPartners(page, "#partners/partner/partner-train-partner-example-01?tab=outreach");
  await expect(page.getByText("Applied stage: In conversation", { exact:true })).toBeVisible();
  await expect(page.getByText("Applied", { exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Review and apply" })).toHaveCount(0);

  const partnerRequests = requests.filter((request) => request.pathname === "/api/ui/partners" || request.pathname.startsWith("/api/ui/partners/"));
  expect(partnerRequests.length).toBeGreaterThan(0);
  expect(requests.filter((request) => request.pathname === "/api/state")).toEqual([]);
  expect(await page.evaluate(() => ({ home:window.__LE_PARTNERS_HOME_METRICS, record:window.__LE_PARTNER_RECORD_METRICS }))).toMatchObject({
    home:{ fullStateReads:0, mutations:0, externalActions:0, maximumActiveRequests:1 },
    record:{ fullStateReads:0, mutations:0, externalActions:0, maximumActiveRequests:1 }
  });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);
});

test("Partner Create outreach makes one inert Draft and opens its exact Campaign wizard link", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push({ method:request.method(), pathname:new URL(request.url()).pathname }));
  await openPartners(page, "#partners/partner/partner-community?tab=outreach");

  await page.getByRole("button", { name:"Create outreach" }).click();
  await expect(page).toHaveURL(/#outreach\/campaign\/campaign-partner[_-]/);
  await expect(page.getByRole("region", { name:"Campaign draft", exact:true })).toBeVisible();
  expect(requests.filter((request) => request.method !== "GET")).toEqual([
    { method:"POST", pathname:"/api/ui/partners/outreach/campaign" }
  ]);
  expect(requests.some((request) => /send|launch|enroll|approve|schedule|provider/i.test(request.pathname))).toBe(false);
  expect(await page.evaluate(() => window.__LE_PARTNER_RECORD_METRICS)).toMatchObject({
    fullStateReads:0, mutations:1, externalActions:0, sends:0, enrollments:0, providerCalls:0
  });

  await page.goBack();
  await expect(page.getByRole("heading", { name:"Community Justice Network", level:1 })).toBeVisible();
  await waitForPartnerReads(page);
});

test("Partners train covers responsive and availability states without overflow", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
    await openPartners(page, "#partners?view=pipeline");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px home overflow`).toBeLessThanOrEqual(0);
    await openPartners(page, "#partners/partner/partner-community");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px record overflow`).toBeLessThanOrEqual(0);
  }

  const homeResponse = await page.request.get(`${baseURL()}/api/ui/partners?view=list&limit=24`);
  expect(homeResponse.ok()).toBe(true);
  const home = await homeResponse.json();
  await page.route("**/api/ui/partners?*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const filtered = Boolean(query.get("search"));
    await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({
      ...home,
      selectedView:"list",
      query:{ ...home.query, search:filtered ? "No match" : "" },
      availability:{ ...home.availability, state:filtered ? "filtered_empty" : "available_empty" },
      items:[],
      pipeline:[],
      summary:{ ...home.summary, matchingPartners:0 },
      emptyState:filtered
        ? { title:"No Partners match these filters", message:"Clear or change a filter to see Partners." }
        : { title:"No Partners yet", message:"Add a Partner when a real relationship begins." }
    }) });
  });
  await openPartners(page);
  const guidedPartnerState = page.locator('[data-guided-empty-state="partners"]');
  await expect(guidedPartnerState.getByRole("heading", { name:"Add the first Partner relationship" })).toBeVisible();
  await expect(guidedPartnerState.getByRole("button", { name:"Add Partner" })).toHaveCount(1);
  await page.evaluate(() => { location.hash = "partners?view=list&search=No+match"; });
  await expect(guidedPartnerState.getByRole("heading", { name:"No matches in this view" })).toBeVisible();
  await expect(guidedPartnerState.getByRole("button", { name:"Clear filters" })).toHaveCount(1);
  await page.unroute("**/api/ui/partners?*");

  const requestsBeforeReset = await page.evaluate(() => window.__LE_PARTNERS_HOME_METRICS.requests);
  await page.evaluate(() => { location.hash = "partners"; });
  await expect.poll(() => page.evaluate(() => window.__LE_PARTNERS_HOME_METRICS.requests)).toBeGreaterThan(requestsBeforeReset);
  await expect(page.getByRole("heading", { name:"Partners", level:1 })).toBeVisible();
  await waitForPartnerReads(page);
  await page.route("**/api/ui/partners?*", (route) => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ ok:false }) }));
  await page.evaluate(() => window.__LE_PARTNERS_HOME.load());
  await expect(page.getByRole("heading", { name:"Partners could not load" })).toBeVisible();
  await page.unroute("**/api/ui/partners?*");

  allowExpectedCriticalResponse(page, "/api/ui/partners");
  allowExpectedConsoleError(page, /status of 403/);
  await page.route("**/api/ui/partners?*", (route) => route.fulfill({ status:403, contentType:"application/json", body:JSON.stringify({ ok:false, outcome:"unauthorized" }) }));
  await page.evaluate(() => window.__LE_PARTNERS_HOME.load());
  await expect(page.getByRole("heading", { name:"Partners need additional access" })).toBeVisible();
  await page.unroute("**/api/ui/partners?*");

  await page.evaluate(() => window.__LE_SHELL_RESILIENCE.showSessionExpired());
  await expect(page.getByRole("heading", { name:"Your session ended" })).toBeVisible();
});
