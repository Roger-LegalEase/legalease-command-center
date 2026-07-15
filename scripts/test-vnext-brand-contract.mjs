import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";

import {
  APPROVED_FONT_STACK,
  APPROVED_VISUAL_REFERENCE_PATH,
  APPROVED_WHITE_LOGO_PATH,
  DESIGN_SYSTEM_SHOWCASE_PATH,
  OFFICIAL_COLORS,
  TOKEN_STYLESHEET_PATH,
  brandContract
} from "./ui/brand-contract.mjs";
import { renderDesignSystemShowcase } from "./ui/design-system-showcase.mjs";
import { routeRegistry } from "./ui/navigation.mjs";

const requiredCoreTokens = Object.freeze({
  "--le-navy-950":"#071E33",
  "--le-navy-900":"#0B2942",
  "--le-navy-800":"#123A59",
  "--le-teal-500":"#78D2CB",
  "--le-teal-600":"#52BEB7",
  "--le-teal-100":"#E8F7F5",
  "--le-orange-600":"#F04800",
  "--le-orange-700":"#D84100",
  "--le-orange-100":"#FFF0E8",
  "--le-page":"#F4F7F8",
  "--le-surface":"#FFFFFF",
  "--le-surface-warm":"#FCFDFD",
  "--le-border":"#DCE5E8",
  "--le-text":"#142433",
  "--le-text-muted":"#60717D"
});

