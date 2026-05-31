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
assert.match(overview, /class="standup-header"/, "Today should have a clear commercial standup header.");
assert.match(overview, /aria-label="Founder Focus"/, "Today should render focus first.");
assert.match(overview, /aria-label="Top 3 priorities"/, "Today should render Top 3.");
assert.match(overview, /aria-label="Department Pulse"/, "Today should render department pulse.");
assert.match(overview, /class="premium-card quick-capture" aria-label="Quick Capture"/, "Today should render one Quick Capture card.");
assert.match(overview, /class="premium-card" aria-label="Tasks"/, "Today should render one Tasks card.");
assert.match(overview, /class="premium-card" aria-label="Decisions and Blockers"/, "Today should render one decisions/blockers card.");
assert.match(overview, /socialContentCardHtml\(\)/, "Today should render one compact Marketing / Content card.");
assert.match(server, /class="premium-card social-content-card" aria-label="Marketing \/ Content"/, "Marketing / Content card markup should exist.");
assert.match(overview, /class="premium-card" aria-label="What Moved"/, "Today should render movement summary.");
assert.match(overview, /class="premium-card" aria-label="End of Day"/, "Today should render End of Day.");
assert.match(server, /\.workspace-shell,\s*\.founder-today,\s*\.founder-hub\s*\{[^}]*max-width:\s*1360px/s, "Founder Today should be a constrained commercial workspace.");
assert.match(server, /\.founder-snapshot-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)/s, "Tasks snapshot should use stable four-column metrics.");
assert.match(server, /@media\s*\(max-width:760px\)[\s\S]*\.founder-snapshot-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/s, "Tasks snapshot should adapt on mobile.");
assert.doesNotMatch(overview, /cockpit-rail|cockpit-layout|Threads Open|Parked|layout: cockpit-grid-fixed-v1/, "Today should not expose the old dense cockpit rail.");
assert.doesNotMatch(server, /word-break:\s*break-all/, "Layout must not force clipped vertical text.");

console.log("cockpit layout tests passed");
