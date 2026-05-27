import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

assert.match(server, /<header class="app-topbar">/, "App shell should render a stable app-topbar.");
assert.match(server, /<a class="brand-lockup" href="#overview">/, "Brand lockup should link to Today.");
assert.match(server, /<nav class="top-nav" aria-label="Primary">/, "Primary navigation should use top-nav.");
assert.match(server, /class="nav-top-link" href="#overview" data-nav-section="today"/, "Today should remain a direct #overview link.");
assert.match(server, /<details class="nav-menu"><summary class="nav-menu-summary" data-nav-section="growth">Growth<\/summary>/, "Growth should be a dropdown summary.");
assert.match(server, /<details class="nav-menu"><summary class="nav-menu-summary" data-nav-section="partners">Partners<\/summary>/, "Partners should be a dropdown summary.");
assert.match(server, /<details class="nav-menu"><summary class="nav-menu-summary" data-nav-section="production">Production<\/summary>/, "Production should be a dropdown summary.");
assert.match(server, /<details class="nav-menu"><summary class="nav-menu-summary" data-nav-section="proof">Proof<\/summary>/, "Proof should be a dropdown summary.");
assert.match(server, /<details class="nav-menu"><summary class="nav-menu-summary" data-nav-section="more">More<\/summary>/, "More should be a dropdown summary.");
assert.equal((server.match(/data-nav-section="/g) || []).length, 6, "Top navigation should expose exactly six visible sections.");

assert.match(server, /\.app-topbar\s*\{[^}]*overflow:\s*visible/s, "Topbar should not clip dropdowns.");
assert.match(server, /\.top-nav\s*\{[^}]*display:\s*flex[^}]*overflow:\s*visible/s, "Top nav should be a horizontal visible flex row.");
assert.match(server, /\.nav-menu\s*\{[^}]*position:\s*relative[^}]*overflow:\s*visible/s, "Nav menu details should anchor absolute panels.");
assert.match(server, /\.nav-menu-panel\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*200/s, "Nav menu panel should be absolutely positioned above content.");
assert.match(server, /\.nav-menu-summary::-webkit-details-marker\s*\{[^}]*display:\s*none/s, "Summary marker should be hidden.");
assert.match(server, /nav: topnav-fixed-v1/, "App shell should expose the topnav-fixed-v1 marker.");
assert.match(server, /function closeNavMenus\(event\)/, "Nav menu close helper should exist.");
assert.match(server, /document\.addEventListener\("click", \(event\) => \{[\s\S]*?if \(!event\.target\.closest\("\.nav-menu"\)\)/, "Outside clicks should close nav menus.");
assert.match(server, /document\.querySelectorAll\("\.nav-menu-summary"\)\.forEach/, "Summary clicks should close other open menus.");

console.log("top nav layout tests passed");
