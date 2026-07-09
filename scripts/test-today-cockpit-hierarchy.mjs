#!/usr/bin/env node
// Today cockpit hierarchy + brand color guard.
//
// The Today page must read like the company operating brain, not a campaign dashboard:
// company scoreboard above any campaign module, campaign analytics compressed behind a
// details toggle, honest not-wired language, and the LegalEase brand roles (navy structure,
// teal healthy, orange alert) instead of the earlier green/red direction.
//
// These are source-order checks over the client render code (same idiom as
// test-growth-right-rail-layout.mjs): they pin the shipped hierarchy without a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function sliceFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} should exist`);
  const end = source.indexOf("\n    function ", start + 10);
  return source.slice(start, end > start ? end : start + 20000);
}

const today = sliceFunction("todayAtLegalEaseHtml");
const summaryFn = sliceFunction("ckSummaryLineHtml");
const scoreboardFn = sliceFunction("ckScoreboardHtml");
const safetyModuleFn = sliceFunction("ckCampaignSafetyHtml");

// The module registry: everything between the registry const and its closing bracket.
const registryStart = source.indexOf("const CK_DASHBOARD_MODULES = [");
assert(registryStart >= 0, "dashboard module registry should exist");
const registry = source.slice(registryStart, source.indexOf("\n    ];", registryStart));
const moduleIndex = (id) => {
  const at = registry.indexOf(`id: "${id}"`);
  assert(at >= 0, `registry should declare module ${id}`);
  return at;
};

check("Today at LegalEase renders through the cockpit page", () => {
  assert(source.includes("function todayAtLegalEaseHtml()"), "today renderer exists");
  assert(source.includes("Today at LegalEase"), "page keeps its name");
  assert(source.includes("ckDashboardShellHtml(headerHtml, ctx)"), "page is built by the dashboard shell");
});

check("the dashboard is a modular grid system, not hand-placed cards", () => {
  assert(source.includes("function ckDashboardShellHtml("), "DashboardShell primitive exists");
  assert(source.includes("function ckDashboardSectionHtml("), "DashboardSection primitive exists");
  assert(source.includes("function ckDashboardGridHtml("), "DashboardGrid primitive exists");
  assert(source.includes("function ckModuleCard("), "ModuleCard primitive exists");
  assert(source.includes("grid-template-columns:repeat(12,minmax(0,1fr))"), "12-column CSS grid");
  assert(source.includes("grid-auto-flow:dense"), "dense flow fills holes");
  for (const rule of [".ck-module.size-full { grid-column:span 12; }", ".ck-module.size-wide { grid-column:span 8; }", ".ck-module.size-half { grid-column:span 6; }", ".ck-module.size-third { grid-column:span 4; }", ".ck-module.size-quarter { grid-column:span 3; }"]) {
    assert(source.includes(rule), `size rule present: ${rule}`);
  }
  assert(!source.includes("ck-panel-grid"), "the old hand-rolled row wrapper is gone");
  assert(!source.includes("ck-chart-row"), "the old hard-coded chart columns are gone");
});

check("the opening summary is company-wide, not campaign-first", () => {
  const revenue = summaryFn.indexOf("revenue is not connected yet");
  const accounts = summaryFn.indexOf("accounts created");
  const screenings = summaryFn.indexOf("screenings started");
  const campaign = summaryFn.indexOf("Campaign sending is");
  assert(revenue >= 0 && accounts >= 0 && screenings >= 0, "summary covers revenue, accounts, screenings");
  assert(campaign > screenings, "campaign is a closing clause, after company numbers");
  assert(summaryFn.indexOf("stripeConnected") < summaryFn.indexOf("campaignClause"), "revenue evaluated before the campaign clause");
});

