// Founder OS — Release 1 acceptance (docs/founder-os/08_DELIVERY_PLAN.md).
//
// Release 1 is the shell consolidation: with FOUNDER_OS_SHELL=true the product presents
// exactly four workspaces — Today, Relationships, Campaigns, Scoreboard — and every internal
// machinery page moves behind Settings → Advanced. Nothing is deleted, so the acceptance bar
// is two-sided: the new shell must be that small, AND the routes it stopped advertising must
// still resolve to real pages for anyone holding an old link or bookmark.
//
// These specs run the real Chromium runtime against a real preview server with the flag on,
// because the risk here is not markup — it is a navigation change that could strand a
// working control (the reactivation Run/Stop pair) or a working page (audit logs) behind a
// nav item that no longer exists. Node-level unit tests cannot see that.
import { expect, test } from "@playwright/test";

import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

// The Founder OS shell renders inside the vNext desktop shell, so both flags are on. The
// discovery onboarding overlay covers the whole stage and swallows clicks; it is unrelated
// to this release, so it stays off.
function founderOsEnvironment(overrides = {}) {
  return {
    COMMAND_CENTER_UX_VNEXT:"true",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:"false",
    FOUNDER_OS_SHELL:"true",
    ...overrides
  };
}

async function startFounderOsShell(context, overrides = {}) {
  const server = await startPreviewServer({ env:founderOsEnvironment(overrides) });
  try {
    const auth = await loginOwner(server);
    await context.addCookies(auth.cookie.split("; ").map((pair) => {
      const separator = pair.indexOf("=");
      return { name:pair.slice(0, separator), value:pair.slice(separator + 1), url:server.baseUrl };
    }));
  } catch (error) {
    await server.stop();
    throw error;
  }
  return server;
}

const primaryNavigationLinks = (page) => page.locator('nav.vnext-primary-navigation a.vnext-nav-link');
const routedContent = (page) => page.locator(".vnext-routed-content");

// A route "renders a real page" when the routed stage settles on readable content with a
// heading — not an empty shell, and not the shell's "Page not found" recovery surface.
// Only visible text counts: several pages keep hidden state slots (empty states, retry
// panels) in the DOM, and textContent would read those as failures.
async function expectRealPage(page, { heading, minimumTextLength = 120 }) {
  const stage = routedContent(page);
  await expect(stage.getByRole("heading", { name:heading }).first()).toBeVisible({ timeout:15_000 });
  await expect(page.locator("[data-vnext-route-recovery]:visible")).toHaveCount(0);
  const visibleText = (await stage.innerText()).trim();
  expect(visibleText).not.toMatch(/Page not found|Something went wrong/i);
  expect(visibleText.length).toBeGreaterThan(minimumTextLength);
}

// Scenario 1 — primary navigation is exactly the charter's four workspaces, and the global
// controls that carry everything else survive.
test("Founder OS shell shows exactly four workspaces plus the global controls", async ({ page, context }) => {
  const server = await startFounderOsShell(context);
  try {
    await page.goto(server.baseUrl + "/#today");

    const navigation = primaryNavigationLinks(page);
    await expect(navigation).toHaveCount(4);
    // useInnerText, because each link carries a decorative indicator span and the raw
    // textContent is mostly whitespace.
    await expect(navigation).toHaveText([/^Today$/, /^Relationships$/, /^Campaigns$/, /^Scoreboard$/], { useInnerText:true });
    await expect(navigation.nth(0)).toHaveAttribute("href", "#today");
    await expect(navigation.nth(1)).toHaveAttribute("href", "#partners");
    await expect(navigation.nth(2)).toHaveAttribute("href", "#campaigns");
    await expect(navigation.nth(3)).toHaveAttribute("href", "#revenue");

    // Nothing that used to be primary may still be primary. Checked by label rather than by
    // count alone, so a rename cannot quietly restore one of them.
    for (const removed of ["Inbox", "Social", "Support", "Calendar", "Company Health", "Files", "Queue", "More"]) {
      await expect(navigation.filter({ hasText:new RegExp(`\\b${removed}\\b`) })).toHaveCount(0);
    }

    // The four workspaces are the whole of primary navigation, but the global controls are
    // how the rest of the product stays reachable, so they must all be on screen.
    await expect(page.locator('[data-shell-destination="Search"]')).toBeVisible();
    await expect(page.getByRole("button", { name:"Create", exact:true })).toBeVisible();
    for (const utility of ["Le-E", "Settings"]) {
      const control = page.locator(`nav.vnext-secondary-navigation [data-shell-destination="${utility}"]`);
      await expect(control).toHaveCount(1);
      await expect(control).toBeVisible();
    }
  } finally {
    await server.stop();
  }
});

