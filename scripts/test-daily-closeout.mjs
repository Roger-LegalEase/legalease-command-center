import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDailyCloseoutRecord, saveDailyCloseout } from "./daily-closeout.mjs";
import { createCaptureInboxItem, routeCaptureInboxItem } from "./lee-quick-capture.mjs";
import { buildMorningBriefRecord } from "./morning-brief.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const baseState = {
  runtime: { livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } } },
  captureInbox: [],
  conversationNotes: [],
  dailyCloseouts: [],
  eveningReflections: [{
    key: "evening-reflection-2026-05-27",
    date: "2026-05-27",
    generated_at: "2026-05-27T19:00:00.000Z",
    what_moved_today: [{ title: "RCAP proposal review moved", detail: "Proposal draft got an internal pass.", href: "production-activation-rcap" }],
    decisions_made: [{ title: "Keep partner page unpublished", detail: "Page stays draft until manual review.", href: "production-activation-rcap" }],
    state_changes: [{ title: "Dashboard readiness blocked", detail: "Missing dashboard requirements.", href: "production-activation-rcap" }],
    blockers_remaining: [{ title: "Dashboard requirements", detail: "Still needs confirmation.", href: "production-activation-rcap" }],
    carry_forward: [{ title: "Finish RCAP dashboard readiness", detail: "Resolve missing requirements first.", href: "production-activation-rcap" }],
    resurface_tomorrow: [{ title: "Approval authority", detail: "Confirm who approves RCAP handoff.", href: "production-activation-rcap" }],
    do_not_carry_forward: [{ title: "Live posting", detail: "Leave live gates off.", href: "settings" }],
    notes_for_tomorrow: [{ title: "Start with dashboard requirements", detail: "One clean first move.", href: "production-activation-rcap" }],
    source_evidence: [{ title: "Evening source", detail: "Internal evidence.", href: "reports" }],
    live_gates_count: 0,
    external_actions_confirmation: "No emails sent, no posts published, no partner pages published, no dashboards activated, no external systems contacted."
  }],
  operatingMemory: [{
    key: "operating-memory-2026-05-27",
    date: "2026-05-27",
    generated_at: "2026-05-27T18:00:00.000Z",
    moved_today: [{ title: "RCAP handoff packet updated", detail: "Internal packet was generated.", href: "production-activation-rcap" }],
    decisions_made: [{ title: "Review-only boundary confirmed", detail: "No external systems contacted.", href: "production-activation-rcap" }],
    still_blocked: [{ title: "RCAP primary contact", detail: "Missing external detail.", href: "production-activation-rcap" }],
    carry_forward: [{ title: "Resolve RCAP primary contact", detail: "Needed before handoff.", href: "production-activation-rcap" }],
    resurface_tomorrow: [{ title: "RCAP handoff readiness", detail: "Check readiness after missing details.", href: "production-activation-rcap" }],
    do_not_carry_forward: [{ title: "Partner publishing", detail: "Do not publish.", href: "settings" }],
    risk_notes: [{ title: "Missing partner details", detail: "Blocks handoff.", href: "production-activation-rcap" }],
    live_gates_count: 0,
    external_actions_confirmation: "No emails sent, no posts published, no partner pages published, no dashboards activated, no external systems contacted."
  }],
  tasks: [
    { id: "task-rcap-closeout", title: "Confirm RCAP dashboard requirements", status: "open", priority: "high", nextAction: "Ask Roger to verify the missing dashboard details.", createdAt: "2026-05-27T10:00:00.000Z" }
  ],
  partnerProgramArtifacts: [
    { key: "rcap-proposal-draft-v1", title: "RCAP Proposal Draft", review_state: "approved", review_updated_at: "2026-05-27T09:00:00.000Z" },
    { key: "rcap-partner-page-draft-v1", title: "RCAP Partner Page Draft", review_state: "review_required", review_updated_at: "2026-05-27T09:30:00.000Z" },
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
    { id: "activity-closeout", eventType: "RCAP review state changed", title: "Dashboard Readiness blocked", summary: "Dashboard requirements are not confirmed.", createdAt: "2026-05-27T11:00:00.000Z" }
  ],
  auditHistory: [
    { id: "audit-closeout", action: "rcap artifact review state changed", title: "Dashboard Readiness blocked", timestamp: "2026-05-27T11:05:00.000Z" }
  ]
};

const captured = createCaptureInboxItem(baseState, {
  raw_input: "Carry forward RCAP dashboard readiness. Tomorrow first move is to confirm the dashboard requirements. Drop live publishing.",
  source_label: "Closeout capture",
  linked_workflow: "RCAP",
  linked_partner: "RCAP",
  priority: "high"
}, { now: "2026-05-27T16:00:00.000Z", actor: "owner_token" });
const routedMemory = routeCaptureInboxItem(captured.state, captured.item.id, "route_operating_memory", { now: "2026-05-27T16:05:00.000Z", actor: "owner_token" });
const routedEvening = routeCaptureInboxItem(routedMemory.state, captured.item.id, "route_evening_reflection", { now: "2026-05-27T16:10:00.000Z", actor: "owner_token" });

