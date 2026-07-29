// Founder OS — concept parity across every rendering page.
//
// Three things Roger can see are pinned here, and none of them is reachable from a unit test:
// every page section in this app is rendered by a client runtime into a hash-routed document, so
// a fetch of the served HTML finds 39 of the 67 pages and calls the other 28 clean.
//
//   1. ONE ROUTE, ONE PRIMARY SURFACE. #152 settled the rule for Campaigns: under a Founder OS
//      flag the new surface REPLACES the legacy one rather than sitting on top of it. #revenue
//      broke that rule — the Scoreboard registry mounted into a slot it PREPENDED, so the legacy
//      Revenue page stayed underneath and "open the Scoreboard" answered with two scoreboards.
//      This walks every rendering route with the flags on and counts visible primary surfaces.
//
//   2. THE PROSPECTS LIST IS READABLE AND ITS CHECKBOXES ARE USABLE, at a desk width and a phone
//      width. The list was unusable because one legacy rule, `input, textarea, select
//      { width:100% }`, made every checkbox a full-width block — measured at 805px on a 1600px
//      viewport, which left the row's own text in whatever strip was left. A checkbox that is
//      wider than the row it belongs to is the whole bug, so the assertion is dimensional.
//
//   3. FOUNDER LANGUAGE ON EVERY PAGE. test-vnext-founder-language.mjs pins the registry and the
//      drift in four hand-picked slices of preview-server.mjs — the shell, the section landing
//      pages, the secondary tabs and the Review page. That was the right scope when those were
//      all a founder saw. Four slices is why "Partner Program Engine", "RCAP Proposal Generator"
//      and "RCAP prospects" survived every previous language pass. The sweep below reads the
//      rendered text of all 67 pages in the same walk as (1), so it costs one extra evaluate.
//
// Nothing here sends, publishes, approves or writes. Every request this spec causes is a GET.
import { expect, test } from "@playwright/test";

import { FORBIDDEN_NORMAL_UI_TERMS } from "../../scripts/ui/labels.mjs";
import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";
import { routeRegistry } from "../../scripts/ui/navigation.mjs";

const FLAGS = {
  COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_UX_VNEXT_SOCIAL:"true",
  COMMAND_CENTER_UX_VNEXT_OUTREACH:"true", COMMAND_CENTER_UX_VNEXT_FILES:"true",
  COMMAND_CENTER_FILES_CURSOR_SECRET:"synthetic-page-parity-cursor-secret",
  FOUNDER_OS_SHELL:"true", FOUNDER_OS_TODAY:"true", FOUNDER_OS_RELATIONSHIPS:"true",
  FOUNDER_OS_CAMPAIGNS:"true", FOUNDER_OS_SCOREBOARD:"true", FOUNDER_OS_LEE_PANEL:"true",
  FOUNDER_OS_PRESS:"true"
};

