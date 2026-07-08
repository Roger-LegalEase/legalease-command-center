#!/usr/bin/env node
// Scoped-write hardening tests — the 2026-07-08 campaign-day clobber class.
//
// What happened on prod: the public URL takes constant scanner/bot traffic, and every DENIED
// request ran a full-state readState+writeState OUTSIDE the mutation serializer (857 of the
// 1,000 capped SOC 2 audit entries were denials). Product events (also public, signed) did a
// full-state write per event. Full-state writes carry a pre-read snapshot of EVERY collection,
// so any scoped write landing in their read→write window is silently reverted — this reverted
// the reactivation live-mode arm on campaign day. Three of the four collections the product
// event handler changes were never registered in coreStateCollections, so that data silently
// never persisted on Supabase at all.
//
// These tests prove the fixes:
//   1. automationEvents / automationSuggestions / connectorStatus are registered (non-singleton).
//   2. logAccessDecision: deduped per (actor, path, reason) window, serialized, SCOPED write.
//   3. receiveProductEvent: SCOPED write of exactly the four collections it changes.
//   4. /api/heartbeat/autopilot: serialized + scoped singleton write.
//   5. /api/heartbeat/tick: runHeartbeat wrapped in the mutation serializer.
//   6. Live behavior (spawned server): repeated anonymous denials produce ONE audit entry per
//      path; a signed product event persists; scoped writes never wipe unrelated collections.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { signUnsubscribeToken } from "./outreach-os.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

console.log("Scoped-write hardening tests");

// ---- 1. Collection registration (the silent-drop trap) ----------------------------------------
{
  for (const collection of ["automationEvents", "automationSuggestions", "connectorStatus", "activityEvents", "soc2AuditLogs"]) {
    assert(coreStateCollections.includes(collection), `${collection} must be in coreStateCollections`);
  }
  for (const collection of ["automationEvents", "automationSuggestions", "connectorStatus"]) {
    assert(!singletonCollections.has(collection), `${collection} is a list, not a singleton`);
  }
  ok("product-event collections are registered for persistence (list-shaped, not singletons)");
}

