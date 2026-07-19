import assert from "node:assert/strict";
import { buildSetupChecklist } from "./discovery-checklist-service.mjs";
import { renderDiscoveryChecklist } from "./ui/pages/discovery-checklist.mjs";
import { discoveryChecklistBrowserSource } from "./ui/controllers/discovery-checklist-controller.mjs";

const actor = { authenticated:true, id:"owner-1", role:"owner" };
const now = "2026-07-19T13:00:00.000Z";
const contract = buildSetupChecklist({ actor, now, sources:{
  brandAssets:{ authorized:true, available:true, items:[{ approved:true, selectable:true, sourceReference:{ collection:"brandAssets", sourceId:"logo-1" } }] },
  socialConnections:{ authorized:true, available:true, items:[{ state:"ready_to_publish", serverVerified:true }] },
  partners:{ authorized:true, available:true, total:1 },
  socialPosts:{ authorized:true, available:true, total:2 },
  outreachCampaigns:{ authorized:true, available:true, total:1 },
  investorRoom:{ authorized:true, available:true, currentRequirements:1 }
} });
assert.equal(contract.progress.complete, 6);
assert.equal(contract.capabilities.browserCompletionAuthority, false);
assert.equal(contract.items.find((item) => item.id === "social-connection").status.complete, true);

const falseConnection = buildSetupChecklist({ actor, now, sources:{
  brandAssets:{ authorized:false },
  socialConnections:{ authorized:true, available:true, items:[{ state:"ready_to_publish", serverVerified:false }, { state:"not_connected", serverVerified:true }] },
  partners:{ authorized:true, available:true, total:0 },
  socialPosts:{ authorized:true, available:false },
  outreachCampaigns:{ authorized:true, available:true, total:0 },
  investorRoom:{ authorized:true, available:true, currentRequirements:0, rawFileCount:9 }
} });
assert.equal(falseConnection.items.find((item) => item.id === "social-connection").status.complete, false, "an account record is not connection proof");
assert.equal(falseConnection.items.find((item) => item.id === "investor-room-file").status.complete, false, "files without explicit current requirements do not count");
assert.equal(falseConnection.items.find((item) => item.id === "brand-assets").status.key, "unauthorized");
assert.equal(falseConnection.items.find((item) => item.id === "social-post").status.key, "unavailable");

const html = renderDiscoveryChecklist(falseConnection);
assert.match(html, /Additional access needed/);
assert.match(html, /Unavailable/);
assert.match(html, /role="progressbar"/);
const browser = discoveryChecklistBrowserSource();
assert.match(browser, /__LE_VNEXT_ROUTE_COMPATIBILITY/);
assert.match(browser, /__LE_GLOBAL_CREATE/);
assert.match(browser, /__LE_FILES/);
assert.doesNotMatch(browser, /localStorage|sessionStorage/);

console.log("PASS test-vnext-discovery-checklist");