// The four routes another route's renderer already shadows, and the four filter variants of one
// renderer. Neither group is a distinct page, so neither is separate evidence.
const FILTER_VARIANTS = new Set(["tasks-today", "tasks-blocked", "tasks-waiting", "tasks-this-week"]);
const RENDERING_ROUTES = (Array.isArray(routeRegistry) ? routeRegistry : Object.values(routeRegistry || {}))
  .filter((route) => route && (route.canonicalRoute || route.route) && !route.aliasShadowedBy)
  .map((route) => String(route.canonicalRoute || route.route).replace(/^#/, ""))
  .filter((slug) => !FILTER_VARIANTS.has(slug));

// A PRIMARY SURFACE is a page's own front door: the legacy hero every machinery page renders, or
// the root a Founder OS runtime mounts. Two of these visible at once IS the duplicate Roger sees.
const PRIMARY_SURFACES = [
  ".panel.hero-panel",
  "[data-founder-today]", "[data-today-page]", "[data-founder-campaigns]", "[data-kpi-registry]",
  "[data-founder-scoreboard]", "[data-founder-support-page]", "[data-founder-calendar-page]",
  "[data-founder-company-health]", "[data-files-page]", "[data-investor-room]", "[data-file-details]"
].join(",");

// The four words Roger named. On the pages he reaches in one or two clicks from a workspace they
// are a hard failure; on the deep machinery pages they are pinned so they cannot spread while
// they are being retired. Shrink PINNED_WALK_WORDS; never add to it.
const WALK_WORDS = ["RCAP", "prospects", "lane", "engine"];
const WALK_PAGES = new Set([
  "today", "focus", "decisions", "lee", "campaigns", "upload", "prospects", "revenue", "metrics",
  "partners", "settings", "tasks", "capture-inbox", "conversation-notes", "milestones",
  "morning-brief", "evening-reflection", "daily-closeout", "growth-inbox", "funnel", "alerts",
  "meetings", "support", "pilots", "compliance", "partner-pages", "partner-dashboards",
  "partner-reports", "content-bank", "posted", "sources", "item", "pages"
]);
const PINNED_WALK_WORDS = {
  contacts:["RCAP", "prospects"],
  more:["RCAP", "prospects"],
  "operating-memory":["RCAP"],
  "partner-programs":["RCAP", "engine"],
  "partner-proposals":["RCAP"],
  "production-activation-rcap":["RCAP"],
  "operator-manual":["RCAP", "lane"],
  "smoke-test":["RCAP", "prospects"],
  automation:["prospects"],
  autonomy:["lane"],
  "handoff-contract":["RCAP"],
  // These four render the legacy cockpit behind or instead of their own surface, so the sweep
  // reads the cockpit's words. Retiring the cockpit retires these pins with it.
  "daily-run":["RCAP", "prospects"],
  "operator-search":["RCAP", "prospects"],
  "production-linkedin-queue":["RCAP", "prospects"],
  "production-twitter-x-queue":["RCAP", "prospects"]
};

// Pages that already speak a registry-forbidden term. The registry's list is deliberately broad
// (it forbids "Campaigns" and "Queue" while the Founder OS nav still says both), so this is a
// census, not a target of zero: a page may not JOIN the list without a decision.
const PAGES_WITH_KNOWN_DRIFT = [
  "upload", "contacts", "revenue", "support", "alerts",
  "daily-run", "production", "production-linkedin-queue", "production-twitter-x-queue", "proof",
  "more", "growth-inbox", "tasks", "production-activation-rcap", "operating-memory",
  "os-health", "smoke-test", "handoff-contract", "operator-manual", "roles",
  "data-integrity", "operator-search", "partner-programs", "partner-pages", "partner-dashboards",
  "partner-reports", "partner-proposals", "milestones", "partners", "campaigns",
  "content-bank", "sources", "assets", "autonomy", "compliance",
  "reports", "dataroom", "settings", "item",
  // Today says "View full queue". "Queue" is on the registry's forbidden list and also on its
  // own accepted-drift list, which is the contradiction this census records rather than hides.
  "today"
];

const termPattern = (term) => new RegExp(`(^|[^A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i");

const prospectCandidates = Array.from({ length: 14 }, (_, index) => ({
  id:`prospect-${String(index + 1).padStart(3, "0")}`,
  organization_name:`Second Chance Legal Aid of County ${index + 1}`,
  city:"Atlanta", state:"GA", classification:"legal_aid", source:"irs_bmf",
  score:70 + index, review_state:"pending_review", ntee_code:"I80",
  updatedAt:"2026-07-20T12:00:00.000Z"
}));

async function startShell(context, seed = {}) {
  const server = await startPreviewServer({ seed, env:FLAGS });
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

test.describe("Founder OS page parity", () => {
  test("no rendering route shows two primary surfaces, and none speaks a walk word it may not", async ({ context }) => {
    test.slow();
    const server = await startShell(context);
    const page = await context.newPage();
    const duplicates = [];
    const walkFailures = [];
    const walkFound = {};
    const visited = [];
    try {
      await page.setViewportSize({ width:1600, height:1000 });
      for (const slug of RENDERING_ROUTES) {
        await page.goto(`${server.baseUrl}/#${slug}`, { waitUntil:"load" });
        await page.waitForTimeout(700);

        const { found, words } = await page.evaluate((selector) => {
          // A vNext surface (Social and its aliases) renders straight into main#app with no
          // page-section of its own. Falling back to main#app is what puts those pages inside
          // the sweep instead of quietly scoring them clean.
          const section = document.querySelector("main#app .page-section.active") || document.querySelector("main#app");
          if (!section) return { found:[], words:"" };
          const surfaces = [...section.querySelectorAll(selector)]
            .filter((node) => node.offsetParent !== null)
            .filter((node) => !node.closest("details:not([open])"))
            .map((node) => node.tagName.toLowerCase() + "." + String(node.className || "").trim().split(/\s+/).filter(Boolean).join("."));
          // What a founder can read: rendered text plus the attributes that become visible words.
          const attributes = [...section.querySelectorAll("[placeholder],[aria-label],[title],[alt]")]
            .flatMap((node) => ["placeholder", "aria-label", "title", "alt"].map((name) => node.getAttribute(name) || ""));
          return { found:surfaces, words:[section.innerText || "", ...attributes].join(" ").replace(/\s+/g, " ") };
        }, PRIMARY_SURFACES);

        visited.push(slug);
        if (found.length > 1) duplicates.push(`${slug}: ${found.join(" + ")}`);

        const hits = WALK_WORDS.filter((word) => termPattern(word).test(words));
        if (!hits.length) continue;
        walkFound[slug] = hits;
        const unpinned = hits.filter((word) => !(PINNED_WALK_WORDS[slug] || []).includes(word));
        if (!unpinned.length) continue;
        walkFailures.push(`${slug}: ${unpinned.join(", ")}${WALK_PAGES.has(slug) ? " (on the founder's walk)" : " (not pinned)"}`);
      }

      expect(visited.length, "Every rendering route must have been walked.").toBe(RENDERING_ROUTES.length);
      expect(duplicates, `Routes rendering two primary surfaces:\n${duplicates.join("\n")}`).toEqual([]);
      expect(walkFailures, `Walk words reached pages that may not say them:\n${walkFailures.join("\n")}`).toEqual([]);
      // Reported, never failed on: a pin that is no longer needed is progress, not a regression.
      const stale = Object.keys(PINNED_WALK_WORDS).filter((slug) => !walkFound[slug]);
      if (stale.length) console.log(`Walk-word pins that can now be removed: ${stale.join(", ")}`);
    } finally {
      await page.close();
      await server.stop();
    }
  });

  test("registry drift is pinned per page rather than per shell slice", async ({ context }) => {
    test.slow();
    const server = await startShell(context);
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width:1600, height:1000 });
      const drift = {};
      for (const slug of RENDERING_ROUTES) {
        await page.goto(`${server.baseUrl}/#${slug}`, { waitUntil:"load" });
        await page.waitForTimeout(500);
        const words = await page.evaluate(() => {
          const section = document.querySelector("main#app .page-section.active") || document.querySelector("main#app");
          return (section?.innerText || "").replace(/\s+/g, " ");
        });
        const hits = FORBIDDEN_NORMAL_UI_TERMS.filter((term) => termPattern(term).test(words));
        if (hits.length) drift[slug] = hits.sort();
      }
      // The registry's own list is broad — "Campaigns" and "Queue" are on it while the Founder OS
      // nav still says both. So this does not demand zero. It demands that the drift is KNOWN:
      // every page carrying drift is named, so a new page cannot quietly join them.
      const undocumented = Object.keys(drift).filter((slug) => !PAGES_WITH_KNOWN_DRIFT.includes(slug));
      expect(undocumented, `Pages that newly speak registry-forbidden terms:\n${undocumented.map((slug) => `${slug}: ${drift[slug].join(", ")}`).join("\n")}`).toEqual([]);
      console.log(`Registry drift present on ${Object.keys(drift).length} of ${RENDERING_ROUTES.length} pages.`);
    } finally {
      await page.close();
      await server.stop();
    }
  });

  test("the Scoreboard replaces the legacy Revenue page and keeps it reachable", async ({ context }) => {
    const server = await startShell(context);
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width:1600, height:1000 });
      await page.goto(`${server.baseUrl}/#revenue`, { waitUntil:"load" });
      await expect(page.locator("#revenue [data-kpi-registry]")).toHaveCount(1);
      // Replaced, not prepended: no legacy hero stands beside the registry…
      await expect(page.locator("#revenue .panel.hero-panel")).toHaveCount(0);
      // …and the legacy body is carried, not deleted, so no bookmarked record disappears.
      await expect(page.locator("#revenue [data-kpi-registry-legacy]")).toHaveCount(1);
      await expect(page.locator("#revenue [data-kpi-registry-legacy]")).not.toHaveAttribute("open", /.*/);
    } finally {
      await page.close();
      await server.stop();
    }
  });

  for (const width of [1600, 390]) {
    test(`the prospects list shows readable rows with usable checkboxes at ${width}`, async ({ context }) => {
      const server = await startShell(context, { prospectCandidates });
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width, height:width === 390 ? 844 : 1000 });
        await page.goto(`${server.baseUrl}/#prospects`, { waitUntil:"load" });
        const boxes = page.locator("#prospects input[type=checkbox][data-prospect-id]");
        await expect.poll(() => boxes.count(), { timeout:15_000 }).toBeGreaterThan(0);

        const measurements = await page.evaluate(() => [...document.querySelectorAll("#prospects input[type=checkbox][data-prospect-id]")]
          .slice(0, 5)
          .map((box) => {
            const row = box.closest("label") || box.parentElement;
            const boxRect = box.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            return {
              boxWidth:Math.round(boxRect.width), boxHeight:Math.round(boxRect.height),
              rowWidth:Math.round(rowRect.width),
              text:(row.textContent || "").replace(/\s+/g, " ").trim()
            };
          }));

        expect(measurements.length).toBeGreaterThan(0);
        for (const row of measurements) {
          // A control, not a block: the checkbox keeps its own width instead of taking the row's.
          expect(row.boxWidth, `checkbox width at ${width}`).toBeLessThan(40);
          expect(row.boxWidth).toBeGreaterThan(8);
          // A usable target: at least the browser's own checkbox box in both directions.
          expect(row.boxHeight).toBeGreaterThan(8);
          // A readable row: the organisation name is legible beside the control, not squeezed out.
          expect(row.rowWidth).toBeGreaterThan(row.boxWidth * 4);
          expect(row.text).toMatch(/Second Chance Legal Aid of County \d+/);
        }

        // And it is a real control: clicking it selects, and selecting changes nothing on its own.
        const first = boxes.first();
        await first.check();
        await expect(first).toBeChecked();
      } finally {
        await page.close();
        await server.stop();
      }
    });
  }
});
