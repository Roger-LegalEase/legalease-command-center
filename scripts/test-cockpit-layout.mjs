import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

const overviewMatch = server.match(/function commandCenterOverviewHtml\(posts\) \{[\s\S]*?function focusItemsForMode/);
assert.ok(overviewMatch, "Today overview renderer should be present.");
const overview = overviewMatch[0];

assert.match(overview, /class="operator-v31"/, "Today should render the operator-v31 shell.");
assert.match(overview, /class="cockpit-page"/, "Today should have a centered cockpit-page wrapper.");
assert.match(overview, /class="cockpit-layout"/, "Today should render a cockpit layout wrapper.");
assert.match(overview, /class="cockpit-main"/, "Today should render a main cockpit column.");
assert.match(overview, /class="cockpit-rail"/, "Today should render a right cockpit rail.");
assert.match(server, /\.operator-v31 \.cockpit-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*380px/s, "Cockpit layout CSS should use minmax(0, 1fr) plus a 380px rail.");
assert.match(server, /\.operator-v31 \.cockpit-main\s*\{[^}]*min-width:\s*0/s, "Cockpit main should have min-width: 0.");
assert.match(server, /\.operator-v31 \.cockpit-rail\s*\{[^}]*position:\s*static/s, "Cockpit rail should be statically positioned.");
const nowTitleRule = server.match(/\.operator-v31 \.now-block h1,[\s\S]*?\.operator-v31 \.now-headline\s*\{(?<body>[^}]*)\}/)?.groups?.body || "";
assert.match(nowTitleRule, /white-space:\s*normal/, "Now block title should allow normal wrapping.");
assert.doesNotMatch(nowTitleRule, /white-space:\s*nowrap/, "Now block title must not use nowrap.");
assert.match(server, /layout: cockpit-grid-fixed-v1/, "Today footer should expose the cockpit-grid-fixed-v1 marker.");

const mainStart = overview.indexOf('<main class="cockpit-main">');
const railStart = overview.indexOf('<aside class="cockpit-rail">');
const nowStart = overview.indexOf('<section class="now-block"');
const quickStart = overview.indexOf("Quick Capture");
const threadsStart = overview.indexOf("Threads Open");
assert.ok(mainStart !== -1 && railStart !== -1, "Main and rail columns should both exist.");
assert.ok(nowStart > mainStart && nowStart < railStart, "Now block should be inside cockpit-main before cockpit-rail.");
assert.ok(quickStart > railStart, "Quick Capture should be inside cockpit-rail.");
assert.ok(threadsStart > railStart, "Threads Open should be inside cockpit-rail.");

console.log("cockpit layout tests passed");
