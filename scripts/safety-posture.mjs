// Safety posture — the TRUE gate state behind every "Email sending: Off" label.
//
// Second trust PR (docs/command-center-ground-truth-audit.md §15 item 2). The dashboard's
// safety claims were hardcoded strings: the screen said "Email sending: Off" because someone
// typed that, not because anything checked the gates. This module derives the posture from the
// SAME functions the send paths actually consult — autopilotEnabled() and the live-send env
// flags — so the label on screen and the behavior of the machine cannot disagree.
//
// Honesty rules baked in:
//   - "off" is only claimed when every gate that could send is verified false.
//   - Any live-send flag true => the posture says LIVE, loudly, even if autopilot is off
//     (a flipped env flag is one autopilot toggle away from sending).
//   - If the caller cannot reach this data (client fetch fails), the UI must say
//     "Unverified" — the client never falls back to a comforting hardcoded "Off".
//
// This module never sends anything and never flips a gate. Read-only derivation.

import { autopilotEnabled } from "./heartbeat.mjs";
import { reactivationLiveSendEnabled, reactivationCampaignOf, REACTIVATION_ENGINE_ID } from "./reactivation-os.mjs";
import { outreachLiveSendEnabled, OUTREACH_ENGINE_ID } from "./outreach-os.mjs";

function engineEmailPosture({ autopilot, liveSendFlag }) {
  // Actual sending requires BOTH the env live-send flag and the engine autopilot toggle.
  if (liveSendFlag && autopilot) return "live";
  if (liveSendFlag) return "armed";        // env flag on; one autopilot toggle from live
  return "off";
}

const EMAIL_POSTURE_LABELS = {
  off: "Email sending: Off",
  armed: "Email sending: ARMED (live-send flag on, autopilot off)",
  live: "Email sending: LIVE"
};

const EMAIL_POSTURE_TONE = { off: "ok", armed: "warn", live: "alert" };

// Pure derivation over state + env. `socialLiveGates` is the already-computed per-channel
// live-posting gate summary (preview-server owns those env keys); pass [] if unavailable.
export function buildSafetyPosture({ state = {}, env = process.env, socialLiveGates = [] } = {}) {
  const reactivation = {
    engineId: REACTIVATION_ENGINE_ID,
    autopilotEnabled: autopilotEnabled(state, REACTIVATION_ENGINE_ID, env),
    liveSendFlag: reactivationLiveSendEnabled(env),
    campaignStatus: String(reactivationCampaignOf(state).status || "unknown")
  };
  reactivation.posture = engineEmailPosture({ autopilot: reactivation.autopilotEnabled, liveSendFlag: reactivation.liveSendFlag });

  const outreach = {
    engineId: OUTREACH_ENGINE_ID,
    autopilotEnabled: autopilotEnabled(state, OUTREACH_ENGINE_ID, env),
    liveSendFlag: outreachLiveSendEnabled(env),
  };
  outreach.posture = engineEmailPosture({ autopilot: outreach.autopilotEnabled, liveSendFlag: outreach.liveSendFlag });

  // Worst engine wins the headline: live > armed > off.
  const order = { live: 3, armed: 2, off: 1 };
  const emailPosture = order[reactivation.posture] >= order[outreach.posture] ? reactivation.posture : outreach.posture;
  const liveEngines = [reactivation, outreach].filter((e) => e.posture === "live").map((e) => e.engineId);
  const armedEngines = [reactivation, outreach].filter((e) => e.posture === "armed").map((e) => e.engineId);

  const enabledSocial = (Array.isArray(socialLiveGates) ? socialLiveGates : []).filter((g) => g && g.enabled);
  const socialLabel = enabledSocial.length === 0
    ? "Live social posting: Off"
    : `Live social posting: ON (${enabledSocial.map((g) => g.channel).join(", ")})`;

  return {
    verified: true,
    email: {
      posture: emailPosture,
      label: EMAIL_POSTURE_LABELS[emailPosture],
      tone: EMAIL_POSTURE_TONE[emailPosture],
      detail: `reactivation: ${reactivation.posture} (autopilot ${reactivation.autopilotEnabled ? "on" : "off"}, live-send ${reactivation.liveSendFlag ? "on" : "off"}) · outreach: ${outreach.posture} (autopilot ${outreach.autopilotEnabled ? "on" : "off"}, live-send ${outreach.liveSendFlag ? "on" : "off"})`,
      liveEngines,
      armedEngines,
      reactivation,
      outreach
    },
    social: {
      posture: enabledSocial.length ? "live" : "off",
      label: socialLabel,
      tone: enabledSocial.length ? "alert" : "ok",
      enabledChannels: enabledSocial.map((g) => g.channel),
      gates: Array.isArray(socialLiveGates) ? socialLiveGates : []
    }
  };
}
