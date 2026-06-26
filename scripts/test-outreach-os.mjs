// B2 Phase 0 — Controlled Outreach OS tests. Proves the non-negotiables BEFORE any live
// SendGrid wiring exists:
//   1. All outreach collections persist (membership in coreStateCollections / singletons).
//   2. Suppression (all 8 reasons) blocks at BOTH queue-build and send-time.
//   3. assembleCompliantMessage THROWS with no postal address (no message => no send).
//   4. validateCompliance rejects non-compliant messages.
//   5. Autopilot OFF => nothing sends even when messages are APPROVED.
//      Autopilot ON  => still inert (dry_run) until a live send dep is injected.
//   6. Caps enforced (daily, per-domain, weekend/window).

import assert from "node:assert";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { runHeartbeat } from "./heartbeat.mjs";
import {
  OUTREACH_COLLECTIONS, OUTREACH_SINGLETON_COLLECTIONS, OUTREACH_ENGINE_ID,
  isSuppressed, assembleCompliantMessage, validateCompliance,
  planOutreach, actOutreach, buildOutreachEngine,
  withinSendingWindow, DEFAULT_OUTREACH_CAPS
} from "./outreach-os.mjs";
import { etParts } from "./heartbeat.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// 2026-07-01 is a Wednesday; 15:00Z = 11:00 ET (EDT) => weekday, inside 8–17 window.
const IN_WINDOW = new Date("2026-07-01T15:00:00Z");
// 2026-07-04 is a Saturday => window closed regardless of hour.
const WEEKEND = new Date("2026-07-04T15:00:00Z");
// 2026-07-01 11:00Z = 07:00 ET => before window start (8).
const TOO_EARLY = new Date("2026-07-01T11:00:00Z");

const CONFIG = {
  postalAddress: "907 W Peace Street, Canton, MS 39046",
  fromEmail: "roger@legalease.com",
  fromName: "LegalEase",
  publicBaseUrl: "https://legalease-command-center-prod.onrender.com"
};

function baseState(overrides = {}) {
  return {
    outreachConfig: { ...CONFIG },
    outreachOrganizations: [{ account_id: "org-1", organization_name: "Acme Nonprofit" }],
    outreachContacts: [
      { contact_id: "c-1", contact_name: "Jane Roe", email: "jane@acme.org", linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled", classification: "nonprofit" }
    ],
    outreachCampaigns: [{ campaign_id: "camp-1", status: "active", classification: "nonprofit" }],
    outreachSequenceSteps: [
      { campaign_id: "camp-1", step_number: 1, subject: "Question about Acme's record-clearing work", body: "Hi Jane, a quick note about expungement support." }
    ],
    outreachAttempts: [],
    approvalQueue: [],
    partners: [],
    pilots: [],
    ...overrides
  };
}

function makeStore(initial = {}) {
  let state = JSON.parse(JSON.stringify(initial));
  return {
    async readState() { return JSON.parse(JSON.stringify(state)); },
    async writeState(next) { state = JSON.parse(JSON.stringify(next)); return state; },
    snapshot() { return JSON.parse(JSON.stringify(state)); }
  };
}

function stepFor(state) {
  return { ...state.outreachSequenceSteps[0], campaign_id: "camp-1" };
}
function approvedItemFor(state) {
  const message = assembleCompliantMessage({
    contact: state.outreachContacts[0], org: state.outreachOrganizations[0],
    step: stepFor(state), config: state.outreachConfig, baseUrl: CONFIG.publicBaseUrl, env: {}
  });
  return {
    id: "outreach-q-seed", type: "outreach_message", status: "approved",
    contact_id: "c-1", campaign_id: "camp-1", step_number: 1, classification: "nonprofit",
    to: message.to, subject: message.subject, message, created_at: "2026-07-01T00:00:00Z"
  };
}

// ---- 1. collections persist (membership) ---------------------------------
function testCollectionsRegistered() {
  for (const c of OUTREACH_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(c), `${c} in coreStateCollections (persists to Supabase)`);
  }
  for (const c of OUTREACH_SINGLETON_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(c), `${c} in coreStateCollections`);
    assert.ok(singletonCollections.has(c), `${c} is a singleton collection`);
  }
  ok("all outreach collections persist (membership + singleton)");
}