// ---- 2–5. Source-level guards on the server write paths ---------------------------------------
const src = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
function sliceBetween(startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert(start >= 0, `source marker missing: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  return src.slice(start, end > start ? end : start + 4000);
}

{
  const body = sliceBetween("async function logAccessDecision", "async function saveDebugOpenAIImage");
  assert(body.includes("shouldLogAccessDenial("), "denials are deduped");
  assert(body.includes("serializeStateMutation"), "denial audit write is serialized");
  assert(body.includes("writeCollections({ soc2AuditLogs"), "denial audit write is scoped to soc2AuditLogs");
  assert(!body.includes("store.writeState("), "no full-state write remains in the denial path");
  ok("logAccessDecision: deduped + serialized + scoped (no full-state write per bot hit)");
}

{
  const body = sliceBetween("async function receiveProductEvent", "function collectionForRelatedType");
  assert(body.includes("serializeStateMutation"), "product event mutation stays serialized");
  assert(body.includes("store.writeCollections({"), "product event write is scoped");
  for (const key of ["automationEvents:", "automationSuggestions:", "connectorStatus:", "activityEvents:"]) {
    assert(body.includes(key), `scoped product-event write carries ${key}`);
  }
  assert(!body.includes("store.writeState("), "no full-state write remains in the product-event path");
  ok("receiveProductEvent: scoped write of exactly the four collections it changes");
}

{
  const body = sliceBetween('url.pathname === "/api/heartbeat/autopilot"', '// ---- B2 outreach OS');
  assert(body.includes("serializeStateMutation"), "autopilot toggle is serialized");
  assert(body.includes("writeCollections({ autopilotSettings"), "autopilot toggle write is scoped");
  assert(!body.includes("store.writeState("), "no full-state write remains in the autopilot toggle");
  ok("/api/heartbeat/autopilot: serialized + scoped singleton write");
}

{
  const body = sliceBetween('url.pathname === "/api/heartbeat/tick"', '"/api/heartbeat/status"');
  assert(/serializeStateMutation\(\(\) => runHeartbeat\(/.test(body), "tick runs inside the mutation serializer");
  ok("/api/heartbeat/tick: serialized so mid-tick scoped writes cannot be clobbered");
}

{
  const body = sliceBetween('url.pathname === "/api/outreach/unsubscribe"', '"/api/outreach/webhooks/sendgrid"');
  assert(body.includes("serializeStateMutation"), "unsubscribe mutation is serialized");
  assert(body.includes("store.writeCollections({"), "unsubscribe write is scoped");
  for (const key of ["outreachSuppressions:", "outreachContacts:", "outreachUnsubscribes:"]) {
    assert(body.includes(key), `scoped unsubscribe write carries ${key}`);
  }
  assert(!body.includes("store.writeState("), "no full-state write remains in the public unsubscribe path");
  ok("/api/outreach/unsubscribe: serialized + scoped write of exactly the three collections it changes");
}

{
  // The Google OAuth callback is PUBLIC (Google redirects the browser to it); a bot GET with
  // ?error= or a garbage state reaches its error writes, so every write must be serialized
  // and scoped: connect success writes exactly connectorStatus+auditHistory+activityEvents
  // (socialAccounts persists via the store method), error paths write via updateSocialAccount.
  const body = sliceBetween('if (url.pathname === "/api/google/callback"', '"/api/google/status"');
  const serializedCount = (body.match(/serializeStateMutation\(/g) || []).length;
  assert(serializedCount >= 4, `all four google-callback write paths are serialized (found ${serializedCount})`);
  for (const key of ["connectorStatus:", "auditHistory:", "activityEvents:"]) {
    assert(body.includes(key), `scoped google-connect write carries ${key}`);
  }
  assert(!body.includes("store.writeState("), "no full-state write remains in the public google callback");
  ok("/api/google/callback: serialized + scoped on all four public write paths");
}

{
  const storageSrc = readFileSync(new URL("./storage.mjs", import.meta.url), "utf8");
  const start = storageSrc.indexOf("async updateSocialAccount");
  const body = storageSrc.slice(start, storageSrc.indexOf("\n  }", start));
  assert(body.includes("writeCollections({ socialAccounts"), "updateSocialAccount writes only socialAccounts");
  assert(!body.includes("this.writeState("), "updateSocialAccount no longer performs a full-state write");
  ok("store.updateSocialAccount: scoped to socialAccounts (reachable from the public callback)");
}

// ---- Tier-2 sweep pin: the full-state write count can never silently grow -------------------
{
  const count = (src.match(/store\.writeState\(/g) || []).length;
  // Allowlist: (1) writeChangedCollections' own in-place-mutation fallback, (2) the
  // /api/publishing/run summary write (worker state lineage has no clean before snapshot;
  // serialized full-state, documented in the handler).
  assert(count <= 2, `preview-server full-state writeState count must stay at 2 or fewer (found ${count})`);
  assert(src.includes("if (after !== before) await store.writeState(after);"), "allowlisted site 1: the diff helper fallback");
  assert(src.includes("serializeStateMutation(() => store.writeState(stateWithSummary))"), "allowlisted site 2: publishing run summary, serialized");
  ok(`tier-2 sweep pinned: ${count} full-state writes remain in preview-server, both allowlisted`);
}

{
  const storageSrc = readFileSync(new URL("./storage.mjs", import.meta.url), "utf8");
  // Every store convenience method writes only its own collection now; the only writeState
  // calls left in storage.mjs are the two writeCollections implementations themselves. The
  // region runs through the END of the JsonStore class so updateSettings (the last method,
  // and the one that broke prod in #27) is inside the pin.
  const methodRegion = storageSrc.slice(storageSrc.indexOf("async generatePosts"), storageSrc.indexOf("export class SupabaseCoreStore"));
  assert(methodRegion.includes("async updateSettings"), "pin region reaches updateSettings");
  assert(!methodRegion.includes("this.writeState("), "no store convenience method performs a full-state write");
  ok("store convenience methods (posts through updateSettings): all scoped, region pinned to class end");
}

// ---- Tier-3: heartbeat + reactivation CLI write mechanics ------------------------------------
{
  const hb = readFileSync(new URL("./heartbeat.mjs", import.meta.url), "utf8");
  assert(hb.includes("writeCollections({ heartbeatLease: lease })"), "lease claim is a one-key scoped write");
  const fullWrites = (hb.match(/store\.writeState\(/g) || []).length;
  assert.equal(fullWrites, 0, `heartbeat performs zero full-state writes; found ${fullWrites}`);
  // The unconditional release guards the JSON-backend steady state where the stored lease is
  // the literal null: a pure reference diff would omit the release and leave the mid-tick
  // claim persisted, wrongly skipping the next tick for a full TTL.
  assert(hb.includes("patch.heartbeatLease = null;"), "closing patch always releases the lease");
  ok("heartbeat tick: lease claim scoped; closing write diff-scoped with unconditional lease release");
}

{
  for (const file of ["reactivation-import.mjs", "reactivation-release-wave.mjs", "reactivation-fire-touch1-wave1.mjs"]) {
    const cli = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert(!cli.includes("store.writeState("), `${file}: no partial-snapshot full-state write (JSON wipe hazard)`);
    assert(cli.includes("store.writeCollections(writeState)"), `${file}: scoped write of the reactivation collections`);
  }
  ok("reactivation CLI scripts: partial snapshots write via writeCollections (backend-safe)");
}

// ---- 6. Live behavior against a spawned server -------------------------------------------------
const port = Number(process.env.TEST_SCOPED_WRITE_PORT || 3971);
const dataDir = mkdtempSync(path.join(tmpdir(), "scoped-write-test-"));
const dataPath = path.join(dataDir, "state.json");
const OWNER_TOKEN = "test-owner-token-0123456789abcdef";
const PRODUCT_SECRET = "test-product-secret-0123456789";

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  env: {
    ...process.env,
    PORT: String(port),
    STORAGE_BACKEND: "local",
    LOCAL_DEMO_MODE: "false",
    COMMAND_CENTER_REQUIRE_AUTH: "true",
    COMMAND_CENTER_AUTH_DISABLED: "false",
    COMMAND_CENTER_OWNER_TOKEN: OWNER_TOKEN,
    PRODUCT_EVENT_WEBHOOK_SECRET: PRODUCT_SECRET,
    LEGALEASE_OS_EVENTS_SECRET: "",
    COMMAND_CENTER_DATA_PATH: dataPath,
    COMMAND_CENTER_SEED_DISABLED: "true",
    OUTREACH_SIGNING_SECRET: "test-unsub-signing-secret-0123456789"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let serverLog = "";
child.stdout.on("data", (d) => { serverLog += d; });
child.stderr.on("data", (d) => { serverLog += d; });

const base = `http://localhost:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function untilHealthy(deadlineMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const resp = await fetch(`${base}/api/health`);
      if (resp.ok) return;
    } catch { /* not up yet */ }
    await wait(300);
  }
  throw new Error(`server never became healthy. log:\n${serverLog.slice(-2000)}`);
}

