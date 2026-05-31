import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

const nav = server.match(/<nav class="sidebar-nav top-nav"[\s\S]*?<\/nav>/)?.[0] || "";

assert.match(server, /class="commercial-sidebar"/, "App shell should render a stable commercial sidebar.");
assert.match(server, /<a class="sidebar-brand" href="#today"/, "Brand lockup should link to Today.");
assert.match(server, /<nav class="sidebar-nav top-nav" aria-label="Primary">/, "Primary navigation should use sidebar top-nav.");
assert.match(nav, /href="#today" data-nav-section="today"[\s\S]*?>Today/, "Today should be a direct #today link.");
assert.match(nav, /href="#work" data-nav-section="work"[\s\S]*?>Work/, "Work should be a direct #work link.");
assert.match(nav, /href="#marketing" data-nav-section="marketing"[\s\S]*?>Marketing/, "Marketing should be a direct #marketing link.");
assert.match(nav, /href="#data-room" data-nav-section="data-room"[\s\S]*?>Data Room/, "Data Room should be a direct #data-room link.");
assert.match(nav, /href="#partnerships" data-nav-section="partnerships"[\s\S]*?>Partnerships/, "Partnerships should be a direct #partnerships link.");
assert.match(nav, /href="#kpis" data-nav-section="kpis"[\s\S]*?>KPIs/, "KPIs should be a direct #kpis link.");
assert.match(nav, /href="#proof" data-nav-section="proof"[\s\S]*?>Proof/, "Proof should be a direct #proof link.");
assert.match(nav, /href="#search" data-nav-section="search"[\s\S]*?>Search/, "Search should be a direct #search link.");
assert.equal((nav.match(/data-nav-section="/g) || []).length, 8, "Top navigation should expose the founder workspaces.");
assert.doesNotMatch(nav, /Settings/, "Settings should not be a primary nav item.");
assert.match(server, /href="#settings"/, "Settings should remain reachable secondarily.");
assert.doesNotMatch(nav, />System<|RCAP Review|Handoff Contract|OS Health|Data Integrity|Smoke Test|Safe Mode/, "Top nav should not expose old technical labels.");

assert.match(server, /\.commercial-sidebar\s*\{[^}]*display:flex/s, "Sidebar should be a stable visible app rail.");
assert.match(server, /\.sidebar-nav\s*\{[^}]*display:grid/s, "Sidebar nav should use a stable grid.");
assert.match(server, /function closeNavMenus\(event\)/, "Nav menu close helper should exist.");
assert.match(server, /document\.addEventListener\("click", \(event\) => \{[\s\S]*?if \(!event\.target\.closest\("\.nav-menu"\)\)/, "Outside clicks should close nav menus.");
assert.match(server, /document\.querySelectorAll\("\.nav-menu-summary"\)\.forEach/, "Summary clicks should close other open menus.");

console.log("top nav layout tests passed");