check("company scoreboard sits above any campaign module in registry order", () => {
  const sections = source.slice(source.indexOf("const CK_DASHBOARD_SECTIONS"), registryStart);
  assert(sections.indexOf('"scoreboard"') < sections.indexOf('"operations"'), "scoreboard section comes before operations");
  assert(moduleIndex("company-kpis") < moduleIndex("campaign-safety"), "company KPIs registered before campaign safety");
  assert(moduleIndex("campaign-safety") < moduleIndex("campaign-details"), "campaign charts come after the safety module");
  assert(registry.includes('section: "scoreboard", size: "full", order: 10'), "scoreboard KPIs lead the scoreboard section");
});

check("revenue, web visits, accounts, screenings appear before campaign metrics", () => {
  for (const label of ["Revenue", "Web visits", "Accounts created", "Screenings started", "Reached checkout"]) {
    assert(scoreboardFn.includes(`"${label}"`), `scoreboard has ${label}`);
  }
  assert(moduleIndex("conversion-funnel") < moduleIndex("campaign-safety"), "growth modules precede campaign safety");
});

check("Campaign at a glance no longer leads the page", () => {
  assert(!today.includes("Campaign at a glance"), "the old campaign-first section name is gone from the top-level page");
});

check("campaign charts are conditional behind the details toggle or risk", () => {
  assert(registry.includes('ctx.detailsShown ? "ready" : "hidden"'), "details module hidden unless shown");
  assert(source.includes("ckCampaignDetailsOverride === null ? ckCampaignRisk(view) : ckCampaignDetailsOverride"),
    "risk opens details by default; the operator toggle always wins");
  assert(safetyModuleFn.includes("View campaign details"), "safety module carries the toggle");
});

check("missing traffic/account data uses honest not-wired language, no fake metrics", () => {
  // Web visits is now source-aware: it reads landing_page_viewed product events and
  // connects ONLY behind the same funnelConnected flag as the other funnel tiles.
  assert(scoreboardFn.includes('"Web visits", "search", Boolean(gm.funnelConnected)'), "web visits is source-aware, gated on the product funnel");
  assert(scoreboardFn.includes("gm.webVisits"), "web visits reads the aggregated landing_page_viewed count");
  assert(source.includes("Not wired yet"), "not-wired label present");
  assert(scoreboardFn.includes("signupsConnected"), "accounts card is source-aware");
  assert(scoreboardFn.includes("funnelConnected"), "screenings card is source-aware");
  assert(!/ckScoreCardHtml\("Web visits"[^)]*,\s*true/.test(scoreboardFn), "web visits never hardcodes a connected state");
});

check("derived safety posture is used with Unverified fallback", () => {
  assert(safetyModuleFn.includes("emailPostureLabel()"), "campaign safety uses the derived posture label");
  assert(source.includes("Email sending: Unverified"), "unknown posture falls back to Unverified");
  assert(source.includes("Live social posting: Unverified"), "social posture falls back to Unverified");
});

check("orange marks alert states and Needs Roger, not healthy states", () => {
  assert(source.includes('ck-pill orange"><span class="ck-dot"></span>Needs you'), "needs-you pill is orange");
  const cockpitCss = source.slice(source.indexOf("body.ck-wash"), source.indexOf(".today-cockpit .deploy-truth-inline"));
  assert(cockpitCss.includes("--ck-crit:#C2410C"), "critical tone is deep orange, not red");
  assert(!cockpitCss.includes("#B91C1C") && !cockpitCss.includes("#0E9F5D"), "old red/green accents removed from cockpit css");
});

check("teal marks healthy/active states instead of green", () => {
  assert(source.includes('ck-pill teal"><span class="ck-dot"></span>Running safely'), "running safely pill is teal");
  assert(source.includes('ck-pill teal"><span class="ck-dot"></span>Database connected'), "database healthy pill is teal");
  const cockpitCss = source.slice(source.indexOf("body.ck-wash"), source.indexOf(".today-cockpit .deploy-truth-inline"));
  assert(cockpitCss.includes("--ck-teal:#0C7D75"), "teal token defined");
  assert(cockpitCss.includes(".ck-btn.primary { background:var(--ck-teal)"), "primary safe action is teal");
});

