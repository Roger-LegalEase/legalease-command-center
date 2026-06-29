// MVP Reactivation — RELEASE A WAVE. Enrolls a wave's (unsuppressed, not-already-enrolled) contacts
// so the cadence clock starts. This is the per-wave HUMAN gate; it does NOT itself send. After a
// wave is released, the heartbeat's reactivation engine sends Touch 1 on its next IN-WINDOW tick
// that is at least one cadence day (Day 1) past enrollment — throttled to perTickMax (150) so the
// wave spreads across the ET business-hours window, and provider-stratified so no tick is all-Gmail.
//
// Run in the prod Render Shell (where the live store + SENDGRID_API_KEY are configured):
//
//   node scripts/reactivation-release-wave.mjs 1            # DRY RUN: preview wave 1, write NOTHING
//   node scripts/reactivation-release-wave.mjs 1 --confirm  # release wave 1 (enroll its contacts)
//   node scripts/reactivation-release-wave.mjs 1 --confirm --start-today
//                                                           # release AND backdate enrollment by one
//                                                           # cadence day so Touch 1 is due in TODAY's
//                                                           # ET window (instead of next business day).
//                                                           # Throttle (perTickMax), provider
//                                                           # stratification, and the 8-5 ET weekday
//                                                           # send window ALL still apply.
//
// A live email goes out ONLY when ALL of these are also true (this script does none of them):
//   - REACTIVATION_LIVE_SEND=true   (else the engine records dry-run attempts, no network send)
//   - SENDGRID_API_KEY is set
//   - the reactivation engine autopilot (reactivation-sequencer) is ON (AUTOPILOT_REACTIVATION_
//     SEQUENCER=true, or the persisted autopilot toggle)
// This script prints those gate states so you can confirm before/after.

import { createStore } from "./storage.mjs";
import {
  releaseWave, reactivationCampaignOf, providerBucket, reactivationLiveSendEnabled,
  REACTIVATION_ENGINE_ID
} from "./reactivation-os.mjs";
import { isSuppressed } from "./outreach-os.mjs";
import { autopilotEnabled } from "./heartbeat.mjs";