const tokenSource = readFileSync(TOKEN_STYLESHEET_PATH, "utf8");
const brandSource = readFileSync("scripts/ui/brand-contract.mjs", "utf8");
const showcaseSource = readFileSync("scripts/ui/design-system-showcase.mjs", "utf8");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const requestSecuritySource = readFileSync("scripts/request-security.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const showcaseHtml = renderDesignSystemShowcase();

assert.ok(existsSync(TOKEN_STYLESHEET_PATH), "The approved token stylesheet must exist.");
const tokenEntries = [...tokenSource.matchAll(/^\s*(--le-[a-z0-9-]+):\s*([^;]+);/gmi)]
  .map((match) => [match[1], match[2].trim()]);
const tokenMap = new Map(tokenEntries);
assert.equal(tokenMap.size, tokenEntries.length, "Token names must be unique.");
for (const [name, value] of Object.entries(requiredCoreTokens)) {
  assert.equal(tokenMap.get(name), value, `${name} must keep its approved exact value.`);
}
assert.equal(OFFICIAL_COLORS.orange600.value, "#F04800");
for (const family of ["success", "warning", "danger", "information"]) {
  for (const suffix of ["700", "100", "border"]) {
    assert.ok(tokenMap.has(`--le-${family}-${suffix}`), `Semantic ${family} ${suffix} token is required.`);
  }
}
for (const prefix of [
  "--le-font-", "--le-type-", "--le-weight-", "--le-line-", "--le-space-",
  "--le-radius-", "--le-border-", "--le-shadow-", "--le-focus-", "--le-control-",
  "--le-content-", "--le-sidebar-", "--le-topbar-", "--le-motion-", "--le-z-"
]) {
  assert.ok([...tokenMap.keys()].some((name) => name.startsWith(prefix)), `Token group ${prefix} is required.`);
}

assert.equal(APPROVED_WHITE_LOGO_PATH, "assets/brand/logos/legalease-logo-white-2025.png");
assert.equal(APPROVED_VISUAL_REFERENCE_PATH, "docs/ux-vnext/reference/command-center-vnext-approved-direction.png");
assert.equal(TOKEN_STYLESHEET_PATH, "assets/ui/tokens.css");
assert.equal(DESIGN_SYSTEM_SHOWCASE_PATH, "/__vnext/design-system");
const logoMetadata = await sharp(APPROVED_WHITE_LOGO_PATH).metadata();
assert.equal(logoMetadata.format, "png");
assert.equal(logoMetadata.hasAlpha, true, "The official logo must retain transparency.");
assert.equal(logoMetadata.width, 1920);
assert.equal(logoMetadata.height, 1080);
assert.equal(createHash("sha256").update(readFileSync(APPROVED_WHITE_LOGO_PATH)).digest("hex"), "0d1417dd03fa0ad83044780423db97f23193cc10a8dd1b5c4d121c1200d22b4b");
assert.match(showcaseHtml, new RegExp(`<img class="ds-logo" src="/${APPROVED_WHITE_LOGO_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" alt="LegalEase" width="1920" height="1080">`));
assert.match(tokenSource, /\.ds-logo\s*\{[^}]*width:[^;}]+;[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/s, "Showcase logo styling must preserve source aspect ratio.");
assert.doesNotMatch(showcaseHtml, /class="(?:brand-lockup|logo-text|wordmark-text)"|<span>LegalEase<\/span>/, "The showcase must not recreate the official wordmark with text.");

function assertDeepFrozen(value, path = "brandContract") {
  if (!value || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value), `${path} must be immutable.`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}
assertDeepFrozen(brandContract);
assert.doesNotMatch(brandSource, /^\s*import\s/m, "The brand contract must have no imports.");
for (const pattern of [
  /\bprocess\s*\./, /\bfetch\s*\(/, /\b(?:window|document|localStorage|sessionStorage)\s*\./,
  /\b(?:readFile|writeFile|createServer|listen|setTimeout|setInterval)\s*\(/, /\bconsole\s*\./
]) assert.doesNotMatch(brandSource, pattern, `Brand contract must remain side-effect-free: ${pattern}.`);
assert.doesNotMatch(brandSource, /from ["'][^"']*(?:storage|database|network|sending|publishing|business-engine|preview-server)[^"']*["']/i);

assert.match(showcaseHtml, new RegExp(`<link rel="stylesheet" href="/${TOKEN_STYLESHEET_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
assert.match(showcaseSource, /from "\.\/primitives\.mjs";/);
assert.match(showcaseSource, /from "\.\/feedback\.mjs";/);
assert.doesNotMatch(showcaseSource, /#[0-9a-f]{3,8}|\brgba?\(|\bhsla?\(/i, "Showcase markup must not introduce ad hoc brand colors.");
assert.doesNotMatch(tokenSource, /(?:linear|radial)-gradient|backdrop-filter|glass/i, "The design-system layer must not use gradients or glass effects.");
assert.match(tokenSource, /\.ui-button--primary\s*\{[^}]*var\(--le-orange-600\)/s);
assert.match(tokenSource, /\.ui-button--secondary|\.ui-button\s*\{/);
assert.match(tokenSource, /a\[aria-current="page"\][^{]*\{[^}]*var\(--le-teal-100\)/s);
assert.match(tokenSource, /\.ui-button--destructive\s*\{[^}]*var\(--le-danger-700\)/s);
for (const label of ["Neutral", "Information", "Selected", "Success", "Warning", "Danger", "Needs attention"]) {
  assert.match(showcaseHtml, new RegExp(`>${label}<\\/span>`), `Status ${label} must remain visible in text.`);
}
assert.match(tokenSource, /--le-focus-ring:/);
assert.match(tokenSource, /:focus-visible/);
assert.match(tokenSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.deepEqual(APPROVED_FONT_STACK, ["Geist", "Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]);
assert.match(tokenSource, /--le-font-sans:\s*"Geist",\s*"Inter",\s*system-ui,/);

assert.doesNotMatch(serverSource, /fonts\.(?:googleapis|gstatic)\.com/, "The blocked external font request must be removed.");
assert.doesNotMatch(showcaseHtml, /https?:\/\//, "The showcase must require no external resource.");
assert.match(requestSecuritySource, /style-src 'self' 'unsafe-inline';[^\n]+connect-src 'self'; font-src 'self'/, "CSP must remain self-only rather than being weakened for fonts.");
const authorizeIndex = serverSource.indexOf("const accessDecision = authorizeRequest");
const showcaseRouteIndex = serverSource.indexOf("url.pathname === DESIGN_SYSTEM_SHOWCASE_PATH");
assert.ok(authorizeIndex >= 0 && showcaseRouteIndex > authorizeIndex, "Showcase must remain behind the existing authorization boundary.");
assert.match(serverSource, /url\.pathname === DESIGN_SYSTEM_SHOWCASE_PATH[\s\S]*?if \(!commandCenterVNextConfig\.enabled\)[\s\S]*?location:"\/#today"/);
assert.ok(serverSource.includes("/^\\/assets\\/(styles|brand|ui)\\//"), "Only the reviewed UI asset directory should be added to the existing asset allowlist.");

const knownPagesLiteral = serverSource.match(/const knownPages = (\[[^;]+\]);/)?.[1];
assert.ok(knownPagesLiteral, "The current canonical route whitelist must remain parseable.");
assert.deepEqual(JSON.parse(knownPagesLiteral).sort(), routeRegistry.map((entry) => entry.canonicalRoute).sort(), "Legacy routes must remain unchanged.");
const aliasBody = serverSource.match(/const routeAliases = \{([^}]+)\};/)?.[1] || "";
const aliases = [...aliasBody.matchAll(/(?:"([^"]+)"|([A-Za-z0-9_-]+))\s*:\s*"([^"]+)"/g)].map((match) => [match[1] || match[2], match[3]]);
const registryAliases = routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]));
assert.deepEqual(aliases.sort(), registryAliases.sort(), "Legacy aliases must remain unchanged.");
assert.ok(!JSON.parse(knownPagesLiteral).includes(DESIGN_SYSTEM_SHOWCASE_PATH), "The showcase is an internal endpoint, not a product route.");

assert.equal(packageJson.scripts["test:vnext-brand-contract"], "node scripts/test-vnext-brand-contract.mjs");
for (const [width, file] of [[1440,"showcase-1440.png"],[1280,"showcase-1280.png"],[1024,"showcase-1024.png"],[768,"showcase-768.png"],[390,"showcase-390.png"]]) {
  const screenshotPath = `docs/ux-vnext/screenshots/ccx-006/${file}`;
  assert.ok(existsSync(screenshotPath), `${screenshotPath} must be generated by the browser suite.`);
  const metadata = await sharp(screenshotPath).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, width, `${file} must use the required viewport width.`);
}

console.log(`vNext brand contract verified: ${tokenMap.size} immutable tokens, exact approved logo, protected showcase, zero external font requests, and unchanged legacy routes.`);
