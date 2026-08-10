// Wave 1B — the rendered RCAP surfaces, in a real browser.
//
// The pure-render suite (scripts/test-rcap-prospects-page.mjs) proves the markup. This proves
// the things only a DOM can: that the route mounts, that back/forward and a reloaded deep link
// land on the right account, that the flag-off page is untouched, that nothing overflows at
// 390px, and that axe finds nothing serious or critical. It also writes the five screenshots
// the release is required to produce.

import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/rcap-wave-1b");
const LIST_HASH = "partners?view=rcap-prospects";

function baseUrl() {
  const url = process.env.BROWSER_TEST_RCAP_BASE_URL;
  expect(url, "The RCAP fixture server URL is required.").toBeTruthy();
  return url;
}

async function openList(page, hash = LIST_HASH) {
  const url = baseUrl();
  await page.clock.setFixedTime(new Date("2026-08-09T15:00:00-04:00"));
  await openToday(page, `${url}/#${hash}`);
  return url;
}

const listRoot = (page) => page.locator("[data-rcap-prospects]");
// The desktop table and the mobile cards are both present in the DOM at every width — one of
// them is hidden by CSS, not removed — so every row locator must say which one it means.
const tableRoot = (page) => listRoot(page).locator(".rcap-table-card");
const cardsRoot = (page) => listRoot(page).locator(".rcap-cards");
const tableLink = (page, name) => tableRoot(page).getByRole("link", { name });
const overviewRoot = (page) => page.locator("[data-rcap-overview]");

async function waitForList(page) {
  await expect(listRoot(page)).toBeVisible({ timeout: 15_000 });
  await expect(listRoot(page)).toHaveAttribute("data-rcap-state", "ready", { timeout: 15_000 });
}

async function firstAccountHref(page) {
  await waitForList(page);
  const link = tableRoot(page).locator("a[data-rcap-open]").first();
  await expect(link).toBeVisible();
  return link.getAttribute("href");
}

// No page may scroll sideways at any supported width.
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
  // Name the offending nodes, not just the rule — a bare "color-contrast" tells you nothing about
  // which element to fix, and a failure you cannot act on wastes a whole run.
  const findings = blocking.flatMap((violation) => violation.nodes.map((node) => `${violation.id} @ ${node.target.join(" ")} — ${(node.failureSummary || violation.help).replace(/\s+/g, " ").slice(0, 220)}`));
  expect(findings, `${label} must have no serious or critical axe findings.`).toEqual([]);
}

test("the RCAP saved view renders a real list and owns the Partners page", async ({ page }) => {
  await openList(page);
  await waitForList(page);

  await expect(page.getByRole("heading", { name: "RCAP Prospects", level: 1 })).toBeVisible();
  await expect(page.getByText("Research, outreach, conversations, and partner conversion in one place.")).toBeVisible();

  // Real projected rows, not a placeholder.
  const rows = tableRoot(page).locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count(), "The fixture's organizations must render.").toBeGreaterThanOrEqual(2);
  await expect(tableLink(page, "Synthetic Riverside Justice Center")).toBeVisible();

  // Every required column.
  for (const column of ["Account", "Program / Geography", "Stage", "Primary Contact", "Last Touch", "Next Action", "Owner", "Attention"]) {
    await expect(tableRoot(page).getByRole("columnheader", { name: column })).toBeVisible();
  }

  // The legacy Partners content is hidden rather than stacked underneath.
  const legacyVisible = await page.evaluate(() => {
    const root = document.querySelector("main#app #partners");
    if (!root) return "no-partners-section";
    return [...root.children].some((child) => !child.hasAttribute("data-rcap-slot") && !child.hasAttribute("hidden"));
  });
  expect(legacyVisible, "The RCAP view must own the page, not stack on the legacy surface.").toBe(false);

  // No send control anywhere on the list.
  await expect(listRoot(page).locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(listRoot(page).getByRole("button", { name: /^send/i })).toHaveCount(0);
});

