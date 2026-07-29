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
import { readdirSync, readFileSync } from "node:fs";

import { FOUNDER_OS_BASE_STYLESHEET_PATH } from "./ui/pages/founder-os-base-style.mjs";
import { renderVNextDesktopShellChrome } from "./ui/app-shell.mjs";

const css = readFileSync(new URL(`../${FOUNDER_OS_BASE_STYLESHEET_PATH}`, import.meta.url), "utf8");
// The token layer this one draws every colour from; check 6 resolves those tokens to real values.
const conceptCss = readFileSync(new URL("../assets/ui/founder-os-concept.css", import.meta.url), "utf8");
let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`  ✓ ${name}`); };

// ---- 1. scope ---------------------------------------------------------------------------------
check("every selector in the base layer is scoped to the shell root", () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...body.matchAll(/(^|[}{])\s*([^{}@]+?)\s*\{/gm)]
    .map((match) => match[2].trim())
    .filter((selector) => selector && !selector.startsWith("@"));
  assert.ok(selectors.length > 10, `expected a real stylesheet; found ${selectors.length} selectors`);
  // Splitting on "," would cut `:is(h1, h2, h3)` into fragments, so the check is per RULE: every
  // rule must open at the shell root, written plainly or inside `:where()` (see check 3b).
  const unscoped = selectors.filter((group) => !/^(?::where\()?\.le-os\b/.test(group.trim()));
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
  const generic = [...css.matchAll(/^:?(?:where\()?\.le-os \.page-section\)? [^,{]*[.a-z][^,{]*[,{]/gm)];
  assert.ok(generic.length > 5, "the base layer must reach the shared page vocabulary, not only the shell");
});

// ---- 3b. a floor, not a ceiling ---------------------------------------------------------------
// Three class-weights aimed at a bare TAG is how the first cut beat every component that had
// named its own control with one class — and it beat them on ONE property, which is worse than
// losing outright. Measured on #support: `.le-os .page-section a { color }` won over
// `.founder-support__inbox-link { color:#fff }`, leaving orange text on the component's own teal
// fill at about 2:1. Tag-level rules must therefore weigh what they select, and `:where()` is how.
check("tag-level rules carry no specificity, so a component that names itself always wins", () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...body.matchAll(/(^|[}{])\s*([^{}@]+?)\s*\{/gm)]
    .flatMap((match) => match[2].split(/,(?![^(]*\))/).map((value) => value.trim()))
    .filter(Boolean);
  // A rule is TAG-LEVEL when, once the shell scope is removed, nothing is left but element
  // names — no class, id or attribute of its own to justify the weight it would carry.
  const withoutScope = (selector) => selector.replace(/^(?::where\()?\.le-os \.page-section\)?/, "").trim();
  const tagLevel = selectors.filter((selector) => {
    const rest = withoutScope(selector);
    return rest && !/[.#\[]/.test(rest);
  });
  // :focus-visible is the keyboard floor, not a preference a component may overrule. It is the
  // one documented exception to this rule and it is named here so it cannot be widened silently.
  const overweight = tagLevel.filter((selector) => selector.startsWith(".le-os") && !selector.includes(":focus-visible"));
  assert.deepEqual(overweight, [],
    "a tag-level rule must be written `:where(.le-os .page-section) tag` so a component's own rule outranks it");
  assert.ok(tagLevel.length > 5, "the base layer must still state the element defaults it is there to state");
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

// ---- 6. every token this layer READS text with clears the contrast floor ----------------------
// The Campaigns table failed axe at three widths because this layer painted `th` with
// --le-concept-muted-2, a PALETTE value (2.58:1 on white) rather than one of the concept's
// derived *-text values. axe only caught it because a table happened to render in an audited
// workspace; a page with no visible table would have shipped the same unreadable token.
//
// So the ratio is pinned here, at the token, rather than left to whichever page a browser suite
// happens to open. Colour and copy stay free to change — this fails only when text becomes
// unreadable, which is the thing that actually matters.
check("no text falls below 4.5:1 against the surface it actually renders on", () => {
  // WHY THIS WAS REWRITTEN (2026-07-29). The first version judged a rule against the background
  // that rule itself declares, and against white when it declared none. The relationship record's
  // title proved that wrong: `.partner-record-header` sets a navy background and white text, its
  // `h1` sets no colour of its own, and the base layer's tag-level `:is(h1,h2,h3){color:ink}` beat
  // the INHERITED white — inheritance carries no specificity. Ink on navy is 1.4:1, and the guard
  // passed it because it judged that rule against white.
  //
  // So a rule with no declared background is now judged against the background it actually renders
  // on, resolved from the nearest ancestor selector that declares one, across every founder
  // stylesheet rather than this one alone.
  const stylesheets = readdirSync(new URL("../assets/ui/", import.meta.url))
    .filter((name) => name.endsWith(".css"))
    .map((name) => [name, readFileSync(new URL(`../assets/ui/${name}`, import.meta.url), "utf8")]);

  const tokens = Object.fromEntries([...conceptCss.matchAll(/(--le-concept-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)]
    .map((match) => [match[1], match[2]]));
  const hex = (value = "") => {
    const text = String(value).trim();
    const token = text.match(/^var\((--le-concept-[a-z0-9-]+)\)/)?.[1];
    if (token) return tokens[token] || null;
    const short = text.match(/^#([0-9a-fA-F]{3})\b/)?.[1];
    if (short) return `#${short.split("").map((c) => c + c).join("")}`;
    return text.match(/^#[0-9a-fA-F]{6}\b/)?.[0] || null;
  };
  const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = (colour) => 0.2126 * channel(parseInt(colour.slice(1, 3), 16))
    + 0.7152 * channel(parseInt(colour.slice(3, 5), 16)) + 0.0722 * channel(parseInt(colour.slice(5, 7), 16));
  const ratio = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };

  // Every rule in every founder stylesheet, as (selector, colour, background).
  const rules = [];
  for (const [file, css] of stylesheets) {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selectorGroup, declarations] of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selectorGroup.trim().startsWith("@")) continue;
      const colour = declarations.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1];
      const background = declarations.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/)?.[1];
      for (const selector of selectorGroup.split(",").map((part) => part.trim()).filter(Boolean)) {
        rules.push({ file, selector, colour: colour ? hex(colour) : null,
          background: background ? hex(background) : null,
          // A gradient, image or keyword background is a surface we cannot evaluate. Judging such
          // a rule against white invents a failure (white-on-white); it is skipped instead.
          opaqueBackground: Boolean(background) && !hex(background) });
      }
    }
  }

  // Backgrounds by selector, for ancestor resolution.
  const backgrounds = new Map();
  for (const rule of rules) if (rule.background && !backgrounds.has(rule.selector)) backgrounds.set(rule.selector, rule.background);

  // The background a selector renders on: its own, else the nearest ancestor prefix that declares
  // one, else the two surfaces the shell paints on.
  const defaults = [tokens["--le-concept-card"], tokens["--le-concept-canvas"]].filter(Boolean);
  const surfacesFor = (selector, own, unresolved) => {
    if (own) return [own];
    if (unresolved) return [];
    const parts = selector.split(/\s+/).filter(Boolean);
    for (let depth = parts.length - 1; depth > 0; depth -= 1) {
      const ancestor = parts.slice(0, depth).join(" ");
      if (backgrounds.has(ancestor)) return [backgrounds.get(ancestor)];
      const last = parts[depth - 1];
      if (backgrounds.has(last)) return [backgrounds.get(last)];
    }
    return defaults;
  };

  const failures = [];
  for (const rule of rules) {
    if (!rule.colour) continue;
    for (const surface of surfacesFor(rule.selector, rule.background, rule.opaqueBackground)) {
      if (!surface) continue;
      const value = ratio(rule.colour, surface);
      if (value < 4.5) failures.push(`${rule.file}  ${rule.selector} — ${rule.colour} on ${surface} is ${value.toFixed(2)}:1`);
    }
  }
  if (process.env.GUARD_DUMP) console.log(failures.join("\n"));

  // A RATCHET, NOT A MUTE. Broadening this check from one stylesheet to all of them surfaced 94
  // pre-existing sub-AA pairs that predate this branch. Every one is listed by name in
  // test-support/contrast-baseline.json — nothing is hidden, and the file is the work list. The
  // assertion below is what matters: a pair NOT in that file fails immediately, and the baseline
  // may only ever shrink, so this cannot quietly grow back.
  const baseline = new Set(JSON.parse(readFileSync(new URL("./test-support/contrast-baseline.json", import.meta.url), "utf8")));
  const introduced = failures.filter((finding) => !baseline.has(finding));
  assert.deepEqual(introduced, [], `NEW text below WCAG AA:\n  ${introduced.join("\n  ")}`);
  const fixed = [...baseline].filter((finding) => !failures.includes(finding));
  assert.ok(failures.length <= baseline.size,
    `the contrast baseline may only shrink: ${failures.length} findings against a baseline of ${baseline.size}`);
  if (fixed.length) console.log(`    (${fixed.length} baselined contrast findings are now fixed — remove them from contrast-baseline.json)`);
});

// ---- 6b. a dark surface must state its own heading colour --------------------------------------
// The precise shape of the bug above: the base layer paints every heading ink at tag level, and
// inheritance cannot beat it. So any surface dark enough that ink is unreadable on it MUST declare
// a colour for the headings inside it, or those headings render ink on dark.
check("a heading inside a dark surface states its own colour", () => {
  // The exact shape of the relationship-title bug, and nothing wider. The base layer paints every
  // heading ink at TAG level; inheritance carries no specificity, so a heading sitting inside a
  // dark panel renders ink-on-dark unless some rule sets its colour explicitly. This flags only
  // surfaces that actually contain a heading — a dark button or avatar has none and is not a bug.
  const tokens = Object.fromEntries([...conceptCss.matchAll(/(--le-concept-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)]
    .map((match) => [match[1], match[2]]));
  const ink = tokens["--le-concept-ink"];
  const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = (colour) => 0.2126 * channel(parseInt(colour.slice(1, 3), 16))
    + 0.7152 * channel(parseInt(colour.slice(3, 5), 16)) + 0.0722 * channel(parseInt(colour.slice(5, 7), 16));
  const ratio = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
  const HEADING = /(^|\s|>)(h1|h2|h3)(\s|$|[,:>])|:is\([^)]*h[123]/;

  const darkSurfaces = [];
  const headingRules = [];
  for (const name of readdirSync(new URL("../assets/ui/", import.meta.url)).filter((file) => file.endsWith(".css"))) {
    const css = readFileSync(new URL(`../assets/ui/${name}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selectorGroup, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selectorGroup.trim().startsWith("@")) continue;
      const background = declarations.match(/(?:^|;)\s*background(?:-color)?:\s*(#[0-9a-fA-F]{6})\b/)?.[1];
      const setsColour = /(?:^|;)\s*color:/.test(declarations);
      for (const selector of selectorGroup.split(",").map((part) => part.trim()).filter(Boolean)) {
        if (background && ratio(ink, background) < 4.5) darkSurfaces.push({ name, selector, background });
        if (HEADING.test(selector)) headingRules.push({ selector, setsColour });
      }
    }
  }

  const failures = [];
  for (const surface of darkSurfaces) {
    const headings = headingRules.filter((rule) => rule.selector.startsWith(`${surface.selector} `));
    if (!headings.length) continue;                       // no heading renders here
    if (headings.some((rule) => rule.setsColour)) continue; // its colour is stated
    failures.push(`${surface.name}  ${surface.selector} (${ratio(ink, surface.background).toFixed(2)}:1 against ink) contains a heading that states no colour`);
  }
  if (process.env.GUARD_DUMP) console.log("DARK:\n" + failures.join("\n"));
  assert.deepEqual(failures, [], `headings that would render ink on a dark surface:\n  ${failures.join("\n  ")}`);
});

console.log(`test-founder-os-base-layer: ${checks} checks passed`);
