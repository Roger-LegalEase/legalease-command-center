#!/usr/bin/env node
// Phase 18F guard: RCAP partner ops stays display-only and honest. Usage and packet counts
// come straight from inbound events and approved funnel snapshots, shown as the separate
// facts they are; the onboarding checklist never fabricates progress a stage cannot prove;
// and — the hard rule — no cap enforcement exists anywhere in the module or its route.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPartnerUsageView, buildOnboardingChecklist, buildPacketCounts,
  partnerUsageWindowCount, ONBOARDING_STEPS, RCAP_PARTNER_OPS_NOTE
} from "./rcap-partner-ops.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// ---- fixtures --------------------------------------------------------------------------------

function usageEvent(id, partnerId, month, metadata = {}, overrides = {}) {
  return {
    id: `automation-event-${id}`,
    source: "recordshield",
    eventType: "partner_usage_window",
    receivedAt: `${month}-15T12:00:00.000Z`,
    rawPayload: { partnerId, timestamp: `${month}-15T12:00:00.000Z`, metadata },
    relatedEntityType: partnerId ? "partner" : "funnel",
    relatedEntityId: partnerId || "",
    ...overrides
  };
}

function packetEvent(id, eventType, partnerId) {
  return {
    id: `automation-event-${id}`,
    source: "expungement_ai",
    eventType,
    receivedAt: "2026-07-01T12:00:00.000Z",
    rawPayload: { partnerId, metadata: {} },
    relatedEntityType: partnerId ? "partner" : "funnel",
    relatedEntityId: partnerId || ""
  };
}

const PARTNERS = [
  { id: "p-1", organizationName: "Second Chance Legal Aid", status: "campaign_live" },
  { id: "p-2", organizationName: "Fresh Start Collective", status: "signed_pilot" },
  { id: "p-3", organizationName: "River County Reentry", status: "paused" },
  { id: "p-4", organizationName: "New Leaf Fund", status: "target_identified" }
];

// ---- partner usage ---------------------------------------------------------------------------

check("usage groups partner_usage_window events by partner and month with the recorded counts", () => {
  const view = buildPartnerUsageView({
    partners: PARTNERS,
    automationEvents: [
      usageEvent("a", "p-1", "2026-06", { used: 40 }),
      usageEvent("b", "p-1", "2026-07", { partnerUsageWindow: 12 }),
      usageEvent("c", "p-2", "2026-07", { count: 5 }),
      usageEvent("d", "p-2", "2026-07", {}), // no count key -> defaults to 1
      packetEvent("e", "packet_generated", "p-1") // different type -> ignored here
    ]
  });
  assert.equal(view.ok, true);
  assert.equal(view.writesState, false);
  assert.equal(view.capEnforcement, "none");
  assert.equal(view.totals.observed, 58);
  assert.equal(view.totals.events, 4);
  assert.equal(view.totals.partnersReporting, 2);
  const first = view.partners[0];
  assert.equal(first.partnerName, "Second Chance Legal Aid");
  assert.equal(first.observedTotal, 52);
  assert.deepEqual(first.months, [{ month: "2026-07", observed: 12 }, { month: "2026-06", observed: 40 }]);
});

check("usage count key precedence matches what receiveProductEvent records", () => {
  assert.equal(partnerUsageWindowCount({ partnerUsageWindow: 9, used: 3, count: 1 }), 9);
  assert.equal(partnerUsageWindowCount({ used: 3, count: 1 }), 3);
  assert.equal(partnerUsageWindowCount({ count: 7 }), 7);
  assert.equal(partnerUsageWindowCount({}), 1);
  assert.equal(partnerUsageWindowCount({ used: -4 }), 0, "negative counts clamp to zero");
  assert.equal(partnerUsageWindowCount({ used: "not-a-number" }), 1, "junk falls back to 1");
});

check("approved funnel snapshot usage is shown separately, never merged into observed", () => {
  const view = buildPartnerUsageView({
    partners: PARTNERS,
    automationEvents: [usageEvent("a", "p-1", "2026-07", { used: 10 })],
    funnelSnapshots: [{ id: "f-1", partnerId: "p-1", partnerUsageWindow: 10 }]
  });
  const row = view.partners[0];
  assert.equal(row.observedTotal, 10);
  assert.equal(row.approvedFunnelTotal, 10);
  assert.equal(view.totals.observed, 10, "funnel total does not inflate the observed total");
  assert.equal(view.totals.approvedFunnel, 10);
});

check("usage events with no matching partner land in an honest unmatched row", () => {
  const view = buildPartnerUsageView({
    partners: PARTNERS,
    automationEvents: [usageEvent("a", "", "2026-07", { used: 3 }, { relatedEntityType: "funnel", relatedEntityId: "" })]
  });
  assert.equal(view.partners[0].partnerName, "Unmatched partner");
  assert.equal(view.totals.partnersReporting, 0);
});

check("usage is honest about zero", () => {
  const view = buildPartnerUsageView({ partners: PARTNERS, automationEvents: [] });
  assert.equal(view.totals.observed, 0);
  assert.match(view.plain, /No partner usage events have arrived yet/);
});

// ---- onboarding checklist ---------------------------------------------------------------------

