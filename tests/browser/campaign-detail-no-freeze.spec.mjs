// The campaign detail view must render, not freeze the tab.
//
// Behavioral proof of the fix recorded in evidence PR #119. The pre-fix recovery observer
// was unguarded: load()'s own `replaceChildren` was a childList mutation on the observed
// subtree, so the observer re-entered load(), which aborted the in-flight fetch and wrote
// again. Observer callbacks are microtask-scheduled, so the loop never yielded and the page
// wedged on "Loading Campaign…" — which is exactly what Roger saw at
// #outreach/campaign/campaign-reactivation-b1.
//
// This runs the REAL shipped browser source against a HEALTHY endpoint returning a valid
// payload, in the DOM the shell provides, so a failure here cannot be blamed on data,
// permissions, or Supabase. The pre-fix observer is reconstructed from the same source so
// the two arms differ only in the latch.
import { expect, test } from "@playwright/test";

import { campaignDetailBrowserSource } from "../../scripts/ui/pages/campaign-detail.mjs";

const SHIPPED = campaignDetailBrowserSource();
const PRE_FIX = SHIPPED.replace(
  /new MutationObserver\(\(\)=>\{if\(observerQueued\)return;[\s\S]*?\}\)\.observe\(document\.documentElement,\{childList:true,subtree:true\}\)/,
  'new MutationObserver(()=>{if(route()&&!document.querySelector("[data-campaign-detail]"))load();}).observe(document.documentElement,{childList:true,subtree:true})'
);

const IDENTITY = "campaign-reactivation-b1";

async function prepare(page) {
  await page.setContent('<!doctype html><html><body><main id="app"><section id="item" class="page-section active"><p>placeholder</p></section></main></body></html>');
  await page.evaluate((identity) => {
    window.__loads = 0;
    window.__LE_VNEXT_ROUTE_COMPATIBILITY = {
      resolve: () => ({ kind:"object", objectType:"Campaign", sourceKind:"campaigns", sourceId:identity })
    };
    // A healthy, slightly slow endpoint. The 150ms delay is what the pre-fix loop kept
    // aborting; the fixed version simply waits for it.
    window.fetch = (url, options = {}) => {
      window.__loads += 1;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({
          ok:true,
          status:200,
          json: async () => ({
            ok:true, authorized:true, available:true, selectedTab:"overview",
            campaign:{
              stableIdentity:"campaign:" + identity,
              name:"Expungement.ai reactivation (B1)",
              href:"#outreach/campaign/" + identity,
              status:{ key:"active", label:"Active" }
            },
            overview:{ status:{ key:"active", label:"Active" }, nextAction:"Preview the next wave", audience:{ summary:"3762 enrolled recipients" }, schedule:{ scheduledAt:null } },
            messages:{}, audience:{}, replies:{ count:0 }, results:{}, activity:[], capabilities:{}
          })
        }), 150);
        options.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    };
    location.hash = "#outreach/campaign/" + identity;
  }, IDENTITY);
}

// Evaluate with a host-side deadline: a wedged renderer never answers, and page.evaluate
// alone would hang rather than fail.
async function probe(page, timeoutMs = 8_000) {
  return Promise.race([
    page.evaluate(() => ({
      loads:window.__loads,
      rendered:Boolean(document.querySelector("[data-campaign-detail]")),
      text:document.querySelector("main#app #item")?.textContent?.trim().slice(0, 80) || ""
    })),
    new Promise((_, reject) => setTimeout(() => reject(new Error("main thread did not respond")), timeoutMs))
  ]);
}

// Negative control. It owns its context so nothing else has to interact with a wedged
// renderer: the shared `page` fixture's teardown (screenshot / video / trace capture)
// cannot complete against a page whose main thread never yields.
test("the pre-fix observer wedges the main thread (the defect this fix removes)", async ({ browser }) => {
  // Uses the `browser` fixture and its own context, never the shared `page` fixture: that
  // fixture's teardown captures artifacts from the page, and it cannot complete against a
  // renderer whose main thread never yields.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await prepare(page);
    // Inject from inside the page on a timer rather than via addScriptTag: the wedge must
    // begin with NO protocol call in flight, or closing the context later unbinds that
    // call's handle and the harness reports it as the test's own error.
    await page.evaluate((source) => {
      setTimeout(() => {
        const element = document.createElement("script");
        element.textContent = source;
        document.head.append(element);
      }, 50);
    }, PRE_FIX);
    // Host-side sleep (no protocol call) so the in-page timer has fired and the loop is
    // running before the probe asks the renderer anything.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(probe(page)).rejects.toThrow("main thread did not respond");
  } finally {
    await context.close({ reason:"wedged renderer - negative control" }).catch(() => {});
  }
});

test("the shipped campaign detail source renders a healthy payload without freezing", async ({ page }) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await prepare(page);
  await page.addScriptTag({ content:SHIPPED });

  // Responsive immediately — no wedge.
  const during = await probe(page, 5_000);
  expect(during.text).toContain("Loading Campaign");

  // And it actually finishes: one fetch, one render, the canonical name on screen.
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector("[data-campaign-detail]"))), { timeout:10_000 }).toBe(true);
  const after = await probe(page, 5_000);
  expect(after.rendered).toBe(true);
  expect(after.text).toContain("Expungement.ai reactivation (B1)");
  expect(after.loads).toBe(1);

  // Give the observer time to misbehave if the latch were wrong: a rendered view is its
  // own sentinel, so no further loads may start.
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window.__loads)).toBe(1);
  expect(browserErrors).toEqual([]);
});

test("a failed load settles instead of retrying forever", async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => { window.fetch = () => { window.__loads += 1; return Promise.resolve({ ok:false, status:500 }); }; });
  await page.addScriptTag({ content:SHIPPED });

  await expect.poll(() => page.evaluate(() => document.querySelector("main#app #item")?.textContent || ""), { timeout:10_000 })
    .toContain("Campaign could not load");
  const settled = await page.evaluate(() => window.__loads);
  await page.waitForTimeout(1_000);
  // Still responsive, and the failed route is not retried on every DOM mutation.
  expect(await page.evaluate(() => window.__loads)).toBe(settled);
});
