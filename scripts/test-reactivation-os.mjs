// MVP Reactivation OS tests. Proves the consumer campaign's non-negotiables BEFORE any flag flip:
//   1. All reactivation collections persist (membership in coreStateCollections / singletons).
//   2. REACTIVATION_LIVE_SEND defaults OFF; act() is dry_run with no live dep / flag off.
//   3. Import: dedup, bad-domain drop, suppression honored, idempotent re-import.
//   4. Wave assignment: warm pinned to Wave 1, domain-stratified (no wave is single-provider),
//      sizes follow the plan, remainder absorbs the tail.
//   5. Wave release gating: contacts inert until their wave is released; cadence timing respected.
//   6. Per-contact pause signals (reply/click/convert/unsub/bounce/complaint) stop the cadence.
//   7. Stop-thresholds trip + auto-pause; below min-sample never trips.
//   8. applyReactivationEvent: hard signals suppress + pause; metrics roll up per wave.

import assert from "node:assert";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { etParts } from "./heartbeat.mjs";
import {
  REACTIVATION_COLLECTIONS, REACTIVATION_SINGLETON_COLLECTIONS, REACTIVATION_ENGINE_ID,
  reactivationLiveSendEnabled, contactIdForEmail, providerBucket,
  importReactivationContacts, assignWaves, applyWaveAssignment, releaseWave,
  planReactivation, actReactivation, buildReactivationEngine,
  evaluateThresholds, campaignRates, waveMetrics, applyReactivationEvent,
  reactivationCampaignOf, DEFAULT_REACTIVATION_CONFIG, resolveReactivationSendDecision,
  reactivationMessageConfig
} from "./reactivation-os.mjs";
import { assembleCompliantMessage } from "./outreach-os.mjs";
import { getReactivationTouch, REACTIVATION_CADENCE_DAYS } from "./reactivation-sequences.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const IN_WINDOW = new Date("2026-07-01T15:00:00Z"); // Wed 11:00 ET, inside 8–17 window
const DAY = 24 * 60 * 60 * 1000;

// ---- 1. Collection membership -------------------------------------------------
for (const c of REACTIVATION_COLLECTIONS) assert(coreStateCollections.includes(c), `${c} must be in coreStateCollections`);
for (const c of REACTIVATION_SINGLETON_COLLECTIONS) {
  assert(coreStateCollections.includes(c), `${c} must be in coreStateCollections`);
  assert(singletonCollections.has(c), `${c} must be a singleton`);
}
ok("all reactivation collections persist (coreStateCollections + singletons)");

// ---- 2. Live-send gate default OFF -------------------------------------------
assert.equal(reactivationLiveSendEnabled({}), false, "default OFF");
assert.equal(reactivationLiveSendEnabled({ REACTIVATION_LIVE_SEND: "true" }), true);
assert.equal(reactivationLiveSendEnabled({ REACTIVATION_LIVE_SEND: "false" }), false);
ok("REACTIVATION_LIVE_SEND defaults OFF; only a truthy flag enables");

{
  const contact = { email: "alice@example.com", first_name: "Alice", contact_id: contactIdForEmail("alice@example.com") };
  const touch = getReactivationTouch("logged_in", 1);
  const message = assembleCompliantMessage({
    contact,
    org: {},
    step: { ...touch, campaign_id: "mvp-reactivation", classification: "" },
    config: { ...reactivationMessageConfig({}, { sequenceId: "logged_in", touchNumber: 1 }), publicBaseUrl: "https://legalease-command-center-prod.onrender.com" },
    baseUrl: "https://legalease-command-center-prod.onrender.com",
    env: {}
  });
  assert.equal(resolveReactivationSendDecision(message, { env: { OUTREACH_LIVE_SEND: "true", SENDGRID_API_KEY: "SG.fake" } }).status, "dry_run", "OUTREACH_LIVE_SEND must not authorize reactivation");
  assert.equal(resolveReactivationSendDecision(message, { env: { REACTIVATION_LIVE_SEND: "true", SENDGRID_API_KEY: "SG.fake" } }).status, "live", "REACTIVATION_LIVE_SEND authorizes compliant reactivation");
  assert.equal(resolveReactivationSendDecision({ ...message, classification: "" }, { env: { REACTIVATION_LIVE_SEND: "true", SENDGRID_API_KEY: "SG.fake" } }).status, "live", "reactivation does not require B2 classification");
  ok("reactivation send decision uses REACTIVATION_LIVE_SEND and bypasses B2 classification routing");
}

