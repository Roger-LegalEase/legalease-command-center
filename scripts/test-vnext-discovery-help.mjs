import assert from "node:assert/strict";
import { buildContextualHelp, DISCOVERY_HELP_ITEMS } from "./discovery-help.mjs";
import { renderContextualHelp } from "./ui/pages/discovery-help.mjs";
import { discoveryHelpBrowserSource } from "./ui/controllers/discovery-help-controller.mjs";

const actor={authenticated:true,id:"owner",role:"owner"};
const now="2026-07-19T14:00:00.000Z";
const social=buildContextualHelp({actor,destination:"Social",now});
assert.equal(social.selected,"social");
assert.deepEqual(social.items.map(item=>item.label),["What the Command Center does","Take a product tour","Social workflow","Outreach workflow","Partner workflow","Files and Investor Room","Keyboard shortcuts"]);
assert.equal(social.advancedGuidance.location,"Settings");
assert.equal(social.advancedGuidance.shown,false);
assert.equal(social.capabilities.externalLinks,false);
assert.throws(()=>buildContextualHelp({actor:{authenticated:true,id:"viewer",role:"viewer"},now}),/not available/i);

const html=renderContextualHelp(social);
assert.match(html,/role="dialog"/);
assert.match(html,/aria-modal="true"/);
assert.doesNotMatch(html,/href=/,"Help is a contextual drawer, not a destination link");
const normalCopy=JSON.stringify(DISCOVERY_HELP_ITEMS);
assert.doesNotMatch(normalCopy,/webhook|telemetry|provider|live gate|engine state|oauth|secret|schema/i);
const browser=discoveryHelpBrowserSource();
assert.match(browser,/Escape/);
assert.match(browser,/vnext:open-contextual-help/);
assert.match(browser,/vnext:open-onboarding/);
assert.match(browser,/__LE_VNEXT_ROUTE_COMPATIBILITY/);
assert.doesNotMatch(browser,/window\.open|localStorage|sessionStorage/);

console.log("PASS test-vnext-discovery-help");
