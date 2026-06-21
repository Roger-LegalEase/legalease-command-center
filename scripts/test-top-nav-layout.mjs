import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

assert.match(server, /<header class="app-topbar">/, "App shell should render a stable app-topbar.");
assert.match(server, /<a class="brand-lockup" href="#overview">/, "Brand lockup should link to Today.");
assert.match(server, /<nav class="top-nav" aria-label="Primary">/, "Primary navigation should use top-nav.");
assert.match(server, /class="nav-top-link" href="#today" data-nav-section="today"/, "Today should be a direct #today link.");
assert.match(server, /class="nav-top-link" href="#growth" data-nav-section="growth"/, "Growth should be a direct #growth link.");
assert.match(server, /class="nav-top-link" href="#partner-hub" data-nav-section="partners"/, "Partners should route to #partner-hub.");
assert.match(server, /class="nav-top-link" href="#production" data-nav-section="production"/, "Production should be a direct #production link.");
assert.match(server, /class="nav-top-link" href="#proof" data-nav-section="proof"/, "Proof should be a direct #proof link.");
assert.match(server, /class="nav-top-link" href="#settings" data-nav-section="settings"/, "Settings & Health should route to #settings.");
assert.match(server, /class="nav-top-link" href="#le-e" data-nav-section="lee"/, "Le-E assistant should be available from top nav.");
assert.equal((server.match(/data-nav-section="/g) || []).length, 7, "Top navigation should expose six surfaces plus Le-E.");

assert.match(server, /\.app-topbar\s*\{[^}]*overflow:\s*visible/s, "Topbar should not clip dropdowns.");
assert.match(server, /\.top-nav\s*\{[^}]*display:\s*flex[^}]*overflow:\s*visible/s, "Top nav should be a horizontal visible flex row.");
assert.match(server, /\.nav-menu-summary\.active\s*\{[^}]*background:\s*#020D66[^}]*color:\s*#fff/s, "Active nav styling should apply only to the current route.");

const topNav = server.match(/<nav class="top-nav" aria-label="Primary">([\s\S]*?)<\/nav>/)?.[1] || "";
assert.doesNotMatch(topNav, /<details class="nav-menu">/, "Primary nav should not use hover/dropdown previews.");
assert.doesNotMatch(topNav, /nav-menu-panel/, "Primary nav should not render floating preview panels.");
assert.doesNotMatch(topNav, /(?:Growth|Partners|Production|Proof|More) Home/, "Primary nav should not expose fake Home preview labels.");

console.log("top nav layout tests passed");
