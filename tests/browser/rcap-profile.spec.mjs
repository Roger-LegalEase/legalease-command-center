// Wave 2 — the Profile workspace in a real browser.
//
// The pure suite (scripts/test-rcap-profile-workspace.mjs) proves the markup and the endpoint.
// This proves the things only a DOM can: that the pane mounts and takes the page from the
// Overview runtime, that the section index actually navigates, that a conflict is visible
// without hunting for it, that nothing overflows at 390px, and that axe finds nothing serious.
// It also writes the three screenshots the release is required to produce.

import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, openToday, test } from "./support.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/rcap-wave-2");
const LIST_HASH = "partners?view=rcap-prospects";

function baseUrl() {
  const url = process.env.BROWSER_TEST_RCAP_BASE_URL;
  expect(url, "The RCAP fixture server URL is required.").toBeTruthy();
  return url;
}

async function openList(page) {
  await page.clock.setFixedTime(new Date("2026-08-09T15:00:00-04:00"));
  await openToday(page, `${baseUrl()}/#${LIST_HASH}`);
  await expect(page.locator("[data-rcap-prospects]")).toHaveAttribute("data-rcap-state", "ready", { timeout: 15_000 });
}

const profileRoot = (page) => page.locator("[data-rcap-profile]");

// Reaches the profile the way a person does: list -> account -> Profile tab.
async function openProfile(page, name) {
  await openList(page);
  await page.locator(".rcap-table-card").getByRole("link", { name }).click();
  await expect(page.locator("[data-rcap-overview]")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(profileRoot(page)).toHaveAttribute("data-rcap-profile-state", "ready", { timeout: 15_000 });
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

test("the Profile pane owns the page and renders all fifteen sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");

  // Ownership: the Overview runtime must have stood down, or two surfaces render at once.
  await expect(page.locator("[data-rcap-overview]")).toHaveCount(0);
  await expect(profileRoot(page)).toBeVisible();

  const index = profileRoot(page).locator("[data-rcap-index]");
  await expect(index).toHaveCount(15);
  await expect(profileRoot(page).locator("[data-rcap-section]")).toHaveCount(15);

  // A section nothing addressed says so rather than rendering blank.
  const dealPath = profileRoot(page).locator('article[data-rcap-section="deal_path"]');
  await expect(dealPath.locator("[data-rcap-empty]")).toContainText(/no .*document|not started|addressed/i);
});

test("the section index navigates to the section it names", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");

  const before = page.url();
  await profileRoot(page).locator('[data-rcap-index="outreach_sequence"]').click();
  // The route must survive: this application routes on the hash, so an in-page anchor that
  // replaced it would unmount the very page the reader is scrolling.
  await expect(page).toHaveURL(before);
  const target = profileRoot(page).locator('article[data-rcap-section="outreach_sequence"]');
  await expect(target).toBeInViewport({ timeout: 5_000 });
  await expect(target.locator("h3")).toBeFocused();
});

test("a human edit whose sources moved is shown as a conflict with both costs stated", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");

  await expect(profileRoot(page)).toHaveAttribute("data-rcap-has-conflict", "true");
  const summary = profileRoot(page).locator("[data-rcap-conflict-summary]");
  await expect(summary).toContainText("Nothing has been overwritten.");

  const section = profileRoot(page).locator('article[data-rcap-section="strongest_sales_angle"]');
  await expect(section).toHaveAttribute("data-rcap-section-state", "conflict");
  await expect(section.locator("[data-rcap-conflict]")).toContainText("The edit is lost.");
  await expect(section.getByRole("button", { name: "Keep the edit" })).toBeEnabled();

  // The section built against the CURRENT revision is untouched: invalidation is targeted.
  await expect(profileRoot(page).locator('article[data-rcap-section="strategic_verdict"]'))
    .toHaveAttribute("data-rcap-section-state", "needs_review");
});

