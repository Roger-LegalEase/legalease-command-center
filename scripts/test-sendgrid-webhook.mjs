// SendGrid webhook hardening tests (Phase 0 trust fix). Proves:
//  1. Signature verification: valid ECDSA P-256 signatures verify; tampered payloads are
//     REJECTED (fail closed) when a key is configured; missing headers reject; and with NO key
//     configured requests are rejected because verification is unavailable (fail closed).
//  2. reduceSendGridEvents mirrors the original handler semantics: bounces suppress + ledger,
//     unsubscribe/spamreport suppress, reactivation contacts get campaign events + pause — and
//     the reducer touches ONLY the scoped webhook collections (never unrelated state).
//  3. Health telemetry accumulates ok/rejected/error outcomes, and the plain-English summary
//     warns when sends exist but no webhook events were ever recorded (blind auto-pause).
//  4. The B1 trap: every webhook collection + the health singleton are members of
//     coreStateCollections (and the singleton set), or they'd silently fail to persist.
//  5. JsonStore.writeCollections merges into existing state — a scoped write can never wipe
//     unrelated collections from the local JSON file.
//  6. Store write-health: failures are counted + stamped and surfaced via writeHealth().

import assert from "node:assert";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";

// Isolate the local store BEFORE importing storage-backed modules.
const tempDir = await mkdtemp(path.join(os.tmpdir(), "legalease-sendgrid-webhook-"));
process.env.COMMAND_CENTER_DATA_PATH = path.join(tempDir, "state.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(tempDir, "no-seed.json");

const {
  SENDGRID_WEBHOOK_COLLECTIONS,
  SENDGRID_WEBHOOK_HEALTH_COLLECTION,
  verifySendGridSignature,
  reduceSendGridEvents,
  updateSendGridWebhookHealth,
  sendgridWebhookHealthSummary
} = await import("./sendgrid-webhook.mjs");
const { coreStateCollections, singletonCollections, JsonStore, SupabaseCoreStore } = await import("./storage.mjs");

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// ---- 1. Signature verification -------------------------------------------------------------
{
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const rawBody = JSON.stringify([{ event: "delivered", email: "a@example.com" }]);
  const now = Date.now();
  const timestamp = String(Math.floor(now / 1000));
  const signature = crypto.sign("sha256", Buffer.from(timestamp + rawBody, "utf8"), privateKey).toString("base64");
  const env = { SENDGRID_WEBHOOK_PUBLIC_KEY: publicKeyB64 };

  const good = verifySendGridSignature({ env, rawBody, signature, timestamp, now });
  assert.deepEqual({ checked: good.checked, verified: good.verified, rejected: good.rejected }, { checked: true, verified: true, rejected: false });
  ok("a correctly signed batch verifies");

  const tampered = verifySendGridSignature({ env, rawBody: rawBody + "x", signature, timestamp, now });
  assert.equal(tampered.rejected, true, "tampered payload must be rejected");
  ok("a tampered payload is REJECTED (fail closed) when a key is configured");

  const missing = verifySendGridSignature({ env, rawBody, signature: "", timestamp: "" });
  assert.equal(missing.rejected, true);
  assert.equal(missing.reason, "missing_signature_headers");
  ok("missing signature headers reject when a key is configured");

  const noKey = verifySendGridSignature({ env: {}, rawBody, signature: "", timestamp: "", now });
  assert.deepEqual({ checked: noKey.checked, rejected: noKey.rejected }, { checked: false, rejected: true });
  ok("with no key configured, requests are rejected because verification is unavailable");
}

// ---- 2. Event reduction (scoped) ------------------------------------------------------------
{
  const now = "2026-07-02T12:00:00.000Z";
  const scoped = {
    outreachSuppressions: [],
    outreachContacts: [{ contact_id: "biz-1", email: "org@example.com", sequence_status: "Enrolled" }],
    outreachBounces: [],
    reactivationContacts: [{ contact_id: "react-1", email: "user@example.com", wave: 1, enrolled_at: now, sequence_status: "Enrolled" }],
    reactivationEvents: []
  };
  const events = [
    { event: "delivered", email: "user@example.com" },                       // reactivation ledger only
    { event: "bounce", email: "org@example.com", reason: "550" },        // suppress + bounce ledger
    { event: "spamreport", email: "stranger@example.com" },                // suppression only
    { event: "click", email: "" }                                          // skipped: no email
  ];
  const { state, counters } = reduceSendGridEvents(scoped, events, { now });

  assert.deepEqual(
    { received: counters.received, recorded: counters.recorded, skippedNoEmail: counters.skippedNoEmail, reactivationMatched: counters.reactivationMatched },
    { received: 4, recorded: 3, skippedNoEmail: 1, reactivationMatched: 1 }
  );
  assert.deepEqual(counters.byType, { delivered: 1, bounce: 1, spamreport: 1 });
  ok("counters reflect received / recorded / skipped / reactivation-matched and by-type");

  assert.equal(state.reactivationEvents.length, 1);
  assert.equal(state.reactivationEvents[0].type, "delivered");
  assert.equal(state.reactivationEvents[0].contact_id, "react-1");
  ok("a delivered event for a reactivation contact lands in the campaign ledger");

  assert.equal(state.outreachBounces.length, 1);
  assert.ok(state.outreachSuppressions.some((s) => s.email === "org@example.com" && s.reason === "bounced"));
  const bouncedContact = state.outreachContacts.find((c) => c.contact_id === "biz-1");
  assert.equal(bouncedContact.bounced, true);
  assert.equal(bouncedContact.sequence_status, "Not Enrolled");
  ok("a bounce suppresses the contact, un-enrolls it, and appends to the bounce ledger");

  assert.ok(state.outreachSuppressions.some((s) => s.email === "stranger@example.com" && s.reason === "unsubscribed"));
  ok("a spamreport records an unsubscribed suppression even for unknown emails");

  const extraKeys = Object.keys(state).filter((k) => !SENDGRID_WEBHOOK_COLLECTIONS.includes(k));
  assert.deepEqual(extraKeys, [], "reducer must not touch collections outside the webhook scope");
  ok("the reducer touches ONLY the scoped webhook collections");
}

// ---- 3. Health telemetry + summary ----------------------------------------------------------
{
  const now = "2026-07-02T12:00:00.000Z";
  let health = updateSendGridWebhookHealth({}, { ok: true, counters: { received: 4, recorded: 3, byType: { delivered: 2, bounce: 2 } }, verified: true }, { now });
  health = updateSendGridWebhookHealth(health, { rejected: true, reason: "signature_mismatch" }, { now: "2026-07-02T13:00:00.000Z" });
  health = updateSendGridWebhookHealth(health, { ok: true, counters: { received: 1, recorded: 1, byType: { delivered: 1 } }, verified: false }, { now: "2026-07-02T14:00:00.000Z" });

  assert.deepEqual(
    { batches: health.total_batches, events: health.total_events, recorded: health.total_recorded, verified: health.verified_batches, unverified: health.unverified_batches, rejected: health.rejected_batches },
    { batches: 3, events: 5, recorded: 4, verified: 1, unverified: 1, rejected: 1 }
  );
  assert.equal(health.counts_by_type.delivered, 3);
  ok("health accumulates ok / rejected / verified / unverified outcomes and by-type counts");

  const healthy = sendgridWebhookHealthSummary(health, { env: {}, sent: 300 });
  assert.equal(healthy.warning, "", "recent ok batch => no warning");
  assert.equal(healthy.signatureVerification, "not_configured");
  ok("a healthy feed carries no warning; signature posture is reported honestly");

  const blind = sendgridWebhookHealthSummary({}, { env: {}, sent: 300 });
  assert.ok(/never been received/.test(blind.warning) && /300 sends/.test(blind.warning));
  ok("sends with NO webhook batches ever => explicit 'telemetry blind' warning");

  const failing = sendgridWebhookHealthSummary(
    updateSendGridWebhookHealth(health, { error: "Supabase DB 500: boom" }, { now: "2026-07-02T15:00:00.000Z" }),
    { env: {}, sent: 300 }
  );
  assert.ok(/most recent webhook batch failed/.test(failing.warning));
  ok("a failing feed surfaces the last error in plain English");
}

// ---- 4. The B1 trap: persistence membership -------------------------------------------------
{
  for (const collection of SENDGRID_WEBHOOK_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(collection), `${collection} must persist (coreStateCollections)`);
  }
  assert.ok(coreStateCollections.includes(SENDGRID_WEBHOOK_HEALTH_COLLECTION), "health collection must persist");
  assert.ok(singletonCollections.has(SENDGRID_WEBHOOK_HEALTH_COLLECTION), "health collection is a singleton");
  ok("all webhook collections + the health singleton are registered in coreStateCollections");
}