check("navy anchors structure, headings, and stable status", () => {
  const cockpitCss = source.slice(source.indexOf("body.ck-wash"), source.indexOf(".today-cockpit .deploy-truth-inline"));
  assert(cockpitCss.includes("--ck-ink:#0A1A5C"), "primary ink is LegalEase navy");
  assert(source.includes('ck-pill navy'), "stable status uses the navy pill");
});

check("the background wash is teal-tinted, not the old green", () => {
  assert(source.includes("body.ck-wash { background:#E3F1EF; }"), "teal wash present");
  assert(!source.includes("#DEF0E1"), "old mint background removed");
  assert(source.includes('classList.toggle("ck-wash"'), "wash toggles with the Today view");
});

check("card visualizations stay honest about their sources", () => {
  const moneyViz = sliceFunction("ckMoneyVizHtml");
  assert(moneyViz.includes("Revenue chart appears when payments connect"), "money chart has a no-source placeholder");
  assert(moneyViz.includes("money.daily"), "money chart draws only from the real per-day breakdown");
  const stuckViz = sliceFunction("ckPeopleStuckVizHtml");
  assert(stuckViz.includes("Nobody is stuck right now"), "people-stuck bars have an honest all-zero state");
  assert(stuckViz.includes("ck-meter steel"), "people-stuck bars use the neutral steel tone, not alert orange");
});

check("the dashboard carries visual modules for growth, social, and inbox", () => {
  for (const id of ["conversion-funnel", "social-pulse", "inbox", "watchlist", "people-stuck", "money"]) {
    moduleIndex(id);
  }
  assert(registry.includes("ckFunnelStripHtml()"), "conversion funnel strip rendered from the registry");
  assert(registry.includes("ckSocialPulseHtml()"), "social pulse module rendered from the registry");
  assert(registry.includes("ckInboxPulseHtml()"), "comments and messages module rendered from the registry");
  assert(sliceFunction("ckWatchlistModuleHtml").includes("ckWatchStatusHtml(ctx.v)"), "watchlist carries the source-status dots");
  assert(moduleIndex("conversion-funnel") < moduleIndex("campaign-details"), "growth funnel stays above campaign details");
});

check("social and inbox modules are honest, never fabricated", () => {
  const social = sliceFunction("ckSocialPulseHtml");
  assert(social.includes("state.socialAccounts") && social.includes("state.posts"), "social pulse reads only real state");
  assert(social.includes("Followers and engagement appear when a social account connects"), "no follower numbers are invented");
  assert(!/followers?\s*[:=]\s*\d/i.test(social), "no hardcoded follower counts");
  const inbox = sliceFunction("ckInboxPulseHtml");
  assert(inbox.includes("state.growthInbox"), "inbox counter reads the real growth inbox");
  assert(inbox.includes("Not connected yet"), "social comments/DMs use the honest not-connected state");
  const watch = sliceFunction("ckWatchStatusHtml");
  assert(watch.includes('"Web traffic", "not wired"'), "traffic is explicitly not wired");
  assert(watch.includes("safetyPosture"), "watch dots derive from the real safety posture");
});

check("money extras stay honest about unfetched numbers", () => {
  const counters = sliceFunction("ckMoneyCountersHtml");
  assert(counters.includes('"Not wired yet", "Failed payments"'), "failed payments is not-wired, not a fake zero");
  assert(counters.includes('"Not wired yet", "Refunds"'), "refunds is not-wired, not a fake zero");
  assert(counters.includes("stripeRevenue.fetchedAt"), "sync time comes from the real snapshot");
});

check("#daily-run still renders and the Daily Run button remains", () => {
  assert(today.includes("location.hash='daily-run'"), "Open Daily Run button present");
  assert(source.includes("function todaySinglePaneHtml"), "daily-run pane renderer exists");
});

console.log(`\ntest-today-cockpit-hierarchy: all ${passed} checks passed.`);
