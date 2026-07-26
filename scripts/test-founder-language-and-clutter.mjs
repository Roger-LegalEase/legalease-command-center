// Ported 2026-07-26. The original policed founder-facing language across the legacy Today, Work,
// Social, Proof, Search and Morning Brief renderers, and asserted a five-item primary navigation
// of Today / Work / Social / Proof / Search.
//
// Every one of those renderers has been deleted, and the navigation is no longer five items. The
// suite is inverted rather than removed — the pipeline forbids shrinking extended discovery, and
// a deleted suite guards nothing.
//
// Its job now: prove the legacy clutter stayed gone, and that the navigation matches what the
// product actually ships, so a silent regrowth of either fails here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRIMARY_SHELL_DESTINATIONS } from "./ui/app-shell-navigation.mjs";
import { FOUNDER_OS_PRIMARY_WORKSPACES } from "./ui/founder-os-config.mjs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

for (const removed of [
  "function workPageHtml(",
  "function proofPageHtml(",
  "function socialPageHtml(",
  "function socialContentCardHtml("
]) {
  assert.equal(source.split(removed).length - 1, 0,
    `${removed} was consolidated away and must not return without a deliberate decision.`);
}

// The vNext shell's own navigation, read from the registry rather than scraped out of HTML — the
// scrape is what rotted in the original. The count is pinned so growth is a decision, not a drift,
// and it is exactly the clutter the Founder OS shell exists to collapse.
assert.equal(PRIMARY_SHELL_DESTINATIONS.length, 10,
  `The vNext shell ships ten primary destinations; found ${PRIMARY_SHELL_DESTINATIONS.length}. Changing it is a charter decision.`);

// Under the Founder OS shell the primary navigation collapses to the charter's four workspaces.
assert.deepEqual(FOUNDER_OS_PRIMARY_WORKSPACES.map((workspace) => workspace.label),
  ["Today", "Relationships", "Campaigns", "Scoreboard"],
  "The Founder OS shell must show exactly the charter's four workspaces.");
// The point of the release: four is fewer than ten. Asserting the relationship, not just the two
// numbers, keeps this meaningful if either list changes.
assert.ok(FOUNDER_OS_PRIMARY_WORKSPACES.length < PRIMARY_SHELL_DESTINATIONS.length,
  "The Founder OS shell must reduce primary navigation, not merely relabel it.");

console.log("founder-language-and-clutter: legacy renderers absent; navigation is 10 vNext / 4 Founder OS.");
