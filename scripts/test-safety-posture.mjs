// Safety posture tests (second trust PR, audit §15 item 2). Proves the derived posture uses
// the SAME gate functions the send paths consult, and that the honesty rules hold:
//  1. All gates off -> "Email sending: Off" (the only path that may claim Off).
//  2. Live-send env flag on with autopilot off -> ARMED warning (never a comforting Off).
//  3. Flag + autopilot on -> LIVE alert; worst engine wins the headline.
//  4. Autopilot persisted in state (autopilotSettings) is respected, matching heartbeat.
//  5. Social gates summarize enabled channels; empty/absent gates read Off.

import assert from "node:assert";
import { buildSafetyPosture } from "./safety-posture.mjs";
import { REACTIVATION_ENGINE_ID } from "./reactivation-os.mjs";
import { OUTREACH_ENGINE_ID } from "./outreach-os.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const OFF_ENV = {};

// ---- 1. Everything off ----------------------------------------------------------------------
{
  const posture = buildSafetyPosture({ state: {}, env: OFF_ENV, socialLiveGates: [] });
  assert.equal(posture.email.posture, "off");
  assert.equal(posture.email.label, "Email sending: Off");
  assert.equal(posture.email.tone, "ok");
  assert.equal(posture.email.reactivation.liveSendFlag, false);
  assert.equal(posture.email.outreach.liveSendFlag, false);
  assert.equal(posture.social.label, "Live social posting: Off");
  assert.equal(posture.verified, true);
  ok("all gates verified off -> Email sending: Off");
}

// ---- 2. Live-send flag on, autopilot off -> ARMED -------------------------------------------
{
  const posture = buildSafetyPosture({ state: {}, env: { REACTIVATION_LIVE_SEND: "true" } });
  assert.equal(posture.email.posture, "armed");
  assert.ok(/ARMED/.test(posture.email.label));
  assert.equal(posture.email.tone, "warn");
  assert.deepEqual(posture.email.armedEngines, [REACTIVATION_ENGINE_ID]);
  assert.equal(posture.email.reactivation.posture, "armed");
  assert.equal(posture.email.outreach.posture, "off");
  ok("live-send flag without autopilot -> ARMED warning, not Off");
}

// ---- 3. Flag + autopilot -> LIVE; worst engine wins -----------------------------------------
{
  const state = { autopilotSettings: { [OUTREACH_ENGINE_ID]: { enabled: true } } };
  const posture = buildSafetyPosture({ state, env: { OUTREACH_LIVE_SEND: "true" } });
  assert.equal(posture.email.outreach.posture, "live");
  assert.equal(posture.email.posture, "live");
  assert.equal(posture.email.label, "Email sending: LIVE");
  assert.equal(posture.email.tone, "alert");
  assert.deepEqual(posture.email.liveEngines, [OUTREACH_ENGINE_ID]);
  ok("outreach flag + autopilot -> LIVE headline even though reactivation is off");
}

// ---- 4. Autopilot from persisted state matches heartbeat semantics --------------------------
{
  const state = { autopilotSettings: { [REACTIVATION_ENGINE_ID]: { enabled: true } } };
  const off = buildSafetyPosture({ state, env: OFF_ENV });
  assert.equal(off.email.reactivation.autopilotEnabled, true);
  assert.equal(off.email.reactivation.posture, "off", "autopilot alone (no live-send flag) cannot send");
  const live = buildSafetyPosture({ state, env: { REACTIVATION_LIVE_SEND: "true" } });
  assert.equal(live.email.reactivation.posture, "live");
  ok("persisted autopilotSettings respected; autopilot alone stays Off, with flag goes LIVE");
}

// ---- 5. Social gates ------------------------------------------------------------------------
{
  const gates = [
    { channel: "linkedin", enabled: false },
    { channel: "x", enabled: true },
    { channel: "facebook", enabled: true }
  ];
  const posture = buildSafetyPosture({ state: {}, env: OFF_ENV, socialLiveGates: gates });
  assert.equal(posture.social.posture, "live");
  assert.equal(posture.social.label, "Live social posting: ON (x, facebook)");
  assert.deepEqual(posture.social.enabledChannels, ["x", "facebook"]);
  const none = buildSafetyPosture({ state: {}, env: OFF_ENV, socialLiveGates: undefined });
  assert.equal(none.social.posture, "off");
  ok("social gate summary names enabled channels; absent gates read Off");
}

// ---- 6. Detail string is complete (both engines, both gates) --------------------------------
{
  const posture = buildSafetyPosture({ state: {}, env: { REACTIVATION_LIVE_SEND: "true" } });
  assert.ok(/reactivation: armed \(autopilot off, live-send on\)/.test(posture.email.detail), posture.email.detail);
  assert.ok(/outreach: off \(autopilot off, live-send off\)/.test(posture.email.detail), posture.email.detail);
  ok("detail string spells out every gate for both engines");
}

console.log(`\ntest-safety-posture: ${passed} checks passed`);
