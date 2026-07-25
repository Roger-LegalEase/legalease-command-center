// Every collection /api/boot-state's buildCompactBootState (preview-server.mjs) can read,
// including through its helpers: linkedin/x/metaSetupState (socialAccounts),
// liveGatesCountForState (runtime), buildFounderCapacityPulse (operator-pulse-feeders.mjs),
// and buildDailyRunSnapshot (daily-run-session.mjs). The boot endpoint fetches EXACTLY this
// set via store.readCollections — never the full state graph — so the first paint of the
// cockpit can never page the whole leos_core_records table (2026-07-25 saturation fix).
//
// Maintenance rule, enforced by test-hydration-bounds.mjs: any new `state.<collection>` /
// `source.<collection>` read in buildCompactBootState, operator-pulse-feeders.mjs, or
// daily-run-session.mjs must be added here.
export const BOOT_STATE_READ_COLLECTIONS = Object.freeze([
  "activityEvents",
  "campaigns",
  "captureInbox",
  "dailyCloseouts",
  "dailyRunSessions",
  "dataIntegritySnapshots",
  "dataRoomItems",
  "eveningReflections",
  "evidencePackNotes",
  "funnelSnapshots",
  "googleInsights",
  "growthInbox",
  "handoffContractPreviews",
  "handoffPackets",
  "metrics",
  "morningBriefs",
  "operatingMemory",
  "osHealthSnapshots",
  "partnerProgramArtifacts",
  "partnerPrograms",
  "partners",
  "pilots",
  "posts",
  "productionActivationRuns",
  "publishEvents",
  "rcapRevenueQueueTasks",
  "reports",
  "reviewStates",
  "roleAssignments",
  "runtime",
  "runwayInputs",
  "settings",
  "smokeTestRuns",
  "socialAccounts",
  "systemHealth",
  "tasks"
]);