// ---- 3. Import: dedup, bad-domain drop, suppression honored, idempotent -------
const rawRows = [
  { email: "Alice@example.com", full_name: "Alice Adams", priority: "warm" },
  { email: "alice@example.com", full_name: "Alice Dup", priority: "cold" },     // dup (normalized)
  { email: "bob@example.com", full_name: "Bob Brown", priority: "cold" },
  { email: "info@example.com", full_name: "Role Acct", priority: "cold" },       // bad (role account)
  { email: "carol@example.com", full_name: "Carol", priority: "never_logged_in" },
  { email: "notanemail", full_name: "Bad", priority: "cold" }                  // bad syntax
];
const supState = { outreachSuppressions: [{ email: "carol@example.com", reason: "unsubscribed" }] };
const imp = importReactivationContacts(supState, rawRows);
assert.equal(imp.summary.added, 3, "3 unique valid contacts (alice, bob, carol)");
assert.equal(imp.summary.skippedDup, 1, "1 normalized duplicate dropped");
assert.equal(imp.summary.skippedBad, 2, "role account + bad syntax dropped");
const carol = imp.state.reactivationContacts.find((c) => c.email === "carol@example.com");
assert(carol.suppressed_at_import, "pre-suppressed contact flagged at import (ledger => manually_suppressed)");
assert.equal(contactIdForEmail("ALICE@example.com"), contactIdForEmail("alice@example.com"), "id is normalized");
const reimp = importReactivationContacts(imp.state, rawRows);
assert.equal(reimp.state.reactivationContacts.length, 3, "idempotent re-import — no growth");
ok("import dedups, drops bad domains, honors suppression, is idempotent");

// ---- 4. Wave assignment: warm→Wave 1, stratified, sizes follow plan ----------
function bigList(n) {
  // 70% gmail, 17% yahoo, 8% icloud, 5% outlook — like the real MVP mix; plus a warm cohort.
  const rows = [];
  for (let i = 0; i < n; i++) {
    let dom = "gmail.com";
    const r = i % 100;
    if (r < 70) dom = "gmail.com"; else if (r < 87) dom = "yahoo.com"; else if (r < 95) dom = "icloud.com"; else dom = "outlook.com";
    rows.push({ email: `user${i}@${dom}`, full_name: `User ${i}`, priority: "cold" });
  }
  for (let w = 0; w < 48; w++) rows.push({ email: `warm${w}@gmail.com`, full_name: `Warm ${w}`, priority: "warm" });
  return rows;
}
const big = importReactivationContacts({}, bigList(3000));
const cfg = reactivationCampaignOf(big.state);
const assignment = assignWaves(big.state.reactivationContacts, cfg);
// All 48 warm are in Wave 1.
const warmContacts = big.state.reactivationContacts.filter((c) => c.priority === "warm");
assert.equal(warmContacts.length, 48, "48 warm imported");
for (const w of warmContacts) assert.equal(assignment.get(w.contact_id), 1, "warm pinned to Wave 1");
// Wave 1 size == plan (300).
const waveCounts = {};
for (const v of assignment.values()) waveCounts[v] = (waveCounts[v] || 0) + 1;
assert.equal(waveCounts[1], 300, "Wave 1 == planned 300");
assert.equal(waveCounts[2], 700, "Wave 2 == planned 700");
assert.equal(waveCounts[3], 1200, "Wave 3 == planned 1200");
assert.equal(waveCounts[4], 3048 - 2200, "Wave 4 absorbs remainder");
// Stratification: Wave 2 (cold only) is NOT single-provider — gmail share < 100%.
const applied = applyWaveAssignment(big.state, cfg);
const w2 = applied.state.reactivationContacts.filter((c) => c.wave === 2);
const w2gmail = w2.filter((c) => providerBucket(c.email) === "gmail").length;
assert(w2gmail > 0 && w2gmail < w2.length, "Wave 2 is mixed-provider (not all Gmail)");
assert(w2.some((c) => providerBucket(c.email) === "yahoo"), "Wave 2 has Yahoo too");
ok("wave assignment: warm→Wave 1, plan sizes honored, domain-stratified (not all Gmail)");

