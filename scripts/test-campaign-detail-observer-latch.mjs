// Campaign detail must never wedge the browser main thread.
//
// The defect (evidence PR #119, campaign-detail.mjs:39): the recovery MutationObserver was
// unguarded. Its sentinel `[data-campaign-detail]` exists only AFTER a successful render,
// and load() opens by replaceChildren-ing the loading state — itself a childList mutation
// on the observed subtree. So load() retriggered the observer, which re-entered load(),
// which aborted the in-flight fetch and wrote again. Observer callbacks are
// microtask-scheduled, so the loop never yielded: the tab froze on "Loading Campaign…"
// and the fetch never completed.
//
// This suite is the structural guard inside the strict `npm test` gate. The behavioral
// proof — a real Chromium page where the pre-fix source stops responding and the shipped
// source renders — is tests/browser/campaign-detail-no-freeze.spec.mjs.
import assert from "node:assert/strict";

import { campaignDetailBrowserSource } from "./ui/pages/campaign-detail.mjs";

const source = campaignDetailBrowserSource();

// It must still parse as browser code (the escaping-outage class of bug).
assert.doesNotThrow(() => new Function(source), "The campaign detail browser source must parse.");

// 1. There is exactly one recovery observer, and it is latched.
const observers = source.match(/new MutationObserver\(/g) || [];
assert.equal(observers.length, 1, "Campaign detail should install exactly one recovery observer.");

const observerBody = source.slice(source.indexOf("new MutationObserver("), source.indexOf(".observe(document.documentElement"));
assert.match(observerBody, /if\(observerQueued\)return;observerQueued=true/, "The observer callback must open with the re-entrancy latch.");
assert.match(observerBody, /requestAnimationFrame\(/, "The latch must release on a frame, not synchronously.");

// 2. The latched callback must not call load() unconditionally. Every guard is required:
//    a load already running, an already-rendered view, and a route whose last load failed.
assert.match(observerBody, /if\(!current\|\|loading\)return/, "The observer must not re-enter while a load is in flight.");
assert.match(observerBody, /document\.querySelector\("\[data-campaign-detail\]"\)/, "The observer must no-op when a detail view is already rendered.");
assert.match(observerBody, /failedRouteKey===routeKey\(current\)/, "The observer must not auto-retry a route whose last load ended in an error.");

// 3. The exact pre-fix shape must never come back.
assert.doesNotMatch(
  source,
  /new MutationObserver\(\(\)=>\{if\(route\(\)&&!document\.querySelector\("\[data-campaign-detail\]"\)\)load\(\);\}\)/,
  "The unguarded pre-fix observer must not be reintroduced."
);

// 4. load() still writes the loading state (that is what made the loop self-sustaining), so
//    the latch — not a removed DOM write — is what fixes it. And it must clear `loading`
//    on every exit path, or the observer would be permanently disarmed after one failure.
assert.match(source, /host\.replaceChildren\(text\("p","Loading Campaign…","campaign-detail-state"\)\)/, "load() still writes the loading state.");
assert.match(source, /loading=true/, "load() must mark itself in flight.");
assert.match(source, /finally\{if\(requestId===sequence\)loading=false;\}/, "load() must clear the in-flight flag on every exit path.");

// 5. Terminal states must record the failed route so the observer stops, and a successful
//    render must clear it so a later wipe can still be recovered.
for (const terminal of ["Session expired. Sign in again.", "Campaign access required.", "Campaign could not load. No records were changed."]) {
  const index = source.indexOf(terminal);
  assert.ok(index > 0, `Terminal state "${terminal}" must still exist.`);
  assert.match(source.slice(Math.max(0, index - 260), index), /failedRouteKey=key/, `Terminal state "${terminal}" must record the failed route.`);
}
assert.match(source, /failedRouteKey="";render\(payload,current\)/, "A successful render must clear the failed-route latch.");

// 6. A hash change is a fresh start: it clears the failure latch and loads.
assert.match(source, /function routeChanged\(\)\{failedRouteKey="";load\(\);\}/, "A route change must clear the failure latch.");
assert.match(source, /addEventListener\("hashchange",\(\)=>setTimeout\(routeChanged,0\)\)/, "hashchange must go through routeChanged.");

// 7. The latch matches the idiom the surfaces that never froze already use.
console.log("test-campaign-detail-observer-latch: all checks passed");