test("the compatibility alias reaches the same view as the canonical route", async ({ page }) => {
  await openList(page, "relationships?view=rcap-prospects");
  await waitForList(page);
  await expect(page.getByRole("heading", { name: "RCAP Prospects", level: 1 })).toBeVisible();
  // The alias normalises onto the canonical hash rather than living at its own address.
  expect(page.url()).toContain("#partners?view=rcap-prospects");
});

test("a summary count applies its saved view and survives reload, back, and forward", async ({ page }) => {
  await openList(page);
  await waitForList(page);

  await listRoot(page).locator('button[data-rcap-view="needs_research"]').click();
  await expect.poll(() => page.url()).toContain("savedView=needs_research");
  await waitForList(page);

  // A reloaded deep link reopens the same view.
  await page.reload();
  await waitForList(page);
  expect(page.url()).toContain("savedView=needs_research");

  await page.goBack();
  await expect.poll(() => page.url()).not.toContain("savedView=needs_research");
  await page.goForward();
  await expect.poll(() => page.url()).toContain("savedView=needs_research");
  await waitForList(page);
});

test("a row opens the correct account, and the deep link survives a reload", async ({ page }) => {
  await openList(page);
  const href = await firstAccountHref(page);
  const organization = await tableRoot(page).locator("a[data-rcap-open]").first().innerText();

  await tableRoot(page).locator("a[data-rcap-open]").first().click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: organization, level: 1 })).toBeVisible();

  const accountUrl = page.url();
  expect(accountUrl).toContain("account=");
  expect(href && accountUrl.includes(href.replace(/^#/, ""))).toBeTruthy();

  await page.reload();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: organization, level: 1 })).toBeVisible();

  // Back returns to the list, not to a blank page.
  await page.goBack();
  await waitForList(page);
});

test("the complete Overview shows one clear next move and cannot send", async ({ page }) => {
  await openList(page);
  await waitForList(page);
  await tableLink(page, "Synthetic Riverside Justice Center").click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });

  await expect(overviewRoot(page).locator("[data-rcap-next]")).toBeVisible();
  for (const heading of ["Account snapshot", "Best first contact", "Outreach plan", "Le-E profile summary", "Where things stand", "Open tasks", "Files", "Related accounts"]) {
    await expect(overviewRoot(page).getByRole("heading", { name: heading })).toBeVisible();
  }

  // Exactly one dominant action on the surface.
  await expect(overviewRoot(page).locator(".rcap-primary")).toHaveCount(1);

  // Draft email exists, is disabled, and says why.
  const draft = overviewRoot(page).getByRole("button", { name: "Draft email" });
  await expect(draft).toBeVisible();
  await expect(draft).toBeDisabled();
  await expect(overviewRoot(page).getByText(/Outreach Review arrives in a later release/)).toBeVisible();

  // All three view-switcher destinations are real as of Wave 3: Overview, Profile and Activity.
  // Each must be a link that leads somewhere, not an inert tab.
  await expect(overviewRoot(page).getByRole("link", { name: "Profile", exact: true })).toHaveCount(1);
  await expect(overviewRoot(page).getByRole("link", { name: "Activity", exact: true })).toHaveCount(1);

  // Prepared is not sent.
  await expect(overviewRoot(page).getByText("Prepared", { exact: false }).first()).toBeVisible();
});

test("the blocked Overview states the whole blocker and offers no draft", async ({ page }) => {
  await openList(page);
  await waitForList(page);
  await tableLink(page, "Synthetic Prairie Legal Services").click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await expect(overviewRoot(page)).toHaveAttribute("data-rcap-blocked", "true");

  await expect(overviewRoot(page).getByText("Outreach blocked")).toBeVisible();
  for (const label of ["Blocked", "Why", "Still possible", "Owner", "Needed"]) {
    await expect(overviewRoot(page).locator("dt", { hasText: new RegExp(`^${label}$`) }).first()).toBeVisible();
  }
  // A blocked account cannot open a send or approval action at all.
  await expect(overviewRoot(page).getByRole("button", { name: "Draft email" })).toHaveCount(0);
  // But the page stays useful.
  await expect(overviewRoot(page).getByRole("button", { name: "Add note" })).toBeVisible();
});

