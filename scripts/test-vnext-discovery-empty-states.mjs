import assert from "node:assert/strict";
import { DISCOVERY_EMPTY_STATE_AREAS, buildGuidedEmptyState, validateGuidedEmptyState } from "./discovery-empty-states.mjs";
import { renderGuidedEmptyState } from "./ui/components/guided-empty-state.mjs";
import { discoveryEmptyStateBrowserSource } from "./ui/controllers/discovery-empty-state-controller.mjs";

for (const area of DISCOVERY_EMPTY_STATE_AREAS) {
  const state = buildGuidedEmptyState(area, { state:"empty" });
  assert.ok(state.purpose.length > 20, `${area} explains its purpose`);
  assert.ok(state.next.length > 20, `${area} explains what happens next`);
  assert.ok(state.action.label, `${area} has one action`);
  assert.equal(state.truthful.fakeRecords, 0);
  const html = renderGuidedEmptyState(state);
  assert.equal((html.match(/data-guided-empty-action=/g) || []).length, 1);
  assert.doesNotMatch(html, />\s*(?:No data|Nothing here)\s*</i);
}

const unavailable = buildGuidedEmptyState("files", { state:"unavailable" });
assert.equal(unavailable.truthful.sourceUnavailable, true);
assert.match(unavailable.next, /No record.*changed/i);
const unauthorized = buildGuidedEmptyState("partners", { state:"unauthorized" });
assert.equal(unauthorized.truthful.unauthorized, true);
assert.equal(unauthorized.truthful.hiddenRecordsInspected, false);
const filtered = buildGuidedEmptyState("social", { state:"filtered-empty" });
assert.equal(filtered.action.kind, "clear-filters");
assert.throws(() => validateGuidedEmptyState({ title:"No data", purpose:"x", next:"y", action:{ label:"z", kind:"retry" } }), /not sufficient/i);

const browser = discoveryEmptyStateBrowserSource();
assert.match(browser, /__LE_GLOBAL_CREATE/);
assert.match(browser, /__LE_GLOBAL_SEARCH/);
assert.match(browser, /__LE_VNEXT_ROUTE_COMPATIBILITY/);
assert.doesNotMatch(browser, /innerHTML|insertAdjacentHTML|localStorage|sessionStorage/);

console.log("PASS test-vnext-discovery-empty-states");
