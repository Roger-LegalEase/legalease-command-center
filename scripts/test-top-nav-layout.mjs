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
assert.match(nav, /class="nav-top-link" href="#social" data-nav-section="social">Social<\/a>/, "Social should be a direct #social link.");
assert.match(nav, /class="nav-top-link" href="#proof" data-nav-section="proof">Proof<\/a>/, "Proof should be a direct #proof link.");
assert.match(nav, /class="nav-top-link" href="#operator-search" data-nav-section="search">Search<\/a>/, "Search should be a direct #operator-search link.");
assert.equal((nav.match(/data-nav-section="/g) || []).length, 5, "Top navigation should expose exactly five visible sections.");
assert.doesNotMatch(nav, /Settings/, "Settings should not be a primary nav item.");
assert.match(server, /href="#settings"/, "Settings should remain reachable secondarily.");
assert.doesNotMatch(nav, />Partners<|>System<|RCAP Review|Handoff Contract|OS Health|Data Integrity|Smoke Test|Safe Mode/, "Top nav should not expose old technical labels.");

assert.match(server, /\.app-topbar\s*\{[^}]*overflow:\s*visible/s, "Topbar should not clip dropdowns.");
assert.match(server, /\.top-nav\s*\{[^}]*display:\s*flex[^}]*overflow:\s*visible/s, "Top nav should be a horizontal visible flex row.");
assert.match(server, /function closeNavMenus\(event\)/, "Nav menu close helper should exist.");
assert.match(server, /document\.addEventListener\("click", \(event\) => \{[\s\S]*?if \(!event\.target\.closest\("\.nav-menu"\)\)/, "Outside clicks should close nav menus.");
assert.match(server, /document\.querySelectorAll\("\.nav-menu-summary"\)\.forEach/, "Summary clicks should close other open menus.");

console.log("top nav layout tests passed");
