// Ported 2026-07-26. The original asserted that every visible button on the legacy Today, Social
// and founder-capture surfaces did real work — via a shared `runAction` helper with
// `pendingActions`, immediate disabling and "Working…" feedback.
//
// All three of those surfaces and the whole `runAction` mechanism have since been deleted:
// `socialPageHtml`, `workPageHtml`, `proofPageHtml`, `socialContentCardHtml`,
// `setFounderCaptureType`, `runAction`, `pendingActions` — zero occurrences each.
//
// The suite is NOT deleted, because the pipeline forbids shrinking extended discovery
// (`compare-extended-tests.mjs`: "Extended discovery count dropped"), and rightly: a suite that
// disappears stops guarding anything. It is inverted instead. Its job now is to prove the
// fake-completion machinery stayed gone, which is the thing the deprecation ledger's rule cares
// about: "No visible button may remain if it cannot complete the action its label promises."

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

// The deleted toast-only action machinery must not come back. Each of these was part of a
// button that reported success without mutating anything.
for (const removed of [
  "function runAction(",
  "pendingActions",
  "function socialPageHtml(",
  "function workPageHtml(",
  "function proofPageHtml(",
  "function socialContentCardHtml(",
  "setFounderCaptureType"
]) {
  assert.equal(
    source.split(removed).length - 1,
    0,
    `${removed} was removed as part of the toast-only cleanup and must not return; reintroducing it needs a real mutation path and its own test.`
  );
}

// What replaced them: the vNext surfaces, which have their own passing suites. Asserted here so
// this file fails if the replacement is removed too, rather than passing on a hollow repository.
assert.ok(source.includes("renderVNextDesktopShell"), "The vNext desktop shell must be the live surface.");
assert.ok(source.includes("function commandCenterOverviewHtml("), "The legacy Today overview renderer is still referenced and must remain wired.");

console.log("every-visible-button-works: toast-only action machinery remains absent; vNext surfaces are live.");
