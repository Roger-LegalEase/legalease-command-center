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

check("Today at LegalEase renders through the cockpit page", () => {
  assert(source.includes("function todayAtLegalEaseHtml()"), "today renderer exists");
  assert(source.includes("Today at LegalEase"), "page keeps its name");
  assert(today.includes("today-cockpit"), "cockpit skin class present");
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

check("company scoreboard sits above any campaign module in source order", () => {
  const scoreboard = today.indexOf("ckScoreboardHtml()");
  const campaignSafety = today.indexOf("ckCampaignSafetyHtml(");
  const campaignDetails = today.indexOf("ckCampaignDetailsHtml(");
  assert(scoreboard >= 0, "scoreboard rendered");
  assert(campaignSafety > scoreboard, "campaign safety module comes after the scoreboard");
  assert(campaignDetails > campaignSafety, "campaign charts come after the safety module");
});

check("revenue, web visits, accounts, screenings appear before campaign metrics", () => {
  for (const label of ["Revenue", "Web visits", "Accounts created", "Screenings started", "Reached checkout"]) {
    assert(scoreboardFn.includes(`"${label}"`), `scoreboard has ${label}`);
  }
  assert(today.indexOf("ckScoreboardHtml()") < today.indexOf("Campaign safety") || today.indexOf("Campaign safety") === -1,
    "scoreboard precedes campaign safety copy");
});

check("Campaign at a glance no longer leads the page", () => {
  assert(!today.includes("Campaign at a glance"), "the old campaign-first section name is gone from the top-level page");
});

check("campaign charts are conditional behind the details toggle or risk", () => {
  assert(today.includes("detailsShown ? ckCampaignDetailsHtml(v)"), "details render only when shown");
  assert(source.includes("ckCampaignDetailsOverride === null ? ckCampaignRisk(view) : ckCampaignDetailsOverride"),
    "risk opens details by default; the operator toggle always wins");
  assert(safetyModuleFn.includes("View campaign details"), "safety module carries the toggle");
});

check("missing traffic/account data uses honest not-wired language, no fake metrics", () => {
  assert(scoreboardFn.includes('"Web visits", "search", false'), "web visits is explicitly not wired (no source exists)");
  assert(source.includes("Not wired yet"), "not-wired label present");
  assert(scoreboardFn.includes("signupsConnected"), "accounts card is source-aware");
  assert(scoreboardFn.includes("funnelConnected"), "screenings card is source-aware");
  assert(!/ckScoreCardHtml\("Web visits"[^)]*true/.test(scoreboardFn), "web visits never claims a live value");
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

check("#daily-run still renders and the Daily Run button remains", () => {
  assert(today.includes("location.hash='daily-run'"), "Open Daily Run button present");
  assert(source.includes("function todaySinglePaneHtml"), "daily-run pane renderer exists");
});

console.log(`\ntest-today-cockpit-hierarchy: all ${passed} checks passed.`);
