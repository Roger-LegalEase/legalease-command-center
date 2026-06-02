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
assert.match(server, /class="nav-top-link" href="#command" data-nav-section="command"/, "Command should be a direct #command link.");
assert.match(server, /class="nav-top-link" href="#queue" data-nav-section="queue"/, "Queue should be a direct #queue link.");
assert.match(server, /class="nav-top-link" href="#sources" data-nav-section="sources"/, "Sources should be a direct #sources link.");
assert.match(server, /class="nav-top-link" href="#settings" data-nav-section="settings"/, "Settings should be a direct #settings link.");
assert.equal((server.match(/data-nav-section="/g) || []).length, 5, "Top navigation should expose exactly five visible sections.");

assert.match(server, /\.app-topbar\s*\{[^}]*overflow:\s*visible/s, "Topbar should not clip dropdowns.");
assert.match(server, /\.top-nav\s*\{[^}]*display:\s*flex[^}]*overflow:\s*visible/s, "Top nav should be a horizontal visible flex row.");
assert.match(server, /\.nav-menu-summary\.active\s*\{[^}]*background:\s*#020D66[^}]*color:\s*#fff/s, "Active nav styling should apply only to the current route.");

const topNav = server.match(/<nav class="top-nav" aria-label="Primary">([\s\S]*?)<\/nav>/)?.[1] || "";
assert.doesNotMatch(topNav, /<details class="nav-menu">/, "Primary nav should not use hover/dropdown previews.");
assert.doesNotMatch(topNav, /nav-menu-panel/, "Primary nav should not render floating preview panels.");
assert.doesNotMatch(topNav, /(?:Growth|Partners|Production|Proof|More) Home/, "Primary nav should not expose fake Home preview labels.");

console.log("top nav layout tests passed");
