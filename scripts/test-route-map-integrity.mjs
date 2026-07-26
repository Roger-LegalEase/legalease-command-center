import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const aliases = source.match(/const routeAliases = \{([\s\S]*?)\};/)?.[1] || "";
const knownPages = source.match(/const knownPages = \[([\s\S]*?)\];/)?.[1] || "";
const nav = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const sections = source.match(/function navSectionForPage\(pageId = "today"\) \{([\s\S]*?)\n    \}/)?.[1] || "";
assert.equal((nav.match(/class="nav-top-link"/g) || []).length, 6);
for (const section of ["today", "queue", "campaigns", "review-desk", "reports", "more"]) assert(nav.includes(`data-nav-section="${section}"`));
for (const alias of ['overview:"today"', 'command:"growth"', 'social:"growth"', 'rcap:"production-activation-rcap"', 'recovery:"safe-mode"', 'privacy:"settings"']) assert(aliases.includes(alias));
for (const route of ["today", "decisions", "campaigns", "queue", "reports", "more", "production-activation-rcap", "safe-mode", "settings"]) assert(knownPages.includes(`"${route}"`));
for (const mapping of ['return "today"', 'return "queue"', 'return "campaigns"', 'return "review-desk"', 'return "reports"', 'return "more"']) assert(sections.includes(mapping));
// PORTED 2026-07-26 (hygiene, extended-test triage). The alias resolution is unchanged in
// meaning but no longer the whole right-hand side: the Phase O artifact deep-link work wrapped
// it in a ternary, so the line now reads
//   const normalizedPage = artifactRef ? "item" : (routeAliases[requestedPage] || requestedPage);
// Asserting both branches rather than loosening the pattern: an #item/<collection>/<id> deep
// link must bypass the alias map, and everything else must still resolve through it.
assert.match(source, /normalizedPage = artifactRef \? "item" : \(routeAliases\[requestedPage\] \|\| requestedPage\)/);
assert.match(source, /if \(requestedPage\.startsWith\("item\/"\)\)/, "artifact deep links should be parsed before alias resolution");
assert.match(source, /knownPages\.includes\(normalizedPage\) \? normalizedPage : "today"/);
console.log("route map integrity tests passed");
