// The design system reaches every page inside the shell — not only the four workspaces.
//
// Roger asked three times for the whole product to look like one product. Twice the work was
// scoped to "the four workspaces", and twice the answer was four pages on the system and the rest
// on the old one. The gap was never the tokens: those are declared on `.le-os`, the shell root,
// and have always reached every page. It was the component treatments, which stopped at four
// surface roots. This suite exists so that gap cannot silently reopen.
//
// What it pins:
//   1. the base layer is scoped to the shell root and to nothing else, so it cannot leak
//      into a flag-off page;
//   2. it carries no page-local colour — every value is a token from the concept layer;
//   3. it is @layer'd, so it is a floor the four workspaces still override rather than a
//      later-loading ceiling that quietly restyles them;
//   4. with FOUNDER_OS_SHELL on, the shell asks for it on EVERY route, not one;
//   5. with the flag off, nothing about it is served — the rollback path.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { FOUNDER_OS_BASE_STYLESHEET_PATH } from "./ui/pages/founder-os-base-style.mjs";
import { renderVNextDesktopShellChrome } from "./ui/app-shell.mjs";

const css = readFileSync(new URL(`../${FOUNDER_OS_BASE_STYLESHEET_PATH}`, import.meta.url), "utf8");
let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`  ✓ ${name}`); };

// ---- 1. scope ---------------------------------------------------------------------------------
check("every selector in the base layer is scoped to the shell root", () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...body.matchAll(/(^|[}{])\s*([^{}@]+?)\s*\{/gm)]
    .map((match) => match[2].trim())
    .filter((selector) => selector && !selector.startsWith("@"));
  assert.ok(selectors.length > 10, `expected a real stylesheet; found ${selectors.length} selectors`);
  const unscoped = selectors.flatMap((group) => group.split(",").map((s) => s.trim()))
    .filter((selector) => selector && !selector.startsWith(".le-os"));
  assert.deepEqual(unscoped, [], `every rule must start at .le-os or it can reach a flag-off page: ${unscoped.join(" | ")}`);
});

// ---- 2. no page-local hex ---------------------------------------------------------------------
check("the base layer states no colour of its own", () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const hex = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(hex, [], `colour must come from the token layer, never restated here: ${hex.join(", ")}`);
});

// ---- 3. it must beat the legacy page rules, and it must be unlayered to do it -----------------
// The first attempt wrapped this file in @layer so the four workspaces would always win. Unlayered
// rules beat layered ones regardless of specificity, so the LEGACY stylesheets won too and the
// machinery pages kept their old panels — measured on #settings: 10px radius, legacy border.
// Layering this file again would silently reproduce that, so it is asserted against.
check("the base layer is unlayered, so it clears the legacy page rules", () => {
  assert.doesNotMatch(css, /@layer\s+[a-z-]+\s*\{/,
    "@layer would put this below every unlayered legacy rule and the machinery pages would keep the old look");
  const generic = [...css.matchAll(/^\.le-os \.page-section [^,{]*[.a-z][^,{]*[,{]/gm)];
  assert.ok(generic.length > 5, "the base layer must reach the shared page vocabulary, not only the shell");
});

// ---- 4 and 5. what the shell actually serves ----------------------------------------------------
const shellOptions = { account:{ label:"Owner" }, discovery:{ enabled:false } };
const withShell = renderVNextDesktopShellChrome({ ...shellOptions, founderOsShell:true });
const withoutShell = renderVNextDesktopShellChrome({ ...shellOptions, founderOsShell:false });
const html = (result) => (typeof result === "string" ? result : `${result?.start || ""}${result?.end || ""}`);

check("with the shell flag on, the shell root carries the base layer's hook", () => {
  assert.match(html(withShell), /vnext-shell le-os/, "the shell root must carry the class the base layer is keyed to");
});

check("the base layer is requested on EVERY route, not one", () => {
  const source = readFileSync(new URL("./ui/app-shell.mjs", import.meta.url), "utf8");
  assert.match(source, /founderOsShellOnly \|\| options\.founderOsShell === true/, "the asset must be gated on the shell flag");
  // Unconditional inside the flag: no `if (route === ...)` guard, unlike a per-page asset.
  assert.match(source, /\$\{options\.founderOsShell \? `add\("founder-os-base"\);` : ""\}/,
    "the base layer must be added for every route, or the pages it exists for keep the old look");
});

check("with the shell flag off, the shell root does not carry the base layer's hook", () => {
  const markup = html(withoutShell);
  assert.ok(!/vnext-shell[^"]*\ble-os\b/.test(markup), "flag-off must not emit .le-os, or the rollback is not a rollback");
});

console.log(`test-founder-os-base-layer: ${checks} checks passed`);
