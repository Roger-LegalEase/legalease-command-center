// Founder OS — Release 3 acceptance (docs/founder-os/08_DELIVERY_PLAN.md).
//
// Release 3 is the Relationships consolidation: one CRM projection over the existing partner
// and contact stores, one timeline, the charter's filters, and the follow-up and commitment
// workflow. The delivery plan's acceptance scenarios are the tests below.
//
// These run real Chromium against a real preview server because the promises are behavioural:
// "appears ONCE with both roles" is a statement about what is on screen, and no Node test can
// prove a second row is absent from a rendered list. The projection's rules are proven
// separately and exhaustively in scripts/test-founder-os-relationships.mjs.
//
// Nothing here sends anything. Every action exercised is internal: stage, strength, priority,
// notes and tasks. The composer is never handed off to Gmail.
import { expect, test } from "@playwright/test";

import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

const DAY_MS = 86_400_000;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY_MS).toISOString();

// Discovery onboarding covers the whole stage and swallows clicks; it is unrelated to this
// release, so it stays off. The shell flag is on because Relationships renders inside the vNext
// desktop shell, which is where the Founder OS shell lives.
function founderRelationshipsEnvironment(overrides = {}) {
  return {
    COMMAND_CENTER_UX_VNEXT:"true",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:"false",
    FOUNDER_OS_SHELL:"true",
    FOUNDER_OS_RELATIONSHIPS:"true",
    ...overrides
  };
}

