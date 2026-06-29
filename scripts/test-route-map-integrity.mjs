import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const routeAliases = source.match(/const routeAliases = \{([\s\S]*?)\};/)?.[1] || "";
const knownPages = source.match(/const knownPages = \[([\s\S]*?)\];/)?.[1] || "";
const navBlock = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const navSectionBlock = source.match(/function navSectionForPage\(pageId = "today"\) \{([\s\S]*?)\n    \}/)?.[1] || "";

assert(navBlock, "Top nav should render.");
for (const [label, href, section] of [
  ["Cockpit", "#cockpit", "cockpit"],
  ["Today", "#today", "today"],
  ["Growth", "#growth", "growth"],
  ["Partners", "#partners", "partners"],
  ["Production", "#production", "production"],
  ["Proof", "#proof", "proof"],
  ["Settings &amp; Health", "#settings", "settings"],
  ["Le-E", "#le-e", "lee"]
]) {
  assert(navBlock.includes(`href="${href}"`), `${label} should be a primary nav link.`);
  assert(navBlock.includes(`data-nav-section="${section}"`), `${label} should have a stable nav section.`);
}

assert.equal((navBlock.match(/class="nav-top-link"/g) || []).length, 8, "Primary nav should expose the Cockpit landing, six founder-facing surfaces, plus Le-E.");
for (const retiredLabel of [">Command<", ">Queue<", ">Sources<", ">More<"]) {
  assert(!navBlock.includes(retiredLabel), `Primary nav should not expose retired label ${retiredLabel}.`);
}

for (const alias of [
  'overview:"today"',
  '"partner-hub":"partners"',
  'command:"growth"',
  'marketing:"growth"',
  'social:"growth"',
  '"social-media":"growth"',
  '"content-calendar":"growth"',
  'posts:"growth"',
  'rcap:"production-activation-rcap"',
  '"app-status":"os-health"',
  'recovery:"safe-mode"',
  'guide:"operator-manual"',
  'privacy:"settings"'
]) {
  assert(routeAliases.includes(alias), `Route alias should be preserved: ${alias}`);
}

for (const route of [
  "cockpit",
  "upload",
  "contacts",
  "prospects",
  "revenue",
  "meetings",
  "support",
  "pages",
  "today",
  "overview",
  "growth",
  "partner-hub",
  "production",
  "proof",
  "more",
  "partners",
  "production-activation-rcap",
  "queue",
  "sources",
  "content-bank",
  "assets",
  "posted",
  "settings",
  "os-health",
  "safe-mode"
]) {
  assert(knownPages.includes(`"${route}"`), `#${route} should remain in the route registry.`);
}

for (const render of [
  'safeRenderModule("growth", () => growthWorkspaceHtml(pageClass))',
  'safeRenderModule("production", () => productionWorkspaceHtml(pageClass))',
  'safeRenderModule("proof", () => proofWorkspaceHtml(pageClass))',
  'safeRenderModule("more", () => moreWorkspaceHtml(pageClass))',
  'safeRenderModule("partners", () => partnersPageHtml(pageClass))',
  'pageId === "production-activation-rcap" ? rcapReviewWorkspaceHtml(pageClass) : ""'
]) {
  assert(source.includes(render), `Legacy workspace renderer should remain available: ${render}`);
}

for (const section of ["command", "queue", "sources", "settings"]) {
  assert(navSectionBlock.includes(`"${section}"`) || routeAliases.includes(`${section}:`), `${section} compatibility route should remain visible to the route map.`);
}

for (const section of ["cockpit", "today", "growth", "partners", "production", "proof", "settings", "lee"]) {
  assert(navSectionBlock.includes(`return "${section}"`), `${section} active nav mapping should exist.`);
}

assert(navSectionBlock.includes('"production"') && navSectionBlock.includes('return "production"'), "#production should remain available and map to Production.");
assert(navSectionBlock.includes('"proof"') && navSectionBlock.includes('return "proof"'), "#proof should remain available and map to Proof.");
assert(navSectionBlock.includes('"more"') && navSectionBlock.includes('return "settings"'), "#more should remain available but map to Settings.");

assert.match(source, /normalizedPage = routeAliases\[requestedPage\] \|\| requestedPage/, "Aliases should normalize before route validation.");
assert.match(source, /knownPages\.includes\(normalizedPage\) \? normalizedPage : "today"/, "Unknown routes should fall back to Today.");
assert(/liveGatesCount[^,\n]*0|Publishing is off/i.test(source), "Publishing-off/live-gates-0 signal should remain present.");

console.log("route map integrity tests passed");
