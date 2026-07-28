// Renders the 11 concept screens and the composite screen set FROM the sanitized prototype.
//
// The package ships PNGs, and a PNG carries its content as pixels — no secret or PII scanner in
// this repository reads them (for non-text binaries the scanner checks the filename only). So the
// images must be regenerated from sanitized source rather than trusted, or a name removed from
// build_prototype.py survives in the screenshots.
//
// Usage, from the repository root:  node docs/design/legalease-command-center-concept/build_screenshots.mjs
// Rebuild the HTML first:           python3 docs/design/legalease-command-center-concept/build_prototype.py

import { chromium } from "@playwright/test";
import path from "node:path";
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROTOTYPE = path.join(DIR, "command-center-concept.html");

// file stem -> prototype screen key -> gallery caption
const SCREENS = [
  ["01-today", "today", "Today"],
  ["02-today-action-panel", "todayAction", "Universal action panel"],
  ["03-relationships", "relationships", "Relationships"],
  ["04-relationship-detail", "relationshipDetail", "Relationship detail"],
  ["05-campaigns", "campaigns", "Campaigns"],
  ["06-social-campaign", "socialCampaign", "Social campaign"],
  ["07-scoreboard", "scoreboard", "Scoreboard"],
  ["08-global-search", "searchOverlay", "Global search"],
  ["09-global-create", "createOverlay", "Global create"],
  ["10-lee-panel", "leeOverlay", "Le-E side panel"],
  ["11-settings", "settings", "Settings & safety"]
];

const browser = await chromium.launch();
// 1600x1000 composition at 2x, matching the package's documented 3200x2000 exports.
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });

for (const [stem, key] of SCREENS) {
  await page.goto(`file://${PROTOTYPE}?screen=${key}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(DIR, "screens", `${stem}.png`) });
  console.log("rendered", stem);
}

// Composite contact sheet, built from the freshly rendered (sanitized) screens.
const cards = SCREENS.map(([stem, , caption], index) => `
  <figure>
    <img src="screens/${stem}.png" alt="${caption}" />
    <figcaption><span>${String(index + 1).padStart(2, "0")} · ${caption}</span><b>${String(index + 1).padStart(2, "0")}</b></figcaption>
  </figure>`).join("");

const sheet = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:2560px;background:#f5f6f8;font-family:-apple-system,"Segoe UI",Roboto,sans-serif}
  header{background:#0b1424;color:#fff;padding:44px 56px;display:flex;align-items:center;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:20px}
  .mark{width:64px;height:64px;border-radius:16px;background:#ff3b00;display:flex;align-items:center;justify-content:center;font:700 34px/1 sans-serif}
  h1{font-size:46px;letter-spacing:-.5px}
  header p{color:#98a2b3;font-size:20px;margin-top:6px}
  .tag{background:#192842;color:#ff3b00;font-weight:700;font-size:18px;letter-spacing:2px;padding:14px 22px;border-radius:10px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:34px;padding:44px 56px}
  figure{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(16,24,40,.10)}
  figure img{display:block;width:100%}
  figcaption{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;font-size:26px;font-weight:700;color:#182230}
  figcaption b{color:#ff3b00}
</style></head><body>
  <header>
    <div class="brand"><div class="mark">L</div><div><h1>LegalEase Command Center</h1>
    <p>Solo-operator product concept · 11 interface screens · synthetic sample data</p></div></div>
    <div class="tag">FOUNDER OPERATING SYSTEM</div>
  </header>
  <div class="grid">${cards}</div>
</body></html>`;

// Written to a real file in the package directory so the relative screens/ paths resolve;
// setContent() renders from about:blank, which cannot load file:// images.
const sheetFile = path.join(DIR, "_screen-set.build.html");
writeFileSync(sheetFile, sheet);
const sheetPage = await browser.newPage({ viewport: { width: 2560, height: 1400 }, deviceScaleFactor: 1 });
await sheetPage.goto(`file://${sheetFile}`, { waitUntil: "networkidle" });
await sheetPage.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await sheetPage.screenshot({ path: path.join(DIR, "LegalEase-Command-Center-Screen-Set.png"), fullPage: true });
rmSync(sheetFile, { force: true });
console.log("rendered LegalEase-Command-Center-Screen-Set.png");

await browser.close();