test("every claim shows its fact class in words and links to its source", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");

  const verdict = profileRoot(page).locator('article[data-rcap-section="strategic_verdict"]');
  await verdict.locator("details.rcap-evidence summary").click();
  const claim = verdict.locator('[data-rcap-fact="verified_fact"]').first();
  await expect(claim.locator(".rcap-factlabel")).toHaveText("Verified");
  await expect(claim.locator(".rcap-claim-sources a")).toHaveAttribute("href", /docs\.google\.com/);

  const angle = profileRoot(page).locator('article[data-rcap-section="strongest_sales_angle"]');
  await expect(angle.locator('[data-rcap-fact="recommendation"] .rcap-factlabel')).toHaveText("Le-E recommendation");
});

test("a document that could not be read says why, and names who can fix it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Prairie Legal Services");

  const blocker = profileRoot(page).locator("[data-rcap-source-blocker]");
  await expect(blocker).toBeVisible();
  await expect(blocker).toContainText("Drive and Docs read access has not been granted.");
  await expect(blocker).toContainText("Roger, with security review");
  await expect(profileRoot(page).locator('[data-rcap-access="not_authorized"]')).toHaveCount(1);
});

test("approving a section persists and survives a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");

  const verdict = profileRoot(page).locator('article[data-rcap-section="strategic_verdict"]');
  await verdict.getByRole("button", { name: "Approve" }).click();
  await expect(verdict).toHaveAttribute("data-rcap-section-state", "approved", { timeout: 15_000 });

  await page.reload();
  await expect(profileRoot(page)).toHaveAttribute("data-rcap-profile-state", "ready", { timeout: 15_000 });
  await expect(profileRoot(page).locator('article[data-rcap-section="strategic_verdict"]'))
    .toHaveAttribute("data-rcap-section-state", "approved");
});

test("no send control exists, and the correction card says accepting changes no account", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");

  await expect(profileRoot(page)).toContainText("Applying it to the account record is a separate step and does not happen here.");
  const labels = await profileRoot(page).locator("button, a").allInnerTexts();
  for (const label of labels) {
    expect(label.trim(), `"${label.trim()}" reads as a send control.`).not.toMatch(/^(send|schedule|email)\b/i);
  }
  expect(await profileRoot(page).locator('a[href^="mailto:"]').count()).toBe(0);
});

test("the profile is accessible and free of horizontal overflow at every width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeFindings(page, "The Profile workspace");

  await page.setViewportSize({ width: 1100, height: 900 });
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeFindings(page, "The Profile workspace at 390px");

  // Every reachable control still clears the 44px touch target.
  const small = await page.evaluate(() => [...document.querySelectorAll("[data-rcap-profile] a, [data-rcap-profile] button")]
    .filter((node) => node.offsetParent !== null)
    .map((node) => ({ text: (node.textContent || "").trim().slice(0, 28), height: Math.round(node.getBoundingClientRect().height) }))
    .filter((entry) => entry.height > 0 && entry.height < 44));
  expect(small, "Every reachable control must meet the 44px touch target at 390px.").toEqual([]);
});

test("with the flag off the profile runtime is not served at all", async ({ page }) => {
  const legacy = process.env.BROWSER_TEST_BASE_URL;
  expect(legacy, "The flag-off fixture server URL is required.").toBeTruthy();
  await openToday(page, `${legacy}/#${LIST_HASH}`);
  await expect(page.locator("[data-rcap-profile]")).toHaveCount(0);
  const runtime = await page.request.get(`${legacy}/assets/ui/runtime/rcap-profile.js`);
  expect(runtime.status(), "The runtime must not be served when the flag is off.").toBe(404);
});

test("visual proof: the three required screenshots", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Riverside Justice Center");
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-profile-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(profileRoot(page)).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-profile-mobile-390x844.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await openProfile(page, "Synthetic Prairie Legal Services");
  await page.screenshot({ path: path.join(screenshotDirectory, "rcap-profile-blocked-sources-desktop.png"), fullPage: true });
});