// Scenario 2 — Inbox lost its primary navigation slot, so Today has to carry it. If this
// fails the Inbox is not "demoted", it is orphaned.
test("Inbox is reachable from Today without primary navigation", async ({ page, context }) => {
  const server = await startFounderOsShell(context);
  try {
    await page.goto(server.baseUrl + "/#today");
    await expectRealPage(page, { heading:/^Today$/ });

    const openInbox = routedContent(page).locator('a[href^="#inbox"]').filter({ hasText:/Inbox/i }).first();
    await expect(openInbox).toBeVisible({ timeout:15_000 });
    await openInbox.click();

    await expect(page).toHaveURL(/#inbox/);
    await expectRealPage(page, { heading:/^Inbox$/ });
  } finally {
    await server.stop();
  }
});

// Scenario 3 — the reactivation controls are the most dangerous thing to strand: they are
// the only Run / Stop / Preview surface for a live email campaign. PR #120 made them
// reachable regardless of flags; this proves the four-workspace shell did not undo that,
// under both routes the Campaigns workspace can point at.
for (const scenario of [
  { name:"vNext Outreach page off", outreach:"false", expectedHref:"#campaigns" },
  { name:"vNext Outreach page on", outreach:"true", expectedHref:"#outreach" }
]) {
  test(`reactivation Run, Stop and Preview are reachable from Campaigns — ${scenario.name}`, async ({ page, context }) => {
    const server = await startFounderOsShell(context, { COMMAND_CENTER_UX_VNEXT_OUTREACH:scenario.outreach });
    try {
      await page.goto(server.baseUrl + "/#today");

      const campaigns = primaryNavigationLinks(page).filter({ hasText:/Campaigns/ });
      await expect(campaigns).toHaveCount(1);
      await expect(campaigns).toHaveAttribute("href", scenario.expectedHref);
      await campaigns.click();

      const surface = page.locator("[data-reactivation-control-surface]");
      await expect(surface).toHaveCount(1);
      await expect(surface.locator("[data-reactivation-controls]")).toHaveCount(1, { timeout:15_000 });
      await expect(surface.getByRole("button", { name:/^(Run|Stop) Reactivation Campaign$/ })).toHaveCount(1);
      await expect(surface.getByRole("button", { name:"Preview next sends" }).first()).toBeVisible();
    } finally {
      await server.stop();
    }
  });
}

// Scenario 4 — audit logs are machinery. They must not be primary navigation, and they must
// be listed under Settings → Advanced, which is the release's promise that "removed from
// navigation" never means "unreachable".
test("Audit Logs are absent from navigation and present under Settings → Advanced", async ({ page, context }) => {
  const server = await startFounderOsShell(context);
  try {
    await page.goto(server.baseUrl + "/#today");

    const navigation = primaryNavigationLinks(page);
    await expect(navigation.filter({ hasText:/Audit|Logs/i })).toHaveCount(0);
    await expect(page.locator('nav.vnext-primary-navigation a[href*="soc2"]')).toHaveCount(0);
    await expect(page.locator('nav.vnext-secondary-navigation a[href*="soc2"]')).toHaveCount(0);

    await page.locator('nav.vnext-secondary-navigation [data-shell-destination="Settings"]').click();
    await expect(page).toHaveURL(/#settings/);

    const advanced = page.locator("[data-founder-os-advanced]");
    await expect(advanced).toHaveCount(1);
    await expect(advanced).toBeVisible({ timeout:15_000 });

    const auditLink = advanced.locator('a[href="#soc2-audit"]');
    await expect(auditLink).toHaveCount(1);
    await expect(auditLink).toHaveText(/Audit Logs/);
    await auditLink.click();

    await expect(page).toHaveURL(/#soc2-audit/);
    await expectRealPage(page, { heading:/Audit Logs/, minimumTextLength:40 });
  } finally {
    await server.stop();
  }
});

// Scenario 5 — previously valid URLs still land somewhere sensible. Removing a route from
// navigation must not break a link someone already holds.
test("previously valid URLs still resolve to real pages under the Founder OS shell", async ({ page, context }) => {
  const server = await startFounderOsShell(context);
  try {
    // #cockpit is an alias of Today: it canonicalizes and renders Today rather than 404ing.
    await page.goto(server.baseUrl + "/#cockpit");
    await expectRealPage(page, { heading:/^Today$/ });

    // #growth-inbox is no longer advertised anywhere, but the page itself is untouched.
    await page.goto(server.baseUrl + "/#growth-inbox");
    await expectRealPage(page, { heading:/Growth Inbox/, minimumTextLength:60 });

    // #soc2-audit renders directly from its URL as well as from Settings → Advanced.
    await page.goto(server.baseUrl + "/#soc2-audit");
    await expectRealPage(page, { heading:/Audit Logs/, minimumTextLength:40 });

    // #outreach used to render Today while the address bar still read #outreach — a silent
    // wrong answer. It must land on Campaigns, with the reactivation controls present.
    await page.goto(server.baseUrl + "/#outreach");
    await expectRealPage(page, { heading:/^Campaigns$/ });
    await expect(routedContent(page).getByRole("heading", { name:/^Today$/ })).toHaveCount(0);
    await expect(page.locator("[data-reactivation-control-surface]")).toHaveCount(1);
  } finally {
    await server.stop();
  }
});