const lower = (v = "") => String(v ?? "").trim().toLowerCase();

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const startToday = args.includes("--start-today");
  const waveArg = args.find((a) => /^\d+$/.test(a));
  if (!waveArg) { console.error("Usage: node scripts/reactivation-release-wave.mjs <waveNumber> [--confirm]"); process.exit(1); }
  const waveNumber = Number(waveArg);

  const store = await createStore();
  const full = await store.readState();
  console.log(`Store backend   : ${full.persistence || "json"}`);

  const config = reactivationCampaignOf(full);
  if (!config.waves.some((w) => Number(w.wave) === waveNumber)) {
    console.error(`Wave ${waveNumber} is not in the campaign plan (${config.waves.map((w) => w.wave).join(", ")}). Aborting.`);
    process.exit(1);
  }

  // --start-today backdates enrollment by one cadence day (the first cadence offset) so Touch 1's
  // due-day has already elapsed and it fires on the next IN-WINDOW tick today, rather than +1 day.
  // The throttle (perTickMax), provider stratification, and the ET weekday send window still gate it.
  const firstCadenceDay = Number((config.cadenceDays || [1])[0]) || 1;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const releaseNow = startToday
    ? new Date(Date.now() - firstCadenceDay * DAY_MS - 60_000).toISOString() // 1-min buffer past the due-day boundary
    : new Date().toISOString();

  // CRITICAL SAFETY: operate on ONLY the reactivation collections and write back ONLY those, so the
  // scoped reconcile can never touch any other prod collection (same pattern as reactivation-import).
  const scoped = {
    reactivationContacts: Array.isArray(full.reactivationContacts) ? full.reactivationContacts : [],
    reactivationAttempts: Array.isArray(full.reactivationAttempts) ? full.reactivationAttempts : [],
    reactivationEvents: Array.isArray(full.reactivationEvents) ? full.reactivationEvents : [],
    reactivationCampaign: full.reactivationCampaign || {}
  };

  // Preview the wave: who is in it, who will actually enroll, and the provider mix of new enrollees.
  const inWave = scoped.reactivationContacts.filter((c) => Number(c.wave) === waveNumber);
  const willEnroll = inWave.filter((c) => !c.enrolled_at && !c.suppressed_at_import && !isSuppressed(c, { state: scoped }).suppressed);
  const alreadyEnrolled = inWave.filter((c) => Boolean(c.enrolled_at));
  const suppressedSkip = inWave.filter((c) => c.suppressed_at_import || isSuppressed(c, { state: scoped }).suppressed);
  const by = (arr, pred) => arr.filter(pred).length;
  const mix = {};
  for (const c of willEnroll) { const b = providerBucket(c.email); mix[b] = (mix[b] || 0) + 1; }

  console.log(`\nWave ${waveNumber} preview`);
  console.log(`  Contacts in wave   : ${inWave.length}`);
  console.log(`  Will enroll now    : ${willEnroll.length}  (warm ${by(willEnroll, (c) => lower(c.priority).startsWith("warm"))} / cold ${by(willEnroll, (c) => lower(c.priority) === "cold")} / never_logged_in ${by(willEnroll, (c) => lower(c.priority) === "never_logged_in")})`);
  console.log(`  Already enrolled   : ${alreadyEnrolled.length}`);
  console.log(`  Suppressed (skip)  : ${suppressedSkip.length}`);
  console.log(`  New-enrollee mix   :`, mix);

  console.log(`\nGate states (this script never sends):`);
  console.log(`  REACTIVATION_LIVE_SEND        : ${reactivationLiveSendEnabled(process.env) ? "ON" : "OFF"}`);
  console.log(`  SENDGRID_API_KEY set          : ${Boolean(process.env.SENDGRID_API_KEY)}`);
  console.log(`  autopilot (${REACTIVATION_ENGINE_ID}) : ${autopilotEnabled(full, REACTIVATION_ENGINE_ID, process.env) ? "ON" : "OFF"}`);
  console.log(`  campaign status / released    : ${config.status} / [${config.releasedWaves.join(", ")}]`);
  console.log(`  enrollment timing             : ${startToday ? `start-today (enrolled_at backdated ${firstCadenceDay}d -> Touch 1 due in today's window)` : "standard (Touch 1 due next business-day window)"}`);

  if (!confirm) {
    console.log(`\nDRY RUN — nothing written. Re-run with --confirm to release Wave ${waveNumber}.`);
    return;
  }

  const rel = releaseWave(scoped, waveNumber, { now: releaseNow });
  const writeState = {
    reactivationContacts: rel.state.reactivationContacts,
    reactivationAttempts: scoped.reactivationAttempts,
    reactivationEvents: scoped.reactivationEvents,
    reactivationCampaign: rel.state.reactivationCampaign
  };
  await store.writeState(writeState);

  console.log(`\nRELEASED Wave ${waveNumber} (reactivation collections only — no other prod data touched).`);
  console.log(`  Enrolled now     : ${rel.enrolled}`);
  console.log(`  enrolled_at      : ${releaseNow}${startToday ? `  (backdated ${firstCadenceDay}d for --start-today)` : ""}`);
  console.log(`  Campaign status  : ${writeState.reactivationCampaign.status}`);
  console.log(`  Released waves   : [${(writeState.reactivationCampaign.releasedWaves || []).join(", ")}]`);
  console.log(`\nThe heartbeat will send Touch 1 to enrolled contacts on its next in-window tick`);
  console.log(`(${startToday ? "due in TODAY's ET window" : "Day-1 cadence: next business-day window"}), throttled + provider-stratified —`);
  console.log(`ONLY if the three gate states above are ON.`);
}

main().catch((e) => { console.error("Release failed:", e.message); process.exit(1); });