// ---- 2a. suppression: all 8 reasons detected -----------------------------
function testSuppressionAllReasons() {
  const cases = [
    [{ email: "a@x.org", do_not_contact: true }, "do_not_contact"],
    [{ contact_id: "r1", email: "a@x.org", replied: true }, "replied"],
    [{ email: "a@x.org", unsubscribed: true }, "unsubscribed"],
    [{ email: "a@x.org", bounced: true }, "bounced"],
    [{ email: "a@x.org", is_customer: true }, "existing_customer"],
    [{ email: "a@x.org", manually_suppressed: true }, "manually_suppressed"],
    [{ email: "info@x.org" }, "bad_domain"],            // role account
    [{ email: "not-an-email" }, "bad_domain"],          // syntactic
    [{ email: "a@mailinator.com" }, "bad_domain"],      // disposable
    [{ email: "a@x.org", is_duplicate: true }, "duplicate"]
  ];
  for (const [contact, reason] of cases) {
    const r = isSuppressed(contact, { state: {} });
    assert.equal(r.suppressed, true, `suppressed: ${reason}`);
    assert.equal(r.reason, reason, `reason matches: ${reason}`);
  }
  // existing-relationship via partners domain match
  const rel = isSuppressed({ email: "new@acme.org" }, { state: { partners: [{ email: "ceo@acme.org" }] } });
  assert.equal(rel.reason, "existing_customer", "existing relationship via partner domain");
  // a clean contact is NOT suppressed
  assert.equal(isSuppressed({ email: "jane@acme.org" }, { state: {} }).suppressed, false, "clean contact passes");
  ok("suppression detects all 8 reasons (+ relationship, + clean pass)");
}

