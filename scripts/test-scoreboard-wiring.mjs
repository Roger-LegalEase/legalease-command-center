// Scoreboard wiring tests (Phase 1, 2026-07-09). Proves the Today company scoreboard
// reads real sources and stays honest:
//   1. Funnel aggregation sums product-event keys across ALL funnelSnapshots rows
//      (legacy aggregate spellings still count; mixed-spelling rows never double-count;
//      empty collection = honest zeros with funnelConnected false).
//   2. buildTodaySummary connects Revenue/Accounts only when the live snapshots say
//      available; missing keys = "not wired", never fake numbers.
//   3. End to end on a real spawned server (JSON backend, temp dir): a correctly
//      HMAC-signed product event AUTO-APPLIES its funnel metric (Roger's decision:
//      metrics are not actions) — funnelSnapshots gains the row, the audit suggestion
//      is born "applied" (nothing pending), /api/today/summary reflects the count,
//      and a replay of the same event does not double-count. A bad signature is
//      rejected and changes nothing.
// Nothing here contacts Stripe, SendGrid, or Expungement.ai.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildTodaySummary } from "./company-memory-projector.mjs";

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Scoreboard wiring tests");

// ---- 1. funnel aggregation (pure projector) -------------------------------------------------
{
  const state = {
    funnelSnapshots: [
      { id: "e1", expungementIntakeStarted: 1 },
      { id: "e2", expungementIntakeStarted: 1 },
      { id: "e3", paymentStarted: 1 },
      { id: "e4", landingPageVisits: 1 },
      // Legacy aggregate row: legacy spellings count, and a row carrying BOTH
      // spellings of one metric counts once (first key wins).
      { id: "legacy", screenings_started: 3, screeningsStarted: 999, checkouts: 2, landing_page_visits: 40 }
    ]
  };
  const summary = buildTodaySummary(state, { env: {} });
  assert.equal(summary.goodMorning.screeningsStarted, 5, "2 event rows + legacy 3 (999 dupe-spelling ignored)");
  assert.equal(summary.goodMorning.checkouts, 3, "1 event row + legacy 2");
  assert.equal(summary.goodMorning.webVisits, 41, "1 event row + legacy 40");
  assert.equal(summary.goodMorning.funnelConnected, true);
  ok("funnel aggregation sums across rows, honors legacy keys, never double-counts a row");
}

// ---- 2. honest zeros -------------------------------------------------------------------------
{
  const empty = buildTodaySummary({}, { env: {} });
  assert.equal(empty.goodMorning.screeningsStarted, 0);
  assert.equal(empty.goodMorning.checkouts, 0);
  assert.equal(empty.goodMorning.webVisits, 0);
  assert.equal(empty.goodMorning.funnelConnected, false, "no snapshots = not connected, not zero-connected");
  assert.equal(empty.money.stripeConnected, false);
  assert.equal(empty.goodMorning.signupsConnected, false);

  const wired = buildTodaySummary({
    stripeRevenue: { available: true, gross: 1234, currency: "usd", sinceLabel: "May 1", since: "2026-05-01" },
    signups: { available: true, paid: 3, registered: 41 }
  }, { env: {} });
  assert.equal(wired.money.stripeConnected, true);
  assert.equal(wired.money.gross, 1234);
  assert.equal(wired.goodMorning.registered, 41);
  assert.equal(wired.goodMorning.paid, 3);
  const unavailable = buildTodaySummary({ stripeRevenue: { available: false }, signups: { available: false } }, { env: {} });
  assert.equal(unavailable.money.stripeConnected, false, "available:false must never read as connected");
  assert.equal(unavailable.goodMorning.signupsConnected, false);
  ok("connected flags follow real source availability; disconnected shows honest not-wired, never numbers");
}

// ---- 3. end to end: signed product event auto-applies ---------------------------------------
const port = Number(process.env.TEST_SCOREBOARD_PORT || 3471);
const baseUrl = `http://127.0.0.1:${port}`;
const HMAC_SECRET = "test-os-events-secret-0123456789";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "legalease-scoreboard-"));
await writeFile(path.join(dataDir, "seed.json"), JSON.stringify({ funnelSnapshots: [], automationEvents: [], automationSuggestions: [], activityEvents: [] }));

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  env: {
    ...process.env,
    PORT: String(port),
    COMMAND_CENTER_DATA_PATH: path.join(dataDir, "data.json"),
    COMMAND_CENTER_SEED_PATH: path.join(dataDir, "seed.json"),
    STORAGE_BACKEND: "json",
    LOCAL_DEMO_MODE: "false",
    PRODUCT_EVENT_WEBHOOK_ENABLED: "true",
    LEGALEASE_OS_EVENTS_SECRET: HMAC_SECRET,
    PRODUCT_EVENT_WEBHOOK_SECRET: "",
    STRIPE_SECRET_KEY: "",
    COMMAND_CENTER_API_KEY: "",
    COMMAND_CENTER_REQUIRE_AUTH: "false"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", (c) => { logs += c.toString(); });
child.stderr.on("data", (c) => { logs += c.toString(); });
const startedAt = Date.now();
while (!logs.includes("preview server ready")) {
  if (child.exitCode !== null) throw new Error(`Server exited before ready:\n${logs}`);
  if (Date.now() - startedAt > 15000) { child.kill(); throw new Error(`Server never became ready:\n${logs}`); }
  await new Promise((r) => setTimeout(r, 100));
}

function signedHeaders(rawBody) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", HMAC_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  return {
    "Content-Type": "application/json",
    "X-Legalease-OS-Timestamp": timestamp,
    "X-Legalease-OS-Signature": `sha256=${signature}`
  };
}
const eventBody = (over = {}) => JSON.stringify({
  eventType: "expungement_intake_started",
  product: "expungement_ai",
  anonymousId: "anon-e2e-1",
  timestamp: "2026-07-09T21:00:00.000Z",
  metadata: {},
  ...over
});

