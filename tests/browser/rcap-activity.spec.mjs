// Wave 3 — the Activity workspace in a real browser.
//
// The pure suite proves the projection and the markup. This proves the DOM-only parts: that the
// pane takes the page from the other two runtimes, that a filter actually narrows the stream,
// that a truth state survives the trip to the screen, that nothing overflows at 390px, and that
// axe finds nothing serious. It writes the two screenshots the release requires.

import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/rcap-wave-3");
const LIST_HASH = "partners?view=rcap-prospects";

const activityRoot = (page) => page.locator("[data-rcap-activity]");

async function openActivity(page, name) {
  const url = process.env.BROWSER_TEST_RCAP_BASE_URL;
  expect(url, "The RCAP fixture server URL is required.").toBeTruthy();
  await page.clock.setFixedTime(new Date("2026-08-09T15:00:00-04:00"));
  await openToday(page, `${url}/#${LIST_HASH}`);
  await expect(page.locator("[data-rcap-prospects]")).toHaveAttribute("data-rcap-state", "ready", { timeout: 15_000 });
  await page.locator(".rcap-table-card").getByRole("link", { name }).click();
  await expect(page.locator("[data-rcap-overview]")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(activityRoot(page)).toHaveAttribute("data-rcap-activity-state", "ready", { timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  expect(overflow.body, "The body must not scroll horizontally.").toBeLessThanOrEqual(1);
  expect(overflow.doc, "The document must not scroll horizontally.").toBeLessThanOrEqual(1);
}

async function expectNoSeriousAxeFindings(page, label) {
  const results = await new AxeBuilder({ page }).include("main#app").analyze();
  const blocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  const findings = blocking.flatMap((violation) => violation.nodes.map((node) =>
    `${violation.id} @ ${node.target.join(" ")} — ${(node.failureSummary || violation.help).replace(/\s+/g, " ").slice(0, 220)}`));
  expect(findings, `${label} must have no serious or critical axe findings.`).toEqual([]);
}

test("the Activity pane owns the page and renders the recorded stream", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openActivity(page, "Synthetic Riverside Justice Center");

  // Ownership: neither of the other two RCAP runtimes may still be rendering.
  await expect(page.locator("[data-rcap-overview]")).toHaveCount(0);
  await expect(page.locator("[data-rcap-profile]")).toHaveCount(0);

  await expect(activityRoot(page).locator(".rcap-activity-entry").first()).toBeVisible();
  await expect(activityRoot(page).getByRole("heading", { name: "Synthetic Riverside Justice Center", level: 1 })).toBeVisible();
});

test("a filter narrows the stream and the counts do not move with it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openActivity(page, "Synthetic Riverside Justice Center");

  const before = await activityRoot(page).locator('[data-rcap-activity-filter="message"] span').innerText();
  await activityRoot(page).locator('[data-rcap-activity-filter="message"]').click();
  await expect(activityRoot(page)).toHaveAttribute("data-rcap-activity-state", "ready", { timeout: 15_000 });

  const kinds = await activityRoot(page).locator(".rcap-activity-entry").evaluateAll((nodes) =>
    [...new Set(nodes.map((node) => node.getAttribute("data-rcap-entry-kind")))]);
  expect(kinds, "A message filter must leave only messages.").toEqual(["message"]);

  // The count is over everything, so filtering must not change it.
  const after = await activityRoot(page).locator('[data-rcap-activity-filter="message"] span').innerText();
  expect(after).toBe(before);
});

test("a truth state survives the trip to the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openActivity(page, "Synthetic Riverside Justice Center");
  const prepared = activityRoot(page).locator('[data-rcap-outcome="drafted"]').first();
  await expect(prepared).toContainText("Prepared");
  await expect(prepared).not.toContainText("Sent");
});

test("with the flag off the activity runtime is not served at all", async ({ page }) => {
  const legacy = process.env.BROWSER_TEST_BASE_URL;
  expect(legacy, "The flag-off fixture server URL is required.").toBeTruthy();
  await openToday(page, `${legacy}/#${LIST_HASH}`);
  await expect(page.locator("[data-rcap-activity]")).toHaveCount(0);
  const runtime = await page.request.get(`${legacy}/assets/ui/runtime/rcap-activity.js`);
  expect(runtime.status(), "The runtime must not be served when the flag is off.").toBe(404);
});

test("the activity workspace is accessible and free of horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openActivity(page, "Synthetic Riverside Justice Center");
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeFindings(page, "The Activity workspace");

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeFindings(page, "The Activity workspace at 390px");

  const small = await page.evaluate(() => [...document.querySelectorAll("[data-rcap-activity] a, [data-rcap-activity] button")]
    .filter((node) => node.offsetParent !== null)
    .map((node) => ({ text: (node.textContent || "").trim().slice(0, 28), height: Math.round(node.getBoundingClientRect().height) }))
    .filter((entry) => entry.height > 0 && entry.height < 44));
  expect(small, "Every reachable control must meet the 44px touch target at 390px.").toEqual([]);
});

test("visual proof: the two required screenshots", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await openActivity(page, "Synthetic Riverside Justice Center");
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-activity-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(activityRoot(page)).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-activity-mobile-390x844.png"), fullPage: true });
});