// ---- 2b. suppression blocks at QUEUE build -------------------------------
function testSuppressionBlocksAtQueue() {
  const state = baseState({
    outreachContacts: [
      { contact_id: "c-1", email: "jane@acme.org", linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled", classification: "nonprofit" },
      { contact_id: "c-2", email: "bob@beta.org", linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled", classification: "nonprofit", unsubscribed: true }
    ]
  });
  const { proposals } = planOutreach(state, { now: IN_WINDOW, env: {} });
  const ids = proposals.map((p) => p.contact_id);
  assert.ok(ids.includes("c-1"), "clean contact queued");
  assert.ok(!ids.includes("c-2"), "suppressed (unsubscribed) contact NOT queued");
  ok("suppression blocks at queue-build");
}

// ---- 2c. suppression blocks at SEND time ---------------------------------
async function testSuppressionBlocksAtSend() {
  // Contact becomes suppressed AFTER the message was approved & queued.
  const state = baseState();
  state.approvalQueue = [approvedItemFor(state)];
  state.outreachContacts[0].unsubscribed = true; // changed between queue and send
  let sendCalls = 0;
  const res = await actOutreach(state, { now: IN_WINDOW, env: {}, runOutreachSend: async () => { sendCalls += 1; return { status: "sent" }; } });
  assert.equal(sendCalls, 0, "live send NEVER called for a now-suppressed contact");
  const sent = (res.state.outreachAttempts || []).filter((a) => a.status === "sent");
  assert.equal(sent.length, 0, "no sent attempt recorded");
  const item = res.state.approvalQueue.find((q) => q.id === "outreach-q-seed");
  assert.equal(item.status, "rejected", "approved item rejected at send-time suppression re-check");
  ok("suppression blocks at send-time (re-checked after approval)");
}

// ---- 3. assembleCompliantMessage throws with no postal address -----------
function testAssembleThrowsNoAddress() {
  const state = baseState();
  assert.throws(
    () => assembleCompliantMessage({ contact: state.outreachContacts[0], org: {}, step: stepFor(state), config: { fromEmail: "roger@legalease.com" }, env: {} }),
    /postal address is required/i,
    "throws when postalAddress unset"
  );
  // and a fully-configured assembly succeeds + is compliant
  const msg = assembleCompliantMessage({ contact: state.outreachContacts[0], org: state.outreachOrganizations[0], step: stepFor(state), config: state.outreachConfig, env: {} });
  assert.ok(msg.text.includes(CONFIG.postalAddress), "postal address embedded in body");
  assert.ok(msg.headers["List-Unsubscribe"], "List-Unsubscribe header present");
  assert.match(msg.headers["List-Unsubscribe-Post"], /one-click/i, "one-click header present");
  ok("assembleCompliantMessage throws with no postal address (and builds compliant msg otherwise)");
}

// ---- 4. validateCompliance rejects non-compliant -------------------------
function testValidateCompliance() {
  const state = baseState();
  const good = assembleCompliantMessage({ contact: state.outreachContacts[0], org: state.outreachOrganizations[0], step: stepFor(state), config: state.outreachConfig, env: {} });
  assert.equal(validateCompliance(good).ok, true, "compliant message validates");

  assert.deepEqual(validateCompliance({ ...good, headers: {} }).ok, false, "missing unsubscribe headers rejected");
  assert.ok(validateCompliance({ ...good, headers: {} }).errors.includes("missing_list_unsubscribe"));
  assert.equal(validateCompliance({ ...good, subject: "" }).ok, false, "missing subject rejected");
  assert.equal(validateCompliance({ ...good, subject: "RE: your account" }).ok, false, "deceptive RE: subject rejected");
  assert.equal(validateCompliance({ ...good, postalAddress: "", text: "no address here" }).ok, false, "missing postal address rejected");
  assert.equal(validateCompliance({ ...good, to: "info@x.org" }).ok, false, "role-account recipient rejected");
  ok("validateCompliance rejects non-compliant messages");
}

// ---- 5. autopilot OFF => nothing sends even when approved ----------------
async function testAutopilotOffNothingSends() {
  const state = baseState();
  state.approvalQueue = [approvedItemFor(state)]; // an APPROVED, compliant, unsuppressed message
  let sendCalls = 0;
  const store = makeStore(state);
  const registry = [buildOutreachEngine({ runOutreachSend: async () => { sendCalls += 1; return { status: "sent" }; } })];
  const res = await runHeartbeat({ store, registry, env: {}, now: IN_WINDOW });

  assert.equal(res.ok, true, "heartbeat ran");
  const engineRun = res.engines.find((e) => e.engineId === OUTREACH_ENGINE_ID);
  assert.equal(engineRun.autopilot, false, "autopilot OFF by default");
  assert.equal(engineRun.acted, false, "act() did NOT run");
  assert.equal(sendCalls, 0, "live send NEVER called with autopilot OFF");

  const after = store.snapshot();
  assert.equal((after.outreachAttempts || []).length, 0, "no send attempts recorded");
  const item = (after.approvalQueue || []).find((q) => q.id === "outreach-q-seed");
  assert.equal(item.status, "approved", "approved item remains unsent");
  ok("autopilot OFF => nothing sends even when approved");
}

// ---- 5b. autopilot ON => still inert (dry_run) until a live dep is wired --
async function testAutopilotOnStillInertDryRun() {
  const state = baseState();
  state.approvalQueue = [approvedItemFor(state)];
  state.autopilotSettings = { [OUTREACH_ENGINE_ID]: { enabled: true } };
  const store = makeStore(state);
  // NO runOutreachSend dep injected => the live SendGrid call does not exist yet.
  const registry = [buildOutreachEngine({})];
  const res = await runHeartbeat({ store, registry, env: {}, now: IN_WINDOW });
  const engineRun = res.engines.find((e) => e.engineId === OUTREACH_ENGINE_ID);
  assert.equal(engineRun.autopilot, true, "autopilot ON");
  assert.equal(engineRun.acted, true, "act() ran");
  const after = store.snapshot();
  const attempts = after.outreachAttempts || [];
  assert.equal(attempts.length, 1, "one attempt recorded");
  assert.equal(attempts[0].status, "dry_run", "status is dry_run — NO real send happened");
  assert.notEqual(attempts[0].status, "sent", "never 'sent' without a live dep");
  ok("autopilot ON => still inert (dry_run) until live send dep injected");
}

// ---- 5c. live dep is the ONLY way a real send is recorded ----------------
async function testLiveDepSends() {
  const state = baseState();
  state.approvalQueue = [approvedItemFor(state)];
  let sendCalls = 0;
  const res = await actOutreach(state, { now: IN_WINDOW, env: {}, runOutreachSend: async () => { sendCalls += 1; return { status: "sent", provider: "sendgrid", provider_message_id: "mid-1" }; } });
  assert.equal(sendCalls, 1, "live dep called exactly once");
  const attempts = res.state.outreachAttempts.filter((a) => a.status === "sent");
  assert.equal(attempts.length, 1, "a sent attempt recorded only via the live dep");
  assert.equal(attempts[0].provider, "sendgrid", "provider recorded");
  ok("a real send is recorded ONLY when the live dep is injected (the last switch)");
}

// ---- 6. caps enforced ----------------------------------------------------
function testCapsEnforced() {
  // daily cap
  const dailyState = baseState({
    outreachConfig: { ...CONFIG, caps: { ...DEFAULT_OUTREACH_CAPS, dailyCap: 1 } },
    outreachContacts: [
      { contact_id: "c-1", email: "jane@acme.org", linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled" },
      { contact_id: "c-2", email: "bob@beta.org", linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled" }
    ]
  });
  assert.equal(planOutreach(dailyState, { now: IN_WINDOW, env: {} }).proposals.length, 1, "daily cap=1 queues only 1");

  // per-domain cap
  const domainState = baseState({
    outreachConfig: { ...CONFIG, caps: { ...DEFAULT_OUTREACH_CAPS, perDomainPerDay: 1 } },
    outreachContacts: [
      { contact_id: "c-1", email: "jane@acme.org", linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled" },
      { contact_id: "c-2", email: "bob@acme.org", linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled" }
    ]
  });
  assert.equal(planOutreach(domainState, { now: IN_WINDOW, env: {} }).proposals.length, 1, "per-domain cap=1 queues only 1 for same domain");

  // weekend / window
  assert.equal(planOutreach(baseState(), { now: WEEKEND, env: {} }).proposals.length, 0, "no sends queued on weekend");
  assert.equal(withinSendingWindow(DEFAULT_OUTREACH_CAPS, etParts(WEEKEND)), false, "weekend window closed");
  assert.equal(withinSendingWindow(DEFAULT_OUTREACH_CAPS, etParts(TOO_EARLY)), false, "before 8am ET window closed");
  assert.equal(withinSendingWindow(DEFAULT_OUTREACH_CAPS, etParts(IN_WINDOW)), true, "weekday 11am ET window open");
  ok("caps enforced (daily, per-domain, weekend, window hours)");
}

// ---- 6b. max touches + spacing -------------------------------------------
function testTouchCapAndSpacing() {
  // 5 touches already sent => sequence complete, nothing queued
  const maxed = baseState({
    outreachAttempts: Array.from({ length: 5 }, (_, i) => ({ contact_id: "c-1", campaign_id: "camp-1", step_number: i + 1, status: "sent", to: "jane@acme.org", sent_date: "2026-06-01", created_at: "2026-06-01T12:00:00Z" }))
  });
  assert.equal(planOutreach(maxed, { now: IN_WINDOW, env: {} }).proposals.length, 0, "max 5 touches => sequence complete");

  // a touch sent yesterday => spacing not elapsed (min 2 business days)
  const recent = baseState({
    outreachAttempts: [{ contact_id: "c-1", campaign_id: "camp-1", step_number: 1, status: "sent", to: "jane@acme.org", sent_date: "2026-06-30", created_at: "2026-06-30T12:00:00Z" }]
  });
  assert.equal(planOutreach(recent, { now: IN_WINDOW, env: {} }).proposals.length, 0, "spacing not elapsed => not queued");
  ok("max touches + min spacing enforced");
}

async function main() {
  console.log("\nB2 Phase 0 — Controlled Outreach OS tests\n");
  testCollectionsRegistered();
  testSuppressionAllReasons();
  testSuppressionBlocksAtQueue();
  await testSuppressionBlocksAtSend();
  testAssembleThrowsNoAddress();
  testValidateCompliance();
  await testAutopilotOffNothingSends();
  await testAutopilotOnStillInertDryRun();
  await testLiveDepSends();
  testCapsEnforced();
  testTouchCapAndSpacing();
  console.log(`\n${passed} checks passed.\n`);
}

main().catch((error) => { console.error("\nOUTREACH TEST FAILED:\n", error); process.exit(1); });