// ---- 5. JsonStore.writeCollections must merge, never wipe -----------------------------------
{
  const store = new JsonStore({});
  await store.writeState({ reactivationEvents: [{ id: "ev-1" }], outreachBounces: [{ id: "b-1" }], posts: [{ id: "post-1" }] });
  await store.writeCollections({ reactivationEvents: [{ id: "ev-1" }, { id: "ev-2" }] });
  const onDisk = JSON.parse(await readFile(process.env.COMMAND_CENTER_DATA_PATH, "utf8"));
  assert.equal(onDisk.reactivationEvents.length, 2, "patched collection updated");
  assert.equal(onDisk.outreachBounces.length, 1, "untouched collection survives a scoped write");
  assert.equal(onDisk.posts.length, 1, "unrelated collection survives a scoped write");
  ok("JsonStore.writeCollections merges the patch — unrelated local state is never wiped");
}

// ---- 6. Write-health telemetry on the store -------------------------------------------------
{
  process.env.SUPABASE_URL = "https://fake-supabase.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key-for-tests";
  const store = new SupabaseCoreStore({});
  store.writeStateToSupabase = async () => { throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time"); };
  await assert.rejects(() => store.writeStateNow({ reactivationEvents: [] }), /ON CONFLICT/);
  let health = store.writeHealth();
  assert.equal(health.failedWriteCount, 1);
  assert.ok(health.lastWriteErrorAt && /ON CONFLICT/.test(health.lastWriteError));
  ok("a failed Supabase write is counted and stamped in writeHealth()");

  store.writeStateToSupabase = async () => {};
  await store.writeStateNow({ reactivationEvents: [] });
  health = store.writeHealth();
  assert.ok(health.lastWriteOkAt, "success stamps lastWriteOkAt");
  assert.equal(health.lastWriteError, "", "success clears lastWriteError");
  assert.equal(health.failedWriteCount, 1, "failure count is cumulative, not reset");
  ok("a successful write stamps lastWriteOkAt and clears the error without erasing history");
}

console.log(`\nAll ${passed} sendgrid-webhook checks passed.`);
