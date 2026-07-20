import assert from "node:assert/strict";
import { buildFirstRunOnboarding, saveFirstRunOnboarding } from "./discovery-onboarding-service.mjs";
import { renderDiscoveryOnboarding } from "./ui/pages/discovery-onboarding.mjs";
import { discoveryOnboardingBrowserSource } from "./ui/controllers/discovery-onboarding-controller.mjs";

const now = "2026-07-19T12:00:00.000Z";
const owner = { authenticated:true, id:"actor-owner", role:"owner" };

const view = buildFirstRunOnboarding({ actor:owner, preference:{ status:"new", version:2 }, now });
assert.equal(view.shouldOpen, true);
assert.deepEqual(view.choices.map((choice) => choice.label), [
  "Create and schedule social content",
  "Run partner or customer outreach",
  "Manage partner relationships",
  "Organize company and investor files",
  "Plan my work for today"
]);
assert.equal(view.capabilities.enablesIntegrations, false);
assert.equal(view.capabilities.enablesExternalActions, false);
assert.equal(view.capabilities.writesProductFlags, false);
assert.throws(() => buildFirstRunOnboarding({ actor:{ authenticated:true, id:"viewer", role:"viewer" }, now }), /not available/i);

let captured = null;
const selected = await saveFirstRunOnboarding({
  actor:owner,
  currentPreference:{ status:"new", version:2 },
  input:{ intent:"select", choiceId:"social", requestId:"onboarding-select-00001", expectedVersion:2 },
  now,
  commitPreference:async (command) => { captured = command; return { ok:true, version:3 }; }
});
assert.equal(captured.patch.status, "completed");
assert.equal(captured.patch.choiceId, "social");
assert.equal(captured.evidence.audit.externalSideEffects, false);
assert.equal(selected.action.workflowId, "social-post");
assert.equal(selected.externalActions, 0);
assert.equal(selected.productFlagsChanged, false);

const deferred = await saveFirstRunOnboarding({
  actor:owner,
  currentPreference:{ status:"new", version:0 },
  input:{ intent:"defer", requestId:"onboarding-defer-00001", expectedVersion:0 },
  now,
  commitPreference:async () => ({ ok:true, version:1 })
});
assert.equal(deferred.preference.status, "deferred");
assert.equal(deferred.action, null);
await assert.rejects(() => saveFirstRunOnboarding({
  actor:owner,
  currentPreference:{ status:"new", version:4 },
  input:{ intent:"select", choiceId:"today", requestId:"onboarding-stale-00001", expectedVersion:3 },
  now,
  commitPreference:async () => ({ ok:true, version:5 })
}), /another session/i);

const html = renderDiscoveryOnboarding(view);
assert.match(html, /role="dialog"/);
assert.match(html, /Skip for now/);
assert.doesNotMatch(html, /connected|enable publishing|live gate/i);
const browser = discoveryOnboardingBrowserSource();
assert.match(browser, /__LE_VNEXT_ROUTE_COMPATIBILITY/);
assert.match(browser, /__LE_GLOBAL_CREATE/);
assert.doesNotMatch(browser, /localStorage|sessionStorage|document\.cookie/);

console.log("PASS test-vnext-discovery-onboarding");
