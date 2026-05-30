import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

const nav = server.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";

assert.match(server, /<header class="app-topbar">/, "App shell should render a stable app-topbar.");
assert.match(server, /<a class="brand-lockup" href="#overview">/, "Brand lockup should link to Today.");
assert.match(server, /<nav class="top-nav" aria-label="Primary">/, "Primary navigation should use top-nav.");
assert.match(nav, /class="nav-top-link" href="#overview" data-nav-section="today">Today<\/a>/, "Today should be a direct #overview link.");
assert.match(nav, /class="nav-top-link" href="#work" data-nav-section="work">Work<\/a>/, "Work should be a direct #work link.");
assert.match(nav, /class="nav-top-link" href="#proof" data-nav-section="proof">Proof<\/a>/, "Proof should be a direct #proof link.");
assert.match(nav, /class="nav-top-link" href="#operator-search" data-nav-section="search">Search<\/a>/, "Search should be a direct #operator-search link.");
assert.match(nav, /<details class="nav-menu"><summary class="nav-menu-summary" data-nav-section="settings">Settings<\/summary>/, "Settings should group secondary pages.");
assert.equal((nav.match(/data-nav-section="/g) || []).length, 5, "Top navigation should expose exactly five visible sections.");
assert.match(nav, /<strong>Daily<\/strong><a href="#morning-brief">Morning Brief<\/a><a href="#daily-closeout">Daily Closeout<\/a><a href="#operating-memory">Notes &amp; Decisions<\/a>/, "Settings menu should group daily routes.");
assert.match(nav, /<strong>Advanced<\/strong><a href="#settings">Settings Home<\/a><a href="#os-health">App Status<\/a><a href="#data-integrity">Data Check<\/a><a href="#smoke-test">Self-Check<\/a><a href="#roles">Team Roles<\/a><a href="#operator-manual">Guide<\/a><a href="#safe-mode">Recovery Mode<\/a>/, "Settings menu should group advanced routes with founder labels.");
assert.doesNotMatch(nav, />Partners<|>System<|RCAP Review|Handoff Contract|OS Health|Data Integrity|Smoke Test|Safe Mode/, "Top nav should not expose old technical labels.");

assert.match(server, /\.app-topbar\s*\{[^}]*overflow:\s*visible/s, "Topbar should not clip dropdowns.");
assert.match(server, /\.top-nav\s*\{[^}]*display:\s*flex[^}]*overflow:\s*visible/s, "Top nav should be a horizontal visible flex row.");
assert.match(server, /\.nav-menu\s*\{[^}]*position:\s*relative[^}]*overflow:\s*visible/s, "Nav menu details should anchor absolute panels.");
assert.match(server, /\.nav-menu-panel\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*200/s, "Nav menu panel should be absolutely positioned above content.");
assert.match(server, /\.nav-menu-summary::-webkit-details-marker\s*\{[^}]*display:\s*none/s, "Summary marker should be hidden.");
assert.match(server, /function closeNavMenus\(event\)/, "Nav menu close helper should exist.");
assert.match(server, /document\.addEventListener\("click", \(event\) => \{[\s\S]*?if \(!event\.target\.closest\("\.nav-menu"\)\)/, "Outside clicks should close nav menus.");
assert.match(server, /document\.querySelectorAll\("\.nav-menu-summary"\)\.forEach/, "Summary clicks should close other open menus.");

console.log("top nav layout tests passed");
