import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

const overviewMatch = server.match(/function commandCenterOverviewHtml\(posts\) \{[\s\S]*?function focusItemsForMode/);
assert.ok(overviewMatch, "Today overview renderer should be present.");
const overview = overviewMatch[0];

assert.match(overview, /class="founder-today/, "Today should use the founder-simple shell.");
assert.match(overview, /class="founder-hero"/, "Today should have a clear header.");
assert.match(overview, /class="founder-card" aria-label="Today's Focus"/, "Today should render focus first.");
assert.match(overview, /class="founder-card" aria-label="Top 3"/, "Today should render Top 3.");
assert.match(overview, /class="founder-card quick-capture" aria-label="Quick Capture"/, "Today should render one Quick Capture card.");
assert.match(overview, /class="founder-card" aria-label="Tasks"/, "Today should render one Tasks card.");
assert.match(overview, /class="founder-card" aria-label="Decisions and Blockers"/, "Today should render one decisions/blockers card.");
assert.match(overview, /socialContentCardHtml\(\)/, "Today should render one compact Social / Content card.");
assert.match(server, /class="founder-card social-content-card" aria-label="Social \/ Content"/, "Social / Content card markup should exist.");
assert.match(overview, /class="founder-card" aria-label="What Moved"/, "Today should render movement summary.");
assert.match(overview, /class="founder-card" aria-label="Tomorrow Plan"/, "Today should render Tomorrow Plan.");
assert.match(overview, /class="founder-card" aria-label="Tiny App Status"/, "Today should render a small app status card.");
assert.match(server, /\.founder-today\s*\{[^}]*max-width:\s*1120px[^}]*display:grid/s, "Founder Today should be a constrained grid.");
assert.match(server, /\.founder-snapshot-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)/s, "Tasks snapshot should use stable four-column metrics.");
assert.match(server, /@media\s*\(max-width:760px\)[\s\S]*\.founder-snapshot-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/s, "Tasks snapshot should adapt on mobile.");
assert.doesNotMatch(overview, /cockpit-rail|cockpit-layout|Threads Open|Parked|layout: cockpit-grid-fixed-v1/, "Today should not expose the old dense cockpit rail.");
assert.doesNotMatch(server, /word-break:\s*break-all/, "Layout must not force clipped vertical text.");

console.log("cockpit layout tests passed");
