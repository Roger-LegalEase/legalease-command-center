#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { productionReadiness } from "./runtime-security.mjs";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";
import { buildExactObjectLink, resolveRouteCompatibility } from "./ui/route-compatibility.mjs";
import { readCommandCenterVNextConfig, readCommandCenterVNextProductConfig } from "./ui/vnext-config.mjs";
import { VNEXT_PRODUCTION_READS, VNEXT_ROLLBACK_CHECKPOINT } from "./vnext-production-contract.mjs";

const SENTINEL = "synthetic-production-secret-must-not-be-exposed";
const seed = {
  settings:{ privateProviderCredential:SENTINEL },
  runtime:{ livePostingGates:{} },
  posts:[{ id:"production-post", title:"Synthetic production Post", hook:"Synthetic compact summary", status:"draft", targetChannels:["linkedin"], _version:1 }],
  tasks:[{ id:"production-task", title:"Synthetic production task", status:"open", important:true }],
  campaigns:[{ id:"production-campaign", name:"Synthetic production Campaign", status:"draft", recipients:[] }],
  partners:[{ id:"production-partner", name:"Synthetic production Partner", organization:"Synthetic production Partner", stage:"qualified", nextAction:"Review the next step." }],
  dataRoomItems:[{ id:"production-file", title:"Synthetic production File", fileName:"production.md", status:"current", allowedRoles:["owner"] }],
  approvals:[], queueItems:[], activityEvents:[], auditHistory:[], reports:[], evidencePackNotes:[],
  soc2Evidence:[], soc2Policies:[], brandAssets:[], contentBank:[], socialAccounts:[], roleAssignments:[]
};
const explicitFlags = {
  COMMAND_CENTER_UX_VNEXT:"true",
  COMMAND_CENTER_UX_VNEXT_SOCIAL:"true",
  COMMAND_CENTER_UX_VNEXT_OUTREACH:"true",
  COMMAND_CENTER_UX_VNEXT_FILES:"true",
  COMMAND_CENTER_UX_VNEXT_DISCOVERY:"true",
  COMMAND_CENTER_FILES_CURSOR_SECRET:"synthetic-production-cursor-secret",
  COMMAND_CENTER_TEST_SOCIAL_PUBLISH_ADAPTER:"inert",
  COMMAND_CENTER_TEST_SOCIAL_MANUAL_ADAPTER:"inert",
  LIVE_POSTING_ENABLED:"false",
  REACTIVATION_LIVE_SEND:"false",
  OUTREACH_LIVE_SEND:"false",
  ALERT_EMAIL_LIVE_SEND:"false"
};

assert.equal(readCommandCenterVNextConfig({}).enabled, false);
for (const product of ["social", "outreach", "files", "discovery"]) {
  assert.equal(readCommandCenterVNextProductConfig({}, product).enabled, false, `${product} must default off.`);
  assert.equal(readCommandCenterVNextProductConfig({ ...explicitFlags, COMMAND_CENTER_UX_VNEXT:"false" }, product).enabled, false, `${product} cannot bypass the global flag.`);
}
const hostedFailure = productionReadiness({ NODE_ENV:"production", STORAGE_BACKEND:"json", LOCAL_DEMO_MODE:"false" }, { activeStorageBackend:"json" });
assert.equal(hostedFailure.ok, false);
assert.ok(hostedFailure.errors.includes("durable_storage_backend_required"));

const manifest = await readFile("render.yaml", "utf8");
for (const gate of ["ENABLE_LIVE_LINKEDIN_POSTING", "ENABLE_LIVE_FACEBOOK_POSTING", "ENABLE_LIVE_INSTAGRAM_POSTING", "ENABLE_LIVE_X_POSTING", "REACTIVATION_LIVE_SEND", "OUTREACH_LIVE_SEND"]) {
  assert.match(manifest, new RegExp(`key: ${gate}\\s*\\n\\s*value: ["']false["']`));
}