try {
  // 3a. bad signature rejected, nothing changes
  {
    const raw = eventBody();
    const bad = await fetch(`${baseUrl}/api/events/product`, {
      method: "POST",
      headers: { ...signedHeaders(raw), "X-Legalease-OS-Signature": "sha256=" + "0".repeat(64) },
      body: raw
    });
    assert.equal(bad.status >= 400, true, "bad signature must be rejected");
    const summary = await (await fetch(`${baseUrl}/api/today/summary`)).json();
    assert.equal(summary.goodMorning.screeningsStarted, 0);
    assert.equal(summary.goodMorning.funnelConnected, false);
    ok("bad signature rejected; funnel untouched");
  }

  // 3b. signed event auto-applies the metric
  {
    const raw = eventBody();
    const res = await fetch(`${baseUrl}/api/events/product`, { method: "POST", headers: signedHeaders(raw), body: raw });
    const body = await res.json();
    assert.equal(res.status >= 200 && res.status < 300, true, `accepted (got ${res.status})`);
    assert.equal(body.autoApplied, true, "response reports the auto-applied funnel metric");
    const summary = await (await fetch(`${baseUrl}/api/today/summary`)).json();
    assert.equal(summary.goodMorning.screeningsStarted, 1, "metric auto-applied without any approval step");
    assert.equal(summary.goodMorning.funnelConnected, true);
    ok("signed metric event auto-applies: funnel count moves with zero human steps");
  }

  // 3c. audit suggestion exists born-applied; nothing pending
  {
    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    const suggestions = (state.automationSuggestions || []).filter((s) => s.suggestionType === "update_funnel_snapshot");
    assert.equal(suggestions.length, 1, "one audit suggestion recorded");
    assert.equal(suggestions[0].status, "applied", "born applied, never pending");
    assert.equal(Boolean(suggestions[0].appliedAt), true);
    // Action-type suggestions from the generic classifier may still pend (the
    // approval gate stays for anything that ACTS); only funnel METRICS must never wait.
    const pendingFunnel = (state.automationSuggestions || []).filter((s) => s.suggestionType === "update_funnel_snapshot" && s.status === "pending");
    assert.equal(pendingFunnel.length, 0, "no funnel metric waits in the approval queue");
    assert.equal((state.funnelSnapshots || []).length, 1, "snapshot row persisted");
    ok("audit trail kept: suggestion recorded as applied, approval queue stays empty");
  }

  // 3d. replay of the same event does not double-count
  {
    const raw = eventBody();  // same anonymousId + timestamp => same sourceEventId
    await fetch(`${baseUrl}/api/events/product`, { method: "POST", headers: signedHeaders(raw), body: raw });
    const summary = await (await fetch(`${baseUrl}/api/today/summary`)).json();
    assert.equal(summary.goodMorning.screeningsStarted, 1, "replayed sourceEventId never double-counts");
    ok("replay-safe: duplicate event leaves the count unchanged");
  }

  // 3e. web visits flows from landing_page_viewed
  {
    const raw = eventBody({ eventType: "landing_page_viewed", anonymousId: "anon-e2e-2" });
    await fetch(`${baseUrl}/api/events/product`, { method: "POST", headers: signedHeaders(raw), body: raw });
    const summary = await (await fetch(`${baseUrl}/api/today/summary`)).json();
    assert.equal(summary.goodMorning.webVisits, 1, "web visits counts landing_page_viewed events");
    ok("web visits wired to landing_page_viewed product events");
  }

  // 3f. summary attaches live-source posture without keys: honest not-connected
  {
    const summary = await (await fetch(`${baseUrl}/api/today/summary`)).json();
    assert.equal(summary.money.stripeConnected, false, "no Stripe key = not connected, not fake");
    assert.equal(summary.goodMorning.signupsConnected, false, "no signups key = not connected");
    ok("summary endpoint attaches live-source posture; missing keys stay honestly disconnected");
  }
} finally {
  child.kill();
}

console.log(`\nAll ${passed} scoreboard wiring checks passed.`);
