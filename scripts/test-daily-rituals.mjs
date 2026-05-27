import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEveningReflectionRecord, saveEveningReflection } from "./evening-reflection.mjs";
import { createCaptureInboxItem, routeCaptureInboxItem } from "./lee-quick-capture.mjs";
import { buildMorningBriefRecord, saveMorningBrief } from "./morning-brief.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const baseState = {
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  captureInbox: [],
  conversationNotes: [],
  morningBriefs: [],
  eveningReflections: [],
  operatingMemory: [],
  tasks: [
    { id: "task-rcap-review", title: "Review RCAP proposal draft", status: "open", priority: "high", nextAction: "Confirm missing details before handoff.", createdAt: "2026-05-27T09:00:00.000Z" }
  ],
  partnerProgramArtifacts: [
    { key: "rcap-proposal-draft-v1", title: "RCAP Proposal Draft", review_state: "review_required", review_updated_at: "2026-05-27T09:00:00.000Z" },
    { key: "rcap-partner-page-draft-v1", title: "RCAP Partner Page Draft", review_state: "approved", review_updated_at: "2026-05-27T09:30:00.000Z" },
    { key: "rcap-dashboard-readiness-v1", title: "RCAP Dashboard Readiness", review_state: "blocked", blocker_reason: "Dashboard requirements are not confirmed.", review_updated_at: "2026-05-27T10:00:00.000Z" },
    { key: "rcap-manual-review-checklist-v1", title: "RCAP Manual Review Checklist", review_state: "review_required", review_updated_at: "2026-05-27T10:10:00.000Z" }
  ],
  reports: [
    { key: "rcap-weekly-report-draft-v1", title: "RCAP Weekly Report Draft", review_state: "approved", review_updated_at: "2026-05-27T10:30:00.000Z" }
  ],
  evidencePackNotes: [
    { key: "rcap-production-activation-evidence-v1", title: "RCAP Evidence Note", review_state: "approved", review_updated_at: "2026-05-27T10:45:00.000Z" }
  ],
  partners: [
    { id: "partner-rcap", slug: "rcap", name: "RCAP", missing_external_details: true, missingExternalDetailsList: ["primary contact", "approval authority"] }
  ],
  partnerPrograms: [
    { id: "partner-program-rcap", slug: "rcap", name: "RCAP", jurisdiction: "TBD", targetAudience: "TBD", packageTier: "TBD" }
  ],
  activityEvents: [
    { id: "activity-dashboard-blocked", eventType: "RCAP review state changed", title: "Dashboard Readiness blocked", summary: "Dashboard requirements are not confirmed.", createdAt: "2026-05-27T11:00:00.000Z" }
  ],
  auditHistory: [
    { id: "audit-dashboard-blocked", action: "rcap artifact review state changed", title: "Dashboard Readiness blocked", timestamp: "2026-05-27T11:05:00.000Z" }
  ]
};

const captured = createCaptureInboxItem(baseState, {
  raw_input: "Decision: tomorrow focus on RCAP dashboard readiness blocker. Carry forward proposal edits. Do not touch live publishing.",
  source_label: "Le-E Quick Capture",
  linked_partner: "RCAP",
  linked_workflow: "RCAP",
  priority: "high"
}, { now: "2026-05-27T12:00:00.000Z", actor: "owner_token" });
const morningRouted = routeCaptureInboxItem(captured.state, captured.item.id, "route_morning_brief", { now: "2026-05-27T12:05:00.000Z", actor: "owner_token" });
const eveningRouted = routeCaptureInboxItem(morningRouted.state, captured.item.id, "route_evening_reflection", { now: "2026-05-27T12:10:00.000Z", actor: "owner_token" });
const memoryRouted = routeCaptureInboxItem(eveningRouted.state, captured.item.id, "route_operating_memory", { now: "2026-05-27T12:15:00.000Z", actor: "owner_token" });

const ignoredCaptured = createCaptureInboxItem(memoryRouted.state, {
  raw_input: "Decision: ignore the fake noisy distraction tomorrow.",
  source_label: "Noise",
  priority: "low"
}, { now: "2026-05-27T12:20:00.000Z", actor: "owner_token" });
const ignored = routeCaptureInboxItem(ignoredCaptured.state, ignoredCaptured.item.id, "ignore", { now: "2026-05-27T12:25:00.000Z", actor: "owner_token" });