const enabled = await startPreviewServer({ seed, env:explicitFlags });
const rollback = await startPreviewServer({ seed, env:{ COMMAND_CENTER_UX_VNEXT:"false" } });
try {
  const unauthorized = await fetch(`${enabled.baseUrl}/api/ui/today`, { headers:{ accept:"application/json" }, signal:AbortSignal.timeout(10_000) });
  assert.equal(unauthorized.status, 401, "A compact vNext read must reject an unauthenticated request.");

  const session = await loginOwner(enabled);
  const headers = { cookie:session.cookie, accept:"application/json" };
  const root = await fetch(`${enabled.baseUrl}/#today`, { headers, signal:AbortSignal.timeout(10_000) }).then((response) => response.text());
  assert.match(root, /data-command-center-shell=["']vnext["']/);
  assert.match(root, /<main\s+id=["']app["']/);
  assert.ok(root.replace(/<[^>]+>/g, " ").trim().length > 500, "The authenticated shell must not be blank.");
  assert.doesNotMatch(root, new RegExp(SENTINEL));

  const compactReads = [];
  for (const pathname of VNEXT_PRODUCTION_READS) {
    const result = await jsonRequest(enabled.baseUrl, pathname, { headers });
    assert.equal(result.response.status, 200, `${pathname} must pass the production-like compact read.`);
    assert.ok(Buffer.byteLength(result.text) < 250_000, `${pathname} must stay within the broad list budget.`);
    assert.doesNotMatch(result.text, new RegExp(SENTINEL));
    compactReads.push({ pathname, bytes:Buffer.byteLength(result.text) });
  }

  const safety = await jsonRequest(enabled.baseUrl, "/api/safety/posture", { headers });
  assert.equal(safety.response.status, 200);
  assert.doesNotMatch(safety.text, /"enabled"\s*:\s*true|"live"\s*:\s*true/i, "Production-like external authority must remain off.");
  const privateAsset = await jsonRequest(enabled.baseUrl, "/api/assets/private?token=invalid", { headers });
  assert.equal(privateAsset.response.status, 404);
  assert.deepEqual(privateAsset.json, { error:"Asset is unavailable." });

  for (const [alias, destination] of [["#proof", "Files"], ["#dataroom", "Files"], ["#campaigns", "Outreach"], ["#queue", "Social"]]) {
    assert.equal(resolveRouteCompatibility(alias).destination, destination);
  }
  assert.equal(buildExactObjectLink({ objectType:"Post", sourceKind:"post", sourceId:"production-post" }).target, "#social/post/production-post");
  assert.equal(buildExactObjectLink({ objectType:"Campaign", sourceKind:"campaign", sourceId:"production-campaign" }).target, "#outreach/campaign/production-campaign");
  assert.equal(buildExactObjectLink({ objectType:"Partner", sourceKind:"partner", sourceId:"production-partner" }).target, "#partners/partner/production-partner");
  assert.equal(buildExactObjectLink({ objectType:"File", sourceKind:"data-room-item", sourceId:"production-file" }).target, "#files/data-room-item/production-file");

  const rollbackSession = await loginOwner(rollback);
  const legacy = await fetch(`${rollback.baseUrl}/#today`, { headers:{ cookie:rollbackSession.cookie }, signal:AbortSignal.timeout(10_000) }).then((response) => response.text());
  assert.doesNotMatch(legacy, /data-command-center-shell=["']vnext["']/);
  assert.ok(legacy.replace(/<[^>]+>/g, " ").trim().length > 500, "The rollback shell must remain useful.");

  console.log("VNEXT_PRODUCTION_VERIFICATION", JSON.stringify({
    result:"pass",
    flags:{ globalDefault:false, productDefaults:false, explicitFixture:true },
    authorization:{ anonymousCompactRead:401, authenticated:true },
    compactReads,
    secretExposures:0,
    externalAuthority:{ publishing:false, sending:false, adapters:"inert" },
    privateStorage:{ invalidAssetFailsClosed:true, hostedJsonFailsClosed:true },
    routes:{ aliases:4, exactObjectLinks:4 },
    whiteScreens:0,
    rollback:VNEXT_ROLLBACK_CHECKPOINT
  }));
  console.log("PASS verify-vnext-production");
} finally {
  await Promise.all([enabled.stop(), rollback.stop()]);
}
