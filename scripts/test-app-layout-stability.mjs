import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = server.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "m"));
  return match?.[1] || "";
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

assertContains(server, /<header class="app-topbar">/, "Global shell topbar should render in hosted mode.");
assertContains(server, /class="top-nav"[\s\S]*Today[\s\S]*Work[\s\S]*Social[\s\S]*Proof[\s\S]*Search/, "Founder-facing top navigation should remain stable.");
assertContains(server, /href="#settings"/, "Settings should remain available outside the primary workflow nav.");
assertContains(server, /id="app"/, "Route host should remain available for client rendering.");
assert.doesNotMatch(server, /shell:\s*app-layout-stable-v1|controls:\s*button-audit-v1|nav:\s*topnav-fixed-v1/, "Normal shell should not expose old debug markers.");
assertContains(server, /\.app-section,\s*\.page-section,\s*\.command-page,\s*\.section-page/, "Stable page container CSS should exist.");
assertContains(server, /padding:\s*24px 32px 96px/, "Stable page container should reserve bottom padding for Le-E.");
assertContains(server, /@media\s*\(max-width:980px\)[\s\S]*padding:\s*20px 20px 96px/, "Tablet page padding should be stable.");
assertContains(server, /@media\s*\(max-width:640px\)[\s\S]*padding:\s*16px 16px 96px/, "Mobile page padding should be stable.");
assertContains(server, /\.stable-two-column[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(280px,\s*420px\)/, "Standard two-column layout should use minmax constraints.");
assertContains(server, /\.panel,\s*\.card,\s*\.drawer-card,\s*\.metric-row[\s\S]*overflow-wrap:\s*break-word/, "Cards should contain long text.");
assertContains(server, /\.connector-grid[\s\S]*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\)/, "Automation connector grid should be responsive.");
assertContains(server, /\.content-filter-bar[\s\S]*flex-wrap:\s*wrap/, "Ideas filter row should wrap.");
assertContains(server, /\.settings-card-grid[\s\S]*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/, "Settings cards should use responsive cards.");
assertContains(server, /\.channel-grid[\s\S]*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/, "Live publishing channel cards should use safe responsive widths.");
assertContains(server, /\.lee-bubble-safe-space/, "Le-E overlap protection utility should exist.");
assertContains(server, /class="connector-grid"/, "Automation Inbox should use connector-grid.");
assertContains(server, /class="stable-two-column section automation-controls"/, "Automation controls should use stable two-column layout.");
assertContains(server, /class="content-filter-bar"/, "Ideas page should use stable filter row.");
assertContains(server, /class="settings-card-grid"/, "Settings should use responsive card grids.");
assert.doesNotMatch(server, /\.page-section\.active\s*\{\s*display:grid;\s*\}/, "Active page sections should not force every page into grid display.");

console.log("app layout stability tests passed");