const morning = buildMorningBriefRecord(ignored.state, { now: "2026-05-27T13:00:00.000Z", date: "2026-05-27" });
assert.equal(morning.key, "morning-brief-2026-05-27", "Morning Brief should use stable daily key.");
assert.equal(morning.top_3_actions.length, 3, "Morning Brief should render exactly three Top 3 actions.");
assert(morning.top_3_actions.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Routed Quick Capture items should influence Morning Brief.");
assert(!morning.top_3_actions.some(item => /fake noisy distraction/i.test(item.title + " " + item.detail)), "Ignored captures should not appear in Morning Brief.");
assert(Array.isArray(morning.decisions_needed), "Morning Brief decisions_needed should exist.");
assert(Array.isArray(morning.waiting_on), "Morning Brief waiting_on should exist.");
assert(Array.isArray(morning.risks), "Morning Brief risks should exist.");
assert(Array.isArray(morning.do_not_touch), "Morning Brief do_not_touch should exist.");
assert(morning.suggested_first_move, "Morning Brief suggested_first_move should exist.");
assert(Array.isArray(morning.source_evidence), "Morning Brief source evidence should exist.");
assert.equal(morning.live_gates_count, 0, "Morning Brief live gates must remain 0.");

const evening = buildEveningReflectionRecord(ignored.state, { now: "2026-05-27T19:00:00.000Z", date: "2026-05-27" });
assert.equal(evening.key, "evening-reflection-2026-05-27", "Evening Reflection should use stable daily key.");
assert(evening.carry_forward.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Routed Quick Capture items should influence Evening Reflection.");
assert(!evening.carry_forward.some(item => /fake noisy distraction/i.test(item.title + " " + item.detail)), "Ignored captures should not appear in Evening Reflection.");
assert(Array.isArray(evening.what_moved_today), "Evening Reflection what_moved_today should exist.");
assert(Array.isArray(evening.decisions_made), "Evening Reflection decisions_made should exist.");
assert(Array.isArray(evening.state_changes), "Evening Reflection state_changes should exist.");
assert(Array.isArray(evening.blockers_remaining), "Evening Reflection blockers_remaining should exist.");
assert(Array.isArray(evening.resurface_tomorrow), "Evening Reflection resurface_tomorrow should exist.");
assert(Array.isArray(evening.do_not_carry_forward), "Evening Reflection do_not_carry_forward should exist.");
assert(Array.isArray(evening.notes_for_tomorrow), "Evening Reflection notes_for_tomorrow should exist.");
assert(Array.isArray(evening.source_evidence), "Evening Reflection source evidence should exist.");
assert.equal(evening.live_gates_count, 0, "Evening Reflection live gates must remain 0.");

const savedMorning = saveMorningBrief(ignored.state, { now: "2026-05-27T13:10:00.000Z", date: "2026-05-27", actor: "owner_token" });
assert.equal(savedMorning.state.morningBriefs.length, 1, "Saving Morning Brief should create one daily record.");
assert.equal(savedMorning.state.auditHistory[0].action, "morning brief saved", "Saving Morning Brief should create audit entry.");
assert.equal(savedMorning.state.activityEvents[0].eventType, "Morning Brief saved", "Saving Morning Brief should create activity event.");
const savedMorningAgain = saveMorningBrief(savedMorning.state, { now: "2026-05-27T13:20:00.000Z", date: "2026-05-27", actor: "owner_token" });
assert.equal(savedMorningAgain.state.morningBriefs.length, 1, "Morning Brief save should be idempotent by date.");

const savedEvening = saveEveningReflection(savedMorningAgain.state, { now: "2026-05-27T19:10:00.000Z", date: "2026-05-27", actor: "owner_token" });
assert.equal(savedEvening.state.eveningReflections.length, 1, "Saving Evening Reflection should create one daily record.");
assert.equal(savedEvening.state.auditHistory[0].action, "evening reflection saved", "Saving Evening Reflection should create audit entry.");
assert.equal(savedEvening.state.activityEvents[0].eventType, "Evening Reflection saved", "Saving Evening Reflection should create activity event.");
const savedEveningAgain = saveEveningReflection(savedEvening.state, { now: "2026-05-27T19:20:00.000Z", date: "2026-05-27", actor: "owner_token" });
assert.equal(savedEveningAgain.state.eveningReflections.length, 1, "Evening Reflection save should be idempotent by date.");

assert(serverSource.includes("function cockpitDailyRitualsHtml"), "Cockpit Daily Rituals card must render.");
assert(serverSource.includes("Daily Rituals"), "Daily Rituals label must exist.");
assert(serverSource.includes("morningBriefPageHtml"), "#morning-brief route renderer must exist.");
assert(serverSource.includes("eveningReflectionPageHtml"), "#evening-reflection route renderer must exist.");
assert(serverSource.includes("\"morning-brief\""), "#morning-brief route must be registered.");
assert(serverSource.includes("\"evening-reflection\""), "#evening-reflection route must be registered.");
assert(serverSource.includes("/api/morning-brief/today/save"), "Morning Brief save endpoint must exist.");
assert(serverSource.includes("/api/evening-reflection/today/save"), "Evening Reflection save endpoint must exist.");
assert(serverSource.includes("Save Morning Brief"), "Cockpit should expose Save Morning Brief.");
assert(serverSource.includes("Save Evening Reflection"), "Cockpit should expose Save Evening Reflection.");
assert(!/morning-brief[\s\S]{0,2600}(send email|publish page|activate dashboard|enable live)/i.test(serverSource), "Morning Brief must not enable external controls.");
assert(!/evening-reflection[\s\S]{0,2600}(send email|publish page|activate dashboard|enable live)/i.test(serverSource), "Evening Reflection must not enable external controls.");

console.log("daily rituals tests passed");
