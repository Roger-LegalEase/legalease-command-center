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
import { buildTodaySummary } from "./company-memory-projector.mjs";
import { loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

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
const HMAC_SECRET = ["scoreboard", "synthetic", "product", "2026", "Q7m9", "V4x2"].join("-");
const server = await startPreviewServer({
  seed: { funnelSnapshots: [], automationEvents: [], automationSuggestions: [], activityEvents: [] },
  env: {
    NODE_ENV: "test",
    COMMAND_CENTER_TEST_MODE: "true",
    SKIP_ENV_LOCAL_FILE: "1",
    STORAGE_BACKEND: "json",
    COMMAND_CENTER_ALLOW_JSON: "true",
    LOCAL_DEMO_MODE: "true",
    PRODUCT_EVENT_WEBHOOK_ENABLED: "true",
    PRODUCT_EVENT_WEBHOOK_SECRET: HMAC_SECRET,
    LEGALEASE_OS_EVENTS_SECRET: HMAC_SECRET,
    ENABLE_LIVE_LINKEDIN_POSTING: "false",
    ENABLE_LIVE_FACEBOOK_POSTING: "false",
    ENABLE_LIVE_INSTAGRAM_POSTING: "false",
    ENABLE_LIVE_X_POSTING: "false",
    ENABLE_LIVE_THREADS_POSTING: "false",
    ENABLE_LIVE_TIKTOK_POSTING: "false",
    REACTIVATION_LIVE_SEND: "false",
    OUTREACH_LIVE_SEND: "false",
    ALERT_EMAIL_LIVE_SEND: "false",
    PROSPECT_LIVE_DISCOVERY: "false"
  }
});
const baseUrl = server.baseUrl;
const request = (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
  ...options,
  signal: options.signal || AbortSignal.timeout(10_000)
});

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
  const owner = await loginOwner(server);
  const ownerGet = (pathname) => request(pathname, { headers: { cookie: owner.cookie } });

  // 3a. bad signature rejected, nothing changes
  {
    const raw = eventBody();
    const bad = await request("/api/events/product", {
      method: "POST",
      headers: { ...signedHeaders(raw), "X-Legalease-OS-Signature": "sha256=" + "0".repeat(64) },
      body: raw
    });
    assert.equal(bad.status >= 400, true, "bad signature must be rejected");
    const summary = await (await ownerGet("/api/today/summary")).json();
    assert.equal(summary.goodMorning.screeningsStarted, 0);
    assert.equal(summary.goodMorning.funnelConnected, false);
    ok("bad signature rejected; funnel untouched");
  }

  // 3b. signed event auto-applies the metric
  {
    const raw = eventBody();
    const res = await request("/api/events/product", { method: "POST", headers: signedHeaders(raw), body: raw });
    const body = await res.json();
    assert.equal(res.status >= 200 && res.status < 300, true, `accepted (got ${res.status})`);
    assert.equal(body.autoApplied, true, "response reports the auto-applied funnel metric");
    const summary = await (await ownerGet("/api/today/summary")).json();
    assert.equal(summary.goodMorning.screeningsStarted, 1, "metric auto-applied without any approval step");
    assert.equal(summary.goodMorning.funnelConnected, true);
    ok("signed metric event auto-applies: funnel count moves with zero human steps");
  }

  // 3c. audit suggestion exists born-applied; nothing pending
  {
    const state = await (await ownerGet("/api/state")).json();
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
    await request("/api/events/product", { method: "POST", headers: signedHeaders(raw), body: raw });
    const summary = await (await ownerGet("/api/today/summary")).json();
    assert.equal(summary.goodMorning.screeningsStarted, 1, "replayed sourceEventId never double-counts");
    ok("replay-safe: duplicate event leaves the count unchanged");
  }

  // 3e. web visits flows from landing_page_viewed
  {
    const raw = eventBody({ eventType: "landing_page_viewed", anonymousId: "anon-e2e-2" });
    await request("/api/events/product", { method: "POST", headers: signedHeaders(raw), body: raw });
    const summary = await (await ownerGet("/api/today/summary")).json();
    assert.equal(summary.goodMorning.webVisits, 1, "web visits counts landing_page_viewed events");
    ok("web visits wired to landing_page_viewed product events");
  }

  // 3f. summary attaches live-source posture without keys: honest not-connected
  {
    const summary = await (await ownerGet("/api/today/summary")).json();
    assert.equal(summary.money.stripeConnected, false, "no Stripe key = not connected, not fake");
    assert.equal(summary.goodMorning.signupsConnected, false, "no signups key = not connected");
    ok("summary endpoint attaches live-source posture; missing keys stay honestly disconnected");
  }
} finally {
  await server.stop();
}

console.log(`\nAll ${passed} scoreboard wiring checks passed.`);
