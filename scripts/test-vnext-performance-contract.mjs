#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";
import {
  VNEXT_PERFORMANCE_BUDGETS,
  VNEXT_PRIMARY_READS,
  percentile,
  responseBudgetFor
} from "./vnext-performance-contract.mjs";

const FULL_STATE_SENTINEL = "full-state-sentinel-must-not-leave-storage";
const records = (prefix, count, extra = {}) => Array.from({ length:count }, (_, index) => ({
  id:`${prefix}-${String(index).padStart(4, "0")}`,
  title:`Synthetic ${prefix} record ${String(index + 1).padStart(4, "0")}`,
  name:`Synthetic ${prefix} record ${String(index + 1).padStart(4, "0")}`,
  organization:`Synthetic ${prefix} record ${String(index + 1).padStart(4, "0")}`,
  status:"draft",
  owner:"owner",
  updatedAt:`2026-07-${String(1 + (index % 19)).padStart(2, "0")}T12:00:00.000Z`,
  ...extra
}));

const seed = {
  settings:{ providerPayload:FULL_STATE_SENTINEL },
  runtime:{ livePostingGates:{}, privateDiagnostic:FULL_STATE_SENTINEL },
  tasks:records("task", 420, { status:"open", important:true, dueDate:"2026-07-20" }),
  posts:records("post", 420, { hook:"Synthetic compact Post summary.", targetChannels:["linkedin"], _version:1 }),
  campaigns:records("campaign", 320, { campaignType:"announcement", recipients:[] }),
  partners:records("partner", 320, { stage:"qualified", nextAction:"Review the synthetic next action." }),
  dataRoomItems:records("file", 320, { fileName:"synthetic.md", mimeType:"text/markdown", status:"current", allowedRoles:["owner"] }),
  approvals:[], queueItems:[], activityEvents:[], auditHistory:[], reports:[], evidencePackNotes:[],
  soc2Evidence:[], soc2Policies:[], brandAssets:[], contentBank:[], socialAccounts:[], roleAssignments:[]
};

const server = await startPreviewServer({
  seed,
  env:{
    COMMAND_CENTER_UX_VNEXT:"true",
    COMMAND_CENTER_UX_VNEXT_SOCIAL:"true",
    COMMAND_CENTER_UX_VNEXT_OUTREACH:"true",
    COMMAND_CENTER_UX_VNEXT_FILES:"true",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:"true",
    COMMAND_CENTER_FILES_CURSOR_SECRET:"synthetic-performance-cursor-secret",
    COMMAND_CENTER_TEST_SOCIAL_PUBLISH_ADAPTER:"inert",
    COMMAND_CENTER_TEST_SOCIAL_MANUAL_ADAPTER:"inert"
  }
});

try {
  const session = await loginOwner(server);
  const headers = { cookie:session.cookie, accept:"application/json" };
  const evidence = [];

  for (const contract of VNEXT_PRIMARY_READS) {
    await jsonRequest(server.baseUrl, contract.path, { headers });
    const samples = [];
    let bytes = 0;
    let body = "";
    for (let index = 0; index < 7; index += 1) {
      const startedAt = performance.now();
      const result = await jsonRequest(server.baseUrl, contract.path, { headers });
      samples.push(performance.now() - startedAt);
      assert.equal(result.response.status, 200, `${contract.surface} compact read must succeed.`);
      bytes = Buffer.byteLength(result.text);
      body = result.text;
    }
    const p95Ms = Number(percentile(samples, 95).toFixed(2));
    assert.ok(bytes < responseBudgetFor(contract.kind), `${contract.surface} ${contract.kind} response is ${bytes} bytes.`);
    assert.ok(p95Ms < VNEXT_PERFORMANCE_BUDGETS.hostedPageReadP95Ms, `${contract.surface} p95 is ${p95Ms} ms.`);
    assert.doesNotMatch(body, new RegExp(FULL_STATE_SENTINEL), `${contract.surface} must not echo whole-state sentinels.`);
    evidence.push({ surface:contract.surface, kind:contract.kind, bytes, p95Ms, samples:samples.length });
  }

  for (const surface of ["Inbox", "Social", "Outreach", "Partners", "Files", "Search"]) {
    const item = evidence.find((entry) => entry.surface === surface);
    assert.ok(item && item.kind === "list", `${surface} must be governed by the list contract.`);
  }

  const shell = await fetch(`${server.baseUrl}/#today`, { headers, signal:AbortSignal.timeout(10_000) }).then((response) => response.text());
  const scriptBytes = [...shell.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .reduce((total, match) => total + Buffer.byteLength(match[1]), 0);
  const stylesheetPaths = [...new Set([...shell.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((match) => match[1]))];
  let cssBytes = 0;
  for (const pathname of stylesheetPaths) {
    const response = await fetch(new URL(pathname, server.baseUrl), { headers, signal:AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200, `Critical stylesheet ${pathname} must load.`);
    cssBytes += Buffer.byteLength(await response.text());
  }
  assert.ok(cssBytes < VNEXT_PERFORMANCE_BUDGETS.criticalCssBytes, `Critical CSS is ${cssBytes} bytes.`);
  assert.ok(scriptBytes < VNEXT_PERFORMANCE_BUDGETS.initialClientJavaScriptBytes, `Initial client JavaScript is ${scriptBytes} bytes.`);

  const sourceFiles = [
    "scripts/partner-api-integration.mjs",
    "scripts/outreach-api-integration.mjs",
    "scripts/files-api-integration.mjs"
  ];
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\.writeState\s*\(/, `${file} must not perform full-state persistence.`);
  }
  const browserSources = await Promise.all([
    "scripts/ui/pages/today-page.mjs", "scripts/ui/pages/inbox-page.mjs", "scripts/ui/pages/social-home.mjs",
    "scripts/ui/pages/outreach-home.mjs", "scripts/ui/pages/partners-home.mjs",
    "scripts/ui/controllers/files-integration-controller.mjs", "scripts/ui/global-search.mjs", "scripts/ui/global-create.mjs"
  ].map((file) => readFile(file, "utf8")));
  assert.doesNotMatch(browserSources.join("\n"), /fetch\s*\(\s*["'`]\/api\/(?:state|boot-state)/, "Primary vNext clients must not request full company state.");

  console.log("VNEXT_PERFORMANCE_EVIDENCE", JSON.stringify({
    budgets:VNEXT_PERFORMANCE_BUDGETS,
    assets:{ criticalCssBytes:cssBytes, initialClientJavaScriptBytes:scriptBytes, stylesheetCount:stylesheetPaths.length },
    reads:evidence,
    fullStateSentinelsExposed:0,
    fullStatePersistenceCalls:0
  }));
  console.log("PASS test-vnext-performance-contract");
} finally {
  await server.stop();
}
