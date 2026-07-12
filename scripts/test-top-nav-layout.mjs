import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

assert.match(server, /<header class="app-topbar">/, "App shell should render a stable app-topbar.");
assert.match(server, /<a class="brand-lockup" href="#today">/, "Brand lockup should land on Today (cockpit merged into Today, Phase N).");
assert.match(server, /<nav class="top-nav" aria-label="Primary">/, "Primary navigation should use top-nav.");
// Phase N operator-mode nav (usability overhaul, approved 2026-07-12): exactly six items
// shaped around Roger's day. Everything else lives under More; legacy hashes stay aliased.
assert.match(server, /class="nav-top-link" href="#today" data-nav-section="today"/, "Today should be a direct #today link.");
assert.match(server, /class="nav-top-link" href="#decisions" data-nav-section="queue"/, "Queue should land on the company queue (#decisions), where prospect approvals gate B2 sends.");
assert.match(server, /class="nav-top-link" href="#campaigns" data-nav-section="campaigns"/, "Campaigns should be a direct #campaigns link.");
assert.match(server, /class="nav-top-link" href="#queue" data-nav-section="review-desk"/, "Review Desk should land on the social review desk (#queue).");
assert.match(server, /class="nav-top-link" href="#reports" data-nav-section="reports"/, "Reports should be a direct #reports link.");
assert.match(server, /class="nav-top-link" href="#more" data-nav-section="more"/, "More should hold everything else.");
assert.equal((server.match(/data-nav-section="/g) || []).length, 6, "Top navigation should expose exactly the six operator-mode items.");
assert.match(server, /leeBubbleHtml\(\)/, "Le-E must stay reachable everywhere via the floating bubble (Roger requirement).");
assert.match(server, /cockpit:"today"/, "#cockpit must alias to Today so old links keep working.");

assert.match(server, /\.app-topbar\s*\{[^}]*overflow:\s*visible/s, "Topbar should not clip dropdowns.");
assert.match(server, /\.top-nav\s*\{[^}]*display:\s*flex[^}]*overflow:\s*visible/s, "Top nav should be a horizontal visible flex row.");
assert.match(server, /\.nav-menu-summary\.active\s*\{[^}]*background:\s*var\(--ink\)[^}]*color:\s*#fff/s, "Active nav styling should apply only to the current route.");

const topNav = server.match(/<nav class="top-nav" aria-label="Primary">([\s\S]*?)<\/nav>/)?.[1] || "";
assert.doesNotMatch(topNav, /<details class="nav-menu">/, "Primary nav should not use hover/dropdown previews.");
assert.doesNotMatch(topNav, /nav-menu-panel/, "Primary nav should not render floating preview panels.");
assert.doesNotMatch(topNav, /(?:Growth|Partners|Production|Proof|More) Home/, "Primary nav should not expose fake Home preview labels.");

console.log("top nav layout tests passed");