test("with the flag off the Partners page is untouched and no RCAP runtime is served", async ({ page }) => {
  const legacy = process.env.BROWSER_TEST_VNEXT_BASE_URL;
  expect(legacy, "The flag-off fixture URL is required.").toBeTruthy();
  await page.clock.setFixedTime(new Date("2026-08-09T15:00:00-04:00"));
  await openToday(page, `${legacy}/#${LIST_HASH}`);

  // The saved view does not exist, and the legacy Partners surface renders as it always did.
  await expect(page.locator("[data-rcap-prospects]")).toHaveCount(0);
  await expect(page.locator("[data-rcap-slot]")).toHaveCount(0);
  await expect(page.locator("main#app #partners")).toBeVisible();

  // Asked from OUTSIDE the page: an in-page fetch of a 404 logs a console error, and the shared
  // fixture counts any console error as a failure — correctly, so the check is made out of band.
  const runtime = await page.request.get(`${legacy}/assets/ui/runtime/rcap-prospects.js`);
  expect(runtime.status(), "The runtime must not be served when the flag is off.").toBe(404);
});

test("the list and both Overview states are accessible and free of horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page);
  await waitForList(page);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeFindings(page, "The RCAP Prospects list");

  // Tablet: the rail moves below the main column rather than being squeezed.
  await page.setViewportSize({ width: 900, height: 1000 });
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await tableLink(page, "Synthetic Riverside Justice Center").click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeFindings(page, "The complete Prospect Overview");

  await openList(page);
  await waitForList(page);
  await tableLink(page, "Synthetic Prairie Legal Services").click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await expectNoSeriousAxeFindings(page, "The blocked Prospect Overview");
});

test("at 390x844 the table becomes cards, targets are reachable, and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openList(page);
  await waitForList(page);

  // The table is replaced, not squeezed.
  await expect(cardsRoot(page).locator("article").first()).toBeVisible();
  await expect(listRoot(page).locator(".rcap-table-card")).toBeHidden();
  await expectNoHorizontalOverflow(page);

  // Every reachable control meets the 44px touch target.
  const small = await page.evaluate(() => [...document.querySelectorAll("[data-rcap-prospects] a, [data-rcap-prospects] button")]
    .filter((node) => node.offsetParent !== null)
    .map((node) => ({ text: (node.textContent || "").trim().slice(0, 28), height: Math.round(node.getBoundingClientRect().height) }))
    .filter((entry) => entry.height > 0 && entry.height < 44));
  expect(small, "Every reachable control must meet the 44px touch target at 390px.").toEqual([]);

  await expectNoSeriousAxeFindings(page, "The RCAP Prospects list at 390px");

  await cardsRoot(page).locator("article a").first().click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeFindings(page, "The Prospect Overview at 390px");
});

test("visual proof: the five required screenshots", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive: true });

  // 1. The list, desktop.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page);
  await waitForList(page);
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-prospects-desktop.png"), fullPage: true });

  // 2. The list, mobile.
  await page.setViewportSize({ width: 390, height: 844 });
  await openList(page);
  await waitForList(page);
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-prospects-mobile-390x844.png"), fullPage: true });

  // 3. The complete Overview, desktop.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page);
  await waitForList(page);
  await tableLink(page, "Synthetic Riverside Justice Center").click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-prospect-overview-complete-desktop.png"), fullPage: true });

  // 5. The same account at 390x844 (captured before navigating away).
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(overviewRoot(page)).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-prospect-overview-mobile-390x844.png"), fullPage: true });

  // 4. The blocked Overview, desktop.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page);
  await waitForList(page);
  await tableLink(page, "Synthetic Prairie Legal Services").click();
  await expect(overviewRoot(page)).toBeVisible({ timeout: 15_000 });
  await expect(overviewRoot(page)).toHaveAttribute("data-rcap-blocked", "true");
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-prospect-overview-blocked-desktop.png"), fullPage: true });
});