async function startFounderRelationships(context, { seed = {}, env = {} } = {}) {
  const server = await startPreviewServer({ seed, env:founderRelationshipsEnvironment(env) });
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

const page$ = (page) => page.locator("[data-partners-page]");
const rows = (page) => page.locator("[data-relationship-row]");
// Pinned views and saved filters deliberately share the same click attribute so they share
// one handler; they are told apart by their container, which is what a reader sees too.
const views = (page) => page.locator(".relationship-views [data-relationship-view]");
const savedFilters = (page) => page.locator(".relationship-saved-filters [data-relationship-view]");
const activeView = (page) => page.locator(".relationship-views [data-relationship-view].is-active");

async function openRelationships(page, server) {
  await page.goto(`${server.baseUrl}/#partners`);
  await expect(page$(page)).toBeVisible();
  await expect(page.locator(".partners-loading")).toHaveCount(0);
}

// One human asserted by three lanes at once: a Partner record, an investor contact, and a
// referral source. The charter's rule is that this is ONE relationship with THREE roles.
const DANA = "dana@example.org";

function seedWithOnePersonManyRoles() {
  return {
    partners:[{
      id:"partner-acme",
      name:"Acme Legal Aid",
      domain:"example.org",
      stage:"proposal_sent",
      priority:"high",
      owner:"Roger",
      primaryContactName:"Dana Reyes",
      primaryContactEmail:DANA,
      nextAction:"Send the pilot proposal",
      nextFollowUpAt:iso(-2)
    }, {
      id:"partner-quiet",
      name:"Quiet County Reentry",
      domain:"example.net",
      stage:"qualified",
      owner:"Roger",
      primaryContactName:"Sam Okafor",
      primaryContactEmail:"sam@example.net"
    }],
    companyContacts:[{
      contact_id:"cc-dana",
      email:DANA,
      name:"Dana Reyes",
      types:["investor", "partner_contact", "funder"],
      links:[{ collection:"partners", itemId:"partner-acme" }]
    }],
    // Dana has written and is waiting on Roger. Sam has not.
    inboxSignals:[{
      id:"signal-needs-reply",
      kind:"needs_reply",
      status:"open",
      email:DANA,
      summary:"Dana asked for the pilot pricing sheet",
      occurredAt:iso(-1)
    }],
    tasks:[], activityEvents:[], auditHistory:[], approvals:[], queueItems:[]
  };
}

test.describe("Founder OS Release 3 — Relationships", () => {
  test("a person who is both investor and partner contact appears once with all their roles", async ({ context, page }) => {
    const server = await startFounderRelationships(context, { seed:seedWithOnePersonManyRoles() });
    try {
      await openRelationships(page, server);

      // Exactly one row carries Dana's address. This is the assertion the whole release turns
      // on: three roles must not become three people.
      const danaRows = rows(page).filter({ hasText:DANA });
      await expect(danaRows).toHaveCount(1);

      const roleChips = danaRows.first().locator(".relationship-role-chip");
      const labels = await roleChips.allTextContents();
      expect(labels).toEqual(expect.arrayContaining(["Investor", "Partner contact", "Funder"]));

      // And the roles are on the one record, not spread across several.
      await expect(rows(page).filter({ hasText:"Dana Reyes" })).toHaveCount(1);
    } finally {
      await server.stop();
    }
  });

  test("Waiting on me returns exactly the relationships whose last inbound is unanswered", async ({ context, page }) => {
    const server = await startFounderRelationships(context, { seed:seedWithOnePersonManyRoles() });
    try {
      await openRelationships(page, server);

      const waitingOnMe = views(page).filter({ hasText:"Waiting on me" });
      await expect(waitingOnMe).toHaveCount(1);
      const advertised = Number((await waitingOnMe.locator("span").textContent()).trim());

      await waitingOnMe.click();
      await expect(activeView(page)).toContainText("Waiting on me");

      // The advertised count and the returned set agree — a filter that lies about its size is
      // worse than no filter.
      await expect(rows(page)).toHaveCount(advertised);
      // Dana wrote and is unanswered; Sam did not write at all.
      await expect(rows(page).filter({ hasText:DANA })).toHaveCount(1);
      await expect(rows(page).filter({ hasText:"sam@example.net" })).toHaveCount(0);
    } finally {
      await server.stop();
    }
  });

  test("all six pinned views are present and selecting one replaces the filter set", async ({ context, page }) => {
    const server = await startFounderRelationships(context, { seed:seedWithOnePersonManyRoles() });
    try {
      await openRelationships(page, server);
      await expect(views(page)).toHaveCount(6);
      // The charter's saved filters sit alongside the pinned six, not inside them.
      await expect(savedFilters(page)).toHaveCount(9);
      const labels = (await views(page).allTextContents()).map((text) => text.replace(/\s*\d+\s*$/, "").trim());
      expect(labels).toEqual([
        "All relationships", "Follow-up due", "Waiting on me", "Waiting on them", "Pipeline", "Suppressed"
      ]);

      // Selecting Pipeline then All returns to the unfiltered set rather than layering filters.
      const total = await rows(page).count();
      await views(page).filter({ hasText:"Pipeline" }).click();
      await expect(activeView(page)).toContainText("Pipeline");
      await views(page).filter({ hasText:"All relationships" }).click();
      await expect(rows(page)).toHaveCount(total);
    } finally {
      await server.stop();
    }
  });

  test("an ambiguous identity is surfaced for confirmation and nothing is merged", async ({ context, page }) => {
    const seed = seedWithOnePersonManyRoles();
    // Two different organizations both claim Dana's address. Which one she belongs to is not
    // knowable from the data, so the product must ask rather than decide.
    seed.partners.push({
      id:"partner-beta",
      name:"Beta Justice Center",
      domain:"example.com",
      stage:"qualified",
      owner:"Roger",
      primaryContactName:"Dana Reyes",
      primaryContactEmail:DANA
    });
    const server = await startFounderRelationships(context, { seed });
    try {
      await openRelationships(page, server);
      await expect(page.locator(".relationship-duplicate-notice").first()).toContainText("Possible duplicate");
      await expect(page.locator(".relationship-duplicate-notice").first()).toContainText("Nothing has been merged");
      // Both organizations still exist in their own right.
      await expect(rows(page).filter({ hasText:"Acme Legal Aid" })).toHaveCount(1);
      await expect(rows(page).filter({ hasText:"Beta Justice Center" })).toHaveCount(1);
    } finally {
      await server.stop();
    }
  });

  test("a relationship shows strength, strategic priority and open commitments without re-entry", async ({ context, page }) => {
    const seed = seedWithOnePersonManyRoles();
    seed.inboxSignals.push({
      id:"signal-commitment",
      kind:"commitment",
      status:"open",
      email:DANA,
      summary:"Promised Dana the pilot pricing sheet",
      dueAt:iso(-1),
      occurredAt:iso(-3)
    });
    const server = await startFounderRelationships(context, { seed });
    try {
      await openRelationships(page, server);
      const dana = rows(page).filter({ hasText:DANA }).first();
      // Strategic priority is inherited from the partner record the founder already set —
      // extended, not re-entered.
      await expect(dana).toContainText("Strategic priority");
      await expect(dana).toContainText("High");
      // Strength is new and unset, and says so rather than guessing.
      await expect(dana).toContainText("Strength");
      await expect(dana).toContainText("Not set");
      await expect(dana).toContainText("Open commitments");
      await expect(dana).toContainText("1 overdue");
    } finally {
      await server.stop();
    }
  });

  test("previously valid relationship URLs still resolve under the Founder OS shell", async ({ context, page }) => {
    const server = await startFounderRelationships(context, { seed:seedWithOnePersonManyRoles() });
    try {
      // Release 3 supersedes no route: every old address must still land on a real page.
      for (const hash of ["#partners", "#partner-hub", "#contacts", "#pilots", "#pages"]) {
        await page.goto(`${server.baseUrl}/${hash}`);
        await expect(page.locator("main#app .page-section.active")).toBeVisible();
        await expect(page.locator("main#app")).not.toContainText("Route not found");
      }
    } finally {
      await server.stop();
    }
  });

  test("with the flag off the Relationships surface is unchanged", async ({ context, page }) => {
    const server = await startFounderRelationships(context, {
      seed:seedWithOnePersonManyRoles(),
      env:{ FOUNDER_OS_RELATIONSHIPS:"false" }
    });
    try {
      await openRelationships(page, server);
      // The rollback: no pinned views, no roles, no duplicate notices — the pre-Release-3
      // quick filters instead.
      await expect(views(page)).toHaveCount(0);
      await expect(page.locator(".relationship-role-chip")).toHaveCount(0);
      await expect(page.locator(".relationship-duplicate-notice")).toHaveCount(0);
      await expect(page.locator(".relationship-quick-filters")).toBeVisible();
      // And the list itself still works.
      await expect(rows(page).filter({ hasText:DANA })).toHaveCount(1);
    } finally {
      await server.stop();
    }
  });
});