// ---- 5. Release gating + cadence timing --------------------------------------
const staged = applied.state;
// Before release: nothing enrolled, plan proposes nothing even with a wave "released" set empty.
const planBefore = planReactivation(staged, { now: IN_WINDOW });
assert.equal(planBefore.proposals.length, 0, "no proposals before any wave release");
// Release Wave 1 → its contacts enroll.
const rel = releaseWave(staged, 1, { now: new Date(IN_WINDOW.getTime() - 2 * DAY) });
const enrolledW1 = rel.state.reactivationContacts.filter((c) => c.wave === 1 && c.enrolled_at).length;
assert.equal(enrolledW1, 300, "releasing Wave 1 enrolls its 300 contacts");
assert(rel.state.reactivationContacts.filter((c) => c.wave === 2 && c.enrolled_at).length === 0, "Wave 2 stays inert");
// Touch 1 (day 1) is due 2 days after enrollment; window open.
const planAfter = planReactivation(rel.state, { now: IN_WINDOW });
assert(planAfter.proposals.length > 0, "due touches appear after release once cadence day reached");
assert(planAfter.proposals.length <= cfg.caps.perTickMax, "intraday throttle caps proposals per tick");
assert(planAfter.proposals.every((p) => p.step === 1), "first due touch is step 1");
ok("contacts inert until wave release; cadence timing + per-tick throttle respected");

// ---- 5a. Campaign hold: held contacts are never bucketed, enrolled, or sent ----
{
  // Two contacts in Wave 1: one normal, one explicitly held. Both look due once enrolled.
  const held = {
    reactivationContacts: [
      { contact_id: "react-norm", email: "norm@example.com", wave: 1, priority: "warm" },
      { contact_id: "react-held", email: "held@example.com", wave: 1, priority: "warm", campaign_hold: true, campaign_hold_reason: "consumer_upload_review", import_status: "staged" }
    ]
  };
  // assignWaves does not bucket a held contact.
  const assignment = assignWaves(held.reactivationContacts, cfg);
  assert.equal(assignment.get("react-held"), undefined, "held contact gets no wave from assignWaves");
  assert.equal(assignment.get("react-norm"), 1, "normal contact still bucketed");
  // releaseWave enrolls the normal contact but NOT the held one.
  const r = releaseWave(held, 1, { now: new Date(IN_WINDOW.getTime() - 2 * DAY) });
  assert.equal(r.enrolled, 1, "releaseWave enrolls only the non-held contact");
  assert.ok(r.state.reactivationContacts.find((c) => c.contact_id === "react-held").enrolled_at === undefined || !r.state.reactivationContacts.find((c) => c.contact_id === "react-held").enrolled_at, "held contact never enrolled");
  // Even force-enrolled, planReactivation skips a held contact; the control (hold off) is due.
  const forced = { reactivationContacts: held.reactivationContacts.map((c) => ({ ...c, enrolled_at: new Date(IN_WINDOW.getTime() - 2 * DAY).toISOString() })), reactivationCampaign: { releasedWaves: [1], status: "active" } };
  const plan = planReactivation(forced, { now: IN_WINDOW });
  assert.ok(plan.proposals.every((p) => p.contact.contact_id !== "react-held"), "planReactivation never proposes a held contact");
  assert.ok(plan.proposals.some((p) => p.contact.contact_id === "react-norm"), "non-held contact is due (control)");
  ok("campaign hold: held contacts are unbucketed, never enrolled, never proposed");
}

