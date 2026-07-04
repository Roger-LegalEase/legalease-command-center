// Autonomy levels — the declared ceiling for every helper, in plain English (Phase 18C).
//
// The ENFORCEMENT already lives elsewhere and is not changed here: heartbeat runs act() only
// behind per-engine autopilot toggles (default OFF), external actions require an approved
// Approval, and live sends/posts sit behind their own gates. This registry DECLARES each
// helper's ceiling so the UI can say it in one honest sentence and a test can catch any
// helper that quietly claims more than it was given.
//
//   0  Read-only summary        watches and reports; cannot prepare or change anything
//   1  Draft recommendation     writes internal drafts and suggestions only
//   2  Prepare for approval     lines work up and asks; nothing happens without a yes
//   3  Execute after approval   acts only on work you explicitly approved, gates re-checked
//   4  Safe housekeeping        may run on its own, internal bookkeeping only
//
// Default for anything not listed: level 2. External-facing helpers must never default higher.

export const AUTONOMY_LEVEL_MEANINGS = {
  0: "Watches and reports only. It cannot prepare or change anything.",
  1: "Prepares internal drafts and suggestions only. Nothing leaves the app.",
  2: "Lines work up and asks for your approval. Nothing happens without a yes.",
  3: "Acts only on work you explicitly approved, and re-checks every safety gate first.",
  4: "Runs on its own for safe internal bookkeeping only. It never contacts anyone."
};

export const AUTONOMY_LEVELS = {
  // Watch-only monitors (no act path at all)
  "codebase-health": { level: 0, plain: "Reads the code and reports health. It changes nothing." },
  "engagement-growth": { level: 0, plain: "Watches growth signals and reports. It never posts or follows anyone." },
  "email-telemetry": { level: 0, plain: "Watches email delivery reports and warns you. It sends nothing." },
  "storage-monitor": { level: 0, plain: "Watches data saving health and warns you. It changes nothing." },
  "calendar-reader": { level: 1, plain: "Reads calendar signals and prepares meeting notes for you. It never emails anyone." },
  "operating-pulse": { level: 0, plain: "Takes a read-only pulse of the business. It changes nothing." },

  // Draft and prepare-for-approval helpers
  "le-e": { level: 2, plain: "Suggests actions for your review. You decide; it never acts alone." },
  "review-desk": { level: 2, plain: "Prepares posts and reports for your review. Nothing publishes without you." },
  "support-inbox": { level: 1, plain: "Sorts incoming messages and prepares notes. It never replies to anyone." },
  "task-desk": { level: 1, plain: "Keeps your task list tidy and flags blockers. Internal only." },
  "rcap-revenue": { level: 2, plain: "Prepares revenue tasks for you to work. It never bills or emails anyone." },
  "operations-assistant": { level: 2, plain: "Suggests operational changes for your approval. Nothing applies without a yes." },

  // Approved-execution helpers (act only after your explicit approval, gates re-checked)
  "reactivation-sequencer": { level: 3, plain: "Sends reactivation email only inside waves you approved, and only while sending is turned on." },
  "outreach-sequencer": { level: 3, plain: "Sends partner outreach only from sequences you approved, and only while sending is turned on." },
  "prospect-scout": { level: 3, plain: "Finds possible partners for your review. It only moves ahead with ones you approved." },
  "campaign-command": { level: 3, plain: "Prepares campaign changes for approval and runs only the ones you approved." },
  "intake": { level: 3, plain: "Previews list imports and runs only the imports you confirmed. It never emails anyone." },

  // Safe internal housekeeping
  "heartbeat": { level: 4, plain: "Runs the scheduled check-ins that keep the monitors reporting. Internal bookkeeping only." }
};

const LOOP_MONITOR = { level: 0, plain: "A read-only operating loop. It watches one part of the business and reports." };

export function autonomyLevelFor(engineId = "") {
  const id = String(engineId || "").trim();
  if (AUTONOMY_LEVELS[id]) return { engineId: id, ...AUTONOMY_LEVELS[id] };
  if (/^loop-/.test(id)) return { engineId: id, ...LOOP_MONITOR };
  // Unknown helpers are treated as prepare-for-approval, never higher.
  return { engineId: id, level: 2, plain: AUTONOMY_LEVEL_MEANINGS[2] };
}
