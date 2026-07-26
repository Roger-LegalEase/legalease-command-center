// Ported 2026-07-26. The original asserted the legacy Social workspace: `socialPageHtml`, its
// fourteen action handlers, the Today social card, and a five-item navigation of
// Today / Work / Social / Proof / Search.
//
// All of that is deleted. The Social surface is now vNext, covered by thirteen passing
// `test-vnext-social-*` suites. The suite is inverted rather than removed: the pipeline forbids
// shrinking extended discovery, and a deleted suite guards nothing.
//
// Its job now: prove the legacy Social workspace stayed gone, and that the vNext replacement it
// was superseded by is actually present — so this cannot pass on a repository that lost both.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

for (const removed of [
  "function socialPageHtml(",
  "function socialContentCardHtml(",
  "function proofToShareItems("
]) {
  assert.equal(source.split(removed).length - 1, 0,
    `${removed} belonged to the retired legacy Social workspace and must not return.`);
}

// The replacement must exist. Counting the suites that supersede this one means the claim
// "superseded by the vNext social suites" is verified rather than asserted in a comment.
const suites = readdirSync(new URL("./", import.meta.url))
  .filter((name) => /^test-vnext-social-.*\.mjs$/.test(name));
assert.ok(suites.length >= 10,
  `The legacy Social workspace was retired in favour of the vNext social suites; found only ${suites.length}. If they are gone, this surface has no coverage at all.`);

// And the live Social surface is the vNext one.
assert.ok(source.includes("socialHomeBrowserSource") || source.includes("renderVNextDesktopShell"),
  "The vNext Social surface must be the one the shell serves.");

console.log(`social-workspace: legacy workspace absent; ${suites.length} vNext social suites cover the replacement.`);