const ignoredCreated = createCaptureInboxItem(routedEvening.state, {
  raw_input: "Carry forward fake distraction that should be ignored.",
  source_label: "Noise",
  priority: "low"
}, { now: "2026-05-27T16:15:00.000Z", actor: "owner_token" });
const ignored = routeCaptureInboxItem(ignoredCreated.state, ignoredCreated.item.id, "ignore", { now: "2026-05-27T16:20:00.000Z", actor: "owner_token" });

const closeout = buildDailyCloseoutRecord(ignored.state, { now: "2026-05-27T20:00:00.000Z", date: "2026-05-27" });
assert.equal(closeout.key, "daily-closeout-2026-05-27", "Daily Closeout should use stable daily key.");
assert.equal(closeout.date, "2026-05-27", "Daily Closeout should include date.");
assert(Array.isArray(closeout.moved_today), "moved_today should exist.");
assert(Array.isArray(closeout.decisions_made), "decisions_made should exist.");
assert(Array.isArray(closeout.blocked_items), "blocked_items should exist.");
assert(Array.isArray(closeout.carry_forward), "carry_forward should exist.");
assert(Array.isArray(closeout.dropped_items), "dropped_items should exist.");
assert(Array.isArray(closeout.risks), "risks should exist.");
assert(closeout.tomorrow_mission, "Tomorrow mission should exist.");
assert.equal(closeout.tomorrow_top_3.length, 3, "Tomorrow Top 3 should have exactly three actions.");
assert(closeout.tomorrow_first_move, "Tomorrow first move should exist.");
assert(Array.isArray(closeout.tomorrow_waiting_on), "Tomorrow waiting_on should exist.");
assert(Array.isArray(closeout.tomorrow_do_not_touch), "Tomorrow do_not_touch should exist.");
assert(closeout.carry_forward.some(item => /RCAP|dashboard/i.test(item.title + " " + item.detail)), "Routed Quick Capture should influence closeout carry-forward.");
assert(closeout.tomorrow_top_3.some(item => /RCAP|dashboard/i.test(item.title + " " + item.detail)), "Routed Quick Capture should influence tomorrow plan.");
assert(!closeout.carry_forward.some(item => /fake distraction/i.test(item.title + " " + item.detail)), "Ignored captures should not appear in closeout.");
assert(!closeout.tomorrow_top_3.some(item => /fake distraction/i.test(item.title + " " + item.detail)), "Ignored captures should not appear in tomorrow plan.");
assert.equal(closeout.live_gates_count, 0, "Live gates must remain 0.");
assert.equal(closeout.no_external_actions_confirmation, "No emails sent, no posts published, no partner pages published, no dashboards activated, no external systems contacted.", "Closeout must confirm no external actions.");

const saved = saveDailyCloseout(ignored.state, { now: "2026-05-27T20:10:00.000Z", date: "2026-05-27", actor: "owner_token" });
assert.equal(saved.state.dailyCloseouts.length, 1, "Save Closeout should create one daily record.");
assert.equal(saved.state.auditHistory[0].action, "daily closeout saved", "Saving closeout should create audit entry.");
assert.equal(saved.state.activityEvents[0].eventType, "Daily Closeout saved", "Saving closeout should create activity event.");
const savedAgain = saveDailyCloseout(saved.state, { now: "2026-05-27T20:20:00.000Z", date: "2026-05-27", actor: "owner_token" });
assert.equal(savedAgain.state.dailyCloseouts.length, 1, "Save Closeout should be idempotent by date.");

const tomorrowBrief = buildMorningBriefRecord(savedAgain.state, { now: "2026-05-28T08:00:00.000Z", date: "2026-05-28" });
assert(tomorrowBrief.top_3_actions.some(item => /RCAP|dashboard/i.test(item.title + " " + item.detail)), "Tomorrow Plan should feed tomorrow's Morning Brief as prior-day context.");

assert(serverSource.includes("function cockpitDailyCloseoutHtml"), "Cockpit Daily Closeout card must render.");
assert(serverSource.includes("Daily Closeout"), "Daily Closeout label must exist.");
assert(serverSource.includes("dailyCloseoutPageHtml"), "#daily-closeout route renderer must exist.");
assert(serverSource.includes("\"daily-closeout\""), "#daily-closeout route must be registered.");
assert(serverSource.includes("/api/daily-closeout/today/save"), "Daily Closeout save endpoint must exist.");
assert(serverSource.includes("/api/daily-closeout/tomorrow-plan/generate"), "Generate Tomorrow Plan endpoint must exist.");
assert(serverSource.includes("Generate Tomorrow Plan"), "Generate Tomorrow Plan action must render.");
assert(serverSource.includes("Save Closeout"), "Save Closeout action must render.");
assert(!/daily-closeout[\s\S]{0,2600}(send email|publish page|activate dashboard|enable live)/i.test(serverSource), "Daily Closeout must not enable external controls.");

console.log("daily closeout tests passed");