check("onboarding derives done steps from the lifecycle stage", () => {
  const view = buildOnboardingChecklist({ partners: PARTNERS });
  const byName = Object.fromEntries(view.partners.map((r) => [r.partnerName, r]));
  const live = byName["Second Chance Legal Aid"]; // campaign_live -> reporting
  assert.equal(live.doneCount, ONBOARDING_STEPS.length);
  assert.match(live.plain, /Fully onboarded/);
  const pilot = byName["Fresh Start Collective"]; // signed_pilot -> active_pilot
  assert.equal(pilot.doneCount, 6);
  assert.equal(pilot.nextStep, "Reporting live");
  const lead = byName["New Leaf Fund"]; // target_identified -> lead
  assert.equal(lead.doneCount, 1);
  assert.equal(lead.nextStep, "Qualified as a fit");
});

check("a stalled partner shows paused with no fabricated progress", () => {
  const view = buildOnboardingChecklist({ partners: PARTNERS });
  const stalled = view.partners.find((r) => r.partnerName === "River County Reentry"); // paused -> stalled
  assert.equal(stalled.paused, true);
  assert.equal(stalled.doneCount, 0, "stage proves nothing, so nothing is marked done");
  assert.equal(stalled.nextStep, "");
  assert.match(stalled.plain, /paused/i);
});

check("onboarding is honest about an empty partner list", () => {
  const view = buildOnboardingChecklist({ partners: [] });
  assert.equal(view.partners.length, 0);
  assert.match(view.plain, /No partners are on record yet/);
});

// ---- packet counts ----------------------------------------------------------------------------

check("packet counts come from observed events and approved snapshots, labeled separately", () => {
  const view = buildPacketCounts({
    partners: PARTNERS,
    automationEvents: [
      packetEvent("a", "packet_generated", "p-1"),
      packetEvent("b", "packet_generated", "p-1"),
      packetEvent("c", "packet_completed", "p-1"),
      packetEvent("d", "packet_generated", "p-2"),
      usageEvent("e", "p-1", "2026-07", { used: 4 }) // not a packet event -> ignored
    ],
    funnelSnapshots: [{ id: "f-1", partnerId: "p-1", packetGenerated: 2, packetCompleted: 1 }]
  });
  assert.deepEqual(view.totals.observed, { generated: 3, completed: 1 });
  assert.deepEqual(view.totals.funnel, { generated: 2, completed: 1 });
  const top = view.partners[0];
  assert.equal(top.partnerName, "Second Chance Legal Aid");
  assert.deepEqual(top.observed, { generated: 2, completed: 1 });
  assert.deepEqual(top.funnel, { generated: 2, completed: 1 });
});

check("packet counts are honest about zero and say generation happens elsewhere", () => {
  const view = buildPacketCounts({ partners: PARTNERS });
  assert.match(view.plain, /No packet events have arrived yet/);
  assert.match(view.plain, /Packet generation happens outside this system/);
});

// ---- structural guards ------------------------------------------------------------------------

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const moduleSource = stripComments(readFileSync(new URL("./rcap-partner-ops.mjs", import.meta.url), "utf8"));
const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

check("the module is display-only: no writes, no network, no queue or approval creation", () => {
  assert(!/writeState|writeCollections|serializeStateMutation/.test(moduleSource), "no state writes");
  assert(!/fetch\(|smtp|mailto|\.send\(/i.test(moduleSource), "no network or mail calls");
  assert(!/emitCompanyEvent|recordAgentRun|transitionQueueItem|queueItems\s*:/.test(moduleSource), "no queue/approval/event writes");
  for (const view of [buildPartnerUsageView({}), buildOnboardingChecklist({}), buildPacketCounts({})]) {
    assert.equal(view.writesState, false);
    assert.equal(view.displayOnly, true);
  }
});

check("no cap enforcement exists and every view says so", () => {
  // The declarative capEnforcement:"none" field and the display-only note are allowed to say
  // the word "cap"; nothing else in the module may speak enforcement vocabulary.
  const code = moduleSource.replaceAll("capEnforcement", "").replaceAll(RCAP_PARTNER_OPS_NOTE, "");
  assert(!/allowance|quota|throttle|limit|remaining|exceeded|blocked|enforce/i.test(code), "no enforcement vocabulary in code paths");
  assert.match(RCAP_PARTNER_OPS_NOTE, /There is no partner cap/);
  for (const view of [buildPartnerUsageView({}), buildOnboardingChecklist({}), buildPacketCounts({})]) {
    assert.equal(view.note, RCAP_PARTNER_OPS_NOTE);
  }
});

check("the partner-ops route is GET-only display with no write path", () => {
  const routeAt = serverSource.indexOf('url.pathname === "/api/rcap/partner-ops"');
  assert(routeAt >= 0, "route exists");
  const block = serverSource.slice(routeAt, serverSource.indexOf("return;", routeAt));
  assert(block.includes('request.method === "GET"'), "GET only");
  assert(!/writeState\(|writeCollections\(|serializeStateMutation\(/.test(block), "no writes in the route");
});

check("the partners page carries the partner ops card and display-only copy", () => {
  for (const marker of ["RCAP partner ops", "loadRcapPartnerOps()", "rcap-partner-ops-result", "no caps exist"]) {
    assert(serverSource.includes(marker), `page has: ${marker}`);
  }
});

console.log(`\ntest-rcap-partner-ops: all ${passed} checks passed.`);