// ---- 5b. Per-tick provider stratification (no all-Gmail burst) ----------------
// Stored order is provider-CLUSTERED (all Gmail, then all Yahoo). Without stratifying the due list,
// the first 150-send tick would be 100% Gmail; planReactivation must interleave so it is mixed.
{
  const clustered = [];
  for (let i = 0; i < 200; i++) clustered.push({ email: `g${i}@gmail.com`, full_name: `G ${i}`, priority: "cold" });
  for (let i = 0; i < 200; i++) clustered.push({ email: `y${i}@yahoo.com`, full_name: `Y ${i}`, priority: "cold" });
  const impC = importReactivationContacts({}, clustered);
  const appliedC = applyWaveAssignment(impC.state, reactivationCampaignOf(impC.state));
  const relC = releaseWave(appliedC.state, 1, { now: new Date(IN_WINDOW.getTime() - 2 * DAY) });
  const tick = planReactivation(relC.state, { now: IN_WINDOW }).proposals;
  const gmailInTick = tick.filter((p) => providerBucket(p.contact.email) === "gmail").length;
  assert(gmailInTick > 0 && gmailInTick < tick.length, "first tick is provider-mixed, not all Gmail");
  assert(tick.some((p) => providerBucket(p.contact.email) === "yahoo"), "Yahoo present in first tick despite clustered import order");
  ok("per-tick sends are provider-stratified (no all-Gmail burst)");
}

// ---- 6. Pause signals stop the cadence ---------------------------------------
const relPaused = {
  ...rel.state,
  reactivationContacts: rel.state.reactivationContacts.map((c, i) =>
    c.wave === 1 ? { ...c, replied: i % 2 === 0 } : c) // half replied
};
const planPaused = planReactivation(relPaused, { now: IN_WINDOW });
assert(planPaused.proposals.every((p) => !p.contact.replied), "replied contacts are never proposed");
ok("per-contact pause signals (replied/...) stop the cadence");

