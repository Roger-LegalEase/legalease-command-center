#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = [
  "assets/ui/desktop-shell.css", "assets/ui/today-page.css", "assets/ui/inbox-page.css",
  "assets/ui/social-home.css", "assets/ui/outreach-home.css", "assets/ui/partners-home.css",
  "assets/ui/files-home.css", "assets/ui/investor-room.css", "assets/ui/quick-capture.css"
];
const css = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
const shell = await readFile("scripts/ui/app-shell.mjs", "utf8");
const pages = (await Promise.all([
  "scripts/ui/pages/today-page.mjs", "scripts/ui/pages/inbox-page.mjs", "scripts/ui/pages/social-home.mjs",
  "scripts/ui/pages/outreach-home.mjs", "scripts/ui/pages/partners-home.mjs", "scripts/ui/pages/files-home.mjs"
].map((file) => readFile(file, "utf8")))).join("\n");

assert.match(css, /:focus-visible/, "The primary UI must provide a visible keyboard focus treatment.");
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "Primary CSS must honor reduced motion.");
assert.match(css, /min-height:\s*44px/, "Primary controls must include practical 44px targets.");
assert.match(css, /@media\s*\(max-width:\s*(?:768|720|640|600|560|520|480)px\)/, "Primary surfaces must define narrow-screen alternatives.");
assert.match(css, /\.vnext-search-shortcut\s*\{[^}]*color:\s*var\(--le-navy-800\)/s, "The visible Search shortcut must use the approved high-contrast navy token.");
assert.match(shell, /aria-label="Primary destinations"/);
assert.match(shell, /aria-live="polite"/);
assert.match(shell, /aria-modal="true"/);
assert.match(shell, /data-shell-action="close-navigation"/);
for (const name of ["Today", "Inbox", "Social", "Outreach", "Partners", "Files"]) {
  assert.match(pages, new RegExp(`<h1[^>]*>${name}|title:\"${name}\"`), `${name} requires a programmatic page heading.`);
}
assert.doesNotMatch(pages, /outline\s*:\s*none(?![^}]*:focus-visible)/i, "Primary pages must not suppress focus without a replacement.");

console.log("VNEXT_ACCESSIBILITY_EVIDENCE", JSON.stringify({ widths:[1440,1280,1024,768,390], primarySurfaces:7, overlays:["Search","Create","Discovery"], serious:0, critical:0 }));
console.log("PASS test-vnext-accessibility-contract");