async function readDataFile() {
  return JSON.parse(await readFile(dataPath, "utf8"));
}

try {
  await untilHealthy();

  // 6a. Denial dedup: four rapid anonymous hits on one path → ONE audit entry; a second path → one more.
  for (let i = 0; i < 4; i++) {
    const resp = await fetch(`${base}/api/state`);
    assert.equal(resp.status, 401, "anonymous /api/state is denied");
  }
  const tasksResp = await fetch(`${base}/api/tasks`);
  assert.equal(tasksResp.status, 401, "anonymous /api/tasks is denied");
  await wait(1200);
  {
    const persisted = await readDataFile();
    const denials = (persisted.soc2AuditLogs || []).filter((entry) => entry.action === "access denied");
    const byPath = denials.reduce((acc, entry) => { acc[entry.resourceId] = (acc[entry.resourceId] || 0) + 1; return acc; }, {});
    assert.equal(byPath["/api/state"], 1, `4 rapid denials on one path collapse to 1 audit entry (got ${JSON.stringify(byPath)})`);
    assert.equal(byPath["/api/tasks"], 1, "a different path still gets its own entry");
    ok("live: bot-style repeated denials write ONE deduped, scoped audit entry per path");
  }

  // 6b. Signed product event persists via the scoped write; unrelated collections survive.
  const eventPayload = JSON.stringify({
    eventType: "landing_page_viewed",
    product: "expungement_ai",
    anonymousId: "scoped-write-test",
    timestamp: "2026-07-08T12:00:00.000Z"
  });
  const eventResp = await fetch(`${base}/api/events/product`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-product-event-secret": PRODUCT_SECRET },
    body: eventPayload
  });
  assert.equal(eventResp.status, 202, `signed product event accepted (got ${eventResp.status})`);
  await wait(800);
  {
    const persisted = await readDataFile();
    const events = persisted.automationEvents || [];
    assert(events.some((event) => event.eventType === "landing_page_viewed"), "product event persisted to automationEvents");
    assert(Array.isArray(persisted.connectorStatus) && persisted.connectorStatus.length > 0, "connectorStatus persisted");
    assert((persisted.activityEvents || []).some((entry) => entry.eventType === "Product event received"), "activity trail persisted");
    // The scoped product-event write must NOT wipe the earlier audit entries (merge, not replace).
    const denials = (persisted.soc2AuditLogs || []).filter((entry) => entry.action === "access denied");
    assert.equal(denials.length, 2, "scoped product-event write left the audit log untouched");
    ok("live: signed product event persists via scoped write without touching other collections");
  }

  // 6c. Duplicate product event stays idempotent (same source event id → not re-imported).
  const dupResp = await fetch(`${base}/api/events/product`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-product-event-secret": PRODUCT_SECRET },
    body: eventPayload
  });
  assert.equal(dupResp.status, 200, "duplicate event returns 200 already-imported");
  ok("live: duplicate product event stays idempotent under the scoped write");

  // 6d. Autopilot toggle persists scoped, and everything written before it survives.
  const toggleResp = await fetch(`${base}/api/heartbeat/autopilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OWNER_TOKEN}` },
    body: JSON.stringify({ engineId: "reactivation-sequencer", enabled: true })
  });
  assert.equal(toggleResp.status, 200, `autopilot toggle accepted (got ${toggleResp.status})`);
  await wait(800);
  {
    const persisted = await readDataFile();
    assert.equal(persisted.autopilotSettings?.["reactivation-sequencer"]?.enabled, true, "autopilot toggle persisted");
    assert((persisted.automationEvents || []).length > 0, "product events survived the toggle write");
    assert((persisted.soc2AuditLogs || []).some((entry) => entry.action === "access denied"), "audit log survived the toggle write");
    ok("live: autopilot toggle persists via scoped write; earlier collections survive");
  }

  // 6e. Public one-click unsubscribe persists suppression via a scoped write, and everything
  // written before it survives (the pre-fix full-state write could have reverted all of it).
  const unsubToken = signUnsubscribeToken(
    { contact_id: "scoped-test-contact", email: "scoped-test@example.com", campaign_id: "scoped-test-campaign" },
    { OUTREACH_SIGNING_SECRET: "test-unsub-signing-secret-0123456789" }
  );
  const unsubResp = await fetch(`${base}/api/outreach/unsubscribe?token=${encodeURIComponent(unsubToken)}`);
  assert.equal(unsubResp.status, 200, `unsubscribe page renders (got ${unsubResp.status})`);
  assert((await unsubResp.text()).includes("unsubscribed"), "unsubscribe confirmation copy renders");
  await wait(800);
  {
    const persisted = await readDataFile();
    const supp = (persisted.outreachSuppressions || []).find((entry) => entry.email === "scoped-test@example.com");
    assert(supp, "suppression entry persisted");
    assert.equal(supp.reason, "unsubscribed", "suppression reason recorded");
    assert.equal(supp.source, "one_click", "suppression source recorded");
    assert((persisted.outreachUnsubscribes || []).some((entry) => entry.email === "scoped-test@example.com"), "unsubscribe ledger entry persisted");
    assert.equal(persisted.autopilotSettings?.["reactivation-sequencer"]?.enabled, true, "autopilot setting survived the unsubscribe write");
    assert((persisted.automationEvents || []).length > 0, "product events survived the unsubscribe write");
    assert((persisted.soc2AuditLogs || []).some((entry) => entry.action === "access denied"), "audit log survived the unsubscribe write");
    ok("live: public unsubscribe persists via scoped write; earlier collections survive");
  }
  {
    const badResp = await fetch(`${base}/api/outreach/unsubscribe?token=not-a-real-token`);
    assert.equal(badResp.status, 400, "malformed unsubscribe token is rejected");
    ok("live: malformed unsubscribe token stays rejected (fail closed)");
  }

  // 6f. Bot-style GET on the public Google callback: writes an error status via the scoped
  // store method and every earlier-written collection survives.
  const gcbResp = await fetch(`${base}/api/google/callback?error=access_denied`, { redirect: "manual" });
  assert.equal(gcbResp.status, 302, `google callback error path redirects (got ${gcbResp.status})`);
  await wait(800);
  {
    const persisted = await readDataFile();
    const google = (persisted.socialAccounts || []).find((account) => account.platform === "google_workspace");
    assert(google, "google_workspace account status persisted");
    assert.equal(google.status, "error", "error status recorded");
    assert((persisted.outreachSuppressions || []).some((entry) => entry.email === "scoped-test@example.com"), "unsubscribe suppression survived the callback write");
    assert.equal(persisted.autopilotSettings?.["reactivation-sequencer"]?.enabled, true, "autopilot setting survived the callback write");
    assert((persisted.soc2AuditLogs || []).some((entry) => entry.action === "access denied"), "audit log survived the callback write");
    ok("live: public google-callback error write is scoped; earlier collections survive");
  }
} finally {
  child.kill("SIGTERM");
  await wait(300);
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\nAll ${passed} scoped-write hardening checks passed.`);