// ---- 7. act() posture: dry_run without dep / flag; sent with a live dep ------
(async () => {
  const dry = await actReactivation(rel.state, { now: IN_WINDOW }); // no runReactivationSend dep
  assert(dry.state.reactivationAttempts.every((a) => a.status === "dry_run"), "no dep => dry_run attempts only");
  assert(dry.state.reactivationAttempts.length > 0, "dry_run attempts recorded");

  let sentCount = 0;
  const live = await actReactivation(rel.state, {
    now: IN_WINDOW,
    runReactivationSend: async () => { sentCount++; return { status: "sent", provider: "sendgrid", provider_message_id: "x" }; }
  });
  assert(sentCount > 0, "live dep invoked");
  assert(live.state.reactivationAttempts.some((a) => a.status === "sent"), "live dep => sent attempts");
  // Engine wrapper passes the dep through.
  const engine = buildReactivationEngine({ runReactivationSend: async () => ({ status: "sent", provider: "sendgrid" }) });
  assert.equal(engine.id, REACTIVATION_ENGINE_ID);
  const er = await engine.act(rel.state, { now: IN_WINDOW });
  assert(er.state.reactivationAttempts.some((a) => a.status === "sent"), "engine.act sends via dep");
  ok("act() is dry_run without a live dep; sends only when a live dep is injected");

  // ---- 8. Thresholds trip + auto-pause; below-sample never trips -------------
  function stateWithEvents(sent, bounces) {
    const attempts = Array.from({ length: sent }, (_, i) => ({ status: "sent", contact_id: `c${i}`, to: `c${i}@gmail.com`, wave: 1 }));
    const events = Array.from({ length: bounces }, (_, i) => ({ type: "bounce", email: `c${i}@gmail.com`, contact_id: `c${i}` }));
    return { reactivationAttempts: attempts, reactivationEvents: events };
  }
  const below = evaluateThresholds(stateWithEvents(50, 50), reactivationCampaignOf({}));
  assert.equal(below.tripped, false, "below min sample => never tripped");
  assert.equal(below.belowSample, true);
  const tripped = evaluateThresholds(stateWithEvents(1000, 30), reactivationCampaignOf({})); // 3% bounce >= 2%
  assert.equal(tripped.tripped, true, "3% bounce trips the 2% threshold");
  assert(tripped.reasons.join(" ").includes("hard_bounce"));
  // act() auto-pauses when tripped.
  const trippedState = { ...rel.state, ...stateWithEvents(1000, 30) };
  const pausedAct = await actReactivation(trippedState, { now: IN_WINDOW, runReactivationSend: async () => ({ status: "sent" }) });
  assert.equal(pausedAct.state.reactivationCampaign.status, "paused", "act auto-pauses on threshold trip");
  assert(pausedAct.results.some((r) => r.status === "paused"), "act reports the pause");
  ok("stop-thresholds trip + auto-pause; below min-sample never trips");

  // ---- 7b. Rolling threshold basis: distinct identities, aging, self-heal, bounded override ----
  {
    const NOW = new Date("2026-07-13T14:00:00Z");
    const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
    const sends = (n, agedDays) => Array.from({ length: n }, (_, i) => ({
      status: "sent", contact_id: `s${agedDays}-${i}`, created_at: daysAgo(agedDays)
    }));
    const spamFrom = (email, n, agedDays) => Array.from({ length: n }, (_, i) => ({
      id: `sp-${email}-${i}`, type: "spamreport", email, created_at: daysAgo(agedDays)
    }));
    const cfg = reactivationCampaignOf({});

    // Duplicate webhook rows from ONE complainant count once: 3 events, 1 person, 2000 recent
    // sends => 0.05% < 0.100%, NOT tripped — under event-counting this was 0.15% and tripped.
    const dup = evaluateThresholds({
      reactivationAttempts: sends(2000, 2),
      reactivationEvents: spamFrom("dup@example.com", 3, 2)
    }, cfg, { now: NOW });
    assert.equal(dup.rates.complaints, 1, "3 spamreport events from one email count as 1 complainant");
    assert.equal(dup.tripped, false, "1 distinct complainant / 2000 sends = 0.05% does not trip 0.100%");

    // Same person twice at exactly the limit still trips: 1/1000 = 0.100% >= 0.100%.
    const edge = evaluateThresholds({
      reactivationAttempts: sends(1000, 2),
      reactivationEvents: spamFrom("edge@example.com", 2, 2)
    }, cfg, { now: NOW });
    assert.equal(edge.tripped, true, "exactly 0.100% still trips (>= comparison unchanged)");

    // Aging: the SAME complaint outside the 14-day window no longer gates the campaign.
    const aged = evaluateThresholds({
      reactivationAttempts: sends(557, 2),
      reactivationEvents: spamFrom("old@example.com", 2, 20)
    }, cfg, { now: NOW });
    assert.equal(aged.rates.complaints, 0, "a 20-day-old complaint is outside the 14-day window");
    assert.equal(aged.tripped, false, "aged-out complaint no longer trips");
    const recent = evaluateThresholds({
      reactivationAttempts: sends(557, 2),
      reactivationEvents: spamFrom("new@example.com", 2, 2)
    }, cfg, { now: NOW });
    assert.equal(recent.tripped, true, "a recent complaint still trips at 1/557 = 0.18% (prod shape)");

    // Self-heal: when the sends age out too, the window is below sample => no trip, no deadlock.
    const healed = evaluateThresholds({
      reactivationAttempts: sends(557, 20),
      reactivationEvents: spamFrom("old@example.com", 2, 20)
    }, cfg, { now: NOW });
    assert.equal(healed.belowSample, true, "aged-out sends drop the window below min sample");
    assert.equal(healed.tripped, false, "below-sample window never trips — the deadlock is gone");

    // hard_bounce and unsubscribe share the identical rolling+distinct basis.
    const bounceEvents = (email, n, aged) => Array.from({ length: n }, (_, i) => ({ id: `b-${email}-${i}`, type: "bounce", email, created_at: daysAgo(aged) }));
    const bAged = evaluateThresholds({ reactivationAttempts: sends(500, 2), reactivationEvents: bounceEvents("b@example.com", 30, 20) }, cfg, { now: NOW });
    assert.equal(bAged.rates.hardBounces, 0, "aged bounces leave the window");
    const bDup = evaluateThresholds({ reactivationAttempts: sends(500, 2), reactivationEvents: bounceEvents("b@example.com", 30, 2) }, cfg, { now: NOW });
    assert.equal(bDup.rates.hardBounces, 1, "30 bounce events from one email = 1 distinct bouncer");
    const uDup = evaluateThresholds({ reactivationAttempts: sends(500, 2), reactivationEvents: Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, type: "unsubscribe", email: "u@example.com", created_at: daysAgo(2) })) }, cfg, { now: NOW });
    assert.equal(uDup.rates.unsubs, 1, "unsubscribe events dedupe by identity too");

    // Undated rows count as IN window: a data gap widens the gate, never hides a complaint.
    const undated = evaluateThresholds({
      reactivationAttempts: sends(557, 2),
      reactivationEvents: [{ id: "nd", type: "spamreport", email: "nodate@example.com" }]
    }, cfg, { now: NOW });
    assert.equal(undated.rates.complaints, 1, "an undated complaint still counts");
    assert.equal(undated.tripped, true, "an undated complaint still gates");

    // Bounded override: honored only until expiresAt, then base thresholds re-apply on their own.
    const trippedShape = { reactivationAttempts: sends(557, 2), reactivationEvents: spamFrom("x@example.com", 1, 2) };
    const withOverride = (expiresAt) => reactivationCampaignOf({ reactivationCampaign: { thresholdOverride: { spam_complaint: 0.0025, expiresAt } } });
    assert.equal(evaluateThresholds(trippedShape, withOverride(daysAgo(-5)), { now: NOW }).tripped, false, "active override (0.25%) clears 0.18%");
    assert.equal(evaluateThresholds(trippedShape, withOverride(daysAgo(-5)), { now: NOW }).overrideActive, true, "override reported while active");
    assert.equal(evaluateThresholds(trippedShape, withOverride(daysAgo(1)), { now: NOW }).tripped, true, "expired override auto-reverts to 0.100%");
    // An override with NO expiry is ignored outright — open-ended bumps are not a thing.
    const openEnded = reactivationCampaignOf({ reactivationCampaign: { thresholdOverride: { spam_complaint: 0.5 } } });
    assert.equal(evaluateThresholds(trippedShape, openEnded, { now: NOW }).tripped, true, "override without expiresAt is ignored");

    ok("rolling threshold basis: distinct people, aging, below-sample self-heal, bounded override only");
  }

  // ---- 9. applyReactivationEvent: hard signals suppress + pause; metrics -----
  const evState = rel.state;
  const target = evState.reactivationContacts.find((c) => c.wave === 1);
  const afterBounce = applyReactivationEvent(evState, { event: "bounce", email: target.email });
  const tc = afterBounce.reactivationContacts.find((c) => c.email === target.email);
  assert.equal(tc.bounced, true, "bounce flags the contact");
  assert(afterBounce.outreachSuppressions.some((s) => s.email === target.email), "bounce writes suppression");
  const afterClick = applyReactivationEvent(evState, { event: "click", email: target.email });
  assert.equal(afterClick.reactivationContacts.find((c) => c.email === target.email).clicked, true, "click flags engaged + pauses");
  const foreign = applyReactivationEvent(evState, { event: "bounce", email: "stranger@example.com" });
  assert.equal(foreign.reactivationContacts.length, evState.reactivationContacts.length, "foreign email is a no-op");
  // Metrics roll up.
  const metricState = {
    reactivationContacts: [{ contact_id: "c1", email: "c1@example.com", wave: 1 }],
    reactivationAttempts: [{ status: "sent", contact_id: "c1", to: "c1@example.com", wave: 1 }],
    reactivationEvents: [{ type: "delivered", email: "c1@example.com", contact_id: "c1" }, { type: "click", email: "c1@example.com", contact_id: "c1" }]
  };
  const m = waveMetrics(metricState);
  assert.equal(m[1].sent, 1); assert.equal(m[1].delivered, 1); assert.equal(m[1].clicks, 1);
  assert.equal(m[1].byProvider.gmail, 1, "per-wave provider breakdown");
  ok("applyReactivationEvent suppresses+pauses on hard signals; metrics roll up per wave");

  // ---- cadence sanity --------------------------------------------------------
  assert.deepEqual(REACTIVATION_CADENCE_DAYS, [1, 4, 9, 16, 30], "cadence is Day 1/4/9/16/30");
  assert.equal(getReactivationTouch(0).step_number, 0, "seed touch is Touch 0");
  assert.equal(getReactivationTouch(5).step_number, 5, "5 cadence touches");
  ok("cadence is Day 1/4/9/16/30 with a Touch-0 seed");

  console.log(`\nAll ${passed} reactivation-os checks passed.`);
})();
