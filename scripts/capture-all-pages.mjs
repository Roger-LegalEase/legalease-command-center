#!/usr/bin/env node
// Implementation evidence: EVERY page a signed-in owner can render, at 1600, flags on.
//
// capture-command-center-screens.mjs shoots the nine surfaces the concept-parity release
// composed. This one shoots the whole product, because the question this release has to answer
// is not "does Campaigns match the screen" but "does anything Roger can open look like a
// different application". It drives the real server on a throwaway data file, like every
// browser test does, and writes nothing to repository state.
//
//   node scripts/capture-all-pages.mjs            # all 67 rendering pages
//   SHOT_ONLY=prospects,upload node scripts/...   # iterate on a few
//   SHOT_WIDTHS=1600,2400 node scripts/...        # reproduce a width-dependent fault
//
// MUST RUN FROM THE REPOSITORY ROOT — Playwright resolves from the working directory.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";
import { routeRegistry } from "./ui/navigation.mjs";

const OUT = process.env.SHOT_OUT || "docs/design/legalease-command-center-concept/implementation-evidence";
const ONLY = (process.env.SHOT_ONLY || "").split(",").filter(Boolean);
const WIDTHS = (process.env.SHOT_WIDTHS || "1600").split(",").filter(Boolean).map(Number);

// The four routes whose renderer another route already shadows, and the four that are filter
// variants of tasksPageHtml. Neither group is a distinct page, so neither is evidence.
const FILTER_VARIANTS = new Set(["tasks-today", "tasks-blocked", "tasks-waiting", "tasks-this-week"]);
const registered = (Array.isArray(routeRegistry) ? routeRegistry : Object.values(routeRegistry || {}))
  .filter((route) => route && (route.canonicalRoute || route.route));
const PAGES = registered
  .filter((route) => !route.aliasShadowedBy)
  .map((route) => String(route.canonicalRoute || route.route).replace(/^#/, ""))
  .filter((slug) => !FILTER_VARIANTS.has(slug))
  .filter((slug) => !ONLY.length || ONLY.includes(slug));

const server = await startPreviewServer({ seed:{}, env:{
  COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_UX_VNEXT_SOCIAL:"true",
  COMMAND_CENTER_UX_VNEXT_OUTREACH:"true", COMMAND_CENTER_UX_VNEXT_FILES:"true",
  FOUNDER_OS_SHELL:"true", FOUNDER_OS_TODAY:"true", FOUNDER_OS_RELATIONSHIPS:"true",
  FOUNDER_OS_CAMPAIGNS:"true", FOUNDER_OS_SCOREBOARD:"true", FOUNDER_OS_LEE_PANEL:"true",
  FOUNDER_OS_PRESS:"true"
} });
const browser = await chromium.launch();
try {
  const auth = await loginOwner(server);
  const context = await browser.newContext();
  await context.addCookies(auth.cookie.split("; ").map((pair) => {
    const index = pair.indexOf("=");
    return { name:pair.slice(0, index), value:pair.slice(index + 1), url:server.baseUrl };
  }));
  await mkdir(OUT, { recursive:true });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (error) => failures.push(String(error.message).slice(0, 160)));
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height:1000 });
    for (const slug of PAGES) {
      failures.length = 0;
      await page.goto(`${server.baseUrl}/#${slug}`, { waitUntil:"load" });
      await page.waitForTimeout(900);
      const probe = await page.evaluate(() => {
        const section = document.querySelector("section.page-section.active") || document.querySelector("section.page-section");
        const shell = document.querySelector(".vnext-shell");
        return {
          section:section?.id || "",
          leOs:Boolean(shell?.classList.contains("le-os")),
          base:[...document.styleSheets].some((sheet) => String(sheet.href || "").includes("founder-os-base.css")),
          height:section?.getBoundingClientRect().height || 0
        };
      });
      const file = path.join(OUT, `page-${slug}-${width}x1000.png`);
      await page.screenshot({ path:file });
      console.log(`${slug.padEnd(28)} section=${(probe.section || "(none)").padEnd(28)} leOs=${probe.leOs} base=${probe.base} h=${Math.round(probe.height)}${failures.length ? ` ERR=${failures[0]}` : ""}`);
    }
  }
} finally { await browser.close(); await server.stop(); }
