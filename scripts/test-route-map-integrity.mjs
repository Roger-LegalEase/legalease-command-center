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
assert.match(source, /normalizedPage = routeAliases\[requestedPage\] \|\| requestedPage/);
assert.match(source, /knownPages\.includes\(normalizedPage\) \? normalizedPage : "today"/);
console.log("route map integrity tests passed");
